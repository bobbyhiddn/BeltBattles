// REPLAY-1 (REQ-BFG-112; presentation only): a REPLAY button on every post-fight result card (the dusk offline and
// online, the warlord on the road), on BattleScreen itself (a stand-in Game in node: a recording canvas, a real UI,
// localStorage a Map). (a) the card's replay plays the watched fight bit for bit (winner, final tick, both hulls, both
// sides' stats) for each kind, on day 1 and on a later day with the day's hull; (b) read only: every beltbattles.* key
// byte-identical from the card through REPLAY, a speed change, SKIP and BACK, and no saveRun, ghost, fold, finish or
// keepRunSpeed call; (c) BACK returns to the same BattleScreen at the same card (its texts and targets), quiet, and the
// card's buttons still go where they went, REPLAY any number of times; (d) the replay starts at the run's kept speed
// and a pick inside it is not kept; (e) the REPLAY button on each view: on screen, in the card, clear of the card's other
// targets, a finger's size on a phone, the primary action where it was. Every day is computed (RUN_DAYS), never pinned.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** What the pass-through mocks saw: drawText's texts, and every call that would change the run or the device. */
const spy = vi.hoisted(() => ({ text: [] as { s: string; x: number; y: number }[], calls: [] as string[] }));
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  const drawText: typeof m.drawText = (g, s, x, y, color, opts) => {
    spy.text.push({ s, x, y });
    return m.drawText(g, s, x, y, color, opts);
  };
  return { ...m, drawText };
});
vi.mock("../src/game/save", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/game/save")>();
  return { ...m, saveRun: (...a: Parameters<typeof m.saveRun>) => { spy.calls.push("saveRun"); return m.saveRun(...a); } };
});
vi.mock("../src/game/runSpeed", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/game/runSpeed")>();
  return { ...m, keepRunSpeed: (...a: Parameters<typeof m.keepRunSpeed>) => { spy.calls.push("keepRunSpeed"); return m.keepRunSpeed(...a); } };
});
vi.mock("../src/game/ghostGuard", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/game/ghostGuard")>();
  return { ...m, saveRunGhost: (...a: Parameters<typeof m.saveRunGhost>) => { spy.calls.push("saveRunGhost"); return m.saveRunGhost(...a); } };
});
vi.mock("../src/game/ghosts", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/game/ghosts")>();
  return { ...m, saveGhost: (...a: Parameters<typeof m.saveGhost>) => { spy.calls.push("saveGhost"); return m.saveGhost(...a); } };
});
vi.mock("../src/game/styleFolds", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/game/styleFolds")>();
  return {
    ...m,
    foldDuskResult: (...a: Parameters<typeof m.foldDuskResult>) => { spy.calls.push("foldDuskResult"); return m.foldDuskResult(...a); },
    foldWarlordResult: (...a: Parameters<typeof m.foldWarlordResult>) => { spy.calls.push("foldWarlordResult"); return m.foldWarlordResult(...a); },
    foldRunEnd: (...a: Parameters<typeof m.foldRunEnd>) => { spy.calls.push("foldRunEnd"); return m.foldRunEnd(...a); },
  };
});
vi.mock("../src/game/day", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/game/day")>();
  return { ...m, finishDay: (...a: Parameters<typeof m.finishDay>) => { spy.calls.push("finishDay"); return m.finishDay(...a); } };
});
vi.mock("../src/game/road", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/game/road")>();
  return { ...m, finishWarlord: (...a: Parameters<typeof m.finishWarlord>) => { spy.calls.push("finishWarlord"); return m.finishWarlord(...a); } };
});

