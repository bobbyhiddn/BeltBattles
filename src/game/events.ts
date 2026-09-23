// Road events (0.5.0, REQ-BQR-002): which event a day's fork offers, and what a choice does.
// The rules live in run state only: gold, lives, cargo, build.hullBonus, build.beltCap, the next
// caravan's modifiers and (0.6.0b, decision 5) a pending ELITE BOUNTY / SABOTAGE that act only on
// the next warlord fight, or SCOUT's stored dusk foe. The battle sim is untouched and a dusk ghost
// runs exactly as submitted. Selection uses its own seed streams (shop rolls and battle seeds stay).

import { hashSeed, Rng } from "../core/rng";
import { HEROES, ITEMS, START_LIVES } from "../sim/content";
import { beltUsed, removeItem } from "../sim/deck";
import { BAG_IDS, EVENTS, EVENT_IDS, type Choice, type Delta, type EventId, type EventState } from "./eventDefs";
import type { Run } from "./run";
import { chooseFoe, storedFoe } from "./day";
import { loadPool } from "./ghosts";

/** A run's event order (0.6.0b): shuffled bags of the bag events, from day 1 (no intro rule).
 *  Never the same twice in a row. */
export function eventSequence(seed: number, n: number): EventId[] {
  const out: EventId[] = [];
  for (let bag = 0; out.length < n; bag++) {
    const ids = new Rng(hashSeed(seed, "event-bag", bag)).shuffle([...BAG_IDS]);
    if (ids[0] === out[out.length - 1]) [ids[0], ids[1]] = [ids[1], ids[0]];
    out.push(...ids);
  }
  return out.slice(0, n);
}

/** The road event on a day's fork (0.6.0b): every day has one (no quiet-road skip). */
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

/** Why a choice can't be taken right now, or undefined. */
export function blockReason(run: Run, c: Choice): string | undefined {
  for (const d of c.cost) {
    if (d.k === "gold" && run.gold < d.n) return `NEED ${d.n - run.gold} MORE GOLD`;
    if (d.k === "hull" && HEROES[run.hero].hull + run.build.hullBonus - d.n < 100) return "HULL TOO WEAK";
    if (d.k === "belt" && run.build.beltCap - d.n < beltUsed(run.build)) return "BELTS IN USE";
    if (d.k === "item" && !owns(run, d)) return "NOTHING TO TRADE";
  }
  for (const d of c.gain) if (d.k === "lives" && run.lives + d.n > START_LIVES) return "LIVES FULL";
  return undefined;
}

/** The choices of the current event with their blocked reasons filled in. */
export function choicesFor(run: Run, ev: EventState | null = run.event): Choice[] {
  if (!ev) return [];
  const list = EVENTS[ev.id].choices(run, ev);
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
    case "item": run.inventory.push({ uid: run.nextUid++, def: d.def }); break;
    // 0.6.0b (decision 5): these act only on warlord fights (road.ts), never on a dusk ghost
    case "bounty": run.bounty = { day: run.day, stake: c.cost.reduce((s, q) => s + (q.k === "gold" ? q.n : 0), 0), pay: d.n }; break;
    case "sabotage": run.sabotage = { day: run.day }; break;
    // SCOUT: tonight's dusk foe is picked now and stored, so dusk fights exactly the deck shown
    case "reveal": if (!storedFoe(run)) run.dusk = chooseFoe(run, loadPool()); break;
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
