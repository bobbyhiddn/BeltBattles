// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E7): THE EIGHT ENCHANTMENTS' ICONS AND THE SPARK MARK.
//
// The keyword icons are glyphs in the font (font.ts ICON, 19 names, pinned name by name by tests/icons.test.ts), so the eight
// words' icons are NOT font glyphs: each is a standalone 12x12 sprite, itemIcon's size (the shop and offer cards draw it at x2,
// 24x24, shop.ts CARD_ICON), drawn the way the sibling art files draw a piece's icon (wave3Art.ts drawWave3Icon, factoryArt.ts
// drawFactoryIcon: character rows and a palette, light from the top-left, no randomness). None of the eight carries an ink
// outline (on a card's dark plate the ink would not show); the palette keeps k for one. Nothing here touches font.ts, the ICON
// table or any existing glyph.
//
// Each icon wears its WORD'S colour (enchant.ts ENCHANT_DEFS[id].color): the body is that colour and its light, shade and deep
// tones are mixed from it, so a colour change in the defs moves the icon with it. The pictures, each clearly apart from the other
// seven and from every keyword glyph (tests/enchant1.icons.test.ts measures it):
//   FIERY    a flame inside a ring (BURN's glyph is a flame alone)
//   RISING   three bars stepping up
//   GROWING  a sprout on its soil
//   ECHOING  a dot and three arcs spreading from it, each fainter
//   MASSIVE  a heavy weight: a loop handle on a block with a plaque
//   SWIFT    a comet: a bright head and three speed streaks
//   WIDE     two arrows pointing outward from a centre bar
//   BRACED   an angle bracket with a diagonal strut (a brace)
//
// THE SPARK (E7, "board marks" and the cards that print no name): a plus of 5 art px, 3x3, in the word's colour with a brighter
// centre, drawn at the top-right of a card (cargo slots, the LAST CHANCE part card, drop cards, the warlord pick buttons,
// road-event choice cards) and on an enchanted piece (the build screen, the battle world, the foe view, the carried ghost).
// It is smaller than any keyword glyph (the smallest is 3x5) and is never drawn in a text line.
//
// Callers: drawEnchantIcon(g, id, x, y, scale) draws an icon; enchantIcon(id) is the cached 12x12 canvas (itemIcon's twin);
// drawEnchantSpark(g, x, y, colour) draws the spark. ENCHANT_ICON_ROWS are the pixel rows the tests compare.

import { ENCHANT_DEFS, ENCHANT_IDS, type EnchantId } from "../sim/enchant";
import { C } from "./palette";
import { fromRows, makeCanvas, px, type G } from "./pixel";

type Cv = HTMLCanvasElement;

