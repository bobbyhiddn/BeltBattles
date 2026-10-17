// LC-1 (REQ-BFG-073): LAST CHANCE. Once a run, a dusk loss that leaves the player on exactly LAST_CHANCE_AT (1) life on a
// day before RUN_DAYS gives LAST_CHANCE_LIVES (1) back at once (1 -> 2), and the player picks one of three free cards: a
// seeded epic RUNE that fits the hero, a seeded epic PART (to cargo, at 1 star) or +LAST_CHANCE_HULL max hull. A win or a
// draw never fires it, nor a loss on day 10 (the run completes anyway), nor a second loss to 1 life.
//
// Z-BUMP (REQ-BFG-073, release Z): LAST CHANCE is the game's rule. The switch LC-1 built it behind (LAST_CHANCE,
// lastChanceRules(), setLastChance, withLastChance) is deleted with its off paths, as Y7b2 flipped STAR_RULES. What reads a
// STORED record (the snapshot decoder, validateUpload given a snapshot's rules, ghosts:admin revalidate, the ghost probe,
// the record model) asks the record's rules through the rules gate instead (rulesGate.ts LAST_CHANCE_RULES,
// lastChanceGateProblem), so a record played under older rules is read by those rules, without LAST CHANCE.
//
// THE OFFER is a pure function of (run seed, LAST CHANCE day, hero, runes held at that moment), drawn on its own stream,
// hashSeed(seed, "lastchance", day): never the shop's, the rune's, the road's or an event's, so a run that never fires it
// draws exactly what it draws today. The client re-derives it on a reload; the server re-derives it from the snapshot's
// seed (validate.ts). Shared, pure and dependency-light (no DOM), like runes.ts.

import { hashSeed, Rng } from "../core/rng";
import { HEROES, RARITIES, RUN_DAYS, buyableModules, type HeroId, type ItemDef, type ItemKind, type Rarity } from "./content";
import { RUNES, runeFits, runeList, runeWeight } from "./runes";
import { hullScaleRules } from "./hullScale"; // HULL-1d (REQ-BFG-073): the PART card's star behind HULL_SCALE

/** The lives a dusk loss must leave for LAST CHANCE to fire. */
export const LAST_CHANCE_AT = 1;
/** The lives it gives back, at once. */
export const LAST_CHANCE_LIVES = 1;
/** The HULL card: max hull for the rest of the run (build.hullBonus), on the x10 scale (NUM-1). Every reader takes this
 *  constant: the rule (run.ts takeLastChance), the offer, the bots' pick, the server's hull ceiling (validate.ts), the
 *  card's words and the toasts. Z-PREP (cap's answer to LC-1 Q1): +500, two ARMOR PACKs; at +1000 the bots took the
 *  hull 80.9% of the time, over the 15-60% band. */
export const LAST_CHANCE_HULL = 500;
/** The RUNE and PART cards' tier. */
export const LAST_CHANCE_TIER: Rarity = "epic";
/** HULL-1d (REQ-BFG-073; BRIEF-HULL1D 2 (e)2, PLAN-AZ's example): the PART card's star with HULL_SCALE on. At ★1 the
 *  bots took the PART card 7.9-9.4% of the time with every switch on (the 15% floor; 127-143 of 277 offered parts rated no
 *  gain anywhere on the deck that lost), so the card offers its part at ★2: a copy into cargo at ★2 (gainModule's cargo
 *  branch, which merges it with a ★2 twin as any copy), valued at ★2 by the server (valueOf: price x 2). */
export const LAST_CHANCE_PART_STARS = 2;
/** HULL-1d: the PART card's star now: LAST_CHANCE_PART_STARS with HULL_SCALE on (the game's, the bots', the server's and
 *  the picker's one reader), else 1 (0.9.7's card, exactly). A rule of the switch, never of the deck. */
export function lastChancePartStars(): number {
  return hullScaleRules() ? LAST_CHANCE_PART_STARS : 1;
}

