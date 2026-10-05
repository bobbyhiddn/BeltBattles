// Deck construction model: placement, directed routes, validation and route geometry.
// Coordinates are deck-local: x = column (screen left->right for both cruisers),
// y = row with 0 = forward row (the row touching the turrets). Local direction 0 is
// "forward" (toward the enemy); 1 = +x, 2 = back, 3 = -x.

import {
  AMMO, BELT_SPEED, CELL, GEAR_SLOTS, GRID, HEROES, HULL_SLOTS, ITEMS, JOIN_LIMIT, JOIN_PACE, SHAPE_ARROWS, TURRET_SPEED, rigShape,
  factorySpeed, levelSpeed, secPer, // NUM-2 (REQ-BFG-047): SPEED
  type GateEffect, type HeroDef, type HeroId, type ItemDef, type SlotDef, type TurretDef, type TurretIntake, type Upgrades,
} from "./content";
import { starRules } from "./content"; // Y2 (release Y): the star switch (LODESTONE's timeline note)
import { curveDamage, pendulumShift, speedLocked } from "./races/metronome"; // races:
import { effectAt, gradeOf, pourAt, starsOf, upgradeLevel } from "./stars";
import { pct, roundHalfUp } from "./pct"; // NUM-1 (REQ-BFG-047): the integer damage pipeline

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
  grow?: number; // RUNES-1 (snapshot v3): GROW-1's counter; refused by both snapshot checks until GROW-1 switches it on
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
  grow?: number; // RUNES-1 (snapshot v3): GROW-1's counter; refused until GROW-1 switches it on
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
  // bb-0.8.3 (REQ-BFG-043 D10): the hero's two gold upgrade levels (content.ts Upgrades: TURRET SPEED and FACTORY, each
  // 2..4 once bought; absent = level 1). Written only once one is bought (run.ts buyUpgrade), after the other keys, so
  // a build without upgrades serializes exactly as before. The levels stay with the run: nothing sells or refunds them.
  upgrades?: Upgrades;
  // RUNES-1 (REQ-BFG-058, snapshot v3): the run's runes in pick order (runes[i] taken at the dawn of day i + 1;
  // src/sim/runes.ts). Written only once one is taken (run.ts takeRune), last, so a rune-less build serializes exactly
  // as before. Both sides' runes act in battle (runes.ts runeMods).
  runes?: { id: string }[];
  gold?: number; // RUNES-1 (snapshot v3): gold held at dusk (R1b-2, R1d); refused until the gold stage switches it on
}

