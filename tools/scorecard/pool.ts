// SC-TOOL: a small worker pool for the newer modes (--survival's par runs, --output-gap's battle chunks). The scorecard
// bundle is its own worker script: tools/scorecard.ts serve() answers { id, [tag]: job } with { id, [tag]: result }.
// Results are keyed by job index, so they never depend on how many workers ran them (1 or fewer runs in-process).

import { Worker } from "node:worker_threads";

export async function runJobs<J, R>(tag: string, jobs: readonly J[], n: number, script: string, local: (j: J) => R): Promise<R[]> {
  if (n <= 1 || jobs.length <= 1) return jobs.map(local);
  const workers = Array.from({ length: Math.min(n, jobs.length) }, () => new Worker(new URL(script)));
  const out = new Array<R>(jobs.length);
  try {
    await new Promise<void>((done, fail) => {
      let next = 0, pending = jobs.length;
      const feed = (w: Worker) => {
        if (next < jobs.length) {
          w.postMessage({ id: next, [tag]: jobs[next] });
          next++;
        }
      };
      for (const w of workers) {
        w.on("error", fail);
        w.on("message", (m: { id: number } & Record<string, unknown>) => {
          out[m.id] = m[tag] as R;
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
