import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AMMO, BURN_TIME, COMMISSION_BASE, COMMISSION_STEP, DISRUPT_TIME, FRAY_BONUS, FRAY_MAX, GEAR_SLOTS, HEROES, ITEMS, WINDOW_TIME,
  type ItemDef,
} from "../src/sim/content";
import { textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import { KEYWORD_COLOUR, NUMBER_COLOUR, colourize, lineText, lineWidth, wrapRich, type Span } from "../src/ui/richText";
import { CARD_EFFECT_LINES, cardEffectLines, cardEffectWidth, TOOLTIP_TEXT_W, tooltipLines } from "../src/screens/build/shop";
import { wideCardW } from "../src/screens/build/layout";
import { effectAt, fusible, outputsAt, perkAt } from "../src/sim/stars";
import { scaleCore } from "../src/sim/cores";
import {
  SIM, abilityText, cardText, gist, hasAbilityText, mergesWithText, nextStarHeadline, nextStarText,
} from "../src/ui/abilityText";
import * as glossaryModule from "../src/ui/abilityText"; // U2e step 1: no copy count exported
// NUM-4 (REQ-BFG-047): fasterNum and rateNum are this file's own now (below: faster()'s whole %; was textRules')
import { MODULES, STARS, SUPPLIES, banned, kOf, numbers, pct, r1, r2, starsOf } from "./textRules";
// 0.8.0 P1: wave 3's rows (the block at the end)
import { WAVE3_IDS, buyableModules, withWave3 } from "../src/sim/content";
import { BURN_DPS } from "../src/sim/content"; // NUM-1: a Burn stack's damage a second
import { DORMANT_ITEMS } from "../src/sim/races/data"; // FLIP-X2: SIFTER dormant keeps its NUMBERS row
import { SHIELD_CAP } from "../src/sim/content"; // FLIP-X2: WARD BELL's row (UP TO 3)
import { PLATE_CAP } from "../src/sim/races/bastion";
import { SYNC_WINDOW } from "../src/sim/races/foundry";
import { LOAD_FLOOR } from "../src/sim/battle";
import { S, clashShortText, gatlingClashText } from "../src/ui/abilityText";
import { S_STARTS } from "../src/ui/abilityText"; // Y7b2 (the flip): S.online's sentence (Y3: START's words)
import { rateMul } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): the whole rate %; NUM-4: SPEED quoted as it is (no secPer)
import { roundHalfUp } from "../src/sim/pct"; // NUM-2: MIMIC's speed rounds half up once (battle.ts factoryDef)
// Y7b2 (the flip): `pct as simPct` (NUM-4: GRAPNEL's salvage as the sim rounds it) left with that salvage, its one reader
import { PEAK_SHIFT } from "../src/sim/races/data"; // NUM-4: METRONOME's peak shift, a hidden timer no sentence quotes
import { withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): bb-0.9.7's sentences beside the shipped ones
import { withGuard } from "../src/sim/guard"; // HULL-ON (the flip, GUARD): PLATE ROLLER's base sentence beside the shipped one

// 0.6.2t (REQ-BFG-032): the ability text of every buyable module (0.8.0: 31 rigs, 15 factories, 15 cores, 12 mods) at 1, 2
// and 3 stars, and of each supply: its numbers are that star's real values, it opens with one plain sentence, it uses
// none of T2's shorthand, every entry is a whole sentence, it wraps to the desk column and the phone band, and the next
// star, merge progress, MERGES WITH and shop one-liners read as sentences. The panels, the phone fit (T6, 0b.5), the
// slag and METRONOME readouts (0b.4) and the other carry-overs are in tests/abilityPanels.test.ts.

const SRC = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("the glossary's engine numbers (SIM) are the sim's", () => {
  it("each is quoted from its source; the test fails if one moves", () => {
    const battle = SRC("src/sim/battle.ts"), harass = SRC("src/sim/harassment.ts"), cores = SRC("src/sim/cores.ts");
    // Y7b2 (the flip): POISON's hull pool, tick and SIM.poisonMax / poisonTime / poisonTick left the sim and SIM, so their
    // four quotes are deleted (switch-off only; were `Math.min(${SIM.poisonMax}, def.hull.poison.stacks +
    // pr.payload.poison)`, `def.hull.poison.t = ${SIM.poisonTime};`, `damage = po.stacks * ${SIM.poisonTick};` and
    // `damage = roundHalfUp(po.stacks * ${SIM.poisonTick} * po.acc);`)
    for (const gone of ["poisonMax", "poisonTime", "poisonTick", "scrapQueue"]) expect(SIM, gone).not.toHaveProperty(gone);
    expect(battle).not.toMatch(/hull\.poison/);
    // NUM-3 (R1's STUN fold): SABOT's 5 / 4 / 3 s stalls and bare-hull +60, DRAG CHAIN's factory +0.8 s and turret +0.5 s
    // delays, SNAG's x0.8 and CHILL's x0.75 left the sim and SIM (sabotBelt, sabotFactory, sabotTurret, sabotHull,
    // chainFactory, chainTurret, snag, chill). Their checks become: a sabot, frost or chain round STUNs for its own data's
    // round.seconds (what the faces' {STUN} stat and the sentences read), and no CHILL or SNAG mark is left
    expect(battle).toContain(`this.disrupt(s, t, round.seconds, "sabot")`);
    expect(battle).toContain(`this.disrupt(s, t, round.seconds, "freeze")`);
    expect(battle).toContain(`this.disrupt(s, t, round.seconds, "drag")`);
    expect(battle).not.toMatch(/"sabot" && hit\.kind === "hull" \?/);
    expect(harass).not.toMatch(/chill\?|snag\?|debuffs\.chill|debuffs\.snag/);
    expect(battle).toContain(`this.disrupt(s, target, ${SIM.shrapnel}, "sabot")`);
    expect(harass).toContain(`damage - (debuffs.sap ? ${SIM.sap} : 0)`); // NUM-3: SAP, the one mark left
    for (const gone of ["sabotBelt", "sabotFactory", "sabotTurret", "sabotHull", "chainFactory", "chainTurret", "snag", "chill"]) expect(SIM, gone).not.toHaveProperty(gone);
    // Y7b2 (the flip): SCRAPPER's 3-waiting cap (SIM.scrapQueue) left the sim and SIM (checked gone above; was
    // expect(battle).toContain(`Math.min(${SIM.scrapQueue}, f.triggerQueue + gained)`))
    expect(battle).toContain(`if (count >= ${SIM.lanceMax}) break;`);
    expect(cores).toContain(`tu.loadTimer >= ${SIM.salvoWait} * tu.windowTime`);
    // and the constants the sim exports, as the texts quote them
    expect([BURN_TIME, WINDOW_TIME, COMMISSION_BASE, COMMISSION_STEP, FRAY_BONUS, FRAY_MAX, AMMO.slag.fixedSpeed]).toEqual([3, 1.5, 1.2, 0.6, 2, 15, 0.75]); // NUM-1: FRAY_BONUS x10 (was 0.2)
  });
});

const g = (e: ItemDef) => e.gate!;
const f = (e: ItemDef) => e.factory!;
const m = (e: ItemDef) => e.mod!;
const base = (e: ItemDef) => f(e).base ?? AMMO[f(e).ammo].base;
/** NUM-4 (REQ-BFG-047): a speed or rate multiplier above 1 as faster() quotes it now: a whole % ("130% FASTER": 130), or
 *  an exact whole ratio in TIMES ("TWICE AS FAST": 2, "3 TIMES AS FAST": 3), never a float ratio (was textRules'
 *  fasterNum, r1(r) from 2 up: GREASE ★2 "2.3 TIMES AS FAST", GATLING ★3 "3.4 TIMES AS FAST"). */
const fasterNum = (r: number): number => {
  const n = Math.round(r);
  return n >= 2 && Math.abs(r - n) < 1e-9 ? n : Math.round((r - 1) * 100);
};
/** A fire interval multiplier as the rate the texts quote: x0.75 fires 33% faster (textRules' rateNum, through NUM-4's
 *  fasterNum above). */
const rateNum = (intervalMul: number): number => fasterNum(1 / intervalMul);
/** A rate or speed below 1 as the texts quote it: "40% SLOWER", "17% SLOWER" (40, 17); at or above 1 as fasterNum. */
const speedNum = (r: number): number => (r >= 1 ? fasterNum(r) : Math.round((1 - r) * 100));
const round = <T>(e: ItemDef) => f(e).round as unknown as T;
const BURN = [BURN_DPS, BURN_TIME]; // EACH BURN DEALS THE ENEMY HULL 10 DAMAGE A SECOND FOR 3 SECONDS. (NUM-1: was 1)
/** NUM-4 (REQ-BFG-047): a factory's stamp cadence as the texts quote it: its SPEED, slugs per 30 s, "AT RATE 21" (was
 *  sec(e), the interval 30 / speed at two decimals, "EVERY 1.43 SECONDS"; NUM-2's). */
const spd = (e: ItemDef): number => f(e).speed;
/** NUM-2: a stored whole rate % as the interval share the texts' rateText reads (1 / rateMul(X)); rateNum(imul(X)) is the
 *  "X% FASTER" a sentence quotes, speedNum(1 / imul(X)) the "X% SLOWER" (was the stored interval multiplier itself). */
const imul = (rate: number | undefined): number => 1 / rateMul(rate);
/** AZ-BUMP (the flip, LADDER_FIX): OVERDRIVE ★2/★3's ride-keep, the star-ladder pass's fixed def's rideKeep (0.5 / 1; 0 at
 *  ★1, and with the switch off, where no def holds one). */
const rideKeep = (e: ItemDef): number => (g(e) as { rideKeep?: number }).rideKeep ?? 0;

/**
 * The audit: the numbers a module's ability text quotes at a star, every sentence in reading order (digits, and ONE to
 * FIVE and TWICE as words), read from that star's spec (effectAt; a core's absolute numbers x k, as scaleCore), the
 * sim's constants, or SIM (checked above). Written out here from the catalogue, never with abilityText.ts.
 */
