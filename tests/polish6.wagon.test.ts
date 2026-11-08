// POLISH-6 P6-6 (REQ-BFG-089, REQ-BFG-087; RULING-SCOUT-POLISH6 S1, variant b2t): THE ENCHANTER'S WORD CARDS STAND IN THE RIGHT COLUMN'S GAP, between NEXT BATTLE (L.foe) and FIGHT (L.fight), so the details column keeps its whole
// height on ENCHANTER days (about half of all dawns). At polish5-accepted the cards took a row at the top of the column (enchantStrip.ts inRow, shift 58) everywhere the margin left of the shop block would not hold them (1920x1080,
// 1366x768, 844x390@3 and the other landscape phones): the belt panel gave away 264 / 416 / 212 hit rows of the 316 real belts at 1920x1080 / 1366x768 / 844x390@3 (74 / 108 / 65 short belts, 4 / 6 / 4 on other days).
// What this file pins (the nine landscape views of tests/polish4.helpers.ts VIEWS13, 5 offers, no rune, unless said):
//   - S1.1 THE FACE: the place the chain takes (margin | gap | row), each card's size, the icon scale (x2 from 38 px tall, else x1: measured on the drawn card), the tag's place, the shift (0), the lift;
//   - S1.2 THE TAG STAYS: right of the cards, never above them, its drawn width (the ring and the word in the 3x5 face); where it does not fit beside 46-wide cards they narrow down to 41 px, below that the tag is dropped;
//     a phone's targets are at least 44 x 44 CSS px;
//   - the details column is the harness's whole one wherever the gap takes the cards (126x194 / 119x180 / 128x216), and the real belts give away 74 / 108 / 65 -> 4 / 8 / 2 short belts (P6-1 too);
//   - S1.3: each card selected in turn is drawn with no pixel inside NEXT BATTLE's or FIGHT's rect (a real BuildScreen, drawWagon on a blank raster), and the control: the same draw with the old lift of 2 does reach NEXT BATTLE;
//     and the converse, found in the pictures of the gap: FIGHT's cue (the arrow bobbing above FIGHT once something is placed this round) lay over the second card's price. With the cue on, no pixel of a card, its lift row or its frame
//     changes (the whole frame drawn with the cue on and off at the nine views): the arrow stands beside FIGHT where a card is in its reach (cues.ts drawFightCue) and above it where none is;
//   - S1.4 THE FALLBACK: the nine landscape views and both portrait phones, 3 to 7 offers, no rune and one: the wagon has a place on the screen, clear of every target (a finger's size on a phone); the gap where it holds the cards
//     (shift 0, the column whole), the row (shift 58) where it does not (a gap shorter than a finger or MIN_H, packs lying in it), 1280x800 in the margin (2 x 41), the portrait phones in theirs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { enchanterRun, framed } from "./polish2.guestCorpus";
import { VIEWS13 } from "./polish4.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { viewWithSub } from "../src/game/viewGrid";
import { BuildScreen } from "../src/screens/build/build";
import { drawWagon, drawWordCard, wagonPlace, wordLayout } from "../src/screens/build/enchantStrip";
import { drawFightCue } from "../src/screens/build/cues";
import { planPanel, routePanel, visibleLines, type PanelPlan, type PanelText } from "../src/screens/build/inspector";
import { faceRun } from "../src/screens/battleScout";
import { newRun, rollShop, type Run } from "../src/game/run";
import { ENCHANT, setEnchant, withEnchant, type EnchantId } from "../src/sim/enchant";
import { RIVAL_IDS, rivalBuild, rivalDays, standInBuild, type RivalId } from "../src/sim/rivals";
import type { Build } from "../src/sim/deck";
import { textWidth } from "../src/render/font";
import { TAP_CSS, tapPx } from "../src/ui/tap";
import { UI, type Rect } from "../src/ui/ui";
import type { Game } from "../src/game/game";

installRaster();
class MapStore {
  m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}
