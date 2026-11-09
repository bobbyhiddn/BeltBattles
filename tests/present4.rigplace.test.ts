// PRESENT-4 T (REQ-BFG-087, REQ-BFG-004; STAGE-0915's F10; cap's call): the first-run rig sentence's box clears the deck on a phone (src/screens/build/keywords.ts rigPlace, rigAhead, rigRowsEnd; inspector.ts drawDetails).
//  Before: on a phone's band panel the sentence `EACH ARROW THAT POINTS AT A BELT TILE GIVES ITS STATS TO EVERY SLUG ON THAT TILE. ONE ARROW, ONE HIT.` went just under the panel and its how-to strip
//  (rigTipRect): 546 of 546 boxes covered a deck cell on every one of the five phone views in the first-run state (every tip new: the strip says DRAG IT ONTO THAT DECK), and on 390x660 with the tips done too.
//  Now, chosen once from the box's first frame and never moved: (1) inside the panel's own body, under its last row, 2 px clear of it and of the panel's edge; else (2) the strip yields (not drawn from the
//  box's first frame, back when it closes) and the box takes the strip's place, if it then covers no deck cell (with no strip this open: the panel's foot, only where rigTipRect's place covers a deck cell);
//  else (3) rigTipRect's place (listed: none). The desk's and the landscape column's place (beside the panel) is untouched. The harness is tests/present3.firstrun.test.ts's (the five phone views).
import { describe, expect, it } from "vitest";
import { newRun } from "../src/game/run";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { UI, type Rect } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, phoneBarLift, phoneScreen, panelArea, screenRect, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { DECK } from "../src/render/frame";
import { C } from "../src/render/palette";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import type { Run, DuskFoe } from "../src/game/run";
import { setTipsForTests } from "../src/ui/tips";
import { buyableModules } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { RIG_SENTENCE } from "../src/ui/faces";
import { key as KEY, rotField, type Placed } from "../src/sim/deck";
import { detailsPlan, drawDetails, hintStrip, panelFit, visibleLines } from "../src/screens/build/inspector";
import { SIGHT_REGION, keywordState, keywordsIdle, keywordsPressed, rigPlace, rigRowsEnd, rigTipRect } from "../src/screens/build/keywords";
import type { Ctx } from "../src/screens/build/actions";

