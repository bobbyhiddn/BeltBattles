// Balance harness: the Shopper, the state randomBuild spends through. It holds the deck being
// built, the day's budget and the hero's shop (shopExclude honoured), plus the belt and gate
// helpers every lever shares. Edits that can fail take a snapshot and restore it.

import type { Rng } from "../../core/rng";
import { GRID, HEROES, ITEMS, type ItemDef } from "../content";
import { cloneBuild, kx, ky, occupancy, routesOf, turretForColumn, type Build, type Placed } from "../deck";
import { buildCost } from "../../net/validate";
import { FUSE_MAX } from "../stars";
import { shopItems } from "./heroes";
import { gainInto, previewMerge } from "./merge";
import { blockedCells, freeConnectors, minTiles, randomPath, startCells } from "./path";

export const CRATE = ITEMS.beltcrate, PLATE = ITEMS.plating, PRESS = ITEMS.press;
export const CRATE_BELT = CRATE.supply!.belt!, PLATE_HULL = PLATE.supply!.hull!;
export const MAX_TILES = 40; // longest route the generator draws
export const MAX_ROUTE_EDITS = 4; // reroute attempts per build (they cost no gold, so they are capped)

export const isSpeedGate = (d: ItemDef): boolean => d.gate?.speed !== undefined;
export const isFlatGate = (d: ItemDef): boolean => !!(d.gate?.flat || d.gate?.perPriorGate);
export const isSplitter = (d: ItemDef): boolean => !!d.gate?.split;

/** 0.6.1a: "on" (default) runs every gain through the game's merge rules (src/sim/harness/merge.ts);
 *  "off" reproduces v1 exactly (same items, same RNG draws), for the byte-identical regression. */
export type Stars = "on" | "off";

export class Shopper {
  uid = 100;
  edits = 0;
  synced = false; // Crucible twins matched with mirrored speed gates; kept so after every lever
  ordered = false; // flat-bonus gates ahead of Splitters on every route; kept so after every lever
  readonly stars: boolean; // true: every gain goes through gainInto (merge-aware); false: v1 raw pushes
  readonly gates: ItemDef[]; // gates this hero's caravan sells
  readonly mods: ItemDef[];
  readonly minGate: number;
  readonly minMod: number;

  // NOTE: defaults to "off" (v1-exact), not the harness's product-level "on" default, so every
  // pre-existing call site that builds a Shopper without the new 5th argument — most importantly
  // the protected tests/harness.*.test.ts, which hand-place items bypassing gainInto and then
  // rely on sync/order landing a gate at an exact cell — reproduces v1 byte for byte with zero
  // risk of merge-redirection. Every real "on" entry point (randomBuild/topUp/fullPurseBuild
  // below, tournament.ts's DEFAULT_OPTS, standins.ts's STANDIN_DEFAULTS, and the CLIs' --stars
  // flag) passes `stars` through explicitly, so "on" is still the default at every product surface.
  // maxStars (F8): the highest star a gain may merge up to. FUSE_MAX (3) everywhere but the stand-in
  // candidates, which stay at 2 (ARSENAL.md §9.2: "the Matriarch alone may carry a 3★").
  constructor(readonly b: Build, readonly budget: number, readonly day: number, readonly rng: Rng, stars: Stars = "off", readonly maxStars: number = FUSE_MAX) {
    this.stars = stars === "on";
    this.gates = shopItems(b.hero, "gate");
    this.mods = shopItems(b.hero, "mod");
    this.minGate = Math.min(...this.gates.map((g) => g.price));
    this.minMod = Math.min(...this.mods.map((m) => m.price));
  }

  /** May one more copy of `def` be gained? Always (no RNG, no preview) unless stars is on and the
   *  cap is below FUSE_MAX; then not when the gain would merge up to more than maxStars. */
  canGain(def: string): boolean {
    if (!this.stars || this.maxStars >= FUSE_MAX) return true;
    const pv = previewMerge(this.b, this.uid, def);
    return !pv || pv.toStars <= this.maxStars;
  }

  left(): number {
    return this.budget - buildCost(this.b).total;
  }

  restore(snap: Build): false {
    Object.assign(this.b, cloneBuild(snap));
    return false;
  }

  otherBelt(skip: number): number {
    return this.b.routes.reduce((s, r, i) => s + (i === skip ? 0 : r.cells.length), 0);
  }

  /** Tiles route `skip` may use: free cap plus what `spare` gold of crates would add. */
  beltRoom(skip: number, spare: number): number {
    const crates = Math.max(0, Math.floor(spare / CRATE.price));
    return Math.min(MAX_TILES, this.b.beltCap + crates * CRATE_BELT - this.otherBelt(skip));
  }

  /** Raise beltCap by whole crates until `tiles` fit beside the other routes. */
  buyBelt(skip: number, tiles: number): void {
    while (this.otherBelt(skip) + tiles > this.b.beltCap) this.b.beltCap += CRATE_BELT;
  }

