// IDENT-2 step 3 (REQ-BFG-122 clause 4; BRIEF-IDENT2): the run history on the server, through the real server in process on both backing stores (the
// JSON-lines directory, and Tigris on the in-process fake S3, where the requests are counted). PUT /v1/history stores one finished run's entry under
// the signer's CANONICAL player (a linked key's entry is its player's; a lone key's is its own), idempotent by id: new 201, the same again 200 with
// nothing written (a repeated run upload does not duplicate), a different entry for a known id 409 with nothing written (the first write wins). The
// checks run in IDENT-1's order (403, 401, 413, 400, 422, then 503/410, then the entry's caps and its records). The signed reads list a player's entries
// newest first from ONE store LIST and read one entry by id. Both are signed in their own domain over exact bytes (the PUT: the body; the GET: the path
// and the query), so a list read is no entry read and neither is anything else's.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DELETE_PREFIX, HISTORY_GET_PREFIX, HISTORY_PREFIX, KEY_HEADER, LINK_CODE_PREFIX, PROFILE_GET_PREFIX, PROFILE_PREFIX, SIG_HEADER, UPLOAD_PREFIX, type Identity,
} from "../src/net/identity";
import {
  HISTORY_AHEAD_MS, HISTORY_BODY_MAX_BYTES, HISTORY_EARLIEST_AT, HISTORY_END_SUFFIX, HISTORY_ENTRY_MAX_BYTES, HISTORY_MAX_DAYS, HISTORY_MAX_DUSKS,
  HISTORY_MAX_LIVES, HISTORY_MAX_WINS, HISTORY_PLAYER_MAX, byteLength, encodeEntry, type HistoryEntry,
} from "../src/net/historyWire";
import { nameOf } from "../server/historyStore";
import { MemoryLinkStore, type LinkStore } from "../server/linkStore";
import { StorageError } from "../server/store";
import { testIdentity } from "./netIdentity";
import { s3For, startFake } from "./netStores";
import { closeRigs, deleteMe, linkVia, putWire, send, signedBy, theFake } from "./identRig";
import { earnedWire } from "./profileupWire";
import {
  FINISHED, NOW, OPEN, allHistory, bodyOfEntry, entryFor, entrySized, getEntry, getSigned, historyObjects, historyOf, historyRaw, listEntries, listed, listedIds,
  markRequests, opsSince, openHistoryRig, putBody, putEntry, readObject, recordOf, writeObject, type Kind, type Rig,
} from "./ident2Rig";

