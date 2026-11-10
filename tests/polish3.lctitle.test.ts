// POLISH-3 (REQ-BFG-087; BRIEF-POLISH3 Q1; the pieces lane's display list, item 3): LAST CHANCE's title line stays inside the title plate on every view down to 280 px.
// `SAVED ON 1 HEART. PICK ONE. FREE.` (LC_LINE_HEARTS) is 173 px in the 5x7 face; the plate is cardW = min(W - 8, 300) wide and its bevel takes 3 px at each edge. At 280x653 (a 168 px
// screen, cardW 160) the line passed both edges of the plate and of the screen; at 300x640 (cardW 172) it passed the plate's border. The words stay; the line steps down to the 3x5
// face (119 px, one line, centred) where its 5x7 width is over cardW - 6 (fitHead's own order: 5x7, then 3x5, then cut short with a dot). Every other view draws what it drew.
// The proof is the drawn frame: the lime pixels of the line sit inside the plate's fill (cardW - 6) on each view, in the face the width rule names.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { UI } from "../src/ui/ui";
import { C } from "../src/render/palette";
import { textWidth } from "../src/render/font";
import { newRun, pendingLastChance, type Run } from "../src/game/run";
import { LC_LINE, LC_LINE_HEARTS, LastChancePicker, lcLayout, lcLine, lcLineFit } from "../src/screens/lastChancePicker";
import { titlePlate } from "../src/screens/pickHead";
import { buildLayout, buildScale, phoneBarLift, phoneScreen } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { TAP_CSS } from "../src/ui/tap";

installRaster();

class MapStore {
  m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}
beforeEach(() => {
  vi.stubGlobal("localStorage", new MapStore());
  setTipsForTests("done"); // no first-run hint strip in the way
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The views the brief names (css width, css height, device pixel ratio): the operator's phone, three narrower phones, a landscape phone and two desks. */
const VIEWS = {
  "402x690": [402, 690, 3], "360x640": [360, 640, 2], "320x568": [320, 568, 2], "300x640": [300, 640, 3], "280x653": [280, 653, 3], "844x390": [844, 390, 3],
  "desk 1920x1080": [1920, 1080, 1], "desk 1280x800": [1280, 800, 1],
} as const;
const NAMES = Object.keys(VIEWS) as (keyof typeof VIEWS)[];

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it, trimmed to the picker (tests/polish1.lcspark.test.ts lcScreen). */
function lcScreen(run: Run, [w, h, dpr]: readonly [number, number, number]) {
  const pw = w * dpr, ph = h * dpr, portrait = ph > pw * 1.05;
  const fakeS = { run: { build: { runes: [] as unknown[] } }, refit: false, offers: () => Array.from({ length: 5 }) } as unknown as Parameters<typeof runeRowFits>[0];
  let S = buildScale(pw, ph, portrait, dpr);
  while (S > 1 && !runeRowFits(fakeS, pw, ph, portrait, S, dpr)) S--;
  const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
  const W = Math.floor(pw / S), H = Math.floor(ph / S);
  const lay = (unit: number) => {
    const row = runeRowH({ scale: S, dpr }, 0), lift = phone ? phoneBarLift(W, H, 5, tap, runeRowH({ scale: S, dpr }, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, 5, phone, tap, lift, { scale: S, unit }), row, H);
  };
  const Z = lay(1).cam.z, unit = gcd(S, Z), sub = S / unit;
  const ui = new UI();
  ui.pointer.kind = "touch";
  const s = {
    run, refit: false, touch: true, L: lay(unit), t: 0,
    game: { W, H, ui, view: { W, H, scale: S, dpr, portrait, sub }, canvas: null, error: () => {}, resize: () => {}, toast: () => {} },
    touched: () => {}, lcHeartT: Infinity,
  };
  const frame = (lc: LastChancePicker) => {
    const c = fresh(W, H);
    ui.begin();
    lc.draw(G(c), s as never);
    ui.end();
    return { c, ui };
  };
  return { s, frame, W, H };
}

/** A run whose LAST CHANCE has fired on day 3 (a hearts run: the line says SAVED ON 1 HEART; else +1 LIFE). */
function lcRun(hearts: boolean): Run {
  const run = newRun("furnace", 7, `polish3-lc-${hearts ? "hearts" : "lives"}`);
  (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 3 };
  (run as unknown as { hearts: boolean }).hearts = hearts; // newRun marks a run with hearts by default; heartsRun(run) is `run.hearts === true`
  expect(lcLine(run), "the run's line").toBe(hearts ? LC_LINE_HEARTS : LC_LINE);
  expect(pendingLastChance(run), "the run has a pending LAST CHANCE").not.toBeNull();
  return run;
}

/** What the title block drew: the lime pixels of the line under the title (their box and the rows they take) and the yellow pixels of the title. */
function drawn(hearts: boolean, view: keyof typeof VIEWS) {
  const sc = lcScreen(lcRun(hearts), VIEWS[view]);
  const lc = new LastChancePicker();
  sc.frame(lc); // the first frame fixes the offer's key
  const { c } = sc.frame(lc);
  const L = lc.infoOf(sc.s as never)!.layout;
  const plate = titlePlate(sc.W, L.top, L.cardW);
  const box = (col: string, y0: number, y1: number) => {
    let x0 = Infinity, x1 = -Infinity;
    const rows = new Set<number>();
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < sc.W; x++) {
        if ((c.at(x, y) ?? "").toLowerCase() === col.toLowerCase()) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); rows.add(y); }
      }
    }
    return { x0, x1, rows: rows.size };
  };
  return { W: sc.W, L, plate, line: box(C.lime, L.top + 9, L.top + 19), title: box(C.yellow, L.top - 1, L.top + 8) };
}

