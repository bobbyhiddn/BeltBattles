// Chunky ammunition riding the belts (7x7, outlined, shape-coded by type) and the shells
// they become in flight (four directions, outlined, with trail colours).

import { C } from "./palette";
import { disc, flipX, flipY, fromRows, makeCanvas, outlined, rot90 } from "./pixel";

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

/** [outline, highlight, body, shade] per cinder heat tier (cold iron .. white hot). */
const HEAT: [string, string, string, string][] = [
  [C.ink, C.steel3, C.steel1, C.steel0],
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

export const AMMO_PX = 7;

/** Belt item sprite (7x7). */
export function ammoSprite(kind: string, tier: number): Cv {
  return cached(`ammo7:${kind}:${tier}`, () => {
    if (kind === "thread") {
      return fromRows([".kkkkk.", "kbBBBbk", "kiwiwik", "kwiwiwk", "kiwiwik", "kbbbbdk", ".kkkkk."], {
        k: C.ink, b: C.brass2, B: C.brass4, d: C.brass1, i: C.ice, w: C.white,
      });
    }
    if (kind === "plain") {
      return fromRows([".kkkkk.", "kWSSssk", "kSsssdk", "kssssdk", "ksssddk", "ksdddkk", ".kkkkk."], {
        k: C.ink, W: C.white, S: C.steel3, s: C.steel2, d: C.steel1,
      });
    }
    const [o, h, b, d] = HEAT[Math.max(0, Math.min(4, tier))];
    return fromRows([".ooooo.", "ohhbbbo", "ohbbbdo", "obbbbdo", "obbbddo", "obddddo", ".ooooo."], { o, h, b, d });
  });
}

/** Soft dithered heat halo behind white-hot slugs (11x11). */
export function heatHalo(tier: number): Cv {
  return cached(`halo:${tier}`, () => {
    const [cv, g] = makeCanvas(11, 11);
    const col = tier >= 4 ? C.fire3 : C.fire2;
    g.fillStyle = col;
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        const d = Math.hypot(x + 0.5 - 5.5, y + 0.5 - 5.5);
        if (d < 5.5 && d > 3 && ((x + y) & 1) === 0) g.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  });
}

function orient(src: Cv, dir: number): Cv {
  if (dir === 0) return src;
  if (dir === 1) return rot90(src);
  if (dir === 2) return flipY(src);
  return flipX(rot90(src));
}

/** In-flight shell pointing along screen dir (0 N, 1 E, 2 S, 3 W). */
export function shellSprite(kind: string, tier: number, dir: number): Cv {
  return cached(`shell:${kind}:${tier}:${dir}`, () => {
    let base: Cv;
    if (kind === "thread") {
      base = outlined(fromRows(["..w..", ".wiw.", ".iwi.", ".iwi.", ".ici.", "..c..", "..b.."], {
        w: C.white, i: C.ice, c: C.cyan, b: C.blue,
      }), C.ink);
    } else {
      const [o, h, b, d] = kind === "plain" ? [C.ink, C.steel3, C.steel2, C.steel0] : HEAT[Math.max(0, Math.min(4, tier))];
      base = fromRows(["..o..", ".oho.", "ohhbo", "ohbbo", "obbdo", "obbdo", ".odo.", "..o.."], { o, h, b, d });
    }
    return orient(base, dir);
  });
}

const TRAIL_THREAD = [C.white, C.ice, C.cyan, C.blue];
const TRAIL_PLAIN = [C.steel3, C.steel2, C.steel1, C.steel0];
const TRAIL_HOT = [C.fire5, C.fire4, C.fire3, C.fire2, C.fire1];
const TRAIL_WARM = [C.fire4, C.fire3, C.fire2, C.fire1];

/** Trail colours, head to tail (shared arrays: called per shell per frame). */
export function trailColors(kind: string, tier: number): readonly string[] {
  if (kind === "thread") return TRAIL_THREAD;
  if (kind === "plain") return TRAIL_PLAIN;
  return tier >= 3 ? TRAIL_HOT : TRAIL_WARM;
}

/** Round ground shadow (w px wide). */
export function shadowDisc(w: number): Cv {
  return cached(`sh:${w}`, () => {
    const [cv, g] = makeCanvas(w, Math.max(2, Math.ceil(w / 2)));
    disc(g, w / 2, cv.height / 2, w / 2, C.ink);
    return cv;
  });
}