/** The three cards, in the screen's order. */
export type Boon = "rune" | "part" | "hull";
export const BOONS: readonly Boon[] = ["rune", "part", "hull"];

/** The run's record of it (Run.lastChance; the ghost snapshot's lastChance once a card is taken): the day it fired, the
 *  card taken (absent while the pick is pending) and the rune's or part's id (absent for HULL). */
export interface LastChance {
  day: number;
  boon?: Boon;
  id?: string;
}

/** A taken LAST CHANCE as a snapshot carries it. */
export interface TakenLastChance {
  day: number;
  boon: Boon;
  id?: string;
}

export interface LastChanceOffer {
  day: number;
  /** One specific rune of tier LAST_CHANCE_TIER that fits the hero, isn't held and isn't dormant (or the fallback tier's;
   *  `tier` says which); null when no rune at all is left. */
  rune: { id: string; tier: Rarity } | null;
  /** One specific epic rig, turret or gear of the buyable catalogue (lastChanceParts); null if the catalogue had none. */
  part: string | null;
  /** HULL-1d: the part's star when above 1 (lastChancePartStars: ★2 with HULL_SCALE on); absent: ★1, as before. */
  partStars?: number;
  /** The HULL card's amount (always offered). */
  hull: number;
}

/** Does a dusk with this result fire LAST CHANCE? The loss has already taken its life (`livesLeft` is after it); `used`:
 *  the run already had its LAST CHANCE. (Z-BUMP: the switch is gone; this was the switch-on side.) RUN-1 (REQ-BFG-059):
 *  `lastDay`, the day it must come before: RUN_DAYS on a 10-day run, none (Infinity) on a long run (longRun.ts lcLastDay). */
export function lastChanceFires(day: number, outcome: "win" | "loss" | "draw", livesLeft: number, used: boolean, lastDay: number = RUN_DAYS): boolean {
  return outcome === "loss" && livesLeft === LAST_CHANCE_AT && day < lastDay && !used;
}

const SIGNATURES = new Set(Object.values(HEROES).map((h) => h.factory));

/** The kinds the PART card draws from: rigs, turrets and gear. Z-PREP (cap's answer to LC-1 Q3): never a factory (a day
 *  5-9 deck rarely has the room and intake for one and its belts) and never a core (it replaces a filled socket). A
 *  filter by kind, not a list of ids, so a later epic rig, turret or gear joins by itself. */
export const LAST_CHANCE_PART_KINDS: readonly ItemKind[] = ["gate", "turret", "mod"];

/** The PART card's catalogue: the buyable catalogue's epic parts (content.ts buyableModules: sold by a merchant, priced,
 *  no supply, nothing dormant; switch-off pieces are not enumerable) of LAST_CHANCE_PART_KINDS, never a hero's own
 *  factory. ITEMS order. At bb-0.9.7 (as at bb-0.9.3): SPLITTER, SORTING ARM, EXT. CHAMBER, HAIL GUN, RAIL GUN, SIEGE GUN,
 *  PLATE BREAKER. */
export function lastChanceParts(): ItemDef[] {
  return buyableModules().filter((d) => d.rarity === LAST_CHANCE_TIER && LAST_CHANCE_PART_KINDS.includes(d.kind) && !SIGNATURES.has(d.id));
}

/**
 * The LAST CHANCE offer of a run with `seed` and `hero` whose LAST CHANCE fired at the dusk of `day`, holding `held`
 * (rune ids, in pick order) at that moment. Pure and deterministic: the client, the server and a test get the same cards.
 * 1. The rune: among the runes the dawn offers now (runes.ts runeList: never a dormant one) that fit the hero (runeFits)
 *    and aren't held, those of LAST_CHANCE_TIER; with none, runeOffer's tier fallback (each lower tier, then each higher
 *    one): the first tier with one left. One weighted draw by runeWeight (the hero's style x3, a generic theme x2).
 * 2. The part: one even draw from lastChanceParts() (one rng.int, whatever the catalogue's size, so no later draw moves).
 * 3. The hull: LAST_CHANCE_HULL.
 * OPEN-1 (REQ-BFG-109): `open` is the caller's offer rule (openRunes.ts: the game's switch, the record's own rules on the
 * server, the bots' switch). Open, step 1 drops runeFits and the weight: one even draw among the tier's runes left that
 * aren't held, whatever the hero (rng.weighted takes one number either way, so the part's draw doesn't move). Closed (the
 * default): as before.
 */
