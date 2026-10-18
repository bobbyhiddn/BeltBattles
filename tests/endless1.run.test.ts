// ENDLESS-1 3.2 (REQ-BFG-059): THE RUN. CONTINUE ENDLESS (day.ts startEndless) keeps the same run and build and goes to the next dawn
// with ENDLESS_LIVES hearts; an endless dusk (finishDay) adds an endless win, costs ONE heart per loss on every day, costs nothing
// for a draw, never fires LAST CHANCE and never refunds; PATCH UP heals up to 3; endless ends at 0 hearts, at the 30th endless win
// or after the dusk of ENDLESS_LAST_DAY, and every reader of run.over then sees a WON run again. Through the game's own functions.
import { describe, expect, it } from "vitest";
import type { SideStats } from "../src/sim/battle";
import { finishDay, flawless, runWon, startEndless } from "../src/game/day";
import { replayAt } from "../src/game/replays";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { choicesFor, makeEvent, pickChoice } from "../src/game/events";
import { livesCap } from "../src/sim/hearts";
import { ENDLESS_LAST_DAY, ENDLESS_LIVES, ENDLESS_WIN_CAP, endlessDusk, endlessOffered, endlessOver, inEndless, withEndless } from "../src/sim/endless";
import { WIN_GOAL, withLongRun } from "../src/sim/longRun";

const NOSTATS = {} as SideStats;
const WIN = 0, LOSS = 1, DRAW = -1;
type Winner = typeof WIN | typeof LOSS | typeof DRAW;

/** A marked run played through the game's finishDay to its WIN_GOAL-th win (`lossesFirst` losses before, `draws` draws). */
function wonRun(opts: { endless?: boolean; lossesFirst?: number; draws?: number; hero?: "furnace" | "weaver" } = {}): Run {
  const make = () => newRun(opts.hero ?? "furnace", 4242, "e1-run");
  const run = opts.endless === false ? make() : withEndless(make);
  const dusk = (w: Winner) => {
    const offer = pendingRune(run);
    if (offer) takeRune(run, offer.ids[0]); // the dawn's rune, as a player takes it
    finishDay(run, w, 20, NOSTATS, NOSTATS);
  };
  for (let i = 0; i < (opts.lossesFirst ?? 0); i++) dusk(LOSS);
  for (let i = 0; i < (opts.draws ?? 0); i++) dusk(DRAW);
  while (!run.over) dusk(WIN);
  return run;
}
const fight = (run: Run, w: Winner) => {
  const offer = pendingRune(run);
  if (offer) takeRune(run, offer.ids[0]);
  return finishDay(run, w, 20, NOSTATS, NOSTATS);
};

describe("ENDLESS-1 3.2: the won run, before the choice (nothing here changes with endless)", () => {
  it("the 10th win ends a MARKED run exactly as it ends an unmarked one: over \"won\", wins WIN_GOAL, the same hearts and history", () => {
    const a = wonRun({ endless: true, lossesFirst: 2 });
    const b = wonRun({ endless: false, lossesFirst: 2 });
    expect([a.over, a.wins, a.losses, a.lives, a.day, a.history.length]).toEqual([b.over, b.wins, b.losses, b.lives, b.day, b.history.length]);
    expect(a.over).toBe("won");
    expect(a.wins).toBe(WIN_GOAL);
    expect(a.history).toEqual(b.history);
    expect(a.gold).toBe(b.gold);
    expect(runWon(a)).toBe(true);
    expect(a.endlessRun).toBeUndefined();
  });

  it("an unmarked run is not offered endless, and startEndless refuses it (changes nothing)", () => {
    const run = wonRun({ endless: false });
    expect(endlessOffered(run)).toBe(false);
    const before = JSON.stringify(run);
    expect(startEndless(run)).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
  });

  it("a marked run that is not won (playing, or lost) cannot start endless", () => {
    const playing = withEndless(() => newRun("furnace", 1, "p"));
    expect(startEndless(playing)).toBe(false);
    const lost = withEndless(() => newRun("furnace", 1, "l"));
    lost.over = "lost";
    expect(startEndless(lost)).toBe(false);
  });
});

