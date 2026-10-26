// IDENT-2 step 4 (REQ-BFG-122 clause 4): the reads, the merge and the triggers, the client against the real server in process (the JSON-lines
// store and the Tigris fake). SHOW MY CODE on device A and ENTER A CODE on device B, then B sees A's history, and A sees B's runs at its next
// sync (the requirement's "a second device sees the full history"); a record B downloaded replays to that dusk's own outcome; a device that was
// never linked makes no request; the per-trigger bounds; no upload loop; a server without the routes; a 410; uploads closed; a wrong clock.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HISTORY_KEY, readHistory, recordRunEnd, unsentFor } from "../src/game/history";
import { setSession } from "../src/game/session";
import { foldRunEnd } from "../src/game/styleFolds";
import { MIRROR_LINK, memoryMirror } from "../src/net/identityMirror";
import { redeemLinkCode, requestLinkCode } from "../src/net/linkClient";
import { LINK_KEY, readLink, writeLink } from "../src/net/linkState";
import {
  HISTORY_DOWNLOADS_PER_SYNC, HISTORY_SYNC_INTERVAL_MS, HISTORY_UPLOADS_PER_TRIGGER, historyIdle, historyRunEnded, resetHistorySync, startupHistorySync, syncHistory,
} from "../src/net/historySync";
import { encodeEntry } from "../src/net/historyWire";
import { putHistoryEntry } from "../src/net/historyClient";
import { checkRecord, replay } from "../src/net/replay";
import { closeRigs, deleteMe, fakeKeys, openRig, type Kind, type Rig } from "./identRig";
import { device, entryOf, playedRun, type Device } from "./ident2Local";
import { NOW } from "./profileupWire";

afterAll(closeRigs);
beforeEach(() => resetHistorySync());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setSession(null);
});

/** Every request a device makes to the history routes, by kind: PUT, LIST (the signed list read), READ (one entry), and the ids PUT. */
function counted() {
  const calls: string[] = [];
  const puts: string[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const method = init?.method ?? "GET";
    if (u.pathname === "/v1/history") {
      calls.push(method === "PUT" ? "PUT" : u.search.includes("&id=") ? "READ" : "LIST");
      if (method === "PUT") puts.push((JSON.parse(new TextDecoder().decode(init!.body as Uint8Array)) as { entry: { id: string } }).entry.id);
    } else calls.push(`${method} ${u.pathname}`);
    return fetch(input, init);
  }) as typeof fetch;
  return { f, calls, puts, n: (what: string) => calls.filter((c) => c === what).length, reset: () => { calls.length = 0; puts.length = 0; } };
}

/** The objects the server holds under history/<id>/. */
function onServer(rig: Rig, id: string): string[] {
  if (rig.kind === "tigris") return fakeKeys(rig, `history/${id}/`);
  const dir = join(rig.dir, "history", id);
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")) : [];
}

const held = (d: Device) => readHistory(d.store).state.entries;
const ids = (d: Device) => held(d).map((l) => l.entry.id);

/** `n` finished runs on a device, ids `<tag><i>-1-1`, finished from t0 on, a second apart. */
function play(d: Device, n: number, tag: string, t0: number, records = false): void {
  for (let i = 0; i < n; i++) recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: `${tag}${i}-1-1`, records }), { store: d.store, now: () => t0 + i * 1000 });
}

