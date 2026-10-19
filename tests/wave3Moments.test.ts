// 0.8.0 I1 M4 (REPORT-A1 section 5.2, VERIFIED-A1 section G items 1-3; REQ-BFG-011, REQ-BFG-022): A1's twelve battle
// moments, each fed from P1's sim state in a live battle played through the Arena (the game's playback object: its
// react() sets the display timers from the sim's events, its updateSide() runs them down), and drawn by the game's own
// entry points (render/machinery.ts drawMachinery, render/cruiser.ts drawTurrets) into the software raster: the pixels
// that tell a moment's state apart from the plain look show the state's. Plus STOKER's IDLE dim in battle (G2), TWIN
// MOULD's pour flash (G3), the plating strip on any plated hull, and the display-only rule (a battle played on screen
// ends exactly as simulate()).
import { describe, expect, it } from "vitest";
import { G, R, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { Arena } from "../src/game/arena";
import { react } from "../src/game/arenaReact";
import { Battle, simulate, type FactoryState, type GateState, type SimEvent, type TurretState } from "../src/sim/battle";
import { ITEMS, type HeroId } from "../src/sim/content";
import { cloneBuild, turretSlots, type Build } from "../src/sim/deck";
import { bestSpot } from "../src/sim/beltside";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { footX, footY, frameForHull, type DeckFrame } from "../src/render/frame";
import { drawMachinery } from "../src/render/machinery";
import { cruiserModel, drawTurrets, muzzleX, muzzleY, turretPivotX, turretPivotY, type CruiserView } from "../src/render/cruiser";
import { factoryFlashSil, factorySprite, gateSprite } from "../src/render/sprites";
import { anvilSparks, stokeFlare, wave3FactoryArt, wave3GateSprite, wave3GearFace, wave3Gem, type Wave3RigState } from "../src/render/wave3Art";
import {
  ANVIL_TIME, RELEASE_TIME, SHRUG_TIME, SPALL_GAUGE_ADDS, crowdOf, factoryMoment, gearMoment, holdsPlating, rigMoment, steamPlated, stokedNow,
} from "../src/render/wave3Moments";
import { plated } from "../src/screens/battleHud";
import { C } from "../src/render/palette";
import { SCALE_RIGS, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the switch ships on; the 0.9.11 world, read under withScaleRigs(fn, false)
import { K, SEED, barge, furnaceBench, item, latchDeck, twoPress, withItem, withMod } from "./wave3.helpers";

installRaster();

const DT = 1 / 60;
/** The deck frame the views use here: bow north, the hull's box at (10, 32) (tests/wave3Art.test.ts's FRAME). */
const FRAME: DeckFrame = frameForHull(0, 10, 32);

/** Play `b` against `foe` through the Arena at 1x, one 60 Hz frame at a time, until `stop(a, events)` holds (checked
 *  after every frame, with the sim events that frame played) or `secs` of battle time pass. */
function play(b: Build, foe: Build, stop: (a: Arena, ev: SimEvent[]) => boolean, secs = 40, seed = SEED): Arena {
  const a = new Arena(cloneBuild(b), cloneBuild(foe), seed, null);
  a.quiet = true;
  for (let f = 0; f < secs * 60 * 2 && a.b.t < secs && !a.b.over; f++) if (stop(a, a.update(DT))) return a;
  throw new Error(`the moment never came in ${secs} s`);
}

/** Side `s`'s battle view as the arena draws it (its sim, the moments' timers), on FRAME at t = 0. */
function view(a: Arena, s: 0 | 1 = 0): CruiserView {
  return { side: s, build: a.b.sides[s].build, model: a.sfx[s].model, frame: FRAME, sim: a.b.sides[s], t: 0, tread: 0, beltPhase: a.sfx[s].beltPhase, w3: a.sfx[s].w3 };
}

/** The view drawn by the game's entry points (machinery, then turrets). `opaqueOnly`: paints made at less than full
 *  alpha (a hit's white silhouette, the IDLE dim) are left out, so the art under them reads. */
function draw(v: CruiserView, opaqueOnly = false): RasterCanvas {
  const c = fresh(176, 184);
  c.opaqueOnly = opaqueOnly;
  drawMachinery(G(c), v);
  drawTurrets(G(c), v);
  return c;
}

const gate = (a: Arena, uid: number, s = 0): GateState => a.b.sides[s].gates.find((g) => g.uid === uid)!;
/** drawRigs' hit flash: a rig draws active while its GateState.flash is above 0 (the sim lets it run below 0). */
const hot = (a: Arena, uid: number): boolean => gate(a, uid).flash > 0;
const factory = (a: Arena, uid: number, s = 0): FactoryState => a.b.sides[s].factories.find((f) => f.uid === uid)!;
const turret = (a: Arena, slot: number, s = 0): TurretState => a.b.sides[s].turrets.find((t) => t.index === slot)!;
/** rigMoment as drawRigs calls it, for rig `uid` of side 0. */
const momentOf = (a: Arena, uid: number): Wave3RigState => {
  const v = view(a), p = v.build.items.find((q) => q.uid === uid)!;
  return rigMoment(p.def, uid, gate(a, uid), v.sim, v.w3, v.model.rigs.get(uid)?.w3);
};

/** Rig `uid` as drawn in `c`: over its cell, the pixels where its art in state `st` differs from its plain look (frame 0,
 *  `active`), counted as showing the state's colour or the plain look's (a nozzle drawn over one counts as neither). */
function statePixels(c: RasterCanvas, b: Build, uid: number, st: Wave3RigState, active: boolean): { shown: number; plain: number; at: string[] } {
  const p = b.items.find((q) => q.uid === uid)!;
  const x = Math.round(footX(FRAME, p.x, p.y)), y = Math.round(footY(FRAME, p.x, p.y));
  const want = R(wave3GateSprite(p.def, 0, active, st)), bare = R(gateSprite(p.def, 0, active));
  let shown = 0, plain = 0;
  const at: string[] = [];
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
    const w = want.at(i, j), o = bare.at(i, j);
    if (w === o || w === null) continue; // where the state's sprite is clear, the deck or a nozzle shows through
    const d = c.at(x + i, y + j);
    if (d === w) shown++;
    else if (d === o) { plain++; at.push(`(${i},${j}) ${d} want ${w}`); }
  }
  return { shown, plain, at };
}

/** The battle state is drawn: the rig's state pixels show the state (and none the plain look). */
function drawsState(a: Arena, uid: number, st: Wave3RigState, what: string): void {
  const v = view(a), active = gate(a, uid).flash > 0;
  const n = statePixels(draw(v, true), v.build, uid, st, active);
  expect(n.shown, `${what}: the state's pixels drawn`).toBeGreaterThan(0);
  expect(n.plain, `${what}: plain-look pixels where the state differs: ${n.at.join("; ")}`).toBe(0);
}
/** The plain look is drawn where the state would differ (no stale state). */
function drawsPlain(a: Arena, uid: number, st: Wave3RigState, what: string): void {
  const v = view(a), active = gate(a, uid).flash > 0;
  const n = statePixels(draw(v, true), v.build, uid, st, active);
  expect(n.shown, `${what}: no state pixels`).toBe(0);
  expect(n.plain, `${what}: the plain look`).toBeGreaterThan(0);
}

/** The harasser (tests/wave3.inert.test.ts): a WEAVER whose guns always aim at a machine (SPOTTER ★3), firing shocked
 *  thread (a COIL on each belt), so it stalls our machines. */
function harasser(): Build {
  let b: Build = { ...heroStartBuild("weaver"), hullBonus: 5000 };
  for (let i = 0; i < 3; i++) {
    const s = bestSpot(b, "coil", (ri) => ri === i)!;
    b = withItem(b, item(80 + i, "coil", s.x, s.y, s.rot, 3 - i));
  }
  for (const slot of [0, 1, 2]) b = withMod(b, 90 + slot, "spotter", slot, 3);
  return b;
}
/** The shooter for SPALL CATCHER: FURNACE's starting deck, firing at us. */
const shooter = (): Build => ({ ...heroStartBuild("furnace"), hullBonus: 5000 });

/** The STOKER bench (tests/wave3.modules.test.ts): a WEAVER whose STAMP PRESS (uid 7, (4,6)) feeds light turret 1. */
function pressBench(): Build {
  return {
    hero: "weaver", items: [{ uid: 1, def: "loom", x: 0, y: 8 }, { uid: 7, def: "press", x: 4, y: 6 }],
    routes: [{ factory: 7, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
    mods: [{ uid: 20, def: "chamber", turret: 1, stars: 3 }], beltCap: 30, hullBonus: 5000,
  };
}
/** FURNACE's bench with factory `def` (uid 7) at (6,6) on a second belt into connector 5. */
function pressFurnace(def: string): Build {
  const b = furnaceBench();
  b.items.push(item(7, def, 6, 6));
  b.routes.push({ factory: 7, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
  return b;
}
/** TWIN MOULD (uid 7) on a WEAVER at (4,6), the Loom parked, a belt into each of its two outputs. */
function mouldDeck(): Build {
  return {
    hero: "weaver", items: [{ uid: 1, def: "loom", x: 0, y: 8 }, item(7, "twinmould", 4, 6)],
    routes: [
      { factory: 7, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: 7, cells: [K(3, 6), K(2, 6), K(1, 6), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)] },
    ],
    mods: [], beltCap: 40, hullBonus: 5000,
  };
}

// ======================================================================================================== the rigs

describe("A1's battle moments on the rigs, fed from P1's sim state (REPORT-A1 5.2)", () => {
  it("TWIN GAUGE: its needles lock and the glass glows green while its hit is on a matched belt (E6's per-hit mark)", () => {
    const b = withItem(heroStartBuild("foundry", 1), item(60, "twingauge", 1, 3, 1));
    const a = play(b, barge(), (x) => x.b.t > 2 && gate(x, 60).online && !hot(x, 60));
    expect(gate(a, 60).hits.some((h) => h.matched), "FOUNDRY's mirrored belts are matched").toBe(true);
    expect(momentOf(a, 60)).toEqual({ matched: true });
    drawsState(a, 60, { matched: true }, "gauge on a matched belt");
    // one belt: nothing to match
    const lone = withItem(furnaceBench(), item(60, "twingauge", 3, 3, 1));
    const o = play(lone, barge(), (x) => x.b.t > 2 && !hot(x, 60));
    expect(gate(o, 60).hits.some((h) => h.matched)).toBe(false);
    expect(momentOf(o, 60)).toEqual({});
    drawsPlain(o, 60, { matched: true }, "gauge on a lone belt");
  });

  it("PINCER: its jaws heat with the other working rigs on its tile (E5), and cool when that rig stalls", () => {
    const b = withItem(withItem(furnaceBench(), item(30, "pincer", 3, 3, 1)), item(31, "whetstone", 5, 3, 3));
    let early: Wave3RigState | null = null;
    const a = play(b, barge(), (x) => {
      if (x.b.t > 0.5 && x.b.t < 1 && !early) early = momentOf(x, 30); // the WHETSTONE is still commissioning
      return x.b.t > 2 && !hot(x, 30);
    });
    expect(early).toEqual({});
    expect(crowdOf(a.b.sides[0], gate(a, 30))).toBe(1);
    expect(momentOf(a, 30)).toEqual({ crowd: 1 });
    drawsState(a, 30, { crowd: 1 }, "pincer crowded by one");
    gate(a, 31).disrupted = 2; // the WHETSTONE stalls: it no longer counts (Battle.crossfire)
    expect(momentOf(a, 30)).toEqual({});
    drawsPlain(a, 30, { crowd: 1 }, "pincer alone");
  });

  it("BRACE FRAME: its bolts glow white for a moment each time it shortens an enemy stall (its `brace` event)", () => {
    const b = withItem(furnaceBench(), item(30, "braceframe", 3, 4, 0));
    let before: Wave3RigState | null = null, braces = 0;
    // a frame inside a cut's glow where the brace isn't drawing its own hit (a hit lights the bolts anyway)
    const a = play(b, harasser(), (x, ev) => {
      braces += ev.filter((e) => e.type === "brace" && e.side === 0 && e.gate === 30).length;
      if (!braces && x.b.t > 2 && !hot(x, 30) && !before) before = momentOf(x, 30);
      return x.sfx[0].w3.shrug.has(30) && !hot(x, 30);
    }, 120);
    expect(before, "no glow before its first cut").toEqual({});
    expect(braces).toBeGreaterThan(0);
    expect(a.sfx[0].w3.shrug.get(30)).toBeGreaterThan(0);
    expect(a.sfx[0].w3.shrug.get(30)).toBeLessThanOrEqual(SHRUG_TIME);
    expect(momentOf(a, 30)).toEqual({ shrug: true });
    drawsState(a, 30, { shrug: true }, "brace shrugging");
    // the glow lasts SHRUG_TIME after the last cut, then goes out
    let last = a.clock;
    while (a.clock < last + SHRUG_TIME + 0.05) if (a.update(DT).some((e) => e.type === "brace" && e.side === 0)) last = a.clock;
    expect(a.sfx[0].w3.shrug.has(30)).toBe(false);
    expect(momentOf(a, 30)).toEqual({});
  });

  it("TWIN LATCH: its lamp blinks amber while it holds a payload (E4's hold), its fingers drop at the release tick", () => {
    const b = withItem(latchDeck(), item(40, "twinlatch", 4, 3, 0));
    const a = play(b, barge(), (x) => {
      const l = gate(x, 40).latch!;
      return l.held.some((h) => h) && !x.sfx[0].w3.release.has(40) && !hot(x, 40);
    });
    expect(momentOf(a, 40)).toEqual({ latch: "hold" });
    drawsState(a, 40, { latch: "hold" }, "latch holding");
    // the release: its event sets RELEASE_TIME on the fingers; a frame inside it that isn't the latch's own hit
    const r = play(b, barge(), (x, ev) => {
      if (ev.some((e) => e.type === "release" && e.side === 0 && e.gate === 40)) expect(x.sfx[0].w3.release.get(40)).toBeGreaterThan(0);
      return x.sfx[0].w3.release.has(40) && !hot(x, 40);
    });
    expect(r.sfx[0].w3.release.get(40)).toBeLessThanOrEqual(RELEASE_TIME);
    expect(momentOf(r, 40)).toEqual({ latch: "release" });
    drawsState(r, 40, { latch: "release" }, "latch letting go");
    // RELEASE_TIME after the last release the fingers are up again: holding (amber) or idle
    let last = r.clock;
    while (r.clock < last + RELEASE_TIME + 0.05) if (r.update(DT).some((e) => e.type === "release" && e.side === 0)) last = r.clock;
    expect(r.sfx[0].w3.release.has(40)).toBe(false);
    expect(momentOf(r, 40)).toEqual(gate(r, 40).latch!.held.some((h) => h) ? { latch: "hold" } : {});
  });

  it("PLATE BREAKER: a blow that takes a plating hammers in a hot strip; with none to take, a plain blow (the -1 plate event)", () => {
    const b = withItem(furnaceBench(), item(30, "platebreaker", 3, 3, 0));
    // no plating on the hull: every blow is plain
    const a = play(b, barge(), (x) => x.b.t > 2 && x.sfx[0].w3.spent.has(30) && hot(x, 30));
    expect(a.sfx[0].w3.spent.get(30)).toBe(false);
    expect(momentOf(a, 30)).toEqual({ spent: false });
    drawsState(a, 30, { spent: false }, "a plain blow");
    // 20 plating from the first tick: its blows take a plating each (P1's spendPlate, then its process event)
    let primed = false;
    const p = play(b, barge(), (x) => {
      if (!primed) { x.b.addPlate(x.b.sides[0], 20); primed = true; }
      return x.b.t > 2 && x.sfx[0].w3.spent.has(30) && hot(x, 30);
    });
    expect(p.b.sides[0].plate.plate).toBeLessThan(20);
    expect(p.sfx[0].w3.spent.get(30)).toBe(true);
    expect(momentOf(p, 30)).toEqual({});
    drawsPlain(p, 30, { spent: false }, "a blow that took plating");
    // only the blow's own spend counts: the -1 plate event of its side, right before it in the step (Battle.applyHit). Any
    // other plate event there (the foe's ARMOR PRESS in the same step's produce, a CLANK, plating added) is a plain blow
    const blow: SimEvent = { type: "process", side: 0, gate: 30, def: "platebreaker", dir: 1, route: 0, tile: 3 };
    for (const [prev, spent] of [
      [{ type: "plate", side: 0, amount: -1, plate: 4 }, true],
      [{ type: "plate", side: 1, amount: -1, plate: 4 }, false],
      [{ type: "plate", side: 1, amount: 2, plate: 2 }, false],
      [{ type: "plate", side: 0, amount: 0.5, plate: 1.5 }, false],
      [{ type: "plate", side: 0, turret: 0, amount: 1 }, false],
      [{ type: "process", side: 0, gate: 29, def: "plateroller", dir: 1, route: 0, tile: 3 }, false],
      [null, false],
    ] as [SimEvent | null, boolean][]) {
      react(p, blow, prev);
      expect(p.sfx[0].w3.spent.get(30), JSON.stringify(prev)).toBe(spent);
    }
  });

  // BUMP-1E: the scaling rules ship on (SCALE_RIGS, bb-0.12.0), where SHIELD WALL (IRON WALL) is a reader: +3 / +6 / +17 DMG for each whole 10
  // PLATE you have, no plating of its own and no 12-plating step (scale.ts SCALE_DEFS: no `plated`), so its boss glow, the 0.9.11 piece's, is
  // read with the switch off, synchronously (withScaleRigs(fn, false)); as shipped it has no moment (rigMoment below)
  it("SHIELD WALL: its boss glows once the hull holds 12 plating (E1's pool), not before", () => {
    expect(SCALE_RIGS).toBe(true);
    expect([ITEMS.shieldwall.gate!.plated, ITEMS.shieldwall.gate!.plate], "as shipped IRON WALL is a reader").toEqual([undefined, undefined]);
    withScaleRigs(() => {
      const b = withItem(furnaceBench(), item(30, "shieldwall", 3, 3, 0));
      const MIN = ITEMS.shieldwall.gate!.plated!.min; // NUM-1: the wall's threshold, 120 plating (x10 of 12)
      let before: Wave3RigState | null = null;
      const a = play(b, barge(), (x) => {
        const pl = x.b.sides[0].plate.plate;
        if (pl > 0 && pl < MIN && !hot(x, 30)) before = momentOf(x, 30);
        return pl >= MIN && !hot(x, 30);
      }, 60);
      expect(a.b.sides[0].plate.plate).toBeGreaterThanOrEqual(MIN);
      expect(before).toEqual({});
      expect(momentOf(a, 30)).toEqual({ plated: true });
      drawsState(a, 30, { plated: true }, "wall at 12 plating");
    }, false);
  });
});

// =================================================================================================== the factories

describe("A1's battle moments on the factories", () => {
  it("STOKER: its factory's chimney flares while the STOKER works (E3: FactoryState.stokers, the stoker online)", () => {
    const b = withItem(pressBench(), item(30, "stoker", 6, 6, 0));
    const fl = R(stokeFlare(0));
    const flareShown = (c: RasterCanvas, p: { x: number; y: number }): number => {
      const x = Math.round(footX(FRAME, p.x, p.y, 2)), y = Math.round(footY(FRAME, p.x, p.y, 2));
      let n = 0;
      for (let j = 0; j < 9; j++) for (let i = 0; i < 7; i++) if (fl.at(i, j) !== null && c.at(x + 17 + i, y - 4 + j) === fl.at(i, j)) n++;
      return n;
    };
    const press = b.items.find((q) => q.uid === 7)!;
    let cold = -1;
    const a = play(b, barge(), (x) => {
      if (x.b.t > 0.3 && x.b.t < 1 && cold < 0) {
        expect(stokedNow(factory(x, 7)), "the STOKER commissions at 1.2 s").toBe(false);
        cold = flareShown(draw(view(x)), press);
      }
      return x.b.t > 2;
    });
    expect(cold).toBe(0);
    expect(gate(a, 30).factoryHits).toEqual([7]);
    expect(stokedNow(factory(a, 7))).toBe(true);
    expect(flareShown(draw(view(a)), press)).toBe(fl.px.filter((p) => p !== null).length);
    gate(a, 30).disrupted = 2; // stalled: no stoke, no flare
    expect(stokedNow(factory(a, 7))).toBe(false);
    expect(flareShown(draw(view(a)), press)).toBe(0);
    // an unstoked factory never flares (the deck's other factory, the Loom)
    expect(stokedNow(factory(a, 1))).toBe(false);
  });

  it("ARMOR PRESS: a glowing plate slides down its chute after each plating press (its plateTimer wrapping)", () => {
    const b = pressFurnace("armorpress");
    let pressedAt = -1, before = true;
    const a = play(b, barge(), (x, ev) => {
      if (ev.some((e) => e.type === "plate" && e.side === 0 && e.amount > 0)) pressedAt = x.clock; // the press plated the hull
      else if (factoryMoment("armorpress", factory(x, 7), x.sfx[0].w3).plateT !== undefined) before = false;
      return pressedAt >= 0;
    });
    expect(before, "no slide before the first press").toBe(true);
    const st = factoryMoment("armorpress", factory(a, 7), a.sfx[0].w3);
    expect(st.plateT).toBeGreaterThanOrEqual(0);
    expect(st.plateT).toBeLessThan(0.1);
    // drawn: the factory shows wave3FactoryArt with that plateT (the plate's pixels on the chute)
    const v = view(a), p = b.items.find((q) => q.uid === 7)!;
    const x = Math.round(footX(FRAME, p.x, p.y, 2)), y = Math.round(footY(FRAME, p.x, p.y, 2));
    const fs = factory(a, 7), flash = fs.flash > 0;
    const fi = 0; // factoryFrame at t = 0
    const want = R(wave3FactoryArt("armorpress", fi, flash, 1, st)!), bare = R(wave3FactoryArt("armorpress", fi, flash, 1)!);
    const c = draw(v, true);
    let shown = 0, plain = 0;
    for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) {
      if (want.at(i, j) === bare.at(i, j)) continue;
      if (c.at(x + i, y + j) === want.at(i, j)) shown++;
      else if (c.at(x + i, y + j) === bare.at(i, j)) plain++;
    }
    expect([shown > 0, plain]).toEqual([true, 0]);
    // it plays out: 0.8 s later the slide is over
    for (let f = 0; f < 60; f++) a.update(DT);
    expect(factoryMoment("armorpress", factory(a, 7), a.sfx[0].w3).plateT).toBeGreaterThan(0.8);
    // only ARMOR PRESS has the moment
    expect(factoryMoment("press", factory(a, 7), a.sfx[0].w3)).toEqual({});
  });

  it("TWIN MOULD: every pour lights the factory's stamp flash (pourAll sets FactoryState.flash), drawn as its silhouette", () => {
    const b = mouldDeck();
    let pours = 0, flashed = 0;
    const a = new Arena(cloneBuild(b), barge(), SEED, null);
    a.quiet = true;
    let caught: RasterCanvas | null = null;
    for (let f = 0; f < 60 * 12; f++) {
      const ev = a.update(DT);
      for (const e of ev) if (e.type === "produce" && e.side === 0 && e.factory === 7) pours++;
      if (ev.some((e) => e.type === "produce" && e.side === 0 && e.factory === 7)) {
        if (factory(a, 7).flash > 0) flashed++;
        if (!caught) caught = draw(view(a));
      }
    }
    expect(pours).toBeGreaterThan(4);
    expect(flashed).toBe(pours); // one produce event a pour, and each pour flashes
    // the flash silhouette (white) is drawn over the mould
    const p = b.items.find((q) => q.uid === 7)!;
    const x = Math.round(footX(FRAME, p.x, p.y, 2)), y = Math.round(footY(FRAME, p.x, p.y, 2));
    const sil = R(factoryFlashSil("twinmould", 1));
    let white = 0, total = 0;
    for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) if (sil.at(i, j) !== null) { total++; if (caught!.at(x + i, y + j) === C.white) white++; }
    expect(white).toBeGreaterThan(total * 0.9);
    // the mould's pour is P1's own: one produce event, a slug onto both belts on the same tick
    const bt = new Battle(b, barge(), SEED);
    let twin = 0, prev = 0;
    while (bt.t < 8) {
      bt.step();
      const ev = bt.drainEvents(), f = bt.sides[0].factories.find((q) => q.uid === 7)!;
      if (ev.some((e) => e.type === "produce" && e.factory === 7) && f.produced - prev === 2) twin++;
      prev = f.produced;
    }
    expect(twin).toBeGreaterThan(2);
    expect(factorySprite("twinmould", 0, true, 1)).toBeDefined();
  });
});

// ====================================================================================================== the turrets

/** FURNACE's heavy gun on FRAME: its pivot (the gem and the gear boxes hang off it; tests/wave3Art.test.ts). */
function gunPivot(b: Build): { px: number; py: number } {
  const td = turretSlots(b)[0].td!;
  return { px: Math.round(turretPivotX(FRAME, td.col0, td.width)), py: Math.round(turretPivotY(FRAME, td.col0, td.width)) };
}
const PU = 12; // an orc HEAVY's pip offset (no race look)
/** The 3x3 face drawn in hardpoint box `gi` of FURNACE's heavy gun. */
function faceAt(c: RasterCanvas, b: Build, gi: number): (string | null)[] {
  const { px, py } = gunPivot(b), bu = -PU - 5 - 6 * gi;
  return Array.from({ length: 9 }, (_, k) => c.at(px + bu + 1 + (k % 3), py - 2 + Math.floor(k / 3)));
}

describe("A1's battle moments on the guns", () => {
  it("TWIN TRIGGER and SEAM WELDER: the gun's lamp or seam lights for a moment on each E2 pair", () => {
    for (const def of ["twintrigger", "seamwelder"]) {
      const b = withMod(withMod(twoPress(), 50, def, 0), 51, "calibrate", 0, 3);
      const a = play(b, barge(), (_x, ev) => ev.some((e) => e.type === "pair" && e.side === 0 && e.turret === 0));
      const w = a.sfx[0].w3.pairAge[0];
      expect(w, def).toBeLessThan(0.05);
      const st = gearMoment(def, 0, turret(a, 0), a.sfx[0].w3);
      expect(st.pair, def).toBe(w);
      expect(faceAt(draw(view(a)), b, 0), `${def}: lit`).toEqual(wave3GearFace(def, { pair: w }));
      expect(wave3GearFace(def, { pair: w })).not.toEqual(wave3GearFace(def));
      // 0.3 s on, with no new pair, the face is dark again
      let again = false;
      for (let f = 0; f < 24; f++) if (a.update(DT).some((e) => e.type === "pair" && e.side === 0)) again = true;
      if (!again) expect(faceAt(draw(view(a)), b, 0), `${def}: dark`).toEqual(wave3GearFace(def));
    }
    // no pair-reading gear: no pairs, no timer
    const plain = play(withMod(twoPress(), 51, "calibrate", 0, 3), barge(), (x) => x.b.t > 6);
    expect(plain.sfx[0].w3.pairAge[0]).toBe(Infinity);
  });

  // Y7b2 (the flip; DESIGN-Y row 47): SPALL CATCHER has no cap, so its face reads its charge over the gauge's full mark,
  // SPALL_GAUGE_ADDS x add (80 at ★1, where the cap was), and stays full past it (wave3Moments.ts gearMoment). Was "...
  // (TurretState.spall / its cap) ..."
  // BUMP-1E: the scaling rules ship on (SCALE_RIGS, bb-0.12.0), where SPALL CATCHER is a reader (+1 / +2 / +7 DMG at its gun's shot for each enemy
  // hit on your ship) and stores no charge (scale.ts SCALE_DEFS: no `spall`, no TurretState.spallCharge), so its face heating with the
  // charge, the 0.9.11 piece's, is read with the switch off, synchronously (withScaleRigs(fn, false))
  it("SPALL CATCHER: its face heats with its charge (TurretState.spall / its gauge's full mark), against a gun shooting at us", () => {
    expect(SCALE_RIGS).toBe(true);
    expect(ITEMS.spallcatcher.mod!.spall, "as shipped SPALL CATCHER is a reader: no charge").toBeUndefined();
    withScaleRigs(() => {
      // FURNACE's heavy gun with no belt (it never fires, so it never spends the charge), under the shooter's fire
      const b: Build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 0, y: 8 }], routes: [], mods: [{ uid: 50, def: "spallcatcher", turret: 0 }], beltCap: 30, hullBonus: 5000 };
      const faces = new Set<string>();
      const a = play(b, shooter(), (x) => {
        // Y7b2 (the flip): was (tu.spallCharge ?? 0) / tu.spall!.max (the cap; no max now)
        const tu = turret(x, 0), q = Math.min(1, (tu.spallCharge ?? 0) / (SPALL_GAUGE_ADDS * tu.spall!.add));
        const st = gearMoment("spallcatcher", 0, tu, x.sfx[0].w3);
        expect(st).toEqual({ charge: q }); // in battle always its charge (0: the cold face, as the build view's {})
        expect(wave3GearFace("spallcatcher", { charge: 0 })).toEqual(wave3GearFace("spallcatcher"));
        const face = faceAt(draw(view(x)), b, 0);
        expect(face).toEqual(wave3GearFace("spallcatcher", st));
        faces.add(face.join());
        return q >= 1;
      }, 120);
      // Y7b2 (the flip): the charge on the tick the face first reads full, measured 92.5 (past the full mark, 80: no cap; was
      // spall.max, the cap, 80, where the charge stopped)
      expect(turret(a, 0).spallCharge).toBe(92.5);
      expect(faces.size, "the face heats through its steps").toBeGreaterThanOrEqual(4);
      // the build view (no sim) shows the cold face
      expect(gearMoment("spallcatcher", 0, undefined, undefined)).toEqual({});
    }, false);
  });

  it("STEAM BREECH: the gauge kicks into the red while the hull is plated (TurretState.plated), white when bare", () => {
    const b = withMod(furnaceBench(), 50, "steambreech", 0);
    const { px, py } = gunPivot(b);
    const gem = (c: RasterCanvas) => c.at(px + 3 + 1, py + (PU - 8) + 3);
    const bare = play(b, barge(), (x) => x.b.t > 3);
    expect(turret(bare, 0).plated).toBe(false);
    expect(steamPlated(turret(bare, 0))).toBe(false);
    expect(gem(draw(view(bare)))).toBe(wave3Gem("steambreech", false));
    let primed = false;
    const hot = play(b, barge(), (x) => {
      if (!primed) { x.b.addPlate(x.b.sides[0], 20); primed = true; }
      return x.b.t > 3;
    });
    expect(turret(hot, 0).plated).toBe(true);
    expect(gem(draw(view(hot)))).toBe(wave3Gem("steambreech", true));
    expect(wave3Gem("steambreech", true)).toBe(C.red);
  });

  it("ANVIL BREECH: sparks fly off the muzzle with each shot (the `fire` event of routine anvil), for 0.3 s", () => {
    const b = withMod(furnaceBench(), 50, "anvil", 0);
    const a = play(b, barge(), (_x, ev) => ev.some((e) => e.type === "fire" && e.side === 0 && e.core === "anvil"));
    expect(a.sfx[0].w3.anvilAge[0]).toBeLessThan(ANVIL_TIME);
    const v = view(a), img = R(anvilSparks(Math.floor(a.sfx[0].w3.anvilAge[0] / 0.1)));
    const mx = Math.round(muzzleX(FRAME, v.build, 0) - img.width / 2), my = Math.round(muzzleY(FRAME, v.build, 0) - img.height / 2);
    const c = draw(v);
    let n = 0, lit = 0;
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) if (img.at(i, j) !== null) { lit++; if (c.at(mx + i, my + j) === img.at(i, j)) n++; }
    expect(n).toBe(lit);
    // without ANVIL BREECH no shot sparks
    const plain = play(furnaceBench(), barge(), (_x, ev) => ev.some((e) => e.type === "fire" && e.side === 0));
    expect(plain.sfx[0].w3.anvilAge[0]).toBe(Infinity);
  });
});

