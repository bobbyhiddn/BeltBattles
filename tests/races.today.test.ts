// 0.8.0 H1 M0 (REQ-BFG-011): FOUNDRY's and BASTION's race rules on TODAY's rules (0.6.2 / 0.7.0). The races were written
// on 0.4.1-0.5.x. Since then rigs stand beside the belt (BELTSIDE), belts may join, turrets carry bought cores and gear
// in gear slots, every hull has an extra turret slot (REQ-BFG-031) and copies merge into stars. These tests show the race
// mechanics still hold with each of those (docs/RACES.md sections 1-2, tuning v1):
//  - FOUNDRY: the twin pour (both routes on one tick), the 0.25 s sync window, fusion at 1.3 x (blank A + blank B);
//  - BASTION: 2 plating per bulwark slug at load (x its split multiplier), the cap of 24, plating soaks impacts and Burn
//    before hull, and the dark wind goes straight to hull.
// Belt joins with both heroes and the HOPPER store are already pinned in tests/joins.sim.test.ts (J7) and
// tests/fb062.hopper.test.ts; they are not repeated here.
import { describe, expect, it } from "vitest";
import { Battle, simulate } from "../src/sim/battle";
import { AMMO, WIND_START, type HeroId } from "../src/sim/content";
import { installTurret, key as K, routeInfo, rotField, setTurretList, turretSlots, type Build, type Placed } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { FUSE_MULT, SYNC_WINDOW } from "../src/sim/races/foundry";
import { PLATE_CAP, PLATE_PER_SLUG } from "../src/sim/races/bastion";
import { RACE_AMMO } from "../src/sim/races/data";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { dummyFoe, shots } from "./races.helpers";

const rig = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed =>
  ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
const start = (hero: HeroId): Build => heroStartBuild(hero, 1);
const BLANK = RACE_AMMO.blank.base; // 3.5 (tuning v1)
const SYNCED = FUSE_MULT * (BLANK + BLANK); // 9.1
const flatOf = (def: string, stars: number): number => effectAt(def, stars).gate!.flat ?? 0;

/** Step a battle for `secs` (or to its end); return side 0's fuse events and loads by tick. */
function trace(bt: Battle, secs: number): { fuses: { tick: number; turret: number; dmg: number }[]; loads: number; fired: { turret: number }[] } {
  const fuses: { tick: number; turret: number; dmg: number }[] = [];
  const fired: { turret: number }[] = [];
  let loads = 0;
  while (!bt.over && bt.t < secs) {
    bt.step();
    for (const e of bt.events) {
      if (e.type === "fuse" && e.side === 0) fuses.push({ tick: bt.ticks, turret: e.turret, dmg: e.dmg });
      if (e.type === "load" && e.side === 0) loads++;
      if (e.type === "fire" && e.side === 0) fired.push({ turret: e.turret });
    }
    bt.events.length = 0;
  }
  return { fuses, loads, fired };
}

