// `node ghost-server.mjs seed`: write the bundled sample pool (tools/samplePool.ts: FURNACE and WEAVER drawn
// from the stand-in pool, FOUNDRY and BASTION from the par player's field, 0.8.0 RC) into the configured store as
// the stand-in pool of the current RULES_VERSION.
// It runs as the Fly release_command on every deploy, so it is idempotent and fails loudly:
//   - every entry is checked first (strict decode, current rules, validateUpload in the player mode,
//     a record a run can reach, no duplicates); one failure fails the run before anything is written;
//   - then the store's pool for RULES_VERSION is made to match the bundle exactly: missing or
//     differing entries written, entries not in the bundle deleted, player uploads untouched;
//   - any error is an exception, which main.ts turns into exit code 1 (the deploy aborts).
// 0.7.0a D5 (REQ-BFG-016): a seed ghost must pass validateUpload in the player (honest) mode, the check
// POST /v1/ghosts runs on a player's upload, and carry a record label a run reaches under 0.6.2's run
// rules (src/net/records.ts). tools/samplePool.ts's generator applies the shop's strict rules too.
// S8 T1b (REQ-BFG-092; REVIEW-R3 ruling 4, BRIEF-S8 T1b): the bundle is a FILE now, server/seedPoolData.ts, which gen:ghosts
// writes (tools/genGhostPool.ts: generateSamplePool()'s snapshots, with PICK on each with the seed step's grade). The seed
// command loads it, checks it (checkPool, below) and stores it with NO battles: nothing is generated, played or graded at
// boot (until S8 it ran generateSamplePool() here, which played the par and casual runs and, with PICK on, graded every
// ghost: 5,760 battles). Grades are written by the server (this command), never uploaded: POST /v1/ghosts refuses a
// snapshot that carries one (server/app.ts), so a graded ghost in the store is a seed ghost, in the rules' pool.

import { RULES_VERSION } from "../src/sim/content";
import { isReachable } from "../src/net/records";
import { checkSnapshot, ghostId, type PoolEntry } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { SEED_POOL, SEED_POOL_RULES } from "./seedPoolData"; // S8 T1b: the bundled pool file (was tools/samplePool.ts generateSamplePool)
import type { GhostStore, SeedCounts } from "./store";

export class SeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedError";
  }
}

export interface SeedResult extends SeedCounts {
  rules: string;
  entries: number; // pool ghosts in the bundle
}

/** Check every entry of a pool; throws SeedError naming each failure. */
export function checkPool(snapshots: readonly unknown[], rules = RULES_VERSION): PoolEntry[] {
  const errors: string[] = [];
  const byId = new Map<string, PoolEntry>();
  snapshots.forEach((raw, i) => {
    const o = (typeof raw === "object" && raw !== null ? raw : {}) as { hero?: unknown; day?: unknown };
    const label = `entry ${i} (${String(o.hero)} day ${String(o.day)})`;
    try {
      const snapshot = checkSnapshot(raw);
      if (snapshot.rules !== rules) throw new Error(`rules ${snapshot.rules} is not ${rules}`);
      // D5: the player (honest) mode, as an upload is checked; it also runs the rules gate on the snapshot's rules
      // LC-1 (REQ-BFG-073): a pool ghost that carries a LAST CHANCE (none today: the generator writes none) is checked with
      // it, as an upload is (server/app.ts): its rune's place, its card, its record. Z-BUMP S4 (REVIEW-ZPREP F1's reader
      // check): the record model reads the pool ghost's own rules (records.ts `rules`), so a pool checked under an older
      // `rules` argument keeps that version's model; today every pool is this build's rules (the exact check above), unchanged
      // AZ-BUMP (REQ-BFG-078, REQ-BFG-077; REVIEW-PARAZ N3, BRIEF-AZBUMP S3): with NPC_DAY on a seed ghost carries its run's
      // road log (tools/samplePool.ts), and the player mode counts a deck's drops only through it (validate.ts
      // roadDropValue), so it goes in as ctx.road, as an upload's does (server/app.ts); a snapshot without one: as before
      // S8 T1d (REQ-BFG-092, REQ-BFG-078; RULING-S8-R1 item 2): and its run seed, when it carries one, as T1a's loader
      // (src/net/fallback.ts) and seedGhost (tools/samplePool.ts) pass it. With the seed the player mode re-derives the road
      // log's warlords and seeded drops, each dawn's rune offer and LAST CHANCE's offer (validate.ts roadProblem, runeProblem,
      // lastChanceProblem); without it only their seed-blind lines run. Each key only when the snapshot carries it
      const lc = snapshot.lastChance;
      const v = validateUpload(snapshot.build, snapshot.day, snapshot.rules, { ...(snapshot.seed !== undefined ? { seed: snapshot.seed } : {}), ...(lc ? { lastChance: lc } : {}), ...(snapshot.road ? { road: snapshot.road } : {}) });
      if (!v.ok) throw new Error(`validateUpload: ${v.errors.join("; ")}`);
      // RUN-1 (R1.2, T3c): and its `losses` when it states them (a long run's seed ghost; v3, taken under those rules only), as POST does
      if (!isReachable(snapshot.day, snapshot.wins, snapshot.lives, { rules: snapshot.rules, ...(lc ? { lastChance: lc.day } : {}), ...(snapshot.losses !== undefined ? { losses: snapshot.losses } : {}) })) {
        throw new Error(`record ${snapshot.wins}W ${snapshot.lives} lives: no run carries it into dusk ${snapshot.day}`);
      }
      const id = ghostId(snapshot);
      if (byId.has(id)) throw new Error(`duplicate of ghost ${id}`);
      byId.set(id, { id, snapshot });
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  if (errors.length) {
    throw new SeedError(`${errors.length} of ${snapshots.length} pool entries failed their checks; nothing was written:\n  ${errors.join("\n  ")}`);
  }
  if (!byId.size) throw new SeedError("the pool is empty; nothing was written");
  return [...byId.values()];
}

/** S8 T1b: the bundled pool file's text, `[` + one canonical snapshot a line + `]` (samplePoolJson's form, byte for byte). */
export function bundledSeedPoolJson(): string {
  return "[\n" + SEED_POOL.join(",\n") + "\n]\n";
}

/**
 * S8 T1b (REQ-BFG-092; REVIEW-R3 ruling 4): the bundled pool file's snapshots (server/seedPoolData.ts), parsed, no battles.
 * A file dealt under other rules than this build's fails loudly here (re-run gen:ghosts), before any entry is checked.
 */
export function bundledSeedPool(): unknown[] {
  if (SEED_POOL_RULES !== RULES_VERSION) {
    throw new SeedError(`the bundled seed pool (server/seedPoolData.ts) was dealt under ${SEED_POOL_RULES}, not ${RULES_VERSION}: run gen:ghosts and commit it; nothing was written`);
  }
  return SEED_POOL.map((line) => JSON.parse(line) as unknown);
}

/** Seed `store` with `snapshots` (default: the bundled pool file, S8 T1b: loaded and checked, no battles) for `rules`. */
export async function seedStore(store: GhostStore, snapshots: readonly unknown[] = bundledSeedPool(), rules = RULES_VERSION): Promise<SeedResult> {
  const entries = checkPool(snapshots, rules);
  const counts = await store.replacePool(rules, entries);
  return { rules, entries: entries.length, ...counts };
}
