// Entry point: boots the game shell on #game and exposes a small hook for tooling
// (screenshots / smoke tests / metrics): window.bb.open("build", "furnace").

import { Game } from "./game/game";
import { newRun } from "./game/run";
import type { HeroId } from "./sim/content";
import { settings, setReducedMotion } from "./core/settings";
import { TitleScreen } from "./screens/title";
import { HeroScreen } from "./screens/hero";
import { BuildScreen } from "./screens/build/build";
import { BattleScreen } from "./screens/battle";
import { SummaryScreen } from "./screens/summary";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) throw new Error("#game canvas missing");
const game = new Game(canvas, (g) => new TitleScreen(g));
game.start();

(window as unknown as { bb: unknown }).bb = {
  game,
  settings,
  setReducedMotion,
  version: "0.4.0",
  open(screen: string, hero: HeroId = "furnace", seed = 12345): void {
    if (screen === "title") return game.go(new TitleScreen(game));
    if (screen === "hero") return game.go(new HeroScreen(game));
    game.run = game.run ?? newRun(hero, seed);
    if (screen === "build") return game.go(new BuildScreen(game));
    if (screen === "battle") return game.go(new BattleScreen(game));
    if (screen === "summary") {
      game.run.over = "lost";
      return game.go(new SummaryScreen(game));
    }
  },
  /** Current screen name (for harness assertions). */
  screen(): string {
    const s = game.screen;
    return s instanceof TitleScreen ? "title" : s instanceof HeroScreen ? "hero" : s instanceof BuildScreen ? "build"
      : s instanceof BattleScreen ? "battle" : s instanceof SummaryScreen ? "summary" : "?";
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
