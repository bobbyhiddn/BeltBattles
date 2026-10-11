// SCOUT-1b (REQ-BFG-083; presentation only): the battle speed the player picks holds for the rest of the run, on
// BattleScreen itself (a stand-in Game in node, no canvas; localStorage a Map). The same fight at every speed (and
// skipped) is the same fight; battle 1 at 2X makes battle 2 start at 2X, the bar on 2X before its first step, with a
// warlord fight in between keeping it too; a reload keeps it, a new run starts at 1X, REPLAY keeps its own control; the KO
// slow-mo, the outro and SKIP never change it, nor the intro's timing; and the upload payload, the battle record and the
// saved run are byte-equal with the speed at 1X and at 4X.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleScale } from "../src/game/battleLayout";
import { BattleScreen } from "../src/screens/battle";
import { ReplayScreen } from "../src/screens/replay";
import { SPEEDS, SPEED_1X } from "../src/screens/battleHud";
import { RUN_SPEEDS, RUN_SPEED_1X, SPEED_KEY, keepRunSpeed, runSpeed } from "../src/game/runSpeed";
import { setupRun } from "../src/tooling";
import { pickRoad } from "../src/game/road";
import { battleSeed, type Run } from "../src/game/run";
import { loadRun, saveRun } from "../src/game/save";
import { ghostOf } from "../src/game/day";
import { battleRecordFor } from "../src/net/replay";
import { openReplay } from "../src/game/replays";
import type { SimEvent } from "../src/sim/battle";
import type { Game } from "../src/game/game";

const DT = 1 / 60;
const X05 = 0, X1 = 1, X2 = 2, X4 = 3; // indices into SPEEDS (0.5X 1X 2X 4X)
const pickSub = (pw: number, ph: number, p: boolean, scale: number) => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };

