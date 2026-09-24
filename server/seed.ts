// `node ghost-server.mjs seed`: write the bundled sample pool (tools/samplePool.ts, drawn from
// the stand-in pool) into the configured store as the stand-in pool of the current RULES_VERSION.
// It runs as the Fly release_command on every deploy, so it is idempotent and fails loudly:
//   - every entry is checked first (strict decode, current rules, validateBuild, no duplicates);
//     one failure fails the run before anything is written;
//   - then the store's pool for RULES_VERSION is made to match the bundle exactly: missing or
//     differing entries written, entries not in the bundle deleted, player uploads untouched;
//   - any error is an exception, which main.ts turns into exit code 1 (the deploy aborts).

import { RULES_VERSION } from "../src/sim/content";
import { checkSnapshot, ghostId, type PoolEntry } from "../src/net/snapshot";
import { validateBuild } from "../src/net/validate";
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
      const v = validateBuild(snapshot.build, snapshot.day);
      if (!v.ok) throw new Error(`validateBuild: ${v.errors.join("; ")}`);
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
