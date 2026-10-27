// VERIFY-IDENT2 (REQ-BFG-122 clause 4) step 4, item f (deletion), written by the independent re-checker H-F. ATTACKS that tests/ident2.delete.test.ts, ident2.admin.test.ts
// and ident2.review.test.ts do not make; nothing in them is repeated. Both backing stores (the JSON-lines directory, Tigris on the in-process fake S3) wherever the store matters.
// A test that passes pins what was observed; "FINDING:" names behaviour that breaks the brief, "NOTE:" is worth knowing.
//   4f-1  a history PUT / list / entry read after this machine's DELETE is 410 whatever the tombstone reload is doing: stuck at its LIST, a listing taken BEFORE the DELETE and
//         delivered after it, a reload that fails after the DELETE, a full read with every read hung, a first load that fails or hangs after a restart
//   4f-2  the DELETE-during-PUT race: a grid of interleavings (the PUT paused at its LIST taken before / after the DELETE, before / after its write, at the cap's drop, at a repeat's
//         read; the DELETE paused at its 1st / 3rd LIST and its 1st / 2nd DELETE; both release orders; the DELETE from the first key and from a device): nothing is left behind
//   4f-3  two DELETEs at once (one machine, three keys; two machines)
//   4f-4  a store failure part way: at the last LIST, at a middle DELETE (no new request starts after it), at the S3 level on the fake; the repeat that finishes the job; the repeat
//         from a device whose link is already dropped (NOTE)
//   4f-5  at most 8 requests in flight, measured at the fake S3 (a full player)
//   4f-6  a lone key's earlier uploads under history/<K>/ when K later joins a player (ruling 4b): where they go on the DELETE and on purge-tombstoned
//   4f-7  two machines over one store: what the other machine accepts in its 60 s window, and that purge-tombstoned removes it afterwards
//   4f-8  purge-tombstoned: 16 at a time on Tigris, stray names, exit codes when the ghost part or the history part falls short, a missing object, one id in two tombstones
//   and: 4f-1b a READ already past its 410 check when the DELETE runs; 4f-2b PUTs queued behind a paused PUT, and a PUT whose own clean-up fails; 4f-6b the file store's leftovers
//   (empty folders, a .tmp); 4f-7b the other machine's window while its refresh is stuck; 4f-7c a device that linked on the other machine (30 s of 'not linked' cached).
// Run 5 (the file as it stands): 188 tests, all passed, with tests/vident3.fixes.test.ts: 230 of 230, 20 s. The grid of 4f-2 prints its 132 rows (and the other measured numbers) as VIDENT3 console lines.
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import { encodeEntry } from "../src/net/historyWire";
import { TOMBSTONE_FULL_READ_MS, decodeTombstone } from "../server/links";
import { FileLinkStore, TigrisLinkStore, type LinkStore } from "../server/linkStore";
import { StorageError } from "../server/store";
import { nameOf, type HistoryName, type HistoryStore } from "../server/historyStore";
import { JsonlAdmin, runAdmin, type AdminStore } from "../server/ghostAdmin";
import type { S3Client } from "../server/s3";
import { objectKey } from "../server/tigrisStore";
import type { FakeS3 } from "../tools/fakeS3";
import { FAKE_CREDS, s3For, startFake } from "./netStores";
import { closeRigs, deleteMe, freshIdentity, identityRecords, linkVia, openSibling, theFake } from "./identRig";
import {
  FINISHED, OPEN, allHistory, entryFor, getEntry, historyObjects, historyOf, historyRaw, listEntries, listedIds, markRequests, openHistoryRig, opsSince, putEntry, writeObject,
  type Kind, type Reply, type Rig,
} from "./ident2Rig";

