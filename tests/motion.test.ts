// MOTION-1 (REQ-BFG-071): the battles-in-motion prototype's display math (src/render/motion.ts) and lanes
// (src/game/battleLayout.ts laneLayout). Display only: none of this touches the sim.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BANK_MAX_DEG, MOTION, MOTION_BUILD, MotionModel, REDUCED_SCROLL, SWAY_MAX_DEG, affineAngle, applyAffine, boardAffine,
  displayRng, invertAffine, parseMotionOpts, seaForDay, type Affine,
} from "../src/render/motion";
import { battleLayout, battleScale, laneLayout, minGap } from "../src/game/battleLayout";
import { computeView } from "../src/core/io";

const SEEDS = [1, 7, 12345, 0x7fffffff];
const TIMES = [0, 0.5, 3.3, 7.77, 12.5, 29.9, 61.2, 180.04];
const SWAYS = [0, 1.5, -3, 3];

/** Battle layouts as the game frames them on a few screens (CSS size and DPR -> the battle's own scale). */
function layouts() {
  const screens: [number, number, number][] = [[390, 844, 3], [360, 640, 2], [375, 667, 2], [390, 660, 3], [1280, 720, 1], [844, 390, 3], [1920, 1080, 1], [1366, 768, 1]];
  return screens.map(([w, h, dpr]) => {
    const v = computeView(w, h, dpr, (pw, ph, portrait) => battleScale(pw, ph, portrait));
    const L = laneLayout(battleLayout(v.W, v.H, v.portrait));
    return { name: `${w}x${h}@${dpr}`, L, gapMin: minGap(v.portrait ? v.H : v.W) };
  });
}

function model(seed: number, sway = 0, portrait = true, gapRest = 102, gapMin = 72): MotionModel {
  const m = new MotionModel(seed, { sway });
  m.setLanes({ portrait, gapRest, gapMin });
  return m;
}

/** A board's map at time t, as ArenaMotion.frame builds it (pivot, rounded offset, shake). */
function boardMap(m: MotionModel, s: 0 | 1, t: number, cx: number, cy: number, shake = 0): Affine {
  const p = m.pose(s, t);
  return boardAffine(cx, cy, Math.round(p.x) + shake, Math.round(p.y) - shake, p.bank, p.gimbal);
}

