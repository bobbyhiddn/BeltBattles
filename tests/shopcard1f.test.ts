// SHOPCARD-1f (REQ-BFG-081, REQ-BFG-115; BRIEF-SHOPCARD1F section 3; READ-13's fix list): display only. One group per fix, each pinning the words, their rows and widths,
// the sim lines that make them true, and that they lay out whole:
//   F1  the merge button's ★ is drawn as a 5x5 star (font.ts TextOpts.star5, set by ui.ts button): the 3x5 face's glyph and every width are unchanged
//   F2  the factory size note `EVERY 2 CELLS PAST 4 GIVE +1 {BELT}.` (written with the stat row's icon) shows only on a factory whose footprint is past 4 cells
//   F3  LIMPET WORKS says which hit: `... 3{SEC} AFTER ITS SLUG HITS ANYTHING.`      F4  ASSEMBLY LINE: `WHILE IT FEEDS A GUN: ...` and its strip line `FEEDS A GUN: ALL RIGS START ...`
//   F5  GRAPNEL GUN: `SHOT: A HIT ON A FOE BELT OR RIG DESTROYS n SLUG(S) NEAR IT.`    F6  QUENCH TANK: `HIT: USES UP EACH BURN ON A SLUG FOR +n DMG.`
//   F7  a rune card's note room holds its longest keyword definition: LOOSE THREAD's FRAY note sits under its effect line (the dawn picker, the rune bar's read-out, LAST CHANCE)
// Only font.ts, ui.ts, faces.ts, abilityText.ts, runeBar.ts and lastChancePicker.ts changed (git diff --name-only shopcard1e-accepted -- src); the sim is untouched.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { installRaster, fresh, G as gOf, diffPx, type RasterCanvas } from "./raster.helpers";
import { C } from "../src/render/palette";
import { STAR5_ROWS, drawText, faceChars, glyphRows, icons, stripIcons, textWidth, wrap } from "../src/render/font";
import { UI, button } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, panelArea, phoneBarLift, phoneScreen, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { detailsPlan, explainPanel, itemPanel, offerLabel, offerPanel, panelFit, planPanel, portraitButtons, visibleLines } from "../src/screens/build/inspector";
import type { Ctx } from "../src/screens/build/actions";
import { newRun, type Run } from "../src/game/run";
import { ITEMS, buyableModules } from "../src/sim/content";
import { effectAt, outputsAt } from "../src/sim/stars";
import { SLOT_EVERY_CELLS, SLOT_FROM_CELLS, footCount, footSlots } from "../src/sim/foot";
import { Battle, type Payload, type SideState, type Target } from "../src/sim/battle";
import type { HarassRound } from "../src/sim/harassment";
import { barge, bench } from "./arsenal.bench";
import { GLOSSARY_WRAP_W } from "../src/ui/glossary";
import { SIZE_RULE, faceAt, shapeLines, shapeNotes } from "../src/ui/faces";
import { cardText, startIn } from "../src/ui/abilityText";
import { RUNES, type RuneDef } from "../src/sim/runes";
import { withHullScale } from "../src/sim/hullScale";
import { KEYWORD_WORD, runeKeywords, runeTag } from "../src/ui/runeText";
import {
  drawRuneCard, readoutW, runeBarTarget, runeCardH, runeCardTextW, runeHintBand, runeNoteLines, runeNoteRows, runeNoteY, runeTapOf, runeWordBoxOn, runeWordLines, runeWordRows,
} from "../src/ui/runeBar";
import { PICK_TAKE, pickLayout } from "../src/screens/runePicker";
import { LC_BAR, LC_TAKE, LastChancePicker, lcRoomRows } from "../src/screens/lastChancePicker";
import { setTipsForTests } from "../src/ui/tips";

installRaster();
const BAND = GLOSSARY_WRAP_W; // 225 px: the phone panel's text width, 5x7
const STARS = [1, 2, 3];
const DAYS: (number | undefined)[] = [undefined, 5, 10];
const rowsOf = (markup: string, width = BAND): string[] => wrap(icons(markup), width, "5").map((r) => stripIcons(r).replace(/\s+/g, " ").trim());
const wOf = (markup: string, font: "5" | "3" = "5"): number => textWidth(icons(markup), font);

/** The build screen as the game frames it (tests/shopcard1e.test.ts's framed). */
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
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
const VIEWS: [string, number, number, number, boolean][] = [["phone 402x690", 402, 690, 3, true], ["phone 360x640", 360, 640, 2, true], ["desk 1920x1080", 1920, 1080, 1, false]];
/** The tapped panel of a piece in cargo (`stars`) on `day`, as the game plans it on view `vi`. */
function cargoPanelPlan(vi: number, def: string, stars: number, day: number) {
  const [, w, h, dpr, touch] = VIEWS[vi];
  const run = newRun("furnace", day, `shopcard1f-${def}-${stars}`);
  run.inventory = [{ uid: 900, def, ...(stars > 1 ? { stars } : {}) }];
  const sel: Sel = { kind: "cargo", uid: 900 }, f = framed(w, h, dpr);
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  const d = detailsPlan(ctx, sel, null, area)!;
  return { d, plan: d.plan, run, sel, ctx };
}
/** A run whose first offer is `def` at `price`, with `owned` copies' stars in cargo (a merge offer: [1] makes ★2, [2, 1] makes ★3). */
const offering = (def: string, price: number, owned: number[] = []): Run => {
  const run = newRun("furnace", 5, `shopcard1f-${def}`);
  run.gold = 99;
  run.inventory = owned.map((st, i) => ({ uid: 900 + i, def, ...(st > 1 ? { stars: st } : {}) }));
  run.shop.wagons = [{ merchant: ITEMS[def].merchant!, offers: [{ def, price, sold: false }] }] as Run["shop"]["wagons"];
  return run;
};

