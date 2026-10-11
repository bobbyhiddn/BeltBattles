// JOINS-1 (REQ-BFG-091, which replaces REQ-BFG-090): FREE JOINS behind FREE_JOINS (src/sim/freeJoins.ts, default off).
// The operator dropped both 0.6.2 TUNE-M join rules: RULE JOIN PACE (a factory with a joining belt made its loads at
// JOIN_PACE, 70% of its rate) and RULE JOIN LIMIT (at most JOIN_LIMIT, 2, joining belts a deck). With the switch on, a
// joining belt never slows its factory (battle, rating, estimate, inspector) and a deck holds any number of legal joins
// (validateBuild, the upload check, pruneJoins, the save loader, the par player). A stored record or an upload asks its
// own rules through the gate (rulesGate.ts freeJoinsFor); tests/freejoins.bump.test.ts plays the rules bump that turns
// the switch on (a bb-0.9.7 record past 2 joins is still refused). With the switch off every join test keeps its meaning
// (tests/joinpace, joinlimit, net-upload.joinlimit, joins.*): this file turns it on only inside its own tests.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Battle, simulate, type BattleRecord, type SideState } from "../src/sim/battle";
import { ITEMS, JOIN_LIMIT, JOIN_PACE, RULES_VERSION, secPer } from "../src/sim/content";
import { FREE_JOINS, freeJoinsRules, joinedPace, setFreeJoins, withFreeJoins } from "../src/sim/freeJoins";
import { FREE_JOINS_RULES, NPC_DAY_RULES, freeJoinsFor } from "../src/net/rulesGate";
import {
  JOIN_OVER_LIMIT, JOIN_PACE_LINE, JOIN_PACE_PCT, canJoin, cloneBuild, factoryPace, joinOf, joinProblem, joinTiles,
  key as K, loadEvery, newJoinProblem, overJoinLimit, pruneJoins, removeRoute, setJoin, walkRoute, type Build, type RouteDef,
} from "../src/sim/deck";
import { rateDeck, type RateOut } from "../src/sim/deckRating";
import { validateBuild, validateUpload } from "../src/net/validate";
import { outcomeOf, replay, replayBattle } from "../src/net/replay";
import { migrateRun, newRun, type Run } from "../src/game/run";
import { beltPanel, itemPanel, joinPaceLines } from "../src/screens/build/inspector";
import { HELP, helpLine3, helpLines } from "../src/screens/title";
import { Editor, type EditHost } from "../src/screens/build/edit";
import type { Sel } from "../src/screens/build/layout";
import { frame as deckFrame } from "../src/render/frame";
import { playerRun } from "../src/sim/harness/player";
import { SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { withDawnRunes } from "./runeFill";

afterEach(() => setFreeJoins(false)); // every test starts and ends with the switch as committed (off)

const FOE: Build = { hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 6 }], routes: [], mods: [], beltCap: 24, hullBonus: 100000 };

// ---------------------------------------------------------------- the pace deck (tests/joinpace.test.ts's)
// FURNACE: the KILN's belt M up column 4 into the turret; a STAMP PRESS west of it feeds R, which joins M's tile 1 (4,4)
const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const R = [K(2, 6), K(2, 5), K(2, 4), K(3, 4)];
function paceDeck(joined = true): Build {
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
const PRESS = secPer(ITEMS.press.factory!.speed);

// ---------------------------------------------------------------- the limit deck (tests/joinlimit.test.ts's, + 2)
// M as above; R1..R3 = the belts of a STAMP PRESS, a DOUBLE STAMP and a SHOT TOWER joining M at (4,4), (4,3), (4,2);
// R4 = an ASSEMBLY LINE's belt (south-west) joining M's first tile (4,5); R5 = a DRAG CHAIN FOUNDRY's belt (south-east)
// joining R2's tile (6,3): a chain, R2 joining M in turn. Five defs (validateBuild refuses an unfused pair).
const R1: RouteDef = { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(3, 4)], join: K(4, 4) };
const R2: RouteDef = { factory: 3, cells: [K(7, 5), K(7, 4), K(7, 3), K(6, 3), K(5, 3)], join: K(4, 3) };
const R3: RouteDef = { factory: 4, cells: [K(2, 2), K(3, 2)], join: K(4, 2) };
const R4: RouteDef = { factory: 5, cells: [K(3, 7), K(3, 6), K(3, 5)], join: K(4, 5) };
const R5: RouteDef = { factory: 6, cells: [K(6, 8), K(6, 7), K(6, 6), K(6, 5), K(6, 4)], join: K(6, 3) };
const JOINERS = [R1, R2, R3, R4, R5];
const DAY = 6; // the five-factory deck (38 gold) within the strict budget and the upload's honest spend
function limitDeck(routes: RouteDef[]): Build {
  return withDawnRunes({
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0, // 14 + four +4 belt crates; 25 tiles laid
    items: [
      { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }, { uid: 3, def: "doublestamp", x: 7, y: 6 },
      { uid: 4, def: "shottower", x: 0, y: 2 }, { uid: 5, def: "assembly", x: 2, y: 8 }, { uid: 6, def: "dragchain", x: 7, y: 8 },
    ],
    routes: [{ factory: 1, cells: [...M] }, ...routes.map((r) => ({ ...r, cells: [...r.cells] }))],
  }, DAY);
}
const legalJoins = (b: Build): number => b.routes.filter((_, i) => joinOf(b, i) !== undefined).length;
const overLimit = (route: number, cell: number) => `route: route ${route} can't join cell ${cell}: ${JOIN_OVER_LIMIT}`;

