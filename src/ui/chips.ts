// U2c (REQ-BFG-046, REQ-BFG-047; R1 MEMO C4, U3): THE SHOP CARD'S STAT CHIP. Each shop card of a piece with a face shows
// one chip: an icon alone (C2: "shop chips and the board use the icon alone") and one value, read off the face's own data
// (faces.ts faceAt: its keyed rule numbers and its stat pairs, each printed by a formatter), never written again here. The
// pick, in order:
//   1. the rule's keyword with its count, when the face has one: TESLA ARC {STUN}1 (at the hero's k; NUM-3: whole seconds); U2e: or the keyword
//      its own payloads carry, a stat of its second row: HOT SWAP {BURN}2 (was {BURN}+2, its rule's number);
//   2. else the face's first stat pair: DART GUN {RATE}55 (NUM-4: its SPEED; was 0.55{SEC}), SCATTER CHOKE {DMG}40%;
//      NUM-4 (REQ-BFG-047): a gun's or a factory's cadence is its SPEED now, DART GUN {RATE}55 (unsigned: a stat);
//   3. else the rule's first number with its icon: PRESSURE BREECH {DMG}+12 (NUM-1: x10), CHAMBER {SLUG}2; a gun's or a factory's
//      FASTER is the {RATE} icon (C1: WORKS FASTER and FIRE RATE fold into RATE): CALIBRATION {RATE}+33% (U2d F2: the
//      chip rule below; a belt's speed is not RATE).
// A piece without a face (RULES and STUN-fold pieces), or a face with no number that has an icon (ROTARY BREECH ★1, SORTING
// ARM, SPOTTER, BRAKE SHOE, OVERDRIVE, GRAPNEL GUN; U2d F2: GREASE WORKS and OVERCLOCKER under the chip rule), keeps today's
// card. The packs are fixed slots, no rolled cards: no chip.
//
// U2d F2 (cap's answer to U2c question 3): THE CHIP RULE. A chip's icon is the mechanic its number measures:
//   - {RATE} is how often a gun fires or a factory works. A FASTER takes it only where its face key says it measures that
//     (RATE_KEYS: a gun's fire rate, GATLING BREECH's spin, STOKER's stoking), never a belt's speed: GREASE WORKS' "60%
//     FASTER" is its belts' speed, so it has no chip (today's card).
//   - A chip never shows a waiting timer (a rest, a cooldown, a hold, a delay, a pulse's period): a rule's {SEC} number is
//     one of those (OVERCLOCKER's rest: no chip, today's card; LIMPET WORKS' delay; SURGE VALVE's and ARMOR PRESS's
//     period). Only a stat pair's {SEC}, a gun's or a factory's cadence, made a {SEC} chip; NUM-4: a cadence is a {RATE}
//     pair now ({RATE}55, unsigned), so no piece makes a {SEC} chip.

import { KEYWORDS, icons, type IconName } from "../render/font";
import { ITEMS } from "../sim/content";
import type { TextOpts } from "./abilityText";
import { faceAt, hasFace, type Face } from "./faces";

/** A number as the face prints it (signed, decimal, a percentage). */
const NUM = /[+-]?\d+(?:\.\d+)?%?/;
/** An icon token ({NAME} or {*NAME}). */
const TOKEN = /\{\*?([A-Z]+)\}/;

/** U2d F2: the face keys (faces.ts) whose FASTER measures how often a gun fires or a factory works: the {RATE} chip's. A
 *  belt's speed ("speed": GREASE WORKS, BRAKE SHOE, OVERDRIVE, SURGE VALVE) is none of them. */
export const RATE_KEYS: Readonly<Record<string, string>> = {
  rate: "a gun fires faster (CALIBRATION, ESCAPEMENT)",
  spin: "a gun fires faster as it spins up (GATLING BREECH)",
  stoke: "a factory works faster (STOKER)",
};

/** U2d F2: a rule's number in {SEC} is a waiting timer (a rest, a delay, a period): never a chip. */
const isTimer = (text: string): boolean => text.includes("{SEC}");

/** One chip from a face string ("+2 {*BURN}", "{*STUN} 0.8", "40% EACH" with its stat's icon): the icon then the number
 *  (SEC after its number), in markup; null without a number or an icon. U2d F2: a FASTER is {RATE} only under a RATE_KEYS
 *  key (`key`, the face's key of a rule number). */
function chipFrom(text: string, icon?: IconName, key?: string): string | null {
  const n = NUM.exec(text)?.[0];
  const rate = /FASTER/.test(text) && key !== undefined && key in RATE_KEYS;
  const name = icon ?? (TOKEN.exec(text)?.[1] as IconName | undefined) ?? (rate ? "RATE" : undefined);
  if (!n || !name) return null;
  // a FASTER (a rule's rate bonus) is signed; NUM-4: a stat pair's {RATE}, a gun's or a factory's SPEED, is a stat: unsigned
  const v = name === "RATE" && rate && !n.startsWith("+") ? `+${n}` : n;
  return name === "SEC" ? `${v}{SEC}` : `{${name}}${v}`;
}

