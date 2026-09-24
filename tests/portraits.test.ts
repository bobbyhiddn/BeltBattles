import { describe, expect, it } from "vitest";
import { C, type ColorName } from "../src/render/palette";
import { PORTRAIT_KEYS, portraitPixels, type PortraitKey } from "../src/render/portraits";
import { HEROES } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { RIVALS, RIVAL_IDS } from "../src/sim/rivals";

// Captain portraits are pure pixel data, so they are checked here without a canvas.

const W = 24, H = 24;
const all = PORTRAIT_KEYS.map((k) => [k, portraitPixels(k)] as const);
const pix = (px: (ColorName | null)[], x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? null : px[y * W + x]);
const FRAME = new Set<ColorName>(["amber", "plum3", "plum4"]);
const onBorder = (x: number, y: number) => x === 0 || y === 0 || x === W - 1 || y === H - 1 || ((x === 2 || x === W - 3) && (y === 2 || y === H - 3));

describe("captain portraits (24x24 pixel data)", () => {
  it("every rival and every playable hero has exactly one portrait", () => {
    for (const id of RIVAL_IDS) expect(PORTRAIT_KEYS).toContain(id);
    for (const h of PLAYABLE_HEROES) expect(PORTRAIT_KEYS).toContain(h);
    expect(new Set(PORTRAIT_KEYS).size).toBe(PORTRAIT_KEYS.length);
    expect(PORTRAIT_KEYS.length).toBe(RIVAL_IDS.length + PLAYABLE_HEROES.length);
  });

  it("each portrait is 24x24 and uses only palette colour names or null", () => {
    for (const [k, p] of all) {
      expect([p.w, p.h, p.px.length], k).toEqual([W, H, W * H]);
      for (const c of p.px) if (c !== null) expect(c in C, `${k}: ${c}`).toBe(true);
    }
  });

  it("45-85% of each portrait's pixels are opaque", () => {
    const lines: string[] = [];
    for (const [k, p] of all) {
      const share = p.px.filter((c) => c !== null).length / p.px.length;
      lines.push(`${k} ${(share * 100).toFixed(0)}%`);
      expect(share, k).toBeGreaterThanOrEqual(0.45);
      expect(share, k).toBeLessThanOrEqual(0.85);
    }
    // eslint-disable-next-line no-console
    console.log(`opaque: ${lines.join(", ")}`);
  });

  it("the silhouette has a 1 px ink outline (frame corners aside)", () => {
    for (const [k, p] of all) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (pix(p.px, x, y) !== null) continue;
          for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            const n = pix(p.px, nx, ny);
            if (n === null || n === "ink" || (FRAME.has(n) && onBorder(nx, ny))) continue;
            expect.fail(`${k}: ${n} at ${nx},${ny} touches transparency without an outline`);
          }
        }
      }
    }
  });

  it("rivals wear their RIVALS palette; elites get amber corners, the boss plum, others none", () => {
    for (const id of RIVAL_IDS) {
      const { px } = portraitPixels(id);
      for (const c of RIVALS[id].portrait.palette) expect(px, `${id} uses ${c}`).toContain(c);
      const corner = pix(px, 0, 0);
      const rank = RIVALS[id].rank;
      expect(corner, id).toBe(rank === "elite" ? "amber" : rank === "boss" ? "plum4" : null);
      expect([pix(px, W - 1, 0), pix(px, 0, H - 1), pix(px, W - 1, H - 1)], id).toEqual([corner, corner, corner]);
    }
    for (const h of PLAYABLE_HEROES as readonly PortraitKey[]) expect(pix(portraitPixels(h).px, 0, 0), h).toBe(null);
  });

  it("orcs and elves keep their faction bases (rust skin with tusks, verdigris skin with long ears)", () => {
    for (const [k, p] of all) {
      const faction = k in HEROES ? HEROES[k as keyof typeof HEROES].faction : RIVALS[k as keyof typeof RIVALS].faction;
      if (faction === "orc") {
        expect(p.px.filter((c) => c === "rust3").length, k).toBeGreaterThan(40);
        expect(p.px, k).toContain("bone");
      } else {
        expect(p.px.filter((c) => c === "verd4").length, k).toBeGreaterThan(25);
        expect(pix(p.px, 2, 7) ?? pix(p.px, 3, 8), `${k} left ear`).not.toBe(null);
      }
    }
  });

  it("all portraits differ from one another, and each key always gives the same pixels", () => {
    const seen = new Map<string, string>();
    for (const [k, p] of all) {
      const sig = p.px.map((c) => c ?? "-").join(",");
      expect(seen.get(sig), `${k} duplicates ${seen.get(sig)}`).toBeUndefined();
      seen.set(sig, k);
      expect(portraitPixels(k)).toEqual(p);
    }
    expect(seen.size).toBe(PORTRAIT_KEYS.length);
  });
});