let pfake: FakeS3; // the purge tests' own fake S3 (default page size)
const pdirs: string[] = [];
const grid: string[] = [];
beforeAll(async () => {
  pfake = await startFake();
});
afterAll(async () => {
  console.log(`VIDENT3 4f-2 interleavings (PUT paused at | DELETE paused at | order | from -> PUT status, DELETE status):\n${grid.join("\n")}`);
  await pfake.close();
  await closeRigs();
  for (const d of pdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const KINDS: Kind[] = ["jsonl", "tigris"];
const GONE = { error: "this player was deleted" };
const TTL = 60_000; // the refresh time (server/links.ts TOMBSTONE_TTL_MS)
const REFRESH_FAILED = "tombstone refresh failed, keeping the set";
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const lines = (log: string[], what: string): number => log.filter((l) => l.includes(what)).length;
const tomb = (ids: string[], at = 1): string => JSON.stringify({ at, ids });
const keyOfT = (id: string): string => `tombstones/${id}.json`;
const closedGate = (): { gate: Promise<void>; release: () => void } => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { gate, release };
};

/** Put an entry object straight into the store under `owner` (a machine that wrote it earlier, or later). Take no Pauser before it. */
async function planted(rig: Rig, owner: string, id: string, finishedAt = FINISHED): Promise<string> {
  await historyOf(rig).put(owner, { finishedAt, id }, encodeEntry(entryFor(id, { finishedAt })));
  return nameOf({ finishedAt, id });
}
const mine = (rig: Rig, ...who: Identity[]): string[] => who.flatMap((x) => historyObjects(rig, x.playerId));

// ================================================================================================================ spies and pauses

/** A spy on the tombstone reads and LISTs of `rig`'s current server (take it after a restart). */
interface Spy {
  lists: number;
  reads: string[];
  readGate: Promise<void> | null;
  /** The LIST waits for `gate` before it asks the store ("before": a stuck LIST) or after it has the listing ("after": a listing taken before a DELETE). */
  listHold: { when: "before" | "after"; gate: Promise<void>; thenFail?: boolean } | null;
  failList: boolean;
  exempt: Set<string>;
  restore(): void;
}
function spy(rig: Rig): Spy {
  const store = rig.app.links.store as { get: LinkStore["get"]; list: LinkStore["list"] };
  const get = store.get.bind(store), list = store.list.bind(store);
  const s: Spy = { lists: 0, reads: [], readGate: null, listHold: null, failList: false, exempt: new Set(), restore: () => ((store.get = get), (store.list = list)) };
  store.get = async (k: string) => {
    if (!k.startsWith("tombstones/") || s.exempt.has(k)) return get(k);
    s.reads.push(k);
    await sleep(1);
    if (s.readGate) await s.readGate;
    return get(k);
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

type HOp = "list" | "get" | "put" | "delete";
interface Hold {
  reached: Promise<void>;
  release(): void;
}
/** Wraps the history store of a rig: counts the calls of each operation and holds the n-th call of an operation (counted since the last resetCounts) before or after it runs. */
class Pauser {
  readonly calls: Record<HOp, number> = { list: 0, get: 0, put: 0, delete: 0 };
  private readonly holds: { op: HOp; nth: number; when: "before" | "after"; fired: boolean; mark: () => void; gate: Promise<void> }[] = [];
  private readonly real: Pick<HistoryStore, "list" | "get" | "put" | "delete">;
  constructor(private readonly store: HistoryStore) {
    this.real = { list: store.list.bind(store), get: store.get.bind(store), put: store.put.bind(store), delete: store.delete.bind(store) };
    const real = this.real;
    store.list = (p) => this.run("list", () => real.list(p));
    store.get = (p, n) => this.run("get", () => real.get(p, n));
    store.put = (p, n, t) => this.run("put", () => real.put(p, n, t));
    store.delete = (p, n) => this.run("delete", () => real.delete(p, n));
  }
  hold(op: HOp, nth: number, when: "before" | "after" = "before"): Hold {
    let mark!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => (mark = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    this.holds.push({ op, nth, when, fired: false, mark, gate });
    return { reached, release };
  }
  resetCounts(): void {
    for (const op of ["list", "get", "put", "delete"] as const) this.calls[op] = 0;
  }
  restore(): void {
    Object.assign(this.store, this.real);
  }
  private async run<T>(op: HOp, fn: () => Promise<T>): Promise<T> {
    const n = ++this.calls[op];
    const h = this.holds.find((x) => !x.fired && x.op === op && x.nth === n);
    if (!h) return fn();
    h.fired = true;
    if (h.when === "before") {
      h.mark();
      await h.gate;
      return fn();
    }
    const r = await fn();
    h.mark();
    await h.gate;
    return r;
  }
}
async function arrived(h: Hold, what: string): Promise<void> {
  const r = await Promise.race([h.reached.then(() => "ok"), sleep(8_000).then(() => "timeout")]);
  if (r !== "ok") throw new Error(`the pause of ${what} was never reached`);
}

// ================================================================================================================ 4f-1: whatever a reload is doing

describe.each(KINDS)("4f-1. a history PUT, list or entry read after this machine's DELETE is 410, whatever the tombstone reload is doing (%s)", (kind) => {
  interface World {
    rig: Rig;
    P: Identity;
    D: Identity;
    Z: Identity;
  }
  /** P (first key) with the device D; P's p-1, D's d-1 (stored under P), d-old under D's own id; a bystander Z with z-1. The server has restarted and loaded its set; a refresh is due. */
  async function world(others = 0): Promise<World> {
    const rig = await openHistoryRig(kind);
    const [P, D, Z] = await Promise.all([freshIdentity(), freshIdentity(), freshIdentity()]);
    expect((await linkVia(rig, P, D)).joined.status).toBe(200);
    expect((await putEntry(rig, P, entryFor("p-1", { finishedAt: FINISHED }))).status).toBe(201);
    expect((await putEntry(rig, D, entryFor("d-1", { finishedAt: FINISHED - 1_000 }))).status).toBe(201);
    await planted(rig, D.playerId, "d-old", FINISHED - 5_000);
    expect((await putEntry(rig, Z, entryFor("z-1"))).status).toBe(201);
    for (let n = 0; n < others; n++) await rig.app.links.store.put(keyOfT(`other${String(n).padStart(4, "0")}${"x".repeat(30)}`), tomb([`other${String(n).padStart(4, "0")}${"x".repeat(30)}`]));
    await rig.restart();
    await rig.app.links.ensureFresh(); // the first load
    rig.clock.now += TTL + 1; // a refresh is due
    return { rig, P, D, Z };
  }
  let seq = 0;
  const eight = (rig: Rig, P: Identity, D: Identity, n: number): Promise<Reply[]> =>
    Promise.all([
      putEntry(rig, P, entryFor(`new-p-${n}`)),
      putEntry(rig, D, entryFor(`new-d-${n}`)),
      putEntry(rig, P, entryFor("p-1", { finishedAt: FINISHED })), // an old entry again
      putEntry(rig, D, entryFor("d-1", { finishedAt: FINISHED - 1_000 })),
      listEntries(rig, P), listEntries(rig, D),
      getEntry(rig, P, "p-1"), getEntry(rig, D, "d-1"),
    ]);
  /** Eight requests that could serve or take P's or D's history: all 410, nothing created, the bystander served as before. */
  async function refused(w: World, why: string): Promise<void> {
    const rs = await eight(w.rig, w.P, w.D, ++seq);
    expect(rs.map((r) => [r.status, r.json]), why).toEqual(Array.from({ length: 8 }, () => [410, GONE]));
    expect(mine(w.rig, w.P, w.D), `${why}: nothing of P's or D's is stored`).toEqual([]);
    expect(listedIds(await listEntries(w.rig, w.Z)), `${why}: the bystander is served`).toEqual(["z-1"]);
  }

  it("a LIST that is stuck: the DELETE goes on after the bound; from then on all eight are 410 while the reload is still stuck, and after it ends", async () => {
    const w = await world();
    const s = spy(w.rig);
    const g = closedGate();
    s.listHold = { when: "before", gate: g.gate };
    expect((await deleteMe(w.rig, w.P)).status).toBe(200);
    expect(s.lists, "one reload, stuck at its LIST").toBe(1);
    expect(mine(w.rig, w.P, w.D), "the history went with the DELETE").toEqual([]);
    await refused(w, "while the LIST is stuck");
    expect(s.lists, "still the one reload").toBe(1);
    g.release();
    await w.rig.app.links.settleReload();
    await refused(w, "after the stuck reload ended");
    s.restore();
  });

  it("a listing taken BEFORE the DELETE and delivered after it: all eight are 410 while it is held and after it is applied; the next refresh reads this machine's own tombstone", async () => {
    const w = await world();
    const s = spy(w.rig);
    const g = closedGate();
    s.listHold = { when: "after", gate: g.gate };
    expect((await deleteMe(w.rig, w.P)).status).toBe(200);
    await refused(w, "while the old listing is held");
    g.release();
    await w.rig.app.links.settleReload();
    await refused(w, "after the old listing was applied");
    s.listHold = null;
    w.rig.clock.now += TTL + 1;
    await w.rig.app.links.settleReload();
    await refused(w, "after the refresh that read the own tombstone");
    s.restore();
  });

  it("the reload that was in flight fails after the DELETE: all eight are 410, one log line, and the retry 5 s on keeps it so", async () => {
    const w = await world();
    const s = spy(w.rig);
    const g = closedGate();
    s.listHold = { when: "after", gate: g.gate, thenFail: true };
    expect((await deleteMe(w.rig, w.P)).status).toBe(200);
    g.release();
    await w.rig.app.links.settleReload();
    expect(lines(w.rig.log, REFRESH_FAILED)).toBe(1);
    await refused(w, "after the reload failed");
    // the refresh keeps failing for ten minutes: the set is kept, and so is the 410
    s.failList = true;
    for (let n = 0; n < 12; n++) {
      w.rig.clock.now += 50_000;
      await w.rig.app.links.settleReload();
    }
    expect(lines(w.rig.log, REFRESH_FAILED), "a failed refresh every 5 s .. 60 s of the clock, each logged once").toBeGreaterThan(5);
    await refused(w, "after ten minutes of failing refreshes");
    s.failList = false;
    s.restore();
  });

  it("a FULL read in flight with every read hung (20 other tombstones): all eight are 410 at once, and when the reload ends nothing is lost", async () => {
    const w = await world(20);
    w.rig.clock.now += TOMBSTONE_FULL_READ_MS; // the next reload is a full read
    const s = spy(w.rig);
    const g = closedGate();
    s.readGate = g.gate;
    s.exempt.add(keyOfT(w.P.playerId)); // (the DELETE's own read of an earlier tombstone of P is not the reload's)
    expect((await deleteMe(w.rig, w.P)).status).toBe(200);
    await refused(w, "while every read of the full read hangs");
    g.release();
    s.readGate = null;
    await w.rig.app.links.settleReload();
    expect(w.rig.app.links.goneCount, "the 20 others', P's and D's ids").toBe(22);
    await refused(w, "after the full read ended");
    s.restore();
  });

  it("after a RESTART the set is empty: while the first load FAILS all eight are 503 (never a 200, nothing stored), and 410 once the store is back", async () => {
    const w = await world();
    expect((await deleteMe(w.rig, w.P)).status).toBe(200);
    const before = allHistory(w.rig);
    await w.rig.restart(); // the set is held in memory only
    const s = spy(w.rig);
    s.failList = true;
    const rs = await eight(w.rig, w.P, w.D, 900);
    expect(rs.map((r) => [r.status, r.headers.get("retry-after")]), "the first load fails closed for the history routes").toEqual(Array.from({ length: 8 }, () => [503, "5"]));
    expect(w.rig.app.links.goneCount).toBe(0);
    expect(allHistory(w.rig), "nothing was stored or removed").toEqual(before);
    // and a player cannot delete their data on a machine whose first load fails (IDENT-1 FIX2 by design: the DELETE route waits for the set too)
    expect([(await deleteMe(w.rig, w.Z)).status, (await listEntries(w.rig, w.Z)).status]).toEqual([503, 503]);
    expect(historyObjects(w.rig, w.Z.playerId), "Z's history is untouched by the refused DELETE").toHaveLength(1);
    s.failList = false;
    await refused(w, "when the store is back");
    expect((await deleteMe(w.rig, w.Z)).status, "and the bystander's own DELETE works then").toBe(200);
    expect(historyObjects(w.rig, w.Z.playerId)).toEqual([]);
    s.restore();
  });

  it("after a RESTART a first load that HANGS holds every history request (unbounded by design): none is answered, none stores anything; when it ends they are 410", async () => {
    const w = await world();
    expect((await deleteMe(w.rig, w.P)).status).toBe(200);
    const before = allHistory(w.rig);
    await w.rig.restart();
    const s = spy(w.rig);
    const g = closedGate();
    s.listHold = { when: "before", gate: g.gate };
    const pending = eight(w.rig, w.P, w.D, 901);
    const raced = await Promise.race([pending.then(() => "answered"), sleep(700).then(() => "waiting")]);
    expect(raced, "twice the 250 ms bound later all eight still wait").toBe("waiting");
    expect(allHistory(w.rig)).toEqual(before);
    g.release();
    expect((await pending).map((r) => [r.status, r.json])).toEqual(Array.from({ length: 8 }, () => [410, GONE]));
    s.restore();
  });
});

// ================================================================================================================ 4f-2: the DELETE-during-PUT race

type PutKind = "new" | "repeat" | "cap";
interface PutPause {
  name: string;
  op: HOp;
  when: "before" | "after";
  entry: PutKind;
  /** The PUT's answer: 410 when it still has its write or its look at the tombstone set to do after the DELETE began; 201 at the cap's drop (past both); 200 for a repeat. */
  expect: number;
}
interface DelPause {
  name: string;
  op: HOp | null;
  nth: number;
}
const PUT_PAUSES: PutPause[] = [
  { name: "its LIST, taken before the DELETE (stale)", op: "list", when: "after", entry: "new", expect: 410 },
  { name: "its LIST, taken after the DELETE", op: "list", when: "before", entry: "new", expect: 410 },
  { name: "its write, not yet made", op: "put", when: "before", entry: "new", expect: 410 },
  { name: "its write, made and not yet answered", op: "put", when: "after", entry: "new", expect: 410 },
  { name: "the cap's drop of the oldest", op: "delete", when: "before", entry: "cap", expect: 201 },
  { name: "a repeat's read of the stored entry", op: "get", when: "after", entry: "repeat", expect: 200 },
];
const DEL_PAUSES: DelPause[] = [
  { name: "no pause", op: null, nth: 0 },
  { name: "its 1st LIST", op: "list", nth: 1 },
  { name: "its 3rd LIST", op: "list", nth: 3 },
  { name: "its 1st DELETE", op: "delete", nth: 1 },
  { name: "its 2nd DELETE", op: "delete", nth: 2 },
];

describe.each(KINDS)("4f-2. the DELETE-during-PUT race leaves nothing behind on this machine (%s)", (kind) => {
  async function interleave(p: PutPause, d: DelPause, order: "put-first" | "delete-first", from: "first key" | "device"): Promise<void> {
    const rig = await openHistoryRig(kind);
    const [A, B, C, Z] = await Promise.all([freshIdentity(), freshIdentity(), freshIdentity(), freshIdentity()]);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await linkVia(rig, A, C)).joined.status).toBe(200);
    await planted(rig, A.playerId, "a-1", FINISHED);
    await planted(rig, A.playerId, "a-2", FINISHED - 1_000);
    await planted(rig, B.playerId, "b-old", FINISHED - 5_000);
    await planted(rig, C.playerId, "c-old", FINISHED - 6_000);
    await planted(rig, Z.playerId, "z-1", FINISHED);
    if (p.entry === "cap") for (let i = 0; i < 198; i++) await planted(rig, A.playerId, `e-${String(i).padStart(3, "0")}`, FINISHED - 10_000 - i * 1_000);
    await rig.app.links.ensureFresh(); // the first load: the PUT does not pay for it
    const pause = new Pauser(historyOf(rig));
    const putHold = pause.hold(p.op, 1, p.when);
    const entry = p.entry === "repeat" ? entryFor("a-1", { finishedAt: FINISHED }) : entryFor("race-new", { finishedAt: FINISHED + 5_000 });
    const putP = putEntry(rig, B, entry); // B is a device: the PUT lands under A
    await arrived(putHold, `the PUT (${p.name})`);
    pause.resetCounts();
    const delHold = d.op ? pause.hold(d.op, d.nth, "before") : null;
    const delP = deleteMe(rig, from === "first key" ? A : C);
    let put = undefined as Reply | undefined; // (assigned in the closures below: the cast keeps the declared type for the checker)
    let del = undefined as Reply | undefined;
    if (delHold) await arrived(delHold, `the DELETE (${d.name})`);
    else del = await delP;
    const finishPut = async (): Promise<void> => {
      putHold.release();
      put = await putP;
    };
    const finishDel = async (): Promise<void> => {
      delHold?.release();
      del = await delP;
    };
    if (order === "put-first") {
      await finishPut();
      await finishDel();
    } else {
      await finishDel();
      await finishPut();
    }
    pause.restore();
    grid.push(`${kind} | ${p.name} | ${d.name} | ${delHold ? order : "-"} | ${from} -> PUT ${put?.status}, DELETE ${del?.status}`);
    expect(del?.status, "the DELETE").toBe(200);
    expect(put?.status, `the PUT (${put?.text})`).toBe(p.expect);
    expect(mine(rig, A, B, C), "nothing of the player's or its keys' is left in the store").toEqual([]);
    expect(historyObjects(rig, Z.playerId), "the bystander's entry stays").toHaveLength(1);
    expect(Object.keys(await identityRecords(rig)), "one tombstone and nothing else").toEqual([`tombstones/${A.playerId}.json`]);
    expect(await putEntry(rig, B, entryFor("after-1")), "a PUT after it").toMatchObject({ status: 410, json: GONE });
    expect(await listEntries(rig, A), "a list after it").toMatchObject({ status: 410, json: GONE });
    expect(await getEntry(rig, C, "a-1"), "an entry read after it").toMatchObject({ status: 410, json: GONE });
    expect(mine(rig, A, B, C), "and nothing was re-created").toEqual([]);
  }

  for (const p of PUT_PAUSES) {
    for (const d of DEL_PAUSES) {
      const orders: ("put-first" | "delete-first")[] = d.op ? ["put-first", "delete-first"] : ["put-first"];
      for (const order of orders) {
        it(`PUT paused at ${p.name}; DELETE (first key) ${d.op ? `paused at ${d.name}, ${order}` : "runs through"}`, () => interleave(p, d, order, "first key"));
      }
    }
    // from a device: a pause in the middle of the removal, and none
    it(`PUT paused at ${p.name}; DELETE from a device paused at its 1st DELETE, delete-first`, () => interleave(p, DEL_PAUSES[3], "delete-first", "device"));
    it(`PUT paused at ${p.name}; DELETE from a device runs through`, () => interleave(p, DEL_PAUSES[0], "put-first", "device"));
  }
});

// ================================================================================================================ 4f-3: two DELETEs at once

describe.each(KINDS)("4f-3. two DELETEs at once (%s)", (kind) => {
  it("one machine: the first key and two devices ask at once: all 200, the same end state as one DELETE, nothing of the history left", async () => {
    const rig = await openHistoryRig(kind);
    const [A, B, C] = await Promise.all([freshIdentity(), freshIdentity(), freshIdentity()]);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await linkVia(rig, A, C)).joined.status).toBe(200);
    for (const [who, id, at] of [[A, "a-1", 0], [B, "b-1", 1_000], [C, "c-1", 2_000]] as const) expect((await putEntry(rig, who, entryFor(id, { finishedAt: FINISHED - at }))).status).toBe(201);
    await planted(rig, B.playerId, "b-own", FINISHED - 9_000);
    const rs = await Promise.all([deleteMe(rig, A), deleteMe(rig, B), deleteMe(rig, C)]);
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(mine(rig, A, B, C)).toEqual([]);
    const tombs = Object.keys(await identityRecords(rig)).filter((k) => k.startsWith("tombstones/"));
    expect(tombs, "the player's tombstone, plus the stray own-id tombstones of the keys that asked after their link was gone (FIX2 finding E)").toContain(`tombstones/${A.playerId}.json`);
    expect(decodeTombstone((await identityRecords(rig))[`tombstones/${A.playerId}.json`])?.ids.slice().sort()).toEqual([A.playerId, B.playerId, C.playerId].sort());
    expect(rig.log.filter((l) => l.startsWith("error:") || l.startsWith("storage error:"))).toEqual([]);
  });

  it("two machines over one store: B's DELETE on the second machine runs through while the first machine's DELETE of A is held at its first history DELETE; then both end 200 and the store holds no history of the player", async () => {
    const m1 = await openHistoryRig(kind);
    const [A, B, C] = await Promise.all([freshIdentity(), freshIdentity(), freshIdentity()]);
    expect((await linkVia(m1, A, B)).joined.status).toBe(200);
    expect((await linkVia(m1, A, C)).joined.status).toBe(200);
    for (let i = 0; i < 6; i++) await planted(m1, A.playerId, `a-${i}`, FINISHED - i * 1_000);
    await planted(m1, B.playerId, "b-own");
    await planted(m1, C.playerId, "c-own");
    const m2 = await openSibling(m1, OPEN);
    await m1.app.links.ensureFresh();
    await m2.app.links.ensureFresh();
    const pause = new Pauser(historyOf(m1));
    const hold = pause.hold("delete", 2, "before");
    const d1 = deleteMe(m1, A);
    await arrived(hold, "machine 1's DELETE");
    expect((await deleteMe(m2, B)).status, "machine 2 runs its whole DELETE meanwhile").toBe(200);
    hold.release();
    expect((await d1).status).toBe(200);
    pause.restore();
    expect(mine(m1, A, B, C)).toEqual([]);
    expect(await putEntry(m1, B, entryFor("after-1"))).toMatchObject({ status: 410, json: GONE });
    expect(await listEntries(m1, A)).toMatchObject({ status: 410, json: GONE });
    // NOTE: M1 had dropped B's link before M2's DELETE ran, so M2's DELETE took B for a lone key and tombstoned B alone (FIX2 finding E): until M2's refresh it does not know A is gone
    expect(await putEntry(m2, B, entryFor("after-1"))).toMatchObject({ status: 410, json: GONE });
    expect(await listEntries(m2, A), "M2 has not seen A's tombstone yet").toMatchObject({ status: 200, json: { entries: [] } });
    m1.clock.now += TTL; // M2's refresh time
    expect(await putEntry(m2, A, entryFor("after-2"))).toMatchObject({ status: 410, json: GONE });
    expect(await listEntries(m2, A)).toMatchObject({ status: 410, json: GONE });
    expect(mine(m1, A, B, C)).toEqual([]);
  });
});

// ================================================================================================================ 4f-4: a store failure part way

describe.each(KINDS)("4f-4. a store failure part way, and the repeat that finishes the job (%s)", (kind) => {
  /** A rig with a player A of 24 keys and 100 entries under A and one under each of 10 keys (110 objects), restarted and loaded. */
  async function bigWorld() {
    const rig = await openHistoryRig(kind);
    const A = await freshIdentity();
    const keys = Array.from({ length: 24 }, (_, i) => `dev${String(i).padStart(3, "0")}${"x".repeat(30)}`);
    const store = rig.app.links.store;
    await store.put(`players/${A.playerId}.json`, JSON.stringify({ keys, steam: [], at: 1 }));
    for (const k of keys) await store.put(`links/keys/${k}.json`, JSON.stringify({ player: A.playerId, at: 1 }));
    for (let i = 0; i < 100; i++) await planted(rig, A.playerId, `e-${String(i).padStart(3, "0")}`, FINISHED - i * 1_000);
    for (let i = 0; i < 10; i++) await planted(rig, keys[i], `k-${i}`, FINISHED - 200_000 - i * 1_000);
    await rig.restart();
    await rig.app.links.settleReload();
    expect(allHistory(rig)).toHaveLength(110);
    return { rig, A, keys };
  }
  const total = 110;

  it("a failure at the LAST LIST (25 ids): no object has been deleted yet (the LISTs come first), the answer is 503, the player is gone (410) all the same, and the repeat removes all 110", async () => {
    const { rig, A } = await bigWorld();
    const h = historyOf(rig);
    const real = { list: h.list.bind(h) };
    let calls = 0;
    h.list = async (p) => {
      if (++calls === 25) {
        await sleep(2);
        throw new StorageError("history list failed: HTTP 503");
      }
      await sleep(1);
      return real.list(p);
    };
    const first = await deleteMe(rig, A);
    h.list = real.list;
    expect([first.status, first.headers.get("retry-after")]).toEqual([503, "5"]);
    expect(allHistory(rig), "nothing of the history was removed: the DELETEs start after all the LISTs").toHaveLength(total);
    expect(await putEntry(rig, A, entryFor("new-1"))).toMatchObject({ status: 410, json: GONE });
    expect(await listEntries(rig, A)).toMatchObject({ status: 410, json: GONE });
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(allHistory(rig)).toEqual([]);
    expect(lines(rig.log, "storage error: history list failed: HTTP 503")).toBe(1);
  });

  it("a failure at a MIDDLE DELETE (the 40th of 110): at most the 7 calls in flight finish and no new one starts, the answer is 503, what was removed stays removed, and the repeat finishes the rest", async () => {
    const { rig, A } = await bigWorld();
    const h = historyOf(rig);
    const real = { delete: h.delete.bind(h) };
    let started = 0, completed = 0, inFlight = 0, maxInFlight = 0;
    h.delete = async (p, n) => {
      const k = ++started;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await sleep(1);
        if (k === 40) throw new StorageError("history delete failed: HTTP 503");
        await real.delete(p, n);
        completed++;
      } finally {
        inFlight--;
      }
    };
    const first = await deleteMe(rig, A);
    h.delete = real.delete;
    expect([first.status, first.headers.get("retry-after")]).toEqual([503, "5"]);
    expect(started, "the 40th failed; the 7 others in flight at that moment finish, nothing new starts").toBeGreaterThanOrEqual(40);
    expect(started).toBeLessThanOrEqual(47);
    expect(maxInFlight).toBe(8);
    expect(allHistory(rig), "what completed is gone, the rest (the failed call's object included) is still there").toHaveLength(total - completed);
    expect(completed).toBeGreaterThan(30);
    expect(await putEntry(rig, A, entryFor("new-1"))).toMatchObject({ status: 410, json: GONE });
    expect((await deleteMe(rig, A)).status, "the repeat from the first key").toBe(200);
    expect(allHistory(rig)).toEqual([]);
    expect(Object.keys(await identityRecords(rig))).toEqual([`tombstones/${A.playerId}.json`]);
  });

  if (kind === "tigris") {
    it("at the S3 level: every history LIST answers 503 (the client's retries included): the DELETE is a 503 naming the operation and the status, the tombstone stands, the objects are intact; the repeat finishes", async () => {
      const { rig, A } = await bigWorld();
      const fake = theFake();
      fake.failNext(10_000, 503, "LIST");
      const first = await deleteMe(rig, A);
      fake.clearFaults();
      expect(first.status).toBe(503);
      expect(lines(rig.log, "storage error: history list failed: HTTP 503")).toBe(1);
      expect(allHistory(rig)).toHaveLength(total);
      expect(await getEntry(rig, A, "e-000")).toMatchObject({ status: 410, json: GONE });
      expect((await deleteMe(rig, A)).status).toBe(200);
      expect(allHistory(rig)).toEqual([]);
    });

    it("at the S3 level: the store goes down after the 30th history DELETE (every later DELETE answers 503, retries included): 503, a part of the objects removed, then the repeat finishes", async () => {
      const { rig, A } = await bigWorld();
      const fake = theFake();
      const s3 = (historyOf(rig) as unknown as { s3: S3Client }).s3;
      const realDelete = s3.delete.bind(s3);
      let n = 0;
      s3.delete = async (key: string) => {
        if (key.startsWith("history/") && ++n === 30) fake.failNext(10_000, 503, "DELETE");
        return realDelete(key);
      };
      const first = await deleteMe(rig, A);
      s3.delete = realDelete;
      fake.clearFaults();
      expect(first.status).toBe(503);
      expect(lines(rig.log, "storage error: history delete failed: HTTP 503")).toBe(1);
      const left = allHistory(rig).length;
      expect(left, "30 or so removed, the rest left").toBeGreaterThan(40);
      expect(left).toBeLessThan(total);
      expect((await deleteMe(rig, A)).status).toBe(200);
      expect(allHistory(rig)).toEqual([]);
    });
  }

  it("NOTE (FIX2 finding E, now with history): after a DELETE from device C that failed in the history removal, a repeat from device B (its link already dropped) is a 200 that finishes none of the PLAYER's history; the first key's repeat does", async () => {
    const rig = await openHistoryRig(kind);
    const [A, B, C] = await Promise.all([freshIdentity(), freshIdentity(), freshIdentity()]);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await linkVia(rig, A, C)).joined.status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await putEntry(rig, A, entryFor(`a-${i}`, { finishedAt: FINISHED - i * 1_000 }))).status).toBe(201);
    await planted(rig, B.playerId, "b-own");
    const h = historyOf(rig);
    const real = { delete: h.delete.bind(h) };
    h.delete = async () => {
      throw new StorageError("history delete failed: HTTP 503");
    };
    expect((await deleteMe(rig, C)).status, "C asks; the history removal fails").toBe(503);
    h.delete = real.delete;
    const records = await identityRecords(rig);
    expect(records[`links/keys/${B.playerId}.json`], "B's link was dropped before the history removal").toBeUndefined();
    expect(records[`links/keys/${C.playerId}.json`], "C's own goes last").toBeDefined();
    expect((await deleteMe(rig, B)).status, "B repeats: a lone key now, it tombstones itself and clears only history/B/").toBe(200);
    expect(historyObjects(rig, A.playerId), "the player's own history is still stored").toHaveLength(3);
    expect(historyObjects(rig, B.playerId)).toEqual([]);
    expect(await listEntries(rig, A), "(and still 410 on this machine, after a restart too)").toMatchObject({ status: 410 });
    await rig.restart();
    expect(await listEntries(rig, A)).toMatchObject({ status: 410 });
    expect((await deleteMe(rig, A)).status, "the first key's repeat finishes the job").toBe(200);
    expect(historyObjects(rig, A.playerId)).toEqual([]);
  });
});

