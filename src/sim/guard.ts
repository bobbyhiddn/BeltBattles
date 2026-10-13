// RETUNE-1 (REQ-BFG-097): GUARD, behind one switch. The operator: "shielding is absolutely unusable"; "plating seems crazy
// nerfed... it just isn't doing anything". LOSS-1's S3 (REPORT-LOSS1 section 11; REVIEW-LOSS1-R2 Q5, cap's call):
//  - PLATE ROLLER (content.ts WAVE3_ITEMS.plateroller): gate.plate 5 / 11 / 17 -> 15 / 33 / 51 a payload (x3);
//  - WARD BELL (content.ts SUSTAIN_ITEMS.wardbell): mod.shield.every 8 / 5 / 4 s -> 4 / 2.5 / 2 s (twice as often), still
//    +1 SHIELD a ring.
// SHIELD_CAP stays 3 (LOSS-1 measured that the cap almost never binds) and battle.ts is untouched: both changes are
// content-table values. The day multiplier that REQ-BFG-097 asks for is the hull release's: HULL_SCALE's S(d) multiplies
// PLATE in the fight (battle.ts, hullScale.ts), and a SHIELD stops a whole hit whatever its size.
//
// THE SWITCH: GUARD (false), in ladderFix.ts's form (LADDER_FIX): guardRules(), setGuard(on) and withGuard(fn, on = true),
// which puts the switch back even on a throw. A guarded piece is a content patch: while the switch is on, ITEMS[id] is the
// guarded def (GUARD_DEFS, built from the base def), and stars.ts's star cache is cleared at each swap; while it is off
// ITEMS[id] is the base def, the very object content.ts made (the module does nothing at load while GUARD is false). An
// assignment keeps the property's enumerability, so wave 3's and the sustain pieces' own switches (setWave3, setSustain)
// still decide whether the catalogue lists them. No record carries these numbers: a battle record replays only under its
// own rules version (replay.ts), and the server checks decks by price, never by plate or shield. So GUARD needs no rules
// literal; BUMP-1D turns it on with the rules bump.
// HULL-ON (the flip; cap's ruling 12a42239093fb6ec): GUARD ships on, so the patch runs at load, in this order: the items
// at guard.ts's own load (setGuard(GUARD) below); the runes when runes.ts hands its RUNES over as the last statement of
// its load (guardRunes). guard.ts imports only runes.ts's types, so nothing in its import closure loads runes.ts or
// deck.ts at run time: it always finishes first, in Vitest, native ESM, Rollup and esbuild alike.
// HULL-ON (the flip; cap's ruling 6f4568477e66a600): setWave3 and setSustain write the base defs of every wave-3 and
// sustain piece back into ITEMS (PLATE ROLLER's and WARD BELL's among them), so guard.ts hooks both toggles (content.ts
// onSetWave3, onSetSustain) and, while GUARD is on, puts the guarded def back after each, as ladderFix.ts does for STOKER.
//
// RETUNE-1 run 2 (BRIEF-RETUNE1-R2 section 2, plate balancing; REQ-BFG-097): the common PLATE runes, measured on LOSS-1's
// S1 method (output-retune1/plate): RIVET HOARD startPlate 60 -> 180, LAST WALL halfPlate 80 -> 140, SEAM RIVETS pairPlate
// 10 -> 30. A rune's number is its def's `amount` (runes.ts RUNES): the switch swaps that object on the very def (so the
// catalogue, the cards and the battle read one number) and puts back the base object when off. The rune offer code
// (runeWeight, runeFits, runeOffer) never reads an amount, so no offer moves.
//
// Shared, pure and dependency-light (no DOM), like ladderFix.ts.

import { ITEMS, type ItemDef } from "./content";
import { onSetSustain, onSetWave3 } from "./content"; // HULL-ON (cap's ruling 6f4568477e66a600): the toggles' hooks (no new module edge)
import { clearStarCache } from "./stars";
import type { RuneDef } from "./runes"; // HULL-ON (cap's ruling 12a42239093fb6ec): types only; runes.ts hands RUNES over (guardRunes)

/** THE switch (REQ-BFG-097): on, from HULL-ON's flip (bb-0.10.0). Its setter, withGuard and the off path stay this
 *  release, for the tests that measure the off world. No rules gate: content values no record carries. */
export const GUARD: boolean = true;

/** PLATE ROLLER's plate a payload by star with GUARD on (x3 of 5 / 11 / 17). */
export const GUARD_PLATE: Readonly<Record<1 | 2 | 3, number>> = { 1: 15, 2: 33, 3: 51 };
/** WARD BELL's ring interval in seconds by star with GUARD on (half of 8 / 5 / 4). */
export const GUARD_BELL_EVERY: Readonly<Record<1 | 2 | 3, number>> = { 1: 4, 2: 2.5, 3: 2 };

/** The guarded defs, each built from its base def (the switch-off def, as content.ts writes it). */
export const GUARD_DEFS: Readonly<Record<string, (base: ItemDef) => ItemDef>> = {
  plateroller: (b) => ({
    ...b,
    gate: { ...b.gate, plate: GUARD_PLATE[1] },
    levels: {
      ...b.levels,
      2: { ...b.levels![2]!, gate: { ...b.levels![2]!.gate, plate: GUARD_PLATE[2] } },
      3: { ...b.levels![3]!, gate: { ...b.levels![3]!.gate, plate: GUARD_PLATE[3] } },
    },
  }),
  wardbell: (b) => ({
    ...b,
    mod: { ...b.mod, shield: { ...b.mod!.shield!, every: GUARD_BELL_EVERY[1] } },
    levels: {
      ...b.levels,
      2: { ...b.levels![2]!, mod: { ...b.levels![2]!.mod, shield: { ...b.levels![2]!.mod!.shield!, every: GUARD_BELL_EVERY[2] } } },
      3: { ...b.levels![3]!, mod: { ...b.levels![3]!.mod, shield: { ...b.levels![3]!.mod!.shield!, every: GUARD_BELL_EVERY[3] } } },
    },
  }),
};