  freeRouteCells(): number[] {
    const occ = occupancy(this.b);
    return this.b.routes.flatMap((r) => r.cells).filter((k) => occ[k].item < 0);
  }

  /** The item sitting on cell k, if any. */
  itemAt(k: number): Placed | undefined {
    const u = occupancy(this.b)[k].item;
    return u >= 0 ? this.b.items.find((p) => p.uid === u) : undefined;
  }

  /** Place a new gate/factory copy at cell k. 0.6.1a: routed through gainInto when stars is on,
   *  so a same-def 1-star twin already on the deck absorbs it instead (ARSENAL.md §4.1); off,
   *  this is the exact v1 push (same uid sequence, no RNG consumed either way). */
  placeGate(def: string, k: number): void {
    if (this.stars) gainInto(this, this.b, def, { x: kx(k), y: ky(k) });
    else this.b.items.push({ uid: this.uid++, def, x: kx(k), y: ky(k) });
  }

  removeItem(uid: number): void {
    this.b.items = this.b.items.filter((p) => p.uid !== uid);
  }

  /** Connector column route `ri` ends on (forward row), or -1. */
  connectorOf(ri: number): number {
    const c = this.b.routes[ri].cells;
    const last = c[c.length - 1];
    return last !== undefined && ky(last) === 0 ? kx(last) : -1;
  }

  /** The two routes of a twin-pour factory (Crucible) when it feeds exactly two, else null. */
  twinRoutes(): [number, number] | null {
    const f = this.b.items.find((p) => ITEMS[p.def].factory?.ammo === "blank");
    if (!f) return null;
    const rs = routesOf(this.b, f.uid);
    return rs.length === 2 ? [rs[0], rs[1]] : null;
  }

  /** The other connector of route `ri`'s turret, if no route besides `ri` and `sib` claims it. */
  partnerCol(ri: number, sib: number): number {
    const h = HEROES[this.b.hero], col = this.connectorOf(ri);
    const t = col >= 0 ? turretForColumn(h, col) : -1;
    if (t < 0) return -1;
    const free = new Set([...freeConnectors(this.b, ri)].filter((c) => c !== col));
    const sibCol = this.connectorOf(sib);
    const other = h.turrets[t].connectors.find((c) => c !== col && (free.has(c) || c === sibCol));
    return other ?? -1;
  }

  /** Both twin routes the same length, into the two connectors of one turret. */
  twinsMatched(a: number, b: number): boolean {
    const h = HEROES[this.b.hero], ca = this.connectorOf(a), cb = this.connectorOf(b);
    if (ca < 0 || cb < 0 || ca === cb) return false;
    return this.b.routes[a].cells.length === this.b.routes[b].cells.length && turretForColumn(h, ca) === turretForColumn(h, cb);
  }

  /** A random-length route into a random free connector (exactly `tiles` / `col` when given). */
  drawRoute(skip: number, starts: number[], bl: Uint8Array, spare: number, tiles?: number, col?: number): number[] | null {
    const free = freeConnectors(this.b, skip);
    const cols = col === undefined ? free : free.filter((c) => c === col);
    if (!cols.length || !starts.length) return null;
    const room = this.beltRoom(skip, spare);
    for (let tries = 0; tries < 6; tries++) {
      const c = this.rng.pick(cols);
      const lo = minTiles(starts, c);
      if (lo > room || (tiles !== undefined && (tiles < lo || tiles > room))) continue;
      const n = tiles ?? lo + this.rng.int(room - lo + 1);
      const cells = randomPath(bl, starts, c, n, this.rng) ?? (tiles === undefined && n < room ? randomPath(bl, starts, c, n + 1, this.rng) : null);
      if (cells) return cells;
    }
    return null;
  }

  /** Move route `ri` onto a new belt (tile count `tiles`, connector `col`, or random); its gates ride along. */
  moveRoute(ri: number, tiles?: number, col?: number): boolean {
    const b = this.b, snap = cloneBuild(b), spare = this.left();
    const r = b.routes[ri];
    const f = b.items.find((p) => p.uid === r.factory)!;
    const occ = occupancy(b);
    const lifted = new Set(r.cells.map((k) => occ[k].item).filter((u) => u >= 0));
    const carried = b.items.filter((p) => lifted.has(p.uid));
    b.items = b.items.filter((p) => !lifted.has(p.uid));
    const bl = blockedCells(b, ri);
    const cells = this.drawRoute(ri, startCells(f.x, f.y, ITEMS[f.def].size, bl), bl, spare, tiles, col);
    if (!cells || cells.length < carried.length) return this.restore(snap);
    this.buyBelt(ri, cells.length);
    b.routes[ri] = { factory: r.factory, cells };
    const spots = this.rng.shuffle([...cells]);
    carried.forEach((p, i) => b.items.push({ ...p, x: spots[i] % GRID, y: Math.floor(spots[i] / GRID) }));
    return buildCost(b).total <= this.budget ? true : this.restore(snap);
  }
}
