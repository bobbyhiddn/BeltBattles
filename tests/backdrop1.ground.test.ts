// BACKDROP-1 (REQ-BFG-073; BUMP-1G run 5's review, item 4): LAST CHANCE's picker dimmed the whole screen at 0.86 and drew its cards on top, so the gaps between the cards (and between the
// title plate and the first card, where the plate's frame was) showed the build screen behind them: the next battle's rival name sat cut in half between the PART and HULL cards.
// The card column now stands on ONE solid ground: lcGround's rect, one "dark" panel from the title plate's top to the last card's foot, drawn after the scrim and before the title and the cards.
// Pinned here, on the brief's views (402x690, 390x660, 360x220 at dpr 1 where the picker takes the Gmin gaps, 1366x768, 1920x1080) and in every state its pictures show (closed, each card
// open, the RUNE card's word, a card's details on, the tallest layouts):
//   (1) lcGround is a pure rect inside the screen that holds the plate and every card (the open card's ring too);
//   (2) on the raster the picker's tests use (tests/raster.helpers.ts): the ground is drawn after the scrim and before every card; no pixel of the screen behind shows inside the column
//       (the raster starts filled with a sentinel and takes only opaque paints, so the scrim hides nothing); and every pixel of every gap across the cards' width, the plate's foot to the
//       first card included, is the ground's own fill (C.navy);
//   (3) the picker's regions (ids and rects, in order) are the base's: tests/backdrop1.regions.json was written by one run at backdrop1-base (BD_PIN=<path> writes it).
// (2) is red at backdrop1-base (the gaps there are the scrim's ink, the sentinel shows in them, no rect covers the column) and green at the tip.
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { C } from "../src/render/palette";
import { GROUND_FOOT, GROUND_SIDE, lcGaps, lcGround, type LcLayout } from "../src/screens/lastChancePicker";
import { titlePlate } from "../src/screens/pickHead";
import { STATES, VIEWS, VIEW_NAMES, freshStorage, regionsOf, scene, type StateName, type ViewName } from "./backdrop1.helpers";

freshStorage();

