// AZ-BUMP (REQ-BFG-078, REQ-BFG-077; REVIEW-PARAZ N3, REVIEW-NPC1 Q5; BRIEF-AZBUMP S3): the seed step against a road-fed
// pool. With NPC_DAY on a seed deck is road-fed (its run fought a warlord each day and may hold the drops), and the player
// mode counts drops only through a road log (validate.ts roadDropValue; roadCap.ts counts road gold, not drops). So every
// pool entry carries its run's road log: the stand-in pool's tuple stores it (standInPool.ts roadWord, written by
// standins.ts dataModuleText from caravan.ts CaravanMeta.log), a race deck takes its par run's (player.ts playerRoadLog),
// tools/samplePool.ts writes it into the seed ghost's v3 snapshot, and the seed step (server/seed.ts checkPool) passes it
// as ctx.road, as an upload's is passed. No blanket allowance: a deck without its log is held to road gold alone.
// The switches are set through their own setters and all put back after each test (on: the shipped value, AZ-BUMP's flip).
import { afterEach, describe, expect, it } from "vitest";
import type { HeroId } from "../src/sim/content";
import { RULES_VERSION } from "../src/sim/content";
import { setHullScale } from "../src/sim/hullScale";
import { setLadderFix } from "../src/sim/ladderFix";
import { roadDropValue, roadLog, setNpcDay, type RoadEntry } from "../src/sim/npcDay";
import { roadOfWord, roadWord, type StandInRoadEntry } from "../src/sim/standInPool";
import { PAR_ROAD_TIER, PLAYER_DAYS, playerRoadLog, playerRun } from "../src/sim/harness/player";
import { CARAVAN_POLICY, caravanCandidate } from "../src/sim/harness/caravan";
import { writtenPicks } from "../src/sim/harness/standins";
import { buildCost, maxHonestSpend } from "../src/net/validate";
import { floorRecord } from "../src/net/records";
import { SNAPSHOT_V3, SNAPSHOT_VERSION } from "../src/net/snapshot";
import { SeedError, checkPool } from "../server/seed";
import { RACE_SEED_HEROES, raceDeck, raceGhosts } from "../tools/samplePool";
import type { Run } from "../src/game/run";

afterEach(() => {
  // the shipped value (AZ-BUMP's flip); a test that needs a switch off sets it off itself
  setNpcDay(true);
  setHullScale(true);
  setLadderFix(true);
});
const allOn = (): void => { setNpcDay(true); setHullScale(true); setLadderFix(true); };

/** A seed-pool snapshot as tools/samplePool.ts seedGhost writes it (the floor record), with or without a road log. */
function snap(hero: HeroId, day: number, build: ReturnType<typeof playerRun>[number]["build"], k: number, road?: RoadEntry[]) {
  const rec = floorRecord(day);
  return {
    v: road || build.runes?.length ? SNAPSHOT_V3 : SNAPSHOT_VERSION, rules: RULES_VERSION, hero, day, wins: rec.wins, lives: rec.lives, build,
    runId: `azbump-n3-${k}`, playerId: `azbump-n3-${k}`, createdAt: 1_760_000_000_000 + k * 1000, ...(road ? { road } : {}),
  };
}
const refusal = (raw: unknown): string => {
  try { checkPool([raw]); return "passed"; } catch (e) { expect(e).toBeInstanceOf(SeedError); return (e as Error).message; }
};

