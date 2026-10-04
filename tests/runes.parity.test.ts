// RUNES-1 M4 (REQ-BFG-058, decision 10): rune-less builds battle exactly as on the base 72eec7d (bb-0.8.6), so the launch
// can carry the bb-0.8.6 pools forward (content.ts POOL_RULES_CARRIED; RUNES-2 regenerates them, with runes).
// tests/fixtures/runes.parity.base.json was written ON THE BASE by a generator that is never committed (its text is kept
// as R/output-runes1/parity-gen.test.ts.txt; it runs in a throwaway worktree of 72eec7d). It holds 130 decks: the seed
// pool's 120 ghosts (tools/samplePool.ts generateSamplePool, 12 a day: FURNACE, WEAVER, FOUNDRY and BASTION, variants
// 0-2) and each day's dusk stand-in (the rival captain standInGhost picks for the run seed `standInRun`, with its
// standInBuild deck); and 360 battles: on each day, each seed ghost against the next one of that day in pool order
// (wrapping, "ring"), against the day's stand-in ("standin") and the stand-in against it, on the player's side
// ("standin2"). A row holds the winner, ticks, t, both hulls (hp, max), both plating pools (PlateState) and both sides'
// SideStats, compared exactly: the replayed row goes through the same JSON round trip as the fixture's, and a field this
// build adds to PlateState or SideStats is not compared.
//  - the decks: this build's seed pool and stand-ins are the fixture's, deck for deck, and none of them holds runes;
//  - the battles: each one replayed here (new Battle(a, b, seed), stepped until over) gives the base's row.
// Re-run after any change to the sim: npx vitest run --maxWorkers=4 tests/runes.parity.test.ts
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { POOL_RULES, POOL_RULES_CARRIED, RULES_VERSION } from "../src/sim/content";
import { Battle } from "../src/sim/battle";
import type { Build } from "../src/sim/deck";
import { standInBuild, standInGhost } from "../src/sim/rivals";
import { generateSamplePool } from "../tools/samplePool";

interface Row {
  kind: "ring" | "standin" | "standin2";
  a: string;
  b: string;
  seed: number;
  winner: number;
  ticks: number;
  t: number;
  hull: [number, number][];
  plate: Record<string, number>[];
  stats: Record<string, number>[];
}
interface Fixture {
  about: string;
  base: string;
  rules: string;
  salt: string;
  standInRun: number;
  decksCount: number;
  battlesCount: number;
  decks: Record<string, Build>;
  battles: Row[];
}

const F = JSON.parse(readFileSync(new URL("./fixtures/runes.parity.base.json", import.meta.url), "utf8")) as Fixture;
const MAX_TICKS = 200_000; // far past BATTLE_CAP; a battle that has not ended by then is a failure

/** The generator's fight, verbatim: one battle stepped to its end. */
function fight(a: Build, b: Build, seed: number) {
  const bt = new Battle(a, b, seed);
  for (let i = 0; i < MAX_TICKS && !bt.over; i++) {
    bt.step();
    bt.drainEvents();
  }
  if (!bt.over) throw new Error(`battle ${seed} did not end in ${MAX_TICKS} ticks`);
  return {
    winner: bt.winner, ticks: bt.ticks, t: bt.t,
    hull: bt.sides.map((s) => [s.hull.hp, s.hull.max]),
    plate: bt.sides.map((s) => ({ ...s.plate })),
    stats: bt.sides.map((s) => ({ ...s.stats })),
  };
}

/** A replayed battle as the fixture holds it: the base's fields only, through the same JSON round trip. */
function asBase(got: ReturnType<typeof fight>, want: Row): Row {
  const only = (o: object, keys: object) => Object.fromEntries(Object.keys(keys).map((k) => [k, (o as Record<string, unknown>)[k]]));
  return JSON.parse(JSON.stringify({
    kind: want.kind, a: want.a, b: want.b, seed: want.seed, winner: got.winner, ticks: got.ticks, t: got.t, hull: got.hull,
    plate: got.plate.map((p, i) => only(p, want.plate[i])), stats: got.stats.map((s, i) => only(s, want.stats[i])),
  })) as Row;
}

describe("RUNES-1 parity: the base's fixture and its decks", () => {
  it("was written on the base 72eec7d under bb-0.8.6, the rules bb-0.8.7 carries the pools from (POOL_RULES)", () => {
    expect(F.base).toMatch(/^72eec7d[0-9a-f]{33}$/);
    expect(F.rules).toBe("bb-0.8.6");
    expect(RULES_VERSION).toBe("bb-0.8.7");
    expect(POOL_RULES_CARRIED[RULES_VERSION]).toBe(F.rules);
    expect(POOL_RULES).toBe(F.rules);
    expect([Object.keys(F.decks).length, F.battles.length]).toEqual([F.decksCount, F.battlesCount]);
    expect([F.decksCount, F.battlesCount]).toEqual([130, 360]);
    expect(F.battles.map((r) => r.kind).filter((k, i, all) => all.indexOf(k) === i)).toEqual(["ring", "standin", "standin2"]);
  });

  it("its decks are this build's seed pool and dusk stand-ins, deck for deck, and none holds runes", () => {
    const pool = generateSamplePool();
    expect(pool).toHaveLength(120);
    for (const s of pool) {
      const k = `${s.hero}-v${s.playerId.slice(-1)}-d${s.day}`;
      expect(s.build, k).toEqual(F.decks[k]);
      expect((s as { runes?: unknown }).runes, k).toBeUndefined();
    }
    for (let day = 1; day <= 10; day++) {
      const id = standInGhost(F.standInRun, day);
      expect(standInBuild(id, day), `${id} d${day}`).toEqual(F.decks[`standin-${id}-d${day}`]);
    }
    for (const [k, b] of Object.entries(F.decks)) expect("runes" in b, k).toBe(false);
  }, 120_000);
});

describe("RUNES-1 parity: the battles", () => {
  it("rune-less builds battle exactly as on the base 72eec7d (bb-0.8.6): the same winner, ticks, time, hulls, plating and stats in all 360 battles", () => {
    const t0 = performance.now();
    const off: string[] = [];
    for (const want of F.battles) {
      const a = F.decks[want.a], b = F.decks[want.b];
      expect("runes" in a || "runes" in b, `${want.a} vs ${want.b}`).toBe(false);
      const got = asBase(fight(a, b, want.seed), want);
      if (!isDeepStrictEqual(got, want)) {
        off.push(`${want.kind} ${want.a} vs ${want.b} (seed ${want.seed}): winner ${got.winner} (base ${want.winner}), ticks ${got.ticks} (base ${want.ticks}), hull ${JSON.stringify(got.hull)} (base ${JSON.stringify(want.hull)})`);
      }
    }
    console.log(`runes parity: ${F.battles.length} battles replayed in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${off.length} differ from the base 72eec7d`);
    expect(off.slice(0, 12), `${off.length} of ${F.battles.length} battles differ from the base`).toEqual([]);
  }, 120_000);
});
