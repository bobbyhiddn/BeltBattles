// VERIFY-IDENT1 (REQ-BFG-122) step 4c, written by the independent checker (cap_zeta): LINKING RULES. Who may join whom, what a link
// changes and what it leaves alone: 409s that spend nothing, a player with two keys that cannot be re-pointed, a lone key's profile
// merged and removed (its ghosts untouched), the upload rule (the player, the key's own id, nobody else), no deck rule relaxed, and a
// linked device never matched against its own player's ghosts. Both backing stores. `it.fails` marks a FINDING: the check states the right
// behaviour, passes while the product is wrong, and starts failing the day the product is fixed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Identity } from "../src/net/identity";
import { mergeWire, type WireProfile } from "../src/net/profileWire";
import { startingBuild } from "../src/sim/ai";
import { MAX_LINKED } from "../server/links";
import { testIdentity } from "./netIdentity";
import { earnedWire } from "./profileupWire";
import {
  closeRigs, deleteMe, fakeKeys, freshIdentity, identityRecords, linkVia, matchAs, openRig, postGhost, profileStored, putWire, readProfile, redeemCode,
  requestCode, theFake, uploadFor, type Kind, type Opts, type Reply, type Rig,
} from "./identRig";

let A: Identity, B: Identity, C: Identity, D: Identity;
beforeAll(async () => {
  [A, B, C, D] = await Promise.all([0, 1, 2, 3].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const NOLIMIT = { windowMs: 600_000, max: 1_000_000 };
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: NOLIMIT, ...over });
const codeOf = (r: Reply): string => String(r.json?.code);
const j = (r: Reply): Record<string, unknown> => r.json ?? {};

/** The playerId of every stored player upload (the ghost records themselves, as the store holds them). */
function ghostOwners(rig: Rig): string[] {
  const owners: string[] = [];
  if (rig.kind === "jsonl") {
    const f = join(rig.dir, "ghosts.jsonl");
    if (existsSync(f)) {
      for (const line of readFileSync(f, "utf8").split("\n")) if (line.trim()) owners.push((JSON.parse(line) as { snapshot: { playerId: string } }).snapshot.playerId);
    }
  } else {
    for (const k of fakeKeys(rig, "ghosts/").filter((x) => x.includes("/player/"))) {
      owners.push((JSON.parse(theFake().getObject(rig.bucket, k) ?? "{}") as { snapshot: { playerId: string } }).snapshot.playerId);
    }
  }
  return owners.sort();
}
void readdirSync;

describe.each(KINDS)("who may join whom, on %s", (kind) => {
  it("a key linked to P that redeems Q's code is 409 with its own line, nothing changes (the code included), and Q's code stays live for a fresh key", async () => {
    const rig = await open(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200); // B belongs to A
    const q = codeOf(await requestCode(rig, D)); // Q is D's player
    const before = await identityRecords(rig);
    const r = await redeemCode(rig, B, q);
    expect(r.status, r.text).toBe(409);
    expect(r.json).toEqual({ error: "this device is already linked to another player" });
    expect(await identityRecords(rig)).toEqual(before);
    const F = await freshIdentity();
    const ok = await redeemCode(rig, F, q);
    expect(ok.status, ok.text).toBe(200);
    expect(j(ok).player).toBe(D.playerId);
    // and B still uploads under A, not D
    expect((await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "b-1" }))).status).toBe(201);
    expect((await postGhost(rig, B, uploadFor(B, D.playerId, { runId: "b-2" }))).status).toBe(403);
  });

  it("a player with two keys cannot be re-pointed: its first key and its linked key both get 409 on another player's code, and so does a third device", async () => {
    const rig = await open(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await linkVia(rig, A, C)).joined.status).toBe(200);
    const q = codeOf(await requestCode(rig, D));
    const before = await identityRecords(rig);
    const rs = await Promise.all([A, B, C].map((k) => redeemCode(rig, k, q)));
    expect(rs.map((r) => r.status), rs.map((r) => r.text).join(" | ")).toEqual([409, 409, 409]);
    expect(String(j(rs[0]).error)).toContain("linked devices"); // A: its own player has other keys
    expect(String(j(rs[1]).error)).toContain("already linked to another player"); // B and C: linked elsewhere
    expect(await identityRecords(rig)).toEqual(before);
    expect(rig.app.links.isGone(A.playerId)).toBe(false);
    expect((await redeemCode(rig, await freshIdentity(), q)).status, "the code was never spent").toBe(200);
  });

  it("a key cannot join a second player by asking twice or in a different order: the first link stands, whatever codes come after", async () => {
    const rig = await open(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    for (const owner of [C, D, A]) {
      const code = codeOf(await requestCode(rig, owner));
      const r = await redeemCode(rig, B, code);
      expect(r.status, `${owner === A ? "A" : owner === C ? "C" : "D"}'s code: ${r.text}`).toBe(owner === A ? 200 : 409);
    }
    const links = Object.entries(await identityRecords(rig)).filter(([k]) => k === `links/keys/${B.playerId}.json`);
    expect(links).toHaveLength(1);
    expect(JSON.parse(links[0][1]).player).toBe(A.playerId); // P is the first key's own id, and B is still A's
  });

  it("a lone key's profile is merged into the player's and then removed; the lone key's ghosts stay exactly as they were", async () => {
    const rig = await open(kind);
    const pa = await putWire(rig, earnedWire({ runs: 5, bestDay: 7 }, { won: ["furnace"] }), A);
    const pb = await putWire(rig, earnedWire({ runs: 9, bestDay: 3 }, { won: ["weaver"] }), B);
    expect(pa.status).toBe(200);
    expect(pb.status).toBe(200);
    expect((await postGhost(rig, B, uploadFor(B, B.playerId, { runId: "b-before" }))).status).toBe(201);
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a-before" }))).status).toBe(201);
    const ownersBefore = ghostOwners(rig);
    expect(ownersBefore).toEqual([A.playerId, B.playerId].sort());
    const code = codeOf(await requestCode(rig, A));
    const joined = await redeemCode(rig, B, code);
    expect(joined.status, joined.text).toBe(200);
    const expected = mergeWire(pa.json as unknown as WireProfile, pb.json as unknown as WireProfile);
    expect(j(joined)).toEqual({ player: A.playerId, profile: expected });
    const merged = j(joined).profile as WireProfile;
    expect(merged.counters.runs).toBe(9); // the larger count
    expect((merged as unknown as { heroesWon: string[] }).heroesWon.slice().sort()).toEqual(["furnace", "weaver"]); // the union
    expect(profileStored(rig, B.playerId), "the lone key's own record is removed").toBe(false);
    expect(profileStored(rig, A.playerId)).toBe(true);
    for (const asker of [A, B]) expect(j(await readProfile(rig, asker))).toEqual({ player: A.playerId, profile: expected });
    expect(ghostOwners(rig), "the ghosts stay as they are: B's still carries B's own id").toEqual(ownersBefore);
  });

  it("a lone key with NO profile joins without inventing one; a player with no profile gets the lone key's as it is", async () => {
    const rig = await open(kind);
    expect((await linkVia(rig, A, B)).joined.json).toEqual({ player: A.playerId, profile: null }); // nobody had one
    const pc = await putWire(rig, earnedWire({ runs: 4, bestDay: 2 }), C);
    const joined = await redeemCode(rig, C, codeOf(await requestCode(rig, A)));
    expect(joined.status).toBe(200);
    expect(j(joined)).toEqual({ player: A.playerId, profile: pc.json }); // A had none: C's profile becomes the player's
    expect(profileStored(rig, C.playerId)).toBe(false);
    expect(profileStored(rig, A.playerId)).toBe(true);
  });

  it("a player's own first key redeeming its own code is a no-op (not added to its own list); P is always a key's own id", async () => {
    const rig = await open(kind);
    const r = await redeemCode(rig, A, codeOf(await requestCode(rig, A)));
    expect(r.status).toBe(200);
    expect(j(r).player).toBe(A.playerId);
    const players = JSON.parse((await identityRecords(rig))[`players/${A.playerId}.json`]) as { keys: string[] };
    expect(players.keys).toEqual([]);
    expect(Object.keys(await identityRecords(rig)).filter((k) => k.startsWith("links/keys/"))).toEqual([]);
  });
});

