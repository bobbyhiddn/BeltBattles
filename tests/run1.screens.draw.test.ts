// RUN-1 T4 (REQ-BFG-059, REQ-BFG-116; D7): the screens' DRAW calls say the words tests/run1.screens.test.ts pins. drawText is wrapped
// (every string a screen draws is recorded, then drawn as before), and the fork and the run summary are drawn on a recording canvas
// with a stand-in Game (replay1b.test.ts's way): a long run (Run.longRun) draws RUN WON / THE ROAD · DAY 12 and the rest of the new
// words, a run without the mark draws the live ones, whatever the switch says. (The build bar, the banners and the title are pinned
// by their pure builders in run1.screens.test.ts and by the shots: their screens need a whole Game.)
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { computeView } from "../src/core/io";
import { finishDay } from "../src/game/day";
import { newRun, type Run } from "../src/game/run";
import { UI } from "../src/ui/ui";
import { SummaryScreen } from "../src/screens/summary";
import { ForkScreen } from "../src/screens/fork/fork";
import { BattleScreen } from "../src/screens/battle";
import { ReplayScreen } from "../src/screens/replay";
import { TitleScreen } from "../src/screens/title";
import { titleScale } from "../src/screens/titleLayout";
import { drawTopBar } from "../src/screens/build/chrome";
import { buildLayout, buildScale, phoneScreen } from "../src/screens/build/layout";
import type { BuildScreen } from "../src/screens/build/build";
import { RuneBar } from "../src/ui/runeBar";
import { TAP_CSS } from "../src/ui/tap";
import { OFFERS } from "../src/sim/content";
import { C } from "../src/render/palette";
import { battleGrid, battleScale } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { setupRun } from "../src/tooling";
import { setLongRun, withLongRun } from "../src/sim/longRun";
import { withHearts } from "../src/sim/hearts";
import { ENDLESS, withEndless } from "../src/sim/endless"; // BUMP-1E: ENDLESS ships on: a marked run's RUN WON card is the offer; the old card is read with it off
import { RIVAL_IDS } from "../src/sim/rivals";
import type { Game, Screen } from "../src/game/game";
import type { G } from "../src/render/pixel";
import type { SideStats } from "../src/sim/battle";

/** Every string drawText was asked to draw, in order, and where (x, the width it returned, its colour): hoisted, since the mock
 *  factory runs before the imports. */
const drawn = vi.hoisted(() => [] as string[]);
const placed = vi.hoisted(() => [] as { s: string; x: number; w: number; colour: string }[]);
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  return {
    ...m,
    drawText: (...a: Parameters<typeof m.drawText>) => {
      const w = m.drawText(...a);
      drawn.push(String(a[1]));
      placed.push({ s: String(a[1]), x: Number(a[2]), w, colour: String(a[4]) });
      return w;
    },
  };
});

// ------------------------------------------------------------ a recording canvas (replay1b.test.ts's, text-free: calls only)
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

let restoreDom: () => void = () => undefined;
beforeAll(() => {
  const doc = globalThis as { document?: unknown };
  const prev = doc.document;
  doc.document = { createElement: () => recCanvas() };
  restoreDom = () => { doc.document = prev; };
  vi.stubGlobal("localStorage", { getItem: (k: string) => (k === "beltbattles.run.v7" ? saved : null), setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0, clear: () => undefined });
});
/** The saved run the title's CONTINUE reads (the game's own save key holds the run's JSON); null: no save. */
let saved: string | null = null;
afterAll(() => { restoreDom(); vi.unstubAllGlobals(); });
beforeEach(() => { drawn.length = 0; placed.length = 0; saved = null; });
afterEach(() => setLongRun(false));

/** A stand-in Game: the run, an audio that does nothing, a view (402x690 @3 by default), a real UI, a recording canvas. */
function fakeGame(run: Run, w = 402, h = 690, dpr = 3): Game {
  const view = computeView(w, h, dpr);
  const audio = new Proxy({}, { get: () => () => undefined });
  const game = { run, audio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: recCanvas(), toast() {}, go() {}, error() {}, soundButton() {}, transitioning: false } as unknown as Game;
  return game;
}

