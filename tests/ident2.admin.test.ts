// IDENT-2 step 5 (REQ-BFG-122 clause 4; BRIEF-IDENT2 design 4): `ghost-admin purge-tombstoned` also removes history/<id>/ for every tombstoned id. This
// closes the cross-machine window of VERIFY-IDENT1-FIX2 finding G: a machine that had not yet seen a tombstone can store a history entry under a deleted
// id after the DELETE removed the history, and only the purge finds it. A dry run lists the objects and counts them and deletes nothing; --apply deletes
// exactly those; everybody else's history stays; with no tombstone nothing about history is said or touched. Both stores: the JSON-lines directory, and
// Tigris on the in-process fake S3 (five keys a LIST page, so every listing follows continuation tokens).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Identity } from "../src/net/identity";
import { encodeEntry } from "../src/net/historyWire";
import { JsonlAdmin, runAdmin, type AdminStore } from "../server/ghostAdmin";
import { nameOf } from "../server/historyStore";
import { FileLinkStore, TigrisLinkStore } from "../server/linkStore";
import { objectKey } from "../server/tigrisStore";
import type { FakeS3 } from "../tools/fakeS3";
import { FAKE_CREDS, s3For, startFake } from "./netStores";
import { testIdentity } from "./netIdentity";
import { closeRigs, deleteMe, linkVia, theFake } from "./identRig";
import { FINISHED, entryFor, historyObjects, openHistoryRig, putEntry, writeObject, type Kind } from "./ident2Rig";

