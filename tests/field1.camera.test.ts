// FIELD-1 (REQ-BFG-075): the battle camera (src/render/camera.ts, game/arenaMotion.ts). Two shots: CLOSE (today's
// framing) and WIDE (the fight, zoomed out); each at rest draws an art pixel as a whole number of device pixels, on the
// battle's finer canvas grid (game/viewGrid.ts GameView.sub), and the HUD keeps today's size. Taps hit-test through the camera's
// inverse at both shots, mid-move and at every motion phase. WIDE's targets: phone portrait 390x844, the two hulls span
// at most 75% of the width at every motion phase with the setting on both sides, above the enemy lane and below yours;
// desk and laptop about 70%, every tile column on screen at every surge phase.
import { describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleLayout, battleScale, cameraFocus, hullSpan, laneLayout, laneSpec, minGap } from "../src/game/battleLayout";
import { Camera, WIDE_SHARE, cameraGrid, ease, wideScale } from "../src/render/camera";
import { BANK_MAX_DEG, MotionModel, applyAffine, type Affine } from "../src/render/motion";
import { PIVOT_X, SHIP_L, STERN_B, halfBeam } from "../src/render/carrier";
import { DECK, TILE, TILES, hullBox } from "../src/render/frame";
import { Arena } from "../src/game/arena";
import { ArenaMotion } from "../src/game/arenaMotion";
import { startingBuild, warlordBuild } from "../src/sim/ai";

const pickSub = (pw: number, ph: number, p: boolean, scale: number) => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };

/** The battle on a viewport as BattleScreen lays it out: its view (with the camera's grid), lanes and camera. */
function battle(w: number, h: number, dpr: number) {
  const v = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const v0 = computeView(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p));
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
  const grid = battleGrid(pw, ph, v.portrait);
  const L = laneLayout(battleLayout(v.W, v.H, v.portrait));
  const spec = laneSpec(L, minGap(v.portrait ? v.H : v.W));
  const cam = new Camera(grid, "wide");
  cam.focus = cameraFocus(L);
  return { v, v0, grid, L, spec, cam };
}

/** The outline of a ship turned `deg` whole degrees about its pivot: its x and y reach (rest px), the bow wave's 3 px in. */
function reach(deg: number): { x0: number; x1: number; y0: number; y1: number } {
  const r = (-deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let x = 0; x <= SHIP_L + 3; x++) {
    const hb = x <= SHIP_L ? halfBeam(Math.min(SHIP_L, x)) + (x > SHIP_L - 66 ? 3 : 0) : 0;
    for (const y of [-hb, hb]) {
      const u = x - PIVOT_X, X = u * c - y * s, Y = u * s + y * c;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
    }
  }
  return { x0, x1, y0, y1 };
}
const REACH = new Map<number, ReturnType<typeof reach>>();
for (let d = -BANK_MAX_DEG; d <= BANK_MAX_DEG; d++) REACH.set(d, reach(d));

/** Two minutes of every motion phase at 60 fps for several seeds: the two hulls' screen box through the camera (logical
 *  px), the widest span, and the worst tile-column spill past the sides. */
function sweep(b: ReturnType<typeof battle>, seeds: number[]) {
  const S: Affine = b.cam.screenAffine();
  let span = 0, left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, spill = -Infinity;
  for (const seed of seeds) {
    const m = new MotionModel(seed);
    m.setLanes(b.spec);
    for (let i = 0; i <= 120 * 60; i += 2) {
      const t = i / 60;
      let l = Infinity, r = -Infinity;
      for (const s of [0, 1] as const) {
        const hb = b.L.hulls[s], [dx, dy] = m.offset(s, t), deg = Math.max(-BANK_MAX_DEG, Math.min(BANK_MAX_DEG, Math.round(m.pose(s, t).bank)));
        const q = REACH.get(deg)!, px = hb.x + hb.w / 2 + dx, py = hb.y + hb.h / 2 + dy;
        const x0 = S.a * (px + q.x0) + S.e, x1 = S.a * (px + q.x1) + S.e;
        l = Math.min(l, x0); r = Math.max(r, x1);
        top = Math.min(top, S.d * (py + q.y0) + S.f);
        bottom = Math.max(bottom, S.d * (py + q.y1) + S.f);
        if (!b.v.portrait) {
          // every tile column of this board on screen (landscape: the columns run along x)
          for (let c = 0; c < TILES; c++) {
            const c0 = S.a * (b.L.frames[s].dx + c * TILE + dx) + S.e, c1 = S.a * (b.L.frames[s].dx + (c + 1) * TILE + dx) + S.e;
            spill = Math.max(spill, -c0, c1 - b.v.W);
          }
        }
      }
      span = Math.max(span, r - l);
      left = Math.min(left, l);
      right = Math.max(right, r);
    }
  }
  return { span, share: span / b.v.W, left, right, top, bottom, spill };
}

