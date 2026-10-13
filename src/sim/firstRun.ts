// FIRSTDAY-1 (REQ-BFG-004, REQ-BFG-084.4; BRIEF-FIRSTDAY1 rulings F1-F5, cap 2026-10-11): A NEW PLAYER'S FIRST RUN, behind
// one switch. The rules side only: no hint, label or tutorial screen (F6; EXPLAIN-1 brings the one-time tips).
//
// WHO (F2): with the switch on, a new run is a first run when the device's profile holds no record of any run (no finished
// run, no best, no run in progress: profile.ts isNewPlayer, read by the hero screen, never by newRun, so the server's and
// the harness's runs never read a profile). The run carries `firstRun: true` (run.ts Run, save.ts migrateRun keeps it, so
// a reload keeps it); every later run is normal. Where the code can't tell, the player is not new.
//
// WHAT (F3): its seed stays; only the offers of days 1 and 2 change (FIRST_RUN_DAYS):
//  - dawn 1's rune: the 3 plain stat runes (FIRST_RUN_RUNES), whatever the seed offered;
//  - dawn 2's rune: the seed's offer, each VOLLEY, MERGED or STAMP rune replaced by the next allowed one in a seeded order
//    (runes.ts firstRunRuneOffer);
//  - the caravan, days 1-2 and every reroll there: rolled by the base's rule (the same stream, merchants, wagons and
//    slots), then every offer that isn't a plain common (FIRST_RUN_COMMONS) or one of the hero's own pieces is refilled
//    from the plain commons in a seeded order; dawn 2 adds the cheapest turret or gear the hero can use and a copy of the
//    first rig bought on day 1 (run.ts firstRunCaravan). Slot counts and the price rule don't change;
//  - day 3 on: the base's pool, offers and weights, exactly as a normal run with the same seed and the same buys.
//
// GHOSTS (F4): a first run's snapshots carry `firstRun: true` (day.ts ghostOf; net/snapshot.ts firstRunField), and the
// upload check re-derives days 1-2's rune offers by F3's rule (runes.ts runeProblem's `firstRun`). Off, the flag is
// refused (rulesGate.ts firstRunGateProblem). Bots, captains and stand-ins never play a first run (F5).
//
// THE SWITCH: FIRST_RUN (false), declared and read as NPC_DAY is (npcDay.ts): firstRunRules(), setFirstRun(on) and
// withFirstRun(fn, on = true). It does something only with PLAIN_RIGS on too (F1: its day-1 stock is the plain commons):
// firstRunGate() is the one test every reader asks. Off (either switch), nothing changes: a first run is a normal run and
// bb-0.9.7 plays byte for byte. BUMP-1D turns it on with PLAIN_RIGS and 1D's rules bump.
//
// Shared, pure and dependency-light (no DOM): the client, the server and the tests read the same lists.

import { hashSeed, Rng } from "../core/rng";
import { plainRigsRules } from "./plainRigs";

/** THE switch (REQ-BFG-004), off in this rules version (bb-0.9.7). */
export const FIRST_RUN: boolean = false;

let frOn = false;

/** Is the first-run switch on now (FIRST_RUN, or a withFirstRun call)? */
export function firstRunRules(): boolean {
  return frOn;
}

/** Turn the first-run switch on or off. */
export function setFirstRun(on: boolean): void {
  frOn = on;
}

/** Run `fn` with the first-run switch on (or off), then put it back as it was, even if `fn` throws. */
export function withFirstRun<T>(fn: () => T, on = true): T {
  const was = frOn;
  setFirstRun(on);
  try {
    return fn();
  } finally {
    setFirstRun(was);
  }
}

/** F1: the first-run gate is live: FIRST_RUN and PLAIN_RIGS both on. With either off a first run is a normal run. */
export function firstRunGate(): boolean {
  return frOn && plainRigsRules();
}

/** F3: the days whose offers a first run gates (dawns 1 and 2; day 3 on is the base's). */
export const FIRST_RUN_DAYS = 2;

/** F3, dawn 1's rune: the 3 plain stat runes, in this order (IRON SKIN +150 HULL, TAR BARREL +8 BELT, COIN PURSE +1 GOLD
 *  at dawn). All three are generic themes, so every hero can take each (runes.ts runeFits). */
export const FIRST_RUN_RUNES: readonly string[] = ["iron_skin", "tar_barrel", "coin_purse"];

/**
 * F3, days 1-2's caravan: the plain commons, in catalogue order. PLAIN-1's four commons (RASP, SPARK GAP, SCALE GUARD,
 * BALLAST) and the existing commons PIECES-1 section 3.3 turns plain (WHETSTONE `[DMG]`, TEMPER `[BURN]`). PIECES-1's
 * other plain rigs are rares (HEAT JACKET, BARBED SPOOL, whose HEAT and FRAY are keywords beyond BURN, STUN and PLATE),
 * and its smoke read kept PLATE ROLLER and RIVETER off the plain list. Each face needs no keyword beyond BURN, STUN and
 * PLATE. Only the ones in ITEMS are offered (the six plain rigs only with PLAIN_RIGS on, which the gate needs anyway).
 */
export const FIRST_RUN_COMMONS: readonly string[] = ["rasp", "sparkgap", "scaleguard", "ballast", "whetstone", "temper"];

/** A seeded order of `items` (a copy; the input is untouched) on its own stream: `hashSeed(seed, stream, day, n)`. */
export function seededOrder<T>(items: readonly T[], seed: number, stream: string, day: number, n = 0): T[] {
  return new Rng(hashSeed(seed >>> 0, stream, day, n)).shuffle(items.slice());
}

setFirstRun(FIRST_RUN);
