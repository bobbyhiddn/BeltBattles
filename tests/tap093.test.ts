// TAP-093 (backlog #340, REQ-BFG-040): the build screen's MENU and SND reach a finger's target (TAP_CSS, 44 CSS px) on
// portrait phones. Where the screen spares the height with a rune row held, the top bar grows to a finger's target and the
// shop moves down by as much (phoneBarLift; the band keeps its height); elsewhere one MENU sits in the bar's top-left
// corner, its target the corner's dead space (cornerTarget: clear of every target under the bar), and sound lives in its
// card (chrome.ts). Landscape and non-phone layouts are untouched (lift 0, the default: zoom.test.ts compares them with BASE).
// TAP-093b (backlog #340 follow-up): while the corner MENU is up (layout.ts cornerTap), the rune bar's chips start 1 px
// right of its finger's square (runeBar.ts runeChipX0: tap + 1, never left of 28), so with runes held its target holds a
// full finger's square on every phone view (it was an L at DPR 2, 2.625 and x4 @3). runeBarLayout's default stays 28; a
// lifted bar, landscape and the desktop keep their chips where they were.
import { describe, expect, it } from "vitest";
import { BAR_H, buildLayout, buildScale, cornerTap, cornerTarget, phoneBarLift, phoneScreen, type BuildLayout } from "../src/screens/build/layout";
import { RuneBar, runeBarLayout, runeChip, runeChipW, runeChipX0, runeRowH, shiftLayout, type RuneBarLayout } from "../src/ui/runeBar";
import { RUNES, isRune } from "../src/sim/runes";
import { TAP_CSS } from "../src/ui/tap";
import type { Rect } from "../src/ui/ui";
import type { BuildScreen } from "../src/screens/build/build";

const OFFERS = 5;
/** TAP-093b: furnace's ten (rivalBuilds.ts bulwark), in pick order: the runes held (kit093/targets093.mjs's). */
const TEN = ["coal_chute", "quick_latch", "tar_barrel", "heat_sink", "warlords_due", "fat_purse", "searing", "pyre_heart", "ward_stone", "shatter_shot"];
type V = { scale: number; dpr: number };
/** TAP-093b: the rune bar as the build screen lays it out on `L` (RuneBar.layout, which the screen, chrome.ts's corner
 *  target and the touchcheck call), the first `n` of TEN held. */
function barOf(L: BuildLayout, v: V, W: number, n: number): RuneBarLayout | null {
  const s = { run: { build: { runes: TEN.slice(0, n).map((id) => ({ id })) } }, game: { view: v, W }, L };
  return new RuneBar().layout(s as unknown as BuildScreen);
}
/** The same bar with runeBarLayout's default x0 (28): the chips before TAP-093b. */
function oldBarOf(L: BuildLayout, v: V, W: number, n: number): RuneBarLayout | null {
  if (!n) return null;
  const side = runeChip(v);
  return runeBarLayout(W, L.bar.y + L.bar.h, n, side, TEN.slice(0, n).map((id) => (isRune(id) ? runeChipW(RUNES[id], side) : side)));
}
const targets = (B: RuneBarLayout | null): Rect[] => (B ? [...B.chips, ...(B.more ? [B.more] : [])] : []);
/** TAP-093b: the number of sweep views whose 10-rune row shows one chip fewer before the "+k" chip (the sweep test counts
 *  them): 24 at x3 @2 (340 and 390 CSS px wide: W 226 and 260, 5 -> 4 and 6 -> 5) and 3 at x4 @3 (330 wide, 548-580
 *  tall: W 247, 5 -> 4). At every width it happens where the 3-6 px shift crosses a chip's pitch (W 226-228 and 259-261
 *  at x3 @2, 220-221 and 252-253 at x4 @2.625, 244-249 at x4 @3; REPORT TAP-093b). */
const FEWER = 27;

