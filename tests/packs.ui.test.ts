// bb-0.8.6 (REQ-BFG-051, job PACKS P5; oracle 43f2c3d185b37c07): the two fixed pack slots beside REROLL, on desk and in the
// zoomed-out phone layout. On every phone (portrait or landscape: ui/tap.ts isPhone) each slot is at least TAP_CSS CSS px
// both ways; no slot overlaps another control; every slot is on screen. Desk: a column right of REROLL, the two stacked,
// the row recentred (the cards keep wideCardW, never under CARD_TEXT_MIN_W; on the narrowest rows the gap before REROLL,
// then REROLL down to REROLL_MIN_W, then the column give way). Landscape phones: the two side by side beside REROLL.
// Portrait: a column in the margin right of the grid (no card moves), else a pack row under REROLL's row. Each slot shows
// the pack's icon, its amount and its price ("+4 BELT" / "2G", "+250 HULL" / "5G" since NUM-1's x10 hull), inside its frame.
import { describe, expect, it } from "vitest";
import { ITEMS, PACK_IDS, PACK_ITEM } from "../src/sim/content";
import {
  CARD_H, CARD_TEXT_MIN_W, CARD_W, PACK_LAND_MIN_W, PACK_MIN_W, PACK_W, REROLL_MIN_W, WIDE_CARD_H, buildLayout, buildScale, landscapeRow,
  packRects, phoneScreen, wideCardW, type BuildLayout,
} from "../src/screens/build/layout";
import { PACK_TALL_H, packAmount, packPriceText } from "../src/screens/build/shop";
import { packShortAmount } from "../src/screens/build/shop"; // PRESENT-1 (REQ-BFG-081): the short face's line
import { ICON, textWidth } from "../src/render/font";
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
  // PRESENT-1 (REQ-BFG-081): the short face draws packShortAmount (the amount, or its number alone where the words can't fit; was packAmount whole)
  return r.h >= 20 && textWidth(packShortAmount(packAmount(id), r.w), "3") <= r.w - 2 && 16 + textWidth(packPriceText(id)) <= r.w - 1;
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
    // oracle b24d14b979bbded9: 320x568 @3 can't hold the pack row and NEXT BATTLE at x5, so it draws at x4 (the column)
    expect([view(320, 568, 3).L.W, packRects(view(320, 568, 3).L)[0].y]).toEqual([240, 17]);
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

// ------------------------------------------- oracle b24d14b979bbded9: buildScale holds the pack row on portrait screens
// 0.8.5's portrait scale and its NEXT BATTLE rule (layout.ts at 52c0b43, verbatim in substance): the scale, and whether
// the band held NEXT BATTLE (FOE_H 24) at it.
const HULL_A_ = 156, HULL_L_ = 140; // render/frame.ts (the hull box's sides; tests/zoom.test.ts reads the same)
const PORT_FIXED_ = 14 + 3 + 2 * 42 + 3 + 2 + 15 + 2 + HULL_L_ + 4 + 22 + 3;
function scale085(pw: number, ph: number, portrait: boolean, dpr?: number): number {
  const top = dpr !== undefined && phoneScreen(pw, ph, dpr) ? Math.min(12, Math.max(1, Math.floor(1.75 * dpr))) : 12;
  for (let s = top; s > 1; s--) {
    const W = Math.floor(pw / s), H = Math.floor(ph / s);
    if (!portrait && W >= 430 && H >= 14 + 6 + 46 + 4 + HULL_A_ + 3 + 22 + 2) return s;
    if (portrait && W >= HULL_A_ + 4 && H >= PORT_FIXED_) return s;
  }
  return 1;
}
function foe085(cw: number, ch: number, dpr: number): boolean {
  const pw = Math.floor(cw * dpr), ph = Math.floor(ch * dpr), phone = phoneScreen(pw, ph, dpr), s = scale085(pw, ph, true, dpr);
  const W = Math.floor(pw / s), H = Math.floor(ph / s), fit = Math.max(1, Math.floor((W - 5) / 49));
  const perRow = phone ? Math.ceil(6 / Math.ceil(6 / fit)) : fit, rows = Math.ceil(6 / perRow);
  const shopBottom = 14 + 3 + (rows === 1 ? 6 : 0) + rows * 42 + (rows - 1) * 3;
  const spare = Math.max(0, H - shopBottom - (2 + 15 + 2 + HULL_L_ + 4 + 22 + 3));
  return Math.min(phone ? (W < 194 ? 169 : W < 278 ? 162 : W < 281 ? 155 : W < 316 ? 148 : W < 320 ? 141 : 136) : 69, spare) >= 24;
}
/** The pack row needed at this layout and the band under FOE_H: the scale guard's failure. */
const rowFails = (L: BuildLayout) => L.packs[0].y > L.reroll.y + L.reroll.h && L.info.h < 24;

/** Every portrait view of the oracle's sweep: the zoom phone sweep, 440-547 tall phones, non-phone portrait windows. */
function portraitViews(): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const dpr of [2, 2.625, 3]) for (let w = 320; w <= 430; w++) for (let h = 440; h <= 932; h += 12) out.push([w, h, dpr]);
  for (const dpr of [1, 1.25, 1.5, 2]) for (let w = 500; w <= 1400; w += 9) for (let h = w + 37; h <= 2400; h += 53) out.push([w, h, dpr]);
  return out;
}

