// Cruiser hull art for all four bow facings. Everything is authored in hull-local space
// (hx across 0..A-1, hy from the bow edge 0 to the stern L-1) and mapped to canvas space,
// so bevel light always falls from the screen's upper left (STUDY rule 4).

import { cellNoise } from "../core/rng";
import { GRID, HEROES, type HeroId } from "../sim/content";
import { C, FACTION, type FactionPalette } from "./palette";
import { bevel, disc, makeCanvas, rect, ring, type G } from "./pixel";
import { BOW, HULL_A, HULL_L, SIDE, STERN, type Facing } from "./frame";
import { hullDeco } from "./hullDeco";
import { RACE_DECK_SALT, isArtRace, raceInside } from "./raceArt"; // 0.8.0 H1: the human and dwarf hulls
import { floorStyle, type FloorId, type FloorStyle } from "./styles"; // CUSTOM-1 (REQ-BFG-072) hook

export const HULL_M = 6; // canvas margin for spikes and fins
const A = HULL_A, L = HULL_L, M = HULL_M;

type Cv = HTMLCanvasElement;
const cache = new Map<string, Cv>();
function cached(k: string, make: () => Cv): Cv {
  let c = cache.get(k);
  if (!c) {
    c = make();
    cache.set(k, c);
  }
  return c;
}

/** Maps hull-local rects/pixels into a hull canvas for one facing. */
export class HullPainter {
  constructor(readonly g: G, readonly facing: Facing) {}

  map(hx: number, hy: number, w: number, h: number): [number, number, number, number] {
    switch (this.facing) {
      case 0:
        return [M + hx, M + hy, w, h];
      case 2:
        return [M + hx, M + L - hy - h, w, h];
      case 1:
        return [M + L - hy - h, M + hx, h, w];
      default:
        return [M + hy, M + hx, h, w];
    }
  }

  R(hx: number, hy: number, w: number, h: number, col: string): void {
    const [x, y, ww, hh] = this.map(hx, hy, w, h);
    rect(this.g, x, y, ww, hh, col);
  }

  P(hx: number, hy: number, col: string): void {
    this.R(hx, hy, 1, 1, col);
  }

  B(hx: number, hy: number, w: number, h: number, fill: string, hi: string, lo: string, out?: string): void {
    const [x, y, ww, hh] = this.map(hx, hy, w, h);
    bevel(this.g, x, y, ww, hh, fill, hi, lo, out);
  }

  /** Disc centred on a hull-local point. */
  D(hx: number, hy: number, r: number, col: string): void {
    const [x, y] = this.map(hx, hy, 0, 0);
    disc(this.g, x, y, r, col);
  }

  O(hx: number, hy: number, r: number, col: string): void {
    const [x, y] = this.map(hx, hy, 0, 0);
    ring(this.g, x, y, r, col);
  }
}

function inside(hero: HeroId, hx: number, hy: number): boolean {
  if (hx < 0 || hx >= A || hy < 0 || hy >= L) return false;
  const sl = L - 1 - hy;
  const faction = HEROES[hero].faction;
  if (isArtRace(faction)) return raceInside(faction, hx, hy); // 0.8.0 H1: human chamfers, dwarf stepped corners
  if (faction === "orc") {
    const cut = 9;
    if (hy < cut && (hx < cut - hy || hx > A - 1 - (cut - hy))) return false;
    if (sl < 3 && (hx < 3 - sl || hx > A - 1 - (3 - sl))) return false;
    return true;
  }
  const r = 14;
  if (hy < r) {
    if (hx < r) return (hx + 0.5 - r) ** 2 + (hy + 0.5 - r) ** 2 <= r * r;
    if (hx >= A - r) return (hx + 0.5 - (A - r)) ** 2 + (hy + 0.5 - r) ** 2 <= r * r;
  }
  if (sl < 4 && (hx < 4 - sl || hx > A - 1 - (4 - sl))) return false;
  return true;
}

/** Tread channel extents (hull-local), in the deck sprite's art (the board plate cuts inside them). */
export const TREAD_HX = [3, A - 14];
export const TREAD_W = 11;
export const TREAD_HY0 = 6;
export const TREAD_LEN = L - 11;

