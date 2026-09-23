// Captain portraits (0.6.0): 24x24 faces for every rival and both player heroes, for the
// NEXT BATTLE panel, the act banners, the summary and the hero card. portraitPixels() is
// pure data; portraitImage() paints it once onto a cached canvas with the pixel.ts helpers.
// Nothing calls portraitImage yet: the 0.6.0 integration wires it in.

import { C, type ColorName } from "./palette";
import { makeCanvas, px } from "./pixel";
import { FEATURES, PH, PW, asColor, at, blank, paintBase, put, type Base, type Look, type Px } from "./portraitArt";
import { HEROES, type HeroId } from "../sim/content";
import { RIVALS, RIVAL_IDS, type RivalId } from "../sim/rivals";

export type PortraitKey = RivalId | HeroId;

/** Every portrait, rivals in roster order and then the heroes. */
export const PORTRAIT_KEYS: PortraitKey[] = [...RIVAL_IDS, ...(Object.keys(HEROES) as HeroId[])];

export interface Portrait {
  w: 24;
  h: 24;
  px: (ColorName | null)[]; // row-major, null = transparent
}

type Frame = "elite" | "boss" | undefined;
type Ref = number | ColorName; // an index into the captain's palette, or a colour name
interface Spec { palette: string[]; look: [eye: Ref, garment: Ref, trim: Ref, hair: Ref] }

/** Heroes have no rival entry, so their portrait notes live here. */
const HERO_PORTRAIT: Record<HeroId, string[]> = {
  furnace: ["rust1", "steel2", "fire3", "brass3"], // welding goggles pushed up on the brow
  weaver: ["verd2", "brass3", "ice", "bone"], // brass loom-shuttle hairpin trailing thread
};

/** Which palette entry each captain uses for its eyes, garment, collar trim and hair. */
const LOOK: Record<PortraitKey, Spec["look"]> = {
  sootjaw: [2, 1, 3, 1],
  nettle: [2, 1, 3, 1],
  grubnose: [3, 2, 1, 2],
  mothqueen: [2, 0, 1, 0],
  sparkfang: [2, 3, 1, 3],
  lacewing: [3, 0, 2, 0],
  ratchet: [1, 3, 0, 3],
  emberlyn: [2, 0, 1, 3],
  bulwark: [1, 0, 3, 0],
  silkshade: [2, 0, 1, 0],
  longtooth: [2, 3, 1, 3],
  highspire: [3, 0, 1, 0],
  matriarch: [1, 0, 2, 0],
  furnace: [2, 1, 3, 1],
  weaver: [2, 0, 1, 0],
};

function isHero(key: PortraitKey): key is HeroId {
  return key in HEROES;
}

function spec(key: PortraitKey): { base: Base; palette: ColorName[]; look: Look; frame: Frame } {
  const hero = isHero(key);
  const faction = hero ? HEROES[key].faction : RIVALS[key].faction;
  const palette = (hero ? HERO_PORTRAIT[key] : RIVALS[key].portrait.palette).map(asColor);
  const ref = (r: Ref): ColorName => (typeof r === "number" ? palette[r] : r);
  const [eye, garment, trim, hair] = LOOK[key].map(ref);
  const rank = hero ? "hero" : RIVALS[key].rank;
  const frame: Frame = rank === "elite" ? "elite" : rank === "boss" ? "boss" : undefined;
  return { base: faction === "orc" ? "orc" : "elf", palette, look: { eye, garment, trim, hair }, frame };
}

/** 1 px ink outline around every opaque pixel (outlined() in pixel.ts, as data). */
function outline(p: Px): void {
  const edge: number[] = [];
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      if (at(p, x, y)) continue;
      if (at(p, x - 1, y) || at(p, x + 1, y) || at(p, x, y - 1) || at(p, x, y + 1)) edge.push(y * PW + x);
    }
  }
  for (const i of edge) p[i] = "ink";
}

/** Corner brackets: amber for an act elite, a longer plum frame for the boss. */
function paintFrame(p: Px, frame: Frame): void {
  if (!frame) return;
  const [n, c]: [number, ColorName] = frame === "boss" ? [6, "plum4"] : [4, "amber"];
  for (let i = 0; i < n; i++) {
    for (const [x, y] of [[i, 0], [0, i], [PW - 1 - i, 0], [PW - 1, i], [i, PH - 1], [0, PH - 1 - i], [PW - 1 - i, PH - 1], [PW - 1, PH - 1 - i]]) {
      put(p, x, y, c);
    }
  }
  if (frame === "boss") for (const x of [2, PW - 3]) { put(p, x, 2, "plum3"); put(p, x, PH - 3, "plum3"); }
}

/** The 24x24 pixels of a captain's portrait (pure: same key, same pixels). */
export function portraitPixels(key: PortraitKey): Portrait {
  const s = spec(key);
  const p = blank();
  paintBase(p, s.base, s.look);
  FEATURES[key](p, s.palette);
  outline(p);
  paintFrame(p, s.frame);
  return { w: PW, h: PH, px: p };
}

const cache = new Map<PortraitKey, HTMLCanvasElement>();

/** The portrait as a 24x24 canvas, painted once and cached. Draw it at an integer scale. */
export function portraitImage(key: PortraitKey): HTMLCanvasElement {
  let img = cache.get(key);
  if (!img) {
    const { w, h, px: pix } = portraitPixels(key);
    const [c, g] = makeCanvas(w, h);
    pix.forEach((name, i) => { if (name) px(g, i % w, Math.floor(i / w), C[name]); });
    cache.set(key, (img = c));
  }
  return img;
}
