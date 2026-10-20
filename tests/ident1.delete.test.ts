// IDENT-1 step 5 (REQ-BFG-122; BRIEF-IDENT1): signed deletion with tombstones, through the real server in process, on both stores (the
// JSON-lines directory, and Tigris on the in-process fake S3). DELETE /v1/player by any key of the player removes the profile, every
// link (keys and Steam) and the live code, and writes tombstones/<P>.json naming the player and every key id linked to it. From that
// moment no ghost of those ids is served (in memory at once, after a restart, and on a second server over the same storage within
// the refresh time) and an upload, a profile write or a profile read under them answers 410. A delete is safe to repeat, and one that
// stops half way is finished by the next call. The tombstones are read on first use, and an incomplete read answers 503.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import { ghostId } from "../src/net/snapshot";
import { decodeTombstone, hashCode, normalizeCode } from "../server/links";
import { MemoryLinkStore, type LinkStore } from "../server/linkStore";
import { profileStoreFor } from "../server/profileStore";
import { StorageError } from "../server/store";
import { testIdentity } from "./netIdentity";
import { NOW, earnedWire } from "./profileupWire";
import {
  closeRigs, deleteMe, fakeSteam, freshIdentity, ghostCount, identityRecords, linkSteamCall, linkVia, matchAs, openRig, openSibling, postGhost, profileStored,
  putWire, readProfile, redeemCode, requestCode, uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity, B: Identity, C: Identity, D: Identity;
beforeAll(async () => {
  [A, B, C, D] = await Promise.all([0, 1, 2, 3].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const BASE: Opts = { rateLimit: { windowMs: 60_000, max: 1_000_000 } };
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { ...BASE, ...over });
const GONE = { error: "this player was deleted" };
const j = (r: Reply): Record<string, unknown> => r.json ?? {};
const S1 = "76561198000000001";

/** A salt that changes with every match request, so the same request draws a fresh ghost each time. */
const salter = (): (() => number) => {
  let n = 0;
  return () => n++;
};

/** The ghost ids a series of match requests served, as `player`. */
async function served(rig: Rig, player: string, times: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < times; i++) {
    const r = await matchAs(rig, player);
    expect(r.status, r.text).toBe(200);
    ids.push(String(j(r).id));
  }
  return ids;
}

describe.each(KINDS)("deleting a player on %s", (kind) => {
  it("DELETE /v1/player by a linked key: the profiles, every link, the Steam link and the live code go; the tombstone names the player and every key", async () => {
    const steam = fakeSteam({ aa01: S1, aa02: S1 });
    const rig = await open(kind, { steam });
    const [E, F] = [await freshIdentity(), await freshIdentity()]; // an unrelated player E, with a linked key F
    await putWire(rig, earnedWire({ runs: 4 }), A);
    await putWire(rig, earnedWire({ runs: 2 }), C); // C is a lone key: its profile merges into A's and goes
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await linkVia(rig, A, C)).joined.status).toBe(200);
    expect((await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).status).toBe(200);
    const live = await requestCode(rig, A); // a live code
    await profileStoreFor(rig.app.store).put(B.playerId, { profile: earnedWire({ runs: 1 }), receivedAt: 1 }); // an orphan: a stale device wrote it
    await putWire(rig, earnedWire({ runs: 9 }), E);
    expect((await linkVia(rig, E, F)).joined.status).toBe(200);
    expect(profileStored(rig, A.playerId) && profileStored(rig, B.playerId) && profileStored(rig, E.playerId)).toBe(true);
    const hash = hashCode(normalizeCode(String(j(live).code))!);
    expect(Object.keys(await identityRecords(rig)).sort()).toEqual([
      `linkcodes/${hash}.json`, `links/keys/${B.playerId}.json`, `links/keys/${C.playerId}.json`, `links/keys/${F.playerId}.json`,
      `links/steam/${S1}.json`, `players/${A.playerId}.json`, `players/${E.playerId}.json`,
    ].sort());

    const del = await deleteMe(rig, B); // any key of the player may ask: here a linked one
    expect(del.status, del.text).toBe(200);
    expect(del.text).toBe('{"deleted":true}');

    const after = await identityRecords(rig);
    expect(Object.keys(after).sort()).toEqual([`links/keys/${F.playerId}.json`, `players/${E.playerId}.json`, `tombstones/${A.playerId}.json`].sort());
    const t = decodeTombstone(after[`tombstones/${A.playerId}.json`]);
    expect(t?.at).toBe(NOW);
    expect([...(t?.ids ?? [])].sort()).toEqual([A.playerId, B.playerId, C.playerId].sort());
    expect(JSON.parse(after[`tombstones/${A.playerId}.json`])).toEqual({ at: NOW, ids: t!.ids }); // nothing else is in it
    for (const id of [A, B, C]) expect(profileStored(rig, id.playerId), id.playerId).toBe(false); // the profile, the merged key's and the orphan
    // from now on, under the player's id or any key id of it: 410
    for (const [who, as] of [[A, A], [B, A], [B, B], [C, A], [C, C]] as [Identity, Identity][]) {
      const r = await postGhost(rig, who, uploadFor(who, as.playerId, { runId: `r-${who.playerId.slice(0, 3)}-${as.playerId.slice(0, 3)}` }));
      expect(r, `${who.playerId.slice(0, 4)} as ${as.playerId.slice(0, 4)}`).toMatchObject({ status: 410, json: GONE });
    }
    for (const who of [A, B, C]) {
      expect(await putWire(rig, earnedWire({ runs: 1 }), who), "PUT /v1/profile").toMatchObject({ status: 410, json: GONE });
      expect(await readProfile(rig, who), "GET /v1/profile").toMatchObject({ status: 410, json: GONE });
      expect(await requestCode(rig, who), "link/code").toMatchObject({ status: 410, json: GONE });
    }
    expect(ghostCount(rig)).toBe(0); // and nothing was stored by the refused uploads
    // the live code died with the player
    expect(await redeemCode(rig, D, String(j(live).code))).toMatchObject({ status: 403, json: { error: "that code did not work" } });
    // the unrelated player and its linked key are untouched
    expect(profileStored(rig, E.playerId)).toBe(true);
    expect((await postGhost(rig, F, uploadFor(F, E.playerId, { runId: "f-1" }))).status).toBe(201);
    expect(await readProfile(rig, E)).toMatchObject({ status: 200, json: { player: E.playerId } });
    // the Steam account is free again: its next owner maps it to itself (it is unknown now, so there is no 409)
    expect(await linkSteamCall(rig, E, "aa02", "bb-ghost", 480)).toMatchObject({ status: 200, json: { player: E.playerId } });
    expect(JSON.parse((await identityRecords(rig))[`links/steam/${S1}.json`])).toMatchObject({ player: E.playerId });
  });

  it("a key made after the delete is a new player: nothing of the old one follows it", async () => {
    const rig = await open(kind);
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-1" }))).status).toBe(201);
    expect((await deleteMe(rig, A)).status).toBe(200);
    const fresh = await freshIdentity();
    expect((await postGhost(rig, fresh, uploadFor(fresh, fresh.playerId, { runId: "n-1" }))).status).toBe(201);
    expect((await putWire(rig, earnedWire({ runs: 1 }), fresh)).status).toBe(200);
    expect(await readProfile(rig, fresh)).toMatchObject({ status: 200, json: { player: fresh.playerId } });
    expect((await requestCode(rig, fresh)).status).toBe(200);
  });

  it("deleting twice is a 200 both times, with the first tombstone kept; a key that never did anything can delete; one player's delete is not another's", async () => {
    const rig = await open(kind);
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-1" }))).status).toBe(201);
    const first = await deleteMe(rig, A);
    rig.clock.now += 5_000;
    const second = await deleteMe(rig, A);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.text).toBe(first.text);
    const records = await identityRecords(rig);
    expect(Object.keys(records)).toEqual([`tombstones/${A.playerId}.json`]);
    expect(decodeTombstone(records[`tombstones/${A.playerId}.json`])).toEqual({ at: NOW, ids: [A.playerId] }); // the first delete's time
    expect((await deleteMe(rig, D)).status).toBe(200); // D never uploaded or linked anything
    expect(Object.keys(await identityRecords(rig)).sort()).toEqual([`tombstones/${A.playerId}.json`, `tombstones/${D.playerId}.json`].sort());
    // C is not one of A's keys: its delete is its own, and A's ghost is still A's ghost to everybody else
    expect((await deleteMe(rig, C)).status).toBe(200);
    expect(rig.app.links.isGone(C.playerId) && rig.app.links.isGone(A.playerId)).toBe(true);
    expect(rig.app.links.isGone(B.playerId)).toBe(false);
  });

  it("a deleted player's Steam link and live code are gone with it, and the code no longer redeems", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1 }) });
    expect((await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).status).toBe(200);
    const code = String(j(await requestCode(rig, A)).code);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(Object.keys(await identityRecords(rig))).toEqual([`tombstones/${A.playerId}.json`]);
    expect((await redeemCode(rig, B, code)).status).toBe(403);
  });
});

