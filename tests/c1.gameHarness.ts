// C1 (BRIEF-C1): a real Game over fakes (not a test file itself). Node has no window, document, canvas or getComputedStyle, so
// this makes small stand-ins with real event dispatch, stubs them as globals (vi.stubGlobal; the caller's afterEach calls
// vi.unstubAllGlobals) and builds src/game/game.ts's own Game on them. The tests then fire the events a phone fires
// (resize, orientationchange, visibilitychange, online, offline, fullscreenchange) and read what the Game did.
import { vi } from "vitest";
import { Game, type Screen } from "../src/game/game";
import type { PaddingStyle } from "../src/core/safeArea";

export type Listener = (e?: unknown) => void;

/** A small event target that really dispatches. */
export function eventTarget() {
  const l = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, fn: Listener): void {
      (l.get(type) ?? l.set(type, new Set()).get(type)!).add(fn);
    },
    removeEventListener(type: string, fn: Listener): void {
      l.get(type)?.delete(fn);
    },
    fire(type: string, ev: unknown = {}): void {
      for (const f of [...(l.get(type) ?? [])]) f(ev);
    },
    count(type: string): number {
      return l.get(type)?.size ?? 0;
    },
  };
}

/** Insets as the stage's computed padding reports them: [top, right, bottom, left] in CSS px. */
export function padding(i: readonly [number, number, number, number]): PaddingStyle {
  return { paddingTop: `${i[0]}px`, paddingRight: `${i[1]}px`, paddingBottom: `${i[2]}px`, paddingLeft: `${i[3]}px` };
}

/** What fullscreen does on the fake document: the calls, and whether `fullscreenElement` is set. */
export interface FakeFullscreen {
  requests: number;
  exits: number;
}

export function makeGame(o: { w: number; h: number; dpr: number; insets?: readonly [number, number, number, number]; screen?: Partial<Screen>; fullscreenEnabled?: boolean }) {
  const win = Object.assign(eventTarget(), { innerWidth: o.w, innerHeight: o.h, devicePixelRatio: o.dpr });
  const fs: FakeFullscreen = { requests: 0, exits: 0 };
  const doc = Object.assign(eventTarget(), {
    visibilityState: "visible" as "visible" | "hidden",
    fullscreenEnabled: o.fullscreenEnabled ?? true,
    fullscreenElement: null as unknown,
    documentElement: {} as { requestFullscreen?: () => Promise<void> },
    exitFullscreen: undefined as unknown as (() => Promise<void>),
  });
  doc.documentElement.requestFullscreen = () => { fs.requests++; doc.fullscreenElement = doc.documentElement; return Promise.resolve(); };
  doc.exitFullscreen = () => { fs.exits++; doc.fullscreenElement = null; return Promise.resolve(); };
  const stage = { padding: padding(o.insets ?? [0, 0, 0, 0]) };
  const canvas = Object.assign(eventTarget(), {
    width: 300, height: 150, style: {} as Record<string, string>, parentElement: stage,
    getContext: () => ({}), getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }), focus() {},
  });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("getComputedStyle", (el: { padding: PaddingStyle }) => el.padding);
  const game = new Game(canvas as unknown as HTMLCanvasElement, () => ({ update() {}, draw() {}, enter() {}, ...o.screen }));
  return {
    game, win, doc, canvas, stage, fs,
    /** Set the insets the stage's CSS now reports (a turned phone). */
    setInsets(i: readonly [number, number, number, number]): void {
      stage.padding = padding(i);
    },
    /** The canvas's CSS box as the game sized it, in CSS px. */
    css(): { w: number; h: number } {
      return { w: parseFloat(canvas.style.width), h: parseFloat(canvas.style.height) };
    },
  };
}
