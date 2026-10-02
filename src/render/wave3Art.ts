// 0.8.0 A1 (REQ-BFG-022, REQ-BFG-023): the art of wave 3's 15 modules (output-D1/DESIGN-wave3.md section 3.3, each part's
// Art line), keyed by P1's ids (8 rigs, 2 factories, 2 cores, 3 gear pieces). The game's own entry points call in here
// from their id switches, as H1's raceArt.ts: sprites.ts drawGate (the rigs), factorySprite (the factories) and itemIcon
// (the factory, core and gear icons), machinery.ts drawChute (the chute mouths), coreArt.ts gemColor (the core sockets)
// and cruiser.ts drawTurrets (the gear's hardpoint boxes). Every function here answers only for a wave-3 id and returns
// false, null or undefined for anything else, so every existing part draws exactly as before; and no ITEMS entry carries
// these ids until I1 merges P1, so on this branch nothing in the game reaches them.
// Rigs are 12x12 like every rig, but each has its own silhouette (today's rigs share one 10x10 square); what matters on a
// rig sits in the corners and the centre, because an arrow nozzle covers the middle of whichever edge it leaves by.
// The Art lines that describe battle moments are drawn as frames (`active`, the hit flash every rig already has) or as a
// state argument (Wave3RigState, Wave3FactoryState, Wave3GearState, the gem's `plated`); I1 feeds them from P1's sim
// state (output-A1/REPORT.md section 4 lists each with the event it needs). Same helpers and palette as the rest of the
// render code; light from the top-left; no randomness.

import { C } from "./palette";
import { bevel, disc, fromRows, hline, line, makeCanvas, px, rect, vline, type G } from "./pixel";

type Cv = HTMLCanvasElement;

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Wave 3's ids by kind (P1's, in DESIGN-wave3 3.1's order). */
export const WAVE3_RIGS = ["plateroller", "twingauge", "pincer", "braceframe", "twinlatch", "stoker", "platebreaker", "shieldwall"] as const;
export const WAVE3_FACTORIES = ["twinmould", "armorpress"] as const;
export const WAVE3_CORES = ["anvil", "steambreech"] as const;
export const WAVE3_GEAR = ["twintrigger", "spallcatcher", "seamwelder"] as const;
export const WAVE3_ART_IDS: readonly string[] = [...WAVE3_RIGS, ...WAVE3_FACTORIES, ...WAVE3_CORES, ...WAVE3_GEAR];
const IDS = new Set<string>(WAVE3_ART_IDS);

/** Is `id` one of wave 3's 15 modules (whatever ITEMS holds)? */
export function isWave3Art(id: string): boolean {
  return IDS.has(id);
}

const cache = new Map<string, Cv>();
function cached(k: string, make: () => Cv): Cv {
  let c = cache.get(k);
  if (!c) {
    c = make();
    cache.set(k, c);
  }
  return c;
}

/** Paint character rows at (x, y) ('.' transparent). */
function rows(g: G, x: number, y: number, r: string[], pal: Record<string, string>): void {
  g.drawImage(fromRows(r, pal), x, y);
}

const IRON = { k: C.ink, W: C.white, S: C.steel3, s: C.steel2, d: C.steel1, D: C.steel0 };

/** The ink halo of one pixel of a 2-px-thick bar (a 3x3 square round it), kept inside the 12x12 cell. */
function halo(g: G, x: number, y: number): void {
  const x0 = Math.max(0, x - 1), y0 = Math.max(0, y - 1), x1 = Math.min(12, x + 2), y1 = Math.min(12, y + 2);
  rect(g, x0, y0, x1 - x0, y1 - y0, C.ink);
}

// =================================================================================================================== rigs

/**
 * The battle state a rig's Art line reacts to (all optional; absent = the plain build-screen look):
 *  - matched: TWIN GAUGE's belt matches its twin (P1's E6 mark): the needles lock and the glass glows green;
 *  - crowd: the other active rigs on PINCER's tile, 0-3 (P1's E5 count): its jaws glow hotter;
 *  - shrug: BRACE FRAME is shortening an enemy stall on its tiles: its bolts glow white;
 *  - latch: TWIN LATCH "hold" (one payload held: the amber lamp) or "release" (both go: fingers down, green lamp);
 *  - spent: PLATE BREAKER's hit took a plating (true: a glowing strip hammered in) or found none (false: a plain blow);
 *  - plated: SHIELD WALL's hull holds 12 plating or more (its boss glows).
 */
export interface Wave3RigState {
  matched?: boolean;
  crowd?: number;
  shrug?: boolean;
  latch?: "hold" | "release";
  spent?: boolean;
  plated?: boolean;
}

type RigPainter = (g: G, f: number, active: boolean, st: Wave3RigState) => void;

/** PLATE ROLLER: a squat steel roller press, two rollers nipping a strip of plate between them on a bolted bed. They
 *  turn (the dark notches); a hit squeezes the strip white-hot and up out of the nip toward the hull (the top-right). */
