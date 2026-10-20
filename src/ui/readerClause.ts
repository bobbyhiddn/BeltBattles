// ROWS-1 (REQ-BFG-098, REQ-BFG-100; F2 of BUMP-1E's review, owed since 0.9.13): a scaling reader's READING RULE, said once.
// faces.ts readerFace draws it on the card (`HIT: +3 {DMG} FOR EACH 10 {*PLATE} YOU HAVE.`), and the belt timeline's row for the
// same rig (abilityText.ts hitRow) says it after the rig's name (`IRON WALL +3 DMG FOR EACH 10 SHIELD YOU HAVE`). Both build it
// here, from the rig's `reads` line, so the face and the row cannot drift: the face adds its label and its full stop, the row
// turns the tokens into the bare words the timeline draws (readerRowWords). Pure; the numbers are the day's (dayShown.ts: the
// caller's shownOn), as the face has always shown them.

import { PLAYER_WORD, type KeywordName } from "../render/font";
import type { ReadCount, ReadSpec } from "../sim/content";
import { dmgNow, sustNow } from "./dayShown"; // HULL-1d (REQ-BFG-079): damage x D(d), sustain x S(d), on the text's day
import { fmtDmg } from "./statFormat";

/** SCALE-2c (BRIEF-SCALE2c section 2's face lines; REPORT-SCALE1 3.1): what a reader line counts, in the face's words, the
 *  words after FOR EACH (IRON WALL's per, its day's PLATE, before its count). New text holds no plain PLATE or SHIELD: the
 *  tokens {*PLATE} (draws SHIELD, the soak layer) and {*SHIELD} (draws WARD) say them (REQ-BFG-107). ROWS-1: moved here from
 *  faces.ts, word for word. */
export const READ_WORDS: Readonly<Record<ReadCount, (per: string) => string>> = {
  foeBurn: () => "{*BURN} ON THE FOE",
  foePoison: () => "{*POISON} ON THE FOE",
  beltSlugs: () => "{SLUG} ON ITS BELT",
  ownPlate: (per) => `${per} {*PLATE} YOU HAVE`,
  ownShield: () => "{*SHIELD} YOU HAVE",
  hitsTaken: () => "HIT ON YOU",
  ownHits: () => "OF ITS HITS",
  heartsLost: () => "HEART LOST",
  wins: () => "WIN",
  waiting: () => "{SLUG} WAITING",
};

/** A reader's clause in the faces' markup, with no label and no full stop: `+n {DMG}` (x D(d): dmgNow) or `+n {*PLATE}` (x S(d):
 *  sustNow, as addPlate) FOR EACH what it counts, or LEECH COIL's `{*HEAL} n TIMES THE FOE'S {*POISON}` (x S(d), as heal()).
 *  `num` is the number part the ⓘ LEVELS ladder keys ("+3 {DMG}", "{*HEAL} 3 TIMES"). The same function for the face
 *  (readerFace: `HIT: ${clause}.`) and the belt timeline's row (hitRow: readerRowWords(clause)). */
export function readerClause(r: ReadSpec): { clause: string; num: string } {
  if (r.give === "heal") {
    const n = fmtDmg(sustNow(r.each));
    return { clause: `{*HEAL} ${n} TIMES THE FOE'S ${READ_WORDS[r.count]("").replace(" ON THE FOE", "")}`, num: `{*HEAL} ${n} TIMES` };
  }
  const num = r.give === "plate" ? `+${fmtDmg(sustNow(r.each))} {*PLATE}` : `+${fmtDmg(dmgNow(r.each))} {DMG}`;
  // CINDER MAIL: {*PLATE} draws SHIELD, a letter longer than the design's PLATE, so the brief's "... ON THE FOE." is
  // 227-233 px against the 225 band at every star; "ON FOE." (203-209 px) is the least cut (REPORT Findings)
  const what = READ_WORDS[r.count](r.per ? fmtDmg(sustNow(r.per)) : "");
  return { clause: `${num} FOR EACH ${r.give === "plate" ? what.replace(" ON THE FOE", " ON FOE") : what}`, num };
}

/** A clause as the belt timeline draws its words: each token as a bare word, no icon (the other rows say DAMAGE, BURN, FRAY
 *  in plain words): `{DMG}` as DMG, `{SLUG}` as SLUG, a keyword `{*PLATE}` as the player's word (PLAYER_WORD: SHIELD; `{*SHIELD}`
 *  WARD). Pure. */
export function readerRowWords(clause: string): string {
  return clause.replace(/\{(\*?)([A-Z]+)\}/g, (_m: string, star: string, name: string) => (star ? PLAYER_WORD[name as KeywordName] ?? name : name));
}