// ================================================================================================================ 4f-5: in flight at the fake S3

interface Meter {
  all: number;
  list: number;
  del: number;
  maxAll: number;
  maxList: number;
  maxDelete: number;
}
/** Hold every request of the fake S3 for 4 ms (so that side-by-side requests overlap) and count how many are in flight: all, history LISTs, history DELETEs. */
function meter(fake: FakeS3, holdMs = 10): { m: Meter; reset(): void; restore(): void } {
  const f = fake as unknown as { handle: (req: { method?: string; url?: string }, res: { on(ev: string, fn: () => void): void }, body: Uint8Array) => void };
  const orig = f.handle.bind(f);
  const m: Meter = { all: 0, list: 0, del: 0, maxAll: 0, maxList: 0, maxDelete: 0 };
  f.handle = (req, res, body) => {
    const url = decodeURIComponent(req.url ?? "");
    const isList = req.method === "GET" && url.includes("list-type=2") && url.includes("prefix=history/");
    const isDel = req.method === "DELETE" && url.includes("/history/");
    m.all++;
    if (isList) m.list++;
    if (isDel) m.del++;
    m.maxAll = Math.max(m.maxAll, m.all);
    m.maxList = Math.max(m.maxList, m.list);
    m.maxDelete = Math.max(m.maxDelete, m.del);
    let done = false;
    const end = (): void => {
      if (done) return;
      done = true;
      m.all--;
      if (isList) m.list--;
      if (isDel) m.del--;
    };
    res.on("close", end);
    res.on("finish", end);
    setTimeout(() => orig(req, res, body), holdMs);
  };
  return { m, reset: () => ((m.maxAll = m.all), (m.maxList = m.list), (m.maxDelete = m.del)), restore: () => (f.handle = orig) };
}

