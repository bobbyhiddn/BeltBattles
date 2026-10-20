// VERIFY-IDENT1 (REQ-BFG-122) step 4d, written by the independent checker (cap_zeta): DELETION AND TOMBSTONES. DELETE /v1/player from any key
// of a player: the profile, the links and the live code go, the tombstone names the player and every linked key, no ghost of theirs is
// served (at once, after a restart, and from a second server over the same storage once its tombstone cache turns), their uploads and
// profile PUTs are 410, a repeated DELETE finishes a cut-off cleanup, and `ghost-admin purge-tombstoned` removes exactly the tombstoned
// players' ghosts in every rules version and in both stores. Both backing stores (JSON lines and the Tigris fake).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import * as nodeFs from "node:fs";
import { join } from "node:path";
import type { Identity } from "../src/net/identity";
import { runAdmin } from "../server/ghostAdmin";
import { objectKey } from "../server/tigrisStore";
import { testIdentity } from "./netIdentity";
import { earnedWire } from "./profileupWire";
import { FAKE_CREDS } from "./netStores";
import {
  closeRigs, deleteMe, fakeKeys, freshIdentity, identityRecords, linkVia, matchAs, openRig, openSibling, postGhost, profileStored, putWire, readProfile,
  redeemCode, requestCode, theFake, uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity, B: Identity, C: Identity, D: Identity;
beforeAll(async () => {
  [A, B, C, D] = await Promise.all([0, 1, 2, 3].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const NOLIMIT = { windowMs: 600_000, max: 1_000_000 };
// tsconfig.tests.json carries a small shim for node:fs and process (the ratchet counts type errors), so the two calls it lacks go through any
const chmodSync = (nodeFs as unknown as { chmodSync(path: string, mode: number): void }).chmodSync;
const isRoot = (process as unknown as { getuid?: () => number }).getuid?.() === 0;
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT, ...over });
const codeOf = (r: Reply): string => String(r.json?.code);
const j = (r: Reply): Record<string, unknown> => r.json ?? {};
const ownerOf = (r: Reply): string => String((j(r).snapshot as { playerId: string }).playerId);

/** Who the match hands out over many askers (unrelated, fresh keys): the set of playerIds in the snapshots served, and how many 404s. */
async function servedTo(rig: Rig, askers = 40): Promise<{ owners: string[]; none: number }> {
  const owners = new Set<string>();
  let none = 0;
  for (let i = 0; i < askers; i++) {
    const r = await matchAs(rig, `stranger-${i}-${"abcdef".repeat(3)}`);
    if (r.status === 200) owners.add(ownerOf(r));
    else if (r.status === 404) none++;
    else throw new Error(`match answered ${r.status} ${r.text}`);
  }
  return { owners: [...owners].sort(), none };
}

/** A world: A has a profile, a ghost, two linked devices B and C (each with a ghost under its own id and one under A), and a live code;
 *  D is a bystander with a profile and a ghost. */
async function world(kind: Kind, over: Opts = {}) {
  const rig = await open(kind, over);
  expect((await putWire(rig, earnedWire({ runs: 5, bestDay: 7 }), A)).status).toBe(200);
  expect((await putWire(rig, earnedWire({ runs: 3, bestDay: 2 }), D)).status).toBe(200);
  expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a1" }))).status).toBe(201);
  expect((await postGhost(rig, D, uploadFor(D, D.playerId, { runId: "d1" }))).status).toBe(201);
  for (const k of [B, C]) {
    expect((await postGhost(rig, k, uploadFor(k, k.playerId, { runId: `own-${k === B ? "b" : "c"}` }))).status).toBe(201); // before it links
    expect((await linkVia(rig, A, k)).joined.status).toBe(200);
    expect((await postGhost(rig, k, uploadFor(k, A.playerId, { runId: `pl-${k === B ? "b" : "c"}` }))).status).toBe(201); // after, under the player
  }
  expect((await requestCode(rig, A)).status).toBe(200); // a live code, not used
  return rig;
}
const ALL_THREE = () => [A.playerId, B.playerId, C.playerId].sort();

/** Every assertion of "deleted": records gone, tombstone right, nothing served, everything 410. */
async function expectDeleted(rig: Rig, why: string): Promise<void> {
  const rec = await identityRecords(rig);
  expect(Object.keys(rec).filter((k) => !k.startsWith("tombstones/")), `${why}: only tombstones remain in the identity store`).toEqual([]);
  expect(Object.keys(rec).filter((k) => k.startsWith("tombstones/")), why).toEqual([`tombstones/${A.playerId}.json`]);
  const tomb = JSON.parse(rec[`tombstones/${A.playerId}.json`]) as { at: number; ids: string[] };
  expect(tomb.ids.slice().sort(), `${why}: the tombstone names the player and every linked key`).toEqual(ALL_THREE());
  expect(Object.keys(tomb).sort(), "and nothing else about them").toEqual(["at", "ids"]);
  for (const id of ALL_THREE()) expect(profileStored(rig, id), `${why}: profile of ${id.slice(0, 6)}`).toBe(false);
  expect(profileStored(rig, D.playerId), "a bystander's profile stays").toBe(true);
  const served = await servedTo(rig);
  expect(served.owners, `${why}: only the bystander's ghost is served`).toEqual([D.playerId]);
  for (const k of [A, B, C]) {
    for (const under of [A.playerId, k.playerId]) {
      const r = await postGhost(rig, k, uploadFor(k, under, { runId: `after-${why.length}` }));
      expect(r.status, `${why}: upload by ${k === A ? "A" : k === B ? "B" : "C"} under ${under === A.playerId ? "A" : "its own id"}: ${r.text}`).toBe(410);
    }
    expect((await putWire(rig, earnedWire({ runs: 99 }), k)).status, `${why}: profile PUT`).toBe(410);
    expect((await readProfile(rig, k)).status, `${why}: profile read`).toBe(410);
    expect((await requestCode(rig, k)).status, `${why}: link code`).toBe(410);
  }
  const stranger = await freshIdentity();
  expect((await postGhost(rig, stranger, uploadFor(stranger, A.playerId, { runId: "s1" }))).status, `${why}: a stranger under the deleted player's id is 410, not 403`).toBe(410);
  expect((await postGhost(rig, D, uploadFor(D, D.playerId, { runId: `d2-${++bystanderRuns}` }))).status, "the bystander still uploads").toBe(201);
}
let bystanderRuns = 0;

describe.each(KINDS)("DELETE /v1/player on %s", (kind) => {
  it("from the player's FIRST key: profile, links and live code gone; the tombstone names the player and both devices; nothing of theirs is served, at once and after a restart; their uploads and PUTs are 410", async () => {
    const rig = await world(kind);
    const before = await servedTo(rig);
    expect(before.owners, "the control: before the delete all four players' ghosts are served").toEqual([A.playerId, B.playerId, C.playerId, D.playerId].sort());
    const r = await deleteMe(rig, A);
    expect(r.status, r.text).toBe(200);
    expect(r.json).toEqual({ deleted: true });
    await expectDeleted(rig, "at once");
    await rig.restart();
    await expectDeleted(rig, "after a restart");
    await rig.restart();
    expect((await deleteMe(rig, B)).status, "a repeat after yet another restart, by a device whose link is gone").toBe(200);
    expect((await deleteMe(rig, A)).status, "and by the first key").toBe(200);
    const rec = await identityRecords(rig);
    expect(Object.keys(rec).filter((k) => !k.startsWith("tombstones/")), "no other record came back").toEqual([]);
    expect((JSON.parse(rec[`tombstones/${A.playerId}.json`]) as { ids: string[] }).ids.slice().sort(), "A's tombstone is unchanged").toEqual(ALL_THREE());
    // a repeat by a device whose link is gone resolves to itself and writes a stray tombstone of its own id (IDENT1-REPORT 8.14: harmless)
    const strays = Object.keys(rec).filter((k) => k.startsWith("tombstones/") && k !== `tombstones/${A.playerId}.json`);
    expect(strays.every((k) => k === `tombstones/${B.playerId}.json`), strays.join(",")).toBe(true);
    expect((await servedTo(rig)).owners).toEqual([D.playerId]);
  });

  it("from a LINKED key: the same, the whole player goes", async () => {
    const rig = await world(kind);
    const r = await deleteMe(rig, C);
    expect(r.status, r.text).toBe(200);
    await expectDeleted(rig, "deleted from a device");
    await rig.restart();
    await expectDeleted(rig, "deleted from a device, after a restart");
  });

  it("a code issued before the delete is dead after it, and the deleted keys cannot redeem anything: 410", async () => {
    const rig = await world(kind);
    const live = codeOf(await requestCode(rig, B));
    expect((await deleteMe(rig, A)).status).toBe(200);
    const F = await freshIdentity();
    const r = await redeemCode(rig, F, live);
    expect(r.status, r.text).toBe(403);
    expect(r.json).toEqual({ error: "that code did not work" });
    const D2 = codeOf(await requestCode(rig, D));
    const gone = await redeemCode(rig, B, D2);
    expect(gone.status, gone.text).toBe(410);
    expect((await redeemCode(rig, F, D2)).status, "and D's code still works for a living key").toBe(200);
  });

  it("DELETE and the profile read work while uploads are closed (a player can always take their data out); link code does not", async () => {
    const rig = await world(kind);
    await rig.restart({ rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT, uploads: "closed" });
    expect((await readProfile(rig, A)).status, "the profile read").toBe(200);
    expect((await requestCode(rig, A)).status, "a link code").toBe(403);
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "closed-1" }))).status, "an upload").toBe(403);
    expect((await deleteMe(rig, A)).status, "the delete").toBe(200);
    expect(rig.app.links.isGone(A.playerId) && rig.app.links.isGone(B.playerId) && rig.app.links.isGone(C.playerId)).toBe(true);
  });

  it("a second server over the same storage serves the deleted player's ghost until its tombstone cache turns (60 s), then never: the lag is bounded", async () => {
    const rig = await world(kind);
    const sibling = await openSibling(rig);
    expect((await servedTo(sibling, 30)).owners).toContain(A.playerId); // the sibling has loaded its (empty) tombstone set
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect((await servedTo(rig, 30)).owners, "the server that took the delete serves none at once").toEqual([D.playerId]);
    rig.clock.now += 59_000;
    const lag = await servedTo(sibling, 30);
    rig.clock.now += 2_000; // 61 s after the sibling loaded its set
    const after = await servedTo(sibling, 30);
    expect(after.owners, "after the cache turns, the sibling serves none").toEqual([D.playerId]);
    expect(lag.owners.length).toBeGreaterThan(0); // (the 59 s answer is whatever it is; this only shows the check reads)
    expect((await postGhost(sibling, A, uploadFor(A, A.playerId, { runId: "late" }))).status, "and refuses the deleted keys' uploads").toBe(410);
  });
});

