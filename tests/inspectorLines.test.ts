import { describe, expect, it } from "vitest";
import { levelLine, mergeLine, nextLine, starEffectLine } from "../src/screens/build/inspector";
import { newRun, type Run } from "../src/game/run";
import { resolveCore } from "../src/sim/cores";
import { ITEMS, type ItemDef } from "../src/sim/content";
import { pendingAt } from "../src/sim/stars";

// 0.6.1r (review-061 F5, N2, N4): the inspector's level, NEXT and MERGES WITH lines. Every expected string
// is written out by hand from the catalogue numbers (content.ts), never recomputed with the inspector's code.

/** A run of `hero` holding the given copies of `def` in cargo (stars absent = 1). */
function holding(def: string, stars: number[], hero: "furnace" | "weaver" = "furnace"): Run {
  const run = newRun(hero, 4242);
  run.inventory = stars.map((s, i) => ({ uid: 900 + i, def, ...(s > 1 ? { stars: s } : {}) }));
  return run;
}

describe("F5: a perk whose values are still pending is never named (stubbed modules)", () => {
  const items = ITEMS as Record<string, ItemDef>;
  const stub = (id: string, pending?: Record<string, number>): ItemDef => ({
    id, name: "STUB GATE", kind: "gate", rarity: "common", price: 3, size: 1, desc: ["A TEST GATE."], gate: {},
    levels: { 2: { perk: "PHANTOM", ...(pending ? { pending } : {}) }, 3: { perk: "PHANTOM III" } },
  });

  it("pending: no perk in the level, NEXT or effect lines; once live, the perk shows", () => {
    items.__pendgate = stub("__pendgate", { jump: 1 });
    items.__livegate = stub("__livegate");
    try {
      expect(pendingAt("__pendgate", 2)).toEqual({ jump: 1 });
      expect(pendingAt("__pendgate", 3)).toEqual({ jump: 1 }); // level 2's pending carries to 3 stars
      expect(starEffectLine("__pendgate", 2)).toBe("");
      expect(levelLine("__pendgate", 2)).toBe("★2");
      expect(levelLine("__pendgate", 3)).toBe("★3");
      expect(nextLine(holding("__pendgate", [1]), "__pendgate", 1)).toBe("NEXT ★2 · 1 MORE COPY");

      expect(pendingAt("__livegate", 2)).toEqual({});
      expect(starEffectLine("__livegate", 2)).toBe("PHANTOM");
      expect(levelLine("__livegate", 2)).toBe("★2 PHANTOM");
      expect(levelLine("__livegate", 3)).toBe("★3 PHANTOM III");
      expect(nextLine(holding("__livegate", [1]), "__livegate", 1)).toBe("NEXT ★2: PHANTOM · 1 MORE COPY");
    } finally {
      delete items.__pendgate;
      delete items.__livegate;
    }
    expect(Object.keys(ITEMS)).not.toContain("__pendgate");
    expect(Object.keys(ITEMS)).not.toContain("__livegate");
  });
});

describe("N2: one more COPY, two more COPIES", () => {
  it("TEMPER from 1★ needs 1 copy, from a lone 2★ needs 2", () => {
    expect(nextLine(holding("temper", [1]), "temper", 1)).toBe("NEXT ★2: +4 BURN · 1 MORE COPY");
    expect(nextLine(holding("temper", [2]), "temper", 2)).toBe("NEXT ★3: +7 BURN · 2 MORE COPIES");
  });
});

describe("N4: a turret core's lines show its headline at that star", () => {
  it("PRESSURE BREECH on FURNACE (heavy, k 1): ★1 -> ★2 and ★2 -> ★3", () => {
    expect(nextLine(holding("pressure", [1]), "pressure", 1)).toBe("NEXT ★2: +2.6 DMG PER QUEUED · 1 MORE COPY");
    expect(mergeLine(holding("pressure", [1]), "pressure")).toBe("MERGES WITH YOUR PRESSURE BREECH ★1 → ★2 · +2.6 DMG PER QUEUED");
    expect(levelLine("pressure", 2)).toBe("★2: +2.6 DMG PER QUEUED");
    expect(nextLine(holding("pressure", [2]), "pressure", 2)).toBe("NEXT ★3: +4.2 DMG PER QUEUED · 2 MORE COPIES");
    expect(mergeLine(holding("pressure", [2, 1]), "pressure")).toBe("MERGES WITH YOUR PRESSURE BREECH ★2 → ★3 · +4.2 DMG PER QUEUED");
  });

  it("on WEAVER (light, k 0.55) the absolute numbers scale like the fitted core's: 2.6 x 0.55 = 1.43, 4.2 x 0.55 = 2.31", () => {
    expect(nextLine(holding("pressure", [1], "weaver"), "pressure", 1)).toBe("NEXT ★2: +1.4 DMG PER QUEUED · 1 MORE COPY");
    expect(nextLine(holding("pressure", [2], "weaver"), "pressure", 2)).toBe("NEXT ★3: +2.3 DMG PER QUEUED · 2 MORE COPIES");
    // the turret panel's source for the same core once fitted: resolveCore's k-scaled spec
    const run = newRun("weaver", 4242);
    run.build.mods.push({ uid: 950, def: "pressure", turret: 0, stars: 2 });
    expect(resolveCore(run.build, 0).spec.perQueued).toBeCloseTo(1.43, 6);
  });

  it("ROTARY BREECH: its stars change the fire rate, then add NEVER JAMS", () => {
    expect(starEffectLine("rotary", 1)).toBe("FIFO LOAD FIRST");
    expect(levelLine("rotary", 2)).toBe("★2 GREASED RACE: FIFO LOAD FIRST · FIRE X0.85");
    expect(levelLine("rotary", 3)).toBe("★3 CLEAN FEED: FIFO LOAD FIRST · FIRE X0.7 · NEVER JAMS");
  });
});
