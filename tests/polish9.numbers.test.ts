// POLISH-9 (REQ-BFG-087, REQ-BFG-089; P9-1, REVIEW-POLISH8 V3, RULING-SCOUT-POLISH9 1-5, 10): THE PLAYER'S OWN HULL, BELT n/m AND FEEDS STAY ON THE PORTRAIT BUILD SCREEN WHERE THE HERO CARD IS NOT DRAWN.
//   Before: the three numbers were drawn only in the hero card (inspector.ts drawHeroStrip), which needs HERO_MIN (24) rows above the NEXT BATTLE card, a 50 px band. Over 52 real views x no rune / one rune x 3-7 offers x a plain dawn / the ENCHANTER's wagon up
//   (1,040 states, nothing selected, a furnace dawn, seed 7, day 3: HULL 3780, BELT 6/14, FEEDS 1/2) 265 had no hero card and so no HULL and no FEEDS (164 no BELT n/m either): small phones 38 of 120, phones in a browser 57 of 180, tablets 110 of 140, windows 60 of 160
//   (large phones and landscape: 0). The scout (SCOUT-POLISH9) measured it; RULING-SCOUT-POLISH9 picked A1 + C+.
//   After: (1) with 8 rows or more above the NEXT BATTLE card a slim 9 px row (heroNumbers.ts rowRect; inspector.ts drawHeroNumbers); (2) otherwise a three-row stack panel (drawHeroStack, 37 x 23 at its widest) in the free place nearest the BELT and HULL buttons
//   (heroNumbers.ts stackPlace): 265 -> 8 lacking states, the 8 NAMED below (RULING 2 accepts them); at the widest numbers (day 12, hullBonus 12,000: a 5-digit HULL, the stack 45 px) 14, also named. 257 states draw something new: 81 rows and 176 stacks.
//   WHAT THIS FILE PINS, over a REAL BuildScreen drawn once per state with every drawText and every statsPanel call recorded (the font and ui modules are wrapped; the call goes through unchanged), so it reads what the game DRAWS, not what a helper says:
//   (1) every state draws HULL, BELT n/m and FEEDS where a player can read them (the hero card, the row, the stack, the top bar, the compact NEXT line) except the NAMED states, which stay lacking (pinned: if one is cured the test says so);
//   (2) no rect the new code drew lies under 1 px from the bar, the rune bar's row, the corner MENU's finger square, a shop card, REROLL, a pack, a merchant's or the ENCHANTER's tag, a wagon card or its tap target, the band, the NEXT BATTLE card, the hull, a bow mount,
//       FIGHT or the cargo tray (the tags' rects are the DRAWN ones: the recorded name's box), the stack is inside the screen and ends 2 px above deckFloor, the row is inside the band with its foot 2 px (1 px at 8 rows) above the card;
//   (3) the layout is unchanged: the band, the card, the hero card, the hull, the mounts, the bar, the shop's cards, REROLL, the packs, FIGHT, the cargo tray, the wagon's rects, hits, tag, shift and lift AND every registered region equal the base's (a fingerprint per state
//       recorded at x-p9-base, C0 = M2 56104e03c576: tests/polish9.numbers.base.ts; with the foecard target too in the REVEAL pass); the row and the stack register no region;
//   (4) the only words the row and the stack draw are HULL, BELT, FEEDS and their numbers, in the colours and the order drawHeroStrip draws them (the strip is drawn on the same run and compared);
//   (5) a state that draws the hero card draws no row and no stack; a state with the row draws no stack; never two new panels; landscape draws none;
//   (6) with a card selected or hovered, or a card carried, nothing is drawn (the details panel and the carried card have the screen);
//   (7) the build items: the stack's place is computed once per key of its inputs and not once per frame (the same screen drawn twice returns the very same rect though build.ts rebuilds `s.L` every frame), it is drawn BEFORE the shop's and the wagon's cards (a card rolling
//       in passes over it), the numbers are read from `run` the same frame (a changed hull shows at once), a shop of several merchants keeps the stack off every tag, and no stack covers a bow turret's barrel.
//   RUN TIME: see the REPORT; split by pass (plain, widest numbers, REVEAL) and family (18 tests, each its own 240 s timeout) so that no test holds the others in a loaded suite. tests/h2.playthrough, card4 and keywords.tap are the files that time out there; this one is not them.
//   P9_RECORD=1 prints the fingerprints (P9FP lines) instead of asserting: that is how tests/polish9.numbers.base.ts was recorded, at x-p9-base, with the new drawing absent.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/render/font", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/render/font")>();
  return {
    ...orig,
    drawText: (g: unknown, s: string, x: number, y: number, color: string, opts?: { font?: string; scale?: number; align?: string }) => {
      const w = (orig.drawText as (...a: unknown[]) => number)(g, s, x, y, color, opts);
      const hk = (globalThis as unknown as { __P9HOOK?: { seq: unknown[] } }).__P9HOOK;
      if (hk) {
        const font = opts?.font ?? "5", scale = Math.max(1, Math.floor(opts?.scale ?? 1));
        let ox = Math.round(x);
        if (opts?.align === "center") ox = Math.round(x - w / 2);
        else if (opts?.align === "right") ox = Math.round(x - w);
        hk.seq.push({ k: "t", r: { s, x: ox, y: Math.round(y), w, h: (font === "3" ? 5 : 7) * scale, font, c: color } });
      }
      return w;
    },
  };
});
vi.mock("../src/ui/ui", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/ui/ui")>();
  return {
    ...orig,
    statsPanel: (g: unknown, r: { x: number; y: number; w: number; h: number }, id?: string) => {
      const hk = (globalThis as unknown as { __P9HOOK?: { seq: unknown[] } }).__P9HOOK;
      if (hk) hk.seq.push({ k: "p", r: { x: r.x, y: r.y, w: r.w, h: r.h } });
      return (orig.statsPanel as (...a: unknown[]) => void)(g, r, id);
    },
  };
});

import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { VIEWS13 } from "./polish4.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { viewWithSub } from "../src/game/viewGrid";
import { BuildScreen } from "../src/screens/build/build";
import { newRun, rollShop, type Run } from "../src/game/run";
import { makeEvent, pickChoice } from "../src/game/events";
import { ENCHANT, setEnchant, withEnchant, type EnchantId } from "../src/sim/enchant";
import { MERCHANTS } from "../src/sim/content";
import { turretSlots } from "../src/sim/deck";
import { tapPx } from "../src/ui/tap";
import { UI, type Rect } from "../src/ui/ui";
import { HERO_MIN, carrierBox, heroCardRect } from "../src/screens/build/layout";
import { deckFloor } from "../src/screens/build/enchantStrip";
import { drawHeroCard, heroHullText } from "../src/screens/build/inspector";
import type { Game } from "../src/game/game";
import { BASE_FP_PLAIN, BASE_FP_REVEAL } from "./polish9.numbers.base";

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

