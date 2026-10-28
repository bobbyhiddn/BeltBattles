// S6D Goal 1 (REQ-BFG-119): `ghost-admin delete-player <id>` and `find-player <name>`. A player who lost every device writes to the operator with
// the code OPTIONS > MY PLAYER ID showed (or only a name, a hero and a date): find-player finds the ID, delete-player deletes the player the way
// DELETE /v1/player does - through the same code (Links.deletePlayer) - and then removes the player's uploads. Both stores: the JSON-lines
// directory, and Tigris on the in-process fake S3 (seven keys a LIST page, so every listing follows continuation tokens).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nameTag } from "../src/net/names";
import { playerCode } from "../src/net/playerCode";
import type { Identity } from "../src/net/identity";
import { COMMANDS, USAGE, parseArgs, runAdmin, type AdminStore } from "../server/ghostAdmin";
import { JsonlAdmin } from "../server/ghostAdmin";
import { FileHistoryStore, TigrisHistoryStore } from "../server/historyStore";
import type { FakeS3 } from "../tools/fakeS3";
import { s3For, startFake, FAKE_CREDS } from "./netStores";
import { testIdentity } from "./netIdentity";
import { closeRigs, deleteMe, linkVia, openRig, postGhost, putWire, requestCode, theFake, uploadFor, type Kind as RigKind, type Rig } from "./identRig";
import { freshWire } from "./profileupWire";
import { DAY, NOW, R1, R2, admin, bucketState, idOf, removeWorlds, statePath, walk, withoutReceiptTimes, world, type Kind, type World } from "./s6dWorld";

let fake: FakeS3;
let A: Identity, B: Identity, C: Identity;
beforeAll(async () => {
  fake = await startFake({ pageSize: 7 });
  [A, B, C] = await Promise.all([0, 1, 2].map((n) => testIdentity(n)));
});
afterAll(async () => {
  await fake.close();
  await closeRigs();
  removeWorlds();
});

const KINDS: Kind[] = ["jsonl", "tigris"];
const P = idOf("p"), K = idOf("k"), Q = idOf("q"), S = "76561198000000001", HASH = "a".repeat(64);

/** The standard world: player P with a linked key K, a Steam link, a live code, history and uploads in two rules versions; another player Q; a seed pool. */
async function populate(w: World): Promise<void> {
  await w.profile(P, NOW - 5 * DAY);
  await w.profile(Q, NOW - 5 * DAY);
  await w.keyLink(K, P, NOW - 30 * DAY);
  await w.playerRec(P, [K], NOW - 3 * DAY, { steam: [S], code: HASH });
  await w.steamLink(S, P, NOW - 20 * DAY);
  await w.links.put(`linkcodes/${HASH}.json`, JSON.stringify({ player: P, expiresAt: NOW + 60_000 }));
  await w.entry(P, NOW - 4 * DAY, "run-1");
  await w.entry(P, NOW - 6 * DAY, "run-2");
  await w.entry(K, NOW - 40 * DAY, "run-0"); // an entry stored under the key's own id, from before it linked
  w.upload(R1, 1, "g1", P, NOW - 2 * DAY, { name: "ANNA", hero: "ranger" });
  w.upload(R2, 1, "g2", P, NOW - 90 * DAY, { name: "ANNA", hero: "knight" });
  w.upload(R1, 2, "g3", K, NOW - 50 * DAY, { name: "ANNA", hero: "ranger" }); // uploaded by the key before it was linked
  w.upload(R1, 1, "g4", Q, NOW - 2 * DAY, { name: "BOB", hero: "ranger" });
  w.upload(R2, 3, "g5", Q, NOW - 10 * DAY, { name: "BOB", hero: "mage" });
  w.pool(R1, 1, "pool1");
  w.pool(R2, 1, "pool2");
}

