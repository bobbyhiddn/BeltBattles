// C1 (store hardening, BRIEF-C1 item 2): keep the HUD out of phone notches, camera cutouts and home bars. index.html sets
// viewport-fit=cover, so the page runs under them; its #stage box (the canvas's parent) now carries the device's safe-area
// insets as CSS padding (env(safe-area-inset-*), and the --safe-area-inset-* variables Capacitor's SystemBars supplies on an
// Android WebView older than 140), so the canvas sits inside the safe box and the area outside stays the page's background.
// The one thing CSS cannot do alone: the game measures the WINDOW (game.ts computeView: window.innerWidth and innerHeight),
// not the canvas's box. So the game reads that padding back here and hands computeView the safe size, the window less the
// insets. core/io.ts computeView, every screen's layout and the sim are untouched: they simply see the safe size.
// With every inset 0 (a desktop browser, most Android phones, any page whose stage has no padding) the safe size IS the window
// size, number for number, so the view is exactly what it was before.

/** Safe-area insets in CSS px. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Readonly<Insets> = { top: 0, right: 0, bottom: 0, left: 0 };

/** The computed padding of the stage, as `getComputedStyle` reports it (tests pass a fake). */
export interface PaddingStyle {
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
}

/** One CSS length ("47px", "0px", "") as CSS px: anything that is not a finite number above 0 is 0. */
function px(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The insets the page's CSS puts on `stage` (index.html #stage's padding): zero where there is no stage, no style engine
 *  or no padding. Read again whenever the window resizes or turns (game.ts): the browser resolves env() afresh each time. */
export function readInsets(
  stage: Element | null | undefined,
  style: ((el: Element) => PaddingStyle) | undefined = typeof getComputedStyle === "function" ? (el) => getComputedStyle(el) : undefined,
): Insets {
  if (!stage || !style) return { ...NO_INSETS };
  const s = style(stage);
  return { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
}

/** The box the game frames itself in: the window less the insets (at least 1 CSS px each way). With every inset 0 it returns
 *  the window size itself, untouched. */
export function safeBox(innerW: number, innerH: number, ins: Readonly<Insets> = NO_INSETS): { w: number; h: number } {
  if (!ins.top && !ins.right && !ins.bottom && !ins.left) return { w: innerW, h: innerH };
  return { w: Math.max(1, innerW - ins.left - ins.right), h: Math.max(1, innerH - ins.top - ins.bottom) };
}
