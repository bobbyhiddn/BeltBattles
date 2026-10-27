// VERIFY-IDENT2 (REQ-BFG-122 clause 4), helper H-D, step 4 item d: the run-history SYNC (src/net/historySync.ts, historyClient.ts) attacked.
// tests/ident2.sync.test.ts is the worker's; this file does not repeat it. It asks, for every reply a server (or a proxy, or the network) can give, what
// becomes of the entry (sent, refused for good, or kept) and whether a trigger goes on; whether an entry can be stuck or sent forever; the serial queue;
// the stamp; the 410; the hang; and how long the "second device sees the full history" takes with the 10-a-sync bound and the hourly gate.
// Tests named "FINDING:" pin a defect as it is today (the comment says what it should do); "NOTE:" is worth knowing. Both stores where a server is used.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HISTORY_KEY, readHistory, recordRunEnd, resetHistoryWarning, unsentFor, writeHistory, type LocalEntry } from "../src/game/history";
import { PROFILE_KEY } from "../src/game/profile";
import { setSession } from "../src/game/session";
import { loadIdentity } from "../src/net/identity";
import { MIRROR_JWK, MIRROR_LINK, memoryMirror } from "../src/net/identityMirror";
import { redeemLinkCode, requestLinkCode } from "../src/net/linkClient";
import { LINK_KEY, readLink, writeLink } from "../src/net/linkState";
import {
  HISTORY_DOWNLOADS_PER_SYNC, HISTORY_SYNC_INTERVAL_MS, HISTORY_UPLOADS_PER_TRIGGER, historyIdle, historyRunEnded, resetHistorySync, startupHistorySync, syncHistory,
  type HistorySyncDeps, type HistorySyncStatus,
} from "../src/net/historySync";
import { HISTORY_LOCAL_MAX } from "../src/net/historyWire";
import { closeRigs, deleteMe, type Kind, type Rig } from "./identRig";
import { OPEN, historyObjects, openHistoryRig } from "./ident2Rig";
import { device, entryOf, mem, playedRun, type Device } from "./ident2Local";
import { NOW } from "./profileupWire";
import { HEROES, type HeroId } from "../src/sim/content";

vi.setConfig({ testTimeout: 20_000 }); // a test that hangs costs 20 s, not the runner's 60 s
afterAll(closeRigs);
beforeEach(() => {
  resetHistorySync();
  resetHistoryWarning();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setSession(null);
});

// ------------------------------------------------------------------------------------------------------------------------------ helpers

const held = (d: Device) => readHistory(d.store).state.entries;
const ids = (d: Device) => held(d).map((l) => l.entry.id);
const sentTo = (d: Device, id: string) => held(d).find((l) => l.entry.id === id)?.sentTo;

/** Mark a device linked to `player` (default: to itself, as SHOW MY CODE leaves it). */
function link(d: Device, player: string = d.id.keyId!): void {
  writeLink({ v: 1, player, key: d.id.keyId!, at: NOW }, d.store);
}

/** `n` finished runs on a device, ids `<tag><i>-1-1` (i = 0 the OLDEST), finished from t0 on, a second apart. */
function play(d: Device, n: number, tag: string, t0: number, records = false): void {
  for (let i = 0; i < n; i++) recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: `${tag}${i}-1-1`, records }), { store: d.store, now: () => t0 + i * 1000 });
}

/** A linked (to itself) fixed-key device holding `n` unsent runs. */
async function linkedWith(keyN: number, n: number, tag: string): Promise<Device> {
  const d = await device(keyN);
  link(d);
  play(d, n, tag, NOW - 100_000);
  return d;
}

interface Call {
  n: number;
  kind: "PUT" | "LIST" | "READ";
  /** The entry id: in the body of a PUT, in the query of a READ; null for a LIST. */
  id: string | null;
}
type Handler = (c: Call, init: RequestInit | undefined) => Response | Promise<Response>;

/** A fetch that answers as `h` says and records what it was asked. No real network. */
function scripted(h: Handler) {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const kind: Call["kind"] = (init?.method ?? "GET") === "PUT" ? "PUT" : u.search.includes("&id=") ? "READ" : "LIST";
    const id = kind === "PUT" ? (JSON.parse(new TextDecoder().decode(init!.body as Uint8Array)) as { entry: { id: string } }).entry.id : kind === "READ" ? u.searchParams.get("id") : null;
    const c: Call = { n: calls.length + 1, kind, id };
    calls.push(c);
    return h(c, init);
  }) as typeof fetch;
  return { f, calls, ofKind: (k: Call["kind"]) => calls.filter((c) => c.kind === k) };
}

const words = (status: number, error: string, headers: Record<string, string> = {}) => new Response(JSON.stringify({ error }), { status, headers });
const page = (status: number) => new Response("<html><body>a proxy's page</body></html>", { status, headers: { "content-type": "text/html" } });
const empty = (status: number) => new Response(null, { status });
const ok = (status: 200 | 201, id: string) => new Response(JSON.stringify({ id }), { status });
const jsonOf = (status: number, o: unknown) => new Response(JSON.stringify(o), { status });
/** A request that never answers; it rejects the way fetch does when its AbortSignal fires. */
const hang = (init: RequestInit | undefined): Promise<Response> =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })));
  });

let seq = 0;
/** A fresh scripted "server" address each time, so no test sees another's stopped set. */
const nextBase = () => `http://scripted.example/${++seq}`;

const deps = (d: Device, f: typeof fetch, over: Partial<HistorySyncDeps> = {}): HistorySyncDeps => ({ store: d.store, now: () => NOW, fetch: f, timeoutMs: 40, mirror: null, keyStore: d.keys, ...over });

// ------------------------------------------------------------------------------------------------------------------ 4d-1: the upload table

interface Row {
  name: string;
  reply: Handler;
  /** sent: marked, counted sent. refused: marked, counted refused. kept: unmarked, tried again at the next trigger (unless `ends`). */
  fate: "sent" | "refused" | "kept";
  /** The status doSync returns. */
  status: HistorySyncStatus;
  /** No request follows in this page load (404, 405) or at all (410 forgets the link). */
  ends?: "stopped" | "gone";
}

