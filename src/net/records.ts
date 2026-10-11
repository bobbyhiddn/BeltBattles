// 0.7.0a D5 (REQ-BFG-016): the records a player can carry into a dusk under 0.6.2's run rules, which bb-0.8.0 and bb-0.8.3
// keep unchanged (0.8.0 H2's life audit; BELTS moves no life rule), so a seed ghost's label (wins, lives) is one a real
// run reaches, and the seed pool can be checked to cover every such state under the record rule (D1, matchmaking.ts).
// The rules, as
// ref/S1-REPORT-sc026.md section 1 reads them off the run code:
//  - START_LIVES (5) at the start; a dusk loss costs one life and 0 lives ends the run; a win or a draw costs none;
//  - the early-loss refund (day.ts): REFUND_LIVES back at the dawn of REFUND_DAY after a loss on an earlier day,
//    once a run, never above START_LIVES;
//  - the DOCK's PATCH UP (eventDefs.ts): +PATCH_UP_LIVES on the road, never above START_LIVES; the DOCK comes once
//    a run (the first event bag holds each event once), so at most once; on day 1 it is blocked (5 lives);
//  - warlords never move lives.
// Pure and small; tests/seed.records.test.ts checks it against the run code (startDusk/finishDay, the DOCK).
// 0.8.0 H2 (REQ-BFG-009, backlog 325): POST /v1/ghosts refuses (422) an upload whose record isReachable refuses, as the
// seed and ghosts:admin revalidate already do; tests/h2.playthrough.test.ts checks real runs only carry records it takes.
// Two old saves can carry a record it refuses, and refusing their uploads is intended (the client is silent on a 422 and
// the run plays on; widening the model would let a low record make a ghost eligible for more matches):
//  - a run migrated from a version-4 (0.5.0) save: save.ts v4to5 adds 2 lives, e.g. day 3 with 0 wins and 3 lives;
//  - a run saved by a page older than 0.6.2 TUNE-M (ab0ee25, before the early-loss refund; save v7 since 0.6.1a, v6
//    migrates in place) that passed dawn 3 after an early loss without the refund: d3 0W 3L and 1W 4L, d4 0W 2L and
//    1W 3L, d5 0W 1L and 1W 2L, d6 1W 1L (the Prime's decision, oracle 9c95e37aab0a70fb).

import { RUN_DAYS, START_LIVES } from "../sim/content";
import { REFUND_DAY, REFUND_LIVES } from "../game/day";
// LC-1 (REQ-BFG-073): LAST CHANCE, a fourth rule that moves lives: a dusk loss that leaves LAST_CHANCE_AT (1) life on a
// day before RUN_DAYS gives LAST_CHANCE_LIVES back at once, once a run. It is not a choice: such a loss always fires it, so
// no run carries 1 life past a loss before it has had its LAST CHANCE. Z-BUMP (release Z): the switch is gone and the rule
// is modelled, except for a record whose rules (opts.rules) predate it: the rules gate (rulesGate.ts lastChanceGateProblem,
// LAST_CHANCE_RULES) reads such a record by its own rules, with no LAST CHANCE (the model before the flip).
import { LAST_CHANCE_AT, LAST_CHANCE_LIVES } from "../sim/lastChance";
import { lastChanceGateProblem } from "./rulesGate";
// RETUNE-1 (REQ-BFG-096): the hearts model for records whose rules pass heartsFor (heartsRecords below)
import { RULES_VERSION } from "../sim/content";
import { HEARTS_START, heartsDusk } from "../sim/hearts";
import { heartsFor } from "./rulesGate";

/** The DOCK's PATCH UP: the one road choice that moves lives (tests check it against the event definitions). */
export const PATCH_UP_LIVES = 1;

export interface DuskRecord {
  wins: number; // wins going into the dusk
  lives: number; // lives going into the dusk
}

