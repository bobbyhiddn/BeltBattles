// Run end (0.6.0): RUN COMPLETE (10 days survived, the W-L record, FLAWLESS at 10-0) or RUN LOST
// (the dark wind catches you, on day n). The card lists each day: the road event taken, the
// dusk opponent and the result, beside the cruiser (rolling victor or smoking wreck).
// RUN-1 (REQ-BFG-059, REQ-BFG-116; D7): a long run (Run.longRun: won at 10 wins, lost at 0 hearts, no day limit) ends RUN WON
// ("FURNACE WON 10 OF 13 DUSKS, ON DAY 13", FLAWLESS at 10 wins and 0 losses) or RUN LOST (its day and W-L); its history rows
// from day 11 on are marked (amber day), and a history too long for the screen folds its earliest days into one row.

import { playerSkin } from "../game/profile"; // CUSTOM-2a (REQ-BFG-072, R11): the player's side wears the chosen styles
import type { Game, Screen } from "../game/game";
import { saveRun, type Run } from "../game/run";
import { flawless, record } from "../game/day";
import type { EventId } from "../game/eventDefs";
import { HEROES, RUN_DAYS } from "../sim/content";
import { WIN_GOAL, longRun } from "../sim/longRun"; // RUN-1 (REQ-BFG-059, D7): the run's own mark picks the end card's words
import { endlessFootTail } from "./endlessText"; // ENDLESS-1 (REQ-BFG-059, 3.5): a run that played endless says ENDLESS n in the foot line
import { onLongRoad } from "./runDay"; // RUN-1: a long run's days past 10 are marked in the history
import { Fx } from "../render/fx";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { HULL_A, HULL_L, frameForHull, hullBox } from "../render/frame";
import { cruiserModel, drawTurrets, type CruiserView } from "../render/cruiser";
import { drawMachinery } from "../render/machinery";
import { SeaBackdrop } from "../render/backdrop"; // MOTION-2 (REQ-BFG-071): the day's sea behind the summary
import { seaForDay, stillSeaSeed } from "../render/motion";
import { dimStillPlate, drawStillCarrier } from "../render/ship"; // MOTION-2: the player's ship, held still
import { button, panel } from "../ui/ui";
import { TIER_COLOR, TIER_LABEL, nameColor } from "../ui/captain";
import type { BattleRecord } from "../sim/battle";
import { openReplay, replayAt } from "../game/replays";
import { foldRunEnd } from "../game/styleFolds"; // CUSTOM-2a (REQ-BFG-072): the run's end, folded once
import { loadProfile, runUnlockNames } from "../game/profile"; // CUSTOM-2a: the summary's NEW STYLE line
import { PHONE_CSS, TAP_CSS, isPhone, tapPx } from "../ui/tap"; // shoptap (D5): R1's rule, shared
import { livesLeft } from "../ui/stakes"; // RETUNE-1 run 2 (REQ-BFG-096): LIVES or HEARTS LEFT
import { lastChanceTag, lcStop } from "./lastChancePicker"; // LC-1 (REQ-BFG-073): the LAST CHANCE row's mark (RETUNE-1 run 2: lcStop, LC_STOP on a lives run)
import { HeroScreen } from "./hero";
import { ReplayScreen } from "./replay";
import { TitleScreen } from "./title";

const ROW = 8;

/** STOP column: one short word per road event (the event kinds run into OPPONENT). */
const STOP_LABEL: Record<EventId, string> = {
  wreck: "SALVAGE", cache: "CACHE", trader: "TRADER", dice: "GAMBLE", dock: "DOCK",
  herald: "BOUNTY", sappers: "SABOTAGE", scout: "SCOUT", storm: "STORM", smuggler: "SMUGGLER",
};
/** Widest STOP label (events, warlord tiers, DUSK): the column is sized to it. */
const STOP_W = Math.max(...[...Object.values(STOP_LABEL), ...Object.values(TIER_LABEL), "DUSK"].map((s) => textWidth(s, "3")));
const STOP_GAP = 8; // clear space between STOP and OPPONENT
const REPLAY_W = textWidth("REPLAY", "3") + 6; // 0.7.0a M4: the REPLAY column (online runs' dusks)

