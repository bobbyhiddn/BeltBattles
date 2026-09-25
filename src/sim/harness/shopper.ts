// Balance harness: the Shopper, the state randomBuild spends through. It holds the deck being
// built, the day's budget and the hero's shop (shopExclude honoured), plus the belt and rig
// helpers every lever shares. Edits that can fail take a snapshot and restore it.
// 0.6.2 BELTSIDE (ref/DESIGN-beltside.md H2): rigs stand beside the belt. The shopper picks a belt tile to
// work and places the rig greedily: the free cell beside that tile and the rotation with the most hits on
// connected belts, ties to the first candidate in D3 order (beltside.ts spotForTile). A rig that works only
// a belt that moves or goes (its riders) is lifted and put back to work beside the new belt.
// beltside-062-on-061 (DESIGN §13 P16, one harness): harness v2 decides what the bots buy, merge and keep
// (stars, cores, cargo, canGain: every gain through the game's gainModule, merge.ts gainInto); H2 decides
// where a rig goes and which way it faces. A new copy that merges into a placed twin leaves that twin (the
// survivor) on its cell with its rotation (fuse.ts survivor rule 2); stars off is v2's stars-off, on rigs.

import type { Rng } from "../../core/rng";
import { AMMO, HEROES, ITEMS, type ItemDef } from "../content";
import {
  arrowCell, cloneBuild, connectorClaims, hitsOfRig, kx, ky, occupancy, rigHits, routeInfo, routesOf, turretForColumn,
  type Build, type Dir, type Placed,
} from "../deck";
import { freeForRig, intakeCell, placeRigAt, spotForTile, type WouldHit } from "../beltside";
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

/** A filter on the hits a rig would make where it is being placed (beltside.ts spotForTile). */
export type Accept = (hits: WouldHit[]) => boolean;

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

/** 0.6.1c: cells of fixed-speed (slag) routes: a speed rig hit there can do nothing (Battle.transport; DESIGN P8). */
export function fixedSpeedCells(b: Build): Set<number> {
  const out = new Set<number>();
  b.routes.forEach((r, ri) => { if (fixedSpeedRoute(b, ri)) for (const k of r.cells) out.add(k); });
  return out;
}

/** 0.6.1c: speed rigs the shopper kept off slag routes. skipped: not bought (no rig tile left on a non-slag route), or
 *  a carried speed rig left behind by a drop onto a slag line; steered: bought to work a non-slag tile while some
 *  candidate tiles were slag ones (beltside-062-h3, DESIGN §14 P20). */
export interface SlagCount { skipped: number; steered: number }

export class Shopper {
  uid = 100;
  edits = 0;
  synced = false; // Crucible twins matched with mirrored speed rigs; kept so after every lever
  ordered = false; // flat-bonus rigs ahead of Splitters on every route; kept so after every lever
  readonly stars: boolean; // true: every gain goes through gainInto (merge-aware); false: v1 raw pushes
  readonly coresOn: boolean; // 0.6.1b: stars on AND cores on: the "core" lever may buy and fit cores
  readonly gates: ItemDef[]; // rigs this hero's caravan sells (kind "gate")
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
  // rely on sync/order landing a rig at an exact spot — reproduces v1 byte for byte with zero
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

  /** beltside-062-h3 (DESIGN §14 P20): the slag routes a speed rig must not work, by route index; null when there is
   *  nothing to keep it off: factories off (no RNG, nothing read), no slag route, or `def` is not a speed rig. */
  slagRoutesOf(def: ItemDef): boolean[] | null {
    if (!this.factoriesOn || !isSpeedGate(def)) return null;
    const slag = this.b.routes.map((_, ri) => fixedSpeedRoute(this.b, ri));
    return slag.some(Boolean) ? slag : null;
  }

  /** slagRoutesOf for a NEW copy of `def`: null too when the copy merges at once (gainInto puts it into its placed
   *  twin, which keeps its cell and rotation, so where it was aimed doesn't matter), as part 3's cellsFor. */
  slagRoutesFor(def: ItemDef): boolean[] | null {
    const slag = this.slagRoutesOf(def);
    if (!slag) return null;
    const pv = previewMerge(this.b, this.uid, def.id, this.cargo);
    return pv && pv.where !== "cargo" ? null : slag;
  }

