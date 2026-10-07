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

import { HEROES, ITEMS, MERCHANTS, OFFERS, REROLL_COST, buyableModules, itemsSoldBy, type MerchantId } from "../sim/content";
import type { Build } from "../sim/deck";
import { starsOf, valueOf } from "../sim/stars";
import { MATRIARCH_DAY, maxGoldByDay as shopGold, warlordPool, type Difficulty, type RivalId } from "../sim/rivals";
import { EVENTS, EVENT_IDS, type Choice, type Delta, type EventId, type EventState } from "../game/eventDefs";
import { ROAD_PICKS, warlordDeck, warlordDeckDay, warlordReward } from "../game/road";
import type { WarlordReward } from "../game/roadTypes";
import { newRun, type Run } from "../game/run";
import { gainModule } from "../game/fuse";
import type { BuildCost } from "./validate"; // type only: validate.ts's buildCost is the strict mode's cost

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
};

/** The fork's picks (road.ts ROAD_PICKS) and a warlord reward's fields (roadTypes.ts WarlordReward), as reviewed. */
export const MODELLED_PICKS: readonly string[] = ["event", "easy", "medium", "hard"];
const REWARD_MODEL: Record<keyof WarlordReward, string> = {
  gold: "gold on the run's day (road.ts rewardGold; 0.6.2 EASY PAY: Easy 3 from day 4, SABOTAGE or not), spendable from the next caravan",
  parts: "a Hard win takes 1 of them (a 1-star copy through takePart/gainModule)",
  legendary: "the Matriarch: parts[0] straight to cargo (a 1-star copy through gainModule)",
};
export const MODELLED_REWARD_FIELDS = Object.keys(REWARD_MODEL) as readonly (keyof WarlordReward)[];

/** events.ts blockReason's HULL TOO WEAK: a hull cost is refused when the hero's hull + hullBonus - cost < 100. */
export const HULL_FLOOR = 1000;

/** Throws RoadModelError when the live road content has an event or a fork pick the model has not reviewed. */
export function checkRoadModel(): void {
  for (const e of EVENT_IDS) if (!Object.prototype.hasOwnProperty.call(MODELLED_EVENTS, e)) throw new RoadModelError(`road event "${e}"`);
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
      case "lives": case "sabotage": case "reveal": break;
      default: throw new RoadModelError(`a "${(d as Delta).k}" gain (${e} ${c.label})`);
    }
  }
  return o;
}

let optionsMemo: Map<EventId, RoadOption[]> | null = null;

/** Every distinct way to resolve each road event, read from EVENTS under the synthetic states of MODELLED_EVENTS
 *  (a blocked choice is skipped: it can't be taken in that state). */
export function roadOptions(): ReadonlyMap<EventId, readonly RoadOption[]> {
  if (optionsMemo) return optionsMemo;
  checkRoadModel();
  const out = new Map<EventId, RoadOption[]>();
  for (const e of EVENT_IDS) {
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
  const k = `${slot}|${day}`;
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
  hull: number; // the mix's hull change
  belt: number; // the mix's belt change
  hullCost: boolean; // a choice pays hull (RIDE THROUGH): the HULL_FLOOR applies
  labels: string[]; // "dock PLATING", ...
}

let mixMemo: Mix[] | null = null;

/** Every mix: for each event with a choice that moves hull or belt, not used for them, or one such choice. */
export function roadMixes(): readonly Mix[] {
  if (mixMemo) return mixMemo;
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
        next.push({
          key: `${m.key}${m.key ? " " : ""}${e}(${k})`,
          forced: new Map([...m.forced, [e, opts]]),
          hull: m.hull + opts[0].hull,
          belt: m.belt + opts[0].belt,
          hullCost: m.hullCost || opts[0].hull < 0,
          labels: [...m.labels, `${e} ${[...new Set(opts.map((o) => o.label))].join("/")}`],
        });
      }
    }
    out = next;
  }
  mixMemo = out;
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
  const all = roadOptions();
  const discountEvents = new Set([...all].filter(([, l]) => l.some((o) => o.discount > 0)).map(([e]) => e));
  const events = EVENT_IDS.filter((e) => mode === "deck" || !discountEvents.has(e));
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

