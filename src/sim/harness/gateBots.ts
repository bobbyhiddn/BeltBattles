// GATES-1 (REQ-BFG-052; BRIEF-GATES1 G6): THE BOTS' GATES. The par player (player.ts) buys and places the three gates (FUSER, SCATTER
// MILL, SMELTER; src/sim/gates.ts) the way it buys and places a rig, with the two things a gate lacks in the deck rating: the rating
// (deckRating.ts rateDeck) is blind to a converter (its walk has no conversion time, no fused DMG, no pellets, no SMELTER BURN), so a
// gate's worth is a small TABLE (GATE_VALUE: the gain, in the rating's own unit, the fraction of the deck's rating it adds, at its best
// use), read the way the rating reads a rig, and where it stands is a RULE (gateSpot), not a search. Nothing here runs with GATES off:
// the three are not in ITEMS then, so no offer, deck or candidate names one, and every function below sees none.
//
// THE TABLE (★1, per hero; r1d REPORT 2.3, the measured FUSER, and 2.2, where each shines):
//  - FUSER: FURNACE and BASTION gain most (a heavy gun, a belt that piles up), FOUNDRY least (its blanks already fuse at the gun), WEAVER
//    LOSES with every FUSER (light guns, FRAY: more hits matter): a harmful value, so the par player never takes one there (it is no help,
//    no harmless fill and no fill of last resort), and a heavy gun's belt is worth more than a medium or a light gun's;
//  - SCATTER MILL: WEAVER's light guns with spare room (3 hits = 3 FRAY stacks); the others medium;
//  - SMELTER: by the BURN on the deck (burnSources): a deck with no BURN source is worth a quarter, one with two the table's value.
// A star multiplies it by what the star adds to the gate's number (FUSER +50 / +75 / +150, SCATTER MILL 150 / 180 / 200 % of a slug
// over the slug, SMELTER +2 / +5 / +8 BURN). The numbers are the bots' starting values; the bench (tools/gates1) and the presence guard
// set the shipped ones.
//
// THE RULE (gateSpot; r1d variant J, splitPreview.ts suggestSplit's tiles, and the places a gate would do nothing left out):
//  - FUSER: the second-last tile of the longest belt into a HEAVY gun (else a lighter one), the nearest legal tile toward the start when
//    that one is refused; only on a belt that carries two slugs' worth of flow (FUSER_FLOW) and, as the deck's only connected belt,
//    a thicker one (FUSER_SOLE_FLOW), never on a belt with a SCATTER MILL on it, and not on a CRUCIBLE belt of a synced pair;
//  - SCATTER MILL: the middle of the longest belt into a LIGHT gun, leaving at least 3 tiles after it for the pellets to fly, and only
//    where the gun has room to fire them (its fire rate, less what its belts bring, is at least the 2 more loads a slug becomes);
//  - SMELTER: the belt with the most BURN rigs hitting it, on the first legal tile after the last of them, else the middle;
//  - never on a belt that brings more than the gate takes (GATE_INTAKE x 1.1 a second: a belt that backs up behind it loses shots),
//    never on a belt that feeds nothing (not connected), a belt of fewer than 3 tiles (a gate needs belt on both sides: 4 for a FUSER,
//    5 for a SCATTER MILL), a tile right next to another gate, an illegal tile (split.ts splitProblem); a tile that rig arrows aim at
//    only when every tile in reach has one (those arrows would idle);
//  - a gate rides with its belt: when the par player redraws a belt (shopper.ts moveRoute) it lifts the gates standing on it and puts
//    them back on the new one (reseat; gateSpot with `relaxed`, the legal tile of the same order and no flow or room check), or the
//    redraw is not made.
// Pure harness reads (no RNG): the same deck gives the same spot.

import { ITEMS, type HeroId, type TurretKind } from "../content";
import { connectorClaims, hero as deckHero, key, kx, ky, rigHits, routeInfo, type Build } from "../deck";
import { RATING_CURVE, fightTime, rateDeck, type RateOut } from "../deckRating";
import { beltTile, isConverterItem, splitProblem } from "../split";
import { starsOf } from "../stars";
import { syncOf } from "../syncEstimate";

/** The three gates' ids (src/sim/gates.ts GATES_IDS). */
export type GateId = "fuser" | "scattermill" | "smelter";

