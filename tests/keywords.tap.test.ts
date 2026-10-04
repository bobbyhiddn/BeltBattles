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
  counts: { panels: number; targets: number; words: number; tapped: Set<string> }) {
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
  if (words.length) {
    // every word is reachable: the `?` button is there, inside the panel, clear of the buttons; its view lists every word
    expect(q, `${tag}: ?`).not.toBeNull();
    expect(within(q!, plan.r), `${tag}: ? inside`).toBe(true);
    for (const b of buttons) expect(overlaps(q!, b), `${tag}: ? clear of a button`).toBe(false);
    const pages = viewPages(words, plan.r.w - 10, plan.maxY + 2 - (plan.y - 1));
    expect(pages.flat(), `${tag}: the KEYWORDS view lists every word`).toEqual(words);
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

  it("a face keyword's definition fills in the tapped piece's own number (TESLA ARC's STUN at its class factor), a NEXT★ icon alone is a target", () => {
    const { v, L } = screen(402, 690, 3);
    const run = furnace();
    run.inventory = [{ uid: 900, def: "tesla" }, { uid: 901, def: "temper" }];
    const t = opened(v, L, { run, sel: { kind: "cargo", uid: 900 } });
    const words = panelWords(t.d.t.body, panelPiece(run, t.d.show));
    const stun = words.find((w) => w.word === "STUN")!, piece = panelPiece(run, t.d.show)!;
    const own = faceAt("tesla", 1, piece.o)!.reminders.find((r) => r.includes("{*STUN}"))!;
    expect(stun.text).toBe(`${own} ${glossaryEntry("STUN")!.extra}`);
    expect(own).toContain(`${fmtSec(scaleCore(ITEMS.tesla.core!, piece.o.k!).stall!)}{SEC}`);
    const temper = opened(v, L, { run, sel: { kind: "cargo", uid: 901 } });
    const next = keywordTargets(visibleLines(temper.plan), temper.plan, panelPiece(run, temper.d.show), temper.buttons)
      .filter((k) => k.word === "BURN" && k.glyph.w <= 5);
    expect(next.length, "the NEXT★ line's BURN icon alone").toBeGreaterThanOrEqual(1);
  });
});
