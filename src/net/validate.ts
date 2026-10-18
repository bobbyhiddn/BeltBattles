// Server-grade deck validation for ghosts. It applies deck.ts's own rules (placement,
// route well-formedness, connector claims, belt capacity, one hardpoint per turret) and
// adds what only matters once builds travel: purchasability and a gold budget.
//
// Budget (see docs/ASYNC.md):
//   maxGold(day) = START_GOLD + Σ_{d=1}^{day-1} incomeFor(d, won = true)
//   cost(build)  = Σ value(deck items) + Σ value(turret mods)   (0.6.1a: value = price × 2^(stars − 1))
//                + price(beltcrate) × ceil((beltCap − hero.belt) / beltcrate.belt)
//                + price(plating)   × ceil(hullBonus / plating.hull)
//                + Σ turretValue(installed turrets)   (0.6.2s S7; 0 for a build without `turrets`)
//   valid iff cost(build) ≤ maxGold(day)
// Sales refund at most half the price and rerolls only spend, so no sequence of shop
// actions can put more purchase value on the deck than the gold ever received.

import {
  GRID, HEROES, ITEMS, RULES_VERSION, START_GOLD, UPGRADE_MAX, UPGRADE_TRACKS, incomeFor, isWave3, wave3Live, type ItemDef,
  isSustain, sustainLive, // SUS-A (REQ-BFG-069)
} from "../sim/content";
import {
  canPlaceItem, connectorClaims, dirBetween, adjacentToFactory, footprint, hullSlots, occupancy,
  routeInfo, routeWellFormed, turretSlots, turretsCost, type Build,
} from "../sim/deck";
import { joinProblem } from "../sim/deck"; // 0.6.2j (J12): belt joins
import { isIntakeCell, rotOf } from "../sim/deck"; // SHAPES-1 (REQ-BFG-086 S4, S5): a piece's turn; a turret intake cell
import { footOf, footOnDeck, footprintCells, footTurns, isShaped } from "../sim/foot"; // SHAPES-1 (R1): the turned footprint
import { shapesRules, withShapes } from "../sim/shapes"; // SHAPES-1 (S1): the switch
import { shapesGateProblem, shapesWorld } from "./rulesGate"; // SHAPES-1 (S1, S4): SHAPES_RULES' gate
import { shapes2Rules, withShapes2 } from "../sim/shapes2"; // SHAPES-2 (REQ-BFG-114 S1): the six more shaped rigs' switch
import { shapes2GateProblem, shapes2World } from "./rulesGate"; // SHAPES-2 (S1): SHAPES2_RULES' gate
import { checkBuildShape, MAX_DAY, SnapshotError } from "./snapshot";
// RUN-1 (REQ-BFG-059, REQ-BFG-116; D3, D4): the long run's world. A deck under a long run's rules (rulesGate.ts longRunFor) is
// judged with the long-run switch on (the content past day 10, LAST CHANCE on any day, the day bound LONG_RUN_MAX_DAY); under
// older rules, or with the switch off, as the 10-day run. inRulesWorld below puts the module switch to the record's answer.
import { LONG_RUN_MAX_DAY, longRunRules, withLongRun } from "../sim/longRun";
import { longRunFor } from "./rulesGate";
import { ENDLESS_LAST_DAY, endlessRules, withEndless } from "../sim/endless"; // ENDLESS-1 (REQ-BFG-059): the endless world's day bound
import { endlessFor } from "./rulesGate"; // ENDLESS-1: the record's own answer to endless
import { FUSE_MAX, fusible, gradeOf, outputsAt, starsOf, upgradeGold, valueOf } from "../sim/stars";
import { playerSupplyBudget } from "./roadCap"; // 0.7.0: the player mode's supply and budget blocks
import { heroGateProblem, lastChanceGateProblem, rulesGateProblem } from "./rulesGate"; // 0.7.0 (v070-rel M2): turrets and joins need bb-0.6.2 rules; 0.8.0 H1: heroes by rules; Z-BUMP: LAST CHANCE by the rules
import { firstRunGateProblem } from "./rulesGate"; // FIRSTDAY-1 (REQ-BFG-004, F4): the first-run flag by the gate
import { runeGrants, runeProblem } from "../sim/runes"; // RUNES-1 (REQ-BFG-058): the one rune rule, shared with the client's check
import { LAST_CHANCE_HULL, lastChanceOffer, lastChanceParts, lastChanceRuneAt, type TakenLastChance } from "../sim/lastChance"; // LC-1 (REQ-BFG-073)
import { lastChancePartStars } from "../sim/lastChance"; // HULL-1d (REQ-BFG-073): the PART card's star (★2 with HULL_SCALE on)
// NPC-1 (REQ-BFG-077, REQ-BFG-078): the road log's check
import { dropPool, npcDayRules, roadDropValue, type RoadEntry } from "../sim/npcDay";
import { npcDayGateProblem } from "./rulesGate";
import { openRunesFor } from "./rulesGate"; // OPEN-1 (REQ-BFG-109): the offer rule of a deck's own rules
import { freeJoinsFor } from "./rulesGate"; // JOINS-1 (REQ-BFG-091): free joins by the upload's own rules
import { withFreeJoins } from "../sim/freeJoins"; // JOINS-1: the deck check runs under that answer
import { RIVALS, warlordOffer } from "../sim/rivals";
import { topParts, warlordDeck, warlordDrop } from "../game/road";
import { eventFor, eventSequence } from "../game/events";
import type { EventId } from "../game/eventDefs"; // RUN-1: offeredEvents
// AZ-BUMP (S6, the stored records): a deck under older rules is budgeted in its own rules' world (inRulesWorld below)
import { NPC_DAY_RULES, rulesAtLeast } from "./rulesGate";
import { withNpcDay } from "../sim/npcDay";
import { withHullScale } from "../sim/hullScale";
import { withLadderFix } from "../sim/ladderFix";

