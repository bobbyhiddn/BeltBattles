import { describe, expect, it } from "vitest";
import { AMMO, ITEMS, buyableModules, type ItemDef } from "../src/sim/content";
import { effectAt, fusible } from "../src/sim/stars";
import { scaleCore } from "../src/sim/cores";
import { newRun } from "../src/game/run";
import { flavour, STAR_FLAVOUR } from "../src/screens/build/flavour";
import { body, levelLine, rigPanel, starEffectLine } from "../src/screens/build/inspector";
import { wrap } from "../src/render/font";
import { fireLine, turretFacts } from "../src/screens/build/turretPanel"; // 0.6.2s

// 0.6.2p (item 1): star-aware flavour. The inspector showed ItemDef.desc, the 1-star text, at every star (a ★3 SPLITTER
// read "★3 PERFECT CUT: 2 X 85%" over "TWO COPIES AT 60%."). Rule: the flavour shown at N stars never states a number or
// an effect that differs from that star's real values (effectAt, starEffectLine, the perk). Table-driven over every
// buyable fusible module (from the catalogue and fusible(): 23 rigs, 13 factories, 13 cores and 9 mods at 65a36b7) at
// 1, 2 and 3 stars. Every expected string and number is written out here from the catalogue (content.ts), never with
// flavour.ts's templates.

// 0.6.2s (REQ-BFG-031): the 13 turrets are fusible modules too, but no panel shows a turret's desc beyond a 1-star
// offer: the shop tooltip (chrome.ts) quotes flavour(def, 1), and every turret panel (offer, cargo, installed;
// turretPanel.ts turretFacts) prints that copy's own fire interval and loads. Their desc stays the 1-star text; the
// turret block at the end checks the panels' numbers at every star instead.
const MODULES = buyableModules().filter((d) => fusible(d.id) && d.kind !== "turret");
const TURRETS = buyableModules().filter((d) => d.kind === "turret");
const STARS = [1, 2, 3] as const;
const pct = (x: number): number => Math.round(x * 100);
/** A core's k-scaled number as its level line shows it (toFixed(1)). */
const r1 = (x: number): number => +x.toFixed(1);

/** The numbers a text quotes, in reading order: digits (2ND reads 2) and ONE, TWO, THREE, FOUR, FIVE, TWICE. */
function numbers(lines: readonly string[]): number[] {
  const words: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, TWICE: 2 };
  return [...lines.join(" ").matchAll(/(\d+(?:\.\d+)?)|\b(ONE|TWO|THREE|FOUR|FIVE|TWICE)\b/g)].map((m) => (m[1] ? +m[1] : words[m[2]]));
}

/**
 * The audit: the numbers each module's flavour quotes at a star, read from that star's spec (effectAt; a core's absolute
 * numbers x the class factor k, as scaleCore), constants included. A module whose flavour quotes none maps to [].
 */