let A: Identity, B: Identity, C: Identity, D: Identity;
beforeAll(async () => {
  [A, B, C, D] = await Promise.all([0, 1, 2, 3].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const GONE = { error: "this player was deleted" };
const nameOfEntry = (e: HistoryEntry): string => nameOf({ finishedAt: e.finishedAt, id: e.id });
const enc = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
type Obj = Record<string, unknown>;
/** The canonical entry as a plain object (to break it in one place), and the body text that carries a (possibly broken) entry as it is. */
const plain = (e: HistoryEntry): Obj => JSON.parse(encodeEntry(e)) as Obj;
const bodyOfObj = (o: unknown, at = NOW): string => `{"at":${at},"entry":${JSON.stringify(o)}}`;

/** PUT a body and check what came back, and that the store holds exactly `stored` objects afterwards. */
async function refused(rig: Rig, who: Identity, body: string | Uint8Array<ArrayBuffer>, status: number, words: string, what: string): Promise<void> {
  const before = allHistory(rig);
  const r = await putBody(rig, who, body);
  expect([r.status, String(r.json?.error ?? r.text)], what).toEqual([status, expect.stringContaining(words)]);
  expect(allHistory(rig), `${what}: nothing was written`).toEqual(before);
}

// ----------------------------------------------------------------------------------------------------------- storing

describe.each(KINDS)("PUT /v1/history stores an entry, once (%s)", (kind) => {
  it("a new entry is 201 and is stored as its canonical text; the same entry again is 200 and writes nothing: a repeated run upload does not duplicate", async () => {
    const rig = await openHistoryRig(kind);
    const e = entryFor("run-a-1");
    const name = nameOfEntry(e);
    const store = historyOf(rig);
    const calls = { put: 0, delete: 0 };
    const real = { put: store.put.bind(store), delete: store.delete.bind(store) };
    store.put = (p, n, t) => (calls.put++, real.put(p, n, t));
    store.delete = (p, n) => (calls.delete++, real.delete(p, n));
    const from = markRequests(rig);
    const first = await putEntry(rig, A, e);
    expect([first.status, first.json], first.text).toEqual([201, { id: "run-a-1" }]);
    expect(historyObjects(rig, A.playerId)).toEqual([name]);
    expect(readObject(rig, A.playerId, name)).toBe(encodeEntry(e)); // the canonical bytes, and nothing else (no key, no signature, no `at`)
    if (kind === "tigris") expect(opsSince(rig, from, "history/")).toEqual({ LIST: 1, PUT: 1 }); // a new entry: one LIST, one PUT
    expect(calls).toEqual({ put: 1, delete: 0 });
    const mark = markRequests(rig);
    for (let i = 0; i < 3; i++) {
      const again = await putEntry(rig, A, e);
      expect([again.status, again.json], `repeat ${i + 1}`).toEqual([200, { id: "run-a-1" }]);
    }
    expect(historyObjects(rig, A.playerId), "still one object").toEqual([name]);
    expect(readObject(rig, A.playerId, name)).toBe(encodeEntry(e));
    expect(calls, "the three repeats wrote and deleted nothing").toEqual({ put: 1, delete: 0 });
    if (kind === "tigris") expect(opsSince(rig, mark, "history/"), "three repeats: a LIST and a GET each, no PUT").toEqual({ LIST: 3, GET: 3 });
    store.put = real.put;
    store.delete = real.delete;
    expect(listedIds(await listEntries(rig, A))).toEqual(["run-a-1"]);
  });

  it("a different entry for a known id is 409 and nothing is written: the first write wins, also when the finishing time differs", async () => {
    const rig = await openHistoryRig(kind);
    const e = entryFor("run-a-1");
    const name = nameOfEntry(e);
    expect((await putEntry(rig, A, e)).status).toBe(201);
    const mark = markRequests(rig);
    const others: [string, HistoryEntry][] = [
      ["another hero", entryFor("run-a-1", { hero: "weaver" })],
      ["another outcome", entryFor("run-a-1", { outcome: "lost", wins: 1 })],
      ["a dusk row fewer", entryFor("run-a-1", { dusks: [{ day: 1, outcome: "win" }, { day: 2, outcome: "loss" }], wins: 1 })],
      ["a record added", entryFor("run-a-1", { dusks: [{ day: 1, outcome: "win", record: recordOf() }, { day: 2, outcome: "loss" }, { day: 3, outcome: "win" }] })],
      ["another finishing time (so another object name)", entryFor("run-a-1", { finishedAt: FINISHED - 5_000 })],
    ];
    for (const [what, other] of others) {
      const r = await putEntry(rig, A, other);
      expect([r.status, r.json], what).toEqual([409, { error: "a different entry is stored under this id" }]);
      expect(historyObjects(rig, A.playerId), `${what}: still one object`).toEqual([name]);
      expect(readObject(rig, A.playerId, name), `${what}: the first entry's bytes`).toBe(encodeEntry(e));
    }
    if (kind === "tigris") expect(opsSince(rig, mark, "history/"), "a conflict is a LIST and a GET and never a write").toEqual({ LIST: others.length, GET: others.length });
    expect(listed(await listEntries(rig, A))).toEqual([{ id: "run-a-1", finishedAt: FINISHED }]);
  });

  it("the same new entry sent six times at once is stored once: one 201 and five 200s", async () => {
    const rig = await openHistoryRig(kind);
    const e = entryFor("run-race-1");
    const replies = await Promise.all(Array.from({ length: 6 }, () => putEntry(rig, A, e)));
    expect(replies.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 201]);
    expect(historyObjects(rig, A.playerId)).toEqual([nameOfEntry(e)]);
  });

  it("two different entries for one id at once: exactly one wins (201), the same one again is 200, the other is 409; one object, the winner's bytes", async () => {
    const rig = await openHistoryRig(kind);
    const x = entryFor("run-race-2", { hero: "furnace" });
    const y = entryFor("run-race-2", { hero: "weaver", finishedAt: FINISHED - 1_000 });
    const asked = [x, y, x, y, x, y];
    const replies = await Promise.all(asked.map((e) => putEntry(rig, A, e)));
    expect(replies.filter((r) => r.status === 201)).toHaveLength(1);
    const winner = asked[replies.findIndex((r) => r.status === 201)];
    replies.forEach((r, i) => {
      if (r.status !== 201) expect(r.status, `request ${i}`).toBe(asked[i] === winner ? 200 : 409);
    });
    expect(historyObjects(rig, A.playerId)).toEqual([nameOfEntry(winner)]);
    expect(readObject(rig, A.playerId, nameOfEntry(winner))).toBe(encodeEntry(winner));
  });

  it("entries survive a restart: listed, readable, and the same entry again is 200 (not a second object)", async () => {
    const rig = await openHistoryRig(kind);
    const e1 = entryFor("run-a-1", { finishedAt: FINISHED - 2_000 });
    const e2 = entryFor("run-a-2", { finishedAt: FINISHED });
    expect((await putEntry(rig, A, e1)).status).toBe(201);
    expect((await putEntry(rig, A, e2)).status).toBe(201);
    await rig.restart();
    expect(listed(await listEntries(rig, A))).toEqual([{ id: "run-a-2", finishedAt: FINISHED }, { id: "run-a-1", finishedAt: FINISHED - 2_000 }]);
    expect((await getEntry(rig, A, "run-a-1")).json).toEqual({ entry: plain(e1) });
    expect((await putEntry(rig, A, e1)).status).toBe(200);
    expect(historyObjects(rig, A.playerId)).toHaveLength(2);
  });

  it("a linked key's entry is stored under the canonical player P and a lone key's under its own id; both keys of P read the same list; nobody reads another player's", async () => {
    const rig = await openHistoryRig(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200); // B is a device of A's player now
    const e1 = entryFor("run-b-1", { finishedAt: FINISHED - 3_000 });
    const e2 = entryFor("run-a-1", { finishedAt: FINISHED - 2_000 });
    const e3 = entryFor("run-c-1", { finishedAt: FINISHED - 1_000 });
    expect((await putEntry(rig, B, e1)).status).toBe(201); // from the linked key
    expect((await putEntry(rig, A, e2)).status).toBe(201); // from the player's first key
    expect((await putEntry(rig, C, e3)).status).toBe(201); // a lone key
    expect(historyObjects(rig, A.playerId)).toEqual([nameOfEntry(e2), nameOfEntry(e1)].sort()); // under P
    expect(historyObjects(rig, B.playerId), "nothing under the linked key's own id").toEqual([]);
    expect(historyObjects(rig, C.playerId)).toEqual([nameOfEntry(e3)]); // under its own id
    const seen = [{ id: "run-a-1", finishedAt: FINISHED - 2_000 }, { id: "run-b-1", finishedAt: FINISHED - 3_000 }];
    expect(listed(await listEntries(rig, A))).toEqual(seen);
    expect(listed(await listEntries(rig, B))).toEqual(seen); // the same list from the other key
    expect(listedIds(await listEntries(rig, C))).toEqual(["run-c-1"]);
    expect(await listEntries(rig, D), "a key that never uploaded").toMatchObject({ status: 200, json: { entries: [] } });
    expect((await getEntry(rig, B, "run-a-1")).json, "B reads the entry A stored").toEqual({ entry: plain(e2) });
    expect((await getEntry(rig, C, "run-a-1")).status, "another player's entry is unknown to C").toBe(404);
    expect((await putEntry(rig, B, e2)).status, "the same entry from another key of the player: one history, so 200").toBe(200);
    expect(historyObjects(rig, A.playerId)).toHaveLength(2);
  });

  it("NOTE: an entry stored under a key's own id before it linked stays under that id: it is not moved into the player's list", async () => {
    const rig = await openHistoryRig(kind);
    const early = entryFor("run-b-0");
    expect((await putEntry(rig, B, early)).status).toBe(201); // B was a lone key then
    expect(historyObjects(rig, B.playerId)).toEqual([nameOfEntry(early)]);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect(listedIds(await listEntries(rig, B)), "B reads its player's history now").toEqual([]);
    expect(historyObjects(rig, B.playerId), "the early entry is where it was (a DELETE or the purge removes it: ident2.delete)").toEqual([nameOfEntry(early)]);
  });

  it("an entry's records: the server's own rules' record passes checkRecord and is kept byte for byte; another rules version's is kept as it is", async () => {
    const rig = await openHistoryRig(kind);
    const foreign = { rules: "bb-0.1.0", seed: 5, builds: [{ items: "who knows" }, { hero: "nobody" }], extra: { a: [1, 2, { b: null }] } } as never;
    const e = entryFor("run-a-1", {
      dusks: [{ day: 1, outcome: "win", record: recordOf(7) }, { day: 2, outcome: "loss", record: foreign }, { day: 3, outcome: "win" }],
    });
    expect((await putEntry(rig, A, e)).status).toBe(201);
    expect(readObject(rig, A.playerId, nameOfEntry(e))).toBe(encodeEntry(e));
    const back = (await getEntry(rig, A, "run-a-1")).json as { entry: HistoryEntry };
    expect(back.entry.dusks[0].record).toEqual(recordOf(7)); // the server runs no fight and changes nothing
    expect(back.entry.dusks[1].record).toEqual(foreign);
    expect(JSON.stringify(back.entry)).toBe(encodeEntry(e));
  });

  it("a record of the server's own rules that fails checkRecord is 422 and names the dusk; the same record under another rules version is only shape-checked and kept", async () => {
    const rig = await openHistoryRig(kind);
    const good = recordOf(7);
    const brokenBuild = { ...good, builds: [{ ...good.builds[0], hero: "nobody" }, good.builds[1]] };
    const oneWins = { ...good, wins: [1] };
    for (const [what, record] of [["a build with an unknown hero", brokenBuild], ["wins that are not two integers", oneWins]] as const) {
      const e = entryFor("run-a-1", { dusks: [{ day: 1, outcome: "win" }, { day: 2, outcome: "loss", record: record as never }, { day: 3, outcome: "win" }] });
      const r = await putEntry(rig, A, e);
      expect([r.status, String(r.json?.error)], what).toEqual([422, expect.stringContaining("entry.dusks[1].record")]);
    }
    expect(allHistory(rig), "nothing was stored").toEqual([]);
    const elsewhere = entryFor("run-a-1", { dusks: [{ day: 1, outcome: "win" }, { day: 2, outcome: "loss", record: { ...brokenBuild, rules: "bb-0.11.0" } as never }, { day: 3, outcome: "win" }] });
    expect((await putEntry(rig, A, elsewhere)).status, "another rules version: kept as it is").toBe(201);
  });
});

// ------------------------------------------------------------------------------------------------------------ refusals

describe.each(KINDS)("PUT /v1/history refusals, in IDENT-1's order (%s)", (kind) => {
  it("400: a body that is not exactly {\"at\",\"entry\"} with the entry in its canonical form; nothing is written", async () => {
    const rig = await openHistoryRig(kind);
    const base = plain(entryFor("run-a-1"));
    const text = bodyOfEntry(entryFor("run-a-1"), NOW);
    const without = (k: string): Obj => Object.fromEntries(Object.entries(base).filter(([key]) => key !== k));
    const swapped = (a: string, b: string): Obj => {
      const keys = Object.keys(base);
      const ia = keys.indexOf(a), ib = keys.indexOf(b);
      [keys[ia], keys[ib]] = [keys[ib], keys[ia]];
      return Object.fromEntries(keys.map((k) => [k, base[k]]));
    };
    await refused(rig, A, new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]), 400, "not UTF-8", "bytes that are not UTF-8");
    for (const [what, body, words] of [
      ["not JSON", '{"at":', "not JSON"],
      ["a list", "[]", "expected an object"],
      ["no entry", `{"at":${NOW}}`, "expected exactly at, entry"],
      ["no at", `{"entry":${JSON.stringify(base)}}`, "expected exactly at, entry"],
      ["the two fields swapped", `{"entry":${JSON.stringify(base)},"at":${NOW}}`, "in that order"],
      ["a third field", `{"at":${NOW},"entry":${JSON.stringify(base)},"x":1}`, "expected exactly at, entry"],
      ["spaces", text.replace('"at":', '"at": '), "not in the canonical form"],
      ["a duplicate key", text.replace('{"at":', `{"at":1,"at":`), "not in the canonical form"],
      ["a number written 2.0", text.replace('"wins":2,', '"wins":2.0,'), "not in the canonical form"],
      ["a number written 2e0", text.replace('"wins":2,', '"wins":2e0,'), "not in the canonical form"],
      ["the entry null", `{"at":${NOW},"entry":null}`, "entry: expected an object"],
      ["the entry a list", `{"at":${NOW},"entry":[]}`, "entry: expected an object"],
    ] as const) await refused(rig, A, body, 400, words, what);
    for (const [what, o, words] of [
      ["an entry field missing (hearts)", without("hearts"), "entry.hearts: missing"],
      ["an entry field missing (dusks)", without("dusks"), "entry.dusks: missing"],
      ["an unknown entry field", { ...base, name: "ANN" }, "entry.name: unknown field"],
      ["a player id smuggled into the entry", { ...base, playerId: A.playerId }, "entry.playerId: unknown field"],
      ["the entry's fields in another order (wins and days swapped)", swapped("wins", "days"), "not in the canonical form"],
      ["the entry's fields in another order (id last)", { ...without("id"), id: "run-a-1" }, "not in the canonical form"],
      ["an unknown dusk field", { ...base, dusks: [{ day: 1, outcome: "win", foe: "GHOST" }] }, "entry.dusks[0].foe: unknown field"],
      ["a dusk without its outcome", { ...base, dusks: [{ day: 1 }] }, "expected day and outcome"],
      ["a dusk row that is not an object", { ...base, dusks: [7] }, "entry.dusks[0]: expected an object"],
      ["dusks that are not a list", { ...base, dusks: {} }, "entry.dusks: expected a list"],
      ["hearts as a word", { ...base, hearts: "yes" }, "entry.hearts: expected true or false"],
      ["wins as text", { ...base, wins: "2" }, "entry.wins: expected a non-negative integer"],
      ["wins negative", { ...base, wins: -1 }, "entry.wins: expected a non-negative integer"],
      ["wins fractional", { ...base, wins: 1.5 }, "entry.wins: expected a non-negative integer"],
      ["a dusk day negative", { ...base, dusks: [{ day: -1, outcome: "win" }] }, "entry.dusks[0].day"],
      ["id as a number", { ...base, id: 7 }, "entry.id: expected text"],
      ["a record that is text", { ...base, dusks: [{ day: 1, outcome: "win", record: "x" }] }, "entry.dusks[0].record: expected an object"],
      ["a record that is null", { ...base, dusks: [{ day: 1, outcome: "win", record: null }] }, "entry.dusks[0].record: expected an object"],
      ["a record that is a list", { ...base, dusks: [{ day: 1, outcome: "win", record: [] }] }, "entry.dusks[0].record: expected an object"],
      ["a record whose rules are a number", { ...base, dusks: [{ day: 1, outcome: "win", record: { rules: 12, seed: 1, builds: [{}, {}] } }] }, "record: rules: expected a rules version"],
      ["a record whose rules have a space", { ...base, dusks: [{ day: 1, outcome: "win", record: { rules: "bb 0.1", seed: 1, builds: [{}, {}] } }] }, "record: rules: expected a rules version"],
      ["a record whose seed is fractional", { ...base, dusks: [{ day: 1, outcome: "win", record: { rules: "bb-0.1.0", seed: 1.5, builds: [{}, {}] } }] }, "record: seed"],
      ["a record whose seed is negative", { ...base, dusks: [{ day: 1, outcome: "win", record: { rules: "bb-0.1.0", seed: -1, builds: [{}, {}] } }] }, "record: seed"],
      ["a record whose seed is 2^32", { ...base, dusks: [{ day: 1, outcome: "win", record: { rules: "bb-0.1.0", seed: 4_294_967_296, builds: [{}, {}] } }] }, "record: seed"],
      ["a record with one build", { ...base, dusks: [{ day: 1, outcome: "win", record: { rules: "bb-0.1.0", seed: 1, builds: [{}] } }] }, "record: builds: expected two builds"],
      ["a record whose builds are not objects", { ...base, dusks: [{ day: 1, outcome: "win", record: { rules: "bb-0.1.0", seed: 1, builds: ["a", "b"] } }] }, "record: builds: expected two builds"],
      ["a record with no seed", { ...base, dusks: [{ day: 1, outcome: "win", record: { rules: "bb-0.1.0", builds: [{}, {}] } }] }, "record: seed"],
    ] as [string, Obj, string][]) await refused(rig, A, bodyOfObj(o), 400, words, what);
    expect(allHistory(rig)).toEqual([]);
  });

  it("422: `at` more than 10 minutes from the server's clock (the bound itself passes), after the 400s: a malformed entry is 400 whatever `at` says", async () => {
    const rig = await openHistoryRig(kind);
    const e = entryFor("run-a-1");
    await refused(rig, A, bodyOfEntry(e, NOW + HISTORY_AHEAD_MS + 1), 422, "at: more than 10 minutes", "10 minutes and a millisecond ahead");
    await refused(rig, A, bodyOfEntry(e, NOW - HISTORY_AHEAD_MS - 1), 422, "at: more than 10 minutes", "10 minutes and a millisecond behind");
    await refused(rig, A, `{"at":-5,"entry":${encodeEntry(e)}}`, 422, "at: expected the client's time", "a negative at");
    await refused(rig, A, `{"at":"${NOW}","entry":${encodeEntry(e)}}`, 422, "at: expected the client's time", "at as text");
    await refused(rig, A, `{"at":1.5,"entry":${encodeEntry(e)}}`, 422, "at: expected the client's time", "a fractional at");
    await refused(rig, A, bodyOfObj({ ...plain(e), extra: 1 }, NOW + 10 * HISTORY_AHEAD_MS), 400, "unknown field", "a bad entry with a bad at");
    expect((await putEntry(rig, A, e, NOW + HISTORY_AHEAD_MS)).status, "exactly 10 minutes ahead").toBe(201);
    expect((await putEntry(rig, A, entryFor("run-a-2"), NOW - HISTORY_AHEAD_MS)).status, "exactly 10 minutes behind").toBe(201);
  });

  it("422: each plausibility cap names its field, and nothing is written", async () => {
    const rig = await openHistoryRig(kind);
    const big = (n: number): HistoryEntry["dusks"] => Array.from({ length: n }, (_, i) => ({ day: i + 1, outcome: "loss" as const }));
    const cases: [string, Partial<HistoryEntry>, string][] = [
      ["a kind that is no kind", { kind: "weekly" as never }, "entry.kind"],
      ["an outcome that is no outcome", { outcome: "tied" as never }, "entry.outcome"],
      ["a run that is over (an endless outcome)", { outcome: "over" }, "entry.outcome"],
      ["an endless that is won (a run outcome)", { kind: "endless", id: `run-a-1${HISTORY_END_SUFFIX}`, outcome: "won" }, "entry.outcome"],
      ["an endless that is lost", { kind: "endless", id: `run-a-1${HISTORY_END_SUFFIX}`, outcome: "lost" }, "entry.outcome"],
      ["a run id with a space", { runId: "run a", id: "run a" }, "entry.runId"],
      ["a run id with a dot", { runId: "run.a", id: "run.a" }, "entry.runId"],
      ["a run id of 65 characters", { runId: "r".repeat(65), id: "r".repeat(65) }, "entry.runId"],
      ["an empty run id", { runId: "", id: "" }, "entry.runId"],
      ["a run whose run id ends in the endless suffix", { runId: `x${HISTORY_END_SUFFIX}`, id: `x${HISTORY_END_SUFFIX}` }, "entry.runId"],
      ["a run whose id is not its run id", { id: "other" }, "entry.id"],
      ["an endless whose id is its bare run id", { kind: "endless", outcome: "over", id: "run-a-1" }, "entry.id"],
      ["an endless whose id is another run's", { kind: "endless", outcome: "over", id: `other${HISTORY_END_SUFFIX}` }, "entry.id"],
      ["an endless entry id past 64 characters", { kind: "endless", outcome: "over", runId: "r".repeat(60), id: `${"r".repeat(60)}${HISTORY_END_SUFFIX}` }, "entry.id"],
      ["rules with a space", { rules: "bb 0.12" }, "entry.rules"],
      ["rules of 33 characters", { rules: "b".repeat(33) }, "entry.rules"],
      ["no rules", { rules: "" }, "entry.rules"],
      ["a hero in capitals", { hero: "FURNACE" }, "entry.hero"],
      ["a hero of 25 characters", { hero: "h".repeat(25) }, "entry.hero"],
      ["no hero", { hero: "" }, "entry.hero"],
      ["a hero with a space", { hero: "iron lady" }, "entry.hero"],
      [`wins past ${HISTORY_MAX_WINS}`, { wins: HISTORY_MAX_WINS + 1 }, "entry.wins"],
      ["days 0", { days: 0 }, "entry.days"],
      [`days past ${HISTORY_MAX_DAYS}`, { days: HISTORY_MAX_DAYS + 1 }, "entry.days"],
      [`lives past ${HISTORY_MAX_LIVES}`, { lives: HISTORY_MAX_LIVES + 1 }, "entry.lives"],
      [`more than ${HISTORY_MAX_DUSKS} dusk rows`, { dusks: big(HISTORY_MAX_DUSKS + 1), days: HISTORY_MAX_DAYS, wins: 0 }, "entry.dusks"],
      ["more wins than dusk rows", { wins: 4 }, "entry.wins"],
      ["a dusk outcome that is no outcome", { dusks: [{ day: 1, outcome: "tie" as never }], wins: 0 }, "entry.dusks[0].outcome"],
      ["a dusk on day 0", { dusks: [{ day: 0, outcome: "win" }], wins: 1 }, "entry.dusks[0].day"],
      ["a dusk past the last day reached", { dusks: [{ day: 1, outcome: "win" }, { day: 4, outcome: "win" }], wins: 2 }, "entry.dusks[1].day"],
      ["dusk days that go back", { dusks: [{ day: 2, outcome: "win" }, { day: 1, outcome: "win" }], wins: 2 }, "entry.dusks[1].day"],
      ["a dusk day twice", { dusks: [{ day: 2, outcome: "win" }, { day: 2, outcome: "loss" }], wins: 1 }, "entry.dusks[1].day"],
      ["a finishing time before 2026-01-01", { finishedAt: HISTORY_EARLIEST_AT - 1 }, "entry.finishedAt"],
      ["a finishing time of 0", { finishedAt: 0 }, "entry.finishedAt"],
      ["a finishing time a millisecond past the server's clock and the bound", { finishedAt: NOW + HISTORY_AHEAD_MS + 1 }, "entry.finishedAt"],
      ["a finishing time in the year 2200", { finishedAt: Date.UTC(2200, 0, 1) }, "entry.finishedAt"],
    ];
    for (const [what, over, field] of cases) {
      const r = await putEntry(rig, A, entryFor("run-a-1", over));
      expect([r.status, String(r.json?.error)], what).toEqual([422, expect.stringContaining(field)]);
    }
    expect(allHistory(rig), "nothing was stored").toEqual([]);
    // and the edges themselves pass
    const edges: [string, Partial<HistoryEntry>][] = [
      [`wins ${HISTORY_MAX_WINS} and ${HISTORY_MAX_DUSKS} dusk rows`, { wins: HISTORY_MAX_DUSKS, days: HISTORY_MAX_DAYS, lives: HISTORY_MAX_LIVES, dusks: big(HISTORY_MAX_DUSKS).map((d) => ({ ...d, outcome: "win" as const })) }],
      ["the earliest finishing time", { runId: "edge-2", id: "edge-2", finishedAt: HISTORY_EARLIEST_AT }],
      ["exactly the server's clock and the bound", { runId: "edge-3", id: "edge-3", finishedAt: NOW + HISTORY_AHEAD_MS }],
      ["an endless entry with the longest id", { kind: "endless", outcome: "over", runId: "r".repeat(56), id: `${"r".repeat(56)}${HISTORY_END_SUFFIX}` }],
      ["an abandoned run with no dusk row", { runId: "edge-5", id: "edge-5", outcome: "abandoned", wins: 0, dusks: [], days: 1, lives: 0 }],
    ];
    for (const [what, over] of edges) {
      const r = await putEntry(rig, A, entryFor("edge-1", over));
      expect([r.status, r.text], what).toEqual([201, expect.any(String)]);
    }
  });

  it("422: an entry of 16000 bytes passes and 16001 is refused; a body over 16384 bytes is 413 (the body is unsigned or signed: only the signed one is read)", async () => {
    const rig = await openHistoryRig(kind);
    expect(HISTORY_ENTRY_MAX_BYTES).toBe(16_000);
    expect(HISTORY_BODY_MAX_BYTES).toBe(16_384);
    const exact = entrySized("run-a-1", HISTORY_ENTRY_MAX_BYTES);
    expect(byteLength(encodeEntry(exact))).toBe(16_000);
    const ok = await putEntry(rig, A, exact);
    expect([ok.status, ok.text]).toEqual([201, '{"id":"run-a-1"}']);
    const over = await putEntry(rig, A, entrySized("run-a-2", HISTORY_ENTRY_MAX_BYTES + 1));
    expect([over.status, String(over.json?.error)]).toEqual([422, "entry: 16001 bytes is over 16000"]);
    // a body of exactly 16384 bytes is read (and refused for what it is); one byte more is 413 before it is read
    const limit = `{"at":${NOW},"entry":${"x".repeat(HISTORY_BODY_MAX_BYTES - `{"at":${NOW},"entry":}`.length)}}`;
    expect(byteLength(limit)).toBe(HISTORY_BODY_MAX_BYTES);
    expect((await putBody(rig, A, limit)).status).toBe(400); // read, and not an entry
    const tooBig = await putBody(rig, A, `${limit}x`);
    expect([tooBig.status, tooBig.json]).toEqual([413, { error: "request body over 16384 bytes" }]);
    const huge = await putEntry(rig, A, entrySized("run-a-3", 16_500));
    expect(huge.status, "an entry whose body passes 16384 bytes").toBe(413);
    // unsigned and huge: the header check comes first and the body is not read
    const unsigned = await send(rig, "PUT", "/v1/history", "x".repeat(20_000), { "content-type": "application/json" });
    expect(unsigned.status).toBe(401);
    expect(historyObjects(rig, A.playerId)).toEqual([nameOfEntry(exact)]);
  });

  it("401: no headers, a malformed key or signature, another key's signature, another domain's signature, other bytes; none of them stores anything or reads the body", async () => {
    const rig = await openHistoryRig(kind);
    const e = entryFor("run-a-1");
    const body = bodyOfEntry(e, NOW);
    const good = await signedBy(A, body, HISTORY_PREFIX);
    const send401 = async (what: string, headers: Record<string, string>, text = body): Promise<void> => {
      const r = await send(rig, "PUT", "/v1/history", text, headers);
      expect(r.status, `${what}: ${r.text}`).toBe(401);
    };
    await send401("no headers", { "content-type": "application/json" });
    await send401("no signature", { [KEY_HEADER]: good[KEY_HEADER] });
    await send401("no key", { [SIG_HEADER]: good[SIG_HEADER] });
    await send401("a key that is no key", { ...good, [KEY_HEADER]: "AAAA" });
    await send401("a signature that is no signature", { ...good, [SIG_HEADER]: "AAAA" });
    await send401("B's signature under A's key", { ...good, [SIG_HEADER]: (await signedBy(B, body, HISTORY_PREFIX))[SIG_HEADER] });
    await send401("a signature over other bytes (at + 1)", good, bodyOfEntry(e, NOW + 1));
    await send401("a signature over the body and one more byte", good, `${body} `);
    const reply = await send(rig, "PUT", "/v1/history", body, { ...good, [SIG_HEADER]: "AAAA" });
    expect(String(reply.json?.error)).toContain("x-bb-sig");
    // the same bytes signed in every other domain
    for (const [what, domain] of [["the ghost upload", UPLOAD_PREFIX], ["the profile upload", PROFILE_PREFIX], ["the delete", DELETE_PREFIX], ["the history read", HISTORY_GET_PREFIX], ["the link code", LINK_CODE_PREFIX]] as const) {
      const r = await putBody(rig, A, body, domain);
      expect([r.status, String(r.json?.error)], `signed in ${what}'s domain`).toEqual([401, "x-bb-sig: the signature does not match this body and key"]);
    }
    expect(allHistory(rig)).toEqual([]);
    expect((await putBody(rig, A, body)).status, "and the right domain passes").toBe(201);
  });

  it("a history signature passes no other route: the same signed bytes are 401 at the profile, the ghosts, the delete and the link routes, and nothing is deleted", async () => {
    const rig = await openHistoryRig(kind);
    expect((await putEntry(rig, A, entryFor("run-a-1"))).status).toBe(201);
    const body = JSON.stringify({ at: NOW });
    const headers = await signedBy(A, body, HISTORY_PREFIX);
    for (const [method, path] of [["PUT", "/v1/profile"], ["POST", "/v1/ghosts"], ["DELETE", "/v1/player"], ["POST", "/v1/link/code"], ["POST", "/v1/link/redeem"]] as const) {
      const r = await send(rig, method, path, body, headers);
      expect(r.status, `${method} ${path}`).toBe(401);
    }
    expect(rig.app.links.isGone(A.playerId), "the history signature deleted nobody").toBe(false);
    expect(historyObjects(rig, A.playerId)).toHaveLength(1);
    // and the other way: a profile-read style signature over the history list text is no history read
    expect((await getSigned(rig, A, `/v1/history?at=${NOW}`, `at=${NOW}`, PROFILE_GET_PREFIX)).status).toBe(401);
  });

  it("403 while uploads are closed, before anything is read (an unsigned body too); the reads still work and a repeat of a stored entry is refused too", async () => {
    const rig = await openHistoryRig(kind);
    const e = entryFor("run-a-1");
    expect((await putEntry(rig, A, e)).status).toBe(201);
    await rig.restart({ ...OPEN, uploads: "closed" });
    const closed = { error: "uploads are not open yet" };
    expect(await send(rig, "PUT", "/v1/history", "x".repeat(20_000))).toMatchObject({ status: 403, json: closed }); // not even the headers are looked at
    expect(await putEntry(rig, A, entryFor("run-a-2"))).toMatchObject({ status: 403, json: closed });
    expect(await putEntry(rig, A, e), "the entry that is stored already").toMatchObject({ status: 403, json: closed });
    expect(allHistory(rig)).toHaveLength(1);
    expect(listed(await listEntries(rig, A))).toEqual([{ id: "run-a-1", finishedAt: FINISHED }]); // a player can always read their history back
    expect((await getEntry(rig, A, "run-a-1")).json).toEqual({ entry: plain(e) });
  });

  it("the other methods are 405: only PUT stores and only GET reads", async () => {
    const rig = await openHistoryRig(kind);
    for (const method of ["POST", "DELETE", "PATCH"] as const) {
      const r = await send(rig, method, "/v1/history", "{}", await signedBy(A, "{}", HISTORY_PREFIX));
      expect([r.status, r.json], method).toEqual([405, { error: "use PUT" }]);
    }
  });

  it("410 for a deleted player's keys, after the shape (400) and `at` (422) checks and before the caps: nothing is stored and nothing is re-created", async () => {
    const rig = await openHistoryRig(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await putEntry(rig, B, entryFor("run-a-1"))).status).toBe(201);
    expect((await deleteMe(rig, A)).status).toBe(200);
    for (const who of [A, B]) {
      const tag = who === A ? "the player's own key" : "a linked key";
      expect(await putEntry(rig, who, entryFor("run-a-1")), tag).toMatchObject({ status: 410, json: GONE });
      expect(await putEntry(rig, who, entryFor("run-a-9")), `${tag}, a new entry`).toMatchObject({ status: 410, json: GONE });
      expect(await putEntry(rig, who, entryFor("run-a-8", { wins: 99 + 1 })), `${tag}: a cap-breaking entry is 410, the cap comes after`).toMatchObject({ status: 410, json: GONE });
      expect((await putBody(rig, who, bodyOfObj({ nope: 1 }))).status, `${tag}: a malformed entry is still 400`).toBe(400);
      expect((await putEntry(rig, who, entryFor("run-a-7"), NOW + 11 * 60_000)).status, `${tag}: a stale at is still 422`).toBe(422);
      expect(await listEntries(rig, who), `${tag}: list`).toMatchObject({ status: 410, json: GONE });
      expect(await getEntry(rig, who, "run-a-1"), `${tag}: entry`).toMatchObject({ status: 410, json: GONE });
    }
    expect(allHistory(rig), "the delete removed the history and the refused writes created none").toEqual([]);
    // a key that is nobody's is unaffected
    expect((await putEntry(rig, C, entryFor("run-c-1"))).status).toBe(201);
  });
});

