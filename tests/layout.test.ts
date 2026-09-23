import { describe, expect, it } from "vitest";
import { GAP_MIN, GAP_SHARE, GAP_SHARE_MAX, arenaIn, battleLayout, battleScale, gapRoom, minGap } from "../src/game/battleLayout";
import { computeView } from "../src/core/io";
import { HULL_A, HULL_L, type Box } from "../src/render/frame";

// 0.5.0 (REQ-BQR-001): the open floor between the cruisers is a constraint. Gap >= 17% of the
// firing axis everywhere (>= 20% on desk and phone), deck share of the short axis >= 0.60.
const VIEWS: Record<string, { css: [number, number]; dpr: number; scale: number; gap: number; minShare: number }> = {
  desk: { css: [1920, 1080], dpr: 1, scale: 5, gap: 104, minShare: 0.2 },
  laptop: { css: [1366, 768], dpr: 1, scale: 4, gap: 61, minShare: 0.17 },
  phone: { css: [390, 844], dpr: 3, scale: 6, gap: 102, minShare: 0.2 },
  small: { css: [360, 640], dpr: 2, scale: 3, gap: 106, minShare: 0.17 },
};

const inside = (b: Box, W: number, H: number) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("battle framing: open floor between the cruisers (0.5.0)", () => {
  for (const [name, t] of Object.entries(VIEWS)) {
    it(`${name}: scale ${t.scale}, gap ${t.gap} px, shares meet the targets`, () => {
      const v = computeView(t.css[0], t.css[1], t.dpr, battleScale);
      const L = battleLayout(v.W, v.H, v.portrait);
      expect(v.scale).toBe(t.scale);
      expect(L.gap).toBe(t.gap);
      expect(L.compact).toBe(false);
      const axis = v.portrait ? t.css[1] : t.css[0];
      const gapShare = (L.gap * v.scale) / v.dpr / axis;
      const deckShare = v.portrait ? (L.deckArea.w * v.scale) / v.dpr / t.css[0] : (L.deckArea.h * v.scale) / v.dpr / t.css[1];
      expect(gapShare).toBeGreaterThanOrEqual(t.minShare);
      expect(gapShare).toBeLessThanOrEqual(0.35);
      expect(deckShare).toBeGreaterThanOrEqual(0.6);
      // the gap is the real distance between the hull boxes, and it is open floor
      const [hp, he] = L.hulls;
      const between = v.portrait ? hp.y - (he.y + he.h) : he.x - (hp.x + hp.w);
      expect(between).toBe(L.gap);
      expect(overlap(L.gapBox, hp) || overlap(L.gapBox, he)).toBe(false);
      // plates and the bar stay attached: plates touch their hull, the bar docks under the cruisers
      for (let s = 0; s < 2; s++) {
        const p = L.plates[s], h = L.hulls[s];
        const dist = v.portrait ? Math.min(Math.abs(p.y + p.h - h.y), Math.abs(p.y - (h.y + h.h))) : Math.abs(p.y + p.h - h.y);
        expect(dist).toBeLessThanOrEqual(1);
        expect(inside(p, v.W, v.H)).toBe(true);
        expect(overlap(p, L.gapBox)).toBe(false);
      }
      expect(inside(L.bar, v.W, v.H)).toBe(true);
      if (v.portrait) expect(L.bar.y - (L.plates[0].y + L.plates[0].h)).toBeLessThanOrEqual(2);
      else expect(L.bar.y).toBe(hp.y + HULL_A);
      for (const h of L.hulls) expect(inside(h, v.W, v.H)).toBe(true);
    });
  }

  it("the gap is a constraint across many viewports: >= 17% of the firing axis, at most 33%", () => {
    let checked = 0;
    for (const dpr of [1, 2, 3]) {
      for (let w = 320; w <= 2560; w += 97) {
        for (let h = 480; h <= 1600; h += 83) {
          const v = computeView(w, h, dpr, battleScale);
          if (v.scale === 1 && gapRoom(v.W, v.H, v.portrait) < minGap(v.portrait ? v.H : v.W)) continue; // tiny fallback
          const L = battleLayout(v.W, v.H, v.portrait);
          const axis = v.portrait ? v.H : v.W;
          expect(L.gap).toBeGreaterThanOrEqual(Math.max(GAP_MIN, Math.ceil(axis * GAP_SHARE)));
          expect(L.gap).toBeLessThanOrEqual(Math.max(minGap(axis), Math.floor(axis * GAP_SHARE_MAX)));
          for (const b of [...L.hulls, ...L.plates, L.bar]) expect(inside(b, v.W, v.H)).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("a larger scale is only refused when its gap would be too small", () => {
    // desk: scale 6 fits the hulls but leaves 40 px (12.5%); 0.5.0 takes scale 5
    expect(gapRoom(320, 180, false)).toBe(40);
    expect(40).toBeLessThan(minGap(320));
    expect(battleScale(1920, 1080, false)).toBe(5);
  });

  it("arenaIn previews clamp the requested gap to their box", () => {
    const a = arenaIn({ x: 0, y: 0, w: 640, h: 300 }, false, 128);
    expect(a.hulls[1].x - (a.hulls[0].x + HULL_L)).toBe(128);
    const b = arenaIn({ x: 0, y: 0, w: 234, h: 330 }, true, 101);
    expect(b.hulls[0].y - (b.hulls[1].y + HULL_L)).toBe(330 - 2 * HULL_L);
  });
});