interface State {
  w: number;
  l: number;
  early: boolean; // a life lost at dusk before REFUND_DAY
  dock: boolean; // PATCH UP already bought
  lc: number; // LC-1: the day LAST CHANCE fired (0: not yet; always 0 under rules without it)
}

/** LC-1 (REQ-BFG-073): `lastChance` in the options: the day the run's LAST CHANCE fired (a snapshot's lastChance.day), or
 *  null for a run that never had one; absent: either (every path). Read only under rules with LAST CHANCE. */
export type LastChanceDay = number | null;

/** Z-BUMP (REQ-BFG-073): does a record under `rules` follow LAST CHANCE? Absent: this build's rules (yes). A rules version
 *  before LAST_CHANCE_RULES (or one that can't be read) asks the rules gate and is read without it, as before the flip. */
export const recordHasLastChance = (rules?: unknown): boolean => rules === undefined || lastChanceGateProblem(rules) === null;

/**
 * Every (wins, lives) a player can carry into day `day`'s dusk, sorted by wins, then lives. `draws` and `patchUp`
 * (both on by default) let the model drop a draw or the DOCK, for tests and for labels a run reaches without them.
 * Z-BUMP: `rules`, the record's rules version (a stored snapshot's): LAST CHANCE is modelled only under rules that have it
 * (recordHasLastChance); absent: this build's rules.
 */
export function reachableRecords(day: number, opts: { draws?: boolean; patchUp?: boolean; dockDay?: number; lastChance?: LastChanceDay; rules?: unknown } = {}): DuskRecord[] {
  // RETUNE-1 (REQ-BFG-096): a record whose rules pass heartsFor (absent: this build's) reads on the hearts model
  if (heartsFor(opts.rules === undefined ? RULES_VERSION : opts.rules)) return heartsRecords(day, opts);
  // dockDay (tests): PATCH UP only on that day's road, as a run whose DOCK comes that day (absent: any day)
  const draws = opts.draws ?? true, patchUp = opts.patchUp ?? true, dockDay = opts.dockDay;
  const lcOn = recordHasLastChance(opts.rules); // Z-BUMP: under older rules no state fires it (lc stays 0): today's records before the flip
  let states: State[] = [{ w: 0, l: START_LIVES, early: false, dock: false, lc: 0 }];
  for (let d = 1; d < day; d++) {
    const next = new Map<string, State>();
    const add = (s: State) => next.set(`${s.w}|${s.l}|${s.early}|${s.dock}|${s.lc}`, s);
    for (const s of states) {
      const outs: State[] = [{ ...s, w: s.w + 1 }]; // a win
      if (draws) outs.push({ ...s }); // a draw
      // a loss (the last life ends the run); LC-1: one that leaves LAST_CHANCE_AT life before RUN_DAYS fires LAST CHANCE
      // (once a run): the life comes back at once
      if (s.l > 1) {
        const left = s.l - 1, early = s.early || d < REFUND_DAY;
        if (lcOn && !s.lc && left === LAST_CHANCE_AT && d < RUN_DAYS) outs.push({ ...s, l: left + LAST_CHANCE_LIVES, early, lc: d });
        else outs.push({ ...s, l: left, early });
      }
      for (const o of outs) {
        // the dawn of day d + 1: the early-loss refund
        const dawn = d + 1 === REFUND_DAY && o.early ? { ...o, l: Math.min(START_LIVES, o.l + REFUND_LIVES) } : o;
        add(dawn);
        // the road of day d + 1: PATCH UP, once a run, never above START_LIVES
        const dockToday = dockDay === undefined || dockDay === d + 1;
        if (patchUp && dockToday && !dawn.dock && dawn.l + PATCH_UP_LIVES <= START_LIVES) add({ ...dawn, l: dawn.l + PATCH_UP_LIVES, dock: true });
      }
    }
    states = [...next.values()];
  }
  const seen = new Map<string, DuskRecord>();
  // LC-1: under rules with LAST CHANCE and `lastChance` given, only the runs whose LAST CHANCE fired that day (null: never)
  const fired = opts.lastChance === undefined || !lcOn ? states : states.filter((s) => s.lc === (opts.lastChance ?? 0));
  for (const s of fired) seen.set(`${s.w}|${s.l}`, { wins: s.w, lives: s.l });
  return [...seen.values()].sort((a, b) => a.wins - b.wins || a.lives - b.lives);
}

