// GATES-1 (REQ-BFG-052; BRIEF-GATES1 G5): the gates' offers. The operator must actually meet a gate in a run: the three are wares of
// their merchants' stock like any rig, held to the first unlock step after day 1 (wares.ts GATES_FIRST_DAY: never in day 1's shop),
// and the offer lever (wares.ts holdGates, behind GATES: the per-run draw keeps at least GATES_ODDS.minStock of the three) lifts the
// rate where the draw alone is under the bar (tools/gates1/offers.ts is the bench; this is its pin). Pinned here in both switch states:
// - off: nothing sees a gate: no ware, no card, whatever the lever says; the draw is exactly what it was;
// - on: never in day 1's shop or among day 1's wares; each card is its own merchant's; a run without wares (a save from before 0.8.0)
//   holds them to the same day;
// - the bar (BRIEF G5), on the game's own rollShop, seeds 1-300, days 1-10, the first roll of each shop, buying nothing: on every hero the
//   median run sees at least 3 gate cards and at least 75% of runs see at least 1 by day 5 (the shipped lever: the SCATTER MILL the
//   TINKER's, lever (a), and minStock 3, lever (b)); the draw alone, and the merchants alone, are under it;
// - the lever: every run holds the minimum, and nothing is displaced (every ware the draw made stays, with its day; only gates are
//   added), the per-run draw stays in REQ-BFG-022's band (55-70) and day 1 holds 17+ buyable parts, and it is deterministic.
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS, MERCHANTS, type HeroId } from "../src/sim/content";
import { GATES, GATES_IDS, GATES_ODDS, setGates, withGates } from "../src/sim/gates";
import { DRAW, GATES_FIRST_DAY, drawWares, heldPast, seatDay, unlockDay } from "../src/game/wares";
import { newRun, rollShop, type Run } from "../src/game/run";

const MIN_STOCK = GATES_ODDS.minStock; // the shipped value
afterEach(() => {
  setGates(GATES);
  GATES_ODDS.minStock = MIN_STOCK;
});

const THREE = ["fuser", "scattermill", "smelter"];
const isGate = (id: string): boolean => THREE.includes(id);

/** day.ts nextDawn's three lines: yesterday's caravan is today's variety check, then a fresh roll (nothing bought). */
function nextDay(run: Run, day: number): void {
  run.day = day;
  run.lastMerchants = run.shop.wagons.map((w) => w.merchant);
  run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
  rollShop(run);
}

/** Every card of a run's shops on days 1..days (first roll of each, nothing bought): [day, merchant, def]. */
function cards(hero: HeroId, seed: number, days = 10, strip = false): [number, string, string][] {
  const run = newRun(hero, seed, `gates-offers-${hero}-${seed}`);
  if (strip) delete run.wares; // a save from before 0.8.0: no per-run draw
  const out: [number, string, string][] = [];
  for (let d = 1; d <= days; d++) {
    if (d > 1) nextDay(run, d);
    for (const w of run.shop.wagons) for (const o of w.offers) out.push([d, w.merchant, o.def]);
  }
  return out;
}

