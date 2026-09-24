// 0.6.2 BELTSIDE: the tooling showcase decks (src/tooling.ts SHOWCASE, used by scripts/shots-list.mjs) are legal
// decks on their day and put what their names promise on screen.
import { describe, expect, it } from "vitest";
import { SHOWCASE } from "../src/tooling";
import { validateBuild } from "../src/net/validate";
import { hitsOfRig, key as K, rigHits, type Build } from "../src/sim/deck";
import { simulate } from "../src/sim/battle";

const hitsOn = (b: Build, x: number, y: number) => rigHits(b).flatMap((r) => r.flatMap((t) => t)).filter((h) => h.cell === K(x, y));

describe("showcase decks", () => {
  it("every one is legal on its day and fights a clean battle against every other", () => {
    for (const [name, s] of Object.entries(SHOWCASE)) {
      expect(validateBuild(s.build(), s.day).errors, name).toEqual([]);
      for (const [foe, f] of Object.entries(SHOWCASE)) {
        const b = simulate(s.build(), f.build(), 3);
        expect(b.over, `${name} v ${foe}`).toBe(true);
        for (const side of b.sides) expect(Number.isNaN(side.hull.hp)).toBe(false);
      }
    }
  });
  it("sides: two rigs work (2,3) from both sides, and two more (2,2); the COIL and SPLITTER show idle arrows", () => {
    const b = SHOWCASE.sides.build();
    expect(hitsOn(b, 2, 3).map((h) => [h.uid, h.dir])).toEqual([[10, 1], [11, 3]]);
    expect(hitsOn(b, 2, 2).map((h) => h.uid).sort()).toEqual([13, 16]);
    expect(hitsOfRig(b, 15)).toHaveLength(1); // COIL: 2 arrows, 1 on a belt
    expect(hitsOfRig(b, 16)).toHaveLength(1); // SPLITTER: 3 arrows, 1 on a belt
  });
  it("twobelts: one LONG HAUL feeds two belts; the COIL works a corner twice", () => {
    const b = SHOWCASE.twobelts.build();
    expect(hitsOfRig(b, 10).map((h) => h.route)).toEqual([0, 1]);
    expect(hitsOfRig(b, 13).map((h) => [h.route, h.cell])).toEqual([[2, K(7, 6)], [2, K(8, 5)]]);
  });
  it("junction: the OVERDRIVE (X) lands all four arrows, on two routes", () => {
    const b = SHOWCASE.junction.build();
    const h = hitsOfRig(b, 10);
    expect(h).toHaveLength(4);
    expect(new Set(h.map((x) => x.route))).toEqual(new Set([0, 1]));
  });
});
