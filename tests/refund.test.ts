// 0.6.2 TUNE-M T4.2, RULE EARLY-LOSS REFUND (ROADMAP 0.6.2 §1; ref/BRIEF-final-062-tune.md T4): a run that lost a life
// at dusk on day 1 or 2 gets one life back at the dawn of day 3. Once per run, never above the starting 5 lives. The
// dawn says so (the build screen's toast), so does the dusk card that leads to it, and the rules card.
import { describe, expect, it } from "vitest";
import { migrateRun, newRun, type Run } from "../src/game/run";
import {
  REFUND_DAY, REFUND_LIVES, REFUND_TEXT, earlyLossRefund, finishDay, refundCardLine, refundNotice, startDusk,
} from "../src/game/day";
import { START_LIVES } from "../src/sim/content";
import type { SideStats } from "../src/sim/battle";
import { HELP } from "../src/screens/title";

const STATS = { damage: 0, shots: 0, firstShot: -1, idle: 0, turretTime: 0, jams: 0, burnDealt: 0, maxQueue: 0 } as unknown as SideStats;
const W = 0 as const, L = 1 as const, D = -1 as const;
type Out = typeof W | typeof L | typeof D;
const reload = (run: Run): Run => migrateRun(JSON.parse(JSON.stringify(run)))!;

/** Play dusk results (0 win, 1 loss, -1 draw) through the day loop, from `run` (a fresh FURNACE run by default). */
function play(results: Out[], run: Run = newRun("furnace", 42, "refund-run")): Run {
  for (const r of results) {
    if (run.over) break;
    startDusk(run, []);
    finishDay(run, r, 30, STATS, STATS);
  }
  return run;
}

