// Balance harness v0 CLI: npm run balance -- [--pop 40] [--seeds 2] [--gauntlet 10] [--elites 8]
//   [--days 1,3,5,7,10] [--seed 1] [--workers N] [--out ../output]
// Writes <out>/balance-v0.md and <out>/balance-v0.json. Battles fan out to worker threads
// (node:worker_threads, this same bundled file); results are keyed by job, so the output is
// identical for any --workers value (including 1, which runs in-process).

import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import type { Build } from "../src/sim/deck";
import { balanceMarkdown, describeBuild, type RunMeta } from "../src/sim/harness/report";
import { DEFAULT_OPTS, localRunner, playJob, runDay, type Job, type Runner, type TourneyOpts, type TourneyResult } from "../src/sim/harness/tournament";

interface Chunk { id: number; field: Build[]; jobs: Job[] }

if (!isMainThread) {
  parentPort!.on("message", (c: Chunk) => parentPort!.postMessage({ id: c.id, pts: c.jobs.map((j) => playJob(c.field, j)) }));
} else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function num(name: string, dflt: number): number {
  const v = flag(name);
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a whole number, got ${v}`);
  return n;
}

/** A pool of worker threads fed chunks of jobs on demand. */
function workerRunner(n: number): { run: Runner; close: () => Promise<void> } {
  const workers = Array.from({ length: n }, () => new Worker(new URL(import.meta.url)));
  const run: Runner = (field, jobs) => new Promise((done, fail) => {
    const size = Math.max(4, Math.ceil(jobs.length / (n * 8)));
    const chunks: Chunk[] = [];
    for (let i = 0; i < jobs.length; i += size) chunks.push({ id: chunks.length, field, jobs: jobs.slice(i, i + size) });
    const out = new Array<number>(jobs.length);
    let next = 0, pending = chunks.length;
    if (!pending) return done(out);
    const feed = (w: Worker) => {
      if (next < chunks.length) w.postMessage(chunks[next++]);
    };
    for (const w of workers) {
      w.removeAllListeners();
      w.on("error", fail);
      w.on("message", (m: { id: number; pts: number[] }) => {
        m.pts.forEach((p, i) => (out[m.id * size + i] = p));
        if (--pending === 0) done(out);
        else feed(w);
      });
      feed(w);
    }
  });
  return { run, close: async () => void (await Promise.all(workers.map((w) => w.terminate()))) };
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
  };
  o.gauntlet = Math.min(o.pop, num("gauntlet", Math.min(DEFAULT_OPTS.gauntlet, o.pop)));
  o.elites = Math.min(o.elites, o.pop);
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 10)) throw new Error("--days must be days 1-10, comma separated");
  const nw = num("workers", Math.max(1, Math.min(availableParallelism() - 1, 23)));
  const out = resolve(flag("out") ?? "../output");
  const pool = nw > 1 ? workerRunner(nw) : { run: localRunner, close: async () => {} };
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
  writeFileSync(resolve(out, "balance-v0.md"), balanceMarkdown(res, meta));
  const json = {
    meta: { ...meta, rules: "bb-0.4.0", note: "rates: p = row hero win rate (draws half), lo/hi = Wilson 95%, n = battles" },
    opts: o, battles: res.battles,
    days: res.days.map((d) => ({
      ...d,
      elites: Object.fromEntries(Object.entries(d.elites).map(([h, es]) => [h, es.map((e) => ({ ...e, desc: describeBuild(e.build, d.day) }))])),
    })),
  };
  writeFileSync(resolve(out, "balance-v0.json"), JSON.stringify(json, null, 1) + "\n");
  console.log(`${res.battles} battles in ${(meta.runtimeMs / 1000).toFixed(1)} s on ${nw} worker(s); wrote ${out}/balance-v0.md and balance-v0.json`);
}
