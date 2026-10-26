// S4 (BRIEF-S4 goal 3): GET /v1/health/alerts over the REAL server, and `ghost-ops check-health` against a local one.
//   - /v1/health keeps every field it has, in order; the new route answers 200 {"status":"ok"} on an idle server and 503 {"status":"alert","alerts":[{"rule","detail"}]} with the right
//     reasons when the sampled numbers say so, never touches storage, never waits on the deck-check worker, holds no address, key or player id, and answers GET and HEAD only;
//   - the sampler starts with listen() and stops with close();
//   - an honest run (every dusk's upload, profile write and match, through the real deck check) with a sample taken between every step leaves every rule quiet;
//   - check-health prints one OK line, or one ALERT line per alert, and exits 0 / 1 / 2.
// Every server here is on 127.0.0.1; nothing reaches beltbattles.fly.dev.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES_VERSION } from "../src/sim/content";
import { ENDLESS, setEndless } from "../src/sim/endless";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { KEY_HEADER, PROFILE_PREFIX, SIG_HEADER, type Identity } from "../src/net/identity";
import { encodeWire } from "../src/net/profileWire";
import type { GhostSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer, type ServerOptions } from "../server/app";
import { runOps } from "../server/ops";
import { createWorkerValidator, type ValidateJob, type Validator, type ValidatorStats } from "../server/validator";
import type { FakeS3 } from "../tools/fakeS3";
import { playEndless } from "./endless1.honest";
import { jsonlBackend, startFake, tigrisFor, type StoreBackend } from "./netStores";
import { ownedBy, signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { NOW, freshWire } from "./profileupWire";

setPlayerName(TEST_NAME);
const OLD_FIELDS = ["ok", "rules", "store", "ghosts", "uploads", "uptimeS"];

let me: Identity;
let run: GhostSnapshot[];
beforeAll(async () => {
  setEndless(true);
  me = await testIdentity(0);
  const played = playEndless("weaver", 42, me.playerId, { buys: 0, until: 12 });
  run = [...played.runSnaps, ...played.endlessSnaps];
}, 300_000);
afterAll(() => setEndless(ENDLESS));

const apps: GhostServer[] = [];
const backends: StoreBackend[] = [];
const fakes: FakeS3[] = [];
const stubs: Server[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  while (backends.length) await backends.pop()!.teardown();
  while (fakes.length) await fakes.pop()!.close();
  while (stubs.length) await new Promise<void>((r) => { const s = stubs.pop()!; s.close(() => r()); s.closeAllConnections(); });
});

/** A validator whose stats the test sets (the real one's numbers, made up): what /v1/health reports for the worker. */
function stub(): { validator: Validator; stats: ValidatorStats } {
  const stats: ValidatorStats = { kind: "worker", state: "ready", queued: 0, running: 0, queueMax: 16, timeoutMs: 10_000, checks: 0, queueFull: 0, timeouts: 0, restarts: 0, errors: 0, warmMs: 600, workerHeapLimitMb: 108 };
  return { stats, validator: { kind: "worker", validate: async (_job, onCost) => (onCost?.(1), { ok: true, errors: [] }), stats: () => ({ ...stats }), close: async () => {} } };
}
async function boot(opts: Omit<ServerOptions, "store" | "dataDir"> = {}): Promise<{ app: GhostServer; url: string }> {
  const backend = jsonlBackend();
  await backend.setup();
  backends.push(backend);
  const app = backend.server({ uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: () => 0, now: () => NOW, ...opts });
  apps.push(app);
  return { app, url: `http://127.0.0.1:${await app.listen(0)}` };
}
const getJson = async (url: string): Promise<{ status: number; body: Record<string, any>; text: string; headers: Headers }> => {
  const res = await fetch(url);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, any>) : {}, text, headers: res.headers };
};

