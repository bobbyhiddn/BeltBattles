// VERIFY-IDENT2 (REQ-BFG-122 clause 4), helper H-D, step 4 item e: SHOW MY CODE now writes the shower's own link record (decision 3: linkClient.ts
// requestLinkCode -> noteShowing -> selfLink, and a Steam link that names the key's own player). What that changes.
//   * IDENT-1's client tests (tests/ident1.client.test.ts) call requestLinkCode WITHOUT a store: in node localStorage is undefined, so selfLink is a no-op
//     there and the shower never had a record in those scenarios. Here the same scenarios run with a store per device (the record in place).
//   * the shower's startup profile read now runs; Identity.playerId is unchanged; a device that has a record keeps it;
//   * the shower later ENTERS another player's code (a join): its record, its history (re-sent to the new player?), what stays under history/<own id>/,
//     and where those objects go on the new player's DELETE and on purge-tombstoned;
//   * a code shown and never redeemed: the device uploads under its own id.
// Tests named "FINDING:" pin a defect as it is today; "NOTE:" is worth knowing. Both stores (JSON lines and the Tigris fake) where a server is used.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HISTORY_KEY, readHistory, recordRunEnd, unsentFor } from "../src/game/history";
import { evaluateUnlocks, loadProfile, saveProfile, type Profile } from "../src/game/profile";
import { setSession } from "../src/game/session";
import { submitGhost } from "../src/net/ghostClient";
import { loadIdentity, memoryKeyStore } from "../src/net/identity";
import { MIRROR_LINK, memoryMirror, type IdentityMirror } from "../src/net/identityMirror";
import { deleteOnlineData, linkSteam, redeemLinkCode, requestLinkCode } from "../src/net/linkClient";
import { LINK_KEY, readLink, writeLink } from "../src/net/linkState";
import { getProfile, putProfile } from "../src/net/profileClient";
import { SYNC_INTERVAL_MS, startupProfileSync } from "../src/net/profileSync";
import { historyIdle, resetHistorySync, startupHistorySync, syncHistory, type HistorySyncDeps } from "../src/net/historySync";
import { encodeEntry } from "../src/net/historyWire";
import { runAdmin } from "../server/ghostAdmin";
import { nameOf } from "../server/historyStore";
import { FAKE_CREDS } from "./netStores";
import { closeRigs, deleteMe, fakeSteam, theFake, uploadFor, type Kind, type Rig } from "./identRig";
import { OPEN, allHistory, entryFor, historyObjects, listEntries, listedIds, openHistoryRig, writeObject } from "./ident2Rig";
import { device, mem, playedRun, type Device, type Mem } from "./ident2Local";
import { NOW } from "./profileupWire";

vi.setConfig({ testTimeout: 20_000 });
afterAll(closeRigs);
beforeEach(() => resetHistorySync());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setSession(null);
});

const held = (d: Device) => readHistory(d.store).state.entries;
const ids = (d: Device) => held(d).map((l) => l.entry.id);

/** `n` finished runs on a device, ids `<tag><i>-1-1` (i = 0 the OLDEST), finished from t0 on, a second apart. */
function play(d: Device, n: number, tag: string, t0: number): void {
  for (let i = 0; i < n; i++) recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: `${tag}${i}-1-1`, records: false }), { store: d.store, now: () => t0 + i * 1000 });
}

/** Every request a device makes to the history routes, by kind, and the ids PUT. */
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
  return { f, calls, puts, reset: () => { calls.length = 0; puts.length = 0; } };
}
type Net = ReturnType<typeof counted>;

const dep = (rig: Rig, d: Device, net: Net = counted(), over: Partial<HistorySyncDeps> = {}): HistorySyncDeps => ({ now: () => rig.clock.now, store: d.store, mirror: null, fetch: net.f, timeoutMs: 4000, keyStore: d.keys, ...over });

/** A profile some runs in (tests/ident1.client.test.ts `played`). */
function played(store: Mem, over: Partial<Profile["counters"]> = {}, at = NOW - 10_000): Profile {
  const p = loadProfile(store);
  p.counters = { ...p.counters, runs: 3, runsFinished: 1, duskWins: 9, bestDay: 6, ...over };
  p.heroesWon = ["furnace"];
  evaluateUnlocks(p);
  saveProfile(p, store, at);
  return loadProfile(store);
}

