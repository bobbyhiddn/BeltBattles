// races: content data for the new heroes (docs/RACES.md). content.ts registers these tables.
// Only TYPE imports from content.ts here: content.ts imports this file, so a value import
// would create an evaluation cycle.

import type { AmmoDef, Faction, HeroDef, HeroId, ItemDef } from "../content";

export type RaceHeroId = "foundry" | "bastion" | "metronome" | "siphon";
export type RaceAmmoKind = "blank" | "alloy" | "bulwark" | "pendulum" | "leechDrag" | "leechEcho";

/** METRONOME pendulum curve (docs/RACES.md §3): 4 + 4 x max(0, 1 - |ride - 4.2| / 4.0). */
export const PENDULUM = { floor: 4, swing: 4, peak: 4.2, spread: 4.0 } as const;

export function pendulumCurve(ride: number): number {
  return PENDULUM.floor + PENDULUM.swing * Math.max(0, 1 - Math.abs(ride - PENDULUM.peak) / PENDULUM.spread);
}

export const RACE_ITEMS: Record<string, ItemDef> = {
  crucible: {
    id: "crucible", name: "CRUCIBLE", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["POURS TWIN ALLOY", "BLANKS. TWO THAT MEET", "AT ONE GUN FUSE."],
    factory: { ammo: "blank", interval: 1.6, outputs: 2 },
  },
  wardworks: {
    id: "wardworks", name: "WARDWORKS", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["STAMPS BULWARK SLUGS.", "EACH ONE PLATES THE", "HULL AS IT ARRIVES."],
    factory: { ammo: "bulwark", interval: 1.1, outputs: 1 },
  },
  clockworks: {
    id: "clockworks", name: "CLOCKWORKS", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["STAMPS PENDULUM SLUGS.", "THEY PEAK AFTER 4.2S", "OF RIDE: 10 TILES."],
    factory: { ammo: "pendulum", interval: 1.3, outputs: 1 },
  },
  sump: {
    id: "sump", name: "SUMP", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["LEECH SLUGS: DRAG FOR", "THE LEFT GUN, ECHO", "FOR THE RIGHT GUN."],
    factory: { ammo: "leechDrag", interval: 1.1, outputs: 2 },
  },
  // Dormant pendulum modules. They gain a merchant only when useful on every hero's ammo.
  // Priced like CALIBRATION (rare, 5 g): a comparable single-gun upgrade.
  escapement: {
    id: "escapement", name: "ESCAPEMENT", kind: "mod", rarity: "rare", price: 5, size: 1,
    desc: ["PENDULUM PEAK 1.2S", "EARLIER: BEST ON A", "7-TILE ROUTE."],
    mod: {},
  },
  longcase: {
    id: "longcase", name: "LONGCASE", kind: "mod", rarity: "rare", price: 5, size: 1,
    desc: ["PENDULUM PEAK 1.2S", "LATER: BEST ON A", "13-TILE ROUTE."],
    mod: {},
  },
};

export const RACE_AMMO: Record<RaceAmmoKind, AmmoDef> = {
  blank: { name: "ALLOY BLANK", base: 3.5, rideScale: 0, fray: 0 },
  // A fused slug carries its whole damage in `flat` (FUSE_MULT x both blanks), so base is 0.
  alloy: { name: "ALLOY SLUG", base: 0, rideScale: 0, fray: 0 },
  bulwark: { name: "BULWARK SLUG", base: 5, rideScale: 0, fray: 0 },
  // base is the curve's floor, for display; rideCurve replaces base + rideScale x ride.
  pendulum: { name: "PENDULUM SLUG", base: PENDULUM.floor, rideScale: 0, fray: 0, rideCurve: pendulumCurve },
  // One leech, two marks: the Sump stamps the mark into the ammo kind, so Splitter copies keep it.
  leechDrag: { name: "LEECH SLUG: DRAG", base: 5, rideScale: 0, fray: 0 },
  leechEcho: { name: "LEECH SLUG: ECHO", base: 5, rideScale: 0, fray: 0 },
};

