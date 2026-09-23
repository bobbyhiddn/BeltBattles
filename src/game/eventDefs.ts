// Road events (0.5.0, REQ-BQR-002): the content. Each event is a titled scene with two lines
// of flavour text and 2-3 choices. A choice lists exactly what it costs and what it gives;
// events.ts applies exactly that and nothing else. Tuned so an event is worth about +2 to +4
// gold on average and none of them wins a run by itself.

import { ITEMS, type Rarity } from "../sim/content";
import { warlordBuild, warlordName } from "../sim/ai";
import { HEROES } from "../sim/content";
import type { Run } from "./run";

export type EventId = "wreck" | "cache" | "trader" | "dice" | "dock" | "herald" | "sappers" | "scout" | "storm" | "smuggler";

/** One line item of a choice. Costs are paid, gains are received (for a gamble only on a win). */
export type Delta =
  | { k: "gold"; n: number }
  | { k: "lives"; n: number }
  | { k: "hull"; n: number } // max hull (build.hullBonus)
  | { k: "belt"; n: number } // belt capacity
  | { k: "item"; def: string; uid?: number; from?: "cargo" | "deck" | "mod" } // gain: new cargo item; cost: that exact part
  | { k: "elite"; n: number } // this round's foe is the warlord from n rounds ahead
  | { k: "foeHull"; n: number } // this round's foe hull (negative = weaker)
  | { k: "bounty"; n: number } // extra gold if you win this round
  | { k: "discount"; n: number } // next caravan: every price -n (min 1)
  | { k: "reroll"; n: number }; // next caravan: n free rerolls

export interface Choice {
  label: string;
  cost: Delta[];
  gain: Delta[];
  odds?: number; // gamble: chance the gain comes through (the cost is always paid)
  note?: string;
  blocked?: string; // why it can't be picked right now (shown on the disabled card)
}

export interface EventState {
  round: number;
  id: EventId;
  roll: number; // fixed at creation: a gamble's outcome can't change by reloading
  pick: number; // fixed at creation: which part a salvage or trade offers
  picked: number; // -1 until resolved; then the choice index (resolved events can't be picked again)
  won?: boolean;
}

export interface EventDef {
  id: EventId;
  title: string;
  kind: string;
  text: [string, string];
  choices(run: Run, ev: EventState): Choice[];
}

const at = <T>(arr: readonly T[], u: number): T => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(u * arr.length)))];
const gold = (n: number): Delta => ({ k: "gold", n });
const MOVE_ON: Choice = { label: "MOVE ON", cost: [], gain: [] };
const moveOn = (label = "MOVE ON"): Choice => ({ ...MOVE_ON, label });

const SALVAGE = ["temper", "whetstone", "grease", "brake"];
const UPGRADE: Record<Rarity, string[]> = {
  common: ["longhaul", "coil", "calibrate"],
  rare: ["splitter", "chamber", "press"],
  epic: ["splitter", "chamber", "press"],
  legendary: ["splitter", "chamber"],
};

export interface Good {
  uid: number;
  def: string;
  from: "cargo" | "deck" | "mod";
}

/** The trader wants your cheapest spare part: cargo first, then a gate on the deck, then turret gear. */
export function tradeGood(run: Run): Good | null {
  const rank = { cargo: 0, deck: 1, mod: 2 };
  const all: Good[] = [
    ...run.inventory.map((i) => ({ uid: i.uid, def: i.def, from: "cargo" as const })),
    ...run.build.items.filter((p) => ITEMS[p.def].kind === "gate").map((p) => ({ uid: p.uid, def: p.def, from: "deck" as const })),
    ...run.build.mods.map((m) => ({ uid: m.uid, def: m.def, from: "mod" as const })),
  ];
  all.sort((a, b) => rank[a.from] - rank[b.from] || ITEMS[a.def].price - ITEMS[b.def].price || a.uid - b.uid);
  return all[0] ?? null;
}