describe("4f-5. at most 8 requests in flight, measured at the fake S3 (Tigris)", () => {
  async function fullPlayer(): Promise<{ rig: Rig; A: Identity; keys: string[] }> {
    const rig = await openHistoryRig("tigris");
    const A = await freshIdentity();
    const keys = Array.from({ length: 64 }, (_, i) => `dev${String(i).padStart(3, "0")}${"x".repeat(30)}`);
    const store = rig.app.links.store;
    await store.put(`players/${A.playerId}.json`, JSON.stringify({ keys, steam: [], at: 1 }));
    for (const k of keys) await store.put(`links/keys/${k}.json`, JSON.stringify({ player: A.playerId, at: 1 }));
    for (let i = 0; i < 200; i++) await planted(rig, A.playerId, `e-${String(i).padStart(3, "0")}`, FINISHED - i * 1_000);
    for (let i = 0; i < 10; i++) await planted(rig, keys[i], `k-${i}`, FINISHED - 300_000 - i * 1_000);
    await rig.restart();
    await rig.app.links.settleReload();
    return { rig, A, keys };
  }

  it("a full player's DELETE (64 keys, 200 + 10 history objects): never more than 8 requests in flight at the fake, 8 in each of the two history phases, and 1 in the IDENT-1 part", async () => {
    const { rig, A } = await fullPlayer();
    expect(allHistory(rig)).toHaveLength(210);
    const mt = meter(theFake(), 25);
    mt.reset();
    const mark = markRequests(rig);
    const del = await deleteMe(rig, A);
    mt.restore();
    expect(del.status, del.text).toBe(200);
    const all = opsSince(rig, mark);
    console.log(`VIDENT3 4f-5 a full player's DELETE at the fake S3: max in flight all ${mt.m.maxAll}, history LISTs ${mt.m.maxList}, history DELETEs ${mt.m.maxDelete}; all requests ${JSON.stringify(all)} = ${Object.values(all).reduce((a, b) => a + b, 0)}; the history/ ones ${JSON.stringify(opsSince(rig, mark, "history/"))}`);
    expect([mt.m.maxList, mt.m.maxDelete], "8 at a time in each history phase").toEqual([8, 8]);
    expect(mt.m.maxAll, "and never more than 8 in all").toBe(8);
    expect(opsSince(rig, mark, "history/")).toEqual({ LIST: 65, DELETE: 210 });
    expect(allHistory(rig)).toEqual([]);
  }, 120_000);
});

