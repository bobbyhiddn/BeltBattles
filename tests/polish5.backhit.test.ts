// POLISH-5 (REQ-BFG-089; P5-4): BACK'S HIT RECT UNDER AN OPEN FACE.
//   At 851x393@2.75 (the game is 390 x 180 logical px at x6, 2.18 CSS px a logical px) VIEW BATTLEFIELD's BACK has a tap target of 59 x 46 CSS px, grown by tapRect past the 27 x 12 button, 11 px above the bar. An open face is drawn AFTER the bar, so its
//   region wins a press where it lies over that target: 26 x 11 CSS px of it lay under the face's foot (REVIEW-POLISH4 N8): of the target's points 1,166 of 10,856 reached the face. The rect the tooling reports (bb.scout().back) said otherwise.
//   Now BattleScreen.draw trims the rect (battleScout.ts trimHit) where a face lies over it: the rect reported is what a press reaches. The drawn button and its centre are untouched and no face moves.
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { battleLayout, battleGrid, battleScale, laneLayout } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { BattleScreen } from "../src/screens/battle";
import { partsOnScreen, trimHit } from "../src/screens/battleScout";
import { setupRun } from "../src/tooling";
import { UI, inside, type Rect } from "../src/ui/ui";
import type { Game } from "../src/game/game";
import type { Run } from "../src/game/run";

installRaster();
const DT = 1 / 60;
const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("POLISH-5 P5-4: trimHit", () => {
  const keep: Rect = { x: 127, y: 167, w: 27, h: 12 }, face: Rect = { x: 142, y: 2, w: 106, h: 162 };
  it("the 851x393@2.75 case: the face's foot over the top of BACK's rect cuts the top 5 px (10.9 CSS px) off; the button is whole inside", () => {
    const hit: Rect = { x: 127, y: 159, w: 27, h: 21 };
    expect(trimHit(hit, face, keep)).toBe(true);
    expect(hit).toEqual({ x: 127, y: 164, w: 27, h: 16 });
    expect(meets(hit, face)).toBe(false);
    expect(hit.x <= keep.x && hit.y <= keep.y && hit.x + hit.w >= keep.x + keep.w && hit.y + hit.h >= keep.y + keep.h).toBe(true);
  });
  it("no face, no overlap, or no cut that keeps the button: the rect is as it was", () => {
    const a: Rect = { x: 127, y: 159, w: 27, h: 21 };
    expect(trimHit(a, null, keep)).toBe(false);
    expect(trimHit(a, { x: 200, y: 2, w: 50, h: 162 }, keep)).toBe(false);
    expect(a).toEqual({ x: 127, y: 159, w: 27, h: 21 });
    expect(trimHit(a, { x: 130, y: 100, w: 10, h: 80 }, keep), "a face over the button itself: no cut holds it").toBe(false);
    expect(a).toEqual({ x: 127, y: 159, w: 27, h: 21 });
  });
  it("of two cuts that clear the face and hold the button it keeps the larger", () => {
    const hit: Rect = { x: 100, y: 100, w: 60, h: 60 }, btn: Rect = { x: 120, y: 130, w: 30, h: 12 };
    const over: Rect = { x: 150, y: 90, w: 40, h: 25 }; // overlaps the top right corner: cut the top (60 x 45 left) or the right (50 x 60 left)
    expect(trimHit(hit, over, btn)).toBe(true);
    expect(hit).toEqual({ x: 100, y: 100, w: 50, h: 60 });
  });
});

