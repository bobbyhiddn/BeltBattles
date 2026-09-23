// Run summary: the campaign is over (7 wins, or out of lives). Shows the round-by-round
// record and totals beside the cruiser (smoking wreck or rolling victor), then offers a new run.

import type { Game, Screen } from "../game/game";
import { saveRun, type Run } from "../game/run";
import { HEROES } from "../sim/content";
import { Fx } from "../render/fx";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText } from "../render/font";
import { HULL_A, HULL_L, frameForHull, hullBox } from "../render/frame";
import { cruiserModel, drawDim, drawHull, drawTurrets, type CruiserView } from "../render/cruiser";
import { drawMachinery } from "../render/machinery";
import { ArenaBg } from "../render/arenaBg";
import { button, panel } from "../ui/ui";
import { HeroScreen } from "./hero";
import { TitleScreen } from "./title";

export class SummaryScreen implements Screen {
  private run: Run;
  private t = 0;
  private fx = new Fx();
  private bg = new ArenaBg();
  private view: CruiserView;

  constructor(private game: Game) {
    this.run = game.run!;
    this.view = {
      side: 0, build: this.run.build, model: cruiserModel(this.run.build), frame: frameForHull(0, 0, 0), t: 0, tread: 0,
    };
  }

  enter(): void {
    saveRun(null);
    this.game.audio.music(null);
    this.game.audio.play(this.run.over === "won" ? "win" : "lose");
  }

  private layout(): { card: { x: number; y: number; w: number; h: number }; hx: number; hy: number } {
    const { W, H, portrait } = this.game;
    const w = Math.min(W - 12, 220), h = 136;
    const x = portrait ? Math.round(W / 2 - w / 2) : Math.round(W * 0.66 - w / 2);
    const y = portrait ? Math.max(HULL_L + 30, H - h - 10) : Math.round(H / 2 - h / 2);
    const hx = Math.round(portrait ? W / 2 - HULL_A / 2 : W * 0.28 - HULL_A / 2);
    const hy = Math.round(portrait ? Math.max(8, (y - HULL_L) / 2) : H / 2 - HULL_L / 2);
    return { card: { x, y, w, h }, hx, hy };
  }

  update(dt: number): void {
    this.t += dt;
    this.fx.update(dt);
    const { hx, hy } = this.layout();
    const hb = hullBox(frameForHull(0, hx, hy));
    if (this.run.over !== "won" && Math.random() < dt * 7) {
      this.fx.smoke(hb.x + 20 + Math.random() * (hb.w - 40), hb.y + 20 + Math.random() * (hb.h - 40), 2, true, 16);
      if (Math.random() < 0.3) this.fx.embers(hb.x + 30 + Math.random() * (hb.w - 60), hb.y + 60, 3);
    }
    if (this.run.over === "won" && Math.random() < dt * 3) this.fx.sparkle(hb.x + Math.random() * hb.w, hb.y + Math.random() * hb.h);
  }

  draw(g: G): void {
    const { W, H, ui } = this.game;
    const run = this.run;
    const won = run.over === "won";
    const { card, hx, hy } = this.layout();
    const v = this.view;
    v.frame = frameForHull(0, hx, hy);
    v.t = this.t;
    v.tread = won ? this.t * 20 : 0;
    this.bg.draw(g, W, H, { hulls: [hullBox(v.frame)], vertical: true, gapLine: false, pad: { x: hx - 6, y: hy - 6, w: HULL_A + 12, h: HULL_L + 12 } }, this.t);
    drawHull(g, v);
    drawMachinery(g, v);
    drawTurrets(g, v);
    if (!won) drawDim(g, v, 0.55);
    this.fx.draw(g, 0, 0);
    const { x, y, w, h } = card;
    panel(g, card, "raised");
    drawText(g, won ? "RUN COMPLETE!" : "CRUISER LOST", x + w / 2, y + 6, won ? C.lime : C.red, { align: "center", scale: 2, outline: C.ink });
    const hero = HEROES[run.hero];
    drawText(g, `${hero.name} · ${run.wins} WINS · ${run.losses} LOSSES`, x + w / 2, y + 23, C.bone, { font: "3", align: "center" });
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
      ["ROUNDS FOUGHT", String(n)], ["TOTAL DAMAGE", String(Math.round(dmg))], ["BEST ROUND", String(Math.round(best))],
      ["SHOTS FIRED", String(shots)], ["GOLD LEFT", String(run.gold)],
    ];
    rows.forEach(([k, val], i) => {
      drawText(g, k, x + 12, y + 54 + i * 9, C.slate4, { font: "3" });
      drawText(g, val, x + w - 12, y + 54 + i * 9, C.white, { font: "3", align: "right" });
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
