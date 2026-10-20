// 0.7.0a M4 (REQ-BFG-016; decision D6): a stored dusk record replayed in the battle view, read-only. The same arena,
// layout, plates and playback bar as the dusk (0.5X-4X, SKIP, pause), a REPLAY · DAY n banner, then the result and
// BACK to the screen it came from (the run summary). It plays the Battle openReplay(record) made (replayBattle: a
// fresh Battle under this build's rules), so the fight is the stored one bit for bit; it never touches the run: no
// save, no dusk result, no ghost, no new pick.
// MOTION-2 (REQ-BFG-071, REVIEW-MOTION1 Q5): a replay sails in motion as the dusk did, on its day's sea (display only:
// the display clock and PRNG, seeded from the record's seed; the fight itself is the record's, bit for bit).

import { playerSkin } from "../game/profile"; // CUSTOM-2a (REQ-BFG-072, R11): the player's side wears the chosen styles
import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { battleGrid, battleLayout, battleScale, cameraFocus, laneLayout, minGap, type BattleLayout } from "../game/battleLayout";
import { ArenaMotion } from "../game/arenaMotion";
import { MOTION } from "../render/motion";
import { battleScene } from "../render/scenery"; // FIELD-1 (REQ-BFG-075): the record's seed picks the battle's setting
import { cameraGrid, type Grid } from "../render/camera"; // FIELD-1: the battle camera, at WIDE as the dusk was
import { settings } from "../core/settings";
import type { Battle } from "../sim/battle";
import { HEROES } from "../sim/content";
import { longRun } from "../sim/longRun"; // RUN-1 (REQ-BFG-059, D7): a long run's replay banner says DAY n, never DAY n/10
import { dayText } from "./runDay";
import { hullScaleRules } from "../sim/hullScale"; // HULL-1d (REQ-BFG-079; ruling Q4): the desk bar's wind slot
import { C } from "../render/palette";
import type { G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { banner } from "../ui/hud";
import { fmtClock, fmtDmg } from "../ui/statFormat"; // NUM-4 (REQ-BFG-047): the clock and the hull, whole
import { barClock } from "../ui/statFormat"; // WIND-2 (REQ-BFG-093): one fight clock, the bar's as the card's
import { button, panel } from "../ui/ui";
import { SPEEDS, SPEED_1X, drawBar, drawPlate, type BarState } from "./battleHud";
import { drawWindCall, type PlateInfo } from "./battleHud"; // WIND-1 (REQ-BFG-093): the DARK WIND callout, as the battle shows it
import type { View } from "../core/io";
import { isPhone, tapPx } from "../ui/tap"; // shoptap (D5, backlog 319)
import { BattleCounters, plateKeep } from "./battleCounters"; // COUNT-1 (REQ-BFG-100): the counters, as the battle shows them
import { PairWatch } from "../game/pairCue"; // PAIR-CUE (REQ-BFG-100, REQ-BFG-081): the PAIR on the board, as the battle shows it

/** POLISH-1 (REQ-BFG-085; P3b): the replay card's top line, `REPLAY · DAY 6 · 24 SEC` (`clock` is fmtClock's whole seconds; the unit was a bare `S`, read as part of the number). */
export const replayLine = (day: number | string, clock: string): string => `REPLAY · DAY ${day} · ${clock} SEC`;

type Box = { x: number; y: number; w: number; h: number };
const hits = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** shoptap (D5, backlog 319): the result card's BACK height: 15 px (0.7.0a), on a phone at least TAP_CSS CSS px. */
export function replayBackH(v: Pick<View, "W" | "H" | "scale" | "dpr">): number {
  return isPhone(v) ? Math.max(15, tapPx(v)) : 15;
}

/**
 * shoptap (D5, backlog 319): the replay's BACK while the fight plays. On a phone a TAP_CSS square (R1 measured 0.7.0a's
 * at 24 CSS px tall), as wide as its label needs; elsewhere 0.7.0a's 36 x 12. WIND-2 (REQ-BFG-093): on EVERY view (it
 * was the phone's alone; elsewhere 0.7.0a's top right sat over the right end of the enemy plate, where its hull number
 * is printed) it goes in the first screen corner (top right, bottom right, top left, bottom left; 2 px in, then flush
 * with the screen's edge) clear of both plates, both hulls, the playback bar and the REPLAY label: an iPhone turned on
 * its side and the desk, the bottom right, under the enemy hull and right of the bar. Where no corner is clear: on a
 * portrait phone, whose hulls fill its width, the top right as before, the square narrower than 0.7.0a's button so it
 * keeps off the enemy plate; on any other view, just under the enemy plate's right end, clear of it. The plates don't
 * move. Pure (tests).
 */
export function replayLeaveRect(L: BattleLayout, v: Pick<View, "W" | "H" | "scale" | "dpr">): Box {
  const { W, H } = L;
  const phone = isPhone(v);
  const h = phone ? Math.max(12, tapPx(v)) : 12, w = phone ? Math.max(h, textWidth("BACK", "3") + 6) : 36;
  const corners: Box[] = [2, 0].flatMap((m) => [
    { x: W - w - m, y: m, w, h }, { x: W - w - m, y: H - h - m, w, h }, { x: m, y: m, w, h }, { x: m, y: H - h - m, w, h },
  ]);
  const label = { x: 3, y: 3, w: textWidth("REPLAY", "3") + 2, h: 7 }; // the outlined REPLAY at (4, 4)
  const keep = [...L.plates, ...L.hulls, L.bar, label];
  const clear = corners.find((c) => keep.every((k) => !hits(c, k)));
  if (clear || phone) return clear ?? corners[0];
  const p = L.plates[1]; // no corner clear off a phone: just under the enemy plate's right end
  return { x: Math.max(0, Math.min(W - w, p.x + p.w - w)), y: Math.min(H - h, p.y + p.h + 1), w, h };
}

/** RUN-1 (REQ-BFG-059, D7): the replay banner: "REPLAY · DAY 3/10" for a 10-day run's dusk, exactly as before; "REPLAY · DAY 12"
 *  for a long run's (never "/N"). */
export const replayHead = (day: number, long: boolean): string => `REPLAY · ${dayText(day, long)}`;

export class ReplayScreen implements Screen {
  readonly arena: Arena;
  L!: BattleLayout;
  speed = SPEED_1X;
  /** The replayed fight has ended (its result shows). */
  over = false;
  private pt = 0;
  private left = false;
  private bar: BarState;
  private plateR = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
  private hp: [string, string] = ["", ""];
  private readonly heroName: string;
  /** MOTION-2 (REQ-BFG-071): the replay in motion. CUSTOM-2a (REVIEW-MOTION2 Q2): always (no ?motion=0). */
  readonly motion: ArenaMotion;
  private readonly seed: number;
  /** WIND-1 tooling (bb.windInfo): the DARK WIND callout's box as drawn this frame (null: not showing). */
  windCallR: Box | null = null;
  /** WIND-1 tooling (bb.windInfo): each plate as drawn this frame, [yours, the foe's]. */
  readonly plateRows: [PlateInfo | null, PlateInfo | null] = [null, null];
  /** WIND-2 (REQ-BFG-093) tooling (read only; scripts/mirror1shots.mjs): the playback bar's clock as drawn ("m:ss") and the
   *  result card's (whole seconds; "" until the card shows), both from statFormat.ts clockSec. */
  clockText = "0:00";
  cardClock = "";
  /** COUNT-1 (REQ-BFG-100; display only): the status rows, the guns' and belts' counts and their panels, as in the battle. */
  readonly counters = new BattleCounters();

  /** RUN-1 (REQ-BFG-059, D7): the replayed dusk is the run's own (the summary's and the result card's REPLAY, tooling's
   *  openReplay), so the run on the game says which words: a long run's mark (Run.longRun), never the switch. No run (a
   *  stand-in game, a stored record opened bare): the 10-day words, as before. */
  private get long(): boolean {
    const run = this.game.run;
    return !!run && longRun(run);
  }

  constructor(private game: Game, private back: Screen, battle: Battle, private label: { day: number; foe: string }) {
    const [mine, theirs] = battle.record.builds;
    this.seed = battle.record.seed;
    this.arena = new Arena(mine, theirs, battle.record.seed, game.audio, battle);
    this.arena.views[0].skin = playerSkin(); // CUSTOM-2a (R11): your side wears your styles; the foe's the defaults
    this.arena.off = [0, 0];
    this.heroName = HEROES[mine.hero].name;
    this.motion = new ArenaMotion(this.seed, battleScene(this.seed), MOTION, settings.reducedMotion); // FIELD-1: the dusk's setting
    // PAIR-CUE (REQ-BFG-100; REVIEW-COUNT1 ruling 3): the board counters draw under every number, as in the battle
    this.motion.underNumbers = (g) => this.drawBoardCounters(g);
    this.arena.cue = new PairWatch(); // PAIR-CUE (REQ-BFG-100, REQ-BFG-081): the PAIR on the board, while the replay runs
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

  /** REPLAY-1 (REQ-BFG-112): the queued merge toasts wait as on the screen BACK returns to (game.ts nextFuseToast): a result
   *  card's REPLAY holds them, as the card does (none is taken from the run while it plays); the summary holds none, so its
   *  REPLAY is as before. */
  get holdsMerges(): boolean {
    return !!this.back.holdsMerges;
  }

  private gridPick: { grid: Grid; W: number; H: number; portrait: boolean } | null = null;

  /** FIELD-1 (REQ-BFG-075): the battle's canvas grid (game/viewGrid.ts GameView.sub), as BattleScreen.pickSub. */
  pickSub(pw: number, ph: number, portrait: boolean, scale: number): number {
    const grid = battleGrid(pw, ph, portrait);
    if (grid.close !== scale) return 1;
    this.gridPick = { grid, W: Math.floor(pw / scale), H: Math.floor(ph / scale), portrait };
    return grid.sub;
  }

  private viewGrid(): Grid {
    const v = this.game.view, p = this.gridPick;
    const grid = p && p.W === v.W && p.H === v.H && p.portrait === v.portrait ? p.grid : battleGrid(v.W * v.scale, v.H * v.scale, v.portrait);
    return grid.close === v.scale && grid.sub === (v.sub ?? 1) ? grid : cameraGrid(v.scale, v.scale);
  }

  enter(): void {
    this.relayout();
    this.game.audio.music("battle");
  }

  private subKey = 0;

  private relayout(): void {
    const { W, H, portrait } = this.game;
    const sub = this.game.view.sub ?? 1;
    if (this.L && this.L.W === W && this.L.H === H && this.L.portrait === portrait && this.subKey === sub) return;
    this.subKey = sub;
    // MOTION-2: the battle's lanes (portrait as 0.9.4; landscape's enemy lane raised and a little ahead)
    this.L = laneLayout(battleLayout(W, H, portrait));
    this.motion.setLanes(this.L, minGap(portrait ? H : W));
    this.motion.useCamera(this.viewGrid(), cameraFocus(this.L), "wide"); // FIELD-1: WIDE, as the dusk
    this.arena.setFrames(this.L.frames, this.L.enter);
    // WIND-1 (REQ-BFG-093): the wind's numbers keep clear. COUNT-1 (REQ-BFG-100): of each plate's status row too
    this.motion.windKeep = { plates: plateKeep(this.L), bar: this.L.bar };
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
    this.counters.reset(); // COUNT-1: the skipped steps' jams are not shown
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
    this.motion.update(dt, settings.reducedMotion); // MOTION-2: the display clock (frame time; never the sim's)
    if (!this.over) {
      const ev = this.arena.update(dt);
      this.counters.events(ev); // COUNT-1 (REQ-BFG-053): the guns' jams, read only
      for (let i = 0; i < ev.length; i++) if (ev[i].type === "end" && !this.over) this.end();
      if (this.arena.b.over && !this.over) this.end();
    } else this.arena.update(dt, false);
  }

  /**
   * COUNT-1 (REQ-BFG-100): the guns' and belts' counts while the replay runs, under the plates and the bar; their tap
   * targets clear of the bar's buttons and BACK. PAIR-CUE (REVIEW-COUNT1 ruling 3): drawn from inside ArenaMotion.draw
   * (underNumbers), before every number, as in the battle.
   */
  private drawBoardCounters(g: G): void {
    for (let s = 0; s < 2; s++) {
      const p = this.L.plates[s], r = this.plateR[s];
      r.x = p.x; r.y = p.y; r.w = p.w; r.h = p.h;
    }
    const leave = replayLeaveRect(this.L, this.game.view);
    this.counters.drawBoard(g, this.game, this.arena, this.motion, [...plateKeep({ plates: [this.plateR[0], this.plateR[1]], hulls: this.L.hulls }), this.L.bar], [this.L.bar, leave], !this.over);
  }

  draw(g: G): void {
    const { W, H, ui } = this.game;
    const a = this.arena, b = a.b;
    const m = this.motion;
    this.counters.begin(); // COUNT-1: no counter groups yet this frame (PAIR-CUE: the board's are drawn inside m.draw)
    if (a.cue) a.cue.on = !this.over; // PAIR-CUE: while the replayed fight runs
    // MOTION-2: the day's sea, then the carriers, boards, shots and effects in motion
    m.drawSea(g, W, H, a.fx.shakeX, a.fx.shakeY, this.game.view.scale, this.game.view.dpr, this.seed, a);
    m.draw(g, a, W, H, settings.reducedMotion);
    for (let s = 0; s < 2; s++) {
      this.hp[s] = fmtDmg(Math.max(0, b.sides[s].hull.hp)); // NUM-4: the hull is whole (NUM-1); was Math.ceil
      const p = this.L.plates[s], r = this.plateR[s];
      r.x = p.x; r.y = p.y; r.w = p.w; r.h = p.h;
    }
    const live = !this.over, leave = replayLeaveRect(this.L, this.game.view);
    this.plateRows[1] = drawPlate(g, this.game, a, this.plateR[1], 1, this.label.foe, this.hp[1]);
    this.plateRows[0] = drawPlate(g, this.game, a, this.plateR[0], 0, this.heroName, this.hp[0]);
    this.counters.drawRows(g, this.game, a, this.L, this.plateR, this.plateRows, [this.L.bar, leave], live); // COUNT-1: C1, C2
    this.clockText = barClock(b.t); // WIND-2 (REQ-BFG-093): whole ticks, then whole seconds (was Math.floor(b.t): 1:08 at 69 s)
    const st = this.bar;
    st.speed = this.speed;
    st.compact = this.L.compact;
    st.paused = this.arena.paused;
    st.showSpeeds = !this.over;
    st.deskWind = !this.L.portrait && hullScaleRules(); // HULL-1d (REQ-BFG-079; ruling Q4): the desk bar's wind slot
    drawBar(g, this.game, a, this.L.bar, this.clockText, st);
    const cy = Math.round(H / 2);
    this.windCallR = drawWindCall(g, a, this.L, m, settings.reducedMotion); // WIND-1 (REQ-BFG-093): the callout, as the battle
    if (!this.over && this.pt < 1.6) banner(g, W, cy - 16, replayHead(this.label.day, this.long), C.ice, `VS ${this.label.foe}`, Math.min(1, this.pt / 0.35));
    drawText(g, "REPLAY", 4, 4, C.ice, { font: "3", outline: C.ink });
    // COUNT-1 (REQ-BFG-100): a counter group's panel (a tap's, or the desk's hover) while the replay runs
    if (live) this.counters.drawPanel(g, this.game, a, this.plateRows);
    else this.counters.open = null;
    if (this.over && this.pt > 0.6) {
      const won = b.winner === 0, lost = b.winner === 1;
      // shoptap (D5, backlog 319): on a phone BACK is at least TAP_CSS CSS px tall (R1 measured 30), the card as much taller
      const bh = replayBackH(this.game.view);
      const w = Math.min(W - 10, 150), h = 52 + bh - 15;
      const x = Math.round(W / 2 - w / 2), y = cy - Math.round(h / 2);
      panel(g, { x, y, w, h }, "raised");
      drawText(g, won ? "WIN" : lost ? "LOSS" : "DRAW", W / 2, y + 6, won ? C.lime : lost ? C.red : C.bone, { align: "center", scale: 2, outline: C.ink });
      this.cardClock = fmtClock(b.t);
      drawText(g, replayLine(this.label.day, this.cardClock), W / 2, y + 23, C.slate4, { font: "3", align: "center" }); // NUM-4: a clock; POLISH-1 (P3b): `24 SEC`
      button(ui, g, "replayback", { x: x + 10, y: y + h - 4 - bh, w: w - 20, h: bh }, "BACK", { primary: true, onTap: () => this.leave() });
    } else {
      button(ui, g, "replayleave", replayLeaveRect(this.L, this.game.view), "BACK", { font: "3", onTap: () => this.leave() });
    }
  }

  /** COUNT-1 (REQ-BFG-100): every press, before it is routed: a press off a counter group closes its panel. */
  pressed(_x: number, _y: number, region: string | null): void {
    this.counters.pressed(region);
  }

  key(k: string): void {
    if (k >= "1" && k <= "4" && k.length === 1) this.setSpeed(Number(k) - 1);
    else if (k === "s" || k === "S") this.skip();
    else if (k === "Escape" || ((k === "Enter" || k === " ") && this.over)) this.leave();
    else if (k === " " || k === "p" || k === "P") this.togglePause();
  }
}