// =========================================================================================== IDLE, plating, display

describe("STOKER's IDLE dim in battle, the plating strip, and the display-only rule", () => {
  it("a STOKER that works a factory is not dimmed IDLE in battle (GateState.factoryHits); one beside no factory is", () => {
    const dimmed = (a: Arena, uid: number): boolean => {
      const p = a.b.sides[0].build.items.find((q) => q.uid === uid)!;
      const x = Math.round(footX(FRAME, p.x, p.y)), y = Math.round(footY(FRAME, p.x, p.y));
      const c = draw(view(a));
      let ink = 0;
      for (let j = 3; j <= 8; j++) for (let i = 3; i <= 8; i++) if (c.at(x + i, y + j) === C.ink) ink++;
      return ink === 36;
    };
    const works = play(withItem(pressBench(), item(30, "stoker", 6, 6, 0)), barge(), (x) => x.b.t > 2);
    expect(gate(works, 30).online).toBe(true);
    expect(gate(works, 30).hits).toEqual([]); // no belt hits: its factory hits alone keep it on duty
    expect(dimmed(works, 30)).toBe(false);
    const idle = play(withItem(pressBench(), item(30, "stoker", 8, 9, 0)), barge(), (x) => x.b.t > 2);
    expect(gate(idle, 30).factoryHits).toBeUndefined();
    expect(dimmed(idle, 30)).toBe(true);
  });

  it("any hull holding a wave-3 plating source shows its plating strip; FURNACE's and WEAVER's bare decks don't", () => {
    // BUMP-1E: the scaling rules ship on (SCALE_RIGS, bb-0.12.0), where SHIELD WALL (IRON WALL) is a reader and plates nothing (scale.ts
    // SCALE_DEFS), so as a plating source it is the 0.9.11 piece's: its row (the third element, `off`) is read with the switch off,
    // synchronously (withScaleRigs(fn, false)); the other rows are the same in both worlds, read as shipped
    expect(SCALE_RIGS).toBe(true);
    for (const [b, want, off] of [
      [withItem(furnaceBench(), item(30, "plateroller", 3, 3, 1)), true], [withItem(furnaceBench(), item(30, "shieldwall", 3, 3, 0)), true, true],
      [pressFurnace("armorpress"), true], [withMod(twoPress(), 50, "seamwelder", 0), true],
      [furnaceBench(), false], [heroStartBuild("weaver", 1), false], [withMod(furnaceBench(), 50, "anvil", 0), false],
      [withItem(furnaceBench(), item(30, "platebreaker", 3, 3, 0)), false],
    ] as [Build, boolean, boolean?][]) withScaleRigs(() => {
      expect(holdsPlating(b), b.items.map((p) => p.def).join() + b.mods.map((m) => m.def).join()).toBe(want);
      const a = new Arena(cloneBuild(b), barge(), SEED, null);
      expect(plated(a, 0)).toBe(want);
    }, !off);
    // BUMP-1E: as shipped (the switch on) IRON WALL plates nothing: its deck holds no plating source, so no strip (the row above, was `true`)
    const wall = withItem(furnaceBench(), item(30, "shieldwall", 3, 3, 0));
    expect(holdsPlating(wall)).toBe(false);
    expect(plated(new Arena(cloneBuild(wall), barge(), SEED, null), 0)).toBe(false);
    // BASTION shows it as H1 made it; its plate is the side's own pool
    const bas = new Arena(heroStartBuild("bastion", 1), barge(), SEED, null);
    expect(plated(bas, 0)).toBe(true);
    expect(bas.b.sides[0].race!.plating).toBe(bas.b.sides[0].plate);
    // a PLATE ROLLER's plating shows on the strip as it lands (the arena's plateShown follows SideState.plate)
    const a = play(withItem(furnaceBench(), item(30, "plateroller", 3, 3, 1)), barge(), (x) => x.b.sides[0].plate.plate >= 3);
    expect(a.sfx[0].plateShown).toBe(a.b.sides[0].plate.plate);
  });

  it("played on screen at any speed or skipped, a battle with the moments ends exactly as simulate() does", () => {
    const end = (bt: Battle) => [bt.winner, bt.ticks, bt.sides[0].hull.hp, bt.sides[1].hull.hp, bt.sides[0].plate.plate, bt.sides[0].stats.shots];
    const decks: [string, Build, Build][] = [
      ["latch", withItem(latchDeck(false, 0), item(40, "twinlatch", 4, 3, 0)), heroRefBuild("weaver", 3)],
      ["pairs", withMod(withMod(twoPress(false, 0), 50, "seamwelder", 0), 52, "anvil", 0), heroRefBuild("furnace", 3)],
      ["plating", withItem(withItem(furnaceBench(0), item(30, "shieldwall", 3, 3, 0)), item(31, "platebreaker", 5, 2, 0)), heroRefBuild("bastion", 4)],
      ["brace", withItem(withMod(furnaceBench(0), 50, "spallcatcher", 0), item(30, "braceframe", 3, 4, 0)), heroRefBuild("foundry", 5)],
    ];
    for (const [name, pa, pb] of decks) {
      const ref = simulate(cloneBuild(pa), cloneBuild(pb), 7);
      expect(ref.over, name).toBe(true);
      const skipped = new Arena(cloneBuild(pa), cloneBuild(pb), 7, null);
      skipped.finish();
      expect(end(skipped.b), `${name} skipped`).toEqual(end(ref));
      for (const speeds of [[1], [0.5, 1, 2, 4], [4]]) {
        const a = new Arena(cloneBuild(pa), cloneBuild(pb), 7, null);
        a.quiet = true;
        for (let f = 0; f < 60 * 400 && !a.b.over; f++) {
          a.speed = speeds[Math.floor(f / 240) % speeds.length];
          a.update(DT);
        }
        expect(end(a.b), `${name} at ${speeds}`).toEqual(end(ref));
      }
    }
  });
});

