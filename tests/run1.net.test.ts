// RUN-1 T3 (REQ-BFG-059, REQ-BFG-116; D4, D6, D8): the net side of the long run, without a server. Bounds are DATA SAFETY: they
// refuse an upload or a request, never a run. With the switch on (withLongRun) and a long run's rules:
//  - snapshot.ts maxDayFor (25), wins 0..min(day - 1, 9) on a run ghost, R1e's `losses` taken (0..day - 1 - wins, at most 8
//    draws), LAST CHANCE on any day before the snapshot's own, the road log and the runes list as deep as the day;
//    an old v3 snapshot without `losses` stays valid; with the switch off or under older rules every bound is as it was;
//  - the client's check (ghostSnapshot.ts isSnapshot) takes exactly what the strict decoder takes;
//  - matchmaking: a thin day widens to the nearest EARLIER day with an eligible ghost, never a later one, then a stand-in for
//    the exact day (fallback.ts); the client's pool pick (ghosts.ts) mirrors it;
//  - roadCap: the event mask resets at each bag boundary, so an honest day-11+ deck that took a repeated event is accepted
//    (hull and belt mixes may take an event once per bag).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startingBuild } from "../src/sim/ai";
import { RULES_VERSION } from "../src/sim/content";
import { LONG_RUN_MAX_DAY, MAX_RUN_DRAWS, WIN_GOAL, setLongRun, withLongRun } from "../src/sim/longRun";
import { ENDLESS, ENDLESS_LAST_DAY, setEndless, withEndless } from "../src/sim/endless"; // BUMP-1E: ENDLESS ships on (bb-0.12.0); the 10-day and long-run worlds below are read with it off
import { MAX_DAY as LOCAL_MAX_DAY, isSnapshot, type GhostSnapshot as LocalSnapshot } from "../src/game/ghostSnapshot";
import { pickGhost as poolPick } from "../src/game/ghosts";
import {
  MAX_DAY, SNAPSHOT_V3, checkSnapshot, decodeSnapshot, encodeSnapshot, maxDayFor, maxRunes, maxWinsFor, type GhostSnapshot, type PoolEntry,
} from "../src/net/snapshot";
import { eligible, eligibleWide, ghostDayOk, matchDay, matchDays, pickGhost, type MatchRequest } from "../src/net/matchmaking";
import { matchPick } from "../src/net/pick";
import { fallbackGhost, offlineGhost } from "../src/net/fallback";
import { Rng } from "../src/core/rng";
import { buildCost, lastChanceProblem, offeredEvents, validateBuild, validateUpload } from "../src/net/validate";
import { bagsFor, explainRoadCap, playerFits, roadCapFor, roadMixes, roadMixesFor } from "../src/net/roadCap";
import { eventSequence } from "../src/game/events";
import { entry, snap } from "./netHelpers";

// BUMP-1D: LONG_RUN ships ON (bb-0.11.0). The "switch off" halves below are the 10-day world, so each test starts in it on purpose (the
// beforeEach puts the switch off, as it stood when the switch shipped off) and the long halves turn it on with long(); afterEach puts
// the shipped value back.
// BUMP-1E: ENDLESS ships ON too (bb-0.12.0), and a read with no record's rules (snapshot.ts maxRunes(), validate.ts validateBuild's day bound) asks the
// endless switch first: ENDLESS_LAST_DAY (64), whatever the long run's switch says. The worlds these halves read (the 10-day run; the long run's 25
// days) are the ones before endless, so the beforeEach puts endless off as well and afterEach puts it back (was setLongRun alone)
beforeEach(() => { setLongRun(false); setEndless(false); });
afterEach(() => { setLongRun(true); setEndless(ENDLESS); }); // the shipped values (BUMP-1D: long run on; was false) (BUMP-1E: endless on; was off)
const long = <T>(fn: () => T): T => withLongRun(fn);
const v3 = (o: Partial<GhostSnapshot> = {}): GhostSnapshot => snap({ v: SNAPSHOT_V3, ...o });
const throwsOn = (fn: () => unknown, re: RegExp) => expect(fn).toThrow(re);

