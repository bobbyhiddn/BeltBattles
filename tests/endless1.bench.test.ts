// ENDLESS-1 (REQ-BFG-059, BRIEF-ENDLESS1 section 4): the endless bench's entry (src/sim/harness/endlessBench.ts). Two parts:
//  - a smoke test that always runs: one par run on the committed seed pool, its rows' shape and the endless rules they obey;
//  - the bench itself, which runs ONLY with ENDLESS_BENCH set (a JSON object: { bot, hero, from, to, out, budgetS, steps? }): the seeds
//    from..to of that (bot, hero), one JSON line per run appended to `out`, stopping early (a { stopped } line) once budgetS seconds
//    have passed, so a shell call stays under its limit and the next call resumes at stopped + 1.
//    ENDLESS_BENCH='{"bot":"par","hero":"furnace","from":1,"to":40,"out":"/tmp/x.jsonl","budgetS":480}' npx vitest run tests/endless1.bench.test.ts
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SEED_POOL } from "../server/seedPoolData";
import { checkSnapshot, ghostId, type PoolEntry } from "../src/net/snapshot";
import type { HeroId } from "../src/sim/content";
import { ENDLESS, ENDLESS_LAST_DAY, ENDLESS_LIVES, ENDLESS_WIN_CAP, setEndless } from "../src/sim/endless";
import { benchRun, readOf, summary, DEFAULT_STEPS, ENDLESS_BOTS, type BenchRow, type EndlessBot } from "../src/sim/harness/endlessBench";

const pool: PoolEntry[] = SEED_POOL.map((line) => { const snapshot = checkSnapshot(JSON.parse(line) as unknown); return { id: ghostId(snapshot), snapshot }; });

afterAll(() => setEndless(ENDLESS));

describe("ENDLESS-1 bench: the summary reads", () => {
  it("mean, median, p10 and p90 by nearest rank; the reads of a group of rows", () => {
    expect(summary([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual({ n: 10, mean: 5.5, median: 5.5, p10: 1, p90: 9 });
    expect(summary([3]).median).toBe(3);
    expect(Number.isNaN(summary([]).mean)).toBe(true);
    const play = (wins: number, step = 250) => ({ step, wins, losses: 3, draws: 0, end: "hearts" as const, lastDay: 20, dusks: wins + 3 });
    const rows: BenchRow[] = [
      { bot: "par", hero: "furnace", seed: 1, run: "won", runDay: 12, runWins: 10, lcDay: 0, endless: [play(2), play(0, 500)] },
      { bot: "par", hero: "furnace", seed: 2, run: "won", runDay: 13, runWins: 10, lcDay: 0, endless: [play(4), play(1, 500)] },
      { bot: "par", hero: "furnace", seed: 3, run: "lost", runDay: 9, runWins: 6, lcDay: 5, endless: [] },
    ];
    const r = readOf(rows, 250);
    expect(r.runs).toBe(3);
    expect(r.won).toBe(2);
    expect(r.wins.mean).toBe(3);
    expect(r.reach30).toBe(0);
    expect(r.days).toBe(6);
    expect(readOf(rows, 500).wins.mean).toBe(0.5);
  });
});

describe("ENDLESS-1 bench: one run, end to end (par, FURNACE, the committed seed pool)", () => {
  it("plays the run to its victory or its loss; a won one plays endless on every step under the endless rules", () => {
    setEndless(true);
    const steps = [0, 250];
    const row = benchRun("par", "furnace", 3, pool, steps);
    expect(["won", "lost", "backstop"]).toContain(row.run);
    expect(row.runDay).toBeGreaterThanOrEqual(1);
    if (row.run !== "won") {
      expect(row.endless).toEqual([]);
      return;
    }
    expect(row.runWins).toBe(10);
    expect(row.endless.map((e) => e.step)).toEqual(steps);
    for (const e of row.endless) {
      expect(e.wins).toBeGreaterThanOrEqual(0);
      expect(e.wins).toBeLessThanOrEqual(ENDLESS_WIN_CAP);
      expect(e.dusks).toBe(e.wins + e.losses + e.draws);
      expect(e.lastDay).toBe(row.runDay + e.dusks);
      expect(e.lastDay).toBeLessThanOrEqual(ENDLESS_LAST_DAY);
      if (e.end === "hearts") expect(e.losses).toBe(ENDLESS_LIVES);
      if (e.end === "cap") expect(e.wins).toBe(ENDLESS_WIN_CAP);
    }
    // a heavier GOD never wins more than a lighter one by luck of the seed alone? Not a rule: only the shape is pinned here
  }, 600_000);

  it("ENDLESS_BOTS and the default steps: par and c5, and the shipped step among the steps", () => {
    expect(ENDLESS_BOTS).toEqual(["par", "c5"]);
    expect(DEFAULT_STEPS).toContain(250);
  });
});

const cfg = process.env.ENDLESS_BENCH ? (JSON.parse(process.env.ENDLESS_BENCH) as { bot: EndlessBot; hero: HeroId; from: number; to: number; out: string; budgetS: number; steps?: number[] }) : null;

describe.skipIf(!cfg)("ENDLESS-1 bench: the seeds of one (bot, hero) (ENDLESS_BENCH)", () => {
  it("plays them and appends one line a run", () => {
    const c = cfg!;
    setEndless(true);
    mkdirSync(dirname(c.out), { recursive: true });
    const t0 = Date.now();
    let done = 0;
    for (let seed = c.from; seed <= c.to; seed++) {
      if ((Date.now() - t0) / 1000 > c.budgetS) {
        appendFileSync(c.out, JSON.stringify({ stopped: seed - 1, bot: c.bot, hero: c.hero }) + "\n");
        break;
      }
      appendFileSync(c.out, JSON.stringify(benchRun(c.bot, c.hero, seed, pool, c.steps ?? DEFAULT_STEPS)) + "\n");
      done++;
    }
    expect(done).toBeGreaterThan(0);
  }, 3_000_000);
});