describe("S4 /v1/health/alerts: the route", () => {
  it("/v1/health keeps every field it had, in order, and Fly's check is still on it; the new route answers 200 {status: ok} on an idle server", async () => {
    const { url } = await boot();
    const h = (await getJson(`${url}/v1/health`)).body;
    expect(Object.keys(h).slice(0, 6)).toEqual(OLD_FIELDS);
    expect(h).toMatchObject({ ok: true, rules: RULES_VERSION, store: "jsonl", uploads: "open" });
    expect(Object.keys(h).slice(6)).toEqual(["validator", "memory", "cache", "limits", "errors"]);
    const a = await getJson(`${url}/v1/health/alerts`);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ status: "ok", alerts: [] });
    expect(typeof a.body.uptimeS).toBe("number");
    expect(a.body.samples).toBeGreaterThanOrEqual(1);
    expect(a.headers.get("content-type")).toContain("application/json");
    expect(a.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 {status: alert, alerts: [{rule, detail}]} with the right reasons when the sampled numbers say so, and 200 again when they stop", async () => {
    const s = stub();
    let now = Date.parse("2026-11-01T00:00:00Z");
    const { app, url } = await boot({ validator: s.validator, alerts: { now: () => now, memMb: 215, cfg: { workerBootGraceS: 0 } } });
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) {
        now += 10_000;
        app.alerts.sampleNow();
      }
    };
    tick(3);
    expect((await getJson(`${url}/v1/health/alerts`)).status).toBe(200);
    s.stats.queued = 12;
    s.stats.state = "restarting";
    s.stats.restarts = 1;
    tick(13);
    const bad = await getJson(`${url}/v1/health/alerts`);
    expect(bad.status).toBe(503);
    expect(bad.body.status).toBe("alert");
    expect(bad.body.alerts.map((x: { rule: string }) => x.rule)).toEqual(["worker-not-ready", "worker-restarts", "queue-depth"]);
    for (const x of bad.body.alerts) {
      expect(Object.keys(x).sort()).toEqual(["detail", "rule"]);
      expect(typeof x.detail).toBe("string");
    }
    expect(bad.text).not.toMatch(/127\.0\.0\.1|localhost/); // no address
    expect(bad.text).not.toContain(me.playerId); // no key, no player id
    s.stats.queued = 0;
    s.stats.state = "ready";
    tick(100); // the restart leaves the 15-minute window, the queue has been empty for 17 minutes
    expect((await getJson(`${url}/v1/health/alerts`)).status).toBe(200);
  });

  it("answers GET and HEAD (the status alone), and 405 to anything else", async () => {
    const s = stub();
    let now = Date.parse("2026-11-01T00:00:00Z");
    const { app, url } = await boot({ validator: s.validator, alerts: { now: () => now, cfg: { workerBootGraceS: 0 } } });
    s.stats.state = "warming";
    for (let i = 0; i < 5; i++) {
      now += 10_000;
      app.alerts.sampleNow();
    }
    const head = await fetch(`${url}/v1/health/alerts`, { method: "HEAD" });
    expect(head.status).toBe(503);
    expect(await head.text()).toBe("");
    expect((await fetch(`${url}/v1/health/alerts`, { method: "POST", body: "x" })).status).toBe(405);
    expect((await fetch(`${url}/v1/health/alerts`, { method: "PUT", body: "x" })).status).toBe(405);
    expect((await fetch(`${url}/v1/health/alerts/extra`)).status).toBe(404);
  });

  it("never touches storage (the Tigris fake never answers, and sees no request) and never waits on the deck-check worker", async () => {
    const fake = await startFake();
    fakes.push(fake);
    fake.hangNext(100);
    const app = createGhostServer({ store: tigrisFor(fake, "bb-test", { bucketCap: 5, cacheMax: 50 }), uploads: "open", log: () => {}, matchSalt: () => 0 });
    apps.push(app);
    const url = `http://127.0.0.1:${await app.listen(0)}`;
    const t0 = Date.now();
    const a = await getJson(`${url}/v1/health/alerts`);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(a.status).toBe(200);
    expect(fake.requests).toHaveLength(0);
    fake.clearFaults();
    // and the worker: it needs 800 ms to say ready; the answer does not wait for it
    const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "s2.fakeworker.mjs");
    const validator = createWorkerValidator({ script: SCRIPT, workerData: { readyDelayMs: 800 } });
    try {
      const { url: url2 } = await boot({ validator });
      const t1 = performance.now();
      const b = await getJson(`${url2}/v1/health/alerts`);
      expect(performance.now() - t1).toBeLessThan(600);
      expect(b.status).toBe(200); // warming at second 0 of a boot is the boot grace, not an alert
    } finally {
      await validator.close();
    }
  });

  it("the sampler starts with listen() and stops with close(); its first sample is taken at once", async () => {
    const backend = jsonlBackend();
    await backend.setup();
    backends.push(backend);
    const app = backend.server({ uploads: "closed", log: () => {} });
    expect(app.alerts.running).toBe(false);
    expect(app.alerts.ring.length).toBe(0);
    await app.listen(0);
    expect(app.alerts.running).toBe(true);
    expect(app.alerts.ring.length).toBe(1);
    await app.close();
    expect(app.alerts.running).toBe(false);
  });

  it("the machine's memory and the thresholds reach the rules: a 215 MB machine with the real process's RSS alerts, the host's total memory does not", async () => {
    let now = Date.parse("2026-11-01T00:00:00Z");
    const tiny = await boot({ alerts: { now: () => now, memMb: 1 } }); // RSS of any Node process is over 80% of 1 MB
    for (let i = 0; i < 7; i++) {
      now += 10_000;
      tiny.app.alerts.sampleNow();
    }
    const a = await getJson(`${tiny.url}/v1/health/alerts`);
    expect(a.status).toBe(503);
    expect(a.body.alerts.map((x: { rule: string }) => x.rule)).toContain("rss-high");
    let now2 = Date.parse("2026-11-01T00:00:00Z");
    const roomy = await boot({ alerts: { now: () => now2 } }); // os.totalmem(): the host's
    for (let i = 0; i < 7; i++) {
      now2 += 10_000;
      roomy.app.alerts.sampleNow();
    }
    expect((await getJson(`${roomy.url}/v1/health/alerts`)).status).toBe(200);
  });
});

