// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E7): the words' TEXT, pure (no canvas, no screen): what a word's own card says in its tap panel
// (its name in its colour, one line for each kind of piece it can go on, `NOT ON A RIG` for MASSIVE and SWIFT) and the NOTES every
// enchanted piece and every word card hides behind the hover or the tap. The build screen's panels (inspector.ts), the APPLY mode and
// the cold-read export all print from here, so one string lives in one place. Every line is built from enchant.ts enchantLine, which is
// built from ENCHANT_NUM, so a bench change to a number moves the text with it.
//
// THE PANEL FACE of an enchanted piece (run 3, E7) is built from the helpers below, read by faces.ts (the stat pairs), faceBlocks.ts (the
// blocks) and inspector.ts (the title and the NOTES):
//   - the NAME: the word first, in its colour, then the piece's name in its rarity colour (nameSpans): `FIERY` WHETSTONE;
//   - a STAT word (FIERY) adds its stat at the END of the piece's stat row, in its colour; a LINE word (RISING, GROWING, ECHOING, MASSIVE,
//     SWIFT, WIDE, BRACED) adds ONE line under the piece's own line, always visible, in its colour (pieceLine / wordLine at THIS piece's
//     stars: RISING's +5, GROWING's +5, FIERY's BURN and BRACED's stuns multiply by the stars);
//   - a number the word CHANGES is shown changed, in its colour: MASSIVE's and SWIFT's rate and DMG, GROWING's DMG with the grown amount,
//     WIDE's belt or gear slots (the rows are faces.ts's, with the word's numbers; the changed pairs are found by comparing the two rows).
// Everything here is plain data: the switch (enchantRules) is asked by liveWord, so with it off no function here finds a word.

import { ITEMS, type ItemDef } from "../sim/content";
import {
  ENCHANT_DEFS, ENCHANT_NUM, enchantKindOf, enchantLine, enchantShare, enchantStars, liveWord, type EnchantId, type EnchantKind,
} from "../sim/enchant";
import { pct, roundHalfUp } from "../sim/pct";
import type { Span } from "./richText";

/** The default rules text, behind the hover or the tap (E7; REQ-BFG-087's spacing, docs/TEXT-STYLE.md): what an enchantment is. */
export const ENCHANT_NOTES: readonly string[] = [
  "ENCHANTED: ONE EXTRA EFFECT ON THIS PART, SHOWN IN ITS COLOUR. IT STAYS WHEN YOU MOVE THE PART AND IS LOST IF YOU SELL IT.",
  "A PART HOLDS ONE: A NEW ONE REPLACES IT.", // TEXT-STYLE bans PER (a rate word): the brief's `ONE PER PART` is reworded (run 3)
];

/** A line as the panel draws it: enchant.ts writes an icon as [NAME] (the brief's form); the panels' markup is {NAME}, and the word DMG is
 *  its icon (TEXT-STYLE 8.4: `+2 {DMG}`, never DMG as a word). A `{*NAME}` or `{NAME}` already in it is left as it is. */
export function panelText(text: string): string {
  return text.replace(/\[([A-Z]+)\]/g, "{$1}").replace(/(?<!\{)\bDMG\b(?!\})/g, "{DMG}");
}

/** One row of a word's own card: the kind it is about, whether the word can go there, the label (`ON A RIG`) and the line it says. */
export interface WordFaceLine {
  kind: EnchantKind;
  legal: boolean;
  label: string; // `ON A RIG` (legal) or `NOT ON A RIG` (the word cannot go on this kind)
  text: string; // the effect line in the panels' markup ({BURN}, {DMG}: pass it through icons()); "" when it cannot go there
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

/** The tap panel's content for the word `id`: `ON A RIG: ...`, `ON A FACTORY: ...`, `ON A TURRET: ...`, and `NOT ON A RIG` for MASSIVE
 *  and SWIFT; then ENCHANT_NOTES. Each line is at star 1 (a word's own card is about no piece), in the panels' markup (panelText). */
export function wordFace(id: EnchantId): WordFace {
  const d = ENCHANT_DEFS[id];
  const lines = (["rig", "factory", "turret"] as const).map((kind): WordFaceLine => {
    const text = wordLine(id, kind, 1);
    return text === null
      ? { kind, legal: false, label: `NOT ON A ${KIND_WORD[kind]}`, text: "" }
      : { kind, legal: true, label: `ON A ${KIND_WORD[kind]}`, text };
  });
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
    if (id === "fiery") line = raw.replace(`[BURN]+${n.burn}`, `[BURN]+${n.burn * s}`);
    else if (id === "rising") line = raw.replace(`+${n.risingStep} DMG`, `+${n.risingStep * s} DMG`);
    else if (id === "growing") line = raw.replace(`+${n.growingStep} DMG`, `+${n.growingStep * s} DMG`);
    else if (id === "braced") line = raw.replace(`THE FIRST ${n.bracedStuns} `, `THE FIRST ${n.bracedStuns * s} `);
  }
  return panelText(line);
}

/** The one line a word says under an enchanted piece's own line (a LINE word), at `stars`; null for a stat word, which is shown as a stat
 *  instead (FIERY: `{BURN}+1` at the end of the stat row), and for a kind the word cannot go on. */
export function pieceLine(id: EnchantId, kind: EnchantKind, stars = 1): string | null {
  return id === "fiery" ? null : wordLine(id, kind, stars);
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
 * makes it at no ride: MASSIVE x2 and SWIFT x1/2 share the slug (mult and flat, rounded half up once; SWIFT never under `floor`, the
 * least a slug deals); GROWING's +5 x grow x stars is added flat. Every other word, and no word: base + flat. RISING's DMG ramps with
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

/** What FIERY adds to a hit, a slug or a shot at `stars`: ENCHANT_NUM.burn x stars (E3). */
export const fieryBurn = (stars: number): number => ENCHANT_NUM.burn * enchantStars(stars);

/** What GROWING has added so far to a hit, a slug or a shot: its step x the dusk fights x the stars (0 before the first dusk fight). */
export const grownDmg = (w: Pick<WordOn, "stars" | "grow">): number => ENCHANT_NUM.growingStep * w.grow * w.stars;
