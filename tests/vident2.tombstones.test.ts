// VERIFY-IDENT1-FIX2 (REQ-BFG-122) step 4c, 4d and 4h, written by the independent re-checker (cap_xi): ATTACKS ON F4's FIX (server/links.ts: the bounded
// wait, the incremental read, the 6-hour full read, at most 8 reads in flight) that tests/ident1.tombstones.test.ts does not make. Both backing stores
// (JSON lines, and Tigris on the fake S3) wherever the store matters.
//   A  the first load is not bounded and fails closed: every caller of ensureFresh (app.ts upload, profile PUT, match; linkRoutes.ts code, redeem,
//      profile GET, DELETE, Steam) answers 503 until it has succeeded, and nothing is served or taken from a partial or a missing set
//   B  after THIS machine's own DELETE no request serves that player's ghosts or takes its keys' uploads, whatever a reload is doing (stuck, listed
//      before the DELETE, failing, a full read in flight)
//   C  a hung LIST at the S3 level (the real client's own 2 s timeout and two retries), 40 requests at once
//   D  no rejection goes unhandled (first load that fails, refresh that fails, waiters that left), the log lines carry no id
//   E  two machines over one store: what the other machine accepts until its refresh (60 s) and until its full read (6 h)
//   F  FIX2's decisions: the start stamp, held = the listing, the retry stamp, a clock that steps back
//   G  request counts and reads in flight at the fake S3
//   H  a reload that fails at the last read / in the middle of a full read
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import { ghostId } from "../src/net/snapshot";
import { Links, TOMBSTONE_FULL_READ_MS, TOMBSTONE_READS_IN_FLIGHT, TOMBSTONE_WAIT_MS } from "../server/links";
import { MemoryLinkStore, type LinkStore } from "../server/linkStore";
import { MemoryProfileStore } from "../server/profileStore";
import { StorageError } from "../server/store";
import { earnedWire } from "./profileupWire";
import {
  closeRigs, deleteMe, fakeSteam, freshIdentity, ghostCount, identityRecords, linkSteamCall, linkVia, matchAs, openRig, openSibling, postGhost, putWire,
  readProfile, redeemCode, requestCode, theFake, uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const TTL = 60_000; // the refresh time (server/links.ts TOMBSTONE_TTL_MS)
// LITERALS, not the exported constants: a probe built from TOMBSTONE_FULL_READ_MS or TOMBSTONE_READS_IN_FLIGHT would follow a mutated constant and never notice (the first version of FIX2's own tests did)
const SIX_HOURS = 6 * 60 * 60_000;
const POOL = 8;
const REFRESH_FAILED = "tombstone refresh failed, keeping the set";
const UNREADABLE = "skipping an unreadable tombstone";
const salter = (): (() => number) => {
  let n = 0;
  return () => n++;
};
const open = (kind: Kind, over: Opts = {}) =>
  openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: { windowMs: 600_000, max: 1_000_000 }, matchSalt: salter(), ...over });
const idN = (n: number, tag: string): string => `${tag}${String(n).padStart(5, "0")}${"x".repeat(30)}`;
const tomb = (ids: string[], at = 1): string => JSON.stringify({ at, ids });
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const lines = (log: string[], what: string): number => log.filter((l) => l.includes(what)).length;
const proc = process as unknown as { on(ev: string, fn: (e: unknown) => void): void; off(ev: string, fn: (e: unknown) => void): void };

const closedGate = (): { gate: Promise<void>; release: () => void } => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { gate, release };
};

/** The tombstones another machine wrote, straight into the store: this machine's set does not know them until a reload reads them. */
async function otherMachineDeletes(rig: Rig, count: number, tag: string, first = 0): Promise<string[]> {
  const ids: string[] = [];
  for (let n = first; n < first + count; n++) {
    const id = idN(n, tag);
    await rig.app.links.store.put(`tombstones/${id}.json`, tomb([id]));
    ids.push(id);
  }
  return ids;
}

/** A spy on the tombstone reads and LISTs of `rig`'s current server (take it after a restart). */
interface Spy {
  reads: string[];
  lists: number;
  inFlight: number;
  max: number;
  readGate: Promise<void> | null;
  /** The LIST waits for `gate` before it asks the store ("before": a stuck LIST) or after it has the listing ("after": a listing taken before a DELETE). */
  listHold: { when: "before" | "after"; gate: Promise<void>; thenFail?: boolean } | null;
  failList: boolean;
  /** Fails the n-th tombstone read (counted over the spy's life) for the key it is given. */
  failOn: ((n: number, key: string) => boolean) | null;
  absent: Set<string>;
  /** Keys whose reads the spy leaves alone (a DELETE reads its own earlier tombstone: that read must not wait behind a gate meant for the reload). */
  exempt: Set<string>;
  restore(): void;
}
function spy(rig: Rig): Spy {
  const store = rig.app.links.store as { get: LinkStore["get"]; list: LinkStore["list"] };
  const get = store.get.bind(store), list = store.list.bind(store);
  const s: Spy = { reads: [], lists: 0, inFlight: 0, max: 0, readGate: null, listHold: null, failList: false, failOn: null, absent: new Set(), exempt: new Set(), restore: () => ((store.get = get), (store.list = list)) };
  store.get = async (k: string) => {
    if (!k.startsWith("tombstones/") || s.exempt.has(k)) return get(k);
    const n = s.reads.push(k);
    s.inFlight++;
    s.max = Math.max(s.max, s.inFlight);
    try {
      await sleep(1); // an await boundary, so that reads that run side by side overlap
      if (s.readGate) await s.readGate;
      if (s.failOn?.(n, k)) throw new StorageError("identity read failed: HTTP 500");
      if (s.absent.has(k)) return null;
      return await get(k);
    } finally {
      s.inFlight--;
    }
  };
  store.list = async (p: string) => {
    if (p !== "tombstones/") return list(p);
    s.lists++;
    if (s.failList) throw new StorageError("identity list failed: HTTP 500");
    const h = s.listHold;
    if (h?.when === "before") {
      await h.gate;
      if (h.thenFail) throw new StorageError("identity list failed: HTTP 500");
    }
    const r = await list(p);
    if (h?.when === "after") {
      await h.gate;
      if (h.thenFail) throw new StorageError("identity list failed: HTTP 500");
    }
    return r;
  };
  return s;
}

/** The ghost ids a series of match requests served as `player` (every status kept: a 503 serves nothing). */
async function drawn(rig: Rig, player: string, times: number): Promise<{ ids: string[]; statuses: number[] }> {
  const ids: string[] = [], statuses: number[] = [];
  for (let i = 0; i < times; i++) {
    const r = await matchAs(rig, player);
    statuses.push(r.status);
    if (r.status === 200) ids.push(String(r.json?.id));
  }
  return { ids, statuses };
}

/** What the Tigris fake saw of the tombstones since request number `from`. */
function fakeCounts(rig: Rig, from: number): { list: number; head: number; get: number } {
  const mine = theFake().requests.slice(from).filter((r) => r.bucket === rig.bucket && r.key.startsWith("tombstones/"));
  const n = (op: string) => mine.filter((r) => r.op === op).length;
  return { list: n("LIST"), head: n("HEAD"), get: n("GET") };
}

