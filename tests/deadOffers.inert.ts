// 0.8.0 H1 M4 (REQ-BFG-021, acceptance 3 and 5): the inert pairs the dead-offer audit finds (tests/deadOffers.*.test.ts,
// machinery in deadOffers.helpers.ts). For each hero: each buyable module that changes no battle metric on that hero's
// reference deck on some days, wherever it is sensibly placed, with the reason. output-H1/REPORT.md lists each with a
// proposed fix. No module changes in H1. Not a test file.

import type { HeroId } from "../src/sim/content";

/** Why a module does nothing on a deck. */
export type Reason =
  | "starved" | "oneIntake" | "twinIntake" | "needsShock" | "needsPriorHits" | "needsLaterRig" | "needsRide"
  | "shortRide" | "mergeNoGain"
  // 0.8.0 I1 M2 (wave 3 joins the audit; oracle 0cf9f46b9ce87750)
  | "gunFull"
  // NUM-1 (REQ-BFG-047; cap's oracle 3cf09080186f8f84): a pair the whole numbers made inert, open until classified
  | "num1Open";
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
  needsRide: "BELLOWS adds a Burn stack for each 2.5 seconds the payload has ridden, and no spot on this deck's belts comes that late in the ride.",
  shortRide: "LONGCASE adds damage to slugs that rode at least 2 seconds, and from day 2 BASTION's GREASE WORKS gets its bulwark slugs to the gun sooner.",
  mergeNoGain: "The copy merges into WEAVER's GREASE WORKS (2 stars: 2.3 times as fast); its threads reach that gun 0.3 seconds sooner, but the LOOM's pace sets how many shots it fires, and another gun fires first.",
  // 0.8.0 I1 M2 (oracle 0cf9f46b9ce87750): BASTION days 5-10, every stoke spot: the WARDWORKS and the STAMP PRESS both
  // feed gun 0, which takes every load it can (17 and 13 stamps in 18 s with and without it on days 5 and 8; 15 and 12
  // on day 10), and the gun cap (oracle a0e94bc69949561f) binds
  gunFull: "STOKER's factories already feed their gun as fast as it takes loads, and a stoke never makes a factory outrun its gun, so it adds no stamp.",
  num1Open: "NUM-1's whole numbers: on bb-0.8.7's rules this part moved a battle metric on this deck, on num1's it moves none. Open until it is classified against the base (oracle 3cf09080186f8f84).",
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
export const INERT: Record<HeroId, Record<string, number[]>> = {
  foundry: { chamber: [1, 2, 3, 4, 5, 6], calibrate: [1, 2, 3, 4, 5, 6, 7, 8, 9], spotter: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], dartgun: [1, 2, 3, 4, 5, 6, 7, 8], spikegun: [1, 2, 3, 4, 5, 6, 7, 8, 9], carronade: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], twinneedle: [1, 2, 3, 4, 5, 6], hailgun: [1, 2, 3, 4, 5, 6], deckgun: [1, 2, 3, 4, 5, 6], railgun: [1, 3, 4, 6], escapement: [1, 2, 3, 4, 5, 6, 7, 8, 9], steambreech: [1, 2, 3, 4, 5, 6, 7, 8, 9], bellows: [6, 7, 8, 10] },
  bastion: { bellows: [1], spotter: [1, 2, 3, 4, 5, 6, 7], scrapcannon: [1, 2, 3], deckgun: [1, 5, 6, 10], thunderer: [1], siegegun: [2, 3, 4], longcase: [2, 3, 4], rampart: [4], grease: [5, 6], overclocker: [5, 10], dartgun: [5, 6, 7, 8, 9, 10], spikegun: [5, 6, 7, 8, 9, 10], hailgun: [5, 6, 7, 8, 9, 10], stoker: [5, 6, 7, 8, 9, 10] },
  furnace: { longhaul: [1], overclocker: [1], bellows: [1], spotter: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bombard: [1, 2, 3, 4, 5], calibrate: [4, 5, 6, 7, 8, 9, 10], scrapcannon: [4, 5, 6, 7, 8, 9, 10], rampart: [4, 5, 6, 7, 8, 9, 10], swivel: [4, 5, 6, 7, 8, 9, 10], deckgun: [4, 5, 7, 8, 9, 10], siegegun: [4, 5], thunderer: [4, 5], escapement: [4, 5], steambreech: [4, 5, 6, 7, 8, 9, 10], dartgun: [6, 7, 8, 9, 10], spikegun: [6, 7, 8, 9, 10], hailgun: [6, 7, 8, 9, 10] },
  weaver: { longhaul: [1], overclocker: [1, 2], chamber: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], calibrate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spotter: [1, 2, 3], dartgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spikegun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], carronade: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], swivel: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], twinneedle: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], deckgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], railgun: [1, 2, 3, 4], siegegun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], thunderer: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], escapement: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], steambreech: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], grease: [2, 3, 4, 5, 6] },
  metronome: { calibrate: [1, 2, 5, 6], spotter: [1, 2, 3], rampart: [1, 2, 3, 4, 5, 6, 7], swivel: [1, 2, 3, 4, 5, 6], deckgun: [1, 2, 3, 4, 5, 6, 7], siegegun: [1, 2, 3, 4], thunderer: [1, 2, 3, 4], steambreech: [1, 2, 3, 4, 5, 6], scrapcannon: [3, 4], bombard: [3, 4], dartgun: [5, 6, 7, 8, 9, 10], spikegun: [5, 6, 7, 8, 9, 10], hailgun: [5, 6, 7, 8, 9, 10] },
  siphon: { chamber: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], calibrate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spotter: [1, 2], scrapcannon: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rampart: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], dartgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spikegun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], carronade: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], swivel: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], twinneedle: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hailgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], deckgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], railgun: [1, 2, 3, 5, 6, 7, 8, 9, 10], bombard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], siegegun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], thunderer: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], escapement: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], steambreech: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
};

