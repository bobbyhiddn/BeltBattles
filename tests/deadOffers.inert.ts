// 0.8.0 H1 M4 (REQ-BFG-021, acceptance 3 and 5): the inert pairs the dead-offer audit finds (tests/deadOffers.*.test.ts,
// machinery in deadOffers.helpers.ts). For each hero: each buyable module that changes no battle metric on that hero's
// reference deck on some days, wherever it is sensibly placed, with the reason. output-H1/REPORT.md lists each with a
// proposed fix. No module changes in H1. Not a test file.

import type { HeroId } from "../src/sim/content";

/** Why a module does nothing on a deck. */
export type Reason =
  | "starved" | "oneIntake" | "twinIntake" | "needsShock" | "needsPriorHits" | "needsLaterRig"
  | "shortRide" | "mergeNoGain"
  // 0.8.0 I1 M2 (wave 3 joins the audit; oracle 0cf9f46b9ce87750)
  | "gunFull"
  // NUM-1 (REQ-BFG-047; cap's oracle 3cf09080186f8f84): a pair the whole numbers made inert, open until classified
  | "num1Open"
  // NUM-2 (cap's oracle 3cf09080186f8f84): BASTION's GREASE WORKS days 5-6, classified SUB-POINT; no older reason fits
  | "stampPaced"
  // NUM-2 (REQ-BFG-047; 3cf09080186f8f84's procedure applied to SPEED, provisionally: oracle ec91a967c21f4c7b): a pair
  // SPEED's whole speeds and carried timers made inert, open until classified against num1u
  | "num2Open"
  // FLIP-X2 (REQ-BFG-069, release X's sustain on): WARD BELL (SHIELD) and MENDING LOOM (REGEN) guard and mend the hull
  // they sit on; the audit's quiet foe never hits it, so they change none of its metrics (MEND PRESS, a factory that
  // stamps slugs, is live)
  | "noFoeHits"
  // Y7b2 (the flip; release Y, bb-0.9.3; DESIGN.md's release Y section, REVIEW-STARD answer 4: the floors went, so a payoff
  // piece does nothing without its engine): a payoff piece whose engine this reference deck lacks
  | "needsEngine"
  // SHAPES-1 flip: a shaped rig (SPIKE RAIL, an I3) that finds no room beside a connected belt on this reference deck
  | "noRoom";
// Y7b2 (the flip): needsRide is gone with its last pairs (FOUNDRY 6-8 and 10, BASTION 1, FURNACE 1): BELLOWS's +1 BURN for
// each whole 2 s ridden (was 4 for each 10 s, up to 4) reaches every reference deck's belts, so it is live on every hero, days 1-10
// FLIP-X2 (REVIEW-NUM3 answer 2): NUM-3's num3Open reason is gone with its 60 rows, all SIFTER's (every hero, days 1-10):
// SIFTER is dormant (races/data.ts DORMANT_ITEMS), so it is no buyable module and the audit no longer tries it
// 0.8.0 B1 M1 (oracle 60ce2081b6171361): echoBelt and laterGun described reference-deck defects B1 fixed (SIPHON's merged
// ECHO WHETSTONE; its CALIBRATION in starved gun 0's only gear slot), so no pair has either reason any more

