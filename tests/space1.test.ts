// SPACE-1 (REQ-BFG-087): clear space between the descriptions on cards and panels. The operator, 2026-10-10: "I think we
// should add space between each description on the cards. They are too close together right now, with the example being
// Dart Gun." Between two separate items of a panel's body (the family tag, the stat row, each description or note line,
// the flavour, the hint) a gap of up to GAP (src/ui/spacing.ts: 5 in the 5x7 face, 4 in the 3x5) on top of the line pitch;
// inside one wrapped description the pitch is unchanged. Content first (the brief's D3): every panel plans its content
// exactly as without the gaps for the rect it gets, and the gaps take only the room left. A phone's tap panel too tight for
// gaps of GAP_MIN in the band grows over the shop rows (D4: inspector.ts panelFit, layout.ts panelArea).
//   (a) content equality, the gaps off and on: every panel, at phoneBand90's widths and on the pinned views;
//   (b) the gaps: DART GUN's panels exactly, and the shares of G / G_MIN..G / under G_MIN over every panel and view;
//   (c) nothing cut or overlapping: every panel as placed on every pinned view; every buyable piece's shop card (narrow
//       and wide) and every rune's card drawn inside its rect (the raster);
//   (d) the placement (D4): in the band with gaps of at least GAP_MIN, grown with gaps of GAP (or at the limit).
import { describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { buyableModules, ITEMS } from "../src/sim/content";
import { key as K, rotField, setTurretList, turretSlots, type Placed } from "../src/sim/deck";
import { fusible } from "../src/sim/stars";
import { RUNE_LIST } from "../src/sim/runes";
import { UI, type Rect } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { GAP, GAP_MIN } from "../src/ui/spacing";
import { lineWidth } from "../src/ui/richText";
import { cardText } from "../src/ui/abilityText";
import { shopChipGlyphs } from "../src/ui/chips";
import { drawRuneCard, readoutW, runeCardH, runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { runeTag, runeTaken } from "../src/ui/runeText";
import { drawCard } from "../src/screens/build/shop";
import {
  CARD_H, CARD_W, PANEL_STEP, WIDE_CARD_H, buildLayout, buildScale, panelArea, phoneBand, phoneBand90, phoneBarLift, phoneScreen,
  type BuildLayout, type Sel,
} from "../src/screens/build/layout";
import {
  DIVIDER, columnButtonH, columnButtons, detailsPlan, fullText, fullest, keptWhole, panelFit, visibleLines, type Block, type PLine,
  type PanelPlan,
} from "../src/screens/build/inspector";
import type { Ctx } from "../src/screens/build/actions";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { infoDrawn, infoFree, infoItems, infoLevels, infoView, panelPiece, panelWords } from "../src/screens/build/keywords";

installRaster();

// ------------------------------------------------------------------------------------- the panels and the views
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
/** Every panel a finger can open: tests/zoom1.test.ts's 899 (zoom.test.ts's set), the same ids. */
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
/** The build screen as the game frames it (tests/zoom1.test.ts's framed: pickScale, pickSub, the rune row, the bar lift). */
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
 *  landscape phone, each with a rune held and without. A phone's or the landscape phone's panel is a finger's; the desk's
 *  and the laptops' a mouse's. */
const VIEWS: [string, number, number, number][] = [
  ["desk", 1920, 1080, 1], ["laptop-1280", 1280, 720, 1], ["laptop-1366", 1366, 768, 1], ["op-402x690", 402, 690, 3],
  ["phone-390x844", 390, 844, 3], ["phone-390x660", 390, 660, 3], ["iphone15pm-430x739", 430, 739, 3], ["land-844x390", 844, 390, 3],
];
/** phoneBand90's test widths (tests/zoom1.test.ts, after D6's re-pin: each step and either side of it). */
const WIDTHS = [186, 235, 236, 237, 238, 239, 240, 241, 245, 246, 247, 248, 249, 250, 258, 315, 340];

const ctxOf = (run: Run, L: BuildLayout, view: object, touch: boolean): Ctx => ({ game: { ui: new UI(), t: 0, view }, run, touch, L } as unknown as Ctx);

// ------------------------------------------------------------------------------------------------- what a plan shows
const blockKey = (b: Block): string => `${b.role}|${b.label ?? ""}|${b.text}|${b.perk ?? ""}|${b.cells ? JSON.stringify(b.cells) : ""}`;
const lineKey = (l: PLine | "rule"): string => (l === "rule" ? "--rule--"
  : l.cells ? l.cells.map((c) => `${c.label} ${c.spans.map((s) => s.t).join("")}`).join("  ") : `${l.label ?? ""} ${l.spans.map((s) => s.t).join("")}`);
/** A plan's content: its face, variant, blocks shown and given way, lines, the lines drawn, fullText, keptWhole and fullest,
 *  its header and its buttons; its rect (a column's height aside: it is sized with its gaps). Never its gaps. */
function content(d: ReturnType<typeof detailsPlan>): string {
  if (!d) return "none";
  const p = d.plan, b = p.body;
  return JSON.stringify({
    labels: d.t.labels, font: b.font, variant: b.variant, tight: b.tight, fits: b.fits, fullBody: b.fullBody, sub: b.sub ?? null,
    shown: b.shown.map((l) => blockKey(l.b)), dropped: b.dropped.map(blockKey), lines: b.lines.map(lineKey),
    full: fullText(p), whole: keptWhole(p), fullest: fullest(p), drawn: visibleLines(p).map((v) => lineKey(v.line)),
    head: { subs: p.subs, headerOnly: p.headerOnly, famHead: p.famHead, rects: p.rects, shift: p.shift, subMax: p.subMax },
    r: p.column ? { ...p.r, h: 0 } : p.r,
  });
}

const GLYPH = { "5": 7, "3": 5 } as const;
/** Each drawn line's glyph box (and a rule's row) as drawDetails draws it. */
function boxes(p: PanelPlan): { what: string; r: Rect; line: PLine | "rule" }[] {
  return visibleLines(p).map((v) => {
    if (v.line === "rule") return { what: "rule", r: { x: p.r.x + 5, y: v.y + 1, w: p.r.w - 10, h: 1 }, line: v.line };
    const l = v.line, x = p.r.x + 5;
    const w = l.cells ? Math.max(...l.cells.map((c) => c.vx + lineWidth(c.spans, l.font))) : (l.indent ?? 0) + lineWidth(l.spans, l.font);
    return { what: lineKey(l), r: { x, y: v.y, w, h: GLYPH[l.font] }, line: l };
  });
}
const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** (c) for one plan: every drawn line (and the tag's underline) inside the panel's frame, no two overlapping, none under
 *  a button; the pitch inside one block unchanged; a separate item's gap exactly the plan's. [] when all hold. */
function cutOrOverlap(p: PanelPlan, labels: number, tap: number): string[] {
  const out: string[] = [], r = p.r, bs = boxes(p);
  const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  const btns = p.column ? (labels ? columnButtons(labels, r, tap) : []) : p.rects ?? [];
  bs.forEach((b, i) => {
    if (b.r.x < inner.x || b.r.y < inner.y || b.r.x + b.r.w > inner.x + inner.w || b.r.y + b.r.h > inner.y + inner.h) out.push(`outside the panel: ${b.what}`);
    for (const q of btns) if (meets(b.r, q)) out.push(`under a button: ${b.what}`);
    const n = bs[i + 1];
    if (n && n.r.y < b.r.y + b.r.h) out.push(`overlap: ${b.what} / ${n.what}`);
  });
  // the tag's underline (y + 24) clear of the first line
  if (p.famHead?.at === "sub" && bs.length && bs[0].r.y <= r.y + 24) out.push("the tag's underline on line 1");
  // pitches and gaps, as planned
  const v = visibleLines(p);
  for (let i = 1; i < v.length; i++) {
    const a = v[i - 1].line, b = v[i].line, dy = v[i].y - v[i - 1].y, slot = p.gaps.before[i] * p.gaps.px;
    const base = a === "rule" ? DIVIDER : a.pitch;
    if (dy !== base + slot) out.push(`gap ${i}: ${dy} != ${base} + ${slot}`);
    if (a !== "rule" && b !== "rule" && a.block === b.block && dy !== a.pitch) out.push(`a wrapped line's pitch: ${lineKey(b)}`);
  }
  return out;
}

const share = (n: number, of: number): string => `${n} (${of ? ((100 * n) / of).toFixed(1) : "0.0"}%)`;

describe("SPACE-1: clear space between the descriptions on cards and panels (REQ-BFG-087)", () => {
  const all = panels();

  it("the sweep is zoom1.test.ts's 899 panels; the gaps are about half a line: 5x7 G 5 (pitch 9), 3x5 G 4 (pitch 7); G_MIN ceil(G/2)", () => {
    // SHAPES-1 flip: NAIL STRIP, EMBER TROUGH and SPIKE RAIL join the buyable modules, 13 panels each (an offer, and at each
    // star a cargo panel and 3 placed ones): 899 + 39 = 938; GANTRY PRESS's and ASSEMBLY LINE's 7 each are reshaped, not added
    expect(all.length).toBe(938);
    expect([GAP["5"], GAP["3"], GAP_MIN["5"], GAP_MIN["3"]]).toEqual([5, 4, 3, 2]);
    expect(GAP_MIN["5"]).toBe(Math.ceil(GAP["5"] / 2));
    expect(GAP_MIN["3"]).toBe(Math.ceil(GAP["3"] / 2));
  });

  it("(a) content first: at phoneBand90's widths, every panel plans the same content with the gaps off and on (face, variant, blocks, fullText, keptWhole, fullest)", () => {
    let n = 0;
    const diffs: string[] = [];
    for (const W of WIDTHS) {
      const L = buildLayout(W, 700, true, 5, true, 27), v = { W, H: 700, scale: 5, dpr: 3, portrait: true };
      for (const h of [...new Set([phoneBand90(W), phoneBand90(W) + 2 * PANEL_STEP, phoneBand(W)])]) {
        const area = { ...L.info, h };
        for (const c of all) {
          const ctx = ctxOf(c.run, L, v, true);
          const off = content(detailsPlan(ctx, c.sel, null, area, { gaps: false })), on = content(detailsPlan(ctx, c.sel, null, area));
          n++;
          if (off !== on) diffs.push(`W ${W} h ${h}: ${c.id}`);
        }
      }
    }
    console.log(`SPACE-1 (a) phoneBand90's widths: ${n} plans, ${diffs.length} differ`);
    expect(diffs.slice(0, 10)).toEqual([]);
    expect(n).toBeGreaterThan(899 * WIDTHS.length * 2);
  }, 600_000);

  it("(a) content first on the pinned views, with a rune and without: the band (or column) and the panel's real place (D4), the gaps off and on", () => {
    let n = 0;
    const diffs: string[] = [], rows: string[] = [];
    for (const [name, w, h, dpr] of VIEWS) for (const runes of [1, 0]) {
      const f = framed(w, h, dpr, runes), L = f.L, touch = f.tap > 0;
      let grown = 0;
      for (const c of all) {
        const ctx = ctxOf(c.run, L, f.view, touch);
        const placed = panelArea(L, c.sel, { touch, hover: false, busy: false }, panelFit(ctx, c.sel, !!L.phone));
        if (placed !== L.info) grown++;
        for (const area of placed === L.info ? [L.info] : [L.info, placed]) {
          const off = content(detailsPlan(ctx, c.sel, null, area, { gaps: false })), on = content(detailsPlan(ctx, c.sel, null, area));
          n++;
          if (off !== on) diffs.push(`${name} runes ${runes}: ${c.id}`);
        }
      }
      rows.push(`${name} runes ${runes}: ${f.portrait ? "band" : "column"} ${L.info.h}, ${grown} grown`);
    }
    console.log(`SPACE-1 (a) pinned views: ${n} plans, ${diffs.length} differ\n${rows.join("\n")}`);
    expect(diffs.slice(0, 10)).toEqual([]);
  }, 600_000);

  it("(b) DART GUN: on the operator's 402x690 with a rune and without, and on the 1920x1080 desk, every gap between separate items is G, a wrapped description's pitch unchanged, the tag's underline clear", () => {
    const rows: string[] = [];
    for (const [name, w, h, dpr, runes] of [["op-402x690", 402, 690, 3, 1], ["op-402x690", 402, 690, 3, 0], ["desk", 1920, 1080, 1, 1]] as const) {
      const f = framed(w, h, dpr, runes), L = f.L, touch = f.tap > 0;
      const d = ITEMS.dartgun;
      const offer = furnace();
      offer.gold = 20;
      offer.shop.wagons = [{ merchant: d.merchant ?? "gunsmith", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
      const cargo = furnace();
      cargo.inventory = [{ uid: 900, def: d.id }];
      for (const [what, run, sel] of [["shop card's panel", offer, OFFER], ["in cargo", cargo, { kind: "cargo", uid: 900 } as Sel]] as const) {
        const ctx = ctxOf(run, L, f.view, touch);
        const area = panelArea(L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!L.phone));
        const p = detailsPlan(ctx, sel, null, area)!.plan;
        const tag = `${name} runes ${runes} DART GUN ${what}`;
        expect(fullText(p), tag).toBe(true);
        // CARD-3 (REQ-BFG-080, C): on a portrait band the new tip's hint is drawn in its strip just above the panel, no
        // longer an item of it, so DART GUN's band panel has its tips-done slots (the tag's and INNER COLUMN's); the desk
        // column keeps the hint (was > 2 on every view)
        expect(p.gaps.slots, tag).toBeGreaterThan(f.portrait ? 1 : 2);
        expect(p.gaps.px, `${tag}: every gap at G`).toBe(p.gaps.G);
        expect(cutOrOverlap(p, p.rects?.length ?? 0, f.tap), tag).toEqual([]);
        if (p.famHead?.at === "sub") expect(visibleLines(p)[0].y - (p.r.y + 25), `${tag}: the tag's clear space`).toBe(p.gaps.px);
        const v = visibleLines(p);
        rows.push(`${tag}: ${p.column ? "column" : area === L.info ? "in the band" : "grown"} ${p.r.w}x${p.r.h} (band ${L.info.h}), face ${p.body.font}${p.body.tight ? " tight" : ""}, variant ${p.body.variant}, tag ${p.famHead ? `${p.famHead.at} ${p.famHead.names ? "names" : "marks"}` : "none"}, ${p.gaps.slots} gaps of ${p.gaps.px} (G ${p.gaps.G})\n  ${v.map((x, i) => `${x.y - p.r.y}${p.gaps.before[i] ? "+" : " "} ${lineKey(x.line)}`).join("\n  ")}`);
      }
    }
    console.log(`SPACE-1 (b) DART GUN:\n${rows.join("\n")}`);
  });

  it("(b, c, d) every panel on every pinned view, as placed (a finger's: D4; busy; a mouse's; the column): the gaps' shares, nothing cut or overlapping, a tap panel's gaps at least G_MIN in the band and G grown (or at the limit)", () => {
    const tally = new Map<string, { n: number; none: number; g: number; mid: number; under: number }>();
    const add = (k: string, p: PanelPlan) => {
      const t = tally.get(k) ?? { n: 0, none: 0, g: 0, mid: 0, under: 0 };
      t.n++;
      if (!p.gaps.slots) t.none++;
      else if (p.gaps.px >= p.gaps.G) t.g++;
      else if (p.gaps.px >= p.gaps.min) t.mid++;
      else t.under++;
      tally.set(k, t);
    };
    const bad: string[] = [], d4: string[] = [];
    for (const [name, w, h, dpr] of VIEWS) for (const runes of [1, 0]) {
      const f = framed(w, h, dpr, runes), L = f.L, touch = f.tap > 0, vt = `${name} runes ${runes}`;
      const most = L.info.y + L.info.h - (L.bar.y + L.bar.h + 1);
      for (const c of all) {
        const cases: [string, Rect, boolean][] = [];
        const ctx = ctxOf(c.run, L, f.view, touch);
        const placed = panelArea(L, c.sel, { touch, hover: false, busy: false }, panelFit(ctx, c.sel, !!L.phone));
        if (L.portrait) {
          cases.push([placed === L.info ? "phone, a finger's panel in the band" : placed.h >= most ? "phone, a finger's panel grown to the limit (D4: the gaps take what it gives)" : "phone, a finger's panel grown", placed, true]);
          cases.push(["phone, busy (a drag or a belt draw): the band", L.info, true]);
          cases.push(["phone, a mouse's panel: the band", L.info, false]);
        } else cases.push([touch ? "landscape phone's column (a finger)" : "desk and laptop column (a mouse)", L.info, touch]);
        for (const [k, area, t] of cases) {
          const dd = detailsPlan(t === touch ? ctx : ctxOf(c.run, L, f.view, t), c.sel, null, area)!;
          const p = dd.plan;
          add(k, p);
          const why = cutOrOverlap(p, dd.t.labels.length, t ? f.tap : 0);
          if (why.length) bad.push(`${vt} ${k}: ${c.id}: ${why.join("; ")}`);
          if (k.startsWith("phone, a finger's panel in the band") && !(p.gaps.slots === 0 || p.gaps.px >= p.gaps.min)) d4.push(`${vt}: ${c.id} in the band with gaps of ${p.gaps.px}`);
          if (k.startsWith("phone, a finger's panel grown") && !(p.gaps.slots === 0 || p.gaps.px >= p.gaps.G) && area.h < most) d4.push(`${vt}: ${c.id} grown to ${area.h} with gaps of ${p.gaps.px}`);
        }
      }
    }
    const rows = [...tally].map(([k, t]) => `${k}: ${t.n} panels; with gaps ${t.n - t.none}: G ${share(t.g, t.n - t.none)}, G_MIN..G ${share(t.mid, t.n - t.none)}, under G_MIN ${share(t.under, t.n - t.none)}`);
    console.log(`SPACE-1 (b) the gaps over every panel and pinned view:\n${rows.join("\n")}\n(c) cut or overlapping: ${bad.length}\n(d) D4 broken: ${d4.length}`);
    expect(bad.slice(0, 10)).toEqual([]);
    expect(d4.slice(0, 10)).toEqual([]);
    // D4: a finger's panel on a phone never shows a gap under G_MIN in the band, nor under G while it grows, short of the
    // limit (the busy band, a mouse's band, the columns and a panel at the limit take what the room gives, down to 0)
    for (const [k, t] of tally) if (k.startsWith("phone, a finger's") && !k.includes("limit")) expect(t.under, k).toBe(0);
    expect(tally.get("phone, a finger's panel grown")?.mid ?? 0).toBe(0);
  }, 600_000);

  it("(b, c) the ⓘ view (LEVELS and KEYWORDS) keeps its boxes and pages; the room its page leaves goes between its entries, up to G; every row inside its box, none overlapping; DART GUN's shown", () => {
    const rows: string[] = [], bad: string[] = [];
    let views = 0, spaced = 0;
    for (const [name, w, h, dpr, runes] of [["op-402x690", 402, 690, 3, 1], ["op-402x690", 402, 690, 3, 0], ["desk", 1920, 1080, 1, 1]] as const) {
      const f = framed(w, h, dpr, runes), L = f.L, touch = f.tap > 0;
      for (const c of all) {
        const ctx = ctxOf(c.run, L, f.view, touch);
        const area = panelArea(L, c.sel, { touch, hover: false, busy: false }, panelFit(ctx, c.sel, !!L.phone));
        const d = detailsPlan(ctx, c.sel, null, area)!, p = d.plan, r = p.r;
        const items = infoItems(infoLevels(c.run, d.show), panelWords(d.t.body, panelPiece(c.run, d.show)), r.w - 10);
        if (!items.length) continue;
        const free = infoFree(L, r, p.column), view = infoView(items, r, p.y - 1, p.maxY + 2, free);
        for (let pg = 0; pg < view.pages.length; pg++) {
          const dr = infoDrawn(items, r, p.y - 1, p.maxY + 2, free, pg);
          views++;
          let gapped = false;
          dr.rows.forEach((q, i) => {
            const box = dr.boxes[q.area];
            if (!box || q.y < box.y || q.y + q.h > box.y + box.h) bad.push(`${name} ${c.id} page ${pg + 1}: a row outside its box`);
            const n = dr.rows[i + 1];
            if (n && n.area === q.area && n.y < q.y + q.h) bad.push(`${name} ${c.id} page ${pg + 1}: rows overlap`);
            if (n && n.area === q.area && n.y - (q.y + q.h) > 2 + 2 + GAP["5"] + 9) bad.push(`${name} ${c.id} page ${pg + 1}: a gap past G`);
            if (n && n.area === q.area && n.line && q.line && n.y - q.y > 9 + 2) gapped = true;
          });
          if (dr.foot !== null && Math.max(...dr.rows.map((q) => q.y + q.h)) > dr.foot) bad.push(`${name} ${c.id} page ${pg + 1}: a row on the footer`);
          if (gapped) spaced++;
          if (c.id === "cargo dartgun ★1" && pg === 0) rows.push(`${name} runes ${runes} DART GUN in cargo, ⓘ page 1 of ${view.pages.length}: ${dr.rows.map((q) => `${q.y - r.y}${q.section ? ` [${q.section}]` : ` ${q.line!.map((s) => s.t).join("")}`}`).join(" | ")}`);
        }
      }
    }
    console.log(`SPACE-1 the ⓘ view: ${views} pages drawn, ${spaced} with a gap past the old spacing between entries; outside, overlapping or past G: ${bad.length}\n${rows.join("\n")}`);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 300_000);

  it("(c) every buyable piece's shop card (the phone's narrow face with its chip, the wide face with its effect) and every rune's card draw inside their rects: fixed boxes, as before", () => {
    const out: string[] = [];
    const inside = (c: ReturnType<typeof fresh>, r: Rect): number => {
      let n = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (c.at(x, y) !== null && !(x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h)) n++;
      return n + c.oob;
    };
    let cards = 0;
    for (const d of buyableModules()) {
      const st = { sold: false, affordable: true, selected: false, hover: false, pulse: false, hidden: false, shake: 0, badge: null };
      for (const [face, r, s] of [
        ["narrow", { x: 10, y: 10, w: CARD_W, h: CARD_H }, { ...st, chip: shopChipGlyphs(d.id) ?? undefined }],
        ["wide 64", { x: 10, y: 10, w: 64, h: WIDE_CARD_H }, { ...st, effect: cardText(d.id) }],
        ["wide 96", { x: 10, y: 10, w: 96, h: WIDE_CARD_H }, { ...st, effect: cardText(d.id) }],
      ] as const) {
        const c = fresh(130, 70);
        drawCard(gOf(c), r, d, d.price, d.merchant ?? "ironmonger", s, 0);
        cards++;
        const n = inside(c, r);
        if (n) out.push(`${d.id} ${face}: ${n} px outside`);
      }
    }
    let runes = 0;
    for (const def of RUNE_LIST) for (const w of [readoutW(241), readoutW(640)]) {
      const r = { x: 10, y: 10, w, h: runeCardH(def, w, { reminder: true }) };
      const c = fresh(w + 20, r.h + 20);
      drawRuneCard(gOf(c), r, def, { sub: runeTaken(def, 1), reminder: true });
      const q = { ...r, h: runeCardH(def, w, {}) }, c2 = fresh(w + 20, q.h + 20);
      drawRuneCard(gOf(c2), q, def, { sub: runeTag(def) });
      runes += 2;
      const n = inside(c, r) + inside(c2, q);
      if (n) out.push(`rune ${def.id} at ${w}: ${n} px outside`);
    }
    console.log(`SPACE-1 (c) fixed boxes: ${cards} shop cards, ${runes} rune cards; drawn outside their rects: ${out.length}`);
    expect(out).toEqual([]);
    expect(columnButtonH(0)).toBe(16);
  }, 300_000);
});