/** The foe this round if you accept a challenge from `boost` rounds ahead. */
export function eliteFoe(run: Run, boost: number): { name: string; hull: number } {
  const b = warlordBuild(run.enemyHero, run.round + boost);
  return { name: warlordName(run.enemyHero, run.round + boost), hull: HEROES[run.enemyHero].hull + b.hullBonus };
}

export const EVENTS: Record<EventId, EventDef> = {
  wreck: {
    id: "wreck", title: "WRECKED RAIDER", kind: "SALVAGE",
    text: ["A RAIDER'S CRUISER SMOKES IN THE DUST.", "ONE OF ITS GATES STILL HUMS."],
    choices: (_run, ev) => [
      { label: "SALVAGE", cost: [], gain: [{ k: "item", def: at(SALVAGE, ev.pick) }] },
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
      const d = ITEMS[g.def];
      const pool = UPGRADE[d.rarity].filter((id) => id !== g.def);
      const give: Delta = { k: "item", def: g.def, uid: g.uid, from: g.from };
      const note = g.from === "cargo" ? undefined : g.from === "deck" ? "FROM YOUR DECK" : "FROM A TURRET";
      return [
        { label: "SELL", cost: [give], gain: [gold(d.price)], note },
        { label: "SWAP", cost: [give], gain: [{ k: "item", def: at(pool, ev.pick) }], note },
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
      { label: "PLATING", cost: [gold(2)], gain: [{ k: "hull", n: 20 }] },
      { label: "PATCH UP", cost: [gold(4)], gain: [{ k: "lives", n: 1 }] },
      moveOn(),
    ],
  },
  herald: {
    id: "herald", title: "WARLORD'S HERALD", kind: "BOUNTY",
    text: ["A HERALD BLOCKS THE ROAD: HIS CHAMPION", "WANTS YOUR HULL. A PURSE FOR THE WINNER."],
    choices: (run) => {
      const f = eliteFoe(run, 2);
      return [
        { label: "ACCEPT", cost: [{ k: "elite", n: 2 }], gain: [{ k: "bounty", n: 8 }], note: `${f.name} · HULL ${f.hull}` },
        moveOn("DECLINE"),
      ];
    },
  },
  sappers: {
    id: "sappers", title: "ELVEN SAPPERS", kind: "MERCENARIES",
    text: ["ELVEN SAPPERS OFFER TO MINE", "YOUR FOE'S ROAD. FOR COIN."],
    choices: () => [
      { label: "HIRE", cost: [gold(2)], gain: [{ k: "foeHull", n: -25 }] },
      moveOn(),
    ],
  },
  scout: {
    id: "scout", title: "CARAVAN SCOUT", kind: "SCOUT",
    text: ["A TINKER'S SCOUT RIDES AHEAD", "TO THE NEXT CARAVAN."],
    choices: () => [
      { label: "HAGGLE", cost: [], gain: [{ k: "discount", n: 1 }] },
      { label: "SEND WORD", cost: [], gain: [{ k: "reroll", n: 1 }] },
      moveOn(),
    ],
  },
  storm: {
    id: "storm", title: "DARK WIND FRONT", kind: "DARK WIND",
    text: ["THE DARK WIND RISES OVER THE ROAD.", "RIVAL SCAVENGERS TURN BACK."],
    choices: () => [
      { label: "RIDE THROUGH", cost: [{ k: "hull", n: 10 }], gain: [gold(5)] },
      moveOn("TAKE COVER"),
    ],
  },
  smuggler: {
    id: "smuggler", title: "AMMO SMUGGLER", kind: "SMUGGLER",
    text: ["A SMUGGLER SELLS HOT GATES FROM", "UNDER A TARP. NO QUESTIONS ASKED."],
    choices: () => [
      { label: "BURN", cost: [gold(2)], gain: [{ k: "item", def: "temper" }] },
      { label: "SHOCK", cost: [gold(3)], gain: [{ k: "item", def: "coil" }] },
      moveOn(),
    ],
  },
};

export const EVENT_IDS = Object.keys(EVENTS) as EventId[];
/** Gentle intros for round 1: free gains only. */
export const INTRO_IDS: EventId[] = ["wreck", "cache"];