/**
 * AZ-BUMP (REQ-BFG-077, REQ-BFG-078, REQ-BFG-079; S6, the stored records, Z-BUMP S4's pattern): run `fn` in the world of
 * `rules`. The hull release's three switches (NPC_DAY, HULL_SCALE, LADDER_FIX) came on together with its rules,
 * bb-0.10.0 (NPC_DAY_RULES, the NPC day's row), so a deck under older rules (a stored bb-0.9.7 record: no road, no M or
 * D, bb-0.9.7's gold table and road) is judged with all three off, the world it was made in. The rules gate decides,
 * never the global switch; this build's rules (and later) run as the switches stand (on, as the build ships; a test's
 * setter otherwise). Each switch is put back after, even on a throw (the with* helpers). roadCap's memo keys carry the
 * switches, so the two worlds never share a memo entry.
 * RUN-1 (REQ-BFG-059, D1): and the long run's: the module switch (sim/longRun.ts longRunRules, read by the pure content
 * functions that have no run to ask: rivals.ts clampDay, ...) is put to this record's answer, longRunFor(rules): on for a
 * record under a long run's rules, off for an older one. With the switch off the answer is always off, equal to the switch,
 * and nothing is touched: the check is exactly as before.
 */
export function inRulesWorld<T>(rules: unknown, fn: () => T): T {
  const world = (): T => (rulesAtLeast(rules, NPC_DAY_RULES) ? fn() : withNpcDay(() => withHullScale(() => withLadderFix(fn, false), false), false));
  const long = longRunFor(rules);
  const inLong = (): T => (long === longRunRules() ? world() : withLongRun(world, long));
  // ENDLESS-1 (REQ-BFG-059): and the endless one: the module switch (sim/endless.ts endlessRules, read by the day bounds that have no
  // snapshot to ask: validateBuild's day, snapshot.ts maxRunes) is put to this record's answer, endlessFor(rules): on for a record
  // under rules with endless, off for an older one. With the switch off the answer is always off, equal to the switch, and nothing
  // is touched: the check is exactly as before. A RUN's snapshot never reaches a day past maxDayFor (the decoder refuses it first)
  const endless = endlessFor(rules);
  return endless === endlessRules() ? inLong() : withEndless(inLong, endless);
}

/** RUNES-1: what a deck's check knows beside the deck: its snapshot's run `seed` (absent on a served ghost, FIX-6, and
 *  on stand-ins and pool decks), so the rune offer rule runs only when the uploader's seed is known. */
export interface ValidateContext {
  seed?: number;
  /** LC-1 (REQ-BFG-073): the snapshot's taken LAST CHANCE (absent: none, every switch-off deck): where its rune sits, the
   *  +LAST_CHANCE_HULL grant, the free part's price, and (with the seed) its offer. */
  lastChance?: TakenLastChance;
  /** NPC-1 (REQ-BFG-077, REQ-BFG-078): the snapshot's road log (absent: none, every switch-off deck): with the seed each
   *  entry's warlord, deck and drop are re-derived (roadProblem), and its drops count toward the budget at their value. */
  road?: RoadEntry[];
  /** OPEN-1 (REQ-BFG-109): the offer rule the deck's rules give (rulesGate.ts openRunesFor): with the seed, each held rune's
   *  dawn offer and LAST CHANCE's rune card are re-derived open (hero-blind) when true. validateUpload sets it from the
   *  snapshot's own rules; absent: closed, today's weighted offers. */
  openRunes?: boolean;
  /** FIRSTDAY-1 (REQ-BFG-004, F4): the snapshot's first-run flag (absent: every other deck): with the seed, days 1-2's
   *  rune offers are re-derived by F3's rule (runes.ts runeProblem); refused while the first-run gate is off. */
  firstRun?: boolean;
}

/**
 * NPC-1 (REQ-BFG-077, REQ-BFG-078): why a deck's road log can't stand, or null. Refused: the log while NPC_DAY is off; an
 * entry for a day the deck hasn't reached (after `day`); two entries for one day; a drop on a loss or a draw. With the
 * uploader's seed, each entry's warlord is re-derived (warlordOffer(seed, day, matriarchBeatenOn), the Matriarch beaten on
 * the log's first win over her), with its deck (warlordDeck; SABOTAGE's too when the day before met SAPPERS: the event
 * comes after the fight, so its sabotage hits the next day's warlord) and its seeded drop (road.ts warlordDrop). Then a
 * legendary part outside the Matriarch's own win (a second Matriarch part), a part not in that warlord's pool, and a drop
 * (or none) the seeded roll didn't give are refused. Without the seed (a served ghost) only the first lines are checked.
 * HULL-1a (REQ-BFG-078; REVIEW-NPC1 Q3): an entry says when its warlord was sabotaged (`sabotaged: true`), so exactly one
 * deck is checked: SABOTAGE's with the flag, the plain one without it; and the flag stands only after a SAPPERS day (its
 * own line), whatever the outcome.
 */
export function roadProblem(road: readonly RoadEntry[], day: number, seed?: number): string | null {
  if (!npcDayRules()) return "road: not in this rules version yet";
  const seen = new Set<number>();
  for (const e of road) {
    if (e.day > day) return `road: day ${e.day} is past the deck's day ${day}`;
    if (seen.has(e.day)) return `road: two entries for day ${e.day}`;
    seen.add(e.day);
    if (e.outcome !== "win" && e.drop !== undefined) return `road: day ${e.day}: a drop (${e.drop}) on a ${e.outcome}`;
  }
  if (seed === undefined) return null;
  let beaten: number | undefined;
  for (const e of [...road].sort((a, b) => a.day - b.day)) {
    const id = warlordOffer(seed, e.day, beaten)[e.tier];
    if (id === "matriarch" && e.outcome === "win") beaten = e.day;
    // HULL-1a (Q3): SABOTAGE's deck only after a SAPPERS day (the event comes after the fight: it hits the next warlord)
    const sapped = e.day > 1 && eventFor(seed, e.day - 1, longRunRules()) === "sappers"; // RUN-1: a long run's sequence has no day-10 swap
    if (e.sabotaged && !sapped) return `road: day ${e.day}: sabotaged, but ${e.day > 1 ? `day ${e.day - 1} met no SAPPERS` : "no day came before it"}`;
    if (e.outcome !== "win") continue;
    const decks = [warlordDeck(id, e.day, !!e.sabotaged)]; // HULL-1a (Q3): the one deck the entry names
    const name = RIVALS[id].name;
    if (e.drop !== undefined) {
      const legendary = itemDef(e.drop)?.rarity === "legendary";
      if (legendary && id !== "matriarch") return `road: day ${e.day}: ${e.drop} is a second Matriarch part (a legendary part is hers alone, paid once at her win)`;
      const pools = decks.map((d) => (id === "matriarch" ? topParts(d, 1) : dropPool(d)));
      if (!pools.some((p) => p.includes(e.drop!))) return `road: day ${e.day}: ${e.drop} is not in ${name}'s pool`;
    }
    const rolls = decks.map((d) => warlordDrop(seed, e.day, id, e.tier, d));
    if (!rolls.includes(e.drop ?? null)) {
      return `road: day ${e.day}: the seeded roll of ${name} gave ${[...new Set(rolls.map((r) => r ?? "no drop"))].join(" or ")}, not ${e.drop ?? "no drop"}`;
    }
  }
  return null;
}

