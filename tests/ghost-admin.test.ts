import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_NAME } from "./netIdentity"; // PACKS M2 (REQ-BFG-063)
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION, START_LIVES } from "../src/sim/content"; // HULL-ON (the flip, HEARTS): START_LIVES, bb-0.6.1's 5 lives
import { isReachable } from "../src/net/records";
import { validateUpload } from "../src/net/validate";
import { ghostId, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot"; // FLIP-X2: SNAPSHOT_VERSION (runeless)
import { createGhostServer, type GhostServer } from "../server/app";
import { runAdmin } from "../server/ghostAdmin";
import { seedStore } from "../server/seed";
import { encodeRecord, JsonlStore, type GhostStore } from "../server/store";
import { objectKey, TigrisStore } from "../server/tigrisStore";
import { generateSamplePool } from "../tools/samplePool";
import type { FakeS3 } from "../tools/fakeS3";
import { FAKE_CREDS, startFake, tigrisFor } from "./netStores";

// 0.7.0 (R1 M2; REQ-BFG-016, REQ-BFG-009): the ghost admin tool (server/ghostAdmin.ts, `npm run ghosts:admin`), on both
// stores: JSON lines in a temp directory, and Tigris through the in-process fake S3, opened from the same env as the
// server's (BB_GHOST_STORE and the Tigris variables). A dry run deletes nothing; --apply deletes exactly the listed
// records and a later list agrees; the seed pool and other rules versions are untouched; bad uploads planted straight into
// the store (bypassing POST) are found by revalidate; and the match route stops serving a deleted ghost.

const POOL = generateSamplePool(); // the seed pool: 120 ghosts of RULES_VERSION (0.8.0 RC: the four heroes; was 60)
const OLD = "bb-0.6.1";
const plain = POOL.filter((s) => !s.build.turrets && !s.build.routes.some((r) => r.join !== undefined)); // valid under bb-0.6.1 too
// HULL-ON (the flip, PICK): with PICK on every seed-pool ghost carries the seed step's grade (snapshot.grade), which no
// upload carries (POST /v1/ghosts: 422 "grade: only the seed pool's ghosts carry a grade"), so an upload made from a pool
// ghost goes without it, as POST stores one (ghostId leaves the grade out: every id is as before)
const ungraded = (s: GhostSnapshot): GhostSnapshot => {
  const { grade: _grade, ...u } = s;
  return u;
};
const own = (s: GhostSnapshot, playerId: string, runId = `run-${playerId}`): GhostSnapshot => ({ ...ungraded(s), playerId, runId, name: TEST_NAME }); // PACKS M2: uploads carry a name; HULL-ON (PICK): no grade
// honest uploads (as POST stores them): 3 by 2 players
const HONEST = [own(POOL[0], "honest-1"), own(POOL.find((s) => s.day === 4)!, "honest-1"), own(POOL.find((s) => s.day === 7)!, "honest-2")];
// another rules version's pool ghost and upload
// FLIP-X2: the pool decks now hold their day's runes (the seed pool is v3, with its run seed) and rules before bb-0.8.7
// refuse a deck holding runes, so bb-0.6.1's ghosts are the pool decks as a pre-rune client sends them: rune-less v2, no
// seed (was { ...plain[0], rules: OLD } and { ...own(plain[1], "honest-1"), rules: OLD }, the pool decks as they were).
// HULL-ON (the flip, PICK): and no grade (v3 only, refused under rules before PICK_RULES). HULL-ON (the flip, HEARTS): the
// pool's records are on 10 hearts now, but under bb-0.6.1 a run has 5 lives and the decoder bounds lives by the rules
// (livesCapFor: 1..9 there; ghostId threw "snapshot.lives: expected an integer in 1..9" in populate), so the copies carry
// their record on that scale: at most START_LIVES (a day-1 deck's 5, as before the flip)
function runeless(s: GhostSnapshot): GhostSnapshot {
  const out: GhostSnapshot = { ...s, v: SNAPSHOT_VERSION, build: { ...s.build } };
  delete out.seed;
  delete out.grade; // HULL-ON (the flip, PICK): the seed step's grade, v3 only (no client uploads one)
  out.lives = Math.min(s.lives, START_LIVES); // HULL-ON (the flip, HEARTS): an older rules string's 5-lives scale
  delete out.build.runes;
  return out;
}
const OLD_POOL: GhostSnapshot = { ...runeless(plain[0]), rules: OLD };
const OLD_UP: GhostSnapshot = { ...runeless(own(plain[1], "honest-1")), rules: OLD };
// bad uploads, planted straight into the store
const D1 = POOL.find((s) => s.day === 1)!, D3 = POOL.find((s) => s.day === 3)!;
const OVER: GhostSnapshot = own({ ...D1, build: { ...D1.build, hullBonus: D1.build.hullBonus + 500 } }, "cheater-1"); // 20 plates over budget
const UNREACH: GhostSnapshot = own({ ...D3, wins: 0, lives: 3 }, "cheater-2"); // a label no run carries into dusk 3
const BROKEN = { ...own(POOL[20], "cheater-3"), wins: POOL[20].day }; // wins must be under the day: the strict decoder refuses
const BADID = own(POOL[30], "cheater-4"); // stored with a record id that is not its own

describe("the planted ghosts are what the tests say they are", () => {
  it("OVER fails validateUpload only; UNREACH fails the reachable-record check only; the honest uploads pass both", () => {
    expect(validateUpload(OVER.build, OVER.day, OVER.rules).ok).toBe(false);
    expect(isReachable(OVER.day, OVER.wins, OVER.lives)).toBe(true);
    expect(validateUpload(UNREACH.build, UNREACH.day, UNREACH.rules).ok).toBe(true);
    expect(isReachable(UNREACH.day, UNREACH.wins, UNREACH.lives)).toBe(false);
    for (const s of HONEST) expect([validateUpload(s.build, s.day, s.rules).ok, isReachable(s.day, s.wins, s.lives)]).toEqual([true, true]);
    expect(plain.length).toBeGreaterThan(2);
  });
});

/** One store as the tests see it. */
interface Harness {
  name: "jsonl" | "tigris";
  env(): Record<string, string>; // the server's settings for this storage
  argv(): string[]; // extra arguments (jsonl: --data <dir>)
  store(opts?: { now?: () => number; ttlMs?: number }): GhostStore; // a fresh store instance over the same storage
  plant(s: unknown, rules: string, day: number, id: string, kind?: "player" | "pool"): string; // straight into storage: its ref
  plantRaw(where: string, body: string): void; // jsonl: a raw line in ghosts.jsonl; tigris: an object at key `where`
  state(): Record<string, string>; // every stored byte
  without(state: Record<string, string>, refs: string[]): Record<string, string>; // the state minus those records
}

let fake: FakeS3;
const dirs: string[] = [];
beforeAll(async () => {
  fake = await startFake({ pageSize: 7 }); // seven keys a LIST page: every listing follows continuation tokens
});
afterAll(async () => {
  await fake.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

let seq = 0;
function tigrisHarness(): Harness {
  const bucket = `bb-admin-${++seq}`;
  fake.createBucket(bucket);
  return {
    name: "tigris",
    env: () => ({
      BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
      AWS_ENDPOINT_URL_S3: fake.endpoint, BUCKET_NAME: bucket, BB_GHOST_S3_ADDRESSING: "path",
    }),
    argv: () => [],
    store: (o = {}) => tigrisFor(fake, bucket, o),
    plant(s, rules, day, id, kind = "player") {
      const key = objectKey(kind, rules, day, id);
      fake.putObject(bucket, key, typeof s === "string" ? s : encodeRecord(id, 5, s as GhostSnapshot));
      return key;
    },
    plantRaw: (key, body) => fake.putObject(bucket, key, body),
    state: () => Object.fromEntries(fake.keys(bucket).map((k) => [k, fake.getObject(bucket, k)!])),
    without: (st, refs) => Object.fromEntries(Object.entries(st).filter(([k]) => !refs.includes(k))),
  };
}

function jsonlHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), "bb-admin-"));
  dirs.push(dir);
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
  return {
    name: "jsonl",
    env: () => ({ BB_GHOST_STORE: "jsonl" }),
    argv: () => ["--data", dir],
    store() {
      const s = new JsonlStore(dir);
      s.load();
      return s;
    },
    plant(s, _rules, _day, id) {
      appendFileSync(join(dir, "ghosts.jsonl"), (typeof s === "string" ? s : encodeRecord(id, 5, s as GhostSnapshot)) + "\n");
      return `ghosts.jsonl:${read("ghosts.jsonl").trimEnd().split("\n").length}`;
    },
    plantRaw: (_where, body) => appendFileSync(join(dir, "ghosts.jsonl"), body + "\n"),
    state: () => ({ "pool.jsonl": read("pool.jsonl"), "ghosts.jsonl": read("ghosts.jsonl") }),
    without(st, refs) {
      const out: Record<string, string> = {};
      for (const [file, text] of Object.entries(st)) {
        const drop = new Set(refs.filter((r) => r.startsWith(`${file}:`)).map((r) => Number(r.split(":")[1]) - 1));
        out[file] = text.split("\n").filter((_, i) => !drop.has(i)).join("\n");
      }
      return out;
    },
  };
}

