// POLISH-8 (REQ-BFG-087; P8-2, display list P7-V4, ruling 7 of RULING-REVIEW-POLISH6): A PORTRAIT MARGIN CARD, DRAWN SELECTED, KEEPS 1 PX CLEAR OF THE CORNER MENU, THE RUNE BAR AND EVERY OTHER TARGET.
//   At op-402x690 and phone-360x640 with 4 or 5 offers the ENCHANTER's two word cards stack in the margin left of the shop block (enchantStrip.ts inMargin). Plain, the first card is 1 px under the corner MENU's finger square (tap + 1 = 28 rows), but
//   selected it is drawn as drawWordCard draws it: lifted LIFT (2) rows, its frame 1 px round it, its shadow: the frame reached 2 rows into the MENU's target with no rune (gap -2) and touched the rune bar with one rune (gap 0); on a phone whose
//   bar was lifted a finger tall (no corner MENU) it touched the bar (0). The same on every margin case of the review's 19 phone viewports (SWEEP19): 68 cases, 204 states. Card 1 selected touched card 0 above it (lift 2 + frame 1 = the GAP of 3).
//   THE RULE (BRIEF-POLISH8 P8-2): a margin card, drawn as selected, keeps 1 px clear of the corner MENU (the drawn button and cornerTarget's rects), of the rune bar and its chips, of the sibling card and of every other target; every card and tap target stays a
//   finger (TAP_CSS CSS px); the face stays inside RULING-SCOUT-POLISH6 S1.1-S1.2 (a word card at least 32 tall and 30 wide; the x1 icon under 38). The change (enchantStrip.ts inMargin, portrait only): the lift is cut to the clear rows above the first
//   card (WagonPlace.lift: clear rows - 2, at most GAP - 2 = 1, the clear between the stacked cards), and where the corner MENU's square leaves too few clear rows (its foot + 1 clear row: 1 where 2 + lift are needed) the stack starts 1 px lower.
//   BEFORE -> AFTER, the two phones (SIZES below): no rune, 4 or 5 offers: the first card y 28 -> 29 (the stack had one spare row at the foot, so the cards keep their 36 rows: the review's estimate of 36 -> 35 did not come true), lift 2 -> 0; with a rune: y 50, h 42
//   as they were, lift 2 -> 1.
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
import { drawWagon, drawWordCard, wagonView } from "../src/screens/build/enchantStrip";
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
const lenient = (c: RasterCanvas): CanvasRenderingContext2D =>
  new Proxy(G(c), { get: (t, k, r) => { const v = Reflect.get(t, k, r); return v !== undefined ? (typeof v === "function" ? v.bind(t) : v) : (): undefined => undefined; } }) as unknown as CanvasRenderingContext2D;

/** SWEEP19 as tests/polish8.idlestrip.test.ts has it: the review's 19 phone viewports (REVIEW-POLISH7 :64; CSS px x DPR). */
const SWEEP19: Record<string, [number, number, number]> = {
  "op-402x690": VIEWS13["op-402x690"], "phone-360x640": VIEWS13["phone-360x640"], "phone-360x640@2": [360, 640, 2], "band-280x653": VIEWS13["band-280x653"], "band-300x640": VIEWS13["band-300x640"],
  ...Object.fromEntries("375x667x2,390x844x3,393x852x3,412x915x2.625,414x896x3,430x932x3,360x740x3,360x800x3,320x568x2,402x874x3,428x926x3,375x812x3,412x892x2.625,384x854x2.8".split(",")
    .map((s): [string, [number, number, number]] => { const [w, h, d] = s.split("x").map(Number); return [`v${w}x${h}@${d}`, [w, h, d]]; })),
};
const PHONES = ["op-402x690", "phone-360x640"] as const;

