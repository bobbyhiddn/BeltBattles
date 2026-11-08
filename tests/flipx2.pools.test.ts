// FLIP-X2 (REQ-BFG-058, REQ-BFG-069; release X, rules bb-0.9.0): what the ONE regeneration guarantees. Every regenerated
// stand-in deck, seed ghost and captain deck holds exactly `day` runes (one a dawn), each a rune the catalogue offers
// (no dormant one), so no pool deck is short or rune-less; the stand-in pool is written under this build's rules
// (backlog #350: POOL_RULES) and carries nothing forward; the seed pool travels as v3 snapshots.
import { describe, expect, it } from "vitest";
import { POOL_RULES, POOL_RULES_CARRIED, RULES_VERSION } from "../src/sim/content";
import { DORMANT_RUNES, runeProblem } from "../src/sim/runes";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { STAND_IN_POOL_DAYS, STAND_IN_POOL_HEROES, standInPool } from "../src/sim/standInPool"; // BUMP-1D: + STAND_IN_POOL_DAYS (16)
import { CAPTAIN_RUNES } from "../src/sim/rivalBuilds";
import { RIVAL_IDS, standInBuild } from "../src/sim/rivals";
import { SNAPSHOT_V3 } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { generateSamplePool } from "./helpers/poolCache";
import type { Build } from "../src/sim/deck";

/** The deck's rune problem under the exact count (the upload's rule), or null. */
const exact = (b: Build, day: number, hero: string) => runeProblem(b.runes, day, hero as never, undefined, "exact");
const noDormant = (b: Build) => (b.runes ?? []).filter((q) => DORMANT_RUNES.has(q.id)).map((q) => q.id);

describe("FLIP-X2: the regenerated pools hold their runes", () => {
  // Y7b2 (the bump, the pools): title bb-0.9.1 -> bb-0.9.3
  it("the rules: bb-0.11.0, nothing carried; the stand-in pool was written under it (POOL_RULES, #350)", () => {
    expect(RULES_VERSION).toBe("bb-0.14.0"); // BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the bump (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0)
    expect(POOL_RULES_CARRIED).toEqual({});
    expect(POOL_RULES).toBe(RULES_VERSION);
    // Y7b2 (the pools): the pool regenerated under the bump (4d772e4): was bb-0.9.1
    // Z-BUMP (the pools): was bb-0.9.3 (the pool regenerated once under the bump, 2c4ba76)
    // S8c (the pools): the stand-in pool regenerated ONCE under bb-0.10.0 with every switch on (P1 83c039d): was bb-0.9.7
    // BUMP-1D (P4 R1, 8fc5e24): the stand-in pool regenerated for days 1-16 under bb-0.11.0 with every switch on: was bb-0.10.0
    expect(STAND_IN_DATA.rules).toBe("bb-0.14.0"); // BUMP-1G (label bb-0.13.0 -> bb-0.14.0, the stand-in module's rules): was bb-0.13.0. BUMP-1F (the stand-in pool regenerated under bb-0.13.0: src/sim/standInPoolData.ts rules, RULING-BUMP1F-R5 R5.2 (2)): was bb-0.12.0. BUMP-1E: the bump (was bb-0.11.0). BAL-2: the pool regenerated under the bump (c5e4780; was bb-0.9.0)
  });

  it("every stand-in pool deck holds exactly `day` runes, none dormant", () => {
    let n = 0;
    // BUMP-1D: the pool holds days 1-16 (STAND_IN_POOL_DAYS; was 10): 2 heroes x 16 days x 6 decks = 192 (was 120)
    for (const hero of STAND_IN_POOL_HEROES) for (let day = 1; day <= STAND_IN_POOL_DAYS; day++) for (const e of standInPool(hero, day)) {
      const at = `${hero} d${day}`;
      expect(e.build.runes?.length, at).toBe(day);
      expect(exact(e.build, day, hero), at).toBeNull();
      expect(noDormant(e.build), at).toEqual([]);
      n++;
    }
    expect(STAND_IN_POOL_DAYS).toBe(16);
    expect(n).toBe(192);
  });

  it("every seed ghost is a v3 snapshot whose deck holds exactly `day` runes and passes the upload check", () => {
    const pool = generateSamplePool();
    expect(pool).toHaveLength(192); // BUMP-1D: the long world's pool, days 1-16 (was 120, days 1-10)
    for (const s of pool) {
      const at = `${s.hero} d${s.day} ${s.playerId}`;
      expect(s.v, at).toBe(SNAPSHOT_V3);
      expect(s.rules, at).toBe(RULES_VERSION);
      expect(s.build.runes?.length, at).toBe(s.day);
      expect(noDormant(s.build), at).toEqual([]);
      // AZ-BUMP (the flip, NPC_DAY; N3 a48010b): a seed ghost carries its run's road log, and the upload check counts its
      // drops through it (ctx.road), as the seed step passes it (server/seed.ts:52)
      expect(validateUpload(s.build, s.day, s.rules, s.road ? { road: s.road } : {}), at).toEqual({ ok: true, errors: [] });
    }
    // AZ-BUMP (the flip): 600 s, generateSamplePool builds the whole seed pool (par runs with a warlord fight every day); a
    // host timeout under the 1.5-CPU quota (30 s hit in run 4's shard), not the rule, as 4af1683 gave the other two
  }, 600_000);

  it("every captain's deck holds exactly `day` runes on days 1-10: its CAPTAIN_RUNES list's first `day`", () => {
    const ids = RIVAL_IDS.filter((id) => CAPTAIN_RUNES[id]);
    expect(ids.length).toBe(Object.keys(CAPTAIN_RUNES).length);
    for (const id of ids) {
      expect(CAPTAIN_RUNES[id]!.length, id).toBe(10);
      for (let day = 1; day <= 10; day++) {
        const b = standInBuild(id, day);
        expect(b.runes?.map((q) => q.id), `${id} d${day}`).toEqual(CAPTAIN_RUNES[id]!.slice(0, day));
        expect(noDormant(b), `${id} d${day}`).toEqual([]);
      }
    }
  });
});
