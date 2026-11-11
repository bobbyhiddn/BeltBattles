// POLISH-7 (REQ-BFG-089; P7-4, P6-R1 / REVIEW-POLISH6 V9; cap's rule "fade"): AT THE CARAVAN'S ROLL-OUT THE ENCHANTER'S WORD CARDS AND TAG STAY WHERE THEY REST AND FADE OUT.
//   At polish6-accepted the wagon's cards rode out with the caravan: for 0.1-0.2 s the first card crossed the deck on its way left, the tag trailing it and card 2 passing over card 1 (O14/img/p6-6-caravan-out-*.png). Now (enchantStrip.ts wagonView,
//   drawWagon) they never move: alpha 1 -> 0 over fadeSeconds, gone before the caravan's first card reaches the nearest of them (the desk's margin and a portrait phone's have the shop's cards to their right, which leave over them), at most FADE_MAX
//   (0.12 s) where nothing leaves over them (the right column's gap, a row). The roll-in is exactly what it was. NOTE: in the game only BuildScreen.doReroll starts a roll-out, and it first turns the wagon's sliding off (wagonSlide(this, false):
//   "a REROLL leaves the ENCHANTER's wagon where it is"), so the wagon is not rolled out in play; the roll-out is driven by hand here (Caravan.state "out" and t), as O14's pictures drove it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { VIEWS13 } from "./polish4.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { viewWithSub } from "../src/game/viewGrid";
import { BuildScreen } from "../src/screens/build/build";
import { newRun, rollShop, type Run } from "../src/game/run";
import { ENCHANT, setEnchant, withEnchant, type EnchantId } from "../src/sim/enchant";
import { UI, type Rect } from "../src/ui/ui";
import { textWidth } from "../src/render/font";
import { drawEnchanterTag, drawWagon, drawWordCard, fadeSeconds, FADE_MAX, wagonView } from "../src/screens/build/enchantStrip";
import { wagonSlide, wagonSlides, wordHover } from "../src/screens/build/apply";
import type { Game } from "../src/game/game";

installRaster();
afterEach(() => setEnchant(ENCHANT));

class MapStore {
  m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}
class FakeGame {
  readonly ui = new UI();
  readonly canvas = { style: {} };
  readonly toasts: string[] = [];
  readonly errors: string[] = [];
  readonly sounds: string[] = [];
  readonly toastLog: string[] = [];
  readonly toasting = false;
  readonly t = 0;
  view: ReturnType<typeof viewWithSub>;
  readonly audio = new Proxy({}, { get: (_t, k) => (k === "play" ? (s: string) => { this.sounds.push(s); } : () => undefined) });
  constructor(public run: Run, w: number, h: number, dpr: number) { this.view = viewWithSub(w, h, dpr); }
  get W(): number { return this.view.W; }
  get H(): number { return this.view.H; }
  get portrait(): boolean { return this.view.portrait; }
  toast(t: string): void { this.toasts.push(t); }
  error(t: string): void { this.toasts.push(t); this.errors.push(t); }
  go(): void {}
  soundButton(): void {}
}
vi.stubGlobal("localStorage", new MapStore());
setTipsForTests("done");

const on = <T,>(fn: () => T): T => withEnchant(fn, true);
type Name = keyof typeof VIEWS13;
const LAND9: Name[] = ["desk-1920x1080", "laptop-1366x768", "desk-1280x800", "col96-3040x1710", "land-844x390", "land-812x375@3", "pixel5-851x393@2.75", "land-915x412@2.625", "promax-926x428@3"];
const PORTRAIT2: Name[] = ["op-402x690", "phone-360x640"];
/** The scenes: the nine landscape views and both portrait phones on an ENCHANTER dawn with 5 offers and no rune, and the places the 5-offer day does not reach: the 844x390 row (a rune held), the 851x393 and the portrait rows. */
const SCENES: [Name, number, number][] = [...LAND9, ...PORTRAIT2].map((n): [Name, number, number] => [n, 0, 5]).concat([["land-844x390", 1, 5], ["pixel5-851x393@2.75", 0, 7], ["op-402x690", 0, 3], ["phone-360x640", 1, 7]]);