describe("ENDLESS-1 3.2: CONTINUE ENDLESS (day.ts startEndless)", () => {
  it("keeps the same run and build, sets the endless state, 3 fresh hearts whatever the run had left, and goes to the next dawn", () => {
    const run = wonRun({ lossesFirst: 3 }); // a 10-hearts run that lost 3 dusks: fewer than 10 hearts left
    expect(run.lives).toBeLessThan(10);
    const { hero, build, gold, wins, losses, runId, day, history, inventory } = JSON.parse(JSON.stringify(run)) as Run;
    const victoryDay = run.day;
    expect(startEndless(run)).toBe(true);
    expect(run.endlessRun).toEqual({ victoryDay, wins: 0, losses: 0, draws: 0 });
    expect(run.over).toBeNull();
    expect(run.lives).toBe(ENDLESS_LIVES);
    expect(run.day).toBe(day + 1);
    expect(run.stage).toBe("caravan");
    expect(run.dusk).toBeNull();
    // the same run: hero, build, cargo, the run's own wins and losses and history are untouched (the dawn's rune and shop are new)
    expect([run.hero, run.runId, run.wins, run.losses, run.history.length]).toEqual([hero, runId, wins, losses, history.length]);
    expect(run.inventory).toEqual(inventory);
    expect(run.build.items).toEqual(build.items);
    expect(run.gold).toBeGreaterThanOrEqual(gold); // dawn gold runes may add; nothing is taken
    expect(inEndless(run)).toBe(true);
    expect(endlessOver(run)).toBe(false);
    expect(startEndless(run)).toBe(false); // once
  });

  it("every day still has its dawn rune, its shop and its road", () => {
    const run = wonRun();
    startEndless(run);
    expect(run.shop.wagons.length).toBeGreaterThan(0); // the shop is rolled
    expect(run.runeDay).toBe(run.day); // the dawn rune is pending for the new day
    expect(run.build.runes!.length).toBe(run.day - 1); // one rune a dawn so far (no pick for the new day taken yet)
  });
});