describe("0.6.2 RULE EARLY-LOSS REFUND", () => {
  it("lost on day 1: +1 life at day 3's dawn, said on day 2's dusk card and at that dawn", () => {
    expect([REFUND_DAY, REFUND_LIVES, START_LIVES]).toEqual([3, 1, 5]);
    const run = play([L]);
    expect([run.day, run.lives, run.refund]).toEqual([2, 4, undefined]);
    expect(refundNotice(run)).toBeNull();
    startDusk(run, []);
    const r2 = finishDay(run, W, 30, STATS, STATS);
    expect([run.day, run.lives]).toEqual([3, 5]);
    expect(run.refund).toEqual({ day: 3, lives: 1 });
    expect(r2.refund).toBe(1);
    expect(refundCardLine(r2)).toBe("+1 LIFE AT DAWN");
    expect(refundCardLine(run.history[0])).toBeNull(); // day 1's card leads to day 2: nothing then
    expect(refundNotice(run)).toBe(REFUND_TEXT);
    expect(REFUND_TEXT).toBe("EARLY-LOSS REFUND: +1 LIFE");
    // the next dawn doesn't say it again
    play([W], run);
    expect(refundNotice(run)).toBeNull();
    expect(run.lives).toBe(5);
  });

  it("lost on days 1 and 2: +1 only, and never again that run", () => {
    const run = play([L, L]);
    expect([run.day, run.lives, run.losses]).toEqual([3, 4, 2]); // 5 - 2 + 1
    expect(run.refund).toEqual({ day: 3, lives: 1 });
    play([L, L, W, W], run);
    expect([run.day, run.lives, run.losses]).toEqual([7, 2, 4]); // 5 - 4 + 1: day 3's and 4's losses stay lost
    expect(run.history.filter((h) => h.refund).map((h) => h.day)).toEqual([2]);
  });

  it("no early loss: nothing; a loss from day 3 on is never refunded", () => {
    for (const early of [[W, W], [W, D], [D, D], [D, W]] as Out[][]) {
      const run = play(early);
      expect([run.day, run.lives, run.refund], JSON.stringify(early)).toEqual([3, 5, undefined]);
      expect(refundNotice(run)).toBeNull();
      play([L, L, D], run);
      expect([run.day, run.lives, run.refund]).toEqual([6, 3, undefined]);
      expect(run.history.some((h) => h.refund)).toBe(false);
    }
  });

  it("never above the starting 5 lives: a run already at 5 at day 3's dawn gets nothing, and has had its one chance", () => {
    const run = play([L]);
    run.lives = START_LIVES; // PATCH UP on the road of day 2 (events.ts: +1 life, at most START_LIVES)
    play([W], run);
    expect([run.day, run.lives]).toEqual([3, START_LIVES]);
    expect(run.refund).toEqual({ day: 3, lives: 0 });
    expect(run.history[1].refund).toBeUndefined();
    expect(refundNotice(run)).toBeNull();
    expect(earlyLossRefund(run)).toBeNull(); // given (as nothing): no second chance
    play([L, L], run);
    expect(run.lives).toBe(3);
  });

  it("earlyLossRefund applies only at day 3's dawn", () => {
    const run = play([L]);
    expect(earlyLossRefund(run)).toBeNull(); // day 2
    expect(earlyLossRefund({ ...run, day: 3 })).toBe(1);
    expect(earlyLossRefund({ ...run, day: 4 })).toBeNull();
    expect(earlyLossRefund({ ...run, day: 3, lives: 5 })).toBe(0);
    expect(earlyLossRefund({ ...run, day: 3, refund: { day: 3, lives: 1 } })).toBeNull();
  });

  it("a save/load or reload replays it the same way", () => {
    // saved at day 2's dusk (the fight stored, not yet fought): both copies give the same refund
    const run = play([L]);
    startDusk(run, []);
    const copy = reload(run);
    finishDay(run, L, 30, STATS, STATS);
    finishDay(copy, L, 30, STATS, STATS);
    expect(JSON.stringify(copy)).toBe(JSON.stringify(run));
    expect([run.day, run.lives, run.refund]).toEqual([3, 4, { day: 3, lives: 1 }]);
    // reloaded at day 3's dawn: the refund is kept, said again at that dawn, and never given twice
    const back = reload(run);
    expect([back.day, back.lives, back.refund]).toEqual([3, 4, { day: 3, lives: 1 }]);
    expect(refundNotice(back)).toBe(REFUND_TEXT);
    play([L], back);
    play([L], run);
    expect([back.lives, run.lives]).toEqual([3, 3]);
    expect(JSON.stringify(back)).toBe(JSON.stringify(run));
    // a saved refund that isn't { day, lives } reads as used; null reads as none
    expect(migrateRun({ ...JSON.parse(JSON.stringify(run)), refund: "yes" })!.refund).toEqual({ day: 3, lives: 0 });
    const early = JSON.parse(JSON.stringify(play([L])));
    expect(migrateRun({ ...early, refund: null })!.refund).toBeUndefined();
    // a v7 save from before the rule (no refund field), on day 2 after a day-1 loss, gets it like a fresh run
    const old = migrateRun(early)!;
    expect(old.refund).toBeUndefined();
    play([W], old);
    expect([old.day, old.lives, old.refund]).toEqual([3, 5, { day: 3, lives: 1 }]);
  });

  it("a player who throws days 1-2 never ends day 3 with more lives or gold than one who won them (GENRE-STUDY risk 4)", () => {
    const rank = (o: Out): number => (o === W ? 2 : o === D ? 1 : 0);
    const outs: Out[] = [W, D, L];
    const early = outs.flatMap((a) => outs.map((b) => [a, b] as Out[]));
    for (const d3 of outs) {
      const end = new Map(early.map((e) => { const r = play([...e, d3]); return [e.join(","), { lives: r.lives, gold: r.gold }]; }));
      for (const a of early) for (const b of early) {
        if (!(rank(a[0]) <= rank(b[0]) && rank(a[1]) <= rank(b[1]))) continue; // a did no better than b on either day
        const x = end.get(a.join(","))!, y = end.get(b.join(","))!;
        expect(x.lives, `${a} vs ${b}, day 3 ${d3}`).toBeLessThanOrEqual(y.lives);
        expect(x.gold, `${a} vs ${b}, day 3 ${d3}`).toBeLessThanOrEqual(y.gold);
      }
      // the thrower (two losses) against the winner: fewer lives and less gold after day 3
      const thrown = end.get([L, L].join(","))!, won = end.get([W, W].join(","))!;
      expect(thrown.lives).toBeLessThan(won.lives);
      expect(thrown.gold).toBeLessThan(won.gold);
    }
  });

  it("the rules card says it", () => {
    expect(HELP[1]).toContain("LOSE ON DAY 1 OR 2 AND DAY 3'S DAWN GIVES ONE LIFE BACK (ONCE A RUN).");
    expect(HELP[1]).toContain("A DUSK LOSS COSTS ONE, A DRAW NONE.");
  });
});
