// PAIR-CUE fix 2 (REQ-BFG-100; REVIEW-COUNT1 ruling 4: gun boxes sit outside the board): a gun's C6 box goes on its pivot's
// outward side, over the rail or the open water, never over either board's tiles, on every view, WIDE and CLOSE. On the desk
// and a phone held sideways the foe's boxes move to the far side of its guns; your side and the portrait phones keep the
// spec's +7, -4. COUNT-1's bounds, target and overlap tests (tests/count1.test.ts) run as they were. Tests only.
import { describe, expect, it } from "vitest";
import { battleGrid, battleLayout, battleScale, cameraFocus, laneLayout } from "../src/game/battleLayout";
import { Camera } from "../src/render/camera";
import { BOX_H, GUN_DX, GUN_DY, boxW, gunBoxAt, keepOnScreen, overlap } from "../src/game/counters";
import { CELL, type HeroId } from "../src/sim/content";
import { turretSlots, type Build } from "../src/sim/deck";
import { parRefs } from "../src/sim/harness/par";
import { rivalBuild } from "../src/sim/rivals";
import { DECK, TURRET_LY, fwdX, fwdY, sx, sy, type DeckFrame } from "../src/render/frame";
import { ICON, textWidth } from "../src/render/font";

const VIEWS: [string, number, number, number, boolean][] = [
  ["phone 402x690 @3", 402, 690, 3, true], ["desk 1920x1080", 1920, 1080, 1, false], ["844x390 @3", 844, 390, 3, false],
  ["390x844 @3", 390, 844, 3, true], ["1366x768", 1366, 768, 1, false], ["320x480 @2", 320, 480, 2, true],
];
const deck = (hero: HeroId, day: number, i: number): Build => structuredClone(parRefs(hero, day, "field", 4)[i]);
/** Decks whose slots cover every turret span the fights use: COUNT-1's fight A, PAIR-CUE's fights A and B. */
const BUILDS: [Build, Build][] = [
  [deck("furnace", 10, 1), deck("weaver", 10, 0)],
  [rivalBuild("brasswick", 8), rivalBuild("voss", 8)],
  [rivalBuild("brasswick", 8), rivalBuild("lockjaw", 8)],
];
/** The widest box C6 draws: a slug glyph and "88 JAM". */
const W_MAX = boxW(textWidth(ICON.SLUG, "3") + 1 + textWidth("88 JAM", "3"));

describe("PAIR-CUE fix 2: a gun's box on its pivot's outward side, never over the board's tiles", () => {
  it("gunBoxAt: a bow to the left mirrors the box to the pivot's left; other bows keep +7, -4; a box on the tiles moves out", () => {
    const far = { x: 500, y: 500, w: 10, h: 10 };
    expect(gunBoxAt(100.4, 50.6, 20, 9, 1, 0, far)).toEqual({ x: 100 + GUN_DX, y: 51 + GUN_DY }); // E: as the spec
    expect(gunBoxAt(100.4, 50.6, 20, 9, 0, -1, far)).toEqual({ x: 100 + GUN_DX, y: 51 + GUN_DY }); // N: as the spec
    expect(gunBoxAt(100.4, 50.6, 20, 9, 0, 1, far)).toEqual({ x: 100 + GUN_DX, y: 51 + GUN_DY }); // S: as the spec
    expect(gunBoxAt(100.4, 50.6, 20, 9, -1, 0, far)).toEqual({ x: 100 - GUN_DX - 20, y: 51 + GUN_DY }); // W: mirrored
    // a deep zoom: the deck's edge within the box's reach: out along the bow until clear
    expect(gunBoxAt(100, 50, 20, 9, 0, -1, { x: 0, y: 54, w: 200, h: 100 })).toEqual({ x: 107, y: 45 }); // N: above the deck
    expect(gunBoxAt(100, 50, 20, 9, 0, 1, { x: 0, y: -60, w: 200, h: 106.5 })).toEqual({ x: 107, y: 47 }); // S: below it
    expect(gunBoxAt(100, 50, 20, 9, 1, 0, { x: 0, y: 0, w: 108.2, h: 100 })).toEqual({ x: 109, y: 46 }); // E: right of it
    expect(gunBoxAt(100, 50, 20, 9, -1, 0, { x: 75, y: 0, w: 100, h: 100 })).toEqual({ x: 55, y: 46 }); // W: left of it
  });

  for (const [name, cw, ch, dpr, portrait] of VIEWS) {
    it(`${name}, WIDE and CLOSE: every gun's box clear of both boards' tiles, on its outward side; your side and portrait unchanged`, () => {
      const scale = battleScale(cw * dpr, ch * dpr, portrait);
      const W = Math.floor((cw * dpr) / scale), H = Math.floor((ch * dpr) / scale);
      const L = laneLayout(battleLayout(W, H, portrait));
      const grid = battleGrid(Math.floor(cw * dpr), Math.floor(ch * dpr), portrait);
      for (const shot of ["wide", "close"] as const) {
        const cam = new Camera(grid, shot);
        cam.focus = cameraFocus(L);
        const A = cam.screenAffine();
        const map = (x: number, y: number): [number, number] => [A.a * x + A.e, A.d * y + A.f];
        const deckRect = (f: DeckFrame) => {
          const [x0, y0] = map(sx(f, 0, 0), sy(f, 0, 0)), [x1, y1] = map(sx(f, DECK, DECK), sy(f, DECK, DECK));
          return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
        };
        const decks = [deckRect(L.frames[0]), deckRect(L.frames[1])];
        let drawn = 0, moved = 0;
        for (const builds of BUILDS) for (const side of [0, 1] as const) {
          const f = L.frames[side];
          for (const sl of turretSlots(builds[side])) {
            const lx = (sl.col0 + sl.width / 2) * CELL;
            const [px, py] = map(sx(f, lx, TURRET_LY), sy(f, lx, TURRET_LY));
            const at = gunBoxAt(px, py, W_MAX, BOX_H, fwdX(f), fwdY(f), decks[side]);
            const box = keepOnScreen(px, py, at.x, at.y, W_MAX, BOX_H, W, H);
            if (!box) continue; // its pivot off the screen (CLOSE): not drawn
            drawn++;
            const where = `${name} ${shot} side ${side} slot ${sl.slot} pivot ${px.toFixed(1)},${py.toFixed(1)} box ${JSON.stringify(box)}`;
            expect(overlap(box, decks[0]) || overlap(box, decks[1]), `${where}: off both boards' tiles`).toBe(false);
            if (fwdX(f) < 0) { expect(box.x + box.w, `${where}: left of its pivot`).toBeLessThanOrEqual(px + 0.5); moved++; }
            if (fwdX(f) > 0) expect(box.x, `${where}: right of its pivot`).toBeGreaterThanOrEqual(px);
            // your side everywhere, both sides on a portrait phone: the spec's +7, -4 (as COUNT-1 drew it)
            if (fwdX(f) >= 0) expect(at, where).toEqual({ x: Math.round(px) + GUN_DX, y: Math.round(py) + GUN_DY });
          }
        }
        expect(drawn, `${name} ${shot}: boxes checked`).toBeGreaterThan(0);
        // the foe's boxes moved to the far side of its guns exactly where its bow points left (the desk, a phone on its side)
        expect(moved > 0, `${name} ${shot}`).toBe(!portrait);
      }
    });
  }
});
