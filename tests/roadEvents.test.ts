import { describe, expect, it } from "vitest";
import { hashSeed, Rng } from "../src/core/rng";
import { BAG_IDS, EVENTS, EVENT_IDS, WARLORD_EVENT_IDS, type Choice, type Delta, type EventId } from "../src/game/eventDefs";
import { beginRoad, choicesFor, eventFor, makeEvent, pickChoice } from "../src/game/events";
import { gainModule } from "../src/game/fuse";
import { battleSeed, migrateRun, newRun, reroll, rollShop, type Run } from "../src/game/run";
import { chooseFoe, finishDay, startDusk } from "../src/game/day";
import { finishWarlord, leaveCaravan, onToTheRoad, pickRoad } from "../src/game/road"; // AZ-BUMP (the flip): the NPC day's fight
import { ITEMS, START_LIVES } from "../src/sim/content";
import type { SideStats } from "../src/sim/battle";

const SEEDS = Array.from({ length: 300 }, (_, i) => 1 + i * 7919);
const clone = (r: Run): Run => JSON.parse(JSON.stringify(r)) as Run;
const STATS: SideStats = { damage: 0, shots: 0, firstShot: -1, idle: 0, turretTime: 0, jams: 0, burnDealt: 0, maxQueue: 0 } as unknown as SideStats;
const finishRound = finishDay; // 0.6.0: a round is a day

/** A run sitting on the road before `day`'s dusk with event `id`, plenty of gold and a spare part. */
function atEvent(id: EventId, round = 3, seed = 4242): Run {
  const run = newRun("furnace", seed);
  run.day = round;
  run.gold = 20;
  run.lives = 2;
  run.inventory.push({ uid: run.nextUid++, def: "whetstone" });
  run.event = makeEvent(seed, round, id);
  run.stage = "event";
  return run;
}

describe("road events: seeded selection", () => {
  // 0.6.0b: every day has a fork and its event slot always holds a real event from the bag, so the
  // day-1 intro set (INTRO_IDS) and the 3-in-4 quiet-road skip (eventDue) are gone on purpose.
  it("0.6.0b: every day 1-10 has a bag event, fixed by the seed; day 1 is no special intro; the pick ignores the shop", () => {
    const dayOne = new Set<EventId>();
    for (const seed of SEEDS) {
      for (let d = 1; d <= 10; d++) {
        const id = eventFor(seed, d);
        expect(BAG_IDS).toContain(id);
        expect(eventFor(seed, d)).toBe(id); // deterministic
      }
      dayOne.add(eventFor(seed, 1));
    }
    expect(dayOne.size).toBeGreaterThan(2); // day 1 draws from the whole bag
    for (const seed of SEEDS.slice(0, 20)) {
      const a = newRun("furnace", seed);
      const b = newRun("furnace", seed);
      b.gold = 99;
      reroll(b);
      reroll(b);
      beginRoad(a);
      beginRoad(b);
      expect(b.event).toEqual(a.event); // same event and rolls, whatever the caravan did
    }
  });

  it("never the same event twice in a row, and 10 rounds show at least 5 different events", () => {
    let total = 0;
    for (const seed of SEEDS) {
      const shown = [];
      for (let r = 1; r <= 12; r++) {
        const id = eventFor(seed, r);
        if (id) shown.push({ r, id });
      }
      for (let i = 1; i < shown.length; i++) expect(shown[i].id).not.toBe(shown[i - 1].id);
      const ten = new Set(shown.filter((s) => s.r <= 10).map((s) => s.id));
      expect(ten.size).toBeGreaterThanOrEqual(5);
      expect(shown.filter((s) => s.r <= 10).length).toBe(10);
      total += shown.filter((s) => s.r <= 10).length;
    }
    // 0.6.0b: no quiet roads any more, every day 1-10 has its event (was 7-8 per run)
    const perRun = total / SEEDS.length;
    expect(perRun).toBe(10);
  });

  // 0.6.0b (B3): herald (ELITE BOUNTY) and sappers (SABOTAGE) act on warlords now, so they are back in the bag
  it("every bag event shows up across seeds (all 10 of them, herald and sappers back in the bag)", () => {
    expect(BAG_IDS.length).toBe(10);
    expect(WARLORD_EVENT_IDS).toEqual(["herald", "sappers"]);
    expect(BAG_IDS).toEqual(expect.arrayContaining(["herald", "sappers"]));
    const seen = new Set<string>();
    for (const seed of SEEDS) for (let r = 1; r <= 10; r++) { const id = eventFor(seed, r); if (id) seen.add(id); }
    expect([...seen].sort()).toEqual([...BAG_IDS].sort());
  });

  it("shop rolls and battle seeds are unchanged by events", () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const a = newRun("weaver", seed);
      const b = newRun("weaver", seed);
      beginRoad(b);
      if (b.event) pickChoice(b, choicesFor(b).length - 1);
      expect(b.shop.wagons).toEqual(a.shop.wagons);
      expect(battleSeed(b)).toBe(hashSeed(seed, "battle", 1));
      // next round's caravan is the same with or without the event (no scout deal taken)
      b.nextShop = { discount: 0, free: 0 };
      finishRound(a, 0, 30, STATS, STATS);
      finishRound(b, 0, 30, STATS, STATS);
      expect(b.shop.wagons).toEqual(a.shop.wagons);
      rollShop(a);
      expect(a.shop.wagons).toEqual(b.shop.wagons);
    }
  });
});

