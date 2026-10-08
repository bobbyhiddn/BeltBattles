// RUNES-1 (REQ-BFG-058, M2): a rune's text as the picker, the rune bar and its read-out draw it. A rune's effect is data
// (src/sim/runes.ts RuneDef.text) with R1b-2's tokens: {N} is the typed amount, {NAME} / {*NAME} a keyword. Numbers fill
// in from RuneDef.amount through ONE small formatter per unit (RUNE_UNIT_TEXT), never as literal numbers in a string. On
// this base a keyword token renders as its keyword WORD in its keyword colour (KEYWORD_WORD, RUNE_KEYWORD_COLOUR); when
// the U2 face line merges, the same tokens become its icons. Text style (T1): one idea, whole numbers, no "·" chains in
// an effect line, no hand wrapping (richText.ts wrapRich breaks lines at draw time where a panel needs it).

import { C, RARITY_COLOR } from "../render/palette";
import { ICON } from "../render/font"; // SUS-D (REQ-BFG-069): the SEC icon after a whole number of seconds
import type { Rarity } from "../sim/content";
import type { RuneDef, RuneTheme, RuneUnit } from "../sim/runes";
import { NUMBER_COLOUR, type Span } from "./richText";
import { RUNE_REMINDER, glossaryEntry } from "./glossary"; // U2c: the keyword colours and reminders, one source
import { RUNE_NOTE } from "./glossary"; // Y-FURN: a rune's own reminder (SHATTER SHOT's)
import { hullShown } from "../sim/hullScale"; // HULL-1a (REQ-BFG-079): a max-hull amount on the day's hull

/** A whole number as the game writes it. No rounding here: a rune whose amount is not whole shows it, and
 *  tests/runes.ui.test.ts (every number in every rune text is whole) catches it. */
const whole = (n: number): string => String(n);

/** One formatter per unit (the NUMBERS job scales dmg, hull and plate amounts by script; the text never changes). */
export const RUNE_UNIT_TEXT: Readonly<Record<RuneUnit, (n: number) => string>> = {
  dmg: whole,
  hull: whole,
  plate: whole,
  gold: whole,
  belt: whole,
  count: whole,
  pct: (n) => `${whole(n)}%`,
  // SUS-D (REQ-BFG-069): whole seconds, the SEC icon after the number, as the faces write a cadence ("6" then SEC: TICK
  // GUARD's EVERY 6s, WARD BELL's line form)
  sec: (n) => `${whole(n)}${ICON.SEC}`,
};

/** The keywords a rune's text may name, and the word each renders as on this base. */
// RUNES-2a: BURN, RIDE and STALL join (the new runes name them), each in the colour the game's text already gives it
// SUS-B (REQ-BFG-069): SHIELD, HEAL and REGEN join (WARD STONE names SHIELD now; SUS-D's runes name all three)
// FLIP-X2 (N4-d, REVIEW-NUM4 section 4): the STALL token is STUN now (STEADY IRON's {*STUN}), one word for one stop; STALL
// stays only as a glossary alias of STUN
export type RuneKeyword = "HULL" | "BELT" | "GOLD" | "DMG" | "RATE" | "PLATE" | "PAIR" | "HEAT" | "FRAY" | "BURN" | "RIDE" | "STUN"
  | "SHIELD" | "HEAL" | "REGEN";
export const KEYWORD_WORD: Readonly<Record<RuneKeyword, string>> = {
  HULL: "HULL", BELT: "BELT", GOLD: "GOLD", DMG: "DMG", RATE: "RATE", PLATE: "PLATE", PAIR: "PAIR", HEAT: "HEAT", FRAY: "FRAY",
  BURN: "BURN", RIDE: "RIDE", STUN: "STUN", SHIELD: "SHIELD", HEAL: "HEAL", REGEN: "REGEN",
};

/**
 * SUS-B (REQ-BFG-069, REQ-BFG-070; SUSTAIN-1 4.2): a rune's effect line as the cards draw it, where it differs from
 * RuneDef.text (src/sim/runes.ts, which a display job leaves alone). SUS-D moved its one row (WARD STONE's "START: +{N}
 * {*SHIELD}.") into runes.ts with the sustain runes, so it is empty: every card reads RuneDef.text. Kept, with
 * runeTextOf, as the place a later display job overrides a line without touching the rules file.
 * Y5 (release Y; BRIEF-Y5; REVIEW-Y3: ONLINE retires once no text names it; folded at the flip, Y7b2, from the star switch's
 * STAR_RUNE_TEXT): QUICK LATCH says START, the word ASSEMBLY LINE's face uses (abilityText.ts startIn), where it said
 * ONLINE; text only: the rune's rule, id and amount are unchanged, and RuneDef.text (src/sim/runes.ts) stays.
 */
