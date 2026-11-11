import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { HEROES, ITEMS, OFFERS, POOL_RULES, REROLL_COST, RULES_VERSION, RUN_DAYS, buyableModules, type HeroId, type ItemDef, type Rarity } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { MATRIARCH_DAY, maxGoldByDay as rivalsGold, warlordPool, DIFFICULTIES } from "../src/sim/rivals";
import { STAND_IN_POOL_DAYS, STAND_IN_POOL_HEROES, STAND_IN_POOL_RULES, standInPool } from "../src/sim/standInPool"; // BUMP-1D: + STAND_IN_POOL_DAYS (16)
import { loadGhostPool } from "../src/net/fallback";
import { samplePoolJson } from "../tools/samplePool";
import { generateSamplePool } from "./helpers/poolCache"; // CACHE-1: the cached twin (samplePoolJson() alone would build the pool for real: its default is generateSamplePool())
import { randomBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { EVENTS, EVENT_IDS, SWAP_TIER, UPGRADE, eventIds, salvagePool, smugglerPool, type Delta, type EventId, type EventState } from "../src/game/eventDefs";
import { withEnchant } from "../src/sim/enchant"; // ENCHANT-2 (REQ-BFG-085, T3): the ASH SHRINE is a road event only under ENCHANT
import { SHRINE_HULL } from "../src/game/shrine"; // BUMP-1F (RULING-BUMP1F-R3.1): the shrine's OFFER HULL card costs this much max hull (100): a hull sum the player mode takes
import { blockReason } from "../src/game/events";
import { MATRIARCH_GOLD, ROAD_PICKS, rewardGold, warlordDeck, warlordDeckDay, warlordReward } from "../src/game/road";
import { newRun, pendingRune, rollShop, storePlaced, takeRune } from "../src/game/run"; // BUMP-1D: + rollShop (the price test)
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
import { SHAPES2_IDS, withShapes2 } from "../src/sim/shapes2"; // BUMP-1D: SAW BAR and SPARK COMB (5 G commons) stand in ITEMS with SHAPES off alone
import { PLAIN_RIG_IDS, withPlainRigs } from "../src/sim/plainRigs"; // BUMP-1D: the world before the twelve (PLAIN_RIGS and SHAPES2) is all three switches off
import { withScaleRigs } from "../src/sim/scale"; // BUMP-1E: and the scaling switch, added last, goes off first (catalogueOff)

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

/** BUMP-1D: the catalogue as it was before SHAPES-1's three rigs (NAIL STRIP, EMBER TROUGH, SPIKE RAIL) and the twelve of
 *  PLAIN_RIGS and SHAPES2: the three switches off, which is the world these pins meant by "SHAPES off" (the pins that follow in
 *  that world are the ones from before). SHAPES off alone is not it any more: SHAPES2's SAW BAR and SPARK COMB (5 G commons)
 *  stay in ITEMS and SALVAGE's dearest free rig is 5 G with them, as with EMBER TROUGH. The switches go off last-in first-out
 *  and come back in the reverse (the validator's own nesting, validate.ts inShapesWorld), so ITEMS keeps its order (PLAIN's
 *  six, SHAPES-1's three, SHAPES2's six, after the base defs). Measured (BUMP-1D): a lone withShapes(.., false) puts the
 *  three back behind the twelve, and the par player's decks of the same seeds come out different from then on in the same
 *  worker (FOUNDRY, FURNACE, WEAVER and BASTION on three seeds: 12 of 12 decks differ; the nesting below: 0 of 12). */
// BUMP-1E: SCALE_RIGS ships on and its seven ids are the LAST defs in ITEMS (scale.ts: after SHAPES2's six), so by the rule above the scaling switch is the
// outermost: it goes off first and comes back last. Without it every catalogueOff left SHAPES-1's three and the twelve behind the seven, and the par player's
// decks of the same seeds came out different from then on in the worker (the bundled ghost pool test: 'SOFT-1: stale: the pick f3:c5680d21 for foundry day 1').
// It is also the world these pins meant: the catalogue before the twelve and the seven (was withShapes2(() => withShapes(() => withPlainRigs(fn, false), false), false))
const catalogueOff = <T>(fn: () => T): T => withScaleRigs(() => withShapes2(() => withShapes(() => withPlainRigs(fn, false), false), false), false);

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
    // BUMP-1D: the twelve new pieces keep it (SAW BAR and SPARK COMB are 5 G commons too; PICKAXE, 8 G, is epic): the value 5 and the
    // plan's first name are the same on and off SHAPES2, the old world is all three switches off (catalogueOff; was withShapes(.., false))
    expect(explainRoadCap(1)).toEqual([{ day: 1, pick: "easy/medium (or a lost fight), then event wreck: SALVAGE", value: 5 }]);
    withShapes2(() => expect(explainRoadCap(1)).toEqual([{ day: 1, pick: "easy/medium (or a lost fight), then event wreck: SALVAGE", value: 5 }]), false);
    catalogueOff(() => expect(explainRoadCap(1)).toEqual([{ day: 1, pick: "easy/medium (or a lost fight), then event trader: SWAP", value: 5 }]));
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
    // BUMP-1D (PLAIN_RIGS and SHAPES2 on, the twelve in the catalogue, RASP 4 G): the ceiling does not move, the table below
    // is the same 5 20 36 51 66 81 94 104 115 125 (the dearest free common rig SALVAGE can give is still 5 G: SAW BAR, SPARK
    // COMB and EMBER TROUGH; the dearest SWAP, the SMUGGLER's parts and the discount's savings are no dearer). The old world
    // is the catalogue before the twelve and the three: all three switches off (catalogueOff; was withShapes(.., false), which
    // now keeps SHAPES2's 5 G commons and so measures the shipped values)
    const table = Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1));
    expect(table).toEqual([5, 20, 36, 51, 66, 81, 94, 104, 115, 125]);
    expect(Array.from({ length: RUN_DAYS }, (_, i) => maxHonestSpend(i + 1))).toEqual([13, 37, 63, 89, 116, 144, 171, 196, 223, 250]);
    catalogueOff(() => {
      expect(Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1))).toEqual([5, 20, 36, 51, 66, 80, 93, 102, 114, 123]);
      expect(Array.from({ length: RUN_DAYS }, (_, i) => maxHonestSpend(i + 1))).toEqual([13, 37, 63, 89, 116, 143, 170, 194, 222, 248]);
    });
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
    // BUMP-1D: the twelve leave it (0 0 0 0 0 1 1 2 1 2); the old world is catalogueOff (all three switches off; was withShapes(.., false))
    catalogueOff(() => expect(Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1) - roadCapHoard(i + 1))).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]));
    withNpcDay(() => withHullScale(() => {
      expect(Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1) - roadCapHoard(i + 1))).toEqual([0, 0, 0, 2, 1, 4, 4, 7, 7, 11]);
    }, false), false);
  });
});