describe.each(["jsonl", "tigris"] as Kind[])("run history follows the player (%s)", (kind) => {
  const deps = (rig: Rig, d: Device, net = counted()) => ({ now: () => rig.clock.now, store: d.store, mirror: null, fetch: net.f, timeoutMs: 4000 });

  it("SHOW MY CODE on device A, ENTER A CODE on device B: B sees A's history, and A sees B's runs at its next sync", async () => {
    const rig = await openRig(kind);
    const A = await device(0), B = await device(1);
    const net = counted();
    play(A, 3, "a", NOW - 100_000);
    play(B, 2, "b", NOW - 50_000);
    expect(readLink(A.store)).toBeNull();

    // A shows a code: it counts as linked too (a record for its own key), and its runs go up under the player in the background
    const shown = await requestLinkCode(rig.base, A.id, deps(rig, A, net));
    if (!shown.ok) throw new Error(JSON.stringify(shown));
    expect(readLink(A.store)).toMatchObject({ v: 1, player: A.id.playerId, key: A.id.keyId });
    await historyIdle();
    expect(onServer(rig, A.id.playerId)).toHaveLength(3);
    expect(net.puts.sort()).toEqual(["a0-1-1", "a1-1-1", "a2-1-1"]);

    // B enters the code: its runs go up under the player, A's come down
    expect(await redeemLinkCode(rig.base, B.id, shown.code, deps(rig, B, net))).toEqual({ ok: true, player: A.id.playerId });
    await historyIdle();
    expect(onServer(rig, A.id.playerId)).toHaveLength(5); // the canonical player's, never B's own key id
    expect(onServer(rig, B.id.keyId!)).toHaveLength(0);
    expect(ids(B)).toEqual(["b1-1-1", "b0-1-1", "a2-1-1", "a1-1-1", "a0-1-1"]); // newest first
    expect(held(B).filter((l) => l.down).map((l) => l.entry.id)).toEqual(["a2-1-1", "a1-1-1", "a0-1-1"]);
    expect(held(B).filter((l) => l.sentTo === A.id.playerId).map((l) => l.entry.id)).toEqual(["b1-1-1", "b0-1-1"]);
    // what B holds of A's runs is what A sent, byte for byte
    const aEntries = new Map(held(A).map((l) => [l.entry.id, encodeEntry(l.entry)]));
    for (const l of held(B).filter((x) => x.down)) expect(encodeEntry(l.entry)).toBe(aEntries.get(l.entry.id));

    // A sees B's runs at its next sync (startup, an hour on)
    expect(ids(A)).toEqual(["a2-1-1", "a1-1-1", "a0-1-1"]);
    const within = await startupHistorySync(rig.base, A.id, deps(rig, A, net));
    expect(within.status).toBe("skipped"); // history's own hourly gate (stamped by the link-time sync)
    rig.clock.now += HISTORY_SYNC_INTERVAL_MS + 1000;
    const next = await startupHistorySync(rig.base, A.id, deps(rig, A, net));
    expect(next).toMatchObject({ status: "ok", sent: 0, received: 2 });
    expect(ids(A)).toEqual(["b1-1-1", "b0-1-1", "a2-1-1", "a1-1-1", "a0-1-1"]);
    expect(held(A).filter((l) => l.down).map((l) => l.entry.id)).toEqual(["b1-1-1", "b0-1-1"]);

    // no upload loop: once both are in step, a sync is one list read and nothing else
    net.reset();
    await syncHistory(rig.base, A.id, deps(rig, A, net));
    await syncHistory(rig.base, B.id, deps(rig, B, net));
    await syncHistory(rig.base, B.id, deps(rig, B, net));
    expect(net.calls).toEqual(["LIST", "LIST", "LIST"]);
    expect(onServer(rig, A.id.playerId)).toHaveLength(5);
  });

  it("a record B downloaded passes checkRecord, and replay() gives that dusk's own outcome", async () => {
    const rig = await openRig(kind);
    const A = await device(0), B = await device(1);
    const run = playedRun({ pattern: "WWW", end: "lost", records: true, runId: "rp-1-1" });
    for (const d of run.history) {
      const w = replay(d.record!).winner; // the dusk is what its record plays
      d.outcome = w === 0 ? "win" : w === 1 ? "loss" : "draw";
    }
    run.wins = run.history.filter((d) => d.outcome === "win").length;
    recordRunEnd(run, { store: A.store, now: () => NOW - 5000 });
    const shown = await requestLinkCode(rig.base, A.id, deps(rig, A));
    if (!shown.ok) throw new Error("no code");
    await redeemLinkCode(rig.base, B.id, shown.code, deps(rig, B));
    await historyIdle();
    const got = held(B).find((l) => l.entry.id === "rp-1-1");
    expect(got?.down).toBe(true);
    expect(got!.entry.dusks).toHaveLength(3);
    for (const d of got!.entry.dusks) {
      expect(d.record).toBeDefined();
      expect(() => checkRecord(d.record!)).not.toThrow();
      const w = replay(d.record!).winner;
      expect(w === 0 ? "win" : w === 1 ? "loss" : "draw").toBe(d.outcome);
    }
    expect(encodeEntry(got!.entry)).toBe(encodeEntry(held(A)[0].entry));
  });

  it("a device that was never linked makes no request (sync, startup, a run's end), and writes no link record", async () => {
    const rig = await openRig(kind);
    const A = await device(0);
    const net = counted();
    play(A, 2, "n", NOW - 10_000);
    expect(await syncHistory(rig.base, A.id, deps(rig, A, net))).toMatchObject({ status: "skipped", sent: 0, received: 0 });
    expect(await startupHistorySync(rig.base, A.id, deps(rig, A, net))).toMatchObject({ status: "skipped" });
    vi.stubGlobal("localStorage", A.store);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW - 1000);
    setSession({ url: rig.base, active: true, failed: false, identity: A.id, tick() {}, settle() {}, submitDusk() {}, countRun() {} } as never);
    foldRunEnd(playedRun({ pattern: "WWWWWWWWWW", runId: "never-1-1", records: false }));
    await historyIdle();
    expect(net.calls).toEqual([]);
    expect(onServer(rig, A.id.playerId)).toHaveLength(0);
    expect(A.store.getItem(LINK_KEY)).toBeNull();
    expect(A.store.keys()).toContain(HISTORY_KEY);
    expect(ids(A)).toContain("never-1-1"); // written locally all the same
  });

  it("the per-trigger bounds: a trigger sends at most 10 entries, newest first; none is sent twice", async () => {
    const rig = await openRig(kind);
    const A = await device(0);
    const net = counted();
    expect(HISTORY_UPLOADS_PER_TRIGGER).toBe(10);
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, A.store);
    play(A, 25, "u", NOW - 100_000);
    const r1 = await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false });
    expect(r1).toMatchObject({ status: "ok", sent: 10 });
    expect(net.puts).toEqual(Array.from({ length: 10 }, (_, i) => `u${24 - i}-1-1`)); // the newest ten
    expect(onServer(rig, A.id.playerId)).toHaveLength(10);
    expect(unsentFor(A.id.playerId, A.store)).toHaveLength(15);
    expect(await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false })).toMatchObject({ sent: 10 });
    expect(await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false })).toMatchObject({ sent: 5 });
    expect(await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false })).toMatchObject({ sent: 0 });
    expect(new Set(net.puts).size).toBe(25); // every id sent exactly once
    expect(net.puts).toHaveLength(25);
    expect(onServer(rig, A.id.playerId)).toHaveLength(25);
    expect(unsentFor(A.id.playerId, A.store)).toHaveLength(0);
  });

  it("the download bound: a sync reads at most 10 entries, newest first; the next sync the next 10; a full device asks for nothing it would drop", async () => {
    const rig = await openRig(kind);
    const A = await device(0), B = await device(1);
    const net = counted();
    expect(HISTORY_DOWNLOADS_PER_SYNC).toBe(10);
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, A.store);
    play(A, 30, "d", NOW - 100_000);
    for (let i = 0; i < 3; i++) await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false });
    expect(onServer(rig, A.id.playerId)).toHaveLength(30);
    // B links by hand to the same player (the server's link first: a real redeem)
    const shown = await requestLinkCode(rig.base, A.id, deps(rig, A, net));
    if (!shown.ok) throw new Error("no code");
    await historyIdle(); // A's own sync after showing the code
    net.reset();
    expect(await redeemLinkCode(rig.base, B.id, shown.code, deps(rig, B, net))).toMatchObject({ ok: true });
    await historyIdle();
    expect(net.n("LIST")).toBe(1);
    expect(net.n("READ")).toBe(10);
    expect(ids(B)).toEqual(Array.from({ length: 10 }, (_, i) => `d${29 - i}-1-1`)); // the newest ten
    await syncHistory(rig.base, B.id, deps(rig, B, net));
    expect(ids(B)).toEqual(Array.from({ length: 20 }, (_, i) => `d${29 - i}-1-1`));
    await syncHistory(rig.base, B.id, deps(rig, B, net));
    await syncHistory(rig.base, B.id, deps(rig, B, net));
    expect(ids(B)).toHaveLength(30);
    net.reset();
    await syncHistory(rig.base, B.id, deps(rig, B, net));
    expect(net.calls).toEqual(["LIST"]); // nothing left to read, nothing to send
  });

  it("a full device keeps its 50: it reads only what is newer than an entry it may drop", async () => {
    const rig = await openRig(kind);
    const A = await device(0), B = await device(1);
    const net = counted();
    const shown = await requestLinkCode(rig.base, A.id, deps(rig, A, net));
    if (!shown.ok) throw new Error("no code");
    await historyIdle();
    play(B, 50, "f", NOW - 200_000); // B's own 50 (after A's: they are the newest)
    expect(await redeemLinkCode(rig.base, B.id, shown.code, deps(rig, B, net))).toMatchObject({ ok: true });
    await historyIdle();
    for (let i = 0; i < 5; i++) await syncHistory(rig.base, B.id, deps(rig, B, net), { download: false });
    expect(unsentFor(A.id.playerId, B.store)).toHaveLength(0); // all 50 sent to the player
    // A has 12 OLDER runs: B asks for none of them (it would drop them at once)
    play(A, 12, "o", NOW - 900_000);
    for (let i = 0; i < 2; i++) await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false });
    net.reset();
    await syncHistory(rig.base, B.id, deps(rig, B, net));
    expect(net.calls).toEqual(["LIST"]);
    expect(ids(B)).toHaveLength(50);
    // A has 3 NEWER runs: B reads exactly those and drops its 3 oldest (sent) entries
    play(A, 3, "n", NOW - 20_000);
    await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false });
    net.reset();
    await syncHistory(rig.base, B.id, deps(rig, B, net));
    expect(net.n("READ")).toBe(3);
    expect(ids(B)).toHaveLength(50);
    expect(ids(B).slice(0, 3)).toEqual(["n2-1-1", "n1-1-1", "n0-1-1"]);
    for (const gone of ["f0-1-1", "f1-1-1", "f2-1-1"]) expect(ids(B)).not.toContain(gone); // the three oldest of B's own, all sent, went
    expect(ids(B)).toContain("f3-1-1");
    expect(held(B).slice(0, 3).every((l) => l.down)).toBe(true);
  });

  it("a 409 marks the entry as sent (the server's stays, the device's stays); a refusal of its content does too; neither is sent again", async () => {
    const rig = await openRig(kind);
    const A = await device(0);
    const net = counted();
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, A.store);
    // the server holds x-1-1 from another run of the same id (a different entry)
    expect(await putHistoryEntry(rig.base, A.id, entryOf("x-1-1", { outcome: "lost", wins: 1 }), { now: () => rig.clock.now })).toEqual({ ok: true, created: true });
    recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "x-1-1", records: false }), { store: A.store, now: () => NOW - 9000 });
    // and a run no server will take: 100 hearts left is over the ceiling
    const absurd = playedRun({ pattern: "WL", end: "lost", runId: "bad-1-1", records: false });
    absurd.lives = 100;
    recordRunEnd(absurd, { store: A.store, now: () => NOW - 8000 });
    const first = await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false });
    expect(first).toMatchObject({ status: "ok", sent: 1, refused: 1 }); // 409 counts as sent; the 422 as refused
    expect(unsentFor(A.id.playerId, A.store)).toHaveLength(0);
    expect(onServer(rig, A.id.playerId)).toHaveLength(1);
    net.reset();
    await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false });
    await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false });
    expect(net.calls).toEqual([]); // no loop
    expect(held(A).find((l) => l.entry.id === "x-1-1")!.entry.outcome).toBe("lost"); // the device's own entry is as it was
  });

  it("a wrong clock ends the trigger and keeps the entries unsent (it is no refusal of the entry)", async () => {
    const rig = await openRig(kind);
    const A = await device(0);
    const net = counted();
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, A.store);
    play(A, 3, "c", NOW - 10_000);
    const off = { ...deps(rig, A, net), now: () => rig.clock.now + 20 * 60_000 };
    const r = await syncHistory(rig.base, A.id, off);
    expect(r.status).toBe("failed");
    expect(net.puts).toHaveLength(1); // the first PUT said 422 about `at`: the trigger ended
    expect(unsentFor(A.id.playerId, A.store)).toHaveLength(3);
    expect(await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false })).toMatchObject({ status: "ok", sent: 3 }); // the clock is right again
  });

  it("uploads closed: the entries wait, the reads still work", async () => {
    const rig = await openRig(kind);
    const A = await device(0);
    const net = counted();
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, A.store);
    play(A, 2, "k", NOW - 10_000);
    await syncHistory(rig.base, A.id, deps(rig, A, net), { download: false });
    expect(onServer(rig, A.id.playerId)).toHaveLength(2);
    await rig.restart({ uploads: "closed" });
    play(A, 1, "z", NOW - 1000);
    // a reinstalled device (the same key, a clean storage, a link record) reads the player's history while uploads are closed
    const again = await device(0);
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, again.store);
    net.reset();
    const r = await syncHistory(rig.base, again.id, deps(rig, again, net));
    expect(r).toMatchObject({ status: "ok", sent: 0, received: 2 });
    expect(ids(again)).toEqual(["k1-1-1", "k0-1-1"]);
    // the original device cannot send its new run; it waits
    const w = await syncHistory(rig.base, A.id, deps(rig, A, net));
    expect(w).toMatchObject({ status: "ok", sent: 0 });
    expect(unsentFor(A.id.playerId, A.store).map((e) => e.id)).toEqual(["z0-1-1"]);
    expect(onServer(rig, A.id.playerId)).toHaveLength(2);
  });

  it("a 410 (the player was deleted from another device) does what a 410 to a ghost upload does: the device drops its key and link, keeps its history, and sends nothing after", async () => {
    const rig = await openRig(kind);
    const A = await device(0), B = await device(1);
    const net = counted();
    const shown = await requestLinkCode(rig.base, A.id, deps(rig, A, net));
    if (!shown.ok) throw new Error("no code");
    await redeemLinkCode(rig.base, B.id, shown.code, deps(rig, B, net));
    await historyIdle();
    play(B, 2, "g", NOW - 10_000);
    expect(readLink(B.store)).toMatchObject({ player: A.id.playerId });
    expect((await deleteMe(rig, A.id)).status).toBe(200); // another device deletes the player
    net.reset();
    const r = await syncHistory(rig.base, B.id, { ...deps(rig, B, net), keyStore: B.keys });
    expect(r.status).toBe("gone");
    expect(readLink(B.store)).toBeNull(); // forgetDeletedPlayer: the link record is gone
    expect(await B.keys.get()).toBeNull(); // and the dead key
    expect(ids(B)).toEqual(["g1-1-1", "g0-1-1"]); // local progress stays
    net.reset();
    expect(await syncHistory(rig.base, B.id, deps(rig, B, net))).toMatchObject({ status: "skipped" });
    expect(net.calls).toEqual([]); // nothing until a new link
  });

  it("the run's end sends the new entry when the device is linked and the session has an identity; otherwise the next trigger sends it", async () => {
    const rig = await openRig(kind);
    const A = await device(0);
    vi.stubGlobal("localStorage", A.store);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW - 1000);
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, A.store);
    const session = { url: rig.base, active: true, failed: false, identity: A.id, tick() {}, settle() {}, submitDusk() {}, countRun() {} };
    // no identity yet (it is still loading): the entry is written and waits
    setSession({ ...session, active: false, identity: undefined } as never);
    historyRunEnded(playedRun({ pattern: "WL", end: "lost", runId: "e1-1-1", records: false }));
    await historyIdle();
    expect(onServer(rig, A.id.playerId)).toHaveLength(0);
    expect(unsentFor(A.id.playerId, A.store).map((e) => e.id)).toEqual(["e1-1-1"]);
    // the identity is there: the next run's end sends it, and the one that waited, newest first
    setSession(session as never);
    vi.setSystemTime(NOW - 500);
    historyRunEnded(playedRun({ pattern: "WL", end: "lost", runId: "e2-1-1", records: false }));
    await historyIdle();
    expect(onServer(rig, A.id.playerId)).toHaveLength(2);
    expect(unsentFor(A.id.playerId, A.store)).toHaveLength(0);
    // the same run ending again changes nothing and sends nothing
    const before = onServer(rig, A.id.playerId);
    historyRunEnded(playedRun({ pattern: "WL", end: "lost", runId: "e2-1-1", records: false }));
    await historyIdle();
    expect(onServer(rig, A.id.playerId)).toEqual(before);
  });
});

