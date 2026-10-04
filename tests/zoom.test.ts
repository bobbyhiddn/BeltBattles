// zoom (BeltBattles phone build screen zoom-out; REQ-BFG-040): on the operator's iPhone (Edge for iOS, about 402x690 CSS px
// at DPR 3) the build screen picked x7: a 172x295 logical screen, 2.33 CSS px an art pixel, the hull 91% of the width and
// a 3 px details band, so a tapped item showed no description ("We can zoom out our ui quite a bit on mobile. It's too
// crammed"). Now, on a phone (ui/tap.ts's: the short side under 500 CSS px) the build screen never draws an art pixel
// bigger than 1.75 CSS px (layout.ts buildScale: x5 at DPR 3, x4 at 2.625, x3 at 2), and in portrait its layout (`phone`)
// balances the shop's rows and gives the details band the room that frees, up to what its tallest panel needs
// (phoneBand); a finger's panel sits in the band wherever its full description fits there (fullText), and only where it
// doesn't does shoptap2's fallback grow it. Every other view (desktops, laptops, tablets, landscape) is exactly as before.
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { buyableModules } from "../src/sim/content";
import { key as K, rotField, setTurretList, turretSlots, type Placed } from "../src/sim/deck";
import { fusible } from "../src/sim/stars";
import { computeView, type View } from "../src/core/io";
import { UI, type Rect } from "../src/ui/ui";
import { PHONE_CSS, isPhone } from "../src/ui/tap";
import { HULL_A, HULL_L, frameForHull, hullBox } from "../src/render/frame";
import {
  BARREL, CARD_H, CARD_W, FOE_H, PORT_BAND, PHONE_ART_CSS, WIDE_CARD_H, buildLayout, buildScale, heroCardRect, panelArea, phoneBand,
  phoneScreen, wideCardW, type BuildLayout, type Sel,
} from "../src/screens/build/layout";
import { detailsPlan, fullText, fullest, keptWhole, visibleLines } from "../src/screens/build/inspector";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import type { Ctx } from "../src/screens/build/actions";

installRaster();

