// POLISH-1 (REQ-BFG-085; BRIEF-POLISH1 P2; BUMP-1F's review F2): the word's spark (FIERY's and the other seven's) on LAST CHANCE's PART card sits whole inside the
// card's inner box, clear of the frame and the rarity bars, open card and closed, on both views (the 402x690 @3 phone and the 1280x800 desk).
// It was drawn at (r.x + r.w - 5, r.y - 1), on the frame's top-right corner, where it straddled the border and read as a stray dot.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { G, diffPx, fresh, installRaster, region } from "./raster.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { UI } from "../src/ui/ui";
import { newRun, pendingLastChance, type Run } from "../src/game/run";
import { ENCHANT, ENCHANT_DEFS, ENCHANT_IDS, setEnchant, withEnchant, type EnchantId } from "../src/sim/enchant";
import { lastChanceWord } from "../src/sim/enchantSources";
import { SPARK_SIZE } from "../src/render/enchantMarks";
import { LastChancePicker, lcSparkAt } from "../src/screens/lastChancePicker";
import { buildLayout, buildScale, phoneBarLift, phoneScreen } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { TAP_CSS } from "../src/ui/tap";

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
  setTipsForTests("done"); // no first-run hint strip in the way
});
afterEach(() => {
  vi.unstubAllGlobals();
  setEnchant(ENCHANT);
});

/** The two views the brief names: the op phone and the desk. */
const VIEWS = { phone: [402, 690, 3], desk: [1280, 800, 1] } as const;
type ViewName = keyof typeof VIEWS;
const VIEW_NAMES = Object.keys(VIEWS) as ViewName[];

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it, trimmed to the picker (tests/enchant1.marks.test.ts lcScreen, with the view a parameter). */
function lcScreen(run: Run, [w, h, dpr]: readonly [number, number, number]) {
  const pw = w * dpr, ph = h * dpr, portrait = ph > pw * 1.05;
  const fakeS = { run: { build: { runes: [] as unknown[] } }, refit: false, offers: () => Array.from({ length: 5 }) } as unknown as Parameters<typeof runeRowFits>[0];
  let S = buildScale(pw, ph, portrait, dpr);
  while (S > 1 && !runeRowFits(fakeS, pw, ph, portrait, S, dpr)) S--;
  const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
  const W = Math.floor(pw / S), H = Math.floor(ph / S);
  const lay = (unit: number) => {
    const row = runeRowH({ scale: S, dpr }, 0), lift = phone ? phoneBarLift(W, H, 5, tap, runeRowH({ scale: S, dpr }, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, 5, phone, tap, lift, { scale: S, unit }), row, H);
  };
  const Z = lay(1).cam.z, unit = gcd(S, Z), sub = S / unit;
  const ui = new UI();
  ui.pointer.kind = "touch";
  const s = {
    run, refit: false, touch: true, L: lay(unit), t: 0,
    game: { W, H, ui, view: { W, H, scale: S, dpr, portrait, sub }, canvas: null, error: () => {}, resize: () => {}, toast: () => {} },
    touched: () => {}, lcHeartT: Infinity,
  };
  const frame = (lc: LastChancePicker) => {
    const c = fresh(W, H);
    ui.begin();
    lc.draw(G(c), s as never);
    ui.end();
    return { c, ui };
  };
  return { s, frame, W, H };
}

/** Runs whose LAST CHANCE (fired on day 3) offers a part that takes a word: one run for each word found in the first seeds. */
function enchantedOffers(): { run: Run; part: string; word: EnchantId }[] {
  const seen = new Map<EnchantId, { run: Run; part: string; word: EnchantId }>();
  for (let seed = 1; seed < 600 && seen.size < ENCHANT_IDS.length; seed++) {
    const run = withEnchant(() => newRun("furnace", seed, `polish1-lc-${seed}`), true);
    (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 3 };
    const offer = withEnchant(() => pendingLastChance(run), true);
    const part = offer?.part;
    const w = part ? withEnchant(() => lastChanceWord(seed, 3, part), true) : null;
    if (part && w && !seen.has(w.ench)) seen.set(w.ench, { run, part, word: w.ench });
  }
  return [...seen.values()];
}