const g = (e: ItemDef) => e.gate!;
const f = (e: ItemDef) => e.factory!;
const m = (e: ItemDef) => e.mod!;
const NUMBERS: Record<string, (e: ItemDef, k: number) => number[]> = {
  // rigs
  temper: (e) => [g(e).burn!, 1, 3], // BURN: 1 DMG/S FOR 3S (BURN_TIME) at every star
  whetstone: (e) => [g(e).flat!],
  grease: (e) => [g(e).speed!, g(e).lockedFlat!],
  brake: (e) => [g(e).lockedFlat!], // HALF SPEED: speed 0.5 at every star (checked below)
  longhaul: (e) => (g(e).priorCap === undefined ? [g(e).perPriorGate!] : [g(e).perPriorGate!, g(e).priorCap!]),
  coil: () => [],
  splitter: (e) => [g(e).split!.copies, pct(g(e).split!.mult)],
  overdrive: (e) => [4, g(e).speed!, g(e).lockedFlat!], // 4 ARROWS: the X shape
  tollbooth: (e) => [g(e).toll!],
  sifter: () => [],
  surge: (e) => [g(e).pulse!.speed, g(e).pulse!.on, g(e).pulse!.period, g(e).pulse!.flat!, g(e).lockedFlat!], // FB-B: flat 1/2/3
  sorting: (e) => [g(e).sort!.every, ...(g(e).sort!.copies > 2 ? [g(e).sort!.copies - 1] : [])],
  riveter: (e) => [g(e).repair!],
  heatjacket: (e) => [g(e).heat!],
  venom: (e) => [g(e).poison!],
  overclocker: (e) => [g(e).overclockCooldown!],
  keg: (e) => [g(e).keg!.fuse, g(e).keg!.flat, ...(g(e).keg!.burn > 1 ? [g(e).keg!.burn] : [])], // 1 Burn reads AND BURN
  bellows: (e) => [g(e).burnPerRide!.max],
  quench: (e) => [g(e).quench!.flat, g(e).quench!.stacks, g(e).quench!.perBurn], // FB-B: +flat, then up to `stacks` Burn
  staticbrush: () => [],
  lodestone: (e) => [g(e).flat!, g(e).perStalled!.each], // 0.6.2 TUNE-M T2: the floor, then +each per stalled machine
  barbed: (e) => [g(e).fray!, 0.2], // +0.2 PER STACK: FRAY_BONUS
  counterweight: (e) => [g(e).perTile!.each, g(e).perTile!.max],
  // factories
  press: (e) => [f(e).interval],
  doublestamp: (e) => [f(e).batch!, f(e).interval],
  shottower: (e) => [f(e).batch!, f(e).base ?? AMMO[f(e).ammo].base, f(e).interval, 1], // RIGS HIT EACH ONE.
  hotswap: (e) => [f(e).cycle!.find((p) => p.tint === "ember")!.burn!],
  slagpot: (e) => [f(e).base ?? AMMO[f(e).ammo].base],
  assembly: (e) => (f(e).commission! > 0 ? [1 / f(e).commission!] : []), // x0.5 commissions 2X FAST; x0: ONLINE AT ONCE
  gantry: (e) => [1, f(e).outputs, f(e).outputs], // ONE PRESS
  scrapper: (e) => [f(e).interval],
  sabot: () => [],
  frostbite: () => [],
  dragchain: () => [],
  mimic: (e) => (f(e).outputs > 1 ? [f(e).outputs] : []), // A SECOND ROUTE, then TWO MORE ROUTES
  limpet: (e) => [(f(e).round as { delay: number }).delay],
  // turret cores
  scatter: (e, k) => [scaleCore(e.core!, k).pellets!, pct(scaleCore(e.core!, k).share!)],
  rotary: (e, k) => [scaleCore(e.core!, k).windowTime!],
  pressure: (e, k) => [r1(scaleCore(e.core!, k).perQueued!)],
  gatling: (e, k) => [pct(scaleCore(e.core!, k).step!), scaleCore(e.core!, k).floor!],
  hullbreaker: (e, k) => [pct(scaleCore(e.core!, k).hullMul! - 1)],
  drake: (e, k) => [scaleCore(e.core!, k).burnTime!, 3], // NOT 3: BURN_TIME
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
  calibrate: (e) => [pct(1 - m(e).fireMul!)],
  flak: (e) => [pct(m(e).intercept!)],
  spotter: () => [],
  hopper: (e) => [m(e).window!, m(e).windowTime!, ...(m(e).store ? [m(e).store!] : [])], // FB-B: ★2/★3 store 1/2
  mantlet: () => [],
  ram: (e) => [pct(m(e).finisher!)],
  escapement: (e) => [pct(1 - m(e).fireMul!), 1.2, 7], // PEAK_SHIFT and its 7 TILES
  longcase: (e) => [m(e).longRideFlat!, m(e).longRideMin!, 1.2],
};

/** Modules whose desc quotes no number (or effect) their stars change: the desc shows at every star. */
const UNCHANGED = ["coil", "staticbrush", "sabot", "frostbite", "dragchain", "rotary", "mantlet"];

