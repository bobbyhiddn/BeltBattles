// SHAPES-1 (REQ-BFG-086.1, REQ-BFG-084, REQ-BFG-089, REQ-BFG-107; BRIEF-SHAPES1 S8, step 6): the shaped pieces' faces.
// - The three rigs render through the plain-rig face path (WHETSTONE's): a stat row, no HIT: line, their ★ numbers from
//   the sim; their own line UP TO 2 HITS / UP TO 6 HITS stays on the face.
// - GANTRY PRESS (2x3) keeps its face and adds FEEDS 4 BELTS IN TURN. (5, 6 at ★2, ★3) and BIGGER: +1 {BELT}.
// - The type line names the shape (COMMON RIG · 2 CELLS, ... FACTORY · 2X3); a 1-cell rig and a 2x2 keep theirs.
// - Default rules text (the rig sentence, the shape rule, the size rule) is NOTES only (behind the hover or tap).
// - The shape pictures fit the panel header's box and the card's corner.
// - SHAPES off: no face, line, note or type-line change; PLAIN_RIGS is the base's three.
// - REQ-BFG-107: no new player string says PLATE, PLATES, PLATED, PLATING or a plain SHIELD.
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { ITEMS } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { withShapes } from "../src/sim/shapes";
import { fmtCount, fmtDmg } from "../src/ui/statFormat";
import { statRow } from "../src/ui/icons";
import { icons, textWidth } from "../src/render/font";
import {
  PLAIN_RIGS, RIG_SENTENCE, SHAPE_RULE, SHAPED_PLAIN_RIGS, SIZE_RULE, hasFace, isPlainRig, plainRigStats, shapeLines,
  shapeMaxHits, shapeNotes, shapeWord,
} from "../src/ui/faces";
import { faceBlocks } from "../src/screens/build/faceBlocks";
import { describe as kindLine } from "../src/screens/build/shop";
import { cargoPanel, explainPanel, itemPanel } from "../src/screens/build/inspector";
import { shapePicSize } from "../src/ui/shapePic";

function furnace(items: Run["build"]["items"] = [], cargo: string[] = []): Run {
  const run = newRun("furnace", 5, "shapes1c");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = cargo.map((def, i) => ({ uid: 900 + i, def }));
  return run;
}
const texts = (bs: { text: string }[]) => bs.map((b) => b.text);