const S = {} as SideStats;
const runOf = (long: boolean, seed = 11): Run => withHearts(() => withLongRun(() => newRun("furnace", seed, `run1d-${seed}`), long));
function play(run: Run, seq: string): Run {
  for (const c of seq) {
    if (run.over) break;
    finishDay(run, c === "W" ? 0 : c === "L" ? 1 : -1, 30, S, S);
  }
  return run;
}
const drawSummary = (run: Run, w = 402, h = 690, dpr = 3): string[] => {
  const s = new SummaryScreen(fakeGame(run, w, h, dpr));
  drawn.length = 0;
  s.draw(recCanvas().getContext());
  return [...drawn];
};

describe("RUN-1 T4: the run summary's draw", () => {
  it("a long run won on day 13 draws RUN WON, the dusks line, 4 hearts and the foot line; the days past 10 are in the rows", () => {
    const run = play(runOf(true), "LLL" + "WWWWWWWWWW" + "WWW");
    expect(run.over).toBe("won");
    const t = drawSummary(run);
    expect(t).toContain("RUN WON");
    expect(t).toContain("FURNACE WON 10 OF 13 DUSKS, ON DAY 13");
    expect(t).not.toContain("RUN COMPLETE");
    expect(t.join("|")).not.toMatch(/DAYS SURVIVED/);
    expect(t).toContain("7 HEARTS LEFT · WINS 10/10");
    for (const d of ["11", "12", "13"]) expect(t, `the history's day ${d}`).toContain(d);
    // BUMP-1E: ENDLESS ships on (bb-0.12.0; sim/endless.ts), so this run carries the endless mark and its RUN WON card is the OFFER (summary.ts draw, ENDLESS-1):
    // CONTINUE ENDLESS and END RUN take the foot where NEW RUN was (was expect(t).toContain("NEW RUN")); NEW RUN and TITLE are what END RUN leads to
    expect(ENDLESS).toBe(true);
    expect(run.endless).toBe(true);
    expect(t).toContain("CONTINUE ENDLESS");
    expect(t).toContain("END RUN");
    expect(t).not.toContain("NEW RUN");
    const declined = new SummaryScreen(fakeGame(run));
    declined.endRun(); // the card as a won run's always was: the same words, then NEW RUN and TITLE at the foot
    drawn.length = 0;
    declined.draw(recCanvas().getContext());
    const after = [...drawn];
    for (const w of ["RUN WON", "FURNACE WON 10 OF 13 DUSKS, ON DAY 13", "7 HEARTS LEFT · WINS 10/10", "NEW RUN", "TITLE"]) expect(after, `after END RUN: ${w}`).toContain(w);
    expect(after).not.toContain("CONTINUE ENDLESS");
    // the 0.9.x world, read with endless off (a run made then carries no mark): the old assertions, NEW RUN at once and no offer
    const plain = play(withEndless(() => runOf(true), false), "LLL" + "WWWWWWWWWW" + "WWW");
    expect(plain.over).toBe("won");
    expect(plain.endless).toBeUndefined();
    const u = drawSummary(plain);
    for (const w of ["RUN WON", "FURNACE WON 10 OF 13 DUSKS, ON DAY 13", "7 HEARTS LEFT · WINS 10/10", "NEW RUN", "TITLE"]) expect(u, `no endless mark: ${w}`).toContain(w);
    expect(u.join("|")).not.toMatch(/ENDLESS|END RUN/);
  });

  it("a long run lost on day 12 draws RUN LOST, THE DARK WIND CATCHES YOU and ON DAY 12 · FURNACE · W-L 5-7", () => {
    const run = play(runOf(true), "LLLLLL" + "WWWWW" + "L" + "WWW");
    expect(run.over).toBe("lost");
    const t = drawSummary(run);
    expect(t).toContain("RUN LOST");
    expect(t).toContain("THE DARK WIND CATCHES YOU");
    expect(t).toContain("ON DAY 12 · FURNACE · W-L 5-7");
    expect(t).not.toContain("RUN WON");
  });

  it("a 10-day run draws the live words (RUN COMPLETE, 10 DAYS SURVIVED), with the switch off and with it on", () => {
    const ten = play(runOf(false), "WLWWLWWWLW");
    expect(ten.over).toBe("complete");
    for (const on of [false, true]) {
      const t = withLongRun(() => drawSummary(ten), on);
      expect(t, `switch ${on}`).toContain("RUN COMPLETE");
      expect(t, `switch ${on}`).toContain("FURNACE · 10 DAYS SURVIVED · W-L 7-3");
      expect(t.join("|"), `switch ${on}`).not.toMatch(/RUN WON|WON \d+ OF/);
    }
    const lost = play(runOf(false), "LLLLLLLLLL");
    expect(withLongRun(() => drawSummary(lost), true)).toContain("RUN LOST");
  });

  it("a long run too deep for the screen draws its folded row; a 10-day run's rows are never folded", () => {
    const deep = play(runOf(true), "D".repeat(16) + "W".repeat(9));
    for (let d = 1; d <= 25; d++) deep.warlords.push({ day: d, tier: "easy", id: RIVAL_IDS[0], name: "WARLORD", outcome: "win", time: 20, gold: 0, part: null });
    const t = drawSummary(deep);
    expect(t.filter((s) => /^DAYS \d+-\d+ · \d+ W · \d+ L/.test(s)).length).toBe(1);
    const ten = Object.assign(runOf(false), { history: deep.history, warlords: deep.warlords, over: "lost" as const });
    expect(drawSummary(ten).some((s) => s.startsWith("DAYS "))).toBe(false);
  });
});