installRaster();

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it (tests/card2.test.ts's framed). */
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const fake = { run: { build: { runes: Array.from({ length: runes }, () => ({ id: "many_hands" })) } }, refit: false, offers: () => Array.from({ length: offers }) } as unknown as Parameters<typeof runeRowFits>[0];
  let S = buildScale(pw, ph, portrait, dpr);
  while (S > 1 && !runeRowFits(fake, pw, ph, portrait, S, dpr)) S--;
  const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
  const v = { scale: S, dpr }, W = Math.floor(pw / S), H = Math.floor(ph / S);
  const lay = (unit: number) => {
    const row = runeRowH(v, runes), lift = phone ? phoneBarLift(W, H, offers, tap, runeRowH(v, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, offers, phone, tap, lift, { scale: S, unit }), row, H);
  };
  const Z = lay(1).cam.z, unit = gcd(S, Z), sub = S / unit;
  return { S, W, H, L: lay(unit), tap, phone, portrait, view: { W, H, scale: S, dpr, portrait, sub } };
}
/** The five phone views the rulings name: [label, w, h, dpr, runes held]. */
const VIEWS: [string, number, number, number, number][] = [
  ["op-402x690, no rune", 402, 690, 3, 0], ["op-402x690, a rune", 402, 690, 3, 1], ["phone-390x844", 390, 844, 3, 1],
  ["phone-390x660", 390, 660, 3, 1], ["iphone15pm-430x739", 430, 739, 3, 1],
];
const ov = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** A build screen's panel context (tests/card3.test.ts's panelCtx), with the area planned for every frame as BuildScreen.panelArea does. */
function panelCtx(run: Run, sel: Sel, f: ReturnType<typeof framed>, touch: boolean) {
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const areaNow = (): Rect => panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  const draw = () => {
    const ui = (ctx.game as unknown as { ui: UI }).ui;
    ui.pointer.kind = touch ? "touch" : "mouse";
    Object.assign(ui.pointer, { x: -1, y: -1, down: false });
    const area = areaNow();
    ui.begin();
    const cv = fresh(f.W, f.H);
    drawDetails(gOf(cv), ctx, sel, null, area, {} as DuskFoe);
    ui.end();
    return { ui, area, d: detailsPlan(ctx, sel, null, area), cv };
  };
  return { ctx, draw, areaNow };
}
const CARGO: Sel = { kind: "cargo", uid: 900 };
const SHORTB = [KEY(4, 5), KEY(4, 4), KEY(4, 3), KEY(4, 2), KEY(4, 1), KEY(4, 0)];
const rigAt = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed => ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
function furnaceRun(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "card4-panels");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORTB] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 2;
  return run;
}
/** Every rig panel a finger can open: a gate in an offer, in cargo (each star) and placed (three places): 546 panels. */
function rigPanels(): { id: string; run: Run; sel: Sel }[] {
  const out: { id: string; run: Run; sel: Sel }[] = [];
  const OFFER: Sel = { kind: "offer", wagon: 0, slot: 0 };
  for (const d of buyableModules()) {
    if (d.kind !== "gate") continue;
    const stars = fusible(d.id) ? [1, 2, 3] : [1];
    const o = furnaceRun();
    o.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id}`, run: o, sel: OFFER });
    for (const s of stars) {
      const c = furnaceRun();
      c.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
      out.push({ id: `cargo ${d.id} ★${s}`, run: c, sel: CARGO });
      for (const [x, y, rot] of [[3, 3, 1], [0, 9, 0], [5, 3, 0]] as const) out.push({ id: `${d.id} ★${s} @${x},${y}`, run: furnaceRun([rigAt(10, d.id, x, y, rot, s)]), sel: { kind: "item", uid: 10 } });
    }
  }
  return out;
}
const deckOf = (L: BuildLayout): Rect => screenRect(L, { x: L.frame.dx, y: L.frame.dy, w: DECK, h: DECK });
const shopRects = (f: ReturnType<typeof framed>): Rect[] => [...(f.L.cards ?? []), f.L.reroll, ...(f.L.packs ?? [])].filter((q): q is Rect => !!q);
const stripDrawn = (cv: ReturnType<typeof fresh>, strip: Rect): boolean => cv.at(strip.x + 1, strip.y + 1) === C.night;
const sightBox = (ui: UI): Rect | null => ui.regions.find((q) => q.id === SIGHT_REGION)?.r ?? null;
const BIG = 3_600_000;

/** [inside, strip, today] per view, tips new (the first-run state: the how-to strip under the panel) and tips done (only the first sight is left). At present4-base: today 546 on every view, and 546 over a deck cell on
 *  all five with the tips new, on 390x660 alone with the tips done. */
const PLACES: Record<string, Record<string, [number, number, number]>> = {
  new: { "op-402x690, no rune": [444, 102, 0], "op-402x690, a rune": [0, 546, 0], "phone-390x844": [546, 0, 0], "phone-390x660": [120, 426, 0], "iphone15pm-430x739": [528, 18, 0] },
  sight: { "op-402x690, no rune": [444, 0, 102], "op-402x690, a rune": [0, 0, 546], "phone-390x844": [546, 0, 0], "phone-390x660": [120, 426, 0], "iphone15pm-430x739": [528, 0, 18] },
};
const OVER_DECK_BEFORE: Record<string, Record<string, number>> = {
  new: { "op-402x690, no rune": 546, "op-402x690, a rune": 546, "phone-390x844": 546, "phone-390x660": 546, "iphone15pm-430x739": 546 },
  sight: { "op-402x690, no rune": 0, "op-402x690, a rune": 0, "phone-390x844": 0, "phone-390x660": 546, "iphone15pm-430x739": 0 },
};

describe("PRESENT-4 T: the first-run rig sentence's box clears the deck on a phone", () => {
  for (const mode of ["new", "sight"] as const) for (const [name, w, h, dpr, runes] of VIEWS) it(`${mode === "new" ? "every tip new" : "tips done"}, ${name}: the sentence's box covers 0 deck cells (before: ${OVER_DECK_BEFORE[mode][name]} of 546), nothing it must not cover, and sits where cap's order puts it`, () => {
    const f = framed(w, h, dpr, runes), deck = deckOf(f.L), deckTop = Math.floor(deck.y);
    const by = { inside: 0, strip: 0, today: 0 };
    let n = 0, onDeck = 0, stripOn = 0;
    const bad: string[] = [];
    for (const p of rigPanels()) {
      setTipsForTests(mode);
      const pc = panelCtx(p.run, p.sel, f, true);
      const fr = pc.draw();
      const box = sightBox(fr.ui), st = keywordState(pc.ctx);
      if (!fr.d || !box) { keywordsIdle(pc.ctx); continue; }
      const at = st!.rigAt!;
      n++;
      by[at.place]++;
      expect(at.box, `${p.id}: the region is the placed box`).toEqual(box);
      const plan = fr.d.plan, r = plan.r, strip = fr.d.hint ? hintStrip(fr.d.hint, r, f.H).r : null;
      const rows = visibleLines(plan).filter((v) => v.line !== "rule").map((v) => ({ y: v.y, h: (v.line as unknown as { font: string }).font === "5" ? 7 : 5 }));
      const rowsEnd = Math.max(plan.y, ...rows.map((q) => q.y + q.h));
      if (ov(box, deck)) { onDeck++; bad.push(`${p.id}: the box y ${box.y}-${box.y + box.h} covers the deck (top ${deck.y})`); }
      if (shopRects(f).some((q) => ov(box, q))) bad.push(`${p.id}: over a shop card, REROLL or a pack`);
      if (ov(box, f.L.fight) || ov(box, f.L.cargo) || ov(box, f.L.bar)) bad.push(`${p.id}: over FIGHT, the cargo bar or the top bar`);
      if (box.y < 0 || box.y + box.h > f.H) bad.push(`${p.id}: off the screen`);
      if (at.place === "inside") {
        // inside the panel's body: under the last row (2 px clear), 2 px clear of the panel's edge, in the panel's width; no row, header or word of the panel is under it
        if (box.y < rowsEnd + 2 || box.y + box.h + 2 > r.y + r.h || box.x < r.x || box.x + box.w + 2 > r.x + r.w) bad.push(`${p.id}: inside, but not clear of the last row (${rowsEnd}) or the panel's edge (${r.y + r.h})`);
        if (rows.some((q) => q.y < box.y + box.h && box.y < q.y + q.h)) bad.push(`${p.id}: inside, over a text row`);
        if (strip && !stripDrawn(fr.cv, strip)) bad.push(`${p.id}: the box is inside and the strip is not drawn`);
      } else if (at.place === "strip") {
        stripOn += strip ? 1 : 0;
        if (box.y !== (strip ? strip.y : r.y + r.h)) bad.push(`${p.id}: in the strip's place, but at y ${box.y} (the strip's top ${strip?.y ?? "-"}, the panel's foot ${r.y + r.h})`);
        if (box.y + box.h > deckTop) bad.push(`${p.id}: the box in the strip's place covers the deck`);
        if (ov(box, r)) bad.push(`${p.id}: the box in the strip's place is over the panel`);
        if (strip && stripDrawn(fr.cv, strip)) bad.push(`${p.id}: the box is in the strip's place and the strip is still drawn`);
        if (!strip && !ov(rigTipRect([RIG_SENTENCE], r, { W: f.W, H: f.H }, null), deck)) bad.push(`${p.id}: no strip, and today's place already cleared the deck: the box should not have moved`);
      } else {
        // today's place (rigTipRect's): the tests list every panel that lands here, and it covers no deck cell
        expect(box, `${p.id}: today's place is rigTipRect's`).toEqual(rigTipRect([RIG_SENTENCE], r, { W: f.W, H: f.H }, strip));
        if (strip && !stripDrawn(fr.cv, strip)) bad.push(`${p.id}: today's place and the strip is not drawn`);
      }
      // chosen once, from the box's first frame: the same box on the next frames, and the strip as on the first
      if (n % 41 === 0) for (let k = 0; k < 3; k++) {
        const again = pc.draw();
        expect(sightBox(again.ui), `${p.id}: the same box on frame ${k + 2}`).toEqual(box);
        if (strip) expect(stripDrawn(again.cv, strip), `${p.id}: the strip as on the first frame`).toBe(stripDrawn(fr.cv, strip));
      }
      keywordsIdle(pc.ctx);
    }
    // eslint-disable-next-line no-console
    console.log(`PRESENT-4 T ${mode} ${name}: ${n} rig sentence boxes: inside ${by.inside}, in the strip's place ${by.strip} (the strip yields on ${stripOn}), today's place ${by.today}; ${onDeck} cover a deck cell (before ${OVER_DECK_BEFORE[mode][name]})`);
    expect(n).toBe(546);
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
    expect(onDeck).toBe(0);
    expect([by.inside, by.strip, by.today], `${mode} ${name}: [inside, the strip's place, today's]`).toEqual(PLACES[mode][name]);
    if (mode === "sight") expect(stripOn, "no strip, nothing yields").toBe(0);
  }, BIG);

  for (const [name, w, h, dpr, runes] of VIEWS.filter((v) => v[0] === "op-402x690, a rune" || v[0] === "phone-390x660")) it(`the strip is hidden from the box's first frame where the box takes its place, and back in the frame the sentence closes (and a press only closes it): ${name}`, () => {
    const f = framed(w, h, dpr, runes);
    let seen = 0;
    const bad: string[] = [];
    for (const p of rigPanels().filter((q, i) => i % 9 === 0)) {
      setTipsForTests("new");
      const pc = panelCtx(p.run, p.sel, f, true);
      const first = pc.draw(), box = sightBox(first.ui), strip = first.d?.hint ? hintStrip(first.d.hint, first.d.plan.r, f.H).r : null;
      if (!first.d || !box || !strip) { keywordsIdle(pc.ctx); continue; }
      const place = keywordState(pc.ctx)!.rigAt!.place;
      seen++;
      expect(stripDrawn(first.cv, strip), `${p.id}: the strip on the box's first frame`).toBe(place !== "strip");
      // the press closes the sentence: it is gone in the next frame, and the strip is back in the frame the last first-sight box (the sentence, then each keyword's note) closes
      let prev = first;
      for (let k = 0; k < 16; k++) {
        keywordsPressed(pc.ctx, null);
        prev = pc.draw();
        if (!sightBox(prev.ui) && !prev.ui.regions.some((q) => q.id === "kwdef")) break;
      }
      if (!stripDrawn(prev.cv, strip)) bad.push(`${p.id}: the strip is not back after the first sights closed`);
      keywordsIdle(pc.ctx);
    }
    expect(seen).toBeGreaterThan(20);
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
  }, BIG);

  it("the desk and the landscape phone: the sentence's box is where it was (beside the panel: rigTipRect's place, no rigAt move, the strip untouched)", () => {
    for (const [name, w, h, dpr, runes, touch] of [["desk 1280x800", 1280, 800, 1, 1, false], ["desk 1920x1080", 1920, 1080, 1, 1, false], ["landscape phone 844x390", 844, 390, 3, 1, true]] as const) {
      const f = framed(w, h, dpr, runes);
      let n = 0;
      for (const p of rigPanels().filter((q, i) => i % 6 === 0)) {
        setTipsForTests("sight"); // the tips done: the desk's and the column's how-to hint is in the panel's body (a first sight waits for it), so only the first sights are left
        const pc = panelCtx(p.run, p.sel, f, touch);
        const fr = pc.draw(), box = sightBox(fr.ui), st = keywordState(pc.ctx);
        if (!fr.d || !box || !st?.rig) { keywordsIdle(pc.ctx); continue; } // (a rig the sentence is not true of opens a keyword's box on the desk: also a SIGHT_REGION)
        n++;
        const r = fr.d.plan.r, strip = fr.d.hint ? hintStrip(fr.d.hint, r, f.H).r : null;
        expect(box, `${name} ${p.id}`).toEqual(rigTipRect([RIG_SENTENCE], r, { W: f.W, H: f.H }, strip));
        expect(st.rigAt!.place, `${name} ${p.id}`).toBe("today");
        keywordsIdle(pc.ctx);
      }
      expect(n, name).toBeGreaterThan(30);
    }
  }, BIG);

  it("rigPlace, by hand: inside where it fits (2 px clear of the last row and of the panel's edge); else the strip's place where that clears the deck; else today's; beside the panel: today's", () => {
    const r: Rect = { x: 1, y: 106, w: 236, h: 90 }, strip: Rect = { x: 1, y: 196, w: 236, h: 16 }, deck: Rect = { x: 20, y: 231.8, w: 200, h: 144 }, screen = { W: 241, H: 414 };
    const today = rigTipRect([RIG_SENTENCE], r, screen, strip);
    expect(today.h).toBe(29);
    // a short panel: the box under the row at 143 (y 145), the strip stays
    expect(rigPlace([RIG_SENTENCE], r, screen, strip, 143, deck)).toEqual({ box: { ...today, y: 145 }, place: "inside", yieldsStrip: false });
    // the last row at 163: 163 + 2 + 29 + 2 = 196 = the panel's foot: still inside; one px lower: the strip's place
    expect(rigPlace([RIG_SENTENCE], r, screen, strip, 163, deck).place).toBe("inside");
    expect(rigPlace([RIG_SENTENCE], r, screen, strip, 164, deck)).toEqual({ box: { ...today, y: 196 }, place: "strip", yieldsStrip: true });
    // the strip's place covers the deck (the deck starts 1 px higher: 196 + 29 > 224): today's
    expect(rigPlace([RIG_SENTENCE], r, screen, strip, 164, { ...deck, y: 224.6 })).toEqual({ box: today, place: "today", yieldsStrip: false });
    // no deck known (a desk, a landscape layout): the box is today's
    expect(rigPlace([RIG_SENTENCE], r, screen, strip, 164, null).place).toBe("today");
    // no strip this open (tips done): today's place where it clears the deck; the panel's foot where it would cover a cell
    const none = rigTipRect([RIG_SENTENCE], r, screen, null);
    expect(rigPlace([RIG_SENTENCE], r, screen, null, 164, deck)).toEqual({ box: none, place: "today", yieldsStrip: false });
    expect(rigPlace([RIG_SENTENCE], r, screen, null, 164, { ...deck, y: 225 })).toEqual({ box: { ...none, y: 196 }, place: "strip", yieldsStrip: false });
    // beside the panel (a column the box fits next to): rigTipRect's place, whatever the rows
    const col: Rect = { x: 3, y: 40, w: 126, h: 120 }, wide = { W: 640, H: 360 };
    expect(rigPlace([RIG_SENTENCE], col, wide, null, 60, deck)).toEqual({ box: rigTipRect([RIG_SENTENCE], col, wide, null), place: "today", yieldsStrip: false });
    // rigRowsEnd: the foot of the lowest text row (a 5x7 row is 7 px tall, a 3x5 row 5), at least the body's top; dividers don't count
    const L5 = { font: "5" } as never, L3 = { font: "3" } as never;
    expect(rigRowsEnd([{ line: L5, y: 131 }, { line: "rule", y: 140 }, { line: L3, y: 150 }], { y: 125 })).toBe(155);
    expect(rigRowsEnd([], { y: 125 })).toBe(125);
  });
});
