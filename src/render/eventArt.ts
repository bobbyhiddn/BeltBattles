// Road-event art (0.5.0): small HUD/chip icons and the props the event vignettes are built
// from. Same grammar as the rest (STUDY rules 4-5): named palette only, 3-4 tone ramps lit
// from the upper left, a 1 px ink outline on every prop. Everything is cached after first draw.

import { C, FACTION } from "./palette";
import { bevel, disc, fromRows, hline, makeCanvas, outlined, px, rect, vline } from "./pixel";

type Cv = HTMLCanvasElement;
const cache = new Map<string, Cv>();
function cached(k: string, make: () => Cv): Cv {
  let c = cache.get(k);
  if (!c) cache.set(k, (c = make()));
  return c;
}

// ------------------------------------------------------------------ icons (5-7 px)

export function shieldIcon(): Cv {
  return cached("i:shield", () => fromRows(["kkkkk", "ksSsk", "ksSsk", "kssdk", ".kdk.", "..k.."], { k: C.ink, s: C.steel2, S: C.white, d: C.steel0 }));
}

export function skullIcon(): Cv {
  return cached("i:skull", () => fromRows([".kkkkk.", "kbbbbbk", "kkbkkbk", "kbbbbbk", ".kbkbk.", "..kkk.."], { k: C.ink, b: C.bone }));
}

export function tagIcon(): Cv {
  return cached("i:tag", () => fromRows(["kkkk..", "kyyyk.", "kykyyk", "kyyyyk", "kyyyk.", "kkkk.."], { k: C.ink, y: C.lime }));
}

export function rerollIcon(): Cv {
  return cached("i:reroll", () => fromRows([".kkkk.", "kaaaak", "ka..kk", "kk..ak", "kaaaak", ".kkkk."], { k: C.ink, a: C.amber }));
}

export function crateIcon(): Cv {
  return cached("i:crate", () => fromRows(["kkkkkk", "kwWwwk", "kwwWwk", "kwwwWk", "kkkkkk"], { k: C.ink, w: C.wood2, W: C.wood3 }));
}

// ------------------------------------------------------------------ props

/** Small side-view cruiser on treads, bow east (~42x22). Wrecked: dark, broken barrel, no glow. */
export function miniCruiser(faction: "orc" | "elf", wrecked = false): Cv {
  return cached(`p:cruiser:${faction}:${wrecked ? 1 : 0}`, () => {
    const P = FACTION[faction];
    const [c, g] = makeCanvas(40, 20);
    const hi = wrecked ? P.hull1 : P.hull3, mid = wrecked ? P.hull0 : P.hull2, lo = wrecked ? C.ink : P.hull1;
    // treads
    rect(g, 2, 14, 34, 5, C.belt1);
    for (let x = 3; x < 36; x += 3) px(g, x, 15, C.belt3);
    for (const x of [6, 13, 20, 27, 33]) disc(g, x, 17, 1.6, C.steel1);
    // hull body with a sloped bow
    bevel(g, 0, 7, 36, 8, mid, hi, lo);
    rect(g, 36, 9, 2, 5, mid);
    hline(g, 1, 8, 34, hi);
    rect(g, 4, 10, 26, 1, P.trim1);
    // deck house + turret
    bevel(g, 10, 3, 14, 5, P.trim1, P.trim2, P.trim0);
    if (wrecked) {
      rect(g, 24, 4, 5, 2, C.steel0);
      px(g, 29, 6, C.steel0);
    } else {
      rect(g, 24, 4, 12, 2, C.steel2);
      hline(g, 24, 4, 12, C.steel3);
      px(g, 14, 5, P.glow);
    }
    for (const x of [6, 18, 30]) px(g, x, 12, wrecked ? C.fire1 : C.steel3);
    return outlined(c, C.ink);
  });
}

