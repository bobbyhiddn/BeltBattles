// S2 (REQ-BFG-120; BRIEF-S2; LAUNCH-0 run 3 REPORT 1.2, 1.4, 1.5): THE DECK CHECK LEAVES THE REQUEST THREAD.
//
// POST /v1/ghosts used to run validateUpload (src/net/validate.ts, the full deck, gold-budget, road and rune re-derivation) on the one request
// thread: a cold day-25 check held every other request (health, match, profile, the page) for 2-3.5 s of CPU, and a burst of deep uploads
// queued without limit. app.ts now awaits a Validator. Two exist:
//   createWorkerValidator   production (main.ts). ONE worker thread (node:worker_threads) runs validateUpload, pre-warmed with the road-cap
//                           warm-up (server/validateWorker.ts, which calls warmRoadCap inside the worker: the memo lives in the worker's copy
//                           of the modules). The queue, the deadline and the respawn rule are here, in the main thread:
//     queue      at most 1 check running and `maxQueued` (16) waiting. An upload that would need the next place is refused at once
//                (OverloadError "queue-full" -> 503 + Retry-After). First come, first checked.
//     deadline   each job has `timeoutMs` (10 s), counted from when it JOINS the queue (a job that waits for a warming or restarting worker
//                spends its deadline waiting). At the deadline: a job still waiting is dropped; a job still running has its worker terminated
//                (the check is synchronous, so it cannot be interrupted any other way) and a fresh worker starts, warms and takes the queue.
//                Either way the upload gets OverloadError "timeout" -> 503 + Retry-After, and nothing is stored.
//     respawn    a worker that dies (out of memory, an uncaught error, exit) or is terminated for a deadline is replaced. The job it was
//                running gets OverloadError "worker-died" -> 503 + Retry-After; the jobs still waiting go on to the new worker. Replacements
//                back off: the 1st restart in a row is immediate, then 250 ms, 500 ms, 1 s ... doubling to 30 s, so a crash loop (a worker
//                that dies in its warm-up, or on every upload) cannot spin the CPU. A worker that returns a verdict resets the streak.
//   createInThreadValidator tests that build the app in-process (vitest cannot start a worker from a .ts file), and uploads=closed, where no
//                check ever runs. Exactly today's behaviour: validateUpload runs inline on the calling thread.
// The verdict is validateUpload's own, unchanged: the worker runs the same function on the same bytes (structured clone of plain data), and
// the result ({ ok, errors }) is plain data too. The main thread keeps the cheap checks and the store.
// Nothing here can slow, skip or fake a check: the only switch is WHICH script a test hands the validator.

import { Worker } from "node:worker_threads";
import { validateUpload, type ValidateContext, type Validation } from "../src/net/validate";

/** validateUpload's first argument (src/net/validate.ts): the snapshot's build, plain data from the strict decoder. */
export type UploadBuild = Parameters<typeof validateUpload>[0];

/** One deck check: validateUpload's four arguments. Plain data only: it crosses to the worker by structured clone. */
export interface ValidateJob {
  build: UploadBuild;
  day: number;
  rules: string;
  opts: ValidateContext;
}

/** What the worker is sent, and what it answers (server/validateWorker.ts). */
export type WorkerRequest = ValidateJob & { type: "job"; id: number };
export type WorkerReply =
  | { type: "ready"; warmed: boolean; warmMs: number; heapLimitMb: number; error?: string } // the road-cap warm-up is over (or failed); jobs may now be sent
  | { type: "result"; id: number; result: Validation }
  | { type: "failed"; id: number; error: string } // validateUpload threw: the worker is fine, the request gets the usual 500
  | { type: "log"; line: string };

/** Why an upload was not checked. app.ts answers 503 with a Retry-After header of `retryAfterS` seconds; nothing is stored. */
export type OverloadKind = "queue-full" | "timeout" | "worker-died" | "unavailable";
export class OverloadError extends Error {
  constructor(readonly kind: OverloadKind, message: string, readonly retryAfterS: number) {
    super(message);
    this.name = "OverloadError";
  }
}

