// RUNES-1 (REQ-BFG-058): the rune system. One rune at every dawn, before the shop: pick 1 of 3 on days 1-4 and 1 of 2
// from day 5, free, no skip, no rerolls (the operator's cadence; R1b-2 calls 2 and 3). All cards of a dawn share one
// tier, drawn from TIER_ODDS by day; inside the tier a weighted draw without replacement (own hero's style x3, generic
// themes x2, other heroes' styles x1), never a held rune, never two cards of one theme (relaxed deterministically when it
// can't be met), and at least one card that fits the hero (FIX-10). A run keeps every rune it takes, in pick order:
// Build.runes[i] was taken at the dawn of day i + 1.
//
// UNITS: every amount below is typed by unit (RuneAmount.unit: dmg, hull, plate, gold, belt, pct, count) and written in
// TODAY's units (bb-0.8.6/0.8.7, before N1's NUMBERS job). The NUMBERS job (N1's NUM-1: damage-family values x10) scales
// this file by script with everything else: multiply every amount whose unit is dmg, hull or plate by 10; gold, belt,
// pct and count stay. No rune text holds a literal number: src/ui/runeText.ts fills {N} from the typed amount through
// one formatter per unit, and tests/runes.system.test.ts asserts every number in every rune text is whole.
//
// DETERMINISM: offers draw on their own stream, hashSeed(seed, "rune", day), never the shop's; the battle seed is
// unchanged; rune effects (runeMods, read by src/sim/battle.ts) use no RNG. The server re-derives every offer from the
// snapshot's seed (runeProblem), so this file is shared, pure and dependency-light (no DOM).

import { hashSeed, Rng } from "../core/rng";
import { HEROES, RARITIES, type HeroId, type Rarity } from "./content";

export type RuneUnit = "dmg" | "hull" | "plate" | "gold" | "belt" | "pct" | "count";
/** One typed amount. NUM-1 multiplies `n` by 10 where `unit` is dmg, hull or plate (see the header). */
export interface RuneAmount {
  unit: RuneUnit;
  n: number;
}

/** R1b-2 1.3's themes: the four hero styles, then the generic ones. */
export type RuneTheme = "furnace" | "weaver" | "foundry" | "bastion" | "belts" | "factories" | "turrets" | "gold" | "armor";
export const STYLE_THEMES: readonly RuneTheme[] = ["furnace", "weaver", "foundry", "bastion"];
export const GENERIC_THEMES: readonly RuneTheme[] = ["belts", "factories", "turrets", "gold", "armor"];
/** A playable hero's own style theme (the NPC races have none: every style weighs 1 for them). */
export const HERO_STYLE: Partial<Record<HeroId, RuneTheme>> = { furnace: "furnace", weaver: "weaver", foundry: "foundry", bastion: "bastion" };

/**
 * What a rune does (one stat each; runeMods and runeGrants read it):
 * - hull, belt: added to Build.hullBonus / Build.beltCap when taken (R1b's "text-only": the existing fields do the work,
 *   so the battle, the editor and the hull read-outs need nothing new); validate.ts takes them back out of the budget.
 * - dawnGold: gold at the dawn it is taken and at every later dawn (validate.ts adds it to the gold budget).
 * - shotDmg: every shot your turrets fire. firstShotDmg: each turret's first shot of a battle. pairDmg: a PAIR shot (a
 *   fused FOUNDRY load).
 * - turretRate, factoryRate: a whole % faster (the interval / (1 + pct/100); a factory's pace x (1 + pct/100)).
 * - startPlate: PLATE on your hull at the battle's start (PLATE_CAP holds). heatPct: HEAT your slugs gain, +pct%.
 * - startFray: FRAY on the FOE's hull at the battle's start. frayHit: +count FRAY on each of your hits that adds FRAY.
 */
export type RuneKind =
  | "hull" | "belt" | "dawnGold" | "shotDmg" | "firstShotDmg" | "pairDmg" | "turretRate" | "factoryRate"
  | "startPlate" | "heatPct" | "startFray" | "frayHit"
  // RUNES-2a: HAIR TRIGGER's new form (turrets and factories)
  | "allRate";