describe("JOINS-1: the switch", () => {
  it("FREE_JOINS is off as committed; its rules read RULES_VERSION until the bump; every record asks its own rules", () => {
    expect(FREE_JOINS).toBe(false);
    expect(freeJoinsRules()).toBe(false);
    expect(joinedPace()).toBe(JOIN_PACE);
    expect(FREE_JOINS_RULES).toBe(RULES_VERSION); // as NPC_DAY_RULES until its flip
    expect(FREE_JOINS_RULES).toBe(NPC_DAY_RULES);
    expect(freeJoinsFor(RULES_VERSION)).toBe(false); // the switch off: no rules version has free joins
    withFreeJoins(() => {
      expect(joinedPace()).toBe(1);
      expect(freeJoinsFor(RULES_VERSION)).toBe(true);
      expect(freeJoinsFor("bb-0.9.3")).toBe(false); // older rules keep both join rules
      expect(freeJoinsFor("bb-0.6.2")).toBe(false);
      expect(freeJoinsFor("0.9.7")).toBe(false); // unreadable: never "at least" anything
      expect(freeJoinsFor(undefined)).toBe(false);
    });
    expect(freeJoinsRules()).toBe(false); // put back
    expect(() => withFreeJoins(() => { throw new Error("x"); })).toThrow("x");
    expect(freeJoinsRules()).toBe(false); // put back even on a throw
  });
});

describe("JOINS-1 (1): no RULE JOIN PACE with FREE_JOINS on", () => {
  it("a factory whose belt joins runs at full pace in battle: its pace is 1 and it makes the loads of the same factory unjoined", () => {
    expect(new Battle(paceDeck(), FOE, 7).sides[0].factories.map((f) => f.pace)).toEqual([1, JOIN_PACE]); // off: as before
    setFreeJoins(true);
    expect(new Battle(paceDeck(), FOE, 7).sides[0].factories.map((f) => f.pace)).toEqual([1, 1]);
    expect([factoryPace(paceDeck(), 2), factoryPace(paceDeck(), 1)]).toEqual([1, 1]);
    const joined = produced(paceDeck(), 2, 60, quiet(1)); // the KILN quiet: nothing contends for the join's gaps
    const open = produced(single(paceDeck()), 2, 60);
    expect(open).toBeGreaterThan(30);
    expect(Math.abs(joined - open)).toBeLessThanOrEqual(1);
    // the build screen's estimate: a load every PRESS seconds, as unjoined (off: PRESS / JOIN_PACE)
    expect(loadEvery(paceDeck(), 1)).toBeCloseTo(PRESS, 9);
    setFreeJoins(false);
    expect(loadEvery(paceDeck(), 1)).toBeCloseTo(PRESS / JOIN_PACE, 9);
  });

  it("the par player's rating counts a joined factory's payloads at its full rate", () => {
    // the rating's payloads a second on each belt (RateOut.arrival, after J5's own-first share of the main belt): the
    // joined PRESS belt at JOIN_PACE / PRESS with the switch off, at 1 / PRESS (the PRESS's full rate) with it on
    const flat = { satLo: 100, satHi: 101, saturated: 1 };
    const arrivals = (): number[] => {
      const out: RateOut = { stokeKeep: new Map(), arrival: new Map() };
      rateDeck(paceDeck(), flat, 1e4, out);
      return [out.arrival!.get(0)!, out.arrival!.get(1)!];
    };
    const [m0, r0] = arrivals();
    expect(r0).toBeCloseTo(JOIN_PACE / PRESS, 9);
    const [m1, r1] = withFreeJoins(arrivals);
    expect(r1).toBeCloseTo(1 / PRESS, 9);
    expect(m1).toBe(m0); // the KILN's main belt as before
    // the rating then weighs the whole flow at the turret: here the full-pace join overfeeds the gun (1.5 loads a second
    // with the KILN's), so the joined deck rates below the open one. The par player joins only where a join rates better.
    const gain = () => rateDeck(paceDeck(), flat, 1e4).offense - rateDeck(paceDeck(false), flat, 1e4).offense;
    expect(gain() / ((1 / PRESS) * walkRoute(paceDeck(), 1).estimate.dmg)).toBeCloseTo(JOIN_PACE, 2); // off: tests/joinpace's reading
    expect(withFreeJoins(gain)).toBeLessThan(gain());
  });

  it("a battle record replays under its own rules' answer, and its playback keeps the pace it started with", () => {
    const record: BattleRecord = { rules: RULES_VERSION, seed: 7, builds: [paceDeck(), FOE] };
    const offOutcome = outcomeOf(simulate(paceDeck(), FOE, 7, 60 * 40));
    const onOutcome = withFreeJoins(() => outcomeOf(simulate(paceDeck(), FOE, 7, 60 * 40)));
    expect(onOutcome).not.toEqual(offOutcome); // the pace moves the fight
    expect(replay(record, 60 * 40)).toEqual(offOutcome);
    setFreeJoins(true);
    expect(replay(record, 60 * 40)).toEqual(onOutcome);
    const bt = replayBattle(record);
    expect(bt.sides[0].factories.map((f) => f.pace)).toEqual([1, 1]);
    setFreeJoins(false); // the playback steps on with the switch off: the battle read it once, where it started
    for (let i = 0; i < 60 * 40 && !bt.over; i++) bt.step();
    expect(outcomeOf(bt)).toEqual(onOutcome);
  });
});

