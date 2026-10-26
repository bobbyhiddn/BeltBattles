// S4 (BRIEF-S4 goal 2): THE DRILL, as a test. Bucket A is filled through the REAL server (createGhostServer over the Tigris store on tools/fakeS3.ts, the real deck check): the
// bundled seed pool, honest player uploads on five days (run dusks and two endless dusks, four players), and PUT /v1/profile for the four players. Raw objects under players/,
// tombstones/, links/keys/, links/steam/ and linkcodes/ stand in for IDENT-1's keys. Then ghost-ops snapshots A, restores it into the empty bucket B and verifies B with --exact;
// a SECOND server booted on B must give the same per-(rules, day) counts as A (ghost-admin's own `list` function), the same stored profiles and the same answers to the same
// requests. The fake lists SEVEN keys a page, so every listing paginates. The failure cases then run on this bigger bucket. The snapshot, restore and verify times
// for this object count are printed (and kept in the REPORT). Nothing here imports tools/samplePool: the seed pool is server/seedPoolData.ts through seedStore.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION } from "../src/sim/content";
import { ENDLESS, setEndless } from "../src/sim/endless";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { KEY_HEADER, PROFILE_PREFIX, SIG_HEADER, type Identity } from "../src/net/identity";
import { encodeWire } from "../src/net/profileWire";
import type { GhostSnapshot } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { clean, MANIFEST_FILE, parseManifest, runOps, type Out } from "../server/ops";
import { RawS3, type OpsStore } from "../server/opsS3";
import { countDays, TigrisAdmin } from "../server/ghostAdmin";
import { profileStoreFor } from "../server/profileStore";
import { seedStore } from "../server/seed";
import type { S3Options } from "../server/s3";
import type { TigrisStore } from "../server/tigrisStore";
import type { FakeS3 } from "../tools/fakeS3";
import { playEndless } from "./endless1.honest";
import { FAKE_CREDS, s3For, startFake, tigrisFor } from "./netStores";
import { ownedBy, signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { NOW, earnedWire } from "./profileupWire";

setPlayerName(TEST_NAME);
const A = "bb-prod", B = "bb-restored";
const PAGE = 7;

let fake: FakeS3;
let root: string;
let ids: Identity[];
let run: GhostSnapshot[]; // a weaver run's dusks, days 1-10
let endless: GhostSnapshot[]; // endless dusks after its win: days 11 and 12
let serverA: GhostServer;
const servers: GhostServer[] = [];

const envFor = (bucket: string): Record<string, string> => ({
  BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
  AWS_ENDPOINT_URL_S3: fake.endpoint, BUCKET_NAME: bucket, BB_GHOST_S3_ADDRESSING: "path",
});
const quick = (s3: S3Options, say: Out): OpsStore => new RawS3({ ...s3, backoffMs: 1, timeoutMs: 3000, log: (l) => say(clean(l)) });
async function ghostOps(argv: string[], bucket: string): Promise<{ code: number; text: string; ms: number }> {
  const lines: string[] = [];
  const t0 = performance.now();
  const code = await runOps(argv, envFor(bucket), (l) => lines.push(l), { open: quick });
  return { code, text: lines.join("\n"), ms: performance.now() - t0 };
}
function serve(store: TigrisStore): GhostServer {
  const app = createGhostServer({ store, uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: () => 0, now: () => NOW });
  servers.push(app);
  return app;
}

beforeAll(async () => {
  setEndless(true);
  let t = Date.parse("2026-10-26T00:00:00Z");
  fake = await startFake({ buckets: [A, B], pageSize: PAGE, clock: () => (t += 1000) }); // seven keys a page; every object gets its own LastModified
  root = await mkdtemp(join(tmpdir(), "bb-s4-drill-"));
  ids = [await testIdentity(0), await testIdentity(1), await testIdentity(2), await testIdentity(3)];
  const played = playEndless("weaver", 42, ids[0].playerId, { buys: 0, until: 12 });
  run = played.runSnaps;
  endless = played.endlessSnaps;
}, 300_000);
afterAll(async () => {
  setEndless(ENDLESS);
  for (const s of servers) await s.close();
  await fake?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

const base = (app: GhostServer, port: number) => `http://127.0.0.1:${port}`;
async function postGhost(url: string, who: Identity, s: GhostSnapshot): Promise<number> {
  const body = JSON.stringify(s);
  return (await fetch(`${url}/v1/ghosts`, { method: "POST", headers: await signedHeaders(who, body), body })).status;
}
async function putProfile(url: string, who: Identity, runs: number): Promise<{ status: number; body: string }> {
  const text = encodeWire(earnedWire({ runs, runsFinished: runs, duskWins: runs * 3, bestDay: Math.min(10, runs + 2) }));
  const { key, sig } = await who.sign(new TextEncoder().encode(text), PROFILE_PREFIX);
  const res = await fetch(`${url}/v1/profile`, { method: "PUT", headers: { "content-type": "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig }, body: text });
  return { status: res.status, body: await res.text() };
}
const getJson = async (url: string): Promise<{ status: number; body: string }> => {
  const res = await fetch(url);
  return { status: res.status, body: await res.text() };
};

/** What the drill measured, for the REPORT. */
const measured: Record<string, number> = {};
let snapDir = "";
let urlA = "", urlB = "";
let appB: GhostServer;
let objectCount = 0;

describe("S4 the drill: fill A through the real server, snapshot it, restore into B, verify B --exact", () => {
  it("fills bucket A: the bundled seed pool, honest uploads on five days by four players, four profiles, and raw objects for IDENT-1's keys", async () => {
    const storeA = tigrisFor(fake, A, {}, { timeoutMs: 5000 });
    const seeded = await seedStore(storeA);
    expect(seeded.entries).toBeGreaterThanOrEqual(100);
    serverA = serve(storeA);
    urlA = base(serverA, await serverA.listen(0));
    let uploads = 0;
    for (const who of ids) {
      for (const day of [3, 5, 10]) {
        const snap = ownedBy({ ...run.find((s) => s.day === day)!, runId: `s4-${who.playerId.slice(0, 6)}-${day}` }, who);
        expect(await postGhost(urlA, who, snap), `day ${day}`).toBe(201);
        uploads++;
      }
    }
    for (const s of endless) {
      expect(await postGhost(urlA, ids[0], ownedBy({ ...s, runId: `s4-endless-${s.day}` }, ids[0])), `endless day ${s.day}`).toBe(201);
      uploads++;
    }
    expect(uploads).toBe(14);
    for (const [i, who] of ids.entries()) expect((await putProfile(urlA, who, i + 2)).status).toBe(200);
    // raw objects standing in for IDENT-1's keys (the server of this branch does not write them)
    fake.putObject(A, `players/${ids[0].playerId}.json`, JSON.stringify({ keys: ["k-device-2"], steam: [], at: NOW }));
    fake.putObject(A, "tombstones/deleted-player-0001.json", JSON.stringify({ at: NOW, ids: ["deleted-player-0001", "deleted-key-0001"] }));
    fake.putObject(A, "links/keys/k-device-2.json", JSON.stringify({ player: ids[0].playerId, at: NOW }));
    fake.putObject(A, "links/keys/k-device-3.json", JSON.stringify({ player: ids[0].playerId, at: NOW }));
    fake.putObject(A, "links/steam/76561198000000001.json", JSON.stringify({ player: ids[0].playerId, at: NOW }));
    fake.putObject(A, "linkcodes/0123456789abcdef0123456789abcdef.json", JSON.stringify({ player: ids[0].playerId, expiresAt: NOW + 600_000 }));
    objectCount = fake.keys(A).length;
    expect(fake.keys(A, "ghosts/").filter((k) => k.includes("/player/"))).toHaveLength(14);
    expect(fake.keys(A, "profiles/")).toHaveLength(4);
    expect(objectCount).toBeGreaterThanOrEqual(seeded.entries + 14 + 4 + 6);
    expect(Math.ceil(objectCount / PAGE)).toBeGreaterThan(20); // a listing of the whole bucket is more than twenty pages
  }, 240_000);

  it("snapshots A: every object, with a manifest; A is only read", async () => {
    const before = fake.requests.length;
    const r = await ghostOps(["snapshot", "--out", join(root, "snaps")], A);
    expect(r.code, r.text).toBe(0);
    measured.snapshotMs = r.ms;
    const names = (await readdir(join(root, "snaps"))).filter((n) => !n.endsWith(".partial"));
    expect(names).toHaveLength(1);
    snapDir = join(root, "snaps", names[0]);
    const m = parseManifest(await readFile(join(snapDir, MANIFEST_FILE), "utf8"));
    expect(m.count).toBe(objectCount);
    expect(m.objects.map((o) => o.key)).toEqual(fake.keys(A));
    const FAKE_DEFAULT = Date.parse("2026-09-24T00:00:00.000Z"); // what the fake lists for an object it was given directly (putObject), with no clock
    for (const o of m.objects) expect(o.lastModified, o.key).toBe(new Date(fake.buckets.get(A)!.get(o.key)!.modified ?? FAKE_DEFAULT).toISOString());
    expect(Object.keys(m.prefixes)).toEqual(["ghosts/", "linkcodes/", "links/", "players/", "profiles/", "tombstones/"]);
    const mine = fake.requests.slice(before);
    expect(new Set(mine.map((q) => q.op))).toEqual(new Set(["LIST", "GET"]));
    expect(mine.filter((q) => q.op === "LIST").length).toBeGreaterThan(20); // paginated
    expect(mine.filter((q) => q.op === "GET")).toHaveLength(objectCount);
    expect(fake.count("DELETE")).toBe(0);
  });

  it("restores into the empty bucket B (a dry run first), then verifies B --exact", async () => {
    const dry = await ghostOps(["restore", snapDir], B);
    expect(dry.code, dry.text).toBe(0);
    expect(dry.text).toContain(`would write ${objectCount} objects`);
    expect(fake.keys(B)).toEqual([]);
    const r = await ghostOps(["restore", snapDir, "--apply"], B);
    expect(r.code, r.text).toBe(0);
    measured.restoreMs = r.ms;
    expect(r.text).toContain("restore OK");
    expect(fake.keys(B)).toEqual(fake.keys(A));
    const v = await ghostOps(["verify", snapDir, "--exact"], B);
    expect(v.code, v.text).toBe(0);
    measured.verifyMs = v.ms;
    expect(v.text).toContain(`${objectCount} of ${objectCount} objects match`);
    for (const k of fake.keys(A)) {
      expect(fake.getObject(B, k), k).toBe(fake.getObject(A, k));
      expect(fake.buckets.get(B)!.get(k)!.type, k).toBe(fake.buckets.get(A)!.get(k)!.type);
    }
    const puts = fake.requests.filter((q) => q.op === "PUT" && q.bucket === B).map((q) => q.key);
    const firstGhost = puts.findIndex((k) => k.startsWith("ghosts/"));
    expect(puts.slice(0, firstGhost).every((k) => !k.startsWith("ghosts/"))).toBe(true);
    expect(puts.slice(firstGhost).every((k) => k.startsWith("ghosts/"))).toBe(true); // private data first, ghosts last
    expect(puts.slice(0, 4).every((k) => /^(profiles|players|links|linkcodes|tombstones)\//.test(k))).toBe(true);
    console.log(`s4 drill: ${objectCount} objects (${fake.keys(A, "ghosts/").length} ghosts, ${fake.keys(A, "profiles/").length} profiles, ${objectCount - fake.keys(A, "ghosts/").length - fake.keys(A, "profiles/").length} others); `
      + `snapshot ${measured.snapshotMs.toFixed(0)} ms, restore ${measured.restoreMs.toFixed(0)} ms (with its own verify), verify --exact ${measured.verifyMs.toFixed(0)} ms; ${PAGE} keys a page`);
  });

  it("a second server booted on B gives the same per-(rules, day) counts as A, the same stored profiles and the same answers", async () => {
    const storeB = tigrisFor(fake, B, {}, { timeoutMs: 5000 });
    appB = serve(storeB);
    urlB = base(appB, await appB.listen(0));
    // 1. ghost-admin's own list function, on both buckets: per day, the seed-pool ghosts, the uploads and the distinct players
    const countsA = countDays(await new TigrisAdmin(s3For(fake, A)).read(RULES_VERSION, true));
    const countsB = countDays(await new TigrisAdmin(s3For(fake, B)).read(RULES_VERSION, true));
    expect(countsB).toEqual(countsA);
    expect(countsA.total.uploads).toBe(14);
    expect(countsA.total.players).toBe(4);
    expect(countsA.days.filter((d) => d.uploads > 0).map((d) => d.day)).toEqual([3, 5, 10, 11, 12]);
    expect(countsA.total.pool).toBeGreaterThanOrEqual(100);
    // 2. the store API of each server: the same ghost ids in every (rules, day) bucket
    for (let day = 1; day <= 25; day++) {
      const a = (await serverA.store.bucket(RULES_VERSION, day)).map((e) => e.id).sort();
      const b = (await appB.store.bucket(RULES_VERSION, day)).map((e) => e.id).sort();
      expect(b, `day ${day}`).toEqual(a);
    }
    // 3. the stored profiles, through each server's own profile store
    for (const who of ids) {
      const pa = await profileStoreFor(serverA.store).get(who.playerId);
      const pb = await profileStoreFor(appB.store).get(who.playerId);
      expect(pa).not.toBeNull();
      expect(pb).toEqual(pa);
    }
    // 4. the same requests, the same answers: the same signed profile write, and the match route for several records and players
    for (const [i, who] of ids.entries()) {
      const a = await putProfile(urlA, who, i + 2), b = await putProfile(urlB, who, i + 2);
      expect(b).toEqual(a);
      expect(b.status).toBe(200);
    }
    let answers = 0;
    for (const [day, wins, lives] of [[3, 2, 3], [5, 4, 4], [10, 9, 1], [11, 0, 5], [1, 0, 3], [7, 3, 2]] as const) {
      for (const runs of [0, 5]) {
        const q = `rules=${RULES_VERSION}&day=${day}&wins=${wins}&lives=${lives}&player=${ids[0].playerId}&runs=${runs}`;
        const a = await getJson(`${urlA}/v1/ghosts/match?${q}`), b = await getJson(`${urlB}/v1/ghosts/match?${q}`);
        expect(b, q).toEqual(a);
        answers++;
      }
    }
    expect(answers).toBe(12);
    const hb = (await (await fetch(`${urlB}/v1/health`)).json()) as { ok: boolean; rules: string; store: string };
    expect(hb).toMatchObject({ ok: true, rules: RULES_VERSION, store: "tigris" });
  }, 120_000);
});

describe("S4 the drill: the failure cases, on this bucket", () => {
  it("a tampered snapshot file fails verify before the bucket is read and stops a restore before any PUT", async () => {
    const file = join(snapDir, "objects", "profiles", `${ids[1].playerId}.json`);
    const original = await readFile(file);
    const tampered = new TextEncoder().encode('{"counters":{"runs":999}}');
    await writeFile(file, tampered, { mode: 0o600 });
    const reqs = fake.requests.length;
    const v = await ghostOps(["verify", snapDir, "--exact"], B);
    expect(v.code).toBe(1);
    expect(v.text).toContain("the snapshot itself is damaged");
    expect(fake.requests.length).toBe(reqs);
    const empty = "bb-empty";
    fake.createBucket(empty);
    const r = await ghostOps(["restore", snapDir, "--apply"], empty);
    expect(r.code).toBe(1);
    expect(r.text).toContain("nothing was written");
    expect(fake.keys(empty)).toEqual([]);
    expect(fake.requests.filter((q) => q.bucket === empty && q.op === "PUT")).toHaveLength(0);
    await writeFile(file, original, { mode: 0o600 });
    expect((await ghostOps(["verify", snapDir, "--exact"], B)).code).toBe(0);
  });

  it("a restore into a non-empty B is refused without --force, and a re-run with --force writes nothing new", async () => {
    const puts = fake.count("PUT", B);
    const refused = await ghostOps(["restore", snapDir, "--apply"], B);
    expect(refused.code).toBe(2);
    expect(refused.text).toContain("the bucket is not empty");
    expect(fake.count("PUT", B)).toBe(puts);
    const again = await ghostOps(["restore", snapDir, "--apply", "--force"], B);
    expect(again.code, again.text).toBe(0);
    expect(again.text).toContain(`${objectCount} already identical, skipped`);
    expect(fake.count("PUT", B)).toBe(puts);
    expect(fake.count("DELETE")).toBe(0);
  });

  it("an object missing from the bucket fails verify, and --force restore puts it back", async () => {
    const gone = fake.keys(B, "ghosts/").find((k) => k.includes("/player/"))!;
    const body = fake.getObject(B, gone)!;
    fake.deleteObject(B, gone);
    const v = await ghostOps(["verify", snapDir], B);
    expect(v.code).toBe(1);
    expect(v.text).toContain("MISSING from the bucket: 1 (ghosts/ 1)");
    const before = fake.count("PUT", B);
    const fix = await ghostOps(["restore", snapDir, "--apply", "--force"], B);
    expect(fix.code, fix.text).toBe(0);
    expect(fake.count("PUT", B) - before).toBe(1);
    expect(fake.getObject(B, gone)).toBe(body);
    expect((await ghostOps(["verify", snapDir, "--exact"], B)).code).toBe(0);
  });

  it("`ghost-ops drill` runs the drill's checks against B in one command: PASS with the time taken; FAIL when an object is missing, extra or when revalidate would delete", async () => {
    const pass = await ghostOps(["drill", snapDir], B);
    expect(pass.code, pass.text).toBe(0);
    expect(pass.text).toMatch(/drill PASS in \d+\.\d\d s/);
    expect(pass.text).toContain("PASS  verify --exact");
    expect(pass.text).toContain("PASS  the per-(rules, day) counts equal the snapshot's");
    expect(pass.text).toContain("PASS  revalidate (dry run) deletes 0");
    expect(pass.text).toContain("14 upload object(s) in the bucket");
    expect(pass.text).toContain("0 of 14 uploads would be deleted");
    // an object gone from B: verify fails, and the later checks are not run
    const gone = fake.keys(B, "profiles/")[0];
    const body = fake.getObject(B, gone)!;
    fake.deleteObject(B, gone);
    const miss = await ghostOps(["drill", snapDir], B);
    expect(miss.code).toBe(1);
    expect(miss.text).toMatch(/drill FAIL in \d+\.\d\d s/);
    expect(miss.text).toContain("FAIL  verify --exact");
    expect(miss.text).not.toContain("revalidate (dry run)");
    fake.putObject(B, gone, body);
    // an object B has and the snapshot does not: --exact fails it
    fake.putObject(B, "ghosts/bb-0.12.0/d04/player/not-in-the-snapshot.json", "{}");
    expect((await ghostOps(["drill", snapDir], B)).code).toBe(1);
    fake.deleteObject(B, "ghosts/bb-0.12.0/d04/player/not-in-the-snapshot.json");
    expect((await ghostOps(["drill", snapDir], B)).code).toBe(0);
    // a ghost that fails revalidation, taken into a snapshot and restored: counts and bytes are equal, but the dry run would delete it
    const bad = "bb-bad", bad2 = "bb-bad2";
    fake.createBucket(bad);
    fake.createBucket(bad2);
    for (const k of fake.keys(A)) fake.putObject(bad, k, fake.getObject(A, k)!);
    const upload = fake.keys(bad, "ghosts/").find((k) => k.includes("/player/"))!;
    const rec = JSON.parse(fake.getObject(bad, upload)!) as { snapshot: { wins: number } };
    rec.snapshot.wins = (rec.snapshot.wins + 1) % 9; // the id (a hash of the snapshot) no longer matches
    fake.putObject(bad, upload, JSON.stringify(rec));
    expect((await ghostOps(["snapshot", "--out", join(root, "bad")], bad)).code).toBe(0);
    const badDir = join(root, "bad", (await readdir(join(root, "bad")))[0]);
    expect((await ghostOps(["restore", badDir, "--apply"], bad2)).code).toBe(0);
    const reval = await ghostOps(["drill", badDir], bad2);
    expect(reval.code).toBe(1);
    expect(reval.text).toContain("1 of 14 uploads would be deleted");
    expect(reval.text).toContain("FAIL  revalidate (dry run) deletes 0");
    expect(reval.text).toContain("PASS  verify --exact");
    expect(fake.count("DELETE")).toBe(0); // the drill only reads
  }, 120_000);

  it("an unsafe key in A is refused by the next snapshot (exit 1, named), and a storage fault mid-snapshot leaves only a .partial directory", async () => {
    fake.putObject(A, "ghosts/../../escape.json", "x");
    const snaps = join(root, "snaps2");
    const r = await ghostOps(["snapshot", "--out", snaps], A);
    expect(r.code).toBe(1);
    expect(r.text).toContain('"ghosts/../../escape.json"');
    expect(r.text).toContain('".." segment');
    expect(await readdir(root)).not.toContain("escape.json");
    fake.deleteObject(A, "ghosts/../../escape.json");
    const cut = join(root, "snaps3");
    fake.failNext(80, 503, "GET");
    const f = await ghostOps(["snapshot", "--out", cut], A);
    fake.clearFaults();
    expect(f.code).toBe(1);
    const left = await readdir(cut);
    expect(left).toHaveLength(1);
    expect(left[0].endsWith(".partial")).toBe(true);
  });
});
