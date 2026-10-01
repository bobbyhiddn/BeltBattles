// 0.7.0a M4 (REQ-BFG-016; decision D6): a stored dusk record replayed in the battle view, read-only. The same arena,
// layout, plates and playback bar as the dusk (0.5X-4X, SKIP, pause), a REPLAY · DAY n banner, then the result and
// BACK to the screen it came from (the run summary). It plays the Battle openReplay(record) made (replayBattle: a
// fresh Battle under this build's rules), so the fight is the stored one bit for bit; it never touches the run: no
// save, no dusk result, no ghost, no new pick.

import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { drawArena } from "../game/arenaDraw";
import { battleLayout, battleScale, type BattleLayout } from "../game/battleLayout";
import type { Battle } from "../sim/battle";
import { HEROES, RUN_DAYS } from "../sim/content";
import { C } from "../render/palette";
import type { G } from "../render/pixel";
import { drawText } from "../render/font";
import { ArenaBg } from "../render/arenaBg";
import { banner } from "../ui/hud";
import { button, panel } from "../ui/ui";
import { SPEEDS, SPEED_1X, drawBar, drawPlate, type BarState } from "./battleHud";

export class ReplayScreen implements Screen {
  readonly arena: Arena;
  L!: BattleLayout;
  speed = SPEED_1X;
  /** The replayed fight has ended (its result shows). */
  over = false;
  private pt = 0;
  private left = false;
  private bg = new ArenaBg();
  private bar: BarState;
  private bgSpec = { hulls: [] as { x: number; y: number; w: number; h: number }[], vertical: false, gapLine: true };
  private plateR = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
  private hp: [string, string] = ["", ""];
  private readonly heroName: string;

  constructor(private game: Game, private back: Screen, battle: Battle, private label: { day: number; foe: string }) {
    const [mine, theirs] = battle.record.builds;
    this.arena = new Arena(mine, theirs, battle.record.seed, game.audio, battle);
    this.arena.off = [0, 0];
    this.heroName = HEROES[mine.hero].name;
    this.bar = {
      speed: this.speed, compact: false, showSpeeds: true, paused: false,
      onSpeed: SPEEDS.map((_, i) => () => this.setSpeed(i)),
      onCycle: () => this.setSpeed((this.speed + 1) % SPEEDS.length),
      onSkip: () => this.skip(),
      onPause: () => this.togglePause(),
    };
    this.relayout();
  }

  pickScale(pw: number, ph: number, portrait: boolean): number {
    return battleScale(pw, ph, portrait);
  }

  enter(): void {
    this.relayout();
    this.game.audio.music("battle");
  }

  private relayout(): void {
    const { W, H, portrait } = this.game;
    if (this.L && this.L.W === W && this.L.H === H && this.L.portrait === portrait) return;
    this.L = battleLayout(W, H, portrait);
    this.arena.setFrames(this.L.frames, this.L.enter);
    this.bgSpec.hulls = this.L.hulls;
    this.bgSpec.vertical = portrait;
  }

  setSpeed(i: number): void {
    this.speed = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.arena.speed = SPEEDS[this.speed];
  }

  togglePause(): void {
    if (this.over) return;
    this.arena.paused = !this.arena.paused;
  }

  skip(): void {
    if (this.over) return;
    this.arena.paused = false;
    for (const e of this.arena.finish()) if (e.type === "end") this.end();
  }

  private end(): void {
    this.over = true;
    this.pt = 0;
    this.arena.speed = 1;
    this.game.audio.music(null);
  }

  /** Back to where the replay was opened. Nothing to save: a replay changes no run state (D6). */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.game.go(this.back);
  }

  update(dt: number): void {
    this.relayout();
    this.pt += dt;
    if (this.arena.paused) return;
    if (!this.over) {
      const ev = this.arena.update(dt);
      for (let i = 0; i < ev.length; i++) if (ev[i].type === "end" && !this.over) this.end();
      if (this.arena.b.over && !this.over) this.end();
    } else this.arena.update(dt, false);
  }

  draw(g: G): void {
    const { W, H, ui } = this.game;
    const a = this.arena, b = a.b;
    this.bg.draw(g, W, H, this.bgSpec, this.game.t, a.fx.shakeX, a.fx.shakeY);
    drawArena(g, a, W, H);
    for (let s = 0; s < 2; s++) {
      this.hp[s] = String(Math.max(0, Math.ceil(b.sides[s].hull.hp)));
      const p = this.L.plates[s], r = this.plateR[s];
      r.x = p.x; r.y = p.y; r.w = p.w; r.h = p.h;
    }
    drawPlate(g, this.game, a, this.plateR[1], 1, this.label.foe, this.hp[1]);
    drawPlate(g, this.game, a, this.plateR[0], 0, this.heroName, this.hp[0]);
    const sec = Math.floor(b.t);
    const st = this.bar;
    st.speed = this.speed;
    st.compact = this.L.compact;
    st.paused = this.arena.paused;
    st.showSpeeds = !this.over;
    drawBar(g, this.game, a, this.L.bar, `${Math.floor(sec / 60)}:${sec % 60 < 10 ? "0" : ""}${sec % 60}`, st);
    const cy = Math.round(H / 2);
    if (!this.over && this.pt < 1.6) banner(g, W, cy - 16, `REPLAY · DAY ${this.label.day}/${RUN_DAYS}`, C.ice, `VS ${this.label.foe}`, Math.min(1, this.pt / 0.35));
    drawText(g, "REPLAY", 4, 4, C.ice, { font: "3", outline: C.ink });
    if (this.over && this.pt > 0.6) {
      const won = b.winner === 0, lost = b.winner === 1;
      const w = Math.min(W - 10, 150), h = 52;
      const x = Math.round(W / 2 - w / 2), y = cy - Math.round(h / 2);
      panel(g, { x, y, w, h }, "raised");
      drawText(g, won ? "WIN" : lost ? "LOSS" : "DRAW", W / 2, y + 6, won ? C.lime : lost ? C.red : C.bone, { align: "center", scale: 2, outline: C.ink });
      drawText(g, `REPLAY · DAY ${this.label.day} · ${b.t.toFixed(1)}S`, W / 2, y + 23, C.slate4, { font: "3", align: "center" });
      button(ui, g, "replayback", { x: x + 10, y: y + h - 19, w: w - 20, h: 15 }, "BACK", { primary: true, onTap: () => this.leave() });
    } else {
      button(ui, g, "replayleave", { x: W - 38, y: 2, w: 36, h: 12 }, "BACK", { font: "3", onTap: () => this.leave() });
    }
  }

  key(k: string): void {
    if (k >= "1" && k <= "4" && k.length === 1) this.setSpeed(Number(k) - 1);
    else if (k === "s" || k === "S") this.skip();
    else if (k === "Escape" || ((k === "Enter" || k === " ") && this.over)) this.leave();
    else if (k === " " || k === "p" || k === "P") this.togglePause();
  }
}
