// BUMP-1I (REQ-BFG-125, battle rules bb-0.16.0; REQ-BFG-124's par line): VETERAN, in a player's words: win two runs in a row and your
// ghosts get tougher; lose a run, or abandon one, and they go back.
//
// WHAT IT IS. The device counts the runs it won in a row (src/game/online.ts STREAK_KEY: a won run adds 1, a lost or abandoned run sets
// 0) and sends the count with the match request (`streak`, absent = 0, as `runs` is). A request is a VETERAN's when its streak is
// VETERAN_AT or more, its rules are VETERAN_RULES or later, and the VETERAN switch is on (veteranFor). A veteran's request takes the
// LEAD PICK (pick.ts matchPick with VETERAN_RULE: PICK_RULE plus a lead): a record `at` or more wins ahead of its losses draws from the
// strongest `share` of its eligible ghosts by grade, then the nearest-record pick runs inside them. Every other request picks as it does
// at bb-0.15.0, unless the take has the SHIELD (VETERAN_SHIELD): then a request that is not a veteran's never draws a tier ghost (the
// streak tier's seed ghosts, player id `sample-<hero>-3`: tools/samplePool.ts STREAK_VARIANT) while another eligible ghost exists.
// Endless requests, the new-player pool (D2: the server chooses the bucket before the pick) and D1 (never a better record: eligible())
// are untouched. A forged streak only changes the ghosts of that device's own run: the server trusts it as it trusts `runs`.
//
// WHY HERE. This module is OUTSIDE the three generators' import closure (kit-1i closure-gens-base.txt: 105 files): no file on that list
// imports it, and V1 changes no line of any file on that list, so the stand-in pool's regeneration stays a re-stamp of its rules
// literals (BRIEF-BUMP1I P1, the CLOSURE RULE). It reads pick.ts, fallback.ts, matchmaking.ts and rulesGate.ts and changes none.
//
// THE SWITCH: VETERAN (on since P2's flip), in curve.ts's and effectFloor.ts's form: veteranRules(), setVeteran(on) and
// withVeteran(fn, on = true), which puts the switch back even on a throw. While it is off every request picks exactly as at bb-0.15.0
// (tests/veteran.pick.test.ts); a request under rules before VETERAN_RULES picks as before even with the switch on.
//
// THE NUMBERS are P3's take (BRIEF-BUMP1I): VETERAN_RULE's lead { share 0.5, at 2 } and VETERAN_SHIELD on, with the tier grown to days 5-16 at
// STREAK_TARGET 525 (tools/samplePool.ts): read E525, confirmed at K 96. Each constant below names its read.

import { Rng } from "../core/rng";
import { offlineGhost, type FallbackRequest } from "./fallback";
import type { IntRng, MatchRequest } from "./matchmaking";
import { matchPick, PICK_RULE, type PickRule } from "./pick";
import { rulesAtLeast } from "./rulesGate";
import type { PoolEntry } from "./snapshot";

/** THE switch (REQ-BFG-125): ON since BUMP-1I P2 (battle rules bb-0.16.0). It was false at P1, where the switch-off proof was read (fp, parBench, the stand-in bundle, the seed
 *  pool and a bench spot byte for byte); this line is the flip, and RULES_VERSION's bump (src/sim/content.ts) is the next commit. The switch does nothing under rules before
 *  VETERAN_RULES, so the flip alone changes no request that the game sends. */
export const VETERAN: boolean = true;

let veteranOn = false;

/** Is VETERAN in the game now (VETERAN, or a withVeteran call)? */
export function veteranRules(): boolean {
  return veteranOn;
}

/** Turn VETERAN on or off (tests and tools). Setting the state it already has does nothing. */
export function setVeteran(on: boolean): void {
  veteranOn = on;
}

/** Run `fn` with VETERAN on (or off), then put the switch back as it was, even if `fn` throws (withCurve's form). Synchronous work only. */
export function withVeteran<T>(fn: () => T, on = true): T {
  const was = veteranOn;
  setVeteran(on);
  try {
    return fn();
  } finally {
    setVeteran(was);
  }
}

setVeteran(VETERAN);

/** The first rules version with VETERAN. Written as a literal, as LEAD_RULES is, so it stays put at later bumps: a request under older
 *  rules (bb-0.15.0 among them) picks as before, whatever the switch and whatever streak it states. */
export const VETERAN_RULES: string = "bb-0.16.0";

/** The streak (runs won in a row) that makes a request a veteran's. */
export const VETERAN_AT = 2;

/** The largest streak a device counts and the server reads (an integer in 0..VETERAN_STREAK_MAX; the server answers 400 past it). */
export const VETERAN_STREAK_MAX = 99;

