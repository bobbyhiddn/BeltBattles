// 0.7.0 prep (v070-validate; REQ-BFG-009, REQ-BFG-012, REQ-BFG-019): the PLAYER mode of the deck check.
//
// validateBuild's strict mode holds a deck to the shop: whole +25 plating, whole +4 belt crates and
// cost <= maxGoldByDay(day). That is right for stand-ins, but a real player's road puts more on a deck:
//  - road gold (warlord wins, the herald's bounty, bets, SCRAP IT, the coin pouch, RIDE THROUGH). It is
//    spendable from the NEXT caravan only: REFIT after the road has no shop (build.ts "the caravan has moved on");
//  - road parts (SALVAGE, SMUGGLER, TRADER SWAP, a Hard win's pick, the Matriarch's part). Each is a 1-star copy
//    through gainModule, and REFIT can place it before that same day's dusk;
//  - the scout's next caravan: every price -1 (HAGGLE) or a free reroll (SEND WORD);
//  - hull and belt off the shop's grid: dock PLATING (+20 hull), RIDE THROUGH (-10 hull), the BELT SPOOL (+4 belt).
// This file prices all of that from the live tables: eventDefs.ts EVENTS (read under synthetic states), road.ts
// warlordReward over every captain a slot can hold, content.ts prices and merchants. validate.ts's player mode
// (validateUpload) asks it two things: which hull and belt values an honest run can reach by a day, and
// maxHonestSpend(day) = maxGoldByDay(day) + roadCap(day). docs/ASYNC.md "Validation" has the rules in prose.
//
// roadCap(day) is the most extra value any honest run can have put on its deck by that dusk (a safe upper
// bound; REPORT.md v070-validate §2 gives the per-day values and the slack). It is a max over every road plan:
//  - one road stop a day (road.ts pickRoad): the day's event or a warlord of one tier;
//  - each event at most once a run (events.ts eventSequence: days 1-10 are one bag of all ten events), on any day;
//  - the Iron Matriarch holds the Hard slot from MATRIARCH_DAY until beaten, so she pays once;
//  - a staked bounty pays on the next Hard win (any Hard fight takes it);
//  - fights are won and bets win (the max);
//  - a gain of gold counts only when it can still be spent (day < the deck's day); gold paid always counts;
//  - the discount counts DG(gold at that caravan): rolls of at most OFFERS distinct defs, rerolls at REROLL_COST.
// A deck whose hull or belt used a road event (a "mix") is checked against the plans that took that event with
// that choice, so its hull and belt are costed at their cheapest honest mix (D3), never double counted.
// NPC-1 (REQ-BFG-077, REQ-BFG-078), with NPC_DAY on (src/sim/npcDay.ts; off, all of the above is unchanged): every day is
// a warlord fight AND then the day's event (npcPlanDP); a fight prices its gold only, and the drops (the Matriarch's
// legendary part among them) are named in the snapshot's road log and counted at their value by validate.ts.

import { HEROES, ITEMS, MERCHANTS, OFFERS, REROLL_COST, buyableModules, itemsSoldBy, type MerchantId } from "../sim/content";
import type { Build } from "../sim/deck";
import { starsOf, valueOf } from "../sim/stars";
import { MATRIARCH_DAY, maxGoldByDay as shopGold, warlordPool, type Difficulty, type RivalId } from "../sim/rivals";
import { EVENTS, bagIds, eventIds, type Choice, type Delta, type EventId, type EventState } from "../game/eventDefs"; // ENCHANT-2 (REQ-BFG-085, T3): the rules world's lists (bagIds, eventIds): with ENCHANT on they hold the ASH SHRINE
import { ROAD_PICKS, warlordDeck, warlordDeckDay, warlordReward } from "../game/road";
import type { WarlordReward } from "../game/roadTypes";
import { newRun, type Run } from "../game/run";
import { gainModule } from "../game/fuse";
import type { BuildCost } from "./validate"; // type only: validate.ts's buildCost is the strict mode's cost
import { npcDayRules } from "../sim/npcDay"; // NPC-1 (REQ-BFG-077, REQ-BFG-078): the NPC day's plans
import { hullScaleRules } from "../sim/hullScale"; // HULL-1c (REQ-BFG-079): the memo keys carry the switch
import { shapesRules } from "../sim/shapes"; // SHAPES-1 (REQ-BFG-086 S1): the catalogue memos reset when it moves
import { longRunRules } from "../sim/longRun"; // RUN-1 (REQ-BFG-059, D6): a long run's events repeat once per bag
import { plainRigsRules } from "../sim/plainRigs"; // PLAIN-1 (REQ-BFG-084): the memos hold one switch state (plainMemo)
import { shapes2Rules } from "../sim/shapes2"; // SHAPES-2 (REQ-BFG-114): the six more shaped rigs change the catalogue too (plainMemo)
import { shrineInBag } from "../game/shrine";
import { enchantRules } from "../sim/enchant"; // ENCHANT-2 (REQ-BFG-085, T3): the ASH SHRINE is on the road only with ENCHANT on (plainMemo keys the memos on it)

// RUN-1 (REQ-BFG-059, REQ-BFG-116; D6): THE EVENT BAGS. A run's events come in shuffled bags of every event once (events.ts
// eventSequence; BAG_IDS: 10), so days 1-10 are bag 1, days 11-20 bag 2, and so on. The 10-day run never leaves bag 1, and
// "each event at most once a run" is exact for it. A long run (the world's switch, longRunRules(): validate.ts inRulesWorld puts
// it to the record's rules) meets every event once per BAG: the event mask below RESETS at each bag boundary (exact for the bag
// rule, the same state size), and a hull or belt mix may take its event once per bag (roadMixesFor: the dock's PLATING in two
// bags is 2 x +hull). Without that, an honest day-11+ deck that took a repeated event would be REFUSED. With the switch off
// every line below reads exactly as before: one bag, each event once.
/** ENCHANT-2 (T3): the days one event bag covers in the rules world: 10 (BAG_IDS) with ENCHANT off, 11 with the ASH SHRINE in the bag. */
const bagLen = (): number => bagIds().length;

/** RUN-1: the event bags a run of `days` days has reached: ceil(days / BAG) on a long run, 1 on a 10-day run (any `days`). */
export function bagsFor(days: number): number {
  return longRunRules() ? Math.max(1, Math.ceil(days / bagLen())) : 1;
}

/** PLAIN-1 (REQ-BFG-084): the memos below read the catalogue (the TRADER's goods, the scout's discount), which PLAIN_RIGS
 *  changes, so they hold one switch state: a call made in the other state forgets them first (resetRoadCapMemo). With the
 *  switch never moved (the game, the server) this never resets anything. */
let memoPlain = plainRigsRules();
let memoShapes2 = shapes2Rules(); // SHAPES-2 (REQ-BFG-114): SHAPES2 adds six rigs to the catalogue, so it keys the memos the same way
let memoEnchant = shrineInBag(); // ENCHANT-2 (REQ-BFG-085, T3): ENCHANT adds the ASH SHRINE to the road (eventIds), so it keys the memos the same way
function plainMemo(): void {
  if (plainRigsRules() === memoPlain && shapes2Rules() === memoShapes2 && shrineInBag() === memoEnchant) return;
  resetRoadCapMemo();
  memoPlain = plainRigsRules();
  memoShapes2 = shapes2Rules();
  memoEnchant = shrineInBag();
}

