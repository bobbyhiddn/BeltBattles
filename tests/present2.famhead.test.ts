// PRESENT-2 W (b) (REQ-BFG-081; PRESENT-1 Question 5, the lead's YES; cap's ruling 7d5006c5f3ca852f): the panel's family head says what it is. All six readers of PRESENT-1's cold read asked what the orange
// `FORGE` under COMMON RIG is. Where the head prints names it now prints `FORGE FAMILY` (one family) or `FAMILIES: FORGE, TEMPO` (more) -- one LADDER a head, per view: the explained words where they fit the
// place the plain names took (the head keeps today's place, colour and face), else the plain names exactly as before, else the 3x3 marks exactly as before. No head loses the names it shows.
// The proof is PER PANEL and per view, not totals: tests/families.test.ts's corpus (1,303 panels: every offer, cargo part, placed rig, factory and turret) on the phone band, the desk column and the laptop
// column, against the base's placement (present2-base 4656d58630ee; kit/famcodes.sh on its export: one character a panel).
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { textWidth } from "../src/render/font";
import { buyableModules } from "../src/sim/content";
import { key as K, rotField, setTurretList, type Placed } from "../src/sim/deck";
import { rotFacing, stokeSpots } from "../src/sim/beltside";
import { fusible } from "../src/sim/stars";
import { newRun, type Run } from "../src/game/run";
import { buildLayout, type Sel } from "../src/screens/build/layout";
import { cargoPanel, itemPanel, offerPanel, planPanel, rigPanel, selFamilies, turretPanel, type PanelText } from "../src/screens/build/inspector";
import { familyTargets } from "../src/screens/build/keywords";
import { famHeadText, familyNote, familyWord } from "../src/ui/families";

installRaster();

