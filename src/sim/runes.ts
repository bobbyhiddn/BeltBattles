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
  | "startPlate" | "heatPct" | "startFray" | "frayHit";

/** The unit each kind's amount carries (a test pins every rune to it). */
export const KIND_UNIT: Record<RuneKind, RuneUnit> = {
  hull: "hull", belt: "belt", dawnGold: "gold", shotDmg: "dmg", firstShotDmg: "dmg", pairDmg: "dmg", turretRate: "pct",
  factoryRate: "pct", startPlate: "plate", heatPct: "pct", startFray: "count", frayHit: "count",
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
  r("hair_trigger", "HAIR TRIGGER", "rare", "turrets", "turretRate", 50, "YOUR TURRETS: +{N} {RATE}."), // M5: +25% measured +4.5 (supply-bound)
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
}

export function runeMods(runes: readonly RuneHeld[] | undefined): RuneMods | undefined {
  const list = held(runes);
  if (!list.length) return undefined;
  const m: RuneMods = { shotDmg: 0, firstShotDmg: 0, pairDmg: 0, turretRate: 0, factoryRate: 0, startPlate: 0, heatPct: 0, startFray: 0, frayHit: 0 };
  for (const d of list) {
    if (d.kind === "hull" || d.kind === "belt" || d.kind === "dawnGold") continue; // the run's, not the battle's
    m[d.kind] += d.amount.n;
  }
  return m;
}
