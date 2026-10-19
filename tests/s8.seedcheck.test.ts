// S8 T1d (REQ-BFG-092, REQ-BFG-078, REQ-BFG-077; RULING-S8-R1 item 2): the seed step passes the run seed. server/seed.ts
// checkPool now hands validateUpload each snapshot's run `seed` when it carries one, beside its road log and its LAST CHANCE,
// as T1a's loader (src/net/fallback.ts loadGhostPool) and seedGhost (tools/samplePool.ts) already do. With the seed the player
// mode re-derives the road log's warlords and their seeded drops (validate.ts roadProblem), each dawn's rune offer (runeProblem)
// and LAST CHANCE's offer (lastChanceProblem); without it only their seed-blind lines run (a served ghost's case).
//  (a) every entry of the committed bundled pool file (server/seedPoolData.ts, S8's "the pools") passes checkPool with its seed;
//  (b) one forgery only the run seed can catch: in one seeded ghost, one won road-log entry's drop becomes another part, of at
//      least the drop's road value (the budget counts drops through the log, so it still holds), that its seeded roll never
//      gave. Without its seed the entry passes checkPool, as every seeded entry did before T1d (checkPool passed no seed); with
//      its seed checkPool refuses it on the road line named below. At the tip before T1d (c7368a7) the last expectation fails:
//      checkPool accepted the forgery (output-s8/logs/t1dbefore-vitest.log).
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { roadDropValue, type RoadEntry } from "../src/sim/npcDay";
import { itemDef, roadProblem } from "../src/net/validate";
import { bundledSeedPool, checkPool } from "../server/seed";

type Raw = Record<string, unknown> & { hero: string; day: number; seed?: number; road?: RoadEntry[] };
/** checkPool on one entry: null when it passes, else its SeedError message */
const refusal = (raw: unknown): string | null => {
  try {
    checkPool([raw]);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const withoutSeed = (r: Raw): Raw => {
  const { seed: _seed, ...rest } = r;
  return rest as Raw;
};

/** The first forgery in the file's order and the catalogue's sorted order: a seeded ghost's won drop swapped for a non-legendary
 *  part of at least its road value; the seed-blind lines and checkPool without the seed pass it, roadProblem with the seed
 *  refuses it. Found with roadProblem itself, so it does not depend on what checkPool passes. */
function forgery(): { forged: Raw; at: string; line: string } | undefined {
  const ids = Object.keys(ITEMS).sort();
  for (const r of bundledSeedPool() as Raw[]) {
    if (typeof r.seed !== "number" || !r.road?.length) continue;
    for (let i = 0; i < r.road.length; i++) {
      const e = r.road[i];
      if (e.outcome !== "win" || e.drop === undefined) continue;
      for (const z of ids) {
        if (z === e.drop || itemDef(z)?.rarity === "legendary") continue;
        const road = r.road.map((x, j) => (j === i ? { ...x, drop: z } : x));
        if (roadDropValue(road) < roadDropValue(r.road)) continue;
        if (roadProblem(road, r.day) !== null) continue;
        const line = roadProblem(road, r.day, r.seed);
        if (line === null || !line.startsWith(`road: day ${e.day}: `)) continue;
        const forged: Raw = { ...r, road };
        if (refusal(withoutSeed(forged)) !== null) continue;
        return { forged, at: `${r.hero} day ${r.day} (run seed ${r.seed}), road day ${e.day} (${e.tier}): drop ${e.drop} -> ${z}`, line };
      }
    }
  }
  return undefined;
}

describe("S8 T1d: checkPool passes the run seed (RULING-S8-R1 item 2)", () => {
  it("(a) every entry of the committed bundled pool file passes checkPool with its run seed", () => {
    const raws = bundledSeedPool() as Raw[];
    const seeded = raws.filter((r) => typeof r.seed === "number");
    console.log(`S8 T1d (a): ${raws.length} entries, ${seeded.length} with a run seed, ${raws.filter((r) => r.road?.length).length} with a road log`);
    expect(seeded.length).toBeGreaterThan(0);
    expect(checkPool(raws)).toHaveLength(raws.length);
  });

  it("(b) a forged road-log drop passes checkPool without the run seed and is refused with it, on its road line", () => {
    const f = forgery();
    expect(f, "a seeded ghost with a won drop to forge").toBeDefined();
    console.log(`S8 T1d (b): ${f!.at}\n  the line: ${f!.line}`);
    // the committed file's first such forgery and its line (c6d3445's seed pool; they move only with the pools)
    // SOFT-1: the seed pool softened (REQ-BFG-092; 26769d1's seed pool, tools/samplePool.ts SOFT1_PICKS): FURNACE and WEAVER's
    // sample decks are par-field runs' dusk decks now, each with its run's seed and road log, so the file's first seeded ghost
    // with a won drop is furnace day 3's variant 0 (furnace day 1's carries a road win with no drop). Was "furnace day 1 (run
    // seed 238345644), road day 1 (medium): drop tollbooth -> anvil" (the day-1 floor ghost) and "road: day 1: anvil is not in
    // GRIMHOLD's pool"
    // BUMP-1D (the seed pool regenerated, 5e93e1e: days 1-16, 192 ghosts, SOFT_TARGET 250's picks): the file's first such forgery is still furnace
    // day 3's variant 0, but a different par-field run's deck (the pick moved with the softer target), so its run seed, its won drop and its
    // road day 1's warlord moved. Was "furnace day 3 (run seed 1174802828), road day 1 (medium): drop temper -> anvil" and
    // "road: day 1: anvil is not in EMBERLYN's pool"
    // BUMP-1E (the seed pool regenerated under bb-0.12.0, R3 04fab9a; the pools R1-R3): the file's first such forgery is furnace day 1's ghost now (its
    // road day 1 is a won medium fight with a drop, tollbooth), and the first sorted id that meets the forgery's three conditions is AEGIS SPIKE (one of the
    // seven scaling rigs, in ITEMS while SCALE_RIGS is on: "aegisspike" sorts before "anvil"); the road day 1's warlord is GRIMHOLD for this run seed. Was
    // "furnace day 3 (run seed 2913324239), road day 1 (medium): drop scrapcannon -> anvil" and "road: day 1: anvil is not in SOOTJAW's pool"
    expect(f!.at).toBe("furnace day 1 (run seed 3081100429), road day 1 (medium): drop tollbooth -> aegisspike");
    expect(f!.line).toBe("road: day 1: aegisspike is not in GRIMHOLD's pool");
    expect(refusal(withoutSeed(f!.forged))).toBeNull(); // without the seed: only the seed-blind lines run, and they pass it
    expect(refusal(f!.forged)).toContain(f!.line); // with it (T1d): refused on its road line (before T1d: passed)
  });
});