describe("a server without the history routes (IDENT-1 only), and the hourly gate", () => {
  const BASE = "http://history-less.example";
  const notFound = (status: 404 | 405) => {
    let n = 0;
    const f = (async () => {
      n++;
      return new Response(JSON.stringify({ error: status === 404 ? "not found" : "use GET" }), { status });
    }) as unknown as typeof fetch;
    return { f, get n() { return n; } };
  };

  it.each([404, 405] as const)("a %i stops the history requests to that server for the page load and keeps the entries", async (status) => {
    const A = await device(0);
    const srv = notFound(status);
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, A.store);
    play(A, 2, "s", NOW - 10_000);
    const dep = { store: A.store, now: () => NOW, fetch: srv.f };
    expect(await syncHistory(BASE, A.id, dep)).toMatchObject({ status: "stopped", sent: 0 });
    expect(srv.n).toBe(1);
    expect(await syncHistory(BASE, A.id, dep)).toMatchObject({ status: "skipped" });
    expect(await startupHistorySync(BASE, A.id, dep)).toMatchObject({ status: "skipped" });
    expect(srv.n).toBe(1); // no more requests this page load
    expect(unsentFor(A.id.playerId, A.store)).toHaveLength(2); // kept
    resetHistorySync(); // a new page load tries again
    await syncHistory(BASE, A.id, dep);
    expect(srv.n).toBe(2);
  });

  it("the startup sync runs at most hourly by history's own time (kept in the history key); a failure does not move it", async () => {
    const A = await device(0);
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, A.store);
    let t = NOW;
    let status = 200;
    let n = 0;
    const f = (async () => {
      n++;
      return new Response(status === 200 ? '{"entries":[]}' : '{"error":"x"}', { status });
    }) as unknown as typeof fetch;
    const dep = { store: A.store, now: () => t, fetch: f };
    status = 503;
    expect(await startupHistorySync(BASE + "/a", A.id, dep)).toMatchObject({ status: "failed" });
    expect(readHistory(A.store).state.syncedAt).toBeUndefined(); // a failure does not stamp
    status = 200;
    expect(await startupHistorySync(BASE + "/a", A.id, dep)).toMatchObject({ status: "ok" });
    expect(readHistory(A.store).state.syncedAt).toBe(NOW);
    n = 0;
    t = NOW + HISTORY_SYNC_INTERVAL_MS - 1;
    expect(await startupHistorySync(BASE + "/a", A.id, dep)).toMatchObject({ status: "skipped" });
    expect(n).toBe(0);
    t = NOW + HISTORY_SYNC_INTERVAL_MS;
    expect(await startupHistorySync(BASE + "/a", A.id, dep)).toMatchObject({ status: "ok" });
    expect(n).toBe(1);
  });

  it("a failed entry read ends the sync without stamping it: the next page load tries again at once; the entries read before it are kept", async () => {
    const A = await device(0);
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, A.store);
    const listed = [entryOf("r2-1-1", {}, NOW - 2000), entryOf("r1-1-1", {}, NOW - 3000)];
    let readStatus = 200;
    const f = (async (input: RequestInfo | URL) => {
      const u = new URL(String(input));
      if (!u.search.includes("&id=")) return new Response(JSON.stringify({ entries: listed.map((e) => ({ id: e.id, finishedAt: e.finishedAt })) }), { status: 200 });
      const e = listed.find((x) => u.search.endsWith(`&id=${x.id}`))!;
      // the first entry reads well; the second one's read fails while readStatus says so
      return e.id === "r1-1-1" && readStatus !== 200 ? new Response('{"error":"down"}', { status: readStatus }) : new Response(JSON.stringify({ entry: e }), { status: 200 });
    }) as unknown as typeof fetch;
    const dep = { store: A.store, now: () => NOW, fetch: f };
    readStatus = 503;
    expect(await startupHistorySync(BASE + "/r", A.id, dep)).toMatchObject({ status: "failed", received: 1 });
    expect(ids(A)).toEqual(["r2-1-1"]); // the read before the failure was merged
    expect(readHistory(A.store).state.syncedAt).toBeUndefined(); // and the sync is not stamped
    readStatus = 200;
    expect(await startupHistorySync(BASE + "/r", A.id, dep)).toMatchObject({ status: "ok", received: 1 });
    expect(ids(A)).toEqual(["r2-1-1", "r1-1-1"]);
    expect(readHistory(A.store).state.syncedAt).toBe(NOW);
  });

  it("a newer build's history store is left alone by the sync: no request, no write", async () => {
    const A = await device(0);
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, A.store);
    const future = JSON.stringify({ v: 2, entries: [] });
    A.store.setItem(HISTORY_KEY, future);
    const srv = notFound(404);
    expect(await syncHistory(BASE + "/n", A.id, { store: A.store, now: () => NOW, fetch: srv.f })).toMatchObject({ status: "skipped" });
    expect(await startupHistorySync(BASE + "/n", A.id, { store: A.store, now: () => NOW, fetch: srv.f })).toMatchObject({ status: "skipped" });
    expect(srv.n).toBe(0);
    expect(A.store.getItem(HISTORY_KEY)).toBe(future);
  });
});

