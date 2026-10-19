// ENDLESS-1 3.5 (REQ-BFG-059; run 2): the endless screens' pixels, by their draw calls and layouts. The RUN WON card of a marked run
// offers CONTINUE ENDLESS (three short lines under it) and END RUN, which leads to the NEW RUN / TITLE card exactly as an unmarked
// run's; ENDLESS OVER says the score, the hero and the victory day, why it ended and the personal best; the card's rows mark the endless
// days; the NEXT BATTLE line says "-1" and never LAST CHANCE in endless. drawText is wrapped (every string a screen draws is recorded,
// with where and how wide), and the run summary is drawn on a recording canvas with a stand-in Game (tests/run1.screens.draw.test.ts's
// way). The pictures themselves are scripts/shots-endless.mjs's (W/output-endless1/shots).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { computeView } from "../src/core/io";
import { finishDay, startEndless } from "../src/game/day";
import { SAVE_KEY, loadRun, newRun, saveRun, type Run } from "../src/game/run";
import { loadProfile, PROFILE_KEY } from "../src/game/profile";
import { UI } from "../src/ui/ui";
import {
  OFFER_GAP, OFFER_LINES_H, SummaryScreen, foldRows, foldText, offerExtra, offerRects, summaryButtonH, summaryLayout, type HistoryRow, type SummaryView,
} from "../src/screens/summary";
import { duskStakes } from "../src/ui/stakes";
import { TitleScreen, continueSub } from "../src/screens/title";
import { heartCost, withHearts } from "../src/sim/hearts";
import { ENDLESS_LIVES, endlessOffered, withEndless } from "../src/sim/endless";
import { withLongRun } from "../src/sim/longRun";
import { C } from "../src/render/palette";
import { TAP_CSS, isPhone } from "../src/ui/tap";
import {
  CONTINUE_ENDLESS, END_RUN, ENDLESS_COLOR, ENDLESS_OFFER_LINES, ENDLESS_OVER_TITLE, endlessOverLines, newBestLine, wrapAtDots,
} from "../src/screens/endlessText";
import { textWidth } from "../src/render/font";
import type { Game, Screen } from "../src/game/game";
import type { G } from "../src/render/pixel";
import type { SideStats } from "../src/sim/battle";

interface Placed { s: string; x: number; y: number; w: number; colour: string; align: string }
const placed = vi.hoisted(() => [] as { s: string; x: number; y: number; w: number; colour: string; align: string }[]);
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  return {
    ...m,
    drawText: (...a: Parameters<typeof m.drawText>) => {
      const w = m.drawText(...a);
      const o = (a[5] ?? {}) as { align?: string };
      placed.push({ s: String(a[1]), x: Number(a[2]), y: Number(a[3]), w, colour: String(a[4]), align: o.align ?? "left" });
      return w;
    },
  };
});

// ---- a recording canvas (tests/run1.screens.draw.test.ts's) and a stand-in Game ------------------------------------------------------
interface RecCanvas { width: number; height: number; calls: string[]; getContext: () => G }
function recCanvas(): RecCanvas {
  const c: RecCanvas = { width: 0, height: 0, calls: [], getContext: () => g };
  const st: Record<string, unknown> = {
    canvas: c, fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1, imageSmoothingEnabled: false, lineWidth: 1,
    globalCompositeOperation: "source-over", font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", filter: "none",
  };
  const g = new Proxy(st, {
    get(t, k) {
      if (typeof k !== "string") return undefined;
      if (k in t) return t[k];
      if (k === "getImageData" || k === "createImageData") return (_x: number, _y: number, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
      if (k === "measureText") return () => ({ width: 0 });
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => ({ addColorStop() {} });
      return () => { c.calls.push(k); };
    },
    set(t, k, v) {
      if (typeof k === "string") t[k] = v;
      return true;
    },
  }) as unknown as G;
  return c;
}

/** The page's localStorage, as a map the tests read and write (the run's save, the profile). */
const store = new Map<string, string>();
let restoreDom: () => void = () => undefined;
beforeAll(() => {
  const doc = globalThis as { document?: unknown };
  const prev = doc.document;
  doc.document = { createElement: () => recCanvas() };
  restoreDom = () => { doc.document = prev; };
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
    key: () => null, length: 0, clear: () => store.clear(),
  });
});
afterAll(() => { restoreDom(); vi.unstubAllGlobals(); });
beforeEach(() => { placed.length = 0; store.clear(); });
afterEach(() => undefined);