// 0.7.0 (R1 M1): TAP_CSS (44 CSS px) and PHONE_CSS (500 CSS px); shoptap: they live in ui/tap.ts, shared with the build
// and replay screens, and are re-exported here as before
export { PHONE_CSS, TAP_CSS };
const STRIP_GAP = 2; // between the REPLAY strip's buttons

/** What the summary's layout reads of the view (Game.view). */
export interface SummaryView {
  W: number;
  H: number;
  portrait: boolean;
  scale: number; // device px per logical px
  dpr: number;
}

export interface SummaryLayout {
  card: { x: number; y: number; w: number; h: number };
  hx: number; // the cruiser
  hy: number;
  rowH: number; // the round history's row pitch
  /**
   * 0.7.0 (R1 M1): on a phone with stored dusks, one REPLAY button per stored dusk (in history order), each at least
   * TAP_CSS CSS px tall and wide, in a strip under the round history: 8 px rows can't hold a 44 px target each (20 rows
   * of 44 px are taller than a phone). Null otherwise: desktop keeps 0.7.0a's REPLAY cell in the row; offline has none.
   */
  strip: { x: number; y: number; w: number; h: number }[] | null;
}

/** shoptap (D5, backlog 319): NEW RUN's and TITLE's height in logical px: 0.6.0's 21, and on a phone at least TAP_CSS
 *  CSS px (R1 measured them at 35 CSS px on the iPhone). The desktop keeps 21. */
export function summaryButtonH(v: SummaryView): number {
  return isPhone(v) ? Math.max(21, tapPx(v)) : 21;
}

/**
 * The run summary's layout (0.6.0; 0.7.0 R1 M1 adds `strip`). `fights` is the round history's row count, `replays` the
 * stored dusks. On a desktop (and a tablet) it is 0.7.0a's layout, exactly (and 0.6.2's, which has no replays).
 * shoptap (D5, backlog 319): on a phone NEW RUN and TITLE are summaryButtonH tall (the card grows by the difference), and
 * a card too tall for the screen slides up over the cruiser, offline too (R1's slide was for the REPLAY strip only: a
 * 360x640 phone's 20-row card ran 8 px off the screen offline).
 */
/** CUSTOM-2a (REQ-BFG-072): a NEW STYLE line's pitch under the lives line. The lines sit in the 21 px the card already
 *  leaves between the lives line and NEW RUN / TITLE (two lines fit), so the card doesn't move; only above a phone's
 *  REPLAY strip does the card grow by them (the strip moves down). */
export const NOTE_H = 8;

export function summaryLayout(v: SummaryView, fights: number, replays: number, notes = 0): SummaryLayout {
  const { W, H, portrait } = v;
  const rows = Math.max(1, fights);
  const w = Math.min(W - 12, 252);
  const k = v.scale / v.dpr; // CSS px per logical px
  const phone = isPhone(v);
  // the strip: rows of buttons TAP_CSS CSS px tall and at least as wide, spread evenly over the card's inner width
  let grid: { cols: number; bw: number; bh: number; S: number } | null = null;
  if (phone && replays > 0) {
    const bh = Math.ceil(TAP_CSS / k), inner = w - 16;
    const most = Math.max(1, Math.floor((inner + STRIP_GAP) / (bh + STRIP_GAP)));
    const lines = Math.ceil(replays / most), cols = Math.ceil(replays / lines);
    grid = { cols, bw: Math.floor((inner - (cols - 1) * STRIP_GAP) / cols), bh, S: lines * bh + (lines - 1) * STRIP_GAP };
  }
  // the strip sits between the lives line and NEW RUN / TITLE; shoptap (D5): a phone's taller NEW RUN / TITLE (0 elsewhere)
  // CUSTOM-2a (REQ-BFG-072): + the NEW STYLE lines where a REPLAY strip takes the room under the lives line (no strip:
  // they fit in the card's own gap, and the card is exactly as before)
  const notesH = grid ? notes * NOTE_H : 0;
  const extra = (grid ? grid.S - 8 : 0) + summaryButtonH(v) - 21 + notesH;
  const rowH = Math.max(6, Math.min(ROW, Math.floor((H - 8 - 110 - extra) / rows)));
  const h = 64 + rows * rowH + 12 + 38 + extra;
  const x = portrait ? Math.round(W / 2 - w / 2) : Math.round(W * 0.64 - w / 2);
  let y = portrait ? Math.max(HULL_L + 20, H - h - 8) : Math.max(4, Math.round(H / 2 - h / 2));
  // a long phone history slides over the cruiser (R1: with the REPLAY strip; shoptap D5: on any phone, offline too)
  if (phone && portrait && y + h > H - 4) y = Math.max(4, H - h - 8);
  const hx = Math.round(portrait ? W / 2 - HULL_A / 2 : Math.min(W * 0.26, x - 12 - HULL_A / 2) - HULL_A / 2);
  const hy = Math.round(portrait ? Math.max(6, (y - HULL_L) / 2) : H / 2 - HULL_L / 2);
  let strip: SummaryLayout["strip"] = null;
  if (grid) {
    const g = grid, top = y + 58 + rows * rowH + 13 + notesH; // 5 px under the lives line (and the NEW STYLE lines)
    strip = Array.from({ length: replays }, (_, i) => ({
      x: x + 8 + (i % g.cols) * (g.bw + STRIP_GAP), y: top + Math.floor(i / g.cols) * (g.bh + STRIP_GAP), w: g.bw, h: g.bh,
    }));
  }
  return { card: { x, y, w, h }, hx, hy, rowH, strip };
}

