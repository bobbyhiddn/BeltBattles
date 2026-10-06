// MOTION-1 (REQ-BFG-071; prototype, VITE_MOTION builds only): three code-drawn seas in the game's pixel style, chosen
// by day (motion.ts seaForDay): CALM SEA (days 1-3), STORM (4-7) and EMBER SEA (8-10). Each is a stack of parallax
// layers that scroll right to left, far layers slow and near layers fast: the scroll is what shows the carriers' speed
// (they stay roughly in place). Every layer is pre-rendered once into a cached canvas as wide as the screen and blitted
// twice (wrapped) at a whole-pixel offset; the caches are rebuilt on a resize, a setting change or a DPR change (the
// key). Contrast stays low so the boards and their numbers read at a glance. STORM's rain is the one thing drawn per
// frame (a few dozen streaks); it has no full-screen flash, only a soft slow brightening, and neither with reduce motion.
// Visual randomness comes from the display PRNG (motion.ts displayRng), seeded per battle: stills and videos repeat.

import { C } from "./palette";
import { makeCanvas, rect, type G } from "./pixel";
import { displayRng, type SeaKind } from "./motion";

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
  kind: SeaKind;
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

/** The sea behind a battle: three cached parallax layers and a vignette, plus STORM's rain. */
export class SeaBackdrop {
  private key = "";
  private layers: Cv[] = [];
  private vig: Cv | null = null;
  /** Cache rebuilds so far (tooling: a resize, a setting change or a DPR change makes one). */
  builds = 0;

  private build(f: SeaFrame): void {
    const key = `${f.W}x${f.H}:${f.kind}:${f.reduced ? 1 : 0}:${f.seed}:${f.scale}:${f.dpr}`;
    if (key === this.key) return;
    this.key = key;
    const s = SEAS[f.kind];
    const rnd = displayRng(f.seed ^ (f.kind === "calm" ? 0x1111 : f.kind === "storm" ? 0x2222 : 0x3333));
    this.layers = [farLayer(f.W, f.H, s, rnd), midLayer(f.W, f.H, s, rnd), nearLayer(f.W, f.H, s, rnd)];
    this.vig = vignette(f.W, f.H);
    this.builds++;
  }

  /** Draw the sea at the camera offset (ox, oy) (the arena's shake, as the floor had). */
  draw(g: G, f: SeaFrame, ox = 0, oy = 0): void {
    this.build(f);
    const s = SEAS[f.kind];
    // a shaken frame leaves a strip the layers don't cover: the water's colour fills it
    if (oy !== 0) rect(g, 0, 0, f.W, f.H, s.base);
    for (let i = 0; i < 3; i++) {
      // whole-pixel scroll, right to left: far slow, near fast; drawn at x - W and x, so [0, W) is always covered
      const x = (((Math.round(ox) - Math.floor(f.dist * s.speeds[i])) % f.W) + f.W) % f.W;
      g.drawImage(this.layers[i], x - f.W, oy);
      g.drawImage(this.layers[i], x, oy);
    }
    if (f.kind === "storm") this.storm(g, f);
    g.drawImage(this.vig!, 0, 0);
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
