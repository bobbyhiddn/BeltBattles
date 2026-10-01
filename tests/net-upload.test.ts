import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { HEROES, ITEMS, OFFERS, REROLL_COST, RULES_VERSION, RUN_DAYS, buyableModules, type HeroId, type ItemDef, type Rarity } from "../src/sim/content";
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
import { newRun, storePlaced } from "../src/game/run";
import { gainModule } from "../src/game/fuse";
import {
  HULL_FLOOR, MODELLED_DELTAS, MODELLED_EVENTS, MODELLED_PICKS, MODELLED_REWARD_FIELDS, RoadModelError,
  checkRoadModel, discountGain, explainRoadCap, gmax, maxHonestSpend, resetRoadCapMemo, roadCap, roadCapFor, roadCapHoard, roadMixes, roadOptions,
  warlordPays,
} from "../src/net/roadCap";
import { buildCost, maxGoldByDay, validateBuild, validateUpload } from "../src/net/validate";
import { furnaceDeck } from "./netHelpers";

// v070-validate M3: the player mode (validateUpload) and its road ceiling (src/net/roadCap.ts).

const price = (id: string) => ITEMS[id].price;
const max = (xs: number[]) => Math.max(...xs);
const cats = (b: Build, day: number) => validateUpload(b, day).errors.map((e) => e.split(":")[0]);

/** The furnace starting deck plus `extra` rigs west of its belt (legal cells), plating and crates. */
function deck(extra: string[] = [], plates = 0, crates = 0, hullExtra = 0): Build {
  const b = furnaceDeck({ hullBonus: plates * 25 + hullExtra, beltCap: HEROES.furnace.belt + 4 * crates });
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
    expect(o.get("dock")!.find((x) => x.label === "PLATING")).toMatchObject({ pay: 2, hull: 20 });
    expect(o.get("storm")!.find((x) => x.label === "RIDE THROUGH")).toMatchObject({ gold: 5, hull: -10 });
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
    const hardDay1 = max(warlordPool("hard").flatMap((id) => [false, true].map((s) =>
      max([0, ...warlordReward(id, "hard", warlordDeck(id, 1, s), warlordDeckDay(id, 1, s)).parts.map(price)]))));
    const events = [...roadOptions().values()].flat().filter((x) => !x.hull && !x.belt).map((x) => x.parts - x.pay);
    expect(roadCap(1)).toBe(Math.max(hardDay1, ...events));
    expect(explainRoadCap(1)).toEqual([{ day: 1, pick: "hard", value: hardDay1 }]);
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
    const table = Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1));
    expect(table).toEqual([5, 17, 29, 43, 59, 74, 90, 110, 127, 149]);
    expect(Array.from({ length: RUN_DAYS }, (_, i) => maxHonestSpend(i + 1))).toEqual([13, 34, 56, 81, 109, 137, 167, 201, 232, 268]);
    for (let d = 2; d <= RUN_DAYS; d++) expect(roadCap(d)).toBeGreaterThanOrEqual(roadCap(d - 1));
  });

  it("the discount: rolls of at most OFFERS distinct defs, rerolls at REROLL_COST; exact on small purses", () => {
    expect([OFFERS, REROLL_COST]).toEqual([5, 2]);
    // cheapest roll at -1: a belt crate for 1 and four 3 g rigs for 2 each = 5 saved for 9 gold
    expect(discountGain(1, 0)).toBe(0);
    expect(discountGain(1, 1)).toBe(1);
    expect(discountGain(1, 9)).toBe(5);
    expect(discountGain(1, 17)).toBe(6); // a reroll (2) and 3 more (1 + 2 + 2) of the new roll: 5 + 3 - 2
    expect(discountGain(1, 20)).toBe(8); // two full rolls: 10 - 2
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
    expect(Array.from({ length: RUN_DAYS }, (_, i) => roadCap(i + 1) - roadCapHoard(i + 1))).toEqual([0, 0, 0, 0, 2, 3, 4, 7, 8, 9]);
  });
});