/**
 * RETUNE-1 (REQ-BFG-096): the hearts model, for records whose rules pass heartsFor (rulesGate.ts): HEARTS_START (10) at
 * the start; a dusk loss costs heartCost(day) (1/2/3), a win or a draw none; LAST CHANCE once a run at the first loss that
 * leaves 1 heart or fewer before RUN_DAYS, which sets the hearts to 1 (hearts.ts heartsDusk, the game's own step); out of
 * hearts otherwise ends the run; no early-loss refund; PATCH UP +1 on the road, once a run, never above HEARTS_START.
 * Same options and output as reachableRecords (lives = hearts going into the dusk).
 */
function heartsRecords(day: number, opts: { draws?: boolean; patchUp?: boolean; dockDay?: number; lastChance?: LastChanceDay; rules?: unknown }): DuskRecord[] {
  const draws = opts.draws ?? true, patchUp = opts.patchUp ?? true, dockDay = opts.dockDay;
  const lcOn = recordHasLastChance(opts.rules);
  let states: State[] = [{ w: 0, l: HEARTS_START, early: false, dock: false, lc: 0 }];
  for (let d = 1; d < day; d++) {
    const next = new Map<string, State>();
    const add = (s: State) => next.set(`${s.w}|${s.l}|${s.dock}|${s.lc}`, s);
    for (const s of states) {
      const outs: State[] = [{ ...s, w: s.w + 1 }]; // a win
      if (draws) outs.push({ ...s }); // a draw costs no heart
      // a loss: heartCost(d); LAST CHANCE (once, before RUN_DAYS) sets the hearts to 1; 0 hearts ends the run
      const r = heartsDusk(s.l, d, "loss", !lcOn || s.lc > 0);
      if (r.hearts > 0) outs.push({ ...s, l: r.hearts, lc: r.lastChance ? d : s.lc });
      for (const o of outs) {
        add(o); // no refund at any dawn
        // the road of day d + 1: PATCH UP, once a run, never above HEARTS_START
        const dockToday = dockDay === undefined || dockDay === d + 1;
        if (patchUp && dockToday && !o.dock && o.l + PATCH_UP_LIVES <= HEARTS_START) add({ ...o, l: o.l + PATCH_UP_LIVES, dock: true });
      }
    }
    states = [...next.values()];
  }
  const seen = new Map<string, DuskRecord>();
  const fired = opts.lastChance === undefined || !lcOn ? states : states.filter((s) => s.lc === (opts.lastChance ?? 0));
  for (const s of fired) seen.set(`${s.w}|${s.l}`, { wins: s.w, lives: s.l });
  return [...seen.values()].sort((a, b) => a.wins - b.wins || a.lives - b.lives);
}

/** Can a player carry (wins, lives) into day `day`'s dusk? (Z-BUMP: `rules`, the record's rules, as reachableRecords.) */
export function isReachable(day: number, wins: number, lives: number, opts: { draws?: boolean; patchUp?: boolean; lastChance?: LastChanceDay; rules?: unknown } = {}): boolean {
  return reachableRecords(day, opts).some((r) => r.wins === wins && r.lives === lives);
}

/**
 * The weakest record at day `day`'s dusk: no wins and the fewest lives a run can have there. Under the record rule a
 * ghost with this record is eligible for every reachable request of that day (fewer wins, or none and no more lives).
 */
export function floorRecord(day: number): DuskRecord {
  const zero = reachableRecords(day).filter((r) => r.wins === 0);
  return zero.reduce((a, b) => (b.lives < a.lives ? b : a));
}