describe("JOINS-1 (2, 4): no RULE JOIN LIMIT with FREE_JOINS on", () => {
  it("decks with 3, 4 and 5 legal joins validate: validateBuild and the upload check under the new rules", () => {
    for (const n of [3, 4, 5]) {
      const b = limitDeck(JOINERS.slice(0, n));
      // off (as committed): the joins past 2 are refused, in route order, in both checks
      const want = JOINERS.slice(2, n).map((r, i) => overLimit(3 + i, r.join!));
      expect(validateBuild(b, DAY).errors.filter((e) => e.includes(JOIN_OVER_LIMIT)), `off ${n}`).toEqual(want);
      expect(validateUpload(b, DAY).errors.filter((e) => e.includes(JOIN_OVER_LIMIT)), `off ${n}`).toEqual(want);
      expect(legalJoins(b)).toBe(2);
      setFreeJoins(true);
      expect(b.routes.map((_, i) => joinProblem(b, i)), `on ${n}`).toEqual(b.routes.map(() => null));
      expect(overJoinLimit(b)).toBe(false);
      expect(legalJoins(b)).toBe(n);
      expect(validateBuild(b, DAY), `strict ${n}`).toEqual({ ok: true, errors: [] });
      expect(validateUpload(b, DAY, RULES_VERSION), `player ${n}`).toEqual({ ok: true, errors: [] });
      // the battle fights every join, and no factory is paced (every factory at the deck's one pace: its dawn runes')
      const s = new Battle(b, FOE, 7).sides[0];
      expect(s.routes.filter((r) => r.join).length).toBe(n);
      expect(new Set(s.factories.map((f) => f.pace)).size).toBe(1);
      expect(withFreeJoins(() => new Set(new Battle(b, FOE, 7).sides[0].factories.map((f) => f.pace)).size, false)).toBe(2); // off: paced
      setFreeJoins(false);
    }
  });

  it("every way to make a join allows a third and later one: canJoin, setJoin, joinTiles, newJoinProblem", () => {
    const open3: RouteDef = { factory: 4, cells: [...R3.cells] };
    setFreeJoins(true);
    const b = limitDeck([R1, R2, open3]);
    expect(canJoin(b, 4, R3.cells, K(4, 2), 3)).toMatchObject({ ok: true, route: 0 });
    expect(canJoin(limitDeck([R1, R2]), 4, R3.cells, K(4, 2), -1)).toMatchObject({ ok: true, route: 0 });
    expect(joinTiles(b, 3)).toContain(K(4, 2));
    expect(setJoin(b, 3, K(4, 2))).toBeNull();
    expect(legalJoins(b)).toBe(3);
    // an early belt redrawn into a join no longer pushes a later join out
    const early = limitDeck([open3, R1, R2]);
    const trial = cloneBuild(early);
    trial.routes[1].join = K(4, 2);
    expect(newJoinProblem(trial, 1)).toBeNull();
    // the 0.6.2j legality rules stay: a join tile that is no belt, or not next to the belt's end, is still refused
    expect(canJoin(b, 4, [K(2, 2)], K(3, 3), -1).ok).toBe(false);
    const bad = cloneBuild(b);
    bad.routes[3].join = K(4, 3); // diagonal to (3,2): NOT NEXT TO ITS JOIN TILE
    expect(joinProblem(bad, 3)).toBe("NOT NEXT TO ITS JOIN TILE");
  });

  it("(4) pruneJoins keeps legal joins past 2 and still clears an illegal or stale one; the save loader keeps them", () => {
    setFreeJoins(true);
    const b = limitDeck(JOINERS);
    const c = cloneBuild(b);
    expect(pruneJoins(c)).toBe(0);
    expect(c).toEqual(b);
    const bad = cloneBuild(b);
    bad.routes[3].join = K(4, 3); // R3 pointed diagonally: illegal by its shape
    expect(pruneJoins(bad)).toBe(1);
    expect(bad.routes.map((r) => r.join)).toEqual([undefined, K(4, 4), K(4, 3), undefined, K(4, 5), K(6, 3)]);
    // stale: the main belt M removed; the joins into it go, R5's join into R2 (still a belt) stays
    const cut = cloneBuild(b);
    removeRoute(cut, 0);
    expect(cut.routes.map((r) => r.join)).toEqual([undefined, undefined, undefined, undefined, K(6, 3)]);
    // the save loader (migrateRun's pruneJoins) keeps all five; with the switch off it keeps the first two, as before
    const run: Run = newRun("furnace", 77, "freejoins-save");
    run.build = limitDeck(JOINERS);
    const back = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(legalJoins(back.build)).toBe(5);
    expect(back.build.routes).toEqual(run.build.routes);
    setFreeJoins(false);
    const off = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(off.build.routes.map((r) => r.join)).toEqual([undefined, K(4, 4), K(4, 3), undefined, undefined, undefined]);
  });

  it("(3) under rules older than FREE_JOINS_RULES a deck past 2 joins is still refused, the switch on or off", () => {
    const b = limitDeck([R1, R2, R3]);
    setFreeJoins(true);
    // bb-0.9.3, the rules before bb-0.9.7: validateUpload checks the deck under ITS rules (freeJoinsFor false)
    expect(validateUpload(b, DAY, "bb-0.9.3").errors.filter((e) => e.includes(JOIN_OVER_LIMIT))).toEqual([overLimit(3, K(4, 2))]);
    expect(validateUpload(b, DAY, RULES_VERSION)).toEqual({ ok: true, errors: [] });
    expect(freeJoinsRules()).toBe(true); // the check put the switch back
  });
});