/** The screens a stand-in game was sent to, in order. */
interface Fake { game: Game; went: Screen[] }
function fakeGame(run: Run, w = 402, h = 690, dpr = 3): Fake {
  const view = computeView(w, h, dpr);
  const audio = new Proxy({}, { get: () => () => undefined });
  const went: Screen[] = [];
  const game = {
    run, audio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: recCanvas(), toast() {}, go(s: Screen) { went.push(s); }, error() {}, soundButton() {},
    transitioning: false, resize() {},
  } as unknown as Game;
  return { game, went };
}

const S = {} as SideStats;
/** A run made with the long run, hearts and ENDLESS on (so it carries the endless mark), or without the mark. */
const runOf = (marked: boolean, seed = 11): Run => withHearts(() => withLongRun(() => withEndless(() => newRun("furnace", seed, `e1s-${seed}`), marked)));
function play(run: Run, seq: string): Run {
  for (const c of seq) {
    if (run.over) break;
    finishDay(run, c === "W" ? 0 : c === "L" ? 1 : -1, 30, S, S);
  }
  return run;
}
/** A run won on day 13 (3 losses, then 10 wins), marked or not. */
const won13 = (marked: boolean): Run => play(runOf(marked), "LLL" + "WWWWWWWWWW" + "WWW");
/** A run won on day 13 that went on into endless for 7 wins and 3 losses: ENDLESS OVER (out of hearts). */
function over13(): Run {
  const run = won13(true);
  expect(startEndless(run)).toBe(true);
  return play(run, "WWWWWWW" + "LLL");
}

const VIEWS: [string, number, number, number][] = [
  ["402x690 @3 (the operator's phone)", 402, 690, 3], ["360x640 @2", 360, 640, 2], ["390x844 @3", 390, 844, 3], ["844x390 @3 (landscape)", 844, 390, 3],
  ["1920x1080 @1 (the desk)", 1920, 1080, 1], ["1366x768 @1", 1366, 768, 1],
];

/** Draw the summary of `run` and return what it drew, and the screen. */
function drawn(run: Run, w = 402, h = 690, dpr = 3): { text: Placed[]; screen: SummaryScreen; fake: Fake } {
  const fake = fakeGame(run, w, h, dpr);
  const screen = new SummaryScreen(fake.game);
  screen.enter();
  placed.length = 0;
  frame(fake, screen);
  return { text: [...placed], screen, fake };
}
/** One frame as the game draws it: the UI's regions are built during the draw and committed at its end. */
function frame(fake: Fake, screen: SummaryScreen): void {
  fake.game.ui.begin();
  screen.draw(recCanvas().getContext());
  fake.game.ui.end();
}
const strings = (t: Placed[]): string[] => t.map((p) => p.s);
/** The left and right edge of one drawn string (the 3x5 and 5x7 faces share textAlign's meaning). */
const edges = (p: Placed): [number, number] => (p.align === "center" ? [p.x - p.w / 2, p.x + p.w / 2] : p.align === "right" ? [p.x - p.w, p.x] : [p.x, p.x + p.w]);

