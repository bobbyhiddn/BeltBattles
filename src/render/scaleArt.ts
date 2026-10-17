// ART-1E (REQ-BFG-098; BRIEF-ART1E): the own art of the seven new scaling rigs, which SCALE-2c drew as a live rig's picture
// (sprites.ts SCALE_ART_FROM): CINDER MAIL, ROT GAUGE, LEECH COIL, CROWD PRESS, AEGIS SPIKE, GRUDGE ROD and TROPHY CHAIN.
// The model is wave3Art.ts drawWave3Gate: sprites.ts drawGate asks here first and gets true for the seven ids, false for any
// other, so every existing rig draws exactly as before. The seven ids are in ITEMS only with SCALE_RIGS on, so with it off
// nothing asks for them. A rig's picture is one 12x12 drawing at frames 0-7, idle and active (the hit flash), drawn for screen
// direction N and turned with the rig (sprites.ts orient12); its icon is its idle frame 0 (itemIcon's default branch).
// The shop card shows that icon at twice its size, so the identity sits in the middle 8x8 and the outer ring may be covered by
// the card's marks. Same helpers and palette as the rest of the render code; light from the top-left; no randomness; no
// letters or digits. Each stat's colour is the game's own for its glyph (font.ts ICON_COLOUR): SHIELD (internal PLATE)
// plate3, WARD (internal SHIELD) rune3, BURN fire3, POISON venom, HEAL green, hearts red. An active frame is its idle frame
// with brighter colours (the hit flash): the same silhouette, never a different picture.

import { C } from "./palette";
import { disc, fromRows, hline, px, rect, vline, type G } from "./pixel";

/** The seven ids this file draws (SCALE_IDS' order: sim/scale.ts). */
export const SCALE_ART_IDS = ["cindermail", "rotgauge", "leechcoil", "crowdpress", "aegisspike", "grudgerod", "trophychain"] as const;

/** Paint character rows at (x, y) ('.' transparent). */
function rows(g: G, x: number, y: number, r: string[], pal: Record<string, string>): void {
  g.drawImage(fromRows(r, pal), x, y);
}

/** Is pixel (x, y) one disc(g, cx, cy, r) paints? (the same row spans) */
function inDisc(cx: number, cy: number, r: number, x: number, y: number): boolean {
  const dy = y + 0.5 - cy;
  const span = r * r - dy * dy;
  if (span < 0) return false;
  const half = Math.sqrt(span);
  return x >= Math.round(cx - half) && x < Math.round(cx + half);
}

/** The pixels of a straight run from (x0, y0) to (x1, y1), end to end (the render line's steps). */
function runPts(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 64; n++) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

// ======================================================================================================== CINDER MAIL

/** CINDER MAIL's body, a mail tunic (10 x 10, drawn at (1, 1)): shoulders round a neck, short sleeves, a jagged hem. */
const MAIL = [
  "XXX....XXX",
  "XXXX..XXXX",
  "XXXXXXXXXX",
  "XXXXXXXXXX",
  ".XXXXXXXX.",
  "..XXXXXX..",
  "..XXXXXX..",
  "..XXXXXX..",
  "..XXXXXX..",
  "..XX.XX.X.",
];
/** Is the tunic's cell (x, y) a hole of the mesh? The links are rings two cells wide and the holes between them one, each row
 *  of rings set a cell over from the one above (a running bond): the cinders sit in the holes. */
const hole = (x: number, y: number): boolean => (x + 2 * (y & 1)) % 3 === 0;
/** The cinders caught in the links: [x, y, phase] in the tunic's own cells, each on a hole of the mesh. */
const EMBERS: [number, number, number][] = [[4, 3, 0], [6, 4, 3], [7, 5, 5], [3, 6, 2], [4, 7, 6], [6, 8, 1]];
const FLICKER = [C.fire2, C.fire3, C.fire2, C.fire1, C.fire1, C.fire2, C.fire3, C.fire1];

/** CINDER MAIL: a mail tunic in SHIELD's colour (the plate ramp), its links a soft mesh with glowing cinders caught
 *  between them. Idle the cinders flicker, each on its own phase; a hit makes them burn white-hot and the links round them glow. */
