// IDENT-1 steps 4 and 6 (REQ-BFG-122): the client half against the real server in process. A second device links with a one-time
// code and sees the merged profile; a link takes effect at the next new run (Identity.refresh); startup sync reads the player's
// profile at most once an hour and only on a device that was linked; deletion drops the key, the mirror and the link record and
// leaves local progress; older-build data never overwrites newer. The OPTIONS cards are tests/ident1.ui.test.ts's.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadIdentity, type Identity, type KeyStore } from "../src/net/identity";
import { memoryMirror } from "../src/net/identityMirror";
import { submitGhost } from "../src/net/ghostClient";
import { deleteOnlineData, forgetDeletedPlayer, linkSteam, redeemLinkCode, requestLinkCode } from "../src/net/linkClient";
import { LINK_KEY, readLink, writeLink } from "../src/net/linkState";
import { getProfile, putProfile } from "../src/net/profileClient";
import { SYNC_INTERVAL_MS, mergeRemoteProfile, startupProfileSync } from "../src/net/profileSync";
import { toWire } from "../src/net/profileWire";
import { PROFILE_KEY, PROFILE_V, emptyProfile, evaluateUnlocks, loadProfile, saveProfile, type Profile } from "../src/game/profile";
import { WIRE_V } from "../src/net/profileWire";
import { testKeyStore } from "./netIdentity";
import { closeRigs, fakeKeys, openRig, uploadFor, type Kind } from "./identRig";
import { NOW } from "./profileupWire";

afterAll(closeRigs);

type Mem = Storage & { keys(): string[] };
function mem(): Mem {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k), keys: () => [...m.keys()].sort(),
  };
}

/** A device: its own key, its own local storage, its own mirror (none by default). */
interface Device {
  id: Identity;
  store: Mem;
  keys: KeyStore;
}

async function device(n: number, store: Mem = mem()): Promise<Device> {
  const keys = await testKeyStore(n);
  const id = await loadIdentity(keys, undefined, { mirror: null, links: store });
  if (!id) throw new Error("no identity");
  return { id, store, keys };
}

/** A profile some runs in. */
function played(store: Mem, over: Partial<Profile["counters"]> = {}, at = NOW - 10_000): Profile {
  const p = loadProfile(store);
  p.counters = { ...p.counters, runs: 3, runsFinished: 1, duskWins: 9, bestDay: 6, ...over };
  p.heroesWon = ["furnace"];
  evaluateUnlocks(p);
  saveProfile(p, store, at);
  return loadProfile(store);
}

