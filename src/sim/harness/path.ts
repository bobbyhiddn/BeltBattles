// Balance harness: random belt routes. A route is a self-avoiding orthogonal path from a
// cell beside its factory to a turret connector on the forward row (y = 0), with an exact
// tile count. Found by randomised depth-first search with distance/parity pruning and an
// expansion budget, so it is fast, deterministic for a given Rng, and may fail (null).

import type { Rng } from "../../core/rng";
import { GRID, ITEMS } from "../content";
import { DX, DY, footprint, hero, inGrid, key, kx, ky, type Build } from "../deck";
import { cellsOf } from "../deck"; // SHAPES-1 (REQ-BFG-086 R1): a placed piece's turned footprint

const dist = (a: number, b: number) => Math.abs(kx(a) - kx(b)) + Math.abs(ky(a) - ky(b));

/** Cells a new or rerouted belt may not use: machinery, other routes' belts, the forward row. */
export function blockedCells(b: Build, skipRoute = -1): Uint8Array {
  const bl = new Uint8Array(GRID * GRID);
  for (const p of b.items) for (const k of cellsOf(p)) if (k >= 0 && k < bl.length) bl[k] = 1; // SHAPES-1: turned footprints
  b.routes.forEach((r, i) => {
    if (i !== skipRoute) for (const k of r.cells) bl[k] = 1;
  });
  for (let x = 0; x < GRID; x++) bl[key(x, 0)] = 1; // only the target connector is ever entered
  return bl;
}

/** Free cells orthogonally adjacent to a size x size footprint at (fx, fy). */
export function startCells(fx: number, fy: number, size: number, bl: Uint8Array): number[] {
  const fp: number[] = [];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) fp.push(key(fx + i, fy + j));
  return startCellsFor(fp, bl);
}

/** SHAPES-1 (REQ-BFG-086 R3, S7.2): free cells orthogonally adjacent to any footprint (its cells: foot.ts footprintCells,
 *  deck.ts cellsOf), row by row: where a belt may start, the start cells from the turned edge. A size x size square
 *  gives startCells' cells in its order. */
export function startCellsFor(cells: readonly number[], bl: Uint8Array): number[] {
  const fp = new Set<number>(cells);
  const out: number[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const k = key(x, y);
      if (fp.has(k) || bl[k]) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x - DX[d], ny = y - DY[d];
        if (inGrid(nx, ny) && fp.has(key(nx, ny))) {
          out.push(k);
          break;
        }
      }
    }
  }
  return out;
}

/** Connector columns not claimed by any route other than `except` (route index), and with no machinery
 *  standing on the intake cell (0.6.2 BELTSIDE: a rig may stand there, and randomPath always lets a belt
 *  enter its target, so such an intake is not free). */
export function freeConnectors(b: Build, except = -1): number[] {
  const taken = new Set<number>();
  b.routes.forEach((r, i) => {
    if (i === except || !r.cells.length) return;
    const last = r.cells[r.cells.length - 1];
    if (ky(last) === 0) taken.add(kx(last));
  });
  for (const p of b.items) for (const k of cellsOf(p)) if (ky(k) === 0) taken.add(kx(k)); // SHAPES-1: turned footprints
  return hero(b).turrets.flatMap((t) => t.connectors).filter((c) => !taken.has(c)); // 0.6.2s: installed intakes
}

/** Shortest possible route (tiles) from any start to connector column `col`, or Infinity. */
export function minTiles(starts: number[], col: number): number {
  let best = Infinity;
  for (const s of starts) best = Math.min(best, dist(s, key(col, 0)) + 1);
  return best;
}

/** 0.6.1c: the true shortest route (tiles) from any start to connector column `col` around the blocked cells
 *  (breadth-first), or Infinity when it can't be reached. minTiles is the obstacle-free lower bound. */
export function shortestTiles(bl: Uint8Array, starts: number[], col: number): number {
  const target = key(col, 0), dist = new Int32Array(GRID * GRID).fill(-1), queue: number[] = [];
  for (const s of starts) if (dist[s] < 0 && (s === target || !bl[s])) { dist[s] = 1; queue.push(s); }
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    if (k === target) return dist[k];
    for (let d = 0; d < 4; d++) {
      const nx = kx(k) + DX[d], ny = ky(k) + DY[d];
      if (!inGrid(nx, ny)) continue;
      const n = key(nx, ny);
      if (dist[n] >= 0 || (n !== target && bl[n])) continue;
      dist[n] = dist[k] + 1;
      queue.push(n);
    }
  }
  return Infinity;
}

/** A random route of exactly `tiles` cells from one of `starts` into (col, 0), or null. */
export function randomPath(bl: Uint8Array, starts: number[], col: number, tiles: number, rng: Rng, budget = 1200): number[] | null {
  const target = key(col, 0);
  const ok = rng.shuffle(starts.filter((s) => {
    const slack = tiles - 1 - dist(s, target);
    return slack >= 0 && slack % 2 === 0;
  }));
  const path: number[] = [];
  const seen = new Uint8Array(GRID * GRID);
  let left = budget;
  const dfs = (k: number): boolean => {
    if (--left < 0) return false;
    path.push(k);
    seen[k] = 1;
    const remaining = tiles - path.length;
    if (remaining === 0) {
      if (k === target) return true;
    } else {
      const dirs = rng.shuffle([0, 1, 2, 3]);
      for (const d of dirs) {
        const nx = kx(k) + DX[d], ny = ky(k) + DY[d];
        if (!inGrid(nx, ny)) continue;
        const n = key(nx, ny);
        if (seen[n]) continue;
        if (n === target ? remaining !== 1 : bl[n]) continue;
        const r = remaining - 1;
        const dn = dist(n, target);
        if (dn > r || (r - dn) % 2 !== 0) continue;
        if (dfs(n)) return true;
      }
    }
    path.pop();
    seen[k] = 0;
    return false;
  };
  for (const s of ok) {
    if (left < 0) break;
    if (s === target ? tiles === 1 : !bl[s]) {
      if (dfs(s)) return [...path];
    }
  }
  return null;
}