// ================================================================================================================ 4f-6: a lone key's earlier uploads

describe.each(KINDS)("4f-6. a lone key K's earlier uploads under history/<K>/ when K later joins a player P (ruling 4b) (%s)", (kind) => {
  for (const from of ["P (the first key)", "K (now a device of P)"] as const) {
    it(`K uploads twice as a lone key, joins P, uploads again; the objects under history/<K>/ are invisible to every device, and P's DELETE from ${from} removes them (K is one of P's keys, so it is tombstoned); a lone key that never joined keeps its own`, async () => {
      const rig = await openHistoryRig(kind);
      const [P, K, K2] = await Promise.all([freshIdentity(), freshIdentity(), freshIdentity()]);
      expect((await putEntry(rig, K, entryFor("k-1", { finishedAt: FINISHED - 3_000 }))).status).toBe(201);
      expect((await putEntry(rig, K, entryFor("k-2", { finishedAt: FINISHED - 4_000 }))).status).toBe(201);
      expect((await putEntry(rig, K2, entryFor("k2-1"))).status).toBe(201);
      expect((await putEntry(rig, P, entryFor("p-1", { finishedAt: FINISHED - 1_000 }))).status).toBe(201);
      expect(historyObjects(rig, K.playerId)).toHaveLength(2);
      expect((await linkVia(rig, P, K)).joined.status).toBe(200);
      expect((await putEntry(rig, K, entryFor("k-3", { finishedAt: FINISHED - 2_000 }))).status, "K's new upload goes under P").toBe(201);
      expect(historyObjects(rig, P.playerId)).toHaveLength(2);
      expect(historyObjects(rig, K.playerId), "the earlier two stay under history/<K>/").toHaveLength(2);
      expect(listedIds(await listEntries(rig, K)), "K lists P's history: its earlier uploads are not in it").toEqual(["p-1", "k-3"]);
      expect((await getEntry(rig, K, "k-1")).status, "and cannot be read").toBe(404);
      expect(listedIds(await listEntries(rig, P))).toEqual(["p-1", "k-3"]);
      // the DELETE
      expect((await deleteMe(rig, from.startsWith("P") ? P : K)).status).toBe(200);
      expect(mine(rig, P, K), "history/<P>/ and history/<K>/ are both removed").toEqual([]);
      expect(historyObjects(rig, K2.playerId), "a lone key that never joined P is not P's key: its history is its own, and stays").toHaveLength(1);
      const records = await identityRecords(rig);
      expect(decodeTombstone(records[`tombstones/${P.playerId}.json`])?.ids.slice().sort()).toEqual([P.playerId, K.playerId].sort());
      // a late write from a machine that had not seen the tombstone, under K's own id: the purge finds it through the tombstone's ids
      writeObject(rig, K.playerId, nameOf({ finishedAt: FINISHED, id: "late-k" }), encodeEntry(entryFor("late-k")));
      expect(historyObjects(rig, K.playerId)).toHaveLength(1);
      const w = adminFor(rig);
      const dry = await admin(w, ["purge-tombstoned"]);
      expect(dry.out).toContain("history: delete 1 object(s) under history/<id>/ of 1 of the 2 tombstoned id(s)");
      expect((await admin(w, ["purge-tombstoned", "--apply"])).code).toBe(0);
      expect(mine(rig, P, K)).toEqual([]);
      expect(historyObjects(rig, K2.playerId), "K2's stays after the purge too").toHaveLength(1);
    });
  }

  it("a lone key that joined and whose own DELETE came BEFORE (as a lone player) has its history removed then: the lone key's tombstone names it, and it can no longer join (410)", async () => {
    const rig = await openHistoryRig(kind);
    const [P, K] = await Promise.all([freshIdentity(), freshIdentity()]);
    expect((await putEntry(rig, K, entryFor("k-1"))).status).toBe(201);
    expect((await deleteMe(rig, K)).status).toBe(200);
    expect(historyObjects(rig, K.playerId)).toEqual([]);
    const { joined } = await linkVia(rig, P, K);
    expect(joined.status, "the deleted key is refused").toBe(410);
  });
});

describe("4f-6b. the file store after a DELETE and after a purge", () => {
  it("NOTE: the emptied history/<id>/ folders stay (the player's and every key's id stay on disk as folder names, as they do in the tombstone), and so does an interrupted write's .tmp with the whole entry text of the deleted player's run", async () => {
    const rig = await openHistoryRig("jsonl");
    const [A, B] = await Promise.all([freshIdentity(), freshIdentity()]);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await putEntry(rig, A, entryFor("a-1"))).status).toBe(201);
    await planted(rig, B.playerId, "b-own");
    const text = encodeEntry(entryFor("a-2", { finishedAt: FINISHED - 1_000 }));
    const tmp = join(rig.dir, "history", A.playerId, `${nameOf({ finishedAt: FINISHED - 1_000, id: "a-2" })}.tmp`);
    writeFileSync(tmp, text); // the crash between the write of the temp file and its rename
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(allHistory(rig), "no entry is left, only the .tmp").toEqual([`history/${A.playerId}/${nameOf({ finishedAt: FINISHED - 1_000, id: "a-2" })}.tmp`]);
    expect(readdirSync(join(rig.dir, "history")).sort(), "the folders stay").toEqual([A.playerId, B.playerId].sort());
    expect(readdirSync(join(rig.dir, "history", B.playerId))).toEqual([]);
    const w = adminFor(rig);
    expect((await admin(w, ["purge-tombstoned", "--apply"])).code).toBe(0);
    expect(readFileSync(tmp, "utf8"), "the purge does not touch it either").toBe(text);
  });
});

// ================================================================================================================ 4f-7: two machines

