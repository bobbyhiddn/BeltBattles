// 0.6.2s (REQ-BFG-031) step 3: the battle reads the build's slots, the deck operations (S5, S11), merging (S6),
// free copies (S7) and the per-turret race hooks (S9).
import { describe, expect, it } from "vitest";
import { Battle, gearStats, simulate, turretAt, FURNACE_LONG_BELT } from "../src/sim/battle";
import { ITEMS } from "../src/sim/content";
import {
  canFitGear, cloneBuild, deadEndsAt, gearOn, gearSlotsAt, installTurret, installedTurrets, moveTurret, removeTurret,
  routeInfo, setTurretList, startingTurrets, turretSlots, type Build,
} from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { makeRaceSide } from "../src/sim/races";
import { ECHO_TURRET } from "../src/sim/races/siphon";
import { gainModule, unfusedInRun } from "../src/game/fuse";
import { installFromCargo, moveInstalled, newRun, sellInstalled, sellInventory, storeTurret } from "../src/game/run";

/** FURNACE's start deck plus a PRESS at (6,6) whose belt runs up column 8 to the extra slot (cols 8-9). */
function furnaceTwoBelts(): Build {
  const b = heroStartBuild("furnace");
  b.items.push({ uid: 2, def: "press", x: 6, y: 6 });
  b.routes.push({ factory: 2, cells: [68, 58, 48, 38, 28, 18, 8] });
  return b;
}

function fires(b: Build, enemy: Build, seed: number): Map<number, number> {
  const bt = new Battle(b, enemy, seed);
  const n = new Map<number, number>();
  while (!bt.over && bt.ticks < 60 * 200) {
    bt.step();
    for (const e of bt.drainEvents()) if (e.type === "fire" && e.side === 0) n.set(e.turret, (n.get(e.turret) ?? 0) + 1);
  }
  return n;
}

describe("0.6.2s turret slots: battle (S9)", () => {
  it("an explicit starting list fights exactly like the absent field (same result, same ticks)", () => {
    for (const h of ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"] as const) {
      const a = heroStartBuild(h), e = heroStartBuild(h === "furnace" ? "weaver" : "furnace");
      const b = cloneBuild(a);
      b.turrets = startingTurrets(h);
      const x = simulate(a, e, 7), y = simulate(b, e, 7);
      expect(y.ticks).toBe(x.ticks);
      expect(y.sides.map((s) => s.hull.hp)).toEqual(x.sides.map((s) => s.hull.hp));
    }
  });

  it("an empty slot fights with nothing; its belt is a dead end; a turret installed there is fed and fires by its slot", () => {
    const b = furnaceTwoBelts();
    expect(routeInfo(b, 1).connected).toBe(false);
    expect(deadEndsAt(b, 1)).toEqual([1]);
    const bt0 = new Battle(b, heroStartBuild("weaver"), 3);
    expect(bt0.sides[0].turrets.map((t) => t.index)).toEqual([0]);
    const r = installTurret(b, { uid: 500, def: "carronade" }, 1);
    expect(r.ok).toBe(true);
    expect(routeInfo(b, 1).connected).toBe(true);
    expect(routeInfo(b, 1).turret).toBe(1);
    expect(deadEndsAt(b, 1)).toEqual([]);
    const bt = new Battle(b, heroStartBuild("weaver"), 3);
    expect(bt.sides[0].turrets.map((t) => t.index)).toEqual([0, 1]);
    expect(turretAt(bt.sides[0], 1)!.def.fireInterval).toBe(ITEMS.carronade.turret!.fireInterval);
    const n = fires(b, heroStartBuild("weaver"), 3);
    expect(n.get(1) ?? 0).toBeGreaterThan(0);
    expect(n.get(0) ?? 0).toBeGreaterThan(0);
  });

  it("a turret moved out of slot 0 leaves slot 0 empty: turrets are keyed by slot, not by position", () => {
    const b = furnaceTwoBelts();
    expect(moveTurret(b, 0, 1).ok).toBe(true);
    const bt = new Battle(b, heroStartBuild("weaver"), 5);
    expect(bt.sides[0].turrets.map((t) => t.index)).toEqual([1]);
    expect(turretAt(bt.sides[0], 0)).toBeUndefined();
    expect(routeInfo(b, 0).connected).toBe(false); // the kiln's belt under the empty slot is a dead end now
    const n = fires(b, heroStartBuild("weaver"), 5);
    expect([...n.keys()]).toEqual([1]);
  });

  it("FURNACE E1: a long belt shortens ANY turret's interval by the same share (0.72 s for the SCRAP CANNON, as before)", () => {
    const ref = heroRefBuild7();
    const bt = new Battle(ref, heroStartBuild("weaver"), 1);
    const t0 = turretAt(bt.sides[0], 0)!;
    expect(FURNACE_LONG_BELT).toBe(0.72);
    const g = gearStats(ref, 0);
    expect(t0.interval).toBeCloseTo(1.0 * 0.72 * g.fireMul, 12);
    const swapped = cloneBuild(ref);
    installTurret(swapped, { uid: 600, def: "rampart" }, 0);
    const bt2 = new Battle(swapped, heroStartBuild("weaver"), 1);
    expect(turretAt(bt2.sides[0], 0)!.interval).toBeCloseTo(0.75 * 0.72 * gearStats(swapped, 0).fireMul, 12);
  });
});

