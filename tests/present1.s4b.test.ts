// PRESENT-1 (REQ-BFG-081; S4 (b), cap's ruling af2c96863a44ab41): on a portrait phone a shown definition (a tap's or a first sight's) never covers
// any rule row of its panel. The panel counts the note in its fit (inspector.ts panelFit, keywords.ts definitionAhead): where the band cannot hold
// the rows plus the box clear under them, it grows up over the shop rows, PANEL_STEP at a time, to the first height where the box sits clear.
// T: every panel a finger can open (tests/card4.test.ts's allPanels: 1,197), every keyword's note opened by a tap, on 402x690 with no rune and
//    with one, 390x844, 390x660 and 430x739: the box (as drawn) covers 0 rule rows. (The scan of run 2 counted 2,459 of 3,851 boxes, 1,189 of
//    1,197 panels, on 402x690 with a rune; 536 of 3,842 with none; 247, 1,775 and 557 on the other three.)
// F: the same panels with every first sight new: the first frame of an open already shows its note clear (no frame at band height first), the
//    chain's next note opens clear, and the panel never shrinks between two notes of the chain; it shrinks back when the last note closes.
// U: with no note to show, panelArea is what it was (the fit before this change), panel by panel.
// The harness is tests/card4.test.ts's own (framed, the views, allPanels), with the build screen's per-frame area in place of card4's one-off one.
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
 *  per view: [the count, the deepest px into the carrier's pad]. T: every keyword's tapped note; F: the first-sight notes (the chain's first two a panel). */
const OVER: Record<string, [number, number]> = {
  "T op-402x690, no rune": [10, 9], "T op-402x690, a rune": [10, 9], "T phone-390x844": [0, 0], "T phone-390x660": [6, 12], "T iphone15pm-430x739": [0, 0],
  "sight op-402x690, no rune": [0, 0], "sight op-402x690, a rune": [0, 0], "sight phone-390x844": [0, 0], "sight phone-390x660": [2, 3], "sight iphone15pm-430x739": [0, 0],
  "new op-402x690, no rune": [0, 0], "new op-402x690, a rune": [0, 0], "new phone-390x844": [0, 0], "new phone-390x660": [2, 3], "new iphone15pm-430x739": [0, 0],
};
/** PRESENT-2 L: the first-sight notes whose place overlaps the how-to strip (only where every tip is new: "new"): the strip is not drawn while the note shows, per view (F). */
const YIELDS: Record<string, number> = {
  "new op-402x690, no rune": 24, "new op-402x690, a rune": 24, "new phone-390x844": 0, "new phone-390x660": 10, "new iphone15pm-430x739": 0,
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

describe("PRESENT-1 S4 (b): a shown definition never covers a rule row of its panel on a portrait phone (cap's ruling af2c96863a44ab41)", () => {
  for (const [name, w, h, dpr, runes] of VIEWS) it(`T on ${name}: every keyword's note, opened by a tap, covers 0 rule rows`, () => {
    setTipsForTests("done");
    const f = framed(w, h, dpr, runes);
    // the tallest a panel may grow: up to the top bar, never over the carrier (layout.ts panelArea's `most`)
    const limit = f.L.info.y + f.L.info.h - (f.L.bar.y + f.L.bar.h + 1);
    let panels = 0, boxes = 0, grew = 0, tallest = 0, faces = 0, onCarrier = 0, deepest = 0;
    const over: string[] = [], stuck: string[] = [], hist = new Map<number, number>(), crossed: string[] = [], hard = hardRects(f.L);
    for (const p of allPanels()) {
      const pc = panelCtx(p.run, p.sel, f, true);
      const plain = pc.draw();
      if (!plain.d) continue;
      panels++;
      for (const wd of kwWords(plain.ui)) {
        const st = keywordState(pc.ctx) as { word: string | null };
        st.word = glossaryEntry(wd)?.word ?? wd;
        const fr = pc.draw(), box = boxOf(fr.ui);
        st.word = null;
        if (!box || !fr.d) continue;
        boxes++;
        if (fr.area.h > plain.area.h) grew++;
        if (fr.d.plan.body.font !== plain.d.plan.body.font) faces++;
        tallest = Math.max(tallest, fr.area.h);
        hist.set(fr.area.h - plain.area.h, (hist.get(fr.area.h - plain.area.h) ?? 0) + 1);
        const bad = covered(box, rowsOf(fr.d.plan));
        const line = `${p.id} | ${wd}: panel y ${fr.area.y}-${fr.area.y + fr.area.h} (plain ${plain.area.h} tall, limit ${limit}), box y ${box.y}-${box.y + box.h} covers ${bad.map((r) => `${r.role}@${r.y}`).join(", ")}`;
        if (bad.length) (fr.area.h >= limit ? stuck : over).push(line);
        // PRESENT-2 L (cap's ruling 0d0ef2465804aafb), for the panels at the growth limit (where a note hangs): over the carrier's top edge (the pad), and never over a hard line
        // (every other panel's note is placed as before: defBoxPlace's own candidates, which in the first-run state may sit under the strip, 2 px over the deck's top)
        const into = fr.area.h >= limit && ov(box, f.L.pad) ? box.y + box.h - f.L.pad.y : 0;
        if (into > 0) { onCarrier++; deepest = Math.max(deepest, into); }
        if (fr.area.h >= limit) for (const [what, rr] of Object.entries(hard)) if (ov(box, rr)) crossed.push(`${p.id} | ${wd}: the note's box y ${box.y}-${box.y + box.h} covers ${what} (y ${rr.y}-${rr.y + rr.h})`);
      }
      keywordsIdle(pc.ctx);
    }
    const stuckPanels = new Set(stuck.map((s) => s.split(" | ")[0]));
    console.log(`S4B-T ${name}: ${panels} panels, ${boxes} boxes, ${grew} grew the panel (the tallest ${tallest} px of ${limit}; ${faces} changed the body's face); growth px: ${[...hist].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" ")}; `
      + `${over.length} boxes cover a rule row below the limit; ${stuck.length} at the growth limit still do (${stuckPanels.size} panels: ${[...stuckPanels].slice(0, 40).join("; ")}); `
      + `${onCarrier} hang over the carrier's top (the deepest ${deepest} px into the pad); ${crossed.length} cross a hard line (the deck, FIGHT, the cargo bar, the top bar)`
      + `${over.length ? "\n" + over.slice(0, 60).join("\n") : ""}${crossed.length ? "\n" + crossed.slice(0, 20).join("\n") : ""}`);
    expect(boxes).toBeGreaterThan(3000);
    expect(over, over.slice(0, 5).join("\n")).toEqual([]);
    expect(stuck.length, `at the limit: ${[...stuckPanels].join("; ")}`).toBe(STUCK[name]);
    expect(crossed, crossed.slice(0, 5).join("\n")).toEqual([]);
    expect([onCarrier, deepest], `T ${name}: notes over the carrier's top, the deepest px into the pad`).toEqual(OVER[`T ${name}`]);
  }, BIG);

  // "sight": every tip done, every first-sight note new (no how-to strip); "new": every tip new too (a strip under the panel, the note beside it)
  for (const mode of ["sight", "new"] as const) for (const [name, w, h, dpr, runes] of VIEWS) it(`F (${mode}) on ${name}: every first sight opens clear, the chain's panel never shrinks between two notes, and shrinks back after the last`, () => {
    const f = framed(w, h, dpr, runes);
    const limit = f.L.info.y + f.L.info.h - (f.L.bar.y + f.L.bar.h + 1);
    let panels = 0, notes = 0, grewAtOpen = 0, chained = 0, onCarrier = 0, deepest = 0, yielded = 0, stripsBack = 0;
    const bad: string[] = [], stuck: string[] = [], crossed: string[] = [], hard = hardRects(f.L);
    for (const p of allPanels()) {
      setTipsForTests("done");
      const plain = panelCtx(p.run, p.sel, f, true).areaNow();
      setTipsForTests(mode);
      const pc = panelCtx(p.run, p.sel, f, true);
      let prev = pc.draw();
      if (!prev.d) continue;
      panels++;
      let h0 = 0, seen = 0;
      for (let n = 0; n < 16; n++) {
        const box = boxOf(prev.ui), live = !!box || prev.ui.regions.some((q) => q.id === "kwsight");
        if (!live) break;
        if (box) {
          notes++;
          if (n === 0 && prev.area.h > plain.h) grewAtOpen++;
          const rows = covered(box, rowsOf(prev.d!.plan));
          if (rows.length) (prev.area.h >= limit ? stuck : bad).push(`${p.id}: note ${n + 1} box y ${box.y}-${box.y + box.h} covers ${rows.map((r) => `${r.role}@${r.y}`).join(", ")} (panel ${prev.area.h} tall, the limit ${limit})`);
          // PRESENT-2 L (cap's ruling 0d0ef2465804aafb): over the carrier's top edge, never over a hard line; where the note's place overlaps the how-to strip the strip is not
          // drawn from the note's first frame (the strip's inner pixel is C.night when drawn), and where it does not the strip is drawn
          const into = prev.area.h >= limit && ov(box, f.L.pad) ? box.y + box.h - f.L.pad.y : 0; // the panels at the growth limit (every other panel's note is placed as before)
          if (into > 0) { onCarrier++; deepest = Math.max(deepest, into); }
          if (prev.area.h >= limit) for (const [what, rr] of Object.entries(hard)) if (ov(box, rr)) crossed.push(`${p.id}: note ${n + 1} box y ${box.y}-${box.y + box.h} covers ${what} (y ${rr.y}-${rr.y + rr.h})`);
          const strip = prev.d!.hint ? hintStrip(prev.d!.hint, prev.d!.plan.r, f.H).r : null;
          if (strip) {
            const drawn = prev.cv.at(strip.x + 1, strip.y + 1) === C.night;
            if (ov(box, strip)) {
              yielded++;
              if (drawn) bad.push(`${p.id}: note ${n + 1} (y ${box.y}-${box.y + box.h}) overlaps the strip (y ${strip.y}-${strip.y + strip.h}) and the strip is still drawn`);
            } else if (!drawn) bad.push(`${p.id}: note ${n + 1} is clear of the strip and the strip is not drawn`);
          }
        }
        if (n > 0 && prev.area.h < h0) bad.push(`${p.id}: the panel shrank between notes (${h0} -> ${prev.area.h}) at note ${n + 1}`);
        h0 = Math.max(h0, prev.area.h);
        seen++;
        keywordsPressed(pc.ctx, null); // a press that is not on a word closes the note
        prev = pc.draw();
      }
      if (seen > 1) chained++;
      // the chain is over (or none opened): the panel is the plain one, in the very frame the last note closed
      if (seen > 0 && boxOf(prev.ui) === null && !prev.ui.regions.some((q) => q.id === "kwsight")) {
        if (prev.area.h !== plain.h) bad.push(`${p.id}: after the last note the panel is ${prev.area.h} tall, plain ${plain.h}`);
        // PRESENT-2 L: the strip a note hid is back in the frame the last note closes (its tip is still new)
        if (prev.d?.hint) {
          const st = hintStrip(prev.d.hint, prev.d.plan.r, f.H).r;
          if (prev.cv.at(st.x + 1, st.y + 1) === C.night) stripsBack++;
          else bad.push(`${p.id}: the strip is not back after the last note closed`);
        }
      }
      keywordsIdle(pc.ctx);
    }
    console.log(`S4B-F ${mode} ${name}: ${panels} panels, ${notes} first-sight notes (${chained} panels with more than one), ${grewAtOpen} panels open already grown; ${bad.length} faults; ${stuck.length} notes stuck at the growth limit; `
      + `${onCarrier} hang over the carrier's top (the deepest ${deepest} px into the pad); ${yielded} yield the how-to strip (${stripsBack} strips back after the last note); ${crossed.length} cross a hard line${bad.length ? "\n" + bad.slice(0, 40).join("\n") : ""}${crossed.length ? "\n" + crossed.slice(0, 20).join("\n") : ""}`);
    expect(notes).toBeGreaterThan(500);
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
    expect(stuck.length, stuck.slice(0, 3).join("\n")).toBe(STUCK_F[`${mode} ${name}`]);
    expect(crossed, crossed.slice(0, 5).join("\n")).toEqual([]);
    expect([onCarrier, deepest], `${mode} ${name}: notes over the carrier's top, the deepest px into the pad`).toEqual(OVER[`${mode} ${name}`]);
    expect(yielded, `${mode} ${name}: strip yields`).toBe(mode === "new" ? YIELDS[`new ${name}`] : 0);
  }, BIG);

  for (const [name, w, h, dpr, runes] of VIEWS) it(`U on ${name}: with no note to show, panelArea is what it was`, () => {
    setTipsForTests("done");
    const f = framed(w, h, dpr, runes);
    let panels = 0, grown = 0;
    const diff: string[] = [];
    for (const p of allPanels()) {
      const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run: p.run, touch: true, L: f.L } as unknown as Ctx;
      const o = { touch: true, hover: false, busy: false };
      const now = panelArea(f.L, p.sel, o, panelFit(ctx, p.sel, !!f.L.phone)), was = panelArea(f.L, p.sel, o, fitBefore(ctx, p.sel, !!f.L.phone));
      panels++;
      if (now.h !== f.L.info.h) grown++;
      if (JSON.stringify(now) !== JSON.stringify(was)) diff.push(`${p.id}: ${JSON.stringify(was)} -> ${JSON.stringify(now)}`);
    }
    console.log(`S4B-U ${name}: ${panels} panels, ${grown} grown past the band, ${diff.length} differ from the fit before`);
    expect(panels).toBeGreaterThan(1000);
    expect(diff, diff.slice(0, 5).join("\n")).toEqual([]);
  }, BIG);

  it("GRAPNEL GUN's panel on the operator's 402x690 phone with a rune held (run 2's picture): the SHOT note grows it, opens it grown, and the panel shrinks back", () => {
    const f = framed(402, 690, 3, 1);
    const p = allPanels().find((q) => q.id === "offer grapnel")!;
    // a tap on SHOT: the band is 57 px (rows at 169-176 and 178-185; the note's box was y 178-199, over the second row)
    setTipsForTests("done");
    const pc = panelCtx(p.run, p.sel, f, true);
    const plain = pc.draw();
    expect(plain.area).toEqual(f.L.info);
    expect(plain.area.h).toBe(57);
    const st = keywordState(pc.ctx) as { word: string | null };
    st.word = "SHOT";
    const tap = pc.draw(), box = boxOf(tap.ui)!, rows = rowsOf(tap.d!.plan);
    const last = Math.max(...rows.filter((r) => RULE_ROLES.has(r.role)).map((r) => r.y + r.h));
    console.log(`S4B-G tap: panel ${plain.area.h} -> ${tap.area.h} px (y ${tap.area.y}-${tap.area.y + tap.area.h}), box y ${box.y}-${box.y + box.h}, last rule row ends ${last}`);
    expect(tap.area.h).toBe(75); // 3 steps of PANEL_STEP: one px short at 69 (the second row ends where the box starts, and the box keeps 1 px clear)
    expect(tap.area.y + tap.area.h).toBe(plain.area.y + plain.area.h); // grown up: the foot stays
    expect(covered(box, rows)).toEqual([]);
    expect(box.y).toBeGreaterThan(last);
    st.word = null; // the note closes: the panel is the band again, in the same frame
    expect(pc.draw().area).toEqual(f.L.info);
    keywordsIdle(pc.ctx);
    // a first sight: the panel OPENS grown (no frame at band height first), and shrinks when its last note closes
    setTipsForTests("sight");
    const pn = panelCtx(p.run, p.sel, f, true);
    const open = pn.draw(), obox = boxOf(open.ui);
    console.log(`S4B-G open: panel ${open.area.h} px, word ${(keywordState(pn.ctx) as { word: string | null }).word}, box ${obox ? `y ${obox.y}-${obox.y + obox.h}` : "none"}`);
    expect(obox).not.toBeNull();
    expect(covered(obox!, rowsOf(open.d!.plan))).toEqual([]);
    expect(open.area.h).toBeGreaterThan(57);
    let n = 0, hmax = open.area.h, last2 = open;
    for (; n < 12; n++) {
      keywordsPressed(pn.ctx, null);
      const fr = pn.draw();
      if (!boxOf(fr.ui)) { last2 = fr; break; }
      expect(fr.area.h).toBeGreaterThanOrEqual(hmax); // the chain never shrinks the panel between two notes
      hmax = Math.max(hmax, fr.area.h);
    }
    expect(last2.area).toEqual(f.L.info); // the one first-sight note (SHOT) closed: the band, in the frame the press closed it
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it("rulesCovered: a row the box covers, or touches within `clear`, counts; flavour, hint and reminder rows never do", () => {
    const row = (role: string, y: number, font = "5") => ({ y, line: { font, block: { role } } as never });
    const lines = [row("ability", 10), row("flavour", 40, "3"), row("hint", 50, "3"), row("reminder", 60, "3")];
    expect(rulesCovered({ x: 0, y: 40, w: 100, h: 30 }, lines)).toEqual([]); // the optional rows may be covered
    expect(rulesCovered({ x: 0, y: 12, w: 100, h: 30 }, lines).length).toBe(1);
    expect(rulesCovered({ x: 0, y: 17, w: 100, h: 30 }, lines).length).toBe(1); // the ability row's glyphs end at 17: 1 px to spare
    expect(rulesCovered({ x: 0, y: 18, w: 100, h: 30 }, lines)).toEqual([]);
    expect(rulesCovered({ x: 0, y: 17, w: 100, h: 30 }, lines, 0)).toEqual([]);
  });
});
