// SC-TOOL --survival (REQ-BFG-026 item 7, job S1): the exact model on hand-computed cases, the refund's effect, the
// model against the run code on scripted loss sequences, the DOCK's day odds against eventSequence, the rules audit
// and one par run's dusks. About 10 s (two full pattern tables through the day loop and one par run).
// Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE is the game's rule, so the run code's rules are GAME (RULES plus LAST CHANCE's
// life) and every check against the run code reads them; RULES stays the 0.6.2 rules of the hand-computed cases.
// HULL-ON (the flip, HEARTS): the tool's model (LifeRules) is the 5-lives model: START_LIVES, one life a loss, the day-3
// refund, LAST CHANCE giving one back at exactly 1 life. It does not follow HEARTS (10 hearts, heartCost 1/2/3 by day, no
// refund, LAST CHANCE setting 1 at 1 or fewer): with HEARTS on, lifeAudit throws "the model doesn't cover these rules".
// So every check of the model against the run code reads the run code with HEARTS off (offHearts: its runs are 5-lives
// runs), the world the model covers. LOOK (cap): the tool's survival model does not follow HEARTS (tools/ not edited).
import { describe, expect, it } from "vitest";
import { RUN_DAYS, START_LIVES } from "../src/sim/content";
import { withHearts } from "../src/sim/hearts";
import { standInFoe } from "../src/game/ghosts";
import {
  checkBag, constLoss, eventDayOdds, lifeAudit, lostOf, modelCompletes, modelTable, patternTable, roundsInto, runPattern,
  seedWithEvent, survJob, survivalFrom, type LifeRules,
} from "../tools/scorecard/survival";
import { BAG_IDS } from "../src/game/events";
import { WARLORD_EVENT_IDS } from "../src/game/eventDefs";

const RULES: LifeRules = { startLives: 5, days: 10, lossLives: 1, refundDay: 3, refundLives: 1, dockLives: 1 };
/** Z-BUMP (the flip): the game's rules now, as lifeAudit reads them off the run code: RULES and LAST CHANCE's 1 life. */
const GAME: LifeRules = { ...RULES, lastChance: 1 };
const choose = (n: number, k: number): number => (k < 0 || k > n ? 0 : k === 0 ? 1 : (choose(n - 1, k - 1) * n) / k);
/** HULL-ON (the flip, HEARTS): a test body run with HEARTS off (its runs start as 5-lives runs), put back on after. */
const offHearts = (fn: () => void) => (): void => withHearts(fn, false);

