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
//
// RETUNE-1 run 2 (BRIEF-RETUNE1-R2 section 2, plate balancing; REQ-BFG-097): the common PLATE runes, measured on LOSS-1's
// S1 method (output-retune1/plate): RIVET HOARD startPlate 60 -> 180, LAST WALL halfPlate 80 -> 140, SEAM RIVETS pairPlate
// 10 -> 30. A rune's number is its def's `amount` (runes.ts RUNES): the switch swaps that object on the very def (so the
// catalogue, the cards and the battle read one number) and puts back the base object when off. The rune offer code
// (runeWeight, runeFits, runeOffer) never reads an amount, so no offer moves.
//
// Shared, pure and dependency-light (no DOM), like ladderFix.ts.

import { ITEMS, type ItemDef } from "./content";
import { clearStarCache } from "./stars";
import { RUNES, type RuneDef } from "./runes";

/** THE switch (REQ-BFG-097), off in this rules version (bb-0.9.7). */
export const GUARD: boolean = false;

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
/** The guarded runes' base amount objects, kept at the first swap (runes.ts's own objects). */
const RUNE_BASE = new Map<string, RuneDef["amount"]>();

/** Are the guard numbers in the game now (GUARD, or a withGuard call)? */
export function guardRules(): boolean {
  return gOn;
}

/** The guarded runes' amounts to the switch's state `on`: the guarded amount object or the base one, on the very def. */
function swapRunes(on: boolean): void {
  for (const id of Object.keys(GUARD_RUNES)) {
    const def = RUNES[id] as { amount: RuneDef["amount"] };
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
    ITEMS[id] = on ? GUARD_DEFS[id](BASE.get(id)!) : BASE.get(id)!;
  }
  try {
    swapRunes(on);
  } catch (e) {
    // Only at load with GUARD = true (BUMP-1D): runes.ts imports deck.ts, which loads this module, so when runes.ts is
    // the first of them to load, RUNES isn't made yet here. The runes then take the switch's state once every module
    // has loaded (before any battle or card reads an amount).
    if (!(e instanceof ReferenceError)) throw e;
    queueMicrotask(() => swapRunes(gOn));
  }
  clearStarCache();
  gOn = on;
}

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
