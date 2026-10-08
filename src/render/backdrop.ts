// MOTION-1 (REQ-BFG-071; MOTION-2 ships it in every build): three code-drawn seas in the game's pixel style, chosen
// by day (motion.ts seaForDay): CALM SEA (days 1-3), STORM (4-7) and EMBER SEA (8-10). Each is a stack of parallax
// layers that scroll right to left, far layers slow and near layers fast: the scroll is what shows the carriers' speed
// (they stay roughly in place). Every layer is pre-rendered once into a cached canvas as wide as the screen and blitted
// twice (wrapped) at a whole-pixel offset; the caches are rebuilt on a resize, a setting change or a DPR change (the
// key). Contrast stays low so the boards and their numbers read at a glance. STORM's rain is the one thing drawn per
// frame (a few dozen streaks); it has no full-screen flash, only a soft slow brightening, and neither with reduce motion.
// Visual randomness comes from the display PRNG (motion.ts displayRng), seeded per battle: stills and videos repeat.

// FIELD-1 (REQ-BFG-075): eight settings in three media (render/scenery.ts). WATER's are the three seas above, their art
// unchanged (CALM SEA is OPEN SEA, STORM is STORM SEA). GROUND (FOREST, DESERT, BADLANDS) and AIR (SKY, STORM CLOUDS)
// use the same idiom: code-drawn pixel art in three cached parallax layers (far slow and opaque, mid and near
// transparent and faster), light from the upper left, a dithered vignette. Contrast stays low and dusky, like the seas:
// the boards are the bright thing. The busiest marks (trees, mesas, spires, cactus, cumulus) go between the lanes and
// toward the edges: a setting is built knowing the rows the boards sit in (SeaFrame.bands) and keeps its features out
// of them. STORM CLOUDS draws rain and dim lightning glows inside its cloud banks per frame (never a full-screen flash;
// neither with reduce motion).

import { C } from "./palette";
import { makeCanvas, rect, type G } from "./pixel";
import { displayRng, type SceneId, type SeaKind } from "./motion";

type Cv = HTMLCanvasElement;

interface SeaLook {
  base: string; // the water
  deep: string; // swell troughs (far)
  swell: string; // swell crests (far)
  crest: string; // wave crests (mid)
  under: string; // a crest's shadow (mid)
  foam: string; // whitecaps (near)
  spark: string; // rare glints (near)
  rain: string;
  speeds: [number, number, number]; // far, mid, near (logical px per second)
  crests: number; // mid marks per 10,000 px
  caps: number; // near marks per 10,000 px
}

/** The seas: low contrast by design (the boards are the bright thing on screen). */
export const SEAS: Record<SeaKind, SeaLook> = {
  calm: {
    base: "#0C2230", deep: "#0A1D29", swell: "#0F2836", crest: "#1C4252", under: "#0A1B26", foam: "#3D6B7C", spark: "#6E9FAE",
    rain: "#4F6C7A", speeds: [3, 9, 22], crests: 20, caps: 2.5,
  },
  storm: {
    base: "#0B1820", deep: "#08131A", swell: "#0F1F28", crest: "#21394A", under: "#071118", foam: "#4E6E7C", spark: "#7F9AA5",
    rain: "#5B7480", speeds: [5, 14, 34], crests: 34, caps: 9,
  },
  ember: {
    base: "#150C0C", deep: "#100909", swell: "#1C0F0E", crest: "#3E1710", under: "#0C0707", foam: "#7A2A14", spark: "#E0561B",
    rain: "#3E454C", speeds: [3, 8, 20], crests: 24, caps: 3,
  },
};

/** Draw `f` at x and at x +- W, so a mark that crosses the seam is whole on both sides (the layer tiles). */
function wrapped(W: number, x: number, w: number, f: (x: number) => void): void {
  f(x);
  if (x + w > W) f(x - W);
  if (x < 0) f(x + W);
}

/** Far layer: the water itself, with long, soft swell bands (dithered, very low contrast). Opaque. */
function farLayer(W: number, H: number, s: SeaLook, rnd: () => number): Cv {
  const [c, g] = makeCanvas(W, H);
  rect(g, 0, 0, W, H, s.base);
  const n = Math.round((W * H) / 900);
  for (let k = 0; k < n; k++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
    const len = 14 + Math.floor(rnd() * 40);
    const col = rnd() < 0.5 ? s.deep : s.swell;
    wrapped(W, x, len, (xx) => {
      for (let i = 0; i < len; i++) if ((i + y) % 2 === 0 || (i > 3 && i < len - 4)) rect(g, xx + i, y, 1, 1, col);
      for (let i = 4; i < len - 6; i++) if ((i + y) % 2 === 0) rect(g, xx + i, y + 1, 1, 1, col);
    });
  }
  return c;
}

