// FLIP-X2 (REQ-BFG-058, REQ-BFG-069; release X, rules bb-0.9.0): what the ONE regeneration guarantees. Every regenerated
// stand-in deck, seed ghost and captain deck holds exactly `day` runes (one a dawn), each a rune the catalogue offers
// (no dormant one), so no pool deck is short or rune-less; the stand-in pool is written under this build's rules
// (backlog #350: POOL_RULES) and carries nothing forward; the seed pool travels as v3 snapshots.
import { describe, expect, it } from "vitest";
import { POOL_RULES, POOL_RULES_CARRIED, RULES_VERSION } from "../src/sim/content";
import { DORMANT_RUNES, runeProblem } from "../src/sim/runes";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { STAND_IN_POOL_HEROES, standInPool } from "../src/sim/standInPool";
import { CAPTAIN_RUNES } from "../src/sim/rivalBuilds";
import { RIVAL_IDS, standInBuild } from "../src/sim/rivals";
import { SNAPSHOT_V3 } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { generateSamplePool } from "../tools/samplePool";
import type { Build } from "../src/sim/deck";

/** The deck's rune problem under the exact count (the upload's rule), or null. */
const exact = (b: Build, day: number, hero: string) => runeProblem(b.runes, day, hero as never, undefined, "exact");
const noDormant = (b: Build) => (b.runes ?? []).filter((q) => DORMANT_RUNES.has(q.id)).map((q) => q.id);

describe("FLIP-X2: the regenerated pools hold their runes", () => {
  // Y7b2 (the bump, the pools): title bb-0.9.1 -> bb-0.9.3
  it("the rules: bb-0.9.7, nothing carried; the stand-in pool was written under it (POOL_RULES, #350)", () => {
    expect(RULES_VERSION).toBe("bb-0.9.7"); // Z-BUMP: the bump (was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0)
    expect(POOL_RULES_CARRIED).toEqual({});
    expect(POOL_RULES).toBe(RULES_VERSION);
    // Y7b2 (the pools): the pool regenerated under the bump (4d772e4): was bb-0.9.1
    expect(STAND_IN_DATA.rules).toBe("bb-0.9.3"); // BAL-2: the pool regenerated under the bump (c5e4780; was bb-0.9.0)
  });

  it("every stand-in pool deck holds exactly `day` runes, none dormant", () => {
    let n = 0;
    for (const hero of STAND_IN_POOL_HEROES) for (let day = 1; day <= 10; day++) for (const e of standInPool(hero, day)) {
      const at = `${hero} d${day}`;
      expect(e.build.runes?.length, at).toBe(day);
      expect(exact(e.build, day, hero), at).toBeNull();
      expect(noDormant(e.build), at).toEqual([]);
      n++;
    }
    expect(n).toBe(120);
  });

  it("every seed ghost is a v3 snapshot whose deck holds exactly `day` runes and passes the upload check", () => {
    const pool = generateSamplePool();
    expect(pool).toHaveLength(120);
    for (const s of pool) {
      const at = `${s.hero} d${s.day} ${s.playerId}`;
      expect(s.v, at).toBe(SNAPSHOT_V3);
      expect(s.rules, at).toBe(RULES_VERSION);
      expect(s.build.runes?.length, at).toBe(s.day);
      expect(noDormant(s.build), at).toEqual([]);
      expect(validateUpload(s.build, s.day, s.rules), at).toEqual({ ok: true, errors: [] });
    }
  });

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
