// POLISH-6 P6-2 (REQ-BFG-089; RULING-POLISH5 R2 WIDENED, RULING-REVIEW-POLISH5 N10 and N11): VIEW BATTLEFIELD's BACK and ON TO DAWN under an open face, at ALL 13 views of tests/polish4.helpers.ts VIEWS13,
// through BattleScreen.draw (never a hand-drawn bar: N11; the form of RV4's rv-snip-back.test.ts and tests/polish5.backhit.test.ts).
// For every part of both boards (day 8, seed 21): open its face, draw one frame, and sample the REPORTED rects of BACK (s.scoutRects.back) and ON TO DAWN (s.scoutRects.primary) at 0.5 CSS px:
//   - 0 points of either rect reach a face (the face is drawn after the bar, so its region wins a press where they meet);
//   - each drawn button (scoutRects.backBtn / primaryBtn) keeps its centre and its four corners (its own region wins there);
//   - the rects are the buttons' regions themselves (read at press time), and the next frame without the face has the whole rect back (nothing accumulates).
// At polish5-accepted the first line fails for ON TO DAWN at the five landscape phones (844x390@3 12,240 points, 812x375@3 11,424, 851x393@2.75 13,816, 915x412@2.625 12,716, 926x428@3 7,644: RV4 section 4 E5),
// and the bar reports no `primaryBtn` (the first test).
// env P6_VIEWHIT_LOG=1 prints one line per view (numbers for the REPORT). One `it` a view: each ~1-3 s alone; the suite's per-test time-out is 30 s (vite.config.ts testTimeout).
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { battleGrid, battleScale } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { BattleScreen } from "../src/screens/battle";
import { partsOnScreen } from "../src/screens/battleScout";
import { setupRun } from "../src/tooling";
import { UI, type Rect } from "../src/ui/ui";
import type { Game } from "../src/game/game";
import type { Run } from "../src/game/run";
import { VIEWS13, VIEW13_NAMES } from "./polish4.helpers";

installRaster();
const DT = 1 / 60;
const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function screen(w: number, h: number, dpr: number, day = 8, seed = 21) {
  const view = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const silent = new Proxy({}, { get: () => () => undefined });
  const game = { run: setupRun({ hero: "furnace", day, seed }) as Run, audio: silent, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: fresh(view.W, view.H) } as unknown as Game;
  (game as unknown as { go: (s: unknown) => void }).go = () => undefined;
  const s = new BattleScreen(game);
  for (let i = 0; i < 60 * 400 && s.phase !== "result"; i++) s.update(DT);
  expect(s.openView()).toBe(true);
  for (let i = 0; i < 90; i++) s.update(DT);
  s.motion.frame(s.arena);
  // the world layer needs a canvas the raster stub is not: left undrawn, and with it nothing the bar, the faces and their regions use
  const m = s.motion as unknown as { drawSea: () => void; draw: () => void };
  m.drawSea = () => undefined;
  m.draw = () => undefined;
  const frame = () => { game.ui.begin(); s.draw(G(fresh(view.W, view.H))); game.ui.end(); };
  return { s, game, frame, k: view.scale / view.dpr, view };
}
/** which region a press at each point of `r` (0.5 CSS px apart) reaches: id -> points */
function reach(game: Game, r: Rect, k: number): Record<string, number> {
  const out: Record<string, number> = {}, step = 0.5 / k;
  for (let y = r.y + step / 2; y < r.y + r.h; y += step) for (let x = r.x + step / 2; x < r.x + r.w; x += step) { const id = game.ui.hit(x, y)?.id ?? "nothing"; out[id] = (out[id] ?? 0) + 1; }
  return out;
}
const css = (n: number, k: number): string => (n * k).toFixed(1);

describe("POLISH-6 P6-2: the bar reports ON TO DAWN's drawn button beside its hit rect (trimHit's `keep`)", () => {
  it("scoutRects.primaryBtn is the drawn button, inside the hit rect, and its centre reaches viewnext (851x393@2.75)", () => {
    const { s, game, frame } = screen(851, 393, 2.75);
    frame();
    const hit = s.scoutRects.primary!, btn = s.scoutRects.primaryBtn;
    expect(btn, "the bar reports the drawn ON TO DAWN button").toBeTruthy();
    expect(btn!.x >= hit.x && btn!.y >= hit.y && btn!.x + btn!.w <= hit.x + hit.w && btn!.y + btn!.h <= hit.y + hit.h, "the drawn button lies inside its tap target").toBe(true);
    expect(game.ui.hit(btn!.x + btn!.w / 2, btn!.y + btn!.h / 2)?.id).toBe("viewnext");
  });
});

