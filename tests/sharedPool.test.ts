import { describe, expect, it } from "vitest";
import { choicesFor, makeEvent } from "../src/game/events";
import { newRun, rollShop, type Run } from "../src/game/run";
import { UPGRADE } from "../src/game/eventDefs";
import { ITEMS, RARITIES, buyableModules, itemsSoldBy, type HeroId, type MerchantId } from "../src/sim/content";
import { HARNESS_HEROES, shopFactories, shopItems } from "../src/sim/harness/heroes";
import { DORMANT_ITEMS } from "../src/sim/races/data";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();
const offer = (r: Run) => r.shop.wagons.map((w) => [w.merchant, w.offers.map((o) => [o.def, o.price])]);
const stock = (merchant: MerchantId, day: number) => itemsSoldBy(merchant)
  .filter((d) => d.rarity !== "legendary" || day >= 4).map((d) => d.id);
const roadGains = (r: Run, id: "wreck" | "trader" | "smuggler") => {
  r.event = makeEvent(r.seed, r.day, id);
  return choicesFor(r).map((c) => c.gain.filter((g) => g.k === "item").map((g) => g.def));
};

/** Same stock state, with the signature factory left in each hero's actual starting deck. */
function runAt(hero: HeroId, seed: number, day: number, rerolls: number): Run {
  const r = newRun(hero, seed, `shared-${seed}`);
  expect(r.build.hero).toBe(hero);
  r.day = day;
  r.shop.rerolls = rerolls;
  r.shop.discount = 1;
  r.lastMerchants = ["tinker", "gunsmith"];
  r.inventory = [
    { uid: 200, def: "whetstone" },
    { uid: 201, def: "scatter", stars: 2 },
    { uid: 202, def: "press" },
  ];
  rollShop(r);
  return r;
}

describe("REQ-BFG-021: one hero-blind salvage catalogue", () => {
  it("catalogue, merchant stock, road rarity sets and harness draw sets agree", () => {
    const buyable = buyableModules();
    expect(buyable.length).toBeGreaterThanOrEqual(27); // the 0.6.1 baseline; wave 2 grows this count
    const all = ids(buyable);
    for (const hero of HARNESS_HEROES) {
      const harness = ["gate", "mod", "core"].flatMap((kind) =>
        shopItems(hero, kind as "gate" | "mod" | "core")).concat(shopFactories(hero));
      expect(ids(harness), hero).toEqual(all);
      for (const id of ["grease", "brake", "overdrive"]) expect(ids(harness), hero).toContain(id);
    }
    const stocked = [...new Set((Object.values(ITEMS).map((d) => d.merchant).filter(Boolean) as MerchantId[])
      .flatMap((m) => itemsSoldBy(m).filter((d) => d.kind !== "supply").map((d) => d.id)))].sort();
    expect(stocked).toEqual(all);
    expect([...new Set(RARITIES.flatMap((rarity) => UPGRADE[rarity]))].sort()).toEqual(all);
    for (const id of DORMANT_ITEMS) {
      expect(all).not.toContain(id);
      expect(ITEMS[id].merchant).toBeUndefined();
    }
  });

  it("six real starting heroes receive identical seeded caravan and merchant stock at each day gate", () => {
    for (const seed of [1, 17, 7919, 104729]) for (const day of [1, 2, 4, 7, 10]) for (const rerolls of [0, 2]) {
      const runs = HARNESS_HEROES.map((hero) => runAt(hero, seed, day, rerolls));
      const expected = offer(runs[0]);
      expect(expected.length).toBeGreaterThan(0);
      for (const r of runs) {
        expect(offer(r), `${r.hero} seed=${seed} day=${day} reroll=${rerolls}`).toEqual(expected);
        for (const w of r.shop.wagons) {
          expect(w.offers.length).toBeGreaterThan(0);
          for (const o of w.offers) expect(stock(w.merchant, day)).toContain(o.def);
        }
      }
    }
  });

  it("six heroes receive identical seeded wreck, trader and smuggler part grants", () => {
    for (const seed of [3, 101, 7919, 65537]) for (const day of [1, 4, 8]) {
      const runs = HARNESS_HEROES.map((hero) => runAt(hero, seed, day, 1));
      for (const id of ["wreck", "trader", "smuggler"] as const) {
        const expected = roadGains(runs[0], id);
        expect(expected.flat().length).toBeGreaterThan(0);
        for (const r of runs) expect(roadGains(r, id), `${id} ${r.hero} seed=${seed} day=${day}`).toEqual(expected);
      }
    }
  });
});
