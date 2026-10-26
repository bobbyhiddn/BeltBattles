// IDENT-1 FIX (REQ-BFG-122), finding F1 of VERIFY-IDENT1 run 3: a stale link code made a device of a "player" that is itself a device.
// A lone key X shows a code, then redeems A's code and becomes A's device; X's old code stayed live for up to 10 minutes, so a stranger Z
// who held it became a device of X, and Z deleting "its player" tombstoned X, a living device of A.
//  - `join` now deletes the joining key's own live code (before anything is linked) and its own players/<key>.json (with its link).
//  - `redeem` and `linkSteam` refuse (403, nothing changed, nothing followed) when the code's player, or the Steam account's player, has a
//    links/keys/ record. After the join fix no path makes such a record, so these tests make one BY HAND (damaged data).
//  - A joining key whose players/<key>.json lists a Steam account is refused with 409 (its Steam link must never be orphaned), from redeem
//    and from linkSteam alike.
// Both backing stores (JSON lines, and Tigris on the in-process fake S3).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import { CODE_TTL_MS, hashCode, normalizeCode } from "../server/links";
import type { LinkStore } from "../server/linkStore";
import { StorageError } from "../server/store";
import { testIdentity } from "./netIdentity";
import { earnedWire } from "./profileupWire";
import {
  closeRigs, deleteMe, fakeSteam, freshIdentity, ghostCount, identityRecords, linkSteamCall, linkVia, openRig, postGhost, profileStored, putWire,
  redeemCode, requestCode, uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity;
beforeAll(async () => {
  A = await testIdentity(0);
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const NOLIMIT = { windowMs: 600_000, max: 1_000_000 };
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT, ...over });
const REFUSED = { error: "that code did not work" };
const NO_STEAM_LINK = { error: "that Steam account could not be linked" };
const HAS_OTHERS = { error: "this device already has linked devices or a Steam account" };
const codeOf = (r: Reply): string => String(r.json?.code);
const under = async (rig: Rig, prefix: string) => Object.keys(await identityRecords(rig)).filter((k) => k.startsWith(prefix)).sort();
const S1 = "76561198000000001", S2 = "76561198000000002";

describe.each(KINDS)("a key that joins a player stops being one, on %s", (kind) => {
  it("a lone key's own live code and own player record go with its link; its profile merges in and its ghosts stay; the stale code is the plain refusal and changes nothing", async () => {
    const rig = await open(kind);
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    expect((await putWire(rig, earnedWire({ runs: 3 }), X)).status).toBe(200);
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-before" }))).status).toBe(201);
    const stale = codeOf(await requestCode(rig, X));
    const staleKey = `linkcodes/${hashCode(normalizeCode(stale)!)}.json`;
    const before = await identityRecords(rig);
    expect(Object.keys(before).sort(), "X is a player with a live code").toEqual([staleKey, `players/${X.playerId}.json`].sort());

    expect((await linkVia(rig, A, X)).joined.status).toBe(200);
    const after = await identityRecords(rig);
    expect(Object.keys(after).sort(), "X's code and X's player record are gone; X is A's device").toEqual([`links/keys/${X.playerId}.json`, `players/${A.playerId}.json`].sort());
    expect(JSON.parse(after[`players/${A.playerId}.json`])).toMatchObject({ keys: [X.playerId], steam: [] });
    expect(profileStored(rig, X.playerId), "X's profile merged into A's and went").toBe(false);
    expect(profileStored(rig, A.playerId)).toBe(true);
    expect(ghostCount(rig), "X's ghost stays as it was").toBe(1);

    const z = await redeemCode(rig, Z, stale);
    expect(z.status, z.text).toBe(403);
    expect(z.json).toEqual(REFUSED);
    expect(await identityRecords(rig), "the refusal changed nothing").toEqual(after);
    expect((await postGhost(rig, Z, uploadFor(Z, X.playerId, { runId: "z-1" }))).status, "Z is nobody's device").toBe(403);
    expect((await postGhost(rig, X, uploadFor(X, A.playerId, { runId: "x-1" }))).status, "X uploads under A").toBe(201);
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-2" }))).status, "and under its own id, as a 0.9.13 build does").toBe(201);
  });

  it("the same when the lone key joins through a Steam account: its live code and own player record go too", async () => {
    const rig = await open(kind, { steam: fakeSteam({ aa01: S1, aa02: S1 }) });
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    expect((await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).status).toBe(200); // S1 is A's
    const stale = codeOf(await requestCode(rig, X));
    expect(await under(rig, "linkcodes/")).toHaveLength(1);
    const joined = await linkSteamCall(rig, X, "aa02", "bb-ghost", 480);
    expect(joined.status, joined.text).toBe(200);
    expect(joined.json?.player).toBe(A.playerId);
    expect(await under(rig, "linkcodes/"), "X's live code is gone").toEqual([]);
    expect(await under(rig, "players/"), "and X's own player record").toEqual([`players/${A.playerId}.json`]);
    expect(await under(rig, "links/keys/")).toEqual([`links/keys/${X.playerId}.json`]);
    const z = await redeemCode(rig, Z, stale);
    expect(z.status).toBe(403);
    expect(z.json).toEqual(REFUSED);
    expect(await under(rig, "links/keys/"), "Z linked to nobody").toEqual([`links/keys/${X.playerId}.json`]);
  });

  it("a join that cannot remove the key's own player record still stands, with the code already dead and the failure logged (the removal is the last step)", async () => {
    const rig = await open(kind);
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    const stale = codeOf(await requestCode(rig, X));
    const store = rig.app.links.store as { delete: LinkStore["delete"] };
    const real = store.delete.bind(store);
    store.delete = async (key: string) => {
      if (key === `players/${X.playerId}.json`) throw new StorageError("identity delete failed: HTTP 500");
      return real(key);
    };
    try {
      const joined = await linkVia(rig, A, X);
      expect(joined.joined.status, joined.joined.text).toBe(200);
    } finally {
      store.delete = real;
    }
    expect(rig.log.join("\n")).toContain("could not remove a joined key's own player record");
    const records = await identityRecords(rig);
    expect(Object.keys(records), "the inert record of X is what is left; no code").toContain(`players/${X.playerId}.json`);
    expect(Object.keys(records).filter((k) => k.startsWith("linkcodes/"))).toEqual([]);
    expect(JSON.parse(records[`links/keys/${X.playerId}.json`])).toMatchObject({ player: A.playerId });
    const z = await redeemCode(rig, Z, stale);
    expect(z.status).toBe(403);
    expect(z.json).toEqual(REFUSED);
    expect((await postGhost(rig, X, uploadFor(X, A.playerId, { runId: "x-1" }))).status).toBe(201);
    expect((await deleteMe(rig, Z)).status, "Z deleting its own player tombstones Z alone").toBe(200);
    expect((await postGhost(rig, X, uploadFor(X, A.playerId, { runId: "x-2" }))).status).toBe(201);
  });
});

describe.each(KINDS)("redeem refuses a code whose player is a device (damaged data), on %s", (kind) => {
  /** X is a device of A, and a live code of X exists anyway (made by hand: no path makes it any more). */
  async function damaged(rig: Rig, X: Identity, typed: string): Promise<string> {
    expect((await linkVia(rig, A, X)).joined.status).toBe(200);
    const hash = hashCode(normalizeCode(typed)!);
    await rig.app.links.store.put(`linkcodes/${hash}.json`, JSON.stringify({ player: X.playerId, expiresAt: rig.clock.now + CODE_TTL_MS }));
    return hash;
  }

  it("a stranger and the device itself get the one plain refusal; nothing is followed or changed, not even the code's record", async () => {
    const rig = await open(kind);
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    await damaged(rig, X, "ABCD-EFGH");
    const before = await identityRecords(rig);
    for (const who of [Z, X]) { // X redeeming its own stale code must not be answered as if X were the player
      const r = await redeemCode(rig, who, "ABCD-EFGH");
      expect(r.status, r.text).toBe(403);
      expect(r.json).toEqual(REFUSED);
    }
    expect(await identityRecords(rig), "not a record changed").toEqual(before);
    expect(await under(rig, "links/keys/")).toEqual([`links/keys/${X.playerId}.json`]);
    expect((await postGhost(rig, Z, uploadFor(Z, X.playerId, { runId: "z-1" }))).status, "Z is nobody's device").toBe(403);
    expect((await postGhost(rig, X, uploadFor(X, A.playerId, { runId: "x-1" }))).status, "X is still A's").toBe(201);
  });

  it("the guard reads the store, not a cached 'not linked': a link made behind the cache's back still refuses", async () => {
    const rig = await open(kind);
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    const stale = codeOf(await requestCode(rig, X)); // X is a lone player with a live code
    expect(await rig.app.links.keyLink(X.playerId), "warm the cache: X is not linked").toBeNull();
    // another machine (or damage) links X to A behind this machine's cache
    await rig.app.links.store.put(`links/keys/${X.playerId}.json`, JSON.stringify({ player: A.playerId, at: rig.clock.now }));
    const r = await redeemCode(rig, Z, stale);
    expect(r.status, r.text).toBe(403);
    expect(r.json).toEqual(REFUSED);
    expect(await under(rig, "links/keys/")).toEqual([`links/keys/${X.playerId}.json`]);
  });

  it("it counts as any refused code does: five of them and the sixth try is 429", async () => {
    const rig = await open(kind, { redeemLimit: { windowMs: 600_000, max: 5 } });
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    await damaged(rig, X, "ABCD-EFGH");
    for (let i = 0; i < 5; i++) expect((await redeemCode(rig, Z, "ABCD-EFGH")).status, `try ${i + 1}`).toBe(403);
    const sixth = await redeemCode(rig, Z, "ABCD-EFGH");
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("retry-after")).toBe("600");
  });

  it("a healthy player's code beside it still links (the guard asks about the code's player only)", async () => {
    const rig = await open(kind);
    const [X, Z, Y] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    await damaged(rig, X, "ABCD-EFGH");
    expect((await redeemCode(rig, Z, "ABCD-EFGH")).status).toBe(403);
    const ok = await redeemCode(rig, Y, codeOf(await requestCode(rig, A)));
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json?.player).toBe(A.playerId);
  });
});