describe("a cleanup cut off midway is finished by a repeated DELETE", () => {
  it("tigris: every S3 DELETE fails -> 503 with the tombstone already written and the ghosts already unserved; the repeat is 200 and leaves only the tombstone", async () => {
    const rig = await world("tigris");
    theFake().failNext(200, 503, "DELETE");
    const cut = await deleteMe(rig, B);
    expect(cut.status, cut.text).toBe(503);
    theFake().clearFaults();
    const mid = await identityRecords(rig);
    expect(Object.keys(mid)).toContain(`tombstones/${A.playerId}.json`); // the tombstone goes first
    expect((await servedTo(rig, 20)).owners, "already unserved while the cleanup is half done").toEqual([D.playerId]);
    expect(rig.app.links.isGone(A.playerId) && rig.app.links.isGone(B.playerId) && rig.app.links.isGone(C.playerId)).toBe(true);
    expect(Object.keys(mid).filter((k) => !k.startsWith("tombstones/")).length, "the cleanup really was cut: records are left").toBeGreaterThan(0);
    const again = await deleteMe(rig, B);
    expect(again.status, again.text).toBe(200);
    await expectDeleted(rig, "after the repeat");
  });

  it.skipIf(isRoot)("jsonl: the links directory cannot be written (the profiles are gone, the links are not) -> 503; the repeat from the same key is 200 and finishes it", async () => {
    const rig = await world("jsonl");
    const dir = join(rig.dir, "identity", "links", "keys");
    chmodSync(dir, 0o500);
    let cut: Reply;
    try {
      cut = await deleteMe(rig, B);
      expect(cut.status, cut.text).toBe(503);
      expect(profileStored(rig, A.playerId), "the cut is midway: A's profile record is already gone").toBe(false);
      expect(readdirSync(dir).length, "and the link records are still there").toBeGreaterThan(0);
      expect((await servedTo(rig, 20)).owners).toEqual([D.playerId]);
    } finally {
      chmodSync(dir, 0o700);
    }
    const again = await deleteMe(rig, B);
    expect(again.status, again.text).toBe(200);
    await expectDeleted(rig, "after the repeat");
  });

  it.each(KINDS)("%s: remnants of a deleted player (a link record, a profile, the player record, a code) put back as if their delete had failed are removed by the next DELETE from the first key", async (kind) => {
    const rig = await world(kind);
    expect((await deleteMe(rig, A)).status).toBe(200);
    const links = rig.app.links;
    await links.store.put(`links/keys/${B.playerId}.json`, JSON.stringify({ player: A.playerId, at: 1 }));
    await links.store.put(`links/keys/${C.playerId}.json`, JSON.stringify({ player: A.playerId, at: 1 }));
    await links.store.put(`players/${A.playerId}.json`, JSON.stringify({ keys: [B.playerId, C.playerId], steam: [], at: 1 }));
    await rig.app.links.profiles.put(B.playerId, { profile: earnedWire({ runs: 1 }), receivedAt: 1 });
    expect(profileStored(rig, B.playerId)).toBe(true);
    expect((await deleteMe(rig, A)).status).toBe(200);
    await expectDeleted(rig, "after remnants");
  });
});

