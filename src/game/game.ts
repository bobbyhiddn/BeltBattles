// Game shell: canvas + main loop, screen switching with a pixel-iris wipe, input routing
// (UI regions registered last frame first, then the active screen) and toasts.

import { Audio, type Sfx } from "../audio/audio";
import { applyView, bindInput, computeView, type InputSink, type View } from "../core/io";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { button, panel, UI, type Rect } from "../ui/ui";
import type { Run } from "./run";

export interface Screen {
  toastY?: number;
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

  constructor(canvas: HTMLCanvasElement, first: (game: Game) => Screen) {
    this.canvas = canvas;
    const g = canvas.getContext("2d", { alpha: false });
    if (!g) throw new Error("2D canvas unavailable");
    this.g = g;
    this.view = computeView(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    applyView(canvas, this.view);
    bindInput(canvas, () => this.view, this);
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => { this.last = performance.now(); });
    this.screen = first(this);
    this.screen.enter?.();
  }

  get W(): number { return this.view.W; }
  get H(): number { return this.view.H; }
  get portrait(): boolean { return this.view.portrait; }

  resize(): void {
    this.view = computeView(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    applyView(this.canvas, this.view);
  }

  go(next: Screen): void {
    if (this.pending) return;
    this.pending = next;
    this.wipeDir = 1;
  }

  toast(text: string, color: string = C.bone, sfx?: Sfx): void {
    this.toastMsg = { text, color, t: 1.6 };
    if (sfx) this.audio.play(sfx);
  }

  error(text: string): void {
    this.toast(text, C.red, "error");
  }

  start(): void {
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  private loop = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    this.step(dt);
    this.render();
    requestAnimationFrame(this.loop);
  };

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
          this.screen.enter?.();
        }
      } else if (this.wipeDir < 0 && this.wipe <= 0) {
        this.wipe = 0;
        this.wipeDir = 0;
      }
    }
    this.screen.update(dt);
    if (this.toastMsg && (this.toastMsg.t -= dt) <= 0) this.toastMsg = null;
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
    const w = textWidth(m.text) + 14;
    const x = Math.round(this.W / 2 - w / 2);
    const y = Math.round(this.screen.toastY ?? this.H / 2 - 8);
    const lift = Math.max(0, (m.t - 1.45) * 40);
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

/** Full-width title band with a big word and optional sub line. */
export function drawBanner(g: G, W: number, y: number, text: string, color: string, sub?: string, k = 1): void {
  const h = sub ? 30 : 20;
  const bw = Math.round(W * Math.min(1, k));
  const x0 = Math.round((W - bw) / 2);
  g.globalAlpha = 0.82;
  rect(g, x0, y, bw, h, C.ink);
  g.globalAlpha = 1;
  rect(g, x0, y, bw, 1, color);
  rect(g, x0, y + h - 1, bw, 1, color);
  if (k < 0.98) return;
  drawText(g, text, W / 2, y + 4, color, { align: "center", scale: 2, outline: C.ink });
  if (sub) drawText(g, sub, W / 2, y + 21, C.bone, { font: "3", align: "center" });
}