/**
 * LC-1 (REQ-BFG-073): why a deck's LAST CHANCE can't stand, or null: the day before RUN_DAYS and before the deck's own
 * day (the decoder's lines, again for a caller without a snapshot); a rune boon's rune at its place (right after its
 * day's dawn pick, runeProblem's lcAt); a part boon's part one of the PART card's catalogue; and, with the uploader's
 * seed, the boon must be the card the seed's offer gave (lastChanceOffer on the runes held before it). Z-BUMP: the
 * switch's line is gone; a deck under older rules is validateUpload's rules gate (lastChanceGateProblem).
 * OPEN-1 (REQ-BFG-109): `open`, the offer rule of the deck's rules (ValidateContext.openRunes): the seeded card is
 * re-derived under it (lastChanceOffer's `open`); closed by default, as before.
 */
export function lastChanceProblem(lc: TakenLastChance, b: Build, day: number, seed?: number, open = false): string | null {
  // RUN-1 (REQ-BFG-059, D3, D4): on a long run (the world's switch, inRulesWorld) LAST CHANCE can fire on any day, so the one
  // bound left is the deck's own day (the next line); the 10-day run: before MAX_DAY, as before
  if (!Number.isInteger(lc.day) || lc.day < 1 || (!longRunRules() && lc.day >= MAX_DAY)) return `lastChance: day ${lc.day}: LAST CHANCE comes only before day ${MAX_DAY}`;
  if (lc.day >= day) return `lastChance: day ${lc.day} is not before the deck's day ${day}`;
  const runes = (b.runes ?? []).map((q) => q.id);
  if (lc.boon === "rune" && runes[lc.day] !== lc.id) return `lastChance: the LAST CHANCE rune ${String(lc.id)} is not at runes[${lc.day}] (after the dawn pick of day ${lc.day})`;
  if (lc.boon === "part" && !lastChanceParts().some((d) => d.id === lc.id)) return `lastChance: ${String(lc.id)} is no LAST CHANCE part (an epic rig, turret or gear of the shop's catalogue)`;
  if (lc.boon === "hull" && lc.id !== undefined) return "lastChance: a hull boon names no id";
  if (seed === undefined) return null;
  const offer = lastChanceOffer(seed, lc.day, b.hero, runes.slice(0, lc.day), open);
  if (lc.boon === "rune" && offer.rune?.id !== lc.id) return `lastChance: rune ${String(lc.id)} was not in the LAST CHANCE offer of day ${lc.day} (it offered ${offer.rune?.id ?? "no rune"})`;
  if (lc.boon === "part" && offer.part !== lc.id) return `lastChance: part ${String(lc.id)} was not in the LAST CHANCE offer of day ${lc.day} (it offered ${offer.part ?? "no part"})`;
  return null;
}

export { maxHonestSpend, roadCap } from "./roadCap";

/**
 * AZ-PREP (REVIEW-HULL1D Q1) / RUN-1 (D6): the events a run's seed offered by `day` (eventFor(seed, 1..day)). The 10-day run:
 * the Set of them, as before. A long run (the world's switch): a Map of how many times each was offered, since its bags
 * repeat every event once per bag (events.ts eventSequence's `long` sequence has no day-10 swap), so a hull or belt the road
 * gave twice (the dock's PLATING in two bags) is checked against two offers (roadCap.ts playerFits).
 */
export function offeredEvents(seed: number, day: number): ReadonlySet<EventId> | ReadonlyMap<EventId, number> {
  if (!longRunRules()) return new Set(Array.from({ length: day }, (_, i) => eventFor(seed, i + 1)));
  const counts = new Map<EventId, number>();
  for (const e of eventSequence(seed, day, true)) counts.set(e, (counts.get(e) ?? 0) + 1);
  return counts;
}

/**
 * 0.7.0 (v070-validate D1): two modes, one validator. "strict" (the default) holds a deck to the shop alone:
 * stand-ins, the bundled pool, the harness and the pool generator. "player" is for decks a real player
 * uploaded (server/app.ts POST /v1/ghosts) or a ghost the server serves (ghostClient.ts): every strict rule,
 * with the supply and budget blocks replaced by the road's reachable hull and belt and maxHonestSpend(day)
 * (src/net/roadCap.ts). It accepts every deck strict accepts.
 */
export type ValidationMode = "strict" | "player";

/**
 * validateBuild in the player mode (see ValidationMode). 0.7.0 (v070-rel M2): `rules` is the rules version the deck
 * travels under (its snapshot's; default this build's RULES_VERSION). A deck with turret slots or belt joins under rules
 * that predate bb-0.6.2, or that can't be read, is refused with one "rules:" error naming both (rulesGate.ts). Joins
 * past JOIN_LIMIT are validateBuild's own (deck.ts joinProblem: "2 JOINS PER DECK"), in both modes.
 * JOINS-1 (REQ-BFG-091): the deck is checked under ITS rules' answer to free joins (rulesGate.ts freeJoinsFor: FREE_JOINS
 * on and `rules` at or after FREE_JOINS_RULES), never the switch alone: under such rules any number of legal joins
 * passes; under older rules a join past JOIN_LIMIT is refused as before. With the switch off, exactly as before.
 */
