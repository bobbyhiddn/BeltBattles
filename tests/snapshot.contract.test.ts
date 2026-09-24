// Snapshot contract (0.6.0 groundwork merge): main's local check (src/game/ghostSnapshot.ts,
// isSnapshot) and the async groundwork's (src/net/snapshot.ts, checkSnapshot) must agree on the
// keys, the version, the ID pattern, and the verdict on every sample-pool snapshot and on
// out-of-bounds variants of each. Neither file is edited to make them agree: a mismatch is
// reported as OPEN (ref/gmerge/contract.test.ts.txt, SNAPSHOT and SNAPBOUNDS, is the full check).
import { describe, expect, it } from "vitest";
import * as local from "../src/game/ghostSnapshot";
import * as net from "../src/net/snapshot";
import { START_LIVES } from "../src/sim/content";
import { generateSamplePool } from "../tools/samplePool";

const POOL = generateSamplePool();

function netOk(s: unknown): boolean {
  try {
    net.checkSnapshot(s);
    return true;
  } catch {
    return false;
  }
}

/** Out-of-bounds variants of one snapshot, by name. */
function variants(s: net.GhostSnapshot): [string, unknown][] {
  const { runId: _gone, ...noRunId } = s;
  return [
    ["day 0", { ...s, day: 0, wins: 0 }],
    ["day 11", { ...s, day: 11, wins: 0 }],
    ["lives -1", { ...s, lives: -1 }],
    ["lives 0", { ...s, lives: 0 }],
    [`lives START_LIVES + 1 = ${START_LIVES + 1}`, { ...s, lives: START_LIVES + 1 }],
    ["wins = day", { ...s, wins: s.day }],
    ["wins above day", { ...s, wins: s.day + 1 }],
    ["malformed runId", { ...s, runId: "bad id!" }],
    ["malformed playerId", { ...s, playerId: "a@b.c" }],
    ["no runId", noRunId],
    ["extra key", { ...s, extra: 1 }],
    ["v 2", { ...s, v: 2 }],
  ];
}

describe("snapshot contract: src/game/ghostSnapshot.ts agrees with src/net/snapshot.ts", () => {
  it("the same keys in the canonical order, the same version, ID pattern and bounds", () => {
    expect(Object.keys(net.checkSnapshot(POOL[0]))).toEqual([...local.SNAPSHOT_KEYS]);
    expect(local.SNAPSHOT_VERSION).toBe(net.SNAPSHOT_VERSION);
    expect(String(local.ID_PATTERN)).toBe(String(net.ID_PATTERN));
    expect([local.MAX_DAY, local.MAX_LIVES]).toEqual([net.MAX_DAY, net.MAX_LIVES]);
    expect(START_LIVES).toBeLessThanOrEqual(net.MAX_LIVES); // a full-lives record fits both
  });

  it("both accept every sample-pool snapshot (both heroes, days 1-10, lives 1..START_LIVES)", () => {
    expect(POOL).toHaveLength(40);
    for (const s of POOL) {
      expect(local.isSnapshot(s), `local ${s.hero} d${s.day}`).toBe(true);
      expect(netOk(s), `net ${s.hero} d${s.day}`).toBe(true);
      expect(s.lives, `${s.hero} d${s.day}`).toBeLessThanOrEqual(START_LIVES);
    }
  });

  it("the same verdict on every out-of-bounds variant of every sample-pool snapshot", () => {
    const mismatch: string[] = [];
    let bothReject = 0;
    for (const s of POOL) {
      for (const [name, v] of variants(s)) {
        const a = local.isSnapshot(v), b = netOk(v);
        if (a !== b) mismatch.push(`${s.hero} d${s.day} ${name}: local ${a}, net ${b}`);
        else if (!a) bothReject++;
      }
    }
    expect(mismatch).toEqual([]);
    expect(bothReject).toBeGreaterThan(0);
  });
});