export const RUNE_TEXT: Readonly<Record<string, string>> = {
  quick_latch: "YOUR {BELT} RIGS: START {N} SOONER.",
};
/** A rune's effect line in R1b-2's tokens: its RUNE_TEXT row, else RuneDef.text. */
export const runeTextOf = (def: RuneDef): string => RUNE_TEXT[def.id] ?? def.text;
/** Each keyword's colour (render/palette.ts C): the hull's red, gold's yellow, the belts' brass, damage white, speed's yellow
 *  (richText.ts KEYWORD_COLOUR.faster), BASTION's plating, FOUNDRY's pair cyan, FURNACE's fire, WEAVER's plum. RUNES-2a:
 *  BURN in richText's burn colour (fire, as HEAT), RIDE in the belts' wood, STUN in shock's cyan (was the STALL token).
 *  U2c (REQ-BFG-046; REQ-BFG-032 rule 3): one source, the glossary's row for the word (src/ui/glossary.ts): a face keyword in
 *  its icon's colour (font.ts ICON_COLOUR: PAIR the TWIN family's blue, HEAT amber, as the faces draw them), STUN in STUN's. */
export const RUNE_KEYWORD_COLOUR: Readonly<Record<RuneKeyword, string>> = Object.fromEntries(
  (Object.keys(KEYWORD_WORD) as RuneKeyword[]).map((k) => [k, glossaryEntry(KEYWORD_WORD[k])?.colour ?? C.bone]),
) as Record<RuneKeyword, string>;
/** The effect line's own colour (richText.ts colourize's base) and its numbers' (richText NUMBER_COLOUR). */
export const RUNE_TEXT_COLOUR = C.bone;

const TOKEN = /\{(\*?)([A-Z]+)\}/g;
const isKeyword = (k: string): k is RuneKeyword => Object.prototype.hasOwnProperty.call(KEYWORD_WORD, k);

/** HULL-1a (REQ-BFG-079): the rune kinds whose amount is max hull (IRON SKIN, SPARE HULL into hullBonus; BULKHEADS and
 *  SCRAP HALO per unit at the battle's start). With HULL_SCALE on and a day, their {N} reads that day's number (hullScale.ts
 *  hullShown); HEAL and REGEN amounts don't scale. */
const MAX_HULL_KINDS: ReadonlySet<string> = new Set(["hull", "perTurretHull", "mergedHull"]);

/** The rune's amount as its text shows it ("15", "25%"). HULL-1a: `day`, the day it is read on (a max-hull amount shows
 *  the day's number with the switch on; off, or no day, 0.9.7's). */
export const runeAmountText = (def: RuneDef, day?: number): string =>
  RUNE_UNIT_TEXT[def.amount.unit](MAX_HULL_KINDS.has(def.kind) ? hullShown(def.amount.n, day) : def.amount.n);

/**
 * RuneDef.text as rich-text spans (richText.ts Span): {N} filled from def.amount through its unit's formatter, in the
 * number colour (a "+" or "-" right before it joins the number, as colourize colours "+15"); each keyword token as its
 * word in its colour; the rest in RUNE_TEXT_COLOUR. An unknown token shows as its bare name (a test pins that none is).
 */
export function runeSpans(def: RuneDef, base: string = RUNE_TEXT_COLOUR, day?: number): Span[] {
  return spansOf(def, runeTextOf(def), base, day); // SUS-B: WARD STONE's SHIELD line (RUNE_TEXT); HULL-1a: `day`
}

/** Y-FURN (REQ-BFG-070; TEXT-STYLE 3.1): a rune text's sentences, in order. One ability line is one trigger and one
 *  effect, so a text of two abilities (SEARING, SHATTER SHOT) is two sentences, and a card starts each on its own line
 *  (runeBar.ts runeTextLines). Every other rune's text is one sentence. A template holds no digit (no literal number) and
 *  no line break (TEXT-STYLE 8.2), so a full stop then a space always ends a sentence. */
export const runeSentences = (def: RuneDef): string[] => runeTextOf(def).replace(/\.\s+(?=\S)/g, ".\n").split("\n");

/** Y-FURN: each sentence of the rune's text as rich-text spans, as runeSpans makes the whole text's. */
export const runeSentenceSpans = (def: RuneDef, base: string = RUNE_TEXT_COLOUR, day?: number): Span[][] =>
  runeSentences(def).map((t) => spansOf(def, t, base, day));

/** RuneDef.text's tokens in `text` (the whole text or one sentence of it) as spans: runeSpans' rule. HULL-1a: `day`, the
 *  day its amount is read on (runeAmountText). */
function spansOf(def: RuneDef, text: string, base: string, day?: number): Span[] {
  const out: Span[] = [];
  const push = (t: string, c: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.c === c) last.t += t;
    else out.push({ t, c });
  };
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    let plain = text.slice(at, m.index);
    at = (m.index ?? 0) + m[0].length;
    const name = m[2];
    if (name === "N") {
      const sign = /[+-]$/.exec(plain)?.[0] ?? "";
      plain = sign ? plain.slice(0, -1) : plain;
      push(plain, base);
      push(sign + runeAmountText(def, day), NUMBER_COLOUR);
    } else {
      push(plain, base);
      push(isKeyword(name) ? KEYWORD_WORD[name] : name, isKeyword(name) ? RUNE_KEYWORD_COLOUR[name] : base);
    }
  }
  push(text.slice(at), base);
  return out;
}

