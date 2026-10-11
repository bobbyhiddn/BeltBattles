// shoptap (BeltBattles 0.8.0 phone controls; backlog 319, REQ-BFG-036, REQ-BFG-037): tap targets measured on the view
// grid of tests/summary.replaytap.test.ts (phones and desktops by the view alone, R1's rule: ui/tap.ts isPhone).
//   - the run summary's NEW RUN and TITLE: at least 44 CSS px tall on a phone (R1 measured 35 on the iPhone), the card on
//     the screen offline too (a 360x640 phone's 20-row card ran 8 px off it); the desktop's as 0.7.0a's;
//   - the replay's BACK, on its result card and while it plays: at least 44 CSS px on a phone (R1: 30 and 24), clear of
//     both plates, both hulls and the playback bar where a corner allows; the desktop's as 0.7.0a's;
//   - the belt X: a 44 CSS px square on every phone view, beside the tile tapped, on the screen, clear of every panel and
//     control, for every tile of every belt of the showcase decks and the heroes' starting decks;
//   - a deck cell on the phones, the size the touch rules are made for (D4: a fingertip is wider than a cell).
import { describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { battleLayout, battleScale, laneLayout } from "../src/game/battleLayout";
import { TAP_CSS, isPhone, tapPx } from "../src/ui/tap";
import { summaryButtonH, summaryLayout, type SummaryView } from "../src/screens/summary";
import { replayBackH, replayLeaveRect } from "../src/screens/replay";
import { buildLayout, buildScale } from "../src/screens/build/layout";
import { beltXSide, placeBeltX } from "../src/screens/build/beltx";
import { SHOWCASE } from "../src/tooling";
import { heroStartBuild, PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { kx, ky, turretSlots, type Build } from "../src/sim/deck";
import { footX, footY } from "../src/render/frame";
import { turretPivotX, turretPivotY } from "../src/render/cruiser";
import { CELL } from "../src/sim/content";

type R = { x: number; y: number; w: number; h: number };
const hit = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** tests/summary.replaytap.test.ts's grid. */
const PHONES: [string, number, number, number][] = [
  ["phone 390x844", 390, 844, 3], ["small 360x640", 360, 640, 2], ["android 360x780", 360, 780, 3], ["pixel 412x915", 412, 915, 2.625],
  ["iphone landscape 844x390", 844, 390, 3], ["small landscape 640x360", 640, 360, 2], ["se landscape 667x375", 667, 375, 2],
];
const DESKS: [string, number, number, number][] = [
  ["desk 1920x1080", 1920, 1080, 1], ["laptop 1366x768", 1366, 768, 1], ["tablet 768x1024", 768, 1024, 2], ["tablet landscape 1024x768", 1024, 768, 2],
];
const sview = (w: number, h: number, dpr: number): SummaryView => computeView(w, h, dpr); // the summary's default scale

describe("backlog 319: the run summary's NEW RUN and TITLE", () => {
  it("on every phone, offline and with up to 10 stored dusks: at least 44 CSS px tall, inside the card, the card on the screen", () => {
    let n = 0;
    for (const [name, w, h, dpr] of PHONES) {
      const v = sview(w, h, dpr), k = v.scale / v.dpr, bh = summaryButtonH(v);
      expect(isPhone(v), name).toBe(true);
      expect(bh * k, name).toBeGreaterThanOrEqual(TAP_CSS);
      for (let fights = 0; fights <= 20; fights++) {
        for (let replays = 0; replays <= Math.min(10, fights); replays++) {
          const L = summaryLayout(v, fights, replays), c = L.card, tag = `${name}: ${fights} fights, ${replays} replays`;
          expect(c.y, tag).toBeGreaterThanOrEqual(4);
          expect(c.y + c.h, tag).toBeLessThanOrEqual(v.H); // on the screen (R1's bound; offline portrait keeps 4 px under it)
          if (replays === 0 && v.portrait) expect(c.y + c.h, tag).toBeLessThanOrEqual(v.H - 4);
          const buttons = { x: c.x + 10, y: c.y + c.h - bh - 6, w: c.w - 20, h: bh };
          expect(buttons.y, tag).toBeGreaterThan(c.y + 58 + Math.max(1, fights) * L.rowH + 8); // under the lives line
          for (const s of L.strip ?? []) expect(hit(s, buttons), tag).toBe(false);
          expect(L.rowH, tag).toBeGreaterThanOrEqual(6);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it("the desktop's are 0.7.0a's: 21 px, 6 px above the card's bottom", () => {
    for (const [name, w, h, dpr] of DESKS) {
      const v = sview(w, h, dpr);
      expect([isPhone(v), summaryButtonH(v)], name).toEqual([false, 21]);
    }
  });

  it("measured: the iPhone (390x844 @3) 27 px = 45 CSS px (0.8.0: 21 px = 35); the 360x640 phone's 20-row card now ends on the screen", () => {
    const v = sview(390, 844, 3);
    expect([v.W, v.H, v.scale, summaryButtonH(v)]).toEqual([234, 506, 5, 27]);
    expect(21 * (5 / 3)).toBe(35);
    const s = sview(360, 640, 2);
    expect([s.W, s.H, s.scale, summaryButtonH(s)]).toEqual([240, 426, 3, 30]); // 30 x 1.5 = 45 CSS px
    // 0.7.0a / 0.8.0: 64 + 20 x 8 + 12 + 38 = 274 px from y 160: 434, past the 426 px screen (R1's 8 px)
    expect(Math.max(140 + 20, 426 - 274 - 8) + 274).toBe(434);
    const L = summaryLayout(s, 20, 0);
    expect([L.card.y, L.card.h, L.card.y + L.card.h]).toEqual([135, 283, 418]);
    const land = sview(844, 390, 3);
    expect([land.scale / land.dpr, summaryButtonH(land)]).toEqual([1, 44]); // the iPhone on its side: 44 px = 44 CSS px
  });
});

describe("backlog 319: the replay's BACK", () => {
  const bview = (w: number, h: number, dpr: number) => computeView(w, h, dpr, battleScale);

  it("on every phone: the result card's BACK and the BACK while it plays are at least 44 CSS px; the latter in a clear corner", () => {
    for (const [name, w, h, dpr] of PHONES) {
      const v = bview(w, h, dpr), k = v.scale / v.dpr, L = battleLayout(v.W, v.H, v.portrait);
      expect(replayBackH(v) * k, name).toBeGreaterThanOrEqual(TAP_CSS);
      const r = replayLeaveRect(L, v);
      expect([r.w * k >= TAP_CSS, r.h * k >= TAP_CSS], name).toEqual([true, true]);
      expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= v.W && r.y + r.h <= v.H, `${name}: on the screen`).toBe(true);
    }
  });

  it("the browser check's views: the iPhone's BACK at the top right; turned on its side, the bottom right, clear of the plates, hulls and bar", () => {
    const at = (w: number, h: number, dpr: number) => {
      const v = bview(w, h, dpr), L = battleLayout(v.W, v.H, v.portrait), r = replayLeaveRect(L, v);
      return { v, L, r, clear: [...L.plates, ...L.hulls, L.bar].every((q) => !hit(q, r)) };
    };
    const p = at(390, 844, 3);
    expect([p.v.W, p.v.H, p.v.scale, tapPx(p.v)]).toEqual([195, 422, 6, 22]);
    // no corner is clear on the portrait iPhone (its hulls fill the width): 0.7.0a's corner, 22 x 22 (44 CSS px), off the
    // enemy plate (0.7.0a's 36 x 12 reached over its end)
    expect(p.r).toEqual({ x: 195 - 22 - 2, y: 2, w: 22, h: 22 });
    expect(hit(p.r, p.L.plates[1])).toBe(false);
    expect(replayBackH(p.v)).toBe(22); // 0.8.0: 15 px = 30 CSS px
    const l = at(844, 390, 3);
    expect([l.v.W, l.v.H, l.v.scale]).toEqual([422, 195, 6]);
    expect([l.r, l.clear]).toEqual([{ x: 400, y: 173, w: 22, h: 22 }, true]); // the bottom right, flush, under the enemy hull
    for (const [w, h, dpr] of [[640, 360, 2], [667, 375, 2], [360, 640, 2]] as const) expect(at(w, h, dpr).clear, `${w}x${h}`).toBe(true);
  });

  it("the desktop's: BACK 15 px on the result card (0.7.0a's); while it plays 0.7.0a's 36 x 12, WIND-2: off both plates, in a clear corner", () => {
    for (const [name, w, h, dpr] of DESKS) {
      const v = bview(w, h, dpr);
      // the replay lays out its lanes (laneLayout); the plain layout too, as the other tests here read it
      for (const L of [battleLayout(v.W, v.H, v.portrait), laneLayout(battleLayout(v.W, v.H, v.portrait))]) {
        const r = replayLeaveRect(L, v);
        expect([replayBackH(v), r.w, r.h], name).toEqual([15, 36, 12]);
        expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= v.W && r.y + r.h <= v.H, `${name}: on the screen`).toBe(true);
        expect(L.plates.some((p) => hit(p, r)), `${name}: off both plates`).toBe(false); // 0.7.0a's top right hid the foe's hull number
      }
    }
    // the desk: the bottom right, 2 px in, under the enemy hull and right of the bar (0.7.0a's was { x: 346, y: 2 })
    const d = bview(1920, 1080, 1);
    expect(replayLeaveRect(laneLayout(battleLayout(d.W, d.H, d.portrait)), d)).toEqual({ x: 384 - 38, y: 216 - 14, w: 36, h: 12 });
  });
});

describe("REQ-BFG-036: the belt X on every phone view", () => {
  const decks = (): [string, Build][] => [
    ...Object.entries(SHOWCASE).map(([n, s]) => [n, s.build()] as [string, Build]),
    ...PLAYABLE_HEROES.map((h) => [`start ${h}`, heroStartBuild(h)] as [string, Build]),
  ];
  /** BuildScreen.turretRect, as it computes it. */
  const turretRects = (L: ReturnType<typeof buildLayout>, b: Build): R[] => turretSlots(b).map((s) => {
    const x = turretPivotX(L.frame, s.col0, s.width), y = turretPivotY(L.frame, s.col0, s.width), r = !s.td || s.td.kind === "heavy" ? 12 : 9;
    return { x: Math.round(x - r), y: Math.round(y - r), w: r * 2, h: r * 2 };
  });

  it("a 44 CSS px square beside every tile of every belt: on the screen, clear of every panel and control, never on the tile tapped", () => {
    let n = 0;
    for (const [name, w, h, dpr] of PHONES) {
      const v = computeView(w, h, dpr, buildScale), k = v.scale / v.dpr, L = buildLayout(v.W, v.H, v.portrait, 5);
      const side = beltXSide(k);
      expect(side * k, name).toBeGreaterThanOrEqual(TAP_CSS);
      for (const [deck, b] of decks()) {
        const tr = turretRects(L, b);
        b.routes.forEach((r, index) => r.cells.forEach((cell) => {
          const x = { index, cell, cells: r.cells.join(",") };
          const q = placeBeltX(L, b, x, side, tr)!;
          const tag = `${name} ${deck} belt ${index + 1} tile (${kx(cell)},${ky(cell)})`;
          expect(q, tag).not.toBeNull();
          expect([q.w, q.h], tag).toEqual([side, side]);
          expect(q.x >= 0 && q.y >= L.bar.h && q.x + q.w <= v.W && q.y + q.h <= v.H, `${tag}: on the screen`).toBe(true);
          for (const k2 of [L.info, L.cargo, L.fight, L.reroll, ...L.cards, ...(L.foe ? [L.foe] : [])]) expect(hit(q, k2), `${tag}: clear`).toBe(false);
          const tile = { x: Math.round(footX(L.frame, kx(cell), ky(cell))), y: Math.round(footY(L.frame, kx(cell), ky(cell))), w: CELL, h: CELL };
          expect(hit(q, tile), `${tag}: not on the tile`).toBe(false);
          n++;
        }));
      }
    }
    expect(n).toBeGreaterThan(500);
  });
});

describe("D4: a deck cell on the phones (a fingertip, about 40 CSS px, is wider)", () => {
  it("390x844: 20 CSS px; 844x390: 16 CSS px; 360x640: 18 CSS px (12 logical px at the build screen's scale)", () => {
    const cell = (w: number, h: number, dpr: number) => {
      const v = computeView(w, h, dpr, buildScale);
      return CELL * (v.scale / v.dpr);
    };
    // zoom (REQ-BFG-040, D4): the phone's build screen zoomed out (x5 at DPR 3, x3 at DPR 2): 28 and 24 CSS px before
    expect([cell(390, 844, 3), cell(844, 390, 3), cell(360, 640, 2)]).toEqual([20, 16, 18]);
  });
});
