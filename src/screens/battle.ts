// Battle: both cruisers roll into frame, a 3-2-1 countdown, then the fight plays out at the
// chosen speed. A hull break triggers the KO burst, slow-mo and a WIN/LOSE banner, then a
// result card. The battle frames itself at its own integer scale (battleLayout).

import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { drawArena } from "../game/arenaDraw";
import { battleLayout, battleScale, type BattleLayout } from "../game/battleLayout";
import { battleSeed, enemyBuild, finishRound, foeName, saveRun, type RoundResult } from "../game/run";
import { HEROES } from "../sim/content";
import { C } from "../render/palette";
import type { G } from "../render/pixel";
import { drawText } from "../render/font";
import { ArenaBg } from "../render/arenaBg";
import { banner, optionsCard } from "../ui/hud";
import { BuildScreen } from "./build/build";
import { SummaryScreen } from "./summary";
import { TitleScreen } from "./title";
import { SPEEDS, drawBar, drawPlate, drawResult, type BarState } from "./battleHud";

type Phase = "intro" | "fight" | "outro" | "result";
const INTRO = 1.2; // drive-in seconds

export class BattleScreen implements Screen {
  readonly arena: Arena;
  phase: Phase = "intro";
  private pt = 0;
  private result: RoundResult | null = null;
  readonly foeName: string;
  private windBanner = 0;
  private count = 4;
  private speed = 0;
  menu = false;
  L!: BattleLayout;
  private bg = new ArenaBg();
  private clockSec = -1;
  private clockText = "0:00";
  private hpText: [string, string] = ["", ""];
  private hpInt: [number, number] = [-1, -1];
  private bar: BarState;

  constructor(private game: Game) {
    const run = game.run!;
    const foe = enemyBuild(run); // an accepted road challenge brings a warlord from later rounds
    this.foeName = foeName(run);
    run.stage = "battle";
    this.arena = new Arena(run.build, foe, battleSeed(run), game.audio);
    this.arena.off = [60, 260];
    this.bar = {
      speed: 0, compact: false, showSpeeds: true,
      onSpeed: SPEEDS.map((_, i) => () => this.setSpeed(i)),
      onCycle: () => this.setSpeed((this.speed + 1) % SPEEDS.length),
      onSkip: () => this.skip(),
      onMenu: () => { this.menu = true; this.arena.paused = true; },
    };
    this.relayout();
  }

  pickScale(pw: number, ph: number, portrait: boolean): number {
    return battleScale(pw, ph, portrait);
  }

  get toastY(): number {
    return Math.round(this.game.H / 2 - 8);
  }

  enter(): void {
    this.relayout();
    this.game.audio.music("battle");
    this.game.audio.play("horn");
  }

  private bgSpec = { hulls: [] as { x: number; y: number; w: number; h: number }[], vertical: false, gapLine: true };
  private plateR = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
  private onNext = () => this.next();

  private relayout(): void {
    const { W, H, portrait } = this.game;
    if (this.L && this.L.W === W && this.L.H === H && this.L.portrait === portrait) return;
    this.L = battleLayout(W, H, portrait);
    this.arena.setFrames(this.L.frames, this.L.enter);
    this.bgSpec.hulls = this.L.hulls;
    this.bgSpec.vertical = portrait;
  }

  setSpeed(i: number): void {
    this.speed = i;
    this.arena.speed = SPEEDS[i];
  }

  private end(): void {
    const run = this.game.run!;
    const b = this.arena.b;
    this.result = finishRound(run, b.winner ?? -1, b.t, b.sides[0].stats, b.sides[1].stats);
    saveRun(run);
    this.phase = "outro";
    this.pt = 0;
    this.arena.speed = 1;
    this.game.audio.music(null);
  }

  skip(): void {
    if (this.phase === "intro") {
      this.phase = "fight";
      this.arena.off = [0, 0];
      this.arena.syncFrames();
    }
    if (this.phase !== "fight") return;
    for (const e of this.arena.finish()) if (e.type === "end") this.end();
  }

  private next(): void {
    const run = this.game.run!;
    this.game.go(run.over ? new SummaryScreen(this.game) : new BuildScreen(this.game));
  }

  update(dt: number): void {
    this.relayout();
    if (this.menu) return;
    this.pt += dt;
    const a = this.arena;
    if (this.phase === "intro") {
      const k = Math.min(1, this.pt / INTRO);
      const ease = Math.pow(1 - k, 3);
      const prev = a.off[1];
      a.off[0] = Math.round(60 * ease);
      a.off[1] = Math.round(260 * ease);
      a.tread += (prev - a.off[1]) * 0.5;
      a.syncFrames();
      a.update(dt, false);
      const c = 3 - Math.floor((this.pt - INTRO) / 0.45);
      if (this.pt > INTRO && c >= 1 && c < this.count) {
        this.count = c;
        this.game.audio.play("ready");
      }
      if (this.pt >= INTRO + 1.35) {
        this.phase = "fight";
        this.pt = 0;
        a.off = [0, 0];
        a.syncFrames();
        this.game.audio.play("go");
      }
    } else if (this.phase === "fight") {
      const ev = a.update(dt); // reused array, valid until the next update()
      for (let i = 0; i < ev.length; i++) {
        const e = ev[i];
        if (e.type === "windwarn") this.windBanner = 2.4;
        if (e.type === "end" && this.phase === "fight") this.end();
      }
    } else {
      a.update(dt, false);
      if (this.phase === "outro" && this.pt > 2.5) {
        this.phase = "result";
        this.pt = 0;
        const o = this.result?.outcome;
        this.game.audio.play(o === "win" ? "win" : o === "loss" ? "lose" : "ready");
      }
    }
    this.windBanner = Math.max(0, this.windBanner - dt);
  }

