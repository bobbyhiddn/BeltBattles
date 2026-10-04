// bb-0.8.6 (REQ-BFG-051, job PACKS P5; oracle 43f2c3d185b37c07): the two fixed pack slots beside REROLL, on desk and in the
// zoomed-out phone layout. On every phone (portrait or landscape: ui/tap.ts isPhone) each slot is at least TAP_CSS CSS px
// both ways; no slot overlaps another control; every slot is on screen. Desk: a column right of REROLL, the two stacked,
// the row recentred (the cards keep wideCardW, never under CARD_TEXT_MIN_W; on the narrowest rows the gap before REROLL,
// then REROLL down to REROLL_MIN_W, then the column give way). Landscape phones: the two side by side beside REROLL.
// Portrait: a column in the margin right of the grid (no card moves), else a pack row under REROLL's row. Each slot shows
// the pack's icon, its amount and its price ("+4 BELT" / "2G", "+25 HULL" / "5G"), inside its frame.
import { describe, expect, it } from "vitest";
import { PACK_IDS } from "../src/sim/content";
import {
  CARD_H, CARD_TEXT_MIN_W, CARD_W, PACK_LAND_MIN_W, PACK_MIN_W, PACK_W, REROLL_MIN_W, WIDE_CARD_H, buildLayout, buildScale, landscapeRow,
  packRects, phoneScreen, wideCardW, type BuildLayout,
} from "../src/screens/build/layout";
import { PACK_TALL_H, packAmount, packPriceText } from "../src/screens/build/shop";
import { textWidth } from "../src/render/font";
import { TAP_CSS } from "../src/ui/tap";
import type { Rect } from "../src/ui/ui";

const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const onScreen = (a: Rect, W: number, H: number) => a.x >= 0 && a.y >= 0 && a.x + a.w <= W && a.y + a.h <= H;

/** A view's build layout as the game picks it (BuildScreen.pickScale and layout(): the phone cap, buildScale, the
 *  portrait phone's layout, and on any phone the finger target in art px). */
function view(cw: number, ch: number, dpr: number): { L: BuildLayout; css: number; phone: boolean; tap: number } {
  const pw = Math.floor(cw * dpr), ph = Math.floor(ch * dpr), portrait = ch > cw;
  const phone = phoneScreen(pw, ph, dpr);
  const s = buildScale(pw, ph, portrait, dpr);
  const tap = phone ? Math.ceil(TAP_CSS / (s / dpr)) : 0;
  return { L: buildLayout(Math.floor(pw / s), Math.floor(ph / s), portrait, 5, portrait && phone, tap), css: s / dpr, phone, tap };
}

/** Every control of the layout a slot must stay clear of. */
const controls = (L: BuildLayout): Rect[] => [L.bar, L.info, L.cargo, L.fight, L.reroll, L.hull, ...L.cards, ...(L.foe ? [L.foe] : [])];

/** The slot's labels inside its frame (shop.ts drawPack's two faces), and REROLL's (shop.ts drawReroll). */
function labelsFit(r: Rect, id: (typeof PACK_IDS)[number]): boolean {
  if (r.h >= PACK_TALL_H) {
    const [n, word] = packAmount(id).split(" ");
    return [n, word].every((t) => textWidth(t, "3") <= r.w - 2) && textWidth(packPriceText(id)) <= r.w - 2 && r.h >= 40;
  }
  return r.h >= 20 && textWidth(packAmount(id), "3") <= r.w - 2 && 16 + textWidth(packPriceText(id)) <= r.w - 1;
}
const rerollFits = (r: Rect) => textWidth("REROLL", "3") <= r.w - 4 && 14 <= r.w - 4;

/** The checks every layout passes: both slots, on screen, clear of every control and of each other, labels inside. */
function sound(L: BuildLayout, tag: string): void {
  const packs = packRects(L);
  expect(packs.length, tag).toBe(2);
  for (const [i, r] of packs.entries()) {
    expect(onScreen(r, L.W, L.H), `${tag} ${JSON.stringify(r)} in ${L.W}x${L.H}`).toBe(true);
    for (const o of controls(L)) expect(hit(r, o), `${tag} ${JSON.stringify(r)} vs ${JSON.stringify(o)}`).toBe(false);
    expect(labelsFit(r, PACK_IDS[i]), `${tag} ${PACK_IDS[i]} labels in ${JSON.stringify(r)}`).toBe(true);
  }
  expect(hit(packs[0], packs[1]), tag).toBe(false);
  expect(rerollFits(L.reroll), `${tag} REROLL ${JSON.stringify(L.reroll)}`).toBe(true);
}

