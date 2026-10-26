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
 * ghost a deep one. Measured on the built bundle (S3 report, bench): a day-25 ghost is 4.2 KB of heap in the store's maps (a day-10 one 2.3 KB), 4.7-4.9 KB
 * counted at the server level after a collection, and loading a bucket makes about 30 MB of garbage on top that the old space has to absorb. Loading all
 * 25 days of 3,000 stored ghosts in turn gave, by ceiling: 12,000 -> heapUsed 81 MB of the 96 (84%), peak RSS 208 MB; 10,000 -> 212 MB; 8,000 -> 71 MB
 * (74%), 197 MB; 6,000 -> 64 MB (67%), 193 MB. The S2 server (no cap) died of heap exhaustion on the 12th bucket. 6,000 keeps the live heap at 2/3 of the old
 * space and the RSS peak at 193 MB of the ~215 MB the machine has, and a bucket still holds hundreds of ghosts to pick from. For the 512 MB machine with
 * --max-old-space-size=300 (S5): 30,000 (40,000 was measured too: heap 215 MB of 300, peak RSS 334 MB).
 */
export const DEFAULT_CACHE_MAX = 6_000;

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
