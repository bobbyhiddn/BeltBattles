import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { HEROES, ITEMS, OFFERS, POOL_RULES, REROLL_COST, RULES_VERSION, RUN_DAYS, buyableModules, type HeroId, type ItemDef, type Rarity } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { MATRIARCH_DAY, maxGoldByDay as rivalsGold, warlordPool, DIFFICULTIES } from "../src/sim/rivals";
import { STAND_IN_POOL_HEROES, STAND_IN_POOL_RULES, standInPool } from "../src/sim/standInPool";
import { loadGhostPool } from "../src/net/fallback";
import { samplePoolJson } from "../tools/samplePool";
import { randomBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { EVENTS, EVENT_IDS, SWAP_TIER, UPGRADE, salvagePool, smugglerPool, type Delta, type EventId, type EventState } from "../src/game/eventDefs";
import { blockReason } from "../src/game/events";
import { MATRIARCH_GOLD, ROAD_PICKS, rewardGold, warlordDeck, warlordDeckDay, warlordReward } from "../src/game/road";
import { newRun, pendingRune, storePlaced, takeRune } from "../src/game/run";
import { gainModule } from "../src/game/fuse";
import {
  HULL_FLOOR, MODELLED_DELTAS, MODELLED_EVENTS, MODELLED_PICKS, MODELLED_REWARD_FIELDS, RoadModelError,
  checkRoadModel, discountGain, explainRoadCap, gmax, maxHonestSpend, resetRoadCapMemo, roadCap, roadCapFor, roadCapHoard, roadMixes, roadOptions,
  warlordPays,
} from "../src/net/roadCap";
import { buildCost, maxGoldByDay, validateBuild, validateUpload } from "../src/net/validate";
import { furnaceDeck, playerCheck } from "./netHelpers";
import { withDawnRunes } from "./runeFill";
import { npcDayRules, withNpcDay } from "../src/sim/npcDay"; // AZ-BUMP (the flip): 0.9.7's road where a test means it; S8c: npcDayRules, the budget line is left to the player mode only while NPC_DAY is on
import { withHullScale } from "../src/sim/hullScale"; // AZ-BUMP (the flip): 0.9.7's gold beside it
import { withShapes } from "../src/sim/shapes"; // SHAPES-1 (RUN5-SHAPES1 3): the ceiling before EMBER TROUGH's 5 G, SHAPES off

// v070-validate M3: the player mode (validateUpload) and its road ceiling (src/net/roadCap.ts).
// FLIP-X2 (cap's ruling 5d6d83ef57d1494c, item 5): an upload holds exactly `day` runes, so every deck these tests check in
// the player mode about something else (hull, belt, budget, items) holds its day's neutral runes (tests/runeFill.ts:
// they give no hull, belt or gold, so each assertion means what it meant); before the flip these decks held none.

const price = (id: string) => ITEMS[id].price;
const max = (xs: number[]) => Math.max(...xs);
/** FLIP-X2: the player mode on `b` holding its day's neutral runes (was validateUpload(b, day) on the rune-less deck). */
const up = (b: Build, day: number) => validateUpload(withDawnRunes(b, day), day);
const cats = (b: Build, day: number) => up(b, day).errors.map((e) => e.split(":")[0]); // FLIP-X2: with its day's runes
// NUM-1 (REQ-BFG-047): hull x10: a plate (ARMOR PACK) is ITEMS.plating.supply.hull, 250 (was 25); the dock's PLATING
// +200 (was +20) and RIDE THROUGH -100 (was -10) are eventDefs.ts's values
const PLATE = ITEMS.plating.supply!.hull!;
const DOCK = 200, RIDE = -100; // NUM-1: x10 (were 20 and -10)

/** The furnace starting deck plus `extra` rigs west of its belt (legal cells), plating and crates. */
function deck(extra: string[] = [], plates = 0, crates = 0, hullExtra = 0): Build {
  const b = furnaceDeck({ hullBonus: plates * PLATE + hullExtra, beltCap: HEROES.furnace.belt + 4 * crates }); // NUM-1: PLATE (was 25)
  extra.forEach((def, i) => b.items.push({ uid: 10 + i, def, x: 3, y: 4 - i, rot: 1 }));
  return b;
}

/** A furnace deck whose cost is exactly `gold`, made of plating (5) and crates (2) only. */
function deckCosting(gold: number): Build {
  for (let c = 0; c <= 4; c++) if ((gold - 2 * c) % 5 === 0 && gold - 2 * c >= 0) return deck([], (gold - 2 * c) / 5, c);
  throw new Error(`no plate/crate mix costs ${gold}`);
}

describe("roadCap: the player budget, derived from the live tables (D2)", () => {
  it("prints the per-day ceiling, its best plans and the mixes (REPORT.md §2)", () => {
    const rows = Array.from({ length: RUN_DAYS }, (_, i) => {
      const d = i + 1;
      return `  d${d}: shop ${maxGoldByDay(d)} + roadCap ${roadCap(d)} = ${maxHonestSpend(d)}; hoard ${roadCapHoard(d)}`
        + (d >= 2 ? `; gmax ${gmax(d)} (hoard ${gmax(d, true)}), DG ${discountGain(1, gmax(d))}` : "")
        + `\n      plan: ${explainRoadCap(d).map((p) => `${p.day} ${p.pick} ${p.value}`).join(" | ")}`;
    });
    const mixes = roadMixes().map((m) => `  [${m.labels.join(" + ") || "none"}] hull ${m.hull} belt ${m.belt}: ${Array.from({ length: RUN_DAYS }, (_, i) => roadCapFor(i + 1, m)).join(", ")}`);
    console.log(`v070 player ceiling per day:\n${rows.join("\n")}\nroadCapFor(day, mix):\n${mixes.join("\n")}`);
  });

  it("uses the same shop gold as the strict budget", () => {
    for (let d = 1; d <= RUN_DAYS; d++) expect(rivalsGold(d)).toBe(maxGoldByDay(d));
  });

  it("reads the road events' values from eventDefs.ts: SALVAGE, SMUGGLER, TRADER SWAP and the fixed choices", () => {
    const o = roadOptions();
    const best = (e: EventId, label: string, f: (x: { gold: number; pay: number; parts: number }) => number) =>
      max(o.get(e)!.filter((x) => x.label === label).map(f));
    expect(best("wreck", "SALVAGE", (x) => x.parts)).toBe(max(salvagePool().map(price)));
    expect(best("smuggler", "BURN", (x) => x.parts - x.pay)).toBe(max(smugglerPool("BURN").map(price)) - 2);
    expect(best("smuggler", "SHOCK", (x) => x.parts - x.pay)).toBe(max(smugglerPool("SHOCK").map(price)) - 3);
    // SWAP: a part one rarity up for the cheapest spare; the best trade is the priciest upgrade for the cheapest good
    const rarities = [...new Set(buyableModules().map((d) => d.rarity))] as Rarity[];
    const swapBest = max(rarities.map((r) => max(UPGRADE[SWAP_TIER[r]].map(price)) - Math.min(...buyableModules().filter((d) => d.rarity === r).map((d) => d.price))));
    expect(best("trader", "SWAP", (x) => x.parts)).toBe(swapBest);
    expect(best("trader", "SELL", (x) => x.gold + x.parts)).toBe(0); // the trader pays a part's value in full
    expect(best("dice", "BET 6", (x) => x.gold - x.pay)).toBe(11);
    expect(o.get("dock")!.find((x) => x.label === "PLATING")).toMatchObject({ pay: 2, hull: 200 }); // NUM-1: x10 (was 20)
    expect(o.get("storm")!.find((x) => x.label === "RIDE THROUGH")).toMatchObject({ gold: 5, hull: -100 }); // NUM-1: x10 (was -10)
    expect(o.get("cache")!.find((x) => x.label === "BELT SPOOL")).toMatchObject({ belt: 4, gold: 0 });
    expect(o.get("scout")!.find((x) => x.label === "HAGGLE")).toMatchObject({ discount: 1 });
    expect(o.get("herald")!.find((x) => x.label === "STAKE 3")).toMatchObject({ pay: 3, bounty: 10 });
  });

  it("every reward part is sold by a merchant and costs a 1-star copy (the Hard pick, the Matriarch's part)", () => {
    for (let d = 1; d <= RUN_DAYS; d++) {
      const ids = [...DIFFICULTIES.flatMap((t) => warlordPool(t).map((id) => [id, t] as const)), ...(d >= MATRIARCH_DAY ? [["matriarch", "hard"] as const] : [])];
      for (const [id, t] of ids) {
        for (const sab of [false, true]) {
          const r = warlordReward(id, t, warlordDeck(id, d, sab), warlordDeckDay(id, d, sab));
          for (const p of r.parts) expect(ITEMS[p].merchant, `${id} d${d} ${p}`).toBeDefined();
        }
      }
    }
  });

  it("a won fight pays the gold of the run's day, SABOTAGE or not (0.6.2 RULE EASY PAY: road.ts rewardGold)", () => {
    // warlordFight passes run.day: a sabotaged Easy fight on day 4 fights its day-3 deck but pays day 4's 3 gold
    for (let d = 1; d <= RUN_DAYS; d++) {
      for (const slot of [...DIFFICULTIES, "matriarch"] as const) {
        for (const p of warlordPays(slot, d)) {
          expect(p.gold, `${slot} ${p.id}${p.sabotaged ? "*" : ""} d${d}`).toBe(slot === "matriarch" ? MATRIARCH_GOLD : rewardGold(slot, d));
        }
      }
    }
    expect([1, 3, 4, 10].map((d) => rewardGold("easy", d))).toEqual([2, 2, 3, 3]); // Easy +3 from day 4
  });

  it("day 1 counts only what reaches the deck before its dusk: the best part, never gold", () => {
    // AZ-BUMP (the flip, NPC_DAY): 0.9.7's road (one road stop: the Hard pick's part, or an event) runs with NPC_DAY off. On,
    // a win's part is a drop the road log names (warlordReward offers none) and every day is a fight and then the day's
    // event, so day 1 is the fight (its gold can't reach the deck) and then the best event: the trader's SWAP, 5
    withNpcDay(() => {
      const hardDay1 = max(warlordPool("hard").flatMap((id) => [false, true].map((s) =>
        max([0, ...warlordReward(id, "hard", warlordDeck(id, 1, s), warlordDeckDay(id, 1, s)).parts.map(price)]))));
      const events = [...roadOptions().values()].flat().filter((x) => !x.hull && !x.belt).map((x) => x.parts - x.pay);
      expect(roadCap(1)).toBe(Math.max(hardDay1, ...events));
      expect(explainRoadCap(1)).toEqual([{ day: 1, pick: "hard", value: hardDay1 }]);
    }, false);
    expect(roadCap(1)).toBe(5);
    // SHAPES-1 (RUN5-SHAPES1 3, cap's ruling 1.1: EMBER TROUGH 4 -> 5 G): SALVAGE gives a free common rig (eventDefs.ts
    // salvagePool) and the ceiling prices it at the dearest one it can give; with SHAPES on that is EMBER TROUGH at 5 G, so
    // SALVAGE's 5 ties the trader's SWAP on day 1 and the plan names it first (the value stays 5). With SHAPES off: SWAP, as
    // before (at 4 G every pin here held: run 6's check on a throwaway export)
    expect(explainRoadCap(1)).toEqual([{ day: 1, pick: "easy/medium (or a lost fight), then event wreck: SALVAGE", value: 5 }]);
    withShapes(() => expect(explainRoadCap(1)).toEqual([{ day: 1, pick: "easy/medium (or a lost fight), then event trader: SWAP", value: 5 }]), false);
  });

  it("the best plan: one road stop a day, each event at most once, the Matriarch once from her day; it sums to roadCap", () => {
    for (let d = 1; d <= RUN_DAYS; d++) {
      const plan = explainRoadCap(d);
      expect(plan.map((p) => p.day)).toEqual(Array.from({ length: d }, (_, i) => i + 1));
      expect(plan.reduce((s, p) => s + p.value, 0)).toBe(roadCap(d));
      const events = plan.filter((p) => p.pick.startsWith("event ")).map((p) => p.pick.split(":")[0]);
      expect(new Set(events).size).toBe(events.length);
      const queen = plan.filter((p) => p.pick.startsWith("matriarch"));
      expect(queen.length).toBeLessThanOrEqual(1);
      for (const q of queen) expect(q.day).toBeGreaterThanOrEqual(MATRIARCH_DAY);
      // the deck's own day: no gold (a Hard win there is its part only)
      const last = plan[plan.length - 1];
      if (last.pick === "hard") expect(last.value).toBe(max(warlordPool("hard").flatMap((id) => [false, true].map((s) =>
        max([0, ...warlordReward(id, "hard", warlordDeck(id, d, s), warlordDeckDay(id, d, s)).parts.map(price)])))));
    }
  });

  it("per-day values (REPORT.md §2): pinned, so a content change that moves the ceiling is reviewed on purpose", () => {
    // v070-rel (rel-062-final 40d2b2c): TUNE-C builds the Hard warlord decks at good luck and the Matriarch's at stars-aligned
    // luck, so the Hard pick pays 5-7 on days 1-7 (was 7-8) and 10 from day 8, the Matriarch's part 10 (was 8); the
    // offer mix, the events and the shop gold are unchanged (output-v070-rel/REPORT.md §2). 062m: 7 18 30 46 62 80 99 116 133 155.
    // bb-0.8.6 (PACKS, REQ-BFG-051 P1-P2): the packs left the rolled stock and no discount reaches them, so the discount
    // term saves less (was 5 17 29 43 59 74 90 110 127 149 and maxHonestSpend 13 34 56 81 109 137 167 201 232 268)
    // CATCHUP-098 (REQ-BFG-024; cap's yes for roadCap, oracle bc842e7024551665): MOTH QUEEN's SPLITTER at good luck on day 4
    // makes the day-4 Hard win pay 7 (was 6; the best Hard prize row 5 6 6 6 7 7 7 10 10 10 -> 5 6 6 7 7 7 7 10 10 10), so the
    // ceiling loosens by 1-2 g on day 4 and days 6-10 (was 5 17 28 43 57 71 87 106 122 146 and maxHonestSpend
    // 13 34 55 81 107 134 164 197 227 265); src/net/roadCap.ts is unchanged (it reads the captains' tables)
    // AZ-BUMP (the flip, NPC_DAY and HULL_SCALE): 5 17 28 44 57 73 89 108 124 147 -> 5 20 36 51 66 80 93 102 114 123, and
    // maxHonestSpend 13 34 55 82 107 136 166 199 229 266 -> 13 37 63 89 116 143 170 194 222 248: with NPC_DAY on every day is
    // a fight and then the day's event (roadCap.ts npcPlanDP: a fight prices its gold only, the drops count through the
    // road log), and HULL_SCALE's gold (6 + min(day, 10) + 2) is the shop's gold from day 8 and gmax's. Both off: 0.9.7's
    // SHAPES-1 (RUN5-SHAPES1 3, cap's ruling 1.1: EMBER TROUGH 4 -> 5 G): with SHAPES on SALVAGE's free common rig is worth
    // up to 5 G (EMBER TROUGH), so the ceiling loosens by 1-2 g on days 6-10: 80 93 102 114 123 -> 81 94 104 115 125, and
    // maxHonestSpend 143 170 194 222 248 -> 144 171 196 223 250 (measured, run 6). SHAPES off: the values before (below)
    const table = Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1));
    expect(table).toEqual([5, 20, 36, 51, 66, 81, 94, 104, 115, 125]);
    expect(Array.from({ length: RUN_DAYS }, (_, i) => maxHonestSpend(i + 1))).toEqual([13, 37, 63, 89, 116, 144, 171, 196, 223, 250]);
    withShapes(() => {
      expect(Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1))).toEqual([5, 20, 36, 51, 66, 80, 93, 102, 114, 123]);
      expect(Array.from({ length: RUN_DAYS }, (_, i) => maxHonestSpend(i + 1))).toEqual([13, 37, 63, 89, 116, 143, 170, 194, 222, 248]);
    }, false);
    for (let d = 2; d <= RUN_DAYS; d++) expect(roadCap(d)).toBeGreaterThanOrEqual(roadCap(d - 1));
    withNpcDay(() => withHullScale(() => {
      expect(Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1))).toEqual([5, 17, 28, 44, 57, 73, 89, 108, 124, 147]);
      expect(Array.from({ length: RUN_DAYS }, (_, i) => maxHonestSpend(i + 1))).toEqual([13, 34, 55, 82, 107, 136, 166, 199, 229, 266]);
    }, false), false);
  });

  it("the discount: rolls of at most OFFERS distinct defs, rerolls at REROLL_COST; exact on small purses", () => {
    expect([OFFERS, REROLL_COST]).toEqual([5, 2]);
    // bb-0.8.6 (PACKS P1-P2): no pack is rolled or discounted, so the cheapest roll at -1 is 3 g rigs for 2 each (was: a
    // belt crate for 1 and four rigs: 1 / 5 / 6 / 8 below): 4 saved for 8 gold
    expect(discountGain(1, 0)).toBe(0);
    expect(discountGain(1, 1)).toBe(0);
    expect(discountGain(1, 9)).toBe(4);
    expect(discountGain(1, 17)).toBe(5); // four (8 g), a reroll (2) and three more (6 g): 4 + 3 - 2
    expect(discountGain(1, 20)).toBe(7); // a full roll (10 g), a reroll (2), four more (8 g): 5 + 4 - 2
    for (let g = 1; g < 120; g++) expect(discountGain(1, g)).toBeGreaterThanOrEqual(discountGain(1, g - 1));
    // the discount counts only at a caravan before the deck's dusk: a scout on the deck's own day is worth nothing
    for (let d = 2; d <= RUN_DAYS; d++) {
      const scout = explainRoadCap(d).find((p) => p.pick.startsWith("event scout"));
      if (scout) expect(scout.day).toBeLessThan(d);
    }
    expect(gmax(2)).toBe(maxGoldByDay(2)); // a scout on day 1: nothing from the road before it
  });

  it("the slack diagnostic (a discount funded by road gold alone) never exceeds the ceiling", () => {
    for (let d = 1; d <= RUN_DAYS; d++) {
      expect(roadCapHoard(d)).toBeLessThanOrEqual(roadCap(d));
      if (d >= 2) expect(gmax(d, true)).toBeLessThanOrEqual(gmax(d));
    }
    // v070-rel: gmax's liquid road plan holds less (the Hard pick pays less on days 1-7). 062m: 0 0 0 0 2 4 7 9 9 12
    // bb-0.8.6 (PACKS P1-P2): the discount reaches no pack (was 0 0 0 0 2 3 4 7 8 9)
    // CATCHUP-098 (cap's yes for roadCap, oracle bc842e7024551665): MOTH QUEEN's day-4 SPLITTER (a 7 g part, was 6) counts as
    // gold in roadCap's liquid plan from day 6 (roadCap +2, roadCapHoard +1 on days 6-9); was 0 0 0 2 1 3 3 6 6 11
    // AZ-BUMP (the flip, NPC_DAY and HULL_SCALE): 0 0 0 2 1 4 4 7 7 11 -> 0 0 0 0 0 1 1 1 1 1: with NPC_DAY on a fight pays
    // gold only in roadCap's plans (no Hard pick's part: the drops are the road log's), so the parts gmax's liquid plan
    // counts as gold are the events' alone. Both off: 0.9.7's
    // SHAPES-1 (RUN5-SHAPES1 3: EMBER TROUGH 5 G): SALVAGE's dearer rig counts as gold in roadCap's liquid plan on days 8 and
    // 10 (measured, run 6): 1 1 1 1 1 -> 1 1 2 1 2 on days 6-10; SHAPES off as before
    expect(Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1) - roadCapHoard(i + 1))).toEqual([0, 0, 0, 0, 0, 1, 1, 2, 1, 2]);
    withShapes(() => expect(Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1) - roadCapHoard(i + 1))).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]), false);
    withNpcDay(() => withHullScale(() => {
      expect(Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1) - roadCapHoard(i + 1))).toEqual([0, 0, 0, 2, 1, 4, 4, 7, 7, 11]);
    }, false), false);
  });
});

