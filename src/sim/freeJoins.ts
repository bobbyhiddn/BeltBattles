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
//
// HULL-ON run 5, H4's hero pass (REQ-BFG-091, REQ-BFG-092; cap's ruling 84ad10254e1855c8, RULING-HULLON-R9, and ruling
// 19139b4c41a1636f, R7 section 3): WEAVER's hull 1700 -> 1500 behind FREE_JOINS. Free joins are WEAVER's cause: its cross
// win on the heroes read (OPEN-1's balance method: 48 seeds, field-k 6, days 3-10, every switch on) is 68.1 with the switch
// on (days 6 and 8-10 over 68) and 50.8 with it off. The THREAD SLUG's base can't hold day 10 at any value read (22: d10
// 69.7); the hull does, and 1500 is the highest 50-step under 1700 that lands the band (1550: d10 69.8; 1500: mean 61.0,
// every day 51.1-66.9; FURNACE 61.2, FOUNDRY 60.1, BASTION 44.2 beside it). The one content number this switch swaps
// (FREE_JOINS_HULL), on guard.ts's RUNE_BASE pattern: setFreeJoins puts it into HEROES.weaver.hull while the switch is on
// and the captured base (content.ts's 1700) back when it is off; withFreeJoins leaves the state it found. content.ts imports
// nothing that loads this file, so HEROES is whole when this module's load-time setFreeJoins(FREE_JOINS) runs, and every
// reader takes HEROES[h].hull at call time (battle.ts makeSide, deckRating, the UI, validate's hull floor under
// withFreeJoins(freeJoinsFor(rules))), so an older record still reads 1700 under its own rules.
//
// HULL-ON run 6, H4's captain pass (REQ-BFG-092; cap's ruling b1053c5415e8c7dc, RULING-HULLON-R12 section 3 item 4, RULING-HULLON-R13 ed10dd26da1a89fb):
// the captains' plan numbers behind FREE_JOINS (FREE_JOINS_PLANS: counts only, ARMOR PACKs and PvE plates, for REPORT-JOINS1
// section 4.6's list). rivalBuilds.ts imports this file (rivalBuilds.ts -> deck.ts -> here), so it hands PLANS over as its
// last statement (freeJoinsPlans, guard.ts guardRunes' form) and setFreeJoins swaps the listed numbers on the very plan
// objects; the off world reads each plan's own numbers, so the hull-only and off worlds keep their pins.

import { HEROES, JOIN_PACE, type HeroId } from "./content";

/** THE switch (REQ-BFG-091): on, from HULL-ON's flip (bb-0.10.0). Its setter, withFreeJoins and the off path stay this
 *  release, for older records (rulesGate.ts freeJoinsFor) and the tests that measure the off world. */
export const FREE_JOINS: boolean = true;

/** HULL-ON run 5 (cap's ruling 84ad10254e1855c8): the hero hulls with FREE_JOINS on: WEAVER's only (content.ts: 1700). */
export const FREE_JOINS_HULL: Readonly<Partial<Record<HeroId, number>>> = { weaver: 1500 };

let fjOn = false;
/** The base hulls (content.ts's own numbers), captured at the first swap, so off puts back exactly content.ts's number. */
const HULL_BASE = new Map<HeroId, number>();

