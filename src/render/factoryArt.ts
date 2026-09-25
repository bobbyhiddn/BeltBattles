// 0.6.1c: art for the six wave-1 factories (catalogue.json "art" notes; ARSENAL.md §3.3). A 24x24 deck sprite
// each on sprites.ts factorySprite's contract (frame index mod 8, `flash` right after a stamp; machinery.ts picks
// the index per factory) and a 12x12 icon each (shop card, cargo, inspector; sprites.ts itemIcon asks here
// first). Same helpers and palette as the KILN, LOOM and STAMP PRESS; light from the top-left; no randomness.

import { C } from "./palette";
import { bevel, disc, ellipse, fromRows, hline, line, makeCanvas, px, rect, vline, type G } from "./pixel";

type Cv = HTMLCanvasElement;

/** The 24x24 sprite of a wave-1 factory at frame f (0..7), or null for any other id. `stars` (1..3) only
 *  changes GANTRY PRESS: two chutes at 1 star, three (THIRD ARM) at 2-3 stars. */
export function drawFactoryArt(id: string, f: number, flash: boolean, stars: number): Cv | null {
  switch (id) {
    case "doublestamp": return drawDoubleStamp(f, flash);
    case "shottower": return drawShotTower(f, flash);
    case "hotswap": return drawHotSwap(f, flash);
    case "slagpot": return drawSlagPot(f, flash);
    case "assembly": return drawAssembly(f, flash);
    case "gantry": return drawGantry(f, flash, stars);
    case "scrapper": case "sabot": case "frostbite": case "dragchain": case "mimic": case "limpet":
      return drawWave2Factory(id, f, flash, stars);
    default: return null;
  }
}

/** Wave-2 machines use a common deck footprint with a distinct working head and moving output. */
function drawWave2Factory(id: string, f: number, flash: boolean, stars: number): Cv {
  const [c, g] = makeCanvas(24, 24);
  const body = id === "scrapper" ? C.soil3 : id === "sabot" ? C.verd3 : id === "frostbite" ? C.blue
    : id === "dragchain" ? C.steel1 : id === "mimic" ? C.brass2 : C.rust2;
  const lit = flash ? C.white : id === "frostbite" ? C.ice : id === "limpet" ? C.fire3 : C.brass4;
  bevel(g, 1, 3, 22, 20, body, C.steel2, C.steel0, C.ink);
  rect(g, 3, 18, 18, 4, C.ink);
  hline(g, 4, 19, 16, C.belt2);
  for (const x of [3, 19]) { rect(g, x, 20, 2, 3, C.ink); px(g, x, 20, C.steel3); }
  if (id === "scrapper") {
    for (const [x, y] of [[5, 14], [9, 11], [13, 14], [16, 12]]) disc(g, x, y, 3, C.soil2);
    line(g, 17, 5, 17, 11, C.brass3); line(g, 17, 5, 10, 5, C.brass4);
    line(g, 10, 5, 10 + f % 3, 10, C.steel3);
    for (const x of [8, 12]) line(g, 10 + f % 3, 10, x, 13, lit);
  } else if (id === "sabot") {
    bevel(g, 3, 7, 13, 10, C.verd2, C.verd3, C.verd0, C.ink);
    rect(g, 6, 9, 5, 5, C.ink); rect(g, 7, 10, 3, 3, C.red);
    rect(g, 15, 9, 8, 4, C.ink); hline(g, 16, 10, 7, C.steel2);
    px(g, 21, 10, lit);
  } else if (id === "frostbite") {
    disc(g, 12, 11, 7, C.ink); disc(g, 12, 11, 5.5, C.blue); disc(g, 12, 11, 3, C.ice);
    line(g, 12, 4, 12, 18, C.white); line(g, 5, 11, 19, 11, C.cyan);
    px(g, 12 + (f % 3) - 1, 11, lit);
  } else if (id === "dragchain") {
    disc(g, 8, 11, 5, C.ink); disc(g, 8, 11, 4, C.steel2);
    disc(g, 16, 11, 5, C.ink); disc(g, 16, 11, 4, C.steel1);
    for (let x = 4; x < 21; x += 3) rect(g, x, 10 + ((x + f) % 2), 3, 2, lit);
  } else if (id === "mimic") {
    for (const x of [5, 16]) { disc(g, x + 1, 11, 4, C.ink); disc(g, x + 1, 11, 2.6, C.brass4); }
    line(g, 9, 8, 15, 14, C.white); line(g, 9, 14, 15, 8, C.white);
    for (let i = 0; i < stars; i++) px(g, 8 + i * 4, 4, lit);
  } else {
    disc(g, 12, 11, 7, C.ink); disc(g, 12, 11, 5, C.rust3);
    for (const x of [8, 12, 16]) { disc(g, x, 11 + ((f + x) % 2), 2, C.ink); px(g, x, 10 + ((f + x) % 2), lit); }
    line(g, 5, 5, 19, 17, C.steel3);
  }
  return c;
}

