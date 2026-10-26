// VERIFY-IDENT1-FIX1 (REQ-BFG-122) step 4c, written by the independent re-checker (cap_xi): ATTACKS ON THE F3 FIX. One constant, MAX_LINKED = 64, serves
// the writers (join, linkSteam: the link past it is a 409 with one plain line, nothing stored) and the readers (decodePlayer); the tombstone reader
// has no count limit. keys[] does not count P: a full player is P and 64 keys, 65 devices, a tombstone of 65 ids.
// Here: players built by SEEDING the store (fast) and then walked over the real routes at exactly 62/63/64/65/66; both routes; a key that is already
// linked or already listed; the known Steam account of a full player; races for the last places; a restart at each point; DELETE from the first key and
// from a device with 64 keys and 64 Steam accounts; the tombstone after two restarts; hand-made tombstones of any length (and one with a bad id);
// a hand-made player record with 65 keys. Both backing stores (JSON lines, and Tigris on the fake S3).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import { MAX_LINKED, decodePlayer, decodeTombstone } from "../server/links";
import { testIdentity } from "./netIdentity";
import { earnedWire } from "./profileupWire";
import {
  closeRigs, deleteMe, fakeSteam, freshIdentity, identityRecords, linkSteamCall, openRig, openSibling, postGhost, profileStored, putWire, redeemCode, requestCode,
  theFake, uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity;
beforeAll(async () => {
  A = await testIdentity(0);
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const NOLIMIT = { windowMs: 600_000, max: 1_000_000 };
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT, ...over });
const codeOf = (r: Reply): string => String(r.json?.code);
const FULL_KEYS = { error: "this player already has the most linked devices it can have" };
const FULL_STEAM = { error: "this player already has the most Steam accounts it can have" };
const under = async (rig: Rig, prefix: string) => Object.keys(await identityRecords(rig)).filter((k) => k.startsWith(prefix)).sort();
/** n distinct well-formed ids. */
const ids = (n: number, tag = "k"): string[] => Array.from({ length: n }, (_, i) => `${tag}${String(i).padStart(4, "0")}${"x".repeat(30)}`);
const steamId = (n: number): string => `7656119800${String(n).padStart(7, "0")}`;
const steamIds = (n: number): string[] => Array.from({ length: n }, (_, i) => steamId(i));
const ticket = (n: number): string => n.toString(16).padStart(4, "0");
const tally = (rs: Reply[]): Record<number, number> => rs.reduce<Record<number, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
const listOf = async (rig: Rig, owner: Identity) => decodePlayer((await identityRecords(rig))[`players/${owner.playerId}.json`]);

/** `owner` with `keys` linked (fake ids, or real devices' ids) and `steam` accounts, written into the store by hand; then a restart, so that
 *  no cache remembers the empty store. The same bytes the real routes write. */
async function seed(rig: Rig, owner: Identity, keys: string[], steam: string[] = []): Promise<void> {
  const s = rig.app.links.store;
  const at = rig.clock.now;
  await s.put(`players/${owner.playerId}.json`, JSON.stringify({ keys, steam, at }));
  for (const k of keys) await s.put(`links/keys/${k}.json`, JSON.stringify({ player: owner.playerId, at }));
  for (const id of steam) await s.put(`links/steam/${id}.json`, JSON.stringify({ player: owner.playerId, at }));
  await rig.restart();
}

describe("F3: the readers' boundary", () => {
  it("keys[] and steam[] read at 63 and 64 and not at 65; the tombstone reads at 64, 65, 66 and 1000 ids (P and 64 keys is 65), a bad id anywhere refuses it", () => {
    const rec = (keys: string[], steam: string[]) => JSON.stringify({ keys, steam, at: 1 });
    for (const n of [0, 1, MAX_LINKED - 1, MAX_LINKED]) {
      expect(decodePlayer(rec(ids(n), []))?.keys, `${n} keys`).toHaveLength(n);
      expect(decodePlayer(rec([], ids(n, "s")))?.steam, `${n} accounts`).toHaveLength(n);
    }
    for (const n of [MAX_LINKED + 1, MAX_LINKED + 2, 1000]) {
      expect(decodePlayer(rec(ids(n), [])), `${n} keys`).toBeNull();
      expect(decodePlayer(rec([], ids(n, "s"))), `${n} accounts`).toBeNull();
    }
    for (const n of [MAX_LINKED, MAX_LINKED + 1, MAX_LINKED + 2, 1000]) expect(decodeTombstone(JSON.stringify({ at: 1, ids: ids(n) }))?.ids, `${n} ids`).toHaveLength(n);
    const bad = ids(100);
    bad[57] = "not an id!";
    expect(decodeTombstone(JSON.stringify({ at: 1, ids: bad }))).toBeNull();
    expect(decodeTombstone(JSON.stringify({ at: 1, ids: [...ids(3), 7] }))).toBeNull();
    expect(decodeTombstone(JSON.stringify({ at: -1, ids: ids(3) }))).toBeNull();
  });
});

describe.each(KINDS)("F3: keys, over the redeem route, on %s", (kind) => {
  it("62 seeded keys: the 63rd and 64th link, the 65th and 66th are 409 with one plain line and change nothing (the live code stays unspent); after a restart the same; a key already linked still redeems", async () => {
    const rig = await open(kind);
    await seed(rig, A, ids(MAX_LINKED - 2));
    const [k63, k64, k65, k66] = await Promise.all([freshIdentity(), freshIdentity(), freshIdentity(), freshIdentity()]);
    expect((await listOf(rig, A))?.keys).toHaveLength(62);
    expect((await redeemCode(rig, k63, codeOf(await requestCode(rig, A)))).status).toBe(200);
    expect((await listOf(rig, A))?.keys).toHaveLength(63);
    const six4 = await redeemCode(rig, k64, codeOf(await requestCode(rig, A)));
    expect([six4.status, six4.json?.player], six4.text).toEqual([200, A.playerId]);
    expect((await listOf(rig, A))?.keys, "exactly full: all 64 read back, in order").toEqual([...ids(MAX_LINKED - 2), k63.playerId, k64.playerId]);
    const live = codeOf(await requestCode(rig, A));
    const before = await identityRecords(rig);
    for (const k of [k65, k66]) {
      const r = await redeemCode(rig, k, live);
      expect([r.status, r.json], r.text).toEqual([409, FULL_KEYS]);
    }
    expect(await identityRecords(rig), "not one record changed, the live code included").toEqual(before);
    expect((await postGhost(rig, k65, uploadFor(k65, A.playerId, { runId: "o-1" }))).status, "the 65th key is nobody's device").toBe(403);
    await rig.restart();
    const late = await redeemCode(rig, k65, live);
    expect([late.status, late.json], "after a restart: the code is still unspent, and the player is still full").toEqual([409, FULL_KEYS]);
    expect((await listOf(rig, A))?.keys).toHaveLength(MAX_LINKED);
    const again = await redeemCode(rig, k64, live);
    expect([again.status, again.json?.player], "a key already linked redeems its player's code: 200, nothing added").toEqual([200, A.playerId]);
    expect((await listOf(rig, A))?.keys).toHaveLength(MAX_LINKED);
    expect(await under(rig, "links/keys/")).toHaveLength(MAX_LINKED);
  });

  it("a key the record lists but whose link was never written (a crash window) takes no new place at a full player: it links; a stranger is still 409", async () => {
    const rig = await open(kind);
    const K = await freshIdentity();
    await seed(rig, A, [...ids(MAX_LINKED - 1), K.playerId]);
    await rig.app.links.store.delete(`links/keys/${K.playerId}.json`);
    await rig.restart();
    const stranger = await freshIdentity();
    const code = codeOf(await requestCode(rig, A));
    expect((await redeemCode(rig, stranger, code)).json).toEqual(FULL_KEYS);
    const k = await redeemCode(rig, K, code);
    expect([k.status, k.json?.player], k.text).toEqual([200, A.playerId]);
    expect((await listOf(rig, A))?.keys, "listed once, still 64").toHaveLength(MAX_LINKED);
    expect(await under(rig, "links/keys/"), "and now linked").toContain(`links/keys/${K.playerId}.json`);
  });

  it("two machines over one store, writes one after the other: each reads the record fresh (never its cache) for the cap, so the 65th key is 409 on both", async () => {
    const rig = await open(kind);
    await seed(rig, A, ids(MAX_LINKED - 2));
    const sibling = await openSibling(rig, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT });
    const [k63, k64, k65, k66] = await Promise.all([freshIdentity(), freshIdentity(), freshIdentity(), freshIdentity()]);
    expect((await redeemCode(rig, k63, codeOf(await requestCode(rig, A)))).status).toBe(200); // this machine: 62 -> 63
    const six4 = await redeemCode(sibling, k64, codeOf(await requestCode(sibling, A))); // the other machine: 63 -> 64, with its own (stale) cache
    expect([six4.status, six4.json?.player], six4.text).toEqual([200, A.playerId]);
    expect((await listOf(rig, A))?.keys).toHaveLength(MAX_LINKED);
    const code = codeOf(await requestCode(rig, A));
    expect((await redeemCode(rig, k65, code)).json, "this machine's cache said 63").toEqual(FULL_KEYS);
    expect((await redeemCode(sibling, k66, code)).json, "the other machine's cache said 63 too").toEqual(FULL_KEYS);
    expect(await under(rig, "links/keys/")).toHaveLength(MAX_LINKED);
  });

  it("the last two places raced for by five lone keys through one known Steam account: exactly two get in and three are 409", async () => {
    const accounts: Record<string, string> = { aa01: steamId(0) };
    for (let i = 1; i <= 5; i++) accounts[`bb0${i}`] = steamId(0);
    const rig = await open(kind, { steam: fakeSteam(accounts) });
    await seed(rig, A, ids(MAX_LINKED - 2), [steamId(0)]);
    const lone = await Promise.all(Array.from({ length: 5 }, () => freshIdentity()));
    const rs = await Promise.all(lone.map((k, i) => linkSteamCall(rig, k, `bb0${i + 1}`, "bb-ghost", 480)));
    expect(tally(rs), rs.map((r) => r.text).join(" | ")).toEqual({ 200: 2, 409: 3 });
    for (const r of rs.filter((x) => x.status === 409)) expect(r.json).toEqual(FULL_KEYS);
    expect((await listOf(rig, A))?.keys).toHaveLength(MAX_LINKED);
    expect(await under(rig, "links/keys/")).toHaveLength(MAX_LINKED);
  });

  it("the known Steam account of a full player: a lone key with a profile and a live code is 409 and nothing of it changes; a device the player already has asking for the same account is 200", async () => {
    const steam = fakeSteam({ aa01: steamId(0), aa02: steamId(0) });
    const rig = await open(kind, { steam });
    const dev = await freshIdentity();
    await seed(rig, A, [...ids(MAX_LINKED - 1), dev.playerId], [steamId(0)]);
    const K = await freshIdentity();
    expect((await putWire(rig, earnedWire({ runs: 3 }), K)).status).toBe(200);
    await requestCode(rig, K);
    const before = await identityRecords(rig);
    const r = await linkSteamCall(rig, K, "aa01", "bb-ghost", 480);
    expect([r.status, r.json], r.text).toEqual([409, FULL_KEYS]);
    expect(await identityRecords(rig), "K's code, K's player record and every link are as they were").toEqual(before);
    expect(profileStored(rig, K.playerId), "and K's profile").toBe(true);
    const d = await linkSteamCall(rig, dev, "aa02", "bb-ghost", 480);
    expect([d.status, d.json?.player], d.text).toEqual([200, A.playerId]);
    expect(await identityRecords(rig), "an account the player has already, asked by its own device: no change").toEqual(before);
  });
});

