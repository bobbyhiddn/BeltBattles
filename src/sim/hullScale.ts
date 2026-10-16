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
// hard stop (BATTLE_CAP) stays, as a backstop. HULL-1c tuned the three constants (0.1% from 25 s, +0.6% every 5 s).
//
// THE SWITCH: HULL_SCALE (false), built as NPC-1 built NPC_DAY (npcDay.ts): hullScaleRules(), setHullScale(on) and
// withHullScale(fn, on = true), which puts the switch back even on a throw. A battle reads it once, where it starts
// (Battle's constructor): the switch on AND a day given means the day's rules (M(d), the wind's share); the switch off, or
// no day, means M = 1 and 0.9.7's flat wind, so every older battle, replay and record plays exactly as before. The
// read-outs (hullShown) follow the switch the same way. AZ-BUMP turns it on with the rules bump.
//
// Shared, pure and dependency-light (no DOM), like npcDay.ts: the client, the server and the tests read the same tables.

/** THE switch (REQ-BFG-079): on, from AZ-BUMP's flip (the hull release). Its setter, withHullScale and the off path stay
 *  this release, for older records and the tests that measure the off world. */
export const HULL_SCALE: boolean = true;

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
 *  x6.8, 7.6, 8.4, 9.2, 10.4, 11.6, 12.8, 14.0 (days 11-18: RUN-1 (REQ-BFG-059), a run is won at 10 wins with no day limit, so
 *  a long run plays them; it was "for later modes: a run is 10 days"). */
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
/** The wind's first share a second, from WIND_START: 0.1% (10 bp). HULL-1c (REQ-BFG-079; BRIEF-HULL1C 2 (c)): was 0.5%
 *  (HULL-1a's start); with D on, 0.5% let the wind decide 48% of day-1 fights (the ceiling is 46%) and 53% on day 2;
 *  a gentle first step and a steeper climb keep HULL-1a's end (a full hull empties at ~67.5 s, was ~67.2 s) and the 5-s
 *  rhythm, and the wind decides 35% on day 1 and at most ~15% on days 3-10 (W/output-hull1c/bench). */
export const WIND_SHARE_START_BP = 10;
/** What the share a second gains every WIND_SHARE_EVERY seconds: +0.6% (60 bp). HULL-1c: was +0.5% (50 bp). */
export const WIND_SHARE_STEP_BP = 60;
/** The wind's step, in seconds (0.9.7's flat wind steps every 5 s too). */
export const WIND_SHARE_EVERY = 5;

/** The wind's share of each hull's max a second, in basis points, `since` seconds after WIND_START (0 before it): 10 bp from
 *  25 s, 70 from 30 s, 130 from 35 s, and so on (HULL-1c's constants; HULL-1a's were 50, 100, 150). */
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

// ------------------------------------------------------------------ HULL-1c: damage growth behind the same switch
// HULL-1c (REQ-BFG-079; BRIEF-HULL1C 2 (e); cap's decision b6be918372b006f3, option A): with M on, par fights must stay
// 18-25 s on days 3-10 through damage growth. The three economy levers alone couldn't (gold is neutral for fight length:
// the par player buys plating with it, which M multiplies; a x2 star step moved no par fight; runes x2 cut day 10 by 5 s
// only), so cap's decision adds THE DAMAGE DAY TERM D(d), and keeps one economy lever, gold (+1 a day to day 10).
// With the switch off nothing here runs (D = 1, 0.9.7's income).

/** HULL-1c (gold): 6 + min(day, 10) + the win's 2 (0.9.7's `6 + min(day, 6) + (won ? 2 : 0)` kept growing to day 10),
 *  with the switch on; days 11+ at day 10's income. Only days 1-9 reach a run's day-10 purse (maxGoldByDay), and day 1's
 *  purse is START_GOLD either way. */
export function incomeOn(day: number, won: boolean): number {
  return 6 + Math.min(Math.max(1, Math.floor(day)), 10) + (won ? 2 : 0);
}

