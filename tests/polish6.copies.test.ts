// POLISH-6 P6-1 (REQ-BFG-089; RULING-POLISH5 R6, RULING-REVIEW-POLISH5 N5, cap's answer A1): COPIES prints a mean (SORTING ARM's 4/3 copies a payload), and inspector.ts printed it as `1.3333333333333333`
// (cut at the panel's edge before POLISH-5, whole after it). The format: a whole count prints as it does, a non-whole one is rounded to ONE decimal (4/3 -> 1.3, 5/3 -> 1.7),
// and one that rounds to a whole prints the whole, never `2.0`.
// (a) the helper's contract: `copiesText` of inspector.ts, a local format over fmtCount (fmtCount itself stays "a count as it is": NUM-4, a fraction is a finding);
// (b) the readout in the belt panel of every real belt (the 316 of the rival builds, days 5-16): a COPIES cell is a whole count or one decimal, and is est.copies rounded to it.
// Red at polish5-accepted: 38 of the 316 belts print a 16-digit COPIES (4/3 x36, 16/9 x2); the sweep fails on every non-whole step.
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { faceRun } from "../src/screens/battleScout";
import { copiesText, routePanel, type PanelText } from "../src/screens/build/inspector";
import { withEnchant } from "../src/sim/enchant";
import { walkRoute } from "../src/sim/deck";
import { RIVAL_IDS, rivalBuild, rivalDays, standInBuild, type RivalId } from "../src/sim/rivals";

installRaster();
const cell = (t: PanelText, label: string): string | null => {
  for (const b of t.body) if (b.role === "grid" && b.cells) for (const [l, v] of b.cells) if (l === label) return v;
  return null;
};

describe("POLISH-6 P6-1: COPIES prints a whole count as it is and anything else to one decimal", () => {
  it("the format: 1 -> 1, 2 -> 2, 4 -> 4; 4/3 -> 1.3; 5/3 -> 1.7; 16/9 -> 1.8; 8/3 -> 2.7; 1.5 -> 1.5; 1.96 -> 2 and 2.04 -> 2 (never 2.0)", () => {
    for (const [n, want] of [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [4 / 3, "1.3"], [5 / 3, "1.7"], [16 / 9, "1.8"], [8 / 3, "2.7"], [1.5, "1.5"], [1.96, "2"], [2.04, "2"], [0.96, "1"]] as const)
      expect(copiesText(n), `${n}`).toBe(want);
  });
  it("a sweep of 0 to 6 in steps of 1/96: never `.0`, never a second decimal, within half a tenth of the value; a whole value prints as String(n)", () => {
    for (let i = 0; i <= 576; i++) {
      const n = i / 96, s = copiesText(n);
      expect(s, `${n}`).toMatch(/^\d+(\.\d)?$/);
      expect(s.endsWith(".0"), `${n} -> ${s}`).toBe(false);
      expect(Math.abs(Number(s) - n), `${n} -> ${s}`).toBeLessThanOrEqual(0.05 + 1e-9);
      if (Number.isInteger(n)) expect(s).toBe(String(n));
    }
  });
  it("the belt panel of every real belt (316: rival builds and stand-ins, days 5, 8, 12, 16): its COPIES cell is est.copies to one decimal; 38 of them carry a fraction (4/3 x36, 16/9 x2)", () => {
    const seen = new Map<string, number>();
    let belts = 0, fractions = 0;
    withEnchant(() => {
      for (const id of RIVAL_IDS) for (const make of [rivalBuild, standInBuild]) for (const day of [5, 8, 12, 16].filter((d) => rivalDays(id, 16).includes(d))) {
        const b = make(id as RivalId, day);
        b.routes.forEach((_, i) => {
          const t = routePanel(faceRun(b, day), i);
          if (!t) return;
          belts++;
          const c = cell(t, "COPIES"), est = walkRoute(b, i).estimate.copies;
          if (c === null) return;
          expect(c, `${id} ${day} belt ${i}: COPIES ${c} (est.copies ${est})`).toMatch(/^\d+(\.\d)?$/);
          expect(c.endsWith(".0")).toBe(false);
          expect(Math.abs(Number(c) - est)).toBeLessThanOrEqual(0.05 + 1e-9);
          if (!Number.isInteger(est)) { fractions++; seen.set(c, (seen.get(c) ?? 0) + 1); }
        });
      }
    });
    expect(belts).toBe(316);
    expect(fractions, "belts whose est.copies is not whole").toBe(38);
    expect([...seen.entries()].sort()).toEqual([["1.3", 36], ["1.8", 2]]);
  });
});
