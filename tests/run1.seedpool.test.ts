// RUN-1 T8 (REQ-BFG-059, REQ-BFG-116; RULING-RUN1-R1 R1.1): the seed-pool generator goes to day 16.
//  - tools/samplePool.ts generates days 1..poolDepth(): MAX_DAY (10) with the long run off, LONG_RUN_GEN_DAYS (16) under long-run
//    rules. With the switch OFF the output is byte for byte the committed server/seedPoolData.ts (the full proof, a cmp of the
//    real generator's bundle: output-run1/T8-proof.md; here the cheap checks: the pool order's index math equals the committed
//    file's, and the ungraded sample, floor and race ghosts equal its lines).
//  - Under long-run rules: the depth and the index math follow it; a drawn record keeps its wins under the goal and reads LAST CHANCE on any
//    day; every seed ghost STATES its `losses` and the record check holds it to exactly that count; uncoveredStates runs on the long
//    record model (>= MIN_ELIGIBLE eligible ghosts at every reachable state of days 1-16); the day 11-16 picks of SOFT-1's rule come in
//    as a SCRATCH INPUT (BB_SOFT1_PICKS_FILE), never as committed rows.
//  - opt-in (BB_SOFT1_LONG_RULE=1): the rule itself, softDecks, run in the long-run world for days 11-16, writing the rows to
//    BB_SOFT1_LONG_OUT (the scratch input above; BB_SOFT1_LONG_HEROES and BB_SOFT1_LONG_DAYS narrow it);
//  - opt-in (BB_SEEDPOOL_SCRATCH=<pool.json>): the scratch pool for days 1-16 (output-run1/pool/seed-d1-16/pool.json) is whole.
// LONG_RUN ships OFF; every long-run line here runs inside withLongRun, which puts the switch back.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Rng } from "../src/core/rng";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { startingBuild } from "../src/sim/ai";
import { STAND_IN_HEROES } from "../src/net/fallback";
import { floorRecord, isReachable, reachableRecords } from "../src/net/records";
import { eligible } from "../src/net/matchmaking";
import { checkSnapshot, encodeSnapshot, ghostId, MAX_DAY, type GhostSnapshot } from "../src/net/snapshot";
import { LONG_RUN_GEN_DAYS, MAX_RUN_DRAWS, WIN_GOAL, longRunRules, withLongRun } from "../src/sim/longRun";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { encodeStarred, standInPool } from "../src/sim/standInPool";
import { SEED_POOL } from "../server/seedPoolData";
import { checkPool } from "../server/seed";
import {
  FLOOR_VARIANT, MIN_ELIGIBLE, RACE_SEED_HEROES, RACE_VARIANTS, SAMPLE_VARIANTS, SOFT1_PICKS, SOFT1_PICKS_FILE_ENV, SOFT1_WORLD,
  drawRecord, drawnLabel, floorGhosts, poolDepth, raceDeck, raceGhosts, sampleDeckOf, sampleEntry, sampleGhosts, seedSlot, softDecks, softPickKey, softPickRows, softPicked,
  softStaleCheck, statedLosses, uncoveredStates, type RaceDeck,
} from "../tools/samplePool";

const EPOCH = Date.UTC(2026, 8, 23, 19, 22); // samplePool.ts's fixed createdAt origin
const without = (s: GhostSnapshot | Record<string, unknown>): Record<string, unknown> => { const { grade: _g, ...rest } = s as Record<string, unknown>; return rest; };
const COMMITTED = SEED_POOL.map((line) => JSON.parse(line) as GhostSnapshot);

/** A synthetic ghost of `day` at (wins, lives), valid in the world it is made in (the starting deck; losses on a long run's). */
function ghost(day: number, wins: number, lives: number, playerId: string, losses?: number): GhostSnapshot {
  return checkSnapshot({
    v: losses !== undefined ? 3 : 2, rules: RULES_VERSION, hero: "furnace", day, wins, lives, build: startingBuild("furnace", 1),
    runId: `run-${playerId}`, playerId, createdAt: 0, ...(losses !== undefined ? { losses } : {}),
  });
}

