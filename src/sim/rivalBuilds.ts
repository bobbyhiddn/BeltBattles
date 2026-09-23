// Rival captain decks (0.6.0 groundwork). Every rival is a real production build under the
// same rules as the player and the warlords (spec §19): its hero's own signature factory
// plus shop items only, belts drawn to free turret intakes, gates on belts, one piece of
// turret gear per turret, and supplies (belt crates, armor plating) paid for like a player.
// A plan is a base deck plus the upgrades the rival has bought by a given round.

import { HEROES, ITEMS, type HeroId } from "./content";
import { key, type Build, type ModPlacement, type Placed, type RouteDef } from "./deck";
import { warlordHull } from "./ai";
import type { RivalId } from "./rivals";

/** Belt cells from (x, y) following moves such as "L3U2" (U = toward the turrets, row 0). */
export function walk(x: number, y: number, moves = ""): number[] {
  const out = [key(x, y)];
  const re = /([UDLR])(\d*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(moves))) {
    const n = m[2] ? Number(m[2]) : 1;
    for (let i = 0; i < n; i++) {
      if (m[1] === "U") y--;
      else if (m[1] === "D") y++;
      else if (m[1] === "L") x--;
      else x++;
      out.push(key(x, y));
    }
  }
  return out;
}

type Belt = [x: number, y: number, moves: string];

export interface FactoryPlan {
  def: string;
  x: number;
  y: number;
  belts: Belt[];
}

export interface Upgrade {
  at: number; // first round the rival owns it
  gate?: [def: string, x: number, y: number];
  mod?: [def: string, turret: number];
  crates?: number; // belt crates bought (+4 belt each)
  plating?: number; // armor plating bought (+25 hull each)
}

export interface RivalPlan {
  hero: HeroId;
  factories: FactoryPlan[];
  crates: number; // belt crates the base deck needs
  upgrades: Upgrade[];
}

export interface RivalLoadout {
  build: Build;
  crates: number;
  plating: number;
  value: number; // gold a player would pay for the same deck, gear and supplies
}

const F = (def: string, x: number, y: number, ...belts: Belt[]): FactoryPlan => ({ def, x, y, belts });
const G = (at: number, def: string, x: number, y: number): Upgrade => ({ at, gate: [def, x, y] });
const M = (at: number, def: string, turret: number): Upgrade => ({ at, mod: [def, turret] });
const P = (at: number, n = 1): Upgrade => ({ at, plating: n });