export const REASONS: Record<Reason, string> = {
  // 0.8.0 I1 (oracle 0cf9f46b9ce87750): STEAM BREECH, a fire-rate core, is the same physics as CALIBRATION
  starved: "The gun it would work on is starved: its belt brings a load less often than the gun can fire. Firing faster (CALIBRATION, ESCAPEMENT, STEAM BREECH, a turret's next star), a wider chamber (EXT. CHAMBER, HOPPER) or another turret on the same belts (turrets differ only in fire rate, chamber size and flight time) changes no shot.",
  oneIntake: "No slot for a one-intake gun: every fed gun on this deck takes two belts (FOUNDRY's twin-pour gun; a STAMP PRESS in the second intake from day 5 or 6), and a DART, SPIKE or HAIL GUN takes one, so a belt would end short of an intake.",
  twinIntake: "TWIN NEEDLE fires like a DART GUN; its reason to buy is a second intake, and no second belt reaches the gun it would replace.",
  needsShock: "SPOTTER turns bare-hull shots toward machinery, which only matters when a hit can stall a machine: there is no GALVANIC COIL or other shock on this deck, so an aimed hit does what a hull hit does.",
  needsPriorHits: "LONG HAUL adds damage for each hit the payload already took, and no rig works the belt before it (the day-1 FURNACE and WEAVER reference decks are the bare starting decks).",
  needsLaterRig: "OVERCLOCKER doubles the next boostable rig downstream, and no free spot on this deck has one after it (no rig at all on the bare day-1 and day-2 decks; on BASTION from day 5 every spot before the last rigs is taken).",
  shortRide: "LONGCASE adds damage to slugs that rode at least 2 seconds, and from day 2 BASTION's GREASE WORKS gets its bulwark slugs to the gun sooner.",
  mergeNoGain: "The copy merges into WEAVER's GREASE WORKS (2 stars: 2.3 times as fast); its threads reach that gun 0.3 seconds sooner, but the LOOM's pace sets how many shots it fires, and another gun fires first.",
  // 0.8.0 I1 M2 (oracle 0cf9f46b9ce87750): BASTION days 5-10, every stoke spot: the WARDWORKS and the STAMP PRESS both
  // feed gun 0, which takes every load it can (17 and 13 stamps in 18 s with and without it on days 5 and 8; 15 and 12
  // on day 10), and the gun cap (oracle a0e94bc69949561f) binds
  gunFull: "STOKER's factories already feed their gun as fast as it takes loads, and a stoke never makes a factory outrun its gun, so it adds no stamp.",
  num1Open: "NUM-1's whole numbers: on bb-0.8.7's rules this part moved a battle metric on this deck, on num1's it moves none. Open until it is classified against the base (oracle 3cf09080186f8f84).",
  // NUM-2 (cap's oracle 3cf09080186f8f84), from the base 11fbc6a's rows (W/output-num2/deadaudit): produced, shots and
  // firstShot equal; gun 0's fourth shot 19 ticks sooner; 0.033 of Burn by the clock (under one num1 point)
  stampPaced: "The copy merges into BASTION's GREASE WORKS (2 stars: its belt runs 2.3 times as fast from its hit, not 1.6); the bulwark slugs reach gun 0 sooner, but the factories' stamp pace sets how many loads the gun gets: the same slugs and shots, one shot a moment sooner.",
  num2Open: "NUM-2's SPEED: on num1u's rules (intervals, reset timers) this part moved a battle metric on this deck, on num2's (whole speeds, timers that carry their remainder) it moves none. Open until it is classified against num1u (3cf09080186f8f84's procedure).",
  noFoeHits: "A WARD BELL's SHIELD blocks a hit and a MENDING LOOM's REGEN gives back hull, both on the deck's own hull; the audit's quiet foe never hits it, so there is nothing to block or give back, and the offense metrics the audit reads don't move.",
  // Y7b2 (the flip): each new pair checked on its deck at every place the audit tries (T/output-y7b2/deadaudit/diag): no
  // BURN on the slugs it hits, no STUN on the foe, no PLATE, no PAIR, no matched belt, no other rig on its tile, never a belt
  // under both TWIN LATCH arrows, at most 20 bonus damage a shot
  needsEngine: "Release Y's one-line rule gives it no floor: it acts only on its engine (VENOM DRIP on BURN, QUENCH TANK on BURN, TWIN GAUGE on a matched belt, PINCER beside another rig on its tile, PLATE BREAKER and STEAM BREECH on PLATE, LODESTONE on a STUN, TWIN LATCH with a belt under each arrow, TWIN TRIGGER and SEAM WELDER on a PAIR, DRAKE NOZZLE on 25+ bonus damage a shot), and this deck has none of it there.",
  // SHAPES-1 flip (SHAPES on: NAIL STRIP, EMBER TROUGH and SPIKE RAIL are buyable): BASTION days 9-10, checked on the deck
  // with the shaped-rig solver's own rule (beltside.ts shapedSpot: every anchor x rot, all cells free, on the deck, off the
  // intakes): 160 and 158 free SPIKE RAIL placements, none with an arrow on a connected belt (day 8: 2; a NAIL STRIP, an I2,
  // still has 1 on days 9-10 and is live)
  noRoom: "SPIKE RAIL is an I3 rig: it needs three free cells in a line beside a connected belt, and on this deck every free cell beside one is hemmed in by machinery, belts or other rigs, so it can't be put to work anywhere.",
};