// ---- the run: a furnace dawn (seed 7, day 3: HULL 3780, BELT 6/14, FEEDS 1/2), the first wagon's offers repeated n times, FIERY and WIDE at 4 gold as the ENCHANTER's wagon; `wide`: day 12 and a hull bonus of 12,000 (a 5-digit HULL)
function dayRun(offers: number, runes: number, wagon: boolean, reveal: boolean, wide: boolean, keepWagons: boolean): Run {
  return on(() => {
    const DAY = wide ? 12 : 3;
    const run = newRun("furnace", 7);
    run.day = DAY;
    if (wide) run.build.hullBonus = 12000;
    run.gold = 20;
    run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
    rollShop(run);
    run.runeDay = undefined;
    if (!keepWagons) {
      const w0 = run.shop.wagons[0];
      run.shop.wagons = [{ ...w0, offers: Array.from({ length: offers }, (_, i) => ({ ...w0.offers[i % w0.offers.length] })) }];
    }
    if (wagon) run.shop.enchanter = { day: DAY, offers: (["fiery", "wide"] as EnchantId[]).map((ench) => ({ ench, price: 4, sold: false })) };
    else delete run.shop.enchanter;
    run.build.runes = Array.from({ length: runes }, () => ({ id: "many_hands" })) as never;
    if (reveal) {
      run.event = makeEvent(run.seed, run.day, "scout");
      run.stage = "event";
      pickChoice(run, 2); // SPY: tonight's deck shown (the NEXT BATTLE card's finger target is registered)
      run.stage = "caravan";
    }
    return run;
  });
}

// ---- the 52 views (CSS px @ DPR): 43 portrait in five families and VIEWS13's nine landscape
const FAMILY_VIEWS: Record<string, string[]> = {
  "small phones": ["280x653x3", "300x640x3", "320x568x2", "360x640x3", "360x640x2", "375x667x2"],
  "phones in a browser": ["360x560x3", "360x660x3", "375x553x2", "375x635x3", "390x664x3", "393x659x3", "412x785x2.625", "430x739x3", "402x690x3"],
  "large phones": ["390x844x3", "393x852x3", "412x915x2.625", "414x896x3", "430x932x3", "360x740x3", "360x800x3", "375x812x3", "412x892x2.625", "428x926x3", "384x854x2.8", "402x874x3", "360x780x3"],
  tablets: ["768x1024x2", "810x1080x2", "820x1180x2", "834x1194x2", "1024x1366x2", "800x1280x1.5", "600x960x1.5"],
  windows: ["600x900x1", "768x1024x1", "800x1000x1", "480x800x1", "540x960x1", "1080x1920x1", "390x844x1", "414x736x1"],
  landscape: ["desk-1920x1080", "laptop-1366x768", "desk-1280x800", "land-844x390", "col96-3040x1710", "land-812x375@3", "pixel5-851x393@2.75", "land-915x412@2.625", "promax-926x428@3"],
};
const VIEWS: Record<string, [number, number, number]> = {};
const viewName = (spec: string): string => { const [w, h, d] = spec.split("x").map(Number); return `v${w}x${h}@${d}`; };
for (const [fam, list] of Object.entries(FAMILY_VIEWS)) {
  for (const spec of list) {
    if (fam === "landscape") VIEWS[spec] = [...VIEWS13[spec as keyof typeof VIEWS13]] as [number, number, number];
    else { const [w, h, d] = spec.split("x").map(Number); VIEWS[viewName(spec)] = [w, h, d]; }
  }
}
const familyNames = (fam: string): string[] => FAMILY_VIEWS[fam].map((s) => (fam === "landscape" ? s : viewName(s)));
const RUNES = [0, 1], OFFERS = [3, 4, 5, 6, 7], WAGONS = [false, true];

/** THE STATES THAT STAY OPEN (RULING-SCOUT-POLISH9 2): no free 37 x 23 px place exists there. The census's numbers (HULL 3780): 8 = seven tablets at DPR 2 with no rune and 5 offers (plain and with the wagon; 810x1080@2: 6 offers, plain) and the 280x653@3 phone with 6 offers and the wagon. */
const OPEN = [
  "v280x653@3 0/6 WAGON", "v768x1024@2 0/5 WAGON", "v768x1024@2 0/5 plain", "v810x1080@2 0/6 plain", "v820x1180@2 0/5 WAGON", "v820x1180@2 0/5 plain", "v834x1194@2 0/5 WAGON", "v834x1194@2 0/5 plain",
];
/** At the widest numbers (a 5-digit HULL: the stack 45 px) 14: those 8 and 300x640@3 with the wagon at 0/6, 0/7 and 1/4, 1024x1366@2 at 0/5 plain and with the wagon, 810x1080@2 at 0/5 plain. No narrower form (two rows 87 x 16 or 45 x 16, one row 129 x 9) fits them. */
const OPEN_WIDE = [
  ...OPEN, "v300x640@3 0/6 WAGON", "v300x640@3 0/7 WAGON", "v300x640@3 1/4 WAGON", "v1024x1366@2 0/5 plain", "v1024x1366@2 0/5 WAGON", "v810x1080@2 0/5 plain",
];
/** POLISH-9 P9-2 (D1c, enchantStrip.ts lowerInfo; RULING-SCOUT-POLISH9 3): where the ENCHANTER's wagon in a row leaves a portrait band under IDLE_MIN (50) and the clear rows under its foot (the carrier box's top less the foot, one row kept clear) bring it to
 *  IDLE_MIN, the band takes the rows it needs: exactly 20 states move their band, their NEXT BATTLE card and their hero card (windows 18: the review's 13 and five more; tablets 2); the compact hero card is back there, so no row and no stack. Each is pinned
 *  here as [the base's layout fingerprint, the new one] for the plain pass (and the widest numbers) and for the REVEAL pass (the foecard target moves with the card), and its band, card and hero card before -> after (D1C). No other state moves. */
