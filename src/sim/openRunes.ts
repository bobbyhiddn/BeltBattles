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

/**
 * The dead-rune rewrites (REQ-BFG-109 section 4c), each built from its base def (the switch-off def, as runes.ts writes it):
 * the same id, name, tier and theme (so the same offers), only the trigger or target changed, on an effect the battle
 * already has. Empty until the audit (step 2).
 */
export const OPEN_RUNE_DEFS: Readonly<Record<string, (base: RuneDef) => RuneDef>> = {};

/** runes.ts's hook (called once, at its load): `fn(on)` swaps the rewritten defs in or out; it is applied at once with the
 *  switch's current state, and again at every change. */
export function bindOpenRuneDefs(fn: (on: boolean) => void): void {
  swap = fn;
  fn(orOn);
}

setOpenRunes(OPEN_RUNES);
