// Balance harness: random legal, honestly priced builds. randomBuild(hero, day, rng) starts
// from the hero's starting deck and spends up to maxGoldByDay(day) on the real shop levers,
// drawn at random with per-build lever weights (so a population spans plating-heavy to
// gate-heavy decks). Every output passes validateBuild(build, day); same Rng state, same build.
// Extends tools/samplePool.ts's shopper (gates on belt tiles, modules, whole plating) with
// belt crates + rerouting (length and connector) and Stamp Press lines.

import type { Rng } from "../../core/rng";
import { GRID, HEROES, ITEMS, rarityWeights, type HeroId } from "../content";
import { cloneBuild, footprint, occupancy, routesOf, type Build } from "../deck";
import { buildCost, maxGoldByDay } from "../../net/validate";
import { heroStartBuild } from "./heroes";
import { blockedCells, freeConnectors, minTiles, randomPath, startCells } from "./path";

export type Lever = "gate" | "mod" | "plating" | "route" | "press";
export const LEVERS: readonly Lever[] = ["gate", "mod", "plating", "route", "press"];

const GATES = Object.values(ITEMS).filter((d) => d.kind === "gate" && d.merchant);
const MODS = Object.values(ITEMS).filter((d) => d.kind === "mod" && d.merchant);
const CRATE = ITEMS.beltcrate, PLATE = ITEMS.plating, PRESS = ITEMS.press;
const CRATE_BELT = CRATE.supply!.belt!, PLATE_HULL = PLATE.supply!.hull!;
const MIN_GATE = Math.min(...GATES.map((g) => g.price));
const MIN_MOD = Math.min(...MODS.map((m) => m.price));
export const MAX_TILES = 40; // longest route the generator draws
export const MAX_ROUTE_EDITS = 4; // reroute attempts per build (they cost no gold, so they are capped)

class Shopper {
  uid = 100;
  edits = 0;
  constructor(readonly b: Build, readonly budget: number, readonly day: number, readonly rng: Rng) {}

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

  can(l: Lever): boolean {
    const left = this.left(), b = this.b;
    if (l === "plating") return left >= PLATE.price;
    if (l === "gate") return left >= MIN_GATE && this.freeRouteCells().length > 0;
    if (l === "mod") return left >= MIN_MOD && HEROES[b.hero].turrets.some((_, t) => !b.mods.some((m) => m.turret === t));
    if (l === "press") return left >= PRESS.price && freeConnectors(b).length > 0;
    return this.edits < MAX_ROUTE_EDITS && b.routes.length > 0;
  }

  apply(l: Lever): boolean {
    if (l === "plating") {
      this.b.hullBonus += PLATE_HULL;
      return true;
    }
    if (l === "gate") return this.gate();
    if (l === "mod") return this.mod();
    if (l === "press") return this.press();
    this.edits++;
    return this.reroute();
  }

  /** A gate on a free belt tile; the type is drawn with the shop's rarity weights for the day. */
  gate(): boolean {
    const left = this.left(), w = rarityWeights(this.day);
    const pool = GATES.filter((d) => d.price <= left && w[d.rarity] > 0);
    const cells = this.freeRouteCells();
    if (!pool.length || !cells.length) return false;
    const d = this.rng.weighted(pool, (g) => w[g.rarity] / GATES.filter((x) => x.rarity === g.rarity).length);
    const k = this.rng.pick(cells);
    this.b.items.push({ uid: this.uid++, def: d.id, x: k % GRID, y: Math.floor(k / GRID) });
    return true;
  }

  /** A turret module on a free hardpoint, preferring guns that some belt feeds. */
  mod(): boolean {
    const b = this.b, h = HEROES[b.hero], left = this.left();
    const free = h.turrets.map((_, t) => t).filter((t) => !b.mods.some((m) => m.turret === t));
    const fed = new Set(b.routes.map((r) => h.turrets.findIndex((t) => t.connectors.includes(r.cells[r.cells.length - 1] % GRID))));
    const live = free.filter((t) => fed.has(t));
    const pool = MODS.filter((d) => d.price <= left);
    if (!pool.length || !free.length) return false;
    b.mods.push({ uid: this.uid++, def: this.rng.pick(pool).id, turret: this.rng.pick(live.length ? live : free) });
    return true;
  }