describe.each(KINDS)("what a link changes in the upload rule, on %s", (kind) => {
  it("a linked key uploads under the player (201, then 200 for the same bytes), under its own id too, never under anyone else; an unlinked key never under the player; the player's first key never under a linked key's id", async () => {
    const rig = await open(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    const mine = uploadFor(B, A.playerId, { runId: "u1" });
    expect((await postGhost(rig, B, mine)).status).toBe(201);
    expect((await postGhost(rig, B, mine)).status, "the same bytes again").toBe(200);
    expect((await postGhost(rig, B, uploadFor(B, B.playerId, { runId: "u2" }))).status, "its own id, as a 0.9.13 build has it").toBe(201);
    expect((await postGhost(rig, B, uploadFor(B, D.playerId, { runId: "u3" }))).status).toBe(403);
    expect((await postGhost(rig, B, uploadFor(B, C.playerId, { runId: "u3" }))).status).toBe(403);
    expect((await postGhost(rig, C, uploadFor(C, A.playerId, { runId: "u4" }))).status, "an unlinked key").toBe(403);
    expect((await postGhost(rig, A, uploadFor(A, B.playerId, { runId: "u5" }))).status, "A under its device's id").toBe(403);
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "u6" }))).status).toBe(201);
  });

  it("linking relaxes no deck rule: a deck the server refuses for an unlinked key is refused for a linked key under the player, with the same status and words", async () => {
    const rig = await open(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    const b0 = startingBuild("furnace", 1);
    const bad: [string, Record<string, unknown>][] = [
      ["a belt capacity far over the cap", { build: { ...b0, beltCap: 999 } }],
      ["a negative belt capacity", { build: { ...b0, beltCap: -3 } }],
      ["a piece twice (the same uid on the same cells)", { build: { ...b0, items: [...b0.items, { ...b0.items[0] }] } }],
      ["a piece placed off the deck", { build: { ...b0, items: b0.items.map((p, i) => (i === 0 ? { ...p, x: 9, y: 9 } : p)) } }],
      ["a piece that is not in the catalogue", { build: { ...b0, items: [...b0.items, { uid: 9999, def: "NOT-AN-ITEM", x: 0, y: 0 }] } }],
      ["no route at all", { build: { ...b0, routes: [] } }],
      ["a turret that is not in the catalogue", { build: { ...b0, turrets: [{ slot: 0, def: "NOT-A-TURRET", uid: 777 }] } }],
      ["a hull bonus nobody is given", { build: { ...b0, hullBonus: 500 } }],
      ["a rules version that does not exist", { rules: "bb-0.0.1" }],
    ];
    let refusedForTheControl = 0;
    for (const [why, over] of bad) {
      let control: Reply;
      try {
        control = await postGhost(rig, C, uploadFor(C, C.playerId, { runId: `ctl-${why.length}`, ...over }));
      } catch {
        continue; // the client-side encoder (encodeSnapshot) refuses it before any request: not a server deck rule
      }
      if (control.status < 400) continue; // the server takes this one for an unlinked key too: not a deck rule, nothing to compare
      refusedForTheControl++;
      const linked = await postGhost(rig, B, uploadFor(B, A.playerId, { runId: `ctl-${why.length}`, ...over }));
      expect(linked.status, `${why}: ${linked.text}`).toBe(control.status);
      expect(String(j(linked).error), why).toBe(String(j(control).error));
      const ownId = await postGhost(rig, B, uploadFor(B, B.playerId, { runId: `ctl-${why.length}`, ...over }));
      expect(ownId.status, `${why}, under its own id: ${ownId.text}`).toBe(control.status);
    }
    expect(refusedForTheControl, "at least three of the invalid decks are really refused for an unlinked key (the comparison is against that refusal)").toBeGreaterThanOrEqual(3);
    console.log(`VIDENT1 deck rules: ${refusedForTheControl} of ${bad.length} invalid decks were refused for the unlinked control, and identically for the linked key (under the player and under its own id)`);
    // the stored uploads are only the valid ones the control happened to be given (none of the refused bytes got in through the link)
    expect(ghostOwners(rig).filter((o) => o === A.playerId || o === B.playerId), "nothing refused was stored under the player or the linked key").toEqual([]);
  });
});