const NUMBERS: Record<string, (e: ItemDef, k: number, s: number) => number[]> = {
  // rigs
  temper: (e) => [g(e).burn!, ...BURN],
  whetstone: (e) => [g(e).flat!],
  // SHAPES-1 flip: the three shaped plain rigs (src/sim/shapes.ts SHAPES_ITEMS) are buyable with SHAPES on; their
  // sentences are WHETSTONE's and TEMPER's (abilityText.ts ENTRIES), so their rows are too: NAIL STRIP 12/25/40 and SPIKE
  // RAIL 10/20/35 DAMAGE (gate.flat), EMBER TROUGH 1/2/3 BURN (gate.burn) and S.burn's numbers
  nailstrip: (e) => [g(e).flat!],
  embertrough: (e) => [g(e).burn!, ...BURN],
  spikerail: (e) => [g(e).flat!],
  grease: (e) => [fasterNum(g(e).speed!), g(e).lockedFlat!],
  // Y7b2 (the flip): ★2/★3 slow the belt TO 40% / 30% SPEED with no flat (★1 HALF SPEED, in words); was [...(g(e).flat ?
  // [g(e).flat] : []), g(e).lockedFlat!], HALF SPEED at every star
  brake: (e) => [...(g(e).speed === 0.5 ? [] : [pct(g(e).speed!)]), g(e).lockedFlat!],
  longhaul: (e) => [g(e).perPriorGate!, ...(g(e).priorCap !== undefined ? [g(e).priorCap] : [])],
  coil: (e) => {
    const j = g(e).jump ?? 0, t = g(e).shockTime ?? DISRUPT_TIME;
    return j ? [1 + j, t, j] : [t]; // STALLS 2 MACHINES FOR 1.8 SECONDS. ... THEN THE NEAREST OTHER ONE.
  },
  splitter: (e) => [g(e).split!.copies, pct(g(e).split!.mult)],
  // AZ-BUMP (the flip, LADDER_FIX): ★2/★3's ride-keep sentence ("A PAYLOAD KEEPS 50% / 100% OF THE RIDE THAT SPEED CUTS, FOR
  // ITS RIDE BONUSES (HEAT, LONG RIDES).") quotes the keep, after the speed and before the locked sentence (was [speed,
  // ...flat, lockedFlat], which off and at ★1 it still is)
  // MERGE-099C (TSC-369's ratchet: c099's tests type-check no worse than release-099's 162): `g(e).flat!`, guarded already
  // (a call doesn't narrow), so the row's three TS2322s go (two were 0.9.8's, one the ride-keep's); the numbers are the same
  overdrive: (e) => [fasterNum(g(e).speed!), ...(g(e).flat ? [g(e).flat!] : []), ...(rideKeep(e) ? [pct(rideKeep(e))] : []), g(e).lockedFlat!],
  tollbooth: (e) => [g(e).toll!],
  // NUM-3 (R1's STUN fold): S.marks names SAP, the one mark left, and its cut (SIM.sap; was CHILL's 25% and SNAG's 20%)
  sifter: (e) => (g(e).sift === "all" ? [g(e).siftFlat!, ...(g(e).siftClean ? [g(e).siftClean] : []), SIM.sap] : [1, SIM.sap]),
  // Y7b2 (the flip): the damage pulse only, EVERY n SECONDS ... GAINS m DAMAGE (its speed pulse and lockedFlat left); was
  // [fasterNum(p.speed), p.on, p.period, ...(p.flat ? [p.flat] : []), g(e).lockedFlat!]
  surge: (e) => [g(e).pulse!.period, g(e).pulse!.flat],
  sorting: (e) => (g(e).sort!.copies > 2 ? [2] : []), // EVERY THIRD / OTHER PAYLOAD (words), TWICE from ★3
  riveter: (e) => [g(e).heal!], // SUS-A (REQ-BFG-069): the field is `heal` (was repair)
  heatjacket: (e) => [g(e).heat!, 2], // TWO JACKETS ADD UP.
  // Y7b2 (the flip): each BURN lasts burnPlus seconds longer, then BURN's own sentence (POISON left: was [g(e).poison!,
  // SIM.poisonTick, SIM.poisonMax, SIM.poisonTime])
  venom: (e) => [g(e).burnPlus!, ...BURN],
  // WORDS-1 (REQ-BFG-081): its opening says HITS TWICE (2: the doubled hit, overclock.ts doubles), then its rest (was [rest])
  overclocker: (e) => [2, g(e).overclockCooldown!],
  // Y7b2 (the flip): EVERY fuse SECONDS ... flat DAMAGE, no BURN (was [g(e).keg!.flat, g(e).keg!.burn, g(e).keg!.fuse, ...BURN])
  keg: (e) => [g(e).keg!.fuse, g(e).keg!.flat],
  // NUM-3 step 2: burnPerRide { burn, per, max } (BURN for each `per` s ridden; was 1 BURN every `seconds`)
  // Y7b2 (the flip): no cap (was [g(e).burnPerRide!.burn, g(e).burnPerRide!.per, g(e).burnPerRide!.max, ...BURN])
  bellows: (e) => [g(e).burnPerRide!.burn, g(e).burnPerRide!.per, ...BURN],
  // 0.6.2 FB-B: + flat on every payload, then up to `stacks` of its Burn at perBurn more each (the rest stays Burn)
  // Y7b2 (the flip): every BURN turns into perBurn DAMAGE, no flat and no stack cap (was [g(e).quench!.flat,
  // g(e).quench!.stacks, g(e).quench!.perBurn, ...BURN])
  quench: (e) => [g(e).quench!.perBurn, ...BURN],
  staticbrush: (e) => [g(e).staticTime!],
  // Y7b2 (the flip): no floor and no cap, the bonus for each STUN alone (was [g(e).flat!, g(e).perStalled!.each,
  // g(e).perStalled!.max], 0.6.2rel3's floor first)
  lodestone: (e) => [g(e).perStalled!.each],
  barbed: (e) => (g(e).frayCap ? [g(e).fray!, FRAY_MAX + g(e).frayCap, FRAY_BONUS] : [g(e).fray!, FRAY_BONUS, FRAY_MAX]),
  // Y7b2 (the flip): no cap (Y7b1's 3/7/11 a tile; was [r1(g(e).perTile!.each), g(e).perTile!.max])
  counterweight: (e) => [r1(g(e).perTile!.each)],
  // factories (NUM-4, REQ-BFG-047: each stamp cadence is spd(e), the factory's SPEED, "AT RATE n"; was sec(e), 30 / speed
  // at two decimals, NUM-2's; before that f(e).interval)
  press: (e) => [base(e), spd(e)],
  doublestamp: (e) => [f(e).batch!, base(e), spd(e), 1, 1], // THEY LEAVE ONE BY ONE
  shottower: (e) => [f(e).batch!, base(e), spd(e)],
  hotswap: (e) => {
    const em = f(e).cycle!.find((p) => p.tint === "ember")!, sp = f(e).cycle!.find((p) => p.tint === "spark")!;
    return [em.burn ?? 0, 1, spd(e), ...(sp.jump ? [1 + sp.jump] : []), sp.shockTime ?? DISRUPT_TIME, ...BURN];
  },
  slagpot: (e) => [base(e), spd(e), pct(AMMO.slag.fixedSpeed!)],
  // NUM-4 (REQ-BFG-047; N1 2.2): S.online says the commission timers in words, SOON AFTER ... A LITTLE LATER (was
  // COMMISSION_BASE 1.2 and COMMISSION_STEP 0.6 quoted in seconds; the hidden timers are checked after the loop below)
  // Y7b2 (the flip): RIGS START WORKING n% SOONER (1 - commission), ALL ... AT ONCE at commission 0, and no ★3 HOT START
  // (was [...(f(e).hotStart ? [2, f(e).hotStart] : []), base(e), spd(e)])
  assembly: (e) => [...(f(e).commission ? [pct(1 - f(e).commission!)] : []), base(e), spd(e)],
  gantry: (e, _k, s) => [outputsAt("gantry", s), base(e), spd(e)], // bb-0.8.3: its slots by stars (outputsAt)
  // Y7b2 (the flip): no 3-waiting cap and no BIG HAUL (the sim reads neither; was [f(e).scrapFlat!, 1, spd(e), 1,
  // SIM.scrapQueue, ...(f(e).bigHaul ? [2, 1] : [])], BIG HAUL: 2 SLUGS, NOT 1)
  scrapper: (e) => [f(e).scrapFlat!, 1, spd(e), 1],
  // NUM-3 (R1's STUN fold): a SABOT STUNs any other part for round.seconds (was 5 / 4 / 3 s by target, + 60 on bare hull)
  sabot: (e) => [1, spd(e), ...(round<{ shrapnel?: boolean }>(e).shrapnel ? [SIM.shrapnel] : []), round<{ seconds: number }>(e).seconds],
  // NUM-3: a frost round STUNs (was a freeze, with CHILL's 25%)
  frostbite: (e) => {
    const r = round<{ seconds: number; spread: number }>(e);
    return [...(r.spread ? [r.spread + 1] : []), r.seconds, ...(r.spread ? [r.spread] : []), 1, spd(e)];
  },
  // NUM-3: a chain round STUNs the part it hits (was a belt slow with SNAG's 20%, a factory's + 0.8 s and a turret's + 0.5 s)
  dragchain: (e) => [round<{ seconds: number }>(e).seconds, 1, spd(e)],
  // NUM-2: MIMIC's whole rate % (-29 / 0 / +25) as the interval share (was intervalMul 1.4 / 1 / 0.8): 29% SLOWER, 25% FASTER
  mimic: (e) => [...(imul(f(e).rate) === 1 ? [] : [speedNum(1 / imul(f(e).rate))])], // bb-0.8.3: no FEEDS 2 BELTS at ★3
  limpet: (e) => {
    const r = round<{ delay: number; blast: number; stall?: number }>(e);
    return [r.blast, r.delay, ...(r.stall ? [r.stall] : []), 1, spd(e)];
  },
  // turret cores (x k)
  scatter: (e, k) => [scaleCore(e.core!, k).pellets!, pct(scaleCore(e.core!, k).share!)],
  rotary: (e, k) => {
    const c = scaleCore(e.core!, k);
    // NUM-3 step 2 (REQ-BFG-047, N1 2.2): its load time as the whole % shorter than WINDOW_TIME (0.75 of 1.5 s: 50; was its
    // seconds, c.windowTime 0.8)
    // NUM-4 (REQ-BFG-047; N1 2.2): S.chamber says the load window in words, SOON AFTER THE FIRST LOAD (was WINDOW_TIME, 1.5
    // SECONDS; checked after the loop below)
    return [pct(1 - c.windowTime! / WINDOW_TIME), ...(c.fireRate ? [rateNum(imul(c.fireRate))] : [])]; // NUM-2: fireRate +18 / +43 (was intervalMul)
  },
  pressure: (e, k) => [r1(scaleCore(e.core!, k).perQueued!), scaleCore(e.core!, k).maxCount!],
  gatling: (e, k) => {
    const c = scaleCore(e.core!, k);
    // NUM-2: top +67 / +150 / +245 and start -17, whole rate % (was floor 0.6 / 0.4 / 0.29 and start 1.2, interval x).
    // NUM-4 (REQ-BFG-047): +150 / +245 read 150% / 245% FASTER (fasterNum above; was 2.5 / 3.4 TIMES AS FAST), and its gap
    // is SOON AFTER THE LAST (was c.gap, 2.5 SECONDS; a hidden timer, checked after the loop below)
    return [rateNum(imul(c.top)), speedNum(1 / imul(c.start)), pct(c.step!)];
  },
  hullbreaker: (e, k) => [pct(scaleCore(e.core!, k).hullMul! - 1)],
  // Y7b2 (the flip): 1 BURN FOR EVERY flatPerBurn DAMAGE alone (addBurn, burnTime and flightMul left; was [1,
  // c.flatPerBurn!, c.addBurn!, c.burnTime!, BURN_TIME, pct(1 - c.flightMul!)])
  drake: (e, k) => [1, scaleCore(e.core!, k).flatPerBurn!],
  // Y7b2 (the words; LOAD TIME retires): OR 3 SECONDS AFTER ITS FIRST LOAD, SIM.salvoWait x WINDOW_TIME (was 2, "OR TWICE
  // ITS LOAD TIME")
  salvo: (e, k) => [r1(scaleCore(e.core!, k).volleyFlat!), SIM.salvoWait * WINDOW_TIME, pct(scaleCore(e.core!, k).reloadMul! - 1)],
  // NUM-4 (REQ-BFG-047; N1 2.2): ITS SHOTS TAKE LONGER TO LAND (was its flightMul, 2.2 TIMES AS LONG; a hidden timer's
  // multiplier, checked after the loop below)
  mortar: (e, k) => [scaleCore(e.core!, k).splash!, pct(scaleCore(e.core!, k).share!)],
  grapnel: (e, k) => {
    const c = scaleCore(e.core!, k);
    // NUM-4 (REQ-BFG-047): a ★3 rip's salvage is the sim's pct(10, k%) (battle.ts impact: gun.salvage += pct(10 x ripped,
    // roundHalfUp(100 x k)); was r1(k), the x1 scale's 1 x k: 1 and 0.6). Y7b2 (the flip): ★3's salvage left (TurretState
    // .salvage is gone; was ...(s >= 3 ? [simPct(10, roundHalfUp(100 * k))] : []))
    return [...(c.rip! > 1 ? [c.rip!] : []), c.reach!];
  },
  tesla: (e, k) => {
    const c = scaleCore(e.core!, k);
    return [...(c.arcs! > 1 ? [c.arcs!] : []), r2(c.stall!), pct(c.share!)];
  },
  // Y7b2 (the flip): no 5 s cap (was [r1(scaleCore(e.core!, k).perSecond!), scaleCore(e.core!, k).maxSeconds!])
  capacitor: (e, k) => [r1(scaleCore(e.core!, k).perSecond!)],
  compound: (e, k) => [2, 1, pct(scaleCore(e.core!, k).mult!), scaleCore(e.core!, k).hold!], // PACKS 2 LOADS INTO ONE SHELL
  lance: (e, k) => [scaleCore(e.core!, k).columns!, pct(scaleCore(e.core!, k).share!), SIM.lanceMax],
  // turret gear
  chamber: (e) => [m(e).perShot!, ...(m(e).window ? [m(e).window] : [])],
  calibrate: (e) => [rateNum(imul(m(e).fireRate))], // NUM-2: fireRate +33 / +72 / +117 (was fireMul 0.75 / 0.58 / 0.46)
  flak: (e) => [pct(m(e).intercept!)],
  // Y7b2 (the flip): it aims again ONCE / UP TO TWICE / UP TO 3 TIMES (rerolls 1/2/3; the factory weight and "always a part"
  // left; was (m(e).alwaysMachine ? [m(e).factoryWeight!] : m(e).factoryWeight ? [2, 2] : []), UP TO TWICE, TWICE AS OFTEN)
  spotter: (e) => (m(e).rerolls! > 1 ? [m(e).rerolls!] : []),
  // 0.6.2 FB-B: ★1's slot and seconds at every star; ★2/★3 store 1/2 loads while the turret fires (ModSpec.store)
  // NUM-4 (REQ-BFG-047; N1 2.2): THE LOAD TIME IS LONGER, and S.chamber's SOON AFTER THE FIRST LOAD (was its windowTime,
  // 0.5 SECONDS, and WINDOW_TIME, 1.5; hidden timers, checked after the loop below)
  hopper: (e) => [m(e).window!, ...(m(e).store ? [m(e).store] : [])],
  // 0.6.2 FB-B: ★2 shields THE LAST TILE of each belt in (no digit), ★3 THE LAST 3 TILES
  mantlet: (e) => ((m(e).intakeGuard ?? 0) > 1 ? [m(e).intakeGuard!] : []),
  ram: (e) => [pct(m(e).finisher!)],
  // NUM-4 (REQ-BFG-047; N1 2.2): the pendulum peaks EARLIER / LATER, AFTER its tiles (was PEAK_SHIFT's 1.2 SECONDS too; a
  // hidden timer, checked after the loop below)
  escapement: (e) => [rateNum(imul(m(e).fireRate)), 7], // PEAK_SHIFT -1.2 s: 7 tiles (10 by default); NUM-2: fireRate (was fireMul)
  longcase: (e) => [m(e).longRideMin!, m(e).longRideFlat!, 13], // PEAK_SHIFT +1.2 s: 13 tiles
  // wave 3 (0.8.0 P1's WAVE3_NUMBERS, moved here by I1 M2 when the switch went on; REPORT-P1 section 13)
  plateroller: (e) => [g(e).plate!, PLATE_CAP], // + the plating sentence: UP TO 24 PLATING
  // Y7b2 (the flip): the matched bonus alone, no floor (flat 0; was [g(e).gauge!.flat, g(e).gauge!.matched])
  twingauge: (e) => [g(e).gauge!.matched],
  // 0.8.0 I1 (VERIFIED-P1 H5): no "UP TO 3 OTHERS" (it never binds). Y7b2 (the flip): no floor (flat 0; was
  // [g(e).pincer!.flat, g(e).pincer!.each])
  pincer: (e) => [g(e).pincer!.each],
  // Y7b2 (the flip): one sentence, its STUNs n% shorter (Y2's: the plated multiplier left, so no plated sentence)
  braceframe: (e) => [pct(1 - g(e).brace!.mul)],
  // BRINGS ONE TOO; ... INTO TWO GUNS. Y7b2 (the flip): no flat sentence (flat 0; was [1, g(e).latch!.hold,
  // g(e).latch!.flat, 2])
  twinlatch: (e) => [g(e).latch!.hold, 1, 2], // TXT-096: its hold opens the first sentence (was [1, hold, 2]: ONE, AT MOST n, TWO)
  stoker: (e) => [pct(g(e).stoke!)],
  // TAKES 10 PLATING (NUM-1: battle.ts spends 10; was 1). Y7b2 (the flip): no floor, WITH LESS PLATING ... IT ADDS NOTHING
  // (was [10, g(e).breaker!.flat, g(e).breaker!.floor])
  platebreaker: (e) => [10, g(e).breaker!.flat],
  shieldwall: (e) => [g(e).plate!, g(e).plated!.min, g(e).plated!.flat, PLATE_CAP],
  // CASTS TWO PLAIN SLUGS (3 DAMAGE EACH) AT ONCE, ONE ONTO EACH OF TWO BELTS ... THE NEXT TWO IN TURN ... INTO ONE TURRET
  // (bb-0.8.3, REQ-BFG-042 D3: the pour size, FactorySpec.pour, where 0.8.0 quoted its outputs)
  twinmould: (e) => [f(e).pour!, base(e), 1, f(e).pour!, spd(e), f(e).pour!, 1], // NUM-4: spd(e) (was sec(e); NUM-2: was f(e).interval)
  armorpress: (e) => [f(e).plate!.amount, f(e).plate!.every, base(e), spd(e), PLATE_CAP], // NUM-4: spd(e) (was sec(e); NUM-2: was f(e).interval)
  // x k. NUM-4 (REQ-BFG-047): perPlate is quoted as the sim keeps it, a whole % of the hull's plating, PLUS 220% OF THE
  // PLATING (cores.ts scaleCore; was r1(perPlate), "2.2 MORE FOR EACH PLATING")
  anvil: (e, k) => [r1(scaleCore(e.core!, k).anvilFlat!), pct(scaleCore(e.core!, k).perPlate!), PLATE_CAP],
  // rates: no k. NUM-2: +35 / +70 / +110 and +10 / +20 / +30, whole rate % (was 1 / 1.35 ... the interval x)
  // Y7b2 (the flip): plated only, 40/80/120% FASTER (the bare speed-up left; was [rateNum(imul(scaleCore(e.core!,
  // k).steamPlated)), rateNum(imul(scaleCore(e.core!, k).steamBare))])
  steambreech: (e, k) => [rateNum(imul(scaleCore(e.core!, k).steamPlated))],
  // NUM-4 (REQ-BFG-047; N1 2.2): S.pair's AT ONCE and ITS LOAD TIME IS SHORTER, DOWN TO A FLOOR (was SYNC_WINDOW, its
  // -windowTime and LOAD_FLOOR in seconds; hidden timers, checked after the loop below)
  twintrigger: (e) => [pct(m(e).pairBonus!), 2, 1], // A PAIR IS TWO LOADS ... ONE TURRET
  // Y7b2 (the flip): no cap and PLATING's soak counts once (was [m(e).spall!.every, m(e).spall!.add, m(e).spall!.max, 2],
  // ... COUNTS TWICE)
  spallcatcher: (e) => [m(e).spall!.every, m(e).spall!.add],
  // NUM-4: S.pair's AT ONCE (was SYNC_WINDOW). Y7b2 (the flip): a lone load rolls none, so no lone clause (was
  // [m(e).seam!.pair, m(e).seam!.lone, 2, 1, PLATE_CAP])
  seamwelder: (e) => [m(e).seam!.pair, 2, 1, PLATE_CAP],
  // FLIP-X2 (REQ-BFG-069, the sustain switch on): the 3 sustain pieces are buyable modules now, so their rows move here
  // from tests/sustain.text.test.ts's NUMBERS ("for RUNES-2b to move there"), the same numbers in the same order
  wardbell: (e) => [m(e).shield!.amount, m(e).shield!.every, SHIELD_CAP, 1], // GAINS ONE ... UP TO 3; BLOCKS ONE HIT'S DAMAGE
  mendpress: (e) => [f(e).heal!.amount, f(e).heal!.every, base(e), spd(e)], // HEAL n EVERY 3 SECONDS; its plain slug AT RATE n
  mendingloom: (e) => [m(e).regen!],
  // supplies
  beltcrate: (e) => [e.supply!.belt!],
  plating: (e) => [e.supply!.hull!],
  // 0.6.2rel: the 13 turrets (REQ-BFG-031): the interval and loads at that star (★2 x0.9, ★3 x0.8 of the 1-star interval,
  // said as the rate against 1 star: 11%, 25% FASTER THAN AT 1 STAR), TWO columns unless it takes the inner one only, its
  // gear slots (the rarity's GEAR_SLOTS + 1 for each star above 1) and 1 core socket, and its shots' flight.
  // NUM-2 (REQ-BFG-047): the interval is 30 / speed (secPer; was fireInterval) and the rate against 1 star reads the
  // speeds (SCRAP CANNON 33 / 30: 10%, 38 / 30: 27%; was 11%, 25%)
  // NUM-4 (REQ-BFG-047): its SPEED as it is, FIRES AT RATE 33, and the star's gain as the SPEED difference, ITS RATE IS 3
  // MORE THAN AT 1 STAR (was r2(30 / speed) and the % faster); its flight is a hidden timer no sentence quotes (was
  // r2(t.flight), ITS SHOTS LAND 0.6 SECONDS AFTER IT FIRES; checked after the loop below)
  ...Object.fromEntries(MODULES.filter((d) => d.kind === "turret").map((d) => [d.id, (e: ItemDef, _k: number, s: number) => {
    const t = e.turret!, one = ITEMS[d.id].turret!.speed;
    return [t.speed, t.window, ...(s > 1 ? [t.speed - one, 1] : []), ...(t.intake === "inner" ? [] : [2]),
      GEAR_SLOTS[d.rarity] + s - 1, 1];
  }])),
};
/** Every module with ability text: the buyable modules at 1-3 stars, then each supply at its single level. */
const ALL = [...MODULES, ...SUPPLIES];
/** Each (module, star, class factor) case. */
const CASES = ALL.flatMap((d) => starsOf(d).flatMap((s) => kOf(d).map((k) => ({ d, s, k, id: `${d.id} ★${s} k${k}` }))));
/** The landscape details column's text widths (layout.ts: LAND_MIN_W to the capped column; both faces), the phone band's. */
const WIDTHS: [number, "5" | "3"][] = [[102, "5"], [109, "5"], [116, "5"], [102, "3"], [109, "3"], [116, "3"], [151, "3"]];
/** The words a number may end a wrapped line before (the wrap never splits a number from its unit otherwise). */
const FUNCTION_WORDS = new Set(["A", "AN", "THE", "OF", "AT", "TO", "IN", "ON", "FOR", "AND", "OR", "WITH", "INTO", "FROM", "BY"]);