describe("ENDLESS-1 3.5: the RUN WON offer (a marked, won run)", () => {
  it("the run is marked, won and offered; the card draws RUN WON, CONTINUE ENDLESS, the three lines and END RUN, and no NEW RUN or TITLE", () => {
    const run = won13(true);
    expect(run.endless).toBe(true);
    expect(run.over).toBe("won");
    for (const [name, w, h, dpr] of VIEWS) {
      placed.length = 0;
      const { text, screen } = drawn(run, w, h, dpr);
      const t = strings(text);
      expect(screen.offered, name).toBe(true);
      for (const s of ["RUN WON", CONTINUE_ENDLESS, ...ENDLESS_OFFER_LINES, END_RUN, "FURNACE WON 10 OF 13 DUSKS, ON DAY 13"]) expect(t, `${name}: ${s}`).toContain(s);
      expect(t, name).not.toContain("NEW RUN");
      expect(t, name).not.toContain("TITLE");
      expect(t, name).not.toContain("ENDLESS OVER");
    }
  });

  it("its two buttons are the card's regions (endless, endrun) and no NEW RUN / TITLE region; at least 44 CSS px tall on a phone, 21 px on the desk", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const { fake } = drawn(won13(true), w, h, dpr);
      const ids = fake.game.ui.regions.map((r) => r.id);
      expect(ids, name).toContain("endless");
      expect(ids, name).toContain("endrun");
      expect(ids, name).not.toContain("again");
      expect(ids, name).not.toContain("title");
      const v = fake.game.view, k = v.scale / v.dpr, bh = summaryButtonH(v);
      for (const id of ["endless", "endrun"]) {
        const r = fake.game.ui.regions.find((q) => q.id === id)!.r;
        expect(r.h, `${name} ${id}`).toBeGreaterThanOrEqual(bh);
        if (isPhone(v)) expect(r.h * k, `${name} ${id}: a finger's target`).toBeGreaterThanOrEqual(TAP_CSS - 0.5);
        else expect(r.h, `${name} ${id}`).toBe(21);
      }
    }
  });

  it("every drawn string lies inside the card (no clipped text), on every view", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const { text, screen } = drawn(won13(true), w, h, dpr);
      const L = summaryLayout(screen["game"].view, screen.rows().length, 0, screen.noteLines().length, true);
      for (const p of text) {
        if (p.s.trim() === "" || p.y < L.card.y || p.y > L.card.y + L.card.h) continue; // the cruiser's and the effects' text is not the card's
        const [l, r] = edges(p);
        expect(l, `${name}: "${p.s}" left`).toBeGreaterThanOrEqual(L.card.x - 0.5);
        expect(r, `${name}: "${p.s}" right`).toBeLessThanOrEqual(L.card.x + L.card.w + 0.5);
      }
    }
  });

  it("the card fits the screen with the offer's room in it (the history folds first), and grows by exactly offerExtra when nothing folds", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const v = computeView(w, h, dpr) as SummaryView;
      for (const rows of [4, 12, 20]) {
        const a = summaryLayout(v, rows, 0), b = summaryLayout(v, rows, 0, 0, true);
        expect(summaryLayout(v, rows, 0, 0, false), `${name} ${rows}: off is as it was`).toEqual(a);
        expect(b.card.w).toBe(a.card.w);
        // the card grows by the offer's room, less the rows' shrink (rowH only ever gives room back, down to 6)
        expect(b.card.h, `${name} ${rows} rows`).toBeGreaterThanOrEqual(a.card.h);
        if (b.rowH === a.rowH) expect(b.card.h - a.card.h, `${name} ${rows} rows`).toBe(offerExtra(v));
      }
    }
  });

  it("the offer's pieces: CONTINUE ENDLESS above the three lines above END RUN (in NEW RUN / TITLE's slot), all inside the card, clear of each other", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const v = computeView(w, h, dpr) as SummaryView, bh = summaryButtonH(v);
      const L = summaryLayout(v, 8, 0, 0, true), o = offerRects(L.card, bh);
      expect(o.end.y + o.end.h + 6, `${name}: END RUN sits where NEW RUN / TITLE do`).toBe(L.card.y + L.card.h);
      expect(o.go.y + o.go.h + OFFER_GAP, name).toBe(o.linesY);
      expect(o.linesY + OFFER_LINES_H + OFFER_GAP, name).toBe(o.end.y);
      expect(o.go.x, name).toBeGreaterThanOrEqual(L.card.x);
      expect(o.go.x + o.go.w, name).toBeLessThanOrEqual(L.card.x + L.card.w);
      expect(o.go.w).toBe(L.card.w - 20);
      expect(o.end.w).toBe(L.card.w - 20);
      expect(o.go.h).toBe(bh);
      expect(o.end.h).toBe(bh);
    }
  });

  it("the offer clears the REPLAY strip (a phone with stored dusks) and the NEW STYLE lines above it, on every view", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const v = computeView(w, h, dpr) as SummaryView, bh = summaryButtonH(v);
      for (const rows of [4, 12, 20]) {
        for (const replays of [0, 1, 5, 10, 20]) {
          for (const notes of [0, 1, 2]) {
            const L = summaryLayout(v, rows, replays, notes, true), o = offerRects(L.card, bh);
            const ctx = `${name}: ${rows} rows, ${replays} replays, ${notes} notes`;
            if (L.strip) for (const r of L.strip) expect(r.y + r.h, `${ctx}: the strip ends above CONTINUE ENDLESS`).toBeLessThanOrEqual(o.go.y);
            // the NEW STYLE lines sit under the history's foot line: y + 58 + rows * rowH + 12 (summary.ts draw), two at most, NOTE_H apart
            const ny = L.card.y + 58 + Math.max(1, rows) * L.rowH + 12;
            if (!L.strip) expect(ny + notes * 8 - 3, `${ctx}: the notes end above CONTINUE ENDLESS`).toBeLessThanOrEqual(o.go.y);
            expect(o.go.y, ctx).toBeGreaterThanOrEqual(L.card.y + 48 + 8);
            expect(o.end.y + o.end.h, ctx).toBeLessThan(L.card.y + L.card.h);
          }
        }
      }
    }
  });

  it("CONTINUE ENDLESS: the same run goes on into endless (3 fresh hearts, the next dawn), is saved, and the build screen opens", () => {
    const run = won13(true);
    run.lives = 4; // the run had 4 hearts left: endless starts with ENDLESS_LIVES whatever it had
    const gold = run.gold, wins = run.wins, day = run.day;
    const { screen, fake } = drawn(run);
    expect(screen.continueEndless()).toBe(true);
    expect(run.over).toBeNull();
    expect(run.endlessRun).toEqual({ victoryDay: 13, wins: 0, losses: 0, draws: 0 });
    expect(run.lives).toBe(ENDLESS_LIVES);
    expect(run.wins).toBe(wins);
    expect(run.gold).toBe(gold);
    expect(run.day).toBe(day + 1);
    expect(fake.went).toHaveLength(1);
    expect(fake.went[0].constructor.name).toBe("BuildScreen");
    const saved = JSON.parse(store.get(SAVE_KEY) ?? "null") as Run | null;
    expect(saved, "the run in endless is saved").not.toBeNull();
    expect(saved!.endlessRun?.victoryDay).toBe(13);
    expect(saved!.over).toBeNull();
    // a second tap does nothing (the offer is gone with the state)
    expect(screen.continueEndless()).toBe(false);
    expect(fake.went).toHaveLength(1);
  });

  it("END RUN: the card becomes the as-today RUN WON with NEW RUN and TITLE: the very same strings, in the same places, as an unmarked run's", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const marked = drawn(won13(true), w, h, dpr);
      marked.screen.endRun();
      placed.length = 0;
      frame(marked.fake, marked.screen);
      const after = [...placed];
      const plain = drawn(won13(false), w, h, dpr);
      expect(plain.screen.offered, name).toBe(false);
      expect(after.map((p) => [p.s, p.x, p.y, p.colour]), name).toEqual(plain.text.map((p) => [p.s, p.x, p.y, p.colour]));
      expect(strings(after), name).toContain("NEW RUN");
      expect(strings(after), name).toContain("TITLE");
      expect(strings(after), name).not.toContain(CONTINUE_ENDLESS);
      const ids = marked.fake.game.ui.regions.map((r) => r.id);
      expect(ids, name).toContain("again");
      expect(ids, name).toContain("title");
      expect(marked.screen.continueEndless(), `${name}: declined`).toBe(false);
    }
  });

  it("an unmarked run's RUN WON is unchanged: no offer, NEW RUN and TITLE, whatever the switch says; Enter starts a new run", () => {
    for (const on of [false, true]) {
      const run = withEndless(() => won13(false), on);
      const { text, screen, fake } = drawn(run);
      expect(screen.offered).toBe(false);
      expect(screen.continueEndless()).toBe(false);
      expect(strings(text)).toContain("NEW RUN");
      expect(strings(text)).not.toContain(CONTINUE_ENDLESS);
      screen.key("Enter");
      expect(fake.went.map((s) => s.constructor.name)).toEqual(["HeroScreen"]);
    }
  });

  it("the keys: Enter and Space take CONTINUE ENDLESS, Escape is END RUN (then Enter is NEW RUN)", () => {
    const a = drawn(won13(true));
    a.screen.key(" ");
    expect(a.fake.went.map((s) => s.constructor.name)).toEqual(["BuildScreen"]);
    const b = drawn(won13(true));
    b.screen.key("Escape");
    expect(b.screen.offered).toBe(false);
    expect(b.fake.went).toHaveLength(0);
    b.screen.key("Enter");
    expect(b.fake.went.map((s) => s.constructor.name)).toEqual(["HeroScreen"]);
  });

  it("a lost run, a 10-day run and a run in endless are never offered", () => {
    const lost = withHearts(() => withLongRun(() => withEndless(() => newRun("furnace", 5, "lost-run"))));
    play(lost, "L".repeat(40));
    expect(lost.over).toBe("lost");
    expect(drawn(lost).screen.offered).toBe(false);
    const ten = withHearts(() => withLongRun(() => newRun("furnace", 6, "ten-run"), false));
    play(ten, "WWWWWWWWWW");
    expect(drawn(ten).screen.offered).toBe(false);
    const inEndless = won13(true);
    startEndless(inEndless);
    expect(inEndless.over).toBeNull();
    expect(new SummaryScreen(fakeGame(inEndless).game).offered).toBe(false);
  });
});