// <<MOVED (generated by O/kit/p9-mkmoved.py --ts from the P9_RECORD runs at C0 and at P9-2)
const MOVED_PLAIN: Record<string, [string, string]> = {
  "v540x960@1 0/3 WAGON": ["8f8fd4fa", "c7f0fffd"],
  "v540x960@1 0/4 WAGON": ["180d9823", "1a25d598"],
  "v540x960@1 0/5 WAGON": ["bb564a2a", "06f79fef"],
  "v540x960@1 0/6 WAGON": ["06a9aa49", "50c762a4"],
  "v540x960@1 0/7 WAGON": ["936dc998", "48b4fc19"],
  "v540x960@1 1/3 WAGON": ["5f00ec58", "238a0c03"],
  "v540x960@1 1/4 WAGON": ["2a60abf2", "ba596fed"],
  "v540x960@1 1/5 WAGON": ["bd46d11a", "f7a3d08a"],
  "v540x960@1 1/6 WAGON": ["d3c7f61e", "ef82f6ce"],
  "v540x960@1 1/7 WAGON": ["fa469cc0", "67f75630"],
  "v600x900@1 0/3 WAGON": ["1ebc23d4", "0b7d3599"],
  "v600x900@1 1/4 WAGON": ["432dff0c", "aab9dd9f"],
  "v600x900@1 1/5 WAGON": ["5516bfe5", "e24b946a"],
  "v600x900@1 1/6 WAGON": ["f760ace4", "f31b4bbe"],
  "v600x900@1 1/7 WAGON": ["c70ed634", "413fdd56"],
  "v600x960@1.5 1/6 WAGON": ["a8024d88", "f7f127f6"],
  "v600x960@1.5 1/7 WAGON": ["216a394a", "b393b410"],
  "v768x1024@1 1/6 WAGON": ["56112bfc", "66432cf5"],
  "v768x1024@1 1/7 WAGON": ["84dfb119", "5c5d6391"],
  "v800x1000@1 1/5 WAGON": ["cca695b0", "f935c893"],
};
const MOVED_REVEAL: Record<string, [string, string]> = {
  "v540x960@1 0/3 WAGON": ["3e61ce17", "2d59b6f8"],
  "v540x960@1 0/4 WAGON": ["798107c4", "6fa82207"],
  "v540x960@1 0/5 WAGON": ["87c6225e", "16cea528"],
  "v540x960@1 0/6 WAGON": ["6144c0b3", "c14cfd25"],
  "v540x960@1 0/7 WAGON": ["b2c58fd4", "df319762"],
  "v540x960@1 1/3 WAGON": ["4ced66ae", "ab3a7671"],
  "v540x960@1 1/4 WAGON": ["bc5747c6", "b3f14e41"],
  "v540x960@1 1/5 WAGON": ["770f9bc0", "6b5b0446"],
  "v540x960@1 1/6 WAGON": ["2f40ff0c", "697444b2"],
  "v540x960@1 1/7 WAGON": ["c03189ba", "e98000b4"],
  "v600x900@1 0/3 WAGON": ["56ae6d9c", "d8ce7a61"],
  "v600x900@1 1/4 WAGON": ["86e1169f", "c76e3374"],
  "v600x900@1 1/5 WAGON": ["943ba9c8", "73c5bfbf"],
  "v600x900@1 1/6 WAGON": ["a4d6eddd", "bccdd021"],
  "v600x900@1 1/7 WAGON": ["f838270d", "d923d8c9"],
  "v600x960@1.5 1/6 WAGON": ["38fa22e1", "19dd59e9"],
  "v600x960@1.5 1/7 WAGON": ["fe011aeb", "5456797f"],
  "v768x1024@1 1/6 WAGON": ["b2b89ebe", "55d556b3"],
  "v768x1024@1 1/7 WAGON": ["7f050ad3", "646524b9"],
  "v800x1000@1 1/5 WAGON": ["ace3cf4a", "71fe4339"],
};
const D1C: Record<string, { band: [number[], number[]]; foe: [number[] | null, number[] | null]; hero: [number[] | null, number[] | null] }> = {
  "v540x960@1 0/3 WAGON": { band: [[3, 110, 264, 26], [3, 110, 264, 50]], foe: [[3, 112, 264, 24], [3, 136, 264, 24]], hero: [[3, 110, 264, 0], [3, 110, 264, 24]] },
  "v540x960@1 0/4 WAGON": { band: [[3, 143, 264, 26], [3, 143, 264, 50]], foe: [[3, 145, 264, 24], [3, 169, 264, 24]], hero: [[3, 143, 264, 0], [3, 143, 264, 24]] },
  "v540x960@1 0/5 WAGON": { band: [[3, 141, 264, 34], [3, 141, 264, 50]], foe: [[3, 151, 264, 24], [3, 167, 264, 24]], hero: [[3, 141, 264, 8], [3, 141, 264, 24]] },
  "v540x960@1 0/6 WAGON": { band: [[3, 141, 264, 34], [3, 141, 264, 50]], foe: [[3, 151, 264, 24], [3, 167, 264, 24]], hero: [[3, 141, 264, 8], [3, 141, 264, 24]] },
  "v540x960@1 0/7 WAGON": { band: [[3, 141, 264, 34], [3, 141, 264, 50]], foe: [[3, 151, 264, 24], [3, 167, 264, 24]], hero: [[3, 141, 264, 8], [3, 141, 264, 24]] },
  "v540x960@1 1/3 WAGON": { band: [[3, 138, 264, 26], [3, 138, 264, 50]], foe: [[3, 140, 264, 24], [3, 164, 264, 24]], hero: [[3, 138, 264, 0], [3, 138, 264, 24]] },
  "v540x960@1 1/4 WAGON": { band: [[3, 171, 264, 26], [3, 171, 264, 50]], foe: [[3, 173, 264, 24], [3, 197, 264, 24]], hero: [[3, 171, 264, 0], [3, 171, 264, 24]] },
  "v540x960@1 1/5 WAGON": { band: [[3, 169, 264, 34], [3, 169, 264, 50]], foe: [[3, 179, 264, 24], [3, 195, 264, 24]], hero: [[3, 169, 264, 8], [3, 169, 264, 24]] },
  "v540x960@1 1/6 WAGON": { band: [[3, 169, 264, 34], [3, 169, 264, 50]], foe: [[3, 179, 264, 24], [3, 195, 264, 24]], hero: [[3, 169, 264, 8], [3, 169, 264, 24]] },
  "v540x960@1 1/7 WAGON": { band: [[3, 169, 264, 34], [3, 169, 264, 50]], foe: [[3, 179, 264, 24], [3, 195, 264, 24]], hero: [[3, 169, 264, 8], [3, 169, 264, 24]] },
  "v600x900@1 0/3 WAGON": { band: [[3, 110, 294, 26], [3, 110, 294, 50]], foe: [[3, 112, 294, 24], [3, 136, 294, 24]], hero: [[3, 110, 294, 0], [3, 110, 294, 24]] },
  "v600x900@1 1/4 WAGON": { band: [[3, 171, 294, 26], [3, 171, 294, 50]], foe: [[3, 173, 294, 24], [3, 197, 294, 24]], hero: [[3, 171, 294, 0], [3, 171, 294, 24]] },
  "v600x900@1 1/5 WAGON": { band: [[3, 171, 294, 26], [3, 171, 294, 50]], foe: [[3, 173, 294, 24], [3, 197, 294, 24]], hero: [[3, 171, 294, 0], [3, 171, 294, 24]] },
  "v600x900@1 1/6 WAGON": { band: [[3, 169, 294, 34], [3, 169, 294, 50]], foe: [[3, 179, 294, 24], [3, 195, 294, 24]], hero: [[3, 169, 294, 8], [3, 169, 294, 24]] },
  "v600x900@1 1/7 WAGON": { band: [[3, 169, 294, 34], [3, 169, 294, 50]], foe: [[3, 179, 294, 24], [3, 195, 294, 24]], hero: [[3, 169, 294, 8], [3, 169, 294, 24]] },
  "v600x960@1.5 1/6 WAGON": { band: [[3, 169, 294, 34], [3, 169, 294, 50]], foe: [[3, 179, 294, 24], [3, 195, 294, 24]], hero: [[3, 169, 294, 8], [3, 169, 294, 24]] },
  "v600x960@1.5 1/7 WAGON": { band: [[3, 169, 294, 34], [3, 169, 294, 50]], foe: [[3, 179, 294, 24], [3, 195, 294, 24]], hero: [[3, 169, 294, 8], [3, 169, 294, 24]] },
  "v768x1024@1 1/6 WAGON": { band: [[3, 171, 378, 26], [3, 171, 378, 50]], foe: [[3, 173, 378, 24], [3, 197, 378, 24]], hero: [[3, 171, 378, 0], [3, 171, 378, 24]] },
  "v768x1024@1 1/7 WAGON": { band: [[3, 169, 378, 34], [3, 169, 378, 50]], foe: [[3, 179, 378, 24], [3, 195, 378, 24]], hero: [[3, 169, 378, 8], [3, 169, 378, 24]] },
  "v800x1000@1 1/5 WAGON": { band: [[3, 138, 394, 26], [3, 138, 394, 50]], foe: [[3, 140, 394, 24], [3, 164, 394, 24]], hero: [[3, 138, 394, 0], [3, 138, 394, 24]] },
};
// MOVED>>

