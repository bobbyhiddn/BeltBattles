// S2 (BRIEF-S2 steps 3 and 5): server/validator.ts, the deck check's queue, deadline and respawn rules, tested on a TEST-ONLY worker script
// (tests/s2.fakeworker.mjs) that can be told to sleep or crash. The real worker (server/validateWorker.ts) is tested in tests/s2.bundle.test.ts, on the
// built bundle. Nothing here builds the stand-in sample pool.
import { afterEach, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startingBuild } from "../src/sim/ai";
import { RULES_VERSION } from "../src/sim/content";
import { validateUpload } from "../src/net/validate";
import { OverloadError, RETRY_AFTER_S, createInThreadValidator, createWorkerValidator, type ValidateJob, type Validator, type WorkerValidatorOptions } from "../server/validator";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "s2.fakeworker.mjs");

/** A job whose "build" is only the fake worker's directive (the validator never looks inside a job). */
const job = (fake: Record<string, unknown> = {}): ValidateJob => ({ build: { fake } as unknown as ValidateJob["build"], day: 1, rules: "bb-test", opts: {} });
const tidOf = (r: unknown): number => (r as { tid: number }).tid;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const settle = async <T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> => p.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
async function until(cond: () => boolean, what: string, ms = 8000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

const made: Validator[] = [];
function make(over: Partial<WorkerValidatorOptions> = {}): ReturnType<typeof createWorkerValidator> {
  const v = createWorkerValidator({ script: SCRIPT, ...over });
  made.push(v);
  return v;
}
afterEach(async () => {
  while (made.length) await made.pop()!.close();
});

describe("S2 validator: the worker runs the check, the queue is bounded", () => {
  it("answers a job with the worker's verdict, off this thread, and counts it", async () => {
    const v = make();
    const r = (await v.validate(job())) as unknown as { ok: boolean; errors: string[]; tid: number };
    expect(r).toMatchObject({ ok: true, errors: [] });
    expect(r.tid).toBeGreaterThan(0); // a worker thread's id (the main thread is 0)
    const bad = await v.validate(job({ verdict: "bad" }));
    expect(bad).toMatchObject({ ok: false, errors: ["fake: refused"] });
    expect(v.stats()).toMatchObject({ kind: "worker", state: "ready", queued: 0, running: 0, queueMax: 16, timeoutMs: 10_000, checks: 2, queueFull: 0, timeouts: 0, restarts: 0, errors: 0, workerHeapLimitMb: 1 });
  });

  it("the defaults are the brief's: 16 waiting, a 10 s deadline, Retry-After 5 / 30 / 10", () => {
    const v = make({ autoStart: false });
    expect(v.stats()).toMatchObject({ queueMax: 16, timeoutMs: 10_000 });
    expect(RETRY_AFTER_S).toEqual({ full: 5, timeout: 30, died: 10 });
  });

  it("at most 1 running and 16 waiting: the 18th is refused at once (queue-full, Retry-After 5), the 17 go on, the queue drains and takes new work", async () => {
    const v = make();
    await v.validate(job()); // the worker is warm and ready
    const slow = job({ sleepMs: 60 });
    const accepted = Array.from({ length: 17 }, () => settle(v.validate(slow)));
    expect(v.stats()).toMatchObject({ queued: 16, running: 1 });
    const refused = await settle(v.validate(job()));
    expect(refused.ok).toBe(false);
    const err = (refused as { error: unknown }).error as OverloadError;
    expect(err).toBeInstanceOf(OverloadError);
    expect([err.kind, err.retryAfterS]).toEqual(["queue-full", 5]);
    expect(err.message).toMatch(/queue is full \(16 waiting\)/);
    expect(v.stats()).toMatchObject({ queued: 16, running: 1, queueFull: 1 });
    const done = await Promise.all(accepted);
    expect(done.every((d) => d.ok)).toBe(true); // all 17 were checked, in turn
    expect(v.stats()).toMatchObject({ queued: 0, running: 0, queueFull: 1, checks: 1 + 17 });
    expect((await v.validate(job())).ok).toBe(true); // and it takes new work
    expect(v.stats().checks).toBe(19);
  }, 30_000);

  it("while the worker is still warming, up to 16 jobs wait and the 17th is refused; they run once it is ready", async () => {
    const v = make({ workerData: { readyDelayMs: 400 } });
    expect(v.stats().state).toBe("warming");
    const waiting = Array.from({ length: 16 }, () => settle(v.validate(job())));
    const refused = await settle(v.validate(job()));
    expect(refused.ok).toBe(false);
    expect(((refused as { error: unknown }).error as OverloadError).kind).toBe("queue-full");
    expect(v.stats()).toMatchObject({ state: "warming", queued: 16, running: 0, queueFull: 1 });
    expect((await Promise.all(waiting)).every((d) => d.ok)).toBe(true);
    expect(v.stats()).toMatchObject({ state: "ready", queued: 0, checks: 16 });
  }, 30_000);

  it("a job that cannot be cloned fails alone: the worker is untouched and the next job runs on the same thread", async () => {
    const v = make();
    const first = (await v.validate(job())) as unknown as { tid: number };
    const bad = await settle(v.validate({ ...job(), opts: { notPlain: () => 1 } as unknown as ValidateJob["opts"] }));
    expect(bad.ok).toBe(false);
    expect(((bad as { error: unknown }).error as Error).name).toBe("DataCloneError");
    expect(v.stats()).toMatchObject({ errors: 1, restarts: 0, queued: 0, running: 0 });
    const next = (await v.validate(job())) as unknown as { tid: number };
    expect(next.tid).toBe(first.tid);
  });

  it("a check that throws rejects with that error (not an overload), the worker stays up", async () => {
    const v = make();
    const first = (await v.validate(job())) as unknown as { tid: number };
    const r = await settle(v.validate(job({ fail: "boom: a bug in the check" })));
    expect(r.ok).toBe(false);
    const err = (r as { error: unknown }).error;
    expect(err).not.toBeInstanceOf(OverloadError);
    expect((err as Error).message).toBe("boom: a bug in the check");
    expect(v.stats()).toMatchObject({ errors: 1, restarts: 0 });
    expect(((await v.validate(job())) as unknown as { tid: number }).tid).toBe(first.tid);
  });
});

describe("S2 validator: the deadline counts from joining the queue", () => {
  it("a job still waiting at its deadline is dropped (timeout, Retry-After 30); the worker is not touched", async () => {
    const v = make({ timeoutMs: 150, workerData: { readyDelayMs: 600 } });
    const r = await settle(v.validate(job())); // joins while the worker warms; its deadline passes before the worker is ready
    expect(r.ok).toBe(false);
    const err = (r as { error: unknown }).error as OverloadError;
    expect([err.kind, err.retryAfterS]).toEqual(["timeout", 30]);
    expect(err.message).toMatch(/timed out after 0\.15 s/);
    expect(v.stats()).toMatchObject({ queued: 0, running: 0, timeouts: 1, restarts: 0, state: "warming" });
    await until(() => v.stats().state === "ready", "the worker's ready");
    expect(v.stats().restarts).toBe(0); // the same worker
    expect((await v.validate(job())).ok).toBe(true); // and a job within its deadline is checked
  }, 20_000);

  it("a job still running at its deadline has its worker terminated; a fresh worker starts and the queue goes on on it", async () => {
    const v = make({ timeoutMs: 600 });
    const before = (await v.validate(job())) as unknown as { tid: number };
    const stuck = settle(v.validate(job({ crash: "spin" }))); // never answers: only terminate() stops it
    await sleep(300);
    const behind = settle(v.validate(job())); // joins 300 ms later, so its own deadline (900 ms) is after the stuck one's (600 ms)
    const s = await stuck;
    expect(s.ok).toBe(false);
    const err = (s as { error: unknown }).error as OverloadError;
    expect([err.kind, err.retryAfterS]).toEqual(["timeout", 30]);
    expect(v.stats()).toMatchObject({ timeouts: 1, restarts: 1 });
    const after = await behind; // the waiting job ran on the replacement
    expect(after.ok).toBe(true);
    expect(tidOf((after as { value: unknown }).value)).not.toBe(before.tid);
    expect(v.stats()).toMatchObject({ state: "ready", timeouts: 1, restarts: 1, queued: 0, running: 0 });
  }, 20_000);
});

describe("S2 validator: a worker that dies is replaced", () => {
  it.each([["exit"], ["throw"], ["oom"]] as const)("a worker that %s: its job gets worker-died (Retry-After 10), the waiting job goes on to the new worker, the counters show it", async (crash) => {
    const v = make({ heapMb: crash === "oom" ? 32 : undefined });
    const before = (await v.validate(job())) as unknown as { tid: number };
    const dying = settle(v.validate(job({ crash })));
    const waiting = settle(v.validate(job())); // joined behind the dying one
    const d = await dying;
    expect(d.ok).toBe(false);
    const err = (d as { error: unknown }).error as OverloadError;
    expect(err).toBeInstanceOf(OverloadError);
    expect([err.kind, err.retryAfterS]).toEqual(["worker-died", 10]);
    const w = await waiting;
    expect(w.ok).toBe(true);
    expect(tidOf((w as { value: unknown }).value)).not.toBe(before.tid);
    expect(v.stats()).toMatchObject({ restarts: 1, timeouts: 0, state: "ready", queued: 0, running: 0 });
  }, 30_000);

  it("restarts back off: the 1st is immediate, then 100, 200, 400 ms; a crash loop cannot spin", async () => {
    const lines: string[] = [];
    const v = make({ workerData: { crashOnStart: true }, backoffBaseMs: 100, backoffMaxMs: 400, log: (l) => lines.push(l) });
    await until(() => lines.filter((l) => /replacing it/.test(l)).length >= 5, "five restarts", 6000);
    const delays = lines.filter((l) => /replacing it/.test(l)).map((l) => (/in (\d+) ms/.exec(l) ? Number(/in (\d+) ms/.exec(l)![1]) : 0));
    expect(delays.slice(0, 5)).toEqual([0, 100, 200, 400, 400]); // doubling to the cap
    expect(v.stats().restarts).toBeGreaterThanOrEqual(5);
    expect(v.stats().restarts).toBeLessThan(12); // 1.1 s of waiting in all so far: nowhere near a tight loop
  }, 20_000);

  it("a verdict resets the backoff: after a good check the next crash is replaced at once again", async () => {
    const lines: string[] = [];
    const v = make({ backoffBaseMs: 300, log: (l) => lines.push(l) });
    await settle(v.validate(job({ crash: "exit" }))); // restart 1: now
    await settle(v.validate(job({ crash: "exit" }))); // restart 2 (no verdict in between): waits 300 ms
    expect((await v.validate(job())).ok).toBe(true); // a verdict: the streak is over
    await settle(v.validate(job({ crash: "exit" }))); // restart 3: now, again
    const delays = lines.filter((l) => /replacing it/.test(l)).map((l) => (/in (\d+) ms/.exec(l) ? Number(/in (\d+) ms/.exec(l)![1]) : 0));
    expect(delays).toEqual([0, 300, 0]);
  }, 30_000);

  it("a script that does not exist is a worker that dies: jobs wait, then get their deadline's 503; no crash of this process", async () => {
    const v = make({ script: join(dirname(SCRIPT), "no-such-worker.mjs"), timeoutMs: 400 });
    const r = await settle(v.validate(job()));
    expect(r.ok).toBe(false);
    expect(((r as { error: unknown }).error as OverloadError).kind).toBe("timeout");
    expect(v.stats().restarts).toBeGreaterThanOrEqual(1);
  }, 20_000);
});

describe("S2 validator: close, and the in-thread validator", () => {
  it("close() rejects waiting and running jobs (unavailable), stops the worker, and refuses new work", async () => {
    const v = make({ workerData: { all: { sleepMs: 300 } } });
    await v.validate(job({ sleepMs: 0 }));
    const running = settle(v.validate(job()));
    const waiting = settle(v.validate(job()));
    await sleep(50);
    await v.close();
    for (const p of [running, waiting]) {
      const r = await p;
      expect(r.ok).toBe(false);
      expect(((r as { error: unknown }).error as OverloadError).kind).toBe("unavailable");
    }
    const later = await settle(v.validate(job()));
    expect(((later as { error: unknown }).error as OverloadError).kind).toBe("unavailable");
    expect(v.stats().state).toBe("stopped");
  }, 20_000);

  it("the in-thread validator is today's behaviour: validateUpload runs inline and its verdict is returned unchanged", async () => {
    const v = createInThreadValidator();
    expect(v.stats()).toMatchObject({ kind: "in-thread", state: "in-thread", queued: 0, running: 0, checks: 0 });
    // the starting deck has no dawn rune, which validateUpload refuses with its own words; the validator returns exactly its verdict
    const build = startingBuild("furnace", 1);
    const verdict = await v.validate({ build, day: 1, rules: RULES_VERSION, opts: {} });
    expect(verdict).toEqual(validateUpload(build, 1, RULES_VERSION, {}));
    expect(verdict.ok).toBe(false);
    expect(v.stats().checks).toBe(1);
  });
});