describe("ENDLESS-1 3.5: ENDLESS OVER", () => {
  it("draws the title in the endless colour, the score line the brief names, why it ended, BEST, NEW RUN and TITLE", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const run = over13();
      expect(run.over).toBe("won");
      expect(run.endlessRun).toMatchObject({ wins: 7, losses: 3, end: "hearts", victoryDay: 13 });
      const { text, screen } = drawn(run, w, h, dpr);
      expect(screen.endlessCard, name).toBe(true);
      expect(screen.offered, name).toBe(false);
      const t = strings(text).join("\n");
      expect(text.find((p) => p.s === ENDLESS_OVER_TITLE)?.colour, name).toBe(ENDLESS_COLOR);
      // the score line (whole, or broken at its dots on a card narrower than it: the pieces joined are the brief's line)
      const flat = strings(text).filter((s) => /ENDLESS WINS|FURNACE|WON ON DAY/.test(s)).join(" · ").replace(/ · · /g, " · ");
      expect(flat, name).toContain("7 ENDLESS WINS");
      expect(flat, name).toContain("FURNACE");
      expect(flat, name).toContain("WON ON DAY 13");
      expect(t, name).toContain("OUT OF HEARTS");
      expect(t, name).toContain("NEW BEST 7"); // a fresh profile: this run set it
      expect(t, name).toContain("NEW RUN");
      expect(t, name).toContain("TITLE");
      expect(t, name).not.toContain(CONTINUE_ENDLESS);
      expect(t, name).toContain("0 HEARTS LEFT · ENDLESS 7"); // the foot line
      expect(t, name).not.toContain("WINS 10/10");
      expect(t, name).not.toMatch(/\/10/); // no "/10" anywhere in endless
    }
  });

  it("the full line, when it fits, is exactly '7 ENDLESS WINS · FURNACE · WON ON DAY 13' on one line (the desk)", () => {
    const { text } = drawn(over13(), 1920, 1080, 1);
    expect(strings(text)).toContain("7 ENDLESS WINS · FURNACE · WON ON DAY 13");
  });

  it("every drawn string of the card lies inside it, on every view (no clipped text)", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const { text, screen } = drawn(over13(), w, h, dpr);
      const L = summaryLayout(screen["game"].view, screen.rows().length, 0, screen.noteLines().length, false);
      for (const p of text) {
        if (p.s.trim() === "" || p.y < L.card.y || p.y > L.card.y + L.card.h) continue;
        const [l, r] = edges(p);
        expect(l, `${name}: "${p.s}" left`).toBeGreaterThanOrEqual(L.card.x - 0.5);
        expect(r, `${name}: "${p.s}" right`).toBeLessThanOrEqual(L.card.x + L.card.w + 0.5);
      }
    }
  });

  it("BEST n: the profile's best (9) when this run falls short of it; NEW BEST n when it set the best; never lowered", () => {
    store.set(PROFILE_KEY, JSON.stringify({ v: 1, bestEndless: 9, bestEndlessRun: "s-old" }));
    const t = strings(drawn(over13()).text).join("\n");
    expect(t).toContain("BEST 9");
    expect(t).not.toContain("NEW BEST");
    expect(loadProfile().bestEndless).toBe(9); // 7 < 9: not lowered
    store.set(PROFILE_KEY, JSON.stringify({ v: 1, bestEndless: 7, bestEndlessRun: "s-old" }));
    const tie = strings(drawn(over13()).text).join("\n");
    expect(tie).toContain("BEST 7");
    expect(tie).not.toContain("NEW BEST"); // a tie keeps the earlier run's best
    store.clear();
    expect(strings(drawn(over13()).text).join("\n")).toContain("NEW BEST 7");
    expect(loadProfile().bestEndless).toBe(7);
  });

  it("the words for each way endless ends: out of hearts, a perfect endless, the last day", () => {
    const base = { hero: "furnace" as const, endlessRun: { wins: 30, victoryDay: 10 } };
    expect(endlessOverLines({ ...base, endlessRun: { ...base.endlessRun, end: "cap" } }, { best: 30, newBest: true })).toEqual({ score: "30 ENDLESS WINS · FURNACE · WON ON DAY 10", why: "A PERFECT ENDLESS", best: "NEW BEST 30" });
    expect(endlessOverLines({ ...base, endlessRun: { wins: 22, victoryDay: 25, end: "lastDay" } }, { best: 30, newBest: false })).toEqual({ score: "22 ENDLESS WINS · FURNACE · WON ON DAY 25", why: "THE LAST DAY", best: "BEST 30" });
    expect(endlessOverLines({ ...base, endlessRun: { wins: 0, victoryDay: 11, end: "hearts" } }, { best: 0, newBest: true })).toEqual({ score: "0 ENDLESS WINS · FURNACE · WON ON DAY 11", why: "OUT OF HEARTS", best: "BEST 0" }); // 0 sets nothing
    expect(newBestLine(5)).toBe("NEW BEST 5");
  });
});

