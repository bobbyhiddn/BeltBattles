// U2a (REQ-BFG-046): a piece's new face (src/ui/faces.ts) as the inspector's blocks. Every panel that draws a piece's
// ability text (offer, cargo, placed, fitted; the turret panel's core row) draws its face instead when it has one: the
// stat row(s) and the rule line(s) with their brass trigger labels, kept (T6's phone guarantee).
// U2e step 4 (REQ-BFG-070; the operator: "It'll keep the cards cleaner to not show it all the time"): the always-on face
// drops NEXT★, MERGES INTO, merge progress and the dim reminders. NEXT★ is the ⓘ view's (faceNextBlock, levels.ts); a
// keyword's reminder shows on a word tap, in the desk's hover tooltip and in the ⓘ view's KEYWORDS (glossary.ts).

import type { Block } from "./inspector";
import { faceLines, faceMerge, faceNext, hasFace } from "../../ui/faces";
import { plainRigStats } from "../../ui/faces"; // EXPLAIN-1 (REQ-BFG-084 step 0b): the three plain stat rigs
import { shapeLines } from "../../ui/faces"; // SHAPES-1 (REQ-BFG-086.1): a shaped piece's own lines
import { statRow } from "../../ui/icons"; // EXPLAIN-1: a plain rig's stat row
import type { TextOpts } from "../../ui/abilityText";
import { livePerk } from "../../ui/abilityText";
import { turretStats } from "../../ui/faces"; // CARD-2 (REQ-BFG-081, K4): the turret row's pairs
import type { Stat } from "../../ui/icons"; // CARD-2 (K4)
import { ICON } from "../../render/font"; // CARD-2 (K4)
import { ITEMS } from "../../sim/content"; // CARD-2 (K4): a turret's face
import { STAT_ROW_MAX } from "../../ui/icons"; // ENCHANT-1 (REQ-BFG-085): a word's pairs never make a row past C2's most
import { icons } from "../../render/font"; // ENCHANT-1: a word's line in glyphs, as faceLines' lines are
import { wordRows, type WordRows } from "../../ui/faces"; // ENCHANT-1 (E7): the stat rows with the word's numbers
import { pieceLine, wordColour, type WordOn } from "../../ui/enchantFaces"; // ENCHANT-1 (E7): the word's colour and its line at the piece's stars

/** CARD-2 (REQ-BFG-081, K4; READ-3 section 7, E10): THE TURRET ROW'S LABELS, Batomon-style: each stat's icon, then its word,
 *  then its number. HOLDS is the word that carries the meaning: the bare {SLUG}n never said the chamber holds n (READ-3 3.3:
 *  39 of 39 face-alone answers asked); GEAR SLOTS says what {GEAR}n counts. The icons stay: the row fits the 402x690 @3 tap
 *  panel's 225 px text row on one line with them and GEAR SLOTS (tests/card2.test.ts measures every turret, every star). */
export const TURRET_LABELS: Readonly<Record<"RATE" | "SLUG" | "GEAR", string>> = { RATE: "RATE", SLUG: "HOLDS", GEAR: "GEAR SLOTS" };
/** The gap between two pairs (two spaces, as the brief writes the row); one space inside a pair. */
export const PAIR_GAP = "  ";

/** CARD-2 (K4): a turret's stat row (turretStats' pairs, or an installed turret's own) as labelled pairs: "{RATE}RATE 55
 *  {SLUG}HOLDS 2  {GEAR}GEAR SLOTS 1" in glyphs, two spaces between pairs. Inspector role "ability" with `pairs` (layBlock
 *  draws it as it is, never splitting a pair: one line where it fits, else one pair a line, as the desk column needs). */
