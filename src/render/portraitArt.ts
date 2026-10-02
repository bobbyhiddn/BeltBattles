// Portrait art (0.6.0): pure pixel data for the 24x24 captain portraits, no canvas, so node
// tests can read every pixel. The faction bases are half rows mirrored about the centre line
// (the fromRows convention from pixel.ts: '.' = transparent, one char per role); each captain
// then paints its own feature on top in the colours of its RIVALS[id].portrait palette.

import { C, type ColorName } from "./palette";

export const PW = 24, PH = 24;
export type Px = (ColorName | null)[];

export function blank(): Px {
  return new Array<ColorName | null>(PW * PH).fill(null);
}
export function put(p: Px, x: number, y: number, c: ColorName | null): void {
  if (x >= 0 && y >= 0 && x < PW && y < PH) p[y * PW + x] = c;
}
export function at(p: Px, x: number, y: number): ColorName | null {
  return x >= 0 && y >= 0 && x < PW && y < PH ? p[y * PW + x] : null;
}
export function fill(p: Px, x: number, y: number, w: number, h: number, c: ColorName): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(p, x + i, y + j, c);
}
/** Plot [x, y] points in one colour. */
export function dots(p: Px, c: ColorName, pts: [number, number][]): void {
  for (const [x, y] of pts) put(p, x, y, c);
}
/** Mirror of column x about the portrait's centre line. */
export const mx = (x: number): number => PW - 1 - x;

export function asColor(name: string): ColorName {
  if (!(name in C)) throw new Error(`portrait: ${name} is not a palette colour`);
  return name as ColorName;
}

// 0.8.0 H1 (REQ-BFG-011): "human" (FOUNDRY's HUMAN GUILDS) and "dwarf" (BASTION's DWARVEN HOLDS) join the bases.
export type Base = "orc" | "elf" | "human" | "dwarf";
/** Colour roles a captain supplies to its faction base. */
export interface Look { eye: ColorName; garment: ColorName; trim: ColorName; hair: ColorName }

const SKIN: Record<Base, Record<"s" | "d" | "h" | "b", ColorName>> = {
  orc: { s: "rust3", d: "rust2", h: "rust4", b: "rust1" }, // rust-iron warband skin
  elf: { s: "verd4", d: "verd3", h: "white", b: "verd2" }, // verdigris skywright skin
  human: { s: "skin2", d: "skin1", h: "skin3", b: "wood0" }, // weathered guild skin, dark brows
  dwarf: { s: "skin2", d: "skin1", h: "skin3", b: "cop1" }, // ruddy hold skin under bushy ginger brows
};

// Half rows for x = 1..11 (mirrored onto x = 22..12), rows y = 1..22; the outline adds the
// 1 px border. s/d/h skin, b brow, k ink, e eye, t tusk, r hair, g garment, G trim.
const HALF: Record<Base, string[]> = {
  // ORC WARBAND: broad jaw, tusks jutting over the lip, a heavy brow over glowing eyes.
  orc: [
    "...........", "...........", "........dss", "......dssss", ".....dsssss", "....dssshss",
    "...bbbbbbbb", "...dbkeebbs", "...dsssddss", "..ddsssssdh", "..dsstsssdd", "..dsstsssss",
    "..dsktkkkkk", "..ddsssssss", "..ddsssssss", "...ddssssss", ".....dddddd", "...gggGGddd",
    ".gggggggGGG", "gggggggggGG", "gggggggggGg", "ggggggggggg",
  ],
  // ELVEN SKYWRIGHTS: a narrow face framed by hair, long ears swept back and up.
  elf: [
    "...........", "...........", ".........rr", ".......rrrr", "......rrrrr", ".s....rrrrr",
    ".ds...rrsss", "..ds..rssss", "..dss.rbbbs", "...dssskees", "....ddsssss", "......sssdh",
    "......dsssd", ".......ssss", ".......dskk", "........dss", ".........dd", ".....gggddd",
    "..gggggGGdd", ".ggggggggGG", "gggggggggGG", "ggggggggggg",
  ],
  // 0.8.0 H1. HUMAN GUILDS: a square-jawed face with plain ears under a close cap of hair (r), eyes with a dark pupil
  // toward the nose, a work shirt (g) with a leather apron bib down the middle (G). After raceart's FOUNDRY bust.
  human: [
    "...........", "...........", ".......rrrr", ".....rrrrrr", "....rrrrrrr", "...rrrrrrrr",
    "...rrssssss", "...rsbbbsss", "..dssseksss", "..dssssssss", "...dsssshss", "...dssssssd",
    "...dsssssss", "....dssssss", "....dssssss", ".....dsssss", "......ddddd", "....gggGdss",
    "..ggggggGGG", ".gggggggGGG", "ggggggggGGG", "ggggggggGGG",
  ],
  // DWARVEN HOLDS: a broad face, deep-set glinting eyes (e) under one heavy brow, and a great beard (r) from the cheeks
  // over the chest, between stone pauldrons (g) with lighter rims (G). After raceart's BASTION bust.
  dwarf: [
    "...........", "...........", ".......rrrr", ".....rrrrrr", "....rrrrrrr", "...rrrrrrrr",
    "...rbbbbbbb", "..dssskesss", "..dssssssss", "..rsssssshs", "..rrssssssd", "..rrrssssrr",
    "..rrrrrrrrr", "..rrrrrrrrr", "..rrrrrrrrr", "...rrrrrrrr", "...rrrrrrrr", "..ggrrrrrrr",
    ".gggGrrrrrr", "ggggGGrrrrr", "ggggGGGrrrr", "gggggGGGrrr",
  ],
};