export function hullSprite(hero: HeroId, facing: Facing, floor: FloorId = "plate"): Cv {
  // CUSTOM-1 (REQ-BFG-072) hook: a floor style other than the default gets its own cached sprite
  return cached(floor === "plate" ? `hull:${hero}:${facing}` : `hull:${hero}:${facing}:${floor}`, () => {
    const vertical = facing === 0 || facing === 2;
    const [c, g] = makeCanvas(vertical ? A + 2 * M : L + 2 * M, vertical ? L + 2 * M : A + 2 * M);
    const p = new HullPainter(g, facing);
    const P = FACTION[HEROES[hero].faction];
    // silhouette with a 1px ink rim; base plating one step darker than the armour
    for (let hy = 0; hy < L; hy++) {
      for (let hx = 0; hx < A; hx++) {
        if (!inside(hero, hx, hy)) continue;
        const edge = !inside(hero, hx - 1, hy) || !inside(hero, hx + 1, hy) || !inside(hero, hx, hy - 1) || !inside(hero, hx, hy + 1);
        p.P(hx, hy, edge ? C.ink : P.hull1);
      }
    }
    // side skirts outside the tracks
    p.B(1, TREAD_HY0 + 2, 2, TREAD_LEN - 4, P.hull3, P.hull4, P.hull1);
    p.B(A - 3, TREAD_HY0 + 2, 2, TREAD_LEN - 4, P.hull2, P.hull3, P.hull0);
    // track channels
    for (const tx of TREAD_HX) p.R(tx, TREAD_HY0, TREAD_W, TREAD_LEN, C.ink);
    // walkways between track and deck
    p.B(14, BOW - 1, 3, GRID * 12 + 2, P.trim1, P.trim2, P.trim0, C.ink);
    p.B(A - 17, BOW - 1, 3, GRID * 12 + 2, P.trim1, P.trim2, P.trim0, C.ink);
    if (floor === "plate") drawDeck(p, hero, P);
    else drawStyledDeck(p, hero, floorStyle(floor));
    // bow armour band spanning the tracks
    p.B(13, 1, A - 26, BOW - 2, P.hull2, P.hull4, P.hull1, C.ink);
    p.R(15, BOW - 4, A - 30, 1, P.hull1);
    // stern engine block (behind the deck well's bottom rim)
    p.B(13, BOW + GRID * 12 + 1, A - 26, STERN - 2, P.trim0, P.trim1, C.ink, C.ink);
    hullDeco(p, hero, P);
    return c;
  });
}

function drawDeck(p: HullPainter, hero: HeroId, P: FactionPalette): void {
  p.R(SIDE - 1, BOW - 1, GRID * 12 + 2, GRID * 12 + 2, C.ink);
  const faction = HEROES[hero].faction;
  const salt = isArtRace(faction) ? RACE_DECK_SALT[faction] : hero === "furnace" ? 3 : 7; // 0.8.0 H1: the race art's
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const [x, y] = p.map(SIDE + i * 12, BOW + j * 12, 12, 12);
      const g = p.g;
      const n = cellNoise(i, j, salt);
      rect(g, x, y, 12, 12, P.deck1);
      rect(g, x, y, 12, 1, P.deck2);
      rect(g, x, y, 1, 12, P.deck2);
      rect(g, x, y + 11, 12, 1, P.deck0);
      rect(g, x + 11, y, 1, 12, P.deck0);
      rect(g, x + 2, y + 2, 1, 1, P.deck0);
      rect(g, x + 9, y + 9, 1, 1, P.deck2);
      if (n < 0.1) {
        for (let k = 3; k < 10; k += 2) rect(g, x + 3, y + k, 6, 1, P.deck0);
      } else if (n < 0.15) {
        ring(g, x + 6, y + 6, 3.5, P.deck0);
        rect(g, x + 5, y + 4, 1, 1, P.deck2);
      } else if (n > 0.94) {
        rect(g, x + 4 + (Math.floor(n * 100) % 4), y + 6, 2, 1, P.deck0);
      }
    }
  }
}

/**
 * CUSTOM-1 (REQ-BFG-072) hook: a floor style's deck. Every tile keeps today's edges (a light top and left edge, a dark
 * bottom and right edge, the ink frame round the deck), so tiles stay countable; only the colours and the inner mark
 * change. Exported for the catalogue sheet and the CUSTOMIZE preview (a swatch of n x m tiles at x, y).
 */