const MODULES = buyableModules();
const PHONE = buildLayout(167, 394, true, 5).info;
const DESK = buildLayout(480, 270, false, 5).info;
const LAPTOP = buildLayout(455, 256, false, 5).info;
const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const SIDE = [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)];
function rigRun(def: string, stars: number, x: number, y: number, rot: number, spare: number): Run {
  const run = newRun("furnace", 5, "fam");
  run.inventory = Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def }));
  run.build = {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }, { uid: 10, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) } as Placed],
    routes: [{ factory: 1, cells: [...SHORT] }, { factory: 7, cells: [...SIDE] }],
  };
  return run;
}
interface Case { id: string; run: Run; sel: Sel; t: PanelText }
function corpus(): Case[] {
  const out: Case[] = [];
  for (const d of MODULES) for (const s of [1, 2, 3]) {
    for (const spare of [0, 1]) {
      const run = newRun("furnace", 5, "fam");
      run.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }, ...Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def: d.id }))];
      out.push({ id: `cargo ${d.id} ★${s} spare${spare}`, run, sel: { kind: "cargo", uid: 900 }, t: cargoPanel(run, 900)! });
    }
    if (d.kind === "gate") {
      const base = rigRun(d.id, s, 0, 9, 0, 0);
      const spot = d.gate?.stoke ? stokeSpots(base.build, d.id)[0] : null;
      const lays: [string, number, number, number][] = spot ? [["stoke", spot.x, spot.y, spot.rot], ["idle", 0, 9, 0]] : [["1hit", 3, 3, rotFacing(d.id, 1)], ["idle", 0, 9, 0]];
      for (const [lay, x, y, rot] of lays) {
        const run = rigRun(d.id, s, x, y, rot, 1);
        out.push({ id: `rig ${d.id} ★${s} ${lay}`, run, sel: { kind: "item", uid: 10 }, t: { ...rigPanel(run, 10)! } });
      }
    }
    if (d.kind === "factory") {
      const run = newRun("furnace", 5, "fam");
      run.build.items.push({ uid: 901, def: d.id, x: 6, y: 6, ...(s > 1 ? { stars: s } : {}) });
      run.build.routes.push({ factory: 901, cells: [56, 55, 45, 35, 25, 15, 5] });
      out.push({ id: `placed ${d.id} ★${s}`, run, sel: { kind: "item", uid: 901 }, t: itemPanel(run, 901)! });
    }
    if (d.kind === "turret") {
      const run = newRun("furnace", 5, "fam");
      setTurretList(run.build, [{ slot: 0, def: d.id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
      out.push({ id: `installed ${d.id} ★${s}`, run, sel: { kind: "turret", index: 0 }, t: turretPanel(run, 0)! });
    }
  }
  for (const d of MODULES) for (const held of fusible(d.id) ? [[], [1]] : [[]]) {
    const run = newRun("furnace", 5, "fam");
    run.gold = 99;
    run.inventory = held.map((s, i) => ({ uid: 950 + i, def: d.id, ...(s > 1 ? { stars: s } : {}) }));
    run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id} held[${held}]`, run, sel: { kind: "offer", wagon: 0, slot: 0 }, t: offerPanel(run, 0, 0)! });
  }
  return out;
}
const CASES = corpus();

/** The base's placement of every panel's head, one character a panel (CASES order): S names under the sub line, B names beside its second line, T names beside the title, x marks, - none. */
const BASE: Record<string, string> = {
  phone: "SSSSSSSSSSSSSSSTTTSSSSSSSSSSSSSSSSSSSSSSSSSSSSSTxxxxxxSSTSSTxxxSSSSSSSSSSSSxxxxxxTTTxxxxxxxxxxxxxxxSSSSSSSSSSSSSSSxxxSSSSSSSSSSTTSSSSSSTTSSTTSSTTSSTTTTTTSSTTSSTTSSTTSSSSSSTTSSTTSSTTTTTTTTTTSSSSSSTTSSTTSSSSSSSSSSSSSSSSSSTTSSTTSSxxSSxxSSxxSSTTSSTTSSTTSSSSSSTTSSTTSSTTSSTTSSTTSSTTSSTTSSTTSSxxSSxxxxxxSSTTSSxxSSxxSSSSSSTTSSTTSSSSSSTTSSTTSSTTSSTTTTTTSSSSSSTTSSTTSSTTSSxxxxxxSSTTTTTTTTTTSSSSTTSSSSTTSSSSSSSSSSSSSSSSSSSSSSSSSSSSTTSSTTTTSSTTTTSSxxxxSSxxxxSSSSTTSSSSTTSSSSTTSSSSxxSSSSTTSSSSTTSSxxxxSSxxxxSSxxxxSSTSSTxxxSSxxxxxxxSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSTSSSSSSSSSSSSSSTTSSxxxxxxSSTTSSTTSSTTSSSSSSSSSSTTSSTTSSxxSSxxSSTTSSTTSSTTSSSSSSSSSSTTSSTTSSTTSSxxSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSxxSSSSxxSSSSxxSSxxxxSSSSSSSSSSSSSSSSSSSSSSSSSTTSSSSSSSSSSSSSSSSSSTTSSTTSSTTSSTTSSxxSSSSSSTTSSTTSSTTSSTTSSTTSSTTTTTTTTTTSSTTSSTTSSTTSSTTSSTTTTTTSSTTSSTTSSTTSSTTSSTTSSTTSSSSSSTTSSTTSSTTSSTTSSTTSSTTSSTTSSTTSSTTSSTTSSxxSSSSSSTTSSTTSSTTSSTTSSxxSSSSSSTTSSTTSSTTSSTTSSTTSSTTSSTTSSxxSSTTSSTTSSxxSSTTSSTTSSTTSSTTSSxxxxxxSSSSSSSSSSTTSSSSSSSSSSSSSSSSSTSSSSSSTTxxSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSTSTSTSTSTSTSTSTSTSTSxSTSTSTSTSTSTSTSTSTSxSSSxSSSSSSSTSSSSSSSSSSSSSTSTSTSSSSSSSSSSSSSSSSSSSSSTSTSTSTSTSTSSSTSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
  desk: "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSBBSBBSBBSBBSBBSBBSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSBBSBBSBBSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSBBSBBSBBSxxSxxSxxSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSTSSSxSSSxSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSSSSSSSSSSSSSBBSSBBSSBBSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
  laptop: "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSBBSBBSBBSBBSBBSBBSSSSSSSSSSSSSSSSSSSSSSSSSSSSBBSBBSBBSBBSBBSBBSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSBBSBBSBBSxxSxxSxxSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSBBSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSTSSSxSSSxSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSBBSSSSSSSSSSSSSSBBSSBBSSBBSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
};
const BANDS = [["phone", PHONE], ["desk", DESK], ["laptop", LAPTOP]] as const;
/** The pins per view: [heads that print the explained words, heads that keep the plain names, heads that keep the marks] (names at base: phone 1,171, desk column 1,295, laptop column 1,295). */
const RUNGS: Record<string, [number, number, number]> = { phone: [939, 232, 132], desk: [1163, 132, 8], laptop: [1157, 138, 8] };

describe("PRESENT-2 W (b): the family head says what it is, by a ladder: explained words, else the plain names, else the marks", () => {
  it("the base's placement is read from the same corpus: 1,303 panels, and every panel has a code", () => {
    expect(CASES.length).toBe(1303);
    for (const [band] of BANDS) expect(BASE[band].length, band).toBe(CASES.length);
  });

  it("PER PANEL and per view: every head that printed names at base prints names still (the explained words or the plain), in the same place; marks and none stay as they were", () => {
    for (const [band, area] of BANDS) {
      const tally = [0, 0, 0];
      CASES.forEach((c, i) => {
        const fam = selFamilies(c.run, c.sel), fh = planPanel(c.t, area, fam).famHead, code = BASE[band][i], what = `${band} ${c.id} (base ${code})`;
        if (code === "-") return void expect(fh, what).toBeNull();
        expect(fh, what).not.toBeNull();
        expect(fh!.tags, what).toEqual(fam);
        if (code === "x") {
          expect(fh!.names, what).toBe(false);
          expect(fh!.explained, what).toBeUndefined();
          return void tally[2]++;
        }
        // names at base: still names, the same place
        expect(fh!.names, what).toBe(true);
        expect(fh!.at, what).toBe(code === "S" ? "sub" : code === "B" ? "sub2" : "title");
        if (fh!.explained) {
          // rung 1: the explained words fit where the plain names sat
          const w = textWidth(famHeadText(fam), "3");
          if (fh!.at === "sub") expect(w <= area.w - 27, what).toBe(true);
          else expect(w <= area.w - 4 - 23 - 6, what).toBe(true); // beside the title or the second sub line: at most the panel's width less 4, 23 and a 6 px gap
          tally[0]++;
        } else tally[1]++; // rung 2: the plain names, exactly as before
      });
      expect(tally, `${band}: explained / plain / marks`).toEqual(RUNGS[band]);
      // eslint-disable-next-line no-console
      console.log(`PRESENT-2 W (b) ${band}: ${tally[0]} heads print the explained words, ${tally[1]} keep the plain names, ${tally[2]} keep the marks (names at base ${tally[0] + tally[1]})`);
    }
  });

  it("the tap target is whatever the head prints: the whole `FORGE FAMILY` (one family), the plain name, or each name of `FAMILIES: ...`; the note's key and text are the family's", () => {
    let explainedSingle = 0, plainSingle = 0, multi = 0;
    for (const [band, area] of BANDS) {
      CASES.forEach((c) => {
        const fam = selFamilies(c.run, c.sel), plan = planPanel(c.t, area, fam), fh = plan.famHead;
        if (!fh || !fh.names) return;
        const ts = familyTargets(plan, []);
        const what = `${band} ${c.id}`;
        const text = famHeadText(fam, !!fh.explained), x0 = fh.at === "sub" ? plan.r.x + 23 : plan.r.x + plan.r.w - 4 - textWidth(text, "3");
        // every target is inside the printed words, and carries the family's key and note
        for (const t of ts) {
          expect(t.glyph.x >= x0 && t.glyph.x + t.glyph.w <= x0 + textWidth(text, "3") + 1, `${what}: the target is inside the printed words`).toBe(true);
          const tag = fam.find((f) => `${familyWord(f)} FAMILY` === t.word);
          expect(tag, `${what}: the key ${t.word}`).toBeDefined();
          expect(t.text, what).toBe(familyNote(tag!));
        }
        if (fam.length === 1 && ts.length) {
          expect(ts[0].glyph.w, `${what}: one family: the whole printed words`).toBe(textWidth(text, "3"));
          if (fh.explained) explainedSingle++; else plainSingle++;
        } else if (fam.length > 1 && ts.length === fam.length) multi++;
      });
    }
    expect(explainedSingle).toBeGreaterThan(500);
    expect(plainSingle).toBeGreaterThan(50);
    expect(multi).toBeGreaterThan(200);
  });

  it("the first-sight panels (the chain's pieces): a head the player meets with no note opened by itself, and the rung it shows on each view", () => {
    // the first-sight chain (keywords.ts nextSight) opens a BODY word's note, never a family tag's: so a family head is met with no note open on every panel that has one
    const CHAIN = ["temper", "spotter", "surge", "brake", "grapnel", "limpet", "barbed", "pressure", "hopper", "flak", "quench", "venom", "whetstone", "kiln"];
    const rows: string[] = [];
    for (const def of CHAIN) {
      const i = CASES.findIndex((c) => c.id.startsWith(`offer ${def} `));
      if (i < 0) continue;
      const c = CASES[i];
      rows.push(`${def}: ${BANDS.map(([band, area]) => {
        const fh = planPanel(c.t, area, selFamilies(c.run, c.sel)).famHead;
        return `${band} ${!fh ? "no head" : !fh.names ? "marks (rung 3)" : fh.explained ? `${famHeadText(fh.tags)} (rung 1)` : `${famHeadText(fh.tags, false)} (rung 2)`}`;
      }).join("; ")}`);
    }
    // eslint-disable-next-line no-console
    console.log(`PRESENT-2 W (b) first-sight panels:\n${rows.join("\n")}`);
    expect(rows.length).toBeGreaterThan(8);
  });
});
