import { describe, expect, it } from "vitest";
import { choicesFor, makeEvent } from "../src/game/events";
import { newRun, rollShop, type InvItem, type Run } from "../src/game/run";
import type { ModPlacement, Placed } from "../src/sim/deck"; // 0.8.0 H1 M4
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
    expect(buyable.length).toBeGreaterThanOrEqual(29); // 27 baseline modules plus the two timing mods
    const all = ids(buyable);
    // 0.6.2s step 5 (REQ-BFG-031): merchants stock the 13 turrets, but turrets ride only in the caravan in 0.6.2: no
    // road rarity set (eventDefs.ts roadPart) and no harness draw set holds one (the harness doesn't buy turrets)
    const turrets = ids(buyable.filter((d) => d.kind === "turret"));
    expect(turrets.length).toBe(13);
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default; REQ-BFG-052): the three converters (kind "converter": FUSER, SCATTER MILL, SMELTER) are in the catalogue and in the merchants' stock, but a converter stands ON a belt tile
    // (a belt-fed processor, no gear and no rig beside the belt): no harness shop kind sells it (shopItems: gate, mod, core), and no road rarity set holds one (a GATE never drops: npcDay.ts), as with the turrets. Was
    // `const parts = all.filter((id) => !turrets.includes(id))`
    const converters = ids(buyable.filter((d) => d.kind === "converter"));
    expect(converters.length).toBe(3);
    const parts = all.filter((id) => !turrets.includes(id) && !converters.includes(id));
    for (const hero of HARNESS_HEROES) {
      const harness = ["gate", "mod", "core"].flatMap((kind) =>
        shopItems(hero, kind as "gate" | "mod" | "core")).concat(shopFactories(hero));
      expect(ids(harness), hero).toEqual(parts);
      for (const id of ["grease", "brake", "overdrive", "escapement", "longcase"]) expect(ids(harness), hero).toContain(id);
    }
    const stocked = [...new Set((Object.values(ITEMS).map((d) => d.merchant).filter(Boolean) as MerchantId[])
      .flatMap((m) => itemsSoldBy(m).filter((d) => d.kind !== "supply").map((d) => d.id)))].sort();
    expect(stocked).toEqual(all);
    expect([...new Set(RARITIES.flatMap((rarity) => UPGRADE[rarity]))].sort()).toEqual(parts);
    for (const id of ["escapement", "longcase"]) expect(DORMANT_ITEMS.has(id)).toBe(false);
    expect(ids(itemsSoldBy("gunsmith"))).toEqual(expect.arrayContaining(["escapement", "longcase"]));
    // FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER is dormant but keeps its merchant (validate.ts refuses a part no merchant
    // sells, and the captains' fixed plans and old decks hold one), so the check is that no merchant STOCKS a dormant
    // part (was `ITEMS[id].merchant` undefined, true of 0.6.1f's ESCAPEMENT and LONGCASE)
    expect([...DORMANT_ITEMS]).toEqual(["sifter"]);
    for (const id of DORMANT_ITEMS) {
      expect(all).not.toContain(id);
      expect(stocked).not.toContain(id);
      if (ITEMS[id].merchant) expect(ids(itemsSoldBy(ITEMS[id].merchant!))).not.toContain(id);
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

// 0.8.0 H1 M4 (REQ-BFG-021, acceptance 1; ref/BRIEF-v080-H1.md section 5.1): the tests above, extended to every day
// 1-10 and to more owned-module states: none; the parts above; a 1-star and a 2-star copy of one part (the familiar
// slot's 3-star chain), gear, a core and a factory; and those parts held on the deck rather than in cargo. Each with
// three recent-merchant histories. The six heroes' starting decks differ (their signatures and starting turrets,
// which the shop never counts), and every caravan, every wagon's stock and every road-event grant is the same.
describe("REQ-BFG-021 (0.8.0 H1 M4): identical offers on every day, owned-module state and merchant history", () => {
  const OWNED: { name: string; cargo: InvItem[]; deck?: { items: Placed[]; mods: ModPlacement[] } }[] = [
    { name: "nothing", cargo: [] },
    { name: "cargo", cargo: [{ uid: 200, def: "whetstone" }, { uid: 201, def: "scatter", stars: 2 }, { uid: 202, def: "press" }] },
    {
      name: "chain",
      cargo: [{ uid: 210, def: "temper" }, { uid: 211, def: "temper", stars: 2 }, { uid: 212, def: "coil" }, { uid: 213, def: "calibrate" },
        { uid: 214, def: "salvo", stars: 3 }, { uid: 215, def: "doublestamp" }],
    },
    {
      name: "deck", cargo: [{ uid: 220, def: "grease" }],
      deck: { items: [{ uid: 221, def: "longhaul", x: 9, y: 9 }, { uid: 222, def: "temper", x: 8, y: 9, stars: 2 }], mods: [{ uid: 223, def: "hopper", turret: 0 }] },
    },
  ];
  const RECENT: MerchantId[][] = [[], ["tinker", "gunsmith"], ["arcane", "scrapper", "ironmonger"]];

  /** A starting run of `hero` on `day` holding the owned state, its caravan rolled. */
  function held(hero: HeroId, seed: number, day: number, owned: (typeof OWNED)[number], recent: MerchantId[]): Run {
    const r = newRun(hero, seed, `pool-${seed}`);
    r.day = day;
    r.shop.rerolls = 0;
    r.lastMerchants = [...recent];
    r.inventory = owned.cargo.map((i) => ({ ...i }));
    if (owned.deck) {
      r.build.items.push(...owned.deck.items.map((p) => ({ ...p })));
      r.build.mods.push(...owned.deck.mods.map((m) => ({ ...m })));
    }
    rollShop(r);
    return r;
  }

  it("caravans and merchant stock: six heroes, days 1-10", () => {
    let caravans = 0;
    for (const seed of [5, 88, 4093]) for (let day = 1; day <= 10; day++) for (const owned of OWNED) for (const recent of RECENT) {
      const runs = HARNESS_HEROES.map((hero) => held(hero, seed, day, owned, recent));
      const expected = offer(runs[0]);
      expect(expected.length).toBeGreaterThan(0);
      for (const r of runs) {
        expect(offer(r), `${r.hero} seed=${seed} day=${day} owned=${owned.name} recent=${recent}`).toEqual(expected);
        for (const w of r.shop.wagons) for (const o of w.offers) expect(stock(w.merchant, day)).toContain(o.def);
      }
      caravans++;
    }
    expect(caravans).toBe(3 * 10 * OWNED.length * RECENT.length);
  });

  it("road-event part grants (wreck, trader, smuggler): six heroes, days 1-10", () => {
    for (const seed of [9, 314]) for (let day = 1; day <= 10; day++) for (const owned of OWNED) {
      const runs = HARNESS_HEROES.map((hero) => held(hero, seed, day, owned, []));
      for (const id of ["wreck", "trader", "smuggler"] as const) {
        const expected = roadGains(runs[0], id);
        for (const r of runs) expect(roadGains(r, id), `${id} ${r.hero} seed=${seed} day=${day} owned=${owned.name}`).toEqual(expected);
      }
    }
  });
});
