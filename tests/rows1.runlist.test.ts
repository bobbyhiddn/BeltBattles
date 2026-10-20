// ROWS-1 run 3 (RULING-ROWS1-R1, W1; run 1's question 3, answered "yes: page every list that doesn't fit"): YOUR RUNES' list ("+n" chip) is
// handed the room under the bar on EVERY run, not only an endless-marked one (src/ui/runeBar.ts drawOver). A run has had no day limit since
// 0.9.11: it holds a rune a dawn, LONG_RUN_DEEPEST_DAY (17) by its deepest draw-free dusk, and one more if LAST CHANCE took its rune, so a
// phone's list (with ROWS-1's wrapped rows, 9 px more each) ran off the screen on a run without the endless mark.
//  - a list that fits draws exactly as before: one page, no foot, the same plan and the same pixels as with no limit at all;
//  - a list that doesn't fit pages, with whole rows and the page foot, every rune on exactly one page;
//  - the page buttons of a run without the mark work through the UI's own hit test on the phone, like a marked run's.
// Expectations come from the layout rule (runeListH's 19 px a row, 9 more a wrapped line) and the screens' own geometry, not from the drawing's numbers.
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { RUNES, runeProblem, type RuneDef } from "../src/sim/runes";
import { LONG_RUN_DEEPEST_DAY, LONG_RUN_MAX_DAY } from "../src/sim/longRun";
import { endlessMarked } from "../src/sim/endless";
import { UI } from "../src/ui/ui";
import { TAP_CSS, isPhone, tapPx } from "../src/ui/tap";
import { lineText } from "../src/ui/richText";
import { buildLayout, buildScale, phoneBarLift, phoneScreen } from "../src/screens/build/layout";
import {
  RUNE_LIST_FOOT_MIN, RUNE_LIST_HEAD, RUNE_ROW_H, RuneBar, readoutW, runeCardTextW, runeListH, runeListPlan, runeRowFits, runeRowH, runeRowLines,
  shiftLayout,
} from "../src/ui/runeBar";
import { fresh, G as gOf, installRaster, sig } from "./raster.helpers";

installRaster();
const gcd3 = (a: number, b: number): number => (b ? gcd3(b, a % b) : a);
/** The build screen as the game frames it (tests/card3.test.ts's framed, which is tests/card2.test.ts's). */
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
  const Z = lay(1).cam.z, unit = gcd3(S, Z), sub = S / unit;
  return { S, W, H, L: lay(unit), tap, phone, portrait, view: { W, H, scale: S, dpr, portrait, sub } };
}
type Framed = ReturnType<typeof framed>;

const VIEWS: [string, number, number, number][] = [["desk 1280x800", 1280, 800, 1], ["op690 402x690 @3", 402, 690, 3], ["small 360x640 @2", 360, 640, 2]];
const PHONES = VIEWS.slice(1);
const ALL = Object.values(RUNES);
const cyc = (defs: readonly RuneDef[], n: number): RuneDef[] => Array.from({ length: n }, (_, i) => defs[i % defs.length]);

/** A run on `day` holding `defs`, with or without the endless mark (newRun gives none: ENDLESS ships off). */
function runOf(defs: readonly RuneDef[], day: number, marked: boolean): Run {
  const run = newRun("furnace", 5, `rows1-runlist-${defs.length}-${day}`);
  run.day = day;
  run.build.runes = defs.map((d) => ({ id: d.id })) as never;
  if (marked) (run as unknown as { endless?: boolean }).endless = true;
  else delete (run as unknown as { endless?: boolean }).endless;
  return run;
}

