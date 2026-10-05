import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { newRun, type DuskFoe, type Run } from "../src/game/run";
import { ITEMS, buyableModules } from "../src/sim/content";
import { scaleCore } from "../src/sim/cores";
import { fmtSec } from "../src/ui/statFormat";
import { key as K, rotField, setTurretList } from "../src/sim/deck";
import { fusible } from "../src/sim/stars";
import { rotFacing } from "../src/sim/beltside";
import { computeView, type View } from "../src/core/io";
import { UI, inside, tapRect, type Rect } from "../src/ui/ui";
import { tapPx } from "../src/ui/tap";
import { buildLayout, buildScale, panelArea, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { columnButtons, detailsPlan, drawDetails, fullText, visibleLines, type PanelPlan } from "../src/screens/build/inspector";
import {
  definitionBox, definitionLines, keywordState, keywordTargets, keywordsPressed, panelPiece, panelWords, questionRect, viewPages,
} from "../src/screens/build/keywords";
import { infoItems, infoLevels, infoPages, questionBox } from "../src/screens/build/keywords"; // U2e step 5: the ⓘ view
import { lineWidth } from "../src/ui/richText"; // U2e step 5
import { infoFree, infoView, runeWords, INFO_FREE_MIN, type KwWord } from "../src/screens/build/keywords"; // U2f: the taller ⓘ view
import { infoDrawn } from "../src/screens/build/keywords"; // FLIP-X1 (N4-b): the view as drawn
import { phoneScreen } from "../src/screens/build/layout"; // U2f
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar"; // U2f: the text sheet's view
import { RUNE_LIST, runeList } from "../src/sim/runes"; // U2f; FLIP-X1 (F-d): runeList
import { withSustain } from "../src/sim/content"; // FLIP-X1 (F-d)
import { TAP_CSS } from "../src/ui/tap"; // U2f
import { glossaryEntry } from "../src/ui/glossary";
import { faceAt } from "../src/ui/faces";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import type { Ctx } from "../src/screens/build/actions";

// U2c (REQ-BFG-045, REQ-BFG-046; BRIEF-T2b item 6): tap to explain (src/screens/build/keywords.ts), in the style of
// abilityPanels, the shoptap tests and zoom. Across every zoom.test phone view and every panel the sweep plans (each buyable
// part in cargo at each star, on offer, placed or fitted, an installed turret with a core and gear, the heroes' starting
// parts): every tap target lies inside its panel and clear of the buttons' grown rects and the `?` button's; every word a
// panel names can be reached (a target, or the KEYWORDS view, which `?` opens on every panel that names one); a shown
// definition is whole and closes; the desk hover shows it; and the existing presses still reach their buttons.

installRaster();

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const TOUCH = { touch: true, hover: false, busy: false };

/** zoom.test's portrait phone views (zoom D2). */
const VIEWS: [number, number, number][] = [[390, 660, 3], [390, 664, 3], [402, 690, 3], [390, 844, 3], [430, 739, 3], [393, 659, 3], [402, 718, 3],
  [390, 700, 3], [360, 640, 2], [375, 667, 2], [414, 896, 2], [412, 915, 2.625], [320, 568, 2], [360, 780, 3], [428, 926, 3]];

function screen(w: number, h: number, dpr: number): { v: View; L: BuildLayout } {
  const v = computeView(w, h, dpr, buildScale);
  return { v, L: buildLayout(v.W, v.H, v.portrait, 5, true) };
}

/** A FURNACE run (its KILN up column 4, a STAMP PRESS up column 6) holding `items` too. */
function furnace(extra: Run["build"]["items"] = []): Run {
  const run = newRun("furnace", 5, "u2c");
  run.inventory = [];
  run.build = {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }, ...extra],
    routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }, { factory: 7, cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)] }],
  };
  return run;
}

/** Every panel the sweep plans (zoom's kinds): each buyable part in cargo at each star and on offer, a factory or rig placed,
 *  a core or gear piece fitted, a turret installed with a core and gear, the heroes' starting parts. */
function panels(): { id: string; run: Run; sel: Sel }[] {
  const out: { id: string; run: Run; sel: Sel }[] = [];
  for (const d of buyableModules()) {
    for (const s of fusible(d.id) ? [1, 2, 3] : [1]) {
      const run = furnace();
      run.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
      out.push({ id: `cargo ${d.id} ★${s}`, run, sel: { kind: "cargo", uid: 900 } });
      if (d.kind === "factory") out.push({ id: `placed ${d.id} ★${s}`, run: furnace([{ uid: 901, def: d.id, x: 8, y: 6, ...(s > 1 ? { stars: s } : {}) }]), sel: { kind: "item", uid: 901 } });
      if (d.kind === "gate") out.push({ id: `placed ${d.id} ★${s}`, run: furnace([{ uid: 10, def: d.id, x: 3, y: 3, ...rotField(d.id, rotFacing(d.id, 1)), ...(s > 1 ? { stars: s } : {}) }]), sel: { kind: "item", uid: 10 } });
      if (d.kind === "core" || d.kind === "mod") {
        const fr = furnace();
        fr.build.mods = [{ uid: 902, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) } as Run["build"]["mods"][number]];
        out.push({ id: `fitted ${d.id} ★${s}`, run: fr, sel: { kind: "fitted", uid: 902 } });
        if (d.kind === "core") out.push({ id: `turret with ${d.id} ★${s}`, run: fr, sel: { kind: "turret", index: 0 } });
      }
      if (d.kind === "turret") {
        const tr = furnace();
        setTurretList(tr.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: d.id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
        tr.build.mods = [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }];
        out.push({ id: `turret ${d.id} ★${s} with a core and gear`, run: tr, sel: { kind: "turret", index: 1 } });
      }
    }
    const run = furnace();
    run.gold = 99;
    run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id}`, run, sel: { kind: "offer", wagon: 0, slot: 0 } });
  }
  for (const hero of PLAYABLE_HEROES) {
    const run = newRun(hero, 5, "u2c-start");
    for (const p of run.build.items) out.push({ id: `${hero}'s starting ${p.def}`, run, sel: { kind: "item", uid: p.uid } });
    out.push({ id: `${hero}'s starting turret`, run, sel: { kind: "turret", index: 0 } });
  }
  return out;
}