/** The unit each kind's amount carries (a test pins every rune to it). */
export const KIND_UNIT: Record<RuneKind, RuneUnit> = {
  hull: "hull", belt: "belt", dawnGold: "gold", shotDmg: "dmg", firstShotDmg: "dmg", pairDmg: "dmg", turretRate: "pct",
  factoryRate: "pct", startPlate: "plate", heatPct: "pct", startFray: "count", frayHit: "count",
  allRate: "pct",
};

export interface RuneDef {
  id: string; // DEF_PATTERN-safe (the snapshot carries it)
  name: string; // 14 characters at most (the card's name line)
  tier: Rarity;
  theme: RuneTheme;
  kind: RuneKind;
  amount: RuneAmount;
  /** The one-line effect with R1b's {NAME} tokens and {N} for the amount (runeText.ts renders it). Never a literal number. */
  text: string;
}

const r = (id: string, name: string, tier: Rarity, theme: RuneTheme, kind: RuneKind, n: number, text: string): RuneDef =>
  ({ id, name, tier, theme, kind, amount: { unit: KIND_UNIT[kind], n }, text });

/**
 * The catalogue in this rules version, in catalogue order (the offer draw walks it in this order, so an edit moves
 * offers: tests/runes.snapshot.test.ts pins a few). RUNES-1 ships the commons and simple rares of R1b-2's catalogue in
 * today's units (R1b-2 wrote N1's: DMG, HULL and PLATE divided by 10 here); RUNES-2 and RUNES-3 add the rest.
 */
export const RUNE_LIST: readonly RuneDef[] = [
  // ---- common
  r("iron_skin", "IRON SKIN", "common", "armor", "hull", 15, "+{N} {HULL}."),
  r("tar_barrel", "TAR BARREL", "common", "belts", "belt", 8, "+{N} {BELT}."),
  r("coin_purse", "COIN PURSE", "common", "gold", "dawnGold", 1, "AT DAWN: +{N} {GOLD}."),
  r("sharp_scrap", "SHARP SCRAP", "common", "turrets", "firstShotDmg", 5, "EACH TURRET'S FIRST SHOT: +{N} {DMG}."),
  r("gun_oil", "GUN OIL", "common", "turrets", "turretRate", 15, "YOUR TURRETS: +{N} {RATE}."), // M5 bench: +10% measured +2.9
  r("oiled_cogs", "OILED COGS", "common", "factories", "factoryRate", 5, "YOUR FACTORIES: +{N} {RATE}."), // M5: +10% measured +7.2 (rare)
  r("rivet_hoard", "RIVET HOARD", "common", "bastion", "startPlate", 6, "START EACH BATTLE WITH {N} {*PLATE}."),
  r("twin_nails", "TWIN NAILS", "common", "foundry", "pairDmg", 2, "YOUR {*PAIR} SHOTS: +{N} {DMG}."),
  r("coal_chute", "COAL CHUTE", "common", "furnace", "heatPct", 25, "YOUR {*HEAT}: +{N}."),
  r("loose_thread", "LOOSE THREAD", "common", "weaver", "startFray", 3, "BATTLE START: THE FOE HAS {N} {*FRAY}."),
  // ---- rare
  r("spare_hull", "SPARE HULL", "rare", "armor", "hull", 30, "+{N} {HULL}."),
  r("pitch_wagon", "PITCH WAGON", "rare", "belts", "belt", 16, "+{N} {BELT}."),
  r("fat_purse", "FAT PURSE", "rare", "gold", "dawnGold", 2, "AT DAWN: +{N} {GOLD}."),
  r("war_edge", "WAR EDGE", "rare", "turrets", "shotDmg", 1, "YOUR SHOTS: +{N} {DMG}."),
  // RUNES-2a (Q6, cap's call): turrets AND factories, so the turrets get the loads to fire faster (RUNES-1's +50% turret
  // RATE measured +5.6, under the rare band: supply-bound); N benched into the rare band (+6 to +10)
  r("hair_trigger", "HAIR TRIGGER", "rare", "turrets", "allRate", 8, "YOUR TURRETS AND FACTORIES: +{N} {RATE}."),
  r("stoked_fires", "STOKED FIRES", "rare", "factories", "factoryRate", 15, "YOUR FACTORIES: +{N} {RATE}."), // M5: R1b's +25% measured +13.2 (epic)
  r("grave_plates", "GRAVE PLATES", "rare", "bastion", "startPlate", 12, "START EACH BATTLE WITH {N} {*PLATE}."),
  r("molten_bond", "MOLTEN BOND", "rare", "foundry", "pairDmg", 4, "YOUR {*PAIR} SHOTS: +{N} {DMG}."),
  r("heat_sink", "HEAT SINK", "rare", "furnace", "heatPct", 50, "YOUR {*HEAT}: +{N}."),
  r("double_knot", "DOUBLE KNOT", "rare", "weaver", "frayHit", 1, "YOUR {*FRAY} HITS: +{N} {*FRAY}."),
  r("tangle_wire", "TANGLE WIRE", "rare", "weaver", "startFray", 6, "BATTLE START: THE FOE HAS {N} {*FRAY}."),
];

