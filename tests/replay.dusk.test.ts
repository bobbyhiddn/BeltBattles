// 0.7.0a M4 (REQ-BFG-016; decision D6): replays of the run's stored dusk records (the summary's REPLAY button).
// A dusk stores battleRecordFor(your deck, the foe's, battleSeed(run)) with its result (online play: battle.ts end()).
// The REPLAY plays openReplay(record) (replayBattle) in the battle view. Here: the replayed result (winner, time and both
// hulls) equals the stored one; a record of another rules version is refused with "replay unavailable (other rules)";
// a replay changes no run state.

import { describe, expect, it } from "vitest";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { Battle, type BattleRecord } from "../src/sim/battle";
import type { Build } from "../src/sim/deck";
import { standInPool } from "../src/sim/standInPool";
import { battleSeed, newRun, type DayResult, type Run } from "../src/game/run";
import { onlineFoe } from "../src/game/day";
import { openReplay, REPLAY_BROKEN, REPLAY_OTHER_RULES } from "../src/game/replays";
import { battleRecordFor, replay } from "../src/net/replay";
import { ghostId } from "../src/net/snapshot";
import { generateSamplePool } from "../tools/samplePool";

const SEED_POOL = generateSamplePool();

/** The dusk as the arena plays it (battle.ts: a Battle stepped until it is over), and what end() stores with it. */
function dusk(run: Run, mine: Build, foe: Build): DayResult {
  const seed = battleSeed(run);
  const record = battleRecordFor(mine, foe, seed); // battle.ts, when the dusk starts (online)
  const b = new Battle(mine, foe, seed);
  while (!b.over && b.ticks < 60 * 600) b.step();
  expect(b.over).toBe(true);
  return {
    day: run.day, outcome: b.winner === 0 ? "win" : b.winner === 1 ? "loss" : "draw", income: 0, time: b.t, foe: "?", ghost: true,
    player: b.sides[0].stats, enemy: b.sides[1].stats, record, hulls: [b.sides[0].hull.hp, b.sides[1].hull.hp],
  };
}

/** A replay played to its end, as the replay view steps it. */
function played(battle: Battle): { winner: number | null; t: number; hulls: [number, number] } {
  while (!battle.over && battle.ticks < 60 * 600) battle.step();
  return { winner: battle.winner, t: battle.t, hulls: [battle.sides[0].hull.hp, battle.sides[1].hull.hp] };
}

/** Stored dusks: heroes x days x seeds, against server ghosts (seed pool decks) and against 0.6.2's stand-ins. */
function storedDusks(): DayResult[] {
  const out: DayResult[] = [];
  for (const hero of ["furnace", "weaver"] as HeroId[]) {
    for (let day = 1; day <= 10; day++) {
      for (const seed of [3, 41]) {
        const run = newRun(hero, seed * 100 + day);
        run.day = day;
        const mine = standInPool(hero, day)[seed % standInPool(hero, day).length].build;
        const ghost = SEED_POOL.find((s) => s.day === day && s.hero !== hero)!;
        out.push(dusk(run, mine, onlineFoe(run, { id: ghostId(ghost), snapshot: ghost, source: "server" }).build));
        out.push(dusk(run, mine, onlineFoe(run, null).build)); // the stand-in
      }
    }
  }
  return out;
}

const DUSKS = storedDusks();

describe("M4: the stored dusk records replay exactly", () => {
  it("each record is battleRecordFor(your deck, the foe's, battleSeed) under this build's rules", () => {
    expect(DUSKS).toHaveLength(80);
    for (const d of DUSKS) {
      expect(d.record!.rules).toBe(RULES_VERSION);
      expect(Number.isInteger(d.record!.seed)).toBe(true);
    }
  });

  it("the replayed result (winner, time and both hulls) equals the stored one, in the replay view and headless", () => {
    const outcomes = new Set<string>();
    for (const d of DUSKS) {
      const o = openReplay(d.record);
      expect(o.ok).toBe(true);
      if (!o.ok) continue;
      expect(o.battle.ticks).toBe(0); // fresh and unstepped, as the view plays it
      const r = played(o.battle);
      expect(r.winner === 0 ? "win" : r.winner === 1 ? "loss" : "draw").toBe(d.outcome);
      expect(r.t).toBe(d.time);
      expect(r.hulls).toEqual(d.hulls);
      const h = replay(d.record!);
      expect([h.winner, h.hulls]).toEqual([r.winner, r.hulls]);
      outcomes.add(d.outcome);
    }
    expect(outcomes.size).toBeGreaterThan(1); // wins and losses both replayed
  });
});

describe("M4 (D6): read-only, and another rules version is refused", () => {
  it("a record made under other rules says REPLAY UNAVAILABLE (OTHER RULES); a damaged one REPLAY UNAVAILABLE", () => {
    expect(REPLAY_OTHER_RULES).toBe("REPLAY UNAVAILABLE (OTHER RULES)");
    const plain = DUSKS.find((d) => !d.record!.builds.some((b) => b.turrets !== undefined || b.routes.some((r) => r.join !== undefined)))!.record!;
    const featured = DUSKS.find((d) => d.record!.builds.some((b) => b.turrets !== undefined))!.record!;
    for (const rules of ["bb-0.6.1", "bb-0.6.3", "bb-9.9.9", "garbled"]) {
      expect(openReplay({ ...plain, rules }), rules).toEqual({ ok: false, why: REPLAY_OTHER_RULES });
    }
    expect(openReplay({ ...featured, rules: "bb-0.6.1" })).toEqual({ ok: false, why: REPLAY_OTHER_RULES }); // the rules gate
    expect(openReplay({ ...plain, builds: [plain.builds[0]] } as unknown as BattleRecord)).toEqual({ ok: false, why: REPLAY_BROKEN });
    expect(openReplay(undefined)).toEqual({ ok: false, why: REPLAY_BROKEN });
    expect(openReplay(plain).ok).toBe(true);
  });

  it("a replay changes no run state: the run and its records are byte for byte the same after every replay", () => {
    const run = newRun("weaver", 9090);
    run.history = DUSKS.slice(0, 10).map((d, i) => ({ ...d, day: i + 1 }));
    run.over = "complete";
    const before = JSON.stringify(run);
    for (const d of run.history) {
      const o = openReplay(d.record);
      if (o.ok) played(o.battle);
    }
    expect(JSON.stringify(run)).toBe(before);
  });
});