describe("T8: the generator's depth", () => {
  it("is MAX_DAY (10) with the long run off and LONG_RUN_GEN_DAYS (16) under long-run rules, read at call time", () => {
    expect(longRunRules()).toBe(false);
    expect(poolDepth()).toBe(MAX_DAY);
    expect(poolDepth()).toBe(10);
    withLongRun(() => {
      expect(poolDepth()).toBe(LONG_RUN_GEN_DAYS);
      expect(poolDepth()).toBe(16);
    });
    expect(poolDepth()).toBe(10); // the switch is back
    expect(() => withLongRun(() => { throw new Error("boom"); })).toThrow("boom");
    expect(poolDepth()).toBe(10); // even after a throw
  });

  it("the pool order's index math follows it: the committed file's order with the switch off, the 192-ghost order under the long run", () => {
    // off: seedSlot(hero, v, day) is the ghost's index in the committed pool (createdAt = EPOCH + index * 1000)
    expect(COMMITTED).toHaveLength(120);
    COMMITTED.forEach((s, i) => {
      expect(s.createdAt, `${s.playerId} d${s.day}`).toBe(EPOCH + i * 1000);
      const v = Number(s.playerId.slice(s.playerId.lastIndexOf("-") + 1));
      if (STAND_IN_HEROES.includes(s.hero) && v === FLOOR_VARIANT) return; // a stand-in hero's floor ghosts sit between the sample and race parts: no slot of the rule's (variants 0 and 1)
      expect(seedSlot(s.hero, v, s.day), `${s.playerId} d${s.day}`).toBe(i);
    });
    // on: the same formula at the stride 16, in the order generateSamplePool makes: 2 heroes x 2 variants x 16 sample ghosts,
    // 2 x 16 floor ghosts, then 2 race heroes x 3 variants x 16
    withLongRun(() => {
      const sampleN = STAND_IN_HEROES.length * SAMPLE_VARIANTS * 16, floorN = STAND_IN_HEROES.length * 16;
      expect([sampleN, floorN, sampleN + floorN + RACE_SEED_HEROES.length * RACE_VARIANTS * 16]).toEqual([64, 32, 192]);
      let i = 0;
      for (const hero of STAND_IN_HEROES) for (let v = 0; v < SAMPLE_VARIANTS; v++) for (let day = 1; day <= 16; day++) expect(seedSlot(hero, v, day)).toBe(i++);
      expect(i).toBe(sampleN);
      i = sampleN + floorN;
      for (const hero of RACE_SEED_HEROES) for (let v = 0; v < RACE_VARIANTS; v++) for (let day = 1; day <= 16; day++) expect(seedSlot(hero, v, day)).toBe(i++);
      expect(i).toBe(192);
    });
  });
});

