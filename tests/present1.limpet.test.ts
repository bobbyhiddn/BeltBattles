// PRESENT-1 S2 (REQ-BFG-081; REVIEW-READ14 fix 3, WHICH-HIT 7 of 12): LIMPET WORKS's ⓘ NOTES carry one line for what ANYTHING covers and where
// the blast stops: every landed shot of its slug sets the charge off whatever it hit (a part, a rig, a belt tile, the hull; battle.ts
// roundImpact, a hit the foe's WARD blocks too), and the foe's SHIELD soaks the blast (hullEffects). The line is a NOTE (behind the tap), never on
// the face; no other piece has one.
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { icons } from "../src/render/font";
import { faceLines, ruleNotes } from "../src/ui/faces";
import { explainPanel, type PanelText } from "../src/screens/build/inspector";

const LINE = "ANYTHING: A PART, A RIG, A BELT TILE OR THE HULL. A HIT THE FOE'S {*SHIELD} BLOCKS STILL COUNTS. THE FOE'S {*PLATE} SOAKS THE BLAST.";
const bare = { title: "", color: "", sub: "", body: [], labels: [] } as unknown as PanelText;

describe("PRESENT-1 S2 fix 3: LIMPET WORKS's ANYTHING note", () => {
  it("ruleNotes: the one line for limpet (glyphs and markup), [] for every other piece", () => {
    expect(ruleNotes("limpet", true)).toEqual([LINE]);
    expect(ruleNotes("limpet")).toEqual([icons(LINE)]);
    for (const id of Object.keys(ITEMS)) if (id !== "limpet") expect(ruleNotes(id), id).toEqual([]);
    expect(ruleNotes("nonesuch")).toEqual([]);
  });

  it("explainPanel puts it among the panel's NOTES (the ⓘ view) and the face keeps its sentence unchanged", () => {
    const t = explainPanel(bare, "limpet");
    expect(t.notes.map((b) => b.text)).toContain(icons(LINE));
    const k = explainPanel(bare, "kiln");
    expect(k.notes.map((b) => b.text)).not.toContain(icons(LINE));
    // the face's own line is not touched: it still says ANYTHING (the note explains it)
    const face = faceLines("limpet", 1, {})!;
    expect(face.rules.map((r) => r.text).join(" ")).toMatch(/AFTER ITS SLUG HITS ANYTHING\.$/);
    expect(face.rules.map((r) => r.text).join(" ")).not.toMatch(/WARD|SHIELD/);
  });
});
