// PAIR-CUE fix 1 (REQ-BFG-100; REVIEW-COUNT1 ruling 3: hit numbers stay on top): the board counters (C5, C6) draw under
// every number (hits, BURN ticks, heals, BLOCKED, PAIR's pops, the wind's numbers), so a fresh number is always whole; they
// still draw after the world and the dark wind, and still keep clear of this frame's wind numbers. Tests only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { battleGrid, battleLayout, battleScale, cameraFocus, laneLayout, minGap } from "../src/game/battleLayout";
import { ArenaMotion } from "../src/game/arenaMotion";
import { Arena } from "../src/game/arena";
import { viewWithSub } from "../src/game/viewGrid";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { C } from "../src/render/palette";
import { rect } from "../src/render/pixel";
import { fakeCanvas, fakeDom, paints, type FakeCanvas, type Img, type Op } from "./pair1.helpers";

const ROOT = join(new URL("..", import.meta.url).pathname);
const HIT = ["#A1B2C3", "#B2C3D4", "#C3D4E5"];
const BOX = "#0F1E2D"; // the stand-in board counter's fill

let restore: () => void = () => undefined;
beforeAll(() => { restore = fakeDom(); });
afterAll(() => restore());

/** WIND-2's windy arena (tests/wind2.test.ts): a storm at full strength, three hit numbers and a wind number on each hull. */
function windyArena(w: number, h: number, dpr: number, shot: "wide" | "close") {
  const pick = (pw: number, ph: number, p: boolean, scale: number) => { const gr = battleGrid(pw, ph, p); return gr.close === scale ? gr.sub : 1; };
  const v = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pick);
  const grid = battleGrid(Math.floor(w * dpr), Math.floor(h * dpr), v.portrait);
  const L = laneLayout(battleLayout(v.W, v.H, v.portrait));
  const a = new Arena(startingBuild("furnace", 1), warlordBuild("weaver", 3), 7, null);
  a.quiet = true;
  a.setFrames(L.frames, L.enter);
  (a.b as unknown as { windLevel: () => number }).windLevel = () => 1;
  const am = new ArenaMotion(7, "calm", { sway: 0, sea: null, perf: false }, false);
  am.setLanes(L, minGap(v.portrait ? v.H : v.W));
  am.useCamera(grid, cameraFocus(L), shot);
  [0, 1, -1].forEach((s, i) => {
    a.fx.anchor = s;
    a.fx.popup(L.hulls[Math.max(0, s)].x + 30, L.hulls[Math.max(0, s)].y + 30, "40", HIT[i]);
  });
  for (const s of [0, 1]) {
    a.fx.anchor = s;
    a.fx.windPop(L.hulls[s].x + 70, L.hulls[s].y + 70, "90", C.windHit);
  }
  a.fx.anchor = -1;
  for (let i = 0; i < a.fx.popCount; i++) a.fx.popList[i].t = 0.3;
  return { v, L, a, am };
}

describe("PAIR-CUE fix 1: hit numbers stay on top of the board counters", () => {
  it("ArenaMotion draws underNumbers after the world and the whole storm, before every number and the wind's numbers", () => {
    for (const [w, h, dpr] of [[1920, 1080, 1], [402, 690, 3], [844, 390, 3]]) for (const shot of ["wide", "close"] as const) {
      const { v, a, am } = windyArena(w, h, dpr, shot);
      let windSeen = -1;
      am.underNumbers = (g) => { windSeen = am.windDrawn.length; rect(g, 3, 3, 9, 9, BOX); };
      const screen = fakeCanvas();
      am.drawSea(screen.getContext(), v.W, v.H, 0, 0, v.scale, v.dpr, 7, a);
      am.draw(screen.getContext(), a, v.W, v.H, false);
      const name = `${w}x${h} ${shot}`, ops: Op[] = screen.ops;
      const layer = (am as unknown as { layer: FakeCanvas }).layer;
      const at = (pred: (o: Op) => boolean) => ops.map((o, i) => (pred(o) ? i : -1)).filter((i) => i >= 0);
      const blit = at((o) => o.op === "img" && o.d.img === layer);
      const storm = at((o) => (o.op === "fill" && [C.plum0, C.plum3, C.plum4].includes(o.f.fill)) || (o.op === "img" && (paints(o.d, C.plum1) || paints(o.d, C.plum2))));
      const box = at((o) => o.op === "fill" && o.f.fill === BOX);
      const pops = at((o) => o.op === "img" && HIT.some((c) => paints((o as { d: Img }).d, c)));
      const wind = at((o) => o.op === "img" && paints(o.d, C.windHit));
      expect(box.length, name).toBe(1);
      expect(pops.length, name).toBeGreaterThanOrEqual(6);
      expect(wind.length, name).toBeGreaterThanOrEqual(4);
      expect(box[0], `${name}: the counters over the world`).toBeGreaterThan(blit[0]);
      expect(box[0], `${name}: and over the whole storm`).toBeGreaterThan(Math.max(...storm));
      expect(box[0], `${name}: every hit number over them`).toBeLessThan(Math.min(...pops));
      expect(box[0], `${name}: the wind's numbers over them`).toBeLessThan(Math.min(...wind));
      expect(windSeen, `${name}: this frame's wind numbers placed before the counters draw (they keep clear of them)`).toBe(2);
      expect(am.windDrawn.length, name).toBe(2);
    }
  });

  it("the battle and the replay draw their board counters through underNumbers (inside the motion's draw), not after it", () => {
    for (const f of ["src/screens/battle.ts", "src/screens/replay.ts"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src, f).toMatch(/this\.motion\.underNumbers = \(g\) => this\.drawBoardCounters\(g\);/);
      const calls = src.split("\n").filter((l) => /counters\.drawBoard\(/.test(l));
      expect(calls.length, `${f}: one drawBoard call`).toBe(1);
      const body = src.slice(src.indexOf("private drawBoardCounters("), src.indexOf("private drawBoardCounters(") + 900);
      expect(body, `${f}: it is drawBoardCounters'`).toMatch(/counters\.drawBoard\(/);
      // the frame's counter groups start before the motion draws (the board's groups are added inside it)
      const draw = src.slice(src.indexOf("  draw(g: G): void {"));
      expect(draw.indexOf("this.counters.begin()"), f).toBeGreaterThan(0);
      expect(draw.indexOf("this.counters.begin()"), f).toBeLessThan(draw.indexOf("m.draw(g, a, W, H"));
    }
  });
});
