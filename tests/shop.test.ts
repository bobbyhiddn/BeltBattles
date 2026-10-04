// 0.6.1d: the shop's duplicate rules (ARSENAL.md §5.2, §5.3; REQ-BFG-019). rollShop draws merchants
// by weight (a stockless merchant — scrapper and the arcane dealer, until a later job stocks them —
// never appears; 0.6.1p's HOPPER is the quartermaster's first stock), fills regular slots fresh-first, then may splice in at most one
// "familiar" slot from owned fusible parts. See tests/fuse.test.ts for the merge core itself.
import { describe, expect, it } from "vitest";
import { buyOffer, migrateRun, newRun, rollShop, RUN_VERSION, shopBadge, type Run } from "../src/game/run";
import { mergePreview } from "../src/game/fuse";
import { ITEMS, OFFERS, itemsSoldBy, type ItemDef, type MerchantId } from "../src/sim/content";

/**
 * 0.8.0 I1 M3 (oracle 47ddf8622ecd67d9): an old save, a run with no wares, which plays today's rule (run.ts stockOf):
 * the game's newRun without its wares, the day-1 caravan rolled exactly as newRun rolled it before the per-run draw
 * (rollShop's stream is the seed, the day and the rerolls). Only the tests marked "(old save)" use it: they pin today's
 * rule over the whole catalogue, which a run in progress at the upgrade keeps; every other test plays the live draw.
 */
function oldSaveRun(hero: Parameters<typeof newRun>[0], seed: number, runId?: string): Run {
  const run = newRun(hero, seed, runId);
  delete run.wares;
  run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
  rollShop(run);
  return run;
}

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

  // 0.6.1p: HOPPER is the Quartermaster's first stock, so the Quartermaster now rides. 0.6.1c: he sells HOPPER and
  // HOT SWAP, and M0's one-copy wagons show each at most once (his wagon holds at most 2 offers)
  it("newly stocked merchants ride only when their stock is available", () => {
    const qmStock = itemsSoldBy("quartermaster").map((d) => d.id);
    expect(qmStock).toContain("hotswap");
    expect(qmStock).toContain("hopper");
    expect(qmStock).toContain("barbed");
    expect(itemsSoldBy("scrapper").length).toBeGreaterThan(0);
    expect(itemsSoldBy("arcane").length).toBeGreaterThan(0);
    let quartermaster = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      for (const day of [1, 3, 5, 9]) {
        const run = atDay(seed * 31 + day, day);
        const merchants = run.shop.wagons.map((w) => w.merchant);
        if (day === 1) expect(merchants).not.toContain("arcane");
        const qm = run.shop.wagons.find((w) => w.merchant === "quartermaster");
        if (!qm) continue;
        quartermaster++;
        const defs = qm.offers.map((o) => o.def);
        expect(defs.length).toBeLessThanOrEqual(3);
        expect(new Set(defs).size).toBe(defs.length);
        for (const d of defs) { expect(qmStock).toContain(d); seen.add(d); }
      }
    }
    expect(quartermaster).toBeGreaterThan(0);
    expect(seen).toContain("hotswap");
    expect(seen).toContain("hopper");
  });
});

