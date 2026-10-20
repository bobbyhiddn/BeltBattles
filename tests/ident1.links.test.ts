// IDENT-1 step 2 (REQ-BFG-122; BRIEF-IDENT1): the link store and the canonical-player check in POST /v1/ghosts and PUT /v1/profile.
// A key uploads under its own id (so every 0.9.13 client keeps working, with no extra store read) or under the player it is linked
// to; any other id is a 403, as ever. Links live in the same backing store as the profiles (a directory, or Tigris on the in-process
// fake S3) and survive a restart. Both stores run every case.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Identity } from "../src/net/identity";
import { FileLinkStore, MemoryLinkStore, TigrisLinkStore } from "../server/linkStore";
import { MemoryProfileStore } from "../server/profileStore";
import { Links } from "../server/links";
import { s3For, startFake } from "./netStores";
import { testIdentity } from "./netIdentity";
import { earnedWire } from "./profileupWire";
import { closeRigs, fakeKeys, openRig, postGhost, putWire, readProfile, redeemCode, requestCode, uploadFor, type Kind, type Rig } from "./identRig";

let A: Identity, B: Identity, C: Identity;
beforeAll(async () => {
  A = await testIdentity(0);
  B = await testIdentity(1);
  C = await testIdentity(2);
});
afterAll(closeRigs);

/** Link `device` to `owner`'s player through the real routes: a code from the owner, redeemed by the device. */
async function link(rig: Rig, owner: Identity, device: Identity): Promise<void> {
  const issued = await requestCode(rig, owner);
  expect(issued.status, issued.text).toBe(200);
  const joined = await redeemCode(rig, device, issued.json!.code as string);
  expect(joined.status, joined.text).toBe(200);
}

describe.each(["jsonl", "tigris"] as Kind[])("the canonical-player check on %s", (kind) => {
  it("an unlinked key uploads under its own id, as every 0.9.13 client does", async () => {
    const rig = await openRig(kind);
    const r = await postGhost(rig, A, uploadFor(A));
    expect(r.status, r.text).toBe(201);
    expect(typeof r.json!.id).toBe("string");
  });

  it("a key linked to a player uploads under that player; under its own id too (a run that began before the link)", async () => {
    const rig = await openRig(kind);
    await link(rig, A, B);
    // a ghost is its content's hash (the uploader's key is not in it), so each upload here is a different run
    const underP = await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "run-b-1" }));
    expect(underP.status, underP.text).toBe(201);
    const own = await postGhost(rig, B, uploadFor(B, B.playerId, { runId: "run-b-2" }));
    expect(own.status, own.text).toBe(201);
    const first = await postGhost(rig, A, uploadFor(A, A.playerId, { runId: "run-a-1" }));
    expect(first.status, first.text).toBe(201); // the player's first key, under the player's id: its own
    const again = await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "run-b-1" }));
    expect(again.status).toBe(200); // the same snapshot again is the same ghost: stored once (200), not a second time
  });

  it("a key under a player it is not linked to is 403; so is a linked key under a player that is not its own", async () => {
    const rig = await openRig(kind);
    await link(rig, A, B);
    const stranger = await postGhost(rig, C, uploadFor(C, A.playerId));
    expect(stranger.status).toBe(403);
    expect(String(stranger.json!.error)).toContain("snapshot.playerId is not the player id of the signing key");
    const other = await postGhost(rig, B, uploadFor(B, C.playerId));
    expect(other.status).toBe(403);
    const sibling = await postGhost(rig, A, uploadFor(A, B.playerId));
    expect(sibling.status).toBe(403); // the player's own key may not post as a linked key either: only its own id or the player's
  });

  it("linking relaxes no deck rule: an over-budget deck under the player is the same refusal an unlinked key gets", async () => {
    const rig = await openRig(kind);
    await link(rig, A, B);
    const fat = (id: Identity, player: string) => {
      const s = uploadFor(id, player, { runId: "run-fat" });
      return { ...s, build: { ...s.build, hullBonus: s.build.hullBonus + 50000 } };
    };
    const unlinked = await postGhost(rig, C, fat(C, C.playerId));
    const linked = await postGhost(rig, B, fat(B, A.playerId));
    expect(unlinked.status).toBe(422);
    expect(linked.status).toBe(422);
    expect(linked.json!.error).toBe("deck failed validation");
    expect(linked.json!.errors).toEqual(unlinked.json!.errors);
    expect((await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "run-fine" }))).status).toBe(201); // and a legal one under the same link still passes
  });

  it("links survive a restart: the new process reads them from the store", async () => {
    const rig = await openRig(kind);
    await link(rig, A, B);
    await rig.restart();
    const r = await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "run-b-1" }));
    expect(r.status, r.text).toBe(201);
    const denied = await postGhost(rig, C, uploadFor(C, A.playerId));
    expect(denied.status).toBe(403);
    const read = await readProfile(rig, B);
    expect(read.status, read.text).toBe(200);
    expect(read.json!.player).toBe(A.playerId);
  });

  it("PUT /v1/profile writes the signer's canonical player's record: a linked key's upload lands on the player", async () => {
    const rig = await openRig(kind);
    await link(rig, A, B);
    const put = await putWire(rig, earnedWire({ runs: 4, bestDay: 6 }), B);
    expect(put.status, put.text).toBe(200);
    const asA = await readProfile(rig, A);
    expect(asA.json!.player).toBe(A.playerId);
    expect((asA.json!.profile as { counters: { runs: number } }).counters.runs).toBe(4);
    const asB = await readProfile(rig, B);
    expect(asB.json).toEqual(asA.json);
    // an unlinked key still writes its own record, and only its own
    const own = await putWire(rig, earnedWire({ runs: 1 }), C);
    expect(own.status).toBe(200);
    expect(((await readProfile(rig, C)).json!.profile as { counters: { runs: number } }).counters.runs).toBe(1);
    expect(((await readProfile(rig, A)).json!.profile as { counters: { runs: number } }).counters.runs).toBe(4);
  });
});

