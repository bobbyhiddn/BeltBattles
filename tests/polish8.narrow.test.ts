// POLISH-8 (REQ-BFG-087; P8-3, REVIEW-POLISH7 V3; tests only): THE ENCHANTER'S WAGON AT THE TWO NARROW VIEWPORTS, band-280x653 AND band-300x640, WITH EACH OF THE SIX HEROES' MOUNTS: 1 PX CLEAR IN 19 OF 20 CASES, THE 20TH NAMED.
//   tests/polish7.portrait.test.ts covers the two portrait phones only (402x690 and 360x640, the furnace). The review (RV6/logs/p73b-table.txt and p73hb-<hero>-table.txt, furnace/weaver/foundry/bastion/metronome/siphon) measured both narrow
//   viewports, no rune and one rune, 3 to 7 offers (20 cases a hero): the wagon's cards and finger targets, and the ink the screen draws (plain; each card selected: lift, frame, shadow), keep 1 px clear of L.hull, every deck target and every other
//   region in 19 of the 20. THE 20TH: band-280x653, no rune, 7 offers. There the shop's rows and the bar leave the row no room: it stands at the floor MIN_H (30 px: 46 x 30 at y 185, shift 33), the band is 0, and the row lies 1 px over the first bow turret's mount
//   (2 px selected: its lift 1 and its shadow); the mount is the hero's (bastion and furnace mount0, metronome mount1, foundry and siphon mount2, weaver mount3; under both cards, or under card 1 alone for the weaver and the metronome). It was 13 px over at
//   polish6-accepted (46 x 42). NAMED here, NOT FIXED: a card under 30 px is a
//   face beyond RULING-SCOUT-POLISH6 S1.1. The numbers of the fix, for cap (arithmetic from the measured gaps, not built): the row is 46 x 30 at y 185 and the mount's top is at 214; the plain card clears it by 1 px at 28 px tall (185 + 28 = 213), the
//   selected card at 27 (its frame or shadow row lies 1 px under the card's foot: 185 + 27 + 1 = 213), and 27 art px is a finger (44 CSS px at this scale, tapPx 27) but under MIN_H (30) and S1.1's shortest face (32).
//   POLISH-8 P8-2 changed the margin cases (3 offers at both viewports, no rune and one rune: the stack 1 px lower under the corner MENU, the lift 0 or 1); this file checks them too, all heroes.
// POLISH-9 R3 (REVIEW-POLISH8 V2; RULING-SCOUT-POLISH9 9; tests only): THE 20TH CASE NAMES EVERY MOUNT. The probe kept the nearest target of each rect, so a card over two mounts named one: the list above has ONE mount a hero. The review's own list has more: band-280x653,
//   no rune, 7 offers (the row at 37,185 and 86,185, each 46 x 30): weaver mount3 (card 1), metronome mount1 (card 1), foundry mount2 and siphon mount2 (both cards), furnace mount0 (both cards) and mount1 (card 1; both when selected), bastion mount0 (both) and mount1
//   (card 0; card 1 selected): -1 px plain, -2 px selected for each. problems() now lists EVERY target a rect or the ink is within 1 px of, and NAMED names every mount (the table above stands, for its first mount). No rule changes: the 19 clear cases are still clear.
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
const lenient = (c: RasterCanvas): CanvasRenderingContext2D =>
  new Proxy(G(c), { get: (t, k, r) => { const v = Reflect.get(t, k, r); return v !== undefined ? (typeof v === "function" ? v.bind(t) : v) : (): undefined => undefined; } }) as unknown as CanvasRenderingContext2D;

