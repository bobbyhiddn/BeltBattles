// FIX-099G (REQ-BFG-079, REQ-BFG-081; REVIEW-MERGE099E ruling 1; ref/099g/BRIEF-FIX-099G step 2): a rune card's FRAY and
// BURN word notes on the card's day. 0.9.9 ships HULL_SCALE on, and the damage a player reads on day d is the day's
// (dayShown.ts: dmgNow inside shownOn), as the panels show it (faces.ts REMINDER, abilityText.ts, the KEYWORDS view:
// glossaryRows(day)); CARD-4's rune word notes (glossary.ts RUNE_WORD_NOTE) read the sim's constants on every day. Display
// only: the words are CARD-4's and only the two numbers follow the day; no day, day 1 or the switch off read the constants,
// byte for byte. The LAST CHANCE RUNE card's note (src/screens/lastChancePicker.ts, cap's answer to oracle
// f65b53f23c6b70c1) is driven through the picker itself.
import { afterEach, describe, expect, it, vi } from "vitest";

/** What the screens hand drawRuneWordNote (the LAST CHANCE RUNE card: its word note's lines), recorded as it passes through
 *  to the real function. Only the screens' import is this one; runeBar.ts's own calls (drawRuneCard's) are its own. */
const seen = vi.hoisted(() => ({ notes: [] as { lines: unknown[]; box: unknown }[] }));
vi.mock("../src/ui/runeBar", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/ui/runeBar")>();
  return {
    ...real,
    drawRuneWordNote: (...a: Parameters<typeof real.drawRuneWordNote>) => {
      const box = real.drawRuneWordNote(...a);
      seen.notes.push({ lines: [...a[4]], box });
      return box;
    },
  };
});

import { withHullScale } from "../src/sim/hullScale";
import { BURN_DPS, BURN_TIME, FRAY_BONUS, FRAY_MAX } from "../src/sim/content";
import { FUSE_MAX } from "../src/sim/stars";
import { RUNES, type RuneDef } from "../src/sim/runes";
import { shownOn } from "../src/ui/dayShown";
import { REMINDER } from "../src/ui/faces";
import { RUNE_WORD_NOTE, glossaryRows, runeWordNote } from "../src/ui/glossary";
import { KEYWORD_WORD, runeKeywords, type RuneKeyword } from "../src/ui/runeText";
import { lineText, type RichLine } from "../src/ui/richText";
import {
  drawRuneCard, drawRuneWordNote, runeBarTarget, runeCardH, runeCardTextW, runeHintBand, runeNoteLines, runeNoteY, runeRowFits,
  runeRowH, runeTapOf, runeWordBoxOn, runeWordLines, runeWordTargets, runeWordText, shiftLayout,
} from "../src/ui/runeBar";
import { PICK_TAKE } from "../src/screens/runePicker";
import { LC_BAR, LC_TAKE, LastChancePicker } from "../src/screens/lastChancePicker";
import { buildLayout, buildScale, phoneBarLift, phoneScreen } from "../src/screens/build/layout";
import { TAP_CSS } from "../src/ui/tap";
import { UI, type Rect } from "../src/ui/ui";
import { newRun, type Run } from "../src/game/run";
import { setTipsForTests } from "../src/ui/tips";
import { installRaster, fresh, G as gOf, diffPx } from "./raster.helpers";

installRaster();