const within = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ------------------------------------------------------------------------------------------- BASE (f7db355), verbatim
// layout.ts's buildScale and buildLayout as they were before the zoom, to compare every non-phone view with
const GAP = 3, BAR_H = 14, CARGO_H = 22;
const LAND_MIN_W = 430, LAND_MIN_H = BAR_H + 6 + WIDE_CARD_H + 4 + HULL_A + 3 + CARGO_H + 2;
const PORT_MIN_W = HULL_A + 4, PORT_FIXED = BAR_H + 3 + 2 * CARD_H + GAP + 2 + BARREL + 2 + HULL_L + 4 + CARGO_H + 3;
function baseScale(pw: number, ph: number, portrait: boolean): number {
  for (let s = 12; s > 1; s--) {
    const W = Math.floor(pw / s), H = Math.floor(ph / s);
    if (!portrait && W >= LAND_MIN_W && H >= LAND_MIN_H) return s;
    if (portrait && W >= PORT_MIN_W && H >= PORT_FIXED) return s;
  }
  return 1;
}
function cardRow(n: number, x0: number, y: number, perRow: number, step: number): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < n; i++) out.push({ x: x0 + (i % perRow) * step, y: y + Math.floor(i / perRow) * (CARD_H + GAP), w: CARD_W, h: CARD_H });
  return out;
}
function baseLayout(W: number, H: number, portrait: boolean, offers: number): BuildLayout {
  const bar: Rect = { x: 0, y: 0, w: W, h: BAR_H };
  const slots = offers + 1;
  if (!portrait) {
    const tags = true;
    const cy = BAR_H + 3 + 6;
    const cardW = wideCardW(W, offers);
    const rowW = offers * cardW + CARD_W + offers * GAP + 8;
    const x0 = Math.round(W / 2 - rowW / 2);
    const cards: Rect[] = [];
    for (let i = 0; i < offers; i++) cards.push({ x: x0 + i * (cardW + GAP), y: cy, w: cardW, h: WIDE_CARD_H });
    const reroll: Rect = { x: x0 + offers * (cardW + GAP) + 8, y: cy, w: CARD_W, h: WIDE_CARD_H };
    const colL = Math.min(136, Math.round(W * 0.28));
    const colR = Math.min(150, Math.round(W * 0.3));
    const top = cy + WIDE_CARD_H + 5;
    const avail = H - top - CARGO_H - 4;
    const hy = top + Math.max(0, Math.floor((avail - HULL_A) / 2));
    const cx0 = 6 + colL, cx1 = W - 6 - colR;
    const hx = Math.round((cx0 + cx1) / 2 - HULL_L / 2);
    const frame = frameForHull(1, hx, hy);
    const hull = hullBox(frame);
    const cw = Math.min(cx1 - cx0 - 8, 200);
    const cargo: Rect = { x: Math.round((cx0 + cx1) / 2 - cw / 2), y: hull.y + HULL_A + 3, w: cw, h: CARGO_H };
    const rx = cx1 + 4, rw = colR - 4;
    return {
      W, H, portrait, bar, cards, reroll, perRow: slots, tags, frame, hull,
      pad: { x: hull.x - 5, y: hull.y - 5, w: hull.w + 10, h: hull.h + 10 },
      cargo,
      fight: { x: rx, y: Math.round(hull.y + HULL_A / 2 - 16), w: rw, h: 32 },
      info: { x: 6, y: top, w: colL - 8, h: cargo.y + CARGO_H - top },
      foe: { x: rx, y: top, w: rw, h: 40 },
    };
  }
  const perRow = Math.max(1, Math.floor((W - 8 + GAP) / (CARD_W + GAP)));
  const rows = Math.ceil(slots / perRow);
  const tags = rows === 1;
  const cy = BAR_H + 3 + (tags ? 6 : 0);
  const used = Math.min(perRow, slots);
  const rowW = used * CARD_W + (used - 1) * GAP;
  const cards = cardRow(slots, Math.round(W / 2 - rowW / 2), cy, perRow, CARD_W + GAP);
  const reroll = cards.pop()!;
  const shopBottom = cy + rows * CARD_H + (rows - 1) * GAP;
  const fixedBelow = 2 + BARREL + 2 + HULL_L + 4 + CARGO_H + 3;
  const spare = Math.max(0, H - shopBottom - fixedBelow);
  const band = Math.min(PORT_BAND, spare);
  const info: Rect = { x: 3, y: shopBottom + 2, w: W - 6, h: band };
  const hy = info.y + band + 2 + BARREL + Math.floor((spare - band) / 2);
  const frame = frameForHull(0, Math.round(W / 2 - HULL_A / 2), hy);
  const hull = hullBox(frame);
  const fw = Math.min(64, Math.round(W * 0.36));
  const ry = hull.y + HULL_L + 4;
  return {
    W, H, portrait, bar, cards, reroll, perRow, tags, frame, hull,
    pad: { x: hull.x - 3, y: hull.y - 4, w: hull.w + 6, h: hull.h + 8 },
    cargo: { x: 3, y: ry, w: W - fw - 9, h: CARGO_H },
    fight: { x: W - fw - 3, y: ry - 1, w: fw, h: CARGO_H + 2 },
    info,
    foe: band >= FOE_H ? { x: info.x, y: info.y + band - FOE_H, w: info.w, h: FOE_H } : null,
  };
}

