// FIT-099 (REQ-BFG-079, REQ-BFG-086; BRIEF-FIT099 F1 S4a; RULING-FIT-R1, oracle aa0369c46ad69acd; R8 7fb66a391c57fbea):
// D, the damage day term, on days 3-5 behind SHAPES: shapes.ts SHAPES_DMG_TENTHS (1.6 / 1.7 / 1.8), written into hullScale.ts
// DMG_MUL_TENTHS by setShapes while the switch is on; hullScale.ts's own row (1.8 / 1.9 / 2.0) while it is off. Test only:
// the two rows, D's rules in both, the late table and step unmoved, and withShapes leaving the state it found.
import { describe, expect, it } from "vitest";
import { DMG_MUL_STEP_TENTHS, DMG_MUL_TENTHS_LATE, dayMulTenths, dmgMulTenths } from "../src/sim/hullScale";
import { SHAPES, SHAPES_DMG_TENTHS, shapesRules, withShapes } from "../src/sim/shapes";

const row = (n = 10): number[] => Array.from({ length: n }, (_, i) => dmgMulTenths(i + 1));
const ON = [10, 13, 16, 17, 18, 20, 21, 23, 24, 26];
const OFF = [10, 13, 18, 19, 20, 20, 21, 23, 24, 26];

describe("FIT-099: D on days 3-5 behind SHAPES (RULING-FIT-R1)", () => {
  it("SHAPES on reads 1.6 / 1.7 / 1.8 on days 3-5, off reads 1.8 / 1.9 / 2.0; nothing else moves", () => {
    expect(SHAPES).toBe(true);
    expect(SHAPES_DMG_TENTHS).toEqual({ 3: 16, 4: 17, 5: 18 });
    const was = shapesRules();
    const before = row();
    expect(withShapes(() => row(), true)).toEqual(ON);
    expect(withShapes(() => row(), false)).toEqual(OFF);
    expect(shapesRules()).toBe(was);
    expect(row()).toEqual(before); // withShapes leaves the state it found
    expect(row()).toEqual(was ? ON : OFF);
    // days 11-18 and the step follow day 10, which doesn't move (R8's numbers)
    expect(DMG_MUL_TENTHS_LATE).toEqual([29, 33, 36, 40, 45, 50, 55, 61]);
    expect(DMG_MUL_STEP_TENTHS).toBe(5);
    expect(withShapes(() => row(30), true).slice(5)).toEqual(withShapes(() => row(30), false).slice(5));
  });

  it("D's rules hold in both rows: D(1) = 1, never falls, D <= M, M / D never falls on days 3-10", () => {
    for (const on of [true, false]) {
      const D = withShapes(() => row(30), on), M = Array.from({ length: 30 }, (_, i) => dayMulTenths(i + 1));
      expect(D[0]).toBe(10);
      for (let d = 1; d < 30; d++) expect(D[d]).toBeGreaterThanOrEqual(D[d - 1]);
      for (let d = 0; d < 30; d++) expect(D[d]).toBeLessThanOrEqual(M[d]);
      for (let d = 3; d < 10; d++) expect(M[d] / D[d]).toBeGreaterThanOrEqual(M[d - 1] / D[d - 1]);
    }
  });
});