describe("JOINS-1 (5): the words follow the switch", () => {
  const items = [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }];
  function run(): Run {
    const rn = newRun("furnace", 5, "freejoins");
    rn.build = paceDeck();
    rn.build.items = items.map((p) => ({ ...p }));
    rn.inventory = [];
    return rn;
  }
  it("the inspector shows no pace line: the factory and belt panels, the belt's sub", () => {
    expect(joinPaceLines(paceDeck(), 2).map(([t]) => t)).toEqual([JOIN_PACE_LINE, `FEWER LOADS REACH THIS BELT: ${JOIN_PACE_PCT}% AS MANY.`]); // off
    expect(beltPanel(run(), 1)!.sub).toBe(`JOINS BELT 1 AT ${JOIN_PACE_PCT}% PACE. FEEDS TURRET 1.`); // off
    setFreeJoins(true);
    expect(joinPaceLines(paceDeck(), 2)).toEqual([]); // no line at all, not a 100% line
    const r = run();
    const bp = beltPanel(r, 1)!;
    expect(bp.sub).toBe("JOINS BELT 1. FEEDS TURRET 1.");
    expect(bp.subShort).toBe("JOINS BELT 1.");
    const said = [...bp.head, ...bp.rows, ...bp.foot].map((x) => x.text ?? "").join(" | ");
    expect(said).not.toMatch(/PACE|FEWER LOADS/);
    const fp = itemPanel(r, 2)!.body.map((x) => x.text ?? "").join(" | ");
    expect(fp).not.toMatch(/JOINED|PACE/);
  });

  it("the join toast and the rules card say no pace and no limit", () => {
    expect(helpLines()).toEqual(HELP); // off: the card exactly as before
    expect(HELP[2]).toContain(`(${JOIN_OVER_LIMIT}). A JOINED FACTORY RUNS AT ${JOIN_PACE_PCT}% PACE.`);
    setFreeJoins(true);
    expect(helpLine3()).toBe("3  AT DAWN, BUY RIGS FROM THE CARAVAN. DRAG OUT OF YOUR FACTORY TO LAY BELT TO A TURRET INTAKE. DRAG A BELT INTO ANOTHER TO JOIN THEM.");
    expect(helpLines()[2]).toBe(helpLine3());
    expect(helpLines().join(" ")).not.toMatch(/JOINS PER DECK|PACE/);
    expect(helpLines().filter((_, i) => i !== 2)).toEqual(HELP.filter((_, i) => i !== 2));
    // the editor's toast where the join is made (tests/joins.ui.test.ts's drag)
    const rn = run();
    rn.build.routes = [rn.build.routes[0]];
    const log: string[] = [];
    const noop = () => undefined;
    const fx = { ring: noop, sparkle: noop, sparks: noop, dust: noop, popup: noop } as unknown as EditHost["wfx"];
    const h = {
      run: rn, sel: { kind: "none" } as Sel,
      game: { audio: { play: (s: string) => log.push(`sound:${s}`) }, toast: (m: string) => log.push(`toast:${m}`), error: (m: string) => log.push(`error:${m}`) },
      L: { frame: deckFrame(0, 0, 0), hull: { x: -30, y: -30, w: 200, h: 200 }, cargo: { x: 0, y: 300, w: 100, h: 20 } },
      wfx: fx, ufx: fx, select(s: Sel) { h.sel = s; },
      turretAt: () => -1, coinPos: () => ({ x: 0, y: 0 }), touched: noop, placed: noop,
      invalid: (m: string) => log.push(`invalid:${m}`), offerAt: () => null, cargoAt: () => null,
    };
    const at = (x: number, y: number) => [x * 12 + 6, y * 12 + 6] as const;
    const ed = new Editor(h as unknown as EditHost);
    ed.down(...at(1, 6));
    for (const [x, y] of [[2, 6], [2, 5], [2, 4], [3, 4], [4, 4]] as const) ed.move(...at(x, y));
    ed.up(...at(4, 4));
    expect(rn.build.routes[1]).toEqual({ factory: 2, cells: R, join: K(4, 4) });
    expect(log).toContain("toast:JOINS BELT 1");
    expect(log.join(" ")).not.toMatch(/PACE/);
  });
});