describe("SHAPES-1 S8: the three shaped plain stat rigs' faces (REQ-BFG-084, REQ-BFG-089)", () => {
  it("a stat row from the sim's numbers, no HIT: line, and UP TO N HITS (NAIL STRIP and EMBER TROUGH 2, SPIKE RAIL 6)", () => {
    withShapes(() => {
      const want: Record<string, ["DMG" | "BURN", string, number]> = { nailstrip: ["DMG", "+12/+25/+40", 2], embertrough: ["BURN", "+1/+2/+3", 2], spikerail: ["DMG", "+10/+20/+35", 6] };
      for (const def of SHAPED_PLAIN_RIGS) {
        expect(hasFace(def) && isPlainRig(def)).toBe(true);
        const [icon, ladder, hits] = want[def];
        const nums = [1, 2, 3].map((s) => {
          const g = effectAt(def, s).gate!;
          return icon === "BURN" ? `+${fmtCount(g.burn!)}` : `+${fmtDmg(g.flat!)}`;
        });
        expect(nums.join("/")).toBe(ladder);
        expect(shapeMaxHits(def)).toBe(hits);
        for (const s of [1, 2, 3]) {
          expect(plainRigStats(def, s)).toEqual([[icon, nums[s - 1]]]);
          const fb = faceBlocks(def, s, {})!;
          expect(texts(fb), `${def} ★${s}`).toEqual([statRow([[icon, nums[s - 1]]]), `UP TO ${hits} HITS`]);
          expect(fb.every((b) => b.keep)).toBe(true); // a piece's own lines are always visible (REQ-BFG-089)
          expect(fb.some((b) => b.text.includes("HIT:") || b.brass)).toBe(false);
        }
      }
    });
  });

  it("the type line names the shape; 1-cell rigs and 2x2 factories keep theirs", () => {
    withShapes(() => {
      expect(kindLine(ITEMS.nailstrip)).toBe("COMMON RIG · 2 CELLS");
      expect(kindLine(ITEMS.embertrough)).toBe("COMMON RIG · 2 CELLS");
      expect(kindLine(ITEMS.spikerail)).toBe("RARE RIG · 3 CELLS");
      expect(kindLine(ITEMS.gantry)).toBe(`${ITEMS.gantry.rarity.toUpperCase()} FACTORY · 2X3`);
      expect(kindLine(ITEMS.assembly)).toBe(`${ITEMS.assembly.rarity.toUpperCase()} FACTORY · 3 CELLS`);
      expect(kindLine(ITEMS.whetstone)).toBe("COMMON RIG");
      expect(kindLine(ITEMS.press)).toBe(`${ITEMS.press.rarity.toUpperCase()} FACTORY`);
    });
    expect(kindLine(ITEMS.gantry)).toBe(`${ITEMS.gantry.rarity.toUpperCase()} FACTORY`);
    expect(shapeWord("gantry")).toBeNull();
  });

  it("GANTRY PRESS (2x3): FEEDS 4/5/6 BELTS IN TURN. and BIGGER: +1 {BELT}, kept, after its face; ASSEMBLY LINE adds none", () => {
    withShapes(() => {
      for (const s of [1, 2, 3]) {
        const fb = faceBlocks("gantry", s, {})!;
        const at = texts(fb).indexOf(`FEEDS ${3 + s} BELTS IN TURN.`);
        expect(at, `★${s}`).toBeGreaterThanOrEqual(0);
        expect(fb[at + 1]).toMatchObject({ text: icons("BIGGER: +1 {BELT}"), brass: "BIGGER:", keep: true });
      }
      expect(shapeLines("assembly")).toEqual([]);
      expect(shapeLines("whetstone")).toEqual([]);
      expect(shapeLines("kiln")).toEqual([]);
    });
  });

  it("NOTES (behind the hover or tap) hold the rig sentence and the shape rule; the face keeps the piece's own lines", () => {
    withShapes(() => {
      const run = furnace([{ uid: 9, def: "gantry", x: 0, y: 7 }], ["nailstrip"]);
      const rig = explainPanel(cargoPanel(run, 900, true)!, "nailstrip");
      expect(texts(rig.notes ?? [])).toEqual(expect.arrayContaining([RIG_SENTENCE, SHAPE_RULE]));
      expect(texts(rig.body)).toContain("UP TO 2 HITS");
      expect(texts(rig.body).some((t) => t === RIG_SENTENCE || t === SHAPE_RULE)).toBe(false);
      const fac = explainPanel(itemPanel(run, 9, false)!, "gantry");
      expect(texts(fac.notes ?? [])).toContain(SIZE_RULE);
      expect(texts(fac.body)).toContain("FEEDS 4 BELTS IN TURN.");
      expect(texts(fac.body)).not.toContain(SIZE_RULE);
    });
  });

  it("the shape pictures fit the panel header's 14x14 inside and the card's corner", () => {
    withShapes(() => {
      expect(shapePicSize("nailstrip")).toEqual({ w: 8, h: 6 });
      expect(shapePicSize("spikerail")).toEqual({ w: 8, h: 12 });
      expect(shapePicSize("gantry")).toEqual({ w: 12, h: 8 });
      expect(shapePicSize("assembly")).toEqual({ w: 12, h: 4 });
      expect(shapePicSize("gantry", true)).toEqual({ w: 9, h: 6 });
      expect(shapePicSize("spikerail", true)).toEqual({ w: 3, h: 9 });
    });
  });

  it("fit: every new face line is one line of 5x7 in the op band (225 px); every new type line fits a 320x568 phone's sub line (113 px of 3x5)", () => {
    withShapes(() => {
      const face = ["nailstrip", "embertrough", "spikerail", "gantry"].flatMap((d) => [1, 2, 3].flatMap((s) => shapeLines(d, s).map((r) => r.text)));
      expect(face.length).toBe(3 * 3 + 2 * 3);
      for (const t of face) expect(textWidth(t, "5"), t).toBeLessThanOrEqual(225);
      for (const d of ["nailstrip", "embertrough", "spikerail", "gantry", "assembly"]) expect(textWidth(kindLine(ITEMS[d]), "3"), d).toBeLessThanOrEqual(113);
    });
  });

  it("REQ-BFG-107: no new player string says PLATE(S/D/ING) or a plain SHIELD", () => {
    withShapes(() => {
      const strings = [
        SHAPE_RULE, SIZE_RULE,
        ...["nailstrip", "embertrough", "spikerail", "gantry", "assembly"].flatMap((d) => [kindLine(ITEMS[d]), ...shapeLines(d).map((r) => r.text), ...shapeNotes(d)]),
      ];
      for (const s of strings) expect(/\bPLAT(E|ES|ED|ING)\b|\bSHIELD\b/.test(s), s).toBe(false);
    });
  });
});

describe("SHAPES-1 S1: with SHAPES off no face, line, note or type line moves", () => {
  it("the three have no face, PLAIN_RIGS is the base's, and every shape helper is empty", () => {
    expect([...PLAIN_RIGS]).toEqual(["whetstone", "temper", "barbed"]);
    for (const d of SHAPED_PLAIN_RIGS) {
      expect(ITEMS[d]).toBeUndefined();
      expect(hasFace(d)).toBe(false);
      expect(isPlainRig(d)).toBe(false);
      expect(plainRigStats(d)).toBeNull();
    }
    for (const d of Object.keys(ITEMS)) {
      expect(shapeLines(d)).toEqual([]);
      expect(shapeNotes(d)).toEqual([]);
      expect(shapeWord(d)).toBeNull();
    }
  });
});
