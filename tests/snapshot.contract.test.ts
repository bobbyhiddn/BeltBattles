// Snapshot contract (0.6.0 groundwork merge): main's local check (src/game/ghostSnapshot.ts,
// isSnapshot) and the async groundwork's (src/net/snapshot.ts, checkSnapshot) must agree on the
// keys, the version, the ID pattern, and the verdict on every sample-pool snapshot and on
// out-of-bounds variants of each. Neither file is edited to make them agree: a mismatch is
// reported as OPEN (ref/gmerge/contract.test.ts.txt, SNAPSHOT and SNAPBOUNDS, is the full check).
import { describe, expect, it } from "vitest";
import * as local from "../src/game/ghostSnapshot";
import * as net from "../src/net/snapshot";
import { START_LIVES } from "../src/sim/content";
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): the pool's records are on 10 hearts
import { LONG_RUN_MAX_DAY } from "../src/sim/longRun"; // BUMP-1D (LONG_RUN ships on): the day bound of the out-of-bounds variant
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
    // BUMP-1D (LONG_RUN ships on): the pool is bb-0.11.0's, a long run's, whose day bound is LONG_RUN_MAX_DAY (25; snapshot.ts maxDayFor),
    // not 10: day 11 is a day now (was "day 11", the 10-day rules' out-of-bounds day), so the variant is the day just past the bound
    [`day ${LONG_RUN_MAX_DAY + 1}`, { ...s, day: LONG_RUN_MAX_DAY + 1, wins: 0 }],
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
    // HULL-ON (the flip, PICK): with PICK on the seed step grades every seed ghost (tools/samplePool.ts generateSamplePool:
    // `grade`, net.GRADE_FIELD, v3, written last of all), so POOL[0]'s keys are SNAPSHOT_KEYS and then the grade (was
    // SNAPSHOT_KEYS alone); its ungraded copy (as with PICK off) has SNAPSHOT_KEYS exactly
    // S8 run 3 (re-pinned by cause the pools, test only; RULING-S8-R5 section 3 item 2): the stand-in pool regenerated once
    // with every switch on (P1 83c039d) carries each deck's road log (its tuple's seventh element), so POOL[0] (furnace d1
    // sample-run-furnace-0) carries it too, as v3's `road` (net.ROAD_FIELD, after createdAt and before the grade). Was
    // [...SNAPSHOT_KEYS, grade] and, ungraded, SNAPSHOT_KEYS exactly (green at 7cc41c6)
    // SOFT-1: the seed pool softened (REQ-BFG-092; tools/samplePool.ts SOFT1_PICKS): POOL[0]'s deck is a par-field run's dusk
    // deck now, so it carries that run's seed (v3's `seed`, after createdAt and before the road log), as the race ghosts do.
    // Was [...SNAPSHOT_KEYS, road, grade] and, ungraded, [...SNAPSHOT_KEYS, road] (green at c0182e7)
    // BUMP-1D: the seed pool is the long run's now (bb-0.11.0): every ghost states its `losses` (v3's field, after the seed and before the
    // road log). Was [...SNAPSHOT_KEYS, "seed", road, grade] and, ungraded, [...SNAPSHOT_KEYS, "seed", road]
    expect(Object.keys(net.checkSnapshot(POOL[0]))).toEqual([...local.SNAPSHOT_KEYS, "seed", "losses", net.ROAD_FIELD, net.GRADE_FIELD]);
    const { grade: _grade, ...ungraded } = POOL[0];
    expect(Object.keys(net.checkSnapshot(ungraded))).toEqual([...local.SNAPSHOT_KEYS, "seed", "losses", net.ROAD_FIELD]);
    expect(local.SNAPSHOT_VERSION).toBe(net.SNAPSHOT_VERSION);
    expect(String(local.ID_PATTERN)).toBe(String(net.ID_PATTERN));
    expect([local.MAX_DAY, local.MAX_LIVES]).toEqual([net.MAX_DAY, net.MAX_LIVES]);
    expect(START_LIVES).toBeLessThanOrEqual(net.MAX_LIVES); // a full-lives record fits both
  });

  it("both accept every sample-pool snapshot (the four heroes, days 1-10, lives 1..START_LIVES)", () => {
    // BUMP-1D: 192 = 4 heroes x days 1-16 x 3 variants (the long run's pool: SOFT-1's two picks and the hero's floor ghost a day), was 120 (days 1-10)
    expect(POOL).toHaveLength(192); // 0.7.0a D5: the 40 sample ghosts and the 20 floor ghosts; 0.8.0 RC: and the 60 race ghosts (was 60)
    for (const s of POOL) {
      expect(local.isSnapshot(s), `local ${s.hero} d${s.day}`).toBe(true);
      expect(netOk(s), `net ${s.hero} d${s.day}`).toBe(true);
      // HULL-ON (the flip, HEARTS): START_LIVES (5) -> HEARTS_START (10): with HEARTS on the pool draws its records on the
      // hearts scale (samplePool.ts drawnLabel), which both checks bound by livesCapFor (10 under bb-0.10.0)
      expect(s.lives, `${s.hero} d${s.day}`).toBeLessThanOrEqual(HEARTS_START);
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
    for (const s3 of POOL) {
      // FLIP-X2: the sample decks are v3 and hold their day's runes (BOT_RUNES), which a v1 or v2 snapshot refuses
      // ("snapshot.build.runes: not allowed in a v1 snapshot"), and a race ghost carries its run seed, also v3-only
      // ("snapshot.seed: not allowed in a v1 snapshot", foundry d1), so the v1 and v2 rows below take a copy without the
      // runes and the seed (was the snapshot as it is: v1 furnace d1 and foundry d1 refused on both sides, [false, false]
      // for [true, true])
      // AZ-BUMP (the flip, NPC_DAY; REVIEW-PARAZ N3): and a seed ghost carries its run's road log (`road`, v3 only: a race
      // ghost's v2 round trip below threw "snapshot.road: not allowed in a v2 snapshot"), so the copy drops it too
      // HULL-ON (the flip, PICK): and a seed ghost's grade (v3 only: "snapshot.grade: not allowed in a v1 snapshot", so v1
      // furnace d1 was [false, false] for [true, true]), so the copy drops it too
      const { runes: _runes, ...runeless } = s3.build;
      // BUMP-1D: and its `losses` (v3 only, live under a long run's rules: "snapshot.losses: not allowed in a v1 snapshot", so v1 furnace d1
      // was [false, false] for [true, true]), so the copy drops it too
      const { seed: _seed, road: _road, grade: _grade, losses: _losses, ...seedless } = s3;
      const s: net.GhostSnapshot = { ...seedless, build: runeless };
      // 0.6.2 BELTSIDE: a v1 copy loads on both sides unless a rig carries `rot`, which only v2 allows; since the 0.6.1
      // flip it may not carry merge stars either. beltside-062-on-061: both rules at once, on each side separately
      // (BELTSIDE's form, which implies the flip's `local && net`), and a starred v1 copy is refused on both sides.
      const rot = s.build.items.some((p) => p.rot !== undefined);
      // step 5: a caravan-bound pool deck (the 0.6.2 regen) may carry Build.turrets or a route join, which only v2 holds
      // (0.6.2j: v1 refuses both)
      // bb-0.8.3 (REQ-BFG-043 D10; the seed pool regenerated in BELTS run 5): or the gold upgrades' levels (v2 only)
      const v2only = s.build.turrets !== undefined || s.build.routes.some((r) => r.join !== undefined) || s.build.upgrades !== undefined;
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
    delete plain.build.upgrades; // bb-0.8.3: the levels are v2-only too
    for (const r of plain.build.routes) delete r.join;
    delete plain.build.runes; // FLIP-X2: the runes are v3-only (was kept: POOL[0], furnace d1, holds TAR BARREL)
    delete plain.seed; // FLIP-X2: so is a race ghost's run seed (was kept)
    delete plain.road; // AZ-BUMP (the flip, NPC_DAY): and a seed ghost's road log (NPC_DAY on; v3 only)
    delete plain.grade; // HULL-ON (the flip, PICK): and its grade (PICK on; v3 only)
    delete plain.losses; // BUMP-1D (LONG_RUN ships on): and the dusks it lost (v3 only, long-run rules)
    expect([local.isSnapshot({ ...plain, v: 1 }), netOk({ ...plain, v: 1 })]).toEqual([true, true]);
    expect(bad).toEqual([]);
  });
});