  /** beltside-062-h3 (DESIGN §14 P20; the rig form of part 3's cellsFor): the rig tiles [route, tile] a new rig of
   *  `def` may be put to work on. With factories on, a speed rig never works a tile of a slag route (it could do
   *  nothing there: AMMO.slag.fixedSpeed); counted in `slag` when that removes a tile, if `count` (steered: some
   *  tiles are left; skipped: none). Factories off (or not a speed rig, or a copy that merges at once): exactly
   *  `tiles`, no count, no RNG. */
  rigTilesFor(def: ItemDef, tiles: [number, number][], count = true): [number, number][] {
    const slag = this.slagRoutesFor(def);
    if (!slag) return tiles;
    const ok = tiles.filter(([ri]) => !slag[ri]);
    if (count && ok.length < tiles.length) {
      if (ok.length) this.slag.steered++;
      else this.slag.skipped++;
    }
    return ok;
  }

  /** rigTilesFor(def, rigTiles(only), false).length > 0, stopping at the first tile (B3's early exit): the slag-aware
   *  probe. Factories off: hasRigTile(only) exactly. */
  hasRigTileFor(def: ItemDef, only: (ri: number) => boolean = this.connected()): boolean {
    const slag = this.slagRoutesFor(def);
    return this.hasRigTile(slag ? (ri) => only(ri) && !slag[ri] : only);
  }

