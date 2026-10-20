// Bundled full-purse stand-in decks for the dusk fight, days 1-10 (0.6.0c; since the 0.6.1 flip, pool v2:
// merge-aware decks whose modules carry stars, none above 2). The pool comes from
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
// Pool v2.1 (0.6.2) is that re-bake: generated on BELTSIDE with factories on, no stored deck has a rig on a belt
// tile, so the migration changes nothing; it stays as the load boundary for any older code.
//
// Build code (one string per deck): "<beltCap> <hullBonus>/<items>/<routes>/<mods>"
//   items:  space-separated <itemId><yx>[r<rot>]: the item's cell as two digits, row y then column x,
//           then (0.6.2, rigs only, never 0) its rotation. The i-th item (1-based) gets uid i.
//   routes: space-separated <factoryItemNo>:<cells>: the feeding item's 1-based number, then
//           the route's cells as concatenated two-digit yx keys, factory end first.
//   mods:   space-separated <itemId><turret>; mod uids follow the items.
//   stars:  since the 0.6.1 flip an item or module word may end in *2 or *3, its merge stars (no
//           suffix: 1 star). The loader decodes with decodeStarred, which reads a v1 code exactly
//           as decodeStandIn does.
// Example (Furnace starting deck): "14 0/kiln64/1:544434241404/"
//
// 0.6.2 step 5 (REQ-BFG-031 turret slots, REQ-BFG-027 belt joins): the star-aware code (encodeStarred /
// decodeStarred) carries Build.turrets and RouteDef.join. Both are optional, so a deck without them encodes byte for
// byte as before and every older code decodes exactly as before:
//   "<beltCap> <hullBonus>/<items>/<routes>/<mods>[/<turrets>]"
//   join:    a route word may end in ">yx", its join tile (the cell key of the main belt's tile it feeds into, as two
//            digits, row y then column x): "3:79695949>48" is item 3's belt over 79 69 59 49 into the belt tile at 48.
//   turrets: a fifth section, written only when the deck carries Build.turrets (absent = the hull's starting layout,
//            as setTurretList writes it; a list that encodes like the starting layout is not written either): one word
//            <id><slot>[*<stars>][!] per installed turret, in slot order; "!" = a free copy (it holds the hull's
//            starting copy); a slot without a word is empty. Uids: a free copy of def d takes the starting uid
//            (TURRET_UID0 + slot) of d's starting slots, in slot order; every other turret follows the mods (items
//            1..n, mods n+1..n+m, turrets n+m+1..).
//   Examples (tests/standin.turrets.test.ts decodes and validates each):
//     "14 0/kiln64/1:544434241404//scrapcannon0*2!" (FURNACE's SCRAP CANNON merged to 2 stars);
//     "14 0/kiln64 press66/1:544434241404 2:68584838281808/calibrate0 hopper1/scrapcannon0! deckgun1" (a DECK GUN bought
//       into the extra slot, fed by a STAMP PRESS belt, with a HOPPER on it);
//     "18 0/kiln64 press66 slagpot88/1:544434241404 2:68584838281808 3:79695949>48//scrapcannon0! carronade1" (a SLAG
//       POT belt joining the STAMP PRESS belt into a CARRONADE in the extra slot).
// The v1 code (encodeStandIn / decodeStandIn) carries neither: its encoder refuses a deck with turrets or joins, and
// its decoder refuses a turret section, so nothing is dropped silently.
// Step 5 M5 (REQ-BFG-033: honesty is gold spent): a caravan-bound pool's tuple carries a sixth element, spent (the gold
// the pick's run spent: deck value + rerolls + sale losses); standInPool returns it as StandInEntry.spent, and the
// cost for a pool whose tuples have five elements (the full-purse pools up to v2.1).
// BOTS-X (REQ-BFG-058; RUNES-2a 3 step 2): every code (v1 and star-aware, and the harness codec) carries Build.runes as
// the head's last word, after the levels' word (upgradeWord): "<beltCap> <hullBonus>[ u<t><f>][ r:<id>,<id>...]".
//   runes:   "r:" then the held runes' ids in pick order (Build.runes[i], taken at the dawn of day i + 1), comma-separated;
//            each id is a snapshot id (DEF_PATTERN's shape, [a-z0-9_]{1,32}; this file doesn't read the catalogue, the
//            snapshot checks' runeProblem does). E.g. "14 0 r:iron_hide,coin_purse/kiln64/1:544434241404/" and
//            "18 0 u23 r:iron_hide,coin_purse/kiln64 press66 slagpot88/1:544434241404 2:68584838281808 3:79695949>48//scrapcannon0! carronade1".
//   Written only when the deck holds a rune (absent or empty: no word), so a rune-less deck encodes byte for byte as
//   before, and every older code (no head word starts "r:") decodes exactly as before, with no runes key. The runes
//   key is the decoded build's last (after upgrades), as run.ts writes it. HULL and BELT runes stay inside
//   hullBonus / beltCap (as run.ts takeRune and runes.ts botTakeRune put them), so the code writes those as they are.
// AZ-BUMP (REQ-BFG-078, REQ-BFG-077; REVIEW-PARAZ N3, BRIEF-AZBUMP S3): a caravan pool generated with NPC_DAY on carries a
// seventh element, the pick's run's road log (roadWord: one word per day reached, "<day><tier><outcome>[s][:<drop>]",
// tier e/m/h, outcome w/l/d, "s" a sabotaged fight, e.g. "1mw:scrapcannon 2ml 3mw"), so a seed ghost drawn from the pool
// travels with it (tools/samplePool.ts) and the player-mode checks count its drops exactly as an upload's (validate.ts
// roadDropValue). standInPool returns it as StandInEntry.road. A pool generated with NPC_DAY off has no seventh element
// (its module is written exactly as before) and its entries no road.

