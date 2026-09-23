// Title: a live AI-vs-AI battle rolls behind the logo (attract mode) in the same framing
// as the real fight, with New Run, Continue, a how-to-play card and the options menu.

import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { drawArena } from "../game/arenaDraw";
import { arenaIn } from "../game/battleLayout";
import { loadRun } from "../game/run";
import { startingBuild, warlordBuild } from "../sim/ai";
import { HEROES, type HeroId } from "../sim/content";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth, wrap } from "../render/font";
import { titleArt } from "../render/sprites";
import { ArenaBg } from "../render/arenaBg";
import { button, panel, para } from "../ui/ui";
import { optionsCard } from "../ui/hud";
import { HeroScreen } from "./hero";
import { BuildScreen } from "./build/build";

const HELP = [
  "1  BUY GATES FROM THE CARAVAN CARDS.",
  "2  DRAG OUT OF YOUR FACTORY TO LAY BELT TO A TURRET INTAKE.",
  "3  DROP GATES ON THE BELT: BURN, SHOCK, SPLIT, SPEED UP OR SLOW DOWN.",
  "4  LONGER CINDER ROUTES COOK HOTTER SLUGS. THREAD HITS FRAY ARMOR.",
  "5  PRESS FIGHT. YOUR CRUISER BATTLES ON ITS OWN.",
  "6  WIN 7 BATTLES BEFORE YOU LOSE 3.",
];

export class TitleScreen implements Screen {
  private arena!: Arena;
  private n = 0;
  private overT = 0;
  help = false;
  private menu = false;
  private t = 0;
  private bg = new ArenaBg();
  private save = loadRun();
  private layoutKey = "";
  private hulls: { x: number; y: number; w: number; h: number }[] = [];

  constructor(private game: Game) {
    this.newArena();
  }

  private newArena(): void {
    const heroes: HeroId[] = ["furnace", "weaver"];
    const me = heroes[this.n % 2], foe = heroes[(this.n + 1) % 2];
    this.arena = new Arena(startingBuild(me, 1), warlordBuild(foe, 2 + (this.n % 4)), 1000 + this.n * 7919, null);
    this.arena.quiet = true;
    this.arena.b.sides[0].hull.hp += 60; // keep the attract fight going a while
    this.n++;
    this.overT = 0;
    this.layoutKey = "";
  }

  enter(): void {
    this.game.audio.music(null);
    this.save = loadRun();
  }

  private place(): void {
    const { W, H, portrait } = this.game;
    const k = `${W}x${H}${portrait}`;
    if (k === this.layoutKey) return;
    this.layoutKey = k;
    const top = portrait ? 60 : Math.round(H * 0.08) + 40;
    const panelH = this.save ? 90 : 62;
    const a = arenaIn({ x: 0, y: top, w: W, h: Math.max(160, H - top - panelH - 14) }, portrait, portrait ? 28 : 48);
    this.arena.setFrames(a.frames, portrait ? [[0, 1], [0, -1]] : [[-1, 0], [1, 0]]);
    this.hulls = a.hulls;
  }

  update(dt: number): void {
    this.t += dt;
    this.place();
    this.arena.update(dt);
    if (this.arena.b.over && (this.overT += dt) > 3.2) this.newArena();
  }

