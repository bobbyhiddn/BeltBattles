// 0.6.2 final balance pass, FB-B (ref/BRIEF-fb-B-mods.md item 1, ref/HOPPER-DIAG.md; design: oracle 16085a6430e4cc6a):
// HOPPER. Every star keeps ★1's window (+1 slot) and timer (+0.5 s). ★2/★3 add a store: while the gun fires it takes
// 1/2 loads off the belt, and they drop into the next window; ★3 BOTTOMLESS never jams. Was: ★2 +2 slots and +1.0 s,
// ★3 +3 and +1.5 s. On a sparse belt the extra slot sat empty while the longer timer delayed every shot, so ★2 was a
// WORSE row on the E1 day-7 bench (first shot 4.15 s at ★1, 4.65 s at ★2 in HOPPER-DIAG's fight).
import { describe, expect, it } from "vitest";
import { Battle, type Payload } from "../src/sim/battle";
import { ITEMS, WINDOW_TIME } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { effectAt } from "../src/sim/stars";
import { levelLine, starEffectLine } from "../src/screens/build/inspector";
import { barge, bench, busy, run, SEED } from "./arsenal.bench";

const STARS = [1, 2, 3];
const payload = (id: number): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 7, copy: false });

/** Every shot turret 0 of side 0 fires in `secs` (battle times), and the most loads its store held at once. */
function shots(b: Build, secs = 40): { times: number[]; storeMost: number; stored: number; jams: number; damage: number } {
  const times: number[] = [];
  let storeMost = 0, stored = 0, prev = 0;
  const bt = run(b, secs, barge(), SEED, (ev, x) => {
    for (const e of ev) if (e.type === "fire" && e.side === 0 && e.turret === 0) times.push(+x.t.toFixed(6));
    const n = x.sides[0].turrets[0].store.length;
    if (n > prev) stored += n - prev;
    prev = n;
    storeMost = Math.max(storeMost, n);
  });
  return { times, storeMost, stored, jams: bt.sides[0].stats.jams, damage: bt.sides[0].stats.damage };
}