/** HULL-ON run 6, H4's captain pass (REQ-BFG-092; cap's ruling b1053c5415e8c7dc = RULING-HULLON-R12 section 3 item 4,
 *  RULING-HULLON-R13 ed10dd26da1a89fb): the captains' plan numbers with FREE_JOINS on, for REPORT-JOINS1 section 4.6's list (E < M < H, no Hard
 *  captain over 80, the named stand-ins under it). Each key is a path into rivalBuilds.ts PLANS (the captain, then the
 *  plan's own keys and list indexes), each value the number it holds while the switch is on; the plan keeps its own (the
 *  base) while it is off. Only the changed numbers, all counts (ARMOR PACKs, PvE plates; J5's measure on the WEAVER tree,
 *  parBench --rivals against the four par fields, K 24):
 *  - THANE KARSK: one PvE plate on day 3 (none before; the par field's pack count 1): day 3's order, his warlord 51.3 ->
 *    62.4, the Hard pool 26.2 -> 27.8 against Medium's 27.3. His day-9 road plates 2 -> 1: his warlord 81.3 -> 77.3. His
 *    dusk deck's day-8 packs 2 -> 1 and day-9 pack 1 -> 0: his stand-in 84.6 / 81.6 -> 76.0 / 74.1 on days 9-10.
 *  - THISTLEMAIL (a dusk stand-in only): her day-8 packs 3 -> 1 and day-10 packs 2 -> 1: 84.6 / 83.3 / 83.3 -> 78.1 /
 *    77.2 / 79.7 on days 8-10. */
export const FREE_JOINS_PLANS: Readonly<Record<string, number>> = {
  "karsk.pve.3": 1, // none
  "karsk.pveRoad.9": 1, // 2
  "karsk.road.6.plating": 1, // { ...P(8, 2), dusk: true }: 2
  "karsk.road.10.plating": 0, // { ...P(9), dusk: true }: 1
  "thistlemail.upgrades.12.plating": 1, // P(8, 3): 3
  "thistlemail.upgrades.14.plating": 1, // P(10, 2): 2
};

/** The plans rivalBuilds.ts hands over as the last statement of its load (freeJoinsPlans); null until then. guard.ts's
 *  runeDefs form: rivalBuilds.ts -> deck.ts -> this file, so this file can't import rivalBuilds.ts. */
let planDefs: Record<string, unknown> | null = null;
/** Each path's base number (the plan's own; undefined: the key is absent), captured at the first swap. */
const PLAN_BASE = new Map<string, number | undefined>();

/** The listed plan numbers to the switch's state `on`: FREE_JOINS_PLANS' or the plan's own, on the very plan objects. */
function swapPlans(on: boolean): void {
  const plans = planDefs; // nothing to swap until rivalBuilds.ts has handed its plans over
  if (!plans) return;
  for (const [path, n] of Object.entries(FREE_JOINS_PLANS)) {
    const keys = path.split(".");
    const last = keys.pop()!;
    const at = keys.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, plans);
    if (!PLAN_BASE.has(path)) PLAN_BASE.set(path, at[last] as number | undefined);
    const base = PLAN_BASE.get(path);
    if (on) at[last] = n;
    else if (base === undefined) delete at[last];
    else at[last] = base;
  }
}

/** rivalBuilds.ts hands its PLANS over as the last statement of its load; the listed numbers then take the switch's state
 *  (guard.ts guardRunes' form). */
export function freeJoinsPlans(plans: Readonly<Record<string, unknown>>): void {
  planDefs = plans as Record<string, unknown>;
  swapPlans(fjOn);
}

/** Are free joins in the game now (FREE_JOINS, or a withFreeJoins call)? */
export function freeJoinsRules(): boolean {
  return fjOn;
}

/** Turn free joins on or off. Every rule reads the switch where it acts; the content numbers it swaps are WEAVER's hull
 *  (FREE_JOINS_HULL while on, content.ts's base while off; HULL-ON run 5, cap's ruling 84ad10254e1855c8) and the captains'
 *  plan numbers (FREE_JOINS_PLANS, once rivalBuilds.ts has handed PLANS over; HULL-ON run 6, H4's captain pass). */
export function setFreeJoins(on: boolean): void {
  fjOn = on;
  for (const h of Object.keys(FREE_JOINS_HULL) as HeroId[]) {
    if (!HULL_BASE.has(h)) HULL_BASE.set(h, HEROES[h].hull);
    HEROES[h].hull = on ? FREE_JOINS_HULL[h]! : HULL_BASE.get(h)!;
  }
  swapPlans(on); // HULL-ON run 6 (H4's captain pass): the captains' plan numbers, FREE_JOINS_PLANS
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
