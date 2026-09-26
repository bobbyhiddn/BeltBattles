// SC-TOOL --dup (dup-owned-per-caravan, dup-specific-per-caravan): the real caravan roll before any reroll, against
// what the par player owns when that dawn's caravan opens. The par player (player.ts playerRun, typical policy) plays
// its real run; its onDecide hook fires at each shopping step, and the first call of a day comes before any buy or
// reroll, so run.shop is that dawn's caravan and the deck, turrets and cargo are what the player owns at dawn.
// "Owns" is the game's own card badge: run.ts shopBadge is non-null (MERGE, WAIT or MAX) exactly when the player holds
// a copy of the offered part, a hull's free starting turret included (a bought copy merges with it).
// Beside the real dawn caravan (one per seed), the same dawn state is re-rolled `resample` times with other run seeds
// (run.ts rollShop on a copy of the run with its own shop): the same odds, more caravans, for the per-part extremes.

import { Worker } from "node:worker_threads";
import { hashSeed } from "../../src/core/rng";
import { ITEMS, RUN_DAYS, type HeroId } from "../../src/sim/content";
import { PLAYABLE_HEROES } from "../../src/sim/heroBuilds";
import { playerRun } from "../../src/sim/harness/player";
import { rollShop, shopBadge, type Run } from "../../src/game/run";
import { turretList } from "../../src/sim/deck";
import { dayPoolSets } from "./catalogue";
import { mdTable, row, type Row, type Section } from "./report";
import { fmt, mean, rangeOf, type Target } from "./targets";

export interface DupJob { hero: HeroId; seed: number; resample: number }

interface Caravan { offers: number; wagons: number; wagonOwned: number; anyOwned: boolean; shown: string[] }
export interface DupDay {
  day: number;
  rerolls: number; // the caravan's reroll count when captured (0: the dawn caravan)
  owned: number; // distinct parts the player holds at dawn
  real: Caravan;
  re: { caravans: number; anyOwned: number; wagons: number; wagonOwned: number; offers: number; shown: Record<string, number> };
}

function caravanOf(run: Run): Caravan {
  const badge = new Map<string, boolean>();
  const owns = (def: string) => {
    let b = badge.get(def);
    if (b === undefined) badge.set(def, (b = shopBadge(run, def) !== null));
    return b;
  };
  const w = run.shop.wagons;
  const defs = w.flatMap((x) => x.offers.map((o) => o.def));
  return {
    offers: defs.length, wagons: w.length,
    wagonOwned: w.filter((x) => x.offers.some((o) => owns(o.def))).length,
    anyOwned: defs.some(owns),
    shown: [...new Set(defs)].filter((d) => ITEMS[d]?.kind !== "supply"),
  };
}

const heldParts = (run: Run): number => {
  const s = new Set<string>();
  for (const i of [...run.inventory, ...run.build.items, ...run.build.mods, ...turretList(run.build)]) if (ITEMS[i.def]?.merchant) s.add(i.def);
  return s.size;
};

/** One par run's dawn caravans, days 1-10 (worker-safe: plain data in and out). */
export function dupJob(j: DupJob): DupDay[] {
  const out: DupDay[] = [];
  let last = 0;
  playerRun(j.hero, RUN_DAYS, j.seed, {
    onDecide: (run) => {
      if (run.day === last) return;
      last = run.day;
      const re: DupDay["re"] = { caravans: 0, anyOwned: 0, wagons: 0, wagonOwned: 0, offers: 0, shown: {} };
      for (let r = 0; r < j.resample; r++) {
        const copy = { ...run, seed: hashSeed("sc-dup", j.hero, j.seed, run.day, r), shop: { wagons: [], rerolls: 0, discount: run.shop.discount, free: 0 } } as Run;
        rollShop(copy);
        const c = caravanOf(copy);
        re.caravans++;
        re.anyOwned += c.anyOwned ? 1 : 0;
        re.wagons += c.wagons;
        re.wagonOwned += c.wagonOwned;
        re.offers += c.offers;
        for (const d of c.shown) re.shown[d] = (re.shown[d] ?? 0) + 1;
      }
      out.push({ day: run.day, rerolls: run.shop.rerolls, owned: heldParts(run), real: caravanOf(run), re });
    },
  });
  return out;
}

