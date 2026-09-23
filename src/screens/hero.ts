// Hero select: a carousel of the two cruisers. The preview runs the real simulation on
// the hero's starting build (against a silent dummy) so belts, slugs and turrets move.

import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { drawArena } from "../game/arenaDraw";
import { newRun, saveRun } from "../game/run";
import { startingBuild } from "../sim/ai";
import { AMMO, HEROES, ITEMS, type HeroId } from "../sim/content";
import { C, FACTION } from "../render/palette";
import { frame, rect, type G } from "../render/pixel";
import { drawText, wrap } from "../render/font";
import { HULL_A, HULL_L, frameForHull, hullBox } from "../render/frame";
import { ArenaBg } from "../render/arenaBg";
import { button, panel, para } from "../ui/ui";
import { BuildScreen } from "./build/build";
import { TitleScreen } from "./title";

const ORDER: HeroId[] = ["furnace", "weaver"];

export class HeroScreen implements Screen {
  private i = 0;
  private arena!: Arena;
  private t = 0;
  private swipe: { x: number; y: number } | null = null;
  private slide = 0; // carousel slide-in offset
  private bg = new ArenaBg();

  constructor(private game: Game) {
    this.preview();
  }

  private preview(): void {
    const id = ORDER[this.i];
    const foe: HeroId = id === "furnace" ? "weaver" : "furnace";
    const dummy = { ...startingBuild(foe, 1), routes: [] };
    this.arena = new Arena(startingBuild(id, 1), dummy, 77 + this.i, null);
    this.arena.quiet = true;
    this.arena.show = [true, false];
  }

  private shift(d: number): void {
    this.i = (this.i + d + ORDER.length) % ORDER.length;
    this.slide = d * 40;
    this.game.audio.play("whoosh");
    this.preview();
  }

  private choose(): void {
    const id = ORDER[this.i];
    const run = newRun(id, (Math.random() * 0x7fffffff) | 0);
    this.game.run = run;
    saveRun(run);
    this.game.audio.play("horn");
    this.game.go(new BuildScreen(this.game));
  }

  update(dt: number): void {
    this.t += dt;
    this.slide *= Math.pow(0.001, dt);
    this.arena.update(dt);
    if (this.arena.b.t > 18 || this.arena.b.over) this.preview();
  }

