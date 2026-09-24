import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