describe.each(KINDS)("linkSteam refuses a Steam account whose player is a device (damaged data), on %s", (kind) => {
  it("403 'that Steam account could not be linked' to a stranger and to the device itself; nothing is followed or changed; the ticket stays unspent", async () => {
    const steam = fakeSteam({ aa01: S1, aa02: S1, aa03: S1, aa04: S1 });
    const rig = await open(kind, { steam });
    const [X, Z] = [await freshIdentity(), await freshIdentity()];
    expect((await linkSteamCall(rig, X, "aa01", "bb-ghost", 480)).status).toBe(200); // S1 is X's: X is a lone player with a Steam account
    // damage no path makes any more: X is a device of A, and S1 still points at X
    await rig.app.links.store.put(`links/keys/${X.playerId}.json`, JSON.stringify({ player: A.playerId, at: rig.clock.now }));
    await rig.app.links.store.put(`players/${A.playerId}.json`, JSON.stringify({ keys: [X.playerId], steam: [], at: rig.clock.now }));
    const before = await identityRecords(rig);
    const asked = steam.calls.length;

    const z = await linkSteamCall(rig, Z, "aa02", "bb-ghost", 480);
    expect(z.status, z.text).toBe(403);
    expect(z.json).toEqual(NO_STEAM_LINK);
    expect(await identityRecords(rig), "nothing changed, nothing followed").toEqual(before);
    expect(steam.calls.length, "Steam was asked once").toBe(asked + 1);
    const again = await linkSteamCall(rig, Z, "aa02", "bb-ghost", 480);
    expect(again.status, "the same ticket again: not 'used already'").toBe(403);
    expect(again.json).toEqual(NO_STEAM_LINK);
    expect(steam.calls.length, "so the ticket was given back and Steam was asked again").toBe(asked + 2);

    const device = await linkSteamCall(rig, X, "aa03", "bb-ghost", 480); // the device itself: not 'already linked', not A
    expect(device.status, device.text).toBe(403);
    expect(device.json).toEqual(NO_STEAM_LINK);
    expect(await identityRecords(rig)).toEqual(before);
    expect(await under(rig, "links/keys/"), "Z linked to nobody").toEqual([`links/keys/${X.playerId}.json`]);
    expect((await postGhost(rig, Z, uploadFor(Z, X.playerId, { runId: "z-1" }))).status).toBe(403);
    expect((await postGhost(rig, Z, uploadFor(Z, A.playerId, { runId: "z-2" }))).status).toBe(403);
  });
});

