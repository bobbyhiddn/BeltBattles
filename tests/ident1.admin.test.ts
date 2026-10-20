// IDENT-1 step 5 (REQ-BFG-122; BRIEF-IDENT1): `ghost-admin purge-tombstoned`. A player who deleted their online data (DELETE /v1/player)
// leaves a tombstone naming the player and every key that was linked to it; the server stops serving their ghosts at once, and this
// command removes them from the store for good, in EVERY rules version unless --rules names one. A dry run unless --apply; --apply
// deletes exactly the records the plan printed; the seed pool and everyone else's uploads stay. Both stores: the JSON-lines directory,
// and Tigris on the in-process fake S3 (seven keys a LIST page, so every listing follows continuation tokens).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Identity } from "../src/net/identity";
import { COMMANDS, JsonlAdmin, USAGE, makePlan, parseArgs, runAdmin, type AdminStore, type Holdings, type StoredRecord } from "../server/ghostAdmin";
import { FileLinkStore, TigrisLinkStore } from "../server/linkStore";
import { objectKey, parseKey } from "../server/tigrisStore";
import type { FakeS3 } from "../tools/fakeS3";
import { FAKE_CREDS, s3For, startFake } from "./netStores";
import { testIdentity } from "./netIdentity";
import { closeRigs, deleteMe, ghostCount, linkVia, openRig, postGhost, theFake, uploadFor, type Kind } from "./identRig";