// ------------------------------------------------------- PACKS (bb-0.8.6; oracle 43f2c3d185b37c07), verbatim, applied to BASE
// bb-0.8.6 (REQ-BFG-051 P5): the shop row with the two fixed pack slots. Landscape: the row recentred with a desk's
// stacked column right of REROLL, or a landscape phone's two side by side (`tap`, its finger target in art px); on the
// narrowest rows the 8 px gap, then REROLL (to 32), then the desk's column (to 32) give way; the cards never narrow below
// 69; a landscape phone's slots that still don't fit go to the right column (under NEXT BATTLE, else under FIGHT).
// Portrait: the slots beside a short last row, else the column in the margin right of the widest row, else a pack row
// under REROLL's row, which everything below the shop moves down for (the band gives up its height). Everything else is
// BASE's exactly (CHANGED-ASSERTIONS.md, oracle 43f2c3d185b37c07 (5)).
const PACK_W = 34, PACK_MIN_W = 30, PACK_LAND_MIN_W = 32, REROLL_MIN_W = 32, CARD_TEXT_MIN_W = 69;
function packed(B: BuildLayout, offers: number, phone: boolean, tap: number): BuildLayout {
  const { W, H } = B;
  const two = (x: number, y: number, w: number, h: number, dx: number, dy: number): Rect[] => [{ x, y, w, h }, { x: x + dx, y: y + dy, w, h }];
  if (!B.portrait) {
    const side = tap > 0, cy = BAR_H + 3 + 6;
    const rowOf = (cardW: number) => {
      let gap = 8, rr = CARD_W, pw = side ? Math.max(tap, PACK_MIN_W) : PACK_W;
      const row = () => offers * cardW + offers * GAP + gap + rr + (side ? 2 : 1) * (GAP + pw);
      if (row() > W - 3) gap = 0;
      if (row() > W - 3) rr = Math.max(REROLL_MIN_W, rr - (row() - (W - 3)));
      if (!side && row() > W - 3) pw = Math.max(PACK_LAND_MIN_W, pw - (row() - (W - 3)));
      return { gap, rr, pw, row: row(), fits: row() <= W - 3 };
    };
    let cardW = wideCardW(W, offers), r = rowOf(cardW);
    while (!r.fits && cardW > CARD_TEXT_MIN_W) r = rowOf(--cardW);
    if (side && !r.fits) {
      const s = Math.max(tap, PACK_MIN_W), f = B.fight, o = B.foe!, x1 = f.x + f.w;
      const y = o.y + o.h + 3 + s + 3 <= f.y ? o.y + o.h + 3 : Math.min(H - 1 - s, f.y + f.h + 3);
      return { ...B, packs: two(x1 - 2 * s - GAP, y, s, s, s + GAP, 0) };
    }
    const x0 = Math.round(W / 2 - r.row / 2);
    const cards = Array.from({ length: offers }, (_, i) => ({ x: x0 + i * (cardW + GAP), y: cy, w: cardW, h: WIDE_CARD_H }));
    const reroll = { x: x0 + offers * (cardW + GAP) + r.gap, y: cy, w: r.rr, h: WIDE_CARD_H }, px = reroll.x + reroll.w + GAP;
    const half = Math.floor((WIDE_CARD_H - 2) / 2);
    const packs = side ? two(px, cy, r.pw, WIDE_CARD_H, r.pw + GAP, 0) : two(px, cy, r.pw, half, 0, half + 2);
    return { ...B, cards, reroll, packs };
  }
  const need = phone ? Math.max(tap, PACK_MIN_W) : PACK_MIN_W, rr = B.reroll, rEnd = rr.x + rr.w;
  const right = Math.max(...[...B.cards, rr].map((c) => c.x + c.w));
  const colW = Math.min(PACK_W, W - 1 - (right + GAP)), besideW = Math.min(PACK_W, Math.floor((W - 1 - rEnd) / 2) - GAP);
  const above = [...new Set([...B.cards, rr].map((c) => c.y))].sort((a, b) => a - b).filter((y) => y < rr.y).pop();
  if (rEnd < right && besideW >= need) return { ...B, packs: two(rEnd + GAP, rr.y, besideW, CARD_H, besideW + GAP, 0) };
  if (colW >= (above === undefined ? Math.max(need, PACK_LAND_MIN_W) : need)) {
    const half = Math.floor((rr.h - 2) / 2);
    return { ...B, packs: above === undefined ? two(right + GAP, rr.y, colW, half, 0, half + 2) : [{ x: right + GAP, y: above, w: colW, h: CARD_H }, { x: right + GAP, y: rr.y, w: colW, h: CARD_H }] };
  }
  // the pack row: BASE's layout below the shop rebuilt on a shop that ends packH + GAP lower
  const packH = Math.max(tap, PACK_MIN_W), pw = Math.max(need, PACK_W), rowX = Math.max(1, rEnd - 2 * pw - GAP);
  const shopBottom = rr.y + rr.h + packH + GAP;
  const fixedBelow = 2 + BARREL + 2 + HULL_L + 4 + CARGO_H + 3, spare = Math.max(0, H - shopBottom - fixedBelow);
  const band = Math.min(phone ? phoneBand(W) : PORT_BAND, spare), info: Rect = { x: 3, y: shopBottom + 2, w: W - 6, h: band };
  const idle = Math.max(0, Math.floor((band - PORT_BAND) / 2));
  const frame = frameForHull(0, Math.round(W / 2 - HULL_A / 2), info.y + band + 2 + BARREL + Math.floor((spare - band) / 2)), hull = hullBox(frame);
  const fw = Math.min(64, Math.round(W * 0.36)), ry = hull.y + HULL_L + 4;
  return {
    ...B, frame, hull, info, pad: { x: hull.x - 3, y: hull.y - 4, w: hull.w + 6, h: hull.h + 8 },
    cargo: { x: 3, y: ry, w: W - fw - 9, h: CARGO_H }, fight: { x: W - fw - 3, y: ry - 1, w: fw, h: CARGO_H + 2 },
    foe: band >= FOE_H ? { x: info.x, y: info.y + idle + Math.min(band, PORT_BAND) - FOE_H, w: info.w, h: FOE_H } : null,
    packs: two(rowX, rr.y + rr.h + GAP, pw, packH, pw + GAP, 0),
  };
}

/** bb-0.8.6 (PACKS P5; oracle b24d14b979bbded9 (2)): a portrait scale steps down from `s0` (BASE's, or the phone cap) to
 *  the largest whose layout holds the pack slots: beside REROLL, in the margin, or in a pack row that leaves the band at
 *  least FOE_H. Landscape: `s0` exactly. */