export const RACE_HEROES: Record<RaceHeroId, HeroDef> = {
  foundry: {
    id: "foundry", name: "FOUNDRY", faction: "human", factionName: "HUMAN GUILDS",
    hull: 250, factory: "crucible", ammo: "blank", belt: 18,
    turrets: [
      { col0: 2, width: 2, connectors: [2, 3], kind: "medium", fireInterval: 0.8, window: 2, flight: 0.45 },
      { col0: 6, width: 2, connectors: [6, 7], kind: "medium", fireInterval: 0.8, window: 2, flight: 0.45 },
    ],
    blurb: ["TWIN BLANKS THAT REACH", "ONE GUN TOGETHER FUSE", "INTO ALLOY SLUGS."],
    pattern: "SYNC TO FUSE",
  },
  bastion: {
    id: "bastion", name: "BASTION", faction: "dwarf", factionName: "DWARVEN HOLDS",
    hull: 240, factory: "wardworks", ammo: "bulwark", belt: 14,
    turrets: [{ col0: 4, width: 2, connectors: [4, 5], kind: "heavy", fireInterval: 0.75, window: 3, flight: 0.65 }],
    blurb: ["BULWARK SLUGS PLATE", "THE HULL AS THEY", "REACH THE CHAMBER."],
    pattern: "PLATE AND ENDURE",
  },
  metronome: {
    id: "metronome", name: "METRONOME", faction: "beastfolk", factionName: "BEASTFOLK PACKS",
    hull: 210, factory: "clockworks", ammo: "pendulum", belt: 20,
    turrets: [{ col0: 4, width: 2, connectors: [4, 5], kind: "adaptable", fireInterval: 0.7, window: 3, flight: 0.55 }],
    blurb: ["PENDULUM SLUGS HIT", "HARDEST AFTER 10 TILES.", "NOTHING SPEEDS ITS BELTS."],
    pattern: "HIT THE BEAT",
  },
  siphon: {
    id: "siphon", name: "SIPHON", faction: "unaligned", factionName: "SUMP DRIFTERS",
    hull: 220, factory: "sump", ammo: "leechDrag", belt: 20,
    turrets: [
      { col0: 1, width: 2, connectors: [2], kind: "light", fireInterval: 0.6, window: 2, flight: 0.34 },
      { col0: 7, width: 2, connectors: [7], kind: "light", fireInterval: 0.6, window: 2, flight: 0.34 },
    ],
    blurb: ["DRAG SLOWS THEIR BELTS.", "ECHO COPIES THE LAST", "HIT THAT STRUCK YOU."],
    pattern: "BLEED THEIR LINE",
  },
};

export const isRaceHero = (id: string): id is RaceHeroId => id in RACE_HEROES;

/** Hero rule flags kept out of HeroDef (rulings 4 and 6). */
export interface HeroRules {
  freeModuleSwap: boolean; // may unmount/remount turret modules freely between days (spec §13)
  speedLock: boolean; // every belt runs at 1x: speed gates and enemy Drag have no effect
}

const NO_RULES: HeroRules = { freeModuleSwap: false, speedLock: false };

export const HERO_RULES: Partial<Record<HeroId, HeroRules>> = {
  metronome: { freeModuleSwap: true, speedLock: true },
};

export function heroRules(hero: HeroId): HeroRules {
  return HERO_RULES[hero] ?? NO_RULES;
}

/**
 * Dormant items (REQ-BFG-021: one shared pool, no dead offers). ESCAPEMENT and LONGCASE move only pendulum slugs, so no
 * merchant sells them until they gain an effect on other ammo; then they join the one shared pool like every part.
 * No faction pools. Neither item counts as buyable until it has a cross-hero effect.
 */
export const DORMANT_ITEMS: ReadonlySet<string> = new Set(["escapement", "longcase"]);

/** Pendulum sweet-spot shift (s) per turret module. It moves pendulum slugs only. */
export const PEAK_SHIFT: Record<string, number> = { escapement: -1.2, longcase: 1.2 };

/** Adaptable turret head art, display only: no beastfolk module = HAMMER. */
export type AdaptableHead = "hammer" | "repeater" | "lance";
export const ADAPTABLE_HEAD: Record<string, AdaptableHead> = { escapement: "repeater", longcase: "lance" };
