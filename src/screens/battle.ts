// Dusk battle: both cruisers roll into frame, a 3-2-1 countdown, then the fight plays out at the
// chosen speed. A hull break triggers the KO burst, slow-mo and a WIN/LOSE banner, then the dusk
// result card. 0.6.0: dusk starts when this screen is made: today's ghost (or stand-in) is picked
// once, stored in the run and saved, so a reload fights the same one. After the fight the
// player's own snapshot joins the local ghost pool. The battle frames itself (battleLayout).

import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { drawArena } from "../game/arenaDraw";
import { battleLayout, battleScale, type BattleLayout } from "../game/battleLayout";
import { battleSeed, saveRun, type DayResult, type DuskFoe, type WarlordFight } from "../game/run";
import { finishDay, ghostOf, startDusk } from "../game/day";
import { loadPool, saveGhost } from "../game/ghosts";
import { finishWarlord, pickPending, takePart, todaysWarlord, warlordSeed } from "../game/road";
import { HEROES, RUN_DAYS } from "../sim/content";
import { C } from "../render/palette";
import type { G } from "../render/pixel";
import { TIER_COLOR, TIER_LABEL, drawPortrait, nameColor, tag } from "../ui/captain";
import { drawWarlordResult, type WarlordActions } from "./warlordHud";
import { drawText, textWidth } from "../render/font";
import { ArenaBg } from "../render/arenaBg";
import { banner, optionsCard } from "../ui/hud";
import { button, panel } from "../ui/ui";
import { BuildScreen } from "./build/build";
import { SummaryScreen } from "./summary";
import { TitleScreen } from "./title";
import { SPEEDS, SPEED_1X, drawBar, drawPlate, drawResult, type BarState } from "./battleHud";

type Phase = "intro" | "fight" | "outro" | "result";
const INTRO = 1.2; // drive-in seconds

export class BattleScreen implements Screen {
  readonly arena: Arena;
  readonly foe: DuskFoe;
  phase: Phase = "intro";
  private pt = 0;
  private result: DayResult | null = null;
  readonly foeName: string;
  private windBanner = 0;
  private count = 4;
  speed = SPEED_1X;
  menu = false;
  L!: BattleLayout;
  private bg = new ArenaBg();
  private clockSec = -1;
  private clockText = "0:00";
  private hpText: [string, string] = ["", ""];
  private hpInt: [number, number] = [-1, -1];
  private bar: BarState;

  /** 0.6.0b: "warlord" is the road-stop fight (PvE, never costs a life), "dusk" the ghost. */
  readonly kind: "dusk" | "warlord";
  readonly warlord: WarlordFight | null = null;
  private readonly wact: WarlordActions;

  constructor(private game: Game, kind: "dusk" | "warlord" = "dusk") {
    const run = game.run!;
    this.kind = kind;
    const w = kind === "warlord" ? todaysWarlord(run) : null;
    if (kind === "warlord" && !w) throw new Error("no warlord fight today");
    if (w) {
      // the stored fight: same deck, same seed, so a reload replays it exactly
      this.warlord = w;
      run.stage = "warlord";
      this.foe = { day: w.day, kind: "standin", name: w.name, hero: w.hero, build: w.build, rival: w.id };
    } else this.foe = startDusk(run, loadPool()); // dusk starts: pick once, store, save
    saveRun(run);
    this.foeName = this.foe.name;
    this.wact = {
      take: [0, 1].map((i) => () => this.take(i)),
      refit: () => this.refitNow(),
      fight: () => this.toDusk(),
    };
    this.arena = new Arena(run.build, this.foe.build, w ? warlordSeed(run) : battleSeed(run), game.audio);
    this.arena.off = [60, 260];
    this.bar = {
      speed: this.speed, compact: false, showSpeeds: true, paused: false,
      onSpeed: SPEEDS.map((_, i) => () => this.setSpeed(i)),
      onCycle: () => this.setSpeed((this.speed + 1) % SPEEDS.length),
      onSkip: () => this.skip(),
      onPause: () => this.togglePause(),
    };
    this.relayout();
    if (w?.result) {
      // reloaded on the result card: show the stored result, never fight or pay again
      this.arena.off = [0, 0];
      this.arena.syncFrames();
      this.arena.finish();
      this.phase = "result";
      this.pt = 9;
    }
  }

  /** A Hard win's part pick: the part goes to cargo (then REFIT / FIGHT NOW). */
  take(i: number): void {
    if (!this.warlord || this.phase !== "result") return;
    const d = takePart(this.game.run!, i);
    if (!d) return;
    saveRun(this.game.run);
    this.game.audio.play("pickup");
  }

