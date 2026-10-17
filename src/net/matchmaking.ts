// Ghost matchmaking (ROADMAP §3): same rules version, same day, nearest record.
// Pure: no clock, no I/O. The caller owns the seeded rng, so a pick is reproducible.
// 0.7.0a (REQ-BFG-016), two rules on top (the Prime's decisions D1 and D2):
//  - D1, the record rule: a player is never handed a ghost with a better record. A ghost is eligible only
//    with fewer wins than the requester, or as many wins and at most as many lives (noBetterRecord). It
//    holds wherever eligible() runs: the server's match route and any client-side pick (fallbackGhost).
//  - D2, the new-player pool: a player's first NEW_PLAYER_RUNS finished runs (won or lost, counted on the
//    device and sent as `runs`) match only seed ghosts, never another player's upload. The server applies
//    it by matching such a request against its seed pool only (isNewPlayer; server/app.ts).

// RUN-1 (REQ-BFG-059, REQ-BFG-116; D6): GHOSTS PAST DAY 10. Rules and day stay the hard keys and the record the soft key. Under a
// long run's rules (rulesGate.ts longRunFor) a thin day WIDENS to the nearest EARLIER day with an eligible ghost, never a later
// one (a later day has more gold), and with none at all the caller's stand-in is built for the exact day (fallback.ts
// offlineGhost). matchDays is the one order the server (server/app.ts), the client's fallback pick (pickGhost here) and the
// client's pool pick (src/game/ghosts.ts) all follow. Under the 10-day rules a request reads its own day only, as before.

import { hashSeed } from "../core/rng";
// RUN-1 (D6): the widening is the long run's rule (rulesGate.ts longRunFor). T3d (R1.6): taken THROUGH snapshot.ts, which re-exports
// it, and not from ./rulesGate: this file used to import nothing but ../core/rng, so snapshot.ts (the strict decoder) was always the
// first module to import the gate, and a test that mocks ../src/net/rulesGate (tests/ghost-probe.misbehave.test.ts: heroGateProblem
// wrapped over importOriginal) reached the decoder. An import of ./rulesGate here, ahead of snapshot.ts, makes the decoder bind to
// the real gate (rulesGate.ts -> pick.ts -> snapshot.ts is a cycle: the module that loads first gets the mock, the rest the real gate).
import { longRunFor, type PoolEntry } from "./snapshot";

/** D2: a player's first NEW_PLAYER_RUNS runs match only seed ghosts. */
export const NEW_PLAYER_RUNS = 3;

export interface MatchRequest {
  rules: string; // requester's RULES_VERSION
  day: number; // requester's current day (1-10; RUN-1: a long run's rules: 1..maxDayFor(rules), snapshot.ts)
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
 *  and (D1) no better record than its own. (The exact day only; the long run's widening is eligibleWide's.) */
export function eligible(pool: readonly PoolEntry[], req: MatchRequest): PoolEntry[] {
  const seen = new Set(req.seen);
  return pool.filter((e) =>
    e.snapshot.rules === req.rules && e.snapshot.day === req.day &&
    e.snapshot.playerId !== req.playerId && !seen.has(e.id) && noBetterRecord(e.snapshot, req));
}

/**
 * RUN-1 (D6): the days a request reads, in order: its own day first, and under a long run's rules (rulesGate.ts longRunFor)
 * every EARLIER day down to 1, never a later one. The 10-day rules: its own day only (as before). A thin day is one with no
 * eligible ghost: the first day in this list that has one is the day the pick is made on.
 */
export function matchDays(req: Pick<MatchRequest, "rules" | "day">): number[] {
  if (!longRunFor(req.rules)) return [req.day];
  const top = Math.max(1, Math.floor(req.day));
  return Array.from({ length: top }, (_, i) => top - i);
}

/** RUN-1 (D6): does a served ghost of day `ghostDay` fit a request? Its own day; and under a long run's rules any day up to it
 *  (the widening), never a later one. The client's check of a server answer (ghostClient.ts) and the server's tests ask it. */
export function ghostDayOk(ghostDay: number, req: Pick<MatchRequest, "rules" | "day">): boolean {
  return longRunFor(req.rules) ? Number.isInteger(ghostDay) && ghostDay >= 1 && ghostDay <= req.day : ghostDay === req.day;
}

/** RUN-1 (D6): the day a pick over `pool` is made on: the request's own day when it has an eligible ghost (always, under the
 *  10-day rules), else under a long run's rules the nearest earlier day that has one; with none at all, the request's day. */
export function matchDay(pool: readonly PoolEntry[], req: MatchRequest): number {
  const days = matchDays(req);
  if (days.length === 1) return req.day;
  const seen = new Set(req.seen);
  const has = new Set<number>();
  for (const e of pool) {
    const s = e.snapshot;
    if (s.rules === req.rules && s.day <= req.day && s.playerId !== req.playerId && !seen.has(e.id) && noBetterRecord(s, req)) has.add(s.day);
  }
  return days.find((d) => has.has(d)) ?? req.day;
}

/** RUN-1 (D6): eligible ghosts on the day the pick is made on (matchDay): the exact day, or the long run's nearest earlier day
 *  with one. Under the 10-day rules exactly `eligible`. */
export function eligibleWide(pool: readonly PoolEntry[], req: MatchRequest): PoolEntry[] {
  const d = matchDay(pool, req);
  return eligible(pool, d === req.day ? req : { ...req, day: d });
}

/**
 * Pick one ghost: rank eligible ghosts by |wins − req.wins|, then |lives − req.lives|,
 * and choose uniformly among the best rank with rng.int. The best rank is sorted by id
 * first, so the result depends only on the pool's contents, the request and the rng.
 * Returns null when nothing is eligible. RUN-1 (D6): under a long run's rules, a thin day widens to the nearest earlier
 * day with an eligible ghost (eligibleWide); null only when no day up to it has one (the caller's stand-in is then built
 * for the exact day).
 */
export function pickGhost(pool: readonly PoolEntry[], req: MatchRequest, rng: IntRng): PoolEntry | null {
  let best: PoolEntry[] = [];
  let bw = Infinity, bl = Infinity;
  for (const e of eligibleWide(pool, req)) {
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
