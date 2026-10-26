// VERIFY-IDENT1-FIX2 (REQ-BFG-122) step 4a and 4b, written by the independent re-checker (cap_xi): ATTACKS ON N1's FIX (server/links.ts linkSteam's write order,
// and the Steam-link check in deletePlayer / dropSteamLink) that tests/ident1.steamorder.test.ts does not make. Both backing stores.
//   1  the write order itself, and the state (records, links, what each reader answers) after a failure at each of the two writes, a second failure,
//      a restart, a device's login, a DELETE from the first key and from a device, and the cap
//   2  player B links the same account between A's two writes (A's device then tries), after A's retry, and DURING A's DELETE (a sibling machine)
//   3  deletePlayer's check, link by link: names the player / a device / an id of an earlier tombstone / another player / a lone key; missing; unreadable in
//      eight ways; with extra fields; what each later reader (the next Steam login, the profile routes) answers
//   4  two DELETEs at once (one machine, two machines), a failing delete of a link, the cost of a full player's DELETE
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import type { LinkStore } from "../server/linkStore";
import { StorageError } from "../server/store";
import { testIdentity } from "./netIdentity";
import { earnedWire } from "./profileupWire";
import {
  closeRigs, deleteMe, fakeSteam, freshIdentity, identityRecords, linkSteamCall, linkVia, openRig, openSibling, putWire, readProfile, redeemCode, requestCode,
  theFake, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity;
beforeAll(async () => {
  A = await testIdentity(0);
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const NOLIMIT = { windowMs: 600_000, max: 1_000_000 };
const BASE: Opts = { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT };
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { ...BASE, ...over });
const S = (n: number): string => `7656119800000${String(n).padStart(4, "0")}`;
const [S1, S2, S3, S4, S5] = [S(1), S(2), S(3), S(4), S(5)];
const steamLink = (id: string): string => `links/steam/${id}.json`;
const ONE_PLAYER_ONLY = { error: "this device already has linked devices or a Steam account" };
const codeOf = (r: Reply): string => String(r.json?.code);
const under = async (rig: Rig, prefix: string) => Object.keys(await identityRecords(rig)).filter((k) => k.startsWith(prefix)).sort();
const recordOf = async (rig: Rig, key: string): Promise<string | undefined> => (await identityRecords(rig))[key];
const idsOf = async (rig: Rig, player: string): Promise<string[]> => (JSON.parse((await recordOf(rig, `tombstones/${player}.json`)) ?? "{}").ids ?? []).slice().sort();
const UNREADABLE_LINE = "left an unreadable Steam link in place";
const count = (log: string[], what: string): number => log.filter((l) => l.includes(what)).length;

/** Run `fn` while `op` of the store fails for the keys `match` takes. */
async function failing<T>(rig: Rig, op: "put" | "get" | "delete", match: (k: string) => boolean, fn: () => Promise<T>): Promise<T> {
  const store = rig.app.links.store as unknown as Record<string, (k: string, t?: string) => Promise<unknown>>;
  const real = store[op].bind(store);
  store[op] = async (k: string, t?: string) => {
    if (match(k)) throw new StorageError(`identity ${op} failed: HTTP 500`);
    return real(k, t);
  };
  try {
    return await fn();
  } finally {
    store[op] = real;
  }
}

/** Run `fn` with a hook that runs once, just before the store's `op` on the key `match` takes. */
async function hooked<T>(rig: Rig, op: "get" | "delete", match: (k: string) => boolean, hook: () => Promise<void>, fn: () => Promise<T>): Promise<T> {
  const store = rig.app.links.store as unknown as Record<string, (k: string) => Promise<unknown>>;
  const real = store[op].bind(store);
  let fired = false;
  store[op] = async (k: string) => {
    if (!fired && match(k)) {
      fired = true;
      await hook();
    }
    return real(k);
  };
  try {
    const out = await fn();
    expect(fired, "the hook ran").toBe(true);
    return out;
  } finally {
    store[op] = real;
  }
}

// ============================================================================================================== 1. the write order and the states

describe.each(KINDS)("1. linkSteam's write order and the state after a failure at each write, on %s", (kind) => {
  it("the order, logged at the store: the player's record first, then the account's link; a repeat login with the same account writes nothing", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, aa02: S1, aa03: S2 }) });
    const K = await freshIdentity();
    const store = rig.app.links.store as { put: LinkStore["put"] };
    const real = store.put.bind(store);
    const puts: string[] = [];
    store.put = async (k: string, t: string) => (puts.push(k), real(k, t));
    try {
      expect((await linkSteamCall(rig, K, "aa01", "bb-ghost", 480)).status).toBe(200);
      expect(puts, "a new account: the record, then the link").toEqual([`players/${K.playerId}.json`, steamLink(S1)]);
      puts.length = 0;
      expect((await linkSteamCall(rig, K, "aa02", "bb-ghost", 480)).status).toBe(200);
      expect(puts, "the same account again: nothing is written").toEqual([]);
      expect((await linkSteamCall(rig, K, "aa03", "bb-ghost", 480)).status).toBe(200);
      expect(puts, "a second account: the record, then the link").toEqual([`players/${K.playerId}.json`, steamLink(S2)]);
    } finally {
      store.put = real;
    }
  });

  it("the link write fails: K's record lists the account and no link exists; K can issue a code and take a device; the device's own login heals the link (to the player); the DELETE from that device leaves nothing", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, dd01: S1 }) });
    const [K, D] = [await freshIdentity(), await freshIdentity()];
    const first = await failing(rig, "put", (k) => k === steamLink(S1), () => linkSteamCall(rig, K, "aa01", "bb-ghost", 480));
    expect(first.status, first.text).toBe(503);
    expect(JSON.parse((await recordOf(rig, `players/${K.playerId}.json`)) ?? "{}").steam).toEqual([S1]);
    expect(await under(rig, "links/steam/")).toEqual([]);
    expect((await linkVia(rig, K, D)).joined.status, "K holds a listed account, but a device may join K").toBe(200);
    const rec = JSON.parse((await recordOf(rig, `players/${K.playerId}.json`)) ?? "{}");
    expect([rec.keys, rec.steam], "the code request and the join kept the listing").toEqual([[D.playerId], [S1]]);
    const login = await linkSteamCall(rig, D, "dd01", "bb-ghost", 480);
    expect([login.status, login.json?.player], login.text).toEqual([200, K.playerId]);
    expect(JSON.parse((await recordOf(rig, steamLink(S1))) ?? "{}").player, "the link names the player, not the device").toBe(K.playerId);
    expect((await deleteMe(rig, D)).status).toBe(200);
    expect(await under(rig, "links/steam/")).toEqual([]);
    expect([...(await under(rig, "players/")), ...(await under(rig, "links/keys/")), ...(await under(rig, "linkcodes/"))]).toEqual([]);
    expect(await idsOf(rig, K.playerId)).toEqual([K.playerId, D.playerId].sort());
  });

  it("the link write fails and the device asks for the DELETE before any retry: the record lists S1, no link exists, nothing is left; the account is free for the next key", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, ee01: S1 }) });
    const [K, D, W] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    expect((await failing(rig, "put", (k) => k === steamLink(S1), () => linkSteamCall(rig, K, "aa01", "bb-ghost", 480))).status).toBe(503);
    expect((await linkVia(rig, K, D)).joined.status).toBe(200);
    expect((await deleteMe(rig, D)).status, "from the device").toBe(200);
    expect(await under(rig, "links/steam/")).toEqual([]);
    expect([...(await under(rig, "players/")), ...(await under(rig, "links/keys/"))]).toEqual([]);
    const w = await linkSteamCall(rig, W, "ee01", "bb-ghost", 480);
    expect([w.status, w.json?.player], "the account is W's own: nothing of K's is in the way").toEqual([200, W.playerId]);
    expect(JSON.parse((await recordOf(rig, steamLink(S1))) ?? "{}").player).toBe(W.playerId);
  });

  it("the retry fails at the same write again: still 503, the record lists the account ONCE; the third try heals; a restart in between changes nothing", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, aa02: S1, aa03: S1 }) });
    const K = await freshIdentity();
    for (const [ticket, again] of [["aa01", false], ["aa02", true]] as const) {
      const r = await failing(rig, "put", (k) => k === steamLink(S1), () => linkSteamCall(rig, K, ticket, "bb-ghost", 480));
      expect(r.status, `${ticket}: ${r.text}`).toBe(503);
      expect(JSON.parse((await recordOf(rig, `players/${K.playerId}.json`)) ?? "{}").steam, again ? "(the second failure)" : "").toEqual([S1]);
    }
    await rig.restart({ ...BASE, steam: fakeSteam({ aa03: S1 }) });
    const r = await linkSteamCall(rig, K, "aa03", "bb-ghost", 480);
    expect([r.status, r.json?.player], r.text).toEqual([200, K.playerId]);
    expect(await under(rig, "links/steam/")).toEqual([steamLink(S1)]);
    expect(JSON.parse((await recordOf(rig, `players/${K.playerId}.json`)) ?? "{}").steam, "listed once").toEqual([S1]);
  });

  it("at the cap: 63 accounts linked and the 64th listed with no link: the retry still heals it (a listed account takes no new place), and a 65th is 409", async () => {
    const accounts: Record<string, string> = { aa01: S(64), aa02: S(64), aa03: S(65) };
    const rig = await open(kind, { steam: fakeSteam(accounts) });
    const K = await freshIdentity();
    const store = rig.app.links.store;
    const listed = Array.from({ length: 63 }, (_, i) => S(100 + i));
    await store.put(`players/${K.playerId}.json`, JSON.stringify({ keys: [], steam: listed, at: rig.clock.now }));
    for (const s of listed) await store.put(steamLink(s), JSON.stringify({ player: K.playerId, at: rig.clock.now }));
    await rig.restart({ ...BASE, steam: fakeSteam(accounts) });
    const first = await failing(rig, "put", (k) => k === steamLink(S(64)), () => linkSteamCall(rig, K, "aa01", "bb-ghost", 480));
    expect(first.status).toBe(503);
    expect(JSON.parse((await recordOf(rig, `players/${K.playerId}.json`)) ?? "{}").steam, "64 listed, 63 linked").toHaveLength(64);
    const retry = await linkSteamCall(rig, K, "aa02", "bb-ghost", 480);
    expect([retry.status, retry.json?.player], retry.text).toEqual([200, K.playerId]);
    expect(await under(rig, "links/steam/")).toHaveLength(64);
    const over = await linkSteamCall(rig, K, "aa03", "bb-ghost", 480);
    expect([over.status, over.json], over.text).toEqual([409, { error: "this player already has the most Steam accounts it can have" }]);
    expect(await under(rig, "links/steam/"), "the 65th wrote nothing").toHaveLength(64);
  });
});