/**
 * HULL-1c: D(d), the damage day term, in whole tenths (days 1-10, the fit), the same for every carrier on the day
 * (players, ghosts, stand-ins, captains, warlords), as M is. Every hit that lands on a hull takes it: projectile impacts
 * (parts, turrets, runes, FRAY, SPALL), limpet blasts and BURN ticks (battle.ts dmgDayScale). Not the wind, not a share of a
 * hull, not heals, regen, SHIELD or PLATE (PLATE soaks the hit after D). cap's rules: D(1) = 1.0; D never falls; D <= M on
 * every day; M / D never falls from day 3 to day 10, so the hull outgrows damage through the run.
 * HULL-1d (BRIEF-HULL1D 2 (c); REVIEW-HULL1C Q1; cap's ruling 8fe12e782aecb50d): D(2) 1.1 -> 1.3, the smallest tenth that
 * holds the day-2 wind share at 27% or less with the day-2 median in 22-30 s (S = M, 96 seeds, every switch on: 1.1 29.6 s
 * and 41.0%, 1.2 27.6 s and 31.8%, 1.3 26.0 s and 22.8%, 1.4 24.6 s and 17.0%); BASTION's day-2 cross win there is 35.2,
 * over this release's 35.0 floor (the ruling). M / D on day 2 is 1.08.
 * PAR-AZ (REQ-BFG-079; cap's ruling bff72995f529f68b): D(5-10) re-fit, 2.2 2.5 2.6 2.8 3.0 3.1 -> 2.0 2.0 2.0 2.0 2.0 2.1
 * (days 1-4 kept; days 11+ follow D(10) / M(10) as before). Why: the par player's NPC day (c52be67: the Medium warlord, its
 * gold and drop every day) made late par decks hit ~40% harder, so par fights fell to 15-17 s on days 6-10. The fit, with
 * the NPC day and PAR-AZ's pass-1 bot tables in (a35a464), in day order: the fewest tenths off each day that put the pooled
 * par median at 19.5 s or more (fightBench, 48 seeds, every switch on through --all-on: kit-parAZ/dfit.sh, i.e.
 *   nice -n 19 node tools/dist/fightbench/fightBench.js --days 5-10 --k 12 --seeds 48 --workers 6 --warlords --wseeds 4
 *     --all-on, on the work tree with this line edited; 2026-10-10 13:45-14:00Z), D's rules held (never falls: day 8's
 * 2.1 comes down to day 9's 2.0; D <= M; M / D never falls on days 3-10: 1.00 1.16 1.40 1.70 2.00 2.30 2.60 2.86).
 * The official check (ruling step 4: 96 seeds, every switch on, ebd4591 with the bots' tables re-measured at this D) held
 * every section-1 target but day 9's wind, 20.9% (ceiling 20%), so day 9 moved one tenth, 2.0 -> 2.1 (rules held: D never
 * falls, 2.0 2.1 2.1 on days 8-10; M / D 2.30 2.48 2.86), and was re-checked once (PAR-AZ REPORT (b)).
 * AZ-BUMP (REQ-BFG-079; REVIEW-PARAZ Q1, REVIEW-REFITAZ Q4; BRIEF-AZBUMP S4a, cap's call): D(8-10) 2.0 2.1 2.1 -> 2.1 2.3
 * 2.4 (days 1-7 kept; days 11-18 follow the new D(10) / M(10) = 2.50: 2.7 3.0 3.4 3.7 4.2 4.6 5.1 5.6, was 2.4 2.7 2.9
 * 3.2 3.6 4.1 4.5 4.9; the step past day 18 0.5, was 0.4). Why: with REFIT-AZ's captains in (a3ae8c3) the fights decided
 * by the wind on days 8-10 read 22.7 24.0 26.1% over the 20% ceiling. The fit, in day order, the fewest tenths up on each
 * day that put its wind share at 20% or less with its median at 18 s or more (kit-azbump/fb.sh: fightBench, 96 seeds,
 * days 1-10, every switch on through --all-on, on the work tree with this line edited; 2026-10-11 01:25-01:46Z):
 * 2.1 2.2 2.3 read 19.9 21.3 20.9%; 2.1 2.3 2.4 read 19.9 18.9 17.7% (medians 21.4 20.8 21.0 s); 2.1 2.3 2.3 read day 10
 * at 20.9%. D's rules hold (never falls; D <= M; M / D on days 3-10: 1.00 1.16 1.40 1.70 2.00 2.19 2.26 2.50). The run at
 * 2.1 2.3 2.4 is the re-check of every target on all days: par medians 19.2-21.4 s on days 3-10, wind 2.1-19.9% on days
 * 3-10 (13.0% on day 2), no hard stop (AZ-BUMP REPORT section 5).
 * HULL-ON run 5 (REQ-BFG-079; BRIEF-HULLON H3 S4a; cap's ruling 7fb66a391c57fbea, RULING-HULLON-R8, and ruling
 * 19139b4c41a1636f, R7): D(7-10)
 * 2.0 2.1 2.3 2.4 -> 2.1 2.3 2.4 2.6 (days 1-6 kept; days 11-18 follow the new D(10) / M(10) = 2.31: 2.9 3.3 3.6 4.0 4.5
 * 5.0 5.5 6.1, was 2.7 3.0 3.4 3.7 4.2 4.6 5.1 5.6; the step past day 18 stays 0.5). Why: with every switch on (the flip
 * 9ffda51 and WARD BELL ★2 at 3 s, ecb43d1) the fights decided by the wind on days 7-10 read 20.5 24.9 23.1 24.3% over the
 * 20% ceiling; GUARD is the cause (GUARD alone off: 16.8 19.2 16.9 15.4%). The fit, the fewest tenths up on each day
 * (kit-hullon/fbx.sh: fightBench, 96 seeds, days 1-10, --all-on, on exports with this line edited; 2026-10-13 01:48-01:54Z):
 * day 8 alone at 2.2 read 20.5 22.6 23.8 25.6%; 2.1 2.2 2.4 2.5 read 16.8 22.3 19.4 22.9%; 2.1 2.3 2.4 2.5 read 16.8 17.2
 * 18.8 21.3%; 2.1 2.3 2.4 2.6 read 16.8 17.2 18.8 17.3% (medians 22.1 21.9 21.2 20.9 s). D's rules hold (never falls;
 * D <= M; M / D on days 3-10: 1.00 1.16 1.40 1.70 1.90 2.00 2.17 2.31).
 * FIT-099 (REQ-BFG-079, REQ-BFG-086; BRIEF-FIT099 F1 S4a; RULING-FIT-R1, oracle aa0369c46ad69acd; R8 7fb66a391c57fbea):
 * with SHAPES on, D(3-5) 1.8 1.9 2.0 -> 1.6 1.7 1.8 (shapes.ts SHAPES_DMG_TENTHS: setShapes writes those three cells into
 * this table while the switch is on and puts this row's own numbers back while it is off; days 1-2 and 6-10,
 * DMG_MUL_TENTHS_LATE and DMG_MUL_STEP_TENTHS don't move). This row stays the SHAPES-off row (HULL-ON's accepted fit, the
 * shapes-off, hull-only and off worlds' pins). Why: shapes make the early fights shorter: at fit-base e866408 (every switch
 * on) the pooled par median read 16.98 16.95 17.18 s on days 3-5 against the 18-25 s target (pooled DPS on day 5 405,
 * 355 with SHAPES off); the SHAPES-off export read HULL-ON's 19.17 18.77 19.33 s number for number. The fit, the fewest
 * tenths off each day (kit-fit/fbx.sh: fightBench, 96 seeds, days 1-10, --all-on, on exports with this line edited;
 * 2026-10-13 09:54-09:57Z): 1.7 1.8 1.9 read 17.50 17.58 17.73 s; 1.7 1.7 1.9 read 17.50 18.30 17.82 s; 1.6 1.7 1.8 read
 * 18.12 18.30 18.60 s (wind 4.1 5.1 5.3%; days 6-10 18.75-19.43 s, wind <= 12.4%; no hard stop). D's rules hold in both
 * rows: SHAPES on 1.0 1.3 1.6 1.7 1.8 2.0 2.1 2.3 2.4 2.6 (never falls; D <= M; M / D on days 3-10: 1.13 1.29 1.56 1.70
 * 1.90 2.00 2.17 2.31); SHAPES off this row (as above). Every reader takes D at call time through dmgMulTenths.
 */