/** The tool as the CLI runs it, over the rig's own storage: its output lines and exit code. */
async function purge(rig: Rig, apply: boolean): Promise<{ code: number; out: string[]; history: string[] }> {
  const w = rig.kind === "jsonl"
    ? { argv: ["--data", rig.dir], env: { BB_GHOST_STORE: "jsonl" } as Record<string, string> }
    : {
      argv: [] as string[],
      env: {
        BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
        AWS_ENDPOINT_URL_S3: theFake().endpoint, BUCKET_NAME: rig.bucket, BB_GHOST_S3_ADDRESSING: "path",
      } as Record<string, string>,
    };
  const out: string[] = [];
  const code = await runAdmin(["purge-tombstoned", ...(apply ? ["--apply"] : []), ...w.argv], w.env, (l) => out.push(l));
  return { code, out, history: out.filter((l) => l.startsWith("  delete history/")).map((l) => l.slice("  delete ".length)) };
}

// ------------------------------------------------------------------------------------------- 4e-1: IDENT-1's scenarios with the record in place

describe.each(["jsonl", "tigris"] as Kind[])("4e. IDENT-1's link scenarios (tests/ident1.client.test.ts), run with the shower's record in place (%s)", (kind) => {
  it("SHOW MY CODE on one device, ENTER A CODE on the other: the same outcome as IDENT-1's; the shower has its own record; its startup read now runs and brings the second device's progress back", async () => {
    const rig = await openHistoryRig(kind);
    const one = await device(0), two = await device(1);
    played(one.store, { runs: 5, bestDay: 8, flawless: 1 });
    expect(await putProfile(rig.base, one.id, loadProfile(one.store))).toEqual({ ok: true });
    const local2 = played(two.store, { runs: 2, bestDay: 3, duskWins: 20 });
    local2.heroesWon = ["weaver"];
    saveProfile(local2, two.store, NOW - 5_000);

    const shown = await requestLinkCode(rig.base, one.id, { now: () => rig.clock.now, store: one.store, mirror: null });
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    expect(shown.code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(shown.expiresAt).toBe(rig.clock.now + 10 * 60_000);
    // the one difference at this step: the shower has a record of its own (IDENT-1: none)
    expect(readLink(one.store)).toEqual({ v: 1, player: one.id.keyId, key: one.id.keyId, at: rig.clock.now });

    expect(two.id.playerId).toBe(two.id.keyId);
    expect(readLink(two.store)).toBeNull();
    const joined = await redeemLinkCode(rig.base, two.id, shown.code.toLowerCase().replace("-", " "), { now: () => rig.clock.now, store: two.store, mirror: null });
    expect(joined).toEqual({ ok: true, player: one.id.playerId });
    expect(readLink(two.store)).toMatchObject({ v: 1, player: one.id.playerId, key: two.id.keyId });
    expect(two.id.playerId).toBe(two.id.keyId);
    two.id.refresh?.();
    expect(two.id.playerId).toBe(one.id.playerId);
    expect(two.id.keyId).not.toBe(one.id.playerId);
    const merged = loadProfile(two.store);
    expect(merged.counters).toMatchObject({ runs: 5, bestDay: 8, flawless: 1, duskWins: 20 });
    expect(merged.heroesWon).toEqual(expect.arrayContaining(["furnace", "weaver"]));
    const up = await submitGhost(rig.base, uploadFor(two.id, two.id.playerId), two.id, 3000);
    expect(up.ok, JSON.stringify(up)).toBe(true);
    const bump = loadProfile(two.store);
    bump.counters.mostBelts = 17;
    saveProfile(bump, two.store, NOW - 1000);
    expect(await putProfile(rig.base, two.id, loadProfile(two.store))).toEqual({ ok: true });
    const back = await getProfile(rig.base, one.id, 3000, () => rig.clock.now);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.player).toBe(one.id.playerId);
      expect(back.profile?.counters.mostBelts).toBe(17);
    }
    // the shower: Identity.playerId is unchanged by its record, at a refresh and after
    one.id.refresh?.();
    expect(one.id.playerId).toBe(one.id.keyId);
    // IDENT-1: the shower never read the player's profile (no record, so startupProfileSync said "skipped" and it never saw the second device's progress).
    // Now it does, at its next startup, and takes the max / union of both
    const reads: number[] = [];
    const spy = (async (...a: Parameters<typeof getProfile>) => { reads.push(1); return getProfile(...a); }) as typeof getProfile;
    expect(loadProfile(one.store).counters.duskWins).toBe(9);
    expect(await startupProfileSync(rig.base, one.id, { store: one.store, now: () => rig.clock.now, get: spy })).toBe("merged");
    expect(reads).toHaveLength(1);
    expect(loadProfile(one.store).counters).toMatchObject({ duskWins: 20, mostBelts: 17 });
    expect(loadProfile(one.store).heroesWon).toEqual(expect.arrayContaining(["furnace", "weaver"]));
    expect(readLink(one.store)).toMatchObject({ player: one.id.keyId, key: one.id.keyId, readAt: rig.clock.now }); // the server's word on the player heals the record: unchanged
    expect(await startupProfileSync(rig.base, one.id, { store: one.store, now: () => rig.clock.now + 60_000, get: spy })).toBe("skipped"); // the hour
    expect(reads).toHaveLength(1);
    await historyIdle();
  });

  it("a refusal is a value with the server's status: a wrong code, a used code, a key linked elsewhere; the shower's record changes none of it", async () => {
    const rig = await openHistoryRig(kind);
    const one = await device(0), two = await device(1), three = await device(2);
    const deps = (d: Device) => ({ now: () => rig.clock.now, store: d.store, mirror: null });
    const code = await requestLinkCode(rig.base, one.id, deps(one));
    if (!code.ok) throw new Error("no code");
    const wrong = await redeemLinkCode(rig.base, two.id, "ZZZZ-ZZZZ", deps(two));
    expect(wrong).toMatchObject({ ok: false, status: 403 });
    expect(readLink(two.store)).toBeNull();
    expect(await redeemLinkCode(rig.base, two.id, code.code, deps(two))).toMatchObject({ ok: true });
    const again = await redeemLinkCode(rig.base, three.id, code.code, deps(three));
    expect(again).toMatchObject({ ok: false, status: 403 });
    expect((again as { error: string }).error).toBe((wrong as { error: string }).error);
    expect(readLink(three.store)).toBeNull(); // a refused redeem writes nothing
    const other = await requestLinkCode(rig.base, three.id, deps(three));
    if (!other.ok) throw new Error("no code");
    expect(readLink(three.store)).toMatchObject({ player: three.id.keyId, key: three.id.keyId });
    expect(await redeemLinkCode(rig.base, two.id, other.code, deps(two))).toMatchObject({ ok: false, status: 409 });
    expect(readLink(two.store)?.player).toBe(one.id.playerId);
    await historyIdle();
  });

  it("a shower whose code was redeemed cannot ENTER another player's code (409, as in IDENT-1), and keeps its own record and its own player", async () => {
    const rig = await openHistoryRig(kind);
    const S = await device(0), T = await device(1), U = await device(2);
    const net = counted();
    play(S, 2, "s", NOW - 100_000);
    const showS = await requestLinkCode(rig.base, S.id, dep(rig, S, net));
    const showU = await requestLinkCode(rig.base, U.id, dep(rig, U, net));
    if (!showS.ok || !showU.ok) throw new Error("no code");
    expect(await redeemLinkCode(rig.base, T.id, showS.code, dep(rig, T, net))).toMatchObject({ ok: true, player: S.id.keyId });
    await historyIdle();
    const before = readLink(S.store);
    const r = await redeemLinkCode(rig.base, S.id, showU.code, dep(rig, S, net));
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(readLink(S.store)).toEqual(before);
    // and the shower's history keeps going to its own player, where T's runs come together with it
    play(T, 1, "t", NOW - 50_000);
    await syncHistory(rig.base, T.id, dep(rig, T, net), { download: false });
    expect(historyObjects(rig, S.id.keyId!).sort()).toHaveLength(3);
    expect(historyObjects(rig, T.id.keyId!)).toHaveLength(0);
  });

  it("DELETE MY ONLINE DATA on a shower: its record, mirror copies and key go, local progress and local history stay; its uploaded history is removed on the server; a repeat is safe", async () => {
    const rig = await openHistoryRig(kind);
    const mirror = memoryMirror();
    const one = await device(0);
    played(one.store, { runs: 6 });
    play(one, 3, "d", NOW - 100_000);
    const net = counted();
    expect((await requestLinkCode(rig.base, one.id, dep(rig, one, net, { mirror }))).ok).toBe(true);
    await historyIdle();
    expect(await mirror.get(MIRROR_LINK)).not.toBeNull();
    expect(historyObjects(rig, one.id.keyId!)).toHaveLength(3);
    const r = await deleteOnlineData(rig.base, one.id, dep(rig, one, net, { mirror }));
    expect(r).toEqual({ ok: true });
    expect(readLink(one.store)).toBeNull();
    expect(mirror.values.size).toBe(0);
    expect(await one.keys.get()).toBeNull();
    expect(loadProfile(one.store).counters.runs).toBe(6);
    expect(ids(one)).toHaveLength(3); // the local history stays
    expect(historyObjects(rig, one.id.keyId!)).toEqual([]);
    expect(allHistory(rig)).toEqual([]);
    expect(await deleteOnlineData(rig.base, one.id, dep(rig, one, net, { mirror }))).toEqual({ ok: true }); // a repeat after a half-done cleanup
  });

  it("a stale record for another key is replaced by the shower's own (the old record was ignored anyway); a record for this key is kept", async () => {
    const rig = await openHistoryRig(kind);
    const A = await device(0), B = await device(1);
    writeLink({ v: 1, player: "some-older-player", key: "an-older-key-of-this-device", at: NOW - 5000, readAt: NOW - 4000 }, A.store);
    expect((await requestLinkCode(rig.base, A.id, dep(rig, A))).ok).toBe(true);
    expect(readLink(A.store)).toEqual({ v: 1, player: A.id.keyId, key: A.id.keyId, at: rig.clock.now });
    // a record that names this key and another player is the device's, and stays
    writeLink({ v: 1, player: B.id.keyId!, key: A.id.keyId!, at: NOW - 1, readAt: NOW - 1 }, A.store);
    const before = A.store.getItem(LINK_KEY);
    expect((await requestLinkCode(rig.base, A.id, dep(rig, A))).ok).toBe(true);
    expect(A.store.getItem(LINK_KEY)).toBe(before);
    await historyIdle();
  });
});

