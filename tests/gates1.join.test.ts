// GATES-1b (REQ-BFG-052; BRIEF-GATES1B B1, cap's ruling on GATES-1 question 5): a gate standing on a JOIN tile takes slugs from
// its own (main) belt and from the joining belt IN TURN (src/sim/convert.ts intake; Battle.joins leaves such a join to it):
// - when it is ready for a slug and slugs wait on both belts, it takes from the belt it did not take from last;
// - when only one belt has a slug ready, it takes that one at once and never waits for the other;
// - a joining belt's slug no longer slips into the gap the gate just opened on the main belt (the defect: an `in` 1 gate gave
//   every free place to the joiner and the main belt stalled for good);
// - a FUSER takes one slug of each belt when both are backed up, and two from one belt when only that belt is fed;
// - a join tile with no gate keeps today's rule (Battle.joins), and with GATES off nothing changes.
// The fixture feeds both belts itself (the factories are frozen), tags each slug with its belt (`factory`), and stands a SINK
// past the gate (every slug at or past its downstream edge is counted and removed), so the gun's pace can't throttle the gate.
import { afterEach, describe, expect, it } from "vitest";
import { Battle, type Payload, type RouteState } from "../src/sim/battle";
import { AMMO_SPACING } from "../src/sim/content";
import { key as K, type Build } from "../src/sim/deck";
import { GATES, setGates, withGates } from "../src/sim/gates";
import { barge } from "./arsenal.bench";

afterEach(() => setGates(GATES));

const SEED = 4242;
const MAIN = 1, JOIN = 7, JOIN2 = 8; // a slug's `factory` says which belt it came from (the factories are frozen)
const FLAT: Record<number, number> = { [MAIN]: 4, [JOIN]: 6, [JOIN2]: 10 };
const slug = (id: number, belt: number): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: FLAT[belt], burn: 0, shock: false, prior: 0, factory: belt, copy: false });

/** The FURNACE bench with a joining belt: the KILN at (4,6) and a belt up column 4 (tile t = cell (4, 5 - t)) into the turret, the
 *  gate on tile 2 = (4,3); a PRESS at (6,6) whose belt (6,5) (6,4) (6,3) (5,3) ends beside that tile and joins it. `second` adds a
 *  third belt that joins the same tile from the west: a SMITH-less press at (2,6), cells (2,5) (2,4) (2,3) (3,3). */
function joinBench(def: string, stars = 1, second = false): Build {
  const b: Build = {
    hero: "furnace",
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }, { uid: 20, def, x: 4, y: 3, ...(stars > 1 ? { stars } : {}) }],
    routes: [
      { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: 7, cells: [K(6, 5), K(6, 4), K(6, 3), K(5, 3)], join: K(4, 3) },
    ],
    mods: [], beltCap: 30, hullBonus: 5000,
  };
  if (second) {
    b.items.push({ uid: 8, def: "press", x: 2, y: 6 });
    b.routes.push({ factory: 8, cells: [K(2, 5), K(2, 4), K(2, 3), K(3, 3)], join: K(4, 3) });
  }
  return b;
}

interface Tally {
  taken: Record<number, number>; // slugs the gate took in, by belt
  out: Record<number, number>; // slugs that left the gate (at or past its downstream edge), by the belt of the slug (a pellet: of its slug)
  fused: number[]; // a FUSER's outputs: their flat
  done: number; // conversions finished
  burn: number[]; // the burn of every output (a SMELTER: +2 each)
  stuckMain: number; // ticks the main belt's first slug sat at the edge (or its queue stood) with the gate not working
}

/** Run `seconds` of a battle of `b` with the factories frozen; belt i is fed a slug every `feed[i]` ticks (0: never; 1: kept
 *  full) when it has room at its start. */