/** Merchant wagon: timber bed, canvas cover in the merchant colour, two spoked wheels (~34x22). */
export function wagon(cover: string, coverHi: string, coverLo: string): Cv {
  return cached(`p:wagon:${cover}`, () => {
    const [c, g] = makeCanvas(32, 20);
    // canvas hood
    for (let x = 3; x < 27; x++) {
      const arc = Math.round(3 * Math.sin(((x - 3) / 24) * Math.PI));
      vline(g, x, 6 - arc, 6 + arc, x < 8 ? coverHi : x > 22 ? coverLo : cover);
    }
    for (const x of [8, 15, 22]) vline(g, x, 3, 8, coverLo);
    // bed
    bevel(g, 1, 11, 28, 4, C.wood2, C.wood3, C.wood1);
    rect(g, 29, 12, 3, 1, C.wood1); // shaft
    // wheels
    for (const x of [7, 23]) {
      disc(g, x, 16.5, 3.4, C.wood1);
      disc(g, x, 16.5, 1.2, C.wood3);
      px(g, x - 2, 15, C.wood3);
    }
    return outlined(c, C.ink);
  });
}

/** Wooden supply crate with the ironmonger's iron band (12x10). */
export function crate(): Cv {
  return cached("p:crate", () => {
    const [c, g] = makeCanvas(12, 10);
    bevel(g, 0, 0, 12, 10, C.wood2, C.wood3, C.wood1);
    hline(g, 0, 4, 12, C.steel1);
    hline(g, 0, 5, 12, C.steel0);
    vline(g, 3, 0, 10, C.wood1);
    vline(g, 8, 0, 10, C.wood1);
    px(g, 5, 2, C.steel2);
    return outlined(c, C.ink);
  });
}

/** A standing figure (~5x10): hood/helm colour, body colour. */
export function figure(head: string, body: string): Cv {
  return cached(`p:fig:${head}:${body}`, () => {
    const [c, g] = makeCanvas(5, 10);
    rect(g, 1, 0, 3, 3, head);
    px(g, 3, 1, C.bone);
    rect(g, 0, 3, 5, 4, body);
    vline(g, 0, 3, 4, C.ink);
    rect(g, 1, 7, 1, 3, C.slate1);
    rect(g, 3, 7, 1, 3, C.slate1);
    return outlined(c, C.ink);
  });
}

/** One bone die showing face n (1-6), 7x7. */
export function die(n: number): Cv {
  return cached(`p:die:${n}`, () => {
    const [c, g] = makeCanvas(7, 7);
    bevel(g, 0, 0, 7, 7, C.bone, C.white, C.steel2, C.ink);
    const P: Record<number, [number, number][]> = {
      1: [[3, 3]], 2: [[2, 2], [4, 4]], 3: [[2, 2], [3, 3], [4, 4]], 4: [[2, 2], [4, 2], [2, 4], [4, 4]],
      5: [[2, 2], [4, 2], [3, 3], [2, 4], [4, 4]], 6: [[2, 2], [4, 2], [2, 3], [4, 3], [2, 4], [4, 4]],
    };
    for (const [x, y] of P[n] ?? P[1]) px(g, x, y, C.ink);
    return c;
  });
}

/** Steel repair gantry with a hook (~40x34). */
export function gantry(): Cv {
  return cached("p:gantry", () => {
    const [c, g] = makeCanvas(40, 34);
    for (const x of [2, 34]) {
      bevel(g, x, 4, 4, 30, C.steel1, C.steel2, C.steel0);
      for (let y = 8; y < 32; y += 6) { hline(g, x, y, 4, C.steel0); px(g, x + 1, y + 1, C.yellow); }
    }
    bevel(g, 0, 0, 40, 5, C.steel1, C.steel3, C.steel0);
    for (let x = 3; x < 38; x += 4) px(g, x, 2, C.ink);
    vline(g, 20, 5, 12, C.slate3);
    rect(g, 18, 17, 5, 2, C.amber);
    return outlined(c, C.ink);
  });
}

/** Banner pole with a pennant in frame f (0-3 flap). */
export function pennant(color: string, dark: string, f: number): Cv {
  return cached(`p:flag:${color}:${f % 4}`, () => {
    const [c, g] = makeCanvas(16, 24);
    vline(g, 1, 0, 24, C.wood1);
    vline(g, 2, 0, 24, C.wood3);
    const wave = [0, 1, 0, -1][f % 4];
    for (let x = 3; x < 15; x++) {
      const y0 = 1 + Math.round(Math.sin((x + f) * 0.8) * 0.8) + (x > 9 ? wave : 0);
      const len = Math.max(2, 8 - Math.floor((x - 3) / 2));
      vline(g, x, y0, len, x % 4 === 0 ? dark : color);
    }
    return outlined(c, C.ink);
  });
}

export { cached as artCache };