let fake: FakeS3;
let A: Identity, B: Identity, C: Identity;
const dirs: string[] = [];
beforeAll(async () => {
  fake = await startFake({ pageSize: 5 });
  [A, B, C] = await Promise.all([0, 1, 2].map((n) => testIdentity(n)));
});
afterAll(async () => {
  await fake.close();
  await closeRigs();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const KINDS: Kind[] = ["jsonl", "tigris"];
const R1 = "bb-0.12.0", R2 = "bb-0.11.0", R3 = "bb-0.9.0";
const T = "tomb-player", K = "tomb-key", X = "other-player", Z = "gone-without-ghosts";

/** A stored ghost record as the tool reads it (leniently: rules, day, id and playerId are all it asks of an upload). */
const record = (id: string, rules: string, day: number, playerId: string): string => JSON.stringify({ id, at: 5, snapshot: { rules, day, playerId } });

/** One store as the tests see it, planted straight into storage. */
interface World {
  kind: Kind;
  argv: string[];
  env: Record<string, string>;
  upload(rules: string, day: number, id: string, playerId: string): void;
  pool(rules: string, day: number, id: string): void;
  tombstone(player: string, ids: string[]): Promise<void>;
  rawTombstone(name: string, text: string): Promise<void>;
  /** Every ghost and pool record still stored: "kind rules id", sorted. */
  ids(): string[];
  /** Every stored byte of the ghosts and the pool. */
  state(): Record<string, string>;
}

let seq = 0;
function world(kind: Kind): World {
  if (kind === "tigris") {
    const bucket = `bb-purge-${++seq}`;
    fake.createBucket(bucket);
    const links = new TigrisLinkStore(s3For(fake, bucket));
    return {
      kind, argv: [],
      env: {
        BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
        AWS_ENDPOINT_URL_S3: fake.endpoint, BUCKET_NAME: bucket, BB_GHOST_S3_ADDRESSING: "path",
      },
      upload: (rules, day, id, p) => fake.putObject(bucket, objectKey("player", rules, day, id), record(id, rules, day, p)),
      pool: (rules, day, id) => fake.putObject(bucket, objectKey("pool", rules, day, id), record(id, rules, day, "pool-player")),
      tombstone: (player, ids) => links.put(`tombstones/${player}.json`, JSON.stringify({ at: 7, ids })),
      rawTombstone: (name, text) => links.put(`tombstones/${name}.json`, text),
      ids: () => fake.keys(bucket, "ghosts/").map((k) => { const p = parseKey(k)!; return `${p.kind} ${p.rules} ${p.id}`; }).sort(),
      state: () => Object.fromEntries(fake.keys(bucket, "ghosts/").map((k) => [k, fake.getObject(bucket, k)!])),
    };
  }
  const dir = mkdtempSync(join(tmpdir(), "bb-purge-"));
  dirs.push(dir);
  const links = new FileLinkStore(join(dir, "identity"));
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
  return {
    kind, argv: ["--data", dir], env: { BB_GHOST_STORE: "jsonl" },
    upload: (rules, day, id, p) => appendFileSync(join(dir, "ghosts.jsonl"), record(id, rules, day, p) + "\n"),
    pool: (rules, day, id) => appendFileSync(join(dir, "pool.jsonl"), record(id, rules, day, "pool-player") + "\n"),
    tombstone: (player, ids) => links.put(`tombstones/${player}.json`, JSON.stringify({ at: 7, ids })),
    rawTombstone: (name, text) => links.put(`tombstones/${name}.json`, text),
    ids: () => (["pool.jsonl", "ghosts.jsonl"] as const).flatMap((f) =>
      read(f).split("\n").filter((l) => l.trim()).map((l) => { const o = JSON.parse(l) as { id: string; snapshot: { rules: string } }; return `${f === "pool.jsonl" ? "pool" : "player"} ${o.snapshot.rules} ${o.id}`; })).sort(),
    state: () => ({ "pool.jsonl": read("pool.jsonl"), "ghosts.jsonl": read("ghosts.jsonl") }),
  };
}

/** The tool as the CLI runs it: its output lines, exit code and the refs of the records it lists as deleted. */
async function admin(w: Pick<World, "argv" | "env">, args: string[], open?: (cfg: never) => AdminStore): Promise<{ code: number; out: string[]; planned: string[] }> {
  const out: string[] = [];
  const code = await runAdmin([...args, ...w.argv], w.env, (l) => out.push(l), open as Parameters<typeof runAdmin>[3]);
  return { code, out, planned: out.filter((l) => l.startsWith("  delete ")).map((l) => l.slice("  delete ".length).split("  ")[0]) };
}

/** The standard world: uploads in three rules versions by a tombstoned player, a key that was linked to it, and somebody else. */
function populate(w: World): void {
  const ups: [string, number, string, string][] = [
    [R1, 1, "g1", T], [R1, 2, "g2", K], [R1, 1, "g3", X], [R1, 3, "g4", X],
    [R2, 1, "h1", T], [R2, 1, "h2", X],
    [R3, 5, "i1", K], [R3, 5, "i2", X],
  ];
  for (const [rules, day, id, p] of ups) w.upload(rules, day, id, p);
  w.pool(R1, 1, "pool1");
  w.pool(R2, 1, "pool2");
}

const PURGED = ["player bb-0.12.0 g1", "player bb-0.12.0 g2", "player bb-0.11.0 h1", "player bb-0.9.0 i1"];

describe("the command's line", () => {
  it("purge-tombstoned is a command; --rules is optional for it and required for the others; it is in the usage", () => {
    expect(COMMANDS).toContain("purge-tombstoned");
    expect(USAGE).toContain("purge-tombstoned");
    expect(parseArgs(["purge-tombstoned"])).toEqual({ command: "purge-tombstoned", rules: "", apply: false, pool: false });
    expect(parseArgs(["purge-tombstoned", "--apply", "--rules", R2, "--data", "x"])).toEqual({ command: "purge-tombstoned", rules: R2, apply: true, pool: false });
    expect(() => parseArgs(["remove-player", T])).toThrow("--rules <bb-x.y.z> is required");
    expect(() => parseArgs(["list"])).toThrow("--rules <bb-x.y.z> is required");
    expect(() => parseArgs(["purge-tombstoned", "--rules", "not-a-version"])).toThrow("is not a rules version");
    expect(() => parseArgs(["purge-tombstoned", T])).toThrow("unexpected argument");
    expect(() => parseArgs(["purge-tombstoned", "--pool"])).toThrow("--pool goes only with wipe-uploads");
  });

  it("makePlan: only an upload whose player is in the tombstoned set; never the seed pool, never an upload with no readable player", () => {
    const rec = (ref: string, kind: "pool" | "upload", playerId: string | null): StoredRecord => ({ ref, kind, day: 1, id: ref, playerId, text: "x", keyed: false });
    const h: Holdings = { records: [rec("a", "upload", T), rec("b", "upload", K), rec("c", "upload", X), rec("d", "pool", T), rec("e", "upload", null)], other: [] };
    const plan = makePlan({ command: "purge-tombstoned", rules: R1, apply: false, pool: false }, h, new Set([T, K]));
    expect(plan.delete.map((d) => d.record.ref)).toEqual(["a", "b"]);
    expect(plan.delete.map((d) => d.why)).toEqual([`tombstoned player ${T}`, `tombstoned player ${K}`]);
    expect(plan.keep).toEqual({ pool: 1, uploads: 2 });
    expect(makePlan({ command: "purge-tombstoned", rules: R1, apply: false, pool: false }, h).delete).toEqual([]); // no set: nothing
  });
});

describe.each(KINDS)("purge-tombstoned on %s", (kind) => {
  it("a dry run lists exactly the tombstoned players' uploads in every rules version and deletes nothing; --apply deletes those and only those", async () => {
    const w = world(kind);
    populate(w);
    await w.tombstone(T, [T, K]); // the player and the key that was linked to it
    await w.tombstone(Z, [Z]); // another deleted player, with no ghosts at all
    const before = w.state();
    const all = w.ids();
    expect(all).toHaveLength(10);

    const dry = await admin(w, ["purge-tombstoned"]);
    expect(dry.code, dry.out.join("\n")).toBe(0);
    expect(dry.out[0]).toContain("ghosts:admin purge-tombstoned (every rules version): ");
    expect(dry.out[0]).toContain("(DRY RUN)");
    expect(dry.out).toContain("tombstones: 3 deleted player and key id(s)");
    expect(dry.out).toContain("plan: delete 4 record(s) in 3 rules version(s)");
    expect(dry.out).toContain("DRY RUN: nothing was deleted. --apply deletes exactly the 4 record(s) above.");
    expect(dry.planned).toHaveLength(4);
    const lines = dry.out.filter((l) => l.startsWith("  delete "));
    expect(lines.filter((l) => l.endsWith(`(tombstoned player ${T})`))).toHaveLength(2);
    expect(lines.filter((l) => l.endsWith(`(tombstoned player ${K})`))).toHaveLength(2);
    expect(lines.every((l) => / upload +day \d+ +ghost [a-z0-9]+ +player (tomb-player|tomb-key) /.test(l))).toBe(true);
    for (const rules of [R1, R2, R3]) expect(dry.out.some((l) => l.startsWith(`${rules}: delete `))).toBe(true);
    expect(w.state()).toEqual(before); // nothing was deleted
    expect(w.ids()).toEqual(all);

    const applied = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(applied.code, applied.out.join("\n")).toBe(0);
    expect(applied.out[0]).toContain("(APPLY)");
    expect(applied.planned).toEqual(dry.planned); // exactly what the plan printed
    expect(applied.out).toContain("APPLIED: deleted 4 of 4 record(s).");
    expect(applied.out.some((l) => l.includes(kind === "tigris" ? "BB_GHOST_CACHE_TTL_S" : "Restart the ghost server"))).toBe(true);
    expect(w.ids()).toEqual(all.filter((id) => !PURGED.includes(id)));
    expect(w.ids().filter((id) => id.startsWith("pool "))).toEqual(["pool bb-0.11.0 pool2", "pool bb-0.12.0 pool1"]); // the seed pool stays
    expect(w.ids().filter((id) => id.startsWith("player ")).every((id) => /g3|g4|h2|i2/.test(id))).toBe(true); // everyone else's stay

    const again = await admin(w, ["purge-tombstoned"]);
    expect(again.code).toBe(0);
    expect(again.out).toContain("plan: delete 0 record(s) in 3 rules version(s)");
    expect(again.planned).toEqual([]);
  });

  it("--rules limits it to one rules version", async () => {
    const w = world(kind);
    populate(w);
    await w.tombstone(T, [T, K]);
    const all = w.ids();
    const r = await admin(w, ["purge-tombstoned", "--rules", R2, "--apply"]);
    expect(r.code, r.out.join("\n")).toBe(0);
    expect(r.out[0]).toContain(`--rules ${R2}`);
    expect(r.out).toContain("plan: delete 1 record(s) in 1 rules version(s)");
    expect(r.out).toContain("APPLIED: deleted 1 of 1 record(s).");
    expect(w.ids()).toEqual(all.filter((id) => id !== "player bb-0.11.0 h1"));
    // a rules version the store has no ghost of is an empty plan, not an error
    const none = await admin(w, ["purge-tombstoned", "--rules", "bb-0.1.0", "--apply"]);
    expect(none.code).toBe(0);
    expect(none.out).toContain("APPLIED: deleted 0 of 0 record(s).");
  });

  it("with no tombstones there is nothing to purge, and no ghost is read; an unreadable tombstone is skipped and said", async () => {
    const w = world(kind);
    populate(w);
    const none = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(none.code).toBe(0);
    expect(none.out).toContain("tombstones: 0 deleted player and key id(s)");
    expect(none.out).toContain("no player has deleted their online data: nothing to purge.");
    expect(none.out).toContain("plan: delete 0 record(s) in 0 rules version(s)");
    expect(w.ids()).toHaveLength(10);
    await w.rawTombstone("junk", "not json");
    await w.rawTombstone("empty", '{"at":1,"ids":"x"}');
    await w.tombstone(T, [T]);
    const r = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(r.code, r.out.join("\n")).toBe(0);
    expect(r.out).toContain("tombstones: 1 deleted player and key id(s); 2 record(s) in tombstones/ could not be read and were skipped");
    expect(r.out).toContain("APPLIED: deleted 2 of 2 record(s).");
    expect(w.ids().filter((id) => /g1|h1/.test(id))).toEqual([]);
    expect(w.ids().filter((id) => /g2|i1/.test(id))).toHaveLength(2); // K was not named in this tombstone
  });

  it("end to end: a player deletes themselves through the server, and the purge removes their ghosts from the store the server uses", async () => {
    const rig = await openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 } });
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-1" }))).status).toBe(201);
    expect((await postGhost(rig, B, uploadFor(B, B.playerId, { runId: "b-1" }))).status).toBe(201); // before B is linked
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "b-2" }))).status).toBe(201); // and after
    expect((await postGhost(rig, C, uploadFor(C, C.playerId, { runId: "c-1" }))).status).toBe(201);
    expect(ghostCount(rig)).toBe(4);
    expect((await deleteMe(rig, A)).status).toBe(200);
    const w: Pick<World, "argv" | "env"> = kind === "jsonl"
      ? { argv: ["--data", rig.dir], env: { BB_GHOST_STORE: "jsonl" } }
      : {
        argv: [],
        env: {
          BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
          AWS_ENDPOINT_URL_S3: theFake().endpoint, BUCKET_NAME: rig.bucket, BB_GHOST_S3_ADDRESSING: "path",
        },
      };
    const dry = await admin(w, ["purge-tombstoned"]);
    expect(dry.code, dry.out.join("\n")).toBe(0);
    expect(dry.out).toContain("tombstones: 2 deleted player and key id(s)"); // the player and B
    expect(dry.planned).toHaveLength(3); // a-1, b-1 (B's own id) and b-2 (under the player)
    expect(ghostCount(rig)).toBe(4);
    const applied = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(applied.code, applied.out.join("\n")).toBe(0);
    expect(applied.out).toContain("APPLIED: deleted 3 of 3 record(s).");
    expect(ghostCount(rig)).toBe(1); // C's stays
    await rig.restart({ rateLimit: { windowMs: 60_000, max: 1_000_000 } });
    expect(ghostCount(rig)).toBe(1);
  });
});

