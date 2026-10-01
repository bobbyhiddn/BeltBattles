// SC-TOOL: the 0.6.2 scorecard's measuring tool (REQ-BFG-026, done-list item B12). It measures the genre-study rows
// that parBench doesn't, on whatever tip it is built from, and writes <out>/sc-<mode>.json and <out>/sc-<mode>.md
// (target id | target | measured | PASS/MISS | notes, then the detail tables). The targets come from --targets.
//
//   npx vite build --ssr tools/scorecard.ts --outDir tools/dist/scorecard --emptyOutDir --logLevel warn
//   node tools/dist/scorecard/scorecard.js --static --targets <targets.json> --out <dir> [--label <tip>]
//        [--pool-runs 4000] [--standin-seeds 2000]
//   node tools/dist/scorecard/scorecard.js --dup --targets <targets.json> --out <dir> [--dup-seeds 48] [--resample 20]
//        [--pool-runs 4000] [--workers 4]
//   node tools/dist/scorecard/scorecard.js --fights --targets <targets.json> --out <dir> [--k 24] [--seeds 4]
//        [--days 1,2,...] [--standin-seeds 2000] [--workers 4]
//   node tools/dist/scorecard/scorecard.js --survival --targets <targets.json> --out <dir> [--surv-seeds 400]
//        [--check-seeds 20000] [--workers 4]
//   node tools/dist/scorecard/scorecard.js --output-gap --targets <targets.json> --out <dir> [--k 24] [--seeds 4]
//        [--ref-seeds 24] [--boot 400] [--days 1,2,...] [--standin-seeds 2000] [--workers 4]
// --fights writes one sc-fights-d<day>.json per day and rebuilds sc-fights.json/.md from every day file in <out>, so a
// long run can be split by --days across shell calls. Battles and par runs fan out to worker threads (results are
// keyed by job, so they never depend on --workers).
// REQ-BFG-026 job S1 adds the two rows the 0.6.2 scorecard lacked (DONE-CHECK-40d2b2c finding 3), whose targets are
// REQ-BFG-026's own (items 7 and 5), not rows of the targets file: --survival (run survival: P(alive after day 10) at a
// fixed dusk win rate from the run code, and the par player's runs; scorecard/survival.ts) and --output-gap (per day,
// each hero's median damage per second against one opponent set; flag at 2x; scorecard/gap.ts).
//
// It edits nothing in the game. Rows it doesn't measure (the README lists them): hard-pve-vs-par,
// hard-pve-top-quartile, filler-vs-par and first-fight-par-loss-rate (official values: parBench --rivals; --fights
// reports its own beside them as a check), winrate-pairing-band and winrate-hero-average (the cross-hero table),
// filler-vs-ghost-median (no real ghosts before 0.7.0) and winrate-scout-lift (no scout-and-refit player).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isMainThread, parentPort } from "node:worker_threads";
import { staticMode } from "./scorecard/static";
import { printRows, writeMode, type Row, type Section } from "./scorecard/report";
import { parseTargets } from "./scorecard/targets";
import { dupMode, dupJob, type DupJob } from "./scorecard/dup";
import { fightsMode } from "./scorecard/fights";
import { survivalMode, survJob, type SurvJob } from "./scorecard/survival";
import { GAP_FLAG, gapChunk, gapMode, type GapChunk } from "./scorecard/gap";
import { jobDetail, jobStats, playJob, type Job } from "../src/sim/harness/tournament";
import type { Build } from "../src/sim/deck";
import { flag, num } from "./workers";

/** Worker side: battle chunks (tools/workers.ts's format, so its workerRunner can feed them), --dup's par runs,
 *  --survival's par runs and --output-gap's battle chunks (scorecard/pool.ts runJobs). */
interface Chunk { id: number; field: Build[]; jobs: Job[]; detail?: boolean; stats?: boolean }
function serve(): void {
  parentPort!.on("message", (m: Chunk | { dup: DupJob; id: number } | { surv: SurvJob; id: number } | { gap: GapChunk; id: number }) => {
    if ("dup" in m) parentPort!.postMessage({ id: m.id, dup: dupJob(m.dup) });
    else if ("surv" in m) parentPort!.postMessage({ id: m.id, surv: survJob(m.surv) });
    else if ("gap" in m) parentPort!.postMessage({ id: m.id, gap: gapChunk(m.gap) });
    else parentPort!.postMessage({ id: m.id, out: m.jobs.map((j) => (m.stats ? jobStats(m.field, j) : m.detail ? jobDetail(m.field, j) : playJob(m.field, j))) });
  });
}

const has = (name: string): boolean => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  const t0 = performance.now();
  const tf = flag("targets");
  if (!tf) throw new Error("--targets <path to targets.json> is required");
  const targets = parseTargets(readFileSync(resolve(tf), "utf8"));
  const out = resolve(flag("out") ?? "output/scorecard");
  const label = flag("label") ?? "unlabelled tip";
  const workers = num("workers", 4);
  const args = process.argv.slice(2);
  const modes = ["static", "dup", "fights", "survival", "output-gap"].filter(has);
  if (!modes.length) throw new Error("pick a mode: --static, --dup, --fights, --survival or --output-gap");
  const days = (flag("days") ?? "1,2,3,4,5,6,7,8,9,10").split(",").map(Number);
  for (const mode of modes) {
    const m0 = performance.now();
    let res: { rows: Row[]; sections: Section[]; meta?: Record<string, unknown> } | null = null;
    if (mode === "static") res = staticMode(targets, { poolRuns: num("pool-runs", 4000), standinSeeds: num("standin-seeds", 2000) });
    if (mode === "dup") res = await dupMode(targets, { seeds: num("dup-seeds", 48), resample: num("resample", 20), poolRuns: num("pool-runs", 4000), workers, script: import.meta.url });
    if (mode === "fights") res = await fightsMode(targets, { k: num("k", 24), seeds: num("seeds", 4), days, standinSeeds: num("standin-seeds", 2000), workers, script: import.meta.url, out, label, args });
    if (mode === "survival") res = await survivalMode({ seeds: num("surv-seeds", 400), checkSeeds: num("check-seeds", 20000), workers, script: import.meta.url });
    if (mode === "output-gap") res = await gapMode({ k: num("k", 24), seeds: num("seeds", 4), refSeeds: num("ref-seeds", 24), days, standinSeeds: num("standin-seeds", 2000), workers, script: import.meta.url, flag: GAP_FLAG, boot: num("boot", 400) });
    if (!res) continue;
    const seconds = (performance.now() - m0) / 1000;
    writeMode(out, mode, res.rows, res.sections, { label, args, seconds, workers, ...(res.meta ?? {}) });
    printRows(mode, res.rows);
    console.log(`scorecard --${mode}: wrote ${resolve(out, `sc-${mode}.md`)} (${seconds.toFixed(1)} s)`);
  }
  console.log(`scorecard: done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

if (!isMainThread) serve();
else main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
