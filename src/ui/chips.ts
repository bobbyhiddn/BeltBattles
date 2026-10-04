// U2c (REQ-BFG-046, REQ-BFG-047; R1 MEMO C4, U3): THE SHOP CARD'S STAT CHIP. Each shop card of a piece with a face shows
// one chip: an icon alone (C2: "shop chips and the board use the icon alone") and one value, read off the face's own data
// (faces.ts faceAt: its keyed rule numbers and its stat pairs, each printed by a formatter), never written again here. The
// pick, in order:
//   1. the rule's keyword with its count, when the face has one: HOT SWAP {BURN}+2, TESLA ARC {STUN}0.8 (at the hero's k);
//   2. else the face's first stat pair: DART GUN 0.55{SEC} (SEC is a unit after its number), SCATTER CHOKE {DMG}40%;
//   3. else the rule's first number with its icon: PRESSURE BREECH {DMG}+1.2, CHAMBER {SLUG}2; a speed-up's FASTER is the
//      {RATE} icon (C1: WORKS FASTER, FIRE RATE and SPEED fold into RATE): CALIBRATION {RATE}+33%.
// A piece without a face (RULES and STUN-fold pieces), or a face with no number that has an icon (ROTARY BREECH ★1, SORTING
// ARM, SPOTTER, BRAKE SHOE, OVERDRIVE, GRAPNEL GUN), keeps today's card. The packs are fixed slots, no rolled cards: no chip.

import { KEYWORDS, icons, type IconName } from "../render/font";
import { ITEMS } from "../sim/content";
import type { TextOpts } from "./abilityText";
import { faceAt, hasFace } from "./faces";

/** A number as the face prints it (signed, decimal, a percentage). */
const NUM = /[+-]?\d+(?:\.\d+)?%?/;
/** An icon token ({NAME} or {*NAME}). */
const TOKEN = /\{\*?([A-Z]+)\}/;

/** One chip from a face string ("+2 {*BURN}", "{*STUN} 0.8", "40% EACH" with its stat's icon): the icon then the number
 *  (SEC after its number), in markup; null without a number or an icon. */
function chipFrom(text: string, icon?: IconName): string | null {
  const n = NUM.exec(text)?.[0];
  const name = icon ?? (TOKEN.exec(text)?.[1] as IconName | undefined) ?? (/FASTER/.test(text) ? "RATE" : undefined);
  if (!n || !name) return null;
  const v = name === "RATE" && !n.startsWith("+") ? `+${n}` : n;
  return name === "SEC" ? `${v}{SEC}` : `{${name}}${v}`;
}

/** The shop card's chip for `def` at ★1 (o: the hero's class factor for a core, the hero for MIMIC FORGE), in markup, or
 *  null (today's card). */
export function shopChip(def: string, o: TextOpts = {}): string | null {
  if (!hasFace(def) || ITEMS[def]?.kind === "supply") return null;
  const f = faceAt(def, 1, o);
  if (!f) return null;
  // 1. the rule's keyword with its count
  const kw = f.nums.find(([, v]) => KEYWORDS.some((k) => v.includes(`{*${k}}`) || v.includes(`{${k}}`)));
  if (kw) return chipFrom(kw[1]);
  // 2. the face's first stat pair
  if (f.stats.length) return chipFrom(String(f.stats[0][1]), f.stats[0][0]);
  // 3. the rule's first number with its icon
  for (const [, v] of f.nums) {
    const c = chipFrom(v);
    if (c) return c;
  }
  return null;
}

/** The chip in glyphs, as the card draws it (icons() alone mode: an icon is its glyph). */
export const shopChipGlyphs = (def: string, o: TextOpts = {}): string | null => {
  const c = shopChip(def, o);
  return c ? icons(c, "alone") : null;
};
