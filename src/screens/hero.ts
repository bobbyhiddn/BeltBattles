// Hero select: a carousel of the cruisers. The preview runs the real simulation on
// the hero's starting build (against a silent dummy) so belts, slugs and turrets move.
// 0.8.0 H1 (REQ-BFG-011, REQ-BFG-032): every playable hero (PLAYABLE_HEROES: FURNACE, WEAVER, FOUNDRY, BASTION), each with
// its portrait beside its name and its trick in one plain sentence built from the real values (abilityText.ts heroTrick).

import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { drawArena } from "../game/arenaDraw";
import { newRun, saveRun } from "../game/run";
import { AMMO, HEROES, ITEMS, type HeroId } from "../sim/content";
import { turretSlots } from "../sim/deck"; // 0.6.2s (REQ-BFG-031)
import { PLAYABLE_HEROES, heroStartBuild } from "../sim/heroBuilds";
import { C, FACTION } from "../render/palette";
import { frame, rect, type G } from "../render/pixel";
import { drawText, wrap } from "../render/font";
import { HULL_A, HULL_L, frameForHull, hullBox } from "../render/frame";
import { ArenaBg } from "../render/arenaBg";
import { portraitImage, type PortraitHero } from "../render/portraits";
import { heroTrick } from "../ui/abilityText";
import { heroFace, heroPlaystyle, ruleSpans } from "../ui/faces"; // U2a (REQ-BFG-046): a TEXT hero's face
import { colourize, drawRich, wrapRich } from "../ui/richText"; // U2a: the face wraps with the number rule (font.ts wrap has none)
import { button, panel, para } from "../ui/ui";
import { BuildScreen } from "./build/build";
import { TitleScreen } from "./title";

/** The carousel's heroes, in roster order (tests and tooling read it). */
export const ORDER: readonly HeroId[] = PLAYABLE_HEROES;
/** The portrait's side (24x24 at 1x, framed in ink and the faction's trim). */
const PORTRAIT = 24;
/** Text column height beside the portrait: faction (8) + name (18) + playstyle (9). */
const HEAD_H = 35;

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
    // 0.8.0 H1: heroStartBuild, the run's own start deck for every hero (ai.ts startingBuild knows FURNACE and WEAVER only)
    const dummy = { ...heroStartBuild(foe, 1), routes: [] };
    this.arena = new Arena(heroStartBuild(id, 1), dummy, 77 + this.i, null);
    this.arena.quiet = true;
    this.arena.show = [true, false];
  }

  /** Tooling (bb.hero()): the hero on show and the roster. */
  get current(): HeroId {
    return ORDER[this.i];
  }

  /** Tooling: show hero `id` (no slide-in, no sound). */
  showHero(id: HeroId): boolean {
    const k = ORDER.indexOf(id);
    if (k < 0) return false;
    this.i = k;
    this.slide = 0;
    this.preview();
    return true;
  }

  private shift(d: number): void {
    this.i = (this.i + d + ORDER.length) % ORDER.length;
    this.slide = d * 40;
    this.game.audio.play("whoosh");
    this.preview();
  }

  choose(): void {
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
    // 0.8.0 H1: the trick sentence (3x5 face, 7 px a line) replaces the catalogue blurb; the head is the portrait's height
    const trick = heroTrick(id);
    // U2a (REQ-BFG-046, R1 C6): a TEXT hero's ability is its face: the rule in 5x7 (9 px a line, its trigger label in
    // brass) and the keyword's dim 3x5 reminder (7 px a line); Y1: FURNACE's too, two lines (it kept the trick sentence;
    // a hero without a face still does)
    const face = heroFace(id);
    const faceRule = face ? face.rules.flatMap((r) => wrapRich(ruleSpans(r.text, r.label, C.bone), infoW, "5")) : [];
    const faceRem = face ? face.reminders.flatMap((r) => wrapRich(colourize(r, C.slate4, C.slate4), infoW, "3")) : [];
    const trickLines = face ? 0 : wrap(trick, infoW, "3").length;
    const infoH = 93 + 9 + trickLines * 7 + faceRule.length * 9 + faceRem.length * 7; // 0.6.2s: + the SLOTS row (the head beside the portrait is HEAD_H, as before)
    const pw = Math.min(W - 16, HULL_A + 30);
    const ph = portrait ? Math.max(HULL_L + 14, Math.min(HULL_L + 100, H - 20 - 14 - infoH - 54 - 14)) : HULL_L + 30;
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
    // 0.8.0 H1: the hero's portrait, framed in ink and its faction's trim, with the faction, name and playstyle beside it
    rect(g, ix, iy, PORTRAIT + 2, PORTRAIT + 2, C.ink);
    frame(g, ix - 1, iy - 1, PORTRAIT + 4, PORTRAIT + 4, P.trim1);
    g.drawImage(portraitImage(id as PortraitHero), ix + 1, iy + 1);
    const tx = ix + PORTRAIT + 7;
    drawText(g, h.factionName, tx, iy, P.trim2, { font: "3" });
    drawText(g, h.name, tx, iy + 8, C.white, { scale: 2 });
    drawText(g, `PLAYSTYLE: ${heroPlaystyle(id)}`, tx, iy + 26, C.yellow, { font: "3" });
    iy += HEAD_H;
    if (face) {
      // U2a: the face's rule lines, then its reminder
      for (const ln of faceRule) iy += (drawRich(g, ln, ix, iy, "5"), 9);
      for (const ln of faceRem) iy += (drawRich(g, ln, ix, iy, "3"), 7);
      iy += 4;
    } else iy += para(g, [trick], ix, iy, iw, C.bone, "3", 2) + 4;
    const fac = ITEMS[h.factory];
    // 0.6.2s (REQ-BFG-031 S1, S10): the hull's TURRET SLOTS with no build: its starting turrets and the empty slot
    const slots = turretSlots({ hero: id });
    const guns = slots.filter((s) => s.td);
    const turrets = `${guns.length} ${guns[0].td!.kind.toUpperCase()} TURRET${guns.length > 1 ? "S" : ""}`;
    const empty = slots.length - guns.length;
    const stats: [string, string][] = [["HULL", String(h.hull)], ["BELT", `${h.belt} TILES`], ["GUNS", turrets],
      ["SLOTS", `${slots.length} TURRET SLOTS, ${empty} EMPTY`], ["FACTORY", `${fac.name}, ${AMMO[h.ammo].name}`]]; // U2b F7: no middle dot
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