/** Mid layer: wave crests, short light dashes over a dark underline ("~" marks). Transparent. */
function midLayer(W: number, H: number, s: SeaLook, rnd: () => number): Cv {
  const [c, g] = makeCanvas(W, H);
  const n = Math.round((W * H * s.crests) / 10000);
  for (let k = 0; k < n; k++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
    const len = 3 + Math.floor(rnd() * 5);
    wrapped(W, x, len + 2, (xx) => {
      rect(g, xx + 1, y, len, 1, s.crest);
      rect(g, xx, y + 1, 1, 1, s.crest);
      rect(g, xx + 2, y + 1, len, 1, s.under);
    });
  }
  return c;
}

/** Near layer: whitecaps and rare glints (EMBER SEA: glowing flecks). Transparent. */
function nearLayer(W: number, H: number, s: SeaLook, rnd: () => number): Cv {
  const [c, g] = makeCanvas(W, H);
  const n = Math.round((W * H * s.caps) / 10000);
  for (let k = 0; k < n; k++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
    const len = 2 + Math.floor(rnd() * 4);
    const glint = rnd() < 0.18;
    wrapped(W, x, len, (xx) => {
      rect(g, xx, y, len, 1, glint ? s.spark : s.foam);
      if (len > 3) rect(g, xx + 1, y - 1, len - 2, 1, s.foam);
    });
  }
  return c;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** A dithered ink vignette (screen-fixed), as the floor's: it keeps the eye on the boards. */
function vignette(W: number, H: number): Cv {
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = C.ink;
  const band = Math.max(10, Math.round(Math.min(W, H) * 0.1));
  for (let i = 0; i < band; i++) {
    const th = (1 - i / band) * 0.6 * 16;
    for (let y = 0; y < H; y++) {
      if (BAYER[(y & 3) * 4 + (i & 3)] < th) { g.fillRect(i, y, 1, 1); g.fillRect(W - 1 - i, y, 1, 1); }
    }
    for (let x = 0; x < W; x++) {
      if (BAYER[(i & 3) * 4 + (x & 3)] < th) { g.fillRect(x, i, 1, 1); g.fillRect(x, H - 1 - i, 1, 1); }
    }
  }
  return c;
}

export interface SeaFrame {
  W: number;
  H: number;
  /** FIELD-1: any setting (the still screens pass the day's sea). */
  kind: SceneId;
  /** FIELD-1: the rows the boards sit in, as [y0, y1) pairs in backdrop px (ground and air settings keep their features
   *  out of them; part of their cache key). The seas ignore it: their art and keys are MOTION-1's. */
  bands?: readonly number[];
  /** Water travelled (MotionModel.dist): the layers' scroll. */
  dist: number;
  /** The display clock (rain, the storm's soft brightening). */
  t: number;
  reduced: boolean;
  seed: number;
  /** The view's device-pixel scale and DPR (part of the cache key). */
  scale: number;
  dpr: number;
}

/** The sea behind a battle: three cached parallax layers and a vignette, plus STORM's rain. MOTION-2: the still screens
 *  (build, summary, hero preview) draw it held still, flattened into one cached canvas: one blit a frame. */
export class SeaBackdrop {
  private key = "";
  private layers: Cv[] = [];
  private vig: Cv | null = null;
  private flat: Cv | null = null;
  private flatKey = "";
  /** Cache rebuilds so far (tooling: a resize, a setting change or a DPR change makes one). */
  builds = 0;

  private build(f: SeaFrame): void {
    const sea = isSea(f.kind);
    // the seas keep MOTION-1's key exactly; a ground or air setting adds the boards' rows
    const key = `${f.W}x${f.H}:${f.kind}:${f.reduced ? 1 : 0}:${f.seed}:${f.scale}:${f.dpr}` + (sea ? "" : `:${(f.bands ?? []).join(",")}`);
    if (key === this.key) return;
    this.key = key;
    if (isSea(f.kind)) {
      const s = SEAS[f.kind];
      const rnd = displayRng(f.seed ^ (f.kind === "calm" ? 0x1111 : f.kind === "storm" ? 0x2222 : 0x3333));
      this.layers = [farLayer(f.W, f.H, s, rnd), midLayer(f.W, f.H, s, rnd), nearLayer(f.W, f.H, s, rnd)];
      this.glows = [];
    } else {
      const look = LANDS[f.kind];
      const rnd = displayRng(f.seed ^ look.salt);
      const out = look.build(f.W, f.H, rnd, quietRows(f.H, f.bands ?? []));
      this.layers = out.layers;
      this.glows = out.glows ?? [];
    }
    this.vig = vignette(f.W, f.H);
    this.builds++;
  }

  /** STORM CLOUDS: where its lightning glows sit (far-layer px), from the last build. */
  private glows: number[] = [];

  /** The setting's ground colour and its layers' speeds (logical px per second): far, mid, near. */
  static look(kind: SceneId): { base: string; speeds: readonly [number, number, number] } {
    return isSea(kind) ? SEAS[kind] : LANDS[kind];
  }

  /** MOTION-2: the sea held still (no scroll, no rain, no brightening), flattened once per key into one canvas and
   *  blitted once a frame: the still screens' backdrop costs one blit. */
  drawStill(g: G, f: SeaFrame): void {
    this.build(f);
    if (this.flatKey !== this.key || !this.flat) {
      const [c, cg] = makeCanvas(f.W, f.H);
      for (const l of this.layers) cg.drawImage(l, 0, 0);
      cg.drawImage(this.vig!, 0, 0);
      this.flat = c;
      this.flatKey = this.key;
    }
    g.drawImage(this.flat, 0, 0);
  }

  /** Draw the sea at the camera offset (ox, oy) (the arena's shake, as the floor had). */
  draw(g: G, f: SeaFrame, ox = 0, oy = 0): void {
    this.build(f);
    const s = SeaBackdrop.look(f.kind);
    // a shaken frame leaves a strip the layers don't cover: the water's colour fills it
    if (oy !== 0) rect(g, 0, 0, f.W, f.H, s.base);
    for (let i = 0; i < 3; i++) {
      // whole-pixel scroll, right to left: far slow, near fast; drawn at x - W and x, so [0, W) is always covered
      const x = (((Math.round(ox) - Math.floor(f.dist * s.speeds[i])) % f.W) + f.W) % f.W;
      g.drawImage(this.layers[i], x - f.W, oy);
      g.drawImage(this.layers[i], x, oy);
      if (i === 0 && f.kind === "clouds") this.cloudGlows(g, f, x, oy); // inside the far banks, under the mid cloud
    }
    if (f.kind === "storm") this.storm(g, f);
    if (f.kind === "clouds") this.rain(g, f, LANDS.clouds.rain!, 1700);
    g.drawImage(this.vig!, 0, 0);
  }

  /** STORM CLOUDS: dim lightning glows inside the far cloud banks, each on its own slow cycle (a soft swell over 0.7 s
   *  every 9-15 s, at most 16% of a pale violet over a 26 x 14 blob; never a full-screen flash). Reduce motion: none. */
  private cloudGlows(g: G, f: SeaFrame, x: number, oy: number): void {
    if (f.reduced) return;
    const spr = glowSprite();
    for (let i = 0; i + 1 < this.glows.length; i += 2) {
      const period = 9 + (i % 7), ph = (f.t + i * 1.7) % period;
      if (ph > 0.7) continue;
      const a = 0.16 * Math.sin((ph / 0.7) * Math.PI);
      g.globalAlpha = a;
      for (const dx of [x - f.W, x]) g.drawImage(spr, Math.round(dx + this.glows[i] - spr.width / 2), Math.round(oy + this.glows[i + 1] - spr.height / 2));
      g.globalAlpha = 1;
    }
  }

  /** Rain streaks (STORM CLOUDS; deterministic in time and index, as STORM's). Not with reduce motion. */
  private rain(g: G, f: SeaFrame, col: string, per: number): void {
    if (f.reduced) return;
    const n = Math.round((f.W * f.H) / per);
    g.fillStyle = col;
    for (let k = 0; k < n; k++) {
      const h1 = ((k * 2654435761) >>> 0) / 4294967296, h2 = ((k * 40503 + 977) % 1000) / 1000;
      const sp = 170 + h2 * 90;
      const y = (h1 * f.H * 3 + f.t * sp) % (f.H + 20) - 10;
      const x = ((h2 * f.W * 7 - f.t * sp * 0.5) % f.W + f.W) % f.W;
      g.fillRect(Math.round(x), Math.round(y), 1, 3);
      g.fillRect(Math.round(x) - 1, Math.round(y) + 3, 1, 2);
    }
  }

  /** STORM: rain streaks (deterministic in time and index: no per-frame randomness) and, every 13 s, a soft slow
   *  brightening (at most 6% white, over 2.4 s; never a flash). Neither with reduce motion. */
  private storm(g: G, f: SeaFrame): void {
    if (f.reduced) return;
    const s = SEAS.storm;
    const n = Math.round((f.W * f.H) / 1400);
    g.fillStyle = s.rain;
    for (let k = 0; k < n; k++) {
      const h1 = ((k * 2654435761) >>> 0) / 4294967296, h2 = ((k * 40503 + 977) % 1000) / 1000;
      const sp = 150 + h2 * 90;
      const y = (h1 * f.H * 3 + f.t * sp) % (f.H + 20) - 10;
      const x = ((h2 * f.W * 7 - f.t * sp * 0.45) % f.W + f.W) % f.W;
      g.fillRect(Math.round(x), Math.round(y), 1, 3);
      g.fillRect(Math.round(x) - 1, Math.round(y) + 3, 1, 2);
    }
    const ph = f.t % 13;
    if (ph < 2.4) {
      g.globalAlpha = 0.06 * Math.sin((ph / 2.4) * Math.PI);
      g.fillStyle = C.white;
      g.fillRect(0, 0, f.W, f.H);
      g.globalAlpha = 1;
    }
  }
}

// ------------------------------------------------------------------------------------ FIELD-1: the ground and air settings

export function isSea(k: SceneId): k is SeaKind {
  return k === "calm" || k === "storm" || k === "ember";
}

/** The rows the boards sit in: 1 where a feature may not go. */
function quietRows(H: number, bands: readonly number[]): Uint8Array {
  const q = new Uint8Array(Math.max(1, H));
  for (let i = 0; i + 1 < bands.length; i += 2) {
    for (let y = Math.max(0, Math.floor(bands[i])); y < Math.min(H, Math.ceil(bands[i + 1])); y++) q[y] = 1;
  }
  return q;
}

/** A feature over rows y0..y1 may go there: none of them is a board's. */
function free(q: Uint8Array, y0: number, y1: number): boolean {
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(q.length - 1, Math.ceil(y1)); y++) if (q[y]) return false;
  return true;
}

