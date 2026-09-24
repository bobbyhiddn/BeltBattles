import { describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import { migrateRun, newRun, battleSeed, type Run } from "../src/game/run";
import { duskFoe, finishDay, flawless, record, startDusk, storedFoe } from "../src/game/day";
import { makeEvent } from "../src/game/events";
import { RUN_DAYS, START_LIVES, incomeFor } from "../src/sim/content";
import type { SideStats } from "../src/sim/battle";
import type { GhostSnapshot } from "../src/game/ghosts";
import { RULES_VERSION } from "../src/sim/content";
import { startingBuild } from "../src/sim/ai";

const STATS = { damage: 0, shots: 0, firstShot: -1, idle: 0, turretTime: 0, jams: 0, burnDealt: 0, maxQueue: 0 } as unknown as SideStats;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const W = 0 as const, L = 1 as const, D = -1 as const;

/** Play a list of dusk results (0 win, 1 loss, -1 draw) through the day loop. */
function play(results: (0 | 1 | -1)[], seed = 42): Run {
  const run = newRun("furnace", seed, "test-run");
  for (const r of results) {
    if (run.over) break;
    startDusk(run, []);
    finishDay(run, r, 30, STATS, STATS);
  }
  return run;
}

describe("the 10-day run", () => {
  it("starts on day 1 with START_LIVES = 5 lives, and a run is RUN_DAYS = 10 days", () => {
    expect(RUN_DAYS).toBe(10);
    expect(START_LIVES).toBe(5);
    const run = newRun("weaver", 7);
    expect([run.day, run.lives, run.wins, run.losses, run.over, run.dusk]).toEqual([1, 5, 0, 0, null, null]);
    expect(run.version).toBe(7); // 0.6.1a: save v7 (RUN_VERSION = 7, module stars); 0.6.0b's v6 added the road fork fields
  });

  it("a dusk loss costs 1 life, a draw costs none and scores no win; income is indexed by day", () => {
    const run = newRun("furnace", 3, "a");
    const g0 = run.gold;
    startDusk(run, []);
    const r1 = finishDay(run, L, 30, STATS, STATS);
    expect([run.lives, run.losses, run.wins, run.day]).toEqual([4, 1, 0, 2]);
    expect(r1.income).toBe(incomeFor(1, false));
    startDusk(run, []);
    finishDay(run, D, 30, STATS, STATS);
    expect([run.lives, run.losses, run.wins, run.day]).toEqual([4, 1, 0, 3]);
    startDusk(run, []);
    const r3 = finishDay(run, W, 30, STATS, STATS);
    expect([run.lives, run.losses, run.wins, run.day]).toEqual([4, 1, 1, 4]);
    expect(r3.income).toBe(incomeFor(3, true));
    expect(run.gold - g0).toBe(incomeFor(1, false) + incomeFor(2, false) + incomeFor(3, true));
    expect(record(run)).toBe("1-1");
  });

  it("surviving day 10's dusk completes the run (10-0 is flawless); the score is the W-L record", () => {
    const perfect = play(Array(10).fill(W));
    expect(perfect.over).toBe("complete");
    expect(perfect.day).toBe(10);
    expect(record(perfect)).toBe("10-0");
    expect(flawless(perfect)).toBe(true);
    const bumpy = play([L, W, L, W, D, L, W, W, L, W]);
    expect(bumpy.over).toBe("complete");
    expect([bumpy.wins, bumpy.losses, bumpy.lives]).toEqual([5, 4, 1]);
    expect(flawless(bumpy)).toBe(false);
    expect(bumpy.history.map((h) => h.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const draws = play(Array(10).fill(D));
    expect([draws.over, draws.wins, draws.losses, draws.lives]).toEqual(["complete", 0, 0, 5]);
  });

  it("at 0 lives the run is lost on that day, even on day 10", () => {
    const lost = play([L, L, W, L, L, L, W, W]);
    expect(lost.over).toBe("lost");
    expect([lost.day, lost.lives, lost.losses]).toEqual([6, 0, 5]);
    expect(lost.history.length).toBe(6);
    const late = play([W, L, W, L, W, L, W, L, W, L]);
    expect(late.over).toBe("lost");
    expect(late.day).toBe(10);
  });

  it("no 12-round cap and no 7-win finish: a run is exactly as long as its days", () => {
    const run = play(Array(14).fill(W));
    expect(run.history.length).toBe(10);
    expect(run.wins).toBe(10);
  });
});

describe("dusk: the opponent is picked when dusk starts and stored", () => {
  // 0.6.0b: a GhostSnapshot v1 (rules, playerId, createdAt); `losses` only sets lives now
  const ghost = (day: number, wins: number, losses: number, runId: string): GhostSnapshot => ({
    v: 1, rules: RULES_VERSION, hero: "weaver", day, wins, lives: 5 - losses,
    build: startingBuild("weaver", 1), runId, playerId: "p-test", createdAt: 1,
  });

  it("the build screen's preview is the pick dusk makes; a reload fights the same ghost even if the pool changed", () => {
    const run = newRun("furnace", 99, "me");
    const pool = [ghost(1, 0, 0, "other")];
    const preview = duskFoe(run, pool);
    expect(storedFoe(run)).toBe(null);
    const f = startDusk(run, pool);
    expect(f).toEqual(preview);
    expect(f.kind).toBe("ghost");
    expect(run.stage).toBe("battle");
    const loaded = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(loaded.dusk).toEqual(f);
    const bigger = [...pool, ghost(1, 0, 0, "other2"), ghost(1, 0, 0, "other3")];
    expect(startDusk(loaded, bigger)).toEqual(f);
    expect(duskFoe(loaded, [])).toEqual(f);
    finishDay(loaded, W, 30, STATS, STATS);
    expect(loaded.dusk).toBe(null);
    expect(loaded.history[0].foe).toBe("GHOST · WEAVER · 0W 5♥"); // 0.6.0b: hero, wins, lives (no W-L)
    expect(loaded.history[0].ghost).toBe(true);
  });

  it("battle seeds stay what 0.5.0 used for the same day number", () => {
    const run = newRun("furnace", 1234);
    run.day = 4;
    expect(battleSeed(run)).toBe(hashSeed(1234, "battle", 4));
  });
});

// 0.6.0b: the save is v6; v3/v4/v5 saves migrate up to it. newRun carries the v6 road fields,
// which no older save has, so the old-save fixtures drop them.
const V6_FIELDS = ["road", "warlord", "warlords", "matriarchBeatenOn", "bounty", "sabotage"];

describe("save v6 and migrations", () => {
  function v4Of(run: Run, round: number, lives: number): Record<string, unknown> {
    const r = clone(run) as unknown as Record<string, unknown>;
    r.version = 4;
    r.round = round;
    r.lives = lives;
    delete r.day;
    delete r.runId;
    delete r.dusk;
    for (const k of V6_FIELDS) delete r[k]; // 0.6.0b: a v4 save has no v6 fields
    r.foe = { round, boost: 2, hull: 0, bounty: 8 };
    r.events = [{ round: 1, id: "wreck", choice: "SALVAGE", won: true }];
    r.history = [{ round: 1, outcome: "win", income: 9, bounty: 0, time: 30, player: STATS, enemy: STATS }];
    return r;
  }

  it("v7 round-trips unchanged", () => { // 0.6.1a: newRun is v7 now (was v6 since 0.6.0b)
    const run = newRun("weaver", 5, "rt");
    startDusk(run, []);
    expect(migrateRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
  });

  it("a v4 mid-run save loads (via v5, as v6) with day = its round (at most 10), lives + 2 (at most 5), no ghost picked yet", () => {
    const base = newRun("furnace", 77, "x");
    const a = migrateRun(JSON.parse(JSON.stringify(v4Of(base, 4, 2))))!;
    // 0.6.0b: v4 -> v5 -> v6, so it lands on version 6
    // 0.6.0b (B3): run.foe (0.5.0's warlord modifiers) is retired; pending road effects live in run.bounty / run.sabotage
    // 0.6.1a: ... -> v6 -> v7 (module stars), so it lands on version 7
    expect([a.version, a.day, a.lives, a.dusk, (a as { foe?: unknown }).foe, a.bounty, a.sabotage]).toEqual([7, 4, 4, null, undefined, null, null]);
    expect(typeof a.runId).toBe("string");
    expect(a.events[0]).toEqual({ day: 1, id: "wreck", choice: "SALVAGE", won: true });
    expect(a.history[0].day).toBe(1);
    expect(a.history[0].foe.length).toBeGreaterThan(0);
    const b = migrateRun(JSON.parse(JSON.stringify(v4Of(base, 12, 3))))!;
    expect([b.day, b.lives]).toEqual([10, 5]);
    // no ghost yet: it is picked when dusk starts
    expect(storedFoe(b)).toBe(null);
    expect(startDusk(b, []).day).toBe(10);
  });

  it("a v4 save on the road keeps its event; an open herald/sappers event (out of the bag) is dropped", () => {
    const base = newRun("furnace", 88, "y");
    const onRoad = v4Of(base, 3, 1);
    onRoad.stage = "event";
    onRoad.event = { ...makeEvent(88, 3, "dice"), round: 3 };
    delete (onRoad.event as Record<string, unknown>).day;
    const m = migrateRun(JSON.parse(JSON.stringify(onRoad)))!;
    expect(m.stage).toBe("event");
    expect(m.event!.day).toBe(3);
    expect(m.event!.id).toBe("dice");
    expect(m.road).toEqual({ day: 3, pick: "event" }); // 0.6.0b (v5 -> v6): past its caravan, the fork pick is the event
    const herald = v4Of(base, 3, 1);
    herald.stage = "event";
    herald.event = { round: 3, id: "herald", roll: 0.5, pick: 0.5, picked: -1 };
    const h = migrateRun(JSON.parse(JSON.stringify(herald)))!;
    expect([h.stage, h.event]).toEqual(["caravan", null]);
    expect(h.road).toBe(null); // 0.6.0b: back at its caravan, no fork pick yet
  });

  it("a v3 save migrates through v4 and v5 to v6", () => {
    const run = newRun("weaver", 777, "z") as unknown as Record<string, unknown>;
    const v3: Record<string, unknown> = { ...clone(run), version: 3, round: 2, lives: 3, shop: { wagons: (run.shop as { wagons: unknown }).wagons, rerolls: 0 } };
    // 0.6.0b: a v3 save has none of the v6 fields either
    for (const k of ["day", "runId", "dusk", "stage", "event", "foe", "nextShop", "events", ...V6_FIELDS]) delete v3[k];
    const m = migrateRun(JSON.parse(JSON.stringify(v3)))!;
    // 0.6.0b: v3 -> v4 -> v5 -> v6 lands on version 6, with the v6 road fields at their defaults
    expect([m.version, m.day, m.lives, m.stage, m.event, m.dusk]).toEqual([7, 2, 5, "caravan", null, null]); // 0.6.1a: then v6 -> v7
    expect([m.road, m.warlord, m.warlords, m.matriarchBeatenOn, m.bounty, m.sabotage]).toEqual([null, null, [], null, null, null]);
    expect([m.shop.discount, m.shop.free]).toEqual([0, 0]);
    expect(m.events).toEqual([]);
    expect(migrateRun({ version: 2, build: {}, shop: {}, inventory: [] })).toBe(null);
    expect(migrateRun(null)).toBe(null);
  });
});