export const DMG_MUL_TENTHS: readonly number[] = [10, 13, 18, 19, 20, 20, 21, 23, 24, 26];

/** HULL-1c: D past day 10 holds day 10's M / D: D(d) = M(d) x D(10) / M(10), in whole tenths (rounded half up), for days
 *  11-18 (DMG_MUL_TENTHS_LATE) and a per-day step from day 19 (DMG_MUL_STEP_TENTHS), as M has. */
export const DMG_MUL_TENTHS_LATE: readonly number[] = DAY_MUL_TENTHS.slice(10).map((m) => Math.floor((m * DMG_MUL_TENTHS[9] * 2 + DAY_MUL_TENTHS[9]) / (2 * DAY_MUL_TENTHS[9])));
/** HULL-1c: each day past day 18 adds this many tenths to D (M's +12 a day x D(10) / M(10), rounded half up). */
export const DMG_MUL_STEP_TENTHS = Math.floor((DAY_MUL_STEP_TENTHS * DMG_MUL_TENTHS[9] * 2 + DAY_MUL_TENTHS[9]) / (2 * DAY_MUL_TENTHS[9]));

/** HULL-1c: D(d) in whole tenths, whatever the switch says (the table): 10 for a day below 1, no day or one that isn't a
 *  finite number; a day that isn't whole counts as its whole part (dayMulTenths' rules). */