function heroRefBuild7(): Build {
  // FURNACE's start deck with its belt lengthened to 10 tiles (8+: E1's long belt)
  const b = heroStartBuild("furnace");
  b.routes[0] = { factory: 1, cells: [54, 53, 52, 42, 32, 22, 23, 24, 14, 4] };
  b.beltCap = 18;
  return b;
}

describe("0.6.2s turret slots: deck operations (S4, S5, S11)", () => {
  it("install into an occupied slot swaps; core and gear stay; gear beyond the new turret's gear slots returns, last placed first", () => {
    const b = heroStartBuild("furnace");
    // a 2-star SCRAP CANNON (2 gear slots) with two pieces of gear and a core
    setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, stars: 2, free: true }]);
    expect(gearSlotsAt(b, 0)).toBe(2);
    b.mods.push({ uid: 11, def: "calibrate", turret: 0 }, { uid: 12, def: "chamber", turret: 0 }, { uid: 13, def: "rotary", turret: 0 });
    expect(gearOn(b, 0).map((m) => m.uid)).toEqual([11, 12]); // hardpoint order = Build.mods order
    expect(canFitGear(b, 0, "hopper").ok).toBe(false);
    const r = installTurret(b, { uid: 700, def: "carronade" }, 0);
    expect(r.ok).toBe(true);
    expect(r.turrets).toEqual([{ uid: 90, def: "scrapcannon", stars: 2, free: true }]);
    expect(r.mods.map((m) => m.uid)).toEqual([12]); // the last placed gear comes back
    expect(b.mods.map((m) => m.uid).sort()).toEqual([11, 13]); // the first gear and the core stay in the slot
    expect(turretSlots(b)[0].turret!.def).toBe("carronade");
  });

  it("move to an empty slot empties the old slot (its core and gear come back); swap keeps each slot's gear", () => {
    const b = heroStartBuild("weaver");
    b.mods.push({ uid: 11, def: "calibrate", turret: 0 }, { uid: 12, def: "chamber", turret: 2 });
    const r = moveTurret(b, 0, 3); // slot 3: WEAVER's extra slot (cols 6-7)
    expect(r.ok).toBe(true);
    expect(r.mods.map((m) => m.uid)).toEqual([11]);
    expect(b.mods.map((m) => m.uid)).toEqual([12]);
    expect(turretSlots(b)[0].turret).toBeUndefined();
    expect(turretSlots(b)[3].turret!.uid).toBe(90);
    expect(turretSlots(b)[3].intakes).toEqual([6]); // inner: col 6 is nearer x 4.5 than col 7
    const s = moveTurret(b, 3, 2); // swap with the DART GUN in slot 2
    expect(s.ok).toBe(true);
    expect(s.mods).toEqual([]);
    expect(turretSlots(b)[2].turret!.uid).toBe(90);
    expect(turretSlots(b)[3].turret!.uid).toBe(92);
    expect(b.mods).toEqual([{ uid: 12, def: "chamber", turret: 2 }]);
  });

  it("the field is written only while the layout differs from the start (moving back drops it)", () => {
    const b = heroStartBuild("furnace");
    moveTurret(b, 0, 1);
    expect(b.turrets).toEqual([{ slot: 1, def: "scrapcannon", uid: 90, free: true }]);
    moveTurret(b, 1, 0);
    expect("turrets" in b).toBe(false);
    expect(JSON.stringify(b)).toBe(JSON.stringify(heroStartBuild("furnace")));
    const r = removeTurret(b, 0);
    expect(r.turrets).toEqual([{ uid: 90, def: "scrapcannon", free: true }]);
    expect(b.turrets).toEqual([]);
    expect(installedTurrets(b)).toEqual([]);
    expect(installTurret(b, r.turrets[0], 0).ok).toBe(true);
    expect("turrets" in b).toBe(false);
  });

  it("refuses what the rules forbid", () => {
    const b = heroStartBuild("furnace");
    expect(installTurret(b, { uid: 5, def: "calibrate" }, 1).reason).toBe("NOT A TURRET");
    expect(installTurret(b, { uid: 5, def: "rampart" }, 2).reason).toBe("NO SUCH TURRET SLOT");
    expect(installTurret(b, { uid: 90, def: "scrapcannon" }, 1).reason).toBe("ALREADY INSTALLED");
    expect(moveTurret(b, 1, 0).reason).toBe("EMPTY TURRET SLOT");
    expect(canFitGear(b, 1, "calibrate").reason).toBe("EMPTY TURRET SLOT");
    b.mods.push({ uid: 11, def: "calibrate", turret: 0 });
    expect(canFitGear(b, 0, "chamber").reason).toBe("NO FREE GEAR SLOT");
    setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, stars: 3, free: true }]);
    expect(gearSlotsAt(b, 0)).toBe(3);
    expect(canFitGear(b, 0, "calibrate").reason).toBe("THIS TURRET ALREADY HAS ONE");
    expect(canFitGear(b, 0, "chamber").ok).toBe(true);
  });
});