describe("player hull and belt rules (D3)", () => {
  // NUM-1: x10 (was [0, 20, -10, 10] and % 25)
  const reachable = (h: number, day: number) =>
    [0, DOCK, RIDE, DOCK + RIDE].some((r, i) => h - r >= 0 && (h - r) % PLATE === 0 && (i < 3 || day >= 2)); // dock + storm need 2 road stops

  it("accepts exactly the hullBonus values an honest run can reach by the day (plates, dock +200, ride-through -100)", () => {
    for (const day of [1, 2, 10]) {
      for (let h = -400; h <= 1600; h += 50) { // NUM-1: x10 (was -40..160 step 5)
        const e = up(deck([], 0, 0, h), day).errors; // FLIP-X2: with its day's runes
        expect(e.some((x) => x.startsWith("supply: hullBonus")), `day ${day} hull ${h}: ${e.join(" | ")}`).toBe(!reachable(h, day));
      }
    }
  });

  it("the HULL_FLOOR is events.ts's HULL TOO WEAK", () => {
    const run = newRun("furnace", 3);
    const ride = EVENTS.storm.choices(run, { day: 1, id: "storm", roll: 0, pick: 0, picked: -1 })[0];
    expect(ride.cost).toEqual([{ k: "hull", n: -RIDE }]); // NUM-1: RIDE THROUGH costs 100 hull (was 10)
    run.build.hullBonus = HULL_FLOOR - RIDE - HEROES.furnace.hull; // NUM-1: the ride's 100 (was HULL_FLOOR + 10 - hull)
    expect(blockReason(run, ride)).toBeUndefined();
    run.build.hullBonus -= 1;
    expect(blockReason(run, ride)).toBe("HULL TOO WEAK");
    for (const h of Object.values(HEROES)) expect(h.hull + RIDE).toBeGreaterThanOrEqual(HULL_FLOOR); // never binds today (NUM-1: was h.hull - 10)
  });

  it("costs the hull at its cheapest honest mix: the dock's plating costs 2 gold and the day's road stop", () => {
    // NUM-1: hull x10: the dock's +200 (was 20), RIDE THROUGH's -100 (was -10), both 100 (was 10), a plate + the dock 450 (was 45)
    expect(validateBuild(deck(["temper", "whetstone"], 0, 0, DOCK), 1).errors.join()).toMatch(/supply: hullBonus 200/); // strict
    // FLIP-X2: each upload below holds its day's runes (up)
    expect(up(deck(["temper", "whetstone"], 0, 0, DOCK), 1)).toEqual({ ok: true, errors: [] }); // 6 + dock 2 = 8
    // AZ-BUMP (the flip, NPC_DAY): the dock's 2 gold out of day 1's purse is 0.9.7's road (the event instead of the fight),
    // so this line runs with NPC_DAY off. On, the day's fight comes first and its gold pays the dock's (HULL-1c, roadCap.ts
    // npcPlanDP), so the same 7-gold deck fits day 1's 8
    withNpcDay(() => expect(up(deck(["temper", "quench"], 0, 0, DOCK), 1).errors.join()).toMatch(/^budget: build costs 7 gold .*road dock PLATING.* allows at most 6/), false);
    expect(up(deck(["temper", "quench"], 0, 0, DOCK), 1)).toEqual({ ok: true, errors: [] });
    expect(up(deck(["temper", "whetstone"], 0, 0, RIDE), 1).ok).toBe(true); // RIDE THROUGH: its 5 g come after dusk
    expect(up(deck([], 0, 0, DOCK + RIDE), 1).errors.join()).toMatch(/^supply: hullBonus 100 is not a hull a player can reach by day 1/);
    expect(up(deck([], 0, 0, DOCK + RIDE), 2).ok).toBe(true); // dock + ride-through on two days
    expect(up(deck([], 1, 0, DOCK), 3).ok).toBe(true); // 450 = a plate + the dock
  });

  it("accepts the belt as the hero's base plus crates and the BELT SPOOL; nothing off the +4 grid", () => {
    // FLIP-X2: each upload below holds its day's runes (up)
    expect(up(deck([], 0, 1), 1).ok).toBe(true);
    expect(up(furnaceDeck({ beltCap: HEROES.furnace.belt + 2 }), 5).errors.join()).toMatch(/^supply: beltCap 16 is not 14 \+ whole \+4 belt crates/);
    expect(up(furnaceDeck({ beltCap: HEROES.furnace.belt - 4 }), 5).errors.join()).toMatch(/^supply: beltCap 10/);
    // the spool is free but takes a road stop: the cheapest mix wins (here the crate). v070-rel: day 1 allows 13 (was 15)
    const b = deck(["temper", "quench", "venom"], 0, 1); // 11 + a crate (2) = 13 <= 13; as a spool, 11 > 8 + roadCapFor(1, spool) 0
    expect(up(b, 1).ok).toBe(true);
    expect(up(deck(["temper", "quench", "coil"], 0, 1), 1).errors.join()).toMatch(/^budget: build costs 14 gold .* allows at most 13 /); // 1 gold more
  });

  it("the mixes: every combination of the road's hull and belt choices, costed by the plans that take them", () => {
    const keys = roadMixes().map((m) => m.key).sort();
    // NUM-1: the hull parts x10 (were dock(20,0) and storm(-10,0))
    expect(keys).toEqual(["", "cache(0,4)", "cache(0,4) dock(200,0)", "cache(0,4) dock(200,0) storm(-100,0)", "cache(0,4) storm(-100,0)", "dock(200,0)", "dock(200,0) storm(-100,0)", "storm(-100,0)"]);
    for (const m of roadMixes()) {
      for (let d = 1; d <= RUN_DAYS; d++) {
        const c = roadCapFor(d, m);
        if (m.forced.size > d) expect(c).toBe(-Infinity);
        else expect(c).toBeLessThanOrEqual(roadCap(d) + 5); // a forced RIDE THROUGH pays at most its 5 g
      }
    }
  });
});