describe("ENDLESS-1 3.5: the history rows mark the endless days", () => {
  it("rows of an endless dusk say so; the card's fold keeps the run's own W L D and counts endless wins apart", () => {
    const run = over13();
    const rows = drawn(run).screen.fights();
    const endlessRows = rows.filter((r) => r.endless);
    expect(endlessRows.every((r) => r.day >= 14 && r.day <= 23)).toBe(true); // the days after the victory day (13)
    expect(endlessRows.filter((r) => r.at !== undefined)).toHaveLength(10); // 7 wins and 3 losses
    expect(endlessRows.filter((r) => r.at !== undefined && r.outcome === "win")).toHaveLength(7);
    expect(rows.filter((r) => !r.endless).every((r) => r.day <= 13)).toBe(true);
    const mk = (day: number, outcome: HistoryRow["outcome"], endless: boolean, dusk = true): HistoryRow => ({
      day, stop: "DUSK", stopColor: C.slate4, foe: "X", foeColor: C.bone, outcome, time: 10, ...(dusk ? { at: day } : {}), ...(endless ? { endless: true } : {}),
    });
    const list = [mk(1, "win", false), mk(1, "loss", false, false), mk(2, "loss", false), mk(3, "win", false), mk(4, "win", true), mk(5, "win", true), mk(6, "loss", true), mk(7, "win", true)];
    const folded = foldRows(list, 2);
    expect(folded[0].fold).toEqual({ from: 1, to: 6, w: 2, l: 1, d: 0, e: 2 }); // the run's 2 W and 1 L (a warlord row is no dusk); endless wins 2
    expect(foldText(folded[0].fold!)).toBe("DAYS 1-6 · 2 W · 1 L · ENDLESS 2");
    // a fold with no endless days reads as before
    expect(foldText({ from: 1, to: 8, w: 6, l: 2, d: 0 })).toBe("DAYS 1-8 · 6 W · 2 L");
    expect(foldRows(list.slice(0, 4), 2)[0].fold).not.toHaveProperty("e");
  });

  it("an endless day's number is drawn in the endless colour; the run's days keep theirs", () => {
    const { text } = drawn(over13(), 1920, 1080, 1);
    const day = (d: string) => text.filter((p) => p.s === d && p.align === "right").map((p) => p.colour);
    expect(day("20").every((c) => c === ENDLESS_COLOR) && day("20").length > 0).toBe(true);
    expect(day("12").every((c) => c === C.amber) && day("12").length > 0).toBe(true); // day 11+ of the long road, as before
  });
});