/** The effect line's plain text ("+15 HULL."). HULL-1a: on `day` (a max-hull amount: the day's number with the switch on). */
export const runeLine = (def: RuneDef, day?: number): string => runeSpans(def, undefined, day).map((s) => s.t).join("");

/** The keywords a rune's text names, in order (the starred ones first: they carry a reminder). */
export function runeKeywords(def: RuneDef): RuneKeyword[] {
  const starred: RuneKeyword[] = [], plain: RuneKeyword[] = [];
  for (const m of runeTextOf(def).matchAll(TOKEN)) {
    const k = m[2];
    if (!isKeyword(k)) continue;
    const list = m[1] ? starred : plain;
    if (!list.includes(k)) list.push(k);
  }
  return [...starred, ...plain.filter((k) => !starred.includes(k))];
}

/** The keyword a rune's chip shows: its first starred keyword (the one with a reminder), else the last one named
 *  ("+{N} {HULL}." -> HULL; "EACH TURRET'S FIRST SHOT: +{N} {DMG}." -> DMG). */
export function runeKeyword(def: RuneDef): RuneKeyword | null {
  const text = runeTextOf(def); // SUS-B: WARD STONE's SHIELD line (RUNE_TEXT)
  const starred = /\{\*([A-Z]+)\}/.exec(text)?.[1];
  if (starred && isKeyword(starred)) return starred;
  const all = [...text.matchAll(TOKEN)].map((m) => m[2]).filter(isKeyword);
  return all.length ? all[all.length - 1] : null;
}

/** The keyword reminders (no numbers: the amounts live in the effect line). U2c (REQ-BFG-046): the glossary's
 *  (src/ui/glossary.ts RUNE_REMINDER), each saying what its row says, one source. */
const REMINDER: Partial<Record<RuneKeyword, string>> = RUNE_REMINDER;
export const PLAIN_REMINDER = "KEPT ALL RUN.";

/** One short reminder line for an opened card: its keyword's (PLATE, PAIR, HEAT, FRAY, RATE), else PLAIN_REMINDER.
 *  Y-FURN: a rune's own reminder (glossary.ts RUNE_NOTE: SHATTER SHOT's) comes first. */
export function runeReminder(def: RuneDef): string {
  if (RUNE_NOTE[def.id]) return RUNE_NOTE[def.id];
  for (const k of runeKeywords(def)) if (REMINDER[k]) return REMINDER[k]!;
  return PLAIN_REMINDER;
}

/** The reminder as spans: its keyword word in the keyword's colour, the rest in `base` (dim). Y-FURN: a rune's own
 *  reminder colours the keyword it leads with, as a keyword's reminder does. */
export function runeReminderSpans(def: RuneDef, base: string = C.slate4): Span[] {
  const s = runeReminder(def), note = RUNE_NOTE[def.id];
  const k = runeKeywords(def).find((q) => (note ? s.startsWith(`${KEYWORD_WORD[q]}: `) : REMINDER[q] === s));
  if (!k || !s.startsWith(KEYWORD_WORD[k])) return [{ t: s, c: base }];
  return [{ t: KEYWORD_WORD[k], c: RUNE_KEYWORD_COLOUR[k] }, { t: s.slice(KEYWORD_WORD[k].length), c: base }];
}

/** The tier as a word (FIX-10: the tier shows as a word as well as a colour). */
export const tierWord = (tier: Rarity): string => tier.toUpperCase();
/** The tier's colour (palette.ts RARITY_COLOR). */
export const tierColour = (tier: Rarity): string => RARITY_COLOR[tier] ?? C.steel3;

const THEME_WORD: Readonly<Record<RuneTheme, string>> = {
  furnace: "FURNACE", weaver: "WEAVER", foundry: "FOUNDRY", bastion: "BASTION", belts: "BELTS", factories: "FACTORIES",
  turrets: "TURRETS", gold: "GOLD", armor: "ARMOR", stars: "STARS", // RUNES-2a: R1b's "stars and merging"
};

/** The card's tag line: "RARE · ARMOR". */
export const runeTag = (def: RuneDef): string => `${tierWord(def.tier)} · ${THEME_WORD[def.theme]}`;

/** The read-out's sub line: "RARE RUNE · TAKEN DAY 4" (`day`: the dawn it was taken). */
export const runeTaken = (def: RuneDef, day: number): string => `${tierWord(def.tier)} RUNE · TAKEN DAY ${day}`;

/** A rune's initials for its chip ("IRON SKIN" -> "IS", "GUN OIL" -> "GO"; one word: its first two letters). */
export function runeInitials(def: RuneDef): string {
  const w = def.name.split(/\s+/).filter(Boolean);
  return w.length >= 2 ? w[0][0] + w[1][0] : (w[0] ?? "?").slice(0, 2);
}