describe("AZ-BUMP N3: a pool entry's road log (REVIEW-PARAZ N3)", () => {
  it("the stand-in pool's road word reads back every entry exactly (tier, outcome, drop, sabotaged), and refuses a bad word", () => {
    const log: StandInRoadEntry[] = [
      { day: 1, tier: "medium", outcome: "win", drop: "scrapcannon" }, { day: 2, tier: "medium", outcome: "loss" },
      { day: 3, tier: "hard", outcome: "win", drop: "brake", sabotaged: true }, { day: 4, tier: "easy", outcome: "draw" },
      { day: 10, tier: "hard", outcome: "win", sabotaged: true },
    ];
    expect(roadWord(log)).toBe("1mw:scrapcannon 2ml 3hws:brake 4ed 10hws");
    expect(roadOfWord(roadWord(log))).toEqual(log);
    expect(JSON.stringify(roadOfWord(roadWord(log)))).toBe(JSON.stringify(log)); // key order: drop, then sabotaged (roadLog's)
    expect([roadWord([]), roadOfWord("")]).toEqual(["", []]);
    for (const bad of ["1xw", "1mw:", "mw", "1mq:brake", "1mw:Brake"]) expect(() => roadOfWord(bad), bad).toThrow(/bad road word/);
    // the generator's reader takes the seventh element when a tuple has one, and none when it has six
    const text = ["    furnace: [", "      [0, [ // day 1: floor 8 of 8 g", '        [14, 35.7, 0.75, "14 250 /kiln64/1:544434241404/", 1, 8, "1mw:scrapcannon"],',
      '        [12, 50, 0.5, "14 0 /kiln64/1:544434241404/", 0.9, 8],'].join("\n");
    expect(writtenPicks(text).map((w) => w.road)).toEqual(["1mw:scrapcannon", undefined]);
  });

  it("a par-player run's road log is the game's (roadLog of run.warlords), one entry a day, its drops the day's roadDrops; none with NPC_DAY off", () => {
    for (const hero of ["furnace", "bastion"] as const) {
      setNpcDay(false); // AZ-BUMP (the flip, NPC_DAY): it ships on, so each hero's off check sets it off itself
      expect(playerRoadLog(playerRun(hero, PLAYER_DAYS, 3), PLAYER_DAYS), `${hero} off`).toEqual([]);
      allOn();
      let run: Run | undefined;
      const days = playerRun(hero, PLAYER_DAYS, 3, { onDecide: (r) => { run = r; } }); // traced: the run object kept
      expect(playerRoadLog(days, PLAYER_DAYS), hero).toEqual(roadLog(run!.warlords));
      for (const d of days) {
        const log = playerRoadLog(days, d.day);
        expect([log.length, log.every((e) => e.tier === PAR_ROAD_TIER), roadDropValue(log)], `${hero} d${d.day}`).toEqual([d.day, true, d.roadDrops]);
      }
    }
  });

  it("the seed step (server/seed.ts checkPool) counts a road-fed deck's drops through its road log: it passes with the log and is refused without it", () => {
    allOn();
    // a stand-in candidate (caravan.ts, capped at 2 stars, as the generator draws them) whose deck holds a drop and costs
    // more than the player mode's road-gold ceiling (maxHonestSpend: maxGoldByDay + roadCap), on days 1-3
    const found: string[] = [];
    let k = 0;
    for (const hero of ["furnace", "weaver"] as const) for (let day = 1; day <= 3; day++) for (let idx = 0; idx < 16 && found.length < 3; idx++) {
      const c = caravanCandidate(hero, day, 1, idx, 2);
      const at = `${hero} d${day} #${idx} (${c.meta.policy} ${c.meta.seed})`;
      // the log is the candidate's run's (the generator stores exactly this: standins.ts dataModuleText), and the road
      // value the generator's budget check adds is that run's warlord gold plus the log's drops
      const run = playerRun(hero, PLAYER_DAYS, c.meta.seed, { ...CARAVAN_POLICY[c.meta.policy], maxStars: 2 });
      const log = c.meta.log!;
      expect([log, c.meta.road], at).toEqual([playerRoadLog(run, day), run[day - 1].roadGold! + roadDropValue(log)]);
      if (!(roadDropValue(log) > 0)) continue;
      // with its log every such deck passes (an honest deck's log never costs it); without it, the ones whose drops
      // took them over the road-gold ceiling are refused on the budget line, the drops then counted nowhere
      expect(refusal(snap(hero, day, c.build, k++, log)), at).toBe("passed");
      const without = refusal(snap(hero, day, c.build, k++));
      if (without === "passed") continue;
      expect(buildCost(c.build).total, at).toBeGreaterThan(maxHonestSpend(day));
      expect(without, at).toMatch(/1 of 1 pool entries failed[\s\S]*validateUpload: budget: build costs \d+ gold .* but a player's day \d+ allows at most \d+ \(maxGoldByDay \d+ \+ roadCap \d+/);
      found.push(at);
    }
    expect(found.length, "road-fed decks the seed step refuses without their road log, in the sample").toBeGreaterThan(0);
    setNpcDay(false);
    expect("log" in caravanCandidate("furnace", 3, 1, 7, 2).meta, "off: no road log").toBe(false);
  }, 120_000); // 20 s alone (32 caravan runs); room for a loaded suite (REVIEW-AZPREP N1's lesson)

  it("the seed pool's race ghosts carry their par run's road log with NPC_DAY on and pass the seed step; off, none (the snapshots as before)", () => {
    const hero = RACE_SEED_HEROES[0];
    setNpcDay(false); // AZ-BUMP (the flip, NPC_DAY): it ships on, so the off check sets it off itself
    expect(raceDeck(hero, 4, 0).road, "off").toBeUndefined();
    allOn();
    const deck = raceDeck(hero, 4, 0);
    expect(deck.road).toEqual(playerRoadLog(playerRun(hero, 4, deck.seed), 4));
    // every race ghost (FOUNDRY and BASTION, 3 variants x 10 days) through tools/samplePool.ts seedGhost's checks, then the
    // seed step's
    const ghosts = raceGhosts();
    expect(ghosts.length).toBe(60);
    for (const g of ghosts) expect([g.v, g.road?.length], `${g.hero} d${g.day}`).toEqual([SNAPSHOT_V3, g.day]);
    expect(checkPool(ghosts).length).toBe(60);
  }, 120_000); // 20 s alone (24 par runs); room for a loaded suite
});
