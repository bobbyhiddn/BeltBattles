// CARD-2 (REQ-BFG-004, REQ-BFG-081, REQ-BFG-089; K1): THE FIRST-SIGHT NOTES. The first time a face the player looks at
// shows an effect keyword, that keyword's definition opens once by itself, exactly as a tap (phone) or a resting mouse
// (desk) would open it: the same box, place, text and close rules (keywords.ts on the build screen's panels, runeBar.ts on
// the rune cards). The first rig panel shows NOTES' rig sentence once, by the panel's icon. One box per open: the rig
// sentence first, then the first keyword not yet done, in reading order; none on a panel that shows a how-to tip.
// - Done: a note is done once its box has been on screen, opened by itself or by the player's own tap or hover.
// - The store is the tips' (src/ui/tips.ts: localStorage "beltbattles.tips", ids "kw:PAIR" and "rig", the same try/catch
//   rules, bb.tips covers them). With no storage the done set lives in memory, so a note shows once a session.
// - Where: only where a screen asks for it (the build screen in its caravan, the dawn picker, the rune bar's read-out and
//   LAST CHANCE). A face drawn anywhere else (a fight's VIEW BATTLEFIELD, the foe's carrier, a hero screen) never asks.

import { completeSight, FIRST_SIGHT_WORDS, kwSight, RIG_SIGHT, sightDone } from "./tips";
import { glossaryEntry } from "./glossary";

/** The note a word belongs to: its glossary row's word (an alias reads as its row: STUNS is STUN's), else the word. */
export const sightKey = (word: string): string => glossaryEntry(word)?.word ?? word;

/** Whether `word` is an effect keyword with a first-sight note (tips.ts FIRST_SIGHT_WORDS). */
export const isSightWord = (word: string): boolean => FIRST_SIGHT_WORDS.includes(sightKey(word));

/** K1: the first word of `words` (in reading order) that is an effect keyword whose note is not done yet, else null. */
export function sightWord(words: readonly string[]): string | null {
  for (const w of words) if (isSightWord(w) && !sightDone(kwSight(sightKey(w)))) return w;
  return null;
}

/** K1: a word's definition box has been on screen (its tap, its hover, or its first sight): its note is done. A word with
 *  no note (a basic stat, a family tag) is ignored. */
export function sawWord(word: string): void {
  if (isSightWord(word)) completeSight(kwSight(sightKey(word)));
}

/** K1: whether the rig sentence's note is done. */
export const rigSeen = (): boolean => sightDone(RIG_SIGHT);

/** K1: the rig sentence has been on screen: its note is done. */
export function sawRig(): void {
  completeSight(RIG_SIGHT);
}