/** Count the requests the fake S3 has in flight at once (each is held 4 ms so that side-by-side requests overlap). */
function instrumentFake(): { max: () => number; reset: () => void; restore: () => void } {
  const f = theFake() as unknown as { handle: (req: unknown, res: { on(ev: string, fn: () => void): void }, body: Uint8Array) => void };
  const orig = f.handle.bind(f);
  let inflight = 0, max = 0;
  f.handle = (req, res, body) => {
    inflight++;
    max = Math.max(max, inflight);
    let done = false;
    const end = () => {
      if (!done) {
        done = true;
        inflight--;
      }
    };
    res.on("close", end);
    res.on("finish", end);
    setTimeout(() => orig(req, res, body), 4);
  };
  return { max: () => max, reset: () => (max = inflight), restore: () => (f.handle = orig) };
}

/** A bare Links over memory with a manual clock and holds on the tombstone store (as tests/ident1.tombstones.test.ts has it), real timers. */
function bare(startAt = 1_000_000) {
  const inner = new MemoryLinkStore();
  const log: string[] = [];
  const clock = { now: startAt };
  const hold = { gate: null as Promise<void> | null, fail: false, lists: 0, reads: 0 };
  const store: LinkStore = {
    get: async (k) => {
      if (k.startsWith("tombstones/")) {
        hold.reads++;
        if (hold.gate) await hold.gate;
        if (hold.fail) throw new StorageError("identity read failed: HTTP 500");
      }
      return inner.get(k);
    },
    put: (k, t) => inner.put(k, t),
    delete: (k) => inner.delete(k),
    list: async (p) => {
      hold.lists++;
      return inner.list(p);
    },
  };
  const links = new Links(store, new MemoryProfileStore(), { now: () => clock.now, log: (l) => log.push(l) });
  return { links, inner, log, clock, hold };
}

// ============================================================================================================== A. the first load fails closed

describe.each(KINDS)("A. the first load is not bounded and fails closed for every caller of ensureFresh, on %s", (kind) => {
  const S1 = "76561198000000041";
  async function world() {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, aa02: S1, aa03: S1 }) });
    const [X, P, D, Y, Z] = [await freshIdentity(), await freshIdentity(), await freshIdentity(), await freshIdentity(), await freshIdentity()];
    // X: a lone key with a ghost. P: a player with the device D (D had a ghost under its own id before it linked, then one more under P). Y: a bystander.
    const g = {
      x: uploadFor(X, X.playerId, { runId: "x-1" }),
      d: uploadFor(D, D.playerId, { runId: "d-1" }),
      p: uploadFor(P, P.playerId, { runId: "p-1" }),
      y: uploadFor(Y, Y.playerId, { runId: "y-1" }),
    };
    expect((await postGhost(rig, X, g.x)).status).toBe(201);
    expect((await postGhost(rig, D, g.d)).status).toBe(201);
    expect((await linkVia(rig, P, D)).joined.status).toBe(200);
    expect((await postGhost(rig, P, g.p)).status).toBe(201);
    expect((await postGhost(rig, Y, g.y)).status).toBe(201);
    expect((await deleteMe(rig, X)).status).toBe(200);
    expect((await deleteMe(rig, P)).status).toBe(200); // P and its device D
    const stored = ghostCount(rig);
    expect(stored).toBe(4);
    await rig.restart(); // nothing in memory survives: the next request makes the first load
    return { rig, X, P, D, Y, Z, g, stored };
  }
  type World = Awaited<ReturnType<typeof world>>;

  /** Every route that calls ensureFresh, as a deleted key / device (or a bystander) would call it. */
  const callsOf = (w: World): [string, () => Promise<Reply>][] => [
    ["POST /v1/ghosts by the deleted key X, under its own id", () => postGhost(w.rig, w.X, uploadFor(w.X, w.X.playerId, { runId: "x-2" }))],
    ["POST /v1/ghosts by the deleted device D, under its own id", () => postGhost(w.rig, w.D, uploadFor(w.D, w.D.playerId, { runId: "d-2" }))],
    ["POST /v1/ghosts by the deleted device D, under the deleted player P", () => postGhost(w.rig, w.D, uploadFor(w.D, w.P.playerId, { runId: "d-3" }))],
    ["POST /v1/ghosts by the bystander Y", () => postGhost(w.rig, w.Y, uploadFor(w.Y, w.Y.playerId, { runId: "y-2" }))],
    ["GET /v1/ghosts/match by the bystander Z", () => matchAs(w.rig, w.Z.playerId)],
    ["PUT /v1/profile by X", () => putWire(w.rig, earnedWire({ runs: 1 }), w.X)],
    ["GET /v1/profile by X", () => readProfile(w.rig, w.X)],
    ["POST /v1/link/code by X", () => requestCode(w.rig, w.X)],
    ["POST /v1/link/redeem by X", () => redeemCode(w.rig, w.X, "ZZZZ-ZZZZ")],
    ["POST /v1/link/steam by X", () => linkSteamCall(w.rig, w.X, "aa01", "bb-ghost", 480)],
    ["DELETE /v1/player by X", () => deleteMe(w.rig, w.X)],
  ];

  /** The store is back: the deleted are refused, the bystander is not, and no deleted ghost is served. */
  async function afterTheStoreIsBack(w: World): Promise<void> {
    const ups = [
      await postGhost(w.rig, w.X, uploadFor(w.X, w.X.playerId, { runId: "x-3" })),
      await postGhost(w.rig, w.D, uploadFor(w.D, w.D.playerId, { runId: "d-4" })),
      await postGhost(w.rig, w.D, uploadFor(w.D, w.P.playerId, { runId: "d-5" })),
      await postGhost(w.rig, w.Y, uploadFor(w.Y, w.Y.playerId, { runId: "y-3" })),
    ];
    expect(ups.map((r) => r.status), "X, D (own id), D (under P), and the bystander").toEqual([410, 410, 410, 201]);
    const { ids } = await drawn(w.rig, w.Z.playerId, 30);
    for (const gone of [w.g.x, w.g.d, w.g.p]) expect(ids, "a deleted player's ghost is never served").not.toContain(ghostId(gone));
    expect(ids.length, "and the bystander's are").toBeGreaterThan(0);
  }

  it("the first LIST fails: all eleven routes answer 503, nothing is stored or served; when the store is back the deleted are refused", async () => {
    const w = await world();
    const store = w.rig.app.links.store as { list: LinkStore["list"] };
    const list = store.list.bind(store);
    store.list = async () => {
      throw new StorageError("identity list failed: HTTP 500");
    };
    try {
      const got: Record<string, number> = {};
      for (const [name, call] of callsOf(w)) got[name] = (await call()).status;
      expect(got, "every caller of ensureFresh is refused (503)").toEqual(Object.fromEntries(Object.keys(got).map((k) => [k, 503])));
      expect(Object.keys(got)).toHaveLength(11);
      expect(w.rig.app.links.goneCount).toBe(0);
      expect(ghostCount(w.rig), "and nothing was stored").toBe(w.stored);
    } finally {
      store.list = list;
    }
    await afterTheStoreIsBack(w);
  });

  it("the first load fails after one of the two tombstones was read (a PARTIAL set): still 503 for every route, and none of the ids it read is applied", async () => {
    const w = await world();
    const s = spy(w.rig);
    s.failOn = (_n, key) => key === `tombstones/${w.P.playerId}.json`; // X's tombstone reads fine, P's never does: every attempt is partial
    try {
      for (const [name, call] of callsOf(w)) expect((await call()).status, name).toBe(503);
      expect(w.rig.app.links.goneCount, "not one id of the partial read is applied").toBe(0);
      expect(ghostCount(w.rig)).toBe(w.stored);
    } finally {
      s.failOn = null;
    }
    await afterTheStoreIsBack(w);
    s.restore();
  });

  it("the first load hangs: an upload by a deleted key, one by a deleted device and a match are all still waiting twice the bound on, and are answered correctly when it ends", async () => {
    const w = await world();
    const s = spy(w.rig);
    const g = closedGate();
    s.listHold = { when: "before", gate: g.gate };
    const answered = [false, false, false, false];
    const calls = [
      () => postGhost(w.rig, w.X, uploadFor(w.X, w.X.playerId, { runId: "x-h" })),
      () => postGhost(w.rig, w.D, uploadFor(w.D, w.P.playerId, { runId: "d-h" })),
      () => matchAs(w.rig, w.Z.playerId),
      () => postGhost(w.rig, w.Y, uploadFor(w.Y, w.Y.playerId, { runId: "y-h" })),
    ];
    const ps = calls.map((c, i) => c().then((r) => ((answered[i] = true), r)));
    await sleep(TOMBSTONE_WAIT_MS * 2 + 100);
    expect(answered, "no set is held: nobody is answered, whatever the bound").toEqual([false, false, false, false]);
    expect(s.lists, "and the first load is one LIST for all of them").toBe(1);
    g.release();
    const rs = await Promise.all(ps);
    expect(rs[0].status).toBe(410);
    expect(rs[1].status).toBe(410);
    expect([200, 404]).toContain(rs[2].status);
    if (rs[2].status === 200) for (const gone of [w.g.x, w.g.d, w.g.p]) expect(String(rs[2].json?.id)).not.toBe(ghostId(gone));
    expect(rs[3].status).toBe(201);
    s.restore();
    await afterTheStoreIsBack(w);
  });
});

