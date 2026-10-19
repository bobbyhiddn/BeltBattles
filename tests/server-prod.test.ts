import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION } from "../src/sim/content";
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): every heart a run starts with
import { encodeSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { readConfig } from "../server/config";
import { seedStore } from "../server/seed";
import { generateSamplePool } from "./helpers/poolCache";
import type { FakeS3 } from "../tools/fakeS3";
import { snap } from "./netHelpers";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { startFake, storeBackends, tigrisFor } from "./netStores";

// The switches production runs with (fly.toml): the client IP from Fly's proxy, and the game page served from the same
// origin. Uploads here are closed (one test contrasts an open server): the code's default and the rollback's switch.
// fly.toml opens them from the 0.8.0 uploads step (U2) on, as tests/server-config.test.ts pins.

const POOL = generateSamplePool();

async function started(app: GhostServer): Promise<string> {
  return `http://127.0.0.1:${await app.listen(0)}`;
}

describe.each(storeBackends())("uploads closed, $name store", (backend) => {
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "closed", log: () => {}, matchSalt: () => 0 });
    base = await started(app);
  });
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  const post = (body: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/v1/ghosts`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

  it("POST /v1/ghosts answers 403 without reading the body, and stores nothing", async () => {
    const valid = await post(encodeSnapshot(snap()));
    expect(valid.status).toBe(403);
    expect(await valid.json()).toEqual({ error: "uploads are not open yet" });
    expect((await post("{")).status).toBe(403); // not 400: the body was never parsed
    expect((await post(" ".repeat(20_000))).status).toBe(403); // not 413: never read either
    expect(app.store.size).toBe(0);
    expect(backend.storedRecords()).toBe(0);
    expect((await fetch(`${base}/v1/ghosts`)).status).toBe(405); // other methods unchanged
    expect(await (await fetch(`${base}/v1/health`)).json()).toMatchObject({ ok: true, uploads: "closed", ghosts: 0 });
  });

  it("seeding still works, and seeded ghosts are matched", async () => {
    const r = await seedStore(app.store);
    expect(r.written + r.unchanged).toBe(POOL.length); // 0.7.0a D5: the 60-ghost seed pool
    // 0.7.0a D1: a record a player can carry into dusk 2 (won day 1, every life): every seed ghost of day 2 is eligible
    // HULL-ON (the flip, HEARTS): every life is HEARTS_START (10 hearts) under this build's rules (was 5, which left day 2's
    // 1W 10 ghosts ineligible: a better record than 1W 5)
    const m = await fetch(`${base}/v1/ghosts/match?rules=${RULES_VERSION}&day=2&wins=1&lives=${HEARTS_START}&player=closed-check&seen=`);
    expect(m.status).toBe(200);
    expect((await m.json()).snapshot.day).toBe(2);
  });

  it("0.7.0: closed is checked before the signature: a signed upload and a badly signed one are both 403, nothing stored", async () => {
    const size = app.store.size;
    const me = await testIdentity(0);
    const body = encodeSnapshot(ownedBy(snap(), me));
    const signed = await post(body, await signedHeaders(me, body));
    expect(signed.status).toBe(403);
    expect(await signed.json()).toEqual({ error: "uploads are not open yet" });
    expect((await post(body, { "x-bb-key": "not-a-key", "x-bb-sig": "not-a-signature" })).status).toBe(403); // not 401
    expect(app.store.size).toBe(size);
    expect(backend.storedRecords()).toBe(0);
  });
});

describe("rate limit behind Fly's proxy", () => {
  // One request log line: ISO time, method, path, status, duration. Nothing else, no address.
  const REQUEST_LINE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z GET \/v1\/health (200|429) \d+ms$/;
  const health =(base: string, headers: Record<string, string> = {}) => fetch(`${base}/v1/health`, { headers }).then((r) => r.status);
  const A = { "fly-client-ip": "203.0.113.1" };
  const B = { "fly-client-ip": "2001:db8::2" };

  it("with trustProxy fly: two Fly-Client-IP values get separate budgets; X-Forwarded-For is never trusted; else the socket", async () => {
    const logs: string[] = [];
    const fly = createGhostServer({ store: tigrisFor(fakeForLimits), trustProxy: "fly", rateLimit: { windowMs: 60_000, max: 2 }, log: (l) => logs.push(l) });
    const base = await started(fly);
    const a = [await health(base, A), await health(base, A), await health(base, A)];
    const b = [await health(base, B), await health(base, B)];
    // Without Fly-Client-IP the request did not come through Fly's proxy, and the first
    // X-Forwarded-For hop is whatever the client sent: both fall back to the one socket budget.
    const xff1 = { "x-forwarded-for": "198.51.100.7, 10.0.0.1" };
    const xff2 = { "x-forwarded-for": "198.51.100.8" };
    const junk = { "fly-client-ip": "<script>", "x-forwarded-for": "not-an-ip" }; // ignored: falls back to the socket
    const s = [await health(base, xff1), await health(base, junk), await health(base, xff2)];
    await fly.close();
    expect(a).toEqual([200, 200, 429]);
    expect(b).toEqual([200, 200]);
    expect(s).toEqual([200, 200, 429]);
    // The limiter keyed on those addresses, but the request log holds none of them: time, method,
    // path, status and duration only, so no player IP reaches Fly's log stream.
    const lines = logs.filter((l) => l.includes("/v1/health"));
    expect(lines).toHaveLength(8);
    for (const l of lines) expect(l).toMatch(REQUEST_LINE);
    expect(lines.filter((l) => / 429 \d+ms$/.test(l))).toHaveLength(2);
    for (const addr of ["203.0.113.1", "2001:db8::2", "127.0.0.1", "198.51.100.", "<script>", "not-an-ip"]) {
      expect(logs.some((l) => l.includes(addr))).toBe(false);
    }
  });

  it("without the flag both headers are ignored: one socket, one budget, whatever the headers say", async () => {
    const logs: string[] = [];
    const plain = createGhostServer({ store: tigrisFor(fakeForLimits), rateLimit: { windowMs: 60_000, max: 2 }, log: (l) => logs.push(l) });
    const base = await started(plain);
    const codes = [await health(base, A), await health(base, B), await health(base, { "x-forwarded-for": "198.51.100.9" })];
    await plain.close();
    expect(codes).toEqual([200, 200, 429]);
    const lines = logs.filter((l) => l.includes("/v1/health"));
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(l).toMatch(REQUEST_LINE); // no socket address either
    expect(logs.some((l) => /127\.0\.0\.1|203\.0\.113\.1|2001:db8::2|198\.51\.100\.9/.test(l))).toBe(false);
  });
});

describe("the game page from the same origin", () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-static-"));
  const html = "<!doctype html><title>BeltBattles</title><p>Förderband ⚙</p>\n"; // multi-byte: length is bytes
  const bytes = new TextEncoder().encode(html).length;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    writeFileSync(join(dir, "index.html"), html);
    app = createGhostServer({ store: tigrisFor(fakeForLimits), staticDir: dir, log: () => {} });
    base = await started(app);
    writeFileSync(join(dir, "index.html"), "<p>changed after start</p>"); // read once: this is never served
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves index.html at GET / and /index.html with the agreed headers, read once at start", async () => {
    for (const path of ["/", "/index.html"]) {
      const r = await fetch(`${base}${path}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(r.headers.get("cache-control")).toBe("no-cache");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");
      expect(r.headers.get("content-security-policy")).toBeNull(); // no CSP in this pass
      expect(r.headers.get("content-length")).toBe(String(bytes));
      expect(await r.text()).toBe(html);
    }
  });

  it("answers HEAD with the headers and no body, revalidation with 304, other methods with 405, other paths with 404", async () => {
    const head = await fetch(`${base}/`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(bytes));
    expect(head.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await head.text()).toBe("");
    const etag = head.headers.get("etag")!;
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    const again = await fetch(`${base}/`, { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect((await fetch(`${base}/`, { method: "POST", body: "x" })).status).toBe(405);
    for (const path of ["/index.htm", "/game.html", "/favicon.ico", "/public/index.html", "/v1", "/v1/nope"]) {
      expect((await fetch(`${base}${path}`)).status, path).toBe(404);
    }
    expect((await fetch(`${base}/v1/health`)).status).toBe(200);
  });

  it("a missing index.html stops the start with a clear error; without the option / stays 404", async () => {
    const empty = mkdtempSync(join(tmpdir(), "bb-static-empty-"));
    expect(() => createGhostServer({ store: tigrisFor(fakeForLimits), staticDir: empty, log: () => {} }))
      .toThrow(new RegExp(`static page: cannot read ${join(empty, "index.html").replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")} \\(ENOENT\\); BB_GHOST_STATIC must be a directory holding index.html`));
    rmSync(empty, { recursive: true, force: true });
    const plain = createGhostServer({ store: tigrisFor(fakeForLimits), log: () => {} });
    const pb = await started(plain);
    const r = await fetch(`${pb}/`);
    await plain.close();
    expect(r.status).toBe(404);
  });
});

