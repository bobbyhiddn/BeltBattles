// Rival captain decks (0.6.0 groundwork). Every rival is a real production build under the
// same rules as the player and the warlords (spec §19): its hero's own signature factory
// plus shop items only, belts drawn to free turret intakes, rigs beside the belts they work
// (0.6.2 BELTSIDE: G(at, def, x, y, rot) is the rig's own cell and its turn; each plan was ported
// from the 0.6.1 inline gates so every rig works exactly the tile its gate stood on, and no other
// belt tile, tests/beltside.presets.test.ts), one piece of turret gear per turret, and supplies
// (belt crates, armor plating) paid for like a player.
// A plan is a day-1 deck plus the upgrades the captain has bought by a given day (1-10), and it
// never shrinks. One plan feeds two decks (R2): the road warlord, planBuild() below with the PvE
// hull ramp warlordHull(day), and the stand-in dusk ghost, rivals.ts standInBuild(), whose hull is
// whole, paid-for plating. Part 4 re-timed every plan against the honest par player
// (rivals.ts honestReference) so the per-day ladder holds on days 1-10: kits spread over the
// days, a stamp press always bought with a gate for its belt, and every stand-in deck affordable.

import { HEROES, ITEMS, type HeroId } from "./content";
import { key, rotField, type Build, type ModPlacement, type Placed, type RouteDef } from "./deck";
import { warlordHull } from "./ai";
import { migrateDeck } from "./beltside";
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
  at: number; // first day (1-10) the captain owns it
  gate?: [def: string, x: number, y: number, rot?: number]; // 0.6.2 BELTSIDE: a rig beside its belt, turned rot quarter turns
  mod?: [def: string, turret: number];
  factory?: FactoryPlan; // a stamp press bought that day, with the belt it feeds
  crates?: number; // belt crates bought (+4 belt each)
  plating?: number; // armor plating bought (+25 hull each)
}

export interface RivalPlan {
  hero: HeroId;
  factories: FactoryPlan[]; // the day-1 deck: the signature factory and its belts
  crates: number; // belt crates the day-1 deck needs
  upgrades: Upgrade[];
}

export interface RivalLoadout {
  build: Build;
  crates: number;
  plating: number;
  value: number; // gold a player would pay for the same deck, gear and supplies
}

const F = (def: string, x: number, y: number, ...belts: Belt[]): FactoryPlan => ({ def, x, y, belts });
const G = (at: number, def: string, x: number, y: number, rot = 0): Upgrade => ({ at, gate: [def, x, y, rot] });
const M = (at: number, def: string, turret: number): Upgrade => ({ at, mod: [def, turret] });
const P = (at: number, n = 1): Upgrade => ({ at, plating: n });
/** A stamp press bought on day `at` with its belt, plus any belt crates the belt needs. */
const X = (at: number, f: FactoryPlan, crates = 0): Upgrade => ({ at, factory: f, crates });