beforeEach(() => {
  vi.stubGlobal("localStorage", new MapStore());
  setTipsForTests("done"); // no first-run hint strip or first-sight box in the way
});
afterEach(() => {
  vi.unstubAllGlobals();
  setEnchant(ENCHANT);
});

const on = <T,>(fn: () => T): T => withEnchant(fn, true);
const LAND9 = ["desk-1920x1080", "laptop-1366x768", "desk-1280x800", "col96-3040x1710", "land-844x390", "land-812x375@3", "pixel5-851x393@2.75", "land-915x412@2.625", "promax-926x428@3"] as const;
const PHONES5 = ["land-844x390", "land-812x375@3", "pixel5-851x393@2.75", "land-915x412@2.625", "promax-926x428@3"] as const;
const PORTRAIT2 = ["op-402x690", "phone-360x640"] as const;
const ov = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** the tag as drawEnchanterTag draws it: the ring (3 px), 2 clear, the word in the 3x5 face -- measured, not set */
const TAG_W = 5 + textWidth("ENCHANTER", "3");
const frameOf = (name: string, runes = 0, offers = 5, enchanter = true) => { const [w, h, dpr] = VIEWS13[name as keyof typeof VIEWS13]; return framed(w, h, dpr, runes, offers, enchanter); };
/** the word icon's drawn size on a card of rect `r` (12 = x1, 24 = x2): the widest image the draw asks for (the coin is smaller) */
function iconSize(r: Rect): number {
  const c = fresh(r.x + r.w + 4, r.y + r.h + 4), g = G(c), seen: number[] = [];
  const draw = g.drawImage.bind(g) as (...a: unknown[]) => void;
  (g as unknown as { drawImage: (...a: unknown[]) => void }).drawImage = (...a: unknown[]) => { seen.push((a[0] as { width: number }).width); draw(...a); };
  drawWordCard(g, { ...r, y: r.y + 3 }, "fiery", { price: 4, sold: false, affordable: true, selected: false, hover: false, t: 0 });
  return Math.max(...seen);
}

