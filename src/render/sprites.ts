// Procedural pixel-art sprite library. Everything is drawn at native resolution with a
// shared palette, 1px ink outlines and light from the top-left, then cached.

import { cellNoise } from "../core/rng";
import { C, FACTION, type FactionPalette } from "./palette";
import {
  bevel, dither, disc, ellipse, flipX, flipY, frame, fromRows, hline, line, makeCanvas, outlined,
  px, rect, ring, rot90, silhouette, vline, type G,
} from "./pixel";

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

export const BELT_PERIOD = 6;

// ------------------------------------------------------------------ belts

type BeltVariant = "normal" | "warn" | "dead";

function railColors(v: BeltVariant): [string, string, string, string] {
  // [hi, mid, lo2, lo]
  if (v === "warn") return [C.yellow, C.amber, C.fire1, C.fire0];
  if (v === "dead") return [C.steel1, C.steel0, C.maroon, C.rust0];
  return [C.steel3, C.steel1, C.steel2, C.steel0];
}

function beltN(frameIdx: number, v: BeltVariant): Cv {
  return cached(`beltN:${frameIdx}:${v}`, () => {
    const [c, g] = makeCanvas(12, 12);
    const [hi, mid, mid2, lo] = railColors(v);
    vline(g, 0, 0, 12, C.ink);
    vline(g, 1, 0, 12, hi);
    vline(g, 2, 0, 12, mid);
    vline(g, 9, 0, 12, mid2);
    vline(g, 10, 0, 12, lo);
    vline(g, 11, 0, 12, C.ink);
    const offs = [2, 1, 0, 0, 1, 2];
    for (let j = 0; j < 6; j++) {
      for (let y = 0; y < 12; y++) {
        const m = (((y - offs[j] + frameIdx) % BELT_PERIOD) + BELT_PERIOD) % BELT_PERIOD;
        let col = C.belt1;
        if (v === "dead") col = m === 0 ? C.belt2 : C.belt0;
        else col = m === 0 ? C.belt3 : m === 1 ? C.belt2 : C.belt1;
        px(g, 3 + j, y, col);
      }
    }
    // rail bolts
    for (const y of [2, 8]) {
      px(g, 2, y, C.steel0);
      px(g, 9, y, C.steel0);
    }
    return c;
  });
}

/** Straight belt flowing toward screen dir d (0=N,1=E,2=S,3=W). */
export function beltStraight(d: number, frameIdx: number, v: BeltVariant = "normal"): Cv {
  const f = ((frameIdx % BELT_PERIOD) + BELT_PERIOD) % BELT_PERIOD;
  return cached(`beltS:${d}:${f}:${v}`, () => {
    const n = beltN(f, v);
    if (d === 0) return n;
    if (d === 1) return rot90(n);
    if (d === 2) return flipY(n);
    return flipX(rot90(n));
  });
}

const HALF_CLIP: Record<number, [number, number, number, number]> = {
  0: [0, 0, 12, 6], // north half
  1: [6, 0, 6, 12], // east half
  2: [0, 6, 12, 6], // south half
  3: [0, 0, 6, 12], // west half
};

/**
 * Corner belt: enters from side `a` (screen dir of the side), leaves through side `b`.
 * Drawn as two half belts into a turntable housing.
 */
export function beltCorner(a: number, b: number, frameIdx: number, v: BeltVariant = "normal"): Cv {
  const f = ((frameIdx % BELT_PERIOD) + BELT_PERIOD) % BELT_PERIOD;
  return cached(`beltC:${a}:${b}:${f}:${v}`, () => {
    const [c, g] = makeCanvas(12, 12);
    // housing plate
    const [hi, mid, , lo] = railColors(v);
    bevel(g, 0, 0, 12, 12, mid, hi, lo, C.ink);
    const inFlow = (a + 2) % 4; // moving away from side a
    const partA = beltStraight(inFlow, f, v);
    const partB = beltStraight(b, f, v);
    const [ax, ay, aw, ah] = HALF_CLIP[a];
    const [bx, by, bw, bh] = HALF_CLIP[b];
    g.drawImage(partA, ax, ay, aw, ah, ax, ay, aw, ah);
    g.drawImage(partB, bx, by, bw, bh, bx, by, bw, bh);
    return c;
  });
}

/** Turntable disc for corner belts; `angle` 0..7 (rotation step). */
export function turntable(angle: number, v: BeltVariant = "normal"): Cv {
  const a = ((angle % 8) + 8) % 8;
  return cached(`tt:${a}:${v}`, () => {
    const [c, g] = makeCanvas(12, 12);
    const [hi, mid, , lo] = railColors(v);
    disc(g, 6, 6, 4.6, C.ink);
    disc(g, 6, 6, 3.8, mid);
    // top-left light
    px(g, 4, 3, hi); px(g, 3, 4, hi); px(g, 5, 3, hi); px(g, 3, 5, hi);
    px(g, 8, 9, lo); px(g, 9, 8, lo); px(g, 7, 9, lo); px(g, 9, 7, lo);
    // hub
    rect(g, 5, 5, 2, 2, C.steel0);
    px(g, 5, 5, C.steel3);
    // bolts rotating
    const th = (a / 8) * Math.PI;
    for (const k of [0, Math.PI]) {
      const x = Math.round(6 + Math.cos(th + k) * 2.6 - 0.5);
      const y = Math.round(6 + Math.sin(th + k) * 2.6 - 0.5);
      px(g, x, y, C.white);
    }
    return c;
  });
}

/** Red/black stopper where an unfinished route ends, on side d. */
export function beltStopper(d: number): Cv {
  return cached(`stop:${d}`, () => {
    const [c, g] = makeCanvas(12, 12);
    const draw = (x: number, y: number, w: number, h: number) => {
      rect(g, x, y, w, h, C.ink);
      for (let i = 0; i < Math.max(w, h); i++) {
        const xx = w > h ? x + i : x + 1;
        const yy = w > h ? y + 1 : y + i;
        if ((i >> 1) % 2 === 0) px(g, xx, yy, C.red);
        else px(g, xx, yy, C.yellow);
      }
    };
    if (d === 0) draw(2, 0, 8, 3);
    else if (d === 2) draw(2, 9, 8, 3);
    else if (d === 1) draw(9, 2, 3, 8);
    else draw(0, 2, 3, 8);
    return c;
  });
}

