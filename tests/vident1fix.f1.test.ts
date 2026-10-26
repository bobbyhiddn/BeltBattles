// VERIFY-IDENT1-FIX1 (REQ-BFG-122) step 4a, written by the independent re-checker (cap_xi): ATTACKS ON THE F1 FIX. A stale link code made a device
// of a "player" that is itself a device. The fix: `join` deletes the joining key's own live code (before the link) and its own players/<key>.json
// (after it); `redeem` and `linkSteam` answer 403 for a code, or a Steam account, whose player has a links/keys/ record.
// Here: damage made BY HAND (no path makes it any more) asked by every kind of asker, in every spelling, expired, of a gone player; the Steam
// version with the ticket accounting; a lone key with everything joining by code and by Steam; the order of the writes inside `join`; and the
// inert players/<key>.json that a failed removal leaves, read by every reader. Both backing stores (JSON lines, and Tigris on the fake S3).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import { mergeWire, type WireProfile } from "../src/net/profileWire";
import { runAdmin } from "../server/ghostAdmin";
import { CODE_TTL_MS, hashCode, normalizeCode } from "../server/links";
import type { LinkStore } from "../server/linkStore";
import { StorageError } from "../server/store";
import { testIdentity } from "./netIdentity";
import { FAKE_CREDS } from "./netStores";
import { earnedWire } from "./profileupWire";
import {
  closeRigs, deleteMe, fakeSteam, freshIdentity, ghostCount, identityRecords, linkSteamCall, linkVia, matchAs, openRig, postGhost, profileStored, putWire,
  readProfile, redeemCode, requestCode, theFake, uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity;
beforeAll(async () => {
  A = await testIdentity(0);
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const NOLIMIT = { windowMs: 600_000, max: 1_000_000 };
/** A rig whose global limiter stays out of the way; the redeem limit is the production one (5 wrong codes in 10 minutes) unless given. */
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, ...over });
const REFUSED = { error: "that code did not work" };
const NO_STEAM = { error: "that Steam account could not be linked" };
const USED = { error: "that Steam ticket was used already" };
const codeOf = (r: Reply): string => String(r.json?.code);
const under = async (rig: Rig, prefix: string) => Object.keys(await identityRecords(rig)).filter((k) => k.startsWith(prefix)).sort();
const S1 = "76561198000000011", S2 = "76561198000000012";

/** `ghost-admin <args>` against the rig's own storage (the directory, or the fake S3's bucket), as vident1.delete runs it. */
async function ghostAdmin(rig: Rig, args: string[]): Promise<{ code: number; out: string[] }> {
  const env: Record<string, string> = rig.kind === "tigris"
    ? {
        BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
        AWS_ENDPOINT_URL_S3: theFake().endpoint, BUCKET_NAME: rig.bucket, BB_GHOST_S3_ADDRESSING: "path",
      }
    : { BB_GHOST_STORE: "jsonl" };
  const out: string[] = [];
  const code = await runAdmin([...args, ...(rig.kind === "tigris" ? [] : ["--data", rig.dir])], env, (l) => out.push(l));
  return { code, out };
}

/** `typed` as a live code of `player`, written into the store by hand (damaged data: no path makes a code like it any more). */
async function handmade(rig: Rig, player: string, typed: string, expiresAt = rig.clock.now + CODE_TTL_MS): Promise<string> {
  const key = `linkcodes/${hashCode(normalizeCode(typed)!)}.json`;
  await rig.app.links.store.put(key, JSON.stringify({ player, expiresAt }));
  return key;
}

describe.each(KINDS)("F1: a hand-made code whose player is a device, on %s", (kind) => {
  it("every kind of asker gets the one plain 403 (a stranger, the device itself, its player, a sibling device, a lone key with a profile); not one record changes, the code's included", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const [X, Y, Z, W] = [await freshIdentity(), await freshIdentity(), await freshIdentity(), await freshIdentity()];
    expect((await linkVia(rig, A, X)).joined.status).toBe(200);
    expect((await linkVia(rig, A, Y)).joined.status).toBe(200);
    expect((await putWire(rig, earnedWire({ runs: 3 }), W)).status).toBe(200);
    const key = await handmade(rig, X.playerId, "ABCD-EFGH");
    const before = await identityRecords(rig);
    expect(Object.keys(before), "the hand-made code is in the store").toContain(key);
    const askers: [string, Identity][] = [["a stranger", Z], ["the device itself", X], ["its player", A], ["a sibling device", Y], ["a lone key with a profile", W]];
    for (const [who, asker] of askers) {
      const r = await redeemCode(rig, asker, "ABCD-EFGH");
      expect(r.status, `${who}: ${r.text}`).toBe(403);
      expect(r.json, who).toEqual(REFUSED);
    }
    expect(await identityRecords(rig), "not one record changed, the code's record included").toEqual(before);
    expect(profileStored(rig, W.playerId), "W's profile is where it was").toBe(true);
    expect(await under(rig, "links/keys/"), "nobody was linked to X").toEqual([X, Y].map((k) => `links/keys/${k.playerId}.json`).sort());
    for (const k of [Z, W]) expect((await postGhost(rig, k, uploadFor(k, X.playerId, { runId: `f-${k.playerId.slice(0, 4)}` }))).status, "nobody is a device of X").toBe(403);
    expect((await postGhost(rig, X, uploadFor(X, A.playerId, { runId: "x-1" }))).status, "X is still A's device").toBe(201);
  });

  it("every spelling of the code that the normalizer accepts is refused the same way; spellings it does not accept are refused too; the record is untouched by all", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    expect((await linkVia(rig, A, X)).joined.status).toBe(200);
    await handmade(rig, X.playerId, "ABCD-EFGH");
    const before = await identityRecords(rig);
    const spellings = ["ABCD-EFGH", "abcd-efgh", "abcdefgh", "ABCD EFGH", "  abcd\tefgh\n", "a-b-c-d-e-f-g-h", "ABCD--EFGH", "ABCD EFGH", "ABCD-EFGH-", "ABCD-EFG", "ABCD-EFGHJ", "ABCD-EFGI", "ABCD-EFG0", ""];
    for (const s of spellings) {
      const r = await redeemCode(rig, Z, s);
      expect(r.status, JSON.stringify(s) + ": " + r.text).toBe(403);
      expect(r.json, JSON.stringify(s)).toEqual(REFUSED);
    }
    expect(await identityRecords(rig)).toEqual(before);
    expect(await under(rig, "links/keys/")).toEqual([`links/keys/${X.playerId}.json`]);
  });

  it("each such try counts against the address like any refused code: five of them and the sixth try is 429 with a retry-after (the production limit), and the record is still untouched", async () => {
    const rig = await open(kind); // production limit
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    expect((await linkVia(rig, A, X)).joined.status).toBe(200);
    await handmade(rig, X.playerId, "ABCD-EFGH");
    const before = await identityRecords(rig);
    for (const [i, s] of ["ABCD-EFGH", "abcdefgh", "ABCD EFGH", "a-b-c-d-e-f-g-h", "ABCDEFGH"].entries()) {
      expect((await redeemCode(rig, Z, s)).status, `try ${i + 1}`).toBe(403);
    }
    const sixth = await redeemCode(rig, Z, "ABCD-EFGH");
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("retry-after")).toBe("600");
    expect(await identityRecords(rig)).toEqual(before);
  });

  it("an expired hand-made code is the plain 403 and is dropped when met, as any expired code is (this is the one record the refusal removes); a code of a gone player is the same 403 and its record stays", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const [X, Y, Z] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    expect((await linkVia(rig, A, X)).joined.status).toBe(200);
    expect((await linkVia(rig, A, Y)).joined.status).toBe(200);
    // expired: at expiresAt exactly, and a day past it; asked by a stranger and by the device itself
    for (const [offset, asker] of [[0, Z], [86_400_000, X]] as const) {
      const key = await handmade(rig, X.playerId, "ABCD-EFGH", rig.clock.now - offset);
      const before = await identityRecords(rig);
      const r = await redeemCode(rig, asker, "ABCD-EFGH");
      expect(r.status, r.text).toBe(403);
      expect(r.json).toEqual(REFUSED);
      const after = await identityRecords(rig);
      expect(Object.keys(after), "the expired code is dropped when it is met").not.toContain(key);
      const kept = { ...before };
      delete kept[key];
      expect(after, "and nothing else changed").toEqual(kept);
    }
    // a gone player: A deletes (the tombstone names A, X and Y); a code naming X, and one naming A itself, are refused and left alone
    expect((await deleteMe(rig, A)).status).toBe(200);
    for (const gone of [X, A, Y]) {
      const key = await handmade(rig, gone.playerId, "ABCD-EFGH");
      const before = await identityRecords(rig);
      const r = await redeemCode(rig, Z, "ABCD-EFGH");
      expect(r.status, r.text).toBe(403);
      expect(r.json).toEqual(REFUSED);
      expect(await identityRecords(rig), "the record of a code of a gone player is untouched").toEqual(before);
      expect(Object.keys(before)).toContain(key);
    }
  });

  it("decision 2: a deleted key hears 410 first, before the guard (a device's stale code or a healthy code alike); a living key hears the guard's 403", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const [X, G, Z] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    expect((await linkVia(rig, A, X)).joined.status).toBe(200);
    await handmade(rig, X.playerId, "ABCD-EFGH");
    expect((await deleteMe(rig, G)).status, "G deletes itself").toBe(200);
    const stale = await redeemCode(rig, G, "ABCD-EFGH");
    expect(stale.status, stale.text).toBe(410);
    expect(stale.json).toEqual({ error: "this key was deleted" });
    const healthy = await redeemCode(rig, G, codeOf(await requestCode(rig, A)));
    expect(healthy.status, healthy.text).toBe(410);
    const living = await redeemCode(rig, Z, "ABCD-EFGH");
    expect(living.status).toBe(403);
    expect(living.json).toEqual(REFUSED);
    // 410 is not a wrong code: it does not count
    const limited = await open(kind);
    const [X2, G2] = [await freshIdentity(), await freshIdentity()];
    expect((await linkVia(limited, A, X2)).joined.status).toBe(200);
    await handmade(limited, X2.playerId, "ABCD-EFGH");
    expect((await deleteMe(limited, G2)).status).toBe(200);
    for (let i = 0; i < 8; i++) expect((await redeemCode(limited, G2, "ABCD-EFGH")).status, `410 number ${i + 1}`).toBe(410);
  });
});