// ------------------------------------------------------------------ D4: the reviewed model

/** Something the ceiling does not model yet: new road content must update this file on purpose. */
export class RoadModelError extends Error {
  constructor(message: string) {
    super(`roadCap: ${message} is not modelled (update src/net/roadCap.ts)`);
    this.name = "RoadModelError";
  }
}

/** How the ceiling reads each Delta kind. A kind added to eventDefs.ts's Delta fails to compile here, and the
 *  D4 guard test fails on any kind, event or reward the model has not reviewed. */
const DELTA_MODEL: Record<Delta["k"], string> = {
  gold: "a gain is spendable from the next caravan; a cost is paid from the purse (always counts)",
  lives: "no deck value",
  hull: "the deck's hull mix (D3): not a budget item",
  belt: "the deck's belt mix (D3): not a budget item",
  item: "a gain is a 1-star copy (gainModule) worth its price; a cost is the part given, worth its value",
  bounty: "gold the next Hard win pays",
  sabotage: "no deck value (the Hard pick is valued with and without it)",
  reveal: "no deck value",
  discount: "every price -n at the next caravan: discountGain",
  reroll: "n free rerolls at the next caravan: n x REROLL_COST",
  ench: "ENCHANT-2 (T3): the ASH SHRINE's free word: no gold and no deck value in the ceiling (the server counts the shrine's words: enchantCheck.ts)",
};
export const MODELLED_DELTAS = Object.keys(DELTA_MODEL) as readonly Delta["k"][];

/**
 * The reviewed road events and the synthetic states their choices are read under: "fixed" (one run, any pick),
 * "picks" (the event's fixed `pick` swept over [0, 1): SALVAGE's and the SMUGGLER's parts) or "goods" (the
 * sweep for a run holding each buyable part in turn: the TRADER's good and its SWAP). A new EventId fails to
 * compile here; checkRoadModel refuses an EVENT_IDS entry that is not reviewed.
 */
export const MODELLED_EVENTS: Readonly<Record<EventId, "fixed" | "picks" | "goods">> = {
  wreck: "picks", cache: "fixed", trader: "goods", dice: "fixed", dock: "fixed",
  herald: "fixed", sappers: "fixed", scout: "fixed", storm: "fixed", smuggler: "picks",
  shrine: "fixed", // ENCHANT-2 (T3): card 1 (a word for max hull) is a RIDE THROUGH-like hull mix; card 2 (a cargo part) is blocked in the synthetic run and costs a part, which never raises the ceiling
};

/** The fork's picks (road.ts ROAD_PICKS) and a warlord reward's fields (roadTypes.ts WarlordReward), as reviewed. */
export const MODELLED_PICKS: readonly string[] = ["event", "easy", "medium", "hard"];
const REWARD_MODEL: Record<keyof WarlordReward, string> = {
  gold: "gold on the run's day (road.ts rewardGold; 0.6.2 EASY PAY: Easy 3 from day 4, SABOTAGE or not), spendable from the next caravan",
  parts: "a Hard win takes 1 of them (a 1-star copy through takePart/gainModule)",
  legendary: "the Matriarch: parts[0] straight to cargo (a 1-star copy through gainModule)",
  // NPC-1 (REQ-BFG-078; NPC_DAY on, absent while off): a win's drop chance. The ceiling never prices a drop from it: the
  // drops a run got are named in its snapshot's road log and counted there at their value (validate.ts roadDropValue)
  chance: "NPC_DAY: the drop's chance (the drop itself is counted from the snapshot's road log, validate.ts)",
};
export const MODELLED_REWARD_FIELDS = Object.keys(REWARD_MODEL) as readonly (keyof WarlordReward)[];

/** events.ts blockReason's HULL TOO WEAK: a hull cost is refused when the hero's hull + hullBonus - cost < 100. */
export const HULL_FLOOR = 1000;

/** Throws RoadModelError when the live road content has an event or a fork pick the model has not reviewed. */
export function checkRoadModel(): void {
  for (const e of eventIds()) if (!Object.prototype.hasOwnProperty.call(MODELLED_EVENTS, e)) throw new RoadModelError(`road event "${e}"`);
  for (const p of ROAD_PICKS) if (!MODELLED_PICKS.includes(p)) throw new RoadModelError(`fork pick "${p}"`);
}

function checkReward(r: WarlordReward): void {
  for (const k of Object.keys(r)) if (!MODELLED_REWARD_FIELDS.includes(k as keyof WarlordReward)) throw new RoadModelError(`warlord reward field "${k}"`);
}

// ------------------------------------------------------------------ road options, read from the live events

/** One way to resolve a road event, as the ceiling values it. */
export interface RoadOption {
  event: EventId;
  label: string;
  gold: number; // gold received (a gamble: if won)
  pay: number; // gold paid
  parts: number; // value of the parts received (1-star copies: their price) minus the value of a part given
  hull: number; // max hull change (build.hullBonus)
  belt: number; // belt capacity change (build.beltCap)
  bounty: number; // gold the next Hard win pays
  discount: number; // every price -n at the next caravan
  reroll: number; // free rerolls at the next caravan
}

const PICK_GRID = 64; // pick sweep for "picks" and "goods" events: (j + 0.5) / 64 reaches every entry of a pool up to 64

function syntheticRun(): Run {
  const run = newRun("furnace", 1, "roadcap-model"); // the road's pools are hero-blind (eventDefs.ts, one shared pool)
  // 0.8.0 I1 M3: no per-run draw here. A run's road grants come from its own wares (eventDefs.ts), a subset of the whole
  // pool, so the ceiling reads the whole pool and stays an upper bound over every run's draw. The upload check and
  // RULES_VERSION don't move.
  delete run.wares;
  return run;
}

/** The value of the exact part a choice takes (the trader's good), at its stars. */
function givenValue(run: Run, d: Extract<Delta, { k: "item" }>): number {
  const copy = [...run.inventory, ...run.build.items, ...run.build.mods].find((c) => c.uid === d.uid);
  return valueOf(d.def, copy ? starsOf(copy) : 1);
}

function optionOf(e: EventId, c: Choice, run: Run): RoadOption {
  const o: RoadOption = { event: e, label: c.label, gold: 0, pay: 0, parts: 0, hull: 0, belt: 0, bounty: 0, discount: 0, reroll: 0 };
  for (const d of c.cost) {
    switch (d.k) {
      case "gold": o.pay += d.n; break;
      case "hull": o.hull -= d.n; break;
      case "belt": o.belt -= d.n; break;
      case "item": o.parts -= givenValue(run, d); break;
      case "lives": break;
      default: throw new RoadModelError(`a "${d.k}" cost (${e} ${c.label})`);
    }
  }
  for (const d of c.gain) {
    switch (d.k) {
      case "gold": o.gold += d.n; break;
      case "hull": o.hull += d.n; break;
      case "belt": o.belt += d.n; break;
      case "item": o.parts += valueOf(d.def, 1); break; // gainModule: a 1-star copy
      case "bounty": o.bounty += d.n; break;
      case "discount": o.discount += d.n; break;
      case "reroll": o.reroll += d.n; break;
      case "lives": case "sabotage": case "reveal": case "ench": break; // ENCHANT-2 (T3): "ench" has no gold or deck value here
      default: throw new RoadModelError(`a "${(d as Delta).k}" gain (${e} ${c.label})`);
    }
  }
  return o;
}

