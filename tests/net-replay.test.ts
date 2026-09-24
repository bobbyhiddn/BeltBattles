import { describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { Battle, simulate, type BattleRecord } from "../src/sim/battle";
import { battleRecordFor, outcomeOf, replay, replayBattle, RulesMismatchError } from "../src/net/replay";
import { generateSamplePool } from "../tools/samplePool";

const POOL = generateSamplePool();

describe("exact replay", () => {
  it("reproduces the winner, end tick and both hulls exactly over 60 seeds", () => {
    const winners = new Set<number | null>();
    for (let i = 0; i < 60; i++) {
      const ghost = POOL[i % POOL.length].build;
      const player = i % 3 === 0 ? startingBuild(i % 2 ? "furnace" : "weaver", 1) : POOL[(i * 7 + 3) % POOL.length].build;
      const seed = hashSeed("replay-test", i);
      const live = simulate(player, ghost, seed);
      const stored: BattleRecord = JSON.parse(JSON.stringify(battleRecordFor(player, ghost, seed)));
      const again = replay(stored);
      expect(again.winner).toBe(live.winner);
      expect(again.ticks).toBe(live.ticks);
      expect(again.hulls[0]).toBe(live.sides[0].hull.hp); // Object.is: bit-exact floats
      expect(again.hulls[1]).toBe(live.sides[1].hull.hp);
      winners.add(live.winner);
    }
    expect(winners.has(0) && winners.has(1)).toBe(true); // both sides win somewhere: a meaningful sample
  });

  it("a record stepped frame by frame (arena playback) ends exactly like the headless replay", () => {
    for (let i = 0; i < 6; i++) {
      const record = battleRecordFor(POOL[i * 5].build, warlordBuild(i % 2 ? "weaver" : "furnace", 1 + i), hashSeed("frames", i));
      const b = replayBattle(record);
      while (!b.over && b.ticks < 60 * 200) {
        b.step();
        b.drainEvents();
      }
      expect(outcomeOf(b)).toEqual(replay(record));
    }
  });

  it("builds the same record the Battle itself keeps", () => {
    const p = POOL[3].build, g = POOL[25].build;
    expect(battleRecordFor(p, g, 12345)).toEqual(new Battle(p, g, 12345).record);
  });

  it("refuses a record whose rules string differs from RULES_VERSION", () => {
    const record = battleRecordFor(POOL[0].build, POOL[20].build, 7);
    expect(() => replay({ ...record, rules: "bb-0.3.0" })).toThrow(RulesMismatchError);
    expect(() => replayBattle({ ...record, rules: "bb-0.5.0" })).toThrow(/cannot replay/);
    expect(() => replay({ ...record, seed: -1 })).toThrow(/seed/);
    expect(() => replay({ ...record, builds: [record.builds[0]] as unknown as BattleRecord["builds"] })).toThrow(/two builds/);
    expect(() => battleRecordFor(POOL[0].build, POOL[1].build, 1.5)).toThrow(/seed/);
  });
});