export const RUNES: Readonly<Record<string, RuneDef>> = Object.fromEntries(RUNE_LIST.map((d) => [d.id, d]));

/** A rune is in this rules version's catalogue. */
export const isRune = (id: unknown): id is string => typeof id === "string" && Object.prototype.hasOwnProperty.call(RUNES, id);

/** One held rune as the build carries it (snapshot v3 Build.runes[i]): its id. R1b-2's counter `n` belongs to GROW-1. */
export interface RuneHeld {
  id: string;
}

// ---- the offer -------------------------------------------------------------------------------------------------------

/** R1b-2 1.1: the tier of a dawn, by day (percent; each row sums to 100). Day 14 and later (and ENDLESS) use the last row. */
export const TIER_ODDS: readonly (readonly [number, number, number, number])[] = [
  [100, 0, 0, 0], [75, 25, 0, 0], [55, 40, 5, 0], [40, 45, 15, 0], [30, 45, 22, 3], [20, 45, 30, 5], [15, 40, 37, 8],
  [10, 38, 42, 10], [5, 35, 48, 12], [0, 33, 52, 15], [0, 28, 54, 18], [0, 24, 56, 20], [0, 20, 58, 22], [0, 15, 60, 25],
];

export function tierOdds(day: number): Record<Rarity, number> {
  const row = TIER_ODDS[Math.max(0, Math.min(TIER_ODDS.length - 1, Math.floor(day) - 1))];
  return { common: row[0], rare: row[1], epic: row[2], legendary: row[3] };
}

/** Cards in the dawn's offer: 3 on days 1-4, 2 from day 5 (the operator's). */
export const offerSize = (day: number): number => (day <= 4 ? 3 : 2);

/** The draw's weight: the hero's own style x3, a generic theme x2, another hero's style x1. */
export function runeWeight(d: RuneDef, hero: HeroId): number {
  if (GENERIC_THEMES.includes(d.theme)) return 2;
  return HERO_STYLE[hero] === d.theme ? 3 : 1;
}

/** FIX-10: a card fits the hero when its theme is the hero's style or a generic one (every board has turrets, factories,
 *  belts, a hull and gold). The server can't see the board a past dawn saw, so the offer reads no board. */
export const runeFits = (d: RuneDef, hero: HeroId): boolean => GENERIC_THEMES.includes(d.theme) || HERO_STYLE[hero] === d.theme;

export interface RuneOffer {
  day: number;
  /** The tier the dawn shows (after the fallback; `drawn` is the tier the odds gave). */
  tier: Rarity;
  drawn: Rarity;
  ids: string[];
}

/**
 * The offer at the dawn of `day` for a run with `seed` and `hero` that holds `held` (ids, in pick order). Pure and
 * deterministic: the same arguments give the same offer on the client, the server and in a test.
 * 1. The tier: one weighted draw on TIER_ODDS(day).
 * 2. The tier fallback (while the catalogue has no epic or legendary runes): the drawn tier, then each lower tier, then
 *    each higher one; the first with at least offerSize(day) runes not held. If none has enough, the tier with the most
 *    (the offer is then smaller); with none at all, an empty offer.
 * 3. The cards: weighted draws without replacement inside the tier (runeWeight), each among the runes whose theme no
 *    card has yet; when none is left, among all the tier's runes left (the theme rule relaxed, deterministically).
 * 4. FIX-10: if no card fits the hero (runeFits), the last card is redrawn among the fitting runes left whose theme no
 *    other card has (then among all fitting runes left); with none, the offer stands.
 */
