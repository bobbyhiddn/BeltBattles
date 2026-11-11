// BACKDROP-2 (REQ-BFG-058): the helpers of tests/backdrop2.ground.test.ts (not a test file): the dawn rune picker (PICK A RUNE) drawn on the software raster (tests/raster.helpers.ts) on the views of the
// brief, in the states its pictures show. The picker is the real one (RunePicker.draw and its own layout, RunePicker.info); only the build screen around it is trimmed to what the picker reads (tests/card4.test.ts
// screenOf's way, as tests/backdrop1.helpers.ts does for LAST CHANCE). The views' W x H, scale and dpr are the real page's frame at each CSS view (kit/dshots.mjs's log of the base,
// W/output-backdrop2/logs/dshots-before.log), so the numbers here are the ones the pictures were taken at.
import { afterEach, beforeEach, vi } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { UI } from "../src/ui/ui";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { RUNES } from "../src/sim/runes";
import { RunePicker, type PickLayout } from "../src/screens/runePicker";

installRaster();

/** The brief's views (CSS size, @dpr): the phones 402x690 and 390x660, the small views where the dawn picker's `top` reaches its floor of 4 and its column runs past the screen (360x220 and 480x270 at dpr 1: the game
 *  takes them for phones, tap.ts isPhone), and the desks 1366x768 and 1920x1080. W, H: the game's logical px; scale: device px per logical px. */
export const VIEWS = {
  "402x690": { W: 241, H: 414, scale: 5, dpr: 3 },
  "390x660": { W: 234, H: 396, scale: 5, dpr: 3 },
  "360x220@1": { W: 360, H: 220, scale: 1, dpr: 1 },
  "480x270@1": { W: 480, H: 270, scale: 1, dpr: 1 },
  "1366x768": { W: 683, H: 384, scale: 2, dpr: 1 },
  "1920x1080": { W: 640, H: 360, scale: 3, dpr: 1 },
} as const;
export type ViewName = keyof typeof VIEWS;
export const VIEW_NAMES = Object.keys(VIEWS) as ViewName[];
/** With no rune held the build screen has no rune row, and the page's scale steps up on the desks (the BEFORE log's `empty` shots): 1366x768 is 455x256 at scale 3, 1920x1080 is 480x270 at scale 4. */
const EMPTY_FRAME: Partial<Record<ViewName, { W: number; H: number; scale: number; dpr: number }>> = {
  "1366x768": { W: 455, H: 256, scale: 3, dpr: 1 },
  "1920x1080": { W: 480, H: 270, scale: 4, dpr: 1 },
};

/** The picker's states: 0 runes held (day 1: no tray); the dawn of day 4 with the 3 runes the pictures hold, closed, each card open in turn (the TAP AGAIN bar), the middle card with its first word's definition
 *  (PICK_WORD / PICK_DEF); the dawn of day 10 (1 of 2 cards, 9 held); the tallest trays: 19 runes held (about the most a ten-win run holds; the full-chip tray, or the compact one where it does not fit), 50 held (an
 *  endless run's: the compact tray), each with the middle card open; and the same 19 held on a run without the endless mark (ENDLESS off: the tray is never compacted, so it runs past a phone's foot). */
export const STATES = ["empty", "closed", "open0", "open1", "open2", "word", "late", "tall", "endless", "endless-open", "plain-tall"] as const;
export type StateName = (typeof STATES)[number];
const SPEC: Record<StateName, { day: number; hold: number | null; open: number; word: boolean; endless: boolean }> = {
  empty: { day: 1, hold: null, open: -1, word: false, endless: true },
  closed: { day: 4, hold: null, open: -1, word: false, endless: true },
  open0: { day: 4, hold: null, open: 0, word: false, endless: true },
  open1: { day: 4, hold: null, open: 1, word: false, endless: true },
  open2: { day: 4, hold: null, open: 2, word: false, endless: true },
  word: { day: 4, hold: null, open: 1, word: true, endless: true },
  late: { day: 10, hold: null, open: -1, word: false, endless: true },
  tall: { day: 4, hold: 19, open: 1, word: false, endless: true },
  endless: { day: 4, hold: 50, open: -1, word: false, endless: true },
  "endless-open": { day: 4, hold: 50, open: 1, word: false, endless: true },
  "plain-tall": { day: 4, hold: 19, open: 1, word: false, endless: false },
};

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