describe("ENDLESS-1 3.5: wrapAtDots (the score line on a narrow card)", () => {
  const line = "7 ENDLESS WINS · FURNACE · WON ON DAY 13";
  it("one line when it fits; else broken at its dots, each line no wider than the room, the pieces joined giving the line back", () => {
    const w = textWidth(line, "3");
    expect(wrapAtDots(line, w)).toEqual([line]);
    expect(wrapAtDots(line, w + 50)).toEqual([line]);
    for (let room = w - 1; room >= 70; room -= 6) {
      const out = wrapAtDots(line, room);
      expect(out.length, `room ${room}`).toBeGreaterThan(1);
      for (const ln of out) expect(textWidth(ln, "3"), `room ${room}: "${ln}"`).toBeLessThanOrEqual(room);
      expect(out.join(" · "), `room ${room}`).toBe(line);
    }
    expect(wrapAtDots(line, textWidth("7 ENDLESS WINS · FURNACE", "3"))).toEqual(["7 ENDLESS WINS · FURNACE", "WON ON DAY 13"]);
    // a piece wider than the room stays whole (the caller's fit trims it)
    expect(wrapAtDots("A VERY LONG PIECE · B", 10)).toEqual(["A VERY LONG PIECE", "B"]);
  });
});

describe("ENDLESS-1 3.5: the NEXT BATTLE line in endless (stakes.ts)", () => {
  const hearts = (): Run => withHearts(() => withLongRun(() => withEndless(() => newRun("furnace", 21, "stakes-run"))));
  it("a loss costs 1 heart on every day and LAST CHANCE never saves: '-1', never LAST CHANCE SAVES YOU", () => {
    const run = won13(true);
    startEndless(run);
    for (const day of [14, 15, 17, 25, 40, 64]) {
      for (const lives of [3, 2, 1]) {
        const s = duskStakes({ ...run, day, lives });
        expect(s, `day ${day}, ${lives} hearts`).toEqual({ cost: 1, saves: false });
      }
    }
  });
  it("a run that is not in endless keeps its ladder and its LAST CHANCE line exactly as before", () => {
    const run = hearts();
    for (const day of [1, 3, 4, 7, 12]) {
      const s = duskStakes({ ...run, day, lives: 10 });
      expect(s?.cost, `day ${day}`).toBe(heartCost(day));
      expect(s?.saves, `day ${day}`).toBe(false);
    }
    expect(duskStakes({ ...run, day: 12, lives: 3 })?.saves).toBe(true); // 3 hearts, a 2-heart loss leaves 1: LAST CHANCE would save the run
    const ended = won13(true);
    startEndless(ended);
    ended.endlessRun = { ...ended.endlessRun!, end: "hearts" };
    expect(duskStakes({ ...ended, day: 14, lives: 10 })?.cost, "an ended endless is not playing it").toBe(heartCost(14));
  });
});

