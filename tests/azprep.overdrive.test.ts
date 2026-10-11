// AZ-PREP (REQ-BFG-070; BRIEF-AZPREP 2 (g); REVIEW-HULL1B section 5), behind LADDER_FIX (turned on only through
// withLadderFix): OVERDRIVE ★2 and ★3 say what they keep of the ride their speed cuts (50% and 100%, ladderFix.ts
// RIDE_KEEP): the face's line, the LEVELS ladder, NEXT★, the sentences and the gist. ★1, and every star with the switch
// off, read as today.
import { describe, expect, it } from "vitest";
import { RIDE_KEEP, withLadderFix } from "../src/sim/ladderFix";
import { icons, textWidth } from "../src/render/font";
import { NEXT_LINE_W, faceAt, faceNext } from "../src/ui/faces";
import { abilityText, gist } from "../src/ui/abilityText";
import { levelLines, levelText } from "../src/screens/build/levels";

const read = (s: number) => ({
  face: faceAt("overdrive", s)!.rules.map((r) => r.text), next: faceNext("overdrive", s)?.text ?? null,
  text: abilityText("overdrive", s).sentences, gist: gist("overdrive", s), levels: (levelLines("overdrive", s) ?? []).map((l) => levelText(l)),
});

describe("AZ-PREP (g): OVERDRIVE's ★2/★3 ride-keep words, behind LADDER_FIX (REVIEW-HULL1B section 5)", () => {
  it("switch off: no ride words at any star (every word as today); on: ★1 as off, ★2 and ★3 say 50% and 100%", () => {
    // AZ-BUMP (the flip, LADDER_FIX): the off half sets the switch off itself (it read the default, now on); `again` reads
    // after withLadderFix has put it back off, and the default (the shipped value) reads as on
    const [off, on, again] = withLadderFix(() => [[1, 2, 3].map(read), withLadderFix(() => [1, 2, 3].map(read)), [1, 2, 3].map(read)], false);
    expect(again).toEqual(off); // the switch back off: the base def's words again
    expect([1, 2, 3].map(read)).toEqual(on); // AZ-BUMP (the flip, LADDER_FIX): the shipped value, on
    expect(JSON.stringify(off)).not.toMatch(/RIDE IT CUTS|KEEPS \d|OF THE RIDE/);
    expect(on[0].face).toEqual(off[0].face);
    expect(on[0].text).toEqual(off[0].text);
    expect(on[1].face).toEqual([...off[1].face, `KEEPS ${RIDE_KEEP[2] * 100}% OF THE RIDE IT CUTS.`]);
    expect(on[2].face).toEqual([...off[2].face, `KEEPS ${RIDE_KEEP[3] * 100}% OF THE RIDE IT CUTS.`]);
    expect(on[0].next).toBe("NEXT ★2: 4 TIMES, KEEPS 50% RIDE");
    expect(on[1].next).toBe("NEXT ★3: 5 TIMES, KEEPS 100% RIDE");
    expect(on[1].levels).toContain("KEEPS -/[50%]/100% RIDE");
    expect(on[1].text[1]).toBe("A PAYLOAD KEEPS 50% OF THE RIDE THAT SPEED CUTS, FOR ITS RIDE BONUSES (HEAT, LONG RIDES).");
    expect(on[2].gist).toBe(`${off[2].gist}, KEEPS 100% OF THE RIDE`);
    // every face line and NEXT★ line inside the op band
    for (const r of on) for (const line of [...r.face, ...(r.next ? [r.next] : [])]) expect(textWidth(icons(line)), line).toBeLessThanOrEqual(NEXT_LINE_W);
  });
});