describe("JOINS-1 (6): the par player plans joins with no limit", () => {
  it("with FREE_JOINS on it plans a third join where that rates better, and every deck validates", () => {
    let past = 0, decks = 0;
    setFreeJoins(true);
    for (const [hero, seed] of [["weaver", 1], ["weaver", 2], ["furnace", 1], ["furnace", 2]] as const) {
      for (const d of playerRun(hero, 10, seed)) {
        decks++;
        expect(validateBuild(d.build, d.day).errors, `${hero} s${seed} d${d.day}`).toEqual([]);
        if (legalJoins(d.build) > JOIN_LIMIT) past++;
      }
    }
    expect(decks).toBe(40);
    expect(past).toBeGreaterThan(0); // some par deck holds 3 or more joins: the planner weighed a join past the old limit
  }, 240_000);
});

// ---------------------------------------------------------------- the server's upload path (POST /v1/ghosts)
let dir: string;
let app: GhostServer;
let base: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "bb-joins1-"));
  app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("JOINS-1 (2) at the upload path", () => {
  it("POST /v1/ghosts refuses 4 joins with the switch off and stores them with it on (this build's rules)", async () => {
    const me = await testIdentity(0);
    const post = async (b: Build, who: string) => {
      const s: GhostSnapshot = { v: SNAPSHOT_V3, rules: RULES_VERSION, hero: "furnace", day: DAY, wins: 0, lives: 3, build: b, runId: `joins1-${who}`, playerId: `p-${who}`, createdAt: 1_790_000_000_000 };
      const body = JSON.stringify(ownedBy(s, me));
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      return { status: r.status, body: (await r.json()) as { id?: string; errors?: string[] } };
    };
    const four = limitDeck(JOINERS.slice(0, 4));
    const off = await post(four, "off");
    expect(off.status).toBe(422);
    expect(off.body.errors).toEqual(validateUpload(four, DAY).errors);
    expect(off.body.errors!.filter((e) => e.includes(JOIN_OVER_LIMIT))).toEqual([overLimit(3, K(4, 2)), overLimit(4, K(4, 5))]);
    setFreeJoins(true);
    const on = await post(four, "on");
    expect(on.status).toBe(201);
    expect(app.store.size).toBe(1);
  });
});
