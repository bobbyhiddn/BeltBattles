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

import {
  HEROES, ITEMS, START_GOLD, UPGRADE_PRICE, incomeFor, type HeroId, type Upgrades, type UpgradeTrack,
} from "./content";
import { sustainLive } from "./content"; // BOTS-X (SUS-C, REQ-BFG-069): RivalPlan.sustain, only while the switch is on
import { installTurret, key, rotField, setTurretList, turretList, turretsCost, type Build, type ModPlacement, type Placed } from "./deck";
import { warlordHull } from "./ai";
import { migrateDeck } from "./beltside";
import { FUSE_MAX, starsOf, upgradeGold, valueOf } from "./stars";
import type { RivalId } from "./rivals";
import { runeGrants } from "./runes"; // BOTS-X (REQ-BFG-058): a captain's HULL and BELT runes (captainRunesOn)

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
  // BOTS-X (SUS-C, REQ-BFG-069; SUSTAIN-1 4.8 rule 7): the upgrades the plan adds while the sustain switch is on
  // (content.ts sustainLive), taken after `upgrades` (their uids follow it, so every other part keeps its uid). Off, planBuild
  // never reads them: every captain deck, and every test that walks `upgrades`, is exactly as before
  sustain?: Upgrade[];
  // 0.8.9 (CATCHUP-089 fallback 2; cap's ruling Q1 e2ca295ce9dcd60a): PvE plates by day (day -> plates), armor the road
  // warlord carries free on that day, like the hull ramp (+250 hull each, the ARMOR PACK's), on the days a Hard captain
  // was still under 0.55 against the par fields after its packs and its gold ran short of the par field's pack count:
  // the count less its paid plates. In the road deck's hull only (good luck and better), never in its value, and never
  // in the stand-in deck (rivals.ts standInBuild builds its hull from the paid plating alone).
  pve?: Readonly<Partial<Record<number, number>>>;
}