type Kw = "FRAY" | "BURN";
const KWS: readonly Kw[] = ["FRAY", "BURN"];
const DAYS = Array.from({ length: 10 }, (_, i) => i + 1);
/** Today's notes (CARD-4's, the sim's constants): the text with no day, on day 1, and on every day with the switch off. */
const TODAY: Readonly<Record<Kw, string>> = {
  FRAY: "FRAY: EACH ONE ADDS +2 DAMAGE TO EVERY LATER SHOT ON THE HULL. MAX 15.",
  BURN: "BURN: EACH ONE DEALS 10 HULL DAMAGE A SEC FOR 3 SEC.",
};
/** The damage number in a note or a panel's reminder: FRAY's "+n DAMAGE", BURN's "n HULL DAMAGE A SEC" (both say it so). */
const NUM: Readonly<Record<Kw, RegExp>> = { FRAY: /\+(\d+) DAMAGE/, BURN: /(\d+) HULL DAMAGE A SEC/ };
function num(k: Kw, s: string | undefined): number {
  const m = NUM[k].exec(s ?? "");
  expect(m, `${k}: ${s}`).not.toBeNull();
  return Number(m![1]);
}
/** The panels' own number on `day`: faces.ts REMINDER (a faced piece's reminder, the KEYWORDS view's row), built on it. */
const panel = (k: Kw, day?: number): number => num(k, shownOn(day, () => REMINDER[k]()));
/** The day's note with CARD-4's words: today's with only its number replaced. */
const withNumber = (k: Kw, n: number): string => (k === "FRAY" ? TODAY.FRAY.replace("+2 DAMAGE", `+${n} DAMAGE`) : TODAY.BURN.replace("DEALS 10 HULL", `DEALS ${n} HULL`));
/** Every rune whose card names the keyword (a word target with a note). */
const withKw = (k: Kw): RuneDef[] => (Object.values(RUNES) as RuneDef[]).filter((d) => runeKeywords(d).includes(k as RuneKeyword));
/** The op view's dawn picker card (233 art px wide, its text 223), opened on `day`. */
const opCard = (def: RuneDef, day?: number): Rect => ({ x: 4, y: 40, w: 233, h: runeCardH(def, 233, { reminder: true, hint: PICK_TAKE, day }) });
/** Wrapped lines back to one text (the breaks were spaces). */
const joined = (ls: readonly RichLine[]): string => ls.map(lineText).join(" ").replace(/\s+/g, " ").trim();