/** The five landscape phone views of tests/zoom.test.ts's D5. */
const D5: [number, number, number][] = [[844, 390, 3], [667, 375, 2], [640, 360, 2], [932, 430, 3], [740, 360, 4]];

describe("P5 (a): every layout holds both slots, on screen, clear of every control, labels inside their frames", () => {
  it("desk: every landscape width 430-1000 (heights 240-600)", () => {
    let n = 0;
    for (let W = 430; W <= 1000; W++) for (const H of [240, 300, 420, 600]) {
      const L = buildLayout(W, H, false, 5);
      sound(L, `W ${W} H ${H}`);
      for (const c of L.cards) expect(c.w, `W ${W}`).toBeGreaterThanOrEqual(CARD_TEXT_MIN_W);
      expect(L.reroll.w, `W ${W}`).toBeGreaterThanOrEqual(REROLL_MIN_W);
      n++;
    }
    expect(n).toBe(571 * 4);
  });

  it("portrait: the phone sweep (320-430 x 548-932 at DPR 2, 2.625 and 3) and non-phone portrait screens (500-1100 CSS px wide, DPR 1-2)", () => {
    let n = 0;
    for (const dpr of [2, 2.625, 3]) for (let w = 320; w <= 430; w++) for (let h = 548; h <= 932; h += 16) { sound(view(w, h, dpr).L, `${w}x${h} @${dpr}`); n++; }
    for (const dpr of [1, 1.5, 2]) for (let w = 500; w <= 1100; w += 7) for (const h of [900, 1200, 1600, 2000]) {
      if (h <= w) continue;
      sound(view(w, h, dpr).L, `${w}x${h} @${dpr}`);
      n++;
    }
    expect(n).toBeGreaterThan(8000);
  });
});

describe("P5 (b): on every phone each slot is a finger's target, at least TAP_CSS CSS px both ways", () => {
  it("the portrait phone sweep and the five landscape phone views (D5)", () => {
    const views: [number, number, number][] = [...D5];
    for (const dpr of [2, 2.625, 3]) for (let w = 320; w <= 430; w++) for (let h = 548; h <= 932; h += 16) views.push([w, h, dpr]);
    for (const [w, h, dpr] of views) {
      const { L, css, phone, tap } = view(w, h, dpr), tag = `${w}x${h} @${dpr}`;
      expect(phone, tag).toBe(true);
      for (const r of packRects(L)) {
        expect([r.w * css >= TAP_CSS, r.h * css >= TAP_CSS], `${tag} ${JSON.stringify(r)} at ${css.toFixed(3)} CSS px (tap ${tap})`).toEqual([true, true]);
        expect([r.w, r.h].every((s) => s >= tap), tag).toBe(true);
      }
    }
  });

  it("portrait phones: the column beside the grid where the margin holds a finger's slot (BELT PACK beside the row above REROLL's, ARMOR PACK beside REROLL, each a card tall), else a pack row under REROLL's row", () => {
    const rowAt: string[] = [];
    for (const dpr of [2, 2.625, 3]) for (let w = 320; w <= 430; w++) {
      const { L, tap } = view(w, 844, dpr), [belt, armor] = packRects(L), tag = `${w} @${dpr}`;
      const right = Math.max(...[...L.cards, L.reroll].map((r) => r.x + r.w));
      const margin = Math.min(PACK_W, L.W - 1 - (right + 3));
      if (margin >= Math.max(tap, PACK_MIN_W)) {
        expect([belt.y, armor.y, belt.h, armor.h, belt.x, armor.x, belt.w], tag).toEqual([L.cards[0].y, L.reroll.y, CARD_H, CARD_H, right + 3, right + 3, margin]);
      } else {
        rowAt.push(tag);
        expect([belt.y, armor.y, armor.x + armor.w], tag).toEqual([L.reroll.y + L.reroll.h + 3, L.reroll.y + L.reroll.h + 3, L.reroll.x + L.reroll.w]);
      }
    }
    // the operator's phones keep the column (390, 402, 430 at DPR 3); only the narrowest phones take the row
    expect([view(390, 844, 3), view(402, 690, 3), view(430, 739, 3)].map((v) => packRects(v.L)[0].y)).toEqual([17, 17, 17]);
    expect(packRects(view(320, 568, 3).L)[0].y).toBe(view(320, 568, 3).L.reroll.y + 45);
    const want = [...Array.from({ length: 4 }, (_, i) => `${320 + i} @2.625`), ...Array.from({ length: 34 }, (_, i) => `${320 + i} @3`)];
    expect(rowAt).toEqual(want); // 320-323 CSS px at DPR 2.625, 320-353 at DPR 3: the margin is under a 30 px slot
  });

  it("landscape phones (D5): the two side by side right of REROLL, each a finger wide and REROLL's height", () => {
    for (const [w, h, dpr] of D5) {
      const { L, tap } = view(w, h, dpr), [belt, armor] = packRects(L), tag = `${w}x${h} @${dpr}`;
      expect([belt.y, armor.y, belt.h, armor.h], tag).toEqual([L.reroll.y, L.reroll.y, WIDE_CARD_H, WIDE_CARD_H]);
      expect([belt.x, armor.x], tag).toEqual([L.reroll.x + L.reroll.w + 3, belt.x + belt.w + 3]);
      expect(belt.w, tag).toBe(Math.max(tap, PACK_MIN_W));
    }
  });
});

