// Dusk battle: both cruisers roll into frame, a 3-2-1 countdown, then the fight plays out at the
// chosen speed. A hull break triggers the KO burst, slow-mo and a WIN/LOSE banner, then the dusk
// result card. 0.6.0: dusk starts when this screen is made: today's ghost (or stand-in) is picked
// once, stored in the run and saved, so a reload fights the same one. After the fight the
// player's own snapshot joins the local ghost pool. The battle frames itself (battleLayout).

import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { drawArena } from "../game/arenaDraw";
import { battleLayout, battleScale, laneLayout, minGap, type BattleLayout } from "../game/battleLayout";
import { ArenaMotion } from "../game/arenaMotion"; // MOTION-1 (REQ-BFG-071): battles in motion (VITE_MOTION builds)
import { MOTION, MOTION_BUILD, MotionPerf } from "../render/motion";
import { settings } from "../core/settings";
import { battleSeed, saveRun, type DayResult, type DuskFoe, type WarlordFight } from "../game/run";
import { finishDay, foeTitle, ghostOf, startDusk, storedFoe } from "../game/day";
import { raceReadout } from "../game/raceReadout"; // 0.8.0 H1 M3: the card's FOUNDRY and BASTION rows
import { loadPool, saveGhost } from "../game/ghosts";
import { FINDING_GHOST, foeNote, online, onlineMode } from "../game/session"; // 0.7.0a: online play (none: offline, as 0.6.2)
import { battleRecordFor } from "../net/replay";
import type { BattleRecord } from "../sim/battle";
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
import { fmtDmg } from "../ui/statFormat"; // NUM-4 (REQ-BFG-047): the hull readout, whole
import { TitleScreen } from "./title";
import { NOTE_ROW, SPEEDS, SPEED_1X, drawBar, drawPlate, drawResult, notePlace, plateSource, type BarState } from "./battleHud";

