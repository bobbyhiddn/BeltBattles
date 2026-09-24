import { describe, expect, it } from "vitest";
import { BROKEN, NOWHERE, brokenRoutes, fightBlock, routeProblems } from "../src/game/routeCheck";
import { newRun } from "../src/game/run";
import { HEROES, type HeroId } from "../src/sim/content";
import { adjacentToFactory, cloneBuild, key, type Build } from "../src/sim/deck";
import { RIVAL_IDS, rivalBuild, rivalDays } from "../src/sim/rivals";

const HERO_IDS = Object.keys(HEROES) as HeroId[];

/** Cells from (x, y0) straight up the column to the forward row. */
const up = (x: number, y0: number): number[] => Array.from({ length: y0 + 1 }, (_, i) => key(x, y0 - i));

/** Weaver, the LOOM (3 outputs) at 4,6; route 0 runs up column 4 into connector 4. */
function weaver(): Build {
  return {
    hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 6 }],
    routes: [{ factory: 1, cells: up(4, 5) }], mods: [], beltCap: 24, hullBonus: 0,
  };
}

const whys = (b: Build) => routeProblems(b).map((p) => p.why);

describe("routeCheck: legal decks", () => {
  it("every hero's starting deck", () => {
    for (const h of HERO_IDS) {
      const b = newRun(h, 12345).build;
      expect(b.routes.length, h).toBeGreaterThan(0);
      expect(routeProblems(b), h).toEqual([]);
      expect(fightBlock(b), h).toBeUndefined();
    }
  });

  it("every rival deck on every day it can be met", () => {
    for (const id of RIVAL_IDS) {
      for (const day of rivalDays(id)) {
        const b = rivalBuild(id, day);
        expect(whys(b), `${id} day ${day}`).toEqual([]);
        expect(brokenRoutes(b), `${id} day ${day}`).toEqual([]);
      }
    }
  });

  it("a deck with no routes (FIGHT keeps its arm-then-go warning)", () => {
    for (const h of HERO_IDS) {
      const b = { ...newRun(h, 7).build, routes: [] };
      expect(routeProblems(b)).toEqual([]);
      expect(fightBlock(b)).toBeUndefined();
    }
  });

  it("a hand-built route, and a gate on its path", () => {
    const b = weaver();
    expect(fightBlock(b)).toBeUndefined();
    b.items.push({ uid: 2, def: "temper", x: 4, y: 3 });
    expect(whys(b)).toEqual([]);
  });
});

describe("routeCheck: broken decks", () => {
  it("a connected route cut short of its connector goes nowhere", () => {
    const b = weaver();
    b.routes[0].cells.pop();
    expect(whys(b)).toEqual(["route 0 does not end on a free turret connector (disconnected)"]);
    expect(routeProblems(b)[0].nowhere).toBe(true);
    expect(brokenRoutes(b)).toEqual([0]);
    expect(fightBlock(b)).toBe(NOWHERE);
  });

  it("each hero's starting deck with a route cut short", () => {
    for (const h of HERO_IDS) {
      const b = cloneBuild(newRun(h, 12345).build);
      const i = b.routes.findIndex((r) => r.cells.length >= 2);
      expect(i, h).toBeGreaterThanOrEqual(0);
      b.routes[i].cells.pop();
      expect(brokenRoutes(b), h).toEqual([i]);
      expect(fightBlock(b), h).toBe(NOWHERE);
    }
  });

  it("a route through non-gate machinery", () => {
    const b = weaver();
    b.items.push({ uid: 2, def: "press", x: 3, y: 2 }); // covers 4,3 and 4,2
    expect(whys(b)).toEqual([`route 0 runs through non-gate machinery at cell ${key(4, 3)}`]);
    expect(brokenRoutes(b)).toEqual([0]);
    expect(fightBlock(b)).toBe(BROKEN);
  });

  it("two crossing routes", () => {
    const b = weaver();
    // from the loom's right side up to row 3, west across column 4, then up column 1
    const cells = [key(6, 6), key(6, 5), key(6, 4), key(6, 3), key(5, 3), key(4, 3), key(3, 3), key(2, 3), ...up(1, 3)];
    b.routes.push({ factory: 1, cells });
    expect(whys(b)).toEqual([`routes 0 and 1 cross at cell ${key(4, 3)}`]);
    expect(brokenRoutes(b)).toEqual([1]);
    expect(fightBlock(b)).toBe(BROKEN);
  });

  it("belt over beltCap", () => {
    const b = weaver();
    b.beltCap = 5;
    expect(whys(b)).toEqual(["6 belt tiles exceed beltCap 5"]);
    expect(brokenRoutes(b)).toEqual([0]);
    expect(fightBlock(b)).toBe(BROKEN);
  });

  it("a route that does not start beside its factory", () => {
    const b = weaver();
    b.routes[0].cells.shift();
    expect(adjacentToFactory(b, 1, b.routes[0].cells[0])).toBeLessThan(0);
    expect(whys(b)).toEqual(["route 0 does not start beside its factory"]);
    expect(fightBlock(b)).toBe(BROKEN);
  });

  it("a broken step and a loop", () => {
    const b = weaver();
    b.routes[0].cells.splice(2, 1); // 4,4 -> 4,2
    expect(whys(b)).toEqual([`route 0 is broken between cells ${key(4, 4)} and ${key(4, 2)}`]);
    expect(fightBlock(b)).toBe(BROKEN);
    const c = weaver();
    c.routes[0].cells.splice(2, 0, key(4, 5));
    expect(whys(c)).toEqual([`route 0 revisits cell ${key(4, 5)} (no loops)`]);
  });

  it("a factory feeding more belts than its outputs", () => {
    const b: Build = {
      hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }],
      routes: [{ factory: 1, cells: up(4, 5) }, { factory: 1, cells: up(5, 5) }], mods: [], beltCap: 14, hullBonus: 0,
    };
    expect(whys(b)).toEqual(["KILN uid 1 feeds 2 routes but has 1 output(s)"]);
    expect(brokenRoutes(b)).toEqual([1]);
    expect(fightBlock(b)).toBe(BROKEN);
  });

  it("a route fed by no factory, and a cell off the deck, without throwing", () => {
    const b = weaver();
    b.routes[0].factory = 99;
    expect(whys(b)).toEqual(["route 0 is fed by uid 99, which is not a factory on this deck"]);
    const c = weaver();
    c.routes[0].cells.push(-10);
    expect(whys(c)).toEqual(["route 0 has a cell off the deck"]);
    expect(fightBlock(c)).toBe(BROKEN);
  });

  it("NOWHERE wins over BROKEN; every failing route is named", () => {
    const b = weaver();
    b.routes.push({ factory: 1, cells: [key(3, 6), key(2, 6), key(2, 5)] }); // a dead end
    b.routes[0].cells.splice(2, 1);
    expect(brokenRoutes(b)).toEqual([0, 1]);
    expect(fightBlock(b)).toBe(NOWHERE);
  });
});
