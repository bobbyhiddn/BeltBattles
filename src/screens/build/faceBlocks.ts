// U2a (REQ-BFG-046): a piece's new face (src/ui/faces.ts) as the inspector's blocks. Every panel that draws a piece's
// ability text (offer, cargo, placed, fitted; the turret panel's core row) draws its face instead when it has one: the
// stat row, the rule line(s) with their brass trigger labels, the dim reminder, then NEXT★ and merge progress (today's
// form). The stat row, the rule lines, NEXT★ and merge progress are kept (T6's phone guarantee); the reminder is
// optional (R1 C4) and gives way first on a short band.

import type { Block } from "./inspector";
import { faceLines, faceMerge, faceNext, hasFace } from "../../ui/faces";
import type { TextOpts } from "../../ui/abilityText";
import { livePerk } from "../../ui/abilityText";

/** The reminder's rank among a panel's optional blocks: after an ability's later sentences (2) and a turret's notes'
 *  first rank (1), before the turret notes (4), the hint (6) and the flavour (7). */
export const REMINDER_RANK = 3;
/** U2b F4: each keyword's reminder is its own optional block, in rule order: the first at REMINDER_RANK, the next a step
 *  later (3, 3.1, ...), so a short band keeps the first that fits and lets the others give way one at a time. */
export const REMINDER_STEP = 0.1;

/** The face's blocks at `stars`, or null for a piece that keeps today's text. A star's perk name follows the last rule
 *  line (or the stat row, on a face without one), as today's perk follows the sentence it names. U2b: then the star's
 *  interim perk clause (F6, kept; it names its perk itself), the interim caveats (F5, kept, 3x5) and the reminders (F4,
 *  one optional block each). */
export function faceBlocks(def: string, stars: number, o: TextOpts): Block[] | null {
  const fl = faceLines(def, stars, o);
  if (!fl) return null;
  const perkName = stars > 1 ? livePerk(def, stars) : undefined;
  const perk = perkName && !fl.clause ? `★${stars} ${perkName}` : undefined;
  const out: Block[] = [];
  if (fl.stats) out.push({ role: "ability", text: fl.stats, keep: true });
  for (const r of fl.rules) out.push({ role: "ability", text: r.text, keep: true, ...(r.label ? { brass: r.label } : {}) });
  if (perk && out.length) out[out.length - 1] = { ...out[out.length - 1], perk };
  // U2b F6: the perk clause, its label "★2 SPARK JUMP:" in brass, kept (a face never says less than the sim)
  if (fl.clause) out.push({ role: "ability", text: fl.clause.text, keep: true, brass: fl.clause.label });
  // U2b F5: the interim caveats, kept, in 3x5 and the reminder's colour (the "caveat" role)
  for (const text of fl.caveats ?? []) out.push({ role: "caveat", text, keep: true });
  // C4: the reminder is optional: it shows where there is room, before the hint and the flavour, and gives way first;
  // U2b F4: one block per keyword, in rule order, so each gives way on its own
  fl.reminders.forEach((text, i) => out.push({ role: "reminder", text, rank: REMINDER_RANK + i * REMINDER_STEP }));
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
