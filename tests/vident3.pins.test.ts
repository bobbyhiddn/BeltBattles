// VERIFY-IDENT2 (REQ-BFG-122) step 4, items a, b, g, i: pins BY LITERAL. The previous re-check's lesson L: a test that builds its probe from a constant follows the
// constant, so a changed bound passes it. Every number below is typed here as BRIEF-IDENT2 / IDENT2-REPORT / docs/ASYNC.md state it. Nothing runs; it only reads exports.
import { describe, expect, it } from "vitest";
import { HISTORY_KEY, HISTORY_RECORD_BUDGET, HISTORY_V } from "../src/game/history";
import {
  HISTORY_AHEAD_MS, HISTORY_BODY_MAX_BYTES, HISTORY_EARLIEST_AT, HISTORY_END_SUFFIX, HISTORY_ENTRY_MAX_BYTES, HISTORY_LOCAL_MAX, HISTORY_MAX_DAYS, HISTORY_MAX_DUSKS,
  HISTORY_MAX_LIVES, HISTORY_MAX_WINS, HISTORY_PLAYER_MAX, newestFirst,
} from "../src/net/historyWire";
import { HISTORY_DOWNLOADS_PER_SYNC, HISTORY_SYNC_INTERVAL_MS, HISTORY_UPLOADS_PER_TRIGGER } from "../src/net/historySync";
import {
  DELETE_PREFIX, HISTORY_GET_PREFIX, HISTORY_PREFIX, LINK_CODE_PREFIX, LINK_REDEEM_PREFIX, LINK_STEAM_PREFIX, PROFILE_GET_PREFIX, PROFILE_PREFIX, UPLOAD_PREFIX,
} from "../src/net/identity";
import { HISTORY_DIR, HISTORY_KEY as OBJECT_KEY, nameOf, parseName } from "../server/historyStore";
import {
  TOMBSTONE_ABSENT_LOADS, TOMBSTONE_FULL_READ_MS, TOMBSTONE_READS_IN_FLIGHT, TOMBSTONE_REREADS, TOMBSTONE_REREAD_PAUSE_MS, TOMBSTONE_WAIT_MS,
} from "../server/links";

describe("4i. the device's storage key", () => {
  it("is the literal beltbattles.history.v1, version 1 (a rename would orphan every device's list; no other test pins the string)", () => {
    expect(HISTORY_KEY).toBe("beltbattles.history.v1");
    expect(HISTORY_V).toBe(1);
  });
});

describe("4a/4i. every bound, as the brief and the report state it", () => {
  it("entry 16,000 bytes; body 16,384; server cap 200; device cap 50; records 256 KB; ceilings of 99; the endless suffix", () => {
    expect(HISTORY_ENTRY_MAX_BYTES).toBe(16000);
    expect(HISTORY_BODY_MAX_BYTES).toBe(16384);
    expect(HISTORY_PLAYER_MAX).toBe(200);
    expect(HISTORY_LOCAL_MAX).toBe(50);
    expect(HISTORY_RECORD_BUDGET).toBe(262144);
    expect([HISTORY_MAX_WINS, HISTORY_MAX_DAYS, HISTORY_MAX_DUSKS, HISTORY_MAX_LIVES]).toEqual([99, 99, 99, 99]);
    expect(HISTORY_END_SUFFIX).toBe("_endless");
  });
  it("finishedAt: not before 2026-01-01T00:00:00Z (1,767,225,600,000 ms) and at most the server's clock + 10 minutes", () => {
    expect(HISTORY_EARLIEST_AT).toBe(new Date("2026-01-01T00:00:00Z").getTime());
    expect(HISTORY_EARLIEST_AT).toBe(1767225600000);
    expect(HISTORY_AHEAD_MS).toBe(600000);
  });
  it("sync: 10 up a trigger, 10 down a sync, the startup sync at most hourly", () => {
    expect(HISTORY_UPLOADS_PER_TRIGGER).toBe(10);
    expect(HISTORY_DOWNLOADS_PER_SYNC).toBe(10);
    expect(HISTORY_SYNC_INTERVAL_MS).toBe(3600000);
  });
});

describe("4g. fix A and the tombstone constants, as docs/ASYNC.md states them", () => {
  it("3 re-reads, 100 ms apart, 3 failed first loads; 8 requests in flight; 250 ms wait; 6 h full read", () => {
    expect(TOMBSTONE_REREADS).toBe(3);
    expect(TOMBSTONE_REREAD_PAUSE_MS).toBe(100);
    expect(TOMBSTONE_ABSENT_LOADS).toBe(3);
    expect(TOMBSTONE_READS_IN_FLIGHT).toBe(8); // dropHistory's "at most 8 in flight" is this constant
    expect(TOMBSTONE_WAIT_MS).toBe(250);
    expect(TOMBSTONE_FULL_READ_MS).toBe(21600000);
  });
});

