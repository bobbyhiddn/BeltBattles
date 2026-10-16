// RUN-1 T4 (REQ-BFG-059, REQ-BFG-116; BRIEF-RUN1 D7): the screens' words for the long run. A long run (Run.longRun, set by newRun
// while LONG_RUN is on) is won at 10 wins and lost at 0 hearts, with no day limit, so no screen shows its day as "n/10" and the
// end card says RUN WON. Every screen reads the RUN's own mark (never the switch), so with the switch off, and for a run (or a
// save) without the mark, each string is exactly as live. The "before" column below is copied from run1-base's code (a8c0510)
// with the expressions the screens drew then; the "after" column is the new words.
//   - the build bar (chrome.ts barRun), the fork header (fork.ts forkHead), the dusk / road banners (battle.ts fightHead), the
//     replay banner (replay.ts replayHead), the title's rules card (title.ts helpLines: the SWITCH, a new run has no mark yet)
//     and continue card (continueSub), the end card (summary.ts endTitle, wonLine, lostLine), the history rows from day 11 on
//     (amber day, foldRows for a run too deep for the screen), and the stakes line on day 10 and later (stakes.ts duskStakes).
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeView } from "../src/core/io";
import { C } from "../src/render/palette";
import { HEROES, RUN_DAYS } from "../src/sim/content";
import { HEARTS_START, heartCost, heartsRules, withHearts } from "../src/sim/hearts";
import { WIN_GOAL, longRunRules, setLongRun, withLongRun } from "../src/sim/longRun";
import { finishDay, flawless } from "../src/game/day";
import { newRun, type Run } from "../src/game/run";
import { barRun } from "../src/screens/build/chrome";
import { forkHead } from "../src/screens/fork/fork";
import { fightHead } from "../src/screens/battle";
import { replayHead } from "../src/screens/replay";
import { HELP, HELP_HEARTS_2, HELP_KEYWORDS, HELP_LONG_1, HELP_LONG_2, continueSub, helpLine3, helpLines } from "../src/screens/title";
import { SummaryScreen, endTitle, foldRows, foldText, lostLine, summaryLayout, wonLine, type HistoryRow } from "../src/screens/summary";
import { LONG_ROAD_FROM, dayText, onLongRoad } from "../src/screens/runDay";
import { duskStakes } from "../src/ui/stakes";
import { RIVAL_IDS } from "../src/sim/rivals";
import type { Game } from "../src/game/game";
import type { SideStats } from "../src/sim/battle";

const S = {} as SideStats;
afterEach(() => setLongRun(false)); // the shipped value

/** A fresh hearts run, long with the switch on (newRun's mark), else the 10-day run. */
const runOf = (long: boolean, seed = 11): Run => withHearts(() => withLongRun(() => newRun("furnace", seed, `run1s-${seed}`), long));
/** Play the dusks in `seq` (W win, L loss, D draw), one a day, stopping when the run ends. */
function play(run: Run, seq: string): Run {
  for (const c of seq) {
    if (run.over) break;
    finishDay(run, c === "W" ? 0 : c === "L" ? 1 : -1, 30, S, S);
  }
  return run;
}
/** A run standing at the dawn of `day` with `wins` (the bar, the fork and the banners read only these). */
const at = (long: boolean, day: number, wins: number): Run => Object.assign(runOf(long), { day, wins });

describe("RUN-1 T4: the day, as a screen says it (runDay.ts)", () => {
  it("a 10-day run's day is DAY n/10 as live; a long run's DAY n, never /N, on any day", () => {
    for (let d = 1; d <= 30; d++) {
      expect(dayText(d, false)).toBe(`DAY ${d}/${RUN_DAYS}`);
      expect(dayText(d, true)).toBe(`DAY ${d}`);
      expect(dayText(d, true)).not.toContain("/");
    }
    expect(dayText(3, false)).toBe("DAY 3/10");
    expect(dayText(12, true)).toBe("DAY 12");
  });

  it("the long road starts on day 11, and only a long run is on it", () => {
    expect(LONG_ROAD_FROM).toBe(RUN_DAYS + 1);
    expect([9, 10, 11, 12].map((d) => onLongRoad(d, true))).toEqual([false, false, true, true]);
    expect([9, 10, 11, 12].map((d) => onLongRoad(d, false))).toEqual([false, false, false, false]);
  });
});