describe.each(KINDS)("a join never orphans a Steam link: a key whose own player record lists a Steam account is refused with 409, on %s", (kind) => {
  it("from redeem and from linkSteam alike: the line is the 409 rule's own, nothing changes, the code is not spent, the Steam link stays the key's", async () => {
    const steam = fakeSteam({ aa01: S1, aa02: S2, aa03: S2 });
    const rig = await open(kind, { steam });
    const [K, Q, F] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    expect((await linkSteamCall(rig, K, "aa01", "bb-ghost", 480)).status).toBe(200); // K holds S1 (K is a lone player with a Steam account)
    expect((await linkSteamCall(rig, Q, "aa02", "bb-ghost", 480)).status).toBe(200); // Q holds S2
    expect(JSON.parse((await identityRecords(rig))[`players/${K.playerId}.json`])).toMatchObject({ keys: [], steam: [S1] });
    const code = codeOf(await requestCode(rig, A));
    const before = await identityRecords(rig);

    const viaRedeem = await redeemCode(rig, K, code);
    expect(viaRedeem.status, viaRedeem.text).toBe(409);
    expect(viaRedeem.json).toEqual(HAS_OTHERS);
    const viaSteam = await linkSteamCall(rig, K, "aa03", "bb-ghost", 480); // S2 is Q's: K would join Q
    expect(viaSteam.status, viaSteam.text).toBe(409);
    expect(viaSteam.json).toEqual(HAS_OTHERS);
    expect(await identityRecords(rig), "not one record changed, the code included").toEqual(before);
    expect(JSON.parse((await identityRecords(rig))[`links/steam/${S1}.json`])).toMatchObject({ player: K.playerId });
    expect(await under(rig, "links/keys/"), "K is linked to nobody").toEqual([]);
    expect((await postGhost(rig, K, uploadFor(K, K.playerId, { runId: "k-1" }))).status, "K is its own player still").toBe(201);
    expect((await redeemCode(rig, F, code)).status, "the code was never spent").toBe(200);
  });
});
