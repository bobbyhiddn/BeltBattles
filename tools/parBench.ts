// Par bench CLI (FB-C): npm run parbench -- <mode> [--days 1,5,10] [--workers 4] [--out dir] [--cache dir]
//   [--heroes furnace,weaver] [--k 12] [--policy typical|sharp] [--tune knob=value,...] [--tag name]
// Modes (any combination; each writes <out>/<mode>-<tag>.json and prints a summary):
//   --spend     no battles: the par field's deck value as a share of maxGoldByDay per hero-day, with the reroll
//               gold, the loss on replaced parts sold and the unspent gold apart (together: maxGoldByDay)
//   --pct       the par field's strength percentile inside the harness's full-purse population (the stand-in
//               generator's population and gauntlet, seed 1: 64 standInCandidate builds scored against 20 fullPurseBuild
//               builds per pool hero, 2 seeds x both sides); population scores are cached in <cache>/pop-<hero>-<day>.json
// Battles fan out to worker threads; results are keyed by job, so they never depend on --workers.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { isMainThread } from "node:worker_threads";
import { hashSeed } from "../src/core/rng";
import { type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { FUSE_MAX } from "../src/sim/stars";
import { fullPurseBuild, spendFloor } from "../src/sim/harness/gen";
import { STANDIN_DEFAULTS, decodeStandInCode, standInCandidate, standInCodeOf } from "../src/sim/harness/standins";
import { describeBuild } from "../src/sim/harness/report";
import { PAR_K, parSeeds, vsPar } from "../src/sim/harness/par";
import { fmtRate, meanCI, wilson } from "../src/sim/harness/stats";
import { standInPool } from "../src/sim/standInPool";
import { playerRun, type PlayerOpts } from "../src/sim/harness/player";
import type { Job, Runner } from "../src/sim/harness/tournament";
import { flag, num, serveJobs, workerRunner } from "./workers";

const HEROES: HeroId[] = ["furnace", "weaver"];
const norm = (b: Build): Build => decodeStandInCode(b.hero, standInCodeOf(b, "on"), "on");
const G = STANDIN_DEFAULTS.gauntlet, SEED = STANDIN_DEFAULTS.seed, SEEDS = STANDIN_DEFAULTS.seeds;

/** The stand-in generator's gauntlet of `day` (standins.ts genStandIns, seed 1, stars/cores/factories on). */
function gauntletOf(day: number): Build[] {
  return HEROES.flatMap((g) => Array.from({ length: G }, (_, i) => norm(fullPurseBuild(g, day, hashSeed("standin-gauntlet", SEED, g, day, i), spendFloor(day), 60, "on", FUSE_MAX, "on", "on").build)));
}

/** Each deck's win rate against the gauntlet (SEEDS seeds x both sides per member); seeds from seedsOf(deck, member). */
async function score(decks: Build[], gauntlet: Build[], seedsOf: (d: number, g: number) => number[], run: Runner): Promise<number[]> {
  const field = [...gauntlet, ...decks];
  const jobs: Job[] = decks.flatMap((_, d) => gauntlet.map((_, g): Job => ({ a: gauntlet.length + d, b: g, seeds: seedsOf(d, g) })));
  const pts = await run(field, jobs);
  return decks.map((_, d) => pts.slice(d * gauntlet.length, (d + 1) * gauntlet.length).reduce((s, p) => s + p, 0) / (gauntlet.length * SEEDS * 2));
}

interface PopCache { hero: HeroId; day: number; scores: number[]; costs: number[] }

async function population(hero: HeroId, day: number, gauntlet: Build[], run: Runner, cache: string): Promise<PopCache> {
  const f = resolve(cache, `pop-${hero}-${day}.json`);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")) as PopCache;
  const pop = Array.from({ length: STANDIN_DEFAULTS.pop }, (_, idx) => standInCandidate(hero, day, hashSeed("standin-pop", SEED, hero, day, idx), "on", "on", "on"));
  const builds = pop.map((c) => norm(c.build));
  const scores = await score(builds, gauntlet, (d, g) => Array.from({ length: SEEDS }, (_, k) => hashSeed("standin-battle", SEED, hero, day, d, g, k)), run);
  const out: PopCache = { hero, day, scores, costs: pop.map((c) => c.cost) };
  writeFileSync(f, JSON.stringify(out));
  return out;
}

/** Percentile of `x` inside `scores`: the share scoring lower, ties half (standins.ts percentiles, for an outside deck). */
export const pctIn = (scores: readonly number[], x: number): number =>
  (100 * scores.reduce((s, v) => s + (v < x ? 1 : v === x ? 0.5 : 0), 0)) / scores.length;

const med = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

async function pctMode(days: number[], run: Runner, out: string, cache: string, opts: PlayerOpts, k: number, tag: string): Promise<void> {
  const rows: unknown[] = [];
  for (const day of days) {
    const gauntlet = gauntletOf(day);
    for (const hero of (flag("heroes")?.split(",") as HeroId[] | undefined) ?? HEROES) {
      const t0 = performance.now();
      const pop = await population(hero, day, gauntlet, run, cache);
      const seeds = parSeeds(k);
      const field = seeds.map((s) => playerRun(hero, day, s, opts)[day - 1]);
      for (const d of field) {
        const v = validateBuild(d.build, day);
        if (!v.ok) throw new Error(`par ${hero} d${day}: invalid: ${v.errors.join("; ")}`);
      }
      const sc = await score(field.map((d) => d.build), gauntlet, (d, g) => Array.from({ length: SEEDS }, (_, x) => hashSeed("par-pct", tag, hero, day, seeds[d], g, x)), run);
      const pcts = sc.map((x) => pctIn(pop.scores, x));
      rows.push({ hero, day, seeds, pct: pcts, score: sc, value: field.map((d) => d.value), rerollGold: field.map((d) => d.rerollGold), gold: field.map((d) => d.gold), popMedianScore: med(pop.scores) });
      console.log(`pct ${tag} ${hero} d${day}: median ${med(pcts).toFixed(1)} [${Math.min(...pcts).toFixed(0)}-${Math.max(...pcts).toFixed(0)}] | ${pcts.map((p) => p.toFixed(0)).join(" ")} | value% ${field.map((d) => Math.round((100 * d.value) / maxGoldByDay(day))).join(" ")} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
    }
  }
  writeFileSync(resolve(out, `pct-${tag}.json`), JSON.stringify({ k, opts: { policy: opts.policy ?? "typical", maxStars: opts.maxStars ?? FUSE_MAX }, rows }, null, 1));
}

/** --spend (no battles): per hero-day, the par field's deck value as a share of maxGoldByDay, with the reroll gold,
 *  the gold lost selling replaced parts and the unspent gold kept apart (they add up to maxGoldByDay). */
function spendMode(days: number[], out: string, opts: PlayerOpts, k: number, tag: string): void {
  const rows: unknown[] = [];
  const all: number[] = [];
  for (const hero of (flag("heroes")?.split(",") as HeroId[] | undefined) ?? HEROES) {
    for (const day of days) {
      const budget = maxGoldByDay(day);
      const field = parSeeds(k).map((s) => playerRun(hero, day, s, opts)[day - 1]);
      for (const d of field) {
        const v = validateBuild(d.build, day);
        if (!v.ok) throw new Error(`par ${hero} d${day}: invalid: ${v.errors.join("; ")}`);
        if (d.value + d.rerollGold + d.soldLoss + d.gold !== budget) throw new Error(`par ${hero} d${day}: gold does not add up`);
      }
      const share = field.map((d) => d.value / budget);
      all.push(...share);
      rows.push({ hero, day, budget, value: field.map((d) => d.value), rerollGold: field.map((d) => d.rerollGold), soldLoss: field.map((d) => d.soldLoss), gold: field.map((d) => d.gold), rerolls: field.map((d) => d.rerolls) });
      const p = (x: number) => Math.round(100 * x);
      console.log(`spend ${tag} ${hero} d${day} (${budget} g): value% min ${p(Math.min(...share))} median ${p(med(share))} max ${p(Math.max(...share))} | value ${field.map((d) => d.value).join(" ")} | reroll g ${field.map((d) => d.rerollGold).join(" ")} | sold loss ${field.map((d) => d.soldLoss).join(" ")} | unspent ${field.map((d) => d.gold).join(" ")}`);
    }
  }
  console.log(`spend ${tag}: every deck ${Math.round(100 * Math.min(...all))}% or more of maxGoldByDay (${all.filter((x) => x < 0.85).length} of ${all.length} below 85%)`);
  writeFileSync(resolve(out, `spend-${tag}.json`), JSON.stringify({ k, opts: { policy: opts.policy ?? "typical", tune: opts.tune ?? {} }, rows }, null, 1));
}

/** --show (no battles): each par deck of the field (describeBuild) and the run's purchases up to that day. */
function showMode(days: number[], opts: PlayerOpts, k: number): void {
  for (const hero of (flag("heroes")?.split(",") as HeroId[] | undefined) ?? HEROES) {
    for (const day of days) {
      for (const s of parSeeds(k)) {
        const run = playerRun(hero, day, s, opts);
        const d = run[day - 1];
        console.log(`show ${hero} d${day} s${s}: ${describeBuild(d.build, day)} | reroll ${d.rerollGold} g, sold loss ${d.soldLoss} g, unspent ${d.gold} g`);
        for (const r of run) console.log(`    d${r.day}: ${r.buys.map((b) => `${b.def}${b.stars > 1 ? `*${b.stars}` : ""}(${b.price}${b.why === "best" ? "" : ` ${b.why}`}${b.roll ? ` r${b.roll}` : ""}${b.replaced ? ` for ${b.replaced}` : ""}${b.grew ? ` +${b.grew}t` : ""})`).join(" ") || "-"}`);
      }
    }
  }
}

/** --showpop N (no battles): the first N builds of the full-purse population (standInCandidate, as --pct scores them)
 *  with their cached gauntlet score when --pct has run. */
function showPopMode(days: number[], n: number, cache: string): void {
  for (const hero of (flag("heroes")?.split(",") as HeroId[] | undefined) ?? HEROES) {
    for (const day of days) {
      const f = resolve(cache, `pop-${hero}-${day}.json`);
      const pop = existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as PopCache) : null;
      const sorted = pop ? [...pop.scores].sort((a, b) => a - b) : [];
      for (let idx = 0; idx < Math.min(n, STANDIN_DEFAULTS.pop); idx++) {
        const c = standInCandidate(hero, day, hashSeed("standin-pop", SEED, hero, day, idx), "on", "on", "on");
        const sc = pop ? pop.scores[idx] : NaN;
        const pctTxt = pop ? ` pct ${pctIn(sorted, sc).toFixed(0)} score ${sc.toFixed(3)}` : "";
        console.log(`pop ${hero} d${day} #${idx}${pctTxt}: ${describeBuild(norm(c.build), day)}`);
      }
    }
  }
}

const pc = (x: number): string => `${(100 * x).toFixed(0)}%`;
const ciTxt = (c: [number, number] | null): string => (c ? `[${pc(Math.max(0, c[0]))}-${pc(Math.min(1, c[1]))}]` : "[n/a]");

/** --pool: the shipped stand-in pool (v2.1) against the par field of both heroes, per hero-day: each pick's win rate
 *  against each hero's field (PAR_SEEDS x both sides per member), vsPar = the lower of the two (the generator's floor
 *  rule), the mean over the picks with its 95% t-interval (the pick is the unit), and the pooled Wilson rate per hero. */
async function poolMode(days: number[], run: Runner, out: string, opts: PlayerOpts, k: number, tag: string): Promise<void> {
  const rows: unknown[] = [];
  for (const day of days) {
    for (const hero of HEROES) {
      const picks = standInPool(hero, day).map((e) => e.build);
      const res = await vsPar(picks, HEROES, day, run, { key: "par-pool", k, player: opts });
      const vp = res.map((r) => Math.min(...HEROES.map((h) => r[h].rate)));
      const m = meanCI(vp);
      const per = HEROES.map((h) => wilson(res.reduce((s, r) => s + r[h].pts, 0), res.reduce((s, r) => s + r[h].battles, 0)));
      rows.push({ hero, day, vsPar: vp, mean: m.mean, ci: m.ci, vs: Object.fromEntries(HEROES.map((h, i) => [h, { p: per[i].p, lo: per[i].lo, hi: per[i].hi, n: per[i].n, picks: res.map((r) => r[h].rate) }])) });
      console.log(`pool ${tag} ${hero} d${day}: vsPar ${pc(m.mean)} ${ciTxt(m.ci)} | picks ${vp.map(pc).join(" ")} | ${HEROES.map((h, i) => `vs ${h} ${fmtRate(per[i])}`).join(" | ")}`);
    }
  }
  writeFileSync(resolve(out, `pool-${tag}.json`), JSON.stringify({ k, rows }, null, 1));
}

async function main(): Promise<void> {
  const days = flag("days")?.split(",").map(Number) ?? Array.from({ length: 10 }, (_, i) => i + 1);
  const nw = num("workers", 4);
  const out = resolve(flag("out") ?? "../output-par");
  const cache = resolve(flag("cache") ?? out);
  mkdirSync(out, { recursive: true });
  mkdirSync(cache, { recursive: true });
  const pool = workerRunner(nw, import.meta.url);
  const t0 = performance.now();
  const policy = (flag("policy") ?? "typical") as PlayerOpts["policy"];
  const k = num("k", PAR_K);
  // --tune whim=0.5,noise=0.6: policy knob overrides (sweeps)
  const tune = Object.fromEntries((flag("tune") ?? "").split(",").filter(Boolean).map((kv) => {
    const [key, v] = kv.split("=");
    return [key, key === "grow" ? v === "1" || v === "true" : Number.isFinite(Number(v)) ? Number(v) : v];
  })) as PlayerOpts["tune"];
  const opts: PlayerOpts = { policy, ...(Object.keys(tune ?? {}).length ? { tune } : {}) };
  const tag = flag("tag") ?? `${policy}${flag("tune") ? `-${flag("tune")}` : ""}`;
  if (process.argv.includes("--show")) showMode(days, opts, k);
  if (flag("showpop")) showPopMode(days, num("showpop", 8), cache);
  if (process.argv.includes("--spend")) spendMode(days, out, opts, k, tag);
  if (process.argv.includes("--pct")) await pctMode(days, pool.run, out, cache, opts, k, tag);
  if (process.argv.includes("--pool")) await poolMode(days, pool.run, out, opts, k, tag);
  await pool.close();
  console.log(`done in ${((performance.now() - t0) / 1000).toFixed(0)} s on ${nw} worker(s)`);
  void buildCost;
}

// the entry comes last, so every module-level constant above is initialised before main() runs
if (!isMainThread) serveJobs();
else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
