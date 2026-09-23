// Entry point: boots the game shell on #game and exposes a small hook for tooling
// (screenshots / smoke tests): window.bb.open("build", "furnace").

import { Game } from "./game/game";
import { newRun } from "./game/run";
import type { HeroId } from "./sim/content";
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
};