// ---- what a state looks like
type Rec = { s: string; x: number; y: number; w: number; h: number; font: string; c: string };
type Ev = { k: "t"; r: Rec } | { k: "p"; r: Rect };
type Hook = { __P9HOOK?: { seq: Ev[] } };
const hook = (seq: Ev[] | null): void => { (globalThis as unknown as Hook).__P9HOOK = seq ? { seq } : undefined; };
const q = (r: Rect | null | undefined): number[] | null => (r ? [r.x, r.y, r.w, r.h] : null);
const ovA = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inside = (r: Rect, b: Rect): boolean => r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h;
const same = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const box = (t: Rec): Rect => ({ x: t.x, y: t.y, w: t.w, h: t.h });
/** The clear px between two rects: -1 if they overlap, 0 if they touch, else the larger of the two axes' gaps (1 = one clear px). */
const gap = (a: Rect, b: Rect): number => {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)), dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return ovA(a, b) > 0 ? -1 : Math.max(dx, dy);
};
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
};
/** the position of a state's tag in its view's 20: rune 0/1 x offers 3-7 x plain/WAGON, in that order (tests/polish9.numbers.base.ts: 8 hex digits each) */
function baseFp(tbl: Record<string, string>, tag: string): string | undefined {
  const m = /^(\S+) (\d)\/(\d) (plain|WAGON)$/.exec(tag);
  if (!m) return undefined;
  const pos = (+m[2] * 5 + (+m[3] - 3)) * 2 + (m[4] === "WAGON" ? 1 : 0);
  return tbl[m[1]]?.slice(pos * 8, pos * 8 + 8) || undefined;
}

interface Meas {
  tag: string;
  s: BuildScreen;
  f: FakeGame;
  seq: Ev[];
  fp: string;
  band: Rect;
  foe: Rect | null;
  heroDrawn: boolean;
  /** the panels the new code drew (not the idle strip's own): `row` a 9 px panel inside the band, `stack` a panel with no overlap with the band */
  news: { kind: "row" | "stack"; r: Rect }[];
  /** the texts drawn inside the new panels, in order */
  newTexts: { s: string; c: string }[];
  /** the numbers a player can read */
  readable: Record<"HULL" | "BELT" | "FEEDS", boolean>;
  /** the clear px from the new panel to each part, card and target, the nearest first */
  gaps: { to: string; gap: number }[];
}