let optionsMemo: Map<EventId, RoadOption[]> | null = null;

/** SHAPES-1 (REQ-BFG-086 S1): the switch the memos below were made under. Every memo here reads the catalogue (the
 *  trader's goods, the scout's discount, the captains' parts by value), which SHAPES changes (three rigs, ASSEMBLY LINE's
 *  price), so each memoised reader drops them all when the switch has moved since (tools and tests only: the game never
 *  moves it). With the switch never moved nothing is dropped: 0.9.9's memos. */
let memoShapes: boolean | null = null;
function shapesMemos(): void {
  const on = shapesRules();
  if (memoShapes === on) return;
  if (memoShapes !== null) {
    optionsMemo = null;
    mixMemo.clear();
    payMemo.clear();
    dgMemo.clear();
    liquidMemo.clear();
    capMemo.clear();
  }
  memoShapes = on;
}

/** Every distinct way to resolve each road event, read from EVENTS under the synthetic states of MODELLED_EVENTS
 *  (a blocked choice is skipped: it can't be taken in that state). */
export function roadOptions(): ReadonlyMap<EventId, readonly RoadOption[]> {
  shapesMemos();
  plainMemo(); // PLAIN-1
  if (optionsMemo) return optionsMemo;
  checkRoadModel();
  const out = new Map<EventId, RoadOption[]>();
  for (const e of eventIds()) {
    const fam = MODELLED_EVENTS[e];
    const runs = fam === "goods"
      ? [syntheticRun(), ...buyableModules().map((d) => {
        const r = syntheticRun();
        gainModule(r, d.id);
        return r;
      })]
      : [syntheticRun()];
    const picks = fam === "fixed" ? [0.5] : Array.from({ length: PICK_GRID }, (_, j) => (j + 0.5) / PICK_GRID);
    const seen = new Map<string, RoadOption>();
    for (const run of runs) {
      for (const pick of picks) {
        const ev: EventState = { day: 1, id: e, roll: 0, pick, picked: -1 };
        for (const c of EVENTS[e].choices(run, ev)) {
          if (c.blocked) continue;
          const o = optionOf(e, c, run);
          seen.set(JSON.stringify(o), o);
        }
      }
    }
    out.set(e, [...seen.values()]);
  }
  optionsMemo = out;
  return out;
}

// ------------------------------------------------------------------ warlord rewards

/** What a won fight can pay on a day: gold (spendable from the next caravan) and the part taken (placed today). */
export interface WarlordPay {
  id: RivalId;
  sabotaged: boolean;
  gold: number;
  part: number; // the best part's value (a Hard win: the priciest of its parts; the Matriarch: parts[0]), 1 star
}

const payMemo = new Map<string, WarlordPay[]>();

/** Every captain `slot` can hold on `day` (any run seed: the whole pool; the Matriarch from MATRIARCH_DAY), with
 *  and without a pending SABOTAGE (it swaps the deck, so the parts on offer), and what beating it pays. The gold is
 *  the run day's, as road.ts warlordFight reads it (0.6.2 EASY PAY: SABOTAGE swaps the deck, never the day's pay). */
export function warlordPays(slot: Difficulty | "matriarch", day: number): readonly WarlordPay[] {
  shapesMemos();
  plainMemo(); // PLAIN-1
  const k = `${slot}|${day}|${npcDayRules()}|${longRunRules()}`; // NPC-1: the reward differs with NPC_DAY on (no Hard pick); RUN-1: the captains' tables past day 10 differ on a long run
  const hit = payMemo.get(k);
  if (hit) return hit;
  const ids: RivalId[] = slot === "matriarch" ? (day >= MATRIARCH_DAY ? ["matriarch"] : []) : warlordPool(slot);
  const tier: Difficulty = slot === "matriarch" ? "hard" : slot;
  const out: WarlordPay[] = [];
  for (const id of ids) {
    for (const sabotaged of [false, true]) {
      const r = warlordReward(id, tier, warlordDeck(id, day, sabotaged), warlordDeckDay(id, day, sabotaged), day);
      checkReward(r);
      const prices = r.parts.map((p) => valueOf(p, 1));
      const part = !prices.length ? 0 : r.legendary ? prices[0] : Math.max(...prices);
      out.push({ id, sabotaged, gold: r.gold, part });
    }
  }
  payMemo.set(k, out);
  return out;
}

/** The best a won fight of `slot` pays on `day`, counting its gold only when `gold` (it can still be spent) and
 *  its part only when `part`. */
function bestPay(slot: Difficulty | "matriarch", day: number, gold: boolean, part = true): number {
  let best = -Infinity;
  for (const p of warlordPays(slot, day)) best = Math.max(best, (gold ? p.gold : 0) + (part ? p.part : 0));
  return best;
}

// ------------------------------------------------------------------ the scout's discount

const dgMemo = new Map<string, number>();

/**
 * DG: the most a caravan with every price -n (min 1) can add to a deck beyond the gold spent, holding `gold`.
 * Each purchase saves price - max(1, price - n); a roll offers at most OFFERS distinct defs (merchants are drawn
 * without replacement, each def has one merchant, a wagon never repeats a def), so one roll buys at most OFFERS
 * of them; each reroll costs REROLL_COST, which is gold that never reaches the deck. Exact over that model: a
 * knapsack per roll, then a max-plus sum over rolls.
 */
export function discountGain(n: number, gold: number): number {
  shapesMemos();
  plainMemo(); // PLAIN-1
  const G = Math.max(0, Math.floor(gold));
  const key = `${n}|${G}`;
  const hit = dgMemo.get(key);
  if (hit !== undefined) return hit;
  const defs = new Map<string, { pay: number; save: number }>();
  for (const m of Object.keys(MERCHANTS) as MerchantId[]) {
    for (const d of itemsSoldBy(m)) {
      const pay = Math.max(1, d.price - n);
      if (d.price - pay > 0) defs.set(d.id, { pay, save: d.price - pay });
    }
  }
  // one roll: best[c][x] = most saved with c purchases of distinct defs and at most x gold
  const best = Array.from({ length: OFFERS + 1 }, () => new Float64Array(G + 1).fill(-Infinity));
  best[0].fill(0);
  for (const { pay, save } of defs.values()) {
    for (let c = OFFERS; c >= 1; c--) {
      for (let x = G; x >= pay; x--) {
        const v = best[c - 1][x - pay] + save;
        if (v > best[c][x]) best[c][x] = v;
      }
    }
  }
  const roll = new Float64Array(G + 1);
  for (let x = 0; x <= G; x++) for (let c = 0; c <= OFFERS; c++) roll[x] = Math.max(roll[x], best[c][x]);
  // any number of rolls: h[x] = most saved minus reroll gold, all within x gold
  let h = Float64Array.from(roll);
  for (let r = 1; r <= G; r++) {
    const next = Float64Array.from(h);
    let better = false;
    for (let x = REROLL_COST; x <= G; x++) {
      for (let y = 0; y <= x - REROLL_COST; y++) {
        const v = h[x - REROLL_COST - y] + roll[y] - REROLL_COST;
        if (v > next[x]) {
          next[x] = v;
          better = true;
        }
      }
    }
    h = next;
    if (!better) break;
  }
  const out = Math.max(0, h[G]);
  dgMemo.set(key, out);
  return out;
}