describe("POLISH-6 P6-6 S1.1: the place and the face of the word cards at the nine landscape views (5 offers, no rune)", () => {
  /** [view, place, card w, card h, icon x, tag, lift] -- the lift is what a selected card may rise (absent: 2) */
  const TABLE: [string, "margin" | "gap", number, number, 1 | 2, "right" | "above", number | undefined][] = [
    ["desk-1920x1080", "gap", 46, 39, 2, "right", 0],
    ["laptop-1366x768", "gap", 43, 32, 1, "right", 0],
    ["desk-1280x800", "margin", 41, 46, 2, "above", undefined],
    ["col96-3040x1710", "gap", 46, 46, 2, "right", 0],
    ["land-844x390", "gap", 46, 46, 2, "right", 2],
    ["land-812x375@3", "gap", 46, 45, 2, "right", 0],
    ["pixel5-851x393@2.75", "gap", 46, 39, 2, "right", 0],
    ["land-915x412@2.625", "gap", 46, 39, 2, "right", 0],
    ["promax-926x428@3", "gap", 46, 32, 1, "right", 0],
  ];
  for (const [name, place, cw, ch, icon, tagAt, lift] of TABLE) {
    it(`${name}: the cards are in the ${place} (${cw} x ${ch}, the icon x${icon}, the tag ${tagAt} of them, lift ${lift ?? "2 as always"}), the column keeps its height (shift 0)`, () => {
      const f = frameOf(name), L = f.L, wg = L.wagon!;
      expect(wg, `${name}: a wagon`).toBeTruthy();
      expect(wg.rects.length).toBe(2);
      expect(wg.shift, `${name}: the details column gives up nothing`).toBe(0);
      const r0 = wg.rects[0], foe = L.foe!, fight = L.fight;
      if (place === "gap") {
        expect(r0.x, `${name}: left-aligned with NEXT BATTLE`).toBe(foe.x);
        expect(r0.y >= foe.y + foe.h + 1 && r0.y + r0.h <= fight.y - 1, `${name}: 1 px of clear from NEXT BATTLE's foot and FIGHT's top at least`).toBe(true);
      } else expect(r0.x + r0.w * 2 <= L.cards[0].x, `${name}: the margin left of the shop block`).toBe(true);
      expect([r0.w, r0.h], `${name}: a card`).toEqual([cw, ch]);
      expect(wg.rects[1].w).toBe(r0.w);
      expect(iconSize(r0), `${name}: the word's icon, drawn`).toBe(icon * 12);
      expect(wg.lift, `${name}: the lift`).toBe(lift);
      expect(wg.tag, `${name}: the tag stays`).not.toBeNull();
      if (tagAt === "right") {
        const right = wg.rects[1].x + wg.rects[1].w;
        expect(wg.tag!.x, `${name}: the tag stands right of the cards, 4 px clear`).toBe(right + 4);
        expect(wg.tag!.y, `${name}: the tag is never above the cards`).toBeGreaterThanOrEqual(r0.y);
        expect(wg.tag!.y + 5, `${name}: and no lower than their foot`).toBeLessThanOrEqual(r0.y + r0.h);
        expect(wg.tag!.x + TAG_W, `${name}: the drawn tag (${TAG_W} px) lies inside the column`).toBeLessThanOrEqual(foe.x + foe.w);
      } else expect(wg.tag!.y, `${name}: the margin's tag is above its cards, as every merchant's`).toBeLessThan(r0.y);
    });
  }
  it("the tag is 40 px wide as drawn (the ring and ENCHANTER in the 3x5 face), not the 41 the scout's patch set by hand", () => {
    expect(TAG_W).toBe(40);
  });
  it("S1.2: the cards narrow to fit the tag, down to 41 px; only below 41 is the tag dropped (a column 129 px wide keeps it, 128 drops it)", () => {
    const f = frameOf("laptop-1366x768", 0, 5, false), L = f.L;
    for (const [w, cw, tag] of [[140, 46, true], [133, 43, true], [130, 41, true], [129, 41, true], [128, 46, false], [120, 46, false], [97, 46, false]] as const) {
      // 1366x768's margin refuses the cards, so the gap (as wide as NEXT BATTLE: `w`) takes them
      const q = on(() => wagonPlace({ ...L, foe: { ...L.foe!, w } }, 2, 0))!;
      expect(q.shift, `foe ${w} px wide: in the gap`).toBe(0);
      expect(q.rects[0].x, `foe ${w} px wide: in the gap`).toBe(L.foe!.x);
      expect(q.rects[0].w, `foe ${w} px wide: the cards`).toBe(cw);
      expect(q.tag !== null, `foe ${w} px wide: the tag`).toBe(tag);
      if (q.tag) expect(q.tag.x + TAG_W, `foe ${w}: the tag inside the column`).toBeLessThanOrEqual(L.foe!.x + w);
    }
  });
  it("S1.2: on a phone every target is at least 44 x 44 CSS px (844x390@3 61.3 x 61.3, 926x428@3 76.7 x 53.3)", () => {
    for (const name of PHONES5) {
      const f = frameOf(name), k = f.view.scale / f.view.dpr;
      for (const hit of f.L.wagon!.hits) {
        expect(hit.w * k, `${name}: tap width, CSS px`).toBeGreaterThanOrEqual(TAP_CSS - 1e-9);
        expect(hit.h * k, `${name}: tap height, CSS px`).toBeGreaterThanOrEqual(TAP_CSS - 1e-9);
      }
    }
    const a = frameOf("land-844x390"), b = frameOf("promax-926x428@3");
    expect([+(a.L.wagon!.hits[0].w * a.view.scale / a.view.dpr).toFixed(1), +(a.L.wagon!.hits[0].h * a.view.scale / a.view.dpr).toFixed(1)]).toEqual([61.3, 61.3]);
    expect([+(b.L.wagon!.hits[0].w * b.view.scale / b.view.dpr).toFixed(1), +(b.L.wagon!.hits[0].h * b.view.scale / b.view.dpr).toFixed(1)]).toEqual([76.7, 53.3]);
  });
});

