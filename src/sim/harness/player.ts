// Balance harness: the par player (FB-C, REQ-BFG-026). The operator's rule for balance is that shop luck does most
// of the work, and nobody assembles "the perfect deck" unless the stars align. So par is what a typical player can
// actually assemble: playerBuild(hero, day, seed) plays a REAL run through days 1..day. The run comes from the game's
// newRun, each dawn's caravan from its rollShop (5 offers from 2-3 merchants, fresh-first slots, the familiar slot,
// hero-blind offers), each reroll from its reroll (2 g), each purchase from its buyOffer (offered parts only, at the
// offered price, through gainModule, so copies merge as they do in the game), and each dusk from its finishDay (a win's
// income, so day t adds maxGoldByDay(t) - maxGoldByDay(t - 1)). Road stops, events and warlords are left out.
//
// The policy (PLAYER_POLICY; output/PAR-REPORT.md measures it) is sensible, not perfect:
// - The player reads its deck the way the build screen shows it (rateDeck: deck.ts's route walk, the inspector's
//   DMG / BURN / SHOCK / TIME, turned into damage per second that lands, times hull).
// - Each dawn it takes merges first, then a part that helps the current deck: usually the one it judges best for the
//   gold (misjudging each offer by up to `noise`), sometimes (`whim`) any helpful one. A rig goes beside a random belt
//   tile at the harness's H2 spot (Shopper.rigSpot: most hits on connected belts, the slag rule), gear and cores on a
//   free hardpoint or socket, a factory beside a free intake with the shortest belt. A belt crate is bought to lengthen
//   a belt (the game redraws belts for free; Shopper.moveRoute, riders put back beside the new belt).
// - It rerolls only when nothing affordable helps, at most `rerolls` times a day, and only while the run's reroll gold
//   stays within `rerollShare` of the day's gold and the purse can still reach `floor`. Then it fills its deck to
//   `floor` of the day's gold (supplies first, then parts that do no harm), and it carries at most `reserve` gold
//   into the next dawn when the caravan sells belt crates.
// - A persona per seed holds what players differ in before any shop luck: whether a FURNACE player lengthens the
//   kiln belt on day 1 (the hero card: "AT 8+ TILES, BREECH FIRES EVERY 0.72S") and how far.
// Everything is deterministic per (hero, seed, policy): the run seed, the persona and the policy's RNG are hashed from
// them. Every day's deck passes validateBuild, and deck value + reroll gold + unspent gold = maxGoldByDay(day).

import { Rng, hashSeed } from "../../core/rng";
import { BURN_TIME, HEROES, ITEMS, REROLL_COST, type HeroId } from "../content";
import {
  arrowCell, cloneBuild, coreFor, footprint, gearFor, itemByUid, kx, ky, occupancy, opposite, rigHits, routeInfo, walkRoute, connectorClaims,
  type Build, type Dir, type RigHit,
} from "../deck";
import { beltIndex, freeForRig, hitsIfPlaced, intakeCell, placeRigAt, rotFacing, rotations, type RigSpot } from "../beltside";
import { gearStats, type SideStats } from "../battle";
import { resolveCore } from "../cores";
import { FUSE_MAX, effectAt, fusible, outputsAt, starsOf, valueOf } from "../stars";
import { buildCost, maxGoldByDay } from "../../net/validate";
import { finishDay } from "../../game/day";
import { gainModule, mergePreview, type GainAt } from "../../game/fuse";
import { buyOffer, newRun, reroll, sellInventory, storeMod, storePlaced, type Run } from "../../game/run";
import { MAX_TILES, Shopper } from "./shopper";
import { blockedCells, freeConnectors, randomPath, shortestTiles, startCells } from "./path";

// ---------------------------------------------------------------- the deck rating (what the player reads)

/** Seconds in a typical dusk fight (the desk run's fights last 17-29 s): damage is weighed by how much of it lands. */
export const FIGHT_T = 25;

/**
 * Damage-equivalents per payload of the effects the route walk doesn't turn into damage, read off the cards:
 * Poison ticks 0.4/s per stack for up to 6 s (~3 per stack), a Fray stack adds 0.2 to each later hit (~3), a
 * shocked payload stalls a machine for 1.6 s, a static stall per second, LODESTONE's +1 per stalled machine, an
 * OVERCLOCKER doubling a rig every few seconds, TOLLBOOTH and SIFTER guards.
 */
export const EQ = { poison: 3, fray: 3, shock: 3, static: 4, perStalled: 1.5, overclock: 8, toll: 0.5, sift: 0.5 } as const;
/** A harassment round's damage-equivalent per payload (content.ts FactorySpec.round), from its card. */
export const ROUND_EQ: Readonly<Record<string, number>> = { sabot: 6, frost: 4, drag: 3, limpet: 8 };
/** Gear and cores whose effect the rating doesn't compute (HOPPER, MANTLET, FLAK, SPOTTER, every bought core): the
 *  turret's damage x (1 + NOMINAL x the part's value in gold), the typical player's "pricier is better". */
export const NOMINAL = 0.03;

interface Feed { arrival: number; eq: number; first: number; ride: number }

/** Per payload, the rig effects the walk leaves out (EQ), and the hull a RIVETER repairs per passing payload. */
function hitExtras(b: Build, hits: RigHit[][][], ri: number): { eq: number; repair: number } {
  let eq = 0, repair = 0;
  for (const tile of hits[ri] ?? []) {
    for (const h of tile) {
      const e = effectAt(h.def, starsOf(itemByUid(b, h.uid))).gate;
      if (!e) continue;
      if (e.poison) eq += EQ.poison * e.poison;
      if (e.fray) eq += EQ.fray * e.fray;
      if (e.staticTime) eq += EQ.static * e.staticTime;
      if (e.perStalled) eq += EQ.perStalled * e.perStalled.each;
      if (e.keg) eq += 0.5 * (e.keg.flat + BURN_TIME * e.keg.burn); // it blows at 8-12 s: about half the fight
      if (e.overclockCooldown) eq += EQ.overclock / e.overclockCooldown;
      if (e.toll) eq += EQ.toll * e.toll;
      if (e.sift) eq += EQ.sift;
      if (e.repair) repair += e.repair;
    }
  }
  return { eq, repair };
}