describe("FB-B HOPPER: ★1's window at every star, plus a store for loads that arrive while the gun fires", () => {
  it("the rule: +1 slot and +0.5 s at every star; a store of 0/1/2; ★3 never jams", () => {
    const tu = (s: number) => new Battle(bench([], [["hopper", s]]), barge(), SEED).sides[0].turrets[0];
    expect(STARS.map((s) => [tu(s).window, tu(s).windowTime, tu(s).storeMax, tu(s).noJam])).toEqual([
      [4, WINDOW_TIME + 0.5, 0, false], [4, WINDOW_TIME + 0.5, 1, false], [4, WINDOW_TIME + 0.5, 2, true],
    ]);
    expect(STARS.map((s) => effectAt("hopper", s).mod)).toEqual([
      { window: 1, windowTime: 0.5 }, { window: 1, windowTime: 0.5, store: 1 }, { window: 1, windowTime: 0.5, store: 2, noJam: true },
    ]);
  });

  it("(brief test 1) a sparse route: ★2 and ★3 fire their first shot no later than ★1, and no shot later either", () => {
    const [one, two, three] = STARS.map((s) => shots(bench([], [["hopper", s]])));
    expect(one.times.length).toBeGreaterThan(20);
    expect(two.times[0], "★2 first shot").toBeLessThanOrEqual(one.times[0]);
    expect(three.times[0], "★3 first shot").toBeLessThanOrEqual(one.times[0]);
    for (const x of [two, three]) {
      expect(x.times.length).toBeGreaterThanOrEqual(one.times.length);
      one.times.forEach((t, k) => expect(x.times[k], `shot ${k}`).toBeLessThanOrEqual(t + 1e-9));
    }
    // the old ★2 (+2 slots, +1.0 s), for the record: its first shot slipped behind ★1's on this belt
    const old = new Battle(bench([], [["hopper", 1]]), barge(), SEED);
    old.sides[0].turrets[0].window += 1;
    old.sides[0].turrets[0].windowTime += 0.5;
    let first = -1;
    while (first < 0 && old.t < 10) { old.step(); for (const e of old.drainEvents()) if (e.type === "fire" && e.side === 0 && first < 0) first = old.t; }
    expect(first, "the old ★2's first shot").toBeGreaterThan(one.times[0]);
  });

  it("(brief test 2) simultaneous arrivals while the gun fires: ★2 stores one, ★3 both; ★1 leaves them on the belt", () => {
    for (const s of STARS) {
      // the busy bench: the Kiln's belt and the STAMP PRESS's belt both feed turret 0; the factories are stopped
      const bt = new Battle(busy([["hopper", s]]), barge(), SEED), me = bt.sides[0], tu = me.turrets[0];
      for (const f of me.factories) f.timer = 1000;
      tu.stack.push(payload(1), payload(2), payload(3), payload(4));
      tu.phase = "fire";
      tu.fireCd = 100; // the gun is busy firing this window
      const [a, b] = [payload(11), payload(12)];
      me.routes[0].ammo.push({ p: a, s: me.routes[0].L, processed: me.routes[0].cells.length - 1, blocked: false });
      me.routes[1].ammo.push({ p: b, s: me.routes[1].L, processed: me.routes[1].cells.length - 1, blocked: false });
      bt.step();
      expect(tu.store.map((x) => x.p.id), `★${s} stored`).toEqual([[], [11], [11, 12]][s - 1]);
      expect(me.routes.map((r) => r.ammo.length), `★${s} left on the belts`).toEqual([[1, 1], [0, 1], [0, 0]][s - 1]);
      expect(tu.stack.map((p) => p.id), `★${s}: the firing window is untouched`).toEqual([1, 2, 3, 4]);
    }
  });

  it("the stored loads drop into the next window, oldest first, the moment the last load of this one fires", () => {
    for (const s of [2, 3]) {
      const bt = new Battle(busy([["hopper", s]]), barge(), SEED), me = bt.sides[0], tu = me.turrets[0];
      for (const f of me.factories) f.timer = 1000;
      tu.stack.push(payload(1));
      tu.phase = "fire";
      tu.fireCd = 0.5;
      tu.store.push({ p: payload(21), route: 0 }, ...(s === 3 ? [{ p: payload(22), route: 1 }] : []));
      let dropped: number[] = [];
      while (bt.t < 1) {
        bt.step();
        if (tu.phase === "load" && !dropped.length) dropped = tu.stack.map((p) => p.id);
      }
      expect(dropped, `★${s}`).toEqual(s === 3 ? [21, 22] : [21]);
      expect(tu.store, `★${s}`).toEqual([]);
    }
  });

  // measured (60 s): ★1 38 shots, 18 jams, 185.2 damage; ★2 38, 18, 196.4 (10 loads stored); ★3 56, 0, 276.2 (30 stored).
  // Both belts together outrun the gun, so the backlog stays past the jam threshold even with a load in the store.
  it("two belts into one gun (saturated): the store takes loads off the belts; each star deals more, none jams more", () => {
    const [one, two, three] = STARS.map((s) => shots(busy([["hopper", s]], 5000), 60));
    expect([one.storeMost, two.storeMost, three.storeMost]).toEqual([0, 1, 2]);
    expect(two.stored).toBeGreaterThan(0);
    expect(two.jams).toBeLessThanOrEqual(one.jams);
    expect(three.jams).toBe(0); // BOTTOMLESS
    expect(two.times.length).toBeGreaterThanOrEqual(one.times.length);
    expect(three.times.length).toBeGreaterThanOrEqual(two.times.length);
    expect(two.damage).toBeGreaterThan(one.damage);
    expect(three.damage).toBeGreaterThan(two.damage);
  });

  it("PRESSURE BREECH counts stored loads as queued, so a HOPPER never lowers its bonus", () => {
    const bonusAt = (s: number) => {
      const b = busy([["hopper", s], ["pressure", 1]]);
      const bt = new Battle(b, barge(), SEED), me = bt.sides[0], tu = me.turrets[0];
      for (const f of me.factories) f.timer = 1000;
      tu.stack.push(payload(1), payload(2));
      tu.phase = "fire";
      tu.fireCd = 0.2;
      // one more load arrives at the Kiln's intake while the gun fires: ★1 leaves it waiting on the belt, ★2 stores it
      me.routes[0].ammo.push({ p: payload(3), s: me.routes[0].L, processed: me.routes[0].cells.length - 1, blocked: false });
      let dmg = -1;
      while (dmg < 0 && bt.t < 1) { bt.step(); for (const e of bt.drainEvents()) if (e.type === "fire" && e.side === 0) dmg = e.dmg; }
      return { dmg, stored: tu.store.length + (tu.stack.some((p) => p.id === 3) ? 1 : 0) };
    };
    const [one, two] = [bonusAt(1), bonusAt(2)];
    expect(two.stored).toBe(1);
    expect(two.dmg).toBeCloseTo(one.dmg, 9);
  });

  it("FOUNDRY: twin blanks still fuse through the store (fusions at ★2/★3 are not below ★1's)", () => {
    const b = heroStartBuild("foundry", 1);
    const fused = (s: number) => {
      const d: Build = { ...b, mods: [...b.mods, { uid: 950, def: "hopper", turret: 0, ...(s > 1 ? { stars: s } : {}) }] };
      return { fusions: run(d, 40, barge(), SEED).sides[0].race!.foundry.fusions };
    };
    const [one, two, three] = STARS.map(fused);
    expect(one.fusions).toBeGreaterThan(5);
    expect(two.fusions).toBeGreaterThanOrEqual(one.fusions);
    expect(three.fusions).toBeGreaterThanOrEqual(one.fusions);
  });

  it("player text: the star lines name the store; ★1's description is unchanged", () => {
    expect(ITEMS.hopper.desc).toEqual(["CHAMBER HOLDS 1 MORE", "LOAD; WINDOWS STAY", "OPEN 0.5S LONGER."]);
    expect(STARS.map((s) => starEffectLine("hopper", s))).toEqual([
      "+1 SLOT · +0.5S", "+1 SLOT · +0.5S · HOLDS 1 MORE WHILE FIRING", "+1 SLOT · +0.5S · HOLDS 2 MORE WHILE FIRING · NEVER JAMS",
    ]);
    expect(levelLine("hopper", 2)).toBe("★2: +1 SLOT · +0.5S · HOLDS 1 MORE WHILE FIRING");
    expect(levelLine("hopper", 3)).toBe("★3 BOTTOMLESS: +1 SLOT · +0.5S · HOLDS 2 MORE WHILE FIRING · NEVER JAMS");
  });
});
