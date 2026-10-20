// Road events (0.5.0, REQ-BQR-002): the content. Each event is a titled scene with two lines
// of flavour text and 2-3 choices. A choice lists exactly what it costs and what it gives;
// events.ts applies exactly that and nothing else. Tuned so an event is worth about +2 to +4
// gold on average and none of them wins a run by itself.

import { ITEMS, buyableModules, type GateEffect, type ItemDef, type Rarity } from "../sim/content";
import { enchantRules } from "../sim/enchant"; // ENCHANT-2 (REQ-BFG-085, T3): the shrine joins the bag only under ENCHANT (eventIds, bagIds)
import { fusible, starField, starsOf, valueOf } from "../sim/stars";
import { mergePreview } from "./fuse";
import type { Run } from "./run";
import { SHRINE_ID, shrineChoices, shrineInBag } from "./shrine"; // ENCHANT-2 (REQ-BFG-085, T3): the ASH SHRINE's cards (a new file)
import { unlocked, type Wares } from "./wares"; // 0.8.0 I1 M3: road grants draw from the run's unlocked wares

/**
 * 0.8.0 I1 M3 (DESIGN-wave3.md 4.2, VERIFIED-D1 Q8): the road's part grants (SALVAGE, the SMUGGLER, the TRADER's SWAP)
 * draw from the run's wares unlocked on its day, as its caravan does; a run without wares (a save from before 0.8.0, or
 * roadCap.ts's model of every run) keeps the whole pool. A pool the draw leaves empty blocks its choice (partChoice:
 * NONE ON OFFER), as an empty catalogue pool always did. 0.8.0 B1 M4 (REQ-BFG-033): the SMUGGLER's one exception,
 * smugglerStock: an effect with no unlocked ware offers the run's own drawn wares of it that aren't unlocked yet.
 */
type WareRun = { wares?: Wares; day: number };
const inWares = (run: WareRun | undefined, ids: string[]): string[] => (run?.wares ? ids.filter((id) => unlocked(run, id, run.day)) : ids);

export type EventId = "wreck" | "cache" | "trader" | "dice" | "dock" | "herald" | "sappers" | "scout" | "storm" | "smuggler" | "shrine"; // ENCHANT-2 (T3): + "shrine"

/** One line item of a choice. Costs are paid, gains are received (for a gamble only on a win). */
export type Delta =
  | { k: "gold"; n: number }
  | { k: "lives"; n: number }
  | { k: "hull"; n: number } // max hull (build.hullBonus)
  | { k: "belt"; n: number } // belt capacity
  | { k: "item"; def: string; uid?: number; from?: "cargo" | "deck" | "mod" } // gain: new cargo item; cost: that exact part
  | { k: "bounty"; n: number } // ELITE BOUNTY: n gold for beating your next HARD warlord (run.bounty)
  | { k: "sabotage" } // SABOTAGE: your next warlord fights with its day - 1 deck (run.sabotage)
  | { k: "reveal" } // SCOUT: tonight's dusk foe is picked and stored now, its deck shown
  | { k: "discount"; n: number } // next caravan: every price -n (min 1)
  | { k: "reroll"; n: number } // next caravan: n free rerolls
  | { k: "ench"; word: string }; // ENCHANT-2 (REQ-BFG-085, T3): the ASH SHRINE's gain: a free word for a part of your choice (opens APPLY: enchanter.ts openShrineWord)

export interface Choice {
  label: string;
  cost: Delta[];
  gain: Delta[];
  odds?: number; // gamble: chance the gain comes through (the cost is always paid)
  note?: string;
  blocked?: string; // why it can't be picked right now (shown on the disabled card)
  quiet?: boolean; // Y4 (release Y; BRIEF-Y4 S3): blocked, but the card draws no line for it (the SMUGGLER's NONE ON OFFER)
}