// ------------------------------------------------------------------ deck and hull

export const HULL_W = 144;
export const HULL_H = 148;
export const HULL_M = 6; // canvas margin
export const DECK_OX = 12; // deck x offset inside hull
export const BOW = 18; // bow depth (turret mounts)
export const STERN = 10;

/**
 * Hull base sprite. facing 0 = bow at top (player), 2 = bow at bottom (enemy).
 * Deck sits at (HULL_M + 12, HULL_M + (facing 0 ? 18 : 10)).
 */
export function hullSprite(faction: "orc" | "elf", facing: 0 | 2): Cv {
  return cached(`hull:${faction}:${facing}`, () => {
    const W = HULL_W + HULL_M * 2, H = HULL_H + HULL_M * 2;
    const [c, g] = makeCanvas(W, H);
    const P = FACTION[faction];
    const M = HULL_M;
    // map hull-local y (0 = bow edge) to canvas y for a rect of height h
    const Y = (ly: number, h: number) => (facing === 0 ? M + ly : M + HULL_H - ly - h);
    const R = (lx: number, ly: number, w: number, h: number, col: string) => rect(g, M + lx, Y(ly, h), w, h, col);
    const B = (lx: number, ly: number, w: number, h: number, fill: string, hi: string, lo: string, out?: string) =>
      bevel(g, M + lx, Y(ly, h), w, h, fill, hi, lo, out);

    // --- silhouette + outline
    const bowCut = faction === "orc" ? 9 : 14;
    const silhouetteFn = (lx: number, ly: number): boolean => {
      if (lx < 0 || lx >= HULL_W || ly < 0 || ly >= HULL_H) return false;
      if (faction === "orc") {
        // chamfered bow corners, small stern chamfer
        if (ly < bowCut && (lx < bowCut - ly || lx >= HULL_W - (bowCut - ly))) return false;
        const sl = HULL_H - 1 - ly;
        if (sl < 4 && (lx < 4 - sl || lx >= HULL_W - (4 - sl))) return false;
        return true;
      }
      // elf: rounded bow corners
      if (ly < bowCut) {
        const r = bowCut;
        const cxL = r, cxR = HULL_W - r, cy = r;
        if (lx < r) return (lx - cxL) ** 2 + (ly - cy) ** 2 <= r * r;
        if (lx >= HULL_W - r) return (lx + 1 - cxR) ** 2 + (ly - cy) ** 2 <= r * r;
      }
      const sl = HULL_H - 1 - ly;
      if (sl < 5 && (lx < 5 - sl || lx >= HULL_W - (5 - sl))) return false;
      return true;
    };
    for (let ly = 0; ly < HULL_H; ly++) {
      for (let lx = 0; lx < HULL_W; lx++) {
        if (!silhouetteFn(lx, ly)) continue;
        const edge = !silhouetteFn(lx - 1, ly) || !silhouetteFn(lx + 1, ly) || !silhouetteFn(lx, ly - 1) || !silhouetteFn(lx, ly + 1);
        const cy = facing === 0 ? M + ly : M + HULL_H - 1 - ly;
        const cx = M + lx;
        if (edge) px(g, cx, cy, C.ink);
        else {
          // base plating with shading bands
          const shade = lx < 3 ? P.hull3 : lx > HULL_W - 4 ? P.hull1 : P.hull2;
          px(g, cx, cy, shade);
        }
      }
    }
    // top edge light (screen top) along the silhouette: redraw highlight row under outline
    // --- tread channels (drawn animated at runtime on top)
    R(1, 10, 9, HULL_H - 16, C.ink);
    R(HULL_W - 10, 10, 9, HULL_H - 16, C.ink);
    // --- side walkways (between treads and deck)
    B(10, 12, 2, HULL_H - 20, P.trim0, P.trim1, C.ink);
    B(HULL_W - 12, 12, 2, HULL_H - 20, P.trim0, P.trim1, C.ink);
    // --- bow armour plate
    if (faction === "orc") {
      B(12, 2, HULL_W - 24, BOW - 4, P.hull2, P.hull4, P.hull1, C.ink);
      // war paint chevrons
      for (let i = 0; i < 5; i++) {
        R(20 + i * 22, 5, 10, 2, C.maroon);
        R(22 + i * 22, 7, 6, 2, C.maroon);
      }
      // rivets along bow
      for (let x = 16; x < HULL_W - 14; x += 8) {
        R(x, 3, 1, 1, P.hull4);
        R(x, BOW - 4, 1, 1, P.hull0);
      }
    } else {
      B(12, 2, HULL_W - 24, BOW - 4, P.hull2, P.hull4, P.hull1, C.ink);
      // brass filigree line
      R(14, 8, HULL_W - 28, 1, P.trim1);
      for (let x = 18; x < HULL_W - 18; x += 12) {
        R(x, 6, 3, 1, P.trim2);
        R(x + 1, 5, 1, 1, P.trim2);
      }
    }
    // --- deck well (sunken): 1px ink frame around deck, walkway lip
    R(DECK_OX - 1, BOW - 1, 122, 122, C.ink);
    // deck plates
    for (let j = 0; j < 10; j++) {
      for (let i = 0; i < 10; i++) {
        const lx = DECK_OX + i * 12, ly = BOW + j * 12;
        const ox = M + lx, oy = Y(ly, 12);
        const n = cellNoise(i, j, faction === "orc" ? 3 : 7);
        rect(g, ox, oy, 12, 12, P.deck1);
        hline(g, ox, oy, 12, P.deck2);
        vline(g, ox, oy, 12, P.deck2);
        hline(g, ox, oy + 11, 12, P.deck0);
        vline(g, ox + 11, oy, 12, P.deck0);
        // corner bolts
        px(g, ox + 2, oy + 2, P.deck0);
        px(g, ox + 9, oy + 9, P.deck2);
        if (n < 0.18) {
          // grate
          for (let k = 3; k < 10; k += 2) hline(g, ox + 3, oy + k, 6, P.deck0);
        } else if (n < 0.26) {
          // hatch ring
          ring(g, ox + 6, oy + 6, 3.5, P.deck0);
          px(g, ox + 5, oy + 4, P.deck2);
        } else if (n > 0.9) {
          // scuff
          px(g, ox + 4 + Math.floor(n * 10) % 4, oy + 6, P.deck2);
          px(g, ox + 5 + Math.floor(n * 10) % 4, oy + 7, P.deck0);
        }
      }
    }
    // --- stern engine block
    const sy = HULL_H - STERN;
    B(12, sy + 1, HULL_W - 24, STERN - 3, P.trim0, P.trim1, C.ink, C.ink);
    const stacks = faction === "orc" ? [30, 58, 86, 114] : [40, 72, 104];
    for (const x of stacks) {
      const ox = M + x, oy = Y(sy + 1, STERN - 3);
      const cy = oy + (STERN - 3) / 2;
      disc(g, ox, cy, 3.6, C.ink);
      disc(g, ox, cy, 2.6, faction === "orc" ? C.steel1 : P.trim1);
      disc(g, ox, cy, 1.5, faction === "orc" ? C.fire0 : C.deepblue);
      px(g, ox - 1, cy - 2, faction === "orc" ? C.steel3 : P.trim2);
    }
    // --- orc bow spikes / elf fins drawn beyond the silhouette
    if (faction === "orc") {
      for (const sx of [2, HULL_W - 9]) {
        for (let k = 0; k < 3; k++) {
          const bx = M + sx + (sx < 20 ? k * 2 : -k * 2) + 2;
          const tipLen = 5 - k;
          for (let t = 0; t < tipLen; t++) {
            const yy = facing === 0 ? M + 12 + k * 7 - t - 6 : M + HULL_H - 12 - k * 7 + t + 5;
            const w = Math.max(1, 3 - Math.floor(t / 2));
            rect(g, bx - (sx < 20 ? 1 + t % 2 : -1), yy, w, 1, t === tipLen - 1 ? C.steel3 : C.steel1);
          }
        }
      }
    } else {
      for (const side of [0, 1]) {
        for (let k = 0; k < 4; k++) {
          const ly = 30 + k * 26;
          const x = side === 0 ? M - 3 : M + HULL_W;
          const y0 = Y(ly, 10);
          for (let t = 0; t < 10; t++) {
            const w = 3 - Math.abs(t - 4) / 2;
            const xx = side === 0 ? x + 3 - Math.round(w) : x;
            rect(g, xx, y0 + t, Math.max(1, Math.round(w)), 1, t < 3 ? P.trim2 : P.trim1);
          }
        }
      }
    }
    return c;
  });
}

