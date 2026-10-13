// PAIR-1c (REQ-BFG-100; cap's ruling, CHECK-COMBINED Q2): C5, a belt's slug count, never shows on a one-tile joining belt
// (RouteState.join set, fewer than 2 cells: with SHAPES on, every par I3 ASSEMBLY LINE's exit), unless a belt reader
// (BELT_READERS) works it. Such a belt is a connector: its slugs are counted one tile later, on the belt they join. The
// rule is game/counters.ts beltShows, which the drawing and the belt's tap and hover group both read
// (screens/battleCounters.ts drawBoard). Multi-tile joining belts and one-tile belts without a join (a gun's intake) keep
// COUNT-1's "all" rule. Tests only.
import { describe, expect, it } from "vitest";
import type { RouteJoin, SideState } from "../src/sim/battle";
import { CELL } from "../src/sim/content";
import { BELT_COUNTS, BELT_READERS, beltShows, type BeltCounts } from "../src/game/counters";

type Belt = Parameters<typeof beltShows>[1];
type Gates = Pick<SideState, "gates">;

const MODES: BeltCounts[] = ["all", "readers"];
/** A belt reader for the tests, passed as `readers`: an id no list holds, so the file stays green when CROWD PRESS (1E)
 *  fills BELT_READERS (empty today). */
const READER = "pair1c-reader";
/** The shaped fight's join (CHECK-COMBINED 3(b)): your route 3 at (2,1) joins route 1 at tile 6. */
const JOIN: RouteJoin = { route: 1, tile: 6, enter: 6 * CELL, tail: 2 * CELL, feeds: 0 };
const SLUG = {};

const belt = (index: number, cells: number[], slugs: number, join?: RouteJoin): Belt =>
  ({ index, cells, ammo: Array.from({ length: slugs }, () => SLUG), ...(join ? { join } : {}) });
/** A side whose rigs are `rigs`: each its id and the routes its arrows hit. */
const side = (...rigs: [string, number[]][]): Gates =>
  ({ gates: rigs.map(([id, routes]) => ({ def: { id }, hits: routes.map((route) => ({ route })) })) }) as unknown as Gates;

/** Your I3 ASSEMBLY LINE's exit in the shaped fight: route 3, the one cell 12 (2,1), joining route 1. */
const oneTileJoin = (slugs = 1): Belt => belt(3, [12], slugs, JOIN);
const twoTileJoin = (slugs = 1): Belt => belt(3, [13, 12], slugs, JOIN);
const oneTileIntake = (slugs = 1): Belt => belt(4, [6], slugs);
const mainBelt = (slugs = 1): Belt => belt(1, [53, 52, 51, 41, 31, 21, 11, 1], slugs);

describe("PAIR-1c: no belt count on a one-tile joining belt, unless a belt reader works it", () => {
  it("C5's rule still defaults to all, and the readers default to BELT_READERS", () => {
    expect(BELT_COUNTS).toBe("all");
    // a rig BELT_READERS names, working a one-tile joining belt, shows its count (none live today: CROWD PRESS, 1E)
    for (const id of BELT_READERS) expect(beltShows(side([id, [3]]), oneTileJoin(), "all"), id).toBe(true);
    // a rig no list names never does
    expect(beltShows(side([READER, [3]]), oneTileJoin(), "all")).toBe(false);
  });

  it("a one-tile joining belt holding a slug: no count under all (nor under readers)", () => {
    for (const n of [1, 2, 5]) {
      expect(beltShows(side(), oneTileJoin(n), "all"), `${n} slugs`).toBe(false);
      expect(beltShows(side(), oneTileJoin(n), "readers"), `${n} slugs`).toBe(false);
    }
    // rigs that are no belt reader working it change nothing (a SPIKE RAIL, an EMBER TROUGH)
    expect(beltShows(side(["spikerail", [3]], ["embertrough", [3, 1]]), oneTileJoin(), "all", [READER])).toBe(false);
  });

  it("the same belt with a belt reader working it: the count shows, under both modes", () => {
    for (const mode of MODES) {
      expect(beltShows(side([READER, [3]]), oneTileJoin(), mode, [READER]), mode).toBe(true);
      expect(beltShows(side(["spikerail", [1]], [READER, [0, 3]]), oneTileJoin(2), mode, [READER]), mode).toBe(true);
      // a reader on another belt does not count for this one
      expect(beltShows(side([READER, [1]]), oneTileJoin(), mode, [READER]), mode).toBe(false);
      // and a belt holding no slug shows nothing, read or not
      expect(beltShows(side([READER, [3]]), oneTileJoin(0), mode, [READER]), mode).toBe(false);
    }
  });

  it("a two-tile joining belt keeps its count under all (and under readers only where a reader works it)", () => {
    expect(beltShows(side(), twoTileJoin(), "all")).toBe(true);
    expect(beltShows(side(), belt(3, [14, 13, 12], 3, JOIN), "all")).toBe(true);
    expect(beltShows(side(), twoTileJoin(), "readers")).toBe(false);
    expect(beltShows(side([READER, [3]]), twoTileJoin(), "readers", [READER])).toBe(true);
  });

  it("a one-tile belt with no join (a gun's intake) keeps its count under all", () => {
    expect(beltShows(side(), oneTileIntake(), "all")).toBe(true);
    expect(beltShows(side(), oneTileIntake(4), "all")).toBe(true);
    expect(beltShows(side(), oneTileIntake(), "readers")).toBe(false);
    expect(beltShows(side([READER, [4]]), oneTileIntake(), "readers", [READER])).toBe(true);
    // the main belt a one-tile joining belt feeds keeps its count too: the joined slugs are counted there
    expect(beltShows(side(), mainBelt(4), "all")).toBe(true);
  });

  it("any belt holding no slug: no count, under both modes, read or not", () => {
    const empty = [oneTileJoin(0), twoTileJoin(0), oneTileIntake(0), mainBelt(0), belt(2, [], 0)];
    for (const b of empty) {
      for (const mode of MODES) {
        expect(beltShows(side(), b, mode), `route ${b.index} ${mode}`).toBe(false);
        expect(beltShows(side([READER, [b.index]]), b, mode, [READER]), `route ${b.index} ${mode}, read`).toBe(false);
      }
    }
  });
});