// ------------------------------------------------------------------------------------------------------------- the reads

describe.each(KINDS)("GET /v1/history (%s)", (kind) => {
  it("the list is the player's entries NEWEST FIRST from one store LIST and no entry read; ties by id; an empty player is an empty list", async () => {
    const rig = await openHistoryRig(kind);
    const at = (i: number): number => FINISHED - i * 1_000;
    // stored in no particular order, two with the same finishing time
    const mine: [string, number][] = [["e-3", at(3)], ["e-0", at(0)], ["e-b", at(2)], ["e-a", at(2)], ["e-1", at(1)], ["e-4", at(4)]];
    for (const [id, t] of mine) expect((await putEntry(rig, A, entryFor(id, { finishedAt: t }))).status).toBe(201);
    const from = markRequests(rig);
    const r = await listEntries(rig, A);
    expect(r.status, r.text).toBe(200);
    expect(listed(r)).toEqual([
      { id: "e-0", finishedAt: at(0) }, { id: "e-1", finishedAt: at(1) }, { id: "e-a", finishedAt: at(2) }, { id: "e-b", finishedAt: at(2) },
      { id: "e-3", finishedAt: at(3) }, { id: "e-4", finishedAt: at(4) },
    ]);
    expect(Object.keys(r.json ?? {})).toEqual(["entries"]);
    if (kind === "tigris") expect(opsSince(rig, from, "history/"), "one LIST and not one read per entry").toEqual({ LIST: 1 });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await listEntries(rig, C)).toMatchObject({ status: 200, json: { entries: [] } });
  });

  it("an entry is read by id: the entry as stored, one LIST and one GET; an unknown id and another player's id are 404", async () => {
    const rig = await openHistoryRig(kind);
    const e = entryFor("run-a-1", { dusks: [{ day: 1, outcome: "win", record: recordOf() }, { day: 2, outcome: "loss" }, { day: 3, outcome: "win" }] });
    expect((await putEntry(rig, A, e)).status).toBe(201);
    expect((await putEntry(rig, C, entryFor("run-c-1"))).status).toBe(201);
    const from = markRequests(rig);
    const r = await getEntry(rig, A, "run-a-1");
    expect([r.status, r.text]).toEqual([200, `{"entry":${encodeEntry(e)}}`]); // the stored canonical bytes, in an envelope
    if (kind === "tigris") expect(opsSince(rig, from, "history/"), "one LIST, one GET").toEqual({ LIST: 1, GET: 1 });
    for (const [what, id] of [["an unknown id", "run-zzz"], ["the endless id of a run with none", `run-a-1${HISTORY_END_SUFFIX}`], ["another player's id", "run-c-1"]] as const) {
      expect(await getEntry(rig, A, id), what).toMatchObject({ status: 404, json: { error: "no such entry" } });
    }
  });

  it("a list signature is no entry signature and the other way round: the signed text is the exact path and query", async () => {
    const rig = await openHistoryRig(kind);
    expect((await putEntry(rig, A, entryFor("run-a-1"))).status).toBe(201);
    const listUrl = `/v1/history?at=${NOW}`, entryUrl = `/v1/history?at=${NOW}&id=run-a-1`;
    expect((await getSigned(rig, A, entryUrl, listUrl)).status, "the list's signature on the entry URL").toBe(401);
    expect((await getSigned(rig, A, listUrl, entryUrl)).status, "the entry's signature on the list URL").toBe(401);
    expect((await getSigned(rig, A, `/v1/history?at=${NOW}&id=run-a-2`, entryUrl)).status, "the signature of another id").toBe(401);
    expect((await getSigned(rig, A, `/v1/history?at=${NOW + 1}`, listUrl)).status, "the signature of another at").toBe(401);
    expect((await getSigned(rig, A, listUrl, `at=${NOW}`)).status, "the profile read's text (no path)").toBe(401);
    expect((await getSigned(rig, A, listUrl, listUrl, HISTORY_PREFIX)).status, "the upload domain").toBe(401);
    expect((await getSigned(rig, A, listUrl, listUrl, PROFILE_PREFIX)).status, "the profile domain").toBe(401);
    expect((await getSigned(rig, B, listUrl, listUrl)).status, "B's signature under B's key passes for B (an empty list)").toBe(200);
    const noKey = await send(rig, "GET", listUrl, undefined, {});
    expect([noKey.status, String(noKey.json?.error)]).toEqual([401, expect.stringContaining("unsigned upload")]);
    expect((await getSigned(rig, A, listUrl)).status).toBe(200);
    expect((await getSigned(rig, A, entryUrl)).status).toBe(200);
  });

  it("400 for a query that is not exactly at=<digits> with an optional &id=<entry id> (each signed as sent), 422 for an `at` out of the window", async () => {
    const rig = await openHistoryRig(kind);
    const bad: [string, string][] = [
      ["no query at all", "/v1/history"],
      ["at that is no number", "/v1/history?at=abc"],
      ["at with a sign", "/v1/history?at=-5"],
      ["at of 17 digits", `/v1/history?at=${"1".repeat(17)}`],
      ["an extra parameter", `/v1/history?at=${NOW}&x=1`],
      ["the id first", `/v1/history?id=run-a-1&at=${NOW}`],
      ["an id with no value", `/v1/history?at=${NOW}&id=`],
      ["an id of 65 characters", `/v1/history?at=${NOW}&id=${"i".repeat(65)}`],
      ["an id with a dot", `/v1/history?at=${NOW}&id=run.a`],
      ["an id with an escape", `/v1/history?at=${NOW}&id=run%2Fa`],
      ["a second id", `/v1/history?at=${NOW}&id=a&id=b`],
    ];
    for (const [what, url] of bad) {
      const r = await getSigned(rig, A, url);
      expect([r.status, String(r.json?.error)], what).toEqual([400, expect.stringContaining("query: expected exactly at=<milliseconds>")]);
    }
    for (const at of [NOW + HISTORY_AHEAD_MS + 1, NOW - HISTORY_AHEAD_MS - 1]) {
      expect(await listEntries(rig, A, at), `at ${at - NOW}`).toMatchObject({ status: 422, json: { error: expect.stringContaining("at: more than 10 minutes") } });
      expect((await getEntry(rig, A, "run-a-1", at)).status).toBe(422);
    }
    expect((await listEntries(rig, A, NOW + HISTORY_AHEAD_MS)).status, "the bound itself").toBe(200);
    expect((await listEntries(rig, A, NOW - HISTORY_AHEAD_MS)).status).toBe(200);
  });

  it("the reads are the player's: a deleted player's list and entry reads are 410, also with uploads closed", async () => {
    const rig = await openHistoryRig(kind);
    expect((await putEntry(rig, A, entryFor("run-a-1"))).status).toBe(201);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(await listEntries(rig, A)).toMatchObject({ status: 410, json: GONE });
    await rig.restart({ ...OPEN, uploads: "closed" });
    expect(await listEntries(rig, A), "after a restart, with uploads closed").toMatchObject({ status: 410, json: GONE });
    expect(await getEntry(rig, A, "run-a-1")).toMatchObject({ status: 410, json: GONE });
  });
});

