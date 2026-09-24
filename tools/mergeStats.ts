// 0.6.1d (ARSENAL.md §5.2; brief test-plan item 4): 500 seeds per hero with a simple greedy buyer,
// reporting the ★2/★3 counts at run end against the design's 2-4 / about-1 targets. Not part of
// `npm test` (a toy economic model, not a balance oracle: the harness owns the final numbers).
// It assumes a dusk win every night and skips warlord Hard picks and road-event items, so it only
// measures what the SHOP alone hands out — a lower bound on the real run's merge counts.
//
// Run: npx vite build --ssr tools/mergeStats.ts --outDir tools/dist/mergeStats --emptyOutDir
//      --logLevel warn && node tools/dist/mergeStats/mergeStats.js

import { hashSeed } from "../src/core/rng";
import { buyOffer, newRun, rollShop, shopBadge, type Run } from "../src/game/run";
import { incomeFor, ITEMS, RUN_DAYS, type HeroId } from "../src/sim/content";
import { starsOf } from "../src/sim/stars";

const SEEDS = 500;

/** Buy every affordable fusible offer, merges first, then cheapest, until nothing more fits. */
function greedyBuy(run: Run): void {
  for (;;) {
    let best: { w: number; s: number; merge: boolean; price: number } | null = null;
    for (let w = 0; w < run.shop.wagons.length; w++) {
      const wagon = run.shop.wagons[w];
      for (let s = 0; s < wagon.offers.length; s++) {
        const o = wagon.offers[s];
        if (o.sold || o.price > run.gold || ITEMS[o.def].kind === "supply") continue;
        const merge = shopBadge(run, o.def)?.kind === "merge";
        if (!best || (merge && !best.merge) || (merge === best.merge && o.price < best.price)) best = { w, s, merge, price: o.price };
      }
    }
    if (!best) return;
    buyOffer(run, best.w, best.s);
  }
}

function starCounts(run: Run): { two: number; three: number } {
  let two = 0, three = 0;
  for (const it of [...run.inventory, ...run.build.items, ...run.build.mods]) {
    const s = starsOf(it);
    if (s === 2) two++;
    else if (s === 3) three++;
  }
  return { two, three };
}

/** Toy model: buy on day 1, then for each later day pay yesterday's win income, reset and re-roll
 *  the caravan the way day.ts:finishDay does (lastMerchants captured, rerolls reset), and buy again. */
function simulate(hero: HeroId, seed: number): { two: number; three: number } {
  const run = newRun(hero, seed);
  greedyBuy(run);
  for (let day = 2; day <= RUN_DAYS; day++) {
    run.gold += incomeFor(day - 1, true);
    run.lastMerchants = run.shop.wagons.map((w) => w.merchant);
    run.day = day;
    run.shop = { wagons: [], rerolls: 0, discount: run.nextShop.discount, free: run.nextShop.free };
    run.nextShop = { discount: 0, free: 0 };
    rollShop(run);
    greedyBuy(run);
  }
  return starCounts(run);
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

function report(hero: HeroId): void {
  const twos: number[] = [], threes: number[] = [];
  let atLeastOneThree = 0;
  for (let i = 0; i < SEEDS; i++) {
    const { two, three } = simulate(hero, hashSeed("mergestats", hero, i));
    twos.push(two);
    threes.push(three);
    if (three >= 1) atLeastOneThree++;
  }
  const mtwo = mean(twos), mthree = mean(threes);
  const twoOk = mtwo >= 2 && mtwo <= 4 ? "OK" : "OUT OF BAND";
  const threeOk = mthree >= 0.5 && mthree <= 1.5 ? "OK" : "OUT OF BAND";
  console.log(`${hero.toUpperCase()}: ${SEEDS} seeds, greedy buyer (toy model: a dusk win every night, no warlord picks or road events)`);
  console.log(`  2-star at run end: mean ${mtwo.toFixed(2)}  (design target 2-4: ${twoOk})`);
  console.log(`  3-star at run end: mean ${mthree.toFixed(2)}  (design target ~1, band 0.5-1.5: ${threeOk})`);
  console.log(`  runs with >=1 three-star: ${((atLeastOneThree / SEEDS) * 100).toFixed(0)}%`);
}

report("furnace");
report("weaver");