export const PLANS: Record<RivalId, RivalPlan> = {
  // ---------------------------------------------------------------- act 1 (rounds 1-2)
  // SLOW COOKER: kiln at the back, one 13-tile serpentine so every slug cooks on the way.
  sootjaw: {
    hero: "furnace", crates: 0,
    factories: [F("kiln", 4, 7, [4, 6, "L3U2R2U2R1U2"])],
    upgrades: [G(2, "temper", 2, 6), G(3, "brake", 1, 5), G(4, "whetstone", 3, 3), G(5, "longhaul", 4, 1)],
  },
  // SHORT STITCH: loom parked right under the guns; stubby belts fire first.
  nettle: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 4, 1, [4, 0, ""], [3, 1, "L2U1"], [6, 1, "R2U1"])],
    upgrades: [G(2, "whetstone", 2, 1), G(3, "whetstone", 7, 1), G(4, "temper", 1, 1), G(5, "temper", 8, 1)],
  },
  // PRESS GANG: a stamp press beside the kiln fills the heavy turret's second intake.
  grubnose: {
    hero: "furnace", crates: 0,
    factories: [F("kiln", 3, 6, [4, 5, "U5"]), F("press", 6, 6, [6, 5, "L1U5"])],
    upgrades: [G(2, "whetstone", 5, 3), G(3, "temper", 4, 3), M(4, "calibrate", 0), G(5, "brake", 4, 5)],
  },
  // ACT 1 ELITE, FRAY STORM: split bolts up the middle, oiled and whetted side belts.
  mothqueen: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 4, 3, [4, 2, "U2"], [3, 3, "L2U3"], [6, 3, "R2U3"])],
    upgrades: [
      G(1, "splitter", 4, 2), G(1, "whetstone", 4, 1), G(1, "grease", 2, 3), G(1, "whetstone", 1, 1),
      G(1, "grease", 7, 3), G(1, "whetstone", 8, 1), P(1), G(4, "temper", 1, 2), G(5, "temper", 8, 2),
    ],
  },
  // ---------------------------------------------------------------- act 2 (rounds 4-6)
  // SHOCK TROOPER: galvanic coils at the end of both belts stall the enemy machinery.
  sparkfang: {
    hero: "furnace", crates: 1,
    factories: [F("kiln", 4, 6, [4, 5, "L2U3R2U2"]), F("press", 7, 6, [7, 5, "L2U5"])],
    upgrades: [
      G(4, "temper", 2, 4), G(4, "coil", 4, 1), G(4, "coil", 5, 3), G(5, "brake", 3, 2),
      M(6, "calibrate", 0), G(7, "whetstone", 5, 1), G(8, "longhaul", 4, 2),
    ],
  },
  // SPLITTER SWARM: splitters on both side belts, whetstones after them.
  lacewing: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 4, 4, [4, 3, "U3"], [3, 4, "L2U4"], [6, 4, "R2U4"])],
    upgrades: [
      G(4, "splitter", 2, 4), G(4, "splitter", 7, 4), G(5, "whetstone", 1, 2), G(6, "whetstone", 8, 2),
      G(7, "splitter", 4, 2), M(8, "calibrate", 1),
    ],
  },
  // OVERCLOCK: overdrive on the press belt and a calibrated gun, no waiting around.
  ratchet: {
    hero: "furnace", crates: 0,
    factories: [F("kiln", 2, 6, [3, 5, "R1U5"]), F("press", 6, 6, [6, 5, "L1U5"])],
    upgrades: [
      M(4, "calibrate", 0), G(4, "overdrive", 5, 4), G(4, "temper", 4, 4), G(5, "whetstone", 5, 2),
      G(6, "whetstone", 4, 2), G(7, "grease", 4, 5),
    ],
  },
  // EMBER WEAVE: a temper on every thread belt, so every hit burns.
  emberlyn: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 4, 5, [4, 4, "U4"], [3, 5, "L2U5"], [6, 5, "R2U5"])],
    upgrades: [
      G(4, "temper", 4, 3), G(4, "temper", 1, 4), G(5, "temper", 8, 4), G(6, "grease", 2, 5),
      G(7, "grease", 7, 5), M(8, "calibrate", 1),
    ],
  },
  // ACT 2 ELITE, IRONCLAD: three armor plates and a braked cooker behind them.
  bulwark: {
    hero: "furnace", crates: 1,
    factories: [F("kiln", 4, 6, [4, 5, "L2U3R2U2"]), F("press", 6, 6, [6, 5, "L1U5"])],
    upgrades: [
      G(1, "brake", 2, 5), G(1, "temper", 2, 3), G(1, "longhaul", 4, 1), G(1, "whetstone", 5, 4),
      G(1, "coil", 5, 2), M(1, "calibrate", 0), P(1, 3), G(8, "whetstone", 4, 2), P(9),
    ],
  },
  // ---------------------------------------------------------------- act 3 (rounds 8-9)
  // STATIC WEB: an off-centre loom, one belt looping wide; a coil on every belt.
  silkshade: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 2, 4, [2, 3, "L1U3"], [4, 4, "U4"], [3, 6, "R5U6"])],
    upgrades: [
      G(8, "coil", 1, 2), G(8, "temper", 1, 1), G(8, "whetstone", 4, 3), G(8, "coil", 4, 2),
      G(8, "temper", 6, 6), G(8, "coil", 8, 3), M(8, "calibrate", 0), M(8, "calibrate", 2),
      G(9, "whetstone", 8, 5), M(9, "calibrate", 1), P(10),
    ],
  },
  // GATE CHAIN: six gates on one long cinder belt, then a Long Haul cashes them in.
  longtooth: {
    hero: "furnace", crates: 1,
    factories: [F("kiln", 6, 7, [6, 6, "U1L4U2R2U3"]), F("press", 6, 1, [5, 1, "U1"])],
    upgrades: [
      G(8, "temper", 6, 5), G(8, "whetstone", 4, 5), G(8, "brake", 2, 4), G(8, "coil", 3, 3),
      G(8, "whetstone", 4, 2), G(8, "longhaul", 4, 1), M(8, "calibrate", 0), G(9, "temper", 5, 1), P(9),
    ],
  },
  // TRIPLE THREAT: burn on the left belt, split in the centre, a long haul on the right.
  highspire: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 4, 6, [4, 5, "U5"], [3, 6, "L2U6"], [6, 6, "R2U6"])],
    upgrades: [
      G(8, "temper", 2, 6), G(8, "temper", 1, 4), G(8, "splitter", 4, 4), G(8, "whetstone", 4, 2),
      G(8, "grease", 7, 6), G(8, "whetstone", 8, 4), G(8, "longhaul", 8, 2), M(8, "calibrate", 1),
      G(9, "coil", 1, 2), P(10),
    ],
  },
  // ---------------------------------------------------------------- finale (rounds 10-12)
  // GRAND FOUNDRY: braked serpentine kiln belt into a Long Haul, a coiled press belt,
  // a calibrated gun and heavy armor. Buys another plate and gate for each retry round.
  matriarch: {
    hero: "furnace", crates: 1,
    factories: [F("kiln", 2, 7, [2, 6, "L1U4R2U1R1U1"]), F("press", 6, 6, [6, 5, "L1U5"])],
    upgrades: [
      G(1, "brake", 1, 6), G(1, "temper", 1, 4), G(1, "whetstone", 2, 2), G(1, "longhaul", 4, 1),
      G(1, "coil", 5, 4), G(1, "whetstone", 5, 2), M(1, "calibrate", 0), P(1, 3),
      G(11, "temper", 5, 5), P(11), G(12, "whetstone", 1, 3), P(12),
    ],
  },
};