export function runeOffer(seed: number, day: number, hero: HeroId, held: readonly string[]): RuneOffer {
  const rng = new Rng(hashSeed(seed >>> 0, "rune", day));
  const size = offerSize(day);
  const odds = tierOdds(day);
  const drawn = rng.weighted(RARITIES, (t) => odds[t]);
  const left = (t: Rarity) => RUNE_LIST.filter((d) => d.tier === t && !held.includes(d.id));
  const at = RARITIES.indexOf(drawn);
  const order = [...RARITIES.slice(0, at + 1).reverse(), ...RARITIES.slice(at + 1)];
  let tier = order.find((t) => left(t).length >= size);
  if (!tier) {
    let most = 0;
    for (const t of order) if (left(t).length > most) { most = left(t).length; tier = t; }
  }
  if (!tier) return { day, tier: drawn, drawn, ids: [] };
  let pool = left(tier);
  const cards: RuneDef[] = [];
  while (cards.length < size && pool.length) {
    const fresh = pool.filter((d) => !cards.some((c) => c.theme === d.theme));
    const pick = rng.weighted(fresh.length ? fresh : pool, (d) => runeWeight(d, hero));
    cards.push(pick);
    pool = pool.filter((d) => d !== pick);
  }
  if (cards.length && !cards.some((c) => runeFits(c, hero))) {
    const others = cards.slice(0, -1);
    const fitting = pool.filter((d) => runeFits(d, hero));
    const fresh = fitting.filter((d) => !others.some((c) => c.theme === d.theme));
    if (fitting.length) cards[cards.length - 1] = rng.weighted(fresh.length ? fresh : fitting, (d) => runeWeight(d, hero));
  }
  return { day, tier, drawn, ids: cards.map((c) => c.id) };
}

// ---- the check (both sides: src/game/ghostSnapshot.ts isSnapshot and src/net/validate.ts validateBuild) --------------

/**
 * Why a build's runes are illegal at `day` for `hero`, or null. Shared by the client's snapshot check and the server's
 * validateBuild (R1b-2 4.2), so both refuse exactly the same runes:
 * - at most `day` runes. Not `=== day` yet: bots, stand-ins and captains hold no runes until RUNES-2 regenerates the
 *   pool, and a run saved before runes takes none. RUNES-2 tightens it to one rune per dawn exactly.
 * - each entry is exactly { id } (GROW-1's counter `n` is not in this rules version yet), each id is in the catalogue,
 *   and no id appears twice;
 * - when `seed` is known (the uploader's snapshot; served ghosts carry none, FIX-6): runes[i] was in
 *   runeOffer(seed, i + 1, hero, the runes before it).
 */
export function runeProblem(runes: unknown, day: number, hero: HeroId, seed?: number): string | null {
  if (runes === undefined) return null;
  if (!Array.isArray(runes)) return "runes: expected a list";
  if (runes.length > day) return `runes: ${runes.length} held on day ${day}, at most one a dawn`;
  const held: string[] = [];
  for (let i = 0; i < runes.length; i++) {
    const q = runes[i] as Record<string, unknown> | null;
    if (!q || typeof q !== "object" || Array.isArray(q)) return `runes[${i}]: expected { id }`;
    const extra = Object.keys(q).find((k) => k !== "id");
    if (extra !== undefined) return `runes[${i}].${extra}: not in this rules version`;
    if (!isRune(q.id)) return `runes[${i}]: unknown rune ${JSON.stringify(q.id)}`;
    if (held.includes(q.id)) return `runes[${i}]: ${RUNES[q.id].name} is held twice`;
    if (seed !== undefined && !runeOffer(seed, i + 1, hero, held).ids.includes(q.id)) {
      return `runes[${i}]: ${RUNES[q.id].name} was not offered at the dawn of day ${i + 1}`;
    }
    held.push(q.id);
  }
  return null;
}

/** HEROES' ids, for the tests and the bench. */
export const RUNE_HEROES = Object.keys(HEROES) as HeroId[];

