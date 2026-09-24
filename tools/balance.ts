// Balance harness v1 CLI: npm run balance -- [--pop 40] [--seeds 2] [--gauntlet 20] [--elites 8]
//   [--days 1,3,5,7,10] [--seed 1] [--workers N] [--out ../output]
// Writes <out>/balance-v1.md and <out>/balance-v1.json. Every run day is also a calibration day.
// Battles fan out to worker threads (node:worker_threads, this same bundled file); results are
// keyed by job, so the output is identical for any --workers value (1 runs in-process).
//   npm run balance -- --compare a/balance-v1.json b/balance-v1.json
// runs nothing: it compares the `days` tables of two runs (identical whatever the workers or
// runtime) and exits 1 if they differ.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** --compare: true when the two balance JSON files hold identical `days` tables. */
function compareRuns(fa: string, fb: string): boolean {
  const [a, b] = [fa, fb].map((f) => JSON.parse(readFileSync(resolve(f), "utf8")) as { meta: RunMeta; battles: number; days: unknown });
  const da = JSON.stringify(a.days), db = JSON.stringify(b.days);
  console.log(`days identical: ${da === db} (${da.length} chars); workers ${a.meta.workers} vs ${b.meta.workers}; battles ${a.battles} vs ${b.battles}`);
  return da === db;
}

async function main(): Promise<void> {
  const cmp = process.argv.indexOf("--compare");
  if (cmp >= 0) {
    const [fa, fb] = process.argv.slice(cmp + 1, cmp + 3);
    if (!fa || !fb || fa.startsWith("--") || fb.startsWith("--")) throw new Error("--compare needs two balance JSON files: --compare a.json b.json");
    process.exit(compareRuns(fa, fb) ? 0 : 1);
  }
  const days = flag("days")?.split(",").map(Number) ?? DEFAULT_OPTS.days;
  const starsFlag = flag("stars") ?? "on";
  if (starsFlag !== "on" && starsFlag !== "off") throw new Error(`--stars must be "on" or "off", got ${starsFlag}`);
  const o: TourneyOpts = {
    ...DEFAULT_OPTS,
    seed: num("seed", DEFAULT_OPTS.seed),
    pop: num("pop", DEFAULT_OPTS.pop),
    seeds: num("seeds", DEFAULT_OPTS.seeds),
    elites: num("elites", DEFAULT_OPTS.elites),
    days,
    calibrationDays: days,
    stars: starsFlag,
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
    const d = await runDay(o, day, pool.run, pool.detail);
    perDayMs[day] = performance.now() - t;
    res.days.push(d);
    res.battles += d.battles;
    console.log(`day ${day}: ${d.battles} battles in ${(perDayMs[day] / 1000).toFixed(1)} s`);
  }
  await pool.close();
  const cmd = process.argv.slice(2).join(" ");
  const meta: RunMeta = { runtimeMs: performance.now() - t0, workers: nw, command: `npm run balance${cmd ? ` -- ${cmd}` : ""}`, perDayMs };
  mkdirSync(out, { recursive: true });
  // 0.6.1a harness v2: stars on/off share the same tool and DayResult shape (v1's fields are
  // untouched; the v2 sections are simply absent when stars is off). Both write balance-v2.*; use
  // --out to keep an off run's files separate from an on run's for --compare (step 0's baseline
  // is still balance-v1.json, from bf779de, for the very first stars-off regression check).
  writeFileSync(resolve(out, "balance-v2.md"), balanceMarkdown(res, meta));
  const json = {
    meta: { ...meta, rules: RULES_VERSION, note: "rates: p = row hero win rate (draws half), lo/hi = Wilson 95%, n = battles; pop 'a|a' = mirror cell" },
    opts: o, battles: res.battles,
    days: res.days.map((d) => ({
      ...d,
      elites: Object.fromEntries(Object.entries(d.elites).map(([h, es]) => [h, es.map((e) => ({ ...e, desc: describeBuild(e.build, d.day) }))])),
    })),
  };
  writeFileSync(resolve(out, "balance-v2.json"), JSON.stringify(json, null, 1) + "\n");
  console.log(`${res.battles} battles in ${(meta.runtimeMs / 1000).toFixed(1)} s on ${nw} worker(s); wrote ${out}/balance-v2.md and balance-v2.json (stars ${o.stars})`);
}
