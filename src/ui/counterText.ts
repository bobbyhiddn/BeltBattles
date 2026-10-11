// COUNT-1 (REQ-BFG-100; REQ-BFG-053): every player-visible string the battle's counters add, in one module
// (docs/TEXT-STYLE.md: capitals, whole sentences, every number through a statFormat.ts formatter). REQ-BFG-107 (CARD-3's
// SHIELD and WARD): no string here names the soak layer or the one-hit block. Each keyword's word and its reminder come
// from the glossary's row for its internal key (faces.ts REMINDER's key: PLATE for the soak layer, SHIELD for the block),
// so these counters read CARD-3's words after its merge with no change here. Tests assert by key, never by the word.

import { JAM_THRESHOLD } from "../sim/content";
import { ICON, type KeywordName } from "../render/font";
import { C } from "../render/palette";
import { GLOSSARY, glossaryText, type GlossaryRow } from "./glossary";
import { fmtCount } from "./statFormat";

/** The glossary row of a face keyword, by its internal key (faces.ts REMINDER's; glossary.ts `kw`). */
export function keywordRow(kw: KeywordName): GlossaryRow | undefined {
  return GLOSSARY.find((r) => r.kw === kw);
}

/** One entry of a counter's panel: a head (the keyword's icon and word in its colour, then the count in white; none for
 *  C5 and C6) over a body in glossary markup (a keyword's reminder as a word tap shows it; C5's and C6's sentences). */
export interface CounterEntry {
  icon: string;
  word: string;
  colour: string;
  count: string;
  body: string;
}

/** A keyword count's entry: "BURN 12" over BURN's reminder (the glossary's definition, as the build view's word tap shows
 *  it with no piece). Null: no row for that key. */
export function keywordEntry(kw: KeywordName, count: string): CounterEntry | null {
  const row = keywordRow(kw);
  if (!row) return null;
  return { icon: ICON[kw], word: row.word, colour: row.colour, count, body: glossaryText(row.word) ?? row.def };
}

/** C6's tap text: the slugs waiting at the gun (PRESSURE BREECH's count), then the jam rule where the gun can jam (its
 *  number from content.ts JAM_THRESHOLD: the slugs backed up at its intakes). */
export function waitingText(n: number, jams: boolean): string {
  const rule = jams ? `AT ${fmtCount(JAM_THRESHOLD)} BACKED UP IT JAMS AND SKIPS A SHOT.` : "THIS GUN NEVER JAMS.";
  return `SLUGS WAITING AT THIS GUN: ${fmtCount(n)}. ${rule}`;
}

/** C5's tap text. */
export function beltText(n: number): string {
  return `SLUGS ON THIS BELT: ${fmtCount(n)}.`;
}

/** C6's tag after its count while the gun is jammed (the glossary's JAM, one meaning: an over-fed gun skipping a shot). */
export const JAM_TAG = "JAM";

/** A board counter's entry (C5, C6): no head, its sentence in the panel's bone. */
export const sentenceEntry = (body: string): CounterEntry => ({ icon: "", word: "", colour: C.bone, count: "", body });
