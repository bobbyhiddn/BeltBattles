// S2 (BRIEF-S2 step 3): a TEST-ONLY deck-check worker. It speaks the same messages as server/validateWorker.ts (server/validator.ts WorkerRequest and
// WorkerReply) but fakes the check, so the queue, deadline, crash and restart rules can be tested without a real deck check's seconds. It is plain
// .mjs because vitest cannot start a worker from a .ts file. Production code has nothing like it: the validator is simply handed this script's path.
// What a job does is told by a directive, found in this order: the job's `build.fake` (validator-level tests, where the build is opaque), else
// workerData.byDay[job.day], else workerData.all (the HTTP-level tests, whose builds are real snapshots). A directive:
//   sleepMs   block this thread for that long (a slow synchronous check)
//   crash     "exit" (process.exit), "throw" (an uncaught error), "oom" (allocate until the heap limit), "spin" (never returns)
//   fail      a string: answer { type: "failed" } with it (the check threw)
//   verdict   "bad": answer { ok: false, errors: ["fake: refused"] }; default { ok: true, errors: [] }
// workerData: readyDelayMs (say "ready" this long after starting), crashOnStart (die at once), firstJobSleepMs (only the first job this worker
// receives blocks that long), plus the directives above.
import { parentPort, threadId, workerData } from "node:worker_threads";

const wd = workerData ?? {};
const block = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (wd.crashOnStart) process.exit(7);
let firstJob = true;

parentPort.on("message", (m) => {
  if (!m || m.type !== "job") return;
  const own = m.build && m.build.fake;
  const d = (own && Object.keys(own).length ? own : null) || (wd.byDay && wd.byDay[m.day]) || wd.all || {};
  if (d.sleepMs) block(d.sleepMs);
  if (firstJob && wd.firstJobSleepMs) block(wd.firstJobSleepMs);
  firstJob = false;
  if (d.crash === "exit") process.exit(3);
  if (d.crash === "throw") throw new Error("fake worker crash");
  if (d.crash === "oom") {
    const keep = [];
    for (;;) keep.push(new Array(1_000_000).fill(1));
  }
  if (d.crash === "spin") for (;;) { /* a check that never ends: only terminate() stops it */ }
  if (d.fail) {
    parentPort.postMessage({ type: "failed", id: m.id, error: d.fail });
    return;
  }
  const result = d.verdict === "bad" ? { ok: false, errors: ["fake: refused"], tid: threadId } : { ok: true, errors: [], tid: threadId };
  parentPort.postMessage({ type: "result", id: m.id, result });
});

(async () => {
  if (wd.readyDelayMs) await sleep(wd.readyDelayMs);
  parentPort.postMessage({ type: "log", line: `fake worker ${threadId} started` });
  parentPort.postMessage({ type: "ready", warmed: true, warmMs: wd.readyDelayMs ?? 0, heapLimitMb: 1 });
})();
