// S4 (BRIEF-S4 goals 1 and 2): ghost-ops (server/ops.ts) on the in-process fake S3 with two buckets, small hand-made objects. The whole-server drill (a bucket filled through
// the real server, a second server on the restored bucket) is tests/s4.drill.test.ts. Here: the command line and its exit codes, key safety, the snapshot (layout, manifest,
// modes, the bucket only read), verify (a damaged snapshot fails before the bucket is read; --exact), restore (a dry run, the order, a non-empty bucket refused, --force skips
// what is identical, nothing deleted, the content type kept) and the failure cases (a tampered file, a missing object, unsafe keys, a storage fault mid-snapshot).
// Every bucket is on FakeS3 at 127.0.0.1; nothing here reaches a real S3.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMANDS, MANIFEST_FILE, USAGE, UsageError, clean, parseManifest, parseOpsArgs, runOps, shown, unsafeKeyReason, type Manifest, type Out } from "../server/ops";
import { RawS3, type OpsStore } from "../server/opsS3";
import type { S3Options } from "../server/s3";
import { sha256Hex } from "../server/sigv4";
import type { FakeS3 } from "../tools/fakeS3";
import { FAKE_CREDS, startFake } from "./netStores";

const A = "bb-a", B = "bb-b";
const enc = (s: string) => new TextEncoder().encode(s);
let fake: FakeS3;
let root: string;

beforeEach(async () => {
  fake = await startFake({ buckets: [A, B], pageSize: 3 }); // three keys a page: every listing paginates
  root = await mkdtemp(join(tmpdir(), "bb-s4-ops-"));
});
afterEach(async () => {
  await fake.close();
  await rm(root, { recursive: true, force: true });
});

const envFor = (bucket: string): Record<string, string> => ({
  BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
  AWS_ENDPOINT_URL_S3: fake.endpoint, BUCKET_NAME: bucket, BB_GHOST_S3_ADDRESSING: "path",
});
const quick = (s3: S3Options, say: Out): OpsStore => new RawS3({ ...s3, backoffMs: 1, timeoutMs: 3000, log: (l) => say(clean(l)) });

interface Ran {
  code: number;
  lines: string[];
  text: string;
}
async function ghostOps(argv: string[], bucket = A, deps = { open: quick }): Promise<Ran> {
  const lines: string[] = [];
  const code = await runOps(argv, envFor(bucket), (l) => lines.push(l), deps);
  return { code, lines, text: lines.join("\n") };
}

/** A small bucket the shape of production's: ghosts of two days (player and pool), profiles, and IDENT-1's four new prefixes. */
const PLAYER_ID = "player-secret-id-0001";
const OBJECTS: Record<string, string> = {
  "ghosts/bb-0.12.0/d01/pool/g-pool-1.json": '{"id":"g-pool-1"}',
  "ghosts/bb-0.12.0/d01/pool/g-pool-2.json": '{"id":"g-pool-2"}',
  "ghosts/bb-0.12.0/d03/player/g-player-1.json": '{"id":"g-player-1"}',
  "ghosts/bb-0.12.0/d03/player/g-player-2.json": '{"id":"g-player-2","pad":"é ü 漢字"}',
  [`profiles/${PLAYER_ID}.json`]: '{"counters":{"runs":3}}',
  "profiles/player-secret-id-0002.json": '{"counters":{"runs":9}}',
  "players/linked-player-0001.json": '{"keys":["k1"]}',
  "tombstones/deleted-player-0001.json": '{"at":1,"ids":["x"]}',
  "links/keys/key-id-0001.json": '{"player":"p"}',
  "links/steam/765611980000001.json": '{"player":"p"}',
  "linkcodes/0123456789abcdef.json": '{"expiresAt":2}',
};
function fill(bucket: string, extra: Record<string, string> = {}): void {
  for (const [k, v] of Object.entries({ ...OBJECTS, ...extra })) fake.putObject(bucket, k, v, Date.parse("2026-10-20T12:00:00Z"));
}
const keysOf = (bucket: string) => fake.keys(bucket);
const bytesOf = (bucket: string, key: string) => fake.buckets.get(bucket)!.get(key)!.body;
const OUT = () => join(root, "out");

