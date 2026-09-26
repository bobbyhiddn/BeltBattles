// Rival captain decks (0.6.0 groundwork). Every rival is a real production build under the
// same rules as the player and the warlords (spec §19): its hero's own signature factory
// plus shop items only, belts drawn to free turret intakes, rigs beside the belts they work
// (0.6.2 BELTSIDE: G(at, def, x, y, rot) is the rig's own cell and its turn; rigs stand
// beside the belt tile they work), one piece of turret gear per turret, and supplies
// (belt crates, armor plating) paid for like a player. G2/M2 are an additional ★1 purchase
// fused into an existing placed copy; the survivor keeps its cell, rotation or turret socket.
// A plan is a day-1 deck plus the upgrades the captain has bought by a given day (1-10), and it
// never shrinks. One plan feeds two decks (R2): the road warlord, planBuild() below with the PvE
// hull ramp warlordHull(day), and the stand-in dusk ghost, rivals.ts standInBuild(), whose hull is
// whole, paid-for plating. Part 4 re-timed every plan against the honest par player
// (rivals.ts honestReference) so the per-day ladder holds on days 1-10: kits spread over the
// days, a stamp press always bought with a gate for its belt, and every stand-in deck affordable.

// 0.6.2 TUNE-C (REQ-BFG-033, REQ-BFG-024): every plan is a named build around a synergy (RivalPlan.synergy names its
// parts), and its upgrades carry a shop-luck tier. An untagged upgrade is ORDINARY luck; `luck: "good"` needs good luck
// and `luck: "stars"` the stars aligning. Better luck can also bring an upgrade SOONER (`sooner: { good: 2 }`: a good-luck
// caravan offers it on day 2, an ordinary one on day `at`). planBuild(plan, day, luck) takes the upgrades that luck owns by
// that day (dayOwned); rivals.ts picks the luck from the captain's warlord slot (stand-ins and Easy/Medium warlords
// ordinary, Hard good, the Iron Matriarch stars). The caps each luck must fit are measured on the par field
// (src/sim/harness/luck.ts, tools/luckCaps.ts; tests/captains.luck.test.ts). Plans may also buy turrets (REQ-BFG-031):
// T() installs a bought turret in a slot (the extra slot, or replacing a starting turret) through deck.ts
// installTurret, the game's own operation, and T2() buys a matching copy for another star. Captain plans never join belts.

import { HEROES, ITEMS, type HeroId } from "./content";
import { installTurret, key, rotField, setTurretList, turretList, turretsCost, type Build, type ModPlacement, type Placed } from "./deck";
import { warlordHull } from "./ai";
import { migrateDeck } from "./beltside";
import { FUSE_MAX, starsOf, valueOf } from "./stars";
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

/** TUNE-C: the shop luck a captain's deck is assembled at (REQ-BFG-033). */
export type Luck = "ordinary" | "good" | "stars";
export const LUCKS: readonly Luck[] = ["ordinary", "good", "stars"];
const LUCK_RANK: Record<Luck, number> = { ordinary: 0, good: 1, stars: 2 };

export interface Upgrade {
  at: number; // first day (1-10) the captain owns it, at the least luck that owns it (`luck`, else ordinary)
  luck?: "good" | "stars"; // TUNE-C: the shop luck it needs (absent: ordinary)
  sooner?: { good?: number; stars?: number }; // TUNE-C: better luck brings it sooner: its first day at that luck (< at)
  gate?: [def: string, x: number, y: number, rot?: number]; // 0.6.2 BELTSIDE: a rig beside its belt, turned rot quarter turns
  mod?: [def: string, turret: number]; // gear or a core on the turret in that slot
  fuseGate?: [def: string, x: number, y: number]; // buy a matching copy; the named placed rig gains a star (★1 -> ★2 -> ★3)
  fuseMod?: [def: string, turret: number]; // same purchase for turret equipment
  turret?: [def: string, slot: number]; // TUNE-C: a turret bought and installed in the slot (an occupied slot: replaced)
  fuseTurret?: [slot: number]; // TUNE-C: a matching copy bought; the slot's turret gains a star
  factory?: FactoryPlan; // a factory bought that day, with the belt it feeds
  crates?: number; // belt crates bought (+4 belt each)
  plating?: number; // armor plating bought (+25 hull each)
}