/** Run jobs on `n` worker threads (the scorecard bundle serves { dup } messages), or in-process for n <= 1. */
async function runJobs(jobs: DupJob[], n: number, script: string): Promise<DupDay[][]> {
  if (n <= 1) return jobs.map(dupJob);
  const workers = Array.from({ length: Math.min(n, jobs.length) }, () => new Worker(new URL(script)));
  const out = new Array<DupDay[]>(jobs.length);
  try {
    await new Promise<void>((done, fail) => {
      let next = 0, pending = jobs.length;
      const feed = (w: Worker) => {
        if (next < jobs.length) w.postMessage({ id: next, dup: jobs[next++] });
      };
      for (const w of workers) {
        w.on("error", fail);
        w.on("message", (m: { id: number; dup: DupDay[] }) => {
          out[m.id] = m.dup;
          if (--pending === 0) done();
          else feed(w);
        });
        feed(w);
      }
    });
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
  return out;
}

export interface DupOpts { seeds: number; resample: number; poolRuns: number; workers: number; script: string }

interface Cell {
  hero: HeroId; day: number; caravans: number; offers: number; wagons: number;
  owned: number; // mean distinct parts held at dawn
  pAny: number; pWagon: number; // real dawn caravans: whole caravan, one wagon
  reAny: number; reWagon: number; reCaravans: number;
  pool: number; specific: number; reSpecific: number; // mean over the day's offerable parts of P(part shown)
  lo: { def: string; p: number }; hi: { def: string; p: number }; // resampled extremes
  realLo: { def: string; p: number }; realHi: { def: string; p: number };
  rerollsAtCapture: number; // captures not at the dawn caravan (should be 0)
}

export async function dupMode(targets: Target[], o: DupOpts): Promise<{ rows: Row[]; sections: Section[]; meta: Record<string, unknown> }> {
  const jobs: DupJob[] = PLAYABLE_HEROES.flatMap((hero) => Array.from({ length: o.seeds }, (_, i) => ({ hero, seed: i + 1, resample: o.resample })));
  const res = await runJobs(jobs, o.workers, o.script);
  const cells: Cell[] = [];
  for (const hero of PLAYABLE_HEROES) {
    const pools = dayPoolSets(hero, o.poolRuns);
    const runs = res.filter((_, i) => jobs[i].hero === hero);
    for (let day = 1; day <= RUN_DAYS; day++) {
      const ds = runs.map((r) => r.find((d) => d.day === day)).filter((d): d is DupDay => !!d);
      const pool = [...pools[day - 1]];
      const realP = pool.map((def) => ({ def, p: ds.filter((d) => d.real.shown.includes(def)).length / ds.length }));
      const reN = ds.reduce((s, d) => s + d.re.caravans, 0);
      const reP = pool.map((def) => ({ def, p: ds.reduce((s, d) => s + (d.re.shown[def] ?? 0), 0) / reN }));
      const byP = (xs: { def: string; p: number }[]) => [...xs].sort((a, b) => a.p - b.p || (a.def < b.def ? -1 : 1));
      cells.push({
        hero, day, caravans: ds.length,
        offers: mean(ds.map((d) => d.real.offers)), wagons: mean(ds.map((d) => d.real.wagons)), owned: mean(ds.map((d) => d.owned)),
        pAny: ds.filter((d) => d.real.anyOwned).length / ds.length,
        pWagon: ds.reduce((s, d) => s + d.real.wagonOwned, 0) / ds.reduce((s, d) => s + d.real.wagons, 0),
        reAny: ds.reduce((s, d) => s + d.re.anyOwned, 0) / reN,
        reWagon: ds.reduce((s, d) => s + d.re.wagonOwned, 0) / ds.reduce((s, d) => s + d.re.wagons, 0),
        reCaravans: reN,
        pool: pool.length, specific: mean(realP.map((x) => x.p)), reSpecific: mean(reP.map((x) => x.p)),
        lo: byP(reP)[0], hi: byP(reP)[reP.length - 1], realLo: byP(realP)[0], realHi: byP(realP)[realP.length - 1],
        rerollsAtCapture: ds.filter((d) => d.rerolls !== 0).length,
      });
    }
  }
  const rows: Row[] = [];
  const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
  const line = (f: (c: Cell) => number) => PLAYABLE_HEROES.map((h) => `${h.toUpperCase()} ${cells.filter((c) => c.hero === h).map((c) => pct(f(c))).join(" ")}`).join("; ");
  const bad = cells.reduce((s, c) => s + c.rerollsAtCapture, 0);
  rows.push(row(targets, "dup-owned-per-caravan", rangeOf(cells.map((c) => c.pAny)), "(whole dawn caravan, per hero-day)",
    [`Whole caravan (${fmt(mean(cells.map((c) => c.offers)), 1)} offers from ${fmt(mean(cells.map((c) => c.wagons)), 1)} wagons on average), days 1-10: ${line((c) => c.pAny)}.`,
      `One wagon: ${line((c) => c.pWagon)}.`,
      `Re-rolled from the same dawn states (${o.resample} per state): whole caravan ${line((c) => c.reAny)}.`,
      `Owned = the game's shop badge (a copy held in deck, turrets or cargo; a hull's free starting turret counts, since a bought copy merges with it). ${o.seeds} par runs per hero (typical policy, seeds 1-${o.seeds}).`,
      bad ? `${bad} captures were not at reroll 0.` : ""].filter(Boolean),
    cells.map((c) => ({ hero: c.hero, day: c.day, caravan: c.pAny, wagon: c.pWagon, resampledCaravan: c.reAny, resampledWagon: c.reWagon, offers: c.offers, wagons: c.wagons, owned: c.owned }))));
  rows.push(row(targets, "dup-specific-per-caravan", rangeOf(cells.map((c) => c.specific)), "(mean over the day's offerable parts, per hero-day)",
    [`Mean chance that one given offerable part shows in the dawn caravan, days 1-10: ${line((c) => c.specific)}.`,
      `Re-rolled: ${line((c) => c.reSpecific)}. The day's offerable parts come from --static's pool sample (${o.poolRuns} fresh caravans per day).`,
      `Lowest and highest part per hero-day (re-rolled, ${cells[0]?.reCaravans ?? 0} caravans each) are in the detail table.`],
    cells.map((c) => ({ hero: c.hero, day: c.day, pool: c.pool, mean: c.specific, resampledMean: c.reSpecific, lowest: c.lo, highest: c.hi, realLowest: c.realLo, realHighest: c.realHi }))));
  const sections: Section[] = [{
    title: "Duplicate offers per hero and day (dawn caravan before any reroll)",
    lines: mdTable(["hero", "day", "parts held at dawn", "offers / wagons", "P(caravan shows an owned part)", "P(one wagon does)", "re-rolled caravan / wagon", "offerable parts", "P(a given part shows): mean", "re-rolled mean", "lowest part (re-rolled)", "highest part (re-rolled)"],
      cells.map((c) => [c.hero, c.day, fmt(c.owned, 1), `${fmt(c.offers, 1)} / ${fmt(c.wagons, 1)}`, fmt(c.pAny), fmt(c.pWagon), `${fmt(c.reAny)} / ${fmt(c.reWagon)}`, c.pool, fmt(c.specific, 3), fmt(c.reSpecific, 3), `${c.lo.def} ${fmt(c.lo.p, 3)}`, `${c.hi.def} ${fmt(c.hi.p, 3)}`])),
  }];
  return { rows, sections, meta: { seeds: o.seeds, resample: o.resample, poolRuns: o.poolRuns, policy: "typical" } };
}