/** Fit a label into `w` px of the 3x5 face (trimmed, no ellipsis glyph needed). */
function fit(s: string, w: number): string {
  let t = s;
  while (t.length > 1 && textWidth(t, "3") > w) t = t.slice(0, -1);
  return t === s ? s : t.replace(/[ ·]+$/, "") + ".";
}

/** RUN-1 (REQ-BFG-059, D7): the end card's title: a 10-day run's "RUN COMPLETE" exactly as before; a long run's "RUN WON"; "RUN LOST"
 *  for either rule's loss. `won`: the run ended won (SummaryScreen.complete); `long`: the run's mark (Run.longRun). */
export const endTitle = (won: boolean, long: boolean): string => (won ? (long ? "RUN WON" : "RUN COMPLETE") : "RUN LOST");

/** RUN-1 (REQ-BFG-059, D7): a won run's line under the title. A 10-day run: "FURNACE · 10 DAYS SURVIVED · W-L 7-3", exactly as before. A
 *  long run: "FURNACE WON 10 OF 13 DUSKS, ON DAY 13" (the dusks fought, draws included; the day it ended on). */
export function wonLine(run: Pick<Run, "hero" | "wins" | "losses" | "day" | "history" | "longRun">): string {
  const hero = HEROES[run.hero].name;
  if (!longRun(run)) return `${hero} · ${RUN_DAYS} DAYS SURVIVED · W-L ${record(run)}`;
  return `${hero} WON ${run.wins} OF ${Math.max(run.history.length, run.wins + run.losses)} DUSKS, ON DAY ${run.day}`;
}

/** The history's foot line: "7 HEARTS LEFT · WINS 3/10" (RETUNE-1 run 2: HEARTS on a hearts run, else LIVES). RUN-1 (D2): the 10 is the
 *  goal, WIN_GOAL on a long run (it was RUN_DAYS, also 10): the text is the same either way. */
export const footLine = (run: Pick<Run, "hearts" | "lives" | "wins" | "longRun" | "endlessRun">): string =>
  run.endlessRun // ENDLESS-1 (REQ-BFG-059, 3.5): a run that played endless reads "0 HEARTS LEFT · ENDLESS 7", never "WINS 10/10" (screens/endlessText.ts)
    ? `${livesLeft(run)}${endlessFootTail(run.endlessRun)}`
    : `${livesLeft(run)} · WINS ${run.wins}/${longRun(run) ? WIN_GOAL : RUN_DAYS}`;

/** A lost run's second line: "ON DAY 12 · FURNACE · W-L 6-6" (its day and record; either rule's, unchanged by RUN-1). */
export const lostLine = (run: Pick<Run, "hero" | "wins" | "losses" | "day">): string => `ON DAY ${run.day} · ${HEROES[run.hero].name} · W-L ${record(run)}`;

/** 0.7.0a M4: a dusk row's replay: playable, or why not (D6: another rules version says so). */
interface RowReplay {
  record: BattleRecord;
  why: string | null; // null: REPLAY plays it
}

/** One row of the run's history (fights()). RUN-1 (D7): `fold`, on a long run too deep for the screen, stands for the earliest days:
 *  one row that says the days it covers and the dusks' wins, losses and draws there (foldRows). */