/** WORDS-1: a face's keyed rule number as its face printed it (the first number of `key`'s value: "+3", "50%"). */
const numOf = (f: Face, key: string): string => NUM.exec(f.nums.find(([k]) => k === key)?.[1] ?? "")?.[0] ?? "";

/**
 * WORDS-1 (REQ-BFG-081; READ-1 6.3 option 1: the 15 pieces whose phone card showed no chip scored 33% read alone;
 * TEXT-STYLE 9.3 as ruled 2026-10-10): THE PLAIN CHIPS, one for each piece whose face has no number with an icon (or whose
 * number is a belt's speed or a rest), so every buyable piece's phone card says something before a tap. Each fits the
 * card's chip room beside its price (tests/shopChips.test.ts) and can't be read as damage or as another card's number:
 *   - a belt-speed rig, a word: FAST (GREASE WORKS, OVERDRIVE) or SLOW (BRAKE SHOE), never {RATE} or {DMG} (9.3);
 *   - a keyword the piece works on, its icon with a word or with its face's own number: VENOM DRIP {BURN}+3{SEC} (its BURN
 *     lasts 3 s more), BRACE FRAME {STUN}-50% (STUN on its tiles half as long), FLAK SCREEN {STUN}-30% (30% of STUN shots shot
 *     down), TOLLBOOTH {STUN}BLOCK, MANTLET NO{STUN}, TWIN LATCH {PAIR}PAIR, DRAKE NOZZLE {DMG}TO{BURN};
 *   - else a word for its effect: SORTING ARM {SLUG}COPY, OVERCLOCKER TWICE, ROTARY BREECH SOONER, GRAPNEL GUN {SLUG}RIP,
 *     SPOTTER AIM+1 (its face's number).
 * A number here is the face's own (numOf: printed by its formatter), never a literal.
 */
export const PLAIN_CHIPS: Readonly<Record<string, (f: Face) => string>> = {
  venom: (f) => `{BURN}${numOf(f, "plus")}{SEC}`,
  tollbooth: () => "{STUN}BLOCK",
  braceframe: (f) => `{STUN}-${numOf(f, "cut")}`,
  grease: () => "FAST",
  brake: () => "SLOW",
  overdrive: () => "FAST",
  sorting: () => "{SLUG}COPY",
  overclocker: () => "TWICE",
  twinlatch: () => "{PAIR}PAIR",
  drake: () => "{DMG}TO{BURN}",
  rotary: () => "SOONER",
  grapnel: () => "{SLUG}RIP",
  spotter: (f) => `AIM+${numOf(f, "rerolls")}`,
  mantlet: () => "NO{STUN}",
  flak: (f) => `{STUN}-${numOf(f, "intercept")}`,
};

/** The shop card's chip for `def` at ★1 (o: the hero's class factor for a core, the hero for MIMIC FORGE), in markup, or
 *  null (today's card). WORDS-1: a piece the rule gives no chip takes its PLAIN_CHIPS row. */
export function shopChip(def: string, o: TextOpts = {}): string | null {
  if (!hasFace(def) || ITEMS[def]?.kind === "supply") return null;
  const f = faceAt(def, 1, o);
  if (!f) return null;
  const c = ruleChip(f);
  return c ?? PLAIN_CHIPS[def]?.(f) ?? null;
}

/** The chip rule (U2c, U2d F2) on a face at ★1, or null. */
function ruleChip(f: Face): string | null {
  // 1. the rule's keyword with its count
  const kw = f.nums.find(([, v]) => KEYWORDS.some((k) => v.includes(`{*${k}}`) || v.includes(`{${k}}`)));
  if (kw) return chipFrom(kw[1]);
  // U2e step 2 (REQ-BFG-070): or the keyword its own payloads carry, a stat of its second row (HOT SWAP {BURN}2)
  const own = f.stats2?.find(([ic]) => (KEYWORDS as readonly string[]).includes(ic));
  if (own) return chipFrom(String(own[1]), own[0]);
  // 2. the face's first stat pair
  if (f.stats.length) return chipFrom(String(f.stats[0][1]), f.stats[0][0]);
  // 3. the rule's first number with its icon (U2d F2: never a waiting timer; a FASTER only under a RATE_KEYS key)
  for (const [key, v] of f.nums) {
    if (isTimer(v)) continue;
    const c = chipFrom(v, undefined, key);
    if (c) return c;
  }
  return null;
}

/** The chip in glyphs, as the card draws it (icons() alone mode: an icon is its glyph). */
export const shopChipGlyphs = (def: string, o: TextOpts = {}): string | null => {
  const c = shopChip(def, o);
  return c ? icons(c, "alone") : null;
};
