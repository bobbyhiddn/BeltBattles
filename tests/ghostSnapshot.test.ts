// 0.6.0b: GhostSnapshot v1 (src/game/ghostSnapshot.ts): the snapshot ghostOf builds, the anonymous
// player id, the 0.6.0a pool migration, pickGhost's wins-then-lives ranking and the dusk stand-in.
import { describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import {
  ID_PATTERN, PLAYER_KEY, SNAPSHOT_KEYS, SNAPSHOT_VERSION, isSnapshot, migrateSnapshot, newPlayerId, playerId,
} from "../src/game/ghostSnapshot";
import { GHOST_KEY, loadPool, pickGhost, saveGhost, standInFoe, type GhostSnapshot } from "../src/game/ghosts";
import { finishDay, ghostOf, startDusk } from "../src/game/day";
import { newRun } from "../src/game/run";
import { startingBuild } from "../src/sim/ai";
import { RIVALS, deckCost, maxGoldByDay, standInGhost } from "../src/sim/rivals";
import { standInPick } from "../src/sim/standInPool";
import { RULES_VERSION, RUN_DAYS, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import type { SideStats } from "../src/sim/battle";
import { pickLoss } from "./beltside.helpers";

const STATS = { damage: 0, shots: 0, firstShot: -1, idle: 0, turretTime: 0, jams: 0, burnDealt: 0, maxQueue: 0 } as unknown as SideStats;
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const KEYS = [...SNAPSHOT_KEYS].sort();
const keysOf = (o: object): string[] => Object.keys(o).sort();

/** A v1 pool ghost for day 4, 2 wins and 4 lives going into dusk. */
const v1 = (o: Partial<GhostSnapshot> = {}): GhostSnapshot => ({
  v: 1, rules: RULES_VERSION, hero: "weaver", day: 4, wins: 2, lives: 4,
  build: startingBuild("weaver", 1), runId: "other", playerId: "p-other", createdAt: 0, ...o,
});

/** A 0.6.0a pool entry (rulesVersion, losses, savedAt; no playerId). */
interface Old060a {
  v: 1; rulesVersion: string; hero: HeroId; day: number; wins: number; losses: number; lives: number;
  build: Build; runId: string; savedAt: number;
}
const old = (o: Partial<Old060a> = {}): Old060a => ({
  v: 1, rulesVersion: RULES_VERSION, hero: "weaver", day: 3, wins: 1, losses: 1, lives: 4,
  build: startingBuild("weaver", 1), runId: "a1", savedAt: 1000, ...o,
});

describe("ghostOf: the player's own v1 snapshot", () => {
  it("has exactly the SNAPSHOT_KEYS, v 1, RULES_VERSION, and the wins and lives going INTO dusk", () => {
    const run = newRun("weaver", 4242, "run-a");
    startDusk(run, []);
    finishDay(run, 0, 30, STATS, STATS); // day 1: a win
    startDusk(run, []);
    finishDay(run, 1, 30, STATS, STATS); // day 2: a loss
    startDusk(run, []);
    const wins = run.wins, lives = run.lives;
    expect([run.day, wins, lives]).toEqual([3, 1, 4]);
    const g = ghostOf(run, 1234.9, "p-me");
    expect(keysOf(g)).toEqual(KEYS);
    expect(SNAPSHOT_VERSION).toBe(2); // 0.6.1a: ghostOf writes v2 (stars ride in the build)
    expect([g.v, g.rules]).toEqual([2, RULES_VERSION]);
    expect([g.hero, g.day, g.wins, g.lives, g.runId, g.playerId, g.createdAt]).toEqual(["weaver", 3, wins, lives, "run-a", "p-me", 1234]);
    expect(g.build).toEqual(run.build);
    expect(g.build).not.toBe(run.build); // a copy: later refits do not reach the pool
    expect(isSnapshot(g)).toBe(true);
    finishDay(run, 1, 30, STATS, STATS); // tonight's loss does not reach the snapshot
    expect([run.wins, run.lives]).toEqual([1, 3]);
    expect([g.wins, g.lives]).toEqual([wins, lives]);
    const d = ghostOf(run); // default stamp (the clock) and this device's id
    expect(isSnapshot(d)).toBe(true);
    expect(d.playerId).toMatch(ID_PATTERN);
  });

  it("isSnapshot wants exactly the v1 fields, with ids matching ID_PATTERN", () => {
    const g = ghostOf(newRun("furnace", 7, "run-b"), 5, "p-me");
    expect(isSnapshot(g)).toBe(true);
    expect(isSnapshot({ ...g, losses: 0 })).toBe(false); // an extra (0.6.0a) key
    const missing: Record<string, unknown> = { ...g };
    delete missing.playerId;
    expect(isSnapshot(missing)).toBe(false);
    expect(isSnapshot({ ...g, v: 3 })).toBe(false); // 0.6.1a: v 2 is current
    expect(isSnapshot({ ...g, v: 1 })).toBe(true); // and a v1 snapshot (no stars) still loads
    expect(isSnapshot({ ...g, playerId: "not an id!" })).toBe(false);
    expect(isSnapshot({ ...g, runId: "x".repeat(65) })).toBe(false);
  });
});

describe("playerId: the anonymous device id", () => {
  it("is made once, stored under PLAYER_KEY and read back on the next call", () => {
    expect(PLAYER_KEY).toBe("beltbattles.player.v1");
    const st = mem();
    const id = playerId(st);
    expect(id).toMatch(ID_PATTERN);
    expect(st.m.get(PLAYER_KEY)).toBe(id);
    expect(playerId(st)).toBe(id);
    expect([...st.m.keys()]).toEqual([PLAYER_KEY]);
    expect(playerId(mem())).not.toBe(id); // another device (store), another id
  });

  it("a corrupt stored value is replaced by a valid id", () => {
    for (const bad of ["", "has space", "ünï", "x".repeat(65), "a/b", "{}"]) {
      const st = mem();
      st.setItem(PLAYER_KEY, bad);
      const id = playerId(st);
      expect(id).toMatch(ID_PATTERN);
      expect(id).not.toBe(bad);
      expect(st.m.get(PLAYER_KEY)).toBe(id);
      expect(playerId(st)).toBe(id);
    }
  });

  it("newPlayerId: 50 calls, every id matches ID_PATTERN and all are distinct", () => {
    const ids = Array.from({ length: 50 }, () => newPlayerId());
    for (const id of ids) expect(id).toMatch(ID_PATTERN);
    expect(new Set(ids).size).toBe(50);
  });
});

describe("a 0.6.0a pool migrates to v1 on load", () => {
  const olds = [
    old(),
    old({ rulesVersion: "bb-0.5.0", hero: "furnace", build: startingBuild("furnace", 1), day: 5, wins: 3, losses: 1, runId: "a2", savedAt: 2000 }),
    old({ day: 1, wins: 0, losses: 0, lives: 5, runId: "a3", savedAt: 3000 }),
  ];

  it("loadPool: rules = rulesVersion, createdAt = savedAt, this device's playerId, no losses; garbage dropped", () => {
    const st = mem();
    const garbage = { v: 1, rulesVersion: RULES_VERSION, hero: "nobody", day: 2 };
    st.setItem(GHOST_KEY, JSON.stringify([olds[0], garbage, olds[1], olds[2]]));
    const pool = loadPool(st);
    const me = playerId(st);
    expect(me).toMatch(ID_PATTERN);
    expect(st.m.get(PLAYER_KEY)).toBe(me);
    expect(pool.length).toBe(3);
    pool.forEach((g, i) => {
      const o = olds[i];
      expect(isSnapshot(g)).toBe(true);
      expect(keysOf(g)).toEqual(KEYS);
      expect("losses" in g).toBe(false);
      expect([g.rules, g.createdAt, g.playerId]).toEqual([o.rulesVersion, o.savedAt, me]);
      expect([g.hero, g.day, g.wins, g.lives, g.runId]).toEqual([o.hero, o.day, o.wins, o.lives, o.runId]);
      expect(g.build).toEqual(o.build);
    });
    // saveGhost writes the whole pool back as v1: the 3 migrated entries and the new one
    const fresh = ghostOf(newRun("furnace", 9, "new-run"), 4000, me);
    saveGhost(fresh, st);
    const stored = JSON.parse(st.m.get(GHOST_KEY)!) as unknown[];
    expect(stored.length).toBe(4);
    for (const e of stored) expect(isSnapshot(e)).toBe(true);
    expect(stored).toEqual([...pool, fresh]);
    expect(loadPool(st)).toEqual(stored);
  });

  it("migrateSnapshot: a v1 entry is kept as it is, an old one gets a safe player id, junk gives null", () => {
    const g = v1();
    expect(migrateSnapshot(g, "p-me")).toBe(g);
    const m = migrateSnapshot(olds[0], "bad id!")!;
    expect(m.playerId).toBe("bad_id_");
    expect(isSnapshot(m)).toBe(true);
    for (const junk of [null, "x", 3, [], { v: 2 }, { ...olds[0], build: null }]) expect(migrateSnapshot(junk, "p-me")).toBe(null);
  });
});

describe("pickGhost: nearest wins, then nearest lives, then a seeded tie-break", () => {
  const q = { rules: RULES_VERSION, day: 4, runId: "me", wins: 2, lives: 4, seed: 77 };

  it("the smallest |wins diff| wins even with lives far off; among equal |wins diff|, the smallest |lives diff|", () => {
    const livesClose = v1({ wins: 0, lives: 4, runId: "r1" }); // |dw| 2, |dl| 0
    const winsClose = v1({ wins: 3, lives: 1, runId: "r2" }); // |dw| 1, |dl| 3
    expect(pickGhost([livesClose, winsClose], q)).toBe(winsClose);
    expect(pickGhost([winsClose, livesClose], q)).toBe(winsClose);
    const below = v1({ wins: 1, lives: 2, runId: "r3" }); // |dw| 1, |dl| 2
    expect(pickGhost([livesClose, winsClose, below], q)).toBe(below);
    const above = v1({ wins: 3, lives: 5, runId: "r4" }); // |dw| 1, |dl| 1
    expect(pickGhost([livesClose, winsClose, below, above], q)).toBe(above);
    const exact = v1({ wins: 2, lives: 4, runId: "r5" });
    expect(pickGhost([livesClose, exact, winsClose, below, above], q)).toBe(exact);
  });

  it("never another rules version, another day or the current run, however close its record", () => {
    const wrong = [v1({ rules: "bb-0.5.0" }), v1({ day: 3 }), v1({ day: 5 }), v1({ runId: "me" })];
    expect(pickGhost(wrong, q)).toBe(null);
    const far = v1({ wins: 0, lives: 1, runId: "far" });
    for (let seed = 0; seed < 40; seed++) expect(pickGhost([...wrong, far, ...wrong], { ...q, seed })).toBe(far);
  });

  it("ties: hashSeed(seed, 'ghost', day) over the tied ghosts in pool order; deterministic, varies with the seed", () => {
    const ties = Array.from({ length: 7 }, (_, i) => v1({ runId: `t${i}`, createdAt: i }));
    const picks = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const a = pickGhost(ties, { ...q, seed })!;
      expect(pickGhost(ties, { ...q, seed })).toBe(a);
      expect(a).toBe(ties[hashSeed(seed, "ghost", q.day) % ties.length]);
      picks.add(a.createdAt);
    }
    expect(picks.size).toBeGreaterThan(1);
    // worse-ranked entries in between do not shift the tie-break
    const mixed = [v1({ wins: 0, runId: "x1" }), ties[0], v1({ lives: 1, runId: "x2" }), ties[1], ties[2]];
    expect(pickGhost(mixed, q)).toBe([ties[0], ties[1], ties[2]][hashSeed(q.seed, "ghost", q.day) % 3]);
  });
});

// 0.6.0d: the deck is the captain hero's full-purse pool pick, standInPick(hero, day, seed), not
// standInBuild(id, day); so it also spends at least 90% of the day's gold (tests/standInPool.test.ts)
describe("standInFoe: the day's rival captain with its full-purse pool deck", () => {
  const PLATE = 25; // ARMOR PLATING's hull (standin.honest.test.ts pins it)

  it("50 seeds x days 1-10: standInPick(hero of standInGhost(seed, day), day, seed), whole paid plating, 90-100% of maxGoldByDay, never the Matriarch", () => {
    for (let n = 0; n < 50; n++) {
      const seed = 1 + n * 7919;
      const ids = new Set<string>();
      for (let day = 1; day <= RUN_DAYS; day++) {
        const f = standInFoe(seed, day);
        const id = standInGhost(seed, day);
        expect(f.id).toBe(id);
        expect(f.id).not.toBe("matriarch");
        expect(f.build).toEqual(standInPick(RIVALS[id].hero, day, seed));
        expect([f.hero, f.name, f.build.hero]).toEqual([RIVALS[id].hero, RIVALS[id].name, RIVALS[id].hero]);
        expect(f.build.hullBonus).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(f.build.hullBonus / PLATE)).toBe(true);
        expect(deckCost(f.build).total).toBeLessThanOrEqual(maxGoldByDay(day));
        // 0.6.2 BELTSIDE: full purse as generated; as loaded it lacks only what D3 dropped (beltside.helpers)
        expect(deckCost(f.build).total + pickLoss(f.hero, day, seed)).toBeGreaterThanOrEqual(Math.ceil(0.9 * maxGoldByDay(day)));
        ids.add(f.id);
      }
      expect(ids.size).toBe(RUN_DAYS); // no captain stands in twice in a run
    }
  });
});