describe("RUN-1 snapshot bounds (D4): data safety by the record's rules", () => {
  it("maxDayFor: 10 under the 10-day rules and with the switch off; 25 under a long run's rules", () => {
    expect(maxDayFor(RULES_VERSION)).toBe(MAX_DAY); // the switch off: every record reads the 10-day run
    long(() => {
      expect(maxDayFor(RULES_VERSION)).toBe(LONG_RUN_MAX_DAY);
      expect(maxDayFor("bb-0.9.7")).toBe(MAX_DAY); // older rules keep the 10-day bound
      expect(maxDayFor("not-a-version")).toBe(MAX_DAY);
      expect(maxWinsFor(RULES_VERSION, 14)).toBe(WIN_GOAL - 1);
      expect(maxWinsFor(RULES_VERSION, 4)).toBe(3);
      expect(maxWinsFor("bb-0.9.7", 10)).toBe(9);
      expect(maxRunes(RULES_VERSION)).toBe(LONG_RUN_MAX_DAY + 1); // one a dawn and a LAST CHANCE rune
      expect(maxRunes("bb-0.9.7")).toBe(MAX_DAY + 1);
    });
    expect(maxRunes()).toBe(MAX_DAY + 1);
    expect(long(() => maxRunes())).toBe(LONG_RUN_MAX_DAY + 1);
    expect(LOCAL_MAX_DAY).toBe(MAX_DAY); // ONE source: the client's check re-exports the decoder's constant
    // BUMP-1E: ENDLESS ships on, so in the shipped world (long run and endless both on) a read with no rules is the endless world's, ENDLESS_LAST_DAY + 1
    // (the two reads above are the world before endless, set up by the beforeEach: MAX_DAY + 1 and LONG_RUN_MAX_DAY + 1, 11 and 26 as before; with the
    // switch on and the long run off they read 65, which was the first red)
    expect(ENDLESS).toBe(true);
    long(() => withEndless(() => expect(maxRunes()).toBe(ENDLESS_LAST_DAY + 1)));
  });

  it("the day: 1..25 under a long run's rules (a day-14 ghost decodes), 1..10 otherwise; 26 is refused", () => {
    throwsOn(() => checkSnapshot(v3({ day: 14, wins: 5 })), /snapshot\.day: expected an integer in 1\.\.10/); // the switch off
    long(() => {
      for (const day of [11, 14, 17, 25]) expect(checkSnapshot(v3({ day, wins: 5 })).day).toBe(day);
      throwsOn(() => checkSnapshot(v3({ day: 26, wins: 5 })), /snapshot\.day: expected an integer in 1\.\.25/);
      throwsOn(() => checkSnapshot(v3({ day: 0, wins: 0 })), /snapshot\.day/);
      throwsOn(() => checkSnapshot(v3({ day: 11, wins: 5, rules: "bb-0.9.7" })), /snapshot\.day: expected an integer in 1\.\.10/); // old rules
      expect(decodeSnapshot(encodeSnapshot(v3({ day: 14, wins: 5 }))).day).toBe(14);
    });
  });

  it("wins: 0..min(day - 1, 9) on a run ghost (a dusk BEFORE its 10th win); 10-day rules 0..day - 1", () => {
    long(() => {
      expect(checkSnapshot(v3({ day: 14, wins: 9 })).wins).toBe(9);
      throwsOn(() => checkSnapshot(v3({ day: 14, wins: 10 })), /snapshot\.wins: expected an integer in 0\.\.9/);
      throwsOn(() => checkSnapshot(v3({ day: 14, wins: 13 })), /snapshot\.wins/);
      throwsOn(() => checkSnapshot(v3({ day: 5, wins: 5 })), /snapshot\.wins: expected an integer in 0\.\.4/);
    });
    expect(checkSnapshot(v3({ day: 10, wins: 9 })).wins).toBe(9);
    throwsOn(() => checkSnapshot(v3({ day: 10, wins: 10 })), /snapshot\.wins: expected an integer in 0\.\.9/);
  });

  it("`losses` (R1e, snapshot v3) is taken under a long run's rules: 0..day - 1 - wins, at most 8 draws, written after the seed", () => {
    const s = v3({ day: 14, wins: 6, lives: 4, seed: 123456, losses: 3 }); // 13 dusks: 6 wins, 3 losses, 4 draws
    long(() => {
      const back = decodeSnapshot(encodeSnapshot(s));
      expect(back.losses).toBe(3);
      expect(encodeSnapshot(s)).toContain('"seed":123456,"losses":3'); // V3_SNAPSHOT_FIELDS order
      expect(checkSnapshot({ ...s, losses: 0 }).losses).toBe(0); // 0 is an exact count, kept
      expect(checkSnapshot({ ...s, losses: 7 }).losses).toBe(7); // the most: day - 1 - wins
      throwsOn(() => checkSnapshot({ ...s, losses: 8 }), /snapshot\.losses: expected an integer in 0\.\.7/);
      throwsOn(() => checkSnapshot({ ...s, losses: -1 }), /snapshot\.losses/);
      throwsOn(() => checkSnapshot({ ...s, losses: 1.5 }), /snapshot\.losses/);
      // draws = day - 1 - wins - losses: 8 are the most an upload carries (anti-forgery)
      expect(MAX_RUN_DRAWS).toBe(8);
      expect(checkSnapshot(v3({ day: 18, wins: 9, lives: 10, losses: 0 })).losses).toBe(0); // 17 dusks: 9 wins and 8 draws
      throwsOn(() => checkSnapshot(v3({ day: 19, wins: 9, lives: 10, losses: 0 })), /snapshot\.losses: 9 draws in 18 dusks is past 8/);
      throwsOn(() => checkSnapshot({ ...s, v: 2, seed: undefined }), /snapshot\.losses: not allowed in a v2 snapshot/);
      // older rules under the switch: the field is still reserved there
      throwsOn(() => checkSnapshot(v3({ day: 8, wins: 3, lives: 5, losses: 2, rules: "bb-0.9.7" })), /snapshot\.losses: not in this rules version yet/);
    });
    // the switch off: refused, as V3_LIVE has it
    throwsOn(() => checkSnapshot(s), /snapshot\.day|snapshot\.losses: not in this rules version yet/);
    throwsOn(() => checkSnapshot(v3({ day: 5, wins: 2, losses: 1 })), /snapshot\.losses: not in this rules version yet/);
  });

  it("an old v3 snapshot without `losses` stays valid: with the seed only, on both sides of the switch", () => {
    const old = v3({ day: 7, wins: 3, lives: 5, seed: 99 });
    expect(checkSnapshot(old).losses).toBeUndefined();
    expect(decodeSnapshot(encodeSnapshot(old))).toEqual(old);
    long(() => {
      expect(checkSnapshot(old).losses).toBeUndefined();
      expect(decodeSnapshot(encodeSnapshot(old))).toEqual(old);
      expect(encodeSnapshot(old)).not.toContain("losses");
    });
  });

  it("LAST CHANCE on any day under a long run's rules: its day 1..day - 1 (no day-10 line); the 10-day rules stop before day 10", () => {
    const lc = (day: number) => ({ day, boon: "hull" as const });
    long(() => {
      for (const d of [9, 10, 11, 12, 13]) expect(checkSnapshot(v3({ day: 14, wins: 5, lastChance: lc(d) })).lastChance?.day).toBe(d);
      throwsOn(() => checkSnapshot(v3({ day: 14, wins: 5, lastChance: lc(14) })), /is not before the snapshot's day 14/);
      throwsOn(() => checkSnapshot(v3({ day: 14, wins: 5, lastChance: lc(0) })), /snapshot\.lastChance\.day/);
    });
    expect(checkSnapshot(v3({ day: 10, wins: 5, lastChance: lc(9) })).lastChance?.day).toBe(9);
    throwsOn(() => checkSnapshot(v3({ day: 10, wins: 5, lastChance: lc(10) })), /LAST CHANCE comes only before day 10|is not before/);
  });

  it("the road log runs to the day and the runes list to a day's dawns (+1 LAST CHANCE rune)", () => {
    const road = (n: number) => Array.from({ length: n }, (_, i) => ({ day: i + 1, tier: "easy" as const, outcome: "win" as const }));
    const runes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `rune_${i}` }));
    const withRunes = (day: number, n: number) => ({ ...v3({ day, wins: 5 }), build: { ...startingBuild("furnace", 1), runes: runes(n) } });
    long(() => {
      expect(checkSnapshot(v3({ day: 14, wins: 5, road: road(14) })).road).toHaveLength(14);
      expect(checkSnapshot(v3({ day: 25, wins: 9, road: road(25) })).road).toHaveLength(25);
      throwsOn(() => checkSnapshot(v3({ day: 25, wins: 9, road: road(26) })), /snapshot\.road: more than 25 entries/);
      expect(checkSnapshot(withRunes(14, 15)).build.runes).toHaveLength(15); // 14 dawns and a LAST CHANCE rune
      expect(checkSnapshot(withRunes(25, 26)).build.runes).toHaveLength(26);
      throwsOn(() => checkSnapshot(withRunes(25, 27)), /runes: more than 26 entries/);
      throwsOn(() => checkSnapshot({ ...withRunes(10, 12), rules: "bb-0.9.7" }), /runes|rules/); // older rules: the 10-day bound
    });
    expect(checkSnapshot(v3({ day: 10, wins: 5, road: road(10) })).road).toHaveLength(10);
    throwsOn(() => checkSnapshot(v3({ day: 10, wins: 5, road: road(11) })), /snapshot\.road: more than 10 entries/);
    throwsOn(() => checkSnapshot(withRunes(10, 12)), /runes: more than 11 entries/);
  });
});