const SERVER_409 = "a different entry is stored under this id";
const ROWS: Row[] = [
  { name: "201 {id}: stored", reply: (c) => ok(201, c.id!), fate: "sent", status: "ok" },
  { name: "200 {id}: the same entry again", reply: (c) => ok(200, c.id!), fate: "sent", status: "ok" },
  { name: "409 with the server's words", reply: () => words(409, SERVER_409), fate: "sent", status: "ok" },
  { name: "409 bodiless (a proxy)", reply: () => empty(409), fate: "kept", status: "failed" },
  { name: "409 with a page", reply: () => page(409), fate: "kept", status: "failed" },
  { name: "200 {} (no matching id)", reply: () => jsonOf(200, {}), fate: "kept", status: "failed" },
  { name: "200 naming another id", reply: () => ok(200, "somebody-elses-1-1"), fate: "kept", status: "failed" },
  { name: "200 with a page", reply: () => page(200), fate: "kept", status: "failed" },
  { name: "201 {} (no matching id)", reply: () => jsonOf(201, {}), fate: "kept", status: "failed" },
  { name: "202 {id}", reply: (c) => new Response(JSON.stringify({ id: c.id }), { status: 202 }), fate: "kept", status: "failed" },
  { name: "204 (no content)", reply: () => empty(204), fate: "kept", status: "failed" },
  { name: "400 with a page (a proxy)", reply: () => page(400), fate: "kept", status: "failed" },
  { name: "400 JSON without words", reply: () => jsonOf(400, { message: "x" }), fate: "kept", status: "failed" },
  { name: "400 with the server's words", reply: () => words(400, "entry.hearts: expected true or false"), fate: "refused", status: "ok" },
  { name: "413 with the server's words", reply: () => words(413, "request body over 16384 bytes"), fate: "refused", status: "ok" },
  { name: "413 with a page (a proxy)", reply: () => page(413), fate: "kept", status: "failed" },
  { name: "422 with the server's words (a cap)", reply: () => words(422, "entry.wins: 100 is over the ceiling 99"), fate: "refused", status: "ok" },
  { name: "422 the 200-entry cap's words", reply: () => words(422, "history: this player already holds 200 entries, all newer than this one"), fate: "refused", status: "ok" },
  { name: "422 about the clock (at:)", reply: () => words(422, "at: more than 10 minutes from the server's clock"), fate: "kept", status: "failed" },
  { name: "422 bodiless", reply: () => empty(422), fate: "kept", status: "failed" },
  { name: "401 with the server's words", reply: () => words(401, "unsigned upload: the x-bb-key and x-bb-sig headers are required"), fate: "kept", status: "failed" },
  { name: "401 bodiless", reply: () => empty(401), fate: "kept", status: "failed" },
  { name: "403 uploads closed (words)", reply: () => words(403, "uploads are not open yet"), fate: "kept", status: "ok" },
  { name: "403 a proxy's page", reply: () => page(403), fate: "kept", status: "ok" },
  { name: "404 not found", reply: () => words(404, "not found"), fate: "kept", status: "stopped", ends: "stopped" },
  { name: "404 a page", reply: () => page(404), fate: "kept", status: "stopped", ends: "stopped" },
  { name: "405 use PUT", reply: () => words(405, "use PUT"), fate: "kept", status: "stopped", ends: "stopped" },
  { name: "410 this player was deleted", reply: () => words(410, "this player was deleted"), fate: "kept", status: "gone", ends: "gone" },
  { name: "429 rate limit (retry-after 30)", reply: () => words(429, "rate limit exceeded, slow down", { "retry-after": "30" }), fate: "kept", status: "failed" },
  { name: "500 internal error", reply: () => words(500, "internal error"), fate: "kept", status: "failed" },
  { name: "502 a page", reply: () => page(502), fate: "kept", status: "failed" },
  { name: "503 storage unavailable (retry-after 5)", reply: () => words(503, "ghost storage unavailable, try again shortly", { "retry-after": "5" }), fate: "kept", status: "failed" },
  { name: "418 another 4xx with words", reply: () => words(418, "teapot"), fate: "kept", status: "failed" },
  { name: "a network error", reply: () => Promise.reject(new TypeError("fetch failed")), fate: "kept", status: "failed" },
  { name: "no answer at all (the timeout)", reply: (_c, init) => hang(init), fate: "kept", status: "failed" },
  {
    name: "the headers, then a body that never ends (the timeout)",
    reply: (_c, init) => new Response(new ReadableStream({ start(ctl) { init?.signal?.addEventListener("abort", () => ctl.error(Object.assign(new Error("aborted"), { name: "AbortError" }))); } }), { status: 201 }),
    fate: "kept", status: "failed",
  },
];

describe("4d. every reply to a PUT: sent, refused for good, or kept", () => {
  it.each(ROWS)("4d. PUT $name", async (row) => {
    const A = await linkedWith(0, 2, "t"); // t1 is the newest, t0 older
    const srv = scripted(row.reply);
    const base = nextBase();
    const dep = deps(A, srv.f, row.status === "gone" ? { mirror: memoryMirror() } : {});
    const before = A.store.getItem(HISTORY_KEY);
    const first = await syncHistory(base, A.id, dep, { download: false });
    expect(first.status).toBe(row.status);
    const marked = (id: string) => sentTo(A, id) === A.id.playerId;
    if (row.fate === "kept") {
      expect(marked("t1-1-1") || marked("t0-1-1")).toBe(false);
      expect(first.sent + first.refused).toBe(0);
      expect(srv.calls.map((c) => c.id)).toEqual(["t1-1-1"]); // the trigger ended at the newest entry: the older one was not even tried
      expect(A.store.getItem(HISTORY_KEY)).toBe(before); // nothing in the local history moved
    } else {
      expect(marked("t1-1-1") && marked("t0-1-1")).toBe(true);
      expect(srv.calls.map((c) => c.id)).toEqual(["t1-1-1", "t0-1-1"]); // the trigger went on to the older entry
      expect(row.fate === "sent" ? first.sent : first.refused).toBe(2);
      expect(row.fate === "sent" ? first.refused : first.sent).toBe(0);
    }
    // the next trigger
    const n = srv.calls.length;
    const second = await syncHistory(base, A.id, dep, { download: false });
    if (row.fate !== "kept") {
      expect(srv.calls).toHaveLength(n); // sent or refused: never sent again
      expect(second.status).toBe("ok");
    } else if (row.ends) {
      expect(srv.calls).toHaveLength(n); // 404, 405: no request in this page load; 410: no link record, so no request
      expect(second.status).toBe("skipped");
    } else {
      expect(srv.calls).toHaveLength(n + 1); // kept: the newest entry is tried again at the next trigger (and the older one is still behind it)
      expect(srv.calls[n].id).toBe("t1-1-1");
    }
    if (row.ends === "stopped") {
      // the startup sync and a link trigger are stopped as well; a new page load tries again
      expect((await startupHistorySync(base, A.id, dep)).status).toBe("skipped");
      expect(srv.calls).toHaveLength(n);
      resetHistorySync();
      await syncHistory(base, A.id, dep, { download: false });
      expect(srv.calls).toHaveLength(n + 1);
    }
    if (row.ends === "gone") {
      // forgetDeletedPlayer, exactly: the link record is dropped (the mirror's copies and the key store with it), the local history and the profile stay
      expect(readLink(A.store)).toBeNull();
      expect(A.store.getItem(HISTORY_KEY)).toBe(before);
      expect(await A.keys.get()).toBeNull();
      expect(first.sent).toBe(0);
    }
  });
});