// ---- A2 and A3 were NOTES found while reading the first load, pinned as they were. IDENT-2 fixed both (finding A: server/links.ts reload; finding B:
// server/linkStore.ts FileLinkStore.list), so each is rewritten to the fixed outcome (the old names are in tests/ident2.fixes*.test.ts's headers).
describe.each(KINDS)("A2. the first load and a tombstone the store LISTS but returns nothing for, on %s (IDENT-2 fix A: was a NOTE)", (kind) => {
  it("FIXED: it is read again 3 times (100 ms apart); still absent, the FIRST load fails (503, nothing applied, a log line with a count and no id) and the next request starts a fresh load, so the deleted key's upload is never taken and its ghost never served", async () => {
    const rig = await open(kind);
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    const gX = uploadFor(X, X.playerId, { runId: "x-1" });
    expect((await postGhost(rig, X, gX)).status).toBe(201);
    expect((await deleteMe(rig, X)).status).toBe(200);
    await rig.restart();
    const s = spy(rig);
    s.absent = new Set([`tombstones/${X.playerId}.json`]); // the listing shows it, the read finds nothing (a LIST that runs ahead of the read)
    const up = await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-2" }));
    expect(up.status, "the first load FAILED (503); it did not go on without X's ids (it was 201)").toBe(503);
    expect(s.reads.length, "the read and its 3 re-reads").toBe(4);
    expect((await drawn(rig, Z.playerId, 1)).statuses, "a match is refused too, so X's ghost is not served (it was served)").toEqual([503]);
    expect(lines(rig.log, "1 listed tombstone(s) not found"), "one log line for each failed load, with a count and no id").toBe(2);
    expect(rig.log.join("\n"), "and no id in it").not.toContain(X.playerId);
    s.absent.clear(); // the key is there now
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-3" }))).status, "the next request starts a fresh load, which reads it").toBe(410);
    expect((await drawn(rig, Z.playerId, 20)).ids).not.toContain(ghostId(gX));
    expect(s.reads.length, "4 + 4 reads of the two failed loads, then 1").toBe(9);
    s.restore();
  });
});

describe("A3. the file store lists only the names its own key check accepts (IDENT-2 fix B: was a NOTE)", () => {
  it("FIXED, JSON lines: a stray identity/tombstones/<name with a space>.json is not listed, so the first load succeeds (201, as on Tigris; it was a 500 internal error), and a real tombstone beside it still applies", async () => {
    const jsonl = await open("jsonl");
    const [dev, gone] = [await freshIdentity(), await freshIdentity()];
    expect((await deleteMe(jsonl, gone)).status, "a real tombstone, written by the server").toBe(200);
    mkdirSync(join(jsonl.dir, "identity", "tombstones"), { recursive: true });
    writeFileSync(join(jsonl.dir, "identity", "tombstones", "not a key.json"), "{}");
    await jsonl.restart();
    const r = await postGhost(jsonl, dev, uploadFor(dev, dev.playerId, { runId: "a" }));
    expect([r.status, r.json?.error], "an upload; the same for the match and every route that waits for the first load").toEqual([201, undefined]);
    expect((await postGhost(jsonl, gone, uploadFor(gone, gone.playerId, { runId: "b" }))).status, "the real tombstone beside the stray applies").toBe(410);
    const tigris = await open("tigris");
    expect((await deleteMe(tigris, gone)).status).toBe(200);
    theFake().putObject(tigris.bucket, "tombstones/not a key.json", "{}");
    await tigris.restart();
    expect((await postGhost(tigris, dev, uploadFor(dev, dev.playerId, { runId: "a" }))).status, "(Tigris: the listing filters by the key pattern, as it did)").toBe(201);
    expect((await postGhost(tigris, gone, uploadFor(gone, gone.playerId, { runId: "b" }))).status).toBe(410);
  });
});

// ============================================================================================================== B. this machine's own DELETE