describe("shop: fresh-first regular slots", () => {
  it("the one alchemist part the player doesn't own is always offered when alchemist is drawn (day 1: no familiar slot to interfere) (old save)", () => {
    let sawAlchemist = 0;
    for (let seed = 1; seed <= 250; seed++) {
      const run = oldSaveRun("furnace", seed * 97); // 0.8.0 I1 M3 (oracle 47ddf8622ecd67d9): today's rule
      // alchemist's other parts, incl. 0.6.1b's drake core -- own all but temper so it's still the one unowned part
      run.inventory = itemsSoldBy("alchemist").filter((d) => d.id !== "temper")
        .map((d, i) => ({ uid: 900 + i, def: d.id }));
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

// 0.6.1r (review-061 F3, N1): the familiar slot follows the regular slots' rules too
describe("shop: the familiar slot keeps one def per wagon (F3) and the legendary day gate (N1)", () => {
  it("F-dup: owning every alchemist part at 1★ on day 7, no alchemist wagon offers one part twice (400 seeds)", () => {
    let alchemist = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const run = newRun("furnace", seed * 7919);
      // its regular slots fall back to owned parts (§5.2 step 2), where the familiar pick can land
      run.inventory = ["temper", "whetstone", "coil", "drake"].map((def, i) => ({ uid: 900 + i, def }));
      run.day = 7; // familiar chance 60%
      rollShop(run);
      const alch = run.shop.wagons.find((w) => w.merchant === "alchemist");
      if (!alch) continue;
      alchemist++;
      const defs = alch.offers.map((o) => o.def);
      expect(new Set(defs).size).toBe(defs.length);
    }
    expect(alchemist).toBeGreaterThan(50);
  });

  // 0.6.1c M0 (the Prime's call) replaces 0.6.1r's "a wagon repeats a part only when its merchant stocks fewer
  // parts today than the wagon has slots": no wagon ever repeats a def. A slot whose wagon has run dry goes to
  // the next wagon round, so the caravan keeps its 5 offers, and no wagon outgrows its merchant's day pool.
  it("M0: no wagon repeats a def, and every caravan has 5 offers across 2-3 wagons (days 1-10, rerolls 0-1, owned none / half / every buyable part)", () => {
    const merchants: MerchantId[] = ["ironmonger", "tinker", "alchemist", "gunsmith", "scrapper", "quartermaster", "arcane"];
    const buyable = merchants.flatMap((m) => itemsSoldBy(m)).filter((d) => d.kind !== "supply").map((d) => d.id);
    expect(buyable).toContain("overdrive"); // "every" owns the legendary too
    const sets: Record<string, string[]> = { none: [], half: buyable.filter((_, i) => i % 2 === 0), every: buyable };
    let qmWagons = 0;
    for (const owned of Object.values(sets)) {
      for (let seed = 1; seed <= 40; seed++) {
        for (let day = 1; day <= 10; day++) {
          for (const rerolls of [0, 1]) {
            const run = newRun(seed % 2 ? "weaver" : "furnace", seed * 7919 + 13);
            run.inventory = owned.map((def, i) => ({ uid: 900 + i, def }));
            run.day = day;
            run.shop.rerolls = rerolls;
            rollShop(run);
            expect(run.shop.wagons.flatMap((w) => w.offers).length).toBe(OFFERS);
            expect(run.shop.wagons.length).toBeGreaterThanOrEqual(2);
            expect(run.shop.wagons.length).toBeLessThanOrEqual(3);
            for (const w of run.shop.wagons) {
              const defs = w.offers.map((o) => o.def);
              expect(new Set(defs).size).toBe(defs.length);
              const stock = itemsSoldBy(w.merchant).filter((d) => d.rarity !== "legendary" || day >= 4).length;
              expect(w.offers.length).toBeLessThanOrEqual(stock);
              if (w.merchant === "quartermaster") qmWagons++;
            }
          }
        }
      }
    }
    expect(qmWagons).toBeGreaterThan(100); // the one-part Quartermaster wagon was exercised
  });

  it("F-latent: an owned legendary is never offered before day 4, not even by the familiar slot (400 seeds)", () => {
    let legendary = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const run = newRun("furnace", seed * 104729);
      run.inventory = [{ uid: 900, def: "overdrive" }];
      run.day = 3;
      rollShop(run);
      legendary += run.shop.wagons.flatMap((w) => w.offers).filter((o) => ITEMS[o.def].rarity === "legendary").length;
    }
    expect(legendary).toBe(0);
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

// 0.6.1r (review-061 F8): the rest of §5.2, folded from the review's repro files and extended. Fixed seeds only.
// Every statistical band is 4 standard errors of its own sample, so a fixed-seed run can't flake near a
// threshold, and no expectation is computed the way rollShop computes it: the tests compare merchants of equal
// or ordered weight, runs whose draws must be identical, or rates against the design's own numbers.
const ALL: MerchantId[] = ["ironmonger", "tinker", "alchemist", "gunsmith", "scrapper", "quartermaster", "arcane"];
type Own = [string, number?][]; // [def, stars] copies in cargo

/** 0.8.0 I1 M3 (oracle 47ddf8622ecd67d9): `old` rolls an old save's run (oldSaveRun: today's rule), for the "(old save)" tests. */
function rolled(seed: number, day: number, own: Own = [], last?: MerchantId[], old = false): Run {
  const run = (old ? oldSaveRun : newRun)(seed % 2 ? "weaver" : "furnace", seed * 7919 + day);
  run.day = day;
  run.inventory = own.map(([def, stars], i) => ({ uid: 900 + i, def, ...(stars && stars > 1 ? { stars } : {}) }));
  if (last) run.lastMerchants = last;
  rollShop(run);
  return run;
}

/** Share of `n` caravans on `day` that include each merchant. */
function shares(day: number, own: Own = [], last?: MerchantId[], n = 4000): Record<MerchantId, number> {
  const hit = Object.fromEntries(ALL.map((m) => [m, 0])) as Record<MerchantId, number>;
  for (let seed = 1; seed <= n; seed++) for (const w of rolled(seed, day, own, last).shop.wagons) hit[w.merchant]++;
  for (const m of ALL) hit[m] /= n;
  return hit;
}
/** 4 standard errors of the difference of two shares, each measured on `n` caravans. */
const band2 = (p: number, q: number, n = 4000) => 4 * Math.sqrt((p * (1 - p) + q * (1 - q)) / n);

/** Run `fn` with extra catalogue entries (restored afterwards). */
function withStubs(stubs: Record<string, Partial<ItemDef>>, fn: () => void): void {
  const items = ITEMS as Record<string, ItemDef>;
  for (const [id, o] of Object.entries(stubs)) items[id] = { ...ITEMS.temper, id, name: `STUB ${id}`, ...o };
  try { fn(); } finally { for (const id of Object.keys(stubs)) delete items[id]; }
}

/** Keep a historical isolated stock scenario while the live catalogue remains expanded. */
function withMerchantParts(merchant: MerchantId, keep: string[], fn: () => void): void {
  const hidden = itemsSoldBy(merchant).filter((d) => !keep.includes(d.id));
  for (const d of hidden) d.merchant = undefined;
  try { fn(); } finally { for (const d of hidden) d.merchant = merchant; }
}

describe("shop: the merchant draw (§5.2 step 1)", () => {
  it("weights: two weight-3 regulars ride equally, the weight-2 Quartermaster less, the guaranteed Tinker more", () => {
    const s = shares(5);
    expect(Math.abs(s.ironmonger - s.gunsmith)).toBeLessThan(band2(s.ironmonger, s.gunsmith));
    expect(s.ironmonger - s.quartermaster).toBeGreaterThan(band2(s.ironmonger, s.quartermaster));
    expect(s.tinker - s.ironmonger).toBeGreaterThan(band2(s.tinker, s.ironmonger));
    expect(s.scrapper).toBeGreaterThan(0);
    expect(s.arcane).toBeGreaterThan(0);
  });

  it("a stocked Scrapper (stub) has the Quartermaster's weight 2", () => {
    withStubs({ __scrap: { merchant: "scrapper" } }, () => {
      const s = shares(5);
      expect(s.scrapper).toBeGreaterThan(0);
      expect(Math.abs(s.scrapper - s.quartermaster)).toBeLessThan(band2(s.scrapper, s.quartermaster));
    });
  });

  it("the Arcane Dealer (stub stock) weighs 0 on days 1-2, 1 on days 3-4 (below the Quartermaster), 2 from day 5", () => {
    withStubs({ __arc: { merchant: "arcane" } }, () => {
      expect(shares(1, [], undefined, 1000).arcane).toBe(0);
      expect(shares(2, [], undefined, 1000).arcane).toBe(0);
      const d3 = shares(3);
      expect(d3.arcane).toBeGreaterThan(0);
      expect(d3.quartermaster - d3.arcane).toBeGreaterThan(band2(d3.quartermaster, d3.arcane));
      const d6 = shares(6);
      expect(Math.abs(d6.arcane - d6.quartermaster)).toBeLessThan(band2(d6.arcane, d6.quartermaster));
    });
  });

  it("the regular-trade bias counts 1★ copies only and stops at +3: those runs draw the very same merchants (old save)", () => {
    const merchants = (seed: number, day: number, own: Own) => rolled(seed, day, own, undefined, true).shop.wagons.map((w) => w.merchant);
    for (let seed = 1; seed <= 300; seed++) {
      for (const day of [2, 5, 9]) {
        expect(merchants(seed, day, [["calibrate", 2], ["chamber", 3]])).toEqual(merchants(seed, day, []));
        const three: Own = [["calibrate"], ["chamber"], ["scatter"]];
        expect(merchants(seed, day, [...three, ["gatling"]])).toEqual(merchants(seed, day, three));
      }
    }
  });

  it("owning 1★ parts a merchant sells raises its draw rate (regular trade); riding yesterday lowers it (variety)", () => {
    const base = shares(5);
    const owned = shares(5, [["calibrate"], ["chamber"], ["scatter"]]);
    expect(owned.gunsmith - base.gunsmith).toBeGreaterThan(band2(owned.gunsmith, base.gunsmith));
    const seen = shares(5, [], ["ironmonger"]);
    expect(base.ironmonger - seen.ironmonger).toBeGreaterThan(band2(base.ironmonger, seen.ironmonger));
  });
});

describe("shop: the familiar slot's weights and chance (§5.2 step 3)", () => {
  // Only TINKER parts are owned, and the Tinker stocks 8 parts, so its <= 3 regular slots never fall back to an
  // owned one: an owned part in its wagon is the familiar slot.
  // 0.8.0 I1 M3 (oracle 47ddf8622ecd67d9): both tests below are "(old save)": today's rule (rolled's `old`)
  const familiar = (own: Own, day: number, n: number) => {
    const shown: Record<string, number> = {};
    let tinker = 0;
    for (let seed = 1; seed <= n; seed++) {
      const w = rolled(seed, day, own, undefined, true).shop.wagons.find((x) => x.merchant === "tinker");
      if (!w) continue;
      tinker++;
      for (const o of w.offers) if (own.some(([d]) => d === o.def)) shown[o.def] = (shown[o.def] ?? 0) + 1;
    }
    return { tinker, shown };
  };
  const within = (hits: number, n: number, p: number) => expect(Math.abs(hits / n - p)).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / n));

  it("weights 0.5 (1★ only) : 4 (2★ only) : 12 (1★ and 2★) : 0 (3★ only) (old save)", () => {
    const a = familiar([["grease"], ["brake", 2]], 9, 3000); // 0.5 vs 4
    within(a.shown.brake, a.shown.brake + a.shown.grease, 4 / 4.5);
    const b = familiar([["grease"], ["grease", 2], ["brake", 2]], 9, 3000); // 12 vs 4
    within(b.shown.grease, b.shown.grease + b.shown.brake, 12 / 16);
    const c = familiar([["grease", 3], ["brake"]], 9, 3000); // a 3★-only part is never a candidate
    expect(c.shown.grease ?? 0).toBe(0);
    within(c.shown.brake, c.tinker, 0.6); // so the lone 1★ brake takes every familiar slot
    for (const r of [a, b, c]) expect(r.tinker).toBeGreaterThan(1000);
  });

  it("chance by day, 1-10: 0, then 35% (days 2-3), 50% (4-6), 60% (7-10) of caravans whose merchant rides (old save)", () => {
    const want = [0, 0.35, 0.35, 0.5, 0.5, 0.5, 0.6, 0.6, 0.6, 0.6];
    for (let day = 1; day <= 10; day++) {
      const r = familiar([["grease"]], day, 1500);
      expect(r.tinker).toBeGreaterThan(500);
      if (day === 1) expect(r.shown.grease ?? 0).toBe(0);
      else within(r.shown.grease ?? 0, r.tinker, want[day - 1]);
    }
  }, 120_000); // RESTAGE-088: ten days of sampled shops get their own limit, as net-upload.slack's DP tests do (30 s ran out under host load)
});

describe("shop: badges and the survivor (folded from review-061's repro files)", () => {
  it("MERGE ★2 over a 3★ with a 1★; the grey wait over a 3★ with a 2★", () => {
    const run = newRun("furnace", 42);
    run.inventory = [{ uid: 900, def: "temper", stars: 3 }, { uid: 901, def: "temper" }];
    expect(shopBadge(run, "temper")).toEqual({ kind: "merge", toStars: 2 });
    run.inventory = [{ uid: 900, def: "temper", stars: 3 }, { uid: 901, def: "temper", stars: 2 }];
    expect(shopBadge(run, "temper")).toEqual({ kind: "wait" });
  });

  // mergePreview (the badge, the MERGES WITH line and the survivor ring) names what a tap-buy really does
  type Setup = { name: string; cargo: { uid: number; stars?: number }[]; deck: { uid: number; stars?: number }[] };
  const SETUPS: Setup[] = [
    { name: "1★ in cargo", cargo: [{ uid: 500 }], deck: [] },
    { name: "1★ on deck", cargo: [], deck: [{ uid: 500 }] },
    { name: "chain: 2★ deck + 1★ cargo", cargo: [{ uid: 501 }], deck: [{ uid: 500, stars: 2 }] },
    { name: "chain: 2★ cargo + 1★ deck", cargo: [{ uid: 500, stars: 2 }], deck: [{ uid: 501 }] },
    { name: "chain: both placed (the 2★ already there keeps its spot)", cargo: [], deck: [{ uid: 500, stars: 2 }, { uid: 501 }] },
    { name: "chain: both in cargo", cargo: [{ uid: 500, stars: 2 }, { uid: 501 }], deck: [] },
  ];
  function setup(s: Setup): Run {
    const run = newRun("furnace", 7);
    run.nextUid = 1000; // a newly gained copy's uid is above every owned twin's
    run.gold = 999;
    run.inventory = s.cargo.map((c) => ({ uid: c.uid, def: "temper", ...(c.stars ? { stars: c.stars } : {}) }));
    run.build.items.push(...s.deck.map((d, i) => ({ uid: d.uid, def: "temper", x: 1 + i, y: 1, ...(d.stars ? { stars: d.stars } : {}) })));
    run.fuseAnim = [];
    run.shop.wagons = [{ merchant: "alchemist", offers: [{ def: "temper", price: 3, sold: false }] }];
    return run;
  }
  for (const s of SETUPS) {
    it(`survivor = gain: ${s.name}`, () => {
      const run = setup(s);
      const pv = mergePreview(run, "temper")!;
      expect(pv).not.toBeNull();
      const res = buyOffer(run, 0, 0); // a tap-buy (BUY / BUY+MERGE): the copy is gained to cargo
      expect(res.ok).toBe(true);
      expect([res.gain!.survivor, res.gain!.where, res.gain!.stars]).toEqual([pv.survivorUid, pv.where, pv.toStars]);
    });
  }

  it("queueFuseAnim: a chain queues one step per merge, all at the final survivor; mergePreview queues nothing", () => {
    const run = setup(SETUPS[2]);
    run.fuseFx = [];
    mergePreview(run, "temper");
    expect([run.fuseAnim, run.fuseFx, run.inventory.length]).toEqual([[], [], 1]);
    buyOffer(run, 0, 0);
    expect(run.fuseAnim!.map((f) => [f.stars, f.survivor, f.where])).toEqual([[2, 500, "deck"], [3, 500, "deck"]]);
  });

  // 0.6.2m (REQ-BFG-033): the Alchemist no longer sells DRAKE NOZZLE (a core, now the Arcane Dealer's), so its unowned
  // rare here is VENOM DRIP, a rare rig: the same fresh-first case (common TEMPER unowned, WHETSTONE and COIL owned)
  it("fresh-first: owning whetstone + coil, a one-slot alchemist wagon that skips TEMPER offers the unowned VENOM (old save)", () => {
    withMerchantParts("alchemist", ["temper", "whetstone", "coil", "venom"], () => {
      let missing = 0, drake = 0; // drake: wagons offering only the unowned rare (VENOM since 0.6.2m)
      for (let seed = 1; seed <= 250; seed++) {
        const run = oldSaveRun("furnace", seed * 97); // 0.8.0 I1 M3 (oracle 47ddf8622ecd67d9): today's rule
        run.inventory = [{ uid: 900, def: "whetstone" }, { uid: 901, def: "coil" }];
        run.day = 1;
        rollShop(run);
        const alch = run.shop.wagons.find((w) => w.merchant === "alchemist");
        if (!alch || alch.offers.some((o) => o.def === "temper")) continue;
        missing++;
        if (alch.offers.every((o) => o.def === "venom")) drake++;
      }
      expect(missing).toBeGreaterThan(0);
      expect(drake).toBe(missing);
    });
  });
});

// 0.6.1r (review-061 N5, N6): robustness for stock and saves today's catalogue never produces (stubbed here);
// tools-free proof that the working cases keep their stream: the rollShop comparison in output-0.6.1r/logs.
describe("shop: robustness (N5, N6)", () => {
  /** Run `fn` with only `keep` merchants stocked (the others' parts unsold), restored afterwards. */
  function withOnly(keep: MerchantId[], fn: () => void): void {
    const items = ITEMS as Record<string, ItemDef>;
    const saved: [string, MerchantId][] = [];
    for (const d of Object.values(items)) if (d.merchant && !keep.includes(d.merchant)) { saved.push([d.id, d.merchant]); d.merchant = undefined; }
    try { fn(); } finally { for (const [id, m] of saved) items[id].merchant = m; }
  }

  it("a merchant with nothing to sell today (all-legendary stock before day 4) never rides, and no roll throws", () => {
    withStubs({ __arcleg: { merchant: "arcane", rarity: "legendary" } }, () =>
      withMerchantParts("arcane", ["__arcleg"], () => {
      let arcane = 0;
      for (let seed = 1; seed <= 400; seed++) {
        for (const day of [3, 4, 6]) {
          let run: Run | undefined;
          expect(() => { run = rolled(seed, day, [["grease"]]); }).not.toThrow();
          const w = run!.shop.wagons.find((x) => x.merchant === "arcane");
          if (day < 4) expect(w).toBeUndefined(); // weight 1 on day 3, but an empty day pool
          if (w) { arcane++; expect(w.offers.every((o) => o.def === "__arcleg")).toBe(true); }
          expect(run!.shop.wagons.flatMap((x) => x.offers)).toHaveLength(OFFERS);
        }
      }
      expect(arcane).toBeGreaterThan(0); // from day 4 it sells the legendary
      }));
  });

  it("fewer stocked merchants than wagons: every slot goes to the ones drawn, and no roll throws (old save)", () => {
    withOnly(["tinker"], () => {
      for (let seed = 1; seed <= 300; seed++) {
        for (const day of [1, 3, 5, 9]) {
          let run: Run | undefined;
          expect(() => { run = rolled(seed, day, [["grease"], ["brake", 2]], undefined, true); }).not.toThrow(); // 0.8.0 I1: old save
          expect(run!.shop.wagons.map((w) => w.merchant)).toEqual(["tinker"]);
          const defs = run!.shop.wagons[0].offers.map((o) => o.def);
          expect(defs).toHaveLength(OFFERS);
          expect(new Set(defs).size).toBe(OFFERS); // the Tinker stocks 7-8 parts: all fresh
        }
      }
    });
    withOnly(["tinker", "alchemist"], () => {
      for (let seed = 1; seed <= 300; seed++) {
        const run = rolled(seed, 5, [], undefined, true); // 0.8.0 I1: old save
        expect(run.shop.wagons.length).toBeLessThanOrEqual(2);
        expect(run.shop.wagons.flatMap((w) => w.offers)).toHaveLength(OFFERS);
      }
    });
  });

  it("N6: migrateRun turns a saved lastMerchants that isn't an array into [] (no version bump); arrays and absence stay", () => {
    for (const bad of ["tinker", 5, { tinker: true }, null]) {
      const m = migrateRun(JSON.parse(JSON.stringify({ ...newRun("furnace", 77), lastMerchants: bad })))!;
      expect(m.version).toBe(RUN_VERSION);
      expect(m.lastMerchants).toEqual([]);
      expect(() => rollShop(m)).not.toThrow();
    }
    expect(RUN_VERSION).toBe(8); // NUM-1: save v8 (save.ts v7to8; was 7); this test's own field still needs no bump
    const kept = migrateRun(JSON.parse(JSON.stringify({ ...newRun("furnace", 77), lastMerchants: ["tinker"] })))!;
    expect(kept.lastMerchants).toEqual(["tinker"]);
    const absent = migrateRun(JSON.parse(JSON.stringify(newRun("furnace", 77))))!;
    expect("lastMerchants" in absent).toBe(false);
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
