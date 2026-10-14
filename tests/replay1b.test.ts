// REPLAY-1b (REQ-BFG-112 follow-up; presentation only; REVIEW-REPLAY1 rulings 1 and 2), on BattleScreen itself (a stand-in
// Game in node: a recording canvas, a real UI, localStorage a Map), as tests/replay1.test.ts does.
// (a) Item 1, a card restored from a save offers no REPLAY. A warlord WIN with a drop (NPC_DAY on): the live card's REPLAY is
//     the watched fight bit for bit (its record cloned at the fight's start); the same run reloaded to its stored card as
//     CONTINUE does (TitleScreen's own continueRun on the saved run) offers none: canReplay() false, no `cardreplay` target,
//     its other targets those of the live card drawn without REPLAY, and VIEW BATTLEFIELD still opens. The fight comes from
//     a bounded search (tiers, days, seeds) for a win whose drop merges into a part placed on the deck. Every other way in on
//     a stored result (setupWarlord's `outcome`: bb.openWarlord's and bb.openNpcDay "result"'s path) offers none either.
// (b) Item 2, the card's primary (the dusk's `next`: ON TO DAWN · DAY n or SEE THE RUN; the warlord's `toroad`: ON TO THE
//     ROAD) has a finger's target: on replay1.test's 10 views, for the dusk card and the warlord card, at least tapPx tall and
//     wide on a phone, on the screen, inside the card or over resultbg only, over no other target, grown down first; the
//     desk's exactly as drawn; and the card's drawing the same canvas calls as at replay1-accepted (DRAW_PINS) and as with no
//     target grown at all. Every day is computed (RUN_DAYS), never pinned.

import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleScale } from "../src/game/battleLayout";
import { BattleScreen } from "../src/screens/battle";
import { ReplayScreen } from "../src/screens/replay";
import { TitleScreen } from "../src/screens/title";
import * as hud from "../src/screens/battleHud"; // REPLAY-1b's primaryTap and viewFloor (read lazily: DRAW_PINS' run, below)
import { CARD_REPLAY, REPLAY_GAP, drawResult } from "../src/screens/battleHud";
import { drawWarlordResult } from "../src/screens/warlordHud";
import { makeGhost, setupRun, setupWarlord } from "../src/tooling";
import { warlordDrop, warlordSeed } from "../src/game/road";
import { gainModule } from "../src/game/fuse";
import { simulate } from "../src/sim/battle";
import { DROP_STARS, npcDayRules, withNpcDay } from "../src/sim/npcDay";
import { RUN_DAYS } from "../src/sim/content";
import { UI, type Rect } from "../src/ui/ui";
import { isPhone, tapPx } from "../src/ui/tap";
import type { G } from "../src/render/pixel";
import type { Game, Screen } from "../src/game/game";
import type { Run } from "../src/game/run";

const DT = 1 / 60;
/** A later day: two before the last (replay1.test's). */
const LATER = RUN_DAYS - 2;
const pickSub = (pw: number, ph: number, p: boolean, scale: number) => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
const sha16 = (s: string | Uint8Array): string => createHash("sha256").update(s).digest("hex").slice(0, 16);

// ------------------------------------------------------------ a recording canvas: every call, every argument
interface RecCanvas { width: number; height: number; calls: string[]; getContext: () => G; sig?: [number, string] }
const isRec = (a: unknown): a is RecCanvas => !!a && typeof a === "object" && Array.isArray((a as RecCanvas).calls);
/** A canvas drawn from: its size and a digest of every call made on it (memoised while it takes no new call). */
function sigOf(c: RecCanvas): string {
  if (!c.sig || c.sig[0] !== c.calls.length) c.sig = [c.calls.length, `${c.width}x${c.height}:${sha16(c.calls.join("\n"))}`];
  return c.sig[1];
}
function argText(a: unknown): string {
  if (isRec(a)) return `[${sigOf(a)}]`;
  if (a && typeof a === "object" && (a as { data?: unknown }).data instanceof Uint8ClampedArray) {
    const d = a as { data: Uint8ClampedArray; width: number; height: number };
    return `img${d.width}x${d.height}:${sha16(new Uint8Array(d.data.buffer, d.data.byteOffset, d.data.byteLength))}`;
  }
  if (typeof a === "function") return "fn";
  return typeof a === "object" ? JSON.stringify(a) : String(a);
}
/** A 2D context that records each method call with all its arguments and each property set, in order (node has no
 *  canvas); images drawn from another recorded canvas by that canvas's digest. */
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
      return (...a: unknown[]) => { c.calls.push(`${k}(${a.map(argText).join(",")})`); };
    },
    set(t, k, v) {
      if (typeof k === "string") {
        t[k] = v;
        c.calls.push(`${k}=${argText(v)}`);
      }
      return true;
    },
  }) as unknown as G;
  return c;
}