import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleScale } from "../src/game/battleLayout";
import { BattleScreen } from "../src/screens/battle";
import { ReplayScreen } from "../src/screens/replay";
import { BuildScreen } from "../src/screens/build/build";
import { SummaryScreen } from "../src/screens/summary";
import { CARD_REPLAY, REPLAY_GAP, REPLAY_LABEL, SPEEDS, cardReplayRow } from "../src/screens/battleHud";
import { ON_TO_THE_ROAD } from "../src/screens/warlordHud";
import { RUN_SPEED_1X, keepRunSpeed, runSpeed } from "../src/game/runSpeed";
import { makeGhost, setupRun, setupWarlord } from "../src/tooling";
import { simulate } from "../src/sim/battle"; // REPLAY-1b: (e)'s Hard win, found
import { warlordSeed } from "../src/game/road"; // REPLAY-1b
import { setSession, type Session } from "../src/game/session";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { hullScaleRules } from "../src/sim/hullScale";
import { withNpcDay } from "../src/sim/npcDay";
import { RUN_DAYS } from "../src/sim/content";
import { WIN_GOAL, withLongRun } from "../src/sim/longRun"; // BUMP-1D: LONG_RUN ships on; the 10-day run's last-day dusk is made with it off
import { textWidth } from "../src/render/font";
import { UI, type Rect } from "../src/ui/ui";
import { isPhone, tapPx } from "../src/ui/tap";
import { fakeCanvas, fakeDom } from "./pair1.helpers";
import type { Game, Screen } from "../src/game/game";
import type { Run } from "../src/game/run";

const DT = 1 / 60;
const X05 = 0, X1 = 1, X2 = 2, X4 = 3; // indices into SPEEDS (0.5X 1X 2X 4X)
/** A later day: two before the last, so a dusk there can still lead to LAST CHANCE (day < RUN_DAYS). */
const LATER = RUN_DAYS - 2;
const pickSub = (pw: number, ph: number, p: boolean, scale: number) => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };

/** localStorage as a Map, counting every write. */
class MapStore {
  m = new Map<string, string>();
  writes = 0;
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.writes++; this.m.set(k, String(v)); }
  removeItem(k: string): void { this.writes++; this.m.delete(k); }
  clear(): void { this.writes++; this.m.clear(); }
}
let store = new MapStore();
/** Every beltbattles.* key and its value, sorted. */
const snapshot = (): [string, string][] => [...store.m.entries()].filter(([k]) => k.startsWith("beltbattles.")).sort((p, q) => (p[0] < q[0] ? -1 : 1));

let restore: () => void = () => undefined;
beforeAll(() => { restore = fakeDom(); });
afterAll(() => { restore(); setSession(null); });
beforeEach(() => {
  store = new MapStore();
  vi.stubGlobal("localStorage", store);
  spy.calls.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  setSession(null);
});

type FakeGame = Game & { gone: unknown[]; sounds: string[]; toasts: string[] };

/** A stand-in Game: the run, an audio that records, a view (a 402x690 phone at DPR 3 by default), a real UI, a recording
 *  canvas, go() and toast() recording. */
function fakeGame(run: Run, w = 402, h = 690, dpr = 3): FakeGame {
  const view = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const sounds: string[] = [], toasts: string[] = [];
  const audio = new Proxy({}, {
    get: (_t, k) => (k === "play" ? (s: string) => { sounds.push(s); } : k === "music" ? (m: string | null) => { sounds.push(`music:${m}`); } : () => undefined),
  });
  const g = { run, audio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: fakeCanvas(), gone: [] as unknown[], sounds, toasts } as unknown as FakeGame;
  (g as unknown as { go: (s: unknown) => void }).go = (s: unknown) => { g.gone.push(s); };
  (g as unknown as { toast: (t: string) => void }).toast = (t: string) => { toasts.push(t); };
  return g;
}

/** An online session that answers nothing (tonight's stored foe stands): onlineMode() is on; its uploads are counted. */
const quietSession = (): Session => ({
  url: "test", active: true, failed: false, tick() {}, settle() {},
  submitDusk() { spy.calls.push("submitDusk"); }, countRun() { spy.calls.push("countRun"); },
});

type Kind = "offline" | "online" | "warlord";
const KINDS: Kind[] = ["offline", "online", "warlord"];

/** A fight of `kind` on `day`, its screen made (the dusk picked and saved, as the game does). The online dusk's foe is a
 *  server ghost holding WARLORD'S DUE and carrying wins (day - 1: the snapshot's bound), so the record keeps both sides'
 *  wins; the run carries wins of its own. */