// ---- what runes give: the run (grants) and the battle (mods) ---------------------------------------------------------

const held = (runes: readonly RuneHeld[] | undefined): RuneDef[] =>
  (runes ?? []).map((q) => (q && isRune(q.id) ? RUNES[q.id] : undefined)).filter((d): d is RuneDef => !!d);

export interface RuneGrants {
  hull: number; // in Build.hullBonus (validate.ts takes it out of the bought hull)
  belt: number; // in Build.beltCap (validate.ts takes it out of the bought belt)
  gold: number; // the dawn gold received by `day`'s dusk (validate.ts adds it to the budget)
}

/** What `runes` (in pick order: rune i taken at the dawn of day i + 1) have put on the build and into the purse by the
 *  dusk of `day`. A dawn-gold rune pays at the dawn it is taken and at every later dawn: (day - i) times. */
export function runeGrants(runes: readonly RuneHeld[] | undefined, day: number): RuneGrants {
  const g: RuneGrants = { hull: 0, belt: 0, gold: 0 };
  (runes ?? []).forEach((q, i) => {
    const d = q && isRune(q.id) ? RUNES[q.id] : undefined;
    if (!d) return;
    if (d.kind === "hull") g.hull += d.amount.n;
    else if (d.kind === "belt") g.belt += d.amount.n;
    else if (d.kind === "dawnGold") g.gold += d.amount.n * Math.max(0, day - i);
  });
  return g;
}

/** The gold the held dawn-gold runes pay at one dawn. */
export const dawnGold = (runes: readonly RuneHeld[] | undefined): number =>
  held(runes).reduce((s, d) => s + (d.kind === "dawnGold" ? d.amount.n : 0), 0);

/** What one side's runes do in a battle (src/sim/battle.ts). Absent for a build without runes, so a rune-less battle
 *  runs exactly as before (tests/runes.parity.test.ts). */
export interface RuneMods {
  shotDmg: number;
  firstShotDmg: number;
  pairDmg: number;
  turretRate: number; // pct
  factoryRate: number; // pct
  startPlate: number;
  heatPct: number;
  startFray: number; // on the foe's hull
  frayHit: number;
  allRate: number; // pct, RUNES-2a: turrets and factories (HAIR TRIGGER)
}

export function runeMods(runes: readonly RuneHeld[] | undefined): RuneMods | undefined {
  const list = held(runes);
  if (!list.length) return undefined;
  const m: RuneMods = { shotDmg: 0, firstShotDmg: 0, pairDmg: 0, turretRate: 0, factoryRate: 0, startPlate: 0, heatPct: 0, startFray: 0, frayHit: 0, allRate: 0 };
  for (const d of list) {
    if (d.kind === "hull" || d.kind === "belt" || d.kind === "dawnGold") continue; // the run's, not the battle's
    m[d.kind] += d.amount.n;
  }
  return m;
}

// ---- RUNES-2a (REQ-BFG-058, R1b-2 1.6): the bots' rune picker --------------------------------------------------------
// The bots (the par player, and through it the caravan stand-ins and the seed pool's race ghosts; the captains' pinned
// lists, tools/genCaptainRunes.ts) take a rune at every dawn as a player does: the offer is runeOffer on the run's own
// seed, so a bot only ever holds offered runes and passes runeProblem with that seed by construction. The pick reads the
// bot's board, never an RNG. Behind ONE switch, BOT_RUNES, off in this rules version: every pinned pool, stand-in and
// golden stays byte-identical; RUNES-2b turns it on and regenerates. This section's imports sit here, not at the head, so
// it and the catalogue above are edited apart (ES imports hoist; deck.ts never imports this file).

import { AMMO, ITEMS, type ItemLevel } from "./content";
import { turretList, type Build } from "./deck";

/** THE switch for the bots' runes (RUNES-2a decision 5). Every bot call site reads `opts.botRunes ?? BOT_RUNES`, so a
 *  test turns it on without editing it. Off: no bot takes a rune, and nothing a bot plays moves. */
export const BOT_RUNES: boolean = false;

type Spec = Pick<ItemLevel, "gate" | "factory" | "mod" | "core">;