describe.each(KINDS)("F1: a Steam account whose player is a device, on %s", (kind) => {
  async function damagedSteam(rig: Rig, X: Identity): Promise<void> {
    await rig.app.links.store.put(`links/steam/${S1}.json`, JSON.stringify({ player: X.playerId, at: rig.clock.now }));
  }

  it("403 'that Steam account could not be linked' to a stranger, the device itself, its player and a sibling; nothing changes; every ticket is given back", async () => {
    const steam = fakeSteam({ aa01: S1 });
    const rig = await open(kind, { steam, redeemLimit: NOLIMIT });
    const [X, Y, Z] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    expect((await linkVia(rig, A, X)).joined.status).toBe(200);
    expect((await linkVia(rig, A, Y)).joined.status).toBe(200);
    await damagedSteam(rig, X);
    const before = await identityRecords(rig);
    const askers: [string, Identity][] = [["a stranger", Z], ["the device itself", X], ["its player", A], ["a sibling device", Y]];
    for (const [i, [who, asker]] of askers.entries()) {
      const r = await linkSteamCall(rig, asker, "aa01", "bb-ghost", 480); // the SAME ticket every time: if it were spent the second try would be 'used already'
      expect(r.status, `${who}: ${r.text}`).toBe(403);
      expect(r.json, who).toEqual(NO_STEAM);
      expect(steam.calls.length, `Steam was asked again each time (${i + 1})`).toBe(i + 1);
    }
    expect(await identityRecords(rig), "nothing changed, nothing followed").toEqual(before);
    expect(await under(rig, "links/keys/")).toEqual([X, Y].map((k) => `links/keys/${k.playerId}.json`).sort());
  });

  it("a cached 'not linked' does not fool the Steam guard: X is warmed as a lone key, then linked behind the cache's back", async () => {
    const steam = fakeSteam({ aa01: S1, aa02: S1 });
    const rig = await open(kind, { steam, redeemLimit: NOLIMIT });
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    expect((await linkSteamCall(rig, X, "aa01", "bb-ghost", 480)).status, "S1 is X's: X is a lone player with a Steam account").toBe(200);
    expect(await rig.app.links.keyLink(X.playerId), "warm the cache: X is not linked").toBeNull();
    await rig.app.links.store.put(`links/keys/${X.playerId}.json`, JSON.stringify({ player: A.playerId, at: rig.clock.now }));
    await rig.app.links.store.put(`players/${A.playerId}.json`, JSON.stringify({ keys: [X.playerId], steam: [], at: rig.clock.now }));
    const before = await identityRecords(rig);
    const r = await linkSteamCall(rig, Z, "aa02", "bb-ghost", 480);
    expect(r.status, r.text).toBe(403);
    expect(r.json).toEqual(NO_STEAM);
    expect(await identityRecords(rig)).toEqual(before);
  });

  it("the ticket is given back for that 403 only: it stays spent after a 200, a 409 and a 410, and after 'used already'", async () => {
    const steam = fakeSteam({ aa01: S1, aa02: S1, aa03: S2, aa04: S2, aa05: S2, aa06: S1 });
    const rig = await open(kind, { steam, redeemLimit: NOLIMIT });
    const [K, G, Z] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    // a 200 spends it
    expect((await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).status).toBe(200); // S1 is A's
    const again = await linkSteamCall(rig, Z, "aa01", "bb-ghost", 480);
    expect([again.status, again.json]).toEqual([403, USED]);
    const third = await linkSteamCall(rig, Z, "aa01", "bb-ghost", 480);
    expect([third.status, third.json], "'used already' does not give the ticket back").toEqual([403, USED]);
    // a 409 spends it: K holds a Steam account of its own (S2), so joining A through S1 is the 409 rule
    expect((await linkSteamCall(rig, K, "aa03", "bb-ghost", 480)).status).toBe(200);
    const nine = await linkSteamCall(rig, K, "aa02", "bb-ghost", 480);
    expect(nine.status, nine.text).toBe(409);
    const nineAgain = await linkSteamCall(rig, K, "aa02", "bb-ghost", 480);
    expect([nineAgain.status, nineAgain.json], "a 409 keeps the ticket spent, as before").toEqual([403, USED]);
    // a 410 spends it
    expect((await deleteMe(rig, G)).status).toBe(200);
    const gone = await linkSteamCall(rig, G, "aa06", "bb-ghost", 480);
    expect(gone.status, gone.text).toBe(410);
    const goneAgain = await linkSteamCall(rig, G, "aa06", "bb-ghost", 480);
    expect([goneAgain.status, goneAgain.json], "a 410 keeps the ticket spent, as before").toEqual([403, USED]);
    // and the guard's 403 is the one that gives it back (see the first test of this group); here Steam's own refusal does too
    const refused = await linkSteamCall(rig, Z, "ffff", "bb-ghost", 480); // not a ticket Steam knows
    expect(refused.status).toBe(403);
    const refusedAgain = await linkSteamCall(rig, Z, "ffff", "bb-ghost", 480);
    expect(refusedAgain.json, "Steam's refusal gives the ticket back (as before)").not.toEqual(USED);
  });
});