/** A portrait phone view as the build screen frames it (BuildScreen.pickScale with no rune held, then layout()). */
function view(w: number, h: number, dpr: number) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
  expect(phoneScreen(pw, ph, dpr)).toBe(true);
  const scale = buildScale(pw, ph, true, dpr), k = scale / dpr;
  const W = Math.floor(pw / scale), H = Math.floor(ph / scale), tap = Math.ceil(TAP_CSS / k);
  const v = { scale, dpr };
  const reserve = runeRowH(v, 1);
  const lift = phoneBarLift(W, H, OFFERS, tap, reserve);
  /** the layout with `n` runes held (layout(): the rune row off the height, then the shift), its rune bar (RuneBar.layout)
   *  and the bar's targets, and the bar at the old x0 (28) */
  const at = (n: number): { L: BuildLayout; B: RuneBarLayout | null; chips: Rect[]; old: RuneBarLayout | null } => {
    const row = runeRowH(v, n);
    const L = shiftLayout(buildLayout(W, H - row, true, OFFERS, true, tap, lift), row, H);
    const B = barOf(L, v, W, n);
    return { L, B, chips: targets(B), old: oldBarOf(L, v, W, n) };
  };
  return { W, H, k, tap, lift, at };
}
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const VIEWS: [string, number, number, number][] = [
  ["390x660", 390, 660, 3], ["390x664", 390, 664, 3], ["402x690", 402, 690, 3], ["390x844", 390, 844, 3], ["430x739", 430, 739, 3], ["360x640@2", 360, 640, 2],
];