export function hullFlash(faction: "orc" | "elf", facing: 0 | 2): Cv {
  return cached(`hullF:${faction}:${facing}`, () => silhouette(hullSprite(faction, facing), C.white));
}

/** Dark silhouette laid over a destroyed hull so the loser reads as a burnt-out wreck. */
export function hullShade(faction: "orc" | "elf", facing: 0 | 2): Cv {
  return cached(`hullS:${faction}:${facing}`, () => silhouette(hullSprite(faction, facing), C.ink));
}

// ------------------------------------------------------------------ turrets

export interface TurretArt {
  base: Cv; // ring + housing
  barrel: Cv; // barrels (drawn with recoil offset)
  w: number;
  h: number;
  px: number; // pivot x within sprite
  py: number; // pivot y
  tipY: number; // barrel tip y (relative to pivot, negative = forward for facing N)
}

export function turretArt(kind: "heavy" | "light", faction: "orc" | "elf", facing: 0 | 2): TurretArt {
  const k = `${kind}:${faction}:${facing}`;
  const base = cached(`tb:${k}`, () => drawTurretBase(kind, faction, facing));
  const barrel = cached(`tr:${k}`, () => drawTurretBarrel(kind, faction, facing));
  if (kind === "heavy") {
    return { base, barrel, w: 30, h: 34, px: 15, py: facing === 0 ? 22 : 11, tipY: -20 };
  }
  return { base, barrel, w: 18, h: 26, px: 9, py: facing === 0 ? 16 : 9, tipY: -15 };
}

function drawTurretBase(kind: "heavy" | "light", faction: "orc" | "elf", facing: 0 | 2): Cv {
  const P = FACTION[faction];
  if (kind === "heavy") {
    const [c, g] = makeCanvas(30, 34);
    const cx = 15, cy = facing === 0 ? 22 : 11;
    disc(g, cx, cy, 11.5, C.ink);
    disc(g, cx, cy, 10.5, P.trim0);
    ring(g, cx, cy, 10.5, P.trim1);
    disc(g, cx, cy, 8.5, C.ink);
    // housing box
    const hy = cy - 7;
    bevel(g, cx - 9, hy, 18, 15, P.hull2, P.hull4, P.hull1, C.ink);
    rect(g, cx - 7, hy + 3, 14, 1, P.hull1);
    // glowing breech slit at the rear
    const slitY = facing === 0 ? hy + 11 : hy + 2;
    rect(g, cx - 5, slitY, 10, 2, C.fire1);
    rect(g, cx - 3, slitY, 6, 1, C.fire3);
    // rivets
    for (const [x, y] of [[cx - 7, hy + 2], [cx + 6, hy + 2], [cx - 7, hy + 12], [cx + 6, hy + 12]]) px(g, x, y, P.hull4);
    // orc tusks on housing
    if (faction === "orc") {
      const ty = facing === 0 ? hy + 1 : hy + 13;
      px(g, cx - 10, ty, C.bone); px(g, cx - 11, ty + (facing === 0 ? -1 : 1), C.bone);
      px(g, cx + 9, ty, C.bone); px(g, cx + 10, ty + (facing === 0 ? -1 : 1), C.bone);
    }
    return c;
  }
  const [c, g] = makeCanvas(18, 26);
  const cx = 9, cy = facing === 0 ? 16 : 9;
  disc(g, cx, cy, 7.5, C.ink);
  disc(g, cx, cy, 6.5, P.trim1);
  ring(g, cx, cy, 6.5, P.trim2);
  // leaf housing
  ellipse(g, cx, cy, 5, 6, C.ink);
  ellipse(g, cx, cy, 4, 5, P.hull3);
  rect(g, cx - 3, cy - 3, 2, 3, P.hull4);
  px(g, cx + 2, cy + 3, P.hull1);
  px(g, cx, cy, C.ice);
  // side fins
  for (const s of [-1, 1]) {
    const fx = cx + s * 6;
    rect(g, s < 0 ? fx - 1 : fx, cy - 2, 2, 4, C.ink);
    px(g, s < 0 ? fx : fx, cy - 1, P.trim2);
  }
  return c;
}