describe("adversarial decks (M3): each refused by the player mode with the right category", () => {
  it("1 gold over maxHonestSpend is refused on budget; exactly maxHonestSpend passes", () => {
    for (let d = 1; d <= RUN_DAYS; d++) {
      const at = deckCosting(maxHonestSpend(d)), over = deckCosting(maxHonestSpend(d) + 1);
      expect(buildCost(at).total).toBe(maxHonestSpend(d));
      expect(up(at, d), `day ${d}`).toEqual({ ok: true, errors: [] }); // FLIP-X2: with its day's runes
      expect(cats(over, d), `day ${d}`).toEqual(["budget"]);
    }
  });

  it("a hull one step off the reachable set is refused on supply", () => {
    // NUM-1: x10 (were 30, 5, -20 and 10), so each is still the same step off the reachable set
    expect(cats(deck([], 0, 0, 300), 5)).toEqual(["supply"]); // 300 = 250 + 50: no mix
    expect(cats(deck([], 0, 0, 50), 10)).toEqual(["supply"]);
    expect(cats(deck([], 0, 0, 2 * RIDE), 10)).toEqual(["supply"]); // below one RIDE THROUGH (-200)
    expect(cats(deck([], 0, 0, DOCK + RIDE), 1)).toEqual(["supply"]); // dock + storm: two road stops (100)
  });

  it("an unfused pair is refused (item)", () => {
    const b = deck(["temper", "temper"]);
    expect(up(b, 5).errors.join()).toMatch(/^item: UNFUSED PAIR: TEMPER ★1 x2/); // FLIP-X2: with its day's runes
  });

  it("another hero's signature factory is refused (item)", () => {
    const b = furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "loom", x: 0, y: 8 }] });
    expect(up(b, 5).errors.join()).toMatch(/item: uid 2 LOOM is another hero's signature factory/); // FLIP-X2: with its day's runes
  });

  it("a part no merchant sells is refused (item)", () => {
    const proto: ItemDef = { id: "zz_proto", name: "PROTOTYPE", kind: "gate", rarity: "common", price: 3, size: 1, desc: [] };
    ITEMS.zz_proto = proto;
    try {
      expect(up(deck(["zz_proto"]), 5).errors.join()).toMatch(/^item: uid 10 PROTOTYPE is not sold by any merchant/); // FLIP-X2: with its day's runes
    } finally {
      delete ITEMS.zz_proto;
    }
  });
});