export const PLANS: Record<RivalId, RivalPlan> = {
  // ---------------------------------------------------------------- Easy (tier 1)
  // SHORT STITCH: loom parked right under the guns; stubby belts fire first.
  nettle: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 4, 1, [4, 0, ""], [3, 1, "L2U1"], [6, 1, "R2U1"])],
    upgrades: [G(2, "whetstone", 2, 2), G(2, "whetstone", 7, 0, 2)],
  },
  // PRESS GANG: a stamp press beside the kiln fills the heavy turret's second intake. The press
  // arrives on day 2 with a whetstone for its belt.
  grubnose: {
    hero: "furnace", crates: 0,
    factories: [F("kiln", 3, 6, [4, 5, "U5"])],
    upgrades: [
      G(2, "temper", 3, 3, 1), X(2, F("press", 6, 6, [6, 5, "L1U5"])), G(2, "whetstone", 6, 3, 3), G(2, "brake", 3, 5, 1),
      M(5, "calibrate", 0), G(7, "whetstone", 3, 1, 1), P(8), P(10),
    ],
  },
  // OVERCLOCK (Easy since Part 4): a bare kiln until day 5, then overdrive, a calibrated gun and a
  // temper; the press and its whetstone on day 8.
  ratchet: {
    hero: "furnace", crates: 0,
    factories: [F("kiln", 2, 6, [3, 5, "R1U5"])],
    upgrades: [
      G(5, "overdrive", 3, 3), M(5, "calibrate", 0), G(5, "temper", 3, 4, 1),
      X(8, F("press", 6, 6, [6, 5, "L1U5"])), G(8, "whetstone", 6, 2, 3), G(10, "whetstone", 3, 1, 1),
    ],
  },
  // HARD ELITE, FRAY STORM: shocking split bolts up the middle (a coil before the
  // splitter, so both copies stall what they hit), two long swept "wing" belts that dip
  // behind the loom, a burning left wing and two armor plates. Coils and plates add bite
  // without shortening fights; whetstones in their place gave a weaker elite.
  mothqueen: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 4, 4, [4, 3, "U3"], [3, 5, "L1D1L1U6"], [6, 5, "R1D1R1U6"])],
    upgrades: [
      G(1, "coil", 3, 3, 1), G(1, "temper", 0, 3, 1), G(2, "splitter", 3, 2, 1), P(3, 2),
      G(4, "temper", 0, 5, 1), G(5, "temper", 9, 5, 3), G(10, "grease", 2, 4, 2), G(10, "grease", 7, 4, 2),
    ],
  },
  // ---------------------------------------------------------------- Medium (tier 2)
  // SLOW COOKER (Medium since Part 4): kiln at the back, one 13-tile serpentine so every slug
  // cooks on the way. Strong from day 1, so it buys slowly: brake, temper, whetstone, long haul.
  sootjaw: {
    hero: "furnace", crates: 0,
    factories: [F("kiln", 4, 7, [4, 6, "L3U2R2U2R1U2"])],
    upgrades: [G(3, "brake", 0, 5, 1), G(4, "temper", 2, 7), G(5, "whetstone", 2, 3, 1), G(8, "longhaul", 3, 1)],
  },
  // SHOCK TROOPER: galvanic coils at the end of both belts stall the enemy machinery. The press
  // comes on day 5 with the coil for its belt.
  sparkfang: {
    hero: "furnace", crates: 0,
    factories: [F("kiln", 4, 6, [4, 5, "L2U3R2U2"])],
    upgrades: [
      G(3, "temper", 1, 4, 1), G(5, "coil", 3, 1), X(5, F("press", 7, 6, [7, 5, "L2U5"]), 1), G(5, "coil", 6, 3, 3),
      G(5, "brake", 3, 3), G(5, "whetstone", 6, 1, 3), M(5, "calibrate", 0), G(7, "longhaul", 4, 3, 1), P(8), P(10),
    ],
  },
  // SPLITTER SWARM: splitters on both side belts, a whetstone after one of them.
  lacewing: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 4, 4, [4, 3, "U3"], [3, 4, "L2U4"], [6, 4, "R2U4"])],
    upgrades: [G(2, "splitter", 2, 5), G(2, "splitter", 7, 3, 3), G(4, "whetstone", 0, 2, 1)],
  },
  // EMBER WEAVE: a temper on two thread belts from day 2, on every belt from day 8.
  emberlyn: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 4, 5, [4, 4, "U4"], [3, 5, "L2U5"], [6, 5, "R2U5"])],
    upgrades: [G(2, "temper", 3, 3, 1), G(2, "temper", 0, 4, 1), G(8, "temper", 7, 4, 1)],
  },
  // HARD ELITE, IRONCLAD: armor plates and a braked cooker behind them; the press comes on day 5
  // with a whetstone and a coil for its belt.
  bulwark: {
    hero: "furnace", crates: 0,
    factories: [F("kiln", 4, 6, [4, 5, "L2U3R2U2"])],
    upgrades: [
      G(1, "brake", 2, 6), P(1), G(3, "temper", 1, 3, 1), G(3, "longhaul", 3, 1), M(3, "calibrate", 0), P(3),
      X(5, F("press", 6, 6, [6, 5, "L1U5"]), 1), G(5, "whetstone", 4, 4, 1), G(5, "coil", 6, 2, 3), P(6),
      G(10, "whetstone", 4, 3), P(10),
    ],
  },
  // ---------------------------------------------------------------- Hard (tier 3)
  // STATIC WEB: an off-centre loom, one belt looping wide; a coil on every belt by day 3,
  // calibration on every gun by day 5, then plates.
  silkshade: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 2, 4, [2, 3, "L1U3"], [4, 4, "U4"], [3, 6, "R5U6"])],
    upgrades: [
      G(1, "coil", 0, 2, 1), G(1, "temper", 0, 1, 1), G(2, "coil", 3, 2, 1), G(2, "whetstone", 3, 3, 1),
      G(3, "coil", 7, 3, 1), G(3, "temper", 6, 5, 2), M(4, "calibrate", 0), M(4, "calibrate", 2),
      G(4, "whetstone", 7, 5, 1), M(5, "calibrate", 1), P(6, 2), P(7),
    ],
  },
  // GATE CHAIN: six rigs on one long cinder belt by day 4, a Long Haul cashes them in; the press
  // comes on day 4 with a temper for its belt.
  longtooth: {
    hero: "furnace", crates: 0,
    factories: [F("kiln", 6, 7, [6, 6, "U1L4U2R2U3"])],
    upgrades: [
      G(1, "temper", 7, 5, 3), G(1, "whetstone", 4, 6), G(2, "brake", 1, 4, 1), G(3, "coil", 3, 4), G(3, "whetstone", 3, 2, 1),
      G(4, "longhaul", 3, 1), X(4, F("press", 6, 1, [5, 1, "U1"]), 1), G(4, "temper", 5, 2), M(5, "calibrate", 0),
    ],
  },
  // TRIPLE THREAT: burn on the left belt, split in the centre, a long haul on the right.
  highspire: {
    hero: "weaver", crates: 0,
    factories: [F("loom", 4, 6, [4, 5, "U5"], [3, 6, "L2U6"], [6, 6, "R2U6"])],
    upgrades: [
      G(1, "temper", 2, 7), G(1, "temper", 0, 4, 1), G(2, "splitter", 3, 4, 1), G(2, "whetstone", 3, 2, 1),
      G(3, "grease", 7, 5, 2), G(3, "whetstone", 7, 4, 1), G(3, "longhaul", 7, 2), M(4, "calibrate", 1),
      G(4, "coil", 0, 2, 1), P(5),
    ],
  },
  // ---------------------------------------------------------------- Hard, days 8-10 only
  // GRAND FOUNDRY: braked serpentine kiln belt into a Long Haul, a coiled press belt,
  // a calibrated gun and heavy armor: four plates, two more when she arrives on day 8 (R3: PvE
  // only, so she may exceed a player's budget), then another plate and gate on days 9 and 10.
  matriarch: {
    hero: "furnace", crates: 1,
    factories: [F("kiln", 2, 7, [2, 6, "L1U4R2U1R1U1"]), F("press", 6, 6, [6, 5, "L1U5"])],
    upgrades: [
      G(1, "brake", 1, 7), G(1, "temper", 0, 4, 1), G(1, "whetstone", 2, 1, 2), G(1, "longhaul", 4, 2, 3),
      G(1, "coil", 4, 4, 1), G(1, "whetstone", 6, 2, 3), M(1, "calibrate", 0), P(1, 4), P(8, 2),
      G(9, "temper", 5, 6), P(9), G(10, "whetstone", 0, 3, 1), P(10),
    ],
  },
};