/** A stand-in Game for the battle and the replay: the view with the battle's own grid (replay1b.test.ts's fakeGame). */
function battleGame(run: Run, w = 402, h = 690, dpr = 3): Game {
  const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const gr = battleGrid(pw, ph, p); return gr.close === scale ? gr.sub : 1; };
  const view = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const audio = new Proxy({}, { get: () => () => undefined });
  return { run, audio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: recCanvas(), toast() {}, go() {}, error() {}, transitioning: false } as unknown as Game;
}

describe("RUN-1 T4: the fight intro's and the replay's banners (the screens read the run on the game, not the switch)", () => {
  for (const long of [true, false]) {
    it(`${long ? "a long run on day 12" : "a 10-day run on day 3"}: DUSK · DAY ${long ? "12" : "3/10"} over the intro, REPLAY · DAY ${long ? "12" : "3/10"} over its replay`, () => {
      const day = long ? 12 : 3;
      // made with the switch on or off, drawn with it off: the mark on the run says which words
      const run = withHearts(() => withLongRun(() => setupRun({ hero: "furnace", day, seed: 7, wins: 3 }), long));
      expect(run.longRun === true).toBe(long);
      const game = battleGame(run), s = new BattleScreen(game);
      for (let i = 0; i < 40; i++) s.update(1 / 60);
      expect(s.phase).toBe("intro");
      drawn.length = 0;
      s.draw(recCanvas().getContext());
      expect(drawn).toContain(`DUSK · DAY ${long ? "12" : "3/10"}`);
      expect(drawn.join("|")).not.toContain(long ? "DAY 12/10" : "DAY 3|");
      // the replay of that dusk's fight (REPLAY-1's: a stand-in Screen to go back to)
      const rp = new ReplayScreen(game, {} as unknown as Screen, s.arena.b, { day, foe: "FOE" });
      for (let i = 0; i < 30; i++) rp.update(1 / 60);
      drawn.length = 0;
      rp.draw(recCanvas().getContext());
      expect(drawn).toContain(`REPLAY · DAY ${long ? "12" : "3/10"}`);
      expect(drawn).not.toContain(long ? "REPLAY · DAY 12/10" : "REPLAY · DAY 3");
    });
  }
});

