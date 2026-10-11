// 0.8.0 H1, the Prime's verification (VERIFIED-H1, REQ-BFG-011, REQ-BFG-032). Three of the Prime's mutants survived the
// H1 suite, all on display paths that the other tests check only through state:
//  - text-window: the hero-select trick could state another fusion window than the sim's (heroTrick's numbers);
//  - strip-fn: drawPlatingStrip could draw nothing;
//  - strip-value: the battle plate could hand the strip another value than the side's plating.
// These tests pin each: the trick's numbers are the sim's constants, the strip draws one rune-blue segment per bulwark
// slug's plating (white where plating was just lost, the newest segment shining on a CLANK), and the plate of a BASTION
// side in a live battle draws the strip from that side's own plating. The canvas is a recording stand-in (node has none).
import { afterEach, describe, expect, it, vi } from "vitest";
import { Arena } from "../src/game/arena";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { drawPlatingStrip, STRIP_H } from "../src/render/raceFx";
import { drawPlate } from "../src/screens/battleHud";
import { C } from "../src/render/palette";
import { heroTrick } from "../src/ui/abilityText";
import { FUSE_MULT, SYNC_WINDOW } from "../src/sim/races/foundry";
import { fmtPct } from "../src/ui/statFormat"; // NUM-4 (REQ-BFG-047): FUSE_MULT as a whole %
import { PLATE_CAP, PLATE_PER_SLUG } from "../src/sim/races/bastion";

type Fill = { x: number; y: number; w: number; h: number; c: string };

