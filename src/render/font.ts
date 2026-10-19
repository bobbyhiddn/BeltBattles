// Bitmap fonts: a 5x7 main face and a 3x5 micro face. Glyphs are cached per colour.
//
// U1 (REQ-BFG-046, MEMO R1 C2): THE ICON SET, the stat language the piece faces are written in. 16 icons: 14 private-use
// code points, U+E000 DMG .. U+E00D PAIR (ICON; one UTF-16 unit each, so textWidth, wrap, wrapRich and every wrap rule
// count one as one glyph), plus HULL and STAR, today's ♥ and ★ (unchanged). Each has a bitmap in both faces: 5 px wide in
// the 5x7 face (+1 advance: 6 px, as a letter) and 3 px wide in the 3x5 face (+1: 4 px). The bitmaps keep a pixel
// distance from every digit, letter, punctuation glyph and other icon (output-u1/REPORT.md section 4; tests/icons.test.ts).
// - Write one into any string: `+1 ${ICON.BURN}`, or the markup through icons(): "{BURN}" is the icon alone (stat rows,
//   shop chips, the board), "{*BURN}" a keyword in panel style, the icon then its word (icons(s, "alone"): the icon alone).
//   SEC is a unit after its number: "1.25{SEC}" (U1's cold read). src/ui/icons.ts statRow builds a stat row.
// - Colour: drawText draws an icon in its own colour (ICON_COLOUR) wherever the string is drawn (panel bodies, cards, hero
//   select, titles, buttons); an icon with no entry (DMG, SEC, SLUG, BELT, GEAR, UP; ♥ and ★ as today) takes the colour of
//   its text, as a letter does. TextOpts.mono draws every icon in the text's colour. A drop shadow stays the shadow's
//   colour; an outline stays the outline's. Text without an icon draws exactly as before.

import { C } from "./palette";
import { makeCanvas, type G } from "./pixel";
import { onSetScaleRigs } from "../sim/scale"; // SCALE-2b (REQ-BFG-108): POISON joins KEYWORDS while SCALE_RIGS is on

type GlyphMap = Record<string, string>;

/** U1: the first icon code point (U+E000, private use) and the nth icon's one-unit string. */
export const ICON_BASE = 0xe000;
const pua = (n: number): string => String.fromCharCode(ICON_BASE + n);
/** U1 (MEMO C2): the 16 icons. DMG U+E000 .. PAIR U+E00D are private-use code points, one UTF-16 unit each; HULL and STAR
 *  are today's ♥ and ★, so "{HULL}" and "{STAR}" work in the markup. SUS-B (REQ-BFG-069): + SHIELD, HEAL and REGEN at
 *  U+E010 .. U+E012, 19 icons (17 private-use). */
const SHIPPED_ICONS = {
  DMG: pua(0), // damage
  SEC: pua(1), // seconds: a unit after its number, "1.25" then SEC (a small s)
  RATE: pua(2), // faster: folds WORKS FASTER, FIRE RATE and SPEED
  SLUG: pua(3), // a slug, or a turret's loads
  BELT: pua(4), // a belt tile
  GEAR: pua(5), // a gear slot
  GOLD: pua(6), // gold
  UP: pua(7), // a level
  BURN: pua(8), // keyword
  STUN: pua(9), // keyword
  HEAT: pua(10), // keyword (FURNACE)
  FRAY: pua(11), // keyword (WEAVER)
  PLATE: pua(12), // keyword (BASTION)
  PAIR: pua(13), // keyword (FOUNDRY)
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.4): the sustain keywords at U+E010 .. U+E012 (N1 and R1b both claim U+E00E)
  SHIELD: pua(16), // keyword: a count, each stops one whole hit
  HEAL: pua(17), // keyword: gives back hull, never past full
  REGEN: pua(18), // keyword: heals at each whole second
  HULL: "♥",
  STAR: "★",
} as const;
/** The icons by name: the 19 shipped (SHIPPED_ICONS, ICON's enumerable keys) and SCALE-2b's POISON (below). */
export const ICON = SHIPPED_ICONS as typeof SHIPPED_ICONS & { readonly POISON: string; readonly CRACK: string };
// SCALE-2b (REQ-BFG-108; BRIEF-SCALE2b section 3): POISON's drop at pua(15), U+E00F (free; pua(14) is claimed in comments).
// It is ICON.POISON by name everywhere, so "{*POISON}" and the status row's chip draw it; but it is not enumerable: ICON's
// keys stay the 19 shipped names (tests/icons.test.ts pins them), and nothing that lists the icons meets it. Nothing draws
// it with SCALE_RIGS off (no text holds "{POISON}" then, and no hull holds POISON).
Object.defineProperty(ICON, "POISON", { value: pua(15), enumerable: false, writable: false, configurable: false });
// SCALE-2c (REQ-BFG-100, C7; BRIEF-SCALE2c section 4): the hits-taken chip's crack at pua(19), U+E013, the next free slot
// (pua(14) is claimed in comments; 15 is POISON's, 16-18 SUS-B's), not enumerable as POISON's: ICON's keys stay the 19
// shipped names, and nothing draws it with SCALE_RIGS off (the chip shows only with a hits-taken reader aboard, switch on)
Object.defineProperty(ICON, "CRACK", { value: pua(19), enumerable: false, writable: false, configurable: false });
export type IconName = keyof typeof ICON;
/** U1 (MEMO C1): the keywords. "{*NAME}" draws one as its icon then its word, both in the keyword's colour. SUS-B
 *  (REQ-BFG-069; cap's answer 1 to SUSTAIN-1: a budget of 12): + SHIELD, HEAL and REGEN, 9 in all. SCALE-2b
 *  (REQ-BFG-108): + POISON while SCALE_RIGS is on (the 10th; KEYWORD_NAMES holds it, KEYWORDS gains it at the flip). */