describe("4d. the upload queue: what a stuck entry does to the entries behind it", () => {
  it("NOTE: an entry answered with a keep-verdict every time (here a 500 for that one entry) blocks every older entry behind it for good: one request per trigger, nothing else sent", async () => {
    // Expected by the brief ("no entry a linked device can never send"): not reached in a normal flow, because no normal reply is a per-entry 5xx; but a
    // poison entry at the head is retried first at every trigger and the loop returns at it (historySync.ts :131), so the 3 older ones wait for ever.
    const A = await linkedWith(0, 4, "p"); // p3 is the newest
    const srv = scripted((c) => (c.id === "p3-1-1" ? words(500, "internal error") : ok(201, c.id!)));
    const base = nextBase();
    for (let i = 0; i < 5; i++) expect((await syncHistory(base, A.id, deps(A, srv.f), { download: false })).status).toBe("failed");
    expect(srv.calls.map((c) => c.id)).toEqual(Array(5).fill("p3-1-1"));
    expect(unsentFor(A.id.playerId, A.store).map((e) => e.id)).toEqual(["p3-1-1", "p2-1-1", "p1-1-1", "p0-1-1"]);
  });

  it("NOTE: a poison entry in the middle lets the newer ones go and holds the older ones", async () => {
    const A = await linkedWith(0, 5, "m"); // m4 newest .. m0
    const srv = scripted((c) => (c.id === "m2-1-1" ? page(502) : ok(201, c.id!)));
    const base = nextBase();
    await syncHistory(base, A.id, deps(A, srv.f), { download: false });
    await syncHistory(base, A.id, deps(A, srv.f), { download: false });
    expect(srv.calls.map((c) => c.id)).toEqual(["m4-1-1", "m3-1-1", "m2-1-1", "m2-1-1"]);
    expect(unsentFor(A.id.playerId, A.store).map((e) => e.id)).toEqual(["m2-1-1", "m1-1-1", "m0-1-1"]);
  });

  it("a refused entry (the server's 4xx words) does not hold the ones behind it; the trigger sends the next 10 and no more", async () => {
    const A = await linkedWith(0, 14, "r");
    const srv = scripted((c) => (c.id === "r13-1-1" ? words(422, "entry.wins: 100 is over the ceiling 99") : ok(201, c.id!)));
    const base = nextBase();
    const a = await syncHistory(base, A.id, deps(A, srv.f), { download: false });
    expect(HISTORY_UPLOADS_PER_TRIGGER).toBe(10);
    expect(srv.calls).toHaveLength(10); // the bound counts attempts: the refused one used a place
    expect(a).toMatchObject({ sent: 9, refused: 1 });
    const b = await syncHistory(base, A.id, deps(A, srv.f), { download: false });
    expect(b.sent).toBe(4);
    expect(unsentFor(A.id.playerId, A.store)).toHaveLength(0);
    expect(srv.calls).toHaveLength(14); // every entry exactly once
  });

  it("an entry is sent once to each player: a join sends the whole list again to the new player (10 a trigger), a downloaded one never; going back sends it to the first player again", async () => {
    const A = await linkedWith(0, 3, "j");
    // two entries downloaded from the first player: never sent to anybody
    const state = readHistory(A.store).state;
    state.entries.push({ entry: entryOf("dl1-1-1", {}, NOW - 500_000), down: true }, { entry: entryOf("dl2-1-1", {}, NOW - 600_000), down: true });
    writeHistory(state, A.store);
    const srv = scripted((c) => ok(201, c.id!));
    const base = nextBase();
    link(A, "player-one");
    await syncHistory(base, A.id, deps(A, srv.f), { download: false });
    expect(srv.calls.map((c) => c.id).sort()).toEqual(["j0-1-1", "j1-1-1", "j2-1-1"]);
    link(A, "player-two"); // a join: the record names another player
    await syncHistory(base, A.id, deps(A, srv.f), { download: false });
    expect(srv.calls).toHaveLength(6); // sent again, to the new player
    expect(srv.calls.every((c) => !c.id!.startsWith("dl"))).toBe(true);
    expect(held(A).filter((l) => l.sentTo === "player-two")).toHaveLength(3);
    link(A, "player-one"); // and back
    await syncHistory(base, A.id, deps(A, srv.f), { download: false });
    expect(srv.calls).toHaveLength(9); // NOTE: "at most once" holds for the current player only; the server answers 200 (the same bytes) so nothing is written twice
    expect(held(A).filter((l) => l.down).every((l) => l.sentTo === undefined)).toBe(true);
  });

  it("NOTE: a storage that takes the history but refuses the marks (full): the entries are sent again at every trigger and the hourly stamp is never kept", async () => {
    // Expected: none of this in a normal flow (a full localStorage); the failure is the write of `sentTo` and `syncedAt`, both longer than the value the
    // store accepted last. markSent and stampSynced swallow it, so the entry is 'unsent' for ever: every trigger sends the (up to 10) entries again.
    const seed = await linkedWith(0, 3, "q");
    const size = seed.store.getItem(HISTORY_KEY)!.length;
    const tight = mem({ max: size });
    tight.setItem(LINK_KEY, seed.store.getItem(LINK_KEY)!);
    tight.setItem(HISTORY_KEY, seed.store.getItem(HISTORY_KEY)!);
    const A: Device = { ...seed, store: tight };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const srv = scripted((c) => (c.kind === "PUT" ? ok(200, c.id!) : jsonOf(200, { entries: [] })));
    const base = nextBase();
    for (let i = 0; i < 3; i++) expect((await syncHistory(base, A.id, deps(A, srv.f))).sent).toBe(3);
    expect(srv.ofKind("PUT")).toHaveLength(9); // 3 entries x 3 triggers: never marked
    expect(unsentFor(A.id.playerId, tight)).toHaveLength(3);
    expect(readHistory(tight).state.syncedAt).toBeUndefined();
    // so the startup gate never closes: every page load syncs
    const lists = srv.ofKind("LIST").length;
    await startupHistorySync(base, A.id, deps(A, srv.f));
    await startupHistorySync(base, A.id, deps(A, srv.f));
    expect(srv.ofKind("LIST")).toHaveLength(lists + 2);
    expect(warn).toHaveBeenCalledTimes(1); // logged once a page load
  });
});

