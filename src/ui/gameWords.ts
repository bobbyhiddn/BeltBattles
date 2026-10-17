// CARD-3 (REQ-BFG-107; the operator, 2026-10-11: "Shield sounds fine...except that shielding in the genre normally works
// like plate"): THE GAME'S WORDS for a sim string. The soak layer (internal PLATE: races/bastion.ts absorb, PLATE_CAP) is
// called SHIELD, the one-hit block (internal SHIELD: Battle.shieldHit, SHIELD_CAP) WARD, and the word PLATE leaves the
// game's text. Pure, no imports (faces.ts, glossary.ts, runeText.ts, captainText.ts and the screens use it).

/**
 * CARD-3 (REQ-BFG-107): the names that keep their words in this job (pieces, runes, deck styles, captains' lines' supply):
 * a name is never re-worded and never coloured as a keyword. The rules release renames any that mislead (REPORT-CARD3
 * section 8 lists what each gives). tests/card3.test.ts holds this list to every catalogue name that holds a word.
 */
export const NAMES_KEPT: readonly string[] = [
  // PLAIN-1F (M6, M8; REQ-BFG-107): PLATE BREAKER's display name is SHIELD FUEL (the cold read's round C pick; the key
  // stays platebreaker): it holds SHIELD, so it is kept (gameWords would make it WARD FUEL); was "PLATE BREAKER"
  "PLATE ROLLER", "SHIELD FUEL", "GRAVE PLATES", "SHIP'S PLATE", "TREAD PLATE",
  "WARD BELL", "WARD STONE", "FORGE WARD", "BULWARK WARD", "WARDWORKS",
];

/** The old words and the player's, one pass (two plain replaces in a row would turn the old PLATE into WARD). */
export const GAME_WORDS: Readonly<Record<string, string>> = {
  PLATE: "SHIELD", PLATES: "SHIELDS", PLATED: "SHIELDED", PLATING: "SHIELD", SHIELD: "WARD", SHIELDS: "WARDS",
};
const reEsc = (w: string): string => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GAME_WORD_RE = new RegExp(
  `(${[...NAMES_KEPT].sort((a, b) => b.length - a.length).map(reEsc).join("|")})|(\\{[^{}]*\\})|\\b(PLATES|PLATED|PLATING|PLATE|SHIELDS|SHIELD)\\b`,
  "g",
);

/**
 * CARD-3 (REQ-BFG-107): THE ONE DISPLAY FUNCTION for a string from the sim (src/sim, src/net, src/core: a catalogue desc, a
 * race's or a captain's line, a rune's RuneDef.text) that a screen draws as it is. In one pass it swaps the soak layer's
 * old words for SHIELD's (PLATE, PLATES, PLATED, PLATING) and the block's for WARD's (SHIELD, SHIELDS). It never changes a
 * name (NAMES_KEPT) or a markup token: "{*PLATE}" and "{*SHIELD}" name their mechanics, and the font draws them in the
 * player's words (font.ts PLAYER_WORD). A string the UI writes itself is written in the new words directly.
 */
export const gameWords = (s: string): string =>
  s.replace(GAME_WORD_RE, (m: string, _name: string | undefined, _token: string | undefined, word: string | undefined) => (word ? GAME_WORDS[word] : m));