describe("a failed first load of the tombstones never serves a deleted player's ghost", () => {
  it("tigris: after a restart whose first LIST fails, a match is a 503, not a ghost; once the store answers it is the right answer", async () => {
    const rig = await world("tigris");
    expect((await deleteMe(rig, A)).status).toBe(200);
    await rig.restart();
    theFake().failNext(100, 503, "LIST");
    const down = await matchAs(rig, "stranger-x-abcdefabcdefabcdef");
    expect(down.status, down.text).toBe(503);
    const up = await postGhost(rig, D, uploadFor(D, D.playerId, { runId: "d3" }));
    expect(up.status, "an upload is not taken either while the tombstones are unknown").toBe(503);
    theFake().clearFaults();
    expect((await servedTo(rig, 20)).owners).toEqual([D.playerId]);
  });
});

// ------------------------------------------------------------------------------------------------------ ghost-admin purge-tombstoned
const R_OLD = "bb-0.11.0", R_OLDER = "bb-0.9.0";
const rawRecord = (id: string, rules: string, day: number, playerId: string): string => JSON.stringify({ id, at: 5, snapshot: { rules, day, playerId } });

/** Every byte of the ghost store (and the whole data dir for JSON lines), keyed by name. */
function storeBytes(rig: Rig): Record<string, string> {
  const out: Record<string, string> = {};
  if (rig.kind === "tigris") {
    for (const k of fakeKeys(rig, "")) out[k] = theFake().getObject(rig.bucket, k) ?? "";
    return out;
  }
  const walk = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else out[p.slice(rig.dir.length)] = readFileSync(p, "utf8");
    }
  };
  walk(rig.dir);
  return out;
}

