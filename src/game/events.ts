// Road events (0.5.0, REQ-BQR-002): which event a day's fork offers, and what a choice does.
// The rules live in run state only: gold, lives, cargo, build.hullBonus, build.beltCap, the next
// caravan's modifiers and (0.6.0b, decision 5) a pending ELITE BOUNTY / SABOTAGE that act only on
// the next warlord fight, or SCOUT's stored dusk foe. The battle sim is untouched and a dusk ghost
// runs exactly as submitted. Selection uses its own seed streams (shop rolls and battle seeds stay).

import { hashSeed, Rng } from "../core/rng";
import { HEROES, ITEMS, RUN_DAYS, START_LIVES } from "../sim/content";
import { beltUsed, removeItem } from "../sim/deck";
import { BAG_IDS, EVENTS, EVENT_IDS, WARLORD_EVENT_IDS, type Choice, type Delta, type EventId, type EventState } from "./eventDefs";
import { queueFuseAnim, type Run } from "./run";
import { chooseFoe, storedFoe } from "./day";
import { loadPool } from "./ghosts";
import { online, onlineMode } from "./session"; // 0.7.0a: the SCOUT's reveal online
import { gainModule } from "./fuse";

/** 0.6.0d: HERALD (ELITE BOUNTY) or SAPPERS (SABOTAGE) would be a dud on the last day: no warlord
 *  is left for the stake or the sabotage (blockReason's NO WARLORD LEFT). */
const lastDayDud = (id: EventId): boolean => WARLORD_EVENT_IDS.includes(id);

/**
 * 0.6.0d, no dud last stop: when day RUN_DAYS (10) holds HERALD or SAPPERS, it swaps with the
 * latest earlier day whose event is neither. The run still meets every event exactly once (the
 * first bag is all 10 events), and an order whose day 10 was neither is left as it was.
 */
function keepDudsOffLastDay(order: EventId[]): void {
  const last = RUN_DAYS - 1;
  if (order.length <= last || !lastDayDud(order[last])) return;
  for (let j = last - 1; j >= 0; j--) {
    if (!lastDayDud(order[j])) {
      [order[j], order[last]] = [order[last], order[j]];
      return;
    }
  }
}

/** A run's event order (0.6.0b): shuffled bags of the bag events, from day 1 (no intro rule).
 *  Never the same twice in a row. 0.6.0d: never HERALD or SAPPERS on day 10 (keepDudsOffLastDay,
 *  applied once the bag holding day 10 is drawn, before the next bag's no-repeat check). */
export function eventSequence(seed: number, n: number): EventId[] {
  const out: EventId[] = [];
  const want = Math.max(n, RUN_DAYS); // day 10 is always drawn: the swap can reach back to any day
  for (let bag = 0; out.length < want; bag++) {
    const ids = new Rng(hashSeed(seed, "event-bag", bag)).shuffle([...BAG_IDS]);
    if (ids[0] === out[out.length - 1]) [ids[0], ids[1]] = [ids[1], ids[0]];
    const before = out.length;
    out.push(...ids);
    if (before < RUN_DAYS && out.length >= RUN_DAYS) keepDudsOffLastDay(out);
  }
  return out.slice(0, n);
}

/** The road event on a day's fork (0.6.0b): every day has one (no quiet-road skip). 0.6.0d: day 10
 *  is never HERALD or SAPPERS (eventSequence). */
export function eventFor(seed: number, day: number): EventId {
  const d = Math.max(1, Math.floor(day) || 1);
  return eventSequence(seed, d)[d - 1];
}

/** An event's own rolls come from hashSeed(seed, "event", day): fixed, so reloading can't re-roll them. */
export function makeEvent(seed: number, day: number, id: EventId): EventState {
  const rng = new Rng(hashSeed(seed, "event", day));
  return { day, id, roll: rng.next(), pick: rng.next(), picked: -1 };
}

/** Take today's road event (the fork's EVENT card; road.ts pickRoad, and a shorthand for tests and
 *  tooling): the fork pick becomes "event" if none was made, the event is set up once. True while
 *  the player must still choose; false once resolved (or when today's pick was a warlord). */
export function beginRoad(run: Run): boolean {
  if (!run.road || run.road.day !== run.day) run.road = { day: run.day, pick: "event" };
  if (run.road.pick !== "event") return false;
  if (!run.event || run.event.day !== run.day) run.event = makeEvent(run.seed, run.day, eventFor(run.seed, run.day));
  const open = run.event.picked < 0;
  run.stage = open ? "event" : "battle";
  return open;
}

function owns(run: Run, d: Extract<Delta, { k: "item" }>): boolean {
  const uid = d.uid ?? -1;
  if (d.from === "deck") return run.build.items.some((p) => p.uid === uid);
  if (d.from === "mod") return run.build.mods.some((m) => m.uid === uid);
  return run.inventory.some((i) => i.uid === uid);
}

/** Why a choice can't be taken right now, or undefined. 0.6.0c: an ELITE BOUNTY or SABOTAGE on the
 *  last day (run.day >= RUN_DAYS) could never pay, as no warlord is left: NO WARLORD LEFT. 0.6.0d:
 *  eventFor no longer draws HERALD or SAPPERS on day 10; the block stays as a safety net (a saved
 *  run whose day-10 HERALD or SAPPERS was already stored in run.event, or a tooling-opened event). */