export interface EventState {
  day: number;
  id: EventId;
  roll: number; // fixed at creation: a gamble's outcome can't change by reloading
  pick: number; // fixed at creation: which part a salvage or trade offers
  picked: number; // -1 until resolved; then the choice index (resolved events can't be picked again)
  won?: boolean;
  item?: string; // deck equipment the pick put in cargo (offers REFIT, also after a reload)
  reveal?: boolean; // SCOUT's SPY: tonight's dusk deck was revealed (offers REFIT, also after a reload)
  gave?: string; // ENCHANT-2 (REQ-BFG-085, T3): the cargo part the ASH SHRINE's second card took (so the resolved card still names it after a reload)
}

export interface EventDef {
  id: EventId;
  title: string;
  kind: string;
  text: [string, string];
  choices(run: Run, ev: EventState): Choice[];
}

const gold = (n: number): Delta => ({ k: "gold", n });
const MOVE_ON: Choice = { label: "MOVE ON", cost: [], gain: [] };
const moveOn = (label = "MOVE ON"): Choice => ({ ...MOVE_ON, label });

// --- Road items (0.6.1c, ARSENAL.md §5.2 last paragraph) ---
// SALVAGE, SMUGGLER and the trader's SWAP draw from pools read off the catalogue (ITEMS) each time,
// so a part that gains a merchant joins them with no code change. One shared pool (the operator,
// 2026-09-24): no draw reads the hero or race, only the catalogue, the parts the player holds and the
// event's fixed `pick` (makeEvent's hashSeed(seed, "event", day) stream; no new stream).

/** A part a caravan sells and that merges: a merchant stocks it and stars.ts `fusible` holds (never a
 *  supply, price-0 signature or dormant prototype). A new race module joins on merchant assignment.
 *  0.6.2s (REQ-BFG-031 step 5): turrets ride only in the caravan in 0.6.2 (never a road part, like tradeGood). */
const roadPart = (d: ItemDef): boolean => fusible(d.id) && d.kind !== "turret" && d.kind !== "converter"; // GATES-1 (REQ-BFG-052): a GATE comes from the shop, never a road event (out of scope)

/** The ids of every road part that passes `test`, in catalogue order. */
const roadParts = (test: (d: ItemDef) => boolean): string[] => buyableModules().filter((d) => roadPart(d) && test(d)).map((d) => d.id);

/** SALVAGE's pool: the common gates (0.6.1: TEMPER, WHETSTONE, GREASE WORKS and BRAKE SHOE). */
export const salvagePool = (): string[] => roadParts((d) => d.kind === "gate" && d.rarity === "common");

/** SMUGGLER's two pools: BURN (2 g) and SHOCK (3 g), the event's two choices. */
export type SmugglerKind = "BURN" | "SHOCK";

/**
 * 0.8.0 P1 (family map v2, DESIGN-wave3.md 2.5): what puts a gate in each SMUGGLER pool, read off its 1-star effect. BURN:
 * an effect that works with burn (`burn`, `burnPerRide` or `quench`); SHOCK: one that shocks or pays for stalls (`shock`,
 * `staticTime` or `perStalled`). v2 retired the BURN and SHOCK tags the pools were keyed on; this picks the same six rigs
 * as v070-rc (TEMPER, BELLOWS, QUENCH TANK; GALVANIC COIL, STATIC BRUSH, LODESTONE), and no wave-3 rig joins either pool.
 */
export const SMUGGLER_EFFECT: Readonly<Record<SmugglerKind, (e: GateEffect) => boolean>> = {
  BURN: (e) => !!(e.burn || e.burnPerRide || e.quench),
  SHOCK: (e) => !!(e.shock || e.staticTime || e.perStalled),
};

/** SMUGGLER's BURN or SHOCK pool: the gates whose effect SMUGGLER_EFFECT[kind] accepts (0.6.1: TEMPER; GALVANIC COIL). */
export const smugglerPool = (kind: SmugglerKind): string[] =>
  roadParts((d) => d.kind === "gate" && !!d.gate && SMUGGLER_EFFECT[kind](d.gate));

const ofRarity = (r: Rarity): string[] => roadParts((d) => d.rarity === r);

/** TRADER SWAP's pools: UPGRADE[r] is every road part of rarity r (gates, factories, mods and cores),
 *  read off the catalogue each time it is used. */