describe.each(KINDS)("4f-7. two machines over one store: the other machine's 60 s window (%s)", (kind) => {
  it("M2 loaded its set before M1's DELETE: until its refresh M2 takes a PUT (201), serves a list and an entry read for the deleted player and its keys; at the refresh time everything is 410; the late objects stay until purge-tombstoned removes them", async () => {
    const m1 = await openHistoryRig(kind);
    const [A, B, C, Z] = await Promise.all([freshIdentity(), freshIdentity(), freshIdentity(), freshIdentity()]);
    expect((await linkVia(m1, A, B)).joined.status).toBe(200);
    expect((await linkVia(m1, A, C)).joined.status).toBe(200);
    expect((await putEntry(m1, A, entryFor("a-1"))).status).toBe(201);
    expect((await putEntry(m1, Z, entryFor("z-1"))).status).toBe(201);
    const m2 = await openSibling(m1, OPEN);
    // M2 knows B's link (a request before the DELETE caches it for 10 minutes); it has never seen C
    expect(listedIds(await listEntries(m2, B))).toEqual(["a-1"]);
    const t0 = m1.clock.now; // M2's set was loaded at t0
    expect((await deleteMe(m1, A)).status).toBe(200);
    expect(mine(m1, A, B, C)).toEqual([]);
    expect(await putEntry(m1, A, entryFor("a-2")), "M1 refuses at once").toMatchObject({ status: 410, json: GONE });

    m1.clock.now = t0 + 59_999;
    const lateA = await putEntry(m2, A, entryFor("late-a", { finishedAt: FINISHED + 1_000 }));
    const lateB = await putEntry(m2, B, entryFor("late-b", { finishedAt: FINISHED + 2_000 }));
    const lateC = await putEntry(m2, C, entryFor("late-c", { finishedAt: FINISHED + 3_000 }));
    const seen = [lateA.status, lateB.status, lateC.status];
    const list = await listEntries(m2, A);
    const read = await getEntry(m2, A, "late-a");
    const listB = await listEntries(m2, B);
    console.log(`VIDENT3 4f-7 (${kind}) M2 at +59.999 s: PUT by the player / a cached device / a never-seen device ${JSON.stringify(seen)}; list by the player ${list.status} ${JSON.stringify(listedIds(list))}; entry read ${read.status}; list by the cached device ${listB.status}`);
    expect(seen, "NOTE: the other machine takes the deleted player's, a cached device's and a never-seen device's uploads in its window").toEqual([201, 201, 201]);
    expect([list.status, listedIds(list)], "and lists them").toEqual([200, ["late-b", "late-a"]]);
    expect(read.status).toBe(200);
    expect(historyObjects(m1, A.playerId), "the player's and the cached device's land under the player's id").toHaveLength(2);
    expect(historyObjects(m1, C.playerId), "the never-seen device's land under its own id (its link record is gone)").toHaveLength(1);
    expect(await listEntries(m1, A), "M1 serves none of it").toMatchObject({ status: 410, json: GONE });

    m1.clock.now = t0 + 60_000;
    const after = await Promise.all([putEntry(m2, A, entryFor("late-a2")), putEntry(m2, B, entryFor("late-b2")), putEntry(m2, C, entryFor("late-c2")), listEntries(m2, A), getEntry(m2, B, "late-a"), listEntries(m2, C)]);
    expect(after.map((r) => [r.status, r.json]), "at the refresh time (60 s after M2's last good reload began) every request is 410").toEqual(Array.from({ length: 6 }, () => [410, GONE]));
    expect(mine(m1, A, B, C), "M2's late objects are still stored: nothing removes them but the purge").toHaveLength(3);
    // the purge
    const w = adminFor(m1);
    const dry = await admin(w, ["purge-tombstoned"]);
    expect(dry.code).toBe(0);
    expect(dry.out).toContain("history: delete 3 object(s) under history/<id>/ of 2 of the 3 tombstoned id(s)");
    expect(historyObjects(m1, Z.playerId)).toHaveLength(1);
    const applied = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(applied.code, applied.out.join("\n")).toBe(0);
    expect(applied.out).toContain("APPLIED: deleted 3 of 3 history object(s).");
    expect(mine(m1, A, B, C)).toEqual([]);
    expect(historyObjects(m1, Z.playerId), "the bystander's stays").toHaveLength(1);
  });

  it("a DELETE repeated on M2 (a client that gets the 410 and asks again, or an operator) removes the late objects under every id the tombstone names, like the purge", async () => {
    const m1 = await openHistoryRig(kind);
    const [A, B] = await Promise.all([freshIdentity(), freshIdentity()]);
    expect((await linkVia(m1, A, B)).joined.status).toBe(200);
    const m2 = await openSibling(m1, OPEN);
    await m2.app.links.ensureFresh();
    expect((await deleteMe(m1, A)).status).toBe(200);
    expect((await putEntry(m2, A, entryFor("late-a"))).status).toBe(201);
    expect((await putEntry(m2, B, entryFor("late-b", { finishedAt: FINISHED - 1_000 }))).status, "B's uploads on M2 land under B's own id (M2 never cached its link)").toBe(201);
    expect(mine(m1, A, B)).toHaveLength(2);
    m1.clock.now += TTL;
    expect((await deleteMe(m2, A)).status).toBe(200);
    expect(mine(m1, A, B)).toEqual([]);
  });
});

// ================================================================================================================ 4f-8: purge-tombstoned

interface World {
  kind: Kind;
  argv: string[];
  env: Record<string, string>;
  bucket: string;
  dir: string;
  upload(rules: string, day: number, id: string, playerId: string): void;
  tombstone(player: string, ids: string[]): Promise<void>;
  history(owner: string, id: string, finishedAt?: number): string;
  /** A name the store does not write, in history/<owner>/ (a file; with `dir` a folder). Returns "history/<owner>/<name>". */
  stray(owner: string, name: string, text?: string, asDir?: boolean): string;
  /** Every object name under history/, strays included, sorted: "history/<owner>/<name>". */
  held(): string[];
  ghosts(): string[];
}
let pseq = 0;
const ghost = (id: string, rules: string, day: number, playerId: string): string => JSON.stringify({ id, at: 5, snapshot: { rules, day, playerId } });
const R1 = "bb-0.12.0";
function world(kind: Kind): World {
  const text = (id: string, finishedAt: number): string => encodeEntry(entryFor(id, { finishedAt }));
  if (kind === "tigris") {
    const bucket = `bb-v3-purge-${++pseq}`;
    pfake.createBucket(bucket);
    const links = new TigrisLinkStore(s3For(pfake, bucket));
    return {
      kind, argv: [], bucket, dir: "",
      env: {
        BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
        AWS_ENDPOINT_URL_S3: pfake.endpoint, BUCKET_NAME: bucket, BB_GHOST_S3_ADDRESSING: "path",
      },
      upload: (rules, day, id, p) => pfake.putObject(bucket, objectKey("player", rules, day, id), ghost(id, rules, day, p)),
      tombstone: (player, ids) => links.put(keyOfT(player), tomb(ids, 7)),
      history: (owner, id, finishedAt = FINISHED) => {
        const key = `history/${owner}/${nameOf({ finishedAt, id })}`;
        pfake.putObject(bucket, key, text(id, finishedAt));
        return key;
      },
      stray: (owner, name, body = "stray") => {
        const key = `history/${owner}/${name}`;
        pfake.putObject(bucket, key, body);
        return key;
      },
      held: () => pfake.keys(bucket, "history/"),
      ghosts: () => pfake.keys(bucket, "ghosts/").map((k) => k.split("/").slice(1).join("/")),
    };
  }
  const dir = mkdtempSync(join(tmpdir(), "bb-v3-purge-"));
  pdirs.push(dir);
  const links = new FileLinkStore(join(dir, "identity"));
  const isDir = (path: string): boolean => statSync(path).isDirectory();
  return {
    kind, argv: ["--data", dir], env: { BB_GHOST_STORE: "jsonl" }, bucket: "", dir,
    upload: (rules, day, id, p) => appendFileSync(join(dir, "ghosts.jsonl"), ghost(id, rules, day, p) + "\n"),
    tombstone: (player, ids) => links.put(keyOfT(player), tomb(ids, 7)),
    history: (owner, id, finishedAt = FINISHED) => {
      const name = nameOf({ finishedAt, id });
      mkdirSync(join(dir, "history", owner), { recursive: true });
      writeFileSync(join(dir, "history", owner, name), text(id, finishedAt));
      return `history/${owner}/${name}`;
    },
    stray: (owner, name, body = "stray", asDir = false) => {
      const path = join(dir, "history", owner, name);
      mkdirSync(asDir ? path : dirname(path), { recursive: true });
      if (!asDir) writeFileSync(path, body);
      return `history/${owner}/${name}`;
    },
    // every file under history/ as "history/<owner>/<name>" (a nested file as "history/<owner>/<folder>/<name>"; an empty folder inside an owner's folder as "history/<owner>/<folder>/"); the owners' own folders are not listed
    held: () => {
      const root = join(dir, "history");
      if (!existsSync(root)) return [];
      return readdirSync(root).sort().flatMap((o) => {
        const od = join(root, o);
        if (!isDir(od)) return [`history/${o}`];
        return readdirSync(od).sort().flatMap((n) => {
          const p = join(od, n);
          if (!isDir(p)) return [`history/${o}/${n}`];
          const inner = readdirSync(p).sort();
          return inner.length ? inner.map((x) => `history/${o}/${n}/${x}`) : [`history/${o}/${n}/`];
        });
      });
    },
    ghosts: () => (existsSync(join(dir, "ghosts.jsonl")) ? readFileSync(join(dir, "ghosts.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => {
      const o = JSON.parse(l) as { id: string; snapshot: { rules: string } };
      return `${o.snapshot.rules} ${o.id}`;
    }) : []),
  };
}
/** The world of a history rig, as the tool sees the store. */
function adminFor(rig: Rig): Pick<World, "argv" | "env"> {
  return rig.kind === "jsonl"
    ? { argv: ["--data", rig.dir], env: { BB_GHOST_STORE: "jsonl" } }
    : {
      argv: [],
      env: {
        BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
        AWS_ENDPOINT_URL_S3: theFake().endpoint, BUCKET_NAME: rig.bucket, BB_GHOST_S3_ADDRESSING: "path",
      },
    };
}
async function admin(w: Pick<World, "argv" | "env">, args: string[], open?: (cfg: never) => AdminStore): Promise<{ code: number; out: string[]; history: string[] }> {
  const out: string[] = [];
  const code = await runAdmin([...args, ...w.argv], w.env, (l) => out.push(l), open as Parameters<typeof runAdmin>[3]);
  return { code, out, history: out.filter((l) => l.startsWith("  delete history/")).map((l) => l.slice("  delete ".length)) };
}