const KEYWORD_NAMES = ["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "SHIELD", "HEAL", "REGEN", "POISON"] as const;
export type KeywordName = (typeof KEYWORD_NAMES)[number];
/** The face keywords now, in order: the 9 shipped, then POISON while SCALE_RIGS is on (SCALE-2b: one live list that the
 *  switch's hook below grows and shrinks, so every reader iterates the world it is in and the off world is the base's). */
export const KEYWORDS: readonly KeywordName[] = KEYWORD_NAMES.slice(0, 9);
/**
 * CARD-3 (REQ-BFG-107; the operator, 2026-10-11: "shielding in the genre normally works like plate"): THE PLAYER'S WORDS.
 * KEYWORDS above are INTERNAL names: the markup tokens ("{*PLATE}", "{*SHIELD}"), the REMINDER and glossary keys, the
 * RuneKeyword tokens, ICON's keys, sim fields and test ids keep them, so the hull and PIECES lanes' code still merges and a
 * token always names its mechanic. What a player reads is PLAYER_WORD, one place:
 *   internal name   player word   icon (unchanged)                     colour (unchanged)   the mechanic (src/sim)
 *   PLATE           SHIELD        ICON.PLATE, the riveted plate        C.plate3             soaks damage point for point
 *                   (SHIELDS, SHIELDED)                                                     before the hull (absorb, PLATE_CAP)
 *   SHIELD          WARD          ICON.SHIELD, the ward diamond        C.rune3              blocks all of one hit's damage,
 *                   (WARDS)                                                                 then breaks (shieldHit, SHIELD_CAP)
 *   every other     itself        ICON[name]                           ICON_COLOUR          (unchanged)
 * So "{*PLATE}" draws ICON.PLATE then SHIELD, and "{*SHIELD}" draws ICON.SHIELD then WARD; "{PLATE}" and "{SHIELD}" are
 * the icons alone, as before. The word PLATE is in no player text: a sim string a screen draws goes through glossary.ts
 * gameWords. Names (PLATE ROLLER, WARD STONE, ...) keep their words and are never coloured as a keyword.
 */
export const PLAYER_WORD: Readonly<Record<KeywordName, string>> = {
  BURN: "BURN", STUN: "STUN", HEAT: "HEAT", FRAY: "FRAY", PLATE: "SHIELD", PAIR: "PAIR", SHIELD: "WARD", HEAL: "HEAL", REGEN: "REGEN",
} as Record<KeywordName, string>; // SCALE-2b (REQ-BFG-108): + POISON: "POISON" while SCALE_RIGS is on (the hook below)
/** CARD-3 (REQ-BFG-107): the internal keyword a player word names ("SHIELD" -> PLATE, "WARD" -> SHIELD), else undefined. */
export const keywordOfWord = (word: string): KeywordName | undefined =>
  KEYWORDS.find((k) => PLAYER_WORD[k] === word);
/** CARD-3 (REQ-BFG-107): each keyword icon's player word (ICON.PLATE -> SHIELD, ICON.SHIELD -> WARD), for tools and tests
 *  that print an icon by name. */
export const ICON_WORD: Readonly<Record<string, string>> = Object.fromEntries(KEYWORDS.map((k) => [ICON[k], PLAYER_WORD[k]]));

// 5x7: rows joined with "|"
const F5: GlyphMap = {
  A: ".###.|#...#|#...#|#####|#...#|#...#|#...#",
  B: "####.|#...#|#...#|####.|#...#|#...#|####.",
  C: ".###.|#...#|#....|#....|#....|#...#|.###.",
  D: "####.|#...#|#...#|#...#|#...#|#...#|####.",
  E: "#####|#....|#....|####.|#....|#....|#####",
  F: "#####|#....|#....|####.|#....|#....|#....",
  G: ".###.|#...#|#....|#.###|#...#|#...#|.####",
  H: "#...#|#...#|#...#|#####|#...#|#...#|#...#",
  I: ".###.|..#..|..#..|..#..|..#..|..#..|.###.",
  J: "..###|...#.|...#.|...#.|...#.|#..#.|.##..",
  K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
  L: "#....|#....|#....|#....|#....|#....|#####",
  M: "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
  N: "#...#|#...#|##..#|#.#.#|#..##|#...#|#...#",
  O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
  P: "####.|#...#|#...#|####.|#....|#....|#....",
  Q: ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
  R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
  S: ".####|#....|#....|.###.|....#|....#|####.",
  T: "#####|..#..|..#..|..#..|..#..|..#..|..#..",
  U: "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
  V: "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
  W: "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.",
  X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
  Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..",
  Z: "#####|....#|...#.|..#..|.#...|#....|#####",
  "0": ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.",
  "1": "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
  "2": ".###.|#...#|....#|...#.|..#..|.#...|#####",
  "3": "####.|....#|....#|.###.|....#|....#|####.",
  "4": "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.",
  "5": "#####|#....|####.|....#|....#|#...#|.###.",
  "6": "..##.|.#...|#....|####.|#...#|#...#|.###.",
  "7": "#####|....#|...#.|..#..|.#...|.#...|.#...",
  "8": ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
  "9": ".###.|#...#|#...#|.####|....#|...#.|.##..",
  ".": ".|.|.|.|.|.|#",
  ",": "..|..|..|..|..|.#|#.",
  ":": ".|#|.|.|.|#|.",
  ";": "..|.#|..|..|..|.#|#.",
  "!": "#|#|#|#|#|.|#",
  "?": ".###.|#...#|....#|...#.|..#..|.....|..#..",
  "'": "#|#|.|.|.|.|.",
  '"': "#.#|#.#|...|...|...|...|...",
  "-": "....|....|....|####|....|....|....",
  "+": ".....|..#..|..#..|#####|..#..|..#..|.....",
  "=": ".....|.....|#####|.....|#####|.....|.....",
  "/": "....#|....#|...#.|..#..|.#...|#....|#....",
  "%": "##..#|##..#|...#.|..#..|.#...|#..##|#..##",
  "(": "..#|.#.|#..|#..|#..|.#.|..#",
  ")": "#..|.#.|..#|..#|..#|.#.|#..",
  "[": "###|#..|#..|#..|#..|#..|###",
  "]": "###|..#|..#|..#|..#|..#|###",
  "<": "...#|..#.|.#..|#...|.#..|..#.|...#",
  ">": "#...|.#..|..#.|...#|..#.|.#..|#...",
  "#": ".#.#.|#####|.#.#.|.#.#.|#####|.#.#.|.....",
  "&": ".##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#",
  "_": ".....|.....|.....|.....|.....|.....|#####",
  "*": ".....|#...#|.#.#.|..#..|.#.#.|#...#|.....",
  x: ".....|.....|#...#|.#.#.|..#..|.#.#.|#...#",
  "→": ".....|..#..|...#.|#####|...#.|..#..|.....",
  "←": ".....|..#..|.#...|#####|.#...|..#..|.....",
  "↑": "..#..|.###.|#.#.#|..#..|..#..|..#..|..#..",
  "↓": "..#..|..#..|..#..|..#..|#.#.#|.###.|..#..",
  "·": ".|.|.|#|.|.|.",
  "♥": ".....|.#.#.|#####|#####|.###.|..#..|.....",
  "★": "..#..|..#..|#####|.###.|.#.#.|#...#|.....",
  "▶": "#....|##...|###..|####.|###..|##...|#....",
  "❚": "##.##|##.##|##.##|##.##|##.##|##.##|##.##",
  " ": "...|...|...|...|...|...|...",
  // U1 (REQ-BFG-046): the icons, 5 wide (MEMO C2's bitmaps; SEC, GOLD and HEAT redrawn, REPORT section 2)
  // U2b F1 (REQ-BFG-046): a sword, its thick blade up to the right over a crossguard (U1's burst read as an asterisk
  // beside a number, and CRIT-1's U+E00E will be the burst-like mark; output-u2b SHEET-u2b-0-dmg.png)
  [ICON.DMG]: "...##|..###|.###.|#.#..|.#...|#.#..|.....", // a sword
  [ICON.SEC]: ".....|.....|.####|#....|.###.|....#|####.", // a small s on the baseline
  [ICON.RATE]: ".....|#.#..|.#.#.|..#.#|.#.#.|#.#..|.....", // a double chevron
  [ICON.SLUG]: ".....|.###.|#####|#####|#####|.###.|.....", // a slug
  [ICON.BELT]: "#####|.....|#.#.#|.#.#.|#.#.#|.....|#####", // a belt tile between its rails
  [ICON.GEAR]: ".#.#.|#####|##.##|#...#|##.##|#####|.#.#.", // a cog with a hole
  [ICON.GOLD]: ".###.|###.#|##.##|#####|#####|#####|.###.", // a coin with its glint (a ring reads as a 0)
  [ICON.UP]: ".....|..#..|.###.|#####|.....|#####|.....", // an arrow over a bar
  [ICON.BURN]: "..#..|..##.|.###.|.####|#####|##.##|.###.", // a flame
  [ICON.STUN]: "...##|..##.|.##..|#####|..##.|.##..|##...", // a bolt
  [ICON.HEAT]: "..#..|.##..|..#..|.##..|.###.|#####|.###.", // a thermometer: a stem with 2 ticks, a bulb
  [ICON.FRAY]: "#...#|.#.#.|..#..|.....|#...#|.#.#.|..#..", // a shred mark
  [ICON.PLATE]: "#####|##.##|#...#|#...#|.#.#.|.#.#.|..#..", // a riveted plate (SUS-B: T1 named it SHIELD; the glyph is PLATE's)
  [ICON.PAIR]: ".....|.....|##.##|#####|##.##|.....|.....", // a linked pair
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.4's bitmaps, as drawn)
  [ICON.SHIELD]: "..#..|.#.#.|#...#|#.#.#|#...#|.#.#.|..#..", // a ward diamond with a core
  [ICON.HEAL]: ".###.|.#.#.|##.##|#...#|##.##|.#.#.|.###.", // an outlined cross
  [ICON.REGEN]: "..#..|.###.|..#..|.....|..#..|.###.|..#..", // two stacked small crosses: again and again
  // SCALE-2b (REQ-BFG-108): POISON's drop, an outline (a solid drop sits 3 px from BURN's flame); drawn only while
  // SCALE_RIGS is on
  [ICON.POISON]: "..#..|..#..|.#.#.|#...#|#...#|#...#|.###.", // a drop
  // HITMARK-1E (REQ-BFG-100, C7; BRIEF-HITMARK1E): the hits-on-you chip's mark, an arrow with a solid head driving into a wall: a hit
  // landed on your ship. The icon keeps SCALE-2c's name CRACK and U+E013 (counters.ts HITS_CHIP draws it, red). SCALE-2c's lone jagged
  // line read as FRAY to all four round-M readers (REPORT-SCALE2f 5). It is not FRAY's pair of Vs, BURN's flame, POISON's drop,
  // STUN's bolt or the HULL heart, and no burst (BURST's mark is a red plus; the burst-like mark is CRIT-1's U+E00E): 11 px or more
  // from every other 5x7 glyph, FRAY's 17. The first pick had a head of single pixels (...#.|..#.#|#####|..#.#|...); the cold
  // read's readers saw the mark at about 25 px, so the head is solid
  [ICON.CRACK]: "....#|.#..#|.##.#|#####|.##.#|.#..#|....#", // a hit landing: an arrow into a wall
};

// 3x5
const F3: GlyphMap = {
  A: ".#.|#.#|###|#.#|#.#",
  B: "##.|#.#|##.|#.#|##.",
  C: ".##|#..|#..|#..|.##",
  D: "##.|#.#|#.#|#.#|##.",
  E: "###|#..|##.|#..|###",
  F: "###|#..|##.|#..|#..",
  G: ".##|#..|#.#|#.#|.##",
  H: "#.#|#.#|###|#.#|#.#",
  I: "###|.#.|.#.|.#.|###",
  J: "..#|..#|..#|#.#|.#.",
  K: "#.#|#.#|##.|#.#|#.#",
  L: "#..|#..|#..|#..|###",
  M: "#.#|###|###|#.#|#.#",
  N: "##.|#.#|#.#|#.#|#.#",
  O: ".#.|#.#|#.#|#.#|.#.",
  P: "##.|#.#|##.|#..|#..",
  Q: ".#.|#.#|#.#|##.|.##",
  R: "##.|#.#|##.|#.#|#.#",
  S: ".##|#..|.#.|..#|##.",
  T: "###|.#.|.#.|.#.|.#.",
  U: "#.#|#.#|#.#|#.#|###",
  V: "#.#|#.#|#.#|#.#|.#.",
  W: "#.#|#.#|###|###|#.#",
  X: "#.#|#.#|.#.|#.#|#.#",
  Y: "#.#|#.#|.#.|.#.|.#.",
  Z: "###|..#|.#.|#..|###",
  "0": "###|#.#|#.#|#.#|###",
  "1": ".#.|##.|.#.|.#.|###",
  "2": "###|..#|###|#..|###",
  "3": "###|..#|###|..#|###",
  "4": "#.#|#.#|###|..#|..#",
  "5": "###|#..|###|..#|###",
  "6": "###|#..|###|#.#|###",
  "7": "###|..#|..#|.#.|.#.",
  "8": "###|#.#|###|#.#|###",
  "9": "###|#.#|###|..#|###",
  ".": ".|.|.|.|#",
  ":": ".|#|.|#|.",
  "-": "...|...|###|...|...",
  "+": "...|.#.|###|.#.|...",
  "/": "..#|..#|.#.|#..|#..",
  "%": "#.#|..#|.#.|#..|#.#",
  x: "...|#.#|.#.|#.#|...",
  "!": "#|#|#|.|#",
  "?": "##.|..#|.#.|...|.#.",
  "(": ".#|#.|#.|#.|.#",
  ")": "#.|.#|.#|.#|#.",
  "'": "#|#|.|.|.",
  ",": "..|..|..|.#|#.",
  ";": "..|.#|..|.#|#.",
  '"': "#.#|#.#|...|...|...",
  "=": "...|###|...|###|...",
  "<": "..#|.#.|#..|.#.|..#",
  ">": "#..|.#.|..#|.#.|#..",
  "&": ".#.|#.#|.#.|#.#|.##",
  "·": ".|.|#|.|.",
  // PACKS M2 (REQ-BFG-063): the name tag on the dusk intro (ANNA#3F) is drawn in this face. PACKS run 2 (the lead's
  // ruling R1): a classic five-column hash (was three columns, "#.#|###|#.#|###|#.#", which read like an "H" at 100%:
  // "MIRA#2C" as "MIRAH2C"); the face holds other widths already ("·" one column, " " two)
  "#": ".#.#.|#####|.#.#.|#####|.#.#.",
  "→": "...|..#|###|..#|...",
  "♥": "#.#|###|###|.#.|...",
  // 0.6.1d (ARSENAL.md §8.2): the MERGE badge and star pips need a ★ that fits a 3x5 cell.
  "★": "#.#|.#.|###|.#.|#.#",
  " ": "..|..|..|..|..",
  // U1 (REQ-BFG-046): the icons' 3x5 twins, 3 wide (each the same object as its 5x7, apart from every other 3x5 glyph)
  [ICON.DMG]: "..#|..#|.#.|###|#..", // U2b F1: a sword, a blade up to the right over a crossguard (6 px from STUN)
  [ICON.SEC]: "...|.##|#..|..#|##.", // a small s on the baseline
  [ICON.RATE]: "##.|.##|..#|.##|##.", // a double chevron
  [ICON.SLUG]: "...|###|###|###|...", // a slug
  [ICON.BELT]: "###|...|#.#|...|###", // a belt tile between its rails
  [ICON.GEAR]: "#.#|###|#.#|###|...", // a cog with a hole, 2 teeth
  [ICON.GOLD]: ".#.|###|##.|###|.#.", // a coin with its shine
  [ICON.UP]: ".#.|###|...|...|###", // an arrow over a bar
  [ICON.BURN]: "..#|.##|###|#.#|.#.", // a flame
  [ICON.STUN]: "..#|.#.|###|.#.|#..", // a bolt
  [ICON.HEAT]: ".#.|##.|.#.|###|.#.", // a thermometer: a stem with a tick, a bulb
  [ICON.FRAY]: "#.#|.#.|...|#.#|.#.", // a shred mark
  [ICON.PLATE]: "###|###|#.#|.#.|.#.", // a plate (SUS-B: T1 named it SHIELD; the glyph is PLATE's)
  [ICON.PAIR]: "...|#.#|###|#.#|...", // a linked pair
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.4): REGEN as drawn; SHIELD and HEAL one step off the drawing, because the icon test's
  // 3x5 thresholds refuse it: the drawn diamond "...|.#.|#.#|.#.|..." is 1 px from "+" (punctuation needs 2), so the
  // diamond is one row taller; the drawn HEAL ".#.|###|.#.|...|###" is 1 px from UP (icons need 2) and 2 from "1" (letters
  // and digits need 3), so its cross sits one row lower, on the bar
  [ICON.SHIELD]: "...|.#.|#.#|#.#|.#.", // a ward diamond
  [ICON.HEAL]: "...|.#.|###|.#.|###", // a cross on a bar
  [ICON.REGEN]: ".#.|###|.#.|...|#.#", // a cross with two tick dots
  [ICON.POISON]: ".#.|.#.|###|###|.#.", // SCALE-2b (REQ-BFG-108): a drop, its point up (SCALE_RIGS on only)
  [ICON.CRACK]: "#.#|.##|..#|.##|#.#", // HITMARK-1E (REQ-BFG-100, C7): the 5x7 mark's twin, an arrowhead's point on a wall (SCALE_RIGS on only)
};