/** The veteran's pick rule: PICK_RULE plus a lead. BUMP-1I P3's TAKE (read E525; K 48 and K 96 on the bench, output-bump1i/bench/p3-table-run1.md and p3-table-take-k96.md): { share 0.5, at 2 }: a veteran whose record is
 *  2 or more wins ahead of its losses draws from the strongest half of its eligible ghosts by grade. The lead's two readings on the same pool (A { 0.5, 2 } and B { 0.34, 0 }, C and D on the grown tier) came out
 *  equal on par's chance to reach 10 wins (A, B 153 of 192; C, D 150 of 192); what moves it is the tier's strength (VETERAN_TIER_VARIANT's ghosts, tools/samplePool.ts STREAK_TARGET). */
export const VETERAN_RULE: Readonly<PickRule> = { ...PICK_RULE, lead: { share: 0.5, at: 2 } };

/** THE shield: a request that is not a veteran's never draws a tier ghost while another eligible ghost exists. BUMP-1I P3's TAKE (read E525): ON. With it c5 never meets the tier, off the road its chance to reach
 *  10 wins reads 24.0% at K 48 (27.9% at K 96) against 19.3% (24.7%) without it on the same seeds, and the tier can run days 5-16. */
export const VETERAN_SHIELD = true;

/** The streak tier's seed ghosts carry the player id `sample-<hero>-<VETERAN_TIER_VARIANT>` (tools/samplePool.ts seedGhost, STREAK_VARIANT 3;
 *  the server's upload check can't store a player's ghost under such an id: a player id is a 43-character digest, server/app.ts, identity.ts).
 *  The grade can't mark them: slot-1 ghosts of other days grade as high. */
export const VETERAN_TIER_VARIANT = 3;

/** Is this pool entry one of the streak tier's seed ghosts? Its snapshot's player id is `sample-<its hero>-3`. */
export function isTierGhost(entry: PoolEntry): boolean {
  return entry.snapshot.playerId === `sample-${entry.snapshot.hero}-${VETERAN_TIER_VARIANT}`;
}

/** A match request with the device's streak: `streak` absent counts as 0. (Typed here and in ghostClient.ts, outside the generators' closure.) */
export type VeteranRequest = MatchRequest & { streak?: number };

/** The pick's options: the bench passes the screen's lead, the shield and the base rule without a source edit. */
export interface VeteranOpts {
  /** The veteran's rule (default VETERAN_RULE). */
  rule?: Readonly<PickRule>;
  /** The rule of every request that is not a veteran's, and of a request VETERAN does not touch (default PICK_RULE). */
  base?: Readonly<PickRule>;
  /** The shield (default VETERAN_SHIELD). */
  shield?: boolean;
}

/** Is this request a veteran's? Not an endless one, the switch on, its rules VETERAN_RULES or later, and a streak of VETERAN_AT or more. */
export function veteranFor(req: VeteranRequest): boolean {
  return veteranOn && !req.endless && rulesAtLeast(req.rules, VETERAN_RULES) && typeof req.streak === "number" && req.streak >= VETERAN_AT;
}

/**
 * The pick for the match route and the client's offline fallback (matchPick's place, pick.ts):
 *  1. an endless request, the switch off, or rules before VETERAN_RULES: matchPick(pool, req, rng) and nothing else;
 *  2. a veteran's request: matchPick with the veteran's rule, on the whole pool;
 *  3. any other request: matchPick as at bb-0.15.0; with the shield on, matchPick on the pool without its tier ghosts and only if that
 *     answers null, on the whole pool. A null answer leaves the rng untouched (pickGhost and matchPick return null before they draw).
 */
export function veteranPick(pool: readonly PoolEntry[], req: VeteranRequest, rng: IntRng, opts: VeteranOpts = {}): PoolEntry | null {
  const base = opts.base ?? PICK_RULE;
  if (req.endless || !veteranOn || !rulesAtLeast(req.rules, VETERAN_RULES)) return matchPick(pool, req, rng, base);
  if (veteranFor(req)) return matchPick(pool, req, rng, opts.rule ?? VETERAN_RULE);
  if (!(opts.shield ?? VETERAN_SHIELD)) return matchPick(pool, req, rng, base);
  return matchPick(pool.filter((e) => !isTierGhost(e)), req, rng, base) ?? matchPick(pool, req, rng, base);
}

/** fallback.ts fallbackGhost's two lines, with veteranPick in matchPick's place: the best offline opponent for a request that may carry a streak. */
export function veteranFallback(req: FallbackRequest & { streak?: number }, pool: readonly PoolEntry[] = [], opts: VeteranOpts = {}): PoolEntry {
  const hit = veteranPick(pool, req, new Rng(req.seed), opts);
  return hit ?? offlineGhost(req.hero, req.day, req.seed, { wins: req.wins, lives: req.lives });
}
