// POLISH-4 (REQ-BFG-089, REQ-BFG-087; P4-1, cap's ruling 1: patch 1 + 1c at the 6 px pitch; REVIEW-POLISH3 N6, REVIEW-POLISH3B N7): A BATTLE FACE KEEPS ITS FAMILY HEAD UNDER A TWO-ROW TITLE.
//   POLISH-3 wrapped a title wider than its column onto two 3x5 rows and gave such a face NO family head (inspector.ts planOnce: `famHead0 = ... || titleRows ? null`): at 1920x1080 92 of the real builds' faces and 883 of every piece x star x
//   word, your own and the foe's, 3040x1710 102 / 1,111, 851x393@2.75 64 / 629 ... and the head is the card's own tag (the family: FORGE, TEMPO), so REQ-BFG-089 wants it visible.
//   Now: the head sits TITLE_ROW_DY (6 px; src/ui/spacing.ts) lower, like the sub rows, under a one-row sub or beside the sub's second row; and, for the foe's three sub rows (the owner's, then the broken sub), beside the LAST row
//   (PanelPlan.famHead.row). The gap yields to the head (content first, SPACE-1 D3): corpus B's faces under min at 1920x1080 132 -> 162 (own), 66 -> 81 (foe); the real builds (A) stay at 82 and 57.
//   Proof: the counts per view; every head drawn clear of the icon box, both title rows, the sub rows and the body, one pixel all round, on the pixels drawFamHead really paints (with a positive control: the head left where it was
//   before this fix collides); the keyword layer's family targets sit on the head (keywords.ts familyTargets); BattleFaces.drawOn paints the head where drawFamHead puts it.
import { afterEach, describe, expect, it } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { BattleFaces, facePlan } from "../src/screens/battleScout";
import { drawFamHead, fitHead, fitTitle, fitTitleRows, type PanelPlan, type PanelText } from "../src/screens/build/inspector";
import { familyTargets } from "../src/screens/build/keywords";
import { TITLE_ROW_DY, headDy } from "../src/ui/spacing";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { RIVALS, rivalBuild, standInBuild, type RivalId } from "../src/sim/rivals";
import { rect } from "../src/render/pixel";
import { C } from "../src/render/palette";
import { textWidth } from "../src/render/font";
import { LINE, faces, type Face } from "./polish3b.helpers";
import { VIEW13_NAMES, gameAt, viewAt, type View13 } from "./polish4.helpers";
import { tapPx } from "../src/ui/tap";

installRaster();
afterEach(() => setEnchant(ENCHANT));

/** the faces with a two-row title and families, and how many carry a head: [own A, own B, foe A, foe B] each [with a head, of]; the scout's table (POLISH-4 SCOUT section 2) with P4-2 in (the 3040x1710 rigs) */
// BUMP-1H (RULING-BUMP1H-R6 R6.4, the merge with 0.9.15.1): 851x393@2.75 corpus A own [54, 64] -> [62, 72] and foe [50, 64] -> [58, 72]: eight more faces with a two-row title and a family, every one of them carries its head. The cause is H2 (src/sim/npcWords.ts:
// the four Easy captains' day-5 words are BRACED now, were RISING / FIERY; H3 does not move this file). With npcWords.ts alone put back to bump1h-base this file passes at 0.9.15.1's table (kit-1h/revert6m.sh: 22 of 22).
const HEADS: Record<View13, [number, number][]> = {
  "desk-1920x1080": [[72, 92], [883, 883], [50, 92], [641, 883]],
  "laptop-1366x768": [[0, 0], [8, 8], [0, 0], [8, 8]],
  "desk-1280x800": [[0, 0], [8, 8], [0, 0], [8, 8]],
  "land-844x390": [[0, 0], [8, 8], [0, 0], [8, 8]],
  "op-402x690": [[0, 0], [0, 0], [0, 0], [0, 0]],
  "phone-360x640": [[0, 0], [0, 0], [0, 0], [0, 0]],
  "col96-3040x1710": [[102, 102], [1111, 1111], [102, 102], [1111, 1111]],
  "land-812x375@3": [[0, 0], [58, 58], [0, 0], [50, 58]],
  "pixel5-851x393@2.75": [[62, 72], [629, 629], [58, 72], [508, 629]],
  "land-915x412@2.625": [[4, 4], [107, 107], [0, 4], [90, 107]],
  "promax-926x428@3": [[12, 12], [214, 214], [0, 12], [185, 214]],
  "band-280x653": [[0, 0], [0, 0], [0, 0], [0, 0]],
  "band-300x640": [[0, 0], [0, 0], [0, 0], [0, 0]],
};

