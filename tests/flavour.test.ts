import { describe, expect, it } from "vitest";
import { AMMO, ITEMS, type ItemDef } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { scaleCore } from "../src/sim/cores";
import { newRun } from "../src/game/run";
import { flavour, flavourText, STAR_FLAVOUR } from "../src/screens/build/flavour";
import { cargoPanel, itemPanel, rigPanel, type PanelText } from "../src/screens/build/inspector";
import { textWidth } from "../src/render/font";
import { wrapText } from "../src/ui/richText";
import { MODULES, STARS, banned, fasterNum, numbers, pct, r1, rateNum } from "./textRules";
import { fireLine, turretFacts } from "../src/screens/build/turretPanel"; // 0.6.2s

// 0.6.2p (item 1): star-aware flavour; 0.6.2t (REQ-BFG-032, T7): flavour is player text too. flavour() returns whole
// sentences (each ends in a full stop; no hand-made line breaks, no layout variants), with T2's units (2.75 SECONDS,
// 60% FASTER, 3 TIMES AS FAST; never 3S, 1.6X, DMG or DMG/S); the panels join them into one paragraph and the one wrap
// helper (src/ui/richText.ts) breaks it at draw time. Rule kept from the polish: the flavour shown at N stars never
// states a number or an effect that differs from that star's real values. Table-driven over every buyable fusible module
// (23 rigs, 13 factories, 13 cores, 9 mods) at 1, 2 and 3 stars; every expected number is written out here from the
// catalogue (content.ts), never with flavour.ts's templates.

const g = (e: ItemDef) => e.gate!;
const f = (e: ItemDef) => e.factory!;
const m = (e: ItemDef) => e.mod!;
const base = (e: ItemDef) => f(e).base ?? AMMO[f(e).ammo].base;

