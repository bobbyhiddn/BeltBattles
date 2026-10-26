// IDENT-2 step 5 (REQ-BFG-122 clause 4; BRIEF-IDENT2 design 4): DELETE /v1/player also removes history/<id>/ for the player and for every key id it
// tombstones, with at most 8 store requests in flight (FIX2's constant), on both stores (the JSON-lines directory, and Tigris on the in-process fake S3).
// The tombstone is written first, so from then on a history write or read is 410 and nothing is re-created; a DELETE that stops half way in the history
// removal is finished by the next call from the key that asked (its own link goes last); a repeat DELETE removes what a machine that had not seen the
// tombstone wrote meanwhile; the history of everybody else stays. The cost of a full player's DELETE is counted at the fake S3.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import { TOMBSTONE_READS_IN_FLIGHT, decodeTombstone } from "../server/links";
import { StorageError } from "../server/store";
import { nameOf } from "../server/historyStore";
import { encodeEntry } from "../src/net/historyWire";
import { testIdentity } from "./netIdentity";
import { closeRigs, deleteMe, freshIdentity, identityRecords, linkVia } from "./identRig";
import {
  FINISHED, NOW, OPEN, allHistory, entryFor, getEntry, historyObjects, historyOf, historyRaw, listEntries, listedIds, markRequests, openHistoryRig, opsSince,
  putEntry, readObject, requestsSince, writeObject, type Kind, type Rig,
} from "./ident2Rig";