function goldOf(ds: Delta[]): number { return ds.reduce((n, d) => n + (d.k === "gold" ? d.n : 0), 0); }
function sumOf(ds: Delta[], k: Delta["k"]): number { return ds.reduce((n, d) => n + (d.k === k && "n" in d ? d.n : 0), 0); }

describe("road events: every choice applies exactly what it shows", () => {
  for (const id of EVENT_IDS) {
    it(`${id}: costs and gains land exactly; blocked choices are refused`, () => {
      const base = atEvent(id);
      const choices = choicesFor(base);
      expect(choices.length).toBeGreaterThanOrEqual(2);
      expect(choices.length).toBeLessThanOrEqual(3);
      expect(choices.some((c) => !c.cost.length)).toBe(true); // always a free choice
      choices.forEach((c: Choice, i) => {
        for (const roll of c.odds === undefined ? [0.5] : [0, 0.999]) {
          const run = clone(base);
          run.event!.roll = roll;
          const before = clone(run);
          const res = pickChoice(run, i);
          if (c.blocked) {
            expect(res.ok).toBe(false);
            expect(run).toEqual(before);
            continue;
          }
          expect(res.ok).toBe(true);
          const won = c.odds === undefined || roll < c.odds;
          expect(res.won).toBe(won);
          const gains = won ? c.gain : [];
          expect(run.gold - before.gold).toBe(goldOf(gains) - goldOf(c.cost));
          expect(run.lives - before.lives).toBe(sumOf(gains, "lives") - sumOf(c.cost, "lives"));
          expect(run.build.hullBonus - before.build.hullBonus).toBe(sumOf(gains, "hull") - sumOf(c.cost, "hull"));
          expect(run.build.beltCap - before.build.beltCap).toBe(sumOf(gains, "belt") - sumOf(c.cost, "belt"));
          expect(run.nextShop.discount - before.nextShop.discount).toBe(sumOf(gains, "discount"));
          expect(run.nextShop.free - before.nextShop.free).toBe(sumOf(gains, "reroll"));
          // 0.6.0b (B3): the warlord effects are pending run state (ELITE BOUNTY, SABOTAGE) and SCOUT's
          // SPY stores tonight's dusk foe; nothing else is touched
          expect(run.bounty?.pay ?? 0).toBe(sumOf(gains, "bounty"));
          expect(!!run.sabotage).toBe(gains.some((d) => d.k === "sabotage"));
          expect(!!run.dusk).toBe(gains.some((d) => d.k === "reveal"));
          const gotItems = gains.filter((d) => d.k === "item").map((d) => (d as { def: string }).def);
          const lostUids = c.cost.filter((d) => d.k === "item").map((d) => (d as { uid?: number }).uid);
          // 0.6.1a: a gained item enters through gainModule, so a twin of a cargo part merges (1+1 = 2 stars)
          const want = clone(before);
          want.inventory = want.inventory.filter((it) => !lostUids.includes(it.uid));
          want.build.items = want.build.items.filter((p) => !lostUids.includes(p.uid));
          want.build.mods = want.build.mods.filter((m) => !lostUids.includes(m.uid));
          for (const def of gotItems) gainModule(want, def);
          expect(run.inventory.map((it) => [it.def, it.stars ?? 1])).toEqual(want.inventory.map((it) => [it.def, it.stars ?? 1]));
          expect(run.event!.picked).toBe(i);
          // a resolved event can't be picked twice
          const again = clone(run);
          expect(pickChoice(run, i).ok).toBe(false);
          expect(run).toEqual(again);
        }
      });
    });
  }

  it("unaffordable choices show a reason and are refused", () => {
    const run = atEvent("dice");
    run.gold = 4;
    const cs = choicesFor(run);
    expect(cs[1].blocked).toBe("NEED 2 MORE GOLD");
    expect(pickChoice(run, 1).ok).toBe(false);
    expect(run.gold).toBe(4);
    const dock = atEvent("dock");
    dock.lives = START_LIVES; // PATCH UP heals up to START_LIVES (5)
    expect(choicesFor({ ...dock, lives: START_LIVES - 1 })[1].blocked).toBe(undefined);
    expect(choicesFor(dock)[1].blocked).toBe("LIVES FULL");
    const trader = atEvent("trader");
    trader.inventory = [];
    trader.build.mods = [];
    expect(choicesFor(trader)[0].blocked).toBe("NOTHING TO TRADE");
    expect(pickChoice(trader, 0).ok).toBe(false);
  });

  it("with empty cargo the trader takes your cheapest deck gate: it leaves the deck, the gold arrives", () => {
    const run = atEvent("trader");
    run.inventory = [];
    run.build.items.push({ uid: 555, def: "temper", x: 4, y: 3 });
    const c = choicesFor(run)[0];
    expect(c.note).toBe("FROM YOUR DECK");
    const g = run.gold;
    expect(pickChoice(run, 0).ok).toBe(true);
    expect(run.build.items.some((p) => p.uid === 555)).toBe(false);
    expect(run.gold).toBe(g + ITEMS.temper.price);
  });

  // 0.6.0b (B3): the herald is the ELITE BOUNTY (stake 3, +10 on the next Hard warlord win): it is
  // pending run state, and the dusk ghost is unchanged and pays no bounty (tests/retarget.test.ts
  // covers the warlord side)
  it("0.6.0b: a staked ELITE BOUNTY is pending for the next Hard warlord; the dusk ghost is unchanged and pays no bounty", () => {
    const run = atEvent("herald", 2);
    const plain = clone(run);
    expect(pickChoice(run, 0).ok).toBe(true);
    expect(run.bounty).toEqual({ day: 2, stake: 3, pay: 10 });
    expect(run.gold).toBe(plain.gold - 3);
    expect(chooseFoe(run, [])).toEqual(chooseFoe(plain, []));
    startDusk(run, []);
    const g0 = run.gold;
    const r = finishRound(run, 0, 30, STATS, STATS);
    expect(run.gold - g0).toBe(r.income);
    expect(run.bounty).toEqual({ day: 2, stake: 3, pay: 10 }); // still waiting for a Hard warlord
  });

  it("scout deals reach the next caravan: prices -1 (same items) and a free reroll", () => {
    const run = atEvent("scout", 2, 99);
    pickChoice(run, 0);
    const plain = clone(run);
    plain.nextShop = { discount: 0, free: 0 };
    finishRound(run, 0, 30, STATS, STATS);
    finishRound(plain, 0, 30, STATS, STATS);
    const a = run.shop.wagons.flatMap((w) => w.offers), b = plain.shop.wagons.flatMap((w) => w.offers);
    expect(a.map((o) => o.def)).toEqual(b.map((o) => o.def));
    a.forEach((o, i) => expect(o.price).toBe(Math.max(1, b[i].price - 1)));
    const s2 = atEvent("scout", 2, 99);
    pickChoice(s2, 1);
    finishRound(s2, 0, 30, STATS, STATS);
    const gold = s2.gold;
    expect(reroll(s2)).toBe(true);
    expect(s2.gold).toBe(gold);
    expect(reroll(s2)).toBe(true);
    expect(s2.gold).toBe(gold - 2);
  });
});

