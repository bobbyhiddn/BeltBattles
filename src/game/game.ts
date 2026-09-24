// Game shell: canvas + main loop, per-screen integer view scale, screen switching with a
// pixel-iris wipe, input routing (UI regions registered last frame first, then the active
// screen), toasts, and frame timing for the tooling hooks.

import { Audio, type Sfx } from "../audio/audio";
import { applyView, bindInput, computeView, type InputSink, type View } from "../core/io";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { button, panel, UI, type Rect } from "../ui/ui";
import type { Run } from "./run";

export interface Screen {
  toastY?: number;
  /** Integer device-pixel scale for this screen; default framing when absent. */
  pickScale?(pw: number, ph: number, portrait: boolean): number;
  enter?(): void;
  update(dt: number): void;
  draw(g: G): void;
  down?(x: number, y: number): void;
  move?(x: number, y: number, down: boolean): void;
  up?(x: number, y: number): void;
  cancel?(): void;
  key?(k: string): void;
}

interface Toast {
  text: string;
  color: string;
  t: number;
}

const PERF_N = 600;

export class Game implements InputSink {
  readonly canvas: HTMLCanvasElement;
  readonly g: G;
  view: View;
  readonly ui = new UI();
  readonly audio = new Audio();
  run: Run | null = null;
  screen: Screen;
  t = 0;
  private pending: Screen | null = null;
  private wipe = 0; // 0 clear .. 1 covered
  private wipeDir = 0; // +1 closing, -1 opening
  private toastMsg: Toast | null = null;
  private last = 0;
  /** Frame timing ring buffers (ms): CPU time of step+render, and rAF interval. */
  readonly perfWork = new Float32Array(PERF_N);
  readonly perfGap = new Float32Array(PERF_N);
  perfN = 0;