/** 0.7.0 (R1 M1): the enemy plate's source line as BattleScreen draws it (see placeSource). */
export type SourceLine =
  | { place: "above"; text: string; box: { x: number; y: number; w: number; h: number } }
  | { place: "plate"; tag: string; name: string };

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
  /** The fight's seed (battleSeed at dusk, warlordSeed on the road). */
  private readonly seed: number;
  /** 0.7.0a, online only: the dusk's battle record, stored with its result for the summary's REPLAY. */
  private readonly record: BattleRecord | null;
  /** 0.7.0a, online only: where the foe came from, in small text under the enemy plate. */
  private readonly note: string | null;
  readonly warlord: WarlordFight | null = null;
  private readonly wact: WarlordActions;
  /** MOTION-1 (REQ-BFG-071; display only): the carriers in motion and the day's sea, in a VITE_MOTION=1 build unless
   *  ?motion=0; null otherwise (the battle draws exactly as before). */
  readonly motion: ArenaMotion | null = null;
  /** The drive-in distances (px) each side starts at: today's, or (motion) far enough left to sail in from off screen. */
  private driveIn: [number, number] = [60, 260];
  /** MOTION-1: the frame-time split with motion off (?motion=0&perf=1 in a motion build only; null otherwise). */
  readonly offPerf: MotionPerf | null = MOTION_BUILD && !MOTION.on && MOTION.perf ? new MotionPerf() : null;

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
    } else if (onlineMode()) {
      // 0.7.0a online: the foe the session stored (the server's ghost, or 0.6.2's stand-in when the fetch fell back or
      // hasn't answered: never the local pool), then tonight's deck goes up, once per dusk, fire and forget
      this.foe = startDusk(run, [], { ghost: null });
      online()!.submitDusk(run);
    } else this.foe = startDusk(run, loadPool()); // dusk starts: pick once, store, save
    saveRun(run);
    this.foeName = this.foe.name;
    this.seed = w ? warlordSeed(run) : battleSeed(run);
    // RUNES-2a (REQ-BFG-058): the wins each side carries in, for WARLORD'S DUE: the run's own, a ghost's from its snapshot
    // (DuskFoe.record), 0 for a stand-in or a warlord; the record keeps them only when a side holds it (replay.ts)
    const wins: [number, number] = [run.wins, w ? 0 : this.foe.record?.wins ?? 0];
    // 0.7.0a: the dusk's battle record (both decks as they fight, the seed) for the summary's REPLAY; online only
    this.record = !w && onlineMode() ? battleRecordFor(run.build, this.foe.build, this.seed, wins) : null;
    this.note = w ? null : foeNote(run, this.foe);
    this.wact = {
      take: [0, 1].map((i) => () => this.take(i)),
      refit: () => this.refitNow(),
      fight: () => this.toDusk(),
    };
    this.arena = new Arena(run.build, this.foe.build, this.seed, game.audio, undefined, wins);
    this.arena.off = [60, 260];
    if (MOTION_BUILD && MOTION.on) this.motion = new ArenaMotion(this.seed, this.foe.day, MOTION, settings.reducedMotion);
    this.bar = {
      speed: this.speed, compact: false, showSpeeds: true, paused: false,
      onSpeed: SPEEDS.map((_, i) => () => this.setSpeed(i)),
      onCycle: () => this.setSpeed((this.speed + 1) % SPEEDS.length),
      onSkip: () => this.skip(),
      onPause: () => this.togglePause(),
    };
    this.relayout();
    if (this.motion) this.arena.off = [this.driveIn[0], this.driveIn[1]];
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
    this.game.go(duskScreen(this.game));
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
  private src: SourceLine | null = null;

  /**
   * 0.7.0 (R1 M1): where the foe's source line goes, on the layout at rest (so it never jumps during the drive-in). Null
   * offline (no note) and for warlords. "above": in the free row the layout leaves over the enemy plate, as 0.7.0a drew
   * it (desktop 1920x1080), with its painted box; "plate": inside the plate's strip, a tag before the name, where no row
   * is free (phones: 0.7.0a's line fell just under the plate, on the enemy hull's top rail). The layout is 0.6.2's.
   */
  private placeSource(): SourceLine | null {
    if (this.note === null) return null;
    const p = this.L.plates[1];
    if (notePlace(this.L) === "above") {
      return { place: "above", text: this.note, box: { x: p.x + 2, y: p.y - NOTE_ROW, w: textWidth(this.note, "3") + 2, h: NOTE_ROW - 1 } };
    }
    return { place: "plate", ...plateSource(this.foeName, this.note) };
  }

  /** 0.7.0 R1 tooling (read only; scripts/asynccheck.mjs M1): what placeSource decided for this layout. */
  sourceLine(): SourceLine | null {
    return this.src;
  }

  private onNext = () => this.next();
  private openMenu = () => { this.menu = true; this.arena.paused = true; };

  private relayout(): void {
    const { W, H, portrait } = this.game;
    if (this.L && this.L.W === W && this.L.H === H && this.L.portrait === portrait) return;
    this.L = battleLayout(W, H, portrait);
    if (this.motion) {
      // MOTION-1: the lanes (portrait as today; landscape's enemy lane raised and a little ahead), the sail-in from the
      // left, and the curves fitted so the gap never closes below the layout's minimum
      this.L = laneLayout(this.L);
      this.motion.setLanes(this.L, minGap(portrait ? H : W));
      this.driveIn = [this.L.hulls[0].x + this.L.hulls[0].w + 12, this.L.hulls[1].x + this.L.hulls[1].w + 40];
    }
    this.src = this.placeSource();
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
    this.result.shocks = [this.arena.shocks[0], this.arena.shocks[1]]; // 0.6.2 RULE SHOCK ROW (the card's Shock row; saved in history)
    // 0.8.0 H1 M3: FOUNDRY's and BASTION's rows, from the sim's race counters; nothing for a Furnace or Weaver fight
    const race = raceReadout([b.sides[0], b.sides[1]]);
    if (race) this.result.race = race;
    if (this.record) {
      // 0.7.0a (online): the battle record and both final hulls, kept per dusk in the run's history for the REPLAY
      this.result.record = this.record;
      this.result.hulls = [b.sides[0].hull.hp, b.sides[1].hull.hp];
      if (run.over) online()?.countRun(run); // D2: a finished run, won or lost
    }
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
    this.motion?.update(dt, settings.reducedMotion); // MOTION-1: the display clock (frame time; never the sim's)
    this.pt += dt;
    const a = this.arena;
    if (this.phase === "intro") {
      const k = Math.min(1, this.pt / INTRO);
      const ease = Math.pow(1 - k, 3);
      const prev = a.off[1];
      a.off[0] = Math.round(this.driveIn[0] * ease);
      a.off[1] = Math.round(this.driveIn[1] * ease);
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
    const m = this.motion;
    if (m) {
      // MOTION-1: the day's sea, then the carriers, boards, shots and effects in motion
      m.drawSea(g, W, H, a.fx.shakeX, a.fx.shakeY, this.game.view.scale, this.game.view.dpr, this.seed);
      m.draw(g, a, W, H, settings.reducedMotion);
    } else if (this.offPerf) {
      // MOTION-1 (?motion=0&perf=1 in a motion build): the motion-base look, timed (the floor, then all of drawArena)
      const P = this.offPerf;
      const t0 = performance.now();
      this.bg.draw(g, W, H, this.bgSpec, this.game.t, a.fx.shakeX, a.fx.shakeY);
      const t1 = performance.now();
      drawArena(g, a, W, H);
      P.add(0, t1 - t0);
      P.add(5, performance.now() - t1);
      P.frame();
    } else {
      this.bg.draw(g, W, H, this.bgSpec, this.game.t, a.fx.shakeX, a.fx.shakeY);
      drawArena(g, a, W, H);
    }
    this.drawHud(g);
    if (m?.perf) m.drawPerf(g, this.game);
    const run = this.game.run!;
    const cy = Math.round(H / 2);
    if (this.phase === "intro") {
      const k = Math.min(1, this.pt / 0.35);
      const w = this.warlord;
      const head = w ? `ROAD · DAY ${this.foe.day}/${RUN_DAYS}` : `DUSK · DAY ${this.foe.day}/${RUN_DAYS}`;
      // PACKS M2 (REQ-BFG-063): a ghost is NAME#TAG · W-L, or WANDERER · W-L without a name (day.ts foeTitle); a warlord keeps its tier line
      const sub = w ? `VS ${this.foeName} · ${TIER_LABEL[w.tier]} WARLORD` : `VS ${foeTitle(this.foe)}`;
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
      const hp = Math.max(0, b.sides[s].hull.hp); // NUM-4 (REQ-BFG-047): the hull is whole since NUM-1 (was Math.ceil)
      if (hp !== this.hpInt[s]) {
        this.hpInt[s] = hp;
        this.hpText[s] = fmtDmg(hp);
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
    // 0.7.0a step 6 (online only): the foe's source in small text by its plate, online ghost or offline stand-in; 0.7.0
    // (R1 M1): where sourceLine() puts it, riding with the plate
    const src = this.src, p1 = this.plateR[1];
    drawPlate(g, this.game, this.arena, p1, 1, src?.place === "plate" ? src.name : this.foeName, this.hpText[1], src?.place === "plate" ? src.tag : undefined);
    if (src?.place === "above") drawText(g, src.text, p1.x + 3, p1.y - (NOTE_ROW - 1), C.slate4, { font: "3", outline: C.ink });
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

  /** MOTION-1 (REQ-BFG-071; motion builds only, display only): a tap on a board tile lights it, through the inverse of
   *  (carrier x board), and is remembered for the probe (scripts/motiontap.mjs). Without motion a battle has no taps
   *  off the HUD, as before. */
  down(x: number, y: number): void {
    if (!this.motion || this.menu || this.phase === "result") return;
    this.motion.tap(this.arena, x, y);
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

/** 0.7.0a D4: the most the dusk waits for tonight's ghost: the fetch's own 4 s deadline (online.ts FETCH_TIMEOUT_MS)
 *  plus a second for the device identity; then 0.6.2's stand-in fights. */
export const DUSK_WAIT_S = 5;

/**
 * 0.7.0a: the way into a dusk fight (FIGHT after a refit, an event or a warlord). Offline (no server URL, or no
 * identity), or with tonight's foe already stored, it is 0.6.2's BattleScreen at once. Online with the ghost still on
 * its way (it is fetched from dawn, so this is rare), a short wait card holds the dusk until the answer is stored.
 */
export function duskScreen(game: Game): Screen {
  if (!onlineMode() || storedFoe(game.run!)) return new BattleScreen(game);
  return new DuskWaitScreen(game);
}

/** Online only: DUSK · DAY n and FINDING A GHOST... until the session stores tonight's foe (at most DUSK_WAIT_S). */
export class DuskWaitScreen implements Screen {
  private t = 0;
  private left = false;

  constructor(private game: Game) {}

  update(dt: number): void {
    this.t += dt;
    const run = this.game.run!;
    const s = online();
    if (s && !s.failed) {
      s.tick(run);
      if (!storedFoe(run) && this.t >= DUSK_WAIT_S) s.settle(run); // D4: never wait longer; 0.6.2's stand-in
    }
    if (!this.left && (storedFoe(run) || !s || s.failed)) {
      this.left = true;
      this.game.go(new BattleScreen(this.game));
    }
  }

  draw(g: G): void {
    const { W, H } = this.game;
    g.fillStyle = C.ink;
    g.fillRect(0, 0, W, H);
    banner(g, W, Math.round(H / 2) - 16, `DUSK · DAY ${this.game.run!.day}/${RUN_DAYS}`, C.yellow, FINDING_GHOST, 1);
  }
}