export interface DeckRating {
  offense: number; // damage-equivalent per second that lands in a FIGHT_T fight
  defense: number; // hull, plus what RIVETERs repair in half a fight
  value: number; // offense x defense: in a duel of steady damage, the side with the larger product wins
}

/**
 * What a player reads off the build screen, as one number. Per connected route: the walk's damage per payload
 * (deck.ts walkRoute, the inspector's DMG, BURN, SHOCK and TIME: Burn stacks count BURN_TIME each), plus EQ for the
 * effects the walk leaves out, times payloads per second (copies x batch / (the factory's interval x its routes,
 * which it feeds by turns)). Per turret: the payloads it can fire per second (perShot / interval, with E1's 0.72 s
 * FURNACE breech from an 8-tile belt, CALIBRATION and a core's cadence) cap the payloads that arrive (a backlog
 * jams: 85%), FINISHER RAM and LONGCASE add their share, gear and cores the rating can't compute add NOMINAL; the
 * whole is weighed by the share of a FIGHT_T fight left after the first payload arrives.
 */
export function rateDeck(b: Build): DeckRating {
  const h = HEROES[b.hero];
  const hits = rigHits(b), claims = connectorClaims(b), occ = occupancy(b);
  const outs = new Map<number, number>();
  for (const r of b.routes) outs.set(r.factory, (outs.get(r.factory) ?? 0) + 1);
  const feeds: Feed[][] = h.turrets.map(() => []);
  const longest = h.turrets.map(() => 0);
  let repair = 0;
  b.routes.forEach((r, ri) => {
    const info = routeInfo(b, ri, claims, occ, hits);
    if (!info.connected || info.turret < 0) return;
    const f = itemByUid(b, r.factory);
    const spec = f && ITEMS[f.def]?.kind === "factory" ? effectAt(f.def, starsOf(f)).factory : undefined;
    if (!f || !spec) return;
    const interval = f.def === "mimic" ? (ITEMS[h.factory].factory?.interval ?? 1) * (spec.intervalMul ?? 1) : spec.interval;
    const est = walkRoute(b, ri, hits).estimate;
    const x = hitExtras(b, hits, ri);
    const arrival = (est.copies * (spec.batch ?? 1)) / (Math.max(0.1, interval) * (outs.get(r.factory) ?? 1));
    const eq = est.dmg + (spec.scrapFlat ?? 0) + BURN_TIME * est.burn + (est.shock ? EQ.shock : 0) + x.eq + (spec.round ? ROUND_EQ[spec.round.kind] ?? 0 : 0);
    feeds[info.turret].push({ arrival, eq, first: est.time, ride: est.ride });
    longest[info.turret] = Math.max(longest[info.turret], r.cells.length);
    repair += arrival * x.repair;
  });
  let offense = 0;
  h.turrets.forEach((td, t) => {
    const fs = feeds[t];
    if (!fs.length) return;
    const g = gearStats(b, t), core = resolveCore(b, t, td);
    let interval = (b.hero === "furnace" && longest[t] >= 8 ? 0.72 : td.fireInterval) * g.fireMul; // battle.ts makeTurret
    if (core.spec.intervalMul) interval *= core.spec.intervalMul;
    const cap = g.perShot / interval;
    const arrival = fs.reduce((s, f) => s + f.arrival, 0);
    const noJam = g.noJam || !!core.spec.noJam;
    const thr = arrival <= cap ? arrival : cap * (noJam ? 1 : 0.85);
    let eq = fs.reduce((s, f) => s + f.arrival * f.eq, 0) / arrival;
    if (g.longRideFlat) eq += g.longRideFlat * fs.filter((f) => f.ride >= g.longRideMin).reduce((s, f) => s + f.arrival, 0) / arrival;
    let mult = 1 + (g.finisher ? g.finisher / (td.window + g.window) : 0);
    if (core.bought) mult *= 1 + NOMINAL * valueOf(core.def, core.stars);
    for (const m of b.mods) {
      if (m.turret !== t || ITEMS[m.def]?.kind !== "mod") continue;
      const md = effectAt(m.def, starsOf(m)).mod ?? {};
      if (!md.fireMul && !md.perShot && !md.finisher && !md.longRideFlat) mult *= 1 + NOMINAL * valueOf(m.def, starsOf(m));
    }
    const first = Math.min(...fs.map((f) => f.first));
    offense += thr * eq * mult * Math.max(0.1, (FIGHT_T - first) / FIGHT_T);
  });
  const defense = h.hull + b.hullBonus + repair * FIGHT_T * 0.5;
  return { offense, defense, value: offense * defense };
}

// ---------------------------------------------------------------- the policy

export type PlayerPolicy = "typical" | "sharp";