describe("TAP-093: the phone's top bar (backlog #340)", () => {
  it("lifts the bar only where the screen spares it with a rune row: 390x844 @3, by 13 px (27 px: 45 CSS px)", () => {
    const lifts = Object.fromEntries(VIEWS.map(([n, w, h, d]) => [n, view(w, h, d).lift]));
    expect(lifts).toEqual({ "390x660": 0, "390x664": 0, "402x690": 0, "390x844": 13, "430x739": 0, "360x640@2": 0 });
    const v = view(390, 844, 3);
    expect(BAR_H + v.lift).toBe(v.tap);
    expect((BAR_H + v.lift) * v.k).toBeGreaterThanOrEqual(TAP_CSS);
  });

  it("a lifted bar moves the shop and the rest down by the lift and keeps the band, with or without runes", () => {
    const v = view(390, 844, 3);
    for (const n of [0, 1, 3, 10]) {
      const { L } = v.at(n);
      const row = runeRowH({ scale: 5, dpr: 3 }, n);
      const base = shiftLayout(buildLayout(v.W, v.H - row, true, OFFERS, true, v.tap), row, v.H);
      expect(L.bar.h, `${n} runes`).toBe(base.bar.h + v.lift);
      expect(L.info.h, `${n} runes: the band keeps its height`).toBe(base.info.h);
      expect(L.cards.map((c) => c.y - v.lift), `${n} runes`).toEqual(base.cards.map((c) => c.y));
      expect([L.reroll.y, L.info.y, ...L.packs.map((p) => p.y)], `${n} runes`).toEqual([base.reroll.y + v.lift, base.info.y + v.lift, ...base.packs.map((p) => p.y + v.lift)]);
      // everything still on the screen: the cargo tray and FIGHT end inside it, the hull under the band
      expect(Math.max(L.cargo.y + L.cargo.h, L.fight.y + L.fight.h), `${n} runes`).toBeLessThanOrEqual(v.H);
      expect(L.hull.y, `${n} runes`).toBeGreaterThan(L.info.y + L.info.h);
      // nothing under the bar: the rune strip (or the shop) starts at its foot or lower
      expect(Math.min(...L.cards.map((c) => c.y)), `${n} runes`).toBeGreaterThanOrEqual(L.bar.h + row);
    }
  });

  it("without a lift, the layout is exactly as before (lift 0)", () => {
    for (const [n, w, h, d] of VIEWS) {
      const v = view(w, h, d);
      if (v.lift) continue;
      expect(buildLayout(v.W, v.H, true, OFFERS, true, v.tap, v.lift), n).toEqual(buildLayout(v.W, v.H, true, OFFERS, true, v.tap));
    }
  });

  it("the corner MENU's target: a finger's square in the corner, clear of every target under the bar, with or without runes (TAP-093b: at DPR 2 too)", () => {
    const menuR = { x: 2, y: 1, w: 27, h: 12 };
    for (const [name, w, h, d] of VIEWS) {
      const v = view(w, h, d);
      if (v.lift) continue;
      for (const n of [0, 1, 3, 6, 10]) {
        const { L, B, chips } = v.at(n);
        const others = [...L.cards, L.reroll, ...L.packs, ...chips];
        const t = cornerTarget(menuR, v.tap, others);
        const tag = `${name}, ${n} runes`;
        // every rect from the corner, over the drawn button, 1 px clear of every other target
        for (const r of t) {
          expect([r.x, r.y], tag).toEqual([0, 0]);
          for (const o of others) expect(hit({ x: r.x, y: r.y, w: r.w + 1, h: r.h + 1 }, o), `${tag}: ${JSON.stringify(r)} vs ${JSON.stringify(o)}`).toBe(false);
        }
        expect(t.some((r) => r.w >= menuR.x + menuR.w && r.h >= menuR.y + menuR.h), tag).toBe(true);
        // TAP-093b: the tallest rect is itself a finger's square (tap px both ways: 45 CSS px) on every view, runes or none;
        // with runes the bar's part reaches past the first chip's column, so the target is that square and a wider strip
        expect([t[0].w >= v.tap, t[0].h >= v.tap], `${tag}: a finger's square`).toEqual([true, true]);
        expect(Math.min(t[0].w, t[0].h) * v.k, `${tag}: a finger's square`).toBeGreaterThanOrEqual(TAP_CSS);
        // the chips start right of it: 31 at DPR 2 (tap 30; they started at 28, the column 27 px: 40.5 CSS px), 28 at x5
        if (n) expect(B!.chips[0].x, `${tag}: the chips' x0`).toBe(d === 2 ? 31 : 28);
        if (d === 2 && n) expect([t.length, t[0].w, t[0].h, t[1].w], `${tag}: the square and the bar's strip`).toEqual([2, 30, 30, 31]);
        expect(t.length, tag).toBe(n ? 2 : 1);
      }
    }
  });

  it("over phone sizes 320-430 x 548-932 at DPR 2, 2.625 and 3, with 0, 1, 3 and 10 runes: the band never shrinks; a lifted bar is a finger's target tall; else the corner MENU's target holds a finger's square, with runes on every view (TAP-093b), the one L left the no-rune 320-330 CSS px @3 case; nothing touches a target under the bar; 10 runes show at most one chip fewer", () => {
    const seen: { views: number; lifted: number; square: number; ell: number; minSq?: number; moved: number; fewer: string[] } = { views: 0, lifted: 0, square: 0, ell: 0, moved: 0, fewer: [] };
    for (const dpr of [2, 2.625, 3]) {
      for (let w = 320; w <= 430; w += 10) {
        for (let h = 548; h <= 932; h += 16) {
          const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
          if (!phoneScreen(pw, ph, dpr)) continue;
          const v = view(w, h, dpr);
          seen.views++;
          if (v.lift) seen.lifted++;
          // chrome.ts drawTopBar: MENU's drawn button, 21 px wide on a narrow bar (W under 200)
          const menuR = { x: 2, y: 1, w: v.W < 200 ? 21 : 27, h: 12 };
          for (const n of [0, 1, 3, 10]) {
            const row = runeRowH({ scale: v.k * dpr, dpr }, n);
            // a rune row the screen can't hold steps the game's scale down (runeRowFits); those frames aren't this one
            const base = shiftLayout(buildLayout(v.W, v.H - row, true, OFFERS, true, v.tap), row, v.H);
            if (n && base.info.h < 24) continue;
            const { L, B, chips, old } = v.at(n);
            const tag = `${w}x${h}@${dpr}, ${n} runes`;
            expect(L.info.h, `${tag}: the band keeps its height`).toBe(base.info.h);
            // TAP-093b: the chips start at tap + 1 exactly where the corner MENU is up and its square reaches past 27
            if (n) expect(B!.chips[0].x, `${tag}: the chips' x0`).toBe(!v.lift && v.tap > 27 ? v.tap + 1 : 28);
            if (n && B!.chips[0].x !== old!.chips[0].x) seen.moved++;
            if (n === 10) {
              // the cost: at most one chip fewer before the "+k" chip, which still ends inside the screen
              expect(old!.shown - B!.shown, tag).toBeLessThanOrEqual(1);
              const last = B!.more ?? B!.chips[B!.shown - 1];
              expect(last.x + last.w, tag).toBeLessThanOrEqual(v.W - 3);
              if (B!.shown < old!.shown) seen.fewer.push(`${w}x${h}@${dpr}`);
            }
            if (v.lift) {
              expect(L.bar.h * v.k, tag).toBeGreaterThanOrEqual(TAP_CSS);
              expect(Math.min(...L.cards.map((c) => c.y), L.reroll.y), tag).toBeGreaterThan(L.bar.h + row);
              continue;
            }
            const others = [...L.cards, L.reroll, ...L.packs, ...chips];
            const t = cornerTarget(menuR, v.tap, others);
            for (const r of t) for (const o of others) expect(hit({ x: r.x, y: r.y, w: r.w + 1, h: r.h + 1 }, o), `${tag}: ${JSON.stringify(r)} vs ${JSON.stringify(o)}`).toBe(false);
            expect(Math.max(...t.map((r) => r.h)) * v.k, tag).toBeGreaterThanOrEqual(TAP_CSS);
            expect(Math.max(...t.map((r) => r.w)) * v.k, tag).toBeGreaterThanOrEqual(TAP_CSS);
            if (Math.min(t[0].w, t[0].h) >= v.tap) {
              seen.square++;
              expect(Math.min(t[0].w, t[0].h) * v.k, tag).toBeGreaterThanOrEqual(TAP_CSS);
            } else {
              // the one L left (option (c), kept): no rune held, on the narrowest x5 screens (320-330 CSS px @3), where the
              // centred card row starts 24-27 px in. Both arms a finger's target: the column tap px tall, the strip tap wide
              seen.ell++;
              expect([n, dpr, Math.round(v.k * dpr), w <= 330], `${tag}: an L only with no rune, 320-330 CSS px @3`).toEqual([0, 3, 5, true]);
              expect(Math.min(...L.cards.map((c) => c.x)) - 1 < v.tap, `${tag}: the first card cuts the square`).toBe(true);
              expect([t.length, t[0].h >= v.tap, t[1].w >= v.tap], `${tag}: an L`).toEqual([2, true, true]);
              seen.minSq = Math.min(seen.minSq ?? Infinity, Math.min(t[0].w, t[0].h) * v.k);
            }
          }
        }
      }
    }
    expect(seen.views).toBeGreaterThan(500);
    expect(seen.lifted).toBeGreaterThan(0);
    expect(seen.moved).toBeGreaterThan(0);
    expect(seen.ell).toBeGreaterThan(0);
    // the narrowest L's column: no rune at 320 CSS px @3 (x5), the first card 24 px in: 23 px, 38.3 CSS px (it was the
    // runes-held x4 @3 column, 27 px: 36 CSS px, before TAP-093b)
    expect(seen.minSq).toBeCloseTo(23 * (5 / 3), 5);
    // 10 runes: the views whose row shows one chip fewer before the "+k" chip (REPORT TAP-093b lists them)
    expect(seen.fewer.length).toBe(FEWER);
  });

  it("the corner MENU's target stops above a details panel grown over the shop", () => {
    const v = view(390, 660, 3);
    const { L } = v.at(3);
    const top = L.bar.y + L.bar.h + 1; // layout.ts panelRect: a grown panel's top
    const t = cornerTarget({ x: 2, y: 1, w: 27, h: 12 }, v.tap, [...L.cards, L.reroll, ...L.packs], top);
    expect(t).toEqual([{ x: 0, y: 0, w: 31, h: top }]);
  });
});