function cinderMail(g: G, f: number, active: boolean): void {
  const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 10 && y < 10 && MAIL[y][x] === "X";
  for (let y = -1; y <= 10; y++) {
    for (let x = -1; x <= 10; x++) {
      if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) px(g, x + 1, y + 1, C.ink);
    }
  }
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      if (!at(x, y)) continue;
      const t = (x + y) / 18;
      let col: string;
      if (hole(x, y)) col = t < 0.55 ? C.plate1 : C.plate0;
      else if (x === 0 || hole(x - 1, y)) col = t < 0.5 ? C.plate3 : C.plate2; // a ring's lit half
      else col = t < 0.6 ? C.plate2 : C.plate1; // its shaded half
      px(g, x + 1, y + 1, col);
    }
  }
  for (const [x, y, ph] of EMBERS) {
    if (active) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (at(x + dx, y + dy)) px(g, x + dx + 1, y + dy + 1, C.fire3);
      px(g, x + 1, y + 1, C.fire5);
    } else {
      px(g, x + 1, y + 1, FLICKER[(f + ph) % 8]);
    }
  }
}

// ========================================================================================================== ROT GAUGE

/** ROT GAUGE's needle tips by idle frame (the dial's own cells): it twitches about its rest at the top right. */
const ROT_TIPS: [number, number][] = [[7, 3], [7, 3], [8, 4], [7, 3], [7, 3], [6, 3], [7, 3], [8, 3]];
/** The drip under the gauge by frame: it hangs (0-2), falls (3), is gone (4), swells again (5-7). */
const ROT_DRIP: [number, number, string][][] = [
  [[6, 10, C.venom], [6, 11, C.green]],
  [[6, 10, C.venom], [6, 11, C.green]],
  [[6, 10, C.venom], [6, 11, C.venom]],
  [[6, 11, C.venom]],
  [],
  [[6, 10, C.venom]],
  [[6, 10, C.venom]],
  [[6, 10, C.venom], [6, 11, C.green]],
];

/** ROT GAUGE: a round gauge, a brass rim round a sickly olive dial, a venom needle (POISON's colour) at its pivot and a drip
 *  of venom hanging under it. Idle the needle twitches and the drip swells and falls; a hit swings the needle over into the
 *  red end of the scale and makes the dial glow. */
function rotGauge(g: G, f: number, active: boolean): void {
  disc(g, 6, 5, 5, C.ink);
  disc(g, 6, 5, 4, C.brass2);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 12; x++) {
      if (!inDisc(6, 5, 4, x, y) || inDisc(6, 5, 3, x, y)) continue;
      const d = x + y;
      px(g, x, y, d <= 6 ? C.brass4 : d <= 9 ? C.brass3 : d <= 12 ? C.brass2 : C.brass1);
    }
  }
  disc(g, 6, 5, 3, active ? C.olive4 : C.olive3);
  for (let y = 2; y < 8; y++) {
    for (let x = 3; x < 9; x++) {
      if (!inDisc(6, 5, 3, x, y)) continue;
      const d = x + y;
      if (d <= 7) px(g, x, y, active ? C.white : C.olive4);
      else if (d >= 14) px(g, x, y, active ? C.olive3 : C.olive2);
    }
  }
  for (const [x, y] of [[3, 6], [4, 2], [7, 2]]) px(g, x, y, C.ink);
  px(g, 8, 6, C.red);
  const [tx, ty] = active ? [8, 6] : ROT_TIPS[f];
  for (const [x, y] of runPts(6, 5, tx, ty)) px(g, x, y, active ? C.ink : C.venom);
  px(g, 6, 5, active ? C.ink : C.brass4);
  for (const [x, y, col] of ROT_DRIP[f]) px(g, x, y, col);
}

// ========================================================================================================= LEECH COIL