  /** After a warlord part: refit the deck (the caravan is gone), then FIGHT to dusk. */
  refitNow(): void {
    if (!this.warlord || this.leaving) return;
    this.leaving = true;
    this.game.run!.stage = "refit";
    saveRun(this.game.run);
    this.game.go(new BuildScreen(this.game));
  }

  /** On to the dusk ghost (FIGHT NOW / ON TO DUSK). */
  toDusk(): void {
    if (!this.warlord || this.leaving || pickPending(this.warlord)) return;
    this.leaving = true;
    this.game.run!.stage = "battle";
    saveRun(this.game.run);
    this.game.audio.play("go");
    this.game.go(new BattleScreen(this.game, "dusk"));
  }

  private leaving = false;

  pickScale(pw: number, ph: number, portrait: boolean): number {
    return battleScale(pw, ph, portrait);
  }

  get toastY(): number {
    return Math.round(this.game.H / 2 - 8);
  }

  /** Playback pause (II, P or Space): the fight holds still until resumed. */
  get paused(): boolean {
    return this.arena.paused && !this.menu;
  }

  togglePause(): void {
    if (this.menu || this.phase === "result") return;
    this.arena.paused = !this.arena.paused;
    this.game.audio.play("click");
  }

  enter(): void {
    this.relayout();
    this.game.audio.music("battle");
    this.game.audio.play("horn");
  }

  private bgSpec = { hulls: [] as { x: number; y: number; w: number; h: number }[], vertical: false, gapLine: true };
  private plateR = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
  private onNext = () => this.next();
  private openMenu = () => { this.menu = true; this.arena.paused = true; };

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

  private end(): void {
    const run = this.game.run!;
    const b = this.arena.b;
    if (this.warlord) {
      // PvE: gold (and a part) on a win; lives never change
      const r = finishWarlord(run, (b.winner ?? -1) as 0 | 1 | -1, b.t);
      this.wOutcome = r?.outcome ?? "draw";
      saveRun(run);
      this.phase = "outro";
      this.pt = 0;
      this.arena.speed = 1;
      this.arena.paused = false;
      this.game.audio.music(null);
      return;
    }
    const mine = ghostOf(run); // the deck exactly as it fought tonight, with the record entering it
    this.result = finishDay(run, b.winner ?? -1, b.t, b.sides[0].stats, b.sides[1].stats);
    saveGhost(mine);
    saveRun(run);
    this.phase = "outro";
    this.pt = 0;
    this.arena.speed = 1;
    this.arena.paused = false;
    this.game.audio.music(null);
  }

  skip(): void {
    if (this.phase === "intro") {
      this.phase = "fight";
      this.arena.off = [0, 0];
      this.arena.syncFrames();
    }
    if (this.phase !== "fight") return;
    this.arena.paused = false;
    for (const e of this.arena.finish()) if (e.type === "end") this.end();
  }

  private next(): void {
    if (this.warlord) return this.toDusk();
    const run = this.game.run!;
    this.game.go(run.over ? new SummaryScreen(this.game) : new BuildScreen(this.game));
  }

  private wOutcome: "win" | "loss" | "draw" = "draw";

  /** The outcome of the fight just played (warlord or dusk). */
  private outcome(): "win" | "loss" | "draw" | undefined {
    return this.warlord ? this.warlord.result?.outcome ?? this.wOutcome : this.result?.outcome;
  }