describe("FOUNDRY on today's rules", () => {
  it("the twin pour: every pour puts a blank on both routes on the same tick", () => {
    const bt = new Battle(start("foundry"), dummyFoe(), 7);
    const s = bt.sides[0];
    let pours = 0;
    while (bt.t < 12) {
      const before = s.routes.map((r) => r.ammo.length);
      bt.step();
      const grew = s.routes.map((r, i) => (r.ammo.length > before[i] && r.ammo[r.ammo.length - 1].s < 1 ? 1 : 0));
      if (grew[0] || grew[1]) {
        pours++;
        expect(grew).toEqual([1, 1]); // never one route alone
      }
      bt.events.length = 0;
    }
    expect(pours).toBeGreaterThanOrEqual(6);
  });

  it("BELTSIDE rigs: mirrored WHETSTONEs beside both routes fuse every pour into 1.3 x (5.5 + 5.5)", () => {
    const b = start("foundry");
    b.items.push(rig(2, "whetstone", 1, 3, 1), rig(3, "whetstone", 4, 3, 3)); // west of (2,3) facing it; east of (3,3) facing it
    const fired = shots(new Battle(b, dummyFoe(), 7), 25).filter((s) => s.ammo === "alloy");
    expect(fired.length).toBeGreaterThan(8);
    const w = flatOf("whetstone", 1);
    expect(fired[fired.length - 1].dmg).toBeCloseTo(FUSE_MULT * (2 * (BLANK + w)), 9);
  });

  it("merging: a WHETSTONE ★2 on one route fuses as 1.3 x (blank + its ★2 flat + blank)", () => {
    const b = start("foundry");
    b.items.push(rig(2, "whetstone", 1, 3, 1, 2));
    const fired = shots(new Battle(b, dummyFoe(), 7), 25).filter((s) => s.ammo === "alloy");
    expect(fired.length).toBeGreaterThan(8);
    expect(fired[fired.length - 1].dmg).toBeCloseTo(FUSE_MULT * (BLANK + flatOf("whetstone", 2) + BLANK), 9);
  });

  it("speed rigs: GREASE on one route desyncs it (no fusion); mirrored GREASE on the same tile keeps sync", () => {
    const one = start("foundry");
    one.items.push(rig(2, "grease", 1, 4, 1)); // route 0's tile 1 only
    expect(trace(new Battle(one, dummyFoe(), 7), 30).fuses.length).toBe(0);
    const both = start("foundry");
    both.items.push(rig(2, "grease", 1, 4, 1), rig(3, "grease", 4, 4, 3));
    const t = trace(new Battle(both, dummyFoe(), 7), 30);
    expect(t.fuses.length).toBeGreaterThan(8);
    for (const f of t.fuses) expect(f.dmg).toBeCloseTo(SYNCED, 9);
  });

  it("the sync window: a route 2 tiles longer (0.8 s late) never fuses; a delay line one pour long (4 tiles, 1.6 s) fuses", () => {
    // two routes from the Crucible's top edge to gun 1's two intakes differ by an even number of tiles (grid parity), so
    // 2 tiles (0.8 s) is the nearest miss; tests/races.foundry.test.ts pins it with another path
    expect(SYNC_WINDOW).toBe(0.25);
    const late = start("foundry");
    late.routes[1] = { factory: late.routes[1].factory, cells: [K(3, 5), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(3, 1), K(3, 0)] };
    expect(routeInfo(late, 1).turret).toBe(0);
    expect(late.routes[1].cells.length - late.routes[0].cells.length).toBe(2);
    expect(trace(new Battle(late, dummyFoe(), 7), 30).fuses.length).toBe(0);
    const delay = start("foundry"); // route 1: 10 tiles, 1.6 s (one pour) behind route 0: it meets the next pour's blank
    delay.routes[1] = { factory: delay.routes[1].factory, cells: [K(3, 5), K(4, 5), K(5, 5), K(5, 4), K(5, 3), K(4, 3), K(4, 2), K(4, 1), K(3, 1), K(3, 0)] };
    expect(routeInfo(delay, 1).turret).toBe(0);
    expect(delay.routes[1].cells.length - delay.routes[0].cells.length).toBe(4);
    const d = trace(new Battle(delay, dummyFoe(), 7), 30);
    expect(d.fuses.length).toBeGreaterThan(8);
    for (const f of d.fuses) expect(f.dmg).toBeCloseTo(SYNCED, 9);
  });

  it("turret gear: CALIBRATION on the fusing gun keeps every pour fusing (9.1 a slug)", () => {
    const b = start("foundry");
    b.mods.push({ uid: 20, def: "calibrate", turret: 0 });
    const t = trace(new Battle(b, dummyFoe(), 7), 25);
    expect(t.fuses.length).toBeGreaterThan(8);
    for (const f of t.fuses) expect(f).toMatchObject({ turret: 0, dmg: SYNCED });
  });

  it("turret cores: a bought ROTARY BREECH on the fusing gun still fuses, and fires alloy slugs at 9.1", () => {
    const b = start("foundry");
    b.mods.push({ uid: 21, def: "rotary", turret: 0 });
    const bt = new Battle(b, dummyFoe(), 7);
    expect(bt.sides[0].turrets[0].core.bought).toBe(true);
    const fired = shots(bt, 25);
    expect(bt.sides[0].race!.foundry.fusions).toBeGreaterThan(8);
    expect(fired.filter((s) => s.ammo === "alloy").length).toBeGreaterThan(8);
    for (const s of fired.filter((x) => x.ammo === "alloy")) expect(s.dmg).toBeCloseTo(SYNCED, 9);
  });

  it("merged starting gun: a CARRONADE ★2 (the free copy merged with a bought one) still fuses", () => {
    const b = start("foundry");
    setTurretList(b, [{ slot: 0, def: "carronade", uid: 90, stars: 2, free: true }, { slot: 1, def: "carronade", uid: 91, free: true }]);
    const t = trace(new Battle(b, dummyFoe(), 7), 25);
    expect(t.fuses.length).toBeGreaterThan(8);
  });

  it("the extra turret slot: a gun installed there and fed by a STAMP PRESS fires; gun 1 keeps fusing", () => {
    const b = start("foundry");
    expect(turretSlots(b).length).toBe(3);
    expect(installTurret(b, { uid: 500, def: "carronade" }, 2).ok).toBe(true);
    b.items.push({ uid: 30, def: "press", x: 4, y: 6 });
    b.routes.push({ factory: 30, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] });
    expect(routeInfo(b, 2).turret).toBe(2);
    const t = trace(new Battle(b, dummyFoe(), 7), 25);
    expect(t.fuses.length).toBeGreaterThan(8);
    expect(t.fired.some((f) => f.turret === 2)).toBe(true);
  });

  it("a STAMP PRESS belt joining a Crucible route: the plain slugs never fuse, the twin blanks still do", () => {
    const b = start("foundry");
    b.beltCap = 26;
    b.items.push({ uid: 30, def: "press", x: 0, y: 6 });
    b.routes.push({ factory: 30, cells: [K(0, 5), K(0, 4), K(1, 4)], join: K(2, 4) });
    expect(routeInfo(b, 2).join).toBeTruthy();
    const bt = new Battle(b, dummyFoe(), 7);
    const fired = shots(bt, 30);
    expect(bt.sides[0].race!.foundry.fusions).toBeGreaterThan(5);
    expect(fired.some((s) => s.ammo === "plain")).toBe(true);
    expect(fired.filter((s) => s.ammo === "alloy").length).toBe(bt.sides[0].race!.foundry.fusions);
  });
});

