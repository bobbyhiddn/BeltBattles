// 0.6.1d: the shop's duplicate rules (ARSENAL.md §5.2, §5.3; REQ-BFG-019). rollShop draws merchants
// by weight (a stockless merchant — scrapper, quartermaster, the arcane dealer, until a later job
// stocks them — never appears), fills regular slots fresh-first, then may splice in at most one
// "familiar" slot from owned fusible parts. See tests/fuse.test.ts for the merge core itself.
import { describe, expect, it } from "vitest";
import { newRun, rollShop, shopBadge, type Run } from "../src/game/run";
import { ITEMS, OFFERS } from "../src/sim/content";

function atDay(seed: number, day: number, hero: "furnace" | "weaver" = "furnace"): Run {
  const run = newRun(hero, seed);
  run.day = day;
  rollShop(run);
  return run;
}

describe("shop: caravan shape", () => {
  it("every caravan has 5 offers across 2-3 wagons, always a Tinker or an Alchemist, no legendary before day 4", () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const day of [1, 2, 3, 4, 5, 10]) {
        const run = atDay(seed * 13 + day, day, seed % 2 ? "weaver" : "furnace");
        const offers = run.shop.wagons.flatMap((w) => w.offers);
        expect(offers.length).toBe(OFFERS);
        expect(run.shop.wagons.length).toBeGreaterThanOrEqual(2);
        expect(run.shop.wagons.length).toBeLessThanOrEqual(3);
        const merchants = run.shop.wagons.map((w) => w.merchant);
        expect(merchants.includes("tinker") || merchants.includes("alchemist")).toBe(true);
        if (day < 4) for (const o of offers) expect(ITEMS[o.def].rarity).not.toBe("legendary");
      }
    }
  });

  it("a merchant with no stock today is never drawn (scrapper, quartermaster and the arcane dealer wait for a later job)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const day of [1, 3, 5, 9]) {
        const run = atDay(seed * 31 + day, day);
        const merchants = run.shop.wagons.map((w) => w.merchant);
        expect(merchants).not.toContain("scrapper");
        expect(merchants).not.toContain("quartermaster");
        expect(merchants).not.toContain("arcane"); // stronger than "no Arcane before day 3": not stocked at all yet
      }
    }
  });
});

describe("shop: fresh-first regular slots", () => {
  it("the one alchemist part the player doesn't own is always offered when alchemist is drawn (day 1: no familiar slot to interfere)", () => {
    let sawAlchemist = 0;
    for (let seed = 1; seed <= 250; seed++) {
      const run = newRun("furnace", seed * 97);
      run.inventory = [{ uid: 900, def: "whetstone" }, { uid: 901, def: "coil" }]; // alchemist's other two parts
      run.day = 1;
      rollShop(run);
      const alch = run.shop.wagons.find((w) => w.merchant === "alchemist");
      if (!alch) continue;
      sawAlchemist++;
      expect(alch.offers.some((o) => o.def === "temper")).toBe(true);
    }
    expect(sawAlchemist).toBeGreaterThan(50); // the test actually exercised the alchemist wagon
  });
});

describe("shop: the familiar slot", () => {
  it("day 1 (0% chance) never echoes an owned part that fresh-first would otherwise avoid", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const run = newRun("furnace", seed * 65537);
      run.inventory = [{ uid: 900, def: "grease" }]; // tinker's pool has 4+ fresh alternatives, never exhausted
      run.day = 1;
      rollShop(run);
      const hits = run.shop.wagons.flatMap((w) => w.offers).filter((o) => o.def === "grease").length;
      expect(hits).toBe(0);
    }
  });

  it("at a mid-run day the familiar rate (conditioned on the owning merchant being drawn) is in the ballpark of the day's chance, and at most one appears", () => {
    const N = 500;
    let withTinker = 0, withGrease = 0;
    for (let seed = 1; seed <= N; seed++) {
      const run = newRun("furnace", seed * 104729);
      run.inventory = [{ uid: 900, def: "grease" }]; // the only owned fusible part; tinker sells it alone
      run.day = 5; // days 4-6 band: target 50%
      rollShop(run);
      const merchants = run.shop.wagons.map((w) => w.merchant);
      if (!merchants.includes("tinker")) continue;
      withTinker++;
      const hits = run.shop.wagons.flatMap((w) => w.offers).filter((o) => o.def === "grease").length;
      expect(hits).toBeLessThanOrEqual(1); // at most one familiar slot per caravan
      if (hits === 1) withGrease++;
    }
    expect(withTinker).toBeGreaterThan(100); // enough samples to measure
    const rate = withGrease / withTinker;
    expect(rate).toBeGreaterThan(0.3); // loose band around the design's 50% (§5.2 step 3)
    expect(rate).toBeLessThan(0.7);
  });
});

describe("shop: the MERGE badge (shopBadge, live from mergePreview)", () => {
  it("is null unowned, MERGE ★2 on a 1★, MERGE ★3 on a chain, the grey wait on a 2★ only, and MAX on a 3★ only", () => {
    const run = newRun("furnace", 42);
    expect(shopBadge(run, "temper")).toBeNull();
    run.inventory = [{ uid: 900, def: "temper" }];
    expect(shopBadge(run, "temper")).toEqual({ kind: "merge", toStars: 2 });
    run.inventory = [{ uid: 900, def: "temper", stars: 2 }];
    expect(shopBadge(run, "temper")).toEqual({ kind: "wait" });
    run.inventory = [{ uid: 900, def: "temper", stars: 2 }, { uid: 901, def: "temper" }];
    expect(shopBadge(run, "temper")).toEqual({ kind: "merge", toStars: 3 });
    run.inventory = [{ uid: 900, def: "temper", stars: 3 }];
    expect(shopBadge(run, "temper")).toEqual({ kind: "max" });
  });
});

describe("shop: determinism", () => {
  it("rollShop depends only on (seed, day, rerolls)", () => {
    for (const seed of [1, 12345, 999999]) {
      for (const day of [1, 4, 8]) {
        const a = newRun("furnace", seed);
        a.day = day;
        rollShop(a);
        const b = newRun("furnace", seed);
        b.day = day;
        rollShop(b);
        expect(a.shop.wagons).toEqual(b.shop.wagons);
        a.shop.rerolls = 1;
        rollShop(a);
        b.shop.rerolls = 1;
        rollShop(b);
        expect(a.shop.wagons).toEqual(b.shop.wagons);
      }
    }
  });
});