export const UPGRADE: Readonly<Record<Rarity, string[]>> = {
  get common() { return ofRarity("common"); },
  get rare() { return ofRarity("rare"); },
  get epic() { return ofRarity("epic"); },
  get legendary() { return ofRarity("legendary"); },
};

/** The tier a SWAP gives for a good of each rarity: one step up, at most epic. These are the tiers of the
 *  0.5.0 hand table (a common good swapped for a rare part; a rare, epic or legendary one for an epic). */
export const SWAP_TIER: Record<Rarity, Rarity> = { common: "rare", rare: "epic", epic: "epic", legendary: "epic" };

/** SALVAGE's odds of a part the player holds instead of a fresh one (ARSENAL.md §5.2). */
export const SALVAGE_OWNED = 0.35;

/** Draw from `arr` with the uniform number `u`, and return what is left of `u` (uniform again and
 *  independent of the draw), so one fixed number can make several draws. Undefined for an empty pool. */
function draw<T>(arr: readonly T[], u: number): [T | undefined, number] {
  if (!arr.length) return [undefined, u];
  const x = Math.min(Math.max(u, 0), 1 - Number.EPSILON) * arr.length;
  const i = Math.floor(x);
  return [arr[i], x - i];
}

const holds = (run: Run, def: string): boolean =>
  run.inventory.some((i) => i.def === def) || run.build.items.some((p) => p.def === def) || run.build.mods.some((m) => m.def === def);

/**
 * SALVAGE's part: fresh first, a common gate the player holds no copy of; with SALVAGE_OWNED odds one
 * the new copy merges with instead (mergePreview, so the card shows the shop's MERGE badge). With no
 * fresh gate it draws a merging one, with no merging one a fresh one, with neither any of the pool.
 * Only `pick` and the parts held decide it; they can't change while the event is open (and are saved
 * with it), so the card shows what the choice grants, also after a reload.
 */
export function salvagePart(run: Run, pick: number): string | undefined {
  const pool = inWares(run, salvagePool()); // 0.8.0 I1 M3: the run's unlocked wares
  const fresh = pool.filter((id) => !holds(run, id));
  const twins = pool.filter((id) => mergePreview(run, id) !== null);
  if (!fresh.length || !twins.length) return draw(fresh.length ? fresh : twins.length ? twins : pool, pick)[0];
  const p = SALVAGE_OWNED;
  return pick < p ? draw(twins, pick / p)[0] : draw(fresh, (pick - p) / (1 - p))[0];
}

/**
 * 0.8.0 B1 M4 (REQ-BFG-033; VERIFIED-I1's call 4, I1 REPORT open item 4): what the SMUGGLER offers of one effect, in
 * catalogue order. With a run: the run's wares in the effect's pool unlocked on its day (inWares), as before; when none of
 * them is unlocked yet, the run's own drawn wares in that pool, every one ahead of its day (contraband). It is empty, and
 * the choice blocked (NONE ON OFFER), only when the run drew none of that effect. The run's wares stay the only source:
 * never a module the run did not draw. A run without wares (an old save, roadCap.ts's model) keeps the whole pool.
 */
export function smugglerStock(kind: SmugglerKind, run?: WareRun): string[] {
  const pool = smugglerPool(kind);
  const open = inWares(run, pool);
  const wares = run?.wares;
  if (open.length || !wares) return open;
  return pool.filter((id) => Object.prototype.hasOwnProperty.call(wares, id));
}

/** Draw from `pool` with `u`, never `not` while the pool has another (draw's leftover with it). */
const drawApart = (pool: string[], not: string | undefined, u: number): [string | undefined, number] => {
  const other = pool.filter((id) => id !== not);
  return draw(other.length ? other : pool, u);
};

/** SMUGGLER's BURN part, then its SHOCK part from what is left of `pick` (never BURN's gate again while
 *  the shock pool has another). 0.8.0 I1 M3: with a run, each pool is the run's unlocked wares in it (still keyed by
 *  effect, SMUGGLER_EFFECT). 0.8.0 B1 M4 (REQ-BFG-033): a kind with no unlocked ware offers the run's drawn wares of it
 *  ahead of their day (smugglerStock), drawn from what is left of `pick` after the unlocked draws, so a kind with an
 *  unlocked ware offers exactly the part it did before; a kind the run drew none of is undefined, and its choice is
 *  blocked. */
