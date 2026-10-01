// Run end (0.6.0): RUN COMPLETE (10 days survived, the W-L record, FLAWLESS at 10-0) or RUN LOST
// (the dark wind catches you, on day n). The card lists each day: the road event taken, the
// dusk opponent and the result, beside the cruiser (rolling victor or smoking wreck).

import type { Game, Screen } from "../game/game";
import { saveRun, type Run } from "../game/run";
import { flawless, record } from "../game/day";
import type { EventId } from "../game/eventDefs";
import { HEROES, RUN_DAYS } from "../sim/content";
import { Fx } from "../render/fx";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { HULL_A, HULL_L, frameForHull, hullBox } from "../render/frame";
import { cruiserModel, drawDim, drawHull, drawTurrets, type CruiserView } from "../render/cruiser";
import { drawMachinery } from "../render/machinery";
import { ArenaBg } from "../render/arenaBg";
import { button, panel } from "../ui/ui";
import { TIER_COLOR, TIER_LABEL, nameColor } from "../ui/captain";
import type { BattleRecord } from "../sim/battle";
import { openReplay } from "../game/replays";
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

/** 0.7.0 (R1 M1): the smallest tap target on a phone, in CSS px (Apple's 44 pt). */
export const TAP_CSS = 44;
/** 0.7.0 (R1 M1): a phone's viewport is under this many CSS px on its short side (portrait phones are 320-430 px wide,
 *  landscape ones as tall); desktops, laptops and tablets are not. */
export const PHONE_CSS = 500;
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

/**
 * The run summary's layout (0.6.0; 0.7.0 R1 M1 adds `strip`). `fights` is the round history's row count, `replays` the
 * stored dusks. Without a strip it is 0.7.0a's layout, exactly (and 0.6.2's, which has no replays).
 */