/** The audit: the numbers each module's flavour quotes at a star, in reading order, read from that star's spec. */
const NUMBERS: Record<string, (e: ItemDef, k: number) => number[]> = {
  // rigs
  temper: (e) => [g(e).burn!, 1, 3], // BURN: 1 DAMAGE A SECOND FOR 3 SECONDS (BURN_TIME)
  whetstone: (e) => [g(e).flat!],
  grease: (e) => [fasterNum(g(e).speed!), g(e).lockedFlat!],
  brake: (e) => [g(e).lockedFlat!], // HALF SPEED: speed 0.5 at every star (checked below)
  longhaul: (e) => (g(e).priorCap === undefined ? [g(e).perPriorGate!] : [g(e).perPriorGate!, g(e).priorCap!]),
  coil: () => [],
  splitter: (e) => [g(e).split!.copies, pct(g(e).split!.mult)],
  overdrive: (e) => [4, fasterNum(g(e).speed!), g(e).lockedFlat!], // 4 ARROWS: the X shape
  tollbooth: (e) => [g(e).toll!],
  sifter: () => [],
  surge: (e) => [fasterNum(g(e).pulse!.speed), g(e).pulse!.on, g(e).pulse!.period, g(e).lockedFlat!],
  sorting: (e) => (g(e).sort!.copies > 2 ? [g(e).sort!.copies - 1] : []), // EVERY THIRD / OTHER: checked in the pins
  riveter: (e) => [g(e).repair!],
  heatjacket: (e) => [g(e).heat!],
  venom: (e) => [g(e).poison!],
  overclocker: (e) => [g(e).overclockCooldown!],
  keg: (e) => [g(e).keg!.fuse, g(e).keg!.flat, g(e).keg!.burn],
  bellows: (e) => [g(e).burnPerRide!.max],
  quench: (e) => [g(e).quench!.flat, g(e).quench!.stacks, g(e).quench!.perBurn], // FB-B: +flat, then up to `stacks` Burn
  staticbrush: () => [],
  lodestone: (e) => [g(e).perStalled!.each],
  barbed: (e) => [g(e).fray!, 0.2], // +0.2 DAMAGE FOR EACH STACK: FRAY_BONUS
  counterweight: (e) => [r1(g(e).perTile!.each), g(e).perTile!.max], // T3: damage at one decimal (★3's 1.75 reads 1.8)
  // factories
  press: (e) => (f(e).base === undefined ? [f(e).interval] : [base(e), f(e).interval]),
  doublestamp: (e) => (f(e).base === undefined ? [f(e).batch!, f(e).interval] : [f(e).batch!, base(e), f(e).interval]),
  shottower: (e) => [f(e).batch!, base(e), f(e).interval, 1], // RIGS HIT EACH ONE.
  hotswap: (e) => [f(e).cycle!.find((p) => p.tint === "ember")!.burn!],
  slagpot: (e) => [base(e)],
  assembly: () => [], // IN HALF THE TIME, IN A QUARTER OF THE TIME, AT ONCE: checked in the pins
  gantry: (e) => [1, f(e).outputs, f(e).outputs], // ONE PRESS
  scrapper: (e) => [f(e).interval],
  sabot: () => [],
  frostbite: () => [],
  dragchain: () => [],
  mimic: (e) => (f(e).outputs > 1 ? [f(e).outputs] : []), // A SECOND ROUTE, then TWO MORE ROUTES
  limpet: (e) => [(f(e).round as { delay: number }).delay],
  // turret cores (their absolute numbers x the class factor k, as scaleCore)
  scatter: (e, k) => [scaleCore(e.core!, k).pellets!, pct(scaleCore(e.core!, k).share!)],
  rotary: (e, k) => [scaleCore(e.core!, k).windowTime!],
  pressure: (e, k) => [r1(scaleCore(e.core!, k).perQueued!)],
  gatling: (e, k) => [pct(scaleCore(e.core!, k).step!), pct(scaleCore(e.core!, k).floor!)],
  hullbreaker: (e, k) => [pct(scaleCore(e.core!, k).hullMul! - 1)],
  drake: (e, k) => [scaleCore(e.core!, k).burnTime!, 3], // NOT 3 SECONDS: BURN_TIME
  salvo: (e, k) => [r1(scaleCore(e.core!, k).volleyFlat!)],
  mortar: (e, k) => [scaleCore(e.core!, k).flightMul!, scaleCore(e.core!, k).splash!, pct(scaleCore(e.core!, k).share!)],
  grapnel: (e, k) => (scaleCore(e.core!, k).rip! > 1 ? [scaleCore(e.core!, k).rip!] : []), // THE NEAREST ENEMY SLUG at 1
  tesla: (e, k) => {
    const c = scaleCore(e.core!, k);
    return [...(c.arcs! > 1 ? [c.arcs!] : []), pct(c.share!), c.stall!];
  },
  capacitor: (e, k) => [r1(scaleCore(e.core!, k).perSecond!), scaleCore(e.core!, k).maxSeconds!],
  compound: (e, k) => [2, 1, pct(scaleCore(e.core!, k).mult!)], // PACKS TWO LOADS INTO ONE SHELL
  lance: (e, k) => [scaleCore(e.core!, k).columns!],
  // turret gear
  chamber: (e) => [m(e).perShot!],
  calibrate: (e) => [rateNum(m(e).fireMul!)], // the rate, 1 / fireMul: x0.75 fires 33% faster (the desc said 25%)
  flak: (e) => [pct(m(e).intercept!)],
  spotter: () => [],
  hopper: (e) => [m(e).window!, m(e).windowTime!, ...(m(e).store ? [m(e).store!] : [])], // FB-B: ★2/★3 store 1/2
  mantlet: () => [],
  ram: (e) => [pct(m(e).finisher!)],
  escapement: (e) => [rateNum(m(e).fireMul!), 1.2, 7], // PEAK_SHIFT and its 7 TILES
  longcase: (e) => [m(e).longRideFlat!, m(e).longRideMin!, 1.2],
};

/** Modules without a template: their catalogue desc, joined into one string, shows at every star. */
const UNCHANGED = ["coil", "staticbrush", "sabot", "frostbite", "dragchain", "mantlet"];