// ------------------------------------------------------------------ mixes: the road's hull and belt (D3)

/** A deck's hull/belt "mix": the road events whose choice moved its hull or belt (each once a run). */
export interface Mix {
  key: string; // "" for none
  forced: ReadonlyMap<EventId, readonly RoadOption[]>; // each forced event, taken with one of these choices
  /** RUN-1: how many bags took the forced choice, per forced event (absent: once, a 10-day run's mix). Each use is in a
   *  different bag (an event comes once per bag), so a count is at most the bags the day has reached (roadMixesFor). */
  counts?: ReadonlyMap<EventId, number>;
  hull: number; // the mix's hull change
  belt: number; // the mix's belt change
  hullCost: boolean; // a choice pays hull (RIDE THROUGH): the HULL_FLOOR applies
  labels: string[]; // "dock PLATING", ...
}

const mixMemo = new Map<number, Mix[]>(); // by bags (RUN-1); bags = 1 is the 10-day run's list

/** Every mix: for each event with a choice that moves hull or belt, not used for them, or one such choice. */
export function roadMixes(): readonly Mix[] {
  return roadMixesFor(1);
}

/**
 * RUN-1 (REQ-BFG-059, D6): the mixes of a run that has reached `bags` event bags. Each event with a hull or belt choice is not
 * used for them, or used with one such choice in n of the bags (1..bags): the dock's PLATING in two bags is two plates
 * (hull x2), the cache's BELT SPOOL in three, a RIDE THROUGH twice. With bags = 1 exactly roadMixes()'s list, in its order
 * (the 10-day run), with the same keys.
 */
export function roadMixesFor(bags: number): readonly Mix[] {
  shapesMemos();
  plainMemo(); // PLAIN-1
  const hit = mixMemo.get(bags);
  if (hit) return hit;
  let out: Mix[] = [{ key: "", forced: new Map(), hull: 0, belt: 0, hullCost: false, labels: [] }];
  for (const [e, list] of roadOptions()) {
    const sigs = new Map<string, RoadOption[]>();
    for (const o of list) {
      if (o.hull === 0 && o.belt === 0) continue;
      const k = `${o.hull},${o.belt}`;
      sigs.set(k, [...(sigs.get(k) ?? []), o]);
    }
    if (!sigs.size) continue;
    const next: Mix[] = [];
    for (const m of out) {
      next.push(m);
      for (const [k, opts] of sigs) {
        for (let n = 1; n <= bags; n++) {
          next.push({
            key: `${m.key}${m.key ? " " : ""}${e}(${k})${n > 1 ? `x${n}` : ""}`,
            forced: new Map([...m.forced, [e, opts]]),
            ...(bags > 1 ? { counts: new Map([...(m.counts ?? []), [e, n]]) } : {}),
            hull: m.hull + n * opts[0].hull,
            belt: m.belt + n * opts[0].belt,
            hullCost: m.hullCost || opts[0].hull < 0,
            labels: [...m.labels, `${e} ${[...new Set(opts.map((o) => o.label))].join("/")}${n > 1 ? ` x${n}` : ""}`],
          });
        }
      }
    }
    out = next;
  }
  mixMemo.set(bags, out);
  return out;
}

const NO_MIX = (): Mix => roadMixes()[0];

// ------------------------------------------------------------------ the road plan DP (D2)

/** One day of the best plan (explain). */
export interface PlanDay {
  day: number;
  pick: string; // "hard", "matriarch", "event dice: BET 6", ...
  value: number;
}

interface DpResult {
  value: number; // -Infinity: the mix's events don't fit in the days
  plan: PlanDay[];
}

/**
 * The best road plan over days 1..days. "deck": the extra value on a deck at the dusk of day `days` (gold
 * counts when received before that day; the next caravan's discount or free reroll when it comes by then).
 * "liquid": the gold a run can hold at a later caravan (every gain counts, parts at full value: a safe
 * over-count), with the discount events left out (their day is that caravan's eve).
 */
