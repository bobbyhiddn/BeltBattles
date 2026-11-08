// POLISH-4 (REQ-BFG-089; P4-5, cap's ruling 4: names for 8 of the 14 P5A_STAR1 entries, the other six stay marks; never the whole-phone title step, never the unlimited rung): THE FAMILY HEAD'S `sub1` RUNG.
//   POLISH-1's P5a put a star after a one-star panel's title (`NAME ★`). On the 161 px phone band the buttons drop under the sub line (shift 12) and the head's only name place is then beside the 5x7 title, which a `NAME ★` title leaves
//   19-61 px: less than the names need, so 14 panels printed their family as 3x3 marks (tests/present2.famhead.test.ts P5A_STAR1: 13 phone panels and the laptop's STOKER). Now a rung `sub1` of the ladder (inspector.ts planOnce bySub1): the names
//   right-aligned on the sub line's FIRST row (y + 13), where that row is free (the buttons are under the sub, or a column sub is on two rows: `RIG ·` / `1/2 ARROWS ON FACTORIES`), for a title that ends in ` ★`, never in a battle face (`wrap`),
//   after the three name places and before the marks: no head that prints names today moves. 8 of the 14 return to names; 5 more ★1 panels that were marks at BASE too print names; 6 stay marks (subs of 81-92 px; tappable, they open the
//   family's note). tests/present2.famhead.test.ts pins the whole corpus; this file pins the rung itself.
import { afterEach, describe, expect, it } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { drawFamHead, planPanel, selFamilies, type PanelPlan } from "../src/screens/build/inspector";
import { familyTargets } from "../src/screens/build/keywords";
import { famHeadText, familyWord } from "../src/ui/families";
import { textWidth } from "../src/render/font";
import { ENCHANT, setEnchant } from "../src/sim/enchant";
import { DESK, LAPTOP, PHONE, corpus, type Case } from "./polish4.famcorpus";

installRaster();
afterEach(() => setEnchant(ENCHANT));

const CASES = corpus();
const AREA = { phone: PHONE, desk: DESK, laptop: LAPTOP } as const;
type Band = keyof typeof AREA;
const at = (key: string): { band: Band; c: Case } => { const [band, idx] = key.split(" "); return { band: band as Band, c: CASES[Number(idx)] }; };
const planOf = (key: string, o: Parameters<typeof planPanel>[3] = {}): PanelPlan => { const { band, c } = at(key); return planPanel(c.t, AREA[band], selFamilies(c.run, c.sel), o); };

/** the 13 panels that print names by `sub1` (the 8 of P5A_STAR1's 14 and the 5 more), with the head's words */
const NAMED: Record<string, string> = {
  "phone 47": "SWARM, TEMPO", "phone 81": "HARASS", "phone 82": "HARASS", "phone 83": "HARASS FAMILY", "phone 92": "HARASS, TEMPO", "phone 228": "FORGE, BURST, TEMPO", "phone 288": "FORGE, BURST, TEMPO",
  "phone 300": "FORGE, BURST, TEMPO", "phone 1095": "HARASS FAMILY", "phone 1096": "HARASS FAMILY", "phone 1097": "HARASS, TEMPO", "phone 1098": "HARASS, TEMPO", "laptop 692": "SWARM, TEMPO",
};
/** the 6 that stay marks: a rig with a hit (the keg), and the offers of ASSEMBLY LINE, GATLING SPOOL, CAPACITOR BANK, COMPOUND BREECH, SPALL CATCHER with one held */
const MARKS = ["phone 299", "phone 1088", "phone 1168", "phone 1182", "phone 1184", "phone 1244"];