  /** beltside-062-h3 (DESIGN §14 P20, P21): speed-rig HITS on tiles of slag routes, one per hit. The shopper's rule
   *  keeps it 0: a rig's arrows, not its cell, decide what it works, so a new slag belt drawn past an idle arrow of a
   *  multi-arrow speed rig (OVERDRIVE, X) would count here. Factories off: 0, nothing read. */
  speedOnSlag(): number {
    if (!this.factoriesOn) return 0;
    const slag = fixedSpeedCells(this.b);
    if (!slag.size) return 0;
    let n = 0;
    for (const r of rigHits(this.b)) for (const t of r) for (const h of t) if (slag.has(h.cell) && isSpeedGate(ITEMS[h.def])) n++;
    return n;
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

  /** H2 counts hits on connected belts: the routes that reach a turret intake. */
  connected(): (ri: number) => boolean {
    const claims = connectorClaims(this.b);
    const ok = new Set(this.b.routes.map((_, i) => i).filter((i) => routeInfo(this.b, i, claims, undefined, []).connected));
    return (ri) => ok.has(ri);
  }

  /** Belt tiles [route, tile] of connected routes (of `only` when given) with a free cell beside them
   *  (turret intakes left clear): the tiles a rig can be put to work on. (BELTSIDE's stand-in for v2's
   *  freeRouteCells: a rig needs a free cell beside a belt, not a free belt tile.) */
  rigTiles(only: (ri: number) => boolean = this.connected()): [number, number][] {
    const occ = occupancy(this.b);
    const out: [number, number][] = [];
    this.b.routes.forEach((r, ri) => {
      if (!only(ri)) return;
      r.cells.forEach((k, ti) => {
        for (let d = 0; d < 4; d++) {
          const n = arrowCell(kx(k), ky(k), d as Dir);
          if (freeForRig(this.b, n, occ) && !intakeCell(this.b, n)) {
            out.push([ri, ti]);
            break;
          }
        }
      });
    });
    return out;
  }

  /** rigTiles(only).length > 0, stopping at the first such tile (the levers' yes/no checks run every step). */
  hasRigTile(only: (ri: number) => boolean = this.connected()): boolean {
    const occ = occupancy(this.b);
    return this.b.routes.some((r, ri) => only(ri) && r.cells.some((k) => {
      for (let d = 0; d < 4; d++) {
        const n = arrowCell(kx(k), ky(k), d as Dir);
        if (freeForRig(this.b, n, occ) && !intakeCell(this.b, n)) return true;
      }
      return false;
    }));
  }

  /**
   * H2: put a rig to work on tile ti of route ri: the free cell beside it and the rotation with the most hits
   * on connected belts (ties: the first candidate in D3 order), among placements `accept` allows. A lifted rig
   * (`keep`) keeps its uid and stars: it is moved, not gained, so it never merges. A new copy with stars on is
   * gained through the game's gainModule at that spot and rotation (v2's placeGate): if a same-def, same-star
   * twin is placed it fuses into that twin instead, and the twin keeps its cell and rotation (P16); the
   * survivor is returned. Stars off: v2's raw push (the next uid), at the H2 spot. null when no cell beside
   * the tile will do (nothing is bought).
   * beltside-062-h3 (DESIGN §14 P20): with factories on, a speed rig lands no arrow on a slag route, wherever else
   * its arrows reach (an X OVERDRIVE beside two belts); a lifted rig is moved, never merged, so it always obeys it.
   * Factories off: `accept` exactly.
   */
  placeRig(def: string, ri: number, ti: number, accept?: Accept, keep?: Placed): Placed | null {
    const slag = keep ? this.slagRoutesOf(ITEMS[def]) : this.slagRoutesFor(ITEMS[def]);
    const ok: Accept | undefined = slag ? (hs) => hs.every((h) => !slag[h.route]) && (!accept || accept(hs)) : accept;
    const s = spotForTile(this.b, def, ri, ti, this.connected(), undefined, ok);
    if (!s) return null;
    if (keep) return placeRigAt(this.b, keep.uid, def, s, keep.stars);
    if (this.stars) {
      const g = gainInto(this, this.b, def, { x: s.x, y: s.y, rot: s.rot }, this.cargo);
      return this.b.items.find((p) => p.uid === g.survivor) ?? null;
    }
    return placeRigAt(this.b, this.uid++, def, s);
  }

  /** Rigs whose every hit lands on route ri: they go idle when it moves or goes, so they travel with it. */
  ridersOf(ri: number): Placed[] {
    const hits = rigHits(this.b);
    return this.b.items.filter((p) => {
      if (ITEMS[p.def].kind !== "gate") return false;
      const hs = hitsOfRig(this.b, p.uid, hits);
      return hs.length > 0 && hs.every((h) => h.route === ri);
    });
  }

  /** Take rigs off the deck (their cells free up for belts). */
  lift(rigs: Placed[]): void {
    const off = new Set(rigs.map((p) => p.uid));
    this.b.items = this.b.items.filter((p) => !off.has(p.uid));
  }

  /** Put lifted rigs back to work beside route ri, each on a random tile of it with a free side (H2 spot).
   *  Returns how many found a place (in order: it stops at the first that finds none). */
  reseat(rigs: Placed[], ri: number): number {
    let n = 0;
    for (const p of rigs) {
      const tiles = this.rigTiles((r) => r === ri);
      if (!tiles.length || !this.placeRig(p.def, ri, this.rng.pick(tiles)[1], undefined, p)) break;
      n++;
    }
    return n;
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

  /** Move route `ri` onto a new belt (tile count `tiles`, connector `col`, or random). Its riders (rigs that
   *  work only it) are lifted first, so the new belt may use their cells, then put back to work beside it;
   *  the move fails when one of them finds no place. Rigs that also work another belt stay where they are.
   *  Fix pass (v2): deck + cargo within the day's gold (with cores off the cargo is empty: the deck-only check). */
  moveRoute(ri: number, tiles?: number, col?: number): boolean {
    const b = this.b, snap = cloneBuild(b), spare = this.left();
    const r = b.routes[ri];
    const f = b.items.find((p) => p.uid === r.factory)!;
    const carried = this.ridersOf(ri);
    this.lift(carried);
    const bl = blockedCells(b, ri);
    const cells = this.drawRoute(ri, startCells(f.x, f.y, ITEMS[f.def].size, bl), bl, spare, tiles, col);
    if (!cells) return this.restore(snap);
    this.buyBelt(ri, cells.length);
    b.routes[ri] = { factory: r.factory, cells };
    if (this.reseat(carried, ri) < carried.length) return this.restore(snap);
    // beltside-062-h3 (P20): nor may a moved slag belt run past a speed rig's arrow (factories off: always 0)
    return this.left() >= 0 && !this.speedOnSlag() ? true : this.restore(snap);
  }
}