function planDP(days: number, mix: Mix, mode: "deck" | "liquid", trace = false, hoard = false): DpResult {
  if (npcDayRules()) return npcPlanDP(days, mix, mode, trace, hoard); // NPC-1 (REQ-BFG-077): a fight and the event every day
  // RUN-1: the plan below (NPC_DAY off: 0.9.7's road, only a test or a record under rules before bb-0.10.0 reads it) is the
  // 10-day run's alone: one event bag, no mask reset. A long run's rules are bb-0.10.0 or later, which always play the NPC day.
  const all = roadOptions();
  const discountEvents = new Set([...all].filter(([, l]) => l.some((o) => o.discount > 0)).map(([e]) => e));
  const events = eventIds().filter((e) => mode === "deck" || !discountEvents.has(e));
  const E = events.length;
  const opts = events.map((e) => {
    const list = all.get(e)!;
    if (mode === "liquid") return [...list];
    return [...(mix.forced.get(e) ?? list.filter((o) => o.hull === 0 && o.belt === 0))];
  });
  const forcedMask = events.reduce((m, e, i) => (mix.forced.has(e) ? m | (1 << i) : m), 0);
  const amounts = [0, ...new Set(opts.flat().filter((o) => o.bounty > 0).map((o) => o.bounty))];
  const B = amounts.length;
  const S = (1 << E) * 2 * B;
  const at = (mask: number, beaten: number, b: number) => (mask * 2 + beaten) * B + b;
  let cur = new Float64Array(S).fill(-Infinity);
  cur[0] = 0;
  const back: { from: Int32Array; what: (string | undefined)[]; val: Float64Array }[] = [];
  for (let d = 1; d <= days; d++) {
    const nxt = new Float64Array(S).fill(-Infinity);
    const from = trace ? new Int32Array(S).fill(-1) : new Int32Array(0);
    const what: (string | undefined)[] = trace ? new Array(S) : [];
    const val = trace ? new Float64Array(S) : new Float64Array(0);
    const gold = mode === "liquid" || d < days; // gold received today can still be spent
    const caravan = mode === "deck" && d + 1 <= days; // the next caravan comes before the deck's dusk
    const parts = !(mode === "liquid" && hoard); // hoard (diagnostic): parts stay on the deck, never fund the discount
    const flat = Math.max(0, bestPay("easy", d, gold, parts), bestPay("medium", d, gold, parts)); // 0: a lost fight
    const hard = bestPay("hard", d, gold, parts);
    const queen = d >= MATRIARCH_DAY ? bestPay("matriarch", d, gold, parts) : -Infinity;
    // each event's options today: [value, bounty index (-1 keeps the pending bounty), label]
    const today = opts.map((list) => {
      const byClass = new Map<number, { v: number; label: string }>();
      for (const o of list) {
        // hoard: a part received funds nothing, and a part given (the trader's good) was paid for by gold counted already
        let v = (gold ? o.gold : 0) - o.pay + (parts ? o.parts : Math.min(0, o.parts));
        if (caravan) v += o.reroll * REROLL_COST + (o.discount > 0 ? discountGain(o.discount, gmax(d + 1, hoard)) : 0);
        const cls = o.bounty > 0 ? amounts.indexOf(o.bounty) : -1;
        const had = byClass.get(cls);
        if (!had || v > had.v) byClass.set(cls, { v, label: o.label });
      }
      return [...byClass].map(([cls, x]) => ({ cls, v: x.v, label: x.label }));
    });
    const put = (s: number, s2: number, x: number, label: string, gain: number) => {
      if (x > nxt[s2]) {
        nxt[s2] = x;
        if (trace) {
          from[s2] = s;
          what[s2] = label;
          val[s2] = gain;
        }
      }
    };
    for (let s = 0; s < S; s++) {
      const v = cur[s];
      if (v === -Infinity) continue;
      const b = s % B, beaten = Math.floor(s / B) % 2, mask = Math.floor(s / (2 * B));
      put(s, s, v + flat, "easy/medium (or a lost fight)", flat);
      const bounty = gold ? amounts[b] : 0;
      if (d >= MATRIARCH_DAY && !beaten) put(s, at(mask, 1, 0), v + queen + bounty, `matriarch${b ? " + bounty" : ""}`, queen + bounty);
      else put(s, at(mask, beaten, 0), v + hard + bounty, `hard${b ? " + bounty" : ""}`, hard + bounty);
      for (let i = 0; i < E; i++) {
        if (mask & (1 << i)) continue;
        const m2 = mask | (1 << i);
        for (const o of today[i]) put(s, at(m2, beaten, o.cls >= 0 ? o.cls : b), v + o.v, `event ${events[i]}: ${o.label}`, o.v);
      }
    }
    if (trace) back.push({ from, what, val });
    cur = nxt;
  }
  let bestS = -1;
  for (let s = 0; s < S; s++) {
    const mask = Math.floor(s / (2 * B));
    if ((mask & forcedMask) === forcedMask && cur[s] > (bestS < 0 ? -Infinity : cur[bestS])) bestS = s;
  }
  if (bestS < 0 || cur[bestS] === -Infinity) return { value: -Infinity, plan: [] };
  const plan: PlanDay[] = [];
  if (trace) {
    let s = bestS;
    for (let d = days; d >= 1; d--) {
      const t = back[d - 1];
      plan.unshift({ day: d, pick: t.what[s] ?? "?", value: t.val[s] });
      s = t.from[s];
    }
  }
  return { value: cur[bestS], plan };
}

/**
 * NPC-1 (REQ-BFG-077, REQ-BFG-078; NPC_DAY on): planDP for the NPC day. Every day is a warlord fight AND then an event
 * (each event at most once a run; taking none is allowed, so the max stays an upper bound over the one bag a run meets).
 * The fight pays its gold only (the best tier's, the Matriarch's once, a pending bounty on a Hard win): no part is priced
 * here, because every drop (the Matriarch's legendary part too) is named in the snapshot's road log and counted there at
 * its value (validate.ts, roadDropValue). The fight comes first, so a bounty staked at a day's event pays from the next
 * day's Hard fight on. Gold, discounts and rerolls count as in planDP.
 * HULL-1c (REQ-BFG-078; REVIEW-HULL1A Q1): on the deck's own day the fight's gold, which can't reach the deck, pays that
 * day's event's gold cost first (was: the cost always counted, so day 1 with the dock's PLATING read -2).
 */