describe("4a. the nine signing domains, byte for byte; none begins another", () => {
  const D: [string, string][] = [
    [UPLOAD_PREFIX, "bb-ghost-upload-1\n"], [PROFILE_PREFIX, "bb-profile-1\n"], [LINK_CODE_PREFIX, "bb-link-code-1\n"], [LINK_REDEEM_PREFIX, "bb-link-redeem-1\n"],
    [LINK_STEAM_PREFIX, "bb-link-steam-1\n"], [PROFILE_GET_PREFIX, "bb-profile-get-1\n"], [DELETE_PREFIX, "bb-delete-1\n"],
    [HISTORY_PREFIX, "bb-history-1\n"], [HISTORY_GET_PREFIX, "bb-history-get-1\n"],
  ];
  it("each is the literal", () => {
    for (const [got, want] of D) expect(got).toBe(want);
    expect(new Set(D.map(([g]) => g)).size).toBe(9);
  });
  it("no domain's bytes begin another's", () => {
    for (const [a] of D) for (const [b] of D) if (a !== b) expect(a.startsWith(b)).toBe(false);
  });
});

describe("4b. the object name and the listing order", () => {
  it("history/<P>/<9999999999999 - finishedAt, 13 digits>-<id>.json, by literal", () => {
    expect(HISTORY_DIR).toBe("history");
    expect(nameOf({ finishedAt: 1767225600000, id: "abc" })).toBe("8232774399999-abc.json");
    expect(nameOf({ finishedAt: 0, id: "x" })).toBe("9999999999999-x.json");
    expect(nameOf({ finishedAt: 9999999999999, id: "x" })).toBe("0000000000000-x.json");
    expect(parseName("8232774399999-abc.json")).toEqual({ finishedAt: 1767225600000, id: "abc" });
    expect(parseName("8232774399999-a-b_C9.json")).toEqual({ finishedAt: 1767225600000, id: "a-b_C9" });
  });
  it("nameOf refuses a finishedAt it cannot write", () => {
    for (const t of [-1, 1.5, Number.NaN, 10000000000000, Number.MAX_SAFE_INTEGER + 2]) expect(() => nameOf({ finishedAt: t, id: "x" })).toThrow();
  });
  it("parseName refuses every name the store does not write (strays are not entries)", () => {
    for (const n of [
      "8232774399999-abc.json.tmp", "823277439999-abc.json", "82327743999999-abc.json", "8232774399999-.json", "8232774399999-a b.json", "x8232774399999-abc.json",
      "8232774399999-abc.JSON", "8232774399999abc.json", "8232774399999-abc.json ", " 8232774399999-abc.json", "-8232774399999-abc.json", "8232774399999-" + "a".repeat(65) + ".json",
      "8232774399999-abc.json/", "8232774399999-a.b.json", "", ".json", "README",
    ]) expect(parseName(n), n).toBeNull();
    expect(parseName("8232774399999-" + "a".repeat(64) + ".json")).not.toBeNull();
  });
  it("the object key pattern is anchored to history/<P>/<name>, nothing else", () => {
    expect(OBJECT_KEY.test("history/p1/8232774399999-abc.json")).toBe(true);
    for (const k of ["history/p1/8232774399999-abc.json.tmp", "history//8232774399999-abc.json", "history/p1/q/8232774399999-abc.json", "histories/p1/8232774399999-abc.json",
      "xhistory/p1/8232774399999-abc.json", "history/" + "p".repeat(65) + "/8232774399999-abc.json", "profiles/p1.json"]) expect(OBJECT_KEY.test(k), k).toBe(false);
  });
  it("sorting names as strings gives newest first for different times, and newestFirst breaks a tie by id (the order of the server's list)", () => {
    const names = [1767225600000, 1767225700000, 1767225650000].map((t, i) => nameOf({ finishedAt: t, id: `r${i}` }));
    expect([...names].sort()).toEqual([names[1], names[2], names[0]]);
    const a = { finishedAt: 5, id: "a" }, b = { finishedAt: 5, id: "b" }, c = { finishedAt: 6, id: "z" };
    expect([b, a, c].sort(newestFirst)).toEqual([c, a, b]);
    expect(newestFirst(a, a)).toBe(0);
  });
});
