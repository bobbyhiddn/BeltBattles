// RUNES-1 M4 (REQ-BFG-058, decision 10) built this parity record on the base c57de36 (bb-0.8.6) so the launch could carry
// the bb-0.8.6 pools forward (content.ts POOL_RULES_CARRIED). NUM-1 to NUM-3 relaxed its exact check (a flip cap of 7, then
// 25, then 38, and the NUM2_DECKS_DIFFER / NUM3_DECKS_DIFFER lists), each under the RULES_VERSION tripwire, until R6.
// FLIP-X2 (RUNES-2a section 3 step 6; NUM2-REPORT section 12 and NUM3-REPORT section 7: "re-record the fixture, restore the
// exact check"): RE-BASED on release X. POOL_RULES_CARRIED is empty (no pool is carried), so the record now pins the pools
// release X ships: tests/fixtures/runes.parity.x.json, written on flipx2 under bb-0.9.0 by the writer below
// (BB_RUNES_PARITY_WRITE=<commit> npx vitest run tests/runes.parity.test.ts), from the regenerated seed pool
// (tools/samplePool.ts generateSamplePool, 120 ghosts, v3 with their runes) and each day's dusk stand-in (standInGhost of
// the record's `standInRun`, its standInBuild deck with the captain's runes): 130 decks. The 360 battles keep RUNES-1's
// plan (the same kinds, pairs and seeds: on each day each seed ghost against the next one in pool order, "ring"; against
// the day's stand-in, "standin"; the stand-in against it on the player's side, "standin2"), replayed on these decks. A row
// holds the winner, ticks, t, both hulls (hp, max), both plating pools (PlateState) and both sides' SideStats, compared
// EXACTLY.
//  - the decks: this build's seed pool and stand-ins are the record's, deck for deck, and each holds exactly `day` runes;
//  - the battles: each one replayed here (new Battle(a, b, seed), stepped until over) gives the record's row.
// Gone with the re-base: NUM-2's NUM2_DECKS_DIFFER (11) and flip cap 25, NUM-3's NUM3_DECKS_DIFFER (9) and flip cap 38, the
// NUM-1 x10 conversion of the base's decks, CATCHUP-089's stand-in pack allowance (it compared with the base's decks; the
// record's stand-ins now hold their packs) and the bb-0.8.6 base fixture (tests/fixtures/runes.parity.base.json).
// Re-run after any change to the sim: npx vitest run --maxWorkers=4 tests/runes.parity.test.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

const X_PATH = new URL("./fixtures/runes.parity.x.json", import.meta.url);
const MAX_TICKS = 200_000; // far past BATTLE_CAP; a battle that has not ended by then is a failure

/** The record's fight, verbatim: one battle stepped to its end. */
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

/** A replayed battle as the record holds it, through the same JSON round trip (every PlateState and SideStats field). */
function asRow(got: ReturnType<typeof fight>, plan: Pick<Row, "kind" | "a" | "b" | "seed">): Row {
  return JSON.parse(JSON.stringify({ kind: plan.kind, a: plan.a, b: plan.b, seed: plan.seed, ...got })) as Row;
}

/** This build's 130 decks: the seed pool's 120 ghosts (hero-v<variant>-d<day>) and each day's dusk stand-in. */
function decksNow(standInRun: number): Record<string, Build> {
  const out: Record<string, Build> = {};
  for (const s of generateSamplePool()) out[`${s.hero}-v${s.playerId.slice(-1)}-d${s.day}`] = s.build;
  for (let day = 1; day <= 10; day++) {
    const id = standInGhost(standInRun, day);
    out[`standin-${id}-d${day}`] = standInBuild(id, day);
  }
  return JSON.parse(JSON.stringify(out)) as Record<string, Build>;
}

/** The day a record deck is built for (its key's d<day>). */
const dayOf = (k: string): number => Number(/-d(\d+)$/.exec(k)![1]);