describe.each(KINDS)("B. after this machine's own DELETE no request serves that player's ghosts or takes its keys' uploads, whatever a reload is doing, on %s", (kind) => {
  async function world(withOthers = 0) {
    const rig = await open(kind);
    const [P, D, Y, Z] = [await freshIdentity(), await freshIdentity(), await freshIdentity(), await freshIdentity()];
    const g = {
      d: uploadFor(D, D.playerId, { runId: "d-1" }), // under its own id, before it links
      p: uploadFor(P, P.playerId, { runId: "p-1" }),
      d2: uploadFor(D, P.playerId, { runId: "d-2" }), // under the player, after it linked
      y: uploadFor(Y, Y.playerId, { runId: "y-1" }),
    };
    expect((await postGhost(rig, D, g.d)).status).toBe(201);
    expect((await linkVia(rig, P, D)).joined.status).toBe(200);
    for (const [id, snap] of [[P, g.p], [D, g.d2], [Y, g.y]] as const) expect((await postGhost(rig, id, snap)).status).toBe(201);
    if (withOthers) await otherMachineDeletes(rig, withOthers, "o");
    await rig.restart();
    await rig.app.links.ensureFresh(); // the first load
    rig.clock.now += TTL + 1; // a refresh is due
    return { rig, P, D, Y, Z, g };
  }
  type World = Awaited<ReturnType<typeof world>>;

  /** Every request that could serve P's or D's ghost or take their uploads, answered now. */
  let seq = 0; // (a runId is 1 to 64 characters of A-Z a-z 0-9 _ -: the sentences go in the messages only)
  async function everythingRefused(w: World, why: string, draws = 12): Promise<void> {
    const n = ++seq;
    const ups = [
      await postGhost(w.rig, w.P, uploadFor(w.P, w.P.playerId, { runId: `px-${n}` })),
      await postGhost(w.rig, w.D, uploadFor(w.D, w.D.playerId, { runId: `dx-${n}` })),
      await postGhost(w.rig, w.D, uploadFor(w.D, w.P.playerId, { runId: `dy-${n}` })),
    ];
    expect(ups.map((r) => r.status), `${why}: uploads by P, by D (own id), by D (under P)`).toEqual([410, 410, 410]);
    expect((await readProfile(w.rig, w.D)).status, `${why}: a profile read by D`).toBe(410);
    expect((await requestCode(w.rig, w.D)).status, `${why}: a code request by D`).toBe(410);
    const { ids } = await drawn(w.rig, w.Z.playerId, draws);
    for (const gone of [w.g.d, w.g.p, w.g.d2]) expect(ids, `${why}: a deleted ghost is served`).not.toContain(ghostId(gone));
    expect(ids.length, `${why}: the bystander's ghost is served`).toBeGreaterThan(0);
  }

  it("a LIST that is stuck: the DELETE goes on after the bound, and from then on P's and D's uploads are 410 and their ghosts are not served, while the reload is still stuck and after it ends", async () => {
    const w = await world();
    const s = spy(w.rig);
    const g = closedGate();
    s.listHold = { when: "before", gate: g.gate };
    expect((await deleteMe(w.rig, w.P)).status).toBe(200);
    expect(s.lists, "one reload, stuck at its LIST").toBe(1);
    await everythingRefused(w, "while the LIST is stuck");
    expect(s.lists, "still the one reload").toBe(1);
    g.release();
    await w.rig.app.links.settleReload();
    await everythingRefused(w, "after the stuck reload ended", 30);
    s.restore();
  });

  it("a listing taken BEFORE the DELETE and delivered after it: nothing is lost, and the next refresh reads this machine's own tombstone once", async () => {
    const w = await world();
    const s = spy(w.rig);
    const g = closedGate();
    s.listHold = { when: "after", gate: g.gate }; // the reload has its listing (without P's tombstone) and waits
    expect((await deleteMe(w.rig, w.P)).status).toBe(200);
    await everythingRefused(w, "while the old listing is held");
    g.release();
    await w.rig.app.links.settleReload();
    await everythingRefused(w, "after the old listing was applied");
    s.listHold = null;
    s.reads.length = 0;
    w.rig.clock.now += TTL + 1;
    await w.rig.app.links.settleReload();
    expect(s.reads, "the refresh after it reads the DELETE's own tombstone, and only that").toEqual([`tombstones/${w.P.playerId}.json`]);
    w.rig.clock.now += TTL + 1;
    s.reads.length = 0;
    await w.rig.app.links.settleReload();
    expect(s.reads, "and then it is held").toEqual([]);
    await everythingRefused(w, "after the own tombstone was read");
    s.restore();
  });

  it("the reload that was in flight fails after the DELETE: the set is kept (P's and D's ids are in it), one log line, and the retry 5 s on", async () => {
    const w = await world();
    const s = spy(w.rig);
    const g = closedGate();
    s.listHold = { when: "after", gate: g.gate, thenFail: true };
    expect((await deleteMe(w.rig, w.P)).status).toBe(200);
    g.release();
    await w.rig.app.links.settleReload();
    expect(lines(w.rig.log, REFRESH_FAILED)).toBe(1);
    await everythingRefused(w, "after the reload failed");
    s.listHold = null;
    s.reads.length = 0;
    w.rig.clock.now += 5_000;
    await w.rig.app.links.settleReload();
    expect(s.reads, "the retry at 5 s reads the own tombstone").toEqual([`tombstones/${w.P.playerId}.json`]);
    await everythingRefused(w, "after the retry");
    s.restore();
  });

  it("a FULL read in flight with every read hung (20 other tombstones): the DELETE goes on, P's and D's uploads are 410 at once, and when the reload ends nothing is lost", async () => {
    const w = await world(20);
    w.rig.clock.now += TOMBSTONE_FULL_READ_MS; // the next reload is a full read
    const s = spy(w.rig);
    const g = closedGate();
    s.readGate = g.gate;
    s.exempt.add(`tombstones/${w.P.playerId}.json`); // (the DELETE's own read of an earlier tombstone of P is not the reload's)
    expect((await deleteMe(w.rig, w.P)).status).toBe(200);
    expect(s.reads.length, "the full read started and is stuck with the pool full").toBe(POOL);
    await everythingRefused(w, "while every read of the full read hangs");
    g.release();
    s.readGate = null;
    await w.rig.app.links.settleReload();
    expect(w.rig.app.links.goneCount, "the 20 other tombstones' ids and P's, D's").toBe(22);
    await everythingRefused(w, "after the full read ended");
    s.restore();
  });
});

// ============================================================================================================== C. a hung LIST at the S3 level

describe("C. a hung LIST at the S3 level (Tigris on the fake S3: the client's own timeout is 2 s, with two retries)", () => {
  it("40 requests at once while the LIST hangs: all answered (201) while it still hangs, one LIST in flight; the reload then fails by itself: one log line, no id in it; the retry 5 s on", async () => {
    const rig = await open("tigris");
    await rig.restart();
    await rig.app.links.ensureFresh(); // the first load: nothing
    const devs: Identity[] = [];
    for (let i = 0; i < 40; i++) devs.push(await freshIdentity());
    rig.clock.now += TTL + 1;
    const fake = theFake();
    fake.hangNext(3, "LIST"); // all three attempts of the client
    const mark = fake.requests.length;
    const t0 = Date.now();
    const rs = await Promise.all(devs.map((d, i) => postGhost(rig, d, uploadFor(d, d.playerId, { runId: `w${i}` }))));
    const took = Date.now() - t0;
    expect(rs.map((r) => r.status)).toEqual(Array(40).fill(201));
    expect(lines(rig.log, REFRESH_FAILED), "the reload had not failed yet: they were answered while it hung").toBe(0);
    expect(fakeCounts(rig, mark).list, "one LIST (the first attempt) in flight for all 40").toBe(1);
    expect(took, "answered long before the 6 s the client needs to give up on the LIST").toBeLessThan(5000);
    await rig.app.links.settleReload(); // the client gives up after about 6 s
    expect(lines(rig.log, REFRESH_FAILED), "the one reload failed once").toBe(1);
    const failure = rig.log.find((l) => l.includes(REFRESH_FAILED)) ?? "";
    for (const d of devs) expect(failure, "no id in the line").not.toContain(d.playerId);
    expect(failure).toContain("identity list failed");
    expect(fakeCounts(rig, mark).list, "three attempts, nothing more").toBe(3);
    // the retry is 5 s on (the injected clock), one LIST
    const mark2 = fake.requests.length;
    rig.clock.now += 4_999;
    await rig.app.links.settleReload();
    expect(fakeCounts(rig, mark2).list, "4.999 s on: no reload").toBe(0);
    rig.clock.now += 1;
    await rig.app.links.settleReload();
    expect(fakeCounts(rig, mark2).list, "5 s on: the reload").toBe(1);
    fake.clearFaults();
  }, 60_000);
});