/** The ghost records as (kind, rules, id, playerId) lines, sorted: what the purge may and may not touch. */
function ghostLines(rig: Rig): string[] {
  const rows: string[] = [];
  const row = (kind: string, text: string) => {
    const o = JSON.parse(text) as { id?: string; snapshot?: { rules: string; playerId: string; runId?: string }; rules?: string; playerId?: string };
    const s = (o.snapshot ?? o) as { rules: string; playerId: string; runId?: string };
    rows.push(`${kind} ${s.rules} ${o.id ?? s.runId ?? "?"} ${s.playerId}`);
  };
  if (rig.kind === "tigris") {
    for (const k of fakeKeys(rig, "ghosts/")) row(k.includes("/pool/") ? "pool" : "player", theFake().getObject(rig.bucket, k) ?? "{}");
  } else {
    for (const [file, kind] of [["ghosts.jsonl", "player"], ["pool.jsonl", "pool"]] as const) {
      const f = join(rig.dir, file);
      if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) if (line.trim()) row(kind, line);
    }
  }
  return rows.sort();
}

function plantRaw(rig: Rig, kind: "player" | "pool", rules: string, day: number, id: string, playerId: string): void {
  if (rig.kind === "tigris") {
    theFake().putObject(rig.bucket, objectKey(kind, rules, day, id), rawRecord(id, rules, day, playerId));
  } else {
    mkdirSync(rig.dir, { recursive: true });
    appendFileSync(join(rig.dir, kind === "pool" ? "pool.jsonl" : "ghosts.jsonl"), rawRecord(id, rules, day, playerId) + "\n");
  }
}

