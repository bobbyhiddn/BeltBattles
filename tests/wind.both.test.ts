// Backlog #368 (LC-1, REQ-BFG-073): the dark wind hits BOTH hulls. Past WIND_START (25 s), once a second, battle.ts gives
// both sides the same wind damage, straight to hp: PLATE and SHIELD don't absorb it (the wind block in Battle.step), and
// arenaReact.ts pops the number over both hulls. The older tests check one side only (races.today, wave3.engine,
// wave3.modules); this one runs a single battle past WIND_START and checks both, with different hulls (FURNACE 2100,
// WEAVER 1700) each holding PLATE and SHIELD. Test only: no game code.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { WIND_START, type HeroId } from "../src/sim/content";
import { heroStartBuild } from "../src/sim/heroBuilds";
import type { Build } from "../src/sim/deck";

/** A hero's starting deck with its belts cut: no turret ever loads, so nothing fires and only the wind moves a hull. */
const silent = (hero: HeroId, uid: number): Build => ({ ...heroStartBuild(hero, uid), routes: [] });

describe("backlog #368: the dark wind hits both hulls", () => {
  it("one battle past WIND_START: both sides' windTaken are equal and above 0, and each hull's hp loss is its wind", () => {
    const bt = new Battle(silent("furnace", 1), silent("weaver", 101), 7);
    const [p, e] = bt.sides;
    expect(p.hull.max).not.toBe(e.hull.max); // two different hulls
    // PLATE and SHIELD on both sides: the wind goes past both
    bt.addPlate(p, 100);
    bt.addPlate(e, 100);
    bt.gainShield(p, 1);
    bt.gainShield(e, 1);
    const plate = [p.plate.plate, e.plate.plate], shield = [p.shield, e.shield];
    expect(plate).toEqual([100, 100]);
    expect(shield[0]).toBeGreaterThan(0);
    expect(shield[1]).toBeGreaterThan(0);
    bt.events.length = 0;
    let ticks = 0, blown = 0;
    while (!bt.over && bt.t < WIND_START + 12) {
      const hp = [p.hull.hp, e.hull.hp];
      bt.step();
      for (const ev of bt.events) {
        if (ev.type !== "wind") continue;
        // the tick's wind, on both hulls at once, straight to hp
        expect([hp[0] - p.hull.hp, hp[1] - e.hull.hp]).toEqual([ev.dmg, ev.dmg]);
        ticks++;
        blown += ev.dmg;
      }
      expect(bt.events.some((ev) => ev.type === "wind" && bt.t < WIND_START)).toBe(false); // no wind before WIND_START
      bt.events.length = 0;
    }
    expect(bt.t).toBeGreaterThan(WIND_START + 10);
    expect(ticks).toBeGreaterThanOrEqual(10); // once a second
    // both sides' windTaken: equal, above 0, the sum of the wind ticks
    expect(p.stats.windTaken).toBeGreaterThan(0);
    expect(e.stats.windTaken).toBe(p.stats.windTaken);
    expect(p.stats.windTaken).toBe(blown);
    // each hull's whole hp loss is its wind (nothing else hit either side), on both sides, not one
    expect(p.hull.max - p.hull.hp).toBe(p.stats.windTaken);
    expect(e.hull.max - e.hull.hp).toBe(e.stats.windTaken);
    // PLATE and SHIELD absorbed none of it
    expect([p.plate.plate, e.plate.plate]).toEqual(plate);
    expect([p.shield, e.shield]).toEqual(shield);
    expect([p.stats.damage, e.stats.damage]).toEqual([0, 0]);
  });
});