/** The reason for each inert pair: by module, or by module and day range ([first, last, reason]) where it changes. */
type Why = Reason | [number, number, Reason][];
// 0.8.0 I1 (oracle 0cf9f46b9ce87750): + STEAM BREECH, a fire-rate core
const STARVED_GUNS = ["chamber", "calibrate", "escapement", "carronade", "deckgun", "swivel", "railgun", "siegegun", "thunderer", "bombard", "scrapcannon", "rampart", "steambreech"];
const byDefault = (id: string): Reason | undefined =>
  STARVED_GUNS.includes(id) ? "starved" : id === "spotter" ? "needsShock" : id === "twinneedle" ? "twinIntake" : id === "overclocker" ? "needsLaterRig"
    : id === "bellows" ? "needsRide" : undefined;

export const WHY: Partial<Record<HeroId, Record<string, Why>>> = {
  // 0.8.0 B1 M2 (oracle 77741ac681b29a49): days 7-8 starved again, as before B1. M1's "work now" (oracle 60ce2081b6171361)
  // was FUSE_MULT 1.3's kill edge: the deck killed the quiet foe on the clock's last shot (0.0 hull left on day 7), so a
  // swap moved the kill, not a shot of its own
  // NUM-1 (cap's oracle 3cf09080186f8f84): every pair the num1 re-pin added is num1Open (the old days keep their reasons)
  foundry: { dartgun: [[1, 6, "oneIntake"], [7, 8, "starved"]], spikegun: [[1, 6, "oneIntake"], [7, 8, "starved"], [9, 9, "num1Open"]], hailgun: "oneIntake",
    twinneedle: [[1, 1, "starved"], [2, 6, "num1Open"]], calibrate: [[1, 8, "starved"], [9, 9, "num1Open"]],
    railgun: [[1, 1, "starved"], [3, 4, "num1Open"], [6, 6, "num1Open"]], escapement: [[1, 8, "starved"], [9, 9, "num1Open"]],
    steambreech: [[1, 8, "starved"], [9, 9, "num1Open"]] },
  bastion: { longcase: "shortRide", dartgun: "oneIntake", spikegun: "oneIntake", hailgun: "oneIntake", stoker: "gunFull", // 0.8.0 I1: STOKER
    scrapcannon: "num1Open", deckgun: "num1Open", thunderer: "num1Open", siegegun: "num1Open", rampart: "num1Open", grease: "num1Open" },
  furnace: { longhaul: "needsPriorHits", dartgun: "oneIntake", spikegun: "oneIntake", hailgun: "oneIntake",
    calibrate: "num1Open", scrapcannon: "num1Open", rampart: "num1Open", swivel: "num1Open", deckgun: "num1Open", siegegun: "num1Open",
    thunderer: "num1Open", escapement: "num1Open", steambreech: "num1Open" },
  weaver: { longhaul: "needsPriorHits", dartgun: "starved", spikegun: "starved", grease: "mergeNoGain",
    carronade: [[1, 2, "starved"], [3, 10, "num1Open"]], swivel: [[1, 2, "starved"], [3, 10, "num1Open"]],
    deckgun: [[1, 2, "starved"], [3, 10, "num1Open"]], railgun: [[1, 2, "starved"], [3, 4, "num1Open"]],
    siegegun: [[1, 2, "starved"], [3, 10, "num1Open"]], thunderer: [[1, 2, "starved"], [3, 10, "num1Open"]] },
  metronome: { dartgun: "oneIntake", spikegun: "oneIntake", hailgun: "oneIntake",
    calibrate: "num1Open", rampart: "num1Open", swivel: "num1Open", deckgun: "num1Open", siegegun: "num1Open", thunderer: "num1Open",
    steambreech: "num1Open", scrapcannon: "num1Open", bombard: "num1Open" },
  // 0.8.0 B1 M1 (oracle 60ce2081b6171361): the reference deck works the ECHO belt and keeps CALIBRATION off its starved
  // gun 0, so LONG HAUL (echoBelt) and TWIN TRIGGER (laterGun) are no longer inert
  siphon: { dartgun: "starved", spikegun: "starved", hailgun: [[1, 1, "starved"], [2, 10, "num1Open"]],
    scrapcannon: [[1, 1, "starved"], [2, 10, "num1Open"]], rampart: [[1, 1, "starved"], [2, 10, "num1Open"]],
    carronade: [[1, 1, "starved"], [2, 10, "num1Open"]], swivel: [[1, 1, "starved"], [2, 10, "num1Open"]],
    deckgun: [[1, 1, "starved"], [2, 10, "num1Open"]], railgun: [[1, 1, "starved"], [2, 3, "num1Open"], [5, 10, "num1Open"]],
    bombard: [[1, 1, "starved"], [2, 10, "num1Open"]], siegegun: [[1, 1, "starved"], [2, 10, "num1Open"]],
    thunderer: [[1, 1, "starved"], [2, 10, "num1Open"]] },
};

/** The reason an inert pair has (undefined: none recorded, which the test treats as a failure). */
export function reasonOf(hero: HeroId, id: string, day: number): Reason | undefined {
  const w = WHY[hero]?.[id];
  if (typeof w === "string") return w;
  if (Array.isArray(w)) return w.find(([a, b]) => day >= a && day <= b)?.[2];
  return byDefault(id);
}
