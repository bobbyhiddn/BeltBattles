// RETUNE-1 (REQ-BFG-096): HEARTS, behind one switch. The operator: "start with 10 hearts". With HEARTS on:
//  - a run starts with HEARTS_START (10) hearts (Run.lives holds them; a snapshot's `lives` stays "hearts going into the
//    fight");
//  - a lost dusk costs heartCost(day): 1 heart on days 1-3, 2 from day 4 (BUMP-1D: HEART_COSTS [1,2,2]; it was 2 on days 4-6 and 3 from day 7). A draw costs none, and a road
//    (warlord) fight never costs hearts (no road rule moves lives);
//  - LAST CHANCE fires once a run, at the first dusk loss that would leave LAST_CHANCE_AT (1) heart or fewer, on a day
//    before the run's last day (`lastDay`: RUN_DAYS for the game; RUN-1 re-points it). It SETS the hearts to 1, so it
//    adds none when the loss leaves exactly 1. The player picks one of today's three cards (lastChance.ts
//    lastChanceOffer: the cards don't change). Out of hearts otherwise, the run is lost;
//  - no day-3 early-loss refund (day.ts REFUND_DAY; LOSS-1 H1 modelled it off);
//  - PATCH UP (the DOCK) stays: +1 heart, never above HEARTS_START.
// With HEARTS off, everything is as today: 5 lives, a loss costs 1, LAST CHANCE at exactly 1 life gives 1 back, the refund.
//
// THE SWITCH: HEARTS (false), built as NPC-1 built NPC_DAY (npcDay.ts): heartsRules(), setHearts(on) and
// withHearts(fn, on = true), which puts the switch back even on a throw. A run plays on the scale it STARTED on: newRun
// marks a run started with the switch on (Run.hearts = true) and every run rule reads the run's mark (heartsRun), so a
// run saved before the bump that turns HEARTS on finishes on its own 5 lives. A stored record or a match request never
// reads the switch alone: it asks its own rules (rulesGate.ts heartsFor: the switch on AND rules at or after
// HEARTS_RULES). BUMP-1D writes HEARTS_RULES as a literal and turns the switch on.
//
// One rule for the game, the record model, the bots and the benches (heartsDusk), so they can't drift.
// Shared, pure and dependency-light (no DOM), like npcDay.ts.

import { RUN_DAYS, START_LIVES } from "./content";
import { LAST_CHANCE_AT } from "./lastChance";
import { ENDLESS_LIVES } from "./endless"; // ENDLESS-1 (REQ-BFG-059): an endless run's hearts cap (PATCH UP up to 3)

/** THE switch (REQ-BFG-096): on, from HULL-ON's flip (bb-0.10.0). Its setter, withHearts and the off path stay this
 *  release, for older records (rulesGate.ts heartsFor) and the tests that measure the off world. */
export const HEARTS: boolean = true;

let hOn = false;

/** Are hearts in the game now (HEARTS, or a withHearts call)? */
export function heartsRules(): boolean {
  return hOn;
}

/** Turn hearts on or off (no content to swap: every rule reads the switch, or a run's mark, where it acts). */
export function setHearts(on: boolean): void {
  hOn = on;
}

/** Run `fn` with hearts on (or off), then put the switch back as it was, even if `fn` throws (withNpcDay's form). */
export function withHearts<T>(fn: () => T, on = true): T {
  const was = hOn;
  setHearts(on);
  try {
    return fn();
  } finally {
    setHearts(was);
  }
}

setHearts(HEARTS);

/** A run's hearts at the start (the operator's 10). */
export const HEARTS_START = 10;
/** The first day of each cost band: days 1-3, 4-6 and 7 on. Day bands, not run-length bounds. */
export const HEART_COST_FROM: readonly [number, number, number] = [1, 4, 7];
/** The hearts a lost dusk costs in each band (the operator's 1/2/3; 1/2/2 since BUMP-1D). */
export const HEART_COSTS: readonly [number, number, number] = [1, 2, 2]; // BUMP-1D (RULING-BANDS1-R1 B1.1; BANDS-1 H1): days 7+ cost 2, not 3 (was [1, 2, 3])