/** One drawOver frame of `bar` for `run` on `f`: the bar's regions and pixels. `roomH`: the screen height drawOver is told (the canvas stays f.H). */
function draw(f: Framed, run: Run, bar: RuneBar, roomH = f.H) {
  const c = fresh(f.W, f.H), ui = new UI();
  const s = { run, game: { W: f.W, H: roomH, view: f.view, ui, canvas: null }, L: f.L, menu: false, touch: false, panelArea: () => f.L.info };
  ui.begin();
  bar.drawOver(gOf(c), s as never);
  ui.end();
  return { c, ui, s };
}
type Frame = ReturnType<typeof draw>;
const regionsOf = (fr: Frame) => fr.ui.regions.map((q) => [q.id, q.r]);

/** The list's own geometry on `f` (the same for any count of one or more runes): where it starts (x, and y under the bar), its width, the room
 *  under the bar (the screen less 4 and the list's top: what drawOver hands runeListPlan), the foot and the text width of a row. */
function geometry(f: Framed) {
  const bar = new RuneBar(), { s } = draw(f, runOf(cyc(ALL, 12), 1, false), bar);
  const B = bar.layout(s as never)!;
  const w = readoutW(f.W), x = Math.round(f.W / 2 - w / 2), y = B.bar.y + B.bar.h + 2;
  const foot = Math.max(RUNE_LIST_FOOT_MIN, isPhone(f.view) ? tapPx(f.view) : 0);
  return { x, y, w, room: f.H - 4 - y, foot, tw: runeCardTextW(w) };
}
type Geo = ReturnType<typeof geometry>;
const rowH = (d: RuneDef, tw: number, day: number): number => RUNE_ROW_H + 9 * (runeRowLines(d, tw, day).length - 1);

/** Tap the region `id` through the UI's own hit test at its centre (the topmost region there must be `id`). */
function tapThrough(fr: Frame, id: string): void {
  const r = fr.ui.regions.find((q) => q.id === id);
  expect(r, `${id} is drawn`).toBeDefined();
  const cx = r!.r.x + Math.floor(r!.r.w / 2), cy = r!.r.y + Math.floor(r!.r.h / 2);
  const hit = fr.ui.hit(cx, cy);
  expect(hit?.id, `the topmost region at ${id}'s centre`).toBe(id);
  hit!.onTap?.();
}

describe("ROWS-1 W1: how many runes a run without the endless mark can hold", () => {
  it("one a dawn through the deepest draw-free dusk (day 17) and LAST CHANCE's one: 18; 26 at the record bound (day 25); the rule's bound is `day + 1`", () => {
    expect(LONG_RUN_DEEPEST_DAY).toBe(17);
    expect(LONG_RUN_MAX_DAY).toBe(25);
    const ids = (n: number) => Array.from({ length: n }, () => ({ id: "x" }));
    // runes.ts runeProblem: more than `day` + (LAST CHANCE's one) is refused at once, by count, before any id is read
    for (const day of [LONG_RUN_DEEPEST_DAY, LONG_RUN_MAX_DAY]) {
      expect(runeProblem(ids(day + 2), day, "furnace", undefined, "atMost", false, 5), `day ${day}: ${day + 2} runes`).toContain("at most one a dawn and one LAST CHANCE");
      expect(runeProblem(ids(day + 1), day, "furnace", undefined, "atMost", false, 5), `day ${day}: ${day + 1} runes pass the count`).not.toContain("at most one a dawn");
      expect(runeProblem(ids(day + 1), day, "furnace"), `day ${day}: with no LAST CHANCE rune, ${day + 1} are one too many`).toContain("at most one a dawn");
    }
    expect([LONG_RUN_DEEPEST_DAY + 1, LONG_RUN_MAX_DAY + 1]).toEqual([18, 26]);
  });
});

