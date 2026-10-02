import { describe, expect, it } from "vitest";
import { C, type ColorName } from "../src/render/palette";
import { PORTRAIT_HEROES, PORTRAIT_KEYS, portraitPixels, type PortraitKey } from "../src/render/portraits";
import { blank, paintBase, type Base, type Look } from "../src/render/portraitArt";
import { HEROES } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { RIVALS, RIVAL_IDS } from "../src/sim/rivals";

// Captain portraits are pure pixel data, so they are checked here without a canvas.

const W = 24, H = 24;
const all = PORTRAIT_KEYS.map((k) => [k, portraitPixels(k)] as const);
const pix = (px: (ColorName | null)[], x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? null : px[y * W + x]);
const FRAME = new Set<ColorName>(["amber", "plum3", "plum4"]);
const onBorder = (x: number, y: number) => x === 0 || y === 0 || x === W - 1 || y === H - 1 || ((x === 2 || x === W - 3) && (y === 2 || y === H - 3));
/** 0.8.0 N1: a race base's own pixels (skin, brows, ink, tusks), painted with look colours no base uses, then kept
 *  (VERIFIED-A1 G item 2: A1's model in tests/wave3Art.test.ts), and the share of them a portrait shows. */
const BASES: Base[] = ["orc", "elf", "human", "dwarf"];
const BASE_PX = new Map(BASES.map((b) => {
  const look: Look = { eye: "plum0", garment: "plum1", trim: "plum2", hair: "plum3" };
  const p = blank();
  paintBase(p, b, look);
  const own = new Map<number, ColorName>();
  p.forEach((c, i) => { if (c && !["plum0", "plum1", "plum2", "plum3"].includes(c)) own.set(i, c); });
  return [b, own] as const;
}));
const baseShare = (px: (ColorName | null)[], b: Base): number => {
  const own = BASE_PX.get(b)!;
  let n = 0;
  for (const [i, c] of own) if (px[i] === c) n++;
  return n / own.size;
};

describe("captain portraits (24x24 pixel data)", () => {
  it("every rival and every playable hero has exactly one portrait", () => {
    for (const id of RIVAL_IDS) expect(PORTRAIT_KEYS).toContain(id);
    for (const h of PLAYABLE_HEROES) expect(PORTRAIT_KEYS).toContain(h);
    expect(new Set(PORTRAIT_KEYS).size).toBe(PORTRAIT_KEYS.length);
    // 0.8.0 H1: the heroes with portrait art (FOUNDRY and BASTION joined FURNACE and WEAVER; METRONOME and SIPHON have none yet)
    expect([...PORTRAIT_HEROES]).toEqual(["furnace", "weaver", "foundry", "bastion"]);
    expect(PORTRAIT_KEYS.length).toBe(RIVAL_IDS.length + PORTRAIT_HEROES.length);
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
    for (const h of PORTRAIT_HEROES as readonly PortraitKey[]) expect(pix(portraitPixels(h).px, 0, 0), h).toBe(null);
  });

  it("orcs and elves keep their faction bases (rust skin with tusks, verdigris skin with long ears); 0.8.0 H1: humans and dwarves have theirs", () => {
    for (const [k, p] of all) {
      const faction = k in HEROES ? HEROES[k as keyof typeof HEROES].faction : RIVALS[k as keyof typeof RIVALS].faction;
      const n = (c: ColorName) => p.px.filter((x) => x === c).length;
      if (faction === "orc") {
        expect(n("rust3"), k).toBeGreaterThan(40);
        expect(p.px, k).toContain("bone");
      } else if (faction === "human" || faction === "dwarf") {
        // 0.8.0 N1 (BRIEF-wave3-N1 section 3, VERIFIED-A1 G item 2): BASE checks. A human or dwarf captain draws its own
        // palette on its race's base, as the orc and elf captains do, so the faction's checks read the base: most of the
        // base's own pixels show, more than any other base's; a human keeps its guild skin and plain ears. (They read
        // FOUNDRY's and BASTION's own colours before; those stay, below, as the two hero portraits' checks.)
        const own = baseShare(p.px, faction);
        expect(own, `${k} on the ${faction} base`).toBeGreaterThanOrEqual(0.6);
        for (const b of BASES) if (b !== faction) expect(baseShare(p.px, b), `${k}: ${b} base`).toBeLessThan(own);
        if (faction === "human") {
          expect(n("skin2"), k).toBeGreaterThan(40);
          expect([pix(p.px, 3, 9), pix(p.px, W - 4, 9)], `${k} ears`).toEqual(["skin1", "skin1"]);
        }
        if (k === "foundry") { // FOUNDRY: guild skin, plain ears on both sides, a leather cap, brass goggles
          expect(n("wood2"), k).toBeGreaterThan(15);
          expect(n("brass2"), k).toBeGreaterThan(8);
        }
        if (k === "bastion") { // BASTION: a great ginger beard, an iron helm with a rune, stone pauldrons
          expect(n("cop2"), k).toBeGreaterThan(60);
          expect(n("steel2"), k).toBeGreaterThan(20);
          expect(p.px, k).toContain("rune2");
          expect(n("stone3"), k).toBeGreaterThan(10);
        }
      } else {
        expect(n("verd4"), k).toBeGreaterThan(25);
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