describe("--survival: the exact model on hand-computed cases", () => {
  it("2 days and 2 lives: only losing both ends the run; a day-1 refund saves even that", () => {
    const none: LifeRules = { startLives: 2, days: 2, lossLives: 1, refundDay: 2, refundLives: 0, dockLives: 0 };
    expect(modelTable(none)).toEqual([true, true, true, false]); // masks: WW, LW, WL, LL
    for (const p of [0.3, 0.5, 0.8]) expect(survivalFrom(modelTable(none), constLoss(p, 2))).toBeCloseTo(1 - (1 - p) ** 2, 12);
    expect(survivalFrom(modelTable(none), constLoss(0.5, 2))).toBe(0.75);
    // the refund: a day-1 loss gives 1 life back at the dawn of day 2 (2 -> 1 -> 2), so LL ends at 1 life
    const refund = { ...none, refundLives: 1 };
    expect(modelTable(refund)).toEqual([true, true, true, true]);
    expect(survivalFrom(modelTable(refund), constLoss(0.5, 2))).toBe(1);
  });

  it("2 days and 1 life: any loss ends the run (p^2)", () => {
    const r: LifeRules = { startLives: 1, days: 2, lossLives: 1, refundDay: 3, refundLives: 1, dockLives: 0 };
    expect(survivalFrom(modelTable(r), constLoss(0.6, 2))).toBeCloseTo(0.36, 12);
  });

  it("3 days, 2 lives, a refund at dawn 2: only LLL and WLL end the run (1 - q^2); without it any two losses do", () => {
    const r: LifeRules = { startLives: 2, days: 3, lossLives: 1, refundDay: 2, refundLives: 1, dockLives: 0 };
    const dead = modelTable(r).map((ok, m) => (ok ? null : lostOf(m, 3).map((l) => (l ? "L" : "W")).join(""))).filter(Boolean);
    expect(dead.sort()).toEqual(["LLL", "WLL"]);
    for (const p of [0.4, 0.5, 0.55]) {
      const q = 1 - p;
      expect(survivalFrom(modelTable(r), constLoss(p, 3))).toBeCloseTo(1 - q ** 3 - p * q * q, 12);
      expect(survivalFrom(modelTable({ ...r, refundLives: 0 }), constLoss(p, 3))).toBeCloseTo(1 - 3 * q * q * p - q ** 3, 12);
    }
  });

  it("the 0.6.2 rules reproduce the genre study's arithmetic in closed form (56.8% / 68.6%; 37.7% / 50.4% without the refund)", () => {
    // without the refund: survive with at most 4 losses in 10. With it: also exactly 5 losses with one on day 1 or 2.
    const none = (p: number) => Array.from({ length: 5 }, (_, k) => choose(10, k) * (1 - p) ** k * p ** (10 - k)).reduce((a, b) => a + b, 0);
    const refund = (p: number) => none(p) + (choose(10, 5) - choose(8, 5)) * (1 - p) ** 5 * p ** 5;
    for (const p of [0.4, 0.45, 0.5, 0.55, 0.6, 0.65]) {
      expect(survivalFrom(modelTable(RULES), constLoss(p))).toBeCloseTo(refund(p), 12);
      expect(survivalFrom(modelTable({ ...RULES, refundLives: 0 }), constLoss(p))).toBeCloseTo(none(p), 12);
    }
    expect(survivalFrom(modelTable(RULES), constLoss(0.5))).toBe(582 / 1024);
    expect(survivalFrom(modelTable({ ...RULES, refundLives: 0 }), constLoss(0.5))).toBe(386 / 1024);
    expect(survivalFrom(modelTable(RULES), constLoss(0.55))).toBeCloseTo(0.686, 3);
    expect(survivalFrom(modelTable({ ...RULES, refundLives: 0 }), constLoss(0.55))).toBeCloseTo(0.504, 3);
  });

  it("PATCH UP adds a life only below the starting lives", () => {
    const lost = (...days: number[]) => Array.from({ length: 10 }, (_, i) => days.includes(i + 1));
    // five losses on days 3-7 end the run, unless PATCH UP after the first of them gives a sixth life
    expect(modelCompletes(RULES, lost(3, 4, 5, 6, 7))).toBe(false);
    expect(modelCompletes(RULES, lost(3, 4, 5, 6, 7), 4)).toBe(true);
    // at full lives the DOCK gives nothing (LIVES FULL): PATCH UP on day 3 before any loss doesn't save it
    expect(modelCompletes(RULES, lost(3, 4, 5, 6, 7), 3)).toBe(false);
  });

  it("the row's rounding: 56.5% to just under 69.5% round into 57-69%", () => {
    expect([0.565, 0.568, 0.686, 0.6949].map((s) => roundsInto(s))).toEqual([true, true, true, true]);
    expect([0.5649, 0.695, 0.7].map((s) => roundsInto(s))).toEqual([false, false, false]);
  });
});