/** Take a snapshot of A into root/out; the new snapshot directory. */
async function takeSnapshot(extra: string[] = []): Promise<string> {
  const r = await ghostOps(["snapshot", "--out", OUT(), ...extra]);
  expect(r.code, r.text).toBe(0);
  const dirs = (await readdir(OUT(), { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.endsWith(".partial")).map((d) => d.name).sort();
  return join(OUT(), dirs[dirs.length - 1]);
}
const manifestOf = async (dir: string): Promise<Manifest> => parseManifest(await readFile(join(dir, MANIFEST_FILE), "utf8"));
const puts = (bucket: string) => fake.requests.filter((r) => r.op === "PUT" && r.bucket === bucket);

describe("S4 ghost-ops: the command line", () => {
  it("--help needs no settings at all, exits 0 and lists every command", async () => {
    const lines: string[] = [];
    expect(await runOps(["--help"], {}, (l) => lines.push(l))).toBe(0);
    for (const c of COMMANDS) expect(lines.join("\n")).toContain(c);
    expect(lines.join("\n")).toBe(USAGE);
    expect(await runOps(["verify", "--help"], {}, () => {})).toBe(0);
    expect(await runOps(["help"], {}, () => {})).toBe(0);
  });

  it("usage errors are exit 2 with the usage text, and nothing is read", async () => {
    const bad: string[][] = [
      [], ["frobnicate"], ["snapshot"], ["snapshot", "--out"], ["snapshot", "--out", "x", "--apply"], ["snapshot", "--out", "x", "--prefix", "../up"],
      ["snapshot", "--out", "x", "--prefix", "/abs"], ["snapshot", "--out", "x", "--concurrency", "0"], ["snapshot", "--out", "x", "--concurrency", "65"],
      ["snapshot", "--out", "x", "--concurrency", "many"], ["snapshot", "--out", "x", "extra"], ["verify"], ["verify", "d", "--apply"], ["verify", "a", "b"],
      ["restore"], ["restore", "d", "--exact"], ["restore", "d", "--out", "x"], ["check-health"], ["check-health", "http://x", "--timeout", "0"],
      ["tigris-snapshot", "--name", "a;b"], ["tigris-snapshot", "--name", ""], ["tigris-snapshot", "extra"], ["drill"], ["drill", "d", "--rules", "nonsense"], ["snapshot", "--bogus"],
    ];
    for (const argv of bad) {
      const lines: string[] = [];
      expect(await runOps(argv, envFor(A), (l) => lines.push(l)), argv.join(" ")).toBe(2);
      expect(lines.join("\n"), argv.join(" ")).toContain("usage: ghost-ops");
    }
    expect(fake.requests).toHaveLength(0);
    expect(() => parseOpsArgs(["snapshot"])).toThrow(UsageError);
  });

  it("parses every option, with its defaults", () => {
    expect(parseOpsArgs(["snapshot", "--out", "d", "--prefix", "profiles/", "--concurrency", "3"])).toMatchObject({ command: "snapshot", out: "d", prefix: "profiles/", concurrency: 3 });
    expect(parseOpsArgs(["snapshot", "--out", "d"])).toMatchObject({ prefix: "", concurrency: 8, exact: false, apply: false, force: false });
    expect(parseOpsArgs(["verify", "d", "--exact"])).toMatchObject({ command: "verify", target: "d", exact: true });
    expect(parseOpsArgs(["--force", "restore", "d", "--apply"])).toMatchObject({ command: "restore", target: "d", apply: true, force: true });
    expect(parseOpsArgs(["check-health", "http://127.0.0.1:1", "--timeout", "3"])).toMatchObject({ command: "check-health", target: "http://127.0.0.1:1", timeoutS: 3 });
    expect(parseOpsArgs(["tigris-snapshot", "--name", "nightly 1"])).toMatchObject({ command: "tigris-snapshot", name: "nightly 1" });
  });

  it("the store commands need BB_GHOST_STORE=tigris: jsonl and missing settings are exit 2 and say so, without echoing a secret", async () => {
    const jsonl: string[] = [];
    expect(await runOps(["snapshot", "--out", OUT()], { BB_GHOST_STORE: "jsonl" }, (l) => jsonl.push(l))).toBe(2);
    expect(jsonl.join("\n")).toContain("BB_GHOST_STORE=tigris");
    const unset: string[] = [];
    expect(await runOps(["verify", root], {}, (l) => unset.push(l))).toBe(2);
    expect(unset.join("\n")).toContain("BB_GHOST_STORE=tigris");
    const partial: string[] = [];
    const env = { BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey };
    expect(await runOps(["restore", root], env, (l) => partial.push(l))).toBe(2);
    expect(partial.join("\n")).toContain("AWS_ENDPOINT_URL_S3");
    expect(partial.join("\n")).toContain("BUCKET_NAME");
    for (const t of [jsonl.join("\n"), unset.join("\n"), partial.join("\n")]) {
      expect(t).not.toContain(FAKE_CREDS.accessKeyId);
      expect(t).not.toContain(FAKE_CREDS.secretAccessKey);
    }
    expect(await runOps(["snapshot", "--out", OUT()], { ...envFor(A), BUCKET_NAME: "X" }, () => {})).toBe(2); // a bad bucket name
    await expect(lstat(OUT())).rejects.toThrow(); // nothing was created
  });
});

describe("S4 ghost-ops: key safety", () => {
  it("refuses a key with an empty segment, a dot segment, a backslash, a NUL, a control character or a leading slash; accepts the server's own keys", () => {
    for (const k of ["", "/lead", "a//b", "a/", "a/./b", "./a", "../a", "a/../b", "a/..", "a\\b", "a\u0000b", "a\nb", "a\u007fb", "x".repeat(1025)]) {
      expect(unsafeKeyReason(k), JSON.stringify(k)).not.toBeNull();
    }
    for (const k of Object.keys(OBJECTS)) expect(unsafeKeyReason(k), k).toBeNull();
    expect(unsafeKeyReason("a/..b/c.d/.e")).toBeNull(); // dots inside a name are fine
    expect(unsafeKeyReason("ghosts/bb-0.12.0/d03/player/é.json")).toBeNull();
  });

  it("shows a key under a private prefix as its prefix and a star, and cleans control characters out of printed text", () => {
    expect(shown(`profiles/${PLAYER_ID}.json`)).toBe("profiles/*");
    expect(shown("links/keys/abc.json")).toBe("links/*");
    expect(shown("tombstones/x.json")).toBe("tombstones/*");
    expect(shown("ghosts/bb-0.12.0/d03/player/g1.json")).toBe('"ghosts/bb-0.12.0/d03/player/g1.json"');
    expect(shown("a\u0000b")).toBe('"a\\u0000b"');
    expect(clean(`GET profiles/${PLAYER_ID}.json: HTTP 503; GET players/zzz.json x`)).toBe("GET profiles/*: HTTP 503; GET players/* x");
    expect(clean("a\u0000b\nc")).toBe("a b c");
  });
});

describe("S4 ghost-ops: snapshot", () => {
  it("copies the whole bucket, IDENT-1's prefixes included, into <out>/<stamp>/objects/<key> with a manifest written last; the bucket is only read", async () => {
    fill(A);
    const before = fake.requests.length;
    const dir = await takeSnapshot();
    const m = await manifestOf(dir);
    expect(m).toMatchObject({ format: "ghost-ops-snapshot-1", tool: "ghost-ops", bucket: A, prefix: "", count: Object.keys(OBJECTS).length, refused: 0 });
    expect(m.endpointHost).toBe(new URL(fake.endpoint).host);
    expect(m.objects.map((o) => o.key)).toEqual(Object.keys(OBJECTS).sort());
    expect(Date.parse(m.finishedAt)).toBeGreaterThanOrEqual(Date.parse(m.startedAt));
    for (const o of m.objects) {
      const bytes = await readFile(join(dir, "objects", ...o.key.split("/")));
      expect(sha256Hex(bytes), o.key).toBe(o.sha256);
      expect(bytes.length).toBe(o.size);
      expect(sha256Hex(bytesOf(A, o.key)), o.key).toBe(o.sha256); // the bucket's own bytes
      expect(o.contentType).toBe("application/json");
      expect(o.lastModified).toBe("2026-10-20T12:00:00.000Z");
    }
    expect(Object.keys(m.prefixes)).toEqual(["ghosts/", "linkcodes/", "links/", "players/", "profiles/", "tombstones/"]);
    expect(m.prefixes["ghosts/"]).toMatchObject({ count: 4 });
    expect(m.prefixes["links/"]).toMatchObject({ count: 2 });
    expect(m.bytes).toBe(Object.values(OBJECTS).reduce((s, v) => s + enc(v).length, 0));
    // only the bucket's reads: LIST pages (three keys a page) and one GET each; no PUT, no DELETE, no other bucket
    const mine = fake.requests.slice(before);
    expect(new Set(mine.map((r) => r.op))).toEqual(new Set(["LIST", "GET"]));
    expect(mine.filter((r) => r.op === "GET")).toHaveLength(Object.keys(OBJECTS).length);
    expect(mine.filter((r) => r.op === "LIST").length).toBeGreaterThanOrEqual(Math.ceil(Object.keys(OBJECTS).length / 3));
    expect(new Set(mine.map((r) => r.bucket))).toEqual(new Set([A]));
    expect(fake.count("DELETE")).toBe(0);
    expect(fake.count("PUT")).toBe(0);
  });

  it("directories are 0700 and files 0600 (it is player data); the copy is renamed from .partial only when complete", async () => {
    fill(A);
    const dir = await takeSnapshot();
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(OUT())).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, "objects"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, "objects", "profiles"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, "objects", "links", "keys"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, MANIFEST_FILE))).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, "objects", "profiles", `${PLAYER_ID}.json`))).mode & 0o777).toBe(0o600);
    expect((await readdir(OUT())).filter((n) => n.endsWith(".partial"))).toEqual([]);
    expect(/^\d{8}T\d{6}Z(-\d+)?$/.test(dir.slice(dir.lastIndexOf("/") + 1))).toBe(true);
    const again = await takeSnapshot(); // the same second: another directory, never over the first
    expect(again).not.toBe(dir);
    expect((await readdir(OUT())).length).toBe(2);
  });

  it("--prefix copies one prefix only, and verify then checks just that prefix", async () => {
    fill(A);
    const dir = await takeSnapshot(["--prefix", "profiles/"]);
    const m = await manifestOf(dir);
    expect(m.prefix).toBe("profiles/");
    expect(m.objects.map((o) => o.key)).toEqual([`profiles/${PLAYER_ID}.json`, "profiles/player-secret-id-0002.json"]);
    const v = await ghostOps(["verify", dir, "--exact"]);
    expect(v.code, v.text).toBe(0);
  });

  it("an object deleted between the listing and the read is skipped, not an error; --concurrency bounds the reads in flight", async () => {
    fill(A);
    let inflight = 0, peak = 0;
    const s3 = (): S3Options => ({ endpoint: fake.endpoint, region: "auto", bucket: A, ...FAKE_CREDS, addressing: "path", backoffMs: 1 });
    const inner = new RawS3(s3());
    const store: OpsStore = {
      where: inner.where, bucket: inner.bucket, host: inner.host, put: inner.put.bind(inner),
      async list(prefix) {
        const l = await inner.list(prefix);
        fake.deleteObject(A, "links/keys/key-id-0001.json"); // gone before the snapshot reads it
        return l;
      },
      async get(key) {
        inflight++;
        peak = Math.max(peak, inflight);
        await new Promise((r) => setTimeout(r, 5));
        try {
          return await inner.get(key);
        } finally {
          inflight--;
        }
      },
    };
    const lines: string[] = [];
    const code = await runOps(["snapshot", "--out", OUT(), "--concurrency", "2"], envFor(A), (l) => lines.push(l), { open: () => store });
    expect(code, lines.join("\n")).toBe(0);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBe(2);
    expect(lines.join("\n")).toContain("1 object deleted between the listing and the read");
    const dirs = await readdir(OUT());
    const m = await manifestOf(join(OUT(), dirs[0]));
    expect(m.count).toBe(Object.keys(OBJECTS).length - 1);
    expect(m.objects.map((o) => o.key)).not.toContain("links/keys/key-id-0001.json");
  });

  it("an empty bucket is a complete, empty snapshot", async () => {
    const dir = await takeSnapshot();
    const m = await manifestOf(dir);
    expect(m).toMatchObject({ count: 0, bytes: 0, objects: [], prefixes: {} });
    expect((await ghostOps(["verify", dir, "--exact"])).code).toBe(0);
  });

  it("unsafe keys are refused, counted, named and exit 1 at the end; the rest is copied and nothing leaves the snapshot directory", async () => {
    fill(A);
    const hostile = ["/leading", "a//b", "x/../y", "./dot", "dir/", "back\\slash", "nul\u0000byte", "ctl\nchar"];
    for (const k of hostile) fake.putObject(A, k, "hostile");
    const r = await ghostOps(["snapshot", "--out", OUT()]);
    expect(r.code).toBe(1);
    expect(r.text).toContain(`REFUSED ${hostile.length} keys`);
    for (const [k, why] of [["/leading", "leading slash"], ["a//b", "empty segment"], ["x/../y", '".." segment'], ["./dot", '"." segment'], ["dir/", "empty segment"], ["back\\slash", "backslash"], ["nul\u0000byte", "NUL byte"], ["ctl\nchar", "control character"]]) {
      expect(r.text, k).toContain(`${JSON.stringify(k)}  (${why})`);
    }
    const dirs = await readdir(OUT());
    expect(dirs).toHaveLength(1);
    expect(dirs[0].endsWith(".partial")).toBe(false); // complete without them
    const m = await manifestOf(join(OUT(), dirs[0]));
    expect(m.refused).toBe(hostile.length);
    expect(m.count).toBe(Object.keys(OBJECTS).length);
    expect(m.objects.map((o) => o.key)).toEqual(Object.keys(OBJECTS).sort());
    expect(await readdir(root)).toEqual(["out"]); // nothing was written beside the snapshot directory
    // the bucket was never asked for a hostile key
    expect(fake.requests.filter((q) => q.op === "GET").map((q) => q.key).some((k) => hostile.includes(k))).toBe(false);
    // verify --exact sees them as keys the snapshot lacks; plain verify does not fail on them
    expect((await ghostOps(["verify", join(OUT(), dirs[0])])).code).toBe(0);
    const exact = await ghostOps(["verify", join(OUT(), dirs[0]), "--exact"]);
    expect(exact.code).toBe(1);
    expect(exact.text).toContain(`in the bucket but not in the snapshot: ${hostile.length}`);
  });

  it("a key that cannot be a file here (a key that is also a directory) is refused the same way", async () => {
    fill(A, { "colliding": "i am a file", "colliding/child.json": "i am under a directory" });
    const r = await ghostOps(["snapshot", "--out", OUT()]);
    expect(r.code).toBe(1);
    expect(r.text).toMatch(/cannot be stored as a file \((ENOTDIR|EISDIR|EEXIST)\)/);
    const dirs = await readdir(OUT());
    const m = await manifestOf(join(OUT(), dirs[0]));
    expect(m.refused).toBe(1);
    expect(m.count).toBe(Object.keys(OBJECTS).length + 1);
  });

  it("a storage fault mid-snapshot exits 1 and leaves only a .partial directory, which is not a snapshot", async () => {
    fill(A);
    fake.failNext(60, 503, "GET");
    const r = await ghostOps(["snapshot", "--out", OUT()]);
    fake.clearFaults();
    expect(r.code).toBe(1);
    expect(r.text).toMatch(/HTTP 503/);
    expect(r.text).toContain("is not a snapshot");
    const dirs = await readdir(OUT());
    expect(dirs).toHaveLength(1);
    expect(dirs[0].endsWith(".partial")).toBe(true);
    expect((await readdir(join(OUT(), dirs[0]))).includes(MANIFEST_FILE)).toBe(false); // the manifest is written last
    for (const cmd of ["verify", "restore"]) {
      const v = await ghostOps([cmd, join(OUT(), dirs[0])]);
      expect(v.code, cmd).toBe(1);
      expect(v.text).toContain("unfinished snapshot");
    }
    expect(fake.count("PUT")).toBe(0);
  });

  it("a storage fault never puts a key under a private prefix in the output", async () => {
    fill(A);
    fake.failNext(60, 500, "GET");
    const r = await ghostOps(["snapshot", "--out", OUT(), "--prefix", "profiles/"]);
    fake.clearFaults();
    expect(r.code).toBe(1);
    expect(r.text).toContain("profiles/*");
    expect(r.text).not.toContain(PLAYER_ID);
    expect(r.text).not.toContain("player-secret-id");
  });

  it("no output and no manifest holds a secret or a player id: no access key, no secret key, no signature", async () => {
    fill(A);
    const texts: string[] = [];
    const dir = await takeSnapshot();
    const s = await ghostOps(["snapshot", "--out", OUT()]);
    texts.push(s.text);
    for (const argv of [["verify", dir], ["verify", dir, "--exact"], ["restore", dir], ["restore", dir, "--apply"], ["restore", dir, "--apply", "--force"]]) {
      texts.push((await ghostOps(argv, argv[0] === "verify" ? A : B)).text);
    }
    texts.push(await readFile(join(dir, MANIFEST_FILE), "utf8").then((t) => t.replace(/"key": "[^"]*"/g, "")));
    for (const t of texts) {
      expect(t).not.toContain(FAKE_CREDS.accessKeyId);
      expect(t).not.toContain(FAKE_CREDS.secretAccessKey);
      expect(t).not.toMatch(/AWS4-HMAC|Signature=|x-amz|authorization/i);
    }
    for (const t of texts.slice(0, -1)) {
      expect(t).not.toContain("player-secret-id");
      expect(t).not.toContain("linked-player");
      expect(t).not.toContain("deleted-player");
    }
    // the manifest does hold the bucket name and the endpoint host, and nothing else about the connection
    const m = await manifestOf(dir);
    expect(JSON.stringify({ ...m, objects: [] })).not.toMatch(/AKID|secret|signature/i);
  });
});

