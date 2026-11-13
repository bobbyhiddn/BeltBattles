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
  CASUAL_TARGET, CURVE_PICKS_FILE_ENV, DEPTH_SLOTS, DEPTH_SLOT_BASE, DEPTH_VARIANT, SOFT1_CURVE, SOFT1_WORLD, STREAK_FIRST_DAY, STREAK_LAST_DAY, STREAK_RECORDS, STREAK_SLOT_BASE, STREAK_TARGET, STREAK_VARIANT, // BUMP-1I: + DEPTH_SLOT_BASE, STREAK_SLOT_BASE (the take's seeding, R4.3)
  baseSamplePool, curveGhosts, depthDeckByRule, depthSlot, depthSlots, drawnLabel, poolDepth, seedable, softDeckOf, softPickKey, streakDeckByRule, streakRecord, streakSlot,
  type SoftDeck,
} from "../tools/samplePool";
import { playerRoadLog, playerRun } from "../src/sim/harness/player";

afterEach(() => setCurve(CURVE));

describe("BUMP-1H CURVE: the pool's new slots (shape; no battles)", () => {
  // BUMP-1H run 3 (step R2; the tables are filled): was "a CURVE-on pool holds no new ghost while both tables are empty and no scratch rows are named (P1 to P3's take and P4's R2)"
  // (withCurve(() => expect(curveGhosts(192)).toEqual([]))). Now the tables STREAK_PICKS and DEPTH_PICKS hold the rules' picks: a CURVE-on pool holds, after its 192, the streak ghosts
  // (variant 3: 4 heroes x days STREAK_FIRST_DAY..STREAK_LAST_DAY, the record streakRecord names) and then the depth ghosts (variant 4, DEPTH_SLOTS' days and records), in the slot order.
  it("a CURVE-on pool holds the tables' new ghosts after the 192: the streak ghosts hero by hero and day by day, then the depth ghosts in DEPTH_SLOTS' order (R2's tables)", () => {
    const was = process.env[CURVE_PICKS_FILE_ENV];
    delete process.env[CURVE_PICKS_FILE_ENV];
    try {
      withLongRun(() => withCurve(() => {
        const ghosts = curveGhosts(192);
        const days = STREAK_LAST_DAY - STREAK_FIRST_DAY + 1;
        expect(ghosts).toHaveLength(PLAYABLE_HEROES.length * days + DEPTH_SLOTS.length); // BUMP-1I (REQ-BFG-125, P3's take E525: the tier is days 5-16, 12 days a hero): 48 + 14; was 24 + 14 (days 7-12)
        ghosts.slice(0, PLAYABLE_HEROES.length * days).forEach((g, i) => {
          const hero = PLAYABLE_HEROES[Math.floor(i / days)], day = STREAK_FIRST_DAY + (i % days);
          const [wins, lost] = streakRecord(day), rec = drawnLabel(day, wins, lost);
          expect([g.playerId, g.day, g.wins, g.lives], `streak ${hero} day ${day}`).toEqual([`sample-${hero}-${STREAK_VARIANT}`, day, rec.wins, rec.lives]);
        });
        ghosts.slice(PLAYABLE_HEROES.length * days).forEach((g, i) => {
          const [day, wins, lost] = DEPTH_SLOTS[i], rec = drawnLabel(day, wins, lost);
          expect([g.day, g.wins, g.lives, g.playerId.endsWith(`-${DEPTH_VARIANT}`)], `depth slot ${i}`).toEqual([day, rec.wins, rec.lives, true]);
        });
      }));
    } finally {
      if (was !== undefined) process.env[CURVE_PICKS_FILE_ENV] = was;
    }
  }, 600_000);

  it("the slot indexes continue generateSamplePool's order: 192 ghosts (4 heroes x 3 slots x 16 days), then the streak ghosts hero by hero and day by day, then the depth ghosts", () => {
    withLongRun(() => {
      expect(poolDepth()).toBe(LONG_RUN_GEN_DAYS);
      // BUMP-1H run 2, THE TAKE (RULING-BUMP1H-R3: from day 7): the tier is days 7-12 (STREAK_FIRST_DAY..STREAK_LAST_DAY, 6 days a hero, 24 ghosts); was (the first take, days 6-12, 7 days a hero, 28 ghosts): 192 + 6, 192 + 7, 192 + 3 * 7 + 6, 192 + 28, 192 + 28 + 5;
      // and in the brief's days 2-16 (15 days a hero, 60 ghosts): 192 + 14, 192 + 15, 192 + 3 * 15 + 14, 192 + 60, 192 + 60 + 5
      // BUMP-1I (REQ-BFG-125, P3's take E525; RULING-BUMP1H-R4 R4.3): the tier is days 5-16 (12 days a hero, 48 ghosts) and the streak grade's battles are seeded by HERO AND DAY, not by the tier's slot index: streakSlot = curveBase (192) + STREAK_SLOT_BASE 100
      // + hero index x poolDepth (16) + day - 1, so the picks stay put when the tier's span moves; the depth ghosts keep the slots they had (DEPTH_SLOT_BASE 24 = bb-0.15.0's 4 x 6 tier ghosts). Was (days 7-12, slot = 192 + hero index x 6 + day - 7): [7, 12], 192, 192 + 5, 192 + 6, 192 + 3 * 6 + 5.
      expect([STREAK_FIRST_DAY, STREAK_LAST_DAY]).toEqual([5, 16]);
      expect([STREAK_SLOT_BASE, DEPTH_SLOT_BASE]).toEqual([100, 24]);
      expect(streakSlot("furnace", STREAK_FIRST_DAY)).toBe(192 + 100 + 4);
      expect(streakSlot("furnace", STREAK_LAST_DAY)).toBe(192 + 100 + 15);
      expect(streakSlot("weaver", 5)).toBe(192 + 100 + 16 + 4);
      expect(streakSlot("bastion", 16)).toBe(192 + 100 + 3 * 16 + 15);
      expect(depthSlot(0)).toBe(192 + 24);
      expect(depthSlot(5)).toBe(192 + 24 + 5);
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
      expect(streakRecord(STREAK_FIRST_DAY)).toEqual([4, 0]); // BUMP-1I (REQ-BFG-125, P3's take E525): the tier's first day is 5 and reads the row [4, 0] (no row moved); was [6, 0] (BUMP-1H run 2, RULING-BUMP1H-R3: the first day was 7)
    });
  });

  it("seedable: a deck seedGhost would refuse is never a candidate (furnace day 15's seed-7 par deck, found at P3, has a route that ends on no free turret connector); the committed furnace day 5 pick is", () => {
    withLongRun(() => withCurve(() => {
      const days7 = playerRun("furnace", 15, 7), bad: SoftDeck = { build: days7[14].build, seed: 7, road: playerRoadLog(days7, 15) };
      expect(seedable("furnace", 15, bad)).toBe(false);
      const days1 = playerRun("furnace", 5, 1), good: SoftDeck = { build: days1[4].build, seed: 1, road: playerRoadLog(days1, 5) };
      expect(softPickKey("furnace", 5, good)).toBe("f1:c9c07b3b"); // SOFT1_PICKS' furnace day 5, slot 0
      expect(seedable("furnace", 5, good)).toBe(true);
    }));
  }, 120_000);

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
    // BUMP-1H run 2, THE TAKE (RULING-BUMP1H-R1 R1.4 (2), R1.5; RULING-BUMP1H-R3: from day 7, was day 6; the REPORT's section 8): casual 500, streak 450 on days 7-12, V0's 13 depth slots plus (11, 4, 1); was: no constants (the tables were empty, the targets the screens' first reads)
    expect([CASUAL_TARGET, STREAK_TARGET]).toEqual([500, 525]); // BUMP-1I (REQ-BFG-125, P3's take E525: tools/samplePool.ts STREAK_TARGET): was [500, 450]
    expect(DEPTH_SLOTS).toHaveLength(14);
    expect(DEPTH_SLOTS[13]).toEqual([11, 4, 1]);
    expect(STREAK_LAST_DAY).toBeGreaterThanOrEqual(STREAK_FIRST_DAY); // BUMP-1H run 2: the tier's days are STREAK_FIRST_DAY..STREAK_LAST_DAY (16 = to the pool's last day)
    expect(STREAK_LAST_DAY).toBeLessThanOrEqual(LONG_RUN_GEN_DAYS);
    expect(SOFT1_CURVE).toBe(true); // BUMP-1H run 3 (step R2): was false (P1: SOFT1_PICKS was bb-0.14.0's, slot 1 par-graded); R2 re-read the table under CURVE and set this true
    expect(SOFT1_WORLD).toBe("111111111111g");
  });
});

// ---------------------------------------------------------------- opt-in: the rule
describe("BUMP-1H CURVE (opt-in): the streak and depth picks' rule", () => {
  type Rows = { world: string; streak: Record<string, Record<string, string>>; depth: Record<string, string> };
  it.skipIf(process.env.BB_CURVE_RULE !== "1")("the rule: streak picks (BB_CURVE_UNITS) and, with BB_CURVE_DEPTH=1, depth picks, written to BB_CURVE_OUT", () => {
    const out = process.env.BB_CURVE_OUT;
    if (!out) throw new Error("BB_CURVE_OUT names the rows file to write");
    const units = (process.env.BB_CURVE_UNITS ?? PLAYABLE_HEROES.map((h) => `${h}:${STREAK_FIRST_DAY}-${Math.min(LONG_RUN_GEN_DAYS, STREAK_LAST_DAY)}`).join(",")) // BUMP-1H run 2: STREAK_LAST_DAY ends the tier
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