let fakeForLimits: FakeS3;
beforeAll(async () => {
  fakeForLimits = await startFake();
});
afterAll(async () => {
  await fakeForLimits.close();
});

describe("uploads closed on Tigris makes no storage call", () => {
  let fake: FakeS3;
  beforeAll(async () => {
    fake = await startFake();
  });
  afterAll(async () => {
    await fake.close();
  });

  it("answers 403 with no request to the bucket; open (the default) still stores with a 201", async () => {
    const closed = createGhostServer({ store: tigrisFor(fake), uploads: "closed", log: () => {} });
    const base = await started(closed);
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: { "content-type": "application/json" }, body: encodeSnapshot(POOL[0]) });
    await closed.close();
    expect(r.status).toBe(403);
    expect(fake.requests).toHaveLength(0);
    const open = createGhostServer({ store: tigrisFor(fake), log: () => {} });
    const ob = await started(open);
    const me = await testIdentity(0); // open uploads are signed: POOL[0] under the key's playerId
    // HULL-ON (the flip, PICK): the seed step grades every pool ghost (snapshot.grade) and POST refuses a graded upload
    // (422 "grade: only the seed pool's ghosts carry a grade"), so POOL[0] goes up as a player uploads it: ungraded
    const { grade: _grade, ...deck } = POOL[0];
    const body = encodeSnapshot(ownedBy(deck, me));
    const r2 = await fetch(`${ob}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    expect(await (await fetch(`${ob}/v1/health`)).json()).toMatchObject({ uploads: "open" });
    await open.close();
    expect(r2.status).toBe(201);
  });
});

describe("a start without BB_GHOST_UPLOADS refuses uploads", () => {
  let fake: FakeS3;
  beforeAll(async () => {
    fake = await startFake();
  });
  afterAll(async () => {
    await fake.close();
  });

  it("wired as main.ts wires it (readConfig, then createGhostServer with cfg.uploads): health says closed, POST 403, no storage call", async () => {
    const cfg = readConfig([], {}); // an empty environment: the server program's defaults
    const app = createGhostServer({ store: tigrisFor(fake), uploads: cfg.uploads, trustProxy: cfg.trustProxy, log: () => {} });
    const base = await started(app);
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: { "content-type": "application/json" }, body: encodeSnapshot(POOL[0]) });
    const health = await (await fetch(`${base}/v1/health`)).json();
    await app.close();
    expect(cfg.uploads).toBe("closed");
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "uploads are not open yet" });
    expect(health).toMatchObject({ ok: true, uploads: "closed" });
    expect(fake.requests).toHaveLength(0);
  });
});
