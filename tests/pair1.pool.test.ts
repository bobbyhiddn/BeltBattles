// PAIR-CUE (REQ-BFG-100, REQ-BFG-081): the pool's yield rule. All damage numbers share 48 slots (fx.ts); a PAIR pop (the
// glyph over a gun, or the mark beside a PAIR shot's number) never costs a hit number or a wind number: it takes a free
// slot of the 48 or the oldest PAIR pop's, else it is dropped, and a number that needs the room takes it from a PAIR pop.
// The mark rides with its number (place, life, size, blink). Tests only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Fx, PAIR_COLOUR, PAIR_POPS, PAIR_POP_MAX } from "../src/render/fx";
import { C } from "../src/render/palette";
import { ICON, ICON_COLOUR, textWidth } from "../src/render/font";
import { fakeCanvas, fakeDom, paints } from "./pair1.helpers";

const POOL = 48;
let restore: () => void = () => undefined;
beforeAll(() => { restore = fakeDom(); });
afterAll(() => restore());

const numbers = (fx: Fx, n: number) => { for (let i = 0; i < n; i++) fx.popup(i, i, String(i), C.white); };
const total = (fx: Fx) => fx.popCount + fx.pairCount;

describe("PAIR-CUE: the pool's yield rule", () => {
  it("PAIR's colour is its keyword's (font.ts ICON_COLOUR: C.blue); a glyph pop lives a hit number's life", () => {
    expect(PAIR_COLOUR).toBe(ICON_COLOUR[ICON.PAIR]);
    expect(PAIR_COLOUR).toBe(C.blue);
    expect(PAIR_POP_MAX).toBe(0.85);
  });

  it("a PAIR pop takes a free slot of the 48; with none free and no PAIR pop to evict it is dropped, costing nothing", () => {
    const fx = new Fx();
    numbers(fx, 40);
    expect(fx.pairPop(1, 1)).toBe(true);
    expect([fx.popCount, fx.pairCount]).toEqual([40, 1]);
    numbers(fx, 7); // 47 numbers + 1 PAIR pop: the room is full
    expect(total(fx)).toBe(POOL);
    const fresh = new Fx();
    numbers(fresh, POOL);
    expect(fresh.pairPop(1, 1), "no free slot, no PAIR pop: dropped").toBe(false);
    expect([fresh.popCount, fresh.pairCount]).toEqual([POOL, 0]);
  });

  it("a full room evicts the oldest PAIR pop for a new PAIR pop (never a number)", () => {
    const fx = new Fx();
    numbers(fx, 45);
    for (let i = 0; i < 3; i++) { expect(fx.pairPop(100 + i, 0)).toBe(true); fx.update(0.01); }
    expect(total(fx)).toBe(POOL);
    expect(fx.pairPop(200, 0)).toBe(true);
    expect([fx.popCount, fx.pairCount]).toEqual([45, 3]);
    expect(fx.pairList.slice(0, 3).map((p) => p.x), "the oldest (100) gave way").toEqual([101, 102, 200]);
  });

  it("a hit number never waits for a PAIR pop: it takes the room, and the oldest PAIR pop gives it back before the next draw", () => {
    const fx = new Fx();
    numbers(fx, 46);
    fx.pairPop(1, 0);
    fx.update(0.01);
    fx.pairPop(2, 0);
    expect(total(fx)).toBe(POOL);
    fx.popup(0, 0, "152", C.yellow, true); // a big hit lands with the room full
    expect(fx.popCount, "the hit number got its slot").toBe(47);
    fx.update(0.001); // the next frame's update: the oldest PAIR pop yields
    expect([fx.popCount, fx.pairCount]).toEqual([47, 1]);
    expect(fx.pairList[0].x).toBe(2);
    fx.windPop(0, 0, "90", C.windHit); // and a wind number
    fx.update(0.001);
    expect([fx.popCount, fx.pairCount]).toEqual([POOL, 0]);
    expect(fx.pairPop(3, 0), "no room left for PAIR").toBe(false);
  });

  it("at most PAIR_POPS PAIR pops at once: the next evicts the oldest", () => {
    const fx = new Fx();
    for (let i = 0; i < PAIR_POPS; i++) expect(fx.pairPop(i, 0)).toBe(true);
    expect(fx.pairCount).toBe(PAIR_POPS);
    expect(fx.pairPop(99, 0)).toBe(true);
    expect(fx.pairCount).toBe(PAIR_POPS);
    expect(fx.pairList[0].x).toBe(1);
    expect(fx.pairList[PAIR_POPS - 1].x).toBe(99);
  });

  it("the mark takes its number's place, life and size, PAIR's 3x5 glyph just past the number's right edge; they age together", () => {
    const fx = new Fx();
    fx.anchor = 1;
    fx.popup(60, 40, "152", C.yellow, true);
    const hit = fx.popList[0];
    expect(fx.pairPop(0, 0, hit)).toBe(true);
    const m = fx.pairList[0];
    expect({ x: m.x, y: m.y, max: m.max, big: m.big, mark: m.mark, side: m.side, t: m.t }).toEqual({ x: hit.x, y: hit.y, max: hit.max, big: true, mark: true, side: 1, t: 0 });
    expect(m.dx).toBe(Math.ceil((textWidth("152") * 2) / 2) + 2);
    for (let i = 0; i < 30; i++) { fx.update(1 / 60); expect(m.t).toBeCloseTo(hit.t, 9); }
    // they leave together
    fx.update(hit.max);
    expect(fx.popCount).toBe(0);
    expect(fx.pairCount).toBe(0);
  });

  it("drawn in the numbers' style: PAIR's blue, outlined in ink, white on the first frames; a mark blinks out with its number", () => {
    const fx = new Fx();
    fx.anchor = 0;
    fx.popup(60, 40, "52", C.white);
    fx.pairPop(0, 0, fx.popList[0]);
    fx.pairPop(30, 30);
    const at = (t: number) => {
      fx.update(t);
      const c = fakeCanvas();
      fx.drawPops(c.getContext(), 0, 0, 0);
      const nums = c.imgs.length;
      fx.drawPairPops(c.getContext(), 0, 0, 0);
      return { nums, pair: c.imgs.slice(nums) };
    };
    const first = at(0.01);
    const glyph = (f: typeof first) => f.pair.some((d) => d.x < 45), mark = (f: typeof first) => f.pair.some((d) => d.x > 60);
    expect(glyph(first) && mark(first)).toBe(true);
    expect(first.pair.some((d) => paints(d, C.white)) && first.pair.some((d) => paints(d, C.ink))).toBe(true); // fresh: white, as a number
    expect(first.pair.some((d) => paints(d, PAIR_COLOUR))).toBe(false);
    const later = at(0.2);
    expect(glyph(later) && mark(later)).toBe(true);
    expect(later.pair.some((d) => paints(d, PAIR_COLOUR)) && later.pair.some((d) => paints(d, C.ink))).toBe(true);
    expect(later.pair.some((d) => paints(d, C.white))).toBe(false);
    at(0.46); // into the blink-out (past 0.78 of the life)
    // in the blink-out, the mark shows exactly when its number shows
    let both = 0;
    for (let i = 0; i < 12; i++) {
      const f = at(0.01);
      expect(mark(f), `blink step ${i}`).toBe(f.nums > 0);
      if (f.nums > 0) both++;
    }
    expect(both).toBeGreaterThan(0);
    expect(both).toBeLessThan(12); // it did blink
    // another board's pops are not drawn with this one
    const c = fakeCanvas();
    fx.drawPairPops(c.getContext(), 0, 0, 1);
    expect(c.imgs.length).toBe(0);
  });
});