import { GRID, HEROES, ITEMS, type HeroId, type Upgrades } from "./content";
import { TURRET_UID0, rotOf, setTurretList, startingTurrets, type Build, type BuildTurret, type ModPlacement, type Placed, type RouteDef } from "./deck";
/** bb-0.8.3 (D10): a level 1..4 (absent or below 1: 1), as stars.ts levelOf (the loader imports only ./content and ./deck). */
const levelOf = (n: number | undefined): number => (typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.min(4, Math.floor(n)) : 1);
import { logMigration, migrateInlineGates } from "./beltside";
import { logShapes, migrateShapedFactories } from "./beltside"; // SHAPES-1 (REQ-BFG-086 S6): the load migration
import { footOf, footTurns, shapesRules } from "./deck"; // SHAPES-1 (S1, S4): the switch; a shaped factory's rot (foot.ts, shapes.ts via deck.ts)
import { enchantCodeOf, enchantIdOfCode } from "./deck"; // ENCHANT-1 (REQ-BFG-085, E2): the stand-in word's two-letter codes (enchant.ts via deck.ts)
import { STAND_IN_DATA, type StandInDay } from "./standInPoolData";

/** RULES_VERSION the pool was generated (and scored) under. */
export const STAND_IN_POOL_RULES: string = STAND_IN_DATA.rules;
// FLIP-X2 step 4.5 (REQ-BFG-047): BUNDLED_POOL_HULL_SCALE deleted (NUM-1, cap's oracle bcc36c430b4f3a01, read every
// bundled deck's hullBonus x10 until the pool was regenerated in N1 units). The pool regenerated at FLIP-X2 (bb-0.9.0) is
// native N1, so standInPool, standInPick and standInPar decode it as stored.
/** Heroes with stand-in decks, in pool order. */
export const STAND_IN_POOL_HEROES: readonly HeroId[] = Object.keys(STAND_IN_DATA.pools) as HeroId[];
export const STAND_IN_POOL_DAYS = 16; // BUMP-1D: the pool holds days 1-16 (was 10; = STAND_IN_GEN_DAYS)
/** RUN-1 (REQ-BFG-059, D5): the depth the stand-in generator makes for a long run (harness/standins.ts StandInOpts.days;
 *  tools/genStandInPool.ts --days): 16, longRun.ts LONG_RUN_GEN_DAYS. A LITERAL on purpose (T2b, R1.6): this loader imports
 *  only ./content, ./deck, ./beltside and its data (tests/standInPool.gen.test.ts pins that), so it cannot import ./longRun;
 *  tests/run1.content.test.ts asserts it equals LONG_RUN_GEN_DAYS. The committed pool (standInPoolData.ts) holds
 *  STAND_IN_POOL_DAYS: 16 since BUMP-1D, which regenerated it to this depth (it was 10 before) and set STAND_IN_POOL_DAYS to it.
 *  THE RULE FOR A DAY PAST THE DEEPEST DAY THE POOL HOLDS (written down, D5; standInDay): the deepest day's plan, i.e. its
 *  decks (standInDay clamps); the dusk opponent takes the day's own hull (hullScale.ts M(d), which every carrier on the day
 *  takes, so the day-16 deck on day 19 holds M(19) of its day-1 hull), and the day's own gold and odds are the checks' and
 *  the shop's: maxGoldByDay(day) (a deck bought on day 16 is always within it), rarityWeights(day). Before BUMP-1D (until the bump)
 *  regenerated the pool, days 11-16 followed the same rule from day 10's decks. */
