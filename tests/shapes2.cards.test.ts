// SHAPES-2 (REQ-BFG-114, REQ-BFG-084, REQ-BFG-089, REQ-BFG-087, REQ-BFG-107; BRIEF-SHAPES2 S5, step 4): the six more shaped plain
// rigs' faces, through the plain-rig face path (faces.ts plainRigStats through rigStats, isPlainRig; EXPLAIN-1's NOTES), as NAIL
// STRIP renders: a stat row and no HIT: line, no ability line; their own line UP TO n HITS; the type line COMMON RIG · 3 CELLS;
// the default rules text (the rig sentence and the shape rule) behind the hover or tap; the shape picture in the panel header's
// box (PICKAXE's seven arrows at 3 px a cell, so it fits); every line fits the sizes the base's checks use; with SHAPES2 off
// nothing changes (no face, line, note or type-line change; SHAPES-1's own SHAPE_RULE stands).
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { ITEMS } from "../src/sim/content";
import { SHAPES2, SHAPES2_IDS, setShapes2, withShapes2 } from "../src/sim/shapes2";
import { withPlainRigs } from "../src/sim/plainRigs";
import { ICON, ICON_BASE, icons, textWidth } from "../src/render/font";
import {
  CARRY_LINE, NEXT_LINE_W, REMINDER, RIG_SENTENCE, SHAPE_RULE, SHAPE_RULE_ANY, cardEffect, faceAt, faceLines, faceNext, hasFace, isPlainRig, plainNotes,
  plainRigStats, rigStats, shapeLines, shapeMaxHits, shapeNotes, shapeWord,
} from "../src/ui/faces";
import { shopChipGlyphs } from "../src/ui/chips";
import { statRow } from "../src/ui/icons";
import { CARD_MARK_X, cardPriceX, describe as kindLine } from "../src/screens/build/shop";
import { CARD_W } from "../src/screens/build/layout";
import { levelLines, levelText } from "../src/screens/build/levels";
import { faceBlocks } from "../src/screens/build/faceBlocks";
import { cargoPanel, explainPanel, itemPanel } from "../src/screens/build/inspector";
import { shapePic, shapePicSize } from "../src/ui/shapePic";
import { familiesOf } from "../src/ui/families";
import { lineText } from "../src/ui/richText";
import { partInfo } from "../src/screens/lastChancePicker";
import { rigSentenceRig } from "../src/screens/build/keywords";

installRaster(); // the shape picture draws into a canvas
afterEach(() => setShapes2(SHAPES2));
const NAME_OF = new Map<string, string>(Object.entries(ICON).map(([k, v]) => [v as string, k]));
/** Glyphs as the text sheet prints them: each private-use icon as [NAME]. */
const plain = (s: string): string => [...s].map((ch) => (ch.charCodeAt(0) >= ICON_BASE && NAME_OF.has(ch) ? `[${NAME_OF.get(ch)}]` : ch)).join("");
const texts = (bs: { text: string }[]) => bs.map((b) => b.text);
const on = <T>(fn: () => T): T => withPlainRigs(() => withShapes2(fn)); // 1D ships both

function furnace(items: Run["build"]["items"] = [], cargo: string[] = []): Run {
  const run = newRun("furnace", 5, "shapes2c");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = cargo.map((def, i) => ({ uid: 900 + i, def }));
  return run;
}

const WANT: Record<string, { rows: string[]; hits: number; kind: string }> = {
  elbowguard: { rows: ["[PLATE]+8", "[PLATE]+16", "[PLATE]+28"], hits: 2, kind: "COMMON RIG · 3 CELLS" }, // step 6: SHIELD 8/16/28 (was 2/4/7)
  sawbar: { rows: ["[DMG]+9", "[DMG]+18", "[DMG]+31"], hits: 3, kind: "COMMON RIG · 3 CELLS" }, // run 2 (S6c, S6b): 8/16/28 was the brief's starting value
  sparkcomb: { rows: ["[STUN]+1", "[STUN]+2", "[STUN]+3"], hits: 2, kind: "COMMON RIG · 2 CELLS" },
  cinderhook: { rows: ["[DMG]+10", "[DMG]+20 [BURN]+1", "[DMG]+35 [BURN]+2"], hits: 4, kind: "RARE RIG · 3 CELLS" }, // run 2 (S6b): the BURN from ★2 (BRANDING IRON's form); [BURN]+1/+2/+3 was the brief's
  jawcrusher: { rows: ["[DMG]+20", "[DMG]+42", "[DMG]+70"], hits: 4, kind: "RARE RIG · 2X2" }, // run 2 (S6c): 12/25/42 was the brief's
  pickaxe: { rows: ["[DMG]+15", "[DMG]+30", "[DMG]+51"], hits: 7, kind: "EPIC RIG · 4 CELLS" }, // run 2 (S6c, S6b): 14/28/48 was the brief's
};