export interface HistoryRow {
  day: number; stop: string; stopColor: string; foe: string; foeColor: string; outcome: "win" | "loss" | "draw"; time: number;
  at?: number; replay?: RowReplay; lc?: string;
  fold?: { from: number; to: number; w: number; l: number; d: number };
}

/** RUN-1 (REQ-BFG-059, D7): `rows` as the card draws them when only `keep` rows fit: the same rows when they all fit, else the
 *  earliest `rows.length - keep + 1` of them folded into one row ("DAYS 1-8 · 6 W · 2 L", the dusks only: a warlord fight is no
 *  dusk) and the latest `keep - 1` kept whole (`keep` is at least 2: the run's last row always stays). The fold takes whole days
 *  (a day's warlord row and its dusk are never split) and at least two of them ("DAYS 1-1" says no more than its rows do), so it
 *  may take a few rows more than it must. */
export function foldRows(rows: HistoryRow[], keep: number): HistoryRow[] {
  const k = Math.max(2, keep);
  if (rows.length <= k) return rows;
  const last = rows.length - 1;
  const whole = (n: number): number => { // the cut at `n` rows, moved on to the end of the day it falls in (never past the last row)
    let m = Math.min(n, last);
    while (m < last && rows[m].day === rows[m - 1].day) m++;
    return m;
  };
  let n = whole(rows.length - k + 1);
  if (rows[n - 1].day === rows[0].day) n = whole(n + 1); // one day: take a second
  const first = rows.slice(0, n), dusks = first.filter((r) => r.at !== undefined);
  const count = (o: HistoryRow["outcome"]): number => dusks.filter((r) => r.outcome === o).length;
  const row: HistoryRow = {
    day: first[n - 1].day, stop: "", stopColor: C.slate4, foe: "", foeColor: C.slate4, outcome: "draw", time: 0,
    fold: { from: first[0].day, to: first[n - 1].day, w: count("win"), l: count("loss"), d: count("draw") },
  };
  return [row, ...rows.slice(n)];
}

/** The words of a folded row: "DAYS 1-8 · 6 W · 2 L" (a draw count only when there was one). */
export const foldText = (f: NonNullable<HistoryRow["fold"]>): string =>
  `DAYS ${f.from}-${f.to} · ${f.w} W · ${f.l} L${f.d ? ` · ${f.d} D` : ""}`;

export class SummaryScreen implements Screen {
  private run: Run;
  private t = 0;
  private fx = new Fx();
  /** MOTION-2 (REQ-BFG-071): the run's last day's sea, held still (one cached blit a frame). */
  private sea = new SeaBackdrop();
  private view: CruiserView;
  private entered = false;
  /** CUSTOM-2a (REQ-BFG-072): the styles this run unlocked (the NEW STYLE line), read once on entering. */
  newStyles: string[] = [];
  /** 0.7.0a M4: per history index, the stored dusk record's replay (online runs only: offline dusks store none). */
  private readonly replays = new Map<number, RowReplay>();

  constructor(private game: Game) {
    this.run = game.run!;
    this.view = {
      side: 0, build: this.run.build, model: cruiserModel(this.run.build), frame: frameForHull(0, 0, 0), t: 0, tread: 0,
      skin: playerSkin(), // CUSTOM-2a (R11): your deck in your styles
    };
    this.run.history.forEach((d, i) => {
      if (!d.record) return;
      // checked once here (rules, shapes; RUNES-087F: WARLORD'S DUE's wins against the run's record); a fresh Battle is
      // made when REPLAY is tapped
      const o = openReplay(d.record, replayAt(this.run.history, i));
      this.replays.set(i, { record: d.record, why: o.ok ? null : o.why });
    });
  }

  get complete(): boolean {
    return this.run.over === "complete" || this.run.over === "won"; // RUN-1 (REQ-BFG-059): a long run's WON
  }

  enter(): void {
    if (this.entered) return this.game.audio.music(null); // back from a replay: nothing to save or announce again
    this.entered = true;
    foldRunEnd(this.run); // CUSTOM-2a (REQ-BFG-072): once per run (the battle may have folded it already)
    this.newStyles = runUnlockNames(loadProfile(), this.run.runId);
    saveRun(null);
    this.game.audio.music(null);
    this.game.audio.play(this.complete ? "win" : "lose");
  }

