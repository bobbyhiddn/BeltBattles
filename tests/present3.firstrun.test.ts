// PRESENT-3 H (REQ-BFG-081; PRESENT-1's old item list, PRESENT-2 run 1's Question 5; cap's call): in the first-run state (every tip new: the how-to strip just under a phone's panel) CARD-4's notes covered the deck's
// top rows: a note that went to defBoxPlace's last candidate, just under the strip, ended 1-10 px into the deck (402x690 with a rune: 411 tapped notes and 230 first sights; 390x660: 612 and 622; the other
// three views none; tips done: none). keywords.ts deckClear moves such a note UP until it ends at the deck's top (whole px), no higher than the panel's foot; where it then overlaps the strip, the strip is not
// drawn while it shows (from the note's first frame, back when it closes, never moved: ruling 0d0ef2465804aafb item 2, as at the growth limit). Every other note keeps its box.
// The harness is tests/present1.s4b.test.ts's (the 1,197 panels a finger can open, the five phone views).
import { describe, expect, it } from "vitest";
import { newRun } from "../src/game/run";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { UI, type Rect } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, phoneBarLift, phoneScreen, panelArea, screenRect, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { DECK } from "../src/render/frame";
import { C } from "../src/render/palette";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import type { Run, DuskFoe } from "../src/game/run";
import { setTipsForTests } from "../src/ui/tips";
import { buyableModules } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { key as KEY, rotField, setTurretList, turretSlots, type Placed } from "../src/sim/deck";
import { detailsPlan, drawDetails, fullText, gapsAtLeast, hintStrip, keptWhole, panelFit, rulesCovered, visibleLines } from "../src/screens/build/inspector";
import { keywordState, keywordsIdle, keywordsPressed } from "../src/screens/build/keywords";
import { glossaryEntry } from "../src/ui/glossary";
import type { Ctx } from "../src/screens/build/actions";

