// S4 (BRIEF-S4 SHOULD a): `ghost-ops tigris-snapshot [--name <n>]`, the nightly job's request. Tigris documents a snapshot as S3 CreateBucket on the bucket with the header
// `X-Tigris-Snapshot: true` (a name after a semicolon: `true; name=<name>`), the new version coming back in `X-Tigris-Snapshot-Version`
// (https://www.tigrisdata.com/docs/buckets/snapshots-and-forks/, read 2026-10-26). Only the request's SHAPE is tested, against a local recorder server and an injected fetch:
// the method, the path (path-style and virtual-hosted), the header, an empty signed payload, and a signature that COVERS the snapshot header (recomputed here with sigv4.ts, and
// different when the header is different). It is never run against Tigris.
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { runOps, type Out } from "../server/ops";
import { RawS3 } from "../server/opsS3";
import { amzDate, EMPTY_SHA256, signV4 } from "../server/sigv4";
import { FAKE_CREDS } from "./netStores";

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}
const servers: Server[] = [];
afterEach(async () => {
  while (servers.length) await new Promise<void>((r) => { const s = servers.pop()!; s.close(() => r()); s.closeAllConnections(); });
});

/** A server that records every request and answers with `reply`. */
async function recorder(reply: (r: Recorded) => { status: number; headers?: Record<string, string>; body?: string }): Promise<{ endpoint: string; seen: Recorded[] }> {
  const seen: Recorded[] = [];
  const srv = createServer((req, res) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(",") : v ?? "";
      const r: Recorded = { method: req.method ?? "", url: req.url ?? "", headers, body: new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c]))) };
      seen.push(r);
      const a = reply(r);
      res.statusCode = a.status;
      for (const [k, v] of Object.entries(a.headers ?? {})) res.setHeader(k, v);
      res.end(a.body ?? "");
    });
  });
  servers.push(srv);
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", () => resolve()));
  const a = srv.address();
  return { endpoint: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`, seen };
}

const env = (endpoint: string, over: Record<string, string> = {}): Record<string, string> => ({
  BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey, AWS_ENDPOINT_URL_S3: endpoint, BUCKET_NAME: "beltbattles-ghosts-v2",
  BB_GHOST_S3_ADDRESSING: "path", ...over,
});
async function run(argv: string[], e: Record<string, string>, deps = {}): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  const code = await runOps(argv, e, ((l) => lines.push(l)) as Out, deps);
  return { code, text: lines.join("\n") };
}
const ok = { status: 200, headers: { "x-tigris-snapshot-version": "1751631910196672425" } };

/** The signature the request carries, recomputed from what the recorder saw. */
function resign(r: Recorded, over: Record<string, string> = {}): string {
  const names = /SignedHeaders=([^,]+)/.exec(r.headers.authorization)![1].split(";");
  const headers: Record<string, string> = {};
  for (const n of names) headers[n] = r.headers[n] ?? "";
  Object.assign(headers, over);
  const path = r.url.split("?")[0];
  return signV4({ method: r.method, path, headers, payloadHash: r.headers["x-amz-content-sha256"], accessKeyId: FAKE_CREDS.accessKeyId, secretAccessKey: FAKE_CREDS.secretAccessKey, region: "auto" }).signature;
}

describe("S4 tigris-snapshot: the request's shape", () => {
  it("is one PUT on the bucket (CreateBucket) with X-Tigris-Snapshot, an empty payload and nothing else sent; the version is printed", async () => {
    const rec = await recorder(() => ok);
    const r = await run(["tigris-snapshot", "--name", "nightly-2026-10-26"], env(rec.endpoint));
    expect(r.code, r.text).toBe(0);
    expect(rec.seen).toHaveLength(1); // no LIST, no GET, no other call
    const q = rec.seen[0];
    expect(q.method).toBe("PUT");
    expect(q.url).toBe("/beltbattles-ghosts-v2"); // path-style: the bucket itself, no key, no query
    expect(q.headers["x-tigris-snapshot"]).toBe("true; name=nightly-2026-10-26");
    expect(q.body).toBe("");
    expect(q.headers["x-amz-content-sha256"]).toBe(EMPTY_SHA256);
    expect(q.headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(q.headers.host).toBe(new URL(rec.endpoint).host);
    expect(r.text).toContain('snapshot "nightly-2026-10-26" taken (version 1751631910196672425)');
    expect(r.text).toContain("beltbattles-ghosts-v2");
  });

  it("the signature covers the snapshot header: it is in SignedHeaders, it verifies, and it would not verify for another value", async () => {
    const rec = await recorder(() => ok);
    expect((await run(["tigris-snapshot", "--name", "n1"], env(rec.endpoint))).code).toBe(0);
    const auth = rec.seen[0].headers.authorization;
    const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/auto\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(auth);
    expect(m, auth).not.toBeNull();
    expect(m![1]).toBe(FAKE_CREDS.accessKeyId);
    expect(m![3]).toBe("host;x-amz-content-sha256;x-amz-date;x-tigris-snapshot");
    expect(m![4]).toBe(resign(rec.seen[0])); // recomputed from the headers as received
    expect(resign(rec.seen[0], { "x-tigris-snapshot": "true; name=other" })).not.toBe(m![4]); // the header is part of what was signed
    expect(resign(rec.seen[0], { "x-tigris-snapshot": "true" })).not.toBe(m![4]);
    expect(m![2]).toBe(rec.seen[0].headers["x-amz-date"].slice(0, 8));
  });

  it("without --name the job names it ghost-ops-<UTC stamp>; a name with a space is sent as typed", async () => {
    const rec = await recorder(() => ok);
    const fixed = Date.parse("2026-10-26T03:00:00Z");
    expect((await run(["tigris-snapshot"], env(rec.endpoint), { now: () => fixed })).code).toBe(0);
    expect(rec.seen[0].headers["x-tigris-snapshot"]).toBe("true; name=ghost-ops-20261026T030000Z");
    expect((await run(["tigris-snapshot", "--name", "nightly 1"], env(rec.endpoint))).code).toBe(0);
    expect(rec.seen[1].headers["x-tigris-snapshot"]).toBe("true; name=nightly 1");
  });

  it("virtual-hosted addressing (what Tigris documents and production uses) sends the bucket in the host and `/` as the path", async () => {
    const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
    const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET", headers: init?.headers as Record<string, string> });
      return new Response(null, { status: 200, headers: { "x-tigris-snapshot-version": "42" } });
    }) as typeof fetch;
    const e = env("https://fly.storage.tigris.dev", { BB_GHOST_S3_ADDRESSING: "virtual" });
    const r = await run(["tigris-snapshot", "--name", "v"], e, { open: (s3: ConstructorParameters<typeof RawS3>[0]) => new RawS3({ ...s3, fetch: fetchStub }) });
    expect(r.code, r.text).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://beltbattles-ghosts-v2.fly.storage.tigris.dev/");
    expect(calls[0].headers["x-tigris-snapshot"]).toBe("true; name=v");
    expect(calls[0].headers.authorization).toContain("SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-tigris-snapshot");
    expect(r.text).toContain("(version 42)");
  });

  it("an answer without a version still succeeds; a refusal is exit 1 naming the status, and a 5xx is retried and then exit 1", async () => {
    const none = await recorder(() => ({ status: 200 }));
    const a = await run(["tigris-snapshot", "--name", "x"], env(none.endpoint));
    expect(a.code).toBe(0);
    expect(a.text).toContain('snapshot "x" taken');
    expect(a.text).not.toContain("version");
    const denied = await recorder(() => ({ status: 403, body: "<Error><Code>AccessDenied</Code></Error>" }));
    const b = await run(["tigris-snapshot"], env(denied.endpoint));
    expect(b.code).toBe(1);
    expect(b.text).toContain("CreateBucket (snapshot)");
    expect(b.text).toContain("HTTP 403 AccessDenied");
    expect(denied.seen).toHaveLength(1); // a refusal is not retried
    const down = await recorder(() => ({ status: 503 }));
    const c = await run(["tigris-snapshot"], env(down.endpoint), { open: (s3: ConstructorParameters<typeof RawS3>[0]) => new RawS3({ ...s3, backoffMs: 1 }) });
    expect(c.code).toBe(1);
    expect(c.text).toContain("HTTP 503");
    expect(down.seen).toHaveLength(3); // the first try and two retries
  });

  it("prints no secret: not the access key, not the secret key, not a signature", async () => {
    const rec = await recorder(() => ok);
    const r = await run(["tigris-snapshot", "--name", "s"], env(rec.endpoint));
    expect(r.text).not.toContain(FAKE_CREDS.accessKeyId);
    expect(r.text).not.toContain(FAKE_CREDS.secretAccessKey);
    expect(r.text).not.toMatch(/AWS4-HMAC|Signature=/);
    const denied = await recorder(() => ({ status: 403, body: "<Error><Code>AccessDenied</Code></Error>" }));
    const d = await run(["tigris-snapshot"], env(denied.endpoint));
    expect(d.text).not.toContain(FAKE_CREDS.secretAccessKey);
    expect(d.text).not.toMatch(/AWS4-HMAC|Signature=/);
  });

  it("a settings error is exit 2 and sends nothing", async () => {
    const rec = await recorder(() => ok);
    expect((await run(["tigris-snapshot"], { ...env(rec.endpoint), BB_GHOST_STORE: "jsonl" })).code).toBe(2);
    expect((await run(["tigris-snapshot"], { ...env(rec.endpoint), BUCKET_NAME: "" })).code).toBe(2);
    expect(rec.seen).toHaveLength(0);
    expect(amzDate(new Date(0))).toBe("19700101T000000Z"); // (the helper the signature's date comes from)
  });
});
