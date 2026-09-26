// Deck construction model: placement, directed routes, validation and route geometry.
// Coordinates are deck-local: x = column (screen left->right for both cruisers),
// y = row with 0 = forward row (the row touching the turrets). Local direction 0 is
// "forward" (toward the enemy); 1 = +x, 2 = back, 3 = -x.

import {
  AMMO, BELT_SPEED, CELL, GEAR_SLOTS, GRID, HEROES, HULL_SLOTS, ITEMS, SHAPE_ARROWS, rigShape,
  type GateEffect, type HeroDef, type HeroId, type ItemDef, type SlotDef, type TurretDef, type TurretIntake,
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
  // 0.6.2j (REQ-BFG-027, J1): a JOINING belt's join tile, the cell key of another belt's tile that this belt feeds
  // into from the side (its last cell is orthogonally next to it). Absent: today's belt, and never written for one.
  // The main belt is the route that holds the tile (joinOf), never a route index.
  join?: number;
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
  // 0.6.2s (REQ-BFG-031 S8): the installed turrets, one per occupied TURRET SLOT, in slot order. Absent means the
  // hero's starting layout (startingTurrets: each starting slot holds its free starting copy, the extra slot is
  // empty); written only when the layout differs from it (setTurretList), so older decks serialize as before.
  turrets?: BuildTurret[];
}

/** 0.6.2s S8: one installed turret (a Build.turrets entry). A cargo copy is an InvItem with the same fields but `slot`. */
export interface BuildTurret {
  slot: number; // the hull slot index (ModPlacement.turret names the same index)
  def: string; // an ITEMS id of kind "turret"
  uid: number;
  stars?: number; // 2 or 3 after a merge; absent = 1 (never written as 1)
  free?: boolean; // S7: true when it contains the hull's starting copy; absent = false (never written as false)
}

