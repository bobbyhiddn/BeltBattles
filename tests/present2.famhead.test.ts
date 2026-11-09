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
/** STAGE-09141 (POLISH-1 P5a's ★1 star meets PRESENT-2's pin; cap, RULING-STAGE09141-R1): the 33 panel-views whose head POLISH-1's P5a (` ★` after a one-star part's panel title, inspector.ts titled) moved against BASE (the placement before PRESENT-2, without P5a: kept as it is
 *  above). Key `"<band> <CASES index>"`, value the new code (`x` marks, `S` / `B` / `T` the place of the names); each entry's trail is its case id and BASE code. Phone 32 (16 go to `x`, 16 change place),
 *  laptop 1 (to `x`: rig STOKER), desk 0; every one a ★1 panel whose title ends in " ★". Measured at T by a throwaway probe (kit09141/famprobe09141.mjs, never committed). The names yield to the star by
 *  PRESENT-2's own ladder (the marks rung is for a line too short for the words; the marks stay tappable and open the family's note). POLISH-2's title rule may give the names back: the table then shrinks. */
const P5A_STAR1: Record<string, string> = {
  // POLISH-3 (REQ-BFG-089; Q5, cap's ruling D): the NARROW step (inspector.ts portraitButtons: on a band under 176 px a lone trailing star does not move the buttons, and fitTitle steps the title down
  // to the 3x5 face) gives 26 of the 33 phone panels their names back, in BASE's place (S): the table shrinks to the 7 whose names the star still pushes out to marks (their titles are wider than the
  // band holds even in the 3x5 face, or the names have no other place): phone 6 and the laptop's STOKER. (Was 33 entries: phone 32, laptop 1.)
  // POLISH-4 (REQ-BFG-089; P4-5, cap's ruling 4): the family head's new rung `sub1` (inspector.ts planOnce bySub1, code `1`): the names right-aligned on the sub line's FIRST row, where that row is free (the buttons are under the sub, or a column
  // sub is on two rows), for a title that ends in ` ★`, after the three name places and before the marks. 8 of the 14 entries below go from `x` to `1`; 6 stay marks (their subs are 81-92 px: phone 299, 1088, 1168, 1182, 1184, 1244 --
  // tappable, they open the family's note); 5 more ★1 panels that were marks at BASE too (phone 92, 228, 288, 1097, 1098) print names by it and are added with the new code. 14 -> 19 entries.
  "phone 47": "1", // placed assembly ★1 (BASE T): `SWARM, TEMPO` beside `FACTORY · BELTS 1/2`
  "phone 81": "1", // cargo frostbite ★1 spare0 (BASE T): `HARASS`
  "phone 82": "1", // cargo frostbite ★1 spare1 (BASE T)
  "phone 83": "1", // placed frostbite ★1 (BASE T): `HARASS FAMILY`
  "phone 92": "1", // placed dragchain ★1 (BASE x)
  "phone 228": "1", // rig surge ★1 idle (BASE x)
  "phone 288": "1", // rig overclocker ★1 idle (BASE x)
  "phone 299": "x", // rig keg ★1 1hit (BASE T): the sub `RIG · 1 HIT` leaves no room
  "phone 300": "1", // rig keg ★1 idle (BASE T): `FORGE, BURST, TEMPO` beside `RIG · IDLE`
  // POLISH-3 (REQ-BFG-089; Q4, cap's ruling E): the shop OFFER's title carries its star at ★1 too (inspector.ts offerPanel: `NAME ★`, as every other panel's); with Q5's narrow step 7 of the offers still lose their
  // names to marks on this band (all T -> x: a ★1 title wider than the band holds in the 3x5 face; 23 offers moved by the star alone, 16 of them are back in place with the narrow step)
  "phone 1088": "x", // offer assembly held[1] (BASE T)
  "phone 1095": "1", // offer frostbite held[] (BASE T)
  "phone 1096": "1", // offer frostbite held[1] (BASE T)
  "phone 1097": "1", // offer dragchain held[] (BASE x)
  "phone 1098": "1", // offer dragchain held[1] (BASE x)
  "phone 1168": "x", // offer gatling held[1] (BASE T)
  "phone 1182": "x", // offer capacitor held[1] (BASE T)
  "phone 1184": "x", // offer compound held[1] (BASE T)
  "phone 1244": "x", // offer spallcatcher held[1] (BASE T)
  "laptop 692": "1", // rig stoker ★1 stoke (BASE T): `SWARM, TEMPO` beside `RIG ·`, the sub's first row
};
const BANDS = [["phone", PHONE], ["desk", DESK], ["laptop", LAPTOP]] as const;
/** The pins per view: [heads that print the explained words, heads that keep the plain names, heads that keep the marks] (names at base: phone 1,171, desk column 1,295, laptop column 1,295).
 *  STAGE-09141 (POLISH-1 P5a's ★1 star meets PRESENT-2's pin; cap, RULING-STAGE09141-R1): the phone was [939, 232, 132] (names 1,171) and is [909, 246, 148] (names 1,155: marks 132 -> 148); the laptop was [1157, 138, 8] (names 1,295) and is [1157, 137, 9] (names 1,294: marks 8 -> 9); the desk is unchanged.
 *  POLISH-3 (Q5, the narrow step; Q4, the offers' star): the phone is [923, 235, 145] (names 1,158; marks 148 -> 145: the narrow step alone read [927, 238, 138]); the desk and the laptop are as above. */
