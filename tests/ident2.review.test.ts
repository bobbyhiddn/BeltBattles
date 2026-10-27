// IDENT-2 (REQ-BFG-122 clause 4): the findings of the independent static review of the change, each with its test. A body nested thousands deep is a
// 400, not a 500 and a stack in the log; a PUT that answers 200 with no id from the server is no upload, and a proxy's 4xx is no refusal of the entry;
// a Steam link on the player's first device counts as a link; a DELETE that lands while a write is in flight leaves nothing behind; a downloaded
// entry is not refused for a device clock that runs behind; a nearly full storage still keeps the run, without its records.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readHistory, recordRunEnd, resetHistoryWarning, unsentFor } from "../src/game/history";
import { getHistoryEntry } from "../src/net/historyClient";
import { historyIdle, resetHistorySync, syncHistory } from "../src/net/historySync";
import { linkSteam } from "../src/net/linkClient";
import { readLink, writeLink } from "../src/net/linkState";
import { closeRigs, deleteMe, fakeSteam, freshIdentity, type Kind } from "./identRig";
import { device, entryOf, mem, playedRun } from "./ident2Local";
import { NOW, entryFor, historyObjects, historyOf, openHistoryRig, putBody, putEntry } from "./ident2Rig";

afterAll(closeRigs);
beforeEach(() => {
  resetHistorySync();
  resetHistoryWarning();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(["jsonl", "tigris"] as Kind[])("review findings on the server (%s)", (kind) => {
  it("a body nested thousands deep (under 16 KB) is a plain 400: no 500, no stack in the log", async () => {
    const rig = await openHistoryRig(kind);
    const A = await freshIdentity();
    const arrays = await putBody(rig, A, `{"at":${NOW},"entry":${"[".repeat(7000) + "]".repeat(7000)}}`); // JSON.stringify of it throws a RangeError
    expect(arrays.status, arrays.text).toBe(400);
    expect(arrays.json?.error).toContain("{\"at\",\"entry\"}");
    const objects = await putBody(rig, A, `{"at":${NOW},"entry":${`{"a":`.repeat(2500) + "1" + "}".repeat(2500)}}`);
    expect(objects.status, objects.text).toBe(400);
    expect(rig.log.filter((l) => l.startsWith("error:"))).toEqual([]);
    expect(historyObjects(rig, A.playerId)).toEqual([]);
    // an honest PUT after them still works
    expect((await putEntry(rig, A, entryFor("after-1-1"))).status).toBe(201);
  });

  it("a DELETE that lands while a write is in flight leaves nothing behind: the write is undone and answers 410", async () => {
    const rig = await openHistoryRig(kind);
    const A = await freshIdentity();
    expect((await putEntry(rig, A, entryFor("before-1-1"))).status).toBe(201);
    const store = historyOf(rig);
    const put = store.put.bind(store);
    // the DELETE runs after the route has passed its checks and before its write lands (the route's tombstone set knows it at once)
    store.put = async (...a: Parameters<typeof put>) => {
      await deleteMe(rig, A);
      return put(...a);
    };
    const r = await putEntry(rig, A, entryFor("race-1-1"));
    store.put = put;
    expect([r.status, r.json?.error]).toEqual([410, "this player was deleted"]);
    expect(historyObjects(rig, A.playerId), "the object the late write made is gone, and so is the one before it").toEqual([]);
    expect((await putEntry(rig, A, entryFor("later-1-1"))).status).toBe(410);
    expect(historyObjects(rig, A.playerId)).toEqual([]);
  });
});

describe("review findings on the device", () => {
  const BASE = "http://review.example";
  const reply = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;

  it("an answer that is not the server's is no upload: a 200 page, or a 4xx with no words of the server's, keeps the entry unsent", async () => {
    const A = await device(0);
    writeLink({ v: 1, player: A.id.playerId, key: A.id.keyId!, at: NOW }, A.store);
    recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "px-1-1", records: false }), { store: A.store, now: () => NOW - 5000 });
    for (const [status, body] of [[200, "<html>captive portal</html>"], [200, "{}"], [201, '{"id":"another-1-1"}'], [413, "<h1>413</h1>"], [400, ""], [422, "nope"], [409, "<html>"]] as const) {
      resetHistorySync();
      const r = await syncHistory(BASE, A.id, { store: A.store, now: () => NOW, fetch: reply(status, body) }, { download: false });
      expect(r, `${status} ${body}`).toMatchObject({ status: "failed", sent: 0, refused: 0 });
      expect(unsentFor(A.id.playerId, A.store).map((e) => e.id), `${status} ${body}`).toEqual(["px-1-1"]);
    }
    // the server's own words make a refusal final, and its own 200 naming the entry makes it sent
    resetHistorySync();
    expect(await syncHistory(BASE, A.id, { store: A.store, now: () => NOW, fetch: reply(422, '{"error":"entry.lives: 100 is over the ceiling 99"}') }, { download: false })).toMatchObject({ status: "ok", refused: 1 });
    expect(unsentFor(A.id.playerId, A.store)).toEqual([]);
  });

  it("a Steam link that names the first device's own player counts as a link: the device gets its record, and its history goes up", async () => {
    const rig = await openHistoryRig("jsonl", { steam: fakeSteam({ ab12: "76561198000000001" }) });
    const A = await device(0);
    recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "st-1-1", records: false }), { store: A.store, now: () => NOW - 5000 });
    expect(readLink(A.store)).toBeNull();
    const r = await linkSteam(rig.base, A.id, "ab12", "myidentity", 480, { now: () => rig.clock.now, store: A.store, mirror: null });
    expect(r).toEqual({ ok: true, player: A.id.playerId });
    expect(readLink(A.store)).toMatchObject({ v: 1, player: A.id.keyId, key: A.id.keyId });
    await historyIdle();
    expect(historyObjects(rig, A.id.playerId)).toHaveLength(1);
    expect(unsentFor(A.id.playerId, A.store)).toEqual([]);
  });

  it("a downloaded entry dated hours ahead of the device's clock is kept (the device's clock may run behind); one a day ahead is not", async () => {
    const A = await device(0);
    const ask = (finishedAt: number) => getHistoryEntry(BASE, A.id, "far-1-1", {
      now: () => NOW, fetch: reply(200, JSON.stringify({ entry: entryOf("far-1-1", {}, finishedAt) })),
    });
    expect((await ask(NOW + 5 * 3_600_000)).ok).toBe(true);
    expect((await ask(NOW + 2 * 86_400_000)).ok).toBe(false);
  });

  it("a nearly full storage still keeps the run: the write that does not fit is tried again without the records (the rows and the summary stay)", () => {
    const run = playedRun({ pattern: "WWWWWWWWWW", end: "won", runId: "q-1-1" });
    const store = mem({ max: 6000 }); // the entry with its records is about 16 KB; without them about 1 KB
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(recordRunEnd(run, { store, now: () => NOW })).toEqual(["q-1-1"]);
    const [e] = readHistory(store).state.entries.map((l) => l.entry);
    expect(e).toMatchObject({ id: "q-1-1", outcome: "won", wins: 10 });
    expect(e.dusks).toHaveLength(10);
    expect(e.dusks.every((d) => d.record === undefined)).toBe(true);
    // and a storage that takes nothing keeps nothing, without a throw
    expect(recordRunEnd(playedRun({ pattern: "WL", runId: "q-2-1" }), { store: mem({ full: true }), now: () => NOW })).toEqual([]);
  });
});
