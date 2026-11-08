// POLISH-7 (REQ-BFG-089; P7-3, REVIEW-POLISH6 V10 / filed OPEN P6-V10): THE ENCHANTER'S PORTRAIT ROW CLEARS THE HULL AND EVERY TARGET; THE DETAILS BAND'S HEIGHT IS PINNED, WITH THE WAGON AND WITHOUT IT.
//   At phone-360x640@2 on an ENCHANTER dawn with a rune held and 6 or 7 shop offers the shop's two rows and the rune bar leave 37 px between them and the hull's bow edge (enchantStrip.ts inRow, portrait). The word cards (46 x 42, row
//   y 173) ended at 215: 1 px over L.hull (y 214) and 8 px over the bow turrets' mounts (24 x 24 at y 207, which reach above the hull), and the band under the row was 210 x 0 (REVIEW-POLISH6 N4: RV5/logs/n4-tip-portrait.txt :19-20).
//   Now the row's cards are as tall as the room under them allows (a finger and MIN_H at least, CARD_H at most): 46 x 32 there (the x1 icon under 38 px: RULING-SCOUT-POLISH6 S1.1), and a portrait row's lift is 1 (its 3 clear rows above, less the
//   frame's row and 1 px of clear). Every other case is as it was. (b) The band's height with the wagon and on the same dawn without it, both portrait phones, 3 to 7 offers, no rune and one: pinned below (BAND). At 360x640 with a rune and 6 or 7
//   offers the band is 26 px WITHOUT the wagon and 0 with it: the wagon takes it to 0 there (and no card the rules allow gives it back: the row's floor is a finger, 27 px, and 173 + 27 + 2 is under the band's foot at 198 by none).
import { afterEach, describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { VIEWS13 } from "./polish4.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { viewWithSub } from "../src/game/viewGrid";
import { BuildScreen } from "../src/screens/build/build";
import { newRun, rollShop, type Run } from "../src/game/run";
import { ENCHANT, setEnchant, withEnchant, type EnchantId } from "../src/sim/enchant";
import { turretSlots } from "../src/sim/deck";
import { tapPx, TAP_CSS } from "../src/ui/tap";
import { UI, type Rect } from "../src/ui/ui";
import { drawWagon } from "../src/screens/build/enchantStrip";
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
const on = <T,>(fn: () => T): T => withEnchant(fn, true);
const PORTRAIT2 = ["op-402x690", "phone-360x640"] as const;
type Name = (typeof PORTRAIT2)[number];
const lenient = (c: RasterCanvas): CanvasRenderingContext2D =>
  new Proxy(G(c), { get: (t, k, r) => { const v = Reflect.get(t, k, r); return v !== undefined ? (typeof v === "function" ? v.bind(t) : v) : (): undefined => undefined; } }) as unknown as CanvasRenderingContext2D;

/** An ENCHANTER dawn (day 3) with `offers` shop offers and `runes` held runes, the wagon up or (`wagon` false) the same dawn without it. */
function dayRun(offers: number, runes: number, wagon: boolean): Run {
  return on(() => {
    const run = newRun("furnace", 7);
    run.day = 3;
    run.gold = 20;
    run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
    rollShop(run);
    run.runeDay = undefined;
    const w0 = run.shop.wagons[0];
    run.shop.wagons = [{ ...w0, offers: Array.from({ length: offers }, (_, i) => ({ ...w0.offers[i % w0.offers.length] })) }];
    if (wagon) run.shop.enchanter = { day: 3, offers: (["fiery", "wide"] as EnchantId[]).map((ench) => ({ ench, price: 4, sold: false })) };
    else delete run.shop.enchanter;
    run.build.runes = Array.from({ length: runes }, () => ({ id: "many_hands" })) as never;
    return run;
  });
}
interface Case { s: BuildScreen; L: BuildScreen["L"]; ui: UI; regions: { id: string; r: Rect }[]; deck: [string, Rect][]; tap: number; k: number }
/** A real BuildScreen at the view, entered and drawn once: its layout, the regions the frame registered and the deck's own targets (every turret mount, part and cargo slot). */
function build(name: Name, runes: number, offers: number, wagon: boolean): Case {
  const [w, h, dpr] = VIEWS13[name];
  const fake = new FakeGame(dayRun(offers, runes, wagon), w, h, dpr);
  const s = new BuildScreen(fake as unknown as Game);
  fake.view = viewWithSub(w, h, dpr, s.pickScale.bind(s), s.pickSub.bind(s));
  s.enter();
  s.update(3);
  const L = s.L, c = fresh(L.W, L.H), ui = fake.ui;
  ui.begin();
  s.draw(lenient(c));
  ui.end();
  const deck: [string, Rect][] = [];
  turretSlots(s.run.build).forEach((_, i) => deck.push([`turret${i}`, s.turretRect(i)]));
  for (const p of s.run.build.items) deck.push([`item${p.uid}`, s.itemScreenRect(p)]);
  for (let i = 0; i < Math.min(s.cargoSlots(), s.run.inventory.length); i++) deck.push([`cargo${i}`, s.cargoHit(i)]);
  return { s, L, ui, regions: ui.regions.map((q) => ({ id: q.id, r: q.r })), deck, tap: tapPx(fake.view), k: fake.view.scale / fake.view.dpr };
}
/** the axis gap between two rects: negative = they overlap, 0 = they touch */
const gapOf = (a: Rect, b: Rect): number => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
const grown = (q: Rect, d: number): Rect => ({ x: q.x - d, y: q.y - d, w: q.w + 2 * d, h: q.h + 2 * d });
/** inked pixels inside `q` (a zoomed carrier's rects are fractional: every pixel the rect touches counts) */
const inked = (c: RasterCanvas, q: Rect): number => {
  let n = 0;
  for (let y = Math.floor(q.y); y < Math.ceil(q.y + q.h); y++) for (let x = Math.floor(q.x); x < Math.ceil(q.x + q.w); x++) if (c.at(x, y) !== null) n++;
  return n;
};

/** THE TABLE (O/logs/p7-3-n4-tip.txt): per view, runes held / shop offers: the place the wagon takes, its shift, the first card's w x h, and the details band's height WITH the wagon and on the same dawn WITHOUT it.
 *  Only 360x640 with a rune and 6 or 7 offers moved (row cards 42 -> 32 tall, shift 45 -> 35; the band 0 either way with the wagon). */
const BAND: Record<Name, Record<string, [place: "row" | "margin", shift: number, w: number, h: number, withWagon: number, without: number]>> = {
  "op-402x690": {
    "0/3": ["row", 53, 46, 42, 43, 96], "0/4": ["margin", 0, 43, 36, 90, 90], "0/5": ["margin", 0, 43, 36, 90, 90], "0/6": ["row", 45, 46, 42, 45, 90], "0/7": ["row", 45, 46, 42, 12, 57],
    "1/3": ["row", 53, 46, 42, 10, 63], "1/4": ["margin", 0, 43, 42, 57, 57], "1/5": ["margin", 0, 43, 42, 57, 57], "1/6": ["row", 45, 46, 42, 12, 57], "1/7": ["row", 45, 46, 42, 11, 56],
  },
  "phone-360x640": {
    "0/3": ["row", 53, 46, 42, 45, 98], "0/4": ["margin", 0, 30, 36, 92, 92], "0/5": ["margin", 0, 30, 36, 92, 92], "0/6": ["row", 45, 46, 42, 14, 59], "0/7": ["row", 45, 46, 42, 14, 59],
    "1/3": ["row", 53, 46, 42, 12, 65], "1/4": ["margin", 0, 30, 42, 59, 59], "1/5": ["margin", 0, 30, 42, 59, 59], "1/6": ["row", 35, 46, 32, 0, 26], "1/7": ["row", 35, 46, 32, 0, 26],
  },
};

vi.stubGlobal("localStorage", new MapStore());
setTipsForTests("done");

describe("POLISH-7 P7-3 (a): the wagon's cards clear L.hull and every target by 1 px at least, drawn as they are drawn", () => {
  for (const name of PORTRAIT2) {
    it(`${name}: 3 to 7 offers, no rune and one rune: the cards and their finger targets are on the screen, 1 px clear of L.hull, the deck's targets (turret mounts, parts, cargo) and every other region; the row (shift > 0) also in its selected form (lift, frame, shadow) and its tag`, () => {
      for (const runes of [0, 1]) for (const offers of [3, 4, 5, 6, 7]) {
        const tag = `${name} runes ${runes} offers ${offers}`;
        on(() => {
          const c = build(name, runes, offers, true), L = c.L, wg = L.wagon!;
          expect(wg, `${tag}: a wagon`).toBeTruthy();
          const own = (q: Rect): boolean => wg.hits.some((hh) => hh.x === q.x && hh.y === q.y && hh.w === q.w && hh.h === q.h);
          const targets: [string, Rect][] = [["L.hull", L.hull], ["L.cargo", L.cargo], ["L.fight", L.fight], ["L.bar", L.bar], ["L.info", L.info], ...c.deck,
            ...c.regions.filter((q) => !own(q.r) && q.r.w > 0 && q.r.h > 0).map((q): [string, Rect] => [`region ${q.id}`, q.r])];
          const row = wg.shift > 0;
          // the plain cards and their finger targets: on the screen, a finger's size, 1 px clear of every target
          for (const q of [...wg.rects, ...wg.hits]) {
            expect(q.x >= 0 && q.y >= 0 && q.x + q.w <= L.W && q.y + q.h <= L.H, `${tag}: on the screen ${JSON.stringify(q)}`).toBe(true);
            for (const [nm, o] of targets) expect(gapOf(q, o), `${tag}: ${JSON.stringify(q)} against ${nm} ${JSON.stringify(o)}`).toBeGreaterThanOrEqual(1);
          }
          for (const hh of wg.hits) { expect(hh.w * c.k, `${tag}: tap width`).toBeGreaterThanOrEqual(TAP_CSS - 0.5); expect(hh.h * c.k, `${tag}: tap height`).toBeGreaterThanOrEqual(TAP_CSS - 0.5); }
          if (!row) return; // the margin's stacked cards: as they were (their selection frame and lift reach the corner MENU's rows: filed for cap, not the row)
          // the row, drawn: each card selected in turn (the worst case: its lift, its frame 1 px round it, its shadow 1 px under it) and the tag: no pixel inside any target grown by 1 px (that is, 1 px clear)
          for (let i = 0; i < wg.rects.length; i++) {
            c.s.sel = { kind: "word", pick: false, i };
            const img = fresh(L.W, L.H);
            drawWagon(G(img), c.s);
            expect(inked(img, wg.rects[i]), `${tag}: card ${i} is drawn`).toBeGreaterThan(0);
            for (const [nm, o] of targets) expect(inked(img, grown(o, 1)), `${tag}: card ${i} selected (lift ${wg.lift ?? 2}), tag: pixels within 1 px of ${nm} ${JSON.stringify(o)}`).toBe(0);
          }
        });
      }
    });
  }

  it("360x640@2, a rune held, 6 or 7 offers (the case of REVIEW-POLISH6 V10): the cards are 46 x 32 at y 173 (205 at the foot), 2 px short of the bow turrets' mounts (y 207) and 9 short of the hull (214); they were 46 x 42, 8 px over the mounts and 1 px over the hull", () => {
    for (const offers of [6, 7]) on(() => {
      const c = build("phone-360x640", 1, offers, true), wg = c.L.wagon!;
      expect(wg.rects.map((q) => [q.x, q.y, q.w, q.h]), `${offers} offers`).toEqual([[61, 173, 46, 32], [110, 173, 46, 32]]);
      expect(wg.lift, "the row's lift").toBe(1);
      const mounts = c.deck.filter(([nm]) => nm.startsWith("turret")).map(([, q]) => q);
      expect(mounts.length, "the bow turrets' mounts").toBeGreaterThanOrEqual(2);
      expect(Math.min(...mounts.map((q) => q.y)), "the first mount's top").toBe(207);
      expect(c.L.hull.y, "the hull's bow edge").toBe(214);
      for (const q of wg.rects) expect(q.y + q.h + 1, "the foot incl. the shadow's row").toBeLessThan(207);
    });
  });
});

describe("POLISH-7 P7-3 (b): the details band's height, with the wagon and on the same dawn without it", () => {
  for (const name of PORTRAIT2) {
    it(`${name}: 3 to 7 offers, no rune and one rune: the place (row / margin), its shift, the first card's size and the band's height with and without the wagon are pinned; the band without the wagon is the margin's too (nothing lost)`, () => {
      for (const runes of [0, 1]) for (const offers of [3, 4, 5, 6, 7]) {
        const key = `${runes}/${offers}`, tag = `${name} ${key}`, [place, shift, w, h, withWagon, without] = BAND[name][key];
        on(() => {
          const a = build(name, runes, offers, true), b = build(name, runes, offers, false);
          const wg = a.L.wagon!;
          expect(b.L.wagon, `${tag}: no wagon on the plain dawn`).toBeUndefined();
          expect([wg.shift > 0 ? "row" : "margin", wg.shift, wg.rects[0].w, wg.rects[0].h], `${tag}: place, shift, first card`).toEqual([place, shift, w, h]);
          expect(a.L.info.h, `${tag}: the band with the wagon`).toBe(withWagon);
          expect(b.L.info.h, `${tag}: the band without it`).toBe(without);
          expect(a.L.info.y + a.L.info.h, `${tag}: the band's foot with the wagon is the plain band's (the row takes the band's top, or all of it)`).toBe(Math.max(a.L.info.y, b.L.info.y + b.L.info.h));
        });
      }
    });
  }

  it("the wagon takes the band to 0 only at 360x640 with a rune and 6 or 7 offers, where it is 26 px without the wagon (below the 45 to 60 px a panel needs): the band is never 0 without the wagon at either portrait phone", () => {
    const zero: string[] = [], zeroPlain: string[] = [];
    for (const name of PORTRAIT2) for (const runes of [0, 1]) for (const offers of [3, 4, 5, 6, 7]) on(() => {
      if (build(name, runes, offers, true).L.info.h === 0) zero.push(`${name} ${runes}/${offers}`);
      if (build(name, runes, offers, false).L.info.h === 0) zeroPlain.push(`${name} ${runes}/${offers}`);
    });
    expect(zero).toEqual(["phone-360x640 1/6", "phone-360x640 1/7"]);
    expect(zeroPlain).toEqual([]);
  });
});
