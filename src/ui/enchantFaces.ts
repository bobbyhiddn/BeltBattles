// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E7): the words' TEXT, pure (no canvas, no screen): what a word's own card says in its tap panel
// (its name in its colour, one line for each kind of piece it can go on: MASSIVE `ONLY ON A TURRET`, SWIFT `ONLY ON A FACTORY`) and the NOTES every
// enchanted piece and every word card hides behind the hover or the tap. The build screen's panels (inspector.ts), the APPLY mode and
// the cold-read export all print from here, so one string lives in one place. Every line is built from enchant.ts enchantLine, which is
// built from ENCHANT_NUM, so a bench change to a number moves the text with it.
//
// THE PANEL FACE of an enchanted piece (run 3, E7) is built from the helpers below, read by faces.ts (the stat pairs), faceBlocks.ts (the
// blocks) and inspector.ts (the title and the NOTES):
//   - the NAME: the word first, in its colour, then the piece's name in its rarity colour (nameSpans): `FIERY` WHETSTONE;
//   - EVERY word adds ONE line under the piece's own line, always visible, in its colour (pieceLine / wordLine at THIS piece's stars: RISING's and
//     GROWING's steps, FIERY's BURN and BRACED's stuns multiply by the stars). ENCHANT-1c (C1): FIERY is a line word like the other seven, and its
//     number shows ONCE, in its line: no word adds a stat of its own to the stat row, so the row holds the piece's own numbers (a piece with its own
//     BURN keeps it there, unchanged and not coloured). On a PIECE FIERY's line reads `ADDS +1 [BURN] TO EACH HIT, ON TOP OF ITS OWN STATS.` (`TO ITS SLUGS` on a factory, `TO EACH
//     SHOT` on a turret: pieceLine, the words-only fix after round 1 of the strict re-read); ENCHANT-2 (T4c): the word's OWN card and LAST CHANCE's detail say the same
//     words without `, ON TOP OF ITS OWN STATS` (a card shows no part's stats): `ADDS +1 [BURN] TO EACH HIT.` (wordLine, was `ITS HIT: [BURN]+1.`);
//   - a number the word CHANGES is shown changed, in its colour: MASSIVE's and SWIFT's rate and DMG, GROWING's DMG with the grown amount,
//     WIDE's belt or gear slots (the rows are faces.ts's, with the word's numbers; the changed pairs are found by comparing the two rows).
// Everything here is plain data: the switch (enchantRules) is asked by liveWord, so with it off no function here finds a word.

import { ITEMS, type ItemDef } from "../sim/content";
import {
  ENCHANT_DEFS, ENCHANT_NUM, enchantKindOf, enchantLine, enchantShare, enchantStars, liveWord, type EnchantId, type EnchantKind,
} from "../sim/enchant";
import { pct, roundHalfUp } from "../sim/pct";
import type { Span } from "./richText";

/** ENCHANT-2 (REQ-BFG-085; T4b): NOTES line 1 is two sentences, kept apart so a PART's panel can put a third between them (partNotes below). */
const NOTE_WHAT = "ENCHANTED: ONE EXTRA EFFECT ON THIS PART, SHOWN IN ITS COLOUR.";
const NOTE_KEPT = "IT STAYS WHEN YOU MOVE THE PART AND IS LOST IF YOU SELL IT.";

/** The default rules text, behind the hover or the tap (E7; REQ-BFG-087's spacing, docs/TEXT-STYLE.md): what an enchantment is. A WORD's own card
 *  (the ENCHANTER's offer, a warlord pick, the APPLY card) shows these four lines as they are: it shows no part's numbers. A PART's panel reads
 *  partNotes(word) (faces.ts enchantNotes), whose line 1 also says where the numbers above the word's line come from (ENCHANT-2, T4b). */
export const ENCHANT_NOTES: readonly string[] = [
  `${NOTE_WHAT} ${NOTE_KEPT}`,
  "A PART HOLDS ONE: A NEW ONE REPLACES IT.", // TEXT-STYLE bans PER (a rate word): the brief's `ONE PER PART` is reworded (run 3)
  "A MERGE KEEPS ONE: IF BOTH PARTS HAVE ONE, YOU PICK.", // run 5, E10's fix round: no reader could tell from a face what a merge does
  // ENCHANT-1c (C4): 4 of 6 readers (ENCHANT-1b round 1) asked what a merge does when only ONE of the two parts holds a word. The code keeps it: fuse.ts:186
  // calls mergeWords (:201) when either copy has a word, and enchant.ts mergeWord (:288) returns the one copy's word as it is (`fa.ench === undefined` -> fb, `fb.ench === undefined` -> fa)
  "IF ONLY ONE PART HAS ONE, A MERGE KEEPS IT.",
];