export function turretRow(stats: readonly Stat[]): string {
  // ENCHANT-1 (REQ-BFG-085, E7): a word's own stat (GROWING's {DMG}+n) joins the row as its icon and number, no label word: the labelled row
  // (`RATE 55  HOLDS 2  GEAR SLOTS 1`, 181 px at most) plus a labelled fourth pair would pass the op view's 225 px. (ENCHANT-1c C1: FIERY adds no stat here.)
  return stats.map(([k, v]) => `${ICON[k as keyof typeof ICON]}${TURRET_LABELS[k as keyof typeof TURRET_LABELS] ?? (k === "DMG" ? "" : k)} ${v}`).join(PAIR_GAP);
}

/** The reminder's rank among a panel's optional blocks: after an ability's later sentences (2) and a turret's notes'
 *  first rank (1), before the turret notes (4), the hint (6) and the flavour (7). */
export const REMINDER_RANK = 3;
/** U2b F4: each keyword's reminder is its own optional block, in rule order: the first at REMINDER_RANK, the next a step
 *  later (3, 3.1, ...), so a short band keeps the first that fits and lets the others give way one at a time. */
export const REMINDER_STEP = 0.1;

/** Y1 (REQ-BFG-070; cap's ruling R-1 on STAR-D's design): the pieces whose star perk is a number on the face, so the
 *  perk's name shows in the ⓘ LEVELS view only (levels.ts levelLines: "★2 SPARK JUMP"), never on the face line (the
 *  mock's "★2 SPARK JUMP" after COIL's line ran past the 225 px band): GALVANIC COIL's SPARK JUMP, FROSTBITE FOUNDRY's
 *  HOARFROST, MIMIC FORGE's TWIN SIGNET and TWIN MOULD's THIRD SPRUE. */
export const PERK_INFO_ONLY: readonly string[] = ["coil", "frostbite", "mimic", "twinmould"];

/** Y2 (release Y; ruling R-1, DESIGN-Y rows 8-19): PERK_INFO_ONLY, and the 12 STUN pieces too (faces.ts Y2_PIECES): their
 *  star changes are ladder numbers, so a perk's name (BIG HAUL, FULL GUARD, REDLINE, ...) shows in the ⓘ LEVELS view only,
 *  never after the face line (behind the star switch until the flip, Y7b2). Y3-Y6 added faces.ts Y3_PIECES .. Y6_PIECES.
 *  Y7b2 (the words; R-1 for every piece): true for every piece, so no face draws a perk's name: it shows in the ⓘ LEVELS
 *  view only (levels.ts levelLines: "★2 OVERPRESSURE"). PERK_INFO_ONLY stays Y1's list (the four whose perk was a number). */
export function perkInfoOnly(_def: string): boolean {
  return true;
}

/** The face's blocks at `stars`, or null for a piece that keeps today's text. A star's perk name follows the last rule
 *  line (or the stat row, on a face without one), as today's perk follows the sentence it names (not for PERK_INFO_ONLY's
 *  pieces; Y7b2: perkInfoOnly holds for every piece, so none). U2b: then the star's interim perk clause (F6, kept; it names
 *  its perk itself) and the interim caveats (F5, kept, 3x5). U2e step 4: no reminders (they were F4's optional blocks). */
