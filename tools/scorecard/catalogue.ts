// SC-TOOL --static, the catalogue rows (catalogue-active-pool, catalogue-day1-pool, catalogue-gating-steps). The shop's
// day gates (run.ts dayPool: no legendary before day 4; merchantWeight: the ARCANE DEALER's weight by day) are not
// exported, so the pools are measured through the public path that applies them: run.ts newRun and rollShop, the
// dawn caravan before any reroll, over n seeded runs per hero and day. A part counts as offerable on a day when a
// caravan of that day offered it; the rarest part's count is reported, so a reader can see how far above the
// sampling floor every part sits. A fresh run owns nothing, so fresh-first never hides a part and no merchant is
// halved by yesterday's caravan: owning parts only reweights merchants that already ride, it never adds stock.

import { hashSeed } from "../../src/core/rng";
import { ITEMS, RUN_DAYS, buyableModules, type HeroId } from "../../src/sim/content";
import { newRun, rollShop, type Run } from "../../src/game/run";

export interface DayPool {
  day: number;
  caravans: number;
  counts: Map<string, number>; // def -> caravans that offered it (supplies included)
}

/** A caravan's distinct offered defs (every wagon). */
export const offeredDefs = (run: Pick<Run, "shop">): Set<string> => new Set(run.shop.wagons.flatMap((w) => w.offers.map((o) => o.def)));

/** Dawn caravans (rerolls 0) of days 1..RUN_DAYS over n fresh runs of `hero`: day 1 is newRun's own caravan; each
 *  later day re-rolls the same fresh run's caravan on that day (rollShop reads the day, the seed and the owned parts). */
export function sampledPools(hero: HeroId, n: number, key = "sc-pool", lastDay = RUN_DAYS): DayPool[] {
  const pools: DayPool[] = Array.from({ length: lastDay }, (_, i) => ({ day: i + 1, caravans: 0, counts: new Map() }));
  for (let i = 0; i < n; i++) {
    const run = newRun(hero, hashSeed(key, hero, i), `${key}-${hero}-${i}`);
    for (let day = 1; day <= lastDay; day++) {
      if (day > 1) {
        run.day = day;
        run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
        rollShop(run);
      }
      const p = pools[day - 1];
      p.caravans++;
      for (const d of offeredDefs(run)) p.counts.set(d, (p.counts.get(d) ?? 0) + 1);
    }
  }
  return pools;
}

const isPart = (def: string): boolean => ITEMS[def]?.kind !== "supply";
export const isTurret = (def: string): boolean => ITEMS[def]?.kind === "turret";

/** The parts (supplies left out) a day's pool offered. */
export const partsOf = (p: DayPool): string[] => [...p.counts.keys()].filter(isPart).sort();

export interface HeroCatalogue {
  hero: HeroId;
  caravansPerDay: number;
  active: { modules: string[]; turrets: string[]; total: number };
  day1: { parts: string[]; modules: number; turrets: number };
  perDay: { day: number; parts: number; modules: number; turrets: number; rarest: { def: string; caravans: number } | null }[];
  steps: { day: number; unlocks: string[] }[]; // days whose offerable set grows, and what joins it
  supplies: string[]; // supplies offered (not counted as parts)
  neverOffered: string[]; // buyable parts (content.ts buyableModules) no sampled caravan offered
}

export function heroCatalogue(hero: HeroId, n: number, key = "sc-pool"): HeroCatalogue {
  const pools = sampledPools(hero, n, key);
  const seen = new Set<string>();
  const steps: HeroCatalogue["steps"] = [];
  for (const p of pools) {
    const fresh = partsOf(p).filter((d) => !seen.has(d));
    if (p.day > 1 && fresh.length) steps.push({ day: p.day, unlocks: fresh });
    fresh.forEach((d) => seen.add(d));
  }
  const all = [...seen].sort();
  const day1 = partsOf(pools[0]);
  const supplies = [...new Set(pools.flatMap((p) => [...p.counts.keys()].filter((d) => !isPart(d))))].sort();
  return {
    hero, caravansPerDay: n,
    active: { modules: all.filter((d) => !isTurret(d)), turrets: all.filter(isTurret), total: all.length },
    day1: { parts: day1, modules: day1.filter((d) => !isTurret(d)).length, turrets: day1.filter(isTurret).length },
    perDay: pools.map((p) => {
      const parts = partsOf(p);
      const rare = parts.map((d) => ({ def: d, caravans: p.counts.get(d)! })).sort((a, b) => a.caravans - b.caravans)[0] ?? null;
      return { day: p.day, parts: parts.length, modules: parts.filter((d) => !isTurret(d)).length, turrets: parts.filter(isTurret).length, rarest: rare };
    }),
    steps,
    supplies,
    neverOffered: buyableModules().map((d) => d.id).filter((d) => !seen.has(d)).sort(),
  };
}

/** Each day's offerable parts, from the same sample (the --dup mode's per-part denominators). */
export function dayPoolSets(hero: HeroId, n: number, key = "sc-pool"): Set<string>[] {
  return sampledPools(hero, n, key).map((p) => new Set(partsOf(p)));
}