// ---------------------------------------------------------------------------------------------------------------- 4d-2: the download table

describe("4d. every reply to a list read or an entry read: what is merged, whether the sync is stamped, whether it goes on", () => {
  const GOOD = [entryOf("r2-1-1", {}, NOW - 2000), entryOf("r1-1-1", {}, NOW - 3000)];
  const list = () => jsonOf(200, { entries: GOOD.map((e) => ({ id: e.id, finishedAt: e.finishedAt })) });
  const read = (c: Call) => jsonOf(200, { entry: GOOD.find((e) => e.id === c.id) });
  interface DRow {
    name: string;
    list?: Handler;
    read?: Handler;
    status: HistorySyncStatus;
    received: number;
    reads: number;
    stamped: boolean;
  }
  const D: DRow[] = [
    { name: "both good", status: "ok", received: 2, reads: 2, stamped: true },
    { name: "list: 200 {} (no list)", list: () => jsonOf(200, {}), status: "failed", received: 0, reads: 0, stamped: false },
    { name: "list: 200 with a page", list: () => page(200), status: "failed", received: 0, reads: 0, stamped: false },
    { name: "list: 401", list: () => words(401, "bad signature"), status: "failed", received: 0, reads: 0, stamped: false },
    { name: "list: 403 (a proxy)", list: () => page(403), status: "failed", received: 0, reads: 0, stamped: false },
    { name: "list: 404", list: () => words(404, "not found"), status: "stopped", received: 0, reads: 0, stamped: false },
    { name: "list: 405", list: () => words(405, "use PUT"), status: "stopped", received: 0, reads: 0, stamped: false },
    { name: "list: 410", list: () => words(410, "this player was deleted"), status: "gone", received: 0, reads: 0, stamped: false },
    { name: "list: 422 at:", list: () => words(422, "at: more than 10 minutes from the server's clock"), status: "failed", received: 0, reads: 0, stamped: false },
    { name: "list: 429", list: () => words(429, "rate limit exceeded, slow down", { "retry-after": "30" }), status: "failed", received: 0, reads: 0, stamped: false },
    { name: "list: 503", list: () => words(503, "ghost storage unavailable, try again shortly", { "retry-after": "5" }), status: "failed", received: 0, reads: 0, stamped: false },
    { name: "list: a network error", list: () => Promise.reject(new TypeError("fetch failed")), status: "failed", received: 0, reads: 0, stamped: false },
    { name: "list: no answer", list: (_c, init) => hang(init), status: "failed", received: 0, reads: 0, stamped: false },
    { name: "read: 404 for both (they left, or reads are routed away)", read: () => words(404, "no such entry"), status: "ok", received: 0, reads: 2, stamped: true },
    { name: "read: 404 for the first, good for the second", read: (c) => (c.id === "r2-1-1" ? words(404, "no such entry") : read(c)), status: "ok", received: 1, reads: 2, stamped: true },
    { name: "read: 200 that is not an entry (the first)", read: (c) => (c.id === "r2-1-1" ? jsonOf(200, { entry: { id: "r2-1-1" } }) : read(c)), status: "failed", received: 0, reads: 1, stamped: false },
    { name: "read: 200 with another entry's id", read: (c) => jsonOf(200, { entry: GOOD.find((e) => e.id !== c.id) }), status: "failed", received: 0, reads: 1, stamped: false },
    { name: "read: good, then 500", read: (c) => (c.id === "r1-1-1" ? words(500, "internal error") : read(c)), status: "failed", received: 1, reads: 2, stamped: false },
    { name: "read: good, then 410", read: (c) => (c.id === "r1-1-1" ? words(410, "this player was deleted") : read(c)), status: "gone", received: 1, reads: 2, stamped: false },
    { name: "read: 401 for the first", read: () => words(401, "bad signature"), status: "failed", received: 0, reads: 1, stamped: false },
    { name: "read: no answer for the first", read: (_c, init) => hang(init), status: "failed", received: 0, reads: 1, stamped: false },
  ];
  it.each(D)("4d. $name", async (row) => {
    const A = await device(0);
    link(A);
    const srv = scripted((c, init) => (c.kind === "LIST" ? (row.list ?? list)(c, init) : (row.read ?? read)(c, init)));
    const r = await syncHistory(nextBase(), A.id, deps(A, srv.f, row.status === "gone" ? { mirror: memoryMirror() } : {}));
    expect(r.status).toBe(row.status);
    expect(r.received).toBe(row.received);
    expect(srv.ofKind("READ")).toHaveLength(row.reads);
    const stamp = readHistory(A.store).state.syncedAt;
    expect(stamp === NOW).toBe(row.stamped);
    if (row.status === "gone") {
      expect(readLink(A.store)).toBeNull();
      expect(ids(A)).toHaveLength(row.received); // what was read before the 410 is kept (local progress)
    }
    if (row.status === "ok") expect(ids(A)).toHaveLength(row.received);
  });

  it("NOTE: an entry the server lists but whose read never decodes blocks every older entry for good (the sync stops at it and is never stamped): one LIST and one READ per page load", async () => {
    // Expected: not reached in a normal flow (the server stores only entries its own strict decode accepted, and the client holds a download to the same caps).
    // A corrupt object, or a skew between a server and a client build, would do it: the newest entry is read first every time and the loop stops at it.
    const A = await device(0);
    link(A);
    const entries = [entryOf("poison-1-1", {}, NOW - 1000), ...[1, 2, 3].map((i) => entryOf(`ok${i}-1-1`, {}, NOW - 1000 - i * 1000))];
    const srv = scripted((c) => {
      if (c.kind === "LIST") return jsonOf(200, { entries: entries.map((e) => ({ id: e.id, finishedAt: e.finishedAt })) });
      return c.id === "poison-1-1" ? jsonOf(200, { entry: { ...entries[0], hero: 7 } }) : jsonOf(200, { entry: entries.find((e) => e.id === c.id) });
    });
    const base = nextBase();
    for (let i = 0; i < 3; i++) {
      const r = await startupHistorySync(base, A.id, deps(A, srv.f));
      expect(r).toMatchObject({ status: "failed", received: 0 });
    }
    expect(srv.calls.map((c) => c.kind)).toEqual(["LIST", "READ", "LIST", "READ", "LIST", "READ"]);
    expect(ids(A)).toEqual([]);
    expect(readHistory(A.store).state.syncedAt).toBeUndefined();
  });
});

// ------------------------------------------------------------------------------------------------------------- 4d-3: caps, merges and the 50

