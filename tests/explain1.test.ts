// EXPLAIN-1 (REQ-BFG-089, with REQ-BFG-084 step 0b): default rules text only on hover or tap of the icon. The operator,
// 2026-10-10: "any of the default rules text should be hidden without the hover" and "per item abilities should always be
// visible, you know?". Each panel's default face (inspector.ts explainPanel) hides what restates how every piece of its kind
// works (the flavour, a turret's two kind lines, an empty slot's kind lines, a rune card's reminder line, a done tip's hint)
// and keeps each piece's own lines, its stat row and its per-piece restriction (DART GUN's INNER COLUMN, now a rule line).
// The hidden lines are the ⓘ view's NOTES (first) and the icon's hover; a rune card's chip shows its line.
//   (a) default faces: every panel zoom1.test.ts and space1.test.ts sweep (899), on the pinned views, with a rune and
//       without, tips done (and tips new on the operator's phone): no hidden line drawn, the blocks the builder's minus the
//       hidden ones, E2's lines in the rule face and colour; every rune card: its reminder's room clear;
//   (b) nothing lost: every hidden line is in NOTES (its exact text), every word a hidden line names in KEYWORDS;
//   (c) the icon: its target at least 44 CSS px square on every pinned phone; the desk hover shows exactly NOTES, whole, on
//       the screen and clear of the buttons; a tap opens the ⓘ view with NOTES first; again, or a press elsewhere, closes
//       it; no press changes the run; the rune chips (the picker, LAST CHANCE): the line, never a take;
//   (d) the tips: a new store shows each hint, its action drops it (NOTES keeps it), kept after a reload, a refused action
//       counts nothing, a missing or broken store shows every tip, the table covers every hint text;
//   (e) the band: the in-band counts on the four zoomed phones (tips new and done), DART GUN's panel, the growth limit;
//   (f) E9: WHETSTONE, TEMPER and BARBED SPOOL's plain faces.
import { afterEach, describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { newRun, type DuskFoe, type Run } from "../src/game/run";
import { buyableModules, ITEMS } from "../src/sim/content";
import { key as K, rotField, setTurretList, turretSlots, type Placed } from "../src/sim/deck";
import { effectAt, fusible } from "../src/sim/stars";
import { makeTurret } from "../src/sim/battle";
import { RUNES, RUNE_LIST } from "../src/sim/runes";
import { UI, inside, type Rect } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { C } from "../src/render/palette";
import { icons } from "../src/render/font";
import { statRow } from "../src/ui/icons";
import { fmtCount, fmtDmg } from "../src/ui/statFormat";
import {
  buildLayout, buildScale, panelArea, phoneBand90, phoneBarLift, phoneScreen, type BuildLayout, type Sel,
} from "../src/screens/build/layout";
import { fullText as fullTextOf } from "../src/screens/build/inspector";
import { runeCardH, runeChipTarget, runeNoteY, runeRowFits, runeRowH, shiftLayout, drawRuneCard, runeCardTextW } from "../src/ui/runeBar";
import { runeReminder, runeReminderSpans, runeTag } from "../src/ui/runeText";
import {
  cargoPanel, columnButtons, detailsPlan, drawDetails, explainPanel, fittedPanel, hiddenBlock, itemPanel, offerPanel, panelFit,
  routePanel, turretPanel, visibleLines, type Block, type PanelPlan, type PanelText,
} from "../src/screens/build/inspector";
import { emptySlotPanel } from "../src/screens/build/turretPanel";
import { faceBlocks } from "../src/screens/build/faceBlocks";
import { turretRow } from "../src/screens/build/faceBlocks"; // CARD-2 (REQ-BFG-081, K4): the turret row's labels
import { turretStats } from "../src/ui/faces"; // CARD-2 (K4)
import { levelLines, levelText } from "../src/screens/build/levels";
import {
  explainWords, iconTipItems, iconTipRect, infoItems, infoLevels, keywordState, keywordsPressed, panelPiece, panelWords, questionRect,
} from "../src/screens/build/keywords";
import { PLAIN_RIGS, RIG_SENTENCE, faceLines, hasFace, plainRigStats, turretPlainOf } from "../src/ui/faces";
import { SHAPED_PLAIN_RIGS, isPlainRig, shapeLines } from "../src/ui/faces"; // SHAPES-1 flip: the shaped plain rigs (E9's path)
import { TIPS, TIPS_KEY, completeTip, hintShows, hintTips, setTipsForTests, tipDone, tipsDone } from "../src/ui/tips";
import { buy, rotate, type Ctx } from "../src/screens/build/actions";
import { tapRect } from "../src/ui/ui";
import { RunePicker, PICK_CHIP } from "../src/screens/runePicker";
import { LastChancePicker } from "../src/screens/lastChancePicker";
import { glossaryText } from "../src/ui/glossary";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";

installRaster();

// ------------------------------------------------------------------------------------ the panels and the views (SPACE-1's)
const SHORTB = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const rig = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed => ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
const OFFER: Sel = { kind: "offer", wagon: 0, slot: 0 };
function furnace(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "shoptap2-panels");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORTB] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 2;
  return run;
}
/** Every panel a finger can open: tests/space1.test.ts's 899 (zoom1.test.ts's), the same ids. */
function panels(): { id: string; run: Run; sel: Sel }[] {
  const out: ReturnType<typeof panels> = [];
  for (const d of buyableModules()) {
    const stars = fusible(d.id) ? [1, 2, 3] : [1];
    const o = furnace();
    o.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id}`, run: o, sel: OFFER });
    for (const s of stars) {
      const c = furnace();
      c.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
      out.push({ id: `cargo ${d.id} ★${s}`, run: c, sel: { kind: "cargo", uid: 900 } });
      if (d.kind === "gate") {
        for (const [x, y, rot] of [[3, 3, 1], [0, 9, 0], [5, 3, 0]] as const) out.push({ id: `${d.id} ★${s} @${x},${y}`, run: furnace([rig(10, d.id, x, y, rot, s)]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "factory") {
        out.push({ id: `${d.id} ★${s}`, run: furnace([{ uid: 10, def: d.id, x: 0, y: 6, ...(s > 1 ? { stars: s } : {}) }]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "mod" || d.kind === "core") {
        for (const hero of ["furnace", "weaver"] as const) {
          const run = newRun(hero, 5, "shoptap2-fit");
          run.build.mods = [{ uid: 950, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) }];
          out.push({ id: `${d.id} ★${s} fitted on ${hero}`, run, sel: { kind: "fitted", uid: 950 } });
        }
      } else if (d.kind === "turret") {
        const run = furnace();
        setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: d.id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
        run.build.mods = [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }];
        out.push({ id: `turret ${d.id} ★${s} with a core and gear`, run, sel: { kind: "turret", index: 1 } });
      }
    }
  }
  for (const hero of PLAYABLE_HEROES) {
    const run = newRun(hero, 5, "shoptap2-start");
    for (const p of run.build.items) out.push({ id: `${hero}'s starting ${p.def}`, run, sel: { kind: "item", uid: p.uid } });
    if (turretSlots(run.build)[0]?.turret) out.push({ id: `${hero}'s starting turret`, run, sel: { kind: "turret", index: 0 } });
    run.build.routes.forEach((_, i) => out.push({ id: `${hero}'s belt ${i + 1}`, run, sel: { kind: "route", index: i } }));
  }
  out.push({ id: "the KILN's belt", run: furnace(), sel: { kind: "route", index: 0 } });
  return out;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it (tests/space1.test.ts's framed). */
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
/** The pinned views (the brief's S2a): the desk, the two laptops, the operator's 402x690, 390x844, 390x660, 430x739 and the
 *  landscape phone, each with a rune held and without. */
const VIEWS: [string, number, number, number][] = [
  ["desk", 1920, 1080, 1], ["laptop-1280", 1280, 720, 1], ["laptop-1366", 1366, 768, 1], ["op-402x690", 402, 690, 3],
  ["phone-390x844", 390, 844, 3], ["phone-390x660", 390, 660, 3], ["iphone15pm-430x739", 430, 739, 3], ["land-844x390", 844, 390, 3],
];
const ctxOf = (run: Run, L: BuildLayout, view: object, touch: boolean): Ctx => ({ game: { ui: new UI(), t: 0, view, W: (view as { W: number }).W, H: (view as { H: number }).H }, run, touch, L } as unknown as Ctx);

/** The builder's text for a selection, before explainPanel (spec's dispatch). */
function rawText(run: Run, sel: Sel, touch: boolean): PanelText | null {
  switch (sel.kind) {
    case "offer": return offerPanel(run, sel.wagon, sel.slot, touch);
    case "cargo": return cargoPanel(run, sel.uid, touch);
    case "item": return itemPanel(run, sel.uid, touch);
    case "fitted": return fittedPanel(run, sel.uid);
    case "turret": return turretSlots(run.build)[sel.index]?.turret ? turretPanel(run, sel.index, touch) : emptySlotPanel(run.build, sel.index);
    case "route": return routePanel(run, sel.index);
    default: return null;
  }
}
const key = (b: Block): string => `${b.role}|${b.text}|${b.label ?? ""}|${b.cells ? JSON.stringify(b.cells) : ""}`;
const INNER = "TAKES A BELT ON ITS INNER COLUMN ONLY.";
/** The panel's place on the view (D4: the build screen's own fit), and its plan there. */
function placed(c: { run: Run; sel: Sel }, f: ReturnType<typeof framed>, touch = f.tap > 0) {
  const ctx = ctxOf(c.run, f.L, f.view, touch);
  const area = panelArea(f.L, c.sel, { touch, hover: false, busy: false }, panelFit(ctx, c.sel, !!f.L.phone));
  return { ctx, area, d: detailsPlan(ctx, c.sel, null, area)! };
}
/** The buttons' hit rects as drawDetails registers them (the ⓘ's target keeps clear of them). */
const hitsOf = (p: PanelPlan, n: number, tap: number): Rect[] => (p.column ? columnButtons(n, p.r, tap) : (p.rects ?? []).map((b) => (tap ? tapRect(b, tap, p.r) : b)));
const state = (run: Run): string => JSON.stringify({ gold: run.gold, shop: run.shop, inventory: run.inventory, build: run.build });

afterEach(() => { setTipsForTests("new"); });

describe("EXPLAIN-1 (a, b): the default faces, and nothing lost", () => {
  const all = panels();

  it("(a) on every pinned view, with a rune and without, tips done: no hidden line drawn; the blocks are the builder's minus the hidden ones; INNER COLUMN in the rule face and colour", () => {
    setTipsForTests("done");
    // SHAPES-1 flip: NAIL STRIP, EMBER TROUGH and SPIKE RAIL join the buyable modules, 13 panels each (an offer, and at each
    // star a cargo panel and 3 placed ones): 899 + 39 = 938; GANTRY PRESS's and ASSEMBLY LINE's 7 each are reshaped, not added
    expect(all.length).toBe(938);
    const bad: string[] = [];
    let n = 0, inner = 0, hidden = 0;
    for (const [name, w, h, dpr] of VIEWS) for (const runes of [1, 0]) {
      const f = framed(w, h, dpr, runes), touch = f.tap > 0;
      for (const c of all) {
        const { d } = placed(c, f);
        const raw = rawText(c.run, c.sel, touch)!, tag = `${name} runes ${runes}: ${c.id}`;
        n++;
        // the drawn lines: no hidden role, no note, no hint (every tip done)
        for (const v of visibleLines(d.plan)) {
          if (v.line === "rule") continue;
          const b = v.line.block;
          if (b.note || b.role === "flavour" || b.role === "reminder" || b.role === "caveat" || b.role === "hint") bad.push(`${tag}: drew ${b.role} ${b.text}`);
          if (b.text === INNER) {
            inner++;
            if (b.role !== "ability" || v.line.font !== d.plan.body.font || v.line.spans.some((s) => s.c !== C.bone)) bad.push(`${tag}: INNER COLUMN not in the rule style`);
          }
        }
        // the body: the builder's minus the hidden blocks, a caveat as an ability line
        const want = raw.body.filter((b) => !hiddenBlock(b)).map((b) => key(b.role === "caveat" ? { ...b, role: "ability" } : b));
        if (JSON.stringify(d.t.body.map(key)) !== JSON.stringify(want)) bad.push(`${tag}: body ${JSON.stringify(d.t.body.map(key))} != ${JSON.stringify(want)}`);
        hidden += raw.body.length - d.t.body.length;
      }
    }
    console.log(`EXPLAIN-1 (a) tips done: ${n} plans on ${VIEWS.length} views x 2; ${hidden} blocks hidden; INNER COLUMN drawn as a rule line ${inner} times; bad ${bad.length}`);
    expect(bad.slice(0, 10)).toEqual([]);
    expect(inner).toBeGreaterThan(0);
  }, 900_000);

  it("(a) the operator's phone, tips new: a hint shows where it showed (its tip new), nothing else hidden is drawn", () => {
    setTipsForTests("new");
    const bad: string[] = [];
    let hints = 0;
    for (const runes of [1, 0]) {
      const f = framed(402, 690, 3, runes);
      for (const c of all) {
        const { d } = placed(c, f), raw = rawText(c.run, c.sel, true)!;
        for (const v of visibleLines(d.plan)) {
          if (v.line === "rule") continue;
          const b = v.line.block;
          if (b.note || b.role === "flavour" || b.role === "reminder" || b.role === "caveat") bad.push(`${c.id}: drew ${b.role}`);
          if (b.role === "hint") hints++;
        }
        // CARD-3 (REQ-BFG-080, C): the band draws a new tip's hint in its strip just above the panel (detailsPlan's `hint`,
        // the face's own hint), no longer in the panel's plan: it shows there (was counted in visibleLines only)
        if (d.hint) {
          hints++;
          if (!d.t.body.some((b) => b.role === "hint" && b.text === d.hint)) bad.push(`${c.id}: a strip that is not its hint`);
        }
        const want = raw.body.filter((b) => !hiddenBlock(b)).map((b) => key(b.role === "caveat" ? { ...b, role: "ability" } : b));
        if (JSON.stringify(d.t.body.map(key)) !== JSON.stringify(want)) bad.push(`${c.id}: body`);
        if (raw.body.some((b) => b.role === "hint") && !d.t.body.some((b) => b.role === "hint")) bad.push(`${c.id}: its new tip's hint left the face`);
      }
    }
    console.log(`EXPLAIN-1 (a) tips new on 402x690: ${hints} hint lines drawn (first-run tips)`);
    expect(bad.slice(0, 10)).toEqual([]);
    expect(hints).toBeGreaterThan(0);
  }, 300_000);

  it("(a) every rune card (the picker's opened card, the bar's read-out, LAST CHANCE's): its size kept; its reminder's room clear until the chip shows it", () => {
    let n = 0;
    for (const def of RUNE_LIST) {
      for (const w of [300, 233]) {
        const h = runeCardH(def, w, { reminder: true, hint: "TAP AGAIN TO TAKE IT" });
        const r = { x: 4, y: 4, w, h }, y0 = runeNoteY(r, def);
        const lines = Math.round((runeCardH(def, w, { reminder: true }) - runeCardH(def, w, {}) - 1) / 7);
        const room = { x: r.x + 5, y: y0, w: r.w - 10, h: 1 + lines * 7 };
        const closed = fresh(320, 200), open = fresh(320, 200);
        drawRuneCard(gOf(closed), r, def, { sub: runeTag(def), open: true, reminder: true, hint: "TAP AGAIN TO TAKE IT" });
        drawRuneCard(gOf(open), r, def, { sub: runeTag(def), open: true, reminder: true, noteOpen: true, hint: "TAP AGAIN TO TAKE IT" });
        const inks = (cv: typeof closed) => {
          const seen = new Set<string>();
          for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) seen.add(String(cv.at(x, y)));
          return seen;
        };
        // closed: the room is the card's background alone (no glyph); open: the box (navy) and its text in it
        const bg = [...inks(closed)];
        expect(bg.length, `${def.id} ${w}: the room clear`).toBe(1);
        expect(inks(open).has(C.navy), `${def.id} ${w}: the line's box`).toBe(true);
        expect([...inks(open)].some((c) => c !== C.navy && c !== bg[0]), `${def.id} ${w}: the line drawn`).toBe(true);
        n++;
      }
    }
    console.log(`EXPLAIN-1 (a) rune cards: ${n} cards (every rune at 300 and 233 px), the room clear, the chip's line in it`);
  }, 120_000);

  it("(b) nothing lost: every hidden line is in NOTES with its exact text; every word a hidden line names is in KEYWORDS; a turret's NOTES at its own numbers", () => {
    setTipsForTests("done");
    const bad: string[] = [];
    let notes = 0;
    for (const [w, h, dpr, runes] of [[402, 690, 3, 1], [1920, 1080, 1, 1]] as const) {
      const f = framed(w, h, dpr, runes), touch = f.tap > 0;
      for (const c of all) {
        const { d } = placed(c, f), raw = rawText(c.run, c.sel, touch)!, piece = panelPiece(c.run, d.show);
        const have = new Set((d.t.notes ?? []).map((b) => b.text));
        notes += have.size;
        for (const b of raw.body.filter((x) => hiddenBlock(x) && x.role !== "reminder")) if (!have.has(b.text)) bad.push(`${c.id}: ${b.text} not in NOTES`);
        for (const b of raw.body.filter((x) => x.role === "hint")) if (!have.has(b.text)) bad.push(`${c.id}: the hint ${b.text} not in NOTES`);
        const words = new Set(explainWords(d.t, piece).map((x) => x.word));
        for (const x of panelWords(raw.body, piece)) if (!words.has(x.word)) bad.push(`${c.id}: ${x.word} left KEYWORDS`);
        if (c.sel.kind === "turret" && turretSlots(c.run.build)[c.sel.index]?.turret) {
          const tu = makeTurret(c.run.build, c.sel.index, turretSlots(c.run.build)[c.sel.index].td!);
          const want = turretPlainOf(tu.window, turretSlots(c.run.build)[c.sel.index].gearSlots).map((t) => icons(t));
          if (!want.every((t) => have.has(t))) bad.push(`${c.id}: its kind lines ${want.join(" ")}`);
        }
      }
    }
    console.log(`EXPLAIN-1 (b) ${notes} NOTES lines over the op view and the desk; bad ${bad.length}`);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 300_000);

  it("(b) DART GUN: NOTES holds its two kind lines then its hint; its face keeps the stat row and INNER COLUMN", () => {
    setTipsForTests("new");
    const run = furnace();
    run.inventory = [{ uid: 900, def: "dartgun" }];
    const t = explainPanel(cargoPanel(run, 900, true)!);
    // CARD-2 (REQ-BFG-081, K4): the stat row reads in words (faceBlocks.ts turretRow: RATE 55  HOLDS 2  GEAR SLOTS 1; was
    // faceLines' icon row, which the face data keeps)
    const row = turretRow(turretStats("dartgun", 1));
    expect(t.body.map((b) => b.text)).toEqual([row, INNER, "DRAG IT ONTO A TURRET SLOT TO INSTALL IT."]);
    expect(t.notes!.map((b) => b.text)).toEqual([...faceLines("dartgun", 1)!.plain!, "DRAG IT ONTO A TURRET SLOT TO INSTALL IT."]);
    setTipsForTests("done");
    expect(explainPanel(cargoPanel(run, 900, true)!).body.map((b) => b.text)).toEqual([row, INNER]);
  });
});

describe("EXPLAIN-1 (c): the icon", () => {
  const all = panels();

  it("(c) every icon's touch target is at least 44 CSS px square on every pinned phone view (the panel's ⓘ, each rune card's chip)", () => {
    setTipsForTests("done");
    const short: string[] = [], rows: string[] = [];
    for (const [name, w, h, dpr] of VIEWS.filter(([, , , dpr]) => dpr > 1)) for (const runes of [1, 0]) {
      const f = framed(w, h, dpr, runes), css = f.S / dpr;
      let least = Infinity;
      for (const c of all) {
        const { d } = placed(c, f), p = d.plan;
        const q = questionRect(p.r, p.y, f.tap, hitsOf(p, d.t.labels.length, f.tap));
        const side = q ? Math.min(q.w, q.h) * css : 0;
        least = Math.min(least, side);
        if (side < TAP_CSS - 1e-9) short.push(`${name} runes ${runes}: ${c.id}: ${q ? `${q.w}x${q.h}` : "none"} art px`);
      }
      // the rune cards' chips: the picker's and the read-out's card width (min(W - 8, 300))
      for (const def of RUNE_LIST) {
        const cw = Math.min(f.W - 8, 300), r = { x: 4, y: 4, w: cw, h: runeCardH(def, cw, { reminder: true }) };
        const t = runeChipTarget(r, def, f.tap);
        least = Math.min(least, Math.min(t.w, t.h) * css);
        if (Math.min(t.w, t.h) * css < TAP_CSS - 1e-9) short.push(`${name} runes ${runes}: ${def.id}'s chip ${t.w}x${t.h}`);
      }
      rows.push(`${name} runes ${runes}: the least icon target ${least.toFixed(1)} CSS px`);
    }
    console.log(`EXPLAIN-1 (c) icon targets:\n${rows.join("\n")}\nunder 44 CSS px: ${short.length}${short.length ? `\n${short.slice(0, 40).join("\n")}` : ""}`);
    expect(short.slice(0, 10)).toEqual([]);
  }, 600_000);

  /** A panel drawn on a view, its regions; `pointer`: a mouse resting there. */
  function draw(ctx: Ctx, sel: Sel, area: Rect, pointer?: { x: number; y: number }) {
    const ui = (ctx.game as unknown as { ui: UI }).ui;
    if (pointer) Object.assign(ui.pointer, { ...pointer, down: false, kind: "mouse" });
    ui.begin();
    drawDetails(gOf(fresh((ctx.game as unknown as { W: number }).W, (ctx.game as unknown as { H: number }).H)), ctx, sel, null, area, {} as DuskFoe);
    ui.end();
    return ui;
  }

  it("(c) the desk: hovering the icon shows exactly the NOTES (and a plain rig's HIT) beside the panel, whole, on the screen, clear of the buttons; a click opens the ⓘ view; nothing changes the run", () => {
    setTipsForTests("done");
    const f = framed(1920, 1080, 1, 1);
    let n = 0;
    for (const c of all.filter((x) => /^(cargo (whetstone|dartgun|splitter|temper) ★1|offer belt|dartgun|turret dartgun ★1|furnace's starting turret)/.test(x.id) || x.id === "the KILN's belt")) {
      const { ctx, area, d } = placed(c, f, false);
      const before = state(c.run), p = d.plan, q = questionRect(p.r, p.y, 0, hitsOf(p, d.t.labels.length, 0))!;
      const ui = draw(ctx, c.sel, area, { x: q.x + 4, y: q.y + 4 });
      const items = iconTipItems(d.t, explainWords(d.t, panelPiece(c.run, d.show)), panelPiece(c.run, d.show));
      const tip = ui.regions.find((r) => r.id === "kw:tip");
      if (!items.length) {
        expect(tip, c.id).toBeUndefined();
        continue;
      }
      n++;
      expect(tip, c.id).toBeDefined();
      // the words keep their underlines and targets while the icon's tooltip shows (U2c's word taps stay as they are)
      if (c.id.startsWith("cargo dartgun")) expect(ui.regions.some((r) => /^kw:\d+:/.test(r.id)), `${c.id}: its words' targets`).toBe(true);
      expect(items.slice(0, (d.t.notes ?? []).length), c.id).toEqual((d.t.notes ?? []).map((b) => b.text));
      expect(tip!.r, c.id).toEqual(iconTipRect(items, p.r, { W: f.W, H: f.H }));
      expect(tip!.r.x >= 0 && tip!.r.y >= 0 && tip!.r.x + tip!.r.w <= f.W && tip!.r.y + tip!.r.h <= f.H, `${c.id}: on the screen`).toBe(true);
      for (const b of hitsOf(p, d.t.labels.length, 0)) expect(inside(tip!.r, b.x, b.y) || inside(b, tip!.r.x, tip!.r.y), `${c.id}: clear of a button`).toBe(false);
      // a click opens the view, NOTES first; again closes it
      ui.regions.find((r) => r.id === "kw:?")!.onTap!();
      expect(keywordState(ctx)!.page, c.id).toBe(0);
      const its = infoItems(infoLevels(c.run, d.show), explainWords(d.t, panelPiece(c.run, d.show)), p.r.w - 10, (d.t.notes ?? []).map((b) => b.text));
      if (d.t.notes?.length) expect(its[0].section, c.id).toBe("NOTES");
      draw(ctx, c.sel, area).regions.find((r) => r.id === "kw:?")!.onTap!();
      expect(keywordState(ctx)!.page, c.id).toBeNull();
      expect(state(c.run), `${c.id}: the run unchanged`).toBe(before);
    }
    expect(n).toBeGreaterThan(4);
  });

  it("(c) the phone: a tap on the icon opens the ⓘ view with NOTES first; a tap again closes it, a press elsewhere too; the run and the selection unchanged", () => {
    setTipsForTests("done");
    const f = framed(402, 690, 3, 1);
    for (const id of ["cargo whetstone ★1", "cargo dartgun ★1", "turret dartgun ★1 with a core and gear", "offer splitter", "cargo splitter ★2"]) {
      const c = all.find((x) => x.id.startsWith(id))!;
      const { ctx, area, d } = placed(c, f, true);
      const before = state(c.run);
      const ui = draw(ctx, c.sel, area);
      const info = ui.regions.find((r) => r.id === "kw:?")!;
      expect(info, id).toBeDefined();
      info.onTap!();
      expect(keywordState(ctx)!.page, id).toBe(0);
      const its = infoItems(infoLevels(c.run, d.show), explainWords(d.t, panelPiece(c.run, d.show)), d.plan.r.w - 10, (d.t.notes ?? []).map((b) => b.text));
      expect(its[0].section, id).toBe("NOTES");
      expect(draw(ctx, c.sel, area).regions.some((r) => r.id === "kw:view"), id).toBe(true);
      draw(ctx, c.sel, area).regions.find((r) => r.id === "kw:?")!.onTap!();
      expect(keywordState(ctx)!.page, id).toBeNull();
      info.onTap!();
      keywordsPressed(ctx, null); // a press elsewhere
      expect(keywordState(ctx)!.page, id).toBeNull();
      expect(state(c.run), `${id}: the run unchanged`).toBe(before);
    }
  });

  /** A build screen enough for the pickers: its run, game, a finger's or a mouse's press. */
  function screenOf(run: Run, w: number, h: number, dpr: number, touch: boolean) {
    const f = framed(w, h, dpr, 0);
    const ui = new UI();
    ui.pointer.kind = touch ? "touch" : "mouse";
    const s = {
      run, refit: false, touch, L: f.L,
      game: { W: f.W, H: f.H, ui, view: f.view, canvas: null, error: () => {}, resize: () => {}, toast: () => {} },
      touched: () => {},
    };
    const frame = (p: { draw: (g: ReturnType<typeof gOf>, s: never) => void }, pointer?: { x: number; y: number }) => {
      if (pointer) Object.assign(ui.pointer, { ...pointer, down: false, kind: "mouse" });
      ui.begin();
      p.draw(gOf(fresh(f.W, f.H)), s as never);
      ui.end();
      return ui;
    };
    return { s, f, ui, frame };
  }

  it("(c) the dawn picker: the opened card's chip shows its line (never the TAP AGAIN TO TAKE IT tap), again or anywhere else closes it; a mouse hover shows it; FINAL NAIL's note", () => {
    const run = newRun("furnace", 5, "explain1-pick");
    const sc = screenOf(run, 402, 690, 3, true), picker = new RunePicker();
    let ui = sc.frame(picker as never);
    const cards = ui.regions.filter((r) => /^runepick-\d$/.test(r.id));
    expect(cards.length).toBeGreaterThan(1);
    cards[0].onTap!(); // open card 0
    ui = sc.frame(picker as never);
    const chip = ui.regions.find((r) => r.id === PICK_CHIP)!;
    expect(chip).toBeDefined();
    expect(ui.hit(chip.r.x + 1, chip.r.y + 1)?.id).toBe(PICK_CHIP);
    const held = JSON.stringify(run.build.runes ?? []);
    chip.onTap!();
    expect([picker.open, picker.note, JSON.stringify(run.build.runes ?? [])]).toEqual([0, true, held]);
    sc.frame(picker as never).regions.find((r) => r.id === PICK_CHIP)!.onTap!();
    expect(picker.note).toBe(false);
    chip.onTap!();
    picker.pressed("runepick"); // a press anywhere else (the picker's own background)
    expect(picker.note).toBe(false);
    expect(JSON.stringify(run.build.runes ?? [])).toBe(held);
    // a mouse on the desk: hovering a chip shows its line beside the card
    const desk = screenOf(run, 1920, 1080, 1, false), dp = new RunePicker();
    const u0 = desk.frame(dp as never);
    const c0 = u0.regions.find((r) => r.id === "runepick-0-chip")!;
    const u1 = desk.frame(dp as never, { x: c0.r.x + 3, y: c0.r.y + 3 });
    expect(u1.regions.some((r) => r.id === "runepick-0-chip-tip")).toBe(true);
    // FINAL NAIL's line is its RUNE_NOTE
    expect(runeReminder(RUNES.final_nail)).toBe("NOT ON A GATLING SPOOL: IT FIRES EACH LOAD AS IT COMES.");
    expect(runeReminderSpans(RUNES.final_nail).map((x) => x.t).join("")).toBe(runeReminder(RUNES.final_nail));
  });

  it("(c) LAST CHANCE: the RUNE card's chip shows its line (its details) and never picks the card", () => {
    const run = newRun("furnace", 5, "explain1-lc");
    (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 3 };
    const sc = screenOf(run, 402, 690, 3, true), lc = new LastChancePicker();
    const ui = sc.frame(lc as never);
    const chip = ui.regions.find((r) => r.id === "lcchip-rune");
    if (!chip) return; // an offer with no rune (the pool's draw): nothing to check
    const before = state(run);
    expect(ui.hit(chip.r.x + 1, chip.r.y + 1)?.id).toBe("lcchip-rune");
    chip.onTap!();
    expect([lc.open, lc.info.has(0), state(run)]).toEqual([-1, true, before]);
    chip.onTap!();
    expect(lc.info.has(0)).toBe(false);
  });
});

describe("EXPLAIN-1 (d): the first-run tips (src/ui/tips.ts)", () => {
  class Mem {
    m = new Map<string, string>();
    getItem(k: string) { return this.m.get(k) ?? null; }
    setItem(k: string, v: string) { this.m.set(k, String(v)); }
    removeItem(k: string) { this.m.delete(k); }
  }
  const g = globalThis as unknown as { localStorage?: unknown };
  afterEach(() => { delete g.localStorage; setTipsForTests("reload"); });

  it("the table covers every hint text a panel draws (every panel, a finger's and a mouse's, and every hintBlock caller)", () => {
    const texts = new Set<string>();
    for (const c of panels()) for (const touch of [true, false]) for (const b of rawText(c.run, c.sel, touch)?.body ?? []) if (b.role === "hint") texts.add(b.text);
    // the panels the sweep has no case of: a STOKER's place hint, an empty slot, an X rig, a placed factory, a supply on offer
    texts.add(emptySlotPanel(newRun("furnace", 5, "x").build, 1).body.find((b) => b.role === "hint")?.text ?? "");
    const uncovered = [...texts].filter((t) => t && !hintTips(t).length);
    console.log(`EXPLAIN-1 (d) hint texts drawn: ${texts.size}; covered by the table: ${texts.size - uncovered.length}`);
    expect(uncovered).toEqual([]);
    expect(TIPS.map((t) => t.id)).toEqual(["place", "fit", "install", "turn", "move", "supply", "lay", "cycle", "swap"]);
  });

  it("a new store shows each hint; its action done drops it from the face (NOTES keeps it); a two-action hint needs both; kept after a reload", () => {
    const store = new Mem();
    g.localStorage = store;
    setTipsForTests("reload");
    const run = furnace([rig(10, "splitter", 3, 3, 1)]);
    const face = () => explainPanel(itemPanel(run, 10, false)!);
    const TURN = "TAP TO TURN (OR R). DRAG TO MOVE.";
    expect(face().body.some((b) => b.text === TURN)).toBe(true);
    completeTip("turn");
    expect(face().body.some((b) => b.text === TURN), "turn alone: move still to learn").toBe(true);
    completeTip("move");
    expect(face().body.some((b) => b.text === TURN)).toBe(false);
    expect(face().notes!.map((b) => b.text)).toContain(TURN);
    expect(JSON.parse(store.getItem(TIPS_KEY)!)).toEqual(["turn", "move"]);
    setTipsForTests("reload"); // a page reload: read the store again
    expect([tipDone("turn"), tipDone("move"), tipDone("lay")]).toEqual([true, true, false]);
    expect(hintShows(TURN)).toBe(false);
  });

  it("only a successful action counts: a turn and a supply bought count; an X rig's refused turn and a buy short of gold don't", () => {
    const store = new Mem();
    g.localStorage = store;
    setTipsForTests("reload");
    const fx = { ring: () => {}, popup: () => {} };
    const ctxFor = (run: Run) => ({
      run, L: { frame: { x: 0, y: 0, dx: 0, dy: 0 } }, wfx: fx, ufx: fx, coinPos: () => ({ x: 0, y: 0 }), invalid: () => {}, select: () => {},
      touched: () => {}, game: { audio: { play: () => {} }, toast: () => {} },
    }) as unknown as Ctx;
    const x = furnace([rig(10, "overdrive", 3, 3)]);
    rotate(ctxFor(x), 10); // an X rig: refused
    expect(tipDone("turn")).toBe(false);
    const r = furnace([rig(10, "splitter", 3, 3, 1)]);
    rotate(ctxFor(r), 10);
    expect(tipDone("turn")).toBe(true);
    const shop = furnace();
    const supply = Object.values(ITEMS).find((d) => d.kind === "supply")!; // a supply on a wagon's offer (the U2c probe's)
    shop.shop.wagons = [{ merchant: "ironmonger", offers: [{ def: supply.id, price: supply.price, sold: false }] }] as Run["shop"]["wagons"];
    shop.gold = 0;
    expect(buy(ctxFor(shop), 0, 0).ok).toBe(false);
    expect(tipDone("supply")).toBe(false);
    shop.gold = 99;
    expect(buy(ctxFor(shop), 0, 0).ok).toBe(true);
    expect(tipDone("supply")).toBe(true);
  });

  it("a missing store, a bad value or a throwing store shows every tip", () => {
    setTipsForTests("reload"); // no localStorage in node
    expect(tipsDone()).toEqual([]);
    for (const bad of ["{", "\"lay\"", "[\"lay\", 3]", "null"]) {
      const store = new Mem();
      store.setItem(TIPS_KEY, bad);
      g.localStorage = store;
      setTipsForTests("reload");
      expect(tipsDone(), bad).toEqual([]);
    }
    g.localStorage = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => {} };
    setTipsForTests("reload");
    expect(tipsDone()).toEqual([]);
    completeTip("lay"); // a store that throws on write: done for this session only
    expect(tipDone("lay")).toBe(true);
    setTipsForTests("reload");
    expect(tipDone("lay")).toBe(false);
  });
});

describe("EXPLAIN-1 (e): the band", () => {
  const all = panels();

  it("(e) the in-band counts on the four zoomed phones, with a rune and without, tips new and done; DART GUN on 402x690 @3 with a rune; the panels at the growth limit", () => {
    const rows: string[] = [];
    let limit = 0;
    for (const mode of ["new", "done"] as const) {
      setTipsForTests(mode);
      let atLimit = 0;
      for (const [w, h] of [[402, 690], [390, 844], [390, 660], [430, 739]] as const) for (const runes of [1, 0]) {
        const f = framed(w, h, 3, runes), L = f.L, most = L.info.y + L.info.h - (L.bar.y + L.bar.h + 1);
        let inBand = 0;
        for (const c of all) {
          const { area } = placed(c, f);
          if (area === L.info) inBand++;
          else if (area.h >= most) atLimit++;
        }
        rows.push(`EXPLAIN-1 tips ${mode}: ${w}x${h} @3 runes ${runes}: band ${L.info.h}, ${inBand} of ${all.length} in the band (${((100 * inBand) / all.length).toFixed(1)}%), ${all.length - inBand} grown`);
      }
      rows.push(`EXPLAIN-1 tips ${mode}: panels grown to the limit (all four phones, with and without a rune): ${atLimit}`);
      if (mode === "done") limit = atLimit;
      const f = framed(402, 690, 3, 1);
      for (const id of ["cargo dartgun ★1", "offer dartgun"]) {
        const c = all.find((x) => x.id === id)!, { area, d } = placed(c, f);
        rows.push(`EXPLAIN-1 tips ${mode}: DART GUN (${id}) on 402x690 @3 with a rune: ${area.w}x${area.h} ${area === f.L.info ? "in the band" : "grown"}, face ${d.plan.body.font === "5" ? "5x7" : "3x5"}${d.plan.body.tight ? " tight" : ""}, ${d.plan.gaps.slots} gaps of ${d.plan.gaps.px}`);
      }
    }
    console.log(rows.join("\n"));
    expect(limit).toBeLessThanOrEqual(83);
  }, 900_000);

  it("(e) phoneBand90's measure (zoom1.test.ts's: each panel's full text at band width W - 6) with every tip done: the 90th per width, under or at each pin", () => {
    setTipsForTests("done");
    const rows: string[] = [];
    for (const W of [186, 235, 236, 237, 238, 239, 240, 241, 245, 246, 247, 248, 249, 250, 258, 315, 340]) {
      const L = buildLayout(W, 700, true, 5, true, 27), v = { W, H: 700, scale: 5, dpr: 3, portrait: true };
      const hs = all.map((c) => {
        const ctx = { game: { ui: new UI(), t: 0, view: v }, run: c.run, touch: true, L } as unknown as Ctx;
        let lo = 10, hi = 200;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; const d = detailsPlan(ctx, c.sel, null, { ...L.info, h: m }); if (d && fullTextOf(d.plan)) hi = m; else lo = m; }
        return hi;
      }).sort((a, b) => a - b);
      const p90 = hs[Math.ceil(0.9 * hs.length) - 1], pin = phoneBand90(W);
      rows.push(`${W}: pin ${pin}, measured 90th ${p90} (tips done)`);
      // SHAPES-1 flip (left red: a LIMIT, cap's call; zoom1.test.ts has the numbers): tips done as tips new, the three shaped
      // plain rigs' 27 placed panels lift the 90th past the pin at W 186 (67), 236-239 (60), 240 (57) and 250 (48)
      expect(p90, `W ${W}`).toBeLessThanOrEqual(pin);
    }
    console.log(`EXPLAIN-1 phoneBand90, tips done: ${rows.join(" | ")}`);
  }, 900_000);
});

describe("EXPLAIN-1 (f): E9, plain faces for WHETSTONE, TEMPER and BARBED SPOOL (REQ-BFG-084 step 0b)", () => {
  const sim = (def: string, s: number): string => {
    const g = effectAt(def, s).gate!;
    return def === "whetstone" ? `+${fmtDmg(g.flat!)}` : def === "temper" ? `+${fmtCount(g.burn!)}` : `+${fmtCount(g.fray!)}`;
  };
  const ICONS: Record<string, "DMG" | "BURN" | "FRAY"> = { whetstone: "DMG", temper: "BURN", barbed: "FRAY" };

  it("each of the three shows its stat row and no HIT: line, at every star, from the sim's numbers", () => {
    expect([...PLAIN_RIGS]).toEqual(["whetstone", "temper", "barbed"]);
    for (const def of PLAIN_RIGS) for (const s of [1, 2, 3]) {
      const fb = faceBlocks(def, s, {})!;
      expect(fb.map((b) => b.text), `${def} ★${s}`).toEqual([statRow([[ICONS[def], sim(def, s)]])]);
      expect(fb.some((b) => b.text.includes("HIT:") || b.brass), `${def} ★${s}`).toBe(false);
      expect(plainRigStats(def, s)).toEqual([[ICONS[def], sim(def, s)]]);
    }
    // PIECES-1 3.3's table, read from the sim: +20/+40/+70, +1/+2/+4, +1/+2/+3
    expect(["whetstone", "temper", "barbed"].map((d) => [1, 2, 3].map((s) => sim(d, s)).join("/"))).toEqual(["+20/+40/+70", "+1/+2/+4", "+1/+2/+3"]);
  });

  it("LEVELS equals the sim's numbers; KEYWORDS lists HIT (today's definition); NOTES starts with the rig sentence", () => {
    setTipsForTests("done");
    for (const def of PLAIN_RIGS) for (const s of [1, 2, 3]) {
      const ladder = levelLines(def, s, {})!.filter((l) => l.kind === "ladder").map((l) => levelText(l, (v) => v));
      expect(ladder, `${def} ★${s}`).toEqual([`{${ICONS[def]}} ${[1, 2, 3].map((x) => sim(def, x)).join("/")}`]);
      const run = furnace();
      run.inventory = [{ uid: 900, def, ...(s > 1 ? { stars: s } : {}) }];
      const f = framed(402, 690, 3, 1), c = { run, sel: { kind: "cargo", uid: 900 } as Sel };
      const { d } = placed(c, f), piece = panelPiece(run, d.show)!;
      const words = explainWords(d.t, piece);
      expect(words[0], `${def} ★${s}`).toEqual({ word: "HIT", text: "HIT: EACH SLUG ON A TILE ITS ARROWS POINT AT, WHILE IT WORKS.", colour: words[0].colour });
      expect(glossaryText("HIT", piece)).toBe("HIT: EACH SLUG ON A TILE ITS ARROWS POINT AT, WHILE IT WORKS.");
      expect(d.t.notes![0].text, `${def} ★${s}`).toBe(RIG_SENTENCE);
      // the icon's hover: NOTES, then HIT's definition
      expect(iconTipItems(d.t, words, piece).slice(-1)[0]).toBe(words[0].text);
    }
    expect(RIG_SENTENCE).toBe("EACH ARROW THAT POINTS AT A BELT TILE GIVES ITS STATS TO EVERY SLUG ON THAT TILE. ONE ARROW, ONE HIT.");
  });

  it("every other rig's face is its face data's (the stat row if any, then each rule line): HEAT JACKET, PLATE ROLLER and RIVETER keep HIT:", () => {
    // SHAPES-1 flip: NAIL STRIP, EMBER TROUGH and SPIKE RAIL are plain stat rigs by design (REQ-BFG-084; faces.ts
    // SHAPED_PLAIN_RIGS, isPlainRig; PLAIN_RIGS stays the base's three, pinned above): with SHAPES on their face is the plain
    // path's stat row and their own shape line (shapeLines: UP TO 2 / UP TO 6 HITS), no HIT: line, so they leave this list
    // as WHETSTONE does (was !PLAIN_RIGS.includes) and are checked as plain faces below
    const rigs = buyableModules().filter((d) => d.kind === "gate" && hasFace(d.id) && !isPlainRig(d.id));
    for (const d of rigs) for (const s of fusible(d.id) ? [1, 2, 3] : [1]) {
      const fl = faceLines(d.id, s, {})!;
      const want = [...(fl.stats ? [fl.stats] : []), ...(fl.stats2 ? [fl.stats2] : []), ...fl.rules.map((r) => r.text), ...(fl.caveats ?? [])];
      expect(faceBlocks(d.id, s, {})!.map((b) => b.text), `${d.id} ★${s}`).toEqual(want);
    }
    // SHAPES-1 flip: the three shaped plain rigs, each at every star: its stat row from the sim's numbers (SHAPES_ITEMS: NAIL
    // STRIP +12/+25/+40 DMG, EMBER TROUGH +1/+2/+3 BURN, SPIKE RAIL +10/+20/+35 DMG), then its UP TO n HITS, no HIT: line
    expect(SHAPED_PLAIN_RIGS.filter((d) => buyableModules().some((x) => x.id === d && isPlainRig(d)))).toEqual(["nailstrip", "embertrough", "spikerail"]);
    for (const def of SHAPED_PLAIN_RIGS) for (const s of [1, 2, 3]) {
      const fb = faceBlocks(def, s, {})!;
      expect(fb.map((b) => b.text), `${def} ★${s}`).toEqual([statRow(plainRigStats(def, s)!), ...shapeLines(def, s).map((r) => r.text)]);
      expect(fb.some((b) => b.text.includes("HIT:")), `${def} ★${s}`).toBe(false);
    }
    expect(SHAPED_PLAIN_RIGS.map((d) => [1, 2, 3].map((s) => plainRigStats(d, s)!.map(([k, v]) => `${k} ${v}`).join()).join("/"))).toEqual([
      "DMG +12/DMG +25/DMG +40", "BURN +1/BURN +2/BURN +3", "DMG +10/DMG +20/DMG +35",
    ]);
    expect(SHAPED_PLAIN_RIGS.map((d) => shapeLines(d, 1).map((r) => r.text))).toEqual([["UP TO 2 HITS"], ["UP TO 2 HITS"], ["UP TO 6 HITS"]]);
    for (const def of ["heatjacket", "plateroller", "riveter"]) expect(faceLines(def, 1)!.rules[0].text.startsWith("HIT:"), def).toBe(true);
    expect(rigs.length).toBeGreaterThan(20);
  });
});