/** The 5x5 brass gear (ASSEMBLY LINE's roof emblem, belt part and icon), top-left lit, ink hub. */
function gear(g: G, x: number, y: number): void {
  g.drawImage(fromRows(["h.h.b", ".hbb.", "hbkbd", ".bbd.", "b.d.d"], {
    h: C.brass4, b: C.brass3, d: C.brass1, k: C.ink,
  }), x, y);
}

// ------------------------------------------------------------------ DOUBLE STAMP

/** A wide press (the full width, rows 2-21): a steel frame with yellow hazard corners and two steel hammer
 *  heads side by side. f % 4: 0 the left head is down, 2 the right one, 1 and 3 both up (they thump one after
 *  the other); flash: sparks round the head that is down. */
function drawDoubleStamp(f: number, flash: boolean): Cv {
  const [c, g] = makeCanvas(24, 24);
  rect(g, 0, 2, 24, 20, C.ink);
  for (let y = 3; y < 21; y++) {
    for (let x = 1; x < 23; x++) {
      if (x > 2 && y > 4 && x < 21 && y < 19) continue;
      const corner = (x < 7 || x > 16) && (y < 8 || y > 15);
      px(g, x, y, corner ? (((x + y) >> 1) % 2 ? C.yellow : C.ink) : x < 3 || y < 5 ? C.steel2 : C.steel0);
    }
  }
  bevel(g, 3, 5, 18, 14, C.steel1, C.steel2, C.steel0, C.ink);
  const ph = f % 4;
  head(g, 4, ph === 0, flash);
  head(g, 13, ph === 2, flash);
  return c;
}

/** One DOUBLE STAMP die at x (7 wide, rows 6-15): the hammer head, raised (big, lit, casting a shadow) or
 *  down (small and dark, as STAMP PRESS's piston); its slug outlet below shows a fresh slug while it is down. */
function head(g: G, x: number, down: boolean, flash: boolean): void {
  rect(g, x + 2, 17, 3, 2, C.ink);
  if (down) {
    bevel(g, x + 1, 8, 5, 6, C.steel0, C.steel1, C.ink, C.ink);
    px(g, x + 3, 17, C.steel3);
    if (flash) for (const [sx, sy] of [[x, 7], [x + 6, 8], [x, 14], [x + 6, 13]]) px(g, sx, sy, sy < 12 ? C.fire4 : C.yellow);
    return;
  }
  // its shadow on the plate (none on the frame's edge)
  hline(g, x + 1, 15, Math.min(7, 19 - x), C.steel0);
  if (x + 7 < 20) vline(g, x + 7, 7, 9, C.steel0);
  bevel(g, x, 6, 7, 9, C.steel2, C.steel3, C.steel0, C.ink);
  rect(g, x + 2, 8, 3, 5, C.steel1);
  px(g, x + 2, 8, C.white);
}

// ------------------------------------------------------------------ SHOT TOWER

/** A tall narrow lead-grey tower with a red cap, dropping grey shot down its slot into the hopper at its foot.
 *  Three pellets fall one pixel per frame; flash: a fresh cluster lands in the hopper. */