function adminArgs(rig: Rig): { argv: string[]; env: Record<string, string> } {
  return rig.kind === "tigris"
    ? {
        argv: [],
        env: {
          BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
          AWS_ENDPOINT_URL_S3: theFake().endpoint, BUCKET_NAME: rig.bucket, BB_GHOST_S3_ADDRESSING: "path",
        },
      }
    : { argv: ["--data", rig.dir], env: { BB_GHOST_STORE: "jsonl" } };
}

async function admin(rig: Rig, args: string[]): Promise<{ code: number; out: string[] }> {
  const a = adminArgs(rig);
  const out: string[] = [];
  const code = await runAdmin([...args, ...a.argv], a.env, (l) => out.push(l));
  return { code, out };
}

describe.each(KINDS)("ghost-admin purge-tombstoned on %s", (kind) => {
  it("a dry run changes not one byte; --apply removes exactly the tombstoned players' ghosts (the player's and every linked key's) in every rules version, and nobody else's, the seed pool included; a second --apply finds nothing", async () => {
    const rig = await world(kind);
    // a living player E with a linked device F (F is NOT deleted): their ghosts, under both ids, must survive
    const E = await freshIdentity(), F = await freshIdentity();
    expect((await postGhost(rig, E, uploadFor(E, E.playerId, { runId: "e1" }))).status).toBe(201);
    expect((await linkVia(rig, E, F)).joined.status).toBe(200);
    expect((await postGhost(rig, F, uploadFor(F, F.playerId, { runId: "f1" }))).status).toBe(201);
    // old rules versions, planted straight into storage: the deleted player's, a device's, and bystanders' (one with a look-alike id)
    plantRaw(rig, "player", R_OLD, 1, "old-a", A.playerId);
    plantRaw(rig, "player", R_OLD, 2, "old-b", B.playerId);
    plantRaw(rig, "player", R_OLD, 2, "old-d", D.playerId);
    plantRaw(rig, "player", R_OLDER, 5, "older-c", C.playerId);
    plantRaw(rig, "player", R_OLDER, 5, "older-e", E.playerId);
    plantRaw(rig, "player", R_OLDER, 6, "older-lookalike", A.playerId.slice(0, 20));
    plantRaw(rig, "player", R_OLDER, 6, "older-lookalike2", A.playerId + "x");
    plantRaw(rig, "pool", R_OLD, 1, "pool-old", "pool-player");
    expect((await deleteMe(rig, A)).status).toBe(200); // the whole player A goes (B and C with it); E and F are alive
    const all = ghostLines(rig);
    const mine = new Set(ALL_THREE());
    const expectGone = all.filter((l) => l.startsWith("player ") && mine.has(l.split(" ")[3]));
    // 5 real uploads (A's, B's own and under A, C's own and under A) and 3 planted (A's, B's, C's in the older versions)
    expect(expectGone.length, "a ghost under A, B and C in every version").toBe(8);
    expect(new Set(expectGone.map((l) => l.split(" ")[1])).size, "in at least three rules versions").toBeGreaterThanOrEqual(3);

    const before = storeBytes(rig);
    const dry = await admin(rig, ["purge-tombstoned"]);
    expect(dry.code, dry.out.join("\n")).toBe(0);
    expect(dry.out.some((l) => l.includes("DRY RUN"))).toBe(true);
    expect(storeBytes(rig), "a dry run changes nothing").toEqual(before);
    expect(ghostLines(rig)).toEqual(all);
    const planned = dry.out.filter((l) => l.startsWith("  delete ")).length;
    expect(planned, dry.out.join("\n")).toBe(expectGone.length);

    const onlyOne = await admin(rig, ["purge-tombstoned", "--apply", "--rules", R_OLDER]);
    expect(onlyOne.code, onlyOne.out.join("\n")).toBe(0);
    const afterOne = ghostLines(rig);
    expect(afterOne.filter((l) => l.split(" ")[1] === R_OLDER && mine.has(l.split(" ")[3])), "--rules limits the purge to one version").toEqual([]);
    expect(afterOne.filter((l) => l.split(" ")[1] !== R_OLDER && mine.has(l.split(" ")[3])).length).toBeGreaterThan(0);

    const applied = await admin(rig, ["purge-tombstoned", "--apply"]);
    expect(applied.code, applied.out.join("\n")).toBe(0);
    const left = ghostLines(rig);
    expect(left, "exactly the tombstoned ids' ghosts are gone").toEqual(all.filter((l) => !(l.startsWith("player ") && mine.has(l.split(" ")[3]))));
    expect(left.filter((l) => l.startsWith("pool ")).length, "the seed pool stays").toBeGreaterThan(0);
    for (const keep of [D.playerId, E.playerId, F.playerId, A.playerId.slice(0, 20), A.playerId + "x"]) {
      expect(left.some((l) => l.endsWith(` ${keep}`)), `a ghost of ${keep.slice(0, 8)}… stays`).toBe(true);
    }
    const again = await admin(rig, ["purge-tombstoned", "--apply"]);
    expect(again.code, again.out.join("\n")).toBe(0);
    expect(again.out.some((l) => l.includes("delete 0 record(s)"))).toBe(true);
    expect(ghostLines(rig)).toEqual(left);
    // the identity records are not the purge's to touch
    expect(Object.keys(await identityRecords(rig)).filter((k) => k.startsWith("tombstones/")).length).toBeGreaterThan(0);
  });

  it("with no tombstone at all the purge plans nothing, reads no ghost, and exits 0; a bad flag is a usage error (2)", async () => {
    const rig = await world(kind);
    const before = storeBytes(rig);
    const none = await admin(rig, ["purge-tombstoned", "--apply"]);
    expect(none.code, none.out.join("\n")).toBe(0);
    expect(none.out.join("\n")).toContain("nothing to purge");
    expect(storeBytes(rig)).toEqual(before);
    expect((await admin(rig, ["purge-tombstoned", "--rules", "nonsense"])).code).toBe(2);
    expect((await admin(rig, ["purge-tombstoned", "somebody"])).code).toBe(2);
  });
});