function dayRun(offers: number, runes: number): Run {
  return on(() => {
    const run = newRun("furnace", 7);
    run.day = 3;
    run.gold = 20;
    run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
    rollShop(run);
    run.runeDay = undefined;
    const w0 = run.shop.wagons[0];
    run.shop.wagons = [{ ...w0, offers: Array.from({ length: offers }, (_, i) => ({ ...w0.offers[i % w0.offers.length] })) }];
    run.shop.enchanter = { day: 3, offers: (["fiery", "wide"] as EnchantId[]).map((ench) => ({ ench, price: 4, sold: false })) };
    run.build.runes = Array.from({ length: runes }, () => ({ id: "many_hands" })) as never;
    return run;
  });
}
/** A real BuildScreen at the view, entered (its wagon slides, the caravan arrives) and updated to the parked caravan. */
function rig(name: Name, runes: number, offers: number): BuildScreen {
  const [w, h, dpr] = VIEWS13[name];
  const fake = new FakeGame(dayRun(offers, runes), w, h, dpr);
  const s = new BuildScreen(fake as unknown as Game);
  fake.view = viewWithSub(w, h, dpr, s.pickScale.bind(s), s.pickSub.bind(s));
  s.enter();
  s.update(3);
  return s;
}
/** the caravan's state and clock, by hand (the way O14's pictures drove it) */
function caravanAt(s: BuildScreen, state: "in" | "out" | "parked", t: number): void {
  s.caravan.count = s.offers().length + 2;
  s.caravan.state = state;
  s.caravan.t = t;
}
const TAGW = (): number => 5 + textWidth("ENCHANTER", "3");
const inside = (x: number, y: number, q: Rect): boolean => x >= q.x && y >= q.y && x < q.x + q.w && y < q.y + q.h;
/** every inked pixel of the screen's rows `y0..y1` that lies in none of `boxes`, and the inked pixels in all */
function inkOutside(c: RasterCanvas, W: number, y0: number, y1: number, boxes: Rect[]): { outside: number; total: number } {
  let outside = 0, total = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (c.at(x, y) !== null) { total++; if (!boxes.some((q) => inside(x, y, q))) outside++; }
  return { outside, total };
}
const FRAME = 1 / 60;

describe("POLISH-7 P7-4: at the caravan's roll-out the cards and the tag stay where they rest and fade out", () => {
  for (const [name, runes, offers] of SCENES) {
    it(`${name} (${runes} rune${runes === 1 ? "" : "s"}, ${offers} offers): through the roll-out, every 1/60 s, no pixel of a card or the tag lies outside its resting rect; the fade is monotone from 1 to 0, ends by fadeSeconds, and is over before the shop's first card reaches the nearest card; none is drawn after it`, () => {
      on(() => {
        const s = rig(name, runes, offers), L = s.L, wg = L.wagon!;
        expect(wg, `${name}: a wagon`).toBeTruthy();
        expect(wagonSlides(s), `${name}: the wagon slides with the caravan (enter)`).toBe(true);
        const tagBox: Rect[] = wg.tag ? [{ x: wg.tag.x, y: wg.tag.y, w: TAGW(), h: 5 }] : [];
        const rest = [...wg.rects, ...tagBox];
        const y0 = Math.max(0, Math.min(...rest.map((q) => q.y)) - 4), y1 = Math.min(L.H, Math.max(...rest.map((q) => q.y + q.h)) + 5);
        const T = fadeSeconds(L, rest);
        expect(T, `${name}: the fade takes at most FADE_MAX`).toBeLessThanOrEqual(FADE_MAX);
        expect(T, `${name}: and some time`).toBeGreaterThan(0);
        const movers: Rect[] = [...L.cards, L.reroll];
        let prev = 1, drawnFrames = 0, reached = 0;
        for (let t = 0; t <= 0.5 + 1e-9; t += FRAME) {
          caravanAt(s, "out", t);
          const v = wagonView(s)!;
          // they never move
          for (let i = 0; i < wg.rects.length; i++) expect(v.cards[i].rect, `${name} t ${t.toFixed(3)}: card ${i} stays at its resting rect`).toEqual(wg.rects[i]);
          if (wg.tag) expect(v.tag, `${name} t ${t.toFixed(3)}: the tag stays`).toEqual(wg.tag);
          expect(v.alpha <= prev + 1e-12 && v.alpha >= 0 && v.alpha <= 1, `${name} t ${t.toFixed(3)}: alpha ${v.alpha} after ${prev}`).toBe(true);
          prev = v.alpha;
          const img = fresh(L.W, L.H);
          drawWagon(G(img), s);
          const ink = inkOutside(img, L.W, y0, y1, rest);
          expect(ink.outside, `${name} t ${t.toFixed(3)}: pixels of a card or the tag outside their resting rects`).toBe(0);
          if (v.alpha > 0) drawnFrames++;
          else expect(ink.total, `${name} t ${t.toFixed(3)}: nothing is drawn once the fade is over`).toBe(0);
          if (t >= T) expect(v.alpha, `${name} t ${t.toFixed(3)}: gone by fadeSeconds`).toBe(0);
          // the shop's cards (and REROLL) as they are drawn this frame: once one of them reaches a resting card or the tag, nothing of the wagon is drawn
          const hit = movers.some((r, i) => { const x = r.x + s.caravan.dx(i, L.W); return rest.some((q) => r.y < q.y + q.h && r.y + r.h > q.y && x < q.x + q.w && x + r.w > q.x); });
          if (hit) { reached++; expect(ink.total, `${name} t ${t.toFixed(3)}: a shop card reached them and the wagon is still drawn`).toBe(0); }
        }
        expect(drawnFrames, `${name}: the fade is seen for at least one frame`).toBeGreaterThanOrEqual(1);
        // where the shop's cards leave over the resting cards (the desk's margin, a portrait phone's) the roll-out does reach them, and by then they are gone (asserted above); elsewhere nothing leaves over them
        expect(reached > 0, `${name}: a shop card reaches the resting cards at some frame (${reached} frames)`).toBe(T < FADE_MAX);
      });
    });
  }

  it("the fade is quick where the shop's cards leave over the cards (the desk's margin, a portrait phone's) and FADE_MAX where nothing does (the gap, a row)", () => {
    on(() => {
      const secs = (name: Name, runes: number, offers: number): number => { const s = rig(name, runes, offers), wg = s.L.wagon!; return fadeSeconds(s.L, [...wg.rects, ...(wg.tag ? [{ x: wg.tag.x, y: wg.tag.y, w: TAGW(), h: 5 }] : [])]); };
      for (const name of ["desk-1280x800", "op-402x690", "phone-360x640"] as Name[]) expect(secs(name, 0, 5), `${name}: the margin`).toBeLessThan(FADE_MAX);
      for (const name of ["desk-1920x1080", "laptop-1366x768", "land-844x390"] as Name[]) expect(secs(name, 0, 5), `${name}: the gap`).toBe(FADE_MAX);
      expect(secs("op-402x690", 0, 3), "a portrait row").toBe(FADE_MAX);
    });
  });
});