export type ValidatorState = "warming" | "ready" | "restarting" | "stopped" | "in-thread";

/** The numbers /v1/health reports. Read synchronously: they never wait on the worker. */
export interface ValidatorStats {
  kind: "worker" | "in-thread";
  state: ValidatorState;
  queued: number; // waiting, not counting the one running
  running: 0 | 1;
  queueMax: number; // places to wait in (0: in-thread)
  timeoutMs: number; // 0: in-thread
  checks: number; // verdicts returned since boot
  queueFull: number; // refusals because the queue was full
  timeouts: number; // jobs that passed their deadline, waiting or running
  restarts: number; // workers replaced (crash, out of memory, deadline)
  errors: number; // checks that threw (a bug): the request got a 500
  warmMs: number | null; // the road-cap warm-up of the current worker, ms
  workerHeapLimitMb: number | null; // the heap limit V8 gave the worker, read INSIDE the worker (null until it is ready)
}

export interface Validator {
  readonly kind: "worker" | "in-thread";
  /** The verdict of validateUpload(build, day, rules, opts). Rejects with OverloadError when the check could not be done in time. */
  validate(job: ValidateJob): Promise<Validation>;
  stats(): ValidatorStats;
  /** Reject every waiting and running job with an OverloadError and stop the worker. */
  close(): Promise<void>;
}

/** Today's behaviour: the check runs inline, on the calling thread, before validate() returns its promise. */
export function createInThreadValidator(): Validator {
  let checks = 0, errors = 0;
  return {
    kind: "in-thread",
    async validate(job) {
      try {
        const v = validateUpload(job.build, job.day, job.rules, job.opts);
        checks++;
        return v;
      } catch (e) {
        errors++;
        throw e;
      }
    },
    stats: () => ({
      kind: "in-thread", state: "in-thread", queued: 0, running: 0, queueMax: 0, timeoutMs: 0, checks, queueFull: 0, timeouts: 0, restarts: 0, errors,
      warmMs: null, workerHeapLimitMb: null,
    }),
    close: async () => {},
  };
}

/** Defaults (BRIEF-S2 goal 2, 3). The Retry-After seconds: see RETRY_AFTER_S. */
export const DEFAULT_QUEUE = 16;
export const DEFAULT_TIMEOUT_MS = 10_000;
/** The worker's old-space limit and young-generation cap, MB. Measured (REPORT-S2): a cold day-25 deck check passes with the old space limited to 32 MB
 *  (the lowest the config takes), so 64 leaves it room to spare. The young generation is what makes the check's peak RSS: Node's default cap (48) peaked
 *  at 180 MB, 8 at 134 MB for about 15% more CPU, so 8 is the default that is safe on the 256 MB machine. */
export const DEFAULT_WORKER_HEAP_MB = 64;
export const DEFAULT_WORKER_YOUNG_MB = 8;
/** Seconds a refused upload is told to wait. queue-full: the queue turns over within one deadline at most (every job is dropped or done
 *  10 s after it joins) and in practice within a few seconds (a warm check is 3-10 ms, a cold day-25 one 2-3.5 s), so 5 s; timeout: the
 *  server was 10 s or more behind, a retry at once would join the same backlog, so 30 s; worker-died: a replacement is warm in about 1-2 s
 *  of CPU (longer on a throttled shared CPU), or after its restart backoff, so 10 s. */
export const RETRY_AFTER_S = { full: 5, timeout: 30, died: 10 } as const;

export interface WorkerValidatorOptions {
  /** The worker entry: server/dist/validate-worker.mjs (main.ts), or a test-only .mjs speaking the same messages. */
  script: string | URL;
  /** Places to wait in besides the one running (default 16). */
  maxQueued?: number;
  /** Ms from joining the queue to the deadline (default 10,000). */
  timeoutMs?: number;
  /** resourceLimits.maxOldGenerationSizeMb of the worker. NOTE: a process-wide --max-old-space-size (NODE_OPTIONS) OVERRIDES this in Node 20
   *  and 22 (V8 reads the flag for every isolate), so with the flag set the worker gets the flag's limit; /v1/health reports the real one. */
  heapMb?: number;
  /** resourceLimits.maxYoungGenerationSizeMb (default: Node's own, 48). main.ts passes DEFAULT_WORKER_YOUNG_MB. */
  youngMb?: number;
  /** Extra workerData for a test-only worker script. Production passes none. */
  workerData?: Record<string, unknown>;
  /** Restart backoff: the 1st restart in a row is immediate, the next waits backoffBaseMs, then twice that, up to backoffMaxMs. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Start the worker when the validator is made (default true). main.ts passes false and calls start() once the port is open. */
  autoStart?: boolean;
  retryAfterS?: { full?: number; timeout?: number; died?: number };
  log?: (line: string) => void;
}