const planOf = (f: Face, name: View13, foe: boolean): PanelPlan => { const { fa, tp } = viewAt(name, foe ? 1 : 0); return withEnchant(() => facePlan(f.t, fa, f.fam, tp)); };

describe("POLISH-4 P4-1: faces with a two-row title and a family carry the head", () => {
  for (const name of VIEW13_NAMES) {
    it(`${name}: two-row titles with families that carry a head [own A, own B, foe A, foe B] = ${JSON.stringify(HEADS[name])} (none at the base)`, () => {
      const got: [number, number][] = [];
      for (const foe of [false, true]) for (const co of ["A", "B"] as const) {
        let heads = 0, of = 0;
        for (const f of faces(foe).filter((x) => x.corpus === co && x.fam.length > 0)) {
          const p = planOf(f, name, foe);
          if (!p.titleRows) continue;
          of++;
          if (p.famHead) heads++;
        }
        got.push([heads, of]);
      }
      expect(got).toEqual(HEADS[name]);
    });
  }

  it("the head's place: under a one-row sub or beside the second sub row; for the foe's three sub rows beside the LAST one (famHead.row); never beside a two-row title", () => {
    let n = 0;
    for (const foe of [false, true]) for (const name of ["desk-1920x1080", "col96-3040x1710", "pixel5-851x393@2.75"] as View13[]) {
      for (const f of headedFaces(name, foe)) {
        const p = planOf(f, name, foe), fh = p.famHead!;
        n++;
        expect(["sub", "sub2"], `${name} ${f.tag}`).toContain(fh.at);
        if (fh.at === "sub") expect(p.subs.length, `${name} ${f.tag}: under a one-row sub`).toBe(1);
        else expect(fh.row ?? 1, `${name} ${f.tag}: beside the last of ${p.subs.length} sub rows`).toBe(p.subs.length - 1);
        expect(headDy(p), `${name} ${f.tag}`).toBe(TITLE_ROW_DY + (fh.at === "sub2" ? 6 * ((fh.row ?? 1) - 1) : 0));
        // the header grows by the title row only: the body starts where it did (POLISH-3), the head takes a gap slot, not a row
        expect(p.shift, `${name} ${f.tag}`).toBe((p.subs.length > 1 ? 4 + 6 * (p.subs.length - 2) : 0) + TITLE_ROW_DY);
      }
    }
    expect(n, "headed two-row faces read").toBeGreaterThan(5000);
  });

  it("a panel with no title rows and at most two sub rows is planned and placed exactly as before: headDy is 0, no `row` on its head", () => {
    const base = { famHead: { at: "sub2" as const, row: undefined } };
    expect(headDy({ famHead: null })).toBe(0);
    expect(headDy({ famHead: { at: "sub" } })).toBe(0);
    expect(headDy({ famHead: { at: "sub2" } })).toBe(0);
    expect(headDy({ famHead: { at: "title" }, titleRows: ["A", "B"] }), "beside the title: not moved").toBe(0);
    expect(headDy({ ...base, titleRows: ["A", "B"] })).toBe(TITLE_ROW_DY);
    expect(headDy({ famHead: { at: "sub2", row: 2 } }), "the third sub row of a face with one title row").toBe(6);
    expect(headDy({ famHead: { at: "sub", row: 2 }, titleRows: ["A", "B"] }), "`row` is the sub2 head's").toBe(TITLE_ROW_DY);
    for (const f of faces(false).filter((x) => x.corpus === "A")) {
      const p = planOf(f, "op-402x690", false); // the band: no title rows, no column
      expect(p.titleRows).toBeUndefined();
      if (p.famHead) expect(p.famHead.row, f.tag).toBeUndefined();
    }
  });
});