  constructor(canvas: HTMLCanvasElement, first: (game: Game) => Screen) {
    this.canvas = canvas;
    const g = canvas.getContext("2d", { alpha: false });
    if (!g) throw new Error("2D canvas unavailable");
    this.g = g;
    this.screen = first(this);
    this.view = this.computeView();
    applyView(canvas, this.view);
    bindInput(canvas, () => this.view, this);
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => { this.last = performance.now(); });
    this.screen.enter?.();
  }

  /** A screen change (wipe) is in progress; input is ignored until it opens. */
  get transitioning(): boolean { return this.wipeDir !== 0 || !!this.pending; }

  get W(): number { return this.view.W; }
  get H(): number { return this.view.H; }
  get portrait(): boolean { return this.view.portrait; }

  private computeView(): View {
    const s = this.screen;
    return computeView(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, s.pickScale ? s.pickScale.bind(s) : undefined);
  }

  resize(): void {
    this.view = this.computeView();
    applyView(this.canvas, this.view);
  }

  go(next: Screen): void {
    if (this.pending) return;
    this.pending = next;
    this.wipeDir = 1;
  }

  toast(text: string, color: string = C.bone, sfx?: Sfx): void {
    this.toastMsg = { text, color, t: 1.6 };
    this.toastLog.push(text); // tooling: the scripted runs log merge toasts
    if (this.toastLog.length > 200) this.toastLog.shift();
    if (sfx) this.audio.play(sfx);
  }

  /** 0.6.1a tooling: the most recent toast texts (bb.game.toastLog). */
  readonly toastLog: string[] = [];

  /** 0.6.1a: a toast is on screen (queued merge toasts wait for it). */
  get toasting(): boolean {
    return !!this.toastMsg;
  }

  error(text: string): void {
    this.toast(text, C.red, "error");
  }

  start(): void {
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  private loop = (now: number): void => {
    const gap = now - this.last;
    const dt = Math.min(0.05, Math.max(0, gap / 1000));
    this.last = now;
    this.t += dt;
    const t0 = performance.now();
    this.step(dt);
    this.render();
    const i = this.perfN % PERF_N;
    this.perfWork[i] = performance.now() - t0;
    this.perfGap[i] = gap;
    this.perfN++;
    requestAnimationFrame(this.loop);
  };

  /** Mean CPU ms per frame and mean rAF interval over the last n frames. */
  perfStats(n = PERF_N): { frames: number; workMs: number; frameMs: number; maxWorkMs: number } {
    const m = Math.min(n, this.perfN, PERF_N);
    let w = 0, gsum = 0, mx = 0;
    for (let k = 1; k <= m; k++) {
      const i = (this.perfN - k) % PERF_N;
      w += this.perfWork[i];
      gsum += this.perfGap[i];
      mx = Math.max(mx, this.perfWork[i]);
    }
    return { frames: m, workMs: m ? w / m : 0, frameMs: m ? gsum / m : 0, maxWorkMs: mx };
  }

  /** Advance without rendering (used by tooling / headless checks). */
  step(dt: number): void {
    if (this.wipeDir !== 0) {
      this.wipe += (this.wipeDir * dt) / 0.24;
      if (this.wipeDir > 0 && this.wipe >= 1) {
        this.wipe = 1;
        this.wipeDir = -1;
        if (this.pending) {
          this.screen = this.pending;
          this.pending = null;
          this.ui.pressed = null;
          this.toastMsg = null;
          this.resize();
          this.screen.enter?.();
        }
      } else if (this.wipeDir < 0 && this.wipe <= 0) {
        this.wipe = 0;
        this.wipeDir = 0;
      }
    }
    this.screen.update(dt);
    if (this.toastMsg && (this.toastMsg.t -= dt) <= 0) this.toastMsg = null;
    // 0.6.1a: queued merge toasts (run.fuseFx, cosmetic), one at a time once the screen has settled
    const fx = this.run?.fuseFx;
    if (fx?.length && !this.toastMsg && this.wipeDir === 0) this.toast(fx.shift()!, C.lime);
  }

  render(): void {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    this.ui.begin();
    this.screen.draw(g);
    this.drawToast(g);
    this.drawWipe(g);
    this.ui.end();
  }

  private drawToast(g: G): void {
    const m = this.toastMsg;
    if (!m) return;
    const w = Math.min(this.W - 4, textWidth(m.text) + 14);
    const x = Math.round(this.W / 2 - w / 2);
    const y = Math.round(this.screen.toastY ?? this.H / 2 - 8);
    const lift = Math.max(0, Math.round((m.t - 1.45) * 40));
    if (m.t < 0.25 && Math.floor(m.t * 20) % 2) return;
    panel(g, { x, y: y + lift, w, h: 13 }, "glass");
    drawText(g, m.text, this.W / 2, y + 3 + lift, m.color, { align: "center" });
  }

  private drawWipe(g: G): void {
    if (this.wipe <= 0) return;
    const S = 16;
    const cols = Math.ceil(this.W / S), rows = Math.ceil(this.H / S);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const thr = (i + j) / (cols + rows);
        const k = Math.max(0, Math.min(1, (this.wipe * 1.5 - thr) * 3));
        if (k <= 0) continue;
        const s = Math.ceil(k * S);
        rect(g, i * S + Math.floor((S - s) / 2), j * S + Math.floor((S - s) / 2), s, s, C.ink);
      }
    }
  }

  // ------------------------------------------------------------ input routing

  pointerDown(x: number, y: number): void {
    this.audio.unlock();
    const ui = this.ui;
    ui.pointer.x = x;
    ui.pointer.y = y;
    ui.pointer.down = true;
    ui.pressed = null;
    if (this.wipeDir !== 0) return;
    const r = ui.hit(x, y);
    if (r) {
      if (r.onDown) r.onDown(x, y);
      else ui.pressed = r.id;
      return;
    }
    this.screen.down?.(x, y);
  }

  pointerMove(x: number, y: number, down: boolean): void {
    const ui = this.ui;
    ui.pointer.x = x;
    ui.pointer.y = y;
    const r = ui.hit(x, y);
    ui.hover = r ? r.id : null;
    if (ui.pressed || this.wipeDir !== 0) return;
    this.screen.move?.(x, y, down);
  }

  pointerUp(x: number, y: number): void {
    const ui = this.ui;
    ui.pointer.down = false;
    const id = ui.pressed;
    ui.pressed = null;
    if (id) {
      const r = ui.hit(x, y);
      if (r && r.id === id && r.onTap) {
        this.audio.play("click");
        r.onTap();
      }
      return;
    }
    if (this.wipeDir === 0) this.screen.up?.(x, y);
  }

  pointerCancel(): void {
    this.ui.pointer.down = false;
    this.ui.pressed = null;
    this.screen.cancel?.();
  }

  key(k: string): void {
    this.audio.unlock();
    if (k === "m" || k === "M") {
      this.cycleSound();
      return;
    }
    if (this.wipeDir === 0) this.screen.key?.(k);
  }

  // ------------------------------------------------------------ shared widgets

  cycleSound(): void {
    const m = this.audio.cycleMode();
    this.toast(m === 0 ? "SOUND: MUSIC + SFX" : m === 1 ? "SOUND: SFX ONLY" : "SOUND: OFF");
  }

  soundButton(g: G, r: Rect): void {
    const m = this.audio.mode;
    button(this.ui, g, "sound", r, m === 0 ? "SND" : m === 1 ? "SFX" : "OFF", {
      font: "3", active: m === 0, onTap: () => this.cycleSound(),
    });
  }
}
