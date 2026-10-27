// VERIFY-IDENT2 (REQ-BFG-122 clause 4), step 4b: THE STORE AND THE CAP (server/historyRoutes.ts store, server/historyStore.ts: the file store, the Tigris
// store, the memory store), attacked beyond tests/ident2.server.test.ts. A passing test pins what was OBSERVED; "FINDING" pins a defect's current
// behaviour (the comment says what is expected); "NOTE" is worth knowing. Both stores (the JSON-lines directory and Tigris on the in-process fake S3).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import { HISTORY_PLAYER_MAX, encodeEntry, type HistoryEntry } from "../src/net/historyWire";
import { HISTORY_KEY, MemoryHistoryStore, nameOf, parseName, type HistoryName } from "../server/historyStore";
import { StorageError } from "../server/store";
import { testIdentity } from "./netIdentity";
import { closeRigs, deleteMe, linkVia, theFake } from "./identRig";
import {
  FINISHED, allHistory, entryFor, getEntry, historyObjects, historyOf, historyRaw, listEntries, listed, listedIds, markRequests, opsSince, openHistoryRig, putEntry, readObject,
  removeObject, writeObject, type Kind, type Rig,
} from "./ident2Rig";

let A: Identity, B: Identity, C: Identity;
beforeAll(async () => {
  [A, B, C] = await Promise.all([0, 1, 2].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const nameOfEntry = (e: HistoryEntry): string => nameOf({ finishedAt: e.finishedAt, id: e.id });
const BASE = FINISHED - 10_000;

/** Put `n` entries straight into the store under `owner` (newest first: entry i finished i seconds before `base`); returns their ids. */
async function fill(rig: Rig, owner: string, n: number, base = BASE, tag = "fill"): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const e = entryFor(`${tag}-${String(i).padStart(3, "0")}`, { finishedAt: base - i * 1_000 });
    await historyOf(rig).put(owner, { finishedAt: e.finishedAt, id: e.id }, encodeEntry(e));
    ids.push(e.id);
  }
  return ids;
}
const fillEntry = (i: number, base = BASE, tag = "fill"): HistoryEntry => entryFor(`${tag}-${String(i).padStart(3, "0")}`, { finishedAt: base - i * 1_000 });

// ----------------------------------------------------------------------------------------------------------------- the names

describe("4b. the object name: <13 digit 9999999999999 - finishedAt>-<id>.json", () => {
  it("4b. nameOf and parseName are inverse for 400 random times and ids (ids with - and _ and digits, 1 to 64 characters); a later time is an earlier name", () => {
    let seed = 12345;
    const rnd = (n: number): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const alphabet = "abcXYZ019-_";
    const names: { name: string; finishedAt: number }[] = [];
    for (let i = 0; i < 400; i++) {
      const finishedAt = rnd(2) === 0 ? rnd(9_999_999) * 1_000_000 + rnd(1_000_000) : 1_767_225_600_000 + rnd(1_000_000_000);
      let id = "";
      for (let k = 0, len = 1 + rnd(64); k < len; k++) id += alphabet[rnd(alphabet.length)];
      const n: HistoryName = { finishedAt, id };
      const name = nameOf(n);
      expect(name).toMatch(/^\d{13}-[A-Za-z0-9_-]{1,64}\.json$/);
      expect(parseName(name), name).toEqual(n);
      expect(HISTORY_KEY.test(`history/P/${name}`), name).toBe(true);
      names.push({ name, finishedAt });
    }
    names.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (let i = 1; i < names.length; i++) expect(names[i - 1].finishedAt >= names[i].finishedAt, `${names[i - 1].name} < ${names[i].name}`).toBe(true);
    expect(nameOf({ finishedAt: 0, id: "x" })).toBe("9999999999999-x.json");
    expect(nameOf({ finishedAt: 9_999_999_999_999, id: "x" })).toBe("0000000000000-x.json");
    for (const bad of [-1, 1.5, 10_000_000_000_000, Number.NaN, Number.MAX_SAFE_INTEGER]) expect(() => nameOf({ finishedAt: bad, id: "x" }), String(bad)).toThrow("not a finishedAt");
  });

  it("4b. parseName takes the first 13 digits as the time and the REST as the id, whatever the id looks like; it refuses every other shape", () => {
    expect(parseName("0000000000001-a-b.json")).toEqual({ finishedAt: 9_999_999_999_998, id: "a-b" });
    expect(parseName("0000000000001-1234567890123-x.json")).toEqual({ finishedAt: 9_999_999_999_998, id: "1234567890123-x" });
    expect(parseName("0000000000001--.json")).toEqual({ finishedAt: 9_999_999_999_998, id: "-" });
    expect(parseName("0000000000001-a.json.json")).toBeNull(); // the id would hold a dot
    const refused = [
      "", ".json", "x.json", "0000000000001-.json", "000000000001-a.json", "00000000000001-a.json", "0000000000001-a.json\n", "0000000000001-a.JSON", "0000000000001-a.json.tmp",
      "0000000000001-a b.json", "0000000000001-é.json", `0000000000001-${"a".repeat(65)}.json`, "-0000000000001-a.json", "0000000000001_a.json", "0000000000001-a\u0000.json",
      "٠٠٠٠٠٠٠٠٠٠٠٠١-a.json", "0000000000001-a/b.json", "../0000000000001-a.json", " 0000000000001-a.json",
    ];
    for (const name of refused) expect(parseName(name), JSON.stringify(name)).toBeNull();
    expect(parseName(`0000000000001-${"a".repeat(64)}.json`)).not.toBeNull();
    for (const key of ["history/P/0000000000001-a.json", `history/${"p".repeat(64)}/0000000000001-a.json`]) expect(HISTORY_KEY.test(key), key).toBe(true);
    for (const key of ["history/P/sub/0000000000001-a.json", "history//0000000000001-a.json", "history/P/0000000000001-a.json/", "history/P/0000000000001-a.json\n", `history/${"p".repeat(65)}/0000000000001-a.json`, "history/P/x.json", "xhistory/P/0000000000001-a.json"]) {
      expect(HISTORY_KEY.test(key), JSON.stringify(key)).toBe(false);
    }
  });

  it("4b. the memory store answers like the others: newest first, ties by id, strays out, and it refuses a bad player or entry id", async () => {
    const m = new MemoryHistoryStore();
    m.records.set("history/P/junk.json", "x");
    m.records.set("history/P/sub/0000000000001-n.json", "x");
    m.records.set("history/Q/0000000000001-q.json", "x");
    for (const n of [{ finishedAt: 5000, id: "b" }, { finishedAt: 6000, id: "z" }, { finishedAt: 5000, id: "a" }, { finishedAt: 5000, id: "a-b" }]) await m.put("P", n, `t-${n.id}`);
    expect((await m.list("P")).map((n) => `${n.finishedAt}/${n.id}`)).toEqual(["6000/z", "5000/a", "5000/a-b", "5000/b"]);
    expect(await m.get("P", { finishedAt: 5000, id: "a" })).toBe("t-a");
    expect(await m.get("P", { finishedAt: 5001, id: "a" }), "the time is part of the name").toBeNull();
    await expect(m.list("../P")).rejects.toThrow("not a player id");
    await expect(m.put("P", { finishedAt: 5000, id: "a/b" }, "x")).rejects.toThrow("not an entry id");
  });
});

// ------------------------------------------------------------------------------------------------ ties, and ids that end each other

describe.each(KINDS)("4b. equal finishing times and ids that end each other (%s)", (kind) => {
  it("4b. six entries finished at the same millisecond: listed by id (not by object name), each found by its own id, a conflict only for its own id", async () => {
    const rig = await openHistoryRig(kind);
    const ids = ["a-b", "b", "a", "a0", "a_b", "x-a"]; // "a" < "a-b" < "a0" < "a_b" < "b" < "x-a" as texts; as object names "a-b" sorts BEFORE "a" ('-' < '.')
    for (const id of ids) expect((await putEntry(rig, A, entryFor(id, { finishedAt: FINISHED }))).status, id).toBe(201);
    const expected = [...ids].sort();
    expect(listedIds(await listEntries(rig, A))).toEqual(expected);
    expect(expected.slice(0, 3)).toEqual(["a", "a-b", "a0"]);
    expect(historyObjects(rig, A.playerId).map((n) => parseName(n)!.id), "the object names sort the 'a-b' before the 'a'").toEqual(["a-b", "a", "a0", "a_b", "b", "x-a"]);
    for (const id of ids) {
      const got = await getEntry(rig, A, id);
      expect([got.status, ((got.json?.entry ?? {}) as { id?: string }).id], id).toEqual([200, id]);
      expect((await putEntry(rig, A, entryFor(id, { finishedAt: FINISHED }))).status, `${id} again`).toBe(200);
      expect((await putEntry(rig, A, entryFor(id, { finishedAt: FINISHED, hero: "weaver" }))).status, `${id} with another hero`).toBe(409);
    }
    expect(historyObjects(rig, A.playerId)).toHaveLength(6);
  });

  it("4b. at the cap, 200 entries with ONE finishing time: the oldest is the greatest id; a new one with that time and a later id is refused, one with an earlier id gets in and the greatest id goes", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const ids: string[] = [];
    for (let i = 0; i < HISTORY_PLAYER_MAX; i++) {
      const e = entryFor(`t-${String(i).padStart(3, "0")}`, { finishedAt: BASE });
      await historyOf(rig).put(A.playerId, { finishedAt: e.finishedAt, id: e.id }, encodeEntry(e));
      ids.push(e.id);
    }
    expect(listedIds(await listEntries(rig, A))).toEqual(ids);
    const later = await putEntry(rig, A, entryFor("t-200", { finishedAt: BASE }));
    expect([later.status, later.json], "same time, an id after the oldest's: it is the oldest, so refused").toEqual([422, { error: "history: this player already holds 200 entries, all newer than this one" }]);
    expect(historyObjects(rig, A.playerId)).toHaveLength(200);
    const earlier = await putEntry(rig, A, entryFor("s-999", { finishedAt: BASE }));
    expect([earlier.status, earlier.json], "same time, an id before everyone's: it is the newest of them, so it gets in").toEqual([201, { id: "s-999" }]);
    const after = listedIds(await listEntries(rig, A));
    expect(after).toHaveLength(200);
    expect(after[0]).toBe("s-999");
    expect(after, "the greatest id went").not.toContain("t-199");
    expect(after).toContain("t-198");
    // a repeat of the one that went: it is new again, and it is the oldest again, so refused
    expect((await putEntry(rig, A, entryFor("t-199", { finishedAt: BASE }))).status).toBe(422);
    // a middle id with the same time gets in and drops the then-greatest
    expect((await putEntry(rig, A, entryFor("t-0995", { finishedAt: BASE }))).status).toBe(201);
    const mid = listedIds(await listEntries(rig, A));
    expect([mid.length, mid.includes("t-0995"), mid.includes("t-198")]).toEqual([200, true, false]);
  });

  it("4b. the 200th entry through the route drops nothing; entry 201 drops exactly the oldest; the dropped entry cannot come back (it is new and older than all)", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const ids = await fill(rig, A.playerId, 199);
    const e200 = fillEntry(199);
    expect((await putEntry(rig, A, e200)).status, "the 200th").toBe(201);
    expect(historyObjects(rig, A.playerId)).toHaveLength(200);
    expect(listedIds(await listEntries(rig, A))).toContain(e200.id);
    const e201 = entryFor("fresh-201", { finishedAt: FINISHED });
    expect((await putEntry(rig, A, e201)).status, "the 201st").toBe(201);
    const list = listedIds(await listEntries(rig, A));
    expect([list.length, list[0], list.includes(e200.id), list.includes(ids[198])]).toEqual([200, "fresh-201", false, true]);
    expect(readObject(rig, A.playerId, nameOfEntry(e200)), "the oldest object is gone").toBeNull();
    const back = await putEntry(rig, A, e200);
    expect([back.status, back.json]).toEqual([422, { error: "history: this player already holds 200 entries, all newer than this one" }]);
  });
});