/** Each hero's ★1 value of a gate at its best use: a heavy gun's belt with flow for the FUSER, a light gun with room for the SCATTER MILL,
 *  two BURN sources for the SMELTER. In the rating's unit (the fraction of the deck's rating a part adds: a rare rig is worth 0.03-0.10 a
 *  day 3-8). Negative: harmful, the par player never takes it (WEAVER's FUSER, r1d). */
export const GATE_VALUE: Readonly<Record<GateId, Readonly<Record<HeroId, number>>>> = {
  fuser: { furnace: 0.12, bastion: 0.1, foundry: 0.035, weaver: -0.2, metronome: 0.05, siphon: 0.05 },
  scattermill: { furnace: 0.04, bastion: 0.04, foundry: 0.05, weaver: 0.1, metronome: 0.04, siphon: 0.07 },
  smelter: { furnace: 0.06, bastion: 0.06, foundry: 0.06, weaver: 0.06, metronome: 0.06, siphon: 0.06 }, // ★1 +2 BURN (the table was 0.09 at +3)
};

/** How much of the table's value a gate keeps by the class of the gun its belt feeds. */
export const GATE_CLASS_FIT: Readonly<Record<GateId, Readonly<Record<TurretKind, number>>>> = {
  fuser: { heavy: 1, adaptable: 0.8, medium: 0.6, light: 0.2 },
  scattermill: { light: 1, medium: 0.8, adaptable: 0.8, heavy: 0.6 },
  smelter: { heavy: 1, adaptable: 1, medium: 1, light: 1 },
};

/** What ★2 and ★3 multiply the ★1 value by (what the star adds to the gate's number: FUSER +50 / +75 / +150 %, SCATTER MILL 150 / 180 /
 *  200 % of a slug, SMELTER +2 / +5 / +8 BURN). The harness reads no star value from the defs itself (tests/harness.mods.test.ts). */
export const GATE_STAR_FACTOR: Readonly<Record<GateId, readonly [number, number, number]>> = {
  fuser: [1, 1.5, 3], // +50 / +75 / +150 %
  scattermill: [1, 1.6, 2],
  smelter: [1, 2.5, 4], // +2 / +5 / +8 BURN
};

/** A SMELTER keeps this share of its value with 0, 1, 2 and 3 or more BURN sources on the deck. */
export const SMELTER_BURN_FIT: readonly [number, number, number, number] = [0.25, 0.6, 1, 1.35];

/** The payloads a second a belt must carry for a FUSER to find a partner within a few seconds (2 slugs within 6.7 s), and as the deck's
 *  only connected belt (a thin sole supply would only be delayed by the wait). */
export const FUSER_FLOW = 0.3;
export const FUSER_SOLE_FLOW = 0.6;

/** What each gate takes in a second (`in` slugs a `secs` second conversion: FUSER 2, SCATTER MILL 1, SMELTER 1). A belt that brings
 *  more than this backs up behind the gate and the gun fires less (the bench: SMELTERs on a WEAVER's 1.4 a second belts read -15 points
 *  on day 6), so par puts no gate on a belt that brings more than GATE_SLACK x its intake. */
export const GATE_INTAKE: Readonly<Record<GateId, number>> = { fuser: 2, scattermill: 1, smelter: 1 };
export const GATE_SLACK = 1.1;

/** The fewest tiles a belt needs for each gate: belt on both sides of it (3), and a FUSER near the end with a belt to pair on (4), a
 *  SCATTER MILL with at least 3 tiles after it for its pellets (5). */
const MIN_TILES: Readonly<Record<GateId, number>> = { fuser: 4, scattermill: 5, smelter: 3 };

/** The tiles (cells) after a SCATTER MILL that its pellets need. */
const PELLET_ROOM = 3;

/** Which of the three `def` is, by its converter idea ("fuse", "pellet", "smelt"); undefined for anything else (and for a gate while GATES is
 *  off: ITEMS holds the three only while it is on). */
const converterHow = (def: string): GateId | undefined => {
  const how = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def].converter?.how : undefined;
  return how === "fuse" ? "fuser" : how === "pellet" ? "scattermill" : how === "smelt" ? "smelter" : undefined;
};

/** Does rig `def` add BURN to a payload (TEMPER, RASP, EMBER TROUGH: a hit's BURN; BELLOWS: BURN for the ride)? */
const addsBurn = (def: string): boolean => {
  const g = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def].gate : undefined;
  return !!g && ((g.burn ?? 0) > 0 || !!g.burnPerRide);
};