describe("TAP-093b: the rune chips right of the corner MENU's finger square", () => {
  it("runeBarLayout's default x0 is still 28 (the label column's), and runeChipX0 is tap + 1, never under 28", () => {
    for (const [W, chip] of [[234, 27], [240, 30], [250, 30], [269, 29], [240, 33], [192, 27], [633, 33], [640, 22], [480, 22]]) {
      for (const n of [1, 3, 10]) {
        const B = runeBarLayout(W, 14, n, chip);
        expect((B.chips[0] ?? B.more)!.x, `${W} ${chip} ${n}`).toBe(28);
        expect(runeBarLayout(W, 14, n, chip, [], undefined), `${W} ${chip} ${n}`).toEqual(B);
        expect(runeBarLayout(W, 14, n, chip, [], 28), `${W} ${chip} ${n}`).toEqual(B);
      }
    }
    expect([22, 27, 28, 29, 30, 33].map(runeChipX0)).toEqual([28, 28, 29, 30, 31, 34]);
    // an x0 moves every chip and the "+k" chip by as much, while they fit
    const B = runeBarLayout(240, 14, 3, 30), C = runeBarLayout(240, 14, 3, 30, [], 31);
    expect(C.chips.map((c) => c.x)).toEqual(B.chips.map((c) => c.x + 3));
  });

  it("the chips don't move where the corner MENU isn't up (a lifted bar, landscape, the desktop) nor where its square ends left of 28 (x5 @3)", () => {
    const frames: [string, number, number, number, number][] = [
      // [name, CSS w, h, dpr, the corner square's side (cornerTap; 0: no corner MENU)]
      ["390x844@3 lifted", 390, 844, 3, 0], ["360x800@2 lifted", 360, 800, 2, 0], ["412x915@2.625 lifted", 412, 915, 2.625, 0],
      ["844x390@3 landscape", 844, 390, 3, 0], ["640x360@2 landscape", 640, 360, 2, 0],
      ["1280x800@1 desktop", 1280, 800, 1, 0], ["1920x1080@1 desktop", 1920, 1080, 1, 0], ["1024x1366@2 tablet", 1024, 1366, 2, 0],
      ["390x660@3 corner x5", 390, 660, 3, 27], ["402x690@3 corner x5", 402, 690, 3, 27],
    ];
    for (const [name, w, h, dpr, side] of frames) {
      const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05, phone = phoneScreen(pw, ph, dpr);
      const scale = buildScale(pw, ph, portrait, dpr), v = { scale, dpr };
      const W = Math.floor(pw / scale), H = Math.floor(ph / scale), tap = phone ? Math.ceil(TAP_CSS / (scale / dpr)) : 0;
      const lift = phone && portrait ? phoneBarLift(W, H, OFFERS, tap, runeRowH(v, 1)) : 0;
      for (const n of [1, 3, 10]) {
        const row = runeRowH(v, n);
        const L = shiftLayout(buildLayout(W, H - row, portrait, OFFERS, phone && portrait, tap, lift), row, H);
        const tag = `${name}, ${n} runes`;
        expect(cornerTap(L, Math.ceil(TAP_CSS / (scale / dpr))), tag).toBe(side);
        const B = barOf(L, v, W, n);
        expect(B, tag).toEqual(oldBarOf(L, v, W, n));
        expect(B!.chips[0].x, tag).toBe(28);
      }
    }
  });
});
