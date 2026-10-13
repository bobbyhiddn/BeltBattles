// 0.6.2 TUNE-M, RULE JOIN PACE (the Prime's design decision; REQ-BFG-027 keeps the join free, drawn and legal as
// before): a factory one of whose belts joins another belt makes its loads at JOIN_PACE of its normal rate. It counts
// once, however long its chain; a factory none of whose belts joins runs exactly as before. The build screen says it
// where the join is made, in the factory's and its belts' panels and in the rules card; its load estimate and the par
// player's rating (deckRating.ts) model it.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Battle, type SideState } from "../src/sim/battle";
import { ITEMS, JOIN_PACE } from "../src/sim/content";
import { secPer } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): a factory's seconds a stamp, 30 / speed
import {
  JOIN_PACE_LINE, JOIN_PACE_PCT, cloneBuild, factoryPace, key as K, loadEvery, walkRoute, type Build,
} from "../src/sim/deck";
import { rateDeck } from "../src/sim/deckRating";
import { joinPaceLines } from "../src/screens/build/inspector";
import { seconds } from "../src/ui/abilityText"; // 0.6.2rel3: REQ-BFG-032's seconds
import { HELP, helpLine3 } from "../src/screens/title";
import { C } from "../src/render/palette";
import { setFreeJoins, withFreeJoins } from "../src/sim/freeJoins"; // HULL-ON (the flip, FREE_JOINS): the rule holds with the switch off

// tests/joins.sim.test.ts's deck: FURNACE, the KILN's belt M up column 4 into the turret; a STAMP PRESS west of it feeds
// R, which ends at (3,4) and joins M's tile 1 (4,4)
const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const R = [K(2, 6), K(2, 5), K(2, 4), K(3, 4)];
const FOE: Build = { hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 6 }], routes: [], mods: [], beltCap: 24, hullBonus: 100000 };
function deck(joined = true): Build {
  return {
    hero: "furnace", mods: [], beltCap: 40, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }],
    routes: [{ factory: 1, cells: [...M] }, { factory: 2, cells: [...R], ...(joined ? { join: K(4, 4) } : {}) }],
  };
}
/** R and M's tiles from the join tile on as ONE continuous belt from the PRESS: the same factory, unjoined. */
function single(b: Build): Build {
  const s = cloneBuild(b);
  s.routes = [{ factory: 2, cells: [...R, ...M.slice(1)] }];
  return s;
}
const quiet = (uid: number) => (s: SideState) => { s.factories.find((f) => f.uid === uid)!.routes = []; };
/** Loads factory `uid` of side 0 stamped in the first `seconds` of a battle (FactoryState.produced). */
function produced(b: Build, uid: number, seconds: number, setup?: (s: SideState) => void): number {
  const bt = new Battle(b, FOE, 7);
  setup?.(bt.sides[0]);
  for (let i = 0; i < 60 * seconds && !bt.over; i++) bt.step();
  expect(bt.over).toBe(false);
  return bt.sides[0].factories.find((f) => f.uid === uid)!.produced;
}
const PRESS = secPer(ITEMS.press.factory!.speed); // NUM-2 (was ITEMS.press.factory!.interval, 1.4 s): 30 / 21 = 1.43 s at 1 star

// HULL-ON (the flip, FREE_JOINS): FREE_JOINS ships on (no RULE JOIN PACE: a joined factory runs at its normal rate;
// tests/freejoins.test.ts), and older rules keep the pace (freeJoinsFor). This file measures RULE JOIN PACE, so each test
// runs with the switch off, and the afterEach puts the shipped value back. Where it is cheap a line reads the on value
// beside it (withFreeJoins)
beforeEach(() => setFreeJoins(false));
afterEach(() => setFreeJoins(true)); // the shipped value (HULL-ON's flip)

describe("RULE JOIN PACE: what a joined factory makes", () => {
  it("a joined factory makes JOIN_PACE x the loads of the same factory unjoined, over a fixed window", () => {
    expect(JOIN_PACE).toBeGreaterThan(0);
    expect(JOIN_PACE).toBeLessThan(1);
    const joined = produced(deck(), 2, 60, quiet(1)); // the KILN quiet: nothing contends for the join's gaps
    const open = produced(single(deck()), 2, 60);
    expect(open).toBeGreaterThan(30);
    expect(Math.abs(joined - JOIN_PACE * open)).toBeLessThanOrEqual(1);
  });

  it("the pace sits on the joining factory only, once, and nothing else runs slower", () => {
    const bt = new Battle(deck(), FOE, 7);
    const pace = (uid: number) => bt.sides[0].factories.find((f) => f.uid === uid)!.pace;
    expect(pace(2)).toBe(JOIN_PACE); // the PRESS, whose belt joins
    expect(pace(1)).toBe(1); // the KILN, whose belt is joined
    expect([factoryPace(deck(), 2), factoryPace(deck(), 1)]).toEqual([JOIN_PACE, 1]);
    // HULL-ON (the flip, FREE_JOINS): on (shipped), no pace: the PRESS at 1 in the battle and the walk
    expect(withFreeJoins(() => [new Battle(deck(), FOE, 7).sides[0].factories.find((f) => f.uid === 2)!.pace, factoryPace(deck(), 2)])).toEqual([1, 1]);
    // the main belt's own factory makes its loads as without the join
    expect(produced(deck(), 1, 30)).toBe(produced(deck(false), 1, 30));
  });

  it("a join-free deck is unchanged: every factory at pace 1 (dt x 1, the same float as before)", () => {
    for (const b of [deck(false), single(deck())]) {
      const bt = new Battle(b, FOE, 7);
      for (const f of bt.sides[0].factories) expect(f.pace).toBe(1);
      for (const it of b.items) expect(factoryPace(b, it.uid)).toBe(1);
    }
    // an illegal join is no join (the belt is an open end): no pace
    const bad = deck();
    bad.routes[1].join = K(3, 3); // not a belt tile
    expect(new Battle(bad, FOE, 7).sides[0].factories.find((f) => f.uid === 2)!.pace).toBe(1);
    expect(factoryPace(bad, 2)).toBe(1);
  });
});

