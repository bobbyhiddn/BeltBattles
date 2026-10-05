// races: content data for the new heroes (docs/RACES.md). content.ts registers these tables.
// Only TYPE imports from content.ts here: content.ts imports this file, so a value import
// would create an evaluation cycle.

import type { AmmoDef, HeroDef, HeroId, ItemDef } from "../content";

export type RaceHeroId = "foundry" | "bastion" | "metronome" | "siphon";
export type RaceAmmoKind = "blank" | "alloy" | "bulwark" | "pendulum" | "leechDrag" | "leechEcho";

/** METRONOME pendulum curve (docs/RACES.md §3): 4 + 4 x max(0, 1 - |ride - 4.2| / 4.0). */
export const PENDULUM = { floor: 40, swing: 40, peak: 4.2, spread: 4.0 } as const;

export function pendulumCurve(ride: number): number {
  return PENDULUM.floor + PENDULUM.swing * Math.max(0, 1 - Math.abs(ride - PENDULUM.peak) / PENDULUM.spread);
}

export const RACE_ITEMS: Record<string, ItemDef> = {
  crucible: {
    id: "crucible", name: "CRUCIBLE", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["POURS TWIN ALLOY", "BLANKS. TWO THAT MEET", "AT ONE GUN FUSE."],
    // bb-0.8.3 (REQ-BFG-043, REQ-BFG-044 D10, D4): FACTORY upgrade levels 1-4 (2 / 3 / 4 / 5 belt slots; content.ts's
    // signature note: the cycle on the house's curve, the base its level-1 one); a pour of 2 at every level (the fuse
    // needs a pair): with more belts each cast takes 2 of them in turn
    factory: { ammo: "blank", speed: 19, pour: 2 }, // base 3.5: the blank's
    levels: { 2: { factory: { speed: 24 } }, 3: { factory: { speed: 29 } }, 4: { factory: { speed: 34 } } },
  },
  wardworks: {
    id: "wardworks", name: "WARDWORKS", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["STAMPS BULWARK SLUGS.", "EACH ONE PLATES THE", "HULL AS IT ARRIVES."],
    factory: { ammo: "bulwark", speed: 27 }, // base 5: the bulwark slug's; bb-0.8.3 (D10): its cycle on the house's curve
    levels: { 2: { factory: { speed: 34 } }, 3: { factory: { speed: 41 } }, 4: { factory: { speed: 48 } } },
  },
  clockworks: {
    id: "clockworks", name: "CLOCKWORKS", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["STAMPS PENDULUM SLUGS.", "THEY PEAK AFTER", "10 TILES OF RIDE."],
    // bb-0.8.3 (D10): FACTORY levels on the house's curve, interval only: the pendulum's curve replaces a slug's base
    factory: { ammo: "pendulum", speed: 23 },
    levels: { 2: { factory: { speed: 29 } }, 3: { factory: { speed: 35 } }, 4: { factory: { speed: 41 } } },
  },
  sump: {
    id: "sump", name: "SUMP", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["LEECH SLUGS: DRAG FOR", "THE LEFT GUN, ECHO", "FOR THE RIGHT GUN."],
    factory: { ammo: "leechDrag", speed: 27 }, // base 5: the leech slug's; bb-0.8.3 (D10): its cycle on the house's curve
    levels: { 2: { factory: { speed: 34 } }, 3: { factory: { speed: 41 } }, 4: { factory: { speed: 48 } } },
  },
  // Timing gear joins the same merchant pool as every other module. Priced like CALIBRATION.
  escapement: {
    id: "escapement", name: "ESCAPEMENT", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "gunsmith",
    desc: ["FIRES 11% FASTER.", "PENDULUM SLUGS PEAK", "EARLIER: 7 TILES."], tags: ["TEMPO"],
    mod: { fireRate: 11 },
    levels: { 2: { mod: { fireRate: 16 }, perk: "QUICK TICK" }, 3: { mod: { fireRate: 22 }, perk: "FAST TICK" } },
  },
  longcase: {
    id: "longcase", name: "LONGCASE", kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "gunsmith",
    desc: ["OTHER SLUGS: +15", "DMG AFTER 2S RIDE.", "PENDULUMS PEAK LATER."], tags: ["FORGE", "TEMPO"],
    mod: { longRideFlat: 15, longRideMin: 2 },
    levels: { 2: { mod: { longRideFlat: 25 }, perk: "DEEP WIND" }, 3: { mod: { longRideFlat: 40 }, perk: "FULL WIND" } },
  },
};