function drawTurretBarrel(kind: "heavy" | "light", faction: "orc" | "elf", facing: 0 | 2): Cv {
  const P = FACTION[faction];
  if (kind === "heavy") {
    const [c, g] = makeCanvas(30, 34);
    const cy = facing === 0 ? 22 : 11;
    const len = 19;
    for (const bx of [10, 16]) {
      // barrel from housing front to tip
      const y0 = facing === 0 ? cy - 6 - len : cy + 6;
      rect(g, bx - 1, y0, 5, len + 1, C.ink);
      rect(g, bx, y0, 3, len + 1, P.trim1);
      vline(g, bx, y0, len + 1, P.trim2);
      vline(g, bx + 2, y0, len + 1, P.trim0);
      // muzzle brake
      const my = facing === 0 ? y0 - 1 : y0 + len - 2;
      rect(g, bx - 2, my, 7, 4, C.ink);
      rect(g, bx - 1, my + 1, 5, 2, P.trim2);
      px(g, bx, my + 1, C.white);
      // band
      const band = facing === 0 ? y0 + 8 : y0 + len - 9;
      rect(g, bx, band, 3, 1, faction === "orc" ? C.maroon : P.trim2);
    }
    return c;
  }
  const [c, g] = makeCanvas(18, 26);
  const cy = facing === 0 ? 16 : 9;
  const len = 13;
  const y0 = facing === 0 ? cy - 4 - len : cy + 4;
  rect(g, 7, y0, 4, len + 1, C.ink);
  rect(g, 8, y0, 2, len + 1, P.trim1);
  vline(g, 8, y0, len + 1, P.trim2);
  const ty = facing === 0 ? y0 - 1 : y0 + len - 1;
  rect(g, 7, ty, 4, 3, C.ink);
  rect(g, 8, ty + 1, 2, 1, C.ice);
  return c;
}

// ------------------------------------------------------------------ factories

export function factorySprite(id: string, frameIdx: number, flash: boolean): Cv {
  const f = ((frameIdx % 8) + 8) % 8;
  return cached(`fac:${id}:${f}:${flash ? 1 : 0}`, () => {
    if (id === "kiln") return drawKiln(f, flash);
    if (id === "loom") return drawLoom(f, flash);
    return drawPress(f, flash);
  });
}

function drawKiln(f: number, flash: boolean): Cv {
  const [c, g] = makeCanvas(24, 24);
  const P = FACTION.orc;
  // base plinth
  bevel(g, 1, 2, 22, 21, P.trim0, P.trim1, C.ink, C.ink);
  // kiln dome
  disc(g, 12, 13, 9.6, C.ink);
  disc(g, 12, 13, 8.6, P.hull2);
  // light crescent top-left
  for (let y = 5; y < 20; y++) {
    for (let x = 4; x < 20; x++) {
      const dx = x + 0.5 - 12, dy = y + 0.5 - 13;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 8.6 && d > 6.2 && dx + dy < -4) px(g, x, y, P.hull3);
      if (d < 8.6 && d > 7.2 && dx + dy < -8) px(g, x, y, P.hull4);
      if (d < 8.6 && d > 6.8 && dx + dy > 6) px(g, x, y, P.hull1);
    }
  }
  // iron band
  ring(g, 12, 13, 6.2, C.ink);
  // fire mouth
  const glowOuter = flash ? C.fire3 : C.fire1;
  const glowMid = flash ? C.fire4 : f % 2 ? C.fire2 : C.fire3;
  const glowCore = flash ? C.fire5 : f % 3 === 0 ? C.fire4 : C.fire3;
  disc(g, 12, 13, 5.2, C.fire0);
  disc(g, 12, 13, 4.2, glowOuter);
  disc(g, 12, 13.5, 3, glowMid);
  disc(g, 12 + ((f >> 1) % 2 ? 0.5 : -0.5), 14, 1.6, glowCore);
  // grate bars over the mouth
  for (const x of [10, 14]) vline(g, x, 9, 9, C.ink);
  // chimney at the back-right
  bevel(g, 16, 0, 7, 7, P.trim1, P.trim2, P.trim0, C.ink);
  rect(g, 18, 2, 3, 3, C.ink);
  px(g, 19, 3, flash ? C.fire3 : C.fire0);
  // spikes
  for (const [x, y] of [[0, 21], [23, 21], [0, 2]]) {
    px(g, x, y, C.steel3);
  }
  if (flash) {
    for (const [x, y] of [[6, 7], [18, 9], [7, 18], [17, 18]]) px(g, x, y, C.fire4);
  }
  return c;
}