// ------------------------------------------------------------------------------ 4e-2: the shower later ENTERS another player's code (a join)

describe.each(["jsonl", "tigris"] as Kind[])("4e. the shower joins another player (%s)", (kind) => {
  async function world() {
    const rig = await openHistoryRig(kind);
    const S = await device(0), U = await device(1);
    const net = counted();
    play(S, 12, "s", NOW - 300_000);
    play(U, 2, "u", NOW - 200_000);
    const showS = await requestLinkCode(rig.base, S.id, dep(rig, S, net)); // S shows a code and nobody enters it
    if (!showS.ok) throw new Error("no code");
    await historyIdle();
    const showU = await requestLinkCode(rig.base, U.id, dep(rig, U, net));
    if (!showU.ok) throw new Error("no code");
    await historyIdle();
    return { rig, S, U, net, codeU: showU.code };
  }

  it("its record becomes the new player's; its history is sent again to the new player (10 a trigger); the old uploads stay under history/<own id>/; U's DELETE removes both; nothing else is touched", async () => {
    const { rig, S, U, net, codeU } = await world();
    expect(readLink(S.store)).toEqual({ v: 1, player: S.id.keyId, key: S.id.keyId, at: rig.clock.now });
    expect(historyObjects(rig, S.id.keyId!)).toHaveLength(10); // the code shown, never entered: the device uploaded its newest 10 under its OWN id
    expect(held(S).filter((l) => l.sentTo === S.id.keyId)).toHaveLength(10);
    expect(historyObjects(rig, U.id.keyId!)).toHaveLength(2);
    net.reset();
    rig.clock.now += 5000;
    expect(await redeemLinkCode(rig.base, S.id, codeU, dep(rig, S, net))).toEqual({ ok: true, player: U.id.keyId });
    await historyIdle();
    // the record
    expect(readLink(S.store)).toEqual({ v: 1, player: U.id.keyId, key: S.id.keyId, at: rig.clock.now, readAt: rig.clock.now });
    S.id.refresh?.();
    expect(S.id.playerId).toBe(U.id.keyId);
    // its history: the newest 10 of its 12 went to the new player (the per-trigger bound), including the ones the old player already had
    expect(net.puts).toHaveLength(10);
    expect(new Set(net.puts).size).toBe(10);
    expect(held(S).filter((l) => l.sentTo === U.id.keyId)).toHaveLength(10); // the marks moved to the new player
    expect(unsentFor(U.id.keyId!, S.store).map((e) => e.id)).toEqual(["s1-1-1", "s0-1-1"]); // two still to go
    expect(held(S).filter((l) => l.down).map((l) => l.entry.id).sort()).toEqual(["u0-1-1", "u1-1-1"]); // and U's two came down
    // what the server holds now (the listing the lead asked for)
    expect(historyObjects(rig, U.id.keyId!)).toHaveLength(12);
    expect(historyObjects(rig, S.id.keyId!)).toHaveLength(10); // finding 8: S's earlier uploads stay under its own, now dead, id
    expect(allHistory(rig)).toHaveLength(22);
    console.info(`vident3.showcode NOTE (${kind}): after the join, history/ holds ${allHistory(rig).length} objects: ${historyObjects(rig, U.id.keyId!).length} under the new player, ${historyObjects(rig, S.id.keyId!).length} orphaned under the shower's old id`);
    // nobody can read the orphans: S's reads go to the canonical player
    const listed = await listEntries(rig, S.id);
    expect(listedIds(listed)).toHaveLength(12);
    // the next trigger sends the last two
    await syncHistory(rig.base, S.id, dep(rig, S, net));
    expect(historyObjects(rig, U.id.keyId!)).toHaveLength(14);
    expect(unsentFor(U.id.keyId!, S.store)).toHaveLength(0);
    // the orphans do not go by themselves: not at a restart, not later
    await rig.restart(OPEN);
    rig.clock.now += 30 * 24 * 3_600_000;
    expect(historyObjects(rig, S.id.keyId!)).toHaveLength(10);
    // U deletes the player: the history of the player AND of every key it holds (S's old id included) goes
    expect((await deleteMe(rig, U.id)).status).toBe(200);
    expect(allHistory(rig)).toEqual([]);
    // S is told at its next use (410), and keeps its local history
    const gone = await syncHistory(rig.base, S.id, dep(rig, S, net, { mirror: memoryMirror() }));
    expect(gone.status).toBe("gone");
    expect(ids(S)).toHaveLength(14);
  });

  it("the new player's DELETE by the JOINED key (S itself) removes the player's history and the orphans under S's old id, and a late write under that id is found by purge-tombstoned", async () => {
    const { rig, S, U, net, codeU } = await world();
    expect(await redeemLinkCode(rig.base, S.id, codeU, dep(rig, S, net))).toMatchObject({ ok: true });
    await historyIdle();
    expect(allHistory(rig)).toHaveLength(22);
    expect((await deleteMe(rig, S.id)).status).toBe(200); // S is a key of U's player: this deletes the player
    expect(allHistory(rig)).toEqual([]);
    // another machine that had not seen the tombstone writes under the old id and under the player's
    writeObject(rig, S.id.keyId!, nameOf({ finishedAt: NOW - 1000, id: "late-s" }), encodeEntry(entryFor("late-s", { finishedAt: NOW - 1000 })));
    writeObject(rig, U.id.keyId!, nameOf({ finishedAt: NOW - 2000, id: "late-u" }), encodeEntry(entryFor("late-u", { finishedAt: NOW - 2000 })));
    writeObject(rig, "somebody-else", nameOf({ finishedAt: NOW - 3000, id: "theirs" }), encodeEntry(entryFor("theirs", { finishedAt: NOW - 3000 })));
    const dry = await purge(rig, false);
    expect(dry.code, dry.out.join("\n")).toBe(0);
    expect(dry.history.map((l) => l.split("/")[1]).sort()).toEqual([S.id.keyId, U.id.keyId].sort());
    expect(allHistory(rig)).toHaveLength(3); // a dry run deletes nothing
    const applied = await purge(rig, true);
    expect(applied.code, applied.out.join("\n")).toBe(0);
    expect(applied.out).toContain("APPLIED: deleted 2 of 2 history object(s).");
    expect(allHistory(rig)).toHaveLength(1);
    expect(historyObjects(rig, "somebody-else")).toHaveLength(1);
    // the device keeps its list; its next sync is a 410
    expect(ids(S).length).toBeGreaterThanOrEqual(12);
    expect((await syncHistory(rig.base, S.id, dep(rig, S, net, { mirror: memoryMirror() }))).status).toBe("gone");
  });

  it("NOTE: the server does not move a joined key's uploads into the player (decision: the device re-sends what it still holds); runs only the server holds stay orphaned, and the held ones are stored twice", async () => {
    const rig = await openHistoryRig(kind);
    const S = await device(0), U = await device(1);
    const net = counted();
    // S has uploaded 60 runs over time under its own id but keeps only the newest 50 on the device (the device cap)
    play(S, 30, "s", NOW - 300_000);
    expect((await requestLinkCode(rig.base, S.id, dep(rig, S, net))).ok).toBe(true);
    await historyIdle();
    for (let i = 0; i < 2; i++) await syncHistory(rig.base, S.id, dep(rig, S, net), { download: false });
    play(S, 30, "t", NOW - 200_000); // the 30 older ones are all sent: the cap drops the oldest 10 of them from the device
    for (let i = 0; i < 3; i++) await syncHistory(rig.base, S.id, dep(rig, S, net), { download: false });
    expect(ids(S)).toHaveLength(50);
    expect(historyObjects(rig, S.id.keyId!)).toHaveLength(60);
    const showU = await requestLinkCode(rig.base, U.id, dep(rig, U, net));
    if (!showU.ok) throw new Error("no code");
    await historyIdle();
    expect(await redeemLinkCode(rig.base, S.id, showU.code, dep(rig, S, net))).toMatchObject({ ok: true });
    await historyIdle();
    for (let i = 0; i < 5; i++) await syncHistory(rig.base, S.id, dep(rig, S, net), { download: false });
    // the device's newest 50 are under the new player; the 10 oldest runs reach it never (the device no longer holds them); 60 objects stay under the old id
    expect(historyObjects(rig, U.id.keyId!)).toHaveLength(50);
    expect(historyObjects(rig, S.id.keyId!)).toHaveLength(60);
    expect((await deleteMe(rig, U.id)).status).toBe(200);
    expect(allHistory(rig)).toEqual([]); // and the new player's DELETE removes all 110
  });
});

