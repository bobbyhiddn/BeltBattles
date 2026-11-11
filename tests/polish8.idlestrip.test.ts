// POLISH-8 (REQ-BFG-087; P8-1, REVIEW-POLISH7 V1, ruled FIX FIRST): THE NEXT BATTLE CARD AND THE HERO CARD ARE DRAWN INSIDE THE BAND, WITH THE ENCHANTER'S WAGON IN A PORTRAIT ROW.
//   With the wagon in a row under the shop, lowerInfo (enchantStrip.ts) took the band's top down by the row's shift d and moved the NEXT BATTLE card down by d too, but the band's foot does not move: on a band of PORT_BAND or less the card ended d px below the
//   foot, over the hull's rim and the bow turrets' mounts (phone-360x640, no rune, 6 offers: band 3,174 210x24, card 3,209: 35 px below the foot, over 528 of 576 px2 of each bow mount), and the hero card above it, which follows the card, was cut from the
//   wrong top. Over the review's 19 phone viewports (SWEEP19) x rune and none x 3-7 offers: 122 wagon-row cases; at C0 the card was outside the lowered band in 82 of them (over the hull in 30: REVIEW-POLISH7's count) and the hero card in 17.
//   THE RULE (BRIEF-POLISH8 P8-1): the card stands where buildLayout's own rule puts it for a band of that top and height, `idle = max(0, floor((h - PORT_BAND) / 2))`, `y = top + idle + min(h, PORT_BAND) - FOE_H`, null under FOE_H (the compact NEXT line, or nothing
//   under 14 px). One pure helper in layout.ts (idleFoeRect) is called by buildLayout and lowerInfo; buildLayout's own output is unchanged by a pixel (the plain dawns, the margin and gap places and landscape: this file checks all 380 cases and the helper
//   over a grid of screens). The hero card follows heroCardRect and chrome.ts as they are (its full form from 30 px, its compact form from HERO_MIN, else nothing). A revealed foe's tap target (SCOUT-1c, foeViewRects) follows the card.
//   The tests below are an independent statement of the rule (ruleCard), never the helper.
import { afterEach, describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { VIEWS13 } from "./polish4.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { viewWithSub } from "../src/game/viewGrid";
import { BuildScreen } from "../src/screens/build/build";
import { newRun, rollShop, type Run } from "../src/game/run";
import { makeEvent, pickChoice } from "../src/game/events";
import { ENCHANT, setEnchant, withEnchant, type EnchantId } from "../src/sim/enchant";
import { tapPx } from "../src/ui/tap";
import { UI, type Rect } from "../src/ui/ui";
import { FOE_H, HERO_MIN, PORT_BAND, buildLayout, heroCardRect, idleFoeRect } from "../src/screens/build/layout";
import { foeViewRects, scoutedFoe } from "../src/screens/build/foeView";
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

/** SWEEP19: the review's 19 phone viewports (REVIEW-POLISH7 :64; CSS px x DPR): the five of VIEWS13 and the 360x640 at DPR 2, and the 14 common phones of its idle sweep (RV6/kit/rv7-idle-sweep.sh). */
const SWEEP19: Record<string, [number, number, number]> = {
  "op-402x690": VIEWS13["op-402x690"], "phone-360x640": VIEWS13["phone-360x640"], "phone-360x640@2": [360, 640, 2], "band-280x653": VIEWS13["band-280x653"], "band-300x640": VIEWS13["band-300x640"],
  ...Object.fromEntries("375x667x2,390x844x3,393x852x3,412x915x2.625,414x896x3,430x932x3,360x740x3,360x800x3,320x568x2,402x874x3,428x926x3,375x812x3,412x892x2.625,384x854x2.8".split(",")
    .map((s): [string, [number, number, number]] => { const [w, h, d] = s.split("x").map(Number); return [`v${w}x${h}@${d}`, [w, h, d]]; })),
};

/** An ENCHANTER dawn (day 3) with `offers` shop offers and `runes` held runes, the wagon up or (`wagon` false) the same dawn without it; `reveal`: a SCOUT stop's SPY has shown tonight's foe (the NEXT BATTLE card's tap target is registered). */
function dayRun(offers: number, runes: number, wagon: boolean, reveal = false): Run {
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
    if (reveal) {
      // The game's stage order (run.ts Stage: caravan, fork, event, warlord, refit, battle) puts the SCOUT stop after the caravan, so the wagon and a revealed foe do not meet on one screen in play; the code does not care (drawFoeCard reads
      // scoutedFoe(run), the run's mark for today, and foeViewRects(L): the tap target is a function of L.foe), and this state holds the wagon's row and the foecard region together, to check that the target follows the card.
      run.event = makeEvent(run.seed, run.day, "scout");
      run.stage = "event";
      pickChoice(run, 2); // SPY: tonight's deck shown
      run.stage = "caravan";
    }
    return run;
  });
}
interface Case { s: BuildScreen; L: BuildScreen["L"]; ui: UI; regions: { id: string; r: Rect }[]; tp: number }
/** A real BuildScreen at the view, entered and drawn once with nothing selected: its layout (after the wagon's place and lowerInfo) and the regions the frame registered. */
function build(name: string, runes: number, offers: number, wagon: boolean, reveal = false): Case {
  const [w, h, dpr] = SWEEP19[name];
  const fake = new FakeGame(dayRun(offers, runes, wagon, reveal), w, h, dpr);
  const s = new BuildScreen(fake as unknown as Game);
  fake.view = viewWithSub(w, h, dpr, s.pickScale.bind(s), s.pickSub.bind(s));
  s.enter();
  s.update(3);
  const L = s.L, c = fresh(L.W, L.H), ui = fake.ui;
  ui.begin();
  s.draw(lenient(c));
  ui.end();
  return { s, L, ui, regions: ui.regions.map((q) => ({ id: q.id, r: q.r })), tp: tapPx(fake.view) };
}
const q = (r: Rect | null): number[] | null => (r ? [r.x, r.y, r.w, r.h] : null);
const inside = (r: Rect, b: Rect): boolean => r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h;
/** THE RULE, stated again here: buildLayout's formula for a portrait band `info` (idle hero card over NEXT BATTLE, PORT_BAND tall together, centred in a taller band; the card at the foot of a shorter one); null under FOE_H. */
const ruleCard = (info: Rect): Rect | null => {
  if (info.h < FOE_H) return null;
  const idle = Math.max(0, Math.floor((info.h - PORT_BAND) / 2));
  return { x: info.x, y: info.y + idle + Math.min(info.h, PORT_BAND) - FOE_H, w: info.w, h: FOE_H };
};
const heroKind = (hero: Rect): "full" | "compact" | "not drawn" => (hero.h >= 30 ? "full" : hero.h >= HERO_MIN ? "compact" : "not drawn");

