// 0.6.2 BELTSIDE (ref/DESIGN-beltside.md): gates became RIGS. A rig stands on its own deck cell beside
// the belt, and each of its arrows (1-4, by rarity) acts on the belt tile it points at. This file holds
// the D3 migration of pre-BELTSIDE decks, whose gates stood ON belt tiles, and the placement helpers the
// build screen, the presets and the harness share: which cells a rig can take beside a belt, the hits a
// rig would make there, and the rotation that lands the most arrows.
// Imports only ./content and ./deck, so the stand-in pool loader can use it and stay portable.

import { GRID, ITEMS, SHAPE_ARROWS, rigShape } from "./content";
import {
  adjacentToFactory, arrowCell, dirBetween, footprint, hero, inGrid, key, kx, ky, occupancy, opposite, rigArrows,
  rotField, turretForColumn, type Build, type Dir, type Placed,
} from "./deck";

// ---------------------------------------------------------------- the D3 migration

/** A gate moved off a belt tile by migrateInlineGates. */
export interface MovedRig {
  uid: number;
  def: string;
  from: number; // the belt tile it stood on (cell key)
  to: number; // its new cell (cell key)
  rot: number; // its rotation: the first arrow faces `from`
}

/** What migrateInlineGates did to one deck. */
export interface Migration {
  moved: MovedRig[];
  stranded: Placed[]; // gates with no free neighbour, removed from the deck (the caller cargoes, refunds or drops them)
}

/** Travel direction of route `ri` entering tile `ti` (deck-local), or -1 when unknown. */
function travelDir(b: Build, ri: number, ti: number): number {
  const r = b.routes[ri];
  return ti === 0 ? adjacentToFactory(b, r.factory, r.cells[0]) : dirBetween(r.cells[ti - 1], r.cells[ti]);
}

/**
 * D3's neighbour order around belt tile `ti` of route `ri`: left of travel, right of travel, then the
 * other two directions by index (0 forward, 1 = +x, 2 back, 3 = -x). Travel is the direction the belt
 * enters the tile (at a corner, the incoming leg). With no known travel direction: 0, 1, 2, 3.
 */
export function neighbourOrder(b: Build, ri: number, ti: number): Dir[] {
  const t = travelDir(b, ri, ti);
  if (t < 0) return [0, 1, 2, 3];
  const left = ((t + 3) % 4) as Dir, right = ((t + 1) % 4) as Dir;
  return [left, right, ...([0, 1, 2, 3] as Dir[]).filter((d) => d !== left && d !== right)];
}

/** The rotation that points a rig's FIRST arrow in absolute direction `dir` (0 for an X rig). */
export function rotFacing(def: string, dir: Dir): number {
  const shape = rigShape(def);
  if (!shape || shape === "X") return 0;
  return (dir - SHAPE_ARROWS[shape][0] + 4) % 4;
}

/**
 * D3: every gate standing on a belt tile moves to a free orthogonal neighbour of that tile (not a belt
 * tile, not occupied, on the deck), preferring left of travel, then right of travel, then any other by
 * direction index; its `rot` points its first arrow back at the old tile. Gates are taken in deck order,
 * so a gate moved earlier can take a cell a later one wanted: the result is deterministic. A gate with no
 * free neighbour is removed and returned in `stranded`. Mutates `b` and returns what it did; a deck with
 * no gate on a belt is left exactly as it is (the migration is idempotent). Multi-arrow rigs may now also
 * hit a neighbouring belt; D3 accepts that, since every deck gets the same treatment.
 */
export function migrateInlineGates(b: Build): Migration {
  const out: Migration = { moved: [], stranded: [] };
  const where = new Map<number, [number, number]>(); // belt cell -> [route, tile]
  b.routes.forEach((r, ri) => r.cells.forEach((k, ti) => { if (!where.has(k)) where.set(k, [ri, ti]); }));
  const inline = b.items.filter((p) => ITEMS[p.def]?.kind === "gate" && where.has(key(p.x, p.y)));
  if (!inline.length) return out;
  const moving = new Set(inline.map((p) => p.uid));
  const taken = new Set<number>(); // cells held by machinery that stays (updated as gates move)
  for (const p of b.items) {
    const d = ITEMS[p.def];
    if (!d || moving.has(p.uid)) continue;
    for (const k of footprint(d, p.x, p.y)) taken.add(k);
  }
  const strandedUids = new Set<number>();
  for (const p of inline) {
    const from = key(p.x, p.y);
    const [ri, ti] = where.get(from)!;
    let placed = false;
    for (const d of neighbourOrder(b, ri, ti)) {
      const k = arrowCell(p.x, p.y, d);
      if (k < 0 || where.has(k) || taken.has(k)) continue;
      const rot = rotFacing(p.def, opposite(d));
      p.x = kx(k);
      p.y = ky(k);
      const f = rotField(p.def, rot);
      if (f.rot === undefined) delete p.rot;
      else p.rot = f.rot;
      taken.add(k);
      out.moved.push({ uid: p.uid, def: p.def, from, to: k, rot: f.rot ?? 0 });
      placed = true;
      break;
    }
    if (!placed) {
      strandedUids.add(p.uid);
      out.stranded.push({ ...p });
    }
  }
  if (strandedUids.size) b.items = b.items.filter((p) => !strandedUids.has(p.uid));
  return out;
}