export interface RivalPlan {
  hero: HeroId;
  synergy?: string[]; // TUNE-C: the defs of the build's synergy parts (the ones its blurb promises; the synergy check swaps them)
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
const G2 = (at: number, def: string, x: number, y: number): Upgrade => ({ at, fuseGate: [def, x, y] });
const M2 = (at: number, def: string, turret: number): Upgrade => ({ at, fuseMod: [def, turret] });
const P = (at: number, n = 1): Upgrade => ({ at, plating: n });
/** A factory bought on day `at` with its belt, plus any belt crates the belt needs. */
const X = (at: number, f: FactoryPlan, crates = 0): Upgrade => ({ at, factory: f, crates });
/** TUNE-C: a turret bought on day `at` and installed in `slot`, and another star for the slot's turret. */
const T = (at: number, def: string, slot: number): Upgrade => ({ at, turret: [def, slot] });
const T2 = (at: number, slot: number): Upgrade => ({ at, fuseTurret: [slot] });
/** TUNE-C: upgrades that need good luck (Hard warlords) or the stars aligning (the Iron Matriarch). */
const good = (...us: Upgrade[]): Upgrade[] => us.map((u) => ({ ...u, luck: "good" }));
const stars = (...us: Upgrade[]): Upgrade[] => us.map((u) => ({ ...u, luck: "stars" }));
/** TUNE-C: good luck brings the upgrade on day `day` (before its ordinary day u.at). */
const soon = (day: number, u: Upgrade): Upgrade => ({ ...u, sooner: { ...u.sooner, good: day } });
void T; void T2; void good; void stars;

export const PLANS: Record<RivalId, RivalPlan> = {
  // ---------------------------------------------------------------- Easy (tier 1)
  // SHORT STITCH: loom parked right under the guns; stubby belts fire first.
  nettle: {
    hero: "weaver", crates: 0, synergy: ["whetstone"],
    factories: [F("loom", 4, 1, [4, 0, ""], [3, 1, "L2U1"], [6, 1, "R2U1"])],
    upgrades: [G(2, "whetstone", 2, 2), G2(4, "whetstone", 2, 2)],
  },
  // PRESS GANG: a stamp press beside the kiln fills the heavy turret's second intake. TUNE-C: a DOUBLE STAMP (a
  // rare stamp press; the epic STAMP PRESS is past ordinary luck on day 2) arrives on day 2 with a whetstone for its belt.
  grubnose: {
    hero: "furnace", crates: 0, synergy: ["doublestamp"],
    factories: [F("kiln", 3, 6, [4, 5, "U5"])],
    upgrades: [
      G(2, "temper", 3, 3, 1), X(2, F("doublestamp", 6, 6, [6, 5, "L1U5"])), G(2, "whetstone", 6, 3, 3), G(2, "brake", 3, 5, 1),
      M(5, "calibrate", 0), G2(7, "whetstone", 6, 3), P(8), P(10),
    ],
  },
  // OVERCLOCK (Easy since Part 4): a bare kiln until day 5, then overdrive, a calibrated gun and a
  // temper; the press and its whetstone on day 9.
  ratchet: {
    hero: "furnace", crates: 0, synergy: ["overdrive", "calibrate"],
    factories: [F("kiln", 2, 6, [3, 5, "R1U5"])],
    upgrades: [
      G(5, "overdrive", 3, 3), M(5, "calibrate", 0), G(5, "temper", 3, 4, 1),
      X(9, F("press", 6, 6, [6, 5, "L1U5"])), G(9, "whetstone", 6, 2, 3), G2(10, "whetstone", 6, 2),
    ],
  },
  // HARD ELITE, FRAY STORM: shocking split bolts up the middle (a coil before the
  // splitter, so both copies stall what they hit), two long swept "wing" belts that dip
  // behind the loom, a burning left wing and two armor plates. Coils and plates add bite
  // without shortening fights; whetstones in their place gave a weaker elite.
  mothqueen: {
    hero: "weaver", crates: 0, synergy: ["splitter", "coil"],
    factories: [F("loom", 4, 4, [4, 3, "U3"], [3, 5, "L1D1L1U6"], [6, 5, "R1D1R1U6"])],
    upgrades: [
      G(1, "coil", 3, 3, 1), G(1, "temper", 0, 3, 1), P(3, 2),
      G2(4, "temper", 0, 3), soon(2, G(5, "splitter", 3, 2, 1)), G(5, "temper", 9, 5, 3), G(10, "grease", 2, 4, 2),
      G2(10, "grease", 2, 4), G(10, "grease", 7, 4, 2),
    ],
  },
  // ---------------------------------------------------------------- Medium (tier 2)
  // SLOW COOKER (Medium since Part 4): kiln at the back, one 13-tile serpentine so every slug
  // cooks on the way. Strong from day 1, so it buys slowly: brake, temper, whetstone, long haul.
  sootjaw: {
    hero: "furnace", crates: 0, synergy: ["brake", "longhaul"],
    factories: [F("kiln", 4, 7, [4, 6, "L3U2R2U2R1U2"])],
    upgrades: [G(3, "brake", 0, 5, 1), G(4, "temper", 2, 7), G(5, "whetstone", 2, 3, 1), G(8, "longhaul", 3, 1)],
  },
  // SHOCK TROOPER: galvanic coils at the end of both belts stall the enemy machinery. The press
  // comes on day 5 with the coil for its belt.
  sparkfang: {
    hero: "furnace", crates: 0, synergy: ["coil"],
    factories: [F("kiln", 4, 6, [4, 5, "L2U3R2U2"])],
    upgrades: [
      G(3, "temper", 1, 4, 1), G(5, "coil", 3, 1), X(5, F("press", 7, 6, [7, 5, "L2U5"]), 1),
      G2(5, "coil", 3, 1), G(5, "coil", 6, 3, 3),
      G(5, "brake", 3, 3), G(5, "whetstone", 6, 1, 3), M(5, "calibrate", 0), G(7, "longhaul", 4, 3, 1), P(8), P(10),
    ],
  },
  // SPLITTER SWARM: a whetstone from day 2; splitters are epics, so at ordinary luck they come later: a ★2
  // splitter on day 5 (both copies), one on the right belt on day 7.
  lacewing: {
    hero: "weaver", crates: 0, synergy: ["splitter"],
    factories: [F("loom", 4, 4, [4, 3, "U3"], [3, 4, "L2U4"], [6, 4, "R2U4"])],
    upgrades: [G(2, "whetstone", 0, 2, 1), G(5, "splitter", 2, 5), G2(5, "splitter", 2, 5), G(7, "splitter", 7, 3, 3)],
  },
  // EMBER WEAVE: a temper on the centre thread from day 2 (★2 from day 4), another temper on the left from
  // day 4, and a Drake Nozzle burning the right gun's output from day 8.
  emberlyn: {
    hero: "weaver", crates: 0, synergy: ["temper", "drake"],
    factories: [F("loom", 4, 5, [4, 4, "U4"], [3, 5, "L2U5"], [6, 5, "R2U5"])],
    upgrades: [G(2, "temper", 3, 3, 1), G(4, "temper", 0, 4, 1), G2(4, "temper", 3, 3), M(8, "drake", 2)],
  },
  // HARD ELITE, IRONCLAD: armor plates and a braked cooker behind them; the press comes on day 5
  // with a whetstone and a coil for its belt.
  bulwark: {
    hero: "furnace", crates: 0, synergy: ["brake"],
    factories: [F("kiln", 4, 6, [4, 5, "L2U3R2U2"])],
    upgrades: [
      G(1, "brake", 2, 6), soon(1, P(2)), G(3, "temper", 1, 3, 1), G(3, "longhaul", 3, 1), M(3, "calibrate", 0),
      X(5, F("press", 6, 6, [6, 5, "L1U5"]), 1), G(5, "whetstone", 4, 4, 1), G(5, "coil", 6, 2, 3), P(6), P(6),
      G2(10, "whetstone", 4, 4), P(10),
    ],
  },
  // ---------------------------------------------------------------- Hard (tier 3)
  // STATIC WEB: an off-centre loom and a wide loop; a ★2 coil on the left, a coil on the right,
  // ★2 calibration on one gun and calibration on another, then plates. Good luck brings the ★2s sooner.
  silkshade: {
    hero: "weaver", crates: 0, synergy: ["coil"],
    factories: [F("loom", 2, 4, [2, 3, "L1U3"], [4, 4, "U4"], [3, 6, "R5U6"])],
    upgrades: [
      G(1, "coil", 0, 2, 1), G(1, "temper", 0, 1, 1), G(2, "whetstone", 3, 3, 1),
      soon(2, G2(4, "coil", 0, 2)), soon(3, G(4, "coil", 7, 3, 1)), M(4, "calibrate", 0),
      soon(4, G2(6, "temper", 0, 1)), soon(4, G(6, "temper", 6, 5, 2)), P(6, 2), P(7), soon(5, M2(8, "calibrate", 0)),
      soon(5, M(8, "calibrate", 1)),
    ],
  },
  // GATE CHAIN: six rigs on one long cinder belt by day 4, a Long Haul cashes them in; the press
  // comes on day 5 (good luck: day 4) and gains its own temper on day 6.
  longtooth: {
    hero: "furnace", crates: 0, synergy: ["longhaul"],
    factories: [F("kiln", 6, 7, [6, 6, "U1L4U2R2U3"])],
    upgrades: [
      G(1, "temper", 7, 5, 3), G(1, "whetstone", 4, 6), G(2, "brake", 1, 4, 1), G(3, "coil", 3, 4),
      soon(3, G2(4, "whetstone", 4, 6)), soon(3, G(4, "whetstone", 3, 2, 1)), G(4, "longhaul", 3, 1),
      soon(4, X(5, F("press", 6, 1, [5, 1, "U1"]), 1)), M(5, "calibrate", 0), soon(4, G2(7, "temper", 7, 5)),
      soon(6, G(7, "temper", 5, 2)),
    ],
  },
  // TRIPLE THREAT: burn on the left belt, split in the centre, a long haul on the right. Good luck brings the
  // splitter and the ★2s sooner.
  highspire: {
    hero: "weaver", crates: 0, synergy: ["temper", "splitter", "longhaul"],
    factories: [F("loom", 4, 6, [4, 5, "U5"], [3, 6, "L2U6"], [6, 6, "R2U6"])],
    upgrades: [
      G(1, "temper", 2, 7), G(2, "whetstone", 3, 2, 1), G(3, "grease", 7, 5, 2), G(3, "longhaul", 7, 2),
      soon(2, G2(4, "temper", 2, 7)), M(4, "calibrate", 1),
      soon(2, G(5, "splitter", 3, 4, 1)), G(5, "coil", 0, 2, 1), P(5), soon(4, G2(6, "whetstone", 3, 2)),
      soon(4, G(6, "whetstone", 7, 4, 1)),
    ],
  },
  // ---------------------------------------------------------------- Hard, days 8-10 only
  // GRAND FOUNDRY: braked serpentine kiln belt into a Long Haul, a coiled press belt,
  // a calibrated gun and heavy armor: four plates, two more when she arrives on day 8 (R3: PvE
  // only, so she may exceed a player's budget), then another plate and gate on days 9 and 10.
  matriarch: {
    hero: "furnace", crates: 1, synergy: ["press", "longhaul", "brake"],
    factories: [F("kiln", 2, 7, [2, 6, "L1U4R2U1R1U1"]), F("press", 6, 6, [6, 5, "L1U5"])],
    upgrades: [
      G(1, "brake", 1, 7), G(1, "temper", 0, 4, 1), G(1, "whetstone", 2, 1, 2), G2(1, "whetstone", 2, 1),
      G(1, "longhaul", 4, 2, 3), G(1, "coil", 4, 4, 1), G(1, "whetstone", 6, 2, 3),
      M(1, "calibrate", 0), P(1, 4), P(8, 2), G2(9, "temper", 0, 4), G(9, "temper", 5, 6),
      P(9), G(10, "grease", 0, 3, 1), P(10),
    ],
  },
};

/**
 * TUNE-C: the first day a deck at `luck` owns upgrade `u` (Infinity: that luck never owns it). Ordinary luck owns the
 * untagged upgrades, good luck the untagged and "good" ones, the stars aligning every upgrade; from day `at`, or from the
 * upgrade's `sooner` day for that luck (a good-luck day also holds when the stars align).
 */
export function dayOwned(u: Upgrade, luck: Luck): number {
  if (LUCK_RANK[u.luck ?? "ordinary"] > LUCK_RANK[luck]) return Infinity;
  let d = u.at;
  if (LUCK_RANK[luck] >= LUCK_RANK.good && u.sooner?.good !== undefined) d = Math.min(d, u.sooner.good);
  if (luck === "stars" && u.sooner?.stars !== undefined) d = Math.min(d, u.sooner.stars);
  return d;
}

/** TUNE-C: does a deck at `luck` ever own upgrade `u`? */
export const ownsAt = (u: Upgrade, luck: Luck): boolean => dayOwned(u, luck) < Infinity;

/** TUNE-C: the earliest day any luck owns `u` (the day the caravan must first be able to offer its parts). */
export const firstDay = (u: Upgrade): number => Math.min(...LUCKS.map((l) => dayOwned(u, l)));

/** Bought turret uids (the hull's free starting copies are deck.ts TURRET_UID0 + slot). */
const TURRET_UID = 9500;

/**
 * Assemble a plan as it stands on a day (1-based) at a shop-luck tier (TUNE-C; default ordinary): the upgrades that luck
 * owns by that day (dayOwned), applied in plan order. Enemy uids start at 9000, like warlords; TUNE-C: a part's uid comes
 * from its upgrade's place in the plan (factories U+1.., rigs and turret equipment U+10+index, bought turrets 9500+index),
 * so a part keeps its uid on every day and at every luck. The hull is the PvE ramp warlordHull(day) plus the plan's
 * plating (rivals.ts standInBuild swaps the ramp for whole plates).
 */
export function planBuild(plan: RivalPlan, day: number, luck: Luck = "ordinary"): RivalLoadout {
  const U = 9000;
  const b: Build = { hero: plan.hero, items: [], routes: [], mods: [], beltCap: 0, hullBonus: 0 };
  const addFactory = (f: FactoryPlan, u: number) => {
    b.items.push({ uid: u, def: f.def, x: f.x, y: f.y });
    for (const [x, y, moves] of f.belts) b.routes.push({ factory: u, cells: walk(x, y, moves) });
  };
  plan.factories.forEach((f, i) => addFactory(f, U + 1 + i));
  let crates = plan.crates, plating = 0, fu = U + 1 + plan.factories.length;
  for (const [i, u] of plan.upgrades.entries()) {
    const uid = U + 10 + i, tu = TURRET_UID + i;
    const f = u.factory ? fu++ : 0; // factory uids follow the plan's factory order whether or not this luck owns them yet
    if (dayOwned(u, luck) > day) continue;
    if (u.factory) addFactory(u.factory, f);
    if (u.gate) b.items.push({ uid, def: u.gate[0], x: u.gate[1], y: u.gate[2], ...rotField(u.gate[0], u.gate[3] ?? 0) });
    if (u.mod) b.mods.push({ uid, def: u.mod[0], turret: u.mod[1] });
    if (u.fuseGate) {
      const [def, x, y] = u.fuseGate;
      const p: Placed | undefined = b.items.find((q) => q.def === def && q.x === x && q.y === y);
      if (!p || starsOf(p) >= FUSE_MAX) throw new Error(`invalid rig star purchase ${def}@${x},${y}`);
      p.stars = starsOf(p) + 1;
    }
    if (u.fuseMod) {
      const [def, turret] = u.fuseMod;
      const p: ModPlacement | undefined = b.mods.find((q) => q.def === def && q.turret === turret);
      if (!p || starsOf(p) >= FUSE_MAX) throw new Error(`invalid turret-gear star purchase ${def}@${turret}`);
      p.stars = starsOf(p) + 1;
    }
    if (u.turret) {
      const [def, slot] = u.turret;
      const r = installTurret(b, { uid: tu, def }, slot);
      if (!r.ok || r.mods.length) throw new Error(`invalid turret purchase ${def}@${slot}: ${r.reason ?? "gear left without a slot"}`);
    }
    if (u.fuseTurret) {
      const [slot] = u.fuseTurret;
      const list = turretList(b), t = list.find((x) => x.slot === slot);
      if (!t || starsOf(t) >= FUSE_MAX) throw new Error(`invalid turret star purchase @${slot}`);
      t.stars = starsOf(t) + 1; // a merged starting copy stays `free` (deck.ts turretValue: worth the copies bought)
      setTurretList(b, list);
    }
    crates += u.crates ?? 0;
    plating += u.plating ?? 0;
  }
  b.beltCap = HEROES[plan.hero].belt + crates * ITEMS.beltcrate.supply!.belt!;
  b.hullBonus = warlordHull(day) + plating * ITEMS.plating.supply!.hull!;
  // 0.6.2 BELTSIDE: a load boundary (D3). The plans place rigs natively (M4), so the migration is a no-op
  // here, kept as the safety net for a plan that writes a rig on a belt tile. The value counts the deck after it.
  const build: Build = migrateDeck(b, "preset:rival");
  const value = [...build.items, ...build.mods].reduce((n, p) => n + valueOf(p.def, starsOf(p)), 0) + turretsCost(build)
    + crates * ITEMS.beltcrate.price + plating * ITEMS.plating.price;
  return { build, crates, plating, value };
}