// ------------------------------------------------------------------------------------------------ the store misbehaves

/** A LinkStore over memory whose list fails on demand: the tombstones cannot be read. */
function flaky(): { store: LinkStore; fail: { list: number } } {
  const inner = new MemoryLinkStore();
  const fail = { list: 0 };
  const store: LinkStore = {
    get: (k) => inner.get(k), put: (k, t) => inner.put(k, t), delete: (k) => inner.delete(k),
    list: async (p) => {
      if (fail.list > 0) {
        fail.list--;
        throw new StorageError("identity list failed: HTTP 503");
      }
      return inner.list(p);
    },
  };
  return { store, fail };
}

describe.each(KINDS)("503 when storage cannot answer (%s)", (kind) => {
  it("the tombstones cannot be read: the PUT and both reads are 503 with retry-after, nothing is stored; the next request works", async () => {
    const { store, fail } = flaky();
    const rig = await openHistoryRig(kind, { linkStore: store });
    fail.list = 3;
    const e = entryFor("run-a-1");
    const put = await putEntry(rig, A, e);
    expect([put.status, put.json]).toEqual([503, { error: "ghost storage unavailable, try again shortly" }]);
    expect(put.headers.get("retry-after")).toBe("5");
    expect(allHistory(rig)).toEqual([]);
    expect((await listEntries(rig, A)).status).toBe(503);
    expect((await getEntry(rig, A, "run-a-1")).status).toBe(503);
    expect((await putEntry(rig, A, e)).status, "the fourth request reads the tombstones").toBe(201);
    expect(rig.log.filter((l) => l.startsWith("storage error: identity list failed"))).toHaveLength(3);
  });

  it("the history store fails: 503 for the PUT (nothing half-written) and for the reads, and the entry goes in once it works again", async () => {
    const rig = await openHistoryRig(kind);
    const store = historyOf(rig);
    const real = { list: store.list.bind(store), put: store.put.bind(store), get: store.get.bind(store) };
    const e = entryFor("run-a-1");
    expect((await putEntry(rig, A, entryFor("run-a-0", { finishedAt: FINISHED - 9_000 }))).status).toBe(201);
    const down = async (): Promise<never> => {
      throw new StorageError("history list failed: HTTP 503");
    };
    store.list = down;
    expect((await putEntry(rig, A, e)).status, "list down: the PUT").toBe(503);
    expect((await listEntries(rig, A)).status, "list down: the list read").toBe(503);
    store.list = real.list;
    store.put = async () => {
      throw new StorageError("history write failed: HTTP 503");
    };
    expect((await putEntry(rig, A, e)).status, "write down: the PUT").toBe(503);
    store.put = real.put;
    expect(historyObjects(rig, A.playerId), "nothing but the first entry").toHaveLength(1);
    store.get = async () => {
      throw new StorageError("history read failed: HTTP 503");
    };
    expect((await getEntry(rig, A, "run-a-0")).status, "read down: the entry read").toBe(503);
    expect((await putEntry(rig, A, entryFor("run-a-0", { finishedAt: FINISHED - 9_000 }))).status, "read down: a repeat needs the stored bytes").toBe(503);
    store.get = real.get;
    expect((await putEntry(rig, A, e)).status).toBe(201);
    expect(historyObjects(rig, A.playerId)).toHaveLength(2);
    const lines = rig.log.filter((l) => l.startsWith("storage error: history"));
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(rig.log.join("\n")).not.toContain(A.playerId);
  });

});