describe.each(["jsonl", "tigris"] as Kind[])("a second device links and sees the player's profile (%s)", (kind) => {
  it("SHOW MY CODE on one device, ENTER A CODE on the other: linked, profile merged, takes effect at the next new run", async () => {
    const rig = await openRig(kind);
    const one = await device(0);
    const two = await device(1);
    // device one has played and uploaded; device two has its own, different progress
    played(one.store, { runs: 5, bestDay: 8, flawless: 1 });
    expect(await putProfile(rig.base, one.id, loadProfile(one.store))).toEqual({ ok: true });
    const local2 = played(two.store, { runs: 2, bestDay: 3, duskWins: 20 });
    local2.heroesWon = ["weaver"];
    saveProfile(local2, two.store, NOW - 5_000);

    const shown = await requestLinkCode(rig.base, one.id, { now: () => rig.clock.now });
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    expect(shown.code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(shown.expiresAt).toBe(rig.clock.now + 10 * 60_000);

    // not linked yet: device two's playerId is its own key's and no record exists
    expect(two.id.playerId).toBe(two.id.keyId);
    expect(readLink(two.store)).toBeNull();
    const joined = await redeemLinkCode(rig.base, two.id, shown.code.toLowerCase().replace("-", " "), { now: () => rig.clock.now, store: two.store, mirror: null });
    expect(joined).toEqual({ ok: true, player: one.id.playerId });

    // the link record is written; the live session's playerId is unchanged until the next new run
    expect(readLink(two.store)).toMatchObject({ v: 1, player: one.id.playerId, key: two.id.keyId });
    expect(two.id.playerId).toBe(two.id.keyId);
    two.id.refresh?.();
    expect(two.id.playerId).toBe(one.id.playerId);
    expect(two.id.keyId).not.toBe(one.id.playerId);

    // the profile follows: device two now holds the max / union of both
    const merged = loadProfile(two.store);
    expect(merged.counters).toMatchObject({ runs: 5, bestDay: 8, flawless: 1, duskWins: 20 });
    expect(merged.heroesWon).toEqual(expect.arrayContaining(["furnace", "weaver"]));

    // and device two uploads under the player: a snapshot carrying the player's id passes the client's own check and the server's
    const up = await submitGhost(rig.base, uploadFor(two.id, two.id.playerId), two.id, 3000);
    expect(up.ok, JSON.stringify(up)).toBe(true);
    // a profile it uploads lands on the player's record, where device one reads it back
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
  });

  it("a refusal is a value, with the server's status: a wrong code, a used code, a key linked elsewhere", async () => {
    const rig = await openRig(kind);
    const one = await device(0), two = await device(1), three = await device(2);
    const code = await requestLinkCode(rig.base, one.id, { now: () => rig.clock.now });
    if (!code.ok) throw new Error("no code");
    const deps = (d: Device) => ({ now: () => rig.clock.now, store: d.store, mirror: null });
    const wrong = await redeemLinkCode(rig.base, two.id, "ZZZZ-ZZZZ", deps(two));
    expect(wrong).toMatchObject({ ok: false, status: 403 });
    expect(readLink(two.store)).toBeNull();
    expect(await redeemLinkCode(rig.base, two.id, code.code, deps(two))).toMatchObject({ ok: true });
    const again = await redeemLinkCode(rig.base, three.id, code.code, deps(three));
    expect(again).toMatchObject({ ok: false, status: 403 });
    expect((again as { error: string }).error).toBe((wrong as { error: string }).error); // one plain refusal, never which
    // device two is linked to one's player; a code from device three's player does not move it
    const other = await requestLinkCode(rig.base, three.id, { now: () => rig.clock.now });
    if (!other.ok) throw new Error("no code");
    expect(await redeemLinkCode(rig.base, two.id, other.code, deps(two))).toMatchObject({ ok: false, status: 409 });
    expect(readLink(two.store)?.player).toBe(one.id.playerId); // not re-pointed
  });

  it("no answer is a value without a status; nothing is written", async () => {
    const one = await device(0);
    const dead = await redeemLinkCode("http://127.0.0.1:1", one.id, "ABCD-EFGH", { store: one.store, mirror: null, timeoutMs: 800 });
    expect(dead.ok).toBe(false);
    expect(dead).not.toHaveProperty("status");
    expect(one.store.keys()).toEqual([]);
  });
});

describe("startup sync: only a linked device, at most once an hour", () => {
  it("a device that was never linked sends nothing and writes nothing", async () => {
    const d = await device(0);
    let calls = 0;
    const r = await startupProfileSync("http://x", d.id, { store: d.store, get: (async () => { calls++; return { ok: false, error: "x" }; }) as never });
    expect(r).toBe("skipped");
    expect(calls).toBe(0);
    expect(d.store.keys()).toEqual([]);
  });

  it("a linked device reads once, merges, marks the time; again within the hour: skipped; after it: reads again; failures are values", async () => {
    const rig = await openRig("jsonl");
    const one = await device(0), two = await device(1);
    played(one.store, { runs: 7, bestDay: 9 });
    await putProfile(rig.base, one.id, loadProfile(one.store));
    const t0 = rig.clock.now;
    // linked for real, through a code (the server must know the link too)
    const code = await requestLinkCode(rig.base, one.id, { now: () => t0 });
    if (!code.ok) throw new Error("no code");
    expect((await redeemLinkCode(rig.base, two.id, code.code, { now: () => t0, store: two.store, mirror: null })).ok).toBe(true);
    // the redeem itself read the profile (readAt = t0)
    expect(readLink(two.store)?.readAt).toBe(t0);
    expect(loadProfile(two.store).counters.runs).toBe(7);
    const reads: number[] = [];
    const spy = (async (...a: Parameters<typeof getProfile>) => { reads.push(1); return getProfile(...a); }) as typeof getProfile;
    expect(await startupProfileSync(rig.base, two.id, { store: two.store, now: () => t0 + 60_000, get: spy })).toBe("skipped"); // within the hour
    expect(reads).toHaveLength(0);
    // one hour on, the player has played more on device one
    const more = loadProfile(one.store);
    more.counters.runs = 11;
    saveProfile(more, one.store, t0 + 50_000);
    rig.clock.now = t0 + SYNC_INTERVAL_MS + 1000;
    await putProfile(rig.base, one.id, loadProfile(one.store));
    const later = t0 + SYNC_INTERVAL_MS + 2000;
    expect(await startupProfileSync(rig.base, two.id, { store: two.store, now: () => later, get: spy })).toBe("merged");
    expect(reads).toHaveLength(1);
    expect(loadProfile(two.store).counters.runs).toBe(11);
    expect(readLink(two.store)?.readAt).toBe(later);
    // a failure (server down) is a value and does not move the clock
    const down = await startupProfileSync("http://127.0.0.1:1", two.id, { store: two.store, now: () => later + 2 * SYNC_INTERVAL_MS, timeoutMs: 500 });
    expect(down).toBe("failed");
    expect(readLink(two.store)?.readAt).toBe(later);
  });
});

describe("older-build data never overwrites newer", () => {
  it("the merge keeps the larger counters and the newer pick; a stale profile moves nothing down", async () => {
    const rig = await openRig("jsonl");
    const one = await device(0), two = await device(1);
    const code = await requestLinkCode(rig.base, one.id, { now: () => rig.clock.now });
    if (!code.ok) throw new Error("no code");
    await redeemLinkCode(rig.base, two.id, code.code, { now: () => rig.clock.now, store: two.store, mirror: null });
    // device one is a newer game: more play, a newer pick
    const fresh = played(one.store, { runs: 9, bestDay: 9 }, NOW - 1000);
    fresh.chosen.floor = "timber";
    saveProfile(fresh, one.store, NOW - 1000);
    expect(await putProfile(rig.base, one.id, loadProfile(one.store))).toEqual({ ok: true });
    // device two is an older save: less play, an older stamp
    const stale = played(two.store, { runs: 4, bestDay: 4 }, NOW - 500_000);
    expect(await putProfile(rig.base, two.id, stale)).toEqual({ ok: true });
    const seen = await getProfile(rig.base, two.id, 3000, () => rig.clock.now);
    expect(seen.ok && seen.profile?.counters).toMatchObject({ runs: 9, bestDay: 9 });
    expect(seen.ok && seen.profile?.chosen.floor).toBe("timber");
  });

  it("a newer build's profile on the device is never written by the merge; a newer wire version is never merged", async () => {
    const d = await device(0);
    const newer = { ...emptyProfile(), v: PROFILE_V + 1, updatedAt: NOW, counters: { ...emptyProfile().counters, runs: 2 } };
    d.store.setItem(PROFILE_KEY, JSON.stringify(newer));
    const before = d.store.getItem(PROFILE_KEY);
    const remote = toWire({ ...emptyProfile(), counters: { ...emptyProfile().counters, runs: 50 }, updatedAt: NOW });
    expect(mergeRemoteProfile(remote, d.store)).toBe("skipped");
    expect(d.store.getItem(PROFILE_KEY)).toBe(before); // untouched
    loadProfile(mem()); // a fresh store resets profile.ts's write guard for the tests after this one
    // the wire version: the strict decode refuses a body newer than this build reads
    const rig = await openRig("jsonl");
    const one = await device(1);
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ player: one.id.playerId, profile: { ...remote, v: WIRE_V + 1 } }), { status: 200 })) as typeof fetch;
    try {
      const r = await getProfile(rig.base, one.id, 1000);
      expect(r.ok).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("DELETE MY ONLINE DATA", () => {
  it("the server forgets the player; the device drops its link, its mirror and its key; local progress stays; the next load is a new player", async () => {
    const rig = await openRig("tigris");
    const mirror = memoryMirror();
    const store = mem();
    const keys = await testKeyStore(0);
    const id = (await loadIdentity(keys, undefined, { mirror, links: store }))!;
    const progress = played(store, { runs: 6 });
    expect(await putProfile(rig.base, id, progress)).toEqual({ ok: true });
    writeLink({ v: 1, player: id.playerId, key: id.keyId!, at: NOW }, store); // a link record (to itself: only its shape matters here)
    await mirror.set("beltbattles.identity.link.v1", store.getItem(LINK_KEY)!);
    await mirror.set("beltbattles.identity.jwk.v1", "{}");
    const r = await deleteOnlineData(rig.base, id, { now: () => rig.clock.now, store, mirror, keyStore: keys });
    expect(r).toEqual({ ok: true });
    expect(readLink(store)).toBeNull();
    expect(mirror.values.size).toBe(0);
    expect(await keys.get()).toBeNull();
    expect(loadProfile(store).counters.runs).toBe(6); // local progress stays
    // the server: tombstoned
    expect(fakeKeys(rig, "tombstones/")).toEqual([`tombstones/${id.keyId}.json`]);
    expect(fakeKeys(rig, "profiles/")).toEqual([]);
    let told = 0;
    const gone = await submitGhost(rig.base, uploadFor(id), id, 3000, () => { told++; });
    expect(gone).toMatchObject({ ok: false, status: 410 });
    expect(told).toBe(1); // an upload under a deleted player's id is told it is gone
    // the next online use makes a new player
    const fresh = await loadIdentity(keys, undefined, { mirror: null, links: store });
    expect(fresh!.keyId).not.toBe(id.keyId);
    // a repeat after a half-done cleanup is safe: the server answers 200 again
    expect(await deleteOnlineData(rig.base, id, { now: () => rig.clock.now, store, mirror, keyStore: keys })).toEqual({ ok: true });
  });

  it("a 410 to an upload (the player was deleted from another device) makes this device drop its dead key, link and mirror", async () => {
    const rig = await openRig("jsonl");
    const mirror = memoryMirror();
    const store = mem();
    const keys = await testKeyStore(1);
    const one = await device(0);
    const two = (await loadIdentity(keys, undefined, { mirror, links: store }))!;
    const code = await requestLinkCode(rig.base, one.id, { now: () => rig.clock.now });
    if (!code.ok) throw new Error("no code");
    expect((await redeemLinkCode(rig.base, two, code.code, { now: () => rig.clock.now, store, mirror })).ok).toBe(true);
    await mirror.set("beltbattles.identity.jwk.v1", "{}");
    two.refresh?.();
    played(store, { runs: 4 });
    expect(await deleteOnlineData(rig.base, one.id, { now: () => rig.clock.now, store: one.store, mirror: null, keyStore: one.keys })).toEqual({ ok: true });
    // device two does not know yet: its next upload under the player is a 410, and its default reaction is to forget the key
    let dropped: Promise<unknown> | null = null;
    const r = await submitGhost(rig.base, uploadFor(two, two.playerId), two, 3000, () => { dropped = forgetDeletedPlayer({ store, mirror, keyStore: keys }); });
    expect(r).toMatchObject({ ok: false, status: 410 });
    expect(await dropped).toEqual({ ok: true });
    expect(readLink(store)).toBeNull();
    expect(mirror.values.size).toBe(0);
    expect(await keys.get()).toBeNull();
    expect(loadProfile(store).counters.runs).toBe(4); // progress stays
  });

  it("a refusal or no answer leaves the device exactly as it was", async () => {
    const d = await device(0);
    writeLink({ v: 1, player: d.id.playerId, key: d.id.keyId!, at: NOW }, d.store);
    const r = await deleteOnlineData("http://127.0.0.1:1", d.id, { store: d.store, mirror: null, keyStore: d.keys, timeoutMs: 500 });
    expect(r.ok).toBe(false);
    expect(readLink(d.store)).not.toBeNull();
    expect(await d.keys.get()).not.toBeNull();
  });
});

describe("linkSteam: the client half", () => {
  it("signs {at,ticket,identity,appid} in its own domain; 501 comes back as a value", async () => {
    const rig = await openRig("jsonl"); // no verifier: the server answers 501
    const d = await device(0);
    const r = await linkSteam(rig.base, d.id, "ab".repeat(20), "beltbattles-ghosts", 480, { now: () => rig.clock.now, store: d.store, mirror: null });
    expect(r).toEqual({ ok: false, status: 501, error: "steam linking is not configured" });
    expect(d.store.keys()).toEqual([]);
  });
});