// ------------------------------------------------------------------------------------------------- 4e-3: a code shown and never redeemed

describe.each(["jsonl", "tigris"] as Kind[])("4e. a code shown and never redeemed (%s)", (kind) => {
  it("NOTE: the device is 'linked' to itself from the moment the code is shown: it uploads its history under its own id, at every later trigger, though the code expired unused", async () => {
    const rig = await openHistoryRig(kind);
    const A = await device(0);
    const net = counted();
    play(A, 3, "a", NOW - 100_000);
    expect(A.store.getItem(LINK_KEY)).toBeNull();
    const shown = await requestLinkCode(rig.base, A.id, dep(rig, A, net));
    expect(shown.ok).toBe(true);
    await historyIdle();
    expect(historyObjects(rig, A.id.keyId!)).toHaveLength(3); // a button press on the LINK A DEVICE card sent the run history to the server
    expect(net.puts).toHaveLength(3);
    // nobody enters the code; it expires; the record and the uploading stay
    rig.clock.now += 11 * 60_000;
    play(A, 1, "b", NOW - 1000);
    await syncHistory(rig.base, A.id, dep(rig, A, net), { download: false });
    expect(historyObjects(rig, A.id.keyId!)).toHaveLength(4);
    expect(readLink(A.store)).toMatchObject({ player: A.id.keyId, key: A.id.keyId });
    // the only way back is DELETE MY ONLINE DATA (which also drops the key)
    expect((await deleteMe(rig, A.id)).status).toBe(200);
    expect(allHistory(rig)).toEqual([]);
  });

  it("a refused or unanswered SHOW MY CODE writes no record and uploads nothing", async () => {
    const A = await device(0);
    const calls: string[] = [];
    const f = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ error: "uploads are not open yet" }), { status: 403 });
    }) as typeof fetch;
    play(A, 2, "r", NOW - 100_000);
    const before = A.store.getItem(HISTORY_KEY);
    expect((await requestLinkCode("http://scripted.example", A.id, { store: A.store, mirror: null, fetch: f })).ok).toBe(false);
    await historyIdle();
    expect(calls).toHaveLength(1); // the code request itself, nothing else
    expect(A.store.getItem(LINK_KEY)).toBeNull();
    expect(A.store.getItem(HISTORY_KEY)).toBe(before);
    void kind;
  });

  it("NOTE: the code card waits for the native mirror: a mirror that never answers keeps SHOW MY CODE pending (the comment says it never delays the card); a mirror that fails does not", async () => {
    const rig = await openHistoryRig(kind);
    const A = await device(0), B = await device(1);
    const hung: IdentityMirror = { get: async () => null, set: () => new Promise<void>(() => undefined), remove: async () => undefined };
    const pending = requestLinkCode(rig.base, A.id, dep(rig, A, counted(), { mirror: hung }));
    const first = await Promise.race([pending.then(() => "answered"), new Promise((r) => setTimeout(() => r("pending"), 400))]);
    expect(first).toBe("pending");
    expect(readLink(A.store)).not.toBeNull(); // the record is written before the mirror is asked
    const failing: IdentityMirror = { get: async () => null, set: async () => { throw new Error("plugin failed"); }, remove: async () => undefined };
    const shown = await requestLinkCode(rig.base, B.id, dep(rig, B, counted(), { mirror: failing }));
    expect(shown.ok).toBe(true);
    expect(readLink(B.store)).not.toBeNull();
    await historyIdle();
  });
});