function guarded(pw: number, ph: number, portrait: boolean, s0: number, dpr?: number): number {
  if (!portrait) return s0;
  const phone = dpr !== undefined && phoneScreen(pw, ph, dpr);
  for (let s = s0; s > 1; s--) {
    const L = buildLayout(Math.floor(pw / s), Math.floor(ph / s), true, 5, phone, phone ? Math.ceil(44 / (s / dpr!)) : 0);
    if (!(L.packs[0].y > L.reroll.y + L.reroll.h && L.info.h < FOE_H)) return s;
  }
  return 1;
}

/** The build screen as the game frames it (BuildScreen.pickScale and layout): its view and its layout with `offers`.
 *  bb-0.8.6 (PACKS P5): on any phone, portrait or landscape, the pack slots' finger target in art px (`tap`). */
function screen(w: number, h: number, dpr: number, offers = 5) {
  const v = computeView(w, h, dpr, buildScale);
  const isPh = phoneScreen(Math.floor(w * dpr), Math.floor(h * dpr), dpr);
  const phone = v.portrait && isPh, tap = isPh ? Math.ceil(44 / (v.scale / v.dpr)) : 0;
  return { v, L: buildLayout(v.W, v.H, v.portrait, offers, phone, tap), k: v.scale / v.dpr, phone, tap };
}

describe("zoom D1: the build screen's scale on a phone is capped at 1.75 CSS px an art pixel", () => {
  it("phoneScreen is ui/tap.ts's phone (the short side under PHONE_CSS CSS px), exactly, for whole CSS px sizes", () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.25, 2.625, 3, 3.5, 4]) for (const s of [320, 430, 499, 500, 501, 768]) {
      expect(phoneScreen(Math.floor(s * dpr), Math.floor(900 * dpr), dpr), `${s} @${dpr}`).toBe(s < PHONE_CSS);
      expect(phoneScreen(Math.floor(900 * dpr), Math.floor(s * dpr), dpr), `landscape ${s} @${dpr}`).toBe(s < PHONE_CSS);
    }
  });

  it("over phone sizes 320-430 x 548-932 at DPR 2, 2.625 and 3: never more than 1.75 CSS px an art pixel; x3, x4 and x5 where they fit", () => {
    let n = 0;
    const picks = new Map<number, Set<number>>();
    for (const dpr of [2, 2.625, 3]) for (let w = 320; w <= 430; w++) for (let h = 548; h <= 932; h += 4) {
      const { v, k } = screen(w, h, dpr);
      expect(k, `${w}x${h} @${dpr}`).toBeLessThanOrEqual(PHONE_ART_CSS);
      // bb-0.8.6 (oracle b24d14b979bbded9): one step smaller where the cap's scale can't hold the pack row and NEXT BATTLE
      const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
      expect(v.scale, `${w}x${h} @${dpr}`).toBe(guarded(pw, ph, v.portrait, Math.min(Math.floor(PHONE_ART_CSS * dpr), baseScale(pw, ph, v.portrait)), dpr));
      if (!picks.has(dpr)) picks.set(dpr, new Set());
      picks.get(dpr)!.add(v.scale);
      n++;
    }
    expect(n).toBeGreaterThan(30000);
    // the cap: floor(1.75 x dpr); the integer device-pixel rule stays (W x scale <= the device px)
    // bb-0.8.6 (oracle b24d14b979bbded9): the narrowest, shortest DPR-3 phones (320-353 x 548-580) draw at x4 (was x5 only)
    expect([...picks].map(([d, s]) => `${d}: ${[...s].sort().join(",")}`)).toEqual(["2: 3", "2.625: 4", "3: 4,5"]);
  });

  it("the views of the brief: 234x396 at 390x660, 234x398 at 390x664, 241x414 at 402x690, 234x506 at 390x844, 258x443 at 430x739; the operator's x7 before", () => {
    const row = (w: number, h: number) => {
      const { v, L, k } = screen(w, h, 3);
      return `${w}x${h}: ${v.W}x${v.H} x${v.scale} (${k.toFixed(2)} CSS px), band ${L.info.h}`;
    };
    expect([[390, 660], [390, 664], [402, 690], [390, 844], [430, 739]].map(([w, h]) => row(w, h))).toEqual([
      "390x660: 234x396 x5 (1.67 CSS px), band 104",
      "390x664: 234x398 x5 (1.67 CSS px), band 106",
      "402x690: 241x414 x5 (1.67 CSS px), band 122",
      // U2d (phoneBand re-measured with the new faces, 162 -> 148 at W 194-280): 390x844 band 162 -> 148, 430x739 151 -> 148
      "390x844: 234x506 x5 (1.67 CSS px), band 148",
      "430x739: 258x443 x5 (1.67 CSS px), band 148",
    ]);
    // before: x7 at 402x690 @3, a 172x295 screen and a 3 px band (the operator's screenshot)
    const before = computeView(402, 690, 3, (pw, ph, p) => baseScale(pw, ph, p));
    expect([before.W, before.H, before.scale, baseLayout(before.W, before.H, true, 5).info.h]).toEqual([172, 295, 7, 3]);
  });

  it("D5: landscape phones are under the cap already and keep their scale and layout (844x390 @3: x4; 667x375 and 640x360 @2: x2)", () => {
    for (const [w, h, dpr] of [[844, 390, 3], [667, 375, 2], [640, 360, 2], [932, 430, 3], [740, 360, 4]]) {
      const { v, L, tap } = screen(w, h, dpr);
      const base = computeView(w, h, dpr, (pw, ph, p) => baseScale(pw, ph, p));
      expect(v, `${w}x${h} @${dpr}`).toEqual(base);
      // bb-0.8.6 (PACKS P5; oracle 43f2c3d185b37c07 (5)): BASE with the packs (a landscape phone's two side by side)
      expect(L, `${w}x${h} @${dpr}`).toEqual(packed(baseLayout(base.W, base.H, base.portrait, 5), 5, false, tap));
    }
    expect(computeView(844, 390, 3, buildScale).scale).toBe(4);
  });
});

