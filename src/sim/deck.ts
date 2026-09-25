// Deck construction model: placement, directed routes, validation and route geometry.
// Coordinates are deck-local: x = column (screen left->right for both cruisers),
// y = row with 0 = forward row (the row touching the turrets). Local direction 0 is
// "forward" (toward the enemy); 1 = +x, 2 = back, 3 = -x.

import {
  AMMO, BELT_SPEED, CELL, GRID, HEROES, ITEMS, SHAPE_ARROWS, rigShape,
  type GateEffect, type HeroDef, type HeroId, type ItemDef,
} from "./content";
import { curveDamage, pendulumShift, speedLocked } from "./races/metronome"; // races:
import { effectAt, starsOf } from "./stars";

export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;

export interface Placed {
  uid: number;
  def: string;
  x: number;
  y: number;
  stars?: number; // 0.6.1a: 2 or 3 after a merge; absent = 1 (never written as 1)
  // 0.6.2 BELTSIDE (D1): a rig's rotation in clockwise quarter turns, 1..3; absent = 0. Written only for
  // rigs (kind "gate"), never as 0, never for an X rig (it ignores rotation).
  rot?: number;
}

export interface RouteDef {
  factory: number; // uid of the feeding factory
  cells: number[]; // cell keys (y*GRID+x) from factory-adjacent cell to the end
}

export interface ModPlacement {
  uid: number;
  def: string;
  turret: number;
  stars?: number; // 0.6.1a: 2 or 3 after a merge; absent = 1 (never written as 1)
}

export interface Build {
  hero: HeroId;
  items: Placed[];
  routes: RouteDef[];
  mods: ModPlacement[];
  beltCap: number;
  hullBonus: number;
}

export const key = (x: number, y: number) => y * GRID + x;
export const kx = (k: number) => k % GRID;
export const ky = (k: number) => Math.floor(k / GRID);
export const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID;

export function cloneBuild(b: Build): Build {
  return JSON.parse(JSON.stringify(b)) as Build;
}

export function defOf(p: { def: string }): ItemDef {
  const d = ITEMS[p.def];
  if (!d) throw new Error(`unknown item ${p.def}`);
  return d;
}

export function footprint(def: ItemDef, x: number, y: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < def.size; j++) for (let i = 0; i < def.size; i++) out.push(key(x + i, y + j));
  return out;
}

export interface Occ {
  item: number; // uid or -1
  route: number; // route index or -1
}

export function occupancy(b: Build): Occ[] {
  const occ: Occ[] = Array.from({ length: GRID * GRID }, () => ({ item: -1, route: -1 }));
  for (const p of b.items) {
    for (const k of footprint(defOf(p), p.x, p.y)) if (k >= 0 && k < occ.length) occ[k].item = p.uid;
  }
  b.routes.forEach((r, i) => {
    for (const k of r.cells) occ[k].route = i;
  });
  return occ;
}

export function itemByUid(b: Build, uid: number): Placed | undefined {
  return b.items.find((p) => p.uid === uid);
}

export function hero(b: Build): HeroDef {
  return HEROES[b.hero];
}

export function beltUsed(b: Build, exceptRoute = -1): number {
  let n = 0;
  b.routes.forEach((r, i) => {
    if (i !== exceptRoute) n += r.cells.length;
  });
  return n;
}

/** Turret index fed by a forward-row column, or -1. */
export function turretForColumn(h: HeroDef, col: number): number {
  return h.turrets.findIndex((t) => t.connectors.includes(col));
}

/** Map connector column -> index of the route that claims it (first valid claimant wins). */
export function connectorClaims(b: Build): Map<number, number> {
  const h = hero(b);
  const claims = new Map<number, number>();
  b.routes.forEach((r, i) => {
    if (!r.cells.length) return;
    const last = r.cells[r.cells.length - 1];
    if (ky(last) !== 0) return;
    const col = kx(last);
    if (turretForColumn(h, col) < 0) return;
    if (!claims.has(col) && routeWellFormed(b, r)) claims.set(col, i);
  });
  return claims;
}