describe("P5: the desk's row", () => {
  it("the row gives way only on the narrowest screens: the 8 px gap before REROLL, then REROLL (to 32), then the column", () => {
    expect(landscapeRow(480, 5, 70)).toEqual({ gap: 8, rerollW: 46, packW: 34, rowW: 456, side: false, fits: true });
    expect(landscapeRow(455, 5, 70)).toEqual({ gap: 0, rerollW: 46, packW: 34, rowW: 448, side: false, fits: true });
    expect(landscapeRow(430, 5, 69)).toEqual({ gap: 0, rerollW: 32, packW: 32, rowW: 427, side: false, fits: true });
    for (let W = 430; W <= 1000; W++) {
      const L = buildLayout(W, 300, false, 5), cardW = L.cards[0].w, r = landscapeRow(W, 5, cardW);
      expect(r.fits, `W ${W}`).toBe(true);
      expect(cardW, `W ${W}`).toBe(landscapeRow(W, 5, wideCardW(W, 5)).fits ? wideCardW(W, 5) : CARD_TEXT_MIN_W);
      if (W >= 460) expect([r.gap, r.rerollW, r.packW, L.reroll.w], `W ${W}`).toEqual([8, CARD_W, PACK_W, CARD_W]);
      const [belt, armor] = packRects(L);
      expect([belt.x, belt.w, belt.y, armor.y + armor.h], `W ${W}`).toEqual([L.reroll.x + L.reroll.w + 3, r.packW, L.reroll.y, L.reroll.y + WIDE_CARD_H]);
      expect(belt.w, `W ${W}`).toBeGreaterThanOrEqual(PACK_LAND_MIN_W);
    }
  });

  it("no card moved on a phone: 390x844's shop row is 0.8.5's (tests/shopRow: cards at 45, 94, 143), the slots in its margin", () => {
    const { L } = view(390, 844, 3);
    expect([L.perRow, L.cards.map((r) => r.x), L.reroll.x, L.reroll.w]).toEqual([3, [45, 94, 143, 45, 94], 143, 46]);
    expect(packRects(L).map((r) => [r.x, r.y, r.w, r.h])).toEqual([[192, 17, 34, 42], [192, 62, 34, 42]]);
  });
});

describe("P5: what a slot shows", () => {
  it("the amount and the price: +4 BELT and 2G, +25 HULL and 5G (whole numbers, no decimal)", () => {
    expect(PACK_IDS.map((id) => [packAmount(id), packPriceText(id)])).toEqual([["+4 BELT", "2G"], ["+25 HULL", "5G"]]);
    for (const id of PACK_IDS) expect(`${packAmount(id)} ${packPriceText(id)}`).not.toMatch(/\d\.\d/);
  });
});