function drawLoom(f: number, flash: boolean): Cv {
  const [c, g] = makeCanvas(24, 24);
  const P = FACTION.elf;
  bevel(g, 0, 0, 24, 24, P.hull1, P.hull3, P.hull0, C.ink);
  rect(g, 3, 3, 18, 18, P.hull0);
  // beams
  bevel(g, 2, 3, 20, 3, P.trim1, P.trim2, P.trim0);
  bevel(g, 2, 18, 20, 3, P.trim1, P.trim2, P.trim0);
  // warp threads
  const cols = [C.ice, C.white, C.cyan, C.white, C.ice];
  [5, 8, 11, 14, 17].forEach((x, i) => {
    vline(g, x + 1, 6, 12, flash ? C.white : cols[i]);
    if (!flash && (i + f) % 3 === 0) px(g, x + 1, 6 + ((f * 3 + i * 5) % 12), C.cyan);
  });
  // shuttle ping-pong
  const t = f < 4 ? f : 8 - f;
  const sx = 3 + t * 3.5;
  bevel(g, sx, 10, 6, 4, P.trim2, C.brass4, P.trim0, C.ink);
  // corner posts
  for (const [x, y] of [[0, 0], [20, 0], [0, 20], [20, 20]]) bevel(g, x, y, 4, 4, P.trim1, P.trim2, P.trim0, C.ink);
  // leaf ornament
  px(g, 11, 1, P.hull4); px(g, 12, 1, P.hull4); px(g, 12, 0, P.hull3);
  if (flash) {
    frame(g, 1, 1, 22, 22, C.ice);
  }
  return c;
}

function drawPress(f: number, flash: boolean): Cv {
  const [c, g] = makeCanvas(24, 24);
  rect(g, 0, 0, 24, 24, C.ink);
  // hazard border
  for (let i = 0; i < 22; i++) {
    for (let j = 0; j < 22; j++) {
      const border = i < 2 || j < 2 || i > 19 || j > 19;
      if (!border) continue;
      px(g, 1 + i, 1 + j, ((i + j) >> 1) % 2 ? C.yellow : C.ink);
    }
  }
  bevel(g, 3, 3, 18, 18, C.steel1, C.steel2, C.steel0, C.ink);
  // piston head: pressed on stamp frames
  const pressed = flash || f % 8 === 0;
  if (pressed) {
    bevel(g, 8, 8, 8, 8, C.steel0, C.steel1, C.ink, C.ink);
  } else {
    bevel(g, 6, 6, 12, 12, C.steel2, C.steel3, C.steel0, C.ink);
    rect(g, 9, 9, 6, 6, C.steel1);
    px(g, 9, 9, C.white);
  }
  for (const [x, y] of [[4, 4], [19, 4], [4, 19], [19, 19]]) px(g, x, y, C.steel3);
  return c;
}

export function factoryFlashSil(id: string): Cv {
  return cached(`facS:${id}`, () => silhouette(factorySprite(id, 0, false), C.white));
}

// ------------------------------------------------------------------ gates

export function gateSprite(id: string, frameIdx: number, active: boolean): Cv {
  const f = ((frameIdx % 8) + 8) % 8;
  return cached(`gate:${id}:${f}:${active ? 1 : 0}`, () => {
    const [c, g] = makeCanvas(12, 12);
    drawGate(g, id, f, active);
    return c;
  });
}

export function gateSil(id: string): Cv {
  return cached(`gateS:${id}`, () => silhouette(gateSprite(id, 0, false), C.white));
}

function drawGate(g: G, id: string, f: number, active: boolean): void {
  switch (id) {
    case "temper": {
      bevel(g, 1, 1, 10, 10, C.rust1, C.rust3, C.rust0, C.ink);
      const heat = [C.fire1, C.fire2, C.fire3];
      [3, 5, 7].forEach((y, i) => {
        const col = active ? C.fire4 : heat[(i + f) % 3];
        hline(g, 3, y + 1, 6, C.ink);
        hline(g, 3, y, 6, col);
      });
      px(g, 2, 2, C.rust4);
      if (active) { px(g, 5, 0, C.fire3); px(g, 6, 0, C.fire4); }
      break;
    }
    case "grease": {
      bevel(g, 1, 1, 10, 10, C.oil1, C.oil2, C.oil0, C.ink);
      disc(g, 6, 6, 3.6, C.ink);
      disc(g, 6, 6, 2.8, C.oil2);
      ring(g, 6, 6, 2.8, C.yellow);
      px(g, 5, 5, C.lime);
      // nozzles + drip
      px(g, 3, 2, C.steel3); px(g, 8, 2, C.steel3);
      const dy = 2 + (f % 4);
      px(g, 8, Math.min(9, dy + 1), active ? C.lime : C.green);
      break;
    }
    case "brake": {
      bevel(g, 1, 1, 10, 10, C.steel1, C.steel3, C.steel0, C.ink);
      rect(g, 4, 2, 4, 8, C.belt1);
      const squeeze = active ? 1 : 0;
      rect(g, 2 + squeeze, 3, 2, 6, C.red);
      vline(g, 2 + squeeze, 3, 6, C.white);
      rect(g, 8 - squeeze, 3, 2, 6, C.red);
      vline(g, 9 - squeeze, 3, 6, C.maroon);
      px(g, 9, 2, C.white);
      break;
    }
    case "whetstone": {
      bevel(g, 1, 1, 10, 10, C.wood1, C.wood3, C.wood0, C.ink);
      disc(g, 6, 6, 3.8, C.ink);
      disc(g, 6, 6, 3, C.steel2);
      px(g, 5, 4, C.steel3); px(g, 4, 5, C.steel3);
      const a = (f / 8) * Math.PI * 2;
      px(g, Math.round(6 + Math.cos(a) * 2 - 0.5), Math.round(6 + Math.sin(a) * 2 - 0.5), C.steel0);
      if (active) { px(g, 10, 3, C.yellow); px(g, 11, 2, C.fire4); px(g, 10, 1, C.yellow); }
      break;
    }
    case "longhaul": {
      bevel(g, 1, 1, 10, 10, C.brass1, C.brass3, C.brass0, C.ink);
      disc(g, 6, 6, 3.6, C.ink);
      disc(g, 6, 6, 2.8, C.bone);
      const a = (f / 8) * Math.PI * 2 - Math.PI / 2;
      line(g, 6, 6, 6 + Math.cos(a) * 2.4, 6 + Math.sin(a) * 2.4, C.red);
      px(g, 6, 6, C.ink);
      if (active) px(g, 2, 2, C.brass4);
      break;
    }
    case "coil": {
      bevel(g, 1, 1, 10, 10, C.cop0, C.cop2, C.ink, C.ink);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        px(g, Math.round(6 + Math.cos(a) * 3.4 - 0.5), Math.round(6 + Math.sin(a) * 3.4 - 0.5), k % 2 ? C.cop3 : C.cop1);
      }
      disc(g, 6, 6, 1.6, active ? C.white : C.blue);
      px(g, 5, 5, C.ice);
      // arcs
      const arcs = [[1, 1], [10, 2], [9, 10], [2, 9]];
      const [ax, ay] = arcs[f % 4];
      px(g, ax, ay, active ? C.white : C.ice);
      if (active) { px(g, 0, 5, C.ice); px(g, 11, 6, C.ice); }
      break;
    }
    case "splitter": {
      bevel(g, 1, 1, 10, 10, C.steel1, C.steel3, C.steel0, C.ink);
      const col = active ? C.white : C.cyan;
      vline(g, 6, 6, 4, col); vline(g, 5, 6, 4, col);
      line(g, 5, 6, 3, 3, col); line(g, 6, 6, 8, 3, col);
      px(g, 3, 2, col); px(g, 8, 2, col);
      break;
    }
    case "overdrive": {
      bevel(g, 1, 1, 10, 10, C.brass2, C.brass4, C.brass0, C.ink);
      for (let k = 0; k < 3; k++) {
        const x = 2 + ((k * 3 + f) % 8);
        if (x > 8) continue;
        line(g, x, 3, x + 2, 6, active ? C.white : C.fire3);
        line(g, x + 2, 6, x, 9, active ? C.white : C.fire3);
      }
      const sp = [[1, 1], [10, 1], [10, 10], [1, 10]][f % 4];
      px(g, sp[0], sp[1], C.white);
      break;
    }
    default: {
      bevel(g, 1, 1, 10, 10, C.steel1, C.steel2, C.steel0, C.ink);
    }
  }
}

