// 0.7.0a M4 (REQ-BFG-016; decision D6): replays of the run's stored dusk records, read-only. A record is
// battleRecordFor(your deck, the foe's, battleSeed) as the dusk stored it (online play; DayResult.record). It replays
// through replayBattle (src/net/replay.ts), which refuses a record made under other rules: the summary then says
// REPLAY_OTHER_RULES. A replay changes no run state: it plays a fresh Battle and never touches the run.

import type { Battle, BattleRecord } from "../sim/battle";
import { replayBattle, RulesMismatchError } from "../net/replay";

/** D6: what the summary says for a record made under other rules. */
export const REPLAY_OTHER_RULES = "REPLAY UNAVAILABLE (OTHER RULES)";
/** A record that doesn't load at all (a damaged save). */
export const REPLAY_BROKEN = "REPLAY UNAVAILABLE";

export type OpenReplay = { ok: true; battle: Battle } | { ok: false; why: string };

/** A fresh, unstepped Battle for a stored dusk record, or why it can't be replayed. Never throws. */
export function openReplay(record: BattleRecord | undefined): OpenReplay {
  if (!record) return { ok: false, why: REPLAY_BROKEN };
  try {
    return { ok: true, battle: replayBattle(record) };
  } catch (e) {
    return { ok: false, why: e instanceof RulesMismatchError ? REPLAY_OTHER_RULES : REPLAY_BROKEN };
  }
}