installRaster();

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it (tests/card2.test.ts's framed). */
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

/** The views the ruling names: [label, w, h, dpr, runes held]. */
const VIEWS: [string, number, number, number, number][] = [
  ["op-402x690, no rune", 402, 690, 3, 0], ["op-402x690, a rune", 402, 690, 3, 1], ["phone-390x844", 390, 844, 3, 1],
  ["phone-390x660", 390, 660, 3, 1], ["iphone15pm-430x739", 430, 739, 3, 1],
];

/** The boxes that still cover a rule row where the panel has grown as far as it may (up to the top bar, never over the carrier: panelArea's limit):
 *  the tall turret panels (a turret with a core and gear), whose rows already fill the limit. PRESENT-1 run 3 listed them (72, 72, 0, 30, 6: fits false).
 *  PRESENT-2 L (cap's ruling 0d0ef2465804aafb): there the note hangs just under the lowest rule row (keywords.ts hangPlace), so none is left: 0 on every view. */
const STUCK: Record<string, number> = {
  "op-402x690, no rune": 0, "op-402x690, a rune": 0, "phone-390x844": 0, "phone-390x660": 0, "iphone15pm-430x739": 0,
};
/** The same panels' first-sight notes (two a panel: the chain's first two) that stay stuck at the limit, per view (F); PRESENT-1 run 3: 24, 24, 0, 10, 2 (and with the strip: 24, 24, 0, 10, 2). */
const STUCK_F: Record<string, number> = {
  "sight op-402x690, no rune": 0, "sight op-402x690, a rune": 0, "sight phone-390x844": 0, "sight phone-390x660": 0, "sight iphone15pm-430x739": 0,
  "new op-402x690, no rune": 0, "new op-402x690, a rune": 0, "new phone-390x844": 0, "new phone-390x660": 0, "new iphone15pm-430x739": 0,
};
/** PRESENT-2 L (cap's ruling 0d0ef2465804aafb): the notes that hang over the carrier's top edge (the bow pieces' barrels, the pad's margin, the hull's top plate) while they show,
 *  per view: [the count, the deepest px into the carrier's pad]. T: every keyword's tapped note; F: the first-sight notes (the chain's first two a panel).
 *  PRESENT-3 E (re-pinned old -> new): the tall turret panels (a core and gear) fold their EMPTY gear rows, so none reaches the growth limit and no note hangs: T was 10 (9 px), 10 (9 px), 0,
 *  6 (12 px), 0 and the first sights on 390x660 2 (3 px); all [0, 0] now. */
const OVER: Record<string, [number, number]> = {
  "T op-402x690, no rune": [0, 0], "T op-402x690, a rune": [0, 0], "T phone-390x844": [0, 0], "T phone-390x660": [0, 0], "T iphone15pm-430x739": [0, 0],
  "sight op-402x690, no rune": [0, 0], "sight op-402x690, a rune": [0, 0], "sight phone-390x844": [0, 0], "sight phone-390x660": [0, 0], "sight iphone15pm-430x739": [0, 0],
  "new op-402x690, no rune": [0, 0], "new op-402x690, a rune": [0, 0], "new phone-390x844": [0, 0], "new phone-390x660": [0, 0], "new iphone15pm-430x739": [0, 0],
};
/** PRESENT-2 L: the first-sight notes whose place overlaps the how-to strip (only where every tip is new: "new"): the strip is not drawn while the note shows, per view (F).
 *  PRESENT-3 E (re-pinned old -> new): was 24, 24, 0, 10, 0 (the notes that hung under the last rule row of a panel at the limit); none hangs now, so none yields the strip. */
const YIELDS: Record<string, number> = {
  "new op-402x690, no rune": 0, "new op-402x690, a rune": 0, "new phone-390x844": 0, "new phone-390x660": 0, "new iphone15pm-430x739": 0,
};
/** PRESENT-2 F (REQ-BFG-081; PRESENT-1 Question 4 (d) (ii)): a panel grown up from the band for a note keeps the band's 3x5 face where the band shows its whole text in it (inspector.ts
 *  detailsPlanOf's `small`). T, per view: [the notes whose grown panel still changed the body's face (panels that grow for their own text), the growth's total px over every box].
 *  Before F (PRESENT-1's tip 4656d58630ee and PRESENT-2 at f48f9b7e: the same counts): faces 21, 533, 137, 55, 24 and the totals 8,784, 61,280, 8,688, 35,840, 10,226. After F (PRESENT-2): 8,328,
 *  57,050, 5,172, 34,904, 9,620. At present3-base (POLISH-1 and ROWS-1 merged; the pins above were red there): 8,400, 57,056, 5,172, 35,120, 9,656.
 *  PRESENT-3 E (re-pinned old -> new): the tall turret panels now fold their EMPTY gear rows, so they no longer sit at the growth limit and grow for a note like every other panel (where they
 *  hung before): the totals rise on four views (the same boxes, now placed by growing: 8,400 -> 9,126, 57,056 -> 57,732, 5,172 -> 5,622, 35,120 -> 36,138; 9,656 -> 9,540 falls). */
const FACES: Record<string, [number, number]> = {
  "op-402x690, no rune": [0, 9126], "op-402x690, a rune": [4, 57732], "phone-390x844": [0, 5622], "phone-390x660": [2, 36138], "iphone15pm-430x739": [0, 9540],
};
const ov = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** What a note never covers (cap's ruling 0d0ef2465804aafb): the deck's cells, FIGHT, the cargo bar, the top bar. */
const hardRects = (L: BuildLayout): Record<string, Rect> => ({ deck: screenRect(L, { x: L.frame.dx, y: L.frame.dy, w: DECK, h: DECK }), FIGHT: L.fight, cargo: L.cargo, bar: L.bar });

/** A build screen's panel context (tests/card3.test.ts's panelCtx), with the area planned for every frame as BuildScreen.panelArea does. */
function panelCtx(run: Run, sel: Sel, f: ReturnType<typeof framed>, touch: boolean) {
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const areaNow = (): Rect => panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  /** One frame: the area planned now, the panel drawn in it; its regions, the area and the plan it was drawn from. */
  const draw = () => {
    const ui = (ctx.game as unknown as { ui: UI }).ui;
    ui.pointer.kind = touch ? "touch" : "mouse";
    Object.assign(ui.pointer, { x: -1, y: -1, down: false });
    const area = areaNow();
    ui.begin();
    const cv = fresh(f.W, f.H);
    drawDetails(gOf(cv), ctx, sel, null, area, {} as DuskFoe);
    ui.end();
    return { ui, area, d: detailsPlan(ctx, sel, null, area), cv };
  };
  return { ctx, draw, areaNow };
}

const CARGO: Sel = { kind: "cargo", uid: 900 };
const SHORTB = [KEY(4, 5), KEY(4, 4), KEY(4, 3), KEY(4, 2), KEY(4, 1), KEY(4, 0)];
const rigAt = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed => ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
function furnaceRun(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "card4-panels");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORTB] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 2;
  return run;
}
/** Every panel a finger can open (tests/card3.test.ts's allPanels: explain1's 899). */
function allPanels(): { id: string; run: Run; sel: Sel }[] {
  const out: ReturnType<typeof allPanels> = [];
  const OFFER: Sel = { kind: "offer", wagon: 0, slot: 0 };
  for (const d of buyableModules()) {
    const stars = fusible(d.id) ? [1, 2, 3] : [1];
    const o = furnaceRun();
    o.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id}`, run: o, sel: OFFER });
    for (const s of stars) {
      const c = furnaceRun();
      c.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
      out.push({ id: `cargo ${d.id} ★${s}`, run: c, sel: CARGO });
      if (d.kind === "gate") {
        for (const [x, y, rot] of [[3, 3, 1], [0, 9, 0], [5, 3, 0]] as const) out.push({ id: `${d.id} ★${s} @${x},${y}`, run: furnaceRun([rigAt(10, d.id, x, y, rot, s)]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "factory") {
        out.push({ id: `${d.id} ★${s}`, run: furnaceRun([{ uid: 10, def: d.id, x: 0, y: 6, ...(s > 1 ? { stars: s } : {}) }]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "mod" || d.kind === "core") {
        for (const hero of ["furnace", "weaver"] as const) {
          const run = newRun(hero, 5, "card4-fit");
          run.build.mods = [{ uid: 950, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) }];
          out.push({ id: `${d.id} ★${s} fitted on ${hero}`, run, sel: { kind: "fitted", uid: 950 } });
        }
      } else if (d.kind === "turret") {
        const run = furnaceRun();
        setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: d.id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
        run.build.mods = [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }];
        out.push({ id: `turret ${d.id} ★${s} with a core and gear`, run, sel: { kind: "turret", index: 1 } });
      }
    }
  }
  for (const hero of PLAYABLE_HEROES) {
    const run = newRun(hero, 5, "card4-start");
    for (const p of run.build.items) out.push({ id: `${hero}'s starting ${p.def}`, run, sel: { kind: "item", uid: p.uid } });
    if (turretSlots(run.build)[0]?.turret) out.push({ id: `${hero}'s starting turret`, run, sel: { kind: "turret", index: 0 } });
    run.build.routes.forEach((_, i) => out.push({ id: `${hero}'s belt ${i + 1}`, run, sel: { kind: "route", index: i } }));
  }
  out.push({ id: "the KILN's belt", run: furnaceRun(), sel: { kind: "route", index: 0 } });
  return out;
}

