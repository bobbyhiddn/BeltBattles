// U1 (REQ-BFG-046, MEMO R1 C2 and C4): the stat row, a piece's numbers as icon + number pairs. The icons themselves, their
// colours and the {NAME} / {*NAME} markup are render/font.ts's (ICON, ICON_COLOUR, icons()).

import { ICON, type IconName } from "../render/font";

/** C2's rule: a stat row holds at most 3 icon + number pairs. */
export const STAT_ROW_MAX = 3;

/** One stat: an icon and its value (a number, or text such as "25%", "+1" or "1/4"). */
export type Stat = readonly [IconName, number | string];

/**
 * A stat row from pairs, in glyphs: each icon glued before its value, the pairs one space apart. SEC is the one unit: it
 * follows its number (U1's cold read). statRow([["SEC", 1.25], ["DMG", 4], ["BELT", 1]]) is "1.25{SEC} {DMG}4 {BELT}1"
 * through icons(). Draw it as any text (colourize: the numbers white; each icon in its colour, or the number's). It throws
 * on more than STAT_ROW_MAX pairs: a face that needs a 4th number needs a second idea, not a longer row.
 */
export function statRow(stats: readonly Stat[]): string {
  if (stats.length > STAT_ROW_MAX) throw new Error(`statRow: ${stats.length} pairs; a stat row holds at most ${STAT_ROW_MAX} (MEMO C2)`);
  return stats.map(([name, v]) => (name === "SEC" ? `${v}${ICON.SEC}` : `${ICON[name]}${v}`)).join(" ");
}