// ============================================================================================================== D. no rejection goes unhandled

describe("D. no rejection goes unhandled, and the log lines carry no id", () => {
  it("a first load that fails (20 waiters), a refresh that fails (20 waiters), a refresh that fails after every waiter has gone, one that succeeds after they went", async () => {
    const seen: unknown[] = [];
    const onRejection = (e: unknown) => seen.push(e);
    proc.on("unhandledRejection", onRejection);
    try {
      const { links, inner, log, clock, hold } = bare();
      const Q = idN(7, "q");
      await inner.put(`tombstones/${Q}.json`, tomb([Q]));
      // 1. the first load fails with 20 waiters
      let g = closedGate();
      hold.gate = g.gate;
      hold.fail = true;
      const first = Array.from({ length: 20 }, () => links.ensureFresh().then(() => "ok", (e: unknown) => (e instanceof StorageError ? "503" : "other")));
      await sleep(TOMBSTONE_WAIT_MS + 50);
      g.release();
      expect(await Promise.all(first), "all 20 get the StorageError").toEqual(Array(20).fill("503"));
      // 2. the next request makes the first load again, and it succeeds
      hold.fail = false;
      hold.gate = null;
      await links.ensureFresh();
      expect(links.isGone(Q)).toBe(true);
      // 3. a refresh that fails with 20 waiters (released by the failure)
      const Q2 = idN(8, "q");
      await inner.put(`tombstones/${Q2}.json`, tomb([Q2]));
      clock.now += TTL + 1;
      g = closedGate();
      hold.gate = g.gate;
      hold.fail = true;
      const second = Array.from({ length: 20 }, () => links.ensureFresh().then(() => "ok", () => "threw"));
      await sleep(30);
      g.release();
      expect(await Promise.all(second), "a failed refresh releases every waiter, and nobody gets an exception").toEqual(Array(20).fill("ok"));
      expect(lines(log, REFRESH_FAILED), "one line").toBe(1);
      // 4. a refresh that fails AFTER every waiter has gone (the bound won)
      clock.now += 5_000;
      g = closedGate();
      hold.gate = g.gate;
      const third = Array.from({ length: 5 }, () => links.ensureFresh().then(() => "ok", () => "threw"));
      expect(await Promise.all(third), "the waiters left at the bound").toEqual(Array(5).fill("ok"));
      g.release(); // now the reload fails (hold.fail is still set)
      await links.settleReload();
      expect(lines(log, REFRESH_FAILED), "the second failure, logged once").toBe(2);
      // 5. one that succeeds after the waiters went
      hold.fail = false;
      hold.gate = null;
      clock.now += 5_000;
      g = closedGate();
      hold.gate = g.gate;
      await links.ensureFresh(); // goes on at the bound
      g.release();
      hold.gate = null;
      await links.settleReload();
      expect(links.isGone(Q2), "and the result applied").toBe(true);
      // 6. main.ts: ensureFresh().catch(log) for a first load that fails, with nobody else waiting
      const second1 = bare();
      second1.hold.fail = true;
      await second1.inner.put(`tombstones/${Q}.json`, tomb([Q]));
      await second1.links.ensureFresh().catch((e: unknown) => second1.log.push(`caught ${e instanceof Error ? e.message : String(e)}`));
      expect(second1.log).toEqual(["caught identity read failed: HTTP 500"]);
      await sleep(100);
      await sleep(0); // (unhandled rejections are reported when the turn ends)
    } finally {
      proc.off("unhandledRejection", onRejection);
    }
    expect(seen, "no unhandled rejection in any of the six cases").toEqual([]);
  });

  it.each(KINDS)("the reload's log lines carry no id and no key (%s): a failed refresh, an unreadable tombstone, a tombstone returned as nothing", async (kind) => {
    const rig = await open(kind);
    const ids = await otherMachineDeletes(rig, 4, "a");
    await rig.app.links.store.put("tombstones/junk.json", "{this is not a tombstone");
    await rig.restart();
    const s = spy(rig);
    s.absent = new Set([`tombstones/${ids[1]}.json`]);
    for (let n = 0; n < 4; n++) await rig.app.links.settleReload(); // first load: one unreadable, one absent (IDENT-2 fix A: three failed first loads, then the 4th goes on without the absent one)
    s.absent.clear();
    rig.clock.now += TTL + 1;
    s.failList = true;
    await rig.app.links.settleReload(); // a failed refresh
    s.restore();
    const text = rig.log.join("\n");
    expect(lines(rig.log, UNREADABLE), "logged by the load that succeeded").toBe(1);
    expect(lines(rig.log, "1 listed tombstone(s) not found"), "the three failed loads and the one that went on, each with a count").toBe(4);
    expect(lines(rig.log, REFRESH_FAILED)).toBe(1);
    for (const id of ids) expect(text, "no tombstone id in the log").not.toContain(id);
    expect(text).not.toContain("tombstones/");
    expect(text).not.toContain("junk");
  });
});

// ============================================================================================================== E. two machines over one store