/** U1: an icon's own colour, where it has one. RATE is KEYWORD_COLOUR's FASTER (richText.ts), GOLD the shop's price colour
 *  (shop.ts), BURN KEYWORD_COLOUR's burn, STUN SHOCK's cyan, HEAT amber, FRAY violet (plum4: the game gives FRAY and the
 *  LOOM's thread no violet; its hull pip is ice, STUN's neighbour), PLATE BASTION's plating, PAIR the TWIN family's blue
 *  (ui/families.ts). An icon without an entry takes its text's colour. drawText applies it (TextOpts.mono: not). */
export const ICON_COLOUR: Readonly<Record<string, string>> = {
  [ICON.RATE]: C.yellow,
  [ICON.GOLD]: C.yellow,
  [ICON.BURN]: C.fire3,
  [ICON.STUN]: C.cyan,
  [ICON.HEAT]: C.amber,
  [ICON.FRAY]: C.plum4,
  [ICON.PLATE]: C.plate3,
  [ICON.PAIR]: C.blue,
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.4): SHIELD the dwarf rune glow (rune3, clear of PLATE's plate3 and FREEZE's ice),
  // HEAL the genre's green, REGEN the darker teal of the same family (verd3)
  [ICON.SHIELD]: C.rune3,
  [ICON.HEAL]: C.green,
  [ICON.REGEN]: C.verd3,
};
// SCALE-2b (REQ-BFG-108): ICON_COLOUR[ICON.POISON] is the venom yellow-green (palette.ts C.venom), clear of your HP bar's
// lime, HEAL's green and BURN's fire3, set while SCALE_RIGS is on (the hook below; off, the table is the base's)