/** LEECH COIL's drop at its mouth by frame (the tube's top): it swells (0-1), is drawn in (2-4), and a new bead forms (6-7). */
const LEECH_DROP: [number, number, string][][] = [
  [[5, 0, C.white], [6, 0, C.green], [5, 1, C.green], [6, 1, C.green], [4, 1, C.ink], [7, 1, C.ink]],
  [[5, 0, C.white], [6, 0, C.green], [5, 1, C.green], [6, 1, C.green], [4, 1, C.ink], [7, 1, C.ink]],
  [[5, 1, C.white], [6, 1, C.green], [5, 2, C.green], [6, 2, C.green], [4, 1, C.ink], [7, 1, C.ink]],
  [[5, 3, C.green], [6, 3, C.green]],
  [[5, 3, C.green], [6, 3, C.white]],
  [],
  [[5, 1, C.green]],
  [[5, 0, C.white], [5, 1, C.green], [6, 1, C.green], [4, 1, C.ink], [7, 1, C.ink]],
];

/** LEECH COIL: a green leech (a tube) standing on its tail, its mouth to the north, two fat turns of copper wire wound round
 *  it, and a drop in HEAL's green at the mouth: the drop swells and is drawn in. A hit makes the copper glow hot and the tube light. */
function leechCoil(g: G, f: number, active: boolean): void {
  const tube = active ? [C.verd4, C.white, C.verd4] : [C.verd4, C.verd3, C.verd2];
  // the head: a rounded cap with a dark mouth
  hline(g, 4, 2, 4, C.ink);
  px(g, 3, 3, C.ink); px(g, 8, 3, C.ink);
  px(g, 4, 3, tube[0]); px(g, 5, 3, C.verd0); px(g, 6, 3, C.verd0); px(g, 7, 3, tube[2]);
  // the tube under the wire
  for (let y = 4; y <= 9; y++) {
    px(g, 3, y, C.ink); px(g, 8, y, C.ink);
    px(g, 4, y, tube[0]); hline(g, 5, y, 2, tube[1]); px(g, 7, y, tube[2]);
  }
  // two turns of wire round the tube, seen from a little above: each a smile of copper, its ends (lit left, shaded right)
  // standing out past the tube's edge, its front across the tube
  const wire = active ? [C.fire5, C.fire4, C.fire3] : [C.cop3, C.cop2, C.cop1];
  for (const y of [4, 7]) {
    hline(g, 2, y, 2, wire[0]); hline(g, 8, y, 2, wire[2]);
    px(g, 2, y + 1, C.ink); px(g, 9, y + 1, C.ink);
    hline(g, 4, y + 1, 4, wire[1]);
    hline(g, 4, y + 2, 4, C.verd1);
  }
  // the tail
  px(g, 4, 10, C.ink); px(g, 7, 10, C.ink); px(g, 5, 10, tube[1]); px(g, 6, 10, tube[2]);
  hline(g, 5, 11, 2, C.ink);
  for (const [x, y, col] of LEECH_DROP[f]) px(g, x, y, col);
}

// ======================================================================================================== CROWD PRESS

/** CROWD PRESS: a press plate on its piston bearing down on a tight row of three slugs, drawn as the game's own slug (ammo.ts
 *  PLAIN_ROWS: ink outline, a white glint top-left, a shaded bottom-right) on a strip of belt. Idle the plate bobs one px up
 *  and down; a hit makes the plate's face and the slugs flash. */
function crowdPress(g: G, f: number, active: boolean): void {
  const down = [0, 0, 0, 1, 1, 1, 0, 0][f]; // the plate's bob, in px (frame 0 is the plate at rest, its piston at the top edge)
  const hot = active;
  // the three slugs, round at both ends, the plate's ink edge over their tops
  rows(g, 0, 6, [
    "..kk.kk.kk..",
    ".kWSkWSkWSk.",
    ".ksdksdksdk.",
    "..kk.kk.kk..",
  ], { k: C.ink, W: C.white, S: hot ? C.fire4 : C.steel3, s: hot ? C.white : C.steel2, d: hot ? C.fire3 : C.steel1 });
  // the belt under them: a lit rail over its dark bed, a bright chevron running along the rail
  rows(g, 0, 10, [
    ".kSssssssdk.",
    ".kkkkkkkkkk.",
  ], { k: C.ink, S: C.steel3, s: C.steel2, d: C.steel1 });
  px(g, 2 + f, 10, hot ? C.fire4 : C.white);
  // the plate and its piston
  rows(g, 0, down, [
    "....kkkk....",
    "....kSsk....",
    ".kkkkkkkkkk.",
    ".kWSSSSSSsk.",
    ".ksssssssdk.",
    ".kkkkkkkkkk.",
  ], { k: C.ink, W: C.white, S: hot ? C.white : C.steel3, s: hot ? C.fire4 : C.steel2, d: hot ? C.fire3 : C.steel1 });
}