/**
 * The BURN sources on the deck, one each: rigs that add BURN (TEMPER, RASP, EMBER TROUGH, BELLOWS), a factory that stamps it (HOT
 * SWAP's ember), and half each for what cashes BURN in (VENOM DRIP's longer BURN, QUENCH TANK, a DRAKE NOZZLE core): the SMELTER's +3
 * BURN pays on a deck that has them.
 */
export function burnSources(b: Build): number {
  let n = 0;
  for (const p of b.items) {
    const d = Object.prototype.hasOwnProperty.call(ITEMS, p.def) ? ITEMS[p.def] : undefined;
    if (!d) continue;
    if (d.kind === "gate" && d.gate) n += addsBurn(p.def) ? 1 : d.gate.burnPlus || d.gate.quench ? 0.5 : 0;
    else if (d.kind === "factory" && d.factory?.cycle?.some((c) => (c.burn ?? 0) > 0)) n += 1;
  }
  for (const m of b.mods) if (ITEMS[m.def]?.kind === "core" && ITEMS[m.def].core?.routine === "drake") n += 0.5;
  return n;
}

/** The rating's read-out of the deck on `day`: payloads a second by route (RateOut.arrival; after joins), as the par player reads it. */
export function readFlow(b: Build, day: number): RateOut {
  const ro: RateOut = { stokeKeep: new Map(), arrival: new Map(), turretDmg: new Map() };
  rateDeck(b, RATING_CURVE, fightTime(day), ro, undefined, day);
  return ro;
}

/** One gate's worth to the hero, from the table: `kind` and `speed` are the gun its belt feeds (TurretDef), `arrival` the belt's flow. */
export function gateValue(heroId: HeroId, def: string, stars: number, gun: { kind: TurretKind; speed: number }, arrival: number, sources: number): number {
  const id = converterHow(def);
  if (!id) return 0;
  const base = GATE_VALUE[id][heroId] ?? 0;
  const star = GATE_STAR_FACTOR[id][Math.min(3, Math.max(1, Math.floor(stars))) - 1];
  if (base <= 0) return base * star; // harmful for this hero: harmful at every star
  const fit = GATE_CLASS_FIT[id][gun.kind] ?? 1;
  const rate = Math.max(0.1, gun.speed / 30); // loads a second the gun fires (TurretDef.speed: shots per 30 s)
  const flow = id === "fuser" ? 0.6 + 0.4 * Math.min(2, arrival / rate) : 1; // a belt that piles up past the gun's rate pays a FUSER most
  const burn = id === "smelter" ? SMELTER_BURN_FIT[Math.min(3, Math.round(sources))] : 1;
  return base * fit * flow * burn * star;
}

/**
 * GATES-1b B5: the slugs a second a gate on tile `tile` of belt `ri` must pass: the belt's own flow (the rating's `arrival` of the route)
 * plus every belt that JOINS it at or before that tile, and those belts' own joiners (a joiner's `arrival` is the rating's, already capped
 * by the room on its main belt). A gate takes `in` slugs a `secs` second whatever feeds it, so this, not the belt's own flow, is what
 * backs the belt up behind it: the presence bench at k 96 (O/bench/b5inflow-*) read the SMELTER's par holders on days 6 and 10 by it:
 * inflow up to 0.6 +4.1 points (14 decks), 0.6-1.1 0.0 (19), 1.1-1.6 -6.1 (15), over 1.6 -24.6 (17); the 26 holders whose own belt was
 * within the limit but whose inflow was not averaged -16.4. gateSpot read only the belt's own flow.
 */
export function gateInflow(b: Pick<Build, "routes">, ro: RateOut, ri: number, tile: number, depth = 0): number {
  let sum = ro.arrival?.get(ri) ?? 0;
  if (depth > 6) return sum;
  b.routes.forEach((r, qi) => {
    if (qi === ri || r.join === undefined) return;
    const t = b.routes[ri].cells.indexOf(r.join);
    if (t >= 0 && t <= tile) sum += gateInflow(b, ro, qi, r.cells.length, depth + 1);
  });
  return sum;
}

/** GATES-1b B5: is a SMELTER on tile `tile` of belt `ri` fed more than it takes (GATE_SLACK x GATE_INTAKE a second, counting the joiners)? */
const smelterOverfed = (b: Build, ro: RateOut, ri: number, tile: number): boolean => gateInflow(b, ro, ri, tile) > GATE_SLACK * GATE_INTAKE.smelter;