describe("4f-8. purge-tombstoned: 16 at a time on Tigris", () => {
  it("40 tombstoned ids with 5 entries each: the dry run's LISTs and --apply's history DELETEs reach 16 in flight at the fake S3 and never more; the bystander's stays", async () => {
    const w = world("tigris");
    const gone = Array.from({ length: 40 }, (_, i) => `gone${String(i).padStart(3, "0")}`);
    for (const id of gone) for (let j = 0; j < 5; j++) w.history(id, `e${j}`, FINISHED - j * 1_000);
    w.history("bystander", "b-1");
    await w.tombstone("gone000", gone);
    const mt = meter(pfake, 40); // (a long hold: the 16 requests of a batch must overlap even when the host is busy)
    mt.reset();
    const dry = await admin(w, ["purge-tombstoned"]);
    expect(dry.code, dry.out.join("\n")).toBe(0);
    expect(dry.out).toContain("history: delete 200 object(s) under history/<id>/ of 40 of the 40 tombstoned id(s)");
    expect([mt.m.maxList, mt.m.maxDelete], "the dry run: 16 LISTs at a time, no DELETE").toEqual([16, 0]);
    mt.reset();
    const applied = await admin(w, ["purge-tombstoned", "--apply"]);
    mt.restore();
    expect(applied.code, applied.out.join("\n")).toBe(0);
    expect(applied.out).toContain("APPLIED: deleted 200 of 200 history object(s).");
    expect([mt.m.maxList, mt.m.maxDelete, mt.m.maxAll], "--apply: 16 LISTs and 16 DELETEs at a time").toEqual([16, 16, 16]);
    expect(w.held()).toHaveLength(1);
  }, 60_000);
});

describe.each(KINDS)("4f-8. purge-tombstoned: stray names, one id in two tombstones, empty folders (%s)", (kind) => {
  it("strays in history/<id>/ (a foreign file, an interrupted write's .tmp, a nested folder's object, a lookalike name) are not listed, not counted, not deleted; the dry run and --apply agree; a lookalike id and a loose object under history/ are untouched", async () => {
    const w = world(kind);
    const real = [w.history("gone1", "r1", FINISHED), w.history("gone1", "r2", FINISHED - 1_000), w.history("gone2", "r3")];
    const tmpText = encodeEntry(entryFor("r1", { finishedAt: FINISHED }));
    const strays = [
      w.stray("gone1", "notes.txt"), w.stray("gone1", `${nameOf({ finishedAt: FINISHED, id: "r1" })}.tmp`, tmpText), w.stray("gone1", "0000000000001-x.JSON"),
      w.stray("gone1", "sub/0000000000001-x.json"), w.stray("gone2", ".hidden"),
    ];
    const others = [w.history("gone1x", "lookalike"), w.history("bystander", "b-1")];
    if (kind === "tigris") pfake.putObject(w.bucket, "history/loose.json", "x");
    await w.tombstone("gone1", ["gone1", "gone2"]);
    const dry = await admin(w, ["purge-tombstoned"]);
    expect(dry.code, dry.out.join("\n")).toBe(0);
    expect(dry.out).toContain("history: delete 3 object(s) under history/<id>/ of 2 of the 2 tombstoned id(s)");
    expect(dry.history.slice().sort()).toEqual(real.slice().sort());
    const applied = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(applied.code, applied.out.join("\n")).toBe(0);
    expect(applied.out).toContain("APPLIED: deleted 3 of 3 history object(s).");
    expect(applied.history).toEqual(dry.history);
    expect(w.held().sort(), "exactly the strays, the lookalike id's and the bystander's are left").toEqual([...strays, ...others, ...(kind === "tigris" ? ["history/loose.json"] : [])].sort());
    // NOTE: the interrupted write's temp file holds the whole entry text of a DELETED player's run, and neither the DELETE nor the purge ever removes it
    const tmpKey = strays.find((s) => s.endsWith(".tmp")) ?? "";
    expect(tmpKey).not.toBe("");
    const again = await admin(w, ["purge-tombstoned"]);
    expect(again.out).toContain("history: delete 0 object(s) under history/<id>/ of 0 of the 2 tombstoned id(s)");
    if (kind === "jsonl") expect(existsSync(join(w.dir, tmpKey))).toBe(true);
    else expect(pfake.getObject(w.bucket, tmpKey)).toBe(tmpText);
  });

  it("one id named by two tombstones is listed and counted once; an id with no history is not counted", async () => {
    const w = world(kind);
    w.history("shared", "s-1");
    w.history("shared", "s-2", FINISHED - 1_000);
    w.history("p-only", "p-1");
    await w.tombstone("p-only", ["p-only", "shared"]);
    await w.tombstone("q-only", ["q-only", "shared"]);
    const dry = await admin(w, ["purge-tombstoned"]);
    expect(dry.out).toContain("tombstones: 3 deleted player and key id(s)");
    expect(dry.out).toContain("history: delete 3 object(s) under history/<id>/ of 2 of the 3 tombstoned id(s)");
    expect(dry.history.filter((l) => l.startsWith("history/shared/"))).toHaveLength(2);
    expect((await admin(w, ["purge-tombstoned", "--apply"])).code).toBe(0);
    expect(w.held()).toEqual([]);
  });
});

describe("4f-8. purge-tombstoned: the exit code when either part falls short", () => {
  /** A JSON-lines world: ghosts of P and K, history of P and K (4 objects), somebody else's. */
  async function jsonl() {
    const w = world("jsonl");
    w.history("tomb-p", "p-1", FINISHED);
    w.history("tomb-p", "p-2", FINISHED - 1_000);
    w.history("tomb-p", "p-3", FINISHED - 2_000);
    w.history("tomb-k", "k-1", FINISHED - 3_000);
    w.history("other", "o-1");
    w.upload(R1, 1, "g1", "tomb-p");
    w.upload(R1, 2, "g2", "tomb-k");
    w.upload(R1, 1, "g3", "other");
    await w.tombstone("tomb-p", ["tomb-p", "tomb-k"]);
    const real = new JsonlAdmin(w.dir);
    const base = { kind: real.kind, where: real.where, read: (r: string) => real.read(r), remove: (x: Parameters<JsonlAdmin["remove"]>[0]) => real.remove(x), rulesVersions: () => real.rulesVersions(), tombstoned: () => real.tombstoned() };
    const hist = { history: (ids: ReadonlySet<string>) => real.history(ids), removeHistory: (h: Parameters<JsonlAdmin["removeHistory"]>[0]) => real.removeHistory(h) };
    return { w, real, base, hist };
  }

  it("the GHOST part falls short (one planned record had already gone): exit 1, and the history part still runs and is reported", async () => {
    const { w, base, hist } = await jsonl();
    const short = { ...base, ...hist, remove: async (x: Parameters<JsonlAdmin["remove"]>[0]) => (await base.remove(x.slice(1))) };
    const r = await admin(w, ["purge-tombstoned", "--apply"], () => short as never);
    expect(r.code, r.out.join("\n")).toBe(1);
    expect(r.out).toContain("APPLIED: deleted 1 of 2 record(s).");
    expect(r.out).toContain("APPLIED: deleted 4 of 4 history object(s).");
    expect(w.held()).toEqual(["history/other/" + nameOf({ finishedAt: FINISHED, id: "o-1" })]);
  });

  it("the ghost removal THROWS (a store error): exit 1 with the plain 'failed' line, and the history part is NOT attempted (its objects stay for the next run)", async () => {
    const { w, base, hist } = await jsonl();
    const broken = { ...base, ...hist, remove: async () => { throw new StorageError("ghost delete failed: HTTP 503"); } };
    const r = await admin(w, ["purge-tombstoned", "--apply"], () => broken as never);
    expect(r.code).toBe(1);
    expect(r.out.join("\n")).toContain("ghosts:admin failed: ghost delete failed: HTTP 503");
    expect(r.out.some((l) => l.startsWith("APPLIED: deleted") && l.includes("history")), "no history APPLIED line").toBe(false);
    expect(w.held(), "the history is untouched").toHaveLength(5);
    const again = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(again.code).toBe(0);
    expect(w.held()).toHaveLength(1);
  });

  it("the HISTORY part throws midway (a folder named like an entry cannot be removed, EISDIR): the ghosts are done, exit 1, 'ghosts:admin failed: history delete failed', the objects after the folder in the sequence stay; every later run fails at the same folder", async () => {
    const { w } = await jsonl();
    const folder = nameOf({ finishedAt: FINISHED - 1_500, id: "dir-entry" }); // sorts between p-2 and p-3 in tomb-p
    w.stray("tomb-p", folder, "", true);
    const r = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(r.code, r.out.join("\n")).toBe(1);
    expect(r.out).toContain("APPLIED: deleted 2 of 2 record(s).");
    expect(r.out.join("\n")).toContain("ghosts:admin failed: history delete failed");
    expect(w.ghosts(), "the ghosts part finished").toHaveLength(1);
    const left = w.held();
    console.log(`VIDENT3 4f-8 history part throws midway: left ${JSON.stringify(left)}`);
    expect(left).toContain(`history/tomb-p/${folder}/`);
    expect(left.length, "tomb-k's object and the objects after the folder in the sequence stay").toBeGreaterThan(2);
    const again = await admin(w, ["purge-tombstoned", "--apply"]);
    expect(again.code, "NOTE: the same folder fails every run").toBe(1);
  });

  it("NOTE: an object that was already gone when --apply ran is counted as deleted ('deleted 4 of 4', exit 0): removeHistory returns the planned count, as the comment says a delete of a missing object is fine; the ghost part says 'had already changed or gone' and exits 1 in the same case", async () => {
    const { w, base, hist } = await jsonl();
    const racing = {
      ...base,
      history: async (ids: ReadonlySet<string>) => {
        const held = await hist.history(ids);
        await hist.removeHistory(held.slice(0, 1)); // another run, or the player's repeat DELETE, removed one object after the plan
        return held;
      },
      removeHistory: hist.removeHistory,
    };
    const r = await admin(w, ["purge-tombstoned", "--apply"], () => racing as never);
    expect(r.code, r.out.join("\n")).toBe(0);
    expect(r.out).toContain("APPLIED: deleted 4 of 4 history object(s).");
    expect(w.held()).toHaveLength(1);
  });

  it("--rules does not limit the history, and no tombstone means nothing said about history (a run with --rules for a version that holds nothing)", async () => {
    const { w } = await jsonl();
    const r = await admin(w, ["purge-tombstoned", "--rules", "bb-0.1.0", "--apply"]);
    expect(r.code, r.out.join("\n")).toBe(0);
    expect(r.out).toContain("APPLIED: deleted 0 of 0 record(s).");
    expect(r.out).toContain("APPLIED: deleted 4 of 4 history object(s).");
    expect(w.ghosts(), "no ghost of that version existed, so none went").toHaveLength(3);
  });
});