export function validateUpload(build: Build, day: number, rules: string = RULES_VERSION, ctx: ValidateContext = {}): Validation {
  const why = rulesGateProblem(rules, build);
  if (why) return { ok: false, errors: [`rules: ${why}`] };
  // 0.8.0 H1 (REQ-BFG-009): the deck's hero must be one its rules accept (rulesGate.ts RULES_HEROES)
  const hero = heroGateProblem(rules, (build as { hero?: unknown } | null)?.hero);
  if (hero) return { ok: false, errors: [`rules: ${hero}`] };
  // Z-BUMP (REQ-BFG-073): a LAST CHANCE travels only under rules that have it (rulesGate.ts lastChanceGateProblem, as the
  // strict decoder asks it), so given an older snapshot's rules one is refused; before the flip the switch refused it
  const lcGate = ctx.lastChance ? lastChanceGateProblem(rules) : null;
  if (lcGate) return { ok: false, errors: [`lastChance: ${lcGate}`] };
  // NPC-1 (REQ-BFG-077, REQ-BFG-078): a road log travels only with NPC_DAY on and under rules that have it
  const ndGate = ctx.road ? npcDayGateProblem(rules) : null;
  if (ndGate) return { ok: false, errors: [`road: ${ndGate}`] };
  // SHAPES-1 (REQ-BFG-086 S1, S4): the shaped rigs travel only with SHAPES on and under rules that have them
  // (rulesGate.ts shapesGateProblem); a deck under older rules is judged in 0.9.9's shapes (inShapesWorld)
  const shGate = shapesGateProblem(rules, build);
  if (shGate) return { ok: false, errors: [`rules: ${shGate}`] };
  // SHAPES-2 (REQ-BFG-114 S1): and the six more shaped rigs only with SHAPES2 on and under rules that have them
  // (rulesGate.ts shapes2GateProblem); a deck under older rules is judged without them (inShapes2World)
  const s2Gate = shapes2GateProblem(rules, build);
  if (s2Gate) return { ok: false, errors: [`rules: ${s2Gate}`] };
  // FIRSTDAY-1 (REQ-BFG-004, F4): a first-run flag travels only with the first-run gate on
  const frGate = ctx.firstRun ? firstRunGateProblem() : null;
  if (frGate) return { ok: false, errors: [`firstRun: ${frGate}`] };
  // AZ-BUMP (S6, the stored records): the budget, the road and the events by the deck's own rules (inRulesWorld): under
  // rules before bb-0.10.0 with the hull release's three switches off; under this build's as they stand
  // OPEN-1 (REQ-BFG-109): the deck's runes are re-derived on the offers of its own rules (openRunesFor: the switch AND
  // rules at or after OPEN_RUNES_RULES), so an older record keeps today's weighted offers whatever the switch
  // JOINS-1 (REQ-BFG-091): and the deck check runs under its own rules' answer to free joins (freeJoinsFor)
  // SHAPES-1 (REQ-BFG-086; cap's RUN2 note 1.2): the shapes world nests inside the rules world, so a record under rules
  // before bb-0.10.0 is judged with SHAPES off too; c099's merge keeps HULL-ON's call inside both (release lane)
  // PLAIN-1F (M1): FIRSTDAY-1's ctx.firstRun rides through to validateBuild's runeProblem in the ctx spread
  return inRulesWorld(rules, () => inShapesWorld(rules, () => inShapes2World(rules, () => withFreeJoins(() => validateBuild(build, day, "player", { ...ctx, openRunes: openRunesFor(rules) }), freeJoinsFor(rules))))); // JOINS-1: by its own rules; SHAPES-1: inShapesWorld nested
}

/**
 * SHAPES-1 (REQ-BFG-086 S1, S4): run `fn` in the shapes world of `rules` (rulesGate.ts shapesWorld): with SHAPES on and
 * rules before SHAPES_RULES, with the switch off (2x2 GANTRY PRESS and ASSEMBLY LINE at 0.9.9's price, no rot on a
 * factory, no TURRET INTAKE), the world the deck was made in; otherwise as the switch stands. The switch is put back
 * after, even on a throw (withShapes).
 */
export function inShapesWorld<T>(rules: unknown, fn: () => T): T {
  // SHAPES-2 (REQ-BFG-114 S1): SHAPES2 needs SHAPES (its six are shaped rigs), so the world before SHAPES_RULES has the six
  // off too (withShapes2 outside, so the switches come back in the reverse of their order and ITEMS keeps its order); with
  // SHAPES2 off (the pins) withShapes2 does nothing
  return shapesRules() && !shapesWorld(rules) ? withShapes2(() => withShapes(fn, false), false) : fn();
}

/**
 * SHAPES-2 (REQ-BFG-114 S1): run `fn` in the SHAPES2 world of `rules` (rulesGate.ts shapes2World), inShapesWorld's form: with
 * SHAPES2 on and rules before SHAPES2_RULES, with the switch off (the six are unknown pieces, and refused first by
 * shapes2GateProblem), the world the deck was made in; otherwise as the switch stands. The switch is put back after, even
 * on a throw (withShapes2).
 */
export function inShapes2World<T>(rules: unknown, fn: () => T): T {
  return shapes2Rules() && !shapes2World(rules) ? withShapes2(fn, false) : fn();
}

export interface Validation {
  ok: boolean;
  errors: string[]; // each starts with a category: shape|item|turret|placement|route|hardpoint|supply|budget (validateUpload: also rules)
}

export function itemDef(id: string): ItemDef | undefined {
  return Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : undefined;
}

/** Most gold a player can have received before the dusk fight of `day` (1-based). */
export function maxGoldByDay(day: number): number {
  let gold = START_GOLD;
  for (let d = 1; d < day; d++) gold += incomeFor(d, true);
  return gold;
}

export interface BuildCost {
  items: number;
  mods: number;
  crates: number; // belt crates implied by beltCap above the hero's base (count)
  plates: number; // armor plating implied by hullBonus (count)
  // 0.6.2s TURRET SLOTS (S7): the installed turrets' value (deck.ts turretsCost: price x (2^(stars-1) - 1 for the free
  // starting copy)). Present only when the build carries `turrets`, so a starting-layout build's breakdown is unchanged.
  turrets?: number;
  // bb-0.8.3 (REQ-BFG-043 D10): the gold the build's upgrade levels paid (stars.ts upgradeGold: 0 / 10 / 30 / 60 a
  // track). Present only when the build carries `upgrades`, so a build without them breaks down exactly as before.
  upgrades?: number;
  total: number; // gold
}