// ----------------------------------------------------------------------------------------------------- the ghosts

describe.each(KINDS)("a deleted player's ghosts on %s", (kind) => {
  it("none is served: at once, in the same process, and after a restart (the tombstones load on first use); the ghosts themselves stay until the purge", async () => {
    const rig = await open(kind, { matchSalt: salter() });
    const gA = uploadFor(A, A.playerId, { runId: "a-1" });
    expect((await postGhost(rig, A, gA)).status).toBe(201);
    expect(await served(rig, D.playerId, 3)).toEqual([ghostId(gA), ghostId(gA), ghostId(gA)]); // the only ghost there is: served
    const gC = uploadFor(C, C.playerId, { runId: "c-1" });
    expect((await postGhost(rig, C, gC)).status).toBe(201);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(new Set(await served(rig, D.playerId, 25))).toEqual(new Set([ghostId(gC)])); // at once
    await rig.restart({ ...BASE, matchSalt: salter() });
    expect(new Set(await served(rig, D.playerId, 10))).toEqual(new Set([ghostId(gC)])); // after a restart
    expect(ghostCount(rig)).toBe(2); // nothing was removed from the store: ghost-admin purge-tombstoned does that
  });

  it("when the deleted player's was the only ghost there is, the match finds none", async () => {
    const rig = await open(kind, { matchSalt: salter() });
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-1" }))).status).toBe(201);
    await deleteMe(rig, A);
    expect((await matchAs(rig, D.playerId)).status).toBe(404);
  });

  it("the ghosts of every key that was linked are gone with the player's own", async () => {
    const rig = await open(kind, { matchSalt: salter() });
    const gB = uploadFor(B, B.playerId, { runId: "b-1" }); // B uploaded under its own id before it was linked
    expect((await postGhost(rig, B, gB)).status).toBe(201);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    const gA = uploadFor(B, A.playerId, { runId: "a-1" }); // and under the player after
    expect((await postGhost(rig, B, gA)).status).toBe(201);
    const gC = uploadFor(C, C.playerId, { runId: "c-1" });
    expect((await postGhost(rig, C, gC)).status).toBe(201);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(new Set(await served(rig, D.playerId, 30))).toEqual(new Set([ghostId(gC)]));
  });

  it("a second server over the same storage picks up a delete within the refresh time, for the match and for uploads", async () => {
    const rig = await open(kind, { matchSalt: salter() });
    const gA = uploadFor(A, A.playerId, { runId: "a-1" });
    const gC = uploadFor(C, C.playerId, { runId: "c-1" });
    expect((await postGhost(rig, A, gA)).status).toBe(201);
    expect((await postGhost(rig, C, gC)).status).toBe(201);
    const second = await openSibling(rig, { ...BASE, tombstoneTtlMs: 1000, matchSalt: salter() });
    expect((await matchAs(second, D.playerId)).status).toBe(200); // its first request reads the (empty) tombstones
    const gA2 = uploadFor(A, A.playerId, { runId: "a-2" });
    expect((await postGhost(second, A, gA2)).status).toBe(201); // and takes A's upload: A is not deleted yet
    expect((await deleteMe(rig, A)).status).toBe(200); // through the first server
    rig.clock.now += 1000; // the clocks are one: the second server's refresh time has passed
    expect(new Set(await served(second, D.playerId, 25))).toEqual(new Set([ghostId(gC)]));
    expect(await postGhost(second, A, uploadFor(A, A.playerId, { runId: "a-3" }))).toMatchObject({ status: 410, json: GONE });
    expect(await readProfile(second, A)).toMatchObject({ status: 410, json: GONE });
    expect(await putWire(second, earnedWire({ runs: 1 }), A)).toMatchObject({ status: 410, json: GONE });
  });

  it("the match skips the ghosts of the keys linked to P; a stale linked key asking under its own id is treated as P", async () => {
    const rig = await open(kind, { matchSalt: salter() });
    const gB = uploadFor(B, B.playerId, { runId: "b-1" }); // B is a different player until it links
    expect((await postGhost(rig, B, gB)).status).toBe(201);
    expect(await served(rig, A.playerId, 3)).toEqual([ghostId(gB), ghostId(gB), ghostId(gB)]); // so A is served B's ghost
    const gA = uploadFor(A, A.playerId, { runId: "a-1" });
    const gC = uploadFor(C, C.playerId, { runId: "c-1" });
    expect((await postGhost(rig, A, gA)).status).toBe(201);
    expect((await postGhost(rig, C, gC)).status).toBe(201);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    // as the player: neither its own ghost nor the linked key's old one
    expect(new Set(await served(rig, A.playerId, 30))).toEqual(new Set([ghostId(gC)]));
    // a run that began before the link asks under the key's own id: the same player
    expect(new Set(await served(rig, B.playerId, 30))).toEqual(new Set([ghostId(gC)]));
    // everybody else may be served any of the three
    const others = new Set(await served(rig, D.playerId, 40));
    for (const id of others) expect([ghostId(gA), ghostId(gB), ghostId(gC)]).toContain(id);
    // after a restart the same: the link is read from the store
    await rig.restart({ ...BASE, matchSalt: salter() });
    expect(new Set(await served(rig, B.playerId, 15))).toEqual(new Set([ghostId(gC)]));
  });
});

