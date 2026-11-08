// POLISH-4 (REQ-BFG-087, REQ-BFG-089; P4-2, cap's ruling 2 on the scout's mode b): A RIG'S SUB BREAKS IN THE 96 px COLUMN INSTEAD OF BEING CUT WITH A DOT.
//   At polish3b-accepted a rig face's sub `RIG · 1/1 ARROWS ON BELTS` split after its last ` · ` and the second piece (`1/1 ARROWS ON BELTS`, 72 px) was left whole: in the 96 px column of a 3040x1710 screen (subMax 69) it was cut
//   with a dot (`1/1 ARROWS ON BEL.`): 1,464 faces of corpus A, your own and the foe's alike, and none on any other of the thirteen views. Now (inspector.ts breakSub, planOnce): the WHOLE sub breaks at a space where that gives
//   two rows that fit (`RIG · 1/1 ARROWS ON` / `BELTS`), else the two pieces with the second one's own break. The words stay, the rows are the same count, no ability line moves; the build screen's panels (no `wrap`) are as before.
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { facePlan } from "../src/screens/battleScout";
import { planPanel, type PanelPlan } from "../src/screens/build/inspector";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { textWidth } from "../src/render/font";
import { faces, drawnSubs, type Face } from "./polish3b.helpers";
import { VIEW13_NAMES, viewAt, type View13 } from "./polish4.helpers";

installRaster();
afterEach(() => setEnchant(ENCHANT));

const drawn = (f: Face, name: View13, foe: boolean): PanelPlan => { const { fa, tp } = viewAt(name, foe ? 1 : 0); return withEnchant(() => facePlan(f.t, fa, f.fam, tp)); };
const cutSubs = (list: Face[], name: View13, foe: boolean): string[] => list.filter((f) => { const p = drawn(f, name, foe); return drawnSubs(f.t, p).some((s) => textWidth(s, "3") > p.subMax); }).map((f) => f.tag);
/** a rig whose sub is `RIG · n/m ARROWS ON BELTS` (the arrows the rig puts on belts) */
const ARROW_RIG = / · \d\/\d ARROWS ON BELTS$/;

describe("POLISH-4 P4-2: no sub is cut with a dot in the 96 px column", () => {
  for (const foe of [false, true]) {
    it(`3040x1710 (face column ${viewAt("col96-3040x1710").fa.area.w} px, subMax 69), ${foe ? "the foe's" : "your own"} faces of corpus A (2,242) and B (1,809): no sub row is wider than its room; the 1,464 rig faces of A break`, () => {
      const list = faces(foe);
      expect(viewAt("col96-3040x1710", foe ? 1 : 0).fa.area.w, "the face column of the 3040x1710 screen").toBe(96);
      expect(list.filter((f) => f.corpus === "A").length).toBe(2242);
      expect(list.filter((f) => f.corpus === "B").length).toBe(1809);
      expect(cutSubs(list, "col96-3040x1710", foe), "cut with a dot").toEqual([]);
      const rigs = list.filter((f) => f.corpus === "A" && ARROW_RIG.test(f.t.sub));
      expect(rigs.length, "A: the rig faces whose second piece is 72 px").toBe(1464);
      for (const f of rigs) {
        const p = drawn(f, "col96-3040x1710", foe), rest = foe ? f.t.sub.slice(f.t.subOwner!.length + 1) : f.t.sub;
        // the whole sub breaks at its last space that gives two rows that fit: `RIG · 1/1 ARROWS ON` / `BELTS`; the foe's owner stays on its own row first
        expect(p.subs, f.tag).toEqual([...(foe ? [f.t.subOwner!] : []), rest.slice(0, rest.length - " BELTS".length), "BELTS"]);
        expect(p.subs.join(" "), `${f.tag}: the words, whole`).toBe(f.t.sub);
        expect(p.subs.every((s) => textWidth(s, "3") <= p.subMax), f.tag).toBe(true);
      }
    });
  }

  it("a sub whose pieces and whole will not make two rows breaks in three: the split, and its second piece at a space (the scout's mode b fallback)", () => {
    const rig = faces(false).find((f) => f.corpus === "A" && ARROW_RIG.test(f.t.sub) && f.kind === "item")!;
    const { fa, tp } = viewAt("col96-3040x1710", 0);
    const t = { ...rig.t, sub: "RIG · AAAA BBBB CCCC DDDD EEEE FFFF" };
    const p = withEnchant(() => facePlan(t, fa, rig.fam, tp));
    expect(p.subs).toEqual(["RIG ·", "AAAA BBBB CCCC", "DDDD EEEE FFFF"]);
    expect(p.shift, "the header takes the third row's 6 px: 4 + 6 * (rows - 2)").toBe(4 + 6);
    expect(p.subs.every((s) => textWidth(s, "3") <= p.subMax)).toBe(true);
  });

  it("on the other twelve views nothing was cut with a dot and nothing is now (the rig's second piece fits their columns, so its split is the same two pieces); the 280x653 band's 24 + 24 foe turret subs are a band, not a column (out of scope)", () => {
    for (const name of VIEW13_NAMES.filter((v) => v !== "col96-3040x1710")) {
      for (const foe of [false, true]) {
        const left = cutSubs(faces(foe), name, foe);
        expect(left.length, `${name} ${foe ? "foe" : "own"}: faces cut with a dot`).toBe(name === "band-280x653" && foe ? 48 : 0);
      }
      const { fa } = viewAt(name, 0);
      expect(textWidth("1/2 ARROWS ON BELTS", "3"), `${name}: the second piece (72 px) fits the column's room`).toBeLessThanOrEqual(fa.area.w - 27);
    }
  });

  it("the build screen's panel (planPanel without `wrap`) keeps the split of old, its second piece whole, even where the column is 96 px: the break is a battle face's option", () => {
    const rig = faces(false).find((f) => f.corpus === "A" && ARROW_RIG.test(f.t.sub) && f.kind === "item")!;
    const { fa, tp } = viewAt("col96-3040x1710", 0);
    const plain = withEnchant(() => planPanel(rig.t, fa.area, rig.fam, { tap: tp, band: fa.band }));
    expect(plain.subs, "the split of old").toEqual(["RIG ·", rig.t.sub.slice("RIG · ".length)]);
    expect(plain.titleRows).toBeUndefined();
  });
});