/** The hearts rule's numbers. The game reads HEARTS_RULE only; a bench may read another (15 start hearts, H3). */
export interface HeartsRule {
  start: number;
  cost: readonly [number, number, number];
}
export const HEARTS_RULE: HeartsRule = { start: HEARTS_START, cost: HEART_COSTS };

/** The hearts a lost dusk on `day` costs: 1 on days 1-3, 2 from day 4 (HEARTS_RULE; before BUMP-1D 2 on days 4-6 and 3 from day 7). */
export function heartCost(day: number, rule: HeartsRule = HEARTS_RULE): number {
  return day >= HEART_COST_FROM[2] ? rule.cost[2] : day >= HEART_COST_FROM[1] ? rule.cost[1] : rule.cost[0];
}

/** LAST CHANCE under hearts: a lost dusk that leaves LAST_CHANCE_AT (1) heart or fewer (`heartsLeft`, after the cost,
 *  never below 0), on a day before the run's last day (`lastDay`, RUN_DAYS), once a run (`used`). */
export function heartsLastChanceFires(day: number, outcome: "win" | "loss" | "draw", heartsLeft: number, used: boolean, lastDay: number = RUN_DAYS): boolean {
  return outcome === "loss" && heartsLeft <= LAST_CHANCE_AT && day < lastDay && !used;
}

/** One dusk on the hearts ledger: the hearts after it, what the loss cost, and whether LAST CHANCE fired (it sets the
 *  hearts to LAST_CHANCE_AT). `hearts` 0 after it: the run is lost. The one step the game (day.ts finishDay), the record
 *  model (records.ts), the bots and the benches all take. */
export function heartsDusk(hearts: number, day: number, outcome: "win" | "loss" | "draw", lcUsed: boolean, opts: { rule?: HeartsRule; lastDay?: number } = {}): { hearts: number; cost: number; lastChance: boolean } {
  if (outcome !== "loss") return { hearts, cost: 0, lastChance: false };
  const cost = heartCost(day, opts.rule);
  const left = Math.max(0, hearts - cost);
  if (heartsLastChanceFires(day, outcome, left, lcUsed, opts.lastDay ?? RUN_DAYS)) return { hearts: LAST_CHANCE_AT, cost, lastChance: true };
  return { hearts: left, cost, lastChance: false };
}

/** Does `run` play on hearts? Its own mark (Run.hearts, set by newRun while HEARTS is on), never the switch: a run keeps
 *  the scale it started on. */
export const heartsRun = (run: { hearts?: boolean }): boolean => run.hearts === true;

/** The lives (hearts) a new run starts with: HEARTS_START with the switch on, else START_LIVES (5). */
export const startLives = (): number => (heartsRules() ? HEARTS_START : START_LIVES);

/** The most lives (hearts) `run` may hold: HEARTS_START on a hearts run, else START_LIVES (PATCH UP's cap, the save's
 *  clamp). */
export const livesCap = (run: { hearts?: boolean; endlessRun?: { end?: unknown } }): number =>
  run.endlessRun !== undefined && run.endlessRun.end === undefined ? ENDLESS_LIVES : heartsRun(run) ? HEARTS_START : START_LIVES; // ENDLESS-1: an endless run plays on ENDLESS_LIVES (3) hearts

/** The hearts a run holds after losing the dusks of days `firstDay` .. `firstDay + losses - 1` (a tooling ghost's
 *  label: its losses first, then its wins), on HEARTS_RULE, LAST CHANCE included. Never below 1 (a snapshot's floor). */
export function heartsAfterLosses(losses: number, firstDay = 1): number {
  let h = HEARTS_START, lc = false;
  for (let i = 0; i < losses; i++) {
    const r = heartsDusk(h, firstDay + i, "loss", lc);
    h = r.hearts;
    lc = lc || r.lastChance;
    if (h <= 0) return 1;
  }
  return Math.max(1, h);
}
