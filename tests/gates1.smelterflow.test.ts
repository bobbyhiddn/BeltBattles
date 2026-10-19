// GATES-1b (REQ-BFG-052; BRIEF-GATES1B B5): par's late SMELTER buys. The cause the presence bench showed (O/bench/b5inflow-*): gateSpot and
// gateWorth read only the gate's OWN belt's flow, but a gate passes `in` slugs a `secs` second whatever feeds it, and belts that join its
// belt at or before its tile feed it too. 26 of the 65 SMELTER holders of days 6 and 10 had an own belt within the limit and an inflow over
// it, and averaged -16.4 points. Now:
// - gateInflow: the belt's own flow plus every belt that joins it at or before the gate's tile (and theirs, upstream);
// - gateSpot puts no SMELTER on a tile whose inflow is over GATE_SLACK x its intake (the nearest tile before the joins instead, or none);
// - gateWorth turns an overfed SMELTER's worth into a minus (a deck whose joiners overfeed it rates lower, so a purchase or a redraw that
//   would overfeed it isn't made);
// - the FUSER and the SCATTER MILL are read as before (B5 is the SMELTER's).
import { afterEach, describe, expect, it } from "vitest";
import { key as K, type Build } from "../src/sim/deck";
import type { RateOut } from "../src/sim/deckRating";
import { GATES, setGates, withGates } from "../src/sim/gates";
import { GATE_INTAKE, GATE_SLACK, gateInflow, gateSpot, gateWorth } from "../src/sim/harness/gateBots";

afterEach(() => setGates(GATES));

const up = (x: number, y0: number, y1: number): number[] => Array.from({ length: y0 - y1 + 1 }, (_, i) => K(x, y0 - i));

/** FURNACE: the KILN at (4,6) and its belt up column 4 into the gun (tile t = (4, 5 - t)), 6 tiles; a STAMP PRESS at (6,6) whose belt (6,5) (6,4)
 *  (6,3) (5,3) ends beside tile 2 (4,3) and joins the main belt there; `smelter`: its tile, if any. */
function deck(smelter?: number, joinTile = 2): Build {
  const main = up(4, 5, 0);
  const b: Build = {
    hero: "furnace",
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }],
    routes: [{ factory: 1, cells: main }, { factory: 7, cells: [K(6, 5), K(6, 4), K(6, 3), K(5, 3)], join: main[joinTile] }],
    mods: [], beltCap: 40, hullBonus: 5000,
  };
  if (smelter !== undefined) b.items.push({ uid: 30, def: "smelter", x: 4, y: 5 - smelter });
  return b;
}
/** The rating's read-out with chosen flows (payloads a second) by route. */
const ro = (...arrival: number[]): RateOut => ({ stokeKeep: new Map(), arrival: new Map(arrival.map((a, i) => [i, a])), turretDmg: new Map() });

describe("GATES-1b B5: what a gate must pass is its belt's flow and its joiners'", () => {
  it("gateInflow: the belt's own flow, plus every belt that joins it at or before the tile; a join after the tile is not counted", () => {
    const b = deck(), r = ro(0.47, 2);
    expect(gateInflow(b, r, 0, 0)).toBeCloseTo(0.47, 9);
    expect(gateInflow(b, r, 0, 1)).toBeCloseTo(0.47, 9); // the joiner joins at tile 2: after this tile
    expect(gateInflow(b, r, 0, 2)).toBeCloseTo(2.47, 9); // at the join tile: counted
    expect(gateInflow(b, r, 0, 4)).toBeCloseTo(2.47, 9);
    expect(gateInflow(b, r, 1, 3), "the joiner's own belt").toBeCloseTo(2, 9);
    // a belt that joins the joiner (a chain): counted for a gate on the main belt past the join
    const chain = deck();
    chain.items.push({ uid: 8, def: "press", x: 8, y: 6 });
    chain.routes.push({ factory: 8, cells: [K(8, 5), K(8, 4), K(7, 4)], join: K(6, 4) });
    expect(gateInflow(chain, ro(0.47, 0.5, 0.3), 0, 2)).toBeCloseTo(0.47 + 0.5 + 0.3, 9);
    expect(gateInflow(chain, ro(0.47, 0.5, 0.3), 0, 1)).toBeCloseTo(0.47, 9);
  });

  it("a SMELTER's spot: not on a tile its joiners overfeed (the nearest tile before the join instead); with a thin joiner the middle as before", () => {
    withGates(() => {
      const b = deck();
      expect(GATE_SLACK * GATE_INTAKE.smelter).toBeCloseTo(1.1, 9);
      // the own belt carries 0.47 a second (under the limit), the joiner 2: tile 2 (the middle, the join tile) and every later tile pass 2.47
      const over = gateSpot(b, "smelter", ro(0.47, 2));
      expect(over, "a spot before the join").not.toBeNull();
      expect(over!.tile).toBe(1);
      // a thin joiner: 0.47 + 0.2 is within the limit: the middle, tile 2, as GATES-1 chose
      expect(gateSpot(b, "smelter", ro(0.47, 0.2))!.tile).toBe(2);
      // a join at the belt's end leaves the tiles before it free
      expect(gateSpot(deck(undefined, 4), "smelter", ro(0.47, 2))!.tile).toBe(2);
    });
  });

  it("a belt whose joiners overfeed it at every tile that is legal takes no SMELTER (the join at tile 1: only tile 1 and the later ones are fed by it)", () => {
    withGates(() => {
      const b = deck(undefined, 1);
      // tiles 1..4 are legal; every one is at or after the join at tile 1
      expect(gateSpot(b, "smelter", ro(0.47, 2))).toBeNull();
      expect(gateSpot(b, "smelter", ro(0.47, 0.2))).not.toBeNull();
    });
  });

  it("gateWorth: an overfed SMELTER is a minus; the same one on a tile before the join, or with a thin joiner, is a plus", () => {
    withGates(() => {
      const fed = gateWorth(deck(2), ro(0.47, 2)); // the join tile: 2.47 a second through a 1-a-second gate
      const before = gateWorth(deck(1), ro(0.47, 2)); // tile 1: the joiner joins after it
      const thin = gateWorth(deck(2), ro(0.47, 0.2));
      expect(fed).toBeLessThan(0);
      expect(before).toBeGreaterThan(0);
      expect(thin).toBeGreaterThan(0);
      expect(fed, "the same size, turned over").toBeCloseTo(-thin, 9);
      // a deck with no joiner is read exactly as before: the own flow decides, within the slack
      const solo = deck(2);
      solo.routes.pop();
      expect(gateWorth(solo, ro(1.05))).toBeGreaterThan(0);
    });
  });

  it("the FUSER and the SCATTER MILL are read as before: the joiner's flow doesn't turn their worth over or move their spot", () => {
    withGates(() => {
      const b = deck();
      const f = deck();
      f.items.push({ uid: 30, def: "fuser", x: 4, y: 3 });
      const m = deck();
      m.items.push({ uid: 30, def: "scattermill", x: 4, y: 3 });
      expect(gateWorth(f, ro(0.8, 2))).toBeGreaterThan(0);
      expect(gateWorth(m, ro(0.3, 2))).toBeGreaterThan(0);
      expect(gateSpot(b, "fuser", ro(0.8, 2))?.tile).toBe(gateSpot(b, "fuser", ro(0.8, 0.1))?.tile);
    });
  });
});