/** The tool, as the CLI runs it: its output lines and exit code. */
async function admin(h: Harness, ...args: string[]): Promise<{ code: number; out: string[]; planned: string[] }> {
  const out: string[] = [];
  const code = await runAdmin([...args, ...h.argv()], h.env(), (l) => out.push(l));
  const planned = out.filter((l) => l.startsWith("  delete ")).map((l) => l.slice("  delete ".length).split("  ")[0]);
  return { code, out, planned };
}

/** list's table as { day: [pool, uploads, players] }, with "all" for the totals. */
function table(out: string[]): Record<string, [number, number, number]> {
  const t: Record<string, [number, number, number]> = {};
  for (const l of out) {
    const m = /^ +(\d+|all|\?) +(\d+) +(\d+) +(\d+)$/.exec(l);
    if (m) t[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return t;
}

/** Seed pool, honest uploads (through the store, as POST stores them), another rules version's pool ghost and upload. */
async function populate(h: Harness): Promise<void> {
  const store = h.store();
  await seedStore(store);
  await store.replacePool(OLD, [{ id: ghostId(OLD_POOL), snapshot: OLD_POOL }]);
  for (const s of [...HONEST, OLD_UP]) await store.add(s, 7);
}

/** The four bad uploads (and on Tigris a stray key and a foreign object), planted straight into the store: their refs. */
function plantBad(h: Harness): { refs: Record<string, string>; strays: string[] } {
  const refs: Record<string, string> = {
    over: h.plant(OVER, RULES_VERSION, OVER.day, ghostId(OVER)),
    unreach: h.plant(UNREACH, RULES_VERSION, UNREACH.day, ghostId(UNREACH)),
    broken: h.plant(JSON.stringify({ id: "gbroken00000001", at: 5, snapshot: BROKEN }), RULES_VERSION, BROKEN.day, "gbroken00000001"),
    badid: h.plant(JSON.stringify({ id: "gnotitsid000001", at: 5, snapshot: BADID }), RULES_VERSION, BADID.day, ghostId(BADID)),
  };
  const strays: string[] = [];
  if (h.name === "tigris") {
    refs.badkey = `ghosts/${RULES_VERSION}/d03/player/not a key.json`;
    h.plantRaw(refs.badkey, encodeRecord("x", 5, own(POOL[3], "cheater-5")));
    strays.push(`ghosts/${RULES_VERSION}/d03/notes.txt`); // neither pool nor player: never touched
    h.plantRaw(strays[0], "hello");
  } else {
    h.plantRaw("ghosts.jsonl", "not a ghost"); // no rules version: never touched
  }
  return { refs, strays };
}

describe.each([{ name: "jsonl", make: jsonlHarness }, { name: "tigris", make: tigrisHarness }])("ghosts:admin on the $name store", ({ make }) => {
  let h: Harness;
  beforeEach(async () => {
    h = make();
    await populate(h);
  });

  it("list: per day the seed-pool ghosts, the uploads and the distinct players; it changes nothing", async () => {
    const before = h.state();
    const r = await admin(h, "list", "--rules", RULES_VERSION);
    expect(r.code).toBe(0);
    const t = table(r.out);
    for (let day = 1; day <= 10; day++) {
      const ups = HONEST.filter((s) => s.day === day);
      expect(t[String(day)], `day ${day}`).toEqual([POOL.filter((s) => s.day === day).length, ups.length, new Set(ups.map((s) => s.playerId)).size]);
    }
    expect(t.all).toEqual([120, 3, 2]); // 0.8.0 RC (oracle 96e0ebe434a93f2b): the four-hero seed pool (was 60)
    expect(h.state()).toEqual(before);
    // another rules version is listed on its own
    expect(table((await admin(h, "list", "--rules", OLD)).out).all).toEqual([1, 1, 1]);
  });

  it("a dry run (no --apply) deletes nothing, for every command, and prints exactly what --apply would delete", async () => {
    plantBad(h);
    const before = h.state();
    for (const cmd of [["revalidate"], ["wipe-uploads"], ["wipe-uploads", "--pool"], ["remove-player", "honest-1"]]) {
      const r = await admin(h, ...cmd, "--rules", RULES_VERSION);
      expect(r.code, cmd.join(" ")).toBe(0);
      expect(r.planned.length, cmd.join(" ")).toBeGreaterThan(0);
      expect(r.out.join("\n")).toMatch(/DRY RUN: nothing was deleted/);
      expect(h.state(), cmd.join(" ")).toEqual(before);
    }
  });

  it("revalidate finds every bad upload planted past POST, with its reason; --apply deletes exactly those; then it is clean", async () => {
    const { refs, strays } = plantBad(h);
    const before = h.state();
    const dry = await admin(h, "revalidate", "--rules", RULES_VERSION);
    expect(dry.planned.sort()).toEqual(Object.values(refs).sort());
    const why = (ref: string) => dry.out.find((l) => l.startsWith(`  delete ${ref}  `)) ?? "";
    expect(why(refs.over)).toMatch(/validateUpload: budget/);
    expect(why(refs.unreach)).toMatch(/0W 3 lives is no record a run carries into dusk 3/);
    expect(why(refs.broken)).toMatch(/strict decode: snapshot\.wins/);
    expect(why(refs.badid)).toMatch(/record: id "gnotitsid000001" is not the snapshot's ghost id/);
    if (refs.badkey) expect(why(refs.badkey)).toMatch(/key: .* is not a ghost key/);
    for (const r of [refs.over, refs.unreach, refs.badid]) expect(why(r)).not.toMatch(/strict decode/); // they decode: only the deeper checks catch them
    const applied = await admin(h, "revalidate", "--rules", RULES_VERSION, "--apply");
    expect(applied.code).toBe(0);
    expect(applied.planned.sort()).toEqual(dry.planned.sort());
    expect(applied.out.join("\n")).toMatch(new RegExp(`APPLIED: deleted ${dry.planned.length} of ${dry.planned.length}`));
    expect(h.state()).toEqual(h.without(before, dry.planned)); // exactly the listed records
    for (const s of strays) expect(h.state()[s]).toBe("hello");
    const again = await admin(h, "revalidate", "--rules", RULES_VERSION);
    expect(again.planned).toEqual([]);
    expect(table((await admin(h, "list", "--rules", RULES_VERSION)).out).all).toEqual([120, 3, 2]); // a later list agrees (0.8.0 RC: was 60)
  });

  it("wipe-uploads deletes every upload of that rules version, never the seed pool without --pool, nothing of another version", async () => {
    plantBad(h);
    const before = h.state();
    const r = await admin(h, "wipe-uploads", "--rules", RULES_VERSION, "--apply");
    expect(r.code).toBe(0);
    expect(r.planned).toHaveLength(HONEST.length + (h.name === "tigris" ? 5 : 4));
    expect(r.out.join("\n")).toMatch(/the seed pool \(120\) stays: --pool would delete it too/); // 0.8.0 RC: was (60)
    expect(h.state()).toEqual(h.without(before, r.planned));
    expect(table((await admin(h, "list", "--rules", RULES_VERSION)).out).all).toEqual([120, 0, 0]); // a later list agrees (0.8.0 RC: was 60)
    expect(table((await admin(h, "list", "--rules", OLD)).out).all).toEqual([1, 1, 1]); // another rules version: untouched
    const store = h.store(); // the seed pool still matches, every day
    for (let day = 1; day <= 10; day++) expect((await store.bucket(RULES_VERSION, day, "pool")).length).toBe(POOL.filter((s) => s.day === day).length);
  });

  it("wipe-uploads --pool deletes the seed pool too (the next seed writes it back); still nothing of another version", async () => {
    const before = h.state();
    const r = await admin(h, "wipe-uploads", "--pool", "--rules", RULES_VERSION, "--apply");
    expect(r.code).toBe(0);
    expect(r.planned).toHaveLength(120 + HONEST.length); // 0.8.0 RC: was 60
    expect(h.state()).toEqual(h.without(before, r.planned));
    expect(table((await admin(h, "list", "--rules", RULES_VERSION)).out).all).toEqual([0, 0, 0]);
    expect(table((await admin(h, "list", "--rules", OLD)).out).all).toEqual([1, 1, 1]);
    expect(await seedStore(h.store())).toMatchObject({ written: 120, removed: 0 });
    expect(table((await admin(h, "list", "--rules", RULES_VERSION)).out).all).toEqual([120, 0, 0]); // 0.8.0 RC: was 60
  });

  it("remove-player deletes every upload by that player and nothing else; a seed ghost's player id touches no pool ghost", async () => {
    plantBad(h);
    const before = h.state();
    const r = await admin(h, "remove-player", "honest-1", "--rules", RULES_VERSION, "--apply");
    expect(r.code).toBe(0);
    expect(r.planned).toHaveLength(HONEST.filter((s) => s.playerId === "honest-1").length);
    expect(h.state()).toEqual(h.without(before, r.planned));
    expect(table((await admin(h, "list", "--rules", OLD)).out).all).toEqual([1, 1, 1]); // honest-1's bb-0.6.1 upload stays
    const seedPlayer = POOL[0].playerId;
    expect((await admin(h, "remove-player", seedPlayer, "--rules", RULES_VERSION)).planned).toEqual([]);
  });

  it("refuses, touching nothing (exit 2): no --rules, bad rules, unknown command or option, misplaced flags, revalidate of another version", async () => {
    const before = h.state();
    const bad: string[][] = [
      ["list"], ["wipe-uploads", "--apply"], ["list", "--rules", "0.6.2"], ["list", "--rules", "bb-0.6.2/x"], ["purge", "--rules", RULES_VERSION],
      ["list", "--rules", RULES_VERSION, "--aply"], ["revalidate", "--pool", "--rules", RULES_VERSION], ["list", "--apply", "--rules", RULES_VERSION],
      ["remove-player", "--rules", RULES_VERSION], ["remove-player", "bad id!", "--rules", RULES_VERSION], ["revalidate", "--rules", OLD, "--apply"],
      ["list", "extra", "--rules", RULES_VERSION],
    ];
    for (const a of bad) {
      const r = await admin(h, ...a);
      expect(r.code, a.join(" ")).toBe(2);
      expect(r.out[0], a.join(" ")).toMatch(/^ghosts:admin: /);
    }
    expect(h.state()).toEqual(before);
    if (h.name === "jsonl") {
      const out: string[] = [];
      expect(await runAdmin(["list", "--rules", RULES_VERSION, "--data", join(tmpdir(), "bb-admin-no-such-dir")], h.env(), (l) => out.push(l))).toBe(2);
      expect(out[1]).toMatch(/no ghost data directory/);
    } else {
      const out: string[] = [];
      expect(await runAdmin(["list", "--rules", RULES_VERSION], { BB_GHOST_STORE: "tigris" }, (l) => out.push(l))).toBe(2);
      expect(out[0]).toMatch(/needs AWS_ACCESS_KEY_ID/);
    }
  });

  it("the match route stops serving a deleted ghost: a fresh server at once; a running one when it reloads (Tigris: its cache TTL)", async () => {
    const { refs } = plantBad(h);
    // 0.8.0 I1 M3 (oracle 64485b535a06683c): the regrown stand-in pool gives the seed ghosts new ids, and BADID (POOL[30],
    // a day-1 0W 5-lives ghost like OVER) now wins the match's tie-break against OVER. So `seen` also lists every other
    // planted ghost, under each id it is planted with, and OVER is the only ghost the match can serve (BROKEN has no
    // ghostId: its wins break the strict decoder, so it goes by its planted id alone).
    const planted = [UNREACH, BADID].map(ghostId).concat(["gbroken00000001", "gnotitsid000001"]);
    const seen = POOL.filter((s) => s.day === OVER.day).map(ghostId).concat(HONEST.filter((s) => s.day === OVER.day).map(ghostId), planted);
    const ask = async (app: GhostServer) => {
      const base = `http://127.0.0.1:${await app.listen(0)}`;
      const q = `rules=${RULES_VERSION}&day=${OVER.day}&wins=${OVER.wins}&lives=${OVER.lives}&player=someone&runs=3&seen=${seen.join(",")}`;
      const r = await fetch(`${base}/v1/ghosts/match?${q}`);
      const body = (await r.json()) as { id?: string };
      await app.close();
      return r.status === 200 ? body.id : r.status;
    };
    let now = 1_000_000;
    const running = h.name === "tigris"
      ? h.store({ ttlMs: 60_000, now: () => now }) // the server's store, its bucket cache on a test clock
      : h.store();
    expect(await ask(createGhostServer({ store: running, log: () => {}, matchSalt: () => 0 }))).toBe(ghostId(OVER)); // served before
    const r = await admin(h, "revalidate", "--rules", RULES_VERSION, "--apply");
    expect(r.planned).toContain(refs.over);
    expect(await ask(createGhostServer({ store: h.store(), log: () => {}, matchSalt: () => 0 }))).toBe(404); // a fresh server
    // the running one still has it in memory: until its cache TTL passes (Tigris), or until it restarts (JSON lines)
    expect(await ask(createGhostServer({ store: running, log: () => {}, matchSalt: () => 0 }))).toBe(ghostId(OVER));
    if (running instanceof TigrisStore) {
      now += 60_000; // the TTL passes: the next match re-lists the bucket and the deleted key is gone
      expect(await ask(createGhostServer({ store: running, log: () => {}, matchSalt: () => 0 }))).toBe(404);
    }
  });
});
