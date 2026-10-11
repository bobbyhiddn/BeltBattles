// U2a (REQ-BFG-046): a piece's new face (src/ui/faces.ts) as the inspector's blocks. Every panel that draws a piece's
// ability text (offer, cargo, placed, fitted; the turret panel's core row) draws its face instead when it has one: the
// stat row(s) and the rule line(s) with their brass trigger labels, kept (T6's phone guarantee).
// U2e step 4 (REQ-BFG-070; the operator: "It'll keep the cards cleaner to not show it all the time"): the always-on face
// drops NEXT★, MERGES INTO, merge progress and the dim reminders. NEXT★ is the ⓘ view's (faceNextBlock, levels.ts); a
// keyword's reminder shows on a word tap, in the desk's hover tooltip and in the ⓘ view's KEYWORDS (glossary.ts).

import type { Block } from "./inspector";
import { faceLines, faceMerge, faceNext, hasFace } from "../../ui/faces";
import { plainRigStats } from "../../ui/faces"; // EXPLAIN-1 (REQ-BFG-084 step 0b): the three plain stat rigs
import { statRow } from "../../ui/icons"; // EXPLAIN-1: a plain rig's stat row
import type { TextOpts } from "../../ui/abilityText";
import { livePerk } from "../../ui/abilityText";

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
export function faceBlocks(def: string, stars: number, o: TextOpts): Block[] | null {
  const fl = faceLines(def, stars, o);
  if (!fl) return null;
  const perkName = stars > 1 && !perkInfoOnly(def) ? livePerk(def, stars) : undefined;
  const perk = perkName && !fl.clause ? `★${stars} ${perkName}` : undefined;
  const out: Block[] = [];
  // EXPLAIN-1 (REQ-BFG-084 step 0b; PIECES-1 3.3): WHETSTONE, TEMPER and BARBED SPOOL draw a plain face: their hit stat as
  // a stat row ({DMG}+20), no HIT: rule line (faces.ts PLAIN_RIGS; faceAt keeps the rule, so LEVELS and the chip stay)
  const plainRig = plainRigStats(def, stars);
  if (plainRig) return [{ role: "ability", text: statRow(plainRig), keep: true }];
  if (fl.stats) out.push({ role: "ability", text: fl.stats, keep: true });
  // U2e step 2 (REQ-BFG-070): the second stat row, what a factory's own payloads carry ({BURN}2 {STUN}1.6), kept
  // SPACE-1 (REQ-BFG-087, D1): one stat item with the first row (tied: no gap between them)
  if (fl.stats2) out.push({ role: "ability", text: fl.stats2, keep: true, ...(fl.stats ? { tie: true } : {}) });
  // WORDS-1 (REQ-BFG-081; TEXT-STYLE 1.4 as ruled 2026-10-10): the plain lines under the stat row (a turret's loads and gear
  // slots, faces.ts turretPlain), kept, in the ability lines' face and colour. EXPLAIN-1 (REQ-BFG-089, E1c): they are kind
  // text (true of every turret), marked `note: "kind"`: a drawn panel (inspector.ts explainPanel) moves them to its ⓘ NOTES
  for (const text of fl.plain ?? []) out.push({ role: "ability", text, keep: true, note: "kind" });
  for (const r of fl.rules) out.push({ role: "ability", text: r.text, keep: true, ...(r.label ? { brass: r.label } : {}) });
  if (perk && out.length) out[out.length - 1] = { ...out[out.length - 1], perk };
  // U2b F6: the perk clause, its label "★2 SPARK JUMP:" in brass, kept (a face never says less than the sim)
  if (fl.clause) out.push({ role: "ability", text: fl.clause.text, keep: true, brass: fl.clause.label });
  // U2b F5: the interim caveats, kept, in 3x5 and the reminder's colour (the "caveat" role)
  for (const text of fl.caveats ?? []) out.push({ role: "caveat", text, keep: true });
  // U2e step 4 (REQ-BFG-070): no dim reminder on the face (C4's optional block, U2b F4's one a keyword): a word tap, the
  // desk's hover tooltip and the ⓘ view's KEYWORDS show it (REMINDER_RANK and REMINDER_STEP stay for the "reminder" role)
  return out;
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