describe("POLISH-3 Q1: LAST CHANCE's title line fits the plate on every view", () => {
  it("lcLineFit: the 5x7 face where it fits, else the 3x5 face, else cut short with a dot; the words are kept whole while they fit", () => {
    expect(lcLineFit(LC_LINE_HEARTS, 173)).toEqual({ text: LC_LINE_HEARTS, small: false });
    expect(lcLineFit(LC_LINE_HEARTS, 172)).toEqual({ text: LC_LINE_HEARTS, small: true });
    expect(lcLineFit(LC_LINE_HEARTS, 119)).toEqual({ text: LC_LINE_HEARTS, small: true });
    expect(lcLineFit(LC_LINE, 123)).toEqual({ text: LC_LINE, small: false });
    const cut = lcLineFit(LC_LINE_HEARTS, 100); // no view reaches this: the 3x5 line is 119 px against 154 on the narrowest plate
    expect(cut.small).toBe(true);
    expect(cut.text.endsWith(".") && cut.text.length < LC_LINE_HEARTS.length).toBe(true);
    expect(textWidth(cut.text, "3")).toBeLessThanOrEqual(100);
  });

  it("the two lines' widths: 173 px (hearts) and 123 px in the 5x7 face, 119 and 85 in the 3x5 face (the numbers the brief quotes)", () => {
    expect([textWidth(LC_LINE_HEARTS), textWidth(LC_LINE_HEARTS, "3"), textWidth(LC_LINE), textWidth(LC_LINE, "3")]).toEqual([173, 119, 123, 85]);
    expect([lcLine({ hearts: true }), lcLine({})]).toEqual([LC_LINE_HEARTS, LC_LINE]);
  });

  it("lcLayout: the plate is cardW = min(W - 8, 300): 160 px on the 168 px screen of 280x653, 172 on 300x640's", () => {
    expect(lcLayout(168, 394, [44, 44, 44]).cardW).toBe(160);
    expect(lcLayout(180, 394, [44, 44, 44]).cardW).toBe(172);
    expect(lcLayout(1920, 1080, [44, 44, 44]).cardW).toBe(300);
  });

  for (const hearts of [true, false]) {
    for (const view of NAMES) {
      it(`${view}, ${hearts ? "a hearts run" : "a lives run"}: the line is drawn whole inside the plate's fill, in the face its width names`, () => {
        const d = drawn(hearts, view);
        const line = hearts ? LC_LINE_HEARTS : LC_LINE;
        expect(d.L.cardW, "the plate's width").toBe(Math.min(d.W - 8, 300));
        expect(d.plate.w).toBe(d.L.cardW);
        // the plate's fill: its bevel takes 3 px at each edge
        const fill0 = d.plate.x + 3, fill1 = d.plate.x + d.plate.w - 1 - 3;
        expect(d.line.x0, `${view}: the line starts inside the fill`).toBeGreaterThanOrEqual(fill0);
        expect(d.line.x1, `${view}: the line ends inside the fill`).toBeLessThanOrEqual(fill1);
        expect(d.title.x0 >= fill0 && d.title.x1 <= fill1, `${view}: the title is inside the fill`).toBe(true);
        // the face: the 5x7 line takes 7 rows, the 3x5 line 5; 5x7 where its width fits cardW - 6
        const small = textWidth(line) > d.L.cardW - 6;
        expect(d.line.rows, `${view}: ${small ? "3x5 (5 rows)" : "5x7 (7 rows)"}`).toBe(small ? 5 : 7);
        // one line, centred on the screen (within a pixel: the glyphs' side bearings)
        const w = textWidth(line, small ? "3" : "5");
        expect(d.line.x1 - d.line.x0 + 1, `${view}: the drawn width is the text's, to within the side bearings`).toBeLessThanOrEqual(w);
        expect(d.line.x1 - d.line.x0 + 1).toBeGreaterThanOrEqual(w - 3);
        expect(Math.abs((d.line.x0 + d.line.x1) / 2 - d.W / 2), `${view}: centred`).toBeLessThanOrEqual(2.5);
      });
    }
  }

  it("the face per view: only 300x640 and 280x653 take the 3x5 face, and only for the hearts line; the other views keep the 5x7 face they drew", () => {
    const smallHearts = NAMES.filter((v) => drawn(true, v).line.rows === 5);
    const smallLives = NAMES.filter((v) => drawn(false, v).line.rows === 5);
    expect(smallHearts).toEqual(["300x640", "280x653"]);
    expect(smallLives).toEqual([]);
  });
});