describe("SHAPES-2 S5: the six faces", () => {
  it("off, none has a face, a line, a note or a type line; on, each draws its stat row as the table reads it and no ability line", () => {
    for (const id of SHAPES2_IDS) {
      expect(hasFace(id), id).toBe(false);
      expect(isPlainRig(id), id).toBe(false);
      expect(shapeLines(id), id).toEqual([]);
      expect(shapeNotes(id), id).toEqual([]);
      expect(shapeWord(id), id).toBeNull();
      expect(plainNotes(id), id).toEqual([]);
      expect(faceAt(id, 1), id).toBeNull();
    }
    on(() => {
      for (const id of SHAPES2_IDS) {
        expect(hasFace(id) && isPlainRig(id), id).toBe(true);
        const rows = [1, 2, 3].map((s) => {
          const fl = faceLines(id, s)!;
          expect(fl.rules, `${id} ★${s}: no ability line`).toEqual([]);
          expect(plainRigStats(id, s), id).toEqual(rigStats(id, s));
          return plain(fl.stats!);
        });
        expect(rows, id).toEqual(WANT[id].rows);
        expect(familiesOf(id).length, `${id}: a family or two (a shop hint)`).toBeGreaterThan(0);
      }
    });
  });

  it("the panel face: the stat row and UP TO n HITS (kept), no HIT: line, no brass label; the type line names the shape", () => {
    on(() => {
      for (const id of SHAPES2_IDS) {
        expect(shapeMaxHits(id), id).toBe(WANT[id].hits);
        for (const s of [1, 2, 3]) {
          const fb = faceBlocks(id, s, {})!;
          expect(texts(fb), `${id} ★${s}`).toEqual([statRow(plainRigStats(id, s)!), `UP TO ${WANT[id].hits} HITS`]);
          expect(fb.every((b) => b.keep), `${id}: a piece's own lines are always visible (REQ-BFG-089)`).toBe(true);
          expect(fb.some((b) => b.text.includes("HIT:") || b.brass)).toBe(false);
        }
        expect(kindLine(ITEMS[id]), id).toBe(WANT[id].kind);
      }
    });
  });

  it("NOTES (behind the hover or tap) hold the rig sentence and the shape rule; ELBOW GUARD's carry line too; the face keeps the piece's own lines", () => {
    on(() => {
      const run = furnace([], [...SHAPES2_IDS]);
      SHAPES2_IDS.forEach((id, i) => {
        const panel = explainPanel(cargoPanel(run, 900 + i, true)!, id);
        const notes = texts(panel.notes ?? []);
        expect(notes, id).toEqual(expect.arrayContaining([RIG_SENTENCE, SHAPE_RULE_ANY]));
        expect(notes, `${id}: SHAPES-1's LONG wording is not the one with SHAPES2 on`).not.toContain(SHAPE_RULE);
        expect(notes.includes(CARRY_LINE), `${id} carries SHIELD to the gun`).toBe(id === "elbowguard");
        expect(texts(panel.body), id).toContain(`UP TO ${WANT[id].hits} HITS`);
        expect(texts(panel.body).some((t) => t === RIG_SENTENCE || t === SHAPE_RULE_ANY || t === CARRY_LINE), `${id}: default rules text stays behind the ⓘ`).toBe(false);
        expect(plainNotes(id)).toEqual(id === "elbowguard" ? [RIG_SENTENCE, CARRY_LINE] : [RIG_SENTENCE]);
        expect(rigSentenceRig({ def: id, stars: 1, o: {} }), `${id}: HIT leads its KEYWORDS`).toBe(true);
        // LAST CHANCE's PART card (the free part's info box) leads with the rig sentence too, then ELBOW GUARD's carry line
        const info = partInfo(id, 290, furnace()).map((lines) => lines.map(lineText).join(" "));
        expect(info[0], id).toBe(RIG_SENTENCE);
        expect(info.some((t) => t.includes("TO YOUR GUN. YOUR SHIP GAINS IT AS THE SLUG LOADS.")), id).toBe(id === "elbowguard"); // CARRY_LINE ({*PLATE} drawn as its icon and SHIELD)
      });
      // a placed one: its panel keeps the same NOTES, and one hit line per hit
      const placed = furnace([{ uid: 9, def: "pickaxe", x: 4, y: 2 }]);
      const ip = explainPanel(itemPanel(placed, 9, false)!, "pickaxe");
      expect(texts(ip.notes ?? [])).toEqual(expect.arrayContaining([RIG_SENTENCE, SHAPE_RULE_ANY]));
    });
  });

  it("with SHAPES2 on every shaped rig reads one rule (SHAPE_RULE_ANY); with it off SHAPES-1's SHAPE_RULE stands, byte for byte", () => {
    expect(shapeNotes("nailstrip")).toEqual([SHAPE_RULE]);
    expect(SHAPE_RULE).toBe("A LONG RIG'S ARROWS SHINE FROM EVERY OUTSIDE EDGE OF ITS CELLS.");
    on(() => {
      expect(shapeNotes("nailstrip")).toEqual([SHAPE_RULE_ANY]);
      expect(shapeNotes("spikerail")).toEqual([SHAPE_RULE_ANY]);
      for (const id of SHAPES2_IDS) expect(shapeNotes(id)).toEqual([SHAPE_RULE_ANY]);
      expect(shapeNotes("gantry")).not.toContain(SHAPE_RULE_ANY); // a factory has the size rule
      expect(SHAPE_RULE_ANY).toBe("A SHAPED RIG'S ARROWS SHINE FROM EVERY OUTSIDE EDGE OF ITS CELLS.");
    });
  });
});

