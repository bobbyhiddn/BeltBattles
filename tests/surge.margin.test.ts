// CUSTOM-3 (REVIEW-STAGE096 R5 b): the landscape surge stays inside the boards' margin. At a surge's outer reach in desk
// landscape 0.9.6 carried the boards' outer tile columns partly off the side edges (desk 1920x1080: the margin is 6 px,
// the surge 10). The battle's lanes (battleLayout.ts laneSpec, as battle.ts and replay.ts fit them) now cap the
// landscape surge at that margin. This sweeps every surge phase (two minutes of display clock at 60 fps, several seeds)
// on the desk, the laptop and the phone in landscape, and finds every tile column of both boards on screen; portrait's
// lanes are 0.9.6's (no edge, the same drift and surge).
import { describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { battleLayout, battleScale, laneLayout, laneSpec, minGap } from "../src/game/battleLayout";
import { DECK, TILE, TILES } from "../src/render/frame";
import { MotionModel, SURGE_LAND, SURGE_MAX } from "../src/render/motion";

/** The battle's lanes on a viewport, as BattleScreen.relayout builds them. */
function lanes(w: number, h: number, dpr: number) {
  const v = computeView(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p));
  const L = laneLayout(battleLayout(v.W, v.H, v.portrait));
  return { v, L, spec: laneSpec(L, minGap(v.portrait ? v.H : v.W)) };
}

/** Over two minutes of clock: each board's tile columns' screen x range at its rounded surge offset; the worst spill
 *  past the side edges (px) and the outermost offsets seen. */
function sweep(L: ReturnType<typeof lanes>["L"], spec: ReturnType<typeof lanes>["spec"], seeds: number[]) {
  let spill = 0, minP = 0, maxE = 0;
  for (const seed of seeds) {
    const m = new MotionModel(seed);
    m.setLanes(spec);
    for (let i = 0; i <= 120 * 60; i++) {
      const t = i / 60;
      const [pdx] = m.offset(0, t), [edx] = m.offset(1, t);
      minP = Math.min(minP, pdx);
      maxE = Math.max(maxE, edx);
      // every column: the player's deck spans dx .. dx + DECK (facing east), the enemy's too (facing west)
      for (let c = 0; c < TILES; c++) {
        const p0 = L.frames[0].dx + c * TILE + pdx, e0 = L.frames[1].dx + c * TILE + edx;
        spill = Math.max(spill, -p0, p0 + TILE - L.W, -e0, e0 + TILE - L.W);
      }
    }
  }
  return { spill, minP, maxE };
}

describe("CUSTOM-3 the landscape surge margin (REVIEW-STAGE096 R5 b)", () => {
  const SEEDS = [1, 7, 12345, 0x2f6b9a1d, 99991];
  for (const [name, w, h, dpr, margin] of [["desk", 1920, 1080, 1, 6], ["laptop", 1280, 720, 1, 9], ["phone-land", 844, 390, 3, 7]] as const) {
    it(`${name} ${w}x${h} @${dpr}: at every surge phase every tile column of both boards is on screen`, () => {
      const { v, L, spec } = lanes(w, h, dpr);
      expect(v.portrait).toBe(false);
      expect(spec.edge, name).toBe(margin); // the outer columns' margin at rest
      expect(L.frames[0].dx, name).toBeGreaterThanOrEqual(margin);
      expect(L.W - (L.frames[1].dx + DECK), name).toBeGreaterThanOrEqual(margin);
      const r = sweep(L, spec, SEEDS);
      expect(r.spill, `${name}: px of a tile column past a side edge`).toBeLessThanOrEqual(0);
      // the surge still moves the boards (to the margin's full reach, both ways)
      expect(r.minP, name).toBe(-Math.min(SURGE_LAND, margin));
      expect(r.maxE, name).toBe(Math.min(SURGE_LAND, margin));
      // 0.9.6's lanes (no edge: the surge 10) spilled a column off this screen
      const old = sweep(L, { ...spec, edge: undefined }, SEEDS);
      expect(old.spill, `${name}: 0.9.6 spilled`).toBe(SURGE_LAND - margin);
    });
  }

  it("portrait: the lanes carry no edge, and the drift and surge are 0.9.6's", () => {
    for (const [w, h, dpr] of [[390, 844, 3], [390, 660, 3], [360, 640, 2], [430, 739, 3]] as const) {
      const { v, L, spec } = lanes(w, h, dpr);
      expect(v.portrait).toBe(true);
      expect(spec).toEqual({ portrait: true, gapRest: L.gap, gapMin: minGap(v.H) });
      const a = new MotionModel(12345), b = new MotionModel(12345);
      a.setLanes(spec);
      b.setLanes({ portrait: true, gapRest: L.gap, gapMin: minGap(v.H) }); // 0.9.6's call
      let maxX = 0;
      for (let i = 0; i <= 60 * 60; i += 7) {
        expect(a.pose(0, i / 60)).toEqual(b.pose(0, i / 60));
        expect(a.pose(1, i / 60)).toEqual(b.pose(1, i / 60));
        maxX = Math.max(maxX, Math.abs(a.offset(0, i / 60)[0]));
      }
      expect(maxX).toBe(SURGE_MAX);
    }
  });
});
