// SUS-A (REQ-BFG-069), the brief's parity check 2: WARD STONE's kind is SHIELD's now (startShield: 3 SHIELD at t = 0,
// Battle.shieldHit where blockHits stopped a hit). Decks holding WARD STONE and no other SHIELD battle exactly as on num2
// (bf22f8d, blockHits): tests/fixtures/susa-wardstone-num2.json is num2's record of 288 battles (a temporary
// tools/susaWardGen.ts built in a num2 worktree; the decks are stored in it): the start build and the day-6 ref build of
// FURNACE, WEAVER, FOUNDRY and BASTION, every ordered pair of different heroes, WARD STONE on side 0, side 1 or both,
// seeds 1 and 2. Winner, ticks, time, both hulls, plating, hits stopped and every stat must match.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Battle } from "../src/sim/battle";
import { SUSTAIN_IDS } from "../src/sim/content";
import { cloneBuild, type Build } from "../src/sim/deck";

interface Row { a: number; b: number; ward: [boolean, boolean]; seed: number; winner: number | null; ticks: number; t: number; sides: unknown[] }
const fx = JSON.parse(readFileSync(new URL("./fixtures/susa-wardstone-num2.json", import.meta.url), "utf8")) as
  { rules: string; decks: { hero: string; kind: string; build: Build }[]; rows: Row[] };
const ward = (b: Build): Build => ({ ...cloneBuild(b), runes: [...(b.runes ?? []), { id: "ward_stone" }] });

describe("SUS-A parity: WARD STONE as SHIELD battles as num2's blockHits", () => {
  it("the record: 288 battles under bb-0.8.7; no deck holds a RIVETER or any other SHIELD, HEAL or REGEN piece", () => {
    expect([fx.rules, fx.rows.length, fx.decks.length]).toEqual(["bb-0.8.7", 288, 8]);
    for (const d of fx.decks) for (const p of [...d.build.items, ...d.build.mods]) expect(["riveter", ...SUSTAIN_IDS], `${d.hero} ${d.kind}`).not.toContain(p.def);
    expect(fx.rows.filter((r) => r.ward[0] || r.ward[1]).length).toBe(288);
  });

  it("every battle: the same winner, ticks, time, hulls, plating, hits stopped and stats", () => {
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
  });
});