/** The par player's knobs (output/PAR-REPORT.md explains each and measures what it does). */
export interface PolicyKnobs {
  noise: number; // each offer's gain is misjudged by a factor 1 +- noise (seeded)
  whim: number; // chance that a pick (not a merge) is any helpful offer rather than the one judged best for the gold
  impulse: number; // chance that a pick (not a merge) is any offer the deck can take, whether or not it helps
  place: "tile" | "best"; // "tile": a rig at a random belt tile's H2 spot, gear on a random free fed turret; "best": the best
  belt: number; // FURNACE: the chance a player lengthens the kiln belt on day 1
  beltMin: number; // FURNACE: the shortest kiln belt such a player draws (the hero card's 8)
  beltMax: number; // FURNACE: the longest (it draws beltMin..beltMax tiles, within the starting belt capacity)
  grow: boolean; // the player re-draws its belts to the best-rated length after every purchase (sharp); a typical
  // player lengthens a belt only when it buys a belt crate for it (then the best-rated connected belt), or (room)
  room: boolean; // ... when it has gold but no free cell beside a belt for a rig: then it draws a belt into the free capacity
  rerolls: number; // rerolls a day at most, only when nothing affordable helps
  rerollShare: number; // the run's reroll gold stays within this share of maxGoldByDay(day)
  stuck: number; // extra rerolls a day while the deck is short of the floor and nothing on offer can fill it
  floor: number; // the share of maxGoldByDay(day) the player fills its deck to: supplies first, then harmless parts
  reserve: number; // gold a player may carry into the next dawn once the floor is met (the rest goes into belt crates)
  minRel: number; // a gain below this share of the deck's rating is no help
  harmless: number; // a loss below this share still fills the purse
  mergeFloor: number; // a merge is taken unless it costs more than this share
  fillFloor: number; // while the deck is short of the floor, the fill takes the least harmful offer down to this share
  upgrade: boolean; // an offer of gear or a core may replace a fitted one worth less (the old one is sold)
  upgradeGain: number; // ... when nothing else helps and the swap gains at least this share
  line: "short" | "random"; // a new factory's belt: the shortest into the intake, or shortest + random slack within the spare belt
  aim: "h2" | "first"; // place "tile": the tile's H2 spot (most hits), or a random free side with the first arrow on the tile
}

export interface PlayerOpts {
  policy?: PlayerPolicy; // "typical" (the par player, default) or "sharp" (no misjudging or whims, best spots)
  tune?: Partial<PolicyKnobs>; // knob overrides (bench sweeps; the cache key includes them)
  maxStars?: number; // the highest star a purchase may merge up to: FUSE_MAX for par, 2 for a stand-in candidate
  trace?: (run: Run, wagon: number, slot: number) => void; // called just before each buyOffer (tests)
  onReroll?: (run: Run) => void; // called just before each reroll (tests)
  onDecide?: (run: Run, cands: readonly PlayerOffer[], pick: string | null) => void; // each shopping step (diagnostics)
}

/** An offer as the player judged it (diagnostics): its def, price, kind and the rating change it would make. */
export interface PlayerOffer { def: string; price: number; kind: string; merge: boolean; rel: number }

export const PLAYER_POLICY: Readonly<Record<PlayerPolicy, Readonly<PolicyKnobs>>> = {
  typical: {
    noise: 0.6, whim: 0.3, impulse: 0, place: "tile", belt: 0.5, beltMin: 8, beltMax: 12, grow: false, room: true, rerolls: 2, rerollShare: 0.1, stuck: 2,
    floor: 0.87, reserve: 2, minRel: 0.004, harmless: 0.002, mergeFloor: -0.02, fillFloor: -0.15, upgrade: true, upgradeGain: 0.05, line: "short", aim: "h2",
  },
  sharp: {
    noise: 0, whim: 0, impulse: 0, place: "best", belt: 1, beltMin: 8, beltMax: 12, grow: true, room: true, rerolls: 2, rerollShare: 0.1, stuck: 2,
    floor: 0.87, reserve: 2, minRel: 0.004, harmless: 0.002, mergeFloor: -0.02, fillFloor: -0.15, upgrade: true, upgradeGain: 0.05, line: "short", aim: "h2",
  },
};

/** What a player brings to the run before any shop luck (drawn per hero and seed). */
export interface Persona {
  beltTiles: number; // FURNACE: the kiln belt it draws on day 1 (0: it keeps the starting belt)
}

export function knobsOf(policy: PlayerPolicy = "typical", tune?: Partial<PolicyKnobs>): PolicyKnobs {
  return { ...PLAYER_POLICY[policy], ...tune };
}

/** The persona of (hero, seed) under `pol`: its own stream, so the policy's draws never move it. */
export function personaOf(hero: HeroId, seed: number, pol: PolicyKnobs): Persona {
  const rng = new Rng(hashSeed("par-player-persona", hero, seed));
  const extend = rng.next() < pol.belt, len = pol.beltMin + rng.int(Math.max(1, pol.beltMax - pol.beltMin + 1));
  return { beltTiles: hero === "furnace" && extend ? len : 0 };
}

export interface PlayerBuy {
  day: number;
  roll: number; // the caravan's reroll count when bought (0 = the dawn caravan)
  def: string;
  price: number;
  stars: number; // the copy's stars after any merge
  merged: boolean;
  why: "merge" | "best" | "whim" | "impulse" | "fill" | "crate";
  grew?: number; // a belt crate: the tiles the belt it lengthened grew by (absent: none)
  replaced?: string; // an upgrade: the def of the fitted gear or core it replaced (sold)
}

/** One dusk of the par player's run. */
export interface PlayerDay {
  day: number;
  build: Build; // the deck at dusk (a fresh copy)
  value: number; // buildCost(build).total
  budget: number; // maxGoldByDay(day)
  gold: number; // unspent gold carried into the next dawn
  rerolls: number; // rerolls taken today
  rerollGold: number; // gold spent on rerolls, days 1..day
  soldLoss: number; // value lost selling replaced parts (value minus refund), days 1..day
  buys: PlayerBuy[]; // today's purchases, in order
}

type Kind = "rig" | "gear" | "core" | "factory" | "plating" | "crate";

interface Cand {
  wagon: number;
  slot: number;
  def: string;
  price: number;
  kind: Kind;
  merge: boolean; // the copy merges into a placed twin
  at?: GainAt; // where it is dropped (buyOffer's `at`)
  routes?: number[][]; // a new factory's belts
  grown?: { build: Build; tiles: number }; // a belt crate: the deck after it lengthens a belt (items and routes)
  swap?: number; // an upgrade: the uid of the fitted gear or core it replaces (stored, then sold)
  rel: number; // (rateDeck(after) - rateDeck(now)) / rateDeck(now)
}

const SIDE0: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };

/** The run the par player plays: the game's own newRun (runId fixed, so nothing reads the clock). */
function startRun(hero: HeroId, seed: number): Run {
  return newRun(hero, hashSeed("par-player-run", hero, seed), `par-${hero}-${seed}`);
}

