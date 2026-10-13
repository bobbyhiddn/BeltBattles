// JOINS-1 (REQ-BFG-091, which replaces REQ-BFG-090): FREE JOINS, behind one switch. The operator: "I never asked for
// joined factories to slow down" and, of the 2-joins limit, "Players should be able to play what they purchase in
// whatever combo they want." So both 0.6.2 TUNE-M join rules go:
//  - RULE JOIN PACE (content.ts JOIN_PACE 0.7): a factory with a joining belt made its loads at 70% of its rate. With the
//    switch on every factory makes its loads at its normal rate: the battle (Battle.makeSide's pace), the rating and every
//    walk or timeline (deck.ts factoryPace, loadEvery, cycleEvery) and the build screen agree, and the JOINED pace line
//    is gone (no line at all, not a 100% line).
//  - RULE JOIN LIMIT (content.ts JOIN_LIMIT 2, "2 JOINS PER DECK"): with the switch on a deck holds any number of legal
//    joins: deck.ts joinProblem and newJoinProblem never return JOIN_OVER_LIMIT, pruneJoins never trims a legal join for
//    the count (it still clears illegal and stale joins, J8), the save loader keeps them, the par player plans joins with
//    no limit, and validateBuild (the client's and the server's upload check) accepts them.
// What stays: the 0.6.2j legality rules (CAN'T JOIN ITSELF, WOULD LOOP, NOT A BELT TILE, NOT NEXT TO ITS JOIN TILE, JOIN
// TILE OFF THE DECK, NO BELT TO JOIN FROM) and right of way at the join tile (REQ-BFG-027: congestion, not a penalty).
//
// THE SWITCH: FREE_JOINS (false), built as NPC-1 built NPC_DAY and HULL-1a HULL_SCALE (npcDay.ts, hullScale.ts):
// freeJoinsRules(), setFreeJoins(on) and withFreeJoins(fn, on = true), which puts the switch back even on a throw. Every
// rule reads the switch where it acts (deck.ts joinProblem, overJoinLimit, factoryPace; battle.ts makeSide; the par
// player; the build screen's words). A stored record or an upload never reads the global switch: it asks its own rules
// through the gate (src/net/rulesGate.ts freeJoinsFor: the switch on AND rules at or after FREE_JOINS_RULES) and runs
// its check or its battle under that answer (withFreeJoins): validateUpload, the bundled pool loader, the replay of a
// battle record. With the switch off nothing reads past it: bb-0.9.7 plays byte for byte (fp IDENTICAL 84a4237e112058df,
// parBench 8cde5ed0; the three switches on: 2deb3cf3). The rules bump that turns FREE_JOINS on writes FREE_JOINS_RULES
// as a literal (rulesGate.ts).
//
// Shared, pure and dependency-light (no DOM), like npcDay.ts: the client, the server and the tests read the same switch.

import { JOIN_PACE } from "./content";

/** THE switch (REQ-BFG-091): on, from HULL-ON's flip (bb-0.10.0). Its setter, withFreeJoins and the off path stay this
 *  release, for older records (rulesGate.ts freeJoinsFor) and the tests that measure the off world. */
export const FREE_JOINS: boolean = true;

let fjOn = false;

/** Are free joins in the game now (FREE_JOINS, or a withFreeJoins call)? */
export function freeJoinsRules(): boolean {
  return fjOn;
}

/** Turn free joins on or off (no content to swap: every rule reads the switch where it acts). */
export function setFreeJoins(on: boolean): void {
  fjOn = on;
}

/** Run `fn` with free joins on (or off), then put the switch back as it was, even if `fn` throws (withNpcDay's form). */
export function withFreeJoins<T>(fn: () => T, on = true): T {
  const was = fjOn;
  setFreeJoins(on);
  try {
    return fn();
  } finally {
    setFreeJoins(was);
  }
}

/** The pace a factory with a joining belt makes its loads at: content.ts JOIN_PACE with the switch off (0.6.2 TUNE-M,
 *  RULE JOIN PACE, exactly as before), its normal rate (1) with it on. */
export function joinedPace(): number {
  return fjOn ? 1 : JOIN_PACE;
}

setFreeJoins(FREE_JOINS);
