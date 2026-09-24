import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { submitGhost } from "../src/net/ghostClient";
import { KEY_HEADER, SIG_HEADER, verifyUpload, type Identity } from "../src/net/identity";
import { encodeSnapshot, ghostId } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { JsonlStore } from "../server/store";
import type { FakeS3 } from "../tools/fakeS3";
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