describe("ROWS-1 W1: a list that fits is the same as with no limit; one that doesn't is paged by whole rows (every view, 0..70 runes)", () => {
  it("fits: the plan with the room under the bar equals the plan with Infinity (box, layout, rows); doesn't: pages, whole rows, every rune once, the box on the screen", () => {
    let fit = 0, paged = 0, wrappedFit = 0, wrappedPaged = 0;
    for (const [name, w, h, dpr] of VIEWS) {
      const f = framed(w, h, dpr, 12), g = geometry(f);
      for (const day of [1, 10, 17, 25, 50]) {
        // three orders: the catalogue's; the rows that wrap on this view and day first; only the one-line rows
        const wraps = (d: RuneDef) => runeRowLines(d, g.tw, day).length > 1;
        const orders: [string, RuneDef[]][] = [
          ["catalogue", ALL], ["wrapped first", [...ALL.filter(wraps), ...ALL.filter((d) => !wraps(d))]], ["one-line only", ALL.filter((d) => !wraps(d))],
        ];
        for (const [order, base] of orders) {
          for (let n = 0; n <= 70; n++) {
            const defs = cyc(base, n), label = `${name} day ${day} ${order} n ${n}`;
            const none = runeListPlan(defs, g.x, g.y, g.w, Infinity, g.foot, 0, day), now = runeListPlan(defs, g.x, g.y, g.w, g.room, g.foot, 0, day);
            const extra = defs.reduce((a, d) => a + runeRowLines(d, g.tw, day).length - 1, 0);
            if (none.box.h <= g.room) {
              fit++; if (extra > 0) wrappedFit++;
              expect(now, `${label}: it fits, so the plan is the one with no limit`).toEqual(none);
              expect(now.layout.pages, label).toBe(1);
              expect(now.layout.foot, label).toBe(0);
              expect(none.box.h, label).toBe(runeListH(n) + 9 * extra);
            } else {
              paged++; if (extra > 0) wrappedPaged++;
              const L = now.layout, seen: number[] = [], tallest = Math.max(...defs.map((d) => rowH(d, g.tw, day)));
              const roomForRows = g.room - RUNE_LIST_HEAD - g.foot - 2;
              expect(L.pages, label).toBeGreaterThan(1);
              expect(L.foot, label).toBe(g.foot);
              // the box is on the screen whenever the room holds the tallest row and the foot at all
              if (roomForRows >= tallest) expect(now.box.y + now.box.h, `${label}: the box is on the screen`).toBeLessThanOrEqual(f.H - 4);
              for (const p of n % 5 === 0 || n === 18 || n === 26 ? Array.from({ length: L.pages }, (_, i) => i) : [0, L.pages - 1]) {
                const P = runeListPlan(defs, g.x, g.y, g.w, g.room, g.foot, p, day);
                expect(P.page, label).toBe(p);
                expect(P.box, `${label} page ${p}: the same box on every page`).toEqual(now.box);
                let at = g.y + RUNE_LIST_HEAD;
                for (const row of P.rows) {
                  const lines = runeRowLines(defs[row.index], g.tw, day);
                  expect(row.y, `${label} p${p} row ${row.index}: starts where the one above ended`).toBe(at);
                  expect(row.h, `${label} row ${row.index}`).toBe(rowH(defs[row.index], g.tw, day));
                  expect(row.lines.map((q) => lineText(q)), `${label} row ${row.index}: the whole first sentence's lines`).toEqual(lines.map((q) => lineText(q)));
                  at += row.h;
                }
                expect(at, `${label} p${p}: the last row ends above the foot`).toBeLessThanOrEqual(P.box.y + P.box.h - g.foot - 2);
                if (roomForRows >= tallest) expect(at - (g.y + RUNE_LIST_HEAD), `${label} p${p}: the rows fit the room under the title and over the foot`).toBeLessThanOrEqual(roomForRows);
              }
              // every rune on exactly one page, in order: the pages' row ranges tile 0..n
              for (let p = 0; p < L.pages; p++) for (let i = L.starts[p]; i < L.starts[p + 1]; i++) seen.push(i);
              expect(seen, `${label}: every rune on exactly one page`).toEqual(Array.from({ length: n }, (_, i) => i));
            }
          }
        }
      }
    }
    console.info(`ROWS-1 W1 sweep: ${fit} lists fit (${wrappedFit} with a wrapped row), ${paged} paged (${wrappedPaged} with a wrapped row)`);
    expect(fit).toBeGreaterThan(300);
    expect(paged).toBeGreaterThan(900);
    expect(wrappedFit).toBeGreaterThan(30);
    expect(wrappedPaged).toBeGreaterThan(300);
  }, 120_000); // its own limit: 4 s on a quiet host, 8.5 s in a 3-worker batch at load 24, 15 s at load 28, against vitest's 30 s default (standing ruling 1: a time-only red)
});