export function faceBlocks(def: string, stars: number, o: TextOpts, w?: WordOn): Block[] | null {
  const fl = faceLines(def, stars, o);
  if (!fl) return null;
  const perkName = stars > 1 && !perkInfoOnly(def) ? livePerk(def, stars) : undefined;
  const perk = perkName && !fl.clause ? `★${stars} ${perkName}` : undefined;
  const out: Block[] = [];
  // EXPLAIN-1 (REQ-BFG-084 step 0b; PIECES-1 3.3): WHETSTONE, TEMPER and BARBED SPOOL draw a plain face: their hit stat as
  // a stat row ({DMG}+20), no HIT: rule line (faces.ts PLAIN_RIGS; faceAt keeps the rule, so LEVELS and the chip stay)
  const plainRig = plainRigStats(def, stars, o.day); // MERGE-099C: on the read-out's day (HULL-1d), as the rule line
  // SHAPES-1 (REQ-BFG-086.1, REQ-BFG-089): a shaped piece's own lines (UP TO 2 HITS; GANTRY PRESS's FEEDS 4 BELTS IN TURN.
  // and BIGGER: +1 {BELT}) follow its stat row, kept; [] for every other piece and with SHAPES off
  const own: Block[] = shapeLines(def, stars).map((r) => ({ role: "ability", text: r.text, keep: true, ...(r.label ? { brass: r.label } : {}) }));
  // ENCHANT-1 (REQ-BFG-085; E7): a piece holding a word (`w`): its stat rows carry the word's stat or changed numbers in the word's colour (the
  // rows are faces.ts wordRows'), and its one line (a LINE word) goes under the piece's own lines. Without `w` every block below is as before
  const wr = w ? wordRows(def, stars, o, w) : null;
  const wline = wordLineBlocks(w, o.day); // ENCHANT-2 (T6 fix round): on the panel's day
  if (plainRig) return [...(wr ? wordStatBlocks(wr, w!, false) : [{ role: "ability", text: statRow(plainRig), keep: true } as Block]), ...own, ...wline];
  // CARD-2 (REQ-BFG-081, K4): a turret's row in words (RATE 55  HOLDS 2  GEAR SLOTS 1), from the sim at this star; the
  // ladder stays in LEVELS, the phone shop chip keeps {RATE}n (chips.ts), and faceLines (the face data) is unchanged
  if (wr) out.push(...wordStatBlocks(wr, w!, ITEMS[def]?.kind === "turret")); // ENCHANT-1: the rows with the word's numbers (a factory's second row too)
  else if (fl.stats && ITEMS[def]?.kind === "turret") out.push({ role: "ability", text: turretRow(turretStats(def, stars)), keep: true, pairs: true });
  else if (fl.stats) out.push({ role: "ability", text: fl.stats, keep: true });
  // U2e step 2 (REQ-BFG-070): the second stat row, what a factory's own payloads carry ({BURN}2 {STUN}1.6), kept
  // SPACE-1 (REQ-BFG-087, D1): one stat item with the first row (tied: no gap between them)
  if (!wr && fl.stats2) out.push({ role: "ability", text: fl.stats2, keep: true, ...(fl.stats ? { tie: true } : {}) });
  // WORDS-1 (REQ-BFG-081; TEXT-STYLE 1.4 as ruled 2026-10-10): the plain lines under the stat row (a turret's loads and gear
  // slots, faces.ts turretPlain), kept, in the ability lines' face and colour. EXPLAIN-1 (REQ-BFG-089, E1c): they are kind
  // text (true of every turret), marked `note: "kind"`: a drawn panel (inspector.ts explainPanel) moves them to its ⓘ NOTES
  for (const text of fl.plain ?? []) out.push({ role: "ability", text, keep: true, note: "kind" });
  for (const r of fl.rules) out.push({ role: "ability", text: r.text, keep: true, ...(r.label ? { brass: r.label } : {}) });
  out.push(...own); // SHAPES-1: a shaped factory's own lines after its rule lines
  if (perk && out.length) out[out.length - 1] = { ...out[out.length - 1], perk };
  out.push(...wline); // ENCHANT-1: the word's line, under the piece's own line(s); [] for a plain piece
  // U2b F6: the perk clause, its label "★2 SPARK JUMP:" in brass, kept (a face never says less than the sim)
  if (fl.clause) out.push({ role: "ability", text: fl.clause.text, keep: true, brass: fl.clause.label });
  // U2b F5: the interim caveats, kept, in 3x5 and the reminder's colour (the "caveat" role)
  for (const text of fl.caveats ?? []) out.push({ role: "caveat", text, keep: true });
  // U2e step 4 (REQ-BFG-070): no dim reminder on the face (C4's optional block, U2b F4's one a keyword): a word tap, the
  // desk's hover tooltip and the ⓘ view's KEYWORDS show it (REMINDER_RANK and REMINDER_STEP stay for the "reminder" role)
  return out;
}