  /** A random-length route into a random free connector (exactly `tiles` when given). */
  drawRoute(skip: number, starts: number[], bl: Uint8Array, spare: number, tiles?: number): number[] | null {
    const cols = freeConnectors(this.b, skip);
    if (!cols.length || !starts.length) return null;
    const room = this.beltRoom(skip, spare);
    for (let tries = 0; tries < 6; tries++) {
      const col = this.rng.pick(cols);
      const lo = minTiles(starts, col);
      if (lo > room || (tiles !== undefined && (tiles < lo || tiles > room))) continue;
      const n = tiles ?? lo + this.rng.int(room - lo + 1);
      const cells = randomPath(bl, starts, col, n, this.rng) ?? (tiles === undefined && n < room ? randomPath(bl, starts, col, n + 1, this.rng) : null);
      if (cells) return cells;
    }
    return null;
  }

  /** Move route `ri` onto a new belt (tile count `tiles` or random); its gates ride along. */
  moveRoute(ri: number, tiles?: number): boolean {
    const b = this.b, snap = cloneBuild(b), spare = this.left();
    const r = b.routes[ri];
    const f = b.items.find((p) => p.uid === r.factory)!;
    const occ = occupancy(b);
    const lifted = new Set(r.cells.map((k) => occ[k].item).filter((u) => u >= 0));
    const carried = b.items.filter((p) => lifted.has(p.uid));
    b.items = b.items.filter((p) => !lifted.has(p.uid));
    const bl = blockedCells(b, ri);
    const cells = this.drawRoute(ri, startCells(f.x, f.y, ITEMS[f.def].size, bl), bl, spare, tiles);
    if (!cells || cells.length < carried.length) return this.restore(snap);
    this.buyBelt(ri, cells.length);
    b.routes[ri] = { factory: r.factory, cells };
    const spots = this.rng.shuffle([...cells]);
    carried.forEach((p, i) => b.items.push({ ...p, x: spots[i] % GRID, y: Math.floor(spots[i] / GRID) }));
    return buildCost(b).total <= this.budget ? true : this.restore(snap);
  }

  /** Reroute a random route. A twin-pour factory (Crucible) half the time gets matched lengths. */
  reroute(): boolean {
    const b = this.b;
    const ri = this.rng.int(b.routes.length);
    if (!this.moveRoute(ri)) return false;
    const r = b.routes[ri];
    const f = b.items.find((p) => p.uid === r.factory)!;
    if (ITEMS[f.def].factory?.ammo === "blank" && this.rng.chance(0.5)) {
      for (const si of routesOf(b, r.factory)) if (si !== ri) this.moveRoute(si, r.cells.length);
    }
    return true;
  }

  /** A Stamp Press on a free 2x2 spot (not the forward row) with a line into a free connector. */
  press(): boolean {
    const b = this.b;
    for (let tries = 0; tries < 8; tries++) {
      const x = this.rng.int(GRID - 1), y = 1 + this.rng.int(GRID - 2);
      const occ = occupancy(b);
      if (footprint(PRESS, x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
      const snap = cloneBuild(b);
      const uid = this.uid++;
      b.items.push({ uid, def: PRESS.id, x, y });
      const bl = blockedCells(b);
      const cells = this.drawRoute(-1, startCells(x, y, PRESS.size, bl), bl, this.left());
      if (cells) {
        this.buyBelt(-1, cells.length);
        b.routes.push({ factory: uid, cells });
        if (buildCost(b).total <= this.budget) return true;
      }
      this.restore(snap);
    }
    return false;
  }
}

/** Random lever weights for one build (its "personality"). */
function personality(rng: Rng): Record<Lever, number> {
  const w = {} as Record<Lever, number>;
  for (const l of LEVERS) w[l] = 0.1 + rng.next();
  return w;
}

/** A random legal build for `hero` on `day` (1-10) that costs at most maxGoldByDay(day). */
export function randomBuild(hero: HeroId, day: number, rng: Rng): Build {
  const b = heroStartBuild(hero, 1);
  const s = new Shopper(b, maxGoldByDay(day), day, rng);
  const w = personality(rng);
  for (let fails = 0, steps = 0; fails < 12 && steps < 400; steps++) {
    const open = LEVERS.filter((l) => s.can(l));
    if (!open.length) break;
    fails = s.apply(rng.weighted(open, (x) => w[x])) ? 0 : fails + 1;
  }
  return b;
}
