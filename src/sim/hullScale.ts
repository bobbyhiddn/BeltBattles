// HULL-1a (REQ-BFG-079): HULL THAT SCALES HARD WITH THE DAY, behind one switch.
//
// THE DAY MULTIPLIER M(d) starts from Backpack Battles' curve (x6 by day 10, x14 by day 18; PLAN-AZ "Design calls: Hull"),
// kept in whole tenths (DAY_MUL_TENTHS) so no float drifts. A day below 1, or no day, is M = 1.
//
// MAX HULL on day d = M(d) x (hero base + build.hullBonus), rounded to the nearest whole 10, halves up (hullAt), for every
// carrier on that day: players, ghosts, stand-ins, captains and warlords. Both sides of one fight are on the same day, so
// both get the same M. build.hullBonus stays a day-1 number (plating, the ARMOR PACK, HULL runes, the road's PLATING and
// RIDE THROUGH, LAST CHANCE's HULL card): M applies where a battle starts (battle.ts Battle's `day`), so each keeps its
// worth relative to the hull, and the upload check's reachable-hull search (roadCap.ts, validate.ts) doesn't change. The
// battle-time max HULL runes (BULKHEADS per turret, SCRAP HALO per merged piece) take M per unit too (hullAt on each
// unit's amount, then x the count), so every term of a max hull is a whole 10 and a read-out's per-unit number times the
// count is what the battle adds. Heal, repair, SHIELD and PLATE amounts don't scale (item power: the economy grows them).
//
// THE DARK WIND becomes a share (windShareBp): from WIND_START (25 s) each hull loses a share of ITS OWN max hull every
// second, WIND_SHARE_START_BP at first and WIND_SHARE_STEP_BP more every WIND_SHARE_EVERY s, straight to hp as today (PLATE
// and SHIELD don't absorb it). Both hulls lose the same share, so the amounts differ when the max hulls differ. The 120-s
// hard stop (BATTLE_CAP) stays, as a backstop. HULL-1b tunes the three constants.
//
// THE SWITCH: HULL_SCALE (false), built as NPC-1 built NPC_DAY (npcDay.ts): hullScaleRules(), setHullScale(on) and
// withHullScale(fn, on = true), which puts the switch back even on a throw. A battle reads it once, where it starts
// (Battle's constructor): the switch on AND a day given means the day's rules (M(d), the wind's share); the switch off, or
// no day, means M = 1 and 0.9.7's flat wind, so every older battle, replay and record plays exactly as before. The
// read-outs (hullShown) follow the switch the same way. AZ-BUMP turns it on with the rules bump.
//
// Shared, pure and dependency-light (no DOM), like npcDay.ts: the client, the server and the tests read the same tables.

/** THE switch (REQ-BFG-079), off in this rules version (bb-0.9.7). */
export const HULL_SCALE: boolean = false;

let hsOn = false;

/** Is the day's hull in the game now (HULL_SCALE, or a withHullScale call)? */
export function hullScaleRules(): boolean {
  return hsOn;
}

/** Turn the day's hull on or off (no content to swap: every rule reads the switch where it acts). */
export function setHullScale(on: boolean): void {
  hsOn = on;
}

/** Run `fn` with the day's hull on (or off), then put the switch back as it was, even if `fn` throws (withNpcDay's form). */
export function withHullScale<T>(fn: () => T, on = true): T {
  const was = hsOn;
  setHullScale(on);
  try {
    return fn();
  } finally {
    setHullScale(was);
  }
}

setHullScale(HULL_SCALE);

// ------------------------------------------------------------------ M(d), in whole tenths

/** M(d) for days 1-18, in whole tenths: x1.0, 1.4, 1.8, 2.2, 2.8, 3.4, 4.0, 4.6, 5.2, 6.0 (days 1-10, the run), then
 *  x6.8, 7.6, 8.4, 9.2, 10.4, 11.6, 12.8, 14.0 (days 11-18, for later modes: a run is 10 days, snapshot.ts MAX_DAY). */