// ------------------------------------------------------------------------------------------------ the drop comes after the write

describe.each(KINDS)("4b. the drop comes after the write: failure injection at the write and at the drop (%s)", (kind) => {
  it("4b. the write fails at the cap: 503, nothing dropped, nothing added; the drop fails: 503 though the new entry IS stored, the repeat is 200 and does not retry the drop, the next new entry brings the player back to 200", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const ids = await fill(rig, A.playerId, 200);
    const store = historyOf(rig);
    const real = { put: store.put.bind(store), delete: store.delete.bind(store) };
    const fresh = entryFor("fresh-1", { finishedAt: FINISHED });
    // the write fails: a failed write loses nothing
    store.put = async () => {
      throw new StorageError("history write failed: HTTP 503");
    };
    const w = await putEntry(rig, A, fresh);
    store.put = real.put;
    expect([w.status, w.json]).toEqual([503, { error: "ghost storage unavailable, try again shortly" }]);
    expect(historyObjects(rig, A.playerId)).toHaveLength(200);
    expect(listedIds(await listEntries(rig, A))).toEqual(ids);
    // the drop fails: the write stands
    const dropped: string[] = [];
    store.delete = async (p, n) => {
      dropped.push(n.id);
      throw new StorageError("history delete failed: HTTP 503");
    };
    const d = await putEntry(rig, A, fresh);
    store.delete = real.delete;
    expect([d.status, d.headers.get("retry-after")]).toEqual([503, "5"]);
    expect(dropped, "the drop tried the oldest").toEqual([ids[199]]);
    expect(historyObjects(rig, A.playerId), "NOTE: the entry is stored and the oldest is still there: 201 objects").toHaveLength(201);
    expect(listedIds(await listEntries(rig, A)), "NOTE: a read can show 201 entries after a failed drop").toHaveLength(201);
    // the device retries (503 keeps the entry): it gets 200, and the drop is not retried by a repeat
    const again = await putEntry(rig, A, fresh);
    expect([again.status, again.json]).toEqual([200, { id: "fresh-1" }]);
    expect(historyObjects(rig, A.playerId), "a repeat does not drop").toHaveLength(201);
    // the next NEW entry drops two: the player is back at 200
    expect((await putEntry(rig, A, entryFor("fresh-2", { finishedAt: FINISHED + 1_000 }))).status).toBe(201);
    const list = listedIds(await listEntries(rig, A));
    expect([list.length, list.includes(ids[199]), list.includes(ids[198]), list.includes(ids[197])]).toEqual([200, false, false, true]);
    expect(rig.log.filter((l) => l.startsWith("storage error: history")).sort()).toEqual(["storage error: history delete failed: HTTP 503", "storage error: history write failed: HTTP 503"]);
    expect(rig.log.join("\n")).not.toContain(A.playerId);
  });

  it("4b. six entries over the cap and the second drop fails: the first drop happened, the rest did not; a repeat leaves it, the next new entry finishes it", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const ids = await fill(rig, A.playerId, 205);
    const store = historyOf(rig);
    const real = { delete: store.delete.bind(store) };
    const order: string[] = [];
    store.delete = async (p, n) => {
      order.push(n.id);
      if (order.length === 2) throw new StorageError("history delete failed: HTTP 503");
      return real.delete(p, n);
    };
    const r = await putEntry(rig, A, entryFor("fresh-1", { finishedAt: FINISHED }));
    store.delete = real.delete;
    expect(r.status).toBe(503);
    expect(order, "the six oldest in the order slice() gives: the least old of them first").toEqual([ids[199], ids[200]]);
    expect(historyObjects(rig, A.playerId), "205 + 1 new - 1 dropped").toHaveLength(205);
    expect((await putEntry(rig, A, entryFor("fresh-1", { finishedAt: FINISHED }))).status).toBe(200);
    expect(historyObjects(rig, A.playerId)).toHaveLength(205);
    expect((await putEntry(rig, A, entryFor("fresh-2", { finishedAt: FINISHED + 1_000 }))).status).toBe(201);
    expect(historyObjects(rig, A.playerId), "back to the cap").toHaveLength(200);
  });

  it("4b. an entry listed but gone at the read (another machine's drop between the LIST and the GET) is written again as new: 201, the same object name, the count does not grow", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const ids = await fill(rig, A.playerId, 200);
    const store = historyOf(rig);
    const realGet = store.get.bind(store);
    let nulls = 1;
    store.get = async (p, n) => (n.id === ids[199] && nulls-- > 0 ? null : realGet(p, n));
    const r = await putEntry(rig, A, fillEntry(199));
    store.get = realGet;
    expect([r.status, r.json], "the oldest, as a repeat, whose object was just deleted").toEqual([201, { id: ids[199] }]);
    expect(historyObjects(rig, A.playerId)).toHaveLength(200);
    expect((await putEntry(rig, A, fillEntry(199))).status).toBe(200);
  });

  it("NOTE: in a store that holds MORE than the cap (a failed drop, a race) a new entry that lands between the 200th and the 201st newest is KEPT and the 200th newest is dropped for it (the cap keeps 'the oldest of the old list go', not 'the newest 200')", async () => {
    // Expected by 'keep the newest 200 of the 202': the new entry (rank 201) and the oldest (rank 202) go. store() drops names.slice(len - over) of the OLD list
    // and always keeps the new entry, so rank 200 goes and the new entry stays. Only a store that is already over the cap can show it; one entry's worth of history.
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    await fill(rig, A.playerId, 201);
    expect(historyObjects(rig, A.playerId)).toHaveLength(201);
    const mid = entryFor("mid-1", { finishedAt: fillEntry(199).finishedAt - 500 }); // newer than fill-200 (the oldest), older than fill-199
    expect((await putEntry(rig, A, mid)).status).toBe(201);
    const list = listedIds(await listEntries(rig, A));
    expect(list).toHaveLength(200);
    expect([list.includes("mid-1"), list.includes("fill-199"), list.includes("fill-200"), list.includes("fill-198")]).toEqual([true, false, false, true]);
    expect(list[list.length - 1], "the new entry is now the oldest the player holds").toBe("mid-1");
  });

  it("4b. strays (a foreign name, a temp file) are not entries and do not count toward the cap: 300 of them beside 199 entries, the 200th drops nothing, the 201st drops one entry and no stray", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    await fill(rig, A.playerId, 199);
    for (let i = 0; i < 150; i++) writeObject(rig, A.playerId, `junk-${i}.json`, "stray");
    for (let i = 0; i < 150; i++) writeObject(rig, A.playerId, `${nameOfEntry(fillEntry(i, BASE, "ghost"))}.tmp`, "stray");
    const strays = (): number => historyRaw(rig, A.playerId).filter((n) => parseName(n) === null).length;
    expect(strays()).toBe(300);
    expect((await putEntry(rig, A, fillEntry(199))).status).toBe(201);
    expect([historyObjects(rig, A.playerId).length, strays()]).toEqual([200, 300]);
    expect((await putEntry(rig, A, entryFor("fresh-1", { finishedAt: FINISHED }))).status).toBe(201);
    expect([historyObjects(rig, A.playerId).length, strays()], "one entry dropped, no stray").toEqual([200, 300]);
    expect(listedIds(await listEntries(rig, A))).toHaveLength(200);
  });

  if (kind === "tigris") {
    it("4b. Tigris: a DELETE that fails after its retries (the S3 client's own words) is the same 503, with the entry stored and a log line that names the operation and the status only", async () => {
      const rig = await openHistoryRig(kind);
      await rig.app.links.settleReload();
      await fill(rig, A.playerId, 200);
      theFake().failNext(3, 503, "DELETE");
      const r = await putEntry(rig, A, entryFor("fresh-1", { finishedAt: FINISHED }));
      theFake().clearFaults();
      expect(r.status).toBe(503);
      expect(historyObjects(rig, A.playerId)).toHaveLength(201);
      const lines = rig.log.filter((l) => l.startsWith("storage error:"));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^storage error: history delete failed: HTTP 503( \w+)?$/);
      expect(rig.log.join("\n")).not.toContain("history/");
    });
  }
});