// ------------------------------------------------------------------ item icons (12x12)

export function itemIcon(id: string): Cv {
  return cached(`icon:${id}`, () => {
    const [c, g] = makeCanvas(12, 12);
    switch (id) {
      case "kiln": {
        disc(g, 6, 6.5, 5.6, C.ink);
        disc(g, 6, 6.5, 4.6, C.rust2);
        px(g, 3, 3, C.rust4); px(g, 4, 2, C.rust3); px(g, 2, 4, C.rust3);
        disc(g, 6, 7, 2.6, C.fire1);
        disc(g, 6, 7, 1.6, C.fire3);
        px(g, 6, 7, C.fire4);
        rect(g, 8, 0, 4, 4, C.ink); rect(g, 9, 1, 2, 2, C.steel1);
        break;
      }
      case "loom": {
        bevel(g, 0, 0, 12, 12, C.verd1, C.verd3, C.verd0, C.ink);
        hline(g, 1, 2, 10, C.brass2); hline(g, 1, 9, 10, C.brass2);
        for (const x of [3, 5, 7, 9]) vline(g, x, 3, 6, x % 4 === 1 ? C.white : C.ice);
        bevel(g, 4, 5, 4, 2, C.brass3, C.brass4, C.brass1);
        break;
      }
      case "press": {
        rect(g, 0, 0, 12, 12, C.ink);
        for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
          if (i > 0 && j > 0 && i < 9 && j < 9) continue;
          px(g, 1 + i, 1 + j, ((i + j) >> 1) % 2 ? C.yellow : C.ink);
        }
        bevel(g, 2, 2, 8, 8, C.steel1, C.steel3, C.steel0, C.ink);
        rect(g, 4, 4, 4, 4, C.steel2);
        px(g, 4, 4, C.white);
        break;
      }
      case "chamber": {
        // shell with plus
        rect(g, 3, 1, 5, 10, C.ink);
        rect(g, 4, 5, 3, 5, C.brass2);
        vline(g, 4, 5, 5, C.brass4);
        rect(g, 4, 2, 3, 3, C.rust3);
        px(g, 4, 2, C.rust4);
        hline(g, 3, 10, 5, C.brass0);
        rect(g, 8, 1, 3, 1, C.green); rect(g, 9, 0, 1, 3, C.green);
        break;
      }
      case "calibrate": {
        ring(g, 6, 6, 5, C.ink);
        ring(g, 6, 6, 4, C.cyan);
        vline(g, 6, 0, 4, C.cyan); vline(g, 6, 8, 4, C.cyan);
        hline(g, 0, 6, 4, C.cyan); hline(g, 8, 6, 4, C.cyan);
        px(g, 6, 6, C.white); px(g, 5, 5, C.ice);
        break;
      }
      case "beltcrate": {
        bevel(g, 0, 3, 12, 9, C.wood2, C.wood3, C.wood1, C.ink);
        hline(g, 1, 7, 10, C.wood1);
        vline(g, 3, 4, 7, C.wood1); vline(g, 8, 4, 7, C.wood1);
        disc(g, 6, 3, 3.5, C.ink);
        disc(g, 6, 3, 2.5, C.belt2);
        ring(g, 6, 3, 2.5, C.belt3);
        px(g, 6, 3, C.steel3);
        break;
      }
      case "plating": {
        bevel(g, 1, 1, 10, 10, C.steel2, C.steel3, C.steel0, C.ink);
        for (const [x, y] of [[3, 3], [8, 3], [3, 8], [8, 8]]) px(g, x, y, C.steel0);
        rect(g, 5, 4, 2, 4, C.cyan);
        px(g, 4, 5, C.cyan); px(g, 7, 5, C.cyan);
        break;
      }
      default: {
        g.drawImage(gateSprite(id, 0, false), 0, 0);
      }
    }
    return c;
  });
}

// ------------------------------------------------------------------ ammo & projectiles

const HEAT: [string, string, string, string][] = [
  // [outline, hi, body, dark]
  [C.ink, C.steel2, C.steel1, C.steel0],
  [C.ink, C.rust4, C.rust3, C.rust1],
  [C.ink, C.fire3, C.fire2, C.fire1],
  [C.fire0, C.fire4, C.fire3, C.fire2],
  [C.fire1, C.fire5, C.fire4, C.fire3],
];