/** A turret copy anywhere (a slot's or cargo's): what S7's value and selling read. */
export interface TurretCopy {
  uid: number;
  def: string;
  stars?: number;
  free?: boolean;
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

/**
 * The build's hero. 0.6.2s (REQ-BFG-031 S9, S12): its `turrets` are this build's resolved TURRET SLOTS
 * (turretSlots), one per slot in slot order, an empty slot with no connectors, so turretForColumn,
 * connectorClaims, routeInfo and connectorFree read the installed turrets' intakes without a line of route code
 * changing. For a build with the starting layout, slot i < n is exactly the hero's turret i.
 */
export function hero(b: Build): HeroDef {
  return slotHero(b);
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
    if (r.join !== undefined) return; // 0.6.2j (J2): a joining belt claims no turret connector
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
  length: number; // travel distance in px (factory port -> turret intake or belt end; 0.6.2j: a joining belt's own, to its join tile's side)
  wellFormed: boolean;
  // 0.6.2j (J1, J2): set only on a joining belt whose join is legal. Such a belt claims no connector (connector -1);
  // it is connected exactly when the belt at the end of its chain is, and `turret` is that belt's turret.
  join?: JoinLink;
}

/** A route's connection and its hits. 0.6.2: `_occ` is unused (hits come from rigHits); it stays so the
 *  callers that pass an occupancy keep their signature. Pass `hits` (rigHits(b)) to share one computation. */
export function routeInfo(b: Build, index: number, claims = connectorClaims(b), _occ?: Occ[], hits?: RigHit[][][]): RouteInfo {
  const r = b.routes[index];
  const wf = routeWellFormed(b, r);
  let connected = false, turret = -1, connector = -1;
  const link = r.join === undefined ? undefined : joinOf(b, index); // 0.6.2j (J1, J2)
  if (link) {
    const feed = feedOf(b, index, claims);
    connected = feed.connected;
    turret = feed.turret;
  } else if (wf && r.cells.length) {
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
  const info: RouteInfo = {
    index, connected, turret, connector, tiles: n, gates, gateCells,
    length: link ? CELL * n : routeLength(n, connected), wellFormed: wf, // 0.6.2j: a joining belt ends at its join tile's side
  };
  if (link) info.join = link;
  return info;
}

export function routeLength(n: number, connected: boolean): number {
  if (n <= 0) return 0;
  return connected ? CELL * n + CELL / 2 : CELL * n - CELL / 2;
}

/** Polyline for a route in deck-local pixels. 0.6.2j: a joining belt (`join`, its legal JoinLink) runs on to its join
 *  tile's side (its end, at `length` px) and then to the join tile's centre, where joined payloads are drawn crossing. */
export function routePolyline(b: Build, r: RouteDef, connected: boolean, join?: JoinLink): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  if (!r.cells.length) return pts;
  const c = (k: number) => ({ x: kx(k) * CELL + CELL / 2, y: ky(k) * CELL + CELL / 2 });
  const d0 = adjacentToFactory(b, r.factory, r.cells[0]);
  const first = c(r.cells[0]);
  const dd = d0 >= 0 ? d0 : 0;
  pts.push({ x: first.x - DX[dd] * CELL / 2, y: first.y - DY[dd] * CELL / 2 });
  for (const k of r.cells) pts.push(c(k));
  if (join) {
    const last = c(r.cells[r.cells.length - 1]), jc = c(join.cell);
    pts.push({ x: (last.x + jc.x) / 2, y: (last.y + jc.y) / 2 });
    pts.push(jc);
  } else if (connected) {
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

/** Direction of travel entering and leaving each cell of a route (local dirs). 0.6.2j (J11): a joining belt's last
 *  cell leaves toward its join tile (`join`, its legal JoinLink), so its chevrons run into the main belt's side. */
export function routeDirs(b: Build, r: RouteDef, connected: boolean, join?: JoinLink): { din: number; dout: number }[] {
  const out: { din: number; dout: number }[] = [];
  for (let i = 0; i < r.cells.length; i++) {
    const din = i === 0 ? adjacentToFactory(b, r.factory, r.cells[0]) : dirBetween(r.cells[i - 1], r.cells[i]);
    let dout: number;
    if (i < r.cells.length - 1) dout = dirBetween(r.cells[i], r.cells[i + 1]);
    else dout = join ? join.dir : connected ? 0 : din;
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
  quenched?: number; // 0.6.2 FB-B QUENCH TANK: the Burn stacks this hit spent (its flat above includes their value)
  poison?: number;
  fray?: number;
  staticTime?: number;
  timed?: string;
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
  route?: number; // 0.6.2j (J10): set on a main belt's rows after a join (the tile and cell are that belt's); absent on the walked belt's own
}

/** 0.6.2j (J10): the walk crossed into a main belt: its route, the join tile (index and cell) and the index of the
 *  first timeline row on it (timeline.length when that belt has no hit from the join tile on). */
export interface WalkJoin {
  route: number;
  tile: number;
  cell: number;
  row: number;
}

export interface RouteWalk {
  estimate: RouteEstimate;
  timeline: TimelineRow[];
  speedEnd: number; // the speed state at the turret end
  locked: boolean; // races: METRONOME belts ignore speed states
  // beltside-062c (DESIGN §12 P8): 0.6.1c SLAG's fixed belt speed, which no speed hit changes (absent for other ammo)
  fixed?: number;
  joins?: WalkJoin[]; // 0.6.2j (J10): the joins the walk went through, in order (absent when the belt joins nothing)
}

/**
 * Deterministic single-payload walk (no congestion, rigs online), the one source of the inspector's numbers.
 * 0.6.2: each tile applies its hits in R7 order (rigHits): additive, then LONG HAUL-type (counting every
 * earlier hit, this tile's additive ones included), then SPLITTER-type, then speed, whose winner
 * (speedWinner) holds from this tile downstream. Every hit counts as a prior hit. The timeline records what
 * each hit did, tile by tile (V4).
 * 0.6.2j (J10, J14 (a), J15): a joining belt's walk goes on through its join: its own tiles, then each main belt
 * from the join tile on (journeyOf), where the payload takes every hit, rides that belt's speed state (beltStateAt;
 * slag keeps `fixed`) and ends at the chain's turret. Tile-counting rules (COUNTERWEIGHT) count the journey's tiles.
 * A belt that joins nothing walks exactly as before, and a main belt's own walk doesn't change when belts join it.
 */
export function walkRoute(b: Build, index: number, hits = rigHits(b)): RouteWalk {
  const info = routeInfo(b, index, undefined, undefined, hits);
  const r = b.routes[index];
  const f = itemByUid(b, r.factory);
  // beltside-062 D1: 0.6.1p's star-resolved factory (STAMP PRESS dies set `base`), BELTSIDE's per-tile hits
  const fs = f ? effectAt(f.def, starsOf(f)).factory : undefined; // 0.6.1p: at its stars (STAMP PRESS dies)
  const ammo = fs ? AMMO[f?.def === "mimic" ? HEROES[b.hero].ammo : fs.ammo] : AMMO.plain;
  const base = fs?.base ?? ammo.base;
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
  // walk cell by cell: half cell entering, the hits at the centre, half cell leaving. 0.6.2j (J14 (a)): along the
  // payload's own journey, `i` counting the journey's tiles (= the tile index on a belt that joins nothing)
  const path: { route: number; tile: number }[] = [];
  for (const leg of info.join ? journeyOf(b, index) : [{ route: index, from: 0 }]) {
    for (let t = leg.from; t < b.routes[leg.route].cells.length; t++) path.push({ route: leg.route, tile: t });
  }
  const joins: WalkJoin[] = [];
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const { route: ri, tile } = path[i];
    const cells = b.routes[ri].cells;
    if (i > 0 && path[i - 1].route !== ri) { // 0.6.2j: the join tile of main belt ri
      joins.push({ route: ri, tile, cell: cells[tile], row: timeline.length });
      if (fixed === undefined && !locked) { // J4, J15: from here on the main belt's speed state (slag keeps `fixed`)
        const st = beltStateAt(b, ri, tile, hits);
        speed = st.speed;
        if (st.pulseFlat) flat += st.pulseFlat; // its SURGE pulse, once, as that belt's own walk counts it
      }
    }
    const inHalf = CELL / 2 / (BELT_SPEED * speed);
    time += inHalf;
    ride += inHalf;
    heatBonus += heat * inHalf;
    const speeds: number[] = [];
    const row: TimelineHit[] = [];
    for (const h of hits[ri]?.[tile] ?? []) {
      const stars = starsOf(itemByUid(b, h.uid));
      const e = effectAt(h.def, stars).gate; // 0.6.1a: the same star spec as Battle.makeSide
      if (!e) continue;
      const th: TimelineHit = { uid: h.uid, def: h.def, dir: h.dir, stars, tier: h.tier };
      if (e.flat) {
        flat += e.flat;
        th.flat = e.flat;
      }
      if (locked && e.lockedFlat) {
        flat += e.lockedFlat;
        th.flat = (th.flat ?? 0) + e.lockedFlat;
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
      if (e.poison) th.poison = e.poison;
      if (e.burnPerRide) {
        const amount = Math.min(e.burnPerRide.max, Math.floor(ride / e.burnPerRide.seconds));
        burn += amount;
        th.burn = (th.burn ?? 0) + amount;
      }
      if (e.quench) { // 0.6.2 FB-B: as Battle.applyHit (+ flat; up to `stacks` Burn at perBurn each; the rest stays Burn)
        const spent = Math.min(burn, e.quench.stacks);
        const amount = e.quench.flat + spent * e.quench.perBurn;
        flat += amount;
        th.flat = (th.flat ?? 0) + amount;
        th.quenched = spent;
        burn -= spent;
      }
      if (e.staticTime) th.staticTime = e.staticTime;
      if (e.fray) th.fray = e.fray;
      if (e.perTile) {
        const amount = Math.min(e.perTile.max, i * e.perTile.each);
        flat += amount;
        th.flat = (th.flat ?? 0) + amount;
      }
      if (e.overclockCooldown) th.timed = `X2 EVERY ${e.overclockCooldown}S`;
      if (e.keg) th.timed = `BLAST +${e.keg.flat} AT ${e.keg.fuse}S`;
      if (e.perStalled) th.timed = `+${e.perStalled.each}/STALLED, MAX ${e.perStalled.max}`;
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
        // 0.6.2: a tempo-locked belt ignores the pulse and its per-pulse flat, as Battle.transport does (lockedFlat pays)
        if (e.pulse.flat && !locked) { flat += e.pulse.flat; th.flat = (th.flat ?? 0) + e.pulse.flat; }
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
    if (row.length) timeline.push({ tile, cell: cells[tile], hits: row, speed, ...(ri !== index ? { route: ri } : {}) });
    const last = i === n - 1;
    const outLen = last ? (info.connected ? CELL : 0) : CELL / 2;
    const outT = outLen / (BELT_SPEED * speed);
    time += outT;
    ride += outT;
    heatBonus += heat * outT;
  }
  const total = ammo.rideCurve // races: PENDULUM curve, with the turret module's sweet-spot shift
    ? curveDamage(ammo, ride, mult, flat + heatBonus, pendulumShift(b, info.turret)) // 0.6.2: HEAT JACKET on the curve too
    : payloadDamage(base, ammo.rideScale, ride, mult, flat + heatBonus); // includes HEAT JACKET's downstream ride
  const walk: RouteWalk = { estimate: { time, ride, dmg: total, copies, burn, shock }, timeline, speedEnd: speed, locked };
  if (fixed !== undefined) walk.fixed = fixed; // beltside-062c (P8)
  if (joins.length) walk.joins = joins; // 0.6.2j
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

/** Remove an item from the deck. Factories take their routes with them. Returns removed belt tiles.
 *  0.6.2j (J8): belts that joined a removed belt become open ends (pruneJoins). */
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
    pruneJoins(b);
  }
  return freed;
}

/** Move an item; factories keep routes whose first cell still attaches. 0.6.2j (J8): a belt that joined a belt cut
 *  loose here becomes an open end (pruneJoins); one that joined a belt the move keeps stays joined. */
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
    pruneJoins(b);
  }
  return { dropped };
}

/** 0.6.2j (J8): a belt that joined the removed one becomes an open end (pruneJoins). */
export function removeRoute(b: Build, index: number): void {
  b.routes.splice(index, 1);
  pruneJoins(b);
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

/** Commit a drawn route. Returns the new route index. 0.6.2j (J3, J8): `join`, the join tile of a drawn belt that
 *  ended by joining another (canJoin), is written only when given; a redraw that leaves a join tile clears the joins
 *  into it (pruneJoins), and one that still covers it keeps them while they stay legal. */
export function commitRoute(b: Build, factoryUid: number, cells: number[], replacing: number, join?: number): number {
  const jf = join !== undefined ? { join } : {};
  pruneJoins(b); // a stale join never comes back to life under the new belt (J8)
  if (replacing >= 0) {
    b.routes[replacing] = { factory: factoryUid, cells: [...cells], ...jf };
    pruneJoins(b);
    return replacing;
  }
  b.routes.push({ factory: factoryUid, cells: [...cells], ...jf });
  pruneJoins(b);
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

/** A free GEAR SLOT (hardpoint) on the turret in slot t. 0.6.1b: counts gear only; the core socket is separate
 *  (coreFor). 0.6.2s (S4): a turret has gearSlotsAt(b, t) of them (a 1-star common has 1, as before); an empty
 *  slot has none. */
export function turretHasFreeHardpoint(b: Build, t: number): boolean {
  return gearOn(b, t).length < gearSlotsAt(b, t);
}

export function connectedRouteCount(b: Build): number {
  const claims = connectorClaims(b);
  return claims.size;
}

// ---------------------------------------------------------------- turret slots (0.6.2s, REQ-BFG-031)

/** S8: the uid of the free starting copy in starting slot i is TURRET_UID0 + i (below every run uid, 100+, and
 *  above every stand-in pool uid, at most MAX_ITEMS + MAX_MODS = 80). */
export const TURRET_UID0 = 90;

/** The hull's TURRET SLOTS (S1): its starting turrets' spans, then the one extra slot. */
export function hullSlots(heroId: HeroId): SlotDef[] {
  return HEROES[heroId]?.slots ?? HULL_SLOTS[heroId];
}

/** S1/S8: the starting layout: each starting slot holds its free 1-star starting copy; the extra slot is empty. */
export function startingTurrets(heroId: HeroId): BuildTurret[] {
  const out: BuildTurret[] = [];
  hullSlots(heroId).forEach((s, i) => {
    if (s.start) out.push({ slot: i, def: s.start, uid: TURRET_UID0 + i, free: true });
  });
  return out;
}

/** The installed turrets of a build, in slot order (a copy: Build.turrets, or the starting layout when absent). */
export function turretList(b: Pick<Build, "hero" | "turrets">): BuildTurret[] {
  return (b.turrets ?? startingTurrets(b.hero)).map((t) => ({ ...t }));
}

/** S2: the columns of a slot that take belts: "both" takes both; "inner" the column nearer the deck's centre line
 *  (x 4.5), a tie to the lower column. */
export function slotIntakes(col0: number, width: number, intake: TurretIntake): number[] {
  const cols = Array.from({ length: width }, (_, i) => col0 + i);
  if (intake === "both") return cols;
  const mid = (GRID - 1) / 2;
  let best = cols[0];
  for (const c of cols) if (Math.abs(c - mid) < Math.abs(best - mid)) best = c;
  return [best];
}

/** A turret def's numbers at its stars, installed in `slot`: the TurretDef the battle, the render and the UI read. */
export function turretDefIn(slot: Pick<SlotDef, "col0" | "width">, def: string, stars = 1): TurretDef {
  const t = effectAt(def, stars).turret;
  if (!t) throw new Error(`${def} is not a turret`);
  return {
    col0: slot.col0, width: slot.width, connectors: slotIntakes(slot.col0, slot.width, t.intake),
    kind: t.class, fireInterval: t.fireInterval, window: t.window, flight: t.flight,
  };
}

/** S4: a turret's GEAR SLOTS (hardpoints for mods; the core socket is separate): rarity (common 1, rare 2, epic 3,
 *  legendary 4) plus one per star above 1. 0 for anything that is not a turret. */
export function gearSlotsOf(def: string, stars = 1): number {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d || d.kind !== "turret") return 0;
  return GEAR_SLOTS[d.rarity] + (starsOf({ stars }) - 1);
}

/** One resolved TURRET SLOT (turretSlots): its span, its installed turret (absent: empty), that turret's TurretDef
 *  at its stars, the columns taking belts ([] when empty) and its gear slots (0 when empty). Read-only. */
export interface SlotView {
  slot: number;
  col0: number;
  width: number;
  start?: string; // the hull's starting def for this slot (absent: the extra slot)
  turret?: BuildTurret;
  td?: TurretDef;
  intakes: number[];
  gearSlots: number;
}

function resolveSlots(heroId: HeroId, list: readonly BuildTurret[]): SlotView[] {
  return hullSlots(heroId).map((s, i) => {
    const t = list.find((x) => x.slot === i);
    if (!t) return { slot: i, col0: s.col0, width: s.width, ...(s.start ? { start: s.start } : {}), intakes: [], gearSlots: 0 };
    const td = turretDefIn(s, t.def, starsOf(t));
    return {
      slot: i, col0: s.col0, width: s.width, ...(s.start ? { start: s.start } : {}), turret: { ...t }, td,
      intakes: td.connectors, gearSlots: gearSlotsOf(t.def, starsOf(t)),
    };
  });
}

const startViews = new Map<HeroId, SlotView[]>();

/**
 * THE helper (S9): every slot of the build's hull, in slot order, with its installed turret or empty. Every reader of
 * a build's turrets goes through it (or installedTurrets / hero(b)). Pass { hero } alone for a hull with no build
 * (hero select): the starting layout plus the empty slot. The starting layout's views are cached: don't mutate.
 */
export function turretSlots(b: Pick<Build, "hero" | "turrets">): SlotView[] {
  if (b.turrets) return resolveSlots(b.hero, b.turrets);
  let v = startViews.get(b.hero);
  if (!v) startViews.set(b.hero, (v = resolveSlots(b.hero, startingTurrets(b.hero))));
  return v;
}

/** The occupied slots, in slot order: what fights (Battle.makeSide makes one TurretState per entry). */
export function installedTurrets(b: Pick<Build, "hero" | "turrets">): (SlotView & { turret: BuildTurret; td: TurretDef })[] {
  return turretSlots(b).filter((s): s is SlotView & { turret: BuildTurret; td: TurretDef } => !!s.turret && !!s.td);
}

/** An empty slot as a TurretDef: its span and no connectors (hero(b)'s `turrets`); nothing fights in it. */
function emptyTurretDef(s: SlotView): TurretDef {
  return { col0: s.col0, width: s.width, connectors: [], kind: "light", fireInterval: 0, window: 0, flight: 0, empty: true };
}

const startHeroes = new Map<HeroId, HeroDef>();

/** hero(b): the HeroDef with this build's slots as `turrets` (see hero). */
function slotHero(b: Pick<Build, "hero" | "turrets">): HeroDef {
  const make = () => ({ ...HEROES[b.hero], turrets: turretSlots(b).map((s) => s.td ?? emptyTurretDef(s)) });
  if (b.turrets) return make();
  let h = startHeroes.get(b.hero);
  if (!h) startHeroes.set(b.hero, (h = make()));
  return h;
}

/** S7: a turret copy's value: price x (2^(stars-1) - 1 if it holds the free starting copy). A 1-star starting turret
 *  is worth 0; merged with one bought copy it is worth one price. 0 for anything that is not a turret. */
export function turretValue(c: { def: string; stars?: number; free?: boolean }): number {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, c.def) ? ITEMS[c.def] : undefined;
  if (!d || d.kind !== "turret") return 0;
  return d.price * (2 ** (starsOf(c) - 1) - (c.free ? 1 : 0));
}

/** S7: a 1-star starting turret can't be sold (it can go to cargo and back). */
export function canSellTurret(c: { def: string; stars?: number; free?: boolean }): boolean {
  return !(c.free && starsOf(c) <= 1);
}

/** S5/S7: what selling a turret copy pays: the normal sell value, max(1, floor(value / 2)); 0 when it can't be sold. */
export function turretSellValue(c: { def: string; stars?: number; free?: boolean }): number {
  return canSellTurret(c) ? Math.max(1, Math.floor(turretValue(c) / 2)) : 0;
}

/** Deck cost of the installed turrets (S7): the sum of turretValue (0 for the starting layout). */
export function turretsCost(b: Pick<Build, "hero" | "turrets">): number {
  return b.turrets ? b.turrets.reduce((s, t) => s + turretValue(t), 0) : 0;
}

// ---------------------------------------------------------------- turret operations (0.6.2s S4, S5, S11)
// Pure operations on a Build, for the build screen (run.ts wraps them) and for the harness owner's builders. What
// they take off the build (a displaced turret; cores and gear off an emptied or shrunk slot) they hand back for the
// caller's cargo. Moving never merges (fuse.ts merges only as a copy is gained).

/** A turret def (an ITEMS id of kind "turret"). */
export function isTurretDef(def: string): boolean {
  return (Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined)?.kind === "turret";
}

/** S4: the gear on slot t (every Build.mods entry there but a core) in HARDPOINT ORDER: their order in Build.mods,
 *  which is placement order (new gear is appended). Battle.gearStats folds a turret's gear in exactly this order. */
export function gearOn(b: Pick<Build, "mods">, t: number): ModPlacement[] {
  return b.mods.filter((m) => m.turret === t && ITEMS[m.def]?.kind !== "core");
}

/** S4/S11: the GEAR SLOTS of slot t: its installed turret's (rarity + stars); 0 for an empty or unknown slot. */
export function gearSlotsAt(b: Pick<Build, "hero" | "turrets">, t: number): number {
  return turretSlots(b)[t]?.gearSlots ?? 0;
}

/** S4: may gear `def` go onto slot t? `exceptUid` is a copy already there that is being replaced or moved. */
export function canFitGear(b: Build, t: number, def: string, exceptUid = -1): { ok: boolean; reason?: string } {
  const s = turretSlots(b)[t];
  if (!s) return { ok: false, reason: "NO SUCH TURRET SLOT" };
  if (!s.turret) return { ok: false, reason: "EMPTY TURRET SLOT" };
  const gear = gearOn(b, t).filter((m) => m.uid !== exceptUid);
  if (gear.some((m) => m.def === def)) return { ok: false, reason: "THIS TURRET ALREADY HAS ONE" };
  if (gear.length >= s.gearSlots) return { ok: false, reason: "NO FREE GEAR SLOT" };
  return { ok: true };
}

function normTurret(t: BuildTurret): BuildTurret {
  const s = starsOf(t);
  return { slot: t.slot, def: t.def, uid: t.uid, ...(s > 1 ? { stars: s } : {}), ...(t.free ? { free: true } : {}) };
}

/** S8/S11: set the installed turrets (any order). Stored in slot order; the field is dropped when the list IS the
 *  starting layout (same slots, defs, uids, stars and free flags), so such a build serializes exactly as before. */
export function setTurretList(b: Build, list: readonly BuildTurret[]): void {
  const out = list.map(normTurret).sort((x, y) => x.slot - y.slot);
  const start = startingTurrets(b.hero).map(normTurret);
  const same = out.length === start.length && out.every((t, i) => JSON.stringify(t) === JSON.stringify(start[i]));
  if (same) delete b.turrets;
  else b.turrets = out;
}

/** What a turret operation did and hands back for cargo: turrets (a displaced or removed one) and cores and gear
 *  (off an emptied slot, or beyond a slot's new gear slots), in the order they go back: last placed first. */
export interface TurretOpResult {
  ok: boolean;
  reason?: string;
  turrets: TurretCopy[];
  mods: ModPlacement[]; // their `turret` field names the slot they came off
}

const opFail = (reason: string): TurretOpResult => ({ ok: false, reason, turrets: [], mods: [] });

const copyOfTurret = (t: BuildTurret): TurretCopy => {
  const s = starsOf(t);
  return { uid: t.uid, def: t.def, ...(s > 1 ? { stars: s } : {}), ...(t.free ? { free: true } : {}) };
};

/** An emptied slot holds no core and no gear (S4): take them off, last placed first. */
function stripSlot(b: Build, t: number): ModPlacement[] {
  const out = b.mods.filter((m) => m.turret === t).reverse();
  b.mods = b.mods.filter((m) => m.turret !== t);
  return out;
}

/** S5: gear beyond slot t's gear slots comes off, last placed first (the first gearSlots pieces in hardpoint order stay). */
function trimGear(b: Build, t: number): ModPlacement[] {
  const gear = gearOn(b, t), room = gearSlotsAt(b, t);
  if (gear.length <= room) return [];
  const back = gear.slice(room).reverse();
  const off = new Set(back.map((m) => m.uid));
  b.mods = b.mods.filter((m) => !off.has(m.uid));
  return back;
}

const slotOk = (b: Pick<Build, "hero">, t: number) => Number.isInteger(t) && t >= 0 && t < hullSlots(b.hero).length;

/**
 * S5/S11 INSTALL: put turret copy `c` (from cargo) into slot t. On an occupied slot it is a swap: the old turret
 * comes back for cargo. The slot's core and gear stay and move onto the new turret; gear beyond its gear slots comes
 * back, last placed first. Any turret fits any slot.
 */
export function installTurret(b: Build, c: TurretCopy, t: number): TurretOpResult {
  if (!isTurretDef(c.def)) return opFail("NOT A TURRET");
  if (!slotOk(b, t)) return opFail("NO SUCH TURRET SLOT");
  const list = turretList(b);
  if (list.some((x) => x.uid === c.uid)) return opFail("ALREADY INSTALLED");
  const old = list.find((x) => x.slot === t);
  const next = list.filter((x) => x.slot !== t);
  next.push({ slot: t, def: c.def, uid: c.uid, ...(c.stars ? { stars: c.stars } : {}), ...(c.free ? { free: true } : {}) });
  setTurretList(b, next);
  return { ok: true, turrets: old ? [copyOfTurret(old)] : [], mods: trimGear(b, t) };
}

/**
 * S5/S11 MOVE / SWAP: move the turret in slot `from` to slot `to`; an occupied target swaps the two. Cores and gear
 * stay in their slots and move onto the arriving turret; gear beyond a slot's new gear slots comes back (last placed
 * first), and an emptied slot's core and gear come back.
 */
export function moveTurret(b: Build, from: number, to: number): TurretOpResult {
  if (!slotOk(b, from) || !slotOk(b, to)) return opFail("NO SUCH TURRET SLOT");
  const list = turretList(b);
  const a = list.find((x) => x.slot === from);
  if (!a) return opFail("EMPTY TURRET SLOT");
  if (from === to) return { ok: true, turrets: [], mods: [] };
  const other = list.find((x) => x.slot === to);
  a.slot = to;
  if (other) other.slot = from;
  setTurretList(b, list);
  const mods = other ? [...trimGear(b, from), ...trimGear(b, to)] : [...stripSlot(b, from), ...trimGear(b, to)];
  return { ok: true, turrets: [], mods };
}

/** S5/S11 REMOVE: take the turret out of slot t (to cargo, or to sell it); the emptied slot's core and gear come back. */
export function removeTurret(b: Build, t: number): TurretOpResult {
  const list = turretList(b);
  const a = list.find((x) => x.slot === t);
  if (!a) return opFail("EMPTY TURRET SLOT");
  setTurretList(b, list.filter((x) => x !== a));
  return { ok: true, turrets: [copyOfTurret(a)], mods: stripSlot(b, t) };
}

/** S2/S5: the belts whose last tile sits under slot t's columns but that no intake takes any more (dead ends that
 *  block FIGHT until fixed): route indices, for the build screen's warning. */
export function deadEndsAt(b: Build, t: number): number[] {
  const s = hullSlots(b.hero)[t];
  if (!s) return [];
  const claims = connectorClaims(b);
  const out: number[] = [];
  b.routes.forEach((r, i) => {
    const last = r.cells[r.cells.length - 1];
    if (last === undefined || ky(last) !== 0) return;
    const col = kx(last);
    if (col < s.col0 || col >= s.col0 + s.width) return;
    if (!routeInfo(b, i, claims).connected) out.push(i);
  });
  return out;
}

// ---------------------------------------------------------------- belt joins (0.6.2j, REQ-BFG-027, REQ-BFG-030)
//
// A joining belt (RouteDef.join) ends beside a tile of another belt, the main belt, and feeds into it from the side
// (J1-J2). The main belt is the route that holds the join tile, never a route index (indices shift when a belt is
// removed). Legal: the joining belt's last cell is orthogonally next to the join tile, the tile is a tile of a
// different belt, and following joins onward from the main belt never reaches the joining belt. Chains are fine.
// A joining belt claims no turret connector (connectorClaims); it is connected exactly when the belt at the end of
// its chain is, and feeds that belt's turret (feedOf, through connectorClaims and turretForColumn only: J14 (d)).
// An illegal join leaves an open-ended belt: the sim ignores it, routeCheck and validateBuild report it.

/** 0.6.2j (J1): a joining belt's legal link into its main belt. */
export interface JoinLink {
  route: number; // the main belt: the route that holds the join tile
  tile: number; // the join tile's index along the main belt
  cell: number; // the join tile (RouteDef.join)
  dir: Dir; // from the joining belt's last cell into the join tile
}

/** Player-facing reasons a join is refused (J3, J12). */
export const JOIN_SELF = "CAN'T JOIN ITSELF";
export const JOIN_LOOP = "WOULD LOOP";
export const JOIN_NOT_BELT = "NOT A BELT TILE";
export const JOIN_NOT_NEXT = "NOT NEXT TO ITS JOIN TILE";
export const JOIN_OFF_DECK = "JOIN TILE OFF THE DECK";
export const JOIN_NO_BELT = "NO BELT TO JOIN FROM";

/** The main belt route i's join points at, by shape only (no loop check), or -1. */
function rawJoin(b: Build, i: number, occ: Occ[]): number {
  const r = b.routes[i];
  const j = r?.join;
  if (j === undefined || !Number.isInteger(j) || j < 0 || j >= GRID * GRID || !r.cells.length || r.cells.includes(j)) return -1;
  const m = occ[j].route;
  if (m < 0 || m === i || dirBetween(r.cells[r.cells.length - 1], j) < 0) return -1;
  return m;
}

/**
 * 0.6.2j (J2, J12): why route i's join is illegal, or null when it is legal or absent. The reasons are player text
 * (JOIN_*); validateBuild and routeCheck prefix them with the route. `occ` is occupancy(b).
 */
export function joinProblem(b: Build, i: number, occ = occupancy(b)): string | null {
  const r = b.routes[i];
  const j = r?.join;
  if (j === undefined) return null;
  if (!Number.isInteger(j) || j < 0 || j >= GRID * GRID) return JOIN_OFF_DECK;
  if (!r.cells.length) return JOIN_NO_BELT;
  if (r.cells.includes(j)) return JOIN_SELF;
  const m = occ[j].route;
  if (m < 0) return JOIN_NOT_BELT;
  if (m === i) return JOIN_SELF;
  if (dirBetween(r.cells[r.cells.length - 1], j) < 0) return JOIN_NOT_NEXT;
  // no loops: following joins onward from the main belt must never come back to this belt
  const seen = new Set<number>();
  for (let k = m; k >= 0 && !seen.has(k); k = rawJoin(b, k, occ)) {
    if (k === i) return JOIN_LOOP;
    seen.add(k);
  }
  return null;
}

/** 0.6.2j (J1, J2): route i's legal join, or undefined (none, or an illegal one: the belt is then an open end). */
export function joinOf(b: Build, i: number, occ = occupancy(b)): JoinLink | undefined {
  const r = b.routes[i];
  if (r?.join === undefined || joinProblem(b, i, occ) !== null) return undefined;
  const m = occ[r.join].route;
  return { route: m, tile: b.routes[m].cells.indexOf(r.join), cell: r.join, dir: dirBetween(r.cells[r.cells.length - 1], r.join) as Dir };
}

/**
 * 0.6.2j (J2): where route i's payloads end up: follow legal joins to the chain's end; connected when every belt on
 * the way is well formed and the end claims a turret connector (connectorClaims), whose turret turretForColumn names.
 * For a belt that joins nothing this is routeInfo's own rule. `end` is the chain's last belt.
 */
export function feedOf(b: Build, i: number, claims = connectorClaims(b), occ = occupancy(b)): { connected: boolean; turret: number; end: number } {
  let m = i, wf = true;
  for (let n = 0; n <= b.routes.length; n++) {
    wf = wf && routeWellFormed(b, b.routes[m]);
    const link = b.routes[m].join === undefined ? undefined : joinOf(b, m, occ);
    if (!link) break;
    m = link.route;
  }
  const r = b.routes[m];
  const last = r.cells[r.cells.length - 1];
  if (!wf || last === undefined || ky(last) !== 0 || claims.get(kx(last)) !== m) return { connected: false, turret: -1, end: m };
  return { connected: true, turret: turretForColumn(hero(b), kx(last)), end: m };
}

/** 0.6.2j (J14 (a)): a payload's journey from route i, one leg per belt in travel order: its own belt from tile 0,
 *  then each main belt from its join tile on. [{ route: i, from: 0 }] for a belt that joins nothing. */
export function journeyOf(b: Build, i: number, occ = occupancy(b)): { route: number; from: number }[] {
  const legs = [{ route: i, from: 0 }];
  let m = i;
  for (let n = 0; n < b.routes.length; n++) {
    const link = b.routes[m].join === undefined ? undefined : joinOf(b, m, occ);
    if (!link) break;
    legs.push({ route: link.route, from: link.tile });
    m = link.route;
  }
  return legs;
}

/** 0.6.2j (J2): the belt at the end of route i's chain of legal joins (i itself when it joins nothing). */
export function chainEnd(b: Build, i: number, occ = occupancy(b)): number {
  const legs = journeyOf(b, i, occ);
  return legs[legs.length - 1].route;
}

/** 0.6.2j (J14 (a)): the belt tiles a payload from route i rides to the end of its chain (cells.length when it joins
 *  nothing). */
export function journeyTiles(b: Build, i: number, occ = occupancy(b)): number {
  return journeyOf(b, i, occ).reduce((n, leg) => n + b.routes[leg.route].cells.length - leg.from, 0);
}

/** 0.6.2j (J10): the routes whose legal join lands on route m, in route order. */
export function joinersOf(b: Build, m: number, occ = occupancy(b)): number[] {
  const out: number[] = [];
  b.routes.forEach((r, i) => {
    if (r.join !== undefined && joinOf(b, i, occ)?.route === m) out.push(i);
  });
  return out;
}

/**
 * 0.6.2j (J4, J15): the speed state belt m's tiles before tile j hand on to tile j (walkRoute's per-tile
 * speedWinner, every rig online), and the per-pulse flat of a SURGE pulse that holds there (Battle.pulseAt: the last
 * pulse, cleared by a later speed hit). What a normal payload joining at tile j rides, whatever belt m's own ammo.
 */
export function beltStateAt(b: Build, m: number, j: number, hits = rigHits(b)): { speed: number; pulseFlat: number } {
  let speed = 1, pulseFlat = 0;
  for (let i = 0; i < j; i++) {
    const speeds: number[] = [];
    for (const h of hits[m]?.[i] ?? []) {
      const e = effectAt(h.def, starsOf(itemByUid(b, h.uid))).gate;
      if (!e) continue;
      if (e.speed !== undefined) pulseFlat = 0;
      if (e.pulse) {
        speeds.push(1 + (e.pulse.speed - 1) * e.pulse.on / e.pulse.period);
        pulseFlat = e.pulse.flat;
      }
      if (e.speed) speeds.push(e.speed);
    }
    const won = speedWinner(speeds);
    if (won !== undefined) speed = won;
  }
  return { speed, pulseFlat };
}

export interface JoinCheck {
  ok: boolean;
  reason?: string;
  route?: number; // ok: the main belt
  tile?: number; // ok: the join tile's index along it
}

/**
 * 0.6.2j (J3): can the pending belt (drawn from factoryUid, replacing route `replacing` or -1) end by joining the belt
 * tile k it steps into? canExtend still answers "BELTS CAN'T CROSS" for that step (the builders rely on it); the
 * editor asks this next. Checked on the deck as it would be committed, so a join into the belt being redrawn counts
 * only where the redraw still covers it (J8). The join tile costs no belt (J9).
 */
export function canJoin(b: Build, factoryUid: number, pending: number[], k: number, replacing: number): JoinCheck {
  if (!pending.length) return { ok: false, reason: "BELTS CAN'T CROSS" }; // a belt needs a tile of its own to join from
  if (!inGrid(kx(k), ky(k))) return { ok: false, reason: "OFF THE DECK" };
  if (dirBetween(pending[pending.length - 1], k) < 0) return { ok: false, reason: "ORTHOGONAL ONLY" };
  const occ = occupancy(b);
  if (occ[k].route < 0) return { ok: false, reason: JOIN_NOT_BELT };
  if (occ[k].route === replacing || pending.includes(k)) return { ok: false, reason: JOIN_SELF };
  const drawn: RouteDef = { factory: factoryUid, cells: [...pending], join: k };
  const routes = [...b.routes];
  const idx = replacing >= 0 ? replacing : routes.length;
  routes[idx] = drawn;
  const trial: Build = { ...b, routes };
  const why = joinProblem(trial, idx);
  if (why) return { ok: false, reason: why };
  const link = joinOf(trial, idx)!;
  return { ok: true, route: link.route, tile: link.tile };
}

/** 0.6.2j (J14 (e)): the tiles route i could legally join from its last cell (sorted cell keys; [] for none). */
export function joinTiles(b: Build, i: number): number[] {
  const r = b.routes[i];
  if (!r?.cells.length) return [];
  const last = r.cells[r.cells.length - 1];
  const out: number[] = [];
  for (let d = 0; d < 4; d++) {
    const k = arrowCell(kx(last), ky(last), d as Dir);
    if (k < 0) continue;
    const trial: Build = { ...b, routes: b.routes.map((q, qi) => (qi === i ? { ...q, join: k } : q)) };
    if (joinProblem(trial, i) === null) out.push(k);
  }
  return out.sort((x, y) => x - y);
}

/** 0.6.2j (J14 (e)): make route i join tile k; null when done, else the refusal (joinProblem) and nothing changes. */
export function setJoin(b: Build, i: number, k: number): string | null {
  const r = b.routes[i];
  if (!r) return JOIN_NO_BELT;
  const trial: Build = { ...b, routes: b.routes.map((q, qi) => (qi === i ? { ...q, join: k } : q)) };
  const why = joinProblem(trial, i);
  if (why === null) r.join = k;
  return why;
}

/** 0.6.2j (J8, J14 (e)): route i joins nothing any more: an open end until redrawn. */
export function clearJoin(b: Build, i: number): void {
  if (b.routes[i]) delete b.routes[i].join;
}

/**
 * 0.6.2j (J8): clear every join that is no longer legal (its main belt removed, cut loose by a factory move or redrawn
 * off the join tile). Such a belt becomes an open-ended, unconnected belt and never re-attaches by itself. A deck
 * without joins is untouched. Returns the number cleared.
 */
export function pruneJoins(b: Build): number {
  if (!b.routes.some((r) => r.join !== undefined)) return 0;
  const occ = occupancy(b);
  const bad = b.routes.map((_, i) => joinProblem(b, i, occ) !== null);
  let n = 0;
  b.routes.forEach((r, i) => {
    if (bad[i]) {
      delete r.join;
      n++;
    }
  });
  return n;
}
