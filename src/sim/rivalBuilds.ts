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
  // 0.8.0 I1 M3 (VERIFIED-D1 Q8): a plan's base factory owned only from this day (absent: day 1). Before it the factory
  // and its belts are missing; from it the deck is exactly what it was with the factory owned from day 1 (the same uid,
  // place in the item list, cells and routes), so later days don't move.
  at?: number;
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
void T2;

// 0.6.2 TUNE-C retime (ref/BRIEF-final-062-captains.md section 3; OUT/CAPTAINS-REPORT.md). Every plan was regrown day by
// day against the FURNACE par field (K 24; the calibration field) by OUT/tools/capsearch.ts, inside its luck tier's caps:
// Easy stand-ins about 30%, Medium about 50%, Hard stand-ins about 68% (ordinary luck), Hard warlords about 70% (good
// luck: the "good" upgrades), the Iron Matriarch about 80% on days 8-10 (stars-aligned). Each build keeps its blurb's
// parts (its `synergy`), bought early and grown on; the search filled around them. Values stay well under
// maxGoldByDay (R1) and under each tier's measured caps. A part's uid is its upgrade's index, so the order below is the
// order the decks were measured in (tests/rivals.test.ts: in day order).
export const PLANS: Record<RivalId, RivalPlan> = {
  // ---------------------------------------------------------------- Easy (tier 1)
  // SHORT STITCH: the loom parked right under the guns on three short stitches. Synergy: a WHETSTONE on the centre
  // stitch from day 1 (2 stars from day 5) and a ROTARY core (fires the oldest load first) from day 2: short belts that
  // fire first. It grows with poison, burn (a temper, a keg, a drake core) and a sorting arm.
  nettle: {
    hero: "weaver", crates: 0, synergy: ["whetstone", "rotary"],
    factories: [F("loom", 4, 2, [4, 1, "U1"], [3, 2, "L2U2"], [6, 2, "R2U2"])],
    upgrades: [
      G(1, "whetstone", 3, 0, 1), G(2, "venom", 5, 0), M(2, "rotary", 1), G(3, "temper", 0, 0, 1), G(3, "keg", 2, 1, 1),
      M(4, "drake", 0), G2(5, "whetstone", 3, 0), G(6, "sorting", 3, 1, 1), M(8, "flak", 0), G(8, "overclocker", 0, 1),
      G(9, "quench", 2, 0),
    ],
  },
  // PRESS GANG: a DOUBLE STAMP (a rare stamp press) beside the kiln feeds the heavy turret's second intake from day 1.
  // Synergy: the DOUBLE STAMP and a WHETSTONE on its belt from day 2 (2 stars from day 7), with a temper beside it (2
  // stars from day 6). The kiln belt gets a brake; a keg, flak, a static brush, a drake core, a surge valve and a long
  // haul follow.
  grubnose: {
    hero: "furnace", crates: 0, synergy: ["doublestamp", "whetstone"],
    factories: [F("kiln", 3, 6, [4, 5, "U5"])],
    upgrades: [
      X(1, F("doublestamp", 8, 1, [9, 3, "L2ULULU"])), G(2, "whetstone", 6, 0, 2), G(2, "temper", 7, 1, 2),
      G(2, "brake", 3, 4, 1), G(3, "keg", 5, 2), M(4, "flak", 0), G(5, "staticbrush", 6, 3), G2(6, "temper", 7, 1),
      G2(7, "whetstone", 6, 0), M(8, "drake", 0), G(9, "surge", 9, 4, 1), G(10, "longhaul", 3, 0),
    ],
  },
  // OVERCLOCK: a short kiln belt with a whetstone, a counterweight and a brake (2 stars from day 7). Synergy: a
  // CALIBRATE on the gun from day 3 (2 stars from day 7) and an OVERDRIVE on the kiln belt from day 5 (a legendary:
  // ordinary luck owns no epic or legendary before day 5). Then a temper, a gatling core, quench, venom, a tollbooth, a
  // surge valve, a long haul, and a DART GUN for the starting gun on day 9.
  ratchet: {
    hero: "furnace", crates: 0, synergy: ["overdrive", "calibrate"],
    factories: [F("kiln", 2, 6, [3, 5, "R1U5"])],
    upgrades: [
      // FINAL-MEASURE (the Prime's ladder fix, oracle e2d655e0): the whetstone comes on day 2 (was 1), the counterweight
      // and the brake on day 3 (were 2), and the tollbooth, surge valve and long haul on day 9 (were 8), so the Easy
      // OVERCLOCK stays easier than every Hard warlord on day 1 and than every Medium on days 2 and 8 (rivals.difficulty)
      G(2, "whetstone", 3, 2, 1), G(3, "counterweight", 3, 0), G(3, "brake", 5, 5, 3), M(3, "calibrate", 0),
      G(3, "temper", 3, 3, 1), M(4, "gatling", 0), G(5, "overdrive", 5, 3), G(5, "quench", 3, 1), G(6, "venom", 3, 4),
      M2(7, "calibrate", 0), G2(7, "brake", 5, 5), G(9, "tollbooth", 5, 1, 3), G(9, "surge", 4, 6, 1), G(9, "longhaul", 5, 4),
      T(9, "dartgun", 0),
    ],
  },
  // HARD ELITE, FRAY STORM: a loom with a centre bolt and two long swept wings, two armor plates (days 2 and 3).
  // Synergy: a BARBED SPOOL from day 1 (every hit adds fray, later hits deal more per stack) and a SPLITTER on a wing
  // from day 5 (twice the hits, so the fray piles up), with a temper, a long haul and a quench tank. Good luck: the
  // temper's second star on day 10.
  mothqueen: {
    hero: "weaver", crates: 0, synergy: ["splitter", "barbed"],
    factories: [F("loom", 4, 4, [4, 3, "U3"], [3, 5, "L1D1L1U6"], [6, 5, "R1D1R1U6"])],
    upgrades: [
      // FINAL-MEASURE: the long haul comes on day 4 at ordinary luck (the stand-in; WEAVER d3's ordinary value cap is 25
      // g on the merged par field), still day 3 at good luck (the warlord)
      G(1, "barbed", 3, 0), G(1, "temper", 3, 1, 1), M(2, "scatter", 1), P(2), P(3), soon(3, G(4, "longhaul", 5, 0)),
      // FINAL-MEASURE (the Prime's ladder fix, oracle e2d655e0): good luck brings the riveter on day 6 and the venom on
      // day 7 (one day sooner; the warlord), so the Hard slot beats par on days 6 and 7 (rivals.difficulty)
      M(4, "flak", 0), G(5, "splitter", 2, 4, 2), G(6, "staticbrush", 0, 1), soon(6, G(7, "riveter", 5, 1)), soon(7, G(8, "venom", 0, 0)),
      G(9, "counterweight", 2, 0), ...good(G2(10, "temper", 3, 1)),
    ],
  },
  // ---------------------------------------------------------------- Medium (tier 2)
  // SLOW COOKER: the kiln at the back, one 13-tile serpentine so every slug cooks on the way. Synergy: the ride-time
  // rigs that pay off a long belt: a HEAT JACKET from day 3 (2 stars from day 6), BELLOWS from day 4 and a
  // COUNTERWEIGHT from day 6, with a quench tank, a temper, a whetstone and a long haul; a SPIKE GUN for the starting
  // gun on day 9 (FINAL-MEASURE: day 8 until the merged par field's ordinary turret cap fell to 0 on FURNACE day 8).
  sootjaw: {
    hero: "furnace", crates: 0, synergy: ["counterweight", "heatjacket", "bellows"],
    factories: [F("kiln", 4, 7, [4, 6, "L3U2R2U2R1U2"])],
    upgrades: [
      // FINAL-MEASURE (the Prime's ladder fix, oracle e2d655e0): the quench tank comes on day 2 (was 1), so on day 1 the
      // Medium slot stays 0.05 easier than Hard (rivals.difficulty), whose decks sit at the day-1 good-luck cap
      G(2, "quench", 3, 0), G(2, "temper", 3, 1, 1), G(3, "heatjacket", 2, 5, 1), M(3, "scatter", 0), G(4, "bellows", 5, 2),
      G(5, "whetstone", 5, 1, 3), G(6, "counterweight", 4, 3, 1), G2(6, "heatjacket", 2, 5), G(7, "longhaul", 2, 3),
      T(9, "spikegun", 0), G(9, "venom", 3, 5, 1),
    ],
  },
  // SHOCK TROOPER: synergy: a GALVANIC COIL on the kiln belt from day 1 (2 stars from day 7) stalls the enemy
  // machinery, a LODESTONE from day 3 hits harder for every stalled machine, and a TESLA core from day 6 arcs to the
  // nearest machine. Filled with a temper, whetstone, tollbooth, long haul, sifter and surge valve; a DART GUN for the
  // starting gun on day 9.
  sparkfang: {
    hero: "furnace", crates: 0, synergy: ["coil", "lodestone", "tesla"],
    factories: [F("kiln", 4, 6, [4, 5, "L2U3R2U2"])],
    upgrades: [
      G(1, "coil", 3, 1, 1), G(2, "temper", 3, 0, 1), G(3, "lodestone", 5, 1), G(3, "whetstone", 1, 3, 1),
      G(3, "tollbooth", 5, 2, 3), G(4, "longhaul", 4, 3, 1), G(4, "sifter", 3, 3, 3), G(5, "surge", 1, 5), M(6, "tesla", 0),
      G2(7, "coil", 3, 1), G2(8, "temper", 3, 0), T(9, "dartgun", 0),
    ],
  },
  // SPLITTER SWARM: synergy: a WHETSTONE from day 1 ahead of the SPLITTER, so both copies gain it. Splitters are epics,
  // so at ordinary luck they come later: one on the centre belt on day 6 (2 stars on day 8), another on day 9. Until
  // then a scatter core, a temper, venom, a keg and a long haul hold the line.
  lacewing: {
    hero: "weaver", crates: 0, synergy: ["splitter", "whetstone"],
    factories: [F("loom", 4, 4, [4, 3, "U3"], [3, 4, "L2U4"], [6, 4, "R2U4"])],
    upgrades: [
      G(1, "whetstone", 3, 0, 1), M(1, "scatter", 1), G(2, "temper", 3, 1, 1), G(3, "venom", 3, 2), G(4, "keg", 7, 0),
      G(5, "longhaul", 5, 2), G(6, "splitter", 5, 1), G2(8, "splitter", 5, 1), G(8, "grease", 3, 3, 2),
      G(8, "brake", 0, 0, 1), G(9, "splitter", 2, 3, 2),
    ],
  },
  // EMBER WEAVE: synergy: a TEMPER on the centre thread from day 1 (2 stars from day 4), a DRAKE core from day 3 (flat
  // damage turns to burn), BELLOWS on the right thread from day 5 and a second temper on the left from day 6: from
  // day 6 every belt burns. Venom, a whetstone, a pressure core, flak, a sorting arm and a long haul fill in.
  emberlyn: {
    hero: "weaver", crates: 0, synergy: ["temper", "bellows", "drake"],
    factories: [F("loom", 4, 5, [4, 4, "U4"], [3, 5, "L2U5"], [6, 5, "R2U5"])],
    upgrades: [
      G(1, "temper", 3, 3, 1), G(2, "venom", 3, 0), M(3, "drake", 1), G(3, "whetstone", 5, 0, 3), M(3, "pressure", 0),
      G2(4, "temper", 3, 3), G(5, "bellows", 7, 2), G(5, "staticbrush", 3, 2), G(6, "temper", 0, 1, 1), M(6, "flak", 0),
      G2(7, "whetstone", 5, 0), G(8, "sorting", 3, 4, 1), G(9, "longhaul", 3, 1),
    ],
  },
  // HARD ELITE, IRONCLAD: three armor plates (days 3, 4 and 5) and a braked cooker behind them. Synergy: a BRAKE SHOE
  // on the kiln belt from day 1 (slugs ride twice as long) and a HEAT JACKET from day 4 (damage per second ridden),
  // with a quench tank, a temper, venom, a long haul and a counterweight. Good luck: the brake's second star on day 2
  // (17 g, the day-2 good value cap).
  bulwark: {
    hero: "furnace", crates: 0, synergy: ["brake", "heatjacket"],
    factories: [F("kiln", 4, 6, [4, 5, "L2U3R2U2"])],
    upgrades: [
      G(1, "brake", 4, 4, 2), G(1, "quench", 3, 1), G(2, "temper", 2, 1, 2), M(2, "scatter", 0), P(3), G(3, "venom", 3, 0),
      // FINAL-MEASURE: the long haul comes on day 6 at ordinary luck (the stand-in; FURNACE d5's ordinary value cap is 47
      // g on the merged par field), still day 5 at good luck (the warlord)
      ...good(soon(2, G2(3, "brake", 4, 4))), P(4), G(4, "heatjacket", 3, 4, 1), P(5), soon(5, G(6, "longhaul", 5, 1)), M(6, "flak", 0),
      G(7, "counterweight", 1, 2), G(8, "grease", 1, 4, 1), M2(9, "scatter", 0), G(9, "staticbrush", 5, 2),
    ],
  },
  // ---------------------------------------------------------------- Hard (tier 3)
  // STATIC WEB: an off-centre loom and a wide loop. Synergy: GALVANIC COILS, one from day 1 (2 stars from day 4) and a
  // second on another belt from day 5, a static brush from day 3 (2 stars from day 6) and a LODESTONE from day 6 that
  // hits harder for every stalled machine: shock after shock. Good luck: a long haul on day 3.
  silkshade: {
    hero: "weaver", crates: 0, synergy: ["coil", "lodestone"],
    factories: [F("loom", 2, 4, [2, 3, "L1U3"], [4, 4, "U4"], [3, 6, "R5U6"])],
    upgrades: [
      G(1, "coil", 3, 0), G(1, "temper", 5, 0, 3), M(2, "scatter", 1), G(2, "whetstone", 3, 1, 1), G(3, "staticbrush", 3, 3),
      ...good(G(3, "longhaul", 5, 1)), G2(4, "coil", 3, 0), G(4, "counterweight", 7, 0), G(5, "coil", 0, 0),
      G(5, "bellows", 7, 1), G(6, "lodestone", 4, 5, 1), G2(6, "staticbrush", 3, 3), G(6, "grease", 4, 7), M(7, "drake", 2),
      // FINAL-MEASURE: the drake's second star comes on day 9 at ordinary luck (the stand-in; WEAVER d8's ordinary ★2 cap is
      // 2 on the merged par field), still day 8 at good luck (the warlord)
      G(8, "venom", 3, 2), soon(8, M2(9, "drake", 2)), M(9, "flak", 0),
    ],
  },
  // RIG CHAIN: one long cinder belt. Synergy: a WHETSTONE from day 1 (2 stars from day 7) heads a chain of rigs
  // (venom, a counterweight, a hullbreaker core) that a LONG HAUL cashes in from day 5 (+2 damage per hit already
  // taken), then a temper and an overdrive: six rigs by day 8; a RAILGUN for the starting gun on day 9. Good luck: a
  // riveter on day 3 and a mantlet on the gun on day 7.
  longtooth: {
    hero: "furnace", crates: 0, synergy: ["longhaul", "whetstone"],
    factories: [F("kiln", 6, 7, [6, 6, "U1L4U2R2U3"])],
    upgrades: [
      G(1, "whetstone", 2, 2, 2), G(2, "venom", 3, 4, 1), G(3, "counterweight", 4, 4, 1), ...good(G(3, "riveter", 3, 1)),
      // FINAL-MEASURE (the Prime's ladder fix, oracle e2d655e0): good luck brings the whetstone's second star on day 6
      // (one day sooner; the warlord), so the Hard slot beats par on day 6 (rivals.difficulty)
      M(4, "hullbreaker", 0), G(5, "longhaul", 5, 3), G(6, "temper", 1, 4, 1), soon(6, G2(7, "whetstone", 2, 2)),
      ...good(M(7, "mantlet", 0)), G(8, "overdrive", 7, 6), T(9, "railgun", 0),
    ],
  },
  // TRIPLE THREAT: synergy: burn left (a TEMPER on the left belt from day 1, 2 stars from day 6), a LONG HAUL on the
  // right from day 4 (2 stars the same day) and a SPLITTER in the centre from day 5 (an epic: ordinary luck owns none
  // before day 5), behind a centre whetstone. A mortar core, grease, venom, a tollbooth, a sifter and a sorting arm
  // fill in. Good luck: a barbed spool on day 3, an overclocker on day 7 and the whetstone's second star on day 10.
  highspire: {
    hero: "weaver", crates: 0, synergy: ["temper", "splitter", "longhaul"],
    factories: [F("loom", 4, 6, [4, 5, "U5"], [3, 6, "L2U6"], [6, 6, "R2U6"])],
    upgrades: [
      G(1, "temper", 0, 2, 1), G(1, "whetstone", 3, 0, 1), M(2, "mortar", 0), G(2, "grease", 2, 5, 2), G(3, "venom", 0, 0),
      ...good(G(3, "barbed", 2, 0)), G(4, "longhaul", 7, 3), G(4, "tollbooth", 9, 3, 3), G2(4, "longhaul", 7, 3),
      G(5, "splitter", 3, 4), G2(6, "temper", 0, 2), G(6, "sifter", 7, 4, 1), ...good(G(7, "overclocker", 6, 5, 1)),
      G(8, "temper", 5, 0, 3), G(9, "sorting", 7, 5, 1), G(10, "quench", 9, 4), ...good(G2(10, "whetstone", 3, 0)),
    ],
  },
  // ---------------------------------------------------------------- Hard, days 8-10 only
  // GRAND FOUNDRY (the stars-aligned deck; she arrives on day 8): the kiln and a STAMP PRESS, heavy armor (three
  // plates on top of the PvE ramp). Synergy: a BRAKE SHOE and a LONG HAUL on the kiln's serpentine, the PRESS feeding
  // the second intake; a temper, a whetstone, a legendary LANCE core, and flak on day 9. Her value stays within
  // maxGoldByDay.
  matriarch: {
    hero: "furnace", crates: 1, synergy: ["press", "longhaul", "brake"],
    // 0.8.0 I1 M3 (VERIFIED-D1 Q8, DESIGN-wave3.md 8 Q8): the STAMP PRESS (epic) from day 2, when the per-run draw unlocks
    // epics; she is met on days 8-10 only, where her deck is exactly as tuned
    factories: [F("kiln", 2, 7, [2, 6, "L1U4R2U1R1U1"]), { ...F("press", 6, 6, [6, 5, "L1U5"]), at: 2 }],
    upgrades: [
      ...stars(
        P(8), P(8), P(8), G(8, "brake", 3, 0, 1), G(8, "longhaul", 6, 0), M(8, "lance", 0), G(8, "temper", 4, 2, 1),
        G(8, "whetstone", 6, 1, 3), M(9, "flak", 0),
      ),
    ],
  },
  // ---------------------------------------------------------------- 0.8.0 N1: the six wave-3 captains
  // 0.8.0 N1 (REQ-BFG-024, REQ-BFG-011, REQ-BFG-033; DESIGN-wave3 section 5, VERIFIED-D1 Q9-Q12): the six wave-3 captains.
  // D1's day-by-day purchases were placed (N1 M2), then each plan was regrown day by day by capsearch (output-N1/tools)
  // against the FURNACE par field (K 12) inside its own hero's luck caps (luckCapsData.ts: FOUNDRY and BASTION from N1
  // M1), the per-run draw's unlock days, R1 and the upload ceiling (a Hard captain's prize never beats today's best Hard
  // prize of the day, so src/net/roadCap.ts doesn't move: oracle 94b9559fbb7da299 (9)). Each keeps D1's synergy parts in
  // D1's order as its core; fills reach the slot's band (BRASSWICK's road deck about 30%, GRIMHOLD's about 50%, VOSS's and
  // KARSK's good-luck road decks 55-80%, LOCKJAW's and THISTLEMAIL's dusk decks about 55%) and the ladder
  // (tests/rivals.difficulty.test.ts). Every one fields a wave-3 TWIN or PLATE module from day 1 (oracle (8)).
  // ---------------------------------------------------------------- Easy (tier 1), FOUNDRY
  // MATCHED POUR: the Crucible's two mirrored belts into gun 1, so every pour fuses. Synergy: a TWIN GAUGE on a matched
  // belt from day 2 (3 damage a blank, not 1), a TWIN TRIGGER on gun 1 from day 3 (each fused alloy is a pair: 25% more,
  // 2 stars from day 7) and a TWIN MOULD from day 5 pouring two plain slugs into gun 2's two intakes (2 stars from day 9;
  // on day 4 it would lift him over HIGHSPIRE, the ladder). Nothing else: a STEAM BREECH on gun 1 from day 1 (his wave-3
  // part, weak enough to keep an Easy deck under every Hard captain on day 1). The synergy is the deck, so it pays most.
  brasswick: {
    hero: "foundry", crates: 0, synergy: ["twingauge", "twinmould", "twintrigger"],
    factories: [F("crucible", 2, 6, [2, 5, "U5"], [3, 5, "U5"])],
    upgrades: [
      M(1, "steambreech", 0), G(2, "twingauge", 4, 0, 3), M(3, "twintrigger", 0),
      X(5, F("twinmould", 6, 2, [6, 1, "U"], [7, 1, "U"])), M2(7, "twintrigger", 0), G2(9, "twinmould", 6, 2),
    ],
  },
  // ---------------------------------------------------------------- Hard (tier 3), FOUNDRY
  // LOCKSTEP: the Crucible's belts run up columns 1 and 4 into gun 1, so a TWIN LATCH at (3,2) works both and lets each
  // pair of blanks go together. Synergy: the TWIN LATCH (day 2, 2 stars from day 9), a TWIN TRIGGER on gun 1 from day 1
  // (each fused alloy a pair: 2 stars from day 4, 55% more) and a COMPOUND BREECH from day 5 packing two alloys into one
  // shell (2 stars from day 7); a PLATE ROLLER and a counterweight fill in. Gun 2 stays dark: every gold buys gun 1's
  // lockstep. Good luck (the road deck) adds a temper on day 2, a tollbooth on day 5, a pincer on day 6 and venom on day 9.
  voss: {
    hero: "foundry", crates: 0, synergy: ["twinlatch", "twintrigger", "compound"],
    factories: [F("crucible", 2, 6, [2, 5, "LU3RU2"], [4, 6, "U5LU"])],
    upgrades: [
      G(1, "plateroller", 1, 0, 1), M(1, "twintrigger", 0), G(2, "twinlatch", 3, 2), ...good(G(2, "temper", 1, 1, 1)),
      G(3, "counterweight", 4, 0), M2(4, "twintrigger", 0), M(5, "compound", 0), ...good(G(5, "tollbooth", 5, 1, 3)),
      ...good(G(6, "pincer", 0, 2, 1)), M2(7, "compound", 0), G2(9, "twinlatch", 3, 2), ...good(G(9, "venom", 3, 5)),
    ],
  },
  // ---------------------------------------------------------------- Medium (tier 2), BASTION
  // ANVIL WALL: the Wardworks' bulwark belt plates the hull as it fires, and plating makes every shot hit harder. Synergy:
  // PLATE ROLLERS on the bulwark belt (day 1, 2 stars from day 3; a second roller on day 3), an ANVIL BREECH in the heavy
  // gun's socket from day 2 (2 stars from day 5: 2.2 and 0.4 more for each plating) and a SPALL CATCHER from day 4. A
  // tollbooth, a temper (2 stars on day 10), a whetstone and a quench tank (2 stars on day 9) fill in, and an ARMOR
  // PRESS feeds connector 5 from day 7, more plating. (Its synergy check misses: a same-price MORTAR or GATLING outdamages
  // the ANVIL BREECH on BASTION's heavy gun at any plating it reaches; B1's PLATE item, oracle 043ce6256cb5ccf9.)
  grimhold: {
    hero: "bastion", crates: 0, synergy: ["plateroller", "anvil", "spallcatcher"],
    factories: [F("wardworks", 4, 6, [4, 5, "U5"])],
    upgrades: [
      G(1, "plateroller", 3, 0, 1), G(1, "tollbooth", 3, 1, 1), M(2, "anvil", 0), G(2, "temper", 3, 2, 1),
      G2(3, "plateroller", 3, 0), G(3, "plateroller", 5, 2, 3), G(3, "whetstone", 3, 3, 1), M(4, "spallcatcher", 0),
      M2(5, "anvil", 0), G(6, "quench", 5, 3), X(7, F("armorpress", 6, 6, [6, 5, "U4LU"])), G2(9, "quench", 5, 3),
      G2(10, "temper", 3, 2),
    ],
  },
  // SHIELD WALL: a wall of plate on the bulwark belt, broken into damage. Synergy: a PLATE BREAKER on the bulwark belt
  // from day 5 (each payload takes a plating for 4 more damage) and an ARMOR PRESS into connector 5 from day 8 (plating
  // every 4 seconds); at good luck a SHIELD WALL from day 8 (oracle 94b9559fbb7da299 (10): his one good-luck-only
  // synergy part; BASTION's ordinary epic+ cap of 2 holds the other two). A PLATE ROLLER and a BRACE FRAME (days 1-2), a
  // STEAM BREECH and a SPALL CATCHER (day 3) work the plating; a twin gauge, tempers, a brush, grease, a coil and venom
  // fill in. Good luck: the temper's second star on day 2, a plate on day 6, a pincer on day 7. (Synergy check: a content
  // miss for B1, oracle 043ce6256cb5ccf9: a same-price SORTING arm beats the PLATE BREAKER.)
  karsk: {
    hero: "bastion", crates: 0, synergy: ["shieldwall", "platebreaker", "armorpress"],
    factories: [F("wardworks", 4, 6, [4, 5, "U5"])],
    upgrades: [
      G(1, "plateroller", 3, 0, 1), G(1, "twingauge", 3, 3, 1), G(2, "braceframe", 3, 1), G(2, "temper", 5, 3, 3),
      M(3, "steambreech", 0), M(3, "spallcatcher", 0), G(4, "staticbrush", 3, 4), G(4, "grease", 3, 5, 1),
      G(5, "platebreaker", 3, 2), G(5, "coil", 5, 2, 2), soon(2, G2(6, "temper", 5, 3)), ...good(P(6)),
      ...good(G(7, "pincer", 5, 4, 3)), X(8, F("armorpress", 6, 6, [6, 5, "U4LU"])), ...good(G(8, "shieldwall", 6, 0)),
      G(9, "venom", 5, 5),
    ],
  },
  // ---------------------------------------------------------------- dusk stand-ins only (standInOnly), FURNACE and WEAVER
  // TWIN BITE: an 8-tile Kiln belt into connector 4 and a TWIN MOULD's 8-tile belt into connector 5 (day 2, 2 stars from
  // day 6), latched so their slugs land together. Synergy: the TWIN LATCH between them from day 3, the TWIN MOULD, and
  // TWIN GAUGES on the matched Kiln belt (day 1, 2 stars from day 3; a second gauge on day 6). The pairs pay a TWIN
  // TRIGGER from day 5; a whetstone, a temper (2 stars on day 9), bellows, a pincer, a counterweight (day 7), a long haul
  // (day 8), quench, grease and a second temper (day 9) fill in, and on day 10 a RAMPART takes gun 2, fed by a DOUBLE
  // STAMP. (No COMPOUND BREECH: from day 8 it lifted his dusk deck over the stand-ins' 80% ceiling.)
  lockjaw: {
    hero: "furnace", crates: 0, synergy: ["twinlatch", "twinmould", "twingauge"],
    factories: [F("kiln", 2, 6, [2, 5, "RU4RU"])],
    upgrades: [
      G(1, "twingauge", 3, 0, 1), G(1, "whetstone", 2, 1, 1), X(2, F("twinmould", 6, 6, [7, 5, "L2U5"]), 1),
      G(3, "twinlatch", 4, 5), G2(3, "twingauge", 3, 0), G(4, "temper", 2, 2, 1), G(4, "bellows", 6, 0),
      M(5, "twintrigger", 0), G(5, "pincer", 5, 6), G2(6, "twinmould", 6, 6), G(6, "twingauge", 2, 3, 1),
      G(7, "counterweight", 4, 3), G(8, "longhaul", 4, 4), G(9, "quench", 4, 2), G2(9, "temper", 2, 2),
      G(9, "grease", 2, 4, 2), G(9, "temper", 6, 4, 3), T(10, "rampart", 1), X(10, F("doublestamp", 6, 1, [8, 1, "U"])),
    ],
  },
  // LEAF MAIL: a PLATE ROLLER on the loom's left belt plates her hull from day 1, and plated her guns fire faster.
  // Synergy: the PLATE ROLLER, a STEAM BREECH on gun 1 (day 1) and a SPALL CATCHER on gun 1 from day 4 (damage she takes
  // charges the next shot, soaked plating twice). A mortar on gun 3 (day 3, 2 stars from day 5), flak, venom, a temper,
  // a pincer, bellows and a splitter hold her near the dusk band. (Synergy check: a content miss for B1, oracle
  // 043ce6256cb5ccf9: WEAVER's light guns wait for loads, so the STEAM BREECH's faster fire adds almost nothing.)
  thistlemail: {
    hero: "weaver", crates: 0, synergy: ["plateroller", "steambreech", "spallcatcher"],
    factories: [F("loom", 4, 5, [4, 4, "U4"], [3, 5, "L2U5"], [6, 5, "R2U5"])],
    upgrades: [
      G(1, "plateroller", 0, 0, 1), M(1, "steambreech", 0), G(2, "venom", 3, 2), G(2, "temper", 3, 0, 1),
      M(3, "flak", 1), M(3, "mortar", 2), M(4, "spallcatcher", 0), M2(5, "mortar", 2), G(6, "pincer", 5, 2, 3),
      G(7, "bellows", 7, 0), G(9, "splitter", 3, 3),
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
  plan.factories.forEach((f, i) => { if ((f.at ?? 1) <= day) addFactory(f, U + 1 + i); }); // 0.8.0 I1: FactoryPlan.at
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