describe("POLISH-6 P6-6: the details column keeps its whole height on ENCHANTER days (framed(.., true) is the harness's)", () => {
  for (const [name, col] of [["desk-1920x1080", [126, 194]], ["laptop-1366x768", [119, 180]], ["land-844x390", [128, 216]], ["desk-1280x800", [128, 324]]] as const) {
    it(`${name}: ${col[0]} x ${col[1]} with the wagon up, as without it (it was ${name === "desk-1280x800" ? "the same" : `${col[1] - 58} tall, 58 px lost to the row`})`, () => {
      const f = frameOf(name, 0, 5, false), e = frameOf(name);
      expect([e.L.info.w, e.L.info.h]).toEqual(col);
      expect(e.L.info, `${name}: the very rect`).toEqual(f.L.info);
      expect(e.L.wagon!.shift).toBe(0);
    });
  }
});

/** the 316 real belts (rival builds and stand-ins, days 5, 8, 12, 16) as the build screen's panel text */
function rivalBelts(): PanelText[] {
  const out: PanelText[] = [];
  const makers: ((id: RivalId, day: number) => Build)[] = [rivalBuild, standInBuild];
  for (const id of RIVAL_IDS) for (const make of makers) for (const day of [5, 8, 12, 16].filter((d) => rivalDays(id, 16).includes(d))) {
    const b = make(id, day);
    b.routes.forEach((_, i) => { const t = routePanel(faceRun(b, day), i); if (t) out.push(t); });
  }
  return out;
}
const moreN = (p: PanelPlan): number => {
  const drawn = new Set(visibleLines(p).map((v) => v.line));
  const m = p.body.shown.filter((l) => l.lines.length > 0 && l.lines.every((ln) => drawn.has(ln))).map((l) => /\+(\d+) MORE HIT TILE/.exec(l.b.text)).find((x) => x);
  return m ? Number(m[1]) : 0;
};

describe("POLISH-6 P6-6 (with P6-1): the real belts on ENCHANTER days give away what they give away on any day", () => {
  it("316 belts, the ENCHANTER's live column: short belts / rows lost 4 / 8, 8 / 24, 2 / 4 at 1920x1080, 1366x768, 844x390@3, 0 at 1280x800 -- the harness column's numbers (it was 74 / 264, 108 / 416, 65 / 212 with the row)", () => {
    const belts = on(rivalBelts);
    expect(belts.length).toBe(316);
    for (const [name, want] of [["desk-1920x1080", [4, 8]], ["laptop-1366x768", [8, 24]], ["land-844x390", [2, 4]], ["desk-1280x800", [0, 0]]] as const) {
      const f = frameOf(name, 0, 5, true), h = frameOf(name, 0, 5, false), tp = tapPx(f.view);
      const count = (area: Rect): [number, number] => on(() => {
        let n = 0, rows = 0;
        for (const t of belts) { const m = moreN(planPanel(t, area, [], { tap: tp })); if (m > 0) { n++; rows += m; } }
        return [n, rows];
      });
      expect(count(f.L.info), `${name}: the ENCHANTER's column`).toEqual(want);
      expect(count(h.L.info), `${name}: the harness's column`).toEqual(want);
    }
  });
});