  draw(g: G): void {
    const { W, H } = this.game;
    const L = this.L;
    const a = this.arena;
    this.bg.draw(g, W, H, this.bgSpec, this.game.t, a.fx.shakeX, a.fx.shakeY);
    drawArena(g, a, W, H);
    this.drawHud(g);
    const run = this.game.run!;
    const cy = Math.round(H / 2);
    if (this.phase === "intro") {
      const k = Math.min(1, this.pt / 0.35);
      banner(g, W, cy - 16, `ROUND ${run.round}`, C.yellow, `VS ${this.foeName}`, k);
      if (this.pt > INTRO && this.count <= 3) drawText(g, String(this.count), W / 2, cy - 50, C.white, { align: "center", scale: 4, outline: C.ink });
    } else if (this.phase === "fight" && this.pt < 0.7 && Math.floor(this.pt * 10) % 2 === 0) {
      drawText(g, "FIGHT!", W / 2, cy - 11, C.yellow, { align: "center", scale: 3, outline: C.ink });
    }
    if (this.windBanner > 0 && Math.floor(this.windBanner * 6) % 2 === 0) {
      banner(g, W, cy - 16, "DARK WIND", C.plum4, "THE STORM HURTS BOTH HULLS", 1);
    }
    if (this.phase === "outro" && this.result && this.pt > 0.55) {
      const o = this.result.outcome;
      const k = Math.min(1, (this.pt - 0.55) / 0.25);
      banner(g, W, cy - 18, o === "win" ? "VICTORY!" : o === "loss" ? "DEFEAT" : "DRAW", o === "win" ? C.lime : o === "loss" ? C.red : C.bone, o === "win" ? "THEIR HULL BREAKS" : o === "loss" ? "YOUR HULL BREAKS" : undefined, k, 3);
    }
    if (this.phase === "result" && this.result) {
      drawResult(g, this.game, this.result, this.foeName, this.pt, this.game.run!.over ? "SEE THE RUN" : "BACK TO THE CARAVAN", this.onNext);
    }
    if (this.menu) this.drawMenu(g);
  }

  private drawHud(g: G): void {
    const L = this.L;
    const b = this.arena.b;
    for (let s = 0; s < 2; s++) {
      const hp = Math.max(0, Math.ceil(b.sides[s].hull.hp));
      if (hp !== this.hpInt[s]) {
        this.hpInt[s] = hp;
        this.hpText[s] = String(hp);
      }
    }
    // plates ride with their cruiser during the drive-in
    for (let s = 0; s < 2; s++) {
      const p = L.plates[s], r = this.plateR[s];
      r.x = p.x + Math.round(this.arena.enter[s][0] * this.arena.off[s]);
      r.y = p.y + Math.round(this.arena.enter[s][1] * this.arena.off[s]);
      r.w = p.w;
      r.h = p.h;
    }
    drawPlate(g, this.game, this.arena, this.plateR[1], 1, this.foeName, this.hpText[1]);
    drawPlate(g, this.game, this.arena, this.plateR[0], 0, HEROES[this.game.run!.hero].name, this.hpText[0]);
    const sec = Math.floor(b.t);
    if (sec !== this.clockSec) {
      this.clockSec = sec;
      this.clockText = `${Math.floor(sec / 60)}:${sec % 60 < 10 ? "0" : ""}${sec % 60}`;
    }
    const st = this.bar;
    st.speed = this.speed;
    st.compact = L.compact;
    st.showSpeeds = this.phase === "fight" || this.phase === "intro";
    drawBar(g, this.game, this.arena, L.bar, this.clockText, st);
    if (this.arena.paused && !this.menu) drawText(g, "PAUSED", this.game.W / 2, this.game.H / 2 - 30, C.yellow, { align: "center", scale: 2, outline: C.ink });
  }

  private drawMenu(g: G): void {
    const close = () => { this.menu = false; this.arena.paused = false; };
    optionsCard(this.game, g, "PAUSED", [
      { id: "resume", label: "RESUME", primary: true, onTap: close },
      { id: "quit", label: "SAVE & QUIT", onTap: () => { saveRun(this.game.run); this.game.go(new TitleScreen(this.game)); } },
    ], close);
  }

  /** Deck-area rectangle in CSS px, its share of the short viewport axis, and the open floor
   *  between the bows: logical px, CSS px and share of the firing axis (metrics). */
  deckMetrics(): {
    rect: { x: number; y: number; w: number; h: number }; share: number; longShare: number;
    gap: { logical: number; css: number; share: number };
  } {
    const v = this.game.view, k = v.scale / v.dpr;
    const d = this.L.deckArea;
    const cw = window.innerWidth, ch = window.innerHeight;
    const r = { x: d.x * k, y: d.y * k, w: d.w * k, h: d.h * k };
    const portrait = ch > cw;
    const gapCss = this.L.gap * k;
    return {
      rect: r, share: portrait ? r.w / cw : r.h / ch, longShare: portrait ? r.h / ch : r.w / cw,
      gap: { logical: this.L.gap, css: +gapCss.toFixed(2), share: +(gapCss / (this.L.portrait ? ch : cw)).toFixed(4) },
    };
  }

  key(k: string): void {
    if (k === "1" || k === "2" || k === "3") this.setSpeed(Number(k) - 1);
    else if (k === "s" || k === "S") this.skip();
    else if (k === "Escape") {
      this.menu = !this.menu;
      this.arena.paused = this.menu;
    } else if (k === " " && this.phase !== "result") this.arena.paused = !this.arena.paused;
    else if ((k === "Enter" || k === " ") && this.phase === "result" && this.pt > 0.35) this.next();
  }
}