// ------------------------------------------------------------------------------------------------------------------ F1
describe("SHOPCARD-1f F1 (READ-13 round P: 12 of 12 picture readers read the button's star as an asterisk): the merge button draws a real star", () => {
  const old3 = "#.#|.#.|###|.#.|#.#"; // font.ts:239, the 3x5 face's ★: an X with a bar
  const STAR_INK = STAR5_ROWS.split("|").flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "#" ? [[x, y] as [number, number]] : [])));

  it("the 3x5 face's ★ stays as it is for every other 3x5 text (the notes' MERGES INTO lines, LEVELS, the cards, the help card): same glyph, same width, no new glyph in either face", () => {
    expect(glyphRows("★", "3")!.join("|")).toBe(old3);
    expect(glyphRows("★", "5")!.join("|")).toBe("..#..|..#..|#####|.###.|.#.#.|#...#|.....");
    expect(STAR5_ROWS).toBe("..#..|.###.|#####|.###.|.#.#.");
    expect(textWidth("★", "3")).toBe(3);
    expect(textWidth("MERGE ★2: 7G", "3")).toBe(43); // 1e's width: the layout (buttons, rewrap, hints) reads textWidth, which is unchanged
    expect(textWidth("MERGE ★3: 13G", "3")).toBe(47);
    expect(faceChars("3")).not.toContain(""); // the star's sprite key is in neither glyph map
    expect(faceChars("5")).not.toContain("");
    // a plain draw (no star5) is the 3x5 glyph: its ink is exactly old3's
    const a = fresh(60, 9), x0 = 4, y0 = 2, sx = x0 + textWidth("MERGE ", "3") + 1;
    drawText(gOf(a), "MERGE ★2: 7G", x0, y0, C.ink, { font: "3" });
    const ink: [number, number][] = [];
    old3.split("|").forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") ink.push([sx + x, y0 + y]); }));
    for (const [x, y] of ink) expect(a.at(x, y), `3x5 glyph ink at ${x},${y}`).toBe(C.ink);
  });

  it("star5 draws the 5x5 star over the blank before the ★ (2 px left of its slot) and moves nothing: every other pixel of the label is the plain draw's, the star's ink is STAR5_ROWS", () => {
    const x0 = 4, y0 = 2, sx = x0 + textWidth("MERGE ", "3") + 1;
    for (const label of ["MERGE ★2: 7G", "MERGE ★3: 7G", "MERGE ★2: 13G", "MERGE ★3: 1G"]) {
      const plain = fresh(70, 9), star = fresh(70, 9), want = fresh(70, 9);
      drawText(gOf(plain), label, x0, y0, C.ink, { font: "3" });
      const w = drawText(gOf(star), label, x0, y0, C.ink, { font: "3", star5: true });
      expect(w, `${label}: drawText returns the layout width`).toBe(textWidth(label, "3"));
      // expected: the plain picture with the 3-wide glyph's 3x5 cells cleared and the 5x5 star painted in the text colour
      want.px = [...plain.px];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) want.px[(y0 + y) * 70 + sx + x] = null;
      for (const [x, y] of STAR_INK) want.px[(y0 + y) * 70 + (sx - 2 + x)] = C.ink;
      expect(diffPx(star, want), label).toEqual([]);
      // the star sits on the space's blank columns and the old glyph's: nothing else of the string is touched (columns left of sx - 2 and right of sx + 2)
      for (const [x, y] of diffPx(star, plain)) expect(x >= sx - 2 && x <= sx + 2 && y >= y0 && y < y0 + 5, `${label}: changed pixel ${x},${y}`).toBe(true);
    }
  });

  it("only a ★ after a space, in the 3x5 face, drawn with star5, is the star: no space before it, the 5x7 face, and a draw without star5 are the glyphs as before", () => {
    const same = (s: string, font: "3" | "5", star5: boolean): void => {
      const a = fresh(90, 12), b = fresh(90, 12);
      drawText(gOf(a), s, 3, 2, C.ink, { font });
      drawText(gOf(b), s, 3, 2, C.ink, { font, ...(star5 ? { star5: true } : {}) });
      expect(diffPx(a, b), `${font} ${star5} ${s}`).toEqual([]);
    };
    same("MERGE★2: 7G", "3", true); // no space before it: the 3x5 glyph
    same("★2", "3", true); // at the start: the 3x5 glyph
    same("MERGE ★2: 7G", "5", true); // the 5x7 face's ★ is a star already and star5 leaves it
    same("NEXT ★2: +4 BURN.", "3", false); // a note line without star5 (every text that is not a button's label)
    same("BUY 7G", "3", true); // no ★ at all
    same("SALE: BUY 6G", "3", true);
  });

  it("button(): the merge label's star lies inside the button at every price 1-13 and at the narrowest button of every view; the button's own rect is the label-width one (nothing moves)", () => {
    const ui = new UI();
    for (let p = 1; p <= 13; p++) for (const to of [2, 3]) {
      const label = offerLabel({ kind: "gate", price: 99 } as never, p, to), tw = textWidth(label, "3");
      expect(label).toBe(`MERGE ★${to}: ${p}G`);
      // the narrowest button a label can have (its text + 4, the brief's rule) and the widest panel button (64 px); and the desk column's width (116)
      for (const bw of [tw + 4, 64, 116]) {
        const r = { x: 3, y: 2, w: bw, h: 13 }, a = fresh(bw + 6, 17), b = fresh(bw + 6, 17);
        button(ui, gOf(a), "x", r, "", { font: "3", primary: true });
        button(ui, gOf(b), "x", r, label, { font: "3", primary: true });
        const ink = diffPx(a, b); // the label's own ink: every pixel the label adds to the empty button
        expect(ink.length, `${label} in ${bw}`).toBeGreaterThan(20);
        const minX = Math.min(...ink.map(([x]) => x)), maxX = Math.max(...ink.map(([x]) => x));
        expect(minX, `${label} in ${bw}: left edge`).toBeGreaterThanOrEqual(r.x + 2);
        expect(maxX, `${label} in ${bw}: right edge`).toBeLessThanOrEqual(r.x + bw - 3);
        for (const [, y] of ink) expect(y >= r.y + 2 && y <= r.y + r.h - 3, `${label} in ${bw}: row ${y}`).toBe(true);
      }
    }
    // the sized buttons (portraitButtons) of the narrow phone band are the label-width ones of 1e: 43 px of label + 10
    const band = { x: 3, y: 100, w: 161, h: 69 };
    expect(portraitButtons("WHETSTONE", "COMMON RIG", [offerLabel(ITEMS.whetstone, 3, 2)], band).rects[0].w).toBeGreaterThanOrEqual(textWidth("MERGE ★2: 3G", "3") + 4);
  });

  it("star5 is passed by ui.ts button alone: no other 3x5 text draws the new star (source)", () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = `${dir}/${f}`;
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts") && /star5/.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    walk("src");
    expect(hits.sort()).toEqual(["src/render/font.ts", "src/ui/ui.ts"]);
    expect(readFileSync("src/ui/ui.ts", "utf8").match(/star5: true/g)!.length).toBe(2); // the label, with and without a sub line
  });

  it("the button on the real panel: the ★2 and ★3 offers of GANTRY PRESS and WHETSTONE read `MERGE ★n: pG` (the string is 1e's: the picture's star is the only change)", () => {
    for (const def of ["gantry", "whetstone"]) {
      const list = ITEMS[def].price;
      expect(offerPanel(offering(def, list, [1]), 0, 0)!.labels).toEqual([`MERGE ★2: ${list}G`]);
      expect(offerPanel(offering(def, list, [2, 1]), 0, 0)!.labels).toEqual([`MERGE ★3: ${list}G`]);
    }
  });
});