function npcPlanDP(days: number, mix: Mix, mode: "deck" | "liquid", trace: boolean, hoard: boolean): DpResult {
  const all = roadOptions();
  const discountEvents = new Set([...all].filter(([, l]) => l.some((o) => o.discount > 0)).map(([e]) => e));
  const events = eventIds().filter((e) => mode === "deck" || !discountEvents.has(e));
  const E = events.length;
  // RUN-1 (REQ-BFG-059, D6): a long run's bags. `long` resets the event mask at each bag boundary; the mix's forced events may
  // each be taken with their forced choice in `need[i]` bags (a count tracked in the state's low digits `c`, radix need + 1,
  // exactly need[i] by the end). A forced event keeps its other (hull- and belt-neutral) choices for the bags it is not
  // forced in. Not `long` (the 10-day run, or any run of at most one bag's days): the code below is the old one exactly: a
  // forced event takes only its forced choices and the plan must take it (forcedMask), no counts (C = 1), the same states.
  const long = longRunRules() && days > bagLen(); // a run of at most one bag's days never leaves bag 1
  const isForced = events.map((e) => mode === "deck" && mix.forced.has(e));
  const need = events.map((e, i) => (long && isForced[i] ? mix.counts?.get(e) ?? 1 : 0));
  const forcedMask = long ? 0 : isForced.reduce((m, f, i) => (f ? m | (1 << i) : m), 0);
  const stride: number[] = [];
  let C = 1;
  for (let i = 0; i < E; i++) {
    stride.push(C);
    C *= need[i] + 1;
  }
  const cTarget = need.reduce((t, n, i) => t + n * stride[i], 0);
  const cnt = (c: number, i: number) => Math.floor(c / stride[i]) % (need[i] + 1);
  // each event's options: [neutral (or every option, in liquid mode)], and the forced events' forced choices apart
  const optsNeutral = events.map((e, i) => {
    const list = all.get(e)!;
    if (mode === "liquid") return [...list];
    return isForced[i] && !long ? [...mix.forced.get(e)!] : list.filter((o) => o.hull === 0 && o.belt === 0);
  });
  const optsForced = events.map((e, i) => (long && isForced[i] ? [...mix.forced.get(e)!] : []));
  const amounts = [0, ...new Set([...optsNeutral.flat(), ...optsForced.flat()].filter((o) => o.bounty > 0).map((o) => o.bounty))];
  const B = amounts.length;
  const S = (1 << E) * 2 * B * C;
  const at = (mask: number, beaten: number, b: number, c = 0) => ((mask * 2 + beaten) * B + b) * C + c;
  let cur = new Float64Array(S).fill(-Infinity);
  cur[0] = 0;
  const back: { from: Int32Array; what: (string | undefined)[]; val: Float64Array }[] = [];
  const collapsed = new Map<number, Int32Array>(); // trace: the day's bag-boundary collapse, new state -> the state it came from
  for (let d = 1; d <= days; d++) {
    // RUN-1: a new event bag opens on day BAG + 1, 2 BAG + 1, ...: every event is on the road again (the mask forgets), the
    // Matriarch, the staked bounty and the forced counts carry over
    if (long && d > 1 && (d - 1) % bagLen() === 0) {
      const merged = new Float64Array(S).fill(-Infinity);
      const arg = trace ? new Int32Array(S).fill(-1) : null;
      for (let s = 0; s < S; s++) {
        const v = cur[s];
        if (v === -Infinity) continue;
        const c = s % C, r = (s - c) / C, b = r % B, beaten = Math.floor(r / B) % 2;
        const t = at(0, beaten, b, c);
        if (v > merged[t]) {
          merged[t] = v;
          if (arg) arg[t] = s;
        }
      }
      cur = merged;
      if (arg) collapsed.set(d, arg);
    }
    const gold = mode === "liquid" || d < days;
    const caravan = mode === "deck" && d + 1 <= days;
    const parts = !(mode === "liquid" && hoard);
    // the fight: its gold only (bestPay's part = false: the drops are the road log's)
    const flat = Math.max(0, bestPay("easy", d, gold, false), bestPay("medium", d, gold, false));
    const hard = bestPay("hard", d, gold, false);
    const queen = d >= MATRIARCH_DAY ? bestPay("matriarch", d, gold, false) : -Infinity;
    // HULL-1c (REQ-BFG-078; REVIEW-HULL1A Q1): `fund`, the day's fight gold that pays the event's gold cost (0: none; see
    // the deck's day below)
    // RUN-1: each entry says whether it is the event's forced choice (`f`: it adds one to the event's count)
    const options = (fund: number) => events.map((_, i) => {
      const out: { cls: number; v: number; label: string; f: boolean }[] = [];
      for (const [list, f] of [[optsNeutral[i], false], [optsForced[i], true]] as const) {
        const byClass = new Map<number, { v: number; label: string }>();
        for (const o of list) {
          let v = (gold ? o.gold : 0) - o.pay + (parts ? o.parts : Math.min(0, o.parts));
          if (fund > 0) v += Math.min(o.pay, fund); // HULL-1c: the cost counts only past the fight's gold
          if (caravan) v += o.reroll * REROLL_COST + (o.discount > 0 ? discountGain(o.discount, gmax(d + 1, hoard)) : 0);
          const cls = o.bounty > 0 ? amounts.indexOf(o.bounty) : -1;
          const had = byClass.get(cls);
          if (!had || v > had.v) byClass.set(cls, { v, label: o.label });
        }
        for (const [cls, x] of byClass) out.push({ cls, v: x.v, label: x.label, f });
      }
      return out;
    });
    const today = options(0);
    const funded = new Map<number, ReturnType<typeof options>>(); // HULL-1c: the deck's day's options by fund
    const todayAt = (fund: number): ReturnType<typeof options> => {
      if (!funded.has(fund)) funded.set(fund, options(fund));
      return funded.get(fund)!;
    };
    // HULL-1c (REQ-BFG-078; REVIEW-HULL1A Q1): the deck's own day (`gold` false: REFIT has no shop, so the fight's gold
    // can't reach the deck). The fight still comes before the event, so its gold pays the event's gold cost (seed 9106's
    // FOUNDRY: a Hard win's 3 gold paid the dock's PLATING, roadCap -2 before). Every fight is worth 0 to the deck that day
    // and only the events taken count after it, so the plan fights the one that pays the most gold (a pending bounty rides
    // on the Hard slot's win) and that gold is its fund (midFund)
    const flatGold = gold ? 0 : Math.max(0, bestPay("easy", d, true, false), bestPay("medium", d, true, false));
    const hardGold = gold ? 0 : bestPay("hard", d, true, false);
    const queenGold = gold || d < MATRIARCH_DAY ? -Infinity : bestPay("matriarch", d, true, false);
    const midFund = new Float64Array(gold ? 0 : S);
    // step 1, the fight: mid[s] with its origin and label
    const mid = new Float64Array(S).fill(-Infinity);
    const midFrom = new Int32Array(S).fill(-1);
    const midWhat: string[] = new Array(S);
    const midVal = new Float64Array(S);
    const putMid = (s: number, s2: number, x: number, label: string, gain: number) => {
      if (x > mid[s2]) {
        mid[s2] = x;
        midFrom[s2] = s;
        midWhat[s2] = label;
        midVal[s2] = gain;
      }
    };
    for (let s = 0; s < S; s++) {
      const v = cur[s];
      if (v === -Infinity) continue;
      const c = s % C, r = (s - c) / C; // RUN-1: the state's forced counts, then the old index (C = 1: s itself)
      const b = r % B, beaten = Math.floor(r / B) % 2, mask = Math.floor(r / (2 * B));
      if (!gold) { // HULL-1c: the deck's day (above): the state stays, the richest open fight funds the event
        const queenSlot = d >= MATRIARCH_DAY && !beaten;
        const top = (queenSlot ? queenGold : hardGold) + amounts[b];
        const label = top > flatGold ? `${queenSlot ? "matriarch" : "hard"}${b ? " + bounty" : ""}` : "easy/medium (or a lost fight)";
        putMid(s, s, v, label, 0);
        midFund[s] = Math.max(flatGold, top);
        continue;
      }
      putMid(s, s, v + flat, "easy/medium (or a lost fight)", flat);
      const bounty = gold ? amounts[b] : 0;
      if (d >= MATRIARCH_DAY && !beaten) putMid(s, at(mask, 1, 0, c), v + queen + bounty, `matriarch${b ? " + bounty" : ""}`, queen + bounty);
      else putMid(s, at(mask, beaten, 0, c), v + hard + bounty, `hard${b ? " + bounty" : ""}`, hard + bounty);
    }
    // step 2, the day's event (or none)
    const nxt = new Float64Array(S).fill(-Infinity);
    const from = trace ? new Int32Array(S).fill(-1) : new Int32Array(0);
    const what: (string | undefined)[] = trace ? new Array(S) : [];
    const val = trace ? new Float64Array(S) : new Float64Array(0);
    const put = (m: number, s2: number, x: number, label: string, gain: number) => {
      if (x > nxt[s2]) {
        nxt[s2] = x;
        if (trace) {
          from[s2] = midFrom[m];
          what[s2] = `${midWhat[m]}${label ? `, then ${label}` : ""}`;
          val[s2] = midVal[m] + gain;
        }
      }
    };
    for (let m = 0; m < S; m++) {
      const v = mid[m];
      if (v === -Infinity) continue;
      const c = m % C, r = (m - c) / C;
      const b = r % B, beaten = Math.floor(r / B) % 2, mask = Math.floor(r / (2 * B));
      put(m, m, v, "", 0);
      const list = gold ? today : todayAt(midFund[m]); // HULL-1c: the deck's day: funded by the fight's gold
      for (let i = 0; i < E; i++) {
        if (mask & (1 << i)) continue;
        const m2 = mask | (1 << i);
        for (const o of list[i]) {
          if (o.f && cnt(c, i) >= need[i]) continue; // RUN-1: the forced choice is taken in at most `need` bags
          put(m, at(m2, beaten, o.cls >= 0 ? o.cls : b, o.f ? c + stride[i] : c), v + o.v, `event ${events[i]}: ${o.label}`, o.v);
        }
      }
    }
    if (trace) back.push({ from, what, val });
    cur = nxt;
  }
  // the plan ends with every forced choice taken in exactly its count of bags (long), or with every forced event taken, as the
  // mask says (one bag: the old rule, forcedMask)
  let bestS = -1;
  for (let s = 0; s < S; s++) {
    const c = s % C;
    if (c !== cTarget) continue;
    const mask = Math.floor((s - c) / C / (2 * B));
    if ((mask & forcedMask) === forcedMask && cur[s] > (bestS < 0 ? -Infinity : cur[bestS])) bestS = s;
  }
  if (bestS < 0 || cur[bestS] === -Infinity) return { value: -Infinity, plan: [] };
  const plan: PlanDay[] = [];
  if (trace) {
    let s = bestS;
    for (let d = days; d >= 1; d--) {
      const t = back[d - 1];
      plan.unshift({ day: d, pick: t.what[s] ?? "?", value: t.val[s] });
      s = t.from[s];
      const arg = collapsed.get(d); // RUN-1: step over the bag boundary that opened day d
      if (arg) s = arg[s];
    }
  }
  return { value: cur[bestS], plan };
}

