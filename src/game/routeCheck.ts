// Local mirror of the async validator's route checks (ref async-validate.ts: routeProblem and the
// routes block of validateBuild). A deck whose belts a ghost upload would refuse can't FIGHT: every
// route well formed, starting beside its factory, no loops, no broken steps, no non-gate machinery
// on the path, no crossings, ending on a free turret connector; a factory feeds at most its outputs;
// total belt <= beltCap. A deck with no routes at all passes. Reads deck.ts only.

import { GRID, ITEMS } from "../sim/content";
import {
  adjacentToFactory, connectorClaims, dirBetween, itemByUid, occupancy, routeInfo, routeWellFormed,
  type Build, type Occ,
} from "../sim/deck";

/** FIGHT's short reasons: a belt that doesn't end on a free turret connector, any other problem. */
export const NOWHERE = "BELT GOES NOWHERE";
export const BROKEN = "BELT IS BROKEN";

export interface RouteProblem {
  route: number; // route index
  why: string; // the validator's message, loosely
  nowhere: boolean; // does not end on a free turret connector
}

const kindOf = (b: Build, uid: number): string | undefined => {
  const p = itemByUid(b, uid);
  return p ? ITEMS[p.def]?.kind : undefined;
};

const onDeck = (k: number): boolean => Number.isInteger(k) && k >= 0 && k < GRID * GRID;

/** The validator's per-route shape check (routeProblem), or null. */
function routeProblem(b: Build, i: number, occ: Occ[]): string | null {
  const r = b.routes[i];
  if (!r.cells.length) return "has no belt tiles";
  if (kindOf(b, r.factory) !== "factory") return `is fed by uid ${r.factory}, which is not a factory on this deck`;
  if (adjacentToFactory(b, r.factory, r.cells[0]) < 0) return "does not start beside its factory";
  const seen = new Set<number>();
  for (let j = 0; j < r.cells.length; j++) {
    const k = r.cells[j];
    if (seen.has(k)) return `revisits cell ${k} (no loops)`;
    seen.add(k);
    if (j > 0 && dirBetween(r.cells[j - 1], k) < 0) return `is broken between cells ${r.cells[j - 1]} and ${k}`;
    const it = occ[k].item;
    if (it >= 0 && kindOf(b, it) !== "gate") return `runs through non-gate machinery at cell ${k}`;
  }
  return routeWellFormed(b, r) ? null : "is not well formed";
}

/** Every failing route check, in the validator's order (one entry per failing check). */
export function routeProblems(b: Build): RouteProblem[] {
  const out: RouteProblem[] = [];
  const add = (route: number, why: string, nowhere = false) => out.push({ route, why, nowhere });
  // cells off the deck would break deck.ts's occupancy: report them and check the rest without them
  const off = b.routes.map((r) => !Array.isArray(r.cells) || !r.cells.every(onDeck));
  const safe: Build = off.some(Boolean) ? { ...b, routes: b.routes.map((r, i) => (off[i] ? { factory: r.factory, cells: [] } : r)) } : b;
  const occ = occupancy(safe);
  const claims = connectorClaims(safe);
  const beltOwner = new Map<number, number>();
  const perFactory = new Map<number, number[]>();
  let belt = 0, over = -1;
  b.routes.forEach((r, i) => {
    belt += off[i] ? 0 : r.cells.length;
    if (belt > b.beltCap && over < 0) over = i;
    perFactory.set(r.factory, [...(perFactory.get(r.factory) ?? []), i]);
    const why = off[i] ? "has a cell off the deck" : routeProblem(safe, i, occ);
    if (why) return add(i, `route ${i} ${why}`);
    for (const k of r.cells) {
      const o = beltOwner.get(k);
      if (o !== undefined) add(i, `routes ${o} and ${i} cross at cell ${k}`);
      else beltOwner.set(k, i);
    }
    if (!routeInfo(safe, i, claims, occ).connected) add(i, `route ${i} does not end on a free turret connector (disconnected)`, true);
  });
  for (const [uid, list] of perFactory) {
    const p = itemByUid(b, uid);
    const outs = p ? ITEMS[p.def]?.factory?.outputs ?? 1 : 1;
    if (p && list.length > outs) add(list[outs], `${ITEMS[p.def].name} uid ${uid} feeds ${list.length} routes but has ${outs} output(s)`);
  }
  // one deck-wide overflow, pinned on the route whose tiles first run past the cap
  if (over >= 0) add(over, `${belt} belt tiles exceed beltCap ${b.beltCap}`);
  return out;
}

const routesIn = (ps: RouteProblem[]): number[] => [...new Set(ps.map((p) => p.route))].sort((x, y) => x - y);
const blockOf = (ps: RouteProblem[]): string | undefined => (!ps.length ? undefined : ps.some((p) => p.nowhere) ? NOWHERE : BROKEN);

/** Indices of the routes with a problem (sorted, unique). */
export function brokenRoutes(b: Build): number[] {
  return routesIn(routeProblems(b));
}

/** Why FIGHT is blocked (NOWHERE before BROKEN), or undefined when the belts are legal. */
export function fightBlock(b: Build): string | undefined {
  return blockOf(routeProblems(b));
}

/** Both from one pass (the build screen reads them every frame). */
export function routeCheck(b: Build): { block: string | undefined; broken: number[] } {
  const ps = routeProblems(b);
  return { block: blockOf(ps), broken: routesIn(ps) };
}
