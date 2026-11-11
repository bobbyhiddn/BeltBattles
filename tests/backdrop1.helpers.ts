// BACKDROP-1 (REQ-BFG-073): the helpers of tests/backdrop1.ground.test.ts (not a test file): LAST CHANCE's picker drawn on the software raster (tests/raster.helpers.ts) on the views of the
// brief, in the states its pictures show. The picker is the real one (LastChancePicker.layout and draw); only the build screen around it is trimmed to what the picker reads
// (tests/polish3.lctitle.test.ts lcScreen's way). The views' W x H, scale and dpr are the real page's frame at each CSS view (kit/lcshots.mjs's log of the base,
// W/output-backdrop1/logs/lcshots-before.log), so the numbers here are the ones the pictures were taken at.
import { afterEach, beforeEach, vi } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { UI } from "../src/ui/ui";
import { newRun, type Run } from "../src/game/run";
import { LastChancePicker, type LcLayout } from "../src/screens/lastChancePicker";
import type { LastChanceOffer } from "../src/sim/lastChance";

installRaster();

/** The brief's views (CSS size, @dpr): the phone 402x690 and 390x660, the small view where the picker takes Gmin (360x220 at dpr 1: the game takes it for a phone, tap.ts isPhone;
 *  the RUNE card open is the state that overruns it), and the desks 1366x768 and 1920x1080. W, H: the game's logical px; scale: device px per logical px. */
export const VIEWS = {
  "402x690": { W: 241, H: 414, scale: 5, dpr: 3 },
  "390x660": { W: 234, H: 396, scale: 5, dpr: 3 },
  "360x220@1": { W: 360, H: 220, scale: 1, dpr: 1 },
  "1366x768": { W: 683, H: 384, scale: 2, dpr: 1 },
  "1920x1080": { W: 640, H: 360, scale: 3, dpr: 1 },
} as const;
export type ViewName = keyof typeof VIEWS;
export const VIEW_NAMES = Object.keys(VIEWS) as ViewName[];

/** The picker's states: closed; each card open in turn (the RUNE card with no word's definition = the TAP AGAIN bar alone, and with its first word's definition); the PART card's details
 *  (ⓘ) on; the details on everywhere with one card open (the tallest layouts). */
export const STATES = ["closed", "part", "hull", "rune", "runeword", "info", "allinfo-part", "allinfo-rune", "allinfo-hull"] as const;
export type StateName = (typeof STATES)[number];

class MapStore {
  m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}
/** Register the hooks every picker test needs: a fresh localStorage (the keywords' first sight is remembered there) and the first-run tips done. Call at a test file's top level. */
export function freshStorage(): void {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MapStore());
    setTipsForTests("done");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
}

/** The run the pictures were taken from: furnace, seed 12345, LAST CHANCE fired on day 6 on a hearts run (the offer: RUNE TITHE, FIERY SPLITTER, +HULL; kit/lcshots.mjs's default). */
export function lcRun(): Run {
  const run = newRun("furnace", 12345, "backdrop1-lc");
  (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 6 };
  (run as unknown as { hearts: boolean }).hearts = true;
  return run;
}

/** One fillRect the picker made: the style and alpha it was drawn at, and the rect (the recorder's line). */
export interface Call { alpha: number; fill: string; x: number; y: number; w: number; h: number }
export interface Drawn { c: RasterCanvas; calls: Call[]; ui: UI }

/** Put the picker in `state` (the taps' own effects: lc.open, lc.info, lc.tap). */
function setState(lc: LastChancePicker, s: unknown, o: LastChanceOffer, state: StateName): void {
  const boons = lc.boons(o);
  const at = (b: "rune" | "part" | "hull"): number => boons.indexOf(b);
  lc.open = -1;
  lc.info.clear();
  lc.word = null;
  if (state === "part" || state === "hull" || state === "rune") lc.open = at(state);
  else if (state === "runeword") lc.tap(s as never, at("rune"), "rune", o); // a tap opens the card and shows its first unseen keyword's definition (CARD-2 K1)
  else if (state === "info") lc.info.add(at("part"));
  else if (state !== "closed") {
    boons.forEach((_, i) => lc.info.add(i));
    lc.open = at(state === "allinfo-part" ? "part" : state === "allinfo-rune" ? "rune" : "hull");
  }
}

/** The picker at `view` in `state`: its layout (the picker's own), and `draw`: one frame on a W x H raster. With `sentinel` the raster starts filled with that colour and takes only opaque
 *  paints (RasterCanvas.opaqueOnly: the 0.86 scrim paints nothing), so a pixel still holding the sentinel after the frame is a pixel of the screen behind the picker showing through. */
export function scene(view: ViewName, state: StateName) {
  const v = VIEWS[view];
  const ui = new UI();
  const s = {
    run: lcRun(), refit: false, touch: false, t: 0,
    game: { W: v.W, H: v.H, ui, view: { W: v.W, H: v.H, scale: v.scale, dpr: v.dpr, portrait: v.H > v.W * 1.05, sub: 1 }, canvas: null, error: () => {}, resize: () => {}, toast: () => {} },
    touched: () => {}, lcHeartT: Infinity,
  };
  const lc = new LastChancePicker();
  const o = lc.offer(s as never)!;
  const draw = (sentinel?: string): Drawn => {
    const c = fresh(v.W, v.H), g = G(c), calls: Call[] = [];
    if (sentinel) {
      g.fillStyle = sentinel;
      g.fillRect(0, 0, v.W, v.H);
      c.opaqueOnly = true;
    }
    const fillRect = g.fillRect.bind(g);
    (g as unknown as { fillRect: (x: number, y: number, w: number, h: number) => void }).fillRect = (x, y, w, h) => {
      calls.push({ alpha: g.globalAlpha, fill: String(g.fillStyle), x, y, w, h });
      fillRect(x, y, w, h);
    };
    ui.begin();
    lc.draw(g, s as never);
    ui.end();
    return { c, calls, ui };
  };
  draw(); // the first frame fixes the offer's key: a fresh picker starts closed
  setState(lc, s, o, state);
  return { W: v.W, H: v.H, lc, o, layout: (): LcLayout => lc.layout(s as never, o), draw };
}

/** The regions of a frame as text, in the order the picker added them: `id:x,y,w,h` (`,block` for the screen-wide one). The pin of tests/backdrop1.regions.json. */
export const regionsOf = (ui: UI): string[] => ui.regions.map((q) => `${q.id}:${q.r.x},${q.r.y},${q.r.w},${q.r.h}${q.block ? ",block" : ""}`);