describe("zoom: every view that isn't a phone is exactly as before", () => {
  it("short side >= 500 CSS px, DPR 1-2 (desktops, laptops, tablets, both ways up): buildScale and the build layout identical to BASE", () => {
    let n = 0;
    for (const dpr of [1, 1.25, 1.5, 1.75, 2]) for (let w = 500; w <= 2600; w += 23) for (let h = 500; h <= 1700; h += 19) {
      const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
      expect(phoneScreen(pw, ph, dpr), `${w}x${h} @${dpr}`).toBe(false);
      // bb-0.8.6 (oracle b24d14b979bbded9 (2)): BASE's scale, or on a portrait window that can't hold the pack row and
      // NEXT BATTLE at it, the largest smaller one that can (landscape: BASE's exactly)
      const v = computeView(w, h, dpr, buildScale), base = computeView(w, h, dpr, (a, b, p) => guarded(a, b, p, baseScale(a, b, p)));
      expect(v, `${w}x${h} @${dpr}`).toEqual(base);
      for (const offers of [5, 3, 0]) {
        const L = buildLayout(v.W, v.H, v.portrait, offers, false);
        // bb-0.8.6 (PACKS P5; oracle 43f2c3d185b37c07 (5)): BASE with the packs (the shop row; a pack row where needed)
        expect(L, `${w}x${h} @${dpr} offers ${offers}`).toEqual(packed(baseLayout(v.W, v.H, v.portrait, offers), offers, false, 0));
        expect("phone" in L).toBe(false);
      }
      n++;
    }
    expect(n).toBeGreaterThan(25000);
  });

  it("buildScale without a dpr (a screen framed by device px alone) is BASE's on every view", () => {
    for (let pw = 300; pw <= 3000; pw += 37) for (let ph = 300; ph <= 3000; ph += 41) for (const p of [true, false]) {
      expect(buildScale(pw, ph, p)).toBe(guarded(pw, ph, p, baseScale(pw, ph, p))); // bb-0.8.6: the pack-row guard (b24d14b979bbded9)
    }
  });
});