describe.each(KINDS)("F1: a lone key with a live code, a profile and ghosts joins, on %s", (kind) => {
  it("by code: two codes asked (the second killed the first), an expired one met, a profile of its own and a ghost: no code is left anywhere, no players/<key>.json, the profile is merged, the ghost stays", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    const pa = await putWire(rig, earnedWire({ runs: 5, bestDay: 7 }, { won: ["furnace"] }), A);
    const px = await putWire(rig, earnedWire({ runs: 9, bestDay: 3 }, { won: ["weaver"] }), X);
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-before" }))).status).toBe(201);
    const first = codeOf(await requestCode(rig, X));
    const second = codeOf(await requestCode(rig, X));
    expect(await under(rig, "linkcodes/"), "the new code killed the old one").toHaveLength(1);
    const joined = await redeemCode(rig, X, codeOf(await requestCode(rig, A)));
    expect(joined.status, joined.text).toBe(200);
    expect(joined.json).toEqual({ player: A.playerId, profile: mergeWire(pa.json as unknown as WireProfile, px.json as unknown as WireProfile) });
    expect(await under(rig, "linkcodes/"), "no live code is left, X's included").toEqual([]);
    expect(await under(rig, "players/"), "X's own player record is gone").toEqual([`players/${A.playerId}.json`]);
    expect(await under(rig, "links/keys/")).toEqual([`links/keys/${X.playerId}.json`]);
    expect(profileStored(rig, X.playerId)).toBe(false);
    expect(ghostCount(rig), "X's ghost stays").toBe(1);
    for (const stale of [first, second]) {
      const r = await redeemCode(rig, Z, stale);
      expect([r.status, r.json], `the stale code ${stale}`).toEqual([403, REFUSED]);
    }
  });

  it("an expired code of the lone key is dropped by its join as well (it was still in the store), and the same by Steam", async () => {
    const steam = fakeSteam({ aa01: S1, aa02: S1 });
    const rig = await open(kind, { steam, redeemLimit: NOLIMIT });
    const [X, Y] = [await freshIdentity(), await freshIdentity()];
    expect((await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).status).toBe(200); // S1 is A's
    for (const [who, join] of [
      ["by code", async (k: Identity) => redeemCode(rig, k, codeOf(await requestCode(rig, A)))],
      ["by Steam", async (k: Identity) => linkSteamCall(rig, k, "aa02", "bb-ghost", 480)],
    ] as const) {
      const k = who === "by code" ? X : Y;
      await requestCode(rig, k); // a live code of its own
      rig.clock.now += CODE_TTL_MS + 1; // and it expires; nobody meets it
      expect(await under(rig, "linkcodes/"), `${who}: the expired code is still in the store`).toHaveLength(1);
      const r = await join(k);
      expect(r.status, `${who}: ${r.text}`).toBe(200);
      expect(await under(rig, "linkcodes/"), `${who}: and gone after the join`).toEqual([]);
      expect((await under(rig, "players/")).includes(`players/${k.playerId}.json`), who).toBe(false);
    }
  });
});