describe("S4 /v1/health/alerts: an honest run leaves every rule quiet", () => {
  it("12 dusks, each an upload through the real deck check, a profile write and a match, a sample between every step: never an alert", async () => {
    let now = Date.parse("2026-11-01T00:00:00Z");
    const { app, url } = await boot({ validator: undefined, alerts: { now: () => now, cfg: { workerBootGraceS: 0 } } });
    const seen: string[] = [];
    const sample = async () => {
      now += 30_000; // a dusk every few minutes
      app.alerts.sampleNow();
      const a = await getJson(`${url}/v1/health/alerts`);
      seen.push(`${a.status}`);
      expect(a.body.alerts, JSON.stringify(a.body)).toEqual([]);
    };
    for (const s of run) {
      const body = JSON.stringify(ownedBy({ ...s, runId: `s4-honest-${s.day}` }, me));
      const up = await fetch(`${url}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      expect(up.status).toBe(201);
      await sample();
      const text = encodeWire(freshWire());
      const { key, sig } = await me.sign(new TextEncoder().encode(text), PROFILE_PREFIX);
      const pr = await fetch(`${url}/v1/profile`, { method: "PUT", headers: { "content-type": "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig }, body: text });
      expect(pr.status).toBe(200);
      await sample();
      const m = await fetch(`${url}/v1/ghosts/match?rules=${RULES_VERSION}&day=${s.day}&wins=${s.wins}&lives=${s.lives}&player=${me.playerId}&runs=5`);
      expect([200, 404]).toContain(m.status);
      await sample();
    }
    expect(seen).toHaveLength(run.length * 3);
    expect(new Set(seen)).toEqual(new Set(["200"]));
    const h = (await getJson(`${url}/v1/health`)).body;
    expect(h.limits.total).toBe(0);
    expect(h.validator.queueDepth).toBe(0);
  }, 120_000);
});

describe("S4 ghost-ops check-health", () => {
  const say = (lines: string[]) => (l: string) => lines.push(l);
  async function check(url: string, extra: string[] = []): Promise<{ code: number; lines: string[] }> {
    const lines: string[] = [];
    const code = await runOps(["check-health", url, ...extra], {}, say(lines)); // no bucket settings at all
    return { code, lines };
  }
  async function stubServer(handler: (url: string) => { status: number; body: string } | "hang"): Promise<string> {
    const srv = createServer((req, res) => {
      const r = handler(req.url ?? "");
      if (r === "hang") return;
      res.statusCode = r.status;
      res.setHeader("content-type", "application/json");
      res.end(r.body);
    });
    stubs.push(srv);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", () => resolve()));
    const a = srv.address();
    return `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
  }

  it("a quiet server: one OK line, exit 0", async () => {
    const { url } = await boot();
    const r = await check(url);
    expect(r.code).toBe(0);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatch(/^OK 127\.0\.0\.1:\d+: no alerts \(up \d+ s\)$/);
    expect((await check(`${url}/`)).code).toBe(0); // a trailing slash
  });

  it("a server in trouble: one ALERT line per alert, exit 1", async () => {
    const s = stub();
    let now = Date.parse("2026-11-01T00:00:00Z");
    const { app, url } = await boot({ validator: s.validator, alerts: { now: () => now, cfg: { workerBootGraceS: 0 } } });
    s.stats.state = "warming";
    s.stats.queued = 12;
    for (let i = 0; i < 14; i++) {
      now += 10_000;
      app.alerts.sampleNow();
    }
    const r = await check(url);
    expect(r.code).toBe(1);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatch(/^ALERT 127\.0\.0\.1:\d+ worker-not-ready: the deck-check worker has not been ready for \d+ s/);
    expect(r.lines[1]).toMatch(/^ALERT 127\.0\.0\.1:\d+ queue-depth: the deck-check queue has held over 8 checks for 2 min \(now 12\)$/);
  });

  it("a server that cannot be reached is exit 1 (the monitor's whole point), with a line saying so", async () => {
    const dead = await stubServer(() => ({ status: 200, body: "{}" }));
    await stubs.pop()!.close();
    const r = await check(dead, ["--timeout", "2"]);
    expect(r.code).toBe(1);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatch(/^ALERT 127\.0\.0\.1:\d+: not reachable/);
  });

  it("an answer that is not the alerts' is exit 1 and says what it was; a server that never answers times out", async () => {
    expect((await check(await stubServer(() => ({ status: 404, body: '{"error":"not found"}' })))).lines[0]).toMatch(/unexpected answer HTTP 404 \(a server older than \/v1\/health\/alerts\?\)$/);
    expect((await check(await stubServer(() => ({ status: 200, body: "<html>hello</html>" })))).code).toBe(1);
    expect((await check(await stubServer(() => ({ status: 200, body: '{"status":"alert","alerts":[]}' })))).code).toBe(1);
    const hung = await stubServer(() => "hang");
    const t0 = Date.now();
    const r = await check(hung, ["--timeout", "1"]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toContain("no answer within 1 s");
    expect(Date.now() - t0).toBeLessThan(4000);
  });

  it("alert text from a server is cleaned before it is printed: no control characters, bounded length, one line each", async () => {
    const evil = await stubServer(() => ({ status: 503, body: JSON.stringify({ status: "alert", alerts: [{ rule: "r\nULE", detail: `line one\nline two \u0000 ${"x".repeat(1000)}` }] }) }));
    const r = await check(evil);
    expect(r.code).toBe(1);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).not.toMatch(/[\u0000-\u001f]/);
    expect(r.lines[0].length).toBeLessThan(420);
  });

  it("is exit 2 for a bad URL, a URL with a user name or password, and a scheme that is not http(s); it needs no bucket settings", async () => {
    for (const bad of ["not a url", "ftp://127.0.0.1/", "https://user:pw@127.0.0.1/", "https://user@127.0.0.1/", "file:///etc/passwd"]) {
      const lines: string[] = [];
      expect(await runOps(["check-health", bad], {}, say(lines)), bad).toBe(2);
      expect(lines.join("\n")).not.toContain("pw@");
    }
    expect(await runOps(["check-health"], {}, () => {})).toBe(2);
  });
});