let A: Identity, B: Identity, C: Identity, D: Identity;
beforeAll(async () => {
  [A, B, C, D] = await Promise.all([0, 1, 2, 3].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const GONE = { error: "this player was deleted" };
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const nameOfId = (id: string, finishedAt = FINISHED): string => nameOf({ finishedAt, id });
/** Put an entry object straight into the store under `owner`, as a machine that wrote it earlier (or later) would have. */
async function planted(rig: Rig, owner: string, id: string, finishedAt = FINISHED): Promise<string> {
  const e = entryFor(id, { finishedAt });
  await historyOf(rig).put(owner, { finishedAt, id }, encodeEntry(e));
  return nameOf({ finishedAt, id });
}

describe.each(KINDS)("DELETE /v1/player removes the run history (%s)", (kind) => {
  it("every history object of the player and of every key id it tombstones goes (also the asking key's own); everybody else's history stays", async () => {
    const rig = await openHistoryRig(kind);
    const E = await freshIdentity(); // an unrelated player with a device of its own
    const F = await freshIdentity();
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await linkVia(rig, A, C)).joined.status).toBe(200);
    expect((await linkVia(rig, E, F)).joined.status).toBe(200);
    // entries through the routes: all under the canonical player A, from three keys; and E's, from its device
    expect((await putEntry(rig, A, entryFor("a-1", { finishedAt: FINISHED }))).status).toBe(201);
    expect((await putEntry(rig, B, entryFor("b-1", { finishedAt: FINISHED - 1_000 }))).status).toBe(201);
    expect((await putEntry(rig, C, entryFor("c-1", { finishedAt: FINISHED - 2_000 }))).status).toBe(201);
    expect((await putEntry(rig, F, entryFor("f-1"))).status).toBe(201);
    // and entries a key's own id holds: B's and C's (written before they linked, or by a client that stored them there), and a player with an id like A's
    await planted(rig, B.playerId, "b-old", FINISHED - 5_000);
    await planted(rig, C.playerId, "c-old", FINISHED - 6_000);
    await planted(rig, `${A.playerId}x`, "lookalike"); // an id that only STARTS like A's: not A's
    expect(historyObjects(rig, A.playerId)).toHaveLength(3);
    expect(allHistory(rig), "3 under A, 1 each under B and C, 1 under E, 1 under the lookalike id").toHaveLength(7);

    const del = await deleteMe(rig, B); // a linked key may ask
    expect(del.status, del.text).toBe(200);
    expect(del.text).toBe('{"deleted":true}');
    for (const id of [A, B, C]) expect(historyRaw(rig, id.playerId), id.playerId.slice(0, 5)).toEqual([]);
    expect(allHistory(rig).sort(), "what is left: the lookalike id's and E's (F is E's device, so its entry is E's)").toEqual(
      [`history/${A.playerId}x/${nameOfId("lookalike")}`, `history/${E.playerId}/${nameOfId("f-1")}`].sort(),
    );
    // the tombstone names the player and both keys, and nothing else is in it
    const records = await identityRecords(rig);
    expect(Object.keys(records).filter((k) => k.startsWith("tombstones/"))).toEqual([`tombstones/${A.playerId}.json`]);
    expect(decodeTombstone(records[`tombstones/${A.playerId}.json`])?.ids.slice().sort()).toEqual([A.playerId, B.playerId, C.playerId].sort());
    // the unrelated player reads its own history as before
    expect(listedIds(await listEntries(rig, F))).toEqual(["f-1"]);
    expect(listedIds(await listEntries(rig, E))).toEqual(["f-1"]);
    // from now on every history request of the player's keys is 410, and none creates anything
    for (const who of [A, B, C]) {
      const tag = who.playerId.slice(0, 4);
      expect(await putEntry(rig, who, entryFor("after-1")), `${tag} PUT`).toMatchObject({ status: 410, json: GONE });
      expect(await putEntry(rig, who, entryFor("a-1")), `${tag} PUT of an old entry`).toMatchObject({ status: 410, json: GONE });
      expect(await listEntries(rig, who), `${tag} list`).toMatchObject({ status: 410, json: GONE });
      expect(await getEntry(rig, who, "a-1"), `${tag} entry`).toMatchObject({ status: 410, json: GONE });
    }
    for (const id of [A, B, C]) expect(historyRaw(rig, id.playerId)).toEqual([]);
    // a repeat DELETE from the first key is a 200 that changes nothing
    const before = await identityRecords(rig);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(await identityRecords(rig)).toEqual(before);
    // and from a device whose link is gone already it is a 200 too (it is a lone key now: IDENT-1's known stray tombstone of its own id,
    // VERIFY-IDENT1-FIX2 finding E); it touches no history of anybody else
    expect((await deleteMe(rig, B)).status).toBe(200);
    expect(allHistory(rig)).toHaveLength(2);
  });

  it("a player with no history is deleted as before (a 200), at the price of one LIST for each id it tombstones", async () => {
    const rig = await openHistoryRig(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    await rig.restart();
    await rig.app.links.settleReload();
    const from = markRequests(rig);
    expect((await deleteMe(rig, A)).status).toBe(200);
    if (kind === "tigris") expect(opsSince(rig, from, "history/"), "the player and one key: two ids, two LISTs, nothing to delete").toEqual({ LIST: 2 });
    expect(allHistory(rig)).toEqual([]);
    expect(Object.keys(await identityRecords(rig))).toEqual([`tombstones/${A.playerId}.json`]);
  });

  it("the cost of a small player's DELETE: a LIST for each id, then a DELETE for each entry (Tigris requests at the fake)", async () => {
    const rig = await openHistoryRig(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await putEntry(rig, B, entryFor(`r-${i}`, { finishedAt: FINISHED - i * 1_000 }))).status).toBe(201);
    await planted(rig, B.playerId, "own-1", FINISHED - 9_000);
    await rig.restart();
    await rig.app.links.settleReload();
    const from = markRequests(rig);
    expect((await deleteMe(rig, B)).status).toBe(200);
    if (kind === "tigris") expect(opsSince(rig, from, "history/"), "2 ids (A, B): 2 LISTs; 6 entries: 6 DELETEs").toEqual({ LIST: 2, DELETE: 6 });
    expect(allHistory(rig)).toEqual([]);
  });

  it("a repeat DELETE removes what a machine that had not seen the tombstone wrote meanwhile, under any id the tombstone names", async () => {
    const rig = await openHistoryRig(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await putEntry(rig, A, entryFor("a-1"))).status).toBe(201);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(allHistory(rig)).toEqual([]);
    // the other machine's late writes: under the player and under the key
    await planted(rig, A.playerId, "late-a");
    await planted(rig, B.playerId, "late-b");
    expect(allHistory(rig)).toHaveLength(2);
    expect((await deleteMe(rig, A)).status, "the first key repeats").toBe(200);
    expect(allHistory(rig), "the tombstone's ids are history/ prefixes to empty again").toEqual([]);
    await planted(rig, B.playerId, "late-b2");
    expect((await deleteMe(rig, B)).status, "a device repeats").toBe(200);
    expect(allHistory(rig)).toEqual([]);
  });

  it("uploads closed: a DELETE still works and still removes the history (a player can always take their data away)", async () => {
    const rig = await openHistoryRig(kind);
    expect((await putEntry(rig, A, entryFor("a-1"))).status).toBe(201);
    await rig.restart({ ...OPEN, uploads: "closed" });
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(allHistory(rig)).toEqual([]);
  });

  it("a DELETE that stops half way in the history removal is a 503 with the tombstone written (the player is gone at once); the key that asked still has its link, and its repeat finishes the job", async () => {
    for (const fail of ["delete", "list"] as const) {
      const rig = await openHistoryRig(kind);
      expect((await linkVia(rig, A, B)).joined.status).toBe(200);
      for (let i = 0; i < 4; i++) expect((await putEntry(rig, A, entryFor(`a-${i}`, { finishedAt: FINISHED - i * 1_000 }))).status).toBe(201);
      await planted(rig, B.playerId, "b-old", FINISHED - 9_000);
      expect(allHistory(rig)).toHaveLength(5);
      const store = historyOf(rig);
      const real = { list: store.list.bind(store), delete: store.delete.bind(store) };
      let seen = 0;
      if (fail === "delete") {
        store.delete = async (p, n) => {
          if (++seen === 2) throw new StorageError("history delete failed: HTTP 503");
          return real.delete(p, n);
        };
      } else {
        store.list = async (p) => {
          if (++seen === 2) throw new StorageError("history list failed: HTTP 503");
          return real.list(p);
        };
      }
      const first = await deleteMe(rig, B);
      expect([first.status, first.headers.get("retry-after")], fail).toEqual([503, "5"]);
      store.list = real.list;
      store.delete = real.delete;
      const records = await identityRecords(rig);
      expect(decodeTombstone(records[`tombstones/${A.playerId}.json`])?.ids.slice().sort(), `${fail}: the tombstone stands`).toEqual([A.playerId, B.playerId].sort());
      expect(records[`links/keys/${B.playerId}.json`], `${fail}: the asking key's own link goes last, so it is still there`).toBeDefined();
      expect(await putEntry(rig, A, entryFor("a-9")), `${fail}: the player is gone though the job is unfinished`).toMatchObject({ status: 410, json: GONE });
      expect(await listEntries(rig, B)).toMatchObject({ status: 410, json: GONE });
      if (fail === "delete") expect(allHistory(rig).length, "the removals before the failed one ran, the failed one did not").toBeGreaterThan(0);
      const second = await deleteMe(rig, B);
      expect(second.status, `${fail}: ${second.text}`).toBe(200);
      expect(allHistory(rig), fail).toEqual([]);
      expect(Object.keys(await identityRecords(rig)), fail).toEqual([`tombstones/${A.playerId}.json`]);
      expect(rig.log.filter((l) => l.startsWith("storage error:"))).toEqual([`storage error: history ${fail} failed: HTTP 503`]);
    }
  });

  it("at most 8 store requests are in flight during the history removal: the LISTs of 65 ids, then the DELETEs of 210 entries", async () => {
    const rig = await openHistoryRig(kind);
    const keys = Array.from({ length: 64 }, (_, i) => `dev${String(i).padStart(3, "0")}${"x".repeat(30)}`);
    const store = rig.app.links.store;
    await store.put(`players/${A.playerId}.json`, JSON.stringify({ keys, steam: [], at: NOW }));
    for (const k of keys) await store.put(`links/keys/${k}.json`, JSON.stringify({ player: A.playerId, at: NOW }));
    for (let i = 0; i < 200; i++) await planted(rig, A.playerId, `e-${String(i).padStart(3, "0")}`, FINISHED - i * 1_000);
    for (let i = 0; i < 10; i++) await planted(rig, keys[i], `k-${i}`, FINISHED - i * 1_000);
    await rig.restart();
    await rig.app.links.settleReload();
    expect(allHistory(rig)).toHaveLength(210);
    const h = historyOf(rig);
    const real = { list: h.list.bind(h), delete: h.delete.bind(h) };
    const m = { inFlight: 0, max: 0, lists: 0, deletes: 0, maxList: 0, maxDelete: 0, laneList: 0, laneDelete: 0 };
    const track = async <T>(lane: "List" | "Delete", fn: () => Promise<T>): Promise<T> => {
      m.inFlight++;
      m[`lane${lane}`]++;
      m.max = Math.max(m.max, m.inFlight);
      m[`max${lane}`] = Math.max(m[`max${lane}`], m[`lane${lane}`]);
      try {
        await sleep(1); // an await boundary, so that requests that run side by side overlap
        return await fn();
      } finally {
        m.inFlight--;
        m[`lane${lane}`]--;
      }
    };
    h.list = (p) => (m.lists++, track("List", () => real.list(p)));
    h.delete = (p, n) => (m.deletes++, track("Delete", () => real.delete(p, n)));
    const del = await deleteMe(rig, A);
    h.list = real.list;
    h.delete = real.delete;
    expect(del.status, del.text).toBe(200);
    expect(TOMBSTONE_READS_IN_FLIGHT).toBe(8);
    expect([m.lists, m.deletes], "a LIST for each of the 65 ids and a DELETE for each of the 210 entries").toEqual([65, 210]);
    expect([m.maxList, m.maxDelete], "8 at a time in each phase, not 1 and not more").toEqual([8, 8]);
    expect(m.max, "and never more than 8 in all").toBe(8);
    expect(m.inFlight).toBe(0);
    expect(allHistory(rig)).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------------ what a full player's DELETE costs

describe("the cost of a full player's DELETE on Tigris (counted at the fake S3)", () => {
  const keysOf = (n: number): string[] => Array.from({ length: n }, (_, i) => `dev${String(i).padStart(3, "0")}${"x".repeat(30)}`);
  const steamOf = (n: number): string => `7656119800${String(n).padStart(7, "0")}`;

  /** A full player: `owner` with 64 linked keys (the first of them `device`, when it signs) and 64 Steam accounts, written straight into the store. */
  async function fullPlayer(rig: Rig, owner: Identity, device: Identity | null): Promise<string[]> {
    const store = rig.app.links.store;
    const keys = device ? [device.playerId, ...keysOf(63)] : keysOf(64);
    const steam = Array.from({ length: 64 }, (_, i) => steamOf(200 + i));
    await store.put(`players/${owner.playerId}.json`, JSON.stringify({ keys, steam, at: NOW }));
    for (const k of keys) await store.put(`links/keys/${k}.json`, JSON.stringify({ player: owner.playerId, at: NOW }));
    for (const s of steam) await store.put(`links/steam/${s}.json`, JSON.stringify({ player: owner.playerId, at: NOW }));
    return keys;
  }

  for (const from of ["the first key", "a device"] as const) {
    it(`64 linked keys, 64 Steam accounts and 200 history entries, asked by ${from}: the requests of one DELETE, by operation`, async () => {
      const rig = await openHistoryRig("tigris");
      await fullPlayer(rig, A, from === "a device" ? B : null);
      await rig.restart();
      await rig.app.links.settleReload(); // the first load, so that the DELETE itself does not pay for it
      for (let i = 0; i < 200; i++) await planted(rig, A.playerId, `e-${String(i).padStart(3, "0")}`, FINISHED - i * 1_000);
      expect(allHistory(rig)).toHaveLength(200);
      const mark = markRequests(rig);
      expect((await deleteMe(rig, from === "a device" ? B : A)).status).toBe(200);
      const all = opsSince(rig, mark);
      const hist = opsSince(rig, mark, "history/");
      const total = requestsSince(rig, mark).length;
      const rest: Record<string, number> = {};
      for (const [op, n] of Object.entries(all)) rest[op] = n - (hist[op] ?? 0);
      console.log(`IDENT2 a full player's DELETE asked by ${from} (64 keys, 64 Steam accounts, 200 history entries), requests at the Tigris fake: ${JSON.stringify(all)} = ${total}; the history/ ones: ${JSON.stringify(hist)}; all the others (IDENT-1's): ${JSON.stringify(rest)} = ${total - Object.values(hist).reduce((a, b) => a + b, 0)}`);
      expect(hist, "a LIST for each of the 65 ids (the player and 64 keys; the device is one of them), a DELETE for each entry").toEqual({ LIST: 65, DELETE: 200 });
      expect(total - 265, "the rest is IDENT-1 FIX2's 329 (the first key) or 330 (a device), give or take the store's own bookkeeping").toBeGreaterThanOrEqual(320);
      expect(total - 265).toBeLessThanOrEqual(340);
      expect(allHistory(rig)).toEqual([]);
      expect(await identityRecords(rig)).toEqual({ [`tombstones/${A.playerId}.json`]: expect.any(String) });
    }, 120_000);
  }

  it("a repeat of that DELETE (the record is gone, the tombstone names 65 ids) costs a LIST for each id and nothing more of the history", async () => {
    const rig = await openHistoryRig("tigris");
    await fullPlayer(rig, A, null);
    await rig.restart();
    await rig.app.links.settleReload();
    expect((await deleteMe(rig, A)).status).toBe(200);
    const mark = markRequests(rig);
    expect((await deleteMe(rig, A)).status).toBe(200);
    console.log(`IDENT2 the repeat DELETE of a full player, requests at the Tigris fake: ${JSON.stringify(opsSince(rig, mark))}; the history/ ones: ${JSON.stringify(opsSince(rig, mark, "history/"))}`);
    expect(opsSince(rig, mark, "history/")).toEqual({ LIST: 65 });
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------- a deleted player's keys

describe.each(KINDS)("after a DELETE the player's ids hold no history and cannot get any (%s)", (kind) => {
  it("a key made after the delete is a new player: it has no history of the old one, and its own works", async () => {
    const rig = await openHistoryRig(kind);
    expect((await putEntry(rig, D, entryFor("old-1"))).status).toBe(201);
    expect((await deleteMe(rig, D)).status).toBe(200);
    const fresh = await freshIdentity();
    expect(listedIds(await listEntries(rig, fresh))).toEqual([]);
    expect((await putEntry(rig, fresh, entryFor("new-1"))).status).toBe(201);
    expect(historyObjects(rig, fresh.playerId)).toEqual([nameOfId("new-1")]);
    expect(historyObjects(rig, D.playerId)).toEqual([]);
    expect(readObject(rig, D.playerId, nameOfId("old-1"))).toBeNull();
  });

  it("the rest of the deletion is as it was: the profile, the links and the live code go, one tombstone is written, and the ghosts stay for the purge", async () => {
    const rig = await openHistoryRig(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await putEntry(rig, B, entryFor("b-1"))).status).toBe(201);
    expect((await deleteMe(rig, B)).status).toBe(200);
    expect(Object.keys(await identityRecords(rig))).toEqual([`tombstones/${A.playerId}.json`]);
    expect(rig.app.links.isGone(A.playerId) && rig.app.links.isGone(B.playerId)).toBe(true);
  });
});