// ============================================================================================================== 2. player B links the same account

describe.each(KINDS)("2. player B links the same account: before A's retry, after it, and during A's DELETE, on %s", (kind) => {
  it("BEFORE A's retry: A's device D cannot take the account either (409, it is linked to A); nothing is re-pointed; D's and A's DELETEs leave B's link; B logs in", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, bb01: S1, bb02: S1, dd01: S1 }) });
    const [K, D, B] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    expect((await failing(rig, "put", (k) => k === steamLink(S1), () => linkSteamCall(rig, K, "aa01", "bb-ghost", 480))).status).toBe(503);
    expect((await linkVia(rig, K, D)).joined.status).toBe(200);
    expect((await linkSteamCall(rig, B, "bb01", "bb-ghost", 480)).json?.player, "B links the account in the gap").toBe(B.playerId);
    const bLink = await recordOf(rig, steamLink(S1));
    const dd = await linkSteamCall(rig, D, "dd01", "bb-ghost", 480);
    expect([dd.status, dd.json], "D is linked to K already").toEqual([409, { error: "this device is already linked to another player" }]);
    expect(await recordOf(rig, steamLink(S1)), "nothing re-pointed").toBe(bLink);
    expect((await deleteMe(rig, D)).status).toBe(200); // from the device
    expect(await recordOf(rig, steamLink(S1)), "K's DELETE left B's link").toBe(bLink);
    const b2 = await linkSteamCall(rig, B, "bb02", "bb-ghost", 480);
    expect([b2.status, b2.json?.player]).toEqual([200, B.playerId]);
  });

  it("AFTER A's retry: B (a lone key) joins A through the account; A's DELETE then removes the link and both keys; B's next login is 410", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, aa02: S1, bb01: S1, bb02: S1 }) });
    const [K, B] = [await freshIdentity(), await freshIdentity()];
    expect((await failing(rig, "put", (k) => k === steamLink(S1), () => linkSteamCall(rig, K, "aa01", "bb-ghost", 480))).status).toBe(503);
    expect((await linkSteamCall(rig, K, "aa02", "bb-ghost", 480)).status, "the retry heals").toBe(200);
    const b = await linkSteamCall(rig, B, "bb01", "bb-ghost", 480);
    expect([b.status, b.json?.player], "B is a lone key: it joins the account's player").toEqual([200, K.playerId]);
    const rec = JSON.parse((await recordOf(rig, `players/${K.playerId}.json`)) ?? "{}");
    expect([rec.keys, rec.steam]).toEqual([[B.playerId], [S1]]);
    expect((await deleteMe(rig, K)).status).toBe(200);
    expect(await under(rig, "links/steam/")).toEqual([]);
    expect([...(await under(rig, "players/")), ...(await under(rig, "links/keys/"))]).toEqual([]);
    expect(await idsOf(rig, K.playerId)).toEqual([K.playerId, B.playerId].sort());
    const again = await linkSteamCall(rig, B, "bb02", "bb-ghost", 480);
    expect(again.status, again.text).toBe(410);
  });

  it("AFTER A's retry, B has devices of its own: B's login with the account is 409 and changes nothing", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, bb01: S1 }) });
    const [K, B, E] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    expect((await linkSteamCall(rig, K, "aa01", "bb-ghost", 480)).status).toBe(200);
    expect((await linkVia(rig, B, E)).joined.status).toBe(200);
    const before = await identityRecords(rig);
    const b = await linkSteamCall(rig, B, "bb01", "bb-ghost", 480);
    expect([b.status, b.json]).toEqual([409, ONE_PLAYER_ONLY]);
    expect(await identityRecords(rig), "no record changed").toEqual(before);
  });

  it("DURING A's DELETE, before it reads the link (A's link write had failed): B links the account on another machine; the DELETE reads B's link and leaves it", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1 }) });
    const sib = await openSibling(rig, { ...BASE, steam: fakeSteam({ bb01: S1, bb02: S1 }) });
    const [K, B] = [await freshIdentity(), await freshIdentity()];
    expect((await failing(rig, "put", (k) => k === steamLink(S1), () => linkSteamCall(rig, K, "aa01", "bb-ghost", 480))).status).toBe(503);
    const del = await hooked(rig, "get", (k) => k === steamLink(S1), async () => {
      const b = await linkSteamCall(sib, B, "bb01", "bb-ghost", 480);
      expect([b.status, b.json?.player]).toEqual([200, B.playerId]);
    }, () => deleteMe(rig, K));
    expect(del.status, del.text).toBe(200);
    expect(JSON.parse((await recordOf(rig, steamLink(S1))) ?? "{}").player, "B's link is there").toBe(B.playerId);
    const b2 = await linkSteamCall(sib, B, "bb02", "bb-ghost", 480);
    expect([b2.status, b2.json?.player]).toEqual([200, B.playerId]);
  });

  it("DURING A's DELETE, between its read of A's link and its delete (the window that is left, across machines): a machine that already knows A is gone gives the account to B; the DELETE then removes B's fresh link; B's record still lists it and B's next login heals it", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1 }) });
    const sib = await openSibling(rig, { ...BASE, steam: fakeSteam({ bb01: S1, bb02: S1 }) });
    const [K, B] = [await freshIdentity(), await freshIdentity()];
    expect((await linkSteamCall(rig, K, "aa01", "bb-ghost", 480)).status).toBe(200); // A's link names A
    expect((await requestCode(sib, B)).status, "the other machine loads its (empty) tombstone set").toBe(200);
    const del = await hooked(rig, "delete", (k) => k === steamLink(S1), async () => {
      rig.clock.now += 61_000; // the other machine's refresh time passes: it now knows A's tombstone (written before the removals)
      await sib.app.links.settleReload();
      const b = await linkSteamCall(sib, B, "bb01", "bb-ghost", 480);
      expect([b.status, b.json?.player], "A is gone there: the account is unknown, so it becomes B's").toEqual([200, B.playerId]);
    }, () => deleteMe(rig, K));
    expect(del.status, del.text).toBe(200);
    expect(await recordOf(rig, steamLink(S1)), "B's fresh link was removed by A's late delete").toBeUndefined();
    expect(JSON.parse((await recordOf(rig, `players/${B.playerId}.json`)) ?? "{}").steam, "B's record still lists the account").toEqual([S1]);
    const b2 = await linkSteamCall(sib, B, "bb02", "bb-ghost", 480);
    expect([b2.status, b2.json?.player], "B's next login finds its own listing and writes the link again").toEqual([200, B.playerId]);
    expect(JSON.parse((await recordOf(rig, steamLink(S1))) ?? "{}").player).toBe(B.playerId);
  });
});