  draw(g: G): void {
    const { W, H, portrait, ui } = this.game;
    const game = this.game;
    rect(g, 0, 0, W, H, C.night);
    const id = ORDER[this.i];
    const h = HEROES[id];
    const P = FACTION[h.faction];
    drawText(g, "CHOOSE YOUR CRUISER", W / 2, 6, C.bone, { align: "center", outline: C.ink });

    const infoW = portrait ? W - 16 : Math.min(240, W - Math.round(W * 0.56) - 10);
    const blurbLines = h.blurb.reduce((n, ln) => n + wrap(ln, infoW).length, 0);
    const infoH = 93 + blurbLines * 9;
    const pw = Math.min(W - 16, HULL_A + 30);
    const ph = portrait ? Math.max(HULL_L + 14, Math.min(HULL_L + 60, H - 20 - 14 - infoH - 45 - 14)) : HULL_L + 30;
    const px0 = portrait ? Math.round(W / 2 - pw / 2) : Math.round(W * 0.3 - pw / 2);
    const py0 = portrait ? 20 : Math.round(H / 2 - ph / 2 + 6);
    rect(g, px0 - 2, py0 - 2, pw + 4, ph + 4, C.ink);
    frame(g, px0 - 1, py0 - 1, pw + 2, ph + 2, P.trim2);
    g.save();
    g.beginPath();
    g.rect(px0, py0, pw, ph);
    g.clip();
    // the cruiser, bow up, parked on a pad; the dummy target sits far above the window
    const hx0 = Math.round(px0 + pw / 2 - HULL_A / 2), hy = Math.round(py0 + (ph - HULL_L) / 2 + 3);
    const hx = hx0 + Math.round(this.slide);
    const pf = frameForHull(0, hx, hy);
    this.arena.setFrames([pf, frameForHull(2, hx, hy - 400)], [[0, 1], [0, -1]]);
    this.bg.draw(g, W, H, { hulls: [hullBox(frameForHull(0, hx0, hy))], vertical: true, gapLine: false, pad: { x: hx0 - 6, y: hy - 6, w: HULL_A + 12, h: HULL_L + 12 } }, this.t);
    drawArena(g, this.arena, W, H);
    g.restore();
    button(ui, g, "prev", { x: px0 - 2, y: py0 + ph / 2 - 12, w: 16, h: 24 }, "<", { onTap: () => this.shift(-1) });
    button(ui, g, "next", { x: px0 + pw - 14, y: py0 + ph / 2 - 12, w: 16, h: 24 }, ">", { onTap: () => this.shift(1) });
    ui.add({ id: "swipe", r: { x: px0 + 16, y: py0, w: pw - 32, h: ph }, onDown: (x, y) => { this.swipe = { x, y }; } });
    ORDER.forEach((_, k) => rect(g, px0 + pw / 2 - 6 + k * 8, py0 + ph + 5, 5, 3, k === this.i ? C.yellow : C.slate2));

    const ix = portrait ? 8 : Math.round(W * 0.56);
    const iw = infoW;
    let iy = portrait ? py0 + ph + 14 : py0;
    drawText(g, h.factionName, ix, iy, P.trim2, { font: "3" });
    iy += 8;
    drawText(g, h.name, ix, iy, C.white, { scale: 2 });
    iy += 18;
    drawText(g, `PLAYSTYLE: ${h.pattern}`, ix, iy, C.yellow, { font: "3" });
    iy += 9;
    iy += para(g, h.blurb, ix, iy, iw, C.bone, "5", 2) + 4;
    const fac = ITEMS[h.factory];
    const turrets = `${h.turrets.length} ${h.turrets[0].kind.toUpperCase()} TURRET${h.turrets.length > 1 ? "S" : ""}`;
    const stats: [string, string][] = [["HULL", String(h.hull)], ["BELT", `${h.belt} TILES`], ["GUNS", turrets], ["FACTORY", `${fac.name} · ${AMMO[h.ammo].name}`]];
    panel(g, { x: ix, y: iy, w: iw, h: stats.length * 9 + 8 }, "inset");
    stats.forEach(([k, v], n) => {
      drawText(g, k, ix + 5, iy + 5 + n * 9, C.slate4, { font: "3" });
      drawText(g, v, ix + 44, iy + 5 + n * 9, C.white, { font: "3" });
    });
    iy += stats.length * 9 + 14;
    const bw = Math.min(iw, 150);
    const bx = portrait ? Math.round(W / 2 - bw / 2) : ix;
    const by = portrait ? Math.max(iy, H - 54) : iy;
    button(ui, g, "go", { x: bx, y: by, w: bw, h: 24 }, `COMMAND ${h.name}`, { primary: true, onTap: () => this.choose() });
    button(ui, g, "back", { x: portrait ? Math.round(W / 2 - 30) : bx, y: by + 29, w: 60, h: 16 }, "BACK", {
      font: "3", onTap: () => game.go(new TitleScreen(game)),
    });
    game.soundButton(g, { x: W - 30, y: 4, w: 26, h: 13 });
  }

  move(x: number): void {
    if (!this.swipe) return;
    const dx = x - this.swipe.x;
    if (Math.abs(dx) > 28) {
      this.shift(dx < 0 ? 1 : -1);
      this.swipe = null;
    }
  }

  up(): void {
    this.swipe = null;
  }

  key(k: string): void {
    if (k === "ArrowLeft" || k === "a") this.shift(-1);
    else if (k === "ArrowRight" || k === "d") this.shift(1);
    else if (k === "Enter" || k === " ") this.choose();
    else if (k === "Escape") this.game.go(new TitleScreen(this.game));
  }
}