describe("player hull and belt rules (D3)", () => {
  const reachable = (h: number, day: number) =>
    [0, 20, -10, 10].some((r, i) => h - r >= 0 && (h - r) % 25 === 0 && (i < 3 || day >= 2)); // dock + storm need 2 road stops

  it("accepts exactly the hullBonus values an honest run can reach by the day (plates, dock +20, ride-through -10)", () => {
    for (const day of [1, 2, 10]) {
      for (let h = -40; h <= 160; h += 5) {
        const e = validateUpload(deck([], 0, 0, h), day).errors;
        expect(e.some((x) => x.startsWith("supply: hullBonus")), `day ${day} hull ${h}: ${e.join(" | ")}`).toBe(!reachable(h, day));
      }
    }
  });

  it("the HULL_FLOOR is events.ts's HULL TOO WEAK", () => {
    const run = newRun("furnace", 3);
    const ride = EVENTS.storm.choices(run, { day: 1, id: "storm", roll: 0, pick: 0, picked: -1 })[0];
    run.build.hullBonus = HULL_FLOOR + 10 - HEROES.furnace.hull;
    expect(blockReason(run, ride)).toBeUndefined();
    run.build.hullBonus -= 1;
    expect(blockReason(run, ride)).toBe("HULL TOO WEAK");
    for (const h of Object.values(HEROES)) expect(h.hull - 10).toBeGreaterThanOrEqual(HULL_FLOOR); // never binds today
  });

  it("costs the hull at its cheapest honest mix: the dock's plating costs 2 gold and the day's road stop", () => {
    expect(validateBuild(deck(["temper", "whetstone"], 0, 0, 20), 1).errors.join()).toMatch(/supply: hullBonus 20/); // strict
    expect(validateUpload(deck(["temper", "whetstone"], 0, 0, 20), 1)).toEqual({ ok: true, errors: [] }); // 6 + dock 2 = 8
    expect(validateUpload(deck(["temper", "quench"], 0, 0, 20), 1).errors.join()).toMatch(/^budget: build costs 7 gold .*road dock PLATING.* allows at most 6/);
    expect(validateUpload(deck(["temper", "whetstone"], 0, 0, -10), 1).ok).toBe(true); // RIDE THROUGH: its 5 g come after dusk
    expect(validateUpload(deck([], 0, 0, 10), 1).errors.join()).toMatch(/^supply: hullBonus 10 is not a hull a player can reach by day 1/);
    expect(validateUpload(deck([], 0, 0, 10), 2).ok).toBe(true); // dock + ride-through on two days
    expect(validateUpload(deck([], 1, 0, 20), 3).ok).toBe(true); // 45 = a plate + the dock
  });

  it("accepts the belt as the hero's base plus crates and the BELT SPOOL; nothing off the +4 grid", () => {
    expect(validateUpload(deck([], 0, 1), 1).ok).toBe(true);
    expect(validateUpload(furnaceDeck({ beltCap: HEROES.furnace.belt + 2 }), 5).errors.join()).toMatch(/^supply: beltCap 16 is not 14 \+ whole \+4 belt crates/);
    expect(validateUpload(furnaceDeck({ beltCap: HEROES.furnace.belt - 4 }), 5).errors.join()).toMatch(/^supply: beltCap 10/);
    // the spool is free but takes a road stop: the cheapest mix wins (here the crate). v070-rel: day 1 allows 13 (was 15)
    const b = deck(["temper", "quench", "venom"], 0, 1); // 11 + a crate (2) = 13 <= 13; as a spool, 11 > 8 + roadCapFor(1, spool) 0
    expect(validateUpload(b, 1).ok).toBe(true);
    expect(validateUpload(deck(["temper", "quench", "coil"], 0, 1), 1).errors.join()).toMatch(/^budget: build costs 14 gold .* allows at most 13 /); // 1 gold more
  });

  it("the mixes: every combination of the road's hull and belt choices, costed by the plans that take them", () => {
    const keys = roadMixes().map((m) => m.key).sort();
    expect(keys).toEqual(["", "cache(0,4)", "cache(0,4) dock(20,0)", "cache(0,4) dock(20,0) storm(-10,0)", "cache(0,4) storm(-10,0)", "dock(20,0)", "dock(20,0) storm(-10,0)", "storm(-10,0)"]);
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
      expect(validateUpload(at, d), `day ${d}`).toEqual({ ok: true, errors: [] });
      expect(cats(over, d), `day ${d}`).toEqual(["budget"]);
    }
  });

  it("a hull one step off the reachable set is refused on supply", () => {
    expect(cats(deck([], 0, 0, 30), 5)).toEqual(["supply"]); // 30 = 25 + 5: no mix
    expect(cats(deck([], 0, 0, 5), 10)).toEqual(["supply"]);
    expect(cats(deck([], 0, 0, -20), 10)).toEqual(["supply"]); // below one RIDE THROUGH
    expect(cats(deck([], 0, 0, 10), 1)).toEqual(["supply"]); // dock + storm: two road stops
  });

  it("an unfused pair is refused (item)", () => {
    const b = deck(["temper", "temper"]);
    expect(validateUpload(b, 5).errors.join()).toMatch(/^item: UNFUSED PAIR: TEMPER ★1 x2/);
  });

  it("another hero's signature factory is refused (item)", () => {
    const b = furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "loom", x: 0, y: 8 }] });
    expect(validateUpload(b, 5).errors.join()).toMatch(/item: uid 2 LOOM is another hero's signature factory/);
  });

  it("a part no merchant sells is refused (item)", () => {
    const proto: ItemDef = { id: "zz_proto", name: "PROTOTYPE", kind: "gate", rarity: "common", price: 3, size: 1, desc: [] };
    ITEMS.zz_proto = proto;
    try {
      expect(validateUpload(deck(["zz_proto"]), 5).errors.join()).toMatch(/^item: uid 10 PROTOTYPE is not sold by any merchant/);
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
          expect(validateBuild(e.build, day), `${hero} d${day}`).toEqual({ ok: true, errors: [] });
          expect(validateUpload(e.build, day), `${hero} d${day}`).toEqual({ ok: true, errors: [] });
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
    expect(STAND_IN_POOL_RULES).toBe(RULES_VERSION);
    expect(carry).toEqual(POOL_CARRIES);
  });

  it("the bundled ghost pool (tools/samplePool.ts): the strict loader takes every snapshot and the player mode accepts each", () => {
    const load = loadGhostPool(samplePoolJson());
    expect(load.rejected).toEqual([]);
    expect(load.entries).toHaveLength(60); // 0.7.0a D5: 40 sample ghosts and 20 floor ghosts
    let turrets = 0, joined = 0;
    for (const { snapshot: s } of load.entries) {
      expect(s.rules).toBe(RULES_VERSION);
      expect(validateUpload(s.build, s.day), `${s.hero} d${s.day}`).toEqual({ ok: true, errors: [] });
      turrets += (s.build.turrets ?? []).length > 0 ? 1 : 0;
      joined += s.build.routes.some((r) => r.join !== undefined) ? 1 : 0;
    }
    console.log(`v070-rel: the bundled ghost pool: ${load.entries.length} snapshots; ${turrets} carry a turret list, ${joined} a joined belt`);
    expect([turrets, joined]).toEqual(GHOST_POOL_CARRIES);
  });

  it("a harness sample (all six heroes, stars, cores and factories on): every deck strict accepts, player accepts", () => {
    let strict = 0, n = 0;
    for (const hero of HARNESS_HEROES as readonly HeroId[]) {
      for (let day = 1; day <= RUN_DAYS; day++) {
        for (let i = 0; i < 2; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("v070-superset", hero, day, i)), "on", 3, "on", "on");
          n++;
          if (!validateBuild(b, day).ok) continue;
          strict++;
          expect(validateUpload(b, day), `${hero} d${day} #${i}`).toEqual({ ok: true, errors: [] });
        }
      }
    }
    expect(strict).toBeGreaterThan(n * 0.8);
  }, 120_000);

  it("on any deck, the player mode's errors are the strict errors minus supply and budget (plus its own supply/budget)", () => {
    const decks: [Build, number][] = [
      [deck(["temper", "temper"], 2), 3], [furnaceDeck({ items: [] , routes: [] }), 2], [deck([], 0, 0, 20), 1], [deckCosting(200), 4],
    ];
    for (const [b, d] of decks) {
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
      const sig = run.build.items.find((p) => p.def === HEROES[hero].factory)!;
      expect(storePlaced(run, sig.uid)).toBe(false);
      expect(validateUpload(run.build, 1)).toEqual({ ok: true, errors: [] });
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
      const v = validateUpload(deck(), 3);
      expect(v.ok).toBe(false);
      expect(v.errors.join()).toMatch(/^budget: the player ceiling is unavailable: roadCap: a "chest" gain/);
    } finally {
      EVENTS.dice.choices = dice;
      resetRoadCapMemo();
    }
    expect(validateUpload(deck(), 3).ok).toBe(true);
  });

  it("an unreviewed road event stops the ceiling", () => {
    (EVENT_IDS as string[]).push("zz_fair");
    (EVENTS as Record<string, unknown>).zz_fair = { ...EVENTS.cache, id: "zz_fair" };
    resetRoadCapMemo();
    try {
      expect(() => checkRoadModel()).toThrow(/road event "zz_fair" is not modelled/);
      expect(validateUpload(deck(), 3).errors.join()).toMatch(/player ceiling is unavailable/);
    } finally {
      (EVENT_IDS as string[]).pop();
      delete (EVENTS as Record<string, unknown>).zz_fair;
      resetRoadCapMemo();
    }
    expect(validateUpload(deck(), 3).ok).toBe(true);
  });
});

// v070-rel M1 recheck 2 (output-v070-rel/REPORT.md §3): what the bb-0.6.2 bundled pools carry. A regenerated pool moves
// these on purpose. The stand-in pool's decks: with a turret list (the layout differs from the hero's start), with a
// bought turret, with a joined belt, the joins, and with both a turret list and a joined belt.
const POOL_CARRIES = { turrets: 46, bought: 32, joined: 82, joins: 129, both: 31 };
/** The bundled ghost pool's snapshots with a turret list and with a joined belt. */
// 0.7.0a D5: the seed pool's 40 sample ghosts carry 14 turret lists and 28 joined belts (as before); its 20 floor ghosts
// add 10 and 13 (tests/seed.records.test.ts checks the split)
const GHOST_POOL_CARRIES = [24, 41];