describe.each(KINDS)("F1: the order of the writes inside join (decision 1), on %s", (kind) => {
  it("the redeemed code is spent first, the key's own live code goes before anything is linked, the link is written, and the key's own player record goes last", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const X = await freshIdentity();
    await putWire(rig, earnedWire({ runs: 2 }), X);
    const ownCode = codeOf(await requestCode(rig, X));
    const aCode = codeOf(await requestCode(rig, A));
    const ownKey = `linkcodes/${hashCode(normalizeCode(ownCode)!)}.json`;
    const aKey = `linkcodes/${hashCode(normalizeCode(aCode)!)}.json`;
    const events: string[] = [];
    const store = rig.app.links.store as { put: LinkStore["put"]; delete: LinkStore["delete"] };
    const put = store.put.bind(store), del = store.delete.bind(store);
    store.put = async (k, t) => {
      events.push(`put ${k}`);
      return put(k, t);
    };
    store.delete = async (k) => {
      events.push(`delete ${k}`);
      return del(k);
    };
    try {
      expect((await redeemCode(rig, X, aCode)).status).toBe(200);
    } finally {
      store.put = put;
      store.delete = del;
    }
    const at = (e: string, last = false): number => {
      const i = last ? events.lastIndexOf(e) : events.indexOf(e);
      expect(i, `${e} happened (${events.join(" | ")})`).toBeGreaterThanOrEqual(0);
      return i;
    };
    const spent = at(`delete ${aKey}`), ownGone = at(`delete ${ownKey}`), listed = at(`put players/${A.playerId}.json`, true);
    const linked = at(`put links/keys/${X.playerId}.json`), recordGone = at(`delete players/${X.playerId}.json`);
    expect(spent, "the redeemed code is spent first").toBeLessThan(ownGone);
    expect(ownGone, "X's own live code goes before anything points X at A: no instant when a linked key has a live code").toBeLessThan(linked);
    expect(listed, "A's record names X before X's link is written").toBeLessThan(linked);
    expect(linked, "X's own player record is removed after the link").toBeLessThan(recordGone);
  });
});

