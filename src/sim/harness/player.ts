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
//
// 0.6.2 CAND-A: the player on the 0.6.2 mechanics head (ref/BRIEF-final-062-cand.md §2).
// - TURRETS (REQ-BFG-031): a turret offer is bought when a plan with it rates better, each plan played on a copy of
//   the run through the game's own actions (buyOffer's gain into cargo, then run.ts installFromCargo, the build
//   screen's drop onto a turret slot): into the empty EXTRA slot, fed by a belt redrawn to its intake (the game's free
//   redraw; its riders put back beside it), or replacing an installed turret (a swap: the old one goes to cargo, and
//   is sold unless it is a 1-star starting turret, which can't be; a belt the swap leaves without an intake is
//   redrawn to a free one, or there is no plan), the displaced turret perhaps moved into the empty extra slot. Gear a
//   smaller turret can't hold goes onto another turret with room, else is sold. A cargo turret goes back into an empty
//   slot at dawn when a fed plan rates better. A copy that merges into an installed twin is a merge, as before.
// - GEAR goes into any free GEAR SLOT of an installed turret (rarity + stars; never two copies of one def on a
//   turret), cores into a socket; the rating (deckRating.ts) reads every installed turret, its stars and all its gear.
// - JOINS (REQ-BFG-027): a new factory's belt either runs into a free intake (as before) or joins a connected belt at
//   a tile up to its rig row, whichever rates better (deck.ts commitRoute, the editor's path); at dawn the player may
//   redraw a belt into a join (the free redraw) when that rates clearly better. The rating sees the joined walk (the
//   main belt's rigs), E1's long journey, and a crowded intake (joiners starve at a saturated turret).
// - AIM: a multi-arrow rig also tries the spots where most of its arrows land (`aimTop` of them), two-belt spots
//   included: a player dragging a rig sees where its arrows land before dropping it (the game's drop auto-aims).

import { Rng, hashSeed } from "../../core/rng";
import { GRID, HEROES, ITEMS, REROLL_COST, type HeroId } from "../content";
import {
  DX, DY, arrowCell, canFitGear, canSellTurret, cloneBuild, commitRoute, connectorClaims, coreFor, deadEndsAt, footprint,
  gearOn, inGrid, installedTurrets, isTurretDef, itemByUid, joinProblem, joinersOf, key, kx, ky, occupancy, opposite,
  rigArrows, rigHits, routeInfo, turretSlots, turretValue,
  type Build, type Dir, type ModPlacement,
} from "../deck";
import { beltIndex, freeForRig, hitsIfPlaced, intakeCell, placeRigAt, rotFacing, rotations, type RigSpot } from "../beltside";
import type { SideStats } from "../battle";
import { FUSE_MAX, fusible, outputsAt, starsOf, valueOf } from "../stars";
import { buildCost, maxGoldByDay } from "../../net/validate";
import { finishDay } from "../../game/day";
import { gainModule, mergePreview, type GainAt } from "../../game/fuse";
import {
  buyOffer, fitCore, installFromCargo, newRun, reroll, sellInventory, storeMod, storePlaced, takeFromInventory, type Run,
} from "../../game/run";
import { MAX_TILES, Shopper } from "./shopper";
import { blockedCells, freeConnectors, randomPath, shortestTiles, startCells } from "./path";

// ---------------------------------------------------------------- the deck rating (what the player reads)

// FB-C: the rating (rateDeck and its constants) lives in src/sim/deckRating.ts, beside deck.ts: it reads starred
// effects through stars.ts like the build screen's inspector, which no src/sim/harness file may do itself.
export { EQ, FIGHT_T, NOMINAL, ROUND_EQ, SATURATED, rateDeck, type DeckRating } from "../deckRating";
import { FIGHT_T, rateDeck } from "../deckRating";

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
  // 0.6.2 CAND-A (the report lists these four additions; the policy names stay "typical" and "sharp"):
  turret: number; // 1: a turret offer may be bought to install or replace one (0: only a copy that merges, as FB-C)
  extra: number; // 1: a turret may go into the empty extra slot (0: never; the gold goes elsewhere: flag 1's control)
  join: number; // 1: a new factory's belt may join a belt, and a belt may be redrawn into a join (0: never)
  aimTop: number; // place "tile": a multi-arrow rig also tries this many of the spots where most of its arrows land
}

export interface PlayerOpts {
  policy?: PlayerPolicy; // "typical" (the par player, default) or "sharp" (no misjudging or whims, best spots)
  tune?: Partial<PolicyKnobs>; // knob overrides (bench sweeps; the cache key includes them)
  maxStars?: number; // the highest star a purchase may merge up to: FUSE_MAX for par, 2 for a stand-in candidate
  trace?: (run: Run, wagon: number, slot: number) => void; // called just before each buyOffer (tests)
  onReroll?: (run: Run) => void; // called just before each reroll (tests)
  onDecide?: (run: Run, cands: readonly PlayerOffer[], pick: string | null) => void; // each shopping step (diagnostics)
}

/** An offer as the player judged it (diagnostics): its def, price, kind and the rating change it would make; a turret's
 *  plan ("extra 1", "replace 0", "replace 0 moved 1": its slot, and where the displaced one went). */
export interface PlayerOffer { def: string; price: number; kind: string; merge: boolean; rel: number; plan?: string }