describe("FIX-099G: FRAY's and BURN's rune word notes on the card's day (REQ-BFG-079, REQ-BFG-081)", () => {
  it("with HULL_SCALE on, days 1 to 10: each note's number is faces.ts REMINDER's on that day (and the KEYWORDS view's); its words are CARD-4's", () => {
    const rows: string[] = [];
    withHullScale(() => {
      for (const k of KWS) {
        const got: number[] = [];
        for (const day of DAYS) {
          const note = runeWordNote(k, day)!, n = num(k, note);
          expect(n, `${k} day ${day}: the panel's`).toBe(panel(k, day));
          expect(n, `${k} day ${day}: the KEYWORDS view's`).toBe(num(k, glossaryRows(day).find((r) => r.kw === k)!.def));
          expect(note, `${k} day ${day}: only the number moves`).toBe(withNumber(k, n));
          // a tap on the word on any rune card that names it reads it (runeWordText)
          for (const def of withKw(k)) expect(runeWordText(def, k, day), `${def.id} day ${day}`).toBe(note);
          got.push(n);
        }
        rows.push(`${k} ${got.join(" ")}`);
        expect(got[9], `${k}: day 10's number is the day's, not day 1's`).toBeGreaterThan(got[0]);
      }
      console.log(`FIX-099G notes' numbers on days 1-10 (HULL_SCALE on): ${rows.join("; ")}`);
      for (const day of [1, 5, 10]) console.log(`FIX-099G day ${day}: ${KWS.map((k) => JSON.stringify(runeWordNote(k, day))).join(" ")}`);
    }, true);
  });

  it("day 1 and no day read the constants: today's text, byte for byte; MERGED, LOAD and RIG are as they are on every day", () => {
    expect([FRAY_BONUS, FRAY_MAX, BURN_DPS, BURN_TIME]).toEqual([2, 15, 10, 3]);
    withHullScale(() => {
      for (const k of KWS) {
        expect(RUNE_WORD_NOTE[k], k).toBe(TODAY[k]);
        expect(num(k, TODAY[k]), `${k}: the panel with no day`).toBe(panel(k));
        for (const day of [undefined, 1]) {
          expect(runeWordNote(k, day), `${k} day ${day}`).toBe(TODAY[k]);
          expect(panel(k, day), `${k} day ${day}: the panel`).toBe(num(k, TODAY[k]));
          for (const def of withKw(k)) {
            expect(runeWordText(def, k, day), `${def.id} day ${day}`).toBe(TODAY[k]);
            for (const t of runeWordTargets(opCard(def, day), def, [], 0, day)) if (t.k === k) expect(t.text, `${def.id} day ${day}`).toBe(TODAY[k]);
          }
        }
        // the calls with no day argument at all (every caller before this fix)
        for (const def of withKw(k)) expect(runeWordText(def, k), def.id).toBe(TODAY[k]);
      }
      const words: Record<string, string> = {
        MERGED: `MERGED: A ★${FUSE_MAX - 1} OR ★${FUSE_MAX} PIECE, MADE BY MERGING COPIES.`,
        LOAD: "LOAD: ONE SLUG A TURRET TAKES IN FROM A BELT.",
        RIG: "RIG: A PART BESIDE A BELT. ITS ARROWS WORK THE BELT TILES THEY POINT AT.",
      };
      expect(Object.keys(RUNE_WORD_NOTE).sort()).toEqual(["BURN", "FRAY", "LOAD", "MERGED", "RIG"]);
      for (const [k, t] of Object.entries(words)) {
        expect(RUNE_WORD_NOTE[k], k).toBe(t);
        for (const day of [undefined, ...DAYS]) expect(runeWordNote(k, day), `${k} day ${day}`).toBe(t);
      }
      // a keyword with no note has none on any day (runeWordText goes on to its reminder, as before)
      for (const day of [undefined, 1, 7]) expect(runeWordNote("HEAT", day)).toBeUndefined();
    }, true);
  });

  it("with the switch off every day reads the constants: the notes, the panels, a card's taps and its word targets", () => {
    withHullScale(() => {
      for (const k of KWS) for (const day of [undefined, ...DAYS]) {
        expect(runeWordNote(k, day), `${k} day ${day}`).toBe(TODAY[k]);
        expect(panel(k, day), `${k} day ${day}: the panel`).toBe(num(k, TODAY[k]));
        for (const def of withKw(k)) {
          expect(runeWordText(def, k, day), `${def.id} day ${day}`).toBe(TODAY[k]);
          for (const t of runeWordTargets(opCard(def, day), def, [], 0, day)) if (t.k === k) expect(t.text, `${def.id} day ${day}`).toBe(TODAY[k]);
        }
      }
    }, false);
  });

  it("runeWordTargets(..., day): every FRAY and BURN target's text is the day's note, on the desk's targets and a finger's", () => {
    let n = 0, moved = 0;
    const runes: string[] = [];
    withHullScale(() => {
      for (const k of KWS) for (const def of withKw(k)) {
        runes.push(`${def.id} (${k})`);
        for (const day of DAYS) for (const tap of [0, 17]) {
          const ts = runeWordTargets(opCard(def, day), def, [], tap, day).filter((t) => t.k === k);
          expect(ts.length, `${def.id} day ${day} tap ${tap}: its ${k} target`).toBeGreaterThan(0);
          for (const t of ts) {
            expect(t.text, `${def.id} ${k} day ${day}`).toBe(runeWordNote(k, day));
            expect(num(k, t.text), `${def.id} ${k} day ${day}: the panel's number`).toBe(panel(k, day));
            if (t.text !== TODAY[k]) moved++;
            n++;
          }
        }
      }
    }, true);
    console.log(`FIX-099G word targets: ${n} FRAY/BURN targets on ${runes.length} runes (${runes.join(", ")}), days 1-10, tap 0 and 17; ${moved} read a number other than day 1's`);
    expect(n).toBeGreaterThan(0);
    expect(moved).toBeGreaterThan(0);
  });

  it("day 10: the word box holds the day's lines, the very lines the card draws (every FRAY and BURN rune, the five pinned phones and the desk); the TAP AGAIN target's top follows the box", () => {
    let n = 0, grew = 0;
    withHullScale(() => {
      for (const [name, w, h, dpr] of [...PHONES, DESK]) {
        const f = framed(w, h, dpr, 0), tap = dpr > 1 ? f.tap : 0, cardW = Math.min(f.W - 8, 300), tw = runeCardTextW(cardW);
        for (const k of KWS) for (const def of withKw(k)) {
          const word = KEYWORD_WORD[k as RuneKeyword], at = `${name} ${def.id} ${word}`;
          const card = { x: 4, y: 40, w: cardW, h: runeCardH(def, cardW, { reminder: true, hint: PICK_TAKE, tap, day: 10 }) };
          const lines = runeWordLines(def, k as RuneKeyword, tw, 10), day1 = runeWordLines(def, k as RuneKeyword, tw);
          expect(joined(lines), at).toBe(runeWordNote(k, 10));
          const box = runeWordBoxOn(card, def, word, 10)!;
          expect(box.h, `${at}: the day's lines`).toBe(lines.length * 7 + 3);
          expect(box.y >= card.y + 31 && box.y + box.h <= card.y + card.h, `${at}: the box in the card`).toBe(true);
          if (lines.length !== day1.length) grew++;
          // the TAP AGAIN target's top: the foot of the day's box, or its band's (runeBarTarget, as the pickers use it)
          expect(runeBarTarget(card, PICK_TAKE, tap, box).y, at).toBe(Math.max(runeHintBand(card, tap).y + 1, box.y + box.h));
          // drawRuneCard with the word open draws exactly these lines in exactly this box: the same pixels as the card with
          // its room clear and then this box with these lines; and not day 1's lines
          const cw = card.x + card.w + 4, ch = card.y + card.h + 4, room = runeNoteLines(def, tw).length, y = runeNoteY(card, def, 10);
          const a = fresh(cw, ch), b = fresh(cw, ch), c = fresh(cw, ch);
          drawRuneCard(gOf(a), card, def, { sub: "FIX-099G", reminder: true, word, day: 10 });
          drawRuneCard(gOf(b), card, def, { sub: "FIX-099G", reminder: true, word: null, day: 10 });
          drawRuneWordNote(gOf(b), card, y, room, lines);
          drawRuneCard(gOf(c), card, def, { sub: "FIX-099G", reminder: true, word: null, day: 10 });
          drawRuneWordNote(gOf(c), card, y, room, day1);
          expect(diffPx(a, b), `${at}: the card draws the day's lines`).toEqual([]);
          expect(diffPx(a, c).length, `${at}: not day 1's`).toBeGreaterThan(0);
          n++;
        }
      }
    }, true);
    console.log(`FIX-099G day-10 boxes: ${n} (view, rune) cards checked; ${grew} where day 10's note takes another line count than day 1's`);
    expect(n).toBeGreaterThan(50);
  });
});