// ------------------------------------------------------------------------------------------------------------------ F2
describe("SHOPCARD-1f F2 (READ-13: 4 of 6 phone readers stumbled on `A FACTORY'S EVERY 2 CELLS PAST 4 ADD A BELT SLOT.` on a 3-cell factory): the size note, with {BELT}, only where it applies", () => {
  it("the note is `EVERY 2 CELLS PAST 4 GIVE +1 {BELT}.`: the stat row's icon, no BELT SLOT, one row of the 225 px band", () => {
    expect(stripIcons(SIZE_RULE)).toBe("EVERY 2 CELLS PAST 4 GIVE +1 .");
    expect(SIZE_RULE).toBe(icons("EVERY 2 CELLS PAST 4 GIVE +1 {BELT}."));
    expect(SIZE_RULE).not.toMatch(/SLOT/);
    expect(SLOT_EVERY_CELLS).toBe(2);
    expect(SLOT_FROM_CELLS).toBe(4);
    expect(wOf("EVERY 2 CELLS PAST 4 GIVE +1 {BELT}.")).toBe(167); // was 265 px, two rows
    expect(rowsOf("EVERY 2 CELLS PAST 4 GIVE +1 {BELT}.").length).toBe(1);
  });

  it("shapeNotes gives it to a factory only where footSlots (foot.ts:128) is above 0: GANTRY PRESS's 2x3 (6 cells: +1), not ASSEMBLY LINE's 3 cells; every shaped factory by that rule", () => {
    expect(footCount(ITEMS.gantry)).toBe(6);
    expect(footSlots(ITEMS.gantry)).toBe(1);
    expect(shapeNotes("gantry")).toEqual([SIZE_RULE]);
    expect(footCount(ITEMS.assembly)).toBe(3);
    expect(footSlots(ITEMS.assembly)).toBe(0);
    expect(shapeNotes("assembly")).toEqual([]);
    let n = 0;
    for (const d of Object.values(ITEMS).filter((x) => x.kind === "factory")) {
      const notes = shapeNotes(d.id);
      expect(notes.includes(SIZE_RULE), `${d.id}: ${footCount(d)} cells`).toBe(footSlots(d) > 0 && notes.length > 0);
      if (footSlots(d) === 0) expect(notes, d.id).toEqual([]);
      n++;
    }
    expect(n).toBeGreaterThan(14);
    // the sim's number the note and the BIGGER line both say (stars.ts:161-165 outputsAt adds footSlots): GANTRY PRESS 4 / 5 / 6, ASSEMBLY LINE 2 / 3 / 4
    expect(STARS.map((s) => outputsAt("gantry", s))).toEqual([4, 5, 6]);
    expect(STARS.map((s) => outputsAt("assembly", s))).toEqual([2, 3, 4]);
    // the two agree: GANTRY PRESS's BIGGER line is `BIGGER: +1 {BELT}` (the same icon, the same +1)
    expect(shapeLines("gantry", 1).map((r) => r.text)).toContain(icons(`BIGGER: +${footSlots(ITEMS.gantry)} {BELT}`));
    expect(SIZE_RULE.endsWith(icons(`+${footSlots(ITEMS.gantry)} {BELT}.`))).toBe(true);
  });

  it("the ⓘ NOTES of the panels: GANTRY PRESS lists the note (in its NOTES, not on its face), ASSEMBLY LINE's notes carry none", () => {
    const text = (bs: { text: string }[]): string[] => bs.map((b) => b.text);
    const gp = explainPanel(offerPanel(offering("gantry", 7), 0, 0)!, "gantry"), al = explainPanel(offerPanel(offering("assembly", 4), 0, 0)!, "assembly");
    expect(text(gp.notes ?? [])).toContain(SIZE_RULE);
    expect(text(gp.body)).not.toContain(SIZE_RULE);
    expect(text(al.notes ?? []).some((t) => /CELLS PAST/.test(t))).toBe(false);
    // and on a placed piece (itemPanel), as tests/shapes1.cards.test.ts pins for GANTRY PRESS
    const run = newRun("furnace", 5, "shopcard1f-f2");
    run.build.items.push({ uid: 9, def: "assembly", x: 0, y: 7 } as never);
    expect(text(explainPanel(itemPanel(run, 9, false)!, "assembly").notes ?? []).some((t) => /CELLS PAST/.test(t))).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------------------------ F3-F6 shared
/** A row-by-row check that the second row of a face line lays out whole on the three views (tests/shopcard1e.test.ts E2's). */
function laysOutWhole(def: string, rules: (s: number, day: number) => string): number {
  let panels = 0;
  for (let vi = 0; vi < VIEWS.length; vi++) for (const day of [1, 5, 10]) for (const s of STARS) {
    const { plan } = cargoPanelPlan(vi, def, s, day);
    const vis = visibleLines(plan).flatMap((v) => (v.line === "rule" ? [] : [{ y: v.y, line: v.line }]));
    const text = (l: { line: { spans: { t: string }[] } }): string => l.line.spans.map((sp) => sp.t).join("");
    const joined = vis.map(text).join(" ").replace(/\s+/g, " ");
    const words = stripIcons(icons(rules(s, day))).replace(/\s+/g, " ").split(" ").filter((x) => x && !/\d/.test(x));
    let at = 0;
    for (const word of words) {
      const i = joined.indexOf(word, at);
      expect(i, `${def} ${VIEWS[vi][0]} day ${day} ★${s}: "${word}" among the visible lines`).toBeGreaterThanOrEqual(0);
      at = i + word.length;
    }
    vis.forEach((l, i) => {
      if (i) expect(l.y - vis[i - 1].y, `${def} ${VIEWS[vi][0]} day ${day} ★${s}: line ${i} under line ${i - 1}`).toBeGreaterThanOrEqual((vis[i - 1].line as unknown as { pitch: number }).pitch);
      expect(l.y + ((l.line as unknown as { font: string }).font === "5" ? 7 : 5), `${def} ${VIEWS[vi][0]} day ${day} ★${s}: line ${i} inside the panel`).toBeLessThanOrEqual(plan.maxY);
    });
    panels++;
  }
  return panels;
}
const ruleOf = (def: string, s: number, day: number | undefined, o: Record<string, unknown> = {}): string => faceAt(def, s, { k: 1, hero: "furnace", day, ...o })!.rules[0].text;

// ------------------------------------------------------------------------------------------------------------------ F3
describe("SHOPCARD-1f F3 (READ-13: 12 of 12 answers asked which hit LIMPET WORKS means; H3 round 1's `ONE OF ITS SLUGS HITS` left `hits what?` or `once per slug?` in 5 of 6, round 2's `ANYTHING` `does a ward count?` in 4 of 6: the better form is kept): the hit is its slug's, on anything", () => {
  const LIMPET = (delay = "3"): string => `THE {DMG} LANDS ONCE, AS A BLAST ON THE FOE'S HULL, ${delay}{SEC} AFTER ITS SLUG HITS ANYTHING.`;

  it("`THE {DMG} LANDS ONCE, AS A BLAST ON THE FOE'S HULL, 3{SEC} AFTER ITS SLUG HITS ANYTHING.` at every star on days 1, 5 and 10: two rows of the 225 px band, 433 px, the delay the only digit", () => {
    for (const s of STARS) for (const day of DAYS) {
      const line = ruleOf("limpet", s, day);
      expect(line, `★${s} day ${day}`).toBe(LIMPET());
      expect(rowsOf(line).length, `★${s} day ${day}`).toBe(2);
      expect(wOf(line), `★${s} day ${day}`).toBe(433);
      expect(stripIcons(icons(line)).replace(/3/, "").match(/\d/), `★${s} day ${day}: no other digit`).toBeNull();
    }
    expect(rowsOf(LIMPET())).toEqual(["THE LANDS ONCE, AS A BLAST ON THE FOE'S", "HULL, 3 AFTER ITS SLUG HITS ANYTHING."]);
    expect(laysOutWhole("limpet", (s, day) => ruleOf("limpet", s, day))).toBe(VIEWS.length * 3 * STARS.length);
  });

  it("the truth (battle.ts:2191 impact -> 2318-2351 roundImpact, 2428-2444 hullEffects): a slug that carries LIMPET WORKS' round queues one charge on whatever it hits, a part or the hull; the blast takes the hit side's hull `delay` s later", () => {
    const round: HarassRound = { kind: "limpet", delay: 3, blast: 8, stall: 0 } as HarassRound;
    const kinds: Target["kind"][] = ["factory", "turret", "hull", "belt", "gate"];
    let n = 0;
    for (const kind of kinds) {
      const bt = new Battle(barge(), bench([["whetstone", 4, 3, 1]]), 8), s: SideState = bt.sides[1];
      for (const f of s.factories) f.timer = 1000;
      const t: Target | undefined = kind === "hull" ? { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 } : s.targets.find((x) => x.kind === kind); // the hull is no entry of s.targets (impact's hullTarget())
      expect(t, `a ${kind} target`).toBeDefined();
      (bt as unknown as { roundImpact(s: SideState, t: Target, r: HarassRound, from: 0 | 1): void }).roundImpact(s, t!, round, 0);
      expect(s.limpets, `a hit on a ${kind} queues one charge on the hit side`).toHaveLength(1);
      expect(bt.sides[0].limpets, `none on the shooter's side`).toHaveLength(0);
      expect(s.limpets[0].at - bt.t, `${kind}: the blast waits the round's delay`).toBeCloseTo(3, 9);
      const hp = s.hull.hp;
      while (bt.t + 1e-9 < 3.2) bt.step();
      expect(s.limpets, `${kind}: the charge is gone after its blast`).toHaveLength(0);
      expect(bt.events.filter((e) => e.type === "limpet" && e.side === 1), `${kind}: one blast event, on the hit side`).toHaveLength(1);
      expect(hp, "the hull was whole").toBeGreaterThan(0);
      n++;
    }
    expect(n).toBe(5);
    // a rig's hit on a slug (applyHit) queues no charge: only impact (a shot landing) reaches roundImpact
    const src = readFileSync("src/sim/battle.ts", "utf8");
    expect(src.match(/this\.roundImpact\(/g)!.length).toBe(1);
    expect(src).toMatch(/if \(pr\.payload\.harass\) this\.roundImpact\(def, hit, pr\.payload\.harass, pr\.from, pr\.payload\.debuffs\);/);
  });
});

// ------------------------------------------------------------------------------------------------------------------ F4
describe("SHOPCARD-1f F4 (READ-13: 9 of 12 readers asked whether a belt that reaches a turret is enough): ASSEMBLY LINE's condition is `WHILE IT FEEDS A GUN`, and its strip line says ALL", () => {
  it("`WHILE IT FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING n% SOONER.` (★3: AT ONCE.) at every star on days 1, 5 and 10: two rows of the 225 px band, 400 / 400 / 382 px", () => {
    const px = [400, 400, 382];
    for (const s of STARS) for (const day of DAYS) {
      const line = ruleOf("assembly", s, day), soon = startIn(effectAt("assembly", s).factory!.commission!);
      expect(line, `★${s} day ${day}`).toBe(`WHILE IT FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING ${soon}.`);
      expect(soon).toBe(["50% SOONER", "75% SOONER", "AT ONCE"][s - 1]);
      expect(rowsOf(line).length, `★${s} day ${day}`).toBe(2);
      expect(wOf(line), `★${s} day ${day}`).toBe(px[s - 1]);
    }
    expect(rowsOf("WHILE IT FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING 50% SOONER.")).toEqual(["WHILE IT FEEDS A GUN: EACH FIGHT, ALL", "YOUR RIGS START WORKING 50% SOONER."]);
    expect(laysOutWhole("assembly", (s, day) => ruleOf("assembly", s, day))).toBe(VIEWS.length * 3 * STARS.length);
  });

  it("the 360x640 strip's line (abilityText.ts card) says ALL RIGS START: `FEEDS A GUN: ALL RIGS START 50% SOONER.` (★3: AT ONCE); on the tests' 174 px strip it takes two lines, as 1e's `RIGS WORK` line did (123 px against a first line of 112 or 91)", () => {
    expect(cardText("assembly", { k: 1 })).toBe("FEEDS A GUN: ALL RIGS START 50% SOONER."); // the card's text is the 1-star one; the ★3 form is the same entry's `startIn(0)`:
    expect(`FEEDS A GUN: ALL RIGS START ${startIn(effectAt("assembly", 3).factory!.commission!)}.`).toBe("FEEDS A GUN: ALL RIGS START AT ONCE.");
    expect(textWidth("FEEDS A GUN: ALL RIGS START 50% SOONER.", "3")).toBe(144); // 142 without the full stop
    expect(textWidth("FEEDS A GUN: ALL RIGS START AT ONCE.", "3")).toBe(132);
    expect(textWidth("FEEDS A GUN: RIGS WORK 50% SOONER.", "3")).toBe(125); // 1e's: also past the strip's first line (112 or 91 px)
    // as the game plans the strip (tests/abilityPanels.test.ts: buildLayout(180, 353, true, 5).info): the whole line, on at most two lines, for a buy and a merge button
    const strip = buildLayout(180, 353, true, 5).info;
    for (const owned of [[], [1], [2, 1]]) {
      const t = offerPanel(offering("assembly", 4, owned), 0, 0)!, p = planPanel(t, strip);
      expect(p.headerOnly, `owned ${owned}`).not.toBeNull();
      expect(p.headerOnly!.lines.join(" "), `owned ${owned}`).toBe(t.headerOnly!.texts[0]);
      expect(p.headerOnly!.lines.length, `owned ${owned}`).toBeLessThanOrEqual(2);
      expect(t.headerOnly!.texts[0].startsWith("FEEDS A GUN: ALL RIGS START "), `owned ${owned}`).toBe(true);
      for (const [i, l] of p.headerOnly!.lines.entries()) expect(textWidth(l, "3"), `owned ${owned}: line ${i}`).toBeLessThanOrEqual(i === 0 ? p.subMax : strip.w - 27);
    }
  });

  it("the truth (battle.ts:2574-2587 assemblyLines, 714-736 makeSide): a line counts only while one of its belts reaches a turret, and then every rig of yours, on any belt, starts at x the best line's factor", () => {
    const src = readFileSync("src/sim/battle.ts", "utf8");
    expect(src).toMatch(/if \(fs\?\.commission === undefined \|\| !routeInfo\(b, i, claims, occ, hits\)\.connected\) return;/);
    expect(src).toMatch(/factor = Math\.min\(factor, fs\.commission\);/);
    expect(STARS.map((s) => effectAt("assembly", s).factory!.commission)).toEqual([0.5, 0.25, 0]); // 50% SOONER, 75% SOONER, AT ONCE
    // (tests/txt096.faces.test.ts runs it: a press on another belt, that belt's rig online at COMMISSION_BASE x commission; unfed, nothing changes)
  });
});

// ------------------------------------------------------------------------------------------------------------------ F5
describe("SHOPCARD-1f F5 (READ-13: 10 of 12 readers asked whether GRAPNEL GUN's ripped slug is destroyed or taken): it is destroyed", () => {
  const GRAPNEL = (n: number): string => `SHOT: A HIT ON A FOE BELT OR RIG DESTROYS ${n} SLUG${n === 1 ? "" : "S"} NEAR IT.`;

  it("`SHOT: A HIT ON A FOE BELT OR RIG DESTROYS n SLUG(S) NEAR IT.` at every star and class factor: two rows of the 225 px band (307 px, 313 at ★2 and ★3); the ladder and the SHOT note keep RIPS", () => {
    const px = [307, 313, 313];
    for (const s of STARS) for (const k of [1, 2]) for (const day of DAYS) {
      const n = effectAt("grapnel", s).core!.rip!, line = faceAt("grapnel", s, { k, day })!.rules[0].text;
      expect(line, `★${s} k${k} day ${day}`).toBe(GRAPNEL(n));
      expect(rowsOf(line).length, `★${s}`).toBe(2);
      expect(wOf(line), `★${s}`).toBe(px[s - 1]);
    }
    expect(rowsOf(GRAPNEL(1))).toEqual(["SHOT: A HIT ON A FOE BELT OR RIG DESTROYS", "1 SLUG NEAR IT."]);
    expect(faceAt("grapnel", 1, { k: 1 })!.nums.find(([k]) => k === "rip")![1]).toBe("RIPS 1"); // the ⓘ ladder `RIPS 1/2/3` is not in this job
    expect(effectAt("grapnel", 3).core!.rip).toBe(3);
  });

  it("the truth (battle.ts:2190 impact -> 2355-2386 rip(def, ...) with `def` the side that was hit): the picked slugs are spliced off the FOE's belt and nothing is added to the shooter; only a belt or rig hit rips", () => {
    const mk = (): { bt: Battle; foe: SideState; me: SideState } => {
      const bt = new Battle(barge(), bench(), 8);
      for (const f of bt.sides[1].factories) f.timer = 1000;
      return { bt, foe: bt.sides[1], me: bt.sides[0] };
    };
    const payload = (id: number): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false });
    const tgt = (s: SideState, kind: Target["kind"], ref: number, cell = -1): Target => s.targets.find((x) => x.kind === kind && x.ref === ref && x.cell === cell)!;
    const { bt, foe, me } = mk();
    const r = foe.routes[0];
    r.ammo.push({ p: payload(22), s: 35, processed: 2, blocked: false }, { p: payload(11), s: 25, processed: 1, blocked: false });
    const mineBefore = me.routes.map((x) => x.ammo.length), tuStack = me.turrets.map((t) => t.stack.length);
    const rip = (bt as unknown as { rip(s: SideState, t: Target, count: number, reach: number): number }).rip.bind(bt);
    expect(rip(foe, tgt(foe, "belt", 0, 2), 1, 1)).toBe(1);
    expect(r.ammo.map((a) => a.p.id), "the nearest slug is gone from the foe's belt").toEqual([22]);
    expect(me.routes.map((x) => x.ammo.length), "no slug appears on the shooter's belts").toEqual(mineBefore);
    expect(me.turrets.map((t) => t.stack.length), "nor in its turrets").toEqual(tuStack);
    expect(bt.events.find((e) => e.type === "rip")).toMatchObject({ type: "rip", payload: 11 });
    // a hit on a factory, a turret or the hull rips nothing
    const o = mk();
    o.foe.routes[0].ammo.push({ p: payload(5), s: 25, processed: 1, blocked: false });
    for (const kind of ["factory", "turret", "hull"] as const) {
      const t: Target = kind === "hull" ? { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 } : o.foe.targets.find((x) => x.kind === kind)!;
      expect((o.bt as unknown as { rip(s: SideState, t: Target, c: number, r: number): number }).rip(o.foe, t, 1, 1), kind).toBe(0);
    }
    expect(o.foe.routes[0].ammo).toHaveLength(1);
  });
});

// ------------------------------------------------------------------------------------------------------------------ F6
describe("SHOPCARD-1f F6 (READ-13: the one answer below R was a desk Haiku on `INTO (is the burn removed or kept)`; H3 round 1's `SWAPS` left `whether the burn is lost for good` in 1 of 6): the burn is used up", () => {
  const QUENCH = (d: string): string => `HIT: USES UP EACH {*BURN} ON A {SLUG} FOR +${d} {DMG}.`;

  it("`HIT: USES UP EACH {*BURN} ON A {SLUG} FOR +n {DMG}.` at every star on days 1, 5 and 10: one row of the 225 px band (at most 223 px, 3 digits)", () => {
    let widest = 0;
    for (const s of STARS) for (const day of DAYS) {
      const line = ruleOf("quench", s, day);
      expect(line, `★${s} day ${day}`).toMatch(/^HIT: USES UP EACH \{\*BURN\} ON A \{SLUG\} FOR \+\d+ \{DMG\}\.$/);
      expect(rowsOf(line).length, `★${s} day ${day}: ${line}`).toBe(1);
      widest = Math.max(widest, wOf(line));
    }
    expect(widest).toBeLessThanOrEqual(225);
    expect(wOf(QUENCH("72"))).toBe(217);
    expect(wOf(QUENCH("126"))).toBe(223);
    expect(laysOutWhole("quench", (s, day) => ruleOf("quench", s, day))).toBe(VIEWS.length * 3 * STARS.length);
  });

  it("the truth (battle.ts:1729-1734 applyHit): QUENCH TANK has no stack cap at any star, so every Burn on the slug is spent into perBurn damage each and none is left (`p.burn -= spent`)", () => {
    for (const s of STARS) {
      expect(effectAt("quench", s).gate!.quench!.stacks, `★${s}: no stacks cap`).toBeUndefined();
      const bt = new Battle(bench([["quench", 4, 3, s]]), barge(), 7), side = bt.sides[0];
      side.gates[0].online = true;
      side.factories[0].timer = 1000;
      const a = { p: { id: 91, ammo: "plain", ride: 3, mult: 1, flat: 0, burn: 10, shock: false, prior: 0, factory: 1, copy: false } as Payload, s: 30, processed: 2, blocked: false };
      (bt as unknown as { applyHit(s: SideState, a: unknown, h: unknown): void }).applyHit(side, a, side.routes[0].gateAt[2][0]);
      expect(a.p.burn, `★${s}: the spent Burn leaves the slug`).toBe(0);
      expect(a.p.flat, `★${s}: 10 stacks became 10 x perBurn`).toBe(10 * effectAt("quench", s).gate!.quench!.perBurn);
    }
  });
});

// ------------------------------------------------------------------------------------------------------------------ F7
describe("SHOPCARD-1f F7 (REVIEW-FIX099G open item 1): a rune card's note room holds its longest keyword definition, so the note never covers the effect line it explains", () => {
  const withKw = (): RuneDef[] => Object.values(RUNES).filter((d) => runeKeywords(d).length > 0);
  const FRAY_RUNES = ["loose_thread", "tangle_wire", "thread_storm"];

  it("the rows: at the phone's 233 px card LOOSE THREAD, TANGLE WIRE, THREAD STORM (FRAY) and TOLL ROAD (RIG) need 2 rows against their chip's 1; at the desk's 300 px no card does; every other rune's room is its chip's", () => {
    const over: string[] = [];
    withHullScale(() => {
      for (const [w, day] of [[233, 1], [233, 7], [233, 10], [300, 1], [300, 10]] as [number, number][]) {
        for (const d of withKw()) {
          const tw = runeCardTextW(w), chip = runeNoteLines(d, tw).length, rows = runeNoteRows(d, tw, day);
          expect(rows, `${d.id} ${w} day ${day}`).toBe(Math.max(chip, runeWordRows(d, tw, day)));
          if (rows > chip) over.push(`${w} ${d.id}`);
        }
      }
    }, true);
    expect([...new Set(over)].sort()).toEqual(["233 loose_thread", "233 thread_storm", "233 tangle_wire", "233 toll_road"].sort());
    expect(FRAY_RUNES.every((id) => runeKeywords(RUNES[id]).includes("FRAY" as never))).toBe(true);
    // a rune with no keyword (a stand-in def): the room is the chip's, nothing to size
    const none = { ...RUNES.loose_thread, id: "none_x", text: "ADDS NOTHING." } as unknown as RuneDef;
    if (runeKeywords(none).length === 0) expect(runeWordRows(none, 223)).toBe(0);
  });

  it("the dawn picker's open card: its room holds the note, so with the FRAY note open no pixel at or above the effect lines' foot changes, the box sits inside the room, and the TAP AGAIN target is the one with no note (nothing a press reaches moves)", () => {
    let checked = 0;
    withHullScale(() => {
      for (const [w, tap] of [[233, 27], [233, 0], [205, 30], [300, 0]] as [number, number][]) for (const day of [1, 7, 10]) for (const d of withKw()) {
        for (const k of runeKeywords(d)) {
          const word = KEYWORD_WORD[k], tw = runeCardTextW(w), at = `${d.id} ${word} w${w} tap${tap} day${day}`;
          const card = { x: 4, y: 4, w, h: runeCardH(d, w, { reminder: true, hint: PICK_TAKE, tap, day }) };
          const a = fresh(w + 8, card.h + 8), b = fresh(w + 8, card.h + 8);
          drawRuneCard(gOf(a), card, d, { sub: runeTag(d), reminder: true, word: null, hint: PICK_TAKE, tap, day, open: true });
          drawRuneCard(gOf(b), card, d, { sub: runeTag(d), reminder: true, word, hint: PICK_TAKE, tap, day, open: true });
          const y = runeNoteY(card, d, day), box = runeWordBoxOn(card, d, word, day)!, lines = runeWordLines(d, k, tw, day).length;
          for (const [, py] of diffPx(a, b)) expect(py, `${at}: a changed pixel above the room`).toBeGreaterThanOrEqual(y - 1);
          expect(box.y, `${at}: the box starts at the room's top`).toBe(y - 1);
          expect(box.h, at).toBe(lines * 7 + 3);
          const band = runeHintBand(card, tap);
          expect(box.y + box.h, `${at}: the box ends inside the room`).toBeLessThanOrEqual(band.y + 1);
          expect(runeBarTarget(card, PICK_TAKE, tap, box), `${at}: the bar's target with the note`).toEqual(runeBarTarget(card, PICK_TAKE, tap, null));
          checked++;
        }
      }
    }, true);
    expect(checked).toBeGreaterThan(300);
  });

  it("LOOSE THREAD on the phone: the open picker card is one row (7 px) taller than 1e's, its effect line is whole above the note, and the stack still fits a 402x690 phone", () => {
    const def = RUNES.loose_thread, tw = runeCardTextW(233);
    withHullScale(() => {
      for (const day of [1, 7]) {
        const eff = runeCardH(def, 233, { day }), open = runeCardH(def, 233, { reminder: true, hint: PICK_TAKE, tap: 27, day });
        const was = 31 + 9 + (1 + runeNoteLines(def, tw).length * 7) + 27 - 1 + 4; // 1e: head, one effect line, a 1-row room, the 26 px band, the foot
        expect(runeNoteRows(def, tw, day), `day ${day}`).toBe(2);
        expect(open - was, `day ${day}: one row taller`).toBe(7);
        expect(eff, `day ${day}: a closed card is the same`).toBe(31 + 9 + 4);
        const L = pickLayout(241, 414, ["loose_thread", "many_hands", "thread_storm"], 0, 0, undefined, 27, day);
        expect(L.bottom, `day ${day}: the picker's stack fits`).toBeLessThanOrEqual(414);
      }
    }, true);
  });

  it("the rune bar's read-out: with a note shown its foot comes down by the room (one row for LOOSE THREAD), its top, chip and words stay; no pixel above the room changes", () => {
    const def = RUNES.loose_thread, w = readoutW(241);
    withHullScale(() => {
      for (const day of [1, 7]) {
        const tw = runeCardTextW(w), shut = runeCardH(def, w, { day }), room = runeCardH(def, w, { reminder: true, day });
        expect(room - shut, `day ${day}: the room is 1 + rows x 7`).toBe(1 + runeNoteRows(def, tw, day) * 7);
        const card = { x: 4, y: 4, w, h: room }, a = fresh(w + 8, room + 8), b = fresh(w + 8, room + 8);
        drawRuneCard(gOf(a), card, def, { sub: "X", reminder: true, word: null, day });
        drawRuneCard(gOf(b), card, def, { sub: "X", reminder: true, word: "FRAY", day });
        for (const [, py] of diffPx(a, b)) expect(py, `day ${day}: a changed pixel above the room`).toBeGreaterThanOrEqual(runeNoteY(card, def, day) - 1);
      }
    }, true);
  });

  it("LAST CHANCE's RUNE card: the open card keeps the room (lcRoomRows), the FRAY note's box starts under the effect line (it grew up over it, and over half the sub line, before), and the TAP AGAIN target is the note-free one", () => {
    setTipsForTests("done");
    try {
      const rows: string[] = [];
      for (const day of [1, 7]) withHullScale(() => {
        const f = framed(402, 690, 3, 0), ui = new UI();
        ui.pointer.kind = "touch";
        const run = newRun("weaver", 5, `shopcard1f-lc-${day}`);
        run.day = day;
        (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 6 };
        const s = { run, refit: false, touch: true, L: f.L, t: 0, game: { W: f.W, H: f.H, ui, view: f.view, canvas: null, error: () => {}, resize: () => {}, toast: () => {} }, touched: () => {}, lcHeartT: Infinity };
        const lc = new LastChancePicker();
        lc.offer = (x) => { const o = Object.getPrototypeOf(lc).offer.call(lc, x); return o ? { ...o, rune: { ...(o.rune ?? {}), id: "loose_thread" } } : o; };
        const frame = (): RasterCanvas => { const c = fresh(f.W, f.H); ui.begin(); lc.draw(gOf(c), s as never); ui.end(); return c; };
        const press = (id: string): void => { lc.pressed(id); ui.regions.find((q) => q.id === id)?.onTap?.(); };
        frame();
        press("lcpick-rune");
        const closed = frame();
        const card = ui.regions.find((q) => q.id === "lcpick-rune")!.r;
        const wr = ui.regions.find((q) => q.id.startsWith("lcrune-w") && q.id.endsWith(":FRAY"))!;
        expect(wr, `day ${day}: FRAY's target`).toBeDefined();
        const bar0 = ui.regions.find((q) => q.id === LC_BAR)!.r;
        press(wr.id);
        const shown = frame();
        const box = ui.regions.find((q) => q.id === "lcrune-def")!.r, bar = ui.regions.find((q) => q.id === LC_BAR)!.r, def = RUNES.loose_thread;
        const base = runeCardH(def, card.w, { day }) - 4;
        expect(lcRoomRows(def, card.w, true, [], day), `day ${day}`).toBe(2);
        expect(lcRoomRows(def, card.w, false, [], day), `day ${day}: a closed card has none`).toBe(0);
        expect(box.y, `day ${day}: the box starts under the effect line`).toBeGreaterThanOrEqual(card.y + base - 2);
        expect(box.y + box.h, `day ${day}: and ends inside the card`).toBeLessThanOrEqual(card.y + card.h);
        expect(bar, `day ${day}: the bar's target with the note is the one without it`).toEqual(bar0);
        expect(bar, `day ${day}`).toEqual(runeBarTarget(card, LC_TAKE, runeTapOf(s as never), box));
        for (const [, py] of diffPx(closed, shown)) expect(py, `day ${day}: a changed pixel above the box`).toBeGreaterThanOrEqual(box.y);
        rows.push(`day ${day}: card ${card.w}x${card.h}, box y ${box.y - card.y} h ${box.h}, base ${base}`);
      }, true);
      expect(rows).toHaveLength(2);
    } finally {
      setTipsForTests("reload");
    }
  });
});
