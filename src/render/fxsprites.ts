// Effect sprites: four-direction muzzle flashes, shockwave rings, scorch decals and the
// KO flash. Explosions and spark stars live in sprites.ts.

import { cellNoise } from "../core/rng";
import { C } from "./palette";
import { disc, flipX, flipY, makeCanvas, rect, rot90 } from "./pixel";

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

function orient(src: Cv, dir: number): Cv {
  if (dir === 0) return src;
  if (dir === 1) return rot90(src);
  if (dir === 2) return flipY(src);
  return flipX(rot90(src));
}

/** Muzzle flash pointing along screen dir; heavy: 3 frames (18px), light: 2 frames (12px). */
export function muzzleFlash(heavy: boolean, f: number, dir: number): Cv {
  return cached(`mf4:${heavy ? 1 : 0}:${f}:${dir}`, () => {
    const S = heavy ? 18 : 12;
    const [c, g] = makeCanvas(S, S);
    const cx = S / 2, cy = S - (heavy ? 6 : 4); // flash sits ahead of the muzzle (towards N)
    const cols = heavy ? [C.fire2, C.fire3, C.fire4, C.fire5] : [C.blue, C.cyan, C.ice, C.white];
    if (f === 0) {
      disc(g, cx, cy, heavy ? 5.5 : 3.6, cols[1]);
      disc(g, cx, cy, heavy ? 3.8 : 2.4, cols[2]);
      disc(g, cx, cy, heavy ? 2 : 1.3, cols[3]);
      // forward tongue and side jets
      rect(g, cx - 1, 0, 2, cy - 2, cols[2]);
      rect(g, Math.round(cx - 0.5), 0, 1, cy - 4, cols[3]);
      if (heavy) {
        rect(g, 1, cy - 1, 4, 2, cols[1]);
        rect(g, S - 5, cy - 1, 4, 2, cols[1]);
      }
    } else if (f === 1) {
      disc(g, cx, cy - 1, heavy ? 4.5 : 2.8, cols[0]);
      disc(g, cx, cy - 1, heavy ? 3 : 1.8, cols[2]);
      rect(g, cx - 1, 2, 2, cy - 4, cols[1]);
    } else {
      disc(g, cx, cy - 2, 3.2, C.slate3);
      disc(g, cx, cy - 2, 2, cols[0]);
    }
    return orient(c, dir);
  });
}

/** Expanding shockwave ring frame (1px dithered ring of radius r). */
export function ringSprite(r: number, color: string): Cv {
  return cached(`ring:${r}:${color}`, () => {
    const s = r * 2 + 3;
    const [c, g] = makeCanvas(s, s);
    g.fillStyle = color;
    const cx = s / 2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cx);
        if (d <= r + 0.5 && d > r - 0.7) g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  });
}

/** Scorch mark decal (irregular dark blot with a few embers). */
export function scorchSprite(r: number, variant: number): Cv {
  return cached(`scorch:${r}:${variant}`, () => {
    const s = r * 2 + 2;
    const [c, g] = makeCanvas(s, s);
    const cx = s / 2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const n = cellNoise(x, y, variant * 17 + r);
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cx) + (n - 0.5) * 2.4;
        if (d < r * 0.55) rect(g, x, y, 1, 1, C.ink);
        else if (d < r && ((x + y) & 1) === 0) rect(g, x, y, 1, 1, C.ink);
      }
    }
    for (let k = 0; k < 3; k++) {
      const x = Math.floor(cx - r / 2 + cellNoise(k, variant, 5) * r);
      const y = Math.floor(cx - r / 2 + cellNoise(variant, k, 7) * r);
      rect(g, x, y, 1, 1, k === 0 ? C.fire3 : C.fire1);
    }
    return c;
  });
}

/** Chunky pixel arrow (pointing down) used by onboarding cues. */
export function arrowSprite(color: string): Cv {
  return cached(`arrow:${color}`, () => {
    const rows = ["..kkkkk..", "..kyyyk..", "..kyyyk..", "..kyyyk..", "kkkyyykkk", ".kyyyyyk.", "..kyyyk..", "...kyk...", "....k...."];
    const [c, g] = makeCanvas(9, 9);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === "k") rect(g, x, y, 1, 1, C.ink);
        else if (row[x] === "y") rect(g, x, y, 1, 1, color);
      }
    });
    rect(g, 3, 1, 1, 3, C.white);
    return c;
  });
}

export function arrowDir(color: string, dir: number): Cv {
  // base arrow points S (dir 2); rotate for the others
  return cached(`arrowd:${color}:${dir}`, () => {
    const a = arrowSprite(color);
    if (dir === 2) return a;
    if (dir === 0) return flipY(a);
    if (dir === 3) return rot90(a);
    return flipX(rot90(a));
  });
}
