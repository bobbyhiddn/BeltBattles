// PRESENT-1 S2 (REQ-BFG-081; REVIEW-READ14's fix list): the words READ-14's readers still asked about.
// Fix 2, GRAPNEL GUN: the ⓘ LEVELS ladder and the SHOT note say DESTROYS, the face's verb, where they said RIPS (FATE-ASK 3 of 12:
// each reader listed RIPS from the ladder or the note and read it as destroys). battle.ts rip() splices the slugs off the hit side's
// belt and gives the shooter nothing: they are destroyed.
import { describe, expect, it } from "vitest";
import { GLOSSARY_WRAP_W, glossaryText } from "../src/ui/glossary";
import { levelLines, levelText } from "../src/screens/build/levels";
import { icons } from "../src/render/font";
import { colourize, lineWidth, wrapRich } from "../src/ui/richText";

describe("PRESENT-1 S2: GRAPNEL GUN says DESTROYS on its ⓘ pages", () => {
  it("the ⓘ LEVELS ladder and NEXT★: DESTROYS n (was RIPS n)", () => {
    expect(levelLines("grapnel", 1)!.map((l) => levelText(l))).toEqual(["DESTROYS [1]/2/3", "NEXT ★2: DESTROYS 2"]);
    expect(levelLines("grapnel", 3)!.map((l) => levelText(l))).toEqual(["DESTROYS 1/2/[3]"]);
    for (const s of [1, 2, 3]) for (const l of levelLines("grapnel", s)!) expect(levelText(l)).not.toMatch(/RIP/);
  });

  it("the SHOT note: IT DESTROYS THE NEAREST SLUGS WITHIN n TILES OF A HIT (was IT RIPS ...), two rows of the 225 px band at every star", () => {
    const want = ["SHOT: IT DESTROYS THE NEAREST SLUGS WITHIN 1 TILE OF A HIT.", "SHOT: IT DESTROYS THE NEAREST SLUGS WITHIN 2 TILES OF A HIT.", "SHOT: IT DESTROYS THE NEAREST SLUGS WITHIN 3 TILES OF A HIT."];
    const log: string[] = [];
    for (const s of [1, 2, 3]) {
      const t = glossaryText("SHOT", { def: "grapnel", stars: s });
      expect(t).toBe(want[s - 1]);
      for (const [v, w] of [["phone", GLOSSARY_WRAP_W], ["desk", 118]] as const) {
        const rows = wrapRich(colourize(icons(t), "#FFFFFF"), w, "5"), old = wrapRich(colourize(icons(t.replace("DESTROYS", "RIPS")), "#FFFFFF"), w, "5");
        for (const r of rows) expect(lineWidth(r, "5"), `${v} ★${s}`).toBeLessThanOrEqual(w);
        log.push(`★${s} ${v} (${w} px): ${rows.length} rows ${rows.map((r) => lineWidth(r, "5")).join("+")} px (RIPS: ${old.length} rows ${old.map((r) => lineWidth(r, "5")).join("+")})`);
        if (v === "phone") expect(rows.length).toBe(old.length); // no row added on the phone
      }
    }
    console.log(`PRESENT1-WORDS-GRAPNEL\n${log.join("\n")}`);
  });
});