describe("POLISH-6 P6-6 S1.3: nothing is drawn over its neighbours: a selected word card (its lift and its frame included) never over NEXT BATTLE or FIGHT, FIGHT's cue never over a word card", () => {
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
  function dayRun(): Run {
    return on(() => {
      const run = newRun("furnace", 7);
      run.day = 3;
      run.gold = 20;
      run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
      rollShop(run);
      run.runeDay = undefined;
      run.shop.enchanter = { day: 3, offers: (["fiery", "wide"] as EnchantId[]).map((ench) => ({ ench, price: 4, sold: false })) };
      return run;
    });
  }
  function rig(name: string): BuildScreen {
    const [w, h, dpr] = VIEWS13[name as keyof typeof VIEWS13];
    const fake = new FakeGame(dayRun(), w, h, dpr);
    const screen = new BuildScreen(fake as unknown as Game);
    fake.view = viewWithSub(w, h, dpr, screen.pickScale.bind(screen), screen.pickSub.bind(screen));
    screen.enter();
    screen.update(3);
    return screen;
  }
  const inked = (c: RasterCanvas, q: Rect): number => { let n = 0; for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) if (c.at(x, y) !== null) n++; return n; };
  for (const name of LAND9) {
    it(`${name}: each card selected in turn draws no pixel in L.foe or L.fight`, () => {
      on(() => {
        const s = rig(name), L = s.L;
        expect(L.wagon, `${name}: a wagon`).toBeTruthy();
        for (let i = 0; i < 2; i++) {
          s.sel = { kind: "word", pick: false, i };
          const c = fresh(L.W, L.H);
          drawWagon(G(c), s);
          expect(inked(c, L.wagon!.rects[i]), `${name}: card ${i} is drawn`).toBeGreaterThan(0);
          expect(inked(c, { x: L.wagon!.rects[i].x - 1, y: L.wagon!.rects[i].y - 1 - (L.wagon!.lift ?? 2), w: L.wagon!.rects[i].w + 2, h: 1 }), `${name}: card ${i}'s selection frame is drawn above it`).toBeGreaterThan(0);
          expect(inked(c, L.foe!), `${name}: card ${i} selected: pixels inside NEXT BATTLE`).toBe(0);
          expect(inked(c, L.fight), `${name}: card ${i} selected: pixels inside FIGHT`).toBe(0);
        }
      });
    });
  }
  it("the control: drawn with the old lift of 2 and no clamp, a card in the 1920x1080 gap (1 px of clear) does reach NEXT BATTLE", () => {
    const f = frameOf("desk-1920x1080"), L = f.L, r = L.wagon!.rects[0];
    const c = fresh(L.W, L.H);
    drawWordCard(G(c), r, "fiery", { price: 4, sold: false, affordable: true, selected: true, hover: false, t: 0 });
    expect(inked(c, L.foe!), "the unclamped lift reaches NEXT BATTLE").toBeGreaterThan(0);
    const d = fresh(L.W, L.H);
    drawWordCard(G(d), r, "fiery", { price: 4, sold: false, affordable: true, selected: true, hover: false, t: 0, maxLift: L.wagon!.lift });
    expect(inked(d, L.foe!), "the clamped lift does not").toBe(0);
  });

  // The converse (found in the pictures of the gap): FIGHT's cue, the yellow arrow bobbing above FIGHT once something is placed this round (BuildScreen.placedOnce), lay over the second card's price. It now stands
  // beside FIGHT where a card is in its reach (cues.ts drawFightCue); everywhere else it is where it always was.
  const lenient = (c: RasterCanvas): CanvasRenderingContext2D =>
    new Proxy(G(c), { get: (t, k, r) => { const v = Reflect.get(t, k, r); return v !== undefined ? (typeof v === "function" ? v.bind(t) : v) : (): undefined => undefined; } }) as unknown as CanvasRenderingContext2D;
  const changed = (a: RasterCanvas, b: RasterCanvas, q: Rect): number => { let n = 0; for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) if (a.at(x, y) !== b.at(x, y)) n++; return n; };
  const drawFrame = (s: BuildScreen, cue: boolean): RasterCanvas => {
    s.placedOnce = cue;
    const c = fresh(s.L.W, s.L.H), ui = (s.game as unknown as { ui: UI }).ui;
    ui.begin();
    s.draw(lenient(c));
    ui.end();
    return c;
  };
  for (const name of LAND9) {
    it(`${name}: FIGHT's cue (the arrow once something is placed) changes no pixel of a word card, its lift row or its frame`, () => {
      on(() => {
        const s = rig(name), L = s.L, wg = L.wagon!, inGap = wg.shift === 0 && wg.rects[0].x >= L.foe!.x - 1;
        const off = drawFrame(s, false), onn = drawFrame(s, true);
        for (const r of wg.rects) expect(changed(off, onn, { x: r.x - 1, y: r.y - 3, w: r.w + 2, h: r.h + 4 }), `${name}: the cue over a word card ${JSON.stringify(r)}`).toBe(0);
        const cx = Math.floor(L.fight.x + L.fight.w / 2), above = { x: cx - 5, y: L.fight.y - 16, w: 11, h: 15 }, beside = { x: L.fight.x - 14, y: L.fight.y + 8, w: 13, h: 16 };
        expect(changed(off, onn, above) > 0, `${name}: the arrow ${inGap ? "is not" : "is"} above FIGHT`).toBe(!inGap);
        expect(changed(off, onn, beside) > 0, `${name}: the arrow ${inGap ? "is" : "is not"} beside FIGHT`).toBe(inGap);
      });
    });
  }
  it("the control: without the cards' rects the arrow lies over the second word card at 1920x1080 (it did); with them it stands beside FIGHT", () => {
    const f = frameOf("desk-1920x1080"), L = f.L, c = fresh(L.W, L.H), d = fresh(L.W, L.H);
    drawFightCue(G(c), L.fight, false, 0);
    expect(inked(c, L.wagon!.rects[1]), "the arrow over card 2").toBeGreaterThan(0);
    drawFightCue(G(d), L.fight, false, 0, L.wagon!.rects);
    expect(inked(d, L.wagon!.rects[0]) + inked(d, L.wagon!.rects[1]), "with the cards' rects: nothing over a card").toBe(0);
    expect(inked(d, { x: L.fight.x - 14, y: L.fight.y + 8, w: 13, h: 16 }), "the arrow stands beside FIGHT").toBeGreaterThan(0);
  });
});