/** The private-use icons (HULL ♥ and STAR ★ are ordinary text: "★2" stays a star mark, as today). SCALE-2b: + POISON's
 *  drop (ICON.POISON is not enumerable), so a line holding it measures and strips it as an icon. */
const ICON_CHARS: ReadonlySet<string> = new Set([...Object.values(ICON), ICON.POISON, ICON.CRACK].filter((ch) => ch.charCodeAt(0) >= ICON_BASE)); // SCALE-2c: + CRACK
/** The keywords "{*NAME}" draws (KEYWORDS now: SCALE-2b's hook keeps it in step). */
const KEYWORD_SET = new Set<string>(KEYWORDS);

// SCALE-2b (REQ-BFG-108; BRIEF-SCALE2b section 3): POISON joins the keywords while SCALE_RIGS is on (the 10th of the
// budget's 12), after REGEN; off, KEYWORDS is the shipped 9, exactly. The switch's hook (sim/scale.ts onSetScaleRigs).
// So do POISON's player word (PLAYER_WORD) and its colour (ICON_COLOUR): tests/card3.test.ts (r) and icons.test.ts pin
// both tables, as shipped.
onSetScaleRigs((on) => {
  const list = KEYWORDS as KeywordName[], words = PLAYER_WORD as Record<string, string>, colours = ICON_COLOUR as Record<string, string>;
  const at = list.indexOf("POISON");
  if (on && at < 0) list.push("POISON");
  if (!on && at >= 0) list.splice(at, 1);
  if (on) {
    KEYWORD_SET.add("POISON");
    words.POISON = "POISON";
    colours[ICON.POISON] = C.venom;
  } else {
    KEYWORD_SET.delete("POISON");
    delete words.POISON;
    delete colours[ICON.POISON];
  }
});

