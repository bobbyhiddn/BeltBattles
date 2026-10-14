// RETUNE-1 run 2 (REQ-BFG-096), cap's ruling: the upload guard. "A run without the hearts mark, under rules where
// heartsFor is true, neither uploads its snapshot (online.ts) nor saves its ghost (ghosts.ts saveGhost). Its match
// requests stay as they are." A run saved before the rules bump that turns HEARTS on has no mark and finishes on its own
// 5 lives (hearts.ts heartsRun); its snapshots would carry 5-scale lives under hearts rules, and some are hearts-reachable,
// so they'd be stored as weak hearts records. With HEARTS off heartsFor is false, so every run uploads and saves as today.
// A small module of its own (src/game: it reads the run's mark and the snapshot's rules; src/net stays free of src/game).

import { RULES_VERSION } from "../sim/content";
import { heartsRun } from "../sim/hearts";
import { heartsFor } from "../net/rulesGate";
import { saveGhost, type GhostSnapshot } from "./ghosts";

/** May `run`'s dusk snapshot under `rules` (its snapshot's; default this build's) go up (online.ts submitDusk) or into the
 *  local pool (saveRunGhost)? Yes on a hearts run (its mark) and under rules without hearts (heartsFor false: HEARTS off,
 *  or older rules); no for a run without the mark under rules with hearts. */
export function ghostAllowed(run: { hearts?: boolean }, rules: unknown = RULES_VERSION): boolean {
  return heartsRun(run) || !heartsFor(rules);
}

/** The dusk's own snapshot into the local pool (battle.ts), unless ghostAllowed refuses it. True when it was saved. */
export function saveRunGhost(run: { hearts?: boolean }, g: GhostSnapshot, s?: Parameters<typeof saveGhost>[1]): boolean {
  if (!ghostAllowed(run, g.rules)) return false;
  saveGhost(g, s);
  return true;
}