/** One pixel, wrapped across the layer's seam (the layers tile). */
function dot(g: G, W: number, x: number, y: number, c: string): void {
  const xx = ((Math.round(x) % W) + W) % W;
  rect(g, xx, y, 1, 1, c);
}

/** A run of pixels on one row, wrapped (one or two fills). */
function run(g: G, W: number, x: number, y: number, w: number, c: string): void {
  const n = Math.round(w);
  if (n <= 0) return;
  const xx = ((Math.round(x) % W) + W) % W;
  rect(g, xx, y, Math.min(n, W - xx), 1, c);
  if (xx + n > W) rect(g, 0, y, xx + n - W, 1, c);
}

/** A soft blob: a filled ellipse, checker-dithered over its outer `edge` share (wrapped; one fill per row inside). */
function blob(g: G, W: number, cx: number, cy: number, rx: number, ry: number, c: string, edge = 0.25): void {
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
    const t = (y - cy) / ry, half = rx * Math.sqrt(Math.max(0, 1 - t * t));
    const inner = rx * Math.sqrt(Math.max(0, (1 - edge) ** 2 - t * t));
    const x0 = Math.ceil(cx - half), x1 = Math.floor(cx + half);
    if (x1 < x0) continue;
    const i0 = Math.ceil(cx - inner), i1 = Math.floor(cx + inner);
    const solid = inner > 0 && i1 >= i0;
    if (solid) run(g, W, i0, y, i1 - i0 + 1, c);
    for (let x = x0; x <= x1; x++) {
      if (solid && x >= i0 && x <= i1) { x = i1; continue; }
      if (Math.abs(x + y) % 2 === 0) dot(g, W, x, y, c);
    }
  }
}

