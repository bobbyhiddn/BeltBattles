// Run end (0.6.0): RUN COMPLETE (10 days survived, the W-L record, FLAWLESS at 10-0) or RUN LOST
// (the dark wind catches you, on day n). The card lists each day: the road event taken, the
// dusk opponent and the result, beside the cruiser (rolling victor or smoking wreck).

import type { Game, Screen } from "../game/game";
import { saveRun, type Run } from "../game/run";
import { flawless, record } from "../game/day";
import { EVENTS } from "../game/eventDefs";
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
import { HeroScreen } from "./hero";
import { TitleScreen } from "./title";

const ROW = 8;

/** Fit a label into `w` px of the 3x5 face (trimmed, no ellipsis glyph needed). */
function fit(s: string, w: number): string {
  let t = s;
  while (t.length > 1 && textWidth(t, "3") > w) t = t.slice(0, -1);
  return t === s ? s : t.replace(/[ ·]+$/, "") + ".";
}

export class SummaryScreen implements Screen {
  private run: Run;
  private t = 0;
  private fx = new Fx();
  private bg = new ArenaBg();
  private view: CruiserView;

  constructor(private game: Game) {
    this.run = game.run!;
    this.view = {
      side: 0, build: this.run.build, model: cruiserModel(this.run.build), frame: frameForHull(0, 0, 0), t: 0, tread: 0,
    };
  }

  get complete(): boolean {
    return this.run.over === "complete";
  }

  enter(): void {
    saveRun(null);
    this.game.audio.music(null);
    this.game.audio.play(this.complete ? "win" : "lose");
  }

  /** 0.6.0b: every fight of the run in order: each day's warlord fight (if one was picked), then its dusk. */
  fights(): { day: number; stop: string; stopColor: string; foe: string; foeColor: string; outcome: "win" | "loss" | "draw"; time: number }[] {
    const run = this.run;
    const out: ReturnType<SummaryScreen["fights"]> = [];
    for (const d of run.history) {
      for (const w of run.warlords.filter((q) => q.day === d.day)) {
        out.push({ day: w.day, stop: TIER_LABEL[w.tier], stopColor: TIER_COLOR[w.tier], foe: w.name, foeColor: nameColor(w.id), outcome: w.outcome, time: w.time });
      }
      const ev = run.events.find((e) => e.day === d.day);
      const warlordDay = run.warlords.some((q) => q.day === d.day);
      const stop = warlordDay ? "DUSK" : ev ? EVENTS[ev.id].kind : "DUSK";
      out.push({ day: d.day, stop, stopColor: warlordDay || !ev ? C.slate4 : C.amber, foe: d.foe, foeColor: d.ghost ? C.ice : C.bone, outcome: d.outcome, time: d.time });
    }
    return out;
  }

  private rowH(): number {
    const rows = Math.max(1, this.fights().length);
    return Math.max(6, Math.min(ROW, Math.floor((this.game.H - 8 - 110) / rows)));
  }

  private layout(): { card: { x: number; y: number; w: number; h: number }; hx: number; hy: number } {
    const { W, H, portrait } = this.game;
    const rows = Math.max(1, this.fights().length);
    const w = Math.min(W - 12, 252), h = 64 + rows * this.rowH() + 12 + 38;
    const x = portrait ? Math.round(W / 2 - w / 2) : Math.round(W * 0.64 - w / 2);
    const y = portrait ? Math.max(HULL_L + 20, H - h - 8) : Math.max(4, Math.round(H / 2 - h / 2));
    const hx = Math.round(portrait ? W / 2 - HULL_A / 2 : Math.min(W * 0.26, x - 12 - HULL_A / 2) - HULL_A / 2);
    const hy = Math.round(portrait ? Math.max(6, (y - HULL_L) / 2) : H / 2 - HULL_L / 2);
    return { card: { x, y, w, h }, hx, hy };
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
    const { card, hx, hy } = this.layout();
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
    this.drawDays(g, x + 8, y + 48, w - 16);
    const by = y + h - 27;
    button(ui, g, "again", { x: x + 10, y: by, w: w / 2 - 14, h: 21 }, "NEW RUN", {
      primary: true, onTap: () => { this.game.run = null; this.game.go(new HeroScreen(this.game)); },
    });
    button(ui, g, "title", { x: x + w / 2 + 4, y: by, w: w / 2 - 14, h: 21 }, "TITLE", {
      onTap: () => { this.game.run = null; this.game.go(new TitleScreen(this.game)); },
    });
  }

  /** One row per fight: DAY · STOP (warlord tier, or the road event before a dusk) · OPPONENT ·
   *  TIME · W / L / D; then lives left and WINS n/10 (dusk wins). */
  private drawDays(g: G, x: number, y: number, w: number): void {
    const run = this.run;
    const rh = this.rowH();
    const cDay = x, cStop = x + 13, cRes = x + w - 10, cTime = cRes - 4;
    const stopW = 40, cFoe = cStop + stopW + 3, foeW = cTime - 22 - cFoe;
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