export function lastChanceOffer(seed: number, day: number, hero: HeroId, held: readonly string[], open = false): LastChanceOffer {
  const rng = new Rng(hashSeed(seed >>> 0, "lastchance", day));
  const list = runeList();
  const left = (t: Rarity) => list.filter((d) => d.tier === t && (open || runeFits(d, hero)) && !held.includes(d.id));
  const at = RARITIES.indexOf(LAST_CHANCE_TIER);
  const order = [...RARITIES.slice(0, at + 1).reverse(), ...RARITIES.slice(at + 1)];
  const tier = order.find((t) => left(t).length > 0);
  const r = tier ? rng.weighted(left(tier), (d) => runeWeight(d, hero, open)) : null;
  const parts = lastChanceParts();
  const part = parts.length ? parts[rng.int(parts.length)].id : null;
  const ps = lastChancePartStars(); // HULL-1d: ★2 with HULL_SCALE on (no draw: the stream is unchanged)
  return { day, rune: r ? { id: r.id, tier: r.tier } : null, part, ...(part && ps > 1 ? { partStars: ps } : {}), hull: LAST_CHANCE_HULL };
}

/** The offer's card for `boon`: the rune's or part's id, "hull" for the HULL card, or null when the offer has none. */
export function offeredId(offer: LastChanceOffer, boon: Boon): string | null {
  return boon === "rune" ? offer.rune?.id ?? null : boon === "part" ? offer.part : "hull";
}

/** Is `lc` a well-formed record (the save's and the client's check; the strict decoder has its own words)? `taken`: a
 *  card must be named (a snapshot's); otherwise a pending one ({ day } alone) passes too. */
export function lastChanceShapeOk(lc: unknown, taken = false, lastDay: number = RUN_DAYS): boolean {
  if (!lc || typeof lc !== "object" || Array.isArray(lc)) return false;
  const o = lc as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== "day" && k !== "boon" && k !== "id")) return false;
  // RUN-1 (REQ-BFG-059): `lastDay`, the day it must come before (a long run's save or record: Infinity, any day)
  if (typeof o.day !== "number" || !Number.isInteger(o.day) || o.day < 1 || o.day >= lastDay) return false;
  if (o.boon === undefined) return !taken && o.id === undefined;
  if (!BOONS.includes(o.boon as Boon)) return false;
  if (o.boon === "hull") return o.id === undefined;
  return typeof o.id === "string" && (o.boon === "rune" ? Object.prototype.hasOwnProperty.call(RUNES, o.id) : true);
}

/** Where a LAST CHANCE rune sits in build.runes: right after the dawn pick of its day (index `day`), since it is taken
 *  after that dusk and before the next dawn's pick; -1 when the record holds no rune. */
export const lastChanceRuneAt = (lc: Pick<LastChance, "day" | "boon"> | undefined | null): number => (lc && lc.boon === "rune" ? lc.day : -1);

/** The dawn a rune at index i of build.runes was taken at (RUNES-1: index i at the dawn of day i + 1), with a LAST CHANCE
 *  rune at `lcAt` (-1: none): a dawn rune after it sits one place later; the LAST CHANCE rune itself counts as taken at
 *  the dawn after its day (lcAt + 1), the dawn it is picked at, before that dawn's own pick. */
export const runeDawnOf = (i: number, lcAt = -1): number => (lcAt >= 0 && i > lcAt ? i : i + 1);