describe("T8: with the switch off the generator is the committed pool", () => {
  it("the ungraded sample, floor and race ghosts are the committed file's lines minus their grades (the full cmp is T8-proof.md)", () => {
    expect(longRunRules()).toBe(false);
    const softDeckOf = (h: HeroId, d: number, v: number): RaceDeck => {
      const c = v < SAMPLE_VARIANTS ? softPicked(h, d)?.[v] : undefined;
      return c ? { build: c.build, seed: c.seed!, ...(c.road ? { road: c.road } : {}) } : raceDeck(h, d, v);
    };
    const made = [...sampleGhosts(), ...floorGhosts(), ...raceGhosts(undefined, softDeckOf)];
    expect(made).toHaveLength(120);
    made.forEach((s, i) => {
      expect(JSON.parse(encodeSnapshot(s)), `${s.playerId} d${s.day}`).toEqual(without(COMMITTED[i]));
      expect(s.losses, "no losses with the switch off").toBeUndefined();
    });
  }, 600_000);

  it("the draws are the old draws: drawRecord is rng.int(day) twice, drawnLabel and statedLosses add nothing", () => {
    for (let day = 1; day <= 10; day++) {
      for (let k = 0; k < 20; k++) {
        const a = new Rng(1000 * day + k), b = new Rng(1000 * day + k);
        const wins = a.int(day), lost = a.int(day - wins);
        expect(drawRecord(day, b)).toEqual({ wins, lost });
        expect(statedLosses(day, drawnLabel(day, wins, lost), lost)).toBeUndefined();
      }
    }
  });

  it("a scratch pick file is ignored with the switch off: the committed picks, whatever BB_SOFT1_PICKS_FILE says", () => {
    const dir = mkdtempSync(join(tmpdir(), "t8-picks-"));
    const was = process.env[SOFT1_PICKS_FILE_ENV];
    try {
      const file = join(dir, "rows.json");
      writeFileSync(file, JSON.stringify({ world: SOFT1_WORLD, picks: { furnace: { "1": ["s0:00000000", "s1:00000000"] } } }));
      process.env[SOFT1_PICKS_FILE_ENV] = file;
      const [a, b] = softPicked("furnace", 1)!; // would throw (stale) if the file's row were read
      expect([softPickKey("furnace", 1, a), softPickKey("furnace", 1, b)]).toEqual([...SOFT1_PICKS.furnace[0]]);
    } finally {
      if (was === undefined) delete process.env[SOFT1_PICKS_FILE_ENV]; else process.env[SOFT1_PICKS_FILE_ENV] = was;
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("T8: the long run's records (days 1-16)", () => {
  it("a drawn record keeps its wins under the goal, and its label is a record a long run reaches with exactly the stated losses", () => {
    withLongRun(() => {
      let drawn = 0, snapped = 0;
      for (let day = 1; day <= 16; day++) {
        for (let k = 0; k < 40; k++) {
          const { wins, lost } = drawRecord(day, new Rng(day * 7919 + k));
          expect(wins, `d${day}`).toBeLessThanOrEqual(WIN_GOAL - 1);
          expect(wins + lost, `d${day}`).toBeLessThanOrEqual(day - 1);
          const rec = drawnLabel(day, wins, lost);
          expect(isReachable(day, rec.wins, rec.lives), `d${day} ${rec.wins}W ${rec.lives}`).toBe(true);
          const losses = statedLosses(day, rec, lost);
          expect(losses, `d${day} ${rec.wins}W ${rec.lives}`).toBeDefined();
          expect(isReachable(day, rec.wins, rec.lives, { losses }), `d${day} ${rec.wins}W ${rec.lives} losses ${losses}`).toBe(true);
          expect(day - 1 - rec.wins - losses!, "draws").toBeLessThanOrEqual(MAX_RUN_DRAWS);
          // the snapshot takes it (the decoder: losses 0..day-1-wins, draws <= MAX_RUN_DRAWS)
          expect(() => ghost(day, rec.wins, rec.lives, "label", losses)).not.toThrow();
          drawn++;
          if (rec.wins !== wins) snapped++;
        }
      }
      expect(drawn).toBe(640);
      expect(snapped, "a wins count with no record at all (day 16, 0 wins needs 7 losses) is the rare case").toBeLessThan(drawn / 4);
    });
  });

  it("the label walks the hearts the game's way: 3 hearts a loss from day 7, so three losses on days 9-11 leave 1 (LAST CHANCE's), two leave 4", () => {
    withLongRun(() => {
      expect(drawnLabel(12, 0, 3).lives).toBe(1); // 10 - 3 - 3 - 3 = 1
      expect(drawnLabel(12, 3, 2).lives).toBe(4); // 10 - 3 - 3
      expect(drawnLabel(12, 3, 0).lives).toBe(10);
    });
  });

  it("a floor ghost states the most losses a run with its record can have, and the record check holds it to exactly that", () => {
    withLongRun(() => {
      for (let day = 1; day <= 16; day++) {
        const rec = floorRecord(day);
        expect(rec.wins).toBe(0);
        const losses = statedLosses(day, rec, day - 1);
        expect(losses, `d${day}`).toBeDefined();
        expect(isReachable(day, rec.wins, rec.lives, { losses }), `d${day}`).toBe(true);
        for (let l = losses! + 1; l <= day - 1; l++) expect(isReachable(day, rec.wins, rec.lives, { losses: l }), `d${day} more losses`).toBe(false);
        ghost(day, rec.wins, rec.lives, "floor", losses); // the snapshot decoder takes it
      }
    });
  });
});

describe("T8: uncoveredStates on the long record model", () => {
  /** Two floor ghosts (different players) for every day in 1..to: the generator's own cover (floorRecord is eligible for every request). */
  const floors = (to: number, per = 2): GhostSnapshot[] => {
    const out: GhostSnapshot[] = [];
    for (let day = 1; day <= to; day++) {
      const f = floorRecord(day), losses = statedLosses(day, f, day - 1);
      for (let p = 0; p < per; p++) out.push(ghost(day, f.wins, f.lives, `floor-${p}`, losses));
    }
    return out;
  };
  const states = (from: number, to: number): number => { let n = 0; for (let d = from; d <= to; d++) n += reachableRecords(d).length; return n; };

  it("every reachable state of days 1-16 has MIN_ELIGIBLE eligible ghosts when each day has two floor ghosts; one is not enough", () => {
    expect(MIN_ELIGIBLE).toBe(2);
    withLongRun(() => {
      expect(uncoveredStates(floors(16))).toEqual([]); // depth 16, the long model
      const one = uncoveredStates(floors(16, 1));
      expect(one).toHaveLength(states(1, 16)); // 1 < 2 everywhere
      expect(one.every((g) => g.eligible === 1)).toBe(true);
      expect(uncoveredStates(floors(16, 1), 1)).toEqual([]);
    });
  });

  it("a pool of days 1-10 leaves every reachable state of days 11-16 uncovered under the long run, and none with the switch off", () => {
    const gaps = withLongRun(() => {
      const pool = floors(10);
      expect(uncoveredStates(pool, MIN_ELIGIBLE, 10)).toEqual([]); // days 1-10 alone are covered
      return uncoveredStates(pool); // default depth 16
    });
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((g) => g.day >= 11 && g.day <= 16 && g.eligible === 0)).toBe(true);
    expect(gaps.length).toBe(withLongRun(() => states(11, 16)));
    // the 10-day world: the same days-1-10 pool, depth 10, the 10-day record model: covered, and a gap list that never names day 11+
    const off = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((day) => {
      const f = floorRecord(day);
      return [0, 1].map((p) => checkSnapshot({ v: 2, rules: RULES_VERSION, hero: "furnace", day, wins: f.wins, lives: f.lives, build: startingBuild("furnace", 1), runId: `r${p}`, playerId: `floor-${p}`, createdAt: 0 }));
    });
    expect(uncoveredStates(off)).toEqual([]);
    expect(uncoveredStates(off.slice(0, 10), MIN_ELIGIBLE).every((g) => g.day <= 10)).toBe(true);
  });

  it("every state of days 1-16 has a record at or above the floor ghost's (why the floor ghosts cover them all)", () => {
    withLongRun(() => {
      for (let day = 1; day <= 16; day++) expect(reachableRecords(day).length, `d${day}`).toBeGreaterThan(0);
      // every state of every day has a floor ghost's record at or below it (the floor is eligible for every request)
      for (let day = 1; day <= 16; day++) {
        const f = floorRecord(day);
        for (const r of reachableRecords(day)) expect(r.wins > 0 || r.lives >= f.lives, `d${day} ${r.wins}W ${r.lives}`).toBe(true);
      }
    });
  });
});

describe("T8: the day 11-16 picks come in through the scratch override (BB_SOFT1_PICKS_FILE)", () => {
  const withRows = <T>(rows: unknown, fn: () => T): T => {
    const dir = mkdtempSync(join(tmpdir(), "t8-rows-"));
    const was = process.env[SOFT1_PICKS_FILE_ENV];
    try {
      const file = join(dir, "rows.json");
      writeFileSync(file, JSON.stringify(rows));
      process.env[SOFT1_PICKS_FILE_ENV] = file;
      return fn();
    } finally {
      if (was === undefined) delete process.env[SOFT1_PICKS_FILE_ENV]; else process.env[SOFT1_PICKS_FILE_ENV] = was;
      rmSync(dir, { recursive: true, force: true });
    }
  };
  afterEach(() => { expect(longRunRules()).toBe(false); });

  it("without it a long run's day past SOFT1_PICKS' ten takes the decks as before (null: sampleEntry / raceDeck), and day 10 the committed row", () => {
    expect(process.env[SOFT1_PICKS_FILE_ENV]).toBeUndefined();
    withLongRun(() => {
      for (const hero of PLAYABLE_HEROES) expect(softPicked(hero, 11), hero).toBeNull();
      expect(softPickRows()).toBeNull();
      // the fallback deck is the stand-in pool's: day 12 is day 10's pool (standInDay's clamp, the written rule)
      const e = sampleEntry("furnace", 12, 0, 1);
      expect(e.day).toBe(10);
    });
    // with the switch off a day past the table is still the loud error it was
    expect(() => softPicked("furnace", 11)).toThrow(/holds no pick/);
  });

  it("with it, a long run's day 12 takes the file's row (here the par field's runs of seeds the race decks pick), checked by their hash like any pick", () => {
    const [k0, k1] = withLongRun(() => [raceDeck("furnace", 12, 0), raceDeck("furnace", 12, 1)].map((d) => softPickKey("furnace", 12, d)));
    expect([k0.startsWith("f"), k1.startsWith("f"), k0 === k1]).toEqual([true, true, false]);
    withRows({ world: SOFT1_WORLD, picks: { furnace: { "12": [k0, k1] } } }, () => {
      withLongRun(() => {
        const rows = softPickRows()!;
        expect([Object.keys(rows.picks), Object.keys(rows.picks.furnace)]).toEqual([["furnace"], ["12"]]);
        const [a, b] = softPicked("furnace", 12)!;
        expect([softPickKey("furnace", 12, a), softPickKey("furnace", 12, b)]).toEqual([k0, k1]);
        expect([a.build.runes?.length, b.seed !== undefined]).toEqual([12, true]); // a day-12 deck of a par-field run
        expect(softPicked("furnace", 13)).toBeNull(); // the file holds day 12 only: day 13 falls back
        const [c] = softPicked("furnace", 10)!; // the committed day 10 still serves day 10
        expect(softPickKey("furnace", 10, c)).toBe(SOFT1_PICKS.furnace[9][0]);
      });
    });
  }, 300_000);

  it("a day-10 stand-in deck is no ghost of day 11: an 's' pick on such a day is refused, and a stand-in hero's fallback is the par field's run of the day", () => {
    const k0 = softPickKey("furnace", 11, { build: standInPool("furnace", 11)[0].build });
    expect(standInPool("furnace", 11)[0].day, "standInDay clamps: the pool holds day 10's decks").toBe(10);
    withRows({ world: SOFT1_WORLD, picks: { furnace: { "11": [k0, k0] } } }, () => {
      withLongRun(() => { expect(() => softPicked("furnace", 11)).toThrow(/stand-in deck of day 10/); });
    });
    withLongRun(() => {
      expect(softPicked("furnace", 11)).toBeNull(); // no override: no pick
      const fb = sampleDeckOf("furnace", 11, 0);
      const par = raceDeck("furnace", 11, 0);
      expect(encodeStarred(fb.build)).toBe(encodeStarred(par.build));
      expect([fb.seed, fb.build.runes?.length]).toEqual([par.seed, 11]); // a day-11 ghost holds 11 runes (a day-10 stand-in deck: 10)
      const v1 = sampleDeckOf("furnace", 11, 1);
      expect(encodeStarred(v1.build), "variant 1 is never variant 0's deck").not.toBe(encodeStarred(fb.build));
      // days 1-10 are as before: the committed pick, the stand-in pool when there is none
      const [a] = softPicked("furnace", 10)!;
      expect(encodeStarred(sampleDeckOf("furnace", 10, 0).build)).toBe(encodeStarred(a.build));
    });
  }, 300_000);

  it("a row that no longer matches its deck is stale (the hash check), and a file of another world is refused with the rebuild command", () => {
    const k0 = withLongRun(() => softPickKey("furnace", 12, raceDeck("furnace", 12, 0)));
    withRows({ world: SOFT1_WORLD, picks: { furnace: { "12": [k0.replace(/:.*/, ":deadbeef"), k0] } } }, () => {
      withLongRun(() => { expect(() => softPicked("furnace", 12)).toThrow(/stale/); });
    });
    withRows({ world: "000000000000", picks: {} }, () => {
      withLongRun(() => { expect(() => softPickRows()).toThrow(/BB_SOFT1_LONG_RULE=1/); });
    });
  }, 300_000);
});

// ---------------------------------------------------------------- opt-in: the rule, and the scratch pool
describe("T8 (opt-in): SOFT-1's rule in the long-run world", () => {
  // SOFT1_REBUILD's command for the long run's days 11-16, one process or several (each its own BB_SOFT1_LONG_OUT):
  //   BB_SOFT1_LONG_RULE=1 BB_SOFT1_LONG_OUT=<rows.json> [BB_SOFT1_LONG_UNITS=furnace:11-16,bastion:11-12] npx vitest run tests/run1.seedpool.test.ts -t "softDecks for"
  // BB_SOFT1_LONG_UNITS is a list of hero:from-to (default: every playable hero, days 11-16). The rows file is written after every
  // (hero, day) and read back first, so a killed run resumes where it stopped. Pass the files to tools/genGhostPool.ts --soft1-picks.
  it.skipIf(process.env.BB_SOFT1_LONG_RULE !== "1")("softDecks for the long run's days 11-16 (BB_SOFT1_LONG_UNITS) writes its rows to BB_SOFT1_LONG_OUT", () => {
    const out = process.env.BB_SOFT1_LONG_OUT;
    if (!out) throw new Error("BB_SOFT1_LONG_OUT names the rows file to write");
    const units = (process.env.BB_SOFT1_LONG_UNITS ?? PLAYABLE_HEROES.map((h) => `${h}:${MAX_DAY + 1}-${LONG_RUN_GEN_DAYS}`).join(","))
      .split(",").map((u) => { const [h, r] = u.split(":"); const [a, b] = r.split("-").map(Number); return { hero: h as HeroId, from: a, to: b ?? a }; });
    const rows: { world: string; picks: Record<string, Record<string, [string, string]>> } = existsSync(out)
      ? (JSON.parse(readFileSync(out, "utf8")) as typeof rows)
      : { world: SOFT1_WORLD, picks: {} };
    expect(rows.world).toBe(SOFT1_WORLD);
    withLongRun(() => {
      softStaleCheck(); // the rule is read in SOFT1_WORLD only
      for (const u of units) {
        for (let day = u.from; day <= u.to; day++) {
          if (rows.picks[u.hero]?.[String(day)]) { console.log(`SOFT1-LONG ${u.hero} day ${day}: already in ${out}`); continue; }
          const t0 = Date.now();
          const [a, b] = softDecks(u.hero, day);
          const row: [string, string] = [softPickKey(u.hero, day, a), softPickKey(u.hero, day, b)];
          (rows.picks[u.hero] ??= {})[String(day)] = row;
          writeFileSync(out, JSON.stringify(rows) + "\n");
          console.log(`SOFT1-LONG ${u.hero} day ${day}: ${row.join(" ")} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        }
      }
    });
  }, 7_200_000);
});

describe("T8 (opt-in): the scratch seed pool for days 1-16", () => {
  const file = process.env.BB_SEEDPOOL_SCRATCH;
  it.skipIf(!file || !existsSync(file))("holds 192 ghosts of days 1-16, each stating its losses, every reachable state of days 1-16 covered", () => {
    withLongRun(() => {
      const pool = (JSON.parse(readFileSync(file!, "utf8")) as unknown[]).map((raw) => checkSnapshot(raw));
      expect(pool).toHaveLength(192);
      expect(new Set(pool.map((s) => s.day))).toEqual(new Set(Array.from({ length: 16 }, (_, i) => i + 1)));
      for (const s of pool) {
        expect(s.rules).toBe(RULES_VERSION);
        expect(s.losses, `${s.playerId} d${s.day}`).toBeDefined();
        expect(isReachable(s.day, s.wins, s.lives, { losses: s.losses }), `${s.playerId} d${s.day} ${s.wins}W ${s.lives} losses ${s.losses}`).toBe(true);
      }
      expect(new Set(pool.map(ghostId)).size).toBe(192);
      expect(uncoveredStates(pool)).toEqual([]);
      // the seed step's own check (server/seed.ts checkPool: the player mode with each ghost's road log and run seed, its rules, its record with
      // its stated losses) takes all 192
      expect(checkPool(JSON.parse(readFileSync(file!, "utf8")) as unknown[])).toHaveLength(192);
      // the numbers behind it: states per day, the fewest eligible ghosts at any state (D1: the floor ghosts cover every state)
      const entries = pool.map((s) => ({ id: ghostId(s), snapshot: s }));
      let states = 0, least = Infinity;
      const perDay: string[] = [];
      for (let day = 1; day <= 16; day++) {
        const rs = reachableRecords(day);
        states += rs.length;
        for (const r of rs) least = Math.min(least, eligible(entries, { rules: RULES_VERSION, day, wins: r.wins, lives: r.lives, playerId: "coverage-check", seen: [] }).length);
        perDay.push(`d${day} ${rs.length}`);
      }
      console.log(`T8 SCRATCH POOL: ${pool.length} ghosts, ${states} reachable states over days 1-16 (${perDay.join(", ")}), uncovered 0, fewest eligible ghosts at any state ${least} (MIN_ELIGIBLE ${MIN_ELIGIBLE}); with losses ${pool.filter((s) => s.losses !== undefined).length}, graded ${pool.filter((s) => typeof s.grade === "number").length}; wins max ${Math.max(...pool.map((s) => s.wins))}`);
      expect(least).toBeGreaterThanOrEqual(MIN_ELIGIBLE);
    });
  });
});