/** The header of a face as battleScout.ts drawOn draws it, piece by piece on a blank canvas each: the icon box, the title (one row or two), the sub rows, the family head. */
function pieces(t: PanelText, plan: PanelPlan, head: PanelPlan = plan): { icon: RasterCanvas; title: RasterCanvas; subs: RasterCanvas; head: RasterCanvas } {
  const r = plan.r, W = r.x + r.w + 4, H = plan.y + 6;
  const icon = fresh(W, H), title = fresh(W, H), subs = fresh(W, H), hd = fresh(W, H);
  rect(G(icon), r.x + 4, r.y + 4, 16, 16, C.ink);
  if (plan.titleRows) fitTitleRows(G(title), t, r.x + 23, r.y + 4, plan.titleRows);
  else fitTitle(G(title), t, r.x + 23, r.y + 4, plan.subMax);
  const dy = plan.titleRows ? TITLE_ROW_DY : 0, subColor = t.subColor ?? C.slate4;
  if (plan.body.sub) fitHead(G(subs), plan.body.sub, r.x + 23, r.y + 13 + dy, plan.subMax, plan.body.subColor ?? subColor, false);
  else if (plan.subs.length > 1) plan.subs.forEach((s, i) => fitHead(G(subs), s, r.x + 23, r.y + 13 + dy + i * 6, plan.subMax, subColor, false));
  else fitHead(G(subs), t.subShort && textWidth(t.sub, "3") > plan.subMax ? t.subShort : t.sub, r.x + 23, r.y + 13 + dy, plan.subMax, subColor, false);
  drawFamHead(G(hd), head);
  return { icon, title, subs, head: hd };
}
const paintedOf = (c: RasterCanvas, plan: PanelPlan): [number, number][] => {
  const r = plan.r, out: [number, number][] = [];
  for (let y = r.y; y < plan.y + 6; y++) for (let x = r.x; x < r.x + r.w; x++) if (c.at(x, y)) out.push([x, y]);
  return out;
};
/** what a family head's pixels meet, one clear pixel all round: the icon box, the title rows, the sub rows (their painted pixels), the body (a row at or above its first line), the panel's frame */
function meets(p: ReturnType<typeof pieces>, plan: PanelPlan): Set<string> {
  const r = plan.r, out = new Set<string>();
  for (const [x, y] of paintedOf(p.head, plan)) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (p.icon.at(x + dx, y + dy)) out.add("icon");
      if (p.title.at(x + dx, y + dy)) out.add("title");
      if (p.subs.at(x + dx, y + dy)) out.add("sub");
    }
    if (y + 1 >= plan.y) out.add("body");
    if (x < r.x + 1 || x > r.x + r.w - 2) out.add("frame");
  }
  return out;
}

interface Sample { f: Face; name: View13; foe: boolean; plan: PanelPlan }
const headed = new Map<string, Face[]>();
/** the faces of a view with a two-row title that carry a head, corpus A then B (one pass over the corpus a view and side) */
function headedFaces(name: View13, foe: boolean): Face[] {
  const k = `${name}/${foe}`, hit = headed.get(k);
  if (hit) return hit;
  const out = faces(foe).filter((f) => { if (!f.fam.length) return false; const p = planOf(f, name, foe); return !!p.titleRows && !!p.famHead; });
  headed.set(k, out);
  return out;
}
/** every headed two-row face of corpus A and every `stepB`-th of corpus B on a view */
function sample(name: View13, foe: boolean, stepB: number): Sample[] {
  let b = 0;
  return headedFaces(name, foe).filter((f) => f.corpus === "A" || b++ % stepB === 0).map((f) => ({ f, name, foe, plan: planOf(f, name, foe) }));
}
let samples: Sample[] | null = null;
const SAMPLES = (): Sample[] => (samples ??= [
  ...sample("desk-1920x1080", false, 9), ...sample("desk-1920x1080", true, 12), ...sample("col96-3040x1710", false, 15), ...sample("col96-3040x1710", true, 15),
  ...sample("pixel5-851x393@2.75", false, 7), ...sample("pixel5-851x393@2.75", true, 7), ...sample("land-844x390", false, 1), ...sample("land-844x390", true, 1),
]);