describe("RUN-1 the client's check takes exactly what the strict decoder takes (isSnapshot, one source)", () => {
  const both = (s: GhostSnapshot): [boolean, boolean] => {
    let strict = true;
    try {
      checkSnapshot(s);
    } catch {
      strict = false;
    }
    return [strict, isSnapshot(s as unknown as LocalSnapshot)];
  };

  it("day, wins, losses, LAST CHANCE: accepted and refused together, under both worlds", () => {
    const cases: [string, GhostSnapshot][] = [
      ["day 14", v3({ day: 14, wins: 5 })],
      ["day 25", v3({ day: 25, wins: 9 })],
      ["day 26", v3({ day: 26, wins: 9 })],
      ["14, 10 wins", v3({ day: 14, wins: 10 })],
      ["14, 9 wins", v3({ day: 14, wins: 9 })],
      ["losses 3", v3({ day: 14, wins: 6, losses: 3 })],
      ["losses 8", v3({ day: 14, wins: 6, losses: 8 })],
      ["9 draws", v3({ day: 19, wins: 9, losses: 0 })],
      ["8 draws", v3({ day: 18, wins: 9, losses: 0 })],
      ["LC 12", v3({ day: 14, wins: 5, lastChance: { day: 12, boon: "hull" } })],
      ["LC 14", v3({ day: 14, wins: 5, lastChance: { day: 14, boon: "hull" } })],
      ["old rules day 11", v3({ day: 11, wins: 5, rules: "bb-0.9.7" })],
    ];
    for (const [name, s] of cases) {
      const [strictOff, localOff] = both(s);
      expect(localOff, `${name} (switch off)`).toBe(strictOff);
      long(() => {
        const [strict, local] = both(s);
        expect(local, `${name} (long run)`).toBe(strict);
      });
    }
    long(() => {
      expect(both(v3({ day: 14, wins: 6, losses: 3 }))).toEqual([true, true]);
      expect(both(v3({ day: 14, wins: 10 }))).toEqual([false, false]);
      expect(both(v3({ day: 26, wins: 9 }))).toEqual([false, false]);
      expect(both(v3({ day: 19, wins: 9, losses: 0 }))).toEqual([false, false]);
      expect(both(v3({ day: 14, wins: 5, lastChance: { day: 12, boon: "hull" } }))).toEqual([true, true]);
    });
    expect(both(v3({ day: 14, wins: 5 }))).toEqual([false, false]); // the 10-day world refuses day 14 on both sides
  });
});

