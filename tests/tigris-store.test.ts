import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RULES_VERSION } from "../src/sim/content";
import { encodeSnapshot, ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { createGhostServer } from "../server/app";
import { S3Client, S3Error, parseListV2 } from "../server/s3";
import { amzDate, sha256Hex, signV4 } from "../server/sigv4";
import { bucketPrefix, objectKey, parseKey, poolPrefix, storableRules, TigrisStore } from "../server/tigrisStore";
import { StorageError } from "../server/store";
import { generateSamplePool, sampleGhosts } from "../tools/samplePool";
import type { FakeS3 } from "../tools/fakeS3";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { FAKE_CREDS, s3For, startFake, tigrisFor } from "./netStores";

const POOL = generateSamplePool();
const DAY3 = sampleGhosts().filter((g) => g.day === 3); // 4 ghosts (the sample ghosts; the seed pool adds 2 floor ghosts a day)
const s = DAY3[0];
let fake: FakeS3;
let seq = 0;
let bucket: string;

function freshBucket(): string {
  bucket = `bb-t${++seq}`;
  fake.createBucket(bucket);
  return bucket;
}

beforeAll(async () => {
  fake = await startFake({ pageSize: 3 }); // three keys per LIST page: every multi-page path is exercised
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.clearFaults();
  fake.requests.length = 0;
  freshBucket();
});

const ops = () => fake.requests.filter((r) => r.bucket === bucket).map((r) => r.op);

describe("object layout", () => {
  it("keys one ghost per object by rules, day and id; one (rules, day) bucket is one LIST prefix; the pool has its own prefix", () => {
    expect(bucketPrefix("bb-0.4.0", 3)).toBe("ghosts/bb-0.4.0/d03/");
    expect(poolPrefix("bb-0.4.0", 3)).toBe("ghosts/bb-0.4.0/d03/pool/");
    const p = objectKey("player", "bb-0.4.0", 10, "g0123456789abcd");
    expect(p).toBe("ghosts/bb-0.4.0/d10/player/g0123456789abcd.json");
    expect(p.startsWith(bucketPrefix("bb-0.4.0", 10))).toBe(true);
    expect(p.startsWith(poolPrefix("bb-0.4.0", 10))).toBe(false);
    expect(parseKey(p)).toEqual({ rules: "bb-0.4.0", day: 10, kind: "player", id: "g0123456789abcd" });
    for (const s of POOL) expect(objectKey("pool", s.rules, s.day, ghostId(s))).toMatch(/^[A-Za-z0-9._/-]+$/); // no XML escaping ever
    expect(storableRules("..")).toBe(false);
    expect(storableRules(".")).toBe(false);
    expect(parseKey("ghosts/bb-0.4.0/d03/notes.txt")).toBeNull();
    expect(() => objectKey("pool", "../x", 1, "g1")).toThrow();
  });
});

describe("S3 client on the fake", () => {
  it("round-trips PUT, GET, HEAD, DELETE and a paginated ListObjectsV2", async () => {
    const s3 = s3For(fake, bucket);
    for (let i = 0; i < 7; i++) await s3.put(`ghosts/x/d01/player/k${i}.json`, `{"n":${i}}`);
    await s3.put("ghosts/x/d02/player/other.json", "{}");
    const listed = await s3.listAll("ghosts/x/d01/");
    expect(listed.map((o) => o.key)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => `ghosts/x/d01/player/k${i}.json`));
    expect(listed[0].size).toBe(7);
    expect(fake.count("LIST", bucket)).toBe(3); // 3 + 3 + 1: continuation tokens (with + / =) were followed
    expect(await s3.getText("ghosts/x/d01/player/k4.json")).toBe('{"n":4}');
    expect(await s3.head("ghosts/x/d01/player/k4.json")).toBe(true);
    await s3.delete("ghosts/x/d01/player/k4.json");
    expect(await s3.head("ghosts/x/d01/player/k4.json")).toBe(false);
    expect(await s3.getText("ghosts/x/d01/player/k4.json")).toBeNull();
    await s3.delete("ghosts/x/d01/player/k4.json"); // deleting a missing key succeeds, as on S3
    expect(fake.requests.every((r) => r.status !== 403)).toBe(true); // every signature verified
  });

  it("addresses virtual-hosted by default (https://<bucket>.<host>/<key>) and path-style on request, signed for the host it calls", async () => {
    const seen: { url: string; headers: Record<string, string>; body?: Uint8Array }[] = [];
    const capture = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), headers: init?.headers as Record<string, string>, body: init?.body as Uint8Array | undefined });
      return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>`, { status: 200 });
    }) as typeof fetch;
    const opts = { endpoint: "https://fly.storage.tigris.dev", region: "auto", bucket: "beltbattles-ghosts", ...FAKE_CREDS, fetch: capture };
    const virtual = new S3Client(opts);
    await virtual.put("ghosts/bb-0.4.0/d01/player/gabc.json", '{"a":1}');
    await virtual.listPage("ghosts/bb-0.4.0/d01/", "c+/=YQ==");
    const path = new S3Client({ ...opts, addressing: "path" });
    await path.getText("ghosts/bb-0.4.0/d01/player/gabc.json");
    expect(seen[0].url).toBe("https://beltbattles-ghosts.fly.storage.tigris.dev/ghosts/bb-0.4.0/d01/player/gabc.json");
    expect(seen[1].url).toBe("https://beltbattles-ghosts.fly.storage.tigris.dev/?continuation-token=c%2B%2F%3DYQ%3D%3D&list-type=2&max-keys=1000&prefix=ghosts%2Fbb-0.4.0%2Fd01%2F");
    expect(seen[2].url).toBe("https://fly.storage.tigris.dev/beltbattles-ghosts/ghosts/bb-0.4.0/d01/player/gabc.json");
    const put = seen[0].headers;
    expect(put["x-amz-content-sha256"]).toBe(sha256Hex('{"a":1}')); // the payload itself is signed
    expect(put.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDFAKES3TESTONLY\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    // recompute the PUT signature for the virtual host from the published algorithm
    const again = signV4({
      method: "PUT", path: "/ghosts/bb-0.4.0/d01/player/gabc.json",
      headers: { host: "beltbattles-ghosts.fly.storage.tigris.dev", "content-type": "application/json", "x-amz-content-sha256": put["x-amz-content-sha256"], "x-amz-date": put["x-amz-date"] },
      payloadHash: put["x-amz-content-sha256"], ...FAKE_CREDS, region: "auto",
    });
    expect(put.authorization).toBe(again.authorization);
    expect(JSON.stringify(seen)).not.toContain(FAKE_CREDS.secretAccessKey);
  });

  it("the fake refuses malformed SigV4, a wrong signature and a payload hash that is not the body's", async () => {
    const url = `${fake.endpoint}/${bucket}/ghosts/k.json`;
    const date = amzDate(new Date());
    const host = new URL(fake.endpoint).host;
    const body = '{"ok":true}';
    const sign = (secret: string, hash: string) => signV4({
      method: "PUT", path: `/${bucket}/ghosts/k.json`,
      headers: { host, "x-amz-content-sha256": hash, "x-amz-date": date }, payloadHash: hash,
      accessKeyId: FAKE_CREDS.accessKeyId, secretAccessKey: secret, region: "auto",
    }).authorization;
    const put = (auth: string, hash: string, b = body) =>
      fetch(url, { method: "PUT", body: b, headers: { authorization: auth, "x-amz-content-sha256": hash, "x-amz-date": date } });
    const good = sha256Hex(body);
    const noAuth = await fetch(url, { method: "PUT", body, headers: { "x-amz-content-sha256": good, "x-amz-date": date } });
    expect(noAuth.status).toBe(403);
    expect(await noAuth.text()).toMatch(/not well-formed SigV4/);
    expect((await put(`AWS4-HMAC-SHA256 Credential=${FAKE_CREDS.accessKeyId}/${date.slice(0, 8)}/auto/s3/aws4_request, Signature=${"0".repeat(64)}`, good)).status).toBe(403);
    const wrong = await put(sign("not-the-secret", good), good);
    expect(wrong.status).toBe(403);
    expect(await wrong.text()).toMatch(/SignatureDoesNotMatch/);
    const tampered = await put(sign(FAKE_CREDS.secretAccessKey, good), good, '{"ok":false}'); // body changed after signing
    expect(tampered.status).toBe(400);
    expect(await tampered.text()).toMatch(/XAmzContentSHA256Mismatch/);
    const unsigned = await put(sign(FAKE_CREDS.secretAccessKey, good), "UNSIGNED-PAYLOAD"); // the payload must be signed
    expect(unsigned.status).toBe(400);
    expect(await unsigned.text()).toMatch(/InvalidArgument/);
    expect(fake.keys(bucket)).toEqual([]);
    expect((await put(sign(FAKE_CREDS.secretAccessKey, good), good)).status).toBe(200);
    expect(fake.keys(bucket)).toEqual(["ghosts/k.json"]);
  });

  it("retries a 5xx at most twice, then fails with the status; a 4xx is final", async () => {
    const s3 = s3For(fake, bucket);
    fake.failNext(2, 503);
    await s3.put("ghosts/r.json", "{}");
    expect(ops()).toEqual(["PUT", "PUT", "PUT"]);
    fake.requests.length = 0;
    fake.failNext(3, 500);
    const e = await s3.getText("ghosts/r.json").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(S3Error);
    expect(e).toBeInstanceOf(StorageError);
    expect((e as S3Error).status).toBe(500);
    expect((e as S3Error).message).toMatch(/GET ghosts\/r\.json: HTTP 500 InternalError \(3 attempts\)/);
    expect(ops()).toEqual(["GET", "GET", "GET"]);
    fake.requests.length = 0;
    fake.failNext(1, 403);
    await expect(s3.head("ghosts/r.json")).rejects.toMatchObject({ status: 403 });
    expect(ops()).toEqual(["HEAD"]);
  });

  it("gives every call its own timeout; a hang or a dropped connection is retried, and three of them fail", async () => {
    const s3 = s3For(fake, bucket, { timeoutMs: 150 });
    await s3.put("ghosts/t.json", '"t"');
    fake.requests.length = 0;
    fake.hangNext(1);
    let t0 = Date.now();
    expect(await s3.getText("ghosts/t.json")).toBe('"t"');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(140);
    expect(ops()).toEqual(["GET", "GET"]);
    fake.dropNext(1);
    expect(await s3.head("ghosts/t.json")).toBe(true);
    fake.hangNext(3);
    t0 = Date.now();
    await expect(s3.listAll("ghosts/")).rejects.toThrow(/no answer within 150 ms \(3 attempts\)/);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("parses ListObjectsV2 XML and refuses anything else", () => {
    const page = parseListV2(`<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>a&amp;b</NextContinuationToken><Contents><Key>k&lt;1</Key><Size>5</Size></Contents></ListBucketResult>`);
    expect(page).toEqual({ objects: [{ key: "k<1", size: 5 }], truncated: true, next: "a&b" });
    expect(() => parseListV2("<Error><Code>AccessDenied</Code></Error>")).toThrow(S3Error);
  });
});

describe("Tigris store on the fake", () => {
  const key = (x: GhostSnapshot) => objectKey("player", x.rules, x.day, ghostId(x));

  it("round-trips a ghost: durable object first, then indexed; another machine's store sees it", async () => {
    const a = tigrisFor(fake, bucket);
    expect(await a.add(s, 1234)).toEqual({ id: ghostId(s), created: true });
    expect(ops()).toEqual(["HEAD", "PUT"]);
    expect(JSON.parse(fake.getObject(bucket, key(s))!)).toEqual({ id: ghostId(s), at: 1234, snapshot: s });
    const b = tigrisFor(fake, bucket);
    const got = await b.bucket(RULES_VERSION, 3);
    expect(got).toEqual([{ id: ghostId(s), snapshot: s }]);
    expect(encodeSnapshot(got[0].snapshot)).toBe(encodeSnapshot(s));
  });

  it("is idempotent: the same ghost again keeps its id, and nothing is written twice", async () => {
    const a = tigrisFor(fake, bucket);
    await a.add(s);
    fake.requests.length = 0;
    expect(await a.add(s)).toEqual({ id: ghostId(s), created: false });
    expect(ops()).toEqual([]); // known to this process: no storage call
    const other = tigrisFor(fake, bucket); // another machine
    expect(await other.add(s)).toEqual({ id: ghostId(s), created: false });
    expect(ops()).toEqual(["HEAD"]); // found, not rewritten
    expect(fake.keys(bucket)).toHaveLength(1);
  });

  it("loads lazily: no request at start or for size; the first match lists the bucket once; later ones use the cache", async () => {
    const writer = tigrisFor(fake, bucket);
    for (const g of DAY3) await writer.add(g);
    fake.requests.length = 0;
    const store = tigrisFor(fake, bucket);
    expect(store.size).toBe(0);
    expect(ops()).toEqual([]);
    const [one, two] = await Promise.all([store.bucket(RULES_VERSION, 3), store.bucket(RULES_VERSION, 3)]); // single flight
    expect(one).toHaveLength(4);
    expect(two).toBe(one);
    expect(ops().filter((o) => o === "LIST")).toHaveLength(2); // one listing of 4 keys = 2 pages of 3
    expect(ops().filter((o) => o === "GET")).toHaveLength(4);
    expect(fake.requests.filter((r) => r.op === "LIST").every((r) => r.key === `ghosts/${RULES_VERSION}/d03/`)).toBe(true);
    fake.requests.length = 0;
    expect(await store.bucket(RULES_VERSION, 3)).toHaveLength(4);
    expect(await store.bucket(RULES_VERSION, 4)).toHaveLength(0);
    expect(ops()).toEqual(["LIST"]); // only day 4's first load
    expect(store.size).toBe(4);
    expect(await store.bucket("..", 3)).toEqual([]); // not a storable rules string: no request at all
    expect(ops()).toEqual(["LIST"]);
  });

  it("refreshes a cached bucket after the TTL: another machine's new ghost appears, a deleted one goes, only new keys are fetched", async () => {
    let now = 1_000_000;
    const store = tigrisFor(fake, bucket, { ttlMs: 60_000, now: () => now });
    const other = tigrisFor(fake, bucket);
    await other.add(DAY3[0]);
    await other.add(DAY3[1]);
    expect(await store.bucket(RULES_VERSION, 3)).toHaveLength(2);
    await other.add(DAY3[2]);
    fake.deleteObject(bucket, key(DAY3[0]));
    fake.requests.length = 0;
    now += 59_999;
    expect((await store.bucket(RULES_VERSION, 3)).map((e) => e.id).sort()).toEqual([DAY3[0], DAY3[1]].map(ghostId).sort());
    expect(ops()).toEqual([]);
    now += 1;
    const after = await store.bucket(RULES_VERSION, 3);
    expect(after.map((e) => e.id).sort()).toEqual([DAY3[1], DAY3[2]].map(ghostId).sort());
    expect(ops()).toEqual(["LIST", "GET"]); // one page (2 keys), one new object
  });

  it("a failed first load is a StorageError; a failed refresh serves the cached copy and retries a little later", async () => {
    let now = 5_000_000;
    const store = tigrisFor(fake, bucket, { ttlMs: 1000, retryMs: 500, now: () => now });
    await tigrisFor(fake, bucket).add(DAY3[0]);
    fake.failNext(3, 503);
    await expect(store.bucket(RULES_VERSION, 3)).rejects.toBeInstanceOf(StorageError);
    fake.requests.length = 0;
    await expect(store.bucket(RULES_VERSION, 3)).rejects.toThrow(/retrying shortly/); // within retryMs: no new attempt
    expect(ops()).toEqual([]);
    now += 500;
    expect(await store.bucket(RULES_VERSION, 3)).toHaveLength(1);
    now += 1000; // stale
    fake.failNext(3, 503);
    expect(await store.bucket(RULES_VERSION, 3)).toHaveLength(1); // stale copy served
    fake.requests.length = 0;
    expect(await store.bucket(RULES_VERSION, 3)).toHaveLength(1);
    expect(ops()).toEqual([]); // retry deferred
  });

  it("skips undecodable objects and foreign keys in a bucket, once", async () => {
    const logs: string[] = [];
    await tigrisFor(fake, bucket).add(DAY3[0]);
    fake.putObject(bucket, `ghosts/${RULES_VERSION}/d03/player/gbroken.json`, "{not json");
    fake.putObject(bucket, `ghosts/${RULES_VERSION}/d03/player/gwrongid0000000.json`, JSON.stringify({ id: "x", at: 0, snapshot: DAY3[1] }));
    fake.putObject(bucket, `ghosts/${RULES_VERSION}/d03/notes.txt`, "hello");
    let now = 0;
    const store = tigrisFor(fake, bucket, { log: (l) => logs.push(l), now: () => now, ttlMs: 10 });
    expect((await store.bucket(RULES_VERSION, 3)).map((e) => e.id)).toEqual([ghostId(DAY3[0])]);
    expect(store.skipped).toBe(3);
    fake.requests.length = 0;
    now += 10;
    await store.bucket(RULES_VERSION, 3);
    expect(ops()).toEqual(["LIST", "LIST"]); // 4 keys = 2 pages; the bad ones are not fetched again
    expect(store.skipped).toBe(3);
    expect(logs.join("\n")).toMatch(/gbroken/);
  });
});

describe("server on the Tigris store", () => {
  it("answers /v1/health at once, without touching storage, and names the store", async () => {
    fake.hangNext(100); // storage that never answers
    const app = createGhostServer({ store: tigrisFor(fake, bucket), log: () => {} });
    const t0 = Date.now();
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    const r = await fetch(`${base}/v1/health`);
    const took = Date.now() - t0;
    await app.close();
    fake.clearFaults();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, rules: RULES_VERSION, store: "tigris", ghosts: 0 });
    expect(took).toBeLessThan(1000);
    expect(fake.requests).toHaveLength(0);
  });

  it("answers 201 only after the PUT succeeded: a failed PUT is a 503 and nothing is indexed; the retry is a 201", async () => {
    const logs: string[] = [];
    const app = createGhostServer({ store: tigrisFor(fake, bucket), log: (l) => logs.push(l) });
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    const me = await testIdentity(0); // uploads are signed: s under the key's playerId
    const body = encodeSnapshot(ownedBy(s, me));
    const headers = await signedHeaders(me, body);
    const post = () => fetch(`${base}/v1/ghosts`, { method: "POST", headers, body });
    fake.failNext(3, 503, "PUT");
    const r1 = await post();
    expect(r1.status).toBe(503);
    expect(r1.headers.get("retry-after")).toBe("5");
    expect(await r1.json()).toEqual({ error: "ghost storage unavailable, try again shortly" });
    expect(app.store.size).toBe(0);
    expect(fake.keys(bucket)).toEqual([]);
    const r2 = await post();
    expect(r2.status).toBe(201);
    expect((await post()).status).toBe(200);
    // 0.7.0a: the upload is matched for a player past the new-player pool (D2) with no worse a record (D1)
    const match = await fetch(`${base}/v1/ghosts/match?rules=${RULES_VERSION}&day=3&wins=${s.wins}&lives=${s.lives}&player=someone&seen=&runs=3`);
    expect(match.status).toBe(200);
    fake.failNext(3, 503, "LIST");
    const down = await fetch(`${base}/v1/ghosts/match?rules=${RULES_VERSION}&day=4&wins=0&lives=3&player=someone&seen=`);
    expect(down.status).toBe(503);
    await app.close();
    expect(logs.join("\n")).toMatch(new RegExp(`storage error: PUT ghosts/${RULES_VERSION.replace(/\./g, "\\.")}/d03/player/g[0-9a-f]+\\.json: HTTP 503`));
    expect(logs.join("\n")).not.toContain(FAKE_CREDS.secretAccessKey);
  });
});