describe("0.6.2s turret slots: run operations, merging and value (S5-S7)", () => {
  it("buying a copy of the starting turret merges into the installed free copy: 2 stars, free, worth one price", () => {
    const run = newRun("furnace", 11);
    const g = gainModule(run, "scrapcannon");
    expect(g.steps.length).toBe(1);
    expect(g.where).toBe("slot");
    expect(g.survivor).toBe(90);
    expect(run.build.turrets).toEqual([{ slot: 0, def: "scrapcannon", uid: 90, stars: 2, free: true }]);
    expect(run.inventory.length).toBe(0);
    expect(unfusedInRun(run)).toEqual([]);
    // a 2-star starting turret sells for half its one-price value
    expect(sellInstalled(run, 0)).toBe(3);
    expect(installedTurrets(run.build)).toEqual([]);
  });

  it("two free copies never merge (WEAVER keeps three DART GUNs); a bought one merges with one of them", () => {
    const run = newRun("weaver", 12);
    expect(unfusedInRun(run)).toEqual([]);
    const g = gainModule(run, "dartgun");
    expect(g.steps.length).toBe(1);
    expect(installedTurrets(run.build).map((s) => [s.slot, s.turret.uid, s.turret.stars ?? 1, !!s.turret.free]))
      .toEqual([[0, 90, 2, true], [1, 91, 1, true], [2, 92, 1, true]]);
    expect(unfusedInRun(run)).toEqual([]);
  });

  it("a 1-star starting turret goes to cargo and back but can't be sold; a bought one sells at half its price", () => {
    const run = newRun("furnace", 13);
    expect(storeTurret(run, 0).ok).toBe(true);
    const it = run.inventory.find((i) => i.def === "scrapcannon")!;
    expect(it).toEqual({ uid: 90, def: "scrapcannon", free: true });
    const gold = run.gold;
    expect(sellInventory(run, 90)).toBe(0);
    expect(run.gold).toBe(gold);
    expect(installFromCargo(run, 90, 1).ok).toBe(true);
    expect(turretSlots(run.build)[1].turret!.uid).toBe(90);
    const g = gainModule(run, "rampart");
    expect(installFromCargo(run, g.uid, 0).ok).toBe(true);
    expect(moveInstalled(run, 0, 1).ok).toBe(true); // swap
    expect(turretSlots(run.build)[0].turret!.def).toBe("scrapcannon");
    expect(sellInstalled(run, 0)).toBe(0); // the 1-star starting copy stays
    expect(sellInstalled(run, 1)).toBe(3); // RAMPART CANNON: max(1, floor(6 / 2))
  });
});

describe("0.6.2s turret slots: race hooks on a bought or moved turret (S9)", () => {
  it("FOUNDRY alloy fusion needs a two-column intake: a both-intake turret fuses, an inner one leaves a dead end", () => {
    const e = heroStartBuild("furnace");
    const base = heroStartBuild("foundry");
    const fusions = (b: Build) => {
      const bt = simulate(b, e, 9);
      return bt.sides[0].race!.foundry.fusions;
    };
    expect(fusions(base)).toBeGreaterThan(0);
    const rampart = cloneBuild(base);
    installTurret(rampart, { uid: 800, def: "rampart" }, 0); // heavy, both columns
    expect(fusions(rampart)).toBeGreaterThan(0);
    const dart = cloneBuild(base);
    installTurret(dart, { uid: 801, def: "dartgun" }, 0); // light, inner column only: col 3
    expect(turretSlots(dart)[0].intakes).toEqual([3]);
    expect(deadEndsAt(dart, 0)).toEqual([0]); // the belt to col 2 is a dead end now
  });

  it("METRONOME's pendulum shift is per slot; SIPHON's echo stays with slot 1 whatever turret sits there", () => {
    const m = heroStartBuild("metronome");
    installTurret(m, { uid: 810, def: "swivel" }, 1);
    m.mods.push({ uid: 20, def: "escapement", turret: 1 });
    const rs = makeRaceSide(m)!;
    expect(rs.shift.length).toBe(turretSlots(m).length);
    expect(rs.shift[0]).toBe(0);
    expect(rs.shift[1]).toBeLessThan(0);
    expect(ECHO_TURRET).toBe(1);
    const s = heroStartBuild("siphon");
    installTurret(s, { uid: 820, def: "carronade" }, 1); // a bought turret in the echo slot
    expect(turretSlots(s)[1].intakes).toEqual([7, 8]);
    const bt = new Battle(s, heroStartBuild("furnace"), 4);
    expect(turretAt(bt.sides[0], 1)!.def.kind).toBe("medium");
  });
});