  /** CUSTOM-2a (REQ-BFG-072): the NEW STYLE lines: one for each style the run unlocked, two at most (a third and more
   *  are counted on the second line). */
  noteLines(): string[] {
    const n = this.newStyles;
    if (n.length <= 2) return n.map((name) => `NEW STYLE: ${name}.`);
    return [`NEW STYLE: ${n[0]}.`, `NEW STYLES: ${n.length - 1} MORE IN CUSTOMIZE.`];
  }

  /** 0.7.0a M4 (D6): play history[i]'s stored dusk record, read-only; another rules version is refused with its reason. */
  replay(i: number): void {
    const r = this.replays.get(i);
    if (!r) return;
    const o = openReplay(r.record, replayAt(this.run.history, i));
    if (!o.ok) return this.game.toast(o.why, C.amber);
    const d = this.run.history[i];
    this.game.go(new ReplayScreen(this.game, this, o.battle, { day: d.day, foe: d.foe }));
  }

  /** 0.6.0b: every fight of the run in order: each day's warlord fight (if one was picked), then its dusk. 0.7.0a: a
   *  dusk row carries its history index (`at`) and, online, its replay. */
  fights(): HistoryRow[] {
    const run = this.run;
    const out: HistoryRow[] = [];
    run.history.forEach((d, at) => {
      for (const w of run.warlords.filter((q) => q.day === d.day)) {
        out.push({ day: w.day, stop: TIER_LABEL[w.tier], stopColor: TIER_COLOR[w.tier], foe: w.name, foeColor: nameColor(w.id), outcome: w.outcome, time: w.time });
      }
      const ev = run.events.find((e) => e.day === d.day);
      const warlordDay = run.warlords.some((q) => q.day === d.day);
      const stop = warlordDay ? "DUSK" : ev ? STOP_LABEL[ev.id] : "DUSK";
      // LC-1 (REQ-BFG-073): the dusk that fired LAST CHANCE: STOP says the life came back, and the row ends with the card taken
      const lc = d.lastChance ? lastChanceTag(d.lastChance) : undefined;
      out.push({ day: d.day, stop: lc ? lcStop(run) : stop, stopColor: lc ? C.lime : warlordDay || !ev ? C.slate4 : C.amber, foe: d.foe, foeColor: d.ghost ? C.ice : C.bone, outcome: d.outcome, time: d.time, at, replay: this.replays.get(at), ...(lc ? { lc } : {}) });
    });
    return out;
  }

  /** RUN-1 (REQ-BFG-059, D7): the rows the card draws. A 10-day run's are fights(), whole (the card is laid out for up to 20, as
   *  before). A long run's are fights() too, unless the card would run off the screen (a run into the high teens of days, the
   *  strip under it as tall as its stored dusks need): then the earliest days fold into one row (foldRows) until it fits. */
  rows(): HistoryRow[] {
    const all = this.fights();
    if (!longRun(this.run)) return all;
    const v = this.game.view, replays = this.replays.size, notes = this.noteLines().length;
    let keep = all.length;
    for (; keep > 2; keep--) {
      const L = summaryLayout(v, keep, replays, notes);
      if (L.card.y + L.card.h <= v.H - 4) break;
    }
    return foldRows(all, keep);
  }

  private layout(): SummaryLayout {
    return summaryLayout(this.game.view, this.rows().length, this.replays.size, this.noteLines().length);
  }

  update(dt: number): void {
    this.t += dt;
    this.fx.update(dt);
    const { hx, hy } = this.layout();
    const hb = hullBox(frameForHull(0, hx, hy));
    if (!this.complete && Math.random() < dt * 7) {
      this.fx.smoke(hb.x + 20 + Math.random() * (hb.w - 40), hb.y + 20 + Math.random() * (hb.h - 40), 2, true, 16);
      if (Math.random() < 0.3) this.fx.embers(hb.x + 30 + Math.random() * (hb.w - 60), hb.y + 60, 3);
    }
    if (this.complete && Math.random() < dt * 3) this.fx.sparkle(hb.x + Math.random() * hb.w, hb.y + Math.random() * hb.h);
  }

