// Balance harness: the Shopper, the state randomBuild spends through. It holds the deck being
// built, the day's budget and the hero's shop (shopExclude honoured), plus the belt and gate
// helpers every lever shares. Edits that can fail take a snapshot and restore it.

import type { Rng } from "../../core/rng";
import { AMMO, GRID, HEROES, ITEMS, type ItemDef } from "../content";
import { cloneBuild, kx, ky, occupancy, routesOf, turretForColumn, type Build, type Placed } from "../deck";
import { buildCost } from "../../net/validate";
import { FUSE_MAX } from "../stars";
import { shopFactories, shopItems } from "./heroes";
import { cargoValue, gainInto, previewMerge, type InvItem } from "./merge";
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

/** 0.6.1b (harness v2 part 2): "on" lets the shopper buy turret cores and fit them (the "core" lever);
 *  only effective with stars on. "off" (and stars off) buys none, with no RNG draw: exactly part 1. */
export type Cores = "on" | "off";

/** 0.6.1c (harness v2 part 3): "on" lets the "press" and "drop" levers buy any factory the hero can buy
 *  (shopFactories: STAMP PRESS and the six wave-1 factories, drawn with the day's rarity weights) and the
 *  "merge" lever buy a factory copy that merges at once; only effective with stars on. "off" (and stars off)
 *  buys the STAMP PRESS alone, with no new RNG draw: exactly part 2. */
export type Factories = "on" | "off";

/** 0.6.1c: does route `ri` carry a fixed-speed ammo (SLAG POT's slag, AMMO.slag.fixedSpeed; Battle.transport and
 *  deck.ts estimateRoute ignore speed gates for it)? The ammo kind is the factory's own spec: no star level changes
 *  it (tests/harness.factories.test.ts checks that at every star through the game's stars.ts), and the harness reads
 *  no star value itself (tests/harness.mods.test.ts). */
export function fixedSpeedRoute(b: Build, ri: number): boolean {
  const f = b.items.find((p) => p.uid === b.routes[ri].factory);
  const fs = f ? ITEMS[f.def].factory : undefined;
  return !!fs && AMMO[fs.ammo]?.fixedSpeed !== undefined;
}

/** 0.6.1c: cells of fixed-speed (slag) routes: a speed gate there can do nothing (Battle.transport). */
export function fixedSpeedCells(b: Build): Set<number> {
  const out = new Set<number>();
  b.routes.forEach((r, ri) => { if (fixedSpeedRoute(b, ri)) for (const k of r.cells) out.add(k); });
  return out;
}

/** 0.6.1c: speed gates the shopper kept off slag routes. skipped: not bought (no free non-slag cell), or a
 *  carried speed gate left behind by a drop onto a slag line; steered: bought onto a non-slag cell while
 *  some free cells were slag ones. */
export interface SlagCount { skipped: number; steered: number }

export class Shopper {
  uid = 100;
  edits = 0;
  synced = false; // Crucible twins matched with mirrored speed gates; kept so after every lever
  ordered = false; // flat-bonus gates ahead of Splitters on every route; kept so after every lever
  readonly stars: boolean; // true: every gain goes through gainInto (merge-aware); false: v1 raw pushes
  readonly coresOn: boolean; // 0.6.1b: stars on AND cores on: the "core" lever may buy and fit cores
  readonly gates: ItemDef[]; // gates this hero's caravan sells
  readonly mods: ItemDef[];
  readonly cores: ItemDef[]; // 0.6.1b: turret cores this hero's caravan sells (bought only when coresOn)
  readonly minGate: number;
  readonly minMod: number;
  readonly minCore: number;
  /** 0.6.1b: the run's cargo. A bought core swapped off a full socket lands here (fuse.ts freeSocket); it
   *  doesn't fight, but its gold is spent (left() counts it) and a later copy may merge with it. Always
   *  empty unless coresOn, so every other path is unchanged. */
  cargo: InvItem[] = [];
  swaps = 0; // 0.6.1b: cores swapped to cargo by the "core" lever
  readonly factoriesOn: boolean; // 0.6.1c: stars on AND factories on: any buyable factory (shopFactories)
  readonly factories: ItemDef[]; // 0.6.1c: factories this hero can buy (read only when factoriesOn)
  readonly minFactory: number;
  slag: SlagCount = { skipped: 0, steered: 0 }; // 0.6.1c: speed gates kept off slag routes (factories on only)
  thirdArm = 0; // 0.6.1c: routes added to a merged factory whose outputs grew (GANTRY PRESS at 2 stars: 3 outputs)