const plateRoller: RigPainter = (g, f, active) => {
  bevel(g, 0, 9, 12, 3, C.steel1, C.steel2, C.steel0, C.ink);
  px(g, 1, 10, C.brass3); px(g, 10, 10, C.brass3);
  // two big rollers, end on, each with a brass hub cap
  const roller = [".kkkk.", "kSSssk", "kSsssk", "ksssdk", "ksssdk", "ksssdk", "kdddDk", ".kkkk."];
  rows(g, 0, 2, roller, IRON);
  rows(g, 6, 2, roller, IRON);
  for (const x of [2, 8]) {
    rect(g, x, 4, 2, 2, C.brass2); px(g, x, 4, C.brass4); px(g, x + 1, 5, C.brass1);
  }
  // each roller's notch walks its rim, the left one anticlockwise and the right one clockwise (they draw the strip up)
  const rim: [number, number][] = [[1, 3], [2, 3], [3, 3], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7], [3, 8], [2, 8], [1, 8], [1, 7], [1, 6], [1, 5], [1, 4]];
  const k = (f * 2) % rim.length;
  const [lx, ly] = rim[(rim.length - k) % rim.length];
  px(g, lx, ly, C.steel0);
  const [rx, ry] = rim[k];
  px(g, 11 - rx, ry, C.steel0);
  // the strip in the nip and the slot it is fed from
  const hot = active ? [C.fire5, C.fire4] : f % 4 === 0 ? [C.fire3, C.fire2] : [C.fire2, C.fire1];
  for (let y = 3; y <= 8; y++) { px(g, 5, y, hot[0]); px(g, 6, y, hot[1]); }
  px(g, 5, 10, hot[1]); px(g, 6, 10, C.fire0);
  if (active) {
    // squeezed white-hot out of the nip and up toward the hull (the top-right, clear of every nozzle)
    px(g, 5, 2, C.fire4); px(g, 6, 2, C.fire5);
    line(g, 7, 1, 10, 0, C.fire3);
    line(g, 6, 1, 9, 0, C.fire4);
    px(g, 11, 0, C.white);
  }
};

/** TWIN GAUGE: a brass twin-dial gauge on a post. Two round glasses; apart, their red needles waver; on a matched belt
 *  (st.matched) the glasses glow green and both needles lock straight up. A hit flashes the needles white. */
const twinGauge: RigPainter = (g, f, active, st) => {
  const m = !!st.matched;
  // post and foot
  rect(g, 4, 6, 4, 4, C.ink); vline(g, 5, 6, 3, C.steel2); vline(g, 6, 6, 3, C.steel1);
  bevel(g, 3, 9, 6, 3, C.brass1, C.brass2, C.brass0, C.ink);
  // the housing
  bevel(g, 0, 0, 12, 7, C.brass2, C.brass4, C.brass1, C.ink);
  hline(g, 5, 5, 2, C.brass1);
  for (const x0 of [1, 7]) {
    const face = m ? C.green : C.bone;
    hline(g, x0 + 1, 1, 2, face); hline(g, x0, 2, 4, face); hline(g, x0, 3, 4, face); hline(g, x0 + 1, 4, 2, face);
    px(g, x0 + 1, 1, m ? C.lime : C.white); // the glass's glint
    px(g, x0 + 3, 4, m ? C.verd3 : C.steel3); // the glass's shade
  }
  // the needles: pivot (x0 + 1, 3) or (x0 + 2, 3); 8 directions around it within the face
  const DIRS: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  const needle = (x0: number, dir: number, piv: number) => {
    const [dx, dy] = DIRS[dir & 7];
    px(g, x0 + piv, 3, C.ink);
    px(g, x0 + piv + dx, 3 + dy, active ? C.white : m ? C.ink : C.red);
  };
  if (m) {
    needle(1, 0, 2); needle(7, 0, 1); // locked together, straight up
  } else {
    const wav = [7, 0, 1, 0, 7, 6, 7, 0];
    needle(1, wav[f & 7], 2);
    needle(7, (wav[(f + 3) & 7] + 2) & 7, 1);
  }
};

/** PINCER: two iron jaws on a swivel arm, open toward the top corners, a brass hinge, a round swivel foot. The jaws
 *  breathe open and shut; a hit snaps them together. The more rigs crowd its tile (st.crowd 0-3), the hotter the jaws. */
const pincer: RigPainter = (g, f, active, st) => {
  const heat = Math.max(0, Math.min(3, Math.floor(st.crowd ?? 0)));
  const tip = [C.steel3, C.fire2, C.fire3, C.fire4][heat];
  const glow = [C.steel2, C.fire1, C.fire2, C.fire3][heat];
  // the swivel foot and the arm
  rows(g, 2, 8, ["..kkkk..", ".kSssdk.", "kSsssddk", ".kkkkkk."], IRON);
  rect(g, 4, 5, 4, 4, C.ink); vline(g, 5, 5, 3, C.steel2); vline(g, 6, 5, 3, C.steel0);
  // the jaws: open (0), half (1) or shut (2)
  const pose = active ? 2 : f % 4 === 3 ? 1 : 0;
  const L: [number, number][][] = [
    [[4, 5], [3, 4], [2, 3], [1, 2], [1, 1], [2, 0]],
    [[4, 5], [3, 4], [3, 3], [2, 2], [2, 1], [3, 0]],
    [[4, 5], [4, 4], [3, 3], [3, 2], [4, 1], [5, 1]],
  ];
  const jaws = [0, 1].map((side) => L[pose].map(([x, y]) => [side ? 11 - x : x, y] as [number, number]));
  for (const pts of jaws) for (const [x, y] of pts) halo(g, x, y);
  jaws.forEach((pts, side) => {
    pts.forEach(([x, y], i) => px(g, x, y, i >= 4 ? tip : i >= 2 ? glow : side ? C.steel1 : C.steel2));
  });
  rect(g, 5, 4, 2, 2, C.brass3); px(g, 5, 4, C.brass4); // the hinge
  if (active) { px(g, 5, 0, C.white); px(g, 6, 0, C.fire4); px(g, 4, 0, C.fire4); }
};

