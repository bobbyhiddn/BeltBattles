// Battle: the enemy warlord drives in, a 3-2-1 countdown, then the fight plays out at the
// chosen speed. A result card reports what happened and the round's income.

import { drawBanner, type Game, type Screen } from "../game/game";
import { Arena } from "../game/arena";
import { battleSeed, enemyBuild, finishRound, saveRun, type RoundResult } from "../game/run";
import { warlordName } from "../sim/ai";
import { HEROES, RUN_LIVES, RUN_WINS, WIND_START } from "../sim/content";
import type { Side, SideState } from "../sim/battle";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText } from "../render/font";
import { heartIcon } from "../render/sprites";
import { button, panel, type Rect } from "../ui/ui";
import { BuildScreen } from "./build/build";
import { SummaryScreen } from "./summary";

type Phase = "intro" | "fight" | "outro" | "result";
const SPEEDS = [1, 2, 4];

export class BattleScreen implements Screen {
  private arena: Arena;
  private phase: Phase = "intro";
  private pt = 0;
  private result: RoundResult | null = null;
  private foeName: string;
  private windBanner = 0;
  private count = 4;
  private speed = 0;
  private shown: [number, number];

  constructor(private game: Game) {
    const run = game.run!;
    const foe = enemyBuild(run);
    this.foeName = warlordName(foe.hero, run.round);
    this.arena = new Arena(run.build, foe, battleSeed(run), game.audio);
    this.arena.offY = [0, -230];
    this.shown = [this.arena.b.sides[0].hull.hp, this.arena.b.sides[1].hull.hp];
  }

  get toastY(): number {
    return this.game.H / 2 - 8;
  }

  enter(): void {
    this.game.audio.music("battle");
    this.game.audio.play("horn");
  }

