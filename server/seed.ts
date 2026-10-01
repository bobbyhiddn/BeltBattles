// `node ghost-server.mjs seed`: write the bundled sample pool (tools/samplePool.ts, drawn from
// the stand-in pool) into the configured store as the stand-in pool of the current RULES_VERSION.
// It runs as the Fly release_command on every deploy, so it is idempotent and fails loudly:
//   - every entry is checked first (strict decode, current rules, validateUpload in the player mode,
//     a record a run can reach, no duplicates); one failure fails the run before anything is written;
//   - then the store's pool for RULES_VERSION is made to match the bundle exactly: missing or
//     differing entries written, entries not in the bundle deleted, player uploads untouched;
//   - any error is an exception, which main.ts turns into exit code 1 (the deploy aborts).
// 0.7.0a D5 (REQ-BFG-016): a seed ghost must pass validateUpload in the player (honest) mode, the check
// POST /v1/ghosts runs on a player's upload, and carry a record label a run reaches under 0.6.2's run
// rules (src/net/records.ts). tools/samplePool.ts's generator applies the shop's strict rules too.

import { RULES_VERSION } from "../src/sim/content";
import { isReachable } from "../src/net/records";
import { checkSnapshot, ghostId, type PoolEntry } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { generateSamplePool } from "../tools/samplePool";
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
      const v = validateUpload(snapshot.build, snapshot.day, snapshot.rules);
      if (!v.ok) throw new Error(`validateUpload: ${v.errors.join("; ")}`);
      if (!isReachable(snapshot.day, snapshot.wins, snapshot.lives)) {
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

/** Seed `store` with `snapshots` (default: the bundled sample pool) for `rules`. */
export async function seedStore(store: GhostStore, snapshots: readonly unknown[] = generateSamplePool(), rules = RULES_VERSION): Promise<SeedResult> {
  const entries = checkPool(snapshots, rules);
  const counts = await store.replacePool(rules, entries);
  return { rules, entries: entries.length, ...counts };
}