describe("S4 ghost-ops: verify", () => {
  it("passes on the bucket it came from, byte for byte; extra keys in the bucket are listed by prefix and fail only --exact", async () => {
    fill(A);
    const dir = await takeSnapshot();
    const ok = await ghostOps(["verify", dir, "--exact"]);
    expect(ok.code, ok.text).toBe(0);
    expect(ok.text).toContain(`${Object.keys(OBJECTS).length} of ${Object.keys(OBJECTS).length} objects match`);
    fake.putObject(A, "ghosts/bb-0.12.0/d04/player/new.json", "{}");
    fake.putObject(A, "profiles/player-secret-id-0003.json", "{}");
    const plain = await ghostOps(["verify", dir]);
    expect(plain.code).toBe(0);
    expect(plain.text).toContain("in the bucket but not in the snapshot: 2 (ghosts/ 1, profiles/ 1)");
    const exact = await ghostOps(["verify", dir, "--exact"]);
    expect(exact.code).toBe(1);
    expect(exact.text).toContain("--exact makes this a failure");
    expect(fake.count("DELETE") + fake.count("PUT")).toBe(0); // verify only reads (putObject above is the test's own, not a logged request)
  });

  it("fails when an object is missing from the bucket or has other bytes in it, and names them by prefix", async () => {
    fill(A);
    const dir = await takeSnapshot();
    fake.deleteObject(A, "ghosts/bb-0.12.0/d03/player/g-player-1.json");
    fake.putObject(A, `profiles/${PLAYER_ID}.json`, '{"counters":{"runs":4}}');
    const r = await ghostOps(["verify", dir]);
    expect(r.code).toBe(1);
    expect(r.text).toContain("MISSING from the bucket: 1 (ghosts/ 1)");
    expect(r.text).toContain("DIFFERENT bytes in the bucket: 1 (profiles/ 1)");
    expect(r.text).toContain("verify FAILED");
    expect(r.text).not.toContain(PLAYER_ID);
  });

  it("a tampered file fails verify BEFORE the bucket is read, and so does a missing file, a wrong size, an extra file and a link", async () => {
    fill(A);
    const dir = await takeSnapshot();
    const file = join(dir, "objects", "profiles", `${PLAYER_ID}.json`);
    const original = await readFile(file);
    const store0 = fake.requests.length;
    await writeFile(file, enc('{"counters":{"runs":99}}'), { mode: 0o600 }); // other bytes
    const r1 = await ghostOps(["verify", dir]);
    expect(r1.code).toBe(1);
    expect(r1.text).toContain("the snapshot itself is damaged");
    expect(r1.text).toContain("profiles/*");
    expect(r1.text).toContain("the bucket was not read");
    expect(fake.requests.length).toBe(store0); // not one request
    await writeFile(file, original, { mode: 0o600 });
    expect((await ghostOps(["verify", dir])).code).toBe(0); // whole again: this one does read the bucket
    const store1 = fake.requests.length;
    await rm(join(dir, "objects", "ghosts", "bb-0.12.0", "d01", "pool", "g-pool-1.json"));
    const r2 = await ghostOps(["verify", dir]);
    expect(r2.code).toBe(1);
    expect(r2.text).toContain("the file is missing");
    await writeFile(join(dir, "objects", "ghosts", "bb-0.12.0", "d01", "pool", "g-pool-1.json"), enc("{}"), { mode: 0o600 });
    const r3 = await ghostOps(["verify", dir]);
    expect(r3.text).toContain("the file has 2 bytes, the manifest says");
    await writeFile(join(dir, "objects", "ghosts", "bb-0.12.0", "d01", "pool", "g-pool-1.json"), enc(OBJECTS["ghosts/bb-0.12.0/d01/pool/g-pool-1.json"]), { mode: 0o600 });
    await writeFile(join(dir, "objects", "zzz-extra.json"), enc("{}"), { mode: 0o600 });
    const r4 = await ghostOps(["verify", dir]);
    expect(r4.code).toBe(1);
    expect(r4.text).toContain("a file the manifest does not list");
    expect(fake.requests.length).toBe(store1); // every damaged-snapshot verify above read nothing from the bucket
  });

  it("a manifest that is not valid fails verify and restore (exit 1) and a directory that is not a snapshot is exit 2", async () => {
    fill(A);
    const dir = await takeSnapshot();
    const good = await readFile(join(dir, MANIFEST_FILE), "utf8");
    for (const [bad, why] of [
      ["{not json", "not valid JSON"],
      [good.replace('"ghost-ops-snapshot-1"', '"other"'), "format"],
      [good.replace(/"count": \d+/, '"count": 99'), "count 99"],
      [good.replace(/"sha256":"[0-9a-f]{64}"/, '"sha256":"zz"'), "no sha256"],
    ] as const) {
      await writeFile(join(dir, MANIFEST_FILE), bad, { mode: 0o600 });
      for (const cmd of ["verify", "restore"]) {
        const r = await ghostOps([cmd, dir], B);
        expect(r.code, `${cmd}: ${why}`).toBe(1);
        expect(r.text, why).toContain(why);
      }
    }
    expect((await ghostOps(["verify", root])).code).toBe(2); // no manifest.json
    expect((await ghostOps(["verify", join(root, "nope")])).code).toBe(2);
    expect(fake.count("PUT")).toBe(0);
  });
});