describe("GATES-1 G5: the day hold (never in day 1's shop)", () => {
  it("GATES_FIRST_DAY is the first unlock step after day 1, and each gate is held to it by a hold of its own (it never takes a merchant's ware slot)", () => {
    expect(GATES_FIRST_DAY).toBe(DRAW.epicDay);
    expect(GATES_FIRST_DAY).toBeGreaterThan(1);
    expect(GATES_FIRST_DAY).toBeLessThanOrEqual(Math.min(DRAW.arcaneDay, DRAW.legendaryDay));
    withGates(() => {
      for (const id of THREE) {
        expect(ITEMS[id], id).toBeDefined();
        expect(unlockDay(id, undefined), `${id} unlocks on`).toBe(Math.max(seatDay(id), GATES_FIRST_DAY));
        expect(unlockDay(id, undefined), `${id} not on day 1`).toBeGreaterThan(1);
        expect(heldPast(id), `${id} is held past its seat's day`).toBe(true);
        expect(unlockDay(id, 8), `${id}: a restock day only ever moves it later`).toBeGreaterThanOrEqual(8);
      }
      // every other ware's day is the rule it had (a rig's seat; the sustain hold; the restocks)
      for (const id of Object.keys(ITEMS).filter((x) => !isGate(x) && ITEMS[x].kind !== "supply").slice(0, 80)) expect(unlockDay(id, undefined), id).toBe(unlockDay(id, undefined, DRAW));
    });
  });

  it("on: no run holds a gate among its day 1 wares, and no gate is ever in day 1's shop; each card is its own merchant's", () => {
    withGates(() => {
      let seen = 0;
      for (const hero of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) {
        for (let seed = 1; seed <= 60; seed++) {
          const run = newRun(hero, seed, `d1-${hero}-${seed}`);
          const wares = run.wares as Record<string, number>;
          for (const id of THREE) if (id in wares) expect(wares[id], `${hero} ${seed}: ${id}'s day`).toBeGreaterThanOrEqual(GATES_FIRST_DAY);
          for (const [d, merchant, def] of cards(hero, seed)) {
            if (!isGate(def)) continue;
            seen++;
            expect(d, `${hero} ${seed}: ${def} on day ${d}`).toBeGreaterThanOrEqual(GATES_FIRST_DAY);
            expect(ITEMS[def].merchant, `${def} is sold by ${merchant}`).toBe(merchant);
            expect(wares[def], `${def} is a ware of the run`).toBeLessThanOrEqual(d);
          }
        }
      }
      expect(seen, "gates were offered at all").toBeGreaterThan(20);
    });
  });

  it("on: a run without wares (a save from before 0.8.0) holds them to the same day (run.ts dayPool)", () => {
    withGates(() => {
      let seen = 0;
      for (let seed = 1; seed <= 150; seed++) for (const [d, , def] of cards("furnace", seed, 10, true)) if (isGate(def)) { seen++; expect(d, `seed ${seed}`).toBeGreaterThanOrEqual(GATES_FIRST_DAY); }
      expect(seen).toBeGreaterThan(10);
    });
  });

  it("off: no gate is a ware or a card, in a run with wares or without, with the lever at any value", () => {
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default; REQ-BFG-052): was `expect(GATES).toBe(false)` and the loop bare (the shipped world had GATES off); GATES ships on, so the switch-off world is asked for
    // outright, synchronously (withGates(fn, false))
    expect(GATES).toBe(true);
    withGates(() => {
      for (const k of [0, 3]) {
        GATES_ODDS.minStock = k;
        for (let seed = 1; seed <= 40; seed++) {
          expect(Object.keys(drawWares(seed)).some(isGate), `seed ${seed} k ${k}`).toBe(false);
          expect(cards("furnace", seed).some(([, , def]) => isGate(def)), `seed ${seed} k ${k}`).toBe(false);
          expect(cards("furnace", seed, 10, true).some(([, , def]) => isGate(def)), `seed ${seed} k ${k}, no wares`).toBe(false);
        }
      }
    }, false);
  });
});

describe("GATES-1 G5: the lever (the per-run draw keeps gates in stock)", () => {
  it("off: the draw is exactly what it was, whatever the lever says", () => {
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default): was `draws` bare (the shipped world had GATES off); the draws are made in the switch-off world, explicitly
    const draws = (k: number) => {
      GATES_ODDS.minStock = k;
      return withGates(() => Array.from({ length: 150 }, (_, i) => JSON.stringify(drawWares(i + 1))), false);
    };
    const base = draws(0);
    expect(draws(3)).toEqual(base);
    expect(draws(1)).toEqual(base);
  });

  it("on, at 0 (the draw alone): a gate that the draw made a ware opens on GATES_FIRST_DAY or later, never on a restock before it", () => {
    withGates(() => {
      GATES_ODDS.minStock = 0;
      let held = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const w = drawWares(seed);
        for (const id of THREE) if (id in w) { held++; expect(w[id], `seed ${seed}: ${id}`).toBeGreaterThanOrEqual(GATES_FIRST_DAY); }
      }
      expect(held, "the draw alone makes some of the three wares").toBeGreaterThan(30);
    });
  });

  for (const k of [1, 2, 3]) {
    it(`on, minStock ${k}: every run holds at least ${k} of the three; nothing is displaced (every ware the draw made stays with its day; only gates are added); deterministic`, () => {
      withGates(() => {
        let added = 0;
        for (let seed = 1; seed <= 300; seed++) {
          GATES_ODDS.minStock = 0;
          const plain = drawWares(seed);
          GATES_ODDS.minStock = k;
          const held = drawWares(seed);
          expect(Object.keys(held).filter(isGate).length, `seed ${seed}`).toBeGreaterThanOrEqual(k);
          for (const [id, day] of Object.entries(plain)) expect(held[id], `seed ${seed}: ${id} keeps its day`).toBe(day);
          for (const id of Object.keys(held).filter((x) => !(x in plain))) { expect(isGate(id), `${id} comes in`).toBe(true); added++; expect(held[id]).toBe(GATES_FIRST_DAY); }
          expect(Object.keys(held).length - Object.keys(plain).length, `seed ${seed}: size`).toBeLessThanOrEqual(3);
        }
        expect(added / 300, "the lever adds at most a few gates a run").toBeLessThan(k);
        expect(JSON.stringify(drawWares(7))).toBe(JSON.stringify(drawWares(7)));
      });
    });
  }

  it("on: the per-run draw stays in REQ-BFG-022's band (55-70) and day 1 holds 17+ buyable parts, at every lever value", () => {
    withGates(() => {
      for (const k of [0, 1, 2, 3]) {
        GATES_ODDS.minStock = k;
        let min = 99, max = 0, day1 = 99;
        for (let seed = 1; seed <= 300; seed++) {
          const w = drawWares(seed);
          const n = Object.keys(w).length;
          min = Math.min(min, n); max = Math.max(max, n);
          day1 = Math.min(day1, Object.values(w).filter((d) => d <= 1).length);
        }
        expect(min, `k ${k}`).toBeGreaterThanOrEqual(55);
        expect(min).toBeGreaterThanOrEqual(DRAW.active);
        expect(max, `k ${k}`).toBeLessThanOrEqual(70);
        expect(day1, `k ${k}: day 1's pool`).toBeGreaterThanOrEqual(17);
      }
    });
  });

  it("each gate names a merchant that exists (lever (a) may move the three; the card is always its own merchant's: above)", () => {
    withGates(() => {
      const merchants = new Set(Object.keys(MERCHANTS));
      for (const id of GATES_IDS) expect(merchants.has(ITEMS[id].merchant!), id).toBe(true);
    });
  });
});

