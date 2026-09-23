// Road events (0.5.0, REQ-BQR-002): which event a day gets, and what a choice does.
// The rules live in run state only: gold, lives, cargo, build.hullBonus, build.beltCap and the
// next caravan's modifiers. The battle sim is untouched, and so is the dusk ghost (0.6.0): the
// foe-modifying events (herald, sappers) are out of the bag until 0.6.0b retargets them to
// warlords. Selection uses its own seed streams, so shop rolls and battle seeds are unchanged.

import { hashSeed, Rng } from "../core/rng";
import { HEROES, ITEMS, START_LIVES } from "../sim/content";
import { beltUsed, removeItem } from "../sim/deck";
import { BAG_IDS, EVENTS, EVENT_IDS, INTRO_IDS, type Choice, type Delta, type EventId, type EventState } from "./eventDefs";
import type { FoeMods, Run } from "./run";

/** Day 1 always has an event; from day 2 every block of 4 days skips exactly one seeded day (3 in 4). */
export function eventDue(seed: number, day: number): boolean {
  if (day <= 1) return true;
  const block = Math.floor((day - 2) / 4);
  return day !== 2 + block * 4 + new Rng(hashSeed(seed, "event-skip", block)).int(4);
}

/** A run's event order: a gentle intro, then shuffled bags of the bag events. Never the same twice in a row. */
export function eventSequence(seed: number, n: number): EventId[] {
  const intro = new Rng(hashSeed(seed, "event-intro")).pick(INTRO_IDS);
  const out: EventId[] = [intro];
  for (let bag = 0; out.length < n; bag++) {
    const ids = new Rng(hashSeed(seed, "event-bag", bag)).shuffle(BAG_IDS.filter((id) => bag > 0 || id !== intro));
    if (ids[0] === out[out.length - 1]) [ids[0], ids[1]] = [ids[1], ids[0]];
    out.push(...ids);
  }
  return out.slice(0, n);
}

/** The event on the road before a day's dusk, or null for a quiet road. */
export function eventFor(seed: number, day: number): EventId | null {
  if (!eventDue(seed, day)) return null;
  let k = 0;
  for (let r = 1; r < day; r++) if (eventDue(seed, r)) k++;
  return eventSequence(seed, k + 1)[k];
}

/** An event's own rolls come from hashSeed(seed, "event", day): fixed, so reloading can't re-roll them. */
export function makeEvent(seed: number, day: number, id: EventId): EventState {
  const rng = new Rng(hashSeed(seed, "event", day));
  return { day, id, roll: rng.next(), pick: rng.next(), picked: -1 };
}

/** The caravan leaves: set up today's event if one is due. True when the player must choose. */
export function beginRoad(run: Run): boolean {
  if (!run.event || run.event.day !== run.day) {
    const id = eventFor(run.seed, run.day);
    run.event = id ? makeEvent(run.seed, run.day, id) : null;
  }
  const open = !!run.event && run.event.picked < 0;
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

/** Today's foe modifiers (created on first use). 0.6.0: recorded only; a dusk ghost ignores them. */
export function foeMods(run: Run): FoeMods {
  if (!run.foe || run.foe.day !== run.day) run.foe = { day: run.day, boost: 0, hull: 0, bounty: 0 };
  return run.foe;
}

function pay(run: Run, d: Delta): void {
  switch (d.k) {
    case "gold": run.gold -= d.n; break;
    case "hull": run.build.hullBonus -= d.n; break;
    case "belt": run.build.beltCap -= d.n; break;
    case "lives": run.lives -= d.n; break;
    case "elite": foeMods(run).boost += d.n; break;
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

function receive(run: Run, d: Delta): void {
  switch (d.k) {
    case "gold": run.gold += d.n; break;
    case "lives": run.lives = Math.min(START_LIVES, run.lives + d.n); break;
    case "hull": run.build.hullBonus += d.n; break;
    case "belt": run.build.beltCap += d.n; break;
    case "item": run.inventory.push({ uid: run.nextUid++, def: d.def }); break;
    case "elite": foeMods(run).boost += d.n; break;
    case "foeHull": foeMods(run).hull += d.n; break;
    case "bounty": foeMods(run).bounty += d.n; break;
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
  if (won) for (const d of c.gain) receive(run, d);
  ev.picked = i;
  ev.won = won;
  run.events.push({ day: run.day, id: ev.id, choice: c.label, won });
  const item = won ? c.gain.find((d) => d.k === "item") : undefined;
  const deckItem = item && item.k === "item" && ITEMS[item.def].kind !== "supply" ? item.def : undefined;
  if (deckItem) ev.item = deckItem;
  return { ok: true, choice: c, won, deckItem };
}

export { BAG_IDS, EVENTS, EVENT_IDS };