function drawShotTower(f: number, flash: boolean): Cv {
  const [c, g] = makeCanvas(24, 24);
  // plinth with the hopper the shot drops into
  bevel(g, 2, 15, 20, 8, C.steel1, C.steel2, C.steel0, C.ink);
  // stays from the shaft to the plinth
  line(g, 7, 8, 3, 15, C.ink); line(g, 6, 9, 3, 14, C.steel1);
  line(g, 16, 8, 20, 15, C.ink); line(g, 17, 9, 20, 14, C.steel0);
  // the tower's shadow on the plinth (light from the top-left)
  rect(g, 17, 16, 2, 5, C.steel0);
  // shaft: lead grey, lit on the left, two iron bands
  rect(g, 7, 3, 10, 16, C.ink);
  rect(g, 8, 4, 4, 14, C.steel2);
  rect(g, 12, 4, 4, 14, C.steel1);
  vline(g, 8, 4, 14, C.steel3);
  vline(g, 15, 4, 14, C.steel0);
  for (const y of [9, 14]) { hline(g, 8, y, 8, C.steel0); px(g, 8, y - 1, C.white); }
  // the drop slot with the falling shot
  rect(g, 11, 6, 2, 11, C.ink);
  for (let k = 0; k < 3; k++) px(g, 11 + (k & 1), 7 + ((f + k * 3) % 8), k === 0 ? C.steel3 : C.steel2);
  // hopper at the foot
  rect(g, 9, 18, 6, 4, C.ink);
  rect(g, 10, 19, 4, 2, C.steel0);
  px(g, 10 + (f % 3), 20, C.steel2); px(g, 12, 20, C.steel1);
  if (flash) { px(g, 10, 19, C.white); px(g, 12, 19, C.steel3); px(g, 13, 20, C.white); }
  // red cap with its dark eave
  g.drawImage(fromRows([
    "....kkkk....",
    "..kkwrrrkk..",
    ".kwrrrrrrdk.",
    "krrrrrrrrddk",
    "kmmmmmmmmmmk",
    ".kkkkkkkkkk.",
  ], { k: C.ink, w: C.white, r: C.red, d: C.fire1, m: C.maroon }), 6, 0);
  return c;
}

// ------------------------------------------------------------------ HOT SWAP

/** A twin-chambered furnace: the ember chamber's red window (fire2) and the spark chamber's blue one (ice),
 *  lit in turn (f 0-3 red, 4-7 blue), and the brass selector drum below them turning one step per frame, its
 *  lamp toward the lit window. */
function drawHotSwap(f: number, flash: boolean): Cv {
  const [c, g] = makeCanvas(24, 24);
  const red = f < 4;
  bevel(g, 0, 3, 24, 20, C.rust2, C.rust3, C.rust1, C.ink);
  // the seam between the two chambers
  vline(g, 11, 4, 9, C.rust1); vline(g, 12, 4, 9, C.rust3);
  // twin flues, each glowing while its chamber is lit
  flue(g, 3, red ? (flash ? C.fire4 : C.fire3) : C.fire0);
  flue(g, 15, red ? C.deepblue : flash ? C.white : C.ice);
  // the two windows, [glass, core, glint]: the lit one flickers and flares on a stamp, the other is dark
  porthole(g, 6, red, red ? [C.fire2, flash ? C.fire5 : f % 2 ? C.fire3 : C.fire4, C.fire4] : [C.fire0, C.fire1, C.fire1]);
  porthole(g, 18, !red, red ? [C.deepblue, C.navy, C.blue] : [C.blue, flash ? C.white : f % 2 ? C.ice : C.cyan, C.white]);
  // the selector drum
  disc(g, 12, 17, 3.6, C.ink);
  disc(g, 12, 17, 2.8, C.brass2);
  px(g, 10, 15, C.brass4); px(g, 11, 14, C.brass3); px(g, 9, 16, C.brass3);
  px(g, 14, 19, C.brass1); px(g, 13, 19, C.brass1);
  const a = (f / 8) * Math.PI * 2;
  for (const k of [0, Math.PI]) {
    px(g, Math.round(12 + Math.cos(a + k) * 1.9 - 0.5), Math.round(17 + Math.sin(a + k) * 1.9 - 0.5), C.brass0);
  }
  px(g, red ? 9 : 14, 14, red ? C.fire3 : C.ice);
  // feet
  for (const x of [1, 20]) rect(g, x, 22, 3, 2, C.ink);
  return c;
}