describe.each(KINDS)("F3: Steam accounts, on %s", (kind) => {
  it("62 seeded accounts: the 63rd and 64th link, the 65th and 66th are 409 with one plain line and change nothing; an account the player has is a 200 no-op; a restart changes nothing; keys still join", async () => {
    const accounts: Record<string, string> = { ffff: steamId(10) };
    for (let n = 0; n < MAX_LINKED + 3; n++) accounts[ticket(n)] = steamId(n);
    const rig = await open(kind, { steam: fakeSteam(accounts) });
    await seed(rig, A, [], steamIds(MAX_LINKED - 2));
    for (const n of [MAX_LINKED - 2, MAX_LINKED - 1]) {
      const r = await linkSteamCall(rig, A, ticket(n), "bb-ghost", 480);
      expect([r.status, r.json?.player], `account ${n + 1}: ${r.text}`).toEqual([200, A.playerId]);
    }
    expect((await listOf(rig, A))?.steam, "all 64 read back, in order").toEqual(steamIds(MAX_LINKED));
    const before = await identityRecords(rig);
    for (const n of [MAX_LINKED, MAX_LINKED + 1]) {
      const r = await linkSteamCall(rig, A, ticket(n), "bb-ghost", 480);
      expect([r.status, r.json], `account ${n + 1}: ${r.text}`).toEqual([409, FULL_STEAM]);
    }
    expect(await identityRecords(rig), "no 65th Steam link record either").toEqual(before);
    expect((await linkSteamCall(rig, A, "ffff", "bb-ghost", 480)).status, "an account the player has already").toBe(200);
    expect(await identityRecords(rig)).toEqual(before);
    await rig.restart();
    expect((await requestCode(rig, A)).status).toBe(200);
    expect((await listOf(rig, A))?.steam, "the code request did not rewrite the record from nothing").toHaveLength(MAX_LINKED);
    const late = await linkSteamCall(rig, A, ticket(MAX_LINKED + 2), "bb-ghost", 480);
    expect([late.status, late.json]).toEqual([409, FULL_STEAM]);
    const k = await freshIdentity();
    expect((await redeemCode(rig, k, codeOf(await requestCode(rig, A)))).status, "the caps are separate: a key still joins").toBe(200);
    expect((await listOf(rig, A))?.steam).toHaveLength(MAX_LINKED);
  });

  it("the last two Steam places raced for by five new accounts of one player: exactly two succeed and three are 409", async () => {
    const accounts: Record<string, string> = {};
    for (let i = 0; i < 5; i++) accounts[ticket(200 + i)] = steamId(500 + i);
    const rig = await open(kind, { steam: fakeSteam(accounts) });
    await seed(rig, A, [], steamIds(MAX_LINKED - 2));
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => linkSteamCall(rig, A, ticket(200 + i), "bb-ghost", 480)));
    expect(tally(rs), rs.map((r) => r.text).join(" | ")).toEqual({ 200: 2, 409: 3 });
    expect((await listOf(rig, A))?.steam).toHaveLength(MAX_LINKED);
    expect(await under(rig, "links/steam/")).toHaveLength(MAX_LINKED);
  });
});