  draw(g: G): void {
    const { W, H, ui } = this.game;
    const run = this.run;
    const won = this.complete;
    const { card, hx, hy, rowH, strip } = this.layout();
    const v = this.view;
    v.frame = frameForHull(0, hx, hy);
    v.t = this.t;
    v.tread = won ? this.t * 20 : 0;
    // MOTION-2 (REQ-BFG-071): one world on every screen. The run's last day's sea, held still, and the player's own
    // ship, held still under its board (a lost run's wreck dimmed as before). CUSTOM-2a (REVIEW-MOTION2 Q2): the only look.
    this.sea.drawStill(g, { W, H, kind: seaForDay(run.day), dist: 0, t: 0, reduced: false, seed: stillSeaSeed(run.day), scale: this.game.view.scale, dpr: this.game.view.dpr });
    drawStillCarrier(g, v.model.hero, v.frame, won ? 0 : 0.55, v.skin?.floor, v.skin?.carrier); // CUSTOM-3: your carrier style
    drawMachinery(g, v);
    drawTurrets(g, v);
    if (!won) dimStillPlate(g, v.frame, 0.55);
    this.fx.draw(g, 0, 0);
    const { x, y, w, h } = card;
    const cx = x + w / 2;
    panel(g, card, "raised");
    drawText(g, endTitle(won, longRun(run)), cx, y + 6, won ? C.lime : C.red, { align: "center", scale: 2, outline: C.ink }); // RUN-1: RUN WON on a long run
    if (won) {
      drawText(g, wonLine(run), cx, y + 23, C.bone, { font: "3", align: "center" }); // RUN-1: "FURNACE WON 10 OF 13 DUSKS, ON DAY 13" on a long run
      if (flawless(run)) {
        const fw = textWidth("FLAWLESS") + 8;
        rect(g, Math.round(cx - fw / 2), y + 31, fw, 11, C.yellow);
        drawText(g, "FLAWLESS", cx, y + 33, C.ink, { align: "center" });
      } else drawText(g, `${livesLeft(run)} · ${run.gold} GOLD`, cx, y + 33, C.slate4, { font: "3", align: "center" }); // RETUNE-1 run 2: HEARTS on a hearts run
    } else {
      drawText(g, "THE DARK WIND CATCHES YOU", cx, y + 23, C.bone, { font: "3", align: "center" });
      drawText(g, lostLine(run), cx, y + 32, C.slate4, { font: "3", align: "center" });
    }
    this.drawDays(g, x + 8, y + 48, w - 16, rowH, !strip);
    // CUSTOM-2a (REQ-BFG-072): the styles this run unlocked, under the lives line (TEXT-STYLE 8.3: LABEL: TEXT.)
    const ny = y + 58 + Math.max(1, this.rows().length) * rowH + 12;
    this.noteLines().forEach((ln, i) => drawText(g, ln, cx, ny + i * NOTE_H, C.yellow, { font: "3", align: "center" }));
    if (strip) this.drawStrip(g, strip);
    const bh = summaryButtonH(this.game.view); // shoptap (D5): 21 px, and on a phone at least 44 CSS px
    const by = y + h - bh - 6;
    button(ui, g, "again", { x: x + 10, y: by, w: w / 2 - 14, h: bh }, "NEW RUN", {
      primary: true, onTap: () => { this.game.run = null; this.game.go(new HeroScreen(this.game)); },
    });
    button(ui, g, "title", { x: x + w / 2 + 4, y: by, w: w / 2 - 14, h: bh }, "TITLE", {
      onTap: () => { this.game.run = null; this.game.go(new TitleScreen(this.game)); },
    });
  }

  /** 0.7.0 (R1 M1): the phone's REPLAY strip, one button per stored dusk in history order (summaryLayout `strip`): REPLAY
   *  and the day, or RULES for a record of other rules, which says why when tapped (D6). Same ids as the desk's cells. */
  private drawStrip(g: G, strip: { x: number; y: number; w: number; h: number }[]): void {
    const rows = this.fights().filter((f) => f.replay && f.at !== undefined);
    rows.forEach((f, i) => {
      const r = strip[i], at = f.at!, ok = f.replay!.why === null;
      const label = ok ? "REPLAY" : "RULES", sub = `DAY ${f.day}`;
      const one = `${label} ${sub}`;
      if (textWidth(one) <= r.w - 8) {
        button(this.game.ui, g, `replay${at}`, r, one, ok ? { onTap: () => this.replay(at) } : { disabled: true, onBlocked: () => this.replay(at) });
      } else {
        const font = textWidth(label) <= r.w - 6 ? "5" : "3";
        button(this.game.ui, g, `replay${at}`, r, label, { font, sub, ...(ok ? { onTap: () => this.replay(at) } : { disabled: true, onBlocked: () => this.replay(at) }) });
      }
    });
  }