export function styledTiles(g: G, x0: number, y0: number, cols: number, rows: number, s: FloorStyle, salt = 7, P?: FactionPalette): void {
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) styledTile(g, x0 + i * 12, y0 + j * 12, i, j, s, salt, P);
  }
}

function styledTile(g: G, x: number, y: number, i: number, j: number, s: FloorStyle, salt: number, P?: FactionPalette): void {
  const base: [string, string, string] = s.deck ?? (P ? [P.deck0, P.deck1, P.deck2] : [C.ink, C.slate0, C.slate1]);
  const [d0, d1, d2] = s.mark === "checker" && s.alt && (i + j) % 2 === 1 ? s.alt : base;
  const n = cellNoise(i, j, salt);
  rect(g, x, y, 12, 12, d1);
  rect(g, x, y, 12, 1, d2);
  rect(g, x, y, 1, 12, d2);
  rect(g, x, y + 11, 12, 1, d0);
  rect(g, x + 11, y, 1, 12, d0);
  const mk = s.ink ?? d0;
  switch (s.mark) {
    case "planks": // two plank seams across the tile, a nail at each plank's end
      rect(g, x + 1, y + 4, 10, 1, mk);
      rect(g, x + 1, y + 8, 10, 1, mk);
      rect(g, x + 2, y + 2, 1, 1, d0);
      rect(g, x + 9, y + 6, 1, 1, d0);
      if (n > 0.85) rect(g, x + 4 + (Math.floor(n * 100) % 4), y + 10, 3, 1, d0);
      break;
    case "tread": // diamond tread: raised studs on a 3 px lattice
      for (let r = 0; r < 3; r++) for (let u = 2 + (r % 2); u < 10; u += 3) {
        rect(g, x + u, y + 2 + r * 3, 1, 1, mk);
        rect(g, x + u + 1, y + 3 + r * 3, 1, 1, d0);
      }
      break;
    case "checker": // two tones, a rivet in each corner
      rect(g, x + 2, y + 2, 1, 1, d0);
      rect(g, x + 9, y + 2, 1, 1, d0);
      rect(g, x + 2, y + 9, 1, 1, d0);
      rect(g, x + 9, y + 9, 1, 1, d2);
      break;
    case "rune": // granite: a faint rune cut in some tiles, grit in others
      rect(g, x + 2, y + 2, 1, 1, d0);
      rect(g, x + 9, y + 9, 1, 1, d2);
      if (n < 0.22) {
        rect(g, x + 5, y + 3, 1, 6, mk);
        rect(g, x + 4, y + 4, 1, 1, mk);
        rect(g, x + 6, y + 6, 2, 1, mk);
      } else if (n > 0.8) rect(g, x + 3 + (Math.floor(n * 100) % 5), y + 6, 2, 1, d0);
      break;
    default: // today's rivet and light pixel
      rect(g, x + 2, y + 2, 1, 1, d0);
      rect(g, x + 9, y + 9, 1, 1, d2);
  }
}

function drawStyledDeck(p: HullPainter, hero: HeroId, s: FloorStyle): void {
  p.R(SIDE - 1, BOW - 1, GRID * 12 + 2, GRID * 12 + 2, C.ink);
  const faction = HEROES[hero].faction;
  const salt = isArtRace(faction) ? RACE_DECK_SALT[faction] : hero === "furnace" ? 3 : 7;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const [x, y] = p.map(SIDE + i * 12, BOW + j * 12, 12, 12);
      styledTile(p.g, x, y, i, j, s, salt, FACTION[faction]);
    }
  }
}

/** MOTION-1 (REQ-BFG-071): a hero's hull colours (its faction's palette), for the carrier art. */
export function heroPalette(hero: HeroId): FactionPalette {
  return FACTION[HEROES[hero].faction];
}

// CUSTOM-2a (REVIEW-MOTION2 Q2): the tracked hull's runtime sprites (hullFlash, hullRim, hullShade: the hit flash, its
// rim and the ink shade; treadStrip: the animated track) are gone with drawHull. The deck sprite above stays: it feeds
// the board plate on every screen (render/ship.ts heroPlate). The tread channels stay in its art (TREAD_*).
