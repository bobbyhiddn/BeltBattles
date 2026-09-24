// Stand-in pool CLI: npm run standins -- [--seed 1] [--pop 64] [--band 40,60] [--per 6] [--par-floor 50]
//   [--workers N] [--out ../output] [--check | --versus] [--dump pop.json]
// Writes src/sim/standInPoolData.ts (the bundled pool the game copies with src/sim/standInPool.ts)
// and <out>/standin-pool.md. --check regenerates in memory, compares with the committed data
// module and exits 1 if they differ (nothing is written). --dump also writes every population
// build (idx, cost, pct, score, win rate vs each reference) as JSON, for audits; it works with
// --check. --versus writes nothing: it plays the bundled pool (the data module this build was
// bundled from) against itself, every pick of the first pool hero against every pick of the
// second, and prints the first hero's win rate per day (the report's pool-vs-pool measure).
// Battles fan out to worker threads; results are keyed by job, so the pool is identical
// for any --workers value.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { isMainThread } from "node:worker_threads";
import { HEROES, RULES_VERSION, type HeroId } from "../src/sim/content";
import { validateBuild } from "../src/net/validate";
import { describeBuild } from "../src/sim/harness/report";
import { pct } from "../src/sim/harness/stats";
import {
  STANDIN_DEFAULTS, dataModuleText, eligibleOf, genStandIns, poolVsPool, standInCommand, type HeroDay, type StandInOpts,
} from "../src/sim/harness/standins";
import { STAND_IN_POOL_RULES, standInPool } from "../src/sim/standInPool";
import { flag, num, serveJobs, workerRunner } from "./workers";

const DATA = "src/sim/standInPoolData.ts";

if (!isMainThread) serveJobs();
else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const band = (flag("band") ?? STANDIN_DEFAULTS.band.join(",")).split(",").map(Number);
  if (band.length !== 2 || band.some((x) => !Number.isFinite(x) || x < 0 || x > 100) || band[0] >= band[1]) throw new Error("--band must be lo,hi percentiles, e.g. 40,60");
  const pf = Number(flag("par-floor") ?? STANDIN_DEFAULTS.parFloor * 100);
  if (!Number.isFinite(pf) || pf < 0 || pf > 100) throw new Error("--par-floor must be a win-rate percentage, e.g. 50");
  const o: StandInOpts = {
    ...STANDIN_DEFAULTS,
    seed: num("seed", STANDIN_DEFAULTS.seed),
    pop: num("pop", STANDIN_DEFAULTS.pop),
    per: num("per", STANDIN_DEFAULTS.per),
    gauntlet: num("gauntlet", STANDIN_DEFAULTS.gauntlet),
    band: [band[0], band[1]],
    parFloor: pf / 100,
  };
  if (o.per < 1 || o.pop < o.per) throw new Error("--pop must be at least --per, and --per at least 1");
  const check = process.argv.includes("--check");
  const nw = num("workers", Math.max(1, Math.min(availableParallelism() - 1, 23)));
  const pool = workerRunner(nw, import.meta.url);
  const t0 = performance.now();
  if (process.argv.includes("--versus")) {
    const pvp = await poolVsPool(o, (h, d) => standInPool(h, d).map((e) => e.build), pool.run);
    await pool.close();
    console.log(`versus: the bundled pool (rules ${STAND_IN_POOL_RULES}), every ${H(o.heroes[0])} pick vs every ${H(o.heroes[1])} pick, ${o.seeds} seeds x both sides, ${((performance.now() - t0) / 1000).toFixed(1)} s on ${nw} worker(s)`);
    for (const r of pvp) console.log(`versus: day ${r.day}: ${H(o.heroes[0])} pool wins ${pct(r.rate)} of ${r.battles}`);
    return;
  }
  const res = await genStandIns(o, pool.run, (m) => console.log(m));
  for (const hd of res.days) {
    for (const p of hd.picks) {
      const v = validateBuild(p.build, hd.day);
      if (!v.ok || p.build.hero !== hd.hero) throw new Error(`stand-in ${hd.hero} d${hd.day} #${p.idx} is invalid: ${v.errors.join("; ")}`);
    }
  }
  const text = dataModuleText(o, res.days);
  const path = resolve(DATA);
  const dump = flag("dump");
  if (dump) {
    const rows = res.days.map((hd) => ({
      hero: hd.hero, day: hd.day, relax: hd.relax, window: hd.window, par: hd.par, picks: hd.picks.map((p) => p.idx),
      pop: hd.pop.map((c) => [c.idx, c.cost, c.floorMet ? 1 : 0, c.pct, c.score, ...o.heroes.map((h) => c.vsRef[h] ?? 0)]),
    }));
    writeFileSync(resolve(dump), JSON.stringify({ columns: ["idx", "cost", "floorMet", "pct", "score", ...o.heroes.map((h) => `vs ${h} ref`)], days: rows }));
    console.log(`dump: every population build of every hero and day written to ${resolve(dump)}`);
  }
  if (check) {
    await pool.close();
    const secs = (performance.now() - t0) / 1000;
    let old = "";
    try {
      old = readFileSync(path, "utf8");
    } catch {
      old = "";
    }
    const same = old === text;
    console.log(`check: ${same ? "IDENTICAL" : "DIFFERS"}: regenerated ${text.length} bytes in memory (${res.battles} battles, ${secs.toFixed(1)} s, ${nw} workers) vs committed ${DATA} (${old.length} bytes)`);
    process.exit(same ? 0 : 1);
  }
  const secs = (performance.now() - t0) / 1000;
  const pvp = await poolVsPool(o, (h, d) => res.days.find((x) => x.hero === h && x.day === d)!.picks.map((p) => p.build), pool.run);
  await pool.close();
  writeFileSync(path, text);
  const out = resolve(flag("out") ?? "../output");
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "standin-pool.md"), poolMarkdown(o, res.days, pvp, { battles: res.battles, secs, workers: nw, bytes: text.length }));
  console.log(`${res.battles} battles in ${secs.toFixed(1)} s on ${nw} worker(s); wrote ${DATA} (${text.length} bytes) and ${out}/standin-pool.md`);
}