describe("SHOW MY CODE: the device that shows a code counts as linked too", () => {
  it("it gets the link record of a device whose player is its own key (and the mirror's copy); a device that has one keeps it; the identity is unchanged", async () => {
    const rig = await openRig("jsonl");
    const A = await device(0), C = await device(2);
    const mirror = memoryMirror();
    const shown = await requestLinkCode(rig.base, A.id, { now: () => rig.clock.now, store: A.store, mirror });
    expect(shown.ok).toBe(true);
    const rec = readLink(A.store)!;
    expect(rec).toMatchObject({ v: 1, player: A.id.keyId, key: A.id.keyId, at: rig.clock.now });
    expect(await mirror.get(MIRROR_LINK)).toBe(JSON.stringify({ v: 1, player: rec.player, key: rec.key, at: rec.at }));
    A.id.refresh?.();
    expect(A.id.playerId).toBe(A.id.keyId); // still its own player
    // showing a code again leaves the record as it is
    rig.clock.now += 5000;
    await requestLinkCode(rig.base, A.id, { now: () => rig.clock.now, store: A.store, mirror });
    expect(readLink(A.store)).toEqual(rec);
    // a device that is linked to another player keeps ITS record when it shows a code
    const code = await requestLinkCode(rig.base, A.id, { now: () => rig.clock.now });
    if (!code.ok) throw new Error("no code");
    expect(await redeemLinkCode(rig.base, C.id, code.code, { now: () => rig.clock.now, store: C.store, mirror: null })).toMatchObject({ ok: true });
    const before = readLink(C.store);
    await requestLinkCode(rig.base, C.id, { now: () => rig.clock.now + 1000, store: C.store, mirror: null });
    expect(readLink(C.store)).toEqual(before);
    await historyIdle();
  });

  it("a refused request writes nothing (no code, no link record)", async () => {
    const A = await device(0);
    const r = await requestLinkCode("http://127.0.0.1:1", A.id, { store: A.store, mirror: null, timeoutMs: 500 });
    expect(r.ok).toBe(false);
    expect(A.store.keys()).toEqual([]);
  });
});

describe("the title's startup trigger", () => {
  it("src/screens/title.ts starts the history sync beside the profile sync (once a page load)", () => {
    const src = readFileSync("src/screens/title.ts", "utf8");
    expect(src).toContain('import { startupHistorySync } from "../net/historySync"');
    expect(src).toMatch(/startupProfileSync\(s\.url, s\.identity\)\.catch\(\(\) => undefined\);[^\n]*\n\s*startupHistorySync\(s\.url, s\.identity\)\.catch\(\(\) => undefined\);/);
  });
});