// ============================================================================================================== 3. deletePlayer's check, link by link

describe.each(KINDS)("3. a DELETE removes a Steam link only when it names an id it tombstones: every kind of listed link, on %s", (kind) => {
  interface Ids {
    A: string;
    D: string;
    B: string;
    L: string;
  }
  interface Row {
    name: string;
    text: ((ids: Ids) => string) | null; // the link's text (null: no link)
    removed: boolean;
    logged: number; // "left an unreadable Steam link in place"
    w: "W" | "B" | "L"; // whose player a stranger's login with the account ends up in afterwards
    bRecord?: boolean; // B has a record that lists the account
  }
  const link = (player: string, at: unknown = 1, extra: Record<string, unknown> = {}): string => JSON.stringify({ player, at, ...extra });
  const rows: Row[] = [
    { name: "names the player", text: ({ A }) => link(A), removed: true, logged: 0, w: "W" },
    { name: "names a device of the player", text: ({ D }) => link(D), removed: true, logged: 0, w: "W" },
    { name: "names the player and has extra fields", text: ({ A }) => link(A, 1, { extra: true, note: "x" }), removed: true, logged: 0, w: "W" },
    { name: "names another player (whose record lists the account)", text: ({ B }) => link(B), removed: false, logged: 0, w: "B", bRecord: true },
    { name: "names a lone key (no record at all)", text: ({ L }) => link(L), removed: false, logged: 0, w: "L" },
    { name: "is missing", text: null, removed: false, logged: 0, w: "W" },
    { name: "is empty (0 bytes)", text: () => "", removed: false, logged: 1, w: "W" },
    { name: "is not JSON", text: () => "{this is not a link", removed: false, logged: 1, w: "W" },
    { name: "is JSON with no player field", text: () => JSON.stringify({ at: 1 }), removed: false, logged: 1, w: "W" },
    { name: "names an id of the wrong form (a space)", text: () => JSON.stringify({ player: "has a space", at: 1 }), removed: false, logged: 1, w: "W" },
    { name: "names the player but has no `at`", text: ({ A }) => JSON.stringify({ player: A }), removed: false, logged: 1, w: "W" },
    { name: "is a JSON array", text: () => "[]", removed: false, logged: 1, w: "W" },
    { name: "is the JSON null", text: () => "null", removed: false, logged: 1, w: "W" },
  ];

  async function world(row: Row) {
    const rig = await open(kind, { steam: fakeSteam({ ee01: S1, ee02: S1 }) });
    const [D, B, L, W] = [await freshIdentity(), await freshIdentity(), await freshIdentity(), await freshIdentity()];
    expect((await linkVia(rig, A, D)).joined.status).toBe(200);
    const store = rig.app.links.store;
    const rec = JSON.parse((await recordOf(rig, `players/${A.playerId}.json`)) ?? "{}");
    await store.put(`players/${A.playerId}.json`, JSON.stringify({ ...rec, steam: [S1] }));
    if (row.bRecord) await store.put(`players/${B.playerId}.json`, JSON.stringify({ keys: [], steam: [S1], at: rig.clock.now }));
    const text = row.text ? row.text({ A: A.playerId, D: D.playerId, B: B.playerId, L: L.playerId }) : null;
    if (text !== null) await store.put(steamLink(S1), text);
    await rig.restart({ ...BASE, steam: fakeSteam({ ee01: S1, ee02: S1 }) });
    return { rig, D, B, L, W, text };
  }

  it.each(rows.map((r) => [r.name, r] as const))("the link %s", async (_name, row) => {
    const { rig, D, B, L, W, text } = await world(row);
    expect((await deleteMe(rig, A)).status).toBe(200);
    const now = await recordOf(rig, steamLink(S1));
    if (row.removed || text === null) expect(now, "removed (or never there)").toBeUndefined();
    else expect(now, "left byte for byte").toBe(text);
    expect(count(rig.log, UNREADABLE_LINE), "the log line").toBe(row.logged);
    const everything = rig.log.join("\n");
    for (const secret of [A.playerId, D.playerId, B.playerId, L.playerId, W.playerId, S1]) expect(everything, "no id in the log").not.toContain(secret);
    expect([...(await under(rig, "players/")), ...(await under(rig, "links/keys/")), ...(await under(rig, "linkcodes/"))].filter((k) => !k.includes(B.playerId)), "nothing else of A is left").toEqual([]);
    expect(await idsOf(rig, A.playerId)).toEqual([A.playerId, D.playerId].sort());
    // the readers afterwards: the deleted player's routes are 410, and the next Steam login treats the link as what it is
    expect((await readProfile(rig, A)).status).toBe(410);
    expect((await putWire(rig, earnedWire({ runs: 1 }), D)).status).toBe(410);
    const w = await linkSteamCall(rig, W, "ee01", "bb-ghost", 480);
    const who = row.w === "W" ? W.playerId : row.w === "B" ? B.playerId : L.playerId;
    expect([w.status, w.json?.player], `a stranger's login with the account: ${w.text}`).toEqual([200, who]);
    if (row.w === "W") expect(JSON.parse((await recordOf(rig, steamLink(S1))) ?? "{}").player, "and the link is W's (an unreadable one was overwritten)").toBe(W.playerId);
    expect((await readProfile(rig, W)).status, "W's own profile read works").toBe(200);
  });

  it("a link that names an id from the PRIOR tombstone only (not in the record's keys): removed, because the repeat DELETE tombstones the prior ids too", async () => {
    const rig = await open(kind);
    const [D, Q] = [await freshIdentity(), await freshIdentity()];
    expect((await linkVia(rig, A, D)).joined.status).toBe(200);
    const store = rig.app.links.store;
    await store.put(`tombstones/${A.playerId}.json`, JSON.stringify({ at: 5, ids: [A.playerId, D.playerId, Q.playerId] })); // an earlier DELETE wrote it
    const rec = JSON.parse((await recordOf(rig, `players/${A.playerId}.json`)) ?? "{}");
    await store.put(`players/${A.playerId}.json`, JSON.stringify({ ...rec, steam: [S1] })); // the player is back (a machine linked on)
    await store.put(steamLink(S1), JSON.stringify({ player: Q.playerId, at: 1 }));
    await rig.restart();
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(await recordOf(rig, steamLink(S1)), "Q is in the prior tombstone's ids: the link goes").toBeUndefined();
    expect(JSON.parse((await recordOf(rig, `tombstones/${A.playerId}.json`)) ?? "{}").at, "the earlier `at` is kept").toBe(5);
  });
});