describe.each(KINDS)("F1 under concurrency, on %s", (kind) => {
  it("a lone key asks for its own code while it redeems another player's: in either order, no live code names the key as a player afterwards, and its own player record is gone (10 rounds)", async () => {
    const orders: string[] = [];
    for (let round = 0; round < 10; round++) {
      const rig = await open(kind, { redeemLimit: NOLIMIT });
      const X = await freshIdentity();
      const aCode = codeOf(await requestCode(rig, A));
      const own = round % 2 === 0 ? requestCode(rig, X) : null;
      const joined = redeemCode(rig, X, aCode);
      const ownLate = round % 2 === 1 ? requestCode(rig, X) : null;
      const [j, o] = await Promise.all([joined, own ?? ownLate]);
      expect([j.status, o?.status], `round ${round}: ${j.text} | ${o?.text}`).toEqual([200, 200]);
      const records = await identityRecords(rig);
      for (const [k, text] of Object.entries(records)) {
        if (k.startsWith("linkcodes/")) expect(JSON.parse(text).player, `round ${round}: ${k}`).not.toBe(X.playerId);
      }
      expect(Object.keys(records).filter((k) => k.startsWith("players/")), `round ${round}`).toEqual([`players/${A.playerId}.json`]);
      expect(Object.keys(records).filter((k) => k.startsWith("links/keys/"))).toEqual([`links/keys/${X.playerId}.json`]);
      orders.push(JSON.parse(records[`players/${A.playerId}.json`]).code ? "code-after" : "code-before");
    }
    console.log(`VIDENT1FIX F1 race on ${kind}: own code request ran ${orders.filter((x) => x === "code-after").length} times after the join and ${orders.filter((x) => x === "code-before").length} before it`);
  });

  it("a key redeems its player's code while the player is deleted from its first key (10 rounds): either the key joined and was tombstoned with the player, or it never linked and is untouched; no link record and no player record survives", async () => {
    let joinedFirst = 0, deletedFirst = 0;
    for (let round = 0; round < 10; round++) {
      const rig = await open(kind, { redeemLimit: NOLIMIT });
      const X = await freshIdentity();
      const aCode = codeOf(await requestCode(rig, A));
      const ps = round % 2 === 0 ? [redeemCode(rig, X, aCode), deleteMe(rig, A)] : [deleteMe(rig, A), redeemCode(rig, X, aCode)];
      const rs = await Promise.all(ps);
      const [r, d] = round % 2 === 0 ? rs : [rs[1], rs[0]];
      expect(d.status, `round ${round}`).toBe(200);
      const records = await identityRecords(rig);
      expect(Object.keys(records).filter((k) => k.startsWith("links/") || k.startsWith("players/") || k.startsWith("linkcodes/")), `round ${round}: nothing but the tombstone may remain`).toEqual([]);
      await rig.restart();
      await rig.app.links.ensureFresh();
      if (r.status === 200) {
        joinedFirst++;
        expect(rig.app.links.isGone(X.playerId), `round ${round}: X joined A and went with it`).toBe(true);
      } else {
        deletedFirst++;
        expect(r.status, `round ${round}: ${r.text}`).toBe(403);
        expect(rig.app.links.isGone(X.playerId), `round ${round}: X never linked`).toBe(false);
        expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: `x-${round}` }))).status).toBe(201);
      }
    }
    console.log(`VIDENT1FIX F1 race with DELETE on ${kind}: the join won ${joinedFirst} rounds, the delete won ${deletedFirst}`);
  });
});