/** The pins, heavy scale (k 1): each templated module's flavour at ★1, ★2 and ★3, lines joined by " / ". */
const PINS: Record<string, [string, string, string]> = {
  temper: ["ADDS 2 BURN. / BURN: 1 DMG/S FOR 3S / PER STACK ON HIT.", "ADDS 4 BURN. / BURN: 1 DMG/S FOR 3S / PER STACK ON HIT.", "ADDS 7 BURN. / BURN: 1 DMG/S FOR 3S / PER STACK ON HIT."],
  whetstone: ["+2 FLAT DAMAGE. / BEFORE A SPLITTER, / BOTH COPIES GAIN IT.", "+4 FLAT DAMAGE. / BEFORE A SPLITTER, / BOTH COPIES GAIN IT.", "+7 FLAT DAMAGE. / BEFORE A SPLITTER, / BOTH COPIES GAIN IT."],
  grease: ["BELT RUNS 1.6X FROM / ITS HIT. LOCKED BELTS / GAIN +1 DAMAGE.", "BELT RUNS 2.3X FROM / ITS HIT. LOCKED BELTS / GAIN +2 DAMAGE.", "BELT RUNS 3.1X FROM / ITS HIT. LOCKED BELTS / GAIN +4 DAMAGE."],
  brake: ["HALF SPEED FROM HIT. / LOCKED BELTS GAIN / +2 DAMAGE INSTEAD.", "HALF SPEED FROM HIT. / LOCKED BELTS GAIN / +4 DAMAGE INSTEAD.", "HALF SPEED FROM HIT. / LOCKED BELTS GAIN / +7 DAMAGE INSTEAD."],
  longhaul: ["+1 DAMAGE FOR EACH / HIT THE PAYLOAD / ALREADY TOOK.", "+2 DAMAGE FOR EACH / EARLIER HIT, UP TO / 6 HITS.", "+3.5 DAMAGE PER / EARLIER HIT, UP TO / 6 HITS."],
  splitter: ["SPLITS A PAYLOAD IN / TWO COPIES AT 60%. / MORE BELT PRESSURE.", "SPLITS A PAYLOAD IN / TWO COPIES AT 72%. / MORE BELT PRESSURE.", "SPLITS A PAYLOAD IN / TWO COPIES AT 85%. / MORE BELT PRESSURE."],
  overdrive: ["4 ARROWS: 3X SPEED / FROM HIT; LOCKED BELTS / GAIN +3 DAMAGE.", "4 ARROWS: 4X SPEED / FROM HIT; LOCKED BELTS / GAIN +6 DAMAGE.", "4 ARROWS: 5X SPEED / FROM HIT; LOCKED BELTS / GAIN +11 DAMAGE."],
  tollbooth: ["GUARDS ITS BELT / FROM THE FIRST 2 / HARASSMENT HITS.", "GUARDS ITS BELT / FROM THE FIRST 4 / HARASSMENT HITS.", "GUARDS ITS BELT / FROM THE FIRST 7 / HARASSMENT HITS."],
  sifter: ["REMOVES CHILL, SNAG / OR SAP FROM PASSING / PAYLOADS IN ORDER.", "REMOVES CHILL, SNAG / AND SAP FROM EVERY / PASSING PAYLOAD.", "REMOVES CHILL, SNAG / AND SAP FROM EVERY / PASSING PAYLOAD."],
  surge: [
    "PULSES 3X SPEED FOR / 1S EVERY 3S, +1 DMG / PER PULSE RIDDEN. / LOCKED BELTS +3 DMG.",
    "PULSES 4X SPEED FOR / 1S PER 2.5S, +2 DMG / PER PULSE RIDDEN. / LOCKED BELTS +6 DMG.",
    "PULSES 5X SPEED FOR / 1S EVERY 2S, +3 DMG / PER PULSE RIDDEN. / LOCKED BELT +10 DMG.",
  ],
  sorting: ["COPIES EVERY 3RD / PAYLOAD AT FULL / STRENGTH.", "COPIES EVERY 2ND / PAYLOAD AT FULL / STRENGTH.", "COPIES EVERY 2ND / PAYLOAD TWICE AT / FULL STRENGTH."],
  riveter: ["EACH PASSING SLUG / REPAIRS YOUR HULL / BY 0.6.", "EACH PASSING SLUG / REPAIRS YOUR HULL / BY 1.3.", "EACH PASSING SLUG / REPAIRS YOUR HULL / BY 2.1."],
  heatjacket: ["ADDS +0.4 DAMAGE / PER SECOND RIDDEN / AFTER THIS RIG.", "ADDS +0.9 DAMAGE / PER SECOND RIDDEN / AFTER THIS RIG.", "ADDS +1.4 DAMAGE / PER SECOND RIDDEN / AFTER THIS RIG."],
  venom: ["ADDS 2 POISON. / POOL TICKS AND / REFRESHES ON HIT.", "ADDS 4 POISON. / POOL TICKS AND / REFRESHES ON HIT.", "ADDS 7 POISON. / POOL TICKS AND / REFRESHES ON HIT."],
  overclocker: ["DOUBLES THE NEXT / BOOSTABLE RIG ONCE, / THEN COOLS FOR 4S.", "DOUBLES THE NEXT / BOOSTABLE RIG ONCE, / THEN COOLS 1.8S.", "DOUBLES THE NEXT / BOOSTABLE RIG ONCE, / THEN COOLS 1.15S."],
  keg: ["BLOWS AT 12S: / PAYLOADS ON ITS BELT / GAIN +6 AND BURN.", "BLOWS AT 10S: / PAYLOADS ON ITS BELT / GAIN +13, 2 BURN.", "BLOWS AT 8S: ALL / BELTS BESIDE IT / GAIN +21 AND 3 BURN."],
  bellows: ["ADDS BURN FROM / RIDE TIME SO FAR, / UP TO 4 STACKS.", "ADDS BURN FROM / RIDE TIME SO FAR, / UP TO 9 STACKS.", "ADDS BURN FROM / RIDE TIME SO FAR, / UP TO 14 STACKS."],
  quench: ["+1 DAMAGE TO EVERY / PAYLOAD. TURNS UP TO / 4 BURN INTO +3 EACH.", "+2 DAMAGE TO EVERY / PAYLOAD. TURNS UP TO / 5 BURN INTO +5 EACH.", "+3 DAMAGE TO EVERY / PAYLOAD. TURNS UP TO / 6 BURN INTO +7 EACH."],
  lodestone: ["+1 DAMAGE ALWAYS, / +1 PER ENEMY / MACHINE STALLED.", "+2 DAMAGE ALWAYS, / +2.2 PER ENEMY / MACHINE STALLED.", "+3 DAMAGE ALWAYS, / +3.5 PER ENEMY / MACHINE STALLED."], // TUNE-M T2
  barbed: ["HITS ADD 1 FRAY. / LATER HITS DEAL / +0.2 PER STACK.", "HITS ADD 2 FRAY. / LATER HITS DEAL / +0.2 PER STACK.", "HITS ADD 3 FRAY. / LATER HITS DEAL / +0.2 PER STACK."],
  counterweight: ["+0.5 DAMAGE PER / BELT TILE ALREADY / RIDDEN, MAX +6.", "+1.1 DAMAGE PER / BELT TILE ALREADY / RIDDEN, MAX +13.", "+1.75 DAMAGE PER / BELT TILE ALREADY / RIDDEN, MAX +21."],
  press: ["STAMPS PLAIN SLUGS / EVERY 1.4S. NEEDS A / FREE TURRET INTAKE.", "STAMPS PLAIN SLUGS / EVERY 1.1S. NEEDS A / FREE TURRET INTAKE.", "STAMPS PLAIN SLUGS / EVERY 1S. NEEDS A / FREE TURRET INTAKE."],
  doublestamp: ["STAMPS TWO PLAIN / SLUGS PER 2.2S CYCLE. / QUEUE PRESSURE.", "STAMPS TWO PLAIN / SLUGS PER 1.6S CYCLE. / QUEUE PRESSURE.", "STAMPS 3 PLAIN / SLUGS PER 1.6S CYCLE. / QUEUE PRESSURE."],
  shottower: ["DROPS 3 BUCKSHOT / (1 DMG) EVERY 1.5S. / RIGS HIT EACH ONE.", "DROPS 3 BUCKSHOT / (2 DMG) EVERY 1.35S. / RIGS HIT EACH ONE.", "DROPS 3 BUCKSHOT / (3 DMG) EVERY 1.3S. / RIGS HIT EACH ONE."],
  hotswap: ["ALTERNATES EMBER / SLUGS (2 BURN) AND / SPARK SLUGS (SHOCK).", "ALTERNATES EMBER / SLUGS (4 BURN) AND / SPARK SLUGS (SHOCK).", "ALTERNATES EMBER / SLUGS (7 BURN) AND / SPARK SLUGS (SHOCK)."],
  slagpot: ["HEAVY SLAG SLUGS / (7 DMG) THAT IGNORE / BELT SPEED RIGS.", "HEAVY 12 DMG SLAG / SLUGS THAT IGNORE / BELT SPEED RIGS.", "HEAVY 15 DMG SLAG / SLUGS THAT IGNORE / BELT SPEED RIGS."],
  assembly: ["SLOW PLAIN SLUGS, AND / ALL YOUR RIGS / COMMISSION 2X FAST.", "SLOW PLAIN SLUGS, AND / ALL YOUR RIGS / COMMISSION 4X FAST.", "SLOW PLAIN SLUGS, AND / ALL YOUR RIGS COME / ONLINE AT ONCE."],
  gantry: ["ONE PRESS, TWO / OUTPUTS: FEEDS TWO / INTAKES BY TURNS.", "ONE PRESS, THREE / OUTPUTS: FEEDS 3 / INTAKES BY TURNS.", "ONE PRESS, THREE / OUTPUTS: FEEDS 3 / INTAKES BY TURNS."],
  scrapper: ["STAMPS SCRAP SLUGS / WHEN HARASSMENT HITS / FOE, OR EVERY 3S.", "STAMPS SCRAP SLUGS / WHEN HARASSMENT HITS / FOE, OR EVERY 2.5S.", "STAMPS SCRAP SLUGS / WHEN HARASSMENT HITS / FOE, OR EVERY 2S."],
  mimic: ["STAMPS YOUR HERO'S / SIGNATURE AMMO INTO / A SECOND ROUTE.", "STAMPS YOUR HERO'S / SIGNATURE AMMO INTO / A SECOND ROUTE.", "STAMPS YOUR HERO'S / SIGNATURE AMMO INTO / TWO MORE ROUTES."],
  limpet: ["STICKY CHARGES BLOW / 3S LATER FOR HULL / DAMAGE.", "STICKY CHARGES BLOW / 3S LATER FOR HULL / DAMAGE AND A STALL.", "STICKY CHARGES BLOW / 3S LATER FOR HULL / DAMAGE AND A STALL."],
  scatter: ["SHOTS BURST INTO 3 / PELLETS AT 40%, EACH / AIMED ANEW.", "SHOTS BURST INTO 3 / PELLETS AT 48%, EACH / AIMED ANEW.", "SHOTS BURST INTO 4 / PELLETS AT 42%, EACH / AIMED ANEW."],
  pressure: ["+1.2 DAMAGE PER / PAYLOAD QUEUED AT / IT. NEVER JAMS.", "+2.6 DAMAGE PER / PAYLOAD QUEUED AT / IT. NEVER JAMS.", "+4.2 DAMAGE PER / PAYLOAD QUEUED AT / IT. NEVER JAMS."],
  gatling: [
    "NEVER WAITS: FIRES / EACH LOAD AT ONCE. / EACH QUICK SHOT 6% / FASTER, TO 0.6X.",
    "NEVER WAITS: FIRES / EACH LOAD AT ONCE. / EACH QUICK SHOT 9% / FASTER, TO 0.4X.",
    "NEVER WAITS: FIRES / EACH LOAD AT ONCE. / QUICK SHOTS: 12% / FASTER, TO 0.29X.",
  ],
  hullbreaker: ["NEVER HITS MACHINES. / EVERY HULL HIT / DEALS +30%.", "NEVER HITS MACHINES. / EVERY HULL HIT / DEALS +66%.", "NEVER HITS MACHINES. / EVERY HULL HIT / DEALS +105%."],
  drake: ["TURNS FLAT DAMAGE / INTO BURN. ITS FIRES / BURN 4S, NOT 3.", "TURNS FLAT DAMAGE / INTO BURN. ITS FIRES / BURN 5S, NOT 3.", "TURNS FLAT DAMAGE / INTO BURN. ITS FIRES / BURN 6S, NOT 3."],
  salvo: ["WAITS FOR A FULL / WINDOW, THEN FIRES / IT ALL AT +2 EACH.", "WAITS FOR A FULL / WINDOW, THEN FIRES / IT ALL, +4.4 EACH.", "WAITS FOR A FULL / WINDOW, THEN FIRES / IT ALL AT +7 EACH."],
  mortar: ["LOB FLIES 2.2X LONG / AND SPLASHES ONE / MORE TARGET AT 50%.", "LOB FLIES 2.2X LONG / AND SPLASHES TWO / MORE, EACH AT 55%.", "LOB FLIES 2.2X LONG / AND SPLASHES THREE / MORE, EACH AT 58%."],
  grapnel: ["BELT HITS RIP THE / NEAREST ENEMY SLUG / OFF THAT ROUTE.", "BELT HITS RIP THE / 2 NEAREST ENEMY / SLUGS OFF IT.", "BELT HITS RIP THE / 3 NEAREST ENEMY / SLUGS OFF IT."],
  tesla: ["HITS ARC TO THE / NEAREST MACHINE FOR / 25% PLUS 0.8S STALL.", "HITS ARC TO THE / 2 NEAREST MACHINES: / 25% + 0.9S STALL.", "HITS ARC TO THE / 3 NEAREST MACHINES: / 30% + 0.93S STALL."],
  capacitor: ["IDLE TIME CHARGES / NEXT SHOT: +2 PER / SECOND, UP TO 5S.", "IDLE TIME CHARGES / NEXT SHOT: +4.4 PER / SECOND, UP TO 5S.", "IDLE TIME CHARGES / NEXT SHOT: +7 PER / SECOND, UP TO 5S."],
  compound: ["PACKS TWO LOADS / INTO ONE SHELL AT / 115% TOTAL DAMAGE.", "PACKS TWO LOADS / INTO ONE SHELL AT / 133% TOTAL DAMAGE.", "PACKS TWO LOADS / INTO ONE SHELL AT / 152% TOTAL DAMAGE."],
  lance: ["HITS THE HULL AND / EVERY MACHINE IN / ONE DECK COLUMN.", "HITS THE HULL AND / EVERY MACHINE IN / 2 DECK COLUMNS.", "HITS THE HULL AND / EVERY MACHINE IN / 3 DECK COLUMNS."],
  chamber: ["TURRET FIRES TWO / PAYLOADS PER SHOT. / DROP ON A TURRET.", "TURRET FIRES TWO / PAYLOADS PER SHOT. / DROP ON A TURRET.", "TURRET FIRES 3 / PAYLOADS PER SHOT. / DROP ON A TURRET."],
  calibrate: ["TURRET FIRES 25% / FASTER. / DROP ON A TURRET.", "TURRET FIRES 42% / FASTER. / DROP ON A TURRET.", "TURRET FIRES 54% / FASTER. / DROP ON A TURRET."],
  flak: ["INTERCEPTS 25% OF / INCOMING HARASSMENT / ROUNDS SIDE-WIDE.", "INTERCEPTS 55% OF / INCOMING HARASSMENT / ROUNDS SIDE-WIDE.", "INTERCEPTS 85% OF / INCOMING HARASSMENT / ROUNDS SIDE-WIDE."],
  spotter: ["TURRET REROLLS A / BARE-HULL TARGET / TOWARD MACHINERY.", "TURRET REROLLS / BARE-HULL TARGETS / TOWARD MACHINERY.", "TURRET AIMS AT / MACHINERY ONLY, / NEVER BARE HULL."],
  hopper: ["CHAMBER HOLDS 1 MORE / LOAD; WINDOWS STAY / OPEN 0.5S LONGER.", "CHAMBER HOLDS 1 MORE / LOAD, +0.5S, AND 1 / MORE WHILE FIRING.", "+1 SLOT, +0.5S, AND / HOLDS 2 MORE WHILE / FIRING. NEVER JAMS."],
  ram: ["THE LAST PAYLOAD OUT / OF EACH WINDOW HITS / 40% HARDER.", "THE LAST PAYLOAD OUT / OF EACH WINDOW HITS / 88% HARDER.", "THE LAST PAYLOAD OUT / OF EACH WINDOW HITS / 140% HARDER."],
  escapement: ["FIRES 10% FASTER. / PENDULUM PEAK 1.2S / EARLIER: 7 TILES.", "FIRES 14% FASTER. / PENDULUM PEAK 1.2S / EARLIER: 7 TILES.", "FIRES 18% FASTER. / PENDULUM PEAK 1.2S / EARLIER: 7 TILES."],
  longcase: ["OTHER SLUGS: +1.5 / DMG AFTER 2S RIDE. / PENDULUM PEAK +1.2S.", "OTHER SLUGS: +2.5 / DMG AFTER 2S RIDE. / PENDULUM PEAK +1.2S.", "OTHER SLUGS: +4 / DMG AFTER 2S RIDE. / PENDULUM PEAK +1.2S."],
};

