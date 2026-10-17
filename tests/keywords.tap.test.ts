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
import { setTipsForTests } from "../src/ui/tips"; // CARD-4 (REQ-BFG-004, K): the tap test starts with the notes done
import { buildLayout, buildScale, panelArea, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { columnButtons, detailsPlan, drawDetails, fullText, visibleLines, type PanelPlan } from "../src/screens/build/inspector";
import {
  definitionBox, definitionLines, keywordState, keywordTargets, keywordsPressed, panelPiece, panelWords, questionRect, viewPages,
} from "../src/screens/build/keywords";
import { infoItems, infoLevels, infoPages, questionBox } from "../src/screens/build/keywords"; // U2e step 5: the ⓘ view
import { lineWidth } from "../src/ui/richText"; // U2e step 5
import { infoFree, infoView, runeWords, INFO_FREE_MIN, type KwWord } from "../src/screens/build/keywords"; // U2f: the taller ⓘ view
import { infoDrawn } from "../src/screens/build/keywords"; // FLIP-X1 (N4-b): the view as drawn
import { explainWords } from "../src/screens/build/keywords"; // EXPLAIN-1 (REQ-BFG-089, E4): the ⓘ's words as drawn
import { phoneScreen } from "../src/screens/build/layout"; // U2f
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar"; // U2f: the text sheet's view
import { RUNE_LIST, runeList } from "../src/sim/runes"; // U2f; FLIP-X1 (F-d): runeList
import { SUSTAIN_RUNE_LIST } from "../src/sim/runes"; // FLIP-X2: the 8 sustain runes' defs (SEARING, SHATTER SHOT dormant)
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

function check(tag: string, run: Run, d: { show: Sel; t: { body: import("../src/screens/build/inspector").Block[]; notes?: import("../src/screens/build/inspector").Block[] } }, plan: PanelPlan, buttons: Rect[], tap: number,
  counts: { panels: number; targets: number; words: number; tapped: Set<string>; levels?: number }) {
  const piece = panelPiece(run, d.show);
  // EXPLAIN-1 (REQ-BFG-089, E4): the words the drawn panel's ⓘ lists (explainWords: its face's blocks before any was hidden,
  // its NOTES lines; a plain rig's HIT), and its NOTES; was panelWords(d.t.body), the body being the whole face then
  const words = explainWords(d.t, piece), notes = (d.t.notes ?? []).map((b) => b.text);
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
    // EXPLAIN-1 (REQ-BFG-089, E3): the ⓘ's target is a finger's square now (keywords.ts questionRect), reaching 4 px into the
    // body's top left on a phone, as a button's grown rect reaches into it: a word under it keeps its middle in its target
    // (above), and may be clipped as a word under a button's is
    if (!buttons.some((b) => overlaps(b, t.glyph)) && !(q && overlaps(q, t.glyph))) expect(t.r.h, `${tag}: ${t.word} grown to its line's pitch`).toBeGreaterThanOrEqual(t.glyph.h);
    counts.tapped.add(t.word);
  }
  // U2e step 5 (REQ-BFG-070): the ⓘ button (U2c's `?`, the same rect) is on every panel that names a word or has LEVELS
  const levels = infoLevels(run, d.show);
  if (words.length || levels.length || notes.length) {
    // every word is reachable: the ⓘ button is there, inside the panel, clear of the buttons; its view lists every LEVELS
    // line, then every word (U2c: viewPages listed every word; the ⓘ view's pages hold the same words after the LEVELS)
    // EXPLAIN-1 (REQ-BFG-089, E4): its NOTES first (a panel with NOTES has the ⓘ too)
    expect(q, `${tag}: ⓘ`).not.toBeNull();
    expect(within(q!, plan.r), `${tag}: ⓘ inside`).toBe(true);
    for (const b of buttons) expect(overlaps(q!, b), `${tag}: ⓘ clear of a button`).toBe(false);
    const items = infoItems(levels, words, plan.r.w - 10, notes);
    const pages = infoPages(items, plan.maxY + 2 - (plan.y - 1));
    expect(pages.flat().map((it) => it.note ?? it.level ?? it.word), `${tag}: the ⓘ view lists its NOTES, its LEVELS, then every word`).toEqual([...notes, ...levels, ...words]);
    expect(pages.flat().filter((it) => it.word).map((it) => it.word), `${tag}: the KEYWORDS`).toEqual(viewPages(words, plan.r.w - 10, plan.maxY + 2 - (plan.y - 1)).flat());
    // every line of the view fits its width (the op view's and every other phone's)
    // CARD-2 (REQ-BFG-081, K5): each line in its own face (NOTES in 3x5; was every line measured in 5x7)
    for (const it of items) for (const ln of it.lines) expect(lineWidth(ln, it.font ?? "5"), `${tag}: an ⓘ line fits`).toBeLessThanOrEqual(plan.r.w - 10);
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
    for (const w of ["BURN", "STUN", "HEAT", "FRAY", "SHIELD", "PAIR", "HIT", "SHOT", "LOAD", "EVERY", "AIM", "FASTER"]) expect(seen.has(w), w).toBe(true); // CARD-3 (REQ-BFG-107): SHIELD (was PLATE)
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
    // CARD-4 (REQ-BFG-004, K) changed this test's start: a strip no longer holds the first sight back, so the panel (its
    // tips new: the strip up) would open BURN's note by itself; the tap rules are checked with the notes done
    setTipsForTests("done");
    try { tapRules(); } finally { setTipsForTests("reload"); }
  });
  const tapRules = (): void => {
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
  };

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
  // EXPLAIN-1 (REQ-BFG-089, E4): the view the game draws: NOTES first, the words explainWords lists (was panelWords(d.t.body))
  const own = explainWords(d.t, panelPiece(c.run, d.show)), notes = (d.t.notes ?? []).map((b) => b.text);
  const words = [...own, ...extra.filter((w) => !own.some((o) => o.word === w.word))];
  const levels = infoLevels(c.run, c.sel);
  if (!words.length && !levels.length && !notes.length) return null;
  const items = infoItems(levels, words, p.r.w - 10, notes);
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
   *  pin, U2F_OP_RUNE_ON; the switch-off one stays RUNE_LIST's). FLIP-X2 (REVIEW-TUNEX): runeList() adds 6 now (SEARING and
   *  SHATTER SHOT are dormant), so the measure takes the 8 defs, SUSTAIN_RUNE_LIST, as RUNE_LIST's keeps its dormant two */
  const sustainSets = withSustain(() => SUSTAIN_RUNE_LIST.filter((r) => !RUNE_LIST.includes(r))
    .map((r) => runeWords({ build: { runes: [{ id: r.id, day: 1 }] } } as unknown as Run)).filter((ws) => ws.length));

  it("U2e's view (the body alone), re-measured: op 120 / 171 / 18 / 2, desk 64 / 90 / 89 / 36 / 19 / 12 / 1 (FLIP-X2 on flipx2)", () => {
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
    // FLIP-X2 (REVIEW-NUM3 answer 2; REQ-BFG-069): the text sheet walks buyableModules(): SIFTER's 3 panels leave (dormant),
    // the 3 sustain pieces' 9 join (the switch on): 310 - 3 + 9 = 316 (was 310)
    // SHAPES-1 flip: NAIL STRIP, EMBER TROUGH and SPIKE RAIL join the buyable modules, a cargo panel at each star: 316 + 9 = 325
    expect(sheet.length).toBe(325);
    // NUM-3 (R1's STUN fold), measured on num3 with steps 1-3: op 118 / 160 / 27 -> 119 / 167 / 19, desk 72 / 94 / 84 / 25 /
    // 20 / 10 -> 67 / 88 / 87 / 34 / 18 / 10 / 1 (the 7 STUN-fold pieces' faces: their LEVELS ladders and KEYWORDS replace a
    // legacy NEXT STAR sentence, so their body-only views page otherwise; U2f's view below is the one the game draws)
    // x1 (cap's merge of num3 + susb), re-measured on x1: op 118 / 167 / 18 / 2, desk 66 / 86 / 90 / 34 / 18 / 10 / 1
    // NUM-4 (REQ-BFG-047, REQ-BFG-046), re-measured on num4 (the same 310 panels): the RATE rows and ladders, the kept
    // sentences' AT RATE n, the hidden timers gone and F1's longer SHIELD lines move a few body-only views: op 118 / 167 /
    // 18 / 2 -> 119 / 166 / 18 / 2, desk 66 / 86 / 90 / 34 / 18 / 10 / 1 -> 65 / 91 / 86 / 34 / 18 / 10 / 1
    console.log(`U2e ⓘ pages (body alone): op ${histogram(o.map((x) => x!.u2e)).join(" / ")}; desk ${histogram(k.map((x) => x!.u2e)).join(" / ")}`);
    // FLIP-X2 (REVIEW-NUM3 answer 2; REQ-BFG-069), re-measured on flipx2 (316 panels: SIFTER's 3 out, the sustain pieces' 9
    // in): op 119 / 166 / 18 / 2 -> 120 / 171 / 18 / 2, desk 65 / 91 / 86 / 34 / 18 / 10 / 1 -> 64 / 90 / 89 / 36 / 19 / 12 / 1
    // Y1 (REQ-BFG-070), re-measured on y1 (the same 316 panels): op 120 / 171 / 18 / 2 -> 119 / 172 / 18 / 2, desk 64 / 90 /
    // 89 / 36 / 19 / 12 / 1 -> 56 / 88 / 102 / 35 / 18 / 12, measured (Y1's new ladders, COIL's and FROSTBITE's PARTS,
    // MIMIC's and TWIN MOULD's SLUG, TESLA's DMG and GATLING's step, lengthen those LEVELS, and the faces that lost a clause
    // or a perk name are shorter, which the desk column sizes to). U2f's view, the one the game draws, is the next test's:
    // unchanged on op and desk
    // Y7b2, re-measured (the same 316 panels): the flip, op 119 / 172 / 18 / 2 -> 126 / 185 / 5, desk 56 / 88 / 102 / 35 /
    // 18 / 12 -> 15 / 97 / 131 / 48 / 16 / 9 (release Y's faces and ladders for the 30 folded pieces, no interim clause or
    // caveat, POISON's and the retired rows gone); the words, op -> 132 / 179 / 5, desk -> 21 / 105 / 133 / 32 / 15 / 10 (no
    // panel draws a perk's name, the 16 retired perk names leave the LEVELS, LOAD TIME's row is gone). U2f's view: the next
    // test
    // TXT-AZ (REQ-BFG-070; REVIEW-TXT096 Q1), re-measured (the same 316 panels): ROTARY BREECH's tap note (glossary.ts
    // TAP_NOTES rotary, on CHAMBERS) is one more KEYWORDS definition in its 4 panels' views, so op 132 / 179 / 5 -> 128 /
    // 183 / 5 and desk 21 / 105 / 133 / 32 / 15 / 10 -> 19 / 103 / 137 / 32 / 15 / 10 here; U2f's view, the one the game
    // draws (the next test's pins), is unchanged
    // TXT-AZ item 2 (REQ-BFG-070; REVIEW-TXT096 Q3), re-measured: ARMOR PRESS's and MEND PRESS's lines lead with FEEDS A
    // GUN, and the desk column sizes to its text, so 5 of their desk views page less: desk 19 / 103 / 137 / 32 / 15 / 10 ->
    // 19 / 103 / 137 / 37 / 14 / 6; op unchanged; U2f's view unchanged
    // AZ-BUMP (the flip, LADDER_FIX), re-measured on the flip's src (the same 316 panels; the test's own log line in
    // output-azbump/logs/xon-3of3-vitest.log): op 128 / 183 / 5 -> 126 / 185 / 5, desk 19 / 103 / 137 / 37 / 14 / 6 -> 19 /
    // 102 / 138 / 37 / 14 / 6. The star-ladder pass's OVERDRIVE ride-keep (★2/★3's KEEPS n% OF THE RIDE IT CUTS. on the face,
    // the KEEPS -/50%/100% RIDE row in its LEVELS) pages 2 op views and 1 desk view more; QUENCH's +40 and STOKER's 85% are as
    // wide as the numbers they replace. With LADDER_FIX off and the other two switches on both read as before
    // (output-azbump/logs/vp-L1.log). U2f's view (the next test's pins) unchanged
    // WORDS-1 (REQ-BFG-081), re-measured (the same 316 panels): the stat icons' notes ({RATE}, {SLUG}, {GEAR} on every turret's
    // and factory's stat row), the glossary words a face line prints (PART, SPEED's FROM THIS TILE ON, JAM) and the turrets'
    // two plain lines lengthen the body-only views: op 132 / 179 / 5 -> 66 / 183 / 67, desk 21 / 105 / 133 / 32 / 15 / 10 ->
    // 5 / 73 / 113 / 84 / 24 / 6 / 9 / 2. U2f's view, the one the game draws (the next test), is unchanged: 316 on 1 page
    // SPACE-1 (REQ-BFG-087), re-measured (the same 316 panels): the desk column sizes to its text with the gaps between its
    // items (up to 5 px each), so its body, and U2e's body-only view over it, is taller: desk 5 / 73 / 113 / 84 / 24 / 6 / 9 /
    // 2 -> 17 / 140 / 121 / 29 / 9. The op band's panels keep their rect (op unchanged); U2f's view (the next test) unchanged
    // EXPLAIN-1 (REQ-BFG-089, E4), re-measured (the same 316 panels): NOTES first in the view (each hidden line a separate
    // entry) lengthen the body-only views: op 66 / 183 / 67 -> 14 / 151 / 93 / 58, desk 17 / 140 / 121 / 29 / 9 -> 0 / 17 /
    // 102 / 108 / 37 / 20 / 11 / 19 / 2 (the desk column is shorter too: it sizes to its text, which lost those lines).
    // U2f's view, the one the game draws, is the next test's
    // MERGE-099C (c099 = azbump + release-099; BRIEF-MERGE-099C 3c: the shipped text decides), re-measured at c099 (the same
    // 316 panels): both sides' lines in one view, so op 14 / 151 / 93 / 58 -> 8 / 157 / 93 / 58 (azbump's 6: TXT-AZ's ROTARY
    // note and the ride-keep, as above) and desk 0 / 17 / 102 / 108 / 37 / 20 / 11 / 19 / 2 -> 0 / 12 / 106 / 109 / 41 / 16 /
    // 11 / 19 / 2. U2f's view (the next test's pins) unchanged
    // SHAPES-1 flip, re-measured on cd59be0 (325 panels; with SHAPES off the run reads the pins it replaces, and the 310
    // panels that are neither new nor reshaped page exactly as there, panel for panel): the three shaped plain rigs' 9 cargo
    // panels (op 3 / 4 pages: 2 / 7; desk 5 / 6: 6 / 3), ASSEMBLY LINE ★3's op view 2 -> 3 pages and its desk views 3 -> 4
    // (its NOTES gain the size rule), GANTRY PRESS's desk views 6 / 6 / 5 -> 4 / 4 / 3 (the desk column sizes to its text,
    // two face lines taller): op 8 / 157 / 93 / 58 -> 8 / 156 / 96 / 65, desk 0 / 12 / 106 / 109 / 41 / 16 / 11 / 19 / 2 ->
    // 0 / 12 / 104 / 114 / 46 / 17 / 11 / 19 / 2. U2f's view (the next test's pins) as noted there
    // CARD-2 (REQ-BFG-081, K4), re-measured (the same 316 panels): the turret row in words takes one label a line in the
    // desk column, which sizes to its text, so the turret panels' bodies (and this body-only view over them) are taller:
    // desk 0 / 17 / 102 / 108 / 37 / 20 / 11 / 19 / 2 -> 0 / 17 / 102 / 117 / 37 / 11 / 32; op unchanged (one line there)
    // CARD-2 (K5), re-measured: NOTES in 3x5: op 14 / 151 / 93 / 58 -> 14 / 181 / 86 / 35, desk 0 / 17 / 102 / 117 / 37 /
    // 11 / 32 -> 5 / 51 / 104 / 78 / 68 / 10
    // MERGE-099D (c099 + card3-accepted; BRIEF-MERGE-099D 1f: re-measured on the merged tree, the same 316 panels): both
    // sides' changes in one view: CARD-2's K5 (NOTES in 3x5) moves panels into 1-2 pages, c099's 6 longer op views (TXT-AZ's
    // ROTARY note and the ride-keep, MERGE-099C's) stay one bucket up: op 8 / 186 / 87 / 35 (c099 8 / 157 / 93 / 58, card3
    // 14 / 181 / 86 / 35), desk 3 / 51 / 105 / 79 / 69 / 9 (c099 0 / 12 / 106 / 109 / 41 / 16 / 11 / 19 / 2, card3 5 / 51 /
    // 104 / 78 / 68 / 10). U2f's view (the next test's pins) unchanged: op 262 / 54, the worst rune held 143 / 173, desk 315 / 1
    // SHAPES-1 x c099-card3 (RUN5 2: the merge of c099-card3-accepted into shapes1), re-measured on the merged tree (325
    // panels: c099-card3's 316, with its 3x5 NOTES and words, and the three shaped plain rigs' 9 cargo panels; GANTRY PRESS's
    // and ASSEMBLY LINE's panels with their shape lines and NOTES' size rule): op 8 / 186 / 87 / 35 (c099-card3) -> 8 / 184 /
    // 98 / 35, desk 3 / 51 / 105 / 79 / 69 / 9 -> 3 / 51 / 106 / 87 / 71 / 7 (shapes1 at 94d0492: op 8 / 156 / 96 / 65, desk
    // 0 / 12 / 104 / 114 / 46 / 17 / 11 / 19 / 2). With SHAPES set off the merged tree reads c099-card3's pins (REPORT 10).
    // U2f's view: the next test's pins
    // CARD-5 (REQ-BFG-081, L), by design: SCRAPPER's face prints its scrap damage (key `scrap`), so its ⓘ LEVELS gain that
    // ladder ([30]/65/105 MORE {DMG}) and two op views move one bucket up: [8, 184, 98, 35] -> [8, 184, 96, 37]
    // SHOPCARD-1b (REQ-BFG-081), measured (the same 325 panels; per panel against shopcard1-accepted's export): LIMPET WORKS' face line no longer
    // prints a {SLUG} icon ("THE FOE'S HULL TAKES 100 DMG 3 SEC AFTER A HIT."), so its ⓘ view lists one definition less and its 2
    // op views (cargo ★2, ★3) take 2 pages, not 3: op [8, 184, 96, 37] -> [8, 186, 94, 37]
    expect(histogram(o.map((x) => x!.u2e))).toEqual([8, 186, 94, 37]);
    // CARD-5 (L, by design): SCRAPPER's taller face (its scrap line) and LEVELS move three desk views a bucket: [3, 51, 106,
    // 87, 71, 7] -> [3, 51, 106, 90, 68, 7]
    // SHOPCARD-1b (REQ-BFG-081), measured: the desk column sizes to its text, and 20 cargo panels' longer face lines (SEAM WELDER's YOUR HULL:,
    // RIVETER's, PINCER's, STOKER's, LIMPET WORKS', ASSEMBLY LINE's START, the three shaped rigs' HITS EACH SLUG UP TO n TIMES.) make it wider,
    // so their body-only views page one less: desk [3, 51, 106, 90, 68, 7] -> [3, 56, 113, 81, 65, 7]
    expect(histogram(k.map((x) => x!.u2e))).toEqual([3, 56, 113, 81, 65, 7]);
  });

  it("U2f's: op most on 1 page and none over 2 (3 with any one rune held); desk none over 3; pinned", () => {
    const o = sheet.map((c) => infoOf(op, c)).filter((x) => !!x), k = sheet.map((c) => infoOf(desk, c)).filter((x) => !!x);
    const ho = histogram(o.map((x) => x!.view.pages.length)), hk = histogram(k.map((x) => x!.view.pages.length));
    const worst = sheet.map((c) => Math.max(0, ...runeSets.map((ws) => infoOf(op, c, ws)?.view.pages.length ?? 0)));
    const held = histogram(worst.filter((n) => n > 0));
    // FLIP-X1 (F-d): with the switch on, the worst of the 65 runes (RUNE_LIST's and the 8): a separate pin
    const worstOn = withSustain(() => sheet.map((c, i) => Math.max(worst[i], ...sustainSets.map((ws) => infoOf(op, c, ws)?.view.pages.length ?? 0))));
    const heldOn = histogram(worstOn.filter((n) => n > 0));
    console.log(`U2f ⓘ pages: op ${ho.join(" / ")}; op, the worst rune held ${held.join(" / ")} (switch on: ${heldOn.join(" / ")}); desk ${hk.join(" / ")}`);    expect(ho[0]).toBeGreaterThan(o.length / 2);
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
        // EXPLAIN-1 (REQ-BFG-089, E4): the view the game draws: NOTES first, then the LEVELS and the words explainWords lists
        const piece = panelPiece(c.run, o.d.show), words = explainWords(o.d.t, piece), levels = infoLevels(c.run, o.d.show);
        const notes = (o.d.t.notes ?? []).map((b) => b.text);
        if (!words.length && !levels.length && !notes.length) continue;
        const items = infoItems(levels, words, r.w - 10, notes);
        const free = infoFree(L, r, p.column);
        const view = infoView(items, r, p.y - 1, p.maxY + 2, free);
        const tag = `${w}x${h}: ${c.id}`;
        const header = { x: r.x, y: r.y, w: r.w, h: p.y - 1 - r.y }, q = questionRect(r, p.y, o.tap, o.buttons);
        if (view.areas.length > 1 || view.areas[0].h > p.maxY + 2 - (p.y - 1)) grown++;
        expect(view.pages.flat(2).map((it) => it.note ?? it.level ?? it.word), `${tag}: every entry, in order`).toEqual([...notes, ...levels, ...words]);
        // EXPLAIN-1 (E3): the ⓘ's target is a finger's square, 4 px into the body on a phone: the view never covers its part
        // in the header (where its drawn box is); over the body the open view's region, registered after it, takes the press
        const qHead = q && q.y < p.y - 1 ? { ...q, h: Math.min(q.h, p.y - 1 - q.y) } : null;
        for (const a of view.areas) {
          expect(overlaps(a, header), `${tag}: the header`).toBe(false);
          expect(overlaps(a, questionBox(r)), `${tag}: ⓘ`).toBe(false);
          if (qHead) expect(overlaps(a, qHead), `${tag}: ⓘ's hit rect in the header`).toBe(false);
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
// FLIP-X2 (REVIEW-NUM3 answer 2; REQ-BFG-069), re-measured on flipx2 (the sheet's 316 panels: SIFTER's 3 out, the sustain
// pieces' 9 in; at step 1b, SIFTER alone, op read [300, 2]): op [303, 2] -> [309, 2]; the worst rune held [276, 34] ->
// [280, 36], the same with the switch on; desk [296, 9] -> [302, 9]. U2f's aims hold as above.
// Y1 (REQ-BFG-070), re-measured on y1 (the same 316 panels): op [309, 2] unchanged; desk [302, 9] unchanged; the worst rune
// held [280, 36] -> [282, 34], the same with the switch on (COIL's and FROSTBITE's clauses left their faces, so two more
// views fit one page with a rune held). U2f's aims hold as above.
// Y7b2 (the flip), re-measured (the same 316 panels): op [309, 2] -> [316], every op view on one page; the worst rune held
// [282, 34] -> [304, 12], the same with the switch on; desk [302, 9] -> [316] (release Y's shorter faces and LEVELS for the
// 30 folded pieces: no interim clause or caveat, POISON's row gone). The words move none of the four. U2f's aims hold as
// above.
// EXPLAIN-1 (REQ-BFG-089, E4), re-measured (the same 316 panels): the view now opens with NOTES, the lines the default face
// hides (a turret's two kind lines, the flavour, the hint, a plain rig's rig sentence), each a separate entry, so a third of
// the views take a second page: op [316] -> [260, 56], the worst rune held [234, 82] -> [143, 173], the same with the switch
// on, desk [316] -> [277, 39]. U2f's aims hold: op most on 1 page and none over 2, a rune held none over 3, desk none over 3
// SHAPES-1 flip, re-measured on cd59be0 (the sheet's 325 panels: the three shaped plain rigs' 9 cargo panels in; with SHAPES
// off the run reads the pins it replaces, and the 310 panels neither new nor reshaped page exactly as there): op [260, 56] ->
// [260, 65] (the 9: 2 on one page, 7 on two; GANTRY PRESS ★1 and ★2 1 -> 2 pages, its face's two new lines and its NOTES'
// size rule); the worst rune held [143, 173] -> [142, 183], the same with the switch on (the 9 on two; ASSEMBLY LINE ★3
// 1 -> 2, its NOTES' size rule); desk [277, 39] -> [283, 42] (the 9: 6 on one, 3 on two). U2f's aims hold: op most on 1
// page and none over 2, a rune held none over 3, desk none over 3
// CARD-2 (REQ-BFG-081, K5; READ-3 fix 5), measured: NOTES in the 3x5 face (each line still its own entry): op [260, 56] ->
// [262, 54] (the phone's view already grows into the room above the panel, so NOTES' rows were seldom what paged it),
// the worst rune held [143, 173] unchanged, desk [277, 39] -> [315, 1]
// SHAPES-1 x c099-card3 (RUN5 2: the merge of c099-card3-accepted into shapes1), re-measured on the merged tree (the sheet's
// 325 panels: c099-card3's 316 and the three shaped plain rigs' 9 cargo panels): op [262, 54] (c099-card3) -> [271, 54], net
// 9 more on one page and none more on two (shapes' side, before card3's 3x5 NOTES: [260, 56] -> [260, 65]); the worst rune
// held [142, 183], the same with the switch on (= shapes' side's; c099-card3 [143, 173]);
// desk [315, 1] (c099-card3) -> [324, 1] (shapes' side [283, 42]). With SHAPES set off the merged tree reads c099-card3's
// pins (REPORT 10). U2f's aims hold: op most on 1 page and none over 2, a rune held none over 3, desk none over 3
const U2F_OP = [270, 55]; // CARD-5 (L, by design): SCRAPPER's scrap ladder takes one op view to 2 pages: was [271, 54]. SHAPES-1 x c099-card3: was [262, 54] (SHAPES-1 flip: [260, 56] -> [260, 65]; CARD-2: [260, 56] -> [262, 54]; EXPLAIN-1: was [316]; Y7b2 (the flip): was [309, 2])
// WORDS-1 (REQ-BFG-081), measured: the stat icons' and face words' notes list in the view, so with the worst rune's keywords
// after them 82 views take a second page (was [304, 12]); none takes a third (U2f's aim: 3 at most with a rune held)
const U2F_OP_RUNE = [145, 180]; // SHOPCARD-1b: was [142, 183] (LIMPET WORKS' 3 views lose the SLUG note's definition, so each fits one page with the worst rune held). SHAPES-1 flip: was [143, 173] (EXPLAIN-1: was [234, 82]; Y7b2 (the flip): was [282, 34])
/** FLIP-X1 (F-d, SUS-D §9): the worst one rune held with the switch on (RUNE_LIST's 57 and the 8 sustain runes), measured
 *  on flipx1: the same as RUNE_LIST's (no sustain rune pages a view further than its worst rune in play). The switch-off
 *  pin above is RUNE_LIST's, unchanged. FLIP-X2: still the same as RUNE_LIST's (was [276, 34]). Y1: still the same (was
 *  [280, 36]). Y7b2 (the flip): still the same (was [282, 34]). EXPLAIN-1: still the same (was [234, 82]). */
const U2F_OP_RUNE_ON = [145, 180]; // SHOPCARD-1b: was [142, 183], as U2F_OP_RUNE. SHAPES-1 flip: the same as RUNE_LIST's, as before (was [143, 173]; WORDS-1: was [304, 12])
const U2F_DESK = [324, 1]; // SHAPES-1 x c099-card3: was [315, 1] (SHAPES-1 flip: was [277, 39] -> [283, 42]; CARD-2 (K5): was [277, 39] -> [315, 1]; EXPLAIN-1: was [316]; Y7b2 (the flip): was [302, 9])

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
  }, 120_000); // FLIP-X2 (a load timeout, not the flip): 17-19 s in flipx2's whole-suite runs, but 33-39 s in 3 of 4 runs of
  // this job at host load 11-15, against the global 30 s; its own limit, as 0.8.8 (bccf33f) gave two heavy tests: no check
  // changed

  it("NUM-4's shot (the desk at 480x270 with a rune row: the shot tooling's bb.holdRunes skips the pick's game.resize()): WARD BELL's view pages on the screen, and every panel's does", () => {
    // the game steps the 1920x1080 desk from x4 (480x270) to x3 (640x360) when a rune is held (runeRowFits); this is the
    // layout at x4 with the rune row, whose column runs past the screen's bottom (its cargo tray is cut too)
    const v4 = sheetView(1920, 1080, 1, 0).v, row = runeRowH(v4, 1);
    const at4 = { v: v4, L: shiftLayout(buildLayout(v4.W, v4.H - row, false, 5, false, 0), row, v4.H), touch: false };
    // ZOOM-1 (REQ-BFG-080, call 4): the landscape column now ends 2 px above the screen's foot (the cargo tray sits under
    // FIGHT, not under the hull), so in this state it no longer runs past the bottom: true -> false. The panels' sweep below
    // is unchanged (every line of every panel's view still on the screen)
    expect([at4.v.W, at4.v.H, at4.L.info.y + at4.L.info.h > at4.v.H]).toEqual([480, 270, false]);
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
