import { describe, expect, it } from "vitest";
import { migrateRun, newRun, rollShop, type Run } from "../src/game/run";
import { choicesFor, eventFor, makeEvent, pickChoice } from "../src/game/events";
import { BAG_IDS, type EventId } from "../src/game/eventDefs";
import { REWARD_GOLD, SABOTAGE_HULL, finishWarlord, forkFor, pickRoad } from "../src/game/road";
import { chooseFoe, finishDay, startDusk, storedFoe } from "../src/game/day";
import type { GhostSnapshot } from "../src/game/ghosts";
import { rivalBuild } from "../src/sim/rivals";
import { startingBuild } from "../src/sim/ai";
import { RULES_VERSION } from "../src/sim/content";
import type { SideStats } from "../src/sim/battle";

// 0.6.0b B3 (DESIGN.md decision 5): the road events that act on foes are retargeted to warlords.
// ELITE BOUNTY (herald): stake 3 gold, +10 for beating your next HARD warlord, a lost stake is gone.
// SABOTAGE (sappers): 4 gold, your next warlord fights with rivalBuild(id, day - 1), or -25 hull when
// it has no deck for that day. SCOUT: SPY (1 gold) reveals tonight's dusk deck, the one dusk uses.
// None of them ever touches a dusk ghost.

const STATS = { damage: 0, shots: 0, firstShot: -1, idle: 0, turretTime: 0, jams: 0, burnDealt: 0, maxQueue: 0 } as unknown as SideStats;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A run on the road of `day`, having picked the fork's EVENT card with event `id`. */
function onEvent(id: EventId, day: number, seed = 4242, gold = 20): Run {
  const run = newRun("furnace", seed);
  run.day = day;
  run.gold = gold;
  rollShop(run);
  run.road = { day, pick: "event" };
  run.event = makeEvent(seed, day, id);
  run.stage = "event";
  return run;
}

/** Dusk (won) and on to the next dawn. */
function nextDay(run: Run): void {
  startDusk(run, []);
  finishDay(run, 0, 30, STATS, STATS);
}

describe("B3: herald and sappers are back in the bag", () => {
  it("both show up on real forks across seeds", () => {
    expect(BAG_IDS).toEqual(expect.arrayContaining(["herald", "sappers", "scout"]));
    const seen = new Set<string>();
    for (let s = 1; s <= 60; s++) for (let d = 1; d <= 10; d++) seen.add(eventFor(s * 7919, d));
    expect(seen.has("herald") && seen.has("sappers")).toBe(true);
  });
});

describe("B3: ELITE BOUNTY (herald)", () => {
  it("stake 3: beating the next HARD warlord pays its reward + 10; lives never change", () => {
    const run = onEvent("herald", 3);
    const g0 = run.gold;
    expect(pickChoice(run, 0).ok).toBe(true);
    expect(run.gold).toBe(g0 - 3);
    expect(run.bounty).toEqual({ day: 3, stake: 3, pay: 10 });
    nextDay(run);
    const g1 = run.gold, lives = run.lives;
    expect(pickRoad(run, "hard").ok).toBe(true);
    expect(run.warlord!.bounty).toBe(10);
    expect(run.bounty).toBe(null);
    const r = finishWarlord(run, 0, 21)!;
    expect([r.gold, r.bountyPaid]).toEqual([REWARD_GOLD.hard + 10, 10]);
    expect(run.gold).toBe(g1 + REWARD_GOLD.hard + 10);
    expect(run.lives).toBe(lives);
  });

  it("a lost stake is gone: no gold, no life, nothing pending", () => {
    const run = onEvent("herald", 2);
    pickChoice(run, 0);
    nextDay(run);
    const g1 = run.gold, lives = run.lives;
    pickRoad(run, "hard");
    finishWarlord(run, 1, 25);
    expect([run.gold, run.lives, run.bounty]).toEqual([g1, lives, null]);
  });

  it("an Easy or Medium warlord leaves the stake waiting; unfought, it never pays", () => {
    const run = onEvent("herald", 2);
    pickChoice(run, 0);
    nextDay(run);
    const g1 = run.gold;
    pickRoad(run, "easy");
    expect(run.warlord!.bounty).toBe(0);
    finishWarlord(run, 0, 20);
    expect(run.gold).toBe(g1 + REWARD_GOLD.easy);
    expect(run.bounty).toEqual({ day: 2, stake: 3, pay: 10 });
    // the run goes on with events only: the stake is never paid
    for (let d = run.day; d <= 10 && !run.over; d++) {
      nextDay(run);
      expect(run.bounty?.pay).toBe(10);
    }
  });
});

