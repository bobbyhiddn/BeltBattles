// S2 (BRIEF-S2 step 5): the REAL deck-check worker, on the BUILT bundle. vitest cannot start a worker from a .ts file, so this test builds the server bundle
// (vite.server.config.ts, the same build `npm run build:server` runs, into a temp directory) and then:
//  1. verdict equality: validateUpload's verdict through the real worker (server/validateWorker.ts as bundled, validate-worker.mjs; structured clone both
//     ways) equals the in-thread verdict, field for field, for honest decks and for decks made dishonest in ten ways, under the contexts app.ts passes;
//  2. the built ghost-server.mjs, started as a child process the way the bench drivers start it (uploads open), uses the worker: /v1/health names it,
//     the worker warms itself (warmMs), reports its real heap limit, and a real signed upload is checked in it (201; a re-send 200; a dishonest deck 422
//     with exactly the in-thread errors); with uploads closed it is in-thread and answers 403 as before;
//  3. NODE_OPTIONS=--max-old-space-size is the worker's limit too (Node overrides resourceLimits with the flag), and /v1/health reports the real one.
// The honest snapshots are played through the game's own code (tests/endless1.honest.ts), a lean deck. Nothing here builds the stand-in sample pool.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { ENDLESS, setEndless } from "../src/sim/endless";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import type { Identity } from "../src/net/identity";
import { createWorkerValidator, type ValidateJob, type WorkerValidator } from "../server/validator";
import { signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { playEndless } from "./endless1.honest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
setPlayerName(TEST_NAME);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let outDir: string;
let me: Identity;
let snaps: GhostSnapshot[]; // honest dusks: a weaver run's days 1-10 and a furnace run's days 1-10
let validator: WorkerValidator;
const tmpDirs: string[] = [];

beforeAll(async () => {
  setEndless(true);
  outDir = mkdtempSync(join(tmpdir(), "bb-s2-bundle-"));
  tmpDirs.push(outDir);
  await build({ configFile: join(ROOT, "vite.server.config.ts"), root: ROOT, logLevel: "warn", build: { outDir, emptyOutDir: true } });
  me = await testIdentity(0);
  snaps = [
    ...playEndless("weaver", 42, me.playerId, { buys: 0, until: 10 }).runSnaps,
    ...playEndless("furnace", 7, me.playerId, { buys: 0, until: 10 }).runSnaps,
  ];
  validator = createWorkerValidator({ script: join(outDir, "validate-worker.mjs") });
}, 300_000);
afterAll(async () => {
  setEndless(ENDLESS);
  await validator?.close();
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

/** app.ts's own arguments for the deck check of a snapshot. */
const jobOf = (s: GhostSnapshot): ValidateJob => ({
  build: s.build, day: s.day, rules: s.rules,
  opts: { seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}), ...(s.road ? { road: s.road } : {}), ...(s.firstRun ? { firstRun: true } : {}) },
});

type Make = (s: GhostSnapshot) => GhostSnapshot;
const withItems = (s: GhostSnapshot, f: (items: GhostSnapshot["build"]["items"]) => GhostSnapshot["build"]["items"]): GhostSnapshot => ({ ...s, build: { ...s.build, items: f(s.build.items) } });
const DISHONEST: Record<string, Make> = {
  doubledRig: (s) => withItems(s, (items) => [...items, { ...items[0], uid: Math.max(...items.map((i) => i.uid)) + 1 }]),
  offGrid: (s) => withItems(s, (items) => items.map((it, i) => (i === 0 ? { ...it, x: 99 } : it))),
  unknownItem: (s) => withItems(s, (items) => items.map((it, i) => (i === 0 ? { ...it, def: "no_such_item" } : it))),
  noRunes: (s) => ({ ...s, build: { ...s.build, runes: [] } }),
  badRune: (s) => ({ ...s, build: { ...s.build, runes: [{ id: "no_such_rune" }, ...(s.build.runes ?? []).slice(1)] } }),
  wrongSeed: (s) => ({ ...s, seed: (s.seed ?? 0) + 1 }),
  hugeHull: (s) => ({ ...s, build: { ...s.build, hullBonus: 99_999 } }),
  hugeBelt: (s) => ({ ...s, build: { ...s.build, beltCap: 9_999 } }),
  foreignRules: (s) => ({ ...s, rules: "bb-0.1.0" }),
  noRoutes: (s) => ({ ...s, build: { ...s.build, routes: [] } }),
};

type Outcome = { verdict: unknown } | { threw: string };
const direct = (j: ValidateJob): Outcome => {
  try {
    return { verdict: validateUpload(j.build, j.day, j.rules, j.opts) };
  } catch (e) {
    return { threw: e instanceof Error ? e.message : String(e) };
  }
};
const viaWorker = async (j: ValidateJob): Promise<Outcome> => {
  try {
    return { verdict: await validator.validate(j) };
  } catch (e) {
    return { threw: e instanceof Error ? e.message : String(e) };
  }
};

describe("S2: the built bundle holds the worker script", () => {
  it("server/dist gets validate-worker.mjs beside ghost-server.mjs", () => {
    const files = readdirSync(outDir);
    expect(files).toContain("ghost-server.mjs");
    expect(files).toContain("validate-worker.mjs");
    expect(existsSync(join(outDir, "ghost-admin.mjs"))).toBe(true); // the other entries are as before
  });
});

describe("S2: the real worker's verdicts equal the in-thread verdicts, field for field", () => {
  it("honest decks (two heroes, days 1-10): the same {ok: true, errors: []}", async () => {
    expect(snaps.length).toBeGreaterThanOrEqual(20);
    for (const s of snaps) {
      const j = jobOf(s);
      const a = direct(j);
      const b = await viaWorker(j);
      expect(b, `${s.hero} day ${s.day}`).toStrictEqual(a);
      expect(a).toEqual({ verdict: { ok: true, errors: [] } }); // and they ARE honest: the worker did not just agree on a refusal
    }
  }, 120_000);

  it("dishonest decks (ten ways, on days 3, 6 and 10 of both heroes): the same errors, in the same order, word for word; the ones that throw throw in both", async () => {
    let refused = 0, threw = 0;
    const seen = new Set<string>();
    for (const day of [3, 6, 10]) {
      for (const hero of ["weaver", "furnace"]) {
        const base = snaps.find((s) => s.day === day && s.hero === hero)!;
        for (const [name, make] of Object.entries(DISHONEST)) {
          const j = jobOf(make(base));
          const a = direct(j);
          const b = await viaWorker(j);
          if ("threw" in a) {
            threw++;
            expect("threw" in b, `${name} ${hero} ${day}: threw in-thread, so it must in the worker`).toBe(true);
            expect((b as { threw: string }).threw).toContain(a.threw);
          } else {
            expect(b, `${name} ${hero} ${day}`).toStrictEqual(a);
            if (!(a.verdict as { ok: boolean }).ok) refused++;
            for (const e of (a.verdict as { errors: string[] }).errors) seen.add(e.split(":")[0]);
          }
        }
      }
    }
    expect(refused).toBeGreaterThanOrEqual(40); // most of the 60 dishonest decks were refused with errors, and the worker gave the same ones (a few of the ten
    expect(refused + threw).toBeGreaterThanOrEqual(45); // ways are no fault on some days: those are accepted, in both, and compared too)
    expect(seen.size).toBeGreaterThanOrEqual(3); // in at least three categories (rules, budget, runes, ...)
    expect(validator.stats()).toMatchObject({ kind: "worker", restarts: 0, timeouts: 0 }); // the worker lived through all of it (a throw is reported, not fatal)
  }, 180_000);
});

interface Server { child: ChildProcess; base: string; logs: () => string }
const children: ChildProcess[] = [];
async function startBundle(env: Record<string, string>): Promise<Server> {
  const data = mkdtempSync(join(tmpdir(), "bb-s2-data-"));
  tmpDirs.push(data);
  const child = spawn(process.execPath, [join(outDir, "ghost-server.mjs"), "serve", "--port", "0", "--host", "127.0.0.1", "--data", data, "--rate", "1000000", "--origins", "http://bench.local"], {
    env: { ...process.env, BB_GHOST_STORE: "jsonl", BB_GHOST_UPLOADS: "open", ...env },
  });
  children.push(child);
  let text = "";
  const dec = new TextDecoder();
  child.stdout!.on("data", (c) => { text += dec.decode(c); });
  child.stderr!.on("data", (c) => { text += dec.decode(c); });
  for (let i = 0; i < 2000; i++) {
    const m = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(text);
    if (m) return { child, base: `http://127.0.0.1:${m[1]}`, logs: () => text };
    await sleep(10);
  }
  throw new Error(`the bundle did not start:\n${text}`);
}
afterAll(() => {
  for (const c of children) c.kill("SIGTERM");
});
const getHealth = async (s: Server): Promise<Record<string, any>> => (await fetch(`${s.base}/v1/health`)).json() as Promise<Record<string, any>>;
async function warmed(s: Server): Promise<Record<string, any>> {
  for (let i = 0; i < 3000; i++) {
    const h = await getHealth(s);
    if (h.validator.state === "ready") return h;
    await sleep(20);
  }
  throw new Error(`the worker never became ready:\n${s.logs()}`);
}
async function postTo(s: Server, snap: GhostSnapshot): Promise<{ status: number; body: Record<string, any> }> {
  const body = JSON.stringify(snap);
  const r = await fetch(`${s.base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
  return { status: r.status, body: (await r.json()) as Record<string, any> };
}

describe("S2: the built ghost-server.mjs checks decks in the worker", () => {
  it("uploads open: /v1/health names the worker, which warmed itself and reports its heap limit; a real signed upload is checked in it", async () => {
    const s = await startBundle({});
    const h = await warmed(s);
    expect(h).toMatchObject({ ok: true, store: "jsonl", uploads: "open", validator: { kind: "worker", state: "ready", queueDepth: 0, running: 0, queueMax: 16, timeoutMs: 10_000, checks: 0, restarts: 0 } });
    expect(h.validator.warmMs).toBeGreaterThan(0); // warmRoadCap ran INSIDE the worker
    expect(h.memory.workerHeapLimitMb).toBeGreaterThanOrEqual(64); // the default 64 MB old space plus the 8 MB young generation: V8's heap_size_limit
    expect(h.memory.workerHeapLimitMb).toBeLessThanOrEqual(64 + 32);
    expect(h.memory.rssMb).toBeGreaterThan(30);
    expect(s.logs()).toMatch(/road model warmed for days 1-25 under rules bb-[\d.]+ in \d+ ms/); // the worker's log line, through the main thread
    expect(s.logs()).toMatch(/deck check worker ready \(heap limit \d+ MB\)/);
    // a real signed upload: checked in the worker, stored, a re-send is 200
    const honest = snaps.find((x) => x.day === 10 && x.hero === "weaver")!;
    const first = await postTo(s, honest);
    expect([first.status, first.body]).toEqual([201, { id: ghostId(honest) }]);
    expect((await postTo(s, honest)).status).toBe(200);
    // a dishonest deck: 422 with exactly the errors the in-thread check gives
    const bad = DISHONEST.doubledRig(snaps.find((x) => x.day === 6 && x.hero === "furnace")!);
    const expected = validateUpload(bad.build, bad.day, bad.rules, jobOf(bad).opts);
    expect(expected.ok).toBe(false);
    const refused = await postTo(s, bad);
    expect([refused.status, refused.body]).toEqual([422, { error: "deck failed validation", errors: expected.errors }]);
    const after = await getHealth(s);
    expect(after.validator).toMatchObject({ state: "ready", checks: 3, queueFull: 0, timeouts: 0, restarts: 0, errors: 0 }); // the honest upload twice, and the dishonest one
    s.child.kill("SIGTERM");
  }, 120_000);

  it("uploads closed (the code's default): no worker is started, health says in-thread, a POST is 403 as before", async () => {
    const s = await startBundle({ BB_GHOST_UPLOADS: "closed" });
    const h = await getHealth(s);
    expect(h).toMatchObject({ ok: true, uploads: "closed", validator: { kind: "in-thread", state: "in-thread", checks: 0 } });
    expect(h.memory.workerHeapLimitMb).toBeNull();
    expect((await postTo(s, snaps[0])).status).toBe(403);
    expect(s.logs()).not.toMatch(/deck check worker/);
    s.child.kill("SIGTERM");
  }, 60_000);

  it("BB_GHOST_VALIDATE_HEAP_MB sets the worker's heap limit; a NODE_OPTIONS --max-old-space-size overrides it (it is every thread's limit), and /v1/health tells the truth", async () => {
    const own = await startBundle({ BB_GHOST_VALIDATE_HEAP_MB: "72" });
    const h1 = await warmed(own);
    expect(h1.memory.workerHeapLimitMb).toBeGreaterThanOrEqual(72);
    expect(h1.memory.workerHeapLimitMb).toBeLessThanOrEqual(72 + 64); // 72 MB of old space plus the young generation
    expect(h1.memory.heapLimitMb).toBeGreaterThan(h1.memory.workerHeapLimitMb); // the main thread has V8's own (larger) default here
    own.child.kill("SIGTERM");
    const flagged = await startBundle({ BB_GHOST_VALIDATE_HEAP_MB: "400", NODE_OPTIONS: "--max-old-space-size=80" });
    const h2 = await warmed(flagged);
    // the flag won over the setting for the OLD space: 80 MB, the main thread's; the young generation is still the worker's own cap (8 MB), which no flag was given for
    expect(h2.memory.workerHeapLimitMb).toBeGreaterThanOrEqual(80);
    expect(h2.memory.workerHeapLimitMb).toBeLessThanOrEqual(80 + 8 + 4);
    expect(h2.memory.heapLimitMb).toBeGreaterThanOrEqual(80); // and the main thread has the same 80 MB of old space (plus Node's own young generation)
    expect(h2.memory.heapLimitMb).toBeLessThan(200);
    flagged.child.kill("SIGTERM");
  }, 120_000);
});
