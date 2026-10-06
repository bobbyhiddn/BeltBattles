// TAP-093 (backlog #340, REQ-BFG-040): the build screen's MENU and SND reach a finger's target (TAP_CSS, 44 CSS px) on
// portrait phones. Where the screen spares the height with a rune row held, the top bar grows to a finger's target and the
// shop moves down by as much (phoneBarLift; the band keeps its height); elsewhere one MENU sits in the bar's top-left
// corner, its target the corner's dead space (cornerTarget: clear of every target under the bar), and sound lives in its
// card (chrome.ts). Landscape and non-phone layouts are untouched (lift 0, the default: zoom.test.ts compares them with BASE).
import { describe, expect, it } from "vitest";
import { BAR_H, buildLayout, buildScale, cornerTarget, phoneBarLift, phoneScreen, type BuildLayout } from "../src/screens/build/layout";
import { runeBarLayout, runeChip, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { TAP_CSS } from "../src/ui/tap";
import type { Rect } from "../src/ui/ui";

const OFFERS = 5;
/** A portrait phone view as the build screen frames it (BuildScreen.pickScale with no rune held, then layout()). */
function view(w: number, h: number, dpr: number) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
  expect(phoneScreen(pw, ph, dpr)).toBe(true);
  const scale = buildScale(pw, ph, true, dpr), k = scale / dpr;
  const W = Math.floor(pw / scale), H = Math.floor(ph / scale), tap = Math.ceil(TAP_CSS / k);
  const v = { scale, dpr };
  const reserve = runeRowH(v, 1);
  const lift = phoneBarLift(W, H, OFFERS, tap, reserve);
  /** the layout with `n` runes held (layout(): the rune row off the height, then the shift), and its rune strip */
  const at = (n: number): { L: BuildLayout; chips: Rect[] } => {
    const row = runeRowH(v, n);
    const L = shiftLayout(buildLayout(W, H - row, true, OFFERS, true, tap, lift), row, H);
    const B = n ? runeBarLayout(W, L.bar.y + L.bar.h, n, runeChip(v)) : null;
    return { L, chips: B ? [...B.chips, ...(B.more ? [B.more] : [])] : [] };
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

  it("the corner MENU's target: a finger's square in the corner at x5, clear of every target under the bar, with or without runes", () => {
    const menuR = { x: 2, y: 1, w: 27, h: 12 };
    for (const [name, w, h, d] of VIEWS) {
      const v = view(w, h, d);
      if (v.lift) continue;
      for (const n of [0, 1, 3, 6, 10]) {
        const { L, chips } = v.at(n);
        const others = [...L.cards, L.reroll, ...L.packs, ...chips];
        const t = cornerTarget(menuR, v.tap, others);
        const tag = `${name}, ${n} runes`;
        // every rect from the corner, over the drawn button, 1 px clear of every other target
        for (const r of t) {
          expect([r.x, r.y], tag).toEqual([0, 0]);
          for (const o of others) expect(hit({ x: r.x, y: r.y, w: r.w + 1, h: r.h + 1 }, o), `${tag}: ${JSON.stringify(r)} vs ${JSON.stringify(o)}`).toBe(false);
        }
        expect(t.some((r) => r.w >= menuR.x + menuR.w && r.h >= menuR.y + menuR.h), tag).toBe(true);
        // a finger's target both ways: the tallest rect tap tall, the widest tap wide (an L at DPR 2 with runes)
        expect(Math.max(...t.map((r) => r.h)) * v.k, tag).toBeGreaterThanOrEqual(TAP_CSS);
        expect(Math.max(...t.map((r) => r.w)) * v.k, tag).toBeGreaterThanOrEqual(TAP_CSS);
        // x5 @3 (and any view with no rune strip): the tallest rect is itself a finger's square (with runes the bar's part
        // reaches past the first chip's column, so the target is that square and a wider strip in the bar). DPR 2 with
        // runes: an L, its column 27 px wide (40.5 CSS px: the first rune chip 28 px in, a finger's target 30)
        if (d === 3 || n === 0) expect(Math.min(t[0].w, t[0].h) * v.k, `${tag}: a finger's square`).toBeGreaterThanOrEqual(TAP_CSS);
        else expect([t.length, t[0].w, t[0].h, t[1].w], `${tag}: an L`).toEqual([2, 27, v.tap, 31]);
        expect(t.length, tag).toBe(n ? 2 : 1);
      }
    }
  });

  it("the corner MENU's target stops above a details panel grown over the shop", () => {
    const v = view(390, 660, 3);
    const { L } = v.at(3);
    const top = L.bar.y + L.bar.h + 1; // layout.ts panelRect: a grown panel's top
    const t = cornerTarget({ x: 2, y: 1, w: 27, h: 12 }, v.tap, [...L.cards, L.reroll, ...L.packs], top);
    expect(t).toEqual([{ x: 0, y: 0, w: 31, h: top }]);
  });
});
