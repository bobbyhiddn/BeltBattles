// IDENT-1 FIX (REQ-BFG-122), finding F3 of VERIFY-IDENT1 run 3: a player's key list read back as nothing past 64 entries. `idList` took at most
// 64 but `join` appended without a cap, so the 65th link wrote a record that no reader accepted; the next link rewrote it from nothing and a
// DELETE then missed 65 of the keys. Now ONE constant, MAX_LINKED = 64, serves the writers and the readers: the link that would pass it is
// refused with 409 (before the code is spent, the store unchanged), for keys[] and for steam[] alike, and the tombstone, which names P and
// every key (MAX_LINKED + 1 ids), is read with no count limit. keys[] does not count P: a full player is P and 64 keys, 65 devices.
// Both backing stores (JSON lines, and Tigris on the in-process fake S3). The checker's own test is rewritten in tests/vident1.linking.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identity } from "../src/net/identity";
import { MAX_LINKED, decodePlayer, decodeTombstone } from "../server/links";
import { testIdentity } from "./netIdentity";
import {
  closeRigs, deleteMe, fakeSteam, freshIdentity, identityRecords, linkSteamCall, openRig, postGhost, redeemCode, requestCode, uploadFor, type Kind, type Opts,
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
const codeOf = (r: Reply): string => String(r.json?.code);
const FULL_KEYS = { error: "this player already has the most linked devices it can have" };
const FULL_STEAM = { error: "this player already has the most Steam accounts it can have" };
const under = async (rig: Rig, prefix: string) => Object.keys(await identityRecords(rig)).filter((k) => k.startsWith(prefix)).sort();
/** n distinct well-formed ids. */
const ids = (n: number, tag = "k"): string[] => Array.from({ length: n }, (_, i) => `${tag}${String(i).padStart(4, "0")}${"x".repeat(30)}`);
const steamId = (n: number): string => `7656119800${String(n).padStart(7, "0")}`;
const ticket = (n: number): string => n.toString(16).padStart(4, "0");

/** n fresh keys, each linked to `owner` with a code of the owner's own. */
async function fill(rig: Rig, owner: Identity, n: number): Promise<Identity[]> {
  const keys = await Promise.all(Array.from({ length: n }, () => freshIdentity()));
  for (const k of keys) {
    const r = await redeemCode(rig, k, codeOf(await requestCode(rig, owner)));
    expect(r.status, r.text).toBe(200);
  }
  return keys;
}

describe("the readers take what the writers write: one constant", () => {
  it("MAX_LINKED is the reader's old limit, 64 (the limit was not raised); keys[] and steam[] read back at it and not past it", () => {
    expect(MAX_LINKED).toBe(64);
    const rec = (keys: string[], steam: string[]) => JSON.stringify({ keys, steam, at: 1 });
    expect(decodePlayer(rec(ids(MAX_LINKED), ids(MAX_LINKED, "s")))).toMatchObject({ keys: ids(MAX_LINKED), steam: ids(MAX_LINKED, "s") });
    expect(decodePlayer(rec(ids(MAX_LINKED + 1), []))).toBeNull();
    expect(decodePlayer(rec([], ids(MAX_LINKED + 1, "s")))).toBeNull();
  });

  it("a tombstone reads back whole at what a full player writes (P and 64 keys: 65 ids), and past it: it is never dropped for its size", () => {
    const tomb = (list: string[]) => JSON.stringify({ at: 1, ids: list });
    expect(decodeTombstone(tomb(ids(MAX_LINKED + 1)))?.ids).toEqual(ids(MAX_LINKED + 1));
    expect(decodeTombstone(tomb(ids(MAX_LINKED + 2)))?.ids).toHaveLength(MAX_LINKED + 2);
    expect(decodeTombstone(tomb(ids(500)))?.ids).toHaveLength(500);
    expect(decodeTombstone(tomb([...ids(3), "not an id!"]))).toBeNull(); // the shape is still checked
    expect(decodeTombstone(JSON.stringify({ at: 1, ids: "x" }))).toBeNull();
  });
});

describe.each(KINDS)("a full player (64 keys besides its first), on %s", (kind) => {
  it("the 65th key's link is 409 with one plain line, from redeem and from a known Steam account, and not one record changes; a key already linked still redeems; it reads back after a restart", async () => {
    const steam = fakeSteam({ aa01: steamId(0), aa02: steamId(0), aa03: steamId(1) });
    const rig = await open(kind, { steam });
    const keys = await fill(rig, A, MAX_LINKED);
    expect((await linkSteamCall(rig, A, "aa01", "bb-ghost", 480)).status).toBe(200); // A holds S0 (the steam cap is separate: 1 of 64)
    const [over, viaSteam] = [await freshIdentity(), await freshIdentity()];
    const live = codeOf(await requestCode(rig, A));
    const before = await identityRecords(rig);
    expect(decodePlayer(before[`players/${A.playerId}.json`])?.keys, "all 64 read back").toEqual(keys.map((k) => k.playerId));

    const r = await redeemCode(rig, over, live);
    expect(r.status, r.text).toBe(409);
    expect(r.json).toEqual(FULL_KEYS);
    const s = await linkSteamCall(rig, viaSteam, "aa02", "bb-ghost", 480); // S0 is A's: this lone key would join A, the 66th device
    expect(s.status, s.text).toBe(409);
    expect(s.json).toEqual(FULL_KEYS);
    expect(await identityRecords(rig), "not one record changed, the live code included").toEqual(before);
    for (const k of [over, viaSteam]) expect((await postGhost(rig, k, uploadFor(k, A.playerId, { runId: `o-${k.playerId.slice(0, 4)}` }))).status).toBe(403);

    // a key the player has already, redeeming its player's code, takes no new place: 200
    const again = await redeemCode(rig, keys[MAX_LINKED - 1], live);
    expect(again.status, again.text).toBe(200);
    expect(again.json?.player).toBe(A.playerId);
    expect((await under(rig, "links/keys/")).length).toBe(MAX_LINKED);

    // after a restart (nothing in memory) the record still reads whole: the full player takes no key, and keeps all its 64
    await rig.restart();
    const fresh = codeOf(await requestCode(rig, A));
    const late = await redeemCode(rig, over, fresh);
    expect(late.status, late.text).toBe(409);
    expect(late.json).toEqual(FULL_KEYS);
    const after = await identityRecords(rig);
    expect(decodePlayer(after[`players/${A.playerId}.json`])?.keys, "the code request did not rewrite the record from nothing").toEqual(keys.map((k) => k.playerId));
    expect(decodePlayer(after[`players/${A.playerId}.json`])?.steam).toEqual([steamId(0)]);
    // and the two caps are separate: a Steam account still links to a player whose 64 keys are all used
    expect((await linkSteamCall(rig, A, "aa03", "bb-ghost", 480)).status).toBe(200);
    expect(decodePlayer((await identityRecords(rig))[`players/${A.playerId}.json`])?.steam).toEqual([steamId(0), steamId(1)]);
  });

  const ASKERS: [string, number][] = [["the player's first key", -1], ["the last device linked", MAX_LINKED - 1]];
  it.each(ASKERS)(
    "a restart, then a DELETE from %s tombstones all 65 ids and leaves no link record; the tombstone reads back whole after a second restart",
    async (_who, from) => {
      const rig = await open(kind);
      const keys = await fill(rig, A, MAX_LINKED);
      await requestCode(rig, A); // a live code
      const everyone = [A.playerId, ...keys.map((k) => k.playerId)];
      await rig.restart();
      const asker = from < 0 ? A : keys[from];
      expect((await deleteMe(rig, asker)).status).toBe(200);
      const records = await identityRecords(rig);
      expect(Object.keys(records).filter((k) => k.startsWith("links/keys/")), "no link record survives").toEqual([]);
      expect(Object.keys(records).filter((k) => k.startsWith("players/") || k.startsWith("linkcodes/") || k.startsWith("links/steam/")), "nor a player record, a code or a Steam link").toEqual([]);
      expect(Object.keys(records)).toEqual([`tombstones/${A.playerId}.json`]);
      const tomb = decodeTombstone(records[`tombstones/${A.playerId}.json`]);
      expect(tomb?.ids.slice().sort(), "P and every key: 65 ids").toEqual(everyone.slice().sort());
      expect(tomb?.ids).toHaveLength(MAX_LINKED + 1);
      // after another restart the tombstone reads back whole: every id is gone, and a key that was never linked is not
      await rig.restart();
      const stranger = await freshIdentity();
      expect((await postGhost(rig, keys[0], uploadFor(keys[0], A.playerId, { runId: "after" }))).status, "a device of the deleted player").toBe(410);
      expect((await postGhost(rig, stranger, uploadFor(stranger, stranger.playerId, { runId: "other" }))).status, "somebody else").toBe(201);
      for (const id of everyone) expect(rig.app.links.isGone(id), id).toBe(true);
      expect(rig.app.links.isGone(stranger.playerId)).toBe(false);
      expect(rig.app.links.goneCount).toBe(MAX_LINKED + 1);
    },
  );
});

describe.each(KINDS)("a player with 64 Steam accounts, on %s", (kind) => {
  it("the 65th account is 409 with one plain line and changes nothing; an account it has already is a 200 no-op; the record reads back after a restart", async () => {
    const accounts: Record<string, string> = {};
    for (let n = 0; n < MAX_LINKED + 3; n++) accounts[ticket(n)] = steamId(n);
    accounts["ffff"] = steamId(0); // a second ticket for the first account
    const steam = fakeSteam(accounts);
    const rig = await open(kind, { steam });
    for (let n = 0; n < MAX_LINKED; n++) {
      const r = await linkSteamCall(rig, A, ticket(n), "bb-ghost", 480);
      expect(r.status, `account ${n}: ${r.text}`).toBe(200);
      expect(r.json?.player).toBe(A.playerId);
    }
    const before = await identityRecords(rig);
    expect(decodePlayer(before[`players/${A.playerId}.json`])?.steam, "all 64 read back").toEqual(Array.from({ length: MAX_LINKED }, (_, n) => steamId(n)));
    const over = await linkSteamCall(rig, A, ticket(MAX_LINKED), "bb-ghost", 480);
    expect(over.status, over.text).toBe(409);
    expect(over.json).toEqual(FULL_STEAM);
    expect(await identityRecords(rig), "not one record changed (no 65th Steam link either)").toEqual(before);
    expect(await under(rig, "links/steam/")).toHaveLength(MAX_LINKED);
    const same = await linkSteamCall(rig, A, "ffff", "bb-ghost", 480);
    expect(same.status, "an account the player has already takes no new place").toBe(200);
    expect(await identityRecords(rig)).toEqual(before);
    // restart: the record still reads whole (a code request would rewrite it from nothing if it did not), and the 66th is refused the same way
    await rig.restart();
    expect((await requestCode(rig, A)).status).toBe(200);
    expect(decodePlayer((await identityRecords(rig))[`players/${A.playerId}.json`])?.steam).toHaveLength(MAX_LINKED);
    const late = await linkSteamCall(rig, A, ticket(MAX_LINKED + 1), "bb-ghost", 480);
    expect(late.status).toBe(409);
    expect(late.json).toEqual(FULL_STEAM);
    // another player is not affected, and A still takes keys: the caps are separate
    const other = await freshIdentity();
    expect((await linkSteamCall(rig, other, ticket(MAX_LINKED + 2), "bb-ghost", 480)).status).toBe(200);
    const k = await freshIdentity();
    expect((await redeemCode(rig, k, codeOf(await requestCode(rig, A)))).status).toBe(200);
  });
});