describe("503 on Tigris: the S3 client's own words", () => {
  it("a failing S3 PUT is a 503 whose log line names the operation and the status, never the key; the entry goes in once S3 answers again", async () => {
    const rig = await openHistoryRig("tigris");
    theFake().failNext(6, 503, "PUT");
    const r = await putEntry(rig, A, entryFor("run-a-1"));
    theFake().clearFaults();
    expect(r.status).toBe(503);
    expect(allHistory(rig)).toEqual([]);
    const line = rig.log.find((l) => l.startsWith("storage error: history write failed"));
    expect(line, rig.log.join("\n")).toBeDefined();
    expect(line).toMatch(/HTTP 503/);
    expect(rig.log.join("\n")).not.toContain("run-a-1");
    expect(rig.log.join("\n")).not.toContain("history/");
    expect((await putEntry(rig, A, entryFor("run-a-1"))).status).toBe(201);
  });

  it("the S3 client's retry and error lines show a history object as history/*: no player id, no entry id, no time", async () => {
    const fake = await startFake();
    try {
      fake.createBucket("bb-mask-1");
      const lines: string[] = [];
      const s3 = s3For(fake, "bb-mask-1", { log: (l) => lines.push(l) });
      const key = `history/${A.playerId}/${nameOf({ finishedAt: FINISHED, id: "secret-run-1" })}`;
      fake.failNext(1, 503, "PUT");
      await s3.put(key, "x"); // one retry, then through
      fake.failNext(1, 503, "GET");
      expect(await s3.getText(key)).toBe("x");
      fake.failNext(3, 503, "PUT");
      let error = "";
      await s3.put(key, "y").catch((e: Error) => (error = e.message));
      fake.failNext(3, 503, "LIST");
      await s3.listAll(`history/${A.playerId}/`).catch((e: Error) => (error += ` | ${e.message}`));
      fake.clearFaults();
      expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(2);
      const all = `${lines.join("\n")}\n${error}`;
      expect(all).toContain("history/*");
      for (const secret of [A.playerId, "secret-run-1", String(9_999_999_999_999 - FINISHED)]) expect(all, `holds ${secret}`).not.toContain(secret);
    } finally {
      await fake.close();
    }
  });

  it("what a PUT costs at the Tigris fake: a new entry is a LIST and a PUT, a repeat or a conflict a LIST and a GET, a read of the list one LIST; the identity lookups come once", async () => {
    const rig = await openHistoryRig("tigris");
    await rig.restart(); // cold caches
    const all = (from: number) => opsSince(rig, from);
    let from = markRequests(rig);
    expect((await putEntry(rig, A, entryFor("run-a-1"))).status).toBe(201);
    const cold = all(from);
    console.log(`IDENT2 a new entry, cold caches, requests at the Tigris fake: ${JSON.stringify(cold)}; the history/ ones: ${JSON.stringify(opsSince(rig, from, "history/"))}`);
    expect(cold, "cold: the tombstones' LIST, the key's link HEAD, the history LIST and PUT").toEqual({ LIST: 2, HEAD: 1, PUT: 1 });
    from = markRequests(rig);
    expect((await putEntry(rig, A, entryFor("run-a-2", { finishedAt: FINISHED - 1_000 }))).status).toBe(201);
    expect(all(from), "a new entry, warm: a LIST and a PUT").toEqual({ LIST: 1, PUT: 1 });
    from = markRequests(rig);
    expect((await putEntry(rig, A, entryFor("run-a-2", { finishedAt: FINISHED - 1_000 }))).status).toBe(200);
    expect(all(from), "a repeat, warm: a LIST and a GET").toEqual({ LIST: 1, GET: 1 });
    from = markRequests(rig);
    expect((await putEntry(rig, A, entryFor("run-a-2", { finishedAt: FINISHED - 1_000, hero: "weaver" }))).status).toBe(409);
    expect(all(from), "a conflict, warm: a LIST and a GET").toEqual({ LIST: 1, GET: 1 });
    from = markRequests(rig);
    expect((await listEntries(rig, A)).status).toBe(200);
    expect(all(from), "the list read, warm: one LIST").toEqual({ LIST: 1 });
    from = markRequests(rig);
    expect((await getEntry(rig, A, "run-a-1")).status).toBe(200);
    expect(all(from), "an entry read, warm: a LIST and a GET").toEqual({ LIST: 1, GET: 1 });
    // a refusal before the store costs no history request at all (a cap, a 400)
    from = markRequests(rig);
    await putEntry(rig, A, entryFor("run-a-3", { wins: 50 }));
    await putBody(rig, A, "not json");
    expect(opsSince(rig, from, "history/"), "refusals before the store touch no history object").toEqual({});
  });
});