describe("POLISH-1 P2: the word's spark sits whole inside LAST CHANCE's PART card", () => {
  const offers = enchantedOffers();
  it("the seeds offer at least three different words (the test reads each)", () => {
    expect(offers.length).toBeGreaterThanOrEqual(3);
  });

  it("lcSparkAt: the 3 x 3 spark is inside the card's inner box (inside the frame and the two rarity bars), clear of the part's picture and of the head's words, at every card size", () => {
    for (const [w, h] of [[120, 52], [192, 70], [300, 90]]) {
      const r = { x: 4, y: 40, w, h }, sp = lcSparkAt(r);
      const inner = { x: r.x + 1, y: r.y + 3, w: r.w - 2, h: r.h - 6 }; // the frame is 1 px; the rarity bars are r.y + 1..2 and r.y + h - 3..h - 2
      expect(sp.x >= inner.x && sp.y >= inner.y && sp.x + SPARK_SIZE <= inner.x + inner.w && sp.y + SPARK_SIZE <= inner.y + inner.h, `${w}x${h}: inside`).toBe(true);
      // the picture is 12 x 12 centred on (r.x + 16, r.y + 17): cols r.x + 10..21, rows r.y + 11..22; the words start at r.x + 31
      expect(sp.y + SPARK_SIZE <= r.y + 11, `${w}x${h}: above the picture`).toBe(true);
      expect(sp.x + SPARK_SIZE <= r.x + 31, `${w}x${h}: left of the head's words`).toBe(true);
    }
  });

  for (const view of VIEW_NAMES) {
    for (const open of [false, true]) {
      it(`${view}, card ${open ? "open" : "closed"}: each word's spark is drawn whole inside the card and nothing of it touches the frame, the bars or the outside`, () => {
        for (const { run, word } of offers) {
          const sc = lcScreen(run, VIEWS[view]);
          const mk = (sw: boolean) => withEnchant(() => {
            const lc = new LastChancePicker();
            sc.frame(lc); // the first frame fixes the offer's key (a fresh picker starts closed)
            const idx = lc.infoOf(sc.s as never)!.boons.indexOf("part");
            lc.open = open ? idx : -1;
            return sc.frame(lc);
          }, sw);
          const off = mk(false), onF = mk(true);
          const card = onF.ui.regions.find((r) => r.id === "lcpick-part")!.r;
          expect(off.ui.regions.find((r) => r.id === "lcpick-part")!.r, "the card's box").toEqual(card);
          const col = ENCHANT_DEFS[word].color, sp = lcSparkAt(card);
          // the spark's plus is in the word's colour (its middle row and column; the centre may be brighter)
          const plus = [[1, 0], [0, 1], [2, 1], [1, 2]].map(([dx, dy]) => onF.c.at(sp.x + dx, sp.y + dy));
          expect(plus.every((p) => p !== null && p === plus[0]), `${word}: the spark's four arms are one colour`).toBe(true);
          expect(plus[0], `${word}: in the word's colour`).toBe(col);
          const changed = diffPx(onF.c, off.c);
          // what the switch changes: the head band (the word before the name, with its 1 px outline; a shaped part's plate may give way) and the spark's 3 x 3
          const inSpark = ([x, y]: [number, number]): boolean => x >= sp.x && x < sp.x + SPARK_SIZE && y >= sp.y && y < sp.y + SPARK_SIZE;
          const inHead = ([x, y]: [number, number]): boolean => x >= card.x + 5 && y >= card.y + 6 && y <= card.y + 27;
          expect(changed.filter((p) => !inSpark(p) && !inHead(p)), `${word}: only the spark and the head's right part change`).toEqual([]);
          expect(changed.some(inSpark), `${word}: the spark's box changed`).toBe(true);
          const inner = { x0: card.x + 1, y0: card.y + 3, x1: card.x + card.w - 1, y1: card.y + card.h - 3 };
          expect(changed.every(([x, y]) => x >= inner.x0 && x < inner.x1 && y >= inner.y0 && y < inner.y1), `${word}: every changed pixel is inside the card's inner box`).toBe(true);
          // the old place (the frame's top-right corner) is as the switch-off frame draws it
          const ox = card.x + card.w - 5, oy = card.y - 1;
          expect(region(onF.c, ox, oy, 3, 3), `${word}: the old corner is untouched`).toBe(region(off.c, ox, oy, 3, 3));
        }
      });
    }
  }
});