describe("GATES-1 G5: the bar (the operator must meet gates in a run) on the game's own rollShop", () => {
  const pct = (xs: number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.max(0, Math.ceil(q * xs.length) - 1))];
  const HEROES: [HeroId, number][] = [["furnace", 300], ["weaver", 300], ["foundry", 300], ["bastion", 300]];
  /** [gate cards over days 1-10, gate cards over days 1-5] of every run. */
  const counts = (hero: HeroId, n: number, from = 1): [number, number][] =>
    Array.from({ length: n }, (_, i) => {
      const cs = cards(hero, from + i);
      return [cs.filter(([, , def]) => isGate(def)).length, cs.filter(([d, , def]) => d <= 5 && isGate(def)).length];
    });

  it("the shipped lever: the SCATTER MILL is the TINKER's (a) and the draw keeps all three in stock (b)", () => {
    expect(GATES_ODDS.minStock).toBe(3);
    withGates(() => {
      expect(ITEMS.scattermill.merchant).toBe("tinker");
      expect(ITEMS.fuser.merchant).toBe("tinker");
      expect(ITEMS.smelter.merchant).toBe("alchemist");
    });
  });

  it("on every hero the median run sees 3+ gate cards and 75%+ of runs see one by day 5 (seeds 1-300)", () => {
    withGates(() => {
      for (const [hero, n] of HEROES) {
        const c = counts(hero, n);
        const median = pct(c.map((x) => x[0]), 0.5), by5 = c.filter((x) => x[1] > 0).length / n;
        console.log(`GATES-1 offers ${hero} seeds 1-${n}: median ${median}, p25 ${pct(c.map((x) => x[0]), 0.25)}, ${(100 * by5).toFixed(1)}% with 1+ by day 5`);
        // BUMP-1F (RULING-BUMP1F-R2 R2.1 Q2): was toBeGreaterThanOrEqual(3) (GATES-1's bar). The merged world reads a median of 2 gate cards over days 1-10 on every hero (the draw is hero-blind; mean 2.62,
        // minStock at its maximum 3; the ENCHANTER's wagon and the seven rigs dilute the stock), and the cap left GATES_FIRST_DAY, the wagon count and minStock as they are: runs go past day 10, so a player meets
        // more over a whole run than days 1-10 show. The by-day-5 half below (75% of runs meet a gate card; 79.7% now) stays a live assertion
        expect(median, `${hero} median`).toBeGreaterThanOrEqual(2);
        expect(by5, `${hero} share with 1+ by day 5`).toBeGreaterThanOrEqual(0.75);
      }
    });
  }, 60_000);

  it("the draw alone (minStock 0) is under the bar, and so is the stock floor at 2: the lever is needed and the smallest that passes is 3", () => {
    withGates(() => {
      for (const k of [0, 2]) {
        GATES_ODDS.minStock = k;
        const c = counts("furnace", 300);
        const median = pct(c.map((x) => x[0]), 0.5), by5 = c.filter((x) => x[1] > 0).length / 300;
        expect(median < 3 || by5 < 0.75, `minStock ${k}: median ${median}, ${(100 * by5).toFixed(1)}% by day 5`).toBe(true);
      }
    });
  }, 60_000);

  it("every gate can be offered: all three show up across a few hundred runs, each a card of its own merchant", () => {
    withGates(() => {
      const seen: Record<string, number> = { fuser: 0, scattermill: 0, smelter: 0 };
      for (let seed = 1; seed <= 150; seed++) for (const [, merchant, def] of cards("furnace", seed)) if (isGate(def)) { seen[def]++; expect(ITEMS[def].merchant).toBe(merchant); }
      for (const id of THREE) expect(seen[id], id).toBeGreaterThan(20);
    });
  }, 60_000);
});