/** RETUNE-1 run 2: the common PLATE runes' amounts with GUARD on (runes.ts: 60 / 80 / 10 in this rules version). */
export const GUARD_RUNES: Readonly<Record<string, number>> = { rivet_hoard: 180, last_wall: 140, seam_rivets: 30 };

let gOn = false;
/** The base defs, kept at the first swap (so a swap back restores the very object content.ts made). */
const BASE = new Map<string, ItemDef>();
/** HULL-ON (cap's ruling 6f4568477e66a600): the guarded def each swap-on puts in ITEMS (ladderFix.ts's FIXED), for the
 *  wave-3 and sustain hooks below. */
const GUARDED = new Map<string, ItemDef>();
/** The guarded runes' base amount objects, kept at the first swap (runes.ts's own objects). */
const RUNE_BASE = new Map<string, RuneDef["amount"]>();
/** HULL-ON (the flip; cap's ruling 12a42239093fb6ec): the rune defs runes.ts hands over as the last statement of its load
 *  (guardRunes); null until then. The cause: with GUARD = true the patch runs at load, and guard.ts's body runs before
 *  runes.ts has made RUNES (runes.ts -> deck.ts -> import "./guard"); RETUNE-1's deferral caught only the TDZ
 *  ReferenceError, while under Vitest's module runner the binding reads undefined (a TypeError at load). */
let runeDefs: Readonly<Record<string, RuneDef>> | null = null;

/** Are the guard numbers in the game now (GUARD, or a withGuard call)? */
export function guardRules(): boolean {
  return gOn;
}

/** The guarded runes' amounts to the switch's state `on`: the guarded amount object or the base one, on the very def. */
function swapRunes(on: boolean): void {
  const defs = runeDefs; // HULL-ON (ruling 12a42239093fb6ec): nothing to swap until runes.ts has handed its defs over
  if (!defs) return;
  for (const id of Object.keys(GUARD_RUNES)) {
    const def = defs[id] as { amount: RuneDef["amount"] };
    if (!RUNE_BASE.has(id)) RUNE_BASE.set(id, def.amount);
    const base = RUNE_BASE.get(id)!;
    def.amount = on ? { ...base, n: GUARD_RUNES[id] } : base;
  }
}

/** Turn the guard numbers on or off: swap each guarded piece's def in ITEMS (its guarded or its base def), each guarded
 *  rune's amount, and clear the star cache. Setting the state it already has does nothing. */
export function setGuard(on: boolean): void {
  if (on === gOn) return;
  for (const id of Object.keys(GUARD_DEFS)) {
    if (!BASE.has(id)) BASE.set(id, ITEMS[id]);
    if (on) GUARDED.set(id, GUARD_DEFS[id](BASE.get(id)!)); // HULL-ON (ruling 6f4568477e66a600): kept for the hooks
    ITEMS[id] = on ? GUARDED.get(id)! : BASE.get(id)!;
  }
  // HULL-ON (the flip; cap's ruling 12a42239093fb6ec): the runes swap here once runes.ts has handed its defs over
  // (guardRunes); at guard.ts's own load they haven't been, and guardRunes swaps them to the switch's state then (was a
  // try/catch of the TDZ ReferenceError with a queueMicrotask, which missed Vitest's undefined binding)
  swapRunes(on);
  clearStarCache();
  gOn = on;
}

/** HULL-ON (the flip; cap's ruling 12a42239093fb6ec): runes.ts hands its RUNES over as the last statement of its load
 *  (after the catalogue and OPEN-1's rewrites are in); the guarded runes then take the switch's state. With GUARD off
 *  nothing moves, as before. guard.ts imports only runes.ts's types, so it has always loaded by then: the same order in
 *  Vitest, native ESM and the bundlers. */
export function guardRunes(defs: Readonly<Record<string, RuneDef>>): void {
  runeDefs = defs;
  if (gOn) swapRunes(true);
}

// HULL-ON (the flip; cap's ruling 6f4568477e66a600): content.ts setWave3 and setSustain write WAVE3_ITEMS[id] and
// SUSTAIN_ITEMS[id] back into ITEMS for every wave-3 and sustain id, PLATE ROLLER's and WARD BELL's base defs among them, so
// with GUARD on one toggle (tools/luckReport.ts, wave3.ts, textSheet.ts, sustainFoe.ts, runevalue.ts, sustainBench.ts) left
// the base def in ITEMS for the rest of the process. While the switch is on, put back the guarded def wherever a toggle just
// wrote the base def (ladderFix.ts's hook for STOKER, copied). Switch off: nothing (the toggles exactly as before).
function reguard(): void {
  if (!gOn) return;
  let moved = false;
  for (const [id, guarded] of GUARDED) {
    if (ITEMS[id] === BASE.get(id)) {
      ITEMS[id] = guarded;
      moved = true;
    }
  }
  if (moved) clearStarCache();
}
onSetWave3(reguard);
onSetSustain(reguard);

/** Run `fn` with the guard numbers on (or off), then put the switch back as it was, even if `fn` throws. */
export function withGuard<T>(fn: () => T, on = true): T {
  const was = gOn;
  setGuard(on);
  try {
    return fn();
  } finally {
    setGuard(was);
  }
}

setGuard(GUARD);
