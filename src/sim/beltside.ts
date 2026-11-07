// 0.6.2 BELTSIDE (ref/DESIGN-beltside.md): gates became RIGS. A rig stands on its own deck cell beside
// the belt, and each of its arrows (1-4, by rarity) acts on the belt tile it points at. This file holds
// the D3 migration of pre-BELTSIDE decks, whose gates stood ON belt tiles, and the placement helpers the
// build screen, the presets and the harness share: which cells a rig can take beside a belt, the hits a
// rig would make there, and the rotation that lands the most arrows.
// Imports only ./content and ./deck, so the stand-in pool loader can use it and stay portable.

import { GRID, ITEMS, SHAPE_ARROWS, rigShape } from "./content";
import {
  adjacentToFactory, arrowCell, dirBetween, hero, inGrid, key, kx, ky, occupancy, opposite, rigArrows,
  rotField, turretForColumn, type Build, type Dir, type Placed,
} from "./deck";
import { cellsOf, pruneJoins, rigArrowCells, rotOf } from "./deck"; // SHAPES-1 (REQ-BFG-086 R1-R2, S6): cells; per-cell arrows
import { gatesRules, isConverterItem } from "./deck"; // GATES-1 (REQ-BFG-052): beltIndex leaves a converter's tile out (deck.ts re-exports both)
// SHAPES-1: the footprint engine (foot.ts) and the switch (shapes.ts), through deck.ts: this file imports only ./content
// and ./deck (the stand-in loader's portability, tests/standInPool.gen.test.ts)
import { RESHAPED_IDS, footOf, footOnDeck, footprintCells, footTurns, shapesRules } from "./deck";

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
 * BUMP-1D (cap's ruling R2.3 Q2): "on a belt tile" is a matter of the gate's FOOTPRINT (cellsOf), not of its anchor. A
 * 1-cell gate's footprint is its anchor cell, so everything above holds for it to the letter. A shaped rig (more than
 * one cell) has its anchor at the corner of its turned footprint's bounding box, which for an L or T foot at some rots
 * is a cell it does not occupy: it is inline only when a cell of its turned footprint is a belt tile (a corner on a
 * belt alone leaves it where it is), and it moves whole (moveShaped): off the first such tile, the neighbours of that
 * tile in the same order, each with the rot that points its first arrow back at the tile, to the first anchor whose
 * WHOLE footprint is on the deck, off every belt tile, off the machinery that stays or has moved and off the turret
 * intake cells; with none, it is stranded. For a shaped rig `to` is its new anchor.
 */
