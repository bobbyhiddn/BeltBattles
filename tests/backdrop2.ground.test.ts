// BACKDROP-2 (REQ-BFG-058; BACKDROP-1's report, section 8): the dawn rune picker (PICK A RUNE) dimmed the whole screen at 0.86 and drew its title plate, its cards and the YOUR RUNES tray on top, so the gaps between
// them (the plate's bottom frame, the 7 px between two cards, the 9 px between the last card and the tray) showed the build screen behind: cut pieces of the shop row and the ship's outline. The column now stands on
// ONE solid ground: pickGround's rect, one "dark" panel from the title plate's top to the foot of the tray (or the last card), drawn after the scrim and before the title and the cards.
// Pinned here, on the brief's views (402x690, 390x660, the small views 360x220 and 480x270 at dpr 1 where the picker's `top` reaches its floor of 4 and its column runs past the screen, 1366x768, 1920x1080)
// and in every state its pictures show (0 runes held; closed; each card open; a word's definition; the dawn of day 10; the tallest trays: 19 held, 50 held with the compact tray, 19 held without the endless mark):
//   (1) pickGround is a pure rect inside the screen that holds the plate, every card (the open card's ring too) and the tray, in LAST CHANCE's form and with its margins (and equal to lcGround on the same layout);
//   (2) on the raster the picker's tests use (tests/raster.helpers.ts): the ground is drawn after the scrim and before every card and the tray; no pixel of the screen behind shows inside the column (the raster
//       starts filled with a sentinel and takes only opaque paints, so the scrim hides nothing); and every pixel of every gap across the cards' width, the plate's foot to the first card and the last card's foot
//       to the tray included, is the ground's own fill (C.navy);
//   (3) the picker's regions (ids and rects, in order) are the base's: tests/backdrop2.regions.json was written by one run at backdrop2-base (BD2_PIN=<path> writes it).
// (2) is red at backdrop2-base (the gaps there are the scrim's ink, the sentinel shows in them, no rect covers the column) and green at the tip.
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { C } from "../src/render/palette";
import { PICK_GROUND_FOOT, PICK_GROUND_SIDE, pickGround, type PickLayout } from "../src/screens/runePicker";
import { GROUND_FOOT, GROUND_SIDE, lcGround } from "../src/screens/lastChancePicker";
import { titlePlate } from "../src/screens/pickHead";
import { STATES, VIEWS, VIEW_NAMES, freshStorage, regionsOf, scene, type StateName, type ViewName } from "./backdrop2.helpers";

freshStorage();

