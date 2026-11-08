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
// S8 run 3 (REQ-BFG-092; RULING-S8-R8, cause "PICK_RULE re-tuned on the regenerated pool"): THE NUMBERS NOW are R8's V4,
// { losing 1, deep 0.5, deepAt 2 }: a record 1 loss behind meets the whole field; 2 or more behind meets the weakest
// ceil(0.5 x n) of its n eligible ghosts (1 of 1-2, 2 of 3-4, 3 of 5-6). On the regenerated seed pool (S8's c6d3445) the
// numbers above read c5 >=3W 38% (B/output-s8/bench/bands-r7.md: retune1 --set allon --also open, 96 seeds a hero); R8's
// rule chose V4 among four variants at 48 seeds (bands-r8v-V3..V6) and it was confirmed at 96 seeds a hero
// (B/output-s8/bench/bands-r8.md): c5 3.18 wins, 0W 3%, >=3W 74% (in its 60-80% band; no wins count over 40%); par 5.10.
//
// THE GRADE: a seed ghost's vsPar (its win rate against the four par fields' first GRADE_K members of its day, GRADE_SEEDS
// seeds from both sides), written into its snapshot by the seed step (tools/samplePool.ts) only with PICK on, as an
// integer permille (snapshot.ts GRADE_FIELD; ghostId leaves it out, so a ghost keeps its id). Uploads carry no grade (the
// server refuses one): an ungraded ghost counts as its bucket's median grade (the bots' deck rating correlates only 0.73
// with vsPar, under the 0.8 bar: output-retune1/REPORT.md).
//
// The switch: PICK (false), pickRules(), setPick(on), withPick(fn, on = true) (src/sim/npcDay.ts's form). P3 (new players
// and weak uploads) is a design only (output-retune1/t5-design.md; cap's answer 3): not built.
//
// BUMP-1H (REQ-BFG-124, battle rules bb-0.15.0): THE LEAD PICK. R1's mirror (PickRule.lead, coded here and never used until now) is
// turned on by rules: a request under LEAD_RULES or later (rulesGate.ts leadFor) with CURVE on (src/net/curve.ts) whose record is
// lead.at or more wins ahead of its losses draws from the strongest lead.share of its eligible ghosts by grade (matchPick below),
// then pickGhost's nearest-record rank runs inside them, as `deep` does at the other end. D1 (never a better record) is eligible()'s
// and unchanged; an endless request picks by nearest endless wins as before; a bb-0.14.0 request, or CURVE off, picks exactly as at
// bb-0.14.0 (tests/curve.pick.test.ts). The strong ghosts it finds are the seed pool's streak tier (tools/samplePool.ts).

import { eligibleWide, matchDay, pickGhost, type IntRng, type MatchRequest } from "./matchmaking"; // RUN-1 (D6): the long run's widening is matchmaking's
import { GRADE_MAX, type PoolEntry } from "./snapshot";
import { leadFor, pickFor } from "./rulesGate"; // BUMP-1H (REQ-BFG-124): + leadFor, the lead pick's gate (the CURVE switch AND rules at or after LEAD_RULES)

/** THE switch (REQ-BFG-092): on, from HULL-ON's flip (bb-0.10.0). Its setter, withPick and the off path stay this
 *  release, for older records (rulesGate.ts pickFor) and the tests that measure the off world. */
export const PICK: boolean = true;

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
   *  Absent: off (RUN-1 tunes it on REQ-BFG-059's real days 11+).
   *  BUMP-1H (REQ-BFG-124, THE CURVE): matchPick honours it only for a request under rulesGate.ts LEAD_RULES (bb-0.15.0) or later with
   *  the CURVE switch on (leadFor); pickShare itself reads whatever rule it is given (the bench passes a lead by `--rule`). PICK_RULE
   *  gets its `lead` in P3's take (src/net/pick.ts below). */
  lead?: { share: number; at: number };
}

/** The tuned numbers: RULING-S8-R8's V4, re-tuned on the regenerated pool (B/output-s8/bench/bands-r8.md). Was
 *  { losing: 1, deep: 0.667, deepAt: 3 } (output-retune1/bench c5E-allon; RETUNE-1's REPORT section 4). */
export const PICK_RULE: Readonly<PickRule> = { losing: 1, deep: 0.5, deepAt: 2 };
// BUMP-1H run 2, P3's TAKE (RULING-BUMP1H-R1 R1.4 (2), R1.5 "PICK_RULE.lead: none if J's shape wins"): PICK_RULE has NO `lead` in bb-0.15.0. The lead pick (the code above, gated by LEAD_RULES and CURVE) stays
// coded and unused, as it was at bb-0.14.0: on the K 48 reads the lead cost c5 1.7 points for every point it took off par (v0L against V0: c5 24.5 -> 19.3, par 87.5 -> 84.4), the streak
// tier's slots alone 1 for 1 (k1n against V0: c5 24.5 -> 21.9, par 87.5 -> 84.9). The streak ghosts meet the runs of their own record through the nearest-record pick (days 6-12).

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

/** BUMP-1H: `rule` without its `lead` (the bb-0.14.0 rule: matchPick uses it when the lead does not hold for the request). */
const withoutLead = (rule: Readonly<PickRule>): PickRule => ({ losing: rule.losing, deep: rule.deep, deepAt: rule.deepAt });

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
 * RUN-1 (D6): under a long run's rules the eligible ghosts and the bucket are those of the day the pick is made on (a thin
 * day widens to the nearest earlier day with one: matchmaking.ts matchDay); the 10-day rules: the request's own day, as before.
 */
export function matchPick(pool: readonly PoolEntry[], req: MatchRequest, rng: IntRng, rule: Readonly<PickRule> = PICK_RULE): PoolEntry | null {
  if (req.endless || !pickFor(req.rules)) return pickGhost(pool, req, rng); // ENDLESS-1: an endless request is nearest endless wins; the grade is a run's (no endless ghost carries one)
  // BUMP-1H (REQ-BFG-124): the lead (R1's mirror) applies only to a request under LEAD_RULES or later with CURVE on (rulesGate.ts leadFor);
  // otherwise the rule's `lead` is left out, so the pick is exactly the bb-0.14.0 one (a bb-0.14.0 request, or CURVE off, at any rules label)
  const { share, strong } = pickShare(req, rule.lead && !leadFor(req.rules) ? withoutLead(rule) : rule);
  if (share >= 1) return pickGhost(pool, req, rng);
  const ok = eligibleWide(pool, req);
  if (!ok.length) return null;
  const day = matchDay(pool, req);
  const median = medianGrade(pool.filter((e) => e.snapshot.rules === req.rules && e.snapshot.day === day));
  const g = (e: PoolEntry) => gradeOf(e, median);
  const ranked = ok.slice().sort((a, b) => (strong ? g(b) - g(a) : g(a) - g(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return pickGhost(ranked.slice(0, Math.max(1, Math.ceil(share * ranked.length))), req, rng);
}