export function dmgMulTenths(day: number | undefined): number {
  if (typeof day !== "number" || !Number.isFinite(day) || day < 1) return ONE_TENTHS;
  const d = Math.floor(day), late = [...DMG_MUL_TENTHS, ...DMG_MUL_TENTHS_LATE];
  return d <= late.length ? late[d - 1] : late[late.length - 1] + DMG_MUL_STEP_TENTHS * (d - late.length);
}

/** HULL-1c: D(d) as a number (1, 1.1, 3.9): the table's tenths / 10, for words, tests and benches. */
export const dmgMul = (day: number | undefined): number => dmgMulTenths(day) / 10;

/**
 * HULL-1c: THE one integer-math rule for D on a hit (the client and the server run the same battle): `n` x `tenths` / 10,
 * rounded down, the remainder (in tenths of a point) carried on the struck carrier's own counter (`c.dmgRem`) into its
 * next hit, so rounding never erases D on small hits and the result is deterministic. `tenths` 10 (D = 1) returns `n`
 * untouched and leaves the counter alone.
 */
export function dmgDayScale(n: number, tenths: number, c: { dmgRem?: number }): number {
  if (tenths === ONE_TENTHS || !(n > 0)) return n;
  const t = n * tenths + (c.dmgRem ?? 0);
  const out = Math.floor(t / 10);
  c.dmgRem = t - out * 10;
  return out;
}

