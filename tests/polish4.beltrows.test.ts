// POLISH-4 (REQ-BFG-089; P4-4, cap's ruling 3: 4a yes, 4b no): A BATTLE FACE'S BELT GIVES AWAY FEWER HIT ROWS.
//   A belt's hit rows are the belt's own text. In the column (the desk, the laptop, a landscape phone) the 5x7 plan gives whole trailing rows away (`+N MORE HIT TILES (NUMBERED ON THE DECK)`) on 84 of the foe's 316 real belts at 1920x1080
//   (519 rows; mean 6.2 a belt), 63 at 1366x768 and 844x390 (389 rows), 4 at 1280x800, 131 at 851x393@2.75 (699). A face tall enough for every row does not exist: +44 px at the median and +149 at most at 1920x1080, where the face is 198 of 216 px.
//   Now battleScout.ts facePlanWith: where the 5x7 plan is the rule text whole but gives hit rows away, the 3x5 plan is the face if it gives away FEWER (hitRowsGone): 519 -> 290 rows at 1920x1080, 389 -> 203 at 1366x768 and 844x390,
//   30 -> 14 at 1280x800, 699 -> 551 at 851x393@2.75. No belt becomes whole by it (the same belts still give rows away); the smaller type is the cost. The build screen's belt panel (inspector.ts planRung) is untouched (cap's ruling 3: NO to 4b).
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { facePlan, hitRowsGone } from "../src/screens/battleScout";
import { rulesWhole, visibleLines, type PanelPlan } from "../src/screens/build/inspector";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { faces } from "./polish3b.helpers";
import { VIEW13_NAMES, p3bFacePlan, viewAt, type View13 } from "./polish4.helpers";

installRaster();
afterEach(() => setEnchant(ENCHANT));

/** Per view [own, foe]: the real builds' belts (corpus A: 316 a view) that give hit rows away [belts, rows lost] before -> after, and the belt faces that take the 3x5 plan. The scout's table (POLISH-4 SCOUT section 5). */
const BELTS: Record<View13, { own: [number, number, number, number, number]; foe: [number, number, number, number, number] }> = {
  // [belts giving rows away before, rows lost before, belts giving rows away after, rows lost after, belt faces that changed]
  // POLISH-6 (P6-1, REQ-BFG-089): COPIES prints 1.3 where it printed 1.3333333333333333 (the readout's grid rows are one line, not two), so seven views have room for rows the table below lost:
  // 1366x768 and 844x390 [63,389,63,203,61] -> [55,357,55,167,53] (both sides); 1280x800 [4,30,4,14,4] -> [4,30,4,8,4]; 812x375@3 own [75,387,75,268,26] -> [71,355,71,236,26], foe [83,430,83,310,28] -> [81,404,81,284,28];
  // 851x393@2.75 own [120,626,120,465,52] -> [120,600,120,439,52], foe [131,699,131,551,58] -> [131,677,131,529,58]; 915x412@2.625 [93,494,93,372,35] -> [93,472,93,350,35];
  // 926x428@3 own [100,513,100,370,39] -> [98,489,98,346,39], foe [108,581,108,434,46] -> [108,555,108,408,46]. 1920x1080, 402x690, 360x640, 3040x1710 and the bands do not move.
  // BUMP-1H (RULING-BUMP1H-R6 R6.4, the merge with 0.9.15.1): ten views move, all by H3 (src/sim/rivalBuilds.ts drops MOTH QUEEN's good-luck HEATJACKET and SILKSHADE's good-luck COUNTERWEIGHT from their warlord road decks; H2 does not move this file).
  // Was (own / foe): 1920x1080 [77,492,77,261,69] / [84,519,84,290,75]; 1366x768 and 844x390 [55,357,55,167,53] (both sides); 402x690 [134,479,134,479,0]; 3040x1710 [91,558,91,320,82] / [91,564,91,320,82];
  // 812x375@3 [71,355,71,236,26] / [81,404,81,284,28]; 851x393@2.75 [120,600,120,439,52] / [131,677,131,529,58]; 915x412@2.625 [93,472,93,350,35] (both); 926x428@3 [98,489,98,346,39] / [108,555,108,408,46]; band 280x653 [241,1067,241,1067,0] / [253,1094,253,1094,0].
  // 1280x800, 360x640 and band 300x640 do not move. With rivalBuilds.ts put back to bump1h-base this file passes at 0.9.15.1's table (kit-1h/revert6m.sh: 14 of 14).
  "desk-1920x1080": { own: [76, 486, 76, 258, 68], foe: [83, 513, 83, 286, 74] },
  "laptop-1366x768": { own: [55, 353, 55, 165, 53], foe: [55, 353, 55, 165, 53] },
  "desk-1280x800": { own: [4, 30, 4, 8, 4], foe: [4, 30, 4, 8, 4] },
  "land-844x390": { own: [55, 353, 55, 165, 53], foe: [55, 353, 55, 165, 53] },
  "op-402x690": { own: [133, 477, 133, 477, 0], foe: [133, 477, 133, 477, 0] },
  "phone-360x640": { own: [0, 0, 0, 0, 0], foe: [0, 0, 0, 0, 0] },
  "col96-3040x1710": { own: [90, 552, 90, 318, 81], foe: [90, 558, 90, 318, 81] },
  "land-812x375@3": { own: [71, 353, 71, 234, 26], foe: [80, 400, 80, 280, 28] },
  "pixel5-851x393@2.75": { own: [119, 598, 119, 437, 52], foe: [131, 674, 131, 526, 58] },
  "land-915x412@2.625": { own: [92, 468, 92, 346, 35], foe: [92, 468, 92, 346, 35] },
  "promax-926x428@3": { own: [97, 486, 97, 343, 39], foe: [107, 553, 107, 406, 46] },
  "band-280x653": { own: [241, 1060, 241, 1060, 0], foe: [253, 1087, 253, 1087, 0] }, // a band is not a column: nothing changes; this count takes every dropped row, the body's whole (the scout's +N MORE count: 171 / 742 and 179 / 753)
  "band-300x640": { own: [0, 0, 0, 0, 0], foe: [0, 0, 0, 0, 0] },
};