describe.each(KINDS)("F1: the inert players/<key>.json that a failed removal leaves, on %s", (kind) => {
  it("the join stands; no reader (issueCode, groupFor, playerOfKey, match, profile GET and PUT, deletePlayer) is fooled by the record; a DELETE leaves it behind, inert", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const [X, Y, S] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-old" }))).status).toBe(201);
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-old" }))).status).toBe(201);
    expect((await postGhost(rig, S, uploadFor(S, S.playerId, { runId: "s-old" }))).status).toBe(201);
    expect((await putWire(rig, earnedWire({ runs: 4 }), X)).status).toBe(200);
    const stale = codeOf(await requestCode(rig, X));
    const store = rig.app.links.store as { delete: LinkStore["delete"] };
    const real = store.delete.bind(store);
    store.delete = async (k: string) => {
      if (k === `players/${X.playerId}.json`) throw new StorageError("identity delete failed: HTTP 500");
      return real(k);
    };
    try {
      expect((await linkVia(rig, A, X)).joined.status, "the join stands").toBe(200);
    } finally {
      store.delete = real;
    }
    const inert = (await identityRecords(rig))[`players/${X.playerId}.json`];
    expect(inert, "the inert record is what is left").toBeDefined();
    expect(JSON.parse(inert)).toMatchObject({ keys: [], steam: [] });
    expect(await under(rig, "linkcodes/"), "and no live code").toEqual([]);

    // issueCode: X, a device, issues a code of A's player, not of itself; its inert record is not read or changed
    const xCode = codeOf(await requestCode(rig, X));
    expect((await identityRecords(rig))[`players/${X.playerId}.json`], "X's own code request leaves X's inert record alone").toBe(inert);
    expect(JSON.parse((await identityRecords(rig))[`players/${A.playerId}.json`]).code, "the code is A's").toBeTypeOf("string");
    const joinedY = await redeemCode(rig, Y, xCode);
    expect([joinedY.status, joinedY.json?.player], "a code X showed joins the PLAYER A").toEqual([200, A.playerId]);
    // groupFor, playerOfKey
    const group = [A.playerId, X.playerId, Y.playerId].sort();
    expect((await rig.app.links.groupFor(X.playerId)).slice().sort()).toEqual(group);
    expect((await rig.app.links.groupFor(A.playerId)).slice().sort()).toEqual(group);
    expect(await rig.app.links.playerOfKey(X.playerId, true)).toBe(A.playerId);
    // the match rule: the group's own ghosts are never served to the group, the stranger's is
    for (const asker of [X.playerId, A.playerId, Y.playerId]) {
      for (let i = 0; i < 8; i++) {
        const m = await matchAs(rig, asker, { seen: `x${i}`.repeat(3) });
        expect(m.status, m.text).toBe(200);
        expect((m.json?.snapshot as { playerId: string }).playerId, `asked as ${asker.slice(0, 4)}`).toBe(S.playerId);
      }
    }
    // the profile routes read and write A's record
    const readX = await readProfile(rig, X);
    expect(readX.status).toBe(200);
    expect(readX.json?.player).toBe(A.playerId);
    expect(readX.json).toEqual((await readProfile(rig, A)).json);
    expect((await putWire(rig, earnedWire({ runs: 12 }), X)).status).toBe(200);
    expect(profileStored(rig, X.playerId), "a PUT from the device lands in the player's record").toBe(false);
    expect((await readProfile(rig, A)).json?.profile).toMatchObject({ counters: { runs: 12 } });
    // a stale hand-made code of X is the plain refusal, with the inert record beside it
    await handmade(rig, X.playerId, "ABCD-EFGH");
    expect((await redeemCode(rig, S, "ABCD-EFGH")).json).toEqual(REFUSED);
    // deletePlayer from the device: the tombstone names the group; the inert record outlives the delete and nothing reads it
    expect((await deleteMe(rig, X)).status).toBe(200);
    const after = await identityRecords(rig);
    expect(JSON.parse(after[`tombstones/${A.playerId}.json`]).ids.slice().sort()).toEqual(group);
    expect(Object.keys(after).filter((k) => k.startsWith("links/keys/") || k.startsWith("links/steam/")), "no link record survives").toEqual([]);
    expect(Object.keys(after).filter((k) => k.startsWith("players/")), "only X's inert record is left").toEqual([`players/${X.playerId}.json`]);
    expect(after[`players/${X.playerId}.json`], "unchanged, and it names nobody").toBe(inert);
    await rig.restart();
    const who = new Map<string, Identity>([[A.playerId, A], [X.playerId, X], [Y.playerId, Y]]);
    for (const id of group) expect((await postGhost(rig, who.get(id)!, uploadFor(who.get(id)!, id, { runId: `post-${id.slice(0, 3)}` }))).status, id.slice(0, 4)).toBe(410);
    expect((await requestCode(rig, X)).status, "the inert record cannot make X a player again").toBe(410);
    expect((await postGhost(rig, S, uploadFor(S, S.playerId, { runId: "s-new" }))).status, "a stranger is not affected").toBe(201);
  });

  it("ghost-admin purge-tombstoned reads the tombstones only: with the inert record in the store its dry run plans, and --apply removes, exactly the deleted group's ghosts; the inert record is not its business", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const [X, S] = [await freshIdentity(), await freshIdentity()];
    for (const [k, id, run] of [[A, A.playerId, "a-old"], [X, X.playerId, "x-old"], [S, S.playerId, "s-old"]] as const) {
      expect((await postGhost(rig, k, uploadFor(k, id, { runId: run }))).status).toBe(201);
    }
    await requestCode(rig, X);
    const store = rig.app.links.store as { delete: LinkStore["delete"] };
    const real = store.delete.bind(store);
    store.delete = async (k: string) => {
      if (k === `players/${X.playerId}.json`) throw new StorageError("identity delete failed: HTTP 500");
      return real(k);
    };
    try {
      expect((await linkVia(rig, A, X)).joined.status).toBe(200);
    } finally {
      store.delete = real;
    }
    expect(await under(rig, "players/"), "the inert record is there").toContain(`players/${X.playerId}.json`);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(ghostCount(rig)).toBe(3);
    const dry = await ghostAdmin(rig, ["purge-tombstoned"]);
    expect(dry.code, dry.out.join("\n")).toBe(0);
    expect(dry.out.filter((l) => l.startsWith("  delete ")), dry.out.join("\n")).toHaveLength(2);
    expect(ghostCount(rig), "a dry run changes nothing").toBe(3);
    const applied = await ghostAdmin(rig, ["purge-tombstoned", "--apply"]);
    expect(applied.code, applied.out.join("\n")).toBe(0);
    expect(ghostCount(rig), "A's and X's ghosts are gone, the stranger's stays").toBe(1);
    expect(await under(rig, "players/"), "the inert record is exactly as it was").toEqual([`players/${X.playerId}.json`]);
  });

  it("an interrupted join (the link write fails after the redeemed code was spent): X's retry with a fresh code heals it, and the leftovers are dead (no live code of X, a harmless listed key)", async () => {
    const rig = await open(kind, { redeemLimit: NOLIMIT });
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    const stale = codeOf(await requestCode(rig, X));
    const store = rig.app.links.store as { put: LinkStore["put"] };
    const real = store.put.bind(store);
    store.put = async (k: string, t: string) => {
      if (k === `links/keys/${X.playerId}.json`) throw new StorageError("identity write failed: HTTP 500");
      return real(k, t);
    };
    const failed = await (async (): Promise<Reply> => {
      try {
        return await redeemCode(rig, X, codeOf(await requestCode(rig, A)));
      } finally {
        store.put = real;
      }
    })();
    expect(failed.status, failed.text).toBe(503);
    const mid = await identityRecords(rig);
    expect(Object.keys(mid).filter((k) => k.startsWith("linkcodes/")), "X's own code is dead already, and the redeemed one is spent").toEqual([]);
    expect(JSON.parse(mid[`players/${A.playerId}.json`]).keys, "A lists X: a listed key that is not linked").toEqual([X.playerId]);
    expect(Object.keys(mid).filter((k) => k.startsWith("links/keys/"))).toEqual([]);
    expect((await redeemCode(rig, Z, stale)).status, "X's old code is dead").toBe(403);
    const healed = await redeemCode(rig, X, codeOf(await requestCode(rig, A)));
    expect(healed.status, healed.text).toBe(200);
    const end = await identityRecords(rig);
    expect(Object.keys(end).filter((k) => k.startsWith("links/keys/"))).toEqual([`links/keys/${X.playerId}.json`]);
    expect(JSON.parse(end[`players/${A.playerId}.json`]).keys, "listed once").toEqual([X.playerId]);
    expect(Object.keys(end).filter((k) => k.startsWith("players/"))).toEqual([`players/${A.playerId}.json`]);
  });
});
