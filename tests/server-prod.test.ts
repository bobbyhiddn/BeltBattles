import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION } from "../src/sim/content";
import { encodeSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { seedStore } from "../server/seed";
import { generateSamplePool } from "../tools/samplePool";
import type { FakeS3 } from "../tools/fakeS3";
import { snap } from "./netHelpers";
import { startFake, storeBackends, tigrisFor } from "./netStores";

// The switches production runs with (fly.toml): uploads closed, the client IP from Fly's proxy,
// and the game page served from the same origin.

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
    expect(r.written + r.unchanged).toBe(40);
    const m = await fetch(`${base}/v1/ghosts/match?rules=${RULES_VERSION}&day=2&wins=0&lives=3&player=closed-check&seen=`);
    expect(m.status).toBe(200);
    expect((await m.json()).snapshot.day).toBe(2);
  });
});

describe("rate limit behind Fly's proxy", () => {
  const health = (base: string, headers: Record<string, string> = {}) => fetch(`${base}/v1/health`, { headers }).then((r) => r.status);
  const A = { "fly-client-ip": "203.0.113.1" };
  const B = { "fly-client-ip": "2001:db8::2" };

  it("with trustProxy fly: two Fly-Client-IP values get separate budgets; then the first X-Forwarded-For hop; then the socket", async () => {
    const logs: string[] = [];
    const fly = createGhostServer({ store: tigrisFor(fakeForLimits), trustProxy: "fly", rateLimit: { windowMs: 60_000, max: 2 }, log: (l) => logs.push(l) });
    const base = await started(fly);
    const a = [await health(base, A), await health(base, A), await health(base, A)];
    const b = [await health(base, B), await health(base, B)];
    const xff = { "x-forwarded-for": "198.51.100.7, 10.0.0.1" };
    const x = [await health(base, xff), await health(base, xff), await health(base, xff)];
    const junk = { "fly-client-ip": "<script>", "x-forwarded-for": "not-an-ip" }; // ignored: falls back to the socket
    const s = [await health(base), await health(base, junk), await health(base)];
    await fly.close();
    expect(a).toEqual([200, 200, 429]);
    expect(b).toEqual([200, 200]);
    expect(x).toEqual([200, 200, 429]);
    expect(s).toEqual([200, 200, 429]);
    const lines = logs.filter((l) => l.includes("/v1/health"));
    expect(lines.filter((l) => l.includes(" 203.0.113.1 GET /v1/health "))).toHaveLength(3); // the log uses the same address
    expect(lines.filter((l) => l.includes(" 2001:db8::2 GET /v1/health "))).toHaveLength(2);
    expect(lines.filter((l) => l.includes(" 198.51.100.7 GET /v1/health "))).toHaveLength(3);
    expect(lines.some((l) => l.includes("<script>") || l.includes("not-an-ip"))).toBe(false);
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
    for (const l of lines) expect(l).toMatch(/Z (127\.0\.0\.1|::ffff:127\.0\.0\.1) GET \/v1\/health /);
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
    const r2 = await fetch(`${ob}/v1/ghosts`, { method: "POST", headers: { "content-type": "application/json" }, body: encodeSnapshot(POOL[0]) });
    expect(await (await fetch(`${ob}/v1/health`)).json()).toMatchObject({ uploads: "open" });
    await open.close();
    expect(r2.status).toBe(201);
  });
});
