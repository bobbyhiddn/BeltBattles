// Ghost matchmaking (ROADMAP §3): same rules version, same day, nearest record.
// Pure: no clock, no I/O. The caller owns the seeded rng, so a pick is reproducible.

import { hashSeed } from "../core/rng";
import type { PoolEntry } from "./snapshot";

export interface MatchRequest {
  rules: string; // requester's RULES_VERSION
  day: number; // requester's current day (1-10)
  wins: number; // requester's wins going into this dusk
  lives: number; // requester's lives going into this dusk
  playerId: string; // never matched against its own ghosts
  seen: readonly string[]; // ghost ids already fought this run (never repeat within a run)
}

export interface IntRng {
  int(n: number): number;
}

/** Ghosts the requester may fight at all, in pool order. */
export function eligible(pool: readonly PoolEntry[], req: MatchRequest): PoolEntry[] {
  const seen = new Set(req.seen);
  return pool.filter((e) =>
    e.snapshot.rules === req.rules && e.snapshot.day === req.day &&
    e.snapshot.playerId !== req.playerId && !seen.has(e.id));
}

/**
 * Pick one ghost: rank eligible ghosts by |wins − req.wins|, then |lives − req.lives|,
 * and choose uniformly among the best rank with rng.int. The best rank is sorted by id
 * first, so the result depends only on the pool's contents, the request and the rng.
 * Returns null when nothing is eligible.
 */
export function pickGhost(pool: readonly PoolEntry[], req: MatchRequest, rng: IntRng): PoolEntry | null {
  let best: PoolEntry[] = [];
  let bw = Infinity, bl = Infinity;
  for (const e of eligible(pool, req)) {
    const dw = Math.abs(e.snapshot.wins - req.wins);
    const dl = Math.abs(e.snapshot.lives - req.lives);
    if (dw < bw || (dw === bw && dl < bl)) {
      best = [e];
      bw = dw;
      bl = dl;
    } else if (dw === bw && dl === bl) {
      best.push(e);
    }
  }
  if (!best.length) return null;
  best.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return best[rng.int(best.length)];
}

/** Stable seed for a request; the server mixes in a coarse time bucket for variety. */
export function matchSeed(req: MatchRequest, salt: number | string = 0): number {
  return hashSeed("match", req.rules, req.day, req.wins, req.lives, req.playerId, [...req.seen].sort().join(","), salt);
}