describe("zoom D2: a portrait phone's build screen", () => {
  const VIEWS: [number, number, number][] = [[390, 660, 3], [390, 664, 3], [402, 690, 3], [390, 844, 3], [430, 739, 3], [393, 659, 3], [402, 718, 3],
    [390, 700, 3], [360, 640, 2], [375, 667, 2], [414, 896, 2], [412, 915, 2.625], [320, 568, 2], [360, 780, 3], [428, 926, 3]];

  it("the shop: balanced rows of 46x42 faces, centred (3 + 3 for five offers and the reroll); perRow = ceil(slots / rows) for every slot count", () => {
    for (const [w, h, dpr] of VIEWS) {
      for (let offers = 0; offers <= 5; offers++) {
        const { L, phone } = screen(w, h, dpr, offers), tag = `${w}x${h} @${dpr} offers ${offers}`;
        expect(phone, tag).toBe(true);
        const slots = [...L.cards, L.reroll], fit = Math.floor((L.W - 8 + 3) / (CARD_W + 3)), rows = Math.ceil(slots.length / fit);
        expect(L.perRow, tag).toBe(Math.ceil(slots.length / rows));
        const ys = [...new Set(slots.map((r) => r.y))];
        expect(ys.length, tag).toBe(rows);
        const perRowCounts = ys.map((y) => slots.filter((r) => r.y === y).length);
        expect(Math.max(...perRowCounts) - Math.min(...perRowCounts), `${tag}: balanced`).toBeLessThanOrEqual(1);
        for (const r of slots) expect([r.w, r.h], tag).toEqual([CARD_W, CARD_H]);
        const first = slots.filter((r) => r.y === ys[0]), x0 = Math.min(...first.map((r) => r.x)), x1 = Math.max(...first.map((r) => r.x + r.w));
        expect(Math.abs(x0 - (L.W - x1)), `${tag}: centred`).toBeLessThanOrEqual(1);
        if (offers === 5 && rows === 2) expect(perRowCounts, tag).toEqual([3, 3]);
      }
    }
  });

  it("the band takes the room the zoom frees, up to phoneBand(W), and no more; the hull centred in what is left; nothing overlaps", () => {
    for (const [w, h, dpr] of VIEWS) {
      const { L } = screen(w, h, dpr), tag = `${w}x${h} @${dpr}`;
      const shopBottom = Math.max(...[...L.cards, L.reroll].map((r) => r.y + r.h));
      const spare = L.H - shopBottom - (2 + BARREL + 2 + HULL_L + 4 + CARGO_H + 3);
      expect(L.info.y, tag).toBe(shopBottom + 2);
      expect(L.info.h, tag).toBe(Math.min(phoneBand(L.W), spare));
      const above = L.hull.y - BARREL - 2 - (L.info.y + L.info.h), below = L.H - (L.cargo.y + CARGO_H + 3);
      expect(Math.abs(above - below), `${tag}: the hull centred in what is left`).toBeLessThanOrEqual(1);
      for (const r of [...L.cards, L.reroll]) expect(hit(r, L.info), tag).toBe(false);
      expect(L.info.y + L.info.h + 2 + BARREL, `${tag}: the bow's barrels clear of the band`).toBeLessThanOrEqual(L.hull.y);
    }
  });

  it("idle: the hero card (43 px) over NEXT BATTLE shows whole in the band (shoptap2 found both cut on Safari's views)", () => {
    for (const [w, h, dpr] of VIEWS) {
      const { L } = screen(w, h, dpr), tag = `${w}x${h} @${dpr}`;
      if (L.info.h < PORT_BAND) continue; // the fallback's short band (none of these views)
      const hero = heroCardRect(L.info, L.foe!);
      expect(within(L.foe!, L.info) && within(hero, L.info), tag).toBe(true);
      expect([hero.h, L.foe!.h, L.foe!.y - (hero.y + hero.h)], tag).toEqual([PORT_BAND - FOE_H - 2, FOE_H, 2]);
      expect(Math.abs(hero.y - L.info.y - (L.info.y + L.info.h - L.foe!.y - L.foe!.h)), `${tag}: in the band's middle`).toBeLessThanOrEqual(1);
    }
    // where the band is PORT_BAND or less the cards sit as before (the band's top, NEXT BATTLE at its foot)
    const base = baseLayout(167, 361, true, 5);
    expect(heroCardRect(base.info, base.foe!)).toEqual({ x: base.info.x, y: base.info.y, w: base.info.w, h: base.foe!.y - 2 - base.info.y });
  });
});

// ---------------------------------------------------------------------------------------------- every touch panel
const SHORTB = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const rig = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed => ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
const OFFER: Sel = { kind: "offer", wagon: 0, slot: 0 };
const TOUCH = { touch: true, hover: false, busy: false };

function furnace(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "shoptap2-panels");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORTB] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 2;
  return run;
}

/** Every panel a finger can open (shoptap2's set): each buyable module as a shop card and in cargo (every star), each rig
 *  at three places and each factory placed (every star), each core and gear fitted (every star, on two heroes' guns), each
 *  turret installed (every star, with a core and gear), the heroes' starting parts and belts, the KILN's belt. */