describe("B3: SABOTAGE (sappers)", () => {
  it("4 gold: the next warlord of any tier fights with its day - 1 deck; the sabotage is used up", () => {
    const run = onEvent("sappers", 4);
    const g0 = run.gold;
    expect(pickChoice(run, 0).ok).toBe(true);
    expect([run.gold, run.sabotage]).toEqual([g0 - 4, { day: 4 }]);
    nextDay(run);
    const id = forkFor(run).warlords.medium;
    pickRoad(run, "medium");
    expect(run.warlord!.sabotaged).toBe(true);
    expect(run.warlord!.build).toEqual(rivalBuild(id, 4));
    expect(run.sabotage).toBe(null);
  });

  it("the Iron Matriarch on day 8 has no day-7 deck: she fights with her day-8 deck at -25 hull", () => {
    for (const seed of [1, 99, 4242, 777777]) {
      const run = newRun("weaver", seed);
      run.day = 8;
      run.sabotage = { day: 7 };
      pickRoad(run, "hard");
      const w = run.warlord!;
      expect(w.id).toBe("matriarch");
      expect(w.build).toEqual({ ...rivalBuild("matriarch", 8), hullBonus: rivalBuild("matriarch", 8).hullBonus - SABOTAGE_HULL });
    }
  });

  it("a pending bounty and sabotage survive a save and reload (v6)", () => {
    const run = newRun("furnace", 31337);
    run.day = 5;
    run.bounty = { day: 4, stake: 3, pay: 10 };
    run.sabotage = { day: 4 };
    const back = migrateRun(clone(run))!;
    expect([back.bounty, back.sabotage]).toEqual([{ day: 4, stake: 3, pay: 10 }, { day: 4 }]);
  });

  it("neither ever touches the dusk ghost", () => {
    const run = newRun("furnace", 555);
    run.day = 6;
    const plain = chooseFoe(run, []);
    run.bounty = { day: 5, stake: 3, pay: 10 };
    run.sabotage = { day: 5 };
    expect(chooseFoe(run, [])).toEqual(plain);
  });
});

describe("B3: SCOUT's SPY", () => {
  it("1 gold reveals tonight's dusk foe; dusk fights exactly that stored deck, even if the pool changes", () => {
    const run = onEvent("scout", 3);
    const cs = choicesFor(run);
    expect(cs.map((c) => c.label)).toEqual(["HAGGLE", "SEND WORD", "SPY"]);
    const g0 = run.gold;
    expect(pickChoice(run, 2).ok).toBe(true);
    expect(run.gold).toBe(g0 - 1);
    expect(run.event!.reveal).toBe(true);
    const shown = clone(storedFoe(run)!);
    expect(shown).toEqual(chooseFoe(run, []));
    const ghost: GhostSnapshot = {
      v: 1, rules: RULES_VERSION, hero: "weaver", day: 3, wins: run.wins, lives: run.lives,
      build: startingBuild("weaver", 1), runId: "other-run", playerId: "p-other", createdAt: 1,
    };
    expect(chooseFoe(run, [ghost]).kind).toBe("ghost"); // a fresh pick would now meet the ghost...
    expect(startDusk(run, [ghost])).toEqual(shown); // ...but dusk fights the revealed deck
    const back = migrateRun(clone(run))!;
    expect(back.dusk).toEqual(shown);
  });
});
