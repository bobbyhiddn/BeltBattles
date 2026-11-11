// POLISH-7 (REQ-BFG-087; P7-1, REVIEW-POLISH6 V3 / RULING-REVIEW-POLISH6 V3, filed OPEN P6-V3: "a test-only pin in POLISH-7"): BAND-300x640's BATTLE FACES WITH A GAP UNDER MIN, PINNED BESIDE 360x640's.
//   Since POLISH-6 P6-1 (COPIES prints 1.3, not 1.3333333333333333, so a belt's readout grid rows are one line, not two) four EMBERLYN belt faces at band-300x640 (the rival and the stand-in build, days 12 and 16, belt route 0) fit the 5x7 plan
//   where they were 3x5, and the 5x7 plan leaves a 1 px gap (min 3) where the 3x5 plan had 4: the faces under min went 42 -> 46, your own and the foe's alike, corpus A (RV5/logs/c10-sigaudit.txt :16 and :33; c6-changed-own.txt :331, :333, :337, :339).
//   RULING-REVIEW-POLISH6 V3 accepted it under RULING-POLISH6 R2's 360x640 28 -> 32, the same mechanism (content first, SPACE-1 D3: the 5x7 face, which the one-line readout lets fit, takes a gap's room). Nothing pinned band-300x640, because
//   tests/polish3b.ownfaces.test.ts (UNDER) and tests/polish3b.sparkfang.test.ts (UNDER) run the six views of tests/polish3b.helpers VIEW_NAMES only. This file pins it per side and corpus, and names the four.
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { facePlan } from "../src/screens/battleScout";
import { gapsAtLeast, planPanel, type PanelPlan } from "../src/screens/build/inspector";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { faces, type Face } from "./polish3b.helpers";
import { viewAt } from "./polish4.helpers";

installRaster();
afterEach(() => setEnchant(ENCHANT));

const VIEW = "band-300x640" as const;
/** The four faces POLISH-6 P6-1 moved under min at band-300x640 (tags as tests/polish3b.helpers makes them; corpus A is every rival build read as your own parts, or as the foe's with `faces(true)`). */
const FOUR = ["A emberlyn rivalBuild d12 route0", "A emberlyn rivalBuild d16 route0", "A emberlyn standInBuild d12 route0", "A emberlyn standInBuild d16 route0"];
/** Faces with a gap under min (gaps.px < gaps.min) at band-300x640, per side and corpus: now, and at polish5-accepted (`was`: before P6-1). Corpus B (every shop piece x star x word) has none either way.
 *  POLISH-8 R1 (REVIEW-POLISH7 V5; tests only): **THE 46 IS THE CORPUS'S MEASURE, NOT A COUNT OF FACES THE GAME DRAWS.** tests/polish3b.helpers.ts faces() gives EVERY part the THIS FIGHT line (its LINE), a belt's and a rig's too; the game draws that
 *  line on a turret only (src/screens/battleScout.ts fightLine, :115-120: null for any other part), so a belt's or a rig's real face is a line shorter. The game's own count, by this file's formula (!gapsAtLeast), corpus A at band-300x640, own and foe
 *  alike (O/kit/p8-snip-band300.test.ts, bb-0.15.0): **30** faces under min (26 turrets + 4 belts: BRASSWICK's stand-in route 0 at d8, d12 and d16, VOSS's stand-in route 0 at d8), against the corpus's 46 (26 turrets + 20 belts). The four EMBERLYN
 *  route-0 belt faces this file names are under min in the corpus's way only: in the game's way 0 of the 4 are. What the pin guards is the planner's behaviour on the corpus (P6-1's one-line readout moved them 42 -> 46 there, RULING-REVIEW-POLISH6 V3); read it so, not as a count of real faces. */
const UNDER = {
  own: { A: 46, B: 0, was: { A: 42, B: 0 } },
  foe: { A: 46, B: 0, was: { A: 42, B: 0 } },
} as const;

const drawn = (f: Face, side: 0 | 1): PanelPlan => { const { fa, tp } = viewAt(VIEW, side); return withEnchant(() => facePlan(f.t, fa, f.fam, tp)); };

for (const side of ["own", "foe"] as const) {
  describe(`POLISH-7 P7-1: ${VIEW} ${side}: battle faces under min`, () => {
    const s = side === "own" ? 0 : 1;
    const under = (): Record<"A" | "B", string[]> => {
      const out: Record<"A" | "B", string[]> = { A: [], B: [] };
      for (const f of faces(side === "foe")) {
        const p = drawn(f, s);
        if (!gapsAtLeast(p, p.gaps.min)) out[f.corpus].push(f.tag);
      }
      return out;
    };

    it(`corpus A ${UNDER[side].was.A} -> ${UNDER[side].A}, corpus B ${UNDER[side].was.B} -> ${UNDER[side].B}: the four EMBERLYN route-0 belt faces (rival and stand-in builds, d12 and d16) are the faces that went under min`, () => {
      const u = under();
      expect(u.A.length, `${VIEW} ${side} corpus A under min`).toBe(UNDER[side].A);
      expect(u.B.length, `${VIEW} ${side} corpus B under min`).toBe(UNDER[side].B);
      for (const tag of FOUR) expect(u.A, `${side}: ${tag} is under min`).toContain(tag);
      expect(u.A.filter((t) => !FOUR.includes(t)).length, `${side}: the faces under min besides the four = polish5-accepted's count`).toBe(UNDER[side].was.A);
    });

    it("each of the four draws the 5x7 plan at a 1 px gap (min 3), where the 3x5 plan has 4 px: the one-line readout lets the bigger face fit, and content first lets it take the gap's room (RULING-REVIEW-POLISH6 V3)", () => {
      const four = faces(side === "foe").filter((f) => FOUR.includes(f.tag));
      expect(four.map((f) => f.tag).sort(), "all four faces exist").toEqual([...FOUR].sort());
      for (const f of four) {
        const p = drawn(f, s), { fa, tp } = viewAt(VIEW, s);
        const sm = withEnchant(() => planPanel(f.t, fa.area, f.fam, { tap: tp, band: fa.band, small: true, wrap: true }));
        expect(p.column, `${f.tag}: a band, not a column`).toBe(false);
        expect(p.body.font, `${f.tag}: the 5x7 face`).toBe("5");
        expect(p.gaps.min, `${f.tag}: the 5x7 face's minimum gap`).toBe(3);
        expect(p.gaps.px, `${f.tag}: the gap it leaves`).toBe(1);
        expect(sm.body.font, `${f.tag}: the 3x5 plan`).toBe("3");
        expect(sm.gaps.px, `${f.tag}: the gap the 3x5 plan leaves`).toBe(4);
        expect(gapsAtLeast(sm, sm.gaps.min), `${f.tag}: the 3x5 plan is clear of its min`).toBe(true);
      }
    });
  });
}
