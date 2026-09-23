// races: content data for the new heroes (docs/RACES.md). content.ts registers these tables.
// Only TYPE imports from content.ts here: content.ts imports this file, so a value import
// would create an evaluation cycle.

import type { AmmoDef, HeroDef, ItemDef } from "../content";

export type RaceHeroId = "foundry" | "bastion";
export type RaceAmmoKind = "blank" | "alloy" | "bulwark";

export const RACE_ITEMS: Record<string, ItemDef> = {
  crucible: {
    id: "crucible", name: "CRUCIBLE", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["POURS TWIN ALLOY", "BLANKS. TWO THAT MEET", "AT ONE GUN FUSE."],
    factory: { ammo: "blank", interval: 1.6, outputs: 2 },
  },
  wardworks: {
    id: "wardworks", name: "WARDWORKS", kind: "factory", rarity: "epic", price: 0, size: 2,
    desc: ["STAMPS BULWARK SLUGS.", "EACH ONE PLATES THE", "HULL AS IT ARRIVES."],
    factory: { ammo: "bulwark", interval: 1.5, outputs: 1 },
  },
};

export const RACE_AMMO: Record<RaceAmmoKind, AmmoDef> = {
  blank: { name: "ALLOY BLANK", base: 3, rideScale: 0, fray: 0 },
  // A fused slug carries its whole damage in `flat` (1.5 x both blanks), so base is 0.
  alloy: { name: "ALLOY SLUG", base: 0, rideScale: 0, fray: 0 },
  bulwark: { name: "BULWARK SLUG", base: 4, rideScale: 0, fray: 0 },
};

export const RACE_HEROES: Record<RaceHeroId, HeroDef> = {
  foundry: {
    id: "foundry", name: "FOUNDRY", faction: "human", factionName: "HUMAN GUILDS",
    hull: 190, factory: "crucible", ammo: "blank", belt: 18,
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
    turrets: [{ col0: 4, width: 2, connectors: [4, 5], kind: "heavy", fireInterval: 1.2, window: 3, flight: 0.65 }],
    blurb: ["BULWARK SLUGS PLATE", "THE HULL AS THEY", "REACH THE CHAMBER."],
    pattern: "PLATE AND ENDURE",
  },
};

export const isRaceHero = (id: string): id is RaceHeroId => id in RACE_HEROES;
