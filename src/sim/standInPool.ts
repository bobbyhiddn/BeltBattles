// Bundled full-purse stand-in decks for the dusk fight, days 1-10 (0.6.0c). The pool comes from
// tools/genStandInPool.ts: per hero and day, a population of legal builds that each spend at
// least 90% of maxGoldByDay(day), ranked by strength against a fixed gauntlet of that day's
// builds (pct = strength percentile). Par floor: each pick wins at least half its battles against
// the day's par deck (heroRefBuild) of EITHER faction; vsPar is that lower win rate. The picks
// are eligible builds (pct >= 40, vsPar >= 0.5, not among the population's top eighth) spread
// across a 20-point window that starts at the lowest eligible pct (at 40 when no build lies
// between 40 and it), and the par is the pick nearest the window's middle. A day with too
// few eligible builds widens the window, grows its population, then allows elites; a day that
// still falls short takes its best-vsPar builds and is listed in STAND_IN_DATA.short.
// Portable: this file and its data module import only ./content, ./deck and ./beltside (and each
// other; beltside.ts itself imports only ./content and ./deck), so the game can copy them as they are.
// 0.6.2 BELTSIDE: decoding is a load boundary (DESIGN-beltside D3). The v1.1 decks were generated with
// gates ON belt tiles; decodeStandIn moves each beside its belt (migrateInlineGates) and drops, and logs,
// a gate with no free neighbour. The data stays as generated until the harness re-bakes it natively (D4).
//
// Build code (one string per deck): "<beltCap> <hullBonus>/<items>/<routes>/<mods>"
//   items:  space-separated <itemId><yx>[r<rot>]: the item's cell as two digits, row y then column x,
//           then (0.6.2, rigs only, never 0) its rotation. The i-th item (1-based) gets uid i.
//   routes: space-separated <factoryItemNo>:<cells>: the feeding item's 1-based number, then
//           the route's cells as concatenated two-digit yx keys, factory end first.
//   mods:   space-separated <itemId><turret>; mod uids follow the items.
// Example (Furnace starting deck): "14 0/kiln64/1:544434241404/"

import { GRID, HEROES, ITEMS, type HeroId } from "./content";
import { rotOf, type Build, type ModPlacement, type Placed, type RouteDef } from "./deck";
import { logMigration, migrateInlineGates } from "./beltside";
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
  vsPar: number; // lower win rate against the day's par decks of both factions, heroRefBuild (0-1)
}

const cellCode = (x: number, y: number): string => `${y}${x}`;

/** Encode a deck as a stand-in build code (uids are renumbered on decode). */
export function encodeStandIn(b: Build): string {
  if (GRID !== 10) throw new Error("stand-in build codes assume a 10x10 deck");
  const no = new Map<number, number>();
  const items = b.items.map((p, i) => {
    if (!/^[a-z]+$/.test(p.def)) throw new Error(`stand-in code: item id "${p.def}" is not lowercase letters`);
    no.set(p.uid, i + 1);
    const rot = rotOf(p);
    return `${p.def}${cellCode(p.x, p.y)}${rot ? `r${rot}` : ""}`;
  });
  const routes = b.routes.map((r) => {
    const f = no.get(r.factory);
    if (f === undefined) throw new Error(`stand-in code: route fed by unknown uid ${r.factory}`);
    return `${f}:${r.cells.map((k) => cellCode(k % GRID, Math.floor(k / GRID))).join("")}`;
  });
  const mods = b.mods.map((m) => `${m.def}${m.turret}`);
  return `${b.beltCap} ${b.hullBonus}/${items.join(" ")}/${routes.join(" ")}/${mods.join(" ")}`;
}

/**
 * Decode a stand-in build code into a fresh Build for `hero`. 0.6.2 BELTSIDE: a load boundary; gates on
 * belt tiles move beside their belts (D3), a stranded one is dropped (and logged), and the uids are then
 * numbered again in item order (mods after the items), so encode and decode still round-trip.
 */