describe("FIX-099G: LAST CHANCE's RUNE card on a late dawn (cap's answer to oracle f65b53f23c6b70c1)", () => {
  afterEach(() => setTipsForTests("reload"));

  it("day 7 (and day 1 beside it): DOUBLE KNOT's FRAY and EMBER SHOT's BURN note as drawn is the day's, its number the panel's; its box holds the drawn lines; the TAP AGAIN target's top follows the box as on day 1", () => {
    setTipsForTests("done"); // no note opens by itself: the word's own tap opens it
    const rows: string[] = [];
    for (const [name, w, h, dpr] of [PHONES[0], DESK]) {
      const touch = dpr > 1;
      for (const [id, k] of [["double_knot", "FRAY"], ["ember_shot", "BURN"]] as const) {
        expect(runeKeywords(RUNES[id]), id).toContain(k);
        const shown: Record<number, string> = {};
        for (const day of [1, 7]) withHullScale(() => {
          const at = `${name} ${id} day ${day}`;
          const run = newRun("weaver", 5, `fix099g-lc-${name}-${id}-${day}`);
          run.day = day;
          (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 6 };
          const sc = screenOf(run, w, h, dpr, touch), lc = new LastChancePicker();
          lc.offer = (x) => { const o = Object.getPrototypeOf(lc).offer.call(lc, x); return o ? { ...o, rune: { ...(o.rune ?? {}), id } } : o; };
          sc.frame(lc as never);
          sc.press(lc, "lcpick-rune");
          let ui = sc.frame(lc as never);
          const wr = ui.regions.find((r) => r.id.startsWith("lcrune-w") && r.id.endsWith(`:${k}`));
          expect(wr, `${at}: the word's target`).toBeDefined();
          sc.press(lc, wr!.id);
          expect([lc.open, lc.word], at).toEqual([0, k]);
          seen.notes.length = 0;
          ui = sc.frame(lc as never);
          expect(seen.notes.length, `${at}: one note drawn`).toBe(1);
          const lines = seen.notes[0].lines as RichLine[], text = joined(lines);
          const card = ui.regions.find((r) => r.id === "lcpick-rune")!.r;
          expect(lines, `${at}: the day's lines`).toEqual(runeWordLines(RUNES[id], k, card.w - 10, day));
          expect(text, at).toBe(runeWordNote(k, day));
          expect(num(k, text), `${at}: the panel's number`).toBe(panel(k, day));
          // its box (the region a press on it hits) is the drawn one, as tall as its lines
          const box = ui.regions.find((r) => r.id === "lcrune-def")!.r;
          expect(box, at).toEqual(seen.notes[0].box);
          expect(box.h, at).toBe(lines.length * 7 + 3);
          // the TAP AGAIN target's top follows that box, by the same rule on both days
          const tap = runeTapOf(sc.s as never), bar = ui.regions.find((r) => r.id === LC_BAR)!.r;
          expect(bar, at).toEqual(runeBarTarget(card, LC_TAKE, tap, box));
          expect(bar.y, at).toBe(Math.max(runeHintBand(card, tap).y + 1, box.y + box.h));
          if (touch) expect(bar.h * (sc.f.S / dpr), at).toBeGreaterThanOrEqual(TAP_CSS);
          shown[day] = text;
        }, true);
        expect(shown[1], `${name} ${id}: day 1, today's text`).toBe(TODAY[k]);
        expect(shown[7], `${name} ${id}: day 7, the day's`).toBe(withNumber(k, withHullScale(() => panel(k, 7), true)));
        expect(shown[7]).not.toBe(shown[1]);
        rows.push(`${name} ${id} day 7: ${JSON.stringify(shown[7])}`);
      }
    }
    console.log(`FIX-099G LAST CHANCE: ${rows.join("; ")}`);
  });
});

