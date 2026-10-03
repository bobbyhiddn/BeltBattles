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
    ["v 3", { ...s, v: 3 }], // 0.6.1a: v 2 is the current version (was the out-of-bounds "v 2")
  ];
}

/** 0.6.1a: `stars` on the first item and the first mod, in a v1 or a v2 snapshot. */
function starred(s: net.GhostSnapshot, v: 1 | 2, stars: unknown): unknown {
  const b = JSON.parse(JSON.stringify(s.build)) as net.GhostSnapshot["build"] & { items: Record<string, unknown>[]; mods: Record<string, unknown>[] };
  b.items[0].stars = stars;
  if (b.mods[0]) b.mods[0].stars = stars;
  else b.items[b.items.length - 1].stars = stars;
  return { ...s, v, build: b };
}

describe("snapshot contract: src/game/ghostSnapshot.ts agrees with src/net/snapshot.ts", () => {
  it("the same keys in the canonical order, the same version, ID pattern and bounds", () => {
    expect(Object.keys(net.checkSnapshot(POOL[0]))).toEqual([...local.SNAPSHOT_KEYS]);
    expect(local.SNAPSHOT_VERSION).toBe(net.SNAPSHOT_VERSION);
    expect(String(local.ID_PATTERN)).toBe(String(net.ID_PATTERN));
    expect([local.MAX_DAY, local.MAX_LIVES]).toEqual([net.MAX_DAY, net.MAX_LIVES]);
    expect(START_LIVES).toBeLessThanOrEqual(net.MAX_LIVES); // a full-lives record fits both
  });

  it("both accept every sample-pool snapshot (the four heroes, days 1-10, lives 1..START_LIVES)", () => {
    expect(POOL).toHaveLength(120); // 0.7.0a D5: the 40 sample ghosts and the 20 floor ghosts; 0.8.0 RC: and the 60 race ghosts (was 60)
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

  it("0.6.1a stars: v2 takes 1..3 on items and mods, v1 takes none; 0, 4, 1.5, \"2\" and null are rejected; v1 loads", () => {
    expect([local.SNAPSHOT_VERSION, net.SNAPSHOT_VERSION]).toEqual([2, 2]);
    const cases: [string, 1 | 2, unknown, boolean][] = [
      ["v2 stars 1", 2, 1, true], ["v2 stars 2", 2, 2, true], ["v2 stars 3", 2, 3, true],
      ["v2 stars 0", 2, 0, false], ["v2 stars 4", 2, 4, false], ["v2 stars 1.5", 2, 1.5, false],
      ["v2 stars \"2\"", 2, "2", false], ["v2 stars null", 2, null, false],
      ["v1 stars 1", 1, 1, false], ["v1 stars 2", 1, 2, false],
    ];
    const bad: string[] = [];
    // v1 still loads a star-free deck. Since the 0.6.1 flip sample decks (stand-in pool v2) may carry
    // merge stars, which only v2 may hold: both sides must then refuse the v1 copy.
    const starry = (s: net.GhostSnapshot): boolean => [...s.build.items, ...s.build.mods].some((p) => p.stars !== undefined);
    expect(POOL.filter((s) => !starry(s)).length).toBeGreaterThan(0);
    expect(POOL.filter((s) => starry(s)).length).toBeGreaterThan(0);
    for (const s of POOL) {
      // 0.6.2 BELTSIDE: a v1 copy loads on both sides unless a rig carries `rot`, which only v2 allows; since the 0.6.1
      // flip it may not carry merge stars either. beltside-062-on-061: both rules at once, on each side separately
      // (BELTSIDE's form, which implies the flip's `local && net`), and a starred v1 copy is refused on both sides.
      const rot = s.build.items.some((p) => p.rot !== undefined);
      // step 5: a caravan-bound pool deck (the 0.6.2 regen) may carry Build.turrets or a route join, which only v2 holds
      // (0.6.2j: v1 refuses both)
      const v2only = s.build.turrets !== undefined || s.build.routes.some((r) => r.join !== undefined);
      const v1 = !rot && !starry(s) && !v2only;
      expect([local.isSnapshot({ ...s, v: 1 }), netOk({ ...s, v: 1 })], `v1 ${s.hero} d${s.day}`).toEqual([v1, v1]);
      if (starry(s)) expect(local.isSnapshot({ ...s, v: 1 }) || netOk({ ...s, v: 1 }), `v1 ${s.hero} d${s.day} starred`).toBe(false);
      for (const [name, v, stars, ok] of cases) {
        const x = starred(s, v, stars);
        const a = local.isSnapshot(x), b = netOk(x);
        if (a !== ok || b !== ok) bad.push(`${s.hero} d${s.day} ${name}: local ${a}, net ${b}, want ${ok}`);
      }
      const two = starred(s, 2, 2) as net.GhostSnapshot;
      expect(net.decodeSnapshot(net.encodeSnapshot(two))).toEqual(two); // the v2 round trip keeps stars
    }
    // v1 loads: the 0.6.2 regen's sample decks may all hold a v2-only field (rot, stars, turrets, a join), so a sample
    // deck with those cleared stands in for a star-free v1 deck, on both sides
    const plain = JSON.parse(JSON.stringify(POOL[0])) as net.GhostSnapshot;
    for (const p of plain.build.items) { delete p.stars; delete p.rot; }
    for (const m of plain.build.mods) delete m.stars;
    delete plain.build.turrets;
    for (const r of plain.build.routes) delete r.join;
    expect([local.isSnapshot({ ...plain, v: 1 }), netOk({ ...plain, v: 1 })]).toEqual([true, true]);
    expect(bad).toEqual([]);
  });
});