describe("the command line", () => {
  it("delete-player, find-player, prune-ghosts, prune-idle and weekly are commands, in the usage, and need no --rules", () => {
    for (const c of ["delete-player", "find-player", "prune-ghosts", "prune-idle", "weekly"]) {
      expect(COMMANDS).toContain(c);
      expect(USAGE).toContain(c);
    }
    expect(parseArgs(["delete-player", P])).toMatchObject({ command: "delete-player", target: P, apply: false, rules: "" });
    expect(parseArgs(["delete-player", P, "--apply"])).toMatchObject({ command: "delete-player", target: P, apply: true });
    expect(parseArgs(["delete-player", "abcd-efgh-jkmn-pqrs"])).toMatchObject({ target: "abcd-efgh-jkmn-pqrs" });
    expect(parseArgs(["find-player", "anna"])).toMatchObject({ command: "find-player", name: "ANNA", apply: false });
    expect(parseArgs(["find-player", "anna", "b", "--tag", "4f"])).toMatchObject({ name: "ANNA B", tag: "4F" });
    expect(parseArgs(["prune-ghosts"])).toMatchObject({ command: "prune-ghosts", days: 180 });
    expect(parseArgs(["prune-idle", "--days", "400", "--apply"])).toMatchObject({ command: "prune-idle", days: 400, apply: true });
    expect(parseArgs(["weekly", "--apply"])).toMatchObject({ command: "weekly", apply: true });
    // a player id that starts with two dashes can still be given, after a bare --
    expect(parseArgs(["delete-player", "--", "--abcdefg"])).toMatchObject({ target: "--abcdefg" });
    expect(() => parseArgs(["delete-player", "--abcdefg"])).toThrow("unknown option");
  });

  it("refuses what it cannot run, as a usage error (nothing is read)", () => {
    expect(() => parseArgs(["delete-player"])).toThrow("needs a player ID");
    expect(() => parseArgs(["delete-player", "not an id!"])).toThrow("neither a player ID");
    expect(() => parseArgs(["delete-player", P, P])).toThrow("unexpected argument");
    expect(() => parseArgs(["delete-player", P, "--rules", R1])).toThrow("--rules does not go with delete-player");
    expect(() => parseArgs(["weekly", "--rules", R1])).toThrow("--rules does not go with weekly");
    expect(() => parseArgs(["find-player"])).toThrow("needs the name");
    expect(() => parseArgs(["find-player", "ANNA", "--apply"])).toThrow("never deletes");
    expect(() => parseArgs(["find-player", "ANNA", "--tag", "zz"])).toThrow("is not a tag");
    expect(() => parseArgs(["delete-player", P, "--tag", "4F"])).toThrow("--tag goes only with find-player");
    expect(() => parseArgs(["prune-ghosts", "--days", "0"])).toThrow("whole number of days");
    expect(() => parseArgs(["prune-ghosts", "--days", "abc"])).toThrow("whole number of days");
    expect(() => parseArgs(["weekly", "--days", "30"])).toThrow("--days goes only with prune-ghosts and prune-idle");
    expect(() => parseArgs(["list", "--rules", R1, "--days", "3"])).toThrow("--days goes only with");
    expect(() => parseArgs(["weekly", "extra"])).toThrow("unexpected argument");
    // the commands that were here before still want their rules version
    expect(() => parseArgs(["remove-player", P])).toThrow("--rules <bb-x.y.z> is required");
  });

  it("delete-player removes the player through Links.deletePlayer, the code DELETE /v1/player runs, and writes nothing itself", () => {
    const src = readFileSync(join(__dirname, "..", "server", "pruneAdmin.ts"), "utf8");
    expect(src).toContain("links.deletePlayer(");
    expect(src).toContain('from "./links"');
    expect(src).not.toMatch(/\.put\(/); // no record is written by this module: the tombstone and every removal are Links.deletePlayer's
    expect(readFileSync(join(__dirname, "..", "server", "links.ts"), "utf8")).toContain("tombstoneIds(player, signer, rec, prior)");
  });
});

describe.each(KINDS)("delete-player on %s", (kind) => {
  it("resolves a player ID, a linked key id and the code (any case, dashes or none); the dry run lists everything and deletes nothing", async () => {
    const w = world(kind, fake);
    await populate(w);
    const before = w.state();
    const asked: [string, RegExp][] = [
      [P, /resolved: player \S+ \(given as a player ID\)/],
      [K, /resolved: player \S+ \(given as a key id linked to player \S+\)/],
      [playerCode(P), /resolved: player \S+ \(given as the code [0-9A-Z-]+ of this player\)/],
      [playerCode(P).toLowerCase().replace(/-/g, " "), /given as the code/],
      [playerCode(K).replace(/-/g, ""), /given as the code [0-9A-Z-]+ of its key /],
    ];
    for (const [arg, how] of asked) {
      const r = await admin(w, ["delete-player", arg]);
      expect(r.code, r.text).toBe(0);
      expect(r.out[0]).toContain("ghosts:admin delete-player ");
      expect(r.out[0]).toContain("(every rules version)");
      expect(r.out[0]).toContain("(DRY RUN)");
      expect(r.text).toContain(`resolved: player ${P} `);
      expect(r.text).toMatch(how);
      // what --apply removes, item by item
      expect(r.text).toContain(`tombstone: tombstones/${P}.json is written first, naming 2 id(s): ${P} ${K}`);
      expect(r.planned.filter((l) => l.startsWith("profile "))).toEqual([`profile ${P}`]); // K never had a profile
      expect(r.planned.filter((l) => l.startsWith("key link "))).toEqual([`key link ${K}`]);
      expect(r.planned.filter((l) => l.startsWith("Steam link "))).toEqual([`Steam link ${S}`]);
      expect(r.planned).toContain("the live link code");
      expect(r.planned).toContain(`player record ${P}`);
      expect(r.planned.filter((l) => l.startsWith("history/"))).toHaveLength(3);
      const uploads = r.planned.filter((l) => l.includes("upload day"));
      expect(uploads).toHaveLength(3); // g1, g2 (another rules version) and g3 (the key's own, from before it linked)
      expect(uploads.every((l) => l.endsWith(`(upload of the deleted player ${P})`) || l.endsWith(`(upload of the deleted player ${K})`))).toBe(true);
      expect(uploads.some((l) => /ghost g[123] /.test(l))).toBe(true);
      expect(r.text).toContain("seed pool: never touched; 3 upload(s) in 2 rules version(s)");
      expect(r.text).toContain("DRY RUN: nothing was deleted. --apply writes the tombstone and deletes exactly the 11 record(s) above.");
      expect(r.text).not.toContain(Q); // nobody else is named
      expect(w.state()).toEqual(before); // and nothing was deleted
    }
  });

  it("--apply deletes the player as DELETE /v1/player does and then the uploads; the seed pool and every other player stay; a second --apply succeeds", async () => {
    const w = world(kind, fake);
    await populate(w);
    const before = w.state();
    const path = (key: string) => statePath(kind, key);
    const r = await admin(w, ["delete-player", playerCode(K), "--apply"]); // by the code of the linked key
    expect(r.code, r.text).toBe(0);
    expect(r.out[0]).toContain("(APPLY)");
    expect(r.text).toContain("APPLIED: the tombstone is written and the profile, links, player record and run history are deleted (as DELETE /v1/player does); deleted 3 of 3 upload(s).");
    expect(r.text).toContain("tombstone refresh (within 60 s)");
    expect(r.text).toContain("BB_GHOST_CACHE_TTL_S");
    const after = w.state();
    // the tombstone: first, naming the player and the key, written at the tool's clock
    expect(JSON.parse(after[path(`tombstones/${P}.json`)])).toEqual({ at: NOW, ids: [P, K] });
    // every record DELETE /v1/player removes is gone
    for (const gone of [`profiles/${P}.json`, `links/keys/${K}.json`, `links/steam/${S}.json`, `players/${P}.json`, `linkcodes/${HASH}.json`]) {
      expect(before[path(gone)], gone).toBeDefined();
      expect(after[path(gone)], gone).toBeUndefined();
    }
    expect(Object.keys(after).filter((k) => k.includes("history/"))).toEqual([]);
    expect(w.ids().filter((id) => /g[123]$/.test(id))).toEqual([]); // the uploads, in both rules versions
    // everything else stays
    expect(w.ids()).toEqual(["player bb-0.11.0 g5", "player bb-0.12.0 g4", "pool bb-0.11.0 pool2", "pool bb-0.12.0 pool1"]);
    expect(after[path(`profiles/${Q}.json`)]).toBe(before[path(`profiles/${Q}.json`)]);
    // a delete of a deleted player is a success that changes nothing more, whichever id names it
    for (const arg of [P, K, playerCode(P)]) {
      const again = await admin(w, ["delete-player", arg, "--apply"]);
      expect(again.code, again.text).toBe(0);
      expect(again.text).toContain("already deleted (its tombstone exists)");
      expect(again.text).toContain("deleted 0 of 0 upload(s).");
      expect(w.state()).toEqual(after);
    }
  });

  it("finishes what a DELETE /v1/player left: a player already tombstoned whose uploads are still stored", async () => {
    const w = world(kind, fake);
    await w.tombstone(P, [P, K], 7000); // what the server wrote; its profile and links are gone, the ghosts are not
    w.upload(R1, 1, "g1", P, NOW - 2 * DAY, { name: "ANNA", hero: "ranger" });
    w.upload(R2, 1, "g2", K, NOW - 2 * DAY, { name: "ANNA", hero: "ranger" });
    w.upload(R1, 1, "g4", Q, NOW - 2 * DAY, { name: "BOB", hero: "ranger" });
    await w.entry(K, NOW - 4 * DAY, "run-1"); // a history object the half-finished delete left under the key's id
    const dry = await admin(w, ["delete-player", K]);
    expect(dry.code, dry.text).toBe(0);
    expect(dry.text).toContain("this player is already deleted (its tombstone exists), so this finishes whatever is left");
    expect(dry.text).toContain(`tombstones/${P}.json exists (written 1970-01-01T00:00:07Z)`);
    expect(dry.planned.filter((l) => l.includes("upload day"))).toHaveLength(2);
    const applied = await admin(w, ["delete-player", K, "--apply"]);
    expect(applied.code, applied.text).toBe(0);
    expect(w.ids()).toEqual(["player bb-0.12.0 g4"]);
    expect(Object.keys(w.state()).filter((k) => k.includes("history/"))).toEqual([]);
    expect(JSON.parse(w.state()[statePath(kind, `tombstones/${P}.json`)])).toEqual({ at: 7000, ids: [P, K] }); // the tombstone is kept as it was
  });

  it("refuses with one line, deleting nothing, when the id matches no player or more than one", async () => {
    const w = world(kind, fake);
    await populate(w);
    const X = playerCode(Q); // a player whose ID is, character for character, another player's code: the id names X, the code names Q
    await w.profile(X, NOW - DAY);
    const before = w.state();
    for (const [arg, why] of [
      [idOf("nobody"), "matches no player this store holds"],
      [playerCode(idOf("nobody")), "matches no player this store holds"],
      [X, "matches 2 different players"],
    ] as const) {
      for (const flags of [[], ["--apply"]]) {
        const r = await admin(w, ["delete-player", arg, ...flags]);
        expect(r.code, r.text).toBe(1);
        expect(r.out.filter((l) => l.startsWith("refused:"))).toHaveLength(1);
        expect(r.text).toContain(why);
        expect(r.text).toContain("Nothing was deleted");
        expect(w.state()).toEqual(before);
      }
    }
    // the player ID of the other player is still fine
    expect((await admin(w, ["delete-player", Q])).code).toBe(0);
  });

  it("a key the player's record forgot (linked, but not listed) is tombstoned and cleaned too", async () => {
    const w = world(kind, fake);
    const F = idOf("forgotten");
    await w.profile(P, NOW - DAY);
    await w.playerRec(P, [], NOW - DAY); // no key listed...
    await w.keyLink(F, P, NOW - 10 * DAY); // ...but F's own link names P
    await w.profile(F, NOW - 3 * DAY);
    w.upload(R1, 1, "gf", F, NOW - 3 * DAY, { name: "ANNA", hero: "ranger" });
    const dry = await admin(w, ["delete-player", P]);
    expect(dry.code, dry.text).toBe(0);
    expect(dry.text).toContain(`naming 2 id(s): ${P} ${F}`);
    const r = await admin(w, ["delete-player", P, "--apply"]);
    expect(r.code, r.text).toBe(0);
    const s = w.state();
    expect(JSON.parse(s[statePath(kind, `tombstones/${P}.json`)])).toEqual({ at: NOW, ids: [P, F] });
    expect(s[statePath(kind, `links/keys/${F}.json`)]).toBeUndefined();
    expect(s[`profiles/${F}.json`]).toBeUndefined();
    expect(w.ids()).toEqual([]);
  });

  it("a storage error is exit 1 and an apply that deleted less than its plan is exit 1; a store without identity records says so", async () => {
    const w = world(kind, fake);
    await populate(w);
    const real = kind === "jsonl" ? new JsonlAdmin(w.argv[1]) : null;
    const noIdentity: AdminStore = { kind: "jsonl", where: "double", read: async () => ({ records: [], other: [] }), remove: async () => 0, rulesVersions: async () => [] };
    const r = await admin(w, ["delete-player", P], NOW, (() => noIdentity) as never);
    expect(r.code).toBe(1);
    expect(r.text).toContain("ghosts:admin failed: this store cannot read the identity records");
    if (real) {
      const dead: AdminStore = { kind: real.kind, where: real.where, read: async () => { throw new Error("disk exploded"); }, remove: (x) => real.remove(x), rulesVersions: () => real.rulesVersions(), tombstoned: () => real.tombstoned(), identity: () => real.identity() };
      const a = await admin(w, ["delete-player", P], NOW, (() => dead) as never);
      expect(a.code).toBe(1);
      expect(a.text).toContain("ghosts:admin failed: disk exploded");
      const partial: AdminStore = { kind: real.kind, where: real.where, read: (rules) => real.read(rules), remove: (x) => real.remove(x.slice(0, 1)), rulesVersions: () => real.rulesVersions(), tombstoned: () => real.tombstoned(), identity: () => real.identity() };
      const b = await admin(w, ["delete-player", P, "--apply"], NOW, (() => partial) as never);
      expect(b.code).toBe(1);
      expect(b.text).toContain("deleted 1 of 3 upload(s).");
      expect(b.text).toContain("2 planned upload(s) had already changed or gone");
      // the delete itself was made (a retry finishes the uploads)
      const retry = await admin(w, ["delete-player", P, "--apply"]);
      expect(retry.code, retry.text).toBe(0);
      expect(w.ids()).toEqual(["player bb-0.11.0 g5", "player bb-0.12.0 g4", "pool bb-0.11.0 pool2", "pool bb-0.12.0 pool1"]);
    }
  });

  it("a data directory that does not exist is a settings error (exit 2) before anything is read", async () => {
    if (kind !== "jsonl") return;
    const out: string[] = [];
    const code = await runAdmin(["delete-player", P, "--data", join(__dirname, "no-such-dir-s6d")], { BB_GHOST_STORE: "jsonl" }, (l) => out.push(l));
    expect(code).toBe(2);
    expect(out.join("\n")).toContain("no ghost data directory");
  });
});

// ---------------------------------------------------------------------------------------------------------------- the same as a real DELETE

describe.each(KINDS)("delete-player --apply leaves what a real DELETE /v1/player leaves, on %s", (kind) => {
  const rigOpts = { rateLimit: { windowMs: 60_000, max: 1_000_000 } };

  /** A server that has seen A upload and put a profile, B upload and link to A and upload under A, C upload; A holds a live code and history. */
  async function build(): Promise<Rig> {
    const rig = await openRig(kind as RigKind, rigOpts);
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-1" }))).status).toBe(201);
    expect((await postGhost(rig, B, uploadFor(B, B.playerId, { runId: "b-1" }))).status).toBe(201); // before B is linked
    expect((await putWire(rig, freshWire(), A)).status).toBeLessThan(300);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "b-2" }))).status).toBe(201); // and after
    expect((await postGhost(rig, C, uploadFor(C, C.playerId, { runId: "c-1" }))).status).toBe(201);
    expect((await requestCode(rig, A)).status).toBe(200); // a live code is left
    const history = kind === "jsonl" ? new FileHistoryStore(join(rig.dir, "history")) : new TigrisHistoryStore(s3For(theFake(), rig.bucket));
    await history.put(A.playerId, { finishedAt: rig.clock.now - 1000, id: "run-a" }, "{}");
    await history.put(B.playerId, { finishedAt: rig.clock.now - 2000, id: "run-b" }, "{}");
    return rig;
  }
  const worldOf = (rig: Rig): Pick<World, "argv" | "env"> => kind === "jsonl"
    ? { argv: ["--data", rig.dir], env: { BB_GHOST_STORE: "jsonl" } }
    : {
      argv: [],
      env: {
        BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
        AWS_ENDPOINT_URL_S3: theFake().endpoint, BUCKET_NAME: rig.bucket, BB_GHOST_S3_ADDRESSING: "path",
      },
    };
  const stateOf = (rig: Rig) => withoutReceiptTimes(kind === "jsonl" ? walk(rig.dir) : bucketState(theFake(), rig.bucket));

  it("by the player ID, by a linked key id, and by the code of either: the same files and objects as DELETE /v1/player and purge-tombstoned", async () => {
    // the reference: the player deletes themselves, then the operator's purge removes their ghosts
    const ref = await build();
    expect((await deleteMe(ref, A)).status).toBe(200);
    const purge = await admin(worldOf(ref), ["purge-tombstoned", "--apply"], ref.clock.now);
    expect(purge.code, purge.text).toBe(0);
    const want = stateOf(ref);
    expect(Object.keys(want).filter((k) => k.includes("history/"))).toEqual([]); // the real delete removed the history
    expect(Object.keys(want).some((k) => k.includes(`tombstones/${A.playerId}.json`))).toBe(true);

    for (const arg of [A.playerId, B.playerId, playerCode(A.playerId), playerCode(B.playerId).toLowerCase()]) {
      const rig = await build();
      const start = stateOf(rig);
      const dry = await admin(worldOf(rig), ["delete-player", arg], rig.clock.now);
      expect(dry.code, dry.text).toBe(0);
      expect(stateOf(rig), `dry run by ${arg}`).toEqual(start); // the dry run changed nothing
      const r = await admin(worldOf(rig), ["delete-player", arg, "--apply"], rig.clock.now);
      expect(r.code, r.text).toBe(0);
      expect(r.text).toContain("deleted 3 of 3 upload(s).");
      expect(stateOf(rig), `--apply by ${arg}`).toEqual(want);
      // C and the seed pool are what the reference left too
      expect(Object.keys(stateOf(rig)).filter((k) => /c-1|player\//.test(k) || k === "ghosts.jsonl").length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------- find-player

describe.each(KINDS)("find-player on %s", (kind) => {
  const idsFor = (n: number) => idOf(`find-${n}`);
  const T = idsFor(9);

  async function plant(w: World): Promise<void> {
    w.upload(R1, 1, "f1", P, NOW - 2 * DAY, { name: "ANNA", hero: "ranger" });
    w.upload(R1, 2, "f2", P, NOW - 9 * DAY, { name: "ANNA", hero: "knight" });
    w.upload(R2, 1, "f3", P, NOW - 40 * DAY, { name: "ANNA", hero: "ranger" });
    w.upload(R1, 1, "f4", Q, NOW - 5 * DAY, { name: "ANNA", hero: "mage" }); // another player with the same name
    w.upload(R1, 3, "f5", K, NOW - 70 * DAY, { name: "ANNA", hero: "ranger" }); // a key that was linked to P later
    w.upload(R1, 1, "f6", idsFor(1), NOW - DAY, { name: "BOB", hero: "ranger" });
    w.upload(R1, 1, "f7", T, NOW - 20 * DAY, { name: "ANNA", hero: "ranger" }); // a deleted player's upload, not purged yet
    w.upload(R2, 5, "f8", idsFor(2), NOW - 20 * DAY, undefined as never); // an old upload with no name
    await w.keyLink(K, P, NOW - 60 * DAY);
    await w.tombstone(T, [T]);
    w.pool(R1, 1, "pool1");
  }
  type Row = { id: string; tag: string; code: string; uploads: number; newest: string; heroes: string; rules: string; tombstoned: string; linked?: string };
  const rows = (lines: string[]): Row[] => lines.filter((l) => l.startsWith("  player ")).map((l) => {
    const m = /^ {2}player (\S+) {2}tag (\S+) {2}code (\S+) {2}uploads (\d+) {2}newest (\S+) {2}heroes (\S+) {2}rules (\S+) {2}tombstoned (yes|no)(?: {2}linked to player (\S+))?$/.exec(l);
    if (!m) throw new Error(`not a find-player row: ${l}`);
    return { id: m[1], tag: m[2], code: m[3], uploads: Number(m[4]), newest: m[5], heroes: m[6], rules: m[7], tombstoned: m[8], linked: m[9] };
  });

  it("lists every player ID whose uploads carry the name (any case): tag, code, uploads, newest receipt time in UTC, heroes, rules, tombstoned", async () => {
    const w = world(kind, fake);
    await plant(w);
    const before = w.state();
    const r = await admin(w, ["find-player", "anna"]);
    expect(r.code, r.text).toBe(0);
    expect(r.out[0]).toContain("ghosts:admin find-player ANNA ");
    expect(r.out[0]).toContain("(read only)");
    expect(r.out[1]).toBe('find-player "ANNA": 4 player ID(s) have a stored upload with that name');
    const got = rows(r.out);
    expect(got.map((x) => x.id).sort()).toEqual([K, P, Q, T].sort());
    const p = got.find((x) => x.id === P)!;
    expect(p).toMatchObject({ tag: nameTag(P), code: playerCode(P), uploads: 3, newest: "2026-10-26T12:00:00Z", heroes: "knight,ranger", rules: `${R2},${R1}`.split(",").sort().join(","), tombstoned: "no" });
    expect(got.find((x) => x.id === Q)).toMatchObject({ uploads: 1, heroes: "mage", rules: R1, newest: "2026-10-23T12:00:00Z", tombstoned: "no" });
    expect(got.find((x) => x.id === K)).toMatchObject({ uploads: 1, linked: P, tombstoned: "no" });
    expect(got.find((x) => x.id === T)).toMatchObject({ tombstoned: "yes", newest: "2026-10-08T12:00:00Z" });
    expect(got.map((x) => x.newest)).toEqual([...got.map((x) => x.newest)].sort().reverse()); // newest first
    expect(w.state()).toEqual(before); // read only
    const bob = await admin(w, ["find-player", "Bob"]);
    expect(rows(bob.out).map((x) => x.id)).toEqual([idsFor(1)]);
    const nobody = await admin(w, ["find-player", "CAROL"]);
    expect(nobody.code).toBe(0);
    expect(nobody.text).toContain("0 player ID(s) have a stored upload with that name");
    expect(nobody.text).toContain("no stored upload carries that name");
  });

  it("--tag keeps the players whose tag is that tag; the tag is NAME#TAG as the dusk intro shows it", async () => {
    const w = world(kind, fake);
    await plant(w);
    const all = rows((await admin(w, ["find-player", "ANNA"])).out);
    const tag = nameTag(P);
    const r = await admin(w, ["find-player", "ANNA", "--tag", tag.toLowerCase()]);
    expect(r.code, r.text).toBe(0);
    expect(rows(r.out).map((x) => x.id).sort()).toEqual(all.filter((x) => x.tag === tag).map((x) => x.id).sort());
    expect(rows(r.out).map((x) => x.id)).toContain(P);
    expect(r.out[1]).toContain(`--tag ${tag}`);
    const other = all.map((x) => x.tag).includes("00") ? "01" : "00";
    const none = await admin(w, ["find-player", "ANNA", "--tag", other === tag ? "02" : other]);
    expect(rows(none.out).every((x) => x.tag !== tag)).toBe(true);
    if (rows(none.out).length === 0) expect(none.text).toContain("no stored upload with that name carries that tag");
  });

  it("its code is the one delete-player takes", async () => {
    const w = world(kind, fake);
    await plant(w);
    const q = rows((await admin(w, ["find-player", "ANNA"])).out).find((x) => x.id === Q)!;
    const r = await admin(w, ["delete-player", q.code]);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain(`resolved: player ${Q} `);
  });

  it("is read only: --apply is refused (exit 2)", async () => {
    const w = world(kind, fake);
    await plant(w);
    const r = await admin(w, ["find-player", "ANNA", "--apply"]);
    expect(r.code).toBe(2);
    expect(r.text).toContain("find-player never deletes");
  });
});
