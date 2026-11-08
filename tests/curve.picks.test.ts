// BUMP-1H (REQ-BFG-124; BRIEF-BUMP1H P1): THE CURVE's pool slots (tools/samplePool.ts): the streak tier, the depth ghosts and the casual grade.
// The default tests are cheap shape checks (no battles): the slots' order, the default streak records, the empty-table state. The opt-in
// test is the picks' RULE (CURVE_REBUILD): it runs the streak rule (par-field dusk decks nearest STREAK_TARGET on the par grade) and the depth rule
// (casual-graded candidates nearest CASUAL_TARGET that the pool does not already hold) and writes the rows to BB_CURVE_OUT, as tests/run1.seedpool.test.ts
// does for SOFT-1 (BB_SOFT1_LONG_RULE). It must run in SOFT1_PICKS' world with the variant 0 and 1 decks of the same world named by
// BB_SOFT1_PICKS_FILE (the rows of the same run), CURVE on:
//   BB_CURVE_RULE=1 BB_CURVE_OUT=<rows.json> [BB_CURVE_UNITS=furnace:2-16,weaver:2-5] [BB_CURVE_DEPTH=1] npx vitest run tests/curve.picks.test.ts -t "the rule"
// BB_CURVE_UNITS is a list of hero:from-to (default: every playable hero, days 2-16: the streak picks); BB_CURVE_DEPTH=1 adds the depth picks of
// DEPTH_SLOTS (after the streak picks of the file). The rows file is written after every pick and read back first, so a killed run resumes.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { HeroId } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { LONG_RUN_GEN_DAYS, WIN_GOAL, withLongRun } from "../src/sim/longRun";
import { encodeStarred } from "../src/sim/standInPool";
import { isReachable } from "../src/net/records";
import { CURVE, setCurve, withCurve } from "../src/net/curve";
import {
  CASUAL_TARGET, CURVE_PICKS_FILE_ENV, DEPTH_SLOTS, DEPTH_VARIANT, SOFT1_CURVE, SOFT1_WORLD, STREAK_FIRST_DAY, STREAK_RECORDS, STREAK_TARGET, STREAK_VARIANT,
  baseSamplePool, curveGhosts, depthDeckByRule, depthSlot, depthSlots, drawnLabel, poolDepth, softDeckOf, softPickKey, streakDeckByRule, streakRecord, streakSlot,
} from "../tools/samplePool";

afterEach(() => setCurve(CURVE));

describe("BUMP-1H CURVE: the pool's new slots (shape; no battles)", () => {
  it("a CURVE-on pool holds no new ghost while both tables are empty and no scratch rows are named (P1 to P3's take and P4's R2)", () => {
    const was = process.env[CURVE_PICKS_FILE_ENV];
    delete process.env[CURVE_PICKS_FILE_ENV];
    try {
      withCurve(() => expect(curveGhosts(192)).toEqual([]));
    } finally {
      if (was !== undefined) process.env[CURVE_PICKS_FILE_ENV] = was;
    }
  });

  it("the slot indexes continue generateSamplePool's order: 192 ghosts (4 heroes x 3 slots x 16 days), then the streak ghosts hero by hero and day by day, then the depth ghosts", () => {
    withLongRun(() => {
      expect(poolDepth()).toBe(LONG_RUN_GEN_DAYS);
      expect(streakSlot("furnace", STREAK_FIRST_DAY)).toBe(192);
      expect(streakSlot("furnace", 16)).toBe(192 + 14);
      expect(streakSlot("weaver", 2)).toBe(192 + 15);
      expect(streakSlot("bastion", 16)).toBe(192 + 3 * 15 + 14);
      expect(depthSlot(0)).toBe(192 + 60);
      expect(depthSlot(5)).toBe(192 + 60 + 5);
    });
  });

  it("the streak record by day: wins + dusks lost = dusks fought, wins at most WIN_GOAL - 1 (a run ghost is a dusk before its 10th win), an undefeated record while the day is young, and every one a record a run can carry", () => {
    withLongRun(() => {
      for (let day = STREAK_FIRST_DAY; day <= LONG_RUN_GEN_DAYS; day++) {
        const [wins, lost] = streakRecord(day);
        expect(wins + lost, `day ${day}`).toBe(day - 1);
        expect(wins, `day ${day}`).toBeLessThanOrEqual(WIN_GOAL - 1);
        const rec = drawnLabel(day, wins, lost);
        expect(rec.wins, `day ${day}`).toBe(wins);
        expect(isReachable(day, rec.wins, rec.lives), `day ${day} ${wins}W ${rec.lives}`).toBe(true);
      }
      expect(streakRecord(2)).toEqual([1, 0]);
      expect(streakRecord(6)).toEqual([5, 0]);
    });
  });

  it("the constants: the variants are distinct from the sample (0, 1) and floor (2) variants; the depth list is at most 24 and every slot a reachable record; the targets are the screens' first reads", () => {
    expect([STREAK_VARIANT, DEPTH_VARIANT]).toEqual([3, 4]);
    expect(DEPTH_SLOTS.length).toBeLessThanOrEqual(24);
    withLongRun(() => {
      for (const [day, wins, lost] of DEPTH_SLOTS) {
        const rec = drawnLabel(day, wins, lost);
        expect(isReachable(day, rec.wins, rec.lives), `depth slot day ${day} ${wins}-${lost}`).toBe(true);
      }
      for (const [day, row] of Object.entries(STREAK_RECORDS)) expect(row[0] + row[1], `day ${day}`).toBe(Number(day) - 1);
    });
    expect(typeof CASUAL_TARGET).toBe("number");
    expect(typeof STREAK_TARGET).toBe("number");
    expect(SOFT1_CURVE).toBe(false); // BUMP-1H P1: SOFT1_PICKS is bb-0.14.0's (slot 1 par-graded); P4's step R2 re-reads it under CURVE and sets this true
    expect(SOFT1_WORLD).toBe("111111111111g");
  });
});