// ======================================================================================================== AEGIS SPIKE

/** AEGIS SPIKE's shield: a heater shield (the cells of its face; the ink is drawn round them). */
const SHIELD = [
  "............",
  "............",
  "............",
  ".XXXXXXXXXX.",
  ".XXXXXXXXXX.",
  ".XXXXXXXXXX.",
  ".XXXXXXXXXX.",
  "..XXXXXXXX..",
  "...XXXXXX...",
  "....XXXX....",
  ".....XX.....",
  "............",
];

/** AEGIS SPIKE: a heater shield in WARD's colour (a rune3 rim round a rune2 field), a steel boss in its middle and a steel
 *  spike driving out of the boss to the north. Idle a glint crosses the shield; a hit flashes the spike's tip. */
function aegisSpike(g: G, f: number, active: boolean): void {
  const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 12 && y < 12 && SHIELD[y][x] === "X";
  const rim = (x: number, y: number): boolean => at(x, y) && (!at(x, y - 1) || !at(x - 1, y) || !at(x + 1, y) || !at(x, y + 1));
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) px(g, x, y, C.ink);
    }
  }
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if (!at(x, y)) continue;
      if (rim(x, y)) px(g, x, y, !at(x, y - 1) || !at(x - 1, y) ? C.rune4 : C.rune3);
      else px(g, x, y, rim(x + 1, y) || rim(x, y + 1) ? C.rune1 : C.rune2);
    }
  }
  // the glint: a bright band sweeping down the field on frames 1-6
  if (f >= 1 && f <= 6) {
    const y = 3 + f;
    for (let x = 0; x < 12; x++) if (at(x, y) && !rim(x, y) && !(x >= 5 && x <= 7 && y >= 5 && y <= 7)) px(g, x, y, C.white);
  }
  // the boss: a 2x2 steel dome with its shadow to the lower right
  px(g, 5, 5, C.white); px(g, 6, 5, C.steel3); px(g, 5, 6, C.steel2); px(g, 6, 6, C.steel1);
  px(g, 7, 5, C.ink); px(g, 7, 6, C.ink); hline(g, 5, 7, 3, C.ink);
  // the spike, out of the boss and through the shield's top edge
  px(g, 5, 0, C.ink);
  rows(g, 4, 1, [
    "kSk.",
    "kSsk",
    "kSsk",
    "kSsk",
  ], { k: C.ink, S: C.steel3, s: C.steel2 });
  if (active) {
    px(g, 5, 1, C.white); px(g, 5, 2, C.fire4); px(g, 6, 2, C.fire3); px(g, 5, 0, C.fire4);
  }
}

// ========================================================================================================== GRUDGE ROD

/** GRUDGE ROD's tally strokes by idle frame: each of the three on its own phase of a slow, dim glow (red at its strongest). */
const TALLY = [C.red, C.red, C.fire1, C.fire1, C.fire0, C.fire1, C.red, C.red];

/** GRUDGE ROD: a straight dark iron rod, headless, four red tally notches cut into its left edge, one for each heart lost (the
 *  heart itself is not drawn: font.ts ICON.HULL is the same heart as the run bar's, and it read as hull). It is a plain stick
 *  on purpose: the first cold read took a rod with a domed head and red ticks for a bolt (RIVETER), and a pre-read of the
 *  other tries took a thick tally bar for a forge (TEMPER) and a mace for a hammer (RIVETER). Idle the notches glow dimly, each
 *  on its own phase of a slow wave; a hit makes them flare. */