const ROOT = new URL("..", import.meta.url).pathname;
type R = { x: number; y: number; w: number; h: number };
const SENTINEL = "#ff00ff";
const T = 300000; // each test draws the picker 45 times (5 views x 9 states) on a software raster: room for a loaded host
const hex = (s: string | null): string => (s ?? "-").toLowerCase();
const combos: [ViewName, StateName][] = VIEW_NAMES.flatMap((v) => STATES.map((s): [ViewName, StateName] => [v, s]));
/** `r` cut to the screen W x H. */
const clip = (r: R, W: number, H: number): R => {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(W, r.x + r.w), y1 = Math.min(H, r.y + r.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
const holds = (a: R, b: R): boolean => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
/** The card column as the cards' x and width from the plate's top (cut to the screen) to the last card's foot (cut to the screen): what must be solid. */
const column = (L: LcLayout, W: number, H: number): R => {
  const top = Math.max(0, titlePlate(W, L.top, L.cardW).y), foot = Math.min(H, L.bottom);
  return { x: L.cards[0].x, y: top, w: L.cardW, h: foot - top };
};

describe("BACKDROP-1 (REQ-BFG-073): LAST CHANCE's card column stands on one solid ground", () => {
  it("(1) lcGround: a rect inside the screen that holds the plate and every card (the open card's ring too), on every view and state; the small view takes the Gmin gaps", () => {
    const gaps: Record<string, number> = {};
    for (const [view, state] of combos) {
      const sc = scene(view, state), L = sc.layout(), at = `${view} ${state}`;
      const g = lcGround(sc.W, sc.H, L), plate = titlePlate(sc.W, L.top, L.cardW);
      expect(g.x, `${at}: inside the screen (left)`).toBeGreaterThanOrEqual(0);
      expect(g.y, `${at}: inside the screen (top)`).toBeGreaterThanOrEqual(0);
      expect(g.x + g.w, `${at}: inside the screen (right)`).toBeLessThanOrEqual(sc.W);
      expect(g.y + g.h, `${at}: inside the screen (foot)`).toBeLessThanOrEqual(sc.H);
      expect(holds(g, clip(plate, sc.W, sc.H)), `${at}: holds the title plate ${JSON.stringify(plate)} in ${JSON.stringify(g)}`).toBe(true);
      L.cards.forEach((r, i) => {
        // the open card's frame ring is one px outside its card (drawHead, drawRuneCard)
        const ring = clip({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, sc.W, sc.H);
        expect(holds(g, ring), `${at}: holds card ${i} with its ring ${JSON.stringify(ring)} in ${JSON.stringify(g)}`).toBe(true);
      });
      // its form: the plate's top to the last card's foot, GROUND_SIDE wider than the cards a side and GROUND_FOOT under the foot, cut to the screen
      expect([g.x, g.y, g.x + g.w, g.y + g.h], at).toEqual([Math.max(0, L.cards[0].x - GROUND_SIDE), Math.max(0, plate.y), Math.min(sc.W, L.cards[0].x + L.cardW + GROUND_SIDE), Math.min(sc.H, L.bottom + GROUND_FOOT)]);
      if (L.gap && L.gap.lines === lcGaps(true).lines) gaps[view] = (gaps[view] ?? 0) + 1;
      else expect(L.bottom, `${at}: G gaps fit`).toBeLessThanOrEqual(sc.H);
    }
    // the small view is the one the picker takes the Gmin gaps on (its RUNE card open overruns it); no other view does
    expect(Object.keys(gaps), "the views where the picker takes Gmin").toEqual(["360x220@1"]);
    expect(gaps["360x220@1"]).toBeGreaterThanOrEqual(2);
    expect(VIEWS["360x220@1"].H).toBeLessThan(scene("360x220@1", "rune").layout().bottom); // the cards overrun even with Gmin: the ground is cut to the screen
  }, T);

  it("(2) the ground is drawn after the scrim and before every card, and an opaque rect covers the whole column", () => {
    for (const [view, state] of combos) {
      const sc = scene(view, state), L = sc.layout(), at = `${view} ${state}`;
      const { calls } = sc.draw(), box = column(L, sc.W, sc.H);
      // the scrim stays: one full-screen ink rect at 0.86 for the rest of the screen
      const scrim = calls.findIndex((c) => c.alpha === 0.86 && hex(c.fill) === hex(C.ink) && c.x === 0 && c.y === 0 && c.w === sc.W && c.h === sc.H);
      expect(scrim, `${at}: the 0.86 scrim`).toBeGreaterThanOrEqual(0);
      const ground = calls.findIndex((c, i) => i > scrim && c.alpha === 1 && holds(c, box));
      expect(ground, `${at}: after the scrim, an opaque rect covers the column ${JSON.stringify(box)}`).toBeGreaterThan(scrim);
      L.cards.forEach((r, i) => {
        const card = calls.findIndex((c, k) => k > scrim && c.alpha === 1 && c.x === r.x && c.y === r.y && c.w === r.w && c.h === r.h);
        expect(card, `${at}: card ${i}'s panel is drawn after the ground (${ground})`).toBeGreaterThan(ground);
      });
    }
  }, T);

  it("(2) nothing of the screen behind shows inside the column: not one sentinel pixel from the plate's top to the last card's foot, across the cards' width", () => {
    for (const [view, state] of combos) {
      const sc = scene(view, state), L = sc.layout(), at = `${view} ${state}`;
      const { c } = sc.draw(SENTINEL), box = column(L, sc.W, sc.H), seen: string[] = [];
      for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (c.at(x, y) === SENTINEL) seen.push(`${x},${y}`);
      expect(seen.length, `${at}: ${seen.length} px of the screen behind show in the column ${JSON.stringify(box)} (first ${seen.slice(0, 4).join(" ")})`).toBe(0);
    }
  }, T);

  it("(2) every gap across the cards' width is the ground's own fill (C.navy): the plate's foot to the first card, and each card's foot to the next card's top", () => {
    for (const [view, state] of combos) {
      const sc = scene(view, state), L = sc.layout(), at = `${view} ${state}`;
      const { c } = sc.draw();
      // the title block ends with the hint's last row (top + 26); the rows after it to the first card are the old plate's bottom frame
      const bands = [{ y0: L.top + 27, y1: L.cards[0].y }, ...L.cards.slice(0, -1).map((r, i) => ({ y0: r.y + r.h, y1: L.cards[i + 1].y }))];
      // the open card's ring (yellow, one px outside it) sits in the gap rows next to it: not the ground's
      const ringRows = new Set(L.cards.flatMap((r, i) => (sc.lc.open === i ? [r.y - 1, r.y + r.h] : [])));
      let n = 0;
      for (const b of bands) {
        for (let y = b.y0; y < b.y1 && y < sc.H; y++) {
          if (ringRows.has(y)) continue;
          for (let x = L.cards[0].x; x < L.cards[0].x + L.cardW; x++) {
            n++;
            if (hex(c.at(x, y)) !== hex(C.navy)) expect.fail(`${at}: the gap pixel (${x},${y}) is ${c.at(x, y)}, not the ground's ${C.navy} (band ${JSON.stringify(b)})`);
          }
        }
      }
      expect(n, `${at}: the gap pixels checked`).toBeGreaterThan(0);
    }
  }, T);

  it("(3) the picker's regions (ids and rects, in order) on every view and state are the base's: tests/backdrop1.regions.json, written by one run at backdrop1-base", () => {
    const got: Record<string, string[]> = {};
    for (const [view, state] of combos) got[`${view}|${state}`] = regionsOf(scene(view, state).draw().ui);
    const pin = process.env.BD_PIN;
    if (pin) {
      writeFileSync(pin, JSON.stringify(got, null, 1) + "\n"); // the one run at the base (nothing is asserted by that run)
      return;
    }
    const want = JSON.parse(readFileSync(join(ROOT, "tests/backdrop1.regions.json"), "utf8")) as Record<string, string[]>;
    expect(Object.keys(want).sort()).toEqual(Object.keys(got).sort());
    for (const k of Object.keys(got)) expect(got[k], k).toEqual(want[k]);
  }, T);
});