/** The fit before this change (inspector.ts panelFit at 9daf7e43): the panel's text whole, and on a phone its gaps. */
const fitBefore = (ctx: Ctx, sel: Sel, phone: boolean) => (r: Rect, at: "band" | "grown" = "band"): boolean | null => {
  const d = detailsPlan(ctx, sel, null, r);
  if (!d) return null;
  if (!phone) return keptWhole(d.plan);
  return fullText(d.plan) && gapsAtLeast(d.plan, at === "band" ? d.plan.gaps.min : d.plan.gaps.G);
};
const RULE_ROLES = new Set(["ability", "hits", "warn", "next", "merges", "merge", "row", "grid", "note"]);
interface Row { y: number; h: number; role: string; text: string }
/** The body rows a plan draws (not its dividers): their glyph rows, role and text. */
const rowsOf = (plan: Parameters<typeof visibleLines>[0]): Row[] => visibleLines(plan).filter((v) => v.line !== "rule").map((v) => {
  const l = v.line as unknown as { font: string; block: { role: string; text: string } };
  return { y: v.y, h: l.font === "5" ? 7 : 5, role: l.block.role, text: l.block.text };
});
/** The rule rows a box covers: the box and the row's glyph rows share a pixel row (run 2's scan, unchanged). */
const covered = (box: Rect, rows: Row[]): Row[] => rows.filter((r) => RULE_ROLES.has(r.role) && r.y < box.y + box.h && box.y < r.y + r.h);
const kwWords = (ui: UI): string[] => [...new Set(ui.regions.filter((q) => /^kw:\d+:/.test(q.id)).map((q) => q.id.split(":")[2]))];
const boxOf = (ui: UI): Rect | null => ui.regions.find((q) => q.id === "kwdef")?.r ?? null;
const BIG = 3_600_000;