/** Dusk won, next dawn: the game's finishDay (a win's income, yesterday's merchants, a fresh caravan). */
function nextDawn(run: Run): void {
  finishDay(run, 0, FIGHT_T, { ...SIDE0 }, { ...SIDE0 });
}

/** What buyOffer(run, ., ., at) would leave on the deck, on a copy of the run (the same gainModule path). */
function afterGain(run: Run, def: string, at: GainAt | undefined): Build {
  const sim = { ...run, build: cloneBuild(run.build), inventory: run.inventory.map((i) => ({ ...i })), fuseFx: [], fuseAnim: [] } as Run;
  const pv = at ? mergePreview(sim, def) : null;
  gainModule(sim, def, pv && pv.where !== "cargo" ? undefined : at);
  return sim.build;
}

const relOf = (after: Build, base: number): number => (base > 0 ? rateDeck(after).value / base - 1 : rateDeck(after).value > 0 ? 1 : 0);

/** The rig spots worth trying for `def`: the harness's H2 spot (Shopper.rigSpot) for every belt tile of a connected
 *  route with a free side (Shopper.rigTiles; a speed rig skips slag routes, rigTilesFor), each spot once. With `rng`
 *  (place "tile"), exactly as the harness's gate lever places a rig: one of those tiles at random, its H2 spot. */