function panels(): { id: string; run: Run; sel: Sel; part: "offer" | "cargo" | "carrier" }[] {
  const out: ReturnType<typeof panels> = [];
  for (const d of buyableModules()) {
    const stars = fusible(d.id) ? [1, 2, 3] : [1];
    const o = furnace();
    o.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id}`, run: o, sel: OFFER, part: "offer" });
    for (const s of stars) {
      const c = furnace();
      c.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
      out.push({ id: `cargo ${d.id} ★${s}`, run: c, sel: { kind: "cargo", uid: 900 }, part: "cargo" });
      if (d.kind === "gate") {
        for (const [x, y, rot] of [[3, 3, 1], [0, 9, 0], [5, 3, 0]] as const) out.push({ id: `${d.id} ★${s} @${x},${y}`, run: furnace([rig(10, d.id, x, y, rot, s)]), sel: { kind: "item", uid: 10 }, part: "carrier" });
      } else if (d.kind === "factory") {
        out.push({ id: `${d.id} ★${s}`, run: furnace([{ uid: 10, def: d.id, x: 0, y: 6, ...(s > 1 ? { stars: s } : {}) }]), sel: { kind: "item", uid: 10 }, part: "carrier" });
      } else if (d.kind === "mod" || d.kind === "core") {
        for (const hero of ["furnace", "weaver"] as const) {
          const run = newRun(hero, 5, "shoptap2-fit");
          run.build.mods = [{ uid: 950, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) }];
          out.push({ id: `${d.id} ★${s} fitted on ${hero}`, run, sel: { kind: "fitted", uid: 950 }, part: "carrier" });
        }
      } else if (d.kind === "turret") {
        const run = furnace();
        setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: d.id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
        run.build.mods = [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }];
        out.push({ id: `turret ${d.id} ★${s} with a core and gear`, run, sel: { kind: "turret", index: 1 }, part: "carrier" });
      }
    }
  }
  for (const hero of PLAYABLE_HEROES) {
    const run = newRun(hero, 5, "shoptap2-start");
    for (const p of run.build.items) out.push({ id: `${hero}'s starting ${p.def}`, run, sel: { kind: "item", uid: p.uid }, part: "carrier" });
    if (turretSlots(run.build)[0]?.turret) out.push({ id: `${hero}'s starting turret`, run, sel: { kind: "turret", index: 0 }, part: "carrier" });
    run.build.routes.forEach((_, i) => out.push({ id: `${hero}'s belt ${i + 1}`, run, sel: { kind: "route", index: i }, part: "carrier" }));
  }
  out.push({ id: "the KILN's belt", run: furnace(), sel: { kind: "route", index: 0 }, part: "carrier" });
  return out;
}

describe("U2d: phoneBand(W) is what the tallest touch panel needs at W, and no more (re-measured with the new faces)", () => {
  it("at each step of the table and either side of it, the tallest fullest form of the 885 panels needs exactly phoneBand(W)", () => {
    const all = panels();
    // the band's layout at art width W (x5 at DPR 3: a finger's 27 px target), its height grown until the plan is fullest()
    const need = (W: number): [number, string] => {
      const L = buildLayout(W, 700, true, 5, true, 27), v = { W, H: 700, scale: 5, dpr: 3, portrait: true };
      let max = 0, who = "";
      for (const c of all) {
        const ctx = { game: { ui: new UI(), t: 0, view: v }, run: c.run, touch: true, L } as unknown as Ctx;
        const at = (h: number) => { const d = detailsPlan(ctx, c.sel, null, { ...L.info, h }); return !!d && fullest(d.plan); };
        if (at(max)) continue; // it fits where the tallest so far does
        expect(at(400), `W ${W}: ${c.id} in 400 px`).toBe(true);
        let lo = max, hi = 400;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (at(m)) hi = m; else lo = m; }
        max = hi;
        who = c.id;
      }
      return [max, who];
    };
    const widths = [186, 193, 194, 241, 280, 281, 315, 316, 319, 320, 340], tallest: string[] = [];
    const got = widths.map((W) => { const [n, who] = need(W); tallest.push(`${W}: ${n} ${who}`); return [W, n]; });
    console.log(`U2d phoneBand: ${tallest.join(" | ")}`);
    expect(got).toEqual(widths.map((W) => [W, phoneBand(W)]));
    expect(widths.map(phoneBand)).toEqual([155, 155, 148, 148, 148, 141, 141, 134, 134, 129, 129]); // was 169, 169, 162, 162, 155, 148, 148, 141, 141, 136, 136
  }, 120_000);
});

/** The panel a finger opens for `c` on a phone's build screen: where BuildScreen.panelArea draws it (the band wherever its
 *  full description fits there, fullText; else shoptap2's fallback grows it) and its plan there. */
function opened(v: View, L: BuildLayout, c: ReturnType<typeof panels>[number]) {
  const ctx = { game: { ui: new UI(), t: 0, view: v }, run: c.run, touch: true, L } as unknown as Ctx;
  const memo = new Map<string, ReturnType<typeof detailsPlan>>();
  const plan = (r: Rect) => {
    const key = `${r.x},${r.y},${r.w},${r.h}`;
    if (!memo.has(key)) memo.set(key, detailsPlan(ctx, c.sel, null, r));
    return memo.get(key)!;
  };
  const area = panelArea(L, c.sel, TOUCH, (r) => { const d = plan(r); return d ? fullText(d.plan) : null; });
  return { area, d: plan(area)! };
}