export const STAND_IN_GEN_DAYS = 16;

export interface StandInEntry {
  hero: HeroId;
  day: number;
  build: Build;
  cost: number; // purchase cost in gold (items, modules, belt crates, plating)
  spent: number; // step 5 M5: the gold spent to assemble the deck: a caravan pool stores it (value + rerolls + sale losses); = cost for a full-purse pool
  pct: number; // strength percentile inside its hero/day population (0-100)
  vsPar: number; // lower win rate against the day's par of both factions (0-1): the par field (par.ts parRefs) for a caravan pool, heroRefBuild for pool v2.1
  /** AZ-BUMP (REQ-BFG-078; REVIEW-PARAZ N3): the pick's run's road log, days 1..day (a caravan pool generated with NPC_DAY
   *  on; absent otherwise). */
  road?: StandInRoadEntry[];
}

/** AZ-BUMP (N3): one road log entry as the pool stores it, the shape of npcDay.ts RoadEntry (this file imports only
 *  ./content, ./deck and ./beltside, so it is declared here). */
export interface StandInRoadEntry {
  day: number;
  tier: "easy" | "medium" | "hard";
  outcome: "win" | "loss" | "draw";
  drop?: string;
  sabotaged?: true;
}

const ROAD_TIERS = { e: "easy", m: "medium", h: "hard" } as const;
const ROAD_OUTCOMES = { w: "win", l: "loss", d: "draw" } as const;
const ROAD_ENTRY = /^(\d{1,2})([emh])([wld])(s?)(?::([a-z0-9_]{1,32}))?$/;

/** AZ-BUMP (N3): a road log as the pool's seventh tuple element (see the header): one word per entry, in log order. */
export function roadWord(road: readonly StandInRoadEntry[]): string {
  return road.map((e) => `${e.day}${e.tier[0]}${e.outcome[0]}${e.sabotaged ? "s" : ""}${e.drop !== undefined ? `:${e.drop}` : ""}`).join(" ");
}

/** AZ-BUMP (N3): the road log a pool's road word writes, each entry with only the keys it has (drop, then sabotaged, as
 *  npcDay.ts roadLog writes them); "" is no entry. Refuses a word it can't read, so nothing is dropped silently. */
export function roadOfWord(word: string): StandInRoadEntry[] {
  return word.split(" ").filter(Boolean).map((w) => {
    const m = ROAD_ENTRY.exec(w);
    if (!m) throw new Error(`stand-in pool: bad road word "${w}"`);
    return {
      day: Number(m[1]), tier: ROAD_TIERS[m[2] as keyof typeof ROAD_TIERS], outcome: ROAD_OUTCOMES[m[3] as keyof typeof ROAD_OUTCOMES],
      ...(m[5] !== undefined ? { drop: m[5] } : {}), ...(m[4] ? { sabotaged: true as const } : {}),
    };
  });
}