describe.each(KINDS)("E. two machines over one store, on %s", (kind) => {
  it("a NEW tombstone reaches the other machine at its next refresh: at 59.999 s it still takes P's and D's uploads and serves P's ghost; at 60 s it does not", async () => {
    const rig = await open(kind);
    const [P, D, Z] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    const gP = uploadFor(P, P.playerId, { runId: "p-1" });
    expect((await postGhost(rig, P, gP)).status).toBe(201);
    expect((await linkVia(rig, P, D)).joined.status).toBe(200);
    const sib = await openSibling(rig, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: salter() });
    expect((await requestCode(sib, Z)).status, "the other machine's first request loads the (empty) set").toBe(200);
    const t0 = rig.clock.now;
    rig.clock.now = t0 + 1_000;
    expect((await deleteMe(rig, P)).status).toBe(200); // on the first machine
    rig.clock.now = t0 + 59_999;
    // (D's link record is gone from the store, so on the other machine D is a lone key: it uploads under its own id, and under P it would be a 403)
    const inWindow = {
      upload: (await postGhost(sib, P, uploadFor(P, P.playerId, { runId: "p-2" }))).status,
      deviceUpload: (await postGhost(sib, D, uploadFor(D, D.playerId, { runId: "d-2" }))).status,
      deviceUnderP: (await postGhost(sib, D, uploadFor(D, P.playerId, { runId: "d-2b" }))).status,
      served: (await drawn(sib, Z.playerId, 20)).ids.includes(ghostId(gP)),
    };
    expect(inWindow, "what the other machine accepts until its refresh: P's upload, D's upload under its own id, and P's ghost").toEqual({ upload: 201, deviceUpload: 201, deviceUnderP: 403, served: true });
    rig.clock.now = t0 + 60_000;
    await sib.app.links.settleReload();
    const after = {
      upload: (await postGhost(sib, P, uploadFor(P, P.playerId, { runId: "p-3" }))).status,
      deviceUpload: (await postGhost(sib, D, uploadFor(D, D.playerId, { runId: "d-3" }))).status,
      served: (await drawn(sib, Z.playerId, 20)).ids.includes(ghostId(gP)),
    };
    expect(after, "from its refresh on: 410, 410, not served").toEqual({ upload: 410, deviceUpload: 410, served: false });
    expect(rig.app.links.isGone(P.playerId), "(the first machine had it from the DELETE on)").toBe(true);
  });

  it("a REWRITTEN tombstone: until the other machine's full read it takes K2's upload, serves K2's ghost, issues K2 a code and takes its profile (K2 is a lone key there); from the full read on all of it is 410", async () => {
    const rig = await open(kind);
    const [P, K1, K2, Z] = [await freshIdentity(), await freshIdentity(), await freshIdentity(), await freshIdentity()];
    const gK2 = uploadFor(K2, K2.playerId, { runId: "k2-old" }); // K2's ghost under its own id, stored before anything
    expect((await postGhost(rig, K2, gK2)).status).toBe(201);
    expect((await linkVia(rig, P, K1)).joined.status).toBe(200);
    const sib = await openSibling(rig, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: salter() }); // (opened after the ghost exists: a JSON-lines server reads its files when it opens)
    expect((await deleteMe(rig, P)).status).toBe(200);
    await sib.app.links.settleReload(); // the other machine loads P's tombstone (P, K1)
    // a machine that did not know the tombstone yet linked K2 to P; then P deletes again on the first machine: the tombstone is rewritten with K2
    const store = rig.app.links.store;
    await store.put(`players/${P.playerId}.json`, JSON.stringify({ keys: [K2.playerId], steam: [], at: rig.clock.now }));
    await store.put(`links/keys/${K2.playerId}.json`, JSON.stringify({ player: P.playerId, at: rig.clock.now }));
    rig.clock.now += TTL + 1;
    await rig.app.links.settleReload();
    expect((await deleteMe(rig, P)).status).toBe(200);
    expect(JSON.parse((await store.get(`tombstones/${P.playerId}.json`)) ?? "{}").ids).toContain(K2.playerId);
    expect(await store.get(`links/keys/${K2.playerId}.json`), "K2's link is gone: K2 is a lone key").toBeNull();
    rig.clock.now += TTL + 1;
    await sib.app.links.settleReload(); // a refresh: the held tombstone is not read again
    const window = {
      upload: (await postGhost(sib, K2, uploadFor(K2, K2.playerId, { runId: "k2-new" }))).status,
      ghostServed: (await drawn(sib, Z.playerId, 30)).ids.includes(ghostId(gK2)),
      code: (await requestCode(sib, K2)).status,
      profile: (await putWire(sib, earnedWire({ runs: 3 }), K2)).status,
    };
    console.log(`VIDENT2 E (${kind}): what the other machine does for the rewritten tombstone's K2 until its full read: ${JSON.stringify(window)}`);
    expect(window, "in the window the other machine treats K2 as a lone key").toEqual({ upload: 201, ghostServed: true, code: 200, profile: 200 });
    const residue = Object.keys(await identityRecords(rig)).filter((k) => k.includes(K2.playerId));
    expect(residue.some((k) => k.startsWith("players/")), "(the code request left a players/ record for the deleted key K2 on the shared store)").toBe(true);
    rig.clock.now += TOMBSTONE_FULL_READ_MS;
    await sib.app.links.settleReload();
    const late = {
      upload: (await postGhost(sib, K2, uploadFor(K2, K2.playerId, { runId: "k2-late" }))).status,
      ghostServed: (await drawn(sib, Z.playerId, 30)).ids.includes(ghostId(gK2)),
      code: (await requestCode(sib, K2)).status,
      profile: (await putWire(sib, earnedWire({ runs: 4 }), K2)).status,
      read: (await readProfile(sib, K2)).status,
    };
    expect(late, "from the full read on: 410 everywhere, and K2's ghost is not served").toEqual({ upload: 410, ghostServed: false, code: 410, profile: 410, read: 410 });
  });
});

// ============================================================================================================== F. FIX2's decisions

