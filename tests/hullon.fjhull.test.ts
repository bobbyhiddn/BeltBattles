// HULL-ON run 5, H4's hero pass (REQ-BFG-091, REQ-BFG-092; cap's ruling 84ad10254e1855c8, RULING-HULLON-R9 Q3; ruling
// 19139b4c41a1636f): WEAVER's hull behind FREE_JOINS (src/sim/freeJoins.ts FREE_JOINS_HULL, on guard.ts's RUNE_BASE
// pattern): on -> 1500, off -> content.ts's 1700, and withFreeJoins leaves the state it found. No other hero's hull moves.
import { afterEach, describe, expect, it } from "vitest";
import { HEROES } from "../src/sim/content";
import { FREE_JOINS, FREE_JOINS_HULL, freeJoinsRules, setFreeJoins, withFreeJoins } from "../src/sim/freeJoins";

afterEach(() => setFreeJoins(FREE_JOINS)); // the shipped value

const others = (): [string, number][] => Object.values(HEROES).filter((h) => h.id !== "weaver").map((h) => [h.id, h.hull]);

describe("HULL-ON: WEAVER's hull behind FREE_JOINS (ruling 84ad10254e1855c8)", () => {
  it("on (the shipped default): WEAVER 1500; off: content.ts's 1700; every other hero's hull as content.ts has it", () => {
    expect(FREE_JOINS).toBe(true);
    expect(freeJoinsRules()).toBe(true);
    expect(FREE_JOINS_HULL).toEqual({ weaver: 1500 });
    expect(HEROES.weaver.hull).toBe(1500);
    const on = others();
    setFreeJoins(false);
    expect(HEROES.weaver.hull).toBe(1700);
    expect(others()).toEqual(on);
    setFreeJoins(false); // setting the state it has: no change
    expect(HEROES.weaver.hull).toBe(1700);
    setFreeJoins(true);
    expect(HEROES.weaver.hull).toBe(1500);
    expect(others()).toEqual(on);
  });

  it("withFreeJoins leaves the state it found, even when its function throws", () => {
    expect(withFreeJoins(() => HEROES.weaver.hull, false)).toBe(1700);
    expect(HEROES.weaver.hull).toBe(1500);
    setFreeJoins(false);
    expect(withFreeJoins(() => HEROES.weaver.hull)).toBe(1500);
    expect(HEROES.weaver.hull).toBe(1700);
    expect(() => withFreeJoins(() => { throw new Error("x"); })).toThrow("x");
    expect(freeJoinsRules()).toBe(false);
    expect(HEROES.weaver.hull).toBe(1700);
  });
});