describe("SHAPES-2 S5: fit, spacing and words", () => {
  it("every line of the six fits: the chip beside the price, the stat row, NEXT★ and the ⓘ ladder in the 225 px band, the type line on a 320 px phone", () => {
    on(() => {
      const widest: string[] = [];
      for (const id of SHAPES2_IDS) {
        const chip = shopChipGlyphs(id, { hero: "furnace" })!;
        expect(chip, id).toBeTruthy();
        const cw = textWidth(chip, "3");
        for (const price of [ITEMS[id].price, Math.max(0, ITEMS[id].price - 2)]) {
          expect(CARD_MARK_X + cw + 2, `${id} chip ${cw} px`).toBeLessThanOrEqual(cardPriceX(0, CARD_W, price, false, true));
        }
        for (let s = 1; s <= 3; s++) {
          const fl = faceLines(id, s)!;
          expect(textWidth(fl.stats!, "5"), `${id} ★${s} stats`).toBeLessThanOrEqual(NEXT_LINE_W);
          const nx = s < 3 ? faceNext(id, s) : null;
          if (nx) expect(textWidth(nx.text, "5"), `${id} ★${s} NEXT`).toBeLessThanOrEqual(NEXT_LINE_W);
          for (const l of levelLines(id, s) ?? []) expect(textWidth(levelText(l), "5"), `${id} ★${s} ladder`).toBeLessThanOrEqual(NEXT_LINE_W);
          for (const r of shapeLines(id, s)) expect(textWidth(r.text, "5"), `${id} ${r.text}`).toBeLessThanOrEqual(NEXT_LINE_W);
          widest.push(`${id}★${s} ${textWidth(fl.stats!, "5")}`);
        }
        expect(textWidth(kindLine(ITEMS[id]), "3"), `${id} type line`).toBeLessThanOrEqual(113);
        expect(faceAt(id, 1)!.stats.length).toBeLessThanOrEqual(3);
        // the desk's wide card draws the stat row as its effect (PLAIN-1F M3, F5): no kept text
        expect(cardEffect(id)).toBe(statRow(plainRigStats(id, 1)!));
      }
      console.log(`SHAPES2 stat rows (5x7 px): ${widest.join(", ")}`);
    });
  });

  it("REQ-BFG-107: no new player string says PLATE(S/D/ING) or a plain SHIELD (the tokens {*PLATE} and {*SHIELD} draw them)", () => {
    on(() => {
      // the strings this job writes: the shape rule, the six's type lines and their UP TO n HITS lines
      const strings: string[] = [SHAPE_RULE_ANY];
      for (const id of SHAPES2_IDS) strings.push(kindLine(ITEMS[id]), ...[1, 2, 3].flatMap((s) => shapeLines(id, s).map((r) => r.text)));
      for (const t of strings) expect(/\b(PLATE|PLATES|PLATED|PLATING|SHIELD)\b/.test(t.replace(/\{\*?[A-Z]+\}/g, "")), `"${t}"`).toBe(false);
      // ELBOW GUARD's face says its SHIELD through the icon, and its reminder is the shared one (written with the {*PLATE} token)
      expect(plain(faceLines("elbowguard", 1)!.stats!)).toBe("[PLATE]+8");
      expect(REMINDER.PLATE()).toContain("{*PLATE}");
      expect(faceLines("elbowguard", 1)!.reminders).toHaveLength(1);
    });
  });

  it("a reminder shows for each keyword a star's stat row holds (BURN on CINDER HOOK from ★2, STUN on SPARK COMB, SHIELD on ELBOW GUARD), none on the DMG rigs", () => {
    on(() => {
      const rem = (id: string) => faceLines(id, 1)!.reminders.map((r) => r.replace(/[^A-Z{}*]+/g, " ").slice(0, 14));
      expect(rem("cinderhook").length, "CINDER HOOK ★1 is DMG alone (the BURN comes with the first merge)").toBe(0);
      expect(faceLines("cinderhook", 2)!.reminders.length, "★2 holds BURN").toBe(1);
      expect(faceLines("cinderhook", 3)!.reminders.length, "★3 holds BURN").toBe(1);
      expect(rem("sparkcomb").length).toBe(1);
      expect(rem("elbowguard").length).toBe(1);
      for (const id of ["sawbar", "jawcrusher", "pickaxe"]) expect(faceLines(id, 1)!.reminders, id).toEqual([]);
    });
  });
});