export function migrateInlineGates(b: Build): Migration {
  const out: Migration = { moved: [], stranded: [] };
  const where = new Map<number, [number, number]>(); // belt cell -> [route, tile]
  b.routes.forEach((r, ri) => r.cells.forEach((k, ti) => { if (!where.has(k)) where.set(k, [ri, ti]); }));
  const inline = b.items.filter((p) => ITEMS[p.def]?.kind === "gate" && cellsOf(p).some((k) => where.has(k))); // BUMP-1D: the footprint (was the anchor cell, key(p.x, p.y), the same for a 1-cell gate)
  if (!inline.length) return out;
  const moving = new Set(inline.map((p) => p.uid));
  const taken = new Set<number>(); // cells held by machinery that stays (updated as gates move)
  for (const p of b.items) {
    const d = ITEMS[p.def];
    if (!d || moving.has(p.uid)) continue;
    for (const k of cellsOf(p)) taken.add(k); // SHAPES-1: the turned footprint
  }
  const strandedUids = new Set<number>();
  for (const p of inline) {
    if (footOf(ITEMS[p.def]) !== "1") { // BUMP-1D: a shaped rig moves whole (moveShaped); a 1-cell gate below, as it always did
      const mv = moveShaped(b, p, where, taken);
      if (mv) out.moved.push(mv);
      else {
        strandedUids.add(p.uid);
        out.stranded.push({ ...p });
      }
      continue;
    }
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

/**
 * BUMP-1D (R2.3 Q2): D3 for one inline shaped rig `p` (migrateInlineGates; `where` maps each belt cell, `taken` holds the cells
 * of the machinery that stays or has moved). The tile it leaves is its first footprint cell on a belt. For each neighbour of
 * that tile in D3's order that is on the deck and neither a belt tile nor taken, the rig turns so its first arrow points back
 * at the tile (rotFacing; rotField stores it) and its turned footprint's cells are tried in turn, row by row, as the one that
 * lands on the neighbour: the first anchor whose whole footprint is on the deck, off every belt tile, off `taken` and off the
 * turret intake cells (a shaped piece may not cover one) is the new place, and the arrow from the neighbour then works the
 * tile. Moves `p` (x, y, rot) and takes its new footprint into `taken`; null, with `p` untouched, when no neighbour fits it.
 */
function moveShaped(b: Build, p: Placed, where: ReadonlyMap<number, [number, number]>, taken: Set<number>): MovedRig | null {
  const d = ITEMS[p.def];
  const from = cellsOf(p).find((k) => where.has(k))!;
  const [ri, ti] = where.get(from)!;
  for (const dir of neighbourOrder(b, ri, ti)) {
    const n = arrowCell(kx(from), ky(from), dir);
    if (n < 0 || where.has(n) || taken.has(n)) continue;
    const f = rotField(p.def, rotFacing(p.def, opposite(dir)));
    const rot = f.rot ?? 0;
    for (const o of footprintCells(d, 0, 0, rot)) { // the turned footprint's cells as offsets from its anchor
      const x = kx(n) - kx(o), y = ky(n) - ky(o);
      if (!footOnDeck(d, x, y, rot)) continue;
      const cells = footprintCells(d, x, y, rot);
      if (cells.some((c) => where.has(c) || taken.has(c) || intakeCell(b, c))) continue;
      p.x = x;
      p.y = y;
      if (f.rot === undefined) delete p.rot;
      else p.rot = f.rot;
      for (const c of cells) taken.add(c);
      return { uid: p.uid, def: p.def, from, to: key(x, y), rot };
    }
  }
  return null;
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
 * SHAPES-1 (REQ-BFG-086 S6): with SHAPES on, its GANTRY PRESS and ASSEMBLY LINE take their new shapes too
 * (migrateShapedFactories; one that fits nowhere is dropped with its belts, logged under `source`:shapes). Off: as before.
 */
export function migrateDeck<T extends Build>(b: T, source: string): T {
  const m = migrateInlineGates(b);
  logMigration(source, m, { dropped: m.stranded.length });
  if (shapesRules()) logShapes(`${source}:shapes`, migrateShapedFactories(b));
  return b;
}

// ---------------------------------------------------------------- SHAPES-1 (S6): the load migration

/** SHAPES-1 (S6): what migrateShapedFactories did to one reshaped factory. */
export interface ReshapedMove {
  uid: number;
  def: string;
  from: { x: number; y: number; rot: number };
  to: { x: number; y: number; rot: number } | null; // null: it fits nowhere and left the deck with its belts (the caller cargoes it)
  kept: number; // its belts kept
  lost: number; // its belts removed, each whole
  stars?: number; // the copy's stars (2 or 3), for the caller that cargoes it; absent = 1
}

/** One candidate placement of a reshaped factory: its anchor, rot and the indices of its own belts it keeps. */
interface Spot { x: number; y: number; rot: number; keep: number[] }

/**
 * SHAPES-1 (REQ-BFG-086 S6): with SHAPES on, every GANTRY PRESS and ASSEMBLY LINE (shapes.ts RESHAPED_IDS) on a deck made
 * in 0.9.9's shapes is re-placed in its new shape, as migrateInlineGates re-placed BELTSIDE's gates. A spot is an anchor
 * and a rot (0..footTurns - 1) whose cells are all on the deck, off other machinery, off other factories' belts and off
 * the turret intake cells (cap's ruling 4ef9d32165edfd0d, 4: an intake cell "doesn't fit"). The factory's own belts may be
 * covered: a belt is kept when its first tile is still beside the footprint and no cell of the footprint covers one of its
 * tiles (and, for a belt that joins one of the factory's own belts, when that belt is kept). First the anchor at its own rot: if it fits there and keeps every belt, it stays (so the migration is idempotent
 * and a deck made with SHAPES on never moves). Otherwise the spot that keeps the most belts wins; ties go to the nearest
 * anchor to the old one (|dx| + |dy|), then the lower rot, then row order. A belt it can't keep is removed whole (and
 * pruneJoins frees a belt that joined it), as when a factory is moved today. With no spot, the factory leaves the deck with
 * its belts (`to: null`; the caller cargoes, refunds or drops it). Mutates `b`; deck order is kept. Off: nothing.
 */
export function migrateShapedFactories(b: Build): ReshapedMove[] {
  const out: ReshapedMove[] = [];
  if (!shapesRules()) return out;
  for (const p of b.items.filter((q) => RESHAPED_IDS.includes(q.def))) {
    const d = ITEMS[p.def];
    const own = b.routes.map((r, i) => (r.factory === p.uid ? i : -1)).filter((i) => i >= 0);
    const blocked = new Set<number>();
    for (const q of b.items) if (q.uid !== p.uid) for (const k of cellsOf(q)) blocked.add(k);
    b.routes.forEach((r, i) => { if (r.factory !== p.uid) for (const k of r.cells) blocked.add(k); });
    const h = hero(b);
    const spotAt = (x: number, y: number, rot: number): Spot | null => {
      if (!footOnDeck(d, x, y, rot)) return null;
      const cells = footprintCells(d, x, y, rot);
      if (cells.some((k) => blocked.has(k) || (ky(k) === 0 && turretForColumn(h, kx(k)) >= 0))) return null;
      const fp = new Set(cells);
      const beside = (k: number) => !fp.has(k) && [0, 1, 2, 3].some((dir) => {
        const nx = kx(k) - [0, 1, 0, -1][dir], ny = ky(k) - [-1, 0, 1, 0][dir];
        return inGrid(nx, ny) && fp.has(key(nx, ny));
      });
      let keep = own.filter((i) => {
        const r = b.routes[i];
        return r.cells.length > 0 && beside(r.cells[0]) && !r.cells.some((k) => fp.has(k));
      });
      // a belt that joins one of its own belts it can't keep would be left an open end: it goes too (whole), down the chain
      for (let changed = true; changed;) {
        changed = false;
        for (const i of keep) {
          const j = b.routes[i].join;
          const into = j === undefined ? -1 : b.routes.findIndex((q) => q.cells.includes(j));
          if (into >= 0 && own.includes(into) && !keep.includes(into)) {
            keep = keep.filter((q) => q !== i);
            changed = true;
            break;
          }
        }
      }
      return { x, y, rot, keep };
    };
    const from = { x: p.x, y: p.y, rot: rotOf(p) };
    let best = spotAt(p.x, p.y, rotOf(p));
    if (!best || best.keep.length < own.length) {
      best = null;
      const turns = footTurns(footOf(d));
      let bestDist = Infinity;
      for (let rot = 0; rot < turns; rot++) {
        for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
          const s = spotAt(x, y, rot);
          if (!s) continue;
          const dist = Math.abs(x - p.x) + Math.abs(y - p.y);
          const better = !best || s.keep.length > best.keep.length
            || (s.keep.length === best.keep.length && (dist < bestDist || (dist === bestDist && rot < best.rot)));
          if (better) {
            best = s;
            bestDist = dist;
          }
        }
      }
    }
    if (!best) {
      b.items = b.items.filter((q) => q.uid !== p.uid);
      b.routes = b.routes.filter((r) => r.factory !== p.uid);
      pruneJoins(b);
      out.push({ uid: p.uid, def: p.def, from, to: null, kept: 0, lost: own.length, ...(p.stars && p.stars > 1 ? { stars: p.stars } : {}) });
      continue;
    }
    const keep = new Set(best.keep);
    const lost = own.filter((i) => !keep.has(i));
    if (best.x !== p.x || best.y !== p.y || best.rot !== rotOf(p) || lost.length) {
      p.x = best.x;
      p.y = best.y;
      const f = rotField(p.def, best.rot);
      if (f.rot === undefined) delete p.rot;
      else p.rot = f.rot;
      if (lost.length) {
        const drop = new Set(lost);
        b.routes = b.routes.filter((_, i) => !drop.has(i));
        pruneJoins(b);
      }
      out.push({ uid: p.uid, def: p.def, from, to: { x: best.x, y: best.y, rot: best.rot }, kept: best.keep.length, lost: lost.length });
    }
  }
  return out;
}

/** SHAPES-1 (S6): log one deck's re-placed factories (the migration log's `moved`; `dropped` for one that fit nowhere). */
export function logShapes(source: string, moves: ReshapedMove[], extra: { cargoed?: number; refunded?: number } = {}): void {
  if (!moves.length) return;
  const gone = moves.filter((m) => !m.to);
  const m: Migration = { moved: [], stranded: [] };
  for (const v of moves) {
    if (v.to) m.moved.push({ uid: v.uid, def: v.def, from: key(v.from.x, v.from.y), to: key(v.to.x, v.to.y), rot: v.to.rot });
    else m.stranded.push({ uid: v.uid, def: v.def, x: v.from.x, y: v.from.y });
  }
  logMigration(source, m, extra.cargoed !== undefined || extra.refunded !== undefined ? extra : { dropped: gone.length });
}

// ---------------------------------------------------------------- placement helpers

/** A hit a rig would make if it stood somewhere: the arrow direction and the belt tile it lands on. */
export interface WouldHit {
  dir: Dir;
  cell: number;
  route: number;
  tile: number;
  from?: number; // SHAPES-1 (R2): the rig cell the arrow shines from; written only for a multi-cell rig
}

/** Belt cell -> [route, tile] for routes accepted by `only` (default: every route). */
export function beltIndex(b: Build, only?: (ri: number) => boolean): Map<number, [number, number]> {
  const m = new Map<number, [number, number]>();
  // GATES-1 (REQ-BFG-052): a converter's tile takes no rig's arrow (R5; deck.ts rigHits), so a ghost, the auto-aim and the bots never promise a hit there
  const conv = gatesRules() ? new Set(b.items.filter(isConverterItem).map((p) => key(p.x, p.y))) : undefined;
  b.routes.forEach((r, ri) => {
    if (only && !only(ri)) return;
    r.cells.forEach((k, ti) => { if (!conv?.has(k)) m.set(k, [ri, ti]); });
  });
  return m;
}

/** The hits a rig of `def` at rotation `rot` would make standing on (x, y) (R5), against `belts`. 0.8.0 P1 (E3): none
 *  for a stoking rig (STOKER), whose arrows do nothing to belts: stokesIfPlaced reads its factory hits. */
export function hitsIfPlaced(b: Build, def: string, x: number, y: number, rot: number, belts = beltIndex(b)): WouldHit[] {
  const out: WouldHit[] = [];
  const d = ITEMS[def];
  if (d && footOf(d) !== "1") {
    // SHAPES-1 (REQ-BFG-086 R2): a multi-cell rig's arrows shine from every outside edge of its cells (rigArrowCells);
    // none while a cell is off the deck or on a belt
    if (!footOnDeck(d, x, y, rot) || d.gate?.stoke || cellsOf({ uid: -1, def, x, y, rot }).some((k) => belts.has(k))) return out;
    for (const a of rigArrowCells(d, x, y, rot)) {
      const w = a.to >= 0 ? belts.get(a.to) : undefined;
      if (w) out.push({ dir: a.dir, cell: a.to, route: w[0], tile: w[1], from: a.from });
    }
    return out;
  }
  if (!inGrid(x, y) || belts.has(key(x, y)) || ITEMS[def]?.gate?.stoke) return out;
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
  // SHAPES-1 (REQ-BFG-086 S7.1): a multi-cell rig takes the shaped-rig solver's best placement that hits this tile
  if (ITEMS[def] && footOf(ITEMS[def]) !== "1") return shapedSpot(b, def, only, accept, [ri, ti]);
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

// ---------------------------------------------------------------- 0.8.0 P1 (E3): rigs that work factories

/** E3: one arrow of a stoking rig that would point into a factory's footprint (deck.ts stokeHits, before placing). */
export interface WouldStoke {
  dir: Dir;
  cell: number; // the footprint cell it points at
  factory: number; // the factory's uid
}

/** E3: the factory hits a STOKER of `def` at rotation `rot` would make standing on (x, y); [] for any other rig (R5:
 *  its arrows at machinery stay idle). */
export function stokesIfPlaced(b: Build, def: string, x: number, y: number, rot: number): WouldStoke[] {
  const out: WouldStoke[] = [];
  if (!ITEMS[def]?.gate?.stoke || !inGrid(x, y)) return out;
  // SHAPES-1 (R2): every arrow of the rig (rigArrowCells; a 1-cell rig's are its arrows from its cell, as before)
  for (const a of rigArrowCells(def, x, y, rot)) {
    const k = a.to;
    if (k < 0) continue;
    const f = b.items.find((p) => ITEMS[p.def]?.kind === "factory" && cellsOf(p).includes(k));
    if (f) out.push({ dir: a.dir, cell: k, factory: f.uid });
  }
  return out;
}

/** E3: a place for a stoking rig: its cell, rotation and the factories its arrows would work. */
export interface StokeSpot {
  x: number;
  y: number;
  rot: number;
  stokes: WouldStoke[];
}

/**
 * E3 (DESIGN-wave3.md 3.3 module 6: "a candidate cell beside a factory"): the free cells beside factories (no machinery,
 * no belt, not a turret intake), each at the rotation whose arrows work the most factories (ties: the lowest rotation),
 * most factories first, then deck order (factories in deck order, the cells around each in D3 direction order). [] for a
 * rig that doesn't stoke.
 */
export function stokeSpots(b: Build, def: string, occ = occupancy(b)): StokeSpot[] {
  if (!ITEMS[def]?.gate?.stoke) return [];
  const out: StokeSpot[] = [];
  const seen = new Set<number>();
  for (const f of b.items) {
    const d = ITEMS[f.def];
    if (d?.kind !== "factory") continue;
    const fp = new Set(cellsOf(f)); // SHAPES-1: the turned footprint
    for (const k of fp) for (const dir of [0, 1, 2, 3] as Dir[]) {
      const c = arrowCell(kx(k), ky(k), dir);
      if (c < 0 || fp.has(c) || seen.has(c) || !freeForRig(b, c, occ) || intakeCell(b, c)) continue;
      seen.add(c);
      let best: StokeSpot | null = null;
      for (const rot of rotations(def)) {
        const stokes = stokesIfPlaced(b, def, kx(c), ky(c), rot);
        if (!best || stokes.length > best.stokes.length) best = { x: kx(c), y: ky(c), rot, stokes };
      }
      if (best && best.stokes.length) out.push(best);
    }
  }
  return out.sort((a, c) => c.stokes.length - a.stokes.length); // stable: deck order within a count
}

// ---------------------------------------------------------------- SHAPES-1 (S7.1): the shaped-rig solver

/**
 * SHAPES-1 (REQ-BFG-086 S7.1; PIECES-1 5.3 "How bots and par builders place shapes"): where a multi-cell rig of `def` goes
 * on `b`. Every placement, anchor x, y x rot (rotations: 0-3), at most 400, whose cells are all free (no machinery, no
 * belt), on the deck and off the turret intakes. Its score: the sum over its hits on the belts `only` accepts of a hit's
 * value, minus 0.5 for each of its cells beside a belt that no arrow of it hits a belt from (the room it takes). A hit's
 * value is 1: a plain rig's flat and per-tile terms (estimateRoute's) are the same for every hit of one def, so each hit
 * counts alike; `accept` rules placements out by their hits, as H2's does (a speed rig's on a slag belt, P20). The best
 * wins; ties go to its first hit tile in H2's order (route, then tile), then that tile's D3 neighbour order
 * (neighbourOrder: the side its arrow shines from), then the lower rot, then row order, as H2 (bestSpot, spotForTile)
 * breaks ties. `tile` ([route, tile]): only placements that hit that tile (the "typical" player's random belt tile).
 * null when no placement hits a belt.
 */
export function shapedSpot(
  b: Build, def: string, only?: (ri: number) => boolean, accept?: (hits: WouldHit[]) => boolean, tile?: readonly [number, number],
): RigSpot | null {
  const d = ITEMS[def];
  if (!d) return null;
  const belts = beltIndex(b, only), occ = occupancy(b), h = hero(b);
  const beside = (k: number) => [0, 1, 2, 3].some((dir) => {
    const n = arrowCell(kx(k), ky(k), dir as Dir);
    return n >= 0 && occ[n].route >= 0;
  });
  let best: { spot: RigSpot; score: number; order: number[] } | null = null;
  for (const rot of rotations(def)) {
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (!footOnDeck(d, x, y, rot)) continue;
      const cells = footprintCells(d, x, y, rot);
      if (cells.some((k) => occ[k].item >= 0 || occ[k].route >= 0 || (ky(k) === 0 && turretForColumn(h, kx(k)) >= 0))) continue;
      const hits = hitsIfPlaced(b, def, x, y, rot, belts);
      if (!hits.length || (accept && !accept(hits))) continue;
      if (tile && !hits.some((q) => q.route === tile[0] && q.tile === tile[1])) continue;
      const wasted = cells.filter((k) => beside(k) && !hits.some((q) => (q.from ?? key(x, y)) === k)).length;
      const score = hits.length - 0.5 * wasted;
      const first = [...hits].sort((p, q) => p.route - q.route || p.tile - q.tile)[0];
      const order = [first.route, first.tile, neighbourOrder(b, first.route, first.tile).indexOf(opposite(first.dir)), rot];
      const before = (o: number[]) => { for (let i = 0; i < o.length; i++) if (order[i] !== o[i]) return order[i] < o[i]; return false; };
      if (!best || score > best.score || (score === best.score && before(best.order))) best = { spot: { x, y, rot, hits }, score, order };
    }
  }
  return best ? best.spot : null;
}

/** Place a rig at a spot (the caller checked it is free): the item with its rot field. */
export function placeRigAt(b: Build, uid: number, def: string, s: { x: number; y: number; rot: number }, stars?: number): Placed {
  const p: Placed = { uid, def, x: s.x, y: s.y, ...(stars && stars > 1 ? { stars } : {}), ...rotField(def, s.rot) };
  b.items.push(p);
  return p;
}