const H = (h: HeroId) => HEROES[h].name;
const STEP: Record<HeroDay["relax"], string> = { none: "none", widen: "(a) widen", grow: "(b) grow", elites: "(c) elites", best: "(d) best vsPar" };

function poolMarkdown(o: StandInOpts, days: HeroDay[], pvp: { day: number; rate: number; battles: number }[], run: { battles: number; secs: number; workers: number; bytes: number }): string {
  const w = o.band[1] - o.band[0], refs = o.heroes.map((h) => `vs ${H(h)} ref`);
  const L = [
    "# BeltBattles stand-in pool v1.1 (full purse, par floor)",
    "",
    `Generated by \`${standInCommand(o)}\` (rules ${RULES_VERSION}): ${run.battles} battles in ${run.secs.toFixed(1)} s on ${run.workers} worker thread(s).`,
    `Data module \`${DATA}\`: ${run.bytes} bytes (${(run.bytes / 1024).toFixed(1)} KB); loader \`src/sim/standInPool.ts\`.`,
    "",
    `- Population: ${o.pop} legal builds per hero and day (grown to ${o.grow.join(" or ")} where a day needed it), each costing at least ceil(0.9 x maxGoldByDay(day)).`,
    `- Score: win rate against a fixed gauntlet of that day's full-purse builds, ${o.gauntlet} per hero (${o.heroes.map(H).join(" and ")}), from another seed; ${o.seeds} seeds x both sides per pairing (${o.gauntlet * o.heroes.length * o.seeds * 2} battles per build). pct: strength percentile inside the day's final population (share scoring lower, ties half).`,
    `- ${o.heroes.map((h) => `vs ${H(h)} ref`).join(" / ")}: win rate against heroRefBuild(hero, day), the game's par deck of that faction, ${o.refSeeds} seeds x both sides (${o.refSeeds * 2} battles each). vsPar = floor(b) = the lower of the two.`,
    `- Eligible: pct >= ${o.band[0]}, vsPar >= ${pct(o.parFloor)}, spend floor met, and not among the population's top eighth (the elites: 8 of 64, 16 of 128, 32 of 256).`,
    `- Window: ${w} points from p0, the lowest eligible pct, or from ${o.band[0]} when no build lies between ${o.band[0]} and p0 (so a band that already clears the floor keeps its picks). Picks: ${o.per} eligible builds nearest to evenly spaced targets across it; par = the pick nearest the window's middle (**bold**).`,
    `- Too few eligible in the window: (a) widen it upward ${o.widen} points at a time; (b) grow the population to ${o.grow.join(", then ")} (same gauntlet, deterministic); (c) allow elites; (d) the ${o.per} builds with the highest vsPar, listed in STAND_IN_DATA.short.`,
    `- Par vs elites: against that day's top ${o.elites} builds of each pool hero's base population of ${o.pop} (the v1 elites), ${o.seeds} seeds x both sides.`,
    "",
    "## Summary",
    "",
    `| hero | day | relaxation | window | pop | eligible | picks: cost | picks: pct | picks: vsPar | par pct | par ${refs.join(" / ")} | par vs elites |`,
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const hd of days) {
    const costs = hd.picks.map((p) => p.cost), pcts = hd.picks.map((p) => p.pct), vp = hd.picks.map((p) => p.vsPar);
    const elig = eligibleOf(hd.pop, o, hd.relax === "elites" || hd.relax === "best").length;
    L.push(`| ${H(hd.hero)} | ${hd.day} | ${STEP[hd.relax]} | ${hd.window[0]}-${hd.window[1]} | ${hd.pop.length} | ${elig} | ${Math.min(...costs)}-${Math.max(...costs)} | ${Math.min(...pcts)}-${Math.max(...pcts)} | ${pct(Math.min(...vp))}-${pct(Math.max(...vp))} | ${hd.picks[hd.par].pct} | ${o.heroes.map((h) => pct(hd.parVsRef[h] ?? 0)).join(" / ")} | ${pct(hd.parVsElites)} |`);
  }
  L.push("", `## ${H(o.heroes[0])} pool vs ${H(o.heroes[1])} pool (report only)`, "", `Every ${H(o.heroes[0])} pick against every ${H(o.heroes[1])} pick, ${o.seeds} seeds x both sides.`, "");
  L.push(`| day | ${pvp.map((r) => r.day).join(" | ")} |`, `|---|${pvp.map(() => "---").join("|")}|`, `| ${H(o.heroes[0])} pool win rate | ${pvp.map((r) => `${pct(r.rate)}`).join(" | ")} |`, `| battles | ${pvp.map((r) => r.battles).join(" | ")} |`);
  const spend = days.filter((hd) => hd.short), best = days.filter((hd) => hd.relax === "best");
  L.push("", "## Exceptions", "");
  L.push(spend.length ? spend.map((hd) => `- ${H(hd.hero)} day ${hd.day}: picks under the spend floor ${hd.floor}: ${hd.picks.filter((p) => p.cost < hd.floor).map((p) => p.cost).join(", ")} g`).join("\n") : "- Spend floor: none. Every pick of every hero and day costs at least ceil(0.9 x maxGoldByDay).");
  L.push(best.length ? best.map((hd) => `- ${H(hd.hero)} day ${hd.day}: fewer than ${o.per} builds reach vsPar ${pct(o.parFloor)}; the best ${o.per} by vsPar: ${hd.picks.map((p) => pct(p.vsPar)).join(", ")} (listed in STAND_IN_DATA.short).`).join("\n") : `- Par floor: none. Every pick of every hero and day wins at least ${pct(o.parFloor)} against both par decks.`);
  for (const hd of days) {
    L.push("", `## ${H(hd.hero)} day ${hd.day} (floor ${hd.floor} of ${hd.budget} g; ${STEP[hd.relax]}, window ${hd.window[0]}-${hd.window[1]} of ${hd.pop.length})`, "");
    L.push(`| # | cost | pct | score | ${refs.join(" | ")} | deck |`, `|---|---|---|---|${refs.map(() => "---").join("|")}|---|`);
    hd.picks.forEach((p, i) => {
      const b = (s: string | number) => (i === hd.par ? `**${s}**` : `${s}`);
      L.push(`| ${b(i === hd.par ? `${i} par` : i)} | ${b(p.cost)} | ${b(p.pct)} | ${b(pct(p.score))} | ${o.heroes.map((h) => b(pct(p.vsRef[h] ?? 0))).join(" | ")} | ${describeBuild(p.build, hd.day)} |`);
    });
    L.push("", `Par: ${pct(hd.parVsElites)} vs the day's elites. Top elite: ${pct(hd.elites[0].score)} (${hd.elites[0].cost} g).`);
  }
  return L.join("\n") + "\n";
}