/** The pins, heavy scale (k 1): each templated module's flavour paragraph at ★1, ★2 and ★3. */
const PINS: Record<string, [string, string, string]> = {
  press: [
    "STAMPS PLAIN SLUGS EVERY 1.4 SECONDS. NEEDS A FREE TURRET INTAKE.",
    "STAMPS 5 DAMAGE SLUGS EVERY 1.1 SECONDS. NEEDS A FREE TURRET INTAKE.",
    "STAMPS 7.5 DAMAGE SLUGS EVERY 1 SECOND. NEEDS A FREE TURRET INTAKE.",
  ],
  doublestamp: [
    "STAMPS TWO PLAIN SLUGS EVERY 2.2 SECONDS. QUEUE PRESSURE.",
    "STAMPS TWO SLUGS OF 5 DAMAGE EVERY 1.6 SECONDS. QUEUE PRESSURE.",
    "STAMPS THREE SLUGS OF 5 DAMAGE EVERY 1.6 SECONDS. QUEUE PRESSURE.",
  ],
  shottower: [
    "DROPS 3 BUCKSHOT (1 DAMAGE) EVERY 1.5 SECONDS. RIGS HIT EACH ONE.",
    "DROPS 3 BUCKSHOT (2 DAMAGE) EVERY 1.35 SECONDS. RIGS HIT EACH ONE.",
    "DROPS 3 BUCKSHOT (3 DAMAGE) EVERY 1.3 SECONDS. RIGS HIT EACH ONE.",
  ],
  hotswap: [
    "ALTERNATES EMBER SLUGS (2 BURN) AND SPARK SLUGS (SHOCK).",
    "ALTERNATES EMBER SLUGS (4 BURN) AND SPARK SLUGS (SHOCK).",
    "ALTERNATES EMBER SLUGS (7 BURN) AND SPARK SLUGS (SHOCK).",
  ],
  slagpot: [
    "HEAVY SLAG SLUGS (7 DAMAGE) THAT IGNORE BELT SPEED RIGS.",
    "HEAVY SLAG SLUGS (12 DAMAGE) THAT IGNORE BELT SPEED RIGS.",
    "HEAVY SLAG SLUGS (15 DAMAGE) THAT IGNORE BELT SPEED RIGS.",
  ],
  assembly: [
    "SLOW PLAIN SLUGS, AND ALL YOUR RIGS COME ONLINE IN HALF THE TIME.",
    "SLOW PLAIN SLUGS, AND ALL YOUR RIGS COME ONLINE IN A QUARTER OF THE TIME.",
    "SLOW PLAIN SLUGS, AND ALL YOUR RIGS COME ONLINE AT ONCE.",
  ],
  gantry: [
    "ONE PRESS, TWO OUTPUTS: FEEDS TWO INTAKES BY TURNS.",
    "ONE PRESS, THREE OUTPUTS: FEEDS THREE INTAKES BY TURNS.",
    "ONE PRESS, THREE OUTPUTS: FEEDS THREE INTAKES BY TURNS.",
  ],
  scrapper: [
    "STAMPS SCRAP SLUGS WHEN HARASSMENT HITS THE FOE, AND EVERY 3 SECONDS.",
    "STAMPS SCRAP SLUGS WHEN HARASSMENT HITS THE FOE, AND EVERY 2.5 SECONDS.",
    "STAMPS SCRAP SLUGS WHEN HARASSMENT HITS THE FOE, AND EVERY 2 SECONDS.",
  ],
  mimic: [
    "STAMPS YOUR HERO'S SIGNATURE AMMO INTO A SECOND ROUTE.",
    "STAMPS YOUR HERO'S SIGNATURE AMMO INTO A SECOND ROUTE.",
    "STAMPS YOUR HERO'S SIGNATURE AMMO INTO TWO MORE ROUTES.",
  ],
  limpet: [
    "STICKY CHARGES BLOW 3 SECONDS LATER FOR HULL DAMAGE.",
    "STICKY CHARGES BLOW 3 SECONDS LATER FOR HULL DAMAGE AND A STALL.",
    "STICKY CHARGES BLOW 3 SECONDS LATER FOR HULL DAMAGE AND A STALL.",
  ],
  temper: [
    "ADDS 2 BURN. EACH BURN STACK DEALS 1 DAMAGE A SECOND FOR 3 SECONDS AFTER THE HIT.",
    "ADDS 4 BURN. EACH BURN STACK DEALS 1 DAMAGE A SECOND FOR 3 SECONDS AFTER THE HIT.",
    "ADDS 7 BURN. EACH BURN STACK DEALS 1 DAMAGE A SECOND FOR 3 SECONDS AFTER THE HIT.",
  ],
  whetstone: [
    "+2 DAMAGE. BEFORE A SPLITTER, BOTH COPIES GAIN IT.",
    "+4 DAMAGE. BEFORE A SPLITTER, BOTH COPIES GAIN IT.",
    "+7 DAMAGE. BEFORE A SPLITTER, BOTH COPIES GAIN IT.",
  ],
  grease: [
    "THE BELT RUNS 60% FASTER FROM ITS HIT. METRONOME'S LOCKED BELTS GAIN +1 DAMAGE.",
    "THE BELT RUNS 2.3 TIMES AS FAST FROM ITS HIT. METRONOME'S LOCKED BELTS GAIN +2 DAMAGE.",
    "THE BELT RUNS 3.1 TIMES AS FAST FROM ITS HIT. METRONOME'S LOCKED BELTS GAIN +4 DAMAGE.",
  ],
  brake: [
    "HALF SPEED FROM ITS HIT. METRONOME'S LOCKED BELTS GAIN +2 DAMAGE INSTEAD.",
    "HALF SPEED FROM ITS HIT. METRONOME'S LOCKED BELTS GAIN +4 DAMAGE INSTEAD.",
    "HALF SPEED FROM ITS HIT. METRONOME'S LOCKED BELTS GAIN +7 DAMAGE INSTEAD.",
  ],
  longhaul: [
    "+2 DAMAGE FOR EACH HIT THE PAYLOAD ALREADY TOOK.",
    "+4 DAMAGE FOR EACH EARLIER HIT, UP TO 6 HITS.",
    "+7 DAMAGE FOR EACH EARLIER HIT, UP TO 6 HITS.",
  ],
  splitter: [
    "SPLITS A PAYLOAD IN TWO COPIES AT 60%. MORE BELT PRESSURE.",
    "SPLITS A PAYLOAD IN TWO COPIES AT 72%. MORE BELT PRESSURE.",
    "SPLITS A PAYLOAD IN TWO COPIES AT 85%. MORE BELT PRESSURE.",
  ],
  overdrive: [
    "4 ARROWS: THE BELT RUNS 3 TIMES AS FAST FROM ITS HIT. METRONOME'S LOCKED BELTS GAIN +3 DAMAGE.",
    "4 ARROWS: THE BELT RUNS 4 TIMES AS FAST FROM ITS HIT. METRONOME'S LOCKED BELTS GAIN +6 DAMAGE.",
    "4 ARROWS: THE BELT RUNS 5 TIMES AS FAST FROM ITS HIT. METRONOME'S LOCKED BELTS GAIN +11 DAMAGE.",
  ],
  tollbooth: [
    "GUARDS ITS BELT FROM THE FIRST 2 HARASSMENT HITS.",
    "GUARDS ITS BELT FROM THE FIRST 4 HARASSMENT HITS.",
    "GUARDS ITS BELT FROM THE FIRST 7 HARASSMENT HITS.",
  ],
  sifter: [
    "REMOVES CHILL OR SNAG FROM PASSING PAYLOADS IN ORDER.",
    "REMOVES CHILL AND SNAG FROM EVERY PASSING PAYLOAD.",
    "REMOVES CHILL AND SNAG FROM EVERY PASSING PAYLOAD.",
  ],
  surge: [
    "PULSES 3 TIMES AS FAST FOR 1 SECOND EVERY 3 SECONDS. METRONOME'S LOCKED BELTS GAIN +3 DAMAGE.",
    "PULSES 4 TIMES AS FAST FOR 1 SECOND EVERY 2.5 SECONDS. METRONOME'S LOCKED BELTS GAIN +6 DAMAGE.",
    "PULSES 5 TIMES AS FAST FOR 1 SECOND EVERY 2 SECONDS. METRONOME'S LOCKED BELTS GAIN +10 DAMAGE.",
  ],
  sorting: [
    "COPIES EVERY THIRD PAYLOAD AT FULL STRENGTH.",
    "COPIES EVERY OTHER PAYLOAD AT FULL STRENGTH.",
    "COPIES EVERY OTHER PAYLOAD TWICE AT FULL STRENGTH.",
  ],
  riveter: [
    "EACH PASSING SLUG REPAIRS YOUR HULL BY 0.6.",
    "EACH PASSING SLUG REPAIRS YOUR HULL BY 1.3.",
    "EACH PASSING SLUG REPAIRS YOUR HULL BY 2.1.",
  ],
  heatjacket: [
    "+0.4 DAMAGE FOR EACH SECOND RIDDEN AFTER THIS RIG.",
    "+0.9 DAMAGE FOR EACH SECOND RIDDEN AFTER THIS RIG.",
    "+1.4 DAMAGE FOR EACH SECOND RIDDEN AFTER THIS RIG.",
  ],
  venom: [
    "ADDS 2 POISON. THE POOL TICKS AND REFRESHES ON HIT.",
    "ADDS 4 POISON. THE POOL TICKS AND REFRESHES ON HIT.",
    "ADDS 7 POISON. THE POOL TICKS AND REFRESHES ON HIT.",
  ],
  overclocker: [
    "DOUBLES THE NEXT RIG ONCE, THEN COOLS FOR 4 SECONDS.",
    "DOUBLES THE NEXT RIG ONCE, THEN COOLS FOR 1.8 SECONDS.",
    "DOUBLES THE NEXT RIG ONCE, THEN COOLS FOR 1.15 SECONDS.",
  ],
  keg: [
    "BLOWS AFTER 12 SECONDS: PAYLOADS ON ITS BELT GAIN +6 DAMAGE AND 1 BURN.",
    "BLOWS AFTER 10 SECONDS: PAYLOADS ON ITS BELT GAIN +13 DAMAGE AND 2 BURN.",
    "BLOWS AFTER 8 SECONDS: ALL BELTS BESIDE IT GAIN +21 DAMAGE AND 3 BURN.",
  ],
  bellows: [
    "ADDS BURN FROM RIDE TIME SO FAR, UP TO 4 STACKS.",
    "ADDS BURN FROM RIDE TIME SO FAR, UP TO 9 STACKS.",
    "ADDS BURN FROM RIDE TIME SO FAR, UP TO 14 STACKS.",
  ],
  quench: [
    "TURNS BURN STACKS INTO +2 DAMAGE EACH, UP TO +12 DAMAGE.",
    "TURNS BURN STACKS INTO +4 DAMAGE EACH, UP TO +26 DAMAGE.",
    "TURNS BURN STACKS INTO +6 DAMAGE EACH, UP TO +42 DAMAGE.",
  ],
  lodestone: [
    "+1 DAMAGE FOR EACH ENEMY MACHINE STALLED RIGHT NOW.",
    "+2.2 DAMAGE FOR EACH ENEMY MACHINE STALLED RIGHT NOW.",
    "+3.5 DAMAGE FOR EACH ENEMY MACHINE STALLED RIGHT NOW.",
  ],
  barbed: [
    "HITS ADD 1 FRAY. LATER HITS DEAL +0.2 DAMAGE FOR EACH STACK.",
    "HITS ADD 2 FRAY. LATER HITS DEAL +0.2 DAMAGE FOR EACH STACK.",
    "HITS ADD 3 FRAY. LATER HITS DEAL +0.2 DAMAGE FOR EACH STACK.",
  ],
  counterweight: [
    "+0.5 DAMAGE FOR EACH BELT TILE ALREADY RIDDEN, UP TO +6 DAMAGE.",
    "+1.1 DAMAGE FOR EACH BELT TILE ALREADY RIDDEN, UP TO +13 DAMAGE.",
    "+1.8 DAMAGE FOR EACH BELT TILE ALREADY RIDDEN, UP TO +21 DAMAGE.",
  ],
  chamber: [
    "TURRET FIRES TWO PAYLOADS EACH SHOT. DROP ON A TURRET.",
    "TURRET FIRES TWO PAYLOADS EACH SHOT. DROP ON A TURRET.",
    "TURRET FIRES THREE PAYLOADS EACH SHOT. DROP ON A TURRET.",
  ],
  calibrate: [
    "TURRET FIRES 33% FASTER. DROP ON A TURRET.",
    "TURRET FIRES 72% FASTER. DROP ON A TURRET.",
    "TURRET FIRES 2.2 TIMES AS FAST. DROP ON A TURRET.",
  ],
  flak: [
    "INTERCEPTS 25% OF INCOMING HARASSMENT ROUNDS SIDE-WIDE.",
    "INTERCEPTS 55% OF INCOMING HARASSMENT ROUNDS SIDE-WIDE.",
    "INTERCEPTS 85% OF INCOMING HARASSMENT ROUNDS SIDE-WIDE.",
  ],
  spotter: [
    "TURRET REROLLS A BARE-HULL TARGET TOWARD MACHINERY.",
    "TURRET REROLLS BARE-HULL TARGETS TOWARD MACHINERY.",
    "TURRET AIMS AT MACHINERY ONLY, NEVER BARE HULL.",
  ],
  hopper: [
    "CHAMBER HOLDS 1 MORE LOAD AND WAITS 0.5 SECONDS LONGER.",
    "CHAMBER HOLDS 2 MORE LOADS AND WAITS 1 SECOND LONGER.",
    "CHAMBER HOLDS 3 MORE LOADS AND WAITS 1.5 SECONDS LONGER.",
  ],
  ram: [
    "THE LAST PAYLOAD OUT OF THE CHAMBER HITS 40% HARDER.",
    "THE LAST PAYLOAD OUT OF THE CHAMBER HITS 88% HARDER.",
    "THE LAST PAYLOAD OUT OF THE CHAMBER HITS 140% HARDER.",
  ],
  scatter: [
    "SHOTS BURST INTO 3 PELLETS AT 40%, EACH AIMED ANEW.",
    "SHOTS BURST INTO 3 PELLETS AT 48%, EACH AIMED ANEW.",
    "SHOTS BURST INTO 4 PELLETS AT 42%, EACH AIMED ANEW.",
  ],
  rotary: [
    "FIRES THE OLDEST LOAD FIRST. LOADING CLOSES IN 0.8 SECONDS.",
    "FIRES THE OLDEST LOAD FIRST. LOADING CLOSES IN 0.8 SECONDS.",
    "FIRES THE OLDEST LOAD FIRST. LOADING CLOSES IN 0.8 SECONDS.",
  ],
  pressure: [
    "+1.2 DAMAGE FOR EACH PAYLOAD QUEUED AT IT. NEVER JAMS.",
    "+2.6 DAMAGE FOR EACH PAYLOAD QUEUED AT IT. NEVER JAMS.",
    "+4.2 DAMAGE FOR EACH PAYLOAD QUEUED AT IT. NEVER JAMS.",
  ],
  gatling: [
    "NEVER WAITS: FIRES EACH LOAD AT ONCE. EACH QUICK SHOT TRIMS 6% OFF THE RELOAD, DOWN TO 60%.",
    "NEVER WAITS: FIRES EACH LOAD AT ONCE. EACH QUICK SHOT TRIMS 9% OFF THE RELOAD, DOWN TO 40%.",
    "NEVER WAITS: FIRES EACH LOAD AT ONCE. EACH QUICK SHOT TRIMS 12% OFF THE RELOAD, DOWN TO 29%.",
  ],
  hullbreaker: [
    "NEVER HITS MACHINES. EVERY HULL HIT DEALS +30%.",
    "NEVER HITS MACHINES. EVERY HULL HIT DEALS +66%.",
    "NEVER HITS MACHINES. EVERY HULL HIT DEALS +105%.",
  ],
  drake: [
    "TURNS BONUS DAMAGE INTO BURN. ITS FIRES BURN FOR 4 SECONDS, NOT 3 SECONDS.",
    "TURNS BONUS DAMAGE INTO BURN. ITS FIRES BURN FOR 5 SECONDS, NOT 3 SECONDS.",
    "TURNS BONUS DAMAGE INTO BURN. ITS FIRES BURN FOR 6 SECONDS, NOT 3 SECONDS.",
  ],
  salvo: [
    "WAITS FOR A FULL CHAMBER, THEN FIRES IT ALL AT +2 DAMAGE EACH.",
    "WAITS FOR A FULL CHAMBER, THEN FIRES IT ALL AT +4.4 DAMAGE EACH.",
    "WAITS FOR A FULL CHAMBER, THEN FIRES IT ALL AT +7 DAMAGE EACH.",
  ],
  mortar: [
    "LOBS FLY 2.2 TIMES AS LONG AND SPLASH ONE MORE TARGET AT 50%.",
    "LOBS FLY 2.2 TIMES AS LONG AND SPLASH TWO MORE TARGETS, EACH AT 55%.",
    "LOBS FLY 2.2 TIMES AS LONG AND SPLASH THREE MORE TARGETS, EACH AT 58%.",
  ],
  grapnel: [
    "BELT HITS RIP THE NEAREST ENEMY SLUG OFF THAT ROUTE.",
    "BELT HITS RIP THE 2 NEAREST ENEMY SLUGS OFF IT.",
    "BELT HITS RIP THE 3 NEAREST ENEMY SLUGS OFF IT.",
  ],
  tesla: [
    "HITS ARC TO THE NEAREST MACHINE FOR 25% AND STALL IT FOR 0.8 SECONDS.",
    "HITS ARC TO THE 2 NEAREST MACHINES FOR 25% AND STALL THEM FOR 0.9 SECONDS.",
    "HITS ARC TO THE 3 NEAREST MACHINES FOR 30% AND STALL THEM FOR 0.93 SECONDS.",
  ],
  capacitor: [
    "IDLE TIME CHARGES THE NEXT SHOT: +2 DAMAGE A SECOND, UP TO 5 SECONDS.",
    "IDLE TIME CHARGES THE NEXT SHOT: +4.4 DAMAGE A SECOND, UP TO 5 SECONDS.",
    "IDLE TIME CHARGES THE NEXT SHOT: +7 DAMAGE A SECOND, UP TO 5 SECONDS.",
  ],
  compound: [
    "PACKS TWO LOADS INTO ONE SHELL AT 115% TOTAL DAMAGE.",
    "PACKS TWO LOADS INTO ONE SHELL AT 133% TOTAL DAMAGE.",
    "PACKS TWO LOADS INTO ONE SHELL AT 152% TOTAL DAMAGE.",
  ],
  lance: [
    "HITS THE HULL AND EVERY MACHINE IN ONE DECK COLUMN.",
    "HITS THE HULL AND EVERY MACHINE IN 2 DECK COLUMNS.",
    "HITS THE HULL AND EVERY MACHINE IN 3 DECK COLUMNS.",
  ],
  escapement: [
    "FIRES 11% FASTER. PENDULUM PEAK 1.2 SECONDS EARLIER: 7 TILES.",
    "FIRES 16% FASTER. PENDULUM PEAK 1.2 SECONDS EARLIER: 7 TILES.",
    "FIRES 22% FASTER. PENDULUM PEAK 1.2 SECONDS EARLIER: 7 TILES.",
  ],
  longcase: [
    "OTHER SLUGS: +1.5 DAMAGE AFTER 2 SECONDS OF RIDE. PENDULUM PEAK 1.2 SECONDS LATER.",
    "OTHER SLUGS: +2.5 DAMAGE AFTER 2 SECONDS OF RIDE. PENDULUM PEAK 1.2 SECONDS LATER.",
    "OTHER SLUGS: +4 DAMAGE AFTER 2 SECONDS OF RIDE. PENDULUM PEAK 1.2 SECONDS LATER.",
  ],
};