const ROOT = new URL("..", import.meta.url).pathname;
type R = { x: number; y: number; w: number; h: number };
const SENTINEL = "#ff00ff";
const T = 300000; // each test draws the picker 66 times (6 views x 11 states) on a software raster: room for a loaded host
const hex = (s: string | null): string => (s ?? "-").toLowerCase();
const combos: [ViewName, StateName][] = VIEW_NAMES.flatMap((v) => STATES.map((s): [ViewName, StateName] => [v, s]));
/** `r` cut to the screen W x H. */
const clip = (r: R, W: number, H: number): R => {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(W, r.x + r.w), y1 = Math.min(H, r.y + r.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
const holds = (a: R, b: R): boolean => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
/** The column as the cards' x and width from the plate's top (cut to the screen) to the foot of its last element (the tray's, else the last card's; `bottom`; cut to the screen): what must be solid. */
const column = (L: PickLayout, W: number, H: number): R => {
  const top = Math.max(0, titlePlate(W, L.top, L.cardW).y), foot = Math.min(H, L.bottom);
  return { x: L.cards[0].x, y: top, w: L.cardW, h: foot - top };
};

describe("BACKDROP-2 (REQ-BFG-058): the dawn rune picker's column stands on one solid ground", () => {
  it("(1) pickGround: a rect inside the screen that holds the plate, every card (the open card's ring too) and the YOUR RUNES tray, on every view and state; LAST CHANCE's form and margins", () => {
    const cut: Record<string, number> = {}, top4: Record<string, number> = {}, compact: Record<string, number> = {}, trays: Record<string, number> = {}, words: Record<string, string | null> = {};
    expect([PICK_GROUND_SIDE, PICK_GROUND_FOOT], "the margins are LAST CHANCE's").toEqual([GROUND_SIDE, GROUND_FOOT]);
    for (const [view, state] of combos) {
      const sc = scene(view, state), L = sc.layout(), at = `${view} ${state}`;
      const g = pickGround(sc.W, sc.H, L), plate = titlePlate(sc.W, L.top, L.cardW), last = L.cards[L.cards.length - 1];
      // the premise: the tray stands under the last card inside the cards' x span (it is part of the column), and `bottom` is the column's foot
      if (L.tray) {
        expect([L.tray.x, L.tray.w], `${at}: the tray has the cards' x and width`).toEqual([L.cards[0].x, L.cardW]);
        expect(L.tray.y, `${at}: the tray is under the last card`).toBeGreaterThanOrEqual(last.y + last.h);
        expect(L.bottom, `${at}: bottom is the tray's foot`).toBe(L.tray.y + L.tray.h);
        trays[view] = (trays[view] ?? 0) + 1;
      } else expect(L.bottom, `${at}: bottom is the last card's foot`).toBe(last.y + last.h);
      expect(g.x, `${at}: inside the screen (left)`).toBeGreaterThanOrEqual(0);
      expect(g.y, `${at}: inside the screen (top)`).toBeGreaterThanOrEqual(0);
      expect(g.x + g.w, `${at}: inside the screen (right)`).toBeLessThanOrEqual(sc.W);
      expect(g.y + g.h, `${at}: inside the screen (foot)`).toBeLessThanOrEqual(sc.H);
      expect(holds(g, clip(plate, sc.W, sc.H)), `${at}: holds the title plate ${JSON.stringify(plate)} in ${JSON.stringify(g)}`).toBe(true);
      L.cards.forEach((r, i) => {
        // the open card's frame ring is one px outside its card (drawRuneCard)
        const ring = clip({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, sc.W, sc.H);
        expect(holds(g, ring), `${at}: holds card ${i} with its ring ${JSON.stringify(ring)} in ${JSON.stringify(g)}`).toBe(true);
      });
      if (L.tray) expect(holds(g, clip(L.tray, sc.W, sc.H)), `${at}: holds the tray ${JSON.stringify(L.tray)} in ${JSON.stringify(g)}`).toBe(true);
      // its form: the plate's top to the column's foot, PICK_GROUND_SIDE wider than the column a side and PICK_GROUND_FOOT under the foot, cut to the screen
      expect([g.x, g.y, g.x + g.w, g.y + g.h], at).toEqual([Math.max(0, L.cards[0].x - GROUND_SIDE), Math.max(0, plate.y), Math.min(sc.W, L.cards[0].x + L.cardW + GROUND_SIDE), Math.min(sc.H, L.bottom + GROUND_FOOT)]);
      // one ground for both pickers: the same rect as LAST CHANCE's formula gives on this layout
      expect(g, `${at}: lcGround's rect on the same layout`).toEqual(lcGround(sc.W, sc.H, L));
      if (state === "word") words[view] = sc.picker.word;
      if (plate.y < 0) top4[view] = (top4[view] ?? 0) + 1;
      if (L.bottom + GROUND_FOOT > sc.H) cut[view] = (cut[view] ?? 0) + 1;
      if (L.compact) compact[view] = (compact[view] ?? 0) + 1;
    }
    // the small views are where the column meets the screen's edges: `top` at its floor of 4 (the plate 2 px above the screen: the ground starts at y 0) and the foot cut to the screen
    expect(Object.keys(top4), "the views where the plate's top is cut at the screen's top").toEqual(expect.arrayContaining(["360x220@1", "480x270@1"]));
    expect(Object.keys(cut), "the views where the ground's foot is cut to the screen").toEqual(expect.arrayContaining(["360x220@1", "480x270@1"]));
    expect(cut["360x220@1"]).toBeGreaterThanOrEqual(2);
    expect(compact["402x690"], "the compact tray is reached on the phone").toBeGreaterThanOrEqual(1);
    for (const v of ["402x690", "390x660", "1366x768", "1920x1080"] as const) expect(words[v], `${v}: the word state shows a keyword's definition (PICK_DEF)`).toBeTruthy();
    for (const v of VIEW_NAMES) expect(trays[v], `${v}: states with a tray`).toBeGreaterThanOrEqual(8);
  }, T);

  it("(2) the ground is drawn after the scrim and before every card and the tray, and an opaque rect covers the whole column", () => {
    for (const [view, state] of combos) {
      const sc = scene(view, state), L = sc.layout(), at = `${view} ${state}`;
      const { calls } = sc.draw(), box = column(L, sc.W, sc.H);
      // the scrim stays: one full-screen ink rect at 0.86 for the rest of the screen
      const scrim = calls.findIndex((c) => c.alpha === 0.86 && hex(c.fill) === hex(C.ink) && c.x === 0 && c.y === 0 && c.w === sc.W && c.h === sc.H);
      expect(scrim, `${at}: the 0.86 scrim`).toBeGreaterThanOrEqual(0);
      const ground = calls.findIndex((c, i) => i > scrim && c.alpha === 1 && holds(c, box));
      expect(ground, `${at}: after the scrim, an opaque rect covers the column ${JSON.stringify(box)}`).toBeGreaterThan(scrim);
      // and it is pickGround's rect, drawn whole as the panel's first rect (the frame)
      const g = pickGround(sc.W, sc.H, L);
      expect(calls[ground], `${at}: the ground is pickGround's rect ${JSON.stringify(g)}`).toMatchObject({ x: g.x, y: g.y, w: g.w, h: g.h });
      L.cards.forEach((r, i) => {
        const card = calls.findIndex((c, k) => k > scrim && c.alpha === 1 && c.x === r.x && c.y === r.y && c.w === r.w && c.h === r.h);
        expect(card, `${at}: card ${i}'s panel is drawn after the ground (${ground})`).toBeGreaterThan(ground);
      });
      if (L.tray) {
        const t = L.tray, tray = calls.findIndex((c, k) => k > scrim && c.alpha === 1 && c.x === t.x && c.y === t.y && c.w === t.w && c.h === t.h);
        expect(tray, `${at}: the tray's panel is drawn after the ground (${ground})`).toBeGreaterThan(ground);
      }
    }
  }, T);

  it("(2) nothing of the screen behind shows inside the column: not one sentinel pixel from the plate's top to the foot of the tray (or the last card), across the cards' width", () => {
    for (const [view, state] of combos) {
      const sc = scene(view, state), L = sc.layout(), at = `${view} ${state}`;
      const { c } = sc.draw(SENTINEL), box = column(L, sc.W, sc.H), seen: string[] = [];
      for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (c.at(x, y) === SENTINEL) seen.push(`${x},${y}`);
      expect(seen.length, `${at}: ${seen.length} px of the screen behind show in the column ${JSON.stringify(box)} (first ${seen.slice(0, 4).join(" ")})`).toBe(0);
    }
  }, T);

  it("(2) every gap across the cards' width is the ground's own fill (C.navy): the plate's foot to the first card, each card's foot to the next card's top, and the last card's foot to the tray", () => {
    for (const [view, state] of combos) {
      const sc = scene(view, state), L = sc.layout(), at = `${view} ${state}`;
      const { c } = sc.draw(), last = L.cards[L.cards.length - 1];
      // the title block ends with the hint's last row (top + 26); the rows after it to the first card are the old plate's bottom frame
      const bands = [{ y0: L.top + 27, y1: L.cards[0].y }, ...L.cards.slice(0, -1).map((r, i) => ({ y0: r.y + r.h, y1: L.cards[i + 1].y })), ...(L.tray ? [{ y0: last.y + last.h, y1: L.tray.y }] : [])];
      // the open card's ring (yellow, one px outside it) sits in the gap rows next to it: not the ground's
      const ringRows = new Set(L.cards.flatMap((r, i) => (sc.picker.open === i ? [r.y - 1, r.y + r.h] : [])));
      let n = 0;
      for (const b of bands) {
        for (let y = Math.max(0, b.y0); y < b.y1 && y < sc.H; y++) {
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

  it("(3) the picker's regions (ids and rects, in order) on every view and state are the base's: tests/backdrop2.regions.json, written by one run at backdrop2-base", () => {
    const got: Record<string, string[]> = {};
    for (const [view, state] of combos) got[`${view}|${state}`] = regionsOf(scene(view, state).draw().ui);
    const pin = process.env.BD2_PIN;
    if (pin) {
      writeFileSync(pin, JSON.stringify(got, null, 1) + "\n"); // the one run at the base (nothing is asserted by that run)
      return;
    }
    const want = JSON.parse(readFileSync(join(ROOT, "tests/backdrop2.regions.json"), "utf8")) as Record<string, string[]>;
    expect(Object.keys(want).sort()).toEqual(Object.keys(got).sort());
    for (const k of Object.keys(got)) expect(got[k], k).toEqual(want[k]);
  }, T);
});