const liquidMemo = new Map<string, number>();

/** The most gold a run can hold at caravan `c` (the eve of which took the discount): the shop's gold by then
 *  plus every road gain of days 1..c-2 counted as gold (parts at full value, a safe over-count: only the
 *  trader pays a part's full value, once). `hoard` (diagnostic, REPORT.md §2 slack): road gold only, the parts
 *  stay on the deck. */
export function gmax(c: number, hoard = false): number {
  shapesMemos();
  plainMemo(); // PLAIN-1
  // NPC-1: the NPC day's plans differ. HULL-1c (REQ-BFG-079): so may the day's gold with HULL_SCALE on
  const k = `${c}|${hoard}|${npcDayRules()}|${hullScaleRules()}|${longRunRules()}`; // RUN-1: the bag reset is the long run's
  const hit = liquidMemo.get(k);
  if (hit !== undefined) return hit;
  const road = c - 2 >= 1 ? Math.max(0, planDP(c - 2, NO_MIX(), "liquid", false, hoard).value) : 0;
  const g = shopGold(c) + road;
  liquidMemo.set(k, g);
  return g;
}

const capMemo = new Map<string, number>();

/** The most extra value an honest run whose hull and belt used `mix` can have on its deck at the dusk of `day`;
 *  -Infinity when the mix's events can't all fit in `day` road stops. */
export function roadCapFor(day: number, mix: Mix = NO_MIX()): number {
  shapesMemos();
  plainMemo(); // PLAIN-1
  // NPC-1: the NPC day's plans differ. HULL-1c (REQ-BFG-079): so may the day's gold with HULL_SCALE on
  const k = `${day}|${mix.key}|${npcDayRules()}|${hullScaleRules()}|${longRunRules()}`; // RUN-1: the bag reset is the long run's
  const hit = capMemo.get(k);
  if (hit !== undefined) return hit;
  const v = planDP(day, mix, "deck").value;
  capMemo.set(k, v);
  return v;
}

/** The most extra value any honest run can have put on its deck by the dusk of `day` beyond maxGoldByDay (road
 *  gold, free or discounted parts), for a deck whose hull and belt are the shop's (whole plating and crates). */
export function roadCap(day: number): number {
  return roadCapFor(day, NO_MIX());
}

/** maxGoldByDay(day) + roadCap(day): the most a player's deck may cost on `day` (validateUpload). */
export function maxHonestSpend(day: number): number {
  return shopGold(day) + roadCap(day);
}

/** The best road plan behind roadCapFor(day, mix), one line per day (REPORT.md §2, tests). */
export function explainRoadCap(day: number, mix: Mix = NO_MIX()): PlanDay[] {
  return planDP(day, mix, "deck", true).plan;
}

/** Diagnostic (REPORT.md §2 slack, never used to validate): roadCap with the discounted caravan funded by the
 *  road's gold alone, every part kept on the deck; roadCap - roadCapHoard is the over-count of gmax's liquid parts.
 *  That gold still comes from gmax's best gold plan, not the deck's own plan: tests/net-upload.slack.test.ts
 *  measures the whole slack against the best plan one run can follow. */
export function roadCapHoard(day: number): number {
  return planDP(day, NO_MIX(), "deck", false, true).value;
}

/** Tests only: forget every memo (after a test patched the road content). */
export function resetRoadCapMemo(): void {
  optionsMemo = null;
  mixMemo.clear();
  payMemo.clear();
  dgMemo.clear();
  liquidMemo.clear();
  capMemo.clear();
}

// ------------------------------------------------------------------ the player verdict (validate.ts hook)

/**
 * validateUpload's supply and budget blocks. The deck's hull must be the hero's hull ramp an honest run can
 * reach by `day`: plates x +25 (bought) plus a mix of the road's hull choices (dock PLATING +20, RIDE THROUGH
 * -10), never under HULL_FLOOR after a hull cost; its belt the hero's base plus crates x +4 plus the road's belt
 * (the BELT SPOOL +4). The mix's events must fit in `day` road stops. Then, for some reachable mix,
 * cost = the parts (items, mods, 0.6.2s installed turrets: every buildCost term but the supplies) + plates x plating
 * price + crates x crate price must be <= maxGoldByDay(day) + roadCapFor(day, mix). Returns the errors (empty: the
 * deck passes).
 */