describe("POLISH-7 P7-4: the roll-in is as it was", () => {
  /** the wagon exactly as polish6-accepted drew it: wagonView's rects and tag moved by the caravan's dx, no alpha */
  function drawOld(g: Parameters<typeof drawWagon>[0], s: BuildScreen): void {
    const run = s.run, lay = s.L.wagon!, L = s.L, base = s.offers().length + 1;
    const dx = (j: number): number => (wagonSlides(s) ? s.caravan.dx(base + j, L.W) : 0);
    const offers = run.shop.enchanter!.offers, hov = wordHover(s);
    if (lay.tag) drawEnchanterTag(g, lay.tag.x + dx(0), lay.tag.y);
    offers.forEach((o, i) => drawWordCard(g, { ...lay.rects[i], x: lay.rects[i].x + dx(i) }, o.ench as EnchantId, {
      price: o.price, sold: o.sold, affordable: run.gold >= o.price, selected: false, hover: !!hov && !hov.pick && hov.i === i, t: s.t, maxLift: lay.lift ?? 2,
    }));
  }
  /**
   * POLISH-8 R2 (REVIEW-POLISH7 V8; tests only): THE ROLL-IN PINNED ON RECORDED FRAMES. `drawOld` above redraws the old wagon through the NEW drawWordCard, so a change inside drawWordCard (a pixel of the card, its frame, its price) would leave
   * "the roll-in draws as the base does" green. These are sha16 hashes of the wagon-only raster (drawWagon on a clean raster, the review's hash: RV6/kit/rv7-snip-p74.test.ts) at 8 moments of the roll-in (t 0 to 0.8 s) and at rest, at five views (an
   * ENCHANTER dawn, 5 offers, no rune, the wagon sliding), recorded at C0 = 64715ee71345 with O/kit/p8-snip-rollin.test.ts: the three landscape views' hashes are C0's, unchanged since; the two portrait phones' are P8-2's (2142dd0d84d9), and each of their
   * frames is the C0 frame shifted down exactly 1 row (P8-2 moved the margin stack 1 px lower under the corner MENU; proved pixel for pixel on the parked frames, 72 inked rows each, and the hash of every moment follows): C0's were op-402x690
   * 379a029636ab1541 (rest), b73564c13ce39e49 (t 0-0.30), 5f04f2e922e86842, 5a7b84288e4bc94e, 07a03f604995fb6e (t 0.45, 0.60, 0.80); phone-360x640 65a1dabe9d8ea9f3, 340c25e1d9c44e0b, d1096600108107d2, 6aeac09428737527, 9bc0fe8035827271.
   * Moments 0 to 0.30 s are one frame (the cards wait off to the right until their time comes), so each view has 6 distinct frames and a rest frame.
   */
  const MOMENTS = [0, 0.05, 0.10, 0.20, 0.30, 0.45, 0.60, 0.80];
  const ROLLIN: Record<string, string[]> = { // [rest, then the 8 moments]
    "laptop-1366x768": ["d93952a19346c290", "3f7e4c82d04a6b83", "3f7e4c82d04a6b83", "3f7e4c82d04a6b83", "3f7e4c82d04a6b83", "3f7e4c82d04a6b83", "3f7e4c82d04a6b83", "96107fe8668c0366", "78d038bd129b9dc2"],
    "land-844x390": ["3ef8380154f57c1c", "c29871ff6094c46d", "c29871ff6094c46d", "c29871ff6094c46d", "c29871ff6094c46d", "c29871ff6094c46d", "c29871ff6094c46d", "c66249097a12f188", "2ac9ef96fb631618"],
    "desk-1280x800": ["e84017b49b452c91", "ee2b0ebe5b6eecb4", "ee2b0ebe5b6eecb4", "ee2b0ebe5b6eecb4", "ee2b0ebe5b6eecb4", "ee2b0ebe5b6eecb4", "340185580565b29c", "972d8de9a718e450", "e7f164eeb1ff7c86"],
    "op-402x690": ["01384617f4a8ac80", "d0761dafbc28fc23", "d0761dafbc28fc23", "d0761dafbc28fc23", "d0761dafbc28fc23", "d0761dafbc28fc23", "5b3b840f33f0fb23", "700f23c4ac8cb6f6", "41b6feca6f92b6d0"],
    "phone-360x640": ["1427fda961039885", "7d19782b95f7a1f7", "7d19782b95f7a1f7", "7d19782b95f7a1f7", "7d19782b95f7a1f7", "7d19782b95f7a1f7", "018e20da55be747d", "166ef9fad06748a6", "c4b9e2f13619ad14"],
  };
  const sha = (c: RasterCanvas): string => createHash("sha256").update(c.px.map((p) => p ?? "-").join(",")).digest("hex").slice(0, 16);
  it("the roll-in's frames are the recorded ones: 5 views x 8 moments and the wagon at rest (45 frames), by hash -- a change inside drawWordCard, drawEnchanterTag or wagonView's rects turns this red, which drawOld's redraw through the same code cannot", () => {
    on(() => {
      let n = 0;
      for (const name of Object.keys(ROLLIN) as Name[]) {
        const s = rig(name, 0, 5), L = s.L;
        const frame = (state: "in" | "parked", t: number): string => { caravanAt(s, state, t); const img = fresh(L.W, L.H); drawWagon(G(img), s); return sha(img); };
        expect(frame("parked", 3), `${name}: the wagon at rest`).toBe(ROLLIN[name][0]);
        MOMENTS.forEach((t, i) => { expect(frame("in", t), `${name}: the roll-in at t ${t.toFixed(2)} s`).toBe(ROLLIN[name][i + 1]); n++; });
        n++;
      }
      expect(n, "frames pinned").toBe(45);
    });
  });
  for (const [name, runes, offers] of SCENES) {
    it(`${name} (${runes} rune${runes === 1 ? "" : "s"}, ${offers} offers): through the roll-in (t 0 to 1.1 s, every 1/60 s) every pixel the wagon draws is the pixel polish6-accepted drew; and a REROLL (the wagon does not slide) leaves it drawn in full`, () => {
      on(() => {
        const s = rig(name, runes, offers), L = s.L, wg = L.wagon!;
        const rows = [...wg.rects, ...(wg.tag ? [{ x: wg.tag.x, y: wg.tag.y, w: 1, h: 5 }] : [])]; // the cards ride sideways: their rows (and the lift above) are all there is to compare
        const y0 = Math.max(0, Math.min(...rows.map((q) => q.y)) - 4), y1 = Math.min(L.H, Math.max(...rows.map((q) => q.y + q.h)) + 5);
        let moved = 0;
        for (let t = 0; t <= 1.1 + 1e-9; t += FRAME) {
          caravanAt(s, "in", t);
          const a = fresh(L.W, L.H), b = fresh(L.W, L.H);
          drawWagon(G(a), s);
          drawOld(G(b), s);
          let diff = 0;
          for (let y = y0; y < y1; y++) for (let x = 0; x < L.W; x++) if (a.at(x, y) !== b.at(x, y)) diff++;
          expect(diff, `${name} t ${t.toFixed(3)}: pixels that differ from the roll-in as it was`).toBe(0);
          if (s.caravan.dx(s.offers().length + 1, L.W) !== 0) moved++;
          expect(wagonView(s)!.alpha, `${name} t ${t.toFixed(3)}: the roll-in is drawn in full`).toBe(1);
        }
        expect(moved, `${name}: the cards do ride in`).toBeGreaterThan(0);
        // a REROLL: wagonSlide(false), the caravan "out": the wagon stays, drawn in full
        wagonSlide(s, false);
        caravanAt(s, "out", 0.2);
        const v = wagonView(s)!;
        expect(v.alpha, `${name}: a REROLL leaves the wagon drawn in full`).toBe(1);
        expect(v.cards.map((c) => c.rect), `${name}: where it is`).toEqual(L.wagon!.rects);
        wagonSlide(s, true);
      });
    });
  }
});
