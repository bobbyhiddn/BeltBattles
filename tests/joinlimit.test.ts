// 0.6.2 TUNE-M, RULE JOIN LIMIT (the Prime's decision, oracle ea0abdc95439b4d8): a deck holds at most JOIN_LIMIT (2)
// joining belts. deck.ts joinProblem refuses the next one in route order ("2 JOINS PER DECK"), and every way to make a
// join refuses a new one past the limit wherever it is drawn (newJoinProblem). A deck with at most 2 joins reads and
// fights exactly as at RULE JOIN PACE (be69974): the fixture fingerprint OUT/tune/verify/joinfp.test.ts, run in both
// trees, is byte-identical for 0, 1 and 2 joins and differs for 3. A saved deck with 3 keeps its first two.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { JOIN_LIMIT, JOIN_PACE } from "../src/sim/content";
import {
  JOIN_OVER_LIMIT, canJoin, cloneBuild, joinOf, joinProblem, joinTiles, key as K, newJoinProblem, occupancy, overJoinLimit,
  pruneJoins, routeInfo, setJoin, type Build, type RouteDef,
} from "../src/sim/deck";
import { validateBuild } from "../src/net/validate";
import { NOWHERE, fightBlock, routeProblems } from "../src/game/routeCheck";
import { migrateRun, newRun, type Run } from "../src/game/run";
import { playerRun } from "../src/sim/harness/player";
import { Editor, type EditHost } from "../src/screens/build/edit";
import type { Sel } from "../src/screens/build/layout";
import { frame as deckFrame } from "../src/render/frame";
import { HELP } from "../src/screens/title";

// FURNACE (tests/joins.sim.test.ts's deck): M = the KILN's belt up column 4 into the turret; R1..R3 = the belts of a
// STAMP PRESS, a DOUBLE STAMP and a SHOT TOWER (three defs: validateBuild refuses an unfused pair) joining M at (4,4),
// (4,3) and (4,2), in route order after M
const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const R1: RouteDef = { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(3, 4)], join: K(4, 4) };
const R2: RouteDef = { factory: 3, cells: [K(7, 5), K(7, 4), K(7, 3), K(6, 3), K(5, 3)], join: K(4, 3) };
const R3: RouteDef = { factory: 4, cells: [K(2, 2), K(3, 2)], join: K(4, 2) };
const open = (r: RouteDef): RouteDef => ({ factory: r.factory, cells: [...r.cells] });
function deck(routes: RouteDef[]): Build {
  return {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0, // 14 + four +4 belt crates
    items: [
      { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }, { uid: 3, def: "doublestamp", x: 7, y: 6 },
      { uid: 4, def: "shottower", x: 0, y: 2 },
    ],
    routes: [{ factory: 1, cells: [...M] }, ...routes.map((r) => ({ ...r, cells: [...r.cells] }))],
  };
}
const legalJoins = (b: Build): number => b.routes.filter((_, i) => joinOf(b, i) !== undefined).length;
const FOE: Build = { hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 6 }], routes: [], mods: [], beltCap: 24, hullBonus: 100000 };