/** The run the pictures were taken from (kit/dshots.mjs): furnace, seed 12345, played to the dawn of `day` with each dawn's first card taken (bb.openLastChance's loop: 3 runes held at day 4, 9 at day 10),
 *  then `hold` of the catalogue's first runes held in their place if asked (bb.holdRunes); `endless`: the run carries the endless mark (ENDLESS ships on: newRun's), else it does not. */
export function dawnRun(day: number, hold: number | null, endless: boolean): Run {
  const run = newRun("furnace", 12345, "backdrop2-dawn");
  for (let d = 1; d < day; d++) {
    run.day = d;
    run.runeDay = d;
    const o = pendingRune(run);
    if (o) takeRune(run, o.ids[0]);
  }
  run.day = day;
  run.runeDay = day;
  if (hold) run.build.runes = Object.keys(RUNES).slice(0, hold).map((id) => ({ id }));
  if (endless) run.endless = true;
  else delete (run as { endless?: true }).endless;
  return run;
}

/** One fillRect the picker made: the style and alpha it was drawn at, and the rect (the recorder's line). */
export interface Call { alpha: number; fill: string; x: number; y: number; w: number; h: number }
export interface Drawn { c: RasterCanvas; calls: Call[]; ui: UI }

/** The picker at `view` in `state`: its layout (the picker's own: RunePicker.info), and `draw`: one frame on a W x H raster. With `sentinel` the raster starts filled with that colour and takes only opaque
 *  paints (RasterCanvas.opaqueOnly: the 0.86 scrim paints nothing), so a pixel still holding the sentinel after the frame is a pixel of the screen behind the picker showing through. */
export function scene(view: ViewName, state: StateName) {
  const sp = SPEC[state], f = (state === "empty" && EMPTY_FRAME[view]) || VIEWS[view];
  const ui = new UI();
  const run = dawnRun(sp.day, sp.hold, sp.endless);
  const s = {
    run, refit: false, touch: false, t: 0,
    game: { W: f.W, H: f.H, ui, view: { W: f.W, H: f.H, scale: f.scale, dpr: f.dpr, portrait: f.H > f.W * 1.05, sub: 1 }, canvas: null, error: () => {}, resize: () => {}, toast: () => {} },
    touched: () => {},
  };
  const picker = new RunePicker();
  const draw = (sentinel?: string): Drawn => {
    const c = fresh(f.W, f.H), g = G(c), calls: Call[] = [];
    if (sentinel) {
      g.fillStyle = sentinel;
      g.fillRect(0, 0, f.W, f.H);
      c.opaqueOnly = true;
    }
    const fillRect = g.fillRect.bind(g);
    (g as unknown as { fillRect: (x: number, y: number, w: number, h: number) => void }).fillRect = (x, y, w, h) => {
      calls.push({ alpha: g.globalAlpha, fill: String(g.fillStyle), x, y, w, h });
      fillRect(x, y, w, h);
    };
    ui.begin();
    picker.draw(g, s as never);
    ui.end();
    return { c, calls, ui };
  };
  draw(); // the first frame fixes the offer's day: a fresh picker starts closed
  const o = picker.offer(s as never)!;
  if (sp.open >= 0) picker.tap(s as never, sp.open, o.ids[sp.open]); // a tap opens the card (RunePicker.tap)
  if (sp.word) {
    draw(); // the open card's keyword targets are regions of this frame
    const k = ui.regions.find((q) => /^runepick-w\d+:/.test(q.id) && q.onTap);
    // on 360x220 the open card (overrun) has no tappable keyword (the BEFORE shot's taps: `runepick-1|` and no word): there this state stays the open card (`picker.word` is null)
    if (k) {
      picker.pressed(k.id); // as the game routes a press: the picker hears it, then the region's own tap shows the word's definition
      k.onTap!();
    }
  }
  return { W: f.W, H: f.H, picker, run, ids: o.ids, layout: (): PickLayout => picker.info(s as never)!.layout, draw };
}

/** The regions of a frame as text, in the order the picker added them: `id:x,y,w,h` (`,block` for the screen-wide one). The pin of tests/backdrop2.regions.json. */
export const regionsOf = (ui: UI): string[] => ui.regions.map((q) => `${q.id}:${q.r.x},${q.r.y},${q.r.w},${q.r.h}${q.block ? ",block" : ""}`);
