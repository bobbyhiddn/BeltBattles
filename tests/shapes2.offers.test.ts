// SHAPES-2 (REQ-BFG-114 (2); BRIEF-SHAPES2 S3; step 3): the shop odds. A typical run must see at least 5 shaped-rig offers across
// its shops (the bar, on every hero: the median run at least 6, at least 75% of runs at least 5), measured on the game's own
// run.ts rollShop, seeds 1-300, days 1-10, the first roll of each day's shop, the player buying nothing (tools/shapes2/offers.ts
// is the bench; this is its pin). The lever (wares.ts holdShaped, behind SHAPES2): the per-run draw keeps at least
// SHAPES2_ODDS.minStock shaped rigs among the run's wares. Pinned here in both switch states:
// - off: the draw is exactly what it was, whatever the lever says; on: every run holds the minimum, the draw keeps its size and
//   each merchant's and rarity's share, nothing held past its seat's day is displaced, and it is deterministic;
// - the bar, with PLAIN_RIGS on (1D ships both) and off;
// - REQ-BFG-022: the per-run draw stays in its band (55-70) and day 1 keeps 17+ buyable parts;
// - phone and desk alike: both layouts hold a card for every wagon and slot of run.shop.wagons.
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS, OFFERS, type HeroId } from "../src/sim/content";
import { SHAPES_IDS } from "../src/sim/shapes";
import { SHAPES2, SHAPES2_IDS, SHAPES2_ODDS, isShapedRig, setShapes2, withShapes2 } from "../src/sim/shapes2";
import { withPlainRigs } from "../src/sim/plainRigs";
import { DRAW, drawWares, heldPast } from "../src/game/wares";
import { newRun, rollShop } from "../src/game/run";
import { buildLayout } from "../src/screens/build/layout";

const MIN_STOCK = SHAPES2_ODDS.minStock; // the shipped value
afterEach(() => {
  setShapes2(SHAPES2);
  SHAPES2_ODDS.minStock = MIN_STOCK;
});

const NINE = [...SHAPES_IDS, ...SHAPES2_IDS];

/** A run's shops, the bench's way: day 1 from newRun, then day.ts nextDawn's lines (yesterday's caravan, a fresh roll), nothing bought. */
function shops(hero: HeroId, seed: number, days = 10): string[][] {
  const run = newRun(hero, seed, `offers-${hero}-${seed}`);
  const out: string[][] = [];
  for (let d = 1; d <= days; d++) {
    if (d > 1) {
      run.day = d;
      run.lastMerchants = run.shop.wagons.map((w) => w.merchant);
      run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
      rollShop(run);
    }
    out.push(run.shop.wagons.flatMap((w) => w.offers.map((o) => o.def)));
  }
  return out;
}
const shapedCount = (shop: string[][]): number => shop.flat().filter((id) => NINE.includes(id)).length;
const pct = (xs: number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.max(0, Math.ceil(q * xs.length) - 1))];