let fake: FakeS3;
let A: Identity, B: Identity;
const dirs: string[] = [];
beforeAll(async () => {
  fake = await startFake({ pageSize: 5 });
  [A, B] = await Promise.all([0, 1].map((n) => testIdentity(n)));
});
afterAll(async () => {
  await fake.close();
  await closeRigs();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const KINDS: Kind[] = ["jsonl", "tigris"];
const R1 = "bb-0.12.0";
const P = "tomb-player", K = "tomb-key", X = "other-player", Z = "gone-without-history";

/** A stored ghost record as the tool reads it (leniently: rules, day, id and playerId are all it asks of an upload). */
const ghost = (id: string, rules: string, day: number, playerId: string): string => JSON.stringify({ id, at: 5, snapshot: { rules, day, playerId } });

interface World {
  kind: Kind;
  argv: string[];
  env: Record<string, string>;
  /** Plant a ghost upload. */
  upload(rules: string, day: number, id: string, playerId: string): void;
  tombstone(player: string, ids: string[]): Promise<void>;
  /** Plant an entry object under history/<owner>/ (straight into storage); returns its key "history/<owner>/<name>". */
  history(owner: string, id: string, finishedAt?: number): string;
  /** Every history object still stored, as "history/<owner>/<name>", sorted. */
  held(): string[];
  /** Every ghost still stored, "rules id". */
  ghosts(): string[];
}

let seq = 0;
function world(kind: Kind): World {
  const text = (id: string, finishedAt: number): string => encodeEntry(entryFor(id, { finishedAt }));
  if (kind === "tigris") {
    const bucket = `bb-hpurge-${++seq}`;
    fake.createBucket(bucket);
    const links = new TigrisLinkStore(s3For(fake, bucket));
    return {
      kind, argv: [],
      env: {
        BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
        AWS_ENDPOINT_URL_S3: fake.endpoint, BUCKET_NAME: bucket, BB_GHOST_S3_ADDRESSING: "path",
      },
      upload: (rules, day, id, p) => fake.putObject(bucket, objectKey("player", rules, day, id), ghost(id, rules, day, p)),
      tombstone: (player, ids) => links.put(`tombstones/${player}.json`, JSON.stringify({ at: 7, ids })),
      history: (owner, id, finishedAt = FINISHED) => {
        const key = `history/${owner}/${nameOf({ finishedAt, id })}`;
        fake.putObject(bucket, key, text(id, finishedAt));
        return key;
      },
      held: () => fake.keys(bucket, "history/"),
      ghosts: () => fake.keys(bucket, "ghosts/").map((k) => k.split("/").slice(1).join("/")),
    };
  }
  const dir = mkdtempSync(join(tmpdir(), "bb-hpurge-"));
  dirs.push(dir);
  const links = new FileLinkStore(join(dir, "identity"));
  return {
    kind, argv: ["--data", dir], env: { BB_GHOST_STORE: "jsonl" },
    upload: (rules, day, id, p) => appendFileSync(join(dir, "ghosts.jsonl"), ghost(id, rules, day, p) + "\n"),
    tombstone: (player, ids) => links.put(`tombstones/${player}.json`, JSON.stringify({ at: 7, ids })),
    history: (owner, id, finishedAt = FINISHED) => {
      const name = nameOf({ finishedAt, id });
      mkdirSync(join(dir, "history", owner), { recursive: true });
      writeFileSync(join(dir, "history", owner, name), text(id, finishedAt));
      return `history/${owner}/${name}`;
    },
    held: () => {
      const root = join(dir, "history");
      return existsSync(root) ? readdirSync(root).flatMap((o) => readdirSync(join(root, o)).map((n) => `history/${o}/${n}`)).sort() : [];
    },
    ghosts: () => (existsSync(join(dir, "ghosts.jsonl")) ? readFileSync(join(dir, "ghosts.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => {
      const o = JSON.parse(l) as { id: string; snapshot: { rules: string } };
      return `${o.snapshot.rules} ${o.id}`;
    }) : []),
  };
}

/** The tool as the CLI runs it: its output lines and exit code. */
async function admin(w: Pick<World, "argv" | "env">, args: string[], open?: (cfg: never) => AdminStore): Promise<{ code: number; out: string[]; history: string[] }> {
  const out: string[] = [];
  const code = await runAdmin([...args, ...w.argv], w.env, (l) => out.push(l), open as Parameters<typeof runAdmin>[3]);
  return { code, out, history: out.filter((l) => l.startsWith("  delete history/")).map((l) => l.slice("  delete ".length)) };
}

/** The standard world: three tombstoned players' ids (one with no history), and history of somebody else, an id that only starts like a tombstoned one. */
function populate(w: World): string[] {
  w.history(P, "p-1", FINISHED);
  w.history(P, "p-2", FINISHED - 1_000);
  w.history(P, "p-3", FINISHED - 2_000);
  w.history(K, "k-1", FINISHED - 3_000);
  return [w.history(X, "x-1"), w.history(X, "x-2", FINISHED - 1_000), w.history(`${P}x`, "lookalike")]; // what stays
}

describe.each(KINDS)("purge-tombstoned removes the run history of tombstoned ids on %s", (kind) => {
  it("a dry run lists the history objects and counts them and deletes nothing; --apply deletes exactly those and no one else's; a repeat finds none", async () => {
    const w = world(kind);
    const stays = populate(w);
    await w.tombstone(P, [P, K]); // the player and the key that was linked to it
    await w.tombstone(Z, [Z]); // another deleted player, with no history at all
    const before = w.held();
    expect(before).toHaveLength(7);

    const dry = await admin(w, ["purge-tombstoned"]);
    expect(dry.code, dry.out.join("\n")).toBe(0);
    expect(dry.out).toContain("tombstones: 3 deleted player and key id(s)");
    expect(dry.out).toContain("history: delete 4 object(s) under history/<id>/ of 2 of the 3 tombstoned id(s)");
    expect(dry.out).toContain("plan: delete 0 record(s) in 0 rules version(s)"); // no ghost at all: history is on its own
    expect(dry.out).toContain("DRY RUN: nothing was deleted. --apply deletes exactly the 0 record(s) above.");
    expect(dry.out).toContain("  and the 4 history object(s) listed above.");
    // the four lines: ids in sorted order, an id's entries newest first; every one a real object of the store
    expect(dry.history).toHaveLength(4);
    for (const line of dry.history) expect(before).toContain(line);
    expect(dry.history.map((l) => l.split("/")[1])).toEqual([K, P, P, P].sort()); // sorted ids: "tomb-key" before "tomb-player"
    expect(dry.history.filter((l) => l.startsWith(`history/${P}/`)).map((l) => l.split("/")[2])).toEqual([
      nameOf({ finishedAt: FINISHED, id: "p-1" }), nameOf({ finishedAt: FINISHED - 1_000, id: "p-2" }), nameOf({ finishedAt: FINISHED - 2_000, id: "p-3" }),
    ]);
    expect(dry.out.join("\n")).not.toContain(X);
    expect(w.held(), "a dry run deletes nothing").toEqual(before);

    const applied = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(applied.code, applied.out.join("\n")).toBe(0);
    expect(applied.out[0]).toContain("(APPLY)");
    expect(applied.history, "exactly what the plan printed").toEqual(dry.history);
    expect(applied.out).toContain("APPLIED: deleted 0 of 0 record(s).");
    expect(applied.out).toContain("APPLIED: deleted 4 of 4 history object(s).");
    expect(w.held().sort()).toEqual(stays.sort()); // everybody else's stay, and the lookalike id's

    const again = await admin(w, ["purge-tombstoned"]);
    expect(again.code).toBe(0);
    expect(again.out).toContain("history: delete 0 object(s) under history/<id>/ of 0 of the 3 tombstoned id(s)");
    expect(again.history).toEqual([]);
    const second = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(second.code).toBe(0);
    expect(second.out).toContain("APPLIED: deleted 0 of 0 history object(s).");
    expect(w.held().sort()).toEqual(stays.sort());
  });

  it("a long history is listed across LIST pages (the fake pages every five keys) and removed whole", async () => {
    const w = world(kind);
    for (let i = 0; i < 23; i++) w.history(P, `p-${String(i).padStart(2, "0")}`, FINISHED - i * 1_000);
    w.history(X, "x-1");
    await w.tombstone(P, [P]);
    const dry = await admin(w, ["purge-tombstoned"]);
    expect(dry.out).toContain("history: delete 23 object(s) under history/<id>/ of 1 of the 1 tombstoned id(s)");
    expect(dry.history).toHaveLength(23);
    const applied = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(applied.code, applied.out.join("\n")).toBe(0);
    expect(applied.out).toContain("APPLIED: deleted 23 of 23 history object(s).");
    expect(w.held()).toHaveLength(1);
  });

  it("with no tombstone there is nothing to purge and nothing about history is said or touched, --apply or not", async () => {
    const w = world(kind);
    populate(w);
    const before = w.held();
    for (const args of [["purge-tombstoned"], ["purge-tombstoned", "--apply"]]) {
      const r = await admin(w, args);
      expect(r.code).toBe(0);
      expect(r.out).toContain("tombstones: 0 deleted player and key id(s)");
      expect(r.out).toContain("no player has deleted their online data: nothing to purge.");
      expect(r.out.filter((l) => l.toLowerCase().includes("history")), args.join(" ")).toEqual([]);
      expect(w.held()).toEqual(before);
    }
  });

  it("the ghosts and the history go in one run, and each has its own APPLIED line", async () => {
    const w = world(kind);
    populate(w);
    w.upload(R1, 1, "g1", P);
    w.upload(R1, 2, "g2", K);
    w.upload(R1, 1, "g3", X);
    await w.tombstone(P, [P, K]);
    const applied = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(applied.code, applied.out.join("\n")).toBe(0);
    expect(applied.out).toContain("plan: delete 2 record(s) in 1 rules version(s)");
    expect(applied.out).toContain("APPLIED: deleted 2 of 2 record(s).");
    expect(applied.out).toContain("APPLIED: deleted 4 of 4 history object(s).");
    expect(w.ghosts(), "X's ghost stays").toHaveLength(1);
    expect(w.ghosts()[0]).toContain("g3");
    expect(w.held()).toHaveLength(3);
  });

  it("--rules limits the ghosts and does not limit the history: history is not per rules version", async () => {
    const w = world(kind);
    populate(w);
    w.upload(R1, 1, "g1", P);
    await w.tombstone(P, [P, K]);
    const r = await admin(w, ["purge-tombstoned", "--rules", "bb-0.1.0", "--apply"]);
    expect(r.code, r.out.join("\n")).toBe(0);
    expect(r.out).toContain("APPLIED: deleted 0 of 0 record(s)."); // no ghost of that version
    expect(r.out).toContain("APPLIED: deleted 4 of 4 history object(s).");
    expect(w.ghosts()).toHaveLength(1);
    expect(w.held()).toHaveLength(3);
  });
});

describe("exit codes and a store without history", () => {
  it("1 when fewer history objects were deleted than planned, and 1 when listing them fails; the ghosts' own exit codes are as they were", async () => {
    const w = world("jsonl");
    populate(w);
    await w.tombstone(P, [P, K]);
    const real = new JsonlAdmin(w.argv[1]);
    const base = { kind: real.kind, where: real.where, read: (r: string) => real.read(r), remove: (x: Parameters<JsonlAdmin["remove"]>[0]) => real.remove(x), rulesVersions: () => real.rulesVersions(), tombstoned: () => real.tombstoned() };
    const partial = { ...base, history: (ids: ReadonlySet<string>) => real.history(ids), removeHistory: (held: Parameters<JsonlAdmin["removeHistory"]>[0]) => real.removeHistory(held.slice(1)) };
    const a = await admin(w, ["purge-tombstoned", "--apply"], () => partial as never);
    expect(a.code, a.out.join("\n")).toBe(1);
    expect(a.out).toContain("APPLIED: deleted 3 of 4 history object(s).");
    const broken = { ...base, history: async () => { throw new Error("disk exploded"); } };
    const b = await admin(w, ["purge-tombstoned"], () => broken as never);
    expect(b.code).toBe(1);
    expect(b.out.join("\n")).toContain("ghosts:admin failed: disk exploded");
    // a store that cannot list history (a test double, an older tool) prints no history line and exits as before
    const plain = { ...base };
    const c = await admin(w, ["purge-tombstoned"], () => plain as never);
    expect(c.code, c.out.join("\n")).toBe(0);
    expect(c.out.filter((l) => l.toLowerCase().includes("history"))).toEqual([]);
    const d = await admin(w, ["purge-tombstoned", "--apply"], () => plain as never);
    expect(d.code).toBe(0);
    expect(d.out.filter((l) => l.toLowerCase().includes("history"))).toEqual([]);
    expect(w.held().length, "7 planted, 3 removed by the partial run, and the plain store removed none of the rest").toBe(4);
  });
});

describe.each(KINDS)("end to end: a player deletes themselves through the server and the purge closes the cross-machine window (%s)", (kind) => {
  it("the DELETE removes the history; a late write from a machine that had not seen the tombstone is found and removed by the purge, under the player's id and a key's", async () => {
    const rig = await openHistoryRig(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await putEntry(rig, A, entryFor("a-1"))).status).toBe(201);
    expect((await putEntry(rig, B, entryFor("b-1", { finishedAt: FINISHED - 1_000 }))).status).toBe(201);
    expect(historyObjects(rig, A.playerId)).toHaveLength(2);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(historyObjects(rig, A.playerId)).toEqual([]);
    // the other machine's late writes (it still had the player's link and no tombstone)
    writeObject(rig, A.playerId, nameOf({ finishedAt: FINISHED, id: "late-a" }), encodeEntry(entryFor("late-a")));
    writeObject(rig, B.playerId, nameOf({ finishedAt: FINISHED, id: "late-b" }), encodeEntry(entryFor("late-b")));
    // and someone else's, which must stay
    writeObject(rig, "somebody-else", nameOf({ finishedAt: FINISHED, id: "theirs" }), encodeEntry(entryFor("theirs")));
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
    expect(dry.out).toContain("history: delete 2 object(s) under history/<id>/ of 2 of the 2 tombstoned id(s)");
    expect(dry.history.map((l) => l.split("/")[1]).sort()).toEqual([A.playerId, B.playerId].sort());
    expect(historyObjects(rig, A.playerId)).toHaveLength(1);
    const applied = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(applied.code, applied.out.join("\n")).toBe(0);
    expect(applied.out).toContain("APPLIED: deleted 2 of 2 history object(s).");
    expect(historyObjects(rig, A.playerId)).toEqual([]);
    expect(historyObjects(rig, B.playerId)).toEqual([]);
    expect(historyObjects(rig, "somebody-else")).toHaveLength(1);
    await rig.restart();
    expect(historyObjects(rig, A.playerId)).toEqual([]);
  });
});
