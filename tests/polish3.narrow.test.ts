// POLISH-3 (REQ-BFG-089; BRIEF-POLISH3 Q5, the pieces lane's display list, item 2; cap's ruling D): AT ★1 THE TITLE'S STAR NO LONGER PUSHES THE FAMILY NAMES OUT, ON NARROW BANDS.
//   POLISH-1's P5a gave every one-star panel the title `NAME ★` (a space and a star, 6 px wider in the 5x7 face). On a band under ~175 px portraitButtons (the 0.6.1r F7 rule) then dropped the buttons
//   under the sub line (shift 12) and the family head lost its place (tests/present2.famhead.test.ts: 33 panel-views at its 161 px band). In the game only 280x653 (a 162 px band) and 300x640 (174 px)
//   reach them: 402x690, 360x640 and 320x568 keep the names under the sub line. The NARROW step: on a band under 176 px a lone trailing star does not move the buttons (`clear` is measured on the
//   title without it) and fitTitle steps the title down to the 3x5 face where the star would reach them. Two stars or more, and every band of 176 px or more: as before. The whole-phone step (the
//   same on every band) moves PRESENT-3's and PRESENT-4's pins and is not built (cap's ruling D).
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { framed } from "./polish2.guestCorpus";
import { textWidth } from "../src/render/font";
import { buyableModules } from "../src/sim/content";
import { newRun, type Run } from "../src/game/run";
import { buildLayout } from "../src/screens/build/layout";
import { cargoPanel, offerPanel, planPanel, portraitButtons, selFamilies, type PanelText } from "../src/screens/build/inspector";

installRaster();

const MODULES = buyableModules();
const SUB = "RIG"; // a short sub: the title decides where the buttons go (`clear` is the wider of the title and the sub)
const TWO = ["TO CARGO", "SELL 2G"];
/** Titles of every width from 4 to 30 letters in steps of a pixel or two: n wide letters and k narrow ones. */
const widths = (): string[] => { const out: string[] = []; for (let n = 2; n <= 24; n++) for (let k = 0; k <= 5; k++) out.push("W".repeat(n) + "I".repeat(k)); return out; };

describe("POLISH-3 Q5: portraitButtons, the narrow step", () => {
  it("on a band under 176 px a lone trailing star does not move the buttons: the answer is the title's without it", () => {
    for (const w of [150, 161, 162, 170, 174, 175]) {
      const r = { x: 3, y: 100, w, h: 69 };
      for (const name of ["WHETSTONE", "LONG HAUL", "SPLITTER", "TOLLBOOTH", "KINDLING", "LODESTONE", "SPARK GAP", "ROT GAUGE", "FROSTBITE", "ASSEMBLY LINE"]) {
        expect(portraitButtons(`${name} ★`, SUB, TWO, r), `${w} px: ${name} ★`).toEqual(portraitButtons(name, SUB, TWO, r));
        expect(portraitButtons(`${name} ★`, SUB, [TWO[0]], r), `${w} px: ${name} ★, one button`).toEqual(portraitButtons(name, SUB, [TWO[0]], r));
      }
    }
  });

  it("a band of 176 px or more is as before: the star counts (it moves the buttons for some title)", () => {
    for (const w of [176, 180, 207, 235]) {
      const r = { x: 3, y: 100, w, h: 69 };
      let moved = 0;
      for (const name of widths()) {
        if (JSON.stringify(portraitButtons(`${name} ★`, SUB, TWO, r)) !== JSON.stringify(portraitButtons(name, SUB, TWO, r))) moved++;
      }
      expect(moved, `${w} px: titles the star moves the buttons for`).toBeGreaterThan(0);
    }
  });

  it("two stars or more are as before on a narrow band: ★★ counts (no title steps back by the narrow step)", () => {
    const r = { x: 3, y: 100, w: 161, h: 69 };
    let moved = 0;
    for (const name of widths()) {
      if (JSON.stringify(portraitButtons(`${name} ★★`, SUB, TWO, r)) !== JSON.stringify(portraitButtons(name, SUB, TWO, r))) moved++;
    }
    expect(moved, "titles ★★ moves the buttons for").toBeGreaterThan(0);
  });
});

describe("POLISH-3 Q5: the bands of the game's views", () => {
  it("280x653 is a 162 px band and 300x640 a 174 px band (under 176): the narrow step; 402x690, 360x640 and 320x568 are 207 px or more (as before); the desk's column is not a band", () => {
    const w = (v: [number, number, number]): number => framed(v[0], v[1], v[2], 0).L.info.w;
    expect([w([280, 653, 3]), w([300, 640, 3])], "the two narrow views").toEqual([162, 174]);
    for (const v of [[402, 690, 3], [360, 640, 2], [320, 568, 2]] as [number, number, number][]) expect(w(v), `${v.join("x")}`).toBeGreaterThanOrEqual(176);
    expect(buildLayout(167, 394, true, 5).info.w, "the pre-ZOOM-1 phone scale of tests/present2.famhead.test.ts").toBe(161);
  });

  // every offer and every cargo part of the shop, at ★1: the panels POLISH-1's P5a gave ` ★`
  const runWith = (def: string): Run => {
    const d = MODULES.find((m) => m.id === def)!;
    const run = newRun("furnace", 5, "narrow");
    run.gold = 99;
    run.inventory = [{ uid: 900, def }];
    run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    return run;
  };
  for (const [name, view] of [["280x653", [280, 653, 3]], ["300x640", [300, 640, 3]], ["161 px band (famhead's)", null]] as [string, [number, number, number] | null][]) {
    it(`${name}: a ★1 panel's buttons keep the top row wherever the title without its star leaves room for them, and no title is cut with a dot`, () => {
      const f = view ? framed(view[0], view[1], view[2], 0) : null;
      const area = f ? f.L.info : buildLayout(167, 394, true, 5).info, tap = f ? f.tap : 0;
      let n = 0, stepped = 0, kept = 0;
      for (const d of MODULES) {
        const run = runWith(d.id);
        for (const t of [cargoPanel(run, 900), offerPanel(run, 0, 0)] as (PanelText | null)[]) {
          if (!t || !t.title.endsWith(" ★")) continue;
          const fam = selFamilies(run, { kind: "cargo", uid: 900 });
          const p = planPanel(t, area, fam, { tap, band: true }), bare = planPanel({ ...t, title: t.title.slice(0, -2) }, area, fam, { tap, band: true });
          n++;
          // the star does not move the buttons: the plan's button row is the one the title without the star has
          expect(p.shift, `${d.id} ${t.title}`).toBe(bare.shift);
          // and the title is never cut with a dot: the 5x7 face where it fits, else the 3x5 face, whole
          if (textWidth(t.title) > p.subMax) { stepped++; expect(textWidth(t.title, "3"), `${d.id} ${t.title}: the 3x5 face holds it (${p.subMax} px)`).toBeLessThanOrEqual(p.subMax); } else kept++;
        }
      }
      expect(n, "★1 panels in the corpus (the cargo parts; the offers take the star with Q4)").toBeGreaterThan(100);
      expect(stepped + kept).toBe(n);
    });
  }
});