// ---- the build screen as the game frames it (tests/card4.test.ts's framed and screenOf) ---------------------------------

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const fake = { run: { build: { runes: Array.from({ length: runes }, () => ({ id: "many_hands" })) } }, refit: false, offers: () => Array.from({ length: offers }) } as unknown as Parameters<typeof runeRowFits>[0];
  let S = buildScale(pw, ph, portrait, dpr);
  while (S > 1 && !runeRowFits(fake, pw, ph, portrait, S, dpr)) S--;
  const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
  const v = { scale: S, dpr }, W = Math.floor(pw / S), H = Math.floor(ph / S);
  const lay = (unit: number) => {
    const row = runeRowH(v, runes), lift = phone ? phoneBarLift(W, H, offers, tap, runeRowH(v, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, offers, phone, tap, lift, { scale: S, unit }), row, H);
  };
  const Z = lay(1).cam.z, unit = gcd(S, Z), sub = S / unit;
  return { S, W, H, L: lay(unit), tap, phone, portrait, view: { W, H, scale: S, dpr, portrait, sub } };
}
/** The pinned phone views (tests/card2.test.ts's PHONES) and the desk (tests/card4.test.ts's DESK). */
const PHONES: [string, number, number, number][] = [
  ["op-402x690", 402, 690, 3], ["phone-390x844", 390, 844, 3], ["phone-390x660", 390, 660, 3], ["iphone15pm-430x739", 430, 739, 3], ["land-844x390", 844, 390, 3],
];
const DESK: [string, number, number, number] = ["desk-1920x1080", 1920, 1080, 1];
function screenOf(run: Run, w: number, h: number, dpr: number, touch: boolean) {
  const f = framed(w, h, dpr, 0);
  const ui = new UI();
  ui.pointer.kind = touch ? "touch" : "mouse";
  const s = {
    run, refit: false, touch, L: f.L, t: 0,
    game: { W: f.W, H: f.H, ui, view: f.view, canvas: null, error: () => {}, resize: () => {}, toast: () => {} },
    touched: () => {}, lcHeartT: Infinity,
  };
  const frame = (p: { draw: (g: ReturnType<typeof gOf>, s: never) => void }) => {
    ui.begin();
    p.draw(gOf(fresh(f.W, f.H)), s as never);
    ui.end();
    return ui;
  };
  /** A press and its release on region `id` as the game routes them: the screen's pressed first, then the region's tap. */
  const press = (p: { pressed: (r: string | null) => void }, id: string) => {
    p.pressed(id);
    ui.regions.find((q) => q.id === id)?.onTap?.();
  };
  return { s, f, ui, frame, press };
}