function make(kind: Kind, day: number, view: [number, number, number] = [402, 690, 3], o: { lives?: number; seed?: number; wins?: number; spent?: boolean; tenDay?: boolean } = {}): { game: FakeGame; s: BattleScreen; run: Run } {
  const wins = o.wins ?? Math.floor((day - 1) / 2);
  if (kind === "warlord") {
    const run = setupWarlord("hard", { hero: "furnace", day, seed: o.seed ?? 9, wins });
    const game = fakeGame(run, ...view);
    return { game, s: new BattleScreen(game, "warlord"), run };
  }
  // BUMP-1D: a long run (LONG_RUN ships on) unless `tenDay`: the 10-day run, whose last day's dusk ends it; `spent`: LAST CHANCE taken already
  const run = withLongRun(() => setupRun({ hero: "furnace", day, seed: o.seed ?? 7, wins, ...(o.lives !== undefined ? { lives: o.lives } : {}) }), !o.tenDay);
  if (o.spent) run.lastChance = { day: 1, boon: "hull" };
  if (kind === "online") {
    setSession(quietSession());
    const build = { ...heroStartBuild("weaver", 77), runes: [{ id: "warlords_due" }] };
    // BUMP-1D: a ghost's wins are at most WIN_GOAL - 1 (a dusk BEFORE its 10th win: snapshot.ts maxWinsFor), so day - 1 up to day 10
    run.dusk = { day: run.day, kind: "ghost", name: "GHOST · WEAVER", hero: "weaver", build, source: "online", ghostId: "g-replay1", record: { wins: Math.min(day - 1, WIN_GOAL - 1), lives: 3, runId: "r-ghost", playerId: "p-ghost", createdAt: 1 } };
  }
  const game = fakeGame(run, ...view);
  return { game, s: new BattleScreen(game), run };
}

interface Fight { winner: number | null; ticks: number; hulls: [number, number]; stats: string }
const fightOf = (b: BattleScreen["arena"]["b"]): Fight => ({ winner: b.winner, ticks: b.ticks, hulls: [b.sides[0].hull.hp, b.sides[1].hull.hp], stats: JSON.stringify([b.sides[0].stats, b.sides[1].stats]) });

/** Step a battle to its result card, then 30 frames more (the card up, its buttons shown); the fight as watched. */
function toCard(s: BattleScreen): Fight {
  for (let i = 0; i < 60 * 400 && s.phase !== "result"; i++) s.update(DT);
  expect(s.phase).toBe("result");
  for (let i = 0; i < 30; i++) s.update(DT);
  return fightOf(s.arena.b);
}

/** Step a replay to its end and its result card (BACK shown). */
function toEnd(rp: ReplayScreen): Fight {
  for (let i = 0; i < 60 * 400 && !rp.over; i++) rp.update(DT);
  expect(rp.over).toBe(true);
  for (let i = 0; i < 45; i++) rp.update(DT);
  return fightOf(rp.arena.b);
}

/** One frame of `s` drawn: the UI's targets (id and rect) and every text drawn. */
function frame(game: FakeGame, s: Screen): { regions: { id: string; r: Rect; block: boolean }[]; text: string[] } {
  game.ui.begin();
  spy.text.length = 0;
  s.draw(game.canvas.getContext("2d") as never);
  game.ui.end();
  return { regions: game.ui.regions.map((q) => ({ id: q.id, r: { ...q.r }, block: !!q.block })), text: spy.text.map((t) => `${t.s}@${t.x},${t.y}`) };
}
const tapOn = (game: FakeGame, id: string): void => {
  const q = game.ui.regions.find((r) => r.id === id);
  expect(q, `a target ${id}`).toBeTruthy();
  q!.onTap!();
};
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** The card's primary action: ON TO DAWN / SEE THE RUN ("next"), a warlord's ON TO THE ROAD ("toroad") or its REFIT,
 *  FIGHT NOW or ON TO DUSK (NPC_DAY off). */
const primaryId = (ids: string[]): string => ["toroad", "next", "refit", "take0"].find((id) => ids.includes(id)) ?? "";

/** REPLAY from the card: the ReplayScreen opened (the card's own target tapped), as the game enters it. */
function replayFromCard(game: FakeGame, s: BattleScreen): ReplayScreen {
  frame(game, s);
  const n = game.gone.length;
  tapOn(game, CARD_REPLAY);
  expect(game.gone.length).toBe(n + 1);
  const rp = game.gone[n];
  expect(rp).toBeInstanceOf(ReplayScreen);
  (rp as ReplayScreen).enter();
  return rp as ReplayScreen;
}