describe("RULE JOIN PACE: the estimate and the rating", () => {
  it("the build screen's load estimate agrees with the battle's load count within 5%", () => {
    const b = deck();
    const every = loadEvery(b, 1);
    expect(every).toBeCloseTo(PRESS / JOIN_PACE, 9);
    expect(withFreeJoins(() => loadEvery(b, 1))).toBeCloseTo(PRESS, 9); // HULL-ON (the flip, FREE_JOINS): on (shipped), unpaced
    expect(loadEvery(b, 0)).toBeCloseTo(secPer(ITEMS.kiln.factory!.speed), 9); // the main belt's factory: unpaced (NUM-2: 30 / 24 = 1.25 s; was ITEMS.kiln.factory!.interval)
    expect(loadEvery(deck(false), 1)).toBeCloseTo(PRESS, 9);
    for (const [uid, index, setup] of [[2, 1, quiet(1)], [1, 0, undefined]] as const) {
      const n = produced(b, uid, 60, setup);
      const est = 60 / loadEvery(b, index);
      expect(Math.abs(n - est) / est).toBeLessThanOrEqual(0.05);
    }
  });

  it("the par player's rating counts a joined factory's payloads at JOIN_PACE", () => {
    // unsaturated (the model's satLo far away) and a long fight, so offense is the sum over belts of arrival x damage:
    // the joined belt adds JOIN_PACE / interval payloads a second at its walk's damage
    const flat = { satLo: 100, satHi: 101, saturated: 1 };
    const withJoin = rateDeck(deck(), flat, 1e4).offense;
    const without = rateDeck(deck(false), flat, 1e4).offense; // R unjoined ends short: no feed
    const dmg = walkRoute(deck(), 1).estimate.dmg;
    expect((withJoin - without) / ((JOIN_PACE / PRESS) * dmg)).toBeCloseTo(1, 2);
  });
});

describe("RULE JOIN PACE: the player reads it", () => {
  it("the text states the pace", () => {
    expect(JOIN_PACE_PCT).toBe(Math.round(JOIN_PACE * 100));
    expect(JOIN_PACE_LINE).toBe(`JOINED: THIS FACTORY RUNS AT ${JOIN_PACE_PCT}% PACE.`);
    // the joined factory's panel (and each of its belts') leads with it; an unjoined factory's reads as before
    // NUM-4 (REQ-BFG-047, N1 2.2): a joined belt's load cadence (PRESS / JOIN_PACE = 2.04 s, unjoined PRESS = 1.43 s) is
    // no whole second, so the line says it in loads: the joined belt gets JOIN_PACE_PCT% as many as the same belt unjoined
    // (was `A LOAD EVERY ${seconds(PRESS / JOIN_PACE)} ON THIS BELT, NOT ${seconds(PRESS)}.`); the share it states is the
    // ratio of the two cadences the estimate uses (loadEvery, joined and unjoined)
    expect(Math.round((loadEvery(deck(false), 1) / loadEvery(deck(), 1)) * 100)).toBe(JOIN_PACE_PCT);
    expect(joinPaceLines(deck(), 2)).toEqual([
      [JOIN_PACE_LINE, C.cyan],
      [`FEWER LOADS REACH THIS BELT: ${JOIN_PACE_PCT}% AS MANY.`, C.cyan],
    ]);
    expect(joinPaceLines(deck(), 1)).toEqual([]);
    expect(joinPaceLines(deck(false), 2)).toEqual([]);
    expect(withFreeJoins(() => joinPaceLines(deck(), 2))).toEqual([]); // HULL-ON (the flip, FREE_JOINS): on (shipped), no line at all
    // the rules card, where joins are explained
    // HULL-ON (the flip, FREE_JOINS): HELP is the card at load, the shipped one, with no pace; the card's line 3 with the
    // switch off (helpLine3, read now) states the pace, as before
    expect(HELP[2]).toContain("DRAG A BELT INTO ANOTHER TO JOIN THEM");
    expect(HELP[2]).not.toMatch(/PACE/);
    expect(helpLine3()).toContain(`A JOINED FACTORY RUNS AT ${JOIN_PACE_PCT}% PACE.`);
  });
});