describe.each(KINDS)("F3: DELETE of a full player (64 keys and 64 Steam accounts), on %s", (kind) => {
  it.each([["the first key"], ["a device"]])("from %s, after a restart: the tombstone names all 65 ids, no record of any kind survives, and it reads back whole after two more restarts", async (from) => {
    const rig = await open(kind);
    const dev = await freshIdentity(), stranger = await freshIdentity();
    const keys = [...ids(MAX_LINKED - 1), dev.playerId];
    await seed(rig, A, keys, steamIds(MAX_LINKED));
    expect((await requestCode(rig, A)).status).toBe(200); // a live code too
    const everyone = [A.playerId, ...keys];
    expect(everyone).toHaveLength(MAX_LINKED + 1);
    await rig.restart();
    const requestsBefore = kind === "tigris" ? theFake().requests.length : 0;
    expect((await deleteMe(rig, from === "a device" ? dev : A)).status).toBe(200);
    if (kind === "tigris") {
      const mine = theFake().requests.slice(requestsBefore).filter((r) => r.bucket === rig.bucket);
      const ops = (op: string) => mine.filter((r) => r.op === op).length;
      console.log(`VIDENT1FIX DELETE of a full player from ${from} on tigris: ${mine.length} S3 requests (${ops("GET")} GET, ${ops("HEAD")} HEAD, ${ops("PUT")} PUT, ${ops("DELETE")} DELETE, ${ops("LIST")} LIST), all one after the other`);
    }
    const records = await identityRecords(rig);
    expect(Object.keys(records), "the tombstone is all that is left: no link, no player record, no Steam link, no code").toEqual([`tombstones/${A.playerId}.json`]);
    const tomb = decodeTombstone(records[`tombstones/${A.playerId}.json`]);
    expect(tomb?.ids.slice().sort()).toEqual(everyone.slice().sort());
    await rig.restart();
    await rig.restart();
    await rig.app.links.ensureFresh();
    expect(rig.app.links.goneCount).toBe(MAX_LINKED + 1);
    for (const id of everyone) expect(rig.app.links.isGone(id), id.slice(0, 5)).toBe(true);
    expect(rig.app.links.isGone(stranger.playerId)).toBe(false);
    expect((await postGhost(rig, dev, uploadFor(dev, dev.playerId, { runId: "after" }))).status, "a device of the deleted player").toBe(410);
    expect((await postGhost(rig, stranger, uploadFor(stranger, stranger.playerId, { runId: "other" }))).status, "somebody else").toBe(201);
    expect((await requestCode(rig, A)).status, "the deleted player").toBe(410);
  });
});