describe("--survival: the model against the run code (newRun + startDusk + finishDay)", () => {
  it("reads the rules off the run code, and no build gains from losing days 1-2", offHearts(() => { // HULL-ON (HEARTS): off
    const a = lifeAudit("furnace", 20260926);
    expect(a.rules).toEqual(GAME); // Z-BUMP: the flip (was RULES: the audit now reads LAST CHANCE's life off the run code too)
    expect(a.dusk).toEqual({ win: 0, loss: -1, draw: 0 });
    expect(a.refund.dawns).toEqual([5, 4, 5, 5]); // L, W, W: the day-1 loss comes back at the dawn of day 3
    expect(a.choices.map((c) => [c.event, c.choice, c.gainLives, c.costLives, c.costGold])).toEqual([["dock", "PATCH UP", 1, 0, 4]]);
    expect(a.warlords.every((w) => w.delta === 0)).toBe(true);
    const ww = a.throwing.find((x) => x.script === "WW")!;
    for (const x of a.throwing) {
      expect(x.lives).toBeLessThanOrEqual(ww.lives);
      expect(x.gold).toBeLessThanOrEqual(ww.gold);
    }
  }));

  it("every loss pattern completes in the run code exactly when the model says so (no DOCK)", offHearts(() => { // HULL-ON (HEARTS): off
    const run = patternTable("weaver", 7);
    expect(run.complete).toEqual(modelTable(GAME)); // Z-BUMP: the flip (was modelTable(RULES))
    // Z-BUMP: the flip (was 582 / 1024, the 0.6.2 rules' above). With LAST CHANCE a run survives at most 5 losses (638
    // patterns), or exactly 6 with one on day 1 or 2 (C(10, 6) - C(8, 6) = 182): 820
    expect(survivalFrom(run.complete, constLoss(0.5))).toBe(820 / 1024);
  }));

  // Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE gives back the life of the first loss to 1 life, so the no-refund model
  // now survives losing days 1-5 too (5 -> 4 -> 3 -> 2 -> 1 (LAST CHANCE) 2 -> 1); one more loss keeps each sequence's point:
  // days 1-6 (was days 1-5, lives [4, 4, 3, 2, 1, 1, 1, 1, 1, 1]) and days 3-8 (was days 3-7, lost after 7 dusks)
  it("the refund decides scripted sequences: losing days 1-6 survives with it, the no-refund model would end the run", offHearts(() => { // HULL-ON (HEARTS): off
    const m = 0b111111; // lose days 1-6, win 7-10: 5 -> 4 -> 3 -> (refund) 4 -> 3 -> 2 -> 1 (LAST CHANCE) 2 -> 1
    const r = runPattern("furnace", 11, m);
    expect(r.complete).toBe(true);
    expect(r.lives).toEqual([4, 4, 3, 2, 2, 1, 1, 1, 1, 1]); // after each dusk (the refund lands at dawn 3, after day 2's dusk)
    expect(modelCompletes({ ...GAME, refundLives: 0 }, lostOf(m, 10))).toBe(false);
    expect(modelCompletes({ ...GAME, refundLives: 0 }, lostOf(0b11111, 10))).toBe(true); // days 1-5: LAST CHANCE alone saves it
    // lose days 3-8: no early loss, no refund, five lives and LAST CHANCE's one gone
    const late = runPattern("furnace", 11, 0b11111100);
    expect([late.complete, late.lives[late.lives.length - 1]]).toEqual([false, 0]);
    expect(late.lives.length).toBe(8);
  }));

  it("draws keep lives like wins; PATCH UP through the road event matches the model on its DOCK day", offHearts(() => { // HULL-ON (HEARTS): off
    for (const m of [0, 0b11111, 0b1111100, 0b1010101010, 0b1111111111, 0b0110110110]) {
      expect(runPattern("furnace", 3, m, 0, -1).lives).toEqual(runPattern("furnace", 3, m, 0, 0).lives);
    }
    const day = 4, seed = seedWithEvent("dock", day);
    const t = patternTable("furnace", seed, day);
    expect(t.complete).toEqual(modelTable(GAME, day)); // Z-BUMP: the flip (was modelTable(RULES, day))
    // below 5 lives at day 4's road: 5 of the 8 day 1-3 patterns (LLW, WWL, LWL, WLL, LLL; LWW and WLW are refilled by
    // the refund at dawn 3), so 5/8 of the 1024
    expect(t.patched).toBe(640);
  }));
});

describe("--survival: the DOCK's day (eventSequence's first bag)", () => {
  it("exact odds by hand: 0.1 on days 1-7, then 35/360, 7/90 and 1/8 (HERALD and SAPPERS kept off day 10)", () => {
    const odds = eventDayOdds(BAG_IDS, "dock", WARLORD_EVENT_IDS);
    expect(odds.length).toBe(RUN_DAYS);
    for (let d = 0; d < 7; d++) expect(odds[d]).toBeCloseTo(0.1, 12);
    expect(odds[7]).toBeCloseTo(0.1 * (35 / 36), 12); // swapped away only when both duds sit on days 9-10
    expect(odds[8]).toBeCloseTo(0.1 * (7 / 9), 12); // swapped away whenever a dud is on day 10
    expect(odds[9]).toBeCloseTo(0.1 + 0.2 / 8, 12); // its own 1/10, plus the swap's
    expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("the bag model equals eventSequence on run seeds 1-3000", () => {
    const c = checkBag(3000, "dock");
    expect(c.mismatches).toEqual([]);
    const odds = eventDayOdds(BAG_IDS, "dock", WARLORD_EVENT_IDS);
    for (let d = 0; d < RUN_DAYS; d++) expect(Math.abs(c.freq[d] - odds[d])).toBeLessThan(0.025);
  });
});

describe("--survival: one par run's dusks are the game's own", () => {
  it("fights standInFoe(run.seed, day) every day and keeps lives by finishDay", offHearts(() => { // HULL-ON (HEARTS): off
    const r = survJob({ hero: "furnace", seed: 3 });
    expect(r.res.length).toBe(RUN_DAYS);
    expect(r.foes).toEqual(Array.from({ length: RUN_DAYS }, (_, i) => standInFoe(r.runSeed, i + 1).name));
    const mask = r.res.reduce((m, x, i) => m | (x === 1 ? 1 << i : 0), 0);
    expect(r.complete).toBe(modelCompletes(GAME, lostOf(mask, RUN_DAYS))); // Z-BUMP: the flip (was RULES)
    expect(r.lives[0]).toBe(START_LIVES - (r.res[0] === 1 ? 1 : 0));
    expect(survJob({ hero: "furnace", seed: 3 })).toEqual(r); // deterministic
  }));
});
