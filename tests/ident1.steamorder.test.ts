// IDENT-1 FIX2 (REQ-BFG-122), finding N1 of VERIFY-IDENT1-FIX1: linkSteam wrote the account's link (links/steam/<id>.json) BEFORE the player's
// record (players/<P>.json). A store failure between the two left a link the record did not list: the retry answered "yours already" and never
// repaired it, the key could then join another player, the Steam guard (F1) refused the account to everybody, and a DELETE left the link behind.
// Now the record goes first and the link second, as `join` orders its writes: a failure in the gap leaves a listed account with no link, which
// blocks the 409 rule, which the retry heals, and which a DELETE finds nothing to remove for. And because a record can then list an account whose
// link names ANOTHER player (that player linked the account in the gap), a DELETE removes a Steam link only when it names an id it tombstones.
// Both backing stores (JSON lines, and Tigris on the fake S3).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import type { LinkStore } from "../server/linkStore";
import { StorageError } from "../server/store";
import { testIdentity } from "./netIdentity";
import {
  closeRigs, deleteMe, fakeSteam, freshIdentity, identityRecords, linkSteamCall, linkVia, openRig, redeemCode, requestCode, theFake, type Kind, type Opts,
  type Reply, type Rig,
} from "./identRig";

let A: Identity;
beforeAll(async () => {
  A = await testIdentity(0);
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const NOLIMIT = { windowMs: 600_000, max: 1_000_000 };
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT, ...over });
const S = (n: number): string => `7656119800000${String(n).padStart(4, "0")}`;
const [S1, S2, S3, S4, S5] = [S(1), S(2), S(3), S(4), S(5)];
const steamLink = (id: string): string => `links/steam/${id}.json`;
const ONE_PLAYER_ONLY = { error: "this device already has linked devices or a Steam account" };
const codeOf = (r: Reply): string => String(r.json?.code);
const under = async (rig: Rig, prefix: string) => Object.keys(await identityRecords(rig)).filter((k) => k.startsWith(prefix)).sort();
const recordOf = async (rig: Rig, key: string): Promise<string> => (await identityRecords(rig))[key] ?? "";

/** Run `fn` while the store's put fails for the keys `match` takes (a store failure in the gap between two writes). */
async function failingPut<T>(rig: Rig, match: (k: string) => boolean, fn: () => Promise<T>): Promise<T> {
  const store = rig.app.links.store as { put: LinkStore["put"] };
  const real = store.put.bind(store);
  store.put = async (k: string, t: string) => {
    if (match(k)) throw new StorageError("identity write failed: HTTP 500");
    return real(k, t);
  };
  try {
    return await fn();
  } finally {
    store.put = real;
  }
}

/** Run `fn` while the store's get fails for the keys `match` takes. */
async function failingGet<T>(rig: Rig, match: (k: string) => boolean, fn: () => Promise<T>): Promise<T> {
  const store = rig.app.links.store as { get: LinkStore["get"] };
  const real = store.get.bind(store);
  store.get = async (k: string) => {
    if (match(k)) throw new StorageError("identity read failed: HTTP 500");
    return real(k);
  };
  try {
    return await fn();
  } finally {
    store.get = real;
  }
}