describe("POLISH-4 P4-5: the sub1 rung gives 13 star-titled panels their names back", () => {
  it("the 13 panels print their names beside the sub line's first row (at sub1, names, the words below); the 6 others of P5A_STAR1 stay marks and stay tappable", () => {
    for (const [key, words] of Object.entries(NAMED)) {
      const { c } = at(key), fh = planOf(key).famHead;
      expect(c.t.title.endsWith(" ★"), `${key} ${c.id}: a star title`).toBe(true);
      expect(fh?.at, `${key} ${c.id}`).toBe("sub1");
      expect(fh!.names, key).toBe(true);
      expect(famHeadText(fh!.tags, !!fh!.explained), key).toBe(words);
    }
    for (const key of MARKS) {
      const { band, c } = at(key), plan = planOf(key), fh = plan.famHead;
      expect(fh, `${key} ${c.id}`).not.toBeNull();
      expect(fh!.names, `${key} ${c.id}: marks`).toBe(false);
      const ts = familyTargets(plan, []);
      expect(ts.length, `${key}: one tap target a mark`).toBe(fh!.tags.length);
      expect(ts.map((t) => t.word).sort(), key).toEqual(fh!.tags.map((t) => `${familyWord(t)} FAMILY`).sort());
      expect(band).toBe("phone");
    }
  });

  it("only those 13 print by sub1, over the 1,303 panels on the phone band, the desk column and the laptop column: never the desk, always a star title, a phone's buttons under the sub or a column sub on two rows", () => {
    const got: string[] = [];
    for (const band of ["phone", "desk", "laptop"] as Band[]) CASES.forEach((c, i) => {
      const plan = planPanel(c.t, AREA[band], selFamilies(c.run, c.sel)), fh = plan.famHead;
      if (fh?.at !== "sub1") return;
      got.push(`${band} ${i}`);
      expect(c.t.title.endsWith(" ★"), `${band} ${c.id}: a star title`).toBe(true);
      expect(fh.names, `${band} ${c.id}: names only`).toBe(true);
      if (band === "phone") expect([plan.column, plan.shift > 0, plan.subs.length], `${band} ${c.id}: the buttons dropped under the sub`).toEqual([false, true, 1]);
      else expect([plan.column, plan.subs.length], `${band} ${c.id}: a column sub on two rows`).toEqual([true, 2]);
      expect(23 + textWidth(plan.subs[0], "3") + 6 + textWidth(famHeadText(fh.tags, !!fh.explained), "3"), `${band} ${c.id}: the words fit right of the first row with a 6 px gap`).toBeLessThanOrEqual(plan.r.w - 4);
    });
    expect(got).toEqual(Object.keys(NAMED).sort((a, b) => (a.startsWith("laptop") ? 1 : 0) - (b.startsWith("laptop") ? 1 : 0) || Number(a.split(" ")[1]) - Number(b.split(" ")[1])));
  });

  it("the rung is for a star title only, never a battle face, and `sub1: false` plans as before (the marks): the title without its star, planPanel's `wrap` and a foe's `subOwner` get no sub1", () => {
    for (const key of Object.keys(NAMED)) {
      const { band, c } = at(key), fam = selFamilies(c.run, c.sel), area = AREA[band];
      expect(planPanel({ ...c.t, title: c.t.title.replace(/ ★$/, "") }, area, fam).famHead?.at, `${key}: no star, no sub1`).not.toBe("sub1");
      expect(planPanel(c.t, area, fam, { wrap: true }).famHead?.at, `${key}: wrap`).not.toBe("sub1");
      expect(planPanel({ ...c.t, subOwner: "FOE'S" }, area, fam).famHead?.at, `${key}: subOwner`).not.toBe("sub1");
      const before = planPanel(c.t, area, fam, { sub1: false }).famHead;
      expect(before?.names, `${key}: before P4-5 the head was marks`).toBe(false);
    }
  });
});