describe("S4 ghost-ops: restore", () => {
  it("is a dry run unless --apply: it says what it would write, by prefix, with bytes, and writes nothing", async () => {
    fill(A);
    const dir = await takeSnapshot();
    const r = await ghostOps(["restore", dir], B);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain("DRY RUN");
    expect(r.text).toContain(`would write ${Object.keys(OBJECTS).length} objects`);
    for (const p of ["ghosts/", "profiles/", "players/", "links/", "linkcodes/", "tombstones/"]) expect(r.text).toContain(p);
    expect(r.text).toMatch(/ghosts\/\s+4 objects\s+\d+(\.\d)? B/);
    expect(keysOf(B)).toEqual([]);
    expect(puts(B)).toHaveLength(0);
  });

  it("--apply writes the snapshot into the empty bucket with the same bytes and content types, private data first and the seed pool last, then verifies --exact", async () => {
    fill(A);
    const sink = new RawS3({ endpoint: fake.endpoint, region: "auto", bucket: A, ...FAKE_CREDS, addressing: "path" });
    await sink.put("ghosts/bb-0.12.0/d05/player/g-text.json", enc("plain text, not json"), "text/plain"); // another content type
    const dir = await takeSnapshot();
    const r = await ghostOps(["restore", dir, "--apply"], B);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain("verifying --exact");
    expect(r.text).toContain("restore OK");
    expect(keysOf(B)).toEqual(keysOf(A));
    for (const k of keysOf(A)) {
      expect(bytesOf(B, k), k).toEqual(bytesOf(A, k));
      expect(fake.buckets.get(B)!.get(k)!.type, k).toBe(fake.buckets.get(A)!.get(k)!.type);
    }
    expect(fake.buckets.get(B)!.get("ghosts/bb-0.12.0/d05/player/g-text.json")!.type).toBe("text/plain");
    // the order of the writes: private data, then anything else, then player ghosts, then the pool
    const order = puts(B).map((q) => q.key);
    expect(order).toHaveLength(keysOf(A).length);
    const rankOf = (k: string) => (/^(profiles|players|links|linkcodes|tombstones)\//.test(k) ? 0 : k.includes("/pool/") ? 3 : 2);
    const ranks = order.map(rankOf);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks[0]).toBe(0);
    expect(ranks[ranks.length - 1]).toBe(3);
    expect(fake.count("DELETE")).toBe(0);
    expect(fake.count("PUT", A)).toBe(1); // the one the test itself made
    // A was only read
    expect(fake.requests.filter((q) => q.bucket === A && q.op !== "LIST" && q.op !== "GET" && q.key !== "ghosts/bb-0.12.0/d05/player/g-text.json")).toHaveLength(0);
  });

  it("refuses a bucket that is not empty without --force (exit 2, nothing written), and --force skips what is identical: a re-run writes nothing new", async () => {
    fill(A);
    const dir = await takeSnapshot();
    expect((await ghostOps(["restore", dir, "--apply"], B)).code).toBe(0);
    const writes = puts(B).length;
    const refused = await ghostOps(["restore", dir, "--apply"], B);
    expect(refused.code).toBe(2);
    expect(refused.text).toContain("REFUSED: the bucket is not empty");
    expect(refused.text).toContain("--force");
    expect(puts(B)).toHaveLength(writes);
    const dry = await ghostOps(["restore", dir], B);
    expect(dry.code).toBe(2); // the dry run says so too
    const again = await ghostOps(["restore", dir, "--apply", "--force"], B);
    expect(again.code, again.text).toBe(0);
    expect(again.text).toContain("writing 0 objects");
    expect(again.text).toContain(`${Object.keys(OBJECTS).length} already identical, skipped`);
    expect(puts(B)).toHaveLength(writes); // not one PUT more
    expect(again.text).toContain("verifying:"); // the bucket did not start empty: plain verify
  });

  it("says so when the target is the bucket the snapshot came from, and refuses it (it is not empty) without --force", async () => {
    fill(A);
    const dir = await takeSnapshot();
    const r = await ghostOps(["restore", dir, "--apply"], A);
    expect(r.code).toBe(2);
    expect(r.text).toContain("NOTE: the target is the bucket this snapshot was taken from (bb-a)");
    expect(r.text).toContain("REFUSED: the bucket is not empty");
    expect(fake.count("PUT")).toBe(0);
    expect((await ghostOps(["restore", dir], B)).text).not.toContain("NOTE: the target is the bucket");
  });

  it("a cut restore is finished by running it again with --force: only the missing and the different objects are written, and nothing is deleted", async () => {
    fill(A);
    const dir = await takeSnapshot();
    expect((await ghostOps(["restore", dir, "--apply"], B)).code).toBe(0);
    const before = puts(B).length;
    fake.deleteObject(B, "tombstones/deleted-player-0001.json"); // as if the first run was cut before it
    fake.deleteObject(B, "ghosts/bb-0.12.0/d03/player/g-player-2.json");
    fake.putObject(B, "profiles/player-secret-id-0002.json", '{"counters":{"runs":1}}'); // a different object under a snapshot key
    fake.putObject(B, "stray/not-in-the-snapshot.json", "{}");
    const r = await ghostOps(["restore", dir, "--apply", "--force"], B);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain("1 would overwrite a different object");
    expect(puts(B).length - before).toBe(3);
    expect(bytesOf(B, "profiles/player-secret-id-0002.json")).toEqual(bytesOf(A, "profiles/player-secret-id-0002.json"));
    expect(keysOf(B)).toContain("stray/not-in-the-snapshot.json"); // never deleted
    expect(fake.count("DELETE")).toBe(0);
    expect(r.text).toContain("in the bucket but not in the snapshot: 1");
  });

  it("a tampered snapshot file stops the restore before any PUT; a file that changes after the check is not written", async () => {
    fill(A);
    const dir = await takeSnapshot();
    const file = join(dir, "objects", "players", "linked-player-0001.json");
    const original = await readFile(file);
    await writeFile(file, enc("{\"keys\":[\"evil\"]}"), { mode: 0o600 });
    for (const argv of [["restore", dir], ["restore", dir, "--apply"]]) {
      const r = await ghostOps(argv, B);
      expect(r.code, argv.join(" ")).toBe(1);
      expect(r.text).toContain("the snapshot is damaged");
      expect(r.text).toContain("nothing was written");
    }
    expect(puts(B)).toHaveLength(0);
    expect(keysOf(B)).toEqual([]);
    await writeFile(file, original, { mode: 0o600 });
    // the file changes between the check and its PUT (a store double flips it when the first PUT starts)
    const inner = new RawS3({ endpoint: fake.endpoint, region: "auto", bucket: B, ...FAKE_CREDS, addressing: "path", backoffMs: 1 });
    let flipped = false;
    const store: OpsStore = {
      where: inner.where, bucket: inner.bucket, host: inner.host, list: inner.list.bind(inner), get: inner.get.bind(inner),
      async put(key, bytes, type) {
        if (!flipped) {
          flipped = true;
          await writeFile(join(dir, "objects", "tombstones", "deleted-player-0001.json"), enc("{}"), { mode: 0o600 });
        }
        return inner.put(key, bytes, type);
      },
    };
    const lines: string[] = [];
    const code = await runOps(["restore", dir, "--apply", "--concurrency", "1"], envFor(B), (l) => lines.push(l), { open: () => store }); // one at a time: the tombstone is read after the flip
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("the file changed since the check");
    expect(keysOf(B)).not.toContain("tombstones/deleted-player-0001.json");
  });

  it("a manifest that names an unsafe key never reads or writes it: refused, counted, named, exit 1 at the end; everything else is restored", async () => {
    fill(A);
    const dir = await takeSnapshot();
    // a hostile manifest: one more entry whose key walks out of the snapshot and whose hash is the hash of a file outside it
    await mkdir(join(root, "secrets"), { recursive: true });
    const outside = enc("do not upload me");
    await writeFile(join(root, "secrets", "x.txt"), outside, { mode: 0o600 });
    const m = await manifestOf(dir);
    const hostile = ["../../secrets/x.txt", "/etc/hostname", "a//b", "..", "x\\y"];
    const forged: Manifest = {
      ...m, count: m.count + hostile.length, bytes: m.bytes + outside.length * hostile.length,
      objects: [...m.objects, ...hostile.map((key) => ({ key, size: outside.length, sha256: sha256Hex(outside), lastModified: null, contentType: "text/plain" }))],
    };
    await writeFile(join(dir, MANIFEST_FILE), JSON.stringify(forged), { mode: 0o600 });
    const r = await ghostOps(["restore", dir, "--apply"], B);
    expect(r.code, r.text).toBe(1);
    expect(r.text).toContain(`REFUSED ${hostile.length} unsafe keys in the manifest`);
    for (const k of hostile) expect(r.text).toContain(JSON.stringify(k));
    expect(keysOf(B).sort()).toEqual(Object.keys(OBJECTS).sort()); // only the honest keys went in
    expect(puts(B).map((q) => q.key).sort()).toEqual(Object.keys(OBJECTS).sort());
    const v = await ghostOps(["verify", dir]); // verify: an unsafe key in a manifest is damage, found before the bucket is read
    expect(v.code).toBe(1);
    expect(v.text).toContain("an unsafe key in the manifest");
  });

  it("restore never deletes: the bucket client has no delete, and the fake logs none across snapshot, verify and restore", async () => {
    fill(A);
    const dir = await takeSnapshot();
    await ghostOps(["restore", dir, "--apply"], B);
    await ghostOps(["restore", dir, "--apply", "--force"], B);
    await ghostOps(["verify", dir, "--exact"], B);
    expect(fake.count("DELETE")).toBe(0);
    expect(Object.keys(new RawS3({ endpoint: fake.endpoint, region: "auto", bucket: A, ...FAKE_CREDS, addressing: "path" }))).not.toContain("delete");
    expect((RawS3.prototype as unknown as Record<string, unknown>).delete).toBeUndefined();
  });

  it("a storage fault during the writes is a short write: exit 1 with the count, and the same command with --force finishes it", async () => {
    fill(A);
    const dir = await takeSnapshot();
    fake.failNext(60, 503, "PUT");
    const cut = await ghostOps(["restore", dir, "--apply"], B);
    fake.clearFaults();
    expect(cut.code).toBe(1);
    expect(cut.text).toContain("restore stopped:");
    expect(cut.text).toContain("with --force");
    expect(keysOf(B).length).toBeLessThan(Object.keys(OBJECTS).length);
    const done = await ghostOps(["restore", dir, "--apply", "--force"], B);
    expect(done.code, done.text).toBe(0);
    expect(keysOf(B)).toEqual(keysOf(A));
  });
});
