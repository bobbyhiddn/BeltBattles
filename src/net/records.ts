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

import { START_LIVES } from "../sim/content";
import { REFUND_DAY, REFUND_LIVES } from "../game/day";

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
}

/**
 * Every (wins, lives) a player can carry into day `day`'s dusk, sorted by wins, then lives. `draws` and `patchUp`
 * (both on by default) let the model drop a draw or the DOCK, for tests and for labels a run reaches without them.
 */
export function reachableRecords(day: number, opts: { draws?: boolean; patchUp?: boolean; dockDay?: number } = {}): DuskRecord[] {
  // dockDay (tests): PATCH UP only on that day's road, as a run whose DOCK comes that day (absent: any day)
  const draws = opts.draws ?? true, patchUp = opts.patchUp ?? true, dockDay = opts.dockDay;
  let states: State[] = [{ w: 0, l: START_LIVES, early: false, dock: false }];
  for (let d = 1; d < day; d++) {
    const next = new Map<string, State>();
    const add = (s: State) => next.set(`${s.w}|${s.l}|${s.early}|${s.dock}`, s);
    for (const s of states) {
      const outs: State[] = [{ ...s, w: s.w + 1 }]; // a win
      if (draws) outs.push({ ...s }); // a draw
      if (s.l > 1) outs.push({ ...s, l: s.l - 1, early: s.early || d < REFUND_DAY }); // a loss (the last life ends the run)
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
  for (const s of states) seen.set(`${s.w}|${s.l}`, { wins: s.w, lives: s.l });
  return [...seen.values()].sort((a, b) => a.wins - b.wins || a.lives - b.lives);
}

/** Can a player carry (wins, lives) into day `day`'s dusk? */
export function isReachable(day: number, wins: number, lives: number, opts: { draws?: boolean; patchUp?: boolean } = {}): boolean {
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