describe("0.6.2t: the table and the real values at each star (T1, T3)", () => {
  // 0.8.0 I1 M2 (REPORT-P1 section 13): wave 3 is live: +8 rigs, +2 factories, +2 cores, +3 mods (was 23, 13, 13, 9; 71)
  it("30 rigs, 16 factories, 15 cores, 14 mods, 13 turrets and 2 supplies; each has ability text and an audit row", () => {
    const by = (kind: string) => MODULES.filter((d) => d.kind === kind).length;
    // FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER dormant leaves the buyable rigs, 31 -> 30
    // FLIP-X2 (REQ-BFG-069, the sustain switch on): MEND PRESS joins the factories (15 -> 16), WARD BELL and MENDING LOOM the
    // mods (12 -> 14)
    // SHAPES-1 flip: NAIL STRIP, EMBER TROUGH and SPIKE RAIL join the buyable rigs (30 -> 33); the factories stay 16
    // (GANTRY PRESS and ASSEMBLY LINE are reshaped, not added)
    expect([by("gate"), by("factory"), by("core"), by("mod"), by("turret"), SUPPLIES.length]).toEqual([33, 16, 15, 14, 13, 2]);
    for (const d of ALL) expect(hasAbilityText(d.id), d.id).toBe(true);
    // FLIP-X2 (REVIEW-NUM3 answer 2): the dormant SIFTER keeps its NUMBERS row (captains' plans and old decks hold it) but
    // leaves the buyable modules: 86 -> 85 modules, (86 + 15) * 3 + 2 -> (85 + 15) * 3 + 2 cases
    expect(Object.keys(NUMBERS).sort()).toEqual([...ALL.map((d) => d.id), ...DORMANT_ITEMS].sort());
    // FLIP-X2 (REQ-BFG-069, the sustain switch on): + the 3 sustain pieces, 85 -> 88 modules, (88 + 15) * 3 + 2 cases (was
    // (85 + 15) * 3 + 2)
    // SHAPES-1 flip: + the three shaped plain rigs, 88 -> 91 modules, (91 + 15) * 3 + 2 cases (was (88 + 15) * 3 + 2)
    expect(CASES).toHaveLength((91 + 15) * 3 + 2); // 91 modules (0.6.2rel: the 13 turrets too); cores twice (k 1 and 0.55)
  });

  it("the numbers every sentence quotes are that star's values (effectAt; a core's x k)", () => {
    for (const { d, s, k, id } of CASES) {
      expect(numbers(abilityText(d.id, s, { k }).sentences.join(" ")), id).toEqual(NUMBERS[d.id](effectAt(d.id, s), k, s));
    }
    // AZ-BUMP (the flip, LADDER_FIX): off, OVERDRIVE ★2/★3 quote their speed and locked damage alone, bb-0.9.7's [4, 50] and
    // [5, 110] (on, [4, 50, 50] and [5, 100, 110] in the loop above)
    expect(withLadderFix(() => [2, 3].map((s) => numbers(abilityText("overdrive", s).sentences.join(" "))), false)).toEqual([[4, 50], [5, 110]]);
    // NUM-4 (REQ-BFG-047; N1 2.2): the hidden timers the rows above no longer quote (was each in seconds, MORTAR's x2.2):
    // none is a whole second, so the sentences say them in words (SOON AFTER, AT ONCE, LONGER, SHORTER, EARLIER, LATER) and
    // the three shared sentences that carried them quote none of them (S.pair keeps its TWO LOADS and ONE TURRET); the sim
    // keeps every one
    // Y7b2 (the flip): S.online and S.chamber left abilityText.ts (deleted symbols): S.online's sentence is S_STARTS (Y3:
    // START's words, ONLINE retired); S.chamber's load window went with HOPPER's and TWIN TRIGGER's load times (was
    // [S.online, S.chamber, S.pair] -> [[], [], [2, 1]])
    expect([S_STARTS, S.pair].map(numbers)).toEqual([[], [2, 1]]);
    // Y7b2 (the flip): HOPPER's +0.5 s and TWIN TRIGGER's -0.3/-0.4/-0.55 s load times left (no windowTime in their data),
    // so their six entries went from the list (were ...STARS.map((s) => effectAt("hopper", s).mod!.windowTime!) and
    // ...STARS.map((s) => -effectAt("twintrigger", s).mod!.windowTime!))
    const hidden = [
      COMMISSION_BASE, COMMISSION_STEP, WINDOW_TIME, SYNC_WINDOW, LOAD_FLOOR, -PEAK_SHIFT.escapement, PEAK_SHIFT.longcase,
      ...STARS.map((s) => scaleCore(effectAt("gatling", s).core!, 1).gap!), ...STARS.map((s) => scaleCore(effectAt("mortar", s).core!, 1).flightMul!),
      ...MODULES.filter((d) => d.kind === "turret").flatMap((d) => STARS.map((s) => effectAt(d.id, s).turret!.flight)),
    ];
    expect(STARS.map((s) => [effectAt("hopper", s).mod!.windowTime, effectAt("twintrigger", s).mod!.windowTime])).toEqual([[undefined, undefined], [undefined, undefined], [undefined, undefined]]);
    expect(hidden.filter((t) => !(t > 0) || Number.isInteger(t)), "a hidden timer a whole second could say").toEqual([]);
  });

  it("MIMIC FORGE names the hero's own ammo and its rate, from the hero's signature factory", () => {
    for (const hero of ["furnace", "weaver"] as const) for (const s of STARS) {
      const h = HEROES[hero], sig = ITEMS[h.factory].factory!, rate = effectAt("mimic", s).factory!.rate;
      const last = abilityText("mimic", s, { hero }).sentences.at(-1)!;
      // NUM-4 (REQ-BFG-047): the rate in words, AT RATE n (was EVERY n SECONDS)
      expect(last, `${hero} ★${s}`).toMatch(new RegExp(`^FOR ${h.name}, THAT IS AN? [A-Z ]+ AT RATE `));
      // NUM-2 (REQ-BFG-047): the hero factory's (level 1) speed x MIMIC's whole rate %, rounded half up once as the battle
      // does (battle.ts factoryDef): FURNACE ★1 24 x 0.71 -> 17. NUM-4: quoted as that SPEED (was 30 / speed, 1.76)
      expect(numbers(last), `${hero} ★${s}`).toEqual([roundHalfUp(sig.speed * rateMul(rate))]);
    }
  });

  it("the brief's cases, written out", () => {
    const at = (def: string, s: number) => abilityText(def, s);
    // NUM-1: x10 (was 2). Y7b2 (the flip): LONG HAUL's cap left (was "ADDS 20 DAMAGE FOR EACH EARLIER RIG HIT, UP TO 6 HITS.")
    expect(at("longhaul", 2).sentences[0]).toBe("ADDS 20 DAMAGE FOR EACH EARLIER RIG HIT.");
    // WORDS-1 (REQ-BFG-081; READ-1 6.1: NEXT RIG'S): in its face's words (was "DOUBLES THE NEXT RIG'S HIT, THEN RECHARGES FOR 4
    // SECONDS.")
    expect(at("overclocker", 1).sentences[0]).toBe("THE NEXT RIG DOWN ITS BELT HITS TWICE, THEN IT RECHARGES FOR 4 SECONDS.");
    expect(at("mimic", 3)).toEqual({ // bb-0.8.3 (REQ-BFG-042 D3): its belts follow its stars; no "AND FEEDS 2 BELTS"
      sentences: ["STAMPS YOUR HERO'S SIGNATURE AMMO 25% FASTER THAN ITS OWN FACTORY."],
      perk: { name: "TWIN SIGNET", stars: 3, after: 0 },
    });
    // Y7b2 (the flip): harassment is a STUN, no 3-waiting cap and no BIG HAUL wreck sentence (were "IT STAMPS ONE AT RATE
    // 15, AND ONE MORE EACH TIME YOUR HARASSMENT LANDS, UP TO 3 WAITING." and "A RIG YOUR SABOTS WRECK EARNS 2 SCRAP SLUGS,
    // NOT 1."), so ★3 has two sentences
    expect(at("scrapper", 3).sentences).toEqual([
      "STAMPS SCRAP SLUGS THAT DEAL 105 MORE DAMAGE THAN PLAIN ONES.", // NUM-1: x10 (was 10.5)
      // NUM-4 (REQ-BFG-047): its SPEED (★3 15), AT RATE 15 (was EVERY 2 SECONDS, 30 / 15)
      `IT STAMPS ONE AT RATE ${effectAt("scrapper", 3).factory!.speed}, AND ONE MORE EACH TIME YOUR STUN LANDS.`,
    ]);
    // Y7b2 (the words): ★3's perk name left with its rule (was { name: "BIG HAUL", stars: 3, after: 2 })
    expect(at("scrapper", 3).perk).toBeUndefined();
    // NUM-3 (R1's STUN fold): a frost round STUNs (was "STAMPS ROUNDS THAT FREEZE 2 MACHINES FOR 2.75 SECONDS."); its
    // seconds through the data (step 2's whole seconds)
    const frost2 = effectAt("frostbite", 2).factory!.round as { seconds: number; spread: number };
    expect(at("frostbite", 2).sentences[0]).toBe(`STAMPS ROUNDS THAT STUN ${frost2.spread + 1} MACHINES FOR ${r2(frost2.seconds)} SECOND${frost2.seconds === 1 ? "" : "S"}.`);
    expect(at("temper", 1).sentences).toEqual(["ADDS 1 BURN TO EACH PAYLOAD IT HITS.", "EACH BURN DEALS THE ENEMY HULL 10 DAMAGE A SECOND FOR 3 SECONDS."]); // NUM-1: BURN_DPS 10 (was 1)
  });

  it("0.6.2rel: FB-B's four modules and the turrets, written out", () => {
    const at = (def: string, s: number) => abilityText(def, s);
    // NUM-1: x10 (was 1 and 3; 4 Burn is a count). Y7b2 (the flip): QUENCH has no floor and no stack cap (was "ADDS 10
    // DAMAGE TO EACH PAYLOAD IT HITS, THEN TURNS UP TO 4 OF ITS BURN INTO 30 MORE DAMAGE EACH.")
    // AZ-BUMP (the flip, LADDER_FIX): 30 -> 40, the star-ladder pass's QUENCH ★1 (40 a BURN); off, 30
    expect(at("quench", 1).sentences[0]).toBe("TURNS EACH BURN ON THE PAYLOADS IT HITS INTO 40 DAMAGE.");
    expect(withLadderFix(() => at("quench", 1).sentences[0], false)).toBe("TURNS EACH BURN ON THE PAYLOADS IT HITS INTO 30 DAMAGE.");
    // NUM-1: x10 (was 1). Y7b2 (the flip): SURGE VALVE's damage pulse alone (was "PULSES ITS BELTS 3 TIMES AS FAST FOR 1
    // SECOND EVERY 3 SECONDS, EACH PULSE ADDING 10 DAMAGE.")
    expect(at("surge", 1).sentences[0]).toBe("EVERY 3 SECONDS, EACH PAYLOAD ON THE BELTS IT HITS GAINS 10 DAMAGE.");
    // Y7b2 (the flip): HOPPER ★2 holds 2 more loads and stores none (was sentences[1] "WHILE THE TURRET FIRES, IT STORES 1
    // LOAD FROM THE BELT FOR ITS NEXT CHAMBER.")
    expect(at("hopper", 2).sentences).toEqual(["THE TURRET'S CHAMBER HOLDS 2 MORE LOADS."]);
    // NUM-3 (R1's STUN fold): MANTLET ignores every STUN source from ★1 (was "THE TURRET IGNORES SHOCK, STATIC, ARC, CHAIN,
    // FROST AND SABOT STALLS." at ★2, FULL PLATE's list); ★2 FULL GUARD keeps its tile. Y7b2 (the flip): ★2 guards 2 tiles
    // and no rigs (the shared rig guard left; was "SO DO THE LAST TILE OF EACH BELT IN, AND THE RIGS WORKING IT.")
    // TXT-096 (REVIEW-TXT095 Q2): one opening with its face's tiles (was ["THE TURRET IGNORES EVERY STUN.", "SO DO THE LAST 2
    // TILES OF EACH BELT IN."] and ★1's "THE TURRET IGNORES EVERY STUN.")
    expect(at("mantlet", 2).sentences).toEqual([
      "THE TURRET IGNORES EVERY STUN, AND SO DO THE LAST 2 TILES OF EACH BELT IN.",
    ]);
    expect([at("mantlet", 1).sentences[0], cardText("mantlet")]).toEqual(["THE TURRET IGNORES EVERY STUN, AND SO DOES THE LAST TILE OF EACH BELT IN.", "IGNORES EVERY STUN."]);
    // NUM-2 (REQ-BFG-047; was EVERY 0.9 SECONDS and 11% FASTER): BOMBARD ★2's speed is 33 (30 / 0.9 = 33.3 rounded), so it
    // fires every 30 / 33 = 0.909 -> 0.91 s, and 33 / 30 = 1.1 is 10% faster than ★1's 30 (was 1 / 0.9 = 1.11, 11%)
    // NUM-4 (REQ-BFG-047): its SPEED as it is, AT RATE 33, and the star's gain as the SPEED difference, 33 - 30 = 3 MORE
    // (was EVERY 0.91 SECONDS and 10% FASTER); its flight (0.6 s) is a hidden timer, so its sentence is gone (was "ITS SHOTS
    // LAND 0.6 SECONDS AFTER IT FIRES."): the check is that no sentence quotes it, and the sim keeps it
    const b1 = ITEMS.bombard.turret!, b2 = effectAt("bombard", 2).turret!;
    expect(at("bombard", 2)).toEqual({
      sentences: [
        `A HEAVY TURRET THAT FIRES AT RATE ${b2.speed} AND HOLDS 4 LOADS.`, `ITS RATE IS ${b2.speed - b1.speed} MORE THAN AT 1 STAR.`,
        "IT TAKES A BELT ON EACH OF ITS TWO COLUMNS.", "IT HAS 3 GEAR SLOTS AND 1 CORE SOCKET.",
      ],
    });
    expect([b2.flight, at("bombard", 2).sentences.some((t) => /LAND|SECOND/.test(t))]).toEqual([0.6, false]);
    expect(at("hailgun", 1).sentences.slice(0, 2)).toEqual([`A LIGHT TURRET THAT FIRES AT RATE ${ITEMS.hailgun.turret!.speed} AND HOLDS 3 LOADS.`, "IT TAKES A BELT ON ITS INNER COLUMN ONLY."]); // NUM-4: was EVERY 0.45 SECONDS
    expect(at("thunderer", 3).sentences[3]).toBe("IT HAS 6 GEAR SLOTS AND 1 CORE SOCKET."); // legendary 4, + 1 for each star above 1
    expect(at("swivel", 1).sentences[0]).toBe(`AN ADAPTABLE TURRET THAT FIRES AT RATE ${ITEMS.swivel.turret!.speed} AND HOLDS 3 LOADS.`); // NUM-4: was EVERY 0.7 SECONDS
    // NUM-2 (REQ-BFG-047; was 0.9 SECONDS): ★2 speed 33, 30 / 33 = 0.91. NUM-4: the SPEEDs, AT RATE 30 and AT RATE 33 (was
    // EVERY 1 SECOND, EVERY 0.91 SECONDS)
    expect([cardText("bombard"), nextStarText("bombard", 1)]).toEqual([`FIRES AT RATE ${b1.speed}.`, `NEXT STAR: FIRES AT RATE ${b2.speed}, 3 GEAR SLOTS.`]);
  });
});