/** BACK on the replay (its own target, running or at its result), then the game entering the screen it returns to. */
function back(game: FakeGame, rp: ReplayScreen): unknown {
  frame(game, rp);
  const n = game.gone.length;
  tapOn(game, rp.over ? "replayback" : "replayleave");
  expect(game.gone.length).toBe(n + 1);
  const to = game.gone[n] as Screen;
  to.enter?.();
  return to;
}

describe("REPLAY-1 (a): the card's replay is the watched fight, bit for bit", () => {
  it("each kind (offline dusk, online dusk vs a ghost carrying wins, warlord) on day 1 and on a later day with the day's hull", () => {
    expect(hullScaleRules()).toBe(true); // the shipped HULL_SCALE: a later day's hulls are scaled
    const hullMax: Record<string, number> = {};
    const lines: string[] = [];
    for (const kind of KINDS) {
      for (const day of [1, LATER]) {
        const { game, s, run } = make(kind, day);
        const winsIn = run.wins; // the wins the run carries into the fight
        const watched = toCard(s);
        expect(watched.winner, `${kind} d${day}`).not.toBeNull();
        hullMax[`${kind}${day}`] = s.arena.b.sides[0].hull.max;
        const rec = (s as unknown as { cardRecord: { day?: number; wins?: [number, number] } }).cardRecord;
        expect(rec.day, `the record keeps the fight's day (${kind} d${day})`).toBe(day);
        if (kind === "online") {
          expect(rec.wins, "WARLORD'S DUE: both sides' wins travel in the record").toEqual([winsIn, day - 1]);
          const hist = run.history[run.history.length - 1];
          expect(JSON.stringify(hist.record), "the history keeps the online dusk's record, as before").toBe(JSON.stringify(rec));
        } else if (kind === "offline") {
          expect(run.history[run.history.length - 1].record, "an offline dusk stores none, as before").toBeUndefined();
        }
        const rp = replayFromCard(game, s);
        const replayed = toEnd(rp);
        expect(replayed, `${kind} d${day}`).toEqual(watched);
        lines.push(`${kind} day ${day}: winner ${watched.winner}, tick ${watched.ticks}, hulls ${watched.hulls.join("/")}, at ${SPEEDS[rp.speed]}X`);
      }
    }
    for (const kind of KINDS) expect(hullMax[`${kind}${LATER}`], `${kind}: day ${LATER}'s hull is the day's`).toBeGreaterThan(hullMax[`${kind}1`]);
    console.log(`REPLAY-1 (a) bit for bit:\n${lines.join("\n")}`);
  });

  it("a dusk that ends the run (SEE THE RUN; offline and online) and one whose card leads to LAST CHANCE offer REPLAY too, bit for bit", () => {
    const check = (label: string, m: ReturnType<typeof make>, watched: Fight, primary: string) => {
      const { game, s } = m;
      frame(game, s); // the counters' tabs cached (drawn once into their images)
      const f = frame(game, s);
      expect(f.text.some((t) => t.startsWith(`${primary}@`)), `${label}: ${primary}`).toBe(true);
      expect(f.regions.some((q) => q.id === CARD_REPLAY), `${label}: REPLAY on the card`).toBe(true);
      const rp = replayFromCard(game, s);
      expect(toEnd(rp), label).toEqual(watched);
      expect(back(game, rp)).toBe(s);
      frame(game, s);
      tapOn(game, "next");
      return game.gone[game.gone.length - 1];
    };
    // the last day's dusk ends the run, won or lost: SEE THE RUN, then the summary
    // BUMP-1D: that is the 10-day run's end (LONG_RUN ships on: a long run is never over by its day), so these runs are 10-day runs ...
    for (const kind of ["offline", "online"] as const) {
      const m = make(kind, RUN_DAYS, [402, 690, 3], { tenDay: true });
      const watched = toCard(m.s);
      expect(m.run.over, `${kind}: the run ends`).toBeTruthy();
      expect(check(`${kind} day ${RUN_DAYS} (${m.run.over})`, m, watched, "SEE THE RUN")).toBeInstanceOf(SummaryScreen);
    }
    // ... and the long run's dusk that ends it: its 10th win (here from 9 wins in hand), or its last heart with LAST CHANCE spent (1 heart
    // left): won or lost, never a draw's
    for (const kind of ["offline", "online"] as const) {
      const m = make(kind, 12, [402, 690, 3], { wins: 9, lives: 1, spent: true });
      expect(m.run.longRun, `${kind}: a long run`).toBe(true);
      const watched = toCard(m.s);
      expect(m.run.over, `${kind}: the long run ends`).toBeTruthy();
      expect(check(`${kind} long day 12 (${m.run.over})`, m, watched, "SEE THE RUN")).toBeInstanceOf(SummaryScreen);
    }
    // LAST CHANCE: for a few lives, the first seed whose dusk on LATER is lost and fires it (the stand-in, and so the fight,
    // follows the run's lives too)
    let lc = 0;
    for (let lives = 1; lives <= 6 && !lc; lives++) {
      for (let seed = 1; seed <= 40 && !lc; seed++) {
        const m = make("offline", LATER, [402, 690, 3], { lives, seed });
        const watched = toCard(m.s);
        const r = m.run.history[m.run.history.length - 1];
        if (r.outcome !== "loss" || !r.lastChance || m.run.over) continue;
        lc++;
        expect(check(`LAST CHANCE (lives ${lives}, seed ${seed})`, m, watched, `ON TO DAWN · DAY ${m.run.day}`)).toBeInstanceOf(BuildScreen);
      }
    }
    expect(lc, "a LAST CHANCE card").toBe(1);
  });
});

