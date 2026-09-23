// Bundled full-purse stand-in decks for the dusk fight, days 1-10 (0.6.0c). The pool comes from
// tools/genStandInPool.ts: per hero and day, a population of legal builds that each spend at
// least 90% of maxGoldByDay(day), ranked by strength against a fixed gauntlet of that day's
// builds; the picks are the builds whose strength percentile lies in the middle band (default
// 40-60), and the par is the pick nearest the 50th percentile.
// Portable: this file and its data module import only ./content and ./deck (and each other),
// so the game can copy both as they are.
//
// Build code (one string per deck): "<beltCap> <hullBonus>/<items>/<routes>/<mods>"
//   items:  space-separated <itemId><yx>: the item's cell as two digits, row y then column x.
//           The i-th item (1-based) gets uid i.
//   routes: space-separated <factoryItemNo>:<cells>: the feeding item's 1-based number, then
//           the route's cells as concatenated two-digit yx keys, factory end first.
//   mods:   space-separated <itemId><turret>; mod uids follow the items.
// Example (Furnace starting deck): "14 0/kiln64/1:544434241404/"

import { GRID, HEROES, ITEMS, type HeroId } from "./content";
import type { Build, ModPlacement, Placed, RouteDef } from "./deck";
import { STAND_IN_DATA, type StandInDay } from "./standInPoolData";

/** RULES_VERSION the pool was generated (and scored) under. */
export const STAND_IN_POOL_RULES: string = STAND_IN_DATA.rules;
/** Heroes with stand-in decks, in pool order. */
export const STAND_IN_POOL_HEROES: readonly HeroId[] = Object.keys(STAND_IN_DATA.pools) as HeroId[];
export const STAND_IN_POOL_DAYS = 10;

export interface StandInEntry {
  hero: HeroId;
  day: number;
  build: Build;
  cost: number; // purchase cost in gold (items, modules, belt crates, plating)
  pct: number; // strength percentile inside its hero/day population (0-100)
}

const cellCode = (x: number, y: number): string => `${y}${x}`;

/** Encode a deck as a stand-in build code (uids are renumbered on decode). */
export function encodeStandIn(b: Build): string {
  if (GRID !== 10) throw new Error("stand-in build codes assume a 10x10 deck");
  const no = new Map<number, number>();
  const items = b.items.map((p, i) => {
    if (!/^[a-z]+$/.test(p.def)) throw new Error(`stand-in code: item id "${p.def}" is not lowercase letters`);
    no.set(p.uid, i + 1);
    return `${p.def}${cellCode(p.x, p.y)}`;
  });
  const routes = b.routes.map((r) => {
    const f = no.get(r.factory);
    if (f === undefined) throw new Error(`stand-in code: route fed by unknown uid ${r.factory}`);
    return `${f}:${r.cells.map((k) => cellCode(k % GRID, Math.floor(k / GRID))).join("")}`;
  });
  const mods = b.mods.map((m) => `${m.def}${m.turret}`);
  return `${b.beltCap} ${b.hullBonus}/${items.join(" ")}/${routes.join(" ")}/${mods.join(" ")}`;
}

/** Decode a stand-in build code into a fresh Build for `hero`. */
export function decodeStandIn(hero: HeroId, code: string): Build {
  const [head, itemPart, routePart, modPart] = code.split("/");
  const [beltCap, hullBonus] = head.split(" ").map(Number);
  const words = (s: string | undefined) => (s ? s.split(" ").filter(Boolean) : []);
  const items: Placed[] = words(itemPart).map((w, i) => {
    const m = /^([a-z]+)(\d)(\d)$/.exec(w);
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad item "${w}"`);
    return { uid: i + 1, def: m[1], x: Number(m[3]), y: Number(m[2]) };
  });
  const routes: RouteDef[] = words(routePart).map((w) => {
    const m = /^(\d+):((?:\d\d)+)$/.exec(w);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > items.length) throw new Error(`stand-in code: bad route "${w}"`);
    const cells: number[] = [];
    for (let i = 0; i < m[2].length; i += 2) cells.push(Number(m[2][i]) * GRID + Number(m[2][i + 1]));
    return { factory: Number(m[1]), cells };
  });
  const mods: ModPlacement[] = words(modPart).map((w, j) => {
    const m = /^([a-z]+)(\d+)$/.exec(w);
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad module "${w}"`);
    return { uid: items.length + j + 1, def: m[1], turret: Number(m[2]) };
  });
  if (!HEROES[hero]) throw new Error(`stand-in code: unknown hero "${hero}"`);
  return { hero, items, routes, mods, beltCap, hullBonus };
}

/** Clamp a day into 1..10. */
export function standInDay(day: number): number {
  return Number.isFinite(day) ? Math.max(1, Math.min(STAND_IN_POOL_DAYS, Math.floor(day))) : 1;
}

function dayPool(hero: HeroId, day: number): StandInDay | undefined {
  return Object.prototype.hasOwnProperty.call(STAND_IN_DATA.pools, hero) ? STAND_IN_DATA.pools[hero]![standInDay(day) - 1] : undefined;
}

function need(hero: HeroId, day: number, who: string): StandInDay {
  const d = dayPool(hero, day);
  if (!d) throw new Error(`${who}: no stand-in decks for hero "${hero}"; the pool covers ${STAND_IN_POOL_HEROES.join(", ")} (regenerate it with tools/genStandInPool.ts)`);
  return d;
}

/** The pool for (hero, day) as fresh entries sorted by pct; [] for a hero not in the pool. */
export function standInPool(hero: HeroId, day: number): StandInEntry[] {
  const d = dayPool(hero, day);
  if (!d) return [];
  const dd = standInDay(day);
  return d[1].map(([cost, pct, , code]) => ({ hero, day: dd, build: decodeStandIn(hero, code), cost, pct }))
    .sort((a, b) => a.pct - b.pct);
}

/** FNV-1a over the parts: a stable 32-bit hash (no dependency on core/rng). */
function hash32(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Index (into standInPool(hero, day)) of the seeded pick. Throws for a hero not in the pool. */
export function standInPickIndex(hero: HeroId, day: number, seed: number): number {
  const d = need(hero, day, "standInPick");
  return hash32("stand-in", seed >>> 0, hero, standInDay(day)) % d[1].length;
}

/** A deterministic stand-in deck for (hero, day, seed), as a fresh copy. Throws for a hero not in the pool. */
export function standInPick(hero: HeroId, day: number, seed: number): Build {
  const d = need(hero, day, "standInPick");
  return decodeStandIn(hero, d[1][standInPickIndex(hero, day, seed)][3]);
}

/** Index (into standInPool(hero, day)) of the par: the pick nearest the 50th percentile. */
export function standInParIndex(hero: HeroId, day: number): number {
  return need(hero, day, "standInPar")[0];
}

/** The par stand-in deck for (hero, day), as a fresh copy. Throws for a hero not in the pool. */
export function standInPar(hero: HeroId, day: number): Build {
  const d = need(hero, day, "standInPar");
  return decodeStandIn(hero, d[1][d[0]][3]);
}