/** U1: whether `ch` (one UTF-16 unit) is a private-use icon glyph (DMG .. PAIR). */
export const isIcon = (ch: string): boolean => ICON_CHARS.has(ch);

/** U1: `s` without its icon glyphs (richText.ts colourize: "4" and the DMG icon is still a number). */
export const stripIcons = (s: string): string => {
  for (let i = 0; i < s.length; i++) if (ICON_CHARS.has(s[i])) return [...s].filter((ch) => !ICON_CHARS.has(ch)).join("");
  return s;
};

/** U1: how icons() writes a keyword token "{*NAME}": "word", the panel style (the icon, then its word); "alone", the icon
 *  alone (shop chips, the board). */
export type IconMode = "word" | "alone";

/**
 * U1: the markup to glyphs. "{NAME}" is the icon alone: icons("+1 {BURN}") === `+1 ${ICON.BURN}`. "{*NAME}" (one of the 6
 * KEYWORDS) is the keyword: its icon then its word, icons("HIT: 2 {*STUN}") === `HIT: 2 ${ICON.STUN}STUN`; in "alone"
 * mode, the icon alone. An unknown name, or "{*NAME}" on an icon that is no keyword, stays as written. No player text
 * holds a brace (neither face has a brace glyph).
 */
export function icons(s: string, mode: IconMode = "word"): string {
  return s.replace(/\{(\*?)([A-Z]+)\}/g, (m: string, kw: string, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(ICON, name)) return m;
    const ch = ICON[name as IconName];
    if (!kw) return ch;
    if (!KEYWORD_SET.has(name)) return m;
    return mode === "alone" ? ch : ch + PLAYER_WORD[name as KeywordName]; // CARD-3 (REQ-BFG-107): the player's word
  });
}