/** The inert pairs: hero, module, its days (ascending), as the audit finds them on the reference decks. */
// 0.8.0 I1 M2 (wave 3 joins the audit; oracle 0cf9f46b9ce87750): STEAM BREECH starved on FOUNDRY 1-8, WEAVER and SIPHON
// 1-10; STOKER gunFull on BASTION 5-10; TWIN TRIGGER laterGun on SIPHON 4-10. Every other pin is H1's, unchanged.
// 0.8.0 B1 M1 (oracle 60ce2081b6171361): FOUNDRY, BASTION and SIPHON re-pinned from the audit's rows after the reference
// decks kept their mirrored rigs (src/sim/races/refBuilds.ts); FURNACE, WEAVER and METRONOME unchanged.
// 0.8.0 B1 M2 (oracle 77741ac681b29a49): FOUNDRY re-pinned from the audit's rows after FUSE_MULT 1.3 -> 1.15, with the
// quiet foe kept at 240 hull (QUIET_FOE_HULL): calibrate, dartgun, spikegun, escapement and steambreech inert on days 7-8
// (the kill moved a shot later, so a swap of the starved gun no longer moves it), railgun day 1 (no kill on the 32 s clock),
// and no longer inert: escapement and steambreech day 10, bellows day 9 (the foe now dies inside the clock).
// NUM-1 (REQ-BFG-047; cap's oracle 3cf09080186f8f84): re-pinned PROVISIONALLY from the audit's num1 rows (the audit's foe
// hulls in num1 units, deadOffers.helpers.ts), all six heroes. No listed pair turned live; the audit adds pairs on every
// hero, almost all gun swaps and fire-rate parts on starved guns, whose bb-0.8.7 effect was a float-level timing shift that
// whole damage and whole-second burn / poison / wind ticks don't carry. Every new pair has the reason num1Open (WHY's day
// ranges below, so byDefault's "starved" can't claim it unchecked) until it is classified against the base 11fbc6a
// (sub-point, kill edge or lost); no num1Open may remain at R6's bump. The rows: W/output-num1/deadaudit.
// NUM-2 (cap's oracle 3cf09080186f8f84): all 246 num1Open rows classified against the base 11fbc6a (W/output-num2/
// deadaudit/CLASSIFY.md): 31 rows sub-point and 5 kill edge take their physics reason in WHY (starved; GREASE WORKS on
// BASTION the new stampPaced); 210 rows (38 pairs) are lost (damage, Burn and the foe's hull moved 0.1-1.97 base units
// with the same shots) and keep num1Open. INERT itself is unchanged.
// NUM-2 (REQ-BFG-047, SPEED; cap's oracles ec91a967c21f4c7b and 3cf09080186f8f84): INERT re-pinned from the audit's num2
// rows (W/output-num2/deadaudit-num2). SPEED's whole speeds and carried timers move every gun's and factory's cadence by
// up to 4%, so the audit moves both ways on every hero. NEW inert pairs take num2Open (NUM2_OPEN below, read before WHY);
// classifying them against num1u (sub-point, kill edge, lost) is NUM-3's first item, and R6 may not bump with any num1Open
// or num2Open left (tests/deadOffers.open.test.ts). Pairs that TURNED LIVE are dropped, one line each; their WHY entries
// stay, unread on a live day:
// - foundry calibrate 7-9: live under SPEED (whole speeds, carried timers)
// - foundry spikegun 9: live under SPEED
// - foundry twinneedle 2-4: live under SPEED
// - foundry railgun 4: live under SPEED
// - foundry escapement 9: live under SPEED
// - foundry steambreech 9: live under SPEED
// - bastion deckgun 5-6, 10: live under SPEED
// - bastion siegegun 2-3: live under SPEED
// - bastion grease 5-6: live under SPEED
// - furnace calibrate, scrapcannon, rampart, swivel, deckgun, steambreech 7-10: each live under SPEED
// - weaver railgun 1, 3-4: live under SPEED
// - weaver grease 2-6: live under SPEED
// - metronome calibrate 5-6, rampart 1-2, siegegun 1-2: each live under SPEED
// - siphon scrapcannon, rampart, bombard 1-10: each live under SPEED
// - siphon railgun 5-10: live under SPEED
// NUM-3 (REQ-BFG-046, REQ-BFG-047; cap's call in REVIEW-SUSA.md): INERT re-pinned from the audit's num3 rows
// (W/output-num3/deadaudit; num3-inert-diff.json against susa's INERT). One change: SIFTER is inert on every hero, days 1-10
// (60 rows): R1's STUN fold removed CHILL and SNAG, the marks it removed, and no piece gives SAP, the one mark left. These
// take num3Open (NUM3_OPEN below, read first) and are not classified here: R6-X classifies every open row (num1Open,
// num2Open, num3Open) once, on release X's final rules; RUNES-2b decides whether SIFTER goes dormant. No pair turned live.
// FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER is dormant, so it leaves buyableModules and the audit: its 60 rows (and NUM3_OPEN)
// are deleted.
// FLIP-X2 step 7 (the audit re-run on release X's rules, bb-0.9.0: W/output-flipx2/deadaudit): every listed pair is still
// inert and none turned live; the sustain pieces join the audit with the switch on: WARD BELL and MENDING LOOM inert on
// every hero, days 1-10 (120 rows, reason noFoeHits: the quiet foe never hits the hull they guard), MEND PRESS live.
// Y7b2 step 7 (the flip: release Y's rules are the only rules, bb-0.9.3; the audit's rows in T/output-y7b2/deadaudit):
// INERT re-pinned to the rows: foundry 146 -> 174, bastion 74 -> 110, furnace 85 -> 119, weaver 181 -> 231, metronome
// 77 -> 101, siphon 155 -> 208. The new pairs (modules appended to each hero's line, or new days): release Y's payoff pieces
// where the reference deck has no engine (needsEngine: VENOM DRIP, QUENCH TANK, LODESTONE, PINCER, TWIN GAUGE, TWIN LATCH,
// PLATE BREAKER, DRAKE NOZZLE, TWIN TRIGGER, SEAM WELDER; STEAM BREECH with no PLATE on FURNACE 1-2 and 7-10 and METRONOME
// 7-10); HOPPER, its chamber slots alone now, where its gun's chamber never fills (starved); on starved guns (starved),
// FOUNDRY's day-9 DART GUN, SPIKE GUN, ESCAPEMENT and STEAM BREECH, SIPHON's RAIL GUN 4-7 and 9-10, and METRONOME's SWIVEL
// merge on day 7. Pairs that TURNED LIVE are dropped, one line each:
// - foundry railgun 3: live on release Y's rules (its WHY entry, num1Open, dropped)
// - foundry bellows 6-8 and 10, bastion bellows 1, furnace bellows 1: live (BELLOWS's +1 BURN for each whole 2 s ridden)
// AZ-BUMP S5 (the flip, LADDER_FIX; the audit's rows on the flip's src, output-azbump/notes/reds/deadOffers.six.txt): one pair
// TURNED LIVE and is dropped; its WHY entry stays, unread on a live day. Every other pair of the six heroes is as listed (S7
// re-runs and names the dead-offer audit):
// - siphon railgun 7: live with the star-ladder pass on. SIPHON's reference deck buys a QUENCH TANK ★1 on day 6
//   (races/refBuilds.ts), its one fixed piece, which now turns each BURN into 40 damage (was 30), so the day-7 fight moves
//   and a RAIL GUN in place of a starved gun changes a metric (the audit's battles take no day: HULL_SCALE's rules don't
//   apply, and NPC_DAY doesn't reach them)
export const INERT: Record<HeroId, Record<string, number[]>> = {
  foundry: { chamber: [1, 2, 3, 4, 5, 6], calibrate: [1, 2, 3, 4, 5, 6], spotter: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], scrapcannon: [1, 2, 3, 4, 5, 6], rampart: [1, 2, 3, 4, 5, 6], dartgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spikegun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], carronade: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], swivel: [1, 2, 3, 4, 5, 6], twinneedle: [1, 5, 6], hailgun: [1, 2, 3, 4, 5, 6], deckgun: [1, 2, 3, 4, 5, 6], railgun: [1, 6], bombard: [1, 2, 3, 4, 5, 6], siegegun: [1, 2, 3, 4, 5, 6], thunderer: [1, 2, 3, 4, 5, 6], escapement: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], steambreech: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], wardbell: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], mendingloom: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hopper: [1, 2, 3, 4, 5, 6], venom: [5, 6, 7, 8, 9, 10], lodestone: [6, 7, 8, 9, 10], pincer: [6, 7], twinlatch: [6, 7, 8, 9, 10], platebreaker: [6, 7, 8, 9, 10] },
  bastion: { spotter: [1, 2, 3, 4, 5, 6, 7], scrapcannon: [1, 2, 3], deckgun: [1, 2, 3, 4], siegegun: [1, 4], thunderer: [1, 2, 3, 4], longcase: [2, 3, 4], calibrate: [4], rampart: [4], swivel: [4], steambreech: [4], overclocker: [5, 10], dartgun: [5, 6, 7, 8, 9, 10], spikegun: [5, 6, 7, 8, 9, 10], hailgun: [5, 6, 7, 8, 9, 10], stoker: [5, 6, 7, 8, 9, 10], wardbell: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], mendingloom: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], lodestone: [1, 5, 6], hopper: [1, 2, 3, 4], drake: [1, 2], twingauge: [1, 5, 6, 9, 10], twinlatch: [1, 5, 6, 9, 10], twintrigger: [1, 2, 3, 4], seamwelder: [1, 2, 3, 4], pincer: [5, 6, 9, 10], venom: [7, 8, 9, 10], quench: [9, 10],
    spikerail: [9, 10] }, // SHAPES-1 flip: SPIKE RAIL is buyable (SHAPES on) and finds no room on days 9-10 (noRoom)
  furnace: { longhaul: [1], overclocker: [1], spotter: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bombard: [1, 2, 3, 4, 5], calibrate: [3, 4, 5, 6], scrapcannon: [3, 4, 5, 6], rampart: [3, 4, 5, 6], swivel: [3, 4, 5, 6], deckgun: [3, 4, 5], siegegun: [3, 4, 5], thunderer: [3, 4, 5], escapement: [3, 4, 5], steambreech: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], dartgun: [6, 7, 8, 9, 10], spikegun: [6, 7, 8, 9, 10], hailgun: [6, 7, 8, 9, 10], wardbell: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], mendingloom: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], venom: [1], quench: [1], lodestone: [1], hopper: [1, 2, 3, 4, 5], drake: [1, 2, 3, 4, 5, 6, 7], twingauge: [1], pincer: [1], twinlatch: [1], platebreaker: [1], twintrigger: [1, 2, 3, 4, 5], seamwelder: [1, 2, 3, 4, 5] },
  weaver: { longhaul: [1], overclocker: [1, 2], chamber: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], calibrate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spotter: [1, 2, 3], scrapcannon: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], dartgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spikegun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], carronade: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], swivel: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], twinneedle: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hailgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], deckgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bombard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], siegegun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], thunderer: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], escapement: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], steambreech: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], railgun: [2, 5], twintrigger: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], wardbell: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], mendingloom: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], venom: [1, 2], quench: [1, 2], lodestone: [1, 2], hopper: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], drake: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], twingauge: [1, 2], pincer: [1], twinlatch: [1, 2], platebreaker: [1, 2], seamwelder: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  metronome: { calibrate: [1, 2], spotter: [1, 2, 3], swivel: [1, 2, 3, 4, 5, 6, 7], deckgun: [1, 2, 3, 4, 5, 6, 7], thunderer: [1, 2, 3, 4], steambreech: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], scrapcannon: [3, 4], rampart: [3, 4, 5, 6, 7], bombard: [3, 4], siegegun: [3, 4], dartgun: [5, 6, 7, 8, 9, 10], spikegun: [5, 6, 7, 8, 9, 10], hailgun: [5, 6, 7, 8, 9, 10], wardbell: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], mendingloom: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hopper: [1, 2, 3, 4], drake: [1], twintrigger: [1, 2, 3, 4], seamwelder: [1, 2, 3, 4], venom: [7, 8, 9, 10], quench: [9, 10] },
  siphon: { chamber: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], calibrate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spotter: [1, 2], dartgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spikegun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], carronade: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], swivel: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], twinneedle: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hailgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], deckgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], railgun: [1, 2, 3, 4, 5, 6, 9, 10], siegegun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], thunderer: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], escapement: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], steambreech: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], wardbell: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], mendingloom: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], venom: [1, 4, 5, 6, 7, 8, 9, 10], quench: [1], lodestone: [1], hopper: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], drake: [1, 2, 3, 4], twingauge: [1], twinlatch: [1], platebreaker: [1], twintrigger: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], seamwelder: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
};