export function heatTier(dmg: number): number {
  if (dmg < 6) return 0;
  if (dmg < 9) return 1;
  if (dmg < 13) return 2;
  if (dmg < 18) return 3;
  return 4;
}

export function ammoSprite(kind: string, tier: number): Cv {
  return cached(`ammo:${kind}:${tier}`, () => {
    if (kind === "thread") {
      return fromRows([".nnn.", "kiwik", "kwiwk", "kiwik", ".nnn."], {
        n: C.brass3, k: C.ink, i: C.ice, w: C.white,
      });
    }
    if (kind === "plain") {
      return fromRows([".kkk.", "kSsdk", "kssdk", "kddkk", ".kk.."].map((r) => r), {
        k: C.ink, S: C.steel3, s: C.steel2, d: C.steel1,
      });
    }
    const [o, h, b, d] = HEAT[Math.max(0, Math.min(4, tier))];
    return fromRows([".ooo.", "ohbbo", "obbbo", "obbdo", ".ooo."], { o, h, b, d });
  });
}

export function shellSprite(kind: string, tier: number, facing: 0 | 2): Cv {
  return cached(`shell:${kind}:${tier}:${facing}`, () => {
    if (kind === "thread") {
      const s = fromRows(["..w..", ".wiw.", ".iwi.", ".ici.", "..c..", "..c..", "..b.."], {
        w: C.white, i: C.ice, c: C.cyan, b: C.blue,
      });
      return facing === 0 ? s : flipY(s);
    }
    const [o, h, b, d] = kind === "plain" ? [C.ink, C.steel3, C.steel2, C.steel0] : HEAT[Math.max(0, Math.min(4, tier))];
    const s = fromRows(["..o..", ".ohbo", "ohbbo", "obbdo", "obbdo", ".odo.", "..o.."].map((r) => r.padEnd(5, ".")), {
      o, h, b, d,
    });
    return facing === 0 ? s : flipY(s);
  });
}

export function shadowBlob(w: number): Cv {
  return cached(`shadow:${w}`, () => {
    const [c, g] = makeCanvas(w, 3);
    ellipse(g, w / 2, 1.5, w / 2, 1.5, C.ink);
    return c;
  });
}

// ------------------------------------------------------------------ effects

export function muzzleFlash(kind: "heavy" | "light", f: number, facing: 0 | 2): Cv {
  return cached(`mf:${kind}:${f}:${facing}`, () => {
    const big = kind === "heavy";
    const [c, g] = makeCanvas(big ? 14 : 8, big ? 14 : 8);
    const cx = big ? 7 : 4, cy = big ? 8 : 5;
    const r = big ? [6, 4.5, 3][f] ?? 2 : [3.5, 2.2][f] ?? 1.5;
    const cols = big ? [C.fire3, C.fire4, C.fire5] : [C.cyan, C.ice, C.white];
    disc(g, cx, cy, r, cols[0]);
    disc(g, cx, cy, r * 0.66, cols[1]);
    disc(g, cx, cy, r * 0.33, cols[2]);
    if (big && f === 0) {
      vline(g, cx, 0, 4, C.fire4);
      hline(g, 0, cy, 3, C.fire3);
      hline(g, 11, cy, 3, C.fire3);
    }
    return facing === 0 ? c : flipY(c);
  });
}

/** Explosion frames: size in px, 7 frames. */
export function explosion(size: number, f: number, cool = false): Cv {
  return cached(`ex:${size}:${f}:${cool ? 1 : 0}`, () => {
    const [c, g] = makeCanvas(size, size);
    const cx = size / 2, cy = size / 2;
    const R = size / 2 - 1;
    const hot = cool ? [C.blue, C.ice, C.white, C.white] : [C.fire1, C.fire2, C.fire3, C.fire4];
    const noise = (x: number, y: number) => cellNoise(x, y, size * 31 + f);
    const blob = (r: number, col: string, holes = 0) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          const d = Math.sqrt(dx * dx + dy * dy) + (noise(x, y) - 0.5) * 2.2;
          if (d <= r && noise(x + 7, y + 3) >= holes) px(g, x, y, col);
        }
      }
    };
    switch (f) {
      case 0:
        blob(R * 0.35, C.fire5);
        break;
      case 1:
        blob(R * 0.7, hot[2]);
        blob(R * 0.45, hot[3]);
        blob(R * 0.2, C.fire5);
        break;
      case 2:
        blob(R * 0.95, hot[1]);
        blob(R * 0.7, hot[2]);
        blob(R * 0.4, hot[3]);
        break;
      case 3:
        blob(R, hot[0]);
        blob(R * 0.8, hot[1], 0.15);
        blob(R * 0.45, hot[2], 0.3);
        break;
      case 4:
        blob(R, C.slate2, 0.25);
        blob(R * 0.75, hot[0], 0.45);
        blob(R * 0.4, hot[1], 0.6);
        break;
      case 5:
        blob(R, C.slate1, 0.45);
        blob(R * 0.6, C.slate2, 0.55);
        break;
      default:
        blob(R * 0.9, C.slate1, 0.75);
    }
    return c;
  });
}

export function smokePuff(r: number, dark: boolean): Cv {
  return cached(`smoke:${r}:${dark ? 1 : 0}`, () => {
    const s = Math.ceil(r * 2 + 2);
    const [c, g] = makeCanvas(s, s);
    disc(g, s / 2, s / 2, r, dark ? C.slate0 : C.slate3);
    disc(g, s / 2 - r * 0.25, s / 2 - r * 0.25, r * 0.55, dark ? C.slate1 : C.slate4);
    return c;
  });
}