describe("BASTION on today's rules", () => {
  const plated = (b: Build, secs: number, foe = dummyFoe(), seed = 3) => {
    const bt = new Battle(b, foe, seed);
    const ps = bt.sides[0].race!.plating;
    let max = 0;
    while (!bt.over && bt.t < secs) {
      bt.step();
      bt.events.length = 0;
      max = Math.max(max, ps.plate);
    }
    return { bt, ps, max };
  };

  it("BELTSIDE rigs (WHETSTONE, TEMPER) on the bulwark line: plating still climbs to exactly 24 and never passes it", () => {
    const b = start("bastion");
    b.items.push(rig(2, "whetstone", 3, 3, 1), rig(3, "temper", 3, 4, 1));
    const { ps, max } = plated(b, 40);
    expect(max).toBe(PLATE_CAP);
    expect(ps.gained).toBe(PLATE_CAP);
  });

  it("a SPLITTER on the bulwark line: each 60% copy plates 2 x 0.6 = 1.2", () => {
    const b = start("bastion");
    b.items.push(rig(2, "splitter", 3, 3, 1));
    const bt = new Battle(b, dummyFoe(), 3);
    const ps = bt.sides[0].race!.plating;
    const steps: number[] = [];
    let last = 0;
    while (bt.t < 20 && ps.plate < PLATE_CAP - 2) {
      bt.step();
      bt.events.length = 0;
      if (ps.plate !== last) steps.push(+(ps.plate - last).toFixed(9));
      last = ps.plate;
    }
    expect(steps.some((d) => Math.abs(d - PLATE_PER_SLUG * effectAt("splitter", 1).gate!.split!.mult) < 1e-9)).toBe(true);
  });

  it("turret gear and a bought core on the heavy gun, the gun merged to ★2, a gun in the extra slot: plating still reaches 24 and every gun fires", () => {
    const b = start("bastion");
    setTurretList(b, [{ slot: 0, def: "rampart", uid: 90, stars: 2, free: true }]);
    b.mods.push({ uid: 20, def: "calibrate", turret: 0 }, { uid: 21, def: "rotary", turret: 0 });
    expect(installTurret(b, { uid: 500, def: "carronade" }, 1).ok).toBe(true); // the extra slot, col0 0
    b.items.push({ uid: 30, def: "press", x: 0, y: 6 });
    b.routes.push({ factory: 30, cells: [K(0, 5), K(0, 4), K(0, 3), K(0, 2), K(0, 1), K(0, 0)] });
    expect(routeInfo(b, 1).turret).toBe(1);
    const bt = new Battle(b, dummyFoe(), 3);
    const t = trace(bt, 40);
    expect(bt.sides[0].race!.plating.gained).toBe(PLATE_CAP);
    expect(new Set(t.fired.map((f) => f.turret))).toEqual(new Set([0, 1]));
  });

  it("plain slugs never plate (a STAMP PRESS on the heavy gun's second connector)", () => {
    const b = start("bastion");
    b.routes = []; // no bulwark line: only the press feeds the gun
    b.items.push({ uid: 30, def: "press", x: 6, y: 6 });
    b.routes.push({ factory: 30, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
    const bt = new Battle(b, dummyFoe(), 3);
    const t = trace(bt, 20);
    expect(t.loads).toBeGreaterThan(5);
    expect(bt.sides[0].race!.plating.gained).toBe(0);
  });

  it("plating soaks impacts and Burn before the hull: hull loss = the foe's damage (its Burn included) - plating spent + dark wind", () => {
    // the foe: FURNACE with TEMPER on its kiln belt, so its hits burn (stats.damage counts the Burn ticks too)
    const foe = start("furnace");
    foe.items.push(rig(40, "temper", 3, 3, 1), rig(41, "temper", 5, 2, 3));
    const me = start("bastion");
    me.items.push(rig(2, "whetstone", 3, 3, 1));
    for (const seed of [1, 2, 3, 4]) {
      const bt = simulate(me, foe, seed);
      const mine = bt.sides[0], theirs = bt.sides[1];
      const pl = mine.race!.plating;
      expect(theirs.stats.burnDealt).toBeGreaterThan(0);
      expect(pl.absorbed).toBeGreaterThan(0);
      expect(mine.hull.max - mine.hull.hp).toBeCloseTo(theirs.stats.damage - pl.absorbed + mine.stats.windTaken, 6);
    }
  });

  it("a Burn tick with plating up costs no hull: the plating takes it point for point", () => {
    const foe = start("furnace");
    foe.items.push(rig(40, "temper", 3, 3, 1), rig(41, "temper", 5, 2, 3));
    const bt = new Battle(start("bastion"), foe, 2);
    const mine = bt.sides[0], pl = mine.race!.plating;
    let checked = 0;
    while (!bt.over && bt.t < WIND_START) {
      const hp = mine.hull.hp, plate = pl.plate;
      bt.step();
      const burn = bt.events.filter((e) => e.type === "burn" && e.side === 0).reduce((s, e) => s + (e as { dmg: number }).dmg, 0);
      const hit = bt.events.some((e) => e.type === "impact" && e.side === 0);
      bt.events.length = 0;
      if (burn > 0 && !hit && plate >= burn + 1e-9) {
        expect(mine.hull.hp).toBeCloseTo(hp, 9);
        expect(pl.plate).toBeLessThan(plate);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("the dark wind goes straight to the hull: with full plating and no foe fire, hull loss = wind taken, plating untouched", () => {
    const { bt, ps } = plated(start("bastion"), 60);
    const me = bt.sides[0];
    expect(ps.plate).toBe(PLATE_CAP);
    expect(me.stats.windTaken).toBeGreaterThan(0);
    expect(me.hull.max - me.hull.hp).toBeCloseTo(me.stats.windTaken, 9);
    expect(ps.absorbed).toBe(0);
  });
});

describe("the race ammo's numbers are tuning v1's", () => {
  it("ALLOY BLANK 3.5, BULWARK SLUG 5, FUSE_MULT 1.15, 2 plating a slug, cap 24", () => {
    expect([AMMO.blank.base, AMMO.bulwark.base, FUSE_MULT, PLATE_PER_SLUG, PLATE_CAP]).toEqual([3.5, 5, 1.15, 2, 24]);
  });
});