/** Paint a faction base head and shoulders in a captain's colours. */
export function paintBase(p: Px, base: Base, look: Look): void {
  const role: Record<string, ColorName> = {
    ...SKIN[base], k: "ink", e: look.eye, t: "bone", r: look.hair, g: look.garment, G: look.trim,
  };
  HALF[base].forEach((row, j) => {
    if (row.length !== 11) throw new Error(`portrait: ${base} row ${j} is ${row.length} wide`);
    for (let i = 0; i < 11; i++) {
      const ch = row[i];
      if (ch === "." || ch === " ") continue;
      put(p, 1 + i, 1 + j, role[ch]);
      put(p, mx(1 + i), 1 + j, role[ch]);
    }
  });
}

/** Feature painters: (pixels, captain palette) -> draws the captain's one feature. */
export type Feature = (p: Px, c: ColorName[]) => void;

export const FEATURES: Record<string, Feature> = {
  // soot-black jaw clamped on a glowing cinder pipe
  sootjaw: (p, c) => {
    for (let y = 14; y <= 16; y++) for (let x = 3; x <= 20; x++) if (at(p, x, y)) put(p, x, y, c[1]);
    dots(p, c[3], [[17, 14], [18, 14], [19, 14]]);
    fill(p, 20, 12, 2, 3, c[0]);
    dots(p, c[2], [[20, 11], [21, 11], [21, 10], [20, 9]]);
  },
  // crown of bent sewing needles
  nettle: (p, c) => {
    dots(p, c[3], [[7, 5], [7, 4], [6, 3], [9, 4], [9, 3], [9, 2], [8, 1], [11, 3], [11, 2], [11, 1],
      [14, 4], [14, 3], [14, 2], [15, 1], [16, 5], [16, 4], [17, 3]]);
    dots(p, c[2], [[8, 1], [11, 1], [15, 1]]); // lit needle eyes
  },
  // nose ring shaped like a press die
  grubnose: (p, c) => {
    dots(p, c[1], [[10, 12], [11, 12], [12, 12], [13, 12], [10, 13], [13, 13], [10, 14], [11, 14], [12, 14], [13, 14]]);
    dots(p, c[3], [[11, 12], [12, 12]]);
    dots(p, c[2], [[11, 13], [12, 13]]);
  },
  // moth-wing mantle with frayed, glowing edges
  mothqueen: (p, c) => {
    for (let y = 11; y <= 21; y++) {
      const w = Math.min(6, y - 10);
      for (let x = 1; x <= w; x++) {
        const edge = x === 1 || x === w;
        const col = edge ? c[2] : (x + y) % 3 === 0 ? c[0] : c[1];
        if (edge && x === 1 && y % 2 === 0) continue; // frayed outer edge
        put(p, x, y, col);
        put(p, mx(x), y, col);
      }
    }
    dots(p, c[1], [[9, 2], [14, 2]]);
    dots(p, c[2], [[8, 1], [15, 1]]);
  },
  // copper fang arcing a blue spark
  sparkfang: (p, c) => {
    dots(p, "cop2", [[17, 13], [17, 12], [17, 11]]);
    dots(p, "cop3", [[17, 10], [18, 9]]);
    dots(p, c[1], [[19, 8], [21, 8], [20, 6]]);
    dots(p, c[2], [[20, 7], [21, 5], [19, 10]]);
  },
  // lace veil that splits into twin tails
  lacewing: (p, c) => {
    for (let y = 13; y <= 16; y++) for (let x = 8; x <= 15; x++) if (at(p, x, y) && (x + y) % 2 === 0) put(p, x, y, c[2]);
    for (let y = 17; y <= 21; y++) { put(p, 9, y, c[2]); put(p, 14, y, c[2]); put(p, 10, y, y % 2 ? c[2] : c[0]); put(p, 13, y, y % 2 ? c[2] : c[0]); }
    dots(p, c[3], [[9, 22], [14, 22], [10, 22], [13, 22]]);
  },
  // goggles with a spinning gear monocle
  ratchet: (p, c) => {
    for (let x = 3; x <= 20; x++) put(p, x, 8, c[2]);
    fill(p, 6, 7, 3, 3, c[0]);
    put(p, 7, 8, c[1]);
    fill(p, 14, 6, 5, 5, c[3]);
    dots(p, c[3], [[16, 5], [13, 8], [19, 8], [16, 11]]);
    fill(p, 15, 7, 3, 3, c[1]);
    put(p, 16, 8, "ink");
  },
  // braids tipped with smouldering embers
  emberlyn: (p, c) => {
    for (let y = 10; y <= 19; y++) {
      const col = y % 2 ? c[3] : c[0];
      put(p, 6, y, col);
      put(p, mx(6), y, col);
    }
    dots(p, c[1], [[6, 20], [17, 20]]);
    dots(p, c[2], [[6, 21], [17, 21], [5, 22], [18, 22]]);
  },
  // riveted iron plate bolted over one eye
  bulwark: (p, c) => {
    fill(p, 4, 6, 6, 5, c[0]);
    for (let x = 4; x <= 9; x++) put(p, x, 6, c[1]);
    for (let y = 6; y <= 10; y++) put(p, 4, y, c[1]);
    dots(p, c[3], [[5, 7], [8, 7], [5, 9], [8, 9]]);
    dots(p, c[2], [[5, 11], [8, 11]]); // rust weeping from the bolts
  },
  // hooded face behind a crackling web
  silkshade: (p, c) => {
    const rim: [number, number][] = [];
    for (let y = 2; y <= 12; y++) for (let x = 5; x <= 18; x++) {
      if (at(p, x, y)) continue;
      if (at(p, x - 1, y) === c[0] || at(p, x + 1, y) === c[0] || at(p, x, y + 1) === c[0]) rim.push([x, y]);
    }
    dots(p, c[0], rim); // the hood stands 1 px proud of the hair
    for (let i = 0; i <= 6; i++) { put(p, 8 + i, 9 + i, c[2]); put(p, 15 - i, 9 + i, c[2]); }
    for (let x = 7; x <= 16; x += 2) put(p, x, 12, c[2]);
    dots(p, c[3], [[11, 10], [12, 10]]);
  },
  // one long tusk hung with gate tags
  longtooth: (p, c) => {
    dots(p, c[1], [[18, 10], [18, 9], [19, 8], [19, 7], [19, 6], [20, 5]]);
    fill(p, 20, 8, 2, 2, c[2]);
    fill(p, 20, 11, 2, 2, c[2]);
    dots(p, c[3], [[21, 9], [21, 12], [19, 11]]);
  },
  // tall spire helm flying three pennants
  highspire: (p, c) => {
    for (let y = 3; y <= 7; y++) for (let x = 6; x <= 17; x++) if (at(p, x, y) === c[0]) put(p, x, y, c[1]);
    fill(p, 11, 1, 2, 3, c[1]);
    dots(p, c[2], [[13, 1], [14, 1], [15, 1], [13, 2], [14, 2]]);
    dots(p, c[3], [[10, 2], [9, 2], [8, 2], [10, 3], [9, 3]]);
    dots(p, c[0], [[13, 3], [14, 3], [15, 3]]);
  },
  // crown of kiln chimneys venting fire
  matriarch: (p, c) => {
    for (let x = 6; x <= 17; x++) put(p, x, 4, c[2]);
    for (const x of [7, 11, 15]) {
      fill(p, x, 2, 2, 2, c[0]);
      put(p, x, 1, c[1]);
      put(p, x + 1, 1, "fire4");
    }
  },
  // FURNACE hero: welding goggles pushed up on the brow
  furnace: (p, c) => {
    for (let x = 5; x <= 18; x++) put(p, x, 5, c[0]);
    fill(p, 7, 4, 3, 3, c[1]);
    fill(p, 14, 4, 3, 3, c[1]);
    dots(p, c[2], [[8, 5], [15, 5]]);
  },
  // WEAVER hero: a brass loom-shuttle hairpin trailing thread
  weaver: (p, c) => {
    for (let x = 6; x <= 17; x++) put(p, x, 4, c[1]);
    dots(p, c[2], [[5, 4], [18, 4]]);
    dots(p, c[3], [[19, 5], [20, 6], [20, 7], [21, 8]]);
  },
  // 0.8.0 H1. FOUNDRY hero (raceart's bust): a leather cap with a darker brim (its hair is the cap, c[0]), brass goggles
  // with ice lenses pushed up on it (c[3]), a dark handlebar moustache over a red mouth, and a brass apron buckle
  foundry: (p, c) => {
    for (let x = 4; x <= 19; x++) put(p, x, 6, "wood1");
    dots(p, "wood3", [[9, 3], [10, 3], [7, 4], [6, 5]]);
    for (const x0 of [6, 14]) {
      fill(p, x0, 4, 4, 2, c[3]);
      put(p, x0 + 1, 4, "ice");
      put(p, x0 + 2, 4, "white");
      put(p, x0 + 1, 5, "ice");
    }
    dots(p, c[3], [[10, 4], [13, 4]]); // the strap between the lenses
    for (let x = 8; x <= 15; x++) put(p, x, 13, "wood0");
    dots(p, "wood0", [[7, 14], [8, 14], [15, 14], [16, 14], [6, 13], [17, 13], [6, 12], [17, 12]]);
    dots(p, "wood1", [[9, 13], [14, 13]]);
    dots(p, "maroon", [[10, 15], [11, 15], [12, 15], [13, 15]]);
    dots(p, "yellow", [[11, 20], [12, 20]]);
  },
  // 0.8.0 H1. BASTION hero (raceart's bust): an iron helm (steel ramp) with a rune-lit brow plate, a big nose, a copper
  // moustache over the beard, two braids bound in iron rings, and rune-blue eyes (the base's eye colour)
  bastion: (p, c) => {
    const dome: [number, number, number][] = [[2, 9, 14], [3, 7, 16], [4, 6, 17], [5, 5, 18]];
    for (const [y, x0, x1] of dome) for (let x = x0; x <= x1; x++) put(p, x, y, "steel2");
    for (let x = 4; x <= 19; x++) put(p, x, 6, "steel1");
    dots(p, "steel3", [[9, 2], [8, 3], [7, 4], [6, 5], [10, 2]]);
    dots(p, "steel0", [[16, 4], [17, 5], [15, 3]]);
    fill(p, 11, 2, 2, 4, "rune2");
    dots(p, "rune4", [[11, 2]]);
    dots(p, "rune3", [[10, 3], [13, 3]]);
    fill(p, 11, 9, 2, 3, "skin1");
    dots(p, "skin3", [[11, 9]]);
    for (let x = 7; x <= 16; x++) put(p, x, 12, "cop3");
    dots(p, "cop3", [[6, 13], [17, 13]]);
    for (let y = 14; y <= 21; y++) { put(p, 10, y, "cop1"); put(p, 13, y, "cop1"); }
    dots(p, "steel3", [[10, 19], [13, 19]]);
    dots(p, "ink", [[10, 20], [13, 20]]);
  },
  // 0.8.0 A1 (REQ-BFG-024): the six wave-3 NPCs (output-D1/DESIGN-wave3.md section 5, each one's Portrait line), keyed by D1's
  // ids and drawn on their race's base: BRASSWICK and MASTER VOSS (human, FOUNDRY), GRIMHOLD and THANE KARSK (dwarf,
  // BASTION), LOCKJAW (orc, FURNACE), THISTLEMAIL (elf, WEAVER). portraits.ts holds them as pending captains for N1.
  // BRASSWICK: a young guild gauger, a brass twin-dial gauge strapped over both eyes like goggles; its needles locked
  // straight up, the glass glinting lime (a matched belt); a leather strap, no beard, a small grin
  brasswick: (p, c) => {
    dots(p, "wood1", [[3, 8], [4, 8], [19, 8], [20, 8]]);
    for (const x0 of [5, 14]) {
      dots(p, c[0], [[x0 + 1, 7], [x0 + 2, 7], [x0 + 3, 7], [x0, 8], [x0 + 4, 8], [x0, 9], [x0 + 4, 9], [x0, 10], [x0 + 4, 10], [x0 + 1, 11], [x0 + 2, 11], [x0 + 3, 11]]);
      dots(p, "brass4", [[x0 + 1, 7], [x0, 8]]);
      dots(p, "brass1", [[x0 + 4, 10], [x0 + 3, 11]]);
      fill(p, x0 + 1, 8, 3, 3, c[2]);
      put(p, x0 + 2, 9, "ink");
      put(p, x0 + 2, 8, "red");
      put(p, x0 + 1, 8, c[3]);
    }
    dots(p, c[0], [[10, 9], [11, 9], [12, 9], [13, 9]]);
    dots(p, c[1], [[11, 8], [12, 8]]);
    dots(p, "maroon", [[11, 14], [12, 14]]);
    dots(p, "skin1", [[10, 14], [13, 13]]);
  },
  // MASTER VOSS: a stern guildmaster wearing a twin-chained pocket watch as a medal, its two lids snapping shut together
  // over the amber face; brows drawn down in a frown, grey mutton-chop whiskers, a hard mouth, a dark coat with black lapels
  voss: (p, c) => {
    dots(p, "wood0", [[9, 9], [14, 9]]);
    for (let y = 9; y <= 13; y++) { put(p, 4, y, "steel2"); put(p, 19, y, "steel2"); }
    dots(p, "steel2", [[5, 12], [5, 13], [18, 12], [18, 13], [6, 13], [17, 13]]);
    dots(p, "ink", [[10, 14], [11, 14], [12, 14], [13, 14]]);
    dots(p, c[0], [[7, 18], [8, 18], [9, 19], [16, 18], [15, 18], [14, 19]]);
    dots(p, c[0], [[10, 19], [11, 19], [12, 19], [13, 19], [9, 20], [14, 20], [9, 21], [14, 21], [10, 22], [11, 22], [12, 22], [13, 22]]);
    dots(p, "brass4", [[10, 19], [9, 20]]);
    dots(p, "brass1", [[14, 21], [13, 22]]);
    dots(p, c[3], [[11, 20], [12, 20], [11, 21], [12, 21]]);
    dots(p, "brass2", [[10, 20], [10, 21], [13, 20], [13, 21]]);
    put(p, 11, 21, "fire3");
  },
  // GRIMHOLD: a broad dwarf in an anvil-shaped iron helm (a flat face, the horn jutting left, a waist, a broad rim on the
  // brow), his rust-red beard braided in two plaits through hot rivets
  grimhold: (p, c) => {
    for (let x = 4; x <= 19; x++) put(p, x, 1, "steel3");
    for (let x = 1; x <= 19; x++) put(p, x, 2, "steel2");
    for (let x = 2; x <= 18; x++) put(p, x, 3, "steel1");
    for (let x = 7; x <= 16; x++) { put(p, x, 4, "steel1"); put(p, x, 5, "steel0"); }
    for (let x = 4; x <= 19; x++) put(p, x, 6, "steel2");
    dots(p, "steel3", [[1, 2], [4, 6], [5, 6]]);
    dots(p, "steel0", [[18, 3], [19, 6], [18, 6]]);
    for (let y = 16; y <= 22; y++) {
      for (const x of [9, 14]) { put(p, x, y, y % 2 ? "rust1" : "rust3"); put(p, x + 1, y, y % 2 ? "rust3" : "rust1"); }
    }
    dots(p, c[2], [[9, 18], [15, 18], [10, 21], [14, 21]]);
    dots(p, "fire4", [[10, 18], [14, 18]]);
    dots(p, "fire2", [[9, 21], [15, 21]]);
  },
  // THANE KARSK: a grey-bearded thane behind a riveted tower shield (held across his left side, brass rivets, a steel
  // boss), a plate-breaking hammer on his right shoulder: an iron sledge head with a rusted band, as PLATE BREAKER's
  karsk: (p, c) => {
    fill(p, 2, 13, 7, 10, c[0]);
    for (let y = 13; y <= 22; y++) put(p, 2, y, "steel2");
    for (let x = 2; x <= 8; x++) put(p, x, 13, "steel2");
    for (let y = 14; y <= 22; y++) put(p, 8, y, "steel0");
    dots(p, c[2], [[3, 14], [7, 14], [3, 18], [7, 18], [3, 21], [7, 21]]);
    dots(p, c[1], [[5, 17], [4, 16], [5, 16]]);
    for (let y = 15; y <= 22; y++) put(p, 19 + ((y - 15) >> 2), y, "wood2");
    for (let x = 16; x <= 21; x++) { put(p, x, 12, "steel3"); put(p, x, 13, "steel2"); put(p, x, 14, "steel1"); }
    dots(p, c[3], [[18, 12], [19, 12], [18, 13], [19, 13], [18, 14], [19, 14]]);
    dots(p, "rust1", [[19, 14]]);
    dots(p, "white", [[16, 12]]);
  },
  // LOCKJAW: an orc whose iron jaw-brace (a bar over and under the mouth, straps up the cheeks) locks shut with a twin
  // latch (two brass catches), two hot slugs clenched in his teeth between the tusks
  lockjaw: (p, c) => {
    for (let x = 7; x <= 16; x++) { put(p, x, 12, c[1]); put(p, x, 14, c[1]); }
    for (let y = 10; y <= 14; y++) { put(p, 7, y, c[1]); put(p, 16, y, c[1]); }
    dots(p, "steel3", [[7, 10], [8, 12], [9, 12]]);
    dots(p, c[2], [[8, 15], [9, 15], [14, 15], [15, 15]]);
    dots(p, "brass4", [[8, 15], [14, 15]]);
    dots(p, c[3], [[9, 13], [10, 13], [13, 13], [14, 13]]);
    dots(p, "fire4", [[9, 13], [13, 13]]);
    dots(p, "ink", [[11, 13], [12, 13], [8, 13], [15, 13]]);
  },
  // THISTLEMAIL: an elf in a coat of overlapping silver leaves like scale mail (every coat pixel a scale: a white tip, a
  // steel body, a dark edge), wearing a thistle crown of steel pins (a band on the brow, a fan of white-tipped pins)
  thistlemail: (p, c) => {
    for (let y = 18; y <= 22; y++) for (let x = 0; x < PW; x++) {
      const v = at(p, x, y);
      if (v !== c[1] && v !== c[2]) continue;
      const k = (x + (y % 2) * 2) % 4;
      put(p, x, y, k === 0 ? c[2] : k === 3 ? "steel1" : y % 2 ? c[1] : "steel3");
    }
    for (let x = 8; x <= 15; x++) put(p, x, 5, c[1]);
    dots(p, "steel3", [[8, 5], [9, 5]]);
    const pins: [number, number][] = [[7, 4], [6, 3], [9, 4], [9, 3], [8, 2], [11, 4], [11, 3], [11, 2], [11, 1], [12, 4], [12, 3], [12, 2], [14, 4], [14, 3], [15, 2], [16, 4], [17, 3]];
    dots(p, c[1], pins);
    dots(p, c[2], [[6, 3], [8, 2], [11, 1], [12, 2], [15, 2], [17, 3]]);
  },
};
