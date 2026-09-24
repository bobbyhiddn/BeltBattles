// Deck construction model: placement, directed routes, validation and route geometry.
// Coordinates are deck-local: x = column (screen left->right for both cruisers),
// y = row with 0 = forward row (the row touching the turrets). Local direction 0 is
// "forward" (toward the enemy); 1 = +x, 2 = back, 3 = -x.

import {
  AMMO, BELT_SPEED, CELL, GRID, HEROES, ITEMS,
  type HeroDef, type HeroId, type ItemDef,
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
    const it = occ[k].item;
    if (it >= 0) {
      const p = itemByUid(b, it);
      if (!p || defOf(p).kind !== "gate") return false;
    }
  }
  return true;
}

export interface RouteInfo {
  index: number;
  connected: boolean;
  turret: number; // -1 when not connected
  connector: number; // column or -1
  tiles: number;
  gates: number[]; // gate uids in travel order
  gateCells: number[]; // cell index within the route for each gate
  length: number; // travel distance in px (factory port -> turret intake or belt end)
  wellFormed: boolean;
}

export function routeInfo(b: Build, index: number, claims = connectorClaims(b), occ = occupancy(b)): RouteInfo {
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
  r.cells.forEach((k, i) => {
    const it = occ[k].item;
    if (it >= 0) {
      const p = itemByUid(b, it);
      if (p && defOf(p).kind === "gate") {
        gates.push(it);
        gateCells.push(i);
      }
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

/** Deterministic single-payload walk used by the inspector (no congestion, gates online). */
export function estimateRoute(b: Build, index: number): RouteEstimate {
  const info = routeInfo(b, index);
  const r = b.routes[index];
  const f = itemByUid(b, r.factory);
  const ammo = f ? AMMO[defOf(f).factory!.ammo] : AMMO.plain;
  const gateAt = new Map<number, ItemDef>();
  info.gateCells.forEach((ci, gi) => {
    const p = itemByUid(b, info.gates[gi]);
    if (p) gateAt.set(ci, effectAt(p.def, starsOf(p))); // 0.6.1a: the same star spec as Battle.makeSide
  });
  let time = 0, ride = 0, speed = 1, mult = 1, flat = 0, copies = 1, burn = 0, shock = false, prior = 0;
  // walk cell by cell: half cell entering, gate at the centre, half cell leaving
  const n = r.cells.length;
  for (let i = 0; i < n; i++) {
    const inHalf = CELL / 2 / (BELT_SPEED * speed);
    time += inHalf;
    ride += inHalf;
    const g = gateAt.get(i);
    if (g?.gate) {
      const e = g.gate;
      if (e.flat) flat += e.flat;
      if (e.perPriorGate) flat += e.perPriorGate * prior;
      if (e.burn) burn += e.burn;
      if (e.shock) shock = true;
      if (e.split) {
        copies *= e.split.copies;
        mult *= e.split.mult;
        flat *= e.split.mult;
      }
      if (e.speed && !speedLocked(b.hero)) speed = e.speed; // races: METRONOME belts ignore speed states
      prior++;
    }
    const last = i === n - 1;
    const outLen = last ? (info.connected ? CELL : 0) : CELL / 2;
    const outT = outLen / (BELT_SPEED * speed);
    time += outT;
    ride += outT;
  }
  const total = ammo.rideCurve // races: PENDULUM curve, with the turret module's sweet-spot shift
    ? curveDamage(ammo, ride, mult, flat, pendulumShift(b, info.turret))
    : payloadDamage(ammo.base, ammo.rideScale, ride, mult, flat);
  return { time, ride, dmg: total, copies, burn, shock };
}

// ---------------------------------------------------------------- editing

export function canPlaceItem(b: Build, defId: string, x: number, y: number, ignoreUid = -1): { ok: boolean; reason?: string } {
  const def = ITEMS[defId];
  if (!def) return { ok: false, reason: "UNKNOWN" };
  if (def.kind !== "gate" && def.kind !== "factory") return { ok: false, reason: "NOT DECK EQUIPMENT" };
  if (x < 0 || y < 0 || x + def.size > GRID || y + def.size > GRID) return { ok: false, reason: "OFF THE DECK" };
  const occ = occupancy(b);
  for (const k of footprint(def, x, y)) {
    const o = occ[k];
    if (o.item >= 0 && o.item !== ignoreUid) return { ok: false, reason: "OCCUPIED" };
    if (def.kind === "factory" && o.route >= 0) {
      // a factory may not sit on belts (except belts of its own routes, which get dropped)
      const r = b.routes[o.route];
      if (r.factory !== ignoreUid) return { ok: false, reason: "BELT IN THE WAY" };
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
  if (o.item >= 0) {
    const p = itemByUid(b, o.item);
    if (!p || defOf(p).kind !== "gate") return { ok: false, reason: "BLOCKED" };
  }
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

/** One equipment hardpoint per turret. */
export function turretHasFreeHardpoint(b: Build, t: number): boolean {
  return modsForTurret(b, t).length < 1;
}

export function connectedRouteCount(b: Build): number {
  const claims = connectorClaims(b);
  return claims.size;
}
