import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION } from "../src/sim/content";
import { ghostId, SNAPSHOT_VERSION, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { createGhostServer } from "../server/app";
import { checkPool, SeedError, seedStore } from "../server/seed";
import { encodeRecord, JsonlStore, poolRecord, type GhostStore } from "../server/store";
import { objectKey, parseKey } from "../server/tigrisStore";
import { generateSamplePool } from "../tools/samplePool";
import type { FakeS3 } from "../tools/fakeS3";
import { startFake, tigrisFor } from "./netStores";

// the bundle: 60 ghosts, days 1-10 (0.7.0a D5: 40 sample ghosts and 20 floor ghosts, tools/samplePool.ts)
const POOL = generateSamplePool();
const N = POOL.length;
const BUNDLE = POOL.map((s) => ({ id: ghostId(s), snapshot: s }));
const STALE: GhostSnapshot = { ...POOL[5], createdAt: POOL[5].createdAt + 1 }; // valid, current rules, not in the bundle
// another rules version's pool entry. 0.8.0 I1 M3 (oracle 64485b535a06683c): the first plain deck (no turret list, no
// joined belt), as ghost-admin's OLD_POOL; the regrown pool's POOL[0] joins a belt, which bb-0.3.0 can't carry
const OLD_RULES: GhostSnapshot = { ...POOL.find((s) => !s.build.turrets && !s.build.routes.some((r) => r.join !== undefined))!, rules: "bb-0.3.0" };
const PLAYER: GhostSnapshot = { ...POOL[12], playerId: "real-player-1", runId: "run-p1" };
const entry = (s: GhostSnapshot): PoolEntry => ({ id: ghostId(s), snapshot: s });
// 0.6.2's v2 snapshot: a build may carry turrets (REQ-BFG-031) and a route a join (REQ-BFG-027)
const TURRET_DECKS = BUNDLE.filter((e) => e.snapshot.build.turrets !== undefined);
const JOIN_DECKS = BUNDLE.filter((e) => e.snapshot.build.routes.some((r) => r.join !== undefined));

describe("the bundled pool the seed writes", () => {
  it("is 60 v2 ghosts of the current rules, with turret decks and join decks among them, each one passing the seed's checks", () => {
    expect(N).toBe(60); // 0.7.0a D5: 2 heroes x (2 sample variants + 1 floor ghost) x 10 days
    for (const s of POOL) expect([s.v, s.rules]).toEqual([SNAPSHOT_VERSION, RULES_VERSION]);
    expect(TURRET_DECKS.length).toBeGreaterThan(0);
    expect(JOIN_DECKS.length).toBeGreaterThan(0);
    // strict decode, the current rules, validateUpload (the player mode), a reachable record, no duplicates
    expect(checkPool(POOL)).toHaveLength(N);
  });
});

/** One storage backend as the seed sees it, with hooks to plant and inspect raw state. */
interface Harness {
  store(): GhostStore; // a new store instance (a fresh process) over the same storage
  pool(rules?: string): Map<string, string>; // stored pool records for rules: id -> bytes
  plantPool(e: PoolEntry, body?: string): void; // write a pool record behind the seed's back
  plantJunk(): void; // something unreadable where the pool lives
  players(): string; // every player record, raw, for "untouched" checks
  writes(): number; // write operations so far
}

let fake: FakeS3;
beforeAll(async () => {
  fake = await startFake({ pageSize: 7 });
});
afterAll(async () => {
  await fake.close();
});

let n = 0;
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function tigrisHarness(): Harness {
  const bucket = `bb-seed-${++n}`;
  fake.createBucket(bucket);
  const mutating = () => fake.requests.filter((r) => r.bucket === bucket && (r.op === "PUT" || r.op === "DELETE")).length;
  return {
    store: () => tigrisFor(fake, bucket),
    pool(rules = RULES_VERSION) {
      const out = new Map<string, string>();
      for (const k of fake.keys(bucket, `ghosts/${rules}/`)) {
        if (!k.includes("/pool/")) continue;
        out.set(parseKey(k)?.id ?? k, fake.getObject(bucket, k)!);
      }
      return out;
    },
    plantPool(e, body = poolRecord(e)) {
      fake.putObject(bucket, objectKey("pool", e.snapshot.rules, e.snapshot.day, e.id), body);
    },
    plantJunk() {
      fake.putObject(bucket, `ghosts/${RULES_VERSION}/d03/pool/junk.txt`, "not a ghost");
    },
    players() {
      return fake.keys(bucket).filter((k) => k.includes("/player/")).map((k) => `${k}=${fake.getObject(bucket, k)}`).join("\n");
    },
    writes: mutating,
  };
}

function jsonlHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), "bb-seed-"));
  dirs.push(dir);
  const poolFile = join(dir, "pool.jsonl");
  const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");
  let writes = 0;
  let last = "";
  return {
    store() {
      const s = new JsonlStore(dir);
      s.load();
      return s;
    },
    pool(rules = RULES_VERSION) {
      const out = new Map<string, string>();
      for (const line of read(poolFile).split("\n").filter(Boolean)) {
        try {
          const rec = JSON.parse(line) as { id: string; snapshot: GhostSnapshot };
          if (rec.snapshot.rules === rules) out.set(rec.id, line);
        } catch {
          out.set(`unreadable:${line}`, line);
        }
      }
      return out;
    },
    plantPool(e, body = poolRecord(e)) { // overwrite this ghost's line, as a PUT would overwrite its object
      const others = read(poolFile).split("\n").filter((l) => l && !l.startsWith(`{"id":"${e.id}"`));
      writeFileSync(poolFile, [...others, body].join("\n") + "\n");
      last = read(poolFile);
    },
    plantJunk() {
      appendFileSync(poolFile, "not a ghost\n");
      last = read(poolFile);
    },
    players: () => read(join(dir, "ghosts.jsonl")),
    writes() {
      const now = read(poolFile);
      if (now !== last) writes++;
      last = now;
      return writes;
    },
  };
}