describe("4d. the merge at the cap of 50", () => {
  /** A device holding `unsent` unsent entries (older) and `sent` entries already sent to its player (newer). */
  async function full(unsent: number, sent: number): Promise<Device> {
    const A = await device(0);
    link(A);
    const entries: LocalEntry[] = [];
    for (let i = 0; i < sent; i++) entries.push({ entry: entryOf(`s${i}-1-1`, {}, NOW - 100_000 - i * 1000), sentTo: A.id.playerId });
    for (let i = 0; i < unsent; i++) entries.push({ entry: entryOf(`u${i}-1-1`, {}, NOW - 1_000_000 - i * 1000) });
    writeHistory({ entries }, A.store);
    return A;
  }
  const newer = (n: number) => Array.from({ length: n }, (_, i) => entryOf(`n${i}-1-1`, {}, NOW - 10_000 + i * 100)); // n(n-1) is the newest

  it("downloaded entries never push out an entry that is not sent yet: 45 unsent + 5 sent, 10 newer on the server: the 45 stay, the sent ones go first, then the oldest downloaded", async () => {
    const A = await full(45, 5);
    const fresh = newer(10);
    const srv = scripted((c) => {
      if (c.kind === "PUT") return words(403, "uploads are not open yet"); // nothing is marked: the merge meets 45 unsent entries
      if (c.kind === "LIST") return jsonOf(200, { entries: fresh.map((e) => ({ id: e.id, finishedAt: e.finishedAt })) });
      return jsonOf(200, { entry: fresh.find((e) => e.id === c.id) });
    });
    const r = await syncHistory(nextBase(), A.id, deps(A, srv.f));
    expect(r.status).toBe("ok");
    expect(srv.ofKind("READ")).toHaveLength(10);
    expect(ids(A)).toHaveLength(HISTORY_LOCAL_MAX);
    for (let i = 0; i < 45; i++) expect(ids(A)).toContain(`u${i}-1-1`); // every unsent entry is still there
    expect(ids(A).filter((id) => id.startsWith("s"))).toEqual([]); // the 5 sent ones were dropped first
    expect(held(A).filter((l) => l.down).map((l) => l.entry.id)).toEqual(["n9-1-1", "n8-1-1", "n7-1-1", "n6-1-1", "n5-1-1"]); // and the 5 OLDEST downloaded
    expect(r.received).toBe(5);
  });

  it("a device whose 50 entries are all unsent asks for nothing (it could keep nothing it downloads)", async () => {
    const A = await full(50, 0);
    const srv = scripted((c) => (c.kind === "PUT" ? words(403, "uploads are not open yet") : jsonOf(200, { entries: newer(3).map((e) => ({ id: e.id, finishedAt: e.finishedAt })) })));
    const r = await syncHistory(nextBase(), A.id, deps(A, srv.f));
    expect(r).toMatchObject({ status: "ok", received: 0 });
    expect(srv.ofKind("READ")).toHaveLength(0);
  });

  it("NOTE: the cap is the cap: with 50 entries all unsent, the 51st run drops the OLDEST unsent entry (a never-linked device, or a linked one offline for 51 runs)", async () => {
    const A = await full(50, 0);
    expect(recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "z-1-1", records: false }), { store: A.store, now: () => NOW })).toEqual(["z-1-1"]);
    expect(ids(A)).toHaveLength(50);
    expect(ids(A)).toContain("z-1-1");
    expect(ids(A)).not.toContain("u49-1-1"); // the oldest unsent entry is gone, never sent
    expect(ids(A)).toContain("u48-1-1");
  });
});

// -------------------------------------------------------------------------------------------- 4d-4: serial queue, hang, stamp, 403, 410