describe.each(KINDS)("a linked device is never matched against its own player's ghosts, on %s", (kind) => {
  const seenVariants = (n: number) => Array.from({ length: n }, (_, i) => `x${i}${"ab".repeat(4)}`);

  it("asking as the player, as the linked key, or as the first key: only somebody else's ghost comes back; unrelated askers do get all three players' ghosts (so the skip is what keeps them out)", async () => {
    const rig = await open(kind);
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a1" }))).status).toBe(201);
    expect((await postGhost(rig, B, uploadFor(B, B.playerId, { runId: "b0" }))).status, "B's ghost from before it linked").toBe(201);
    expect((await postGhost(rig, D, uploadFor(D, D.playerId, { runId: "d1" }))).status).toBe(201);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "b1" }))).status, "and one after, under the player").toBe(201);
    // the teeth: unrelated askers see every owner
    const served = new Set<string>();
    for (const e of await Promise.all(Array.from({ length: 40 }, () => freshIdentity()))) {
      const r = await matchAs(rig, e.playerId);
      expect(r.status, r.text).toBe(200);
      served.add(String((j(r).snapshot as { playerId: string }).playerId));
    }
    expect([...served].sort(), "an unrelated asker is served A's, B's and D's ghosts").toEqual([A.playerId, B.playerId, D.playerId].sort());
    // the rule: A's group never meets its own
    for (const asker of [A.playerId, B.playerId]) {
      for (const seen of seenVariants(40)) {
        const r = await matchAs(rig, asker, { seen });
        expect(r.status, r.text).toBe(200);
        expect((j(r).snapshot as { playerId: string }).playerId, `asked as ${asker === A.playerId ? "A" : "B"}`).toBe(D.playerId);
      }
    }
    // D is outside the group: it meets A's and B's, never its own
    const dServed = new Set<string>();
    for (const seen of seenVariants(40)) dServed.add(String((j(await matchAs(rig, D.playerId, { seen })).snapshot as { playerId: string }).playerId));
    expect([...dServed].sort()).toEqual([A.playerId, B.playerId].sort());
  });

  it("with nobody else's ghost in the pool the linked device gets 404, the first key too, while an unrelated asker is served", async () => {
    const rig = await open(kind);
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a1" }))).status).toBe(201);
    expect((await postGhost(rig, B, uploadFor(B, B.playerId, { runId: "b0" }))).status).toBe(201);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await matchAs(rig, A.playerId)).status).toBe(404);
    expect((await matchAs(rig, B.playerId)).status).toBe(404);
    expect((await matchAs(rig, C.playerId)).status).toBe(200);
  });

  it("the skip follows a link made later: before the link B meets A's ghost, after it B does not (the group is read fresh, not remembered from the first match)", async () => {
    const rig = await open(kind);
    expect((await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "a1" }))).status).toBe(201);
    expect((await matchAs(rig, B.playerId)).status, "before the link B is a stranger to A").toBe(200);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    expect((await matchAs(rig, B.playerId)).status, "after the link it meets nobody").toBe(404);
  });
});

