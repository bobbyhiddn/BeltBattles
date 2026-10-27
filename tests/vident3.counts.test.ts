// VERIFY-IDENT2 (REQ-BFG-122 clause 4), step 4c: THE REQUEST COUNTS (IDENT2-REPORT section 3), each measured at the Tigris fake: the exact requests (operation
// and key) of a new entry, a repeat, a conflict, an entry at the cap, every kind of refusal, a list read, an entry read, and the DELETE of a full player
// (392 / 592 / 593, reconciled with the 329 that FIX2 measured), a small player's DELETE, and at most 8 requests in flight.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HISTORY_PREFIX, type Identity } from "../src/net/identity";
import { HISTORY_BODY_MAX_BYTES, HISTORY_PLAYER_MAX, encodeEntry, type HistoryEntry } from "../src/net/historyWire";
import { createGhostServer } from "../server/app";
import { nameOf, parseName } from "../server/historyStore";
import type { FakeRequest } from "../tools/fakeS3";
import type { BattleRecord } from "../src/sim/battle";
import { testIdentity } from "./netIdentity";
import { startFake, tigrisFor } from "./netStores";
import { closeRigs, deleteMe, linkVia, send, signedBy, theFake } from "./identRig";
import {
  FINISHED, NOW, OPEN, bodyOfEntry, entryFor, getEntry, getSigned, historyOf, listEntries, markRequests, openHistoryRig, putBody, putEntry, recordOf, requestsSince, type Rig,
} from "./ident2Rig";