export function blockReason(run: Run, c: Choice): string | undefined {
  if (run.day >= RUN_DAYS && c.gain.some((d) => d.k === "bounty" || d.k === "sabotage")) return "NO WARLORD LEFT";
  for (const d of c.cost) {
    if (d.k === "gold" && run.gold < d.n) return `NEED ${d.n - run.gold} MORE GOLD`;
    if (d.k === "hull" && HEROES[run.hero].hull + run.build.hullBonus - d.n < 1000) return "HULL TOO WEAK"; // NUM-1: hull x10 (roadCap.ts HULL_FLOOR)
    if (d.k === "belt" && run.build.beltCap - d.n < beltUsed(run.build)) return "BELTS IN USE";
    if (d.k === "item" && !owns(run, d)) return "NOTHING TO TRADE";
  }
  for (const d of c.gain) if (d.k === "lives" && run.lives + d.n > START_LIVES) return "LIVES FULL";
  return undefined;
}

/** The choices of the current event with their blocked reasons filled in. 0.6.1c: a road item is drawn
 *  from the parts the player holds, which the pick itself changes, so once resolved the picked card
 *  shows the part the pick granted (ev.item, saved with the event), also after a reload. */
export function choicesFor(run: Run, ev: EventState | null = run.event): Choice[] {
  if (!ev) return [];
  const list = EVENTS[ev.id].choices(run, ev);
  const got = ev.picked >= 0 ? ev.item : undefined;
  const chosen = got ? list[ev.picked] : undefined;
  if (chosen && got) chosen.gain = chosen.gain.map((d) => (d.k === "item" ? { ...d, def: got } : d));
  for (const c of list) if (!c.blocked) c.blocked = blockReason(run, c);
  return list;
}

function pay(run: Run, d: Delta): void {
  switch (d.k) {
    case "gold": run.gold -= d.n; break;
    case "hull": run.build.hullBonus -= d.n; break;
    case "belt": run.build.beltCap -= d.n; break;
    case "lives": run.lives -= d.n; break;
    case "item": {
      const uid = d.uid ?? -1;
      if (d.from === "deck") removeItem(run.build, uid);
      else if (d.from === "mod") run.build.mods = run.build.mods.filter((m) => m.uid !== uid);
      else run.inventory = run.inventory.filter((i) => i.uid !== uid);
      break;
    }
    default: break;
  }
}

function receive(run: Run, d: Delta, c: Choice): void {
  switch (d.k) {
    case "gold": run.gold += d.n; break;
    case "lives": run.lives = Math.min(START_LIVES, run.lives + d.n); break;
    case "hull": run.build.hullBonus += d.n; break;
    case "belt": run.build.beltCap += d.n; break;
    case "item": queueFuseAnim(run, gainModule(run, d.def)); break; // 0.6.1a: item rewards and the trader's SWAP merge
    // 0.6.0b (decision 5): these act only on warlord fights (road.ts), never on a dusk ghost
    case "bounty": run.bounty = { day: run.day, stake: c.cost.reduce((s, q) => s + (q.k === "gold" ? q.n : 0), 0), pay: d.n }; break;
    case "sabotage": run.sabotage = { day: run.day }; break;
    // SCOUT: tonight's dusk foe is picked now and stored, so dusk fights exactly the deck shown. 0.7.0a online: the
    // ghost the session fetched (or, if it hasn't answered yet, 0.6.2's stand-in: never wait); offline as 0.6.2
    case "reveal": if (!storedFoe(run)) { if (onlineMode()) online()!.settle(run); else run.dusk = chooseFoe(run, loadPool()); } break;
    case "discount": run.nextShop.discount += d.n; break;
    case "reroll": run.nextShop.free += d.n; break;
  }
}

export interface PickResult {
  ok: boolean;
  reason?: string;
  choice?: Choice;
  won?: boolean;
  /** Deck equipment that landed in cargo (offer REFIT). */
  deckItem?: string;
}

/** Resolve the current event with choice i: pay the costs, then (for a gamble, only on a win) the gains. */
export function pickChoice(run: Run, i: number): PickResult {
  const ev = run.event;
  if (!ev || ev.day !== run.day) return { ok: false, reason: "NO EVENT" };
  if (ev.picked >= 0) return { ok: false, reason: "ALREADY CHOSEN" };
  const c = choicesFor(run, ev)[i];
  if (!c) return { ok: false, reason: "NO SUCH CHOICE" };
  if (c.blocked) return { ok: false, reason: c.blocked };
  for (const d of c.cost) pay(run, d);
  const won = c.odds === undefined || ev.roll < c.odds;
  if (won) for (const d of c.gain) receive(run, d, c);
  ev.picked = i;
  ev.won = won;
  if (won && c.gain.some((d) => d.k === "reveal")) ev.reveal = true;
  run.events.push({ day: run.day, id: ev.id, choice: c.label, won });
  const item = won ? c.gain.find((d) => d.k === "item") : undefined;
  const deckItem = item && item.k === "item" && ITEMS[item.def].kind !== "supply" ? item.def : undefined;
  if (deckItem) ev.item = deckItem;
  return { ok: true, choice: c, won, deckItem };
}

export { BAG_IDS, EVENTS, EVENT_IDS };