/** One real BuildScreen: the run, the layout (enter, update(3): the caravan parked), ONE draw on a raster with every drawText and statsPanel call recorded. `pre` runs on the screen before the draw (a selection, a hover, a carried card). */
function measure(name: string, runes: number, offers: number, wagon: boolean, o: { reveal?: boolean; wide?: boolean; pre?: (s: BuildScreen, run: Run) => void; keepWagons?: boolean } = {}): Meas {
  const tag = `${name} ${runes}/${offers} ${wagon ? "WAGON" : "plain"}`;
  return on(() => {
    const [w, h, dpr] = VIEWS[name];
    const run = dayRun(offers, runes, wagon, !!o.reveal, !!o.wide, !!o.keepWagons);
    const f = new FakeGame(run, w, h, dpr);
    const s = new BuildScreen(f as unknown as Game);
    f.view = viewWithSub(w, h, dpr, s.pickScale.bind(s), s.pickSub.bind(s));
    s.enter();
    s.update(3);
    if (o.pre) o.pre(s, run);
    const seq: Ev[] = [];
    const img = fresh(s.L.W, s.L.H);
    hook(seq);
    f.ui.begin(); s.draw(lenient(img)); f.ui.end();
    hook(null);
    const L = s.L, band = L.info, foe = L.foe, bandFoot = band.y + band.h;
    const rec = seq.filter((e): e is { k: "t"; r: Rec } => e.k === "t").map((e) => e.r);
    const panels = seq.filter((e): e is { k: "p"; r: Rect } => e.k === "p").map((e) => e.r);
    const news = panels.filter((p) => (inside(p, band) ? p.h === 9 && !same(p, band) : ovA(p, band) === 0)).map((r) => ({ kind: (inside(r, band) ? "row" : "stack") as "row" | "stack", r }));
    const inNew = (t: Rec): boolean => news.some((n) => inside(box(t), n.r));
    const inBand = (t: Rec): boolean => t.y >= band.y - 1 && t.y < bandFoot && t.x + t.w > band.x && t.x < band.x + band.w;
    // what a player can read: the exact words in the strip or a new panel, the bar's n/m beside the belt icon, the compact NEXT line's BELT n/m (not if it spills under the band's foot)
    const hasKey = (word: "HULL" | "BELT" | "FEEDS"): boolean => rec.some((t) => {
      const spill = t.y + t.h - bandFoot;
      if (t.s === word) return inNew(t) || (inBand(t) && spill <= 0);
      if (word === "BELT" && /^\d+\/\d+$/.test(t.s)) return t.y < L.bar.h;
      if (word === "BELT" && /BELT \d+\/\d+/.test(t.s)) return inBand(t) && spill <= 0;
      return false;
    });
    const heroDrawn = !!foe && heroCardRect(band, foe).h >= HERO_MIN && rec.some((t) => t.s === "HULL" && inBand(t));
    // the clear px from what the new code drew to every part, card and target (the census's named list, the NEXT BATTLE card, the drawn tags)
    const mounts = turretSlots(run.build).map((_, i) => s.turretRect(i));
    const wg = L.wagon;
    const tp = tapPx(f.view);
    const names = new Set<string>([...Object.values(MERCHANTS).map((m) => m.name), "ENCHANTER"]);
    const firstRowY = Math.max(...L.cards.map((c) => c.y));
    const things: { n: string; r: Rect }[] = [
      { n: "bar", r: L.bar }, { n: "hull", r: L.hull }, ...mounts.map((m, i) => ({ n: `mount${i}`, r: m })), { n: "fight", r: L.fight }, { n: "cargo", r: L.cargo },
      ...L.cards.map((r, i) => ({ n: `card${i}`, r })), { n: "reroll", r: L.reroll }, ...L.packs.map((r, i) => ({ n: `pack${i}`, r })), ...(foe ? [{ n: "nextcard", r: foe }] : []),
      ...(wg ? [...wg.rects.map((r, i) => ({ n: `wagon${i}`, r })), ...wg.hits.map((r, i) => ({ n: `wagonhit${i}`, r }))] : []),
      ...(runes > 0 ? [{ n: "runebar", r: { x: 0, y: L.bar.h, w: L.W, h: Math.min(...L.cards.map((c) => c.y), L.reroll.y) - L.bar.h } }] : []),
      ...(L.phone && tp > L.bar.h ? [{ n: "menucorner", r: { x: 0, y: 0, w: Math.max(tp, 31), h: tp } }] : []),
      // the tags as DRAWN: the recorded name's box, and the glyph 5 px left of it (shop.ts drawTag; enchantStrip.ts drawEnchanterTag)
      ...rec.filter((t) => names.has(t.s) && t.font === "3" && t.y < firstRowY && !inBand(t)).map((t) => ({ n: `tag ${t.s}`, r: { x: t.x - 5, y: t.y, w: t.w + 5, h: t.h } })),
      ...f.ui.regions.filter((r) => r.id === "foecard").map((r) => ({ n: "foecardtarget", r: r.r })),
    ];
    const gaps: { to: string; gap: number }[] = [];
    for (const n of news) {
      for (const t of [...things, ...(n.kind === "stack" ? [{ n: "band", r: band }] : [])]) if (t.r.w > 0 && t.r.h > 0) gaps.push({ to: t.n, gap: gap(n.r, t.r) });
    }
    gaps.sort((a, b) => a.gap - b.gap);
    // the layout's fingerprint (3): every number of the layout and every registered region
    const wgj = wg ? { rects: wg.rects.map(q), hits: wg.hits.map(q), tag: wg.tag, shift: wg.shift, lift: wg.lift ?? null } : null;
    const fp = fnv(JSON.stringify({
      band: q(band), foe: q(foe), hero: L.portrait && foe ? q(heroCardRect(band, foe)) : null, hull: q(L.hull), mounts: mounts.map(q), bar: q(L.bar), cards: L.cards.map(q), reroll: q(L.reroll), packs: L.packs.map(q),
      fight: q(L.fight), cargo: q(L.cargo), wagon: wgj, regs: f.ui.regions.map((r) => [r.id, r.r.x, r.r.y, r.r.w, r.r.h]),
    }));
    const newTexts = rec.filter((t) => inNew(t)).map((t) => ({ s: t.s, c: t.c }));
    return { tag, s, f, seq, fp, band, foe, heroDrawn, news, newTexts, readable: { HULL: hasKey("HULL"), BELT: hasKey("BELT"), FEEDS: hasKey("FEEDS") }, gaps };
  });
}

/** What drawHeroStrip draws for the same run: HULL, its number, BELT, its number, FEEDS, its number as [text, colour], from the strip drawn on its own (the hero card at 30 px, game px). */
function stripTexts(m: Meas): { s: string; c: string }[] {
  return on(() => {
    const seq: Ev[] = [];
    hook(seq);
    drawHeroCard(lenient(fresh(300, 60)), m.s, { x: 0, y: 0, w: 300, h: 30 });
    hook(null);
    const t = seq.filter((e): e is { k: "t"; r: Rec } => e.k === "t").map((e) => e.r);
    const i = t.findIndex((r) => r.s === "HULL");
    return t.slice(i, i + 6).map((r) => ({ s: r.s, c: r.c }));
  });
}

type Pass = "plain" | "wide" | "reveal";
const record = process.env.P9_RECORD === "1";