/** The landscape details column's text widths (layout.ts: LAND_MIN_W to the capped column) and the phone band's. */
const WIDTHS: [number, "5" | "3"][] = [[102, "5"], [109, "5"], [116, "5"], [102, "3"], [109, "3"], [116, "3"], [151, "3"]];

describe("0.6.2t T7: the flavour audit covers every buyable fusible module", () => {
  it("23 rigs, 13 factories, 13 cores and 9 mods; each is audited (NUMBERS) and either templated (PINS) or unchanged", () => {
    const by = (kind: string) => MODULES.filter((d) => d.kind === kind).length;
    expect([by("gate"), by("factory"), by("core"), by("mod")]).toEqual([23, 13, 13, 9]);
    expect(Object.keys(NUMBERS).sort()).toEqual(MODULES.map((d) => d.id).sort());
    expect([...Object.keys(PINS), ...UNCHANGED].sort()).toEqual(MODULES.map((d) => d.id).sort());
    // CLOCKWORKS, METRONOME's signature factory, has a template too (its desc quotes a glued second); it is never sold
    expect(Object.keys(STAR_FLAVOUR).sort()).toEqual([...Object.keys(PINS), "clockworks"].sort());
  });
});

describe("0.6.2t T7: star-aware flavour in whole sentences, every module x stars 1-3", () => {
  it("pins: each templated module's flavour at ★1, ★2 and ★3 (heavy scale)", () => {
    for (const [def, pins] of Object.entries(PINS)) expect(STARS.map((s) => flavourText(def, s)), def).toEqual(pins);
  });

  it("numbers: the flavour quotes exactly that star's values (effectAt; constants as listed)", () => {
    for (const d of MODULES) for (const s of STARS) {
      expect(numbers(flavourText(d.id, s)), `${d.id} ★${s}`).toEqual(NUMBERS[d.id](effectAt(d.id, s), 1));
    }
  });

  it("a turret core's absolute numbers follow the turret's class factor, as its ability text does (WEAVER, k 0.55)", () => {
    for (const d of MODULES.filter((x) => x.kind === "core")) for (const s of STARS) {
      expect(numbers(flavourText(d.id, s, 0.55)), `${d.id} ★${s}`).toEqual(NUMBERS[d.id](effectAt(d.id, s), 0.55));
    }
    // written out: PRESSURE 1.2 / 2.6 / 4.2 x 0.55
    expect(STARS.map((s) => flavour("pressure", s, 0.55)[0])).toEqual([
      "+0.7 DAMAGE FOR EACH PAYLOAD QUEUED AT IT.", "+1.4 DAMAGE FOR EACH PAYLOAD QUEUED AT IT.", "+2.3 DAMAGE FOR EACH PAYLOAD QUEUED AT IT.",
    ]);
  });

  it("every entry is a whole sentence with T2's units: a full stop at the end, no line break, no banned shorthand", () => {
    for (const d of MODULES) for (const s of STARS) for (const k of [1, 0.55]) {
      const fl = flavour(d.id, s, k);
      expect(fl.length, d.id).toBeGreaterThan(0);
      for (const sentence of fl) {
        expect(sentence, `${d.id} ★${s}: ${sentence}`).toMatch(/^[A-Z0-9+"'(][^\n]*\.$/);
        expect(banned(sentence), `${d.id} ★${s}: ${sentence}`).toEqual([]);
      }
    }
  });

  it("unchanged modules show their catalogue desc, joined into one string, at every star", () => {
    for (const id of UNCHANGED) for (const s of STARS) expect(flavour(id, s), `${id} ★${s}`).toEqual([ITEMS[id].desc.join(" ")]);
    expect(STARS.map((s) => effectAt("brake", s).gate!.speed)).toEqual([0.5, 0.5, 0.5]); // HALF SPEED
  });

  it("0b.1: LIMPET WORKS promises no stall at 1 star; from ★2 the flavour names the stall", () => {
    expect(flavourText("limpet", 1)).not.toMatch(/STALL/);
    expect(STARS.map((s) => (effectAt("limpet", s).factory!.round as { stall?: number }).stall ?? 0)).toEqual([0, 1, 1.6]);
    expect([2, 3].map((s) => flavourText("limpet", s))).toEqual(Array(2).fill("STICKY CHARGES BLOW 3 SECONDS LATER FOR HULL DAMAGE AND A STALL."));
  });

  it("the effects a star replaces: SIFTER, SPOTTER, MIMIC, SORTING, POWDER KEG and LONG HAUL say what that star does", () => {
    expect(STARS.map((s) => effectAt("sifter", s).gate!.sift)).toEqual([1, "all", "all"]);
    expect(STARS.map((s) => [effectAt("spotter", s).mod!.rerolls ?? 0, !!effectAt("spotter", s).mod!.alwaysMachine])).toEqual([[1, false], [2, false], [2, true]]);
    expect(STARS.map((s) => effectAt("mimic", s).factory!.outputs)).toEqual([1, 1, 2]);
    expect(STARS.map((s) => !!effectAt("keg", s).gate!.keg!.wide)).toEqual([false, false, true]);
    expect(STARS.map((s) => effectAt("longhaul", s).gate!.priorCap)).toEqual([undefined, 6, 6]);
    expect(STARS.map((s) => effectAt("sorting", s).gate!.sort!.every)).toEqual([3, 2, 2]); // EVERY THIRD, OTHER, OTHER
  });

  it("the one wrap helper breaks every flavour paragraph to each panel width: no line wider than the width", () => {
    for (const d of MODULES) for (const s of STARS) for (const [w, font] of WIDTHS) {
      for (const line of wrapText(flavourText(d.id, s), w, font)) {
        expect(textWidth(line, font), `${d.id} ★${s} at ${w} px (${font}): ${line}`).toBeLessThanOrEqual(w);
      }
    }
  });
});

describe("0.6.2t: the panels show the flavour at the module's stars, set apart and dimmer", () => {
  const flav = (t: PanelText) => t.body.find((b) => b.role === "flavour")?.text;

  it("a placed ★3 SPLITTER's rig panel says 85%, never 60% (0.6.2p's case)", () => {
    const run = newRun("furnace", 5, "flavour");
    run.build.items.push({ uid: 10, def: "splitter", x: 3, y: 3, rot: 1, stars: 3 });
    const rp = rigPanel(run, 10)!;
    expect(flav(rp)).toBe("SPLITS A PAYLOAD IN TWO COPIES AT 85%. MORE BELT PRESSURE.");
    expect(rp.body.map((b) => b.text).join(" ")).not.toContain("60%");
  });

  it("the factory, cargo and offer panels: the flavour at that star, a core's at the hero's k", () => {
    // a placed ★2 SLAG POT
    const run = newRun("furnace", 5, "flavour");
    run.build.items.push({ uid: 20, def: "slagpot", x: 6, y: 6, stars: 2 });
    expect(flav(itemPanel(run, 20)!)).toBe("HEAVY SLAG SLUGS (12 DAMAGE) THAT IGNORE BELT SPEED RIGS.");
    // a ★2 PRESSURE BREECH in a WEAVER's cargo (k 0.55): the flavour and the ability text read the same 1.4
    const w = newRun("weaver", 5, "flavour");
    w.inventory.push({ uid: 21, def: "pressure", stars: 2 });
    const cp = cargoPanel(w, 21)!;
    expect(flav(cp)).toBe("+1.4 DAMAGE FOR EACH PAYLOAD QUEUED AT IT. NEVER JAMS.");
    expect(cp.body[0].text).toBe("SHOTS DEAL 1.4 MORE DAMAGE FOR EACH PAYLOAD WAITING, UP TO 5 PAYLOADS.");
    // a ★3 HOPPER in cargo
    w.inventory.push({ uid: 22, def: "hopper", stars: 3 });
    expect(flav(cargoPanel(w, 22)!)).toBe("CHAMBER HOLDS 3 MORE LOADS AND WAITS 1.5 SECONDS LONGER.");
  });
});

describe("0.6.2s: the 13 turrets show their desc at 1 star only; the panels quote each star's numbers", () => {
  it("every turret is fusible; flavour() is its desc; turretFacts leads with that star's fire interval and loads", () => {
    expect(TURRETS).toHaveLength(13);
    for (const t of TURRETS) {
      expect(fusible(t.id), t.id).toBe(true);
      for (const s of STARS) expect(flavour(t.id, s), `${t.id} ★${s}`).toEqual(t.desc);
      for (const s of STARS) {
        const e = effectAt(t.id, s).turret!;
        expect(turretFacts(t.id, s)[0], `${t.id} ★${s}`).toBe(fireLine(t.id, s));
        expect(numbers([fireLine(t.id, s)]), `${t.id} ★${s}`).toEqual([e.fireInterval, e.window]);
      }
    }
  });
});