/** Assemble a plan as it stands at a round (1-based). Enemy uids start at 9000, like warlords. */
export function planBuild(plan: RivalPlan, round: number): RivalLoadout {
  const U = 9000;
  let uid = U + 10;
  const items: Placed[] = [];
  const routes: RouteDef[] = [];
  const mods: ModPlacement[] = [];
  plan.factories.forEach((f, i) => {
    const fu = U + 1 + i;
    items.push({ uid: fu, def: f.def, x: f.x, y: f.y });
    for (const [x, y, moves] of f.belts) routes.push({ factory: fu, cells: walk(x, y, moves) });
  });
  let crates = plan.crates, plating = 0;
  for (const u of plan.upgrades) {
    if (u.at > round) continue;
    if (u.gate) items.push({ uid: uid++, def: u.gate[0], x: u.gate[1], y: u.gate[2] });
    if (u.mod) mods.push({ uid: uid++, def: u.mod[0], turret: u.mod[1] });
    crates += u.crates ?? 0;
    plating += u.plating ?? 0;
  }
  const value = [...items, ...mods].reduce((n, p) => n + ITEMS[p.def].price, 0)
    + crates * ITEMS.beltcrate.price + plating * ITEMS.plating.price;
  const build: Build = {
    hero: plan.hero, items, routes, mods,
    beltCap: HEROES[plan.hero].belt + crates * ITEMS.beltcrate.supply!.belt!,
    hullBonus: warlordHull(round) + plating * ITEMS.plating.supply!.hull!,
  };
  return { build, crates, plating, value };
}
