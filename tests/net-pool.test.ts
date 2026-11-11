import { describe, expect, it } from "vitest";
import { standInPick } from "../src/sim/standInPool";
import { RULES_VERSION } from "../src/sim/content";
import { fallbackGhost, loadGhostPool, offlineGhost, rivalHero } from "../src/net/fallback";
import { encodeSnapshot, ghostId } from "../src/net/snapshot";
import { validateBuild, validateUpload } from "../src/net/validate"; // S8 T1e: + validateUpload (the player mode)
import { npcDayRules } from "../src/sim/npcDay"; // S8 T1e: the budget line is left to the player mode only while NPC_DAY is on
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D: the 10-day world's exact-day pick, kept beside the long run's widening
import { DEPTH_PICKS, DEPTH_SLOTS, STREAK_FIRST_DAY, STREAK_LAST_DAY, samplePoolJson } from "../tools/samplePool"; // BUMP-1H: + the CURVE's streak days and depth slots (the pool's 230 = 192 + 24 + 14)
import { generateSamplePool } from "./helpers/poolCache"; // CACHE-1: the cached twin
import { snap, upSnap } from "./netHelpers"; // S8 T1a: upSnap, an entry as an upload travels

describe("sample pool and offline fallback", () => {
  it("generates 254 valid snapshots across days 1-16 for the four playable heroes, reproducibly", () => { // BUMP-1I (REQ-BFG-125; P3's take E525, R3 6aff36f7: 254 ghosts = the 192 + the tier's 48 (days 5-16) + the 14 depth ghosts): was 230. BUMP-1H: 230 (was 192): the CURVE's 24 streak and 14 depth ghosts follow the 192. BUMP-1D: 192 across days 1-16 (was 120 across days 1-10)
    const pool = generateSamplePool();
    expect(pool).toHaveLength(254); // BUMP-1I: was 230. BUMP-1H: was 192 (the CURVE's 24 streak and 14 depth ghosts follow the 192: 230). 0.7.0a D5: 2 sample variants and 1 floor ghost per hero and day (0.8.0 RC: four heroes, was 60); BUMP-1D: the long run's 16 days (4 x 16 x 3), was 120
    for (const hero of ["furnace", "weaver", "foundry", "bastion"]) { // 0.8.0 RC: was FURNACE and WEAVER
      for (let day = 1; day <= 16; day++) { // BUMP-1D: was 10
        // BUMP-1H: the 3 everyday ghosts (was the whole count), plus the CURVE's streak ghost on days STREAK_FIRST_DAY..STREAK_LAST_DAY (one a hero) and the depth ghosts that DEPTH_PICKS gives this hero on this day
        const streak = day >= STREAK_FIRST_DAY && day <= STREAK_LAST_DAY ? 1 : 0;
        const depth = DEPTH_PICKS.filter((p, i) => p.startsWith(`${hero}:`) && DEPTH_SLOTS[i][0] === day).length;
        expect(pool.filter((s) => s.hero === hero && s.day === day), `${hero} d${day}`).toHaveLength(3 + streak + depth);
      }
    }
    // S8 T1e (RULING-S8-R1 item 3; cause a48010b, AZ-BUMP N3): with NPC_DAY on a seed ghost is road-fed (its run fought a
    // warlord each day), so its deck may hold the road's gold and drops, which the strict mode's budget line (the shop's gold
    // alone) doesn't count by design; its drops count through its road log, in the player mode. So each ghost is held, as
    // seedGhost holds it, to validateBuild's lines minus its ONE budget line (matched by its "budget: " prefix, and only while
    // NPC_DAY is on: off, the strict check stays whole), AND to validateUpload in the player mode with its road log and run
    // seed (seedGhost's check; checkPool's since T1d). Was: validateBuild(s.build, s.day) whole.
    for (const s of pool) {
      const strict = validateBuild(s.build, s.day).errors;
      const budget = npcDayRules() ? strict.filter((e) => e.startsWith("budget: ")) : [];
      expect(budget.length, `${s.playerId} d${s.day}: at most its one budget line`).toBeLessThanOrEqual(1);
      expect(strict.filter((e) => !budget.includes(e)), `${s.playerId} d${s.day}: every other strict line`).toEqual([]);
      const up = validateUpload(s.build, s.day, s.rules, { ...(s.seed !== undefined ? { seed: s.seed } : {}), ...(s.road ? { road: s.road } : {}) });
      expect(up.errors, `${s.playerId} d${s.day}: the player mode with its road log and run seed`).toEqual([]);
    }
    // CACHE-1: was expect(samplePoolJson()).toBe(samplePoolJson(pool)): samplePoolJson()'s default argument builds the pool for real, a second ~5-10 min build per run. With the cache
    // on, the second pool is the twin's read again (what is checked: two reads agree). The fresh-build comparison, the standing canary against a stale entry, is kept
    // for BB_POOL_CACHE=0 (every twin builds, so this is the original check) and BB_POOL_CANARY=1 (cached pool against a pool built fresh in this process)
    const second = process.env.BB_POOL_CACHE === "0" || process.env.BB_POOL_CANARY === "1" ? samplePoolJson() : samplePoolJson(generateSamplePool());
    expect(second).toBe(samplePoolJson(pool));
    // S8 T1e (the GATE RULE, test only): 600 s, as the other generateSamplePool() readers have. Cause: with PICK on (HULL-ON's
    // flip 9ffda51) generateSamplePool() grades the pool, and this test builds it twice: ~50 s alone, ~125 s beside a 16-worker
    // job, over vitest's 30-s default (its packet red, an assertion, hid the time until T1e made it pass)
  }, 600_000);

  it("loads the bundled pool JSON with every entry validated", () => {
    const load = loadGhostPool(samplePoolJson(generateSamplePool())); // CACHE-1: was samplePoolJson() (its default argument builds the pool for real)
    expect(load.rejected).toEqual([]);
    expect(load.entries).toHaveLength(254); // BUMP-1I: was 230. BUMP-1H: was 192 (the CURVE's 24 streak and 14 depth ghosts follow the 192: 230). 0.8.0 RC: was 60; BUMP-1D: the long run's 16 days, was 120
    expect(new Set(load.entries.map((e) => e.id)).size).toBe(254); // BUMP-1I: was 230. BUMP-1H: was 192
  });

  it("rejects bad pool entries and keeps the good ones", () => {
    // S8 T1a (REQ-BFG-092; cause a48010b): the loader checks an entry in the player mode, the seed step's rule (was the
    // strict mode), whose rune count wants one rune a dawn: the good entry and the over-budget one travel as an upload does
    // (netHelpers upSnap: v3 holding its day's neutral runes, no seed; was snap's rune-less v1)
    const good = upSnap({ day: 2, wins: 1 });
    const overBudget = upSnap({ build: { ...good.build, hullBonus: 1000 } }); // NUM-1: four plates of 250 (was 100); day 1
    const foreignRules = snap({ rules: "bb-0.3.0" });
    const raw = [good, { ...good, extra: 1 }, overBudget, foreignRules, good, "junk"].map((s) => JSON.parse(JSON.stringify(s)));
    const load = loadGhostPool(raw);
    expect(load.entries.map((e) => e.id)).toEqual([ghostId(good)]);
    expect(load.rejected.map((r) => r.index)).toEqual([1, 2, 3, 5]);
    expect(load.rejected[1].error).toMatch(/budget/);
    expect(load.rejected[2].error).toMatch(/rules bb-0.3.0/);
    expect(() => loadGhostPool("{")).toThrow(/not valid JSON/);
    expect(() => loadGhostPool("{}")).toThrow(/array/);
  });

  it("the offline ghost is a stand-in pool deck of the other faction's hero for that day", () => {
    const g = offlineGhost("furnace", 4, 99, { wins: 2, lives: 2 });
    expect(rivalHero("furnace")).toBe("weaver");
    expect(rivalHero("weaver")).toBe("furnace");
    expect(g.id).toBe("offline-weaver-d4");
    expect(g.snapshot).toMatchObject({ hero: "weaver", day: 4, wins: 2, lives: 2, rules: RULES_VERSION });
    expect(g.snapshot.build).toEqual(standInPick("weaver", 4, 99));
    expect(() => encodeSnapshot(g.snapshot)).not.toThrow();
    expect(offlineGhost("weaver", 1, 5, { wins: 7, lives: 0 }).snapshot).toMatchObject({ hero: "furnace", wins: 0, lives: 1 });
  });

  it("fallbackGhost prefers a matching pool ghost, then the stand-in", () => {
    const { entries } = loadGhostPool(samplePoolJson(generateSamplePool())); // CACHE-1: was samplePoolJson() (its default argument builds the pool for real)
    const req = { rules: RULES_VERSION, day: 6, wins: 3, lives: 2, playerId: "me", seen: [] as string[], hero: "weaver" as const, seed: 42 };
    const hit = fallbackGhost(req, entries);
    expect(hit.snapshot.day).toBe(6);
    expect(hit.id.startsWith("g")).toBe(true);
    const all = entries.filter((e) => e.snapshot.day === 6).map((e) => e.id);
    // BUMP-1D: under the long run's rules (the shipped world) a day whose ghosts are all seen WIDENS to the nearest earlier day that has
    // one (matchmaking.ts matchDay, D6), so the stand-in comes only when no pool ghost up to the day is left unseen (was: every day-6 ghost
    // seen -> offline-furnace-d6); the old exact-day behaviour is the 10-day world's, kept under withLongRun false
    const widened = fallbackGhost({ ...req, seen: all }, entries);
    expect(widened.id.startsWith("g")).toBe(true);
    expect(widened.snapshot.day).toBe(5);
    const stand10 = withLongRun(() => fallbackGhost({ ...req, seen: all }, entries), false);
    expect(stand10.id).toBe("offline-furnace-d6");
    const stand = fallbackGhost({ ...req, seen: entries.map((e) => e.id) }, entries);
    expect(stand.id).toBe("offline-furnace-d6");
    expect(fallbackGhost(req).id).toBe("offline-furnace-d6");
  });
});