/** A piece's specs at its stars: its 1-star spec, then its ★2 and ★3 levels (a keyword a star adds counts too). A
 *  signature factory has no stars (its levels are its FACTORY upgrade's), so it reads its 1-star spec. */
function specsAt(def: string, stars: number | undefined): Spec[] {
  const d = ITEMS[def];
  if (!d) return [];
  const s = stars ?? 1, l2 = d.levels?.[2], l3 = d.levels?.[3], out: Spec[] = [d];
  if (s >= 2 && l2) out.push(l2);
  if (s >= 3 && l3) out.push(l3);
  return out;
}

const ammoOf = (s: Spec) => (s.factory?.ammo ? AMMO[s.factory.ammo] : undefined);

/** Which specs read each hero style's keyword (the style runes' HEAT, FRAY, PAIR and PLATE). */
const STYLE_READS: Readonly<Record<"furnace" | "weaver" | "foundry" | "bastion", (s: Spec) => boolean>> = {
  // HEAT: a rig that heats what it hits (HEAT JACKET), or a factory whose slugs heat up as they ride (the KILN's cinder)
  furnace: (s) => !!s.gate?.heat || (ammoOf(s)?.rideScale ?? 0) > 0,
  // FRAY: a rig that adds FRAY, or a factory whose slugs fray (the LOOM's thread)
  weaver: (s) => !!s.gate?.fray || (ammoOf(s)?.fray ?? 0) > 0,
  // PAIR: a pour (the CRUCIBLE, TWIN MOULD), a matched or latched belt (TWIN GAUGE, TWIN LATCH), pair gear (TWIN TRIGGER, SEAM WELDER)
  foundry: (s) => !!(s.factory?.pour || s.factory?.twin || s.gate?.gauge || s.gate?.latch || s.mod?.pairBonus || s.mod?.seam),
  // PLATE: what makes or reads PLATING (PLATE ROLLER, SHIELD WALL, PLATE BREAKER, BRACE FRAME, ARMOR PRESS, SEAM WELDER,
  // ANVIL and STEAM BREECH), or the WARDWORKS' bulwark slug (it plates the hull as it loads)
  bastion: (s) => !!(s.gate?.plate || s.gate?.plated || s.gate?.breaker || s.gate?.brace || s.factory?.plate || s.mod?.seam
    || s.core?.perPlate || s.core?.steamPlated) || s.factory?.ammo === "bulwark",
};

/** The hull one ARMOR PACK adds (the smallest hull supply): "armor" counts the bought hull in packs. */
const HULL_PACK = Math.min(...Object.values(ITEMS).map((d) => ((d.supply?.hull ?? 0) > 0 ? d.supply!.hull! : Infinity)));

/**
 * How many pieces on `board` a rune theme matches (the bots' picker, step 2). Exactly:
 * - "factories": each factory on the deck (the signature factory included);
 * - "turrets": each installed turret (turretList: the starting copies included) and each gear and core on one;
 * - "belts": each rig and each belt (Build.routes);
 * - "armor": the bought hull in ARMOR PACKs: floor((hullBonus - the held runes' HULL) / HULL_PACK);
 * - "furnace", "weaver", "foundry", "bastion": each piece (rig, factory, gear, core, turret) whose spec at its stars reads
 *   the style's keyword (STYLE_READS: HEAT, FRAY, PAIR, PLATE). A piece may count for several themes (the KILN: factories
 *   and furnace);
 * - "stars" (should the catalogue grow that theme): each ★2 or ★3 piece;
 * - "gold", and any theme this switch doesn't know: 0.
 * Held runes never count (FIX-10's rule): only what is on the board.
 */
export function boardThemeCount(theme: RuneTheme, board: Build): number {
  const kind = (p: { def: string }) => ITEMS[p.def]?.kind;
  const pieces = (): { def: string; stars?: number }[] => [...board.items, ...board.mods, ...turretList(board)];
  switch (theme as string) {
    case "factories": return board.items.filter((p) => kind(p) === "factory").length;
    case "turrets": return turretList(board).length + board.mods.length;
    case "belts": return board.items.filter((p) => kind(p) === "gate").length + board.routes.length;
    case "armor": return Number.isFinite(HULL_PACK) ? Math.max(0, Math.floor((board.hullBonus - runeGrants(board.runes, 0).hull) / HULL_PACK)) : 0;
    case "furnace": case "weaver": case "foundry": case "bastion": {
      const reads = STYLE_READS[theme as keyof typeof STYLE_READS];
      return pieces().filter((p) => specsAt(p.def, p.stars).some(reads)).length;
    }
    case "stars": return pieces().filter((p) => (p.stars ?? 1) >= 2).length;
    default: return 0;
  }
}