/**
 * ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T4b): the sentence a PART's NOTES line 1 gains, by word, answering "is this number the part's, or the word's?".
 * ENCHANT-1c's strict re-read of a FIERY EMBER TROUGH (its own `[BURN]+1` in the row, FIERY's line under it) read FULL 2 of 6: each doubter asked whether
 * the row's +1 already includes FIERY's. One NOTES sentence, `THE NUMBERS ABOVE IT ARE THE PART'S OWN.`, read 6 of 6 (round 3, on a copy). It is true for the
 * words whose stat rows hold ONLY the part's own numbers, and false for the words that change a number in the rows, so it is word-specific:
 *  - FIERY, RISING, ECHOING, BRACED: their rows are the plain piece's, number for number, on every kind, at every star (the line under the rows is the word's:
 *    tests/enchant2.notes.test.ts audits every part on both views of it, placed and in cargo);
 *  - MASSIVE, SWIFT, GROWING, WIDE: they change a number IN THE STAT ROWS (MASSIVE's and SWIFT's RATE and SWIFT's DMG, GROWING's DMG once it has grown, WIDE's
 *    belt or gear slots) and the rows show the changed number in the word's colour. The sentence says so about THE STATS: WIDE on a factory also changes the
 *    belt count in the header's sub line (`FACTORY · BELTS 0/3`), which is drawn in one plain colour, so `THE NUMBERS IT CHANGES ARE SHOWN CHANGED, IN ITS
 *    COLOUR` alone would be false of that one number; scoped to the stats it is true on every face (the audit pins the sub line's one exception).
 * A COLOUR RULE for numbers (1c's QUESTION 1 candidate) is NOT written: the panel draws a number inside a word's own line in the plain colour.
 * A word's own card (wordFace) shows no part's numbers and keeps ENCHANT_NOTES.
 */
const NUMBERS_OWN = "THE NUMBERS ABOVE IT ARE THE PART'S OWN.";
const NUMBERS_CHANGED = "IN THE STATS ABOVE, THE NUMBERS IT CHANGES ARE SHOWN CHANGED, IN ITS COLOUR.";
export const NOTE_NUMBERS: Readonly<Record<EnchantId, string>> = {
  fiery: NUMBERS_OWN, rising: NUMBERS_OWN, echoing: NUMBERS_OWN, braced: NUMBERS_OWN,
  growing: NUMBERS_CHANGED, massive: NUMBERS_CHANGED, swift: NUMBERS_CHANGED, wide: NUMBERS_CHANGED,
};

/** A PART's NOTES holding the word `id` (faces.ts enchantNotes): ENCHANT_NOTES with line 1's second sentence the word's own (NOTE_NUMBERS), between
 *  what an enchantment is and that it stays when the part moves. Lines 2-4 are ENCHANT_NOTES'. */
export function partNotes(id: EnchantId): string[] {
  return [`${NOTE_WHAT} ${NOTE_NUMBERS[id]} ${NOTE_KEPT}`, ...ENCHANT_NOTES.slice(1)];
}

/** A line as the panel draws it: enchant.ts writes an icon as [NAME] (the brief's form); the panels' markup is {NAME}, and the word DMG is
 *  its icon (TEXT-STYLE 8.4: `+2 {DMG}`, never DMG as a word). A `{*NAME}` or `{NAME}` already in it is left as it is. */
export function panelText(text: string): string {
  return text.replace(/\[([A-Z]+)\]/g, "{$1}").replace(/(?<!\{)\bDMG\b(?!\})/g, "{DMG}");
}

/** One row of a word's own card: the kind it is about and the line it says there. ENCHANT-1b (N1): only the kinds the word goes on have a
 *  row, so `legal` is always true (kept for the callers that read it); a word with ONE kind (MASSIVE: a turret, SWIFT: a factory) says
 *  `ONLY ON A TURRET:` and has no `NOT ON ...` rows. */
export interface WordFaceLine {
  kind: EnchantKind;
  legal: boolean;
  label: string; // `ON A RIG`, or `ONLY ON A TURRET` for a word with one kind
  text: string; // the effect line in the panels' markup ({BURN}, {DMG}: pass it through icons())
}

/** A word's own card face: its name and colour, then a row for each kind (rig, factory, turret), then the NOTES. */
export interface WordFace {
  id: EnchantId;
  name: string;
  color: string;
  lines: WordFaceLine[];
  notes: readonly string[];
}

