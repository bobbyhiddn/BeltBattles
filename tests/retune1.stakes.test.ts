// RETUNE-1 run 2 step 5 (REQ-BFG-096; brief section 10): the stakes UI and the HUD with HEARTS on. On a hearts run (the
// run's own mark): the NEXT BATTLE panel and the fight intro show the hearts at stake ("-N" and the run bar's heart; the
// font's ♥ is HULL in the icon set) and say LAST CHANCE SAVES YOU when it would (hearts.ts heartsDusk, the game's own step);
// the dusk card says "-N HEARTS" (DayResult.heartsLost) beside 10 hearts; the run bars hold 10 hearts in two rows of 5
// (today's 5's width); the LAST CHANCE screen, the dusk card's LAST CHANCE line, the summary, the hero card, the warlord
// card, the road fork, PATCH UP and the title's rules card say HEART(S). With HEARTS off, and on a run without the mark,
// every string as before (pinned here). The switch is set through its setter and put back off after each test.
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { RUN_DAYS, START_LIVES } from "../src/sim/content";
import { HEARTS_START, heartCost, heartsLastChanceFires, setHearts, withHearts } from "../src/sim/hearts";
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D: LONG_RUN ships on; the 10-day card and run are read with it off
import { ENDLESS, withEndless } from "../src/sim/endless"; // BUMP-1E: ENDLESS ships on and adds one sentence to the long card's line 2; the card without it is read with endless off
import { LAST_CHANCE_AT } from "../src/sim/lastChance";
import { duskFoe, finishDay, lastChanceCardLine, REFUND_TEXT, refundCardLine, refundNotice } from "../src/game/day";
import { newRun, type Run } from "../src/game/run";
import type { Choice } from "../src/game/eventDefs";
import type { SideStats } from "../src/sim/battle";
import {
  drawStakesLine, duskStakes, heartsWord, lifeWord, livesLeft, livesOf, STAKES_SAVES, STAKES_SAVES_SHORT, stakesLineWidth, stakesText, stakesWidth,
} from "../src/ui/stakes";
import { drawHearts, lossLine } from "../src/screens/battleHud";
import { LC_LINE, LC_LINE_HEARTS, LC_STOP, LC_STOP_HEARTS, lcLayout, lcLine, lcStop } from "../src/screens/lastChancePicker";
import { HELP, HELP_ENDLESS, HELP_HEARTS_2, HELP_LONG_1, HELP_LONG_2, heartCostWords, helpLines } from "../src/screens/title";
import { outcomeText } from "../src/screens/event/event";
import { drawRunBar, newAnchors } from "../src/ui/runbar";
import { drawFoe } from "../src/screens/build/inspector";
import { buildLayout, buildScale, phoneScreen } from "../src/screens/build/layout";
import { battleScale } from "../src/game/battleLayout";
import { computeView } from "../src/core/io";
import { UI } from "../src/ui/ui";
import { heartIcon } from "../src/render/sprites";
import { shieldIcon } from "../src/render/eventArt";
import { makeCanvas, type G } from "../src/render/pixel";
import { cardBefore } from "./polish1.help.helpers"; // POLISH-1 (P4): the rules card as it was (the new sentences' switches off)
import { textWidth } from "../src/render/font";
import type { Game } from "../src/game/game";

installRaster();
afterEach(() => setHearts(false));

const S = {} as SideStats;
/** A fresh run with HEARTS on (its mark), and one started with the switch off (no mark, 5 lives). */
const heartsRunAt = (seed = 11): Run => withHearts(() => newRun("furnace", seed));
const livesRunAt = (seed = 11): Run => withHearts(() => newRun("furnace", seed), false);
const lose = (run: Run) => finishDay(run, 1, 30, S, S);

/** A G that records every drawImage (the image and where), drawing on into a raster. */
function recorder(W: number, H: number): { g: G; draws: { img: unknown; x: number; y: number }[] } {
  const [, g] = makeCanvas(W, H);
  const draws: { img: unknown; x: number; y: number }[] = [];
  const orig = g.drawImage.bind(g) as (...a: unknown[]) => void;
  (g as unknown as { drawImage: (...a: unknown[]) => void }).drawImage = (img: unknown, x: unknown, y: unknown, ...rest: unknown[]) => {
    draws.push({ img, x: x as number, y: y as number });
    orig(img, x, y, ...rest);
  };
  return { g, draws };
}
const isHeart = (img: unknown) => img === heartIcon(true) || img === heartIcon(false);

