// Ghost matchmaking (ROADMAP §3): same rules version, same day, nearest record.
// Pure: no clock, no I/O. The caller owns the seeded rng, so a pick is reproducible.
// 0.7.0a (REQ-BFG-016), two rules on top (the Prime's decisions D1 and D2):
//  - D1, the record rule: a player is never handed a ghost with a better record. A ghost is eligible only
//    with fewer wins than the requester, or as many wins and at most as many lives (noBetterRecord). It
//    holds wherever eligible() runs: the server's match route and any client-side pick (fallbackGhost).
//  - D2, the new-player pool: a player's first NEW_PLAYER_RUNS finished runs (won or lost, counted on the
//    device and sent as `runs`) match only seed ghosts, never another player's upload. The server applies
//    it by matching such a request against its seed pool only (isNewPlayer; server/app.ts).

import { hashSeed } from "../core/rng";
import type { PoolEntry } from "./snapshot";

/** D2: a player's first NEW_PLAYER_RUNS runs match only seed ghosts. */
export const NEW_PLAYER_RUNS = 3;

export interface MatchRequest {
  rules: string; // requester's RULES_VERSION
  day: number; // requester's current day (1-10)
  wins: number; // requester's wins going into this dusk
  lives: number; // requester's lives going into this dusk
  playerId: string; // never matched against its own ghosts
  seen: readonly string[]; // ghost ids already fought this run (never repeat within a run)
  /** 0.7.0a D2: the requester's finished runs (won or lost) on its device. Absent counts as 0: a new player. */
  runs?: number;
}

export interface IntRng {
  int(n: number): number;
}

/** D1: the ghost's record is no better than the requester's: fewer wins, or as many wins and at most as many lives. */
export function noBetterRecord(ghost: { wins: number; lives: number }, req: { wins: number; lives: number }): boolean {
  return ghost.wins < req.wins || (ghost.wins === req.wins && ghost.lives <= req.lives);
}

/** D2: fewer than NEW_PLAYER_RUNS finished runs, or none stated: this player matches seed ghosts only. */
export function isNewPlayer(req: { runs?: number }): boolean {
  const n = req.runs;
  return !(typeof n === "number" && Number.isInteger(n) && n >= NEW_PLAYER_RUNS);
}

/** Ghosts the requester may fight at all, in pool order: same rules and day, not its own, not seen this run,
 *  and (D1) no better record than its own. */
export function eligible(pool: readonly PoolEntry[], req: MatchRequest): PoolEntry[] {
  const seen = new Set(req.seen);
  return pool.filter((e) =>
    e.snapshot.rules === req.rules && e.snapshot.day === req.day &&
    e.snapshot.playerId !== req.playerId && !seen.has(e.id) && noBetterRecord(e.snapshot, req));
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