describe("REPLAY-1 (b): read only", () => {
  it("every beltbattles.* key is byte-identical from the card through REPLAY, a speed change, SKIP and BACK; no save, ghost, fold, finish or kept speed", () => {
    for (const kind of KINDS) {
      const { game, s, run } = make(kind, LATER);
      keepRunSpeed(run, X2); // picked in an earlier battle of the run
      toCard(s);
      const keys = snapshot(), saved = JSON.stringify(run), fx = JSON.stringify(run.fuseFx ?? null);
      expect(keys.length, `${kind}: the save and the kept speed are there`).toBeGreaterThanOrEqual(2);
      spy.calls.length = 0;
      store.writes = 0;
      const rp = replayFromCard(game, s);
      expect(rp.holdsMerges, "the replay holds the merge toasts as its card does").toBe(true);
      for (let i = 0; i < 40; i++) rp.update(DT);
      rp.key("4"); // a speed picked inside the replay
      const rf = frame(game, rp), bar = rf.regions.find((q) => /^sp(d|\d)$/.test(q.id) && q.id !== `sp${rp.speed}`); // sp0-sp3, or the cycle's spd
      expect(bar, `the replay bar's speed (${kind}; over ${rp.over}; ${rf.regions.map((q) => q.id).join(" ")})`).toBeTruthy();
      tapOn(game, bar!.id); // and one tapped on its bar
      expect(rp.speed).not.toBe(X4);
      for (let i = 0; i < 20; i++) rp.update(DT);
      rp.key("S"); // SKIP
      expect(rp.over).toBe(true);
      for (let i = 0; i < 45; i++) rp.update(DT);
      expect(back(game, rp)).toBe(s);
      expect(snapshot(), kind).toEqual(keys);
      expect(store.writes, `${kind}: nothing written`).toBe(0);
      expect(spy.calls, kind).toEqual([]);
      expect(JSON.stringify(run), `${kind}: the run as it was`).toBe(saved);
      expect(JSON.stringify(run.fuseFx ?? null)).toBe(fx);
    }
  });
});

