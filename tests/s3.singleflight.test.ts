// S3 (BRIEF-S3 goal 4b; S2-REPORT section 4): TigrisStore.add is single flight per object key. Two identical uploads in flight used to both pass the
// "held?" check, both HEAD and both PUT the same content-addressed key, and both answered 201. Now the second waits for the first and then looks
// again: it is held, so it is a 200 (created: false) as a sequential re-send is, with ONE HEAD and ONE PUT in all. If the first fails (storage
// down) the second tries for itself. Different keys do not wait for each other. The ghosts are played through the game's own code (a lean deck);
// nothing here builds the stand-in sample pool.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ENDLESS, setEndless } from "../src/sim/endless";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { StorageError } from "../server/store";
import type { FakeS3 } from "../tools/fakeS3";
import { startFake, tigrisFor } from "./netStores";
import { TEST_NAME } from "./netIdentity";
import { playEndless } from "./endless1.honest";

setPlayerName(TEST_NAME);

let fake: FakeS3;
let bucket = "";
let seq = 0;
let snaps: GhostSnapshot[];
const ops = () => fake.requests.filter((r) => r.bucket === bucket).map((r) => r.op);

beforeAll(async () => {
  setEndless(true);
  fake = await startFake();
  snaps = playEndless("weaver", 42, "s3singleflightplayerid00000000000000000000", { buys: 0, until: 10 }).runSnaps;
}, 300_000);
afterAll(async () => {
  setEndless(ENDLESS);
  await fake.close();
});
beforeEach(() => {
  fake.clearFaults();
  fake.requests.length = 0;
  bucket = `bb-sf${++seq}`;
  fake.createBucket(bucket);
});

describe("S3: TigrisStore.add is single flight", () => {
  it("two identical adds at once: one HEAD, one PUT; one is created, the other is not", async () => {
    const store = tigrisFor(fake, bucket);
    const s = snaps[4];
    const [a, b] = await Promise.all([store.add(s), store.add(s)]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.id).toBe(ghostId(s));
    expect(b.id).toBe(ghostId(s));
    expect(ops()).toEqual(["HEAD", "PUT"]);
    expect(fake.keys(bucket)).toHaveLength(1);
    expect(await store.add(s)).toEqual({ id: ghostId(s), created: false }); // and a later re-send is as before: known, no storage call
    expect(ops()).toEqual(["HEAD", "PUT"]);
  });

  it("twenty identical adds at once: still one PUT", async () => {
    const store = tigrisFor(fake, bucket);
    const res = await Promise.all(Array.from({ length: 20 }, () => store.add(snaps[2])));
    expect(res.filter((r) => r.created)).toHaveLength(1);
    expect(ops().filter((o) => o === "PUT")).toHaveLength(1);
    expect(ops().filter((o) => o === "HEAD")).toHaveLength(1);
  });

  it("different ghosts do not wait for each other", async () => {
    const store = tigrisFor(fake, bucket);
    const res = await Promise.all([store.add(snaps[1]), store.add(snaps[2]), store.add(snaps[3])]);
    expect(res.every((r) => r.created)).toBe(true);
    expect(ops().filter((o) => o === "PUT")).toHaveLength(3);
  });

  it("if the first add fails (storage down) the waiting one tries for itself and stores the ghost", async () => {
    const store = tigrisFor(fake, bucket);
    const s = snaps[5];
    fake.failNext(3, 503, "PUT"); // the first PUT fails after its retries
    const [first, second] = await Promise.allSettled([store.add(s), store.add(s)]);
    expect(first.status).toBe("rejected");
    expect((first as PromiseRejectedResult).reason).toBeInstanceOf(StorageError);
    expect(second.status).toBe("fulfilled");
    expect((second as PromiseFulfilledResult<{ created: boolean }>).value.created).toBe(true);
    expect(fake.keys(bucket)).toHaveLength(1);
  });

  it("an add found already stored by another machine is a 200 for both, with no PUT", async () => {
    const other = tigrisFor(fake, bucket);
    await other.add(snaps[6]);
    fake.requests.length = 0;
    const store = tigrisFor(fake, bucket);
    const [a, b] = await Promise.all([store.add(snaps[6]), store.add(snaps[6])]);
    expect([a.created, b.created]).toEqual([false, false]);
    expect(ops()).toEqual(["HEAD"]);
  });
});
