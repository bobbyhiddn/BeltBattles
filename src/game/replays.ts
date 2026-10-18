// 0.7.0a M4 (REQ-BFG-016; decision D6): replays of the run's stored dusk records, read-only. A record is
// battleRecordFor(your deck, the foe's, battleSeed) as the dusk stored it (online play; DayResult.record). It replays
// through replayBattle (src/net/replay.ts), which refuses a record made under other rules: the summary then says
// REPLAY_OTHER_RULES. A replay changes no run state: it plays a fresh Battle and never touches the run.

import type { Battle, BattleRecord } from "../sim/battle";
import type { DayResult } from "./run";
import { replayBattle, RulesMismatchError } from "../net/replay";

/** D6: what the summary says for a record made under other rules. */
export const REPLAY_OTHER_RULES = "REPLAY UNAVAILABLE (OTHER RULES)";
/** A record that doesn't load at all (a damaged save). */
export const REPLAY_BROKEN = "REPLAY UNAVAILABLE";

export type OpenReplay = { ok: true; battle: Battle } | { ok: false; why: string };

/** RUNES-087F (REQ-BFG-058, cap's Q5): what the run's own record says about a stored dusk: its day, the wins the player
 *  carried into it (the player's snapshot that day: run.wins then, the wins before it in the history) and whether the
 *  foe was a ghost (a stand-in fights with 0 wins). */
export interface ReplayAt {
  day: number;
  wins: number;
  ghost: boolean;
}

/** The run's record at history[i]'s dusk (ReplayAt). */
export function replayAt(history: readonly Pick<DayResult, "day" | "outcome" | "ghost" | "endless">[], i: number): ReplayAt {
  // ENDLESS-1: an endless dusk's win is not the run's (its wins stay WIN_GOAL, endless wins count apart), so the wins the player
  // carried into any dusk are the run's own dusk wins before it
  return { day: history[i].day, wins: history.slice(0, i).filter((d) => d.outcome === "win" && !d.endless).length, ghost: history[i].ghost };
}

/** A fresh, unstepped Battle for a stored dusk record, or why it can't be replayed. Never throws. RUNES-087F: with `at`,
 *  the record's WARLORD'S DUE wins (kept only when a side holds it) must be the run's own record: the player's exactly
 *  `at.wins`, the foe's within its snapshot's bound (0..day - 1), and 0 for a stand-in. */
export function openReplay(record: BattleRecord | undefined, at?: ReplayAt): OpenReplay {
  if (!record) return { ok: false, why: REPLAY_BROKEN };
  try {
    const battle = replayBattle(record);
    const w = record.wins;
    if (w && at && (w[0] !== at.wins || w[1] > at.day - 1 || (!at.ghost && w[1] !== 0))) return { ok: false, why: REPLAY_BROKEN };
    return { ok: true, battle };
  } catch (e) {
    return { ok: false, why: e instanceof RulesMismatchError ? REPLAY_OTHER_RULES : REPLAY_BROKEN };
  }
}
