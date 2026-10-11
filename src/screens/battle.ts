// Dusk battle: both cruisers roll into frame, a 3-2-1 countdown, then the fight plays out at the
// chosen speed. A hull break triggers the KO burst, slow-mo and a WIN/LOSE banner, then the dusk
// result card. 0.6.0: dusk starts when this screen is made: today's ghost (or stand-in) is picked
// once, stored in the run and saved, so a reload fights the same one. After the fight the
// player's own snapshot joins the local ghost pool. The battle frames itself (battleLayout).

import { playerSkin } from "../game/profile"; // CUSTOM-2a (REQ-BFG-072, R11): the player's side wears the chosen styles
import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { battleGrid, battleLayout, battleScale, cameraFocus, laneLayout, minGap, type BattleLayout } from "../game/battleLayout";
import { ArenaMotion, drawMotionPerf } from "../game/arenaMotion"; // MOTION-1 (REQ-BFG-071); MOTION-2: in every build
import { MOTION, MOTION_KNOBS } from "../render/motion";
import { battleScene } from "../render/scenery"; // FIELD-1 (REQ-BFG-075): the battle's setting, from its seed
import { cameraGrid, type Grid } from "../render/camera"; // FIELD-1: the battle camera's grid
import { settings } from "../core/settings";
import { battleSeed, saveRun, type DayResult, type DuskFoe, type WarlordFight } from "../game/run";
import { finishDay, foeTitle, ghostOf, startDusk, storedFoe } from "../game/day";
import { foldDuskResult, foldWarlordResult } from "../game/styleFolds"; // CUSTOM-2a (REQ-BFG-072): the profile's folds
import { raceReadout } from "../game/raceReadout"; // 0.8.0 H1 M3: the card's FOUNDRY and BASTION rows
import { loadPool, saveGhost } from "../game/ghosts";
import { FINDING_GHOST, foeNote, online, onlineMode } from "../game/session"; // 0.7.0a: online play (none: offline, as 0.6.2)
import { battleRecordFor } from "../net/replay";
import type { BattleRecord } from "../sim/battle";
import { finishWarlord, pickPending, takePart, todaysWarlord, warlordSeed } from "../game/road";
import { onToTheRoad } from "../game/road"; // NPC-1 (REQ-BFG-077): the event after the fight
import { npcDayRules } from "../sim/npcDay"; // NPC-1
import { hullScaleRules } from "../sim/hullScale"; // HULL-1d (REQ-BFG-079; ruling Q4): the desk bar's wind slot
import { EventScreen } from "./event/event"; // NPC-1: ON TO THE ROAD opens the day's event
import { HEROES, RUN_DAYS } from "../sim/content";
import { C } from "../render/palette";
import type { G } from "../render/pixel";
import { TIER_COLOR, TIER_LABEL, drawPortrait, nameColor, tag } from "../ui/captain";
import { drawWarlordResult, type WarlordActions } from "./warlordHud";
import { drawText, textWidth } from "../render/font";
import { banner, optionsCard } from "../ui/hud";
import { button, panel } from "../ui/ui";
import { BuildScreen } from "./build/build";
import { SummaryScreen } from "./summary";
import { fmtDmg } from "../ui/statFormat"; // NUM-4 (REQ-BFG-047): the hull readout, whole
import { barClock, clockSec } from "../ui/statFormat"; // WIND-2 (REQ-BFG-093): one fight clock, the bar's as the card's
import { TitleScreen } from "./title";
import { NOTE_ROW, SPEEDS, SPEED_1X, drawBar, drawPlate, drawResult, notePlace, plateSource, type BarState } from "./battleHud";
import { drawWindCall, type PlateInfo } from "./battleHud"; // WIND-1 (REQ-BFG-093): the DARK WIND callout; the plates drawn
import { BattleFaces, drawSummaries, drawViewBar, fingerPx, summaryRects } from "./battleScout"; // SCOUT-1 (REQ-BFG-076)
import { keepRunSpeed, runSpeed } from "../game/runSpeed"; // SCOUT-1b (REQ-BFG-083): the speed picked holds for the run
import type { Rect } from "../ui/ui";

/** 0.7.0 (R1 M1): the enemy plate's source line as BattleScreen draws it (see placeSource). */
export type SourceLine =
  | { place: "above"; text: string; box: { x: number; y: number; w: number; h: number } }
  | { place: "plate"; tag: string; name: string };