/** HOT SWAP flue at x (5x5, from the top edge) with its glowing mouth. */
function flue(g: G, x: number, glow: string): void {
  bevel(g, x, 0, 6, 5, C.steel1, C.steel2, C.steel0, C.ink);
  rect(g, x + 2, 1, 2, 2, C.ink);
  px(g, x + 2, 2, glow);
}

/** HOT SWAP window centred at (cx, 10): [glass, core, glint]. */
function porthole(g: G, cx: number, lit: boolean, col: [string, string, string]): void {
  disc(g, cx, 10, 3.6, C.ink);
  disc(g, cx, 10, 2.8, col[0]);
  disc(g, cx, 10.5, 1.6, col[1]);
  px(g, cx - 2, 8, col[2]);
  if (lit) px(g, cx - 1, 9, col[2]);
}

// ------------------------------------------------------------------ SLAG POT

/** A squat iron crucible slung between two trunnion posts and tipped toward its trough: a dark crust (soil2)
 *  over orange slag (fire2) that shows at the pouring lip and through cracks glowing in turn; a drip falls
 *  from the lip (f 0-4), a full pour on flash. */
function drawSlagPot(f: number, flash: boolean): Cv {
  const [c, g] = makeCanvas(24, 24);
  // posts, base beam and the trough the pot pours into
  for (const x of [0, 21]) bevel(g, x, 6, 3, 15, C.steel1, C.steel2, C.steel0, C.ink);
  bevel(g, 0, 19, 24, 4, C.steel1, C.steel2, C.steel0, C.ink);
  rect(g, 7, 19, 10, 4, C.ink);
  hline(g, 8, 20, 8, C.fire1); hline(g, 8, 21, 8, C.fire0);
  px(g, 9 + ((f * 3) % 6), 20, C.fire2);
  // the pot: dark iron, lit top-left, heated to rust below the lip
  ellipse(g, 12, 11.5, 10, 7.5, C.ink);
  for (let y = 4; y < 19; y++) {
    for (let x = 2; x < 22; x++) {
      const u = (x + 0.5 - 12) / 9, v = (y + 0.5 - 11.5) / 6.5;
      const d = Math.sqrt(u * u + v * v);
      if (d >= 1) continue;
      let col = C.steel0;
      if (u + v < -0.7 && d > 0.55) col = d > 0.8 && u + v < -1.05 ? C.steel2 : C.steel1;
      else if (u + v > 0.8 && d > 0.6) col = C.belt1;
      else if (v > 0.55 && Math.abs(u) < 0.45) col = C.rust1;
      px(g, x, y, col);
    }
  }
  // the tipped mouth: crust over the slag, the slag welling at the front lip
  ellipse(g, 12, 9, 7.5, 4.5, C.ink);
  ellipse(g, 12, 9, 6.5, 3.5, C.soil2);
  for (let y = 10; y < 13; y++) {
    for (let x = 5; x < 19; x++) {
      const u = (x + 0.5 - 12) / 6.5, v = (y + 0.5 - 9) / 3.5;
      if (u * u + v * v < 1 && v > 0.3 + Math.abs(u) * 0.25) px(g, x, y, v > 0.85 ? C.fire1 : x === 10 ? C.fire3 : C.fire2);
    }
  }
  for (const [x, y, col] of [[8, 7, C.soil4], [9, 6, C.soil3], [10, 6, C.soil3], [7, 8, C.soil3], [6, 9, C.soil3], [15, 7, C.soil1], [16, 8, C.soil1], [17, 9, C.soil1]] as const) px(g, x, y, col);
  // crust cracks, glowing in turn
  const cracks = [[8, 9], [9, 8], [10, 8], [11, 7], [14, 7], [15, 8], [15, 9], [13, 9]];
  cracks.forEach(([x, y], i) => px(g, x, y, (i + f) % 3 === 0 ? C.fire3 : (i + f) % 3 === 1 ? C.fire2 : C.fire1));
  // the lip, then a drip or a pour down into the trough
  rect(g, 10, 13, 4, 2, C.ink);
  px(g, 11, 13, C.fire3); px(g, 12, 13, C.fire2); px(g, 11, 14, C.fire2);
  if (flash) {
    vline(g, 11, 15, 5, C.fire3); vline(g, 12, 15, 5, C.fire2);
    px(g, 10, 19, C.fire4); px(g, 13, 19, C.fire4);
  } else if (f < 5) {
    px(g, 11, 15 + f, f < 2 ? C.fire3 : C.fire2);
  }
  // trunnion pins
  for (const x of [2, 20]) { rect(g, x, 10, 2, 2, C.brass2); px(g, x, 10, C.brass4); }
  return c;
}