/** A finger's panel on a phone view (zoom's opened: where BuildScreen.panelArea draws it) and its buttons' hit rects, as
 *  drawDetails registers them. */
function opened(v: View, L: BuildLayout, c: { run: Run; sel: Sel }, touch = true) {
  const ctx = { game: { ui: new UI(), t: 0, view: v }, run: c.run, touch, L } as unknown as Ctx;
  const memo = new Map<string, ReturnType<typeof detailsPlan>>();
  const plan = (r: Rect) => { const k = `${r.x},${r.y},${r.w},${r.h}`; if (!memo.has(k)) memo.set(k, detailsPlan(ctx, c.sel, null, r)); return memo.get(k)!; };
  const area = touch ? panelArea(L, c.sel, TOUCH, (r) => { const d = plan(r); return d ? fullText(d.plan) : null; }) : L.info;
  const d = plan(area)!;
  const tap = touch ? tapPx(v) : 0;
  const p = d.plan, n = d.t.labels.length;
  const buttons = p.column ? columnButtons(n, p.r, tap) : (p.rects ?? []).map((b) => (tap ? tapRect(b, tap, p.r) : b));
  return { ctx, d, plan: p, buttons, tap };
}

function check(tag: string, run: Run, d: { show: Sel; t: { body: import("../src/screens/build/inspector").Block[] } }, plan: PanelPlan, buttons: Rect[], tap: number,
  counts: { panels: number; targets: number; words: number; tapped: Set<string>; levels?: number }) {
  const piece = panelPiece(run, d.show);
  const words = panelWords(d.t.body, piece);
  const q = questionRect(plan.r, plan.y, tap, buttons);
  const targets = keywordTargets(visibleLines(plan), plan, piece, [...buttons, ...(q ? [q] : [])]);
  const inner = { x: plan.r.x + 1, y: plan.r.y + 1, w: plan.r.w - 2, h: plan.r.h - 2 };
  counts.panels++;
  counts.targets += targets.length;
  counts.words += words.length;
  for (const t of targets) {
    expect(within(t.r, inner), `${tag}: ${t.word} inside its panel`).toBe(true);
    for (const b of buttons) expect(overlaps(t.r, b), `${tag}: ${t.word} clear of a button's grown rect`).toBe(false);
    if (q) expect(overlaps(t.r, q), `${tag}: ${t.word} clear of ?`).toBe(false);
    for (const u of targets) if (u !== t) expect(overlaps(t.r, u.r), `${tag}: ${t.word} and ${u.word} meet`).toBe(false);
    // the word as drawn is what a finger aims at: its middle is in its target (a word a button's grown rect covers past its
    // middle is no target; the KEYWORDS view still lists it)
    expect(inside(t.r, Math.floor(t.glyph.x + t.glyph.w / 2), Math.floor(t.glyph.y + t.glyph.h / 2)), `${tag}: ${t.word}'s middle in its target`).toBe(true);
    if (!buttons.some((b) => overlaps(b, t.glyph))) expect(t.r.h, `${tag}: ${t.word} grown to its line's pitch`).toBeGreaterThanOrEqual(t.glyph.h);
    counts.tapped.add(t.word);
  }
  // U2e step 5 (REQ-BFG-070): the ⓘ button (U2c's `?`, the same rect) is on every panel that names a word or has LEVELS
  const levels = infoLevels(run, d.show);
  if (words.length || levels.length) {
    // every word is reachable: the ⓘ button is there, inside the panel, clear of the buttons; its view lists every LEVELS
    // line, then every word (U2c: viewPages listed every word; the ⓘ view's pages hold the same words after the LEVELS)
    expect(q, `${tag}: ⓘ`).not.toBeNull();
    expect(within(q!, plan.r), `${tag}: ⓘ inside`).toBe(true);
    for (const b of buttons) expect(overlaps(q!, b), `${tag}: ⓘ clear of a button`).toBe(false);
    const items = infoItems(levels, words, plan.r.w - 10);
    const pages = infoPages(items, plan.maxY + 2 - (plan.y - 1));
    expect(pages.flat().map((it) => it.level ?? it.word), `${tag}: the ⓘ view lists its LEVELS, then every word`).toEqual([...levels, ...words]);
    expect(pages.flat().filter((it) => it.word).map((it) => it.word), `${tag}: the KEYWORDS`).toEqual(viewPages(words, plan.r.w - 10, plan.maxY + 2 - (plan.y - 1)).flat());
    // every line of the view fits its width (the op view's and every other phone's)
    for (const it of items) for (const ln of it.lines) expect(lineWidth(ln, "5"), `${tag}: an ⓘ line fits`).toBeLessThanOrEqual(plan.r.w - 10);
    counts.levels = (counts.levels ?? 0) + levels.length;
  }
  if (words.length) {
    // each word's definition shows whole: its box holds every line, on the screen
    for (const w of words) {
      const n = definitionLines(w.text, plan.r.w - 10).length, box = definitionBox(plan.r, plan.maxY + 2, n);
      expect(box.h, `${tag}: ${w.word}`).toBe(n * 9 + 3);
      expect(box.y, `${tag}: ${w.word} on the screen`).toBeGreaterThanOrEqual(0);
    }
  }
}