// ---------------------------------------------------------------- opt-in: the rule
describe("BUMP-1H CURVE (opt-in): the streak and depth picks' rule", () => {
  type Rows = { world: string; streak: Record<string, Record<string, string>>; depth: Record<string, string> };
  it.skipIf(process.env.BB_CURVE_RULE !== "1")("the rule: streak picks (BB_CURVE_UNITS) and, with BB_CURVE_DEPTH=1, depth picks, written to BB_CURVE_OUT", () => {
    const out = process.env.BB_CURVE_OUT;
    if (!out) throw new Error("BB_CURVE_OUT names the rows file to write");
    const units = (process.env.BB_CURVE_UNITS ?? PLAYABLE_HEROES.map((h) => `${h}:${STREAK_FIRST_DAY}-${LONG_RUN_GEN_DAYS}`).join(","))
      .split(",").filter(Boolean).map((u) => { const [h, r] = u.split(":"); const [a, b] = r.split("-").map(Number); return { hero: h as HeroId, from: a, to: b ?? a }; });
    const rows: Rows = existsSync(out) ? (JSON.parse(readFileSync(out, "utf8")) as Rows) : { world: SOFT1_WORLD, streak: {}, depth: {} };
    expect(rows.world).toBe(SOFT1_WORLD);
    const save = (): void => writeFileSync(out, JSON.stringify(rows) + "\n");
    withLongRun(() => withCurve(() => {
      for (const u of units) {
        for (let day = u.from; day <= u.to; day++) {
          if (rows.streak[u.hero]?.[String(day)]) { console.log(`CURVE-STREAK ${u.hero} day ${day}: already in ${out}`); continue; }
          const t0 = Date.now();
          const { deck, grade } = streakDeckByRule(u.hero, day);
          const key = softPickKey(u.hero, day, deck);
          (rows.streak[u.hero] ??= {})[String(day)] = key;
          save();
          console.log(`CURVE-STREAK ${u.hero} day ${day}: ${key} par grade ${grade} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        }
      }
      if (process.env.BB_CURVE_DEPTH === "1") {
        // the decks the pool already holds by day: the 192 (baseSamplePool: the variant 0, 1 and floor ghosts), the streak decks, the depth picks made so far
        const takenByDay = new Map<number, Set<string>>();
        const take = (day: number, code: string): void => { if (!takenByDay.has(day)) takenByDay.set(day, new Set()); takenByDay.get(day)!.add(code); };
        for (const g of baseSamplePool()) take(g.day, encodeStarred(g.build));
        for (const [hero, byDay] of Object.entries(rows.streak)) for (const [day, key] of Object.entries(byDay)) take(Number(day), encodeStarred(softDeckOf(hero as HeroId, Number(day), key).build));
        depthSlots().forEach(([day], i) => {
          const have = rows.depth[String(i)];
          if (have) {
            const m = /^([a-z]+):(.+)$/.exec(have)!;
            take(day, encodeStarred(softDeckOf(m[1] as HeroId, day, m[2]).build));
            console.log(`CURVE-DEPTH ${i} day ${day}: already in ${out}`);
            return;
          }
          const t0 = Date.now();
          const { hero, deck, grade } = depthDeckByRule(i, takenByDay.get(day) ?? new Set());
          const key = `${hero}:${softPickKey(hero, day, deck)}`;
          rows.depth[String(i)] = key;
          take(day, encodeStarred(deck.build));
          save();
          console.log(`CURVE-DEPTH ${i} day ${day}: ${key} casual grade ${grade} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        });
      }
    }));
  }, 7_200_000);
});