// ------------------------------------------------------------------ HULL-1d: sustain growth behind the same switch
// HULL-1d (REQ-BFG-079; BRIEF-HULL1D 2 (b); REVIEW-HULL1C Q5): with M and D on, heal, regen and PLATE amounts kept 0.9.7's
// numbers, so sustain fell to about a third of its share of a par build's power (HULL-1c REPORT 358-378) and strength moved
// from BASTION and FOUNDRY to FURNACE and WEAVER. THE SUSTAIN DAY TERM S(d), built as D is: whole tenths, the same for
// every carrier on the day, read once where a battle starts (Battle's constructor), each amount scaled where it lands with
// D's rounding (rounded down, the remainder carried on the hull's own counter). Where it lands (battle.ts): every heal
// (Battle.heal: RIVETER, MEND PRESS, REGEN of the MENDING LOOMs and GREEN THREAD, TWIN SALVE, SCRAP MEDIC, LEECH VOW) and
// every PLATE gain (Battle.addPlate and the bulwark slugs' plateOnLoad), with the PLATE pool's cap and the two pool units
// (PLATE BREAKER's 10 a payload, SHIELD WALL's 12+) on the same S; ANVIL BREECH reads the pool back in day-1 units (its
// damage takes D at impact). Not SHIELD (it stops whole hits, which D grows), not IRON HIDE's cut (it acts before D), not
// the max HULL grants (M's), not the wind (a share). With the switch off nothing here runs (S = 1).
// THE STEP (cap's Q5 addendum, oracle 52d14c43f15a9e68): the full step, S = M on every day, derived from M here, never
// copied, under its own name so the read-outs use S and a later content pass can still part S from M. Measured (96 seeds,
// every switch on, W/output-hull1d/bench): half (1 + (M - 1) / 2) left BASTION's cross win at 34.0 on day 3 (36+ wanted);
// a 3/4 step 37.2; the full step 37.7 (day 2 39.2), with BASTION's median fight 25.3-25.6 s on days 3, 4, 7 and 9, under
// BASTION's own ceiling of 26.0 s (the ruling; FOUNDRY and the pooled median keep 18-25 s). S = M grows every protective
// amount as the hull grows, so the bots' day-1 rating (deckRating.ts) keeps its order.

/** HULL-1d: S(d) in whole tenths, whatever the switch says: M(d) (dayMulTenths, its rules: 10 for a day below 1 or none). */
export function sustMulTenths(day: number | undefined): number {
  return dayMulTenths(day);
}

/** HULL-1d: S(d) as a number (1, 1.2, 3.5), for words, tests and benches. */
export const sustMul = (day: number | undefined): number => sustMulTenths(day) / 10;

/** HULL-1d: D's rule for a sustain amount (dmgDayScale's integer math, its own counter `c.sustRem`): `n` x `tenths` / 10
 *  rounded down, the remainder carried into the next amount on the same hull (or PLATE pool). `tenths` 10 returns `n`. */
export function sustDayScale(n: number, tenths: number, c: { sustRem?: number }): number {
  if (tenths === ONE_TENTHS || !(n > 0)) return n;
  const t = n * tenths + (c.sustRem ?? 0);
  const out = Math.floor(t / 10);
  c.sustRem = t - out * 10;
  return out;
}

/** HULL-1d: a PLATE pool's unit or cap on the day (PLATE_CAP, PLATE BREAKER's 10, SHIELD WALL's 12+): `n` x `tenths` / 10
 *  rounded down, no remainder (a threshold, not an amount). `tenths` 10 returns `n`. */
export const sustUnit = (n: number, tenths: number): number => (tenths === ONE_TENTHS ? n : Math.floor((n * tenths) / 10));

/** HULL-1d: a sustain amount a read-out shows for day-1 amount `n` on `day` (the switch on and a day: n x S(d), rounded down
 *  as it lands; off, or no day: n). The read-outs' one helper beside dmgShown. */
export const sustShown = (n: number, day: number | undefined): number => (dayScaled(day) ? sustUnit(n, sustMulTenths(day)) : n);

/** HULL-1d: a damage amount a read-out shows for day-1 amount `n` on `day` (the switch on and a day: n x D(d), rounded down as
 *  a hit lands; off, or no day: n). Read-outs only: a battle carries the remainder (dmgDayScale). */
export const dmgShown = (n: number, day: number | undefined): number => (dayScaled(day) ? Math.floor((n * dmgMulTenths(day)) / 10) : n);