/** A lit blob: body, a highlight toward the upper left and a shade toward the lower right (light from the upper left). */
function litBlob(g: G, W: number, cx: number, cy: number, rx: number, ry: number, body: string, hi: string, lo: string): void {
  blob(g, W, cx + 1, cy + 1, rx, ry, lo, 0.2);
  blob(g, W, cx, cy, rx, ry, body, 0.2);
  blob(g, W, cx - rx * 0.3, cy - ry * 0.35, rx * 0.5, ry * 0.45, hi, 0.4);
}

/** Pick a centre row for a feature `h` tall that keeps clear of the boards (or -1 after a few tries). */
function freeRow(rnd: () => number, H: number, h: number, q: Uint8Array): number {
  for (let k = 0; k < 12; k++) {
    const y = Math.floor(rnd() * H);
    if (free(q, y - h, y + h)) return y;
  }
  return -1;
}

/** A vertical ramp between colours (SKY's deep blue to the pale horizon), as an opaque far base: solid bands, Bayer-
 *  dithered over 16 rows at each change of colour. */
function ramp(g: G, W: number, H: number, cols: string[]): void {
  const n = cols.length;
  const edge = (i: number) => Math.round((H * i) / n); // band i spans [edge(i), edge(i + 1))
  for (let i = 0; i < n; i++) rect(g, 0, edge(i), W, edge(i + 1) - edge(i), cols[i]);
  for (let i = 1; i < n; i++) {
    const y0 = edge(i) - 8;
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + 16); y++) {
      const th = y - y0 + 1; // 1..16: more of the lower colour row by row
      for (let x = 0; x < W; x++) {
        const lower = BAYER[(y & 3) * 4 + (x & 3)] < th;
        if (lower !== y >= edge(i)) rect(g, x, y, 1, 1, lower ? cols[i] : cols[i - 1]);
      }
    }
  }
}