// ----------------------------------------------------------------------------------------------- what the log shows

describe.each(KINDS)("the request log and the headers (%s)", (kind) => {
  it("the log prints the method and the path only: no entry id, no player id, no query, no object name", async () => {
    const rig = await openHistoryRig(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    const ids = ["secret-run-1", "secret-run-2"];
    for (const id of ids) expect((await putEntry(rig, B, entryFor(id, { finishedAt: FINISHED - ids.indexOf(id) * 1_000 }))).status).toBe(201);
    await putEntry(rig, B, entryFor("secret-run-1"));
    await listEntries(rig, A);
    await getEntry(rig, A, "secret-run-2");
    await getEntry(rig, A, "secret-missing");
    await putBody(rig, A, "not json");
    await getSigned(rig, A, `/v1/history?at=${NOW}&x=secret-run-1`);
    const text = rig.log.filter((l) => !l.startsWith("ghost store ")).join("\n"); // (the start-up line names the data file, ghosts.jsonl)
    for (const secret of [...ids, "secret-missing", A.playerId, B.playerId, "at=", "id=", "?", "history/", ".json"]) expect(text, `the log holds "${secret}"`).not.toContain(secret);
    const mine = rig.log.filter((l) => l.includes("/v1/history"));
    expect(mine).toHaveLength(8);
    for (const l of mine) expect(l, l).toMatch(/^\S+ (PUT|GET) \/v1\/history \d{3} \d+ms$/);
  });

  it("CORS: the preflight of /v1/history lists GET, POST, PUT, OPTIONS and the headers it always did; /v1/player still lists DELETE only; the real replies echo the origin", async () => {
    const SHORE = "https://shore.example";
    const rig = await openHistoryRig(kind, { origins: [SHORE] });
    const pre = (path: string, method: string, origin = SHORE) =>
      fetch(`${rig.base}${path}`, { method: "OPTIONS", headers: { origin, "access-control-request-method": method, "access-control-request-headers": "content-type,x-bb-key,x-bb-sig" } });
    for (const [path, method] of [["/v1/history", "PUT"], ["/v1/history?at=1", "GET"]] as const) {
      const r = await pre(path, method);
      expect([r.status, path]).toEqual([204, path]);
      expect(r.headers.get("access-control-allow-origin"), path).toBe(SHORE);
      expect(r.headers.get("access-control-allow-methods"), path).toBe("GET, POST, PUT, OPTIONS");
      expect(r.headers.get("access-control-allow-headers"), path).toBe("content-type, x-bb-key, x-bb-sig");
      expect(r.headers.get("access-control-max-age"), path).toBe("600");
    }
    expect((await pre("/v1/player", "DELETE")).headers.get("access-control-allow-methods")).toBe("DELETE, OPTIONS");
    expect((await pre("/v1/profile", "PUT")).headers.get("access-control-allow-methods")).toBe("GET, POST, PUT, OPTIONS");
    expect((await pre("/v1/history", "PUT", "https://elsewhere.example")).status, "an origin that is not configured").toBe(403);
    const body = bodyOfEntry(entryFor("run-a-1"), NOW);
    const put = await send(rig, "PUT", "/v1/history", body, { ...(await signedBy(A, body, HISTORY_PREFIX)), origin: SHORE });
    expect([put.status, put.headers.get("access-control-allow-origin")]).toEqual([201, SHORE]);
    const url = `/v1/history?at=${NOW}`;
    const read = await send(rig, "GET", url, undefined, { ...(await signedBy(A, url, HISTORY_GET_PREFIX)), origin: SHORE });
    expect([read.status, read.headers.get("access-control-allow-origin")]).toEqual([200, SHORE]);
  });
});

// ------------------------------------------------------------------------------ finding B: a store reads its own names only

describe.each(KINDS)("strays in the history store are not entries (%s)", (kind) => {
  it("names the store does not write are left out of the list and break nothing; an object that is no entry reads as 404 with a log line that holds no id", async () => {
    const rig = await openHistoryRig(kind);
    const e = entryFor("run-a-1");
    expect((await putEntry(rig, A, e)).status).toBe(201);
    const real = nameOfEntry(e);
    const strays = [
      "junk.json", "x.json.tmp", `${real}.tmp`, "123-abc.json", "00000000000001-abc.json", "0000000000001-.json", `0000000000001-${"i".repeat(65)}.json`,
      "0000000000001-a b.json", "0000000000001-a.txt", "README", ".json",
    ];
    for (const name of strays) writeObject(rig, A.playerId, name, "stray");
    writeObject(rig, `${A.playerId}/nested`, "0000000000001-nested.json", "stray"); // a deeper key, with an entry's name in it
    expect(historyRaw(rig, A.playerId).length).toBeGreaterThan(strays.length);
    const r = await listEntries(rig, A);
    expect([r.status, listed(r)], r.text).toEqual([200, [{ id: "run-a-1", finishedAt: FINISHED }]]);
    expect((await putEntry(rig, A, entryFor("run-a-2", { finishedAt: FINISHED - 1_000 }))).status, "a new entry beside the strays").toBe(201);
    expect((await putEntry(rig, A, e)).status).toBe(200);
    // an object that has an entry's name but is not an entry: listed (the list reads names only), 404 on the read, and said without its id
    writeObject(rig, A.playerId, nameOfEntry(entryFor("run-bad", { finishedAt: FINISHED - 5_000 })), "this is not json");
    expect(listedIds(await listEntries(rig, A))).toEqual(["run-a-1", "run-a-2", "run-bad"]);
    expect(await getEntry(rig, A, "run-bad")).toMatchObject({ status: 404, json: { error: "no such entry" } });
    expect(rig.log.filter((l) => l.includes("skipping an unreadable entry"))).toEqual(["history store: skipping an unreadable entry"]);
    expect(rig.log.join("\n")).not.toContain("run-bad");
    expect(rig.log.filter((l) => l.includes(" 500 ")), "no 500 anywhere").toEqual([]);
    // a stray under another player's prefix is that player's business
    expect(listedIds(await listEntries(rig, C))).toEqual([]);
  });
});

// -------------------------------------------------------------------------- the cap per player, and what a request costs

describe.each(KINDS)("the cap of 200 entries is per player, the newest always get in (%s)", (kind) => {
  const at = (i: number): number => FINISHED - 10_000 - i * 1_000; // entry i is older than entry i-1; i = 0 is the newest of the filled 200

  async function filled(rig: Rig, who: Identity, n: number): Promise<string[]> {
    const store = historyOf(rig);
    const names: string[] = [];
    for (let i = 0; i < n; i++) {
      const e = entryFor(`fill-${String(i).padStart(3, "0")}`, { finishedAt: at(i) });
      await store.put(who.playerId, { finishedAt: e.finishedAt, id: e.id }, encodeEntry(e));
      names.push(e.id);
    }
    return names;
  }

  it(`at ${HISTORY_PLAYER_MAX} entries a newer one is 201 and the OLDEST by finishing time is dropped, never the new one; the list never passes ${HISTORY_PLAYER_MAX}`, async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const ids = await filled(rig, A, HISTORY_PLAYER_MAX);
    expect(historyObjects(rig, A.playerId)).toHaveLength(200);
    expect(listedIds(await listEntries(rig, A))).toHaveLength(200);
    const oldest = ids[199];
    // a repeat, a conflict and a refused old entry change nothing at the cap
    expect((await putEntry(rig, A, entryFor(ids[5], { finishedAt: at(5) }))).status, "a repeat at the cap").toBe(200);
    expect((await putEntry(rig, A, entryFor(ids[5], { finishedAt: at(5), hero: "weaver" }))).status, "a conflict at the cap").toBe(409);
    expect(historyObjects(rig, A.playerId)).toHaveLength(200);
    // older than all 200: refused, nothing dropped
    const tooOld = await putEntry(rig, A, entryFor("fill-old", { finishedAt: at(200) }));
    expect([tooOld.status, tooOld.json]).toEqual([422, { error: "history: this player already holds 200 entries, all newer than this one" }]);
    expect(historyObjects(rig, A.playerId)).toHaveLength(200);
    expect(listedIds(await listEntries(rig, A))).toContain(oldest);
    // as old as the oldest, with an id that sorts after it: also the oldest, also refused; one that sorts before it gets in
    expect((await putEntry(rig, A, entryFor("zzz-same-time", { finishedAt: at(199) }))).status, "the same finishing time, a later id").toBe(422);
    // newer than the oldest: in, and the oldest out (one LIST, one PUT, one DELETE)
    const from = markRequests(rig);
    const newest = await putEntry(rig, A, entryFor("fill-new", { finishedAt: FINISHED }));
    expect([newest.status, newest.json]).toEqual([201, { id: "fill-new" }]);
    if (kind === "tigris") expect(opsSince(rig, from, "history/"), "a new entry at the cap: LIST, PUT, DELETE").toEqual({ LIST: 1, PUT: 1, DELETE: 1 });
    const after = listedIds(await listEntries(rig, A));
    expect(after).toHaveLength(200);
    expect(after[0], "the new entry is the newest").toBe("fill-new");
    expect(after).not.toContain(oldest);
    expect(after).toContain(ids[198]);
    expect(historyObjects(rig, A.playerId)).toHaveLength(200);
    // an entry that is in the middle of the 200 gets in and the then-oldest goes
    expect((await putEntry(rig, A, entryFor("fill-mid", { finishedAt: at(100) - 1 }))).status).toBe(201);
    const mid = listedIds(await listEntries(rig, A));
    expect(mid).toHaveLength(200);
    expect(mid).toContain("fill-mid");
    expect(mid).not.toContain(ids[198]);
    // another player has a cap of his own
    expect((await putEntry(rig, C, entryFor("c-1"))).status).toBe(201);
    expect(listedIds(await listEntries(rig, C))).toEqual(["c-1"]);
  });

  it("a store that holds more than the cap (another machine raced) is brought back to it by the next new entry", async () => {
    const rig = await openHistoryRig(kind);
    await filled(rig, A, 205);
    expect(historyObjects(rig, A.playerId)).toHaveLength(205);
    expect((await putEntry(rig, A, entryFor("fill-new", { finishedAt: FINISHED }))).status).toBe(201);
    expect(historyObjects(rig, A.playerId), "205 + 1 - 200 = 6 dropped, the oldest six").toHaveLength(200);
    const kept = listedIds(await listEntries(rig, A));
    expect(kept[0]).toBe("fill-new");
    expect(kept).not.toContain("fill-204");
    expect(kept).not.toContain("fill-199");
    expect(kept).toContain("fill-198");
  });

});