export interface WorkerValidator extends Validator {
  /** Spawn the worker (once). validate() calls it too, so a validator is never stuck unstarted. */
  start(): void;
}

interface Job {
  id: number;
  req: ValidateJob;
  resolve: (v: Validation) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createWorkerValidator(o: WorkerValidatorOptions): WorkerValidator {
  const maxQueued = o.maxQueued ?? DEFAULT_QUEUE;
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const heapMb = o.heapMb ?? DEFAULT_WORKER_HEAP_MB;
  const backoffBase = o.backoffBaseMs ?? 250;
  const backoffMax = o.backoffMaxMs ?? 30_000;
  const retry = { full: o.retryAfterS?.full ?? RETRY_AFTER_S.full, timeout: o.retryAfterS?.timeout ?? RETRY_AFTER_S.timeout, died: o.retryAfterS?.died ?? RETRY_AFTER_S.died };
  const log = o.log ?? (() => {});

  const waiting: Job[] = [];
  let running: Job | null = null;
  let worker: Worker | null = null;
  let gen = 0; // bumped whenever a worker is retired: events of an older worker are ignored
  let ready = false;
  let started = false;
  let closed = false;
  let streak = 0; // restarts in a row without a verdict in between
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let nextId = 1;
  let warmMs: number | null = null;
  let workerHeapLimitMb: number | null = null;
  const n = { checks: 0, queueFull: 0, timeouts: 0, restarts: 0, errors: 0 };

  const timeoutError = () => new OverloadError("timeout", `deck check timed out after ${timeoutMs / 1000} s, try again later`, retry.timeout);

  function spawn(): void {
    if (closed) return;
    const mine = ++gen;
    ready = false;
    let w: Worker;
    try {
      w = new Worker(o.script, {
        workerData: { ...o.workerData },
        resourceLimits: { maxOldGenerationSizeMb: heapMb, ...(o.youngMb !== undefined ? { maxYoungGenerationSizeMb: o.youngMb } : {}) },
      });
    } catch (e) {
      log(`deck check worker could not start: ${e instanceof Error ? e.message : String(e)}`);
      retire(mine, "could not start");
      return;
    }
    worker = w;
    w.unref(); // an idle worker never keeps the process alive
    w.on("message", (m: WorkerReply) => {
      if (mine === gen) onMessage(m);
    });
    w.on("error", (e) => {
      // out of memory (ERR_WORKER_OUT_OF_MEMORY), an uncaught error, a missing script: the 'exit' event follows and does the replacing
      if (mine === gen) log(`deck check worker error: ${e.code ? `${e.code}: ` : ""}${e.message}`);
    });
    w.on("exit", (code) => {
      if (mine === gen) retire(mine, `exited with code ${code}`);
    });
  }

  /** The current worker is gone or must go: fail the job it was running, schedule its replacement. */
  function retire(mine: number, why: string): void {
    if (closed || mine !== gen) return;
    gen++;
    ready = false;
    const w = worker;
    worker = null;
    // terminate() on a worker that already exited resolves at once; on one stuck in a synchronous check it stops the JS at the next
    // safe point. The replacement starts only after it, so two workers' heaps never coexist.
    const gone = w ? w.terminate().then(() => 0, () => 0) : Promise.resolve(0);
    if (running) {
      const j = running;
      running = null;
      clearTimeout(j.timer);
      j.reject(new OverloadError("worker-died", "deck check worker restarted, try again shortly", retry.died));
    }
    n.restarts++;
    streak++;
    const delay = streak <= 1 ? 0 : Math.min(backoffMax, backoffBase * 2 ** (streak - 2));
    log(`deck check worker ${why}; replacing it${delay ? ` in ${delay} ms` : " now"} (restart ${n.restarts})`);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      void gone.then(() => spawn());
    }, delay);
  }

  function onMessage(m: WorkerReply): void {
    switch (m.type) {
      case "log":
        log(m.line);
        return;
      case "ready":
        ready = true;
        warmMs = m.warmMs;
        workerHeapLimitMb = m.heapLimitMb;
        log(`deck check worker ready (heap limit ${m.heapLimitMb} MB${m.warmed ? "" : ", not warmed"})`);
        if (m.error) log(`road model warm-up failed (the first deep upload builds it instead): ${m.error}`);
        pump();
        return;
      case "result":
      case "failed": {
        const j = running;
        if (!j || j.id !== m.id) return;
        running = null;
        clearTimeout(j.timer);
        if (m.type === "result") {
          streak = 0;
          n.checks++;
          j.resolve(m.result);
        } else {
          n.errors++;
          j.reject(new Error(m.error));
        }
        pump();
        return;
      }
    }
  }

  /** Send the next waiting job to the worker, if it is ready and idle. */
  function pump(): void {
    if (closed || !ready || running || waiting.length === 0 || !worker) return;
    const j = waiting.shift()!;
    running = j;
    try {
      const msg: WorkerRequest = { type: "job", id: j.id, ...j.req };
      worker.postMessage(msg);
    } catch (e) {
      // not cloneable (a bug upstream): this job fails like a throwing check; the worker is untouched
      running = null;
      clearTimeout(j.timer);
      n.errors++;
      j.reject(e instanceof Error ? e : new Error(String(e)));
      pump();
    }
  }

  function expire(j: Job): void {
    n.timeouts++;
    if (running === j) {
      running = null;
      j.reject(timeoutError());
      retire(gen, `was stopped: a deck check ran past its ${timeoutMs} ms deadline`);
      return;
    }
    const i = waiting.indexOf(j);
    if (i >= 0) waiting.splice(i, 1);
    j.reject(timeoutError());
  }

  function start(): void {
    if (started || closed) return;
    started = true;
    spawn();
  }

  if (o.autoStart !== false) start();

  return {
    kind: "worker",
    start,
    validate(req) {
      if (closed) return Promise.reject(new OverloadError("unavailable", "deck check is shutting down, try again shortly", retry.died));
      start();
      // A job that can start at once takes the running place; otherwise it needs one of the maxQueued waiting places.
      const startsNow = ready && !running && waiting.length === 0;
      if (!startsNow && waiting.length >= maxQueued) {
        n.queueFull++;
        return Promise.reject(new OverloadError("queue-full", `deck check queue is full (${maxQueued} waiting), try again shortly`, retry.full));
      }
      return new Promise<Validation>((resolve, reject) => {
        const job: Job = { id: nextId++, req, resolve, reject, timer: setTimeout(() => expire(job), timeoutMs) };
        waiting.push(job);
        pump();
      });
    },
    stats: () => ({
      kind: "worker",
      state: closed ? "stopped" : ready ? "ready" : worker ? "warming" : started ? "restarting" : "warming",
      queued: waiting.length, running: running ? 1 : 0, queueMax: maxQueued, timeoutMs,
      checks: n.checks, queueFull: n.queueFull, timeouts: n.timeouts, restarts: n.restarts, errors: n.errors, warmMs, workerHeapLimitMb,
    }),
    async close() {
      if (closed) return;
      closed = true;
      if (restartTimer) clearTimeout(restartTimer);
      for (const j of running ? [running, ...waiting] : [...waiting]) {
        clearTimeout(j.timer);
        j.reject(new OverloadError("unavailable", "deck check is shutting down, try again shortly", retry.died));
      }
      running = null;
      waiting.length = 0;
      gen++;
      const w = worker;
      worker = null;
      ready = false;
      if (w) await w.terminate().then(() => 0, () => 0);
    },
  };
}
