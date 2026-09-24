import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION } from "../src/sim/content";
import { fetchGhost, submitGhost, type GhostRequest } from "../src/net/ghostClient";
import { encodeSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { generateSamplePool } from "../tools/samplePool";
import { snap } from "./netHelpers";
import { storeBackends } from "./netStores";

const SHORE = "http://127.0.0.1:7778";
const TWENTY = generateSamplePool().filter((s) => s.day <= 5); // 2 heroes x 2 variants x days 1-5

function req(over: Partial<GhostRequest> = {}): GhostRequest {
  return { rules: RULES_VERSION, day: 1, wins: 0, lives: 3, playerId: "me", seen: [], hero: "furnace", seed: 7, ...over };
}

// The server suite runs once per store: the JSON-lines file, and Tigris on the in-process fake S3.
describe.each(storeBackends())("ghost server (in-process, port 0), $name store", (backend) => {
let app: GhostServer;
let base: string;
const ids = new Map<string, GhostSnapshot>();

async function post(body: string, url = `${base}/v1/ghosts`) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
  return { status: r.status, body: await r.json() };
}

beforeAll(async () => {
  await backend.setup();
  app = backend.server({ origins: [SHORE], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});

afterAll(async () => {
  await app.close();
  await backend.teardown();
});

  it("reports health", async () => {
    const r = await fetch(`${base}/v1/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, rules: RULES_VERSION, ghosts: 0 });
  });

  it("stores 20 submitted ghosts, idempotently", async () => {
    expect(TWENTY).toHaveLength(20);
    for (const s of TWENTY) {
      const res = await submitGhost(base, s, 3000);
      expect(res.ok).toBe(true);
      if (res.ok) ids.set(res.id, s);
    }
    expect(ids.size).toBe(20);
    expect(app.store.size).toBe(20);
    const again = await submitGhost(base, TWENTY[0], 3000);
    expect(again).toEqual({ ok: true, id: [...ids.keys()][0] });
    expect(app.store.size).toBe(20);
    expect(backend.storedRecords()).toBe(20); // ghosts.jsonl lines, or player objects in the bucket
  });

  it("matches same rules and day, never your own ghost, never a seen one, then falls back", async () => {
    for (let day = 1; day <= 5; day++) {
      const me = "sample-furnace-0"; // owns one of the 4 ghosts stored for each day
      const seen: string[] = [];
      for (;;) {
        const g = await fetchGhost(base, req({ day, playerId: me, seen: [...seen] }), 3000);
        if (g.source === "fallback") {
          expect(g.error).toMatch(/no ghost/);
          expect(g.id).toBe(`offline-weaver-d${day}`);
          break;
        }
        expect(ids.has(g.id)).toBe(true);
        expect(g.snapshot).toEqual(ids.get(g.id));
        expect(g.snapshot.day).toBe(day);
        expect(g.snapshot.playerId).not.toBe(me);
        expect(seen).not.toContain(g.id);
        seen.push(g.id);
      }
      expect(seen).toHaveLength(3);
    }
    const r = await fetch(`${base}/v1/ghosts/match?rules=bb-0.1.0&day=1&wins=0&lives=3&player=me&seen=`);
    expect(r.status).toBe(404);
  });

  it("returns the nearest record first", async () => {
    const pool = TWENTY.filter((s) => s.day === 5);
    const target = pool[2];
    const g = await fetchGhost(base, req({ day: 5, wins: target.wins, lives: target.lives, playerId: "nobody" }), 3000);
    expect(g.source).toBe("server");
    const d = (s: GhostSnapshot) => Math.abs(s.wins - target.wins) * 100 + Math.abs(s.lives - target.lives);
    expect(d(g.snapshot)).toBe(Math.min(...pool.map(d)));
  });

  it("rejects a bad deck, foreign rules, malformed JSON, oversize bodies and bad queries", async () => {
    const s = snap();
    const loom = { ...s, build: { ...s.build, items: [...s.build.items, { uid: 2, def: "loom", x: 0, y: 8 }] } };
    const bad = await post(JSON.stringify(loom));
    expect(bad.status).toBe(422);
    expect(bad.body.errors.join()).toMatch(/signature factory/);
    const rich = await post(JSON.stringify({ ...s, build: { ...s.build, hullBonus: 500 } }));
    expect(rich.status).toBe(422);
    expect(rich.body.errors.join()).toMatch(/budget/);
    expect((await post(encodeSnapshot({ ...s, rules: "bb-0.3.0" }))).status).toBe(422);
    expect((await post("{")).status).toBe(400);
    expect((await post(JSON.stringify({ ...s, extra: 1 }))).status).toBe(400);
    expect((await post(" ".repeat(20_000))).status).toBe(413);
    expect(app.store.size).toBe(20);
    expect((await fetch(`${base}/v1/ghosts`)).status).toBe(405);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(`${base}/v1/ghosts/match?rules=${RULES_VERSION}&day=11&wins=0&lives=3&player=me`)).status).toBe(400);
    expect((await fetch(`${base}/v1/ghosts/match?rules=${RULES_VERSION}&day=1&wins=0&lives=3&player=a@b.c`)).status).toBe(400);
  });

  it("sends CORS headers only to configured origins", async () => {
    const pre = await fetch(`${base}/v1/ghosts`, { method: "OPTIONS", headers: { origin: SHORE } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(SHORE);
    const evil = await fetch(`${base}/v1/ghosts`, { method: "OPTIONS", headers: { origin: "http://evil.example" } });
    expect(evil.status).toBe(403);
    const get = await fetch(`${base}/v1/health`, { headers: { origin: "http://evil.example" } });
    expect(get.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("reloads stored ghosts on restart (the JSON-lines file, or the bucket's objects)", async () => {
    const again = backend.server({ log: () => {} });
    for (let day = 1; day <= 5; day++) await again.store.bucket(RULES_VERSION, day); // Tigris loads lazily; no-op for JSON lines
    expect(again.store.size).toBe(20);
    expect(await again.store.bucket(RULES_VERSION, 3)).toHaveLength(4);
  });

  it("rate-limits per IP", async () => {
    const small = backend.server({ rateLimit: { windowMs: 60_000, max: 3 }, log: () => {} }, true); // over fresh storage
    const url = `http://127.0.0.1:${await small.listen(0)}/v1/health`;
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await fetch(url)).status);
    const last = await fetch(url);
    await small.close();
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    expect(last.headers.get("retry-after")).toBe("60");
  });
});

describe("ghost client fallback", () => {
  it("falls back on a refused connection and on a timeout; submit reports failure", async () => {
    const closed = createGhostServer({ dataDir: mkdtempSync(join(tmpdir(), "bb-ghosts-x-")), log: () => {} });
    const port = await closed.listen(0);
    await closed.close();
    const refused = await fetchGhost(`http://127.0.0.1:${port}`, req({ day: 2 }), 1000);
    expect(refused).toMatchObject({ source: "fallback", id: "offline-weaver-d2" });
    const sub = await submitGhost(`http://127.0.0.1:${port}`, snap(), 1000);
    expect(sub.ok).toBe(false);

    const hang = createServer(() => { /* never answers */ });
    await new Promise<void>((r) => hang.listen(0, "127.0.0.1", () => r()));
    const addr = hang.address();
    const hb = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
    const t0 = Date.now();
    const slow = await fetchGhost(hb, req({ day: 3 }), 300);
    expect(slow).toMatchObject({ source: "fallback", error: "timeout", id: "offline-weaver-d3" });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(await submitGhost(hb, snap(), 300)).toEqual({ ok: false, error: "timeout" });
    hang.closeAllConnections();
    await new Promise<void>((r) => hang.close(() => r()));
  });

  it("falls back when the server answers with junk or an invalid ghost", async () => {
    const junk = createServer((q, s) => {
      s.setHeader("content-type", "application/json");
      s.end(q.url?.includes("day=4") ? JSON.stringify({ id: "gx", snapshot: { ...snap(), day: 4, wins: 0, build: { ...snap().build, hullBonus: 999 } } }) : "");
    });
    await new Promise<void>((r) => junk.listen(0, "127.0.0.1", () => r()));
    const addr = junk.address();
    const jb = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
    expect(await fetchGhost(jb, req({ day: 2 }), 1000)).toMatchObject({ source: "fallback", error: "empty answer" });
    const inv = await fetchGhost(jb, req({ day: 4 }), 1000);
    expect(inv.source).toBe("fallback");
    expect(inv.error).toMatch(/deck invalid: supply/);
    junk.closeAllConnections();
    await new Promise<void>((r) => junk.close(() => r()));
  });
});