/** One family, one pass: every state's checks; the failures as strings. `inTarget`: the revealed states whose row lies partly inside the NEXT BATTLE card's grown finger target (RULING 5), with the rows of the overlap. */
function runFamily(fam: string, pass: Pass): { fails: string[]; n: number; rows: number; stacks: number; lacking: string[]; ms: number; inTarget: number[] } {
  const t0 = Date.now();
  const fails: string[] = [], lacking: string[] = [], lines: string[] = [], inTarget: number[] = [];
  let n = 0, rows = 0, stacks = 0;
  const wide = pass === "wide", reveal = pass === "reveal";
  const open = wide ? OPEN_WIDE : OPEN;
  for (const name of familyNames(fam)) for (const runes of RUNES) for (const offers of OFFERS) for (const wagon of WAGONS) {
    const m = measure(name, runes, offers, wagon, { reveal, wide });
    n++;
    if (record) { lines.push(`P9FP ${pass} ${m.tag} ${m.fp}`); continue; }
    // (1) the numbers a player can read
    const miss = (["HULL", "BELT", "FEEDS"] as const).filter((k) => !m.readable[k]);
    if (miss.length) lacking.push(m.tag);
    if (miss.length && !open.includes(m.tag)) fails.push(`(1) ${m.tag}: ${miss.join(", ")} not drawn anywhere readable (band ${JSON.stringify(q(m.band))}, hero card ${m.heroDrawn})`);
    if (!miss.length && open.includes(m.tag)) fails.push(`(1) ${m.tag}: a NAMED open state is now cured: take it off the list (${wide ? "OPEN_WIDE" : "OPEN"}) and say so`);
    // (3) the layout and the regions as at the base (the widest numbers change no layout: the plain base's)
    const want = baseFp(reveal ? BASE_FP_REVEAL : BASE_FP_PLAIN, m.tag);
    const moved = (reveal ? MOVED_REVEAL : MOVED_PLAIN)[m.tag];
    if (moved && want !== moved[0]) fails.push(`(3) ${m.tag}: the pinned 'before' ${moved[0]} is not the base's ${want}`);
    if (want === undefined) fails.push(`(3) ${m.tag}: no base fingerprint`);
    else if (m.fp !== (moved ? moved[1] : want)) fails.push(`(3) ${m.tag}: layout or regions differ from the base (${m.fp}, base ${moved ? `${moved[0]} -> ${moved[1]}` : want})`);
    // (5) never two new panels; none where the hero card is drawn; none in landscape
    if (m.news.length > 1) fails.push(`(5) ${m.tag}: ${m.news.length} new panels`);
    if (m.heroDrawn && m.news.length) fails.push(`(5) ${m.tag}: the hero card is drawn AND a ${m.news[0].kind} is`);
    if (fam === "landscape" && m.news.length) fails.push(`(5) ${m.tag}: landscape draws a ${m.news[0].kind}`);
    if (!m.news.length) continue;
    const nw = m.news[0];
    if (nw.kind === "row") rows++; else stacks++;
    // (4) the words, the numbers, the colours: the strip's own
    const want4 = stripTexts(m);
    if (JSON.stringify(m.newTexts) !== JSON.stringify(want4)) fails.push(`(4) ${m.tag}: the ${nw.kind} draws ${JSON.stringify(m.newTexts)}, the strip ${JSON.stringify(want4)}`);
    // (2) clear of everything. The ROW may lie partly inside the NEXT BATTLE card's grown finger target: the target stays as it is (RULING-SCOUT-POLISH9 5; a touch there opens the foe's view, as a touch on the hero card's foot did before POLISH-8),
    // counted below; the STACK keeps clear of it
    for (const g of m.gaps.filter((x) => x.gap < 1 && !(nw.kind === "row" && x.to === "foecardtarget"))) fails.push(`(2) ${m.tag}: the ${nw.kind} ${JSON.stringify(q(nw.r))} is ${g.gap} clear px from ${g.to}`);
    const tgt = nw.kind === "row" ? m.f.ui.regions.find((r) => r.id === "foecard") : undefined;
    if (tgt && ovA(nw.r, tgt.r) > 0) inTarget.push(Math.min(nw.r.y + nw.r.h, tgt.r.y + tgt.r.h) - Math.max(nw.r.y, tgt.r.y));
    const L = m.s.L;
    if (nw.kind === "stack") {
      const floor = deckFloor(L, m.s.run);
      if (nw.r.x < 1 || nw.r.x + nw.r.w > L.W - 1) fails.push(`(2) ${m.tag}: the stack ${JSON.stringify(q(nw.r))} is off the screen (W ${L.W})`);
      if (nw.r.y < L.bar.y + L.bar.h + 1) fails.push(`(2) ${m.tag}: the stack touches the bar`);
      if (nw.r.y + nw.r.h > floor - 2) fails.push(`(2) ${m.tag}: the stack ends at ${nw.r.y + nw.r.h}, past deckFloor ${floor} less 2`);
    } else {
      if (!inside(nw.r, m.band)) fails.push(`(2) ${m.tag}: the row ${JSON.stringify(q(nw.r))} is not inside the band ${JSON.stringify(q(m.band))}`);
      const clear = m.foe ? m.foe.y - (nw.r.y + nw.r.h) : -9;
      const above = m.foe ? heroCardRect(m.band, m.foe).h : 0;
      if (clear !== (above >= 9 ? 2 : 1)) fails.push(`(2) ${m.tag}: the row's foot is ${clear} px above the card (2; 1 at 8 rows)`);
      const rt = m.seq.filter((e): e is { k: "t"; r: Rec } => e.k === "t" && inside(box(e.r), nw.r)).map((e) => e.r);
      if (rt.some((t) => t.x + t.w > nw.r.x + nw.r.w - 3)) fails.push(`(2) ${m.tag}: a word of the row ends within 3 px of the panel's edge`);
    }
  }
  if (record) console.log(lines.join("\n"));
  return { fails, n, rows, stacks, lacking, ms: Date.now() - t0, inTarget };
}

/** RULING-SCOUT-POLISH9 5, counted here (the scout: 36 of the 81 revealed row states, the row's lowest 1-7 rows inside the card's grown target: 1 row in 22 states, 4 in 11, 2 in 2, 7 in 1): per family, the revealed row states whose row overlaps
 *  the NEXT BATTLE card's finger target, which stays as it is. Measured here: small phones 4 (1, 1, 4, 4 rows), phones in a browser 32 (all of its rows: 20 x 1 row, 2 x 2, 9 x 4, 1 x 7 rows); the 36 are the scout's. */
const ROW_IN_TARGET: Record<string, number> = { "small phones": 4, "phones in a browser": 32, "large phones": 0, tablets: 0, windows: 0, landscape: 0 };