/** BRACE FRAME: an X-braced steel truss, open between its members (the deck shows through), bolted at the corners and
 *  the crossing. A glint walks the bolts; as it shrugs off a spark (st.shrug, or a hit) every bolt glows white. */
const braceFrame: RigPainter = (g, f, active, st) => {
  rows(g, 1, 1, [
    "kkkkkkkkkk",
    "kbssssssbk",
    "ksS....dsk",
    "ks.S..d.dk",
    "ks..bb..dk",
    "ks..bb..dk",
    "ks.d..S.dk",
    "ksd....Sdk",
    "kbddddddbk",
    "kkkkkkkkkk",
  ], { k: C.ink, s: C.steel2, S: C.steel3, d: C.steel1, b: C.brass3 });
  const lit = active || !!st.shrug;
  const bolts: [number, number][] = [[2, 2], [9, 2], [9, 9], [2, 9]];
  if (lit) {
    for (const [x, y] of bolts) px(g, x, y, C.white);
    rect(g, 5, 5, 2, 2, C.white);
    px(g, 11, 0, C.ice); px(g, 10, 1, C.white); px(g, 0, 11, C.ice);
  } else {
    const [x, y] = bolts[(f >> 1) & 3];
    px(g, x, y, C.brass4);
  }
};

/** TWIN LATCH: a clockwork double gate. A brass clock drum with the tally lamp at its heart and a gear tooth walking
 *  round it, and two iron fingers on its sides: cocked up toward the top corners while it waits, dropped together toward
 *  the bottom corners on release (a hit, or st.latch "release": the lamp goes green); st.latch "hold" (one payload held)
 *  blinks the lamp amber. */
const twinLatch: RigPainter = (g, f, active, st) => {
  const release = active || st.latch === "release";
  // the fingers: iron bars from the drum's shoulders (both drawn in ink first, then lit)
  const up: [number, number][] = [[3, 5], [2, 4], [2, 3], [1, 2], [1, 1]];
  const down: [number, number][] = [[3, 7], [2, 8], [2, 9], [1, 10]];
  const left = release ? down : up;
  const fingers = [left, left.map(([x, y]) => [11 - x, y] as [number, number])];
  for (const pts of fingers) for (const [x, y] of pts) halo(g, x, y);
  fingers.forEach((pts, side) => pts.forEach(([x, y], i) => px(g, x, y, i === pts.length - 1 ? C.steel3 : side ? C.steel1 : C.steel2)));
  // the drum
  disc(g, 6, 6.5, 3.6, C.ink);
  disc(g, 6, 6.5, 2.7, C.brass2);
  px(g, 4, 5, C.brass4); px(g, 5, 4, C.brass3); px(g, 4, 6, C.brass3); px(g, 6, 4, C.brass3);
  px(g, 7, 8, C.brass1); px(g, 8, 7, C.brass1);
  // a gear tooth walks round the lamp's window
  const teeth: [number, number][] = [[5, 4], [7, 5], [7, 7], [6, 8], [4, 8], [4, 6]];
  const [tx, ty] = teeth[f % teeth.length];
  px(g, tx, ty, C.steel3);
  // the tally lamp at the drum's heart
  rect(g, 5, 5, 2, 3, C.ink);
  const lamp = release ? C.lime : st.latch === "hold" ? (f & 2 ? C.amber : C.fire1) : C.oil2;
  px(g, 5, 6, lamp); px(g, 6, 6, release ? C.green : lamp === C.oil2 ? C.oil1 : lamp);
  if (release) { px(g, 5, 5, C.white); px(g, 6, 7, C.green); px(g, 5, 7, C.green); }
};

/** STOKER: a soot-black stoker's arm on a hinge over a coal bin, its shovel swinging from one side to the other (its two
 *  arrows aim at two factories); a hit tips the glowing coal off the shovel in a shower of sparks. */
const stoker: RigPainter = (g, f, active) => {
  // the coal bin: a brass-lipped iron box of coal with embers glinting in it
  rows(g, 1, 8, [
    "kkkkkkkkkk",
    "knnnnnnnnk",
    "kcecccecck",
    "kkkkkkkkkk",
  ], { k: C.ink, n: C.brass2, c: C.soil2, e: f & 2 ? C.fire3 : C.fire1 });
  // the arm swings like a pendulum over the bin: out to the left corner, across, out to the right corner, back
  const ARM: [number, number][] = [[1, 2], [2, 1], [4, 0], [7, 0], [9, 1], [10, 2], [7, 0], [4, 0]];
  const [ex, ey] = ARM[f & 7];
  const ax = 5.5, ay = 7;
  const steps = 7;
  const at = (i: number): [number, number] => [Math.round(ax + ((ex - ax) * i) / steps), Math.round(ay + ((ey - ay) * i) / steps)];
  for (let i = 0; i <= steps; i++) { const [x, y] = at(i); halo(g, x, y); }
  for (let i = 1; i < steps; i++) { const [x, y] = at(i); px(g, x, y, i < 3 ? C.slate4 : C.slate3); } // the sooty arm, lit
  // the shovel blade at its end, carrying a glowing coal (or tipping it off in sparks on a hit)
  rect(g, ex - 1, ey, 3, 1, C.steel2);
  px(g, ex, ey, active ? C.white : f % 3 ? C.fire3 : C.fire4);
  if (active) for (const [dx, dy] of [[-1, 1], [1, 1], [0, 2], [2, 0], [-2, 0]]) px(g, Math.max(0, Math.min(11, ex + dx)), Math.min(11, ey + dy), dx === 0 ? C.fire5 : C.fire4);
  // the hinge pin, brass
  rect(g, 4, 6, 3, 3, C.ink); px(g, 5, 7, C.brass3); px(g, 5, 6, C.brass4);
};

