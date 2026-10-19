// Procedural pixel-art sprite library for deck machinery (belts, factories, gates), item
// icons, explosions and small UI icons. Hulls, turrets, ammunition and muzzle flashes live
// in hull.ts, turret.ts, ammo.ts and fxsprites.ts. Everything is cached after first draw.

import { cellNoise } from "../core/rng";
import { C, FACTION } from "./palette";
import { drawCoreIcon } from "./coreArt"; // 0.6.1b
import { drawTurretIcon } from "./turretIcon"; // 0.6.2s (REQ-BFG-031)
import { drawFactoryArt, drawFactoryIcon } from "./factoryArt"; // 0.6.1c: the wave-1 factories
import { raceFactoryArt } from "./raceArt"; // 0.8.0 H1: CRUCIBLE and WARDWORKS
import { drawWave3Gate, drawWave3Icon, wave3FactoryArt } from "./wave3Art"; // 0.8.0 A1: wave 3's 15 modules
import { drawPlainGate } from "./plainArt"; // PLAIN-1 (REQ-BFG-084): the six plain stat rigs
import { drawShapes2Gate } from "./shapes2Art"; // SHAPES-2 (REQ-BFG-114): the six more shaped rigs' icons
import { drawScaleGate } from "./scaleArt"; // ART-1E (REQ-BFG-098): the seven new scaling rigs' own art
import { beltStyle, type BeltId } from "./styles"; // CUSTOM-1 (REQ-BFG-072) hook: belt styles
import {
  bevel, disc, flipX, flipY, frame, fromRows, hline, line, makeCanvas, outlined,
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

/**
 * 0.6.2 BELTSIDE (V1): a belt tile's speed state, shown by the tint of its moving chevrons: "n" normal
 * (1.0x, neutral grey-brown), "f" fast (above 1x, yellow), "o" OVERDRIVE (3x and up, hot red-orange), "s"
 * slow (below 1x, cold blue: BRAKE SHOE, and the SIPHON's Drag).
 */
export type BeltTint = "n" | "f" | "o" | "s";

export function speedTint(speed: number): BeltTint {
  if (speed < 0.999) return "s";
  if (speed >= 3 - 1e-6) return "o";
  if (speed > 1.001) return "f";
  return "n";
}

/** Chevron ramp [trough, mid, crest] per speed state. */
const TINT: Record<BeltTint, [string, string, string]> = {
  n: [C.belt1, C.soil4, C.soil5],
  f: [C.belt1, C.brass1, C.yellow],
  o: [C.fire0, C.fire1, C.fire3],
  s: [C.belt1, C.deepblue, C.ice],
};

function railColors(v: BeltVariant, style: BeltId = "iron"): [string, string, string, string] {
  // [hi, mid, lo2, lo]
  if (v === "warn") return [C.yellow, C.amber, C.fire1, C.fire0];
  if (v === "dead") return [C.steel1, C.steel0, C.maroon, C.rust0];
  if (style !== "iron") return beltStyle(style).rails; // CUSTOM-1 (REQ-BFG-072) hook: a belt style's rails
  return [C.steel3, C.steel1, C.steel2, C.steel0];
}

/** CUSTOM-1 hook: the chevron ramp. A style restyles the bed and the normal-speed chevrons only; the fast, OVERDRIVE
 *  and slow tints (and the warn and dead rails) keep their colours, which carry the belt's state. */
function tintRamp(tint: BeltTint, style: BeltId): [string, string, string] {
  if (style === "iron") return TINT[tint];
  const s = beltStyle(style);
  return tint === "n" ? [s.bed, s.chev[0], s.chev[1]] : tint === "o" ? TINT.o : [s.bed, TINT[tint][1], TINT[tint][2]];
}

function beltN(frameIdx: number, v: BeltVariant, tint: BeltTint, style: BeltId = "iron"): Cv {
  return cached(style === "iron" ? `beltN:${frameIdx}:${v}:${tint}` : `beltN:${frameIdx}:${v}:${tint}:${style}`, () => {
    const [c, g] = makeCanvas(12, 12);
    const [hi, mid, mid2, lo] = railColors(v, style);
    const [trough, cm, crest] = tintRamp(tint, style);
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
        else col = m === 0 ? crest : m === 1 ? cm : trough;
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

/** Straight belt flowing toward screen dir d (0=N,1=E,2=S,3=W), its chevrons tinted by speed state. */
export function beltStraight(d: number, frameIdx: number, v: BeltVariant = "normal", tint: BeltTint = "n", style: BeltId = "iron"): Cv {
  const f = ((frameIdx % BELT_PERIOD) + BELT_PERIOD) % BELT_PERIOD;
  return cached(style === "iron" ? `beltS:${d}:${f}:${v}:${tint}` : `beltS:${d}:${f}:${v}:${tint}:${style}`, () => {
    const n = beltN(f, v, tint, style);
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
export function beltCorner(a: number, b: number, frameIdx: number, v: BeltVariant = "normal", tint: BeltTint = "n", style: BeltId = "iron"): Cv {
  const f = ((frameIdx % BELT_PERIOD) + BELT_PERIOD) % BELT_PERIOD;
  return cached(style === "iron" ? `beltC:${a}:${b}:${f}:${v}:${tint}` : `beltC:${a}:${b}:${f}:${v}:${tint}:${style}`, () => {
    const [c, g] = makeCanvas(12, 12);
    // housing plate
    const [hi, mid, , lo] = railColors(v, style);
    bevel(g, 0, 0, 12, 12, mid, hi, lo, C.ink);
    const inFlow = (a + 2) % 4; // moving away from side a
    const partA = beltStraight(inFlow, f, v, tint, style);
    const partB = beltStraight(b, f, v, tint, style);
    const [ax, ay, aw, ah] = HALF_CLIP[a];
    const [bx, by, bw, bh] = HALF_CLIP[b];
    g.drawImage(partA, ax, ay, aw, ah, ax, ay, aw, ah);
    g.drawImage(partB, bx, by, bw, bh, bx, by, bw, bh);
    return c;
  });
}

/** Turntable disc for corner belts; `angle` 0..7 (rotation step). */
export function turntable(angle: number, v: BeltVariant = "normal", style: BeltId = "iron"): Cv {
  const a = ((angle % 8) + 8) % 8;
  return cached(style === "iron" ? `tt:${a}:${v}` : `tt:${a}:${v}:${style}`, () => {
    const [c, g] = makeCanvas(12, 12);
    const [hi, mid, , lo] = railColors(v, style);
    disc(g, 6, 6, 4.6, C.ink);
    disc(g, 6, 6, 3.8, mid);
    // top-left light
    px(g, 4, 3, hi); px(g, 3, 4, hi); px(g, 5, 3, hi); px(g, 3, 5, hi);
    px(g, 8, 9, lo); px(g, 9, 8, lo); px(g, 7, 9, lo); px(g, 9, 7, lo);
    // hub
    rect(g, 5, 5, 2, 2, C.steel0);
    px(g, 5, 5, style === "iron" ? C.steel3 : beltStyle(style).hub);
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

// ------------------------------------------------------------------ factories

/** 0.6.1c: a placed factory's star level for its art, 1..3 (absent or bad = 1). */
function starLevel(stars: number): number {
  return Number.isFinite(stars) ? Math.min(3, Math.max(1, Math.floor(stars))) : 1;
}

/** A 24x24 factory at frame `frameIdx` (mod 8). 0.6.1c: `stars` (default 1; only GANTRY PRESS's art reads it:
 *  two chutes at 1 star, three at 2-3); a 1-star key is the same as before, other levels get their own. */
export function factorySprite(id: string, frameIdx: number, flash: boolean, stars = 1): Cv {
  const f = ((frameIdx % 8) + 8) % 8;
  const s = starLevel(stars);
  return cached(`fac:${id}:${f}:${flash ? 1 : 0}${s > 1 ? `:${s}` : ""}`, () => {
    if (id === "kiln") return drawKiln(f, flash);
    if (id === "loom") return drawLoom(f, flash);
    // 0.8.0 H1: FOUNDRY's CRUCIBLE and BASTION's WARDWORKS (raceArt.ts); 0.6.1c: the wave-1 factories (factoryArt.ts);
    // 0.8.0 A1: wave 3's TWIN MOULD and ARMOR PRESS (wave3Art.ts)
    return raceFactoryArt(id, f, flash) ?? drawFactoryArt(id, f, flash, s) ?? wave3FactoryArt(id, f, flash, s) ?? drawPress(f, flash);
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

export function factoryFlashSil(id: string, stars = 1): Cv {
  const s = starLevel(stars); // 0.6.1c: as factorySprite
  return cached(`facS:${id}${s > 1 ? `:${s}` : ""}`, () => silhouette(factorySprite(id, 0, false, s), C.white));
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

// ------------------------------------------------------------------ rig arrows (0.6.2 BELTSIDE, V3)

/** An arrow's look: 0 idle (dim stub, no belt in reach), 1 live (bright, works a belt tile), 2 flash (a hit
 *  just applied), 3 held (aims at a belt, but the rig is offline: commissioning or disrupted). */
export type ArrowState = 0 | 1 | 2 | 3;

/** [fill, highlight] per arrow state. */
const ARROW_FILL: Record<ArrowState, [string, string]> = {
  0: [C.slate2, C.slate3],
  1: [C.yellow, C.fire4],
  2: [C.white, C.white],
  3: [C.slate3, C.steel2],
};

/** Orient a 12x12 art drawn for screen dir N toward screen dir d (as beltStraight does). */
function orient12(n: Cv, d: number): Cv {
  if (d === 0) return n;
  if (d === 1) return rot90(n);
  if (d === 2) return flipY(n);
  return flipX(rot90(n));
}

/** A rig's arrow nozzle on its own cell's edge, facing screen dir d: a 4-wide spout, drawn over the body. */
export function rigNozzle(d: number, st: ArrowState): Cv {
  return cached(`nozzle:${d}:${st}`, () => {
    const [f, h] = ARROW_FILL[st];
    const [c, g] = makeCanvas(12, 12);
    g.drawImage(fromRows(["....khfk....", "....kffk....", "....kssk...."], { k: C.ink, f, h, s: C.steel2 }), 0, 0);
    return orient12(c, d);
  });
}

/** The arrowhead a working arrow drives into the belt tile it hits: on that tile's edge nearest the rig, in the
 *  TILE's 12x12 frame, pointing along screen dir d. With the nozzle it reads as one arrow across the seam. */
export function rigTip(d: number, st: ArrowState): Cv {
  return cached(`tip:${d}:${st}`, () => {
    const [f, h] = ARROW_FILL[st];
    const [c, g] = makeCanvas(12, 12);
    g.drawImage(fromRows([".....kk.....", "....khfk....", "...khfffk..."], { k: C.ink, f, h }), 0, 9);
    return orient12(c, d);
  });
}

function drawGate(g: G, id: string, f: number, active: boolean): void {
  if (drawScaleGate(g, id, f, active)) return; // ART-1E
  switch (id) {
    case "venom": {
      bevel(g, 1, 1, 10, 10, C.green, C.lime, C.oil0, C.ink);
      rect(g, 4, 2, 4, 5, C.ink); rect(g, 5, 3, 2, 4, C.lime);
      px(g, 6, 8 + (f % 3), C.lime);
      break;
    }
    case "overclocker": {
      bevel(g, 1, 1, 10, 10, C.brass1, C.brass4, C.brass0, C.ink);
      disc(g, 6, 6, 3.4, C.ink); disc(g, 6, 6, 2.5, C.bone);
      const a = (f / 8) * Math.PI * 1.3 - 2;
      line(g, 6, 6, 6 + Math.cos(a) * 2, 6 + Math.sin(a) * 2, C.red);
      if (active) px(g, 9, 2, C.yellow);
      break;
    }
    case "keg": {
      bevel(g, 2, 1, 8, 10, C.ink, C.steel2, C.ink, C.ink);
      hline(g, 2, 4, 8, C.brass3); hline(g, 2, 8, 8, C.brass3);
      px(g, 6, 0, f % 2 ? C.yellow : C.fire4);
      break;
    }
    case "bellows": {
      bevel(g, 1, 1, 10, 10, C.rust1, C.rust3, C.rust0, C.ink);
      rect(g, 2, 4, 6 + (f % 2), 4, C.fire2);
      line(g, 4, 3, 7, 6, C.brass4);
      px(g, 10, 5, C.fire4);
      break;
    }
    case "quench": {
      bevel(g, 1, 1, 10, 10, C.steel1, C.steel3, C.steel0, C.ink);
      rect(g, 3, 3, 6, 7, C.ink);
      hline(g, 4, 6 + f % 2, 4, C.cyan);
      px(g, 6, 2, C.ice);
      break;
    }
    case "staticbrush": {
      bevel(g, 1, 1, 10, 10, C.cop1, C.cop3, C.cop0, C.ink);
      hline(g, 2, 5, 8, C.steel3);
      for (const x of [3, 5, 7, 9]) vline(g, x, 6, 3, C.ice);
      px(g, 2 + f % 4, 2, C.white);
      break;
    }
    case "lodestone": {
      bevel(g, 1, 1, 10, 10, C.steel1, C.steel3, C.steel0, C.ink);
      rect(g, 3, 3, 6, 6, C.ink);
      vline(g, 4, 4, 4, C.red); vline(g, 7, 4, 4, C.blue);
      hline(g, 4, 8, 4, C.brass4);
      break;
    }
    case "barbed": {
      bevel(g, 1, 1, 10, 10, C.wood1, C.wood3, C.wood0, C.ink);
      disc(g, 6, 6, 3, C.ink); disc(g, 6, 6, 2, C.steel2);
      for (const [x, y] of [[2, 6], [6, 2], [9, 6], [6, 9]]) px(g, x, y, C.white);
      break;
    }
    case "counterweight": {
      bevel(g, 1, 1, 10, 10, C.brass1, C.brass3, C.brass0, C.ink);
      hline(g, 2, 3, 8, C.steel3); vline(g, 6, 3, 5, C.ink);
      rect(g, 4, 7 + f % 2, 4, 2, C.steel2);
      break;
    }
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
    case "tollbooth": {
      bevel(g, 1, 1, 10, 10, C.brass1, C.brass4, C.brass0, C.ink);
      rect(g, 2, 4, 8, 2, C.ink); hline(g, 2, 4, 8, active ? C.white : C.red);
      for (const x of [3, 8]) vline(g, x, 6, 4, C.steel2);
      break;
    }
    case "sifter": {
      bevel(g, 1, 1, 10, 10, C.steel1, C.steel3, C.steel0, C.ink);
      for (let y = 3; y < 10; y += 2) hline(g, 2, y, 8, active ? C.white : C.cyan);
      for (let x = 3; x < 10; x += 2) vline(g, x, 2, 8, C.ink);
      break;
    }
    case "surge": {
      bevel(g, 1, 1, 10, 10, C.cop1, C.cop3, C.cop0, C.ink);
      disc(g, 6, 6, 3, C.ink); disc(g, 6, 6, 2, active ? C.white : C.fire3);
      line(g, 2, 9, 5, 5, C.yellow); line(g, 7, 7, 10, 3, C.yellow);
      break;
    }
    case "sorting": {
      bevel(g, 1, 1, 10, 10, C.steel1, C.steel3, C.steel0, C.ink);
      line(g, 3, 9, 6, 4, C.brass3); line(g, 6, 4, 9, 8, C.brass4);
      for (const x of [3, 8]) { disc(g, x, 9, 1.5, C.ink); px(g, x, 9, active ? C.white : C.ice); }
      break;
    }
    case "riveter": {
      bevel(g, 1, 1, 10, 10, C.steel1, C.steel3, C.steel0, C.ink);
      for (const x of [3, 8]) for (const y of [3, 8]) px(g, x, y, C.brass4);
      hline(g, 4, 6, 4, active ? C.white : C.red); vline(g, 6, 4, 4, active ? C.white : C.red);
      break;
    }
    case "heatjacket": {
      bevel(g, 1, 1, 10, 10, C.rust1, C.rust3, C.rust0, C.ink);
      rect(g, 3, 2, 6, 8, C.ink); rect(g, 4, 3, 4, 6, active ? C.fire4 : C.fire2);
      for (const y of [4, 7]) hline(g, 2, y, 8, C.brass3);
      break;
    }
    // SHAPES-1 (REQ-BFG-086 S8): the three shaped rigs' 12x12 pictures (their icon, itemIcon's fallthrough; on the deck
    // they draw as one body across their cells, shapeArt.ts). Their ids exist only with SHAPES on.
    case "nailstrip": { // a wooden plank lying across, a row of three nail heads, their points standing out of its top
      bevel(g, 1, 4, 10, 6, C.wood1, C.wood3, C.wood0, C.ink);
      hline(g, 2, 8, 8, C.wood0);
      for (const x of [3, 6, 9]) {
        vline(g, x - 1, 1, 3, C.steel3); px(g, x - 1, 1, active ? C.white : C.steel2);
        rect(g, x - 1, 5, 2, 2, C.steel2); px(g, x - 1, 5, active ? C.white : C.steel3); px(g, x, 6, C.steel0);
      }
      break;
    }
    case "embertrough": { // an iron trough seen from above, full of coals, sparks rising off it
      bevel(g, 0, 3, 12, 8, C.steel1, C.steel2, C.steel0, C.ink);
      rect(g, 2, 5, 8, 4, C.ink);
      rect(g, 3, 6, 6, 2, C.fire0);
      const coal = [C.fire1, C.fire2, C.fire3];
      for (const [x, y, i] of [[3, 6, 0], [5, 6, 1], [7, 6, 2], [4, 7, 2], [6, 7, 0], [8, 7, 1]]) px(g, x, y, active ? C.fire4 : coal[(i + f) % 3]);
      px(g, 4 + (f % 2), 1, C.fire3); px(g, 7, 2 - (f % 2), C.fire4);
      break;
    }
    case "spikerail": { // a steel rail standing up the cell, three spikes out of each side
      rect(g, 4, 0, 4, 12, C.ink);
      vline(g, 5, 0, 12, C.steel3); vline(g, 6, 0, 12, C.steel2);
      for (const y of [2, 6, 10]) {
        hline(g, 1, y, 3, C.steel2); px(g, 1, y, active ? C.yellow : C.white);
        hline(g, 8, y, 3, C.steel2); px(g, 10, y, active ? C.yellow : C.white);
      }
      for (const y of [4, 8]) px(g, 5, y, C.brass4);
      break;
    }
    default: {
      if (drawWave3Gate(g, id, f, active)) break; // 0.8.0 A1: wave 3's eight rigs (wave3Art.ts)
      if (drawPlainGate(g, id, f, active)) break; // PLAIN-1 (REQ-BFG-084): the six plain stat rigs (plainArt.ts)
      if (drawShapes2Gate(g, id, f, active)) break; // SHAPES-2 (REQ-BFG-114): the six more shaped rigs (shapes2Art.ts)
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
      case "flak": {
        bevel(g, 1, 1, 10, 10, C.steel1, C.steel3, C.steel0, C.ink);
        for (const x of [3, 8]) { vline(g, x, 3, 7, C.ink); px(g, x, 2, C.fire3); }
        line(g, 3, 5, 8, 5, C.white);
        break;
      }
      case "spotter": {
        ring(g, 6, 6, 5, C.ink); ring(g, 6, 6, 4, C.cyan);
        vline(g, 6, 0, 12, C.ice); hline(g, 0, 6, 12, C.ice); disc(g, 6, 6, 1.5, C.red);
        break;
      }
      // 0.6.1p: the wave-1 turret mods (catalogue.json art)
      case "hopper": {
        // a brass funnel hopper over the chamber pips
        rect(g, 1, 1, 10, 3, C.ink);
        hline(g, 2, 2, 8, C.brass2); hline(g, 2, 1, 8, C.brass4);
        rect(g, 3, 4, 6, 2, C.ink); hline(g, 4, 4, 4, C.brass2);
        rect(g, 4, 6, 4, 2, C.ink); hline(g, 5, 6, 2, C.brass3);
        rect(g, 5, 8, 2, 1, C.brass1);
        for (const x of [2, 5, 8]) { rect(g, x, 9, 3, 3, C.ink); px(g, x + 1, 10, C.lime); }
        break;
      }
      case "mantlet": {
        // a riveted steel shield plate over the mount
        rect(g, 1, 0, 10, 12, C.ink);
        bevel(g, 2, 1, 8, 9, C.steel2, C.steel3, C.steel1, C.ink);
        rect(g, 3, 10, 6, 1, C.steel1); rect(g, 4, 11, 4, 1, C.steel0);
        for (const [x, y] of [[3, 2], [8, 2], [3, 8], [8, 8]]) px(g, x, y, C.white);
        vline(g, 5, 3, 5, C.steel0); vline(g, 6, 3, 5, C.steel3);
        break;
      }
      case "ram": {
        // a piston ram: steel rod, red head
        rect(g, 0, 4, 5, 4, C.ink); rect(g, 1, 5, 3, 2, C.steel1);
        rect(g, 4, 5, 5, 2, C.ink); hline(g, 4, 5, 5, C.steel2); hline(g, 4, 6, 5, C.steel0);
        rect(g, 8, 2, 4, 8, C.ink);
        rect(g, 9, 3, 2, 6, C.red); vline(g, 9, 3, 6, C.rust4);
        px(g, 10, 4, C.white);
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
        // 0.6.1c: the wave-1 factories (factoryArt.ts); 0.6.1b: turret cores (coreArt.ts)
        // 0.6.2s (REQ-BFG-031 S10): turret modules (turretIcon.ts)
        // 0.8.0 A1: wave 3's factories, cores and gear ask first (wave3Art.ts); its rigs fall through to their idle frame
        if (!drawWave3Icon(g, id) && !drawFactoryIcon(g, id) && !drawCoreIcon(g, id) && !drawTurretIcon(g, id)) g.drawImage(gateSprite(id, 0, false), 0, 0);
      }
    }
    return c;
  });
}

// ------------------------------------------------------------------ effects

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