describe("REPLAY-1 (c): BACK returns to the same card", () => {
  it("the same BattleScreen at the same card (texts and targets), quiet; REPLAY again; the card's buttons go where they went", () => {
    for (const kind of KINDS) {
      const { game, s, run } = make(kind, LATER);
      const watched = toCard(s);
      frame(game, s); // the counters' status tabs drawn once into their cached images (their texts are not drawn again)
      const before = frame(game, s);
      const ids = before.regions.map((q) => q.id);
      expect(ids).toContain(CARD_REPLAY);
      expect(ids).toContain("viewfield");
      // BACK from the running replay
      let rp = replayFromCard(game, s);
      for (let i = 0; i < 30; i++) rp.update(DT);
      game.sounds.length = 0;
      expect(back(game, rp)).toBe(s);
      expect(game.sounds, "no horn, no battle music, no sting: the card stays quiet").toEqual(["music:null"]);
      expect(s.phase).toBe("result");
      expect(frame(game, s)).toEqual(before);
      // ... and from the replay's own result, again and again: the same fight each time
      for (let n = 0; n < 2; n++) {
        rp = replayFromCard(game, s);
        expect(toEnd(rp)).toEqual(watched);
        game.sounds.length = 0;
        expect(back(game, rp)).toBe(s);
        expect(game.sounds).toEqual(["music:null"]);
        for (let i = 0; i < 10; i++) s.update(DT); // the card goes on as before (no outro, no sting)
        expect(game.sounds.filter((q) => q === "win" || q === "lose" || q === "horn")).toEqual([]);
        expect(frame(game, s).regions).toEqual(before.regions);
      }
      // VIEW BATTLEFIELD still opens and closes
      tapOn(game, "viewfield");
      expect(s.phase).toBe("view");
      expect(s.closeView()).toBe(true);
      for (let i = 0; i < 40; i++) s.update(DT);
      // the primary action: the next screen, as before
      const f = frame(game, s), p = primaryId(f.regions.map((q) => q.id));
      const n = game.gone.length;
      tapOn(game, p);
      const next = game.gone[game.gone.length - 1];
      expect(game.gone.length, `${kind}: ${p} goes on`).toBe(n + 1);
      if (kind === "warlord") expect(p).toBe("toroad"); // NPC_DAY on: ON TO THE ROAD
      else expect(next).toBeInstanceOf(run.over ? SummaryScreen : BuildScreen);
    }
    expect(ON_TO_THE_ROAD).toBe("ON TO THE ROAD");
  });

  it("REPLAY shows only once the card is up: not in the fight, the outro or VIEW BATTLEFIELD, nor while the card rises", () => {
    const { game, s } = make("offline", 1);
    let sawOutro = false;
    for (let i = 0; i < 60 * 400 && s.phase !== "result"; i++) {
      s.update(DT);
      if (i % 20 === 0 || s.phase === "outro") {
        sawOutro ||= s.phase === "outro";
        expect(frame(game, s).regions.some((q) => q.id === CARD_REPLAY), s.phase).toBe(false);
        expect(s.openCardReplay()).toBeNull();
      }
    }
    expect(sawOutro).toBe(true);
    expect(frame(game, s).regions.some((q) => q.id === CARD_REPLAY), "the card rising").toBe(false);
    for (let i = 0; i < 30; i++) s.update(DT);
    expect(frame(game, s).regions.some((q) => q.id === CARD_REPLAY), "the card up").toBe(true);
    s.openView();
    expect(frame(game, s).regions.some((q) => q.id === CARD_REPLAY), "VIEW BATTLEFIELD").toBe(false);
    expect(s.openCardReplay()).toBeNull();
  });
});

describe("REPLAY-1 (d): the replay starts at the run's kept speed", () => {
  it("at runSpeed(run) for every kept speed and kind; a pick inside the replay is not kept; the next battle starts at the kept speed", () => {
    for (const kind of KINDS) {
      for (const kept of [X05, X1, X2, X4]) {
        store.clear();
        const { game, s, run } = make(kind, LATER);
        if (kept !== RUN_SPEED_1X) keepRunSpeed(run, kept);
        toCard(s);
        expect(s.arena.speed).toBe(1); // the outro and the card at 1X, as before
        const rp = replayFromCard(game, s);
        expect(rp.speed, `${kind} kept ${kept}`).toBe(runSpeed(run));
        expect(rp.speed).toBe(kept);
        expect(rp.arena.speed).toBe(SPEEDS[kept]);
        const other = (kept + 1) % SPEEDS.length;
        rp.setSpeed(other);
        expect(rp.arena.speed).toBe(SPEEDS[other]);
        expect(runSpeed(run), "not kept").toBe(kept);
        back(game, rp);
        expect(runSpeed(run)).toBe(kept);
        if (kind !== "warlord") expect(new BattleScreen(game).speed, "the next dusk at the kept speed").toBe(kept);
      }
    }
  });

  it("the summary's path is as before: a ReplayScreen made directly starts at 1X and holds no merge toasts", () => {
    const { game, s, run } = make("offline", 1);
    keepRunSpeed(run, X4);
    toCard(s);
    const stub: Screen = { update() {}, draw() {} };
    const rp = new ReplayScreen(game, stub, s.arena.b, { day: 1, foe: s.foeName });
    expect(rp.speed).toBe(X1);
    expect(rp.holdsMerges).toBe(false);
  });
});