export function smugglerParts(pick: number, run?: WareRun): [string | undefined, string | undefined] {
  const [burnOpen, rest] = draw(inWares(run, smugglerPool("BURN")), pick);
  const [shockOpen, left] = drawApart(inWares(run, smugglerPool("SHOCK")), burnOpen, rest);
  const [burn, last] = burnOpen ? [burnOpen, left] : drawApart(smugglerStock("BURN", run), shockOpen, left);
  return [burn, shockOpen ?? drawApart(smugglerStock("SHOCK", run), burn, last)[0]];
}

/** TRADER SWAP's part for a good of `def`: from UPGRADE[SWAP_TIER[its rarity]], never `def` itself. 0.8.0 I1 M3: with a
 *  run, from the run's unlocked wares in that tier. */
export function swapPart(def: string, pick: number, run?: WareRun): string | undefined {
  return draw(inWares(run, UPGRADE[SWAP_TIER[ITEMS[def].rarity]]).filter((id) => id !== def), pick)[0];
}

/** A choice that gains part `def`; blocked when its pool had none (a catalogue without such a part). */
function partChoice(label: string, cost: Delta[], def: string | undefined, note?: string): Choice {
  const c: Choice = { label, cost, gain: def ? [{ k: "item", def }] : [] };
  if (note !== undefined) c.note = note;
  if (!def) c.blocked = "NONE ON OFFER";
  return c;
}

/**
 * A SMUGGLER choice. Y4 (release Y; REVIEW-REDOX answer 3; BRIEF-Y4 S3) hid its NONE ON OFFER line (`quiet`) only because,
 * since FIX-ABE, the ALCHEMIST's rare tier always held 4+ BURN and SHOCK wares and no real run reached it. SHAPES-1 (cap's
 * ruling, oracle f08800ccfebab0ab): with SHAPES on, NAIL STRIP and EMBER TROUGH grow the ALCHEMIST's stock 9 -> 11, its
 * rare tier's quota can fall to 3, and about 0.3% of runs draw no SHOCK ware (REQ-BFG-033 always allowed such runs). A
 * blocked card must say why, so the line is back, as 0.8.0 drew it and as partChoice draws it for every other event (no
 * `quiet`). The guard stays: a blocked choice can't be picked (events.ts pickChoice). The `quiet` field and cards.ts
 * cardNote stay as they are; the pools are untouched.
 */
function smugglerChoice(label: string, cost: Delta[], def: string | undefined): Choice {
  return partChoice(label, cost, def);
}

export interface Good {
  uid: number;
  def: string;
  from: "cargo" | "deck" | "mod";
  stars?: number; // 0.6.1a: absent = 1
}

/** The trader wants your cheapest spare part: cargo first, then a gate on the deck, then turret gear.
 *  0.6.1a: "cheapest" is valueOf(def, stars), and SELL pays that value in full. */
export function tradeGood(run: Run): Good | null {
  const rank = { cargo: 0, deck: 1, mod: 2 };
  const all: Good[] = [
    // 0.6.2s (REQ-BFG-031): a turret in cargo is never a trade good (a free starting copy is worth 0 and can't be sold)
    ...run.inventory.filter((i) => ITEMS[i.def]?.kind !== "turret")
      .map((i) => ({ uid: i.uid, def: i.def, from: "cargo" as const, ...starField(starsOf(i)) })),
    ...run.build.items.filter((p) => ITEMS[p.def].kind === "gate").map((p) => ({ uid: p.uid, def: p.def, from: "deck" as const, ...starField(starsOf(p)) })),
    ...run.build.mods.map((m) => ({ uid: m.uid, def: m.def, from: "mod" as const, ...starField(starsOf(m)) })),
  ];
  const v = (g: Good) => valueOf(g.def, starsOf(g));
  all.sort((a, b) => rank[a.from] - rank[b.from] || v(a) - v(b) || a.uid - b.uid);
  return all[0] ?? null;
}