const NARROW = ["band-280x653", "band-300x640"] as const;
type Hero = "furnace" | "weaver" | "foundry" | "bastion" | "metronome" | "siphon";
const HEROES6: Hero[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
/** THE 20TH CASE, per hero: EVERY bow turret mount (turretSlots index) the 46 x 30 row at band-280x653, no rune, 7 offers lies over, and which of the two cards (and their finger targets) lie over it plain (RV6/logs/p73hb-<hero>-table.txt: the
 *  foundry's and siphon's mount2 lie under both cards, the weaver's mount3 and the metronome's mount1 under card 1 alone; card 0 keeps 2 px of L.info there). POLISH-9 R3 (REVIEW-POLISH8 V2): the table named ONE mount a hero, the nearest to each card (the
 *  probe kept only the least gap). The furnace and the bastion have TWO: the furnace's mount0 lies under both cards and its mount1 under card 1 (card 0 reaches it only when selected: -2); the bastion's mount0 lies under both cards and its mount1 under card 0
 *  (card 1 reaches it only when selected: -2). Each is -1 px plain (the card, its finger target, the ink) and -2 px selected (the lift, the frame, the shadow), for each of the 14 mount / card pairs listed here (S9 logs/narrow-tip.txt reproduces the review's list). */
const NAMED: Record<Hero, { mount: number; cards: number[] }[]> = {
  furnace: [{ mount: 0, cards: [0, 1] }, { mount: 1, cards: [1] }], bastion: [{ mount: 0, cards: [0, 1] }, { mount: 1, cards: [0] }], metronome: [{ mount: 1, cards: [1] }],
  foundry: [{ mount: 2, cards: [0, 1] }], siphon: [{ mount: 2, cards: [0, 1] }], weaver: [{ mount: 3, cards: [1] }],
};

/** An ENCHANTER dawn (day 3) of `hero` with `offers` shop offers and `runes` held runes, the wagon up. */
function dayRun(hero: Hero, offers: number, runes: number): Run {
  return on(() => {
    const run = newRun(hero, 7);
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
interface Case { s: BuildScreen; L: BuildScreen["L"]; ui: UI; regions: { id: string; r: Rect }[]; k: number; tp: number }
function build(hero: Hero, name: (typeof NARROW)[number], runes: number, offers: number): Case {
  const [w, h, dpr] = VIEWS13[name];
  const fake = new FakeGame(dayRun(hero, offers, runes), w, h, dpr);
  const s = new BuildScreen(fake as unknown as Game);
  fake.view = viewWithSub(w, h, dpr, s.pickScale.bind(s), s.pickSub.bind(s));
  s.enter();
  s.update(3);
  const L = s.L, c = fresh(L.W, L.H), ui = fake.ui;
  ui.begin();
  s.draw(lenient(c));
  ui.end();
  return { s, L, ui, regions: ui.regions.map((q) => ({ id: q.id, r: q.r })), k: fake.view.scale / fake.view.dpr, tp: tapPx(fake.view) };
}
/** the axis gap between two rects: negative = they overlap, 0 = they touch, 1 = one clear px */
const gapOf = (a: Rect, b: Rect): number => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
function inkBox(c: RasterCanvas): Rect | null {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (c.at(x, y) !== null) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/** Every target the wagon must keep 1 px clear of, named (polish7.portrait's list): L.hull, L.cargo, L.fight, L.bar, L.info, the deck's turret mounts, parts and cargo slots, the shop's cards, REROLL and the packs, every other registered region (the rune bar,
 *  the corner MENU's rects, SND, the details band's regions...); the wagon's own finger targets excepted. */
function targetsOf(c: Case): [string, Rect][] {
  const { s, L } = c, wg = L.wagon!;
  const own = (r: Rect): boolean => wg.hits.some((hh) => hh.x === r.x && hh.y === r.y && hh.w === r.w && hh.h === r.h);
  const t: [string, Rect][] = [["L.hull", L.hull], ["L.cargo", L.cargo], ["L.fight", L.fight], ["L.bar", L.bar], ["L.info", L.info]];
  turretSlots(s.run.build).forEach((_, i) => t.push([`mount${i}`, s.turretRect(i)]));
  for (const p of s.run.build.items) t.push([`item${p.uid}`, s.itemScreenRect(p)]);
  for (let i = 0; i < Math.min(s.cargoSlots(), s.run.inventory.length); i++) t.push([`cargo${i}`, s.cargoHit(i)]);
  L.cards.forEach((r, i) => t.push([`shop card ${i}`, r]));
  t.push(["REROLL", L.reroll]);
  L.packs.forEach((r, i) => t.push([`pack ${i}`, r]));
  for (const r of c.regions) if (!own(r.r) && r.r.w > 0 && r.r.h > 0) t.push([`region ${r.id}`, r.r]);
  return t;
}
/** Every gap under 1 px of one case: the cards and their finger targets (rect / hit), and the drawn ink plain and with each card selected (the screen's own drawWagon: lift, frame, shadow), as `what: gap against name`. POLISH-9 R3: EVERY target a
 *  rect or the ink lies within 1 px of is listed, not the nearest alone (a card over two mounts named one). */
function problems(c: Case): string[] {
  const wg = c.L.wagon!, T = targetsOf(c), out: string[] = [];
  const under = (q: Rect): [number, string][] => T.map(([n, o]): [number, string] => [gapOf(q, o), n]).filter(([g]) => g < 1);
  for (const q of [...wg.rects, ...wg.hits]) {
    expect(q.x >= 0 && q.y >= 0 && q.x + q.w <= c.L.W && q.y + q.h <= c.L.H, `on the screen ${JSON.stringify(q)}`).toBe(true);
    expect(q.w * c.k, "a finger wide").toBeGreaterThanOrEqual(TAP_CSS - 0.5);
    expect(q.h * c.k, "a finger tall").toBeGreaterThanOrEqual(TAP_CSS - 0.5);
  }
  wg.rects.forEach((q, i) => { for (const [g, nm] of under(q)) out.push(`card ${i}: ${g} against ${nm}`); });
  wg.hits.forEach((q, i) => { for (const [g, nm] of under(q)) out.push(`hit ${i}: ${g} against ${nm}`); });
  for (const sel of [null, 0, 1]) {
    c.s.sel = sel === null ? { kind: "none" } : { kind: "word", pick: false, i: sel };
    const img = fresh(c.L.W, c.L.H);
    drawWagon(G(img), c.s);
    const ink = inkBox(img);
    expect(ink, "the wagon is drawn").not.toBeNull();
    for (const [g, nm] of under(ink!)) out.push(`${sel === null ? "plain" : `card ${sel} selected`}: ${g} against ${nm}`);
  }
  return out;
}

vi.stubGlobal("localStorage", new MapStore());
setTipsForTests("done");

describe("POLISH-8 P8-3: the wagon at band-280x653 and band-300x640, each hero's mounts: 1 px clear in 19 of 20 cases, the 20th named", () => {
  for (const hero of HEROES6) {
    it(`${hero}: both narrow viewports x no rune and one rune x 3-7 offers (20 cases): the wagon has a place, its cards and finger targets are a finger and 1 px clear of L.hull, the deck's targets and every region, and so is the ink it draws plain and with each card selected - in 19; the 20th (band-280x653, no rune, 7 offers) is the 46 x 30 row over ${NAMED[hero].map((e) => `mount${e.mount}`).join(" and ")}: -1 px plain, -2 selected`, () => {
      let clear = 0, named = 0;
      for (const name of NARROW) for (const runes of [0, 1]) for (const offers of [3, 4, 5, 6, 7]) on(() => {
        const c = build(hero, name, runes, offers), wg = c.L.wagon, tag = `${hero} ${name} ${runes}/${offers}`;
        expect(wg, `${tag}: a wagon`).toBeTruthy();
        const bad = problems(c);
        if (name === "band-280x653" && runes === 0 && offers === 7) {
          // THE 20TH, NAMED: the row at the MIN_H floor (46 x 30 at y 185, shift 33, the band 0) over each of the hero's mounts: card and hit -1, ink -1 plain and -2 selected, nothing else under 1 px (POLISH-9 R3: every mount, not the nearest alone)
          const ms = NAMED[hero].map((e) => `mount${e.mount}`);
          expect(wg!.shift > 0 && wg!.rects.map((q) => [q.x, q.y, q.w, q.h]), `${tag}: the row`).toEqual([[37, 185, 46, 30], [86, 185, 46, 30]]);
          expect([wg!.shift, c.L.info.h], `${tag}: shift 33, the band 0`).toEqual([33, 0]);
          const want = NAMED[hero].flatMap((e) => {
            const m = `mount${e.mount}`;
            return [...e.cards.flatMap((i) => [`card ${i}: -1 against ${m}`, `hit ${i}: -1 against ${m}`]), `plain: -1 against ${m}`, `card 0 selected: -2 against ${m}`, `card 1 selected: -2 against ${m}`];
          });
          expect(bad.sort(), `${tag}: only ${ms.join(" and ")} are under 1 px (cards over them: ${NAMED[hero].map((e) => `mount${e.mount} ${e.cards.join(", ")}`).join("; ")})`).toEqual(want.sort());
          named++;
        } else {
          expect(bad, `${tag}: every card, finger target and drawn ink is 1 px clear`).toEqual([]);
          clear++;
        }
      });
      expect([clear, named], "19 clear, 1 named").toEqual([19, 1]);
    });
  }
});