// ------------------------------------------------------------ the stand-in game (replay1.test's)
/** localStorage as a Map. */
class MapStore {
  m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}
let store = new MapStore();
let restoreDom: () => void = () => undefined;
beforeAll(() => {
  const doc = globalThis as { document?: unknown };
  const prev = doc.document;
  doc.document = { createElement: () => recCanvas() };
  restoreDom = () => { doc.document = prev; };
});
afterAll(() => { restoreDom(); });
beforeEach(() => {
  store = new MapStore();
  vi.stubGlobal("localStorage", store);
});
afterEach(() => { vi.unstubAllGlobals(); });

type FakeGame = Game & { gone: unknown[]; sounds: string[]; toasts: string[]; canvas: RecCanvas };

/** A stand-in Game: the run, an audio that records, a view (a 402x690 phone at DPR 3 by default), a real UI, a recording
 *  canvas, go() and toast() recording. */
function fakeGame(run: Run, w = 402, h = 690, dpr = 3): FakeGame {
  const view = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const sounds: string[] = [], toasts: string[] = [];
  const audio = new Proxy({}, {
    get: (_t, k) => (k === "play" ? (s: string) => { sounds.push(s); } : k === "music" ? (m: string | null) => { sounds.push(`music:${m}`); } : () => undefined),
  });
  const g = { run, audio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: recCanvas(), gone: [] as unknown[], sounds, toasts } as unknown as FakeGame;
  (g as unknown as { go: (s: unknown) => void }).go = (s: unknown) => { g.gone.push(s); };
  (g as unknown as { toast: (t: string) => void }).toast = (t: string) => { toasts.push(t); };
  return g;
}

type Kind = "dusk" | "warlord";
const KINDS: Kind[] = ["dusk", "warlord"];

