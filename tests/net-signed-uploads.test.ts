import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { submitGhost } from "../src/net/ghostClient";
import { KEY_HEADER, SIG_HEADER, verifyUpload, type Identity } from "../src/net/identity";
import { encodeSnapshot, ghostId, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { JsonlStore, type GhostStore } from "../server/store";
import type { FakeS3 } from "../tools/fakeS3";
import { generateSamplePool } from "../tools/samplePool";
import { snap } from "./netHelpers";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { startFake, tigrisFor } from "./netStores";

// 0.7.0, REQ-BFG-016: what the client sends for a signed upload, and what the server keeps of it.

let ME: Identity;
let fake: FakeS3;
beforeAll(async () => {
  ME = await testIdentity(0);
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

interface Received {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
}

/** A server that records every request and answers 201 { id: "gcaptured" }. */
async function recorder(): Promise<{ base: string; got: Received[]; close(): Promise<void> }> {
  const got: Received[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (c: Uint8Array) => chunks.push(c));
    req.on("end", () => {
      got.push({ method: req.method ?? "", headers: req.headers, body: new Uint8Array(Buffer.concat(chunks)) });
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "gcaptured" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const a = server.address();
  return {
    base: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`,
    got,
    close: () => new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    }),
  };
}

describe("submitGhost signs exactly what it sends", () => {
  it("sends x-bb-key and x-bb-sig; the signature covers the exact body bytes received, which are the canonical snapshot", async () => {
    const rec = await recorder();
    const mine = ownedBy(snap(), ME);
    expect(await submitGhost(rec.base, mine, ME, 2000)).toEqual({ ok: true, id: "gcaptured" });
    await rec.close();
    expect(rec.got).toHaveLength(1);
    const [r] = rec.got;
    expect(r.method).toBe("POST");
    expect(r.headers["content-type"]).toBe("application/json");
    expect(new TextDecoder().decode(r.body)).toBe(encodeSnapshot(mine));
    const key = r.headers[KEY_HEADER], sig = r.headers[SIG_HEADER];
    expect(typeof key === "string" && key.length === 87).toBe(true);
    expect(typeof sig === "string" && sig.length === 86).toBe(true);
    expect(await verifyUpload(r.body, key as string, sig as string)).toEqual({ ok: true, playerId: ME.playerId });
    const changed = new Uint8Array(r.body);
    changed[changed.length - 2] ^= 0x01; // one byte of createdAt
    expect((await verifyUpload(changed, key as string, sig as string)).ok).toBe(false);
  });

  it("refuses a snapshot whose playerId is not the identity's, without a request; SubmitResult keeps its shape", async () => {
    const rec = await recorder();
    const other = await testIdentity(1);
    const foreign = await submitGhost(rec.base, ownedBy(snap(), other), ME, 2000);
    const old = await submitGhost(rec.base, snap(), ME, 2000); // a pre-0.7.0 random playerId
    await rec.close();
    expect(rec.got).toHaveLength(0);
    for (const r of [foreign, old]) {
      expect(r).toEqual({ ok: false, error: "snapshot.playerId is not this device's player id: not uploaded" });
    }
  });

  it("reports the server's refusal of a badly signed upload as { ok: false, status: 401, error }", async () => {
    const app = createGhostServer({ store: tigrisFor(fake), log: () => {} });
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    // an identity whose signatures are not over what is sent: the server answers 401
    const liar: Identity = {
      playerId: ME.playerId, publicKey: ME.publicKey,
      sign: (body) => ME.sign(new Uint8Array([...body, 0x20])),
    };
    const r = await submitGhost(base, ownedBy(snap(), ME), liar, 2000);
    await app.close();
    expect(r).toEqual({ ok: false, status: 401, error: "x-bb-sig: the signature does not match this body and key" });
  });
});

describe("a signed upload is stored in the record format it always had: no key, no signature", () => {
  async function uploadOnce(app: GhostServer): Promise<{ id: string; key: string; sig: string }> {
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    const mine = ownedBy(snap(), ME);
    const body = encodeSnapshot(mine);
    const headers = await signedHeaders(ME, body);
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers, body });
    await app.close();
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: ghostId(mine) });
    return { id: ghostId(mine), key: headers[KEY_HEADER], sig: headers[SIG_HEADER] };
  }

  function expectRecord(text: string, id: string, key: string, sig: string): void {
    const rec = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(rec)).toEqual(["id", "at", "snapshot"]);
    expect(rec.id).toBe(id);
    expect(rec.snapshot).toEqual(ownedBy(snap(), ME));
    expect(text).not.toContain(key);
    expect(text).not.toContain(sig);
    expect(text).not.toContain(key.slice(0, 20)); // not even part of the key
  }

  it("JSON lines: one {id, at, snapshot} line in ghosts.jsonl", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bb-signed-"));
    const store = new JsonlStore(dir);
    store.load();
    const { id, key, sig } = await uploadOnce(createGhostServer({ store, log: () => {} }));
    const lines = readFileSync(store.file, "utf8").trim().split("\n");
    rmSync(dir, { recursive: true, force: true });
    expect(lines).toHaveLength(1);
    expectRecord(lines[0], id, key, sig);
  });

  it("Tigris: one {id, at, snapshot} object under the player/ prefix", async () => {
    fake.createBucket("bb-signed");
    const { id, key, sig } = await uploadOnce(createGhostServer({ store: tigrisFor(fake, "bb-signed"), log: () => {} }));
    const keys = fake.keys("bb-signed");
    expect(keys).toEqual([`ghosts/${snap().rules}/d01/player/${id}.json`]);
    expectRecord(fake.getObject("bb-signed", keys[0])!, id, key, sig);
  });
});

// 0.6.2's v2 snapshot: a build may carry turrets (REQ-BFG-031) and a route a join (REQ-BFG-027). The
// first sample-pool deck with both is signed, sent, verified and stored like any other upload.
const V2 = generateSamplePool().find((s) => s.build.turrets !== undefined && s.build.routes.some((r) => r.join !== undefined));

describe("0.6.2: a v2 snapshot with turrets and a join signs and verifies on the exact bytes sent", () => {
  const mine = () => ownedBy(V2!, ME);
  /** Index of the first digit after `marker` in the encoded body: a turret slot, or a join cell. */
  const digitAfter = (text: string, marker: string) => {
    const at = text.indexOf(marker);
    expect(at).toBeGreaterThanOrEqual(0);
    return at + marker.length;
  };

  it("the sample pool has such a deck, and it travels as SNAPSHOT_VERSION", () => {
    expect(V2).toBeDefined();
    expect(V2!.v).toBe(SNAPSHOT_VERSION);
    expect(SNAPSHOT_VERSION).toBe(2);
  });

  it("submitGhost sends its canonical bytes, turrets and join included, under a signature that verifies; one changed byte in either does not", async () => {
    const rec = await recorder();
    expect(await submitGhost(rec.base, mine(), ME, 2000)).toEqual({ ok: true, id: "gcaptured" });
    await rec.close();
    expect(rec.got).toHaveLength(1);
    const [r] = rec.got;
    const text = new TextDecoder().decode(r.body);
    expect(text).toBe(encodeSnapshot(mine()));
    const key = r.headers[KEY_HEADER] as string, sig = r.headers[SIG_HEADER] as string;
    expect(await verifyUpload(r.body, key, sig)).toEqual({ ok: true, playerId: ME.playerId });
    for (const marker of ['"turrets":[{"slot":', '"join":']) {
      const changed = new Uint8Array(r.body);
      changed[digitAfter(text, marker)] ^= 0x01; // one digit: another slot, another join cell
      expect((await verifyUpload(changed, key, sig)).ok).toBe(false);
    }
  });

  it.each(["jsonl", "tigris"] as const)("on the %s store: 401 for one changed byte under the signature, then 201 and 200; the stored snapshot keeps its turrets and join", async (kind) => {
    const dir = mkdtempSync(join(tmpdir(), "bb-signed-v2-"));
    let store: GhostStore;
    let records: () => string[];
    if (kind === "jsonl") {
      const jsonl = new JsonlStore(dir);
      jsonl.load();
      store = jsonl;
      records = () => readFileSync(jsonl.file, "utf8").trim().split("\n").filter(Boolean);
    } else {
      fake.createBucket("bb-signed-v2");
      store = tigrisFor(fake, "bb-signed-v2");
      records = () => fake.keys("bb-signed-v2").map((k) => fake.getObject("bb-signed-v2", k)!);
    }
    const app = createGhostServer({ store, log: () => {} });
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    const text = encodeSnapshot(mine());
    const body = new TextEncoder().encode(text);
    const headers = await signedHeaders(ME, body);
    const post = (b: Uint8Array) => fetch(`${base}/v1/ghosts`, { method: "POST", headers, body: b });
    const changed = new Uint8Array(body);
    changed[digitAfter(text, '"turrets":[{"slot":')] ^= 0x01;
    const refused = await post(changed);
    const sizeAfterRefusal = store.size;
    const first = await post(body);
    const again = await post(body);
    await app.close();
    const stored = records();
    rmSync(dir, { recursive: true, force: true });
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ error: "x-bb-sig: the signature does not match this body and key" });
    expect(sizeAfterRefusal).toBe(0);
    expect([first.status, again.status]).toEqual([201, 200]);
    expect(await first.json()).toEqual({ id: ghostId(mine()) });
    expect(stored).toHaveLength(1);
    const rec = JSON.parse(stored[0]) as { id: string; snapshot: GhostSnapshot };
    expect(rec.id).toBe(ghostId(mine()));
    expect(rec.snapshot).toEqual(mine());
    expect(rec.snapshot.build.turrets).toEqual(V2!.build.turrets);
    expect(rec.snapshot.build.routes).toEqual(V2!.build.routes);
    expect(encodeSnapshot(rec.snapshot)).toBe(text); // the stored ghost re-encodes to the bytes that were signed
  });
});