describe.each(KINDS)("N1: linkSteam writes the player's record first and the account's link second, on %s", (kind) => {
  it("(a) the first write (the player's record) fails: nothing was written, and the retry is a plain success", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, aa02: S1 }) });
    const K = await freshIdentity();
    const first = await failingPut(rig, (k) => k === `players/${K.playerId}.json`, () => linkSteamCall(rig, K, "aa01", "bb-ghost", 480));
    expect(first.status, first.text).toBe(503);
    expect(await under(rig, "links/steam/")).toEqual([]);
    expect(await under(rig, "players/")).toEqual([]);
    const retry = await linkSteamCall(rig, K, "aa02", "bb-ghost", 480);
    expect([retry.status, retry.json?.player], retry.text).toEqual([200, K.playerId]);
    expect(await under(rig, "links/steam/")).toEqual([steamLink(S1)]);
    expect(await under(rig, "players/")).toEqual([`players/${K.playerId}.json`]);
  });

  it("(b) the second write (the account's link) fails: the record lists the account, so the key cannot join another player (409), the retry heals the link, and a DELETE removes it", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, aa02: S1 }) });
    const K = await freshIdentity();
    const first = await failingPut(rig, (k) => k === steamLink(S1), () => linkSteamCall(rig, K, "aa01", "bb-ghost", 480));
    expect(first.status, first.text).toBe(503);
    expect(await under(rig, "links/steam/"), "the second write did not happen").toEqual([]);
    expect(JSON.parse(await recordOf(rig, `players/${K.playerId}.json`)).steam, "the first stood: the record lists the account").toEqual([S1]);
    const join = await redeemCode(rig, K, codeOf(await requestCode(rig, A)));
    expect([join.status, join.json], "K holds a Steam account (as far as its record says): it cannot join another player and orphan it").toEqual([409, ONE_PLAYER_ONLY]);
    const retry = await linkSteamCall(rig, K, "aa02", "bb-ghost", 480);
    expect([retry.status, retry.json?.player], retry.text).toEqual([200, K.playerId]);
    expect(await under(rig, "links/steam/"), "the retry healed the link").toEqual([steamLink(S1)]);
    expect(JSON.parse(await recordOf(rig, steamLink(S1))).player).toBe(K.playerId);
    expect((await deleteMe(rig, K)).status).toBe(200);
    expect(await under(rig, "links/steam/"), "and a DELETE takes it away").toEqual([]);
    expect(await under(rig, "players/"), "K's record is gone with it (A's, made by its code request, stays)").toEqual([`players/${A.playerId}.json`]);
  });

  it("(c) another player links the account between the two writes: the first key is refused (409) and nothing is re-pointed; its DELETE leaves that link alone, and the owner's Steam login still works", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, aa02: S1, bb01: S1, bb02: S1, cc01: S1 }) });
    const [K, B, C] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    const first = await failingPut(rig, (k) => k === steamLink(S1), () => linkSteamCall(rig, K, "aa01", "bb-ghost", 480));
    expect(first.status, first.text).toBe(503); // K's record lists S1; the account has no link
    const b = await linkSteamCall(rig, B, "bb01", "bb-ghost", 480); // B links the same account in the gap: unknown, so it becomes B's
    expect([b.status, b.json?.player], b.text).toEqual([200, B.playerId]);
    const bLink = await recordOf(rig, steamLink(S1));
    expect(JSON.parse(bLink).player).toBe(B.playerId);
    const retry = await linkSteamCall(rig, K, "aa02", "bb-ghost", 480);
    expect([retry.status, retry.json], "K lists an account, so it cannot join B: the account stays B's").toEqual([409, ONE_PLAYER_ONLY]);
    expect(await recordOf(rig, steamLink(S1)), "nothing was re-pointed").toBe(bLink);
    expect((await deleteMe(rig, K)).status).toBe(200);
    expect(await recordOf(rig, steamLink(S1)), "K's DELETE left B's link as it was").toBe(bLink);
    expect(await under(rig, "players/"), "K's record is gone, B's stays").toEqual([`players/${B.playerId}.json`]);
    const again = await linkSteamCall(rig, B, "bb02", "bb-ghost", 480);
    expect([again.status, again.json?.player], "B's Steam login still works").toEqual([200, B.playerId]);
    const c = await linkSteamCall(rig, C, "cc01", "bb-ghost", 480);
    expect([c.status, c.json?.player], "and a third key with the same account joins B; it does not take the account from B").toEqual([200, B.playerId]);
    expect(await recordOf(rig, steamLink(S1))).toBe(bLink);
    expect((await deleteMe(rig, B)).status).toBe(200);
    expect(await under(rig, "links/steam/"), "B's own DELETE removes the link it names").toEqual([]);
  });
});

