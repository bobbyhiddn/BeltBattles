// 0.8.0 H1 M3 (REQ-BFG-011): the FOUNDRY and BASTION signature-visuals contact sheet (a dev page, tools/heroes-fx.html;
// not in the game build): the weld flash (FUSE), the CLANK, the SYNC mark, the plating strip in its states, and live
// battles caught on the frames where the sim's events fire, drawn with the game's own drawArena and drawPlate. Rendered by
// tools/heroes-art-shot.mjs (PAGE=heroes-fx.html) at 1x and 3x.

import { C } from "../src/render/palette";
import { makeCanvas, rect, type G } from "../src/render/pixel";
import { drawText } from "../src/render/font";
import { frameForHull } from "../src/render/frame";
import { HULL_M } from "../src/render/hull";
import { CLANK_FRAMES, FUSE_FRAMES, drawPlatingStrip, fuseFlash, platingClank, syncIcon } from "../src/render/raceFx";
import { Arena } from "../src/game/arena";
import { drawArena } from "../src/game/arenaDraw";
import { drawPlate } from "../src/screens/battleHud";
import type { Game } from "../src/game/game";
import { HEROES, type HeroId } from "../src/sim/content";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { key as K, type Build } from "../src/sim/deck";
import { syncLine } from "../src/screens/build/inspector";
import { VERSION } from "../src/version";
import type { SimEvent } from "../src/sim/battle";

export const FX_W = 1100, FX_H = 1000;

const label = (g: G, s: string, x: number, y: number, col: string = C.bone, small = false): void => {
  drawText(g, s, x, y, col, { font: small ? "3" : "5" });
};

/** A sprite at 1x, then at 4x beside it. */
function zoomed(g: G, img: HTMLCanvasElement, x: number, y: number): number {
  rect(g, x - 1, y - 1, img.width + 2, img.height + 2, C.slate1);
  g.drawImage(img, x, y);
  const zx = x + img.width + 6;
  rect(g, zx - 2, y - 2, img.width * 4 + 4, img.height * 4 + 4, C.slate1);
  g.imageSmoothingEnabled = false;
  g.drawImage(img, zx, y, img.width * 4, img.height * 4);
  return zx + img.width * 4 + 10;
}

export function drawFxSheet(g: G, tag: string): void {
  rect(g, 0, 0, FX_W, FX_H, C.ink);
  label(g, `BELTBATTLES ${VERSION}: FOUNDRY AND BASTION SIGNATURE VISUALS (H1 M3) · ${tag}`, 8, 6, C.yellow);
  label(g, "1X PIXELS WITH 4X ZOOMS. THE LIVE FRAMES ARE THE GAME'S OWN DRAW, CAUGHT WHEN THE SIM'S EVENT FIRES.", 8, 16, C.slate4, true);
  let y = 30;
  label(g, "FUSE: THE WELD FLASH ON THE GUN (FRAMES 0-3, 0.36 S)", 8, y, C.white);
  let x = 8;
  for (let f = 0; f < FUSE_FRAMES; f++) x = zoomed(g, fuseFlash(f), x, y + 12);
  y += 72;
  label(g, "CLANK: A BULWARK SLUG PLATES THE HULL (FRAMES 0-2, 0.3 S)", 8, y, C.white);
  x = 8;
  for (let f = 0; f < CLANK_FRAMES; f++) x = zoomed(g, platingClank(f), x, y + 12);
  label(g, "SYNC MARK: LIT (PULSE 0, 1) AND OUT OF SYNC", 560, y, C.white);
  x = 560;
  for (const [lit, f] of [[true, 0], [true, 1], [false, 0]] as const) x = zoomed(g, syncIcon(lit, f), x, y + 12);
  y += 60;
  strips(g, 8, y);
  y += 96;
  syncLines(g, 8, y);
  y += 74;
  moments(g, 8, y);
}

function strips(g: G, x: number, y: number): void {
  label(g, "THE PLATING STRIP ON BASTION'S PLATE (2 PX ON THE 5 PX HULL BAR), 12 SEGMENTS OF 2 PLATING, CAP 24", x, y, C.white);
  const cases: [string, number, number, number][] = [
    ["NONE", 0, 0, 0], ["2 (ONE SLUG)", 2, 2, 0], ["5", 5, 5, 0], ["13", 13, 13, 0], ["24 (CAP)", 24, 24, 0],
    ["6, 10 JUST LOST", 6, 10, 0], ["8, LANDING", 8, 8, 1], ["8, SHINE FADING", 8, 8, 0.4],
  ];
  cases.forEach(([name, plate, shown, shine], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const cx = x + col * 270, cy = y + 12 + row * 40;
    label(g, name, cx, cy, C.slate4, true);
    for (const [w, k] of [[80, 0], [45, 1]] as const) {
      const [cv, cg] = makeCanvas(w + 6, 11);
      rect(cg, 0, 0, w + 6, 11, C.slate0);
      drawPlatingStrip(cg, 3, 2, w, plate, shown, 24, 12, shine);
      rect(cg, 3, 4, w, 5, C.ink);
      rect(cg, 4, 5, w - 2, 3, C.lime);
      const zx = cx + k * 96;
      g.imageSmoothingEnabled = false;
      g.drawImage(cv, zx, cy + 8, (w + 6) * (k ? 2 : 1), 11 * (k ? 2 : 1));
    }
  });
}

