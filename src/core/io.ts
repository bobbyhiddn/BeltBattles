// Integer-scaled pixel viewport and unified pointer/keyboard input.
// The canvas backing store is the logical resolution; its CSS size is an exact integer
// multiple of it in device pixels, so every art pixel stays square on any screen.

export interface View {
  W: number; // logical width
  H: number; // logical height
  scale: number; // device pixels per logical pixel
  portrait: boolean;
  dpr: number;
}

/** Picks the integer device-pixel scale for a screen (each screen may frame itself). */
export type ScalePick = (pw: number, ph: number, portrait: boolean) => number;

/** Default: menus and title get a comfortable logical area per orientation. */
export function defaultScale(pw: number, ph: number, portrait: boolean): number {
  const minW = portrait ? 200 : 440;
  const minH = portrait ? 400 : 346;
  return Math.max(1, Math.floor(Math.min(pw / minW, ph / minH)));
}

export function computeView(cssW: number, cssH: number, dpr: number, pick?: ScalePick): View {
  const pw = Math.max(1, Math.floor(cssW * dpr));
  const ph = Math.max(1, Math.floor(cssH * dpr));
  const portrait = ph > pw * 1.05;
  const scale = Math.max(1, Math.floor(pick ? pick(pw, ph, portrait) : defaultScale(pw, ph, portrait)));
  return { W: Math.floor(pw / scale), H: Math.floor(ph / scale), scale, portrait, dpr };
}

export function applyView(canvas: HTMLCanvasElement, v: View): void {
  if (canvas.width !== v.W) canvas.width = v.W;
  if (canvas.height !== v.H) canvas.height = v.H;
  canvas.style.width = `${(v.W * v.scale) / v.dpr}px`;
  canvas.style.height = `${(v.H * v.scale) / v.dpr}px`;
}

export interface InputSink {
  pointerDown(x: number, y: number, button: number): void;
  pointerMove(x: number, y: number, down: boolean): void;
  pointerUp(x: number, y: number): void;
  pointerCancel(): void;
  key(k: string): void;
}

/** Single-pointer input (mouse, pen or first touch), mapped to logical pixels. */
export function bindInput(canvas: HTMLCanvasElement, getView: () => View, sink: InputSink): void {
  let active: number | null = null;
  const toLogical = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const v = getView();
    return {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * v.W,
      y: ((e.clientY - r.top) / Math.max(1, r.height)) * v.H,
    };
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (active !== null) return;
    active = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    canvas.focus({ preventScroll: true });
    const p = toLogical(e);
    sink.pointerDown(p.x, p.y, e.button);
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (active !== null && e.pointerId !== active) return;
    const p = toLogical(e);
    sink.pointerMove(p.x, p.y, active !== null);
  });
  const end = (e: PointerEvent, cancel: boolean) => {
    if (e.pointerId !== active) return;
    active = null;
    const p = toLogical(e);
    if (cancel) sink.pointerCancel();
    else sink.pointerUp(p.x, p.y);
  };
  canvas.addEventListener("pointerup", (e) => end(e, false));
  canvas.addEventListener("pointercancel", (e) => end(e, true));
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if (e.repeat && e.key !== "Backspace") return;
    sink.key(e.key);
    if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace"].includes(e.key)) e.preventDefault();
  });
}