/** NUM-2 (REQ-BFG-047): the (hero, module, days) SPEED made inert (the audit's num2 rows against num1u's INERT), each
 *  num2Open until classified against num1u; reasonOf reads this before WHY. */
const NUM2_OPEN: Partial<Record<HeroId, Record<string, number[]>>> = {
  foundry: { scrapcannon: [1, 2, 3, 4, 5, 6], rampart: [1, 2, 3, 4, 5, 6], dartgun: [10], spikegun: [10], swivel: [1, 2, 3, 4, 5, 6], bombard: [1, 2, 3, 4, 5, 6], siegegun: [1, 2, 3, 4, 5, 6], thunderer: [1, 2, 3, 4, 5, 6], escapement: [10], steambreech: [10] },
  bastion: { deckgun: [2, 3, 4], siegegun: [1], thunderer: [2, 3, 4], calibrate: [4], swivel: [4], steambreech: [4] },
  furnace: { calibrate: [3], scrapcannon: [3], rampart: [3], swivel: [3], deckgun: [3], siegegun: [3], thunderer: [3], escapement: [3], steambreech: [3] },
  weaver: { scrapcannon: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hailgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bombard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], railgun: [5], twintrigger: [8, 9, 10] },
};

/** The reason for each inert pair: by module, or by module and day range ([first, last, reason]) where it changes. */
type Why = Reason | [number, number, Reason][];
// 0.8.0 I1 (oracle 0cf9f46b9ce87750): + STEAM BREECH, a fire-rate core
// Y7b2 (the flip): + HOPPER, now only its chamber's +1/+2/+3 slots (its +0.5 s load time went): on every deck where it is
// inert its gun's chamber never fills (at most 1 load of 2, or 2 of 3), its belts bringing loads less often than it fires
const STARVED_GUNS = ["chamber", "calibrate", "escapement", "carronade", "deckgun", "swivel", "railgun", "siegegun", "thunderer", "bombard", "scrapcannon", "rampart", "steambreech", "hopper"];
// Y7b2 (the flip): release Y's payoff pieces (needsEngine). STEAM BREECH stays starved by default; its days with no PLATE
// on a gun that isn't starved are in WHY
const NEEDS_ENGINE = ["venom", "quench", "twingauge", "pincer", "platebreaker", "lodestone", "twinlatch", "twintrigger", "seamwelder", "drake"];
const byDefault = (id: string): Reason | undefined =>
  STARVED_GUNS.includes(id) ? "starved" : id === "spotter" ? "needsShock" : id === "twinneedle" ? "twinIntake" : id === "overclocker" ? "needsLaterRig"
    : id === "wardbell" || id === "mendingloom" ? "noFoeHits" // FLIP-X2: the sustain pieces
    : NEEDS_ENGINE.includes(id) ? "needsEngine" : undefined; // Y7b2 (the flip): + the payoff pieces; BELLOWS (needsRide) left, live everywhere

