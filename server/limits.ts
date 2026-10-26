// S3 (REQ-BFG-120; BRIEF-S3): every abuse and memory setting of the ghost server in one record, with its default. config.ts readLimitsConfig reads
// them from the environment (BB_GHOST_*); main.ts hands them to the store (the two cache settings) and to createGhostServer (the rest).
// What each one is for, and why its default, is in docs/ASYNC.md ("S3") and in the S3 report; the worst honest case against each is there too.

import { DEFAULT_BUCKET_CAP, DEFAULT_CACHE_MAX } from "./bucketCap";

export interface Limits {
  /** BB_GHOST_BUCKET_CAP: player ghosts one (rules, day) bucket keeps in memory (the newest; seed ghosts never count). */
  bucketCap: number;
  /** BB_GHOST_CACHE_MAX: player ghosts the whole cache keeps in memory; past it the least recently used bucket loses its oldest first. */
  cacheMax: number;
  /** BB_GHOST_NEW_KEYS_PER_IP_DAY: keys the server has not seen that one client address (an IPv4 address or an IPv6 /64) may bring in 24 hours. */
  newKeysPerIpDay: number;
  /** BB_GHOST_CHECK_KEY_MS / _KEY_REFILL: the check time one key may use: a full balance in ms, and the ms it earns back per second. */
  checkKeyMs: number;
  checkKeyRefill: number;
  /** BB_GHOST_CHECK_IP_MS / _IP_REFILL: the same for one client address (a /64 for IPv6). */
  checkIpMs: number;
  checkIpRefill: number;
  /** BB_GHOST_CHECK_IP_INFLIGHT: deck checks one client address may have waiting or running at once. */
  checkIpInflight: number;
  /** BB_GHOST_CHECK_KEY_INFLIGHT: deck checks one key may have waiting or running at once (1: an honest key uploads one dusk at a time). */
  checkKeyInflight: number;
}

export const DEFAULT_LIMITS: Limits = {
  bucketCap: DEFAULT_BUCKET_CAP,
  cacheMax: DEFAULT_CACHE_MAX,
  newKeysPerIpDay: 500, // a carrier NAT or a school on a launch day: hundreds of new installs behind one address; the check budget, not this, bounds the CPU an address can use
  checkKeyMs: 60_000, // an honest run costs 0.2-9 s of check time (S3 report); 60 s is 6x the cold worst on this host, and the address's balance bounds a key farm
  checkKeyRefill: 50,
  checkIpMs: 60_000,
  checkIpRefill: 100,
  checkIpInflight: 4,
  checkKeyInflight: 1,
};

/** The 429 reasons /v1/health counts (limits block), since boot. `rate` is the old per-IP request limiter. */
export type Reason429 = "rate" | "keyInflight" | "ipInflight" | "keyBudget" | "ipBudget" | "newKeys";
export type Counts429 = Record<Reason429, number>;
export const zeroCounts = (): Counts429 => ({ rate: 0, keyInflight: 0, ipInflight: 0, keyBudget: 0, ipBudget: 0, newKeys: 0 });