describe("0.6.2t: plain whole sentences (T1, T2, T4)", () => {
  it("T1: the text opens with one plain sentence: a capital, words, one full stop at the end", () => {
    for (const { d, s, k, id } of CASES) {
      const first = abilityText(d.id, s, { k }).sentences[0];
      expect(first, id).toMatch(/^[A-Z][A-Z0-9 ,:;'%()★.+-]*\.$/);
      expect(first.split(" ").length, id).toBeGreaterThanOrEqual(3);
      expect(first.slice(0, -1), id).not.toMatch(/\.\s/); // one sentence (a decimal point isn't a stop)
    }
  });

  it("T4: every entry is a whole sentence (a full stop at the end, no line break, no ·); the perk is this star's", () => {
    for (const { d, s, k, id } of CASES) {
      const at = abilityText(d.id, s, { k });
      for (const t of at.sentences) expect(t, id).toMatch(/^[A-Z0-9][^\n·]*\.$/);
      if (at.perk) {
        expect(at.perk.name, id).toBe(perkAt(d.id, s));
        expect(at.perk.stars, id).toBe(s);
        expect(at.perk.after, id).toBeLessThan(at.sentences.length);
      } else expect(s === 1 || !perkAt(d.id, s), id).toBe(true);
    }
  });

  it("T2: no banned shorthand in any ability sentence, clause, next-star, headline, MERGES WITH or card line", () => {
    for (const { d, s, k, id } of CASES) {
      const texts = [
        ...abilityText(d.id, s, { k }).sentences, gist(d.id, s, { k }), nextStarText(d.id, s, { k }) ?? "",
        nextStarHeadline(d.id, s, { k }) ?? "", s > 1 ? mergesWithText(d.id, s, { k }) : "", s === 1 ? cardText(d.id, { k }) : "",
      ];
      for (const t of texts) expect(banned(t), `${id}: ${t}`).toEqual([]);
    }
  });

  it("T4: wrapped by the one helper, every line fits the desk column and the phone band; a number keeps its unit", () => {
    for (const { d, s, k, id } of CASES) {
      const at = abilityText(d.id, s, { k });
      at.sentences.forEach((t, i) => {
        const spans: Span[] = [...colourize(t, C.bone), ...(at.perk?.after === i ? [{ t: " ", c: C.bone }, { t: `★${s} ${at.perk.name}`, c: C.brass3, whole: true }] : [])];
        for (const [w, font] of WIDTHS) {
          const lines = wrapRich(spans, w, font).map(lineText);
          lines.forEach((ln, j) => {
            expect(textWidth(ln, font), `${id} at ${w} (${font}): ${ln}`).toBeLessThanOrEqual(w);
            const next = lines[j + 1]?.split(" ")[0];
            if (next !== undefined && /(^|\s)\(?[+-]?\d+(\.\d+)?%?$/.test(ln)) expect(FUNCTION_WORDS.has(next), `${id}: "${ln}" / "${next}"`).toBe(true);
          });
        }
      });
    }
  });
});

describe("0.6.2t T5: next star, merge progress and MERGES WITH, as sentences", () => {
  it("NEXT STAR: the next star's clause, at every star below the top; none at ★3 or for a supply", () => {
    for (const { d, s, k, id } of CASES) {
      const next = nextStarText(d.id, s, { k });
      if (!fusible(d.id) || s >= 3) expect(next, id).toBeNull();
      else {
        // bb-0.8.3 (REQ-BFG-042 M4): a factory's next-star line closes with its belt slots at that star
        const belts = d.kind === "factory" ? `, ${outputsAt(d.id, s + 1)} BELTS` : "";
        expect(next, id).toBe(`NEXT STAR: ${gist(d.id, s + 1, { k })}${belts}.`);
        expect(numbers(next!).every((n) => numbers(abilityText(d.id, s + 1, { k }).sentences.join(" ")).includes(n) || n === s + 1 || (!!belts && n === outputsAt(d.id, s + 1))), id).toBe(true);
      }
    }
    // bb-0.8.3: FOURTH ARM (0.8.0: "NEXT STAR: FEEDS 3 BELTS.", THIRD ARM): a faster stamp, and 4 belts. T47
    // (REQ-BFG-047): FASTER, no seconds
    // SHAPES-1 flip: GANTRY PRESS is 2x3, its size's +1 belt slot (foot.ts footSlots) makes 4/5/6, so ★2 feeds 5 (was 4)
    expect(nextStarText("gantry", 1)).toBe("NEXT STAR: FASTER PLAIN SLUGS, 5 BELTS.");
    expect(nextStarText("temper", 1)).toBe("NEXT STAR: ADDS 2 BURN.");
  });

  it("MERGES WITH reads as a whole sentence (U2e step 1: merge progress is gone)", () => {
    // U2e step 1 (REQ-BFG-070): mergeProgressText ("1 MORE COPY TO MERGE.") is deleted, so the glossary exports no copy count
    expect(Object.keys(glossaryModule)).not.toContain("mergeProgressText");
    expect(mergesWithText("temper", 2)).toBe("MERGES WITH YOUR TEMPER INTO ★2: ADDS 2 BURN.");
    // bb-0.8.3: no "FEEDS 2 BELTS" (0.8.0: "25% FASTER, FEEDS 2 BELTS."); the line closes with its 4 belts at ★3
    expect(mergesWithText("mimic", 3)).toBe("MERGES WITH YOUR MIMIC FORGE INTO ★3: 25% FASTER, 4 BELTS.");
  });

  it("no source file still writes the polish's NEEDS n MORE or the old copy count", () => {
    for (const p of ["src/screens/build/inspector.ts", "src/ui/abilityText.ts", "src/screens/build/shop.ts", "src/screens/build/chrome.ts"]) {
      expect(SRC(p), p).not.toMatch(/NEEDS \$\{|NEEDS \d MORE|MORE COPY\b(?! TO MERGE)/);
    }
  });
});

describe("0.6.2t T5: each shop offer's one-line effect", () => {
  it("every buyable module and supply has one: a whole sentence, no shorthand, its numbers from the 1-star text", () => {
    for (const d of ALL) for (const k of kOf(d)) {
      const card = cardText(d.id, { k }), id = `${d.id} k${k}: ${card}`;
      expect(card, id).toMatch(/^[A-Z0-9][^\n·]*\.$/);
      expect(banned(card), id).toEqual([]);
      const pool = numbers(abilityText(d.id, 1, { k }).sentences.join(" "));
      for (const n of numbers(card)) expect(pool, id).toContain(n);
    }
  });

  it("it fits the wide landscape card in two lines at every landscape width (430 to 480), for both class factors", () => {
    for (let W = 430; W <= 480; W++) {
      const w = wideCardW(W, 5);
      for (const d of ALL) for (const k of kOf(d)) {
        const ls = cardEffectLines(cardText(d.id, { k }), w);
        expect(ls.length, `${d.id} at card ${w}`).toBeLessThanOrEqual(CARD_EFFECT_LINES);
        for (const l of ls) expect(lineWidth(l, "3"), `${d.id} at card ${w}: ${lineText(l)}`).toBeLessThanOrEqual(cardEffectWidth(w));
      }
    }
    expect([wideCardW(430, 5), wideCardW(480, 5), wideCardW(480, 3)]).toEqual([69, 70, 70]);
  });

  it("the hover tooltip shows the offer's opening sentence, wrapped by the same helper", () => {
    for (const d of ALL) {
      const first = abilityText(d.id, 1).sentences[0];
      const ls = tooltipLines(first);
      expect(ls.map(lineText).join(" "), d.id).toBe(first);
      for (const l of ls) expect(lineWidth(l, "3"), d.id).toBeLessThanOrEqual(TOOLTIP_TEXT_W);
    }
  });
});

describe("0.6.2t T4: numbers and keywords in their battle colours, the same everywhere", () => {
  it("colourize: numbers white; BURN, SHOCK, FREEZE, POISON, FASTER and SLOWER in their colours; the rest in the base", () => {
    const colourOf = (text: string, word: string, base = C.bone) => colourize(text, base).find((sp) => sp.t === word)?.c;
    expect(colourOf("ADDS 2 BURN TO EACH", "BURN")).toBe(KEYWORD_COLOUR.burn);
    expect(colourOf("ADDS 2 BURN TO EACH", "2")).toBe(NUMBER_COLOUR);
    expect(colourOf("ADDS SHOCK, WHICH", "SHOCK")).toBe(KEYWORD_COLOUR.shock);
    expect(colourOf("ROUNDS THAT FREEZE 2", "FREEZE")).toBe(KEYWORD_COLOUR.freeze);
    // Y7b2 (the flip): KEYWORD_COLOUR.poison left with POISON (a deleted symbol), so POISON draws in the text's own colour,
    // as FROST does since FLIP-X2 (was expect(colourOf("ADDS 2 POISON TO", "POISON")).toBe(KEYWORD_COLOUR.poison))
    expect(Object.keys(KEYWORD_COLOUR)).not.toContain("poison");
    expect(colourize("POISON", C.bone)).toEqual([{ t: "POISON", c: C.bone }]);
    expect(colourOf("MAKES IT 60% FASTER.", "FASTER")).toBe(KEYWORD_COLOUR.faster);
    expect(colourOf("MAKES IT 40% SLOWER.", "SLOWER")).toBe(KEYWORD_COLOUR.slower);
    // a speed phrase takes the speed colour word by word (the spaces between are blank either way)
    for (const w of ["HALF", "SPEED"]) expect(colourOf("SLOWS IT TO HALF SPEED.", w), w).toBe(KEYWORD_COLOUR.slower);
    for (const w of ["TIMES", "AS", "FAST"]) expect(colourOf("RUNS 3 TIMES AS FAST.", w), w).toBe(KEYWORD_COLOUR.faster);
    expect(colourOf("RUNS 3 TIMES AS FAST.", "3")).toBe(NUMBER_COLOUR);
    expect(colourize("ADDS 2 BURN TO EACH", C.steel2).find((sp) => sp.t.includes("TO EACH"))?.c).toBe(C.steel2);
    // the flavour keeps its numbers in its own dim colour; its keywords keep their battle colours
    expect(colourize("ADDS 2 BURN.", C.steel2, C.steel2).map((sp) => sp.c)).toContain(KEYWORD_COLOUR.burn);
    expect(colourize("ADDS 2 BURN.", C.steel2, C.steel2).find((sp) => sp.t.includes("2"))?.c).toBe(C.steel2);
  });
});

// ------------------------------------------------------------------------------------------------- wave 3 (0.8.0 P1)
// REQ-BFG-032: wave 3's 15 modules are dormant behind content.ts WAVE3_LIVE, so MODULES above doesn't list them and every
// table above is unchanged. Their audit rows are here, written out from the catalogue as NUMBERS is, and the same rules
// run on them with wave 3 turned on (withWave3): T1, T2, T4 (whole sentences, the perk, the wrap), T5 (next star, MERGES
// WITH, the card) and the tooltip. When wave 3 goes live, I1 moves these rows into NUMBERS and the counts above grow by 15.
// 0.8.0 I1 M2: wave 3 is live. WAVE3_NUMBERS's rows are in NUMBERS now (MODULES lists the 15, so every table and rule
// above runs on them too); this block keeps its own checks, reading NUMBERS.

/** Wave 3's modules (ITEMS resolves them whatever the switch) and their (module, star, class factor) cases. */
const W3 = WAVE3_IDS.map((id) => ITEMS[id]);
const W3_CASES = W3.flatMap((d) => STARS.flatMap((s) => kOf(d).map((k) => ({ d, s, k, id: `${d.id} ★${s} k${k}` }))));

describe("0.8.0 P1: wave 3's text at every star (REQ-BFG-032, the 0.6.2 standard)", () => {
  // 0.8.0 I1 M2: flipped (the switch is on): MODULES lists the 15; with the switch off for one call, nothing does
  it("the 15 are live, fusible and buyable (none with the switch off); each has ability text and an audit row", () => {
    expect(W3.map((d) => d.kind).sort().join()).toBe("core,core,factory,factory,gate,gate,gate,gate,gate,gate,gate,gate,mod,mod,mod");
    expect(MODULES.filter((d) => WAVE3_IDS.includes(d.id)).map((d) => d.id)).toEqual([...WAVE3_IDS]); // the switch is on
    withWave3(() => expect(buyableModules().filter((d) => WAVE3_IDS.includes(d.id))).toEqual([]), false);
    for (const d of W3) expect([hasAbilityText(d.id), fusible(d.id)], d.id).toEqual([true, true]);
    expect(Object.keys(NUMBERS).filter((id) => WAVE3_IDS.includes(id)).sort()).toEqual([...WAVE3_IDS].sort());
    expect(W3_CASES).toHaveLength((15 + 2) * 3); // the two cores twice (k 1 and 0.55)
  });

  it("the four glossary sentences, word for word (DESIGN-wave3.md 3.2), with the sim's numbers", () => {
    expect([S.plating, S.pair, S.matched, S.worksFaster]).toEqual([
      // NUM-1: x10 (was 24). Y7b2 (the flip): no POISON (S_PLATING became S.plating; was "PLATING TAKES DAMAGE, BURN AND
      // POISON BEFORE YOUR HULL, ...")
      "SHIELD TAKES DAMAGE AND BURN BEFORE YOUR HULL, UP TO 240 SHIELD; THE DARK WIND GOES STRAIGHT THROUGH IT.",
      // NUM-4 (REQ-BFG-047; N1 2.2): the pair window, SYNC_WINDOW 0.25 s (pinned below), is a hidden timer said AT ONCE
      // (was "WITHIN 0.25 SECONDS")
      "A PAIR IS TWO LOADS THAT REACH ONE TURRET THROUGH DIFFERENT INTAKES AT ONCE; A FOUNDRY FUSION IS A PAIR.",
      "A MATCHED BELT HAS AS MANY TILES AS ANOTHER BELT INTO THE SAME TURRET.",
      "A FACTORY THAT WORKS FASTER STAMPS AND POURS SOONER, AND ITS OTHER TIMERS RUN FASTER TOO.",
    ]);
    expect([PLATE_CAP, SYNC_WINDOW]).toEqual([240, 0.25]); // NUM-1: PLATE_CAP x10 (was 24)
    // each word is explained where a module's text uses it: PLATING by its plating sources and readers, PAIR by its pair
    // readers, MATCHED by TWIN GAUGE, WORKS FASTER by STOKER
    const uses = (sentence: string) => W3.filter((d) => abilityText(d.id, 1).sentences.includes(sentence)).map((d) => d.id).sort();
    expect(uses(S.plating)).toEqual(["anvil", "armorpress", "plateroller", "seamwelder", "shieldwall"]);
    expect(uses(S.pair)).toEqual(["seamwelder", "twintrigger"]);
    expect(uses(S.matched)).toEqual(["twingauge"]);
    expect(uses(S.worksFaster)).toEqual(["stoker"]);
  });

  it("the numbers every sentence quotes are that star's values (effectAt; a core's x k)", () => {
    for (const { d, s, k, id } of W3_CASES) { // 0.8.0 I1 M2: NUMBERS holds the rows; the switch is on
      expect(numbers(abilityText(d.id, s, { k }).sentences.join(" ")), id).toEqual(NUMBERS[d.id](effectAt(d.id, s), k, s));
    }
  });

  it("DESIGN 3.3's text, written out (with the Prime's two lines: STOKER's cap, TWIN LATCH's timed release)", () => {
    const at = (def: string, s = 1, k = 1) => abilityText(def, s, { k }).sentences;
    // NUM-1 (REQ-BFG-047): every damage and plating number below is x10 (fixtures/num1-base-values.json); %, times,
    // counts and ANVIL's perPlate (damage per plating, a ratio) as they were
    // HULL-ON (the flip, GUARD; cap's ruling 6f4568477e66a600): 17 -> 51, GUARD's PLATE ROLLER (x3 a payload); it read 17
    // before only because a wave-3 toggle wrote the base def back. The base sentence with GUARD off (was 1.7)
    expect(at("plateroller", 3)[0]).toBe("ROLLS 51 SHIELD ONTO YOUR HULL FOR EACH PAYLOAD IT HITS.");
    expect(withGuard(() => at("plateroller", 3)[0], false)).toBe("ROLLS 17 SHIELD ONTO YOUR HULL FOR EACH PAYLOAD IT HITS.");
    // was 2.2, 6.6. Y7b2 (the flip): TWIN GAUGE's floor left, the matched bonus alone (was "ADDS 22 DAMAGE TO EACH PAYLOAD
    // IT HITS, OR 66 DAMAGE ON A MATCHED BELT.")
    expect(at("twingauge", 2)[0]).toBe("ADDS 66 DAMAGE TO EACH PAYLOAD IT HITS ON A MATCHED BELT.");
    expect(at("pincer")).toEqual([ // 0.8.0 I1 (VERIFIED-P1 H5): no "UP TO 3 OTHERS" (it never binds; the code keeps the cap)
      // was 1, 2. Y7b2 (the flip): PINCER's floor left (was "ADDS 10 DAMAGE TO EACH PAYLOAD IT HITS, AND 20 MORE FOR EACH
      // OTHER RIG HITTING THAT TILE.")
      "ADDS 20 DAMAGE TO EACH PAYLOAD IT HITS FOR EACH OTHER RIG HITTING THAT TILE.",
      "STUNNED AND WRECKED RIGS DON'T COUNT.", // NUM-3 (R1's STUN fold): was "STALLED, FROZEN AND WRECKED ..."
    ]);
    // Y7b2 (the flip; Y2's BRACE FRAME): it guards its arrows' tiles only and the plated multiplier left (were "ENEMY STUNS ON
    // THE BELT TILES IT HITS, AND ON ITSELF, LAST 85% SHORTER." and "WHILE YOUR HULL HOLDS PLATING THEY LAST 95% SHORTER.")
    expect(at("braceframe", 3)).toEqual([
      "ENEMY STUNS ON THE BELT TILES IT HITS LAST 85% SHORTER.", // NUM-3: was "STALLS, FREEZES AND CHAIN SLOWS"
    ]);
    // T6: DESIGN's "AT THE TILE IT HITS" moves to the second sentence, so the opening fits the phone band whole. Y7b2 (the
    // flip): TWIN LATCH's flat left (was its third sentence "EACH PAYLOAD IT LETS GO GAINS 10 DAMAGE.")
    // TXT-096 (REVIEW-TXT095 Q2): the opening says its face's hold limit, the second no longer repeats it (were "HOLDS EACH
    // PAYLOAD UNTIL ..." and "..., AT MOST 1 SECOND, AND ONLY WHEN ...")
    expect(at("twinlatch")).toEqual([
      "HOLDS EACH PAYLOAD UP TO 1 SECOND UNTIL ITS OTHER BELT BRINGS ONE, THEN LETS THEM GO SO THEY REACH THE GUN TOGETHER.",
      "IT HOLDS A PAYLOAD AT THE TILE IT HITS, AND ONLY WHEN BOTH ITS ARROWS HIT BELTS.",
      "ON BELTS INTO TWO GUNS, IT LETS BOTH GO AT ONCE.",
    ]);
    // Y7b2 (the flip): ★2 holds 2 seconds (hold 1/2/3), no flat (was "NEXT STAR: ADDS 22 DAMAGE.")
    expect(nextStarText("twinlatch", 1)).toBe("NEXT STAR: HOLDS UP TO 2 SECONDS.");
    // was 2.2, 4, 17.6. Y7b2 (the flip): SPALL CATCHER's cap left (was "NEXT STAR: 22 DAMAGE FOR EVERY 40, UP TO 176.")
    expect(nextStarText("spallcatcher", 1)).toBe("NEXT STAR: 22 DAMAGE FOR EVERY 40.");
    // TXT-096 (REVIEW-TXT095 Q2): its face's UP TO (was "EACH FACTORY ITS ARROWS POINT AT WORKS 20% FASTER.")
    expect(at("stoker").slice(0, 2)).toEqual(["EACH FACTORY ITS ARROWS POINT AT WORKS UP TO 20% FASTER.", "IT NEVER MAKES A FACTORY OUTRUN ITS GUN."]);
    // NUM-1: was 1 PLATING, 14, 3.5. The battle spends 10 plating (battle.ts: `if (s.plate.plate >= 10) { // NUM-1: 10
    // plating (x10 of 1)`), so the text's "TAKES 1 PLATING" (abilityText.ts platebreaker) disagrees: a text bug, left red
    // Y7b2 (the flip): PLATE BREAKER's floor left (was its second sentence "WITH NO PLATING TO TAKE, IT ADDS 35 DAMAGE.")
    expect(at("platebreaker", 3)).toEqual(["EACH PAYLOAD IT HITS TAKES 10 SHIELD FROM YOUR HULL AND GAINS 140 DAMAGE.", "WITH LESS SHIELD THAN THAT, IT ADDS NOTHING."]);
    // TXT-096 (REVIEW-TXT095 Q2): one opening with both parts (was its [1], "WHILE YOUR HULL HOLDS 120 PLATING OR MORE, EACH OF
    // THOSE PAYLOADS ALSO GAINS 30 DAMAGE.")
    expect(at("shieldwall")[0]).toBe("ROLLS 10 SHIELD ONTO YOUR HULL FOR EACH PAYLOAD IT HITS, AND WHILE YOUR HULL HOLDS 120 SHIELD OR MORE, EACH GAINS 30 DAMAGE."); // was 12, 3
    // bb-0.8.3 (REQ-BFG-042 D3): the pour, not its belts: TWO (★3 THIRD SPRUE: THREE) at once, the next ones in turn
    // NUM-2 (REQ-BFG-047): the casts every 30 / speed s: ★1 speed 17, 30 / 17 = 1.76 (was 1.8); ★3 speed 21, 1.43 (was 1.4)
    // NUM-4 (REQ-BFG-047): the casts AT RATE n, n its SPEED (★1 17, ★3 21; was EVERY 1.76 / 1.43 SECONDS)
    const spdAt = (def: string, s: number) => effectAt(def, s).factory!.speed;
    expect(at("twinmould")[0]).toBe(`CASTS TWO PLAIN SLUGS (30 DAMAGE EACH) AT ONCE, ONE ONTO EACH OF TWO BELTS, AT RATE ${spdAt("twinmould", 1)}.`); // was 3
    expect(abilityText("twinmould", 3)).toEqual({
      sentences: [
        `CASTS THREE SLUGS (60 DAMAGE EACH) AT ONCE, ONE ONTO EACH OF THREE BELTS, AT RATE ${spdAt("twinmould", 3)}.`, // was 6
        "WITH MORE BELTS, EACH CAST TAKES THE NEXT THREE IN TURN.",
        "ON MATCHED BELTS INTO ONE TURRET, EACH CAST ARRIVES AS A PAIR.",
      ],
      perk: { name: "THIRD SPRUE", stars: 3, after: 0 },
    });
    // NUM-2 (REQ-BFG-047; was EVERY 1.6 SECONDS): ★1 speed 19, a slug every 30 / 19 = 1.58 s
    // NUM-4 (REQ-BFG-047): AT RATE 19, its SPEED (was EVERY 1.58 SECONDS)
    expect(at("armorpress")[0]).toBe(`PRESSES 30 SHIELD ONTO YOUR HULL EVERY 3 SECONDS, AND STAMPS A PLAIN SLUG (30 DAMAGE) AT RATE ${spdAt("armorpress", 1)}.`); // 0.8.0 B1 M2: 2 every 4 s -> 3 every 3 s; NUM-1: was 3, 3
    // NUM-4 (REQ-BFG-047): perPlate as the sim keeps it, a whole % of the hull's plating (cores.ts scaleCore; Battle.fireCore:
    // pct(plate, 100 x perPlate)): ★1 1 -> 100% (was "AND 1 MORE FOR EACH PLATING ON YOUR HULL.", the ratio at one decimal)
    const perPlate = (s: number, k: number) => pct(scaleCore(effectAt("anvil", s).core!, k).perPlate!);
    expect(at("anvil")[0]).toBe(`EACH SHOT DEALS 25 MORE DAMAGE, PLUS ${perPlate(1, 1)}% OF THE SHIELD ON YOUR HULL.`); // 0.8.0 B1 M2: was 1 and 0.2; NUM-1: was 2.5 (perPlate a ratio: 1)
    // x k, as every core (0.8.0 B1 M2: was 1.9 and 0.4); NUM-1: was 4.8. ★3 anvilFlat 88 x 55% = 48.4, rounded half up at
    // install (scaleCore) to 48; perPlate 3.5 x 55% = 1.925 -> 1.93 (a whole % of a ratio), printed 1.9 as before.
    // NUM-4: printed as the sim keeps it, 193% (was "AND 1.9 MORE FOR EACH PLATING ON YOUR HULL.")
    expect(at("anvil", 3, 0.55)[0]).toBe(`EACH SHOT DEALS 48 MORE DAMAGE, PLUS ${perPlate(3, 0.55)}% OF THE SHIELD ON YOUR HULL.`);
    expect(perPlate(3, 0.55)).toBe(193);
    // 0.8.0 B1 M2: was 44% and 10%. Y7b2 (the flip): STEAM BREECH's bare speed-up left, plated 40/80/120% (was "THE TURRET
    // FIRES 70% FASTER WHILE YOUR HULL HOLDS PLATING, AND 20% FASTER WITHOUT IT.")
    expect(at("steambreech", 2)).toEqual(["THE TURRET FIRES 80% FASTER WHILE YOUR HULL HOLDS SHIELD."]);
    // NUM-4 (REQ-BFG-047; N1 2.2): its -0.55 s and the 0.3 s floor are hidden timers no whole second says, so the sentence
    // says SHORTER, DOWN TO A FLOOR (was "ITS LOAD TIME IS 0.55 SECONDS SHORTER, BUT NEVER UNDER 0.3 SECONDS."); the sim
    // keeps both (pinned here). Y7b2 (the flip): TWIN TRIGGER's load-time cut left (no windowTime; pairBonus 30/60/95), so
    // ★3's sentences are its pair bonus and PAIR's (was at("twintrigger", 3)[2] "ITS LOAD TIME IS SHORTER, DOWN TO A
    // FLOOR." and [0.55, 0.3]); LOAD_FLOOR stays exported
    expect(at("twintrigger", 3)).toEqual(["PAIRED LOADS IN THIS TURRET DEAL 95% MORE DAMAGE.", S.pair]);
    expect([effectAt("twintrigger", 3).mod!.windowTime, LOAD_FLOOR]).toEqual([undefined, 0.3]);
    // NUM-1: was 4, 2.2, 17.6. Y7b2 (the flip): no cap (was "..., UP TO 176 DAMAGE.")
    expect(at("spallcatcher", 2)[0]).toBe("EVERY 40 DAMAGE YOUR SHIP TAKES ADDS 22 DAMAGE TO THIS TURRET'S NEXT SHOT.");
    // NUM-1: was 1, 0.2. Y7b2 (the flip): a lone load rolls none (was "..., AND ANY OTHER LOAD ROLLS 2.")
    expect(at("seamwelder")[0]).toBe("EACH PAIR THIS TURRET TAKES ROLLS 10 SHIELD ONTO YOUR HULL.");
    // the next-star lines DESIGN 3.3 gives
    // HULL-ON (the flip, GUARD; cap's ruling 6f4568477e66a600): 11 / 17 -> 33 / 51, GUARD's PLATE ROLLER; it read 11 / 17
    // before only because a wave-3 toggle wrote the base def back. 11 / 17 with GUARD off (NUM-1: was 1.1, 1.7)
    expect([1, 2].map((s) => nextStarText("plateroller", s))).toEqual(["NEXT STAR: ROLLS 33 SHIELD FOR EACH PAYLOAD.", "NEXT STAR: ROLLS 51 SHIELD FOR EACH PAYLOAD."]);
    expect(withGuard(() => [1, 2].map((s) => nextStarText("plateroller", s)), false)).toEqual(["NEXT STAR: ROLLS 11 SHIELD FOR EACH PAYLOAD.", "NEXT STAR: ROLLS 17 SHIELD FOR EACH PAYLOAD."]);
    // NUM-1: was 3.5, 10.5. Y7b2 (the flip): no floor (was "NEXT STAR: ADDS 35 DAMAGE, OR 105 ON A MATCHED BELT.")
    expect(nextStarText("twingauge", 2)).toBe("NEXT STAR: 105 DAMAGE ON A MATCHED BELT.");
    // Y7b2 (the flip): no plated multiplier (was "NEXT STAR: 70% SHORTER, 85% WHILE PLATED.")
    expect(nextStarText("braceframe", 1)).toBe("NEXT STAR: 70% SHORTER.");
    expect(nextStarText("stoker", 1)).toBe("NEXT STAR: ITS FACTORIES WORK 44% FASTER.");
    // NUM-1: was 8.8, 1 PLATING, 2.2; the battle spends 10 plating, the text still says 1 (a text bug, as above). Y7b2 (the
    // flip): no floor (was "NEXT STAR: 88 DAMAGE FOR 10 PLATING, 22 WITHOUT.")
    expect(nextStarText("platebreaker", 1)).toBe("NEXT STAR: 88 DAMAGE FOR 10 SHIELD.");
    expect(nextStarText("shieldwall", 1)).toBe("NEXT STAR: 22 SHIELD A PAYLOAD, 66 DAMAGE AT 120 SHIELD."); // NUM-1: was 2.2, 6.6, 12
    // NUM-2 (REQ-BFG-047): ★2 TWIN MOULD speed 19, 30 / 19 = 1.58 (was 1.6); ★2 ARMOR PRESS speed 21, 1.43 (was 1.4)
    // NUM-4 (REQ-BFG-047): AT RATE 19 and AT RATE 21, the ★2 SPEEDs (was EVERY 1.58 / 1.43 SECONDS)
    expect(nextStarText("twinmould", 1)).toBe(`NEXT STAR: 50 DAMAGE EACH, AT RATE ${spdAt("twinmould", 2)}, 3 BELTS.`); // bb-0.8.3 (M4); NUM-1: was 5
    expect(nextStarText("armorpress", 1)).toBe(`NEXT STAR: 66 SHIELD EVERY 3 SECONDS, A SLUG AT RATE ${spdAt("armorpress", 2)}, 3 BELTS.`); // 0.8.0 B1 M2; bb-0.8.3 (M4); NUM-1: was 6.6
    // 0.8.0 B1 M2. Y7b2 (the flip): plated 80% at ★2, no bare speed-up (was "NEXT STAR: 70% FASTER PLATED, 20% WITHOUT.")
    expect(nextStarText("steambreech", 1)).toBe("NEXT STAR: 80% FASTER SHIELDED.");
    // NUM-4 (REQ-BFG-047; N1 2.2): ★2's -0.4 s is a hidden timer (pinned here), SHORTER LOAD TIME (was "LOAD TIME 0.4
    // SECONDS SHORTER"). Y7b2 (the flip): pairBonus 60% at ★2 and no load-time cut (was "NEXT STAR: PAIRS DEAL 55% MORE,
    // SHORTER LOAD TIME." and -windowTime 0.4)
    expect(nextStarText("twintrigger", 1)).toBe("NEXT STAR: PAIRS DEAL 60% MORE.");
    expect(effectAt("twintrigger", 2).mod!.windowTime).toBeUndefined();
    // NUM-1: was 2.2, 0.4. Y7b2 (the flip): no lone load's plating (was "NEXT STAR: 22 PLATING A PAIR, 4 FOR ANY OTHER LOAD.")
    expect(nextStarText("seamwelder", 1)).toBe("NEXT STAR: 22 SHIELD A PAIR.");
  });

  it("T1: each opens with one plain sentence; T4: every entry a whole sentence, the perk this star's", () => {
    for (const { d, s, k, id } of W3_CASES) {
      const at = abilityText(d.id, s, { k }), first = at.sentences[0];
      expect(first, id).toMatch(/^[A-Z][A-Z0-9 ,:;'%()★.+-]*\.$/);
      expect(first.split(" ").length, id).toBeGreaterThanOrEqual(3);
      expect(first.slice(0, -1), id).not.toMatch(/\.\s/);
      for (const t of at.sentences) expect(t, id).toMatch(/^[A-Z0-9][^\n·]*\.$/);
      if (at.perk) {
        expect([at.perk.name, at.perk.stars], id).toEqual([perkAt(d.id, s), s]);
        expect(at.perk.after, id).toBeLessThan(at.sentences.length);
      } else expect(s === 1 || !perkAt(d.id, s), id).toBe(true);
    }
  });

  it("T2: no banned shorthand in any sentence, clause, next star, headline, MERGES WITH or card line", () => {
    withWave3(() => {
      for (const { d, s, k, id } of W3_CASES) {
        const texts = [
          ...abilityText(d.id, s, { k }).sentences, gist(d.id, s, { k }), nextStarText(d.id, s, { k }) ?? "",
          nextStarHeadline(d.id, s, { k }) ?? "", s > 1 ? mergesWithText(d.id, s, { k }) : "", s === 1 ? cardText(d.id, { k }) : "",
        ];
        for (const t of texts) expect(banned(t), `${id}: ${t}`).toEqual([]);
      }
    });
  });

  it("T4: wrapped by the one helper, every line fits the desk column and the phone band; a number keeps its unit", () => {
    for (const { d, s, k, id } of W3_CASES) {
      const at = abilityText(d.id, s, { k });
      at.sentences.forEach((t, i) => {
        const spans: Span[] = [...colourize(t, C.bone), ...(at.perk?.after === i ? [{ t: " ", c: C.bone }, { t: `★${s} ${at.perk.name}`, c: C.brass3, whole: true }] : [])];
        for (const [w, font] of WIDTHS) {
          const lines = wrapRich(spans, w, font).map(lineText);
          lines.forEach((ln, j) => {
            expect(textWidth(ln, font), `${id} at ${w} (${font}): ${ln}`).toBeLessThanOrEqual(w);
            const next = lines[j + 1]?.split(" ")[0];
            if (next !== undefined && /(^|\s)\(?[+-]?\d+(\.\d+)?%?$/.test(ln)) expect(FUNCTION_WORDS.has(next), `${id}: "${ln}" / "${next}"`).toBe(true);
          });
        }
      });
    }
  });

  it("T5: NEXT STAR at ★1 and ★2 is the next star's clause, its numbers that star's; none at ★3", () => {
    for (const { d, s, k, id } of W3_CASES) {
      const next = nextStarText(d.id, s, { k });
      if (s >= 3) expect(next, id).toBeNull();
      else {
        // bb-0.8.3 (REQ-BFG-042 M4): a factory's next-star line closes with its belt slots at that star
        const belts = d.kind === "factory" ? `, ${outputsAt(d.id, s + 1)} BELTS` : "";
        expect(next, id).toBe(`NEXT STAR: ${gist(d.id, s + 1, { k })}${belts}.`);
        expect(numbers(next!).every((n) => numbers(abilityText(d.id, s + 1, { k }).sentences.join(" ")).includes(n) || n === s + 1 || (!!belts && n === outputsAt(d.id, s + 1))), id).toBe(true);
      }
    }
    // NUM-2 (REQ-BFG-047; was EVERY 1.4 SECONDS): ★3 speed 21, 30 / 21 = 1.43
    // NUM-4 (REQ-BFG-047): AT RATE 21, the ★3 SPEED (was EVERY 1.43 SECONDS)
    expect(withWave3(() => mergesWithText("twinmould", 3))).toBe(`MERGES WITH YOUR TWIN MOULD INTO ★3: 3 SLUGS OF 60 DAMAGE, AT RATE ${effectAt("twinmould", 3).factory!.speed}, 4 BELTS.`); // bb-0.8.3 (M4); NUM-1: x10 (was 6)
  });

  it("each offer's one-line effect: a whole sentence, its numbers from the 1-star text, two lines on the wide card", () => {
    const cards = Object.fromEntries(W3.map((d) => [d.id, cardText(d.id)]));
    // Y7b2 (the flip): TWIN GAUGE's and PINCER's floors left (were "MORE DAMAGE ON A MATCHED BELT." and "MORE DAMAGE WITH
    // RIGS ON ITS TILE."); TWIN TRIGGER's pair bonus is 30% at ★1 (was "PAIRS HIT 25% HARDER.")
    expect(cards).toEqual({
      // WORDS-1 (REQ-BFG-081): TWIN GAUGE's card in plain words (was "DAMAGE ON A MATCHED BELT.")
      plateroller: "SHIELDS YOUR HULL AS SLUGS PASS.", twingauge: "DAMAGE IF ANOTHER BELT IS AS LONG.", pincer: "DAMAGE FOR OTHER RIGS HITTING IT.", /* CARD-3 (REQ-BFG-081, D3) */
      // NUM-4 (REVIEW-NUM3 F2): one word for one stop, STUNS (was "SHORTER STALLS ON ITS TILES.")
      // CARD-2 (REQ-BFG-081, K3 g; READ-2 7.3 item 4): TWIN LATCH's desk line says what it does (was "LETS TWO BELTS GO TOGETHER.")
      braceframe: "SHORTER STUNS ON TILES IT HITS.", twinlatch: "HOLDS A SLUG TO PAIR TWO BELTS.", stoker: "MAKES FACTORIES WORK FASTER.",
      platebreaker: "TURNS SHIELD INTO DAMAGE.", shieldwall: "ADDS SHIELD, HITS HARDER.", twinmould: "CASTS TWO SLUGS AT ONCE.", // CARD-3 (REQ-BFG-107): the words
      armorpress: "SHIELDS YOUR HULL EVERY 3 SECONDS.", anvil: "MORE DAMAGE THE MORE SHIELD.", steambreech: "FIRES FASTER WHILE SHIELDED.",
      twintrigger: "PAIRS HIT 30% HARDER.", spallcatcher: "HITS YOU TAKE CHARGE ITS SHOT.", seamwelder: "PAIRS SHIELD YOUR HULL.",
    });
    for (const d of W3) for (const k of kOf(d)) {
      const card = cardText(d.id, { k }), id = `${d.id} k${k}: ${card}`;
      expect(card, id).toMatch(/^[A-Z0-9][^\n·]*\.$/);
      expect(banned(card), id).toEqual([]);
      const pool = numbers(abilityText(d.id, 1, { k }).sentences.join(" "));
      for (const n of numbers(card)) expect(pool, id).toContain(n);
      for (let W = 430; W <= 480; W++) {
        const w = wideCardW(W, 5), ls = cardEffectLines(card, w);
        expect(ls.length, `${id} at card ${w}`).toBeLessThanOrEqual(CARD_EFFECT_LINES);
        for (const l of ls) expect(lineWidth(l, "3"), `${id} at card ${w}: ${lineText(l)}`).toBeLessThanOrEqual(cardEffectWidth(w));
      }
      // the hover tooltip shows the opening sentence, wrapped by the same helper
      const first = abilityText(d.id, 1, { k }).sentences[0], tl = tooltipLines(first);
      expect(tl.map(lineText).join(" "), id).toBe(first);
      for (const l of tl) expect(lineWidth(l, "3"), id).toBeLessThanOrEqual(TOOLTIP_TEXT_W);
    }
  });

  // Y7b2 (the flip): retitled, was "TWIN TRIGGER on a GATLING SPOOL or a COMPOUND BREECH: its shorter load time does nothing
  // there, its pair bonus still works". TWIN TRIGGER's load-time cut and HOPPER's load time left, so neither has a clash
  it("TWIN TRIGGER on a GATLING SPOOL or a COMPOUND BREECH: no clash (its load-time cut left; its pair bonus works there)", () => {
    // Y7b2 (the flip): null, each (were "GATLING SPOOL: THE TWIN TRIGGER'S SHORTER LOAD TIME DOES NOTHING HERE, BUT PAIRS
    // STILL HIT HARDER." and "COMPOUND BREECH: THE TWIN TRIGGER'S SHORTER LOAD TIME DOES NOTHING HERE, BUT PAIRS STILL HIT
    // HARDER.")
    expect([gatlingClashText("twintrigger", 2, "gatling"), gatlingClashText("twintrigger", 1, "compound")]).toEqual([null, null]);
    expect([gatlingClashText("twintrigger", 1, "rotary"), clashShortText("twintrigger", "rotary")]).toEqual([null, null]);
    // Y7b2 (the flip): null (was "TWIN TRIGGER: ITS SHORTER LOAD TIME DOES NOTHING HERE.")
    expect(clashShortText("twintrigger")).toBeNull();
    // and the older gear's lines are as they were. Y7b2 (the flip): HOPPER's too is gone (was "GATLING SPOOL: THE HOPPER'S
    // LONGER LOAD TIME DOES NOTHING HERE.")
    expect(gatlingClashText("hopper", 1)).toBeNull();
    for (const d of W3.filter((x) => x.id !== "twintrigger")) expect([gatlingClashText(d.id, 3), clashShortText(d.id)], d.id).toEqual([null, null]);
  });
});