// ------------------------------------------------------------------ ASSEMBLY LINE

/** A steel frame, a gear emblem on its roof, a mini belt through the bay and two brass robot arms reaching out
 *  from the roof: the left one sets a gear on the belt (f 0-1), the belt carries it two pixels a frame, the
 *  right one takes it (f 6-7); flash: sparks at the working claw. */
function drawAssembly(f: number, flash: boolean): Cv {
  const [c, g] = makeCanvas(24, 24);
  rect(g, 0, 0, 24, 24, C.ink);
  bevel(g, 1, 1, 22, 22, C.steel1, C.steel2, C.steel0);
  rect(g, 3, 8, 18, 13, C.slate1);
  // roof with the gear emblem
  bevel(g, 1, 1, 22, 7, C.steel2, C.steel3, C.steel1, C.ink);
  gear(g, 10, 2);
  for (const x of [4, 19]) px(g, x, 4, C.steel1);
  // the mini belt, scrolling right under the part
  rect(g, 2, 16, 20, 5, C.ink);
  for (let x = 3; x < 21; x++) vline(g, x, 17, 3, (x - f * 2) % 4 === 0 ? C.belt3 : C.belt1);
  hline(g, 3, 17, 18, C.belt2);
  const gx = 3 + f * 2; // the part's left edge (5 wide)
  gear(g, gx, 15);
  // the arms: shoulders under the roof, elbows out, claws over the belt (down) or lifted
  arm(g, 9, 5, f < 2 ? gx + 2 : 6, f < 2, flash && f < 2);
  arm(g, 14, 18, f >= 6 ? gx + 2 : 17, f >= 6, flash && f >= 6);
  return c;
}

/** One ASSEMBLY LINE arm: shoulder joint at (sx, 8), elbow at (ex, 10), claw over column wx on the part
 *  (row 14) when `down`, else lifted (row 12). Segments are two pixels thick, brass lit from the top-left. */
function arm(g: G, sx: number, ex: number, wx: number, down: boolean, flash: boolean): void {
  const wy = down ? 14 : 12;
  line(g, sx, 8, ex, 10, C.brass3); line(g, sx, 9, ex, 11, C.brass1);
  line(g, ex, 10, wx, wy - 1, C.brass3); line(g, ex + 1, 10, wx + 1, wy - 1, C.brass1);
  rect(g, sx, 7, 2, 2, C.ink); px(g, sx, 8, C.brass4);
  rect(g, ex, 10, 2, 2, C.brass2); px(g, ex, 10, C.brass4);
  px(g, wx - 1, wy, C.steel3); px(g, wx + 2, wy, C.steel3); hline(g, wx - 1, wy - 1, 4, C.steel2);
  if (flash) { px(g, wx - 2, wy + 1, C.white); px(g, wx + 3, wy + 1, C.yellow); }
}

// ------------------------------------------------------------------ GANTRY PRESS

/** A steel press bed under two overhead brass beams, the press head on a trolley riding them from chute to
 *  chute: two chutes at 1 star, three at 2-3 stars. f >> 1 picks the chute, even frames (and flash) press. */