describe("superset (D1): the player mode accepts every deck the strict mode accepts", () => {
  it("all 120 stand-in pool decks pass both modes", () => {
    let n = 0;
    const carry = { turrets: 0, bought: 0, joined: 0, joins: 0, both: 0 }; // v070-rel: the bb-0.6.2 pool (step 5)
    for (const hero of STAND_IN_POOL_HEROES) {
      for (let day = 1; day <= RUN_DAYS; day++) {
        for (const e of standInPool(hero, day)) {
          n++;
          // S8c (the pools): RULING-S8-R5 section 3 item 1 (T1e's form, RULING-S8-R1 item 3).
          // a48010b: with NPC_DAY on, a road-fed deck spends the road's drops too, by design. The regenerated pool's picks are
          // road-fed (P1 83c039d, NPC_DAY on: each tuple's 7th element is its road log), so a deck may cost more than the
          // shop's gold alone, which the strict mode's budget line doesn't count; its drops count through its road log, in the
          // player mode. So each deck is held to validateBuild's lines minus at most its ONE budget line (matched by its
          // "budget: " prefix, and only while NPC_DAY is on: off, the strict check stays whole), AND to validateUpload in the
          // player mode with its road log (a stand-in carries no run seed). Was: validateBuild(e.build, day) and
          // validateUpload(e.build, day) (no road log) each toEqual { ok: true, errors: [] }
          const strict = validateBuild(e.build, day).errors;
          const budget = npcDayRules() ? strict.filter((x) => x.startsWith("budget: ")) : [];
          expect(budget.length, `${hero} d${day}: at most its one budget line`).toBeLessThanOrEqual(1);
          expect(strict.filter((x) => !budget.includes(x)), `${hero} d${day}: every other strict line`).toEqual([]);
          expect(validateUpload(e.build, day, RULES_VERSION, { ...(e.road ? { road: e.road } : {}) }), `${hero} d${day}: the player mode with its road log`).toEqual({ ok: true, errors: [] });
          const t = (e.build.turrets ?? []).length > 0, j = e.build.routes.filter((r) => r.join !== undefined).length;
          carry.turrets += t ? 1 : 0;
          carry.bought += (e.build.turrets ?? []).some((x) => !x.free) ? 1 : 0;
          carry.joined += j ? 1 : 0;
          carry.joins += j;
          carry.both += t && j ? 1 : 0;
        }
      }
    }
    expect(n).toBe(120);
    console.log(`v070-rel: the ${STAND_IN_POOL_RULES} stand-in pool: ${n} decks; ${carry.turrets} carry a turret list (${carry.bought} with a bought turret), ${carry.joined} a joined belt (${carry.joins} joins), ${carry.both} both`);
    expect(STAND_IN_POOL_RULES).toBe(POOL_RULES); // RUNES-1: bb-0.8.7 carries bb-0.8.6's pool (content.ts POOL_RULES_CARRIED)
    expect(carry).toEqual(POOL_CARRIES);
  });

  it("the bundled ghost pool (tools/samplePool.ts): the strict loader takes every snapshot and the player mode accepts each", () => {
    const load = loadGhostPool(samplePoolJson());
    expect(load.rejected).toEqual([]);
    expect(load.entries).toHaveLength(120); // 0.7.0a D5: 40 sample ghosts and 20 floor ghosts; 0.8.0 RC: 60 race ghosts (was 60)
    let turrets = 0, joined = 0;
    for (const { snapshot: s } of load.entries) {
      expect(s.rules).toBe(RULES_VERSION);
      // S8 T1c (REQ-BFG-092; cause a48010b, BRIEF-AZBUMP-S8L): with NPC_DAY on a seed ghost is road-fed, and the player mode
      // counts its drops only through its road log, so it goes in as ctx.road with its run seed, as the seed step's checks pass
      // them (tools/samplePool.ts seedGhost; server/seed.ts checkPool)
      expect(validateUpload(s.build, s.day, s.rules, { ...(s.road ? { road: s.road } : {}), ...(s.seed !== undefined ? { seed: s.seed } : {}) }), `${s.hero} d${s.day}`).toEqual({ ok: true, errors: [] });
      turrets += (s.build.turrets ?? []).length > 0 ? 1 : 0;
      joined += s.build.routes.some((r) => r.join !== undefined) ? 1 : 0;
    }
    console.log(`v070-rel: the bundled ghost pool: ${load.entries.length} snapshots; ${turrets} carry a turret list, ${joined} a joined belt`);
    expect([turrets, joined]).toEqual(GHOST_POOL_CARRIES);
    // S8c (the GATE RULE, test only; as T1e gave net-pool's generateSamplePool() reader, 92f1948): 600 s. Cause: with PICK on
    // (HULL-ON's flip 9ffda51) samplePoolJson() builds and grades the whole seed pool, the file's one grading: 96 s and 107 s
    // here beside other lanes (r3a-b-netupload, r3a-3-a2), over vitest's 30-s default; its packet red (GHOST_POOL_CARRIES, an
    // assertion) hid the time until S8c made it pass
  }, 600_000);

  it("a harness sample (all six heroes, stars, cores and factories on): every deck strict accepts, player accepts", () => {
    let strict = 0, n = 0;
    for (const hero of HARNESS_HEROES as readonly HeroId[]) {
      for (let day = 1; day <= RUN_DAYS; day++) {
        for (let i = 0; i < 2; i++) {
          // FLIP-X2: the harness deck with its day's runes (neutral: strict takes the same decks as before; was rune-less,
          // which strict still takes and the player mode's exact count now refuses)
          const b = withDawnRunes(randomBuild(hero, day, new Rng(hashSeed("v070-superset", hero, day, i)), "on", 3, "on", "on"), day);
          n++;
          if (!validateBuild(b, day).ok) continue;
          strict++;
          expect(playerCheck(b, day), `${hero} d${day} #${i}`).toEqual({ ok: true, errors: [] }); // 0.8.0 H1: rules by hero
        }
      }
    }
    expect(strict).toBeGreaterThan(n * 0.8);
  }, 120_000);

  it("on any deck, the player mode's errors are the strict errors minus supply and budget (plus its own supply/budget)", () => {
    const decks: [Build, number][] = [
      [deck(["temper", "temper"], 2), 3], [furnaceDeck({ items: [] , routes: [] }), 2], [deck([], 0, 0, DOCK), 1], [deckCosting(200), 4], // NUM-1: DOCK (was 20)
    ];
    for (const [b0, d] of decks) {
      const b = withDawnRunes(b0, d); // FLIP-X2: the deck holds its day's runes, through both modes
      const s = validateBuild(b, d).errors.filter((e) => !/^(supply|budget):/.test(e));
      const p = validateUpload(b, d).errors.filter((e) => !/^(supply|budget):/.test(e));
      expect(p).toEqual(s);
    }
  });
});