const KIND_WORD: Record<EnchantKind, string> = { rig: "RIG", factory: "FACTORY", turret: "TURRET" };

/** The tap panel's content for the word `id`: `ON A RIG: ...`, `ON A FACTORY: ...`, `ON A TURRET: ...` for each kind it goes on, then
 *  ENCHANT_NOTES. ENCHANT-1b (N1): MASSIVE has ONE line, `ONLY ON A TURRET: ...`, and SWIFT `ONLY ON A FACTORY: ...`: no `NOT ON ...`
 *  rows. Each line is at star 1 (a word's own card is about no piece), in the panels' markup (panelText). */
export function wordFace(id: EnchantId): WordFace {
  const d = ENCHANT_DEFS[id];
  const only = d.kinds.length === 1;
  const lines: WordFaceLine[] = [];
  for (const kind of ["rig", "factory", "turret"] as const) {
    const text = wordLine(id, kind, 1);
    if (text !== null) lines.push({ kind, legal: true, label: `${only ? "ONLY " : ""}ON A ${KIND_WORD[kind]}`, text });
  }
  return { id, name: d.name, color: d.color, lines, notes: ENCHANT_NOTES };
}

/** The word's line on a kind of piece at `stars`, in the panels' markup: enchantLine's text with the numbers that scale with the stars
 *  at THIS piece's stars (RISING's and GROWING's step, FIERY's BURN and BRACED's stuns: the generic line prints star 1's). null where the
 *  word cannot go. A signature factory passes its grade as its stars. */
export function wordLine(id: EnchantId, kind: EnchantKind, stars = 1): string | null {
  const raw = enchantLine(id, kind);
  if (raw === null) return null;
  const s = enchantStars(stars), n = ENCHANT_NUM;
  let line = raw;
  if (s > 1) {
    if (id === "fiery") line = raw.replace(`ADDS +${n.burn} `, `ADDS +${n.burn * s} `); // ENCHANT-2 (T4c): `ADDS +1 [BURN] TO EACH HIT.` (was `ITS HIT: [BURN]+1.`)
    else if (id === "rising") line = raw.replace(`+${n.risingStep} DMG`, `+${n.risingStep * s} DMG`);
    else if (id === "growing") line = raw.replace(`+${n.growingStep} DMG`, `+${n.growingStep * s} DMG`);
    else if (id === "braced") line = raw.replace(`THE FIRST ${n.bracedStuns} `, `THE FIRST ${n.bracedStuns * s} `);
  }
  return panelText(line);
}

/** The one line a word says under an enchanted piece's own line, at `stars`; null for a kind the word cannot go on. ENCHANT-1b (N2; cap's ruling
 *  on QUESTION 5(b)(i), which changes E7's: a piece's own abilities are always visible, REQ-BFG-089): FIERY has its line too, in its colour. ENCHANT-1c (C1; cap's
 *  ruling on 1b's QUESTION 4): this line is where FIERY's number shows, ONCE; the orange stat that N2 kept in the row is gone. ENCHANT-1c's words-only fix
 *  round: FIERY's line on a piece reads `ADDS +1 {BURN} TO EACH HIT, ON TOP OF ITS OWN STATS.` (fieryPieceLine below): the word card's line (wordLine) and
 *  `, ON TOP OF ITS OWN STATS`. */
export function pieceLine(id: EnchantId, kind: EnchantKind, stars = 1): string | null {
  if (id === "fiery") return fieryPieceLine(kind, stars);
  return wordLine(id, kind, stars);
}

/**
 * ENCHANT-1c (words only, after the strict re-read; cap's ruling on the oracle turn 6cf017d8831c7a9f): FIERY's line on a PIECE says what it does in the house sentence form
 * (TEXT-STYLE 8.4: a number before its icon inside a sentence, as RISING's `+1 DMG MORE THAN THE LAST`): `ADDS +1 {BURN} TO EACH HIT, ON TOP OF ITS OWN STATS.` (`TO ITS SLUGS`
 * on a factory, `TO EACH SHOT` on a turret). Round 1 (O/read-c1/grades1): on a piece with its own BURN (the EMBER TROUGH: its row `{BURN}+1`) readers asked whether the line
 * `ITS HIT: {BURN}+1.` ADDS to the row's number or only repeats it, and whether it counts once for each hit or once for a slug. Round 2 (`ADDS +1 {BURN} TO EACH HIT.`): both
 * doubts went; one was left: whether the row's own `{BURN}+1` already includes FIERY's. `ON TOP OF ITS OWN STATS` answers it (round 3, on a copy: E-01 6 of 6, E-01b 6 of 6).
 * ENCHANT-2 (T4c, 1c's QUESTION 3): the word's OWN card and LAST CHANCE's detail take the part's words, `ADDS +1 {BURN} TO EACH HIT.` (wordLine): the same line with
 * `, ON TOP OF ITS OWN STATS` left off, because a card shows no part's stats. So the piece's line IS the card's line plus that clause, derived from it.
 */