describe("4d. the serial queue, the hang, the stamp", () => {
  it("two triggers at once, three kinds: one request in flight at a time, each entry sent exactly once", async () => {
    const A = await linkedWith(0, 6, "s");
    let live = 0;
    let peak = 0;
    const srv = scripted(async (c) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 4));
      live--;
      return c.kind === "PUT" ? ok(201, c.id!) : jsonOf(200, { entries: [] });
    });
    const base = nextBase();
    const rs = await Promise.all([
      syncHistory(base, A.id, deps(A, srv.f)),
      syncHistory(base, A.id, deps(A, srv.f), { download: false }),
      startupHistorySync(base, A.id, deps(A, srv.f)),
      syncHistory(base, A.id, deps(A, srv.f)),
    ]);
    expect(peak).toBe(1);
    expect(rs.map((r) => r.sent)).toEqual([6, 0, 0, 0]); // the first sent them all; the others found nothing to send
    const puts = srv.ofKind("PUT").map((c) => c.id);
    expect(puts).toHaveLength(6);
    expect(new Set(puts).size).toBe(6);
  });

  it("a trigger queued behind a failing one still runs, and a failing trigger leaves the queue usable", async () => {
    const A = await linkedWith(0, 2, "w");
    // the very first request fails; every later one is answered well
    const srv = scripted((c) => (c.n === 1 ? Promise.reject(new TypeError("fetch failed")) : c.kind === "PUT" ? ok(201, c.id!) : jsonOf(200, { entries: [] })));
    const base = nextBase();
    const first = syncHistory(base, A.id, deps(A, srv.f));
    const second = syncHistory(base, A.id, deps(A, srv.f));
    expect((await first).status).toBe("failed");
    expect(await second).toMatchObject({ status: "ok", sent: 2 });
  });

  it("4d. a request that never answers does not hold historyRunEnded's caller; the default timeout is 5 s; the queue moves on after it", async () => {
    const A = await device(0);
    link(A);
    vi.stubGlobal("localStorage", A.store);
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    const puts: string[] = [];
    vi.stubGlobal("fetch", (async (_u: RequestInfo | URL, init?: RequestInit) => {
      puts.push((JSON.parse(new TextDecoder().decode(init!.body as Uint8Array)) as { entry: { id: string } }).entry.id);
      return hang(init);
    }) as typeof fetch);
    setSession({ url: "http://hang.example", active: true, failed: false, identity: A.id, tick() {}, settle() {}, submitDusk() {}, countRun() {} } as never);
    // setImmediate is not faked: these wait in real time for the signing (WebCrypto) and the queue, never for the fake clock
    const immediate = (globalThis as unknown as { setImmediate: (f: () => void) => void }).setImmediate; // typed here: the test tsconfig has no node globals
    const spin = async (ms: number) => { const t = performance.now(); while (performance.now() - t < ms) await new Promise<void>((r) => immediate(r)); };
    const until = async (cond: () => boolean, ms = 4000) => { const t = performance.now(); while (!cond() && performance.now() - t < ms) await new Promise<void>((r) => immediate(r)); };
    try {
      const t0 = performance.now();
      historyRunEnded(playedRun({ pattern: "WL", end: "lost", runId: "h1-1-1", records: false }));
      const took = performance.now() - t0;
      expect(took).toBeLessThan(150); // the call is synchronous: it wrote the entry and queued the send, nothing more
      expect(ids(A)).toContain("h1-1-1");
      vi.setSystemTime(NOW + 1000);
      historyRunEnded(playedRun({ pattern: "WL", end: "lost", runId: "h2-1-1", records: false }));
      expect(ids(A)).toEqual(["h2-1-1", "h1-1-1"]); // both are written before either send begins (a send starts a microtask later)
      await until(() => puts.length >= 1);
      await spin(60);
      expect(puts).toEqual(["h2-1-1"]); // the first send starts with the NEWEST unsent entry; the second trigger waits behind it (serial queue)
      await vi.advanceTimersByTimeAsync(4999);
      await spin(60);
      expect(puts).toHaveLength(1); // still waiting: the timeout is 5000 ms
      await vi.advanceTimersByTimeAsync(1);
      await until(() => puts.length >= 2);
      expect(puts).toEqual(["h2-1-1", "h2-1-1"]); // aborted at 5 s; the queued trigger began and tried the same newest entry again (it was kept)
      await vi.advanceTimersByTimeAsync(5000);
      await historyIdle();
      expect(puts).toHaveLength(2);
      expect(unsentFor(A.id.playerId, A.store).map((e) => e.id).sort()).toEqual(["h1-1-1", "h2-1-1"]); // both kept for the next trigger
    } finally {
      // whatever is still pending is aborted now: a stuck request must not stay in the module's serial queue for the tests after this one
      await vi.advanceTimersByTimeAsync(60_000);
      await historyIdle();
    }
  });

  it("the stamp (decision 7): set by a good list and its reads, by a sync with uploads closed, by the link trigger too; not by a failed upload; the gate is the hour, to the millisecond", async () => {
    const A = await linkedWith(0, 1, "g");
    let uploads: Handler = (c) => ok(201, c.id!);
    const srv = scripted((c, init) => (c.kind === "PUT" ? uploads(c, init) : jsonOf(200, { entries: [] })));
    const base = nextBase();
    let t = NOW;
    const dep = () => deps(A, srv.f, { now: () => t });
    uploads = () => words(500, "internal error");
    expect((await startupHistorySync(base, A.id, dep())).status).toBe("failed");
    expect(readHistory(A.store).state.syncedAt).toBeUndefined(); // an upload that failed: not stamped, the next page load tries at once
    uploads = () => words(403, "uploads are not open yet");
    expect((await startupHistorySync(base, A.id, dep())).status).toBe("ok");
    expect(readHistory(A.store).state.syncedAt).toBe(NOW); // uploads closed: the reads went on and stamped
    uploads = (c) => ok(201, c.id!);
    t = NOW + HISTORY_SYNC_INTERVAL_MS - 1;
    const n = srv.calls.length;
    expect((await startupHistorySync(base, A.id, dep())).status).toBe("skipped");
    expect(srv.calls).toHaveLength(n);
    expect(unsentFor(A.id.playerId, A.store)).toHaveLength(1); // NOTE: the entry that could not go up waits for the hour (or for a run's end) although uploads are open again
    t = NOW + HISTORY_SYNC_INTERVAL_MS;
    expect(await startupHistorySync(base, A.id, dep())).toMatchObject({ status: "ok", sent: 1 });
    // a clock that went back: the gate is open, and the stamp moves back to now
    t = NOW - 5 * HISTORY_SYNC_INTERVAL_MS;
    const before = srv.calls.length;
    expect((await startupHistorySync(base, A.id, dep())).status).toBe("ok");
    expect(srv.calls.length).toBeGreaterThan(before);
    expect(readHistory(A.store).state.syncedAt).toBe(t);
  });
});

// ---------------------------------------------------------------------------------------------- 4d-5: the real server, both stores