describe("game bugs found on the way (REPORT.md §7)", () => {
  // run.ts storePlaced refused only KILN and LOOM ("THE SIGNATURE FACTORY STAYS ABOARD"). A race hero (newRun starts
  // one; the UI does not offer them yet, heroBuilds.ts PLAYABLE_HEROES) could store its signature factory in cargo,
  // then sell it for 1 gold or hand it to the TRADER (cargo first) for a free epic part; its dusk deck then had no
  // signature factory, which both modes refuse. v070-validate kept this a .todo (brief D6). v070-rel M3 applies
  // output-v070-validate/062m/proposed/storePlaced-race-signatures.patch: every hero's signature factory stays aboard.
  it("storePlaced keeps every hero's signature factory aboard (the race heroes too)", () => {
    for (const hero of ["foundry", "bastion", "metronome", "siphon"] as HeroId[]) {
      const run = newRun(hero, 5);
      // FLIP-X2: the run takes day 1's dawn rune first, as the picker does (pendingRune, takeRune: the first card, as
      // tooling.ts playOut), so its deck holds the one rune an upload of day 1 needs (it held none)
      expect(takeRune(run, pendingRune(run)!.ids[0]).ok, hero).toBe(true);
      const sig = run.build.items.find((p) => p.def === HEROES[hero].factory)!;
      expect(storePlaced(run, sig.uid)).toBe(false);
      expect(playerCheck(run.build, 1)).toEqual({ ok: true, errors: [] }); // 0.8.0 H1: under rules that accept the hero
    }
  });
});

