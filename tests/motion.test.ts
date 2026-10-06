// MOTION-1 (REQ-BFG-071): the battles-in-motion prototype's display math (src/render/motion.ts) and lanes
// (src/game/battleLayout.ts laneLayout). Display only: none of this touches the sim.
// MOTION-2 (REQ-BFG-071): motion ships in every build. The dev knobs are a test build's only; REDUCED MOTION sails straight
// and leaves the battle's pace alone; the still screens (build, summary, hero preview) draw no bank or drift; the ship's
// longer bow and taller stern reach past the board (REVIEW-MOTION1 Q2).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BANK_MAX_DEG, MOTION, MOTION_KNOBS, MotionModel, REDUCED_SCROLL, SWAY_MAX_DEG, affineAngle, applyAffine, boardAffine,
  displayRng, invertAffine, motionDefaults, parseMotionOpts, seaForDay, stillSeaSeed, type Affine,
} from "../src/render/motion";
import { battleLayout, battleScale, laneLayout, minGap } from "../src/game/battleLayout";
import { computeView } from "../src/core/io";
import { PIVOT_X, PLATE_W, ROT_H, ROT_W, ROT_X, ROT_Y, SHIP_L, STERN_B, halfBeam } from "../src/render/carrier";
import { HULL_L, frameForHull, hullBox } from "../src/render/frame";
import { Arena } from "../src/game/arena";
import { ArenaMotion } from "../src/game/arenaMotion";
import { setReducedMotion } from "../src/core/settings";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { simulate } from "../src/sim/battle";

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

  it("MOTION-2: motion is the game; the player build ignores the knobs; a test build reads them", () => {
    // vitest is a dev build (import.meta.env.DEV), so the knobs exist here; a player build has neither DEV nor
    // VITE_MOTION_KNOBS=1, so MOTION_KNOBS is false there and MOTION is the defaults (the bundle grep is in the REPORT)
    expect(MOTION_KNOBS).toBe(true);
    expect(MOTION).toEqual({ on: true, sway: 0, sea: null, perf: false }); // no location in node: the defaults
    expect(motionDefaults()).toEqual({ on: true, sway: 0, sea: null, perf: false });
    for (const q of ["?motion=0&sway=3&sea=storm&perf=1", "?motion=0", "?sway=-3", "?sea=ember", "?perf=1", ""]) {
      expect(parseMotionOpts(q, false), q).toEqual(motionDefaults()); // the player build: the URL changes nothing
    }
    const src = readFileSync(new URL("../src/render/motion.ts", import.meta.url), "utf8");
    // the switch is the build's: vite's DEV (dev server, vitest) or VITE_MOTION_KNOBS=1, both replaced at build time
    expect(src).toMatch(/export const MOTION_KNOBS: boolean = import\.meta\.env\.DEV \|\| import\.meta\.env\.VITE_MOTION_KNOBS === "1";/);
    // the page's options call the parser only behind MOTION_KNOBS, so a player bundle drops it
    expect(src).toMatch(/export const MOTION: MotionOpts = MOTION_KNOBS && [^\n]*\? parseMotionOpts\(location\.search, true\) : motionDefaults\(\);/);
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

  it("MOTION-2: REDUCED MOTION leaves the battle's pace alone (the same frames to the end, the same result as simulate())", () => {
    const p = startingBuild("furnace", 1), e = warlordBuild("weaver", 3);
    const ref = simulate(p, e, 7);
    const runs: number[][] = [];
    for (const rm of [false, true]) {
      setReducedMotion(rm);
      const a = new Arena(p, e, 7, null);
      a.quiet = true;
      const m = new ArenaMotion(7, 5, motionDefaults(), rm);
      let frames = 0;
      while (!a.b.over && frames < 60 * 400) {
        m.update(1 / 60, rm); // the display clock, as the battle screen runs it (before the arena)
        a.update(1 / 60);
        frames++;
      }
      expect(a.b.over).toBe(true);
      expect([a.b.ticks, a.b.winner, a.b.sides[0].hull.hp, a.b.sides[1].hull.hp]).toEqual([ref.ticks, ref.winner, ref.sides[0].hull.hp, ref.sides[1].hull.hp]);
      expect(m.model.reduced).toBe(rm);
      expect(m.model.dist).toBeCloseTo(m.model.t * (rm ? REDUCED_SCROLL : 1), 6);
      runs.push([frames, a.b.ticks]);
    }
    setReducedMotion(false);
    expect(runs[1]).toEqual(runs[0]);
  });

  it("MOTION-2: a ship held still (the hero preview) has no bank, drift, surge, bob or sway, and still water", () => {
    const m = new MotionModel(stillSeaSeed(1), { sway: 3, held: true });
    m.setLanes({ portrait: true, gapRest: 102, gapMin: 72 });
    for (const t of TIMES) for (const s of [0, 1] as const) {
      const p = m.pose(s, t);
      expect([p.bank, p.x, p.y, p.bob, p.board, p.gimbal]).toEqual([0, 0, 0, 0, 0, 0]);
    }
    for (let i = 0; i < 120; i++) m.advance(1 / 60);
    expect(m.scrollFactor()).toBe(0);
    expect(m.dist).toBe(0);
    // the preview's arena: every frame the board map is the identity and the ship sits at the board's rest pivot
    const a = new Arena(startingBuild("weaver", 1), { ...startingBuild("furnace", 1), routes: [] }, 78, null);
    a.quiet = true;
    a.show = [true, false];
    const f0 = frameForHull(0, 20, 30);
    a.setFrames([f0, frameForHull(2, 20, -370)], [[0, 1], [0, -1]]);
    const am = new ArenaMotion(stillSeaSeed(1), 1, { ...motionDefaults(), sway: 3 }, false, true);
    const hb = hullBox(f0);
    for (let k = 0; k < 40; k++) {
      am.update(0.29, false);
      a.update(0.29);
      am.frame(a);
      expect([am.hitAff[0].a, am.hitAff[0].b, am.hitAff[0].c, am.hitAff[0].d, am.hitAff[0].e, am.hitAff[0].f]).toEqual([1, 0, 0, 1, 0, 0]);
      expect(am.bankDrawn).toEqual([0, 0]);
      expect([am.pivot[0][0] - a.fx.shakeX, am.pivot[0][1] - a.fx.shakeY]).toEqual([hb.x + hb.w / 2, hb.y + hb.h / 2]);
    }
  });

  it("MOTION-2: the still screens' carrier is drawn at heading 0 at the board's own rest place (no bank, no drift)", async () => {
    const { calls, restore } = fakeDom();
    try {
      const { drawStillCarrier, plateBox } = await import("../src/render/ship");
      const screen = fakeCtx(0, calls);
      for (const [facing, x, y] of [[0, 20, 30], [1, 64, 12], [0, 17, 211]] as const) {
        calls.length = 0;
        const f = frameForHull(facing, x, y);
        drawStillCarrier(screen as unknown as CanvasRenderingContext2D, "furnace", f);
        const hb = hullBox(f), px = hb.x + hb.w / 2, py = hb.y + hb.h / 2;
        // heading 0: no sprite is turned (pixel.ts rot90's lossless quarter turns aside)
        expect(calls.filter((c) => c[1] === "rotate" && Math.abs(Math.sin(2 * (c[2] as number))) > 1e-9), `facing ${facing}`).toEqual([]);
        const blits = calls.filter((c) => c[0] === 0 && c[1] === "drawImage").map((c) => [(c[2] as { width: number }).width, c[3], c[4]]);
        expect(blits, `facing ${facing}`).toContainEqual([ROT_W, px - ROT_X, py - ROT_Y]); // the ship, at the rest pivot
        const r = plateBox(screen as unknown as CanvasRenderingContext2D, f);
        expect(blits, `facing ${facing}`).toContainEqual([r.w, r.x, r.y]); // the board plate, over the deck frame
        expect(calls.filter((c) => c[0] === 0 && (c[1] === "setTransform" || c[1] === "translate")), `facing ${facing}`).toEqual([]);
      }
    } finally {
      restore();
    }
  });

  it("MOTION-2 (REVIEW-MOTION1 Q2): the longer bow and the taller stern reach past the board; the turned ship fits its canvas", () => {
    // portrait: a board plate is PLATE_W (130) across and HULL_L (140) along; the ship's pivot is the board's centre
    const bowPast = SHIP_L - PIVOT_X - PLATE_W / 2, sternPast = PIVOT_X - PLATE_W / 2;
    expect(bowPast).toBeGreaterThanOrEqual(31); // MOTION-1's bow showed 23 px
    expect(sternPast).toBeGreaterThanOrEqual(23);
    expect(halfBeam(0.5) * 2).toBeGreaterThan(HULL_L); // the stern stands taller than a portrait board ...
    expect(STERN_B).toBeGreaterThan(HULL_L);
    expect(halfBeam(PIVOT_X)).toBeLessThan(HULL_L / 2); // ... while the hull under the board stays inside it
    // every hull pixel, turned by up to 12 degrees about the pivot, lands inside the ROT_W x ROT_H canvas (4 px margin)
    for (const deg of [-12, -7, 0, 5, 12]) {
      const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      for (let x = 0; x < SHIP_L; x += 1) for (const side of [-1, 1]) {
        const h = halfBeam(x + 0.5);
        if (h < 0) continue;
        const u = x - PIVOT_X, v = side * h;
        const X = ROT_X + u * c + v * s, Y = ROT_Y - u * s + v * c;
        expect(X >= 3 && X <= ROT_W - 3 && Y >= 3 && Y <= ROT_H - 3, `${deg} deg at x ${x}`).toBe(true);
      }
    }
  });

  it("the motion modules import nothing from src/sim except types, and use no Math.random", () => {
    const files = ["src/render/motion.ts", "src/render/backdrop.ts", "src/render/carrier.ts", "src/render/ship.ts", "src/game/arenaMotion.ts"];
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

type Call = unknown[];

/** MOTION-2's still-carrier test: a recording 2D context. drawImage, rotate, setTransform and translate are recorded as
 *  [context id, method, ...args]; every other call is a no-op (node has no canvas). */
function fakeCtx(id: number, calls: Call[], canvas: object = { width: 0, height: 0 }): Record<string, unknown> {
  const rec = new Set(["drawImage", "rotate", "setTransform", "translate"]);
  const state: Record<string, unknown> = { canvas };
  return new Proxy(state, {
    get(t, k) {
      if (typeof k !== "string") return undefined;
      if (k in t) return t[k];
      if (k === "getImageData" || k === "createImageData") return (_x: number, _y: number, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
      if (k === "measureText") return () => ({ width: 0 });
      return (...args: unknown[]) => {
        if (rec.has(k)) calls.push([id, k, ...args]);
      };
    },
    set(t, k, v) {
      if (typeof k === "string") t[k] = v;
      return true;
    },
  });
}

/** A stand-in `document` whose canvases get recording contexts (ids from 1; the test's screen context is 0). */
function fakeDom(): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const g = globalThis as { document?: unknown };
  const prev = g.document;
  let n = 0;
  g.document = {
    createElement: () => {
      const c: Record<string, unknown> = { width: 0, height: 0 };
      const ctx = fakeCtx(++n, calls, c);
      c.getContext = () => ctx;
      return c;
    },
  };
  return { calls, restore: () => { g.document = prev; } };
}