/**
 * ENCHANT-1 (REQ-BFG-085; E7): the stat-row blocks of a piece holding the word `w` (faces.ts wordRows): each row in glyphs, a row never past
 * C2's most (STAT_ROW_MAX; the rest goes on a tied row), the numbers the word added or changed in the word's colour (Block.hue); a turret's
 * row is its labelled one (turretRow). `onlyHued`: the pairs the word added or changed alone (a faceless piece has no stat row of its own).
 */
function wordStatBlocks(wr: WordRows, w: WordOn, turret: boolean, onlyHued = false): Block[] {
  const colour = wordColour(w.id), out: Block[] = [];
  wr.rows.forEach((row0, r) => {
    const keepIdx = row0.map((_, i) => i).filter((i) => !onlyHued || wr.hue[r].includes(i));
    const row = keepIdx.map((i) => row0[i]), hue = wr.hue[r].map((i) => keepIdx.indexOf(i)).filter((i) => i >= 0);
    if (!row.length) return;
    if (turret) {
      out.push({ role: "ability", text: turretRow(row), keep: true, pairs: true, ...(hue.length ? { hue: { colour, nums: hue } } : {}) });
      return;
    }
    for (let at = 0; at < row.length; at += STAT_ROW_MAX) {
      const nums = hue.filter((i) => i >= at && i < at + STAT_ROW_MAX).map((i) => i - at);
      out.push({ role: "ability", text: statRow(row.slice(at, at + STAT_ROW_MAX)), keep: true, ...(out.length ? { tie: true } : {}), ...(nums.length ? { hue: { colour, nums } } : {}) });
    }
  });
  return out;
}

/** ENCHANT-1 (E7): the one line a word says under the piece's own line, at the piece's stars, in the word's colour and always shown
 *  (kept: it is this piece's own ability); [] for a plain piece and for no word. ENCHANT-1b (N2): FIERY has its line too (`ITS HIT: {BURN}+1.`);
 *  ENCHANT-1c (C1): that line is where its number shows, once (the row no longer repeats it). */
export function wordLineBlocks(w: WordOn | undefined, day?: number): Block[] {
  // ENCHANT-2 (REQ-BFG-085; T6 fix round, cap's ruling 2d9c4479a18adbf5): `day`, the panel's: RISING's and GROWING's damage amounts are the day's, as the stat rows are
  const text = w ? pieceLine(w.id, w.kind, w.stars, day) : null;
  return w && text ? [{ role: "ability", text: icons(text), keep: true, colour: wordColour(w.id) }] : [];
}

/** ENCHANT-1 (E7): the blocks of a piece with no face (its kept sentences) with its word: a stat row of the pairs the word adds or changes,
 *  the sentences as they are, the word's line last. */
export function wordOnSentences(blocks: Block[], def: string, stars: number, o: TextOpts, w: WordOn): Block[] {
  return [...wordStatBlocks(wordRows(def, stars, o, w), w, false, true), ...blocks, ...wordLineBlocks(w, o.day)]; // ENCHANT-2 (T6 fix round): on the panel's day
}

/** The NEXT★ block (C7), or null: no face, or the top star. A line whose numbers say nothing of the perk that star brings
 *  names it after them in brass. */
export function faceNextBlock(def: string, stars: number, o: TextOpts): Block | null {
  const n = faceNext(def, stars, o);
  if (!n) return null;
  if (n.text === n.label) {
    const text = `${n.label} ${n.perk ?? ""}`.trim(); // only the perk changes what the face says: the line in brass
    return { role: "next", text, brass: text, keep: true };
  }
  return { role: "next", text: n.text, brass: n.label, keep: true, ...(n.perk ? { perk: `★${stars + 1} ${n.perk}` } : {}) };
}

/** The MERGES INTO block of an offer that merges on purchase into ★`to` (C7), or null without a face. */
export function faceMergeBlock(def: string, to: number, o: TextOpts, perk?: string): Block | null {
  const text = faceMerge(def, to, o);
  return text ? { role: "merges", text, keep: true, ...(perk ? { perk: `★${to} ${perk}` } : {}) } : null;
}

export { hasFace };
