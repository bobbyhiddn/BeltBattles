// PRESENT-1 (REQ-BFG-038; the presentation lane 51a13003): the title's attract fight, on every view of scripts/introcheck.mjs.
//   T1 TITLE-SURGE (REVIEW-CUSTOM3 ruling 4): CUSTOM-3 (ed0cbe9) capped the carriers' surge in a battle and in replays by passing
//      the whole layout to ArenaMotion.setLanes (battleLayout.ts laneSpec, as battle.ts:439 and replay.ts:171 do); the title passed its
//      gap alone (0.9.6's lanes), so on the desk and the laptop its landscape surge had no edge cap. Now the title's lanes ARE
//      laneSpec's for its own layout, on every view.
// (T2 and T3's rows are below T1's, in this file.)
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { computeView } from "../src/core/io";
import { laneSpec, minGap } from "../src/game/battleLayout";
import { DECK, TILE, TILES } from "../src/render/frame";
import { SURGE_LAND, SURGE_MAX } from "../src/render/motion";
import { TitleScreen } from "../src/screens/title";
import { titleScale, type TitleLayout } from "../src/screens/titleLayout";
import type { Game } from "../src/game/game";
import { UI } from "../src/ui/ui";

/** The views of scripts/introcheck.mjs (its VIEW table: size and device pixel ratio), and the desk and the laptop of CUSTOM-3's
 *  tests/surge.margin.test.ts (1920x1080, 1280x720: its surge shot check's views). */
const VIEWS: [string, number, number, number][] = [
  ["phone", 390, 844, 3], ["safari", 390, 660, 3], ["land", 844, 390, 3], ["desk", 1440, 900, 1], ["desk2", 1440, 900, 2], ["small", 360, 640, 2],
  ["desk-1920", 1920, 1080, 1], ["laptop", 1280, 720, 1],
];

beforeAll(() => {
  // no stored run, no profile: the title reads localStorage when it opens (loadRun)
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0, clear: () => undefined });
});
afterAll(() => vi.unstubAllGlobals());

/** A title on a CSS viewport as the game sizes it (TitleScreen.pickScale through computeView), with a saved run or none. */
function titleOn(w: number, h: number, dpr: number, save: boolean) {
  const view = computeView(w, h, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
  const audio = new Proxy({}, { get: () => () => undefined });
  const game = { run: null, audio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), toast() {}, go() {}, error() {}, soundButton() {}, openName() {}, transitioning: false } as unknown as Game;
  const s = new TitleScreen(game);
  s.pickScale(Math.floor(w * dpr), Math.floor(h * dpr), view.portrait);
  const priv = s as unknown as { save: unknown; place(): void; L: TitleLayout };
  priv.save = save ? {} : null; // CONTINUE shows (the panel is taller); the layout's key reads it
  priv.place();
  return { s, view, L: priv.L };
}

describe("PRESENT-1 T1 TITLE-SURGE: the title's lanes are laneSpec's for the title's layout", () => {
  for (const [name, w, h, dpr] of VIEWS) {
    for (const save of [false, true]) {
      it(`${name} ${w}x${h} @${dpr}, ${save ? "with a saved run" : "no saved run"}: setLanes got laneSpec(L, minGap), edge included`, () => {
        const { s, view, L } = titleOn(w, h, dpr, save);
        const gapMin = minGap(view.portrait ? view.H : view.W);
        const want = laneSpec({ portrait: view.portrait, gap: L.gap, W: view.W, frames: L.frames }, gapMin);
        expect(s.motion.model.spec).toEqual(want);
        if (view.portrait) {
          // portrait carries no edge: 0.9.6's lanes exactly (the title's call before this job)
          expect(want).toEqual({ portrait: true, gapRest: L.gap, gapMin });
          expect(s.motion.model.spec).toEqual({ portrait: true, gapRest: L.gap, gapMin });
        } else {
          // landscape: the outer tile columns' margin at rest (CUSTOM-3), where the title's call had none (0.9.6's lanes)
          expect(want.edge).toBe(Math.min(L.frames[0].dx, view.W - (L.frames[1].dx + DECK)));
          expect(s.motion.model.spec.edge).toBe(want.edge);
          expect(s.motion.model.spec).toEqual({ ...{ portrait: false, gapRest: L.gap, gapMin }, edge: want.edge });
        }
      });

      it(`${name} ${w}x${h} @${dpr}, ${save ? "with a saved run" : "no saved run"}: at every surge phase every tile column of both boards is on screen`, () => {
        const { s, view, L } = titleOn(w, h, dpr, save);
        if (view.portrait) return; // portrait: the drift and surge are 0.9.6's (tests/surge.margin.test.ts); no side edge
        const m = s.motion.model;
        let spill = 0, minP = 0, maxE = 0;
        for (let i = 0; i <= 120 * 60; i++) {
          const t = i / 60;
          const [pdx] = m.offset(0, t), [edx] = m.offset(1, t);
          minP = Math.min(minP, pdx);
          maxE = Math.max(maxE, edx);
          for (let c = 0; c < TILES; c++) {
            const p0 = L.frames[0].dx + c * TILE + pdx, e0 = L.frames[1].dx + c * TILE + edx;
            spill = Math.max(spill, -p0, p0 + TILE - view.W, -e0, e0 + TILE - view.W);
          }
        }
        expect(spill, `${name}: px of a tile column past a side edge`).toBeLessThanOrEqual(0);
        // the surge still moves the boards: to the least of SURGE_LAND, the spare floor and the margin, both ways
        const spec = m.spec;
        const reach = Math.min(SURGE_LAND, Math.max(0, Math.floor((spec.gapRest - spec.gapMin) / 2)), Math.max(0, Math.floor(spec.edge ?? SURGE_LAND)));
        expect(minP, name).toBe(-reach);
        expect(maxE, name).toBe(reach);
        expect(reach).toBeGreaterThan(0);
        expect(SURGE_MAX).toBeLessThanOrEqual(SURGE_LAND); // (the portrait surge is the smaller of the two)
      });
    }
  }
});
