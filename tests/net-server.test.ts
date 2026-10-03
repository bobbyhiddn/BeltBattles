import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION, START_LIVES } from "../src/sim/content";
import { fetchGhost, submitGhost, type GhostRequest } from "../src/net/ghostClient";
import { NEW_PLAYER_RUNS, noBetterRecord } from "../src/net/matchmaking";
import { KEY_HEADER, SIG_HEADER, type Identity } from "../src/net/identity";
import { encodeSnapshot, ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { sampleGhosts } from "../tools/samplePool";
import { snap } from "./netHelpers";
import { identitiesFor, ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { storeBackends } from "./netStores";

const SHORE = "http://127.0.0.1:7778";
const TWENTY = sampleGhosts().filter((s) => s.day <= 5); // 2 heroes x 2 variants x days 1-5 (the sample ghosts, not the floor ghosts)

function req(over: Partial<GhostRequest> = {}): GhostRequest {
  return { rules: RULES_VERSION, day: 1, wins: 0, lives: 3, playerId: "me", seen: [], hero: "furnace", seed: 7, ...over };
}

// The server suite runs once per store: the JSON-lines file, and Tigris on the in-process fake S3.
describe.each(storeBackends())("ghost server (in-process, port 0), $name store", (backend) => {
let app: GhostServer;
let base: string;
const ids = new Map<string, GhostSnapshot>();
// 0.7.0: every upload is signed (src/net/identity.ts). Each sample player's ghosts go up signed by
// its own fixed test key and carry that key's playerId (tests/netIdentity.ts); ME signs the rest.
let owners: Map<string, Identity>;
let ME: Identity;
let OTHER: Identity;

async function post(body: string, url = `${base}/v1/ghosts`) {
  const r = await fetch(url, { method: "POST", headers: await signedHeaders(ME, body), body });
  return { status: r.status, body: await r.json() };
}

beforeAll(async () => {
  await backend.setup();
  owners = await identitiesFor(TWENTY);
  ME = await testIdentity(0);
  OTHER = await testIdentity(1);
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
      const owner = owners.get(s.playerId)!;
      const mine = ownedBy(s, owner); // signed by its owner's key, under that key's playerId
      const res = await submitGhost(base, mine, owner, 3000);
      expect(res.ok).toBe(true);
      if (res.ok) ids.set(res.id, mine);
    }
    expect(ids.size).toBe(20);
    expect(app.store.size).toBe(20);
    const first = owners.get(TWENTY[0].playerId)!;
    const again = await submitGhost(base, ownedBy(TWENTY[0], first), first, 3000);
    expect(again).toEqual({ ok: true, id: [...ids.keys()][0] });
    expect(app.store.size).toBe(20);
    expect(backend.storedRecords()).toBe(20); // ghosts.jsonl lines, or player objects in the bucket
  });

  it("matches same rules and day, never your own ghost, never a seen one, then falls back", async () => {
    for (let day = 1; day <= 5; day++) {
      const me = owners.get("sample-furnace-0")!.playerId; // owns one of the 4 ghosts stored for each day (its key's playerId)
      const seen: string[] = [];
      for (;;) {
        // 0.7.0a: the best record a player can carry into this dusk (D1: every ghost of the day is eligible), and a
        // player past the new-player pool (D2: uploads are matched only from NEW_PLAYER_RUNS finished runs)
        const g = await fetchGhost(base, req({ day, playerId: me, seen: [...seen], wins: day - 1, lives: START_LIVES, runs: NEW_PLAYER_RUNS }), 3000);
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
    const g = await fetchGhost(base, req({ day: 5, wins: target.wins, lives: target.lives, playerId: "nobody", runs: NEW_PLAYER_RUNS }), 3000);
    expect(g.source).toBe("server");
    const d = (s: GhostSnapshot) => Math.abs(s.wins - target.wins) * 100 + Math.abs(s.lives - target.lives);
    expect(noBetterRecord(g.snapshot, target)).toBe(true); // 0.7.0a D1
    expect(d(g.snapshot)).toBe(Math.min(...pool.filter((s) => noBetterRecord(s, target)).map(d)));
  });

  it("rejects a bad deck, foreign rules, malformed JSON, oversize bodies and bad queries", async () => {
    const s = snap({ playerId: ME.playerId }); // post() signs with ME: past the signature, these are the old refusals
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

  // 0.7.0, REQ-BFG-016: signed uploads. These run last: the 201 case adds a ghost to this store.
  const upload = (body: string | Uint8Array, headers: Record<string, string>) =>
    fetch(`${base}/v1/ghosts`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body })
      .then(async (r) => ({ status: r.status, body: await r.json() }));
  const stored = () => ({ size: app.store.size, records: backend.storedRecords() });

  it("refuses an upload with a missing or malformed signing header: 401, before the body is read, nothing stored", async () => {
    const before = stored();
    const body = encodeSnapshot(snap({ playerId: ME.playerId }));
    const { [KEY_HEADER]: key, [SIG_HEADER]: sig } = await signedHeaders(ME, body);
    const cases: [string, Record<string, string>][] = [
      ["no signing headers", {}],
      ["no x-bb-sig", { [KEY_HEADER]: key }],
      ["no x-bb-key", { [SIG_HEADER]: sig }],
      ["x-bb-key not base64url", { [KEY_HEADER]: "not a key", [SIG_HEADER]: sig }],
      ["x-bb-key padded", { [KEY_HEADER]: `${key}=`, [SIG_HEADER]: sig }],
      ["x-bb-sig truncated", { [KEY_HEADER]: key, [SIG_HEADER]: sig.slice(0, 43) }],
    ];
    for (const [what, headers] of cases) {
      const r = await upload(body, headers);
      expect(r.status, what).toBe(401);
      expect(r.body.error, what).toMatch(/^(unsigned upload: the x-bb-key and x-bb-sig headers are required|x-bb-key: |x-bb-sig: )/);
    }
    // an unsigned oversize body is a 401, not a 413: the headers are checked before the body is read
    expect((await upload(" ".repeat(20_000), {})).status).toBe(401);
    expect(stored()).toEqual(before);
  });

  it("refuses a tampered body and a signature by another key: 401, nothing stored", async () => {
    const before = stored();
    const body = encodeSnapshot(snap({ playerId: ME.playerId, createdAt: 1_790_000_000_002 }));
    const headers = await signedHeaders(ME, body);
    // one byte changed after signing; the result is still a valid, storable snapshot of ME's
    const tampered = body.replace("1790000000002", "1790000000003");
    expect(tampered).not.toBe(body);
    expect(tampered.length).toBe(body.length);
    const t = await upload(tampered, headers);
    expect(t).toEqual({ status: 401, body: { error: "x-bb-sig: the signature does not match this body and key" } });
    const byOther = await signedHeaders(OTHER, body);
    expect((await upload(body, { [KEY_HEADER]: headers[KEY_HEADER], [SIG_HEADER]: byOther[SIG_HEADER] })).status).toBe(401);
    expect((await upload(body, { [KEY_HEADER]: byOther[KEY_HEADER], [SIG_HEADER]: headers[SIG_HEADER] })).status).toBe(401);
    expect(stored()).toEqual(before);
  });

  it("refuses a valid signature over a snapshot whose playerId belongs to another key: 403, nothing stored", async () => {
    const before = stored();
    const body = encodeSnapshot(snap({ playerId: OTHER.playerId })); // OTHER's playerId, signed by ME
    const r = await upload(body, await signedHeaders(ME, body));
    expect(r).toEqual({ status: 403, body: { error: "snapshot.playerId is not the player id of the signing key (x-bb-key)" } });
    const old = encodeSnapshot(snap()); // a pre-0.7.0 random playerId: no key hashes to it
    expect((await upload(old, await signedHeaders(ME, old))).status).toBe(403);
    expect(stored()).toEqual(before);
  });

  it("stores a signed upload: 201, then 200 with the same id when repeated", async () => {
    const before = stored();
    const mine = snap({ playerId: ME.playerId, createdAt: 1_790_000_000_004, lives: 5 }); // 0.8.0 H2 (a): day 1's one reachable record, 0W 5 lives
    const body = encodeSnapshot(mine);
    const first = await upload(body, await signedHeaders(ME, body));
    expect(first).toEqual({ status: 201, body: { id: ghostId(mine) } });
    const again = await upload(body, await signedHeaders(ME, body)); // a fresh signature over the same bytes
    expect(again).toEqual({ status: 200, body: { id: ghostId(mine) } });
    expect(stored()).toEqual({ size: before.size + 1, records: before.records + 1 });
    const hit = (await app.store.bucket(RULES_VERSION, 1)).find((e) => e.id === ghostId(mine));
    expect(hit?.snapshot).toEqual(mine);
  });

  it("OPTIONS lists both signing headers for the configured origins", async () => {
    const pre = await fetch(`${base}/v1/ghosts`, {
      method: "OPTIONS",
      headers: { origin: SHORE, "access-control-request-method": "POST", "access-control-request-headers": "content-type,x-bb-key,x-bb-sig" },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(SHORE);
    expect(pre.headers.get("access-control-allow-headers")).toBe("content-type, x-bb-key, x-bb-sig");
    expect(pre.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
  });
});

describe("ghost client fallback", () => {
  it("falls back on a refused connection and on a timeout; submit reports failure", async () => {
    const closed = createGhostServer({ dataDir: mkdtempSync(join(tmpdir(), "bb-ghosts-x-")), log: () => {} });
    const port = await closed.listen(0);
    await closed.close();
    const refused = await fetchGhost(`http://127.0.0.1:${port}`, req({ day: 2 }), 1000);
    expect(refused).toMatchObject({ source: "fallback", id: "offline-weaver-d2" });
    const me = await testIdentity(0); // uploads are signed: the snapshot carries the key's playerId
    const sub = await submitGhost(`http://127.0.0.1:${port}`, ownedBy(snap(), me), me, 1000);
    expect(sub.ok).toBe(false);

    const hang = createServer(() => { /* never answers */ });
    await new Promise<void>((r) => hang.listen(0, "127.0.0.1", () => r()));
    const addr = hang.address();
    const hb = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
    const t0 = Date.now();
    const slow = await fetchGhost(hb, req({ day: 3 }), 300);
    expect(slow).toMatchObject({ source: "fallback", error: "timeout", id: "offline-weaver-d3" });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(await submitGhost(hb, ownedBy(snap(), me), me, 300)).toEqual({ ok: false, error: "timeout" });
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