// ------------------------------------------------------------------------------------------------------ 4e-4: the Steam first-device case

describe.each(["jsonl", "tigris"] as Kind[])("4e. a Steam link on the player's first device (review finding 3) (%s)", (kind) => {
  it("the first device gets its record and its history goes up; a second device linking the same Steam account sees it; the first sees the second's runs at its next sync", async () => {
    const S1 = "76561198000000001";
    const rig = await openHistoryRig(kind, { steam: fakeSteam({ ab12: S1, ab13: S1, ab14: S1 }) }); // a ticket is good once: a repeat needs a new one
    const A = await device(0), B = await device(1);
    const net = counted();
    play(A, 3, "a", NOW - 100_000);
    play(B, 2, "b", NOW - 50_000);
    expect(readLink(A.store)).toBeNull();
    // the first device links Steam: the answer names its own key as the player
    expect(await linkSteam(rig.base, A.id, "ab12", "myidentity", 480, dep(rig, A, net))).toEqual({ ok: true, player: A.id.keyId });
    await historyIdle();
    expect(readLink(A.store)).toMatchObject({ v: 1, player: A.id.keyId, key: A.id.keyId });
    expect(historyObjects(rig, A.id.keyId!)).toHaveLength(3);
    // linking it again changes nothing
    const rec = A.store.getItem(LINK_KEY);
    expect(await linkSteam(rig.base, A.id, "ab14", "myidentity", 480, dep(rig, A, net))).toEqual({ ok: true, player: A.id.keyId });
    await historyIdle();
    expect(A.store.getItem(LINK_KEY)).toBe(rec);
    expect(historyObjects(rig, A.id.keyId!)).toHaveLength(3);
    // the second device links the same account: it joins the first device's player and gets its history; its own runs go up under the player
    expect(await linkSteam(rig.base, B.id, "ab13", "myidentity", 480, dep(rig, B, net))).toEqual({ ok: true, player: A.id.keyId });
    await historyIdle();
    expect(readLink(B.store)).toMatchObject({ player: A.id.keyId, key: B.id.keyId });
    expect(ids(B)).toEqual(["b1-1-1", "b0-1-1", "a2-1-1", "a1-1-1", "a0-1-1"]);
    expect(historyObjects(rig, A.id.keyId!)).toHaveLength(5);
    // the first device reads the second's runs at its next startup
    rig.clock.now += 3_600_000 + 1000;
    expect(await startupHistorySync(rig.base, A.id, dep(rig, A, net))).toMatchObject({ status: "ok", received: 2 });
    expect(ids(A)).toEqual(["b1-1-1", "b0-1-1", "a2-1-1", "a1-1-1", "a0-1-1"]);
  });
});