  private setSpeed(i: number): void {
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

  private skip(): void {
    if (this.phase === "intro") {
      this.phase = "fight";
      this.arena.offY[1] = 0;
    }
    if (this.phase !== "fight") return;
    for (const e of this.arena.finish()) if (e.type === "end") this.end();
  }

  private next(): void {
    const run = this.game.run!;
    this.game.go(run.over ? new SummaryScreen(this.game) : new BuildScreen(this.game));
  }

  update(dt: number): void {
    this.pt += dt;
    const a = this.arena;
    if (this.phase === "intro") {
      const k = Math.min(1, this.pt / 1.1);
      a.offY[1] = Math.round(-230 * Math.pow(1 - k, 3));
      a.update(dt, false);
      const c = 3 - Math.floor((this.pt - 1.1) / 0.5);
      if (this.pt > 1.1 && c >= 1 && c < this.count) {
        this.count = c;
        this.game.audio.play("ready");
      }
      if (this.pt >= 2.6) {
        this.phase = "fight";
        this.pt = 0;
        a.offY[1] = 0;
        this.game.audio.play("go");
      }
    } else if (this.phase === "fight") {
      for (const e of a.update(dt)) {
        if (e.type === "windwarn") this.windBanner = 2.4;
        if (e.type === "end" && this.phase === "fight") this.end();
      }
    } else {
      a.update(dt, false);
      if (this.phase === "outro" && this.pt > 2.0) {
        this.phase = "result";
        this.pt = 0;
        const o = this.result?.outcome;
        this.game.audio.play(o === "win" ? "win" : o === "loss" ? "lose" : "ready");
      }
    }
    this.windBanner = Math.max(0, this.windBanner - dt);
    for (const s of [0, 1] as Side[]) {
      const hp = Math.max(0, a.b.sides[s].hull.hp);
      this.shown[s] = hp >= this.shown[s] ? hp : Math.max(hp, this.shown[s] - dt * Math.max(20, (this.shown[s] - hp) * 3));
    }
  }

  draw(g: G): void {
    const { W, H } = this.game;
    const run = this.game.run!;
    const ox = Math.round(W / 2), oy = Math.round(H / 2);
    this.arena.draw(g, ox, oy, W, H);
    this.drawHud(g);
    if (this.phase === "intro") {
      const k = Math.min(1, this.pt / 0.35);
      drawBanner(g, W, oy - 15, `ROUND ${run.round}`, C.yellow, `VS ${this.foeName}`, k);
      if (this.pt > 1.1 && this.count <= 3) {
        drawText(g, String(this.count), ox, oy - 60, C.white, { align: "center", scale: 4, outline: C.ink });
      }
    } else if (this.phase === "fight" && this.pt < 0.7 && Math.floor(this.pt * 10) % 2 === 0) {
      drawText(g, "FIGHT!", ox, oy - 12, C.yellow, { align: "center", scale: 3, outline: C.ink });
    }
    if (this.windBanner > 0 && Math.floor(this.windBanner * 6) % 2 === 0) {
      drawBanner(g, W, oy - 15, "DARK WIND", C.plum4, "THE STORM HURTS BOTH HULLS - FINISH IT", 1);
    }
    if (this.phase === "outro" && this.result) {
      const o = this.result.outcome;
      const k = Math.min(1, this.pt / 0.3);
      drawBanner(g, W, oy - 15, o === "win" ? "VICTORY!" : o === "loss" ? "DEFEAT" : "DRAW", o === "win" ? C.lime : o === "loss" ? C.red : C.bone, undefined, k);
    }
    if (this.phase === "result") this.drawResult(g);
  }

  private hpBar(g: G, x: number, y: number, w: number, s: SideState, side: Side, color: string): void {
    const max = s.hull.max;
    rect(g, x, y, w, 7, C.ink);
    const iw = w - 2;
    const fs = Math.max(0, Math.min(1, this.shown[side] / max));
    const fa = Math.max(0, Math.min(1, s.hull.hp / max));
    rect(g, x + 1, y + 1, Math.round(iw * fs), 5, C.white);
    rect(g, x + 1, y + 1, Math.round(iw * fa), 5, fa < 0.3 && Math.floor(this.game.t * 6) % 2 ? C.red : color);
    rect(g, x + 1, y + 1, Math.round(iw * fa), 1, C.white);
    g.globalAlpha = 0.35;
    for (let i = 4; i < iw; i += 4) rect(g, x + 1 + i, y + 1, 1, 5, C.ink);
    g.globalAlpha = 1;
  }

  private sideHud(g: G, r: Rect, side: Side, name: string): void {
    const s = this.arena.b.sides[side];
    panel(g, r, "glass");
    const col = side === 0 ? C.lime : C.red;
    drawText(g, name, r.x + 4, r.y + 3, side === 0 ? C.white : C.red, { font: "3" });
    const hp = Math.max(0, Math.ceil(s.hull.hp));
    drawText(g, `${hp}/${s.hull.max}`, r.x + r.w - 4, r.y + 3, C.bone, { font: "3", align: "right" });
    this.hpBar(g, r.x + 4, r.y + 10, r.w - 8, s, side, col);
    const tags: string[] = [];
    if (s.hull.fray > 0) tags.push(`FRAY ${s.hull.fray}`);
    const burn = s.hull.burns.reduce((n, q) => n + q.dps, 0);
    if (burn > 0) tags.push(`BURN ${burn}/S`);
    if (tags.length) drawText(g, tags.join(" · "), r.x + 4, r.y + 19, C.fire3, { font: "3" });
  }

  private drawHud(g: G): void {
    const { W, H, portrait, ui } = this.game;
    const run = this.game.run!;
    const b = this.arena.b;
    const me = HEROES[run.hero].name;
    let speedAt: { x: number; y: number };
    if (portrait) {
      this.sideHud(g, { x: 3, y: 3, w: W - 6, h: 27 }, 1, this.foeName);
      this.sideHud(g, { x: 3, y: H - 30, w: W - 96, h: 27 }, 0, me);
      speedAt = { x: W - 91, y: H - 27 };
    } else {
      const w = Math.min(190, Math.round(W / 2 - 96));
      this.sideHud(g, { x: 6, y: 6, w, h: 27 }, 1, this.foeName);
      this.sideHud(g, { x: 6, y: H - 33, w, h: 27 }, 0, me);
      speedAt = { x: W - 94, y: H - 27 };
    }
    const mm = Math.floor(b.t / 60), ss = Math.floor(b.t % 60);
    const clock = `${mm}:${ss < 10 ? "0" : ""}${ss}`;
    const cy = Math.round(H / 2 - 3);
    if (this.phase !== "result") {
      drawText(g, clock, 5, cy, b.t >= WIND_START ? C.plum4 : C.bone, { outline: C.ink });
      if (b.t >= WIND_START) drawText(g, `WIND ${b.windDps()}/S`, 5, cy + 9, C.plum4, { font: "3", outline: C.ink });
    }
    if (this.phase === "fight" || this.phase === "intro") {
      SPEEDS.forEach((sp, i) => {
        button(ui, g, `sp${i}`, { x: speedAt.x + i * 21, y: speedAt.y, w: 20, h: 21 }, `${sp}X`, {
          font: "3", active: this.speed === i, onTap: () => this.setSpeed(i),
        });
      });
      button(ui, g, "skip", { x: speedAt.x + 64, y: speedAt.y, w: 25, h: 21 }, "SKIP", { font: "3", onTap: () => this.skip() });
    }
    if (this.arena.paused) drawText(g, "PAUSED", W / 2, H / 2 - 30, C.yellow, { align: "center", scale: 2, outline: C.ink });
  }

  private drawResult(g: G): void {
    const { W, H, ui } = this.game;
    const run = this.game.run!;
    const r = this.result!;
    const w = Math.min(W - 12, 214), h = 148; // hugs the stats, wins row and button
    const x = Math.round(W / 2 - w / 2), y = Math.round(H / 2 - h / 2);
    const k = Math.min(1, this.pt / 0.25);
    g.globalAlpha = 0.55 * k;
    rect(g, 0, 0, W, H, C.ink);
    g.globalAlpha = 1;
    const yy = y + Math.round((1 - k) * 30);
    panel(g, { x, y: yy, w, h }, "raised");
    ui.add({ id: "resultbg", r: { x: 0, y: 0, w: W, h: H }, block: true });
    const title = r.outcome === "win" ? "VICTORY!" : r.outcome === "loss" ? "DEFEAT" : "DRAW";
    const tc = r.outcome === "win" ? C.lime : r.outcome === "loss" ? C.red : C.bone;
    drawText(g, title, W / 2, yy + 6, tc, { align: "center", scale: 2, outline: C.ink });
    drawText(g, `ROUND ${r.round} · ${r.time.toFixed(1)}S VS ${this.foeName}`, W / 2, yy + 23, C.slate4, { font: "3", align: "center" });
    const p = r.player, e = r.enemy;
    const idle = (s: typeof p) => `${Math.round((s.idle / Math.max(0.001, s.turretTime)) * 100)}%`;
    const rows: [string, string, string][] = [
      ["DAMAGE DEALT", String(Math.round(p.damage)), String(Math.round(e.damage))],
      ["SHOTS", String(p.shots), String(e.shots)],
      ["FIRST SHOT", p.firstShot < 0 ? "NEVER" : `${p.firstShot.toFixed(1)}S`, e.firstShot < 0 ? "NEVER" : `${e.firstShot.toFixed(1)}S`],
      ["GUNS IDLE", idle(p), idle(e)],
      ["JAMS", String(p.jams), String(e.jams)],
      ["BURN DAMAGE", String(Math.round(p.burnDealt)), String(Math.round(e.burnDealt))],
    ];
    let ry = yy + 34;
    drawText(g, "YOU", x + w - 64, ry, C.lime, { font: "3", align: "right" });
    drawText(g, "FOE", x + w - 10, ry, C.red, { font: "3", align: "right" });
    ry += 8;
    for (const [label, a, bb] of rows) {
      drawText(g, label, x + 10, ry, C.slate4, { font: "3" });
      drawText(g, a, x + w - 64, ry, C.white, { font: "3", align: "right" });
      drawText(g, bb, x + w - 10, ry, C.bone, { font: "3", align: "right" });
      ry += 8;
    }
    ry += 4;
    drawText(g, `INCOME +${r.income}G`, x + 10, ry, C.yellow);
    for (let i = 0; i < RUN_LIVES; i++) g.drawImage(heartIcon(i < run.lives), x + w - 12 - (RUN_LIVES - i) * 7, ry + 1);
    ry += 11;
    drawText(g, "WINS", x + 10, ry + 1, C.slate4, { font: "3" });
    for (let i = 0; i < RUN_WINS; i++) rect(g, x + 30 + i * 6, ry, 5, 6, i < run.wins ? C.lime : C.ink);
    const label = run.over ? "SEE THE RUN" : "BACK TO THE CARAVAN";
    if (this.pt > 0.35) button(ui, g, "next", { x: x + 10, y: yy + h - 27, w: w - 20, h: 21 }, label, { primary: true, onTap: () => this.next() });
  }

  key(k: string): void {
    if (k === "1" || k === "2" || k === "3") this.setSpeed(Number(k) - 1);
    else if (k === "s" || k === "S") this.skip();
    else if (k === " " && this.phase !== "result") this.arena.paused = !this.arena.paused;
    else if ((k === "Enter" || k === " ") && this.phase === "result" && this.pt > 0.35) this.next();
  }
}