describe("MOTION-1 display math (REQ-BFG-071)", () => {
  it("screen -> board -> screen round-trips within 0.5 px at several times and sway angles", () => {
    let n = 0;
    for (const seed of SEEDS) for (const sway of SWAYS) for (const t of TIMES) for (const s of [0, 1] as const) {
      const m = model(seed, sway);
      const A = boardMap(m, s, t, 97, s ? 81 : 323, t > 10 ? 2 : 0);
      for (let x = -20; x <= 215; x += 47) for (let y = -10; y <= 430; y += 61) {
        const b = invertAffine(A, x, y, [0, 0]);
        const q = applyAffine(A, b[0], b[1], [0, 0]);
        expect(Math.hypot(q[0] - x, q[1] - y)).toBeLessThan(0.5);
        const r = applyAffine(A, x, y, [0, 0]);
        const p = invertAffine(A, r[0], r[1], [0, 0]);
        expect(Math.hypot(p[0] - x, p[1] - y)).toBeLessThan(0.5);
        n++;
      }
    }
    expect(n).toBeGreaterThan(5000);
  });

  it("the board map is the carrier's (translate, turn by the heading) times the gimbal's (turn back, then the sway)", () => {
    for (const sway of SWAYS) for (const t of TIMES) {
      const m = model(12345, sway);
      const p = m.pose(1, t);
      const A = boardAffine(100, 80, 3, -2, p.bank, p.gimbal);
      // compose by hand: carrier R(-bank) then gimbal R(-gimbal) (canvas angles), about the pivot
      const r1 = (-p.bank * Math.PI) / 180, r2 = (-p.gimbal * Math.PI) / 180;
      const rot = (x: number, y: number, r: number) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
      for (const [x, y] of [[0, 0], [100, 80], [37, 211], [190, 5]]) {
        const g = rot(x - 100, y - 80, r2);
        const c = rot(g[0], g[1], r1);
        const want = [c[0] + 100 + 3, c[1] + 80 - 2];
        const got = applyAffine(A, x, y, [0, 0]);
        expect(Math.hypot(got[0] - want[0], got[1] - want[1])).toBeLessThan(1e-6);
      }
    }
  });

  it("the two boards' angles are equal at every sampled time (and equal the shared sway)", () => {
    for (const seed of SEEDS) for (const sway of SWAYS) {
      const m = model(seed, sway);
      for (let t = 0; t < 120; t += 0.37) {
        const p0 = m.pose(0, t), p1 = m.pose(1, t);
        expect(p0.board).toBe(p1.board);
        expect(Math.abs(p0.board)).toBeLessThanOrEqual(Math.abs(sway) + 1e-12);
        const a0 = affineAngle(boardMap(m, 0, t, 97, 323)), a1 = affineAngle(boardMap(m, 1, t, 97, 81));
        expect(Math.abs(a0 - a1)).toBeLessThan(1e-9);
        expect(Math.abs(a0 - p0.board)).toBeLessThan(1e-9);
      }
    }
  });

  it("without sway both boards stay screen-aligned: a whole-pixel translation (crisp pixel art)", () => {
    const m = model(7, 0);
    for (let t = 0; t < 60; t += 0.29) for (const s of [0, 1] as const) {
      const A = boardMap(m, s, t, 97, s ? 81 : 323, 1);
      expect([A.a, A.b, A.c, A.d]).toEqual([1, 0, 0, 1]);
      expect(Number.isInteger(A.e) && Number.isInteger(A.f)).toBe(true);
    }
  });

  it("|bank| <= 12 degrees always, and the sway at most 3", () => {
    let most = 0;
    for (const seed of SEEDS) for (const portrait of [true, false]) {
      const m = model(seed, 99, portrait, portrait ? 102 : 146, portrait ? 72 : 73);
      expect(m.sway).toBe(SWAY_MAX_DEG);
      for (let t = 0; t < 600; t += 0.05) for (const s of [0, 1] as const) {
        const p = m.pose(s, t);
        expect(Math.abs(p.bank)).toBeLessThanOrEqual(BANK_MAX_DEG);
        expect(Math.abs(p.board)).toBeLessThanOrEqual(SWAY_MAX_DEG + 1e-12);
        most = Math.max(most, Math.abs(p.bank));
      }
    }
    expect(most).toBeGreaterThan(8); // it does turn
  });

  it("heading and drift agree (a carrier turning up drifts up), on smooth curves with no jitter", () => {
    const m = model(12345);
    const h = 1e-3;
    for (let t = 0.01; t < 300; t += 0.21) for (const s of [0, 1] as const) {
      const v = (m.pose(s, t + h).y - m.pose(s, t - h).y) / (2 * h); // + = moving down the screen
      const bank = m.pose(s, t).bank; // + = bow up
      if (Math.abs(v) > 0.05) expect(Math.sign(bank)).toBe(-Math.sign(v));
      // a 60 fps frame turns it by well under a degree and moves it by well under a pixel
      const a = m.pose(s, t), b = m.pose(s, t + 1 / 60);
      expect(Math.abs(b.bank - a.bank)).toBeLessThan(0.2);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.2);
    }
  });

  it("reduce motion: straight sailing (bank 0, no drift, surge, bob or sway) and the backdrop at a quarter speed", () => {
    const m = new MotionModel(7, { sway: 3, reduced: true });
    m.setLanes({ portrait: true, gapRest: 102, gapMin: 72 });
    for (const t of TIMES) for (const s of [0, 1] as const) {
      const p = m.pose(s, t);
      expect([p.bank, p.x, p.y, p.bob, p.board]).toEqual([0, 0, 0, 0, 0]);
    }
    expect(m.scrollFactor()).toBe(REDUCED_SCROLL);
    expect(REDUCED_SCROLL).toBe(0.25);
    for (let i = 0; i < 60; i++) m.advance(1 / 60);
    expect(m.dist).toBeCloseTo(0.25, 6);
    expect(m.t).toBeCloseTo(1, 6);
    m.reduced = false;
    for (let i = 0; i < 60; i++) m.advance(1 / 60);
    expect(m.dist).toBeCloseTo(1.25, 6); // continuous: the scroll never jumps when the setting changes
  });

  it("the gap between the boards never drops below its minimum, on every screen's lanes", () => {
    for (const { name, L, gapMin } of layouts()) {
      expect(L.gap, name).toBeGreaterThanOrEqual(gapMin);
      for (const seed of SEEDS) {
        const m = new MotionModel(seed);
        m.setLanes({ portrait: L.portrait, gapRest: L.gap, gapMin });
        let least = Infinity;
        for (let t = 0; t < 300; t += 0.05) {
          // the gap as drawn: the hull boxes at rest plus each side's rounded offset along the firing axis
          const [px, py] = m.offset(0, t), [ex, ey] = m.offset(1, t);
          const [hp, he] = L.hulls;
          const drawn = L.portrait ? (hp.y + py) - (he.y + he.h + ey) : (he.x + ex) - (hp.x + hp.w + px);
          expect(drawn, `${name} seed ${seed} t ${t}`).toBe(m.gapAt(t));
          least = Math.min(least, drawn);
        }
        expect(least, name).toBeGreaterThanOrEqual(gapMin);
      }
    }
  });

  it("the lanes: portrait keeps today's stack (the enemy above, today's board size); landscape raises the enemy's lane", () => {
    for (const { name, L } of layouts()) {
      const base = battleLayout(L.W, L.H, L.portrait);
      expect(L.enter, name).toEqual([[-1, 0], [-1, 0]]); // both sail in from the left
      if (L.portrait) {
        expect(L.frames, name).toEqual(base.frames);
        expect(L.plates, name).toEqual(base.plates);
        expect(L.hulls[1].y, name).toBeLessThan(L.hulls[0].y);
      } else {
        expect(L.hulls[1].y, name).toBeLessThanOrEqual(L.hulls[0].y); // the enemy's lane above, and ahead (right)
        expect(L.hulls[1].x, name).toBeGreaterThan(L.hulls[0].x);
        expect(L.frames.map((f) => [f.facing, f.dx]), name).toEqual(base.frames.map((f) => [f.facing, f.dx]));
        for (const p of L.plates) expect(p.y, name).toBeGreaterThanOrEqual(0);
        expect(L.bar.y + L.bar.h, name).toBeLessThanOrEqual(L.H);
      }
    }
  });

  it("the setting follows the day: days 1-3 CALM SEA, 4-7 STORM, 8-10 EMBER SEA", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(seaForDay)).toEqual(["calm", "calm", "calm", "storm", "storm", "storm", "storm", "ember", "ember", "ember"]);
  });

  it("the flag: without VITE_MOTION every option is off and the URL is ignored; with it, the dev knobs", () => {
    expect(MOTION_BUILD).toBe(false); // the suite runs the default build
    expect(MOTION).toEqual({ on: false, sway: 0, sea: null, perf: false });
    expect(parseMotionOpts("?motion=1&sway=3&sea=storm&perf=1", false)).toEqual({ on: false, sway: 0, sea: null, perf: false });
    expect(parseMotionOpts("", true)).toEqual({ on: true, sway: 0, sea: null, perf: false });
    expect(parseMotionOpts("?motion=0", true).on).toBe(false);
    expect(parseMotionOpts("?motion=1", true).on).toBe(true);
    expect(parseMotionOpts("?sway=9", true).sway).toBe(3);
    expect(parseMotionOpts("?sway=-9", true).sway).toBe(-3);
    expect(parseMotionOpts("?sway=x", true).sway).toBe(0);
    expect(parseMotionOpts("?sea=ember&perf=1", true)).toEqual({ on: true, sway: 0, sea: "ember", perf: true });
    expect(parseMotionOpts("?sea=lava", true).sea).toBe(null);
  });

  it("the display PRNG repeats per seed (stills and videos repeat)", () => {
    const a = displayRng(42), b = displayRng(42), c = displayRng(43);
    const xa = Array.from({ length: 8 }, a), xb = Array.from({ length: 8 }, b), xc = Array.from({ length: 8 }, c);
    expect(xa).toEqual(xb);
    expect(xa).not.toEqual(xc);
    for (const x of xa) expect(x >= 0 && x < 1).toBe(true);
  });

  it("the motion modules import nothing from src/sim except types, and use no Math.random", () => {
    const files = ["src/render/motion.ts", "src/render/backdrop.ts", "src/render/carrier.ts", "src/game/arenaMotion.ts"];
    for (const f of files) {
      const raw = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); // code only (the comments may name what they avoid)
      const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l) || /\bfrom\s+["']/.test(l));
      if (f === "src/render/motion.ts") expect(imports, f).toEqual([]); // the clock and the transforms import nothing at all
      else expect(imports.length, f).toBeGreaterThan(0);
      for (const l of imports) if (/\/sim\//.test(l)) expect(l, f).toMatch(/^\s*import type\b/);
      expect(src.includes("Math.random"), f).toBe(false);
      expect(/from "\.\.\/core\/rng"/.test(src), f).toBe(false); // not even the cosmetic noise: the display PRNG only
    }
  });
});