describe("F. FIX2's decisions", () => {
  const Q = idN(7, "q");

  it("goneLoadedAt is stamped at the reload's START: a reload that runs longer than the 60 s trust ends already due, and the next request starts another", async () => {
    const { links, inner, clock, hold } = bare();
    await links.ensureFresh();
    await inner.put(`tombstones/${Q}.json`, tomb([Q]));
    clock.now += TTL + 1;
    const g = closedGate();
    hold.gate = g.gate;
    await links.ensureFresh(); // goes on at the bound; the reload is stuck at its read
    clock.now += 70_000; // the reload runs 70 s on the injected clock
    g.release();
    hold.gate = null;
    await links.settleReload();
    expect(links.isGone(Q)).toBe(true);
    hold.lists = 0;
    await links.ensureFresh();
    expect(hold.lists, "the result is as old as the reload's start: a new reload began at once").toBe(1);
  });

  it("held is rebuilt as the listing: a tombstone that leaves the store and comes back with other ids is read again by the next REFRESH (not only by the full read)", async () => {
    const { links, inner, clock, hold } = bare();
    const [a, a2] = [idN(1, "a"), idN(2, "a")];
    await inner.put(`tombstones/${a}.json`, tomb([a]));
    await links.ensureFresh();
    expect(links.goneCount).toBe(1);
    await inner.delete(`tombstones/${a}.json`);
    clock.now += TTL + 1;
    await links.settleReload(); // the listing no longer has it: it leaves `held`
    await inner.put(`tombstones/${a}.json`, tomb([a, a2]));
    clock.now += TTL + 1;
    hold.reads = 0;
    await links.settleReload();
    expect(hold.reads, "read again").toBe(1);
    expect([links.isGone(a), links.isGone(a2), links.goneCount]).toEqual([true, true, 2]);
  });

  it("the retry stamp (now - ttl + 5000) cannot go negative with a clock that never runs backwards, from any start: a refresh is only due at now >= ttl", async () => {
    for (const start of [0, 1, 30_000, 59_999, 60_000]) {
      const { links, inner, clock, hold } = bare(start);
      await inner.put(`tombstones/${Q}.json`, tomb([Q]));
      await links.ensureFresh(); // the first load, at `start`
      await inner.put(`tombstones/${idN(9, "q")}.json`, tomb([idN(9, "q")])); // a new one, so that the refresh has a read to fail
      clock.now = start + TTL; // the earliest a refresh is due
      hold.fail = true;
      hold.lists = 0;
      await links.ensureFresh(); // fails: keeps the set, stamps the retry
      expect(hold.lists, `start ${start}: one reload`).toBe(1);
      hold.lists = 0;
      clock.now += 4_999;
      await links.ensureFresh();
      expect(hold.lists, `start ${start}: 4.999 s on, no reload`).toBe(0);
      clock.now += 1;
      await links.ensureFresh();
      expect(hold.lists, `start ${start}: 5 s on, the reload`).toBe(1);
      expect(links.isGone(Q), `start ${start}: the set was kept all along`).toBe(true);
    }
  });

  it("the only way to a negative stamp: loadTombstones() called by hand when no refresh is due, at a clock under 55 s. Then the set reads as never loaded, and it FAILS CLOSED (the next ensureFresh waits for the whole reload and a failure is a StorageError)", async () => {
    const { links, inner, clock, hold } = bare(10_000);
    await inner.put(`tombstones/${Q}.json`, tomb([Q]));
    await links.ensureFresh(); // held, at 10 s
    await inner.put(`tombstones/${idN(9, "q")}.json`, tomb([idN(9, "q")])); // a new one, so that the reload has a read to fail
    hold.fail = true;
    await links.loadTombstones(); // no route does this; the stamp is 10_000 - 60_000 + 5_000 < 0
    expect(links.isGone(Q), "the set is still held").toBe(true);
    const g = closedGate();
    hold.gate = g.gate;
    let answered = false;
    const p = links.ensureFresh().then(() => ((answered = true), "ok"), (e: unknown) => (e instanceof StorageError ? "StorageError" : "other"));
    await sleep(TOMBSTONE_WAIT_MS * 2 + 50);
    expect(answered, "the bound does not apply: it is waited for in full, as a first load").toBe(false);
    g.release();
    expect(await p, "and when the reload fails the request gets the StorageError").toBe("StorageError");
    hold.fail = false;
    hold.gate = null;
    clock.now += 1;
    await links.ensureFresh();
    expect(links.isGone(Q)).toBe(true);
  });

  it("a clock that steps BACK delays the refresh by the step (a negative age counts as fresh); this machine's own DELETE is not delayed", async () => {
    const { links, inner, clock, hold } = bare(10_000_000);
    const [P, K] = [idN(1, "p"), idN(2, "k")];
    await links.ensureFresh(); // held, at t0
    await inner.put(`tombstones/${Q}.json`, tomb([Q])); // another machine's
    clock.now = 10_000_000 - 3 * 3_600_000; // the clock steps back 3 hours
    hold.lists = 0;
    await links.ensureFresh();
    expect(hold.lists, "a refresh is not due (negative age)").toBe(0);
    expect(links.isGone(Q)).toBe(false);
    expect((await links.deletePlayer(P)).ids, "this machine's own DELETE still counts at once").toBe(1);
    expect([links.isGone(P)]).toEqual([true]);
    clock.now = 10_000_000 + TTL - 1;
    await links.ensureFresh();
    expect(hold.lists, "still not due 59.999 s past the old stamp").toBe(0);
    clock.now = 10_000_000 + TTL;
    await links.ensureFresh();
    expect([hold.lists, links.isGone(Q)], "due when the clock passes the old stamp + 60 s: 3 hours late").toEqual([1, true]);
    expect(links.isGone(K)).toBe(false);
  });

  it.each([[SIX_HOURS - 1, 0, "1 ms short of 6 hours on the clock: a refresh reads nothing"], [SIX_HOURS, 3, "at 6 hours on the clock: the full read (3 hours late in real time, the clock having run 3 hours behind from the step on)"]] as const)(
    "the 6-hour full read is anchored to clock readings, so a step back of 3 hours delays it by 3 hours of real time (probe at %i ms)",
    async (probe, reads, why) => {
      const t0 = 10_000_000;
      const { links, inner, clock, hold } = bare(t0);
      for (let n = 0; n < 3; n++) await inner.put(`tombstones/${idN(n, "f")}.json`, tomb([idN(n, "f")]));
      await links.ensureFresh(); // the first load: a full read of 3, at t0
      expect(hold.reads).toBe(3);
      clock.now = t0 - 3 * 3_600_000; // the clock steps back 3 hours
      hold.lists = 0;
      await links.ensureFresh();
      expect(hold.lists, "a negative age counts as fresh: no refresh while the clock is behind").toBe(0);
      clock.now = t0 + probe; // (a refresh is due: the last reload began at t0)
      hold.reads = 0;
      await links.settleReload();
      expect(hold.reads, why).toBe(reads);
    },
  );
});

// ============================================================================================================== G. counts and reads in flight at the fake S3