describe("ENDLESS-1 3.2: a reload on the RUN WON screen keeps the offer (a marked, won, undecided run stays saved)", () => {
  it("saveRun keeps a marked won run that has not chosen; it comes back offered. Every other finished run is dropped, as ever", () => {
    saveRun(won13(true));
    expect(store.has(SAVE_KEY)).toBe(true);
    const back = loadRun()!;
    expect(back.over).toBe("won");
    expect(back.endless).toBe(true);
    expect(back.endlessRun).toBeUndefined();
    expect(endlessOffered(back)).toBe(true);
    expect([back.wins, back.day]).toEqual([10, 13]);
    // dropped: an unmarked won run (ENDLESS off), a lost run, a 10-day run's complete, a run whose endless ended, and null
    const lost = withHearts(() => withLongRun(() => withEndless(() => newRun("furnace", 5, "lost-run"))));
    play(lost, "L".repeat(40));
    const ten = withHearts(() => withLongRun(() => newRun("furnace", 6, "ten-run"), false));
    play(ten, "WWWWWWWWWW");
    for (const [name, run] of [["unmarked won", won13(false)], ["lost", lost], ["10-day complete", ten], ["endless over", over13()]] as [string, Run][]) {
      expect(run.over, name).not.toBeNull();
      saveRun(won13(true));
      saveRun(run);
      expect(store.has(SAVE_KEY), name).toBe(false);
    }
    saveRun(won13(true));
    saveRun(null);
    expect(store.has(SAVE_KEY)).toBe(false);
    // a run in progress is saved as ever (and a run in endless: the state comes back)
    const going = won13(true);
    startEndless(going);
    saveRun(going);
    expect(loadRun()!.endlessRun).toEqual({ victoryDay: 13, wins: 0, losses: 0, draws: 0 });
  });

  it("the RUN WON card keeps the run saved while the offer is open; END RUN clears it; CONTINUE ENDLESS saves the run in endless; an unmarked run's card saves nothing", () => {
    const a = drawn(won13(true));
    expect(store.has(SAVE_KEY), "the card is up: the won run is saved").toBe(true);
    a.screen.endRun();
    expect(store.has(SAVE_KEY), "END RUN: gone").toBe(false);
    const b = drawn(won13(true));
    expect(store.has(SAVE_KEY)).toBe(true);
    b.screen.continueEndless();
    const saved = loadRun()!;
    expect(saved.over).toBeNull();
    expect(saved.endlessRun?.victoryDay).toBe(13);
    expect(saved.lives).toBe(ENDLESS_LIVES);
    store.clear();
    drawn(won13(false));
    expect(store.has(SAVE_KEY), "an unmarked run's RUN WON saves nothing (as before)").toBe(false);
    store.clear();
    drawn(over13());
    expect(store.has(SAVE_KEY), "ENDLESS OVER saves nothing").toBe(false);
  });

  it("the title: CONTINUE reads RUN WON · DAY 13 · FURNACE and opens the RUN WON card again with its offer; a run in endless still continues into the build", () => {
    const title = (): { s: TitleScreen; went: Screen[] } => {
      const fake = fakeGame(won13(true));
      (fake.game as unknown as { openName(): void }).openName = () => undefined;
      return { s: new TitleScreen(fake.game), went: fake.went };
    };
    saveRun(won13(true));
    expect(continueSub(loadRun()!)).toBe("RUN WON · DAY 13 · FURNACE");
    const a = title();
    a.s["continueRun"]();
    expect(a.went).toHaveLength(1);
    expect(a.went[0]).toBeInstanceOf(SummaryScreen);
    expect((a.went[0] as SummaryScreen).offered).toBe(true);
    // a run in endless continues as it did (run 1): the line says ENDLESS, and CONTINUE goes to the build screen
    const going = won13(true);
    startEndless(going);
    saveRun(going);
    expect(continueSub(loadRun()!)).toBe("ENDLESS 0 · DAY 14 · FURNACE");
    const b = title();
    b.s["continueRun"]();
    expect(b.went).toHaveLength(1);
    expect(b.went[0]).not.toBeInstanceOf(SummaryScreen);
    expect(b.went[0].constructor.name).toBe("BuildScreen");
    // the line of every other save is as before
    expect(continueSub({ day: 13, wins: 10, losses: 3, hero: "furnace", longRun: true })).toBe("WINS 10/10 · DAY 13 · FURNACE · 10-3");
    expect(continueSub({ day: 4, wins: 2, losses: 1, hero: "weaver" })).toBe("DAY 4/10 · WEAVER · 2-1");
  });
});