describe("POLISH-6 P6-2: BACK's and ON TO DAWN's reported rects under an open face, 13 views, through BattleScreen.draw", () => {
  for (const name of VIEW13_NAMES) {
    it(`${name}: 0 points of either reported rect reach a face; the drawn buttons keep their centres and corners`, () => {
      const [w, h, dpr] = VIEWS13[name];
      const { s, game, frame, k } = screen(w, h, dpr);
      frame();
      expect(s.scoutRects.back, `${name}: the bar draws BACK`).not.toBeNull();
      expect(s.scoutRects.primary, `${name}: the bar draws ON TO DAWN`).not.toBeNull();
      const wholeBack = { ...s.scoutRects.back! }, wholePrimary = { ...s.scoutRects.primary! };
      let faces = 0, backMeet = 0, primMeet = 0, backFace = 0, primFace = 0, backCut = 0, primCut = 0;
      let backStrip: [number, number] = [0, 0], primStrip: [number, number] = [0, 0];
      for (const side of [0, 1] as const) for (const p of partsOnScreen(s.arena, s.motion, side)) {
        s.faces.open = null;
        s.down(p.x, p.y);
        frame();
        const f = s.faces.last;
        if (!f) continue;
        faces++;
        for (const [id, rect, whole, btn] of [["viewback", s.scoutRects.back!, wholeBack, s.scoutRects.backBtn ?? null], ["viewnext", s.scoutRects.primary!, wholePrimary, s.scoutRects.primaryBtn ?? null]] as const) {
          const r = reach(game, rect, k);
          const bad = r["face"] ?? 0;
          if (id === "viewback") backFace += bad; else primFace += bad;
          if (meets(whole, f.r)) { if (id === "viewback") backMeet++; else primMeet++; }
          if (rect.w !== whole.w || rect.h !== whole.h || rect.x !== whole.x || rect.y !== whole.y) {
            // what the trim costs: the part cut off the rect that did NOT lie under the face (a press there reached the button before the face opened and reaches nothing now): P5-4's 32.7 x 10.9 CSS px at 851x393@2.75
            const ox = Math.max(0, Math.min(whole.x + whole.w, f.r.x + f.r.w) - Math.max(whole.x, f.r.x)), oy = Math.max(0, Math.min(whole.y + whole.h, f.r.y + f.r.h) - Math.max(whole.y, f.r.y));
            const cutH = whole.h - rect.h, cutW = whole.w - rect.w;
            const strip: [number, number] = cutH > 0 && cutW === 0 ? [(whole.w - ox) * k, cutH * k] : cutW > 0 && cutH === 0 ? [cutW * k, (whole.h - oy) * k] : [cutW * k, cutH * k];
            if (id === "viewback") { backCut++; if (strip[0] * strip[1] > backStrip[0] * backStrip[1]) backStrip = strip; }
            else { primCut++; if (strip[0] * strip[1] > primStrip[0] * primStrip[1]) primStrip = strip; }
          }
          expect.soft(bad, `${name} ${f.title}: ${id}'s reported rect: points that reach the face`).toBe(0); // soft: the log line below still prints at the base, where it is red
          expect.soft(meets(rect, f.r), `${name} ${f.title}: ${id}'s reported rect clears the face`).toBe(false);
          // the drawn button (when the tooling reports it: the first test asks that it does): its centre and its four corners reach its own region
          if (btn) for (const [x, y] of [[btn.x + btn.w / 2, btn.y + btn.h / 2], [btn.x, btn.y], [btn.x + btn.w - 0.01, btn.y], [btn.x, btn.y + btn.h - 0.01], [btn.x + btn.w - 0.01, btn.y + btn.h - 0.01]])
            expect(game.ui.hit(x, y)?.id, `${name} ${f.title}: the drawn ${id} button's point (${x.toFixed(1)}, ${y.toFixed(1)})`).toBe(id);
          // the rect the tooling reports is the button's region (read at press time)
          expect(game.ui.regions.find((q) => q.id === id)!.r, `${name}: ${id}'s region IS the reported rect`).toBe(rect);
        }
        // the face closed: both rects are whole again next frame (nothing accumulates)
        s.faces.open = null;
        frame();
        expect(s.scoutRects.back, `${name}: BACK whole again`).toEqual(wholeBack);
        expect(s.scoutRects.primary, `${name}: ON TO DAWN whole again`).toEqual(wholePrimary);
      }
      expect(faces, `${name}: faces opened (every part of both boards)`).toBeGreaterThan(0);
      if (process.env.P6_VIEWHIT_LOG) console.log(`P6VIEWHIT ${name}: ${faces} faces; BACK ${css(wholeBack.w, k)} x ${css(wholeBack.h, k)} CSS px: ${backMeet} faces meet it, trimmed on ${backCut}, the largest cost strip ${backStrip[0].toFixed(1)} x ${backStrip[1].toFixed(1)} CSS px, ${backFace} points reach a face; ON TO DAWN ${css(wholePrimary.w, k)} x ${css(wholePrimary.h, k)} CSS px: ${primMeet} faces meet it, trimmed on ${primCut}, the largest cost strip ${primStrip[0].toFixed(1)} x ${primStrip[1].toFixed(1)} CSS px, ${primFace} points reach a face`);
    });
  }
});