/** REPLAY-1b (REQ-BFG-112): a Hard warlord fight (NPC_DAY off: call it inside withNpcDay(.., false)) that the run wins on
 *  the screen, for (e)'s pick card: the first day (2 .. RUN_DAYS - 1) and seed (1 .. 8) whose fight it wins (sim/battle.ts
 *  simulate on the screen's Arena's inputs), found once. A starter deck didn't beat a Hard warlord in REPLAY-1b's exploration,
 *  so the run fields tooling's strong honest deck for its day (makeGhost power 2, as tests/replay1b.test.ts warlordRun). */
let hardWin: { day: number; seed: number } | null = null;
function hardPickRun(): Run {
  const at = (day: number, seed: number): Run => {
    const run = setupWarlord("hard", { hero: "furnace", day, seed, wins: Math.floor((day - 1) / 2) });
    run.build = makeGhost({ hero: run.hero, day: run.day, power: 2 }).build;
    run.nextUid = 1 + Math.max(0, ...run.build.items.map((p) => p.uid), ...run.build.mods.map((m) => m.uid));
    return run;
  };
  for (let day = 2; day <= RUN_DAYS - 1 && !hardWin; day++) {
    for (let seed = 1; seed <= 8 && !hardWin; seed++) {
      const run = at(day, seed), w = run.warlord!;
      if (!w.reward.legendary && w.reward.parts.length && simulate(run.build, w.build, warlordSeed(run), 60 * 200, [run.wins, 0], run.day).winner === 0) hardWin = { day, seed };
    }
  }
  expect(hardWin, "a Hard win within the search").toBeTruthy();
  return at(hardWin!.day, hardWin!.seed);
}