export function sparkStar(f: number): Cv {
  return cached(`spark:${f}`, () => {
    const [c, g] = makeCanvas(7, 7);
    const cols = [C.white, C.ice, C.cyan];
    const col = cols[Math.min(2, f)];
    if (f === 0) {
      vline(g, 3, 0, 7, col); hline(g, 0, 3, 7, col);
    } else if (f === 1) {
      px(g, 1, 1, col); px(g, 5, 1, col); px(g, 1, 5, col); px(g, 5, 5, col); px(g, 3, 3, C.white);
    } else {
      px(g, 0, 3, col); px(g, 6, 3, col); px(g, 3, 0, col); px(g, 3, 6, col);
    }
    return c;
  });
}

// ------------------------------------------------------------------ merchant wagons

export const WAGON_W = 64;
export const WAGON_H = 26;
export const WAGON_SLOT_X = 18; // first item slot (wagon-local)
export const WAGON_SLOT_STEP = 13;

const WAGON_COLORS: Record<string, [string, string]> = {
  ironmonger: [C.steel2, C.red],
  tinker: [C.cyan, C.bone],
  alchemist: [C.plum4, C.bone],
  gunsmith: [C.red, C.ink],
};

/** Wagon body; `open` 0..1 rolls the canvas roof back to reveal the bed. */
export function wagonSprite(merchant: string, open: number, wheel: number): Cv {
  const o = Math.round(Math.max(0, Math.min(1, open)) * 4);
  const wf = ((wheel % 2) + 2) % 2;
  return cached(`wagon:${merchant}:${o}:${wf}`, () => {
    const [c, g] = makeCanvas(WAGON_W, WAGON_H);
    const [stripeA, stripeB] = WAGON_COLORS[merchant] ?? [C.bone, C.red];
    // wheels (top and bottom edges)
    for (const x of [18, 50]) {
      for (const y of [0, WAGON_H - 4]) {
        rect(g, x - 1, y, 9, 4, C.ink);
        rect(g, x, y + 1, 7, 2, C.steel0);
        for (let k = 0; k < 3; k++) px(g, x + 1 + k * 2 + wf, y + 1 + (k % 2), C.steel2);
      }
    }
    // tractor cab (left)
    bevel(g, 1, 5, 13, 16, C.steel1, C.steel2, C.steel0, C.ink);
    rect(g, 3, 8, 6, 10, C.slate1);
    rect(g, 4, 9, 4, 3, C.ice); // windscreen from above
    px(g, 4, 9, C.white);
    rect(g, 10, 7, 3, 3, C.ink); // stack
    px(g, 11, 8, C.steel2);
    rect(g, 0, 8, 2, 2, C.yellow); // lamps
    rect(g, 0, 16, 2, 2, C.yellow);
    // hitch
    rect(g, 14, 12, 3, 2, C.ink);
    // bed
    bevel(g, 16, 3, 48, 20, C.wood2, C.wood3, C.wood1, C.ink);
    for (let x = 20; x < 63; x += 7) vline(g, x, 4, 18, C.wood1);
    rect(g, 17, 4, 46, 1, C.wood4);
    // roof canvas: covers bed from the right; rolls back to a bundle at the right edge
    const cover = [46, 35, 24, 13, 5][o];
    if (cover > 0) {
      const x0 = 63 - cover;
      rect(g, x0 - 1, 2, cover + 2, 22, C.ink);
      for (let x = 0; x < cover; x++) {
        const col = Math.floor((x0 + x) / 4) % 2 ? stripeA : stripeB;
        rect(g, x0 + x, 3, 1, 20, col);
      }
      hline(g, x0, 3, cover, C.white);
      hline(g, x0, 22, cover, C.ink);
      if (o > 0) vline(g, x0, 3, 20, C.ink); // rolled edge
    }
    return c;
  });
}

// ------------------------------------------------------------------ small UI icons

export function coinIcon(): Cv {
  return cached("coin", () => fromRows([".kkk.", "kyYyk", "kYyYk", "kyYdk", ".kkk."], {
    k: C.ink, y: C.yellow, Y: C.fire4, d: C.amber,
  }));
}

export function heartIcon(full: boolean): Cv {
  return cached(`heart:${full ? 1 : 0}`, () => fromRows([".k.k.", "krkrk", "krrrk", ".krk.", "..k.."].map((r) => r), {
    k: C.ink, r: full ? C.red : C.slate1,
  }));
}

export function beltIcon(): Cv {
  return cached("belticon", () => fromRows(["kkkkkkk", "sLbLbLs", "kkkkkkk"], {
    k: C.ink, s: C.steel2, L: C.belt3, b: C.belt1,
  }));
}

export function wrenchIcon(): Cv {
  return cached("wrench", () => fromRows([".ww..", "w.w..", ".www.", "...ww", "....w"], { w: C.bone }));
}

export function boltIcon(): Cv {
  return cached("bolt", () => fromRows(["..i", ".i.", "iii", ".i.", "i.."], { i: C.ice }));
}

/** Big metallic title word rendered from the 5x7 face. */
export function titleArt(text: string, drawText: (g: G, s: string, x: number, y: number, c: string) => void, measure: (s: string) => number): Cv {
  return cached(`title:${text}`, () => {
    const w = measure(text);
    const [base, bg] = makeCanvas(w, 7);
    drawText(bg, text, 0, 0, C.white);
    // vertical metal ramp per row
    const ramp = [C.white, C.fire4, C.fire3, C.amber, C.fire2, C.fire1, C.fire0];
    // Paint the ramp first, then keep it only where the glyphs are. (A per-row
    // "source-in" fill would clear every other row: it composites the whole canvas.)
    const [col, cg] = makeCanvas(w, 7);
    ramp.forEach((c, y) => rect(cg, 0, y, w, 1, c));
    cg.globalCompositeOperation = "destination-in";
    cg.drawImage(base, 0, 0);
    cg.globalCompositeOperation = "source-over";
    const S = 3;
    const [big, gg] = makeCanvas(w * S, 7 * S);
    gg.drawImage(col, 0, 0, w, 7, 0, 0, w * S, 7 * S);
    // inner bevel: 1px highlight per glyph row top
    const out = outlined(outlined(big, C.ink, true), C.maroon, false);
    return out;
  });
}

export { dither };
