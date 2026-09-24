// Balance harness: the Shopper, the state randomBuild spends through. It holds the deck being
// built, the day's budget and the hero's shop (shopExclude honoured), plus the belt and gate
// helpers every lever shares. Edits that can fail take a snapshot and restore it.

import type { Rng } from "../../core/rng";
import { GRID, HEROES, ITEMS, type ItemDef } from "../content";
import { cloneBuild, kx, ky, occupancy, routesOf, turretForColumn, type Build, type Placed } from "../deck";
import { buildCost } from "../../net/validate";
import { shopItems } from "./heroes";
import { blockedCells, freeConnectors, minTiles, randomPath, startCells } from "./path";

export const CRATE = ITEMS.beltcrate, PLATE = ITEMS.plating, PRESS = ITEMS.press;
export const CRATE_BELT = CRATE.supply!.belt!, PLATE_HULL = PLATE.supply!.hull!;
export const MAX_TILES = 40; // longest route the generator draws
export const MAX_ROUTE_EDITS = 4; // reroute attempts per build (they cost no gold, so they are capped)

export const isSpeedGate = (d: ItemDef): boolean => d.gate?.speed !== undefined;
export const isFlatGate = (d: ItemDef): boolean => !!(d.gate?.flat || d.gate?.perPriorGate);
export const isSplitter = (d: ItemDef): boolean => !!d.gate?.split;

export class Shopper {
  uid = 100;
  edits = 0;
  synced = false; // Crucible twins matched with mirrored speed gates; kept so after every lever
  ordered = false; // flat-bonus gates ahead of Splitters on every route; kept so after every lever
  readonly gates: ItemDef[]; // gates this hero's caravan sells
  readonly mods: ItemDef[];
  readonly minGate: number;
  readonly minMod: number;

  constructor(readonly b: Build, readonly budget: number, readonly day: number, readonly rng: Rng) {
    this.gates = shopItems(b.hero, "gate");
    this.mods = shopItems(b.hero, "mod");
    this.minGate = Math.min(...this.gates.map((g) => g.price));
    this.minMod = Math.min(...this.mods.map((m) => m.price));
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

  placeGate(def: string, k: number): void {
    this.b.items.push({ uid: this.uid++, def, x: kx(k), y: ky(k) });
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