export const DAY_MUL_TENTHS: readonly number[] = [10, 14, 18, 22, 28, 34, 40, 46, 52, 60, 68, 76, 84, 92, 104, 116, 128, 140];
/** Each day past the table (19+) adds this many tenths: +1.2 a day. */
export const DAY_MUL_STEP_TENTHS = 12;
/** M = 1, in tenths: a day below 1, no day, or the switch off. */
export const ONE_TENTHS = 10;

/** M(d) in whole tenths, whatever the switch says (the table): 10 for a day below 1, a missing day or one that isn't a
 *  finite number; a day that isn't whole counts as its whole part. */
export function dayMulTenths(day: number | undefined): number {
  if (typeof day !== "number" || !Number.isFinite(day) || day < 1) return ONE_TENTHS;
  const d = Math.floor(day), n = DAY_MUL_TENTHS.length;
  return d <= n ? DAY_MUL_TENTHS[d - 1] : DAY_MUL_TENTHS[n - 1] + DAY_MUL_STEP_TENTHS * (d - n);
}

/** M(d) as a number (1, 1.4, 6, 14): the table's tenths / 10, for words and tests (the rules use the tenths). */
export const dayMul = (day: number | undefined): number => dayMulTenths(day) / 10;

/** `n` x `tenths` / 10, rounded to the nearest whole 10, halves up, in integer arithmetic for whole `n` (the max hull rule:
 *  (tenths x n) / 100, rounded half up, x 10). */
export function scaleTenths(n: number, tenths: number): number {
  return Math.floor((tenths * n + 50) / 100) * 10;
}

/** Does a battle (or a read-out) on `day` play the day's rules: the switch on and a day given? */
export function dayScaled(day: number | undefined): boolean {
  return hsOn && typeof day === "number" && Number.isFinite(day);
}

/**
 * THE day's max hull for a day-1 amount `n` (hero base + hullBonus, or one unit of a battle-time max HULL rune): with the
 * switch on and a day, M(d) x n rounded to the nearest whole 10 (halves up); otherwise `n` itself, untouched (M = 1, no
 * rounding: 0.9.7's number).
 */
export function hullAt(n: number, day: number | undefined): number {
  return dayScaled(day) ? scaleTenths(n, dayMulTenths(day)) : n;
}

/** A hull read-out's number: `n` (day-1 units) on `day`, as hullAt (the switch off: n). Every hull number the screens draw
 *  goes through here (runbar, the hero card, NEXT BATTLE, the foe reveal, the ARMOR PACK card and toast, HULL rune text,
 *  LAST CHANCE's HULL card). */
export const hullShown = (n: number, day: number | undefined): number => hullAt(n, day);

// ------------------------------------------------------------------ the dark wind as a share

/** 1 basis point = 0.01% of a hull's max. */
export const BP = 10000;
/** The wind's first share a second, from WIND_START: 0.5% (50 bp). */
export const WIND_SHARE_START_BP = 50;
/** What the share a second gains every WIND_SHARE_EVERY seconds: +0.5% (50 bp). */
export const WIND_SHARE_STEP_BP = 50;
/** The wind's step, in seconds (0.9.7's flat wind steps every 5 s too). */
export const WIND_SHARE_EVERY = 5;

/** The wind's share of each hull's max a second, in basis points, `since` seconds after WIND_START (0 before it): 50 bp from
 *  25 s, 100 from 30 s, 150 from 35 s, and so on. */
export function windShareBp(since: number): number {
  if (!(since >= 0)) return 0;
  return WIND_SHARE_START_BP + WIND_SHARE_STEP_BP * Math.floor(since / WIND_SHARE_EVERY);
}

/** What `bpTicks` (the share a second in basis points, summed over the ticks blown, `ticksPerSec` ticks a second) takes off
 *  a hull of max `max`: bpTicks x max / (BP x ticksPerSec), rounded half up once, in integer arithmetic. */
export function windShareDamage(bpTicks: number, max: number, ticksPerSec: number): number {
  const den = BP * ticksPerSec;
  return Math.floor((2 * bpTicks * Math.max(0, max) + den) / (2 * den));
}