/** An ENCHANTER dawn (day 3) with `offers` shop offers and `runes` held runes, the wagon up. */
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
interface Case { s: BuildScreen; L: BuildScreen["L"]; ui: UI; regions: { id: string; r: Rect }[]; tp: number; k: number }
/** A real BuildScreen at the view, entered and drawn once with nothing selected. */
function build(name: string, runes: number, offers: number): Case {
  const [w, h, dpr] = SWEEP19[name];
  const fake = new FakeGame(dayRun(offers, runes), w, h, dpr);
  const s = new BuildScreen(fake as unknown as Game);
  fake.view = viewWithSub(w, h, dpr, s.pickScale.bind(s), s.pickSub.bind(s));
  s.enter();
  s.update(3);
  const L = s.L, c = fresh(L.W, L.H), ui = fake.ui;
  ui.begin();
  s.draw(lenient(c));
  ui.end();
  return { s, L, ui, regions: ui.regions.map((q) => ({ id: q.id, r: q.r })), tp: tapPx(fake.view), k: fake.view.scale / fake.view.dpr };
}
const q = (r: Rect | null | undefined): number[] | null => (r ? [r.x, r.y, r.w, r.h] : null);
/** the axis gap between two rects: negative = they overlap, 0 = they touch, 1 = one clear px */
const gapOf = (a: Rect, b: Rect): number => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
/** the bounding box of the inked pixels of a raster, or null */
function inkBox(c: RasterCanvas): Rect | null {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (c.at(x, y) !== null) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/** Every target a margin card must keep 1 px clear of, named: the corner MENU (the drawn button, chrome.ts drawTopBar, and cornerTarget's rects), the rune bar and its chips, the shop's cards, REROLL and the packs, the bar, the hull, the band, the cargo
 *  tray, FIGHT, the deck's turret mounts and every other region the frame registered (the wagon's own finger targets and the sibling card excepted: the sibling is checked on its own). */
function targetsOf(c: Case, own: Rect[]): [string, Rect][] {
  const { s, L } = c;
  const isOwn = (r: Rect): boolean => own.some((hh) => hh.x === r.x && hh.y === r.y && hh.w === r.w && hh.h === r.h);
  const B = s.runeBar.layout(s);
  const oy = Math.floor((L.bar.h - 14) / 2), narrow = L.W < 200;
  const menuR: Rect = { x: 2, y: 1 + oy, w: narrow ? 21 : 27, h: 12 }; // chrome.ts drawTopBar: the corner MENU's drawn button
  return [
    ...(s.cornerMenu ? [["MENU button (drawn)", menuR] as [string, Rect], ...s.cornerMenu.map((r, i): [string, Rect] => [`cornerTarget[${i}]`, r])] : []),
    ...(B ? [...B.chips.map((r, i): [string, Rect] => [`rune chip ${i}`, r]), ...(B.more ? [["rune +k chip", B.more] as [string, Rect]] : []), ["rune bar", B.bar] as [string, Rect]] : []),
    ...L.cards.map((r, i): [string, Rect] => [`shop card ${i}`, r]), ["REROLL", L.reroll], ...L.packs.map((r, i): [string, Rect] => [`pack ${i}`, r]),
    ["L.bar", L.bar], ["L.hull", L.hull], ["L.info", L.info], ["L.cargo", L.cargo], ["L.fight", L.fight],
    ...turretSlots(s.run.build).map((_, i): [string, Rect] => [`mount ${i}`, s.turretRect(i)]),
    ...c.regions.filter((r) => !isOwn(r.r) && r.r.w > 0 && r.r.h > 0).map((r): [string, Rect] => [`region ${r.id}`, r.r]),
  ];
}
/** The worst gap of one state: the plain wagon (`sel` null) or card `sel` selected. The INK the screen's own drawWagon draws (lift, frame, shadow) against every target; and, for a selected card, the ink of that card drawn alone (drawWordCard with the
 *  options drawWagon gives it: wagonView's lift) against the sibling card's rect, which is a target too. */
function worst(c: Case, sel: number | null): { gap: number; name: string } {
  const wg = c.L.wagon!, s = c.s;
  s.sel = sel === null ? { kind: "none" } : { kind: "word", pick: false, i: sel };
  const img = fresh(c.L.W, c.L.H);
  drawWagon(G(img), s);
  const ink = inkBox(img);
  expect(ink, "the wagon is drawn").not.toBeNull();
  let w: { gap: number; name: string } = { gap: 1e9, name: "" };
  for (const [nm, r] of targetsOf(c, wg.hits)) { const g = gapOf(ink!, r); if (g < w.gap) w = { gap: g, name: nm }; }
  if (sel !== null) {
    const v = wagonView(s)!, card = v.cards[sel], one = fresh(c.L.W, c.L.H);
    drawWordCard(G(one), card.rect, card.id, { price: card.price, sold: card.sold, affordable: true, selected: true, hover: false, t: s.t, maxLift: v.lift, alpha: 1 });
    const inkOne = inkBox(one)!;
    wg.rects.forEach((r, i) => { if (i !== sel) { const g = gapOf(inkOne, r); if (g < w.gap) w = { gap: g, name: `the sibling card ${i}` }; } });
  }
  return w;
}

/** BEFORE -> AFTER, the two phones, 4 and 5 offers (the places: the margin both sides): [x, y, w, h] of the first card and the lift (WagonPlace.lift; absent = LIFT 2). */
const SIZES: Record<(typeof PHONES)[number], Record<string, { was: number[]; now: number[]; wasLift: number; lift: number }>> = {
  "op-402x690": {
    "0/4": { was: [2, 28, 43, 36], now: [2, 29, 43, 36], wasLift: 2, lift: 0 }, "0/5": { was: [2, 28, 43, 36], now: [2, 29, 43, 36], wasLift: 2, lift: 0 },
    "1/4": { was: [2, 50, 43, 42], now: [2, 50, 43, 42], wasLift: 2, lift: 1 }, "1/5": { was: [2, 50, 43, 42], now: [2, 50, 43, 42], wasLift: 2, lift: 1 },
  },
  "phone-360x640": {
    "0/4": { was: [2, 28, 30, 36], now: [2, 29, 30, 36], wasLift: 2, lift: 0 }, "0/5": { was: [2, 28, 30, 36], now: [2, 29, 30, 36], wasLift: 2, lift: 0 },
    "1/4": { was: [2, 50, 30, 42], now: [2, 50, 30, 42], wasLift: 2, lift: 1 }, "1/5": { was: [2, 50, 30, 42], now: [2, 50, 30, 42], wasLift: 2, lift: 1 },
  },
};

vi.stubGlobal("localStorage", new MapStore());
setTipsForTests("done");

describe("POLISH-8 P8-2: a margin card keeps 1 px clear of the corner MENU, the rune bar and every other target, plain and selected", () => {
  it("both phones (op-402x690, phone-360x640), 4 and 5 offers, no rune and one rune: the wagon stays in the margin (two cards stacked, no tag, shift 0), the first card is where SIZES says, and the plain wagon and each card selected (lift, frame, shadow: the screen's own draw) keep 1 px clear of every target", () => {
    for (const name of PHONES) for (const runes of [0, 1]) for (const offers of [4, 5]) on(() => {
      const key = `${runes}/${offers}`, tag = `${name} ${key}`, c = build(name, runes, offers), wg = c.L.wagon!, want = SIZES[name][key];
      expect(wg, `${tag}: a wagon`).toBeTruthy();
      expect([wg.shift, wg.rects.length, wg.tag], `${tag}: the margin: shift 0, two cards, no tag`).toEqual([0, 2, null]);
      expect(q(wg.rects[0]), `${tag}: the first card (was ${JSON.stringify(want.was)})`).toEqual(want.now);
      expect(wg.lift ?? 2, `${tag}: the lift (was ${want.wasLift})`).toBe(want.lift);
      for (const sel of [null, 0, 1]) {
        const w = worst(c, sel);
        expect(w.gap, `${tag} ${sel === null ? "plain" : `card ${sel} selected`}: the ink is ${w.gap} px from ${w.name}`).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it("every margin case of SWEEP19 (68 cases: the 19 phone viewports x no rune and one rune x 3-7 offers where the wagon stands in the margin; 204 states): plain and each card selected keep 1 px clear of every target, and every card and finger target is a finger (TAP_CSS CSS px) and a word card's face (at least 32 tall, 30 wide)", () => {
    let cases = 0, states = 0;
    const bad: string[] = [];
    for (const name of Object.keys(SWEEP19)) for (const runes of [0, 1]) for (const offers of [3, 4, 5, 6, 7]) on(() => {
      const c = build(name, runes, offers), wg = c.L.wagon;
      if (!wg || wg.shift > 0) return; // a row: P8-1's and POLISH-7's
      const tag = `${name} ${runes}/${offers}`;
      cases++;
      for (const r of [...wg.rects, ...wg.hits]) {
        expect(r.w * c.k, `${tag}: ${JSON.stringify(q(r))} a finger wide`).toBeGreaterThanOrEqual(TAP_CSS - 0.5);
        expect(r.h * c.k, `${tag}: ${JSON.stringify(q(r))} a finger tall`).toBeGreaterThanOrEqual(TAP_CSS - 0.5);
      }
      for (const r of wg.rects) { expect(r.h, `${tag}: a word card is at least 32 tall`).toBeGreaterThanOrEqual(32); expect(r.w, `${tag}: and 30 wide`).toBeGreaterThanOrEqual(30); }
      for (const sel of [null, 0, 1]) {
        const w = worst(c, sel);
        states++;
        if (w.gap < 1) bad.push(`${tag} ${sel === null ? "plain" : `card ${sel} selected`}: ${w.gap} px from ${w.name}`);
      }
    });
    expect(bad, "states with the ink under 1 px from a target").toEqual([]);
    expect([cases, states]).toEqual([68, 204]);
  });
});