const OVER_DECK_BEFORE_T: Record<string, number> = { "op-402x690, no rune": 0, "op-402x690, a rune": 411, "phone-390x844": 0, "phone-390x660": 612, "iphone15pm-430x739": 0 };
const OVER_DECK_BEFORE_F: Record<string, number> = { "op-402x690, no rune": 0, "op-402x690, a rune": 230, "phone-390x844": 0, "phone-390x660": 622, "iphone15pm-430x739": 0 };
/** [notes moved up (ending flush at the deck's top), of them the notes that land on the strip (the strip yields)], T = tapped, F = first sights. */
const MOVED_T: Record<string, [number, number]> = { "op-402x690, no rune": [0, 0], "op-402x690, a rune": [411, 411], "phone-390x844": [0, 0], "phone-390x660": [612, 27], "iphone15pm-430x739": [0, 0] };
const MOVED_F: Record<string, [number, number]> = { "op-402x690, no rune": [0, 0], "op-402x690, a rune": [230, 230], "phone-390x844": [0, 0], "phone-390x660": [622, 27], "iphone15pm-430x739": [0, 0] };

describe("PRESENT-3 H: a first-run note covers no deck cell", () => {
  for (const [name, w, h, dpr, runes] of VIEWS) it(`T on ${name}: every keyword's tapped note, every tip new (the strip under the panel), covers 0 deck cells; the notes moved up land at the deck's top with the strip yielding where they overlap it`, () => {
    const f = framed(w, h, dpr, runes), hard = hardRects(f.L), deckTop = Math.floor(hard.deck.y);
    let boxes = 0, onDeck = 0, moved = 0, onStrip = 0;
    const bad: string[] = [];
    for (const p of allPanels()) {
      setTipsForTests("new");
      const pc = panelCtx(p.run, p.sel, f, true);
      const plain = pc.draw();
      if (!plain.d) continue;
      for (const wd of kwWords(plain.ui)) {
        const st = keywordState(pc.ctx) as { word: string | null };
        st.word = glossaryEntry(wd)?.word ?? wd;
        const fr = pc.draw(), box = boxOf(fr.ui);
        st.word = null;
        if (!box || !fr.d) continue;
        boxes++;
        if (ov(box, hard.deck)) { onDeck++; bad.push(`${p.id} | ${wd}: box y ${box.y}-${box.y + box.h} covers the deck (top ${hard.deck.y})`); }
        const plan = fr.d.plan, strip = fr.d.hint ? hintStrip(fr.d.hint, plan.r, f.H).r : null;
        if (box.y + box.h === deckTop && box.y >= plan.r.y + plan.r.h) {
          moved++;
          // a moved note is under the panel's foot (no row, header or word of the panel is covered), a whole-px box, and the strip is where it was
          if (covered(box, rowsOf(plan)).length) bad.push(`${p.id} | ${wd}: the moved box covers a rule row`);
          if (!Number.isInteger(box.y)) bad.push(`${p.id} | ${wd}: the moved box is on a fractional y ${box.y}`);
          if (strip) {
            const drawn = fr.cv.at(strip.x + 1, strip.y + 1) === C.night;
            if (ov(box, strip)) { onStrip++; if (drawn) bad.push(`${p.id} | ${wd}: the box is on the strip and the strip is still drawn`); }
            else if (!drawn) bad.push(`${p.id} | ${wd}: the box is clear of the strip and the strip is not drawn`);
          }
        }
        // the place is chosen once, from the note's first frame: another frame of the same note is the same box
        if (boxes % 97 === 0) st.word = glossaryEntry(wd)?.word ?? wd, expect(boxOf(pc.draw().ui), `${p.id} | ${wd}: the same box on another frame`).toEqual(box), st.word = null;
      }
      keywordsIdle(pc.ctx);
    }
    // eslint-disable-next-line no-console
    console.log(`PRESENT-3 H T ${name}: ${boxes} tapped notes, tips new; ${onDeck} cover a deck cell (before ${OVER_DECK_BEFORE_T[name]}); ${moved} end flush at the deck's top, ${onStrip} of them on the strip`);
    expect(boxes).toBeGreaterThan(3000);
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
    expect(onDeck).toBe(0);
    expect([moved, onStrip], `T ${name}: [moved up, on the strip]`).toEqual(MOVED_T[name]);
  }, BIG);

  for (const [name, w, h, dpr, runes] of VIEWS) it(`F on ${name}: every first sight (every tip new) covers 0 deck cells; the strip is drawn exactly where the note is off it, and is back in the frame the last note closes`, () => {
    const f = framed(w, h, dpr, runes), hard = hardRects(f.L), deckTop = Math.floor(hard.deck.y);
    let notes = 0, onDeck = 0, moved = 0, onStrip = 0;
    const bad: string[] = [];
    for (const p of allPanels()) {
      setTipsForTests("new");
      const pc = panelCtx(p.run, p.sel, f, true);
      let prev = pc.draw();
      if (!prev.d) continue;
      for (let n = 0; n < 16; n++) {
        const box = boxOf(prev.ui);
        if (!box && !prev.ui.regions.some((q) => q.id === "kwsight")) break;
        if (box) {
          notes++;
          const plan = prev.d!.plan, strip = prev.d!.hint ? hintStrip(prev.d!.hint, plan.r, f.H).r : null;
          if (ov(box, hard.deck)) { onDeck++; bad.push(`${p.id}: note ${n + 1} box y ${box.y}-${box.y + box.h} covers the deck`); }
          if (box.y + box.h === deckTop && box.y >= plan.r.y + plan.r.h) {
            moved++;
            if (strip) {
              const drawn = prev.cv.at(strip.x + 1, strip.y + 1) === C.night;
              if (ov(box, strip)) { onStrip++; if (drawn) bad.push(`${p.id}: note ${n + 1} is on the strip and the strip is drawn`); } else if (!drawn) bad.push(`${p.id}: note ${n + 1} is off the strip and the strip is not drawn`);
            }
          }
        }
        keywordsPressed(pc.ctx, null);
        prev = pc.draw();
      }
      // the strip a note hid is back in the frame the last note closes (its tip is still new: only the action completes it)
      if (prev.d?.hint && boxOf(prev.ui) === null && !prev.ui.regions.some((q) => q.id === "kwsight")) {
        const st = hintStrip(prev.d.hint, prev.d.plan.r, f.H).r;
        if (prev.cv.at(st.x + 1, st.y + 1) !== C.night) bad.push(`${p.id}: the strip is not back after the last note closed`);
      }
      keywordsIdle(pc.ctx);
    }
    // eslint-disable-next-line no-console
    console.log(`PRESENT-3 H F ${name}: ${notes} first-sight notes; ${onDeck} cover a deck cell (before ${OVER_DECK_BEFORE_F[name]}); ${moved} end flush at the deck's top, ${onStrip} of them on the strip`);
    expect(notes).toBeGreaterThan(1000);
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
    expect(onDeck).toBe(0);
    expect([moved, onStrip], `F ${name}: [moved up, on the strip]`).toEqual(MOVED_F[name]);
  }, BIG);

  it("tips done: no strip, and no note covers a deck cell on any view (as before)", () => {
    for (const [name, w, h, dpr, runes] of VIEWS.filter((v) => v[0] !== "op-402x690, no rune")) {
      const f = framed(w, h, dpr, runes), hard = hardRects(f.L);
      let boxes = 0;
      for (const p of allPanels().filter((q, i) => i % 7 === 0)) {
        setTipsForTests("done");
        const pc = panelCtx(p.run, p.sel, f, true);
        const plain = pc.draw();
        if (!plain.d) continue;
        for (const wd of kwWords(plain.ui)) {
          const st = keywordState(pc.ctx) as { word: string | null };
          st.word = glossaryEntry(wd)?.word ?? wd;
          const fr = pc.draw(), box = boxOf(fr.ui);
          st.word = null;
          if (!box) continue;
          boxes++;
          expect(ov(box, hard.deck), `${name} ${p.id} | ${wd}`).toBe(false);
        }
        keywordsIdle(pc.ctx);
      }
      expect(boxes, name).toBeGreaterThan(400);
    }
  }, BIG);
});