/** U1: the colour of a keyword in panel style (`word` is a keyword's icon glued to its word, as icons() writes "{*NAME}"),
 *  else undefined. richText.ts colourize colours the word with it; a bare word ("PAIRS", "HEAT JACKET") is untouched. */
export function keywordColour(word: string): string | undefined {
  if (word.length < 2) return undefined;
  // CARD-2 (REQ-BFG-081, K3 g): a keyword's suffix S ("{*STUN}S", TEXT-STYLE 7.2; GALVANIC COIL's ITS {SLUG} {*STUN}S THE
  // PART IT HITS) keeps the keyword's colour, icon and word; was only the bare name, so STUNS drew in the line's base colour
  // CARD-3 (REQ-BFG-107): the glued word is the player's (PLAYER_WORD: SHIELD on ICON.PLATE, WARD on ICON.SHIELD)
  const full = word.slice(1), k = keywordOfWord(full) ?? (full.endsWith("S") ? keywordOfWord(full.slice(0, -1)) : undefined);
  return k && word[0] === ICON[k] ? ICON_COLOUR[word[0]] : undefined;
}

/** U1 (tests, tools): a glyph's bitmap rows in a face ("#" ink, "." blank), or undefined where the face has none. */
export function glyphRows(ch: string, font: FontId = "5"): string[] | undefined {
  const src = FACES[font].map[ch];
  return src === undefined ? undefined : src.split("|");
}