// ================================================================================================================ more interleavings

describe.each(KINDS)("4f-1b. a history READ that is already past its 410 check when the DELETE runs is answered from before the DELETE (%s)", (kind) => {
  it("NOTE: a list read held after its LIST answers 200 with the entries the DELETE removed meanwhile; an entry read held after its GET answers 200 with the entry; one held between its LIST and its GET answers 404; every read that STARTS after the DELETE is 410", async () => {
    const rig = await openHistoryRig(kind);
    const [A, B] = await Promise.all([freshIdentity(), freshIdentity()]);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    await planted(rig, A.playerId, "a-1", FINISHED);
    await planted(rig, A.playerId, "a-2", FINISHED - 1_000);
    await rig.app.links.ensureFresh();
    const pause = new Pauser(historyOf(rig));
    const holdList = pause.hold("list", 1, "after");
    const listP = listEntries(rig, B);
    await arrived(holdList, "the list read");
    const holdStale = pause.hold("list", 2, "after");
    const staleP = getEntry(rig, B, "a-1");
    await arrived(holdStale, "the entry read held between its LIST and its GET");
    const holdGet = pause.hold("get", 1, "after");
    const bodyP = getEntry(rig, B, "a-2");
    await arrived(holdGet, "the entry read held after its GET");
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(mine(rig, A, B), "the DELETE removed everything").toEqual([]);
    expect(await listEntries(rig, B), "a read that starts now").toMatchObject({ status: 410, json: GONE });
    expect(await getEntry(rig, B, "a-1"), "an entry read that starts now").toMatchObject({ status: 410, json: GONE });
    holdList.release();
    holdStale.release();
    holdGet.release();
    const [list, stale, body] = await Promise.all([listP, staleP, bodyP]);
    pause.restore();
    expect([list.status, listedIds(list)], "answered from before the DELETE").toEqual([200, ["a-1", "a-2"]]);
    expect(stale.status).toBe(404);
    expect(body.status).toBe(200);
    expect(body.json?.entry).toMatchObject({ id: "a-2", runId: "a-2" });
  });
});

describe.each(KINDS)("4f-2b. PUTs queued behind a paused PUT of the same player (%s)", (kind) => {
  it("PUT 1 paused before its write, PUT 2 (a device) and PUT 3 (the first key) have passed their 410 check and wait for its lock; the DELETE runs; all three end 410 and nothing is left", async () => {
    const rig = await openHistoryRig(kind);
    const [A, B, C] = await Promise.all([freshIdentity(), freshIdentity(), freshIdentity()]);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await linkVia(rig, A, C)).joined.status).toBe(200);
    await planted(rig, A.playerId, "a-1", FINISHED);
    await planted(rig, C.playerId, "c-old", FINISHED - 5_000);
    await rig.app.links.ensureFresh();
    const pause = new Pauser(historyOf(rig));
    const hold = pause.hold("put", 1, "before");
    const put1 = putEntry(rig, B, entryFor("q-1", { finishedAt: FINISHED + 1_000 }));
    await arrived(hold, "the first PUT");
    const put2 = putEntry(rig, C, entryFor("q-2", { finishedAt: FINISHED + 2_000 }));
    await sleep(150);
    const put3 = putEntry(rig, A, entryFor("q-3", { finishedAt: FINISHED + 3_000 }));
    await sleep(150);
    expect((await deleteMe(rig, A)).status).toBe(200);
    hold.release();
    const rs = await Promise.all([put1, put2, put3]);
    pause.restore();
    expect(rs.map((r) => [r.status, r.json])).toEqual([[410, GONE], [410, GONE], [410, GONE]]);
    expect(mine(rig, A, B, C)).toEqual([]);
  });

  it("NOTE: if the PUT's own clean-up DELETE fails as well (a second store failure), the PUT is a 503 and the object it wrote stays under the deleted player until the repeat DELETE or the purge; every read is 410 meanwhile", async () => {
    const rig = await openHistoryRig(kind);
    const [A, B] = await Promise.all([freshIdentity(), freshIdentity()]);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    await planted(rig, A.playerId, "a-1", FINISHED);
    await rig.app.links.ensureFresh();
    const pause = new Pauser(historyOf(rig));
    const hold = pause.hold("put", 1, "before");
    const putP = putEntry(rig, B, entryFor("q-1", { finishedAt: FINISHED + 1_000 }));
    await arrived(hold, "the PUT");
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(mine(rig, A, B)).toEqual([]);
    const h = historyOf(rig);
    h.delete = async () => {
      throw new StorageError("history delete failed: HTTP 503");
    };
    hold.release();
    const r = await putP;
    pause.restore();
    expect(r.status, r.text).toBe(503);
    expect(mine(rig, A, B), "the object the late write made stays").toHaveLength(1);
    expect(await listEntries(rig, A)).toMatchObject({ status: 410, json: GONE });
    expect((await deleteMe(rig, A)).status, "the repeat DELETE").toBe(200);
    expect(mine(rig, A, B)).toEqual([]);
  });
});

describe.each(KINDS)("4f-7c. a device that linked on the OTHER machine (%s)", (kind) => {
  it("NOTE: for up to 30 s this machine still has 'D is not linked' cached, so D's history PUT is a 201 stored under D's OWN id and is not in the player's list; after 30 s it lands under the player; P's DELETE removes both", async () => {
    const m1 = await openHistoryRig(kind);
    const [P, D] = await Promise.all([freshIdentity(), freshIdentity()]);
    const m2 = await openSibling(m1, OPEN);
    expect(listedIds(await listEntries(m1, D)), "M1 looks D up: not linked (cached 30 s)").toEqual([]);
    expect((await linkVia(m2, P, D)).joined.status, "P shows a code and D enters it, both on M2").toBe(200);
    expect((await putEntry(m1, D, entryFor("d-1"))).status).toBe(201);
    expect(historyObjects(m1, D.playerId), "stored under D's own id").toHaveLength(1);
    expect(historyObjects(m1, P.playerId)).toEqual([]);
    expect(listedIds(await listEntries(m2, P)), "and the player's list does not have it").toEqual([]);
    m1.clock.now += 30_000; // the negative entry (30 s) is over
    expect((await putEntry(m1, D, entryFor("d-2", { finishedAt: FINISHED - 1_000 }))).status).toBe(201);
    expect(historyObjects(m1, P.playerId), "now under the player").toHaveLength(1);
    expect(listedIds(await listEntries(m2, P))).toEqual(["d-2"]);
    expect((await deleteMe(m2, P)).status).toBe(200);
    expect(mine(m1, P, D), "D is one of P's keys: both are removed").toEqual([]);
  });
});

describe.each(KINDS)("4f-7b. the other machine's window is as long as its refresh is slow (%s)", (kind) => {
  it("NOTE: M2's request waits 250 ms for the refresh and goes on with the set it holds, so a deleted player's PUT is taken (201) MINUTES after the refresh was due while the refresh is stuck; when it ends, 410; only the purge removes what was stored", async () => {
    const m1 = await openHistoryRig(kind);
    const A = await freshIdentity();
    const m2 = await openSibling(m1, OPEN);
    expect(listedIds(await listEntries(m2, A)), "M2 loads its set").toEqual([]);
    const t0 = m1.clock.now;
    expect((await deleteMe(m1, A)).status).toBe(200);
    const s = spy(m2);
    const g = closedGate();
    s.listHold = { when: "before", gate: g.gate };
    m1.clock.now = t0 + 60_000 + 10 * 60_000; // ten minutes after M2's refresh was due
    const t = Date.now();
    const first = await putEntry(m2, A, entryFor("late-a"));
    const waited = Date.now() - t;
    const second = await putEntry(m2, A, entryFor("late-b", { finishedAt: FINISHED - 1_000 }));
    expect([first.status, second.status], "both taken, ten minutes late").toEqual([201, 201]);
    expect(waited, "each request waited the 250 ms bound").toBeGreaterThanOrEqual(200);
    expect(s.lists, "one reload, stuck").toBe(1);
    expect(historyObjects(m1, A.playerId)).toHaveLength(2);
    g.release();
    await m2.app.links.settleReload();
    expect(await putEntry(m2, A, entryFor("late-c"))).toMatchObject({ status: 410, json: GONE });
    expect(historyObjects(m1, A.playerId), "the late objects stay").toHaveLength(2);
    s.restore();
    const w = adminFor(m1);
    expect((await admin(w, ["purge-tombstoned", "--apply"])).code).toBe(0);
    expect(historyObjects(m1, A.playerId)).toEqual([]);
  });
});