describe("POLISH-5 P5-4: the real VIEW BATTLEFIELD at 851x393@2.75", () => {
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
    // the world layer (the sea, the carriers, the shots) needs a canvas the raster stub is not: it is left undrawn, and with it nothing the bar, the faces and their regions use
    const m = s.motion as unknown as { drawSea: () => void; draw: () => void };
    m.drawSea = () => undefined;
    m.draw = () => undefined;
    /** one frame as Game.render draws it: the UI's regions are laid by the screen's own draw */
    const frame = () => { game.ui.begin(); s.draw(G(fresh(view.W, view.H))); game.ui.end(); };
    const L = laneLayout(battleLayout(view.W, view.H, view.portrait)), k = view.scale / view.dpr;
    return { s, game, frame, L, k, view };
  }
  const reach = (game: Game, r: Rect, k: number): Record<string, number> => {
    const out: Record<string, number> = {}, step = 0.5 / k;
    for (let y = r.y + step / 2; y < r.y + r.h; y += step) for (let x = r.x + step / 2; x < r.x + r.w; x += step) { const id = game.ui.hit(x, y)?.id ?? "nothing"; out[id] = (out[id] ?? 0) + 1; }
    return out;
  };

  it("no face: BACK's rect is 59 x 46 CSS px and every point of it reaches viewback; with a face open the rect the tooling reports is what a press reaches (4 of the 20 faces meet it)", () => {
    const { s, game, frame, k } = screen(851, 393, 2.75);
    frame();
    const whole = { ...s.scoutRects.back! };
    expect([whole.w * k, whole.h * k].map((n) => Math.round(n * 10) / 10)).toEqual([58.9, 45.8]);
    expect(Object.keys(reach(game, whole, k))).toEqual(["viewback"]);
    let faces = 0, meeting = 0, cost = 0;
    for (const side of [0, 1] as const) for (const p of partsOnScreen(s.arena, s.motion, side)) {
      s.faces.open = null;
      s.down(p.x, p.y);
      frame();
      const f = s.faces.last;
      if (!f) continue;
      faces++;
      const back = s.scoutRects.back!, region = game.ui.regions.find((q) => q.id === "viewback")!;
      expect(region.r, "the tooling's rect is the button's region").toBe(back);
      const r = reach(game, back, k);
      expect(Object.keys(r), `${f.title}: every point of the reported rect reaches BACK`).toEqual(["viewback"]);
      expect(meets(back, f.r), `${f.title}: the rect clears the face`).toBe(false);
      if (meets(whole, f.r)) expect(f.r, `${f.title}: no face moves (the four that reach the foot are 106 x 162 at x 142)`).toEqual({ x: 142, y: 2, w: 106, h: 162 });
      const btn = s.scoutRects.backBtn!;
      expect(game.ui.hit(btn.x + btn.w / 2, btn.y + btn.h / 2)?.id, "the drawn button's centre reaches BACK").toBe("viewback");
      for (const [x, y] of [[btn.x, btn.y], [btn.x + btn.w - 0.01, btn.y], [btn.x, btn.y + btn.h - 0.01], [btn.x + btn.w - 0.01, btn.y + btn.h - 0.01]]) expect(game.ui.hit(x, y)?.id, "the drawn button's corners reach BACK").toBe("viewback");
      if (!(back.h === whole.h)) {
        meeting++;
        expect(back).toEqual({ x: 127, y: 164, w: 27, h: 16 });
        // what the trim costs: the strip over the button (left of the face's foot, 3-11 px above the bar) that reached BACK before and now reaches nothing
        cost = (back.y - whole.y) * whole.w * k * k;
      }
      // the face closed: the rect is whole again next frame (nothing accumulates)
      s.faces.open = null;
      frame();
      expect(s.scoutRects.back).toEqual(whole);
    }
    expect([faces, meeting]).toEqual([20, 4]);
    expect(Math.round(cost), "CSS px squared of the strip over the button that reached BACK and now reaches nothing (27 x 5 logical px = 58.9 x 10.9 CSS px)").toBe(Math.round(27 * 5 * k * k));
  });

  it("where no face meets the rect it is not touched: 1920x1080 and 844x390@3, every face of the view", () => {
    for (const [w, h, dpr] of [[1920, 1080, 1], [844, 390, 3]] as const) {
      const { s, game, frame, k } = screen(w, h, dpr);
      frame();
      const whole = { ...s.scoutRects.back! };
      for (const side of [0, 1] as const) for (const p of partsOnScreen(s.arena, s.motion, side)) {
        s.faces.open = null;
        s.down(p.x, p.y);
        frame();
        const f = s.faces.last;
        if (!f) continue;
        const back = s.scoutRects.back!;
        expect(meets(back, f.r), `${w}x${h} ${f.title}`).toBe(false);
        const r = reach(game, back, k);
        expect(Object.keys(r), `${w}x${h} ${f.title}: the reported rect is what a press reaches`).toEqual(["viewback"]);
        if (!meets(whole, f.r)) expect(back, `${w}x${h} ${f.title}: no overlap, no cut`).toEqual(whole);
      }
    }
  });
  it("a press at the button's own point still reaches BACK through the UI with the face open (inside() on the region)", () => {
    const { s, game, frame } = screen(851, 393, 2.75);
    const p = partsOnScreen(s.arena, s.motion, 0)[0];
    s.down(p.x, p.y);
    frame();
    const region = game.ui.regions.find((q) => q.id === "viewback")!;
    expect(inside(region.r, region.r.x + 1, region.r.y + region.r.h - 1)).toBe(true);
    s.faces.open = null;
  });
});