export function buildCost(b: Build): BuildCost {
  const h = HEROES[b.hero];
  const crate = ITEMS.beltcrate, plate = ITEMS.plating;
  // 0.6.1a: value = price x 2^(stars - 1) (stars.ts valueOf; unknown ids 0), so a merged module costs exactly its copies
  const items = b.items.reduce((s, p) => s + valueOf(p.def, starsOf(p)), 0);
  const mods = b.mods.reduce((s, m) => s + valueOf(m.def, starsOf(m)), 0);
  const crates = Math.max(0, Math.ceil((b.beltCap - h.belt) / crate.supply!.belt!));
  const plates = Math.max(0, Math.ceil(b.hullBonus / plate.supply!.hull!));
  const total = items + mods + crates * crate.price + plates * plate.price;
  // bb-0.8.3 (REQ-BFG-043 D10): the upgrade gold paid counts like any purchase (the upload budget reads total)
  const up = b.upgrades ? { upgrades: upgradeGold(b) } : {};
  const paid = up.upgrades ?? 0;
  if (!b.turrets) return { items, mods, crates, plates, ...up, total: total + paid };
  const turrets = turretsCost(b);
  return { items, mods, crates, plates, turrets, ...up, total: total + turrets + paid };
}

const SIGNATURES = new Set(Object.values(HEROES).map((h) => h.factory));

/**
 * 0.6.1a (ARSENAL-DECISIONS call 1): under auto-merge two fusible modules with the same def and the
 * same stars below FUSE_MAX can't exist. validateBuild applies this rule while FUSE_LIVE is true:
 * LIVE since the 0.6.1 flip (RULES_VERSION bb-0.6.1, stand-in pool v2, harness v2). The game
 * validates foreign decks only (ghosts, stand-ins, uploads); the captains and par decks still hold
 * pairs until job E merges them, and the game never validates them.
 */
export const FUSE_LIVE = true;

/** One message per def and star level (below FUSE_MAX) held more than once, e.g. "UNFUSED PAIR: TEMPER ★1 x2".
 *  Supplies, signature factories and unknown ids are not fusible and never count. 0.6.2s TURRET SLOTS (S6, S7): the
 *  installed turrets count too, after the items and mods, except that two FREE copies never merge with each other
 *  (WEAVER starts with three free DART GUNs): per def and star level below FUSE_MAX, with N bought and F free copies,
 *  it is a pair iff N >= 1 and N + F >= 2 (reported as x(N + F)). The starting layout (a build without `turrets`)
 *  holds free copies only, so it never adds a message. */