/** replay1.test's fights: an offline dusk (seed 7) or a Hard warlord on the road (seed 9, NPC_DAY's card), on `day`. */
function make(kind: Kind, day: number, view: [number, number, number] = [402, 690, 3]): { game: FakeGame; s: BattleScreen; run: Run } {
  const wins = Math.floor((day - 1) / 2);
  if (kind === "warlord") {
    const run = setupWarlord("hard", { hero: "furnace", day, seed: 9, wins });
    const game = fakeGame(run, ...view);
    return { game, s: new BattleScreen(game, "warlord"), run };
  }
  const run = setupRun({ hero: "furnace", day, seed: 7, wins });
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

type Region = { id: string; r: Rect; block: boolean };
/** One frame of `s` drawn: the UI's targets (id, rect, blocking), in the order added. */
function frame(game: FakeGame, s: Screen): Region[] {
  game.ui.begin();
  game.canvas.calls.length = 0;
  s.draw(game.canvas.getContext());
  game.ui.end();
  return game.ui.regions.map((q) => ({ id: q.id, r: { ...q.r }, block: !!q.block }));
}
/** The result card's blocker and every target drawn over it (the card's own). */
const fromCard = (f: Region[]): Region[] => {
  const i = f.findIndex((q) => q.id === "resultbg");
  expect(i, "the card's blocker").toBeGreaterThanOrEqual(0);
  return f.slice(i);
};
const tapOn = (game: FakeGame, id: string): void => {
  const q = game.ui.regions.find((r) => r.id === id);
  expect(q, `a target ${id}`).toBeTruthy();
  q!.onTap!();
};
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

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

/** BACK on the replay's result, then the game entering the screen it returns to. */
function back(game: FakeGame, rp: ReplayScreen): unknown {
  frame(game, rp);
  const n = game.gone.length;
  tapOn(game, rp.over ? "replayback" : "replayleave");
  const to = game.gone[n] as Screen;
  to.enter?.();
  return to;
}

const cardRecordOf = (s: BattleScreen): unknown => (s as unknown as { cardRecord: unknown }).cardRecord;
const setCardRecord = (s: BattleScreen, r: unknown): void => { (s as unknown as { cardRecord: unknown }).cardRecord = r; };

// ------------------------------------------------------------ (a) item 1
type Tier = "easy" | "medium" | "hard";
const TIERS: Tier[] = ["easy", "medium", "hard"];
/** The search's bound on seeds per tier and day. */
const SEEDS = 12;

/** A run at the fork that picked the warlord of `tier` on `day`. A starter deck didn't beat a warlord in the exploration
 *  REPLAY-1b ran (REPORT), so the run fields tooling's strong honest deck for its hero and day (makeGhost power 2: warlord
 *  gates up to 2 days ahead within the day's gold, the rest on plating; uids clear of the run's next). */
function warlordRun(tier: Tier, day: number, seed: number): Run {
  const run = setupWarlord(tier, { hero: "furnace", day, seed, wins: Math.floor((day - 1) / 2) });
  run.build = makeGhost({ hero: run.hero, day: run.day, power: 2 }).build;
  run.nextUid = 1 + Math.max(0, ...run.build.items.map((p) => p.uid), ...run.build.mods.map((m) => m.uid));
  return run;
}

/** Would `def` at `stars`, gained into cargo as finishWarlord gains a drop (then merged), merge into a part placed on the
 *  deck? (On a copy of the run.) */
function mergesPlaced(run: Run, def: string, stars: number): boolean {
  const c = JSON.parse(JSON.stringify(run)) as Run;
  gainModule(c, def, undefined, stars);
  return JSON.stringify(c.build) !== JSON.stringify(run.build);
}

interface WinPick { tier: Tier; day: number; seed: number; drop: string; merges: boolean; name: string; tried: number }
/** The bounded search (tiers, then days 2 .. RUN_DAYS - 1, then seeds 1 .. SEEDS): the first warlord fight (not the
 *  Matriarch's) whose drop rolls and merges into a placed part and which the run wins (sim/battle.ts simulate: the same
 *  inputs as the screen's Arena); failing that, the first win with a drop at all. */
function findWin(): WinPick | null {
  let any: WinPick | null = null, tried = 0;
  for (const tier of TIERS) for (let day = 2; day <= RUN_DAYS - 1; day++) for (let seed = 1; seed <= SEEDS; seed++) {
    const run = warlordRun(tier, day, seed), w = run.warlord!;
    if (w.reward.legendary) continue;
    const drop = warlordDrop(run.seed, run.day, w.id, w.tier, w.build);
    if (!drop) continue;
    const merges = mergesPlaced(run, drop, DROP_STARS[tier]);
    if (!merges && any) continue;
    tried++;
    if (simulate(run.build, w.build, warlordSeed(run), 60 * 200, [run.wins, 0], run.day).winner !== 0) continue;
    const p: WinPick = { tier, day, seed, drop, merges, name: w.name, tried };
    if (merges) return p;
    any ??= p;
  }
  return any;
}

describe("REPLAY-1b (a): a card restored from a save offers no REPLAY", () => {
  it("a warlord win with a drop (NPC_DAY on): the live card's REPLAY is the watched fight; reloaded to its stored card as CONTINUE does, no REPLAY, its other targets as before, VIEW BATTLEFIELD still opens", () => {
    expect(npcDayRules(), "NPC_DAY on, as shipped").toBe(true);
    const p = findWin();
    expect(p, "a warlord win with a drop, within the search").toBeTruthy();
    const run = warlordRun(p!.tier, p!.day, p!.seed), w = run.warlord!;
    const game = fakeGame(run), s = new BattleScreen(game, "warlord");
    const deck0 = JSON.stringify(run.build);
    const watched = toCard(s);
    expect(watched.winner, "the run wins").toBe(0);
    expect(w.result?.outcome).toBe("win");
    expect(w.result?.took, "the win's drop").toBe(p!.drop);
    expect(JSON.stringify(run.build) !== deck0, "the drop merged into a placed part (the deck changed)").toBe(p!.merges);
    // the live card: its record was cloned at the fight's start, so its REPLAY is the watched fight bit for bit
    expect(s.canReplay()).toBe(true);
    frame(game, s); // the counters' tabs cached
    const live = fromCard(frame(game, s));
    expect(live.map((q) => q.id)).toEqual(["resultbg", "viewfield", CARD_REPLAY, "toroad"]);
    const rp = replayFromCard(game, s);
    const replayed = toEnd(rp);
    expect(replayed, "the live card's REPLAY: winner, final tick, both hulls, both sides' stats").toEqual(watched);
    expect(back(game, rp)).toBe(s);
    // what a record made from the deck as it is now plays (the reopened card's REPLAY at replay1-accepted)
    const now = fightOf(simulate(run.build, w.build, warlordSeed(run), 60 * 200, [run.wins, 0], run.day));
    // the live card drawn without REPLAY (replay1.test (e)'s way): its targets
    const keep = cardRecordOf(s);
    setCardRecord(s, null);
    const live0 = fromCard(frame(game, s));
    setCardRecord(s, keep);
    // the reload: the run as saved, then CONTINUE (TitleScreen's own continueRun: mid-warlord, the same warlord)
    expect(store.m.size, "the run is saved").toBeGreaterThan(0);
    const game2 = fakeGame(run);
    (new TitleScreen(game2) as unknown as { continueRun(): void }).continueRun();
    const s2 = game2.gone[game2.gone.length - 1] as BattleScreen;
    expect(s2).toBeInstanceOf(BattleScreen);
    expect(s2).not.toBe(s);
    expect(game2.run, "the run loaded from the save").not.toBe(run);
    expect(JSON.stringify(game2.run!.warlord?.result)).toBe(JSON.stringify(w.result));
    s2.enter();
    for (let i = 0; i < 30; i++) s2.update(DT);
    expect([s2.kind, s2.phase]).toEqual(["warlord", "result"]);
    expect(cardRecordOf(s2), "no record for a card restored from a save").toBeNull();
    expect(s2.canReplay()).toBe(false);
    expect(s2.openCardReplay()).toBeNull();
    frame(game2, s2);
    const re = fromCard(frame(game2, s2));
    expect(re.some((q) => q.id === CARD_REPLAY), "no REPLAY on the reopened card").toBe(false);
    // every other target: the live card's without REPLAY (resultbg and ON TO THE ROAD as on the live card; VIEW
    // BATTLEFIELD the whole row, its left, top and height kept, as on a card without REPLAY since SCOUT-1)
    expect(re).toEqual(live0);
    const at = (f: Region[], id: string) => f.find((q) => q.id === id)!.r;
    expect(at(re, "resultbg")).toEqual(at(live, "resultbg"));
    expect(at(re, "toroad")).toEqual(at(live, "toroad"));
    const v0 = at(live, "viewfield"), v1 = at(re, "viewfield"), rr = at(live, CARD_REPLAY);
    expect([v1.x, v1.y, v1.h]).toEqual([v0.x, v0.y, v0.h]);
    expect(v1.x + v1.w, "VIEW BATTLEFIELD the whole row, through REPLAY's place").toBe(rr.x + rr.w);
    expect(v1.w).toBeGreaterThan(v0.w + REPLAY_GAP);
    // VIEW BATTLEFIELD still opens (and closes)
    tapOn(game2, "viewfield");
    expect(s2.phase).toBe("view");
    expect(s2.closeView()).toBe(true);
    expect(s2.canReplay(), "still none after the view").toBe(false);
    console.log(`REPLAY-1b (a): ${p!.merges ? "FOUND" : "NOT FOUND"} a win whose drop merges into a placed part (${p!.tried} fights simulated): ${p!.tier} warlord ${p!.name}, day ${p!.day}, seed ${p!.seed}, drop ${p!.drop}; ` +
      `watched winner ${watched.winner}, tick ${watched.ticks}, hulls ${watched.hulls.join("/")}; the live card's REPLAY the same; ` +
      `a record from the merged deck would play winner ${now.winner}, tick ${now.ticks}, hulls ${now.hulls.join("/")} (${JSON.stringify(now) === JSON.stringify(watched) ? "the same" : "a different fight"}); ` +
      `reopened card targets ${re.map((q) => q.id).join(", ")}; VIEW BATTLEFIELD ${v0.w} -> ${v1.w} px wide`);
  });

  it("every other way in on a stored result (setupWarlord's `outcome`, as bb.openWarlord and bb.openNpcDay \"result\" build it) offers no REPLAY; the Hard pick card's buttons as they are", () => {
    for (const npc of [true, false]) {
      withNpcDay(() => {
        for (const outcome of [0, 1] as const) {
          // day 4, seed 9: tests/scout1.flow's Hard warlord (a win's pick of 2 with NPC_DAY off); replay1.test's (e) until REPLAY-1b
          const run = setupWarlord("hard", { hero: "furnace", day: 4, seed: 9, outcome });
          const game = fakeGame(run), s = new BattleScreen(game, "warlord");
          expect(s.phase, "on its stored card at once").toBe("result");
          for (let i = 0; i < 30; i++) s.update(DT);
          const ids = fromCard(frame(game, s)).map((q) => q.id);
          expect(cardRecordOf(s)).toBeNull();
          expect(s.canReplay()).toBe(false);
          expect(s.openCardReplay()).toBeNull();
          expect(ids, `NPC_DAY ${npc} outcome ${outcome}`).not.toContain(CARD_REPLAY);
          expect(ids).toContain("viewfield");
          if (npc) expect(ids).toContain("toroad");
          else if (outcome === 0) expect(ids.filter((q) => q.startsWith("take"))).toEqual(["take0", "take1"]); // the pick
          tapOn(game, "viewfield");
          expect(s.phase).toBe("view");
        }
      }, npc);
    }
    // ... while a fight played on the screen (the same warlord, no stored result) keeps its card's REPLAY
    const { game, s } = make("warlord", LATER);
    expect(cardRecordOf(s), "cloned at the fight's start").not.toBeNull();
    toCard(s);
    expect(s.canReplay()).toBe(true);
    expect(fromCard(frame(game, s)).map((q) => q.id)).toContain(CARD_REPLAY);
  });
});

// ------------------------------------------------------------ (b) item 2
const VIEWS: [number, number, number][] = [[402, 690, 3], [390, 844, 3], [430, 932, 3], [360, 780, 3], [844, 390, 3], [690, 402, 3], [932, 430, 3], [1920, 1080, 1], [1366, 768, 1], [1280, 720, 1]];
const tagOf = (v: [number, number, number]) => `${v[0]}x${v[1]}@${v[2]}`;
/** The primary as drawn on a card box (battleHud.ts drawResult; warlordHud.ts drawWarlordResult with NPC_DAY on). */
const drawnPrimary = (kind: Kind, card: Rect): Rect => (kind === "warlord" ? { x: card.x + 10, y: card.y + card.h - 26, w: card.w - 20, h: 20 } : { x: card.x + 10, y: card.y + card.h - 27, w: card.w - 20, h: 21 });

/** The card drawn on its own (the args BattleScreen.draw passes at rest: the primary's label, VIEW BATTLEFIELD, `hit` as the
 *  finger, REPLAY) into a fresh recording canvas and UI: the digest of every canvas call, and its targets. */
function cardDraw(game: FakeGame, run: Run, kind: Kind, hit: number): { digest: string; calls: number; regions: Region[] } {
  const cv = recCanvas(), g = cv.getContext(), noop = () => undefined;
  const ui0 = game.ui, ui = new UI();
  (game as unknown as { ui: UI }).ui = ui;
  ui.begin();
  if (kind === "warlord") drawWarlordResult(g, game, run.warlord!, 1.4, { take: [noop, noop], refit: noop, fight: noop, road: noop }, noop, hit, noop);
  else drawResult(g, game, run.history[run.history.length - 1], 1.4, run.over ? "SEE THE RUN" : `ON TO DAWN · DAY ${run.day}`, noop, noop, hit, noop);
  ui.end();
  (game as unknown as { ui: UI }).ui = ui0;
  return { digest: sha16(cv.calls.join("\n")), calls: cv.calls.length, regions: ui.regions.map((q) => ({ id: q.id, r: { ...q.r }, block: !!q.block })) };
}

/** The card's drawing at replay1-accepted (482b616a9b65): cardDraw's digest per view and kind, made by this file's drawing
 *  test on a git-archive export of replay1-accepted (REPLAY1B_PINS=print: kit-replay1b/pins.sh, output-replay1b/logs). */
const DRAW_PINS: Record<string, string> = {
  "402x690@3 dusk": "537cc93f2777a454", "402x690@3 warlord": "90125b5a27c241db",
  "390x844@3 dusk": "a9e4673a34f2d29c", "390x844@3 warlord": "deb11fdf6d15c600",
  "430x932@3 dusk": "b70c1e1846ca0070", "430x932@3 warlord": "d5c3a8adf2883978",
  "360x780@3 dusk": "1b833baef9910d3b", "360x780@3 warlord": "8732239750bb1762",
  "844x390@3 dusk": "47ff25579c4f0c0f", "844x390@3 warlord": "ac866b5903f9c158",
  "690x402@3 dusk": "a2794b7620d11f99", "690x402@3 warlord": "bf31287b365983be",
  "932x430@3 dusk": "38d738f28f35b8d1", "932x430@3 warlord": "a44d16016486e9ad",
  "1920x1080@1 dusk": "39b128a5d9b81f37", "1920x1080@1 warlord": "fb1d939c518cee07",
  "1366x768@1 dusk": "677f4f12f039bdd8", "1366x768@1 warlord": "7e7c8bcdfcef005c",
  "1280x720@1 dusk": "af672a76309d5cb7", "1280x720@1 warlord": "75e9e9f3f8988bc9",
};

describe("REPLAY-1b (b): the card's primary has a finger's target on a phone, its drawing unchanged", () => {
  it("on each view, the dusk card and the warlord card: at least tapPx both ways on a phone, on the screen, in the card or over resultbg only, over no other target, down first; the desk's as drawn", () => {
    const lines: string[] = [];
    for (const v of VIEWS) {
      for (const kind of KINDS) {
        const label = `${tagOf(v)} ${kind}`;
        const { game, s } = make(kind, LATER, v);
        toCard(s);
        frame(game, s);
        const own = fromCard(frame(game, s)), card = s.scoutRects.card!;
        const bg = own[0].r, pid = kind === "warlord" ? "toroad" : "next";
        expect(bg, `${label}: resultbg covers the screen`).toEqual({ x: 0, y: 0, w: game.W, h: game.H });
        const t = own.find((q) => q.id === pid)?.r;
        expect(t, `${label}: ${pid}`).toBeTruthy();
        const b = drawnPrimary(kind, card), tp = tapPx(game.view), phone = isPhone(game.view);
        const k = game.view.scale / game.view.dpr; // CSS px per logical px
        // on the screen, over its drawn button, its width
        expect(t!.x >= 0 && t!.y >= 0 && t!.x + t!.w <= game.W && t!.y + t!.h <= game.H, `${label}: on the screen`).toBe(true);
        expect([t!.x, t!.w], `${label}: the button's width`).toEqual([b.x, b.w]);
        expect(t!.y <= b.y && t!.y + t!.h >= b.y + b.h, `${label}: over its drawn button`).toBe(true);
        // a finger's where the button is shorter, grown down first (every view has the room below: no growth up)
        expect(t!.h, `${label}: max(drawn, tapPx)`).toBe(Math.max(b.h, tp));
        expect(t!.y, `${label}: down first`).toBe(b.y);
        if (phone) expect(Math.min(t!.w, t!.h), `${label}: a finger's target`).toBeGreaterThanOrEqual(tp);
        if (tp <= b.h) expect(t, `${label}: as drawn where a finger fits (the desk)`).toEqual(b);
        // inside the card or over resultbg only (resultbg is the whole screen: below the card it lies over that alone)
        const below = Math.max(0, t!.y + t!.h - (card.y + card.h));
        expect(t!.x >= card.x && t!.x + t!.w <= card.x + card.w && t!.y >= card.y, `${label}: in the card's columns, under its top`).toBe(true);
        // over no other target (the card's own, drawn over its blocker), the view row's grown targets above it
        for (const q of own.slice(1)) if (q.id !== pid) expect(overlaps(t!, q.r), `${label}: ${pid} over ${q.id}`).toBe(false);
        const view = own.find((q) => q.id === "viewfield")!.r, rep = own.find((q) => q.id === CARD_REPLAY)!.r;
        expect(view.y + view.h <= t!.y && rep.y + rep.h <= t!.y, `${label}: VIEW BATTLEFIELD's and REPLAY's targets end above it`).toBe(true);
        lines.push(`${label}: ${pid} drawn ${b.w}x${b.h} at y ${b.y}; target ${t!.w}x${t!.h} at y ${t!.y} (${(t!.w * k).toFixed(1)} x ${(t!.h * k).toFixed(1)} CSS px; tapPx ${tp}${phone ? ", a phone" : ""}); ${below} px of it below the card over resultbg; card ${card.w}x${card.h} at y ${card.y} on ${game.W}x${game.H}`);
      }
    }
    console.log(`REPLAY-1b (b) the primary's target on each view:\n${lines.join("\n")}`);
  });

  it("the card's drawing (cardDraw): the same canvas calls as at replay1-accepted on every view (DRAW_PINS) and as with no target grown", () => {
    const got: Record<string, string> = {}, lines: string[] = [];
    for (const v of VIEWS) {
      for (const kind of KINDS) {
        const label = `${tagOf(v)} ${kind}`;
        const { game, s, run } = make(kind, LATER, v);
        toCard(s);
        const d1 = cardDraw(game, run, kind, tapPx(game.view)), d0 = cardDraw(game, run, kind, 0);
        expect(d1.calls, `${label}: drawn`).toBeGreaterThan(100);
        expect(d1.digest, `${label}: a grown target changes no canvas call`).toBe(d0.digest);
        // the card on its own draws the targets the screen's card does
        frame(game, s);
        expect(d1.regions, label).toEqual(fromCard(frame(game, s)));
        got[label] = d1.digest;
        lines.push(`${label}: ${d1.calls} canvas calls, digest ${d1.digest}`);
      }
    }
    if (process.env.REPLAY1B_PINS === "print") {
      console.log(`REPLAY1B_PINS ${JSON.stringify(got)}\n${lines.join("\n")}`);
      return;
    }
    expect(got).toEqual(DRAW_PINS);
    console.log(`REPLAY-1b (b) the card's drawing, as at replay1-accepted:\n${lines.join("\n")}`);
  });

  it("primaryTap: down first (the card's margin, then over resultbg), then up into the gap, never over VIEW BATTLEFIELD's floor nor off the screen; the button itself where it is tall enough", () => {
    const { primaryTap, viewFloor } = hud as unknown as { primaryTap: (b: Rect, hit: number, H: number, top?: number) => Rect; viewFloor: (b: Rect) => number };
    const b = { x: 10, y: 100, w: 150, h: 21 };
    expect(primaryTap(b, 0, 200, 90)).toBe(b);
    expect(primaryTap(b, 21, 200, 90)).toBe(b);
    expect(primaryTap(b, 27, 200, 90)).toEqual({ x: 10, y: 100, w: 150, h: 27 }); // all of it down
    expect(primaryTap(b, 27, 124, 90)).toEqual({ x: 10, y: 97, w: 150, h: 27 }); // 3 down to the screen's foot, then 3 up
    expect(primaryTap(b, 27, 121, 98)).toEqual({ x: 10, y: 98, w: 150, h: 23 }); // none down, up to the floor only
    expect(primaryTap(b, 27, 121, 100)).toBe(b); // no room at all
    expect(primaryTap(b, 27, 121)).toBe(b); // no row above: never up
    expect(viewFloor({ x: 0, y: 70, w: 10, h: 21 })).toBe(93); // 2 px into the 4 px gap under a 21 px row at 70
  });
});