export const RACE_AMMO: Record<RaceAmmoKind, AmmoDef> = {
  blank: { name: "ALLOY BLANK", base: 35, rideScale: 0, fray: 0 },
  // A fused slug carries its whole damage in `flat` (FUSE_MULT x both blanks), so base is 0.
  alloy: { name: "ALLOY SLUG", base: 0, rideScale: 0, fray: 0 },
  bulwark: { name: "BULWARK SLUG", base: 50, rideScale: 0, fray: 0 },
  // base is the curve's floor, for display; rideCurve replaces base + rideScale x ride.
  pendulum: { name: "PENDULUM SLUG", base: PENDULUM.floor, rideScale: 0, fray: 0, rideCurve: pendulumCurve },
  // One leech, two marks: the Sump stamps the mark into the ammo kind, so Splitter copies keep it.
  leechDrag: { name: "LEECH SLUG: DRAG", base: 50, rideScale: 0, fray: 0 },
  leechEcho: { name: "LEECH SLUG: ECHO", base: 50, rideScale: 0, fray: 0 },
};

export const RACE_HEROES: Record<RaceHeroId, HeroDef> = {
  foundry: {
    id: "foundry", name: "FOUNDRY", faction: "human", factionName: "HUMAN GUILDS",
    hull: 2250, factory: "crucible", ammo: "blank", belt: 18,
    turrets: [
      { col0: 2, width: 2, connectors: [2, 3], kind: "medium", speed: 38, window: 2, flight: 0.45 },
      { col0: 6, width: 2, connectors: [6, 7], kind: "medium", speed: 38, window: 2, flight: 0.45 },
    ],
    blurb: ["TWIN BLANKS THAT REACH", "ONE GUN TOGETHER FUSE", "INTO ALLOY SLUGS."],
    pattern: "SYNC TO FUSE",
  },
  bastion: {
    id: "bastion", name: "BASTION", faction: "dwarf", factionName: "DWARVEN HOLDS",
    hull: 2150, factory: "wardworks", ammo: "bulwark", belt: 14,
    turrets: [{ col0: 4, width: 2, connectors: [4, 5], kind: "heavy", speed: 40, window: 3, flight: 0.65 }],
    blurb: ["BULWARK SLUGS PLATE", "THE HULL AS THEY", "REACH THE CHAMBER."],
    pattern: "PLATE AND ENDURE",
  },
  metronome: {
    id: "metronome", name: "METRONOME", faction: "beastfolk", factionName: "BEASTFOLK PACKS",
    hull: 2100, factory: "clockworks", ammo: "pendulum", belt: 20,
    turrets: [{ col0: 4, width: 2, connectors: [4, 5], kind: "adaptable", speed: 43, window: 3, flight: 0.55 }],
    blurb: ["PENDULUM SLUGS HIT", "HARDEST AFTER 10 TILES.", "NOTHING SPEEDS ITS BELTS."],
    pattern: "HIT THE BEAT",
  },
  siphon: {
    id: "siphon", name: "SIPHON", faction: "unaligned", factionName: "SUMP DRIFTERS",
    hull: 2200, factory: "sump", ammo: "leechDrag", belt: 20,
    turrets: [
      { col0: 1, width: 2, connectors: [2], kind: "light", speed: 50, window: 2, flight: 0.34 },
      { col0: 7, width: 2, connectors: [7], kind: "light", speed: 50, window: 2, flight: 0.34 },
    ],
    blurb: ["DRAG SLOWS THEIR BELTS.", "ECHO COPIES THE LAST", "HIT THAT STRUCK YOU."],
    pattern: "BLEED THEIR LINE",
  },
};

export const isRaceHero = (id: string): id is RaceHeroId => id in RACE_HEROES;

/** Hero rule flags kept out of HeroDef (rulings 4 and 6). */
export interface HeroRules {
  freeModuleSwap: boolean; // may unmount/remount turret modules freely between days (spec §13)
  speedLock: boolean; // every belt runs at 1x: speed rigs pay lockedFlat damage instead; enemy Drag and slows do nothing
}

const NO_RULES: HeroRules = { freeModuleSwap: false, speedLock: false };

export const HERO_RULES: Partial<Record<HeroId, HeroRules>> = {
  metronome: { freeModuleSwap: true, speedLock: true },
};

export function heroRules(hero: HeroId): HeroRules {
  return HERO_RULES[hero] ?? NO_RULES;
}

/** Prototypes without a useful cross-hero effect are excluded from every source of offers. */
// FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER is dormant. R1's STUN fold removed CHILL and SNAG, and no piece gives SAP, the one
// mark left, so its ★1 and ★2 do nothing in play (the dead-offer audit found it inert on every hero, days 1-10). A new job
// for it is a release-Y design idea. Its ITEMS entry stays (old decks and the captains' fixed plans may hold it).
export const DORMANT_ITEMS: ReadonlySet<string> = new Set(["sifter"]);

/** Pendulum sweet-spot shift (s) per turret module. It moves pendulum slugs only. */
export const PEAK_SHIFT: Record<string, number> = { escapement: -1.2, longcase: 1.2 };

/** Adaptable turret head art, display only: the timing gear on that turret picks the head; without it, HAMMER. */
export type AdaptableHead = "hammer" | "repeater" | "lance";
export const ADAPTABLE_HEAD: Record<string, AdaptableHead> = { escapement: "repeater", longcase: "lance" };