/** The build screen's top bar drawn (chrome.ts drawTopBar) with a stand-in screen holding only what the bar reads: the run, the
 *  layout the game computes for the view, an empty rune bar. Returns what it drew, with each piece's place. */
function drawBar(run: Run, w: number, h: number, dpr: number): { view: ReturnType<typeof computeView>; pieces: typeof placed; L: ReturnType<typeof buildLayout> } {
  const view = computeView(w, h, dpr, (pw, ph, p, d) => buildScale(pw, ph, p, d ?? dpr));
  const phone = phoneScreen(Math.floor(w * dpr), Math.floor(h * dpr), dpr);
  const tap = phone ? Math.ceil(TAP_CSS / (view.scale / dpr)) : 0;
  const L = buildLayout(view.W, view.H, view.portrait, OFFERS, phone, tap);
  const game = { W: view.W, H: view.H, view, ui: new UI(), soundButton() {} } as unknown as Game;
  const s = { game, run, L, coinX: 0, cornerMenu: null, menu: false, runeBar: new RuneBar(), panelArea: () => L.info } as unknown as BuildScreen;
  placed.length = 0;
  drawTopBar(recCanvas().getContext(), s);
  return { view, pieces: [...placed], L };
}

describe("RUN-1 T4: the build bar's draw (chrome.ts drawTopBar)", () => {
  const at = (long: boolean, day: number, wins: number, gold = 64): Run => Object.assign(runOf(long), { day, wins, gold, lives: 4 });

  it("a long run on day 12: DAWN · WINS 3/10 · DAY 12, the day amber, then the gold; a 10-day run: DAWN · DAY 3/10, as live", () => {
    const { pieces } = drawBar(at(true, 12, 3), 402, 690, 3);
    const head = pieces.slice(0, 3);
    expect(head.map((p) => p.s)).toEqual(["DAWN", " · WINS 3/10", " · DAY 12"]);
    expect(head.map((p) => p.colour)).toEqual([C.amber, C.bone, C.amber]);
    expect(pieces.find((p) => p.s === "64"), "the gold follows the status").toBeTruthy();
    const ten = drawBar(at(false, 3, 1), 402, 690, 3).pieces;
    expect(ten.slice(0, 2).map((p) => p.s)).toEqual(["DAWN", " · DAY 3/10"]);
    expect(ten.slice(0, 2).map((p) => p.colour)).toEqual([C.amber, C.bone]);
    expect(ten.map((p) => p.s).join("|")).not.toMatch(/WINS/);
  });

  it("the status line (stage, WINS, DAY, gold, the hearts) ends inside the screen on every phone the build screen frames, for the widest long-run content", () => {
    // day 25 (the deepest an upload may state), 9 wins, 3-digit gold; REFIT is a letter longer than DAWN
    const run = Object.assign(at(true, 25, 9, 300), { lives: 3 });
    for (const [name, w, h, dpr] of [["402x690 @3", 402, 690, 3], ["310x640 @3 (W 186)", 310, 640, 3], ["320x568 @2", 320, 568, 2], ["360x640 @2", 360, 640, 2], ["390x844 @3", 390, 844, 3], ["844x390 @3", 844, 390, 3]] as const) {
      const { view, pieces } = drawBar(run, w, h, dpr);
      const gold = pieces.find((p) => p.s === "300");
      expect(gold, name).toBeTruthy();
      // the hearts are two rows of five (6 px each) after the gold and 5 px; they must end before the screen's last column
      expect(gold!.x + gold!.w + 5 + 30, `${name}: the hearts end at ${gold!.x + gold!.w + 35} of ${view.W}`).toBeLessThanOrEqual(view.W - 1);
      expect(pieces.slice(0, 3).map((p) => p.s), name).toEqual(["DAWN", " · WINS 9/10", " · DAY 25"]);
    }
  });

  it("the bar reads the run's mark, not the switch (an old run keeps DAY n/10 while the switch is on)", () => {
    const old = at(false, 6, 3);
    const t = withLongRun(() => drawBar(old, 402, 690, 3).pieces.map((p) => p.s));
    expect(t.slice(0, 2)).toEqual(["DAWN", " · DAY 6/10"]);
  });
});

