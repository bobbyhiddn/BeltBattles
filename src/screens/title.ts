// Title: a live AI-vs-AI battle rolls behind the logo (attract mode), with New Run,
// Continue, a how-to-play card and the sound toggle.

import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { loadRun } from "../game/run";
import { startingBuild, warlordBuild } from "../sim/ai";
import { HEROES, RULES_VERSION, type HeroId } from "../sim/content";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth, wrap } from "../render/font";
import { titleArt } from "../render/sprites";
import { hullRect } from "../render/world";
import { button, panel, para, type Rect } from "../ui/ui";
import { HeroScreen } from "./hero";
import { BuildScreen } from "./build/build";

const HELP = [
  "1  BUY GATES FROM THE CARAVAN WAGONS.",
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
  private help = false;
  private t = 0;

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
  }

  private save = loadRun();

  enter(): void {
    this.game.audio.music(null);
    this.save = loadRun();
  }

  update(dt: number): void {
    this.t += dt;
    this.arena.update(dt);
    if (this.arena.b.over && (this.overT += dt) > 2.8) this.newArena();
  }

  draw(g: G): void {
    const { W, H } = this.game;
    const game = this.game;
    this.arena.draw(g, Math.round(W / 2), Math.round(H / 2), W, H);
    // vignette bands for legibility
    g.globalAlpha = 0.35;
    rect(g, 0, 0, W, H, C.ink);
    g.globalAlpha = 1;

    const save = this.save;
    const bw = 124, bh = 22;
    const stackH = bh + 6 + (save ? bh + 12 : 0) + (bh - 4);
    const L = this.layout(stackH, bw);
    for (const r of L.backs) panel(g, r, "glass");
    this.drawTitle(g, L.logoX, L.logoY);
    drawText(g, "BUILD BELTS · COOK AMMO · BREAK HULLS", L.logoX, L.logoY + 30, C.bone, { font: "3", align: "center", outline: C.ink });

    const bx = Math.round(L.btnX - bw / 2);
    let by = L.btnY;
    button(game.ui, g, "new", { x: bx, y: by, w: bw, h: bh }, "NEW RUN", {
      primary: true, onTap: () => game.go(new HeroScreen(game)),
    });
    by += bh + 6;
    if (save) {
      button(game.ui, g, "cont", { x: bx, y: by, w: bw, h: bh + 6 }, "CONTINUE", {
        sub: `ROUND ${save.round} · ${HEROES[save.hero].name} · ${save.wins}W ${save.losses}L`,
        onTap: () => this.continueRun(),
      });
      by += bh + 12;
    }
    button(game.ui, g, "help", { x: bx, y: by, w: bw, h: bh - 4 }, this.help ? "CLOSE" : "HOW TO PLAY", {
      font: "3", active: this.help, onTap: () => { this.help = !this.help; },
    });
    game.soundButton(g, { x: W - 30, y: 4, w: 26, h: 13 });
    drawText(g, RULES_VERSION.toUpperCase(), W - 4, H - 8, C.slate3, { font: "3", align: "right" });

    if (this.help) this.drawHelp(g);
  }

  private logo(): HTMLCanvasElement {
    return titleArt("BELTBATTLES", (gg, s, x, yy, c) => drawText(gg, s, x, yy, c), (s) => textWidth(s));
  }

  /**
   * Put the logo and the button stack where the attract battle leaves room: the side
   * columns in landscape, the strips above/below the cruisers in portrait. When a strip
   * is too small (short phones, narrow windows) the group gets a glass backing instead.
   */
  private layout(stackH: number, bw: number): { logoX: number; logoY: number; btnX: number; btnY: number; backs: Rect[] } {
    const { W, H } = this.game;
    const hull = hullRect(0);
    const halfW = -hull.x + 12; // hull plus treads and side studs
    const reach = hull.y + hull.h + 6; // centre line to the far end of a hull
    const logoW = this.logo().width;
    const backs: Rect[] = [];
    if (!this.game.portrait) {
      const side = Math.floor(W / 2 - halfW);
      if (side >= logoW + 8 && side >= bw + 12) {
        const colL = Math.round(side / 2);
        return { logoX: colL, logoY: Math.round(H / 2 - 34), btnX: W - colL, btnY: Math.round(H / 2 - stackH / 2), backs };
      }
    }
    const free = Math.round(H / 2 - reach);
    const block = 40; // logo (25) + gap + tagline
    // cramped screens: start below the sound button so the two never overlap
    const logoY = free >= block + 8 ? Math.round((free - block) / 2) + 2 : 23;
    if (free < block + 8) backs.push({ x: 4, y: logoY - 5, w: W - 8, h: block + 8 });
    const roomy = free >= stackH + 12;
    const btnY = roomy ? Math.round(H - free + (free - stackH) / 2) : Math.round(H - stackH - 16);
    if (!roomy) backs.push({ x: Math.round(W / 2 - bw / 2 - 6), y: btnY - 6, w: bw + 12, h: stackH + 12 });
    return { logoX: Math.round(W / 2), logoY, btnX: Math.round(W / 2), btnY, backs };
  }

  private drawTitle(g: G, cx: number, y: number): void {
    const art = this.logo();
    if (art.width + 6 <= this.game.W) {
      g.drawImage(art, Math.round(cx - art.width / 2), y);
    } else {
      drawText(g, "BELTBATTLES", cx, y + 4, C.fire3, { align: "center", scale: 2, outline: C.ink });
    }
  }

  private drawHelp(g: G): void {
    const { W, H } = this.game;
    const w = Math.min(W - 16, 300);
    const x = Math.round((W - w) / 2);
    const lines = HELP;
    const rows = lines.reduce((n, ln) => n + wrap(ln, w - 16, "3").length, 0);
    const h = 20 + rows * 7 + lines.length * 3 + 5;
    const y = Math.round(Math.max(20, H / 2 - h / 2));
    panel(g, { x, y, w, h }, "raised");
    drawText(g, "HOW TO PLAY", W / 2, y + 6, C.yellow, { align: "center" });
    let yy = y + 20;
    for (const ln of lines) yy += para(g, [ln], x + 8, yy, w - 16, C.bone, "3", 2) + 3;
    this.game.ui.add({ id: "helpcard", r: { x, y, w, h }, onTap: () => { this.help = false; } });
  }

  private continueRun(): void {
    const run = loadRun();
    if (!run) return;
    this.game.run = run;
    this.game.go(new BuildScreen(this.game));
  }

  key(k: string): void {
    if (k === "Enter" || k === " ") this.game.go(new HeroScreen(this.game));
    else if (k === "c" || k === "C") this.continueRun();
    else if (k === "h" || k === "H" || k === "?") this.help = !this.help;
    else if (k === "Escape") this.help = false;
  }
}
