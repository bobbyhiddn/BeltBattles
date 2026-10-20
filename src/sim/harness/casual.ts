// LOSS-1 (REQ-BFG-092): the casual player, a wrapper on the par player (player.ts playerRun) with a casual knob set, and
// the record-following opponent rule the LOSS-1 report proposes. Opt-in: no bench, test or tool but tools/loss1.ts
// imports this file, and nothing here changes the par player's policies, so every pinned number (the sim fingerprint,
// parBench's fingerprint) holds.
//
// The casual player plays the same real run as par (the game's caravan, its prices, its merges through gainModule), with
// the knobs a casual human differs in (BRIEF-LOSS1 section 4), calibrated in output-loss1/REPORT.md section 4 against the
// operator's uploaded decks (their win rate against par, by day):
//  - no rerolls: it buys from the dawn caravan only (rerolls 0, stuck 0);
//  - misjudges offers more and buys on a whim more often (noise, whim, impulse);
//  - simple placement: a rig on a random free side of a belt tile with its first arrow on it (aim "first", no aimTop
//    search), never re-drawing belts to the best length (grow false) or into free capacity (room false);
//  - leaves gold unspent (a lower floor and a larger reserve) and never swaps fitted gear for an upgrade;
//  - a new factory's belt takes some random slack (line "random").
// CASUAL_TUNES holds the knob sets the calibration compared; CASUAL_TUNE is the one the report picked.
//
// The record-following rule (recordPick): a dusk pick that follows the requester's record. A requester with more losses
// than wins (dusks fought: day - 1; losses: day - 1 - wins, draws counted as losses, the rare case) draws only from the
// weaker share of the eligible ghosts, graded by vsPar (a ghost's win rate against the day's par fields); the usual
// nearest-record rank then picks inside that share. A record at or above even plays as today (pickGhost).

import { Rng } from "../../core/rng";
import type { HeroId } from "../content";
import { eligible, pickGhost, type IntRng, type MatchRequest } from "../../net/matchmaking";
import type { PoolEntry } from "../../net/snapshot";
import { playerRun, type PlayerDay, type PlayerOpts, type PolicyKnobs } from "./player";
import { enchantRules } from "../enchant"; // ENCHANT-1 (REQ-BFG-085, E8)
import { CASUAL_WORD_RATE } from "./enchantBot";

/** The casual knob sets the calibration compared (overrides on the typical policy). */
export const CASUAL_TUNES: Readonly<Record<string, Partial<PolicyKnobs>>> = {
  // no rerolls, simple placement, and the operator's belt habit: the starting belts as drawn (a FURNACE kiln belt never
  // lengthened on day 1, belt 0; no redraw to the best length or into free capacity): the smallest step from par
  c1: { rerolls: 0, stuck: 0, aim: "first", aimTop: 0, grow: false, room: false, belt: 0 },
  // c1 + more misjudging and whims, some gold left unspent (his BASTION decks: 77-94% of the day's gold), no gear upgrades
  c2: { rerolls: 0, stuck: 0, aim: "first", aimTop: 0, grow: false, room: false, belt: 0, noise: 1, whim: 0.5, impulse: 0.15, floor: 0.8, reserve: 4, upgrade: false },
  // c2, further: buys anything it can take a third of the time, judges far worse, fills with harmful parts too
  c3: { rerolls: 0, stuck: 0, aim: "first", aimTop: 0, grow: false, room: false, belt: 0, noise: 1.5, whim: 0.8, impulse: 0.35, floor: 0.75, reserve: 4, upgrade: false, fillFloor: -0.3, mergeFloor: -0.1 },
  // c3 + an impulse buyer: 70% of picks are any part the deck can take, helpful or not
  c4: { rerolls: 0, stuck: 0, aim: "first", aimTop: 0, grow: false, room: false, belt: 0, noise: 2, whim: 1, impulse: 0.7, floor: 0.75, reserve: 4, upgrade: false, fillFloor: -0.3, mergeFloor: -0.1 },
  // every pick an impulse (the shop's offers taken as they come, merges still first)
  c5: { rerolls: 0, stuck: 0, aim: "first", aimTop: 0, grow: false, room: false, belt: 0, noise: 2, whim: 1, impulse: 1, floor: 0.75, reserve: 4, upgrade: false, fillFloor: -0.3, mergeFloor: -0.1 },
};

