// Entry point: boots the game shell on #game and exposes a small hook for tooling
// (screenshots / smoke tests / metrics): window.bb.open("build", "furnace").

import { Game } from "./game/game";
import { newRun } from "./game/run";
import { gainModule } from "./game/fuse";
import { beginRoad, makeEvent } from "./game/events";
import type { EventId } from "./game/eventDefs";
import { ITEMS, buyableModules, type HeroId } from "./sim/content";
import { FUSE_MAX, fusible } from "./sim/stars";
import { settings, setReducedMotion } from "./core/settings";
import { VERSION } from "./version";
import { addGhosts, clearPool, pinClassicFoe, playOut, setupFork, setupRun, setupWarlord, showcaseRun, type GhostSpec, type RunSpec } from "./tooling";
import { ForkScreen } from "./screens/fork/fork";
import { forkFor } from "./game/road";
import type { Difficulty } from "./sim/rivals";
import { loadPool, standInFoe } from "./game/ghosts";
import { deckCost, maxGoldByDay } from "./sim/rivals";
import type { Build } from "./sim/deck";
import { TitleScreen } from "./screens/title";
import { HeroScreen } from "./screens/hero";
import { BuildScreen } from "./screens/build/build";
import { BattleScreen } from "./screens/battle";
import { SummaryScreen } from "./screens/summary";
import { EventScreen } from "./screens/event/event";
import type { Arena } from "./game/arena";

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
    if (o.cargo) gainModule(run, o.cargo); // 0.6.1a: tooling gains go through gainModule too
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
  /** 0.6.2 BELTSIDE: a showcase deck (tooling.ts SHOWCASE) in the build screen or a dusk battle vs `foe`. */
  openShowcase(name: string, screen: "build" | "battle" = "build", o: RunSpec & { foe?: string } = {}): void {
    clearPool();
    game.run = showcaseRun(name, o);
    game.go(screen === "battle" ? new BattleScreen(game) : new BuildScreen(game));
  },
  openDusk(o: RunSpec = {}, ghosts: GhostSpec[] = []): void {
    clearPool();
    addGhosts(ghosts);
    game.run = setupRun(o);
    game.go(new BattleScreen(game));
  },
  openEnd(o: RunSpec & { results: string; roads?: string }, ghosts: GhostSpec[] = []): void {
    clearPool();
    addGhosts(ghosts);
    game.run = playOut(o);
    game.go(new SummaryScreen(game));
  },
  /** 0.6.0b: the road fork at a day's dawn (matriarchBeatenOn for R3). */
  openFork(o: RunSpec & { matriarchBeatenOn?: number; bounty?: boolean; sabotage?: boolean } = {}, ghosts: GhostSpec[] = []): void {
    clearPool();
    addGhosts(ghosts);
    game.run = setupFork(o);
    game.go(new ForkScreen(game));
  },
  /** 0.6.0b: a warlord fight picked at the fork; with `outcome` its result card (0 win, 1 loss). */
  openWarlord(tier: Difficulty, o: RunSpec & { matriarchBeatenOn?: number; outcome?: 0 | 1 | -1 } = {}): void {
    clearPool();
    game.run = setupWarlord(tier, o);
    game.go(new BattleScreen(game, "warlord"));
  },
  /** The run's stand-in captain for each day 1-10 and its deck's deckCost against maxGoldByDay;
   *  0.6.2 TUNE-C: the deck is the captain's named build, standInBuild (pool: false; 0.6.0d-0.6.2 it
   *  was the stand-in pool's pick, pool: true, floor = ceil(0.9 x budget)). */
  standInSpend(runSeed: number) {
    return Array.from({ length: 10 }, (_, i) => {
      const f = standInFoe(runSeed, i + 1), budget = maxGoldByDay(i + 1);
      return {
        day: i + 1, name: f.name, hero: f.hero, pool: false, hull: f.build.hullBonus,
        cost: deckCost(f.build).total, floor: Math.ceil(0.9 * budget), budget,
      };
    });
  },
  /** 0.6.0b: today's fork and the dusk foe it leads to, for the scripted-run log. */
  forkInfo() {
    const run = game.run;
    if (!run) return null;
    const f = forkFor(run);
    return { day: run.day, event: f.event, warlords: f.warlords, road: run.road, warlord: run.warlord, lives: run.lives, gold: run.gold, matriarchBeatenOn: run.matriarchBeatenOn };
  },
  /** 0.6.0c metrics: restart the current screen's arena effects RNG at `seed` (cosmetic, never
   *  the sim's), so a measured shake repeats exactly. False when the screen has no arena. */
  seedFx(seed: number): boolean {
    const a = (game.screen as unknown as { arena?: Arena }).arena;
    a?.fx.reseed(seed);
    return !!a;
  },
  /** 0.6.2t (REQ-BFG-032): the buyable modules (buyableModules()) and each supply: id, name, kind and top star, for
   *  the ability-text contact sheet (scripts/contact-sheet.mjs). Read only; a module the catalogue adds shows up here. */
  catalogue(): { id: string; name: string; kind: string; stars: number; merchant: string; price: number }[] {
    return [...buyableModules(), ...Object.values(ITEMS).filter((d) => d.kind === "supply" && d.price > 0)]
      .map((d) => ({ id: d.id, name: d.name, kind: d.kind, stars: fusible(d.id) ? FUSE_MAX : 1, merchant: d.merchant ?? "ironmonger", price: d.price }));
  },
  /** Current screen name (for harness assertions). */
  screen(): string {
    const s = game.screen;
    return s instanceof TitleScreen ? "title" : s instanceof HeroScreen ? "hero" : s instanceof BuildScreen ? "build"
      : s instanceof BattleScreen ? (s.kind === "warlord" ? "warlord" : "battle") : s instanceof SummaryScreen ? "summary"
      : s instanceof EventScreen ? "event" : s instanceof ForkScreen ? "fork" : "?";
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