describe.each(["jsonl", "tigris"] as Kind[])("4d. against the real server (%s)", (kind) => {
  const dep = (rig: Rig, d: Device, over: Partial<HistorySyncDeps> = {}): HistorySyncDeps => ({ now: () => rig.clock.now, store: d.store, mirror: null, timeoutMs: 4000, keyStore: d.keys, ...over });

  it("the server's own words for each reply decide as the table says: 201 then 200 then 409 sent; the 200-entry cap's 422 refused; uploads closed kept, reads still work", async () => {
    const rig = await openHistoryRig(kind);
    const A = await linkedWith(0, 2, "v");
    // 201, then the same entries again from a device that lost its marks: 200
    expect(await syncHistory(rig.base, A.id, dep(rig, A), { download: false })).toMatchObject({ status: "ok", sent: 2 });
    expect(historyObjects(rig, A.id.playerId)).toHaveLength(2);
    const state = readHistory(A.store).state;
    for (const l of state.entries) delete l.sentTo;
    writeHistory(state, A.store);
    expect(await syncHistory(rig.base, A.id, dep(rig, A), { download: false })).toMatchObject({ status: "ok", sent: 2 }); // 200 x 2
    expect(historyObjects(rig, A.id.playerId)).toHaveLength(2); // nothing written twice
    // 409: the device's entry for that id differs from the stored one
    const s2 = readHistory(A.store).state;
    for (const l of s2.entries) delete l.sentTo;
    s2.entries[0].entry = { ...s2.entries[0].entry, wins: 0 };
    writeHistory(s2, A.store);
    expect(await syncHistory(rig.base, A.id, dep(rig, A), { download: false })).toMatchObject({ status: "ok", sent: 2 }); // 409 + 200: both marked
    expect(unsentFor(A.id.playerId, A.store)).toHaveLength(0);
    // uploads closed: the entry waits, the reads work (and the stamp is set)
    await rig.restart({ ...OPEN, uploads: "closed" });
    play(A, 1, "late", NOW - 10_000);
    expect(await syncHistory(rig.base, A.id, dep(rig, A))).toMatchObject({ status: "ok", sent: 0 });
    expect(unsentFor(A.id.playerId, A.store).map((e) => e.id)).toEqual(["late0-1-1"]);
    expect(readHistory(A.store).state.syncedAt).toBe(rig.clock.now);
    await rig.restart(OPEN);
    expect(await syncHistory(rig.base, A.id, dep(rig, A))).toMatchObject({ status: "ok", sent: 1 });
  });

  it("no honest entry of any hero is refused for good: a won, a lost (hearts) and an endless entry of every hero are accepted by the server, sent once each", async () => {
    const rig = await openHistoryRig(kind);
    const A = await device(0);
    link(A);
    const heroes = Object.keys(HEROES) as HeroId[];
    expect(heroes.length).toBeGreaterThan(3);
    let t = 0;
    let total = 0;
    for (const hero of heroes) {
      const rec = (run: Parameters<typeof recordRunEnd>[0]) => recordRunEnd(run, { store: A.store, now: () => NOW - 500_000 + ++t * 100 });
      expect(rec(playedRun({ hero, runId: `h-${hero}-a`, pattern: "WWWWWWWWWW", end: "complete", records: false }))).toEqual([`h-${hero}-a`]);
      expect(rec(playedRun({ hero, runId: `h-${hero}-b`, pattern: "WWL", end: "lost", hearts: true, records: false }))).toEqual([`h-${hero}-b`]);
      expect(rec(playedRun({ hero, runId: `h-${hero}-c`, pattern: "WWWWWWWWWW", end: "won", records: false }))).toEqual([`h-${hero}-c`]);
      expect(rec(playedRun({ hero, runId: `h-${hero}-c`, pattern: "WWWWWWWWWW", end: "won", endless: { pattern: "WWL", end: "hearts" }, records: false }))).toEqual([`h-${hero}-c_endless`]);
      const r = await syncHistory(rig.base, A.id, dep(rig, A), { download: false });
      expect(r, hero).toMatchObject({ status: "ok", sent: 4, refused: 0 });
      total += 4;
    }
    expect(historyObjects(rig, A.id.playerId)).toHaveLength(total);
    expect(unsentFor(A.id.playerId, A.store)).toHaveLength(0);
  });

  it("a 410 on the PUT: the link, the mirror's copies and the key are dropped; the local history (with its marks and downloads) and the profile stay; a new key's SHOW MY CODE re-sends only the device's own runs, to the new player", async () => {
    const rig = await openHistoryRig(kind);
    const A = await device(0), B = await device(1);
    const mirror = memoryMirror();
    play(A, 3, "a", NOW - 100_000);
    const shown = await requestLinkCode(rig.base, A.id, dep(rig, A));
    if (!shown.ok) throw new Error("no code");
    await historyIdle();
    play(B, 2, "b", NOW - 50_000);
    expect(await redeemLinkCode(rig.base, B.id, shown.code, dep(rig, B, { mirror }))).toMatchObject({ ok: true });
    await historyIdle();
    expect(held(B).filter((l) => l.down)).toHaveLength(3);
    expect(held(B).filter((l) => l.sentTo === A.id.playerId)).toHaveLength(2);
    play(B, 2, "g", NOW - 10_000); // two more, unsent
    B.store.setItem(PROFILE_KEY, '{"v":1,"marker":"profile stays"}');
    await mirror.set(MIRROR_JWK, "{}");
    expect(mirror.values.has(MIRROR_LINK)).toBe(true);
    expect((await deleteMe(rig, A.id)).status).toBe(200); // another device deletes the player
    expect(historyObjects(rig, A.id.playerId)).toEqual([]);
    const before = B.store.getItem(HISTORY_KEY);
    const r = await syncHistory(rig.base, B.id, dep(rig, B, { mirror }));
    expect(r.status).toBe("gone");
    expect(readLink(B.store)).toBeNull();
    expect(mirror.values.size).toBe(0);
    expect(await B.keys.get()).toBeNull();
    expect(B.store.getItem(HISTORY_KEY)).toBe(before); // every entry, every sentTo mark and every down flag, byte for byte
    expect(B.store.getItem(PROFILE_KEY)).toBe('{"v":1,"marker":"profile stays"}');
    expect(B.store.keys()).toEqual(expect.arrayContaining([HISTORY_KEY, PROFILE_KEY]));
    expect(B.store.keys()).not.toContain(LINK_KEY);
    // the device's next online use makes a new player (a new key); showing a code re-sends B's own 4 runs under it, never the 3 downloaded ones
    const fresh = await loadIdentity(B.keys, undefined, { mirror: null, links: B.store });
    expect(fresh!.keyId).not.toBe(B.id.keyId);
    const code = await requestLinkCode(rig.base, fresh!, dep(rig, B));
    expect(code.ok).toBe(true);
    await historyIdle();
    expect(historyObjects(rig, fresh!.keyId!).length).toBe(4);
    expect(historyObjects(rig, A.id.playerId)).toEqual([]); // the deleted player's history is not brought back
    expect(held(B).filter((l) => l.sentTo === fresh!.keyId)).toHaveLength(4);
    expect(held(B).filter((l) => l.down).every((l) => l.sentTo === undefined)).toBe(true);
  });

  it("a 410 on the list read, and a 410 on an entry read after the list answered (the player deleted in between), do the same", async () => {
    const rig = await openHistoryRig(kind);
    const A = await device(0), B = await device(1);
    play(A, 3, "x", NOW - 100_000);
    const shown = await requestLinkCode(rig.base, A.id, dep(rig, A));
    if (!shown.ok) throw new Error("no code");
    await historyIdle();
    await redeemLinkCode(rig.base, B.id, shown.code, dep(rig, B)); // B holds A's 3 now
    await historyIdle();
    play(A, 2, "y", NOW - 5000);
    await syncHistory(rig.base, A.id, dep(rig, A), { download: false });
    // the list works, then the player is deleted before B's entry reads
    let deleted = false;
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await fetch(input, init);
      if (!deleted && String(input).includes("/v1/history?at=") && !String(input).includes("&id=")) {
        deleted = true;
        await deleteMe(rig, A.id);
      }
      return res;
    }) as typeof fetch;
    const r = await syncHistory(rig.base, B.id, dep(rig, B, { fetch: f }));
    expect(r.status).toBe("gone"); // the first entry read said 410
    expect(r.received).toBe(0);
    expect(readLink(B.store)).toBeNull();
    expect(ids(B)).toHaveLength(3);
  });
});

// ------------------------------------------------------------------------------------------------ 4d-6: how long "full history" takes