describe("SHAPES-2 S5: the shape pictures", () => {
  it("each fits the panel header's 14x14 inside: PICKAXE's seven arrows at 3 px a cell, every other at 4; none is another's", () => {
    on(() => {
      const size = Object.fromEntries(SHAPES2_IDS.map((id) => [id, shapePicSize(id)]));
      expect(size).toEqual({
        elbowguard: { w: 8, h: 10 }, // L3 (2x2 box) with its forward arrows: 8 wide, 8 + 2 tall
        sawbar: { w: 12, h: 6 },
        sparkcomb: { w: 8, h: 6 },
        cinderhook: { w: 12, h: 8 }, // a rare's left-and-right arrows add 2 each side
        jawcrusher: { w: 12, h: 8 },
        pickaxe: { w: 13, h: 8 }, // 3 px a cell: 4 px would be 16 wide
      });
      for (const [id, z] of Object.entries(size)) {
        expect(z.w, id).toBeLessThanOrEqual(14);
        expect(z.h, id).toBeLessThanOrEqual(14);
        const c = shapePic(id) as unknown as { width: number; height: number };
        expect([c.width, c.height], id).toEqual([z.w, z.h]);
      }
      // the shapes of SHAPES-1 keep their 4 px (the card lane's mock sizes)
      expect(shapePicSize("nailstrip")).toEqual({ w: 8, h: 6 });
      expect(shapePicSize("spikerail")).toEqual({ w: 8, h: 12 });
      expect(shapePicSize("gantry")).toEqual({ w: 12, h: 8 });
    });
  });
});