describe("road events: save and load", () => {
  it("quitting mid-event and reloading shows the same event with no free reward and no re-roll", () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const run = newRun("furnace", seed);
      // AZ-BUMP (the flip, NPC_DAY): the shipped day's event follows the warlord fight (pickRoad(run, "event") is refused), so
      // the run fights first (the fork's Easy warlord, won, as main.ts openNpcDay plays it) and ON TO THE ROAD opens the
      // event; the reload below is mid-event as before (beginRoad reopens the day's event after the fight)
      leaveCaravan(run);
      expect(pickRoad(run, "easy").ok).toBe(true);
      finishWarlord(run, 0, 20);
      expect(onToTheRoad(run)).toBe("event");
      const saved = JSON.stringify(run);
      const loaded = migrateRun(JSON.parse(saved))!;
      expect(loaded.stage).toBe("event");
      expect(loaded.event).toEqual(run.event);
      expect(loaded.gold).toBe(run.gold);
      expect(beginRoad(loaded)).toBe(true); // still open, same event, same rolls
      expect(loaded.event).toEqual(run.event);
      expect(choicesFor(loaded)).toEqual(choicesFor(run));
      // 0.6.0b: day 1 is no longer a gentle intro, so choice 0 can be blocked on a fresh run (the
      // trader's SELL: NOTHING TO TRADE); take the first open choice instead.
      const open = choicesFor(loaded).findIndex((c) => !c.blocked);
      expect(pickChoice(loaded, open).ok).toBe(true);
      const after = migrateRun(JSON.parse(JSON.stringify(loaded)))!;
      expect(after.event!.picked).toBe(open);
      expect(beginRoad(after)).toBe(false); // resolved: on to REFIT, then the battle (AZ-BUMP: NPC_DAY's REFIT before dusk)
      const g = after.gold;
      expect(pickChoice(after, 0).ok).toBe(false);
      expect(after.gold).toBe(g);
    }
  });

  // 0.6.0: the v3 migration test and the 12-round soft-lock sweep moved to tests/run10.test.ts
  // (v3 -> v4 -> v5) and tests/ghosts.test.ts (300 ten-day runs against a filling ghost pool).
});