describe("ROWS-1 W1: from which count the list ran off the screen, by view (held on day n, the day it holds n runes; 26 = day 25 and LAST CHANCE's)", () => {
  it("rows1-base (every row 19 px), bb3f0925d051 (wrapped rows 9 px more each, no limit for this run) and W1 (never: the box always ends on the screen)", () => {
    const table: string[] = [], from: Record<string, { base: number; tip: number; worst: number }> = {};
    for (const [name, w, h, dpr] of VIEWS) {
      const f = framed(w, h, dpr, 12), g = geometry(f);
      let base = -1, tip = -1, worst = -1;
      for (let n = 1; n <= 70; n++) {
        const day = Math.min(n, LONG_RUN_MAX_DAY), defs = cyc(ALL, n);
        // the worst case at bb3f0925d051: the runes whose first sentence wraps most on this view and day, held first
        const wrapLines = (d: RuneDef) => runeRowLines(d, g.tw, day).length;
        const heavy = cyc([...ALL].sort((a, b) => wrapLines(b) - wrapLines(a)), n);
        const tipH = runeListPlan(defs, g.x, g.y, g.w, Infinity, g.foot, 0, day).box.h;
        if (base < 0 && runeListH(n) > g.room) base = n;
        if (tip < 0 && tipH > g.room) tip = n;
        if (worst < 0 && runeListPlan(heavy, g.x, g.y, g.w, Infinity, g.foot, 0, day).box.h > g.room) worst = n;
        // W1: whatever the count, the box ends on the screen (the room holds the tallest row and the foot)
        for (const set of [defs, heavy]) {
          const P = runeListPlan(set, g.x, g.y, g.w, g.room, g.foot, 0, day), tallest = Math.max(...set.map((d) => rowH(d, g.tw, day)));
          if (g.room - RUNE_LIST_HEAD - g.foot - 2 >= tallest) expect(P.box.y + P.box.h, `${name} ${n} runes at W1`).toBeLessThanOrEqual(f.H - 4);
        }
      }
      // the rows that are not whole on the screen (their bottom edge below the canvas's) with 18 runes (day 17 and LAST CHANCE's) and with 26
      // (day 25), the catalogue's first n, drawn as rows1-base (19 px each) and as bb3f0925d051 (wrapped rows taller); W1 pages them: 0
      const off = (n: number, wrapped: boolean): number => {
        const defs = cyc(ALL, n), day = Math.min(n, LONG_RUN_MAX_DAY);
        let y = g.y + RUNE_LIST_HEAD, k = 0;
        for (const d of defs) { const hh = wrapped ? rowH(d, g.tw, day) : RUNE_ROW_H; if (y + hh > f.H) k++; y += hh; }
        return k;
      };
      from[name] = { base, tip, worst };
      table.push(`${name}: canvas ${f.W}x${f.H}, list top y ${g.y}, room ${g.room}, foot ${g.foot}; ran off from ${base} runes at rows1-base, from ${tip} at bb3f0925d051 (the catalogue's first n; ${worst} with the runes that wrap most held first), never at W1; rows not whole on the screen with 18 runes: ${off(18, false)} at rows1-base, ${off(18, true)} at bb3f0925d051; with 26: ${off(26, false)} at rows1-base, ${off(26, true)} at bb3f0925d051`);
    }
    console.info(`ROWS-1 W1 table\n${table.join("\n")}`);
    for (const [name] of VIEWS) {
      const t = from[name];
      expect(t.base, `${name}: the base's list runs off at some count`).toBeGreaterThan(0);
      expect(t.tip, `${name}: wrapped rows only make it sooner`).toBeLessThanOrEqual(t.base);
      expect(t.worst, `${name}: the worst case is no later`).toBeLessThanOrEqual(t.tip);
    }
  });
});