describe("SHAPES-2 S3: the lever (the per-run draw keeps shaped rigs in stock)", () => {
  it("the shipped minimum is 7 of the nine; the least that passes the bar on the 3000-seed bench (REPORT section 5)", () => {
    expect(SHAPES2_ODDS.minStock).toBe(7);
  });

  it("off: the draw is exactly what it was, whatever the lever says", () => {
    // BUMP-1D: SHAPES2 and PLAIN_RIGS ship on, so the off worlds this test measured are run explicitly: SHAPES2 off with PLAIN_RIGS
    // off (the world before 1D), and SHAPES2 off with PLAIN_RIGS on (1D's plain rigs without the six)
    const draws = (k: number) => {
      SHAPES2_ODDS.minStock = k;
      return Array.from({ length: 150 }, (_, i) => JSON.stringify(drawWares(i + 1)));
    };
    withShapes2(() => {
      withPlainRigs(() => {
        const base = draws(0);
        expect(draws(9)).toEqual(base);
        expect(draws(7)).toEqual(base);
      }, false);
      // and with PLAIN_RIGS on (SHAPES2 off) the same
      withPlainRigs(() => expect(draws(9)).toEqual(draws(0)));
    }, false);
  });

  it("on: every run holds at least 7 shaped rigs, the draw keeps its size and each merchant's and rarity's share", () => {
    withPlainRigs(() => withShapes2(() => {
      const by = (w: Record<string, number>, f: (id: string) => string) => {
        const o: Record<string, number> = {};
        for (const id of Object.keys(w)) o[f(id)] = (o[f(id)] ?? 0) + 1;
        return JSON.stringify(Object.entries(o).sort());
      };
      let displaced = 0, merchantsMoved = 0, raritiesMoved = 0;
      for (let seed = 1; seed <= 300; seed++) {
        SHAPES2_ODDS.minStock = 0;
        const plain = drawWares(seed);
        SHAPES2_ODDS.minStock = MIN_STOCK;
        const held = drawWares(seed);
        const shaped = Object.keys(held).filter((id) => isShapedRig(ITEMS[id]));
        expect(shaped.length, `seed ${seed}`).toBeGreaterThanOrEqual(7);
        expect(shaped.length).toBeGreaterThanOrEqual(Object.keys(plain).filter((id) => isShapedRig(ITEMS[id])).length);
        expect(Object.keys(held).length, `seed ${seed}: size`).toBe(Object.keys(plain).length);
        const dropped = Object.keys(plain).filter((id) => !(id in held)), added = Object.keys(held).filter((id) => !(id in plain));
        displaced += dropped.length;
        // a swap: an unlocked shaped rig comes in, a drawn piece that is not a shaped rig goes out
        for (const id of added) expect(isShapedRig(ITEMS[id]), `${id} comes in`).toBe(true);
        for (const id of dropped) { expect(isShapedRig(ITEMS[id]), `${id} goes out`).toBe(false); expect(heldPast(id)).toBe(false); }
        // same merchant, and the same rarity where its merchant had a drawn piece of that rarity (ARCANE DEALER's SPARK COMB: it
        // sells no other common, so it takes the place of one of the dealer's other pieces)
        if (by(plain, (id) => ITEMS[id].merchant!) !== by(held, (id) => ITEMS[id].merchant!)) merchantsMoved++;
        if (by(plain, (id) => ITEMS[id].rarity) !== by(held, (id) => ITEMS[id].rarity)) raritiesMoved++;
        // the rest of the draw is the same stream: any ware that stays keeps its seat's day unless the restocks moved
        expect(Object.keys(held).every((id) => ITEMS[id].kind !== "supply")).toBe(true);
      }
      console.log(`SHAPES-2 lever: 300 seeds, ${displaced} pieces displaced (${(displaced / 300).toFixed(2)} a run), ${merchantsMoved} runs with a merchant's count moved, ${raritiesMoved} with a rarity's`);
      expect(displaced / 300).toBeLessThan(2); // about 1.5 pieces a run: the lever is small
      expect(merchantsMoved).toBe(0); // a swap stays inside the merchant: every merchant carries the share it carried
      expect(raritiesMoved).toBeLessThan(75); // and inside the rarity but where the merchant drew none of it (the dealer sells no other common): about one run in six
      // deterministic: the same seed, the same wares
      expect(JSON.stringify(drawWares(7))).toBe(JSON.stringify(drawWares(7)));
    }));
  });

  it("on: the per-run draw stays in REQ-BFG-022's band (55-70) and day 1 holds 17+ buyable parts, with PLAIN_RIGS off and on", () => {
    for (const plain of [false, true]) {
      const run = () => withShapes2(() => {
        let min = 99, max = 0, day1 = 99;
        for (let seed = 1; seed <= 300; seed++) {
          const w = drawWares(seed);
          const n = Object.keys(w).length;
          min = Math.min(min, n); max = Math.max(max, n);
          day1 = Math.min(day1, Object.values(w).filter((d) => d <= 1).length);
        }
        return { min, max, day1 };
      });
      const r = withPlainRigs(run, plain); // BUMP-1D: PLAIN_RIGS ships on, so the "off" iteration sets it off explicitly (it ran with the shipped state)
      expect(r.min, `plain ${plain}`).toBeGreaterThanOrEqual(55);
      expect(r.min).toBeGreaterThanOrEqual(DRAW.active);
      expect(r.max).toBeLessThanOrEqual(70);
      expect(r.day1).toBeGreaterThanOrEqual(17);
    }
  });
});