export const EVENTS: Record<EventId, EventDef> = {
  wreck: {
    id: "wreck", title: "WRECKED RAIDER", kind: "SALVAGE",
    text: ["A RAIDER'S CRUISER SMOKES IN THE DUST.", "ONE OF ITS RIGS STILL HUMS."], // beltside-062c: BELTSIDE's text (P10)
    choices: (run, ev) => [
      partChoice("SALVAGE", [], salvagePart(run, ev.pick)), // 0.6.1c: fresh first, 35% one that merges
      { label: "SCRAP IT", cost: [], gain: [gold(4)] },
      moveOn(),
    ],
  },
  cache: {
    id: "cache", title: "SUPPLY CACHE", kind: "CACHE",
    text: ["A HALF-BURIED CRATE ON THE ROADSIDE", "BEARS THE IRONMONGER'S MARK."],
    choices: () => [
      { label: "BELT SPOOL", cost: [], gain: [{ k: "belt", n: 4 }] },
      { label: "COIN POUCH", cost: [], gain: [gold(4)] },
    ],
  },
  trader: {
    id: "trader", title: "TINKER'S CART", kind: "TRADER",
    text: ["A TINKER'S CART RATTLES ALONGSIDE.", "HE PAYS FULL PRICE FOR SPARE PARTS."],
    choices: (run, ev) => {
      const g = tradeGood(run);
      if (!g) {
        const none: Choice = { label: "SELL", cost: [], gain: [], blocked: "NOTHING TO TRADE" };
        return [none, { ...none, label: "SWAP" }, moveOn()];
      }
      const give: Delta = { k: "item", def: g.def, uid: g.uid, from: g.from };
      const note = g.from === "cargo" ? undefined : g.from === "deck" ? "FROM YOUR DECK" : "FROM A TURRET";
      return [
        { label: "SELL", cost: [give], gain: [gold(valueOf(g.def, starsOf(g)))], note }, // 0.6.1a: full value
        partChoice("SWAP", [give], swapPart(g.def, ev.pick, run), note), // 0.6.1c: UPGRADE from the catalogue; 0.8.0 I1: the run's wares
        moveOn(),
      ];
    },
  },
  dice: {
    id: "dice", title: "BONE DICE", kind: "GAMBLE",
    text: ["THE GUNSMITH'S BOYS SHAKE BONE DICE.", "\"DOUBLE OR NOTHING, STRANGER?\""],
    choices: () => [
      { label: "BET 3", cost: [gold(3)], gain: [gold(8)], odds: 0.5 },
      { label: "BET 6", cost: [gold(6)], gain: [gold(17)], odds: 0.4 },
      moveOn("WALK AWAY"),
    ],
  },
  dock: {
    id: "dock", title: "FIELD DOCK", kind: "REPAIR DOCK",
    text: ["AN ORC FIELD DOCK SPITS SPARKS.", "THE WELDERS WORK FOR COIN."],
    choices: () => [
      { label: "PLATING", cost: [gold(2)], gain: [{ k: "hull", n: 200 }] },
      { label: "PATCH UP", cost: [gold(4)], gain: [{ k: "lives", n: 1 }] },
      moveOn(),
    ],
  },
  herald: {
    id: "herald", title: "WARLORD'S HERALD", kind: "ELITE BOUNTY",
    text: ["A HERALD TAKES WAGERS ON THE ROAD:", "BEAT YOUR NEXT HARD WARLORD FOR A PURSE."],
    choices: () => [
      { label: "STAKE 3", cost: [gold(3)], gain: [{ k: "bounty", n: 10 }], note: "LOST OR UNFOUGHT: GONE" },
      moveOn("DECLINE"),
    ],
  },
  sappers: {
    id: "sappers", title: "ELVEN SAPPERS", kind: "SABOTAGE",
    text: ["ELVEN SAPPERS OFFER TO RAID", "A WARLORD'S DEPOT. FOR COIN."],
    choices: () => [
      { label: "HIRE", cost: [gold(4)], gain: [{ k: "sabotage" }], note: "NEXT WARLORD: YESTERDAY'S DECK" },
      moveOn(),
    ],
  },
  scout: {
    id: "scout", title: "CARAVAN SCOUT", kind: "SCOUT",
    text: ["A TINKER'S SCOUT RIDES AHEAD", "TO THE NEXT CARAVAN, OR TO TONIGHT'S FOE."],
    choices: () => [
      { label: "HAGGLE", cost: [], gain: [{ k: "discount", n: 1 }] },
      { label: "SEND WORD", cost: [], gain: [{ k: "reroll", n: 1 }] },
      { label: "SPY", cost: [gold(1)], gain: [{ k: "reveal" }], note: "SEE TONIGHT'S DUSK DECK" },
    ],
  },
  storm: {
    id: "storm", title: "DARK WIND FRONT", kind: "DARK WIND",
    text: ["THE DARK WIND RISES OVER THE ROAD.", "RIVAL SCAVENGERS TURN BACK."],
    choices: () => [
      { label: "RIDE THROUGH", cost: [{ k: "hull", n: 100 }], gain: [gold(5)] },
      moveOn("TAKE COVER"),
    ],
  },
  smuggler: {
    id: "smuggler", title: "AMMO SMUGGLER", kind: "SMUGGLER",
    text: ["A SMUGGLER SELLS HOT RIGS FROM", "UNDER A TARP. NO QUESTIONS ASKED."], // beltside-062c: BELTSIDE's text (P10)
    choices: (run, ev) => {
      const [burn, shock] = smugglerParts(ev.pick, run); // 0.6.1c: the catalogue's burn and shock gates; 0.8.0 I1: the run's wares
      return [smugglerChoice("BURN", [gold(2)], burn), smugglerChoice("SHOCK", [gold(3)], shock), moveOn()]; // Y4 (S3)
    },
  },
  // ENCHANT-2 (REQ-BFG-085, T3): the 11th event, only under ENCHANT (eventIds/bagIds below). Three cards: a word for max hull, a word
  // for one cargo part, MOVE ON (shrine.ts shrineChoices). The gain {k: "ench"} opens APPLY (enchanter.ts openShrineWord).
  shrine: {
    id: "shrine", title: "ASH SHRINE", kind: "SHRINE",
    text: ["AN ASH-BLACK SHRINE SMOULDERS BY THE ROAD.", "ITS FLAME MARKS A PART, FOR A PRICE."],
    choices: (run, ev) => shrineChoices(run, ev),
  },
};

