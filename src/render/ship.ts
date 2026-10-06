// MOTION-2 (REQ-BFG-071): one world on every screen. The carrier as each screen draws it: the ship (carrier.ts) under its
// board plate, the deck sprite (hull.ts hullSprite) cut down to the deck (carrier.ts boardPlate). The battle, the title's
// attract fight and replays draw it moving (game/arenaMotion.ts); the build screen, the summary and the hero preview draw
// it held still at the board's own deck frame, so the board's tiles, taps and drags stay exactly where they were.
// One deck sprite feeds the plate everywhere, and every canvas stays cached per hero (and facing, and heading): CUSTOM-2's
// deck styles (REQ-BFG-072) key the same caches. Imports render modules and sim types only.
// CUSTOM-2a (REQ-BFG-072): the plate takes a floor style. The default ("plate") keeps today's cache keys and pixels (the
// deck sprite `hull:<hero>:<facing>`, the plate `plate:<hero>:<facing>`); a styled floor keys both with its id
// (`hull:<hero>:<facing>:<floor>`, `plate:<hero>:<floor>:<facing>`), so a style never reuses the default's canvas.

import type { HeroId } from "../sim/content";
import type { FloorId } from "./styles";
import type { G } from "./pixel";
import { HULL_L, hullBox, type Box, type DeckFrame, type Facing } from "./frame";
import { HULL_M, HullPainter, heroPalette, hullSprite } from "./hull";
import { PLATE_HX, PLATE_W, ROT_X, ROT_Y, boardPlate, plateShade, shipShadow, shipSprite } from "./carrier";

type Cv = HTMLCanvasElement;

/** Where the board plate sits for deck frame `f` (screen px at rest): the hull box cut to the plate's span (the deck,
 *  the bow band and the walkways; the treads' strips are gone). */
export function plateBox(g: G, f: DeckFrame, out: Box = { x: 0, y: 0, w: 0, h: 0 }): Box {
  const hb = hullBox(f);
  const [mx, my, w, h] = new HullPainter(g, f.facing).map(PLATE_HX, 0, PLATE_W, HULL_L);
  out.x = hb.x + mx - HULL_M;
  out.y = hb.y + my - HULL_M;
  out.w = w;
  out.h = h;
  return out;
}

/** A hero's board plate for a facing: cut from its deck sprite in floor style `floor` (cached per hero, floor and
 *  facing; the default floor keeps today's keys). */
export function heroPlate(g: G, hero: HeroId, facing: Facing, floor: FloorId = "plate"): Cv {
  const hp = new HullPainter(g, facing);
  const key = floor === "plate" ? hero : `${hero}:${floor}`;
  return boardPlate(key, hullSprite(hero, facing, floor), facing, (hx, hy, w, h) => hp.map(hx, hy, w, h), HULL_L);
}

/** The carrier's pivot for deck frame `f` at rest: the hull box's centre (the board's centre). */
export function pivotOf(f: DeckFrame): [number, number] {
  const hb = hullBox(f);
  return [hb.x + hb.w / 2, hb.y + hb.h / 2];
}

/** The ship, its pivot at (px, py) (whole px), turned `deg` whole degrees (+ = bow up); its shadow drops by `bob`. */
export function drawShip(g: G, hero: HeroId, px: number, py: number, deg: number, bob: number): void {
  const pal = heroPalette(hero);
  const x = px - ROT_X, y = py - ROT_Y;
  g.globalAlpha = 0.35;
  g.drawImage(shipShadow(hero, pal, deg), x + 2, y + 3 + bob);
  g.globalAlpha = 1;
  g.drawImage(shipSprite(hero, pal, deg), x, y);
}

/** Darken a ship (a KO'd or lost carrier): its ink silhouette at alpha `k`. */
export function dimShip(g: G, hero: HeroId, px: number, py: number, deg: number, k: number): void {
  if (k <= 0) return;
  g.globalAlpha = Math.min(0.7, k);
  g.drawImage(shipShadow(hero, heroPalette(hero), deg), px - ROT_X, py - ROT_Y);
  g.globalAlpha = 1;
}

/** A board plate with its shadow at `r` (rest-screen px; callers set any transform), in floor style `floor`. */
export function drawPlate(g: G, hero: HeroId, facing: Facing, r: Box, floor: FloorId = "plate"): void {
  g.globalAlpha = 0.3;
  g.drawImage(plateShade(r.w, r.h), r.x + 2, r.y + 3);
  g.globalAlpha = 1;
  g.drawImage(heroPlate(g, hero, facing, floor), r.x, r.y);
}

/** Darken a board plate (a KO'd or lost carrier's). */
export function dimPlate(g: G, r: Box, k: number): void {
  if (k <= 0) return;
  g.globalAlpha = Math.min(0.7, k);
  g.drawImage(plateShade(r.w, r.h), r.x, r.y);
  g.globalAlpha = 1;
}

const still: Box = { x: 0, y: 0, w: 0, h: 0 };

/** The still screens' carrier (build screen, summary): the ship at heading 0 under the board plate at deck frame `f`.
 *  The caller draws the machinery and turrets on top at the same frame, as it drew them on the tracked hull. `dim`
 *  darkens the ship (a lost run's wreck; dimStillPlate darkens the board over its machinery afterwards). */
export function drawStillCarrier(g: G, hero: HeroId, f: DeckFrame, dim = 0, floor: FloorId = "plate"): void {
  const [px, py] = pivotOf(f);
  drawShip(g, hero, Math.round(px), Math.round(py), 0, 0);
  dimShip(g, hero, Math.round(px), Math.round(py), 0, dim);
  drawPlate(g, hero, f.facing, plateBox(g, f, still), floor);
}

/** Darken the still carrier's board (the summary's lost run), over its machinery and turrets. */
export function dimStillPlate(g: G, f: DeckFrame, k: number): void {
  dimPlate(g, plateBox(g, f, still), k);
}