export const WHY: Partial<Record<HeroId, Record<string, Why>>> = {
  // 0.8.0 B1 M2 (oracle 77741ac681b29a49): days 7-8 starved again, as before B1. M1's "work now" (oracle 60ce2081b6171361)
  // was FUSE_MULT 1.3's kill edge: the deck killed the quiet foe on the clock's last shot (0.0 hull left on day 7), so a
  // swap moved the kill, not a shot of its own
  // NUM-1 (cap's oracle 3cf09080186f8f84): every pair the num1 re-pin added is num1Open (the old days keep their reasons)
  // NUM-2 (cap's oracle 3cf09080186f8f84): the num1Open days classified against the base 11fbc6a (W/output-num2/deadaudit):
  // sub-point or kill edge take the physics reason; lost days stay num1Open. Kill edges (bb-0.8.7 units, the quiet foe's
  // 240 hull; base deck vs bought deck, seed 20210924, 18 s clock):
  // - ESCAPEMENT day 9 (gear on starved gun 1): 18 vs 18 shots, killed at 16.97 vs 16.90 s, -6.15 vs -5.71 hull left
  // - STEAM BREECH day 9 (core on starved gun 1): 18 vs 18 shots, killed at 16.97 vs 16.90 s, -6.15 vs -5.71 hull left
  // Y7b2 (the flip): day 9 is inert again for DART GUN and SPIKE GUN in place of gun 1 (starved, as days 7-8: 11 loads, 10
  // shots, none waiting, in 18 s), and ESCAPEMENT and STEAM BREECH read their NUM-2 day-9 entries (starved; both guns
  // starved, no PLATE on the deck). SPIKE GUN's day 9 was num1Open, unread while live. RAIL GUN's [3, 4] num1Open entry is
  // dropped: day 3 turned live (day 4 has been live since NUM-2)
  foundry: { dartgun: [[1, 6, "oneIntake"], [7, 8, "starved"], [9, 9, "starved"]], spikegun: [[1, 6, "oneIntake"], [7, 8, "starved"], [9, 9, "starved"]], hailgun: "oneIntake",
    twinneedle: [[1, 1, "starved"], [2, 6, "num1Open"]], calibrate: [[1, 8, "starved"], [9, 9, "num1Open"]],
    railgun: [[1, 1, "starved"], [6, 6, "num1Open"]], escapement: [[1, 8, "starved"], [9, 9, "starved"]],
    steambreech: [[1, 8, "starved"], [9, 9, "starved"]] },
  bastion: { longcase: "shortRide", dartgun: "oneIntake", spikegun: "oneIntake", hailgun: "oneIntake", stoker: "gunFull", // 0.8.0 I1: STOKER
    scrapcannon: "num1Open", deckgun: [[1, 1, "num1Open"], [5, 6, "starved"], [10, 10, "num1Open"]], thunderer: "num1Open",
    siegegun: [[2, 3, "num1Open"], [4, 4, "starved"]], rampart: "starved", grease: "stampPaced",
    spikerail: "noRoom" }, // SHAPES-1 flip
  // Y7b2 (the flip): STEAM BREECH on days 1-2 and 7-10, new, needsEngine (no PLATE on the deck; its gun isn't starved:
  // CALIBRATION is live there); its old days keep their reasons (was [[4, 5, "starved"], [6, 10, "num1Open"]])
  furnace: { longhaul: "needsPriorHits", dartgun: "oneIntake", spikegun: "oneIntake", hailgun: "oneIntake",
    calibrate: "num1Open", scrapcannon: [[4, 5, "starved"], [6, 10, "num1Open"]], rampart: [[4, 5, "starved"], [6, 10, "num1Open"]],
    swivel: "num1Open", deckgun: "num1Open", siegegun: "num1Open",
    thunderer: "num1Open", escapement: "starved", steambreech: [[1, 2, "needsEngine"], [4, 5, "starved"], [6, 6, "num1Open"], [7, 10, "needsEngine"]] },
  weaver: { longhaul: "needsPriorHits", dartgun: "starved", spikegun: "starved", grease: "mergeNoGain",
    carronade: [[1, 2, "starved"], [3, 10, "num1Open"]], swivel: [[1, 2, "starved"], [3, 10, "num1Open"]],
    deckgun: [[1, 2, "starved"], [3, 10, "num1Open"]], railgun: [[1, 2, "starved"], [3, 4, "starved"]],
    siegegun: [[1, 2, "starved"], [3, 10, "num1Open"]], thunderer: [[1, 2, "starved"], [3, 10, "num1Open"]] },
  // Y7b2 (the flip): the SWIVEL merge on day 7, new, starved (a turret's next star: 21 loads for 19 shots in 18 s, the gun
  // able to fire 34); STEAM BREECH on days 7-10, new, needsEngine (no PLATE; its gun backs up from day 8). Their days 1-6
  // keep num1Open (were "num1Open" on every day)
  metronome: { dartgun: "oneIntake", spikegun: "oneIntake", hailgun: "oneIntake",
    calibrate: "num1Open", rampart: "num1Open", swivel: [[1, 6, "num1Open"], [7, 7, "starved"]], deckgun: [[1, 4, "num1Open"], [5, 6, "starved"], [7, 7, "num1Open"]],
    siegegun: "num1Open", thunderer: "starved",
    steambreech: [[1, 6, "num1Open"], [7, 10, "needsEngine"]], scrapcannon: "num1Open", bombard: "num1Open" },
  // 0.8.0 B1 M1 (oracle 60ce2081b6171361): the reference deck works the ECHO belt and keeps CALIBRATION off its starved
  // gun 0, so LONG HAUL (echoBelt) and TWIN TRIGGER (laterGun) are no longer inert
  // NUM-2 kill edges, RAIL GUN in place of starved gun 0's SPIKE GUN (base deck vs bought deck, seed 20210924, 32 s clock):
  // - day 7: 17 vs 17 shots, killed at 23.32 vs 23.27 s, -2.37 vs -2.05 hull left
  // - day 8: 17 vs 17 shots, killed at 23.32 vs 23.27 s, -11.77 vs -11.45 hull left
  // - day 10: 15 vs 15 shots, killed at 20.98 vs 20.93 s, -1.67 vs -1.39 hull left
  // Y7b2 (the flip): RAIL GUN inert again on days 4-7 and 9-10 in place of either gun (both starved: as many shots as loads,
  // none waiting); day 4 takes starved, the rest read their NUM-2 entries (day 8 is live)
  siphon: { dartgun: "starved", spikegun: "starved", hailgun: [[1, 1, "starved"], [2, 5, "starved"], [6, 10, "num1Open"]],
    scrapcannon: [[1, 1, "starved"], [2, 10, "num1Open"]], rampart: [[1, 1, "starved"], [2, 10, "num1Open"]],
    carronade: [[1, 1, "starved"], [2, 10, "num1Open"]], swivel: [[1, 1, "starved"], [2, 10, "num1Open"]],
    deckgun: [[1, 1, "starved"], [2, 10, "num1Open"]], railgun: [[1, 1, "starved"], [2, 3, "starved"], [4, 4, "starved"], [5, 10, "starved"]],
    bombard: [[1, 1, "starved"], [2, 10, "num1Open"]], siegegun: [[1, 1, "starved"], [2, 10, "num1Open"]],
    thunderer: [[1, 1, "starved"], [2, 10, "num1Open"]] },
};

/** The reason an inert pair has (undefined: none recorded, which the test treats as a failure). */
export function reasonOf(hero: HeroId, id: string, day: number): Reason | undefined {
  if (NUM2_OPEN[hero]?.[id]?.includes(day)) return "num2Open"; // NUM-2: SPEED's open pairs first
  const w = WHY[hero]?.[id];
  if (typeof w === "string") return w;
  if (Array.isArray(w)) return w.find(([a, b]) => day >= a && day <= b)?.[2];
  return byDefault(id);
}