describe("where the records live", () => {
  it("the file store keeps them under <dataDir>/identity, the Tigris store as objects outside ghosts/ and profiles/", async () => {
    const f = await openRig("jsonl");
    await link(f, A, B);
    const root = join(f.dir, "identity");
    expect(existsSync(join(root, "links", "keys", `${B.playerId}.json`))).toBe(true);
    expect(existsSync(join(root, "players", `${A.playerId}.json`))).toBe(true);
    expect(readdirSync(join(root, "linkcodes"))).toHaveLength(0); // the code was spent: its object is gone
    const t = await openRig("tigris");
    await link(t, A, B);
    expect(fakeKeys(t, "links/keys/")).toEqual([`links/keys/${B.playerId}.json`]);
    expect(fakeKeys(t, "players/")).toEqual([`players/${A.playerId}.json`]);
    expect(fakeKeys(t, "linkcodes/")).toEqual([]);
    expect(fakeKeys(t, "ghosts/")).toEqual([]); // nothing the ghost buckets list
  });

  it("the three stores answer alike: get, put, delete, list", async () => {
    const fake = await startFake();
    try {
      const stores = [new MemoryLinkStore(), new FileLinkStore((await openRig("jsonl")).dir + "/direct"), new TigrisLinkStore(s3For(fake))];
      for (const s of stores) {
        const k = `tombstones/${A.playerId}.json`;
        expect(await s.get(k)).toBeNull();
        await s.put(k, '{"at":1,"ids":[]}');
        expect(await s.get(k)).toBe('{"at":1,"ids":[]}');
        expect(await s.list("tombstones/")).toEqual([k]);
        expect(await s.list("players/")).toEqual([]);
        await s.delete(k);
        await s.delete(k); // a missing one is fine
        expect(await s.get(k)).toBeNull();
        await expect(s.get("../etc/passwd")).rejects.toThrow("not a record key");
        await expect(s.put("players/a/b.json", "x")).rejects.toThrow("not a record key");
      }
    } finally {
      await fake.close();
    }
  });
});

describe("an upload costs no identity read when the key uploads under its own id", () => {
  it("0.9.13's upload and profile paths: the snapshot id is the signer's, so the link store is asked nothing for the upload", async () => {
    const reads: string[] = [];
    const inner = new MemoryLinkStore();
    const counting = {
      get: async (k: string) => (reads.push(k), inner.get(k)),
      put: (k: string, t: string) => inner.put(k, t),
      delete: (k: string) => inner.delete(k),
      list: (p: string) => inner.list(p),
    };
    const rig = await openRig("jsonl", { linkStore: counting });
    reads.length = 0; // the tombstone list at start is a list, not a get
    const r = await postGhost(rig, A, uploadFor(A));
    expect(r.status, r.text).toBe(201);
    expect(reads).toEqual([]); // zero reads on the 0.9.13 upload path
    const again = await postGhost(rig, A, uploadFor(A));
    expect(again.status).toBe(200);
    expect(reads).toEqual([]);
    // a linked key under the player: the first upload reads the key's link once; the next ones are served from memory
    await link(rig, A, B);
    reads.length = 0;
    await rig.restart({ linkStore: counting }); // cold cache
    reads.length = 0;
    expect((await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "run-b-1" }))).status).toBe(201);
    const first = reads.length;
    expect(first).toBeLessThanOrEqual(1);
    expect((await postGhost(rig, B, uploadFor(B, A.playerId, { runId: "run-b-2" }))).status).toBe(201);
    expect(reads.length).toBe(first);
  });
});

describe("the service itself", () => {
  it("a record that is not a record reads as absent (a key with a damaged link is unlinked, never an error)", async () => {
    const store = new MemoryLinkStore();
    await store.put(`links/keys/${B.playerId}.json`, "not json");
    await store.put(`players/${A.playerId}.json`, '{"keys":"x"}');
    const links = new Links(store, new MemoryProfileStore());
    expect(await links.playerOfKey(B.playerId)).toBe(B.playerId);
    expect(await links.groupFor(A.playerId)).toEqual([A.playerId]);
  });
});