export function unfusedPairs(build: Build): string[] {
  const n = new Map<string, number>();
  for (const p of [...build.items, ...build.mods]) {
    const s = starsOf(p);
    if (!fusible(p.def) || s >= FUSE_MAX) continue;
    n.set(`${p.def}*${s}`, (n.get(`${p.def}*${s}`) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const [k, c] of n) {
    if (c < 2) continue;
    const [def, s] = k.split("*");
    out.push(`UNFUSED PAIR: ${ITEMS[def].name} ★${s} x${c}`);
  }
  const t = new Map<string, { bought: number; free: number }>();
  for (const x of build.turrets ?? []) {
    const s = starsOf(x);
    if (!fusible(x.def) || ITEMS[x.def].kind !== "turret" || s >= FUSE_MAX) continue;
    const k = `${x.def}*${s}`;
    const c = t.get(k) ?? { bought: 0, free: 0 };
    if (x.free) c.free++;
    else c.bought++;
    t.set(k, c);
  }
  for (const [k, c] of t) {
    if (c.bought < 1 || c.bought + c.free < 2) continue;
    const [def, s] = k.split("*");
    out.push(`UNFUSED PAIR: ${ITEMS[def].name} ★${s} x${c.bought + c.free}`);
  }
  return out;
}

/** 0.6.2 BELTSIDE (D2): a rig's rotation is 0..3 quarter turns (absent = 0). */
const MAX_ROT = 3;

function routeProblem(b: Build, i: number, occ: ReturnType<typeof occupancy>): string | null {
  const r = b.routes[i];
  if (!r.cells.length) return "has no belt tiles";
  const f = b.items.find((p) => p.uid === r.factory);
  if (!f || itemDef(f.def)?.kind !== "factory") return `is fed by uid ${r.factory}, which is not a factory on this deck`;
  if (adjacentToFactory(b, r.factory, r.cells[0]) < 0) return "does not start beside its factory";
  const seen = new Set<number>();
  for (let j = 0; j < r.cells.length; j++) {
    const k = r.cells[j];
    if (seen.has(k)) return `revisits cell ${k} (no loops)`;
    seen.add(k);
    if (j > 0 && dirBetween(r.cells[j - 1], k) < 0) return `is broken between cells ${r.cells[j - 1]} and ${k}`;
    if (occ[k].item >= 0) return `runs through machinery at cell ${k}`; // 0.6.2 BELTSIDE (R1): no exception for rigs
  }
  return routeWellFormed(b, r) ? null : "is not well formed";
}

export function validateBuild(build: Build, day: number, mode: ValidationMode = "strict", ctx: ValidateContext = {}): Validation {
  let b: Build;
  try {
    b = checkBuildShape(build);
  } catch (e) {
    return { ok: false, errors: [`shape: ${e instanceof SnapshotError ? e.message : String(e)}`] };
  }
  // RUN-1 (REQ-BFG-059, D4): the day bound follows the world: LONG_RUN_MAX_DAY on a long run (the switch inRulesWorld set to
  // the record's rules: validateUpload; a strict content check of the long run's own tables reads the switch), else MAX_DAY.
  // It refuses an upload or a check, never a run
  // ENDLESS-1: and an endless dusk (the world's endless switch, rules with endless) runs to ENDLESS_LAST_DAY
  const maxDay = endlessRules() ? ENDLESS_LAST_DAY : longRunRules() ? LONG_RUN_MAX_DAY : MAX_DAY;
  if (!Number.isInteger(day) || day < 1 || day > maxDay) return { ok: false, errors: [`shape: day ${day} is not in 1..${maxDay}`] };
  // RUNES-1 (REQ-BFG-058): the runes, by runes.ts runeProblem: catalogue ids, no repeats and, with the uploader's seed,
  // each in its dawn's re-derived offer. FLIP-X2 (cap's ruling 5d6d83ef57d1494c): the count comes from the mode, so no
  // upload caller can forget it: exact for uploads (validateUpload's player mode, client and server: one a dawn, `day`
  // runes, an absent field counting as 0); at most `day` for strict content checks (and the client's local pool)
  // LC-1 (REQ-BFG-073): a deck's LAST CHANCE first (its rune's place, its card, with the seed its offer); without one
  // (every switch-off deck) nothing below changes: lcAt -1, no hull, no free part
  const lc = ctx.lastChance;
  const open = ctx.openRunes === true; // OPEN-1 (REQ-BFG-109): the offer rule of the deck's rules (absent: closed)
  if (lc) {
    const lp = lastChanceProblem(lc, b, day, ctx.seed, open);
    if (lp) return { ok: false, errors: [lp] };
  }
  // NPC-1 (REQ-BFG-077, REQ-BFG-078): the road log next (absent on every switch-off deck: nothing below changes)
  if (ctx.road) {
    const rd = roadProblem(ctx.road, day, ctx.seed);
    if (rd) return { ok: false, errors: [rd] };
  }
  const lcAt = lastChanceRuneAt(lc);
  // FIRSTDAY-1: a first run's dawns 1-2; PLAIN-1F (M1): the first-run flag rides 9th, after OPEN-1's `open` (runes.ts runeProblem)
  const rp = runeProblem(b.runes, day, b.hero, ctx.seed, mode === "player" ? "exact" : "atMost", false, lcAt, open, ctx.firstRun === true);
  if (rp) return { ok: false, errors: [`rune: ${rp}`] };
  // what the runes gave: HULL and BELT runes sit in hullBonus / beltCap (run.ts takeRune), so the supply and budget
  // blocks below read the bought hull and belt (`bought`); dawn-gold runes add their gold to the day's budget. LC-1: the
  // LAST CHANCE HULL card is a grant like a HULL rune (once), and its PART's price is free (once: freeGold)
  const runeGrant = runeGrants(b.runes, day, lcAt);
  // HULL-1d: the free part's value at the card's star (valueOf: ★1 its price, as before; ★2 with HULL_SCALE on, price x 2)
  const freeGold = lc?.boon === "part" && lc.id !== undefined && itemDef(lc.id) ? valueOf(lc.id, lastChancePartStars()) : 0;
  const grant = lc?.boon === "hull" || freeGold ? { ...runeGrant, hull: runeGrant.hull + (lc?.boon === "hull" ? LAST_CHANCE_HULL : 0), gold: runeGrant.gold + freeGold } : runeGrant;
  const bought: Build = grant.hull || grant.belt ? { ...b, hullBonus: b.hullBonus - grant.hull, beltCap: b.beltCap - grant.belt } : b;
  const errors: string[] = [];
  const h = HEROES[b.hero];

  // items exist, uids unique (deck.ts helpers throw on unknown defs, so stop here if not)
  const uids = new Set<number>();
  for (const p of [...b.items, ...b.mods]) {
    if (!itemDef(p.def)) errors.push(`item: uid ${p.uid} is unknown item "${p.def}"`);
    // 0.8.0 P1: a wave-3 module resolves in ITEMS, but while the switch is off (content.ts WAVE3_LIVE) no player can own one
    else if (isWave3(p.def) && !wave3Live()) errors.push(`item: uid ${p.uid} ${ITEMS[p.def].name} is not in the game yet`);
    // SUS-A (REQ-BFG-069): the same for the sustain pieces while their switch is off (content.ts SUSTAIN_LIVE): no shop sells one
    else if (isSustain(p.def) && !sustainLive()) errors.push(`item: uid ${p.uid} ${ITEMS[p.def].name} is not in the game yet`);
    if (uids.has(p.uid)) errors.push(`item: uid ${p.uid} is used twice`);
    uids.add(p.uid);
  }
  // 0.6.2s TURRET SLOTS (S8): the installed turret list (absent = the starting layout: nothing to check here). Uids are
  // unique together with the items' and mods'; each entry is a turret def in a slot of this hull, one turret per slot.
  // deck.ts's slot helpers (hero(b), turretSlots) throw on a def that isn't a turret, so stop here if not.
  const slots = hullSlots(b.hero);
  const held = new Set<number>();
  for (const t of b.turrets ?? []) {
    const d = itemDef(t.def);
    if (uids.has(t.uid)) errors.push(`turret: uid ${t.uid} is used twice`);
    uids.add(t.uid);
    if (!d) errors.push(`turret: uid ${t.uid} is unknown item "${t.def}"`);
    else if (d.kind !== "turret") errors.push(`turret: uid ${t.uid} ${d.name} is not a turret`);
    if (t.slot >= slots.length) errors.push(`turret: uid ${t.uid} is in slot ${t.slot}; ${h.name} has ${slots.length} turret slots`);
    else if (held.has(t.slot)) errors.push(`turret: slot ${t.slot} holds more than one turret`);
    held.add(t.slot);
  }
  if (errors.length) return { ok: false, errors };

  // 0.6.1a stars: an integer 1..FUSE_MAX (absent = 1; checkBuildShape already bounds it); signature
  // factories and supplies never merge, so theirs must be absent or 1
  for (const p of [...b.items, ...b.mods]) {
    if (p.stars === undefined) continue;
    if (!Number.isInteger(p.stars) || p.stars < 1 || p.stars > FUSE_MAX) errors.push(`item: uid ${p.uid} has stars ${p.stars}; expected 1..${FUSE_MAX}`);
    else if (p.stars > 1 && !fusible(p.def)) errors.push(`item: uid ${p.uid} ${ITEMS[p.def].name} can't have ${p.stars} stars (signatures and supplies never merge)`);
  }
  // bb-0.8.3 (REQ-BFG-043 D10): the upgrade levels, each an integer 1..UPGRADE_MAX (absent = 1; checkBuildShape already
  // bounds them). What they cost is in buildCost, so the budget below refuses a level the day's gold can't pay for.
  for (const t of UPGRADE_TRACKS) {
    const n = b.upgrades?.[t];
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > UPGRADE_MAX)) errors.push(`upgrade: ${t} level ${n}; expected 1..${UPGRADE_MAX}`);
  }
  // 0.6.2s TURRET SLOTS: a turret's stars are 1..FUSE_MAX too (checkBuildShape already bounds them). S7: a free copy
  // (the hull's starting copy, maybe merged) only of the hero's own starting defs, at most as many of a def as it starts with.
  const starts = new Map<string, number>(), frees = new Map<string, number>();
  for (const s of slots) if (s.start) starts.set(s.start, (starts.get(s.start) ?? 0) + 1);
  for (const t of b.turrets ?? []) {
    if (t.stars !== undefined && (!Number.isInteger(t.stars) || t.stars < 1 || t.stars > FUSE_MAX)) {
      errors.push(`turret: uid ${t.uid} has stars ${t.stars}; expected 1..${FUSE_MAX}`);
    }
    if (!t.free) continue;
    if (!starts.has(t.def)) errors.push(`turret: uid ${t.uid} ${ITEMS[t.def].name} is a free copy, but ${h.name} doesn't start with one`);
    else frees.set(t.def, (frees.get(t.def) ?? 0) + 1);
  }
  for (const [def, n] of frees) {
    const most = starts.get(def)!;
    if (n > most) errors.push(`turret: ${n} free ${ITEMS[def].name} copies, but ${h.name} starts with ${most}`);
  }
  if (FUSE_LIVE) for (const m of unfusedPairs(b)) errors.push(`item: ${m}`);

  // 0.6.2 BELTSIDE (D2) rot: an integer 0..MAX_ROT (checkBuildShape already bounds it), on a rig only. SHAPES-1 (REQ-BFG-086
  // S1, S4): and on a shaped factory in its lowest form (foot.ts canonicalRot: a 2x3 or I3 factory rot 1, absent for 0);
  // a piece whose footprint never changes when turned (a 2x2, so every factory with SHAPES off) still has none
  for (const p of b.items) {
    if (p.rot === undefined) continue;
    const d = ITEMS[p.def], turns = footTurns(footOf(d));
    if (!Number.isInteger(p.rot) || p.rot < 0 || p.rot > MAX_ROT) errors.push(`item: uid ${p.uid} has rot ${p.rot}; expected 0..${MAX_ROT}`);
    else if (d.kind === "gate") continue;
    else if (turns === 1) errors.push(`item: uid ${p.uid} ${d.name} can't have a rot (only rigs turn)`);
    else if (p.rot === 0 || p.rot >= turns) errors.push(`item: uid ${p.uid} ${d.name} has rot ${p.rot}; its ${footOf(d).toUpperCase()} footprint turns only to rot 1..${turns - 1} (absent = 0)`);
  }

  // purchasability and the signature factory
  let own = 0;
  for (const p of b.items) {
    const d = ITEMS[p.def];
    if (SIGNATURES.has(d.id)) {
      if (d.id === h.factory) own++;
      else errors.push(`item: uid ${p.uid} ${d.name} is another hero's signature factory`);
    } else if (!d.merchant) {
      errors.push(`item: uid ${p.uid} ${d.name} is not sold by any merchant`);
    }
  }
  if (own !== 1) errors.push(`item: the deck must carry exactly one ${ITEMS[h.factory].name} (found ${own})`);

  // placement: deck equipment only, on the deck, no overlaps (canPlaceItem = the editor's rule). 0.6.2
  // BELTSIDE (D2, R1): canPlaceItem now refuses a rig on a belt tile too (BELT IN THE WAY), and routeProblem
  // below refuses a route under any machinery, so no machinery stands on a belt tile.
  const owner = new Map<number, number>();
  for (const p of b.items) {
    const d = ITEMS[p.def];
    // SHAPES-1 (REQ-BFG-086 R1, S4): the turned footprint (footprintCells at the piece's rot) for bounds and overlaps
    const chk = canPlaceItem(b, p.def, p.x, p.y, p.uid, rotOf(p));
    if (!chk.ok && chk.reason !== "OCCUPIED") errors.push(`placement: uid ${p.uid} ${d.name} at ${p.x},${p.y}: ${chk.reason}`);
    if (!footOnDeck(d, p.x, p.y, rotOf(p))) continue;
    // SHAPES-1 (S5; cap's ruling, oracle 4ef9d32165edfd0d): with SHAPES on a SHAPED piece (2+ cells for a rig, not 2x2 for
    // a factory) may not cover a turret intake cell; a 1-cell rig and a 2x2 keep 0.9.9's rule there (legal)
    if (shapesRules() && isShaped(d) && footprintCells(d, p.x, p.y, rotOf(p)).some((k) => isIntakeCell(b, k))) {
      errors.push(`placement: uid ${p.uid} ${d.name} at ${p.x},${p.y}: TURRET INTAKE`);
    }
    for (const k of footprintCells(d, p.x, p.y, rotOf(p))) {
      const o = owner.get(k);
      if (o !== undefined) errors.push(`placement: uid ${p.uid} ${d.name} overlaps uid ${o} at cell ${k}`);
      else owner.set(k, p.uid);
    }
  }
  if (errors.length) return { ok: false, errors }; // route checks assume a sane deck

  // routes: well formed, no crossings, connected to a claimed connector, belt ≤ beltCap. 0.6.2j (J2, J12): a joining
  // belt's join must be legal (joinProblem: next to its join tile, another belt's tile, not itself, no loop); it
  // claims no connector and counts as connected when its chain ends on a claimed one; its cells alone count as belt
  const occ = occupancy(b);
  const claims = connectorClaims(b);
  const beltOwner = new Map<number, number>();
  const perFactory = new Map<number, number>();
  let belt = 0;
  b.routes.forEach((r, i) => {
    belt += r.cells.length;
    perFactory.set(r.factory, (perFactory.get(r.factory) ?? 0) + 1);
    const why = routeProblem(b, i, occ);
    if (why) {
      errors.push(`route: route ${i} ${why}`);
      return;
    }
    for (const k of r.cells) {
      const o = beltOwner.get(k);
      if (o !== undefined) errors.push(`route: routes ${o} and ${i} cross at cell ${k}`);
      else beltOwner.set(k, i);
    }
    const jp = joinProblem(b, i, occ); // 0.6.2j (J12); routeCheck.ts reports it in the same words
    if (jp) errors.push(`route: route ${i} can't join cell ${r.join}: ${jp}`);
    if (!routeInfo(b, i, claims, occ).connected) {
      errors.push(`route: route ${i} does not end on a free turret connector (disconnected)`);
    }
  });
  for (const [uid, n] of perFactory) {
    const f = b.items.find((p) => p.uid === uid);
    // 0.6.1a: outputs at its stars. bb-0.8.3 (REQ-BFG-044 D10): the hero factory's at its FACTORY level (stars.ts gradeOf)
    const outs = f ? outputsAt(f.def, gradeOf(b, f)) || 1 : 1;
    if (f && n > outs) errors.push(`route: ${ITEMS[f.def].name} uid ${uid} feeds ${n} routes but has ${outs} output(s)`);
  }
  if (belt > b.beltCap) errors.push(`route: ${belt} belt tiles exceed beltCap ${b.beltCap}`);

  // turret equipment: a real turret; 0.6.1b, one bought turret core per socket (deck.ts coreFor). Cores ride in
  // build.mods, so buildCost already counts them. 0.6.2s TURRET SLOTS (S4, S8): ModPlacement.turret is a slot of the
  // hull (turretSlots); neither gear nor a core on an empty slot; at most the installed turret's GEAR SLOTS of gear
  // (a 1-star common, so every starting turret, has one: one mod per hardpoint, turretHasFreeHardpoint, reported per
  // extra piece as before; with more gear slots, once per turret) and never two copies of one gear def on a turret.
  const views = turretSlots(b);
  const installed = views.filter((s) => s.turret).length;
  const gearOn = new Map<number, number>();
  for (const m of b.mods) if (ITEMS[m.def].kind !== "core") gearOn.set(m.turret, (gearOn.get(m.turret) ?? 0) + 1);
  const mounted = new Map<number, string[]>(), socketed = new Set<number>();
  for (const m of b.mods) {
    const d = ITEMS[m.def];
    const core = d.kind === "core";
    if (d.kind !== "mod" && !core) errors.push(`hardpoint: uid ${m.uid} ${d.name} is not turret equipment`);
    const v = views[m.turret];
    const gear = mounted.get(m.turret) ?? [];
    if (!v) errors.push(`hardpoint: uid ${m.uid} targets turret ${m.turret}; ${h.name} has ${views.length}`);
    else if (!v.turret) errors.push(`hardpoint: uid ${m.uid} targets turret ${m.turret}; ${h.name} has ${installed} installed: uid ${m.uid} ${d.name} is on an empty turret slot ${m.turret}`);
    else if (core && socketed.has(m.turret)) errors.push(`hardpoint: turret ${m.turret} carries more than one core`);
    else if (!core && gear.length >= v.gearSlots) {
      if (v.gearSlots <= 1) errors.push(`hardpoint: turret ${m.turret} carries more than one module`);
      else if (gear.length === v.gearSlots) errors.push(`hardpoint: turret ${m.turret} carries ${gearOn.get(m.turret)} gear; its turret has ${v.gearSlots} gear slots`);
    } else if (!core && gear.includes(m.def)) errors.push(`hardpoint: turret ${m.turret} carries two ${d.name}`);
    if (core) socketed.add(m.turret);
    else mounted.set(m.turret, [...gear, m.def]);
  }

  // 0.7.0 player mode: the road's reachable hull and belt, and maxHonestSpend, replace the two blocks below
  if (mode === "player") {
    // RUNES-1: the bought hull and belt, + rune gold; Z-PREP (REQ-BFG-073): + a free LAST CHANCE part's price, named apart
    // NPC-1 (REQ-BFG-078): + the road log's drops at their value (0 without a log: the line is as before)
    // AZ-PREP (REQ-BFG-078; REVIEW-HULL1D Q1, BRIEF-AZPREP section 3): with NPC_DAY on and the uploader's seed, the road's
    // hull and belt grants (the dock's PLATING, the storm's RIDE THROUGH, the cache's BELT SPOOL) must come from events the
    // seed offered by `day`: each day's event after its fight, eventFor(seed, 1..day). Off, or without the seed (a served
    // ghost): seed-blind, as before
    // RUN-1 (D6): and a long run's events repeat once per bag (eventDefs.ts BAG_IDS): `offered` counts how many times each was
    // offered by `day` (a Map), so a deck that took an event in two bags is checked against two offers; the 10-day run: the Set
    const offered = npcDayRules() && ctx.seed !== undefined ? offeredEvents(ctx.seed, day) : undefined;
    errors.push(...playerSupplyBudget(bought, day, buildCost(bought), runeGrant.gold, freeGold, roadDropValue(ctx.road), offered));
    return { ok: errors.length === 0, errors };
  }

  // supplies: only whole belt crates and whole plating are purchasable
  const crate = ITEMS.beltcrate.supply!.belt!, plate = ITEMS.plating.supply!.hull!;
  // RUNES-1: the bought belt and hull (`bought`: the runes' own taken out)
  if (bought.beltCap < h.belt || (bought.beltCap - h.belt) % crate !== 0) {
    errors.push(`supply: beltCap ${bought.beltCap} is not ${h.belt} + a whole number of +${crate} belt crates`);
  }
  if (bought.hullBonus < 0 || bought.hullBonus % plate !== 0) {
    errors.push(`supply: hullBonus ${bought.hullBonus} is not a whole number of +${plate} plating`);
  }

  // gold budget (RUNES-1: the bought deck's cost; the dawn-gold runes' gold joins the day's most)
  const cost = buildCost(bought), max = maxGoldByDay(day) + grant.gold;
  if (cost.total > max) {
    const turrets = cost.turrets ? `, turrets ${cost.turrets}` : ""; // 0.6.2s: only when the turrets cost anything
    errors.push(`budget: build costs ${cost.total} gold (items ${cost.items}, mods ${cost.mods}, ${cost.crates} crates, ${cost.plates} plating${turrets}) but day ${day} allows at most ${max}`);
  }
  return { ok: errors.length === 0, errors };
}