describe("U2c tap to explain: on every phone view, every panel's targets, `?` and definitions", () => {
  const all = panels();
  for (const [w, h, dpr] of VIEWS) {
    it(`${w}x${h} @${dpr}: every target inside its panel, clear of the buttons and ?; every word reachable; every definition whole`, () => {
      const { v, L } = screen(w, h, dpr);
      const counts = { panels: 0, targets: 0, words: 0, tapped: new Set<string>() };
      for (const c of all) {
        const o = opened(v, L, c);
        check(`${w}x${h}: ${c.id}`, c.run, o.d, o.plan, o.buttons, o.tap, counts);
      }
      if (w === 402 && h === 690) console.log(`U2c op view: ${counts.panels} panels, ${counts.targets} targets, ${counts.words} words named; words tapped somewhere: ${[...counts.tapped].sort().join(" ")}`);
      expect(counts.targets).toBeGreaterThan(counts.panels / 2);
    });
  }

  it("every face keyword, trigger label and tap note is a target on some panel of the op view", () => {
    const { v, L } = screen(402, 690, 3);
    const seen = new Set<string>();
    for (const c of all) {
      const o = opened(v, L, c), piece = panelPiece(c.run, o.d.show);
      for (const t of keywordTargets(visibleLines(o.plan), o.plan, piece, o.buttons)) seen.add(glossaryEntry(t.word)?.word ?? t.word);
    }
    for (const w of ["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "HIT", "SHOT", "LOAD", "EVERY", "AIM", "FASTER"]) expect(seen.has(w), w).toBe(true);
  });
});

/** drawDetails on a raster canvas for `c` in `area`, its frame's regions; `pointer`: the mouse at (x, y). */
function draw(ctx: Ctx, c: { sel: Sel }, area: Rect, pointer?: { x: number; y: number }) {
  const ui = (ctx.game as unknown as { ui: UI }).ui;
  if (pointer) Object.assign(ui.pointer, { ...pointer, down: false, kind: "mouse" });
  ui.begin();
  drawDetails(G(fresh(ctx.game.view.W, ctx.game.view.H)), ctx, c.sel, null, area, {} as DuskFoe);
  ui.end();
  return ui;
}
const centre = (r: Rect) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

describe("U2c tap to explain: the tap, the close rules, `?`, the desk hover and the existing presses", () => {
  it("a tap shows the word's definition (the piece's own number), a second tap closes it, another word switches, a press elsewhere closes it", () => {
    const { v, L } = screen(402, 690, 3);
    const run = furnace();
    run.inventory = [{ uid: 900, def: "hotswap" }];
    const c = { run, sel: { kind: "cargo", uid: 900 } as Sel };
    const o = opened(v, L, c);
    const ui = draw(o.ctx, c, o.plan.r);
    const burn = ui.regions.find((r) => r.id.startsWith("kw:") && r.id.endsWith(":BURN"))!, stun = ui.regions.find((r) => r.id.startsWith("kw:") && r.id.endsWith(":STUN"))!;
    expect(burn && stun).toBeTruthy();
    burn.onTap!();
    expect(keywordState(o.ctx)!.word).toBe("BURN");
    const ui2 = draw(o.ctx, c, o.plan.r);
    const box = ui2.regions.find((r) => r.id === "kwdef")!;
    expect(box).toBeDefined();
    // the box sits over the panel's bottom rows (the hint's place), inside the panel here, whole: two 5x7 lines
    expect(within(box.r, o.plan.r)).toBe(true);
    expect(box.r.h).toBe(2 * 9 + 3);
    // another word switches; a second tap on it closes
    ui2.regions.find((r) => r.id.startsWith("kw:") && r.id.endsWith(":STUN"))!.onTap!();
    expect(keywordState(o.ctx)!.word).toBe("STUN");
    draw(o.ctx, c, o.plan.r).regions.find((r) => r.id.startsWith("kw:") && r.id.endsWith(":STUN"))!.onTap!();
    expect(keywordState(o.ctx)!.word).toBeNull();
    // a press anywhere else (a button, the board: BuildScreen.pressed) closes it; a press on a word doesn't
    draw(o.ctx, c, o.plan.r).regions.find((r) => r.id.endsWith(":BURN"))!.onTap!();
    keywordsPressed(o.ctx, "kw:3:STUN");
    expect(keywordState(o.ctx)!.word).toBe("BURN");
    keywordsPressed(o.ctx, null);
    expect(keywordState(o.ctx)!.word).toBeNull();
    // `?` opens the KEYWORDS view (no word targets meanwhile); a press elsewhere closes it
    const ui3 = draw(o.ctx, c, o.plan.r);
    ui3.regions.find((r) => r.id === "kw:?")!.onTap!();
    expect(keywordState(o.ctx)!.page).toBe(0);
    const ui4 = draw(o.ctx, c, o.plan.r);
    expect(ui4.regions.some((r) => r.id === "kw:view")).toBe(true);
    expect(ui4.regions.some((r) => /^kw:\d/.test(r.id))).toBe(false);
    keywordsPressed(o.ctx, "sell");
    expect(keywordState(o.ctx)!.page).toBeNull();
  });

  it("a press on a word or ? is the word's region, never the board's; a button's centre still reaches its button", () => {
    for (const [w, h, dpr] of [[402, 690, 3], [390, 664, 3], [320, 568, 2]] as const) {
      const { v, L } = screen(w, h, dpr);
      for (const c of panels().filter((p) => /^(cargo (hotswap|temper|tesla) ★1|placed (coil|sorting) ★2|turret with pressure ★1|offer platebreaker)$/.test(p.id))) {
        const o = opened(v, L, c);
        const ui = draw(o.ctx, c, o.plan.r);
        const buttons = ui.regions.filter((r) => !r.id.startsWith("kw") && r.id !== "details" && r.onTap);
        for (const b of buttons) expect(ui.hit(centre(b.r).x, centre(b.r).y)?.id, `${w}x${h} ${c.id}: ${b.id}`).toBe(b.id);
        for (const k of ui.regions.filter((r) => r.id.startsWith("kw:"))) {
          const p = centre(k.r);
          expect(ui.hit(p.x, p.y)?.id, `${w}x${h} ${c.id}: ${k.id}`).toBe(k.id);
          expect(inside(o.plan.r, p.x, p.y), `${c.id}: ${k.id} in the panel`).toBe(true);
        }
        // the board under the panel's band is no word's
        expect(ui.hit(o.plan.r.x + 4, o.plan.r.y + o.plan.r.h + 30)?.id?.startsWith("kw") ?? false).toBe(false);
      }
    }
  });

  it("the desk: hovering a word shows its definition (the tooltip) with the help cursor; off it, the cursor goes", () => {
    const v = computeView(1920, 1080, 1, buildScale), L = buildLayout(v.W, v.H, v.portrait, 5);
    const run = furnace([{ uid: 10, def: "temper", x: 3, y: 3, ...rotField("temper", rotFacing("temper", 1)) }]);
    const c = { run, sel: { kind: "item", uid: 10 } as Sel };
    const canvas = { style: { cursor: "" } };
    const ctx = { game: { ui: new UI(), t: 0, view: v, canvas }, run, touch: false, L } as unknown as Ctx;
    const ui = draw(ctx, c, L.info, { x: -1, y: -1 });
    const burn = ui.regions.find((r) => r.id.startsWith("kw:") && r.id.endsWith(":BURN"))!;
    expect(burn).toBeDefined();
    draw(ctx, c, L.info, centre(burn.r));
    expect(keywordState(ctx)!.hover).toBe("BURN");
    expect(canvas.style.cursor).toBe("help");
    draw(ctx, c, L.info, { x: 1, y: 1 });
    expect(keywordState(ctx)!.hover).toBeNull();
    expect(canvas.style.cursor).toBe("");
    expect(burn.r.h).toBeGreaterThanOrEqual(9); // the desk column's 5x7 line pitch
  });

  it("a face keyword's definition fills in the tapped piece's own number (TESLA ARC's STUN at its class factor), a stat row's icon alone is a target", () => {
    const { v, L } = screen(402, 690, 3);
    const run = furnace();
    // U2e step 4: no NEXT★ on the face; the icon alone is a stat row's: HOT SWAP's second stat row ({BURN}2 {STUN}1.6)
    run.inventory = [{ uid: 900, def: "tesla" }, { uid: 901, def: "hotswap" }];
    const t = opened(v, L, { run, sel: { kind: "cargo", uid: 900 } });
    const words = panelWords(t.d.t.body, panelPiece(run, t.d.show));
    const stun = words.find((w) => w.word === "STUN")!, piece = panelPiece(run, t.d.show)!;
    const own = faceAt("tesla", 1, piece.o)!.reminders.find((r) => r.includes("{*STUN}"))!;
    expect(stun.text).toBe(`${own} ${glossaryEntry("STUN")!.extra}`);
    expect(own).toContain(`${fmtSec(scaleCore(ITEMS.tesla.core!, piece.o.k!).stall!)}{SEC}`);
    const hot = opened(v, L, { run, sel: { kind: "cargo", uid: 901 } });
    const alone = keywordTargets(visibleLines(hot.plan), hot.plan, panelPiece(run, hot.d.show), hot.buttons)
      .filter((k) => k.word === "BURN" && k.glyph.w <= 5);
    expect(alone.length, "the stat row's BURN icon alone").toBeGreaterThanOrEqual(1);
  });

  it("U2e step 5: the ⓘ button keeps `?`'s place and hit rect; on a turret with no keyword it opens the LEVELS; a tap pages the view and closes it", () => {
    const { v, L } = screen(402, 690, 3);
    // a ★2 TEMPER in cargo: words (BURN, HIT) and LEVELS
    const run = furnace();
    run.inventory = [{ uid: 900, def: "temper", stars: 2 }];
    const c = { run, sel: { kind: "cargo", uid: 900 } as Sel };
    const o = opened(v, L, c);
    const ui = draw(o.ctx, c, o.plan.r);
    const info = ui.regions.find((r) => r.id === "kw:?")!;
    // the same rect U2c's `?` had: the icon box, grown on touch as the buttons' targets, clear of them
    expect(info.r).toEqual(questionRect(o.plan.r, o.plan.y, o.tap, o.buttons));
    expect(within(questionBox(o.plan.r), info.r)).toBe(true);
    info.onTap!();
    const ui2 = draw(o.ctx, c, o.plan.r);
    expect(ui2.regions.some((r) => r.id === "kw:view")).toBe(true);
    // its LEVELS: TEMPER's BURN ladder with ★2 current, then its NEXT★; then its KEYWORDS
    const ls = infoLevels(run, c.sel);
    expect(ls.map((l) => l.kind)).toEqual(["ladder", "next"]);
    // an installed turret (no core): its own LEVELS (SCRAP CANNON's cadence, loads and gear slots), not a core's
    const tr = furnace();
    const t = { run: tr, sel: { kind: "turret", index: 0 } as Sel };
    const ot = opened(v, L, t);
    expect(infoLevels(tr, t.sel).filter((l) => l.kind === "ladder").length).toBeGreaterThan(0);
    const ui3 = draw(ot.ctx, t, ot.plan.r);
    ui3.regions.find((r) => r.id === "kw:?")!.onTap!();
    expect(keywordState(ot.ctx)!.page).toBe(0);
    // a tap on the view turns the page; past the last it closes
    for (let i = 0; i < 5 && keywordState(ot.ctx)!.page !== null; i++) draw(ot.ctx, t, ot.plan.r).regions.find((r) => r.id === "kw:view")!.onTap!();
    expect(keywordState(ot.ctx)!.page).toBeNull();
  });
});

// U2f (REQ-BFG-070, REQ-BFG-046): the taller ⓘ view (keywords.ts infoFree, infoView, infoPagesIn). While its entries fit
// the body on one page it is U2e's; else it grows: on the phone into the room above the panel (over the shop, read first),
// then the body; on the desk down the free column below the panel. It never covers the panel's header (its title row, star
// badge, ⓘ button and the phone's buttons), and nothing changes while it is closed. Measured on the text sheet's panels
// (U2d/U2e's probe: each buyable piece in cargo at each star, a core and MIMIC FORGE for FURNACE and WEAVER, a supply on
// offer, each hero's signature factory placed) on the op view (402x690 @3, touch, planned with the rune row as the game
// plans it after the dawn pick) and the 1920x1080 desk.

/** The text sheet's view (U2e's probe): build.ts pickScale and layout() with one rune held, the phone's zoom and tap.
 *  FLIP-X1 (N4-b): `n` runes held (0: no rune row, the layout as the game plans it before the first pick). */
function sheetView(w: number, h: number, dpr: number, n = 1) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05, isPh = phoneScreen(pw, ph, dpr);
  const held = { run: { build: { runes: Array.from({ length: n }, (_, i) => ({ id: "iron_skin", day: i + 1 })) } }, refit: false, offers: () => [0, 1, 2, 3, 4] } as unknown as Parameters<typeof runeRowFits>[0];
  let scale = buildScale(pw, ph, portrait, dpr);
  while (scale > 1 && !runeRowFits(held, pw, ph, portrait, scale, dpr)) scale--;
  const v = { W: Math.floor(pw / scale), H: Math.floor(ph / scale), scale, portrait, dpr } as View;
  const tap = isPh ? Math.ceil(TAP_CSS / (scale / dpr)) : 0, row = runeRowH(v, n);
  return { v, L: shiftLayout(buildLayout(v.W, v.H - row, portrait, 5, isPh && portrait, tap), row, v.H), touch: isPh };
}

/** The text sheet's panels (U2e's probe, its runs: newRun(hero, 12345, "u2dprobe")). */
function sheetPanels(): { id: string; run: Run; sel: Sel }[] {
  const out: { id: string; run: Run; sel: Sel }[] = [];
  for (const d of buyableModules()) {
    for (const hero of d.kind === "core" || d.id === "mimic" ? ["furnace", "weaver"] : ["furnace"]) {
      for (const s of d.kind === "supply" ? [1] : fusible(d.id) ? [1, 2, 3] : [1]) {
        const run = newRun(hero as Run["hero"], 12345, "u2dprobe");
        if (d.kind === "supply") {
          run.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
          out.push({ id: `offer ${d.id}`, run, sel: { kind: "offer", wagon: 0, slot: 0 } });
        } else {
          run.inventory = [{ uid: 9401, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
          out.push({ id: `cargo ${d.id} ★${s} (${hero})`, run, sel: { kind: "cargo", uid: 9401 } });
        }
      }
    }
  }
  for (const [hero, f] of [["furnace", "kiln"], ["weaver", "loom"], ["foundry", "crucible"], ["bastion", "wardworks"]] as const) {
    const run = newRun(hero, 12345, "u2dprobe"), it = run.build.items.find((p) => p.def === f)!;
    out.push({ id: `placed ${f}`, run, sel: { kind: "item", uid: it.uid } });
  }
  return out;
}

/** A panel's ⓘ view on `vw`: its entries (with `extra`, a held rune's words), U2e's pages (the body alone) and U2f's view. */
function infoOf(vw: ReturnType<typeof sheetView>, c: { run: Run; sel: Sel }, extra: readonly KwWord[] = []) {
  const ctx = { game: { ui: new UI(), t: 0, view: vw.v }, run: c.run, touch: vw.touch, L: vw.L } as unknown as Ctx;
  const memo = new Map<string, ReturnType<typeof detailsPlan>>();
  const plan = (r: Rect) => { const k = `${r.x},${r.y},${r.w},${r.h}`; if (!memo.has(k)) memo.set(k, detailsPlan(ctx, c.sel, null, r)); return memo.get(k)!; };
  const area = panelArea(vw.L, c.sel, { touch: vw.touch, hover: false, busy: false }, (r) => { const d = plan(r); return d ? fullText(d.plan) : null; });
  const d = plan(area)!, p = d.plan;
  const own = panelWords(d.t.body, panelPiece(c.run, d.show));
  const words = [...own, ...extra.filter((w) => !own.some((o) => o.word === w.word))];
  const levels = infoLevels(c.run, c.sel);
  if (!words.length && !levels.length) return null;
  const items = infoItems(levels, words, p.r.w - 10);
  const free = infoFree(vw.L, p.r, p.column);
  return { plan: p, items, free, u2e: infoPages(items, p.maxY + 2 - (p.y - 1)).length, view: infoView(items, p.r, p.y - 1, p.maxY + 2, free) };
}

const histogram = (ns: number[]): number[] => Array.from({ length: Math.max(...ns) }, (_, i) => ns.filter((n) => n === i + 1).length);

describe("U2f: the taller ⓘ view", () => {
  const sheet = sheetPanels();
  const op = sheetView(402, 690, 3), desk = sheetView(1920, 1080, 1);
  /** Each rune's keywords (runeWords for a run holding it alone), for the "a rune held" measure. */
  const runeSets = RUNE_LIST.map((r) => runeWords({ build: { runes: [{ id: r.id, day: 1 }] } } as unknown as Run)).filter((ws) => ws.length);
  /** FLIP-X1 (F-d, SUS-D §9): the 8 sustain runes runeList() adds with the switch on, for the sustain-on measure (its own
   *  pin, U2F_OP_RUNE_ON; the switch-off one stays RUNE_LIST's). */
  const sustainSets = withSustain(() => runeList().filter((r) => !RUNE_LIST.includes(r))
    .map((r) => runeWords({ build: { runes: [{ id: r.id, day: 1 }] } } as unknown as Run)).filter((ws) => ws.length));

  it("U2e's view (the body alone), re-measured: op 119 / 166 / 18 / 2, desk 65 / 91 / 86 / 34 / 18 / 10 / 1 (NUM-4 on x1)", () => {
    // on u2e's text (U2f step 2, b8b4262) this measure gave U2e's own numbers exactly: op 118 / 160 / 27, desk
    // 70 / 96 / 88 / 26 / 15 / 10. Step 3's shorter lines make 4 desk column panels shorter (it sizes to its text), so
    // U2e's body-only view would page them more; the op band's panels keep their height
    // NUM-2's rebase of NUM-1 (REQ-BFG-047) onto u2f: desk 70 / 96 / 84 / 26 / 19 / 10 -> 72 / 94 / 84 / 25 / 20 / 10,
    // measured (the same 305 panels): the desk column sizes to its text, and the x10 numbers are a digit wider, so a few
    // panels' columns and ladders change height; the op band's histogram and U2f's own view (the next test) are unchanged
    // SUS-B (REQ-BFG-069), measured: the new DARK WIND text row is a tap in every kept text that names the wind (the
    // shared PLATING sentence of SEAM WELDER, SHIELD WALL's IRON WALL and the rest), and RIVETER's face names HEAL, so a
    // few views hold one more definition: op 118 / 160 / 27 -> 117 / 160 / 26 / 2, desk 72 / 94 / 84 / 25 / 20 / 10 ->
    // 71 / 92 / 87 / 25 / 20 / 10 (the same 310 panels)
    const o = sheet.map((c) => infoOf(op, c)).filter((x) => !!x), k = sheet.map((c) => infoOf(desk, c)).filter((x) => !!x);
    expect(sheet.length).toBe(310);
    // NUM-3 (R1's STUN fold), measured on num3 with steps 1-3: op 118 / 160 / 27 -> 119 / 167 / 19, desk 72 / 94 / 84 / 25 /
    // 20 / 10 -> 67 / 88 / 87 / 34 / 18 / 10 / 1 (the 7 STUN-fold pieces' faces: their LEVELS ladders and KEYWORDS replace a
    // legacy NEXT STAR sentence, so their body-only views page otherwise; U2f's view below is the one the game draws)
    // x1 (cap's merge of num3 + susb), re-measured on x1: op 118 / 167 / 18 / 2, desk 66 / 86 / 90 / 34 / 18 / 10 / 1
    // NUM-4 (REQ-BFG-047, REQ-BFG-046), re-measured on num4 (the same 310 panels): the RATE rows and ladders, the kept
    // sentences' AT RATE n, the hidden timers gone and F1's longer SHIELD lines move a few body-only views: op 118 / 167 /
    // 18 / 2 -> 119 / 166 / 18 / 2, desk 66 / 86 / 90 / 34 / 18 / 10 / 1 -> 65 / 91 / 86 / 34 / 18 / 10 / 1
    console.log(`U2e ⓘ pages (body alone): op ${histogram(o.map((x) => x!.u2e)).join(" / ")}; desk ${histogram(k.map((x) => x!.u2e)).join(" / ")}`);
    expect(histogram(o.map((x) => x!.u2e))).toEqual([119, 166, 18, 2]);
    expect(histogram(k.map((x) => x!.u2e))).toEqual([65, 91, 86, 34, 18, 10, 1]);
  });

  it("U2f's: op most on 1 page and none over 2 (3 with any one rune held); desk none over 3; pinned", () => {
    const o = sheet.map((c) => infoOf(op, c)).filter((x) => !!x), k = sheet.map((c) => infoOf(desk, c)).filter((x) => !!x);
    const ho = histogram(o.map((x) => x!.view.pages.length)), hk = histogram(k.map((x) => x!.view.pages.length));
    const worst = sheet.map((c) => Math.max(0, ...runeSets.map((ws) => infoOf(op, c, ws)?.view.pages.length ?? 0)));
    const held = histogram(worst.filter((n) => n > 0));
    // FLIP-X1 (F-d): with the switch on, the worst of the 65 runes (RUNE_LIST's and the 8): a separate pin
    const worstOn = withSustain(() => sheet.map((c, i) => Math.max(worst[i], ...sustainSets.map((ws) => infoOf(op, c, ws)?.view.pages.length ?? 0))));
    const heldOn = histogram(worstOn.filter((n) => n > 0));
    console.log(`U2f ⓘ pages: op ${ho.join(" / ")}; op, the worst rune held ${held.join(" / ")} (switch on: ${heldOn.join(" / ")}); desk ${hk.join(" / ")}`);
    expect(ho[0]).toBeGreaterThan(o.length / 2);
    expect(ho.length).toBeLessThanOrEqual(2);
    expect(held.length).toBeLessThanOrEqual(3);
    expect(hk.length).toBeLessThanOrEqual(3);
    expect(ho).toEqual(U2F_OP);
    expect(held).toEqual(U2F_OP_RUNE);
    expect(hk).toEqual(U2F_DESK);
    expect(heldOn.length).toBeLessThanOrEqual(3); // FLIP-X1 (F-d): U2f's aim holds with the switch on
    expect(heldOn).toEqual(U2F_OP_RUNE_ON);
  });

  it("on every phone view and the desk: the view never covers the panel's header (title row, star badge, ⓘ) and stays on screen; closed, nothing changes", () => {
    const all = panels();
    for (const [w, h, dpr] of [...VIEWS, [1920, 1080, 1] as [number, number, number]]) {
      const { v, L } = w === 1920 ? (() => { const q = computeView(w, h, dpr, buildScale); return { v: q, L: buildLayout(q.W, q.H, q.portrait, 5) }; })() : screen(w, h, dpr);
      let grown = 0;
      for (const c of all) {
        const o = opened(v, L, c, w !== 1920);
        const p = o.plan, r = p.r;
        const piece = panelPiece(c.run, o.d.show), words = panelWords(o.d.t.body, piece), levels = infoLevels(c.run, o.d.show);
        if (!words.length && !levels.length) continue;
        const items = infoItems(levels, words, r.w - 10);
        const free = infoFree(L, r, p.column);
        const view = infoView(items, r, p.y - 1, p.maxY + 2, free);
        const tag = `${w}x${h}: ${c.id}`;
        const header = { x: r.x, y: r.y, w: r.w, h: p.y - 1 - r.y }, q = questionRect(r, p.y, o.tap, o.buttons);
        if (view.areas.length > 1 || view.areas[0].h > p.maxY + 2 - (p.y - 1)) grown++;
        expect(view.pages.flat(2).map((it) => it.level ?? it.word), `${tag}: every entry, in order`).toEqual([...levels, ...words]);
        for (const a of view.areas) {
          expect(overlaps(a, header), `${tag}: the header`).toBe(false);
          expect(overlaps(a, questionBox(r)), `${tag}: ⓘ`).toBe(false);
          if (q) expect(overlaps(a, q), `${tag}: ⓘ's hit rect`).toBe(false);
          expect(a.y, `${tag}: under the top bar`).toBeGreaterThan(L.bar.y + L.bar.h);
          expect(a.y + a.h, `${tag}: its area on the screen`).toBeLessThanOrEqual(L.H);
          // the room above the panel never reaches the phone's buttons (the body is U2e's view, which a grown target may meet)
          if (!p.column && a.y + a.h <= r.y) for (const b of o.buttons) expect(overlaps(a, b), `${tag}: a button`).toBe(false);
        }
        // FLIP-X1 (N4-b): what it draws stays on the screen: the bottom of its last text line (the footer's too) and the top
        // of its first, on every page (keywords.ts infoDrawn, drawView's geometry). The area above can hold while a line
        // inside runs past the edge (NUM-4 finding 6)
        for (let pg = 0; pg < view.pages.length; pg++) {
          const dr = infoDrawn(items, r, p.y - 1, p.maxY + 2, free, pg);
          const lastLine = Math.max(...dr.rows.map((q) => q.y + q.h), dr.foot === null ? -Infinity : dr.foot + 5);
          expect(lastLine, `${tag} page ${pg + 1}: its last text line on the screen`).toBeLessThanOrEqual(L.H);
          expect(Math.min(...dr.rows.map((q) => q.y)), `${tag} page ${pg + 1}: its first text line under the top bar`).toBeGreaterThan(L.bar.y + L.bar.h);
        }
        if (free) expect(free.h, tag).toBeGreaterThanOrEqual(INFO_FREE_MIN);
        if (free && !p.column) expect(free.y + free.h, `${tag}: above the panel`).toBeLessThanOrEqual(r.y - 1);
      }
      if (w === 402 && h === 690) expect(grown, "the op view grows some views").toBeGreaterThan(0);
    }
  });

  it("drawn: a tap on the view's room above the panel turns the page (its region, over the shop); ⓘ keeps its rect, open or closed", () => {
    const { v, L } = screen(402, 690, 3);
    const run = furnace();
    run.inventory = [{ uid: 900, def: "hotswap", stars: 2 }];
    const c = { run, sel: { kind: "cargo", uid: 900 } as Sel };
    const o = opened(v, L, c);
    const closed = draw(o.ctx, c, o.plan.r).regions.filter((r) => r.id !== "kw:view").map((r) => ({ id: r.id, r: r.r }));
    const info = draw(o.ctx, c, o.plan.r).regions.find((r) => r.id === "kw:?")!;
    info.onTap!();
    const ui = draw(o.ctx, c, o.plan.r);
    const views = ui.regions.filter((r) => r.id === "kw:view");
    expect(views.length, "the room above the panel and the body").toBe(2);
    const up = views.find((r) => r.r.y + r.r.h <= o.plan.r.y)!;
    expect(up).toBeDefined();
    expect(ui.hit(up.r.x + 5, up.r.y + 3)?.id).toBe("kw:view");
    expect(ui.regions.find((r) => r.id === "kw:?")!.r).toEqual(info.r);
    // closed again (a press elsewhere), every region is where it was
    keywordsPressed(o.ctx, null);
    expect(draw(o.ctx, c, o.plan.r).regions.filter((r) => r.id !== "kw:view").map((r) => ({ id: r.id, r: r.r }))).toEqual(closed);
    // a tap on the room above the panel turns the page (to the next, or past the last it closes)
    info.onTap!();
    expect(keywordState(o.ctx)!.page).toBe(0);
    draw(o.ctx, c, o.plan.r).regions.filter((r) => r.id === "kw:view")[0].onTap!();
    expect(keywordState(o.ctx)!.page).not.toBe(0);
  });
});

/** U2f: the pinned page distributions (panels on 1 / 2 / ... pages), measured by the test above (U2e's, the body alone:
 *  op 118 / 160 / 27, desk 70 / 96 / 88 / 26 / 15 / 10). With the worst one rune held, 310 panels have an ⓘ (5 gain one). */
// NUM-3 (R1's STUN fold), measured on num3 with steps 1-3 (the 7 STUN-fold pieces' faces): op still 305 on 1 page; the
// worst rune held 272 / 38 -> 276 / 34; desk 291 / 14 -> 299 / 6. SUS-B (REQ-BFG-069), measured on susb: the DARK WIND row
// and RIVETER's HEAL put one more definition in a few views: op [303, 2], rune held [271, 39], desk [289, 16].
// x1 (cap's merge of num3 + susb), re-measured on x1 (U2f's aims hold: none over 2, 3 with a rune held, desk none over 3)
// NUM-4 (REQ-BFG-047), re-measured on num4: op [303, 2] unchanged; the worst rune held [275, 35] -> [276, 34]; desk
// [297, 8] -> [296, 9]. U2f's aims hold: op none over 2 pages, a rune held none over 2 (3 allowed), desk none over 3.
const U2F_OP = [303, 2];
const U2F_OP_RUNE = [276, 34];
/** FLIP-X1 (F-d, SUS-D §9): the worst one rune held with the switch on (RUNE_LIST's 57 and the 8 sustain runes), measured
 *  on flipx1: the same as RUNE_LIST's (no sustain rune pages a view further than its worst rune in play). The switch-off
 *  pin above is RUNE_LIST's, unchanged. */
const U2F_OP_RUNE_ON = [276, 34];
const U2F_DESK = [296, 9];

// FLIP-X1 (N4-b, REVIEW-NUM4 section 3; NUM-4 finding 6): every line of the ⓘ view is on screen. The view's areas stayed on
// the screen (the test above), but on the 1920x1080 desk WARD BELL's last KEYWORDS line (a held rune's HULL) drew partly
// below its bottom edge. This sweep measures what the view draws (keywords.ts infoDrawn, drawView's geometry): the top of
// its first text row and the bottom of its last (the footer's too), on every page, for every panel (the text sheet's and
// the zoom sweep's), on the op phone (402x690 @3) and the 1920x1080 desk, with the switch off and on, with no rune held
// (no rune row) and with each held rune's keywords (the rune row, as the game plans it after the dawn pick).
describe("FLIP-X1 N4-b: every line of every panel's ⓘ view is on screen", () => {
  /** Every page of a panel's view as drawn: the top of its first text row and the bottom of its last. */
  const span = (vw: ReturnType<typeof sheetView>, c: { run: Run; sel: Sel }, extra: readonly KwWord[]) => {
    const x = infoOf(vw, c, extra);
    if (!x) return null;
    const p = x.plan;
    let lo = Infinity, hi = -Infinity;
    for (let pg = 0; pg < x.view.pages.length; pg++) {
      const d = infoDrawn(x.items, p.r, p.y - 1, p.maxY + 2, x.free, pg);
      for (const row of d.rows) { lo = Math.min(lo, row.y); hi = Math.max(hi, row.y + row.h); }
      if (d.foot !== null) hi = Math.max(hi, d.foot + 5);
    }
    return { lo, hi, pages: x.view.pages.length };
  };

  /** Each distinct set of one held rune's keywords, over runeList() (with the switch on, the 8 sustain runes' too). */
  const runeSetsNow = () => {
    const sets = new Map<string, { ids: string[]; ws: KwWord[] }>();
    for (const r of runeList()) {
      const ws = runeWords({ build: { runes: [{ id: r.id, day: 1 }] } } as unknown as Run);
      const k = ws.map((w) => w.word).join("+");
      if (!sets.has(k)) sets.set(k, { ids: [], ws });
      sets.get(k)!.ids.push(r.id);
    }
    return [...sets].map(([k, s]) => ({ label: `rune ${k} (${s.ids[0]})`, ws: s.ws }));
  };
  /** Sweep `views` (each a view, and whether it holds a rune): every panel, with no rune or (a view holding one) each
   *  rune's keywords; the rows past an edge ("on/off | size | panel | held | pages | below | above") and the views measured. */
  const sweep = (on: boolean, views: { size: string; vw: ReturnType<typeof sheetView>; held: boolean }[]) => withSustain(() => {
    const all = [...sheetPanels(), ...panels()], sets = runeSetsNow(), out: string[] = [];
    let n = 0;
    for (const { size, vw, held } of views) for (const c of all) {
      for (const t of held ? sets : [{ label: "no rune", ws: [] as KwWord[] }]) {
        const sp = span(vw, c, t.ws);
        if (!sp) continue;
        n++;
        const below = sp.hi - vw.v.H, above = -sp.lo;
        if (below > 0 || above > 0) out.push(`${on ? "on" : "off"} | ${size} ${vw.v.W}x${vw.v.H} | ${c.id} | ${t.label} | pages ${sp.pages} | below ${below} | above ${above}`);
      }
    }
    return { out, n };
  }, on);

  it("as the game plans it (no rune: no rune row; a rune held: its row, at the scale pickScale steps to): no line past an edge, the switch off and on", () => {
    for (const on of [false, true]) {
      const views = ([["phone", 402, 690, 3], ["desk", 1920, 1080, 1]] as const).flatMap(([size, w, h, dpr]) => [
        { size, vw: sheetView(w, h, dpr, 0), held: false },
        { size, vw: sheetView(w, h, dpr, 1), held: true },
      ]);
      const { out, n } = sweep(on, views);
      console.log(`N4-b, the switch ${on ? "on" : "off"}: ${n} views; past an edge: ${out.length}${out.length ? `\n${out.join("\n")}` : ""}`);
      expect(n).toBeGreaterThan(18000);
      expect(out, `the switch ${on ? "on" : "off"}`).toEqual([]);
    }
  });

  it("NUM-4's shot (the desk at 480x270 with a rune row: the shot tooling's bb.holdRunes skips the pick's game.resize()): WARD BELL's view pages on the screen, and every panel's does", () => {
    // the game steps the 1920x1080 desk from x4 (480x270) to x3 (640x360) when a rune is held (runeRowFits); this is the
    // layout at x4 with the rune row, whose column runs past the screen's bottom (its cargo tray is cut too)
    const v4 = sheetView(1920, 1080, 1, 0).v, row = runeRowH(v4, 1);
    const at4 = { v: v4, L: shiftLayout(buildLayout(v4.W, v4.H - row, false, 5, false, 0), row, v4.H), touch: false };
    expect([at4.v.W, at4.v.H, at4.L.info.y + at4.L.info.h > at4.v.H]).toEqual([480, 270, true]);
    const ward = withSustain(() => {
      const c = sheetPanels().find((q) => q.id === "cargo wardbell ★1 (furnace)")!;
      return span(at4, c, runeWords({ build: { runes: [{ id: "spare_hull", day: 1 }] } } as unknown as Run))!;
    });
    console.log(`N4-b, NUM-4's shot state: WARD BELL ★1 with SPARE HULL's HULL: ${ward.pages} pages, its last line ends at ${ward.hi} of ${at4.v.H}`);
    expect(ward.hi).toBeLessThanOrEqual(at4.v.H); // x2a: 1 page, its last line to 271 of 270 (HULL's "FIGHT." 1 px past)
    for (const on of [false, true]) {
      const { out, n } = sweep(on, [{ size: "desk x4 + a rune row", vw: at4, held: true }]);
      console.log(`N4-b, NUM-4's shot state, the switch ${on ? "on" : "off"}: ${n} views; past an edge: ${out.length}${out.length ? `\n${out.join("\n")}` : ""}`);
      expect(out, `the switch ${on ? "on" : "off"}`).toEqual([]);
    }
  });
});
