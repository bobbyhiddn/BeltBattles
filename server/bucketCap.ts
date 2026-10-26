// S3 (REQ-BFG-120; BRIEF-S3 goal 1; LAUNCH-0 REPORT 1.4 item 3): THE GHOST CACHE HAS A SIZE.
//
// Both stores keep the ghosts of every cached (rules, day) bucket as parsed objects (about 2.2 KB each at day 10, 3.9 KB at day 25), and nothing
// ever dropped one. Now:
//   - a bucket keeps at most `bucketCap` PLAYER ghosts in memory (default 2,000, BB_GHOST_BUCKET_CAP): the newest by upload time. Seed-pool
//     ghosts do not count against it and are never dropped (a bucket always has its stand-ins).
//   - the cache as a whole keeps at most `cacheMax` player ghosts (BB_GHOST_CACHE_MAX, default DEFAULT_CACHE_MAX): past it the least recently
//     used bucket loses its oldest ghosts first.
//   - nothing is deleted from storage. A ghost that leaves memory is still an object in Tigris (or a line in ghosts.jsonl); it just is not
//     matched until a restart or a re-list brings it back, which it does only if it is still among the bucket's newest.
// A bucket holds two kinds of player ghost (a run's dusk, and an ENDLESS dusk after a won run: snapshot.mode === "endless"), and a match reads
// exactly one of them (src/net/matchmaking.ts eligible: an endless request reads only endless ghosts, a run's never one). When a bucket is over
// its cap the ghost that leaves is the oldest of whichever kind holds MORE: so neither kind can push the other below half the cap (overflowKeys).

/** Player ghosts one (rules, day) bucket keeps in memory. */
export const DEFAULT_BUCKET_CAP = 2_000;

/**
 * Player ghosts the whole cache keeps, sized for the 256 MB Fly machine under S2's NODE_OPTIONS=--max-old-space-size=96. The WORST case is every
 * ghost a deep one: measured, a day-25 snapshot is 3.9 KB of heap as parsed objects and about 0.2 KB more in the store's maps (a day-10 one 2.2 KB),
 * so 12,000 ghosts are at most 50 MB. With the process's own 12-17 MB (code, the 192 seed ghosts, the limiter maps) that is 62-67 MB of the 96 MB
 * old space (about 65-70%), which leaves V8 its room to collect and the request path its working set; at the day mix of LAUNCH-0 (2.6-2.9 KB a ghost)
 * it is 35 MB. For the 512 MB machine with --max-old-space-size=300 (S5): 40,000 (at most 168 MB, 62% of 300).
 */
export const DEFAULT_CACHE_MAX = 12_000;

/** What /v1/health reports about the cache (the `cache` block). */
export interface CacheStats {
  /** (rules, day) buckets held (listed or not). */
  buckets: number;
  /** Player ghosts held in memory across all buckets (seed ghosts are not counted). */
  playerGhosts: number;
  /** The cap per bucket and the ceiling over all of them, as configured. */
  bucketCap: number;
  ceiling: number;
  /** Player ghosts dropped from memory since boot: past a bucket's cap, and past the ceiling. */
  evictedByCap: number;
  evictedByCeiling: number;
}

/** One player ghost of a bucket, as the cap sees it. */
export interface CapItem {
  key: string;
  /** Upload time, ms: the object's LastModified, or the server's own clock for a ghost stored by this process. Older = smaller. */
  at: number;
  /** An ENDLESS dusk's ghost (snapshot.mode === "endless"); false: a run's. */
  endless: boolean;
}

const older = (a: CapItem, b: CapItem): number => a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * The keys to drop so that `items` (all the player ghosts of one bucket) fit in `cap`: one at a time, the oldest ghost of the kind (run or
 * endless) that currently holds more of them; at equal counts, the older of the two oldest. Returns [] when they already fit. A kind never
 * loses a ghost while it holds fewer than the other kind, so neither can be crowded out below min(what it has, cap / 2).
 */
export function overflowKeys(items: readonly CapItem[], cap: number): string[] {
  let over = items.length - Math.max(0, cap);
  if (over <= 0) return [];
  const runs = items.filter((i) => !i.endless).sort(older);
  const ends = items.filter((i) => i.endless).sort(older);
  let r = 0, e = 0;
  const out: string[] = [];
  while (over-- > 0) {
    const nr = runs.length - r, ne = ends.length - e;
    const takeRun = nr > ne || (nr === ne && nr > 0 && (ne === 0 || older(runs[r], ends[e]) <= 0));
    out.push(takeRun ? runs[r++].key : ends[e++].key);
  }
  return out;
}

/** The `n` oldest of `items` (the ceiling's victims inside one bucket: the least recently used bucket loses its oldest ghosts first). */
export function oldestKeys(items: readonly CapItem[], n: number): string[] {
  return [...items].sort(older).slice(0, Math.max(0, n)).map((i) => i.key);
}