describe("the D4 guard: new road content must update the ceiling on purpose", () => {
  /** Every Delta kind any event choice holds, under a broad set of states (empty, each held part, a deck rig). */
  function liveKinds(): Set<string> {
    const kinds = new Set<string>();
    const runs = [newRun("furnace", 7), ...buyableModules().map((d) => {
      const r = newRun("weaver", 7);
      gainModule(r, d.id);
      return r;
    })];
    for (const e of EVENT_IDS) {
      for (const run of runs) {
        for (let j = 0; j < 32; j++) {
          const ev: EventState = { day: 1, id: e, roll: 0, pick: (j + 0.5) / 32, picked: -1 };
          for (const c of EVENTS[e].choices(run, ev)) for (const d of [...c.cost, ...c.gain]) kinds.add(d.k);
        }
      }
    }
    return kinds;
  }

  it("every event, Delta kind, fork pick and warlord reward field of the live content is modelled", () => {
    expect([...EVENT_IDS].sort()).toEqual(Object.keys(MODELLED_EVENTS).sort());
    for (const k of liveKinds()) expect(MODELLED_DELTAS, `Delta kind "${k}"`).toContain(k);
    expect([...ROAD_PICKS]).toEqual([...MODELLED_PICKS]);
    for (let d = 1; d <= RUN_DAYS; d++) {
      for (const t of DIFFICULTIES) {
        for (const id of [...warlordPool(t), ...(t === "hard" && d >= MATRIARCH_DAY ? ["matriarch" as const] : [])]) {
          for (const s of [false, true]) {
            const r = warlordReward(id, t, warlordDeck(id, d, s), warlordDeckDay(id, d, s));
            for (const k of Object.keys(r)) expect(MODELLED_REWARD_FIELDS, `reward field "${k}"`).toContain(k);
          }
        }
      }
    }
    expect(() => checkRoadModel()).not.toThrow();
  });

  it("an unmodelled Delta kind stops the ceiling, and uploads are refused loudly (never silently accepted)", () => {
    const dice = EVENTS.dice.choices;
    EVENTS.dice.choices = (run, ev) => [...dice(run, ev), { label: "CHEST", cost: [], gain: [{ k: "chest", n: 1 } as unknown as Delta] }];
    resetRoadCapMemo();
    try {
      expect(() => roadOptions()).toThrow(RoadModelError);
      const v = up(deck(), 3); // FLIP-X2: with its day's runes
      expect(v.ok).toBe(false);
      expect(v.errors.join()).toMatch(/^budget: the player ceiling is unavailable: roadCap: a "chest" gain/);
    } finally {
      EVENTS.dice.choices = dice;
      resetRoadCapMemo();
    }
    expect(up(deck(), 3).ok).toBe(true);
  });

  it("an unreviewed road event stops the ceiling", () => {
    (EVENT_IDS as string[]).push("zz_fair");
    (EVENTS as Record<string, unknown>).zz_fair = { ...EVENTS.cache, id: "zz_fair" };
    resetRoadCapMemo();
    try {
      expect(() => checkRoadModel()).toThrow(/road event "zz_fair" is not modelled/);
      expect(up(deck(), 3).errors.join()).toMatch(/player ceiling is unavailable/); // FLIP-X2: with its day's runes
    } finally {
      (EVENT_IDS as string[]).pop();
      delete (EVENTS as Record<string, unknown>).zz_fair;
      resetRoadCapMemo();
    }
    expect(up(deck(), 3).ok).toBe(true);
  });
});

