import { describe, expect, it } from "vitest";
import { hashSeed, Rng } from "../src/core/rng";
import { EVENTS, EVENT_IDS, INTRO_IDS, type Choice, type Delta, type EventId } from "../src/game/eventDefs";
import { beginRoad, choicesFor, eventDue, eventFor, makeEvent, pickChoice } from "../src/game/events";
import { battleSeed, enemyBuild, finishRound, foeName, migrateRun, newRun, reroll, rollShop, type Run } from "../src/game/run";
import { warlordBuild } from "../src/sim/ai";
import { HEROES, ITEMS, RUN_LIVES } from "../src/sim/content";
import { beltUsed } from "../src/sim/deck";
import type { SideStats } from "../src/sim/battle";

const SEEDS = Array.from({ length: 300 }, (_, i) => 1 + i * 7919);
const clone = (r: Run): Run => JSON.parse(JSON.stringify(r)) as Run;
const STATS: SideStats = { damage: 0, shots: 0, firstShot: -1, idle: 0, turretTime: 0, jams: 0, burnDealt: 0, maxQueue: 0 } as unknown as SideStats;

/** A run sitting on the road before `round`'s battle with event `id`, plenty of gold and a spare part. */
function atEvent(id: EventId, round = 3, seed = 4242): Run {
  const run = newRun("furnace", seed);
  run.round = round;
  run.gold = 20;
  run.lives = 2;
  run.inventory.push({ uid: run.nextUid++, def: "whetstone" });
  run.event = makeEvent(seed, round, id);
  run.stage = "event";
  return run;
}