/** SCOUT-1 (REQ-BFG-076): "view" is VIEW BATTLEFIELD, opened from the result card. SCOUT-1b (REQ-BFG-082): no scouting
 *  pause: the sail-in runs into the 3-2-1 count by itself at WIDE, as before SCOUT-1. */
type Phase = "intro" | "fight" | "outro" | "result" | "view";
const INTRO = 1.2; // drive-in seconds
/** SCOUT-1: VIEW BATTLEFIELD's camera moves (FIELD-1's Camera.easeTo) and the steady sailing's ease (MotionModel.calmTo),
 *  seconds. */
export const VIEW_CLOSE_S = 0.6, BACK_WIDE_S = 0.6, CALM_S = 0.5;
/** SCOUT-1: how long the card takes to lower when VIEW BATTLEFIELD opens (its rise, played back). */
const LOWER_S = 0.25;

/** MOTION-2 (REQ-BFG-071): how far past its hull box a carrier starts its sail-in (its bow reaches 18 px past the box, its
 *  bow wave 3 more). */
const SAIL_IN_PAD = 24;

export class BattleScreen implements Screen {
  readonly arena: Arena;
  readonly foe: DuskFoe;
  phase: Phase = "intro";
  private pt = 0;
  private result: DayResult | null = null;
  readonly foeName: string;
  private count = 4;
  speed = SPEED_1X;
  menu = false;
  L!: BattleLayout;
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
  /** MOTION-1 (REQ-BFG-071; display only): the carriers in motion and the day's sea. MOTION-2: in every build.
   *  CUSTOM-2a (REVIEW-MOTION2 Q2): the only way a battle is drawn (the ?motion=0 knob and the tracked hulls are gone). */
  readonly motion: ArenaMotion;
  /** The drive-in distances (px) each side starts at: far enough left to sail in from off screen (relayout). */
  private driveIn: [number, number] = [60, 260];
  /** SCOUT-1 (REQ-BFG-076): the faces of both boards (VIEW BATTLEFIELD). */
  readonly faces = new BattleFaces();
  /** SCOUT-1: seconds since VIEW BATTLEFIELD opened (the card lowers over LOWER_S). */
  private viewT = 0;
  /** SCOUT-1 tooling: this frame's BACK and primary tap targets and the summaries (logical px); SCOUT-1b: the result
   *  card's box (null: no card drawn). */
  readonly scoutRects: { back: Rect | null; primary: Rect | null; summaries: Rect[]; card: Rect | null } = { back: null, primary: null, summaries: [], card: null };
  /** WIND-1 tooling (bb.windInfo): the DARK WIND callout's box as drawn this frame (null: not showing). */
  windCallR: Rect | null = null;
  /** WIND-1 tooling (bb.windInfo): each plate as drawn this frame (battleHud.ts drawPlate), [yours, the foe's]. */
  readonly plateRows: [PlateInfo | null, PlateInfo | null] = [null, null];

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
    // HULL-1a (REQ-BFG-079): the dusk and a warlord fight are on the run's day (the record keeps it with HULL_SCALE on)
    this.record = !w && onlineMode() ? battleRecordFor(run.build, this.foe.build, this.seed, wins, run.day) : null;
    this.note = w ? null : foeNote(run, this.foe);
    this.wact = {
      take: [0, 1].map((i) => () => this.take(i)),
      refit: () => this.refitNow(),
      fight: () => this.toDusk(),
      road: () => this.toRoad(), // NPC-1 (REQ-BFG-077): ON TO THE ROAD (NPC_DAY on)
    };
    this.arena = new Arena(run.build, this.foe.build, this.seed, game.audio, undefined, wins, run.day);
    this.arena.views[0].skin = playerSkin(); // CUSTOM-2a (R11): the player's board and plate; the foe's stay the defaults
    this.arena.off = [60, 260];
    // FIELD-1 (REQ-BFG-075): the setting this battle's seed picks (its replay plays the same seed: the same setting)
    this.motion = new ArenaMotion(this.seed, battleScene(this.seed), MOTION, settings.reducedMotion);
    this.bar = {
      speed: this.speed, compact: false, showSpeeds: true, paused: false,
      onSpeed: SPEEDS.map((_, i) => () => this.setSpeed(i)),
      onCycle: () => this.setSpeed((this.speed + 1) % SPEEDS.length),
      onSkip: () => this.skip(),
      onPause: () => this.togglePause(),
    };
    this.relayout();
    this.arena.off = [this.driveIn[0], this.driveIn[1]];
    this.useSpeed(runSpeed(run)); // SCOUT-1b (REQ-BFG-083): the speed picked earlier in this run, from the first step
    if (w?.result) {
      // reloaded on the result card: show the stored result, never fight or pay again
      this.arena.off = [0, 0];
      this.arena.syncFrames();
      this.arena.finish();
      this.phase = "result";
      this.pt = 9;
    }
  }

  /** AZ-PREP (REQ-BFG-077, REQ-BFG-078; REVIEW-NPC1 N1): from the fight's end until the result card closes, the queued merge
   *  toasts wait (game.ts, save.ts nextFuseToast), so a drop's or a Hard pick's "MERGED: ..." never covers the card's lines
   *  ("+4 GOLD"); they show on the next screen. */
  get holdsMerges(): boolean {
    return this.phase === "outro" || this.phase === "result";
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

  /** NPC-1 (REQ-BFG-077; NPC_DAY on): the result's ON TO THE ROAD, win or lose: the day's event (road.ts onToTheRoad sets it
   *  up once and saves the stage), or REFIT when its choice was already made. */
  toRoad(): void {
    if (!this.warlord?.result || this.leaving) return;
    const next = onToTheRoad(this.game.run!);
    if (!next) return;
    this.leaving = true;
    saveRun(this.game.run);
    this.game.audio.play("whoosh");
    this.game.go(next === "event" ? new EventScreen(this.game) : new BuildScreen(this.game));
  }

  private leaving = false;

  pickScale(pw: number, ph: number, portrait: boolean): number {
    return battleScale(pw, ph, portrait);
  }

  private gridPick: { grid: Grid; W: number; H: number; portrait: boolean } | null = null;

  /** FIELD-1 (REQ-BFG-075): the canvas grid the camera needs (game/viewGrid.ts GameView.sub): both shots' pixels whole. */
  pickSub(pw: number, ph: number, portrait: boolean, scale: number): number {
    const grid = battleGrid(pw, ph, portrait);
    if (grid.close !== scale) return 1;
    this.gridPick = { grid, W: Math.floor(pw / scale), H: Math.floor(ph / scale), portrait };
    return grid.sub;
  }

  /** FIELD-1: the camera grid of the view on screen (pickSub's); a view not yet the battle's gets a grid that doesn't
   *  zoom (until enter() lays the battle out on its own view). */
  private viewGrid(): Grid {
    const v = this.game.view, p = this.gridPick;
    const grid = p && p.W === v.W && p.H === v.H && p.portrait === v.portrait ? p.grid : battleGrid(v.W * v.scale, v.H * v.scale, v.portrait);
    return grid.close === v.scale && grid.sub === (v.sub ?? 1) ? grid : cameraGrid(v.scale, v.scale);
  }

  get toastY(): number {
    return Math.round(this.game.H / 2 - 8);
  }

  /** Playback pause (II, P or Space): the fight holds still until resumed. */
  get paused(): boolean {
    return this.arena.paused && !this.menu;
  }

  togglePause(): void {
    if (this.menu || this.phase === "result" || this.phase === "view") return;
    this.arena.paused = !this.arena.paused;
    this.game.audio.play("click");
  }

  // ------------------------------------------------------------ SCOUT-1 (REQ-BFG-076): VIEW BATTLEFIELD

  /** Back to the fight's framing: WIDE and the full motion. */
  private toWide(secs: number): void {
    if (this.motion.camera && (this.motion.camera.shot !== "wide" || this.motion.camera.moving)) this.motion.camera.easeTo("wide", secs);
    if (this.motion.model.calmAt() > 0 || this.motion.model.calmAt(Infinity) > 0) this.motion.model.calmTo(0, CALM_S);
  }

  /** VIEW BATTLEFIELD is offered: on the result card, with the battle's end in the arena (a live fight's, or a reloaded
   *  warlord card's: the constructor rebuilt it with Arena.finish from the stored fight, as the replay's path does). */
  canView(): boolean {
    return this.phase === "result" && this.arena.b.over;
  }

  /** VIEW BATTLEFIELD: the card lowers and the camera eases to CLOSE over both carriers as the fight left them. */
  openView(): boolean {
    if (!this.canView()) return false;
    this.phase = "view";
    this.viewT = 0;
    this.faces.close();
    this.motion.camera?.easeTo("close", VIEW_CLOSE_S);
    this.motion.model.calmTo(1, CALM_S);
    this.game.audio.play("click");
    return true;
  }

  /** BACK: the result card again (at rest, its buttons up), the camera back at WIDE. */
  closeView(): boolean {
    if (this.phase !== "view") return false;
    this.phase = "result";
    this.pt = 1.4; // the card at rest, its buttons shown, its lost heart done blinking
    this.faces.close();
    this.toWide(BACK_WIDE_S);
    this.game.audio.play("click");
    return true;
  }

  /** The card's primary action, as the view's bar offers it: ON TO DAWN · DAY n or SEE THE RUN; a warlord's REFIT (a part
   *  in cargo) or ON TO DUSK; none while a warlord's part pick waits on the card (BACK to pick). */
  viewPrimary(): { label: string; onTap: () => void } | null {
    const w = this.warlord;
    if (w) {
      const r = w.result;
      if (!r || pickPending(w)) return null;
      return r.took ? { label: "REFIT", onTap: this.wact.refit } : { label: "ON TO DUSK", onTap: this.wact.fight };
    }
    return { label: this.game.run!.over ? "SEE THE RUN" : `ON TO DAWN · DAY ${this.game.run!.day}`, onTap: this.onNext };
  }

  /** Tooling: the battle's phase, "count" for the intro's 3-2-1 count (the sail-in over). */
  phaseName(): string {
    return this.phase === "intro" && this.pt >= INTRO ? "count" : this.phase;
  }

  enter(): void {
    this.relayout();
    this.game.audio.music("battle");
    this.game.audio.play("horn");
  }

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

  private subKey = 0;

  private relayout(): void {
    const { W, H, portrait } = this.game;
    const sub = this.game.view.sub ?? 1;
    if (this.L && this.L.W === W && this.L.H === H && this.L.portrait === portrait && this.subKey === sub) return;
    this.subKey = sub;
    // MOTION-1: the lanes (portrait as today; landscape's enemy lane raised and a little ahead), the sail-in from the
    // left, and the curves fitted so the gap never closes below the layout's minimum
    this.L = laneLayout(battleLayout(W, H, portrait));
    this.motion.setLanes(this.L, minGap(portrait ? H : W));
    // FIELD-1 (REQ-BFG-075): the fight runs at WIDE, from the sail-in to the result, zoomed about the lanes' centre
    this.motion.useCamera(this.viewGrid(), cameraFocus(this.L), "wide");
    // MOTION-2: + SAIL_IN_PAD, so the longer bow (render/carrier.ts) starts off screen too. FIELD-1: off WIDE's screen,
    // whose left edge sits further left in the layout's space
    const left = Math.min(0, Math.floor(this.motion.toRest(0, 0, [0, 0])[0]));
    this.driveIn = [this.L.hulls[0].x + this.L.hulls[0].w + SAIL_IN_PAD - left, this.L.hulls[1].x + this.L.hulls[1].w + SAIL_IN_PAD + 28 - left];
    this.src = this.placeSource();
    this.arena.setFrames(this.L.frames, this.L.enter);
    this.motion.windKeep = { plates: this.L.plates, bar: this.L.bar }; // WIND-1 (REQ-BFG-093): the wind's numbers keep clear
  }

  /** The player's pick (a bar button, the cycle button, keys 1-4). SCOUT-1b (REQ-BFG-083): it holds for the rest of the
   *  run, kept on the device with the run's id (game/runSpeed.ts), so the next battle starts at it. */
  setSpeed(i: number): void {
    this.useSpeed(i);
    keepRunSpeed(this.game.run!, this.speed);
  }

  /** SCOUT-1b: play at speed `i` (the bar shows it) without keeping it. */
  private useSpeed(i: number): void {
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
      if (r) foldWarlordResult(run, run.day, r.outcome, this.warlord.id); // CUSTOM-2a: warlord wins, the Iron Matriarch
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
    foldDuskResult(run, this.result); // CUSTOM-2a (REQ-BFG-072): the dusk (and the run's end when it ended the run), once
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
    if (this.warlord) return npcDayRules() ? this.toRoad() : this.toDusk(); // NPC-1: the event comes before dusk
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
    if (this.menu || this.arena.paused) {
      // paused: nothing moves, the sim holds its tick. SCOUT-1: a camera move begun in VIEW BATTLEFIELD still comes to rest
      // (FIELD-1 REPORT s11: update returns here, so the move needs its own step)
      if (this.phase === "view") this.motion.camera?.update(dt);
      return;
    }
    this.motion.update(dt, settings.reducedMotion); // MOTION-1: the display clock (frame time; never the sim's)
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
        if (e.type === "end" && this.phase === "fight") this.end();
      }
    } else {
      a.update(dt, false);
      if (this.phase === "view") this.viewT += dt; // SCOUT-1
      if (this.phase === "outro" && this.pt > 2.5) {
        this.phase = "result";
        this.pt = 0;
        const o = this.outcome();
        this.game.audio.play(o === "win" ? "win" : o === "loss" ? "lose" : "ready");
      }
    }
  }

  draw(g: G): void {
    const { W, H } = this.game;
    const a = this.arena;
    const m = this.motion;
    // MOTION-1: the day's sea, then the carriers, boards, shots and effects in motion. FIELD-1: the battle's setting,
    // through the camera
    m.drawSea(g, W, H, a.fx.shakeX, a.fx.shakeY, this.game.view.scale, this.game.view.dpr, this.seed, a);
    m.draw(g, a, W, H, settings.reducedMotion);
    this.drawHud(g);
    if (MOTION_KNOBS && m.perf) drawMotionPerf(g, m, this.game); // ?perf=1 (test builds only)
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
    // WIND-1 (REQ-BFG-093): the DARK WIND callout in the open floor (was a blinking full-width banner at the screen's middle,
    // over the boards on landscape, here only: the replay had none)
    this.windCallR = drawWindCall(g, a, this.L, m, settings.reducedMotion);
    // SCOUT-1 (REQ-BFG-076): the card offers VIEW BATTLEFIELD; while the view opens the card lowers (its rise, played back)
    const lowering = this.phase === "view" && this.viewT < LOWER_S;
    const view = this.canView() || lowering ? this.onView : undefined; // lowering: the card keeps its row (no button drawn)
    const cardT = lowering ? LOWER_S - this.viewT : this.pt;
    const sr = this.scoutRects;
    sr.card = null; // SCOUT-1b tooling: the card's box as drawn
    if ((this.phase === "result" || lowering) && this.warlord?.result) sr.card = drawWarlordResult(g, this.game, this.warlord, cardT, this.wact, view, fingerPx(this.game));
    const oc = this.outcome();
    if (this.phase === "outro" && oc && this.pt > 0.55) {
      const o = oc;
      const k = Math.min(1, (this.pt - 0.55) / 0.25);
      banner(g, W, cy - 18, o === "win" ? "VICTORY!" : o === "loss" ? "DEFEAT" : "DRAW", o === "win" ? C.lime : o === "loss" ? C.red : C.bone, o === "win" ? "THEIR HULL BREAKS" : o === "loss" ? "YOUR HULL BREAKS" : undefined, k, 3);
    }
    if ((this.phase === "result" || lowering) && this.result) {
      sr.card = drawResult(g, this.game, this.result, cardT, run.over ? "SEE THE RUN" : `ON TO DAWN · DAY ${run.day}`, this.onNext, view, fingerPx(this.game));
    }
    // SCOUT-1: VIEW BATTLEFIELD's summaries and faces
    sr.summaries = [];
    if (this.phase === "view" && !lowering && !this.faces.open) { // an open face takes the floor; they're back when it closes
      drawSummaries(g, this.arena, this.L);
      sr.summaries = [...summaryRects(this.L).r];
    }
    if (this.phase === "view" && !lowering) this.faces.draw(g, this.game, this.arena, this.L, true);
    else this.faces.last = null;
    if (this.paused && this.phase !== "result" && this.phase !== "view") this.drawPaused(g);
    if (this.menu) this.drawMenu(g);
  }

  private onView = () => this.openView();
  private onBack = () => this.closeView();

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
    // plates ride with their cruiser during the drive-in (FIELD-1: at the camera's zoom, as the cruiser moves on screen)
    const z = this.motion.camera?.zoom ?? 1;
    for (let s = 0; s < 2; s++) {
      const p = L.plates[s], r = this.plateR[s];
      r.x = p.x + Math.round(this.arena.enter[s][0] * this.arena.off[s] * z);
      r.y = p.y + Math.round(this.arena.enter[s][1] * this.arena.off[s] * z);
      r.w = p.w;
      r.h = p.h;
    }
    // 0.7.0a step 6 (online only): the foe's source in small text by its plate, online ghost or offline stand-in; 0.7.0
    // (R1 M1): where sourceLine() puts it, riding with the plate
    const src = this.src, p1 = this.plateR[1];
    this.plateRows[1] = drawPlate(g, this.game, this.arena, p1, 1, src?.place === "plate" ? src.name : this.foeName, this.hpText[1], src?.place === "plate" ? src.tag : undefined);
    if (src?.place === "above") drawText(g, src.text, p1.x + 3, p1.y - (NOTE_ROW - 1), C.slate4, { font: "3", outline: C.ink });
    this.plateRows[0] = drawPlate(g, this.game, this.arena, this.plateR[0], 0, HEROES[this.game.run!.hero].name, this.hpText[0]);
    const sec = clockSec(b.t); // WIND-2 (REQ-BFG-093): whole ticks, then whole seconds (was Math.floor(b.t): 1:08 at 69 s)
    if (sec !== this.clockSec) {
      this.clockSec = sec;
      this.clockText = barClock(b.t);
    }
    const st = this.bar;
    const sr = this.scoutRects;
    sr.back = sr.primary = null;
    if (this.phase === "view") {
      // SCOUT-1 (REQ-BFG-076): VIEW BATTLEFIELD's bar: BACK and the card's primary action, where the playback bar sits
      const q = drawViewBar(g, this.game, L.bar, this.clockText, this.onBack, this.viewPrimary());
      sr.back = q.back;
      sr.primary = q.primary;
      return;
    }
    st.speed = this.speed;
    st.compact = L.compact;
    st.paused = this.paused;
    st.showSpeeds = this.phase === "fight" || this.phase === "intro";
    st.deskWind = !L.portrait && hullScaleRules(); // HULL-1d (REQ-BFG-079; ruling Q4): the desk bar's wind slot
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

  /** MOTION-1 (REQ-BFG-071; display only): a tap on a board tile is hit-tested through the inverse of (carrier x board)
   *  and remembered for the probe (scripts/motiontap.mjs). MOTION-2 (REVIEW-MOTION1 Q4): nothing is drawn for it, so a
   *  player sees no change: a battle still does nothing on a tap off the HUD, as at 0.9.4. */
  down(x: number, y: number): void {
    if (this.menu || this.phase === "result") return;
    this.motion.tap(this.arena, x, y);
    // SCOUT-1 (REQ-BFG-076): in VIEW BATTLEFIELD a part opens its face (another part swaps it); empty space closes it
    if (this.phase === "view" && this.viewT >= LOWER_S) this.faces.press(this.arena, this.motion, x, y);
  }

  /** SCOUT-1: every press, before it is routed: a press off the face's keyword targets closes its open definition. */
  pressed(_x: number, _y: number, region: string | null): void {
    if (this.faces.open) this.faces.pressed(region);
  }

  key(k: string): void {
    if (k >= "1" && k <= "4" && k.length === 1) this.setSpeed(Number(k) - 1);
    else if (k === "s" || k === "S") this.skip();
    else if (k === "Escape") {
      this.menu = !this.menu;
      this.arena.paused = this.menu;
    } else if ((k === " " || k === "p" || k === "P") && this.phase !== "result" && this.phase !== "view") this.togglePause();
    else if ((k === "Enter" || k === " ") && this.phase === "result" && this.pt > 0.35) this.next();
    else if ((k === "Enter" || k === " ") && this.phase === "view" && this.viewT >= LOWER_S) this.viewPrimary()?.onTap(); // SCOUT-1
    else if ((k === "Backspace" || k === "b" || k === "B") && this.phase === "view") this.closeView(); // SCOUT-1: BACK
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