describe("P5 (oracle b24d14b979bbded9): buildScale holds the pack row; nothing goes off screen; NEXT BATTLE stays", () => {
  it("(a) every portrait view: cargo and FIGHT on screen, no two controls overlap, NEXT BATTLE wherever 0.8.5 had it", () => {
    let n = 0;
    for (const [w, h, dpr] of portraitViews()) {
      const { L } = view(w, h, dpr), tag = `${w}x${h} @${dpr}`;
      for (const r of [L.cargo, L.fight]) expect(onScreen(r, L.W, L.H), `${tag} ${JSON.stringify(r)} in ${L.W}x${L.H}`).toBe(true);
      const ctl: [string, Rect][] = [["bar", L.bar], ["reroll", L.reroll], ["band", L.info], ["pad", L.pad], ["cargo", L.cargo], ["fight", L.fight],
        ...L.cards.map((c, i): [string, Rect] => [`card ${i}`, c]), ...L.packs.map((c, i): [string, Rect] => [`pack ${i}`, c])];
      for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
        // 0.8.5's own: FIGHT sits 1 px into the hull pad by design (layout.ts: FIGHT at the cargo row's y - 1)
        if (ctl[i][0] === "pad" && ctl[j][0] === "fight") continue;
        if (ctl[i][1].h > 0 && ctl[j][1].h > 0) expect(hit(ctl[i][1], ctl[j][1]), `${tag}: ${ctl[i][0]} vs ${ctl[j][0]}`).toBe(false);
      }
      if (foe085(w, h, dpr)) expect(L.foe, `${tag}: NEXT BATTLE`).not.toBeNull();
      n++;
    }
    expect(n).toBeGreaterThan(20000);
  });

  it("(b) every landscape scale is 0.8.5's; a portrait scale moves only where 0.8.5's fails the pack-row rule, to the largest that passes", () => {
    for (const dpr of [1, 1.5, 2, 2.625, 3]) for (let w = 480; w <= 2600; w += 37) for (let h = 300; h < w; h += 41) {
      const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
      expect(buildScale(pw, ph, false, dpr), `${w}x${h} @${dpr}`).toBe(scale085(pw, ph, false, dpr));
    }
    let moved = 0;
    for (const [w, h, dpr] of portraitViews()) {
      const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), phone = phoneScreen(pw, ph, dpr);
      const now = buildScale(pw, ph, true, dpr), was = scale085(pw, ph, true, dpr), tag = `${w}x${h} @${dpr}`;
      const at = (s: number) => buildLayout(Math.floor(pw / s), Math.floor(ph / s), true, 5, phone, phone ? Math.ceil(TAP_CSS / (s / dpr)) : 0);
      expect(now, tag).toBeLessThanOrEqual(was);
      if (now === was) continue;
      moved++;
      for (let s = now + 1; s <= was; s++) expect(rowFails(at(s)), `${tag} x${s} fails`).toBe(true);
      if (now > 1) expect(rowFails(at(now)), `${tag} x${now} passes`).toBe(false);
    }
    expect(moved).toBeGreaterThan(0);
  });

  it("the oracle's views, before (0.8.5) and after: the scale, where the slots go, the band", () => {
    const row = (w: number, h: number, dpr: number) => {
      const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), { L } = view(w, h, dpr);
      const where = L.packs[0].y > L.reroll.y + L.reroll.h ? "row" : L.packs[0].y === L.reroll.y ? "beside" : "column";
      return `${w}x${h} @${dpr}: x${scale085(pw, ph, true, dpr)} -> x${buildScale(pw, ph, true, dpr)}, W ${L.W}, ${where}, band ${L.info.h}`;
    };
    expect([[500, 900, 1], [1080, 1800, 1], [800, 1280, 2], [800, 1180, 2], [600, 1000, 1], [320, 548, 3], [320, 548, 2.625]].map(([w, h, d]) => row(w, h, d))).toMatchSnapshot();
  });
});

describe("P5: what a slot shows", () => {
  it("the amount and the price: +4 BELT and 2G, +250 HULL and 5G (whole numbers, no decimal)", () => {
    // NUM-1 (REQ-BFG-047): ARMOR PACK's hull is x10 (+250 HULL; was +25 HULL); BELT and the prices are unchanged
    // NUM-2 (cap's answer to NUM-1's question 1): the ARMOR PACK shows its number and the hull icon, the stat form
    // (+250 ♥, through ICON.HULL; was "+250 HULL", which overflowed the narrowest slots); the hull from the data
    // PRESENT-1 (REQ-BFG-081; REVIEW-SC0912B item 3): HULL in words again, never the heart (was `+250 ${ICON.HULL}`); the short face's
    // one line drops the word where it can't fit (shop.ts packShortAmount: labelsFit above reads it)
    expect(PACK_IDS.map((id) => [packAmount(id), packPriceText(id)])).toEqual([["+4 BELT", "2G"], [`+${ITEMS[PACK_ITEM.armor].supply!.hull} HULL`, "5G"]]);
    expect(ITEMS[PACK_ITEM.armor].supply!.hull).toBe(250);
    for (const id of PACK_IDS) expect(`${packAmount(id)} ${packPriceText(id)}`).not.toMatch(/\d\.\d/);
  });
});