describe("G. request counts and reads in flight at the fake S3 (Tigris)", () => {
  it("the constants are the specified ones: a request waits 250 ms, the full read is every 6 hours, 8 reads are in flight", () => {
    expect([TOMBSTONE_WAIT_MS, TOMBSTONE_FULL_READ_MS, TOMBSTONE_READS_IN_FLIGHT]).toEqual([250, SIX_HOURS, POOL]);
  });

  it("k new tombstones (1, 7, 8, 9) cost the LIST plus k reads", async () => {
    const rig = await open("tigris");
    await otherMachineDeletes(rig, 5, "a");
    await rig.restart();
    const mark = () => theFake().requests.length;
    let m = mark();
    await rig.app.links.settleReload();
    expect(fakeCounts(rig, m), "the first load").toEqual({ list: 1, head: 5, get: 5 });
    for (const k of [1, 7, 8, 9]) {
      await otherMachineDeletes(rig, k, `k${k}x`);
      rig.clock.now += TTL + 1;
      m = mark();
      await rig.app.links.settleReload();
      expect(fakeCounts(rig, m), `${k} new`).toEqual({ list: 1, head: k, get: k });
    }
    expect(rig.app.links.goneCount).toBe(5 + 1 + 7 + 8 + 9);
  });

  it.each([[SIX_HOURS - 1, false], [SIX_HOURS, true]] as const)(
    "the full read comes 6 hours after the first load began and not 1 ms before (probe at %i ms); the next one 6 hours after THAT one began",
    async (probe, full) => {
      const rig = await open("tigris");
      await otherMachineDeletes(rig, 5, "a");
      await rig.restart();
      const mark = () => theFake().requests.length;
      await rig.app.links.settleReload(); // the first load, at the rig's fixed clock
      const t0 = rig.clock.now;
      await otherMachineDeletes(rig, 2, "n");
      rig.clock.now = t0 + probe; // (a refresh is due: the first load began at t0)
      let m = mark();
      await rig.app.links.settleReload();
      expect(fakeCounts(rig, m), full ? "at 6 hours: every tombstone" : "1 ms short: the 2 new ones only").toEqual(full ? { list: 1, head: 7, get: 7 } : { list: 1, head: 2, get: 2 });
      if (!full) return;
      // the anchor moved to this full read: the refresh 61 s on is incremental, and the next full read is 6 hours after THIS one began
      const s = rig.clock.now;
      await otherMachineDeletes(rig, 1, "after");
      rig.clock.now = s + TTL + 1;
      m = mark();
      await rig.app.links.settleReload();
      expect(fakeCounts(rig, m), "61 s after the full read: only the new one").toEqual({ list: 1, head: 1, get: 1 });
      await otherMachineDeletes(rig, 1, "later");
      rig.clock.now = s + SIX_HOURS - 1;
      m = mark();
      await rig.app.links.settleReload();
      expect(fakeCounts(rig, m), "6 h - 1 ms after the full read: only the new one").toEqual({ list: 1, head: 1, get: 1 });
      rig.clock.now = s + SIX_HOURS + TTL + 1;
      m = mark();
      await rig.app.links.settleReload();
      expect(fakeCounts(rig, m), "a refresh more than 6 h after the full read: every tombstone again").toEqual({ list: 1, head: 9, get: 9 });
      expect(rig.app.links.goneCount).toBe(9);
    },
  );

  it("never more than 8 requests in flight AT THE FAKE S3: the first load of 40, a refresh of 30, a refresh of 3, a full read of 73", async () => {
    const rig = await open("tigris");
    await otherMachineDeletes(rig, 40, "a");
    await rig.restart();
    const inst = instrumentFake();
    try {
      const phase = async (what: string, expectedReads: number) => {
        inst.reset();
        const m = theFake().requests.length;
        await rig.app.links.settleReload();
        const c = fakeCounts(rig, m);
        expect([c.head, c.get], `${what}: HEAD and GET`).toEqual([expectedReads, expectedReads]);
        expect(inst.max(), `${what}: the most requests in flight at the fake`).toBe(Math.min(POOL, expectedReads));
      };
      await phase("first load", 40);
      await otherMachineDeletes(rig, 30, "b");
      rig.clock.now += TTL + 1;
      await phase("refresh of 30", 30);
      await otherMachineDeletes(rig, 3, "c");
      rig.clock.now += TTL + 1;
      await phase("refresh of 3", 3);
      rig.clock.now += TOMBSTONE_FULL_READ_MS;
      await phase("full read", 73);
    } finally {
      inst.restore();
    }
    expect(rig.app.links.goneCount).toBe(73);
  });

  it("this machine's own DELETE: the DELETE itself reads no tombstone; the next refresh costs the LIST and one read, and its ids were gone at once", async () => {
    const rig = await open("tigris");
    await otherMachineDeletes(rig, 3, "a");
    await rig.restart();
    await rig.app.links.settleReload();
    const K = await freshIdentity();
    const m = theFake().requests.length;
    expect((await deleteMe(rig, K)).status).toBe(200);
    const during = fakeCounts(rig, m);
    expect(during.list + during.get, "no LIST and no GET of tombstones during the DELETE (only the PUT)").toBe(0);
    expect(rig.app.links.isGone(K.playerId)).toBe(true);
    rig.clock.now += TTL + 1;
    const m2 = theFake().requests.length;
    await rig.app.links.settleReload();
    expect(fakeCounts(rig, m2)).toEqual({ list: 1, head: 1, get: 1 });
  });
});

// ============================================================================================================== H. a reload that fails part way

describe.each(KINDS)("H. a reload that fails at the LAST read, or in the middle of a FULL read, on %s", (kind) => {
  it("a refresh that fails at its last read: nothing applied, nothing held, the next refresh reads the same keys again", async () => {
    const rig = await open(kind);
    await otherMachineDeletes(rig, 5, "o");
    await rig.restart();
    await rig.app.links.settleReload();
    const fresh = await otherMachineDeletes(rig, 6, "n");
    rig.clock.now += TTL + 1;
    const s = spy(rig);
    s.failOn = (n) => n === 6; // the last of the six
    await rig.app.links.settleReload();
    expect(s.reads.length, "all six were started").toBe(6);
    expect(rig.app.links.goneCount, "none of the five that were read is applied").toBe(5);
    for (const id of fresh) expect(rig.app.links.isGone(id)).toBe(false);
    expect(lines(rig.log, REFRESH_FAILED)).toBe(1);
    s.failOn = null;
    s.reads.length = 0;
    rig.clock.now += 5_000;
    await rig.app.links.settleReload();
    expect(s.reads.slice().sort(), "the same six keys").toEqual(fresh.map((id) => `tombstones/${id}.json`).sort());
    expect(rig.app.links.goneCount).toBe(11);
    s.restore();
  });

  it("a reload that fails at its FIRST read ends only after the reads still in flight have ended and starts no new read: the retry never overlaps them (the limit holds across two reloads)", async () => {
    const rig = await open(kind);
    await otherMachineDeletes(rig, 3, "o");
    await rig.restart();
    await rig.app.links.settleReload();
    await otherMachineDeletes(rig, 20, "n");
    rig.clock.now += TTL + 1;
    const s = spy(rig);
    const g = closedGate();
    s.readGate = g.gate; // every read waits for the gate, and the first one then fails
    s.failOn = (n) => n === 1;
    const p = rig.app.links.settleReload();
    await sleep(150);
    expect(s.reads.length, "8 reads started and are waiting").toBe(POOL);
    expect(lines(rig.log, REFRESH_FAILED)).toBe(0);
    g.release();
    await p;
    expect(lines(rig.log, REFRESH_FAILED), "the one failure").toBe(1);
    expect(s.inFlight, "it was reported only when the reads in flight had ended").toBe(0);
    expect(s.reads.length, "and no new read was started after the failure").toBe(POOL);
    expect(rig.app.links.goneCount, "nothing applied").toBe(3);
    s.restore();
  });

  it("a FULL read that fails in the middle changes nothing and is not stamped: the retry 5 s on is a full read again (every key), as FIX2-REPORT section 7 says", async () => {
    const rig = await open(kind);
    await otherMachineDeletes(rig, 12, "o");
    await rig.restart();
    await rig.app.links.settleReload();
    const fresh = await otherMachineDeletes(rig, 2, "n");
    rig.clock.now += TOMBSTONE_FULL_READ_MS;
    const s = spy(rig);
    s.failOn = (n) => n === 7;
    await rig.app.links.settleReload();
    expect(rig.app.links.goneCount, "the set did not change").toBe(12);
    for (const id of fresh) expect(rig.app.links.isGone(id)).toBe(false);
    s.failOn = null;
    s.reads.length = 0;
    rig.clock.now += 5_000;
    await rig.app.links.settleReload();
    expect(s.reads.length, "the retry is a full read: all 14 keys").toBe(14);
    expect(rig.app.links.goneCount).toBe(14);
    rig.clock.now += TTL + 1;
    s.reads.length = 0;
    await rig.app.links.settleReload();
    expect(s.reads.length, "and then it is incremental again").toBe(0);
    s.restore();
  });
});
