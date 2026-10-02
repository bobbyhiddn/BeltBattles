// Cruiser hull art for all four bow facings. Everything is authored in hull-local space
// (hx across 0..A-1, hy from the bow edge 0 to the stern L-1) and mapped to canvas space,
// so bevel light always falls from the screen's upper left (STUDY rule 4).

import { cellNoise } from "../core/rng";
import { GRID, HEROES, type HeroId } from "../sim/content";
import { C, FACTION, type FactionPalette } from "./palette";
import { bevel, disc, makeCanvas, rect, ring, silhouette, type G } from "./pixel";
import { BOW, HULL_A, HULL_L, SIDE, STERN, type Facing } from "./frame";
import { hullDeco } from "./hullDeco";
import { RACE_DECK_SALT, isArtRace, raceInside } from "./raceArt"; // 0.8.0 H1: the human and dwarf hulls

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

/** Tread channel extents (hull-local); the animated track is drawn at runtime. */
export const TREAD_HX = [3, A - 14];
export const TREAD_W = 11;
export const TREAD_HY0 = 6;
export const TREAD_LEN = L - 11;

export function hullSprite(hero: HeroId, facing: Facing): Cv {
  return cached(`hull:${hero}:${facing}`, () => {
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
    drawDeck(p, hero, P);
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

export function hullFlash(hero: HeroId, facing: Facing): Cv {
  return cached(`hullF:${hero}:${facing}`, () => silhouette(hullSprite(hero, facing), C.white));
}

/** 2px white rim around the hull silhouette: the hit flash (a full white-out is too much at this scale). */
export function hullRim(hero: HeroId, facing: Facing): Cv {
  return cached(`hullR:${hero}:${facing}`, () => {
    const src = hullSprite(hero, facing);
    const w = src.width, h = src.height;
    const d = src.getContext("2d")!.getImageData(0, 0, w, h).data;
    const [c, g] = makeCanvas(w, h);
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
    g.fillStyle = C.white;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!solid(x, y)) continue;
        let edge = false;
        for (let k = 1; k <= 2 && !edge; k++) edge = !solid(x - k, y) || !solid(x + k, y) || !solid(x, y - k) || !solid(x, y + k);
        if (edge) g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  });
}

export function hullShade(hero: HeroId, facing: Facing): Cv {
  return cached(`hullS:${hero}:${facing}`, () => silhouette(hullSprite(hero, facing), C.ink));
}

/** Pre-rendered track strip (period 4) so each tread is one blit per frame. */
export function treadStrip(vertical: boolean): Cv {
  return cached(`tread:${vertical ? 1 : 0}`, () => {
    const len = TREAD_LEN + 4;
    const [c, g] = makeCanvas(vertical ? TREAD_W - 2 : len, vertical ? len : TREAD_W - 2);
    const cols = [C.steel3, C.steel2, C.steel1, C.ink];
    for (let k = 0; k < len; k++) {
      const col = cols[k % 4];
      if (vertical) {
        rect(g, 0, k, TREAD_W - 2, 1, col);
        if (k % 4 !== 3) rect(g, 0, k, 1, 1, C.steel0);
        if (k % 4 !== 3) rect(g, TREAD_W - 3, k, 1, 1, C.steel0);
        rect(g, 4, k, 1, 1, k % 4 === 0 ? C.steel1 : C.ink);
      } else {
        rect(g, k, 0, 1, TREAD_W - 2, col);
        if (k % 4 !== 3) rect(g, k, 0, 1, 1, C.steel0);
        if (k % 4 !== 3) rect(g, k, TREAD_W - 3, 1, 1, C.steel0);
        rect(g, k, 4, 1, 1, k % 4 === 0 ? C.steel1 : C.ink);
      }
    }
    return c;
  });
}