describe("exit codes and errors", () => {
  it("2 for a usage or settings error (nothing read or deleted); the usage is printed", async () => {
    const w = world("jsonl");
    populate(w);
    await w.tombstone(T, [T]);
    const all = w.ids();
    for (const args of [["purge-tombstoned", "--rules", "not-a-version"], ["purge-tombstoned", T], ["purge-tombstoned", "--pool"], ["purge-tombstoned", "--rules"]]) {
      const r = await admin(w, args);
      expect(r.code, args.join(" ")).toBe(2);
      expect(r.out.join("\n")).toContain("usage: npm run ghosts:admin");
    }
    expect(w.ids()).toEqual(all);
    // a data directory that does not exist
    const out: string[] = [];
    expect(await runAdmin(["purge-tombstoned", "--data", join(tmpdir(), "bb-purge-no-such-dir")], { BB_GHOST_STORE: "jsonl" }, (l) => out.push(l))).toBe(2);
    expect(out.join("\n")).toContain("no ghost data directory");
    // a Tigris store without its settings
    const bad = await runAdmin(["purge-tombstoned"], { BB_GHOST_STORE: "tigris" }, () => {});
    expect(bad).toBe(2);
  });

  it("1 for a storage error, an apply that deleted less than its plan, and a store that cannot list tombstones", async () => {
    const w = world("jsonl");
    populate(w);
    await w.tombstone(T, [T, K]);
    const real = new JsonlAdmin(w.argv[1]);
    const failing: AdminStore = { kind: real.kind, where: real.where, read: async () => { throw new Error("disk exploded"); }, remove: (r) => real.remove(r), rulesVersions: () => real.rulesVersions(), tombstoned: () => real.tombstoned() };
    const a = await admin(w, ["purge-tombstoned"], () => failing as never);
    expect(a.code).toBe(1);
    expect(a.out.join("\n")).toContain("ghosts:admin failed: disk exploded");
    const partial: AdminStore = { kind: real.kind, where: real.where, read: (r, b) => real.read(r), remove: (records) => real.remove(records.slice(0, 1)), rulesVersions: () => real.rulesVersions(), tombstoned: () => real.tombstoned() };
    const b = await admin(w, ["purge-tombstoned", "--apply"], () => partial as never);
    expect(b.code).toBe(1);
    expect(b.out).toContain("APPLIED: deleted 1 of 4 record(s).");
    expect(b.out.join("\n")).toContain("3 planned record(s) had already changed or gone");
    const plain: AdminStore = { kind: real.kind, where: real.where, read: (r) => real.read(r), remove: (r) => real.remove(r) };
    const c = await admin(w, ["purge-tombstoned"], () => plain as never);
    expect(c.code).toBe(1);
    expect(c.out.join("\n")).toContain("this store cannot list tombstones or rules versions");
    // Tigris: the bucket refusing the listing is a storage error too
    const t = world("tigris");
    populate(t);
    await t.tombstone(T, [T]);
    fake.failNext(3, 503, "LIST");
    const d = await admin(t, ["purge-tombstoned"]);
    expect(d.code, d.out.join("\n")).toBe(1);
    expect(d.out.join("\n")).toContain("ghosts:admin failed:");
    fake.clearFaults();
  });

  it("the other commands are as they were: remove-player still needs --rules and still removes one player's uploads in one version", async () => {
    const w = world("jsonl");
    populate(w);
    const r = await admin(w, ["remove-player", T, "--rules", R1, "--apply"]);
    expect(r.code, r.out.join("\n")).toBe(0);
    expect(r.out[0]).toBe(`ghosts:admin remove-player ${T} --rules ${R1}: jsonl store, ${w.argv[1]} (APPLY)`);
    expect(w.ids()).not.toContain("player bb-0.12.0 g1");
    expect(w.ids()).toContain("player bb-0.11.0 h1"); // another version: untouched
  });
});
