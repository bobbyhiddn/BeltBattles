// S3 (BRIEF-S3 goal 1; LAUNCH-0 REPORT 1.4 item 3): THE GHOST CACHE HAS A SIZE. server/bucketCap.ts is the policy and both stores use it:
//  - a (rules, day) bucket keeps at most `bucketCap` PLAYER ghosts in memory, the newest by upload time; seed (pool) ghosts never count and are never dropped;
//  - the cache keeps at most `cacheMax` player ghosts; past it the least recently used bucket loses its oldest ghosts first;
//  - a bucket LOAD fetches only what it keeps (LIST, sort by LastModified, fetch the newest N); a re-list fetches only new keys that make the cut;
//  - a bucket holds two kinds (a run's dusk, an ENDLESS dusk): the kind that holds MORE loses its oldest, so neither is crowded out below min(count, cap / 2);
//  - nothing is ever deleted from storage.
// Here: overflowKeys/oldestKeys on their own; parseListV2 keeping LastModified; TigrisStore on the in-process fake S3 (tools/fakeS3.ts, which now
// stamps a PUT with a clock the test controls); JsonlStore on a temp directory. The ghosts are played through the game's own code
// (tests/endless1.honest.ts, a lean deck); a bucket is fed with copies of one honest snapshot under distinct runIds. Nothing here builds the stand-in sample pool.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION } from "../src/sim/content";
import { ENDLESS, setEndless } from "../src/sim/endless";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { ghostId, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { oldestKeys, overflowKeys, type CapItem } from "../server/bucketCap";
import { parseListV2 } from "../server/s3";
import { JsonlStore, encodeRecord, poolRecord } from "../server/store";
import { TigrisStore, objectKey } from "../server/tigrisStore";
import type { FakeS3 } from "../tools/fakeS3";
import { startFake, tigrisFor } from "./netStores";
import { TEST_NAME, testIdentity } from "./netIdentity";
import { LOSS, WIN, playEndless } from "./endless1.honest";

const RULES = RULES_VERSION;
setPlayerName(TEST_NAME);

let base3: GhostSnapshot, base4: GhostSnapshot, base5: GhostSnapshot, run12: GhostSnapshot, endless12: GhostSnapshot;
const need = (s: GhostSnapshot | undefined, what: string): GhostSnapshot => {
  if (!s) throw new Error(`the honest run has no ${what}`);
  return s;
};
/** A distinct honest ghost of the same bucket: the same snapshot under another runId (the id hashes it). */
const variant = (base: GhostSnapshot, tag: string): GhostSnapshot => ({ ...base, runId: `s3-${tag}` });

beforeAll(async () => {
  setEndless(true);
  const me = await testIdentity(0);
  // B: a run won on day 10 (its dusks days 1-10), then endless dusks days 11-25. A: a run with two losses, won on day 12 (its dusks days 1-12)
  const b = playEndless("weaver", 42, me.playerId, { buys: 0, until: 25 });
  const a = playEndless("weaver", 43, me.playerId, { runOutcomes: [WIN, LOSS, WIN, WIN, LOSS], buys: 0, until: 13 });
  base3 = need(b.runSnaps.find((s) => s.day === 3), "day-3 dusk");
  base4 = need(b.runSnaps.find((s) => s.day === 4), "day-4 dusk");
  base5 = need(b.runSnaps.find((s) => s.day === 5), "day-5 dusk");
  run12 = need(a.runSnaps.find((s) => s.day === 12), "day-12 run dusk");
  endless12 = need(b.endlessSnaps.find((s) => s.day === 12), "day-12 endless dusk");
}, 300_000);
afterAll(() => setEndless(ENDLESS));

// ------------------------------------------------------------------------------------------------ the policy on its own

describe("S3 bucketCap.ts: overflowKeys and oldestKeys", () => {
  const run = (key: string, at: number): CapItem => ({ key, at, endless: false });
  const end = (key: string, at: number): CapItem => ({ key, at, endless: true });

  it("returns nothing while the ghosts fit, and drops the oldest of one kind first", () => {
    expect(overflowKeys([run("a", 1), run("b", 2)], 2)).toEqual([]);
    expect(overflowKeys([], 3)).toEqual([]);
    expect(overflowKeys([run("c", 3), run("a", 1), run("b", 2)], 2)).toEqual(["a"]);
    expect(overflowKeys([run("c", 3), run("a", 1), run("b", 2), run("d", 4)], 1)).toEqual(["a", "b", "c"]);
  });

  it("the kind that holds more loses its oldest: a flood of runs cannot push the endless ghosts out", () => {
    const runs = Array.from({ length: 10 }, (_, i) => run(`r${i}`, 10 + i));
    const items = [end("e0", 1), ...runs]; // the endless ghost is the OLDEST of all, and the only one of its kind
    const drop = overflowKeys(items, 4);
    expect(drop).toHaveLength(7);
    expect(drop).not.toContain("e0");
    expect(drop).toEqual(["r0", "r1", "r2", "r3", "r4", "r5", "r6"]); // only runs, oldest first
    const left = items.filter((i) => !drop.includes(i.key)).map((i) => i.key);
    expect(left).toEqual(["e0", "r7", "r8", "r9"]);
  });

  it("neither kind falls below min(its count, cap / 2) whatever the flood, either way round", () => {
    for (const [nRuns, nEnd, cap] of [[100, 3, 6], [3, 100, 6], [50, 50, 10], [7, 2, 5], [1, 40, 4]] as const) {
      const items = [...Array.from({ length: nRuns }, (_, i) => run(`r${i}`, 1000 + i)), ...Array.from({ length: nEnd }, (_, i) => end(`e${i}`, 2000 + i))];
      const drop = new Set(overflowKeys(items, cap));
      const left = items.filter((i) => !drop.has(i.key));
      expect(left).toHaveLength(cap);
      const runsLeft = left.filter((i) => !i.endless).length, endLeft = left.filter((i) => i.endless).length;
      expect(runsLeft).toBeGreaterThanOrEqual(Math.min(nRuns, Math.floor(cap / 2)));
      expect(endLeft).toBeGreaterThanOrEqual(Math.min(nEnd, Math.floor(cap / 2)));
      // what is kept of a kind is its newest
      const keptRuns = left.filter((i) => !i.endless).map((i) => i.at), allRuns = items.filter((i) => !i.endless).map((i) => i.at).sort((a, b) => b - a);
      expect([...keptRuns].sort((a, b) => b - a)).toEqual(allRuns.slice(0, keptRuns.length));
    }
  });

  it("at equal counts the older of the two oldest goes", () => {
    expect(overflowKeys([run("r1", 1), run("r2", 3), end("e1", 2), end("e2", 4)], 3)).toEqual(["r1"]);
    expect(overflowKeys([run("r1", 2), run("r2", 4), end("e1", 1), end("e2", 3)], 3)).toEqual(["e1"]);
  });

  it("oldestKeys: the n oldest by time, a tie by key; a cap of 0 or less drops everything", () => {
    expect(oldestKeys([run("c", 3), run("a", 1), run("b", 1)], 2)).toEqual(["a", "b"]);
    expect(oldestKeys([run("a", 1)], 0)).toEqual([]);
    expect(overflowKeys([run("a", 1), end("b", 2)], 0)).toHaveLength(2);
  });
});

describe("S3 s3.ts: parseListV2 keeps LastModified", () => {
  it("reads LastModified as ms, and leaves the field out when it is absent or not a time", () => {
    const xml = `<ListBucketResult><IsTruncated>false</IsTruncated>
      <Contents><Key>a</Key><LastModified>2026-10-26T10:00:00.000Z</LastModified><Size>5</Size></Contents>
      <Contents><Key>b</Key><Size>6</Size></Contents>
      <Contents><Key>c</Key><LastModified>yesterday</LastModified><Size>7</Size></Contents></ListBucketResult>`;
    const page = parseListV2(xml);
    expect(page.objects[0]).toEqual({ key: "a", size: 5, modified: Date.parse("2026-10-26T10:00:00.000Z") });
    expect("modified" in page.objects[1]).toBe(false);
    expect(page.objects[1]).toEqual({ key: "b", size: 6 });
    expect("modified" in page.objects[2]).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------ the Tigris store on the fake S3

type Peek = { buckets: Map<string, { at: Map<string, number>; byKey: Map<string, PoolEntry> }> };
const peek = (s: TigrisStore) => (s as unknown as Peek).buckets;
const heldIds = (s: TigrisStore, day: number): string[] => [...(peek(s).get(`${RULES}|${day}`)?.at.keys() ?? [])].map((k) => peek(s).get(`${RULES}|${day}`)!.byKey.get(k)!.id);

describe("S3 TigrisStore on the fake S3", () => {
  let fake: FakeS3;
  let tick = 0; // the fake's clock: every PUT is stamped one ms after the last
  let seq = 0;
  let name = "";

  beforeAll(async () => {
    fake = await startFake({ pageSize: 5, clock: () => ++tick }); // five keys a LIST page: every multi-page path runs
  });
  afterAll(async () => {
    await fake.close();
  });
  beforeEach(() => {
    fake.clearFaults();
    fake.requests.length = 0;
    tick = 1_000_000;
    name = `bb-s3-${++seq}`;
    fake.createBucket(name);
  });

  const gets = () => fake.requests.filter((r) => r.bucket === name && r.op === "GET").map((r) => r.key);
  const lists = () => fake.requests.filter((r) => r.bucket === name && r.op === "LIST").length;
  const stored = () => fake.keys(name, "ghosts/").length;
  /** A player object another machine stored, at a time of its own. */
  function putPlayer(s: GhostSnapshot, modified: number): string {
    const id = ghostId(s);
    const key = objectKey("player", s.rules, s.day, id);
    fake.putObject(name, key, encodeRecord(id, modified, s), modified);
    return key;
  }
  function putSeed(s: GhostSnapshot): string {
    const id = ghostId(s);
    const key = objectKey("pool", s.rules, s.day, id);
    fake.putObject(name, key, poolRecord({ id, snapshot: s }), 1);
    return key;
  }
  const idsOf = (entries: readonly PoolEntry[]) => entries.map((e) => e.id).sort();

  it("a bucket fed more than N uploads keeps the newest N and every seed ghost; a dropped ghost is never matched; nothing leaves storage", async () => {
    const store = tigrisFor(fake, name, { bucketCap: 5, cacheMax: 1000 });
    const seeds = [variant(base3, "seed-1"), variant(base3, "seed-2")];
    seeds.forEach(putSeed);
    const ups = Array.from({ length: 9 }, (_, i) => variant(base3, `a${i}`));
    for (const u of ups) expect((await store.add(u, ++tick)).created).toBe(true);
    // in memory already: the 5 newest (the cap works on the way in, before any load)
    expect(store.cacheStats()).toEqual({ buckets: 1, playerGhosts: 5, bucketCap: 5, ceiling: 1000, evictedByCap: 4, evictedByCeiling: 0 });
    const objects = stored();
    expect(objects).toBe(9 + 2);
    const got = await store.bucket(RULES, 3);
    const want = [...seeds, ...ups.slice(4)].map(ghostId).sort();
    expect(idsOf(got)).toEqual(want);
    for (const dropped of ups.slice(0, 4)) expect(got.some((e) => e.id === ghostId(dropped))).toBe(false);
    expect(idsOf(await store.bucket(RULES, 3, "pool"))).toEqual(seeds.map(ghostId).sort()); // the seed view is untouched
    expect(stored()).toBe(objects); // nothing was deleted: Tigris keeps every ghost
    expect(store.cacheStats()).toMatchObject({ playerGhosts: 5, evictedByCap: 4, evictedByCeiling: 0 });
    // a new upload takes the newest place; the oldest of the five leaves
    const newest = variant(base3, "a-new");
    await store.add(newest, ++tick);
    const after = idsOf(await store.bucket(RULES, 3));
    expect(after).toEqual([...seeds, ...ups.slice(5), newest].map(ghostId).sort());
    expect(store.cacheStats().evictedByCap).toBe(5);
    expect(stored()).toBe(objects + 1);
  });

  it("a cold load of a bucket with more objects than the cap fetches ONLY the newest N player objects (and every seed), by LastModified, not by key", async () => {
    const M = 12, N = 4;
    const snaps = Array.from({ length: M }, (_, i) => variant(base3, `b${i}`));
    const modOf = (i: number) => 5_000 + ((i * 7) % M); // a permutation of 5000..5011: the key order is not the time order
    const keys = snaps.map((s, i) => putPlayer(s, modOf(i)));
    const seeds = [variant(base3, "bs-1"), variant(base3, "bs-2"), variant(base3, "bs-3")];
    const seedKeys = seeds.map(putSeed);
    const newest = snaps.map((s, i) => ({ s, i, key: keys[i] })).sort((x, y) => modOf(y.i) - modOf(x.i)).slice(0, N);
    const store = tigrisFor(fake, name, { bucketCap: N, cacheMax: 1000 });
    fake.requests.length = 0;
    const got = await store.bucket(RULES, 3);
    expect(lists()).toBe(Math.ceil((M + 3) / 5)); // the LIST still reads every key (five a page here)
    const fetched = gets();
    expect(fetched).toHaveLength(N + 3);
    expect([...fetched].sort()).toEqual([...newest.map((n) => n.key), ...seedKeys].sort());
    expect(idsOf(got)).toEqual([...newest.map((n) => n.s), ...seeds].map(ghostId).sort());
    expect(store.cacheStats()).toMatchObject({ playerGhosts: N, evictedByCap: 0 }); // never fetched, so never dropped
    expect(stored()).toBe(M + 3);
  });

  it("a re-list after the TTL fetches only the new keys that make the cut, drops the ones that aged out of the newest N, and never fetches an older object", async () => {
    const N = 4;
    let now = 1_000_000;
    const snaps = Array.from({ length: 8 }, (_, i) => variant(base3, `r${i}`));
    snaps.forEach((s, i) => putPlayer(s, 5_000 + i)); // r7 is the newest
    const store = tigrisFor(fake, name, { bucketCap: N, cacheMax: 1000, ttlMs: 60_000, now: () => now });
    expect(idsOf(await store.bucket(RULES, 3))).toEqual(snaps.slice(4).map(ghostId).sort());
    // two new objects newer than everything, one older than the window
    const fresh = [variant(base3, "r-new-1"), variant(base3, "r-new-2")];
    const freshKeys = [putPlayer(fresh[0], 9_000), putPlayer(fresh[1], 9_001)];
    const stale = variant(base3, "r-old");
    const staleKey = putPlayer(stale, 1);
    now += 59_999;
    fake.requests.length = 0;
    await store.bucket(RULES, 3);
    expect(gets()).toEqual([]); // within the TTL: no request at all
    now += 1;
    fake.requests.length = 0;
    const got = await store.bucket(RULES, 3);
    expect([...gets()].sort()).toEqual([...freshKeys].sort()); // exactly the two new keys; the old object and the held ones are not fetched
    expect(gets()).not.toContain(staleKey);
    expect(idsOf(got)).toEqual([...snaps.slice(6), ...fresh].map(ghostId).sort()); // the two newest held ones stay, the two older aged out
    expect(store.cacheStats()).toMatchObject({ playerGhosts: N, evictedByCap: 2 });
    expect(stored()).toBe(8 + 3); // nothing deleted
  });

  it("the ceiling: the least recently used bucket loses its OLDEST ghosts first; the total never passes it; seed ghosts stay; the bucket in use keeps its newest", async () => {
    let clock = 10;
    const store = tigrisFor(fake, name, { bucketCap: 4, cacheMax: 6, ttlMs: 60_000, now: () => ++clock });
    const seeds3 = [variant(base3, "cs3-1"), variant(base3, "cs3-2")];
    const seeds4 = [variant(base4, "cs4-1")];
    seeds3.forEach(putSeed);
    seeds4.forEach(putSeed);
    const d3 = Array.from({ length: 4 }, (_, i) => variant(base3, `c3-${i}`));
    const d4 = Array.from({ length: 4 }, (_, i) => variant(base4, `c4-${i}`));
    const at3: number[] = [], at4: number[] = [];
    for (const s of d3) {
      at3.push(++tick);
      await store.add(s, at3[at3.length - 1]);
    }
    expect(store.cacheStats().playerGhosts).toBe(4);
    for (const s of d4) {
      at4.push(++tick);
      await store.add(s, at4[at4.length - 1]);
      expect(store.cacheStats().playerGhosts).toBeLessThanOrEqual(6);
    }
    // 8 ghosts were stored, the ceiling is 6, two buckets hold ghosts, so each one's fair share is 3. The ceiling takes the OLDEST ghost of the least recently
    // used bucket that is over its share, down to the share and no further: day 3 (4 held when day 4 reached 3) gave up its oldest, and when day 4 reached 4
    // (itself over its share, day 3 at its share) day 4 gave up its oldest. Neither bucket is emptied; each keeps its newest three
    expect(store.cacheStats()).toMatchObject({ buckets: 2, playerGhosts: 6, evictedByCeiling: 2, evictedByCap: 0 });
    expect(heldIds(store, 3).sort()).toEqual(d3.slice(1).map(ghostId).sort());
    expect(heldIds(store, 4).sort()).toEqual(d4.slice(1).map(ghostId).sort());
    expect(stored()).toBe(8 + 3); // storage keeps all of it
    // reading day 3 lists it: the window is its share (3) and the three newest objects are the ones it holds, so nothing is fetched and nothing moves
    fake.requests.length = 0;
    const day3 = await store.bucket(RULES, 3);
    expect(idsOf(day3)).toEqual([...d3.slice(1), ...seeds3].map(ghostId).sort());
    expect(gets().filter((k) => k.includes("/player/"))).toEqual([]);
    expect(store.cacheStats()).toMatchObject({ playerGhosts: 6, evictedByCeiling: 2 });
    // seed ghosts of both buckets are untouched by any of it
    expect(idsOf(await store.bucket(RULES, 3, "pool"))).toHaveLength(seeds3.length);
    expect(idsOf(await store.bucket(RULES, 4, "pool"))).toHaveLength(seeds4.length);
    expect(store.cacheStats().playerGhosts).toBeLessThanOrEqual(6);
  });

  it("a re-list does not refetch what the ceiling trimmed while the cache has no room (no refill at every TTL just to be trimmed again)", async () => {
    let clock = 10;
    const store = tigrisFor(fake, name, { bucketCap: 4, cacheMax: 6, ttlMs: 60_000, now: () => ++clock });
    const d3 = Array.from({ length: 4 }, (_, i) => variant(base3, `w3-${i}`));
    const d4 = Array.from({ length: 4 }, (_, i) => variant(base4, `w4-${i}`));
    d3.forEach((s, i) => putPlayer(s, 100 + i));
    d4.forEach((s, i) => putPlayer(s, 200 + i));
    [variant(base3, "ws3-1"), variant(base4, "ws4-1")].forEach(putSeed);
    await store.bucket(RULES, 3); // first load: window 4
    expect(store.cacheStats().playerGhosts).toBe(4);
    await store.bucket(RULES, 4); // first load: its window is its fair share (3); 4 + 3 = 7 > 6, so day 3 (over its share of 3) gives up its oldest
    expect(store.cacheStats()).toMatchObject({ playerGhosts: 6, evictedByCeiling: 1 });
    expect(heldIds(store, 3).sort()).toEqual(d3.slice(1).map(ghostId).sort());
    expect(heldIds(store, 4).sort()).toEqual(d4.slice(1).map(ghostId).sort());
    clock += 100_000; // both buckets are past their TTL
    fake.requests.length = 0;
    await store.bucket(RULES, 3);
    await store.bucket(RULES, 4);
    expect(lists()).toBeGreaterThanOrEqual(2); // both really were re-listed...
    expect(gets().filter((k) => k.includes("/player/"))).toEqual([]); // ...and no ghost was fetched: each window is what the bucket holds (its share), the room is full
    expect(store.cacheStats()).toMatchObject({ playerGhosts: 6, evictedByCeiling: 1 });
    expect(heldIds(store, 3).sort()).toEqual(d3.slice(1).map(ghostId).sort());
    expect(heldIds(store, 4).sort()).toEqual(d4.slice(1).map(ghostId).sort());
  });

  it("the ceiling never empties a bucket in use and a re-list never starves one: two buckets share a ceiling of 4, two ghosts each, stable across re-lists", async () => {
    // (BENCH finding: with 'the least recently used bucket loses everything' day 1 was served from the seed pool alone, for ever, once days 4-6 had loaded)
    let clock = 10;
    const store = tigrisFor(fake, name, { bucketCap: 4, cacheMax: 4, ttlMs: 60_000, now: () => ++clock });
    const d3 = Array.from({ length: 4 }, (_, i) => variant(base3, `sv3-${i}`));
    const d4 = Array.from({ length: 4 }, (_, i) => variant(base4, `sv4-${i}`));
    d3.forEach((s, i) => putPlayer(s, 100 + i));
    d4.forEach((s, i) => putPlayer(s, 200 + i));
    await store.bucket(RULES, 3); // alone: its window is the whole ceiling, 4
    expect(heldIds(store, 3)).toHaveLength(4);
    await store.bucket(RULES, 4); // a second bucket: the fair share is 2 each; day 4 loads its 2 newest, day 3 gives up its 2 oldest and keeps its share
    expect(heldIds(store, 4).sort()).toEqual(d4.slice(2).map(ghostId).sort());
    expect(heldIds(store, 3).sort()).toEqual(d3.slice(2).map(ghostId).sort());
    expect(store.cacheStats()).toMatchObject({ playerGhosts: 4, evictedByCeiling: 2 });
    clock += 100_000; // both are past their TTL
    fake.requests.length = 0;
    await store.bucket(RULES, 3);
    await store.bucket(RULES, 4);
    expect(lists()).toBeGreaterThanOrEqual(2);
    expect(gets().filter((k) => k.includes("/player/"))).toEqual([]); // each window is its share: nothing to fetch, nothing to trim again
    expect(heldIds(store, 3)).toHaveLength(2);
    expect(heldIds(store, 4)).toHaveLength(2);
    expect(store.cacheStats()).toMatchObject({ playerGhosts: 4, evictedByCeiling: 2 });
  });

  it("a ceiling below the bucket cap bounds even a lone bucket, and its first load fetches no more than the ceiling", async () => {
    const snaps = Array.from({ length: 8 }, (_, i) => variant(base3, `l${i}`));
    snaps.forEach((s, i) => putPlayer(s, 7_000 + i));
    const store = tigrisFor(fake, name, { bucketCap: 6, cacheMax: 3 });
    fake.requests.length = 0;
    expect(idsOf(await store.bucket(RULES, 3))).toEqual(snaps.slice(5).map(ghostId).sort()); // the newest 3
    expect(gets()).toHaveLength(3);
    const up = variant(base3, "l-new");
    await store.add(up, ++tick);
    expect(store.cacheStats().playerGhosts).toBe(3);
    expect(heldIds(store, 3).sort()).toEqual([...snaps.slice(6), up].map(ghostId).sort());
  });

  it("endless and run ghosts in one bucket: a flood of one kind cannot push the other below half the cap (the bucket of day 12), as uploads arrive", async () => {
    const store = tigrisFor(fake, name, { bucketCap: 4, cacheMax: 1000 });
    const ends = Array.from({ length: 3 }, (_, i) => variant(endless12, `k-e${i}`));
    const runs = Array.from({ length: 6 }, (_, i) => variant(run12, `k-r${i}`));
    expect(ends[0].mode).toBe("endless");
    expect(runs[0].mode).toBeUndefined();
    expect(ends[0].day).toBe(12);
    expect(runs[0].day).toBe(12);
    for (const s of ends) await store.add(s, ++tick);
    expect(store.cacheStats().playerGhosts).toBe(3);
    for (const s of runs) await store.add(s, ++tick); // a flood of run ghosts into the same bucket
    // 3 endless + 6 runs through a cap of 4: the endless ones keep their 2 (half the cap), the newest two; the runs keep their newest two
    expect(heldIds(store, 12).sort()).toEqual([...ends.slice(1), ...runs.slice(4)].map(ghostId).sort());
    expect(store.cacheStats()).toMatchObject({ playerGhosts: 4, evictedByCap: 5 });
    // and the other way round: a flood of endless ghosts cannot push the two runs out
    const more = Array.from({ length: 5 }, (_, i) => variant(endless12, `k-f${i}`));
    for (const s of more) await store.add(s, ++tick);
    const held = heldIds(store, 12);
    expect(held).toHaveLength(4);
    expect(held).toContain(ghostId(runs[4]));
    expect(held).toContain(ghostId(runs[5]));
    expect(held.filter((id) => more.some((m) => ghostId(m) === id))).toHaveLength(2); // and the two endless ones are the newest two
    expect(stored()).toBe(3 + 6 + 5); // all of them are still objects in storage
  });

  it("the fair split survives the bucket's first load and its TTL re-list (the load window is by time only; the kinds are not known until a body is fetched)", async () => {
    // DESIGN GAP, asserted as the brief wants it (BRIEF-S3 goal 1a: neither kind may crowd out the other): after a flood the two kinds were held 2 + 2 by the fair
    // eviction on the way in; the first load / a re-list takes the newest N objects of the LIST whatever their kind and drops every held ghost outside that window,
    // so a flood of one kind (the newest N objects all of one kind) undoes it. server/tigrisStore.ts refresh(): `kept` is kind-blind.
    let now = 1_000_000;
    const store = tigrisFor(fake, name, { bucketCap: 4, cacheMax: 1000, ttlMs: 60_000, now: () => now });
    const ends = Array.from({ length: 2 }, (_, i) => variant(endless12, `g-e${i}`));
    const runs = Array.from({ length: 6 }, (_, i) => variant(run12, `g-r${i}`));
    for (const s of ends) await store.add(s, ++tick);
    for (const s of runs) await store.add(s, ++tick);
    const fair = [...ends, ...runs.slice(4)].map(ghostId).sort(); // 2 endless + the 2 newest runs
    expect(heldIds(store, 12).sort()).toEqual(fair);
    const first = await store.bucket(RULES, 12); // the first load: the newest 4 objects are all runs
    expect(first.filter((e) => e.snapshot.mode === "endless").length).toBeGreaterThanOrEqual(2);
    now += 60_000; // a re-list
    const again = await store.bucket(RULES, 12);
    expect(again.filter((e) => e.snapshot.mode === "endless").length).toBeGreaterThanOrEqual(2);
    expect(again.filter((e) => e.snapshot.mode !== "endless").length).toBeGreaterThanOrEqual(2);
  });

  it("cacheStats: zeros for a store nothing has touched, and the configured cap and ceiling", () => {
    const store = tigrisFor(fake, name, { bucketCap: 7, cacheMax: 70 });
    expect(store.cacheStats()).toEqual({ buckets: 0, playerGhosts: 0, bucketCap: 7, ceiling: 70, evictedByCap: 0, evictedByCeiling: 0 });
    expect(new TigrisStore(store.s3).cacheStats()).toMatchObject({ bucketCap: 2000, ceiling: 6000 }); // the documented defaults
  });
});

// ------------------------------------------------------------------------------------------------ the JSON-lines store

describe("S3 JsonlStore: the same cap in memory; the file keeps every line", () => {
  const dirs: string[] = [];
  const fresh = (): string => {
    const d = mkdtempSync(join(tmpdir(), "bb-s3-jsonl-"));
    dirs.push(d);
    return d;
  };
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });
  const lines = (dir: string): string[] => readFileSync(join(dir, "ghosts.jsonl"), "utf8").split("\n").filter((l) => l.trim());
  const writeUploads = (dir: string, snaps: GhostSnapshot[]) => writeFileSync(join(dir, "ghosts.jsonl"), snaps.map((s, i) => encodeRecord(ghostId(s), 100 + i, s) + "\n").join(""));
  const writeSeeds = (dir: string, snaps: GhostSnapshot[]) => writeFileSync(join(dir, "pool.jsonl"), snaps.map((s) => poolRecord({ id: ghostId(s), snapshot: s }) + "\n").join(""));
  const ids = (entries: readonly PoolEntry[]) => entries.map((e) => e.id).sort();

  it("loads only the newest N of a bucket (later lines are newer) and every seed ghost; the file still has every line", async () => {
    const dir = fresh();
    const ups = Array.from({ length: 8 }, (_, i) => variant(base3, `j${i}`));
    const seeds = [variant(base3, "js-1"), variant(base3, "js-2")];
    writeUploads(dir, ups);
    writeSeeds(dir, seeds);
    const store = new JsonlStore(dir, { bucketCap: 5, cacheMax: 100 });
    store.load();
    expect(ids(await store.bucket(RULES, 3))).toEqual([...seeds, ...ups.slice(3)].map(ghostId).sort());
    expect(ids(await store.bucket(RULES, 3, "pool"))).toEqual(seeds.map(ghostId).sort());
    expect(store.cacheStats()).toEqual({ buckets: 1, playerGhosts: 5, bucketCap: 5, ceiling: 100, evictedByCap: 3, evictedByCeiling: 0 });
    expect(lines(dir)).toHaveLength(8);
    // an upload joins as the newest; the oldest of the five leaves memory; the file gains a line
    const newest = variant(base3, "j-new");
    expect((await store.add(newest, 999)).created).toBe(true);
    expect(ids(await store.bucket(RULES, 3))).toEqual([...seeds, ...ups.slice(4), newest].map(ghostId).sort());
    expect(lines(dir)).toHaveLength(9);
    // re-sending a ghost that left memory is still "already stored": 200 in the server, created:false here, and no new line
    expect(await store.add(ups[0], 1000)).toEqual({ id: ghostId(ups[0]), created: false });
    expect(await store.add(newest, 1001)).toEqual({ id: ghostId(newest), created: false });
    expect(lines(dir)).toHaveLength(9);
    expect(store.cacheStats().playerGhosts).toBe(5);
    // a restart reads the same newest five
    const again = new JsonlStore(dir, { bucketCap: 5, cacheMax: 100 });
    again.load();
    expect(ids(await again.bucket(RULES, 3))).toEqual([...seeds, ...ups.slice(4), newest].map(ghostId).sort());
  });

  it("the ceiling across buckets: the bucket read longest ago loses its oldest first; seed ghosts stay", async () => {
    const dir = fresh();
    const seed3 = variant(base3, "js3"), seed4 = variant(base4, "js4");
    writeSeeds(dir, [seed3, seed4]);
    const store = new JsonlStore(dir, { bucketCap: 4, cacheMax: 6 });
    store.load();
    const d3 = Array.from({ length: 4 }, (_, i) => variant(base3, `x3-${i}`));
    const d4 = Array.from({ length: 4 }, (_, i) => variant(base4, `x4-${i}`));
    for (const s of d3) await store.add(s, 1);
    for (const s of d4) await store.add(s, 1);
    // two buckets, ceiling 6: each one's fair share is 3, so each gave up its oldest (day 3 when day 4 had 3, day 4 when it reached 4): neither is emptied
    expect(store.cacheStats()).toMatchObject({ playerGhosts: 6, evictedByCeiling: 2, evictedByCap: 0 });
    expect(ids(await store.bucket(RULES, 3))).toEqual([seed3, ...d3.slice(1)].map(ghostId).sort());
    expect(ids(await store.bucket(RULES, 4))).toEqual([seed4, ...d4.slice(1)].map(ghostId).sort());
    // day 3 was read first, so it is the least recently used: an upload to a third bucket (7 > 6) gives each bucket a share of 2, and day 3 (over it, read
    // longest ago) gives up its oldest ghost
    await store.add(variant(base5, "x5"), 1);
    expect(ids(await store.bucket(RULES, 3))).toEqual([seed3, ...d3.slice(2)].map(ghostId).sort());
    expect(ids(await store.bucket(RULES, 4))).toEqual([seed4, ...d4.slice(1)].map(ghostId).sort());
    expect(store.cacheStats()).toMatchObject({ playerGhosts: 6, evictedByCeiling: 3, evictedByCap: 0 });
    expect(lines(dir)).toHaveLength(9); // every upload is still a line
  });

  it("endless and run ghosts in one bucket: the kind that holds more loses its oldest on the JSON-lines store too", async () => {
    const dir = fresh();
    const store = new JsonlStore(dir, { bucketCap: 4, cacheMax: 1000 });
    store.load();
    const ends = Array.from({ length: 3 }, (_, i) => variant(endless12, `jk-e${i}`));
    const runs = Array.from({ length: 6 }, (_, i) => variant(run12, `jk-r${i}`));
    for (const s of ends) await store.add(s, 1);
    for (const s of runs) await store.add(s, 1);
    expect(ids(await store.bucket(RULES, 12))).toEqual([...ends.slice(1), ...runs.slice(4)].map(ghostId).sort());
    expect(lines(dir)).toHaveLength(9);
  });
});