describe.each(["jsonl", "tigris"] as Kind[])("4d. the download bound against 'a second device sees the full history' (%s)", (kind) => {
  const dep = (rig: Rig, d: Device): HistorySyncDeps => ({ now: () => rig.clock.now, store: d.store, mirror: null, timeoutMs: 4000, keyStore: d.keys });

  /** Device A has 50 finished runs; it shows a code; B enters it; then, hour by hour, the apps are opened (the startup syncs). Returns the hours and B's syncs. */
  async function race(first: "A" | "B"): Promise<{ hours: number; bSyncs: number; held: number[]; rig: Rig; A: Device; B: Device }> {
    const rig = await openHistoryRig(kind);
    const A = await device(0), B = await device(1);
    play(A, 50, "a", NOW - 200_000);
    const shown = await requestLinkCode(rig.base, A.id, dep(rig, A));
    if (!shown.ok) throw new Error("no code");
    await historyIdle();
    expect(historyObjects(rig, A.id.playerId)).toHaveLength(HISTORY_UPLOADS_PER_TRIGGER); // SHOW MY CODE's trigger sent the newest 10
    expect(await redeemLinkCode(rig.base, B.id, shown.code, dep(rig, B))).toMatchObject({ ok: true });
    await historyIdle();
    const heldAfter: number[] = [ids(B).length]; // B's entries after each of its syncs
    let hours = 0;
    let bSyncs = 1;
    while (ids(B).length < 50 && hours < 12) {
      hours++;
      rig.clock.now += HISTORY_SYNC_INTERVAL_MS + 1000;
      const a = () => startupHistorySync(rig.base, A.id, dep(rig, A));
      const b = async () => {
        const r = await startupHistorySync(rig.base, B.id, dep(rig, B));
        expect(r.status).toBe("ok");
        bSyncs++;
        heldAfter.push(ids(B).length);
      };
      if (first === "A") { await a(); await b(); } else { await b(); await a(); }
    }
    return { hours, bSyncs, held: heldAfter, rig, A, B };
  }

  it("each sync reads the NEXT 10 the device lacks (never the same newest 10 again): B holds A's newest 50 after 5 syncs and 4 hours when A is opened first each hour", async () => {
    expect(HISTORY_DOWNLOADS_PER_SYNC).toBe(10);
    const r = await race("A");
    expect(r.held).toEqual([10, 20, 30, 40, 50]);
    expect(r.bSyncs).toBe(5);
    expect(r.hours).toBe(4); // the link's sync, then one startup sync an hour for four hours
    expect(ids(r.B)).toEqual(Array.from({ length: 50 }, (_, i) => `a${49 - i}-1-1`));
    expect(held(r.B).every((l) => l.down)).toBe(true);
  });

  it("NOTE: when B is opened before A each hour, B is one step behind A's uploads (10 a trigger): 6 syncs, 5 hours", async () => {
    const r = await race("B");
    expect(r.held).toEqual([10, 10, 20, 30, 40, 50]);
    expect(r.bSyncs).toBe(6);
    expect(r.hours).toBe(5);
  });

  it("what B's own newest runs do to it: B plays 5 runs after it holds A's 50: it keeps its own 5 and A's newest 45; A then drops its own oldest 5 for them", async () => {
    const r = await race("A");
    play(r.B, 5, "b", NOW - 100); // newer than every run of A
    expect(ids(r.B)).toHaveLength(50);
    expect(ids(r.B).slice(0, 5)).toEqual(["b4-1-1", "b3-1-1", "b2-1-1", "b1-1-1", "b0-1-1"]);
    expect(ids(r.B)).not.toContain("a0-1-1"); // A's 5 oldest were pushed out
    expect(ids(r.B)).not.toContain("a4-1-1");
    expect(ids(r.B)).toContain("a5-1-1");
    r.rig.clock.now += HISTORY_SYNC_INTERVAL_MS + 1000;
    expect(await startupHistorySync(r.rig.base, r.B.id, dep(r.rig, r.B))).toMatchObject({ status: "ok", sent: 5, received: 0 }); // it sends its 5 and reads nothing
    expect(historyObjects(r.rig, r.A.id.playerId)).toHaveLength(55);
    expect(await startupHistorySync(r.rig.base, r.A.id, dep(r.rig, r.A))).toMatchObject({ status: "ok", sent: 0, received: 5 });
    expect(ids(r.A).slice(0, 5)).toEqual(["b4-1-1", "b3-1-1", "b2-1-1", "b1-1-1", "b0-1-1"]);
    expect(ids(r.A)).toHaveLength(50);
    expect(ids(r.A)).not.toContain("a0-1-1"); // A dropped its own oldest 5 (already sent), the newest 45 stay
    expect(ids(r.A)).toContain("a5-1-1");
  });
});

// ------------------------------------------------------------------------------------------- 4d-7: the run's end costs the caller little

describe("4d. the run's end", () => {
  it("NOTE: the synchronous work of historyRunEnded on a full device (50 entries, records up to the 256 KB budget) is a parse and a write of the whole key; measured", async () => {
    const A = await device(0);
    const rec = playedRun({ pattern: "WWWWWWWWWW", end: "complete", runId: "full-1-1", records: true });
    const withRecords = (i: number) => recordRunEnd({ ...rec, runId: `full${i}-1-1` }, { store: A.store, now: () => NOW - 1_000_000 + i * 1000 });
    for (let i = 0; i < 50; i++) withRecords(i);
    const size = A.store.getItem(HISTORY_KEY)!.length;
    vi.stubGlobal("localStorage", A.store);
    setSession(null);
    const times: number[] = [];
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      historyRunEnded(playedRun({ pattern: "WL", end: "lost", runId: `next${i}-1-1`, records: false }));
      times.push(performance.now() - t0);
    }
    times.sort((x, y) => x - y);
    console.info(`vident3.sync NOTE: historyRunEnded on a full device (key ${size} chars): median ${times[7].toFixed(2)} ms, max ${times[14].toFixed(2)} ms`);
    expect(times[14]).toBeLessThan(500);
    expect(ids(A)).toHaveLength(HISTORY_LOCAL_MAX);
  });
});

// KEEP THIS TEST LAST IN THE FILE: it leaves a sync that never settles in the module's serial queue (historySync.ts `tail`), which no later sync could pass.
describe("4d. the timeout is an AbortController", () => {
  it("NOTE: a fetch that ignores its AbortSignal holds the whole queue for good (every browser's fetch honours the signal, so the 5 s timeout works there)", async () => {
    const A = await linkedWith(0, 1, "i");
    const stuck = (async () => new Promise<Response>(() => undefined)) as unknown as typeof fetch; // never settles, ignores the signal
    const first = syncHistory(nextBase(), A.id, deps(A, stuck, { timeoutMs: 20 }), { download: false });
    const second = syncHistory(nextBase(), A.id, deps(A, stuck, { timeoutMs: 20 }), { download: false });
    const settled = await Promise.race([first.then(() => "first"), second.then(() => "second"), new Promise((r) => setTimeout(() => r("nobody"), 300))]);
    expect(settled).toBe("nobody"); // 15 times the timeout later, neither has returned
  });
});