describe("ROWS-1 W1: the page buttons of a run without the endless mark, through the UI's own hit test on the phone", () => {
  for (const [name, w, h, dpr] of PHONES) {
    it(`${name}: 18 runes on day 17 (the most a draw-free run holds): "+k" opens a paged list; > and < turn it by taps; the wheel and the arrows too; a marked run's frames are the same`, () => {
      const f = framed(w, h, dpr, 18), g = geometry(f);
      const wraps = (d: RuneDef) => runeRowLines(d, g.tw, 17).length > 1;
      const defs = [...ALL.filter(wraps), ...ALL.filter((d) => !wraps(d))].slice(0, 18); // wrapped rows among them, so the pages differ in height
      expect(defs.some(wraps), "the list holds a wrapped row").toBe(true);
      const run = runOf(defs, 17, false), marked = runOf(defs, 17, true);
      expect(endlessMarked(run)).toBe(false);
      expect(endlessMarked(marked)).toBe(true);
      const bar = new RuneBar(), mbar = new RuneBar();
      let u = draw(f, run, bar), m = draw(f, marked, mbar);
      expect(u.ui.regions.some((q) => q.id === "rune-more"), "18 runes on a phone are a bar and a +k chip").toBe(true);
      expect(u.ui.regions.some((q) => q.id === "rune-pg-next"), "list closed: no foot").toBe(false);
      tapThrough(u, "rune-more"); tapThrough(m, "rune-more");
      expect([bar.list, bar.page], "the +k tap opens the list on page 1").toEqual([true, 0]);
      u = draw(f, run, bar); m = draw(f, marked, mbar);
      const pages = bar.pages;
      expect(pages, "the list does not fit under the bar, so it pages").toBeGreaterThan(1);
      expect(g.y + runeListH(18) + 9 * defs.filter(wraps).length, "the whole list would run off the screen").toBeGreaterThan(f.H - 4);
      expect(pages).toBe(runeListPlan(defs, g.x, g.y, g.w, g.room, g.foot, 0, 17).layout.pages);
      const seenIdx: number[] = [];
      for (let p = 0; p < pages; p++) {
        const next = u.ui.regions.find((q) => q.id === "rune-pg-next")!, prev = u.ui.regions.find((q) => q.id === "rune-pg-prev")!;
        const panel = u.ui.regions.find((q) => q.id === "rune-readout")!.r;
        expect(panel.y + panel.h, `${name} p${p}: the panel ends on the screen`).toBeLessThanOrEqual(f.H - 4);
        // the foot: a finger's square on a phone (tapPx), inside the panel and the screen
        for (const b of [next, prev]) {
          expect(b.r.h, `${name} p${p}: a button is a finger tall`).toBeGreaterThanOrEqual(tapPx(f.view));
          expect(b.r.w, `${name} p${p}: a button is a finger wide`).toBeGreaterThanOrEqual(Math.min(26, tapPx(f.view)));
          expect([b.r.x >= panel.x, b.r.x + b.r.w <= panel.x + panel.w, b.r.y >= panel.y, b.r.y + b.r.h <= panel.y + panel.h], `${name} p${p}: the button is inside the panel`).toEqual([true, true, true, true]);
        }
        for (const row of runeListPlan(defs, g.x, g.y, g.w, g.room, g.foot, p, 17).rows) seenIdx.push(row.index);
        expect(bar.page).toBe(p);
        // a marked run draws the very same frame (pixels and regions)
        expect(sig(m.c), `${name} page ${p}: a marked run's frame is this frame`).toBe(sig(u.c));
        expect(regionsOf(m), `${name} page ${p}: the same regions`).toEqual(regionsOf(u));
        if (p === 0) { tapThrough(u, "rune-pg-prev"); expect(bar.page, "< on page 1 is disabled: a tap leaves the page").toBe(0); }
        tapThrough(u, "rune-pg-next"); tapThrough(m, "rune-pg-next");
        expect(bar.page, p < pages - 1 ? "> turns the page" : "> on the last page stays").toBe(Math.min(p + 1, pages - 1));
        u = draw(f, run, bar); m = draw(f, marked, mbar);
      }
      expect(seenIdx, "the pages show every rune once, in order").toEqual(Array.from({ length: 18 }, (_, i) => i));
      expect(bar.page).toBe(pages - 1);
      // back by < to page 1, one tap a page
      for (let p = pages - 1; p > 0; p--) { tapThrough(u, "rune-pg-prev"); expect(bar.page).toBe(p - 1); u = draw(f, run, bar); }
      // the wheel (a notch a page, at most one every 0.2 s) and the arrows turn the page of a run without the mark, as of a marked one
      expect(bar.wheel(100, 1)).toBe(true); expect(bar.page).toBe(1);
      expect(bar.wheel(-100, 1.5)).toBe(true); expect(bar.page).toBe(0);
      expect(bar.key("ArrowRight")).toBe(true); expect(bar.page).toBe(1);
      expect(bar.key("PageUp")).toBe(true); expect(bar.page).toBe(0);
      // the panel's body still closes the list (a tap on the panel, off the foot)
      u = draw(f, run, bar);
      const body = u.ui.regions.find((q) => q.id === "rune-readout")!.r, hit = u.ui.hit(body.x + 6, body.y + 6);
      expect(hit?.id).toBe("rune-readout");
      hit!.onTap!();
      expect(bar.list).toBe(false);
    });
  }
});