describe("SHAPES-2 S3: the bar (REQ-BFG-114 (2)) on the game's own rollShop", () => {
  const HEROES: [HeroId, number][] = [["furnace", 300], ["weaver", 60], ["foundry", 60], ["bastion", 60]];
  for (const plain of [true, false]) {
    it(`SHAPES2 on, PLAIN_RIGS ${plain ? "on (1D ships both)" : "off"}: the median run sees 6+ shaped-rig cards and 75% see 5+, on every hero`, () => {
      const go = () => withShapes2(() => {
        for (const [hero, n] of HEROES) {
          const totals = Array.from({ length: n }, (_, i) => shapedCount(shops(hero, i + 1)));
          const median = pct(totals, 0.5), ge5 = totals.filter((t) => t >= 5).length / n;
          console.log(`SHAPES-2 offers ${hero} seeds 1-${n} PLAIN_RIGS ${plain ? "on" : "off"}: median ${median}, p25 ${pct(totals, 0.25)}, ${(100 * ge5).toFixed(1)}% with 5+`);
          expect(median, `${hero} median`).toBeGreaterThanOrEqual(6);
          expect(ge5, `${hero} share with 5+`).toBeGreaterThanOrEqual(0.75);
        }
      });
      withPlainRigs(go, plain); // BUMP-1D: PLAIN_RIGS ships on, so the "off" iteration sets it off explicitly (it ran with the shipped state)
    }, 60_000);
  }

  // BUMP-1D: was "off (the shipped world)": SHAPES2 ships on now, so the world where it is off (and PLAIN_RIGS with it, as this was
  // measured) is run explicitly
  it("off (the world before 1D), a run sees about two: the case this lever is for", () => {
    const totals = withShapes2(() => withPlainRigs(() => Array.from({ length: 100 }, (_, i) => shapedCount(shops("furnace", i + 1))), false), false);
    expect(pct(totals, 0.5)).toBeLessThanOrEqual(3);
    expect(totals.filter((t) => t >= 5).length / 100).toBeLessThan(0.25);
  });

  it("every shaped rig can be offered: all nine show up across a few hundred runs, and each is a card of its own merchant", () => {
    withPlainRigs(() => withShapes2(() => {
      const seen: Record<string, number> = Object.fromEntries(NINE.map((id) => [id, 0]));
      const run = newRun("furnace", 1, "x");
      for (let seed = 1; seed <= 150; seed++) {
        const r = newRun("furnace", seed, `m-${seed}`);
        for (let d = 1; d <= 10; d++) {
          if (d > 1) { r.day = d; r.lastMerchants = r.shop.wagons.map((w) => w.merchant); r.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 }; rollShop(r); }
          for (const w of r.shop.wagons) for (const o of w.offers) if (NINE.includes(o.def)) { seen[o.def]++; expect(ITEMS[o.def].merchant).toBe(w.merchant); }
        }
      }
      void run;
      for (const id of NINE) expect(seen[id], id).toBeGreaterThan(20);
    }));
  }, 60_000);
});

describe("SHAPES-2 S3: phone and desk alike show every wagon and slot of run.shop.wagons", () => {
  it("the layout holds one card per offer, on the phone (167 x 394) and the desk (480 x 270) and a laptop (455 x 256), inside the screen", () => {
    const screens: [string, number, number, boolean][] = [["phone", 167, 394, true], ["desk", 480, 270, false], ["laptop", 455, 256, false]];
    withPlainRigs(() => withShapes2(() => {
      let checked = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const run = newRun("furnace", seed, `l-${seed}`);
        for (let d = 1; d <= 10; d++) {
          if (d > 1) { run.day = d; run.lastMerchants = run.shop.wagons.map((w) => w.merchant); run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 }; rollShop(run); }
          const n = run.shop.wagons.reduce((s, w) => s + w.offers.length, 0); // build.ts offers(): every wagon, every slot
          expect(n).toBeGreaterThan(0);
          expect(n).toBeLessThanOrEqual(OFFERS);
          for (const [name, W, H, portrait] of screens) {
            const L = buildLayout(W, H, portrait, n, portrait);
            expect(L.cards.length, `${name} seed ${seed} day ${d}`).toBe(n);
            for (const c of L.cards) {
              expect(c.x, `${name} card x`).toBeGreaterThanOrEqual(0);
              expect(c.y).toBeGreaterThanOrEqual(0);
              expect(c.x + c.w).toBeLessThanOrEqual(W);
              expect(c.y + c.h).toBeLessThanOrEqual(H);
            }
          }
          checked++;
        }
      }
      expect(checked).toBe(400);
    }));
  });
});
