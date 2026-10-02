// 0.8.0 I1 M4 (REQ-BFG-023 part 2; VERIFIED-D1 Q1; DESIGN-wave3.md 2.1 and 2.5): every module card shows its v2 family
// tags as shop hints. The seven families (src/ui/families.ts) each have a colour and a 3x3 mark of their own shape. The
// shop card draws a module's marks in a row at its bottom left (shop.ts drawCard, either face); the desk's hover tooltip
// names them in their colours (drawTooltip); the inspect panel names them in its header, or shows their marks where the
// names have no room (inspector.ts planPanel's famHead, drawn by drawFamHead), on the phone band and the desk column,
// and never moves the panel's body. Tags are hints only: nothing in play reads them.
import { describe, expect, it } from "vitest";
import { G, R, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { C } from "../src/render/palette";
import { textWidth } from "../src/render/font";
import { ITEMS, buyableModules, type ModuleTag } from "../src/sim/content";
import { key as K, rotField, setTurretList, type Placed } from "../src/sim/deck";
import { rotFacing, stokeSpots } from "../src/sim/beltside";
import { fusible } from "../src/sim/stars";
import { newRun, type Run } from "../src/game/run";
import { FAMILY, FAMILY_ORDER, drawFamilyMark, drawFamilyMarks, familiesOf, familiesText, familySpans } from "../src/ui/families";
import { CARD_MARK_X, CARD_MARK_Y, drawCard, drawTooltip, type CardState } from "../src/screens/build/shop";
import { CARD_H, CARD_W, WIDE_CARD_H, WIDE_CARD_MAX_W, buildLayout, type Sel } from "../src/screens/build/layout";
import {
  cargoPanel, detailsPlan, drawDetails, drawFamHead, itemPanel, offerPanel, planPanel, rigPanel, selFamilies, turretPanel, visibleLines,
  type PanelPlan, type PanelText,
} from "../src/screens/build/inspector";
import type { Ctx } from "../src/screens/build/actions";
import type { DuskFoe } from "../src/game/run";
import { UI } from "../src/ui/ui";
import { cardText } from "../src/ui/abilityText";

installRaster();

const MODULES = buyableModules();
const PALETTE = new Set<string>(Object.values(C));
/** DESIGN-wave3.md 2.1's seven families, in its order (VERIFIED-D1 Q1, Q2). */
const V2: ModuleTag[] = ["FORGE", "HARASS", "SWARM", "BURST", "TEMPO", "TWIN", "PLATE"];

/** The phone band (390x844), the desk column (1920x1080), the laptop column (1366x768): tests/abilityPanels.test.ts's. */
const PHONE = buildLayout(167, 361, true, 5).info;
const DESK = buildLayout(480, 270, false, 5).info;
const LAPTOP = buildLayout(455, 256, false, 5).info;

describe("the seven families and each module's tags (ui/families.ts)", () => {
  it("are DESIGN 2.1's seven, each with its own palette colour, its own 3x3 mark and a glossary sentence", () => {
    expect([...FAMILY_ORDER]).toEqual(V2);
    expect(Object.keys(FAMILY).sort()).toEqual([...V2].sort());
    for (const t of V2) {
      const f = FAMILY[t];
      expect(f.tag).toBe(t);
      expect(PALETTE.has(f.colour), `${t}'s colour`).toBe(true);
      expect(f.mark.map((r) => r.length), t).toEqual([3, 3, 3]);
      expect(f.mark.join("").replace(/[x.]/g, ""), t).toBe("");
      expect(f.mark.join("").split("x").length - 1, `${t}'s mark lights 3 or more cells`).toBeGreaterThanOrEqual(3);
      expect(f.glossary, t).toMatch(/^[A-Z0-9 ,;:.'-]+\.$/);
      expect(f.glossary).not.toContain("·");
    }
    expect(new Set(V2.map((t) => FAMILY[t].colour)).size, "seven colours").toBe(7);
    expect(new Set(V2.map((t) => FAMILY[t].mark.join("|"))).size, "seven marks").toBe(7);
    // the marks read apart in grey too (a sold card): no two share their lit cells
    expect(FAMILY.TEMPO.mark).not.toEqual(FAMILY.PLATE.mark);
  });

  it("every buyable module shows 1-3 families: its v2 tags in DESIGN 2.1's order; no other tag is left in the catalogue", () => {
    expect(MODULES.length).toBe(86);
    const counts = [0, 0, 0, 0];
    for (const d of MODULES) {
      const f = familiesOf(d.id);
      expect(f, d.id).toEqual(V2.filter((t) => (d.tags ?? []).includes(t)));
      expect(f.length, `${d.id} has a family`).toBeGreaterThanOrEqual(1);
      expect(f.length, d.id).toBeLessThanOrEqual(3);
      counts[f.length]++;
      expect(familiesText(d.id), d.id).toBe(f.join(", "));
    }
    expect(counts).toEqual([0, 31, 50, 5]);
    for (const d of Object.values(ITEMS)) for (const t of d.tags ?? []) expect(V2, `${d.id}: ${t}`).toContain(t);
    for (const id of ["zz-none", "constructor", "toString", "__proto__", "hasOwnProperty", ""]) {
      expect(familiesOf(id), id).toEqual([]);
      expect(familiesText(id), id).toBe("");
    }
  });

  it("familySpans colours each name in its family's colour and the commas in the separator", () => {
    expect(familySpans("FORGE, TEMPO", C.slate4)).toEqual([
      { t: "FORGE", c: FAMILY.FORGE.colour, whole: true }, { t: ", ", c: C.slate4 }, { t: "TEMPO", c: FAMILY.TEMPO.colour, whole: true },
    ]);
    expect(familySpans("PLATE")).toEqual([{ t: "PLATE", c: FAMILY.PLATE.colour, whole: true }]);
  });

  it("drawFamilyMarks draws each mark's lit cells in its colour, 4 px apart (grey when dim), and returns the row's width", () => {
    for (const d of MODULES) for (const dim of [false, true]) {
      const c = fresh(20, 6);
      const w = drawFamilyMarks(G(c), d.id, 2, 1, dim);
      const f = familiesOf(d.id);
      expect(w, d.id).toBe(f.length * 4 - 1);
      for (let i = 0; i < 20; i++) for (let j = 0; j < 6; j++) {
        const k = i - 2, m = Math.floor(k / 4), u = k % 4, v = j - 1;
        const lit = k >= 0 && m < f.length && u < 3 && v >= 0 && v < 3 && FAMILY[f[m]].mark[v][u] === "x";
        expect(c.at(i, j), `${d.id} ${dim ? "dim " : ""}(${i},${j})`).toBe(lit ? (dim ? C.slate1 : FAMILY[f[m]].colour) : null);
      }
    }
    const one = fresh(5, 5);
    drawFamilyMark(G(one), "TWIN", 1, 1);
    expect(one.px.filter((p) => p === FAMILY.TWIN.colour).length).toBe(6);
  });
});

// ------------------------------------------------------------------------------------------------------- the card

const STATE: CardState = { sold: false, affordable: true, selected: false, hover: false, pulse: false, hidden: false, shake: 0, badge: null };
const OX = 3, OY = 4; // the card's top-left in the raster

function card(id: string, wide: boolean, s: Partial<CardState> = {}): RasterCanvas {
  const d = ITEMS[id];
  const r = { x: OX, y: OY, w: wide ? WIDE_CARD_MAX_W : CARD_W, h: wide ? WIDE_CARD_H : CARD_H };
  const c = fresh(r.x + r.w + 4, r.y + r.h + 4);
  drawCard(G(c), r, d, d.price, d.merchant!, { ...STATE, ...(wide ? { effect: cardText(id) } : {}), ...s }, 0);
  return c;
}

describe("the shop card shows the module's family marks (REQ-BFG-023 acceptance 2: its card shows its tags)", () => {
  it("in a row at the bottom left of either face, in their colours (grey when sold), with nothing else drawn on or between them", () => {
    for (const d of MODULES) for (const wide of [false, true]) for (const s of [{}, { sold: true }, { badge: { kind: "merge", toStars: 2 } as CardState["badge"] }]) {
      const c = card(d.id, wide, s);
      const f = familiesOf(d.id), sold = "sold" in s;
      const face = sold ? C.night : C.slate0;
      const what = `${d.id} ${wide ? "wide" : "narrow"} ${JSON.stringify(s)}`;
      // the row's own three lines, from 1 px left of the first mark to 1 px right of the last
      for (let i = CARD_MARK_X - 1; i <= CARD_MARK_X + 4 * f.length - 1; i++) for (let v = 0; v < 3; v++) {
        const k = i - CARD_MARK_X, m = Math.floor(k / 4), u = k - 4 * m;
        const lit = k >= 0 && m < f.length && u < 3 && FAMILY[f[m]].mark[v][u] === "x";
        expect(c.at(OX + i, OY + CARD_MARK_Y + v), `${what} (${i},${CARD_MARK_Y + v})`).toBe(lit ? (sold ? C.slate1 : FAMILY[f[m]].colour) : face);
      }
      // the narrow face also keeps a free line above and below the row (the name ends above it, the price is to its right)
      if (!wide) for (const v of [-1, 3]) for (let i = CARD_MARK_X - 1; i <= CARD_MARK_X + 4 * f.length - 1; i++) {
        expect(c.at(OX + i, OY + CARD_MARK_Y + v), `${what} (${i},${CARD_MARK_Y + v})`).toBe(face);
      }
    }
  });

  it("a card without families would draw nothing there: the marks are the only pixels of the row (an unknown def)", () => {
    const fake = { ...ITEMS.whetstone, id: "zz-none" };
    const c = fresh(60, 60);
    drawCard(G(c), { x: OX, y: OY, w: CARD_W, h: CARD_H }, fake, fake.price, fake.merchant!, STATE, 0);
    for (let i = CARD_MARK_X - 1; i < CARD_MARK_X + 12; i++) for (let v = -1; v <= 3; v++) expect(c.at(OX + i, OY + CARD_MARK_Y + v)).toBe(C.slate0);
  });
});

describe("the desk's hover tooltip names the families, each in its colour, under the module's kind", () => {
  it("a line of names at y+21, the ability lines 7 px lower, the box 7 px taller", () => {
    for (const id of ["whetstone", "stoker", "twinmould", "overclocker", "anvil", "seamwelder"]) {
      const d = ITEMS[id], f = familiesOf(id);
      const r = { x: 40, y: 2, w: CARD_W, h: CARD_H };
      const c = fresh(260, 120);
      drawTooltip(G(c), r, d, 260, "A SENTENCE.");
      const y = r.y + r.h + 4;
      // the names, left to right in the family order, in the family colours, on the 5 rows from y+21
      const seen: string[] = [];
      for (let i = 0; i < 260; i++) for (let j = y + 21; j < y + 26; j++) {
        const p = c.at(i, j);
        const t = V2.find((x) => FAMILY[x].colour === p);
        if (t && seen[seen.length - 1] !== t) seen.push(t);
      }
      expect(seen, id).toEqual(f);
      expect(textWidth(familiesText(id), "3")).toBeGreaterThan(0);
      // the ability line moved down a row: nothing of the bone text on the names' rows
      for (let i = 0; i < 260; i++) for (let j = y + 21; j < y + 26; j++) expect(c.at(i, j) === C.bone, `${id} (${i},${j})`).toBe(false);
      let bone = false;
      for (let i = 0; i < 260; i++) for (let j = y + 28; j < y + 33; j++) if (c.at(i, j) === C.bone) bone = true;
      expect(bone, `${id}: the sentence at y+28`).toBe(true);
    }
  });
});

// -------------------------------------------------------------------------------------------------- the panel header

const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const SIDE = [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)];
/** A Furnace with the Kiln's belt up column 4 and a STAMP PRESS belt up column 6 (tests/abilityPanels.test.ts rigRun);
 *  rig `def` (uid 10, ★stars) at (x, y) turned `rot`, `spare` ★1 copies of it in cargo. */
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

/** Panels that show a module, each with the selection drawDetails gets (selFamilies reads it). */
function corpus(): Case[] {
  const out: Case[] = [];
  for (const d of MODULES) for (const s of [1, 2, 3]) {
    // in cargo (and a spare copy: the merge progress line)
    for (const spare of [0, 1]) {
      const run = newRun("furnace", 5, "fam");
      run.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }, ...Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def: d.id }))];
      out.push({ id: `cargo ${d.id} ★${s} spare${spare}`, run, sel: { kind: "cargo", uid: 900 }, t: cargoPanel(run, 900)! });
    }
    if (d.kind === "gate") {
      const base = rigRun(d.id, s, 0, 9, 0, 0);
      const spot = d.gate?.stoke ? stokeSpots(base.build, d.id)[0] : null;
      const lays: [string, number, number, number][] = spot ? [["stoke", spot.x, spot.y, spot.rot], ["idle", 0, 9, 0]]
        : [["1hit", 3, 3, rotFacing(d.id, 1)], ["idle", 0, 9, 0]];
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

interface Box { x: number; y: number; w: number; h: number; what: string }
const meets = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The famHead's box as drawFamHead draws it. */
function famBox(plan: PanelPlan): Box | null {
  const fh = plan.famHead, r = plan.r;
  if (!fh) return null;
  if (fh.names) {
    const w = textWidth(fh.tags.join(", "), "3");
    return fh.at === "sub" ? { x: r.x + 23, y: r.y + 19, w, h: 5, what: "names" } : { x: r.x + r.w - 4 - w, y: r.y + (fh.at === "sub2" ? 19 : 5), w, h: 5, what: "names" };
  }
  const w = fh.tags.length * 4 - 1;
  return { x: fh.at === "sub" ? r.x + 23 : r.x + r.w - 4 - w, y: r.y + (fh.at === "title" ? 6 : 20), w, h: 3, what: "marks" };
}

/** Everything else drawDetails draws in the panel's header and above its body: the icon box, the title (font 5 with its
 *  outline, or cut in font 3), the sub line(s) or header text, the portrait buttons, the column's buttons and the body. */
function headBoxes(t: PanelText, plan: PanelPlan): Box[] {
  const r = plan.r, out: Box[] = [{ x: r.x + 4, y: r.y + 4, w: 16, h: 16, what: "icon box" }];
  const tw = textWidth(t.title) <= plan.subMax ? textWidth(t.title) + 2 : Math.min(textWidth(t.title, "3"), plan.subMax) + 2;
  out.push({ x: r.x + 22, y: r.y + 3, w: tw, h: textWidth(t.title) <= plan.subMax ? 9 : 7, what: "title" });
  const subs = plan.headerOnly ? plan.headerOnly.lines : plan.body.sub ? [plan.body.sub] : plan.subs.length > 1 ? plan.subs
    : [t.subShort && textWidth(t.sub, "3") > plan.subMax ? t.subShort : t.sub];
  subs.forEach((s, i) => out.push({ x: r.x + 23, y: r.y + 13 + i * 6, w: Math.min(textWidth(s, "3"), i === 0 ? plan.subMax : r.w - 27), h: 5, what: `sub ${i}` }));
  for (const b of plan.rects ?? []) out.push({ ...b, what: "button" });
  if (plan.column && t.labels.length) out.push({ x: r.x + 5, y: r.y + r.h - 5 - t.labels.length * 19 + 3, w: r.w - 10, h: t.labels.length * 19, what: "buttons" });
  const lines = visibleLines(plan);
  if (lines.length) out.push({ x: r.x + 5, y: lines[0].y, w: r.w - 10, h: lines[lines.length - 1].y + 7 - lines[0].y, what: "body" });
  return out;
}

describe("the inspect panel names the families in its header (REQ-BFG-023: in the inspect view), on the phone and the desk", () => {
  it("selFamilies gives the shown module's families for an offer, a part in cargo, a placed rig or factory and a turret; none for a belt", () => {
    for (const c of CASES) {
      const def = c.id.split(" ")[1];
      expect(selFamilies(c.run, c.sel), c.id).toEqual(familiesOf(def));
    }
    const run = rigRun("whetstone", 1, 3, 3, 1, 0);
    // an offer in another wagon and slot: its own module's
    run.shop.wagons = [
      { merchant: "ironmonger", offers: [{ def: "whetstone", price: 3, sold: false }] },
      { merchant: "tinker", offers: [{ def: "whetstone", price: 3, sold: false }, { def: "grease", price: 3, sold: false }, { def: "stoker", price: 5, sold: false }] },
    ] as Run["shop"]["wagons"];
    expect(selFamilies(run, { kind: "offer", wagon: 1, slot: 2 })).toEqual(familiesOf("stoker"));
    expect(familiesOf("stoker")).not.toEqual(familiesOf("whetstone"));
    expect(selFamilies(run, { kind: "offer", wagon: 2, slot: 0 })).toEqual([]);
    expect(selFamilies(run, { kind: "route", index: 0 })).toEqual([]);
    expect(selFamilies(run, { kind: "none" })).toEqual([]);
    expect(selFamilies(run, { kind: "item", uid: 1 })).toEqual(familiesOf("kiln")); // the hero's signature: none
    expect(familiesOf("kiln")).toEqual([]);
    expect(selFamilies(run, { kind: "cargo", uid: 4242 })).toEqual([]);
  });

  it("the body is planned exactly as without them, and the families never touch the title, sub lines, buttons, icon or body", () => {
    let n = 0;
    // each panel as drawn, and without its buttons (the desk's hover preview has none: the title row is free)
    const forms = CASES.flatMap((c) => [c, { ...c, id: `${c.id} (no buttons)`, t: { ...c.t, labels: [] } }]);
    for (const c of forms) for (const [band, area] of [["phone", PHONE], ["desk", DESK], ["laptop", LAPTOP]] as const) {
      const fam = selFamilies(c.run, c.sel);
      const p = planPanel(c.t, area, fam), q = planPanel(c.t, area);
      const what = `${c.id} on the ${band}`;
      expect(JSON.stringify({ ...p, famHead: null }), what).toBe(JSON.stringify({ ...q, famHead: null }));
      expect(q.famHead, what).toBeNull();
      const fb = famBox(p);
      if (!fb) continue;
      n++;
      expect(p.famHead!.tags, what).toEqual(fam);
      // inside the panel, 4 px in from its right edge; 1 px clear of everything else in the header and of the body
      expect(fb.x >= p.r.x + 4 && fb.x + fb.w <= p.r.x + p.r.w - 4 && fb.y >= p.r.y + 4, what).toBe(true);
      const ring: Box = { x: fb.x - 1, y: fb.y - 1, w: fb.w + 2, h: fb.h + 2, what: "families" };
      for (const b of headBoxes(c.t, p)) expect(meets(ring, b), `${what}: the families (${JSON.stringify(p.famHead)}) meet the ${b.what}`).toBe(false);
      // marks only where the names have no room: beside the title they'd run into it, and under the sub line the body
      // starts a row higher (tight) or they are too wide
      const namesW = textWidth(fam.join(", "), "3");
      if (!p.famHead!.names && p.famHead!.at === "title") expect(23 + textWidth(c.t.title) + 6 + namesW > area.w - 4, what).toBe(true);
      if (!p.famHead!.names && p.famHead!.at === "sub") {
        expect(p.body.tight || namesW > area.w - 27, what).toBe(true);
        // ... and the title row has no room for them either (a button there, or the title too long)
        const titleFree = p.column || !c.t.labels.length || p.shift > 0;
        expect(!titleFree || 23 + textWidth(c.t.title) + 6 + namesW > area.w - 4, what).toBe(true);
      }
      if (p.famHead!.names && p.famHead!.at === "title") expect(23 + textWidth(c.t.title) + 6 + namesW <= area.w - 4, what).toBe(true);
    }
    expect(n).toBeGreaterThan(forms.length * 2.9);
  });

  it("where they go: named on nearly every panel, as marks on the rest (pinned); the phone's tap preview names them", () => {
    const tally: Record<string, Record<string, number>> = { phone: {}, desk: {}, laptop: {} };
    for (const c of CASES) for (const [band, area] of [["phone", PHONE], ["desk", DESK], ["laptop", LAPTOP]] as const) {
      const fh = planPanel(c.t, area, selFamilies(c.run, c.sel)).famHead;
      const where = !fh ? "none" : `${fh.names ? "names" : "marks"} ${fh.at}`;
      tally[band][where] = (tally[band][where] ?? 0) + 1;
      if (!fh && process.env.BB_TABLES) console.log(`none: ${band} ${c.id}`);
      const kind = c.id.split(" ")[0];
      tally[band][`${kind}: ${where}`] = (tally[band][`${kind}: ${where}`] ?? 0) + 1;
    }
    if (process.env.BB_TABLES) console.log(JSON.stringify(tally, null, 1));
    const share = (band: string, what: RegExp) =>
      Object.entries(tally[band]).filter(([k]) => !k.includes(":") && what.test(k)).reduce((s, [, v]) => s + v, 0) / CASES.length;
    expect(share("desk", /^names/), "desk: named").toBeGreaterThanOrEqual(0.97);
    expect(share("laptop", /^names/), "laptop: named").toBeGreaterThanOrEqual(0.9);
    expect(share("phone", /^names/), "phone: named").toBeGreaterThanOrEqual(0.85);
    expect(share("phone", /^none$/) + share("desk", /^none$/) + share("laptop", /^none$/), "nowhere").toBeLessThanOrEqual(0.01);
    expect(tally.phone["offer: none"] ?? 0, "the phone's tap preview").toBe(0);
    expect(tally.desk["offer: none"] ?? 0).toBe(0);
  });

  it("drawDetails, the build screen's panel, plans with the shown module's families and draws them where planned", () => {
    const ctxOf = (run: Run): Ctx => ({ game: { ui: new UI(), t: 0 }, run } as unknown as Ctx);
    let named = 0, marked = 0;
    for (const c of CASES.filter((_, i) => i % 7 === 0)) for (const area of [PHONE, DESK]) {
      const d = detailsPlan(ctxOf(c.run), c.sel, null, area)!;
      expect(d, c.id).not.toBeNull();
      expect(d.plan.famHead?.tags ?? familiesOf(c.id.split(" ")[1]), c.id).toEqual(familiesOf(c.id.split(" ")[1]));
      if (!d.plan.famHead) continue;
      const W = area.x + area.w + 4, H = area.y + area.h + 4;
      const alone = fresh(W, H), full = fresh(W, H);
      drawFamHead(G(alone), d.plan);
      drawDetails(G(full), ctxOf(c.run), c.sel, null, area, {} as DuskFoe);
      let n = 0;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const p = alone.at(i, j);
        if (p === null) continue;
        n++;
        expect(full.at(i, j), `${c.id}: the families at (${i},${j})`).toBe(p);
      }
      expect(n, c.id).toBeGreaterThan(0);
      if (d.plan.famHead.names) named++; else marked++;
    }
    expect(named).toBeGreaterThan(50);
    expect(marked).toBeGreaterThan(0);
    // the hovered offer (the desk's tap preview) too
    const run = newRun("furnace", 5, "fam");
    run.shop.wagons = [{ merchant: "tinker", offers: [{ def: "stoker", price: 5, sold: false }] }] as Run["shop"]["wagons"];
    const h = detailsPlan(ctxOf(run), { kind: "none" }, { wagon: 0, slot: 0 }, DESK)!;
    expect(h.plan.famHead?.tags).toEqual(familiesOf("stoker"));
  });

  it("drawFamHead draws the names in their colours where planned, or the marks; nothing without a famHead", () => {
    const r = { x: 2, y: 2, w: 150, h: 60 };
    const draw = (famHead: PanelPlan["famHead"]): RasterCanvas => { const c = fresh(160, 70); drawFamHead(G(c), { r, famHead }); return c; };
    expect(draw(null).px.every((p) => p === null)).toBe(true);
    const sub = draw({ at: "sub", tags: ["FORGE", "TEMPO"], names: true });
    const cols = (c: RasterCanvas, y0: number, h: number) => {
      const xs: Record<string, number[]> = {};
      for (let i = 0; i < 160; i++) for (let j = y0; j < y0 + h; j++) { const p = c.at(i, j); if (p) (xs[p] ??= []).push(i); }
      return xs;
    };
    const s = cols(sub, r.y + 19, 5);
    expect(Math.min(...s[FAMILY.FORGE.colour])).toBe(r.x + 23);
    expect(Math.max(...s[FAMILY.FORGE.colour])).toBeLessThan(Math.min(...s[C.slate4]));
    expect(Math.max(...s[C.slate4])).toBeLessThan(Math.min(...s[FAMILY.TEMPO.colour]));
    expect(sub.px.filter((p) => p !== null).length).toBe(Object.values(s).reduce((a, v) => a + v.length, 0)); // only those rows
    for (const [at, y] of [["title", r.y + 5], ["sub2", r.y + 19]] as const) {
      const c = draw({ at, tags: ["PLATE"], names: true });
      const xs = cols(c, y, 5)[FAMILY.PLATE.colour];
      expect(Math.max(...xs), at).toBe(r.x + r.w - 5); // right-aligned 4 px in
      expect(Math.min(...xs), at).toBe(r.x + r.w - 4 - textWidth("PLATE", "3"));
    }
    for (const [at, x, y] of [["title", r.x + r.w - 4 - 7, r.y + 6], ["sub2", r.x + r.w - 4 - 7, r.y + 20], ["sub", r.x + 23, r.y + 20]] as const) {
      const c = draw({ at, tags: ["SWARM", "TWIN"], names: false });
      const want = fresh(160, 70);
      drawFamilyMark(G(want), "SWARM", x, y);
      drawFamilyMark(G(want), "TWIN", x + 4, y);
      expect(c.px.join(), at).toBe(want.px.join());
    }
  });
});

// keep R in use for the raster's typing (sprites drawn into cards are RasterCanvases)
void R;