/**
 * The worth of every gate on `b`, summed: each one by its hero's table, the class of the gun its belt feeds, the belt's flow (`ro`, the
 * rating's read-out of `b`; the route indices of a deck with one gate more are the same) and the deck's BURN. A gate off a belt, or on a
 * belt that feeds nothing, is worth nothing. The par player adds the difference between a deck with a gate and without it to the rating's
 * own (candidates in player.ts). GATES-1b B5: a SMELTER fed more than it takes (gateInflow: the belt's own flow and its joiners') is a
 * harm, its worth turned into a minus: it holds its factories' belts back (the bench: -16 points on average), so a deck whose joiners
 * overfeed it rates lower, and one that would overfeed it by a purchase is not bought.
 */
export function gateWorth(b: Build, ro: RateOut): number {
  const gates = b.items.filter((p) => converterHow(p.def) !== undefined && isConverterItem(p));
  if (!gates.length) return 0;
  const h = deckHero(b), claims = connectorClaims(b), sources = burnSources(b);
  let sum = 0;
  for (const p of gates) {
    const at = beltTile(b, key(p.x, p.y));
    if (!at) continue;
    const info = routeInfo(b, at[0], claims, undefined, []);
    const gun = info.connected && info.turret >= 0 ? h.turrets[info.turret] : undefined;
    if (!gun) continue;
    const v = gateValue(b.hero, p.def, starsOf(p), gun, ro.arrival?.get(at[0]) ?? 0, sources);
    sum += converterHow(p.def) === "smelter" && smelterOverfed(b, ro, at[0], at[1]) ? -Math.abs(v) : v; // GATES-1b B5
  }
  return sum;
}

/** Does gate `def` fit anywhere: a legal belt tile (split.ts splitProblem) on any belt of `b`? The buy-fit check (player.ts fitsSomewhere). */
export function gateFits(b: Build, def: string): boolean {
  for (const r of b.routes) for (const k of r.cells) if (splitProblem(b, def, k) === null) return true;
  return false;
}

/** Where a gate would stand: its cell, and the belt and tile (the index along the belt) it splits. */
export interface GateSpot { x: number; y: number; route: number; tile: number }

export interface GateSpotOpts {
  /** Only this belt (route index): a gate put back on a redrawn belt. */
  only?: number;
  /** A gate put back on a redrawn belt (shopper.ts reseat): any connected belt, flow and room not asked, a joining belt too; the tile order is the same. */
  relaxed?: boolean;
}

/** The tiles of a belt of `n` tiles (1..n-2: belt on both sides) in the order gate `id` prefers them. `lastBurn`: the last tile a BURN rig hits (-1: none). */
function tileOrder(id: GateId, n: number, lastBurn: number): number[] {
  const all = Array.from({ length: Math.max(0, n - 2) }, (_, i) => i + 1);
  const middle = (list: number[], at: number): number[] => list.slice().sort((p, q) => Math.abs(p - at) - Math.abs(q - at) || p - q);
  if (id === "fuser") return all.slice().reverse(); // the second-last tile, then toward the start (r1d variant J)
  if (id === "scattermill") {
    const room = all.filter((t) => n - 1 - t >= PELLET_ROOM); // at least 3 tiles after it
    return middle(room, Math.min(Math.floor((n - 1) / 2), n - 1 - PELLET_ROOM));
  }
  const mid = middle(all, Math.floor((n - 1) / 2));
  if (lastBurn < 0) return mid;
  const after = all.filter((t) => t > lastBurn);
  return [...after, ...mid.filter((t) => !after.includes(t))]; // any legal tile after the last BURN rig, else the middle
}

interface Belt { ri: number; n: number; kind: TurretKind; arrival: number; burn: number; lastBurn: number }

/** How a gate ranks the class of the gun a belt feeds: lower first (a FUSER wants a heavy gun, a SCATTER MILL a light one). */
const CLASS_RANK: Readonly<Record<GateId, Readonly<Record<TurretKind, number>>>> = {
  fuser: { heavy: 0, adaptable: 1, medium: 2, light: 3 },
  scattermill: { light: 0, medium: 1, adaptable: 1, heavy: 2 },
  smelter: { heavy: 0, adaptable: 0, medium: 0, light: 0 },
};

