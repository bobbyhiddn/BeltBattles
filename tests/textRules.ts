// 0.6.2t (REQ-BFG-032): shared helpers for the ability-text tests (not a test file itself): the buyable module table,
// T2's banned-shorthand list, and the number reader the audits use.
import { ITEMS, buyableModules, type ItemDef } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { icons } from "../src/render/font"; // U2d: an icon's markup read as its glyph

/** Every buyable module (the catalogue and fusible(): 23 rigs, 13 factories, 13 cores, 9 mods), then each supply. */
export const MODULES: ItemDef[] = buyableModules().filter((d) => fusible(d.id));
export const SUPPLIES: ItemDef[] = Object.values(ITEMS).filter((d) => d.kind === "supply" && d.price > 0);
export const STARS = [1, 2, 3] as const;
/** The stars a module has: 1-3, a supply only 1. */
export const starsOf = (d: ItemDef): number[] => (fusible(d.id) ? [1, 2, 3] : [1]);
/** A core's class factors: heavy (FURNACE, k 1) and light (WEAVER, k 0.55); everything else reads k 1. */
export const kOf = (d: ItemDef): number[] => (d.kind === "core" ? [1, 0.55] : [1]);

/**
 * T2: shorthand no player-facing ability or flavour text may use: bare multipliers (X2, X0.8, 1.5X), slash rates (/HIT,
 * /S) and their word form PER, a number glued to S (4S), ordinals (2ND, 3RD), "·", engine words no player text explains (DMG, FLAT, a MAX or CAP
 * before a number, IDLE as a timer), the polish's merge wording (NEEDS n MORE), more than two decimals, damage with more
 * than one decimal. Labelled stat rows (a belt's timeline, a turret's rows) aren't checked with this list.
 */
export const BANNED: [RegExp, string][] = [
  [/\bX\d/, "bare multiplier X2"],
  [/\d(?:\.\d+)?X\b/, "bare multiplier 1.5X"],
  [/\/[A-Z]/, "slash rate"],
  [/\bPER\b/, "a PER rate (the texts say FOR EACH, A SECOND or EACH SHOT)"],
  [/\b\d+(?:\.\d+)?S\b/, "glued seconds"],
  [/\b\d+(?:ST|ND|RD|TH)\b/, "ordinal"],
  [/·/, "middle dot"],
  [/\bDMG\b/, "DMG"],
  [/\bFLAT\b/, "FLAT"],
  [/\b(?:MAX|CAP)\s*\+?\d/, "MAX/CAP before a number"],
  [/\bIDLE \d/, "IDLE timer"],
  [/\b(?:COMMISSIONS?|BOOSTABLE|WINDOWS?|TIER|INTERVAL|FIFO|PRIOR)\b/, "an engine word"],
  [/\bNEEDS \d+ MORE\b/, "the polish's merge wording"],
  [/\d\.\d{3,}/, "more than two decimals"],
  [/\d\.\d\d DAMAGE/, "damage with two decimals"],
  [/\n/, "a hand-made line break"],
];

/** The T2 violations in a text ([] when clean). U2d (REQ-BFG-045, REQ-BFG-046; the style guide, output-t1/REPORT.md 2.7,
 *  T2 narrowed): the faces' forms are allowed: an icon (its glyph, or its markup {DMG} / {*BURN}, read here as the glyph it
 *  draws, so {DMG} is no bare DMG), SEC after a number ("1.5 SEC", "1.5{SEC}", glued to no lone S) and a trigger's colon
 *  ("HIT:", "EVERY 3{SEC}:"). No ban reads a glyph or a colon; every ban stands (tests/faceText.test.ts "U2d step 1"). */
export function banned(text: string): string[] {
  const t = icons(text);
  return BANNED.filter(([re]) => re.test(t)).map(([, why]) => why);
}

/** The numbers a text quotes, in reading order: digits (12, 2.75, 60%) and ONE to FIVE and TWICE as words. */
export function numbers(text: string): number[] {
  const words: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, TWICE: 2 };
  return [...text.matchAll(/(\d+(?:\.\d+)?)|\b(ONE|TWO|THREE|FOUR|FIVE|TWICE)\b/g)].map((m) => (m[1] ? +m[1] : words[m[2]]));
}

/** 0.6.2t2 (F1): a paragraph's sentences (a break after a full stop, before the next sentence's first character). */
export function sentencesOf(text: string): string[] {
  return text ? text.split(/(?<=\.)\s+(?=[A-Z0-9+"'(★])/) : [];
}

/** Words that carry no content of their own (F1's repeat check skips them). */
const STOP = new Set([
  "A", "AN", "THE", "OF", "TO", "IN", "ON", "AT", "FOR", "AND", "OR", "BUT", "NOT", "NO", "IT", "ITS", "IS", "ARE", "BE",
  "BY", "AS", "WITH", "FROM", "INTO", "THAT", "WHICH", "THEY", "THEIR", "THEM", "THIS", "THOSE", "EACH", "EVERY", "ALL",
  "ANY", "YOUR", "YOU", "UP", "SO", "THEN", "THAN", "WHEN", "WHILE", "ALSO", "MORE", "LESS", "ONCE",
]);
/** A text's words: upper case, punctuation dropped (a decimal point kept). */
const wordsOf = (s: string): string[] => s.toUpperCase().replace(/[^A-Z0-9%.']+/g, " ").split(" ").map((w) => w.replace(/^\.+|\.+$/g, "")).filter(Boolean);
/** Its content words, a plural's S dropped (COPIES and COPY stay apart; that's fine for a guard). */
const contentOf = (ws: string[]): string[] => ws.filter((w) => !STOP.has(w) && !/^\d/.test(w)).map((w) => (w.length > 3 && /[^S]S$/.test(w) ? w.slice(0, -1) : w));

/**
 * 0.6.2t2 (F1): true when a flavour sentence repeats an ability sentence: one holds the other word for word, or they share
 * a run of three words (two of them content words), or most (60% or more) of the flavour's content words are in it.
 */
export function repeats(flavour: string, ability: string): boolean {
  const fw = wordsOf(flavour), aw = wordsOf(ability);
  if (!fw.length || !aw.length) return false;
  const f = ` ${fw.join(" ")} `, a = ` ${aw.join(" ")} `;
  if (a.includes(f) || f.includes(a)) return true;
  const run = (ws: string[], i: number) => ws.slice(i, i + 3);
  const runs = new Set(aw.slice(2).map((_, i) => run(aw, i).join(" ")));
  if (fw.slice(2).some((_, i) => contentOf(run(fw, i)).length >= 2 && runs.has(run(fw, i).join(" ")))) return true;
  const fc = contentOf(fw), ac = new Set(contentOf(aw));
  return fc.length > 0 && fc.filter((w) => ac.has(w)).length / fc.length >= 0.6;
}

/** A percentage as the texts round it. */
export const pct = (x: number): number => Math.round(x * 100);
/** At most one decimal (damage), at most two (seconds). */
export const r1 = (x: number): number => +x.toFixed(1);
export const r2 = (x: number): number => +x.toFixed(2);