  /** One row per fight: DAY · STOP (warlord tier, or the road event before a dusk) · OPPONENT ·
   *  TIME · W / L / D; then lives left and WINS n/10 (dusk wins). 0.7.0 (R1 M1): `cells` false (a phone with stored
   *  dusks) leaves out the REPLAY column; the strip under the history carries those targets. */
  private drawDays(g: G, x: number, y: number, w: number, rh: number, cells: boolean): void {
    const run = this.run;
    const cDay = x, cStop = x + 16, cRes = x + w - 10, cTime = cRes - 4;
    // 0.7.0a M4: a REPLAY column beside TIME when any dusk stored its record (online runs); none offline, as 0.6.2
    const repW = cells && this.replays.size ? REPLAY_W : 0;
    const stopW = STOP_W, cFoe = cStop + stopW + STOP_GAP, foeW = cTime - 22 - cFoe - repW, cRep = cTime - 20 - repW;
    drawText(g, "DAY", cDay, y, C.slate3, { font: "3" });
    drawText(g, "STOP", cStop, y, C.slate3, { font: "3" });
    drawText(g, "OPPONENT", cFoe, y, C.slate3, { font: "3" });
    drawText(g, "TIME", cTime, y, C.slate3, { font: "3", align: "right" });
    rect(g, x, y + 7, w, 1, C.slate1);
    let ry = y + 10;
    for (const f of this.rows()) {
      if (f.fold) {
        // RUN-1 (D7): the earliest days of a long run too deep for the card, folded: "DAYS 1-8 · 6 W · 2 L", one row
        drawText(g, foldText(f.fold), cDay, ry, C.slate4, { font: "3" });
        ry += rh;
        continue;
      }
      drawText(g, String(f.day), cDay + 8, ry, onLongRoad(f.day, longRun(run)) ? C.amber : C.slate4, { font: "3", align: "right" }); // RUN-1: day 11+ of a long run, amber
      drawText(g, fit(f.stop, stopW), cStop, ry, f.stopColor, { font: "3" });
      if (f.lc) {
        // LC-1: the card taken, in lime at the column's end; the foe's name gives way
        const tw = textWidth(f.lc, "3");
        drawText(g, fit(f.foe, Math.max(0, foeW - tw - 4)), cFoe, ry, f.foeColor, { font: "3" });
        drawText(g, f.lc, cFoe + foeW - tw, ry, C.lime, { font: "3" });
      } else drawText(g, fit(f.foe, foeW), cFoe, ry, f.foeColor, { font: "3" });
      if (cells && f.replay && f.at !== undefined) {
        // REPLAY plays the stored dusk (read-only); a record of other rules says so when tapped (D6)
        const at = f.at, ok = f.replay.why === null;
        drawText(g, ok ? "REPLAY" : "RULES", cRep, ry, ok ? C.ice : C.slate3, { font: "3" });
        this.game.ui.add({ id: `replay${at}`, r: { x: cRep - 2, y: ry - 2, w: REPLAY_W - 2, h: Math.max(7, rh) }, onTap: () => this.replay(at) });
      }
      const s = Math.round(f.time);
      drawText(g, `${Math.floor(s / 60)}:${s % 60 < 10 ? "0" : ""}${s % 60}`, cTime, ry, C.slate4, { font: "3", align: "right" });
      const c = f.outcome === "win" ? C.lime : f.outcome === "loss" ? C.red : C.slate3;
      rect(g, cRes, ry - 1, 10, 7, C.ink);
      rect(g, cRes + 1, ry, 8, 5, c);
      drawText(g, f.outcome === "win" ? "W" : f.outcome === "loss" ? "L" : "D", cRes + 3, ry, C.ink, { font: "3" });
      ry += rh;
    }
    rect(g, x, ry, w, 1, C.slate1);
    drawText(g, footLine(run), x + w / 2, ry + 3, C.white, { font: "3", align: "center" });
  }

  key(k: string): void {
    if (k === "Enter" || k === " ") {
      this.game.run = null;
      this.game.go(new HeroScreen(this.game));
    }
  }
}