/** The phone (844x390 CSS @3, both ways up) and the desk (1920x1080). */
const VIEWS: [string, number, number, number][] = [["phone 844x390", 844, 390, 3], ["phone 390x844", 390, 844, 3], ["desk 1920x1080", 1920, 1080, 1]];

describe("RETUNE-1 run 2 stakes: HEARTS off (or a run without the mark), every string as before", () => {
  it("the dusk card, LAST CHANCE, the refund, the summary, the hero card, the road and PATCH UP read lives, as today", () => {
    const run = livesRunAt();
    expect(duskStakes(run)).toBeNull();
    const r = lose(run);
    expect(r.heartsLost).toBeUndefined();
    expect(lossLine(r)).toBe("-1 LIFE");
    expect(lastChanceCardLine({ lastChance: { lives: 1 } })).toBe("LAST CHANCE: +1 LIFE");
    expect(lastChanceCardLine(r)).toBeNull();
    expect(REFUND_TEXT).toBe("EARLY-LOSS REFUND: +1 LIFE");
    lose(run); // day 2: the refund at dawn 3
    expect(refundNotice(run)).toBe(REFUND_TEXT);
    expect([LC_LINE, LC_STOP, lcLine(run), lcStop(run)]).toEqual(["+1 LIFE. PICK ONE. FREE.", "+1 LIFE", LC_LINE, LC_STOP]);
    expect([livesLeft({ lives: 5 }), livesLeft({ lives: 1 }), livesOf({ lives: 4 }), lifeWord(run)]).toEqual(["5 LIVES LEFT", "1 LIFE LEFT", `4/${START_LIVES} LIVES`, "LIFE"]);
    // the hero card's label column (inspector.ts: the widest label + 6) is FEEDS's, as before, on a lives run
    expect(Math.max(...["HULL", "BELT", "FEEDS", "RUN", "LIVES"].map((k) => textWidth(k)))).toBe(textWidth("FEEDS"));
    const patch = { label: "PATCH UP", gain: [{ k: "lives", n: 1 }] } as unknown as Choice;
    expect(outcomeText(patch, true, 4)[0]).toBe("+1 LIFE");
  });

  it("with the switch on, a run without the mark (saved before the bump) still reads lives and shows no stakes", () => {
    const run = livesRunAt();
    setHearts(true);
    expect(duskStakes(run)).toBeNull();
    expect([lcLine(run), lcStop(run), lifeWord(run), livesLeft(run), livesOf(run)]).toEqual([LC_LINE, LC_STOP, "LIFE", "5 LIVES LEFT", "5/5 LIVES"]);
    expect(lossLine(lose(run))).toBe("-1 LIFE");
  });

  it("the title's rules card: HELP itself, line 2 word for word", () => {
    // BUMP-1D: HELP itself is the 10-day card (LONG_RUN ships on, and its card says WIN 10 DUSK FIGHTS on line 1), so it is read with the
    // long run off; with the long run on and HEARTS off, line 2 is this same 5-lives line and only line 1 is the long card's
    expect(withLongRun(() => cardBefore(() => helpLines()), false)).toBe(HELP); // POLISH-1 (P4): + the card as it was (cardBefore: GATES, ENCHANT and POISON's switch off)
    expect(HELP[1]).toBe("2  YOU HAVE 5 LIVES. A DUSK LOSS COSTS ONE, A DRAW NONE. LOSE ON DAY 1 OR 2 AND DAY 3'S DAWN GIVES ONE LIFE BACK (ONCE A RUN). YOUR SCORE IS YOUR W-L RECORD (10-0 IS FLAWLESS).");
    const long = cardBefore(() => helpLines()); // POLISH-1 (P4): the card as it was (cardBefore)
    expect(long[0]).toBe(HELP_LONG_1);
    expect(long.filter((_, i) => i !== 0)).toEqual(HELP.filter((_, i) => i !== 0));
  });
});