/** Is cell k orthogonally adjacent to the factory footprint? Returns entry dir or -1. */
export function adjacentToFactory(b: Build, factoryUid: number, k: number): number {
  const f = itemByUid(b, factoryUid);
  if (!f) return -1;
  const fp = new Set(footprint(defOf(f), f.x, f.y));
  const x = kx(k), y = ky(k);
  if (fp.has(k)) return -1;
  for (let d = 0; d < 4; d++) {
    const nx = x - DX[d], ny = y - DY[d];
    if (inGrid(nx, ny) && fp.has(key(nx, ny))) return d; // moving in dir d from factory into k
  }
  return -1;
}

export function dirBetween(a: number, b: number): number {
  const dx = kx(b) - kx(a), dy = ky(b) - ky(a);
  for (let d = 0; d < 4; d++) if (DX[d] === dx && DY[d] === dy) return d;
  return -1;
}

/** R1 (0.6.2 BELTSIDE): no belt runs through machinery of any kind; the old gate-cell exception is gone. */
export function routeWellFormed(b: Build, r: RouteDef): boolean {
  if (!r.cells.length) return false;
  const f = itemByUid(b, r.factory);
  if (!f || defOf(f).kind !== "factory") return false;
  if (adjacentToFactory(b, r.factory, r.cells[0]) < 0) return false;
  const seen = new Set<number>();
  const occ = occupancy(b);
  for (let i = 0; i < r.cells.length; i++) {
    const k = r.cells[i];
    if (k < 0 || k >= GRID * GRID || seen.has(k)) return false;
    seen.add(k);
    if (i > 0 && dirBetween(r.cells[i - 1], k) < 0) return false;
    if (occ[k].item >= 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------- rigs (0.6.2 BELTSIDE)

/** A rig's rotation 0..3 (absent or malformed = 0). */
export function rotOf(p: { rot?: number }): number {
  const r = p.rot;
  return typeof r === "number" && Number.isInteger(r) && r >= 0 && r <= 3 ? r : 0;
}

/** Is `def` a rig (a gate def)? */
export function isRig(def: string): boolean {
  return rigShape(def) !== undefined;
}

/** R3-R4: a rig def's arrows at rotation `rot`, as deck-local directions (d + rot) % 4, in shape order
 *  (the first arrow first). X ignores rotation. [] for anything that is not a rig. */
export function rigArrows(def: string | ItemDef, rot = 0): Dir[] {
  const shape = rigShape(def);
  if (!shape) return [];
  const r = shape === "X" ? 0 : ((Math.floor(rot) % 4) + 4) % 4;
  return SHAPE_ARROWS[shape].map((d) => ((d + r) % 4) as Dir);
}

/** A placed rig's arrows (absolute deck-local directions); [] for anything that is not a rig. */
export function arrowsOf(p: Placed): Dir[] {
  return rigArrows(p.def, rotOf(p));
}

/** The rot to store for a rig: undefined for 0 and for an X rig (D1: absent means 0). */
export function rotField(def: string, rot: number): { rot?: number } {
  const r = ((Math.floor(rot) % 4) + 4) % 4;
  return r === 0 || rigShape(def) === "X" ? {} : { rot: r };
}

/** Set (or clear, at 0) a placed rig's rotation in place. */
export function setRot(p: Placed, rot: number): void {
  const f = rotField(p.def, rot);
  if (f.rot === undefined) delete p.rot;
  else p.rot = f.rot;
}

/** R7 tiers: 1 additive (flat, burn, shock), 2 LONG HAUL-type (perPriorGate), 3 SPLITTER-type, 4 speed. */
export type HitTier = 1 | 2 | 3 | 4;

/** The R7 tier of a rig effect. No rig mixes tiers today; a mixed effect (a future star perk such as
 *  AFTERBURNER's flat on a speed rig) applies whole at its lowest-numbered tier, and its speed still
 *  resolves per tile by speedWinner. */
export function hitTier(e: GateEffect | undefined): HitTier {
  if (!e) return 1;
  if (e.flat || e.burn || e.shock) return 1;
  if (e.perPriorGate) return 2;
  if (e.split) return 3;
  if (e.speed !== undefined) return 4;
  return 1;
}

/** One arrow landing on one belt tile (R5). */
export interface RigHit {
  uid: number; // the rig
  def: string;
  dir: Dir; // the arrow's absolute deck-local direction (from the rig to the tile)
  route: number; // route index
  tile: number; // tile index along the route
  cell: number; // the tile's cell key
  tier: HitTier;
}

/** R7 order on one tile: tier, then rig uid, then arrow direction. */
export function byR7(a: RigHit, b: RigHit): number {
  return a.tier - b.tier || a.uid - b.uid || a.dir - b.dir;
}

/**
 * R7 item 4: when several speed states land on one tile, the one furthest from 1.0x on a log scale
 * wins, and a tie goes to the faster one. undefined when there is none.
 */
export function speedWinner(speeds: readonly number[]): number | undefined {
  let best: number | undefined;
  for (const s of speeds) {
    if (!(s > 0)) continue;
    if (best === undefined) {
      best = s;
      continue;
    }
    const d = Math.abs(Math.log(s)) - Math.abs(Math.log(best));
    if (d > 1e-12 || (Math.abs(d) <= 1e-12 && s > best)) best = s;
  }
  return best;
}

/** The cell an arrow of a rig at (x, y) points at, or -1 off the deck. */
export function arrowCell(x: number, y: number, dir: Dir): number {
  const nx = x + DX[dir], ny = y + DY[dir];
  return inGrid(nx, ny) ? key(nx, ny) : -1;
}

/**
 * Every hit on the deck (R5, R7, R8): result[route][tile] lists the arrows landing on that belt tile in
 * R7 order. An arrow hits when the orthogonal neighbour it points at is a belt tile of any route; an arrow
 * at empty deck, machinery or off the deck is idle. A rig hits every belt its arrows reach, one hit per
 * arrow, so a rig may hit several routes, or one route more than once. A rig standing on a belt tile
 * (illegal since R1; migrateInlineGates moves it) makes no hits. Rigs are one cell (size 1).
 */
export function rigHits(b: Build): RigHit[][][] {
  const out: RigHit[][][] = b.routes.map((r) => r.cells.map(() => []));
  const where = new Map<number, number>(); // cell -> route * 1024 + tile (the last route wins, like occupancy)
  b.routes.forEach((r, ri) => r.cells.forEach((k, ti) => where.set(k, ri * 1024 + ti)));
  for (const p of b.items) {
    const d = ITEMS[p.def];
    if (!d || d.kind !== "gate" || where.has(key(p.x, p.y))) continue;
    const tier = hitTier(effectAt(p.def, starsOf(p)).gate);
    for (const dir of arrowsOf(p)) {
      const k = arrowCell(p.x, p.y, dir);
      const w = k >= 0 ? where.get(k) : undefined;
      if (w === undefined) continue;
      const route = Math.floor(w / 1024), tile = w % 1024;
      out[route][tile].push({ uid: p.uid, def: p.def, dir, route, tile, cell: k, tier });
    }
  }
  for (const r of out) for (const t of r) if (t.length > 1) t.sort(byR7);
  return out;
}

/** The hits of one rig, in route, tile and R7 order ([] = IDLE). */
export function hitsOfRig(b: Build, uid: number, hits = rigHits(b)): RigHit[] {
  const out: RigHit[] = [];
  for (const r of hits) for (const t of r) for (const h of t) if (h.uid === uid) out.push(h);
  return out;
}

export interface RouteInfo {
  index: number;
  connected: boolean;
  turret: number; // -1 when not connected
  connector: number; // column or -1
  tiles: number;
  gates: number[]; // 0.6.2: rig uids, one entry per hit, in travel order (tile, then R7); a rig appears once per arrow
  gateCells: number[]; // tile index within the route for each entry of `gates`
  length: number; // travel distance in px (factory port -> turret intake or belt end)
  wellFormed: boolean;
}

/** A route's connection and its hits. 0.6.2: `_occ` is unused (hits come from rigHits); it stays so the
 *  callers that pass an occupancy keep their signature. Pass `hits` (rigHits(b)) to share one computation. */
export function routeInfo(b: Build, index: number, claims = connectorClaims(b), _occ?: Occ[], hits?: RigHit[][][]): RouteInfo {
  const r = b.routes[index];
  const wf = routeWellFormed(b, r);
  let connected = false, turret = -1, connector = -1;
  if (wf && r.cells.length) {
    const last = r.cells[r.cells.length - 1];
    if (ky(last) === 0 && claims.get(kx(last)) === index) {
      connected = true;
      connector = kx(last);
      turret = turretForColumn(hero(b), connector);
    }
  }
  const gates: number[] = [], gateCells: number[] = [];
  const tiles = (hits ?? rigHits(b))[index] ?? [];
  tiles.forEach((list, i) => {
    for (const h of list) {
      gates.push(h.uid);
      gateCells.push(i);
    }
  });
  const n = r.cells.length;
  return {
    index, connected, turret, connector, tiles: n, gates, gateCells,
    length: routeLength(n, connected), wellFormed: wf,
  };
}

export function routeLength(n: number, connected: boolean): number {
  if (n <= 0) return 0;
  return connected ? CELL * n + CELL / 2 : CELL * n - CELL / 2;
}

/** Polyline for a route in deck-local pixels. */
export function routePolyline(b: Build, r: RouteDef, connected: boolean): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  if (!r.cells.length) return pts;
  const c = (k: number) => ({ x: kx(k) * CELL + CELL / 2, y: ky(k) * CELL + CELL / 2 });
  const d0 = adjacentToFactory(b, r.factory, r.cells[0]);
  const first = c(r.cells[0]);
  const dd = d0 >= 0 ? d0 : 0;
  pts.push({ x: first.x - DX[dd] * CELL / 2, y: first.y - DY[dd] * CELL / 2 });
  for (const k of r.cells) pts.push(c(k));
  if (connected) {
    const last = c(r.cells[r.cells.length - 1]);
    pts.push({ x: last.x, y: last.y - CELL / 2 });
    pts.push({ x: last.x, y: last.y - CELL });
  }
  return pts;
}

/** Point at distance s along a polyline whose segments are axis aligned. */
export function pointAt(pts: { x: number; y: number }[], s: number): { x: number; y: number } {
  if (!pts.length) return { x: 0, y: 0 };
  let rem = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (rem <= len || i === pts.length - 1) {
      const t = len > 0 ? Math.min(1, rem / len) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    rem -= len;
  }
  return pts[pts.length - 1];
}

/** Direction of travel entering and leaving each cell of a route (local dirs). */
export function routeDirs(b: Build, r: RouteDef, connected: boolean): { din: number; dout: number }[] {
  const out: { din: number; dout: number }[] = [];
  for (let i = 0; i < r.cells.length; i++) {
    const din = i === 0 ? adjacentToFactory(b, r.factory, r.cells[0]) : dirBetween(r.cells[i - 1], r.cells[i]);
    let dout: number;
    if (i < r.cells.length - 1) dout = dirBetween(r.cells[i], r.cells[i + 1]);
    else dout = connected ? 0 : din;
    out.push({ din: din < 0 ? 0 : din, dout: dout < 0 ? 0 : dout });
  }
  return out;
}

// ---------------------------------------------------------------- estimates

/**
 * Payload damage model. Core damage (base + ride-time scaling) is multiplied by
 * split multipliers; flat bonuses are added after. A Splitter also scales flat
 * bonuses gained before it, so gate order matters (spec §13).
 */
export function payloadDamage(base: number, rideScale: number, ride: number, mult: number, flat: number): number {
  return Math.max(1, (base + rideScale * ride) * mult + flat);
}

export interface RouteEstimate {
  time: number; // seconds from stamp to chamber for the first payload (all gates online)
  ride: number; // eligible ride time
  dmg: number; // damage per payload (each copy)
  copies: number;
  burn: number;
  shock: boolean;
}

/** 0.6.2 BELTSIDE (V4): what one hit did to the payload in the single-payload walk (walkRoute). */
export interface TimelineHit {
  uid: number;
  def: string;
  dir: Dir; // the arrow's direction (from the rig to the tile)
  stars: number;
  tier: HitTier;
  flat?: number; // flat damage this hit added (WHETSTONE; LONG HAUL: perPriorGate x prior)
  prior?: number; // LONG HAUL-type: the earlier hits it counted (at most its priorCap)
  capped?: number; // beltside-062 (P3): LONG HAUL ★2/★3 saw more earlier hits than its priorCap; the cap ("MAX 6 HITS")
  burn?: number;
  shock?: boolean;
  split?: { copies: number; mult: number };
  speed?: number; // a speed hit's state
  won?: boolean; // its speed holds the tile (R7 item 4); false: a bigger change on the same tile beat it
}

/** One belt tile with hits, in the walk's order; `speed` is the belt's speed state from this tile on. */
export interface TimelineRow {
  tile: number;
  cell: number;
  hits: TimelineHit[]; // R7 order
  speed: number;
}

export interface RouteWalk {
  estimate: RouteEstimate;
  timeline: TimelineRow[];
  speedEnd: number; // the speed state at the turret end
  locked: boolean; // races: METRONOME belts ignore speed states
  // beltside-062c (DESIGN §12 P8): 0.6.1c SLAG's fixed belt speed, which no speed hit changes (absent for other ammo)
  fixed?: number;
}

/**
 * Deterministic single-payload walk (no congestion, rigs online), the one source of the inspector's numbers.
 * 0.6.2: each tile applies its hits in R7 order (rigHits): additive, then LONG HAUL-type (counting every
 * earlier hit, this tile's additive ones included), then SPLITTER-type, then speed, whose winner
 * (speedWinner) holds from this tile downstream. Every hit counts as a prior hit. The timeline records what
 * each hit did, tile by tile (V4).
 */
export function walkRoute(b: Build, index: number, hits = rigHits(b)): RouteWalk {
  const info = routeInfo(b, index, undefined, undefined, hits);
  const r = b.routes[index];
  const f = itemByUid(b, r.factory);
  // beltside-062 D1: 0.6.1p's star-resolved factory (STAMP PRESS dies set `base`), BELTSIDE's per-tile hits
  const fs = f ? effectAt(f.def, starsOf(f)).factory : undefined; // 0.6.1p: at its stars (STAMP PRESS dies)
  const ammo = fs ? AMMO[f?.def === "mimic" ? HEROES[b.hero].ammo : fs.ammo] : AMMO.plain;
  const base = fs?.base ?? ammo.base;
  const tiles = hits[index] ?? [];
  const locked = speedLocked(b.hero); // races: METRONOME belts ignore speed states
  const timeline: TimelineRow[] = [];
  // 0.6.1c SLAG: rides at its fixed speed whatever the speed gates (Battle.transport). beltside-062c (DESIGN §12
  // P8): no speed hit changes it, so the walk keeps `fixed` and the timeline never marks a speed hit as winning
  const fixed = ammo.fixedSpeed;
  let time = 0, ride = 0, speed = fixed ?? 1, mult = 1, flat = 0, copies = 1, burn = 0, shock = false, prior = 0;
  let heat = 0, heatBonus = 0;
  // 0.6.1c HOT SWAP: its slugs alternate EMBER and SPARK, so the walk shows the ember's Burn and the spark's Shock
  for (const pr of fs?.cycle ?? []) {
    if (pr.burn) burn = Math.max(burn, pr.burn);
    if (pr.shock) shock = true;
  }
  // walk cell by cell: half cell entering, the hits at the centre, half cell leaving
  const n = r.cells.length;
  for (let i = 0; i < n; i++) {
    const inHalf = CELL / 2 / (BELT_SPEED * speed);
    time += inHalf;
    ride += inHalf;
    heatBonus += heat * inHalf;
    const speeds: number[] = [];
    const row: TimelineHit[] = [];
    for (const h of tiles[i] ?? []) {
      const stars = starsOf(itemByUid(b, h.uid));
      const e = effectAt(h.def, stars).gate; // 0.6.1a: the same star spec as Battle.makeSide
      if (!e) continue;
      const th: TimelineHit = { uid: h.uid, def: h.def, dir: h.dir, stars, tier: h.tier };
      if (e.flat) {
        flat += e.flat;
        th.flat = e.flat;
      }
      if (e.perPriorGate) {
        // beltside-062 D2 (DESIGN §11 P3): LONG HAUL ★2/★3 counts at most priorCap prior HITS (every earlier
        // arrow application, this tile's tier-1 hits included), exactly as Battle.applyHit does
        const counted = e.priorCap !== undefined ? Math.min(prior, e.priorCap) : prior;
        flat += e.perPriorGate * counted;
        th.flat = (th.flat ?? 0) + e.perPriorGate * counted;
        th.prior = counted;
        if (e.priorCap !== undefined && prior > e.priorCap) th.capped = e.priorCap;
      }
      if (e.burn) {
        burn += e.burn;
        th.burn = e.burn;
      }
      if (e.shock) {
        shock = true;
        th.shock = true;
      }
      if (e.siftClean) { flat += e.siftClean; th.flat = (th.flat ?? 0) + e.siftClean; }
      if (e.heat) heat += e.heat;
      if (e.sort) copies *= 1 + (e.sort.copies - 1) / e.sort.every;
      if (e.pulse) {
        speeds.push(1 + (e.pulse.speed - 1) * e.pulse.on / e.pulse.period);
        th.speed = 1 + (e.pulse.speed - 1) * e.pulse.on / e.pulse.period;
        if (e.pulse.flat) { flat += e.pulse.flat; th.flat = (th.flat ?? 0) + e.pulse.flat; }
      }
      if (e.split) {
        copies *= e.split.copies;
        mult *= e.split.mult;
        flat *= e.split.mult;
        th.split = { ...e.split };
      }
      if (e.speed) {
        speeds.push(e.speed);
        th.speed = e.speed;
      }
      prior++;
      row.push(th);
    }
    // beltside-062c (P8): 0.6.1c's per-hit `speed = e.speed` is BELTSIDE's per-tile speedWinner here; slag
    // (`fixed`) keeps its speed, like a METRONOME lock, and no speed hit on its belt is marked as winning
    const won = speedWinner(speeds);
    if (won !== undefined && !locked && fixed === undefined) speed = won;
    for (const th of row) if (th.speed !== undefined) th.won = !locked && fixed === undefined && th.speed === won;
    if (row.length) timeline.push({ tile: i, cell: r.cells[i], hits: row, speed });
    const last = i === n - 1;
    const outLen = last ? (info.connected ? CELL : 0) : CELL / 2;
    const outT = outLen / (BELT_SPEED * speed);
    time += outT;
    ride += outT;
    heatBonus += heat * outT;
  }
  const total = ammo.rideCurve // races: PENDULUM curve, with the turret module's sweet-spot shift
    ? curveDamage(ammo, ride, mult, flat, pendulumShift(b, info.turret))
    : payloadDamage(base, ammo.rideScale, ride, mult, flat + heatBonus); // includes HEAT JACKET's downstream ride
  const walk: RouteWalk = { estimate: { time, ride, dmg: total, copies, burn, shock }, timeline, speedEnd: speed, locked };
  if (fixed !== undefined) walk.fixed = fixed; // beltside-062c (P8)
  return walk;
}

/** The walk's estimate (walkRoute). */
export function estimateRoute(b: Build, index: number, hits = rigHits(b)): RouteEstimate {
  return walkRoute(b, index, hits).estimate;
}

// ---------------------------------------------------------------- editing

/**
 * R1 (0.6.2 BELTSIDE): deck equipment takes free cells, and nothing may stand on a belt tile: a rig goes
 * beside the belt (it needs no belt in reach; with none it is IDLE). A factory being moved may still cover
 * belts of its own routes, which moveItem drops.
 */
export function canPlaceItem(b: Build, defId: string, x: number, y: number, ignoreUid = -1): { ok: boolean; reason?: string } {
  const def = ITEMS[defId];
  if (!def) return { ok: false, reason: "UNKNOWN" };
  if (def.kind !== "gate" && def.kind !== "factory") return { ok: false, reason: "NOT DECK EQUIPMENT" };
  if (x < 0 || y < 0 || x + def.size > GRID || y + def.size > GRID) return { ok: false, reason: "OFF THE DECK" };
  const occ = occupancy(b);
  for (const k of footprint(def, x, y)) {
    const o = occ[k];
    if (o.item >= 0 && o.item !== ignoreUid) return { ok: false, reason: "OCCUPIED" };
    if (o.route >= 0) {
      const r = b.routes[o.route];
      if (!(def.kind === "factory" && r.factory === ignoreUid)) return { ok: false, reason: "BELT IN THE WAY" };
    }
  }
  return { ok: true };
}

/** Place a new item on the deck (caller guarantees canPlaceItem). */
export function placeItem(b: Build, p: Placed): void {
  b.items.push({ ...p });
}

/** Remove an item from the deck. Factories take their routes with them. Returns removed belt tiles. */
export function removeItem(b: Build, uid: number): number {
  const p = itemByUid(b, uid);
  if (!p) return 0;
  b.items = b.items.filter((q) => q.uid !== uid);
  let freed = 0;
  if (defOf(p).kind === "factory") {
    b.routes = b.routes.filter((r) => {
      if (r.factory === uid) {
        freed += r.cells.length;
        return false;
      }
      return true;
    });
  }
  return freed;
}

/** Move an item; factories keep routes whose first cell still attaches. */
export function moveItem(b: Build, uid: number, x: number, y: number): { dropped: number } {
  const p = itemByUid(b, uid);
  if (!p) return { dropped: 0 };
  p.x = x;
  p.y = y;
  let dropped = 0;
  if (defOf(p).kind === "factory") {
    const fp = new Set(footprint(defOf(p), x, y));
    b.routes = b.routes.filter((r) => {
      if (r.factory !== uid) return true;
      const ok = r.cells.length > 0 && adjacentToFactory(b, uid, r.cells[0]) >= 0 && !r.cells.some((k) => fp.has(k));
      if (!ok) dropped++;
      return ok;
    });
  }
  return { dropped };
}

export function removeRoute(b: Build, index: number): void {
  b.routes.splice(index, 1);
}

export function routesOf(b: Build, factoryUid: number): number[] {
  const out: number[] = [];
  b.routes.forEach((r, i) => {
    if (r.factory === factoryUid) out.push(i);
  });
  return out;
}

export interface ExtendCheck {
  ok: boolean;
  reason?: string;
  completes?: boolean; // the new cell is a free connector -> route complete
}

/**
 * Can the pending route (being drawn from factoryUid, replacing route index `replacing`
 * or -1) step into cell k?
 */
export function canExtend(b: Build, factoryUid: number, pending: number[], k: number, replacing: number): ExtendCheck {
  const x = kx(k), y = ky(k);
  if (!inGrid(x, y)) return { ok: false, reason: "OFF THE DECK" };
  if (pending.includes(k)) return { ok: false, reason: "NO LOOPS" };
  if (pending.length === 0) {
    if (adjacentToFactory(b, factoryUid, k) < 0) return { ok: false, reason: "START NEXT TO FACTORY" };
  } else {
    const last = pending[pending.length - 1];
    if (dirBetween(last, k) < 0) return { ok: false, reason: "ORTHOGONAL ONLY" };
    if (isFreeConnectorEnd(b, pending, replacing)) return { ok: false, reason: "ROUTE COMPLETE" };
  }
  const occ = occupancy(b);
  const o = occ[k];
  if (o.item >= 0) return { ok: false, reason: "MACHINE IN THE WAY" }; // B3: every machine blocks a belt (R1)
  if (o.route >= 0 && o.route !== replacing) return { ok: false, reason: "BELTS CAN'T CROSS" };
  const used = beltUsed(b, replacing) + pending.length + 1;
  if (used > b.beltCap) return { ok: false, reason: "OUT OF BELT" };
  const completes = y === 0 && connectorFree(b, x, replacing);
  return { ok: true, completes };
}

export function connectorFree(b: Build, col: number, replacing: number): boolean {
  const h = hero(b);
  if (turretForColumn(h, col) < 0) return false;
  const claims = connectorClaims(b);
  const c = claims.get(col);
  return c === undefined || c === replacing;
}

export function isFreeConnectorEnd(b: Build, pending: number[], replacing: number): boolean {
  if (!pending.length) return false;
  const last = pending[pending.length - 1];
  return ky(last) === 0 && connectorFree(b, kx(last), replacing);
}

/** Commit a drawn route. Returns the new route index. */
export function commitRoute(b: Build, factoryUid: number, cells: number[], replacing: number): number {
  if (replacing >= 0) {
    b.routes[replacing] = { factory: factoryUid, cells: [...cells] };
    return replacing;
  }
  b.routes.push({ factory: factoryUid, cells: [...cells] });
  return b.routes.length - 1;
}

/** Shortest Manhattan fill between two cells (x first, then y), for fast drags. */
export function manhattanSteps(a: number, bk: number): number[] {
  const out: number[] = [];
  let x = kx(a), y = ky(a);
  const tx = kx(bk), ty = ky(bk);
  while (x !== tx) {
    x += Math.sign(tx - x);
    out.push(key(x, y));
  }
  while (y !== ty) {
    y += Math.sign(ty - y);
    out.push(key(x, y));
  }
  return out;
}

export function modsForTurret(b: Build, t: number): ModPlacement[] {
  return b.mods.filter((m) => m.turret === t);
}

/**
 * 0.6.1b: turret t's bought core (a Build.mods entry whose def is kind "core"), or undefined: the turret then
 * runs its hero's signature core (ARSENAL.md §2.1 rule 1). One socket per turret.
 */
export function coreFor(b: Build, t: number): ModPlacement | undefined {
  return b.mods.find((m) => m.turret === t && ITEMS[m.def]?.kind === "core");
}

/** 0.6.1b: turret t's gear, the one piece of turret equipment on its hardpoint (anything in Build.mods but a core). */
export function gearFor(b: Build, t: number): ModPlacement | undefined {
  return b.mods.find((m) => m.turret === t && ITEMS[m.def]?.kind !== "core");
}

/** One equipment hardpoint per turret. 0.6.1b: counts gear only; the core socket is separate (coreFor). */
export function turretHasFreeHardpoint(b: Build, t: number): boolean {
  return !gearFor(b, t);
}

export function connectedRouteCount(b: Build): number {
  const claims = connectorClaims(b);
  return claims.size;
}
