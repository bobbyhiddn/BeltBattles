// Balance harness v1 CLI: npm run balance -- [--pop 40] [--seeds 2] [--gauntlet 20] [--elites 8]
//   [--days 1,3,5,7,10] [--seed 1] [--workers N] [--out ../output]
// Writes <out>/balance-v1.md and <out>/balance-v1.json. Every run day is also a calibration day.
// Battles fan out to worker threads (node:worker_threads, this same bundled file); results are
// keyed by job, so the output is identical for any --workers value (1 runs in-process).

import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { isMainThread } from "node:worker_threads";
import { RULES_VERSION } from "../src/sim/content";
import { balanceMarkdown, describeBuild, type RunMeta } from "../src/sim/harness/report";
import { DEFAULT_OPTS, runDay, type TourneyOpts, type TourneyResult } from "../src/sim/harness/tournament";
import { flag, num, serveJobs, workerRunner } from "./workers";

if (!isMainThread) serveJobs();
else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const days = flag("days")?.split(",").map(Number) ?? DEFAULT_OPTS.days;
  const o: TourneyOpts = {
    ...DEFAULT_OPTS,
    seed: num("seed", DEFAULT_OPTS.seed),
    pop: num("pop", DEFAULT_OPTS.pop),
    seeds: num("seeds", DEFAULT_OPTS.seeds),
    elites: num("elites", DEFAULT_OPTS.elites),
    days,
    calibrationDays: days,
  };
  o.gauntlet = Math.min(o.pop, num("gauntlet", Math.min(DEFAULT_OPTS.gauntlet, o.pop)));
  o.elites = Math.min(o.elites, o.pop);
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 10)) throw new Error("--days must be days 1-10, comma separated");
  const nw = num("workers", Math.max(1, Math.min(availableParallelism() - 1, 23)));
  const out = resolve(flag("out") ?? "../output");
  const pool = workerRunner(nw, import.meta.url);
  const t0 = performance.now();
  const res: TourneyResult = { opts: o, days: [], battles: 0 };
  const perDayMs: Record<number, number> = {};
  for (const day of days) {
    const t = performance.now();
    const d = await runDay(o, day, pool.run);
    perDayMs[day] = performance.now() - t;
    res.days.push(d);
    res.battles += d.battles;
    console.log(`day ${day}: ${d.battles} battles in ${(perDayMs[day] / 1000).toFixed(1)} s`);
  }
  await pool.close();
  const cmd = process.argv.slice(2).join(" ");
  const meta: RunMeta = { runtimeMs: performance.now() - t0, workers: nw, command: `npm run balance${cmd ? ` -- ${cmd}` : ""}`, perDayMs };
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "balance-v1.md"), balanceMarkdown(res, meta));
  const json = {
    meta: { ...meta, rules: RULES_VERSION, note: "rates: p = row hero win rate (draws half), lo/hi = Wilson 95%, n = battles; pop 'a|a' = mirror cell" },
    opts: o, battles: res.battles,
    days: res.days.map((d) => ({
      ...d,
      elites: Object.fromEntries(Object.entries(d.elites).map(([h, es]) => [h, es.map((e) => ({ ...e, desc: describeBuild(e.build, d.day) }))])),
    })),
  };
  writeFileSync(resolve(out, "balance-v1.json"), JSON.stringify(json, null, 1) + "\n");
  console.log(`${res.battles} battles in ${(meta.runtimeMs / 1000).toFixed(1)} s on ${nw} worker(s); wrote ${out}/balance-v1.md and balance-v1.json`);
}