/** A 2D context stand-in: records every fillRect with its fillStyle; every other method is a harmless no-op. */
function recorder(): { g: CanvasRenderingContext2D; fills: Fill[] } {
  const fills: Fill[] = [];
  const state: Record<string | symbol, unknown> = { fillStyle: "#000000" };
  const g = new Proxy(state, {
    get(t, p) {
      if (p === "fillRect") return (x: number, y: number, w: number, h: number) => fills.push({ x, y, w, h, c: String(t.fillStyle) });
      if (p === "measureText") return () => ({ width: 0 });
      if (p === "getImageData" || p === "createImageData") return (...a: number[]) => ({ data: new Uint8ClampedArray(4 * Math.max(1, (a[2] ?? 1) * (a[3] ?? 1))), width: a[2] ?? 1, height: a[3] ?? 1 });
      if (p in t) return t[p];
      return () => undefined;
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  });
  return { g: g as unknown as CanvasRenderingContext2D, fills };
}

const count = (fills: Fill[], c: string): number => fills.filter((f) => f.c === c).length;
const SEGMENTS = PLATE_CAP / PLATE_PER_SLUG;

describe("FOUNDRY's and BASTION's hero-select tricks state the sim's own numbers", () => {
  it("the fusion window and multiplier (FOUNDRY), the plating per slug and its cap (BASTION)", () => {
    const f = heroTrick("foundry");
    // NUM-4 (REQ-BFG-047, N1 2.2): the fusion window (SYNC_WINDOW 0.25 s) is a hidden sub-second timer, so the trick
    // names it by the PAIR word AT ONCE (was `WITHIN ${SYNC_WINDOW} SECONDS FUSE`); the multiplier is FUSE_MULT as a
    // whole % through fmtPct, "15% MORE" (was `WITH ${FUSE_MULT} TIMES THEIR DAMAGE`)
    expect(SYNC_WINDOW).toBeLessThan(1);
    expect(f).toContain("REACH ONE GUN AT ONCE FUSE");
    expect(f).toContain(`DEALS THEIR DAMAGE AND ${fmtPct(FUSE_MULT - 1)} MORE`);
    const b = heroTrick("bastion");
    expect(b).toContain(`${PLATE_PER_SLUG} EACH UP TO ${PLATE_CAP} PLATING`);
  });
});

describe("the plating strip draws what it is given", () => {
  it("one rune-blue segment per bulwark slug's plating, a part-full one lighter, dark plate for the rest", () => {
    // NUM-1: the plating amounts are six slugs' (was the literal 12), six and a half (was 13) and eight (was 16), in
    // PLATE_PER_SLUG units, so they follow the x10 plating (PLATE_PER_SLUG 2 -> 20, PLATE_CAP 24 -> 240)
    const six = 6 * PLATE_PER_SLUG;
    const full = recorder();
    drawPlatingStrip(full.g, 0, 0, 120, six, six, PLATE_CAP, SEGMENTS, 0);
    expect(count(full.fills, C.plate0)).toBe(SEGMENTS);
    expect(count(full.fills, C.rune2)).toBe(six / PLATE_PER_SLUG);
    expect(count(full.fills, C.rune1)).toBe(0);
    expect(full.fills.every((f) => f.y >= 0 && f.y + f.h <= STRIP_H)).toBe(true);

    const part = recorder();
    drawPlatingStrip(part.g, 0, 0, 120, 6.5 * PLATE_PER_SLUG, 6.5 * PLATE_PER_SLUG, PLATE_CAP, SEGMENTS, 0);
    expect(count(part.fills, C.rune2)).toBe(6);
    expect(count(part.fills, C.rune1)).toBe(1);
    expect(count(part.fills, C.rune3)).toBe(7);

    const none = recorder();
    drawPlatingStrip(none.g, 0, 0, 120, 0, 0, PLATE_CAP, SEGMENTS, 0);
    expect(count(none.fills, C.rune1) + count(none.fills, C.rune2) + count(none.fills, C.rune3)).toBe(0);
    expect(count(none.fills, C.plate0)).toBe(SEGMENTS);
  });

  it("plating just lost shows white; a CLANK lights the newest segment", () => {
    // NUM-1: plating 6 and 8 slugs' worth in PLATE_PER_SLUG units (were the literals 12 and 16, at 2 a slug)
    const chip = recorder();
    drawPlatingStrip(chip.g, 0, 0, 120, 6 * PLATE_PER_SLUG, 8 * PLATE_PER_SLUG, PLATE_CAP, SEGMENTS, 0);
    expect(count(chip.fills, C.white)).toBe(2);
    expect(count(chip.fills, C.rune2)).toBe(6);

    const clank = recorder();
    drawPlatingStrip(clank.g, 0, 0, 120, 6 * PLATE_PER_SLUG, 6 * PLATE_PER_SLUG, PLATE_CAP, SEGMENTS, 1);
    const shine = clank.fills.filter((f) => f.c === C.white);
    expect(shine.length).toBe(1);
    expect(shine[0].x).toBe(Math.floor((5 * 120) / SEGMENTS)); // segment 6 of 12 (index 5) holds the newest plating
  });
});

describe("a BASTION side's battle plate draws the strip from that side's own plating", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lit segments match the side's plating; a FOUNDRY side's plate draws no strip", () => {
    // glyph and panel caches make their own canvases: hand them recording stand-ins too
    vi.stubGlobal("document", { createElement: () => ({ width: 1, height: 1, getContext: () => recorder().g }) });
    const a = new Arena(heroRefBuild("foundry", 5), heroRefBuild("bastion", 5), 21, null);
    a.quiet = true;
    for (let f = 0; f < 60 * 400 && !a.b.over && a.b.sides[1].race!.plating.plate < PLATE_PER_SLUG; f++) a.update(1 / 60);
    const plate = a.b.sides[1].race!.plating.plate;
    expect(plate).toBeGreaterThanOrEqual(PLATE_PER_SLUG);
    const game = { t: 0 } as unknown as Parameters<typeof drawPlate>[1];
    const r = { x: 0, y: 0, w: 200, h: 11 };

    const bastion = recorder();
    drawPlate(bastion.g, game, a, r, 1, "BASTION", "147");
    const fullSegs = Math.floor(plate / PLATE_PER_SLUG + 1e-9);
    const partSegs = plate / PLATE_PER_SLUG - fullSegs > 1e-9 ? 1 : 0;
    // WIND-1 (REQ-BFG-097): the battle plate's strip wears plating's own colours (plate2 full, plate1 part full), apart
    // from SHIELD's rune blue (was rune2 and rune1)
    expect(count(bastion.fills, C.plate2)).toBe(fullSegs);
    expect(count(bastion.fills, C.plate1)).toBe(partSegs);

    const foundry = recorder();
    drawPlate(foundry.g, game, a, r, 0, "FOUNDRY", "147");
    expect(count(foundry.fills, C.plate2) + count(foundry.fills, C.plate1) + count(foundry.fills, C.plate0)).toBe(0);
  });
});