// ---------------------------------------------------------------- the migration log

/** One load boundary's migration: where, and what it did (counts are summed over calls). */
export interface MigrationStat {
  source: string; // e.g. "save", "ghost", "standin", "preset:rival", "preset:hero", "preset:race", "preset:ai"
  decks: number; // decks that needed the migration
  moved: number;
  cargoed: number; // player saves: stranded rigs put in cargo
  refunded: number; // player saves: stranded rigs refunded (cargo full)
  dropped: number; // ghosts and presets: stranded rigs dropped
}

const STATS = new Map<string, MigrationStat>();
const DROPS: string[] = [];
const DROP_LOG_MAX = 200;

/** Add one deck's migration to the log of `source`. */
export function logMigration(source: string, m: Migration, extra: { cargoed?: number; refunded?: number; dropped?: number } = {}): void {
  if (!m.moved.length && !m.stranded.length) return;
  const s = STATS.get(source) ?? { source, decks: 0, moved: 0, cargoed: 0, refunded: 0, dropped: 0 };
  s.decks++;
  s.moved += m.moved.length;
  s.cargoed += extra.cargoed ?? 0;
  s.refunded += extra.refunded ?? 0;
  s.dropped += extra.dropped ?? 0;
  STATS.set(source, s);
  if (extra.dropped) {
    for (const p of m.stranded) {
      if (DROPS.length >= DROP_LOG_MAX) break;
      DROPS.push(`${source}: dropped ${ITEMS[p.def]?.name ?? p.def} uid ${p.uid} from (${p.x},${p.y}): no free cell beside its belt tile`);
    }
  }
}

/** The migration log so far: per-source counts and the dropped rigs (tooling and tests read it). */
export function migrationLog(): { stats: MigrationStat[]; drops: string[] } {
  return { stats: [...STATS.values()].map((s) => ({ ...s })), drops: [...DROPS] };
}

export function clearMigrationLog(): void {
  STATS.clear();
  DROPS.length = 0;
}

/**
 * Migrate a ghost, stand-in or preset deck at its load boundary (D3): stranded rigs are dropped and the
 * drop is logged under `source`. Returns the same (mutated) deck, so builders can `return migrated(b, s)`.
 */
export function migrateDeck<T extends Build>(b: T, source: string): T {
  const m = migrateInlineGates(b);
  logMigration(source, m, { dropped: m.stranded.length });
  return b;
}

// ---------------------------------------------------------------- placement helpers

/** A hit a rig would make if it stood somewhere: the arrow direction and the belt tile it lands on. */
export interface WouldHit {
  dir: Dir;
  cell: number;
  route: number;
  tile: number;
}

/** Belt cell -> [route, tile] for routes accepted by `only` (default: every route). */
export function beltIndex(b: Build, only?: (ri: number) => boolean): Map<number, [number, number]> {
  const m = new Map<number, [number, number]>();
  b.routes.forEach((r, ri) => {
    if (only && !only(ri)) return;
    r.cells.forEach((k, ti) => m.set(k, [ri, ti]));
  });
  return m;
}

/** The hits a rig of `def` at rotation `rot` would make standing on (x, y) (R5), against `belts`. */
export function hitsIfPlaced(b: Build, def: string, x: number, y: number, rot: number, belts = beltIndex(b)): WouldHit[] {
  const out: WouldHit[] = [];
  if (!inGrid(x, y) || belts.has(key(x, y))) return out;
  for (const dir of rigArrows(def, rot)) {
    const k = arrowCell(x, y, dir);
    const w = k >= 0 ? belts.get(k) : undefined;
    if (w) out.push({ dir, cell: k, route: w[0], tile: w[1] });
  }
  return out;
}