function rigSpots(s: Shopper, def: string, rng?: Rng, aim: PolicyKnobs["aim"] = "h2"): RigSpot[] {
  const out: RigSpot[] = [];
  const seen = new Set<string>();
  const tiles = s.rigTilesFor(ITEMS[def], s.rigTiles(), false);
  if (rng && aim === "first") {
    // a random free side of a random belt tile, the rig's first arrow turned to that tile (other arrows land where
    // they land); a speed rig that would hit a slag belt is not put there (P20)
    if (!tiles.length) return out;
    const [ri, ti] = rng.pick(tiles);
    const b = s.b, k0 = b.routes[ri].cells[ti], occ = occupancy(b);
    const sides = ([0, 1, 2, 3] as Dir[]).filter((d) => {
      const k = arrowCell(kx(k0), ky(k0), d);
      return freeForRig(b, k, occ) && !intakeCell(b, k);
    });
    if (!sides.length) return out;
    const d = rng.pick(sides), k = arrowCell(kx(k0), ky(k0), d), rot = rotFacing(def, opposite(d));
    const hits = hitsIfPlaced(b, def, kx(k), ky(k), rot, beltIndex(b, s.connected()));
    const slag = s.slagRoutesFor(ITEMS[def]);
    if (slag && hits.some((h) => slag[h.route])) return out;
    out.push({ x: kx(k), y: ky(k), rot, hits });
    return out;
  }
  for (const [ri, ti] of rng ? (tiles.length ? [rng.pick(tiles)] : []) : tiles) {
    const sp = s.rigSpot(def, ri, ti);
    if (!sp) continue;
    const k = `${sp.x},${sp.y},${sp.rot}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(sp);
  }
  return out;
}

/**
 * A full deck (no free cell beside a connected belt): the rig upgrade. The player sells a placed rig worth less than
 * the offer (half its value back) and drops the new rig on that cell, turned for the most hits on connected belts
 * (the game's drop auto-aims; a speed rig never hits a slag belt, P20). Of those swaps, the best-rated; null: none.
 */
function rigSwap(b: Build, s: Shopper, def: string, price: number, uid: number, base: number): Omit<Cand, "wagon" | "slot" | "price"> | null {
  const slag = s.slagRoutesFor(ITEMS[def]);
  const belts = beltIndex(b, s.connected());
  let best: Omit<Cand, "wagon" | "slot" | "price"> | null = null;
  for (const p of b.items) {
    if (ITEMS[p.def].kind !== "gate" || valueOf(p.def, starsOf(p)) >= price) continue;
    const trial = cloneBuild(b);
    trial.items = trial.items.filter((q) => q.uid !== p.uid);
    let spot: RigSpot | null = null;
    for (const rot of rotations(def)) {
      const hits = hitsIfPlaced(trial, def, p.x, p.y, rot, belts);
      if (!hits.length || (slag && hits.some((h) => slag[h.route]))) continue;
      if (!spot || hits.length > spot.hits.length) spot = { x: p.x, y: p.y, rot, hits };
    }
    if (!spot) continue;
    placeRigAt(trial, uid, def, spot);
    const r = relOf(trial, base);
    if (!best || r > best.rel) best = { def, kind: "rig", merge: false, at: { x: spot.x, y: spot.y, rot: spot.rot }, swap: p.uid, rel: r };
  }
  return best;
}

/** Belt tiles free under the deck's belt capacity. */
const beltFree = (b: Build): number => b.beltCap - b.routes.reduce((s, r) => s + r.cells.length, 0);

/** The shortest belt a new 2x2 factory could have into a free intake (a free spot off the forward row), or Infinity
 *  when no intake is free or none can be reached. */
function factoryReach(b: Build): number {
  const cols = freeConnectors(b);
  if (!cols.length) return Infinity;
  const occ = occupancy(b), d = ITEMS.press;
  let best = Infinity;
  for (let y = 1; y + d.size <= 10; y++) {
    for (let x = 0; x + d.size <= 10; x++) {
      if (footprint(d, x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
      const trial = cloneBuild(b);
      trial.items.push({ uid: -1, def: d.id, x, y });
      const bl = blockedCells(trial), starts = startCells(x, y, d.size, bl);
      for (const col of cols) best = Math.min(best, shortestTiles(bl, starts, col));
    }
  }
  return best;
}

/** Turrets some connected belt feeds (the harness's mod lever prefers them). */
function fedTurrets(b: Build): Set<number> {
  const claims = connectorClaims(b), hits = rigHits(b), occ = occupancy(b);
  const out = new Set<number>();
  b.routes.forEach((_, ri) => {
    const info = routeInfo(b, ri, claims, occ, hits);
    if (info.connected && info.turret >= 0) out.add(info.turret);
  });
  return out;
}

/**
 * A new factory's spot and belts: the free 2x2 spot (off the forward row) with the shortest belt into a free intake
 * that the spare belt covers (ties: the first spot in row order), and for a factory with more outputs (GANTRY PRESS)
 * the next shortest belts into the other free intakes, while the belt lasts. null when none fits.
 */
function factoryPlan(b: Build, def: string, rng: Rng, line: PolicyKnobs["line"] = "short"): { x: number; y: number; routes: number[][] } | null {
  const d = ITEMS[def];
  const cols = freeConnectors(b);
  if (!cols.length) return null;
  const occ = occupancy(b);
  let best: { x: number; y: number; col: number; len: number } | null = null;
  for (let y = 1; y + d.size <= 10; y++) {
    for (let x = 0; x + d.size <= 10; x++) {
      if (footprint(d, x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
      const trial = cloneBuild(b);
      trial.items.push({ uid: -1, def, x, y });
      const bl = blockedCells(trial), starts = startCells(x, y, d.size, bl);
      for (const col of cols) {
        const len = shortestTiles(bl, starts, col);
        if (len > beltFree(b)) continue;
        if (!best || len < best.len) best = { x, y, col, len };
      }
    }
  }
  if (!best) return null;
  const trial = cloneBuild(b);
  trial.items.push({ uid: -1, def, x: best.x, y: best.y });
  const routes: number[][] = [];
  let spare = beltFree(b);
  const outputs = outputsAt(def, 1);
  for (const col of [best.col, ...cols.filter((c) => c !== best!.col)]) {
    if (routes.length >= outputs) break;
    const bl = blockedCells(trial), starts = startCells(best.x, best.y, d.size, bl);
    const len = shortestTiles(bl, starts, col);
    if (len > spare) continue;
    // a winding line: shortest + random slack within the spare belt (a path of the drawn length may not exist: shorter)
    let cells: number[] | null = null;
    if (line === "random") for (let n = len + rng.int(spare - len + 1); n > len && !cells; n--) cells = randomPath(bl, starts, col, n, rng);
    cells ??= randomPath(bl, starts, col, len, rng);
    if (!cells) continue;
    routes.push(cells);
    trial.routes.push({ factory: -1, cells });
    spare -= cells.length;
  }
  return routes.length ? { x: best.x, y: best.y, routes } : null;
}

/**
 * The belt a player lengthens with its free belt capacity (after a belt crate): for each connected route, the route
 * redrawn `free` tiles longer into the same intake (Shopper.moveRoute: its riders, the rigs that work only it, are
 * lifted and put back beside the new belt; the harness's own route edit), and of those the best-rated deck. null
 * when nothing can grow or no growth rates above `base`.
 */
function growBelt(b: Build, day: number, rng: Rng, base: number): { build: Build; tiles: number; rel: number } | null {
  // while a factory line still fits into a free intake, the player keeps the belt it needs
  const reach = factoryReach(b);
  const free = beltFree(b) - (reach <= beltFree(b) ? reach : 0);
  if (free <= 0) return null;
  const claims = connectorClaims(b);
  let best: { build: Build; tiles: number; rel: number } | null = null;
  b.routes.forEach((r, ri) => {
    if (!routeInfo(b, ri, claims, undefined, []).connected) return;
    const col = r.cells[r.cells.length - 1] % 10;
    for (let tiles = Math.min(MAX_TILES, r.cells.length + free); tiles > r.cells.length; tiles--) {
      const trial = cloneBuild(b);
      const s = new Shopper(trial, Number.MAX_SAFE_INTEGER, day, rng, "on", FUSE_MAX, "on", "on");
      if (!s.moveRoute(ri, tiles, col)) continue;
      const rel = relOf(trial, base);
      if (!best || rel > best.rel) best = { build: trial, tiles: tiles - r.cells.length, rel };
      break;
    }
  });
  return best;
}

const kindOf = (def: string): Kind => {
  const k = ITEMS[def].kind;
  return k === "gate" ? "rig" : k === "mod" ? "gear" : k === "core" ? "core" : k === "factory" ? "factory" : ITEMS[def].supply?.hull ? "plating" : "crate";
};

/** Every affordable offer the deck can take, with what it does to the rating: merges into a placed twin, rigs at an
 *  H2 spot, gear and cores on a free hardpoint or socket (never a core swap), factories with their belts, plating, and
 *  belt crates with the belt they lengthen (pol.grow). */
function candidates(run: Run, maxStars: number, rng: Rng, pol: PolicyKnobs): Cand[] {
  const b = run.build, h = HEROES[b.hero];
  const base = rateDeck(b).value;
  const s = new Shopper(b, maxGoldByDay(run.day), run.day, rng, "on", maxStars, "on", "on");
  s.uid = run.nextUid;
  const out: Cand[] = [];
  const planned = new Map<string, Omit<Cand, "wagon" | "slot" | "price"> | null>();
  const fed = fedTurrets(b);
  run.shop.wagons.forEach((w, wi) => w.offers.forEach((o, si) => {
    if (o.sold || o.price > run.gold) return;
    const d = ITEMS[o.def];
    const push = (c: Omit<Cand, "wagon" | "slot" | "price"> | null) => { if (c) out.push({ ...c, wagon: wi, slot: si, price: o.price }); };
    if (planned.has(o.def)) return push(planned.get(o.def)!);
    let c: Omit<Cand, "wagon" | "slot" | "price"> | null = null;
    if (d.kind === "supply") {
      const after = cloneBuild(b);
      if (d.supply?.hull) after.hullBonus += d.supply.hull;
      if (d.supply?.belt) after.beltCap += d.supply.belt;
      c = { def: o.def, kind: kindOf(o.def), merge: false, rel: relOf(after, base) };
      if (d.supply?.belt) {
        // a belt crate is bought to lengthen a belt: the one that rates best with the new capacity
        const g = growBelt(after, run.day, rng, base);
        if (g && g.rel > c.rel) c = { ...c, rel: g.rel, grown: { build: g.build, tiles: g.tiles } };
      }
    } else if (fusible(o.def)) {
      const pv = mergePreview(run, o.def);
      if (pv && pv.toStars > maxStars) c = null; // over the cap (stand-in candidates stop at 2 stars)
      else if (pv && pv.where !== "cargo") {
        c = { def: o.def, kind: kindOf(o.def), merge: true, rel: relOf(afterGain(run, o.def, { x: 0, y: 0 }), base) };
      } else if (d.kind === "gate") {
        let best: Omit<Cand, "wagon" | "slot" | "price"> | null = null;
        for (const sp of rigSpots(s, o.def, pol.place === "tile" ? rng : undefined, pol.aim)) {
          const after = cloneBuild(b);
          placeRigAt(after, run.nextUid, o.def, sp);
          const r = relOf(after, base);
          if (!best || r > best.rel) best = { def: o.def, kind: "rig", merge: false, at: { x: sp.x, y: sp.y, rot: sp.rot }, rel: r };
        }
        // no free cell beside a belt: an upgrade sells a cheaper placed rig and puts the new one on its cell
        if (!best && pol.upgrade && !s.hasRigTile()) best = rigSwap(b, s, o.def, o.price, run.nextUid, base);
        c = best;
      } else if (d.kind === "mod" || d.kind === "core") {
        // a free hardpoint (gear) or socket (core); never two gear on a hardpoint
        const fitted = (t: number) => (d.kind === "mod" ? gearFor(b, t) : coreFor(b, t));
        const turrets = h.turrets.map((_, t) => t);
        const free = turrets.filter((t) => !fitted(t));
        const live = free.filter((t) => fed.has(t));
        const tries = pol.place === "tile" ? (free.length ? [rng.pick(live.length ? live : free)] : []) : free;
        let best: Omit<Cand, "wagon" | "slot" | "price"> | null = null;
        for (const t of tries) {
          const after = cloneBuild(b);
          after.mods.push({ uid: run.nextUid, def: o.def, turret: t });
          const r = relOf(after, base);
          if (!best || r > best.rel) best = { def: o.def, kind: kindOf(o.def), merge: false, at: { turret: t }, rel: r };
        }
        if (!free.length && pol.upgrade) {
          // every slot of its kind is taken: an upgrade replaces a fitted part worth less than this offer (it is sold)
          for (const t of turrets) {
            const old = fitted(t);
            if (!old || valueOf(old.def, starsOf(old)) >= o.price) continue;
            const after = cloneBuild(b);
            after.mods = after.mods.filter((m) => m.uid !== old.uid);
            after.mods.push({ uid: run.nextUid, def: o.def, turret: t });
            const r = relOf(after, base);
            if (!best || r > best.rel) best = { def: o.def, kind: kindOf(o.def), merge: false, at: { turret: t }, swap: old.uid, rel: r };
          }
        }
        c = best;
      } else if (d.kind === "factory") {
        const fp = factoryPlan(b, o.def, rng, pol.line);
        if (fp) {
          const after = cloneBuild(b);
          after.items.push({ uid: run.nextUid, def: o.def, x: fp.x, y: fp.y });
          for (const cells of fp.routes) after.routes.push({ factory: run.nextUid, cells });
          c = { def: o.def, kind: "factory", merge: false, at: { x: fp.x, y: fp.y }, routes: fp.routes, rel: relOf(after, base) };
        }
      }
    }
    planned.set(o.def, c);
    push(c);
  }));
  return out;
}

/** The most gold a set of distinct offers (one per def) costing at most `cap` can spend. */
function bestSpend(prices: number[], cap: number): number {
  const top = Math.min(cap, 30);
  let reach = 1; // bit g: g gold can be spent exactly
  for (const p of prices) reach |= (reach << p) & ((2 << top) - 1);
  let g = top;
  while (g > 0 && !(reach & (1 << g))) g--;
  return g;
}

/**
 * The pick: a merge first (the one judged best for the gold), else a part that helps: a whim (any helpful offer) with
 * chance `whim`, else the one judged best for the gold (each gain misjudged by a factor 1 +- noise). Either way the
 * player counts its coins: it prefers a part after which the change can still be spent on the other offers that do
 * no harm (a subset-sum over them), down to `keep` gold (the reserve, or less when the floor needs it). null:
 * nothing helps.
 */
function pickOffer(cands: Cand[], gold: number, keep: number, pol: PolicyKnobs, rng: Rng, short = false): { c: Cand; why: PlayerBuy["why"] } | null {
  const judge = (c: Cand) => (c.rel * (pol.noise ? 1 + pol.noise * (2 * rng.next() - 1) : 1)) / c.price;
  const best = (xs: Cand[]) => {
    let top: Cand | null = null, v = -Infinity;
    for (const x of xs) {
      const j = judge(x);
      if (j > v) { v = j; top = x; }
    }
    return top;
  };
  const merges = cands.filter((c) => c.merge && c.rel >= pol.mergeFloor);
  if (merges.length) return { c: best(merges)!, why: "merge" };
  // an upgrade (a swap) is a late sink: only when nothing else helps, and only for a clear gain
  const plain = cands.filter((c) => !c.merge && c.swap === undefined && c.rel > pol.minRel);
  const help = plain.length ? plain : cands.filter((c) => c.swap !== undefined && c.rel >= pol.upgradeGain);
  if (!help.length) return null;
  // the change must stay spendable: on offers that do no harm, or, while the deck is short of the floor, on any
  // offer the fill would take (pol.fillFloor); then such an offer may itself be the pick that keeps the floor reachable
  const ok = (c: Cand) => c.swap === undefined && c.rel >= (short ? pol.fillFloor : -pol.harmless);
  const harmless = cands.filter(ok);
  const keepsOf = (xs: Cand[], spendable: Cand[]) => xs.filter((c) => {
    const left = gold - c.price;
    if (left <= keep) return true;
    const seen = new Set<string>([c.def]), prices: number[] = [];
    // an offer of the kind that takes the same turret slot (gear, a core) or intake (a factory) may not fit after c
    const rival = (o: Cand) => !o.merge && !c.merge && o.kind === c.kind && (c.kind === "gear" || c.kind === "core" || c.kind === "factory");
    for (const o of spendable) if (!seen.has(o.def) && !rival(o)) { seen.add(o.def); prices.push(o.price); }
    return left - bestSpend(prices, left) <= keep;
  });
  const any = cands.filter((c) => !c.merge && c.kind !== "crate");
  if (pol.impulse > 0 && any.length && rng.next() < pol.impulse) {
    const ok = keepsOf(any, any);
    return { c: rng.pick(ok.length ? ok : any), why: "impulse" };
  }
  const keeps = keepsOf(short ? [...help, ...harmless.filter((c) => !c.merge && !help.includes(c))] : help, harmless);
  const keepsHelp = keeps.filter((c) => help.includes(c));
  const pool = keepsHelp.length ? keepsHelp : keeps.length ? keeps : help;
  if (pol.whim > 0 && rng.next() < pol.whim) return { c: rng.pick(pool), why: "whim" };
  return { c: best(pool)!, why: "best" };
}

/** Buy `c` through the game's buyOffer at its spot; a new factory then gets its belts, a crate lengthens its belt, an
 *  upgrade's old part goes to cargo first (the game's storeMod; a bought core is swapped out by gainModule) and is sold
 *  (sellInventory: half its value back). Returns the gold the sale lost (value minus refund). */
function buy(run: Run, c: Cand, why: PlayerBuy["why"], rolls: number, buys: PlayerBuy[], trace?: PlayerOpts["trace"]): number {
  trace?.(run, c.wagon, c.slot);
  const oldMod = c.swap !== undefined ? run.build.mods.find((m) => m.uid === c.swap) : undefined;
  const oldRig = c.swap !== undefined && !oldMod ? run.build.items.find((p) => p.uid === c.swap) : undefined;
  const old = oldMod ?? oldRig;
  if (oldMod && ITEMS[oldMod.def].kind === "mod") storeMod(run, oldMod.uid);
  if (oldRig && !storePlaced(run, oldRig.uid)) throw new Error(`par player: the replaced ${oldRig.def} could not go to cargo`);
  const res = buyOffer(run, c.wagon, c.slot, c.at);
  if (!res.ok) throw new Error(`par player: buyOffer ${c.def} failed: ${res.reason}`);
  let lost = 0;
  if (old) {
    const refund = sellInventory(run, old.uid);
    if (!refund) throw new Error(`par player: the replaced ${old.def} is not in cargo`);
    lost = valueOf(old.def, starsOf(old)) - refund;
  }
  if (c.routes && res.gain && res.gain.where === "deck" && !res.gain.steps.length) {
    for (const cells of c.routes) run.build.routes.push({ factory: res.gain.survivor, cells: [...cells] });
  }
  if (c.grown) {
    // the redraw is free in the game: the same items (rigs moved beside the new belt) and routes, nothing bought
    run.build.items = cloneBuild(c.grown.build).items;
    run.build.routes = cloneBuild(c.grown.build).routes;
  }
  buys.push({ day: run.day, roll: rolls, def: c.def, price: c.price, stars: res.gain?.stars ?? 1, merged: !!res.gain?.steps.length, why, ...(c.grown ? { grew: c.grown.tiles } : {}), ...(old ? { replaced: old.def } : {}) });
  return lost;
}

/**
 * FURNACE, day 1: redraw the starting kiln belt as a belt of `tiles` tiles (within the starting belt capacity) into
 * either intake (randomPath from the policy RNG): the first such belt the player manages to draw.
 */
function drawKilnBelt(run: Run, rng: Rng, tiles: number): void {
  const b = run.build;
  const kiln = b.items.find((p) => p.def === HEROES.furnace.factory);
  const ri = kiln ? b.routes.findIndex((r) => r.factory === kiln.uid) : -1;
  if (b.hero !== "furnace" || !kiln || ri < 0 || b.routes[ri].cells.length >= tiles) return;
  const target = Math.min(tiles, b.beltCap - (b.routes.reduce((s, r) => s + r.cells.length, 0) - b.routes[ri].cells.length));
  const bl = blockedCells(b, ri), starts = startCells(kiln.x, kiln.y, ITEMS[kiln.def].size, bl);
  const cols = HEROES.furnace.turrets[0].connectors;
  for (let t = 0; t < 24; t++) {
    const cells = randomPath(bl, starts, cols[rng.int(cols.length)], target, rng);
    if (cells) {
      b.routes[ri] = { factory: kiln.uid, cells };
      return;
    }
  }
}

/** The fill: harmless offers (else the least harmful down to pol.fillFloor), supplies first, then the best rating,
 *  then the dearer (it fills more of the purse). */
function fillPick(cands: Cand[], pol: PolicyKnobs): Cand | null {
  let ok = cands.filter((c) => c.rel >= -pol.harmless);
  if (!ok.length) ok = cands.filter((c) => c.rel >= pol.fillFloor);
  const supply = (c: Cand) => (c.kind === "plating" || c.kind === "crate" ? 0 : 1);
  ok.sort((a, b) => supply(a) - supply(b) || b.rel - a.rel || b.price - a.price || a.wagon - b.wagon || a.slot - b.slot);
  return ok[0] ?? null;
}

/** The share of the day's gold the player aims its deck at, in whole gold. */
export const floorGold = (day: number, floor: number): number => Math.ceil(floor * maxGoldByDay(day));

/**
 * One dawn: merges and helpful parts while any is affordable. When none is: a reroll, if today's count and the run's
 * reroll share allow it, a part of the cheapest price stays affordable after it, and the deck can still reach the
 * floor; else the purse is filled to `floor` of the day's gold with harmless offers (supplies first, each at its
 * best spot). Gold above `reserve` then goes into belt crates when the caravan sells them.
 */
function shopDay(run: Run, pol: PolicyKnobs, maxStars: number, rng: Rng, spent: { reroll: number; sold: number }, opts: PlayerOpts): { buys: PlayerBuy[]; rolls: number } {
  const budget = maxGoldByDay(run.day), target = floorGold(run.day, pol.floor);
  const buys: PlayerBuy[] = [];
  let rolls = 0, roomy = false;
  for (let guard = 0; guard < 80; guard++) {
    if (pol.grow && beltFree(run.build) > 0) {
      // free belt capacity: the player lengthens the belt that rates best with it (a free redraw in the game)
      const g = growBelt(run.build, run.day, rng, rateDeck(run.build).value);
      if (g && g.rel > pol.minRel) {
        run.build.items = g.build.items;
        run.build.routes = g.build.routes;
      }
    }
    const cands = candidates(run, maxStars, rng, pol);
    const value = buildCost(run.build).total;
    const keep = Math.min(pol.reserve, Math.max(0, value + run.gold - target));
    const p = pickOffer(cands, run.gold, keep, pol, rng, value < target);
    opts.onDecide?.(run, cands.map((c) => ({ def: c.def, price: c.price, kind: c.kind, merge: c.merge, rel: c.rel })), p ? p.c.def : null);
    if (p) {
      spent.sold += buy(run, p.c, p.why, rolls, buys, opts.trace);
      continue;
    }
    if (!roomy && pol.room && run.gold >= 3 && beltFree(run.build) > 0 && !new Shopper(run.build, budget, run.day, rng, "on", maxStars, "on", "on").hasRigTile()) {
      // out of room with gold to spend: the player lengthens a belt into its free capacity (a free redraw in the
      // game), the one that rates best, so rigs fit again; at most once a day, and never for a worse deck
      roomy = true;
      const g = growBelt(run.build, run.day, rng, rateDeck(run.build).value);
      if (g && g.rel >= -pol.harmless) {
        run.build.items = g.build.items;
        run.build.routes = g.build.routes;
        continue;
      }
    }
    const allowed = rolls < pol.rerolls && run.gold >= REROLL_COST + 3
      && spent.reroll + REROLL_COST <= pol.rerollShare * budget
      && value + run.gold - REROLL_COST >= target;
    if (allowed) {
      opts.onReroll?.(run);
      if (!reroll(run)) break;
      rolls++;
      spent.reroll += REROLL_COST;
      continue;
    }
    if (value < target) {
      const f = fillPick(pol.place === "best" ? cands : candidates(run, maxStars, rng, { ...pol, place: "best" }), pol);
      if (f) {
        spent.sold += buy(run, f, f.kind === "crate" ? "crate" : "fill", rolls, buys, opts.trace);
        continue;
      }
      // short of the floor with nothing on offer that fills it: the gold would sit idle, so the player rerolls
      // (a few more times a day) while a 3 g part stays affordable after the reroll and the gold the run has
      // not put on the deck (rerolls, sale losses) stays within 1 - floor of the day's gold
      if (rolls < pol.rerolls + pol.stuck && run.gold >= REROLL_COST + 3 && spent.reroll + spent.sold + REROLL_COST <= (1 - pol.floor) * budget) {
        opts.onReroll?.(run);
        if (!reroll(run)) break;
        rolls++;
        spent.reroll += REROLL_COST;
        continue;
      }
    }
    break;
  }
  for (let guard = 0; guard < 20 && run.gold > pol.reserve; guard++) {
    const cands = candidates(run, maxStars, rng, { ...pol, place: "best" }).filter((c) => c.kind === "crate");
    const crate = cands.sort((a, b) => b.rel - a.rel || a.wagon - b.wagon || a.slot - b.slot)[0];
    if (!crate) break;
    buy(run, crate, "crate", rolls, buys, opts.trace);
  }
  return { buys, rolls };
}

const CACHE = new Map<string, PlayerDay[]>();
export const PLAYER_DAYS = 10;

/**
 * The par player's run for (hero, seed): one PlayerDay per day 1..days (at most 10). Deterministic: the same arguments
 * give the same decks, and days 1..d of a longer run are exactly the run to day d (the policy never looks ahead).
 */
export function playerRun(hero: HeroId, days: number, seed: number, opts: PlayerOpts = {}): PlayerDay[] {
  const policy = opts.policy ?? "typical", maxStars = opts.maxStars ?? FUSE_MAX;
  const pol = knobsOf(policy, opts.tune);
  const traced = !!(opts.trace || opts.onReroll || opts.onDecide);
  const key = `${hero}|${seed}|${policy}|${maxStars}|${JSON.stringify(opts.tune ?? {})}`;
  let full = traced ? undefined : CACHE.get(key);
  if (!full) {
    const run = startRun(hero, seed);
    const rng = new Rng(hashSeed("par-player-policy", hero, seed, policy));
    const persona = personaOf(hero, seed, pol);
    const spent = { reroll: 0, sold: 0 };
    full = [];
    if (persona.beltTiles > 0) drawKilnBelt(run, rng, persona.beltTiles);
    for (let day = 1; day <= PLAYER_DAYS; day++) {
      if (day > 1) nextDawn(run);
      const { buys, rolls } = shopDay(run, pol, maxStars, rng, spent, opts);
      full.push({ day, build: cloneBuild(run.build), value: buildCost(run.build).total, budget: maxGoldByDay(day), gold: run.gold, rerolls: rolls, rerollGold: spent.reroll, soldLoss: spent.sold, buys });
      if (traced && day >= days) break;
    }
    if (!traced) CACHE.set(key, full);
  }
  return full.slice(0, Math.max(0, Math.min(PLAYER_DAYS, days))).map((d) => ({ ...d, build: cloneBuild(d.build), buys: d.buys.map((x) => ({ ...x })) }));
}

/** The par player's deck at dusk of `day` (1-10) for (hero, seed): a fresh copy. */
export function playerBuild(hero: HeroId, day: number, seed: number, opts: PlayerOpts = {}): Build {
  const d = Math.max(1, Math.min(PLAYER_DAYS, Math.floor(day)));
  return playerRun(hero, d, seed, opts)[d - 1].build;
}