// ------------------------------------------------------------------------------ two machines over one store (best effort)

describe.each(KINDS)("two machines over one store racing one id (%s)", (kind) => {
  it("NOTE: the per-player lock is per process, so two machines that race one id with different entries can both store it; the list then names the id twice, a repeat PUT is judged against the newest one, and a third object never appears", async () => {
    const rig = await openHistoryRig(kind);
    await rig.app.links.settleReload();
    const x = entryFor("run-race-3", { hero: "furnace", finishedAt: FINISHED });
    const y = entryFor("run-race-3", { hero: "weaver", finishedAt: FINISHED - 1_000 });
    // this machine has listed (nothing there) and is held at its write; the other machine stores its entry meanwhile (written straight into
    // the store: the route's lock is in this process, and a second server of the test's would queue behind the held request)
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const inPut = new Promise<void>((resolve) => (entered = resolve));
    const first = historyOf(rig);
    const realPut = first.put.bind(first);
    first.put = async (p, n, t) => {
      entered();
      await gate;
      return realPut(p, n, t);
    };
    const held = putEntry(rig, A, x);
    await inPut;
    writeObject(rig, A.playerId, nameOfEntry(y), encodeEntry(y));
    release();
    const firstReply = await held;
    first.put = realPut;
    expect(firstReply.status, "this machine saw no entry and wrote one").toBe(201);
    expect(historyObjects(rig, A.playerId)).toHaveLength(2);
    expect(listed(await listEntries(rig, A)), "the same id twice, newest first").toEqual([{ id: "run-race-3", finishedAt: FINISHED }, { id: "run-race-3", finishedAt: FINISHED - 1_000 }]);
    expect((await getEntry(rig, A, "run-race-3")).json, "the entry read answers the newest").toEqual({ entry: plain(x) });
    expect((await putEntry(rig, A, x)).status, "a repeat of the newest is 200").toBe(200);
    expect((await putEntry(rig, A, y)).status, "a repeat of the other is judged against the newest: 409").toBe(409);
    expect(historyObjects(rig, A.playerId), "and no third object").toHaveLength(2);
  });
});

// -------------------------------------------------------------------------- the same story with the profile in the mix

describe.each(KINDS)("history and the profile do not touch each other (%s)", (kind) => {
  it("an entry upload does not change the player's profile record and a profile upload does not change the history", async () => {
    const rig = await openHistoryRig(kind);
    expect((await putWire(rig, earnedWire({ runs: 3 }), A)).status).toBe(200);
    const before = allHistory(rig);
    expect(before).toEqual([]);
    expect((await putEntry(rig, A, entryFor("run-a-1"))).status).toBe(201);
    expect((await putWire(rig, earnedWire({ runs: 4 }), A)).status).toBe(200);
    expect(allHistory(rig)).toHaveLength(1);
    expect(listedIds(await listEntries(rig, A))).toEqual(["run-a-1"]);
  });
});
