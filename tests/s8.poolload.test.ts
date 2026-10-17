// S8 T1a (REQ-BFG-092, REQ-BFG-078, REQ-BFG-077; cause a48010b, AZ-BUMP S3's road log; BRIEF-S8 T1a; REVIEW-AZBUMP-PRE8 "S8
// owes", cap's answer (4) to AZ-BUMP run 5): the client's bundled-pool loader (src/net/fallback.ts loadGhostPool) checks a
// pool entry in the player mode the way the seed step does (server/seed.ts checkPool: validateUpload by the snapshot's own
// rules, with its road log as ctx.road; the loader also passes its run seed and its LAST CHANCE), so a road-fed entry's drops
// count through its road log, exactly as for a player's upload. No blanket allowance: the same entry without its log is held
// to the road's gold alone (roadCap) and refused on the budget line, as the seed step refuses it.
// The switches are the shipped ones (every switch on); each test puts NPC_DAY, HULL_SCALE and LADDER_FIX back after.
import { afterEach, describe, expect, it } from "vitest";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { setHullScale } from "../src/sim/hullScale";
import { setLadderFix } from "../src/sim/ladderFix";
import { roadDropValue, setNpcDay, type RoadEntry } from "../src/sim/npcDay";
import { caravanCandidate } from "../src/sim/harness/caravan";
import type { Build } from "../src/sim/deck";
import { buildCost, maxHonestSpend, validateBuild } from "../src/net/validate";
import { floorRecord } from "../src/net/records";
import { SNAPSHOT_V3, SNAPSHOT_VERSION } from "../src/net/snapshot";
import { loadGhostPool } from "../src/net/fallback";
import { SeedError, checkPool } from "../server/seed";
import { raceGhosts } from "../tools/samplePool";

afterEach(() => {
  // the shipped values (AZ-BUMP's flip); a test that needs a switch off sets it off itself
  setNpcDay(true);
  setHullScale(true);
  setLadderFix(true);
});

/** A seed-pool snapshot as tools/samplePool.ts seedGhost writes it (the floor record), with or without its road log. */
function snap(hero: HeroId, day: number, build: Build, k: number, road?: RoadEntry[]) {
  const rec = floorRecord(day);
  return JSON.parse(JSON.stringify({
    v: road || build.runes?.length ? SNAPSHOT_V3 : SNAPSHOT_VERSION, rules: RULES_VERSION, hero, day, wins: rec.wins, lives: rec.lives, build,
    runId: `s8-t1a-${k}`, playerId: `s8-t1a-${k}`, createdAt: 1_760_000_000_000 + k * 1000, ...(road ? { road } : {}),
  })) as unknown;
}
/** The seed step's verdict on one entry: "passed", or its SeedError's message. */
const seedStep = (raw: unknown): string => {
  try { checkPool([raw]); return "passed"; } catch (e) { expect(e).toBeInstanceOf(SeedError); return (e as Error).message; }
};
/** The loader's verdict on one entry: "passed", or its rejection's error. */
const loader = (raw: unknown): string => {
  const load = loadGhostPool([raw]);
  return load.entries.length === 1 && !load.rejected.length ? "passed" : load.rejected.map((r) => r.error).join(" | ");
};

describe("S8 T1a: the bundled-pool loader takes the seed step's rule (cause a48010b)", () => {
  it("a road-fed entry with a placed drop loads with its road log and is refused without it, as the seed step does", () => {
    // stand-in candidates (caravan.ts, capped at 2 stars, as the generator draws them) whose deck holds a drop, days 1-3:
    // azbump.n3's sample (its seed-step test), read through the loader
    const found: string[] = [];
    let k = 0, withDrop = 0;
    for (const hero of ["furnace", "weaver"] as const) for (let day = 1; day <= 3; day++) for (let idx = 0; idx < 16 && found.length < 3; idx++) {
      const c = caravanCandidate(hero, day, 1, idx, 2);
      const at = `${hero} d${day} #${idx} (${c.meta.policy} ${c.meta.seed})`;
      const log = c.meta.log!;
      if (!(roadDropValue(log) > 0)) continue;
      withDrop++;
      // with its log: the loader and the seed step both pass it (an honest deck's log never costs it)
      const on = snap(hero, day, c.build, k++, log);
      expect([loader(on), seedStep(on)], at).toEqual(["passed", "passed"]);
      // without it: the loader refuses exactly what the seed step refuses, on the same budget line
      const off = snap(hero, day, c.build, k++);
      const [l, s] = [loader(off), seedStep(off)];
      if (s === "passed") { expect(l, at).toBe("passed"); continue; }
      const drops = log.filter((e) => e.drop).map((e) => e.drop!);
      expect(drops.some((d) => JSON.stringify(c.build).includes(`"${d}"`)), `${at}: the deck holds its drop`).toBe(true);
      expect(buildCost(c.build).total, at).toBeGreaterThan(maxHonestSpend(day));
      expect(l, at).toMatch(/^budget: build costs \d+ gold .* but a player's day \d+ allows at most \d+ \(maxGoldByDay \d+ \+ roadCap \d+/);
      expect(s, at).toContain(`validateUpload: ${l}`);
      found.push(at);
    }
    expect(withDrop, "road-fed decks with a drop in the sample").toBeGreaterThan(0);
    expect(found.length, "road-fed decks the loader refuses without their road log, in the sample").toBeGreaterThan(0);
  }, 300_000); // azbump.n3's sample: 20 s alone (32 caravan runs); room for a loaded suite

  it("the seed pool's 96 race ghosts (v3, each with its par run's road log and run seed) load whole; the old strict check refused some", () => {
    // BUMP-1D: raceGhosts() is the long world's (days 1-16, 2 race heroes x 3 variants x 16 = 96; was 60, days 1-10), each stating its losses
    const ghosts = raceGhosts();
    expect(ghosts.length).toBe(96);
    const load = loadGhostPool(JSON.parse(JSON.stringify(ghosts)));
    expect(load.rejected).toEqual([]);
    expect(load.entries).toHaveLength(96);
    expect(checkPool(ghosts).length).toBe(96);
    // the loader before S8 T1a: validateBuild in the strict mode, the shop's gold alone (its budget line refuses a deck its
    // road paid for); read here, so the move is named, not pinned
    const strictRefused = ghosts.filter((g) => !validateBuild(g.build, g.day).ok).length;
    console.log(`S8 T1a: race ghosts the strict check refuses: ${strictRefused} of 96; the loader now: ${load.rejected.length}`);
    expect(strictRefused).toBeGreaterThan(0);
  }, 300_000); // azbump.n3's race test: 20 s alone (24 par runs); BUMP-1D: 96 ghosts over days 1-16, more par runs (the 12 field runs to day 16 per hero)
});