/** localStorage as a Map (the page's own key list, for the checks below). */
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
beforeEach(() => {
  store = new MapStore();
  vi.stubGlobal("localStorage", store);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function fakeGame(run: Run, w = 390, h = 844, dpr = 3): Game & { gone: unknown[] } {
  const view = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const silent = new Proxy({}, { get: () => () => undefined });
  const g = { run, audio: silent, view, W: view.W, H: view.H, portrait: view.portrait, gone: [] as unknown[], t: 0 } as unknown as Game & { gone: unknown[] };
  (g as unknown as { go: (s: unknown) => void }).go = (s: unknown) => { g.gone.push(s); };
  return g;
}

interface Played { ev: SimEvent[]; speeds: number[]; firstStepSpeed: number | null; winner: number | null; ticks: number; hp: number[]; stats: unknown[]; goFrame: number }

/** Step a battle to its result card (or `skipAt` frames in, then S), copying every sim event each step drained (the
 *  frames' steps and SKIP's alike: the sim's own drain, read only) and the arena's speed at each frame that stepped. */
function play(s: BattleScreen, skipAt = -1): Played {
  const ev: SimEvent[] = [], speeds: number[] = [];
  const a = s.arena, b0 = a.b;
  const real = a.update.bind(a), drain = b0.drainEvents.bind(b0);
  let first: number | null = null, goFrame = -1;
  b0.drainEvents = () => { const out = drain(); for (const e of out) ev.push({ ...e }); return out; };
  a.update = (dt: number, drive = true) => {
    const t0 = a.b.ticks;
    const out = real(dt, drive);
    if (a.b.ticks > t0) {
      speeds.push(a.speed);
      if (first === null) first = a.speed;
    }
    return out;
  };
  for (let i = 1; i <= 60 * 400 && s.phase !== "result"; i++) {
    if (i === skipAt) s.key("S");
    s.update(DT);
    if (goFrame < 0 && s.phase === "fight") goFrame = i;
  }
  a.update = real;
  b0.drainEvents = drain;
  const b = a.b;
  return { ev, speeds, firstStepSpeed: first, winner: b.winner, ticks: b.ticks, hp: [b.sides[0].hull.hp, b.sides[1].hull.hp], stats: [b.sides[0].stats, b.sides[1].stats], goFrame };
}

const barSpeed = (s: BattleScreen): number => s.speed;
const kept = (): string | null => store.getItem(SPEED_KEY);
const bar = (s: BattleScreen) => (s as unknown as { bar: { onSpeed: (() => void)[]; onCycle: () => void } }).bar;

describe("SCOUT-1b: the speed you pick holds for the run (REQ-BFG-083)", () => {
  it("the store: 1X with nothing kept, a broken key or another run's; this run's kept speed; the bar's four speeds", () => {
    expect(RUN_SPEEDS).toBe(SPEEDS.length);
    expect(RUN_SPEED_1X).toBe(SPEED_1X);
    const run = { runId: "r-a" }, other = { runId: "r-b" };
    expect(runSpeed(run)).toBe(X1);
    keepRunSpeed(run, X2);
    expect(JSON.parse(kept()!)).toEqual({ runId: "r-a", speed: X2 });
    expect(runSpeed(run)).toBe(X2);
    expect(runSpeed(other)).toBe(X1); // a new run starts at 1X
    for (const bad of ["{", "null", "[]", '{"runId":"r-a","speed":7}', '{"runId":"r-a","speed":1.5}', '{"runId":"r-a"}']) {
      store.setItem(SPEED_KEY, bad);
      expect(runSpeed(run), bad).toBe(X1);
    }
    vi.stubGlobal("localStorage", undefined); // no storage at all: 1X, and a pick holds for its battle only
    expect(runSpeed(run)).toBe(X1);
    expect(() => keepRunSpeed(run, X4)).not.toThrow();
  });

  it("the same fight played at 0.5X, 1X, 2X and 4X, and skipped, gives the same events and the same result", () => {
    const fight = (speed: number, skip = false): Played => {
      store.clear();
      const game = fakeGame(setupRun({ hero: "furnace", day: 8, seed: 21 }));
      const s = new BattleScreen(game);
      s.setSpeed(speed);
      return play(s, skip ? 160 : -1);
    };
    const one = fight(X1);
    expect(one.ev.length).toBeGreaterThan(50);
    expect(one.winner).not.toBeNull();
    for (const [label, p] of [["0.5X", fight(X05)], ["2X", fight(X2)], ["4X", fight(X4)], ["skipped", fight(X2, true)]] as const) {
      expect(p.ev, label).toEqual(one.ev);
      expect(p.winner, label).toBe(one.winner);
      expect(p.ticks, label).toBe(one.ticks);
      expect(p.hp, label).toEqual(one.hp);
      expect(p.stats, label).toEqual(one.stats);
    }
  });

  it("battle 1 at 2X: battle 2 starts at 2X (the bar on 2X before its first step, which runs at 2X); a warlord fight in between keeps it", () => {
    const run = setupRun({ hero: "furnace", day: 3, seed: 5 });
    const game = fakeGame(run);
    const b1 = new BattleScreen(game);
    expect(barSpeed(b1)).toBe(X1); // a new run starts at 1X
    for (let i = 0; i < 200 && b1.phase !== "fight"; i++) b1.update(DT);
    b1.key("3"); // 2X, mid-fight, by its key
    expect(b1.arena.speed).toBe(SPEEDS[X2]);
    const p1 = play(b1);
    expect(p1.speeds.every((v, i) => v === SPEEDS[X2] || i < 2)).toBe(true);
    expect(run.day).toBe(4); // the dusk's result moved the run to its next dawn
    // the next day's road: a warlord fight, then the dusk
    run.stage = "fork";
    expect(pickRoad(run, "hard").ok).toBe(true);
    const w = new BattleScreen(game, "warlord");
    expect(w.kind).toBe("warlord");
    expect(barSpeed(w)).toBe(X2); // the bar on 2X from the first frame
    expect(w.arena.speed).toBe(SPEEDS[X2]);
    const pw = play(w);
    expect(pw.firstStepSpeed).toBe(SPEEDS[X2]); // the fight's first sim step at 2X
    expect(pw.speeds.filter((v) => v === SPEEDS[X2]).length).toBeGreaterThan(10);
    const b2 = new BattleScreen(game);
    expect(b2.kind).toBe("dusk");
    expect(barSpeed(b2)).toBe(X2);
    expect(b2.arena.speed).toBe(SPEEDS[X2]);
    const p2 = play(b2);
    expect(p2.firstStepSpeed).toBe(SPEEDS[X2]);
    // the cycle button is a pick too: 2X -> 4X holds for the next battle
    const b3 = new BattleScreen(game);
    bar(b3).onCycle();
    expect(barSpeed(b3)).toBe(X4);
    expect(barSpeed(new BattleScreen(game))).toBe(X4);
    bar(b3).onSpeed[X05]();
    expect(barSpeed(new BattleScreen(game))).toBe(X05);
  });

  it("a reload keeps it; a battle reloaded mid-run starts at it; a new run starts at 1X; REPLAY starts at 1X and never changes it", () => {
    const run = setupRun({ hero: "weaver", day: 5, seed: 33 });
    const game = fakeGame(run);
    const b1 = new BattleScreen(game);
    b1.key("4"); // 4X in the sail-in
    expect(b1.arena.speed).toBe(SPEEDS[X4]);
    saveRun(run);
    // the page reloads: the run from its save (the same runId), a new screen on it (CONTINUE, or the dusk reloaded)
    const loaded = loadRun()!;
    expect(loaded.runId).toBe(run.runId);
    const again = new BattleScreen(fakeGame(loaded));
    expect(barSpeed(again)).toBe(X4);
    expect(again.arena.speed).toBe(SPEEDS[X4]);
    expect(play(again).firstStepSpeed).toBe(SPEEDS[X4]);
    // a new run: 1X, whatever the last run kept
    const fresh = setupRun({ hero: "weaver", day: 5, seed: 33 });
    expect(fresh.runId).not.toBe(run.runId);
    const nb = new BattleScreen(fakeGame(fresh));
    expect(barSpeed(nb)).toBe(X1);
    expect(nb.arena.speed).toBe(1);
    // REPLAY: its own control, at 1X, its picks kept from the run's
    store.setItem(SPEED_KEY, JSON.stringify({ runId: run.runId, speed: X2 }));
    const r = openReplay(battleRecordFor(run.build, again.foe.build, battleSeed(run)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rp = new ReplayScreen(game, b1, r.battle, { day: run.day, foe: again.foeName });
    expect(rp.speed).toBe(SPEED_1X);
    expect(rp.arena.speed).toBe(1);
    rp.setSpeed(X4);
    expect(JSON.parse(kept()!)).toEqual({ runId: run.runId, speed: X2 });
    expect(barSpeed(new BattleScreen(game))).toBe(X2);
  });

  it("the KO slow-mo, the outro and SKIP keep the picked speed; the intro's timing doesn't change with it", () => {
    const run = setupRun({ hero: "furnace", day: 6, seed: 7 });
    const game = fakeGame(run);
    const a = new BattleScreen(game);
    a.setSpeed(X4);
    const pa = play(a);
    expect(a.arena.speed).toBe(1); // the outro and the card run at 1X, as before
    expect(runSpeed(run)).toBe(X4); // ... and the speed kept is still the pick
    // at 4X kept, the next battle's sail-in and count take as long as at 1X (GO on the same frame)
    store.clear();
    const at1 = play(new BattleScreen(fakeGame(setupRun({ hero: "furnace", day: 6, seed: 7 }))));
    expect(pa.goFrame).toBe(at1.goFrame);
    expect(at1.goFrame).toBe(154);
    // SKIP: the fight resolves at once; the kept speed doesn't change
    const b = new BattleScreen(game);
    expect(barSpeed(b)).toBe(X1); // (the store was cleared above)
    b.setSpeed(X2);
    play(b, 30);
    expect(b.arena.b.over).toBe(true);
    expect(runSpeed(run)).toBe(X2);
  });

  it("the upload payload, the battle record and the saved run are byte-equal with the speed at 1X and at 4X", () => {
    const at = (speed: number) => {
      store.clear();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(1_790_000_000_000)); // the same wall clock for both (the pool's and the profile's stamps)
      const run = setupRun({ hero: "furnace", day: 7, seed: 77 });
      run.runId = "scout1b-speed";
      if (speed !== X1) keepRunSpeed(run, speed); // picked in an earlier battle of the run
      const s = new BattleScreen(fakeGame(run));
      expect(s.arena.speed).toBe(SPEEDS[speed]);
      const seed = battleSeed(run);
      const payload = JSON.stringify(ghostOf(run, 1_000_000, "p-scout1b", null)); // what submitDusk uploads at dusk
      const record = JSON.stringify(battleRecordFor(run.build, s.foe.build, seed, [run.wins, s.foe.record?.wins ?? 0]));
      const p = play(s);
      const keys = [...store.m.keys()].filter((k) => k !== SPEED_KEY).sort();
      vi.useRealTimers();
      return { payload, record, seed, saved: JSON.stringify(run), dawn: JSON.stringify(ghostOf(run, 1_000_000, "p-scout1b", null)), result: [p.winner, p.ticks, p.hp], keys, stored: keys.map((k) => store.getItem(k)) };
    };
    const one = at(X1), four = at(X4);
    expect(four.payload).toBe(one.payload);
    expect(four.record).toBe(one.record);
    expect(four.seed).toBe(one.seed);
    expect(four.result).toEqual(one.result);
    expect(four.saved).toBe(one.saved); // the run (its save) after the fight
    expect(four.dawn).toBe(one.dawn);
    expect(four.keys).toEqual(one.keys);
    expect(four.stored).toEqual(one.stored); // every other key the page wrote (the save, the ghost pool...)
  });
});