describe("ROWS-1 W1: a list that fits is the same pixels as with no limit, on every run", () => {
  it("1..26 runes on the three views: when the whole list fits under the bar, the frame is the one drawn with a screen height that never limits it", () => {
    let fit = 0, paged = 0;
    for (const [name, w, h, dpr] of VIEWS) {
      const f = framed(w, h, dpr, 12), g: Geo = geometry(f);
      for (let n = 1; n <= 26; n++) {
        for (const marked of [false, true]) {
          const defs = cyc(ALL, n), day = Math.min(n, LONG_RUN_MAX_DAY);
          const bar = new RuneBar(), open = new RuneBar();
          bar.list = true; open.list = true;
          const real = draw(f, runOf(defs, day, marked), bar), unlimited = draw(f, runOf(defs, day, marked), open, f.H + 5000);
          const whole = runeListPlan(defs, g.x, g.y, g.w, Infinity, g.foot, 0, day).box.h <= g.room;
          if (whole) {
            fit++;
            expect(sig(real.c), `${name} ${n} runes (marked ${marked}): it fits, so the pixels are the unlimited frame's`).toBe(sig(unlimited.c));
            expect(regionsOf(real), `${name} ${n} runes`).toEqual(regionsOf(unlimited));
            expect(bar.pages).toBe(1);
            expect(real.ui.regions.some((q) => q.id === "rune-pg-next")).toBe(false);
          } else {
            paged++;
            expect(bar.pages, `${name} ${n} runes (marked ${marked})`).toBeGreaterThan(1);
            expect(real.ui.regions.some((q) => q.id === "rune-pg-next"), `${name} ${n} runes: the foot`).toBe(true);
          }
        }
      }
    }
    expect(fit).toBeGreaterThan(60);
    expect(paged).toBeGreaterThan(10);
  }, 60_000); // its own limit (1 to 4 s, 2 s in the batch)
});