// ------------------------------------------------------------------------------------------------------------------ concurrency

describe.each(KINDS)("4b. concurrency inside one machine (%s)", (kind) => {
  it("4b. six identical PUTs at once, from two keys of one player: one 201, five 200, one object (the lock is the PLAYER's, not the key's)", async () => {
    const rig = await openHistoryRig(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    const e = entryFor("same-1");
    const replies = await Promise.all([A, B, A, B, A, B].map((who) => putEntry(rig, who, e)));
    expect(replies.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 201]);
    expect(historyObjects(rig, A.playerId)).toEqual([nameOfEntry(e)]);
    expect(historyObjects(rig, B.playerId)).toEqual([]);
  });

  it("4b. ten new entries at once at 195: every one is 201, the player ends at exactly 200, and the five oldest went", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const ids = await fill(rig, A.playerId, 195);
    const fresh = Array.from({ length: 10 }, (_, i) => entryFor(`new-${i}`, { finishedAt: FINISHED + i * 1_000 }));
    const replies = await Promise.all(fresh.map((e) => putEntry(rig, A, e)));
    expect(replies.map((r) => r.status)).toEqual(Array(10).fill(201));
    const list = listedIds(await listEntries(rig, A));
    expect(list).toHaveLength(200);
    expect(list.slice(0, 10)).toEqual(fresh.map((e) => e.id).reverse());
    expect(list.slice(10)).toEqual(ids.slice(0, 190));
    expect(historyObjects(rig, A.playerId)).toHaveLength(200);
  });

  it("4b. one failed write in a queue of three does not stop the others: one 503, two 201, two objects", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const store = historyOf(rig);
    const realPut = store.put.bind(store);
    let first = true;
    store.put = async (p, n, t) => {
      if (first) {
        first = false;
        throw new StorageError("history write failed: HTTP 503");
      }
      return realPut(p, n, t);
    };
    const three = ["q-1", "q-2", "q-3"].map((id, i) => entryFor(id, { finishedAt: FINISHED - i * 1_000 }));
    const replies = await Promise.all(three.map((e) => putEntry(rig, A, e)));
    store.put = realPut;
    expect(replies.map((r) => r.status).sort()).toEqual([201, 201, 503]);
    expect(historyObjects(rig, A.playerId)).toHaveLength(2);
    // and the player is not stuck: the entry that got the 503 goes in now
    const have = listedIds(await listEntries(rig, A));
    const failed = three.filter((e) => !have.includes(e.id));
    expect(failed).toHaveLength(1);
    expect((await putEntry(rig, A, failed[0])).status).toBe(201);
    expect(historyObjects(rig, A.playerId)).toHaveLength(3);
  });

  it("4b. different players do not wait for each other: a PUT held at its write does not hold a PUT of another player", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const store = historyOf(rig);
    const realPut = store.put.bind(store);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const inPut = new Promise<void>((resolve) => (entered = resolve));
    store.put = async (p, n, t) => {
      if (p === A.playerId) {
        entered();
        await gate;
      }
      return realPut(p, n, t);
    };
    const held = putEntry(rig, A, entryFor("held-1"));
    await inPut;
    expect((await putEntry(rig, C, entryFor("other-1"))).status, "C is not blocked by A").toBe(201);
    release();
    expect((await held).status).toBe(201);
    store.put = realPut;
  });
});