// ============================================================================================================== 4. two DELETEs at once, a failing delete, the cost

describe.each(KINDS)("4. concurrent and failing DELETEs, on %s", (kind) => {
  async function world() {
    const rig = await open(kind, { steam: fakeSteam({ ee01: S3 }) });
    const [D, B] = [await freshIdentity(), await freshIdentity()];
    expect((await linkVia(rig, A, D)).joined.status).toBe(200);
    const store = rig.app.links.store;
    const rec = JSON.parse((await recordOf(rig, `players/${A.playerId}.json`)) ?? "{}");
    await store.put(`players/${A.playerId}.json`, JSON.stringify({ ...rec, steam: [S1, S2, S3, S4, S5] }));
    await store.put(steamLink(S1), JSON.stringify({ player: A.playerId, at: 1 }));
    await store.put(steamLink(S2), JSON.stringify({ player: D.playerId, at: 1 }));
    await store.put(steamLink(S3), JSON.stringify({ player: B.playerId, at: 1 }));
    await store.put(steamLink(S4), "{not a link");
    await rig.restart();
    return { rig, D, B };
  }
  const settled = async (rig: Rig, B: Identity) => {
    expect(await under(rig, "links/steam/"), "S1 and S2 went; B's link and the unreadable one stayed").toEqual([steamLink(S3), steamLink(S4)]);
    expect([...(await under(rig, "players/")), ...(await under(rig, "links/keys/")), ...(await under(rig, "linkcodes/"))]).toEqual([]);
    expect(JSON.parse((await recordOf(rig, steamLink(S3))) ?? "{}").player).toBe(B.playerId);
  };

  it("three DELETEs at once on one machine (from the first key twice and from the device): all 200, the same end state as one, the unreadable link logged once", async () => {
    const { rig, D, B } = await world();
    const rs = await Promise.all([deleteMe(rig, A), deleteMe(rig, A), deleteMe(rig, D)]);
    expect(rs.map((r) => r.status), rs.map((r) => r.text).join(" ")).toEqual([200, 200, 200]);
    await settled(rig, B);
    expect(count(rig.log, UNREADABLE_LINE)).toBe(1);
    expect(await idsOf(rig, A.playerId)).toEqual([A.playerId, D.playerId].sort());
  });

  it("two DELETEs at once on two machines over one store: both 200, no 5xx, the same end state", async () => {
    const { rig, D, B } = await world();
    const sib = await openSibling(rig, { ...BASE });
    const rs = await Promise.all([deleteMe(rig, A), deleteMe(sib, D)]);
    expect(rs.map((r) => r.status), rs.map((r) => r.text).join(" ")).toEqual([200, 200]);
    await settled(rig, B);
    expect(count(rig.log, UNREADABLE_LINE) + count(sib.log, UNREADABLE_LINE), "each machine that saw the unreadable link logged it once").toBeGreaterThanOrEqual(1);
  });

  it("the delete of a link fails (503): the tombstone stands, the player's record is what is left, and the repeat from the first key finishes the job", async () => {
    const { rig, B } = await world();
    const cut = await failing(rig, "delete", (k) => k === steamLink(S2), () => deleteMe(rig, A));
    expect(cut.status, cut.text).toBe(503);
    expect(Object.keys(await identityRecords(rig))).toContain(`tombstones/${A.playerId}.json`);
    expect(await under(rig, "players/"), "the player's record goes late: a repeat still finds the accounts").toEqual([`players/${A.playerId}.json`]);
    expect(await under(rig, "links/steam/"), "S1 went before the failing delete; the rest are there").toEqual([steamLink(S2), steamLink(S3), steamLink(S4)]);
    expect((await deleteMe(rig, A)).status).toBe(200);
    await settled(rig, B);
  });

  it("NOTE (not FIX2's: the old code had it too): after a DELETE that failed part way, a repeat from a DEVICE whose link was already dropped is a 200 that finishes nothing (it is a lone key now); the first key finishes it", async () => {
    const { rig, D, B } = await world();
    const cut = await failing(rig, "delete", (k) => k === steamLink(S2), () => deleteMe(rig, A));
    expect(cut.status).toBe(503);
    expect(await recordOf(rig, `links/keys/${D.playerId}.json`), "D's link was dropped before the failing delete").toBeUndefined();
    expect((await deleteMe(rig, D)).status, "D asks again").toBe(200);
    expect(await under(rig, "players/"), "A's record is still there: nothing was finished").toEqual([`players/${A.playerId}.json`]);
    expect(await under(rig, "links/steam/")).toEqual([steamLink(S2), steamLink(S3), steamLink(S4)]);
    expect((await deleteMe(rig, A)).status).toBe(200);
    await settled(rig, B);
  });

  it("a repeat DELETE from the first key after the record is gone does not look for Steam links any more, and is a plain 200 that changes nothing", async () => {
    const { rig, B } = await world();
    expect((await deleteMe(rig, A)).status).toBe(200);
    const before = await identityRecords(rig);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(await identityRecords(rig), "nothing changed").toEqual(before);
    await settled(rig, B);
  });
});