describe("POLISH-4 P4-1: the head touches nothing", () => {
  it("every sampled headed face (1920x1080, 3040x1710, 851x393@2.75, 844x390; own and foe): the head's painted pixels keep one clear pixel from the icon box, both title rows, every sub row, the body and the frame", () => {
    const s = SAMPLES();
    expect(s.length, "faces sampled").toBe(928); // BUMP-1H (RULING-BUMP1H-R6 R6.4): was 912; H2's eight more headed corpus-A faces at 851x393@2.75, own and foe (see HEADS)
    const bad: string[] = [];
    for (const { f, name, foe, plan } of s) {
      const hit = meets(pieces(f.t, plan), plan);
      if (hit.size) bad.push(`${name} ${foe ? "foe" : "own"} ${f.tag}: meets ${[...hit].join(", ")}`);
    }
    expect(bad.slice(0, 5), `${bad.length} of ${s.length}`).toEqual([]);
  });

  it("positive control: left where the head was drawn before this fix (no title-row offset), the same check finds collisions with the sub rows: the check can see a wrong place", () => {
    const s = SAMPLES().filter((x) => x.name === "desk-1920x1080");
    expect(s.length).toBeGreaterThan(100);
    let n = 0;
    for (const { f, plan } of s) {
      const old: PanelPlan = { ...plan, titleRows: undefined, famHead: plan.famHead && { ...plan.famHead, row: undefined } }; // drawFamHead without the offsets
      if (meets(pieces(f.t, plan, old), plan).has("sub")) n++;
    }
    expect(n, "faces whose head, un-offset, meets a sub row").toBeGreaterThan(30);
  });
});

describe("POLISH-4 P4-1: the keyword layer's family targets sit on the head", () => {
  it("familyTargets: every target's glyph is on the rows the head is drawn on (names: the same top and bottom row; marks: within the 3 px of the mark), so a tap on the head reaches its family note", () => {
    const s = SAMPLES().filter((x) => x.name === "desk-1920x1080" || x.name === "col96-3040x1710");
    let checked = 0;
    for (const { f, plan } of s) {
      const ts = familyTargets(plan, []);
      expect(ts.length, `${f.tag}: one target for each of the head's families`).toBeGreaterThan(0);
      const px = paintedOf(pieces(f.t, plan).head, plan), top = Math.min(...px.map((p) => p[1])), bottom = Math.max(...px.map((p) => p[1]));
      const gTop = Math.min(...ts.map((t) => t.glyph.y)), gBottom = Math.max(...ts.map((t) => t.glyph.y + t.glyph.h - 1));
      if (plan.famHead!.names) { expect([gTop, gBottom], `${f.tag}: names`).toEqual([top, bottom]); }
      else { expect(gTop <= top && gBottom >= bottom, `${f.tag}: marks ${gTop}-${gBottom} hold ${top}-${bottom}`).toBe(true); }
      for (const t of ts) expect(t.r.y + t.r.h, `${f.tag}: the target stays above the body`).toBeLessThanOrEqual(plan.y + 7);
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
  });
});

describe("POLISH-4 P4-1: BattleFaces.drawOn paints the head where drawFamHead puts it", () => {
  const owner = (tag: string): { id: RivalId; maker: "rivalBuild" | "standInBuild"; day: number } => {
    const [, id, maker, d] = tag.split(" ");
    return { id: id as RivalId, maker: maker as "rivalBuild" | "standInBuild", day: Number(d.slice(1)) };
  };
  for (const [name, foe] of [["desk-1920x1080", false], ["desk-1920x1080", true], ["col96-3040x1710", false], ["pixel5-851x393@2.75", true]] as [View13, boolean][]) {
    it(`${name}, ${foe ? "the foe's" : "your own"} first headed two-row face of corpus A: every pixel of its head is on the screen in the head's colour`, () => {
      const s = sample(name, foe, 1).find((x) => x.f.corpus === "A")!; // the first headed two-row face of corpus A
      expect(s, "a headed two-row face of corpus A").toBeDefined();
      const { id, maker, day } = owner(s.f.tag);
      const build = withEnchant(() => (maker === "rivalBuild" ? rivalBuild(id, day) : standInBuild(id, day)));
      const { v, game } = gameAt(name);
      const { fa, tp } = viewAt(name, foe ? 1 : 0);
      expect(tp).toBe(tapPx(v));
      const bf = new BattleFaces();
      bf.open = { side: foe ? 1 : 0, sel: s.f.sel };
      game.ui.begin();
      const c = fresh(v.W, v.H);
      withEnchant(() => bf.drawOn(G(c), game, build, fa, () => null, "slate", LINE, day, foe ? RIVALS[id].name : undefined));
      expect(bf.last!.r, "the panel drawOn drew is the plan's").toEqual(s.plan.r);
      const head = fresh(v.W, v.H);
      drawFamHead(G(head), s.plan);
      const px = paintedOf(head, s.plan);
      expect(px.length).toBeGreaterThan(8);
      for (const [x, y] of px) expect(c.at(x, y), `pixel ${x},${y}`).toBe(head.at(x, y));
    });
  }
});