describe.each([
  { name: "tigris", make: tigrisHarness },
  { name: "jsonl", make: jsonlHarness },
])("seed on the $name store", ({ make }) => {
  let h: Harness;
  beforeEach(() => {
    h = make();
  });

  const bundleRecords = () => new Map(BUNDLE.map((e) => [e.id, poolRecord(e)]));

  it("writes the bundled pool; the pool for RULES_VERSION is then exactly the bundle, and every match day has it", async () => {
    const r = await seedStore(h.store());
    expect(r).toEqual({ rules: RULES_VERSION, entries: N, written: N, unchanged: 0, removed: 0 });
    expect(h.pool()).toEqual(bundleRecords());
    const store = h.store();
    for (let day = 1; day <= 10; day++) {
      const b = await store.bucket(RULES_VERSION, day);
      expect(b.map((e) => e.id).sort()).toEqual(BUNDLE.filter((e) => e.snapshot.day === day).map((e) => e.id).sort());
    }
  });

  it("a re-run changes nothing", async () => {
    await seedStore(h.store());
    const before = h.pool();
    const writes = h.writes();
    expect(await seedStore(h.store())).toMatchObject({ written: 0, unchanged: N, removed: 0 });
    expect(h.writes()).toBe(writes);
    expect(h.pool()).toEqual(before);
  });

  it("removes stale pool entries (and junk under the pool), rewrites a changed one, leaves other rules versions alone", async () => {
    await seedStore(h.store());
    h.plantPool(entry(STALE));
    h.plantJunk();
    h.plantPool(BUNDLE[7], encodeRecord(BUNDLE[7].id, 1, BUNDLE[7].snapshot)); // same ghost, different bytes
    h.plantPool(entry(OLD_RULES));
    const r = await seedStore(h.store());
    expect(r).toMatchObject({ written: 1, unchanged: N - 1, removed: 2 });
    expect(h.pool()).toEqual(bundleRecords());
    expect([...h.pool("bb-0.3.0").keys()]).toEqual([ghostId(OLD_RULES)]);
  });

  it("never touches player uploads", async () => {
    const store = h.store();
    await store.add(PLAYER, 42);
    await store.add(POOL[3], 43); // a player who uploaded a deck identical to a pool entry
    const players = h.players();
    expect(players).not.toBe("");
    h.plantPool(entry(STALE));
    await seedStore(h.store());
    await seedStore(h.store());
    expect(h.players()).toBe(players);
    const fresh = h.store();
    const day = await fresh.bucket(RULES_VERSION, PLAYER.day);
    expect(day.map((e) => e.id)).toContain(ghostId(PLAYER));
    expect(day).toHaveLength(POOL.filter((s) => s.day === PLAYER.day).length + 1); // the day's pool ghosts + the player's
  });

  it("fails the run, writing nothing, when any entry fails validateUpload (or is off-rules, or a duplicate)", async () => {
    const bad = { ...POOL[0], build: { ...POOL[0].build, hullBonus: POOL[0].build.hullBonus + 500 } }; // 20 plates over day 1's budget
    const err = await seedStore(h.store(), [...POOL, bad]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SeedError);
    expect((err as Error).message).toMatch(new RegExp(`1 of ${N + 1} pool entries failed their checks; nothing was written`));
    // 0.7.0a D5: the seed's deck check is validateUpload, the player (honest) mode an upload meets
    expect((err as Error).message).toMatch(new RegExp(`entry ${N} \\(furnace day 1\\): validateUpload: budget`));
    expect(h.pool().size).toBe(0);
    expect(h.writes()).toBe(0);
    expect(() => checkPool([POOL[0], POOL[0]])).toThrow(/duplicate of ghost/);
    expect(() => checkPool([{ ...POOL[0], rules: "bb-9.9.9" }])).toThrow(/rules bb-9\.9\.9 is not/);
    expect(() => checkPool([{ nonsense: true }])).toThrow(/entry 0/);
    expect(() => checkPool([])).toThrow(/empty/);
  });

  it("seeded ghosts are served by the match endpoint", async () => {
    await seedStore(h.store());
    const app = createGhostServer({ store: h.store(), log: () => {}, matchSalt: () => 0 });
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    const codes: number[] = [];
    for (let day = 1; day <= 10; day++) {
      // 0.7.0a D1: the best record a player can carry into this dusk (day - 1 wins, every life), so every seed ghost of
      // the day is eligible; no runs stated: a new player, matched against the seed pool only (D2)
      codes.push((await fetch(`${base}/v1/ghosts/match?rules=${RULES_VERSION}&day=${day}&wins=${day - 1}&lives=5&player=seed-check&seen=`)).status);
    }
    await app.close();
    expect(codes).toEqual(Array(10).fill(200));
  });

  it("decks with turrets and joins are stored and loaded back intact", async () => {
    await seedStore(h.store());
    const store = h.store(); // a fresh process over the same storage
    const loaded = new Map<string, GhostSnapshot>();
    for (let day = 1; day <= 10; day++) for (const e of await store.bucket(RULES_VERSION, day)) loaded.set(e.id, e.snapshot);
    expect(loaded.size).toBe(N);
    for (const e of [...TURRET_DECKS, ...JOIN_DECKS]) expect(loaded.get(e.id)).toEqual(e.snapshot);
  });
});

describe("seed on the JSON-lines store keeps ghosts.jsonl apart", () => {
  it("writes pool.jsonl atomically and leaves ghosts.jsonl byte for byte", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bb-seed-files-"));
    dirs.push(dir);
    writeFileSync(join(dir, "ghosts.jsonl"), encodeRecord(ghostId(PLAYER), 7, PLAYER) + "\n");
    const before = readFileSync(join(dir, "ghosts.jsonl"), "utf8");
    const s = new JsonlStore(dir);
    s.load();
    await seedStore(s);
    expect(readFileSync(join(dir, "ghosts.jsonl"), "utf8")).toBe(before);
    expect(readFileSync(join(dir, "pool.jsonl"), "utf8").trim().split("\n")).toHaveLength(N);
    expect(existsSync(join(dir, "pool.jsonl.tmp"))).toBe(false);
    expect(s.size).toBe(N + 1);
  });
});
