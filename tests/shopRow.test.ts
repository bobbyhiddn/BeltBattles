import { describe, expect, it } from "vitest";
import { ITEMS, MERCHANTS, OFFERS, buyableModules } from "../src/sim/content";
import { computeView } from "../src/core/io";
import { buildLayout, buildScale, CARD_W, Caravan } from "../src/screens/build/layout";
import { cardName, describe as kindLine } from "../src/screens/build/shop";
import { portraitButtons } from "../src/screens/build/inspector";
import { textWidth } from "../src/render/font";

// 0.6.2p (item 4): "the phone shop row overflows its right edge" (shot beltside-061c-asm-gantry-phone). Root cause: the
// shot, not the layout. ASM_GANTRY rendered about 0.3 s after bb.open("build"), while the caravan's arrival (layout.ts
// Caravan: each card slides in from the right, the last parked at 0.83 s) was still running; five of the six slots sat
// 5 to 134 px right of their places. Parked, the phone row is 3 cards a row, x 12 to 156 of 167. The shot now waits for
// the caravan to park (scripts/shots-list.mjs parked()). This pins the layout math the brief asked about, on the phone,
// the small viewport and other small screens, for every shop size, plus the card's own contents: long names (a one-word
// name wider than the card spilled past its edges: COUNTERWEIGHT, OVERCLOCKER, HULLBREAKER), merge badges and the
// BUY+MERGE button.

const PORTRAIT: [string, number, number, number][] = [
  ["phone 390x844@3", 390, 844, 3], ["small 360x640@2", 360, 640, 2], ["iPhone SE 320x568@2", 320, 568, 2],
  ["375x667@2", 375, 667, 2], ["412x915@2.625", 412, 915, 2.625], ["414x896@2", 414, 896, 2], ["360x740@4", 360, 740, 4],
];
const LANDSCAPE: [string, number, number, number][] = [
  ["desk 1920x1080@1", 1920, 1080, 1], ["laptop 1366x768@1", 1366, 768, 1], ["1280x720@1", 1280, 720, 1], ["844x390@3", 844, 390, 3],
];
type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("0.6.2p item 4: every shop row fits its screen, parked", () => {
  it("the phone and small viewports: the numbers the shots use (W 234 and 240; 3 cards a row)", () => {
    // zoom (REQ-BFG-040): the phone's build screen zoomed out to 1.75 CSS px an art pixel at most (x5 at DPR 3, x3 at
    // DPR 2; before: 167x361 x7 and 180x320 x4, the same 3 cards a row at x 12, 61, 110), its rows balanced 3 + 3, centred
    const phone = computeView(390, 844, 3, buildScale), small = computeView(360, 640, 2, buildScale);
    expect([phone.W, phone.H, phone.scale, small.W, small.H, small.scale]).toEqual([234, 506, 5, 240, 426, 3]);
    const L = buildLayout(phone.W, phone.H, true, OFFERS, true);
    expect([L.perRow, L.cards.map((r) => r.x), L.reroll.x]).toEqual([3, [45, 94, 143, 45, 94], 143]);
    expect(L.reroll.x + L.reroll.w).toBe(189); // 45 px inside the right edge, 45 inside the left
  });

  it("every card and the reroll lie inside the screen and never overlap, for 0 to 5 offers, portrait and landscape", () => {
    for (const [name, w, h, dpr] of [...PORTRAIT, ...LANDSCAPE]) {
      const v = computeView(w, h, dpr, buildScale);
      for (let n = 0; n <= OFFERS; n++) {
        const L = buildLayout(v.W, v.H, v.portrait, n);
        const slots = [...L.cards, L.reroll];
        expect(slots, `${name} n${n}`).toHaveLength(n + 1);
        for (const r of slots) {
          expect(r.x, `${name} n${n}`).toBeGreaterThanOrEqual(2);
          expect(r.x + r.w, `${name} n${n}`).toBeLessThanOrEqual(v.W - 2);
          expect(r.y, `${name} n${n}`).toBeGreaterThanOrEqual(14); // under the top bar
        }
        for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) expect(overlap(slots[i], slots[j]), `${name} n${n}`).toBe(false);
      }
    }
  });

  it("the caravan's slide is the only time a card is right of its slot, and it parks by 0.83 s", () => {
    const c = new Caravan();
    c.arrive(OFFERS);
    let t = 0;
    while (!c.ready && t < 2) { c.update(1 / 60); t += 1 / 60; }
    expect(t).toBeLessThan(0.9);
    for (let i = 0; i <= OFFERS; i++) expect(c.dx(i, 167)).toBe(0);
  });
});

describe("0.6.2p item 4: a card's contents fit the card", () => {
  const shopDefs = Object.values(ITEMS).filter((d) => d.merchant && d.price > 0);

  it("every name a caravan can offer fits the card in at most two lines (3x5 face, CARD_W - 4 = 42 px)", () => {
    expect(shopDefs.length).toBe(buyableModules().length + 2); // + BELT CRATE and ARMOR PLATING
    for (const d of shopDefs) {
      const lines = cardName(d, CARD_W - 4);
      expect(lines.length, d.id).toBeLessThanOrEqual(2);
      for (const l of lines) expect(textWidth(l, "3"), `${d.id}: ${l}`).toBeLessThanOrEqual(CARD_W - 4);
    }
    expect(cardName(ITEMS.counterweight, CARD_W - 4)).toEqual(["COUNTER-", "WEIGHT"]);
    expect(cardName(ITEMS.overclocker, CARD_W - 4)).toEqual(["OVER-", "CLOCKER"]);
    expect(cardName(ITEMS.hullbreaker, CARD_W - 4)).toEqual(["HULL-", "BREAKER"]);
  });

  it("every merge badge fits its card (shop.ts drawBadge: text + 4 px within CARD_W - 8)", () => {
    for (const label of ["MERGE ★2", "MERGE ★3", "+1 ★2", "MAX"]) expect(textWidth(label, "3") + 4, label).toBeLessThanOrEqual(CARD_W - 8);
  });

  it("BUY, BUY+MERGE and BUY+USE labels fit their button beside every title on the phone band, and the small strip's", () => {
    const band = { x: 3, y: 100, w: 161, h: 69 }; // the phone's info band (inspectorLines F7)
    for (const d of shopDefs) {
      for (const label of d.kind === "supply" ? [`BUY+USE ${d.price}G`] : [`BUY ${d.price}G`, `BUY+MERGE ${d.price}G`]) {
        const sub = `${kindLine(d)} · ${MERCHANTS[d.merchant!].name}`;
        const { rects } = portraitButtons(d.name, sub, [label], band);
        expect(rects[0].w, `${d.id}: ${label}`).toBeGreaterThanOrEqual(textWidth(label, "3") + 4);
        expect(rects[0].x + rects[0].w, `${d.id}: ${label}`).toBeLessThanOrEqual(band.x + band.w - 4);
        // the 360x640 strip is a header only: one button at the even width, 64 px (inspector.ts topRowButtons)
        expect(textWidth(label, "3") + 4, `${d.id}: ${label} on the small strip`).toBeLessThanOrEqual(64);
      }
    }
  });
});
