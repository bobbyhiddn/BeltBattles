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

/** The plain slug's rows (7x7): W glint, S highlight, s body, d shade. */
const PLAIN_ROWS = [".kkkkk.", "kWSSssk", "kSsssdk", "kssssdk", "ksssddk", "ksdddkk", ".kkkkk."];

/**
 * 0.6.1c HOT SWAP: the two tints of the plain slug, [glint, highlight, body, shade] (the plain slug is white,
 * steel3, steel2, steel1). A tinted slug is a plain Payload with `preset` set; renderers pass
 * `p.preset ?? p.ammo` as the kind, so these draw on the belt, in the chamber and in flight.
 */
const TINT: Record<"ember" | "spark", [string, string, string, string]> = {
  ember: [C.fire4, C.fire3, C.red, C.fire1], // red/orange, fire
  spark: [C.white, C.ice, C.blue, C.deepblue], // blue/ice with a white glint
};

/** Belt item sprite (7x7). 0.6.1c kinds: "shot" (SHOT TOWER's small lead pellet), "slag" (SLAG POT: orange
 *  slag under a dark crust), "ember" and "spark" (HOT SWAP's tints of the plain slug). */
export function ammoSprite(kind: string, tier: number): Cv {
  return cached(`ammo7:${kind}:${tier}`, () => {
    if (kind === "thread") {
      return fromRows([".kkkkk.", "kbBBBbk", "kiwiwik", "kwiwiwk", "kiwiwik", "kbbbbdk", ".kkkkk."], {
        k: C.ink, b: C.brass2, B: C.brass4, d: C.brass1, i: C.ice, w: C.white,
      });
    }
    if (kind === "plain") {
      return fromRows(PLAIN_ROWS, {
        k: C.ink, W: C.white, S: C.steel3, s: C.steel2, d: C.steel1,
      });
    }
    if (kind === "ember" || kind === "spark") {
      const [W, S, s, d] = TINT[kind];
      return fromRows(PLAIN_ROWS, { k: C.ink, W, S, s, d });
    }
    if (kind === "shot") { // 5x5 inside the 7x7 cell, so it still centres like every slug
      return fromRows([".......", "..kkk..", ".kSsdk.", ".ksddk.", ".kdddk.", "..kkk..", "......."], {
        k: C.ink, S: C.steel3, s: C.steel2, d: C.steel1,
      });
    }
    if (kind === "slag") {
      return fromRows([".kkkkk.", "kHeeeck", "keccrck", "kcrffck", "kfgfffk", "kffffdk", ".kkkkk."], {
        k: C.ink, H: C.soil4, e: C.soil3, c: C.soil2, r: C.fire2, f: C.fire2, g: C.fire3, d: C.fire1,
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
    } else if (kind === "shot") { // 0.6.1c: a tiny lead pellet (3x4)
      base = fromRows([".o.", "ohb", "obd", ".o."], { o: C.ink, h: C.steel3, b: C.steel2, d: C.steel1 });
    } else if (kind === "slag") { // 0.6.1c: crust at the nose, glowing slag behind
      base = fromRows(["..o..", ".oeo.", "oecco", "ocrco", "ogffo", "offdo", ".odo.", "..o.."], {
        o: C.ink, e: C.soil3, c: C.soil2, r: C.fire2, g: C.fire3, f: C.fire2, d: C.fire1,
      });
    } else if (kind === "ember" || kind === "spark") { // 0.6.1c: the plain shell in HOT SWAP's tints
      const [w, h, b, d] = TINT[kind];
      base = fromRows(["..o..", ".owo.", "ohhbo", "ohbbo", "obbdo", "obbdo", ".odo.", "..o.."], { o: C.ink, w, h, b, d });
    } else {
      const [o, h, b, d] = kind === "plain" ? [C.ink, C.steel3, C.steel2, C.steel0] : HEAT[Math.max(0, Math.min(4, tier))];
      base = fromRows(["..o..", ".oho.", "ohhbo", "ohbbo", "obbdo", "obbdo", ".odo.", "..o.."], { o, h, b, d });
    }
    return orient(base, dir);
  });
}

// 0.6.1b turret core projectile hooks (ARSENAL.md §8.4): SCATTER CHOKE's pellets, DRAKE NOZZLE's flame
// cone and SALVO RACK's volley round. ROTARY/PRESSURE/GATLING/HULLBREAKER keep the plain shellSprite;
// nothing about the sim changes, only what a fired core's projectile looks like in flight.

/** 0.6.1c: [highlight, body] of a SCATTER pellet for the wave-1 kinds. */
const PELLET_TINT = new Map<string, [string, string]>([
  ["shot", [C.steel3, C.steel1]],
  ["slag", [C.fire3, C.soil3]],
  ["ember", [C.fire4, C.red]],
  ["spark", [C.white, C.blue]],
]);

/** SCATTER CHOKE: one pellet (5x5, a shrunk shell) -- each is a fraction of the shot, aimed anew. */
export function pelletSprite(kind: string, tier: number, dir: number): Cv {
  return cached(`pellet:${kind}:${tier}:${dir}`, () => {
    if (kind === "thread") return orient(fromRows([".w.", "wiw", ".c."], { w: C.white, i: C.ice, c: C.cyan }), dir);
    const tint = PELLET_TINT.get(kind); // 0.6.1c: shot, slag, ember, spark
    if (tint) return orient(fromRows([".o.", "ohb", ".b."], { o: C.ink, h: tint[0], b: tint[1] }), dir);
    const [o, h, b] = kind === "plain" ? [C.ink, C.steel3, C.steel2] : HEAT[Math.max(0, Math.min(4, tier))];
    return orient(fromRows([".o.", "ohb", ".b."], { o, h, b }), dir);
  });
}

/** DRAKE NOZZLE: a short flame cone (5x5) that replaces the tracer in flight. */
export function flameCone(dir: number): Cv {
  return cached(`flamecone:${dir}`, () => orient(fromRows([
    "..o..",
    ".ohh.",
    "ohhbb",
    ".ohh.",
    "..b..",
  ], { o: C.fire1, h: C.fire4, b: C.fire3 }), dir));
}

/** SALVO RACK: a volley round (7x8, brass-banded) -- the same shell silhouette, marked as a volley shell. */
export function volleySprite(kind: string, tier: number, dir: number): Cv {
  return cached(`volley:${kind}:${tier}:${dir}`, () => {
    const o = kind === "plain" || kind === "thread" ? C.ink : HEAT[Math.max(0, Math.min(4, tier))][0];
    return orient(fromRows(["..o..", ".oho.", "ohhBo", "ohBBo", "oBBdo", "oBBdo", ".odo.", "..o.."], {
      o, h: C.brass4, B: C.brass3, d: C.brass1,
    }), dir);
  });
}

const TRAIL_THREAD = [C.white, C.ice, C.cyan, C.blue];
const TRAIL_PLAIN = [C.steel3, C.steel2, C.steel1, C.steel0];
const TRAIL_HOT = [C.fire5, C.fire4, C.fire3, C.fire2, C.fire1];
const TRAIL_WARM = [C.fire4, C.fire3, C.fire2, C.fire1];
// 0.6.1c: the wave-1 kinds (a pellet's short grey wisp, slag's glow into smoke, HOT SWAP's two tints)
const TRAIL_SHOT = [C.steel2, C.steel1];
const TRAIL_SLAG = [C.fire2, C.fire1, C.soil3, C.soil2];
const TRAIL_EMBER = [C.fire4, C.fire3, C.red, C.fire1];
const TRAIL_SPARK = [C.white, C.ice, C.blue, C.deepblue];

/** Trail colours, head to tail (shared arrays: called per shell per frame). */
export function trailColors(kind: string, tier: number): readonly string[] {
  if (kind === "thread") return TRAIL_THREAD;
  if (kind === "plain") return TRAIL_PLAIN;
  if (kind === "shot") return TRAIL_SHOT;
  if (kind === "slag") return TRAIL_SLAG;
  if (kind === "ember") return TRAIL_EMBER;
  if (kind === "spark") return TRAIL_SPARK;
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