export function decodeStandIn(hero: HeroId, code: string): Build {
  const b = decodeStandInRaw(hero, code);
  const m = migrateInlineGates(b);
  logMigration("standin", m, { dropped: m.stranded.length });
  if (m.stranded.length) renumber(b);
  return b;
}

/** Items get uids 1..n in order and mods n+1.., as the code format assigns them; routes follow their factory. */
function renumber(b: Build): void {
  const no = new Map<number, number>();
  b.items.forEach((p, i) => {
    no.set(p.uid, i + 1);
    p.uid = i + 1;
  });
  for (const r of b.routes) r.factory = no.get(r.factory) ?? r.factory;
  b.mods.forEach((m, j) => { m.uid = b.items.length + j + 1; });
}

/** The deck exactly as its code writes it, before the D3 migration (tests, and the harness re-bake). */
export function decodeStandInRaw(hero: HeroId, code: string): Build {
  const [head, itemPart, routePart, modPart] = code.split("/");
  const [beltCap, hullBonus] = head.split(" ").map(Number);
  const words = (s: string | undefined) => (s ? s.split(" ").filter(Boolean) : []);
  const items: Placed[] = words(itemPart).map((w, i) => {
    const m = /^([a-z]+)(\d)(\d)(?:r([1-3]))?$/.exec(w);
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad item "${w}"`);
    if (m[4] && ITEMS[m[1]].kind !== "gate") throw new Error(`stand-in code: "${w}" is not a rig and can't have a rotation`);
    return { uid: i + 1, def: m[1], x: Number(m[3]), y: Number(m[2]), ...(m[4] ? { rot: Number(m[4]) } : {}) };
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

// 0.6.1g (REQ-BFG-019): the star-aware build code, ported unchanged from the harness v2 codec
// (src/sim/harness/standinCode.ts, harness-v2 f40a6d3) ahead of the flip. It is the v1 code above plus
// an optional "*2" or "*3" suffix on an item or module word (no suffix: 1 star), e.g.
//   "14 0/kiln64 temper44*2/1:544434241404/calibrate0*3"
// A deck whose items and modules are all 1-star encodes byte-identical to encodeStandIn, and every v1 /
// v1.1 code decodes exactly as decodeStandIn decodes it (same objects, same key order). Nothing calls
// these yet: the game keeps loading the v1.1 pool through decodeStandIn until the flip.
// beltside-062-on-061 (ref/DESIGN-beltside.md §13 P15): on BELTSIDE the star-aware decode is a load boundary
// exactly as decodeStandIn is: the raw deck (decodeStarredRaw), then the D3 migration (a migrated rig keeps
// its stars), then renumbering if a stranded rig was dropped (and logged). The raw code learns BELTSIDE's
// rotation, before the stars: an item word is <id><yx>[r<rot>][*<stars>], e.g. "temper43r1*2".

/** A copy's star level as stars.ts:starsOf (absent or below 1: 1; at most FUSE_MAX, 3); inlined so standInPool.ts imports nothing from stars.ts (portable), pinned by tests/standInPool.starred.test.ts. */
function starsOf(x: { stars?: number } | undefined): number {
  const s = x?.stars;
  if (typeof s !== "number" || !Number.isFinite(s) || s < 1) return 1;
  return Math.min(3, Math.floor(s));
}
const suffix = (p: { stars?: number }): string => (starsOf(p) > 1 ? `*${starsOf(p)}` : "");

/** Encode a deck as a star-aware stand-in build code (uids are renumbered on decode). beltside-062-on-061 (P15): a
 *  rig's rotation is written as encodeStandIn writes it, before the stars. */
export function encodeStarred(b: Build): string {
  if (GRID !== 10) throw new Error("stand-in build codes assume a 10x10 deck");
  const no = new Map<number, number>();
  const items = b.items.map((p, i) => {
    if (!/^[a-z]+$/.test(p.def)) throw new Error(`stand-in code: item id "${p.def}" is not lowercase letters`);
    no.set(p.uid, i + 1);
    const rot = rotOf(p);
    return `${p.def}${cellCode(p.x, p.y)}${rot ? `r${rot}` : ""}${suffix(p)}`;
  });
  const routes = b.routes.map((r) => {
    const f = no.get(r.factory);
    if (f === undefined) throw new Error(`stand-in code: route fed by unknown uid ${r.factory}`);
    return `${f}:${r.cells.map((k) => cellCode(k % GRID, Math.floor(k / GRID))).join("")}`;
  });
  const mods = b.mods.map((m) => {
    if (!/^[a-z]+$/.test(m.def)) throw new Error(`stand-in code: module id "${m.def}" is not lowercase letters`);
    return `${m.def}${m.turret}${suffix(m)}`;
  });
  return `${b.beltCap} ${b.hullBonus}/${items.join(" ")}/${routes.join(" ")}/${mods.join(" ")}`;
}

/**
 * Decode a star-aware (or v1) stand-in build code into a fresh Build for `hero`. beltside-062-on-061 (DESIGN §13 P15):
 * a load boundary exactly as decodeStandIn: gates on belt tiles move beside their belts (D3) with their stars, a
 * stranded one is dropped (and logged), and the uids are then numbered again in item order (mods after the items).
 */
export function decodeStarred(hero: HeroId, code: string): Build {
  const b = decodeStarredRaw(hero, code);
  const m = migrateInlineGates(b);
  logMigration("standin", m, { dropped: m.stranded.length });
  if (m.stranded.length) renumber(b);
  return b;
}

/** The star-aware deck exactly as its code writes it, before the D3 migration (0.6.1g's decodeStarred body; P15: the
 *  item word takes BELTSIDE's rotation, rigs only and never 0, before the stars). */
export function decodeStarredRaw(hero: HeroId, code: string): Build {
  const [head, itemPart, routePart, modPart] = code.split("/");
  const [beltCap, hullBonus] = head.split(" ").map(Number);
  const words = (s: string | undefined) => (s ? s.split(" ").filter(Boolean) : []);
  const star = (s: string | undefined) => (s ? { stars: Number(s) } : {});
  const items: Placed[] = words(itemPart).map((w, i) => {
    const m = /^([a-z]+)(\d)(\d)(?:r([1-3]))?(?:\*([23]))?$/.exec(w);
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad item "${w}"`);
    if (m[4] && ITEMS[m[1]].kind !== "gate") throw new Error(`stand-in code: "${w}" is not a rig and can't have a rotation`);
    return { uid: i + 1, def: m[1], x: Number(m[3]), y: Number(m[2]), ...(m[4] ? { rot: Number(m[4]) } : {}), ...star(m[5]) };
  });
  const routes: RouteDef[] = words(routePart).map((w) => {
    const m = /^(\d+):((?:\d\d)+)$/.exec(w);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > items.length) throw new Error(`stand-in code: bad route "${w}"`);
    const cells: number[] = [];
    for (let i = 0; i < m[2].length; i += 2) cells.push(Number(m[2][i]) * GRID + Number(m[2][i + 1]));
    return { factory: Number(m[1]), cells };
  });
  const mods: ModPlacement[] = words(modPart).map((w, j) => {
    const m = /^([a-z]+)(\d+)(?:\*([23]))?$/.exec(w);
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad module "${w}"`);
    return { uid: items.length + j + 1, def: m[1], turret: Number(m[2]), ...star(m[3]) };
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
  return d[1].map(([cost, pct, , code, vsPar]) => ({ hero, day: dd, build: decodeStandIn(hero, code), cost, pct, vsPar }))
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

/** Index (into standInPool(hero, day)) of the par: the pick nearest the middle of its window. */
export function standInParIndex(hero: HeroId, day: number): number {
  return need(hero, day, "standInPar")[0];
}

/** The par stand-in deck for (hero, day), as a fresh copy. Throws for a hero not in the pool. */
export function standInPar(hero: HeroId, day: number): Build {
  const d = need(hero, day, "standInPar");
  return decodeStandIn(hero, d[1][d[0]][3]);
}