describe("ENDLESS-1 3.2: an endless dusk (finishDay)", () => {
  it("a win adds an endless win (run.wins stays WIN_GOAL) and goes to the next dawn", () => {
    const run = wonRun();
    startEndless(run);
    const day = run.day;
    const res = fight(run, WIN);
    expect(run.endlessRun!.wins).toBe(1);
    expect(run.wins).toBe(WIN_GOAL);
    expect(run.over).toBeNull();
    expect(run.day).toBe(day + 1);
    expect(res.outcome).toBe("win");
    expect(run.lives).toBe(ENDLESS_LIVES);
  });

  it("a loss costs ONE heart on every day (not the run's ladder), a draw costs none; the run's own losses stay the run's", () => {
    const run = wonRun();
    const runLosses = run.losses;
    startEndless(run);
    expect(run.day).toBeGreaterThanOrEqual(11); // the run's ladder costs 2 here
    const res = fight(run, LOSS);
    expect(run.lives).toBe(ENDLESS_LIVES - 1);
    expect(res.heartsLost).toBe(1);
    expect(run.endlessRun!.losses).toBe(1);
    expect(run.losses).toBe(runLosses);
    const hearts = run.lives;
    fight(run, DRAW);
    expect(run.lives).toBe(hearts);
    expect(run.endlessRun!.draws).toBe(1);
    expect(run.over).toBeNull();
  });

  it("no LAST CHANCE (not at 1 heart, not on any day) and no early-loss refund", () => {
    const run = wonRun();
    startEndless(run);
    fight(run, LOSS); // 2 hearts
    fight(run, WIN);
    const res = fight(run, LOSS); // 1 heart: a run's LAST CHANCE would fire here
    expect(run.lives).toBe(1);
    expect(res.lastChance).toBeUndefined();
    expect(run.lastChance?.day).not.toBe(run.day - 1);
    expect(res.refund).toBeUndefined();
    expect(run.over).toBeNull();
    expect(run.lastChance === undefined || run.lastChance.day <= run.endlessRun!.victoryDay).toBe(true);
  });

  it("ends at the 3rd heart lost: over \"won\" again, endless over (hearts), the score kept; every reader of run.over sees a won run", () => {
    const run = wonRun();
    startEndless(run);
    fight(run, WIN);
    fight(run, WIN);
    fight(run, LOSS);
    fight(run, LOSS);
    expect(run.over).toBeNull();
    fight(run, LOSS);
    expect(run.over).toBe("won");
    expect(run.lives).toBe(0);
    expect(run.endlessRun).toMatchObject({ wins: 2, losses: 3, draws: 0, end: "hearts" });
    expect(runWon(run)).toBe(true);
    expect(endlessOver(run)).toBe(true);
    expect(inEndless(run)).toBe(false);
    expect(flawless(run)).toBe(run.losses === 0); // the run's own record decides, not endless
    expect(run.wins).toBe(WIN_GOAL);
  });

  it("ends at the ENDLESS_WIN_CAP-th endless win (a perfect endless)", () => {
    const run = wonRun();
    startEndless(run);
    for (let i = 0; i < ENDLESS_WIN_CAP - 1; i++) fight(run, WIN);
    expect(run.over).toBeNull();
    expect(run.endlessRun!.wins).toBe(ENDLESS_WIN_CAP - 1);
    fight(run, WIN);
    expect(run.over).toBe("won");
    expect(run.endlessRun).toMatchObject({ wins: ENDLESS_WIN_CAP, end: "cap" });
    expect(run.lives).toBe(ENDLESS_LIVES);
  });

  it("ends after the dusk of ENDLESS_LAST_DAY (draws are the only way there)", () => {
    const run = wonRun();
    startEndless(run);
    let guard = 0;
    while (!run.over && guard++ < 200) fight(run, DRAW);
    expect(run.over).toBe("won");
    expect(run.endlessRun!.end).toBe("lastDay");
    expect(run.day).toBe(ENDLESS_LAST_DAY);
    expect(run.endlessRun!.draws).toBe(ENDLESS_LAST_DAY - run.endlessRun!.victoryDay);
    expect(run.lives).toBe(ENDLESS_LIVES);
  });
});

describe("ENDLESS-1 3.2: the history row of an endless dusk, and the replay's wins carried in", () => {
  it("an endless dusk's DayResult says so; a run dusk's never does", () => {
    const run = wonRun();
    expect(run.history.every((h) => h.endless === undefined)).toBe(true);
    startEndless(run);
    const a = fight(run, WIN), b = fight(run, LOSS);
    expect([a.endless, b.endless]).toEqual([true, true]);
    expect(run.history.slice(0, WIN_GOAL).every((h) => h.endless === undefined)).toBe(true);
  });

  it("replayAt: the wins carried into any dusk are the run's own (endless wins are not WARLORD'S DUE's), so an endless dusk's record replays", () => {
    const run = wonRun();
    startEndless(run);
    for (let i = 0; i < 4; i++) fight(run, WIN);
    expect(run.history).toHaveLength(WIN_GOAL + 4);
    expect(replayAt(run.history, WIN_GOAL - 1).wins).toBe(WIN_GOAL - 1); // the victory dusk: 9 carried in
    for (let i = WIN_GOAL; i < run.history.length; i++) expect(replayAt(run.history, i).wins, `row ${i}`).toBe(WIN_GOAL); // every endless dusk: the run's 10
    expect(run.history.filter((h) => h.outcome === "win" && !h.endless)).toHaveLength(WIN_GOAL);
  });
});

