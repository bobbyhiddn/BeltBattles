// ENDLESS-1 3.5 (REQ-BFG-059; run 1 starts run 2's work): the words of an endless run's screens (src/screens/endlessText.ts), and the
// three places a long run says "WINS n/10" (the build bar, the title's CONTINUE line, the summary's foot line) saying ENDLESS n
// instead. "No /10 anywhere in endless." A run that is not in endless reads exactly as before.
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { barRun } from "../src/screens/build/chrome";
import { continueSub } from "../src/screens/title";
import { footLine, wonLine } from "../src/screens/summary";
import { livesOf } from "../src/ui/stakes";
import { dayText } from "../src/screens/runDay";
import { fightHead } from "../src/screens/battle";
import { C } from "../src/render/palette";
import { ENDLESS_LIVES } from "../src/sim/endless";
import {
  CONTINUE_ENDLESS, END_RUN, ENDLESS_COLOR, ENDLESS_END_WORDS, ENDLESS_OFFER_LINES, ENDLESS_OVER_TITLE, bestLine, endlessBar, endlessContinueSub, endlessFootTail, endlessOverLine, endlessScore,
} from "../src/screens/endlessText";

const mid = (): Run => {
  const run = newRun("furnace", 3, "text-run");
  run.endless = true;
  run.longRun = true;
  run.day = 15;
  run.wins = 10;
  run.losses = 2;
  run.lives = 2;
  run.endlessRun = { victoryDay: 13, wins: 4, losses: 1, draws: 0 };
  return run;
};

describe("ENDLESS-1 3.5: the words", () => {
  it("the HUD: ENDLESS 4 · DAY 15 in plum (plum5, the readable plum: plum4 reads 3.51:1 on the bar), 3 hearts", () => {
    expect(ENDLESS_COLOR).toBe(C.plum5);
    expect(endlessScore({ wins: 4 })).toBe("ENDLESS 4");
    expect(endlessBar({ day: 15, endlessRun: { wins: 4 } })).toEqual([[" · ENDLESS 4", C.plum5], [" · DAY 15", C.plum5]]);
    expect(livesOf(mid())).toBe("2/3 HEARTS"); // the hearts count, through livesCap
    expect(ENDLESS_LIVES).toBe(3);
  });

  it("the title's CONTINUE line for an endless save: ENDLESS 4 · DAY 15 · FURNACE", () => {
    expect(endlessContinueSub({ day: 15, hero: "furnace", endlessRun: { wins: 4 } })).toBe("ENDLESS 4 · DAY 15 · FURNACE");
  });

  it("the RUN WON offer: CONTINUE ENDLESS, END RUN and the three short lines", () => {
    expect(CONTINUE_ENDLESS).toBe("CONTINUE ENDLESS");
    expect(END_RUN).toBe("END RUN");
    expect(ENDLESS_OFFER_LINES).toEqual(["3 FRESH HEARTS", "A LOSS COSTS 1", "YOUR SCORE IS ENDLESS WINS"]);
  });

  it("ENDLESS OVER: the score, the hero and the victory day; the personal best; why it ended", () => {
    expect(ENDLESS_OVER_TITLE).toBe("ENDLESS OVER");
    expect(endlessOverLine({ hero: "furnace", endlessRun: { wins: 7, victoryDay: 13 } })).toBe("7 ENDLESS WINS · FURNACE · WON ON DAY 13");
    expect(endlessOverLine({ hero: "weaver", endlessRun: { wins: 1, victoryDay: 10 } })).toBe("1 ENDLESS WIN · WEAVER · WON ON DAY 10");
    expect(endlessOverLine({ hero: "bastion", endlessRun: { wins: 0, victoryDay: 21 } })).toBe("0 ENDLESS WINS · BASTION · WON ON DAY 21");
    expect(bestLine(9)).toBe("BEST 9");
    expect(Object.keys(ENDLESS_END_WORDS).sort()).toEqual(["cap", "hearts", "lastDay"]);
  });
});

describe("ENDLESS-1 3.5: the three '/10' places say ENDLESS n in endless, and read as before otherwise", () => {
  it("the build bar: barRun", () => {
    const run = mid();
    expect(barRun(run)).toEqual([[" · ENDLESS 4", C.plum5], [" · DAY 15", C.plum5]]);
    const long = { ...run, endlessRun: undefined };
    expect(barRun(long)).toEqual([[" · WINS 10/10", C.bone], [" · DAY 15", C.amber]]); // a long run, not in endless: as before
    expect(barRun({ day: 3, wins: 2, longRun: undefined, endlessRun: undefined })).toEqual([[" · DAY 3/10", C.bone]]); // a 10-day run: as before
    expect(barRun({ ...run, endlessRun: { ...run.endlessRun!, end: "hearts" } })).toEqual([[" · WINS 10/10", C.bone], [" · DAY 15", C.amber]]); // an ended endless is not playing it
  });

  it("the title's CONTINUE line: continueSub", () => {
    const run = mid();
    expect(continueSub(run)).toBe("ENDLESS 4 · DAY 15 · FURNACE");
    expect(continueSub({ ...run, endlessRun: undefined })).toBe("WINS 10/10 · DAY 15 · FURNACE · 10-2");
    expect(continueSub({ day: 3, wins: 2, losses: 1, hero: "weaver" })).toBe("DAY 3/10 · WEAVER · 2-1");
  });

  it("the summary's foot line: footLine (a run that played endless; an ended one too)", () => {
    const run = mid();
    expect(footLine({ ...run, lives: 0, endlessRun: { victoryDay: 13, wins: 7, losses: 3, draws: 0, end: "hearts" } })).toBe("0 HEARTS LEFT · ENDLESS 7");
    expect(footLine({ ...run, endlessRun: undefined, lives: 7 })).toBe("7 HEARTS LEFT · WINS 10/10");
    expect(endlessFootTail({ wins: 7 })).toBe(" · ENDLESS 7");
  });

  it("nothing an endless run's screens say carries a /10 (the bar, the line, the foot, the day, the fight banner, the hearts)", () => {
    const run = mid();
    const said = [
      ...barRun(run).map(([t]) => t), continueSub(run), footLine(run), dayText(run.day, true), fightHead(false, run.day, true), livesOf(run),
      endlessOverLine({ hero: run.hero, endlessRun: run.endlessRun! }), ...ENDLESS_OFFER_LINES,
    ].join(" | ");
    expect(said).not.toMatch(/\/10|\/N/);
    expect(wonLine({ ...run, endlessRun: undefined }).length).toBeGreaterThan(0); // (the RUN WON line is the run's own and stays)
  });
});