/** PLATE BREAKER: a scrapper's breaking hammer hung from a rusted T-frame: the beam across the top, the hammer's haft
 *  for the T's stem, a broad steel head below. Raised, it swings under the beam; a hit slams it down on the passing slug
 *  and hammers in a strip of plate pried off the hull, white-hot in the bottom corners (or, st.spent false, a plain blow
 *  with grey chips: no plating to take). */
const plateBreaker: RigPainter = (g, f, active, st) => {
  // the beam, rust-red, braced down to each side by a strut, bolted at its ends
  rows(g, 0, 0, [
    "kkkkkkkkkkkk",
    "kRRrrrrrrrQk",
    "kQkkkkkkkkQk",
    "kQk......kQk",
    "kkk......kkk",
  ], { k: C.ink, R: C.rust4, r: C.rust3, Q: C.rust1 });
  px(g, 1, 1, C.steel3); px(g, 10, 1, C.steel2);
  // the hammer: a long wooden haft from the beam's middle into a brass collar, and a heavy breaking head (a blunt face
  // left, a wedge right); it swings while raised and slams down on a hit
  const sway = active ? 0 : [0, 1, 1, 0, 0, -1, -1, 0][f];
  const hy = active ? 7 : 6;
  const hx = 2 + sway;
  rect(g, 4, 2, 4, hy - 1, C.ink);
  vline(g, 5, 2, hy - 2, C.wood3); vline(g, 6, 2, hy - 2, C.wood1);
  rows(g, hx, hy, [
    "kkkkkkkk.",
    "kSSnnSSsk",
    "kdssssdDk",
    "kkkkkkkk.",
  ], { ...IRON, n: C.brass3 });
  if (active) {
    const plate = st.spent !== false;
    // the strip of plate, pried off the hull and hammered in under the head, white-hot; or grey chips off a plain blow
    if (plate) {
      hline(g, 1, 11, 10, C.fire3);
      hline(g, 2, 10, 2, C.fire4); hline(g, 8, 10, 2, C.fire4);
      px(g, 0, 10, C.white); px(g, 11, 10, C.white);
    }
    for (const [x, y] of [[1, 8], [10, 8], [0, 6], [11, 6]]) px(g, x, y, plate ? C.fire4 : C.steel3);
  } else {
    px(g, 1, 10, f & 4 ? C.fire1 : C.fire0); px(g, 2, 11, C.fire0); // the end of the last strip, cooling on the deck
  }
};

/** SHIELD WALL: a towering riveted wall segment (the whole cell, corners cut), a brass-rimmed boss in the middle and a
 *  plate-rolling jaw just inside each side, where its four arrows leave. The jaws' slits glow; a hit makes all four spit
 *  white-hot plate; while the hull holds 12+ plating (st.plated) the boss glows. */
const shieldWall: RigPainter = (g, f, active, st) => {
  // the slab (corners cut), rivets at its corners, a brass-rimmed boss; J the jaws' rollers either side of each slit
  rows(g, 0, 0, [
    ".kkkkkkkkkk.",
    "kSSSSSSSSSsk",
    "kSbssssssbdk",
    "kSssJ..Jssdk",
    "kSsJnnnnJsdk",
    "kSs.nBBn.sdk",
    "kSs.nBbn.sdk",
    "kSsJnnnnJsdk",
    "kSssJ..Jssdk",
    "kSbddddddbdk",
    "ksddddddddDk",
    ".kkkkkkkkkk.",
  ], { k: C.ink, S: C.steel3, s: C.steel2, d: C.steel1, D: C.steel0, b: C.brass3, n: C.brass2, B: C.brass4, J: C.steel0 });
  // the four jaws' slits, one inside each side's middle (clear of the nozzles), glowing in turn; all white on a hit
  const slit = (on: boolean) => (active ? C.white : on ? C.fire3 : C.fire1);
  hline(g, 5, 3, 2, slit((f & 3) === 0));
  vline(g, 8, 5, 2, slit((f & 3) === 1));
  hline(g, 5, 8, 2, slit((f & 3) === 2));
  vline(g, 3, 5, 2, slit((f & 3) === 3));
  if (st.plated) { rect(g, 5, 5, 2, 2, f & 2 ? C.fire4 : C.fire3); px(g, 5, 5, C.white); }
  if (active) for (const [x, y] of [[0, 0], [11, 0], [0, 11], [11, 11], [1, 1], [10, 10]]) px(g, x, y, C.fire4);
};

const RIG_ART: Record<string, RigPainter> = {
  plateroller: plateRoller, twingauge: twinGauge, pincer, braceframe: braceFrame, twinlatch: twinLatch, stoker,
  platebreaker: plateBreaker, shieldwall: shieldWall,
};

/** Paint wave-3 rig `id` at frame f (0-7) into a 12x12 canvas (sprites.ts drawGate's default asks here first); false
 *  for any other id. */