describe("road events: value", () => {
  it("an event is worth about +2 to +4 gold on average (reference pricing)", () => {
    // value of each choice in gold: shop price for items, 0.02 G per hull (plating 5G/250; NUM-1: hull x10, was
    // 0.2 G per hull, 5G/25: the rate is now read from ITEMS.plating, so every choice keeps its gold value), 0.5 G per belt
    // (crate 2G/4), 5 G per life, 2 G per free reroll, 2.5 G per discount point, bounty x 0.5 (win odds)
    const val = (d: Delta): number => {
      switch (d.k) {
        case "gold": return d.n;
        case "item": return ITEMS[d.def].price;
        case "hull": return (d.n * ITEMS.plating.price) / ITEMS.plating.supply!.hull!; // NUM-1: 5 G per 250 hull (was d.n x 0.2)
        case "belt": return d.n * 0.5;
        case "lives": return d.n * 5;
        case "reroll": return d.n * 2;
        case "discount": return d.n * 2.5;
        case "bounty": return d.n * 0.5; // 0.6.0b: +n on the next Hard warlord win
        case "sabotage": return 3; // 0.6.0b: a weaker next warlord (about a plate's worth)
        case "reveal": return 1; // 0.6.0b: tonight's dusk deck shown
        default: return 0;
      }
    };
    let sum = 0;
    for (const id of EVENT_IDS) {
      const run = atEvent(id);
      const best = Math.max(...choicesFor(run).map((c) => (c.odds ?? 1) * c.gain.reduce((s, d) => s + val(d), 0) - c.cost.reduce((s, d) => s + val(d), 0)));
      expect(best).toBeLessThanOrEqual(6); // nothing wins the run by itself
      sum += best;
    }
    const mean = sum / EVENT_IDS.length;
    // eslint-disable-next-line no-console
    console.log(`mean best-choice value per event: ${mean.toFixed(2)} gold`);
    expect(mean).toBeGreaterThanOrEqual(2);
    expect(mean).toBeLessThanOrEqual(4);
  });
});

export { EVENTS };