/** U1 (tests, tools): every character a face has a glyph for (the space included). */
export function faceChars(font: FontId = "5"): string[] {
  return Object.keys(FACES[font].map);
}

export type FontId = "5" | "3";

interface Face {
  map: GlyphMap;
  h: number;
  adv: number; // spacing after glyph
}

const FACES: Record<FontId, Face> = {
  "5": { map: F5, h: 7, adv: 1 },
  "3": { map: F3, h: 5, adv: 1 },
};

// Hot path: HUD labels and damage numbers draw every frame. Widths are memoised per
// glyph and outlined glyphs are cached as one sprite (outline + body), so drawing a
// string is one drawImage per character with no per-call allocation.

/**
 * SHOPCARD-1f (REQ-BFG-081, F1; READ-13 round P: all 12 picture readers copied the merge button as `MERGE *2: 7G` and said its mark
 * "looks like an asterisk"): the 3x5 face's ★ is `#.#|.#.|###|.#.|#.#`, an X with a bar, 3 wide. A button label draws a real star
 * instead (TextOpts.star5, set by ui.ts button): this 5x5 solid star, the 5x7 face's ★ (above) cut to the 3x5 face's row count. The 3x5
 * glyph stays as it is for every other 3x5 text (the notes' MERGES INTO ★n, LEVELS, the cards, the help card): nothing else changes.
 * The sprite's key is a private-use code point no string holds (never in a glyph map, so faceChars and the icon tests don't see it).
 */
export const STAR5_ROWS = "..#..|.###.|#####|.###.|.#.#.";
const STAR5_KEY = "";

function source(font: FontId, ch: string): string | undefined {
  if (ch === STAR5_KEY) return STAR5_ROWS;
  const face = FACES[font];
  let src = face.map[ch];
  if (src === undefined) src = face.map[ch.toUpperCase()];
  if (src === undefined) src = face.map["?"];
  return src;
}

const widths: Record<FontId, Map<string, number>> = { "5": new Map(), "3": new Map() };

function glyphWidth(font: FontId, ch: string): number {
  const m = widths[font];
  let w = m.get(ch);
  if (w === undefined) {
    const src = source(font, ch) ?? "...";
    w = src.split("|")[0].length;
    m.set(ch, w);
  }
  return w;
}