/**
 * Where the par player puts gate `defId` on `b`, or null when nowhere is worth it (see the header's RULE). `ro`: the rating's read-out of
 * `b` on its day (readFlow; not read with `relaxed`). Deterministic; the same deck gives the same spot.
 */
export function gateSpot(b: Build, defId: string, ro: RateOut | undefined, o: GateSpotOpts = {}): GateSpot | null {
  const id = converterHow(defId);
  if (!id) return null;
  const h = deckHero(b), claims = connectorClaims(b), hits = rigHits(b);
  const all = b.routes.map((r, ri) => ({ ri, r, info: routeInfo(b, ri, claims, undefined, []) }));
  const live = all.filter((x) => x.info.wellFormed && x.info.connected && x.info.turret >= 0 && (o.relaxed || x.r.join === undefined));
  // the gates standing on each belt, and the loads a second each gun is brought (the SCATTER MILL's room)
  const standing = new Map<number, string[]>();
  for (const p of b.items) {
    const how = converterHow(p.def);
    const at = how ? beltTile(b, key(p.x, p.y)) : null;
    if (how && at) standing.set(at[0], [...(standing.get(at[0]) ?? []), how]);
  }
  const brought = new Map<number, number>();
  for (const x of live) brought.set(x.info.turret, (brought.get(x.info.turret) ?? 0) + (ro?.arrival?.get(x.ri) ?? 0));
  const synced = new Set<number>(); // a CRUCIBLE belt of a synced pair: a gate would pull its blanks out of step
  for (const x of live) if (syncOf(b, x.ri)?.partners.some((p) => p.sync)) synced.add(x.ri);
  const sole = live.filter((x) => x.r.join === undefined).length <= 1;
  const belts: Belt[] = [];
  for (const x of live) {
    if (o.only !== undefined && x.ri !== o.only) continue;
    const n = x.r.cells.length, gun = h.turrets[x.info.turret], arrival = ro?.arrival?.get(x.ri) ?? 0, on = standing.get(x.ri) ?? [];
    if (n < MIN_TILES[id] || on.includes(id)) continue;
    if (!o.relaxed) {
      if (arrival > GATE_SLACK * GATE_INTAKE[id]) continue; // the belt would back up behind it
      if (synced.has(x.ri)) continue;
      if (id === "fuser" && (on.includes("scattermill") || arrival < (sole ? FUSER_SOLE_FLOW : FUSER_FLOW))) continue;
      if (id === "scattermill" && (on.includes("fuser") || (brought.get(x.info.turret) ?? 0) + 2 * arrival > Math.max(0.1, gun.speed / 30))) continue;
    }
    let burn = 0, lastBurn = -1;
    (hits[x.ri] ?? []).forEach((tile, t) => { for (const hit of tile) if (addsBurn(hit.def)) { burn++; lastBurn = Math.max(lastBurn, t); } });
    belts.push({ ri: x.ri, n, kind: gun.kind, arrival, burn, lastBurn });
  }
  belts.sort((p, q) => CLASS_RANK[id][p.kind] - CLASS_RANK[id][q.kind] || (id === "smelter" ? q.burn - p.burn : 0) || q.n - p.n || (id === "fuser" ? q.arrival - p.arrival : 0) || p.ri - q.ri);
  for (const belt of belts) {
    const cells = b.routes[belt.ri].cells;
    // GATES-1b B5: a SMELTER also not on a tile its belt's joiners (at or before it) overfeed: the belt's own flow was all the rule read
    const legal = tileOrder(id, belt.n, belt.lastBurn).filter((t) => splitProblem(b, defId, cells[t]) === null
      && (o.relaxed || !ro || id !== "smelter" || !smelterOverfed(b, ro, belt.ri, t)));
    // the first of the three nearest the preferred tile that no rig arrow aims at (an arrow at a gate idles), else the preferred one
    const quiet = legal.slice(0, 3).find((t) => !(hits[belt.ri]?.[t]?.length));
    const t = quiet ?? legal[0];
    if (t !== undefined) return { x: kx(cells[t]), y: ky(cells[t]), route: belt.ri, tile: t };
  }
  return null;
}

/** gateSpot on the rating's read-out of `b` on `day`: the par player's rule in one call (the bench's, the tests'). null: nowhere. */
export function parGateSpot(b: Build, defId: string, day: number): GateSpot | null {
  return gateSpot(b, defId, readFlow(b, day));
}