describe("RETUNE-1 run 2 stakes: a hearts run's words", () => {
  it("the stakes: heartCost(today), and LAST CHANCE exactly when hearts.ts's own trigger fires (every day, heart count and use)", () => {
    // BUMP-1D: a 10-day run (made with the long run off) has a last day, RUN_DAYS, and the trigger does not fire on it; a long run (the
    // shipped one) has none, so its trigger fires on any day (checked here through day 14). Each is held to hearts.ts's own trigger
    for (const long of [false, true]) {
      const run = withLongRun(() => heartsRunAt(), long);
      expect(run.longRun === true).toBe(long);
      const lastDay = long ? Infinity : RUN_DAYS;
      for (let day = 1; day <= (long ? RUN_DAYS + 4 : RUN_DAYS); day++) for (let lives = 1; lives <= HEARTS_START; lives++) for (const used of [false, true]) {
        run.day = day;
        run.lives = lives;
        run.lastChance = used ? ({ day: 1 } as Run["lastChance"]) : undefined;
        const s = duskStakes(run)!;
        expect(s.cost, `${long ? "long" : "10-day"} day ${day}`).toBe(heartCost(day));
        expect(s.saves, `${long ? "long" : "10-day"} day ${day} lives ${lives} used ${used}`).toBe(heartsLastChanceFires(day, "loss", Math.max(0, lives - heartCost(day)), used, lastDay));
      }
    }
    expect([stakesText({ cost: 2, saves: false }), STAKES_SAVES]).toEqual(["-2", "LAST CHANCE SAVES YOU"]);
  });

  it("the stakes shown before each dusk are what the loss then costs (finishDay): -1 HEART, -2 HEARTS, LAST CHANCE: 1 HEART", () => {
    const run = heartsRunAt();
    const seen: string[] = [];
    while (!run.over) {
      const s = duskStakes(run)!;
      const r = lose(run);
      expect(r.heartsLost).toBe(s.cost);
      expect(!!r.lastChance).toBe(s.saves);
      seen.push(`${lossLine(r)}${r.lastChance ? ` ${lastChanceCardLine(r)}` : ""}`);
    }
    // 10 hearts: 9 8 7 (days 1-3), 5 3 (days 4-5), day 6 leaves 1: LAST CHANCE, day 7 out
    // BUMP-1D: day 7's loss costs 2 (HEART_COSTS [1, 2, 2]), so the last entry reads "-2 HEARTS" (was "-3 HEARTS")
    expect(seen).toEqual(["-1 HEART", "-1 HEART", "-1 HEART", "-2 HEARTS", "-2 HEARTS", "-2 HEARTS LAST CHANCE: 1 HEART", "-2 HEARTS"]);
    // the old rule's third band, as the line formats it (a bench's rule may cost 3)
    expect([lossLine({ heartsLost: 3 }), stakesText({ cost: 3, saves: false })]).toEqual(["-3 HEARTS", "-3"]);
    expect(textWidth("LAST CHANCE: 1 HEART")).toBeLessThanOrEqual(textWidth("LAST CHANCE: +1 LIFE")); // the card's room
    expect(LAST_CHANCE_AT).toBe(1);
  });

  it("no refund text on a hearts run: two early losses, no refund at dawn 3", () => {
    const run = heartsRunAt();
    const rs = [lose(run), lose(run)];
    expect(run.day).toBe(3);
    expect(run.refund).toBeUndefined();
    expect(refundNotice(run)).toBeNull();
    expect(rs.map(refundCardLine)).toEqual([null, null]);
  });

  it("the LAST CHANCE screen, the summary, the hero card, the road and PATCH UP say HEART(S)", () => {
    const run = heartsRunAt();
    expect(lcLine(run)).toBe("SAVED ON 1 HEART. PICK ONE. FREE.");
    expect(lcLine(run)).toBe(LC_LINE_HEARTS);
    expect(lcStop(run)).toBe(LC_STOP_HEARTS);
    expect(textWidth(LC_STOP_HEARTS, "3")).toBeLessThanOrEqual(textWidth("SMUGGLER", "3")); // the summary's STOP column (lc1.ui)
    // the picker's title plate holds the line on every screen txtaz.picker pins (the phone's cards the narrowest)
    for (const [W, H] of [[640, 360], [480, 270], [234, 506], [292, 633], [844, 390]]) {
      expect(textWidth(LC_LINE_HEARTS, "5") + 2, `${W}x${H}`).toBeLessThanOrEqual(lcLayout(W, H, [44, 44, 44]).cardW - 6);
    }
    expect([livesLeft(run), livesLeft({ ...run, lives: 1 }), livesOf({ ...run, lives: 7 }), lifeWord(run), heartsWord(2)]).toEqual(["10 HEARTS LEFT", "1 HEART LEFT", "7/10 HEARTS", "HEART", "HEARTS"]);
    const patch = { label: "PATCH UP", gain: [{ k: "lives", n: 1 }] } as unknown as Choice;
    expect(outcomeText(patch, true, 4, true)[0]).toBe("+1 HEART");
  });

  it("the title's rules card with HEARTS on: line 2 is the hearts rule (no lives, no refund), no longer than today's", () => {
    setHearts(true);
    // BUMP-1D: the 10-day card (the long run off): line 2 is HELP_HEARTS_2, whose cost words are built from the constants with equal
    // neighbouring bands merged (title.ts heartCostWords): "1 ON DAYS 1-3 AND 2 FROM DAY 4" for HEART_COSTS [1, 2, 2] (was "1 ON DAYS 1-3, 2 ON
    // DAYS 4-6 AND 3 FROM DAY 7"); the old costs [1, 2, 3] still read that, as an explicit argument
    const lines = withLongRun(() => cardBefore(() => helpLines()), false); // POLISH-1 (P4): + cardBefore
    expect(lines[1]).toBe(HELP_HEARTS_2);
    expect(HELP_HEARTS_2).toBe("2  YOU HAVE 10 HEARTS. A DUSK LOSS COSTS 1 ON DAYS 1-3 AND 2 FROM DAY 4, A DRAW NONE. YOUR SCORE IS YOUR W-L RECORD (10-0 IS FLAWLESS).");
    expect(heartCostWords()).toBe("1 ON DAYS 1-3 AND 2 FROM DAY 4");
    expect(heartCostWords([1, 2, 3], [1, 4, 7])).toBe("1 ON DAYS 1-3, 2 ON DAYS 4-6 AND 3 FROM DAY 7");
    expect(`2  YOU HAVE ${HEARTS_START} HEARTS. A DUSK LOSS COSTS ${heartCostWords([1, 2, 3], [1, 4, 7])}, A DRAW NONE. YOUR SCORE IS YOUR W-L RECORD (10-0 IS FLAWLESS).`)
      .toBe("2  YOU HAVE 10 HEARTS. A DUSK LOSS COSTS 1 ON DAYS 1-3, 2 ON DAYS 4-6 AND 3 FROM DAY 7, A DRAW NONE. YOUR SCORE IS YOUR W-L RECORD (10-0 IS FLAWLESS).");
    expect(lines.filter((_, i) => i !== 1)).toEqual(HELP.filter((_, i) => i !== 1));
    expect(lines.join(" ")).not.toMatch(/\bLIFE\b|\bLIVES\b|REFUND/);
    expect(HELP_HEARTS_2.length).toBeLessThanOrEqual(HELP[1].length);
    // the long card (the shipped one): line 1 the long card's, line 2 the same hearts words, then how the run ends; nothing about lives or a refund
    // BUMP-1E: ENDLESS ships on (src/sim/endless.ts) and adds one sentence, HELP_ENDLESS, to the end of line 2 (title.ts helpLines; the only line
    // that moves: tests/bump1e.endlesshelp.test.ts), so the card as these lines pinned it is read with endless off (as tests/run1.screens.test.ts
    // reads it) and the shipped card, endless on, beside it
    const long = withEndless(() => cardBefore(() => helpLines()), false); // BUMP-1E: was helpLines(); POLISH-1 (P4): + cardBefore
    expect(long[0]).toBe(HELP_LONG_1);
    expect(long[1]).toBe(HELP_LONG_2);
    expect(HELP_LONG_2.startsWith(HELP_HEARTS_2.slice(0, HELP_HEARTS_2.indexOf("A DRAW NONE.") + "A DRAW NONE.".length))).toBe(true);
    expect(long.filter((_, i) => i > 1)).toEqual(HELP.filter((_, i) => i > 1));
    expect(long.join(" ")).not.toMatch(/\bLIFE\b|\bLIVES\b|REFUND/);
    // BUMP-1E: the shipped card (endless on): line 1 as above, line 2 HELP_LONG_2 and then the endless sentence, no other line differs, still no lives or refund
    expect(ENDLESS).toBe(true);
    const longOn = cardBefore(() => helpLines()); // POLISH-1 (P4): + the card as it was (cardBefore)
    expect(longOn[0]).toBe(HELP_LONG_1);
    expect(longOn[1]).toBe(`${HELP_LONG_2} ${HELP_ENDLESS}`); // BUMP-1E: was toBe(HELP_LONG_2)
    expect(longOn.filter((_, i) => i !== 1)).toEqual(long.filter((_, i) => i !== 1));
    expect(longOn.join(" ")).not.toMatch(/\bLIFE\b|\bLIVES\b|REFUND/);
  });
});