describe("RULE JOIN LIMIT: at most 2 joining belts a deck", () => {
  it("the 3rd joining belt in route order is refused (2 JOINS PER DECK); the first two stay legal", () => {
    expect(JOIN_LIMIT).toBe(2);
    expect(JOIN_OVER_LIMIT).toBe("2 JOINS PER DECK");
    const b = deck([R1, R2, R3]);
    expect([1, 2, 3].map((i) => joinProblem(b, i))).toEqual([null, null, JOIN_OVER_LIMIT]);
    expect(joinOf(b, 3)).toBeUndefined();
    expect(routeInfo(b, 3).connected).toBe(false); // an open end, like any refused join
    expect(overJoinLimit(b)).toBe(true);
    expect(legalJoins(b)).toBe(2);
    // the battle fights it that way: two joins, two paced factories; the third belt goes nowhere at full pace
    const s = new Battle(b, FOE, 7).sides[0];
    expect(s.routes.map((r) => r.join?.route ?? -1)).toEqual([-1, 0, 0, -1]);
    expect(s.factories.map((f) => [f.uid, f.pace])).toEqual([[1, 1], [2, JOIN_PACE], [3, JOIN_PACE], [4, 1]]);
    // route order decides, not where the join is: the same three with R3 first keep R3 and R1, and refuse R2
    const reordered = deck([R3, R1, R2]);
    expect([1, 2, 3].map((i) => joinProblem(reordered, i))).toEqual([null, null, JOIN_OVER_LIMIT]);
    // validateBuild (client and server upload) and the FIGHT gate report it in the same words
    const why = `route 3 can't join cell ${K(4, 2)}: ${JOIN_OVER_LIMIT}`;
    expect(validateBuild(b, 10).errors).toContain(`route: ${why}`);
    expect(routeProblems(b).map((p) => p.why)).toContain(why);
  });

  it("a new join past the limit is refused wherever it is drawn: canJoin, setJoin, joinTiles", () => {
    const b = deck([R1, R2, open(R3)]); // two joins; R3 drawn to (3,2), next to M's (4,2)
    expect(canJoin(b, 4, R3.cells, K(4, 2), 3)).toEqual({ ok: false, reason: JOIN_OVER_LIMIT });
    const fresh = deck([R1, R2]);
    expect(canJoin(fresh, 4, R3.cells, K(4, 2), -1)).toEqual({ ok: false, reason: JOIN_OVER_LIMIT });
    expect(joinTiles(b, 3)).toEqual([]);
    const before = JSON.stringify(b);
    expect(setJoin(b, 3, K(4, 2))).toBe(JOIN_OVER_LIMIT);
    expect(JSON.stringify(b)).toBe(before);
    // a redraw of an EARLY belt into a join would push a later belt's join past the limit: refused too
    const early = deck([open(R3), R1, R2]);
    expect(canJoin(early, 4, R3.cells, K(4, 2), 1)).toEqual({ ok: false, reason: JOIN_OVER_LIMIT });
    const trial = cloneBuild(early);
    trial.routes[1].join = K(4, 2);
    expect(joinProblem(trial, 1)).toBeNull(); // route order alone would keep it and drop R2 ...
    expect(newJoinProblem(trial, 1)).toBe(JOIN_OVER_LIMIT); // ... so a new join asks the whole deck
    // under the limit the same join is fine
    const one = deck([R1, open(R3)]);
    expect(canJoin(one, 4, R3.cells, K(4, 2), 2)).toMatchObject({ ok: true, route: 0 });
    expect(setJoin(one, 2, K(4, 2))).toBeNull();
    expect(legalJoins(one)).toBe(2);
  });

  it("the build screen: a drag into a third join is refused with a 2 JOINS PER DECK toast", () => {
    const rn = newRun("furnace", 5, "joinlimit");
    rn.build = deck([R1, R2]);
    rn.inventory = [];
    const log: string[] = [];
    const noop = () => undefined;
    const fx = { ring: noop, sparkle: noop, sparks: noop, dust: noop, popup: noop } as unknown as EditHost["wfx"];
    const h = {
      run: rn, sel: { kind: "none" } as Sel,
      game: { audio: { play: (x: string) => log.push(`sound:${x}`) }, toast: (m: string) => log.push(`toast:${m}`), error: (m: string) => log.push(`error:${m}`) },
      L: { frame: deckFrame(0, 0, 0), hull: { x: -30, y: -30, w: 200, h: 200 }, cargo: { x: 0, y: 300, w: 100, h: 20 } },
      wfx: fx, ufx: fx, select(s: Sel) { h.sel = s; },
      turretAt: () => -1, coinPos: () => ({ x: 0, y: 0 }), touched: noop, placed: noop,
      invalid: (m: string) => log.push(`invalid:${m}`), offerAt: () => null, cargoAt: () => null,
    };
    const at = (x: number, y: number) => [x * 12 + 6, y * 12 + 6] as const;
    const ed = new Editor(h as unknown as EditHost);
    ed.down(...at(1, 2)); // out of the third STAMP PRESS, along R3 and into M's tile (4,2)
    for (const [x, y] of [[2, 2], [3, 2], [4, 2]] as const) ed.move(...at(x, y));
    expect(ed.draw!.join).toBeUndefined();
    expect(ed.draw!.refused).toEqual({ cell: K(4, 2), reason: JOIN_OVER_LIMIT });
    expect(log).toContain(`error:${JOIN_OVER_LIMIT}`);
    ed.up(...at(4, 2));
    expect(legalJoins(rn.build)).toBe(2);
    expect(rn.build.routes.filter((r) => r.join !== undefined).length).toBe(2);
  });

  it("decks with 1 or 2 joins read as before: nothing refused, validateBuild passes, pruneJoins keeps them", () => {
    for (const b of [deck([R1]), deck([R1, R2]), deck([R2, R3])]) {
      const n = b.routes.length - 1;
      expect(b.routes.map((_, i) => joinProblem(b, i))).toEqual(b.routes.map(() => null));
      expect(legalJoins(b)).toBe(n);
      expect(overJoinLimit(b)).toBe(false);
      expect(validateBuild(b, 10).errors).toEqual([]);
      const c = cloneBuild(b);
      expect(pruneJoins(c)).toBe(0);
      expect(c).toEqual(b);
      expect(new Battle(b, FOE, 7).sides[0].factories.filter((f) => f.pace === JOIN_PACE).length).toBe(n);
    }
    // a deck without joins never counts anything (joinProblem returns before the limit)
    const none = deck([]);
    expect(overJoinLimit(none, occupancy(none))).toBe(false);
  });

  it("a saved deck with 3 joins loads with its first two; the third is an open end the FIGHT gate reports", () => {
    const run: Run = newRun("furnace", 77, "joinlimit-save");
    run.build = deck([R1, R2, R3]);
    const back = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(back.build.routes.map((r) => r.join)).toEqual([undefined, K(4, 4), K(4, 3), undefined]);
    expect(back.build.routes[3]).toEqual(open(R3)); // its cells stay: the player redraws or removes it
    expect(legalJoins(back.build)).toBe(2);
    expect(fightBlock(back.build)).toBe(NOWHERE);
    // idempotent: a second load changes nothing
    expect(JSON.stringify(migrateRun(JSON.parse(JSON.stringify(back)))!.build)).toBe(JSON.stringify(back.build));
  });

  it("the par player never plans a join past the limit, and its decks pass validateBuild", () => {
    let atLimit = 0;
    for (const hero of ["weaver", "furnace"] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        for (const d of playerRun(hero, 10, seed)) {
          const b = d.build;
          expect(overJoinLimit(b), `${hero} s${seed} d${d.day}`).toBe(false);
          expect(b.routes.every((_, i) => joinProblem(b, i) !== JOIN_OVER_LIMIT)).toBe(true);
          expect(validateBuild(b, d.day).errors, `${hero} s${seed} d${d.day}`).toEqual([]);
          if (legalJoins(b) === JOIN_LIMIT) atLimit++;
        }
      }
    }
    expect(atLimit).toBeGreaterThan(10); // the limit binds: many par decks hold exactly 2 joins
  }, 120_000);

  it("the player reads the limit: the rules card says it, in the words JOIN (never MERGE)", () => {
    expect(HELP[2]).toContain(`JOIN THEM (${JOIN_OVER_LIMIT}).`);
    expect(JOIN_OVER_LIMIT).not.toMatch(/MERGE/);
    expect(HELP[2]).not.toMatch(/MERGE/);
  });
});