export const PLAYER_POLICY: Readonly<Record<PlayerPolicy, Readonly<PolicyKnobs>>> = {
  typical: {
    noise: 0.6, whim: 0.3, impulse: 0, place: "tile", belt: 0.5, beltMin: 8, beltMax: 12, grow: false, room: true, rerolls: 2, rerollShare: 0.1, stuck: 2,
    floor: 0.87, reserve: 2, minRel: 0.004, harmless: 0.002, mergeFloor: -0.02, fillFloor: -0.15, upgrade: true, upgradeGain: 0.05, line: "short", aim: "h2",
    turret: 1, extra: 1, join: 1, aimTop: 4,
  },
  sharp: {
    noise: 0, whim: 0, impulse: 0, place: "best", belt: 1, beltMin: 8, beltMax: 12, grow: true, room: true, rerolls: 2, rerollShare: 0.1, stuck: 2,
    floor: 0.87, reserve: 2, minRel: 0.004, harmless: 0.002, mergeFloor: -0.02, fillFloor: -0.15, upgrade: true, upgradeGain: 0.05, line: "short", aim: "h2",
    turret: 1, extra: 1, join: 1, aimTop: 4,
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
  replaced?: string; // an upgrade: the def of the fitted gear or core it replaced (sold); a turret: the one it displaced
  slot?: number; // CAND-A: a turret: the slot it went into
  into?: "extra" | "replace"; // CAND-A: a turret: into the empty extra slot, or replacing an installed one
  joins?: number; // CAND-A: a factory: how many of its belts join another belt
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

type Kind = "rig" | "gear" | "core" | "factory" | "plating" | "crate" | "turret";

/** A new factory's belt: its cells, and the belt tile it joins (absent: it ends on a free intake). */
interface Line { cells: number[]; join?: number }

/** CAND-A: a turret offer's plan, played on a copy of the run and replayed by buyTurret through the same actions. */
interface TurretPlan {
  copy: number; // the bought copy in cargo after buyOffer's gain (a cargo twin may have merged into it)
  slot: number; // installFromCargo(copy, slot); an occupied slot swaps
  moved?: number; // the displaced turret, installed in this empty slot
  refit: Refit[]; // gear and cores the swap handed back, put on a turret with room
  sell: number[]; // cargo parts sold after (a displaced turret worth something, gear or cores with no room)
  build: Build; // the deck after the plan
  into: "extra" | "replace";
  replaced?: string; // the displaced turret's def
  sold: boolean; // it sells a part worth something: an upgrade, a late sink like the gear upgrade
}
interface Refit { uid: number; turret: number; core: boolean }

interface Cand {
  wagon: number;
  slot: number;
  def: string;
  price: number;
  kind: Kind;
  merge: boolean; // the copy merges into a placed twin
  at?: GainAt; // where it is dropped (buyOffer's `at`)
  routes?: Line[]; // a new factory's belts
  grown?: { build: Build; tiles: number }; // a belt crate: the deck after it lengthens a belt (items and routes)
  swap?: number; // an upgrade: the uid of the fitted gear or core it replaces (stored, then sold)
  turret?: TurretPlan; // CAND-A: a turret offer's plan
  rel: number; // (rateDeck(after) - rateDeck(now)) / rateDeck(now)
}

/** A late sink (pickOffer): an upgrade that sells a part it replaces, or a turret that replaces a working one (a
 *  deliberate swap, taken for a clear gain only; the rating can't see a turret's window or shell flight). */
const sinks = (c: Cand): boolean => c.swap !== undefined || c.turret?.into === "replace";

const SIDE0: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };

/** The run the par player plays: the game's own newRun (runId fixed, so nothing reads the clock). */
function startRun(hero: HeroId, seed: number): Run {
  return newRun(hero, hashSeed("par-player-run", hero, seed), `par-${hero}-${seed}`);
}

/** Dusk won, next dawn: the game's finishDay (a win's income, yesterday's merchants, a fresh caravan). */
function nextDawn(run: Run): void {
  finishDay(run, 0, FIGHT_T, { ...SIDE0 }, { ...SIDE0 });
}

/** A copy of the run whose deck and cargo can change without touching the run (the shop is shared, never written). */
function simRun(run: Run): Run {
  return { ...run, build: cloneBuild(run.build), inventory: run.inventory.map((i) => ({ ...i })), fuseFx: [], fuseAnim: [] } as Run;
}

/** What buyOffer(run, ., ., at) would leave on the deck, on a copy of the run (the same gainModule path). */
function afterGain(run: Run, def: string, at: GainAt | undefined): Build {
  const sim = simRun(run);
  const pv = at ? mergePreview(sim, def) : null;
  gainModule(sim, def, pv && pv.where !== "cargo" ? undefined : at);
  return sim.build;
}

const relOf = (after: Build, base: number): number => (base > 0 ? rateDeck(after).value / base - 1 : rateDeck(after).value > 0 ? 1 : 0);

/** A new Shopper on `b` for belt edits only: an unlimited purse (moveRoute's check), stars, cores and factories on. */
const editor = (b: Build, day: number, rng: Rng): Shopper => new Shopper(b, Number.MAX_SAFE_INTEGER, day, rng, "on", FUSE_MAX, "on", "on");

/** The rig spots worth trying for `def`: the harness's H2 spot (Shopper.rigSpot) for every belt tile of a connected
 *  route with a free side (Shopper.rigTiles; a speed rig skips slag routes, rigTilesFor), each spot once. With `rng`
 *  (place "tile"), exactly as the harness's gate lever places a rig: one of those tiles at random, its H2 spot.
 *  CAND-A: with `rng` and `top`, a multi-arrow rig also tries `top` of the spots where most of its arrows land (at
 *  least two: on two tiles of a belt or on two belts), at random among them. */
function rigSpots(s: Shopper, def: string, rng?: Rng, aim: PolicyKnobs["aim"] = "h2", top = 0): RigSpot[] {
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
  if (rng && top > 0 && rigArrows(def).length > 1) {
    const all = rigSpots(s, def);
    const most = Math.max(0, ...all.map((sp) => sp.hits.length));
    if (most >= 2) {
      for (const sp of rng.shuffle(all.filter((x) => x.hits.length === most)).slice(0, top)) {
        const k = `${sp.x},${sp.y},${sp.rot}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(sp);
      }
    }
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

/** blockedCells of the deck with a `def` factory put at (x, y) as well: `bl` (blockedCells of the deck) with its
 *  footprint blocked, without copying the deck (CAND-A: the spot searches try every free spot). */
function withFactory(bl: Uint8Array, def: string, x: number, y: number): Uint8Array {
  const out = bl.slice();
  for (const k of footprint(ITEMS[def], x, y)) if (k >= 0 && k < out.length) out[k] = 1;
  return out;
}

/** The shortest belt a new 2x2 factory could have into a free intake (a free spot off the forward row), or Infinity
 *  when no intake is free or none can be reached. */
function factoryReach(b: Build): number {
  const cols = freeConnectors(b);
  if (!cols.length) return Infinity;
  const occ = occupancy(b), d = ITEMS.press, bl0 = blockedCells(b);
  let best = Infinity;
  for (let y = 1; y + d.size <= 10; y++) {
    for (let x = 0; x + d.size <= 10; x++) {
      if (footprint(d, x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
      const bl = withFactory(bl0, d.id, x, y), starts = startCells(x, y, d.size, bl);
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
 * A new factory's own lines: the free 2x2 spot (off the forward row) with the shortest belt into a free intake that
 * the spare belt covers (ties: the first spot in row order), and for a factory with more outputs (GANTRY PRESS) the
 * next shortest belts into the other free intakes, while the belt lasts. null when none fits.
 */
function factoryPlan(b: Build, def: string, rng: Rng, line: PolicyKnobs["line"] = "short", only?: readonly number[]): { x: number; y: number; routes: Line[] } | null {
  const d = ITEMS[def];
  const cols = freeConnectors(b).filter((c) => !only || only.includes(c)); // CAND-A: `only`, one turret's free intakes
  if (!cols.length) return null;
  const occ = occupancy(b), bl0 = blockedCells(b);
  let best: { x: number; y: number; col: number; len: number } | null = null;
  for (let y = 1; y + d.size <= 10; y++) {
    for (let x = 0; x + d.size <= 10; x++) {
      if (footprint(d, x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
      const bl = withFactory(bl0, def, x, y), starts = startCells(x, y, d.size, bl);
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
  const routes: Line[] = [];
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
    routes.push({ cells });
    trial.routes.push({ factory: -1, cells });
    spare -= cells.length;
  }
  return routes.length ? { x: best.x, y: best.y, routes } : null;
}

// ---------------------------------------------------------------- joins (0.6.2j, REQ-BFG-027)

/** Breadth-first search through the free cells (bl: machinery, belts, the forward row) from `starts`: each cell's
 *  distance in tiles (a start is 1; -1 unreached) and its parent. */
function bfs(bl: Uint8Array, starts: number[]): { dist: Int32Array; prev: Int32Array } {
  const dist = new Int32Array(GRID * GRID).fill(-1), prev = new Int32Array(GRID * GRID).fill(-1), q: number[] = [];
  for (const s of starts) if (!bl[s] && dist[s] < 0) { dist[s] = 1; q.push(s); }
  for (let i = 0; i < q.length; i++) {
    const k = q[i];
    for (let d = 0; d < 4; d++) {
      const nx = kx(k) + DX[d], ny = ky(k) + DY[d];
      if (!inGrid(nx, ny)) continue;
      const n = key(nx, ny);
      if (dist[n] >= 0 || bl[n]) continue;
      dist[n] = dist[k] + 1;
      prev[n] = k;
      q.push(n);
    }
  }
  return { dist, prev };
}

/** The tiles a new joining belt may aim at: each connected belt's tiles (but `skip`'s) up to its first worked tile, so
 *  its payloads still meet the whole rig row; every tile of a belt no rig works. */
function joinTargets(b: Build, skip = -1): { route: number; tile: number }[] {
  const claims = connectorClaims(b), hits = rigHits(b), occ = occupancy(b);
  const out: { route: number; tile: number }[] = [];
  b.routes.forEach((r, m) => {
    if (m === skip || !routeInfo(b, m, claims, occ, hits).connected) return;
    const worked = (hits[m] ?? []).findIndex((t) => t.length > 0);
    const last = worked < 0 ? r.cells.length - 1 : worked;
    for (let t = 0; t <= last; t++) out.push({ route: m, tile: t });
  });
  return out;
}

/** The shortest joining line (bfs from a factory's starts) into tile `tile` of route m: to the reached free cell beside
 *  the tile nearest a start (ties: direction order), then the join. null when none is reached. */
function joinLine(b: Build, dist: Int32Array, prev: Int32Array, m: number, tile: number): Line | null {
  const k0 = b.routes[m].cells[tile];
  let best = -1;
  for (let d = 0; d < 4; d++) {
    const n = arrowCell(kx(k0), ky(k0), d as Dir);
    if (n < 0 || dist[n] < 1) continue;
    if (best < 0 || dist[n] < dist[best]) best = n;
  }
  if (best < 0) return null;
  const cells: number[] = [];
  for (let c = best; c >= 0; c = prev[c]) cells.push(c);
  return { cells: cells.reverse(), join: k0 };
}

/**
 * A new factory's plan (CAND-A): its own lines into free intakes (factoryPlan: into any, and into each installed
 * turret's own free intakes, so a line can feed a gun just put in the extra slot), or with `join` one line joining a
 * connected belt at a tile up to its rig row, from the free spot whose line there is shortest (ties: row order); the
 * best-rated plan. The editor's commitRoute writes each belt. null when none fits.
 */
function factoryCand(b: Build, def: string, uid: number, rng: Rng, pol: PolicyKnobs, base: number): { x: number; y: number; routes: Line[]; rel: number } | null {
  const place = (x: number, y: number, routes: Line[]): Build => {
    const after = cloneBuild(b);
    after.items.push({ uid, def, x, y });
    for (const l of routes) commitRoute(after, uid, l.cells, -1, l.join);
    return after;
  };
  let best: { x: number; y: number; routes: Line[]; rel: number } | null = null;
  const free = freeConnectors(b);
  const groups: (readonly number[] | undefined)[] = [undefined];
  for (const v of installedTurrets(b)) {
    const cols = v.intakes.filter((c) => free.includes(c));
    if (cols.length && cols.length < free.length) groups.push(cols);
  }
  for (const only of groups) {
    const own = factoryPlan(b, def, rng, pol.line, only);
    if (!own) continue;
    const rel = relOf(place(own.x, own.y, own.routes), base);
    if (!best || rel > best.rel) best = { ...own, rel };
  }
  if (!pol.join) return best;
  const d = ITEMS[def], occ = occupancy(b), spare = beltFree(b);
  const targets = joinTargets(b);
  if (!targets.length) return best;
  const near = targets.map(() => null as { x: number; y: number; line: Line } | null);
  const bl0 = blockedCells(b);
  for (let y = 1; y + d.size <= 10; y++) {
    for (let x = 0; x + d.size <= 10; x++) {
      if (footprint(d, x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
      const bl = withFactory(bl0, def, x, y), { dist, prev } = bfs(bl, startCells(x, y, d.size, bl));
      targets.forEach((t, i) => {
        const l = joinLine(b, dist, prev, t.route, t.tile);
        if (l && l.cells.length <= spare && (!near[i] || l.cells.length < near[i]!.line.cells.length)) near[i] = { x, y, line: l };
      });
    }
  }
  for (const n of near) {
    if (!n) continue;
    const after = place(n.x, n.y, [n.line]);
    if (joinProblem(after, after.routes.length - 1) !== null) continue;
    const rel = relOf(after, base);
    if (!best || rel > best.rel) best = { x: n.x, y: n.y, routes: [n.line], rel };
  }
  return best;
}

/**
 * CAND-A: redraw one belt into a join, the game's free redraw: for each connected belt that neither joins nor is
 * joined, its shortest line into each target tile of another belt (within its own tiles plus the free belt), its
 * riders (rigs that work only it) lifted and put back beside the new belt (Shopper.reseat). The best-rated, or null.
 */
function rejoin(b: Build, day: number, rng: Rng, base: number): { build: Build; rel: number } | null {
  const claims = connectorClaims(b);
  let best: { build: Build; rel: number } | null = null;
  b.routes.forEach((r, ri) => {
    if (r.join !== undefined || joinersOf(b, ri).length || !routeInfo(b, ri, claims).connected) return;
    best = joinRedraw(b, ri, day, rng, base, best);
  });
  return best;
}

/** Belt ri redrawn into each join target (another connected belt's tile up to its rig row) at its shortest line from
 *  its factory (within its own tiles plus the free belt), its riders lifted and put back beside it: the best-rated
 *  of those and `best` (rejoin's scan; parBench's refeedRoute). */
function joinRedraw(b: Build, ri: number, day: number, rng: Rng, base: number, best: { build: Build; rel: number } | null): { build: Build; rel: number } | null {
  const r = b.routes[ri], f = itemByUid(b, r.factory);
  if (!f) return best;
  const lifted = cloneBuild(b), s = editor(lifted, day, rng);
  const riders = s.ridersOf(ri);
  s.lift(riders);
  const bl = blockedCells(lifted, ri), { dist, prev } = bfs(bl, startCells(f.x, f.y, ITEMS[f.def].size, bl));
  const room = r.cells.length + beltFree(b);
  for (const t of joinTargets(lifted, ri)) {
    const l = joinLine(lifted, dist, prev, t.route, t.tile);
    if (!l || l.cells.length > room) continue;
    const trial = cloneBuild(lifted);
    trial.routes[ri] = { factory: r.factory, cells: l.cells, join: l.join };
    if (joinProblem(trial, ri) !== null) continue;
    if (editor(trial, day, rng).reseat(riders.map((p) => ({ ...p })), ri) < riders.length) continue;
    const rel = relOf(trial, base);
    if (!best || rel > best.rel) best = { build: trial, rel };
  }
  return best;
}

// ---------------------------------------------------------------- turrets (0.6.2s, REQ-BFG-031)

/**
 * The ways to feed turret slot `slot` (a turret just installed there, no belt yet): a connected belt that no belt
 * joins (a joining belt too: it then runs to the intake instead), redrawn at its shortest into one of the slot's
 * intakes within its tiles plus the free belt (the game's free redraw; Shopper.moveRoute lifts its riders and puts
 * them back beside the new belt). Each a new deck.
 */
function feedPlans(b: Build, slot: number, day: number, rng: Rng): Build[] {
  const out: Build[] = [];
  const cols = turretSlots(b)[slot]?.intakes ?? [];
  const claims = connectorClaims(b), free = beltFree(b);
  b.routes.forEach((r, ri) => {
    if (joinersOf(b, ri).length || !routeInfo(b, ri, claims).connected) return;
    const f = itemByUid(b, r.factory);
    if (!f) return;
    const bl = blockedCells(b, ri), starts = startCells(f.x, f.y, ITEMS[f.def].size, bl);
    for (const col of cols) {
      const len = shortestTiles(bl, starts, col);
      if (!Number.isFinite(len) || len > r.cells.length + free) continue;
      const trial = cloneBuild(b);
      if (editor(trial, day, rng).moveRoute(ri, len, col)) out.push(trial);
    }
    const moved = moveFactoryPlan(b, ri, cols, r.cells.length + free, day, rng);
    if (moved) out.push(moved);
  });
  return out;
}

/**
 * CAND-A: the factory of belt ri moved (the build screen's free move) to the free spot with the shortest line into one
 * of `cols` (ties: row order, then the column order), its belt redrawn there at that length (at most `room` tiles) and
 * its riders put back beside it. Only a factory with that one belt, not the hero's own (KILN, LOOM). null: none fits.
 */
function moveFactoryPlan(b: Build, ri: number, cols: readonly number[], room: number, day: number, rng: Rng): Build | null {
  const r = b.routes[ri], f = itemByUid(b, r.factory);
  if (!f || f.def === HEROES[b.hero].factory || b.routes.some((q, i) => i !== ri && q.factory === f.uid)) return null;
  const size = ITEMS[f.def].size;
  const lifted = cloneBuild(b), s = editor(lifted, day, rng);
  const riders = s.ridersOf(ri);
  s.lift(riders);
  lifted.items = lifted.items.filter((p) => p.uid !== f.uid);
  lifted.routes[ri] = { factory: f.uid, cells: [] };
  const occ = occupancy(lifted), bl0 = blockedCells(lifted, ri);
  let best: { x: number; y: number; col: number; len: number } | null = null;
  for (let y = 1; y + size <= GRID; y++) {
    for (let x = 0; x + size <= GRID; x++) {
      if (footprint(ITEMS[f.def], x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
      const bl = withFactory(bl0, f.def, x, y), starts = startCells(x, y, size, bl);
      for (const col of cols) {
        const len = shortestTiles(bl, starts, col);
        if (len <= room && (!best || len < best.len)) best = { x, y, col, len };
      }
    }
  }
  if (!best) return null;
  const trial = cloneBuild(lifted);
  trial.items.push({ ...f, x: best.x, y: best.y });
  const bl = blockedCells(trial, ri);
  const cells = randomPath(bl, startCells(best.x, best.y, size, bl), best.col, best.len, rng);
  if (!cells) return null;
  trial.routes[ri] = { factory: f.uid, cells };
  if (editor(trial, day, rng).reseat(riders.map((p) => ({ ...p })), ri) < riders.length) return null;
  return trial;
}

/** A swap can leave belts under slot t without an intake (an "inner" turret takes one column): each is redrawn at its
 *  shortest into a free intake (within its tiles plus the free belt), shortest first. False when one can't be. */
function rerouteDeadEnds(b: Build, t: number, day: number, rng: Rng): boolean {
  for (const ri of deadEndsAt(b, t)) {
    const r = b.routes[ri];
    if (r.join !== undefined || joinersOf(b, ri).length) return false;
    const f = itemByUid(b, r.factory);
    if (!f) return false;
    const bl = blockedCells(b, ri), starts = startCells(f.x, f.y, ITEMS[f.def].size, bl);
    const tries = freeConnectors(b, ri).map((col) => ({ col, len: shortestTiles(bl, starts, col) }))
      .filter((c) => Number.isFinite(c.len) && c.len <= r.cells.length + beltFree(b)).sort((x, y) => x.len - y.len || x.col - y.col);
    if (!tries.some((c) => editor(b, day, rng).moveRoute(ri, c.len, c.col))) return false;
  }
  return deadEndsAt(b, t).length === 0;
}

/** Put a cargo gear piece or core onto turret t: the build screen's drop (actions.ts: takeFromInventory, then the
 *  hardpoint) or run.ts fitCore. */
function refitTo(run: Run, f: Refit): boolean {
  if (f.core) return fitCore(run, f.uid, f.turret);
  const it = takeFromInventory(run, f.uid);
  if (!it) return false;
  run.build.mods.push({ uid: it.uid, def: it.def, turret: f.turret, ...(starsOf(it) > 1 ? { stars: starsOf(it) } : {}) });
  return true;
}

/** The value of a cargo copy (a turret's counts a free starting copy as 0). */
const cargoValue = (it: { def: string; stars?: number; free?: boolean }): number => (isTurretDef(it.def) ? turretValue(it) : valueOf(it.def, starsOf(it)));

/** What a plan does with the parts its swap handed back (`back`, cargo uids): gear and cores onto a turret with room
 *  (the first installed turret that takes it, fed ones first), else sold; a displaced turret sold when it is worth
 *  something (a 1-star starting turret can't be sold: it stays in cargo, worth 0). Applied to `sim`. */
function settle(sim: Run, back: number[]): { refit: Refit[]; sell: number[]; sold: boolean } {
  const refit: Refit[] = [], sell: number[] = [];
  const fed = fedTurrets(sim.build);
  const slots = installedTurrets(sim.build).map((v) => v.slot).sort((x, y) => Number(fed.has(y)) - Number(fed.has(x)) || x - y);
  for (const uid of back) {
    const it = sim.inventory.find((i) => i.uid === uid);
    if (!it) continue;
    if (isTurretDef(it.def)) {
      if (canSellTurret(it)) sell.push(uid);
      continue;
    }
    const core = ITEMS[it.def].kind === "core";
    const t = slots.find((s) => (core ? !coreFor(sim.build, s) : canFitGear(sim.build, s, it.def).ok));
    if (t !== undefined && refitTo(sim, { uid, turret: t, core })) refit.push({ uid, turret: t, core });
    else sell.push(uid);
  }
  let sold = false;
  for (const uid of sell) {
    const it = sim.inventory.find((i) => i.uid === uid)!;
    if (cargoValue(it) > 0) sold = true;
    sellInventory(sim, uid);
  }
  return { refit, sell, sold };
}

/**
 * A turret offer's best plans (0.6.2s REQ-BFG-031), each played on a copy of the run through the game's actions:
 * buyOffer's gain (gainModule into cargo), installFromCargo into each slot: the empty extra slot with a belt redrawn to
 * feed it (feedPlans), or an installed turret's slot (a swap; dead ends redrawn), the displaced turret perhaps
 * installed in the empty extra slot with a belt to feed it; then the handed-back parts settled. The best plan of each
 * kind ("extra": a plain buy; "replace": an upgrade, a late sink), so a swap never hides a gun for the extra slot.
 * {} when the copy merges into an installed twin (a merge) or no plan exists.
 */
type TurretBest = { plan: TurretPlan; rel: number };
function turretCand(run: Run, def: string, pol: PolicyKnobs, rng: Rng, base: number): { extra?: TurretBest; replace?: TurretBest } {
  const sim0 = simRun(run);
  const g = gainModule(sim0, def);
  const best: { extra?: TurretBest; replace?: TurretBest } = {};
  if (g.where !== "cargo") return best;
  const consider = (sim: Run, back: number[], p: Pick<TurretPlan, "slot" | "moved" | "into" | "replaced">) => {
    const s = settle(sim, back);
    const rel = relOf(sim.build, base);
    const cur = best[p.into];
    if (!cur || rel > cur.rel) best[p.into] = { plan: { copy: g.survivor, ...p, refit: s.refit, sell: s.sell, sold: s.sold, build: sim.build }, rel };
  };
  for (const v of turretSlots(sim0.build)) {
    if (!v.turret && !pol.extra) continue;
    const sim = simRun(sim0);
    const r = installFromCargo(sim, g.survivor, v.slot);
    if (!r.ok) continue;
    const back = [...r.turrets.map((x) => x.uid), ...r.mods.map((m) => m.uid)];
    if (!v.turret) {
      for (const fed of feedPlans(sim.build, v.slot, run.day, rng)) {
        const s2 = simRun(sim);
        s2.build = fed;
        consider(s2, back, { slot: v.slot, into: "extra" });
      }
      continue;
    }
    if (!rerouteDeadEnds(sim.build, v.slot, run.day, rng)) continue;
    const replaced = r.turrets[0]?.def;
    consider(simRun(sim), back, { slot: v.slot, into: "replace", replaced });
    const displaced = r.turrets[0];
    if (!displaced || !pol.extra) continue;
    for (const e of turretSlots(sim.build).filter((x) => !x.turret)) {
      const s2 = simRun(sim);
      if (!installFromCargo(s2, displaced.uid, e.slot).ok) continue;
      for (const fed of feedPlans(s2.build, e.slot, run.day, rng)) {
        const s3 = simRun(s2);
        s3.build = fed;
        consider(s3, back.filter((u) => u !== displaced.uid), { slot: v.slot, moved: e.slot, into: "replace", replaced });
      }
    }
  }
  return best;
}

/**
 * CAND-A: a turret for an empty slot, judged with a factory offer the purse also covers whose own line would feed it
 * (factoryPlan into that turret's intakes on the deck with it installed). The plan installs the turret unfed; the
 * factory is judged on its own next, its line into the new turret among its choices (factoryCand). null: no such line.
 */
function pairCand(run: Run, def: string, fdef: string, pol: PolicyKnobs, rng: Rng, base: number): { plan: TurretPlan; rel: number } | null {
  const sim0 = simRun(run);
  const g = gainModule(sim0, def);
  if (g.where !== "cargo") return null;
  let best: { plan: TurretPlan; rel: number } | null = null;
  for (const v of turretSlots(sim0.build)) {
    if (v.turret) continue;
    const sim = simRun(sim0);
    if (!installFromCargo(sim, g.survivor, v.slot).ok) continue;
    const fp = factoryPlan(sim.build, fdef, rng, pol.line, turretSlots(sim.build)[v.slot].intakes);
    if (!fp) continue;
    const after = cloneBuild(sim.build), uid = sim.nextUid;
    after.items.push({ uid, def: fdef, x: fp.x, y: fp.y });
    for (const l of fp.routes) commitRoute(after, uid, l.cells, -1);
    const rel = relOf(after, base);
    if (!best || rel > best.rel) best = { plan: { copy: g.survivor, slot: v.slot, into: "extra", refit: [], sell: [], sold: false, build: sim.build }, rel };
  }
  return best;
}

/** CAND-A: a cargo turret (one a swap displaced) back into an empty slot with a belt to feed it, when that rates best. */
function reinstallCand(run: Run, rng: Rng, base: number): { uid: number; slot: number; build: Build; rel: number } | null {
  const empty = turretSlots(run.build).filter((v) => !v.turret).map((v) => v.slot);
  let best: { uid: number; slot: number; build: Build; rel: number } | null = null;
  if (!empty.length) return best;
  for (const it of run.inventory) {
    if (!isTurretDef(it.def)) continue;
    for (const e of empty) {
      const sim = simRun(run);
      if (!installFromCargo(sim, it.uid, e).ok) continue;
      for (const fed of feedPlans(sim.build, e, run.day, rng)) {
        const rel = relOf(fed, base);
        if (!best || rel > best.rel) best = { uid: it.uid, slot: e, build: fed, rel };
      }
    }
  }
  return best;
}

/** The same deck (a plan against its replay). */
const same = (a: Build, b: Build): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The belt a player lengthens with its free belt capacity (after a belt crate): for each connected route, the route
 * redrawn `free` tiles longer into the same intake (Shopper.moveRoute: its riders, the rigs that work only it, are
 * lifted and put back beside the new belt; the harness's own route edit), and of those the best-rated deck. null
 * when nothing can grow or no growth rates above `base`. CAND-A: a belt that joins or is joined isn't redrawn here.
 */
function growBelt(b: Build, day: number, rng: Rng, base: number): { build: Build; tiles: number; rel: number } | null {
  // while a factory line still fits into a free intake, the player keeps the belt it needs
  const reach = factoryReach(b);
  const free = beltFree(b) - (reach <= beltFree(b) ? reach : 0);
  if (free <= 0) return null;
  const claims = connectorClaims(b);
  let best: { build: Build; tiles: number; rel: number } | null = null;
  b.routes.forEach((r, ri) => {
    if (r.join !== undefined || joinersOf(b, ri).length) return;
    if (!routeInfo(b, ri, claims, undefined, []).connected) return;
    const col = r.cells[r.cells.length - 1] % 10;
    for (let tiles = Math.min(MAX_TILES, r.cells.length + free); tiles > r.cells.length; tiles--) {
      const trial = cloneBuild(b);
      const s = editor(trial, day, rng);
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
  return k === "gate" ? "rig" : k === "mod" ? "gear" : k === "core" ? "core" : k === "factory" ? "factory" : k === "turret" ? "turret" : ITEMS[def].supply?.hull ? "plating" : "crate";
};

/** Every affordable offer the deck can take, with what it does to the rating: merges into a placed twin, rigs at an
 *  H2 spot, gear and cores on a free hardpoint or socket (never a core swap), factories with their belts, plating, and
 *  belt crates with the belt they lengthen (pol.grow). CAND-A: turrets (turretCand), gear in any free gear slot of an
 *  installed turret, factory belts that join, and a multi-arrow rig's best-landing spots. */
function candidates(run: Run, maxStars: number, rng: Rng, pol: PolicyKnobs): Cand[] {
  const b = run.build;
  const base = rateDeck(b).value;
  const s = new Shopper(b, maxGoldByDay(run.day), run.day, rng, "on", maxStars, "on", "on");
  s.uid = run.nextUid;
  const out: Cand[] = [];
  const planned = new Map<string, Omit<Cand, "wagon" | "slot" | "price">[]>();
  const fed = fedTurrets(b);
  // CAND-A: the factories on offer, for a turret judged with the factory that would feed it (pairCand)
  const factories = run.shop.wagons.flatMap((w) => w.offers.filter((o) => !o.sold && ITEMS[o.def].kind === "factory").map((o) => ({ def: o.def, price: o.price })));
  run.shop.wagons.forEach((w, wi) => w.offers.forEach((o, si) => {
    if (o.sold || o.price > run.gold) return;
    const d = ITEMS[o.def];
    const push = (cs: Omit<Cand, "wagon" | "slot" | "price">[]) => { for (const c of cs) out.push({ ...c, wagon: wi, slot: si, price: o.price }); };
    if (planned.has(o.def)) return push(planned.get(o.def)!);
    let c: Omit<Cand, "wagon" | "slot" | "price"> | null = null;
    const more: Omit<Cand, "wagon" | "slot" | "price">[] = []; // CAND-A: a turret's second plan (its best swap)
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
        for (const sp of rigSpots(s, o.def, pol.place === "tile" ? rng : undefined, pol.aim, pol.aimTop)) {
          const after = cloneBuild(b);
          placeRigAt(after, run.nextUid, o.def, sp);
          const r = relOf(after, base);
          if (!best || r > best.rel) best = { def: o.def, kind: "rig", merge: false, at: { x: sp.x, y: sp.y, rot: sp.rot }, rel: r };
        }
        // no free cell beside a belt: an upgrade sells a cheaper placed rig and puts the new one on its cell
        if (!best && pol.upgrade && !s.hasRigTile()) best = rigSwap(b, s, o.def, o.price, run.nextUid, base);
        c = best;
      } else if (d.kind === "mod" || d.kind === "core") {
        // 0.6.2s (S4): gear into a free GEAR SLOT of an installed turret (never two copies of one def on a turret), a
        // core into a socket without a bought core; "tile": one such turret at random, a fed one when there is one
        const slots = installedTurrets(b).map((v) => v.slot);
        const room = (t: number) => (d.kind === "mod" ? canFitGear(b, t, o.def).ok : !coreFor(b, t));
        const free = slots.filter(room);
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
          // no room for it on any turret: an upgrade replaces a fitted piece of its kind worth less than this offer (sold)
          for (const t of slots) {
            const fitted: ModPlacement[] = d.kind === "mod" ? gearOn(b, t) : [coreFor(b, t)].filter((m): m is ModPlacement => !!m);
            for (const old of fitted) {
              if (old.def === o.def || valueOf(old.def, starsOf(old)) >= o.price) continue;
              const after = cloneBuild(b);
              after.mods = after.mods.filter((m) => m.uid !== old.uid);
              if (d.kind === "mod" && !canFitGear(after, t, o.def).ok) continue;
              after.mods.push({ uid: run.nextUid, def: o.def, turret: t });
              const r = relOf(after, base);
              if (!best || r > best.rel) best = { def: o.def, kind: kindOf(o.def), merge: false, at: { turret: t }, swap: old.uid, rel: r };
            }
          }
        }
        c = best;
      } else if (d.kind === "factory") {
        const fp = factoryCand(b, o.def, run.nextUid, rng, pol, base);
        if (fp) c = { def: o.def, kind: "factory", merge: false, at: { x: fp.x, y: fp.y }, routes: fp.routes, rel: fp.rel };
      } else if (d.kind === "turret" && pol.turret) {
        const tp = turretCand(run, o.def, pol, rng, base);
        let extra = tp.extra;
        if (pol.extra) {
          for (const f of factories) {
            if (o.price + f.price > run.gold) continue;
            const pc = pairCand(run, o.def, f.def, pol, rng, base);
            if (pc && (!extra || pc.rel > extra.rel)) extra = pc;
          }
        }
        if (extra) c = { def: o.def, kind: "turret", merge: false, turret: extra.plan, rel: extra.rel };
        if (tp.replace) more.push({ def: o.def, kind: "turret", merge: false, turret: tp.replace.plan, rel: tp.replace.rel });
      }
    }
    const cs = [...(c ? [c] : []), ...more];
    planned.set(o.def, cs);
    push(cs);
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
  const plain = cands.filter((c) => !c.merge && !sinks(c) && c.rel > pol.minRel);
  const help = plain.length ? plain : cands.filter((c) => sinks(c) && c.rel >= pol.upgradeGain);
  if (!help.length) return null;
  // the change must stay spendable: on offers that do no harm, or, while the deck is short of the floor, on any
  // offer the fill would take (pol.fillFloor); then such an offer may itself be the pick that keeps the floor reachable
  const ok = (c: Cand) => !sinks(c) && c.rel >= (short ? pol.fillFloor : -pol.harmless);
  const harmless = cands.filter(ok);
  const keepsOf = (xs: Cand[], spendable: Cand[]) => xs.filter((c) => {
    const left = gold - c.price;
    if (left <= keep) return true;
    const seen = new Set<string>([c.def]), prices: number[] = [];
    // an offer of the kind that takes the same turret slot (gear, a core, a turret) or intake (a factory) may not fit after c
    const rival = (o: Cand) => !o.merge && !c.merge && o.kind === c.kind && (c.kind === "gear" || c.kind === "core" || c.kind === "factory" || c.kind === "turret");
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

/** CAND-A: buy turret offer `c` and replay its plan on the run with the same actions: buyOffer (the copy into cargo),
 *  installFromCargo (a swap sends the old turret and gear it can't hold to cargo), the displaced turret into the empty
 *  slot, the plan's belts (the free redraw), gear and cores refitted, the rest sold. Returns the gold the sale lost. */
function buyTurret(run: Run, c: Cand): number {
  const p = c.turret!;
  const res = buyOffer(run, c.wagon, c.slot);
  if (!res.ok || !res.gain || res.gain.where !== "cargo" || res.gain.survivor !== p.copy) throw new Error(`par player: buyOffer ${c.def} did not land in cargo as planned`);
  const r = installFromCargo(run, p.copy, p.slot);
  if (!r.ok) throw new Error(`par player: installFromCargo ${c.def} -> slot ${p.slot}: ${r.reason}`);
  if (p.moved !== undefined) {
    const d = r.turrets[0];
    if (!d || !installFromCargo(run, d.uid, p.moved).ok) throw new Error(`par player: the displaced turret did not go into slot ${p.moved}`);
  }
  run.build.items = cloneBuild(p.build).items; // the plan's belts and the riders put back beside them (a free redraw)
  run.build.routes = cloneBuild(p.build).routes;
  for (const f of p.refit) if (!refitTo(run, f)) throw new Error(`par player: refit ${f.uid} -> turret ${f.turret} failed`);
  let lost = 0;
  for (const uid of p.sell) {
    const it = run.inventory.find((i) => i.uid === uid);
    if (!it) throw new Error(`par player: part ${uid} to sell is not in cargo`);
    lost += cargoValue(it) - sellInventory(run, uid);
  }
  if (!same(run.build, p.build)) throw new Error(`par player: the ${c.def} plan and its replay differ`);
  return lost;
}

/** Buy `c` through the game's buyOffer at its spot; a new factory then gets its belts (commitRoute, joins included), a
 *  crate lengthens its belt, an upgrade's old part goes to cargo first (the game's storeMod; a bought core is swapped
 *  out by gainModule) and is sold (sellInventory: half its value back), a turret replays its plan (buyTurret).
 *  Returns the gold the sale lost (value minus refund). */
function buy(run: Run, c: Cand, why: PlayerBuy["why"], rolls: number, buys: PlayerBuy[], trace?: PlayerOpts["trace"]): number {
  trace?.(run, c.wagon, c.slot);
  if (c.turret) {
    const lost = buyTurret(run, c);
    const t = turretSlots(run.build)[c.turret.slot]?.turret;
    buys.push({ day: run.day, roll: rolls, def: c.def, price: c.price, stars: t ? starsOf(t) : 1, merged: false, why, slot: c.turret.slot, into: c.turret.into, ...(c.turret.replaced ? { replaced: c.turret.replaced } : {}) });
    return lost;
  }
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
  let joins = 0;
  if (c.routes && res.gain && res.gain.where === "deck" && !res.gain.steps.length) {
    for (const l of c.routes) {
      commitRoute(run.build, res.gain.survivor, l.cells, -1, l.join);
      if (l.join !== undefined) joins++;
    }
  }
  if (c.grown) {
    // the redraw is free in the game: the same items (rigs moved beside the new belt) and routes, nothing bought
    run.build.items = cloneBuild(c.grown.build).items;
    run.build.routes = cloneBuild(c.grown.build).routes;
  }
  buys.push({ day: run.day, roll: rolls, def: c.def, price: c.price, stars: res.gain?.stars ?? 1, merged: !!res.gain?.steps.length, why, ...(c.grown ? { grew: c.grown.tiles } : {}), ...(old ? { replaced: old.def } : {}), ...(joins ? { joins } : {}) });
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
  cands = cands.filter((c) => c.kind !== "turret"); // CAND-A: nobody swaps or adds a gun to fill the purse
  let ok = cands.filter((c) => c.rel >= -pol.harmless);
  if (!ok.length) ok = cands.filter((c) => c.rel >= pol.fillFloor);
  const supply = (c: Cand) => (c.kind === "plating" || c.kind === "crate" ? 0 : 1);
  ok.sort((a, b) => supply(a) - supply(b) || b.rel - a.rel || b.price - a.price || a.wagon - b.wagon || a.slot - b.slot);
  return ok[0] ?? null;
}

/** The share of the day's gold the player aims its deck at, in whole gold. */
export const floorGold = (day: number, floor: number): number => Math.ceil(floor * maxGoldByDay(day));

/**
 * CAND-A, each dawn before shopping (free actions): a turret in cargo goes back into an empty slot with a belt to feed
 * it (pol.extra), and a belt is redrawn into a join (pol.join), each when it rates better: by minRel for the sharp
 * player (it re-draws belts anyway), by upgradeGain for the typical one (a clear gain it notices on the build screen).
 */
function dawnEdits(run: Run, pol: PolicyKnobs, rng: Rng): void {
  const need = pol.grow ? pol.minRel : pol.upgradeGain;
  if (pol.extra && pol.turret) {
    const r = reinstallCand(run, rng, rateDeck(run.build).value);
    if (r && r.rel > need) {
      if (!installFromCargo(run, r.uid, r.slot).ok) throw new Error(`par player: reinstall ${r.uid} -> slot ${r.slot} failed`);
      run.build.items = cloneBuild(r.build).items;
      run.build.routes = cloneBuild(r.build).routes;
      if (!same(run.build, r.build)) throw new Error("par player: the reinstall plan and its replay differ");
    }
  }
  if (pol.join) {
    const j = rejoin(run.build, run.day, rng, rateDeck(run.build).value);
    if (j && j.rel > need) {
      run.build.items = j.build.items;
      run.build.routes = j.build.routes;
    }
  }
}

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
  dawnEdits(run, pol, rng);
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
    opts.onDecide?.(run, cands.map((c) => ({ def: c.def, price: c.price, kind: c.kind, merge: c.merge, rel: c.rel, ...(c.turret ? { plan: `${c.turret.into} ${c.turret.slot}${c.turret.moved !== undefined ? ` moved ${c.turret.moved}` : ""}` } : {}) })), p ? p.c.def : null);
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

// ---------------------------------------------------------------- bench helper (CAND-A: parBench's ablations)

/**
 * CAND-A (tools/parBench.ts, flags 1 and 3): feed belt ri again as a player would once its turret has left or its
 * join is undone: redrawn at its shortest into a free intake (the free redraw, within its tiles plus the free belt,
 * its riders put back beside it, any join dropped), else, with `join`, into the best-rated join at a tile up to
 * another connected belt's rig row. True when it was redrawn; otherwise `b` is unchanged. Deterministic per seed.
 */
export function refeedRoute(b: Build, ri: number, day: number, seed: number, join = true): boolean {
  const r = b.routes[ri], f = r ? itemByUid(b, r.factory) : undefined;
  if (!r || !f) return false;
  const rng = new Rng(hashSeed("par-refeed", b.hero, day, ri, seed));
  const bl = blockedCells(b, ri), starts = startCells(f.x, f.y, ITEMS[f.def].size, bl);
  const room = r.cells.length + beltFree(b);
  const tries = freeConnectors(b, ri).map((col) => ({ col, len: shortestTiles(bl, starts, col) }))
    .filter((c) => Number.isFinite(c.len) && c.len <= room).sort((x, y) => x.len - y.len || x.col - y.col);
  for (const c of tries) if (editor(b, day, rng).moveRoute(ri, c.len, c.col)) return true;
  if (!join) return false;
  const j = joinRedraw(b, ri, day, rng, rateDeck(b).value, null);
  if (!j) return false;
  b.items = j.build.items;
  b.routes = j.build.routes;
  return true;
}