/** An icon's size in art px (itemIcon's: a card draws it at x2). */
export const ENCHANT_ICON_SIZE = 12;

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The colour `a` mixed toward `b` by `t` (0 = a, 1 = b), as a hex string. */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return "#" + [ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * The palette letters of an icon's rows: k the ink outline; h, m, l, d the word's colour lit, plain, shaded and deep (m IS the
 * word's colour); w white; y and z the fire's pale tones (FIERY's flame); t and u soil (GROWING's mound). '.' is transparent.
 */
export function enchantPalette(id: EnchantId): Record<string, string> {
  const col = ENCHANT_DEFS[id].color;
  return {
    k: C.ink, w: C.white, y: C.fire4, z: C.fire5, t: C.soil4, u: C.soil5,
    h: mix(col, "#FFFFFF", 0.45), m: col, l: mix(col, C.ink, 0.38), d: mix(col, C.ink, 0.65),
  };
}

/** The eight icons as palette-letter rows (12 rows of 12), the source of the pictures. */
export const ENCHANT_ICON_ART: Readonly<Record<EnchantId, readonly string[]>> = {
  // a flame inside a ring: the ring is lit at the top-left and shaded at the bottom-right, the flame is orange with a pale heart
  fiery: [
    "....mmll....",
    "..mm....ll..",
    ".m.....m..l.",
    ".m....mm..l.",
    "m....mmm...l",
    "m...mmymm..l",
    "l...myyym..d",
    "l..mmyzym..d",
    ".l.mmyyym.d.",
    ".l..mmmm..d.",
    "..ll....dd..",
    "....lldd....",
  ],
  // three bars stepping up to the right, each lit on its top and left
  rising: [
    "............",
    "............",
    "........hhh.",
    "........hml.",
    "........hml.",
    "....hhh.hml.",
    "....hml.hml.",
    "....hml.hml.",
    "hhh.hml.hml.",
    "hml.hml.hml.",
    "hml.hml.hml.",
    "hml.hml.hml.",
  ],
  // a sprout: two leaves on a short stem, rising out of a mound of soil
  growing: [
    "............",
    ".hhh....hhh.",
    "hmmml..lmmmh",
    "hmmmmllmmmmh",
    ".llllllllll.",
    "...llllll...",
    ".....ml.....",
    ".....ml.....",
    ".....ml.....",
    "...uuuuuu...",
    ".tttttttttt.",
    "tttttttttttt",
  ],
  // a dot, and arcs spreading to the right, each farther and fainter: an echo
  echoing: [
    "............",
    ".........l..",
    "......m...l.",
    "...h...m..l.",
    "....h..m..l.",
    ".wh.h..m..l.",
    ".hh.h..m..l.",
    "....h..m..l.",
    "...h...m..l.",
    "......m...l.",
    ".........l..",
    "............",
  ],
  // a heavy weight: a loop handle over a round iron body, lit at the top-left, shaded at the foot (a kettlebell; no plaque, which
  // read as a padlock's keyhole)
  massive: [
    "....hhhh....",
    "...hmmmml...",
    "...hm..ml...",
    "...hm..ml...",
    "...hhmmmml..",
    "..hhmmmmmll.",
    ".hhmmmmmmll.",
    ".hmhhmmmmll.",
    ".hmmmmmmmll.",
    ".hmmmmmmlll.",
    "..lmmmmlld..",
    "...dllddd...",
  ],
  // a comet: a bright diamond head (not a round blob, which is SLUG's glyph) and three streaks fading behind it
  swift: [
    "............",
    "............",
    "............",
    "............",
    ".dlmmh...h..",
    "........hzm.",
    "ddllmmhhzzzm",
    "........hzm.",
    ".dlmmh...m..",
    "............",
    "............",
    "............",
  ],
  // two arrows pointing out from a centre bar: wider
  wide: [
    "............",
    ".....hl.....",
    ".....hl.....",
    "..h..hl..h..",
    ".hm..hl..mh.",
    "hmmmmhlmmmml",
    "lllllhllllll",
    ".ll..hl..ll.",
    "..l..hl..l..",
    ".....hl.....",
    ".....hl.....",
    "............",
  ],
  // a heavy angle bracket with a short diagonal strut and four bolts: a brace (bolted plates, so it does not read as a set square)
  braced: [
    "............",
    ".hml........",
    ".hdl........",
    ".hml........",
    ".hml........",
    ".hmlhm......",
    ".hdl.hm.....",
    ".hml..hm....",
    ".hhhhhhhhhh.",
    ".hmmdmmmdml.",
    ".llllllllll.",
    "............",
  ],
};

/** The icons as pixel masks, '#' a visible pixel (any colour but the ink outline) and '.' none: the rows the tests compare
 *  (the ink outline is near the card's own colour, so what reads is what is not ink). */
export const ENCHANT_ICON_ROWS: Record<EnchantId, string[]> = Object.fromEntries(
  ENCHANT_IDS.map((id) => [id, ENCHANT_ICON_ART[id].map((r) => r.replace(/[^.]/g, (c) => (c === "k" ? "." : "#")))]),
) as Record<EnchantId, string[]>;

const cache = new Map<string, Cv>();

/** The cached 12x12 canvas of a word's icon (itemIcon's twin; a card draws it at x2). An id that is not one of the eight
 *  gives a blank canvas, never a throw (a render loop must not stop on a stray save field). */
export function enchantIcon(id: string): Cv {
  const key = `${id}:${own(ENCHANT_DEFS, id) ? ENCHANT_DEFS[id as EnchantId].color : ""}`;
  let c = cache.get(key);
  if (!c) {
    c = own(ENCHANT_DEFS, id) ? fromRows([...ENCHANT_ICON_ART[id as EnchantId]], enchantPalette(id as EnchantId)) : makeCanvas(ENCHANT_ICON_SIZE, ENCHANT_ICON_SIZE)[0];
    cache.set(key, c);
  }
  return c;
}

/** Draws a word's icon with its top-left at (x, y), each art px `scale` px wide (a card passes 2); false, nothing drawn, for an
 *  id that is not one of the eight (drawWave3Icon's convention). */
export function drawEnchantIcon(g: G, id: string, x = 0, y = 0, scale = 1): boolean {
  if (!own(ENCHANT_DEFS, id)) return false;
  const src = enchantIcon(id), s = Math.max(1, Math.floor(scale));
  if (s === 1) g.drawImage(src, Math.round(x), Math.round(y));
  else g.drawImage(src, 0, 0, src.width, src.height, Math.round(x), Math.round(y), src.width * s, src.height * s);
  return true;
}

/** The spark's size in art px (a plus, 3x3). */
export const ENCHANT_SPARK_SIZE = 3;
/** The spark's pixels, '#' set: a plus of 5, the centre drawn brighter than the arms. */
export const ENCHANT_SPARK_ROWS: readonly string[] = [".#.", "###", ".#."];

/** The spark's centre: the word's colour, lit toward white. */
export function enchantSparkCentre(colour: string): string {
  return mix(colour, "#FFFFFF", 0.6);
}

/** Draws the spark, a 3x3 plus of 5 px with its top-left at (x, y): the four arms in `colour`, the centre brighter. For the
 *  top-right corner of a card that prints no name, and on an enchanted piece. Never inside a line of text. */
export function drawEnchantSpark(g: G, x: number, y: number, colour: string): void {
  px(g, x + 1, y, colour);
  px(g, x, y + 1, colour);
  px(g, x + 2, y + 1, colour);
  px(g, x + 1, y + 2, colour);
  px(g, x + 1, y + 1, enchantSparkCentre(colour));
}