const liquidMemo = new Map<string, number>();

/** The most gold a run can hold at caravan `c` (the eve of which took the discount): the shop's gold by then
 *  plus every road gain of days 1..c-2 counted as gold (parts at full value, a safe over-count: only the
 *  trader pays a part's full value, once). `hoard` (diagnostic, REPORT.md §2 slack): road gold only, the parts
 *  stay on the deck. */
export function gmax(c: number, hoard = false): number {
  const k = `${c}|${hoard}`;
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
  const k = `${day}|${mix.key}`;
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
  mixMemo = null;
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
export function playerSupplyBudget(b: Build, day: number, cost: BuildCost, runeGold = 0, freePart = 0): string[] {
  let f: PlayerFits;
  try {
    f = playerFits(b, day, cost);
  } catch (e) {
    return [`budget: the player ceiling is unavailable: ${e instanceof Error ? e.message : String(e)}`];
  }
  const best = f.fits[0];
  // RUNES-1 (REQ-BFG-058): `runeGold`, the gold the deck's dawn-gold runes paid by `day` (runes.ts runeGrants), joins
  // every fit's allowance (a constant, so the best fit is the same one). Z-PREP (REQ-BFG-073): so does `freePart`, the
  // price of a free LAST CHANCE part on the deck (validate.ts), named on its own in the budget line; at 0 (every deck
  // without one, every deck while the switch is off) the line is exactly as before
  const extra = runeGold + freePart;
  if (best && best.cost <= best.allow + extra) return [];
  const h = HEROES[b.hero];
  const errors: string[] = [];
  if (!f.hullOk) {
    errors.push(`supply: hullBonus ${b.hullBonus} is not a hull a player can reach by day ${day} (+${ITEMS.plating.supply!.hull!} plating; ${hullChoices()}, once a run each)`);
  }
  if (!f.beltOk) {
    errors.push(`supply: beltCap ${b.beltCap} is not ${h.belt} + whole +${ITEMS.beltcrate.supply!.belt!} belt crates (and ${beltChoices()}, once a run) by day ${day}`);
  }
  if (f.hullOk && f.beltOk && !best) {
    errors.push(`supply: hullBonus ${b.hullBonus} and beltCap ${b.beltCap} together need more road stops than day ${day} has`);
  }
  if (!errors.length && best) {
    const road = best.mix.labels.length ? `, road ${best.mix.labels.join(" + ")}` : "";
    const turrets = cost.turrets ? `, turrets ${cost.turrets}` : ""; // as the strict message names them (0.6.2s)
    const rg = runeGold ? ` + rune gold ${runeGold}` : ""; // RUNES-1: only when runes paid any
    const fp = freePart ? ` + free part ${freePart}` : ""; // Z-PREP: only with a free LAST CHANCE part
    errors.push(`budget: build costs ${best.cost} gold (items ${cost.items}, mods ${cost.mods}, ${best.crates} crates, ${best.plates} plating${turrets}${road}) but a player's day ${day} allows at most ${best.allow + extra} (maxGoldByDay ${shopGold(day)} + roadCap ${best.cap}${rg}${fp})`);
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
}

/** The D3 search: every road mix that explains the deck's hull and belt by `day`, costed (throws RoadModelError). */
export function playerFits(b: Build, day: number, cost: BuildCost): PlayerFits {
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
  for (const m of roadMixes()) {
    const hf = hullFits(m), bf = beltFits(m);
    if (!hf && !bf) continue;
    const cap = roadCapFor(day, m);
    if (cap === -Infinity) continue; // the mix's events need more road stops than `day` has
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