export function drawWave3Gate(g: G, id: string, f: number, active: boolean, st: Wave3RigState = {}): boolean {
  if (!own(RIG_ART, id)) return false;
  RIG_ART[id](g, ((f % 8) + 8) % 8, active, st);
  return true;
}

const stKey = (st: Wave3RigState): string =>
  `${st.matched ? "m" : ""}${st.crowd ? `c${Math.min(3, Math.floor(st.crowd))}` : ""}${st.shrug ? "s" : ""}${st.latch ?? ""}${st.spent === false ? "n" : ""}${st.plated ? "p" : ""}`;

/** A wave-3 rig's 12x12 sprite in a battle state (I1 draws it in place of sprites.ts gateSprite when P1's sim gives the
 *  state); null for any other id. With an empty state it equals gateSprite(id, frame, active). */
export function wave3GateSprite(id: string, frame: number, active: boolean, st: Wave3RigState = {}): Cv | null {
  if (!own(RIG_ART, id)) return null;
  const f = ((frame % 8) + 8) % 8;
  return cached(`w3gate:${id}:${f}:${active ? 1 : 0}:${stKey(st)}`, () => {
    const [c, g] = makeCanvas(12, 12);
    drawWave3Gate(g, id, f, active, st);
    return c;
  });
}

/** STOKER's Art line: "their chimneys flare". A 7x9 flare (frames 0-3), for I1 to draw over each factory a working
 *  STOKER points at (P1's E3: deck.ts rigFactoryHits, the stoker online), at the factory's top-right corner. */
export function stokeFlare(frame: number): Cv {
  const f = ((frame % 4) + 4) % 4;
  return cached(`w3flare:${f}`, () => {
    const [c, g] = makeCanvas(7, 9);
    const H = [6, 8, 7, 5][f];
    for (let y = 0; y < H; y++) {
      const w = y < 2 ? 1 : y < 4 ? 3 : 5;
      const x0 = 3 - (w >> 1) + (y < 3 ? (f + y) & 1 : 0); // the tip flickers left and right
      const col = y < 2 ? C.fire5 : y < 4 ? C.fire4 : y < H - 1 ? C.fire3 : C.fire2;
      rect(g, x0, 9 - H + y, w, 1, col);
    }
    return c;
  });
}

// ============================================================================================================= factories

/** The battle state a wave-3 factory's Art line reacts to: ARMOR PRESS's plating press, `plateT` seconds after it last
 *  pressed plating onto the hull (P1's FactoryState.plateTimer wrapping, or its `plate` event): the glowing plate slides
 *  down the chute for 0.8 s. Absent: no plate on the chute. */
export interface Wave3FactoryState {
  plateT?: number;
}

/** The spout columns (left edges) of TWIN MOULD: two at 1-2 stars, three at 3 (THIRD SPRUE). */
function mouldSpouts(stars: number): number[] {
  return stars >= 3 ? [3, 10, 17] : [5, 15];
}

/**
 * TWIN MOULD: a two-spouted iron mould on a tilting cradle. The mould block rocks on its curved cradle over a steel bed;
 * its cavities hold glowing metal; on a cast (the stamp flash) it tips and pours a glowing slug from each spout into its
 * chute, side by side. 2 stars band it with brass; 3 stars cut a third cavity, spout and chute (THIRD SPRUE).
 */
function drawTwinMould(f: number, flash: boolean, stars: number): Cv {
  const [c, g] = makeCanvas(24, 24);
  const xs = mouldSpouts(stars);
  // the bed and the chutes in it (the slugs drop through them onto the belts)
  bevel(g, 0, 17, 24, 7, C.steel1, C.steel2, C.steel0, C.ink);
  for (const x of xs) {
    rect(g, x - 1, 18, 6, 5, C.ink);
    hline(g, x, 18, 4, C.brass3); px(g, x, 19, C.brass2); px(g, x + 3, 19, C.brass1);
    rect(g, x + 1, 19, 2, 3, C.belt0);
  }
  // the cradle: a curved rocker under the block, on two feet
  const tilt = flash ? 0 : (f >> 1) % 4 === 1 ? 1 : (f >> 1) % 4 === 3 ? -1 : 0; // it rocks; it pours tipped forward
  for (let x = 4; x <= 19; x++) {
    const dy = Math.round(Math.pow((x - 11.5) / 8, 2) * 2);
    rect(g, x, 14 + dy, 1, 2, C.ink);
    px(g, x, 14 + dy, x < 12 ? C.brass3 : C.brass1);
  }
  for (const x of [5, 17]) { rect(g, x, 16, 2, 2, C.ink); px(g, x, 16, C.brass2); }
  // the mould block, shifted one pixel as it rocks (and forward as it pours): a lit top face with the pouring cups sunk
  // in it, a darker front face banded in brass at 2 stars, and a pivot boss either side
  const ox = tilt, oy = flash ? 1 : 0;
  bevel(g, 2 + ox, 3 + oy, 20, 11, C.steel1, C.steel2, C.steel0, C.ink);
  rect(g, 3 + ox, 4 + oy, 18, 4, C.steel2);
  hline(g, 3 + ox, 4 + oy, 18, C.steel3);
  hline(g, 3 + ox, 8 + oy, 18, C.steel0);
  if (stars >= 2) for (const y of [10, 12]) { hline(g, 3 + ox, y + oy, 18, C.brass2); px(g, 3 + ox, y + oy, C.brass4); }
  for (const x of [0, 21]) { rect(g, x, 6 + oy, 3, 3, C.ink); px(g, x + 1, 7 + oy, C.brass3); } // the cradle's pivots stay put
  // the cups, each over its spout, full of molten metal under a dark skin that cracks and glows (white-hot as it pours)
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] + ox, y = 4 + oy;
    rect(g, x - 1, y, 6, 4, C.ink);
    hline(g, x, y + 1, 4, flash ? C.fire5 : C.fire3);
    hline(g, x, y + 2, 4, flash ? C.fire4 : C.fire2);
    if (!flash) {
      px(g, x + ((f + i * 3) % 4), y + 1, C.fire4); // a glint crosses the pool
      if ((f + i) % 4 === 2) px(g, x + 1, y + 2, C.fire1); // a skin forms and breaks
    }
    // the spout lip, out of the block's front face
    rect(g, x, 12 + oy, 4, 3, C.ink); hline(g, x + 1, 12 + oy, 2, C.steel3); px(g, x + 1, 13 + oy, flash ? C.fire4 : C.steel0);
  }
  if (flash) {
    // the pour: a glowing slug falling from each spout into its chute, side by side
    for (const x0 of xs) {
      const x = x0 + ox;
      vline(g, x + 1, 15, 4, C.fire4); vline(g, x + 2, 15, 4, C.fire3);
      px(g, x + 1, 19, C.white); px(g, x + 2, 19, C.fire4);
    }
  } else if ((f & 3) === 2) {
    for (const x0 of xs) px(g, x0 + ox + 1, 15, C.fire3); // a drip gathers on each spout
  }
  return c;
}