vi.stubGlobal("localStorage", new MapStore());
setTipsForTests("done");

describe("POLISH-8 P8-1: the NEXT BATTLE card and the hero card are drawn inside the lowered band", () => {
  it("SWEEP19 x no rune and one rune x 3-7 offers, the wagon in a row, nothing selected (122 cases): the card is where buildLayout's rule puts it for the lowered band L.info (null under FOE_H), inside L.info; the hero card is inside L.info (its full form from 30 px, its compact form from HERO_MIN, else not drawn)", () => {
    const seen = { row: 0, card: 0, none: 0, hero: { full: 0, compact: 0, "not drawn": 0 }, line: 0, nothing: 0 };
    for (const name of Object.keys(SWEEP19)) for (const runes of [0, 1]) for (const offers of [3, 4, 5, 6, 7]) on(() => {
      const c = build(name, runes, offers, true), L = c.L, wg = L.wagon;
      const tag = `${name} runes ${runes} offers ${offers}`;
      expect(wg, `${tag}: a wagon`).toBeTruthy();
      if (!wg || wg.shift <= 0) return; // the margin's and the gap's places: the plain layout's (checked below)
      seen.row++;
      expect(L.portrait, `${tag}: a portrait row`).toBe(true);
      const want = ruleCard(L.info);
      expect(q(L.foe), `${tag}: the card is buildLayout's rule on the lowered band ${JSON.stringify(q(L.info))}`).toEqual(q(want));
      if (!L.foe) { if (L.info.h >= 14) seen.line++; else seen.nothing++; seen.none++; return; }
      seen.card++;
      expect(inside(L.foe, L.info), `${tag}: the card ${JSON.stringify(q(L.foe))} is inside the band ${JSON.stringify(q(L.info))}`).toBe(true);
      const hero = heroCardRect(L.info, L.foe), kind = heroKind(hero);
      seen.hero[kind]++;
      if (kind !== "not drawn") expect(inside(hero, L.info), `${tag}: the hero card (${kind}) ${JSON.stringify(q(hero))} is inside the band ${JSON.stringify(q(L.info))}`).toBe(true);
      expect(hero.y + hero.h, `${tag}: the hero card ends 2 px above the card`).toBe(L.foe.y - 2);
    });
    // the 122 row cases and what the strip draws in them, now (C0: the same 122; the card outside the band in 82, the hero card in 17; here none)
    expect(seen.row, "wagon-row cases").toBe(122);
    expect(seen.card + seen.line + seen.nothing, "card + compact NEXT line + nothing").toBe(122);
    expect([seen.card, seen.line, seen.nothing], "the card is drawn in 103 cases, the compact NEXT line in 10, nothing (band under 14 px) in 9").toEqual([103, 10, 9]);
  });

  it("every one of the 380 cases (SWEEP19 x rune and none x 3-7 offers x the wagon and the plain dawn): L.foe is the rule's card for L.info; so the plain dawns, the margin and gap places are buildLayout's own card, which the helper must not move", () => {
    let n = 0;
    for (const name of Object.keys(SWEEP19)) for (const runes of [0, 1]) for (const offers of [3, 4, 5, 6, 7]) for (const wagon of [false, true]) on(() => {
      const L = build(name, runes, offers, wagon).L;
      expect(q(L.foe), `${name} runes ${runes} offers ${offers} ${wagon ? "wagon" : "plain"}: the card`).toEqual(q(ruleCard(L.info)));
      n++;
    });
    expect(n).toBe(380);
  });

  it("a revealed foe's tap target follows the card: the foecard region is foeViewRects' cardHit (the card grown to a finger inside the band), it holds the card and lies inside L.info; the row cases only (SWEEP19, rune and none, 3-7 offers)", () => {
    let n = 0;
    for (const name of Object.keys(SWEEP19)) for (const runes of [0, 1]) for (const offers of [3, 4, 5, 6, 7]) on(() => {
      const c = build(name, runes, offers, true, true), L = c.L;
      if (!L.wagon || L.wagon.shift <= 0 || !L.foe) return;
      const tag = `${name} runes ${runes} offers ${offers}`;
      expect(scoutedFoe(c.s.run), `${tag}: the foe is revealed`).not.toBeNull();
      const R = foeViewRects(L, c.tp), hit = c.regions.filter((r) => r.id === "foecard");
      expect(hit.length, `${tag}: one foecard region`).toBe(1);
      expect(q(hit[0].r), `${tag}: the region is the card's tap target`).toEqual(q(R.cardHit));
      expect(q(R.card), `${tag}: foeViewRects reads the card from L.foe`).toEqual(q(L.foe));
      expect(inside(L.foe, hit[0].r), `${tag}: the tap target holds the card`).toBe(true);
      expect(inside(hit[0].r, { x: 0, y: L.info.y, w: L.W, h: L.info.h }), `${tag}: the tap target ${JSON.stringify(q(hit[0].r))} is inside the band ${JSON.stringify(q(L.info))}`).toBe(true);
      expect(hit[0].r.w, `${tag}: a finger wide`).toBeGreaterThanOrEqual(Math.min(c.tp, L.foe.w));
      n++;
    });
    expect(n, "revealed row cases with a card").toBe(103);
  });

  it("the helper: idleFoeRect(info) is buildLayout's rule: null under FOE_H; the card at the foot of a band of PORT_BAND or less; centred with the hero card (PORT_BAND together) in a taller one; and it is what buildLayout draws, on a grid of screens (phone and not, 3-7 offers)", () => {
    const at = (h: number): Rect => ({ x: 3, y: 100, w: 200, h });
    expect(idleFoeRect(at(23))).toBeNull();
    expect(idleFoeRect(at(0))).toBeNull();
    expect(q(idleFoeRect(at(24)))).toEqual([3, 100, 200, FOE_H]);
    expect(q(idleFoeRect(at(50)))).toEqual([3, 126, 200, FOE_H]); // IDLE_MIN: the foot
    expect(q(idleFoeRect(at(PORT_BAND)))).toEqual([3, 100 + PORT_BAND - FOE_H, 200, FOE_H]);
    expect(q(idleFoeRect(at(PORT_BAND + 1)))).toEqual([3, 100 + PORT_BAND - FOE_H, 200, FOE_H]); // idle 0 at 70
    expect(q(idleFoeRect(at(PORT_BAND + 2)))).toEqual([3, 100 + 1 + PORT_BAND - FOE_H, 200, FOE_H]); // idle 1
    expect(q(idleFoeRect(at(106)))).toEqual([3, 100 + 18 + PORT_BAND - FOE_H, 200, FOE_H]); // the tallest phone band: idle 18
    for (let h = 0; h <= 130; h++) expect(q(idleFoeRect(at(h))), `band ${h}`).toEqual(q(ruleCard(at(h))));
    let checked = 0;
    for (let W = 190; W <= 450; W += 11) for (let H = 480; H <= 960; H += 17) for (const offers of [3, 4, 5, 6, 7]) for (const phone of [false, true]) {
      const L = buildLayout(W, H, true, offers, phone, phone ? 27 : 0);
      expect(q(L.foe), `${W}x${H} ${offers} offers${phone ? " phone" : ""}`).toEqual(q(idleFoeRect(L.info)));
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
