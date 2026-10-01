import { describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { HULL_A, HULL_L } from "../src/render/frame";
import { PHONE_CSS, TAP_CSS, summaryLayout, type SummaryView } from "../src/screens/summary";

// 0.7.0 (R1 M1; REQ-BFG-016): the summary's REPLAY on a phone is a tap target at least TAP_CSS (44) CSS px tall (and
// wide): one button per stored dusk in a strip under the round history, since 8 px rows can't hold a 44 px target each
// (a 10-day run has up to 20 rows; 20 x 44 px is taller than a phone). Desktop keeps 0.7.0a's REPLAY cell in the row,
// and with no stored dusk (offline, or desktop) the layout is 0.7.0a's, exactly (0.6.2's offline).

/** 0.7.0a's SummaryScreen.layout() and rowH(), verbatim, for the comparison. */
function layout070a(v: SummaryView, fights: number) {
  const { W, H, portrait } = v;
  const rows = Math.max(1, fights);
  const rowH = Math.max(6, Math.min(8, Math.floor((H - 8 - 110) / rows)));
  const w = Math.min(W - 12, 252), h = 64 + rows * rowH + 12 + 38;
  const x = portrait ? Math.round(W / 2 - w / 2) : Math.round(W * 0.64 - w / 2);
  const y = portrait ? Math.max(HULL_L + 20, H - h - 8) : Math.max(4, Math.round(H / 2 - h / 2));
  const hx = Math.round(portrait ? W / 2 - HULL_A / 2 : Math.min(W * 0.26, x - 12 - HULL_A / 2) - HULL_A / 2);
  const hy = Math.round(portrait ? Math.max(6, (y - HULL_L) / 2) : H / 2 - HULL_L / 2);
  return { card: { x, y, w, h }, hx, hy, rowH };
}

type R = { x: number; y: number; w: number; h: number };
const overlap = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Viewports (CSS px, dpr): the browser check's phone, small phone and desk, landscape phones, a laptop, a tablet. */
const PHONES: [string, number, number, number][] = [
  ["phone 390x844", 390, 844, 3], ["small 360x640", 360, 640, 2], ["android 360x780", 360, 780, 3], ["pixel 412x915", 412, 915, 2.625],
  ["iphone landscape 844x390", 844, 390, 3], ["small landscape 640x360", 640, 360, 2], ["se landscape 667x375", 667, 375, 2],
];
const DESKS: [string, number, number, number][] = [
  ["desk 1920x1080", 1920, 1080, 1], ["laptop 1366x768", 1366, 768, 1], ["tablet 768x1024", 768, 1024, 2], ["tablet landscape 1024x768", 1024, 768, 2],
];
const view = (w: number, h: number, dpr: number): SummaryView => computeView(w, h, dpr); // the summary's default scale

describe("the summary's REPLAY tap target (0.7.0 R1 M1)", () => {
  it("phones (short side under 500 CSS px) and desktops are told apart by the view alone", () => {
    for (const [name, w, h, dpr] of PHONES) {
      const v = view(w, h, dpr);
      expect((Math.min(v.W, v.H) * v.scale) / v.dpr, name).toBeLessThan(PHONE_CSS);
    }
    for (const [name, w, h, dpr] of DESKS) {
      const v = view(w, h, dpr);
      expect((Math.min(v.W, v.H) * v.scale) / v.dpr, name).toBeGreaterThanOrEqual(PHONE_CSS);
    }
  });

  it("without stored dusks (offline) every screen keeps 0.7.0a's layout, and on a desktop stored dusks change nothing", () => {
    let n = 0;
    for (const [, w, h, dpr] of [...PHONES, ...DESKS]) {
      for (let fights = 0; fights <= 20; fights++) {
        const v = view(w, h, dpr);
        expect(summaryLayout(v, fights, 0)).toEqual({ ...layout070a(v, fights), strip: null });
        n++;
      }
    }
    for (const [, w, h, dpr] of DESKS) {
      for (let fights = 1; fights <= 20; fights++) {
        for (let replays = 1; replays <= Math.min(10, fights); replays++) {
          const v = view(w, h, dpr);
          expect(summaryLayout(v, fights, replays)).toEqual({ ...layout070a(v, fights), strip: null });
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(400);
  });

  it("on every phone, each stored dusk's REPLAY is a button at least 44 CSS px tall and wide, clear of the rows and the card's buttons", () => {
    for (const [name, w, h, dpr] of PHONES) {
      const v = view(w, h, dpr);
      const k = v.scale / v.dpr;
      for (let fights = 1; fights <= 20; fights++) {
        for (let replays = 1; replays <= Math.min(10, fights); replays++) {
          const L = summaryLayout(v, fights, replays);
          const tag = `${name}: ${fights} fights, ${replays} replays`;
          expect(L.strip, tag).not.toBeNull();
          const strip = L.strip!;
          expect(strip).toHaveLength(replays);
          const { x, y, w: cw, h: ch } = L.card;
          // the card is on screen, and the strip sits between the lives line and NEW RUN / TITLE (y + h - 27)
          expect(y, tag).toBeGreaterThanOrEqual(0);
          expect(y + ch, tag).toBeLessThanOrEqual(v.H);
          const livesLine = y + 58 + Math.max(1, fights) * L.rowH + 8;
          const buttons = { x: x + 10, y: y + ch - 27, w: cw - 20, h: 21 };
          for (const [i, b] of strip.entries()) {
            expect(b.h * k, tag).toBeGreaterThanOrEqual(TAP_CSS);
            expect(b.w * k, tag).toBeGreaterThanOrEqual(TAP_CSS);
            expect(b.x).toBeGreaterThanOrEqual(x + 8);
            expect(b.x + b.w).toBeLessThanOrEqual(x + cw - 8);
            expect(b.y, tag).toBeGreaterThan(livesLine);
            expect(overlap(b, buttons), tag).toBe(false);
            for (const o of strip.slice(i + 1)) expect(overlap(b, o), tag).toBe(false);
          }
          expect(L.rowH).toBeGreaterThanOrEqual(6);
        }
      }
    }
  });

  it("the browser check's phone: one stored dusk is one wide REPLAY button, 45 CSS px tall", () => {
    const v = view(390, 844, 3);
    expect([v.W, v.H, v.scale]).toEqual([234, 506, 5]);
    const L = summaryLayout(v, 1, 1);
    expect(L.strip).toHaveLength(1);
    const b = L.strip![0];
    expect(b.h).toBe(27); // 27 x 5/3 = 45 CSS px
    expect(b.w).toBe(L.card.w - 16);
    // 0.7.0a's cell on this phone: the row's 8 px, 13.3 CSS px
    expect((layout070a(v, 1).rowH * v.scale) / v.dpr).toBeLessThan(14);
  });
});