// ---------------------------------------------------------------------------------------------------- D6: matchmaking

const req = (o: Partial<MatchRequest> = {}): MatchRequest => ({ rules: RULES_VERSION, day: 14, wins: 5, lives: 8, playerId: "me", seen: [], ...o });
const dayOf = (e: PoolEntry | null): number | null => (e ? e.snapshot.day : null);
const rng = () => new Rng(5);

describe("RUN-1 matchmaking (D6): a thin day widens to the nearest EARLIER day, never a later one", () => {
  const pool: PoolEntry[] = [
    entry("g-d15", { day: 15, wins: 4, lives: 6 }), // a LATER day than the request's: never
    entry("g-d12", { day: 12, wins: 4, lives: 6 }),
    entry("g-d9", { day: 9, wins: 4, lives: 6 }),
    entry("g-d3", { day: 3, wins: 1, lives: 6 }),
  ];

  it("the days a request reads: its own and every earlier one (long run), its own only (10-day rules, switch off)", () => {
    expect(matchDays(req())).toEqual([14]);
    long(() => {
      expect(matchDays(req())).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      expect(matchDays(req({ day: 1 }))).toEqual([1]);
      expect(matchDays(req({ rules: "bb-0.9.7", day: 8 }))).toEqual([8]); // older rules: the exact day, as before
      expect(ghostDayOk(12, req())).toBe(true);
      expect(ghostDayOk(14, req())).toBe(true);
      expect(ghostDayOk(15, req())).toBe(false);
      expect(ghostDayOk(0, req())).toBe(false);
      expect(ghostDayOk(12, req({ rules: "bb-0.9.7" }))).toBe(false);
    });
    expect(ghostDayOk(13, req())).toBe(false); // switch off: the exact day
    expect(ghostDayOk(14, req())).toBe(true);
  });

  it("a long run with no ghost on its day gets the nearest earlier day's (12 before 9 before 3), never day 15's", () => {
    long(() => {
      expect(matchDay(pool, req())).toBe(12);
      expect(dayOf(pickGhost(pool, req(), rng()))).toBe(12);
      expect(dayOf(pickGhost(pool.filter((e) => e.id !== "g-d12"), req(), rng()))).toBe(9);
      expect(dayOf(pickGhost(pool.filter((e) => !["g-d12", "g-d9"].includes(e.id)), req(), rng()))).toBe(3);
      expect(pickGhost(pool.filter((e) => e.id === "g-d15"), req(), rng())).toBeNull(); // only a later day: none (the stand-in is built for day 14)
      // the exact day wins whenever it has an eligible ghost
      const withOwn = [...pool, entry("g-d14", { day: 14, wins: 3, lives: 5 })];
      expect(dayOf(pickGhost(withOwn, req(), rng()))).toBe(14);
      expect(eligibleWide(withOwn, req()).map((e) => e.id)).toEqual(["g-d14"]);
      expect(eligible(withOwn, req()).map((e) => e.id)).toEqual(["g-d14"]);
    });
    // 10-day rules (switch off): the exact day only, no widening
    expect(pickGhost(pool, req(), rng())).toBeNull();
    expect(matchDay(pool, req())).toBe(14);
  });

  it("D1 still holds on the widened day (never a better record), and the own player and the seen ghosts are skipped", () => {
    long(() => {
      const better = [entry("g-d12-better", { day: 12, wins: 7, lives: 9 }), entry("g-d9", { day: 9, wins: 4, lives: 6 })];
      expect(dayOf(pickGhost(better, req(), rng()))).toBe(9); // day 12's ghost has more wins than the requester: skipped
      const mine = [entry("g-mine", { day: 12, wins: 4, lives: 6, playerId: "me" }), entry("g-d9", { day: 9, wins: 4, lives: 6 })];
      expect(dayOf(pickGhost(mine, req(), rng()))).toBe(9);
      expect(dayOf(pickGhost(pool, req({ seen: ["g-d12"] }), rng()))).toBe(9);
      expect(dayOf(pickGhost(pool, req({ rules: "bb-0.9.7" }), rng()))).toBeNull(); // other rules: none
    });
  });

  it("the graded pick (matchPick) widens the same way and judges the record by the requester's own day", () => {
    long(() => {
      const losing = req({ wins: 2, lives: 5 }); // 11 losses to 2 wins: a deep record, the graded pick's weak share
      const graded = [entry("g-d12", { day: 12, wins: 2, lives: 5 }), entry("g-d9", { day: 9, wins: 2, lives: 5 })];
      expect(dayOf(matchPick(graded, losing, rng()))).toBe(12);
      expect(dayOf(matchPick(graded.slice(1), losing, rng()))).toBe(9);
      expect(matchPick([], losing, rng())).toBeNull();
      expect(dayOf(matchPick(pool, req(), rng()))).toBe(12);
    });
  });

  it("the client's pool pick mirrors it (ghosts.ts): the nearest earlier day; a 10-day run's own mark keeps the exact day", () => {
    const local = (id: string, o: Partial<LocalSnapshot>): LocalSnapshot => ({ ...snap({ runId: id, ...o }) } as LocalSnapshot);
    const mine = [local("a", { day: 15, wins: 4, lives: 6 }), local("b", { day: 12, wins: 4, lives: 6 }), local("c", { day: 9, wins: 4, lives: 6 })];
    const q = { rules: RULES_VERSION, day: 14, runId: "current", wins: 5, lives: 8, seed: 1234 };
    expect(poolPick(mine, q)).toBeNull(); // switch off
    long(() => {
      expect(poolPick(mine, q)?.day).toBe(12);
      expect(poolPick(mine.slice(2), q)?.day).toBe(9);
      expect(poolPick([mine[0]], q)).toBeNull(); // never a later day
      expect(poolPick(mine, { ...q, long: false })).toBeNull(); // the run's own mark (a 10-day run): exact day only
      expect(poolPick(mine, { ...q, day: 12 })?.day).toBe(12);
      expect(poolPick(mine, { ...q, runId: "b", day: 12 })?.day).toBe(9); // never the current run's own ghost: the widening goes on to day 9
      expect(poolPick(mine, { ...q, runId: "b" })?.day).toBe(9);
    });
  });

  it("with no ghost at all the stand-in is built for the EXACT day; only its snapshot label is bounded (data safety)", () => {
    const fb = (day: number) => fallbackGhost({ ...req({ day }), hero: "furnace", seed: 7 }, []);
    expect(fb(14).snapshot.day).toBe(MAX_DAY); // switch off: clamps to 10, as before
    long(() => {
      expect(fb(14).snapshot.day).toBe(14);
      expect(fb(14).id).toMatch(/^offline-[a-z]+-d14$/);
      expect(fb(25).snapshot.day).toBe(25);
      expect(fb(40).snapshot.day).toBe(25); // the label's bound only: the run itself plays on at day 40
      expect(offlineGhost("furnace", 14, 7, { wins: 9, lives: 10 }).snapshot.wins).toBe(9);
      expect(offlineGhost("furnace", 14, 7, { wins: 12, lives: 10 }).snapshot.wins).toBe(WIN_GOAL - 1); // a record mirror never passes 9
      // a bundled-pool ghost on an earlier day beats the stand-in
      expect(dayOf(fallbackGhost({ ...req({ day: 14 }), hero: "furnace", seed: 7 }, pool12()))).toBe(12);
    });
  });
});