/** FOUNDRY's start deck and the belt variants the tests use (tests/heroes.signature.test.ts). */
function foundryDecks(): [string, Build][] {
  const start = heroStartBuild("foundry", 1);
  const c = (): Build => JSON.parse(JSON.stringify(start)) as Build;
  const delay = c();
  delay.routes[1].cells = [K(3, 5), K(4, 5), K(5, 5), K(5, 4), K(5, 3), K(4, 3), K(3, 3), K(3, 2), K(3, 1), K(3, 0)];
  const off = c();
  off.routes[1].cells = [K(3, 5), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(3, 2), K(3, 1), K(3, 0)];
  const lone = c();
  lone.routes[1].cells = [K(3, 5), K(4, 5), K(5, 5), K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(6, 0)];
  return [["START DECK", start], ["+4 TILES (DELAY LINE)", delay], ["+2 TILES", off], ["BELT 2 INTO GUN 2", lone]];
}

function syncLines(g: G, x: number, y: number): void {
  label(g, "THE ROUTE INSPECTOR'S SYNC LINE FOR BELT 1 (COLOUR AS THE PANEL SHOWS IT)", x, y, C.white);
  const COL = { sync: C.yellow, apart: C.amber, alone: C.slate4 } as const;
  foundryDecks().forEach(([name, b], i) => {
    const l = syncLine(b, 0)!;
    const yy = y + 12 + i * 14;
    label(g, name, x, yy, C.slate4, true);
    if (l.state !== "alone") g.drawImage(syncIcon(l.state === "sync"), x + 104, yy - 2);
    label(g, l.text, x + 120, yy, COL[l.state], true);
  });
}

/** Step a fresh arena until `want` fires (then `after` more frames) and draw it with both plates. `want` also gets the
 *  plating the frame's impacts showed as soaked (Arena.takeSoak). */
function moment(g: G, x: number, y: number, title: string, a: Build, b: Build, seed: number, want: (e: SimEvent, ar: Arena, soaked: number) => boolean, after: number, nth = 1): void {
  const ar = new Arena(a, b, seed, null);
  ar.quiet = true;
  const W = 172, H = 352;
  const f0 = frameForHull(0, 8, H - 146 - 12), f1 = frameForHull(2, 8, 16);
  ar.setFrames([f0, f1], [[0, 1], [0, -1]]);
  let soaked = 0;
  const take = ar.takeSoak.bind(ar);
  ar.takeSoak = (side, dmg) => {
    const t = take(side, dmg);
    soaked += t;
    return t;
  };
  let seen = 0, left = -1;
  for (let fr = 0; fr < 60 * 120 && !ar.b.over; fr++) {
    soaked = 0;
    const ev = ar.update(1 / 60);
    if (left < 0 && ev.some((e) => want(e, ar, soaked)) && ++seen >= nth) left = after;
    if (left === 0) break;
    if (left > 0) left--;
  }
  const [cv, cg] = makeCanvas(W, H);
  rect(cg, 0, 0, W, H, C.soil1);
  drawArena(cg, ar, W, H);
  const game = { t: ar.clock } as unknown as Game;
  const name = (s: 0 | 1) => HEROES[ar.b.sides[s].build.hero].name;
  drawPlate(cg, game, ar, { x: 8 + 12, y: 4, w: 132, h: 10 }, 1, name(1), String(Math.ceil(ar.b.sides[1].hull.hp)));
  drawPlate(cg, game, ar, { x: 8 + 12, y: H - 14, w: 132, h: 10 }, 0, name(0), String(Math.ceil(ar.b.sides[0].hull.hp)));
  g.drawImage(cv, x, y);
  label(g, title, x, y + H + 3, C.slate4, true);
  label(g, `AT ${ar.b.t.toFixed(2)} S`, x, y + H + 11, C.slate3, true);
  void HULL_M;
}

function moments(g: G, x: number, y: number): void {
  label(g, "LIVE FRAMES (PORTRAIT FRAMING, PLATES AS THE BATTLE DRAWS THEM): FOUNDRY (PLAYER) VS BASTION, DAY 5 REFERENCE DECKS", x, y, C.white);
  const F = (): Build => heroRefBuild("foundry", 5), B = (): Build => heroRefBuild("bastion", 5);
  const yy = y + 12;
  moment(g, x, yy, "A FUSE: THE WELD FLASH, FRAME 1", F(), B(), 31, (e) => e.type === "fuse", 6, 3);
  moment(g, x + 180, yy, "A CLANK ON BASTION'S GUN", F(), B(), 31, (e) => e.type === "plate", 2, 3);
  moment(g, x + 360, yy, "A HIT TAKES PLATING FIRST (BLUE NUMBER)", F(), B(), 31, (e, _ar, soaked) => e.type === "impact" && e.side === 1 && soaked > 0, 8, 2);
  moment(g, x + 540, yy, "BASTION (PLAYER) PLATED, VS FOUNDRY", B(), F(), 32, (e) => e.type === "plate" && e.side === 0, 3, 4);
  moment(g, x + 720, yy, "THE START DECKS: SYNC MARK ON GUN 1", heroStartBuild("foundry", 1), heroStartBuild("bastion", 500), 33, (e) => e.type === "fuse", 5, 1);
  void (null as unknown as HeroId);
}