/** The knob set the report's calibration picked (output-loss1/REPORT.md section 4). */
export const CASUAL_TUNE = "c5";

/** The casual player's options: the typical policy with a casual knob set (a name in CASUAL_TUNES, or knobs). */
export function casualOpts(tune: string | Partial<PolicyKnobs> = CASUAL_TUNE, more: PlayerOpts = {}): PlayerOpts {
  const knobs = typeof tune === "string" ? CASUAL_TUNES[tune] : tune;
  if (!knobs) throw new Error(`casual: no knob set ${String(tune)} (have ${Object.keys(CASUAL_TUNES).join(", ")})`);
  // ENCHANT-1 (REQ-BFG-085, E8): with ENCHANT on the casual player buys the ENCHANTER's words by its own rule (enchantBot.ts casualWordBuys:
  // each affordable offer with chance CASUAL_WORD_RATE, on a seeded legal piece that holds no word; no rating read) and answers a warlord
  // pick the same way (casualWarlordPick). Off: no such knob, the options exactly as before.
  return { ...more, policy: "typical", tune: { ...knobs, ...(enchantRules() ? { wordBuy: CASUAL_WORD_RATE } : {}), ...(more.tune ?? {}) } };
}

/** The casual player's run (days 1..days), as playerRun plays par's. */
export function casualRun(hero: HeroId, days: number, seed: number, tune: string | Partial<PolicyKnobs> = CASUAL_TUNE, more: PlayerOpts = {}): PlayerDay[] {
  return playerRun(hero, days, seed, casualOpts(tune, more));
}

/** The record rule's grades: a ghost id's vsPar (0-1). A ghost with no grade counts as the strongest. */
export type Grades = ReadonlyMap<string, number>;

/** Losses so far on a dusk record: dusks fought (day - 1) minus wins (draws, rare, count as losses). */
export const lossesOf = (req: Pick<MatchRequest, "day" | "wins">): number => Math.max(0, req.day - 1 - req.wins);

/** The share of the eligible ghosts a record may draw from: 1 at or above even; `losing` (default 0.5) when losses
 *  exceed wins; `deep` (default 1/3) when losses exceed wins by `deepAt` or more (default 2). */
export interface RecordRule { losing: number; deep: number; deepAt: number }
export const RECORD_RULE: Readonly<RecordRule> = { losing: 0.5, deep: 1 / 3, deepAt: 2 };

export function recordShare(req: Pick<MatchRequest, "day" | "wins">, rule: RecordRule = RECORD_RULE): number {
  const gap = lossesOf(req) - req.wins;
  return gap >= rule.deepAt ? rule.deep : gap > 0 ? rule.losing : 1;
}

/**
 * The record-following pick: the eligible ghosts (matchmaking.ts eligible: D1 and the rest), cut to the weakest
 * ceil(share x n) by grade when the record is losing (recordShare), then pickGhost's nearest-record rank inside them.
 * At or above even it is pickGhost exactly. Returns null when nothing is eligible.
 */
export function recordPick(pool: readonly PoolEntry[], req: MatchRequest, grades: Grades, rng: IntRng, rule: RecordRule = RECORD_RULE): PoolEntry | null {
  const share = recordShare(req, rule);
  if (share >= 1) return pickGhost(pool, req, rng);
  const ok = eligible(pool, req);
  if (!ok.length) return null;
  const g = (e: PoolEntry) => grades.get(e.id) ?? 1;
  const ranked = ok.slice().sort((a, b) => g(a) - g(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const weak = ranked.slice(0, Math.max(1, Math.ceil(share * ranked.length)));
  return pickGhost(weak, req, rng);
}

/** A fresh IntRng for a pick (the harness's own seeded stream). */
export const pickRng = (seed: number): IntRng => new Rng(seed);