function run(b: Build, feed: number[], seconds = 20): Tally {
  setGates(true);
  const bt = new Battle(b, barge(), SEED);
  const s = bt.sides[0];
  for (const f of s.factories) f.frozen = 1e9;
  const c = s.converters![0];
  const tags = [MAIN, JOIN, JOIN2];
  const seen = new WeakSet<Payload>();
  const t: Tally = { taken: { [MAIN]: 0, [JOIN]: 0, [JOIN2]: 0 }, out: { [MAIN]: 0, [JOIN]: 0, [JOIN2]: 0 }, fused: [], done: 0, burn: [], stuckMain: 0 };
  let id = 100;
  const feedRoute = (r: RouteState, belt: number): void => {
    const back = r.ammo[r.ammo.length - 1];
    if (!back || back.s >= AMMO_SPACING) r.ammo.push({ p: slug(id++, belt), s: 0, processed: -1, blocked: false });
  };
  // a belt that is kept full starts BACKED UP: slugs queued one AMMO_SPACING apart from its end (the main belt's: from the gate's edge)
  feed.forEach((every, ri) => {
    if (every !== 1) return;
    const r = s.routes[ri];
    for (let at = ri === 0 ? c.inEdge : r.L; at >= 0; at -= AMMO_SPACING) r.ammo.push({ p: slug(id++, tags[ri]), s: at, processed: ri === 0 ? -1 : r.cells.length - 1, blocked: false });
  });
  for (let i = 0; i < seconds * 60 && !bt.over; i++) {
    feed.forEach((every, ri) => { if (every && i % every === 0) feedRoute(s.routes[ri], tags[ri]); });
    bt.step();
    bt.drainEvents();
    for (const p of c.buf) if (!seen.has(p)) { seen.add(p); t.taken[p.factory]++; }
    const main = s.routes[0];
    for (let k = main.ammo.length - 1; k >= 0; k--) {
      const a = main.ammo[k];
      if (a.s < c.outEdge - 1e-6) continue;
      t.out[a.p.factory]++;
      if (c.def.id === "fuser") t.fused.push(a.p.flat);
      t.burn.push(a.p.burn);
      main.ammo.splice(k, 1); // the sink: the gun takes it
    }
  }
  t.done = c.done;
  return t;
}

const near = (n: number, want: number, slack = 1): void => { expect(n).toBeGreaterThanOrEqual(want - slack); expect(n).toBeLessThanOrEqual(want + slack); };

