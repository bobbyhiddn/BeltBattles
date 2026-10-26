// VERIFY-IDENT1-FIX1 (REQ-BFG-122) step 4e, written by the independent re-checker (cap_xi): THE OPEN NOTES, REPRODUCED. FIX-REPORT section 7 left N1 to N5
// open, and run 3 left F4 and F5. These tests do not state a wish: they PIN WHAT THE PRODUCT DOES TODAY, so that each rating in the report rests on
// a run, and so that the day one of them is fixed the matching test fails and says so (then rewrite it to the fixed outcome).
// IDENT-1 FIX2 fixed N1 and F4, so those two tests were rewritten to the fixed outcome (each says what it was); N4 and F5 still pin today.
//   N1  the Steam write order: linkSteam writes the player's record first and the Steam link second (it was the other way round)
//   N4  SHOW MY CODE on a full player still makes a code
//   F4  any key can still make a tombstone, and a request that arrives when the set is stale waits at most 250 ms for the reload (it waited for the whole one)
//   F5  a typed ß reads as SS (and ligatures as their letters): other spellings of the same code, never a different code
// Both backing stores (JSON lines, and Tigris on the fake S3) where the store matters.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import { CODE_TTL_MS, MAX_LINKED, TOMBSTONE_FULL_READ_MS, hashCode, normalizeCode } from "../server/links";
import type { LinkStore } from "../server/linkStore";
import { StorageError } from "../server/store";
import { testIdentity } from "./netIdentity";
import {
  closeRigs, deleteMe, fakeSteam, freshIdentity, identityRecords, linkSteamCall, matchAs, openRig, postGhost, redeemCode, requestCode, theFake,
  uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity, B: Identity;
beforeAll(async () => {
  [A, B] = await Promise.all([0, 1].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const NOLIMIT = { windowMs: 600_000, max: 1_000_000 };
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT, ...over });
const codeOf = (r: Reply): string => String(r.json?.code);
const FULL_KEYS = { error: "this player already has the most linked devices it can have" };
const under = async (rig: Rig, prefix: string) => Object.keys(await identityRecords(rig)).filter((k) => k.startsWith(prefix)).sort();
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const S1 = "76561198000000021";
const ids = (n: number, tag = "k"): string[] => Array.from({ length: n }, (_, i) => `${tag}${String(i).padStart(4, "0")}${"x".repeat(30)}`);

describe.each(KINDS)("N1: the Steam write order, on %s", (kind) => {
  // IDENT-1 FIX2 rewrote this test to the fixed outcome. It was: "a store failure between linkSteam's two writes: the retry answers 200 and never
  // repairs the record; the key can then join another player; the account is then refused to everybody; a DELETE leaves its link record behind".
  it("a store failure between linkSteam's two writes (the record first, the link second): the key cannot join another player, the retry REPAIRS the link, the account is refused to nobody, and a DELETE leaves no link record behind", async () => {
    const steam = fakeSteam({ aa01: S1, aa02: S1, aa03: S1, aa04: S1, aa05: S1, aa06: S1 });
    const rig = await open(kind, { steam });
    const [K, Z, W] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    // 1. fail the write of links/steam/<S1>.json: it is the SECOND write of linkSteam's unknown-account path (the player's record goes first)
    const store = rig.app.links.store as { put: LinkStore["put"] };
    const real = store.put.bind(store);
    store.put = async (k: string, t: string) => {
      if (k === `links/steam/${S1}.json`) throw new StorageError("identity write failed: HTTP 500");
      return real(k, t);
    };
    const first = await (async (): Promise<Reply> => {
      try {
        return await linkSteamCall(rig, K, "aa01", "bb-ghost", 480);
      } finally {
        store.put = real;
      }
    })();
    expect(first.status, first.text).toBe(503);
    expect(await under(rig, "players/"), "the first write stood: the record lists the account").toEqual([`players/${K.playerId}.json`]);
    expect(JSON.parse((await identityRecords(rig))[`players/${K.playerId}.json`]).steam).toEqual([S1]);
    expect(await under(rig, "links/steam/"), "the second did not").toEqual([]);
    expect((await linkSteamCall(rig, Z, "aa01", "bb-ghost", 480)).json, "(the ticket of the failed try stays spent, as before the fix)").toEqual({ error: "that Steam ticket was used already" });
    // 2. so the key's own record DOES stop it joining another player (the 409 rule reads that record)
    const joined = await redeemCode(rig, K, codeOf(await requestCode(rig, A)));
    expect([joined.status, joined.json], joined.text).toEqual([409, { error: "this device already has linked devices or a Steam account" }]);
    // 3. the retry with a fresh ticket repairs the link
    const retry = await linkSteamCall(rig, K, "aa02", "bb-ghost", 480);
    expect([retry.status, retry.json?.player], retry.text).toEqual([200, K.playerId]);
    expect(await under(rig, "links/steam/"), "REPAIRED: the link is there").toEqual([`links/steam/${S1}.json`]);
    // 4. nothing refuses the account (the F1 Steam guard has no device to find): K's own login is a plain 200, and a stranger's login joins K's player
    for (const [who, id, ticket] of [["the key itself", K, "aa03"], ["a stranger", Z, "aa04"]] as const) {
      const r = await linkSteamCall(rig, id, ticket, "bb-ghost", 480);
      expect([r.status, r.json?.player], who).toEqual([200, K.playerId]);
    }
    // 5. a DELETE of the player removes the link: its record lists it, and it names the player
    expect((await deleteMe(rig, K)).status).toBe(200);
    expect(await under(rig, "links/steam/"), "no Steam link (a Steam id and a key id) survives the deletion").toEqual([]);
    // and the account is free: its next owner is a new player
    const again = await linkSteamCall(rig, W, "aa05", "bb-ghost", 480);
    expect([again.status, again.json?.player]).toEqual([200, W.playerId]);
  });
});

describe.each(KINDS)("N4: SHOW MY CODE on a full player, on %s", (kind) => {
  it("the code is made (200) and shown; the entering device gets the 409 and the code stays live; a device the player has already is told nothing either", async () => {
    const rig = await open(kind);
    const dev = await freshIdentity();
    const keys = [...ids(MAX_LINKED - 1), dev.playerId];
    const s = rig.app.links.store;
    await s.put(`players/${A.playerId}.json`, JSON.stringify({ keys, steam: [], at: rig.clock.now }));
    for (const k of keys) await s.put(`links/keys/${k}.json`, JSON.stringify({ player: A.playerId, at: rig.clock.now }));
    await rig.restart();
    const shown = await requestCode(rig, A);
    expect([shown.status, typeof shown.json?.code], "the full player's first key is shown a code").toEqual([200, "string"]);
    const fromDevice = await requestCode(rig, dev);
    expect(fromDevice.status, "so is a device of it").toBe(200);
    const entering = await freshIdentity();
    const r = await redeemCode(rig, entering, codeOf(fromDevice));
    expect([r.status, r.json], "the 409 comes only now, on the entering device").toEqual([409, FULL_KEYS]);
    const live = Object.keys(await identityRecords(rig)).filter((k) => k.startsWith("linkcodes/"));
    expect(live, "and the code is still live (unspent)").toHaveLength(1);
  });
});

describe("F4: tombstones", () => {
  // (IDENT-1 FIX2: kept as it was; only the title and the log line changed. A refresh no longer reads them all again: it reads what is new, and the
  // first load and the 6-hourly full read read every one, 8 at a time. tests/ident1.tombstones.test.ts counts the refreshes.)
  it.each(KINDS)("any signing key can make a tombstone with one DELETE, however little it has: 25 fresh keys, 25 tombstones, and the first load reads each one (%s)", async (kind) => {
    const rig = await open(kind);
    const keys = await Promise.all(Array.from({ length: 25 }, () => freshIdentity()));
    for (const k of keys) expect((await deleteMe(rig, k)).status).toBe(200);
    expect(await under(rig, "tombstones/"), "a key that never uploaded, linked or stored anything still writes one").toHaveLength(25);
    expect(await under(rig, "players/")).toEqual([]);
    expect(await under(rig, "links/keys/")).toEqual([]);
    if (kind === "tigris") {
      await rig.restart();
      const fake = theFake();
      const from = fake.requests.length;
      await rig.app.links.ensureFresh();
      const mine = fake.requests.slice(from).filter((r) => r.bucket === rig.bucket);
      const lists = mine.filter((r) => r.op === "LIST" && r.key === "tombstones/").length;
      const heads = mine.filter((r) => r.op === "HEAD" && r.key.startsWith("tombstones/")).length;
      const gets = mine.filter((r) => r.op === "GET" && r.key.startsWith("tombstones/")).length;
      console.log(`VIDENT1FIX F4 on tigris: the first load with ${keys.length} tombstones = ${lists} LIST + ${heads} HEAD + ${gets} GET = ${mine.length} requests (8 reads at a time)`);
      expect([lists, heads, gets], "one LIST, then a HEAD and a GET for every tombstone").toEqual([1, 25, 25]);
    }
  });

  // IDENT-1 FIX2 rewrote this test to the fixed outcome. It was: "a request that arrives when the tombstone set is stale waits for the WHOLE reload: a
  // match, an upload and a code request are all held behind the first read, and go on when the reload ends". The reload here is the 6-hourly full read
  // (a refresh reads only what is new), so it still has all 30 tombstones to read, with the first read hanging.
  it("a request that arrives when the tombstone set is stale waits at most 250 ms for the reload: a match, an upload and a code request are answered while the first read hangs, with the set they hold; the reload ends when it is released", async () => {
    const rig = await open("jsonl");
    const dev = await freshIdentity();
    for (const k of await Promise.all(Array.from({ length: 30 }, () => freshIdentity()))) expect((await deleteMe(rig, k)).status).toBe(200);
    await rig.restart();
    await rig.app.links.ensureFresh(); // the first load
    rig.clock.now += TOMBSTONE_FULL_READ_MS; // 6 hours on: the set is stale, and the next reload is a full read
    const store = rig.app.links.store as { get: LinkStore["get"] };
    const real = store.get.bind(store);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let reads = 0;
    store.get = async (k: string) => {
      if (k.startsWith("tombstones/")) {
        reads++;
        if (reads === 1) await gate; // the first tombstone read hangs (a slow store); the others go on beside it (8 in flight at most)
      }
      return real(k);
    };
    const done = [false, false, false];
    try {
      const ps = [
        matchAs(rig, B.playerId),
        postGhost(rig, dev, uploadFor(dev, dev.playerId, { runId: "held" })),
        requestCode(rig, dev),
      ].map((p, i) => p.then((r) => ((done[i] = true), r)));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const rs = await Promise.race([Promise.all(ps), new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), 10_000)))]);
      clearTimeout(timer);
      expect(done, "all three were answered while the first read still hangs").toEqual([true, true, true]);
      if (!rs) return;
      expect([200, 404], "the match").toContain(rs[0].status);
      expect(rs.slice(1).map((r) => r.status), "the upload and the code request").toEqual([201, 200]);
      expect(reads, "the other reads were not held up by the stuck one: all 30 were started").toBe(30);
    } finally {
      release();
    }
    await rig.app.links.settleReload();
    store.get = real;
    expect(reads, "released, the reload ended; it read each tombstone once").toBe(30);
  });
});