describe("0.6.2p item 1: the audit covers every buyable fusible module", () => {
  it("23 rigs, 13 factories, 13 cores and 9 mods; each is audited (NUMBERS) and either templated (PINS) or unchanged", () => {
    const by = (kind: string) => MODULES.filter((d) => d.kind === kind).length;
    expect([by("gate"), by("factory"), by("core"), by("mod")]).toEqual([23, 13, 13, 9]);
    expect(Object.keys(NUMBERS).sort()).toEqual(MODULES.map((d) => d.id).sort());
    expect([...Object.keys(PINS), ...UNCHANGED].sort()).toEqual(MODULES.map((d) => d.id).sort());
    expect(Object.keys(STAR_FLAVOUR).sort()).toEqual(Object.keys(PINS).sort());
  });
});

describe("0.6.2p item 1: star-aware flavour, every module x stars 1-3", () => {
  it("pins: each templated module's flavour at ★1, ★2 and ★3 (heavy scale)", () => {
    for (const [def, pins] of Object.entries(PINS)) expect(STARS.map((s) => flavour(def, s).join(" / ")), def).toEqual(pins);
  });

  it("numbers: the flavour quotes exactly that star's values (effectAt; constants as listed)", () => {
    for (const d of MODULES) for (const s of STARS) {
      expect(numbers(flavour(d.id, s)), `${d.id} ★${s}`).toEqual(NUMBERS[d.id](effectAt(d.id, s), 1));
    }
  });

  it("a turret core's absolute numbers follow the turret's class factor, as its level line does (WEAVER, k 0.55)", () => {
    for (const d of MODULES.filter((x) => x.kind === "core")) for (const s of STARS) {
      expect(numbers(flavour(d.id, s, 0.55)), `${d.id} ★${s}`).toEqual(NUMBERS[d.id](effectAt(d.id, s), 0.55));
    }
    // written out: PRESSURE 1.2 / 2.6 / 4.2 x 0.55; the level line reads the same +1.4 at ★2
    expect(STARS.map((s) => flavour("pressure", s, 0.55)[0])).toEqual(["+0.7 DAMAGE PER", "+1.4 DAMAGE PER", "+2.3 DAMAGE PER"]);
    expect(levelLine("pressure", 2, 0.55)).toBe("★2: +1.4 DMG PER QUEUED");
    expect(STARS.map((s) => flavour("salvo", s, 0.55)[2])).toEqual(["IT ALL, +1.1 EACH.", "IT ALL, +2.4 EACH.", "IT ALL, +3.9 EACH."]);
    expect(STARS.map((s) => flavour("capacitor", s, 0.55)[1])).toEqual(["NEXT SHOT: +1.1 PER", "NEXT SHOT: +2.4 PER", "NEXT SHOT: +3.9 PER"]);
  });

  it("at 1 star a template is its catalogue desc word for word, except LIMPET WORKS (no stall until ★2)", () => {
    for (const d of MODULES) {
      if (d.id === "limpet") continue;
      expect(flavour(d.id, 1), d.id).toEqual(d.desc);
    }
    expect(ITEMS.limpet.desc[2]).toBe("DAMAGE AND A STALL.");
    expect((effectAt("limpet", 1).factory!.round as { stall?: number }).stall).toBeUndefined();
    expect(STARS.map((s) => (effectAt("limpet", s).factory!.round as { stall?: number }).stall ?? 0)).toEqual([0, 1, 1.6]);
  });

  it("unchanged modules show their desc at every star: its numbers, if any, never vary", () => {
    for (const id of UNCHANGED) for (const s of STARS) expect(flavour(id, s), `${id} ★${s}`).toEqual(ITEMS[id].desc);
    expect(STARS.map((s) => effectAt("rotary", s).core!.windowTime)).toEqual([0.8, 0.8, 0.8]); // CLOSE IN 0.8S
    expect(STARS.map((s) => effectAt("brake", s).gate!.speed)).toEqual([0.5, 0.5, 0.5]); // HALF SPEED
  });

  it("the effects a star replaces: SIFTER, SPOTTER, MIMIC, SORTING, POWDER KEG and LONG HAUL say what that star does", () => {
    expect(STARS.map((s) => effectAt("sifter", s).gate!.sift)).toEqual([1, "all", "all"]);
    expect(STARS.map((s) => [effectAt("spotter", s).mod!.rerolls ?? 0, !!effectAt("spotter", s).mod!.alwaysMachine])).toEqual([[1, false], [2, false], [2, true]]);
    expect(STARS.map((s) => effectAt("mimic", s).factory!.outputs)).toEqual([1, 1, 2]);
    expect(STARS.map((s) => !!effectAt("keg", s).gate!.keg!.wide)).toEqual([false, false, true]);
    expect(STARS.map((s) => effectAt("longhaul", s).gate!.priorCap)).toEqual([undefined, 6, 6]);
  });

  it("0.6.2 FB-B: QUENCH, SURGE and HOPPER say each star's rule; MANTLET's desc stays true at every star", () => {
    // QUENCH TANK: +1/+2/+3 to every payload it hits, then up to 4/5/6 Burn into +3/+5/+7 each
    expect(STARS.map((s) => { const q = effectAt("quench", s).gate!.quench!; return [q.flat, q.stacks, q.perBurn]; })).toEqual([[1, 4, 3], [2, 5, 5], [3, 6, 7]]);
    // SURGE VALVE: every star pays its per-pulse flat (1/2/3); locked belts take 3/6/10 instead
    expect(STARS.map((s) => [effectAt("surge", s).gate!.pulse!.flat, effectAt("surge", s).gate!.lockedFlat])).toEqual([[1, 3], [2, 6], [3, 10]]);
    // HOPPER: +1 slot and +0.5 s at every star; ★2/★3 hold 1/2 more loads while the gun fires; ★3 never jams
    expect(STARS.map((s) => { const h = effectAt("hopper", s).mod!; return [h.window, h.windowTime, h.store ?? 0, !!h.noJam]; }))
      .toEqual([[1, 0.5, 0, false], [1, 0.5, 1, false], [1, 0.5, 2, true]]);
    expect(STARS.map((s) => flavour("hopper", s).join(" ").includes("NEVER JAMS"))).toEqual([false, false, true]);
    expect(STARS.map((s) => starEffectLine("hopper", s))).toEqual([
      "+1 SLOT · +0.5S", "+1 SLOT · +0.5S · HOLDS 1 MORE WHILE FIRING", "+1 SLOT · +0.5S · HOLDS 2 MORE WHILE FIRING · NEVER JAMS",
    ]);
    // MANTLET stays in UNCHANGED: its desc quotes no number and names only ★1's stalls (SHOCK and CHAIN SLOWS), which
    // every star keeps. What a star adds (FULL PLATE: FROST, SABOT and the belt tile feeding its turret; BULWARK SKIRT:
    // the last 3 tiles) is on the level line, which the desc never contradicts.
    expect(numbers(ITEMS.mantlet.desc)).toEqual([]);
    for (const s of STARS) for (const c of ITEMS.mantlet.mod!.immune!) expect(effectAt("mantlet", s).mod!.immune, `★${s} ${c}`).toContain(c);
    expect(STARS.map((s) => effectAt("mantlet", s).mod!.intakeGuard ?? 0)).toEqual([0, 1, 3]);
    expect(starEffectLine("mantlet", 2)).toBe("+FROST, SABOT · SHIELDS THE BELT TILE FEEDING ITS TURRET");
    expect(starEffectLine("mantlet", 3)).toBe("+FROST, SABOT · SHIELDS THE LAST 3 BELT TILES FEEDING ITS TURRET");
  });

  it("no panel grows: as many lines, each within about 20 characters, and no more rows at any panel width", () => {
    // the landscape details column wraps the flavour at 102..118 px (layout.ts: LAND_MIN_W to the capped column), in
    // the 5x7 face or the 3x5 face; the phone band at 151 px (3x5)
    const rows = (ls: readonly string[], w: number, font: "5" | "3") => ls.reduce((n, l) => n + wrap(l, w, font).length, 0);
    for (const d of MODULES) for (const s of STARS) for (const k of d.kind === "core" ? [1, 0.55] : [1]) {
      const fl = flavour(d.id, s, k), id = `${d.id} ★${s} k${k}`;
      expect(fl.length, id).toBe(d.desc.length);
      for (const l of fl) expect(l.length, `${id}: ${l}`).toBeLessThanOrEqual(Math.max(20, ...d.desc.map((x) => x.length)));
      for (let w = 102; w <= 118; w++) for (const font of ["5", "3"] as const) {
        expect(rows(fl, w, font), `${id} at ${w} px (${font})`).toBeLessThanOrEqual(rows(d.desc, w, font));
      }
      expect(rows(fl, 151, "3"), `${id} phone`).toBeLessThanOrEqual(rows(d.desc, 151, "3"));
    }
  });
});

