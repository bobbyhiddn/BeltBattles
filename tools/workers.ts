// Worker-thread pool shared by the harness CLIs (balance.ts, genStandInPool.ts). Each CLI's
// bundle is its own worker script: its entry calls serveJobs() when !isMainThread and otherwise
// runs main() with workerRunner(n, import.meta.url). Results are keyed by job, so the output
// never depends on how many workers there are (1 runs in-process).

import { Worker, parentPort } from "node:worker_threads";
import type { Build } from "../src/sim/deck";
import { jobDetail, localDetail, localRunner, playJob, type DetailRunner, type Job, type Runner } from "../src/sim/harness/tournament";

// detail: play the chunk with jobDetail (exact per-battle outcomes, the star bench's NO EFFECT and
// SAME AS 2-star checks) instead of playJob (points)
interface Chunk { id: number; field: Build[]; jobs: Job[]; detail?: boolean }

/** Worker side: play each chunk of jobs and post the points (or the exact outcomes) back. */
export function serveJobs(): void {
  parentPort!.on("message", (c: Chunk) => parentPort!.postMessage({ id: c.id, out: c.jobs.map((j) => (c.detail ? jobDetail(c.field, j) : playJob(c.field, j))) }));
}

/** A pool of `n` worker threads running `script`, fed chunks of jobs on demand. */
export function workerRunner(n: number, script: string): { run: Runner; detail: DetailRunner; close: () => Promise<void> } {
  if (n <= 1) return { run: localRunner, detail: localDetail, close: async () => {} };
  const workers = Array.from({ length: n }, () => new Worker(new URL(script)));
  const dispatch = <T,>(field: Build[], jobs: Job[], detail: boolean) => new Promise<T[]>((done, fail) => {
    const size = Math.max(4, Math.ceil(jobs.length / (n * 8)));
    const chunks: Chunk[] = [];
    for (let i = 0; i < jobs.length; i += size) chunks.push({ id: chunks.length, field, jobs: jobs.slice(i, i + size), ...(detail ? { detail } : {}) });
    const out = new Array<T>(jobs.length);
    let next = 0, pending = chunks.length;
    if (!pending) return done(out);
    const feed = (w: Worker) => {
      if (next < chunks.length) w.postMessage(chunks[next++]);
    };
    for (const w of workers) {
      w.removeAllListeners();
      w.on("error", fail);
      w.on("message", (m: { id: number; out: T[] }) => {
        m.out.forEach((p, i) => (out[m.id * size + i] = p));
        if (--pending === 0) done(out);
        else feed(w);
      });
      feed(w);
    }
  });
  const run: Runner = (field, jobs) => dispatch<number>(field, jobs, false);
  const detail: DetailRunner = (field, jobs) => dispatch<string>(field, jobs, true);
  return { run, detail, close: async () => void (await Promise.all(workers.map((w) => w.terminate()))) };
}

export function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function num(name: string, dflt: number): number {
  const v = flag(name);
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a whole number, got ${v}`);
  return n;
}