const SEEDS = [1, 7, 12345, 0x2f6b9a1d, 99991];
const VIEWS: [string, number, number, number][] = [
  ["phone 390x844@3", 390, 844, 3], ["phone 360x640@2", 360, 640, 2], ["phone 375x667@2", 375, 667, 2], ["phone 390x660@3", 390, 660, 3],
  ["phone 430x932@3", 430, 932, 3], ["phone-land 844x390@3", 844, 390, 3], ["laptop 1366x768@1", 1366, 768, 1], ["laptop 1280x720@1", 1280, 720, 1],
  ["desk 1920x1080@1", 1920, 1080, 1],
];

describe("FIELD-1 the battle camera (REQ-BFG-075)", () => {
  it("the shots on each view: CLOSE is today's scale, WIDE a whole device-pixel scale; both whole on the canvas grid; the HUD keeps today's size", () => {
    const rows: string[] = [];
    for (const [name, w, h, dpr] of VIEWS) {
      const b = battle(w, h, dpr), g = b.grid;
      expect(g.close, name).toBe(b.v0.scale); // CLOSE = today's framing
      expect(g.wide, name).toBeLessThanOrEqual(g.close);
      expect(Number.isInteger(g.wide) && g.wide >= 1, name).toBe(true);
      // both shots' art pixels are whole canvas px (each `unit` device px), and the HUD's logical px are today's size
      expect(g.close % g.unit, name).toBe(0);
      expect(g.wide % g.unit, name).toBe(0);
      expect(g.sub * g.unit, name).toBe(b.v0.scale);
      expect([b.v.W, b.v.H, b.v.scale, b.v.portrait], name).toEqual([b.v0.W, b.v0.H, b.v0.scale, b.v0.portrait]);
      expect(b.v.sub ?? 1, name).toBe(g.sub);
      // at rest, WIDE's layer map is one layer px per art px at a whole-px offset, so is CLOSE's
      for (const shot of ["wide", "close"] as const) {
        b.cam.easeTo(shot, 0);
        const f = b.cam.layerF(), A = b.cam.layerAffine(f);
        expect([A.a, A.d], `${name} ${shot}`).toEqual([1, 1]);
        expect(Number.isInteger(A.e) && Number.isInteger(A.f), `${name} ${shot}`).toBe(true);
        expect(Number.isInteger(f), `${name} ${shot}`).toBe(true);
        expect(f * g.unit, `${name} ${shot}: device px per art px`).toBe(shot === "wide" ? g.wide : g.close);
      }
      const sp = hullSpan(b.L, minGap(b.v.portrait ? b.v.H : b.v.W));
      rows.push(`${name}: close x${g.close} (tile ${(TILE * g.close) / dpr} CSS px) -> wide x${g.wide} (tile ${(TILE * g.wide) / dpr} CSS px), unit ${g.unit}, sub ${g.sub}; reach ${sp.x1 - sp.x0} px = ${((100 * (sp.x1 - sp.x0) * g.close) / (w * dpr)).toFixed(1)}% of the width at close, ${((100 * (sp.x1 - sp.x0) * g.wide) / (w * dpr)).toFixed(1)}% at wide`);
    }
    console.log(rows.join("\n"));
  });

  it("the named targets: phone 390x844 x6 -> x4; desk 1920x1080 x5 -> x3; laptop 1366x768 x4 -> x2", () => {
    expect(battleGrid(1170, 2532, true)).toEqual({ close: 6, wide: 4, unit: 2, sub: 3 });
    expect(battleGrid(1920, 1080, false)).toEqual({ close: 5, wide: 3, unit: 1, sub: 5 });
    expect(battleGrid(1366, 768, false)).toEqual({ close: 4, wide: 2, unit: 2, sub: 2 });
    expect(wideScale(1000, 6, 100)).toBe(6); // already wide enough: WIDE is CLOSE
    expect(wideScale(100, 6, 1000)).toBe(3); // never below half of CLOSE
    expect(wideScale(100, 1, 1000)).toBe(1);
    expect(battleGrid(1280, 720, false)).toEqual({ close: 3, wide: 2, unit: 1, sub: 3 });
    expect(cameraGrid(6, 6)).toEqual({ close: 6, wide: 6, unit: 6, sub: 1 });
  });

  it("phone portrait 390x844 at WIDE: at every motion phase the two hulls span at most 75% of the width, the setting on both sides, above the enemy lane and below yours", () => {
    const b = battle(390, 844, 3);
    const r = sweep(b, SEEDS);
    console.log(`390x844 WIDE: widest span ${r.span.toFixed(1)} of ${b.v.W} logical px (${(100 * r.share).toFixed(1)}%), left ${r.left.toFixed(1)}, right ${r.right.toFixed(1)}, top ${r.top.toFixed(1)} (the enemy plate ends at ${b.L.plates[1].y + b.L.plates[1].h}), bottom ${r.bottom.toFixed(1)} (your plate starts at ${b.L.plates[0].y})`);
    expect(r.share).toBeLessThanOrEqual(WIDE_SHARE);
    expect(r.left).toBeGreaterThan(8);
    expect(r.right).toBeLessThan(b.v.W - 8);
    expect(r.top).toBeGreaterThan(b.L.plates[1].y + b.L.plates[1].h + 8); // the setting shows above the enemy lane
    expect(r.bottom).toBeLessThan(b.L.plates[0].y - 8); // and below yours
    // today's framing for comparison: the hulls fill the width
    b.cam.easeTo("close", 0);
    expect(sweep(b, [1]).share).toBeGreaterThan(0.95);
  });

  it("desk 1920x1080 and laptop 1366x768 at WIDE: about 70% of the width, every tile column on screen at every surge phase (CUSTOM-3's sweep at WIDE)", () => {
    // (1280x720 isn't a named target: WIDE stops at half of CLOSE there, x2 of x3, about 78%)
    for (const [name, w, h, lo, hi] of [["desk", 1920, 1080, 0.6, 0.75], ["laptop", 1366, 768, 0.5, 0.75], ["laptop-1280", 1280, 720, 0.5, 0.8], ["phone-land", 844, 390, 0.5, 0.75]] as const) {
      const dpr = name === "phone-land" ? 3 : 1;
      const b = battle(w, h, dpr);
      expect(b.v.portrait).toBe(false);
      const r = sweep(b, SEEDS);
      console.log(`${name} ${w}x${h} WIDE (x${b.grid.wide} of x${b.grid.close}): widest span ${(100 * r.share).toFixed(1)}% of the width; hulls ${r.left.toFixed(1)}..${r.right.toFixed(1)} of ${b.v.W}; worst tile-column spill ${r.spill.toFixed(1)} px`);
      expect(r.share, name).toBeGreaterThanOrEqual(lo);
      expect(r.share, name).toBeLessThanOrEqual(hi);
      expect(r.spill, `${name}: px of a tile column past a side edge`).toBeLessThanOrEqual(0);
      expect(r.left, name).toBeGreaterThan(0);
      expect(r.right, name).toBeLessThan(b.v.W);
    }
  });

  it("the eased move between shots: smooth (smoothstep), monotonic, at rest at the end; a cut at 0 s", () => {
    expect([ease(0), ease(0.5), ease(1), ease(-1), ease(2)]).toEqual([0, 0.5, 1, 0, 1]);
    const c = new Camera(battleGrid(1170, 2532, true), "wide");
    expect(c.zoom).toBeCloseTo(4 / 6, 12);
    c.easeTo("close", 0.6);
    expect(c.moving).toBe(true);
    let last = c.zoom;
    for (let i = 0; i < 36; i++) {
      c.update(1 / 60);
      expect(c.zoom).toBeGreaterThanOrEqual(last - 1e-12);
      last = c.zoom;
    }
    expect(c.moving).toBe(false);
    expect(c.zoom).toBe(1);
    expect(c.shot).toBe("close");
    expect(c.layerF()).toBe(3); // CLOSE at rest: the layer is today's canvas (sub 3 canvas px per art px)
    c.easeTo("wide", 0);
    expect([c.moving, c.zoom, c.layerF()]).toEqual([false, 4 / 6, 2]);
  });

  it("taps hit-test through the camera's inverse: every tile's centre maps back to its tile at both shots, mid-move and at every motion phase", () => {
    for (const [name, w, h, dpr] of [["phone", 390, 844, 3], ["desk", 1920, 1080, 1], ["laptop", 1366, 768, 1]] as const) {
      const b = battle(w, h, dpr);
      const a = new Arena(startingBuild("furnace", 1), warlordBuild("weaver", 3), 7, null);
      a.quiet = true;
      a.setFrames(b.L.frames, b.L.enter);
      const am = new ArenaMotion(7, "desert", { sway: 0, sea: null, perf: false }, false);
      am.setLanes(b.L, minGap(b.v.portrait ? b.v.H : b.v.W));
      const cam = am.useCamera(b.grid, cameraFocus(b.L));
      let n = 0;
      for (const [shot, secs, at] of [["wide", 0, 0], ["close", 0, 0], ["wide", 0.8, 0.3], ["close", 0.8, 0.5]] as const) {
        cam.easeTo(shot, secs);
        if (at) cam.update(at);
        for (let i = 0; i < 40; i++) {
          am.model.t = i * 1.37;
          am.frame(a);
          for (const s of [0, 1] as const) {
            for (const [cx, cy] of [[0, 0], [9, 9], [4, 5], [7, 2], [2, 7]]) {
              const [x, y] = am.tileCentre(a, s, cx, cy);
              expect(am.hit(a, x, y), `${name} ${shot} t ${am.model.t}`).toEqual({ side: s, cx, cy });
              n++;
            }
          }
        }
      }
      expect(n).toBe(4 * 40 * 2 * 5);
      // at WIDE a tile is smaller on screen by the zoom; at CLOSE it is today's
      cam.easeTo("wide", 0);
      am.frame(a);
      const p0 = am.tileCentre(a, 0, 4, 4), p1 = am.tileCentre(a, 0, 5, 4);
      expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), name).toBeCloseTo((TILE * b.grid.wide) / b.grid.close, 6);
    }
  });

  it("without a camera (the title, the hero preview) the arena keeps today's framing: the screen point is the rest point", () => {
    const am = new ArenaMotion(7, 5, { sway: 0, sea: null, perf: false }, false);
    expect(am.camera).toBe(null);
    expect(am.toRest(12.5, 40, [0, 0])).toEqual([12.5, 40]);
    expect(am.kind).toBe("storm"); // a day: the day's sea (seaForDay), as the hero preview asks for it
    const f = { facing: 0 as const, dx: 30, dy: 40 };
    expect(hullBox(f).w).toBe(DECK + 36);
    expect(STERN_B).toBe(152);
    // the camera's screen map at WIDE scales about the focus and keeps it in place
    const b = battle(390, 844, 3), S = b.cam.screenAffine(), q = applyAffine(S, b.cam.focus[0], b.cam.focus[1], [0, 0]);
    expect(Math.abs(q[0] - b.cam.focus[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(q[1] - b.cam.focus[1])).toBeLessThanOrEqual(1);
  });
});
