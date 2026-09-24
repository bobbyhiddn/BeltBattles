import { describe, expect, it } from "vitest";
import { levelLine, mergeLine, nextLine, portraitButtons, starEffectLine } from "../src/screens/build/inspector";
import { textWidth } from "../src/render/font";
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

describe("F7 (the Prime's call): portrait action buttons (portraitButtons, pure font metrics)", () => {
  it("in the phone band the buttons never cover the title, the sub-line or the icon, and stay inside", () => {
    type Box = { x: number; y: number; w: number; h: number };
    const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const band: Box = { x: 3, y: 100, w: 161, h: 69 }; // the phone build screen: W 167, info band x 3, w W - 6, h 69
    const cases: [string, string, string[], "top" | "row"][] = [
      ["HEAVY TURRET 1", "FED FROM COLUMN 5+6", ["REMOVE CORE", "REMOVE GEAR"], "row"], // review-061's F7 scenario
      // 0.6.2 BELTSIDE merge: the sub lines read RIG, as the player sees them (wording only; same row/top outcome)
      ["TEMPER", "COMMON RIG · GUNSMITH", ["BUY+MERGE 3G"], "row"],
      ["TEMPER", "COMMON RIG · IN CARGO", ["SELL +2G"], "top"], // sized to its label, it fits beside the texts
      ["BELT ROUTE", "FEEDS TURRET 1", ["REMOVE BELT"], "top"], // fits at the old 64 px width
    ];
    for (const [title, sub, labels, where] of cases) {
      const { rects, shift } = portraitButtons(title, sub, labels, band);
      const texts: Box[] = [
        { x: band.x + 22, y: band.y + 3, w: textWidth(title) + 2, h: 9 }, // the 5x7 title with its 1 px outline
        { x: band.x + 23, y: band.y + 13, w: textWidth(sub, "3"), h: 5 },
        { x: band.x + 4, y: band.y + 4, w: 16, h: 16 }, // the icon box
      ];
      expect(rects).toHaveLength(labels.length);
      for (const q of rects) {
        for (const t of texts) expect(hit(q, t), `${labels.join("+")} vs ${title} / ${sub}`).toBe(false);
        expect(q.x).toBeGreaterThanOrEqual(band.x + 4);
        expect(q.x + q.w).toBeLessThanOrEqual(band.x + band.w - 4);
        expect(q.w).toBeGreaterThanOrEqual(textWidth(labels[rects.indexOf(q)], "3") + 4); // the label fits its button
      }
      if (rects.length === 2) expect(hit(rects[0], rects[1])).toBe(false);
      expect(where === "top" ? rects.every((q) => q.y === band.y + 4) && shift === 0 : rects.every((q) => q.y === band.y + 21) && shift === 12).toBe(true);
    }
  });
});