function drawGantry(f: number, flash: boolean, stars: number): Cv {
  const [c, g] = makeCanvas(24, 24);
  const xs = stars >= 2 ? [3, 10, 17] : [6, 14]; // chute left edges (4 wide) along the bottom edge
  const at = xs[(f >> 1) % xs.length];
  const down = flash || (f & 1) === 0;
  rect(g, 0, 0, 24, 24, C.ink);
  bevel(g, 1, 1, 22, 22, C.steel1, C.steel2, C.steel0);
  for (const x of xs) {
    rect(g, x, 17, 4, 7, C.ink);
    rect(g, x + 1, 18, 2, 4, C.steel0);
    hline(g, x + 1, 18, 2, x === at && down ? C.steel3 : C.steel1);
  }
  // the head over the current chute
  const hx = at - 2;
  if (down) {
    bevel(g, hx + 1, 7, 6, 5, C.steel0, C.steel1, C.ink, C.ink);
    if (flash) { px(g, hx, 8, C.yellow); px(g, hx + 7, 10, C.fire4); }
  } else {
    bevel(g, hx, 5, 8, 9, C.steel2, C.steel3, C.steel0, C.ink);
    rect(g, hx + 2, 7, 4, 5, C.steel1);
    px(g, hx + 2, 7, C.white);
  }
  // overhead beams with their shadows, and the trolley clamps on them
  for (const y of [2, 13]) {
    hline(g, 1, y + 3, 22, C.steel0);
    bevel(g, 0, y, 24, 3, C.brass2, C.brass4, C.brass1);
    px(g, 0, y + 1, C.ink); px(g, 23, y + 1, C.ink);
    bevel(g, hx + 2, y - 1, 4, 5, C.brass1, C.brass3, C.brass0, C.ink);
  }
  return c;
}

// ------------------------------------------------------------------ icons (12x12)

