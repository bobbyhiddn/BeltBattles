// 0.6.2t (REQ-BFG-032): shared helpers for the ability-text tests (not a test file itself): the buyable module table,
// T2's banned-shorthand list, and the number reader the audits use.
import { ITEMS, buyableModules, type ItemDef } from "../src/sim/content";
import { fusible } from "../src/sim/stars";

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

/** The T2 violations in a text ([] when clean). */
export function banned(text: string): string[] {
  return BANNED.filter(([re]) => re.test(text)).map(([, why]) => why);
}

/** The numbers a text quotes, in reading order: digits (12, 2.75, 60%) and ONE to FIVE and TWICE as words. */
export function numbers(text: string): number[] {
  const words: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, TWICE: 2 };
  return [...text.matchAll(/(\d+(?:\.\d+)?)|\b(ONE|TWO|THREE|FOUR|FIVE|TWICE)\b/g)].map((m) => (m[1] ? +m[1] : words[m[2]]));
}

/** A percentage as the texts round it. */
export const pct = (x: number): number => Math.round(x * 100);
/** At most one decimal (damage), at most two (seconds). */
export const r1 = (x: number): number => +x.toFixed(1);
export const r2 = (x: number): number => +x.toFixed(2);
/** A speed or rate multiplier above 1 as the texts quote it: "60% FASTER" below 2 (60), else "2.3 TIMES AS FAST" (2.3). */
export const fasterNum = (r: number): number => (r >= 2 - 1e-9 ? r1(r) : Math.round((r - 1) * 100));
/** A fire interval multiplier as the rate the texts quote: x0.75 fires 33% faster. */
export const rateNum = (intervalMul: number): number => fasterNum(1 / intervalMul);