describe("POLISH-4 P4-5: the sub1 head touches nothing and takes no gap slot", () => {
  const boxes = (key: string): { head: { x: number; y: number; w: number; h: number }; others: { what: string; x: number; y: number; w: number; h: number }[]; plan: PanelPlan } => {
    const { c } = at(key), plan = planOf(key), r = plan.r, fh = plan.famHead!;
    const w = textWidth(famHeadText(fh.tags, !!fh.explained), "3");
    const tw = textWidth(c.t.title) <= plan.subMax ? textWidth(c.t.title) + 2 : Math.min(textWidth(c.t.title, "3"), plan.subMax) + 2;
    const others = [
      { what: "icon box", x: r.x + 4, y: r.y + 4, w: 16, h: 16 },
      { what: "title", x: r.x + 22, y: r.y + 3, w: tw, h: textWidth(c.t.title) <= plan.subMax ? 9 : 7 },
      { what: "sub 0", x: r.x + 23, y: r.y + 13, w: Math.min(textWidth(plan.subs[0], "3"), plan.subMax), h: 5 },
      ...plan.subs.slice(1).map((s, i) => ({ what: `sub ${i + 1}`, x: r.x + 23, y: r.y + 13 + (i + 1) * 6, w: Math.min(textWidth(s, "3"), r.w - 27), h: 5 })),
      ...(plan.rects ?? []).map((b) => ({ what: "button", ...b })),
      { what: "body", x: r.x + 5, y: plan.y, w: r.w - 10, h: 200 },
    ];
    return { head: { x: r.x + r.w - 4 - w, y: r.y + 13, w, h: 5 }, others, plan };
  };
  it("each of the 13: one clear pixel from the icon box, the title, every sub row, the buttons and the body, inside the panel, and the first row's gap to the words at least 6 px", () => {
    for (const key of Object.keys(NAMED)) {
      const { head, others, plan } = boxes(key), r = plan.r;
      expect(head.x >= r.x + 4 && head.x + head.w <= r.x + r.w - 4, `${key}: inside the panel`).toBe(true);
      const ring = { x: head.x - 1, y: head.y - 1, w: head.w + 2, h: head.h + 2 };
      for (const b of others) expect(ring.x < b.x + b.w && b.x < ring.x + ring.w && ring.y < b.y + b.h && b.y < ring.y + ring.h, `${key}: the head meets the ${b.what}`).toBe(false);
      expect(head.x - (r.x + 23 + textWidth(plan.subs[0], "3")), `${key}: the gap to the sub's first row`).toBeGreaterThanOrEqual(6);
    }
  });

  it("it is beside the sub, not under it: no gap slot before the body (the panel is the one it would be without a head), the row y + 13 is where it is drawn, and a tap on it reaches the family's note", () => {
    for (const key of Object.keys(NAMED)) {
      const { band, c } = at(key), fam = selFamilies(c.run, c.sel), plan = planOf(key), without = planPanel(c.t, AREA[band], []);
      expect(plan.gaps.before, `${key}: the gaps`).toEqual(without.gaps.before);
      expect([plan.r.h, plan.y, plan.shift], `${key}: the panel`).toEqual([without.r.h, without.y, without.shift]);
      // drawn on the first sub row, y + 13 .. y + 17, right-aligned 4 px in from the edge
      const cv: RasterCanvas = fresh(plan.r.x + plan.r.w + 4, plan.r.y + plan.r.h + 4);
      drawFamHead(G(cv), plan);
      const px: [number, number][] = [];
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (cv.at(x, y)) px.push([x, y]);
      const w = textWidth(famHeadText(plan.famHead!.tags, !!plan.famHead!.explained), "3");
      expect([Math.min(...px.map((p) => p[1])), Math.max(...px.map((p) => p[1]))], `${key}: rows`).toEqual([plan.r.y + 13, plan.r.y + 17]);
      expect(Math.max(...px.map((p) => p[0])) <= plan.r.x + plan.r.w - 5 && Math.min(...px.map((p) => p[0])) >= plan.r.x + plan.r.w - 4 - w, `${key}: columns`).toBe(true);
      // the targets (keywords.ts familyTargets) are on those rows, and each opens its family's note
      const ts = familyTargets(plan, []);
      expect(ts.length, key).toBeGreaterThan(0);
      for (const t of ts) {
        expect([t.glyph.y, t.glyph.h], `${key}: ${t.word}`).toEqual([plan.r.y + 13, 5]);
        expect(fam.some((f) => `${familyWord(f)} FAMILY` === t.word), `${key}: ${t.word}`).toBe(true);
      }
    }
  });
});