/**
 * ARMOR PRESS: a dwarven drop-press on a granite C-frame. The frame's column rises on the left and its iron arm carries a
 * steam cylinder; the piston drives a die down onto an anvil bed, and a chute runs off the bed's right edge down to the
 * corner, where the pressed plates lie stacked (one, two or three: the stars). Steam puffs off the cylinder and the
 * piston breathes; on a stamp (the flash) the die drops on a white-hot plate and the bed throws sparks; st.plateT slides a
 * glowing plate down the chute (the plating it presses onto the hull every 4 seconds).
 */
function drawArmorPress(f: number, flash: boolean, stars: number, st: Wave3FactoryState): Cv {
  const [c, g] = makeCanvas(24, 24);
  // the plinth and the granite column with its iron bands
  bevel(g, 0, 20, 24, 4, C.stone2, C.stone3, C.stone1, C.ink);
  bevel(g, 0, 3, 7, 18, C.stone2, C.stone4, C.stone1, C.ink);
  for (const y of [8, 14]) { hline(g, 1, y, 5, C.steel1); hline(g, 1, y + 1, 5, C.steel0); px(g, 3, y, C.brass3); }
  // the iron arm over the bed, bolted
  bevel(g, 0, 1, 19, 5, C.steel1, C.steel2, C.steel0, C.ink);
  for (const x of [2, 16]) px(g, x, 3, C.brass3);
  // the steam cylinder on the arm, banded in brass
  bevel(g, 8, 0, 8, 8, C.steel2, C.steel3, C.steel0, C.ink);
  hline(g, 9, 2, 6, C.brass3); hline(g, 9, 5, 6, C.brass1);
  // the piston: up (it breathes on the idle frames), or down on a stamp
  const down = flash;
  const dieY = down ? 12 : f % 4 === 2 ? 9 : 8;
  rect(g, 11, 7, 2, dieY - 7, C.ink);
  if (dieY - 8 > 0) vline(g, 11, 8, dieY - 8, C.steel3);
  bevel(g, 8, dieY, 8, 4, C.steel1, C.steel3, C.steel0, C.ink);
  hline(g, 9, dieY + 2, 6, C.steel0);
  // the anvil bed and the plate on it, glowing from the forge (white-hot under the die)
  bevel(g, 6, 16, 13, 4, C.steel0, C.steel1, C.ink, C.ink);
  rect(g, 8, 14, 8, 3, C.ink);
  hline(g, 9, 15, 6, down ? C.white : f & 4 ? C.fire3 : C.fire2);
  hline(g, 9, 16, 6, down ? C.fire4 : C.fire1);
  px(g, 9, 15, down ? C.fire5 : C.fire4);
  // the chute off the bed's right edge, down to the corner
  for (let i = 0; i < 5; i++) {
    rect(g, 18 + i, 15 + i, 2, 3, C.ink);
    px(g, 18 + i, 16 + i, C.steel2);
  }
  // the plates pressed so far, stacked at the chute's foot (1-3 by stars)
  const n = Math.max(1, Math.min(3, Math.floor(stars)));
  for (let k = 0; k < n; k++) {
    rect(g, 17, 21 - k * 2, 7, 3, C.ink);
    hline(g, 18, 22 - k * 2, 5, k === n - 1 ? C.plate3 : C.plate2);
    px(g, 22, 22 - k * 2, C.plate1);
  }
  // steam off the cylinder's vent, rising and thinning to the right
  for (let k = 0; k < 2; k++) {
    const p = ((f + k * 4) % 8) / 8;
    const x = 17 + Math.round(p * 4), y = 4 - Math.round(p * 4);
    px(g, x, y, p < 0.5 ? C.white : C.slate4);
    if (p < 0.4) px(g, x + 1, y, C.slate4);
  }
  if (flash) for (const [x, y] of [[7, 14], [17, 13], [6, 15], [17, 15], [5, 13]]) px(g, x, y, y < 15 ? C.fire4 : C.yellow);
  // the plating press: a glowing plate slides down the chute
  if (st.plateT !== undefined && st.plateT >= 0 && st.plateT < 0.8) {
    const i = Math.min(4, Math.floor((st.plateT / 0.8) * 5));
    rect(g, 17 + i, 13 + i, 4, 3, C.ink);
    hline(g, 18 + i, 14 + i, 2, st.plateT < 0.3 ? C.fire4 : C.fire3);
  }
  return c;
}