describe.each(KINDS)("F3: hand-made records, on %s", (kind) => {
  it.each([[MAX_LINKED + 1], [200], [1000]])("a hand-made tombstone of %i ids reads back whole after a restart: every id is gone", async (n) => {
    const rig = await open(kind);
    const list = ids(n, "t");
    await rig.app.links.store.put(`tombstones/${A.playerId}.json`, JSON.stringify({ at: rig.clock.now, ids: list }));
    await rig.restart();
    await rig.app.links.ensureFresh();
    expect(rig.app.links.goneCount).toBe(n);
    for (const id of [list[0], list[63], list[64], list[n - 1]]) expect(rig.app.links.isGone(id), id.slice(0, 6)).toBe(true);
  });

  it("a hand-made tombstone with ONE bad id in it is refused whole: none of its ids is gone, and the log says it was skipped (NOTE: a damaged deny list fails open; no writer can make one)", async () => {
    const rig = await open(kind);
    const list = [...ids(100, "t"), "not a valid id!"];
    await rig.app.links.store.put(`tombstones/${A.playerId}.json`, JSON.stringify({ at: rig.clock.now, ids: list }));
    await rig.restart();
    await rig.app.links.ensureFresh();
    expect(rig.app.links.goneCount).toBe(0);
    expect(rig.log.join("\n")).toContain("skipping an unreadable tombstone");
  });

  it("NOTE (by decision, damaged data only): a hand-made player record with 65 keys reads as none; the next write replaces it from nothing, and a DELETE then misses the 65 devices", async () => {
    const rig = await open(kind);
    const dev = await freshIdentity();
    const keys = [dev.playerId, ...ids(MAX_LINKED)];
    expect(keys).toHaveLength(MAX_LINKED + 1);
    await seed(rig, A, keys);
    expect(decodePlayer((await identityRecords(rig))[`players/${A.playerId}.json`]), "it reads as none").toBeNull();
    expect((await requestCode(rig, A)).status).toBe(200);
    expect((await listOf(rig, A))?.keys, "the code request wrote the record again, from nothing: the 65 names are gone from the list").toEqual([]);
    expect(await under(rig, "links/keys/"), "the 65 link records are still there").toHaveLength(MAX_LINKED + 1);
    expect((await deleteMe(rig, A)).status).toBe(200);
    const records = await identityRecords(rig);
    expect(decodeTombstone(records[`tombstones/${A.playerId}.json`])?.ids, "the tombstone names only the player").toEqual([A.playerId]);
    expect(Object.keys(records).filter((k) => k.startsWith("links/keys/")), "and the 65 link records survive the delete").toHaveLength(MAX_LINKED + 1);
    expect((await postGhost(rig, dev, uploadFor(dev, dev.playerId, { runId: "dev-after" }))).status, "the device is not tombstoned").toBe(201);
  });
});