describe("0.6.2p item 1: the panels show the flavour at the module's stars", () => {
  it("a placed ★3 SPLITTER's rig panel says 85%, never 60% (the brief's case), and matches its perk line", () => {
    const run = newRun("furnace", 5, "flavour");
    run.build.items.push({ uid: 10, def: "splitter", x: 3, y: 3, rot: 1, stars: 3 });
    const text = rigPanel(run, 10)!.text.map((l) => (typeof l === "string" ? l : l[0]));
    expect(text).toContain("TWO COPIES AT 85%.");
    expect(text.join(" ")).not.toContain("60%");
    expect(levelLine("splitter", 3)).toBe("★3 PERFECT CUT: 2 X 85%");
    expect(starEffectLine("splitter", 3)).toBe("2 X 85%");
  });

  it("factory body, cargo and offer panels (inspector.ts body): the flavour at that star, a core's at the hero's k", () => {
    // a placed ★2 SLAG POT: headline-first body (0.6.1c), then its ★2 flavour
    expect(body(ITEMS.slagpot, 2, [levelLine("slagpot", 2)], "HINT")).toEqual([
      "★2: 12 DMG SLAG EVERY 2.2S", "HEAVY 12 DMG SLAG", "SLUGS THAT IGNORE", "BELT SPEED RIGS.", "HINT",
    ]);
    // a ★2 PRESSURE BREECH in a WEAVER's cargo (k 0.55): flavour and level line read the same +1.4
    expect(body(ITEMS.pressure, 2, [levelLine("pressure", 2, 0.55)], "HINT", 0.55)).toEqual([
      "+1.4 DAMAGE PER", "PAYLOAD QUEUED AT", "IT. NEVER JAMS.", "★2: +1.4 DMG PER QUEUED", "HINT",
    ]);
    // a ★3 HOPPER (gear) and a 1-star offer (the offer panel's stars are 1)
    expect(body(ITEMS.hopper, 3, [], "HINT").slice(0, 3)).toEqual(["+1 SLOT, +0.5S, AND", "HOLDS 2 MORE WHILE", "FIRING. NEVER JAMS."]);
    expect(body(ITEMS.splitter, 1, [], "HINT").slice(0, 3)).toEqual(ITEMS.splitter.desc);
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