describe("POLISH-6 P6-6 S1.4: the fallback chain margin -> gap -> row; the wagon always has a place, clear of every target", () => {
  const rowKind = (L: ReturnType<typeof frameOf>["L"]): "margin" | "gap" | "row" => {
    const wg = L.wagon!;
    if (wg.shift > 0) return "row";
    return L.foe && wg.rects[0].x >= L.foe.x - 1 ? "gap" : "margin";
  };
  for (const name of [...LAND9, ...PORTRAIT2]) {
    it(`${name}: 3 to 7 offers, no rune and one rune: a place on the screen, clear of every target, a finger's size on a phone; the gap keeps the column whole, the row costs 58`, () => {
      for (const runes of [0, 1]) for (const offers of [3, 4, 5, 6, 7]) {
        const f = frameOf(name, runes, offers, true), L = f.L, wg = L.wagon!, tag = `${name} runes ${runes} offers ${offers}`;
        expect(wg, `${tag}: a wagon`).toBeTruthy();
        const others: [string, Rect][] = [["bar", L.bar], ["reroll", L.reroll], ["cargo", L.cargo], ["fight", L.fight],
          ...L.cards.map((q, i): [string, Rect] => [`card ${i}`, q]), ...L.packs.map((q, i): [string, Rect] => [`pack ${i}`, q]), ...(L.foe ? [["foe", L.foe] as [string, Rect]] : [])];
        const k = f.view.scale / f.view.dpr;
        for (const c of wg.rects.map((r, i) => [r, wg.hits[i]] as const)) for (const q of c) {
          expect(q.x >= 0 && q.y >= 0 && q.x + q.w <= L.W && q.y + q.h <= L.H, `${tag}: on the screen ${JSON.stringify(q)}`).toBe(true);
          for (const [nm, o] of others) expect(ov(q, o), `${tag}: ${JSON.stringify(q)} against ${nm} ${JSON.stringify(o)}`).toBe(false);
          expect(ov(q, L.info), `${tag}: clear of the details panel ${JSON.stringify(L.info)}`).toBe(false);
          if (f.tap > 0 && q === c[1]) { expect(q.w * k, `${tag}: tap width`).toBeGreaterThanOrEqual(TAP_CSS - 0.5); expect(q.h * k, `${tag}: tap height`).toBeGreaterThanOrEqual(TAP_CSS - 0.5); }
        }
        expect(ov(wg.hits[0], wg.hits[1]), `${tag}: the two targets never meet`).toBe(false);
        if (!L.portrait) {
          expect(ov(wg.rects[0], L.hull) || ov(wg.rects[1], L.hull), `${tag}: clear of the hull`).toBe(false);
          const kind = rowKind(L), plain = frameOf(name, runes, offers, false).L;
          if (kind === "gap") {
            expect(wg.shift, `${tag}: the gap costs the column nothing`).toBe(0);
            expect(L.info, `${tag}: the column is the plain frame's`).toEqual(plain.info);
          }
          if (kind === "row") {
            // the row only where the gap could not take them: shorter than a finger or MIN_H, or the packs lie in it
            const foot = L.foe!.y + L.foe!.h, room = L.fight.y - 1 - (foot + 1), packsIn = L.packs.some((p) => p.y < L.fight.y && p.y + p.h > foot && p.x < L.foe!.x + L.foe!.w && p.x + p.w > L.foe!.x);
            expect(packsIn || room < Math.max(30, f.tap) || Math.min(L.cards[0].h, room) < Math.max(30, f.tap), `${tag}: a row (shift ${wg.shift}) although the gap (${room} px, packs in it: ${packsIn}) could hold the cards`).toBe(true);
            expect(L.info.y, `${tag}: the column starts under the row`).toBe(plain.info.y + wg.shift);
          }
        }
      }
    });
  }
  it("the places: 1280x800 stays in the margin (2 x 41 x 46), the landscape phones' rows are the 7-offer days with packs in the gap and the 844x390@3 day with a rune and 5 or more offers; the portrait phones are stacked in the margin", () => {
    const kinds = (name: string, runes: number, offers: number): string => rowKind(frameOf(name, runes, offers, true).L);
    expect(kinds("desk-1280x800", 0, 5)).toBe("margin");
    expect(frameOf("desk-1280x800", 0, 5).L.wagon!.rects.map((r) => [r.w, r.h])).toEqual([[41, 46], [41, 46]]);
    for (const name of ["land-812x375@3", "pixel5-851x393@2.75", "land-915x412@2.625"]) expect([kinds(name, 0, 6), kinds(name, 0, 7)], `${name}: 6 offers, 7 offers`).toEqual(["gap", "row"]);
    expect([kinds("land-844x390", 1, 4), kinds("land-844x390", 1, 5)]).toEqual(["margin", "row"]);
    for (const name of PORTRAIT2) {
      const wg = frameOf(name, 0, 5).L.wagon!;
      expect(wg.shift, `${name}: stacked in the margin, nothing lost`).toBe(0);
      expect(wg.rects[1].y > wg.rects[0].y && wg.rects[1].x === wg.rects[0].x, `${name}: stacked`).toBe(true);
    }
  });
  it("the row is the fallback as before: forced (no NEXT BATTLE for the gap to start from) it costs 58 px at 1920x1080, 1366x768 and 844x390@3, exactly the column it cost at polish5-accepted", () => {
    for (const [name, h] of [["desk-1920x1080", 136], ["laptop-1366x768", 122], ["land-844x390", 158]] as const) {
      const f = frameOf(name, 0, 5, false), e = on(() => wordLayout({ ...f.L, foe: null }, enchanterRun(), f.tap));
      expect(e.wagon!.shift, name).toBe(58);
      expect(e.info.h, `${name}: the column under the row`).toBe(h);
      expect(e.info.y, name).toBe(f.L.info.y + 58);
    }
  });
});