export function summaryLayout(v: SummaryView, fights: number, replays: number): SummaryLayout {
  const { W, H, portrait } = v;
  const rows = Math.max(1, fights);
  const w = Math.min(W - 12, 252);
  const k = v.scale / v.dpr; // CSS px per logical px
  const phone = Math.min(W, H) * k < PHONE_CSS;
  // the strip: rows of buttons TAP_CSS CSS px tall and at least as wide, spread evenly over the card's inner width
  let grid: { cols: number; bw: number; bh: number; S: number } | null = null;
  if (phone && replays > 0) {
    const bh = Math.ceil(TAP_CSS / k), inner = w - 16;
    const most = Math.max(1, Math.floor((inner + STRIP_GAP) / (bh + STRIP_GAP)));
    const lines = Math.ceil(replays / most), cols = Math.ceil(replays / lines);
    grid = { cols, bw: Math.floor((inner - (cols - 1) * STRIP_GAP) / cols), bh, S: lines * bh + (lines - 1) * STRIP_GAP };
  }
  const extra = grid ? grid.S - 8 : 0; // the strip sits between the lives line and NEW RUN / TITLE
  const rowH = Math.max(6, Math.min(ROW, Math.floor((H - 8 - 110 - extra) / rows)));
  const h = 64 + rows * rowH + 12 + 38 + extra;
  const x = portrait ? Math.round(W / 2 - w / 2) : Math.round(W * 0.64 - w / 2);
  let y = portrait ? Math.max(HULL_L + 20, H - h - 8) : Math.max(4, Math.round(H / 2 - h / 2));
  if (grid && portrait && y + h > H - 4) y = Math.max(4, H - h - 8); // a long phone history slides over the cruiser
  const hx = Math.round(portrait ? W / 2 - HULL_A / 2 : Math.min(W * 0.26, x - 12 - HULL_A / 2) - HULL_A / 2);
  const hy = Math.round(portrait ? Math.max(6, (y - HULL_L) / 2) : H / 2 - HULL_L / 2);
  let strip: SummaryLayout["strip"] = null;
  if (grid) {
    const g = grid, top = y + 58 + rows * rowH + 13; // 5 px under the lives line
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

/** 0.7.0a M4: a dusk row's replay: playable, or why not (D6: another rules version says so). */
interface RowReplay {
  record: BattleRecord;
  why: string | null; // null: REPLAY plays it
}

export class SummaryScreen implements Screen {
  private run: Run;
  private t = 0;
  private fx = new Fx();
  private bg = new ArenaBg();
  private view: CruiserView;
  private entered = false;
  /** 0.7.0a M4: per history index, the stored dusk record's replay (online runs only: offline dusks store none). */
  private readonly replays = new Map<number, RowReplay>();

  constructor(private game: Game) {
    this.run = game.run!;
    this.view = {
      side: 0, build: this.run.build, model: cruiserModel(this.run.build), frame: frameForHull(0, 0, 0), t: 0, tread: 0,
    };
    this.run.history.forEach((d, i) => {
      if (!d.record) return;
      const o = openReplay(d.record); // checked once here (rules, shapes); a fresh Battle is made when REPLAY is tapped
      this.replays.set(i, { record: d.record, why: o.ok ? null : o.why });
    });
  }

  get complete(): boolean {
    return this.run.over === "complete";
  }

  enter(): void {
    if (this.entered) return this.game.audio.music(null); // back from a replay: nothing to save or announce again
    this.entered = true;
    saveRun(null);
    this.game.audio.music(null);
    this.game.audio.play(this.complete ? "win" : "lose");
  }

  /** 0.7.0a M4 (D6): play history[i]'s stored dusk record, read-only; another rules version is refused with its reason. */
  replay(i: number): void {
    const r = this.replays.get(i);
    if (!r) return;
    const o = openReplay(r.record);
    if (!o.ok) return this.game.toast(o.why, C.amber);
    const d = this.run.history[i];
    this.game.go(new ReplayScreen(this.game, this, o.battle, { day: d.day, foe: d.foe }));
  }

  /** 0.6.0b: every fight of the run in order: each day's warlord fight (if one was picked), then its dusk. 0.7.0a: a
   *  dusk row carries its history index (`at`) and, online, its replay. */
  fights(): { day: number; stop: string; stopColor: string; foe: string; foeColor: string; outcome: "win" | "loss" | "draw"; time: number; at?: number; replay?: RowReplay }[] {
    const run = this.run;
    const out: ReturnType<SummaryScreen["fights"]> = [];
    run.history.forEach((d, at) => {
      for (const w of run.warlords.filter((q) => q.day === d.day)) {
        out.push({ day: w.day, stop: TIER_LABEL[w.tier], stopColor: TIER_COLOR[w.tier], foe: w.name, foeColor: nameColor(w.id), outcome: w.outcome, time: w.time });
      }
      const ev = run.events.find((e) => e.day === d.day);
      const warlordDay = run.warlords.some((q) => q.day === d.day);
      const stop = warlordDay ? "DUSK" : ev ? STOP_LABEL[ev.id] : "DUSK";
      out.push({ day: d.day, stop, stopColor: warlordDay || !ev ? C.slate4 : C.amber, foe: d.foe, foeColor: d.ghost ? C.ice : C.bone, outcome: d.outcome, time: d.time, at, replay: this.replays.get(at) });
    });
    return out;
  }

  private layout(): SummaryLayout {
    return summaryLayout(this.game.view, this.fights().length, this.replays.size);
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
    this.bg.draw(g, W, H, { hulls: [hullBox(v.frame)], vertical: true, gapLine: false, pad: { x: hx - 6, y: hy - 6, w: HULL_A + 12, h: HULL_L + 12 } }, this.t);
    drawHull(g, v);
    drawMachinery(g, v);
    drawTurrets(g, v);
    if (!won) drawDim(g, v, 0.55);
    this.fx.draw(g, 0, 0);
    const { x, y, w, h } = card;
    const cx = x + w / 2;
    panel(g, card, "raised");
    drawText(g, won ? "RUN COMPLETE" : "RUN LOST", cx, y + 6, won ? C.lime : C.red, { align: "center", scale: 2, outline: C.ink });
    const hero = HEROES[run.hero].name;
    if (won) {
      drawText(g, `${hero} · ${RUN_DAYS} DAYS SURVIVED · W-L ${record(run)}`, cx, y + 23, C.bone, { font: "3", align: "center" });
      if (flawless(run)) {
        const fw = textWidth("FLAWLESS") + 8;
        rect(g, Math.round(cx - fw / 2), y + 31, fw, 11, C.yellow);
        drawText(g, "FLAWLESS", cx, y + 33, C.ink, { align: "center" });
      } else drawText(g, `${run.lives} ${run.lives === 1 ? "LIFE" : "LIVES"} LEFT · ${run.gold} GOLD`, cx, y + 33, C.slate4, { font: "3", align: "center" });
    } else {
      drawText(g, "THE DARK WIND CATCHES YOU", cx, y + 23, C.bone, { font: "3", align: "center" });
      drawText(g, `ON DAY ${run.day} · ${hero} · W-L ${record(run)}`, cx, y + 32, C.slate4, { font: "3", align: "center" });
    }
    this.drawDays(g, x + 8, y + 48, w - 16, rowH, !strip);
    if (strip) this.drawStrip(g, strip);
    const by = y + h - 27;
    button(ui, g, "again", { x: x + 10, y: by, w: w / 2 - 14, h: 21 }, "NEW RUN", {
      primary: true, onTap: () => { this.game.run = null; this.game.go(new HeroScreen(this.game)); },
    });
    button(ui, g, "title", { x: x + w / 2 + 4, y: by, w: w / 2 - 14, h: 21 }, "TITLE", {
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
    for (const f of this.fights()) {
      drawText(g, String(f.day), cDay + 8, ry, C.slate4, { font: "3", align: "right" });
      drawText(g, fit(f.stop, stopW), cStop, ry, f.stopColor, { font: "3" });
      drawText(g, fit(f.foe, foeW), cFoe, ry, f.foeColor, { font: "3" });
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
    const lives = `${run.lives} ${run.lives === 1 ? "LIFE" : "LIVES"} LEFT`;
    drawText(g, `${lives} · WINS ${run.wins}/${RUN_DAYS}`, x + w / 2, ry + 3, C.white, { font: "3", align: "center" });
  }

  key(k: string): void {
    if (k === "Enter" || k === " ") {
      this.game.run = null;
      this.game.go(new HeroScreen(this.game));
    }
  }
}