// the writer: BB_RUNES_PARITY_WRITE=<commit> re-records the fixture on this build, keeping the battle plan (kinds, pairs,
// seeds) of the record it replaces (runes.parity.x.json, or RUNES-1's base fixture the first time)
if (process.env.BB_RUNES_PARITY_WRITE) {
  it("writes tests/fixtures/runes.parity.x.json on this build (BB_RUNES_PARITY_WRITE)", () => {
    const basePath = new URL("./fixtures/runes.parity.base.json", import.meta.url);
    const old = JSON.parse(readFileSync(existsSync(X_PATH) ? X_PATH : basePath, "utf8")) as Fixture;
    const decks = decksNow(old.standInRun);
    expect(Object.keys(decks).sort()).toEqual(Object.keys(old.decks).sort());
    const battles = old.battles.map((p) => asRow(fight(decks[p.a], decks[p.b], p.seed), p));
    const F: Fixture = {
      // CATCHUP-091: re-written at 36e7214 (cap's ruling 3c58471c74bdc4ed Q5 (1): LONGTOOTH's counterweight back on day 4,
      // re-placed in day order, moves his day-7 dusk stand-in's part ids); the seed pool and the battle plan as BAL-2 left them
      // Y7b2: was "CATCHUP-091 (REQ-BFG-024): the parity record re-written at 36e7214 under bb-0.9.1 after the captains' plan moves (LONGTO..."
      // CATCHUP-093 (REQ-BFG-024): re-written at 0a4ea7c (the named stand-ins' packs a few days earlier: LONGTOOTH's day-4 pack
      // moves his day-7 dusk stand-in's part ids); the seed pool and the battle plan as Y7b2 left them. Was "Y7b2 (REQ-BFG-070,
      // REQ-BFG-046): the parity record re-written at 4d772e4 under bb-0.9.3, release Y's rules (the flip, the fuse rule, the..."
      about: "CATCHUP-093 (REQ-BFG-024): the parity record re-written at 0a4ea7c under bb-0.9.3 after the captains' plan moves (LONGTOOTH's day-4 pack moves his day-7 dusk stand-in's part ids); Y7b2's seed pool and the battle plan (kinds, pairs, seeds) kept",
      base: process.env.BB_RUNES_PARITY_WRITE, rules: RULES_VERSION, salt: old.salt, standInRun: old.standInRun,
      decksCount: Object.keys(decks).length, battlesCount: battles.length, decks, battles,
    };
    writeFileSync(X_PATH, JSON.stringify(F) + "\n");
  }, 300_000);
}

describe("release X parity: the record and its decks", () => {
  it("was written on flipx2 under this build's rules, the rules its pools were generated under (POOL_RULES; nothing carried)", () => {
    const F = JSON.parse(readFileSync(X_PATH, "utf8")) as Fixture;
    expect(F.rules).toBe(RULES_VERSION);
    expect(RULES_VERSION).toBe("bb-0.9.7"); // Z-BUMP: the bump and the fixture re-written under it (was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0)
    expect(POOL_RULES_CARRIED).toEqual({});
    expect(POOL_RULES).toBe(F.rules);
    expect([Object.keys(F.decks).length, F.battles.length]).toEqual([F.decksCount, F.battlesCount]);
    expect([F.decksCount, F.battlesCount]).toEqual([130, 360]);
    expect(F.battles.map((r) => r.kind).filter((k, i, all) => all.indexOf(k) === i)).toEqual(["ring", "standin", "standin2"]);
  });

  it("its decks are this build's seed pool and dusk stand-ins, deck for deck, and each holds exactly `day` runes", () => {
    const F = JSON.parse(readFileSync(X_PATH, "utf8")) as Fixture;
    const now = decksNow(F.standInRun);
    expect(Object.keys(now).sort()).toEqual(Object.keys(F.decks).sort());
    const differ = Object.keys(F.decks).filter((k) => !isDeepStrictEqual(now[k], F.decks[k]));
    expect(differ, differ.join(", ")).toEqual([]);
    for (const [k, b] of Object.entries(F.decks)) expect(b.runes?.length, k).toBe(dayOf(k));
  }, 120_000);
});

describe("release X parity: the battles", () => {
  it("every one of the 360 battles replays exactly as recorded (winner, ticks, time, hulls, plating, stats)", () => {
    const F = JSON.parse(readFileSync(X_PATH, "utf8")) as Fixture;
    const t0 = performance.now();
    const moved: string[] = [];
    for (const want of F.battles) {
      const got = asRow(fight(F.decks[want.a], F.decks[want.b], want.seed), want);
      if (!isDeepStrictEqual(got, want)) moved.push(`${want.kind} ${want.a} vs ${want.b} (seed ${want.seed}): winner ${got.winner} (${want.winner}), ticks ${got.ticks} (${want.ticks})`);
    }
    console.log(`runes parity (release X): ${F.battles.length} battles replayed in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${moved.length} rows moved`);
    expect(moved, moved.slice(0, 10).join("\n")).toEqual([]);
  }, 120_000);
});