describe("RETUNE-1 run 2 stakes: the hearts fit (the phone 844x390 both ways up, the desk 1920x1080)", () => {
  it("drawHearts: by default 5 in a row (as before); a bar's 10 in two rows of 5 at today's width; the dusk card's 10 in a row", () => {
    const a = recorder(80, 20);
    expect(drawHearts(a.g, 2, 3, 3)).toBe(29);
    expect(a.draws.filter((d) => isHeart(d.img)).map((d) => [d.x, d.y, d.img === heartIcon(true)])).toEqual([0, 1, 2, 3, 4].map((i) => [2 + i * 6, 3, i < 3]));
    const b = recorder(80, 20);
    expect(drawHearts(b.g, 2, 1, 7, 0, -1, -1, 10, 5)).toBe(29);
    const hb = b.draws.filter((d) => isHeart(d.img));
    expect(hb.map((d) => [d.x, d.y])).toEqual([...Array(10).keys()].map((i) => [2 + (i % 5) * 6, 1 + Math.floor(i / 5) * 6]));
    expect(hb.filter((d) => d.img === heartIcon(true))).toHaveLength(7);
    const c = recorder(80, 20);
    expect(drawHearts(c.g, 2, 3, 10, 0, -1, -1, 10)).toBe(59);
  });

  it("the run bar (road events, the fork): a hearts run's 10 hearts in two rows inside the bar, the rest of the bar where it was", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const v = computeView(w, h, dpr);
      const bars = [livesRunAt(), heartsRunAt()].map((run) => {
        run.lives = run.hearts ? 7 : 4;
        const rec = recorder(v.W, 20);
        const game = { W: v.W, ui: new UI(), soundButton: () => {} } as unknown as Game;
        drawRunBar(rec.g, game, run, { gold: 0, lives: 0, hull: 0, belt: 0, cargo: 0 }, newAnchors(), () => {});
        return rec.draws;
      });
      const [lh, hh] = bars.map((d) => d.filter((q) => isHeart(q.img)));
      expect(lh.map((d) => d.y), name).toEqual([4, 4, 4, 4, 4]);
      expect(lh.filter((d) => d.img === heartIcon(true)), name).toHaveLength(4);
      const x0 = lh[0].x;
      expect(hh, name).toHaveLength(HEARTS_START);
      expect(hh.filter((d) => d.img === heartIcon(true)), name).toHaveLength(7);
      for (const d of hh) {
        expect(d.x >= x0 && d.x + 5 <= x0 + 29, name).toBe(true); // today's 5 hearts' width
        expect(d.y >= 1 && d.y + 5 <= 12, name).toBe(true); // inside the bar's ink (the navy line at 12)
      }
      expect(new Set(hh.map((d) => `${d.x},${d.y}`)).size, name).toBe(HEARTS_START); // no two on one spot
      // the next icon (the hull's shield) where it was: nothing after the hearts moved
      const sx = bars.map((d) => d.find((q) => q.img === shieldIcon())!.x);
      expect(sx[1], name).toBe(sx[0]);
      expect(Math.max(...hh.map((d) => d.x + 5)), name).toBeLessThan(sx[1]);
    }
  });

  it("the dusk card: 10 hearts and -3 HEARTS clear of the W-L record on the battle's screens", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const v = computeView(w, h, dpr, battleScale);
      const cw = Math.min(v.W - 10, 214);
      const lineEnd = 10 + HEARTS_START * 6 + 4 + textWidth("-3 HEARTS", "3"); // drawResult: hx = x + 10
      expect(lineEnd + 4, `${name} W ${v.W}`).toBeLessThanOrEqual(cw - 10 - textWidth("W-L 10-0", "3"));
    }
  });

  it("the NEXT BATTLE panel: the heart at stake inside the panel on a hearts run, none on a lives run; the fight intro's line fits", () => {
    let panels = 0;
    for (const [name, w, h, dpr] of VIEWS) {
      const v = computeView(w, h, dpr, buildScale);
      const isPh = phoneScreen(Math.floor(w * dpr), Math.floor(h * dpr), dpr);
      const L = buildLayout(v.W, v.H, v.portrait, 5, v.portrait && isPh, isPh ? Math.ceil(44 / (v.scale / v.dpr)) : 0);
      if (!L.foe) continue;
      panels++;
      const r = L.foe;
      for (const [lives, day] of [[10, 1], [3, 7]] as const) {
        const run = heartsRunAt();
        run.lives = lives;
        run.day = day;
        const s = duskStakes(run)!;
        expect(s.saves).toBe(day === 7);
        const rec = recorder(v.W, v.H);
        const said = drawFoe(rec.g, duskFoe(run, []), r, null, s);
        // run 3: the panel says LAST CHANCE when it would save the run: on the landscape panel (40 px; the phone at 844x390
        // and the desk), beside the class line or on a row of its own under it, inside the panel; never otherwise
        if (!s.saves) expect(said, name).toBeNull();
        else if (r.h >= 40) {
          expect(said, `${name} ${JSON.stringify(r)}`).not.toBeNull();
          expect([STAKES_SAVES, STAKES_SAVES_SHORT]).toContain(said!.words);
          const left = said!.right - textWidth(said!.words, "3");
          expect(left >= r.x + 5 && said!.right <= r.x + r.w - 5 && said!.y >= r.y + 2 && said!.y + 5 <= r.y + r.h - 2, `${name} ${JSON.stringify(r)} ${JSON.stringify(said)}`).toBe(true);
        }
        const hearts = rec.draws.filter((d) => isHeart(d.img));
        expect(hearts, `${name} ${r.w}x${r.h}`).toHaveLength(1);
        const [d] = hearts;
        expect(d.x >= r.x + 5 && d.x + 5 <= r.x + r.w - 5 && d.y >= r.y && d.y + 5 <= r.y + r.h, `${name} ${JSON.stringify(r)} ${d.x},${d.y}`).toBe(true);
        expect(d.x + 5 - stakesWidth(s) >= r.x + 5, name).toBe(true); // "-N" too: its left edge inside the panel
      }
      const plain = recorder(v.W, v.H);
      drawFoe(plain.g, duskFoe(livesRunAt(), []), r, null, duskStakes(livesRunAt()));
      expect(plain.draws.filter((d) => isHeart(d.img)), name).toHaveLength(0);
      // the fight intro (battle.ts): its line, LAST CHANCE SAVES YOU included, inside the battle's width, the heart drawn
      const bv = computeView(w, h, dpr, battleScale);
      const s = { cost: 3, saves: true };
      expect(stakesLineWidth(s), name).toBeLessThanOrEqual(bv.W - 4);
      const rec = recorder(bv.W, bv.H);
      const left = drawStakesLine(rec.g, s, bv.W / 2, 40);
      expect(left, name).toBeGreaterThanOrEqual(2);
      expect(rec.draws.filter((q) => isHeart(q.img)), name).toHaveLength(1);
    }
    expect(panels).toBeGreaterThan(0);
  });
});