describe.each(KINDS)("many devices on one player, on %s", (kind) => {
  // REWRITTEN by IDENT-1 FIX (F3) to the rule that was built: the checker's version wanted 66 links to be written and read back, but the
  // reader takes at most 64 keys (MAX_LINKED) and the fix keeps that limit and refuses the link past it instead (409, the store
  // unchanged). Drops the `.fails`. The rule: 64 keys besides the first fit and read back whole; the next link is 409; with the cap
  // filled, a restart and a DELETE from the first key tombstone every id and leave no link record; the tombstone reads back whole after a
  // second restart.
  it("FINDING (note): a player's record names every key linked to it up to 64 (MAX_LINKED, P not counted): the 65th key's link is 409 and changes nothing; with 64 linked, a restart and a DELETE from the first key tombstone all 65 ids and leave no link record, and the tombstone reads back whole after a second restart", async () => {
    const rig = await open(kind);
    const keys = await Promise.all(Array.from({ length: MAX_LINKED + 2 }, () => freshIdentity()));
    const linked = keys.slice(0, MAX_LINKED);
    const over = keys.slice(MAX_LINKED);
    for (const k of linked) {
      const r = await redeemCode(rig, k, codeOf(await requestCode(rig, A)));
      expect(r.status, r.text).toBe(200);
    }
    const players = JSON.parse((await identityRecords(rig))[`players/${A.playerId}.json`]) as { keys: string[] };
    expect(players.keys, "the record names all 64, in the order they linked").toEqual(linked.map((k) => k.playerId));
    // the link past the cap: 409 with one plain line, and not one record changes (the live code included, which stays unspent)
    const code = codeOf(await requestCode(rig, A));
    const before = await identityRecords(rig);
    for (const k of over) {
      const r = await redeemCode(rig, k, code);
      expect(r.status, r.text).toBe(409);
      expect(r.json).toEqual({ error: "this player already has the most linked devices it can have" });
    }
    expect(await identityRecords(rig)).toEqual(before);
    expect((await postGhost(rig, over[0], uploadFor(over[0], A.playerId, { runId: "o-1" }))).status, "the 65th key is nobody's device").toBe(403);
    // a deletion then tombstones every one of them (after a restart, so nothing is served from memory)
    await rig.restart();
    expect((await deleteMe(rig, A)).status).toBe(200);
    const records = await identityRecords(rig);
    const tomb = JSON.parse(records[`tombstones/${A.playerId}.json`]) as { ids: string[] };
    const stillLinked = Object.keys(records).filter((k) => k.startsWith("links/keys/")).length;
    console.log(`VIDENT1 ${MAX_LINKED} devices on ${kind}: the player record lists ${players.keys.length} keys; after DELETE the tombstone names ${tomb.ids.length} ids (${MAX_LINKED} keys + the player expected); ${stillLinked} link records survive the delete`);
    expect(tomb.ids.length).toBe(MAX_LINKED + 1);
    expect([...tomb.ids].sort()).toEqual([A.playerId, ...linked.map((k) => k.playerId)].sort());
    expect(stillLinked).toBe(0);
    expect(Object.keys(records).filter((k) => k.startsWith("players/") || k.startsWith("linkcodes/")), "no player record, no live code").toEqual([]);
    // the tombstone reads back whole after a second restart: every id is gone, and the 65th key (never linked) is not
    await rig.restart();
    expect((await postGhost(rig, linked[0], uploadFor(linked[0], A.playerId, { runId: "l-1" }))).status, "a device of the deleted player").toBe(410);
    for (const id of [A, ...linked]) expect(rig.app.links.isGone(id.playerId), id.playerId).toBe(true);
    expect(rig.app.links.isGone(over[0].playerId)).toBe(false);
  });
});