function pool12(): PoolEntry[] {
  return [entry("g-pool-12", { day: 12, wins: 4, lives: 6 })];
}

// ---------------------------------------------------------------------------------------------------- D4: the deck check

describe("RUN-1 the deck check past day 10: LAST CHANCE on any day, the day bound, the bags", () => {
  it("validateBuild's day bound follows the world: 1..25 under a long run's rules, 1..10 otherwise", () => {
    const b = startingBuild("furnace", 1);
    expect(validateBuild(b, 11).errors[0]).toBe("shape: day 11 is not in 1..10");
    long(() => {
      expect(validateBuild(b, 26).errors[0]).toBe("shape: day 26 is not in 1..25");
      expect(validateBuild(b, 14).errors.some((e) => e.startsWith("shape: day"))).toBe(false);
      // validateUpload under older rules is judged as the 10-day run, whatever the switch
      expect(validateUpload(b, 11, "bb-0.9.7").errors[0]).toBe("shape: day 11 is not in 1..10");
    });
    // BUMP-1E: ENDLESS ships on (the beforeEach put it off for the halves above): in the shipped world (long run and endless both on) the deck check's
    // day is 1..ENDLESS_LAST_DAY, so day 26 is no longer refused and ENDLESS_LAST_DAY + 1 is
    expect(ENDLESS).toBe(true);
    long(() => withEndless(() => {
      expect(validateBuild(b, 26).errors.some((e) => e.startsWith("shape: day"))).toBe(false);
      expect(validateBuild(b, ENDLESS_LAST_DAY).errors.some((e) => e.startsWith("shape: day"))).toBe(false);
      expect(validateBuild(b, ENDLESS_LAST_DAY + 1).errors[0]).toBe(`shape: day ${ENDLESS_LAST_DAY + 1} is not in 1..${ENDLESS_LAST_DAY}`);
    }));
  });

  it("lastChanceProblem: day 12 on a day-14 deck stands under the long run's world, not under the 10-day run's", () => {
    const b = startingBuild("furnace", 1);
    const lc = { day: 12, boon: "hull" as const };
    expect(lastChanceProblem(lc, b, 14)).toMatch(/LAST CHANCE comes only before day 10/);
    long(() => {
      expect(lastChanceProblem(lc, b, 14)).toBeNull();
      expect(lastChanceProblem({ day: 14, boon: "hull" }, b, 14)).toMatch(/is not before the deck's day 14/);
      expect(lastChanceProblem({ day: 0, boon: "hull" }, b, 14)).toMatch(/LAST CHANCE comes only before/);
    });
  });
});

describe("RUN-1 roadCap (D6): the event mask resets at each bag boundary", () => {
  it("the bags a day has reached: 1 up to day 10, then one more every 10 days (long run); always 1 with the switch off", () => {
    expect([1, 10, 11, 20, 21, 25].map(bagsFor)).toEqual([1, 1, 1, 1, 1, 1]);
    long(() => expect([1, 10, 11, 20, 21, 25].map(bagsFor)).toEqual([1, 1, 2, 2, 3, 3]));
  });

  it("the mixes: bags = 1 are the 10-day run's list (same keys, same order); 2 bags add the plating twice (hull x2)", () => {
    expect(roadMixesFor(1).map((m) => m.key)).toEqual(roadMixes().map((m) => m.key));
    const one = roadMixes().map((m) => m.key);
    const two = roadMixesFor(2);
    expect(two.length).toBeGreaterThan(one.length);
    for (const k of one) expect(two.map((m) => m.key)).toContain(k);
    const dock2 = two.find((m) => m.key === "dock(200,0)x2");
    expect(dock2).toBeDefined();
    expect(dock2!.hull).toBe(400);
    expect(dock2!.counts?.get("dock")).toBe(2);
    expect(roadMixesFor(3).some((m) => m.key.includes("dock(200,0)x3") && m.hull === 600)).toBe(true);
    expect(roadMixes().every((m) => m.counts === undefined)).toBe(true); // a 10-day mix says nothing of bags
  });

  it("a second-bag event repeat is allowed: the plan past day 10 takes an event again (once per bag), never twice in one bag", () => {
    // the best plan to day 14, one entry per day: "<the fight>, then event <id>: <choice>" when the day's event is taken
    const eventsOf = (day: number) => explainRoadCap(day).map((p) => ({ day: p.day, event: p.pick.split(", then ").find((x) => x.startsWith("event "))?.split(":")[0] }));
    const taken = (rows: { day: number; event?: string }[]) => rows.filter((r) => r.event).map((r) => r.event!);
    long(() => {
      const rows = eventsOf(14);
      const bag1 = taken(rows.filter((r) => r.day <= 10)), bag2 = taken(rows.filter((r) => r.day > 10));
      expect(bag2.length).toBeGreaterThan(0); // days 11-14 meet the events again
      expect(new Set(bag1).size).toBe(bag1.length); // never twice in ONE bag
      expect(new Set(bag2).size).toBe(bag2.length);
      expect(bag2.some((e) => bag1.includes(e)), "an event taken in both bags").toBe(true);
      expect(new Set([...bag1, ...bag2]).size).toBeLessThan(bag1.length + bag2.length);
    });
    // the 10-day world (switch off): the mask never resets, so over 14 days no event is taken twice
    const off = taken(eventsOf(14));
    expect(new Set(off).size).toBe(off.length);
    // so the long run's cap at day 14 is above the 10-day world's (the repeats are worth something)
    const capOff = roadCapFor(14);
    expect(long(() => roadCapFor(14))).toBeGreaterThan(capOff);
    expect(long(() => roadCapFor(10))).toBe(roadCapFor(10)); // one bag: unchanged
  });

  it("the dock's PLATING in two bags (hull +400) is explained by a mix that takes the dock twice, at day 12 and not at day 10", () => {
    const hero = "furnace" as const;
    const fit = (hull: number, day: number, offered?: ReturnType<typeof offeredEvents>) => {
      const b = { ...startingBuild(hero, 1), hullBonus: hull };
      return playerFits(b, day, buildCost(b), offered);
    };
    const keys = (hull: number, day: number, offered?: ReturnType<typeof offeredEvents>) => fit(hull, day, offered).fits.map((f) => f.mix.key);
    expect(keys(400, 10)).not.toContain("dock(200,0)x2"); // one bag by day 10: the 10-day run's mixes only
    expect(keys(400, 12)).not.toContain("dock(200,0)x2"); // the switch off: every day reads one bag
    long(() => {
      expect(keys(400, 12)).toContain("dock(200,0)x2");
      expect(keys(400, 20)).toContain("dock(200,0)x2");
      expect(keys(400, 10)).not.toContain("dock(200,0)x2"); // day 10 is still bag 1
      expect(keys(200, 12)).toContain("dock(200,0)"); // one plating: as ever
      expect(keys(600, 21)).toContain("dock(200,0)x3"); // three bags by day 21
      expect(keys(600, 20)).not.toContain("dock(200,0)x3");
      // the seed's own events: it must have offered the dock in two bags by day 12 to explain two platings
      const dockTimes = (seed: number, day: number) => eventSequence(seed, day, true).filter((e) => e === "dock").length;
      let twice = -1, once = -1;
      for (let seed = 1; seed <= 400 && (twice < 0 || once < 0); seed++) {
        const n = dockTimes(seed, 12);
        if (n === 2 && twice < 0) twice = seed;
        if (n === 1 && once < 0) once = seed;
      }
      expect(twice, "a seed with two docks by day 12").toBeGreaterThan(0);
      expect(once, "a seed with one dock by day 12").toBeGreaterThan(0);
      expect(offeredEvents(twice, 12) instanceof Map).toBe(true); // counts, one per bag
      expect(keys(400, 12, offeredEvents(twice, 12))).toContain("dock(200,0)x2");
      expect(keys(400, 12, offeredEvents(once, 12))).not.toContain("dock(200,0)x2"); // offered once: it cannot explain two
      expect(keys(200, 12, offeredEvents(once, 12))).toContain("dock(200,0)"); // one plating: one dock is enough
      expect(fit(400, 12, offeredEvents(once, 12)).unofferedHull?.some((l) => l.includes("dock") && l.includes("x2"))).toBe(true);
    });
  });
});
