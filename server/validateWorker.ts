// S2 (REQ-BFG-120; BRIEF-S2): the deck-check worker thread. server/validator.ts starts ONE of these (the bundle has it beside ghost-server.mjs as
// validate-worker.mjs) and sends it one job at a time. At start it fills roadCap's memo for days 1-25 (warmRoadCap, server/warm.ts, imported as it is):
// the memo lives in THIS thread's copy of the modules, which is why the warm-up moved here from the main thread. Then it says "ready" and answers each
// { type: "job", id, build, day, rules, opts } with validateUpload's own result, { ok, errors }: plain data, so it survives structured cloning
// unchanged. A check that throws is reported as "failed" (the request then gets the 500 it always got) and the worker stays up.
// There is no switch here that slows, skips or fakes a check; the queue, the deadline and the respawn are the main thread's (validator.ts).

import { getHeapStatistics } from "node:v8";
import { parentPort } from "node:worker_threads";
import { validateUpload } from "../src/net/validate";
import { warmRoadCap } from "./warm";
import type { WorkerReply, WorkerRequest } from "./validator";

const port = parentPort;
if (!port) throw new Error("validateWorker.ts is a worker thread's entry: it is started by server/validator.ts, not run on its own");

const send = (m: WorkerReply): void => port.postMessage(m);
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

port.on("message", (m: WorkerRequest) => {
  if (!m || m.type !== "job") return;
  try {
    send({ type: "result", id: m.id, result: validateUpload(m.build, m.day, m.rules, m.opts) });
  } catch (e) {
    send({ type: "failed", id: m.id, error: e instanceof Error ? e.stack ?? e.message : String(e) });
  }
});

async function boot(): Promise<void> {
  let warmMs = 0;
  let error: string | undefined;
  try {
    warmMs = (await warmRoadCap((line) => send({ type: "log", line }))).ms; // logs "road model warmed for days 1-25 ..." through the main thread
  } catch (e) {
    error = message(e);
  }
  // the limit V8 really gave this thread (a process-wide --max-old-space-size overrides resourceLimits, so the option is not the truth)
  send({ type: "ready", warmed: error === undefined, warmMs, heapLimitMb: Math.round(getHeapStatistics().heap_size_limit / 1048576), ...(error !== undefined ? { error } : {}) });
}

void boot();