/** The title drawn on a 402x690 @3 phone: the saved run (the CONTINUE button's line) and HOW TO PLAY open or shut; every string drawn. */
function drawTitle(save: Run | null, help: boolean, w = 402, h = 690, dpr = 3): string[] {
  saved = save ? JSON.stringify(save) : null;
  const view = computeView(w, h, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
  const audio = new Proxy({}, { get: () => () => undefined });
  const game = { run: null, audio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: recCanvas(), toast() {}, go() {}, error() {}, soundButton() {}, openName() {}, transitioning: false } as unknown as Game;
  const s = new TitleScreen(game);
  s.pickScale(Math.floor(w * dpr), Math.floor(h * dpr), view.portrait);
  s.help = help;
  for (let i = 0; i < 3; i++) s.update(1 / 60);
  drawn.length = 0;
  s.draw(recCanvas().getContext());
  return [...drawn];
}

describe("RUN-1 T4: the title's draw (the CONTINUE line, HOW TO PLAY)", () => {
  it("a long run's save draws CONTINUE with WINS 3/10 · DAY 12 · FURNACE · 3-6, whatever the switch; an old save draws DAY 6/10 · FURNACE · 3-2", () => {
    const long = Object.assign(runOf(true), { day: 12, wins: 3, losses: 6 });
    const old = Object.assign(runOf(false), { day: 6, wins: 3, losses: 2 });
    for (const on of [false, true]) {
      const a = withLongRun(() => drawTitle(long, false), on), b = withLongRun(() => drawTitle(old, false), on);
      expect(a, `switch ${on}`).toContain("WINS 3/10 · DAY 12 · FURNACE · 3-6");
      expect(a.join("|"), `switch ${on}`).not.toMatch(/DAY 12\/10/);
      expect(b, `switch ${on}`).toContain("DAY 6/10 · FURNACE · 3-2");
      expect(b.join("|"), `switch ${on}`).not.toMatch(/WINS 3\/10 ·/);
    }
    expect(drawTitle(null, false)).not.toContain("CONTINUE");
  });

  it("HOW TO PLAY draws the long run's lines with the switch on, the live card with it off", () => {
    const sentence = (t: string[]) => t.join(" ");
    const on = withLongRun(() => sentence(drawTitle(null, true)));
    expect(on).toContain("WIN 10 DUSK FIGHTS.");
    expect(on).toContain("THE RUN IS WON AT 10 WINS AND LOST WHEN YOUR HEARTS RUN OUT. THERE IS NO DAY LIMIT. 10-0 IS FLAWLESS.");
    expect(on).not.toContain("SURVIVE 10 DAYS");
    const off = sentence(drawTitle(null, true));
    expect(off).toContain("SURVIVE 10 DAYS.");
    expect(off).toContain("YOUR SCORE IS YOUR W-L RECORD (10-0 IS FLAWLESS).");
    expect(off).not.toContain("THERE IS NO DAY LIMIT");
  });
});

describe("RUN-1 T4: the fork's draw", () => {
  it("a long run on day 12 draws THE ROAD · DAY 12; a 10-day run THE ROAD · DAY 7/10", () => {
    const long = Object.assign(runOf(true), { day: 12, wins: 3, stage: "fork" as const });
    const ten = Object.assign(runOf(false), { day: 7, wins: 3, stage: "fork" as const });
    for (const [run, want, other] of [[long, "THE ROAD · DAY 12", "THE ROAD · DAY 12/10"], [ten, "THE ROAD · DAY 7/10", "THE ROAD · DAY 7"]] as const) {
      const s = new ForkScreen(fakeGame(run));
      drawn.length = 0;
      s.draw(recCanvas().getContext());
      expect(drawn, want).toContain(want);
      expect(drawn, want).not.toContain(other);
      expect(drawn).toContain("PICK ONE FIGHT · WARLORDS NEVER COST A HEART");
    }
  });
});