/** 0.6.2s S8: one installed turret (a Build.turrets entry). A cargo copy is an InvItem with the same fields but `slot`. */
export interface BuildTurret {
  slot: number; // the hull slot index (ModPlacement.turret names the same index)
  def: string; // an ITEMS id of kind "turret"
  uid: number;
  stars?: number; // 2 or 3 after a merge; absent = 1 (never written as 1)
  free?: boolean; // S7: true when it contains the hull's starting copy; absent = false (never written as false)
  grow?: number; // RUNES-1 (snapshot v3): GROW-1's counter; refused until GROW-1 switches it on
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
    if (d.gate?.stoke) continue; // 0.8.0 P1 (E3): a STOKER's arrows do nothing to belts; they work factories (stokeHits)
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

/** 0.8.0 P1 (E3, DESIGN-beltside section 8's production rigs): one arrow of a rig pointing into a factory's footprint. */
export interface FactoryHit {
  uid: number; // the rig
  def: string;
  dir: Dir; // the arrow's absolute deck-local direction
  factory: number; // the factory's uid
  cell: number; // the footprint cell the arrow points at
}

/** E3: every rig arrow whose cell lies in a factory's footprint, in deck order (rigs, then their arrows in shape order).
 *  R5 keeps such an arrow idle for every rig but a stoking one (stokeHits). */
export function rigFactoryHits(b: Build): FactoryHit[] {
  const at = new Map<number, number>(); // footprint cell -> factory uid
  for (const p of b.items) {
    const d = ITEMS[p.def];
    if (d?.kind === "factory") for (const k of footprint(d, p.x, p.y)) at.set(k, p.uid);
  }
  const out: FactoryHit[] = [];
  if (!at.size) return out;
  for (const p of b.items) {
    if (ITEMS[p.def]?.kind !== "gate") continue;
    for (const dir of arrowsOf(p)) {
      const k = arrowCell(p.x, p.y, dir);
      const f = k >= 0 ? at.get(k) : undefined;
      if (f !== undefined) out.push({ uid: p.uid, def: p.def, dir, factory: f, cell: k });
    }
  }
  return out;
}

/** E3 (the Prime's guard, VERIFIED-D1 Q6): the factory hits that count, those of a rig whose effect stokes (STOKER). Only
 *  these bring a rig online without a belt hit, and only these take off its IDLE mark. [] on a deck without a stoker. */
export function stokeHits(b: Build): FactoryHit[] {
  if (!b.items.some((p) => ITEMS[p.def]?.gate?.stoke)) return [];
  return rigFactoryHits(b).filter((h) => ITEMS[h.def]?.gate?.stoke);
}

/**
 * 0.8.0 P1 (E6, TWIN GAUGE): route i is MATCHED when another connected route into the same turret has the same journey
 * length in tiles (journeyTiles: a joined belt counts its whole journey). Route lengths never change in a battle, so this
 * is static (Battle.makeSide reads it once). One entry per route.
 */
export function matchedRoutes(b: Build, claims = connectorClaims(b), occ = occupancy(b)): boolean[] {
  const feed = b.routes.map((_, i) => {
    const info = routeInfo(b, i, claims, occ);
    return info.connected && info.turret >= 0 ? { turret: info.turret, tiles: journeyTiles(b, i, occ) } : null;
  });
  return feed.map((f, i) => !!f && feed.some((o, j) => j !== i && !!o && o.turret === f.turret && o.tiles === f.tiles));
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
export function payloadDamage(base: number, rideScale: number, ride: number, mult: number, flat: number, floor = 10): number {
  // NUM-1 (REQ-BFG-047, N1 2.1): whole, rounded half up once when the slug is fired (its HEAT for the seconds ridden, the
  // HEAT it gained on the belt in `flat`, the split share); at least 10 (x10 of 1). Y2: `floor` (shotFloor), 10 but for a
  // LIMPET charge with the star switch on
  return Math.max(floor, roundHalfUp((base + rideScale * ride) * mult + flat));
}

/** Y2 (release Y; DESIGN-Y row 13): the least a slug of `ammo` deals when fired (payloadDamage's floor): 10 (x10 of 1),
 *  but with the star switch on a LIMPET charge's damage is its blast (content.ts STAR_DIFF limpet: base 0, its 20 on
 *  impact joined the blast), so its impact deals only what rigs added to it, from 0. Off, always 10. */
export const shotFloor = (ammo: string): number => (ammo === "limpet" && starRules() ? 0 : 10);

export interface RouteEstimate {
  time: number; // seconds from stamp to chamber for the first payload (all gates online)
  ride: number; // eligible ride time
  dmg: number; // damage per payload (each copy)
  copies: number;
  burn: number;
  shock: boolean;
  flat?: number; // Y4 (release Y): with the star switch on, the payload's bonus damage (rigs, splits, pulses; not HEAT)
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
  // 0.8.0 P1, wave 3 (set only on a wave-3 rig's hit; its flat above holds the damage it adds):
  matched?: boolean; // E6 TWIN GAUGE: its belt is matched (matchedRoutes)
  others?: number; // E5 PINCER: the other rigs hitting its tile that it counts (at most its max)
  plate?: number; // PLATE ROLLER, SHIELD WALL: plating it rolls onto your hull for this payload
  plated?: { min: number; flat: number }; // SHIELD WALL: the damage it adds while your hull holds `min` plating (not in flat)
  breaker?: { flat: number; floor: number }; // PLATE BREAKER: both numbers (flat holds the one the walk counts: platedDeck)
  brace?: { mul: number; plated: number }; // BRACE FRAME: what it does to enemy stalls on this tile (no damage)
  hold?: number; // TWIN LATCH: the seconds it may hold a payload here (when both its arrows hit belts)
}

/**
 * 0.8.0 P1: does the deck plate its hull (E1)? A BASTION (its bulwark slugs), or any wave-3 plating source: a rig or
 * factory whose effect plates (PLATE ROLLER, SHIELD WALL, ARMOR PRESS) or SEAM WELDER gear. The walk counts PLATE
 * BREAKER's big number on such a deck and its floor on any other; the rating reads it for ANVIL and STEAM BREECH.
 */
export function platedDeck(b: Build): boolean {
  if (b.hero === "bastion") return true;
  for (const p of b.items) {
    const d = ITEMS[p.def] ? effectAt(p.def, starsOf(p)) : undefined;
    if (d?.gate?.plate || d?.factory?.plate) return true;
  }
  return b.mods.some((m) => !!(ITEMS[m.def] && effectAt(m.def, starsOf(m)).mod?.seam));
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
/** 0.8.0 B1 M2 (G1's F1): `unplated` walks the belt as a deck that never plates its hull would (every PLATE BREAKER at its
 *  floor), for the build screen's second DMG number. */
export interface WalkOpts { unplated?: boolean }

export function walkRoute(b: Build, index: number, hits = rigHits(b), o: WalkOpts = {}): RouteWalk {
  const info = routeInfo(b, index, undefined, undefined, hits);
  const r = b.routes[index];
  const f = itemByUid(b, r.factory);
  // beltside-062 D1: 0.6.1p's star-resolved factory (STAMP PRESS dies set `base`), BELTSIDE's per-tile hits
  const fs = f ? effectAt(f.def, gradeOf(b, f)).factory : undefined; // 0.6.1p: at its stars (STAMP PRESS dies); bb-0.8.3: grade
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
  // 0.6.2 CAND-A: the SURGE valves whose per-pulse flat this walk has counted. A valve pays a payload once per pulse
  // (Battle.transport's pulseSeen, which the payload carries through a join), so a joined walk doesn't count the main
  // belt's pulse again when the same valve (a two-belt spot: an arrow on this belt and one on the main belt before the
  // join tile) already paid on an earlier leg. A walk with no join is unchanged.
  const pulsed = new Set<number>();
  // 0.8.0 P1 (E6): which belts are matched, read only when a TWIN GAUGE hits one of the walk's tiles; whether the deck
  // plates its hull, read only when a PLATE BREAKER does
  let matched: boolean[] | undefined;
  let plates: boolean | undefined = o.unplated ? false : undefined; // 0.8.0 B1 M2: WalkOpts.unplated
  // Y3 (release Y; DESIGN-Y row 28): with the star switch on a SURGE VALVE pays every slug on its belts once a period
  // (Battle.surgeTick), so the walk counts the seconds the slug spends on each belt (timeOn) and, after it, each valve's
  // flat x those seconds / its period on every belt it hits: the pulses the slug rides through, as an expected count
  // (surgeHits: its timeline hit, which shows that damage). Off, none of this runs.
  const star = starRules();
  const timeOn = new Map<number, number>(), surgeHits = new Map<number, TimelineHit>();
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const { route: ri, tile } = path[i];
    const cells = b.routes[ri].cells;
    if (i > 0 && path[i - 1].route !== ri) { // 0.6.2j: the join tile of main belt ri
      joins.push({ route: ri, tile, cell: cells[tile], row: timeline.length });
      if (fixed === undefined && !locked) { // J4, J15: from here on the main belt's speed state (slag keeps `fixed`)
        const st = beltStateAt(b, ri, tile, hits);
        speed = st.speed;
        // its SURGE pulse, once, as that belt's own walk counts it (not again for a valve already counted)
        if (st.pulseFlat && !pulsed.has(st.pulseUid)) { flat += st.pulseFlat; pulsed.add(st.pulseUid); }
      }
    }
    const inHalf = CELL / 2 / (BELT_SPEED * speed);
    time += inHalf;
    ride += inHalf;
    heatBonus += heat * inHalf;
    if (star) timeOn.set(ri, (timeOn.get(ri) ?? 0) + inHalf); // Y3: the seconds on belt ri (SURGE's pulses)
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
        // Y3 (release Y; DESIGN-Y row 22): as Battle.applyHit, with the star switch on + burn for each whole `per` s, no cap
        const br = e.burnPerRide;
        const amount = starRules() ? br.burn * Math.floor(ride / br.per) : Math.min(br.max ?? Infinity, Math.floor((ride * br.burn) / br.per)); // NUM-3: n per 10 s
        burn += amount;
        th.burn = (th.burn ?? 0) + amount;
      }
      if (e.quench) { // 0.6.2 FB-B: as Battle.applyHit (+ flat; up to `stacks` Burn at perBurn each; the rest stays Burn)
        const spent = Math.min(burn, e.quench.stacks ?? Infinity); // Y3 (DESIGN-Y row 23): no `stacks` with the star switch on
        const amount = e.quench.flat + spent * e.quench.perBurn;
        flat += amount;
        th.flat = (th.flat ?? 0) + amount;
        th.quenched = spent;
        burn -= spent;
      }
      if (e.staticTime) th.staticTime = e.staticTime;
      if (e.fray) th.fray = e.fray;
      if (e.perTile) { // Y5 (release Y; DESIGN-Y row 41): as Battle.applyHit, no cap with the star switch on (its def has no max)
        const amount = Math.min(e.perTile.max ?? Infinity, i * e.perTile.each);
        flat += amount;
        th.flat = (th.flat ?? 0) + amount;
      }
      if (e.overclockCooldown) th.timed = `X2 EVERY ${e.overclockCooldown}S`;
      if (e.keg) th.timed = `BLAST +${e.keg.flat} AT ${e.keg.fuse}S`;
      // Y2 (release Y; DESIGN-Y row 15): with the star switch on LODESTONE has no cap
      if (e.perStalled) th.timed = starRules() ? `+${e.perStalled.each}/STALLED` : `+${e.perStalled.each}/STALLED, MAX ${e.perStalled.max}`;
      if (e.shock) {
        shock = true;
        th.shock = true;
      }
      if (e.siftClean) { flat += e.siftClean; th.flat = (th.flat ?? 0) + e.siftClean; }
      // 0.8.0 P1, wave 3 (as Battle.applyHit; every rig online in the walk):
      if (e.gauge) { // E6: matched when another connected belt into the same turret has as many tiles
        matched ??= matchedRoutes(b);
        const m = !!matched[ri], amount = m ? e.gauge.matched : e.gauge.flat;
        flat += amount;
        th.flat = (th.flat ?? 0) + amount;
        th.matched = m;
      }
      if (e.pincer) { // E5: every other rig's hit on this tile, up to its max (Y3, DESIGN-Y row 20: no max with the star switch on)
        const others = Math.min(e.pincer.max ?? Infinity, (hits[ri]?.[tile] ?? []).filter((o) => o.uid !== h.uid).length);
        const amount = e.pincer.flat + e.pincer.each * others;
        flat += amount;
        th.flat = (th.flat ?? 0) + amount;
        th.others = others;
      }
      if (e.latch) { // TWIN LATCH: its damage (its hold is E4 and costs no ride)
        flat += e.latch.flat;
        th.flat = (th.flat ?? 0) + e.latch.flat;
        th.hold = e.latch.hold;
      }
      if (e.plate) th.plate = e.plate; // PLATE ROLLER, SHIELD WALL: plating, no damage
      if (e.plated) th.plated = { ...e.plated }; // SHIELD WALL: its bonus waits for 12 plating in the battle (not counted)
      if (e.breaker) { // PLATE BREAKER: the big number on a deck that plates its hull, its floor on any other
        plates ??= platedDeck(b);
        const amount = plates ? e.breaker.flat : e.breaker.floor;
        flat += amount;
        th.flat = (th.flat ?? 0) + amount;
        th.breaker = { ...e.breaker };
      }
      if (e.brace) th.brace = { ...e.brace };
      if (e.heat) heat += e.heat;
      if (e.sort) copies *= 1 + (e.sort.copies - 1) / e.sort.every;
      if (e.pulse && star) surgeHits.set(h.uid, th); // Y3 (DESIGN-Y row 28): no speed; its pulses are counted after the walk
      else if (e.pulse) {
        speeds.push(1 + (e.pulse.speed - 1) * e.pulse.on / e.pulse.period);
        th.speed = 1 + (e.pulse.speed - 1) * e.pulse.on / e.pulse.period;
        // 0.6.2: a tempo-locked belt ignores the pulse and its per-pulse flat, as Battle.transport does (lockedFlat pays)
        if (e.pulse.flat && !locked) { flat += e.pulse.flat; th.flat = (th.flat ?? 0) + e.pulse.flat; pulsed.add(h.uid); }
      }
      if (e.split) {
        copies *= e.split.copies;
        mult *= e.split.mult;
        flat = pct(flat, 100 * e.split.mult); // NUM-1: as Battle.applyHit, the flat so far x the split's %, rounded half up once
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
    if (star) timeOn.set(ri, (timeOn.get(ri) ?? 0) + outT);
  }
  // Y3 (DESIGN-Y row 28): with the star switch on, each SURGE VALVE with an arrow on a belt the slug rides (any tile, before
  // or after the slug's own way onto it) pays flat x the seconds it rides there / the period, once for each such belt
  if (star) {
    for (const [ri, secs] of timeOn) {
      const seen = new Set<number>();
      for (const tileHits of hits[ri] ?? []) for (const h of tileHits) {
        const pulse = seen.has(h.uid) ? undefined : effectAt(h.def, starsOf(itemByUid(b, h.uid))).gate?.pulse;
        if (!pulse) continue;
        seen.add(h.uid);
        const amount = (pulse.flat * secs) / pulse.period;
        flat += amount;
        const th = surgeHits.get(h.uid);
        if (th) th.flat = (th.flat ?? 0) + amount;
      }
    }
  }
  const total = ammo.rideCurve // races: PENDULUM curve, with the turret module's sweet-spot shift
    ? curveDamage(ammo, ride, mult, flat + heatBonus, pendulumShift(b, info.turret)) // 0.6.2: HEAT JACKET on the curve too
    : payloadDamage(base, ammo.rideScale, ride, mult, flat + heatBonus, shotFloor(fs?.ammo ?? "plain")); // includes HEAT JACKET's downstream ride (Y2: shotFloor)
  // Y4 (release Y; DESIGN-Y row 40): with the star switch on the estimate also carries the payload's bonus damage, `flat`
  // (what a DRAKE NOZZLE turns into BURN at fire: Battle.fireCore's drakeConvert(p.flat)), for the bots' rating; off, as before
  const walk: RouteWalk = { estimate: { time, ride, dmg: total, copies, burn, shock, ...(star ? { flat } : {}) }, timeline, speedEnd: speed, locked };
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
    kind: t.class, speed: t.speed, window: t.window, flight: t.flight,
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

/**
 * bb-0.8.3 (REQ-BFG-043 D10): TURRET SPEED's fire-interval share at the build's level (content.ts TURRET_SPEED), for the
 * starting turrets only: a turret holding the free starting copy (BuildTurret.free, merged or not). 1 at level 1.
 * NUM-2 (REQ-BFG-047): the build's TURRET SPEED level (1-4); each level adds roundHalfUp(TURRET_SPEED % x the turret's
 * level-1 speed) (content.ts levelSpeed: SCRAP CANNON 30 / 36 / 42 / 48).
 */
export function turretSpeedLevel(b: Pick<Build, "upgrades">): number {
  return upgradeLevel(b, "turret");
}

function resolveSlots(heroId: HeroId, list: readonly BuildTurret[], level = 1): SlotView[] {
  return hullSlots(heroId).map((s, i) => {
    const t = list.find((x) => x.slot === i);
    if (!t) return { slot: i, col0: s.col0, width: s.width, ...(s.start ? { start: s.start } : {}), intakes: [], gearSlots: 0 };
    const td0 = turretDefIn(s, t.def, starsOf(t));
    // bb-0.8.3 (REQ-BFG-043 D10): TURRET SPEED: a starting turret (it holds the free copy) fires at its level's share
    const td = t.free && level > 1 ? { ...td0, speed: levelSpeed(td0.speed, level, TURRET_SPEED) } : td0; // NUM-2: whole steps
    return {
      slot: i, col0: s.col0, width: s.width, ...(s.start ? { start: s.start } : {}), turret: { ...t }, td,
      intakes: td.connectors, gearSlots: gearSlotsOf(t.def, starsOf(t)),
    };
  });
}

const startViews = new Map<string, SlotView[]>();

/**
 * THE helper (S9): every slot of the build's hull, in slot order, with its installed turret or empty. Every reader of
 * a build's turrets goes through it (or installedTurrets / hero(b)). Pass { hero } alone for a hull with no build
 * (hero select): the starting layout plus the empty slot. The starting layout's views are cached: don't mutate.
 * bb-0.8.3 (REQ-BFG-043 D10): a starting turret's TurretDef carries the build's TURRET SPEED (turretSpeedLevel).
 */
export function turretSlots(b: Pick<Build, "hero" | "turrets" | "upgrades">): SlotView[] {
  const level = turretSpeedLevel(b);
  if (b.turrets) return resolveSlots(b.hero, b.turrets, level);
  const k = `${b.hero}:${level}`;
  let v = startViews.get(k);
  if (!v) startViews.set(k, (v = resolveSlots(b.hero, startingTurrets(b.hero), level)));
  return v;
}

/** The occupied slots, in slot order: what fights (Battle.makeSide makes one TurretState per entry). */
export function installedTurrets(b: Pick<Build, "hero" | "turrets" | "upgrades">): (SlotView & { turret: BuildTurret; td: TurretDef })[] {
  return turretSlots(b).filter((s): s is SlotView & { turret: BuildTurret; td: TurretDef } => !!s.turret && !!s.td);
}

/** An empty slot as a TurretDef: its span and no connectors (hero(b)'s `turrets`); nothing fights in it. */
function emptyTurretDef(s: SlotView): TurretDef {
  return { col0: s.col0, width: s.width, connectors: [], kind: "light", speed: 0, window: 0, flight: 0, empty: true };
}

const startHeroes = new Map<string, HeroDef>();

/** hero(b): the HeroDef with this build's slots as `turrets` (see hero). */
function slotHero(b: Pick<Build, "hero" | "turrets" | "upgrades">): HeroDef {
  const make = () => ({ ...HEROES[b.hero], turrets: turretSlots(b).map((s) => s.td ?? emptyTurretDef(s)) });
  if (b.turrets) return make();
  const k = `${b.hero}:${turretSpeedLevel(b)}`;
  let h = startHeroes.get(k);
  if (!h) startHeroes.set(k, (h = make()));
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
/** 0.6.2 TUNE-M, RULE JOIN LIMIT: a joining belt past the deck's JOIN_LIMIT ("2 JOINS PER DECK"). */
export const JOIN_OVER_LIMIT = `${JOIN_LIMIT} JOINS PER DECK`;

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
 * 0.6.2 TUNE-M, RULE JOIN LIMIT: a deck holds at most JOIN_LIMIT joining belts. A belt whose join is otherwise legal
 * (joinShapeProblem: the 0.6.2j rules) is refused, JOIN_OVER_LIMIT, when JOIN_LIMIT belts before it in route order
 * already join legally. So a deck with more keeps its first JOIN_LIMIT joins (the rest are open ends: validateBuild
 * and routeCheck report them, pruneJoins clears them on load), and a deck with at most JOIN_LIMIT reads exactly as
 * before. The battle (routeInfo / joinOf), the rating, the save loader, validateBuild (client and server upload),
 * routeCheck's FIGHT gate and every way to make a join (canJoin, setJoin, joinTiles, the par player) go through it.
 */
export function joinProblem(b: Build, i: number, occ = occupancy(b)): string | null {
  const why = joinShapeProblem(b, i, occ);
  if (why !== null || b.routes[i]?.join === undefined) return why;
  let before = 0;
  for (let k = 0; k < i && before < JOIN_LIMIT; k++) {
    if (b.routes[k].join !== undefined && joinShapeProblem(b, k, occ) === null) before++;
  }
  return before >= JOIN_LIMIT ? JOIN_OVER_LIMIT : null;
}

/**
 * 0.6.2 TUNE-M, RULE JOIN LIMIT: true when a deck holds more than JOIN_LIMIT belts whose join is legal by the 0.6.2j
 * rules, so one of them is past the limit. A new join must not do that, wherever it is drawn: a redraw of an early
 * belt into a join would otherwise push a later belt's join past the limit (canJoin, setJoin, joinTiles and the par
 * player refuse it with JOIN_OVER_LIMIT).
 */
export function overJoinLimit(b: Build, occ = occupancy(b)): boolean {
  let n = 0;
  for (let k = 0; k < b.routes.length; k++) {
    if (b.routes[k].join !== undefined && joinShapeProblem(b, k, occ) === null && ++n > JOIN_LIMIT) return true;
  }
  return false;
}

/** 0.6.2 TUNE-M, RULE JOIN LIMIT: the deck's joining belts, those whose join is legal (joinOf): at most JOIN_LIMIT. */
export function joinCount(b: Build, occ = occupancy(b)): number {
  let n = 0;
  for (let k = 0; k < b.routes.length; k++) if (b.routes[k].join !== undefined && joinProblem(b, k, occ) === null) n++;
  return n;
}

/** 0.6.2j (J2, J12): why route i's join is illegal by its own shape and chain (joinProblem before RULE JOIN LIMIT). */
function joinShapeProblem(b: Build, i: number, occ: Occ[]): string | null {
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

/**
 * 0.6.2 TUNE-M, RULE JOIN PACE: the pace factory `uid` makes its loads at: JOIN_PACE when one of its belts joins another
 * belt (a legal join, joinOf), else 1. A factory counts once, however long its chain (a joining belt whose main belt
 * joins on in turn still paces only its own factory, once). Battle.makeSide runs the factory's timers at this pace;
 * the build screen's belt and factory panels and the par player's rating (deckRating.ts) read it.
 */
export function factoryPace(b: Build, uid: number, occ = occupancy(b)): number {
  for (let i = 0; i < b.routes.length; i++) {
    if (b.routes[i].factory === uid && b.routes[i].join !== undefined && joinOf(b, i, occ)) return JOIN_PACE;
  }
  return 1;
}

/**
 * 0.6.2 TUNE-M, RULE JOIN PACE: the build screen's load estimate for belt `index`: seconds between the loads its factory
 * stamps onto it while nothing backs up. The factory's cycle (MIMIC FORGE: the hero factory's x its intervalMul) over its
 * batch, shared by turns among its belts (a CRUCIBLE pours onto each at once), at its pace (factoryPace). Infinity for a
 * belt with no factory. A trigger factory (SCRAPPER) reads its idle cycle.
 * bb-0.8.3 (REQ-BFG-042 D4): a pour (stars.ts pourAt: TWIN MOULD, the CRUCIBLE, a ★3 MIMIC on FOUNDRY) loads each of its
 * belts every cycle while it feeds no more belts than its pour size, and pour / belts of the cycles past that (rule R);
 * any other factory feeds its belts in turn. (0.8.0 read a TWIN MOULD's belts as fed in turn: twice its cycle.)
 */
export function loadEvery(b: Build, index: number, occ = occupancy(b)): number {
  const r = b.routes[index];
  const f = r ? itemByUid(b, r.factory) : undefined;
  const spec = f && ITEMS[f.def]?.kind === "factory" ? effectAt(f.def, gradeOf(b, f)).factory : undefined;
  if (!r || !f || !spec) return Infinity;
  const interval = secPer(factorySpeed(f.def, spec, b.hero)); // NUM-2: 30 / its whole speed (MIMIC: the hero factory's x its rate %)
  const belts = b.routes.filter((q) => q.factory === r.factory).length, pour = pourAt(f.def, gradeOf(b, f), HEROES[b.hero].ammo);
  const shared = pour ? Math.max(1, belts / pour) : belts;
  return (interval * shared) / ((spec.batch ?? 1) * factoryPace(b, r.factory, occ));
}

/**
 * bb-0.8.3 (REQ-BFG-042 D4): seconds between the casts of the factory feeding belt `index` (its cycle at its pace, MIMIC
 * FORGE's at the hero factory's x its intervalMul), whatever share of them reach this belt; Infinity for a belt with no
 * factory. A CRUCIBLE belt's blank meets another belt's from the same pour, or a whole number of pours later
 * (syncEstimate.ts); 0.8.0 read that off loadEvery, which equals it while the CRUCIBLE feeds no more than its pour size.
 */
export function cycleEvery(b: Build, index: number, occ = occupancy(b)): number {
  const r = b.routes[index];
  const f = r ? itemByUid(b, r.factory) : undefined;
  const spec = f && ITEMS[f.def]?.kind === "factory" ? effectAt(f.def, gradeOf(b, f)).factory : undefined;
  if (!r || !f || !spec) return Infinity;
  const interval = secPer(factorySpeed(f.def, spec, b.hero)); // NUM-2: 30 / its whole speed
  return interval / factoryPace(b, r.factory, occ);
}

/** 0.6.2 TUNE-M, RULE JOIN PACE: the player's words for a joined factory's pace ("JOINED: THIS FACTORY RUNS AT 60%
 *  PACE."), one source for the factory and belt panels, the join toast and the rules text. */
export const JOIN_PACE_PCT = Math.round(JOIN_PACE * 100);
export const JOIN_PACE_LINE = `JOINED: THIS FACTORY RUNS AT ${JOIN_PACE_PCT}% PACE.`;

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
export function beltStateAt(b: Build, m: number, j: number, hits = rigHits(b)): { speed: number; pulseFlat: number; pulseUid: number } {
  let speed = 1, pulseFlat = 0, pulseUid = -1; // 0.6.2 CAND-A: pulseUid, the valve whose pulse holds there (-1: none)
  for (let i = 0; i < j; i++) {
    const speeds: number[] = [];
    for (const h of hits[m]?.[i] ?? []) {
      const e = effectAt(h.def, starsOf(itemByUid(b, h.uid))).gate;
      if (!e) continue;
      if (e.speed !== undefined) { pulseFlat = 0; pulseUid = -1; }
      // Y3 (release Y; DESIGN-Y row 28): with the star switch on a SURGE pulse sets no speed and holds no per-ride flat (the
      // walk counts its pulses by the seconds on its belts)
      if (e.pulse && !starRules()) {
        speeds.push(1 + (e.pulse.speed - 1) * e.pulse.on / e.pulse.period);
        pulseFlat = e.pulse.flat;
        pulseUid = h.uid;
      }
      if (e.speed) speeds.push(e.speed);
    }
    const won = speedWinner(speeds);
    if (won !== undefined) speed = won;
  }
  return { speed, pulseFlat, pulseUid };
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
  const why = newJoinProblem(trial, idx);
  if (why) return { ok: false, reason: why };
  const link = joinOf(trial, idx)!;
  return { ok: true, route: link.route, tile: link.tile };
}

/**
 * Why a NEW join, route i's in `trial` (the deck as it would be with the join), is refused, or null: joinProblem, and
 * 0.6.2 TUNE-M's RULE JOIN LIMIT across the deck (overJoinLimit), so a redraw of an early belt into a join never
 * pushes a later belt's join past the limit. canJoin, joinTiles, setJoin and the par player (player.ts) ask this.
 */
export function newJoinProblem(trial: Build, i: number, occ = occupancy(trial)): string | null {
  return joinProblem(trial, i, occ) ?? (overJoinLimit(trial, occ) ? JOIN_OVER_LIMIT : null);
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
    if (newJoinProblem(trial, i) === null) out.push(k);
  }
  return out.sort((x, y) => x - y);
}

/** 0.6.2j (J14 (e)): make route i join tile k; null when done, else the refusal (newJoinProblem) and nothing changes. */
export function setJoin(b: Build, i: number, k: number): string | null {
  const r = b.routes[i];
  if (!r) return JOIN_NO_BELT;
  const trial: Build = { ...b, routes: b.routes.map((q, qi) => (qi === i ? { ...q, join: k } : q)) };
  const why = newJoinProblem(trial, i);
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