// font -> colour -> outline colour ("" = none) -> char -> sprite
const sprites: Record<FontId, Map<string, Map<string, Map<string, HTMLCanvasElement | null>>>> = { "5": new Map(), "3": new Map() };
const OUTLINE_D = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1, -1, 1, 1, 1];

function glyph(font: FontId, ch: string, color: string, outline: string): HTMLCanvasElement | null {
  let byColor = sprites[font].get(color);
  if (!byColor) sprites[font].set(color, (byColor = new Map()));
  let byOutline = byColor.get(outline);
  if (!byOutline) byColor.set(outline, (byOutline = new Map()));
  let c = byOutline.get(ch);
  if (c !== undefined) return c;
  const src = source(font, ch);
  if (src === undefined) {
    byOutline.set(ch, null);
    return null;
  }
  const rows = src.split("|");
  const w = rows[0].length, h = FACES[font].h;
  const pad = outline ? 1 : 0;
  const [cv, g] = makeCanvas(w + pad * 2, h + pad * 2);
  const paint = (col: string, dx: number, dy: number) => {
    g.fillStyle = col;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === "#") g.fillRect(x + pad + dx, y + pad + dy, 1, 1);
    });
  };
  if (outline) for (let i = 0; i < OUTLINE_D.length; i += 2) paint(outline, OUTLINE_D[i], OUTLINE_D[i + 1]);
  paint(color, 0, 0);
  byOutline.set(ch, cv);
  return cv;
}

export function textWidth(s: string, font: FontId = "5"): number {
  if (!s.length) return 0;
  const adv = FACES[font].adv;
  let w = 0;
  for (let i = 0; i < s.length; i++) w += glyphWidth(font, s[i]) + adv;
  return w - adv;
}

export function fontHeight(font: FontId = "5"): number {
  return FACES[font].h;
}

export interface TextOpts {
  font?: FontId;
  align?: "left" | "center" | "right";
  shadow?: string | null; // 1px drop shadow colour
  outline?: string | null; // 1px outline colour (8-way)
  scale?: number; // integer
  /** U1: draw icon glyphs in the text's colour too (default: each icon in its own colour, ICON_COLOUR). */
  mono?: boolean;
  /**
   * SHOPCARD-1f (F1): in the 3x5 face, draw a ★ that follows a space as the 5x5 star (STAR5_ROWS) instead of the 3-wide glyph. The star
   * takes the glyph's own slot and the blank columns of the space before it (2 px to the left), so no width changes: textWidth, the
   * centring, the hook's log and every button's size are those of the 3-wide ★. A ★ with no space before it stays the 3x5 glyph.
   */
  star5?: boolean;
}

/** One pass of a string. U1: `tint`, each icon glyph in its own colour (ICON_COLOUR) where it has one. */
function pass(g: G, s: string, font: FontId, color: string, outline: string, ox: number, oy: number, scale: number, tint = false, star5 = false): void {
  const adv = FACES[font].adv;
  const pad = outline ? scale : 0;
  let cx = ox;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    // SHOPCARD-1f (F1): the 5-wide star sits over the space before it (the 3-wide glyph's columns end where it ends)
    const big = star5 && font === "3" && ch === "★" && s[i - 1] === " ";
    const gl = glyph(font, big ? STAR5_KEY : ch, tint && ch.charCodeAt(0) >= ICON_BASE ? ICON_COLOUR[ch] ?? color : color, outline);
    if (gl) {
      const left = cx - pad - (big ? 2 * scale : 0);
      if (scale === 1) g.drawImage(gl, left, oy - pad);
      else g.drawImage(gl, 0, 0, gl.width, gl.height, left, oy - pad, gl.width * scale, gl.height * scale);
    }
    cx += (glyphWidth(font, ch) + adv) * scale;
  }
}

const NO_OPTS: TextOpts = {};

export function drawText(g: G, s: string, x: number, y: number, color: string, opts: TextOpts = NO_OPTS): number {
  const font = opts.font ?? "5";
  const scale = Math.max(1, Math.floor(opts.scale ?? 1));
  const w = textWidth(s, font) * scale;
  let ox = Math.round(x);
  if (opts.align === "center") ox = Math.round(x - w / 2);
  else if (opts.align === "right") ox = Math.round(x - w);
  const oy = Math.round(y);
  if (opts.shadow) pass(g, s, font, opts.shadow, "", ox + scale, oy + scale, scale, false, opts.star5);
  pass(g, s, font, color, opts.outline ?? "", ox, oy, scale, !opts.mono, opts.star5); // U1: icons in their own colours
  return w;
}

/** Greedy word wrap to a pixel width. */
export function wrap(s: string, maxW: number, font: FontId = "5"): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, font) <= maxW || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