let A: Identity, B: Identity, C: Identity;
beforeAll(async () => {
  [A, B, C] = await Promise.all([0, 1, 2].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const BASE = FINISHED - 10_000;

/** A request as text, with the players' ids and the entries' times left out: "LIST history/<A>/", "PUT history/<A>/<ts>-run-1.json". */
function label(r: FakeRequest, ids: Record<string, string>): string {
  let key = r.key;
  for (const [token, id] of Object.entries(ids)) key = key.split(id).join(`<${token}>`);
  key = key.replace(/\/\d{13}-/, "/<ts>-");
  return `${r.op} ${key}`;
}
const labels = (rig: Rig, mark: number, ids: Record<string, string> = { A: A.playerId, B: B.playerId, C: C.playerId }): string[] => requestsSince(rig, mark).map((r) => label(r, ids));
/** The requests counted by "OP class": the class is the key's first segment, or the first two for links/ ("links/keys", "links/steam"); a LIST by its prefix's class. */
function byClass(reqs: FakeRequest[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of reqs) {
    const seg = r.key.split("/");
    const cls = seg[0] === "links" ? `links/${seg[1]}` : seg[0];
    const k = `${r.op} ${cls}`;
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort());
}
const byOp = (reqs: FakeRequest[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of reqs) out[r.op] = (out[r.op] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort());
};
const sum = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);
const fillEntry = (i: number, base = BASE): HistoryEntry => entryFor(`fill-${String(i).padStart(3, "0")}`, { finishedAt: base - i * 1_000 });

// ---------------------------------------------------------------------------------------------------- a PUT, and the reads: the exact requests

describe("4c. the requests of a PUT and of the reads, at the Tigris fake (exact operation and key)", () => {
  it("4c. a new entry: LIST + PUT (warm); cold: + the tombstone LIST + the key's link HEAD; a linked key's cold lookups are named; a repeat and a conflict: LIST + GET", async () => {
    const rig = await openHistoryRig("tigris");
    await rig.restart(); // cold caches
    const e1 = entryFor("run-1", { finishedAt: FINISHED });
    let mark = markRequests(rig);
    expect((await putEntry(rig, A, e1)).status).toBe(201);
    const cold = labels(rig, mark);
    console.log(`VIDENT3 4c a new entry, cold, lone key: ${JSON.stringify(cold)}`);
    expect(cold).toEqual(["LIST tombstones/", "HEAD links/keys/<A>.json", "LIST history/<A>/", "PUT history/<A>/<ts>-run-1.json"]);
    mark = markRequests(rig);
    expect((await putEntry(rig, A, entryFor("run-2", { finishedAt: FINISHED - 1_000 }))).status).toBe(201);
    expect(labels(rig, mark), "warm").toEqual(["LIST history/<A>/", "PUT history/<A>/<ts>-run-2.json"]);
    mark = markRequests(rig);
    expect((await putEntry(rig, A, e1)).status).toBe(200);
    expect(labels(rig, mark), "a repeat").toEqual(["LIST history/<A>/", "GET history/<A>/<ts>-run-1.json"]);
    mark = markRequests(rig);
    expect((await putEntry(rig, A, entryFor("run-1", { finishedAt: FINISHED, hero: "weaver" }))).status).toBe(409);
    expect(labels(rig, mark), "a conflict").toEqual(["LIST history/<A>/", "GET history/<A>/<ts>-run-1.json"]);
    mark = markRequests(rig);
    expect((await putEntry(rig, A, entryFor("run-1", { finishedAt: FINISHED - 5_000 }))).status).toBe(409);
    expect(labels(rig, mark), "a conflict with another finishing time: it reads the LISTED object, not a new name").toEqual(["LIST history/<A>/", "GET history/<A>/<ts>-run-1.json"]);
    // a linked key, cold: its link record is read (HEAD, then GET) as well
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    await rig.restart();
    mark = markRequests(rig);
    expect((await putEntry(rig, B, entryFor("run-3", { finishedAt: FINISHED - 2_000 }))).status).toBe(201);
    const linked = labels(rig, mark);
    console.log(`VIDENT3 4c a new entry, cold, linked key: ${JSON.stringify(linked)}`);
    expect(linked).toEqual(["LIST tombstones/", "HEAD links/keys/<B>.json", "GET links/keys/<B>.json", "LIST history/<A>/", "PUT history/<A>/<ts>-run-3.json"]);
    mark = markRequests(rig);
    expect((await putEntry(rig, B, entryFor("run-4", { finishedAt: FINISHED - 3_000 }))).status).toBe(201);
    expect(labels(rig, mark), "the linked key, warm").toEqual(["LIST history/<A>/", "PUT history/<A>/<ts>-run-4.json"]);
  });

  it("4c. the reads: a list is one LIST; an entry is LIST + GET; an unknown id and another player's id are one LIST and NO GET; cold: the tombstone LIST and the link HEAD first", async () => {
    const rig = await openHistoryRig("tigris");
    expect((await putEntry(rig, A, entryFor("run-1"))).status).toBe(201);
    expect((await putEntry(rig, C, entryFor("run-c"))).status).toBe(201);
    let mark = markRequests(rig);
    expect((await listEntries(rig, A)).status).toBe(200);
    expect(labels(rig, mark), "the list").toEqual(["LIST history/<A>/"]);
    mark = markRequests(rig);
    expect((await getEntry(rig, A, "run-1")).status).toBe(200);
    expect(labels(rig, mark), "an entry").toEqual(["LIST history/<A>/", "GET history/<A>/<ts>-run-1.json"]);
    mark = markRequests(rig);
    expect((await getEntry(rig, A, "run-zzz")).status).toBe(404);
    expect(labels(rig, mark), "an unknown id: the 404 costs the LIST only").toEqual(["LIST history/<A>/"]);
    mark = markRequests(rig);
    expect((await getEntry(rig, A, "run-c")).status).toBe(404);
    expect(labels(rig, mark), "another player's id: the same cost as an unknown one").toEqual(["LIST history/<A>/"]);
    await rig.restart();
    mark = markRequests(rig);
    expect((await listEntries(rig, A)).status).toBe(200);
    expect(labels(rig, mark), "the list, cold").toEqual(["LIST tombstones/", "HEAD links/keys/<A>.json", "LIST history/<A>/"]);
    mark = markRequests(rig);
    expect((await getEntry(rig, A, "run-1")).status).toBe(200);
    expect(labels(rig, mark), "an entry, warm again").toEqual(["LIST history/<A>/", "GET history/<A>/<ts>-run-1.json"]);
  });

  it("4c. at the cap: the 200th entry is LIST + PUT, the 201st LIST + PUT + DELETE of the oldest; a refusal as the oldest is LIST only; a repeat is LIST + GET; 6 over the cap is PUT + 6 DELETEs", async () => {
    const rig = await openHistoryRig("tigris");
    await rig.app.links.settleReload();
    for (let i = 0; i < 199; i++) expect((await putEntry(rig, A, fillEntry(i))).status, `entry ${i + 1}`).toBe(201);
    let mark = markRequests(rig);
    expect((await putEntry(rig, A, fillEntry(199))).status, "the 200th").toBe(201);
    expect(labels(rig, mark), "the 200th").toEqual(["LIST history/<A>/", "PUT history/<A>/<ts>-fill-199.json"]);
    mark = markRequests(rig);
    expect((await putEntry(rig, A, entryFor("fresh-201", { finishedAt: FINISHED }))).status, "the 201st").toBe(201);
    expect(labels(rig, mark), "the 201st").toEqual(["LIST history/<A>/", "PUT history/<A>/<ts>-fresh-201.json", "DELETE history/<A>/<ts>-fill-199.json"]);
    const deleted = requestsSince(rig, mark).find((r) => r.op === "DELETE")!;
    expect(parseName(deleted.key.slice(`history/${A.playerId}/`.length)), "the DELETE names the oldest entry, by its own finishing time").toEqual({ finishedAt: fillEntry(199).finishedAt, id: "fill-199" });
    mark = markRequests(rig);
    const refused = await putEntry(rig, A, fillEntry(199));
    expect(refused.status).toBe(422);
    expect(labels(rig, mark), "refused as the oldest: the LIST only, nothing written").toEqual(["LIST history/<A>/"]);
    mark = markRequests(rig);
    expect((await putEntry(rig, A, fillEntry(5))).status).toBe(200);
    expect(labels(rig, mark), "a repeat at the cap").toEqual(["LIST history/<A>/", "GET history/<A>/<ts>-fill-005.json"]);
    // 205 objects (a store another machine filled): one new entry writes once and deletes six
    const rig2 = await openHistoryRig("tigris");
    await rig2.app.links.settleReload();
    for (let i = 0; i < 205; i++) await historyOf(rig2).put(A.playerId, { finishedAt: fillEntry(i).finishedAt, id: fillEntry(i).id }, encodeEntry(fillEntry(i)));
    expect((await listEntries(rig2, A)).status).toBe(200); // A's link is looked up and cached
    mark = markRequests(rig2);
    expect((await putEntry(rig2, A, entryFor("fresh-1", { finishedAt: FINISHED }))).status).toBe(201);
    const seq = labels(rig2, mark);
    expect(seq.slice(0, 2)).toEqual(["LIST history/<A>/", "PUT history/<A>/<ts>-fresh-1.json"]);
    expect(seq.slice(2)).toEqual(["199", "200", "201", "202", "203", "204"].map((n) => `DELETE history/<A>/<ts>-fill-${n}.json`));
  });

  it("4c. a refusal before the store costs no history request, warm or cold; the ones that reach the identity lookups cost the tombstone LIST and the link HEAD, cold, and nothing warm", async () => {
    const rig = await openHistoryRig("tigris");
    expect((await putEntry(rig, A, entryFor("warm-1"))).status).toBe(201); // warm: tombstones loaded, A's link looked up
    const bad = { ...recordOf(7), wins: [1] } as unknown as BattleRecord;
    const big = new TextEncoder().encode(`{"at":${NOW},"entry":${"x".repeat(HISTORY_BODY_MAX_BYTES)}}`);
    const goodHeaders = async (body: string): Promise<Record<string, string>> => signedBy(A, body, HISTORY_PREFIX);
    const cases: [string, number, () => Promise<{ status: number }>, boolean][] = [
      ["401: no headers", 401, () => send(rig, "PUT", "/v1/history", "{}", {}), false],
      ["401: a wrong signature", 401, async () => send(rig, "PUT", "/v1/history", bodyOfEntry(entryFor("x1"), NOW), { ...(await goodHeaders("other")) }), false],
      ["413: a body over 16384 bytes", 413, async () => send(rig, "PUT", "/v1/history", big, await signedBy(A, big, HISTORY_PREFIX)), false],
      ["400: not JSON", 400, () => putBody(rig, A, "not json"), false],
      ["400: a spaced body", 400, () => putBody(rig, A, bodyOfEntry(entryFor("x2"), NOW).replace('"at":', '"at": ')), false],
      ["422: a stale at", 422, () => putEntry(rig, A, entryFor("x3"), NOW + 11 * 60_000), false],
      ["422: 100 dusk rows (a cap of the decode)", 422, () => putEntry(rig, A, entryFor("x4", { wins: 0, days: 99, dusks: Array.from({ length: 100 }, (_, i) => ({ day: i + 1, outcome: "loss" as const })) })), false],
      ["422: wins 100 (a cap)", 422, () => putEntry(rig, A, entryFor("x5", { wins: 100 })), true],
      ["422: a bad record", 422, () => putEntry(rig, A, entryFor("x6", { wins: 0, dusks: [{ day: 1, outcome: "loss", record: bad }] })), true],
    ];
    for (const [what, status, run, identity] of cases) {
      const mark = markRequests(rig);
      expect((await run()).status, what).toBe(status);
      expect(requestsSince(rig, mark), `${what}, warm: no request at all`).toEqual([]);
      void identity;
    }
    // cold: the refusals that come before the identity lookups still cost nothing; the caps and the record cost the lookups, never a history object
    await rig.restart();
    for (const [what, status, run, identity] of cases) {
      const mark = markRequests(rig);
      expect((await run()).status, what).toBe(status);
      const seq = labels(rig, mark);
      expect(seq.filter((s) => s.includes("history/")), `${what}: no history request`).toEqual([]);
      expect(seq, `${what}, cold`).toEqual(identity ? ["LIST tombstones/", "HEAD links/keys/<A>.json"] : []);
      if (identity) await rig.restart(); // the next cold one starts cold again
    }
    // the closed gate: 403 before everything, so no request even cold
    await rig.restart({ ...OPEN, uploads: "closed" });
    const mark = markRequests(rig);
    expect((await putEntry(rig, A, entryFor("x7"))).status).toBe(403);
    expect(requestsSince(rig, mark)).toEqual([]);
    // a deleted player: 410 costs the identity lookups and no history request (warm on the machine that deleted: nothing at all)
    await rig.restart(OPEN);
    expect((await deleteMe(rig, A)).status).toBe(200);
    let m2 = markRequests(rig);
    expect((await putEntry(rig, A, entryFor("x8"))).status).toBe(410);
    expect(requestsSince(rig, m2), "410 on the machine that took the DELETE: nothing").toEqual([]);
    await rig.restart(OPEN);
    m2 = markRequests(rig);
    expect((await putEntry(rig, A, entryFor("x9"))).status).toBe(410);
    const gone = labels(rig, m2);
    console.log(`VIDENT3 4c a 410 after a restart (cold): ${JSON.stringify(gone)}`);
    expect(gone.filter((s) => s.includes("history/"))).toEqual([]);
  });
});

describe("4c. the refusals of the reads", () => {
  it("4c. a read refused for its signature, its query or its `at` costs no request at all, warm or cold; a read of a deleted player costs no history request", async () => {
    const rig = await openHistoryRig("tigris");
    expect((await putEntry(rig, A, entryFor("r-1"))).status).toBe(201);
    const url = `/v1/history?at=${NOW}`;
    const cases: [string, number, () => Promise<{ status: number }>][] = [
      ["401: no headers", 401, () => send(rig, "GET", url, undefined, {})],
      ["401: the PUT's domain", 401, () => getSigned(rig, A, url, url, HISTORY_PREFIX)],
      ["400: a query that is not at=", 400, () => getSigned(rig, A, "/v1/history?x=1")],
      ["422: a stale at (the list)", 422, () => listEntries(rig, A, NOW + 11 * 60_000)],
      ["422: a stale at (an entry)", 422, () => getEntry(rig, A, "r-1", NOW - 11 * 60_000)],
    ];
    for (const [what, status, run] of cases) {
      const mark = markRequests(rig);
      expect((await run()).status, what).toBe(status);
      expect(requestsSince(rig, mark), `${what}, warm`).toEqual([]);
    }
    await rig.restart();
    for (const [what, status, run] of cases) {
      const mark = markRequests(rig);
      expect((await run()).status, what).toBe(status);
      expect(requestsSince(rig, mark), `${what}, cold: it is refused before the tombstones are read`).toEqual([]);
    }
    expect((await deleteMe(rig, A)).status).toBe(200);
    let mark = markRequests(rig);
    expect((await listEntries(rig, A)).status).toBe(410);
    expect((await getEntry(rig, A, "r-1")).status).toBe(410);
    expect(requestsSince(rig, mark), "410 on the machine that took the DELETE: nothing").toEqual([]);
    await rig.restart();
    mark = markRequests(rig);
    expect((await listEntries(rig, A)).status).toBe(410);
    expect(labels(rig, mark).filter((s) => s.includes("history/")), "410 after a restart: no history request").toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------------------------- LIST pages

describe("4c. a LIST that pages: the cap and the lookups see every page", () => {
  it("4c. at the fake's page size 7 the 200 entries are 29 LIST requests; the list read, a repeat and a new entry at the cap each pay them, and the right entry is dropped", async () => {
    const fake = await startFake({ pageSize: 7 });
    try {
      const bucket = "bb-pages";
      fake.createBucket(bucket);
      const log: string[] = [];
      const clock = { now: NOW };
      const app = createGhostServer({ log: (l) => log.push(l), now: () => clock.now, ...OPEN, store: tigrisFor(fake, bucket) });
      const base = `http://127.0.0.1:${await app.listen(0)}`;
      const rig = { base, clock, kind: "tigris", bucket, dir: "", app, log } as unknown as Rig;
      try {
        for (let i = 0; i < 200; i++) fake.putObject(bucket, `history/${A.playerId}/${nameOf({ finishedAt: fillEntry(i).finishedAt, id: fillEntry(i).id })}`, encodeEntry(fillEntry(i)));
        await app.links.settleReload();
        const lists = (from: number): number => fake.requests.slice(from).filter((r) => r.bucket === bucket && r.op === "LIST" && r.key.startsWith("history/")).length;
        let from = fake.requests.length;
        const list = await listEntries(rig, A);
        expect((list.json?.entries as unknown[]).length, "all 200, in order").toBe(200);
        expect(lists(from), "ceil(200 / 7) pages").toBe(29);
        from = fake.requests.length;
        expect((await putEntry(rig, A, fillEntry(150))).status, "a repeat found on the 22nd page").toBe(200);
        expect(lists(from)).toBe(29);
        from = fake.requests.length;
        expect((await putEntry(rig, A, entryFor("fresh-1", { finishedAt: FINISHED }))).status).toBe(201);
        expect(lists(from)).toBe(29);
        const after = ((await listEntries(rig, A)).json?.entries as { id: string }[]).map((e) => e.id);
        expect([after.length, after[0], after.includes("fill-199"), after.includes("fill-198")]).toEqual([200, "fresh-1", false, true]);
        expect((await putEntry(rig, A, fillEntry(199))).status, "the dropped one is refused: older than all").toBe(422);
        expect(HISTORY_PLAYER_MAX).toBe(200);
      } finally {
        await app.close();
      }
    } finally {
      await fake.close();
    }
  });
});

// ------------------------------------------------------------------------------------------------- the DELETE of a full player

describe("4c. the DELETE of a full player (64 linked keys, 64 Steam accounts) and of a small one, request by request", () => {
  const keysOf = (n: number): string[] => Array.from({ length: n }, (_, i) => `dev${String(i).padStart(3, "0")}${"x".repeat(30)}`);
  const steamOf = (n: number): string => `7656119800${String(n).padStart(7, "0")}`;
  const HASH = "ab".repeat(32);

  /** A full player written straight into the store: `owner` with 64 linked keys (the first of them `device`, when it signs) and 64 Steam accounts; optionally a live link code. */
  async function fullPlayer(rig: Rig, owner: Identity, device: Identity | null, liveCode: boolean): Promise<void> {
    const store = rig.app.links.store;
    const keys = device ? [device.playerId, ...keysOf(63)] : keysOf(64);
    const steam = Array.from({ length: 64 }, (_, i) => steamOf(200 + i));
    await store.put(`players/${owner.playerId}.json`, JSON.stringify({ keys, steam, at: NOW, ...(liveCode ? { code: HASH } : {}) }));
    for (const k of keys) await store.put(`links/keys/${k}.json`, JSON.stringify({ player: owner.playerId, at: NOW }));
    for (const s of steam) await store.put(`links/steam/${s}.json`, JSON.stringify({ player: owner.playerId, at: NOW }));
    if (liveCode) await store.put(`linkcodes/${HASH}.json`, JSON.stringify({ player: owner.playerId, expiresAt: NOW + 600_000 }));
  }
  async function plant(rig: Rig, n: number): Promise<void> {
    for (let i = 0; i < n; i++) await historyOf(rig).put(A.playerId, { finishedAt: fillEntry(i).finishedAt, id: fillEntry(i).id }, encodeEntry(fillEntry(i)));
  }
  /** One DELETE and the requests it made: [all, history/ ones, the rest]. */
  async function measured(rig: Rig, who: Identity): Promise<{ all: FakeRequest[]; hist: FakeRequest[]; rest: FakeRequest[] }> {
    const mark = markRequests(rig);
    expect((await deleteMe(rig, who)).status).toBe(200);
    const all = requestsSince(rig, mark);
    return { all, hist: all.filter((r) => r.key.startsWith("history/")), rest: all.filter((r) => !r.key.startsWith("history/")) };
  }

  it("4c. from the first key, first load done, no code, no history: 392 = HEAD 67, GET 65, PUT 1, DELETE 194, LIST 65 = IDENT-1's 327 + the 65 history LISTs, class by class", async () => {
    const rig = await openHistoryRig("tigris");
    await fullPlayer(rig, A, null, false);
    await rig.restart();
    await rig.app.links.settleReload();
    const { all, hist, rest } = await measured(rig, A);
    console.log(`VIDENT3 4c full DELETE, first key, warm, no history: ${JSON.stringify(byOp(all))} = ${all.length}; by class ${JSON.stringify(byClass(all))}`);
    expect(byOp(all)).toEqual({ DELETE: 194, GET: 65, HEAD: 67, LIST: 65, PUT: 1 });
    expect(all).toHaveLength(392);
    expect(byClass(hist)).toEqual({ "LIST history": 65 });
    expect(rest, "IDENT-1's part").toHaveLength(327);
    expect(byClass(rest)).toEqual({
      "DELETE links/keys": 64, "DELETE links/steam": 64, "DELETE players": 1, "DELETE profiles": 65, "GET links/steam": 64, "GET players": 1,
      "HEAD links/keys": 1, "HEAD links/steam": 64, "HEAD players": 1, "HEAD tombstones": 1, "PUT tombstones": 1,
    });
    expect(new Set(hist.map((r) => r.key)).size, "one LIST for each of the 65 ids, no id twice").toBe(65);
  }, 120_000);

  it("4c. reconciled with FIX2's 329: the same DELETE on a machine that has not loaded its tombstones yet and holds a live link code is 394 = 329 + 65: the extra two are the first load's LIST and the code's DELETE", async () => {
    const rig = await openHistoryRig("tigris");
    await fullPlayer(rig, A, null, true);
    await rig.restart(); // cold: the DELETE pays for the first load
    const { all, hist, rest } = await measured(rig, A);
    console.log(`VIDENT3 4c full DELETE, first key, COLD, live code: ${JSON.stringify(byOp(all))} = ${all.length}; by class ${JSON.stringify(byClass(all))}`);
    expect(byOp(all)).toEqual({ DELETE: 195, GET: 65, HEAD: 67, LIST: 66, PUT: 1 });
    expect(all).toHaveLength(394);
    expect(hist).toHaveLength(65);
    expect(rest).toHaveLength(329); // exactly the number FIX2-REPORT gives for this player at ident1-done
    expect(byClass(rest)["LIST tombstones"], "the first load").toBe(1);
    expect(byClass(rest)["DELETE linkcodes"], "the live code").toBe(1);
    expect(rest.filter((r) => r.key.startsWith("linkcodes/")).map((r) => `${r.op} ${r.key}`)).toEqual([`DELETE linkcodes/${HASH}.json`]);
    // and the one the previous re-check measured, "327 for the same player without a live code and with the first load already done": 329 - 2
    expect(rest.length - 2).toBe(327);
  }, 120_000);

  it("4c. with 200 history entries: 592 from the first key and 593 from a device (the device's own link is read first: HEAD + GET); 8 requests in flight at most, measured at the S3 client's fetch", async () => {
    for (const from of ["the first key", "a device"] as const) {
      const rig = await openHistoryRig("tigris");
      await fullPlayer(rig, A, from === "a device" ? B : null, false);
      await plant(rig, 200);
      // a machine of its own whose S3 client counts the requests it has in flight
      const flight = { now: 0, max: 0, total: 0, maxDuringLists: 0 };
      const counting: typeof fetch = async (input, init) => {
        flight.now++;
        flight.total++;
        flight.max = Math.max(flight.max, flight.now);
        try {
          return await fetch(input, init);
        } finally {
          flight.now--;
        }
      };
      const app = createGhostServer({ log: (l) => rig.log.push(l), now: () => rig.clock.now, ...OPEN, store: tigrisFor(theFake(), rig.bucket, {}, { fetch: counting }) });
      const base = `http://127.0.0.1:${await app.listen(0)}`;
      const machine = { base, clock: rig.clock, kind: "tigris", bucket: rig.bucket, dir: "", app, log: rig.log } as unknown as Rig;
      try {
        await app.links.settleReload();
        flight.total = 0;
        flight.max = 0;
        const { all, hist, rest } = await measured(machine, from === "a device" ? B : A);
        console.log(`VIDENT3 4c full DELETE from ${from}, warm, 200 entries: ${JSON.stringify(byOp(all))} = ${all.length}; history/: ${JSON.stringify(byOp(hist))}; the rest ${rest.length}; fetches counted ${flight.total}, most in flight ${flight.max}`);
        expect(all).toHaveLength(from === "a device" ? 593 : 592);
        expect(byOp(hist)).toEqual({ DELETE: 200, LIST: 65 });
        expect(rest).toHaveLength(from === "a device" ? 328 : 327);
        if (from === "a device") expect(byClass(rest)["GET links/keys"], "the device's own link record").toBe(1);
        expect(flight.total, "every request went through the counting fetch").toBe(all.length);
        expect(flight.max, "never more than 8 at once, and 8 at once for the LISTs and the DELETEs").toBe(8);
        expect(flight.now).toBe(0);
        expect(sum(byOp(all))).toBe(all.length);
      } finally {
        await app.close();
      }
    }
  }, 180_000);

  it("4c. a small player (two ids, six entries): 2 LISTs and 6 DELETEs on history/, named; the rest is the identity layer's few requests", async () => {
    const rig = await openHistoryRig("tigris");
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await putEntry(rig, B, fillEntry(i))).status).toBe(201);
    await historyOf(rig).put(B.playerId, { finishedAt: fillEntry(9).finishedAt, id: "own-1" }, encodeEntry(entryFor("own-1", { finishedAt: fillEntry(9).finishedAt })));
    await rig.restart();
    await rig.app.links.settleReload();
    const { all, hist, rest } = await measured(rig, B);
    console.log(`VIDENT3 4c small DELETE (2 ids, 6 entries): ${JSON.stringify(byOp(all))} = ${all.length}; by class ${JSON.stringify(byClass(all))}`);
    expect(byOp(hist)).toEqual({ DELETE: 6, LIST: 2 });
    expect(hist.filter((r) => r.op === "LIST").map((r) => r.key).sort()).toEqual([`history/${A.playerId}/`, `history/${B.playerId}/`].sort());
    expect(hist.filter((r) => r.op === "DELETE").map((r) => label(r, { A: A.playerId, B: B.playerId })).sort()).toEqual(
      [...[0, 1, 2, 3, 4].map((i) => `DELETE history/<A>/<ts>-fill-00${i}.json`), "DELETE history/<B>/<ts>-own-1.json"].sort(),
    );
    console.log(`VIDENT3 4c small DELETE, the rest: ${rest.length} requests ${JSON.stringify(byClass(rest))}`);
    expect(rest.length).toBeLessThan(20);
  });
});