/** A conifer crown seen from above: a 5 px star, lit at its upper left. */
function crown(g: G, W: number, x: number, y: number, dark: string, mid: string, lit: string): void {
  run(g, W, x - 1, y - 2, 2, dark);
  run(g, W, x - 2, y - 1, 5, mid);
  run(g, W, x - 2, y, 5, dark);
  run(g, W, x - 1, y + 1, 3, dark);
  dot(g, W, x, y + 2, dark);
  dot(g, W, x - 1, y - 1, lit);
  dot(g, W, x, y - 2, lit);
}

interface LandLook {
  base: string;
  speeds: readonly [number, number, number];
  salt: number;
  /** GROUND: the carriers' dust, fresh then old. */
  dust?: readonly [string, string];
  /** AIR: the contrails, fresh then old. */
  trail?: readonly [string, string];
  rain?: string;
  build(W: number, H: number, rnd: () => number, q: Uint8Array): { layers: Cv[]; glows?: number[] };
}

function layers3(W: number, H: number): [[Cv, G], [Cv, G], [Cv, G]] {
  return [makeCanvas(W, H), makeCanvas(W, H), makeCanvas(W, H)];
}

/** The ground and air settings (FIELD-1). Their colours sit in the seas' dusky band, so the boards stay the bright thing. */
export const LANDS: Record<Exclude<SceneId, SeaKind>, LandLook> = {
  // FOREST: far blue-green hills and a pine ridge; mid dark conifer belts and clearings; near grass, stumps, ferns, a log
  forest: {
    base: "#0D1C15", speeds: [3, 9, 22], salt: 0x4444, dust: ["#6A5233", "#45361F"],
    build(W, H, rnd, q) {
      const [[far, fg], [mid, mg], [near, ng]] = layers3(W, H);
      rect(fg, 0, 0, W, H, LANDS.forest.base);
      for (let k = 0, n = Math.round((W * H) / 2600); k < n; k++) {
        blob(fg, W, rnd() * W, rnd() * H, 26 + rnd() * 50, 9 + rnd() * 16, rnd() < 0.5 ? "#102620" : "#0F2219", 0.35); // hills
      }
      for (let r = 0, n = Math.max(2, Math.round(H / 90)); r < n; r++) {
        const y = freeRow(rnd, H, 4, q);
        if (y < 0) continue;
        const ph = rnd() * W, amp = 2 + rnd() * 3;
        for (let x = 0; x < W; x += 3 + Math.floor(rnd() * 2)) crown(fg, W, x, Math.round(y + amp * Math.sin(((x + ph) / W) * Math.PI * 4)), "#08130D", "#0B1A12", "#15301F");
      }
      for (let k = 0, n = Math.round((W * H) / 2200); k < n; k++) { // conifer belts and clearings
        const y = freeRow(rnd, H, 8, q);
        if (y < 0) continue;
        const x = rnd() * W, len = 14 + rnd() * 34;
        if (rnd() < 0.35) blob(mg, W, x, y, len / 2, 4 + rnd() * 3, "#17301F", 0.5);
        else for (let i = 0; i < len; i += 3) crown(mg, W, x + i, y + Math.round((rnd() - 0.5) * 6), "#06100A", "#0E2016", "#21452B");
      }
      for (let k = 0, n = Math.round((W * H) / 520); k < n; k++) {
        const x = rnd() * W, y = Math.floor(rnd() * H), quiet = q[y] === 1, r = rnd();
        if (quiet && r > 0.35) continue; // thinner over the boards' rows
        if (r < 0.62) run(ng, W, x, y, 2 + Math.floor(rnd() * 4), rnd() < 0.5 ? "#1C3624" : "#20402A"); // grass
        else if (r < 0.8) { dot(ng, W, x, y, "#2A4E30"); dot(ng, W, x - 1, y - 1, "#2A4E30"); dot(ng, W, x + 1, y - 1, "#2A4E30"); } // a fern
        else if (r < 0.93 && free(q, y - 2, y + 2)) { rect(ng, Math.round(x) % W, y, 2, 2, "#4A3622"); dot(ng, W, x, y, "#6A5032"); } // a stump
        else if (free(q, y - 2, y + 2)) { run(ng, W, x, y, 7, "#4E3822"); run(ng, W, x, y + 1, 7, "#2E2014"); dot(ng, W, x, y, "#6E5232"); } // a log
      }
      return { layers: [far, mid, near] };
    },
  },
  // DESERT: far pale dune haze and a mesa; mid rolling dunes; near ripples, scrub, cactus and bleached stones
  desert: {
    base: "#3A2D1D", speeds: [3, 10, 24], salt: 0x5555, dust: ["#9A8258", "#6A583C"],
    build(W, H, rnd, q) {
      const [[far, fg], [mid, mg], [near, ng]] = layers3(W, H);
      rect(fg, 0, 0, W, H, LANDS.desert.base);
      for (let k = 0, n = Math.round((W * H) / 1600); k < n; k++) {
        blob(fg, W, rnd() * W, rnd() * H, 22 + rnd() * 44, 5 + rnd() * 9, rnd() < 0.55 ? "#433423" : "#30251A", 0.4); // dune haze
      }
      for (let k = 0, n = Math.max(1, Math.round(W / 140)); k < n; k++) { // a mesa: a flat-topped plateau, lit from the upper left
        const y = freeRow(rnd, H, 12, q);
        if (y < 0) continue;
        const x = rnd() * W, w = 26 + rnd() * 30, h = 8 + rnd() * 6;
        for (let yy = 0; yy < h; yy++) run(fg, W, x + (yy < 2 ? 2 - yy : 0), y - h / 2 + yy, w - (yy < 2 ? 4 - 2 * yy : 0), yy === 0 ? "#6A5236" : yy < 3 ? "#56422C" : "#4A3926");
        run(fg, W, x + 2, y + h / 2, w, "#211910"); // its shadow
        run(fg, W, x + 3, y + h / 2 + 1, w - 2, "#211910");
      }
      for (let k = 0, n = Math.round((W * H) / 700); k < n; k++) { // dune crests: a lit rise and a shadowed fall
        const y = Math.floor(rnd() * H);
        if (q[y] && rnd() < 0.6) continue;
        const x = rnd() * W, len = 10 + rnd() * 26;
        for (let i = 0; i < len; i++) {
          const yy = y - Math.round(Math.sin((i / len) * Math.PI) * 3);
          dot(mg, W, x + i, yy, "#55432C");
          if (i % 2 === 0) dot(mg, W, x + i + 1, yy + 1, "#261D13");
        }
      }
      for (let k = 0, n = Math.round((W * H) / 420); k < n; k++) {
        const x = rnd() * W, y = Math.floor(rnd() * H), quiet = q[y] === 1, r = rnd();
        if (quiet && r > 0.55) continue;
        if (r < 0.6) { run(ng, W, x, y, 3, "#4A3A27"); dot(ng, W, x + 3, y - 1, "#4A3A27"); } // a ripple
        else if (r < 0.78) { dot(ng, W, x, y, "#3A4126"); dot(ng, W, x + 1, y, "#2A2F1C"); dot(ng, W, x, y - 1, "#4D5631"); } // scrub
        else if (r < 0.9 && free(q, y - 4, y + 4)) { // a cactus: a stem and two arms, its shadow to the lower right
          for (let i = -3; i <= 2; i++) dot(ng, W, x, y + i, i === -3 ? "#5C7A42" : "#3F5A30");
          dot(ng, W, x - 1, y - 1, "#3F5A30"); dot(ng, W, x - 1, y - 2, "#5C7A42");
          dot(ng, W, x + 1, y, "#3F5A30"); dot(ng, W, x + 1, y - 1, "#3F5A30");
          dot(ng, W, x + 1, y + 2, "#17120D"); dot(ng, W, x + 2, y + 1, "#17120D");
        } else if (free(q, y - 1, y + 1)) { run(ng, W, x, y, 2, "#6A604C"); run(ng, W, x, y + 1, 2, "#433B2C"); } // a bleached stone
      }
      return { layers: [far, mid, near] };
    },
  },
  // BADLANDS: far red mesas and buttes in haze; mid eroded spires; near cracked red earth, boulders and dry brush
  badlands: {
    base: "#26110C", speeds: [3, 9, 22], salt: 0x6666, dust: ["#8A4C2C", "#5A301C"],
    build(W, H, rnd, q) {
      const [[far, fg], [mid, mg], [near, ng]] = layers3(W, H);
      rect(fg, 0, 0, W, H, LANDS.badlands.base);
      for (let k = 0, n = Math.round((W * H) / 2000); k < n; k++) blob(fg, W, rnd() * W, rnd() * H, 24 + rnd() * 40, 5 + rnd() * 8, "#2E150E", 0.45); // haze
      for (let k = 0, n = Math.max(2, Math.round(W / 90)); k < n; k++) { // mesas and buttes
        const butte = rnd() < 0.5, h = butte ? 7 + rnd() * 5 : 6 + rnd() * 4;
        const y = freeRow(rnd, H, h + 2, q);
        if (y < 0) continue;
        const x = rnd() * W, w = butte ? 8 + rnd() * 8 : 22 + rnd() * 26;
        for (let yy = 0; yy < h; yy++) run(fg, W, x, y - h / 2 + yy, w, yy === 0 ? "#4C2316" : yy < 3 ? "#3C1C12" : "#33170F");
        for (let yy = 1; yy <= h; yy++) dot(fg, W, x + w, y - h / 2 + yy, "#170805"); // the shaded side
        run(fg, W, x + 1, y + h / 2, w, "#170805");
      }
      for (let k = 0, n = Math.round((W * H) / 2600); k < n; k++) { // spires, in clusters
        const y = freeRow(rnd, H, 6, q);
        if (y < 0) continue;
        const x = rnd() * W;
        for (let i = 0, m = 2 + Math.floor(rnd() * 4); i < m; i++) {
          const sx = x + (rnd() - 0.5) * 14, sy = y + Math.round((rnd() - 0.5) * 6), h = 3 + Math.floor(rnd() * 3);
          for (let j = 0; j < h; j++) run(mg, W, sx, sy - j, 2, j === h - 1 ? "#6A3320" : "#4A2214");
          dot(mg, W, sx + 2, sy, "#140705");
          dot(mg, W, sx + 2, sy - 1, "#140705");
        }
      }
      for (let k = 0, n = Math.round((W * H) / 460); k < n; k++) {
        const x = rnd() * W, y = Math.floor(rnd() * H), quiet = q[y] === 1, r = rnd();
        if (quiet && r > 0.5) continue;
        if (r < 0.55) { // a crack: a few steps of dark
          let cx = x, cy = y;
          for (let i = 0; i < 4 + Math.floor(rnd() * 5); i++) { dot(ng, W, cx, cy, "#160805"); cx += 1; cy += rnd() < 0.5 ? 0 : rnd() < 0.5 ? 1 : -1; }
        } else if (r < 0.75 && free(q, y - 2, y + 2)) { // a boulder
          run(ng, W, x, y, 3, "#5A2E1C"); dot(ng, W, x, y, "#7A4428"); run(ng, W, x + 1, y + 1, 3, "#2A120A");
        } else { dot(ng, W, x, y, "#4A3A1E"); dot(ng, W, x + 1, y - 1, "#3A2E18"); dot(ng, W, x - 1, y - 1, "#3A2E18"); } // dry brush
      }
      return { layers: [far, mid, near] };
    },
  },
  // SKY: far deep blue to a pale horizon over patchwork fields far below; mid drifting cumulus; near fast wisps
  sky: {
    base: "#0D2142", speeds: [2, 12, 34], salt: 0x7777, trail: ["#B8C8DA", "#6F86A3"],
    build(W, H, rnd, q) {
      const [[far, fg], [mid, mg], [near, ng]] = layers3(W, H);
      ramp(fg, W, H, ["#0B1D3C", "#10284C", "#183459"]);
      for (let k = 0, n = Math.round((W * H) / 2200); k < n; k++) { // fields far below: faint plots with darker hedges
        const x = rnd() * W, y = Math.floor(rnd() * H), w = 10 + Math.floor(rnd() * 22), h = 6 + Math.floor(rnd() * 10);
        const c = rnd() < 0.5 ? "#132D50" : "#112A47";
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if ((xx + yy) % 2 === 0) dot(fg, W, x + xx, y + yy, c);
        run(fg, W, x, y + h, w, "#0A1A33");
      }
      for (let k = 0, n = Math.round((W * H) / 3600); k < n; k++) { // the cloud deck far below: soft pale bands
        blob(fg, W, rnd() * W, rnd() * H, 30 + rnd() * 40, 3 + rnd() * 4, "#1D3B62", 0.5);
      }
      for (let k = 0, n = Math.round((W * H) / 2600); k < n; k++) { // cumulus: puffs of three to six lit blobs
        const y = freeRow(rnd, H, 9, q);
        if (y < 0) continue;
        const x = rnd() * W;
        for (let i = 0, m = 3 + Math.floor(rnd() * 4); i < m; i++) {
          litBlob(mg, W, x + i * (5 + rnd() * 4), y + (rnd() - 0.5) * 6, 5 + rnd() * 5, 3 + rnd() * 3, "#435A7C", "#5F7799", "#2B3E5E");
        }
      }
      for (let k = 0, n = Math.round((W * H) / 1500); k < n; k++) { // wisps
        const y = Math.floor(rnd() * H);
        if (q[y] && rnd() < 0.7) continue;
        run(ng, W, rnd() * W, y, 6 + Math.floor(rnd() * 12), rnd() < 0.5 ? "#4C6488" : "#3E5578");
      }
      return { layers: [far, mid, near] };
    },
  },
  // STORM CLOUDS: far slate banks with dim lightning glows inside; mid rolling grey cloud; near rain and fast scud
  clouds: {
    base: "#121820", speeds: [4, 14, 36], salt: 0x8888, trail: ["#AEB8C4", "#5E6A78"], rain: "#4E5D6E",
    build(W, H, rnd, q) {
      const [[far, fg], [mid, mg], [near, ng]] = layers3(W, H);
      rect(fg, 0, 0, W, H, LANDS.clouds.base);
      const glows: number[] = [];
      for (let k = 0, n = Math.round((W * H) / 1400); k < n; k++) {
        const x = rnd() * W, y = rnd() * H, rx = 18 + rnd() * 36, ry = 6 + rnd() * 10;
        blob(fg, W, x, y, rx, ry, rnd() < 0.5 ? "#182029" : "#1C2530", 0.35);
        if (rx > 34 && glows.length < 16 && free(q, y - ry, y + ry)) glows.push(Math.round(x) % W, Math.round(y));
      }
      for (let k = 0, n = Math.round((W * H) / 2400); k < n; k++) { // rolling grey cloud
        const y = freeRow(rnd, H, 8, q);
        if (y < 0) continue;
        const x = rnd() * W;
        for (let i = 0, m = 3 + Math.floor(rnd() * 3); i < m; i++) litBlob(mg, W, x + i * (6 + rnd() * 5), y + (rnd() - 0.5) * 5, 6 + rnd() * 5, 3 + rnd() * 2, "#252E39", "#323D4A", "#181E26");
      }
      for (let k = 0, n = Math.round((W * H) / 1300); k < n; k++) { // scud
        const y = Math.floor(rnd() * H);
        if (q[y] && rnd() < 0.6) continue;
        run(ng, W, rnd() * W, y, 8 + Math.floor(rnd() * 14), rnd() < 0.5 ? "#2E3946" : "#36424F");
      }
      return { layers: [far, mid, near], glows };
    },
  },
};

let glowCv: Cv | null = null;
/** STORM CLOUDS' glow: a soft pale violet blob (dithered rim), drawn at a low alpha. */
function glowSprite(): Cv {
  if (glowCv) return glowCv;
  const [c, g] = makeCanvas(27, 15);
  blob(g, 27, 13, 7, 13, 7, "#8F96C8", 0.5);
  blob(g, 27, 12, 6, 6, 3, "#C9CCEB", 0.3);
  glowCv = c;
  return c;
}