// v070-rel M1 recheck 2 (output-v070-rel/REPORT.md §3): what the bb-0.6.2 bundled pools carry. A regenerated pool moves
// these on purpose. The stand-in pool's decks: with a turret list (the layout differs from the hero's start), with a
// bought turret, with a joined belt, the joins, and with both a turret list and a joined belt.
// 0.8.0 I1 M3 (oracle 64485b535a06683c): the stand-in pool regrown through the per-run draw with wave 3 live (was
// { turrets: 46, bought: 32, joined: 82, joins: 129, both: 31 })
// 0.8.0 B1 M2 (oracle efb5c4ff84fe4c6d): the stand-in pool regenerated after the hero numbers (was
// { turrets: 38, bought: 32, joined: 73, joins: 116, both: 26 })
// BELTS run 5 (REQ-BFG-043/044): the bb-0.8.3 pool, regenerated with the gold upgrades (44ee031), carries 30 turret
// lists (18 with a bought turret), 76 joined belts (124 joins), 20 both (was 35 (29), 76 (121), 27)
// bb-0.8.6 (PACKS M4): the stand-in pool regenerated with the packs (23bb3d2; the tool's data): was turrets 30, bought
// 18, joined 76, joins 124, both 20
// FLIP-X2: the stand-in pool regenerated at 94e0cbf under bb-0.9.0 (every deck holding its day's runes): was turrets 25,
// bought 9, joined 62, joins 96, both 17
// REDO-X step 2 (4.1): the stand-in pool regenerated once more on FIX-ABE's offers (09ce97c; the pools changed, the
// regeneration): was turrets 17, bought 10, joined 64, joins 91, both 8
// BAL-2 step 5 (4.1): the stand-in pool regenerated once on bb-0.9.1 (c5e4780; the pools changed, the regeneration): was
// turrets 12, bought 5, joined 70, joins 106, both 7
// Y7b2 (the pools): the stand-in pool regenerated once on bb-0.9.3 (4d772e4; step 5, the regeneration): was turrets 19,
// bought 10, joined 75, joins 113, both 11
// Z-BUMP (the pools): the stand-in pool regenerated once under bb-0.9.7 (2c4ba76; S6 lane 1, the regeneration): was
// turrets 15, bought 9, joined 81, joins 122, both 8
// S8c (the pools): the stand-in pool regenerated once with every switch on as shipped (P1 83c039d, NPC_DAY on; its
// picks road-fed): was turrets 16, bought 9, joined 77, joins 121, both 7
const POOL_CARRIES = { turrets: 72, bought: 31, joined: 81, joins: 185, both: 51 };
/** The bundled ghost pool's snapshots with a turret list and with a joined belt. */
// 0.7.0a D5: the seed pool's 40 sample ghosts carry turret lists and joined belts; its 20 floor ghosts add theirs
// (tests/seed.records.test.ts checks the split). 0.8.0 I1 M3 (oracle 64485b535a06683c): from the regrown pool, the sample
// ghosts carry 9 turret lists and 26 joined belts and the floor ghosts 9 and 12 (were 14 and 28, 10 and 13: [24, 41])
// 0.8.0 B1 M2 (oracle efb5c4ff84fe4c6d): the stand-in pool regenerated after the hero numbers: the sample ghosts carry 8
// and 29, the floor ghosts 7 and 12 (were 9 and 26, 9 and 12: [18, 38])
// 0.8.0 RC (oracle 96e0ebe434a93f2b): the seed pool takes FOUNDRY and BASTION's 60 race ghosts (the par player's decks),
// which carry 11 turret lists and 34 joined belts; FURNACE and WEAVER's 60 still carry 15 and 41 (was [15, 41])
// BELTS run 5 (REQ-BFG-043/044): the seed pool regenerated from the bb-0.8.3 stand-in pool and the upgrade-buying par
// player: 26 carry a turret list, 68 a joined belt (was [26, 75])
// NUM-2 (REQ-BFG-047, SPEED K = 30): re-measured, 61 joined (was 62). No src/net change: load.rejected stays [] and every
// snapshot passes validateUpload. The race ghosts are generated by the par player, whose deck rating now reads TURRET
// SPEED's whole +20% step (RAMPART 40 -> 48 a 30 s; was the interval x0.85, +17.6%): BASTION par seed 3 buys TURRET SPEED
// instead of a KEG on day 3 (scores 0.019774 v 0.019055; were 0.018692 v 0.018923), and its day-6 deck (BASTION d6 v1)
// then feeds a DECK GUN in the extra slot, redrawing its joined WARDWORKS belt, so it carries no join
// NUM-3 (REQ-BFG-046, REQ-BFG-047): re-measured, 59 joined (was 61). No src/net change: load.rejected stays [] and every
// snapshot passes validateUpload. The par player generates the race ghosts, and R1's STUN fold and the whole-second
// durations move its fights, so 9 more FOUNDRY / BASTION dusk decks come out differently (rc.seedpool's NUM3_GHOSTS_DIFFER);
// two of them no longer carry a joined belt. The seed pool is not regenerated (R6 does)
// FLIP-X2: the seed pool from the stand-in pool regenerated at 94e0cbf (120 v3 snapshots holding their day's runes): was 22, 59
// REDO-X step 2 (4.2): the seed pool from the stand-in pool regenerated at 09ce97c and the par player on FIX-ABE's offers
// (the pools changed, the regeneration): was 15, 54
// BAL-2 step 5 (the seed pool from the stand-in pool regenerated at c5e4780; the pools changed): was 9, 59
// Y7b2 (the pools): the seed pool regenerated at step 5 from the stand-in pool regenerated at 4d772e4 and the par player
// under release Y's rules (sample 6 and 26, floor 3 and 15, race 4 and 24; tests/seed.records.test.ts): was 12, 62
// Z-BUMP (the pools): the seed pool regenerated once under bb-0.9.7 (2c4ba76) from the regenerated stand-in pool and the
// par player with the overfeed (sample 9 and 23, floor 2 and 14, race 4 and 25; the race's one more joined deck than
// Y7b2's 24 is the overfeed's, S1b's [13, 66]): was 13, 65
// S8c (the pools): the seed pool regenerated once with every switch on as shipped (c6d3445; NPC_DAY on, its seed ghosts
// road-fed) from the stand-in pool regenerated at P1 83c039d: was 15, 62
// SOFT-1: the seed pool softened (REQ-BFG-092; 26769d1, tools/samplePool.ts SOFT1_PICKS): every hero's variant 0 and 1 decks
// are the softer picks, 79 of 80 par-field runs' dusk decks (sample 22 and 23, floor 2 and 10 as before, race 19 and 30;
// tests/seed.records.test.ts): was 51, 69
const GHOST_POOL_CARRIES = [43, 63]; // bb-0.8.6 (PACKS M4): the seed pool from the regenerated stand-in pool (was 26, 68); NUM-2: was 22, 62; NUM-3: was 22, 61