const drawnKeys = (p: PanelPlan): Map<string, { role: string; trim: boolean; hold: boolean; note: boolean }> => {
  const drawn = new Set(visibleLines(p).map((v) => v.line));
  return new Map(p.body.shown.filter((l) => l.lines.length > 0 && l.lines.every((ln) => drawn.has(ln))).map((l) => [`${l.b.role}|${l.b.text}|${l.b.label ?? ""}`, { role: l.b.role, trim: !!l.b.trim, hold: !!l.b.hold, note: l.b.note !== undefined }] as const));
};

describe("POLISH-4 P4-4: a battle face's belt takes the 3x5 plan where it gives away fewer hit rows", () => {
  for (const name of VIEW13_NAMES) {
    it(`${name}: belts that give rows away [before, rows, after, rows, faces changed] own ${JSON.stringify(BELTS[name].own)}, foe ${JSON.stringify(BELTS[name].foe)}; a belt face differs from POLISH-3b's only by taking the 3x5 plan with fewer rows given away; no other face moves`, () => {
      const got: Record<"own" | "foe", number[]> = { own: [], foe: [] };
      for (const foe of [false, true]) {
        const { fa, tp } = viewAt(name, foe ? 1 : 0);
        let b0 = 0, r0 = 0, b1 = 0, r1 = 0, changed = 0;
        for (const f of faces(foe).filter((x) => x.corpus === "A")) {
          const [plan, ref] = withEnchant(() => [facePlan(f.t, fa, f.fam, tp), p3bFacePlan(f.t, fa, f.fam, tp)] as [PanelPlan, PanelPlan]);
          const was = hitRowsGone(ref), now = hitRowsGone(plan);
          if (f.kind === "route") {
            if (was) { b0++; r0 += was; }
            if (now) { b1++; r1 += now; }
            if (JSON.stringify(plan) !== JSON.stringify(ref)) {
              changed++;
              expect(plan.column, `${name} ${f.tag}: only a column`).toBe(true);
              expect(plan.body.font, `${name} ${f.tag}: the 3x5 face`).toBe("3");
              expect(now, `${name} ${f.tag}: fewer hit rows given away`).toBeLessThan(was);
              expect(rulesWhole(ref) && rulesWhole(plan) && !plan.bare, `${name} ${f.tag}: the rule text whole either way, no CLOSE row dropped`).toBe(true);
              // REQ-BFG-089: what the 3x5 plan draws that the 5x7 plan did not is the belt's own: its hit rows, the re-counted `+N MORE HIT TILES`, the NOT COUNTED guest line (POLISH-2's) -- never a default-text block (note kind / rig), flavour, hint, reminder or caveat
              const had = drawnKeys(ref);
              for (const [k, b] of drawnKeys(plan)) if (!had.has(k)) {
                expect(b.trim || b.hold || /MORE HIT TILE/.test(k) || b.role === "row" || b.role === "ability", `${name} ${f.tag}: new block ${k}`).toBe(true);
                expect(b.note, `${name} ${f.tag}: ${k} carries no note kind`).toBe(false);
                expect(["flavour", "hint", "reminder", "caveat"].includes(b.role), `${name} ${f.tag}: ${k}`).toBe(false);
              }
            }
          } else {
            expect(JSON.stringify(plan), `${name} ${f.tag}: a face that is not a belt is the plan it was (or P4-3's bare plan)`).toBe(plan.bare ? JSON.stringify(plan) : JSON.stringify(ref));
          }
        }
        got[foe ? "foe" : "own"] = [b0, r0, b1, r1, changed];
      }
      expect(got).toEqual(BELTS[name]);
    });
  }

  it("a belt that gives rows away is not made whole by it (cap's ruling 3: ROWS-1's give-way rule stays for the rest, and the build screen's belt panel is untouched): the same belts still give rows away", () => {
    for (const name of ["desk-1920x1080", "laptop-1366x768", "land-844x390", "pixel5-851x393@2.75"] as View13[]) {
      const { fa, tp } = viewAt(name, 1);
      let still = 0, fewer = 0;
      for (const f of faces(true).filter((x) => x.corpus === "A" && x.kind === "route")) {
        const plan = withEnchant(() => facePlan(f.t, fa, f.fam, tp)), ref = withEnchant(() => p3bFacePlan(f.t, fa, f.fam, tp));
        if (hitRowsGone(ref) === 0) { expect(hitRowsGone(plan), `${name} ${f.tag}: a belt that gave nothing away still gives nothing away`).toBe(0); continue; }
        if (hitRowsGone(plan)) still++;
        if (hitRowsGone(plan) < hitRowsGone(ref)) fewer++;
      }
      expect(still, `${name}: belts that still give hit rows away`).toBeGreaterThan(50);
      expect(fewer, `${name}: belts that give fewer`).toBeGreaterThan(50);
    }
  });
});