describe("the build view (no sim): what the deck itself gives the moments", () => {
  /** A deck drawn as the build screen draws it (no sim, no timers). */
  const buildView = (b: Build): CruiserView => ({ side: 0, build: b, model: cruiserModel(b), frame: FRAME, t: 0, tread: 0 });

  it("TWIN GAUGE on a matched belt and PINCER beside another rig show their state; alone, the plain look", () => {
    const gauge = withItem(heroStartBuild("foundry", 1), item(60, "twingauge", 1, 3, 1));
    expect(cruiserModel(gauge).rigs.get(60)!.w3).toEqual({ matched: true });
    const n = statePixels(draw(buildView(gauge)), gauge, 60, { matched: true }, false);
    expect([n.shown > 0, n.plain]).toEqual([true, 0]);
    const lone = withItem(furnaceBench(), item(60, "twingauge", 3, 3, 1));
    expect(cruiserModel(lone).rigs.get(60)!.w3).toBeUndefined();
    expect(statePixels(draw(buildView(lone)), lone, 60, { matched: true }, false).shown).toBe(0);

    const pincer = withItem(withItem(furnaceBench(), item(30, "pincer", 3, 3, 1)), item(31, "whetstone", 5, 3, 3));
    expect(cruiserModel(pincer).rigs.get(30)!.w3).toEqual({ crowd: 1 });
    const p = statePixels(draw(buildView(pincer)), pincer, 30, { crowd: 1 }, false);
    expect([p.shown > 0, p.plain]).toEqual([true, 0]);
    const alone = withItem(furnaceBench(), item(30, "pincer", 3, 3, 1));
    expect(cruiserModel(alone).rigs.get(30)!.w3).toBeUndefined();
    // the other rigs' wave-3 states need the battle: in the build view they keep their plain look
    for (const def of ["braceframe", "twinlatch", "platebreaker", "shieldwall"]) {
      expect(rigMoment(def, 30, null, undefined, undefined), def).toEqual({});
    }
  });

  it("a STOKER's factories flare in the build view (cruiserModel.stoked, from deck.ts stokeHits); no STOKER, no flare", () => {
    const b = withItem(pressBench(), item(30, "stoker", 6, 6, 0));
    expect([...cruiserModel(b).stoked]).toEqual([7]);
    expect([...cruiserModel(pressBench()).stoked]).toEqual([]);
    const fl = R(stokeFlare(0)), press = b.items.find((q) => q.uid === 7)!;
    const x = Math.round(footX(FRAME, press.x, press.y, 2)) + 17, y = Math.round(footY(FRAME, press.x, press.y, 2)) - 4;
    const count = (c: RasterCanvas) => {
      let n = 0;
      for (let j = 0; j < 9; j++) for (let i = 0; i < 7; i++) if (fl.at(i, j) !== null && c.at(x + i, y + j) === fl.at(i, j)) n++;
      return n;
    };
    expect(count(draw(buildView(b)))).toBe(fl.px.filter((q) => q !== null).length);
    expect(count(draw(buildView(pressBench())))).toBe(0);
  });
});

// the rig and gear ids the moments cover, against A1's list (REPORT-A1 5.2: 12 lines; PLATE ROLLER needs none)
describe("the twelve lines", () => {
  it("every wave-3 part with an Art-line moment is covered here", () => {
    const covered = ["twingauge", "pincer", "braceframe", "twinlatch", "stoker", "platebreaker", "shieldwall", "armorpress", "anvil", "steambreech", "twintrigger", "spallcatcher", "seamwelder"];
    for (const id of covered) expect(ITEMS[id], id).toBeDefined();
    expect(covered).toHaveLength(13); // 12 lines: TWIN TRIGGER and SEAM WELDER share the pair line
    void (null as unknown as HeroId);
  });
});