describe("polish9 numbers: HULL, BELT n/m and FEEDS where the hero card is not (P9-1)", () => {
  vi.stubGlobal("localStorage", new MapStore());
  setTipsForTests("done");
  for (const pass of ["plain", "wide", "reveal"] as const) {
    for (const fam of Object.keys(FAMILY_VIEWS)) {
      it(`${pass} pass, ${fam}`, () => {
        const r = runFamily(fam, pass);
        console.log(`P9N ${pass} ${fam}: ${r.n} states, ${r.rows} rows, ${r.stacks} stacks, ${r.lacking.length} lacking${r.lacking.length ? ` (${r.lacking.join("; ")})` : ""}${pass === "reveal" ? `, row inside the card's target in ${r.inTarget.length} (rows ${r.inTarget.join(",")})` : ""}, ${r.ms} ms`);
        if (record) return;
        expect(r.fails, r.fails.slice(0, 12).join("\n")).toEqual([]);
        if (pass === "reveal") {
          expect(r.inTarget.length, `${fam}: revealed row states whose row lies inside the NEXT BATTLE card's grown target (RULING 5)`).toBe(ROW_IN_TARGET[fam]);
          expect(Math.max(0, ...r.inTarget), "the overlap is at most 7 rows").toBeLessThanOrEqual(7);
          expect(Math.min(99, ...r.inTarget), "and at least 1").toBeGreaterThanOrEqual(r.inTarget.length ? 1 : 99);
        }
      }, 240_000);
    }
  }

  it("the rule on bare geometry: rowRect and stackPlace (pure)", async () => {
    const { rowRect, stackPlace } = await import("../src/screens/build/heroNumbers");
    // A1: the rows above the NEXT BATTLE card (the card stands 2 px under them): under 8 none; 8 -> the row on the top row, its foot 1 px above the card; 9 or more -> its foot 2 px above the card
    expect(rowRect({ x: 3, y: 100, w: 200, h: 7 })).toBeNull();
    expect(rowRect({ x: 3, y: 100, w: 200, h: 8 })).toEqual({ x: 3, y: 100, w: 200, h: 9 }); // foot 109, card at 110
    expect(rowRect({ x: 3, y: 100, w: 200, h: 9 })).toEqual({ x: 3, y: 100, w: 200, h: 9 }); // foot 109, card at 111
    expect(rowRect({ x: 3, y: 100, w: 200, h: 20 })).toEqual({ x: 3, y: 111, w: 200, h: 9 }); // foot 120, card at 122
    // C+: nothing in the way, the stack's middle is on the packs' middle
    const base = { W: 100, y0: 10, y1: 80, size: { w: 20, h: 10 }, near: { x: 50, y: 40 }, obstacles: [] as Rect[] };
    expect(stackPlace(base)).toEqual({ x: 40, y: 35, w: 20, h: 10 });
    // an obstacle on that spot: the nearest free rects are 1 clear px above and below it (16 off); the first in rows then columns wins the tie: above
    const mid: Rect = { x: 30, y: 30, w: 40, h: 20 };
    const r = stackPlace({ ...base, obstacles: [mid] })!;
    expect(r).toEqual({ x: 40, y: 19, w: 20, h: 10 });
    expect(mid.y - (r.y + r.h)).toBe(1); // 1 clear px: the stack's rows are 19-28, the obstacle starts at 30
    // no room: a stack taller than the rows it may take, or wider than the screen, has no place
    expect(stackPlace({ ...base, size: { w: 20, h: 80 } })).toBeNull();
    expect(stackPlace({ ...base, size: { w: 99, h: 10 } })).toBeNull();
    // walled in: obstacles all along the free rows leave no 1-px-clear place
    expect(stackPlace({ ...base, obstacles: [{ x: 0, y: 10, w: 100, h: 70 }] })).toBeNull();
    // a zero-size obstacle blocks nothing
    expect(stackPlace({ ...base, obstacles: [{ x: 45, y: 38, w: 0, h: 0 }] })).toEqual({ x: 40, y: 35, w: 20, h: 10 });
  });

  it("P9-2 (D1c): the band, the card and the hero card move in exactly the 20 pinned states; the compact hero card is back there; the band keeps a row clear of the barrels; the card's target holds the card inside the band", () => {
    expect(Object.keys(D1C).length, "D1c moves 20 states (windows 18: the review's 13 and five more; tablets 2)").toBe(20);
    expect(Object.keys(MOVED_PLAIN).sort(), "the plain pass pins the same 20").toEqual(Object.keys(D1C).sort());
    expect(Object.keys(MOVED_REVEAL).sort(), "and so does the REVEAL pass").toEqual(Object.keys(D1C).sort());
    for (const tag of Object.keys(D1C)) {
      const parts = tag.split(" "), [runes, offers] = parts[1].split("/").map(Number);
      const m = measure(parts[0], runes, offers, parts[2] === "WAGON", { reveal: true });
      const want = D1C[tag], L = m.s.L;
      expect(q(m.band), `${tag}: the band`).toEqual(want.band[1]);
      expect(q(m.foe), `${tag}: the NEXT BATTLE card`).toEqual(want.foe[1]);
      expect(q(m.foe ? heroCardRect(m.band, m.foe) : null), `${tag}: the hero card`).toEqual(want.hero[1]);
      expect(want.band[1][3], `${tag}: the band reaches IDLE_MIN`).toBe(50);
      expect([24, 16], `${tag}: the card stands 24 or 16 px lower`).toContain(want.foe[1]![1] - want.foe[0]![1]);
      expect(m.heroDrawn, `${tag}: the compact hero card is drawn`).toBe(true);
      expect(m.news, `${tag}: so no row and no stack`).toEqual([]);
      // the foot: 1 row clear of the barrels' tips (the carrier box's top) and at least 9 from the first mount
      const foot = m.band.y + m.band.h, tip = Math.floor(L.cam.y + L.cam.k * carrierBox(true).y0);
      expect(tip - foot, `${tag}: rows between the band's foot and the barrel tips`).toBeGreaterThanOrEqual(1);
      const mountTop = Math.min(...turretSlots(m.s.run.build).map((_, i) => m.s.turretRect(i).y));
      expect(mountTop - foot, `${tag}: rows between the band's foot and the first mount`).toBeGreaterThanOrEqual(9);
      // the card's finger target (a SCOUT stop's SPY: the foecard region) holds the card and stays inside the band
      const t = m.f.ui.regions.find((r) => r.id === "foecard");
      expect(t, `${tag}: the foecard target is registered`).toBeTruthy();
      expect(inside(m.foe!, t!.r), `${tag}: the target holds the card`).toBe(true);
      expect(inside(t!.r, m.band), `${tag}: and stays inside the band`).toBe(true);
    }
  }, 120_000);

  it("the row and the stack are not drawn with a card selected, hovered or carried (6)", () => {
    // stack states and row states (nothing selected draws one), each again with a selection, a hover and a carried card
    const probes: [string, number, number, boolean][] = [["v360x640@3", 0, 6, true], ["v360x640@3", 1, 6, false], ["v375x553@2", 0, 7, false], ["v375x553@2", 0, 7, true], ["v390x664@3", 0, 3, true]];
    let drawn = 0;
    for (const [name, runes, offers, wagon] of probes) {
      const plain = measure(name, runes, offers, wagon);
      if (plain.news.length) drawn++;
      const sel = measure(name, runes, offers, wagon, { pre: (s) => { s.sel = { kind: "offer", wagon: 0, slot: 0 }; } });
      const hov = measure(name, runes, offers, wagon, { pre: (s) => { s.hover = { wagon: 0, slot: 0 }; } });
      const car = measure(name, runes, offers, wagon, { pre: (s, run) => { s.ed.carry = { src: { from: "offer", wagon: 0, slot: 0 }, def: run.shop.wagons[0].offers[0].def, uid: -1 }; } });
      expect(sel.news, `${plain.tag} with a card selected`).toEqual([]);
      expect(hov.news, `${plain.tag} with a card hovered`).toEqual([]);
      expect(car.news, `${plain.tag} with a card carried`).toEqual([]);
    }
    expect(drawn, "all five probe states draw a row or a stack when nothing is selected").toBe(5);
  }, 120_000);

  it("the place is computed once per key of its inputs, not once per frame; the stack is drawn under the shop's and the wagon's cards; the numbers are read from run the same frame (7a, 7b, 7d)", async () => {
    const { numbersPlan } = await import("../src/screens/build/chrome");
    const { stackPlace, stackPlaceMemo, stackSpec } = await import("../src/screens/build/heroNumbers");
    on(() => {
      const m = measure("v360x640@3", 0, 6, true);
      const st = m.news.find((n) => n.kind === "stack");
      expect(st, "360x640@3, no rune, 6 offers, the wagon in a row draws the stack").toBeTruthy();
      // (a) build.ts rebuilds s.L every frame (a new object), yet the plan for the same inputs is the same rect object
      const L1 = m.s.L;
      const p1 = numbersPlan(m.s);
      m.s.update(0);
      m.f.ui.begin(); m.s.draw(lenient(fresh(m.s.L.W, m.s.L.H))); m.f.ui.end();
      expect(m.s.L, "build.ts draws on a fresh layout object each frame").not.toBe(L1);
      const p2 = numbersPlan(m.s);
      expect(!!p1 && !!p2 && p1.r === p2.r, "the same inputs return the very same rect: the place is memoized on a key of its inputs, not on s.L").toBe(true);
      // the memo is keyed by the inputs: another size gets its own place; the memo returns what stackPlace computes
      const spec = stackSpec(m.s, { w: 37, h: 23 }), other = stackSpec(m.s, { w: 45, h: 23 });
      expect(stackPlaceMemo(spec)).toEqual(stackPlace(spec));
      expect(stackPlaceMemo(other)).toEqual(stackPlace(other));
      expect(stackPlaceMemo(spec)).toBe(stackPlaceMemo(spec));
      // (b) draw order: the stack's panel is drawn before the first text inside any shop card or wagon card
      const iPanel = m.seq.findIndex((e) => e.k === "p" && !!st && same(e.r, st.r));
      const cardsAt = [...m.s.L.cards, ...(m.s.L.wagon?.rects ?? [])];
      const iCard = m.seq.findIndex((e) => e.k === "t" && cardsAt.some((c) => inside(box(e.r), c)));
      expect(iPanel, "the stack's panel was drawn").toBeGreaterThanOrEqual(0);
      expect(iCard, "a shop or wagon card's text was drawn").toBeGreaterThanOrEqual(0);
      expect(iPanel, "the stack is drawn BEFORE the cards: a card rolling in passes over it").toBeLessThan(iCard);
      // (d) the numbers are read now: a hull bonus bought between two frames shows in the next frame's stack
      const run = m.s.run, before = heroHullText(run);
      run.build.hullBonus += 7777;
      const after = heroHullText(run);
      expect(after, "the bonus changes the hull shown").not.toBe(before);
      const seq: Ev[] = [];
      hook(seq);
      m.f.ui.begin(); m.s.draw(lenient(fresh(m.s.L.W, m.s.L.H))); m.f.ui.end();
      hook(null);
      const words = seq.filter((e): e is { k: "t"; r: Rec } => e.k === "t").map((e) => e.r.s);
      expect(words, "the new HULL number is drawn in the very next frame").toContain(after);
      expect(words, "the old HULL number is gone").not.toContain(before);
    });
  }, 120_000);

  it("a shop of several merchants: the stack keeps clear of every merchant's tag (7c)", () => {
    // the real shop has 2-3 wagons, a tag over the first card of each group; the census repeats one wagon's offers. The shop as rolled, on the views that draw a stack.
    let checked = 0;
    for (const name of ["v360x640@3", "v375x553@2", "v360x560@3", "v320x568@2", "v300x640@3", "v600x960@1.5"]) {
      for (const runes of [0, 1]) for (const wagon of [false, true]) {
        const m = measure(name, runes, 5, wagon, { keepWagons: true });
        const stack = m.news.find((n) => n.kind === "stack");
        if (!stack) continue;
        checked++;
        const bad = m.gaps.filter((g) => g.gap < 1);
        expect(bad, `${m.tag} (${m.s.run.shop.wagons.length} merchants): the stack ${JSON.stringify(q(stack.r))} is under 1 px from ${bad.map((b) => b.to).join(", ")}`).toEqual([]);
      }
    }
    expect(checked, "several of these multi-merchant states draw a stack").toBeGreaterThanOrEqual(3);
  }, 120_000);

  it("a stack never covers a bow turret's barrel above its mount (V3: nothing drawn over a deck part) (7)", () => {
    // deckFloor is the mounts' top; the barrels reach 8 px higher (the carrier box's top). A stack that ends above the barrels' tips is clear of them; one that dips in must not meet a mount's barrel zone.
    let stacks = 0, dips = 0;
    const bad: string[] = [];
    for (const fam of ["small phones", "phones in a browser", "tablets", "windows"]) for (const name of familyNames(fam)) for (const runes of RUNES) for (const offers of OFFERS) for (const wagon of WAGONS) {
      const m = measure(name, runes, offers, wagon);
      const st = m.news.find((n) => n.kind === "stack");
      if (!st) continue;
      stacks++;
      const L = m.s.L;
      const tip = L.cam.y + L.cam.k * carrierBox(true).y0;
      if (st.r.y + st.r.h <= tip) continue;
      dips++;
      for (let i = 0; i < turretSlots(m.s.run.build).length; i++) {
        const mr = m.s.turretRect(i);
        const zone = { x: mr.x, y: tip, w: mr.w, h: mr.y - tip };
        if (zone.h > 0 && gap(st.r, zone) < 1) bad.push(`${m.tag}: the stack ${JSON.stringify(q(st.r))} meets mount ${i}'s barrel zone ${JSON.stringify(q(zone))}`);
      }
    }
    console.log(`P9N barrels: ${stacks} stacks, ${dips} end below the carrier box's top (the barrel tips), ${bad.length} meet a barrel zone`);
    expect(bad.slice(0, 8), "stacks over a barrel").toEqual([]);
  }, 240_000);
});