describe.each(KINDS)("N1: a DELETE removes a Steam link only when it names an id it tombstones, on %s", (kind) => {
  /** A has the device D and lists five accounts: S1's link names A, S2's names D (a device: damaged data), S3's names the player B, S4's cannot be read, S5 has none. */
  async function world() {
    const rig = await open(kind);
    const D = await freshIdentity();
    const B = await freshIdentity();
    expect((await linkVia(rig, A, D)).joined.status).toBe(200);
    const rec = JSON.parse(await recordOf(rig, `players/${A.playerId}.json`));
    const store = rig.app.links.store;
    await store.put(`players/${A.playerId}.json`, JSON.stringify({ ...rec, steam: [S1, S2, S3, S4, S5] }));
    await store.put(steamLink(S1), JSON.stringify({ player: A.playerId, at: rig.clock.now }));
    await store.put(steamLink(S2), JSON.stringify({ player: D.playerId, at: rig.clock.now }));
    await store.put(steamLink(S3), JSON.stringify({ player: B.playerId, at: rig.clock.now }));
    await store.put(steamLink(S4), "{this is not a link");
    await rig.restart();
    return { rig, D, B };
  }

  it.each([["the first key"], ["a device"]])("DELETE from %s: the links naming the player or its device go, B's link and the unreadable one stay, and the log says so without an id", async (from) => {
    const { rig, D, B } = await world();
    const b = await recordOf(rig, steamLink(S3));
    expect((await deleteMe(rig, from === "a device" ? D : A)).status).toBe(200);
    expect(await under(rig, "links/steam/"), "S1 (the player's), S2 (a device's) and S5 (no link) leave nothing; S3 (B's) and S4 (unreadable) stay").toEqual([steamLink(S3), steamLink(S4)]);
    expect(await recordOf(rig, steamLink(S3)), "B's link is byte for byte as it was").toBe(b);
    expect(await recordOf(rig, steamLink(S4)), "and the unreadable one is as it was").toBe("{this is not a link");
    expect([...(await under(rig, "players/")), ...(await under(rig, "links/keys/")), ...(await under(rig, "linkcodes/"))], "nothing else of the player is left").toEqual([]);
    expect(JSON.parse(await recordOf(rig, `tombstones/${A.playerId}.json`)).ids.slice().sort()).toEqual([A.playerId, D.playerId].sort());
    const left = rig.log.filter((l) => l.includes("left an unreadable Steam link in place"));
    expect(left, "logged once, for the one link").toHaveLength(1);
    const everything = rig.log.join("\n");
    for (const secret of [A.playerId, D.playerId, B.playerId, S1, S2, S3, S4, S5]) expect(everything, "no id in the log").not.toContain(secret);
  });

  it("B, the owner of the link that stayed, can still log in with the account; the unreadable link is overwritten by the next one who links that account", async () => {
    const { rig, B } = await world();
    expect((await deleteMe(rig, A)).status).toBe(200);
    await rig.restart({ rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT, steam: fakeSteam({ bb01: S3, cc01: S4 }) });
    const b = await linkSteamCall(rig, B, "bb01", "bb-ghost", 480);
    expect([b.status, b.json?.player], "S3's link names B, so B's login is a plain success").toEqual([200, B.playerId]);
    const W = await freshIdentity();
    const w = await linkSteamCall(rig, W, "cc01", "bb-ghost", 480);
    expect([w.status, w.json?.player], "S4's link is unreadable: it reads as no link, so W takes the account").toEqual([200, W.playerId]);
    expect(JSON.parse(await recordOf(rig, steamLink(S4))).player, "and overwrote it").toBe(W.playerId);
  });

  it("a store failure while the DELETE reads a link: 503, the tombstone already stands, and the repeat finishes the cleanup", async () => {
    const { rig, D } = await world();
    const cut = await failingGet(rig, (k) => k === steamLink(S2), () => deleteMe(rig, D)); // a device asks: its own link goes last
    expect(cut.status, cut.text).toBe(503);
    const mid = await identityRecords(rig);
    expect(Object.keys(mid), "the tombstone goes first").toContain(`tombstones/${A.playerId}.json`);
    expect(Object.keys(mid), "the player's record is what is left (it goes late), so a repeat still finds the accounts").toContain(`players/${A.playerId}.json`);
    expect(Object.keys(mid).filter((k) => k.startsWith("links/steam/")).sort(), "S1 went before the failing read; the rest are still there").toEqual([steamLink(S2), steamLink(S3), steamLink(S4)]);
    const again = await deleteMe(rig, A); // the repeat, from the player's first key this time
    expect(again.status, again.text).toBe(200);
    expect(await under(rig, "links/steam/")).toEqual([steamLink(S3), steamLink(S4)]);
    expect([...(await under(rig, "players/")), ...(await under(rig, "links/keys/"))]).toEqual([]);
  });
});

describe("N1: what the extra read costs a DELETE (Tigris, counted at the fake S3)", () => {
  it("each Steam account the record lists costs one HEAD and one GET more (the link is read before it is removed); one DELETE each, as before", async () => {
    const accounts: Record<string, string> = { aa01: S1, aa02: S2, aa03: S3 };
    const rig = await open("tigris", { steam: fakeSteam(accounts) });
    for (const t of Object.keys(accounts)) expect((await linkSteamCall(rig, A, t, "bb-ghost", 480)).status).toBe(200);
    await rig.restart();
    const fake = theFake();
    const from = fake.requests.length;
    expect((await deleteMe(rig, A)).status).toBe(200);
    const mine = fake.requests.slice(from).filter((r) => r.bucket === rig.bucket && r.key.startsWith("links/steam/"));
    const ops = (op: string) => mine.filter((r) => r.op === op).length;
    expect([ops("HEAD"), ops("GET"), ops("DELETE")], "3 accounts: a HEAD and a GET to read each link, a DELETE to remove it").toEqual([3, 3, 3]);
    expect(await under(rig, "links/steam/")).toEqual([]);
  });
});