// ------------------------------------------------------------------------------------------- when the store misbehaves

/** A LinkStore over memory that fails on demand. */
function flaky(): { store: LinkStore; inner: MemoryLinkStore; fail: { list: number; deletePlayers: number } } {
  const inner = new MemoryLinkStore();
  const fail = { list: 0, deletePlayers: 0 };
  const store: LinkStore = {
    get: (k) => inner.get(k),
    put: (k, t) => inner.put(k, t),
    delete: async (k) => {
      if (fail.deletePlayers > 0 && k.startsWith("players/")) {
        fail.deletePlayers--;
        throw new StorageError("identity delete failed: HTTP 503");
      }
      return inner.delete(k);
    },
    list: async (p) => {
      if (fail.list > 0) {
        fail.list--;
        throw new StorageError("identity list failed: HTTP 503");
      }
      return inner.list(p);
    },
  };
  return { store, inner, fail };
}

describe("the tombstones and a store that fails", () => {
  it("an incomplete first read answers 503 to an upload and to a match (nothing stored, nothing served), and the next request reads them", async () => {
    const { store, inner, fail } = flaky();
    await inner.put(`tombstones/${A.playerId}.json`, JSON.stringify({ at: 1, ids: [A.playerId, B.playerId] }));
    const rig = await open("jsonl", { linkStore: store, matchSalt: salter() });
    fail.list = 2;
    const up = await postGhost(rig, C, uploadFor(C, C.playerId, { runId: "c-1" }));
    expect(up).toMatchObject({ status: 503, json: { error: "ghost storage unavailable, try again shortly" } });
    expect(up.headers.get("retry-after")).toBe("5");
    expect(ghostCount(rig)).toBe(0); // a refused upload stored nothing
    expect((await matchAs(rig, D.playerId)).status).toBe(503);
    expect(rig.log.filter((l) => l.startsWith("storage error: identity list failed"))).toHaveLength(2);
    expect((await postGhost(rig, C, uploadFor(C, C.playerId, { runId: "c-1" }))).status).toBe(201); // the third request reads them
    expect(await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-1" }))).toMatchObject({ status: 410, json: GONE });
    expect(await postGhost(rig, B, uploadFor(B, B.playerId, { runId: "b-1" }))).toMatchObject({ status: 410, json: GONE });
    expect(rig.log.join("\n")).not.toContain(A.playerId);
  });

  it("a later refresh that fails keeps the set it has, and tries again in a few seconds", async () => {
    const { store, inner, fail } = flaky();
    const rig = await open("jsonl", { linkStore: store });
    expect((await postGhost(rig, C, uploadFor(C, C.playerId, { runId: "c-1" }))).status).toBe(201); // loads the (empty) set
    await inner.put(`tombstones/${A.playerId}.json`, JSON.stringify({ at: 1, ids: [A.playerId] }));
    rig.clock.now += 61_000; // the 60 s trust is over
    fail.list = 1;
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-1" }))).status).toBe(201); // the refresh failed: the old set, A is not in it yet
    expect(rig.log.some((l) => l.includes("tombstone refresh failed, keeping the set"))).toBe(true);
    expect(rig.app.links.isGone(A.playerId)).toBe(false);
    rig.clock.now += 4_000; // not yet
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-2" }))).status).toBe(201);
    rig.clock.now += 1_000; // 5 s after the failure: it reads again
    expect(await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-3" }))).toMatchObject({ status: 410, json: GONE });
    expect(fail.list).toBe(0);
  });

  it("a delete that stops half way is finished by the next call, from the key that asked or from another key of the player; the tombstone is written first, so the player is gone at once", async () => {
    for (const retryWith of [B, A]) {
      const { store, inner, fail } = flaky();
      const rig = await open("jsonl", { linkStore: store });
      await putWire(rig, earnedWire({ runs: 3 }), A);
      expect((await linkVia(rig, A, B)).joined.status).toBe(200);
      fail.deletePlayers = 1;
      const first = await deleteMe(rig, B); // a linked key asks, and the store fails when the player's record is to go
      expect(first.status).toBe(503);
      expect(decodeTombstone(await inner.get(`tombstones/${A.playerId}.json`))?.ids.slice().sort()).toEqual([A.playerId, B.playerId].sort());
      expect(await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "b-1" }))).toMatchObject({ status: 410, json: GONE }); // gone, though unfinished
      expect(await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-1" }))).toMatchObject({ status: 410, json: GONE });
      expect(profileStored(rig, A.playerId)).toBe(false); // the removals before the stuck one ran
      expect(await inner.get(`players/${A.playerId}.json`)).not.toBeNull(); // the player's record is what is left
      expect(await inner.get(`links/keys/${B.playerId}.json`)).not.toBeNull(); // and the asking key's own link, which goes last
      const second = await deleteMe(rig, retryWith);
      expect(second.status, second.text).toBe(200);
      expect(Object.keys(await identityRecords(rig))).toEqual([`tombstones/${A.playerId}.json`]);
      expect(rig.log.filter((l) => l.startsWith("storage error:"))).toEqual(["storage error: identity delete failed: HTTP 503"]);
    }
  });
});