function grudgeRod(g: G, f: number, active: boolean): void {
  rows(g, 0, 0, [
    "....kkkk....",
    "...kSSssk...",
    "...kSssdk...",
    "...kSssdk...",
    "...kSssdk...",
    "...kSssdk...",
    "...kSssdk...",
    "...kSssdk...",
    "...kSssdk...",
    "...kSssdk...",
    "...kssddk...",
    "....kkkk....",
  ], { k: C.ink, S: C.steel2, s: C.steel1, d: C.steel0 });
  // the four notches, cut into the left edge on every other row: red inside, a dark lip under each
  [3, 5, 7, 9].forEach((y, i) => {
    const col = active ? [C.fire5, C.fire4, C.fire5, C.fire4][i] : TALLY[(f + [0, 1, 6, 7][i]) % 8];
    px(g, 3, y, col); px(g, 4, y, col);
    px(g, 3, y + 1, active ? C.fire3 : C.maroon);
    if (active) px(g, 4, y, C.white);
  });
}

// ======================================================================================================= TROPHY CHAIN

/** TROPHY CHAIN's medal sway by idle frame, in px: it swings like a pendulum. */
const SWAY = [0, 1, 1, 0, 0, -1, -1, 0];

/** TROPHY CHAIN: a gold chain slung from the top corners, and an epic's richest finish: a gold medal hanging from it, a
 *  brass rim round a gold face, a plum gem in its heart. Idle the medal swings on the chain; a hit sets its gold edges
 *  glinting white. */
function trophyChain(g: G, f: number, active: boolean): void {
  const sw = SWAY[f];
  const cx = 6 + sw;
  // the chain: two runs from the top corners to the medal's bail
  const left = runPts(0, 0, cx - 1, 3), right = runPts(11, 0, cx, 3);
  for (const run of [left, right]) {
    run.forEach(([x, y], i) => px(g, x, y, active ? (i % 2 ? C.brass4 : C.fire4) : i % 2 ? C.brass2 : C.yellow));
  }
  px(g, cx - 1, 3, C.brass4); px(g, cx, 3, C.brass3);
  if (!active) { // a link of the chain catches the light, a different one each frame
    const links = [...left, ...right];
    const [lx, ly] = links[(f * 3 + 5) % links.length];
    px(g, lx, ly, C.white);
  }
  // the medal: ink, a brass rim lit from the top left, a gold face, a plum gem
  disc(g, cx, 8, 4.1, C.ink);
  disc(g, cx, 8, 3.5, C.brass2);
  for (let y = 4; y < 12; y++) {
    for (let x = cx - 4; x <= cx + 4; x++) {
      if (!inDisc(cx, 8, 3.5, x, y) || inDisc(cx, 8, 2.5, x, y)) continue;
      const d = x - cx + (y - 8);
      px(g, x, y, d <= -2 ? C.brass4 : d <= 1 ? C.brass3 : C.brass1);
    }
  }
  disc(g, cx, 8, 2.5, active ? C.fire4 : C.yellow);
  px(g, cx - 2, 6, C.fire4); px(g, cx - 1, 6, C.fire4); px(g, cx - 2, 7, C.fire4);
  px(g, cx + 1, 9, C.brass3); px(g, cx, 9, C.brass3);
  rect(g, cx - 1, 7, 2, 2, C.plum4);
  px(g, cx - 1, 7, C.plum5); px(g, cx, 8, C.plum3);
  if (active) {
    px(g, cx - 2, 5, C.white); px(g, cx - 3, 6, C.white); px(g, cx - 2, 6, C.white); px(g, cx + 2, 9, C.white);
    px(g, cx - 1, 7, C.white);
  }
}

/** Paint scaling rig `id` at frame f (0-7) into a 12x12 canvas (sprites.ts drawGate asks here first); false for any other id. */
export function drawScaleGate(g: G, id: string, f: number, active: boolean): boolean {
  const n = ((f % 8) + 8) % 8;
  switch (id) {
    case "cindermail": cinderMail(g, n, active); return true;
    case "rotgauge": rotGauge(g, n, active); return true;
    case "leechcoil": leechCoil(g, n, active); return true;
    case "crowdpress": crowdPress(g, n, active); return true;
    case "aegisspike": aegisSpike(g, n, active); return true;
    case "grudgerod": grudgeRod(g, n, active); return true;
    case "trophychain": trophyChain(g, n, active); return true;
    default: return false;
  }
}