  // NOTE: defaults to "off" (v1-exact), not the harness's product-level "on" default, so every
  // pre-existing call site that builds a Shopper without the new 5th argument — most importantly
  // the protected tests/harness.*.test.ts, which hand-place items bypassing gainInto and then
  // rely on sync/order landing a gate at an exact cell — reproduces v1 byte for byte with zero
  // risk of merge-redirection. Every real "on" entry point (randomBuild/topUp/fullPurseBuild
  // below, tournament.ts's DEFAULT_OPTS, standins.ts's STANDIN_DEFAULTS, and the CLIs' --stars
  // flag) passes `stars` through explicitly, so "on" is still the default at every product surface.
  // maxStars (F8): the highest star a gain may merge up to. FUSE_MAX (3) everywhere but the stand-in
  // candidates, which stay at 2 (ARSENAL.md §9.2: "the Matriarch alone may carry a 3★").
  constructor(readonly b: Build, readonly budget: number, readonly day: number, readonly rng: Rng, stars: Stars = "off", readonly maxStars: number = FUSE_MAX, cores: Cores = "off", factories: Factories = "off") {
    this.stars = stars === "on";
    this.coresOn = this.stars && cores === "on";
    this.factoriesOn = this.stars && factories === "on";
    this.gates = shopItems(b.hero, "gate");
    this.mods = shopItems(b.hero, "mod");
    this.cores = shopItems(b.hero, "core");
    this.factories = shopFactories(b.hero);
    this.minGate = Math.min(...this.gates.map((g) => g.price));
    this.minMod = Math.min(...this.mods.map((m) => m.price));
    this.minCore = Math.min(...this.cores.map((c) => c.price));
    this.minFactory = Math.min(...this.factories.map((f) => f.price));
  }

  /** 0.6.1c: free route cells a new gate of `def` may take. With factories on, a speed gate never takes a cell of
   *  a slag route (it can do nothing there: AMMO.slag.fixedSpeed); counted in `slag` when that removes a cell, if
   *  `count`. A copy that merges at once lands on its twin's cell (gainInto ignores the target), so its cells are
   *  left as they are. Factories off (or not a speed gate): exactly `cells`, no count, no RNG. */
  cellsFor(def: ItemDef, cells: number[], count = true): number[] {
    if (!this.factoriesOn || !isSpeedGate(def)) return cells;
    const slag = fixedSpeedCells(this.b);
    if (!slag.size) return cells;
    const pv = previewMerge(this.b, this.uid, def.id, this.cargo);
    if (pv && pv.where !== "cargo") return cells;
    const ok = cells.filter((k) => !slag.has(k));
    if (count && ok.length < cells.length) {
      if (ok.length) this.slag.steered++;
      else this.slag.skipped++;
    }
    return ok;
  }

  /** May one more copy of `def` be gained? Always (no RNG, no preview) unless stars is on and the
   *  cap is below FUSE_MAX; then not when the gain would merge up to more than maxStars. 0.6.1b: the
   *  preview sees the cargo too (a copy can merge with a swapped-out core), so the cap covers cores. */
  canGain(def: string): boolean {
    if (!this.stars || this.maxStars >= FUSE_MAX) return true;
    const pv = previewMerge(this.b, this.uid, def, this.cargo);
    return !pv || pv.toStars <= this.maxStars;
  }

  /** Gold left: the budget minus the deck's value and (0.6.1b) the cargo's, which is 0 unless cores
   *  were swapped, so this is exactly part 1's arithmetic whenever cores are off. */
  left(): number {
    return this.budget - buildCost(this.b).total - (this.cargo.length ? cargoValue(this.cargo) : 0);
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
    if (this.stars) gainInto(this, this.b, def, { x: kx(k), y: ky(k) }, this.cargo);
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
    // fix pass: deck + cargo within the day's gold (with cores off the cargo is empty: v1's deck-only check)
    return this.left() >= 0 ? true : this.restore(snap);
  }
}