/** Draw the 12x12 icon of a wave-1 factory (shop card, cargo, inspector); false for any other id. */
export function drawFactoryIcon(g: G, id: string): boolean {
  switch (id) {
    case "scrapper": case "sabot": case "frostbite": case "dragchain": case "mimic": case "limpet": {
      const col = id === "scrapper" ? C.soil3 : id === "sabot" ? C.verd3 : id === "frostbite" ? C.ice
        : id === "dragchain" ? C.steel2 : id === "mimic" ? C.brass4 : C.rust3;
      bevel(g, 0, 1, 12, 11, col, C.steel2, C.steel0, C.ink);
      if (id === "scrapper") { line(g, 2, 2, 8, 2, C.brass4); line(g, 8, 2, 8, 7, C.brass3); line(g, 8, 7, 5, 9, C.steel3); }
      if (id === "sabot") { rect(g, 2, 4, 8, 3, C.ink); hline(g, 4, 5, 6, C.steel3); px(g, 10, 5, C.red); }
      if (id === "frostbite") { line(g, 6, 2, 6, 10, C.white); line(g, 2, 6, 10, 6, C.white); }
      if (id === "dragchain") for (const x of [2, 5, 8]) rect(g, x, 5, 3, 2, C.ink);
      if (id === "mimic") { disc(g, 4, 6, 2, C.white); disc(g, 8, 6, 2, C.white); }
      if (id === "limpet") for (const x of [3, 6, 9]) { disc(g, x, 6, 1.8, C.ink); px(g, x, 6, C.fire3); }
      break;
    }
    case "doublestamp": { // hazard corners, two hammer heads: the left one up (lit, shadowed), the right one down
      g.drawImage(fromRows([
        "kkkkkkkkkkkk",
        "kyyssssssyyk",
        "kyppppppppyk",
        "kskkkkppppdk",
        "kskWSkdkkkdk",
        "kskSskdkqkdk",
        "kskSskdkokdk",
        "ksksokdkokdk",
        "kskkkkdkkkdk",
        "kypddddpppyk",
        "kyyooooooyyk",
        "kkkkkkkkkkkk",
      ], { k: C.ink, y: C.yellow, s: C.steel2, p: C.steel1, d: C.steel0, o: C.steel0, q: C.steel1, S: C.steel3, W: C.white }), 0, 0);
      break;
    }
    case "shottower": { // the red-capped lead-grey tower, shot falling down its slot into the hopper
      g.drawImage(fromRows([
        "....kkkk....",
        "...kwrrrk...",
        "..krrrrrfk..",
        "..kmmmmmmk..",
        "...kSskDk...",
        "...kSspDk...",
        "...kSskDk...",
        "...kSspDk...",
        "...kSskDk...",
        "..kkkkpkkk..",
        ".ksssspsssk.",
        ".kkkkkkkkkk.",
      ], { k: C.ink, w: C.white, r: C.red, f: C.fire1, m: C.maroon, S: C.steel3, s: C.steel2, p: C.steel3, D: C.steel1 }), 0, 0);
      break;
    }
    case "hotswap": { // the rust furnace: red window, blue window, the brass drum between them
      for (const x of [1, 8]) { rect(g, x, 0, 3, 2, C.ink); px(g, x + 1, 0, C.steel2); }
      bevel(g, 0, 1, 12, 10, C.rust2, C.rust3, C.rust1, C.ink);
      rect(g, 1, 3, 4, 4, C.ink); rect(g, 2, 4, 2, 2, C.fire2); px(g, 2, 4, C.fire4);
      rect(g, 7, 3, 4, 4, C.ink); rect(g, 8, 4, 2, 2, C.ice); px(g, 8, 4, C.white);
      disc(g, 6, 9, 2.2, C.ink);
      rect(g, 5, 8, 2, 2, C.brass3); px(g, 5, 8, C.brass4);
      break;
    }
    case "slagpot": { // the tipped iron crucible between its posts: dark crust, orange slag at the lip, a drip
      vline(g, 0, 3, 7, C.steel1); vline(g, 11, 3, 7, C.steel1);
      ellipse(g, 6, 5.5, 5.6, 4.8, C.ink);
      ellipse(g, 6, 5.5, 4.6, 3.8, C.steel0);
      px(g, 2, 4, C.steel2); px(g, 3, 3, C.steel1); px(g, 2, 5, C.steel1); px(g, 4, 2, C.steel1);
      ellipse(g, 6, 5, 3.6, 2.4, C.ink);
      ellipse(g, 6, 5, 2.8, 1.6, C.soil2);
      hline(g, 4, 6, 4, C.fire2); px(g, 5, 6, C.fire3);
      px(g, 6, 4, C.fire2); px(g, 7, 5, C.fire1); px(g, 4, 4, C.soil4);
      px(g, 5, 8, C.rust1); px(g, 6, 8, C.rust1);
      px(g, 6, 9, C.fire3); px(g, 6, 10, C.fire2);
      rect(g, 3, 11, 6, 1, C.fire1);
      px(g, 1, 5, C.brass3); px(g, 10, 5, C.brass3);
      break;
    }
    case "assembly": { // the steel frame, the roof gear, two brass arms reaching out over a mini belt
      bevel(g, 0, 2, 12, 10, C.steel1, C.steel2, C.steel0, C.ink);
      rect(g, 1, 5, 10, 5, C.slate1);
      gear(g, 4, 0);
      rect(g, 1, 9, 10, 2, C.ink);
      hline(g, 1, 9, 10, C.belt1);
      for (const x of [1, 4, 8]) px(g, x, 9, C.belt3);
      // the part on the belt, a small cog, and the two arms setting it
      px(g, 6, 7, C.brass4); px(g, 5, 8, C.brass3); px(g, 6, 8, C.ink); px(g, 7, 8, C.brass3); px(g, 6, 9, C.brass2);
      line(g, 1, 5, 4, 7, C.brass3); line(g, 10, 5, 8, 7, C.brass2);
      px(g, 1, 5, C.brass4); px(g, 10, 5, C.brass4);
      px(g, 4, 8, C.steel3); px(g, 8, 8, C.steel3);
      break;
    }
    case "gantry": { // a brass gantry over the steel press bed, the head hung over one of the two chutes
      rect(g, 0, 0, 12, 4, C.ink);
      hline(g, 1, 1, 10, C.brass4); hline(g, 1, 2, 10, C.brass2);
      for (const x of [0, 9]) { rect(g, x, 3, 3, 5, C.ink); vline(g, x + 1, 3, 4, x ? C.brass1 : C.brass3); }
      bevel(g, 0, 7, 12, 5, C.steel1, C.steel2, C.steel0, C.ink);
      for (const x of [3, 7]) { rect(g, x, 8, 3, 4, C.ink); px(g, x + 1, 9, x === 3 ? C.steel3 : C.steel1); }
      bevel(g, 3, 3, 5, 4, C.steel2, C.steel3, C.steel0, C.ink);
      px(g, 4, 4, C.white);
      break;
    }
    default:
      return false;
  }
  return true;
}
