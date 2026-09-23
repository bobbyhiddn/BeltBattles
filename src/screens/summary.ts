// Run summary: the campaign is over (7 wins, or out of lives). Shows the round-by-round
// record and totals, then offers a new run.

import type { Game, Screen } from "../game/game";
import { saveRun, type Run } from "../game/run";
import { HEROES } from "../sim/content";
import { Fx } from "../render/fx";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText } from "../render/font";
import { drawCruiser, drawGround, hullRect } from "../render/world";
import { button, panel } from "../ui/ui";
import { HeroScreen } from "./hero";
import { TitleScreen } from "./title";

export class SummaryScreen implements Screen {
  private run: Run;
  private t = 0;
  private fx = new Fx();

  constructor(private game: Game) {
    this.run = game.run!;
  }

  enter(): void {
    saveRun(null);
    this.game.audio.music(null);
    this.game.audio.play(this.run.over === "won" ? "win" : "lose");
  }

  update(dt: number): void {
    this.t += dt;
    this.fx.update(dt);
    const hr = hullRect(0);
    if (this.run.over !== "won" && Math.random() < dt * 6) {
      this.fx.smoke(hr.x + 20 + Math.random() * 100, hr.y + 30 + Math.random() * 90, 2, true, 16);
      if (Math.random() < 0.3) this.fx.embers(hr.x + 30 + Math.random() * 80, hr.y + 60, 3);
    }
    if (this.run.over === "won" && Math.random() < dt * 2) {
      this.fx.sparkle(hr.x + Math.random() * 144, hr.y + Math.random() * 148);
    }
  }

  draw(g: G): void {
    const { W, H, portrait, ui } = this.game;
    const run = this.run;
    const won = run.over === "won";
    const w = Math.min(W - 12, 220), h = 136;
    const x = portrait ? Math.round(W / 2 - w / 2) : Math.round(W * 0.64 - w / 2);
    const y = portrait ? Math.max(Math.round(H * 0.28) + 90, H - h - 8) : Math.round(H / 2 - h / 2);
    // the cruiser sits centred in the free space above the card (portrait) or beside it
    const ox = Math.round(portrait ? W / 2 : W * 0.28), oy = Math.round(portrait ? y / 2 - 94 : H / 2 - 94);
    const scroll = won ? this.t * 24 : 0;
    drawGround(g, ox, oy, W, H, scroll);
    drawCruiser(g, { side: 0, build: run.build, t: this.t, treadPhase: won ? this.t * 24 : 0, dimAll: !won }, ox, oy);
    this.fx.draw(g, ox, oy);

    panel(g, { x, y, w, h }, "raised");
    drawText(g, won ? "RUN COMPLETE!" : "CRUISER LOST", x + w / 2, y + 6, won ? C.lime : C.red, { align: "center", scale: 2, outline: C.ink });
    const hero = HEROES[run.hero];
    drawText(g, `${hero.name} · ${run.wins} WINS · ${run.losses} LOSSES`, x + w / 2, y + 23, C.bone, { font: "3", align: "center" });
    // round-by-round record
    const pip = 14;
    const n = run.history.length;
    const rx = Math.round(x + w / 2 - (n * pip) / 2);
    run.history.forEach((r, i) => {
      const c = r.outcome === "win" ? C.lime : r.outcome === "loss" ? C.red : C.slate3;
      rect(g, rx + i * pip, y + 34, pip - 2, 12, C.ink);
      rect(g, rx + i * pip + 1, y + 35, pip - 4, 10, c);
      drawText(g, r.outcome === "win" ? "W" : r.outcome === "loss" ? "L" : "D", rx + i * pip + 6, y + 37, C.ink, { font: "3", align: "center" });
    });
    const dmg = run.history.reduce((s, r) => s + r.player.damage, 0);
    const shots = run.history.reduce((s, r) => s + r.player.shots, 0);
    const best = run.history.reduce((m, r) => Math.max(m, r.player.damage), 0);
    const rows: [string, string][] = [
      ["ROUNDS FOUGHT", String(n)],
      ["TOTAL DAMAGE", String(Math.round(dmg))],
      ["BEST ROUND", String(Math.round(best))],
      ["SHOTS FIRED", String(shots)],
      ["GOLD LEFT", String(run.gold)],
    ];
    rows.forEach(([k, v], i) => {
      drawText(g, k, x + 12, y + 54 + i * 9, C.slate4, { font: "3" });
      drawText(g, v, x + w - 12, y + 54 + i * 9, C.white, { font: "3", align: "right" });
    });
    button(ui, g, "again", { x: x + 10, y: y + h - 29, w: w / 2 - 14, h: 21 }, "NEW RUN", {
      primary: true, onTap: () => { this.game.run = null; this.game.go(new HeroScreen(this.game)); },
    });
    button(ui, g, "title", { x: x + w / 2 + 4, y: y + h - 29, w: w / 2 - 14, h: 21 }, "TITLE", {
      onTap: () => { this.game.run = null; this.game.go(new TitleScreen(this.game)); },
    });
  }

  key(k: string): void {
    if (k === "Enter" || k === " ") {
      this.game.run = null;
      this.game.go(new HeroScreen(this.game));
    }
  }
}