/**
 * The bots' pick from a dawn's offer (R1b-2 1.6): the first of
 * 1. an offered rune of the hero's style (HERO_STYLE; the NPC races have none);
 * 2. else the offered rune whose theme matches the most pieces on `board` (boardThemeCount);
 * 3. else (no offered theme matches a piece) catalogue order.
 * Every tie goes by catalogue order (RUNE_LIST), so the pick never depends on the offer's card order. No RNG. Null for an
 * empty offer. Works for any catalogue: a theme boardThemeCount doesn't know counts 0.
 */
export function botRunePick(offer: RuneOffer | readonly string[], hero: HeroId, board: Build): string | null {
  const ids: readonly string[] = "ids" in offer ? offer.ids : offer;
  const cards = RUNE_LIST.filter((d) => ids.includes(d.id));
  if (!cards.length) return null;
  const own = HERO_STYLE[hero];
  const mine = cards.find((d) => d.theme === own);
  if (mine) return mine.id;
  let best = cards[0], most = boardThemeCount(best.theme, board);
  for (const d of cards.slice(1)) {
    const n = boardThemeCount(d.theme, board);
    if (n > most) {
      best = d;
      most = n;
    }
  }
  return best.id;
}

/** A bot's dawn pick: the rune it took and the gold that rune pays at this dawn (the bot's purse). */
export interface BotRune {
  id: string;
  gold: number;
}

/**
 * A bot's rune at the dawn of `day` (only when `on`, default BOT_RUNES): botRunePick(runeOffer(seed, day, hero, held),
 * hero, build), applied as src/game/run.ts takeRune applies a player's pick: { id } joins build.runes (pick order), a HULL
 * rune adds to build.hullBonus and a BELT rune to build.beltCap at once (through runeGrants, the budget's own reading),
 * and a dawn-gold rune's gold for this dawn comes back in `gold` for the caller's purse. Held dawn-gold runes pay at every
 * later dawn as a run's do (day.ts finishDay's runeDawn, or dawnGold(build.runes) for a bot without a Run). `seed` is the
 * run seed (run.seed, the one a snapshot carries). Null, the build untouched, when off, when the build missed a dawn
 * (runes.length !== day - 1: one rune a dawn from day 1, as runeDawn owes a pick) or when the offer is empty.
 */
export function botTakeRune(build: Build, seed: number, day: number, hero: HeroId = build.hero, on: boolean = BOT_RUNES): BotRune | null {
  if (!on) return null;
  const ids = (build.runes ?? []).map((q) => q.id);
  if (ids.length !== day - 1) return null;
  const id = botRunePick(runeOffer(seed, day, hero, ids), hero, build);
  if (id === null) return null;
  const before = runeGrants(build.runes, day);
  build.runes = [...(build.runes ?? []), { id }];
  const after = runeGrants(build.runes, day);
  build.hullBonus += after.hull - before.hull;
  build.beltCap += after.belt - before.belt;
  return { id, gold: after.gold - before.gold };
}

/**
 * The bots' picks at the dawns of days 1..days on a board by day, with no purse (R1b-2 1.6's captains: a named build by
 * day; tools/genCaptainRunes.ts). Day d reads boardOf(d) and runeOffer(seed, d, hero, the picks before it), so the list
 * passes runeProblem(list, days, hero, seed) by construction. It stops at an empty offer.
 */
export function botRuneList(seed: number, hero: HeroId, boardOf: (day: number) => Build, days: number): string[] {
  const picks: string[] = [];
  for (let day = 1; day <= days; day++) {
    const id = botRunePick(runeOffer(seed, day, hero, picks), hero, boardOf(day));
    if (id === null) break;
    picks.push(id);
  }
  return picks;
}