function fieryPieceLine(kind: EnchantKind, stars: number): string | null {
  const card = wordLine("fiery", kind, stars);
  return card === null ? null : card.replace(/\.$/, ", ON TOP OF ITS OWN STATS.");
}

// ------------------------------------------------------------------------------------------------------------ the piece's word

/** The word a piece holds as the panels read it (wordOn): its id, the kind of piece it is on, the stars its numbers multiply by, GROWING's
 *  counter and WIDE's side (a rig). */
export interface WordOn {
  id: EnchantId;
  kind: EnchantKind;
  stars: number; // 1..3
  grow: number; // GROWING: the dusk fights the piece has been through; 0 for every other word
  dir?: number; // WIDE on a rig: the added arrow's side at rotation 0
}

/** The word piece `p` holds, as the panel reads it, or undefined: the switch off, no word, a word that is not one of the eight, or a word
 *  that cannot go on this kind of piece (a stray `ench` on gear, MASSIVE on a rig). `stars`: the piece's stars (a signature factory's grade). */
export function wordOn(p: { ench?: string; enchDir?: number; grow?: number } | undefined, def: ItemDef | string | undefined, stars: number): WordOn | undefined {
  const id = liveWord(p);
  if (!id) return undefined;
  const d = typeof def === "string" ? (Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined) : def;
  const kind = enchantKindOf(d);
  if (!kind || !ENCHANT_DEFS[id].kinds.includes(kind)) return undefined;
  const grow = id === "growing" ? Math.max(0, Math.floor(p?.grow ?? 0)) : 0;
  return { id, kind, stars: enchantStars(stars), grow, ...(id === "wide" && p?.enchDir !== undefined ? { dir: p.enchDir } : {}) };
}

/** The word's colour (ENCHANT_DEFS). */
export const wordColour = (id: EnchantId): string => ENCHANT_DEFS[id].color;

/** The title of an enchanted piece's panel: the word first, then the piece's own title (its name and stars): `FIERY WHETSTONE ★★`. */
export const enchantedTitle = (id: EnchantId, title: string): string => `${ENCHANT_DEFS[id].name} ${title}`;

/**
 * The title as spans, wherever the game prints a piece's name: the WORD first in its colour, then the piece's name (and stars) in its
 * rarity colour: [{ t: "FIERY", c: the word's colour }, { t: " WHETSTONE", c: rarity }]. `title` is the piece's own title, or (when it
 * already starts with the word, as a PanelText.title does) the full title: the word is not printed twice.
 */
export function nameSpans(id: EnchantId, title: string, rarity: string): Span[] {
  const word = ENCHANT_DEFS[id].name;
  const rest = title.startsWith(`${word} `) ? title.slice(word.length) : ` ${title}`;
  return [{ t: word, c: ENCHANT_DEFS[id].color }, { t: rest, c: rarity }];
}

// ------------------------------------------------------------------------------------------------------------ the numbers a word changes

/**
 * The damage of a factory's slug under the word `w` (E3): the die's `base` and the flat DMG it carries (a SCRAPPER's), as payloadDamage
 * makes it at no ride: MASSIVE (massiveShare x) and SWIFT x1/2 share the slug (mult and flat, rounded half up once; SWIFT never under
 * `floor`, the least a slug deals); GROWING's growingStep x grow x stars is added flat. Every other word, and no word: base + flat. RISING's DMG ramps with
 * each slug (no one figure), ECHOING and BRACED change none.
 */
export function slugDmg(w: Pick<WordOn, "id" | "stars" | "grow"> | undefined, base: number, flat = 0, floor = 0): number {
  if (!w) return base + flat;
  if (w.id === "massive" || w.id === "swift") {
    const k = enchantShare(w.id);
    return Math.max(floor, roundHalfUp(base * k + pct(flat, 100 * k)));
  }
  if (w.id === "growing") return base + flat + ENCHANT_NUM.growingStep * w.grow * w.stars;
  return base + flat;
}

/** What GROWING has added so far to a hit, a slug or a shot: its step x the dusk fights x the stars (0 before the first dusk fight). */
export const grownDmg = (w: Pick<WordOn, "stars" | "grow">): number => ENCHANT_NUM.growingStep * w.grow * w.stars;