/** The 24x24 sprite of wave-3 factory `id` at frame f (0-7) (sprites.ts factorySprite asks here after the wave-1 art);
 *  undefined for any other id. `st` is ARMOR PRESS's plating press (for I1). */
export function wave3FactoryArt(id: string, f: number, flash: boolean, stars: number, st: Wave3FactoryState = {}): Cv | undefined {
  if (id === "twinmould") return drawTwinMould(f, flash, stars);
  if (id === "armorpress") return drawArmorPress(f, flash, stars, st);
  return undefined;
}

/** The glow inside a wave-3 factory's chute (machinery.ts drawChute): TWIN MOULD's fresh-cast orange, ARMOR PRESS's
 *  pressed-plate steel-blue; undefined for any other factory. */
export function wave3ChuteMouth(id: string): string | undefined {
  return id === "twinmould" ? C.fire3 : id === "armorpress" ? C.plate3 : undefined;
}

// ================================================================================================================= cores

/** The socket gem of each wave-3 core on its gun (coreArt.ts gemColor asks here after CORE_GEM): ANVIL BREECH the plating
 *  ramp's steel-blue, STEAM BREECH steam white. */
export const WAVE3_CORE_GEM: Record<string, string> = { anvil: C.plate2, steambreech: C.white };

/** A wave-3 core's gem colour, or undefined for any other id. `plated` (P1: the turret's plated flag, Battle.chambers):
 *  STEAM BREECH's gauge kicks into the red while the hull is plated. */
export function wave3Gem(def: string, plated = false): string | undefined {
  if (!own(WAVE3_CORE_GEM, def)) return undefined;
  return def === "steambreech" && plated ? C.red : WAVE3_CORE_GEM[def];
}

/** ANVIL BREECH's Art line: "sparks fly off the face with each shot". A 9x7 spark burst (frames 0-2, about 0.1 s each),
 *  for I1 to play at the muzzle on the `fire` event of a gun whose core routine is P1's "anvil". */
export function anvilSparks(frame: number): Cv {
  const f = Math.max(0, Math.min(2, Math.floor(frame)));
  return cached(`w3anvil:${f}`, () => {
    const [c, g] = makeCanvas(9, 7);
    const pts: [number, number, string][][] = [
      [[4, 6, C.white], [3, 5, C.fire5], [5, 5, C.fire5], [4, 4, C.fire4], [2, 4, C.fire4], [6, 4, C.fire4]],
      [[4, 3, C.fire5], [1, 3, C.fire4], [7, 3, C.fire4], [2, 1, C.fire3], [6, 1, C.fire3], [4, 2, C.yellow], [0, 5, C.fire3], [8, 5, C.fire3]],
      [[1, 0, C.fire2], [7, 0, C.fire2], [0, 2, C.fire1], [8, 2, C.fire1], [4, 0, C.fire3]],
    ];
    for (const [x, y, col] of pts[f]) px(g, x, y, col);
    return c;
  });
}

// ================================================================================================================== gear

/** The battle state a wave-3 gear piece's Art line reacts to: `pair` (seconds since this turret took a pair: P1's E2
 *  `pair` event; TWIN TRIGGER's lamp and SEAM WELDER's seam light for 0.3 s), `charge` (SPALL CATCHER's charge over its
 *  cap, 0-1: P1's TurretState.spall / max; the plate glows hotter). */
export interface Wave3GearState {
  pair?: number;
  charge?: number;
}

/** A wave-3 gear piece's 3x3 face inside its 5x5 hardpoint box on the gun (cruiser.ts drawTurrets), row by row; null for
 *  any other id. TWIN TRIGGER: two brass hammers on a steel link over a lamp (green on a pair). SPALL CATCHER: a dark iron
 *  catch-plate with a hot core that glows hotter as it charges. SEAM WELDER: an arcane gimbal and its electrode over a
 *  seam that glows as a pair is welded. */
export function wave3GearFace(def: string, st: Wave3GearState = {}): string[] | null {
  const lit = st.pair !== undefined && st.pair >= 0 && st.pair < 0.3;
  switch (def) {
    case "twintrigger":
      return [C.brass3, C.steel1, C.brass3, C.steel2, C.steel2, C.steel2, C.steel0, lit ? C.lime : C.oil2, C.steel0];
    case "spallcatcher": {
      const q = Math.max(0, Math.min(1, st.charge ?? 0));
      const core = q >= 0.99 ? C.fire4 : q >= 0.66 ? C.fire3 : q >= 0.33 ? C.fire2 : C.fire1;
      return [C.steel1, C.steel2, C.steel1, C.steel2, core, C.steel0, C.steel1, C.steel0, C.steel0];
    }
    case "seamwelder":
      return [C.plum4, C.ice, C.plum4, C.plum3, lit ? C.white : C.ice, C.plum3, C.steel2, lit ? C.fire4 : C.fire1, C.steel2];
    default:
      return null;
  }
}

// ================================================================================================================= icons