// ------------------------------------------------------------------------------------------------------------------------ strays

describe.each(KINDS)("4b. strays (%s)", (kind) => {
  it("4b. another player's prefix is not this player's: a lookalike id, a player whose id starts like this one's, and an entry name planted under a deeper path are not listed or counted", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    await fill(rig, A.playerId, 3);
    await fill(rig, `${A.playerId}x`, 5, BASE, "lookalike");
    await fill(rig, A.playerId.slice(0, -1), 5, BASE, "prefix");
    writeObject(rig, `${A.playerId}/deeper`, nameOfEntry(fillEntry(0, BASE, "deep")), "x");
    expect(listedIds(await listEntries(rig, A))).toEqual(["fill-000", "fill-001", "fill-002"]);
    expect((await putEntry(rig, A, entryFor("fresh-1", { finishedAt: FINISHED }))).status).toBe(201);
    expect(listedIds(await listEntries(rig, A))).toHaveLength(4);
    expect(historyRaw(rig, `${A.playerId}x`)).toHaveLength(5);
  });

  if (kind === "jsonl") {
    it("FINDING: a leftover <name>.tmp in the file store (a crash or a full disk between the temp write and the rename) is invisible to list(), so a player's DELETE leaves it behind", async () => {
      // EXPECTED: a DELETE removes every history object of the player. FileHistoryStore.put writes <file>.tmp and renames it; if that is cut off
      // (ENOSPC mid-write, a crash) the .tmp stays, holding all or part of one entry's text. list() ignores it (finding B's rule), so dropHistory
      // (links.ts :674) and ghost-admin purge-tombstoned never see it, and history/<P>/<name>.tmp stays for ever. Tigris writes no temp object.
      // Rare (a microsecond window or a full disk) and the JSON-lines store is the dev/small deployment store, so: note / IDENT-3.
      const rig = await openHistoryRig(kind);
      await rig.app.links.settleReload();
      const kept = entryFor("keep-1");
      const cut = entryFor("cut-1", { finishedAt: FINISHED - 1_000 });
      expect((await putEntry(rig, A, kept)).status).toBe(201);
      writeObject(rig, A.playerId, `${nameOfEntry(cut)}.tmp`, encodeEntry(cut));
      expect(listedIds(await listEntries(rig, A)), "the temp file is not listed").toEqual(["keep-1"]);
      expect((await deleteMe(rig, A)).status).toBe(200);
      expect(historyObjects(rig, A.playerId), "the entries are gone").toEqual([]);
      expect(historyRaw(rig, A.playerId), "FINDING: the temp file of a cut-off write is still there").toEqual([`${nameOfEntry(cut)}.tmp`]);
      expect(readObject(rig, A.playerId, `${nameOfEntry(cut)}.tmp`)).toBe(encodeEntry(cut));
      removeObject(rig, A.playerId, `${nameOfEntry(cut)}.tmp`);
    });
  }

  it("4b. a planted object with an entry's name and any other content is listed and served as it is (404 only when it is not JSON): the server does not re-check what it stored", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    writeObject(rig, A.playerId, nameOfEntry(fillEntry(0, BASE, "plant")), '{"hack":1}');
    expect(listedIds(await listEntries(rig, A))).toEqual(["plant-000"]);
    expect((await getEntry(rig, A, "plant-000")).json).toEqual({ entry: { hack: 1 } });
    writeObject(rig, A.playerId, nameOfEntry(fillEntry(1, BASE, "plant")), "[1,2");
    expect((await getEntry(rig, A, "plant-001")).status).toBe(404);
    // a repeat of a planted id is judged against the planted bytes: a conflict
    expect((await putEntry(rig, A, fillEntry(0, BASE, "plant"))).status).toBe(409);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(allHistory(rig)).toEqual([]);
  });
});