export function playerSupplyBudget(b: Build, day: number, cost: BuildCost, runeGold = 0, freePart = 0, drops = 0, offered?: ReadonlySet<EventId> | ReadonlyMap<EventId, number>): string[] {
  let f: PlayerFits;
  try {
    f = playerFits(b, day, cost, offered); // AZ-PREP: `offered`, the seed's events by `day` (NPC_DAY on; absent: as before)
  } catch (e) {
    return [`budget: the player ceiling is unavailable: ${e instanceof Error ? e.message : String(e)}`];
  }
  const best = f.fits[0];
  // RUNES-1 (REQ-BFG-058): `runeGold`, the gold the deck's dawn-gold runes paid by `day` (runes.ts runeGrants), joins
  // every fit's allowance (a constant, so the best fit is the same one). Z-PREP (REQ-BFG-073): so does `freePart`, the
  // price of a free LAST CHANCE part on the deck (validate.ts), named on its own in the budget line; at 0 (every deck
  // without one, every deck while the switch is off) the line is exactly as before
  // NPC-1 (REQ-BFG-078): `drops`, the road log's drops at their value (validate.ts), joins it too (0: as before)
  const extra = runeGold + freePart + drops;
  if (best && best.cost <= best.allow + extra) return [];
  const h = HEROES[b.hero];
  const errors: string[] = [];
  // AZ-PREP (REQ-BFG-078; REVIEW-HULL1D Q1): a hull or belt only a mix the seed didn't offer could explain says so, with the
  // seed's events by the day (NPC_DAY on); any other unreachable one keeps its line
  // RUN-1: a long run's `offered` counts the offers per event (one per bag): "dock x2, wreck"
  const seedRoad = offered ? (offered instanceof Map ? [...offered].map(([e, n]) => (n > 1 ? `${e} x${n}` : e)) : [...offered]).join(", ") : "";
  if (!f.hullOk) {
    errors.push(f.unofferedHull?.length
      ? `supply: hullBonus ${b.hullBonus} needs ${f.unofferedHull.join(" or ")}, which this run's seed did not offer by day ${day} (its road: ${seedRoad})`
      : `supply: hullBonus ${b.hullBonus} is not a hull a player can reach by day ${day} (+${ITEMS.plating.supply!.hull!} plating; ${hullChoices()}, once a run each)`);
  }
  if (!f.beltOk) {
    errors.push(f.unofferedBelt?.length
      ? `supply: beltCap ${b.beltCap} needs ${f.unofferedBelt.join(" or ")}, which this run's seed did not offer by day ${day} (its road: ${seedRoad})`
      : `supply: beltCap ${b.beltCap} is not ${h.belt} + whole +${ITEMS.beltcrate.supply!.belt!} belt crates (and ${beltChoices()}, once a run) by day ${day}`);
  }
  if (f.hullOk && f.beltOk && !best) {
    errors.push(`supply: hullBonus ${b.hullBonus} and beltCap ${b.beltCap} together need more road stops than day ${day} has`);
  }
  if (!errors.length && best) {
    const road = best.mix.labels.length ? `, road ${best.mix.labels.join(" + ")}` : "";
    const turrets = cost.turrets ? `, turrets ${cost.turrets}` : ""; // as the strict message names them (0.6.2s)
    const rg = runeGold ? ` + rune gold ${runeGold}` : ""; // RUNES-1: only when runes paid any
    const fp = freePart ? ` + free part ${freePart}` : ""; // Z-PREP: only with a free LAST CHANCE part
    const dp = drops ? ` + drops ${drops}` : ""; // NPC-1: only with drops in the road log
    errors.push(`budget: build costs ${best.cost} gold (items ${cost.items}, mods ${cost.mods}, ${best.crates} crates, ${best.plates} plating${turrets}${road}) but a player's day ${day} allows at most ${best.allow + extra} (maxGoldByDay ${shopGold(day)} + roadCap ${best.cap}${rg}${fp}${dp})`);
  }
  return errors;
}

/** One honest way to read a deck's hull and belt: the mix, what was bought, the cost and the ceiling. */
export interface PlayerFit {
  mix: Mix;
  plates: number;
  crates: number;
  cost: number; // the parts (buildCost without its supplies) + plates and crates at their prices
  allow: number; // maxGoldByDay(day) + roadCapFor(day, mix)
  cap: number; // roadCapFor(day, mix)
}

export interface PlayerFits {
  fits: PlayerFit[]; // every mix that reaches both the hull and the belt by the day, the most room (allow - cost) first
  hullOk: boolean; // some mix reaches the hull by the day
  beltOk: boolean; // some mix reaches the belt by the day
  /** AZ-PREP (REVIEW-HULL1D Q1): the mixes that would reach the hull (the belt) by the day but need an event the seed
   *  didn't offer by then (absent without the seed's events, or when none) */
  unofferedHull?: string[];
  unofferedBelt?: string[];
}

/** RUN-1: did the seed offer event `e` at least `n` times by the deck's day? `offered` is the 10-day run's Set (once each) or a
 *  long run's counts (one per bag: validate.ts offeredEvents). */
const offeredAtLeast = (offered: ReadonlySet<EventId> | ReadonlyMap<EventId, number>, e: EventId, n: number): boolean =>
  offered instanceof Map ? (offered.get(e) ?? 0) >= n : (offered as ReadonlySet<EventId>).has(e);

/** The D3 search: every road mix that explains the deck's hull and belt by `day`, costed (throws RoadModelError).
 *  RUN-1 (D6): on a long run the mixes may take an event once per bag reached by `day` (roadMixesFor(bagsFor(day))). */
export function playerFits(b: Build, day: number, cost: BuildCost, offered?: ReadonlySet<EventId> | ReadonlyMap<EventId, number>): PlayerFits {
  const h = HEROES[b.hero];
  const plate = ITEMS.plating, crate = ITEMS.beltcrate;
  const plateHull = plate.supply!.hull!, crateBelt = crate.supply!.belt!;
  // The parts cost exactly what the strict mode says: buildCost's total without its supply terms, so items, mods, the
  // 0.6.2s installed turrets (turretValue: a free starting copy is 0) and any later term are costed by the same code.
  const parts = cost.total - cost.crates * crate.price - cost.plates * plate.price;
  const hullFits = (m: Mix) => {
    const r = b.hullBonus - m.hull;
    return r >= 0 && r % plateHull === 0 && (!m.hullCost || h.hull + b.hullBonus >= HULL_FLOOR);
  };
  const beltFits = (m: Mix) => {
    const r = b.beltCap - h.belt - m.belt;
    return r >= 0 && r % crateBelt === 0;
  };
  const out: PlayerFits = { fits: [], hullOk: false, beltOk: false };
  for (const m of roadMixesFor(bagsFor(day))) {
    const hf = hullFits(m), bf = beltFits(m);
    if (!hf && !bf) continue;
    const cap = roadCapFor(day, m);
    if (cap === -Infinity) continue; // the mix's events need more road stops than `day` has
    // AZ-PREP (REQ-BFG-078; REVIEW-HULL1D Q1, behind NPC_DAY): given the events the uploader's seed offered by `day`
    // (validate.ts: eventFor(seed, 1..day), only with NPC_DAY on and the seed), a mix that needs another event explains
    // nothing; its labels are kept for the refusal's line. Without `offered`: seed-blind, as before
    // RUN-1: and a mix that takes an event in n bags needs the seed to have offered it n times (once per bag)
    if (offered && [...m.forced.keys()].some((e) => !offeredAtLeast(offered, e, m.counts?.get(e) ?? 1))) {
      if (hf) out.unofferedHull = [...(out.unofferedHull ?? []), m.labels.join(" + ")];
      if (bf) out.unofferedBelt = [...(out.unofferedBelt ?? []), m.labels.join(" + ")];
      continue;
    }
    out.hullOk = out.hullOk || hf; // some honest run reaches this hull by `day` (whatever its belt)
    out.beltOk = out.beltOk || bf;
    if (!hf || !bf) continue;
    // plates and crates are bought; the rest of the hull and belt came from the road mix's events
    const plates = (b.hullBonus - m.hull) / plateHull, crates = (b.beltCap - h.belt - m.belt) / crateBelt;
    const total = parts + plates * plate.price + crates * crate.price;
    out.fits.push({ mix: m, plates, crates, cost: total, allow: shopGold(day) + cap, cap });
  }
  out.fits.sort((x, y) => (y.allow - y.cost) - (x.allow - x.cost)); // the cheapest honest mix first
  return out;
}

function hullChoices(): string {
  return roadMixes().filter((m) => m.labels.length === 1 && m.hull !== 0).map((m) => `${m.labels[0]} ${m.hull > 0 ? "+" : ""}${m.hull}`).join(", ");
}

function beltChoices(): string {
  return roadMixes().filter((m) => m.labels.length === 1 && m.belt !== 0).map((m) => `${m.labels[0]} ${m.belt > 0 ? "+" : ""}${m.belt}`).join(", ");
}