/** Assemble a plan as it stands on a day (1-based). Enemy uids start at 9000, like warlords. */
export function planBuild(plan: RivalPlan, day: number): RivalLoadout {
  const U = 9000;
  let uid = U + 10, fu = U + 1;
  const items: Placed[] = [];
  const routes: RouteDef[] = [];
  const mods: ModPlacement[] = [];
  const addFactory = (f: FactoryPlan) => {
    const u = fu++;
    items.push({ uid: u, def: f.def, x: f.x, y: f.y });
    for (const [x, y, moves] of f.belts) routes.push({ factory: u, cells: walk(x, y, moves) });
  };
  plan.factories.forEach(addFactory);
  let crates = plan.crates, plating = 0;
  for (const u of plan.upgrades) {
    if (u.at > day) continue;
    if (u.factory) addFactory(u.factory);
    if (u.gate) items.push({ uid: uid++, def: u.gate[0], x: u.gate[1], y: u.gate[2], ...rotField(u.gate[0], u.gate[3] ?? 0) });
    if (u.mod) mods.push({ uid: uid++, def: u.mod[0], turret: u.mod[1] });
    crates += u.crates ?? 0;
    plating += u.plating ?? 0;
  }
  // 0.6.2 BELTSIDE: a load boundary (D3). The plans place rigs natively (M4), so the migration is a no-op
  // here, kept as the safety net for a plan that writes a rig on a belt tile. The value counts the deck after it.
  const build: Build = migrateDeck({
    hero: plan.hero, items, routes, mods,
    beltCap: HEROES[plan.hero].belt + crates * ITEMS.beltcrate.supply!.belt!,
    hullBonus: warlordHull(day) + plating * ITEMS.plating.supply!.hull!,
  }, "preset:rival");
  const value = [...build.items, ...mods].reduce((n, p) => n + ITEMS[p.def].price, 0)
    + crates * ITEMS.beltcrate.price + plating * ITEMS.plating.price;
  return { build, crates, plating, value };
}