describe.each(KINDS)("F5: the stray tombstone of a repeat DELETE, on %s", (kind) => {
  it("a device whose link is gone (its player was deleted) that DELETEs again writes a tombstone for its own id: one extra file, nothing else", async () => {
    const rig = await open(kind);
    const D = await freshIdentity();
    expect((await redeemCode(rig, D, codeOf(await requestCode(rig, A)))).status).toBe(200);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(await under(rig, "tombstones/")).toEqual([`tombstones/${A.playerId}.json`]);
    expect((await deleteMe(rig, D)).status, "D's link is gone, so it resolves to itself").toBe(200);
    expect(await under(rig, "tombstones/"), "one stray tombstone, for D's own id").toEqual([`tombstones/${A.playerId}.json`, `tombstones/${D.playerId}.json`].sort());
    expect(JSON.parse((await identityRecords(rig))[`tombstones/${D.playerId}.json`]).ids).toEqual([D.playerId]);
    expect(Object.keys(await identityRecords(rig)).filter((k) => !k.startsWith("tombstones/")), "and no other record").toEqual([]);
  });
});

describe("F5: other spellings of a code", () => {
  it("a typed ß is read as SS and the ligatures ﬀ ﬅ ﬆ as FF ST ST; every other special case stays invalid; no spelling reaches a code the plain letters could not", async () => {
    expect(normalizeCode("ABCD-EFß")).toBe("ABCDEFSS");
    expect(normalizeCode("ABCDﬀGH")).toBe("ABCDFFGH");
    expect(normalizeCode("ABCDEFﬆ")).toBe("ABCDEFST");
    expect(normalizeCode("ABCDEFﬅ")).toBe("ABCDEFST");
    for (const s of ["ABCDEFGı", "ABCDEFGİ", "ABCDEFǰ", "ABCDEFŉ", "ABCDEFﬁ", "ABCDEFﬂ", "ABCDEFﬃ", "ABCDEFẞ", "ＡＢＣＤＥＦＧＨ", "ABCD-EFG0", "ABCD-EFGO", "ABCD-EFGI", "ABCD-EFGL"]) {
      expect(normalizeCode(s), JSON.stringify(s)).toBeNull();
    }
    // through the route: the code is live under its plain letters and redeemed through the ß
    const rig = await open("jsonl");
    await rig.app.links.store.put(`linkcodes/${hashCode("ABCDEFSS")}.json`, JSON.stringify({ player: A.playerId, expiresAt: rig.clock.now + CODE_TTL_MS }));
    const r = await redeemCode(rig, B, "abcd-efß");
    expect([r.status, r.json?.player], r.text).toEqual([200, A.playerId]);
  });
});