  update(dt: number): void {
    this.relayout();
    if (this.menu || this.arena.paused) return; // paused: nothing moves, the sim holds its tick
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
        const o = this.outcome();
        this.game.audio.play(o === "win" ? "win" : o === "loss" ? "lose" : "ready");
      }
    }
    this.windBanner = Math.max(0, this.windBanner - dt);
  }

  draw(g: G): void {
    const { W, H } = this.game;
    const a = this.arena;
    this.bg.draw(g, W, H, this.bgSpec, this.game.t, a.fx.shakeX, a.fx.shakeY);
    drawArena(g, a, W, H);
    this.drawHud(g);
    const run = this.game.run!;
    const cy = Math.round(H / 2);
    if (this.phase === "intro") {
      const k = Math.min(1, this.pt / 0.35);
      const w = this.warlord;
      const head = w ? `ROAD · DAY ${this.foe.day}/${RUN_DAYS}` : `DUSK · DAY ${this.foe.day}/${RUN_DAYS}`;
      const sub = w ? `VS ${this.foeName} · ${TIER_LABEL[w.tier]} WARLORD` : `VS ${this.foeName}`;
      banner(g, W, cy - 16, head, w ? C.amber : C.yellow, sub, k);
      if (this.foe.rival && k >= 1) this.drawCaptain(g, cy + 22);
      if (this.pt > INTRO && this.count <= 3) drawText(g, String(this.count), W / 2, cy - 50, C.white, { align: "center", scale: 4, outline: C.ink });
    } else if (this.phase === "fight" && this.pt < 0.7 && Math.floor(this.pt * 10) % 2 === 0) {
      drawText(g, "FIGHT!", W / 2, cy - 11, C.yellow, { align: "center", scale: 3, outline: C.ink });
    }
    if (this.windBanner > 0 && Math.floor(this.windBanner * 6) % 2 === 0) {
      banner(g, W, cy - 16, "DARK WIND", C.plum4, "THE STORM HURTS BOTH HULLS", 1);
    }
    if (this.phase === "result" && this.warlord?.result) drawWarlordResult(g, this.game, this.warlord, this.pt, this.wact);
    const oc = this.outcome();
    if (this.phase === "outro" && oc && this.pt > 0.55) {
      const o = oc;
      const k = Math.min(1, (this.pt - 0.55) / 0.25);
      banner(g, W, cy - 18, o === "win" ? "VICTORY!" : o === "loss" ? "DEFEAT" : "DRAW", o === "win" ? C.lime : o === "loss" ? C.red : C.bone, o === "win" ? "THEIR HULL BREAKS" : o === "loss" ? "YOUR HULL BREAKS" : undefined, k, 3);
    }
    if (this.phase === "result" && this.result) {
      drawResult(g, this.game, this.result, this.pt, run.over ? "SEE THE RUN" : `ON TO DAWN · DAY ${run.day}`, this.onNext);
    }
    if (this.paused && this.phase !== "result") this.drawPaused(g);
    if (this.menu) this.drawMenu(g);
  }

  /** Intro: the captain's portrait, name and tag (the warlord's tier, or STAND-IN at dusk). */
  private drawCaptain(g: G, y: number): void {
    const id = this.foe.rival!;
    const w = this.warlord;
    const label = w ? TIER_LABEL[w.tier] : "STAND-IN";
    const nw = textWidth(this.foeName);
    const tw = textWidth(label, "3") + 5;
    const total = 24 + 6 + Math.max(nw, tw);
    const x = Math.round(this.game.W / 2 - total / 2);
    panel(g, { x: x - 5, y: y - 4, w: total + 10, h: 32 }, "dark");
    drawPortrait(g, id, x, y);
    drawText(g, this.foeName, x + 30, y + 2, nameColor(id), { outline: C.ink });
    tag(g, label, x + 30, y + 14, w ? TIER_COLOR[w.tier] : C.slate3);
  }

  /** In-place pause: a small chip (PAUSED, how to resume, MENU) that leaves the battlefield visible. */
  private drawPaused(g: G): void {
    const { W, H, ui } = this.game;
    const hint = "II OR P TO RESUME";
    const w = Math.max(textWidth("PAUSED", "5") * 2, textWidth(hint, "3")) + 44;
    const r = { x: Math.round(W / 2 - w / 2), y: Math.round(H / 2 - 20), w, h: 28 };
    panel(g, r, "dark");
    drawText(g, "PAUSED", r.x + 6, r.y + 4, C.yellow, { scale: 2, outline: C.ink });
    drawText(g, hint, r.x + 6, r.y + 20, C.slate4, { font: "3" });
    button(ui, g, "pmenu", { x: r.x + r.w - 34, y: r.y + 5, w: 30, h: 18 }, "MENU", { font: "3", onTap: this.openMenu });
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
    st.paused = this.paused;
    st.showSpeeds = this.phase === "fight" || this.phase === "intro";
    drawBar(g, this.game, this.arena, L.bar, this.clockText, st);
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
    if (k >= "1" && k <= "4" && k.length === 1) this.setSpeed(Number(k) - 1);
    else if (k === "s" || k === "S") this.skip();
    else if (k === "Escape") {
      this.menu = !this.menu;
      this.arena.paused = this.menu;
    } else if ((k === " " || k === "p" || k === "P") && this.phase !== "result") this.togglePause();
    else if ((k === "Enter" || k === " ") && this.phase === "result" && this.pt > 0.35) this.next();
  }
}