// POLISH-4 (P4-5, the `sub1` rung): the phone is [926, 244, 133] (names 1,170: marks 145 -> 133, 12 panels back to names) and the laptop [1157, 138, 8] (STOKER back to names); the desk is as above.
const RUNGS: Record<string, [number, number, number]> = { phone: [926, 244, 133], desk: [1163, 132, 8], laptop: [1157, 138, 8] };

describe("PRESENT-2 W (b): the family head says what it is, by a ladder: explained words, else the plain names, else the marks", () => {
  it("the base's placement is read from the same corpus: 1,303 panels, and every panel has a code", () => {
    expect(CASES.length).toBe(1303);
    for (const [band] of BANDS) expect(BASE[band].length, band).toBe(CASES.length);
    // STAGE-09141 (POLISH-1 P5a's ★1 star meets PRESENT-2's pin; cap, RULING-STAGE09141-R1): the table is exactly the panels the star moved: phone 32, laptop 1, desk 0; each is a ★1 panel whose title ends in " ★", and its code differs from BASE's
    const moved: Record<string, number> = { phone: 0, desk: 0, laptop: 0 };
    for (const key of Object.keys(P5A_STAR1)) {
      const [band, idx] = key.split(" "), c = CASES[Number(idx)];
      moved[band]++;
      expect(c.id, key).toMatch(/★1|^offer /); // POLISH-3 (Q4): a shop offer is drawn at ★1 and its title ends in " ★" too
      expect(c.t.title.endsWith(" ★"), `${key} ${c.id}: its title ends in the star`).toBe(true);
      expect(P5A_STAR1[key], key).not.toBe(BASE[band][Number(idx)]);
    }
    expect(moved).toEqual({ phone: 18, desk: 0, laptop: 1 }); // POLISH-3 (Q5, the narrow step; Q4, the offers' star): was { phone: 32, desk: 0, laptop: 1 }; POLISH-4 (P4-5, the `sub1` rung): phone 13 -> 18 (5 panels that were marks at BASE print names), laptop 1
  });

  it("PER PANEL and per view: every head that printed names at base prints names still (the explained words or the plain), in the same place; marks and none stay as they were", () => {
    for (const [band, area] of BANDS) {
      const tally = [0, 0, 0];
      CASES.forEach((c, i) => {
        const fam = selFamilies(c.run, c.sel), fh = planPanel(c.t, area, fam).famHead, code = P5A_STAR1[`${band} ${i}`] ?? BASE[band][i] /* STAGE-09141: the 33 panels POLISH-1's P5a moved (RULING-STAGE09141-R1) */, what = `${band} ${c.id} (base ${code})`;
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
        expect(fh!.at, what).toBe(code === "S" ? "sub" : code === "B" ? "sub2" : code === "1" ? "sub1" : "title"); // POLISH-4 (P4-5): `1` = the sub line's first row
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