describe("RUN-1 T4: the build bar (chrome.ts barRun)", () => {
  // before: ` · DAY ${run.day}/${RUN_DAYS}` in C.bone, after the stage word
  const before = (run: Pick<Run, "day">): [string, string][] => [[` · DAY ${run.day}/${RUN_DAYS}`, C.bone]];

  it("switch off, and any run without the mark: DAY n/10 as live, every day 1-10", () => {
    for (let d = 1; d <= RUN_DAYS; d++) {
      const run = at(false, d, Math.min(d - 1, 9));
      expect(barRun(run)).toEqual(before(run));
    }
    expect(barRun(at(false, 3, 1))).toEqual([[" · DAY 3/10", C.bone]]);
  });

  it("a long run on day 12 with 3 wins: WINS 3/10 and DAY 12 (amber, never /N)", () => {
    const run = at(true, 12, 3);
    expect(run.longRun).toBe(true);
    expect(barRun(run)).toEqual([[" · WINS 3/10", C.bone], [" · DAY 12", C.amber]]);
    expect(barRun(run).map(([t]) => t).join("")).not.toMatch(/DAY \d+\//);
  });

  it("a long run's day is bone until day 10 and amber from day 11; its WINS carries the /10 (the goal)", () => {
    expect(barRun(at(true, 1, 0))).toEqual([[" · WINS 0/10", C.bone], [" · DAY 1", C.bone]]);
    expect(barRun(at(true, 10, 9))).toEqual([[" · WINS 9/10", C.bone], [" · DAY 10", C.bone]]);
    expect(barRun(at(true, 11, 4))[1]).toEqual([" · DAY 11", C.amber]);
    expect(barRun(at(true, 17, 9))).toEqual([[" · WINS 9/10", C.bone], [" · DAY 17", C.amber]]);
    expect(WIN_GOAL).toBe(10);
  });

  it("reads the RUN's mark, not the switch: a run without it keeps the live bar while the switch is on, and a marked run keeps its words with the switch off", () => {
    const old = at(false, 12, 3), long = at(true, 12, 3);
    expect(longRunRules()).toBe(false);
    expect(barRun(long)[0][0]).toBe(" · WINS 3/10"); // the switch is off here
    withLongRun(() => {
      expect(longRunRules()).toBe(true);
      expect(barRun(old)).toEqual([[" · DAY 12/10", C.bone]]); // a 10-day run's own (a save from before the bump)
    });
  });
});

describe("RUN-1 T4: the fork, the banners and the replay", () => {
  it("fork: THE ROAD · DAY n/10 as live; THE ROAD · DAY 12 on a long run", () => {
    for (let d = 1; d <= RUN_DAYS; d++) expect(forkHead(at(false, d, 0))).toBe(`THE ROAD · DAY ${d}/${RUN_DAYS}`);
    expect(forkHead(at(false, 7, 3))).toBe("THE ROAD · DAY 7/10");
    expect(forkHead(at(true, 12, 3))).toBe("THE ROAD · DAY 12");
    expect(forkHead(at(true, 4, 1))).toBe("THE ROAD · DAY 4");
  });

  it("the fight intro (and the online wait): DUSK · DAY n/10 and ROAD · DAY n/10 as live; DUSK · DAY 12 and ROAD · DAY 12 on a long run", () => {
    for (let d = 1; d <= RUN_DAYS; d++) {
      expect(fightHead(false, d, false)).toBe(`DUSK · DAY ${d}/${RUN_DAYS}`);
      expect(fightHead(true, d, false)).toBe(`ROAD · DAY ${d}/${RUN_DAYS}`);
    }
    expect(fightHead(false, 12, true)).toBe("DUSK · DAY 12");
    expect(fightHead(true, 12, true)).toBe("ROAD · DAY 12");
    expect(fightHead(false, 12, false)).toBe("DUSK · DAY 12/10"); // a 10-day run never reaches day 12; the string is the live expression's
  });

  it("the replay banner: REPLAY · DAY n/10 as live; REPLAY · DAY 12 on a long run", () => {
    for (let d = 1; d <= RUN_DAYS; d++) expect(replayHead(d, false)).toBe(`REPLAY · DAY ${d}/${RUN_DAYS}`);
    expect(replayHead(12, true)).toBe("REPLAY · DAY 12");
  });
});

describe("RUN-1 T4: the title's rules card and continue card", () => {
  // the live card (HEARTS on, FREE_JOINS on, as shipped): copied from run1-base
  const LIVE_1 = "1  SURVIVE 10 DAYS. EACH DAY IS THE CARAVAN AT DAWN, THE ROAD, THEN A DUSK FIGHT AGAINST A GHOST: ANOTHER CAPTAIN'S SAVED CRUISER.";
  const LIVE_2 = "2  YOU HAVE 10 HEARTS. A DUSK LOSS COSTS 1 ON DAYS 1-3, 2 ON DAYS 4-6 AND 3 FROM DAY 7, A DRAW NONE. YOUR SCORE IS YOUR W-L RECORD (10-0 IS FLAWLESS).";

  it("switch off: the card is the live card, word for word (HELP's line 1, the hearts rule's line 2)", () => {
    expect(longRunRules()).toBe(false);
    expect(heartsRules()).toBe(true);
    const lines = helpLines();
    expect(lines[0]).toBe(LIVE_1);
    expect(lines[1]).toBe(LIVE_2);
    expect(lines).toEqual([HELP[0], HELP_HEARTS_2, helpLine3(), HELP[3], HELP[4], HELP_KEYWORDS]);
    expect(HELP[0]).toBe(LIVE_1);
    expect(HELP_HEARTS_2).toBe(LIVE_2);
  });

  it("switch off with HEARTS off too: HELP itself, as RETUNE-1 pinned", () => {
    withHearts(() => expect(helpLines().slice(0, 2)).toEqual([HELP[0], HELP[1]]), false);
  });

  it("LONG_RUN on: line 1 says WIN 10 DUSK FIGHTS, line 2 the hearts rule's words, then how the run ends; the other lines don't move", () => {
    const lines = withLongRun(() => helpLines());
    expect(lines.length).toBe(6);
    expect(lines[0]).toBe("1  WIN 10 DUSK FIGHTS. EACH DAY IS THE CARAVAN AT DAWN, THE ROAD, THEN A DUSK FIGHT AGAINST A GHOST: ANOTHER CAPTAIN'S SAVED CRUISER.");
    expect(lines[1]).toBe("2  YOU HAVE 10 HEARTS. A DUSK LOSS COSTS 1 ON DAYS 1-3, 2 ON DAYS 4-6 AND 3 FROM DAY 7, A DRAW NONE. THE RUN IS WON AT 10 WINS AND LOST WHEN YOUR HEARTS RUN OUT. THERE IS NO DAY LIMIT. 10-0 IS FLAWLESS.");
    expect(lines[0]).toBe(HELP_LONG_1);
    expect(lines[1]).toBe(HELP_LONG_2);
    expect(lines.slice(2)).toEqual([helpLine3(), HELP[3], HELP[4], HELP_KEYWORDS]);
    expect(longRunRules()).toBe(false); // withLongRun put the switch back
  });

  it("the long card keeps the hearts rule's words (up to A DRAW NONE.) and never says 10 days or 5 lives", () => {
    const rule = HELP_HEARTS_2.slice(0, HELP_HEARTS_2.indexOf("A DRAW NONE.") + "A DRAW NONE.".length);
    expect(rule).toBe("2  YOU HAVE 10 HEARTS. A DUSK LOSS COSTS 1 ON DAYS 1-3, 2 ON DAYS 4-6 AND 3 FROM DAY 7, A DRAW NONE.");
    expect(HELP_LONG_2.startsWith(rule)).toBe(true);
    expect(HELP_LONG_2).toContain(`${HEARTS_START} HEARTS`);
    expect(HELP_LONG_2).toContain(`WON AT ${WIN_GOAL} WINS`);
    expect(HELP_LONG_2).toContain("LOST WHEN YOUR HEARTS RUN OUT");
    expect([heartCost(1), heartCost(4), heartCost(7), heartCost(12)]).toEqual([1, 2, 3, 3]);
    for (const ln of [HELP_LONG_1, HELP_LONG_2]) {
      expect(ln).not.toMatch(/10 DAYS|SURVIVE|LIVES|\bLIFE\b|ENDLESS|RANK|CHAMPION/);
    }
  });

  it("the long card's words are not among the retired coined words (words1.text's list)", () => {
    const RETIRED = [/\bVOLLEY/, /\bMERGED\b/, /\bSTAMPS?\b/, /\bMACHINES?\b/, /NEXT RIG'S/, /BONUS DAMAGE/, /\bBLOCKS \d/, /\bWRECK/, /\bMATCHED\b/, /\bPAYLOADS?\b/, /\bSHOCK/, /\bSTALL/, /\bCOPIES\b/, /\bAMMO\b/];
    for (const ln of [HELP_LONG_1, HELP_LONG_2]) for (const re of RETIRED) expect(ln, String(re)).not.toMatch(re);
  });

  it("LONG_RUN on, HEARTS off (not shipped): line 2 stays the 5-lives rule it is true to", () => {
    withHearts(() => withLongRun(() => {
      const lines = helpLines();
      expect(lines[0]).toBe(HELP_LONG_1);
      expect(lines[1]).toBe(HELP[1]);
    }), false);
  });

  it("the continue card: DAY n/10 · HERO · W-L as live; WINS n/10 · DAY n · HERO · W-L for a long run's save", () => {
    const hero = HEROES.furnace.name;
    expect(hero).toBe("FURNACE");
    const old = { day: 6, wins: 3, losses: 2, hero: "furnace" as const };
    expect(continueSub(old)).toBe("DAY 6/10 · FURNACE · 3-2");
    expect(continueSub({ ...old, day: 12, wins: 3, losses: 8, longRun: true })).toBe("WINS 3/10 · DAY 12 · FURNACE · 3-8");
    expect(continueSub({ ...old, day: 3, wins: 1, losses: 1, longRun: true })).toBe("WINS 1/10 · DAY 3 · FURNACE · 1-1");
    withLongRun(() => expect(continueSub(old)).toBe("DAY 6/10 · FURNACE · 3-2")); // the switch is not the save's mark
  });
});

describe("RUN-1 T4: the end card", () => {
  it("a 10-day run's end card is as live: RUN COMPLETE, '<HERO> · 10 DAYS SURVIVED · W-L w-l', RUN LOST", () => {
    const ten = play(runOf(false), "WWWWWWWWWW");
    expect(ten.over).toBe("complete");
    expect(endTitle(true, false)).toBe("RUN COMPLETE");
    expect(wonLine(ten)).toBe("FURNACE · 10 DAYS SURVIVED · W-L 10-0");
    expect(flawless(ten)).toBe(true);
    const lost = play(runOf(false), "LLLLLLLLLL");
    expect(lost.over).toBe("lost");
    expect(endTitle(false, false)).toBe("RUN LOST");
    expect(lostLine(lost)).toBe(`ON DAY ${lost.day} · FURNACE · W-L 0-${lost.losses}`);
    // a long run's mark off: a RUN WON would still read COMPLETE
    expect(wonLine(Object.assign(runOf(false), { wins: 7, losses: 3, day: 10 }))).toBe("FURNACE · 10 DAYS SURVIVED · W-L 7-3");
  });

  it("RUN WON on day 13: FURNACE WON 10 OF 13 DUSKS, ON DAY 13 (3 losses first, then 10 wins)", () => {
    const run = play(runOf(true), "LLL" + "WWWWWWWWWW" + "WWW");
    expect(run.over).toBe("won");
    expect(run.day).toBe(13);
    expect(endTitle(true, true)).toBe("RUN WON");
    expect(wonLine(run)).toBe("FURNACE WON 10 OF 13 DUSKS, ON DAY 13");
    expect(flawless(run)).toBe(false);
    expect(wonLine(run)).not.toMatch(/SURVIVED|\/10|COMPLETE/);
  });

  it("FLAWLESS at 10-0 (a draw doesn't spoil it); the dusks count the draws", () => {
    const run = play(runOf(true), "WDWWWWWWWDWW");
    expect(run.over).toBe("won");
    expect(flawless(run)).toBe(true);
    expect(wonLine(run)).toBe("FURNACE WON 10 OF 12 DUSKS, ON DAY 12");
    const clean = play(runOf(true), "WWWWWWWWWW");
    expect(flawless(clean)).toBe(true);
    expect(wonLine(clean)).toBe("FURNACE WON 10 OF 10 DUSKS, ON DAY 10");
  });

  it("RUN LOST on day 12: its day and W-L", () => {
    const run = play(runOf(true), "LLLLLL" + "WWWWW" + "L" + "WWW");
    expect(run.over).toBe("lost");
    expect(run.day).toBe(12);
    expect(endTitle(false, true)).toBe("RUN LOST");
    expect(lostLine(run)).toBe("ON DAY 12 · FURNACE · W-L 5-7");
  });

  it("the screen reads a long run's WON as a win (complete) and a lost run as not", () => {
    const stub = (run: Run): SummaryScreen => new SummaryScreen({ run, view: computeView(402, 690, 3) } as unknown as Game);
    expect(stub(play(runOf(true), "LLL" + "WWWWWWWWWW" + "WWW")).complete).toBe(true);
    expect(stub(play(runOf(true), "LLLLLL" + "WWWWW" + "L" + "WWW")).complete).toBe(false);
    expect(stub(play(runOf(false), "WWWWWWWWWW")).complete).toBe(true);
  });
});

describe("RUN-1 T4: the run history from day 11 on", () => {
  const row = (day: number, outcome: HistoryRow["outcome"], dusk: boolean): HistoryRow => ({
    day, stop: dusk ? "DUSK" : "EASY", stopColor: C.slate4, foe: "FOE", foeColor: C.bone, outcome, time: 40, ...(dusk ? { at: day - 1 } : {}),
  });

  it("rows that fit stay whole; too many fold their earliest days into one row and keep the latest whole", () => {
    const rows: HistoryRow[] = [];
    for (let d = 1; d <= 12; d++) { rows.push(row(d, "win", false)); rows.push(row(d, d % 3 === 0 ? "loss" : d === 5 ? "draw" : "win", true)); }
    expect(foldRows(rows, 24)).toBe(rows);
    expect(foldRows(rows, 40)).toBe(rows);
    const f = foldRows(rows, 10);
    // 24 rows, 10 to keep: the first 15 fold, which ends on day 8's warlord row, so day 8 folds whole (its dusk too): 16 rows
    expect(f.length).toBe(9);
    expect(f[0].fold).toEqual({ from: 1, to: 8, w: 5, l: 2, d: 1 }); // days 1-8: losses on 3 and 6, a draw on 5, the rest won
    expect(foldText(f[0].fold!)).toBe("DAYS 1-8 · 5 W · 2 L · 1 D");
    expect(f.slice(1)).toEqual(rows.slice(16)); // days 9-12 whole
    expect(f.slice(1).map((r) => r.day)).toEqual([9, 9, 10, 10, 11, 11, 12, 12]);
    expect(f[f.length - 1].day).toBe(12);
    const g = foldRows(rows, 9); // 16 fold, the day boundary is already there
    expect(g.length).toBe(9);
    expect(g[0].fold).toEqual(f[0].fold);
  });

  it("a fold never hides the run's last row, even when almost nothing fits, and counts dusks only (warlord rows have no `at`)", () => {
    const rows = [row(1, "loss", false), row(1, "win", true), row(2, "win", false), row(2, "win", true), row(3, "win", true)];
    const f = foldRows(rows, 1);
    expect(f.length).toBe(2);
    expect(f[1]).toBe(rows[4]);
    expect(f[0].fold).toEqual({ from: 1, to: 2, w: 2, l: 0, d: 0 });
    expect(foldText({ from: 1, to: 2, w: 2, l: 0, d: 0 })).toBe("DAYS 1-2 · 2 W · 0 L");
  });

  it("a long run too deep for a phone's card folds until it fits 402x690; a 10-day run's rows are never folded", () => {
    // 25 days, 9 wins (the run is not over: draws are free), a warlord fight on every day: 50 rows
    const long = play(runOf(true), "D".repeat(16) + "W".repeat(9));
    expect(long.over).toBeNull();
    expect(long.day).toBe(26);
    expect(long.history.length).toBe(25);
    for (let d = 1; d <= 25; d++) long.warlords.push({ day: d, tier: "easy", id: RIVAL_IDS[0], name: "WARLORD", outcome: "win", time: 20, gold: 0, part: null });
    const view = computeView(402, 690, 3);
    const s = new SummaryScreen({ run: long, view } as unknown as Game);
    const all = s.fights();
    expect(all.length).toBe(50);
    const rows = s.rows();
    expect(rows.length).toBeLessThan(50);
    expect(rows[0].fold?.from).toBe(1);
    expect(rows[rows.length - 1].day).toBe(25);
    expect(rows[rows.length - 1]).toEqual(all[all.length - 1]);
    const L = summaryLayout(view, rows.length, 0, 0);
    expect(L.card.y + L.card.h).toBeLessThanOrEqual(view.H - 4); // the card is on the screen, NEW RUN and TITLE with it
    expect(L.card.y).toBeGreaterThanOrEqual(0);
    // the fold counts the dusks of the days it covers
    const fold = rows[0].fold!;
    const dusks = long.history.slice(0, fold.to);
    expect([fold.w, fold.l, fold.d]).toEqual(["win", "loss", "draw"].map((o) => dusks.filter((d) => d.outcome === o).length));
    // the same rows on a run without the mark are fights(), whole (the live card)
    const ten = Object.assign(runOf(false), { history: long.history, warlords: long.warlords });
    const t = new SummaryScreen({ run: ten, view } as unknown as Game);
    expect(t.rows()).toEqual(t.fights());
    expect(t.rows().length).toBe(50);
  });

  it("a run into the teens of days (13 days, a warlord every day) fits 402x690 whole and the desk whole", () => {
    const run = play(runOf(true), "LLL" + "WWWWWWWWWW" + "WWW");
    for (let d = 1; d <= 13; d++) run.warlords.push({ day: d, tier: "easy", id: RIVAL_IDS[0], name: "WARLORD", outcome: "win", time: 20, gold: 0, part: null });
    for (const [w, h, dpr] of [[402, 690, 3], [1920, 1080, 1]] as const) {
      const view = computeView(w, h, dpr);
      const s = new SummaryScreen({ run, view } as unknown as Game);
      const all = s.fights(), rows = s.rows();
      expect(all.length).toBe(26);
      const L = summaryLayout(view, rows.length, 0, 0);
      expect(L.card.y + L.card.h, `${w}x${h}`).toBeLessThanOrEqual(view.H - 4);
      if (rows.length < all.length) expect(rows[0].fold, `${w}x${h}`).toBeTruthy(); // a fold only when the card can't fit it whole
    }
  });
});

describe("RUN-1 T4: the stakes line says LAST CHANCE on day 10 and later (stakes.ts)", () => {
  const hearts = (day: number, lives: number, long: boolean, used = false) => ({ hearts: true as const, lives, day, lastChance: used ? { day: 2 } : undefined, ...(long ? { longRun: true as const } : {}) });

  it("a 10-day hearts run is as live: LAST CHANCE saves only before day 10", () => {
    expect(duskStakes(hearts(9, 3, false))).toEqual({ cost: 3, saves: true });
    expect(duskStakes(hearts(10, 3, false))).toEqual({ cost: 3, saves: false });
  });

  it("a long run: it still would on day 10, 11, 12 and later (the rule day.ts takes), once a run", () => {
    for (const d of [9, 10, 11, 12, 17]) expect(duskStakes(hearts(d, 3, true)), `day ${d}`).toEqual({ cost: 3, saves: true });
    expect(duskStakes(hearts(12, 3, true, true))).toEqual({ cost: 3, saves: false }); // spent
    expect(duskStakes(hearts(12, 8, true))).toEqual({ cost: 3, saves: false }); // a loss leaves 5
  });

  it("no hearts mark: nothing is drawn, as before", () => {
    expect(duskStakes({ lives: 3, day: 12, lastChance: undefined, longRun: true })).toBeNull();
  });
});

describe("RUN-1 T4: no screen draws a day as n/10 past the helpers", () => {
  const FILES = ["src/screens/build/chrome.ts", "src/screens/fork/fork.ts", "src/screens/battle.ts", "src/screens/replay.ts", "src/screens/title.ts"];
  it("the five screens build their DAY words with dayText (no `DAY ${...}/${RUN_DAYS}` of their own)", () => {
    for (const f of FILES) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/DAY \$\{[^}]*\}\/\$\{RUN_DAYS\}/);
    }
  });
});

beforeEach(() => setLongRun(false));
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0, clear: () => undefined });
