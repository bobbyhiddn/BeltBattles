// HULL-1b (REQ-BFG-070; BRIEF-HULL1B 2 (d); backlog #370 and #356; PLAN-AZ "Design calls: the star ladders"): THE
// STAR-LADDER PASS, behind one switch.
//
// THE RULE (cap): every star is a real step up. For each broken piece the median ★1-to-★2 and ★2-to-★3 step of the game's
// pieces of its kind, in their main output, was measured with the tripwire's own bench, and the piece's star numbers are
// set so its ladder rises by about that step, with the least change (W/output-hull1b/REPORT.md section (d)):
//  - QUENCH TANK (tests/fb062.quench): ★1 paid 30 per BURN, exactly a BURN's own damage (BURN_DPS x BURN_TIME), so ★1 was
//    no QUENCH at all. ★1 now pays 40 (+10 over the BURN it spends; ★2 +20, ★3 +40: steps x2.0 and x2.0 against the
//    damage rigs' median x2.17 and x1.59 on the same bench). One number.
//  - STOKER (tests/wave3.decks, backlog #356): ★3's stoke 0.7 -> 0.85, so the shared gun with room rises at every star
//    (the row's fights end at the foe's hull, so ★3's faster mould lost on overkill alone). One number.
//  - P13, the walk's ride gap (tests/beltside.merge061rel; cap's oracle d306b1b196dbab38): a code rule in deck.ts walkRoute,
//    which reads ladderFixRules(): the walk rides tick by tick as Battle.transport moves a payload (a tile's speed holds
//    past its centre; a clamped last move; stamp to chamber = the moves - 1 ticks), so the walk's damage at load and its
//    time are the battle's (BRAKE ★1 94 / 94, was 94 / 95). The walk feeds the bots' rating, so par decks move with it.
//
// THE SWITCH: LADDER_FIX (false), in npcDay.ts's form: ladderFixRules(), setLadderFix(on) and withLadderFix(fn, on = true),
// which puts the switch back even on a throw. A fixed piece is a content patch: while the switch is on, ITEMS[id] is the
// fixed def (LADDER_DEFS, built from the base def), and stars.ts's star cache is cleared at each swap; while it is off
// ITEMS[id] is the base def, untouched (the module does nothing at load while LADDER_FIX is false). Every fix reads the
// switch through ITEMS (a content row) or ladderFixRules() (a code rule). With it off, bb-0.9.7 plays byte for byte:
// fp.sh IDENTICAL, parBench 8cde5ed0. AZ-BUMP turns it on with the rules bump and re-keys the tripwires.
//
// Shared, pure and dependency-light (no DOM): the client, the server and the tests read the same defs.

import { ITEMS, type ItemDef } from "./content";
import { clearStarCache } from "./stars";

/** THE switch (REQ-BFG-070, the star-ladder pass), off in this rules version (bb-0.9.7). */
export const LADDER_FIX: boolean = false;

/** The fixed defs, each built from its base def (the switch-off def, as content.ts writes it). */
export const LADDER_DEFS: Readonly<Record<string, (base: ItemDef) => ItemDef>> = {
  // QUENCH TANK ★1: 40 per BURN (was 30 = a BURN's own damage, so ★1 = no QUENCH); ★2 50 and ★3 70 as before
  quench: (b) => ({ ...b, gate: { ...b.gate, quench: { ...b.gate!.quench!, perBurn: 40 } } }),
  // STOKER ★3: stoke 0.85 (was 0.7); ★1 0.2 and ★2 0.44 as before; its cap (a stoke never outruns its gun) unchanged
  stoker: (b) => ({ ...b, levels: { ...b.levels, 3: { ...b.levels![3]!, gate: { ...b.levels![3]!.gate, stoke: 0.85 } } } }),
};

let lfOn = false;
/** The base defs, kept at the first swap (so a swap back restores the very object content.ts made). */
const BASE = new Map<string, ItemDef>();

/** Is the star-ladder pass in the game now (LADDER_FIX, or a withLadderFix call)? */
export function ladderFixRules(): boolean {
  return lfOn;
}

/** Turn the star-ladder pass on or off: swap each fixed piece's def in ITEMS (its fixed or its base def) and clear the
 *  star cache. Setting the state it already has does nothing. */
export function setLadderFix(on: boolean): void {
  if (on === lfOn) return;
  for (const id of Object.keys(LADDER_DEFS)) {
    if (!BASE.has(id)) BASE.set(id, ITEMS[id]);
    ITEMS[id] = on ? LADDER_DEFS[id](BASE.get(id)!) : BASE.get(id)!;
  }
  clearStarCache();
  lfOn = on;
}

/** Run `fn` with the star-ladder pass on (or off), then put the switch back as it was, even if `fn` throws. */
export function withLadderFix<T>(fn: () => T, on = true): T {
  const was = lfOn;
  setLadderFix(on);
  try {
    return fn();
  } finally {
    setLadderFix(was);
  }
}

setLadderFix(LADDER_FIX);