// ----------------------------------------------------------------------------------------------------- two servers over one store

describe.each(KINDS)("4b. two machines over one store (%s): the lock is per process, so what the other machine wrote meanwhile is not seen", (kind) => {
  /** Hold this machine's PUT at its write (after its LIST), run `meanwhile` (the other machine), then let the write through. */
  async function raced(rig: Rig, who: Identity, e: HistoryEntry, meanwhile: () => void | Promise<void>): Promise<number> {
    const store = historyOf(rig);
    const realPut = store.put.bind(store);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const inPut = new Promise<void>((resolve) => (entered = resolve));
    store.put = async (p, n, t) => {
      entered();
      await gate;
      return realPut(p, n, t);
    };
    const held = putEntry(rig, who, e);
    await inPut;
    await meanwhile();
    release();
    const reply = await held;
    store.put = realPut;
    return reply.status;
  }

  it("NOTE: one id, two different entries, one on each machine: the id is listed twice; the list, the entry read and a repeat PUT then answer as below; a DELETE removes both; the cap counts both", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const others = await fill(rig, A.playerId, 197);
    const x = entryFor("dup-1", { hero: "furnace", finishedAt: FINISHED });
    const y = entryFor("dup-1", { hero: "weaver", finishedAt: BASE - 500_000 }); // the other machine's entry is also the OLDEST of the player
    expect(await raced(rig, A, x, () => writeObject(rig, A.playerId, nameOfEntry(y), encodeEntry(y))), "this machine saw no dup-1 and wrote it").toBe(201);
    expect(historyObjects(rig, A.playerId)).toHaveLength(199);
    const list = listed(await listEntries(rig, A));
    expect(list.filter((e) => e.id === "dup-1"), "READER 1, the list: the id twice, newest first").toEqual([{ id: "dup-1", finishedAt: FINISHED }, { id: "dup-1", finishedAt: y.finishedAt }]);
    expect((await getEntry(rig, A, "dup-1")).json, "READER 2, the entry read: the newest one, the other is unreachable").toEqual({ entry: JSON.parse(encodeEntry(x)) });
    expect((await putEntry(rig, A, x)).status, "READER 3, a repeat of the newest: 200").toBe(200);
    expect((await putEntry(rig, A, y)).status, "READER 3, a repeat of the other: 409 (judged against the newest), though its bytes ARE stored").toBe(409);
    expect((await putEntry(rig, A, entryFor("dup-1", { finishedAt: FINISHED - 1, hero: "bastion" }))).status, "a third version: 409, no third object").toBe(409);
    expect(historyObjects(rig, A.playerId)).toHaveLength(199);
    // the cap counts the object twice: 199 objects now; two more new ones get to 201 objects and the oldest (the stranded y) goes first
    expect((await putEntry(rig, A, entryFor("new-1", { finishedAt: FINISHED + 1_000 }))).status).toBe(201);
    expect((await putEntry(rig, A, entryFor("new-2", { finishedAt: FINISHED + 2_000 }))).status).toBe(201);
    const after = listed(await listEntries(rig, A));
    expect(after).toHaveLength(200);
    expect(after.filter((e) => e.id === "dup-1"), "the older copy was the oldest, so the cap removed it: the dup healed by itself").toEqual([{ id: "dup-1", finishedAt: FINISHED }]);
    expect(others).toHaveLength(197);
    // a DELETE removes both copies of a duplicated id
    const z = entryFor("dup-2", { hero: "furnace", finishedAt: FINISHED - 5_000 });
    const w = entryFor("dup-2", { hero: "weaver", finishedAt: FINISHED - 6_000 });
    writeObject(rig, A.playerId, nameOfEntry(z), encodeEntry(z));
    writeObject(rig, A.playerId, nameOfEntry(w), encodeEntry(w));
    expect(listed(await listEntries(rig, A)).filter((e) => e.id === "dup-2")).toHaveLength(2);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(allHistory(rig)).toEqual([]);
  });

  it("NOTE: the cap is soft across machines: both at 199 add one, the player holds 201 and a read shows 201; the next new entry brings it back to 200", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    await fill(rig, A.playerId, 199);
    const mine = entryFor("mine-1", { finishedAt: FINISHED });
    const theirs = entryFor("theirs-1", { finishedAt: FINISHED + 1_000 });
    expect(await raced(rig, A, mine, () => writeObject(rig, A.playerId, nameOfEntry(theirs), encodeEntry(theirs)))).toBe(201);
    expect(historyObjects(rig, A.playerId), "199 + the other machine's + this machine's").toHaveLength(201);
    expect(listedIds(await listEntries(rig, A)), "a reader sees 201").toHaveLength(201);
    expect((await putEntry(rig, A, entryFor("next-1", { finishedAt: FINISHED + 2_000 }))).status).toBe(201);
    expect(historyObjects(rig, A.playerId), "201 + 1 - 200 = 2 dropped").toHaveLength(200);
  });

  it("NOTE: one id, two different entries with the SAME finishing time on two machines: the object name is the same, so the later write silently replaces the earlier one; both machines answered 201", async () => {
    // 'the first write wins' holds inside one machine (the lock + the known-id check). Across machines, with a different finishing time there are two objects
    // (the test above); with the same finishing time there is ONE name and an S3 PUT replaces: the first writer was told 201 and its bytes are gone.
    // A conditional write (If-None-Match) would close both (the worker's open question 4).
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const x = entryFor("same-1", { hero: "furnace", finishedAt: FINISHED });
    const y = entryFor("same-1", { hero: "weaver", finishedAt: FINISHED });
    expect(nameOfEntry(x)).toBe(nameOfEntry(y));
    // y is written by the other machine first (during this machine's hold), x lands after it
    expect(await raced(rig, A, x, () => writeObject(rig, A.playerId, nameOfEntry(y), encodeEntry(y)))).toBe(201);
    expect(historyObjects(rig, A.playerId)).toEqual([nameOfEntry(x)]);
    expect(readObject(rig, A.playerId, nameOfEntry(x)), "the later write is the one stored").toBe(encodeEntry(x));
    expect((await putEntry(rig, A, y)).status, "the other machine's entry now conflicts with the stored one").toBe(409);
    expect((await putEntry(rig, A, x)).status).toBe(200);
  });

  it("two machines write the SAME entry (the same bytes) at once: both are 201, there is one object, a repeat is 200", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const e = entryFor("twin-1");
    expect(await raced(rig, A, e, () => writeObject(rig, A.playerId, nameOfEntry(e), encodeEntry(e)))).toBe(201);
    expect(historyObjects(rig, A.playerId)).toEqual([nameOfEntry(e)]);
    expect((await putEntry(rig, A, e)).status).toBe(200);
  });

  it("the list of a player with entries under the key's own id from before it linked: the key's list is the PLAYER's, and the cap of the player does not count the key's own prefix", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    await fill(rig, B.playerId, 3, BASE, "early");
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    await fill(rig, A.playerId, 200);
    expect(listedIds(await listEntries(rig, B))).toHaveLength(200);
    expect((await putEntry(rig, B, entryFor("fresh-1", { finishedAt: FINISHED }))).status).toBe(201);
    expect(historyObjects(rig, A.playerId)).toHaveLength(200);
    expect(historyObjects(rig, B.playerId), "the key's own earlier entries stay under its own id (finding 8)").toHaveLength(3);
    const from = markRequests(rig);
    expect((await deleteMe(rig, B)).status).toBe(200);
    expect(allHistory(rig), "the player's DELETE took the key's own prefix too").toEqual([]);
    if (kind === "tigris") expect(opsSince(rig, from, "history/").LIST, "one LIST for each of the two ids").toBe(2);
  });
});
