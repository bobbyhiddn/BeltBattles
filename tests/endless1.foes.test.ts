// ENDLESS-1 3.3 (REQ-BFG-059): THE FOES, for an endless dusk on day d: (1) other players' endless ghosts of day d, nearest endless wins
// first; (2) the nearest earlier day's endless ghost (within ENDLESS_WIDEN_DAYS); (3) THE GOD STAND-IN: the stand-in pool's strongest
// deck at standInDay(d) on day d's own hull, plus ENDLESS_GOD_HULL_STEP per endless win. PvE only. An endless request reads only
// endless ghosts; a run request never reads one.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { HEROES, RULES_VERSION } from "../src/sim/content";
import { ENDLESS, ENDLESS_FIRST_DAY, ENDLESS_GOD_HULL_STEP, ENDLESS_WIDEN_DAYS, endlessMatchDays, inEndless, setEndless } from "../src/sim/endless";
import { GOD_NAME, godBuild, godEntry, godFoe } from "../src/sim/godStandIn";
import { STAND_IN_POOL_DAYS, STAND_IN_POOL_HEROES, standInDay, standInPool } from "../src/sim/standInPool";
import { chooseFoe, ghostName, onlineFoe, startEndless, finishDay, foeTitle } from "../src/game/day";
import { pickGhost } from "../src/game/ghosts";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { eligible, ghostDayOk, matchDays, matchSeed, pickGhost as serverPick, type MatchRequest } from "../src/net/matchmaking";
import { matchPick } from "../src/net/pick";
import { ghostId, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { Rng } from "../src/core/rng";
import type { FetchedGhost } from "../src/net/ghostClient";
import { withEndless } from "../src/sim/endless";
import { playEndless, WIN, LOSS } from "./endless1.honest";
import { TEST_NAME } from "./netIdentity";

setPlayerName(TEST_NAME);
beforeAll(() => setEndless(true)); // the snapshots' endless fields and the endless request are read only with the switch on
afterAll(() => setEndless(ENDLESS));

// ---- the GOD stand-in ------------------------------------------------------------------------------------------------------------
describe("ENDLESS-1 3.3: THE GOD STAND-IN (sim/godStandIn.ts)", () => {
  it("is the pool's strongest deck of the day: the highest vsPar across every hero of the pool, then the higher pct (brute force, days 1-16)", () => {
    expect(STAND_IN_POOL_DAYS).toBe(16);
    for (let day = 1; day <= STAND_IN_POOL_DAYS; day++) {
      const all = STAND_IN_POOL_HEROES.flatMap((h) => standInPool(h, day));
      const best = [...all].sort((a, b) => b.vsPar - a.vsPar || b.pct - a.pct)[0];
      const god = godEntry(day);
      expect([god.hero, god.vsPar, god.pct, god.day]).toEqual([best.hero, best.vsPar, best.pct, day]);
      expect(god.build).toEqual(best.build);
      expect(all.every((e) => e.vsPar <= god.vsPar)).toBe(true);
    }
  });

  it("past day 16 it is day 16's deck (standInDay clamps: the pool's deepest day), whatever the day", () => {
    const d16 = godEntry(16);
    for (const d of [17, 25, 40, 64]) {
      expect(standInDay(d)).toBe(16);
      expect(godEntry(d).build).toEqual(d16.build);
      expect(godEntry(d).day).toBe(16);
    }
  });

  it("is deterministic and hands out fresh copies (a caller that changes its deck cannot change the next foe)", () => {
    const a = godBuild(14, 2);
    a.hullBonus += 99999;
    a.items.length = 0;
    const b = godBuild(14, 2);
    expect(b.items.length).toBeGreaterThan(0);
    expect(b.hullBonus).toBe(godBuild(14, 2).hullBonus);
  });

  it("the hull step: ENDLESS_GOD_HULL_STEP (1500) per endless win on top of the pool deck's own hull; none for no win; a step can be given", () => {
    expect(ENDLESS_GOD_HULL_STEP).toBe(1500); // BUMP-1F (RULING-BUMP1F-R9 R9.2): was 250 (par's mean endless wins 6.81 at 250, 4.24 at 1500 on the R3' tip; band 2-6; the title said 250 too)
    const base = godEntry(13).build.hullBonus;
    expect(godBuild(13, 0).hullBonus).toBe(base);
    expect(godBuild(13, 1).hullBonus).toBe(base + ENDLESS_GOD_HULL_STEP);
    expect(godBuild(13, 7).hullBonus).toBe(base + 7 * ENDLESS_GOD_HULL_STEP);
    expect(godBuild(13, 7, 1000).hullBonus).toBe(base + 7000);
    expect(godBuild(13, -3).hullBonus).toBe(base); // never below the deck's own
    expect(godFoe(13, 2)).toMatchObject({ name: GOD_NAME, hero: godEntry(13).hero });
    expect(godFoe(13, 2).build.hero).toBe(godEntry(13).hero);
  });

  it("fights on day d's own hull: the battle takes the day (hullScale M(d)) for both sides, so the same deck is far heavier on day 30 than on day 16", () => {
    const hull = (d: number) => simulate(godBuild(d, 0), godBuild(d, 0), 11, 1, undefined, d).sides[0].hull.max; // one tick: just the hulls
    expect(hull(30)).toBeGreaterThan(hull(16));
    expect(hull(64)).toBeGreaterThan(hull(30));
  });

  it("is a deck the sim fights to an end (days 12, 16, 30)", () => {
    for (const d of [12, 16, 30]) {
      const b = simulate(godBuild(d, 3), godBuild(d, 0), d, undefined, undefined, d);
      expect(b.over).toBe(true);
    }
  });
});

// ---- the endless dusk's foe -------------------------------------------------------------------------------------------------------
const NOSTATS = {} as never;
function endlessRun(): Run {
  const run = withEndless(() => newRun("furnace", 777, "foes-run"));
  while (!run.over) {
    const offer = pendingRune(run);
    if (offer) takeRune(run, offer.ids[0]);
    finishDay(run, 0, 20, NOSTATS, NOSTATS);
  }
  expect(startEndless(run)).toBe(true);
  return run;
}

/** A pool ghost: an honest endless snapshot of `day` for `wins` endless wins (or a run ghost: no endless fields), by another player. */
function ghost(base: GhostSnapshot, over: Partial<GhostSnapshot>, run = false): GhostSnapshot {
  const g = { ...base, playerId: "other-player", runId: `other-${over.day ?? base.day}-${over.endlessWins ?? 0}`, ...over } as GhostSnapshot;
  g.victoryDay = 10; // the earliest victory: any (day, endless wins) with wins <= day - 11 is a consistent snapshot
  g.losses = 0;
  g.endlessLives = g.lives = over.lives ?? 3;
  if (run) {
    delete g.mode; delete g.endlessWins; delete g.endlessLives; delete g.victoryDay; delete g.losses;
    g.wins = Math.min(g.wins, 9);
    g.lives = Math.max(g.lives, 1);
  }
  return g;
}

describe("ENDLESS-1 3.3: chooseFoe for an endless dusk (day.ts)", () => {
  const honest = playEndless("weaver", 3, "someone-else", { endlessOutcomes: [WIN, WIN, WIN, LOSS, WIN] });
  const base = honest.endlessSnaps[2];

  it("at launch nobody has endless ghosts: the foe is the GOD stand-in (kind standin, flagged god, no captain), hull by the endless wins", () => {
    const run = endlessRun();
    run.endlessRun!.wins = 4;
    const f = chooseFoe(run, []);
    expect(f).toMatchObject({ kind: "standin", name: GOD_NAME, god: true, day: run.day });
    expect(f.rival).toBeUndefined();
    expect(f.build.hullBonus).toBe(godEntry(run.day).build.hullBonus + 4 * ENDLESS_GOD_HULL_STEP);
    expect(f.hero).toBe(godEntry(run.day).hero);
  });

  it("an endless dusk reads only ENDLESS ghosts: a run ghost of the same day is never its foe", () => {
    const run = endlessRun();
    const runGhost = ghost(base, { day: run.day, rules: RULES_VERSION }, true);
    expect(chooseFoe(run, [runGhost])).toMatchObject({ kind: "standin", god: true });
  });

  it("(1) the nearest ENDLESS WINS first, not the nearest record of the run, and no 'no better record' rule", () => {
    const run = endlessRun();
    run.endlessRun!.wins = 4;
    const pool = [1, 2, 9, 5].map((w) => ghost(base, { day: run.day, endlessWins: w, lives: 2 }));
    const f = chooseFoe(run, pool);
    expect(f.kind).toBe("ghost");
    expect(f.record!.endlessWins).toBe(5); // |5 - 4| = 1 beats |2 - 4|; and 5 > 4 is allowed: endless is not D1's
    expect(f.name).toBe(ghostName({ ...pool[3], hero: pool[3].hero }));
    expect(f.name).toContain("ENDLESS 5");
    expect(foeTitle(f)).toMatch(/· ENDLESS 5$/);
  });

  it("(2) with none on the day, the nearest EARLIER day's endless ghost within the window; never a later day's, never one past the window", () => {
    const run = endlessRun();
    for (let i = 0; i < 12; i++) finishDay(run, 0, 20, NOSTATS, NOSTATS); // twelve endless wins: day 23, far from the first endless day
    const d = run.day;
    expect(d).toBeGreaterThanOrEqual(ENDLESS_FIRST_DAY + ENDLESS_WIDEN_DAYS + 3);
    run.endlessRun!.wins = 2;
    const near = ghost(base, { day: d - 2, endlessWins: 3 });
    const later = ghost(base, { day: d + 1, endlessWins: 2 });
    expect(chooseFoe(run, [later, near]).record!.endlessWins).toBe(3);
    expect(chooseFoe(run, [later]).kind).toBe("standin");
    const far = ghost(base, { day: d - ENDLESS_WIDEN_DAYS - 1, endlessWins: 2 });
    expect(far.day).toBeGreaterThanOrEqual(ENDLESS_FIRST_DAY); // a plausible day: the window is what excludes it
    expect(chooseFoe(run, [far])).toMatchObject({ god: true });
    const edge = ghost(base, { day: d - ENDLESS_WIDEN_DAYS, endlessWins: 2 });
    expect(chooseFoe(run, [edge]).kind).toBe("ghost"); // the window's last day is inside it
  });

  it("a run's own pick never reads an endless ghost: a pool of endless ghosts alone gives a run its stand-in captain", () => {
    const run = withEndless(() => newRun("furnace", 5, "plain-run"));
    run.day = 6;
    const pool = [ghost(base, { day: 6, endlessWins: 2 }), ghost(base, { day: 5, endlessWins: 1 })];
    const f = chooseFoe(run, pool);
    expect(f.kind).toBe("standin");
    expect(f.rival).toBeDefined();
    expect(f.god).toBeUndefined();
    expect(pickGhost(pool, { rules: RULES_VERSION, day: 6, runId: run.runId, wins: 0, lives: 10, seed: 1, long: true })).toBeNull();
  });

  it("the online answer: a server endless ghost is the foe (stamped), anything else in an endless run is the GOD, offline", () => {
    const run = endlessRun();
    for (let i = 0; i < 6; i++) finishDay(run, 0, 20, NOSTATS, NOSTATS); // day 17: room for 2 endless wins behind a ghost of today
    const g = ghost(base, { day: run.day, endlessWins: 2 });
    const fetched: FetchedGhost = { id: ghostId(g), snapshot: g, source: "server" };
    const f = onlineFoe(run, fetched);
    expect(f).toMatchObject({ kind: "ghost", source: "online" });
    expect(f.record!.endlessWins).toBe(2);
    const fb = onlineFoe(run, { ...fetched, source: "fallback" });
    expect(fb).toMatchObject({ kind: "standin", god: true, source: "offline" });
    expect(onlineFoe(run, null)).toMatchObject({ god: true });
    expect(inEndless(run)).toBe(true);
  });
});

// ---- the server's pick ------------------------------------------------------------------------------------------------------------
describe("ENDLESS-1 3.3: the match request and the pick (net/matchmaking.ts, net/pick.ts)", () => {
  const honest = playEndless("furnace", 4, "someone-else", { endlessOutcomes: [WIN, WIN, LOSS, WIN, WIN] });
  const base = honest.endlessSnaps[1];
  const entry = (g: GhostSnapshot): PoolEntry => ({ id: ghostId(g), snapshot: g });
  const D = 20; // a day with room for 9 endless wins behind it (victory day 10)
  const req = (over: Partial<MatchRequest> = {}): MatchRequest => ({ rules: RULES_VERSION, day: D, wins: 3, lives: 2, playerId: "me", seen: [], endless: true, ...over });
  const withOn = <T>(fn: () => T): T => withEndless(fn);

  it("endless request: only endless ghosts of its day are eligible, not its own, not seen; no 'no better record' rule", () => {
    const e1 = entry(ghost(base, { day: D, endlessWins: 5, runId: "r1" }));
    const e2 = entry(ghost(base, { day: D, endlessWins: 1, runId: "r2" }));
    const run1 = entry(ghost(base, { day: D, runId: "r3" }, true));
    const mine = entry(ghost(base, { day: D, endlessWins: 3, playerId: "me", runId: "r4" }));
    const other = entry(ghost(base, { day: D - 1, endlessWins: 3, runId: "r5" }));
    withOn(() => {
      const ids = eligible([e1, e2, run1, mine, other], req()).map((e) => e.id);
      expect(ids.sort()).toEqual([e1.id, e2.id].sort());
      expect(eligible([e1, e2], req({ seen: [e1.id] })).map((e) => e.id)).toEqual([e2.id]);
    });
  });

  it("a run request never reads an endless ghost (the switch on or off)", () => {
    const e1 = entry(ghost(base, { day: D, endlessWins: 0, runId: "r1" }));
    const asRun = entry({ ...ghost(base, { day: D, runId: "r2" }, true), wins: 9 });
    const runReq: MatchRequest = { rules: RULES_VERSION, day: D, wins: 9, lives: 10, playerId: "me", seen: [] };
    withOn(() => expect(eligible([e1, asRun], runReq).map((e) => e.id)).toEqual([asRun.id])); // the run's ghost is read, the endless ghost is not
    withEndless(() => expect(eligible([asRun], runReq).map((e) => e.id)).toEqual([asRun.id]), false);
  });

  it("the pick is the nearest endless wins (then hearts), over the days endlessMatchDays names", () => {
    const pool = [[D, 5, 1], [D, 2, 3], [D - 2, 3, 2], [D - 7, 1, 2]].map(([d, w, l], i) => entry(ghost(base, { day: d, endlessWins: w, lives: l, runId: `p${i}` })));
    withOn(() => {
      expect(serverPick(pool, req({ wins: 3, lives: 2 }), new Rng(1))!.snapshot.endlessWins).toBe(2); // today: |2-3| < |5-3|
      expect(serverPick(pool, req({ wins: 5, lives: 1 }), new Rng(1))!.snapshot.endlessWins).toBe(5);
      expect(serverPick([pool[2], pool[3]], req({ wins: 3 }), new Rng(1))!.snapshot.day).toBe(D - 2); // today is thin: the nearest earlier day
      expect(serverPick([pool[3]], req({ wins: 3 }), new Rng(1))).toBeNull(); // 9 days back is past the window (ENDLESS_WIDEN_DAYS)
    });
  });

  it("matchDays / ghostDayOk for an endless request: its day, then back within the window, never before the first endless day, never forward", () => {
    withOn(() => {
      expect(matchDays(req({ day: 40 }))).toEqual(endlessMatchDays(40));
      expect(matchDays(req({ day: 40 }))[0]).toBe(40);
      expect(matchDays(req({ day: 40 })).length).toBe(ENDLESS_WIDEN_DAYS + 1);
      expect(matchDays(req({ day: 12 })).at(-1)).toBe(ENDLESS_FIRST_DAY);
      expect(ghostDayOk(38, req({ day: 40 }))).toBe(true);
      expect(ghostDayOk(41, req({ day: 40 }))).toBe(false);
      expect(ghostDayOk(40 - ENDLESS_WIDEN_DAYS - 1, req({ day: 40 }))).toBe(false);
      expect(matchDays({ rules: RULES_VERSION, day: 14 })).toEqual(Array.from({ length: 14 }, (_, i) => 14 - i)); // a run's widening is the long run's, unchanged
    });
    withEndless(() => expect(matchDays(req({ day: 14 }))).toEqual(Array.from({ length: 14 }, (_, i) => 14 - i)), false); // the switch off: an endless request is read as a run's (the server refuses it earlier)
  });

  it("matchPick takes the endless path (no graded pick), and an endless seed differs from a run's", () => {
    const pool = [entry(ghost(base, { day: D, endlessWins: 4, runId: "m1" }))];
    withOn(() => expect(matchPick(pool, req(), new Rng(2))!.id).toBe(pool[0].id));
    expect(matchSeed(req())).not.toBe(matchSeed(req({ endless: undefined })));
    expect(matchSeed(req({ endless: undefined }))).toBe(matchSeed({ rules: RULES_VERSION, day: D, wins: 3, lives: 2, playerId: "me", seen: [] }));
  });

  it("endlessMatchDays itself", () => {
    expect(endlessMatchDays(30)).toEqual([30, 29, 28, 27, 26, 25, 24]);
    expect(endlessMatchDays(11)).toEqual([11]);
    expect(endlessMatchDays(14)).toEqual([14, 13, 12, 11]);
    expect(HEROES.furnace.hull).toBeGreaterThan(0);
  });
});
