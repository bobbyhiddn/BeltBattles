// HULL-ON (REQ-BFG-097; the flip; cap's ruling 6f4568477e66a600): content.ts setWave3 and setSustain write the base defs of
// every wave-3 and sustain piece back into ITEMS, PLATE ROLLER's and WARD BELL's among them, so with GUARD on one toggle
// (tools/luckReport.ts and five other tools) left the base def in ITEMS for the rest of the process. guard.ts now hooks both
// toggles (onSetWave3, onSetSustain) and puts the guarded def back while GUARD is on, as ladderFix.ts does for STOKER.
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS, SUSTAIN_ITEMS, WAVE3_ITEMS, setSustain, setWave3, withSustain, withWave3 } from "../src/sim/content";
import { GUARD_BELL_EVERY, GUARD_PLATE, guardRules, setGuard, withGuard } from "../src/sim/guard";
import { ladderFixRules } from "../src/sim/ladderFix";
import { effectAt } from "../src/sim/stars";

const plate = (stars: number): number | undefined => effectAt("plateroller", stars).gate?.plate;
const every = (stars: number): number | undefined => effectAt("wardbell", stars).mod?.shield?.every;

afterEach(() => {
  setGuard(true); // the shipped value (HULL-ON's flip)
  setWave3(true);
  setSustain(true);
});

describe("HULL-ON: GUARD survives the wave-3 and sustain toggles (ruling 6f4568477e66a600)", () => {
  it("GUARD on: after withWave3(.., false) and after setWave3(true), PLATE ROLLER is the guarded def: 15 / 33 / 51", () => {
    expect(guardRules()).toBe(true);
    expect([plate(1), plate(2), plate(3)]).toEqual([GUARD_PLATE[1], GUARD_PLATE[2], GUARD_PLATE[3]]);
    withWave3(() => {
      expect(Object.keys(ITEMS)).not.toContain("plateroller"); // inside the off toggle: not listed
    }, false);
    expect(Object.keys(ITEMS)).toContain("plateroller"); // after it: listed again
    expect(ITEMS.plateroller).not.toBe(WAVE3_ITEMS.plateroller);
    expect([plate(1), plate(2), plate(3)]).toEqual([15, 33, 51]);
    setWave3(true);
    expect([plate(1), plate(2), plate(3)]).toEqual([15, 33, 51]);
  });

  it("GUARD on: after withSustain(.., false) and after setSustain(true), WARD BELL rings every 4 / 2.5 / 2 s", () => {
    expect([every(1), every(2), every(3)]).toEqual([GUARD_BELL_EVERY[1], GUARD_BELL_EVERY[2], GUARD_BELL_EVERY[3]]);
    withSustain(() => {
      expect(Object.keys(ITEMS)).not.toContain("wardbell");
    }, false);
    expect(Object.keys(ITEMS)).toContain("wardbell");
    expect(ITEMS.wardbell).not.toBe(SUSTAIN_ITEMS.wardbell);
    expect([every(1), every(2), every(3)]).toEqual([4, 2.5, 2]);
    setSustain(true);
    expect([every(1), every(2), every(3)]).toEqual([4, 2.5, 2]);
  });

  it("GUARD off: the toggles leave exactly the base defs (WAVE3_ITEMS.plateroller, SUSTAIN_ITEMS.wardbell), as before", () => {
    withGuard(() => {
      withWave3(() => 0, false);
      withSustain(() => 0, false);
      expect(ITEMS.plateroller).toBe(WAVE3_ITEMS.plateroller);
      expect(ITEMS.wardbell).toBe(SUSTAIN_ITEMS.wardbell);
      expect([plate(1), plate(2), plate(3)]).toEqual([5, 11, 17]);
      expect([every(1), every(2), every(3)]).toEqual([8, 5, 4]);
    }, false);
    // and back on: the guarded defs
    expect([plate(1), every(1)]).toEqual([15, 4]);
  });

  it("STOKER's ladder-fixed def still comes back after a wave-3 toggle (ladderFix.ts's own hook)", () => {
    expect(ladderFixRules()).toBe(true);
    const fixed = ITEMS.stoker;
    expect(fixed).not.toBe(WAVE3_ITEMS.stoker);
    withWave3(() => 0, false);
    expect(ITEMS.stoker).not.toBe(WAVE3_ITEMS.stoker);
    expect(ITEMS.stoker).toEqual(fixed);
  });
});