describe("ENDLESS-1 3.2: PATCH UP heals up to 3 (events.ts through livesCap)", () => {
  /** The DOCK on today's road: PATCH UP's choice taken (or refused), as the game takes it. */
  const patchUp = (run: Run): { ok: boolean; reason?: string } => {
    run.event = makeEvent(run.seed, run.day, "dock");
    const i = choicesFor(run).findIndex((c) => c.label === "PATCH UP");
    expect(i).toBeGreaterThanOrEqual(0);
    run.gold = Math.max(run.gold, 10);
    const r = pickChoice(run, i);
    run.event = null;
    return r;
  };

  it("an endless run's hearts cap is ENDLESS_LIVES; a run's is HEARTS_START; the cap returns when endless is over", () => {
    const run = wonRun();
    expect(livesCap(run)).toBe(10);
    startEndless(run);
    expect(livesCap(run)).toBe(ENDLESS_LIVES);
    fight(run, LOSS);
    fight(run, LOSS);
    expect(run.lives).toBe(1);
    fight(run, WIN); // (a win moves the day on; the dock is a road stop of any day)
    expect(patchUp(run).ok).toBe(true);
    expect(run.lives).toBe(2);
    run.day++;
    expect(patchUp(run).ok).toBe(true);
    expect(run.lives).toBe(ENDLESS_LIVES);
    run.day++;
    const full = patchUp(run); // never above 3, not the run's 10
    expect(full.ok).toBe(false);
    expect(full.reason).toBe("HEARTS FULL");
    expect(run.lives).toBe(ENDLESS_LIVES);
    fight(run, LOSS);
    fight(run, LOSS);
    fight(run, LOSS);
    expect(run.over).toBe("won");
    expect(livesCap(run)).toBe(10);
  });

  it("PATCH UP in a run (before the 10th win) is unchanged: it heals up to the run's 10 hearts", () => {
    const run = withEndless(() => newRun("furnace", 99, "pu"));
    run.lives = 6;
    expect(livesCap(run)).toBe(10);
    expect(patchUp(run).ok).toBe(true);
    expect(run.lives).toBe(7);
  });
});

describe("ENDLESS-1 3.2: the bench's ledger and the game's finishDay take the same endless step", () => {
  it("200 seeded outcome sequences: endless wins, losses, draws, the end and the last day agree (endlessDusk is the one step)", () => {
    let seed = 12345;
    const next = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 200; n++) {
      const pWin = 0.25 + 0.7 * next(), pLoss = (1 - pWin) * (0.55 + 0.4 * next()); // the rest are draws
      const outcomes: Winner[] = Array.from({ length: 80 }, () => { const r = next(); return r < pWin ? WIN : r < pWin + pLoss ? LOSS : DRAW; });
      // the game
      const run = wonRun();
      startEndless(run);
      const victoryDay = run.endlessRun!.victoryDay;
      let i = 0;
      while (!run.over) fight(run, outcomes[i++]);
      // the ledger (endlessBench.ts phase B's loop)
      let hearts = ENDLESS_LIVES, ew = 0, el = 0, ed = 0, day = victoryDay + 1, end: string | null = null;
      for (let j = 0; end === null; j++, day++) {
        const o = outcomes[j] === WIN ? "win" : outcomes[j] === LOSS ? "loss" : "draw";
        const s = endlessDusk(hearts, ew, day, o);
        hearts = s.hearts; ew = s.wins;
        if (o === "loss") el++; else if (o === "draw") ed++;
        end = s.end;
        if (end !== null) break;
      }
      expect(run.endlessRun, `sequence ${n}`).toMatchObject({ wins: ew, losses: el, draws: ed, end });
      expect(run.day, `sequence ${n}`).toBe(day);
      expect(run.lives, `sequence ${n}`).toBe(hearts);
      expect(run.over).toBe("won");
    }
  });
});

describe("ENDLESS-1 3.2: with the switch off the game is as it was", () => {
  it("a run started with ENDLESS off wins and ends exactly as 0.9.11's (no mark, no endless state anywhere)", () => {
    const run = withLongRun(() => wonRun({ endless: false }));
    expect(run.over).toBe("won");
    expect(JSON.stringify(run)).not.toContain("endless");
  });
});