describe("road events: seeded selection", () => {
  it("round 1 always has a gentle intro; later rounds 3 in every 4; the pick ignores the shop and battle streams", () => {
    for (const seed of SEEDS) {
      expect(eventDue(seed, 1)).toBe(true);
      expect(INTRO_IDS).toContain(eventFor(seed, 1));
      for (let b = 0; b < 3; b++) {
        const block = [2, 3, 4, 5].map((r) => r + b * 4).filter((r) => eventDue(seed, r)).length;
        expect(block).toBe(3);
      }
      expect(eventFor(seed, 5)).toBe(eventFor(seed, 5)); // deterministic
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
      total += shown.filter((s) => s.r <= 10).length;
    }
    const perRun = total / SEEDS.length;
    expect(perRun).toBeGreaterThanOrEqual(7); // 1 + about 3/4 of rounds 2-10
    expect(perRun).toBeLessThanOrEqual(8);
  });

  it("every event shows up across seeds, and there are at least 8 of them", () => {
    expect(EVENT_IDS.length).toBeGreaterThanOrEqual(8);
    const seen = new Set<string>();
    for (const seed of SEEDS) for (let r = 1; r <= 10; r++) { const id = eventFor(seed, r); if (id) seen.add(id); }
    expect([...seen].sort()).toEqual([...EVENT_IDS].sort());
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
          const foe = run.foe && run.foe.round === run.round ? run.foe : { boost: 0, hull: 0, bounty: 0 };
          expect(foe.boost).toBe(sumOf(c.cost, "elite") + sumOf(gains, "elite"));
          expect(foe.hull).toBe(sumOf(gains, "foeHull"));
          expect(foe.bounty).toBe(sumOf(gains, "bounty"));
          const gotItems = gains.filter((d) => d.k === "item").map((d) => (d as { def: string }).def);
          const lostUids = c.cost.filter((d) => d.k === "item").map((d) => (d as { uid?: number }).uid);
          const beforeCargo = before.inventory.filter((it) => !lostUids.includes(it.uid)).map((it) => it.def);
          expect(run.inventory.map((it) => it.def)).toEqual([...beforeCargo, ...gotItems]);
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
    dock.lives = RUN_LIVES;
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

  it("an accepted challenge brings the warlord from 2 rounds ahead and pays its bounty only on a win", () => {
    const run = atEvent("herald", 2);
    expect(pickChoice(run, 0).ok).toBe(true);
    expect(enemyBuild(run)).toEqual(warlordBuild(run.enemyHero, 4));
    expect(foeName(run).startsWith("ELITE")).toBe(true);
    const win = clone(run), loss = clone(run);
    const g0 = win.gold;
    const r = finishRound(win, 0, 30, STATS, STATS);
    expect(r.bounty).toBe(8);
    expect(win.gold - g0).toBe(r.income + 8);
    expect(finishRound(loss, 1, 30, STATS, STATS).bounty).toBe(0);
    expect(win.foe).toBe(null);
    expect(enemyBuild(win)).toEqual(warlordBuild(win.enemyHero, 3));
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
      expect(beginRoad(run)).toBe(true);
      const saved = JSON.stringify(run);
      const loaded = migrateRun(JSON.parse(saved))!;
      expect(loaded.stage).toBe("event");
      expect(loaded.event).toEqual(run.event);
      expect(loaded.gold).toBe(run.gold);
      expect(beginRoad(loaded)).toBe(true); // still open, same event, same rolls
      expect(loaded.event).toEqual(run.event);
      expect(choicesFor(loaded)).toEqual(choicesFor(run));
      pickChoice(loaded, 0);
      const after = migrateRun(JSON.parse(JSON.stringify(loaded)))!;
      expect(after.event!.picked).toBe(0);
      expect(beginRoad(after)).toBe(false); // resolved: straight to the battle
      const g = after.gold;
      expect(pickChoice(after, 0).ok).toBe(false);
      expect(after.gold).toBe(g);
    }
  });

  it("an old v3 save still loads (migrated to v4 at its caravan)", () => {
    const run = newRun("weaver", 777) as unknown as Record<string, unknown>;
    const v3: Record<string, unknown> = { ...run, version: 3, shop: { wagons: (run.shop as { wagons: unknown }).wagons, rerolls: 0 } };
    for (const k of ["stage", "event", "foe", "nextShop", "events"]) delete v3[k];
    const m = migrateRun(JSON.parse(JSON.stringify(v3)))!;
    expect(m.version).toBe(4);
    expect(m.stage).toBe("caravan");
    expect(m.event).toBe(null);
    expect(m.shop.discount).toBe(0);
    expect(m.shop.free).toBe(0);
    expect(m.events).toEqual([]);
    expect(migrateRun({ version: 2, build: {}, shop: {}, inventory: [] })).toBe(null);
  });
});

describe("road events: soft-lock sweep", () => {
  it("200+ seeded runs with random choices end (won or lost) within 12 rounds; invariants hold", () => {
    let won = 0, lost = 0, picks = 0;
    for (let n = 0; n < 240; n++) {
      const seed = 101 + n * 104729;
      const rng = new Rng(hashSeed(seed, "softlock"));
      const run = newRun(n % 2 ? "weaver" : "furnace", seed);
      for (let guard = 0; guard < 20 && !run.over; guard++) {
        // caravan: sometimes buy the first affordable offer
        for (const w of run.shop.wagons) for (const o of w.offers) {
          if (!o.sold && run.gold >= o.price && rng.chance(0.5)) {
            run.gold -= o.price;
            o.sold = true;
            if (ITEMS[o.def].kind !== "supply") run.inventory.push({ uid: run.nextUid++, def: o.def });
          }
        }
        if (beginRoad(run)) {
          const cs = choicesFor(run);
          const ok = cs.map((c, i) => (c.blocked ? -1 : i)).filter((i) => i >= 0);
          expect(ok.length).toBeGreaterThan(0); // a free choice is always open
          expect(pickChoice(run, ok[rng.int(ok.length)]).ok).toBe(true);
          picks++;
        }
        expect(beginRoad(run)).toBe(false);
        expect(enemyBuild(run).routes.length).toBeGreaterThan(0);
        finishRound(run, rng.chance(0.55) ? 0 : 1, 30, STATS, STATS); // stubbed battle: seeded coin flip
        expect(run.gold).toBeGreaterThanOrEqual(0);
        expect(run.lives).toBeGreaterThanOrEqual(0);
        expect(run.lives).toBeLessThanOrEqual(RUN_LIVES);
        const uids = [...run.inventory.map((i) => i.uid), ...run.build.items.map((p) => p.uid), ...run.build.mods.map((m) => m.uid)];
        expect(new Set(uids).size).toBe(uids.length);
        expect(HEROES[run.hero].hull + run.build.hullBonus).toBeGreaterThanOrEqual(100);
        expect(beltUsed(run.build)).toBeLessThanOrEqual(run.build.beltCap);
      }
      expect(run.over).not.toBe(null);
      expect(run.history.length).toBeLessThanOrEqual(12);
      if (run.over === "won") won++;
      else lost++;
    }
    expect(won + lost).toBe(240);
    expect(picks).toBeGreaterThan(240 * 3);
    // eslint-disable-next-line no-console
    console.log(`soft-lock sweep: 240 runs, ${won} won, ${lost} lost, ${picks} event picks`);
  });

  it("an event is worth about +2 to +4 gold on average (reference pricing)", () => {
    // value of each choice in gold: shop price for items, 0.2 G per hull (plating 5G/25), 0.5 G per belt
    // (crate 2G/4), 5 G per life, 2 G per free reroll, 2.5 G per discount point, bounty x 0.5 (win odds)
    const val = (d: Delta): number => {
      switch (d.k) {
        case "gold": return d.n;
        case "item": return ITEMS[d.def].price;
        case "hull": return d.n * 0.2;
        case "belt": return d.n * 0.5;
        case "lives": return d.n * 5;
        case "reroll": return d.n * 2;
        case "discount": return d.n * 2.5;
        case "bounty": return d.n * 0.5;
        case "foeHull": return -d.n * 0.12;
        case "elite": return d.n * 1.2;
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