describe("4b. the cost of a full player's DELETE (Tigris, counted at the fake S3)", () => {
  it("64 linked keys and 64 Steam accounts: the requests of one DELETE from the first key, by operation", async () => {
    const rig = await open("tigris");
    const store = rig.app.links.store;
    const keys = Array.from({ length: 64 }, (_, i) => `dev${String(i).padStart(3, "0")}${"x".repeat(30)}`);
    const accounts = Array.from({ length: 64 }, (_, i) => S(200 + i));
    await store.put(`players/${A.playerId}.json`, JSON.stringify({ keys, steam: accounts, at: rig.clock.now }));
    for (const k of keys) await store.put(`links/keys/${k}.json`, JSON.stringify({ player: A.playerId, at: rig.clock.now }));
    for (const s of accounts) await store.put(steamLink(s), JSON.stringify({ player: A.playerId, at: rig.clock.now }));
    await rig.restart();
    await rig.app.links.settleReload(); // the first load, so that the DELETE itself does not pay for it
    const fake = theFake();
    const from = fake.requests.length;
    expect((await deleteMe(rig, A)).status).toBe(200);
    const mine = fake.requests.slice(from).filter((r) => r.bucket === rig.bucket);
    const ops: Record<string, number> = {};
    for (const r of mine) ops[r.op] = (ops[r.op] ?? 0) + 1;
    console.log(`VIDENT2 a full player's DELETE (64 keys, 64 Steam accounts), requests at the Tigris fake: ${JSON.stringify(ops)} = ${mine.length}`);
    expect(await under(rig, "links/steam/")).toEqual([]);
    expect(await under(rig, "links/keys/")).toEqual([]);
    // IDENT-2: the DELETE also removes history/<id>/ for the player and each of its 64 keys: one LIST for each of the 65 ids, and a DELETE
    // for each entry (none here). So FIX2's 329 plus 65 LISTs; the bounds moved with it (they were 320 to 340)
    expect(mine.length, "FIX2-REPORT says 329 (it was 201); IDENT-2 adds the 65 LISTs of history/<id>/").toBeGreaterThanOrEqual(385);
    expect(mine.length).toBeLessThanOrEqual(405);
  });
});