// ----------------------------------------------------------------- 4e-4b: IDENT-1's run-count scenario and a purged WebView, with the record in place

describe.each(["jsonl", "tigris"] as Kind[])("4e. more IDENT-1 scenarios with the shower's record in place (%s)", (kind) => {
  it("the finished-run count follows the player (ident1.client): a linked second device's stated count is raised to the merged profile's, never lowered; an unlinked device writes nothing", async () => {
    const rig = await openHistoryRig(kind);
    const one = await device(0), two = await device(1), three = await device(2);
    played(one.store, { runs: 6 });
    expect(await putProfile(rig.base, one.id, loadProfile(one.store))).toEqual({ ok: true });
    const deps = (d: Device) => ({ now: () => rig.clock.now, store: d.store, mirror: null });
    const code = await requestLinkCode(rig.base, one.id, deps(one));
    if (!code.ok) throw new Error("no code");
    expect(two.store.getItem("beltbattles.runs.v1")).toBeNull();
    expect((await redeemLinkCode(rig.base, two.id, code.code, deps(two))).ok).toBe(true);
    expect(JSON.parse(two.store.getItem("beltbattles.runs.v1")!)).toEqual({ runs: 6 });
    three.store.setItem("beltbattles.runs.v1", JSON.stringify({ runs: 9, last: "r-9" }));
    const code2 = await requestLinkCode(rig.base, one.id, deps(one));
    if (!code2.ok) throw new Error("no code");
    expect((await redeemLinkCode(rig.base, three.id, code2.code, deps(three))).ok).toBe(true);
    expect(JSON.parse(three.store.getItem("beltbattles.runs.v1")!)).toEqual({ runs: 9, last: "r-9" });
    const four = await device(3);
    expect(four.store.keys()).toEqual([]);
    // the shower itself: its own count is untouched by showing a code (it is the player's first device)
    expect(one.store.getItem("beltbattles.runs.v1")).toBeNull();
    await historyIdle();
  });

  it("a purged WebView (empty storage and IndexedDB, the native mirror kept) gets its key and the shower's own record back from the mirror, and the player's history back from the server", async () => {
    const rig = await openHistoryRig(kind);
    const mirror = memoryMirror();
    const keys1 = memoryKeyStore();
    const store1 = mem();
    const id1 = (await loadIdentity(keys1, undefined, { mirror, links: store1 }))!;
    const A: Device = { id: id1, store: store1, keys: keys1 };
    play(A, 3, "p", NOW - 100_000);
    expect((await requestLinkCode(rig.base, A.id, dep(rig, A, counted(), { mirror }))).ok).toBe(true);
    await historyIdle();
    expect(historyObjects(rig, id1.keyId!)).toHaveLength(3);
    expect(await mirror.get(MIRROR_LINK)).not.toBeNull();
    // the WebView is purged: no localStorage, no IndexedDB; the mirror stays
    const keys2 = memoryKeyStore();
    const store2 = mem();
    const id2 = (await loadIdentity(keys2, undefined, { mirror, links: store2 }))!;
    expect(id2.keyId).toBe(id1.keyId);
    expect(readLink(store2)).toMatchObject({ player: id1.keyId, key: id1.keyId });
    expect(store2.getItem(HISTORY_KEY)).toBeNull(); // the local history is gone with the WebView
    const B: Device = { id: id2, store: store2, keys: keys2 };
    const r = await startupHistorySync(rig.base, id2, dep(rig, B, counted(), { mirror }));
    expect(r).toMatchObject({ status: "ok", received: 3 });
    expect(ids(B)).toEqual(["p2-1-1", "p1-1-1", "p0-1-1"]); // the history came back from the server
    expect(held(B).every((l) => l.down)).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------------- 4e-5: the profile read of a shower, sizes

describe("4e. what the shower's record adds to a page load", () => {
  it("a shower with a record makes, at a page load, one profile read and one history list read (once an hour each), and nothing else", async () => {
    const rig = await openHistoryRig("jsonl");
    const A = await device(0);
    const net = counted();
    expect((await requestLinkCode(rig.base, A.id, dep(rig, A, net))).ok).toBe(true);
    await historyIdle();
    net.reset();
    rig.clock.now += SYNC_INTERVAL_MS + 1000;
    const calls: string[] = [];
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${new URL(String(input)).pathname}`);
      return fetch(input, init);
    }) as typeof fetch;
    const p = await startupProfileSync(rig.base, A.id, { store: A.store, now: () => rig.clock.now, get: (async (...a: Parameters<typeof getProfile>) => { calls.push("GET /v1/profile"); return getProfile(...a); }) as typeof getProfile });
    const h = await startupHistorySync(rig.base, A.id, dep(rig, A, net, { fetch: f }));
    expect(p).toBe("unchanged");
    expect(h).toMatchObject({ status: "ok", sent: 0, received: 0 });
    expect(calls.sort()).toEqual(["GET /v1/history", "GET /v1/profile"]);
    // a second page load within the hour: nothing
    calls.length = 0;
    expect(await startupProfileSync(rig.base, A.id, { store: A.store, now: () => rig.clock.now + 1000 })).toBe("skipped");
    expect((await startupHistorySync(rig.base, A.id, dep(rig, A, net, { fetch: f, now: () => rig.clock.now + 1000 }))).status).toBe("skipped");
    expect(calls).toEqual([]);
  });
});
