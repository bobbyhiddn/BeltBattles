// SUS-A (REQ-BFG-069), the brief's parity check 2: WARD STONE's kind is SHIELD's now (startShield: 3 SHIELD at t = 0,
// Battle.shieldHit where blockHits stopped a hit). Decks holding WARD STONE and no other SHIELD battle exactly as on num2
// (bf22f8d, blockHits): tests/fixtures/susa-wardstone-num2.json is num2's record of 288 battles (a temporary
// tools/susaWardGen.ts built in a num2 worktree; the decks are stored in it): the start build and the day-6 ref build of
// FURNACE, WEAVER, FOUNDRY and BASTION, every ordered pair of different heroes, WARD STONE on side 0, side 1 or both,
// seeds 1 and 2. Winner, ticks, time, both hulls, plating, hits stopped and every stat must match.
// NUM-3 (REQ-BFG-046, REQ-BFG-047): SUS-A proved the identity with num2 at susa f4b611e. NUM-3's rules move 72 of these
// battles, exactly WEAVER's day-6 ref deck's (6 foes x 2 orders x 3 placements x 2 seeds): it holds a GALVANIC COIL, whose
// STUN is a whole 2 s now (was 1.6 s, N1 2.2); no winner flipped. So the record is re-made on num3 with the same decks,
// pairs, placements and seeds:
// tests/fixtures/num3-wardstone.json (W/output-num3/parity/num3WardGen.ts; was susa-wardstone-num2.json). The checks are
// unchanged; from here the record pins WARD STONE's SHIELD battles as num3 fights them.
// BAL-2 (REQ-BFG-069; 0.9.1's hero lines, cap's REVIEW-BAL1): FURNACE's hull 2000 -> 2100, WEAVER's 1800 -> 1700 and the
// KILN's HEAT 12 -> 13 move 240 of the 288 battles, exactly those with a FURNACE or WEAVER deck (with the three lines put
// back, all 288 replay as recorded); 12 winners flipped. So the record is re-made on bal2 under bb-0.9.1 with the same
// decks, pairs, placements and seeds: tests/fixtures/bal2-wardstone.json (W/output-bal2/parity/bal2WardGen.ts, NUM-3's
// generator; was num3-wardstone.json, rules bb-0.8.7). The checks are unchanged.
// Y7b2 (REQ-BFG-070, REQ-BFG-046; release Y's flip, bb-0.9.3): release Y's one-line rules move 132 of the 288 battles (the
// decks hold pieces whose rules the flip changed), 12 winners flipped. So the record is re-made on y7b2 under bb-0.9.3 with
// the same decks, pairs, placements and seeds: tests/fixtures/y7b2-wardstone.json (T/output-y7b2/parity/zz-y7b2-ward.test.ts,
// a one-run scratch generator in BAL-2's generator's form; was bal2-wardstone.json, rules bb-0.9.1). The checks are unchanged.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Battle } from "../src/sim/battle";
import { SUSTAIN_IDS } from "../src/sim/content";
import { cloneBuild, type Build } from "../src/sim/deck";
import { withHullScale } from "../src/sim/hullScale"; // AZ-BUMP (the flip): the record's switch-off world
import { withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip): the record's switch-off world

interface Row { a: number; b: number; ward: [boolean, boolean]; seed: number; winner: number | null; ticks: number; t: number; sides: unknown[] }
const fx = JSON.parse(readFileSync(new URL("./fixtures/y7b2-wardstone.json", import.meta.url), "utf8")) as // Y7b2 (was bal2-wardstone.json; BAL-2: was num3-wardstone.json)
  { rules: string; decks: { hero: string; kind: string; build: Build }[]; rows: Row[] };
const ward = (b: Build): Build => ({ ...cloneBuild(b), runes: [...(b.runes ?? []), { id: "ward_stone" }] });

describe("SUS-A parity: WARD STONE as SHIELD battles as recorded (num2's blockHits at susa; re-recorded on num3)", () => {
  it("the record: 288 battles under bb-0.9.3; no deck holds a RIVETER or any other SHIELD, HEAL or REGEN piece", () => {
    expect([fx.rules, fx.rows.length, fx.decks.length]).toEqual(["bb-0.9.3", 288, 8]); // Y7b2: re-recorded under bb-0.9.3 (was bb-0.9.1, BAL-2's; bb-0.8.7, NUM-3's)
    for (const d of fx.decks) for (const p of [...d.build.items, ...d.build.mods]) expect(["riveter", ...SUSTAIN_IDS], `${d.hero} ${d.kind}`).not.toContain(p.def);
    expect(fx.rows.filter((r) => r.ward[0] || r.ward[1]).length).toBe(288);
  });

  it("every battle: the same winner, ticks, time, hulls, plating, hits stopped and stats", () => withLadderFix(() => withHullScale(() => {
    // AZ-BUMP (the flip, LADDER_FIX): the record is bb-0.9.3's, the switch-off world, replayed bit for bit (not re-recorded:
    // its point is WARD STONE's SHIELD and the engine's other paths unchanged). The flip moved exactly the 72 battles of
    // FOUNDRY's day-6 ref deck (6 foes x 2 orders x 3 placements x 2 seeds), the one deck holding a QUENCH TANK, whose ★1
    // pays 40 a BURN with LADDER_FIX on (was 30), so the replay runs with LADDER_FIX off. HULL_SCALE off too, the record's
    // world (these battles have no day, so it moves none of them)
    const bad: string[] = [];
    let stopped = 0;
    for (const r of fx.rows) {
      const a = fx.decks[r.a].build, b = fx.decks[r.b].build;
      const bt = new Battle(r.ward[0] ? ward(a) : a, r.ward[1] ? ward(b) : b, r.seed);
      expect(bt.sides.map((s) => s.shield ?? 0)).toEqual(r.ward.map((w) => (w ? 3 : 0)));
      while (!bt.over && bt.ticks < 60 * 200) { bt.step(); bt.events.length = 0; }
      const now = { winner: bt.winner, ticks: bt.ticks, t: bt.t,
        sides: bt.sides.map((s) => ({ hp: s.hull.hp, max: s.hull.max, plate: s.plate.plate, gained: s.plate.gained, blocked: s.blocked ?? 0, stats: s.stats })) };
      stopped += now.sides.reduce((x, s) => x + s.blocked, 0);
      const want = { winner: r.winner, ticks: r.ticks, t: r.t, sides: r.sides };
      if (JSON.stringify(now) !== JSON.stringify(want)) bad.push(`${fx.decks[r.a].hero}/${fx.decks[r.a].kind} v ${fx.decks[r.b].hero}/${fx.decks[r.b].kind} ward ${r.ward} seed ${r.seed}`);
    }
    expect(bad).toEqual([]);
    expect(stopped).toBeGreaterThan(288 * 3); // the stones did stop hits: at least 3 a battle on average
  }, false), false));
});
