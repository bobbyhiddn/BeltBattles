// OPEN-1 (REQ-BFG-109): THE OPEN RUNE POOL, behind one switch. The operator: "do you limit the rig pools per race? I never
// see poison on foundry for example. I dislike this. In batomon and other battlers, the pool is open and it feels great."
// The part offers are hero-blind already; with OPEN_RUNES on, the runes are too:
//  - the dawn offer (runes.ts runeOffer): every offerable rune weighs 1 (runeWeight; was the hero's own style x3, a generic
//    theme x2, another hero's style x1) and there is no FIX-10 redraw (the last card redrawn among the runes that fit the
//    hero when none did);
//  - LAST CHANCE's rune card (lastChance.ts lastChanceOffer): no runeFits filter and no weight (one even draw among the
//    tier's runes left).
// Everything else in the offers stays: the tiers and their fallback, the dormant runes left out (runeList), no two cards of
// one theme, the held runes left out, the seeds and the streams. With the switch off every offer, pick, pool and id is as
// today.
//
// THE RULE IS DECIDED ONCE PER CALLER AND PASSED IN (runeOffer's, runeProblem's, lastChanceOffer's, botTakeRune's and
// botRuneList's last argument `open`, false by default), never read deep inside the offer code:
//  - the game (src/game/run.ts pendingRune, pendingLastChance): this build's rules, i.e. the switch (openRunesRules());
//  - the server's checks (src/net/validate.ts: validateUpload's player mode, the held runes' dawn offers and LAST CHANCE's
//    seeded card) and the client's snapshot check (src/game/ghostSnapshot.ts isSnapshot): the snapshot's own rules
//    (rulesGate.ts openRunesFor(rules) = the switch AND rules at or after OPEN_RUNES_RULES);
//  - the bots (the par player's dawn rune and LAST CHANCE part, the ghost probe's honest decks): the switch;
//  - the captains (tools/genCaptainRunes.ts and the CAPTAIN_RUNES table): closed, explicitly (a captain's runes are part
//    of its tuned plan).
//
// THE SWITCH: OPEN_RUNES (false), in npcDay.ts's form: openRunesRules(), setOpenRunes(on) and withOpenRunes(fn, on = true),
// which puts the switch back even on a throw. The dead-rune rewrites (OPEN_RUNE_DEFS, REQ-BFG-109's "every rune useful for
// every hero") are a content patch in ladderFix.ts's form: while the switch is on, the rewritten runes' defs are in the
// catalogue (RUNES and the lists, runes.ts swapOpenRuneDefs), each built from its base def; while it is off the catalogue
// holds the very base objects. runes.ts binds the swap here at its load (bindOpenRuneDefs), so this module imports nothing
// from runes.ts at run time (types only) and the two never form an import cycle. BUMP-1D writes OPEN_RUNES_RULES as a
// literal, turns the switch on and regenerates the seed pool.
//
// Shared, pure and dependency-light (no DOM), like npcDay.ts.

import type { RuneDef } from "./runes";

/** THE switch (REQ-BFG-109), off in this rules version (bb-0.9.7). */
export const OPEN_RUNES: boolean = false;

let orOn = false;
/** runes.ts's swap of the rewritten defs (bindOpenRuneDefs), absent until runes.ts has loaded. */
let swap: ((on: boolean) => void) | null = null;

/** Are the rune offers open now (OPEN_RUNES, or a withOpenRunes call)? */
export function openRunesRules(): boolean {
  return orOn;
}

/** Turn the open rune pool on or off: the switch, and the rewritten runes' defs in the catalogue (once runes.ts has
 *  loaded; it applies the switch's state itself when it binds). Setting the state it already has does nothing. */
export function setOpenRunes(on: boolean): void {
  if (on === orOn) return;
  orOn = on;
  swap?.(on);
}

/** Run `fn` with the open rune pool on (or off), then put the switch back as it was, even if `fn` throws. */
export function withOpenRunes<T>(fn: () => T, on = true): T {
  const was = orOn;
  setOpenRunes(on);
  try {
    return fn();
  } finally {
    setOpenRunes(was);
  }
}

/** THE LONG ROAD's amount under the open rule (a whole %, per rig a load passes; TOLL ROAD's unit). Run 2's bench
 *  (tools/open1.ts --mode value, "today": AZ's three switches on; FURNACE's bare par decks, seeds 1-10, days 3-10, against
 *  the four heroes' par decks, seeds 1-2, both sides; points a fight x100, 95% interval over the members): today's x2
 *  +16.3 [9.8, 22.9]; this rewrite at 6 +15.6 [5.8, 25.4], 8 +19.2, 10 +23.0, 12 +26.3, 15 +29.4 (TOLL ROAD's 4: +10.7).
 *  6 is the whole amount nearest today's (-4%). */
export const LONG_ROAD_PCT = 6;

/**
 * The dead-rune rewrites (REQ-BFG-109 section 4c), each built from its base def (the switch-off def, as runes.ts writes it):
 * the same id, name, tier and theme (so the same offers), only the trigger or target changed, on an effect the battle
 * already has.
 *
 * THE AUDIT (BRIEF-OPEN1 4a; tools/open1.ts --mode audit, the par decks of days 3, 6 and 9) and cap's call (oracle request
 * 3360bc59b3a473f1: section 4's definition decides, "no deck that hero can build"; the par-deck run is the screen):
 * - DEAD, rewritten here: THE LONG ROAD for WEAVER, FOUNDRY and BASTION. "YOUR RIDE BONUS: x2" reads a load's ride bonus,
 *   and only the KILN's CINDER SLUG has one (AMMO rideScale; the KILN is FURNACE's own factory, no shop sells it).
 * - PART, kept as they are (build-arounds: dead on the par decks, live with a shop part): COAL CHUTE and HEAT SINK for
 *   WEAVER, FOUNDRY and BASTION (HEAT: a HEAT JACKET, a rare QUARTERMASTER rig), and the seven PAIR runes for WEAVER (a
 *   two-intake turret, SCRAP CANNON, CARRONADE, RAMPART or SWIVEL, fed by two belts; WEAVER's DART GUNs take one belt
 *   each). tests/open1.deadRunes.test.ts builds each such deck legally and proves the rune fires there.
 */
export const OPEN_RUNE_DEFS: Readonly<Record<string, (base: RuneDef) => RuneDef>> = {
  // THE LONG ROAD (legendary, furnace): the road a load travels, keyed on what every deck holds. The battle's one generic
  // reading of a load's road is the rigs it passed (Payload.prior: TOLL ROAD's priorPct, in runeMul's % sum), so the
  // rune becomes "+N% DMG PER RIG A LOAD PASSES", in TOLL ROAD's words (one effect, one wording), N set on FURNACE's value
  // of today's x2 (tools/open1.ts --mode value). The better form, a ride bonus for every load ("YOUR LOADS: +N DMG A SEC
  // RIDDEN"), needs a new effect field in battle.ts: the REPORT proposes it, nothing here builds it.
  long_road: (base) => ({ ...base, kind: "priorPct", amount: { unit: "pct", n: LONG_ROAD_PCT }, text: "+{N} {DMG} PER RIG A LOAD PASSES." }),
};

/** runes.ts's hook (called once, at its load): `fn(on)` swaps the rewritten defs in or out; it is applied at once with the
 *  switch's current state, and again at every change. */
export function bindOpenRuneDefs(fn: (on: boolean) => void): void {
  swap = fn;
  fn(orOn);
}

setOpenRunes(OPEN_RUNES);