describe("player hull and belt rules (D3)", () => {
  // NUM-1: x10 (was [0, 20, -10, 10] and % 25)
  // BUMP-1F (RULING-BUMP1F-R3.1, ENCHANT-2: ENCHANT ships on and the ASH SHRINE is a road event whose OFFER HULL card costs SHRINE_HULL, 100 max hull, as RIDE THROUGH does):
  // this is the ENCHANT-off world's model, the one sum list the file had (reachableOff, used under withEnchant(.., false)); the shipped world's is `reachable` below
  const reachableOff = (h: number, day: number) =>
    [0, DOCK, RIDE, DOCK + RIDE].some((r, i) => h - r >= 0 && (h - r) % PLATE === 0 && (i < 3 || day >= 2)); // dock + storm need 2 road stops
  // BUMP-1F: the shipped world's: every sum of the dock (+200), the storm (-100) and the shrine (-SHRINE_HULL), each with the road stops it takes (one a day):
  // the shrine alone -100 (one stop), dock + shrine 100 and storm + shrine -200 (two), all three 0 (three); measured against the validator, days 1, 2, 3 and 10
  const SUMS: [number, number][] = [[0, 0], [DOCK, 1], [RIDE, 1], [DOCK + RIDE, 2], [-SHRINE_HULL, 1], [DOCK - SHRINE_HULL, 2], [RIDE - SHRINE_HULL, 2], [DOCK + RIDE - SHRINE_HULL, 3]];
  const reachable = (h: number, day: number) => SUMS.some(([r, stops]) => h - r >= 0 && (h - r) % PLATE === 0 && stops <= day);

  it("accepts exactly the hullBonus values an honest run can reach by the day (plates, dock +200, ride-through -100; with ENCHANT the shrine's -100 too)", () => { // BUMP-1F (RULING-BUMP1F-R3.1): was without "; with ENCHANT the shrine's -100 too"
    const sweep = (reach: (h: number, day: number) => boolean) => {
      for (const day of [1, 2, 10]) {
        for (let h = -400; h <= 1600; h += 50) { // NUM-1: x10 (was -40..160 step 5)
          const e = up(deck([], 0, 0, h), day).errors; // FLIP-X2: with its day's runes
          expect(e.some((x) => x.startsWith("supply: hullBonus")), `day ${day} hull ${h}: ${e.join(" | ")}`).toBe(!reach(h, day));
        }
      }
    };
    sweep(reachable); // BUMP-1F (RULING-BUMP1F-R3.1): the shipped world, the shrine in the bag (was sweep(reachableOff), the only sweep: day 2 hull -200 was "not reachable")
    withEnchant(() => sweep(reachableOff), false); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2)): and the world the file was made in, ENCHANT off, as before
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
    // BUMP-1F (RULING-BUMP1F-R3.1, ENCHANT-2: the ASH SHRINE's OFFER HULL card is a hull choice like RIDE THROUGH): with ENCHANT on the four events with a hull or belt choice (cache, dock, storm
    // and the shrine) make 2^4 = 16 mixes (the keys in a mix list by event in the roadOptions order: cache, dock, storm, shrine); the eight of the ENCHANT-off world, which the file pinned, are
    // checked under withEnchant(.., false) beside them. Measured with the shipped switches
    expect(keys).toEqual([
      "", "cache(0,4)", "cache(0,4) dock(200,0)", "cache(0,4) dock(200,0) shrine(-100,0)", "cache(0,4) dock(200,0) storm(-100,0)", "cache(0,4) dock(200,0) storm(-100,0) shrine(-100,0)",
      "cache(0,4) shrine(-100,0)", "cache(0,4) storm(-100,0)", "cache(0,4) storm(-100,0) shrine(-100,0)", "dock(200,0)", "dock(200,0) shrine(-100,0)", "dock(200,0) storm(-100,0)",
      "dock(200,0) storm(-100,0) shrine(-100,0)", "shrine(-100,0)", "storm(-100,0)", "storm(-100,0) shrine(-100,0)",
    ]);
    withEnchant(() => expect(roadMixes().map((m) => m.key).sort()).toEqual(["", "cache(0,4)", "cache(0,4) dock(200,0)", "cache(0,4) dock(200,0) storm(-100,0)", "cache(0,4) storm(-100,0)", "dock(200,0)", "dock(200,0) storm(-100,0)", "storm(-100,0)"]), false); // BUMP-1F: the old eight
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
    // BUMP-1F (RULING-BUMP1F-R3.1, ENCHANT-2: the ASH SHRINE costs 100 max hull): with the shrine in the bag, DOCK (+200) + STORM (-100) + SHRINE (-100) is a mix whose hull is 0, a
    // plate-only deck's, so the player mode takes a plate-only deck at the best of the mixes that explain its hull, and on day 10 the forced three pay more than the unforced
    // roadCap(10): the ceiling of a plate-and-crate deck there is maxHonestSpend(10) + 3 = 253 (measured; days 1-9 are maxHonestSpend exactly). Was `top = maxHonestSpend(d)` on every day
    const check = (extra: (d: number) => number) => {
      for (let d = 1; d <= RUN_DAYS; d++) {
        const top = maxHonestSpend(d) + extra(d);
        const at = deckCosting(top), over = deckCosting(top + 1);
        expect(buildCost(at).total).toBe(top);
        expect(up(at, d), `day ${d}`).toEqual({ ok: true, errors: [] }); // FLIP-X2: with its day's runes
        expect(cats(over, d), `day ${d}`).toEqual(["budget"]);
      }
    };
    check((d) => (d === RUN_DAYS ? 3 : 0)); // the shipped world
    withEnchant(() => check(() => 0), false); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2)): ENCHANT off, the world the pin was made in: maxHonestSpend exactly, every day
  });

  // BUMP-1D (PLAIN_RIGS and SHAPES2 on: the catalogue grew by twelve pieces, RASP at 4 G): the budget line prices a piece by its
  // catalogue price alone (stars.ts valueOf: price x 2^(stars - 1), buildCost's items term), with no term for its feet, its
  // arrows or its rarity, and the shop charges that price: so no honest buyer of the twelve is over what the shop took from him
  it("the budget line counts each of the twelve new pieces at what the shop charges: price x 2^(stars - 1), whatever its feet", () => {
    const TWELVE = [...PLAIN_RIG_IDS, ...SHAPES2_IDS];
    expect(TWELVE).toHaveLength(12);
    const offered = new Map<string, Set<number>>(TWELVE.map((id): [string, Set<number>] => [id, new Set<number>()]));
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) {
      for (let seed = 1; seed <= 40; seed++) {
        for (let day = 1; day <= RUN_DAYS; day++) {
          const run = newRun(hero, seed, `price-${hero}-${seed}`);
          run.day = day;
          rollShop(run);
          for (const w of run.shop.wagons) for (const o of w.offers) offered.get(o.def)?.add(o.price);
        }
      }
    }
    const base = buildCost(deck()).items;
    for (const id of TWELVE) {
      expect([...offered.get(id)!], `${id}: every offer seen, at its catalogue price`).toEqual([ITEMS[id].price]);
      for (const stars of [1, 2, 3]) {
        const b = deck();
        b.items.push({ uid: 20, def: id, x: 3, y: 4, rot: 1, ...(stars > 1 ? { stars } : {}) });
        expect(buildCost(b).items - base, `${id} at ${stars} stars`).toBe(ITEMS[id].price * 2 ** (stars - 1));
      }
    }
  });

  it("a hull one step off the reachable set is refused on supply", () => {
    // NUM-1: x10 (were 30, 5, -20 and 10), so each is still the same step off the reachable set
    // BUMP-1F (RULING-BUMP1F-R3.1, ENCHANT-2): the shrine's -100 makes 300 (STORM + SHRINE, -200, and two plates), 50 and -200 reachable by day 10 (and 300 by day 5), so those
    // three steps are pinned in the ENCHANT-off world (withEnchant(.., false)) and the shipped world's steps follow: still off the 50 grid, or below the lowest sum (-200)
    withEnchant(() => {
      expect(cats(deck([], 0, 0, 300), 5)).toEqual(["supply"]); // 300 = 250 + 50: no mix
      expect(cats(deck([], 0, 0, 50), 10)).toEqual(["supply"]);
      expect(cats(deck([], 0, 0, 2 * RIDE), 10)).toEqual(["supply"]); // below one RIDE THROUGH (-200)
    }, false);
    expect(cats(deck([], 0, 0, 325), 5)).toEqual(["supply"]); // BUMP-1F: 325 = 250 + 75: no mix, the shrine or not (was 300)
    expect(cats(deck([], 0, 0, 25), 10)).toEqual(["supply"]); // BUMP-1F: off the 50 grid (was 50)
    expect(cats(deck([], 0, 0, 2 * RIDE - 50), 10)).toEqual(["supply"]); // BUMP-1F: below STORM + SHRINE (-200), the lowest sum (-250; was 2 * RIDE, one RIDE THROUGH's step below)
    expect(cats(deck([], 0, 0, 2 * RIDE), 10)).toEqual([]); // BUMP-1F: -200 = STORM + SHRINE, two road stops, is reachable
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

  // BUMP-1D: the long run's stand-ins. The pool holds days 1-16 (STAND_IN_POOL_DAYS; RUN-1's days past RUN_DAYS): the test above
  // reads days 1-10, this one days 11-16 (72 decks), with its two checks: every strict line but at most its one road-fed budget
  // line, and the player mode with the deck's road log accepting each (the budget line included)
  it("the long run's stand-ins, days 11-16 of the pool (72 decks), pass both modes the same way", () => {
    let n = 0;
    const carry = { turrets: 0, bought: 0, joined: 0, joins: 0, both: 0 };
    for (const hero of STAND_IN_POOL_HEROES) {
      for (let day = RUN_DAYS + 1; day <= STAND_IN_POOL_DAYS; day++) {
        for (const e of standInPool(hero, day)) {
          n++;
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
    expect(n).toBe(72);
    console.log(`BUMP-1D: the ${STAND_IN_POOL_RULES} stand-in pool, days 11-16: ${n} decks; ${carry.turrets} carry a turret list (${carry.bought} with a bought turret), ${carry.joined} a joined belt (${carry.joins} joins), ${carry.both} both`);
    expect(carry).toEqual(POOL_CARRIES_LONG);
  }, 120_000); // BUMP-1F (RULING-BUMP1F-R8 R8.1): 120 s for this test, was vitest's 30-s default: it passes alone but times out at 30 s once the host's 1-minute load passes ~15; no body, count or expectation changed

  it("the bundled ghost pool (tools/samplePool.ts): the strict loader takes every snapshot and the player mode accepts each", () => {
    const load = loadGhostPool(samplePoolJson(generateSamplePool())); // CACHE-1: was samplePoolJson() (its default argument, generateSamplePool(), run for real)
    expect(load.rejected).toEqual([]);
    expect(load.entries).toHaveLength(254); // BUMP-1I (REQ-BFG-125; P3's take E525, R3 6aff36f7: 254 ghosts = the 192 + the tier's 48 (days 5-16) + the 14 depth ghosts): was 230. BUMP-1H: was 192 (the CURVE's 24 streak and 14 depth ghosts follow the 192: 230). 0.7.0a D5: 40 sample ghosts and 20 floor ghosts; 0.8.0 RC: 60 race ghosts (was 60). BUMP-1D: was 120 (days 1-10); days 1-16: 4 heroes x 16 days x 3 variants = 192
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
  function liveKinds(ids: readonly EventId[] = EVENT_IDS): Set<string> { // ENCHANT-2 (T3): `ids`, the rules world's events (default: the ten of the ENCHANT-off world)
    const kinds = new Set<string>();
    const runs = [newRun("furnace", 7), ...buyableModules().map((d) => {
      const r = newRun("weaver", 7);
      gainModule(r, d.id);
      return r;
    })];
    for (const e of ids) {
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
    expect([...EVENT_IDS].sort()).toEqual(Object.keys(MODELLED_EVENTS).filter((e) => e !== "shrine").sort()); // ENCHANT off: the ten events the game had
    for (const k of liveKinds()) expect(MODELLED_DELTAS, `Delta kind "${k}"`).toContain(k);
    withEnchant(() => { // ENCHANT-2 (T3): ENCHANT on, the ASH SHRINE is the eleventh event and "ench" a Delta kind: both reviewed
      expect([...eventIds()].sort()).toEqual(Object.keys(MODELLED_EVENTS).sort());
      for (const k of liveKinds(eventIds())) expect(MODELLED_DELTAS, `Delta kind "${k}" (ENCHANT on)`).toContain(k);
      expect(liveKinds(eventIds()).has("ench")).toBe(true);
    });
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
// BUMP-1D: the stand-in pool regenerated for days 1-16 under bb-0.11.0 (8fc5e24: every switch on, the twelve new pieces in the
// shop; 192 decks), the test's days 1-10 (RUN_DAYS) of it measured: turrets 74, bought 38, joined 78, joins 191, both 52 (was
// turrets 72, bought 31, joined 81, joins 185, both 51); days 11-16 are the twin test's (POOL_CARRIES_LONG)
// BUMP-1E: the stand-in pool regenerated under bb-0.12.0 (R1, 19ae423: every switch on, the seven scaling rigs in the shop; 192 decks):
// the same days 1-10 now measure turrets 62, bought 29, joined 82, joins 184, both 37 (was turrets 74, bought 38, joined 78, joins 191, both 52)
// BUMP-1F (RULING-BUMP1F-R5 R5.2 (2): the regenerated pool): the stand-in pool regenerated under bb-0.13.0 (src/sim/standInPoolData.ts: 192 decks, days 1-16, GATES and ENCHANT shipped on in the shop and
// on the road): the same days 1-10 now measure turrets 92, bought 35, joined 78, joins 158, both 61 (the test's own console line, "v070-rel: the bb-0.13.0 stand-in pool: 120 decks"; was turrets 62,
// bought 29, joined 82, joins 184, both 37)
// BUMP-1G (R1: the stand-in pool regenerated under bb-0.14.0, src/sim/standInPoolData.ts: 192 decks, days 1-16, every switch on, EFFECT_FLOOR among them): the same days 1-10 now measure turrets 91, bought 27, joined 76, joins 161, both 57
// (the test's own console line, "v070-rel: the bb-0.14.0 stand-in pool: 120 decks"; was turrets 92, bought 35, joined 78, joins 158, both 61)
const POOL_CARRIES = { turrets: 91, bought: 27, joined: 76, joins: 161, both: 57 }; // BUMP-1G: was { turrets: 92, bought: 35, joined: 78, joins: 158, both: 61 } (R1: the regenerated stand-in pool, bb-0.14.0)
/** BUMP-1D: the same five counts over the pool's days 11-16 (72 decks; the long run's: new, measured once on the final pool). BUMP-1E: turrets 55, bought 26,
 *  joined 52, joins 144, both 41 on the bb-0.12.0 pool (was turrets 51, bought 28, joined 53, joins 161, both 37) */
// BUMP-1F (RULING-BUMP1F-R5 R5.2 (2): the regenerated pool): the bb-0.13.0 pool's days 11-16 measure turrets 72, bought 39, joined 44, joins 118, both 44 (the twin test's console line, "BUMP-1D: the bb-0.13.0
// stand-in pool, days 11-16: 72 decks"; was turrets 55, bought 26, joined 52, joins 144, both 41)
// BUMP-1G (R1: the stand-in pool regenerated under bb-0.14.0): the bb-0.14.0 pool's days 11-16 measure turrets 72, bought 40, joined 43, joins 120, both 43 (the twin test's console line, "BUMP-1D: the bb-0.14.0 stand-in pool, days 11-16: 72 decks"; was turrets 72, bought 39, joined 44, joins 118, both 44)
const POOL_CARRIES_LONG = { turrets: 72, bought: 40, joined: 43, joins: 120, both: 43 }; // BUMP-1G: was { turrets: 72, bought: 39, joined: 44, joins: 118, both: 44 } (R1: the regenerated stand-in pool, bb-0.14.0)
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
// BUMP-1D (run 3): the seed pool regenerated for days 1-16 (192 ghosts; R3', server/seedPoolData.ts 0546f5afe4bab423): 108 carry a turret list, 106 a joined belt (was 43, 63 of 120)
// BUMP-1G (R3: the seed pool regenerated under bb-0.14.0): server/seedPoolData.ts (192 ghosts, 402,688 B, gen:ghosts at the R2 commit d48e7efe over the regenerated stand-in pool and SOFT1_PICKS) carries a turret list on 147 and a joined belt on 100
// (the test's console line "v070-rel: the bundled ghost pool: 192 snapshots; 147 carry a turret list, 100 a joined belt"; was 145, 101)
// BUMP-1H (P6: the seed pool regenerated under bb-0.15.0, R3: server/seedPoolData.ts 230 ghosts, 499,336 B, 2f22968dd422ee44, gen:ghosts at the R2 commit 4cd2ca08): the 192 + 24 streak + 14 depth ghosts carry a turret list on 179 and a joined belt on 127
// (the test's console line "v070-rel: the bundled ghost pool: 230 snapshots; 179 carry a turret list, 127 a joined belt"; was 147, 100)
const GHOST_POOL_CARRIES = [179, 127]; // BUMP-1H: was [147, 100]. BUMP-1G: was [145, 101] (R3: the regenerated seed pool, bb-0.14.0). BUMP-1F (RULING-BUMP1F-R5 R5.2 (2): the regenerated pool): the seed pool regenerated under bb-0.13.0 (server/seedPoolData.ts: 192 ghosts, SOFT_TARGET 150) carries a turret list on 145 and a joined belt on 101 (the test's console line "v070-rel: the bundled ghost pool: 192 snapshots; 145 carry a turret list, 101 a joined belt"; was 114, 110). BUMP-1E: the seed pool regenerated under bb-0.12.0 (R3, 04fab9a: 192 ghosts) carries a turret list on 114 and a joined belt on 110 (was 108, 106). bb-0.8.6 (PACKS M4): the seed pool from the regenerated stand-in pool (was 26, 68); NUM-2: was 22, 62; NUM-3: was 22, 61; BUMP-1D: was 43, 63
