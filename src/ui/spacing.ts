// SPACE-1 (REQ-BFG-087; the operator, 2026-10-10: "I think we should add space between each description on the cards. They
// are too close together right now, with the example being Dart Gun."): the clear space between two separate items of a
// panel (the family tag, the stat row, each description or note line, the flavour, the hint), on top of the line pitch.
// Inside one wrapped description the pitch stays as it is, so the eye can tell where one item ends and the next begins.
//
// The pitches (src/render/font.ts's faces, as inspector.ts LH lays them): the 5x7 face 9 px a line (7 px glyphs, 2 px
// under them), the 3x5 face 7 (5 and 2; a tight variant's 6). The gap is about half a line: ceil(pitch / 2), 5 and 4, so
// the space between two items (2 + 5 = 7 px, 2 + 4 = 6) reads as clearly bigger than the 2 px between the wrapped lines
// of one sentence. GAP_MIN, ceil(GAP / 2), is the least a tap panel on a phone's band may show (else it grows, D4).

import type { FontId } from "../render/font";

/** SPACE-1 (D2): the gap between two separate items, by the face the panel draws in: 5 (5x7, pitch 9), 4 (3x5, pitch 7). */
export const GAP: Readonly<Record<FontId, number>> = { "5": 5, "3": 4 };

/** SPACE-1 (D2, D4): the least gap a tap panel on a phone's band may show, ceil(GAP / 2): 3 (5x7), 2 (3x5). */
export const GAP_MIN: Readonly<Record<FontId, number>> = { "5": 3, "3": 2 };

/** POLISH-4 (REQ-BFG-089; P4-1, cap's ruling 5: keep the 6 px pitch): the pitch of a battle face's two title rows (inspector.ts planOnce `titleRows`: `RISING RAMPART` / `CANNON ★`), 6 px, the 3x5 face's own line pitch. The sub rows, the family head
 *  and the body all sit that much lower under a two-row title. A leaf module (a number only), so inspector.ts, keywords.ts and battleScout.ts share it without an import cycle (keywords.ts imports only types from inspector.ts). */
export const TITLE_ROW_DY = 6;

/** POLISH-4 (REQ-BFG-089; P4-1): how far below its old place a panel's family head is drawn (inspector.ts drawFamHead, keywords.ts familyTargets: the one formula for both). Under a two-row title (`titleRows`) every place but the one
 *  beside the title is TITLE_ROW_DY lower, like the sub rows; a head beside the LAST of three or more sub rows (`famHead.row`, a foe's face: the owner's row, then the broken sub) is 6 px (the sub rows' pitch) lower for each row past the second.
 *  0 for every panel with neither: its head is where it always was. Pure; the plan's own fields only (a structural type, so this leaf needs no import of inspector.ts). */
export function headDy(plan: { famHead: { at: "sub" | "sub1" | "sub2" | "title"; row?: number } | null; titleRows?: readonly unknown[] }): number {
  const fh = plan.famHead;
  if (!fh || fh.at === "title") return 0;
  return (plan.titleRows ? TITLE_ROW_DY : 0) + (fh.at === "sub2" ? 6 * ((fh.row ?? 1) - 1) : 0);
}
