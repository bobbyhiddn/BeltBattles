// 0.6.0c item 3: the local snapshot bounds = the async contract's. isSnapshot mirrors
// ref/async-snapshot.ts checkSnapshot's numeric bounds exactly: day int 1..MAX_DAY (10), wins int
// 0..day - 1, lives int 1..MAX_LIVES (9), createdAt int 0..Number.MAX_SAFE_INTEGER. Each bound is
// tested on both sides, plus a valid v1 snapshot.
import { describe, expect, it } from "vitest";
import { MAX_DAY, MAX_LIVES, isSnapshot, migrateSnapshot, type GhostSnapshot } from "../src/game/ghostSnapshot";
import { newRun } from "../src/game/run";
import { RUN_DAYS } from "../src/sim/content";

const valid = (o: Partial<GhostSnapshot> = {}): GhostSnapshot => ({
  v: 1, rules: "bb-0.4.0", hero: "furnace", day: 5, wins: 2, lives: 3,
  build: newRun("furnace", 77).build, runId: "run-1", playerId: "p123", createdAt: 1_700_000_000_000, ...o,
});

describe("snapshot bounds match the async checkSnapshot (0.6.0c)", () => {
  it("the contract's constants: MAX_DAY 10 (= RUN_DAYS), MAX_LIVES 9", () => {
    expect(MAX_DAY).toBe(10);
    expect(MAX_DAY).toBe(RUN_DAYS);
    expect(MAX_LIVES).toBe(9);
  });

  it("a valid v1 snapshot is accepted", () => {
    expect(isSnapshot(valid())).toBe(true);
  });

  it("day: 1..10 (0 and 11 rejected, non-integers rejected)", () => {
    expect(isSnapshot(valid({ day: 0, wins: 0 }))).toBe(false);
    expect(isSnapshot(valid({ day: 1, wins: 0 }))).toBe(true);
    expect(isSnapshot(valid({ day: 10, wins: 9 }))).toBe(true);
    expect(isSnapshot(valid({ day: 11, wins: 0 }))).toBe(false);
    expect(isSnapshot(valid({ day: 5.5 }))).toBe(false);
  });

  it("wins: 0..day - 1 (-1 and day rejected)", () => {
    expect(isSnapshot(valid({ day: 5, wins: -1 }))).toBe(false);
    expect(isSnapshot(valid({ day: 5, wins: 0 }))).toBe(true);
    expect(isSnapshot(valid({ day: 5, wins: 4 }))).toBe(true);
    expect(isSnapshot(valid({ day: 5, wins: 5 }))).toBe(false);
    expect(isSnapshot(valid({ day: 1, wins: 1 }))).toBe(false);
  });

  it("lives: 1..9 (0 and 10 rejected)", () => {
    expect(isSnapshot(valid({ lives: 0 }))).toBe(false);
    expect(isSnapshot(valid({ lives: 1 }))).toBe(true);
    expect(isSnapshot(valid({ lives: 9 }))).toBe(true);
    expect(isSnapshot(valid({ lives: 10 }))).toBe(false);
  });

  it("createdAt: 0..Number.MAX_SAFE_INTEGER (-1 and MAX_SAFE_INTEGER + 1 rejected)", () => {
    expect(isSnapshot(valid({ createdAt: -1 }))).toBe(false);
    expect(isSnapshot(valid({ createdAt: 0 }))).toBe(true);
    expect(isSnapshot(valid({ createdAt: Number.MAX_SAFE_INTEGER }))).toBe(true);
    expect(isSnapshot(valid({ createdAt: Number.MAX_SAFE_INTEGER + 1 }))).toBe(false);
    expect(isSnapshot(valid({ createdAt: 1.5 }))).toBe(false);
  });

  it("a 0.6.0a pool entry out of bounds does not migrate", () => {
    const old = { v: 1, rulesVersion: "bb-0.4.0", hero: "furnace", day: 11, wins: 3, losses: 1, lives: 4,
      build: newRun("furnace", 77).build, runId: "a1", savedAt: 1000 };
    expect(migrateSnapshot(old, "p1")).toBe(null);
    expect(migrateSnapshot({ ...old, day: 10 }, "p1")).not.toBe(null);
    expect(migrateSnapshot({ ...old, lives: 10 }, "p1")).toBe(null);
  });
});