describe("REPLAY-1 (e): the REPLAY button on every view", () => {
  const VIEWS: [number, number, number][] = [[402, 690, 3], [390, 844, 3], [430, 932, 3], [360, 780, 3], [844, 390, 3], [690, 402, 3], [932, 430, 3], [1920, 1080, 1], [1366, 768, 1], [1280, 720, 1]];

  it("on screen, inside the card, clear of the card's other targets, a finger's size on a phone; the card and its primary as without it", () => {
    const lines: string[] = [];
    const check = (label: string, game: FakeGame, s: BattleScreen) => {
      const f = frame(game, s);
      const card = s.scoutRects.card!;
      const i0 = f.regions.findIndex((q) => q.id === "resultbg");
      expect(i0, label).toBeGreaterThanOrEqual(0);
      const own = f.regions.slice(i0 + 1); // the card's targets (drawn over its blocker)
      const rep = own.find((q) => q.id === CARD_REPLAY)?.r;
      expect(rep, label).toBeTruthy();
      const { W, H } = game;
      expect(rep!.x >= 0 && rep!.y >= 0 && rep!.x + rep!.w <= W && rep!.y + rep!.h <= H, `${label} on screen`).toBe(true);
      expect(rep!.x >= card.x && rep!.y >= card.y && rep!.x + rep!.w <= card.x + card.w && rep!.y + rep!.h <= card.y + card.h, `${label} in the card`).toBe(true);
      for (const q of own) if (q.id !== CARD_REPLAY) expect(overlaps(rep!, q.r), `${label}: REPLAY over ${q.id}`).toBe(false);
      if (isPhone(game.view)) expect(Math.min(rep!.w, rep!.h), `${label}: a finger's target`).toBeGreaterThanOrEqual(tapPx(game.view));
      // VIEW BATTLEFIELD keeps its whole label (3 px a side) and the big face
      const row = cardReplayRow({ x: card.x + 10, y: 0, w: card.w - 20, h: 21 }, tapPx(game.view));
      expect(row.font, label).toBe("5");
      expect(row.view.w).toBeGreaterThanOrEqual(textWidth("VIEW BATTLEFIELD") + 6);
      // the same card without REPLAY: the card's box, the primary's target and every other target but VIEW BATTLEFIELD's
      // (now narrower, its left edge and height kept) are the same
      const keep = (s as unknown as { cardRecord: unknown }).cardRecord;
      (s as unknown as { cardRecord: unknown }).cardRecord = null;
      const g0 = frame(game, s), card0 = s.scoutRects.card!;
      (s as unknown as { cardRecord: unknown }).cardRecord = keep;
      expect(card0, `${label}: the card's size`).toEqual(card);
      const p = primaryId(own.map((q) => q.id));
      expect(p, label).not.toBe("");
      expect(own.find((q) => q.id === p)!.r, `${label}: the primary's place`).toEqual(g0.regions.find((q) => q.id === p)!.r);
      const v0 = g0.regions.find((q) => q.id === "viewfield")!.r, v1 = own.find((q) => q.id === "viewfield")!.r;
      expect([v1.x, v1.y, v1.h]).toEqual([v0.x, v0.y, v0.h]);
      expect(v1.x + v1.w + REPLAY_GAP).toBeLessThanOrEqual(rep!.x);
      expect(g0.regions.filter((q) => q.id !== "viewfield")).toEqual(f.regions.filter((q) => q.id !== "viewfield" && q.id !== CARD_REPLAY));
      lines.push(`${label}: card ${card.w}x${card.h}, REPLAY ${JSON.stringify(rep)}, VIEW BATTLEFIELD w ${v0.w} -> ${v1.w}, tapPx ${tapPx(game.view)}`);
    };
    for (const v of VIEWS) {
      const tag = `${v[0]}x${v[1]}@${v[2]}`;
      for (const kind of ["offline", "warlord"] as const) {
        const { game, s } = make(kind, LATER, v);
        toCard(s);
        check(`${tag} ${kind}`, game, s);
      }
      // NPC_DAY off: a Hard win's pick of 2 (take0, take1) under the PICK line. REPLAY-1b (REQ-BFG-112; REVIEW-REPLAY1
      // ruling 1): a card restored from a save offers no REPLAY, so this card is no longer built on a stored result
      // (setupWarlord's `outcome`: day 4, seed 9, as tests/scout1.flow's) but after a Hard win played on the screen
      withNpcDay(() => {
        const run = hardPickRun();
        const game = fakeGame(run, ...v), s = new BattleScreen(game, "warlord");
        toCard(s);
        const ids = frame(game, s).regions.map((q) => q.id);
        expect(ids).toContain("take0");
        check(`${tag} warlord pick (NPC_DAY off)`, game, s);
      }, false);
    }
    expect(REPLAY_LABEL).toBe("REPLAY");
    console.log(`REPLAY-1 (e) the button on each view:\n${lines.join("\n")}`);
  });

  it("cardReplayRow: a row too narrow for both labels in the big face takes REPLAY's small face; REPLAY at least a finger wide", () => {
    const wide = cardReplayRow({ x: 10, y: 0, w: 194, h: 21 }, 22);
    expect(wide.font).toBe("5");
    expect(wide.replay.w).toBe(textWidth(REPLAY_LABEL) + 12);
    expect(wide.view.w + REPLAY_GAP + wide.replay.w).toBe(194);
    const narrow = cardReplayRow({ x: 10, y: 0, w: 140, h: 21 }, 22);
    expect(narrow.font).toBe("3");
    expect(narrow.replay.w).toBe(Math.max(22, textWidth(REPLAY_LABEL, "3") + 8));
    expect(narrow.view.w).toBeGreaterThanOrEqual(textWidth("VIEW BATTLEFIELD"));
    expect(cardReplayRow({ x: 0, y: 0, w: 194, h: 21 }, 60).replay.w).toBe(60);
  });
});