/** Draw the 12x12 icon of a wave-3 factory, core or gear piece (shop card, cargo, inspector; sprites.ts itemIcon asks
 *  here first); false for any other id. A wave-3 rig's icon is its idle frame, as every rig's is. */
export function drawWave3Icon(g: G, id: string): boolean {
  switch (id) {
    case "twinmould": { // the iron mould's two glowing cavities, a slug dropping from each spout into its chute
      bevel(g, 0, 1, 12, 6, C.steel1, C.steel2, C.steel0, C.ink);
      for (const x of [2, 7]) {
        rect(g, x, 2, 3, 3, C.ink); rect(g, x, 3, 3, 1, C.fire2); px(g, x + 1, 2, C.fire4); px(g, x, 3, C.fire3);
        rect(g, x + 1, 7, 1, 2, C.fire4); px(g, x + 1, 9, C.fire3);
        rect(g, x - 1, 10, 5, 2, C.ink); hline(g, x, 10, 3, C.brass3);
      }
      return true;
    }
    case "armorpress": { // a steam piston and die over a glowing plate, the plate sliding down its chute
      rows(g, 0, 0, [
        "...kkkkkk...",
        ".W.kSssdk...",
        "W..kbbbbk...",
        "...kkddkk...",
        "..kkkkkkkk..",
        "..kSssssdk..",
        "..kkkkkkkk..",
        "kkkFFFFFFkk.",
        "kGGGGGGGGGkk",
        "kkkkkkkkkfFk",
        "........kkfk",
        ".........kkk",
      ], { k: C.ink, W: C.white, S: C.steel3, s: C.steel2, d: C.steel1, b: C.brass2, F: C.fire3, f: C.fire2, G: C.stone3 });
      return true;
    }
    case "anvil": { // a squat black anvil, its horn the muzzle, sparks off the face
      rows(g, 0, 0, [
        "..y..W....y.",
        "Y....Y..Y...",
        ".kkkkkkkk...",
        "kSSSSSSSSkk.",
        "kddddddddSSk",
        ".kdddddDDDkk",
        "..kkdddkk...",
        "...kdddk....",
        "..kddddDk...",
        ".kdddddDDk..",
        ".kkkkkkkkk..",
        "............",
      ], { k: C.ink, S: C.steel2, d: C.steel0, D: C.belt2, y: C.fire4, Y: C.yellow, W: C.white });
      return true;
    }
    case "steambreech": { // a brass breech in a steam jacket, a little pressure gauge on top, steam puffing off it
      rows(g, 0, 0, [
        "....kkkk....",
        ".W.kbbbbk.W.",
        "W..kbrkbk..W",
        "....kkkk....",
        "kkkkkkkkkkkk",
        "kdSdSdSdSdSk",
        "kBnnnnnnnnnk",
        "knnnnnnnnnnk",
        "kNNNNNNNNNNk",
        "kdsdsdsdsdsk",
        "kkkkkkkkkkkk",
        "..kk....kk..",
      ], { k: C.ink, W: C.white, b: C.bone, r: C.red, S: C.steel3, s: C.steel2, d: C.steel1, B: C.brass4, n: C.brass3, N: C.brass1 });
      return true;
    }
    case "twintrigger": { // a double trigger: two cocked brass hammers linked by a bar, the green pair lamp between
      // them, two triggers under the receiver inside one steel guard
      rows(g, 0, 0, [
        ".kkk....kkk.",
        ".kbbk..kbbk.",
        "..knbkkbnk..",
        "..kknLLnkk..",
        ".kSSSSSSSSk.",
        ".ksssssssdk.",
        ".kkdkkkdkkk.",
        "..ksdk.sdk..",
        ".ks.kk..kdk.",
        ".ks......dk.",
        "..kdddddDk..",
        "...kkkkkk...",
      ], { k: C.ink, L: C.lime, n: C.brass3, b: C.brass4, S: C.steel3, s: C.steel2, d: C.steel1, D: C.steel0 });
      return true;
    }
    case "spallcatcher": { // a dented iron catch-plate bolted behind a breech, glowing with the hits it has caught
      rows(g, 0, 0, [
        "..kkkkkkkk..",
        ".kbddddddbk.",
        "kddDdddDddDk",
        "kdDdfffdDdDk",
        "kddfFYFfdDDk",
        "kdDfYWYfDdDk",
        "kddfFYFfdDDk",
        "kdDdfffdDdDk",
        "kddDdddDddDk",
        ".kbDDDDDDbk.",
        "..kkkkkkkk..",
        "............",
      ], { k: C.ink, b: C.brass3, d: C.steel1, D: C.steel0, f: C.fire1, F: C.fire2, Y: C.fire3, W: C.fire4 });
      return true;
    }
    case "seamwelder": { // an arc-welder on a brass gimbal, its arc crackling down onto a glowing seam between two plates
      rows(g, 0, 0, [
        "...kkkkkk...",
        "..kbbbbbbk..",
        ".kbkpppkbk..",
        ".kbkpSpkbk..",
        "..kbkskbk...",
        "...kkskk....",
        ".....I......",
        "....I.......",
        ".....W......",
        "kkkkkkkkkkkk",
        "kssssFsssssk",
        "kddddfddddDk",
      ], { k: C.ink, b: C.brass3, p: C.plum3, S: C.steel3, s: C.steel2, d: C.steel1, D: C.steel0, I: C.ice, W: C.white, F: C.fire4, f: C.fire2 });
      return true;
    }
    default:
      return false;
  }
}