export interface RivalLoadout {
  build: Build;
  crates: number;
  plating: number; // paid plating (the ARMOR PACKs the plan bought)
  pvePlates: number; // 0.8.9 (CATCHUP-089 fallback 2): free PvE plates in the hull, not paid (0 at ordinary luck)
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
// 0.8.9 (job CATCHUP-089, REQ-BFG-024, REQ-BFG-051; cap's ruling on PACKS Q10, oracle c6b7a0aae081a6a3, option 1): the
// par field buys ARMOR PACKs (0.8.6), so the captains buy them too: P() is an ARMOR PACK (5 g, +250 hull), bought up to
// the par field's mean count for the captain's hero and day (par players 1-24, rounded), with only the gold the plan
// leaves over: capsearch's packs mode added, day by day, the most packs that keep every deck within maxGoldByDay and its
// luck caps, the roadCap guard, and the stand-in deck's gold upgrades (captainLevels). Each P() sits at the end of its
// day, so earlier parts keep their uids. A Hard captain's packs are owned by its good-luck road deck too: where that deck
// can't afford them, its gold upgrades (FACTORY / TURRET SPEED level 2) come on the first later day its gold allows
// (captainLevels' own rule), or not at all when no day up to 10 holds them (cap's ruling Q1 e2ca295ce9dcd60a, (B)).
export const PLANS: Record<RivalId, RivalPlan> = {
  // ---------------------------------------------------------------- Easy (tier 1)
  // SHORT STITCH: the loom parked right under the guns on three short stitches. Synergy: a WHETSTONE on the centre
  // stitch from day 1 (2 stars from day 5) and a ROTARY core (fires the oldest load first) from day 2: short belts that
  // fire first. It grows with poison, burn (a temper, a keg, a drake core) and a sorting arm.
  nettle: {
    hero: "weaver", crates: 0, synergy: ["whetstone", "rotary"],
    factories: [F("loom", 4, 2, [4, 1, "U1"], [3, 2, "L2U2"], [6, 2, "R2U2"])],
    upgrades: [
      // bb-0.8.3 (job BELTS run 4): the sorting arm on day 7 (was 6): with the uniform rule's LOOM level on day 6 she sat
      // below HIGHSPIRE (Hard) on day 6 (rivals.difficulty)
      G(1, "whetstone", 3, 0, 1), G(2, "venom", 5, 0), M(2, "rotary", 1), G(3, "temper", 0, 0, 1), G(3, "keg", 2, 1, 1),
      // bb-0.8.6 (job PACKS M4, the packs' regenerated caps): the quench tank on day 10 (was 9; WEAVER's day-9 ordinary
      // rare cap is 6)
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 0/0/2/2/2/2/2/3 on days 3-10, under the WEAVER par field's 1/1/2/3/4/5/5/7: with
      // the full count her Easy road deck beat par (47-67% on days 6-10) and stood above the Hard captains (the ladder);
      // the least trim that passes it (cap's ruling Q2 f77489ebe2e11698; capsearch lfix), and her day-3 pack on day 5
      // once SILKSHADE's day-3 pack left for the walls (the ladder on day 4)
      M(4, "drake", 0), G2(5, "whetstone", 3, 0), P(5, 2), G(7, "sorting", 3, 1, 1), M(8, "flak", 0),
      G(8, "overclocker", 0, 1), G(10, "quench", 2, 0), P(10),
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
      // bb-0.8.6 (job PACKS M4): the DOUBLE STAMP on day 2 (was 1; FURNACE's day-1 ordinary rare cap is 0)
      X(2, F("doublestamp", 8, 1, [9, 3, "L2ULULU"])), G(2, "whetstone", 6, 0, 2), G(2, "temper", 7, 1, 2),
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/2/2/2/3/4 on days 3-10, under the FURNACE par field's 1/1/2/3/4/5/6/7: the
      // gold allowed 1/1/2/3/3/3/5/6, and with it his Easy road deck stood above THANE KARSK (the ladder) on days 8-10; the
      // least trim that passes it (cap's ruling Q2 f77489ebe2e11698; capsearch lfix: days 8-10, and days 6-7 with day 8)
      G(2, "brake", 3, 4, 1), G(3, "keg", 5, 2), P(3), M(4, "flak", 0), G(5, "staticbrush", 6, 3), P(5), G2(6, "temper", 7, 1),
      G2(7, "whetstone", 6, 0), M(8, "drake", 0), G(9, "surge", 9, 4, 1), P(9), G(10, "longhaul", 3, 0), P(10),
    ],
  },
  // OVERCLOCK: a short kiln belt with a whetstone, a counterweight and a brake (2 stars from day 7). Synergy: a
  // CALIBRATE on the gun from day 3 (2 stars from day 7) and an OVERDRIVE on the kiln belt from day 6 (a legendary:
  // ordinary luck owns no epic or legendary before day 6). Then a temper, a gatling core, quench, venom, a tollbooth, a
  // surge valve and a long haul.
  ratchet: {
    hero: "furnace", crates: 0, synergy: ["overdrive", "calibrate"],
    factories: [F("kiln", 2, 6, [3, 5, "R1U5"])],
    upgrades: [
      // FINAL-MEASURE (the Prime's ladder fix, oracle e2d655e0): the whetstone comes on day 2 (was 1), the counterweight
      // and the brake on day 3 (were 2), and the tollbooth, surge valve and long haul on day 9 (were 8), so the Easy
      // OVERCLOCK stays easier than every Hard warlord on day 1 and than every Medium on days 2 and 8 (rivals.difficulty)
      // bb-0.8.3 (REQ-BFG-043 D7', job BELTS run 4): the luck caps regenerated with the par player buying its gold
      // upgrades fell (ordinary FURNACE: no epic or legendary before day 6, 4 rares on day 5, 5 on day 6, no bought turret
      // on any day), so the least change: the OVERDRIVE on day 6 (was 5), the venom on day 7 (was 6), no DART GUN (was 9)
      // bb-0.8.6 (job PACKS M4): under the packs' caps (ordinary FURNACE: no epic+ before day 7, rare+ 4/5/5/6/7 on days
      // 6-10) the OVERDRIVE on day 7 (was 6), a sifter (common) for the venom (day 7) and the long haul on day 10 (was 9)
      // FLIP-X2 (REVIEW-NUM3 answer 2; oracle 77e35129477cb4ca): SIFTER dormant, its sifter removed (value -3 g from day 7)
      G(2, "whetstone", 3, 2, 1), G(3, "counterweight", 3, 0), G(3, "brake", 5, 5, 3), M(3, "calibrate", 0),
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/1/1/1/2/3/4 on days 3-10 (the FURNACE par field's 1/1/2/3/4/5/6/7: his day-7
      // OVERDRIVE leaves no gold for more beside his gold upgrades)
      G(3, "temper", 3, 3, 1), P(3), M(4, "gatling", 0), G(5, "quench", 3, 1), G(7, "overdrive", 5, 3),
      M2(7, "calibrate", 0), G2(7, "brake", 5, 5), P(8), G(9, "tollbooth", 5, 1, 3), G(9, "surge", 4, 6, 1), P(9),
      G(10, "longhaul", 5, 4), P(10),
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
      // 0.8.0 B1 M3 (capsearch; output-B1/m3/O13-NOTES.md): the stand-in's long haul back to day 3, the static brush,
      // riveter and venom later at ordinary luck (soon() keeps the warlord's days): stand-in at most 76 on days 6-10, and
      // day 8 above the Iron Matriarch's margin (B1_EXCEPTIONS emptied)
      // bb-0.8.3 (job BELTS run 4): the SPLITTER on day 6 at ordinary luck (was 5; the stand-in's day-5 epic cap fell to
      // 0); soon() keeps the warlord's day 5
      // bb-0.8.6 (job PACKS M4): at ordinary luck the BARBED SPOOL on day 2 (was 1) and the venom on day 10 (was 9; WEAVER's
      // ordinary rare caps 0 on day 1 and 6 on day 9), soon() keeping the warlord's days 1 and 9; the static brush on day 7
      // at good luck too (was 6: the good rare cap is 5 on day 6)
      G(1, "temper", 3, 1, 1), soon(1, G(2, "barbed", 3, 0)), M(2, "scatter", 1), P(2), P(3), G(3, "longhaul", 5, 0),
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs on her two plates, 3/3/5/5/7 in all on
      // days 6-10 (the WEAVER par field's 3/4/5/5/7; a day-7 pack: her road deck's FACTORY level 2 would leave again)
      M(4, "flak", 0), soon(5, G(6, "splitter", 2, 4, 2)), P(6), G(7, "staticbrush", 0, 1), soon(6, G(8, "riveter", 5, 1)),
      P(8, 2), ...good(G(9, "counterweight", 2, 0)), soon(9, G(10, "venom", 0, 0)), ...good(G2(10, "temper", 3, 1)), P(10, 2),
    ],
    // 0.8.9 (CATCHUP-089 fallback 2): her road deck read 46% on day 7 with 3 of the 4 packs: one PvE plate that day
    pve: { 7: 1 },
  },
  // ---------------------------------------------------------------- Medium (tier 2)
  // SLOW COOKER: the kiln at the back, one 13-tile serpentine so every slug cooks on the way. Synergy: the ride-time
  // rigs that pay off a long belt: a HEAT JACKET from day 3 (2 stars from day 6), BELLOWS from day 4 and a
  // COUNTERWEIGHT from day 6, with a quench tank, a temper, a whetstone, a long haul and venom.
  sootjaw: {
    hero: "furnace", crates: 0, synergy: ["counterweight", "heatjacket", "bellows"],
    factories: [F("kiln", 4, 7, [4, 6, "L3U2R2U2R1U2"])],
    upgrades: [
      // FINAL-MEASURE (the Prime's ladder fix, oracle e2d655e0): the quench tank comes on day 2 (was 1), so on day 1 the
      // Medium slot stays 0.05 easier than Hard (rivals.difficulty), whose decks sit at the day-1 good-luck cap
      G(2, "quench", 3, 0), G(2, "temper", 3, 1, 1), G(3, "heatjacket", 2, 5, 1), M(3, "scatter", 0), P(3),
      G(4, "bellows", 5, 2),
      // bb-0.8.3 (job BELTS run 4): no SPIKE GUN (was day 9): the regenerated caps' ordinary FURNACE turret cap is 0 on
      // every day
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/3/3/4/6/7 on days 3-10 (the FURNACE par field's 1/1/2/3/4/5/6/7)
      G(5, "whetstone", 5, 1, 3), P(5), G(6, "counterweight", 4, 3, 1), G2(6, "heatjacket", 2, 5), P(6), G(7, "longhaul", 2, 3),
      P(8), G(9, "venom", 3, 5, 1), P(9, 2), P(10),
    ],
  },
  // SHOCK TROOPER: synergy: a GALVANIC COIL on the kiln belt from day 1 (2 stars from day 7) stalls the enemy
  // machinery, a LODESTONE from day 3 hits harder for every stalled machine, and a TESLA core from day 6 arcs to the
  // nearest machine. Filled with a temper, whetstone, tollbooth, long haul and surge valve.
  sparkfang: {
    hero: "furnace", crates: 0, synergy: ["coil", "lodestone", "tesla"],
    factories: [F("kiln", 4, 6, [4, 5, "L2U3R2U2"])],
    upgrades: [
      // bb-0.8.6 (job PACKS M4): the coil on day 2 (was 1) and the TESLA core on day 7 (was 6): FURNACE's ordinary rare
      // cap is 0 on day 1, its epic cap 0 until day 7
      // FLIP-X2 (REVIEW-NUM3 answer 2; oracle 77e35129477cb4ca): SIFTER dormant, its sifter removed (value -3 g from day 4)
      G(2, "coil", 3, 1, 1), G(2, "temper", 3, 0, 1), G(3, "lodestone", 5, 1), G(3, "whetstone", 1, 3, 1),
      G(3, "tollbooth", 5, 2, 3), P(3), G(4, "longhaul", 4, 3, 1), G(5, "surge", 1, 5), P(5),
      M(7, "tesla", 0),
      // bb-0.8.3 (job BELTS run 4): no DART GUN (was day 9): no ordinary FURNACE turret on any day under the regenerated caps
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/2/2/2/5/7 on days 3-10 (the FURNACE par field's 1/1/2/3/4/5/6/7: his day-7
      // TESLA core leaves no gold for more beside his gold upgrades until day 9)
      G2(7, "coil", 3, 1), G2(8, "temper", 3, 0), P(9, 3), P(10, 2),
    ],
  },
  // SPLITTER SWARM: synergy: a WHETSTONE from day 1 ahead of the SPLITTER, so both copies gain it. Splitters are epics,
  // so at ordinary luck they come later: one on the centre belt on day 6 (2 stars on day 8), another on day 9. Until
  // then a scatter core, a temper, venom, a keg and a long haul hold the line.
  lacewing: {
    hero: "weaver", crates: 0, synergy: ["splitter", "whetstone"],
    factories: [F("loom", 4, 4, [4, 3, "U3"], [3, 4, "L2U4"], [6, 4, "R2U4"])],
    upgrades: [
      // 0.8.0 B1 M3: the keg before the venom (day 3, the venom day 4) and the first splitter on day 7, not 6: her day-3
      // and day-6 decks read 83 and 81 vs the FURNACE field (K 24), over the stand-ins' 80
      G(1, "whetstone", 3, 0, 1), M(1, "scatter", 1), G(2, "temper", 3, 1, 1), G(3, "keg", 7, 0), P(3), G(4, "venom", 3, 2),
      // bb-0.8.6 (job PACKS M4): no second splitter (was day 9): WEAVER's ordinary epic+ cap is 1 on days 9 and 10
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/3/3/5/5/7 on days 3-10 (the WEAVER par field's count, but day 7's pack
      // comes on day 8: with it the Medium slot came within 0.05 of the Hard one on day 7, the ladder; the least trim that
      // clears it, cap's ruling Q2 f77489ebe2e11698; capsearch lfix)
      G(5, "longhaul", 5, 2), P(5), P(6), G(7, "splitter", 5, 1), G2(8, "splitter", 5, 1), G(8, "grease", 3, 3, 2),
      G(8, "brake", 0, 0, 1), P(8, 2), P(10, 2),
    ],
  },
  // EMBER WEAVE: synergy: a TEMPER on the centre thread from day 1 (2 stars from day 4), a DRAKE core from day 3 (flat
  // damage turns to burn), BELLOWS on the right thread from day 5 and a second temper on the left from day 6: from
  // day 6 every belt burns. Venom, a whetstone, a pressure core, flak, a sorting arm and a long haul fill in.
  emberlyn: {
    hero: "weaver", crates: 0, synergy: ["temper", "bellows", "drake"],
    factories: [F("loom", 4, 5, [4, 4, "U4"], [3, 5, "L2U5"], [6, 5, "R2U5"])],
    upgrades: [
      // bb-0.8.6 (job PACKS M4): the static brush on day 7 (was 5) and the long haul on day 10 (was 9): WEAVER's ordinary
      // rare caps are 3, 4 and 6 on days 5, 6 and 9
      G(1, "temper", 3, 3, 1), G(2, "venom", 3, 0), M(3, "drake", 1), G(3, "whetstone", 5, 0, 3), M(3, "pressure", 0),
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/2/2/4/5/7 on days 3-10 (the WEAVER par field's 1/1/2/3/4/5/5/7: days 6-7
      // keep her gold upgrade)
      P(3), G2(4, "temper", 3, 3), G(5, "bellows", 7, 2), P(5), G(6, "temper", 0, 1, 1), M(6, "flak", 0), G(7, "staticbrush", 3, 2),
      G2(7, "whetstone", 5, 0), G(8, "sorting", 3, 4, 1), P(8, 2), P(9), G(10, "longhaul", 3, 1), P(10, 2),
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
      // 0.8.0 B1 M3: the quench, venom and day-4 brake star later at ordinary luck (soon() keeps the warlord's days), so
      // the stand-in reads at most 80 (day 1 was 82, day 3 84); the warlord deck is unchanged
      G(1, "brake", 4, 4, 2), soon(1, G(2, "quench", 3, 1)), G(2, "temper", 2, 1, 2), M(2, "scatter", 0), P(3),
      soon(3, G(4, "venom", 3, 0)), ...good(soon(2, G2(4, "brake", 4, 4))), P(4), G(4, "heatjacket", 3, 4, 1), P(5),
      // bb-0.8.6 (job PACKS M4): at ordinary luck the flak on day 7 (was 6) and the counterweight on day 9 (was 7):
      // FURNACE's ordinary rare caps are 4, 5 and 5 on days 6-8; soon() keeps the warlord's days. The ladder (the Hard mean
      // below 0 on day 7): the good-luck grease on day 7 (was 8)
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs on his three plates, 4/5/6/7 in all on
      // days 7-10 (the FURNACE par field's count), as his stand-in's gold allows; his good-luck road deck pays for them
      // with its TURRET SPEED level 2 (day 8 before; no later day's gold holds it)
      soon(5, G(6, "longhaul", 5, 1)), soon(6, M(7, "flak", 0)), P(7), P(8), soon(7, G(9, "counterweight", 1, 2)),
      soon(7, G(9, "grease", 1, 4, 1)), M2(9, "scatter", 0), ...good(G(9, "staticbrush", 5, 2)), P(9), P(10),
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
      // 0.8.0 B1 M3: the whetstone, counterweight, second coil, bellows and drake later at ordinary luck (soon() keeps the
      // warlord's days): stand-in at most 69 on days 2-10 (was 79-93), and days 8-9 above the Iron Matriarch's margin
      // bb-0.8.6 (job PACKS M4): the packs' caps (WEAVER rare+: ordinary 0 on day 1 and 4 on day 6, good 4-7 on days
      // 5-8 and 9 on day 10): at ordinary luck the coil on day 2 (was 1) and the drake core on day 8 (was 7), soon()
      // keeping the warlord's days 1 and 7; a sifter (common) for the counterweight; the good-luck long haul on day 8 (was
      // 3); both coils kept (tests/presets.fusion); and (the ladder: the Hard mean below 0 on days 5-8) the static brush's
      // second star on day 5 at good luck (ordinary: day 9)
      // FLIP-X2 (REVIEW-NUM3 answer 2; oracle 77e35129477cb4ca): SIFTER dormant, its sifter removed (value -3 g from day 6;
      // day 4 at good luck)
      G(1, "temper", 5, 0, 3), soon(1, G(2, "coil", 3, 0)), M(2, "scatter", 1), soon(2, G(3, "whetstone", 3, 1, 1)),
      // bb-0.8.3 (job BELTS run 4): the bellows on day 7 at ordinary luck (was 6; the stand-in's day-6 rare cap is 5);
      // soon() keeps the warlord's day 5
      G(3, "staticbrush", 3, 3), G2(4, "coil", 3, 0),
      soon(5, G(6, "coil", 0, 0)), G(6, "lodestone", 4, 5, 1),
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs 0/0/0/1/2/3/5/7 on days 3-10 (the WEAVER par
      // field's 1/1/2/3/4/5/5/7), as her stand-in's gold allows (days 5-6: the luck caps' value); her good-luck road deck
      // pays for them with its FACTORY level 2 (day 7 before; no later day's gold holds it). The walls (cap's ruling Q2
      // f77489ebe2e11698): her day-3 pack comes on day 6, so the par field's top quartile beats her day-5 road deck 44%
      // of the time again, as at 1210ee8
      ...good(G(6, "grease", 4, 7)), P(6), soon(5, G(7, "bellows", 7, 1)), P(7), soon(7, M(8, "drake", 2)), ...good(G(8, "longhaul", 5, 1)),
      P(8), soon(5, G2(9, "staticbrush", 3, 3)), P(9, 2),
      ...good(G(10, "venom", 3, 2)), ...good(M2(10, "drake", 2)), ...good(M(10, "flak", 0)), P(10, 2),
    ],
    // 0.8.9 (CATCHUP-089 fallback 2): her road deck read 53/51/50% on days 6-8 with 1/2/3 of the 3/4/5 packs: two PvE
    // plates on each of those days
    pve: { 6: 2, 7: 2, 8: 2 },
  },
  // RIG CHAIN: one long cinder belt. Synergy: a WHETSTONE from day 1 (2 stars from day 7) heads a chain of rigs
  // (venom, a counterweight, a hullbreaker core) that a LONG HAUL cashes in from day 5 (+2 damage per hit already
  // taken), then a temper and an overdrive: six rigs by day 8. Good luck: a riveter on day 3, a mantlet on the gun on
  // day 7 and a RAILGUN for the starting gun on day 9.
  longtooth: {
    hero: "furnace", crates: 0, synergy: ["longhaul", "whetstone"],
    factories: [F("kiln", 6, 7, [6, 6, "U1L4U2R2U3"])],
    upgrades: [
      // 0.8.0 B1 M3: the whetstone, venom, counterweight and riveter a day later at ordinary luck (soon() keeps the
      // warlord's days): his day-2 stand-in read 96, over the stand-ins' 80; the warlord deck is unchanged
      soon(1, G(2, "whetstone", 2, 2, 2)), soon(2, G(3, "venom", 3, 4, 1)), soon(3, G(4, "counterweight", 4, 4, 1)),
      ...good(soon(3, G(4, "riveter", 3, 1))), M(4, "hullbreaker", 0), G(5, "longhaul", 5, 3), P(5), G(6, "temper", 1, 4, 1),
      // bb-0.8.3 (job BELTS run 4): the RAILGUN at good luck only (the warlord's day 9 kept): the regenerated caps give the
      // stand-in no bought turret on any day and one epic+ on day 9 (its OVERDRIVE)
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs 0/0/1/3/3/3/3/5 on days 3-10 (the FURNACE
      // par field's 1/1/2/3/4/5/6/7; days 7-8: the luck caps' value; days 9-10: his road deck's TURRET SPEED level 2 would
      // leave again). The walls (cap's ruling Q2 f77489ebe2e11698): the gold allowed 1/1/2 on days 3-5, and with them the
      // par field's top quartile beat his road deck only 11-39% of the time (66-84% at 1210ee8): none before day 5 and
      // one on day 5 (61%), the other two on day 6
      G2(6, "whetstone", 2, 2), P(6, 2), M(7, "mantlet", 0), G(8, "overdrive", 7, 6), ...good(T(9, "railgun", 0)), P(10, 2),
    ],
  },
  // TRIPLE THREAT: synergy: burn left (a TEMPER on the left belt from day 1, 2 stars from day 6), a LONG HAUL on the
  // right from day 4 (2 stars the same day) and a SPLITTER in the centre from day 5 (an epic: ordinary luck owns none
  // before day 5), behind a centre whetstone. A mortar core, grease, venom, a tollbooth and a sorting arm
  // fill in. Good luck: a barbed spool on day 3, an overclocker on day 7 and the whetstone's second star on day 10.
  highspire: {
    hero: "weaver", crates: 0, synergy: ["temper", "splitter", "longhaul"],
    factories: [F("loom", 4, 6, [4, 5, "U5"], [3, 6, "L2U6"], [6, 6, "R2U6"])],
    upgrades: [
      // 0.8.0 B1 M3: the stand-in takes some good-luck parts sooner (its daily mean), the warlord deck is unchanged
      // bb-0.8.3 (job BELTS run 4): at ordinary luck the barbed spool on day 5 (was 4) and the SPLITTER on day 6 (was 5):
      // the stand-in's rare caps are 3 on day 4 and 4 on day 5, its epic cap 0 on day 5; soon() keeps the warlord's days
      G(1, "temper", 0, 2, 1), G(1, "whetstone", 3, 0, 1), M(2, "mortar", 0), G(2, "grease", 2, 5, 2),
      // bb-0.8.6 (job PACKS M4): the packs' WEAVER caps (rare+ ordinary 3/4/5 on days 5-7, epic+ ordinary 1, good 4 on day
      // 5): the barbed spool on day 7 at ordinary luck and day 6 at good luck (were 5 and 3), the overclocker on day 8 at
      // ordinary luck (was 7; soon() keeps the warlord's day 7) and the sorting arm at good luck only (still day 9)
      // FLIP-X2 (REVIEW-NUM3 answer 2; oracle 77e35129477cb4ca): SIFTER dormant, its sifter removed (value -3 g from day 6)
      G(3, "venom", 0, 0), G(4, "longhaul", 7, 3), G(4, "tollbooth", 9, 3, 3), G2(4, "longhaul", 7, 3),
      soon(5, G(6, "splitter", 3, 4)), G2(6, "temper", 0, 2), soon(6, G(7, "barbed", 2, 0)), P(7),
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs 1/2/4/4 on days 7-10 (the WEAVER par field's
      // 4/5/5/7), as her stand-in's gold allows beside its gold upgrade; her good-luck road deck takes its FACTORY level 2
      // on day 8 (was 7) to pay for them
      soon(7, G(8, "overclocker", 6, 5, 1)), G(8, "temper", 5, 0, 3), P(8), ...good(G(9, "sorting", 7, 5, 1)), P(9, 2),
      ...good(G(10, "quench", 9, 4)), ...good(G2(10, "whetstone", 3, 0)),
    ],
    // 0.8.9 (CATCHUP-089 fallback 2): her road deck read 40/30/29/30% on days 4-7 with 0/0/0/1 of the 1/2/3/4 packs: PvE
    // plates up to the count on those days
    pve: { 4: 1, 5: 2, 6: 3, 7: 3 },
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
      // bb-0.8.3 (REQ-BFG-043, job BELTS run 4): with the uniform rule's levels SILKSHADE and OLD BULWARK sat below her
      // margin on days 9 and 10 (rivals.difficulty); capsearch mgrow (the ladder's own measure) grew her day 9, the least
      // change, within maxGoldByDay: the temper's second star (value 74 -> 77; days 9 and 10 -0.439 -> -0.632 and
      // -0.402 -> -0.664, below SILKSHADE's -0.546 and -0.647; output-belts/measure/capsearch-r4)
      // bb-0.8.6 (job PACKS M4, the packs' caps and par field): the regrown SILKSHADE sat below her margin on day 8
      // (-0.220 vs -0.117) and 10 (-0.356 vs -0.318; rivals.difficulty); capsearch mgrow (the ladder's own measure), the
      // least change within maxGoldByDay: the temper's second star on day 8 (was 9; day 8 -0.369) and a second temper on
      // day 10 (value 77 -> 80; day 10 -0.437)
      // 0.8.9 (CATCHUP-089, cap's ruling Q2 f77489ebe2e11698, the walls): no ARMOR PACKs beside her three plates. With the
      // 1/3/4 more her gold allowed on days 8-10 the par field's top decile beat her day-10 deck 3% of the time (4% with
      // 3 more), against 18% at 1210ee8, the floor; her plan stays 1210ee8's
      ...stars(
        P(8), P(8), P(8), G(8, "brake", 3, 0, 1), G(8, "longhaul", 6, 0), M(8, "lance", 0), G(8, "temper", 4, 2, 1),
        G(8, "whetstone", 6, 1, 3), G2(8, "temper", 4, 2), M(9, "flak", 0), G(10, "temper", 6, 2, 3),
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
  // on day 4 it would lift him over HIGHSPIRE, the ladder). A STEAM BREECH on gun 1 from day 1 (his wave-3 part, weak
  // enough to keep an Easy deck under every Hard captain on day 1); 0.8.0 B1 M3 added a temper (day 2), a plate roller
  // (day 3) and venom (day 4), which lift his road deck toward the Easy band (about 30%, at most 40; output-B1/m3/
  // N6-NOTES.md).
  brasswick: {
    hero: "foundry", crates: 0, synergy: ["twingauge", "twinmould", "twintrigger"],
    factories: [F("crucible", 2, 6, [2, 5, "U5"], [3, 5, "U5"])],
    upgrades: [
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/2/2/5/6/7 on days 3-10 (the FOUNDRY par field's 1/1/2/2/3/5/6/7: day 7
      // keeps his gold upgrades)
      M(1, "steambreech", 0), G(2, "twingauge", 4, 0, 3), G(2, "temper", 1, 0, 1), M(3, "twintrigger", 0),
      G(3, "plateroller", 4, 2, 3), P(3), G(4, "venom", 4, 1), X(5, F("twinmould", 6, 2, [6, 1, "U"], [7, 1, "U"])), P(5),
      M2(7, "twintrigger", 0), P(8, 3), G2(9, "twinmould", 6, 2), P(9), P(10),
    ],
  },
  // ---------------------------------------------------------------- Hard (tier 3), FOUNDRY
  // LOCKSTEP: the Crucible's belts run up columns 1 and 4 into gun 1, so a TWIN LATCH at (3,2) works both and lets each
  // pair of blanks go together. Synergy: the TWIN LATCH (day 2, 2 stars from day 9), a TWIN TRIGGER on gun 1 from day 2
  // (day 1 at good luck; each fused alloy a pair: 2 stars from day 4, 55% more) and a COMPOUND BREECH from day 5 packing
  // two alloys into one shell (2 stars from day 7); a TWIN GAUGE (day 1) and a counterweight (day 3) fill in. Gun 2 stays
  // dark: every gold buys gun 1's lockstep. Good luck (the road deck) adds a temper on day 2, flak on day 8 and a
  // whetstone on day 10. (0.8.0 B1 M3: regrown with capsearch after the FOUNDRY nerf, so he is a Hard captain again;
  // output-B1/m3/N6-NOTES.md.)
  voss: {
    hero: "foundry", crates: 0, synergy: ["twinlatch", "twintrigger", "compound"],
    factories: [F("crucible", 2, 6, [2, 5, "LU3RU2"], [4, 6, "U5LU"])],
    upgrades: [
      // bb-0.8.3 (job BELTS run 4): the TWIN LATCH on day 4 at ordinary luck (was 2; the stand-in's rare caps are 1 on day
      // 2 and 2 on day 3); soon() keeps the warlord's day 2
      G(1, "twingauge", 1, 0, 1), soon(1, M(2, "twintrigger", 0)), ...good(G(2, "temper", 1, 1, 1)),
      // bb-0.8.6 (job PACKS M4): at ordinary luck the COMPOUND BREECH on day 7 (was 5; FOUNDRY's ordinary epic cap is 0
      // until day 7) and the latch's second star on day 10 (was 9; its 2-star cap is 2 on day 9); soon() keeps the warlord's
      // days 5 and 9. The ladder (the Hard mean below 0 on day 7): the good-luck flak on day 7 (was 8)
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs 1/1/1/1/1/4/4/5 on days 3-10 (the FOUNDRY
      // par field's 1/1/2/2/3/5/6/7), as his stand-in's gold allows (days 5-7: the luck caps' value); his good-luck road
      // deck pays for them with its TURRET SPEED level 2 (day 7 before; no later day's gold holds it). The walls (cap's
      // ruling Q2 f77489ebe2e11698): with the 6/7 the gold allowed on days 9-10 the par field's top quartile beat his road
      // deck only 32-34% of the time (79-86% at 1210ee8); 4/5 packs read 41% on both days
      G(3, "counterweight", 4, 0), P(3), soon(2, G(4, "twinlatch", 3, 2)), M2(4, "twintrigger", 0), soon(5, M(7, "compound", 0)),
      M2(7, "compound", 0), ...good(M(7, "flak", 1)), P(8, 3), soon(9, G2(10, "twinlatch", 3, 2)),
      ...good(G(10, "whetstone", 5, 2, 3)), P(10),
    ],
  },
  // ---------------------------------------------------------------- Medium (tier 2), BASTION
  // ANVIL WALL: the Wardworks' bulwark belt plates the hull as it fires, and plating makes every shot hit harder. Synergy:
  // a PLATE ROLLER on the bulwark belt (day 1), an ANVIL BREECH in the heavy gun's socket from day 2 (2.5 more damage, and
  // 1 more for each plating) and a SPALL CATCHER from day 3. A tollbooth (day 1), a whetstone (day 2, 2 stars on day 9), a
  // twin gauge, a sorting arm, grease, a pincer and a second whetstone (day 10) fill in. 0.8.0 B1 M3 regrew him from day 2
  // on B1's PLATE payoffs with capsearch (output-B1/m3/N6-NOTES.md; oracle 043ce6256cb5ccf9): no ARMOR PRESS, which lifted
  // him 40-60 points over his Medium band. His synergy check now pays on days 5 and 9.
  grimhold: {
    hero: "bastion", crates: 0, synergy: ["plateroller", "anvil", "spallcatcher"],
    factories: [F("wardworks", 4, 6, [4, 5, "U5"])],
    upgrades: [
      // bb-0.8.3 (job BELTS run 4): the sorting arm (epic) on day 6 (was 5): the regenerated caps give BASTION no
      // ordinary epic on day 5; the pincer on day 5 (was 7) keeps the day-5 Easy-Medium gap 0.05 (rivals.difficulty)
      G(1, "plateroller", 3, 0, 1), G(1, "tollbooth", 3, 1, 1), M(2, "anvil", 0), G(2, "whetstone", 5, 1, 3),
      // bb-0.8.6 (job PACKS M4): the sorting arm on day 8 (was 6): the packs' BASTION caps give no ordinary epic before day 8
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2/3/3/4/6/7 on days 3-10 (the BASTION par field's 1/1/2/3/4/5/6/7)
      M(3, "spallcatcher", 0), P(3), G(4, "twingauge", 3, 4, 1), G(5, "pincer", 5, 2, 3), P(5), G(6, "grease", 3, 3, 1), P(6),
      G(8, "sorting", 3, 2), P(8), G2(9, "whetstone", 5, 1), P(9, 2), G(10, "whetstone", 5, 4, 3), P(10),
    ],
  },
  // SHIELD WALL: a wall of plate on the bulwark belt, broken into damage. Synergy: a PLATE BREAKER on the bulwark belt
  // from day 5 (each payload takes a plating for 4 more damage); at good luck a SHIELD WALL on the bulwark belt from day 9
  // (oracle 94b9559fbb7da299 (10): his one good-luck-only synergy part); and the PLATE ROLLER (day 1) and SPALL CATCHER
  // (day 3) that build the plating. A BRACE FRAME (day 2) and a STEAM BREECH (day 3) work the plating; a twin gauge,
  // tempers, a brush, grease, a coil and venom fill in. Good luck: the temper's second star on day 2, a plate on day 6, a
  // pincer on day 7 (2 stars on day 8). The synergy list is D1's three in D1's order (less the ARMOR PRESS, below), then
  // the PLATE ROLLER and SPALL CATCHER (0.8.0 B1, oracles ae44c7db19da0dc0 and cf201b9918116576): D1 built his list from
  // his good-luck road deck, but the synergy check runs on his ordinary-luck stand-in. There BASTION's epic cap of 1 on
  // days 5-7 and the roadCap guard allow only the PLATE BREAKER by day 5, and the deck builds its plating with these two
  // parts, as GRIMHOLD's and THISTLEMAIL's lists name them. bb-0.8.6 (job PACKS run 2; oracle 47d683ef9b959301 (1)): no
  // ARMOR PRESS (was good luck, day 8, into connector 5): his day 9-10 road deck held three epic+ parts, all synergy parts
  // (PLATE BREAKER, ARMOR PRESS, SHIELD WALL), and BASTION's GOOD epic+ cap is 2 on days 9-10, while the ordinary cap
  // never holds it; no day can hold it, so it left his plan. The SHIELD WALL moved one cell west, (6,0) -> (5,0): it
  // worked the press's belt, and there it works the bulwark belt (capsearch check: idle at (6,0) without the press).
  karsk: {
    hero: "bastion", crates: 0, synergy: ["shieldwall", "platebreaker", "plateroller", "spallcatcher"],
    factories: [F("wardworks", 4, 6, [4, 5, "U5"])],
    upgrades: [
      // bb-0.8.3 (job BELTS run 4): the regenerated BASTION caps give the stand-in no epic on day 5 and one epic+ on days
      // 6-10, its value cap 75 on day 7 (the uniform rule's two levels are 20 gold), and the good-luck deck two epics+ on
      // day 8. So at ordinary luck the PLATE BREAKER on day 6 (was 5) and the temper's second star on day 8 (was 6),
      // soon() keeping the warlord's days 5 and 2; the ARMOR PRESS at good luck only (still day 8), and the SHIELD WALL
      // that works its belt on day 9 (was 8). tests/captains.synergy.test.ts pins SHIELD WALL as his only good-luck
      // synergy part: an open item for the lead (BASTION's ordinary epic+ cap of 1 can't hold both epics by day 9)
      // bb-0.8.6 (job PACKS run 2; oracle 47d683ef9b959301 (1)): the ARMOR PRESS left his plan (see above); the SHIELD
      // WALL on the bulwark belt at (5,0) (was (6,0), on the press's belt). The ladder (a Hard captain below the easiest
      // Easy one: day 8 +0.209 vs GRUBNOSE +0.152, day 9 +0.253 vs +0.251 without the press): the fill rule's least change
      // (capsearch kfill), the pincer's second star at good luck on day 8 (day 8 +0.101, day 9 +0.161, day 10 +0.193)
      G(1, "plateroller", 3, 0, 1), G(1, "twingauge", 3, 3, 1), G(2, "braceframe", 3, 1), G(2, "temper", 5, 3, 3),
      M(3, "steambreech", 0), M(3, "spallcatcher", 0), G(4, "staticbrush", 3, 4), G(4, "grease", 3, 5, 1),
      // bb-0.8.6 (job PACKS M4): at ordinary luck the coil on day 6 (was 5) and the PLATE BREAKER on day 8 (was 6): the
      // packs' BASTION caps (ordinary rare+ 3 on day 5, epic+ 0 until day 8); soon() keeps the warlord's day 5
      // 0.8.9 (CATCHUP-089; cap's ruling Q1 e2ca295ce9dcd60a (B)): ARMOR PACKs 2/2/2/2/4 on days 6-10 (the BASTION par
      // field's 3/4/5/6/7), as his stand-in's gold allows (days 3-5: R1 and the luck caps' value; days 7-9: the value cap
      // and his road deck's FACTORY level); his good-luck road deck takes its FACTORY level 2 on day 8 (was 7) and pays
      // with its TURRET SPEED level 2 (day 8 before; no later day's gold holds it)
      soon(5, G(6, "coil", 5, 2, 2)), ...good(P(6)), P(6, 2), ...good(G(7, "pincer", 5, 4, 3)), soon(5, G(8, "platebreaker", 3, 2)),
      soon(2, G2(8, "temper", 5, 3)), ...good(G2(8, "pincer", 5, 4)), ...good(G(9, "shieldwall", 5, 0)),
      G(9, "venom", 5, 5), P(10, 2),
    ],
    // BOTS-X (SUS-C; SUSTAIN-1 4.8 rule 7: "THANE KARSK adds WARD BELL on day 5"), only while the sustain switch is on:
    // BASTION's SHIELD beside his PLATE (PLATE eats the small hits, SHIELD the big ones). His one gun, the common RAMPART,
    // has one gear slot and holds the SPALL CATCHER (a synergy part) from day 3, so on day 5 it takes a second copy (★2: a
    // second gear slot) and the WARD BELL goes there (11 gold: day 5 is 47 of 50). No synergy part moves; the BOTS-X report
    // lists what this does to his ordinary luck caps (measured with the switch off; FLIP-X regenerates them)
    sustain: [T2(5, 0), M(5, "wardbell", 0)],
    // 0.8.9 (CATCHUP-089 fallback 2): his road deck read 51% on day 5 with none of the 2 packs (R1 holds them off) and 37%
    // on day 7 with 3 of the 4: PvE plates up to the count on those days
    pve: { 5: 2, 7: 1 },
  },
  // ---------------------------------------------------------------- dusk stand-ins only (standInOnly), FURNACE and WEAVER
  // TWIN BITE: an 8-tile Kiln belt into connector 4 and a TWIN MOULD's 8-tile belt into connector 5 (day 2, 2 stars from
  // day 6), latched so their slugs land together. Synergy: the TWIN LATCH between them from day 3, the TWIN MOULD, and
  // TWIN GAUGES on the matched Kiln belt (day 1, 2 stars from day 3; a second gauge on day 6). The pairs pay a TWIN
  // TRIGGER from day 5; a whetstone, a temper (2 stars on day 9), bellows, a pincer, a counterweight (day 7), quench,
  // grease and a second temper (day 9) and a long haul (day 10) fill in. (No COMPOUND BREECH: from day 8 it lifted his
  // dusk deck over the stand-ins' 80% ceiling.)
  lockjaw: {
    hero: "furnace", crates: 0, synergy: ["twinlatch", "twinmould", "twingauge"],
    factories: [F("kiln", 2, 6, [2, 5, "RU4RU"])],
    upgrades: [
      G(1, "twingauge", 3, 0, 1), G(1, "whetstone", 2, 1, 1), X(2, F("twinmould", 6, 6, [7, 5, "L2U5"]), 1),
      // bb-0.8.6 (job PACKS M4): the gauge's second star on day 4 (was 3; FURNACE's ordinary 2-star cap is 0 on day 3)
      G(3, "twinlatch", 4, 5), G2(4, "twingauge", 3, 0), G(4, "temper", 2, 2, 1), G(4, "bellows", 6, 0),
      M(5, "twintrigger", 0), G(5, "pincer", 5, 6), G2(6, "twinmould", 6, 6), G(6, "twingauge", 2, 3, 1),
      // bb-0.8.3 (job BELTS run 4): under the regenerated FURNACE caps (value 88 on day 8, 100 on day 9, no bought turret;
      // the uniform rule's levels are 20 gold from day 8) the long haul on day 10 (was 8), and no RAMPART and DOUBLE STAMP
      // (were day 10: the stamp fed the rampart's slot)
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/2 on days 8-10 (the FURNACE par field's 5/6/7: his deck spends the rest)
      G(7, "counterweight", 4, 3), P(8), G(9, "quench", 4, 2), G2(9, "temper", 2, 2), G(9, "grease", 2, 4, 2),
      G(9, "temper", 6, 4, 3), G(10, "longhaul", 4, 4), P(10),
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
      // bb-0.8.3 (job BELTS run 4): the flak on day 5 (was 3; the regenerated rare caps are 2 on day 3 and 3 on day 4)
      G(1, "plateroller", 0, 0, 1), M(1, "steambreech", 0), G(2, "venom", 3, 2), G(2, "temper", 3, 0, 1),
      // bb-0.8.6 (job PACKS M4): the flak on day 6 (was 5; WEAVER's ordinary rare cap is 3 on day 5)
      // 0.8.9 (CATCHUP-089): ARMOR PACKs 1/1/1/1/2/5/5/7 on days 3-10 (the WEAVER par field's 1/1/2/3/4/5/5/7: days 5-7
      // keep her gold upgrade)
      M(3, "mortar", 2), P(3), M(4, "spallcatcher", 0), M2(5, "mortar", 2), M(6, "flak", 1), G(6, "pincer", 5, 2, 3),
      G(7, "bellows", 7, 0), P(7), P(8, 3), G(9, "splitter", 3, 3), P(10, 2),
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
  // 0.8.9 (CATCHUP-089 fallback 2): the day's PvE plates, on a road deck at good luck or better only
  const pvePlates = luck === "ordinary" ? 0 : plan.pve?.[day] ?? 0;
  // BOTS-X (SUS-C): with the sustain switch on, the plan's sustain upgrades after its own (off: `upgrades` itself)
  const ups = sustainLive() && plan.sustain?.length ? [...plan.upgrades, ...plan.sustain] : plan.upgrades;
  for (const [i, u] of ups.entries()) {
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
  // 0.8.9 (CATCHUP-089 fallback 2): the PvE plates add hull like plating, and nothing to the value below
  b.hullBonus = warlordHull(day) + (plating + pvePlates) * ITEMS.plating.supply!.hull!;
  // 0.6.2 BELTSIDE: a load boundary (D3). The plans place rigs natively (M4), so the migration is a no-op
  // here, kept as the safety net for a plan that writes a rig on a belt tile. The value counts the deck after it.
  const build: Build = migrateDeck(b, "preset:rival");
  const parts = [...build.items, ...build.mods].reduce((n, p) => n + valueOf(p.def, starsOf(p)), 0) + turretsCost(build)
    + crates * ITEMS.beltcrate.price + plating * ITEMS.plating.price;
  // bb-0.8.3 (REQ-BFG-043 D7', the uniform rule): the gold upgrades its hero's par player buys (captainLevels), where the
  // day's gold allows; the value counts their gold (stars.ts upgradeGold), as buildCost does
  // the stand-in (rivals.ts standInBuild) pays for the ramp hull in whole plates: the levels must fit beside those too
  const ramp = Math.max(0, Math.round(warlordHull(day) / ITEMS.plating.supply!.hull!)) * ITEMS.plating.price;
  const up = captainLevels(plan.hero, day, maxGold(day) - parts - ramp);
  if (up) build.upgrades = up;
  const value = parts + upgradeGold(build);
  return { build, crates, plating, pvePlates, value };
}

/**
 * bb-0.8.3 (REQ-BFG-043 D7'): the captains' and the wave-3 NPCs' gold upgrades, one uniform rule (rev 4 allows it in
 * place of per-captain plans): each buys the levels its hero's par player buys in most runs, on the par player's median
 * day (output-belts/measure/r4/upbuys-k24.md, seeds 1-24: level 2 of FACTORY for every hero, level 2 of TURRET SPEED for
 * FURNACE, FOUNDRY and BASTION; WEAVER's par player buys its TURRET SPEED in 11 runs of 24, not most), where the day's
 * gold allows: a level is skipped while the plan's value and the levels' gold would pass maxGoldByDay(day) (`room`).
 * Day of each level, by hero and track (index 0 = level 2).
 */
export const CAPTAIN_LEVELS: Readonly<Record<HeroId, Partial<Record<UpgradeTrack, readonly number[]>>>> = {
  furnace: { factory: [7], turret: [8] },
  weaver: { factory: [6] },
  foundry: { factory: [6], turret: [7] },
  bastion: { factory: [7], turret: [7] },
  metronome: {}, siphon: {},
};

/**
 * BOTS-X (REQ-BFG-058; RUNES-2a 3 step 5's code, R1b-2 1.6): each captain's runes in pick order (entry i taken at the dawn
 * of day i + 1), which rivals.ts rivalBuild holds up to its day (captainRunesOn). EMPTY until FLIP-X pins
 * tools/genCaptainRunes.ts's output here (captainRunesText: every captain's 10 picks on its seed hashSeed("captain-runes",
 * id), each prefix passing runeProblem with it) when it turns BOT_RUNES on: a captain with no list holds no runes, so
 * every captain build is exactly as before (tests/botsx.runes.test.ts).
 */
export const CAPTAIN_RUNES: Readonly<Partial<Record<RivalId, readonly string[]>>> = {};

/**
 * BOTS-X: `build` holding a captain's runes up to `day`: Build.runes = the first `day` ids of `list` as { id } in pick
 * order (the last key), the HULL runes' hull added to hullBonus and the BELT runes' belt to beltCap (runes.ts runeGrants,
 * as botTakeRune and run.ts takeRune apply a pick). No list, an empty one or no rune by `day`: `build` itself, untouched.
 */
export function captainRunesOn(build: Build, list: readonly string[] | undefined, day: number): Build {
  const ids = (list ?? []).slice(0, Math.max(0, Math.floor(day)));
  if (!ids.length) return build;
  const runes = ids.map((id) => ({ id })), grant = runeGrants(runes, day);
  return { ...build, hullBonus: build.hullBonus + grant.hull, beltCap: build.beltCap + grant.belt, runes };
}

/** bb-0.8.3 (D7'): a captain's levels on `day` within `room` gold (FACTORY first, then TURRET SPEED); undefined: none. */
export function captainLevels(hero: HeroId, day: number, room: number): Upgrades | undefined {
  const out: Upgrades = {};
  let left = room;
  for (const track of ["factory", "turret"] as const) {
    const days = CAPTAIN_LEVELS[hero]?.[track] ?? [];
    let level = 1;
    for (const d of days) {
      if (d > day || UPGRADE_PRICE[level + 1] > left) break;
      left -= UPGRADE_PRICE[level + 1];
      level++;
    }
    if (level > 1) out[track] = level;
  }
  return out.turret || out.factory ? { ...(out.turret ? { turret: out.turret } : {}), ...(out.factory ? { factory: out.factory } : {}) } : undefined;
}

/** The most gold a run can have received before day `day`'s dusk (= net/validate.ts maxGoldByDay; sim-side, no net import). */
function maxGold(day: number): number {
  let g = START_GOLD;
  for (let d = 1; d < day; d++) g += incomeFor(d, true);
  return g;
}