describe("GATES-1b B1: a gate on a join tile takes from the main belt and the joining belt in turn", () => {
  it("fixture: the joining belt ends on the gate's tile (tile 2), and the gate stands there", () => {
    withGates(() => {
      const bt = new Battle(joinBench("smelter"), barge(), SEED);
      const s = bt.sides[0];
      expect(s.routes[1].join).toMatchObject({ route: 0, tile: 2, enter: 2 * 12 });
      expect(s.converters!.map((c) => [c.route, c.tile])).toEqual([[0, 2]]);
    });
  });

  it("SMELTER, both belts fed faster than one slug a second: over 20 s each belt puts 10 +-1 slugs through", () => {
    const t = run(joinBench("smelter"), [1, 1]);
    near(t.out[MAIN], 10);
    near(t.out[JOIN], 10);
    near(t.taken[MAIN], 10);
    near(t.taken[JOIN], 10);
    expect(t.done).toBeGreaterThanOrEqual(18); // and the gate never idles: about one conversion a second
    expect(t.burn.every((x) => x === 2)).toBe(true); // it smelted them: +2 BURN at ★1
  });

  it("SCATTER MILL, both belts fed faster than one slug a second: over 20 s each belt puts 10 +-1 slugs through (3 pellets each)", () => {
    const t = run(joinBench("scattermill"), [1, 1]);
    near(t.out[MAIN] / 3, 10);
    near(t.out[JOIN] / 3, 10);
    near(t.taken[MAIN], 10);
    near(t.taken[JOIN], 10);
    expect(t.done).toBeGreaterThanOrEqual(18);
  });

  it("the same at ★3 for both (the turn doesn't depend on the stars)", () => {
    for (const def of ["smelter", "scattermill"]) {
      const t = run(joinBench(def, 3), [1, 1]);
      near(t.taken[MAIN], 10);
      near(t.taken[JOIN], 10);
    }
  });

  it("FUSER there still fuses one slug of each belt (4 + 6, x1.5 = 15), every time", () => {
    const t = run(joinBench("fuser"), [1, 1]);
    expect(t.fused.length).toBeGreaterThanOrEqual(17);
    expect(t.fused.every((flat) => flat === 15), `fused flats ${t.fused.join(",")}`).toBe(true);
    near(t.taken[MAIN], t.taken[JOIN]);
  });

  it("a gate on a join tile with only one belt fed takes that belt's slugs at the full rate (about one a second)", () => {
    for (const def of ["smelter", "scattermill"]) {
      const m = run(joinBench(def), [1, 0]);
      expect(m.taken[MAIN], `${def} main only`).toBeGreaterThanOrEqual(19);
      expect(m.taken[JOIN]).toBe(0);
      const j = run(joinBench(def), [0, 1]);
      expect(j.taken[JOIN], `${def} joiner only`).toBeGreaterThanOrEqual(19);
      expect(j.taken[MAIN]).toBe(0);
    }
  });

  it("a FUSER with only one belt fed fuses two slugs of that belt (4 + 4, x1.5 = 12; 6 + 6 = 18), at the pace the belt's spacing allows", () => {
    // (a conversion is 1 s of work, and the second slug of the next pair rides up 7 px behind the first: 14 ticks more)
    const m = run(joinBench("fuser"), [1, 0]);
    expect(m.fused.length).toBeGreaterThanOrEqual(15);
    expect(m.fused.every((f) => f === 12), `main only: ${m.fused.join(",")}`).toBe(true);
    const j = run(joinBench("fuser"), [0, 1]);
    expect(j.fused.length).toBeGreaterThanOrEqual(15);
    expect(j.fused.every((f) => f === 18), `joiner only: ${j.fused.join(",")}`).toBe(true);
  });

  it("it never waits for the other belt: one belt backed up, the other a slug every 5 s: the trickle is taken in turn, the gate keeps its pace", () => {
    for (const def of ["smelter", "scattermill"]) {
      const a = run(joinBench(def), [1, 300]); // the joiner trickles
      expect(a.taken[JOIN], `${def}: joiner's four slugs`).toBe(4);
      expect(a.taken[MAIN] + a.taken[JOIN], `${def}: the gate never idled`).toBeGreaterThanOrEqual(19);
      const b = run(joinBench(def), [300, 1]); // the main belt trickles
      expect(b.taken[MAIN], `${def}: main's four slugs`).toBe(4);
      expect(b.taken[MAIN] + b.taken[JOIN], `${def}: the gate never idled`).toBeGreaterThanOrEqual(19);
    }
  });

  it("three belts on one tile (the main belt and two joiners) take a turn each", () => {
    const t = run(joinBench("smelter", 1, true), [1, 1, 1]);
    near(t.taken[MAIN], 20 / 3, 1);
    near(t.taken[JOIN], 20 / 3, 1);
    near(t.taken[JOIN2], 20 / 3, 1);
  });

  it("a join tile with NO gate keeps today's rule: the joining belt's slug enters the main belt at the entry point when it is free", () => {
    withGates(() => {
      const b = joinBench("smelter");
      b.items = b.items.filter((p) => p.uid !== 20); // no gate
      const bt = new Battle(b, barge(), SEED);
      const s = bt.sides[0];
      for (const f of s.factories) f.frozen = 1e9;
      expect(s.converters).toBeUndefined();
      const joiner = s.routes[1], main = s.routes[0];
      joiner.ammo.push({ p: slug(500, JOIN), s: joiner.L, processed: 3, blocked: false });
      main.ammo.push({ p: slug(501, MAIN), s: 2, processed: -1, blocked: false });
      bt.step();
      expect(joiner.ammo.length).toBe(0);
      expect(main.ammo.map((a) => a.p.id).sort()).toEqual([500, 501]);
      expect(main.ammo.find((a) => a.p.id === 500)!.s).toBeCloseTo(2 * 12, 6);
    });
  });
});
