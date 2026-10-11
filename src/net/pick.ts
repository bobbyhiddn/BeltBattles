// RETUNE-1 T5 (REQ-BFG-092): PICK, the graded pick (LOSS-1's R1), behind one switch that is off in this rules version.
// The operator can't win; a losing record should meet weaker ghosts. With PICK on, for a match request whose rules pass
// rulesGate.ts pickFor (the switch AND rules at or after PICK_RULES): a record DEEP losses behind its wins draws only from
// the weakest share of the ghosts it may fight (matchmaking.ts eligible: D1, never a better record; D2 stays the server's
// bucket choice), ranked by the seed step's grade (vsPar, in permille); then today's nearest-record pick (pickGhost) inside
// that share. A record at or above even, or the switch off, or older rules: pickGhost exactly, so every pick is as today.
// One function (matchPick) for the server's match route (server/app.ts) and the client's fallback pick (fallback.ts), so
// the two can't drift; the bench (tools/retune1.ts) calls it too.
//
// THE NUMBERS (PICK_RULE) were tuned on the casual bench (BRIEF-RETUNE1 section 9; output-retune1/bench c5E-allon: c5,
// everything on, 48 seeds a hero): a record 1-2 losses behind meets the whole field (losing 1); 3 or more behind
// (deepAt 3) meets the weakest ceil(0.667 x n) of its n eligible ghosts (all of 1-3, 3 of 4, 4 of 5, 5 of 6). The share
// is the measured 0.667, not 2/3: the cut is a whole count, and 2/3 would keep 2 of 3 (the bench's 0.6 read, which
// overshot the 3-win band). R1's mirror for winning records (cap's answer 1, RUN-1's to tune): PickRule.lead, a number
// pair; absent means off.
//
// THE GRADE: a seed ghost's vsPar (its win rate against the four par fields' first GRADE_K members of its day, GRADE_SEEDS
// seeds from both sides), written into its snapshot by the seed step (tools/samplePool.ts) only with PICK on, as an
// integer permille (snapshot.ts GRADE_FIELD; ghostId leaves it out, so a ghost keeps its id). Uploads carry no grade (the
// server refuses one): an ungraded ghost counts as its bucket's median grade (the bots' deck rating correlates only 0.73
// with vsPar, under the 0.8 bar: output-retune1/REPORT.md).
//
// The switch: PICK (false), pickRules(), setPick(on), withPick(fn, on = true) (src/sim/npcDay.ts's form). P3 (new players
// and weak uploads) is a design only (output-retune1/t5-design.md; cap's answer 3): not built.

import { eligible, pickGhost, type IntRng, type MatchRequest } from "./matchmaking";
import { GRADE_MAX, type PoolEntry } from "./snapshot";
import { pickFor } from "./rulesGate";

/** THE switch (REQ-BFG-092), off in this rules version. */
export const PICK: boolean = false;

let pkOn = false;

/** Is the graded pick in the game now (PICK, or a withPick call)? */
export function pickRules(): boolean {
  return pkOn;
}

/** Turn the graded pick on or off (tests and tools). */
export function setPick(on: boolean): void {
  pkOn = on;
}

/** Run `fn` with the graded pick on (or off), then put the switch back as it was, even if `fn` throws. */
export function withPick<T>(fn: () => T, on = true): T {
  const was = pkOn;
  setPick(on);
  try {
    return fn();
  } finally {
    setPick(was);
  }
}

setPick(PICK);

/** R1's rule: the share of the eligible ghosts (weakest first) a record draws from, by how far it is behind. */
export interface PickRule {
  /** The share for a record 1 to deepAt - 1 losses behind its wins (1: the whole field, as today). */
  losing: number;
  /** The share for a record deepAt or more losses behind its wins. */
  deep: number;
  deepAt: number;
  /** R1's mirror (cap's answer 1): a record `at` or more wins ahead of its losses draws from the strongest `share`.
   *  Absent: off (RUN-1 tunes it on REQ-BFG-059's real days 11+). */
  lead?: { share: number; at: number };
}

/** The tuned numbers (output-retune1/bench c5E-allon; REPORT section 4). */
export const PICK_RULE: Readonly<PickRule> = { losing: 1, deep: 0.667, deepAt: 3 };

/** The seed step's grade: the par fields' first GRADE_K members a hero, GRADE_SEEDS seeds from both sides (cap's answer 5:
 *  the bench was read with K 6 x 1 seed, so the pick ships as measured). */
export const GRADE_K = 6;
export const GRADE_SEEDS = 1;

/** Losses on a dusk record: dusks fought (day - 1) minus wins (draws, rare, count as losses; casual.ts lossesOf). */
export const lossesOf = (req: Pick<MatchRequest, "day" | "wins">): number => Math.max(0, req.day - 1 - req.wins);

/** The share of the eligible ghosts a record draws from, and from which end (`strong`: the strongest first, the mirror).
 *  1: the whole field (pickGhost exactly). */
export function pickShare(req: Pick<MatchRequest, "day" | "wins">, rule: Readonly<PickRule> = PICK_RULE): { share: number; strong: boolean } {
  const behind = lossesOf(req) - req.wins;
  if (behind >= rule.deepAt) return { share: rule.deep, strong: false };
  if (behind > 0) return { share: rule.losing, strong: false };
  if (rule.lead && -behind >= rule.lead.at) return { share: rule.lead.share, strong: true };
  return { share: 1, strong: false };
}

/** The median grade of the graded ghosts in `entries` (GRADE_MAX / 2 when none is graded). */
export function medianGrade(entries: readonly PoolEntry[]): number {
  const gs = entries.map((e) => e.snapshot.grade).filter((g): g is number => typeof g === "number").sort((a, b) => a - b);
  if (!gs.length) return GRADE_MAX / 2;
  const m = gs.length >> 1;
  return gs.length % 2 ? gs[m] : (gs[m - 1] + gs[m]) / 2;
}

/** A ghost's grade: its snapshot's, or `median` (an ungraded upload counts as its bucket's median grade). */
export const gradeOf = (e: PoolEntry, median: number): number => e.snapshot.grade ?? median;

/**
 * The pick (server and client): with pickFor(req.rules) and a record behind (pickShare below 1), the eligible ghosts
 * ranked by grade (weakest first; the mirror: strongest first; ties by id), cut to the first ceil(share x n), then
 * pickGhost's nearest-record rank inside them. Otherwise pickGhost exactly. The median for an ungraded ghost is its
 * bucket's (the pool's ghosts of the request's rules and day). Returns null when nothing is eligible.
 */
export function matchPick(pool: readonly PoolEntry[], req: MatchRequest, rng: IntRng, rule: Readonly<PickRule> = PICK_RULE): PoolEntry | null {
  if (!pickFor(req.rules)) return pickGhost(pool, req, rng);
  const { share, strong } = pickShare(req, rule);
  if (share >= 1) return pickGhost(pool, req, rng);
  const ok = eligible(pool, req);
  if (!ok.length) return null;
  const median = medianGrade(pool.filter((e) => e.snapshot.rules === req.rules && e.snapshot.day === req.day));
  const g = (e: PoolEntry) => gradeOf(e, median);
  const ranked = ok.slice().sort((a, b) => (strong ? g(b) - g(a) : g(a) - g(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return pickGhost(ranked.slice(0, Math.max(1, Math.ceil(share * ranked.length))), req, rng);
}