/** Rotations worth trying for `def`: [0] for an X rig (it ignores rotation), else 0-3. */
export function rotations(def: string): number[] {
  return rigShape(def) === "X" ? [0] : [0, 1, 2, 3];
}

/**
 * The rotation of a rig of `def` at (x, y) that lands the most arrows on belts (H2, greedy). Ties keep
 * `prefer` when it is among the best, else the lowest rotation. Returns the rotation and its hit count.
 */
export function bestRot(b: Build, def: string, x: number, y: number, prefer = 0, belts = beltIndex(b)): { rot: number; hits: number } {
  const rots = rotations(def);
  const order = rots.includes(prefer) ? [prefer, ...rots.filter((r) => r !== prefer)] : rots;
  let best = { rot: order[0], hits: -1 };
  for (const rot of order) {
    const n = hitsIfPlaced(b, def, x, y, rot, belts).length;
    if (n > best.hits) best = { rot, hits: n };
  }
  return best;
}

/** Is cell k free for a rig: on the deck, no machinery, no belt? */
export function freeForRig(b: Build, k: number, occ = occupancy(b)): boolean {
  return k >= 0 && k < GRID * GRID && occ[k].item < 0 && occ[k].route < 0;
}

/** Is cell k a turret intake: a forward-row cell in a connector column? Legal for a rig (R1), but a rig
 *  there shuts that intake to belts, so suggestions and the harness never pick one. */
export function intakeCell(b: Build, k: number): boolean {
  return ky(k) === 0 && turretForColumn(hero(b), kx(k)) >= 0;
}

/** One way to place a rig: its cell, rotation and the hits it makes. */
export interface RigSpot {
  x: number;
  y: number;
  rot: number;
  hits: WouldHit[];
}

/**
 * H2 (greedy): where a rig of `def` should go to work belt tile `ti` of route `ri`. The candidates are the
 * tile's free orthogonal neighbours in D3 order, turret intakes left clear (intakeCell); each takes the
 * rotation with the most hits on belts
 * accepted by `only` (default: every route), counting only rotations whose arrows reach the tile. The most
 * hits wins, ties go to the first candidate in D3 order, and within a candidate to the rotation that faces
 * the tile with its first arrow. `accept`, when given, rules out placements by the hits they would make
 * (the harness keeps order and twin sync with it). null when no neighbour is free (or none is accepted).
 */
export function spotForTile(
  b: Build, def: string, ri: number, ti: number, only?: (ri: number) => boolean, occ = occupancy(b),
  accept?: (hits: WouldHit[]) => boolean,
): RigSpot | null {
  const r = b.routes[ri];
  const k0 = r?.cells[ti];
  if (k0 === undefined) return null;
  const belts = beltIndex(b, only);
  let best: RigSpot | null = null;
  for (const d of neighbourOrder(b, ri, ti)) {
    const k = arrowCell(kx(k0), ky(k0), d);
    if (k < 0 || !freeForRig(b, k, occ) || intakeCell(b, k)) continue;
    const face = rotFacing(def, opposite(d));
    for (const rot of [face, ...rotations(def).filter((q) => q !== face)]) {
      const hits = hitsIfPlaced(b, def, kx(k), ky(k), rot, belts);
      if (!hits.some((h) => h.cell === k0)) continue;
      if (accept && !accept(hits)) continue;
      if (!best || hits.length > best.hits.length) best = { x: kx(k), y: ky(k), rot, hits };
    }
  }
  return best;
}

/**
 * H2 (greedy) over the whole deck: the free cell beside a belt and the rotation with the most hits on
 * belts accepted by `only`. Candidates run route by route, tile by tile, each tile's neighbours in D3
 * order; ties go to the first. null when no free cell touches such a belt.
 */
export function bestSpot(b: Build, def: string, only?: (ri: number) => boolean): RigSpot | null {
  const occ = occupancy(b);
  let best: RigSpot | null = null;
  b.routes.forEach((r, ri) => {
    if (only && !only(ri)) return;
    r.cells.forEach((_, ti) => {
      const s = spotForTile(b, def, ri, ti, only, occ);
      if (s && (!best || s.hits.length > best.hits.length)) best = s;
    });
  });
  return best;
}

/** Place a rig at a spot (the caller checked it is free): the item with its rot field. */
export function placeRigAt(b: Build, uid: number, def: string, s: { x: number; y: number; rot: number }, stars?: number): Placed {
  const p: Placed = { uid, def, x: s.x, y: s.y, ...(stars && stars > 1 ? { stars } : {}), ...rotField(def, s.rot) };
  b.items.push(p);
  return p;
}
