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
  | "gunFull";
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
};

/** The inert pairs: hero, module, its days (ascending), as the audit finds them on the reference decks. */
// 0.8.0 I1 M2 (wave 3 joins the audit; oracle 0cf9f46b9ce87750): STEAM BREECH starved on FOUNDRY 1-8, WEAVER and SIPHON
// 1-10; STOKER gunFull on BASTION 5-10; TWIN TRIGGER laterGun on SIPHON 4-10. Every other pin is H1's, unchanged.
// 0.8.0 B1 M1 (oracle 60ce2081b6171361): FOUNDRY, BASTION and SIPHON re-pinned from the audit's rows after the reference
// decks kept their mirrored rigs (src/sim/races/refBuilds.ts); FURNACE, WEAVER and METRONOME unchanged.
export const INERT: Record<HeroId, Record<string, number[]>> = {
  foundry: { chamber: [1, 2, 3, 4, 5, 6], calibrate: [1, 2, 3, 4, 5, 6], spotter: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], dartgun: [1, 2, 3, 4, 5, 6], spikegun: [1, 2, 3, 4, 5, 6], carronade: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], twinneedle: [1], hailgun: [1, 2, 3, 4, 5, 6], deckgun: [1, 2, 3, 4, 5, 6], escapement: [1, 2, 3, 4, 5, 6, 10], steambreech: [1, 2, 3, 4, 5, 6, 10], bellows: [6, 7, 8, 9, 10] },
  bastion: { bellows: [1], spotter: [1, 2, 3, 4, 5, 6, 7], longcase: [2, 3, 4], overclocker: [5, 10], dartgun: [5, 6, 7, 8, 9, 10], spikegun: [5, 6, 7, 8, 9, 10], hailgun: [5, 6, 7, 8, 9, 10], stoker: [5, 6, 7, 8, 9, 10] },
  furnace: { longhaul: [1], overclocker: [1], bellows: [1], spotter: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], bombard: [1, 2, 3, 4, 5], dartgun: [6, 7, 8, 9, 10], spikegun: [6, 7, 8, 9, 10], hailgun: [6, 7, 8, 9, 10] },
  weaver: { longhaul: [1], overclocker: [1, 2], chamber: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], calibrate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spotter: [1, 2, 3], dartgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spikegun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], carronade: [1, 2], swivel: [1, 2], twinneedle: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], deckgun: [1, 2], railgun: [1, 2], siegegun: [1, 2], thunderer: [1, 2], escapement: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], grease: [2, 3, 4, 5, 6], steambreech: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  metronome: { spotter: [1, 2, 3], dartgun: [5, 6, 7, 8, 9, 10], spikegun: [5, 6, 7, 8, 9, 10], hailgun: [5, 6, 7, 8, 9, 10] },
  siphon: { chamber: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], calibrate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spotter: [1, 2], scrapcannon: [1], rampart: [1], dartgun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], spikegun: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], carronade: [1], swivel: [1], twinneedle: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hailgun: [1], deckgun: [1], railgun: [1], bombard: [1], siegegun: [1], thunderer: [1], escapement: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], steambreech: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
};

/** The reason for each inert pair: by module, or by module and day range ([first, last, reason]) where it changes. */
type Why = Reason | [number, number, Reason][];
// 0.8.0 I1 (oracle 0cf9f46b9ce87750): + STEAM BREECH, a fire-rate core
const STARVED_GUNS = ["chamber", "calibrate", "escapement", "carronade", "deckgun", "swivel", "railgun", "siegegun", "thunderer", "bombard", "scrapcannon", "rampart", "steambreech"];
const byDefault = (id: string): Reason | undefined =>
  STARVED_GUNS.includes(id) ? "starved" : id === "spotter" ? "needsShock" : id === "twinneedle" ? "twinIntake" : id === "overclocker" ? "needsLaterRig"
    : id === "bellows" ? "needsRide" : undefined;

export const WHY: Partial<Record<HeroId, Record<string, Why>>> = {
  // 0.8.0 B1 M1 (oracle 60ce2081b6171361): the reference deck's DART and SPIKE GUN days 7-8 work now, so oneIntake alone
  foundry: { dartgun: [[1, 6, "oneIntake"]], spikegun: [[1, 6, "oneIntake"]], hailgun: "oneIntake", twinneedle: "starved" },
  bastion: { longcase: "shortRide", dartgun: "oneIntake", spikegun: "oneIntake", hailgun: "oneIntake", stoker: "gunFull" }, // 0.8.0 I1: STOKER
  furnace: { longhaul: "needsPriorHits", dartgun: "oneIntake", spikegun: "oneIntake", hailgun: "oneIntake" },
  weaver: { longhaul: "needsPriorHits", dartgun: "starved", spikegun: "starved", grease: "mergeNoGain" },
  metronome: { dartgun: "oneIntake", spikegun: "oneIntake", hailgun: "oneIntake" },
  // 0.8.0 B1 M1 (oracle 60ce2081b6171361): the reference deck works the ECHO belt and keeps CALIBRATION off its starved
  // gun 0, so LONG HAUL (echoBelt) and TWIN TRIGGER (laterGun) are no longer inert
  siphon: { dartgun: "starved", spikegun: "starved", hailgun: "starved" },
};

/** The reason an inert pair has (undefined: none recorded, which the test treats as a failure). */
export function reasonOf(hero: HeroId, id: string, day: number): Reason | undefined {
  const w = WHY[hero]?.[id];
  if (typeof w === "string") return w;
  if (Array.isArray(w)) return w.find(([a, b]) => day >= a && day <= b)?.[2];
  return byDefault(id);
}