  draw(g: G): void {
    const { W, H, portrait, ui } = this.game;
    const game = this.game;
    this.place();
    this.bg.draw(g, W, H, { hulls: this.hulls, vertical: portrait, gapLine: true }, this.t, this.arena.fx.shakeX, this.arena.fx.shakeY);
    drawArena(g, this.arena, W, H);
    g.globalAlpha = 0.45;
    rect(g, 0, 0, W, H, C.ink);
    g.globalAlpha = 1;

    // logo band (a dark strip keeps it legible when the attract battle runs underneath)
    const art = titleArt("BELTBATTLES", (gg, s, x, yy, c) => drawText(gg, s, x, yy, c), (s) => textWidth(s));
    const ly = portrait ? 22 : Math.max(8, Math.round(H * 0.08));
    g.globalAlpha = 0.7;
    rect(g, 0, ly - 6, W, 44, C.ink);
    g.globalAlpha = 1;
    rect(g, 0, ly - 6, W, 1, C.slate1);
    rect(g, 0, ly + 37, W, 1, C.slate1);
    if (art.width + 6 <= W) g.drawImage(art, Math.round(W / 2 - art.width / 2), ly);
    else drawText(g, "BELTBATTLES", W / 2, ly + 4, C.fire3, { align: "center", scale: 2, outline: C.ink });
    drawText(g, "BUILD BELTS · COOK AMMO · BREAK HULLS", W / 2, ly + 30, C.bone, { font: "3", align: "center", outline: C.ink });

    // command panel
    const save = this.save;
    const bw = Math.min(W - 24, 132), bh = 22;
    const ph = 10 + bh + 6 + (save ? bh + 12 : 0) + (bh - 4) + 8;
    const px = Math.round(W / 2 - (bw + 16) / 2), py = portrait ? H - ph - 10 : H - ph - Math.max(8, Math.round(H * 0.05));
    panel(g, { x: px, y: py, w: bw + 16, h: ph }, "dark");
    let by = py + 8;
    const bx = px + 8;
    button(ui, g, "new", { x: bx, y: by, w: bw, h: bh }, "NEW RUN", { primary: true, onTap: () => game.go(new HeroScreen(game)) });
    by += bh + 6;
    if (save) {
      button(ui, g, "cont", { x: bx, y: by, w: bw, h: bh + 6 }, "CONTINUE", {
        sub: `ROUND ${save.round} · ${HEROES[save.hero].name} · ${save.wins}W ${save.losses}L`,
        onTap: () => this.continueRun(),
      });
      by += bh + 12;
    }
    const hw = Math.floor((bw - 4) / 2);
    button(ui, g, "help", { x: bx, y: by, w: hw, h: bh - 4 }, this.help ? "CLOSE" : "HOW TO PLAY", {
      font: "3", active: this.help, onTap: () => { this.help = !this.help; },
    });
    button(ui, g, "options", { x: bx + hw + 4, y: by, w: bw - hw - 4, h: bh - 4 }, "OPTIONS", { font: "3", onTap: () => { this.menu = true; } });
    game.soundButton(g, { x: W - 30, y: 4, w: 26, h: 13 });
    drawText(g, "V0.4.1", W - 4, H - 8, C.slate3, { font: "3", align: "right" });
    if (this.help) this.drawHelp(g);
    if (this.menu) optionsCard(game, g, "OPTIONS", [{ id: "optdone", label: "DONE", primary: true, onTap: () => { this.menu = false; } }], () => { this.menu = false; });
  }

  private drawHelp(g: G): void {
    const { W, H } = this.game;
    const w = Math.min(W - 16, 300);
    const x = Math.round((W - w) / 2);
    const rows = HELP.reduce((n, ln) => n + wrap(ln, w - 16, "3").length, 0);
    const h = 20 + rows * 7 + HELP.length * 3 + 5;
    const y = Math.round(Math.max(20, H / 2 - h / 2));
    panel(g, { x, y, w, h }, "raised");
    drawText(g, "HOW TO PLAY", W / 2, y + 6, C.yellow, { align: "center" });
    let yy = y + 20;
    for (const ln of HELP) yy += para(g, [ln], x + 8, yy, w - 16, C.bone, "3", 2) + 3;
    this.game.ui.add({ id: "helpcard", r: { x, y, w, h }, onTap: () => { this.help = false; } });
  }

  private continueRun(): void {
    const run = loadRun();
    if (!run) return;
    this.game.run = run;
    this.game.go(new BuildScreen(this.game));
  }

  key(k: string): void {
    if (k === "Escape") {
      this.help = false;
      this.menu = false;
    } else if (this.menu) return;
    else if (k === "Enter" || k === " ") this.game.go(new HeroScreen(this.game));
    else if (k === "c" || k === "C") this.continueRun();
    else if (k === "h" || k === "H" || k === "?") this.help = !this.help;
  }
}