/** Step 5 M5: a stored tuple as the loader reads it. The data module declares its own StandInTuple: five elements in a
 *  full-purse pool (v2.1), six in a caravan pool, whose sixth is the gold spent; AZ-BUMP (N3): seven in a caravan pool
 *  generated with NPC_DAY on, whose seventh is the run's road log (roadWord). */
type PoolTuple = readonly [cost: number, pct: number, score: number, build: string, vsPar: number, spent?: number, road?: string];

const cellCode = (x: number, y: number): string => `${y}${x}`;
const V1_NO_TURRETS = "stand-in code: the v1 code carries no turrets and no belt joins (use encodeStarred / decodeStarred)";

/** Encode a deck as a stand-in build code (uids are renumbered on decode). Step 5: the v1 code has no turret section
 *  and no join, so a deck with Build.turrets or a joining belt is refused (encodeStarred carries both). */
export function encodeStandIn(b: Build): string {
  if (GRID !== 10) throw new Error("stand-in build codes assume a 10x10 deck");
  if (b.turrets || b.routes.some((r) => r.join !== undefined)) throw new Error(V1_NO_TURRETS);
  if (b.items.some((p) => p.ench !== undefined)) throw new Error("stand-in code: the v1 code carries no enchantments (use encodeStarred / decodeStarred)"); // ENCHANT-1: nothing dropped silently
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
  return `${b.beltCap} ${b.hullBonus}${runeWord(b)}/${items.join(" ")}/${routes.join(" ")}/${mods.join(" ")}`; // BOTS-X: runeWord
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
  if (m.stranded.length + shapesStandIn(b)) renumber(b);
  return b;
}

/** SHAPES-1 (REQ-BFG-086 S6): with SHAPES on, a stand-in deck coded in 0.9.9's shapes re-places its GANTRY PRESS and
 *  ASSEMBLY LINE (beltside.ts migrateShapedFactories; one that fits nowhere is dropped, logged under "standin:shapes").
 *  Returns how many left the deck (0 with the switch off: nothing runs). */
function shapesStandIn(b: Build): number {
  if (!shapesRules()) return 0;
  const moves = migrateShapedFactories(b);
  logShapes("standin:shapes", moves);
  return moves.filter((v) => !v.to).length;
}

/** Items get uids 1..n in order and mods n+1.., as the code format assigns them; routes follow their factory. Step 5:
 *  turrets numbered after the mods (every one but a free copy's starting uid, TURRET_UID0 + slot) follow them. */
function renumber(b: Build): void {
  const no = new Map<number, number>();
  b.items.forEach((p, i) => {
    no.set(p.uid, i + 1);
    p.uid = i + 1;
  });
  for (const r of b.routes) r.factory = no.get(r.factory) ?? r.factory;
  b.mods.forEach((m, j) => { m.uid = b.items.length + j + 1; });
  let next = b.items.length + b.mods.length;
  for (const t of b.turrets ?? []) if (t.uid < TURRET_UID0) t.uid = ++next;
}

/** The deck exactly as its code writes it, before the D3 migration (tests, and the harness re-bake). Step 5: a code
 *  with a turret section is refused (the v1 route word already refuses a join). */
