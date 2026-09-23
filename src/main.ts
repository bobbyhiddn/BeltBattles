// Entry point: boots the game shell on #game and exposes a small hook for tooling
// (screenshots / smoke tests / metrics): window.bb.open("build", "furnace").

import { Game } from "./game/game";
import { newRun } from "./game/run";
import { beginRoad, makeEvent } from "./game/events";
import type { EventId } from "./game/eventDefs";
import type { HeroId } from "./sim/content";
import { settings, setReducedMotion } from "./core/settings";
import { VERSION } from "./version";
import { addGhosts, clearPool, pinClassicFoe, playOut, setupRun, type GhostSpec, type RunSpec } from "./tooling";
import { loadPool } from "./game/ghosts";
import { deckCost, maxGoldByDay } from "./sim/rivals";
import type { Build } from "./sim/deck";
import { TitleScreen } from "./screens/title";
import { HeroScreen } from "./screens/hero";
import { BuildScreen } from "./screens/build/build";
import { BattleScreen } from "./screens/battle";
import { SummaryScreen } from "./screens/summary";
import { EventScreen } from "./screens/event/event";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) throw new Error("#game canvas missing");
const game = new Game(canvas, (g) => new TitleScreen(g));
game.start();

(window as unknown as { bb: unknown }).bb = {
  game,
  settings,
  setReducedMotion,
  version: VERSION,
  open(screen: string, hero: HeroId = "furnace", seed = 12345): void {
    if (screen === "title") return game.go(new TitleScreen(game));
    if (screen === "hero") return game.go(new HeroScreen(game));
    game.run = game.run ?? newRun(hero, seed);
    if (screen === "build") return game.go(new BuildScreen(game));
    if (screen === "battle") {
      pinClassicFoe(game.run); // same opponent as 0.5.0's battle shots and metrics
      return game.go(new BattleScreen(game));
    }
    if (screen === "event") {
      beginRoad(game.run); // day 1 always has its intro event
      return game.go(new EventScreen(game));
    }
    if (screen === "summary") {
      game.run = playOut({ hero, seed, results: "WLWLDLLL" }); // 5 losses: RUN LOST on day 8
      return game.go(new SummaryScreen(game));
    }
  },
  /** Open a specific road event (shots): day, gold, lives and one cargo part set up first. */
  openEvent(id: EventId, o: { hero?: HeroId; seed?: number; round?: number; day?: number; gold?: number; lives?: number; cargo?: string } = {}): void {
    const run = newRun(o.hero ?? "furnace", o.seed ?? 12345);
    run.day = o.day ?? o.round ?? 3;
    run.gold = o.gold ?? 9;
    run.lives = o.lives ?? 2;
    if (o.cargo) run.inventory.push({ uid: run.nextUid++, def: o.cargo });
    run.event = makeEvent(run.seed, run.day, id);
    run.stage = "event";
    game.run = run;
    game.go(new EventScreen(game));
  },
  /** 0.6.0 tooling: the ghost pool, a run at a given dawn, a dusk vs the pool, a played-out run. */
  clearPool,
  addGhosts: (specs: GhostSpec[]) => addGhosts(specs),
  poolSize: () => loadPool().length,
  /** M3b: what a deck costs (= buildCost) and the gold a player can have by a day's dusk. */
  deckCost: (b: Build) => deckCost(b).total,
  maxGoldByDay: (day: number) => maxGoldByDay(day),
  setupRun(o: RunSpec = {}): void {
    game.run = setupRun(o);
  },
  openDawn(o: RunSpec = {}, ghosts: GhostSpec[] = []): void {
    clearPool();
    addGhosts(ghosts);
    game.run = setupRun(o);
    game.go(new BuildScreen(game));
  },
  openDusk(o: RunSpec = {}, ghosts: GhostSpec[] = []): void {
    clearPool();
    addGhosts(ghosts);
    game.run = setupRun(o);
    game.go(new BattleScreen(game));
  },
  openEnd(o: RunSpec & { results: string }, ghosts: GhostSpec[] = []): void {
    clearPool();
    addGhosts(ghosts);
    game.run = playOut(o);
    game.go(new SummaryScreen(game));
  },
  /** Current screen name (for harness assertions). */
  screen(): string {
    const s = game.screen;
    return s instanceof TitleScreen ? "title" : s instanceof HeroScreen ? "hero" : s instanceof BuildScreen ? "build"
      : s instanceof BattleScreen ? "battle" : s instanceof SummaryScreen ? "summary" : s instanceof EventScreen ? "event" : "?";
  },
  /** Logical -> CSS pixel factor and the UI regions of the last frame. */
  regions(): { id: string; x: number; y: number; w: number; h: number }[] {
    const k = game.view.scale / game.view.dpr;
    const r = game.canvas.getBoundingClientRect();
    return game.ui.regions.map((q) => ({ id: q.id, x: r.left + q.r.x * k, y: r.top + q.r.y * k, w: q.r.w * k, h: q.r.h * k }));
  },
  /** Logical point -> CSS client point. */
  toClient(x: number, y: number): { x: number; y: number } {
    const k = game.view.scale / game.view.dpr;
    const r = game.canvas.getBoundingClientRect();
    return { x: r.left + x * k, y: r.top + y * k };
  },
};