/** The events of the ENCHANT-off world, in catalogue order: the ten the game had before ENCHANT-2. Every consumer that does not ask the rules
 *  world (tools, the art digests, the scorecard) reads this list and sees no shrine; eventIds() adds it under ENCHANT. */
export const EVENT_IDS = (Object.keys(EVENTS) as EventId[]).filter((id) => id !== SHRINE_ID);
/** Events that act on warlords (0.6.0b, decision 5): the ELITE BOUNTY and SABOTAGE. They never
 *  touch a dusk ghost, which runs exactly as submitted. */
export const WARLORD_EVENT_IDS: EventId[] = ["herald", "sappers"];
/** The events a run can draw on the road: all of them (0.6.0b puts herald and sappers back). ENCHANT-2 (T3): the OFF world's bag; bagIds() is the
 *  rules world's (this one plus the ASH SHRINE while ENCHANT is on). */
export const BAG_IDS: EventId[] = [...EVENT_IDS];

/** ENCHANT-2 (REQ-BFG-085, T3): the events of the rules world: EVENT_IDS, plus the ASH SHRINE while ENCHANT is on (the same array with it off). */
export const eventIds = (): EventId[] => (shrineInBag() ? [...EVENT_IDS, SHRINE_ID] : EVENT_IDS);
/** ENCHANT-2 (REQ-BFG-085, T3): the bag of the rules world: BAG_IDS, plus the ASH SHRINE while ENCHANT is on, so each bag holds 11 events and
 *  the shrine comes once a bag. With ENCHANT off it is BAG_IDS itself, so every bag and eventSequence is byte for byte what it was. */
export const bagIds = (): EventId[] => (shrineInBag() ? [...BAG_IDS, SHRINE_ID] : BAG_IDS);