export function decodeStandInRaw(hero: HeroId, code: string): Build {
  const parts = code.split("/");
  if (parts.length > 4) throw new Error(V1_NO_TURRETS);
  const [head, itemPart, routePart, modPart] = parts;
  const [beltCap, hullBonus] = head.split(" ").map(Number);
  const [, rw] = headWords(head.split(" ").slice(2)); // BOTS-X: the runes' word (v1 reads no levels, as before)
  const words = (s: string | undefined) => (s ? s.split(" ").filter(Boolean) : []);
  const items: Placed[] = words(itemPart).map((w, i) => {
    const m = /^([a-z]+)(\d)(\d)(?:r([1-3]))?$/.exec(w);
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad item "${w}"`);
    // SHAPES-1 (REQ-BFG-086 S4): a shaped factory (one whose footprint changes when turned) carries its rot too
    if (m[4] && ITEMS[m[1]].kind !== "gate" && footTurns(footOf(ITEMS[m[1]])) === 1) throw new Error(`stand-in code: "${w}" is not a rig and can't have a rotation`);
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
  return { hero, items, routes, mods, beltCap, hullBonus, ...runesOf(rw) }; // BOTS-X: the runes, the last key
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

// ENCHANT-1 (REQ-BFG-085, E2): an enchanted piece's word ends in `~<code>` after its stars, e.g. "whetstone37r1*2~fi" (FIERY): the two
// letters of enchant.ts ENCHANT_DEFS[id].code. WIDE on a rig carries its side (the arrow's side at rotation 0, 0-3): "~wi2". GROWING
// carries its counter, the dusk fights it has been through (written only above 0): "~gr4". A turret word is
// <id><slot>[*<stars>][~<code>][!]. A word without `~` decodes exactly as before, and a piece without an enchantment encodes
// byte for byte as before. Both codecs (this and harness/standinCode.ts) share these two helpers. The counts and sides are the
// build's own fields (Placed.enchDir, Placed.grow, BuildTurret.grow); which words are legal where is validate.ts's.
export interface EnchantWordFields { ench?: string; enchDir?: number; grow?: number }

/** A piece's `~<code>[digits]` suffix, or "" for a piece without a word. Refuses a word or a number it can't write. */
export function enchantWord(p: EnchantWordFields): string {
  if (p.ench === undefined) return "";
  const code = enchantCodeOf(p.ench);
  if (code === undefined) throw new Error(`stand-in code: enchantment "${p.ench}" is not one of the eight`);
  let digits = "";
  if (p.ench === "wide" && p.enchDir !== undefined) {
    if (!Number.isInteger(p.enchDir) || p.enchDir < 0 || p.enchDir > 3) throw new Error(`stand-in code: WIDE side ${p.enchDir} is not 0-3`);
    digits = String(p.enchDir);
  }
  if (p.ench === "growing" && p.grow !== undefined && p.grow !== 0) {
    if (!Number.isInteger(p.grow) || p.grow < 1) throw new Error(`stand-in code: GROWING counter ${p.grow} is not a whole number above 0`);
    digits = String(p.grow);
  }
  return `~${code}${digits}`;
}

/** The fields a word's `~` part writes, in the canonical order (ench, enchDir, then grow): `code` the two letters, `digits` what
 *  follows them. `rig` is true for an item word (only a rig's WIDE has a side). Throws on a word it can't read. */
export function enchantOfWord(code: string | undefined, digits: string | undefined, word: string, rig: boolean): EnchantWordFields {
  if (code === undefined) return {};
  const id = enchantIdOfCode(code);
  if (id === undefined) throw new Error(`stand-in code: bad enchantment "${word}"`);
  if (digits === undefined) return { ench: id };
  if (id === "wide" && rig && /^[0-3]$/.test(digits)) return { ench: id, enchDir: Number(digits) };
  if (id === "growing" && /^[1-9][0-9]?$/.test(digits)) return { ench: id, grow: Number(digits) };
  throw new Error(`stand-in code: bad enchantment "${word}"`);
}

/** Step 5: a route's join suffix, ">yx" (empty for a belt that joins nothing). */
function joinSuffix(r: RouteDef): string {
  if (r.join === undefined) return "";
  if (!Number.isInteger(r.join) || r.join < 0 || r.join >= GRID * GRID) throw new Error(`stand-in code: route join ${r.join} is not a cell key 0..${GRID * GRID - 1}`);
  return `>${cellCode(r.join % GRID, Math.floor(r.join / GRID))}`;
}

/** Step 5: the turret words of a deck, <id><slot>[*<stars>][!] in slot order; undefined when the deck carries no
 *  Build.turrets or its words are exactly the starting layout's (then the section is not written). */
function turretWords(b: Build): string | undefined {
  if (!b.turrets) return undefined;
  const words = [...b.turrets].sort((x, y) => x.slot - y.slot).map((t) => {
    if (!/^[a-z]+$/.test(t.def)) throw new Error(`stand-in code: turret id "${t.def}" is not lowercase letters`);
    if (!Number.isInteger(t.slot) || t.slot < 0) throw new Error(`stand-in code: turret slot ${t.slot} is not a slot index`);
    return `${t.def}${t.slot}${suffix(t)}${enchantWord(t)}${t.free ? "!" : ""}`; // ENCHANT-1: `~<code>` after the stars, before `!`
  }).join(" ");
  return words === startingTurrets(b.hero).map((t) => `${t.def}${t.slot}!`).join(" ") ? undefined : words;
}

/** Step 5: the turret section's words as BuildTurret entries (uids: see the header), for setTurretList. */
function decodeTurrets(hero: HeroId, part: string, after: number): BuildTurret[] {
  const own = new Map<string, number[]>(); // def -> its starting copies' uids, slot order
  for (const t of startingTurrets(hero)) own.set(t.def, [...(own.get(t.def) ?? []), t.uid]);
  let next = after;
  return part.split(" ").filter(Boolean).map((w) => {
    const m = /^([a-z]+)(\d+)(?:\*([23]))?(?:~([a-z]{2})(\d+)?)?(!)?$/.exec(w); // ENCHANT-1: + the optional `~<code>` before `!`
    if (!m || !ITEMS[m[1]] || ITEMS[m[1]].kind !== "turret") throw new Error(`stand-in code: bad turret "${w}"`);
    const uid = (m[6] ? own.get(m[1])?.shift() : undefined) ?? ++next;
    return { slot: Number(m[2]), def: m[1], uid, ...(m[3] ? { stars: Number(m[3]) } : {}), ...(m[6] ? { free: true } : {}), ...enchantOfWord(m[4], m[5], w, false) };
  });
}

/** Encode a deck as a star-aware stand-in build code (uids are renumbered on decode). beltside-062-on-061 (P15): a
 *  rig's rotation is written as encodeStandIn writes it, before the stars. Step 5: a joining belt's word ends in
 *  ">yx" and Build.turrets is a fifth section (see the header); a deck without either encodes as before. */
export function encodeStarred(b: Build): string {
  if (GRID !== 10) throw new Error("stand-in build codes assume a 10x10 deck");
  const no = new Map<number, number>();
  const items = b.items.map((p, i) => {
    if (!/^[a-z]+$/.test(p.def)) throw new Error(`stand-in code: item id "${p.def}" is not lowercase letters`);
    no.set(p.uid, i + 1);
    const rot = rotOf(p);
    return `${p.def}${cellCode(p.x, p.y)}${rot ? `r${rot}` : ""}${suffix(p)}${enchantWord(p)}`; // ENCHANT-1: `~<code>` after the stars
  });
  const routes = b.routes.map((r) => {
    const f = no.get(r.factory);
    if (f === undefined) throw new Error(`stand-in code: route fed by unknown uid ${r.factory}`);
    return `${f}:${r.cells.map((k) => cellCode(k % GRID, Math.floor(k / GRID))).join("")}${joinSuffix(r)}`;
  });
  const mods = b.mods.map((m) => {
    if (!/^[a-z]+$/.test(m.def)) throw new Error(`stand-in code: module id "${m.def}" is not lowercase letters`);
    return `${m.def}${m.turret}${suffix(m)}`;
  });
  const turrets = turretWords(b);
  return `${b.beltCap} ${b.hullBonus}${upgradeWord(b)}${runeWord(b)}/${items.join(" ")}/${routes.join(" ")}/${mods.join(" ")}${turrets === undefined ? "" : `/${turrets}`}`; // BOTS-X: runeWord
}

/**
 * bb-0.8.3 (REQ-BFG-043 D10): a deck's gold upgrade levels as a third word of the code's head, "u<turret><factory>"
 * (e.g. "14 0 u12": TURRET SPEED level 1, FACTORY level 2); "" without levels, so a deck without them encodes byte for
 * byte as before and every older code decodes as before. The harness codec (harness/standinCode.ts) shares these.
 */
export function upgradeWord(b: Pick<Build, "upgrades">): string {
  const t = levelOf(b.upgrades?.turret), f = levelOf(b.upgrades?.factory);
  return t > 1 || f > 1 ? ` u${t}${f}` : "";
}

/** bb-0.8.3 (D10): the levels a code's third head word writes ({} for none), in the canonical key order. */
export function upgradesOf(word: string | undefined): { upgrades?: Upgrades } {
  if (word === undefined) return {};
  const m = /^u([1-4])([1-4])$/.exec(word);
  if (!m) throw new Error(`stand-in code: bad upgrade word "${word}"`);
  const t = Number(m[1]), f = Number(m[2]);
  return t > 1 || f > 1 ? { upgrades: { ...(t > 1 ? { turret: t } : {}), ...(f > 1 ? { factory: f } : {}) } } : {};
}

/** BOTS-X: a rune id's shape (src/net/snapshot.ts DEF_PATTERN; the catalogue itself is runeProblem's to check). */
const RUNE_ID = /^[a-z0-9_]{1,32}$/;
/** BOTS-X: the runes' head word starts with this. */
const RUNE_TAG = "r:";

/**
 * BOTS-X (REQ-BFG-058; RUNES-2a 3 step 2): a deck's runes as the code head's last word, " r:<id>,<id>..." in pick order
 * (see the header); "" without runes (absent or empty), so a rune-less deck encodes byte for byte as before. Refuses an
 * entry that is not exactly { id } with an id of DEF_PATTERN's shape, so nothing is dropped silently. Shared with the
 * harness codec (harness/standinCode.ts), as upgradeWord is.
 */
export function runeWord(b: Pick<Build, "runes">): string {
  if (!b.runes?.length) return "";
  return ` ${RUNE_TAG}${b.runes.map((q) => {
    if (!q || typeof q !== "object" || typeof q.id !== "string" || !RUNE_ID.test(q.id) || Object.keys(q).length !== 1) {
      throw new Error(`stand-in code: rune ${JSON.stringify(q)} is not { id } with a snapshot id`);
    }
    return q.id;
  }).join(",")}`;
}

/** BOTS-X: the runes a code's rune word writes ({} for none), each { id }, in pick order. */
export function runesOf(word: string | undefined): { runes?: { id: string }[] } {
  if (word === undefined) return {};
  const ids = word.startsWith(RUNE_TAG) ? word.slice(RUNE_TAG.length).split(",") : [];
  if (!ids.length || !ids.every((id) => RUNE_ID.test(id))) throw new Error(`stand-in code: bad rune word "${word}"`);
  return { runes: ids.map((id) => ({ id })) };
}

/**
 * BOTS-X: a code head's words after "<beltCap> <hullBonus>" as [the levels' word, the runes' word], each undefined when
 * absent. The runes' word is the last word when it starts "r:"; the levels' word is the first of the others, as before
 * (so every older head reads exactly as before, and a runes word before the levels' word is refused by upgradesOf).
 */
export function headWords(more: readonly string[]): [up: string | undefined, runes: string | undefined] {
  const last = more.length - 1;
  if (last < 0 || !more[last].startsWith(RUNE_TAG)) return [more[0], undefined];
  return [last > 0 ? more[0] : undefined, more[last]];
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
  if (m.stranded.length + shapesStandIn(b)) renumber(b);
  return b;
}

/** The star-aware deck exactly as its code writes it, before the D3 migration (0.6.1g's decodeStarred body; P15: the
 *  item word takes BELTSIDE's rotation, rigs only and never 0, before the stars). Step 5: a route word's ">yx" join
 *  and the turret section (see the header), set through setTurretList (so the starting layout leaves no field). */
export function decodeStarredRaw(hero: HeroId, code: string): Build {
  const parts = code.split("/");
  if (parts.length > 5) throw new Error(`stand-in code: more than five sections in "${code}"`);
  const [head, itemPart, routePart, modPart, turretPart] = parts;
  const [bc, hb, ...more] = head.split(" "), beltCap = Number(bc), hullBonus = Number(hb);
  const [up, rw] = headWords(more); // bb-0.8.3: `up`, the levels; BOTS-X: `rw`, the runes (the head's last word)
  const words = (s: string | undefined) => (s ? s.split(" ").filter(Boolean) : []);
  const star = (s: string | undefined) => (s ? { stars: Number(s) } : {});
  const items: Placed[] = words(itemPart).map((w, i) => {
    const m = /^([a-z]+)(\d)(\d)(?:r([1-3]))?(?:\*([23]))?(?:~([a-z]{2})(\d+)?)?$/.exec(w); // ENCHANT-1: + the optional `~<code>[digits]` after the stars
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad item "${w}"`);
    // SHAPES-1 (REQ-BFG-086 S4): a shaped factory (one whose footprint changes when turned) carries its rot too
    if (m[4] && ITEMS[m[1]].kind !== "gate" && footTurns(footOf(ITEMS[m[1]])) === 1) throw new Error(`stand-in code: "${w}" is not a rig and can't have a rotation`);
    return { uid: i + 1, def: m[1], x: Number(m[3]), y: Number(m[2]), ...(m[4] ? { rot: Number(m[4]) } : {}), ...star(m[5]), ...enchantOfWord(m[6], m[7], w, ITEMS[m[1]].kind === "gate") };
  });
  const routes: RouteDef[] = words(routePart).map((w) => {
    const m = /^(\d+):((?:\d\d)+)(?:>(\d)(\d))?$/.exec(w);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > items.length) throw new Error(`stand-in code: bad route "${w}"`);
    const cells: number[] = [];
    for (let i = 0; i < m[2].length; i += 2) cells.push(Number(m[2][i]) * GRID + Number(m[2][i + 1]));
    return { factory: Number(m[1]), cells, ...(m[3] ? { join: Number(m[3]) * GRID + Number(m[4]) } : {}) };
  });
  const mods: ModPlacement[] = words(modPart).map((w, j) => {
    const m = /^([a-z]+)(\d+)(?:\*([23]))?$/.exec(w);
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad module "${w}"`);
    return { uid: items.length + j + 1, def: m[1], turret: Number(m[2]), ...star(m[3]) };
  });
  if (!HEROES[hero]) throw new Error(`stand-in code: unknown hero "${hero}"`);
  const b: Build = { hero, items, routes, mods, beltCap, hullBonus };
  if (turretPart !== undefined) setTurretList(b, decodeTurrets(hero, turretPart, items.length + mods.length));
  return Object.assign(b, upgradesOf(up), runesOf(rw)); // bb-0.8.3 (D10): the levels; BOTS-X: then the runes, the last key
}

/** Clamp a day into 1..STAND_IN_POOL_DAYS (the deepest day the pool holds: 10 now, STAND_IN_GEN_DAYS after the release bump
 *  regenerates it; RUN-1's rule for a later day is written at STAND_IN_GEN_DAYS: that day's decks). */
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
  const entries: readonly PoolTuple[] = d[1];
  // AZ-BUMP (N3): a seventh element, the run's road log, when the pool has one
  return entries.map(([cost, pct, , code, vsPar, spent, road]) => ({ hero, day: dd, build: decodeStarred(hero, code), cost, spent: spent ?? cost, pct, vsPar, ...(road !== undefined ? { road: roadOfWord(road) } : {}) }))
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
  return decodeStarred(hero, d[1][standInPickIndex(hero, day, seed)][3]);
}

/** Index (into standInPool(hero, day)) of the par: the pick nearest the middle of its window. */
export function standInParIndex(hero: HeroId, day: number): number {
  return need(hero, day, "standInPar")[0];
}

/** The par stand-in deck for (hero, day), as a fresh copy. Throws for a hero not in the pool. */
export function standInPar(hero: HeroId, day: number): Build {
  const d = need(hero, day, "standInPar");
  return decodeStarred(hero, d[1][d[0]][3]);
}