describe("zoom D3: on the phone views every touch panel shows its full description; in the band wherever the band holds it", () => {
  const all = panels();
  // what each view gives (the band; panels in the band in their fullest form, i.e. variant 0 with every block; in the band
  // with their full description, the flavour or hint given way or the same text at the tight pitch; grown, the fallback)
  const EXPECT: Record<string, { band: number; fullest: number; inBand: number; grown: string[] }> = {};
  for (const [w, h] of [[390, 660], [390, 664], [402, 690], [430, 739], [390, 844]] as const) {
    it(`${w}x${h} @3: every panel's full description (every kept block, every rule sentence, no compact form, no phone cut) shows, inside the band unless the band can't hold it`, () => {
      const { v, L } = screen(w, h, 3);
      expect(L.phone, `${w}x${h}`).toBe(true);
      let fullestN = 0, inBand = 0;
      const grown: string[] = [], flavour: string[] = [];
      for (const c of all) {
        const { area, d } = opened(v, L, c), tag = `${w}x${h}: ${c.id}`, p = d.plan;
        expect(p.r, tag).toEqual(area);
        expect(fullText(p), `${tag}: its full description`).toBe(true);
        expect(keptWhole(p), tag).toBe(true);
        expect(visibleLines(p).filter((q) => q.line !== "rule").length, `${tag}: a description`).toBeGreaterThanOrEqual(1);
        for (const b of p.rects ?? []) expect(within(b, p.r), `${tag}: button inside`).toBe(true);
        expect(within(area, { x: 0, y: L.bar.y + L.bar.h + 1, w: v.W, h: L.cargo.y - 2 - (L.bar.y + L.bar.h + 1) }), `${tag}: on the screen, above the cargo`).toBe(true);
        if (area === L.info) {
          inBand++;
          if (fullest(p)) fullestN++;
          else if (p.body.dropped.some((b) => b.role === "flavour")) flavour.push(c.id);
        } else grown.push(c.id);
        if (c.part === "offer") expect(area, `${tag}: a shop card's panel sits in the band`).toBe(L.info);
      }
      EXPECT[`${w}x${h}`] = { band: L.info.h, fullest: fullestN, inBand, grown };
      expect(all.length).toBe(885);
      // the band at 390x844 holds every panel in its fullest form; at 430x739 every one in the band; the shortest views'
      // band can't hold the longest turret panels (a THUNDERER ★3's full text needs 144 px): they take the fallback
      // (grown at 390x660 and 390x664: 30 installed turrets with a core and gear and 8 ★2 rigs and factories, 38 of 885; at
      // 402x690: 13 turrets, mostly ★2 and ★3; none at 430x739 and 390x844; every shop card's panel in the band everywhere)
      // bb-0.8.3 (REQ-BFG-042 M4, job BELTS): BASTION's starting WARDWORKS reads its next star and merge progress now, so at
      // 390x660 and 390x664 its flavour gives way in the band (it was in its fullest form): fullest 788 -> 787, 800 -> 799;
      // in the band and grown unchanged at every view (no panel moved to the fallback)
      const want: Record<string, [number, number, number]> = {
        // U2a (REQ-BFG-046): the new faces are shorter: more panels in the band, and in their fullest form
        // U2b (REQ-BFG-046): the rig, gear and supply faces too: 390x660 [789, 856] to [805, 860], 390x664 [801, 856] to [811, 860]
        // U2c step 4 (REQ-BFG-046): the installed turret's stat row is one line (its FIRES, CHAMBER and LOAD TIME rows were
        // three): more turret panels in the band, and in their fullest form: 390x660 [805, 860] to [805, 864], 390x664 [811, 860]
        // to [811, 864], 402x690 [852, 878] to [861, 881], 430x739 [884, 885] to [885, 885]
        // U2d: phoneBand re-measured with the new faces (148 at W 194-280): 430x739's band 151 -> 148 and 390x844's 162 ->
        // 148, each still holding all 885 panels in their fullest form; the three shorter views are unchanged
        "390x660": [104, 805, 864], "390x664": [106, 811, 864], "402x690": [122, 861, 881], "430x739": [148, 885, 885], "390x844": [148, 885, 885],
      };
      expect([L.info.h, fullestN, inBand], `${w}x${h}: band, fullest, in the band (grown: ${grown.join(" | ")}; flavour gave way: ${flavour.join(" | ")})`).toEqual(want[`${w}x${h}`]);
    }, 120_000);
  }
});
