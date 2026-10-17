// SHOPCARD-1d (REQ-BFG-081, REQ-BFG-115; BRIEF-SHOPCARD1D section 3; READ-11's fix list items 1 and 2): TWIN LATCH's face says both its arrows
// must point at belts (H1), and LIMPET WORKS's says its DMG lands once, as a blast on the foe's hull, 3 s after a hit (H2). Display only: one group per
// fix, each pinning the words, their rows in the 225 px op band, the sim lines that make them true, and (last) that a second row lays out whole on the
// finger's panel and the desk's panel and tooltip at every star on days 1, 5 and 10. Only src/ui/faces.ts changed (git diff --name-only
// shopcard1c-accepted -- src); the sim is untouched.
//   H1  TWIN LATCH: "HIT: HOLDS A SLUG UP TO n SEC TO MAKE A PAIR. BOTH ITS ARROWS MUST POINT AT BELTS." (one rule, two rows)
//   H2  LIMPET WORKS: "THE DMG LANDS ONCE, AS A BLAST ON THE FOE'S HULL, 3 SEC AFTER A HIT." (two rows; was ITS DMG, one row)
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, phoneBarLift, phoneScreen, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { UI } from "../src/ui/ui";
import { detailsPlan, panelFit, visibleLines } from "../src/screens/build/inspector";
import { panelArea } from "../src/screens/build/layout";
import type { Ctx } from "../src/screens/build/actions";
import { newRun } from "../src/game/run";
import { ITEMS } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { Battle, type SideState, type Target } from "../src/sim/battle";
import type { HarassRound } from "../src/sim/harassment";
import { bench, barge as benchBarge } from "./arsenal.bench";
import { lineWidth } from "../src/ui/richText";
import { shotFloor } from "../src/sim/deck";
import { icons, stripIcons, textWidth, wrap } from "../src/render/font";
import { faceAt, faceLines } from "../src/ui/faces";
import { GLOSSARY_WRAP_W, glossaryText } from "../src/ui/glossary";
import { TOOLTIP_TEXT_W, offerFace, tooltipLines } from "../src/screens/build/shop";
import { SEED, barge, events, item, latchDeck, withItem } from "./wave3.helpers";

installRaster();

/** Side 1 is the FURNACE bench with its factories held; side 0 a barge (tests/y2.pieces.test.ts's quiet). */
const quiet = (): Battle => {
  const bt = new Battle(benchBarge(), bench(), 8);
  for (const f of bt.sides[1].factories) f.timer = 1000;
  return bt;
};
const probe = (bt: Battle) => bt as unknown as { roundImpact(s: SideState, t: Target, round: HarassRound, from: 0 | 1): void };

const BAND = GLOSSARY_WRAP_W; // 225 px: the phone panel's text width, 5x7
const STARS = [1, 2, 3];
const DAYS: (number | undefined)[] = [undefined, 5, 10];
const rules = (def: string, s: number, day?: number): string[] => faceAt(def, s, { k: 1, hero: "furnace", day })!.rules.map((r) => r.text); // markup
const rowsOf = (markup: string, width = BAND): string[] => wrap(icons(markup), width, "5").map((r) => stripIcons(r).replace(/\s+/g, " ").trim());

describe("SHOPCARD-1d H1 (READ-11 fix 1): TWIN LATCH's face says both its arrows must point at belts", () => {
  it("one rule, 'HIT: HOLDS A SLUG UP TO n SEC TO MAKE A PAIR. BOTH ITS ARROWS MUST POINT AT BELTS.', two rows at every star on days 1, 5 and 10: the hold sentence is row 1, the condition row 2", () => {
    for (const s of STARS) for (const day of DAYS) {
      const r = rules("twinlatch", s, day);
      expect(r, `★${s} day ${day}`).toEqual([`HIT: HOLDS A {SLUG} UP TO ${s}{SEC} TO MAKE A {*PAIR}. BOTH ITS ARROWS MUST POINT AT BELTS.`]);
      const rows = rowsOf(r[0]);
      expect(rows.length, `★${s} day ${day}: ${rows.join(" / ")}`).toBe(2);
      expect(rows[1], `★${s} day ${day}: the condition is a row of its own`).toBe("BOTH ITS ARROWS MUST POINT AT BELTS.");
      expect(textWidth(icons(r[0]), "5"), `★${s} day ${day}`).toBeLessThanOrEqual(2 * BAND);
    }
    // the hold and the PAIR stay (1c's words), the stat-less face stays one rule with its HIT label
    const f = faceAt("twinlatch", 1, { k: 1, hero: "furnace" })!;
    expect(f.rules.length).toBe(1);
    expect(f.rules[0].label).toBe("HIT:");
    expect(f.nums).toEqual([["hold", "UP TO 1{SEC}"]]);
    expect(f.reminders.length).toBe(1);
  });

  it("it is the words of its HIT note (glossary.ts TAP_NOTES.twinlatch, unchanged): BOTH ITS ARROWS ... POINT AT BELTS", () => {
    const note = glossaryText("HIT", { def: "twinlatch", stars: 1 })!;
    expect(note).toBe("HIT: IT HOLDS A SLUG IT HITS, BUT ONLY WHEN BOTH ITS ARROWS POINT AT BELTS.");
    const face = stripIcons(icons(rules("twinlatch", 1)[0]));
    expect(face).toContain("BOTH ITS ARROWS");
    expect(face).toContain("POINT AT BELTS");
    for (const w of ["BOTH ITS ARROWS", "POINT AT BELTS"]) expect(note).toContain(w);
  });

  it("true by the sim (battle.ts:757-759 builds a latch only from two belt hits; deck.ts:373-398 rigHits): both arrows on belts hold slugs, one arrow on a belt never does", () => {
    const both = withItem(latchDeck(), item(40, "twinlatch", 4, 3)); // between (3,3) on belt A and (5,3) on belt B
    expect(new Battle(both, barge(), SEED).sides[0].latches!.length).toBe(1);
    expect(events(both, 8).filter((x) => x.e.type === "hold").length).toBeGreaterThan(0);
    const one = withItem(latchDeck(), item(40, "twinlatch", 2, 3)); // west arrow at (1,3): empty deck
    expect(new Battle(one, barge(), SEED).sides[0].latches).toBeUndefined();
    expect(events(one, 8).filter((x) => x.e.type === "hold")).toEqual([]);
  });
});

describe("SHOPCARD-1d H2 (READ-11 fix 2): LIMPET WORKS says its DMG lands once, as a blast on the foe's hull, 3 s after a hit", () => {
  it("'THE DMG LANDS ONCE, AS A BLAST ON THE FOE'S HULL, 3 SEC AFTER A HIT.' at every star on days 1, 5 and 10: no bare ITS, no SLUG, the delay the only number, two rows (335 px)", () => {
    for (const s of STARS) for (const day of DAYS) {
      const [line] = rules("limpet", s, day);
      expect(line, `★${s} day ${day}`).toBe("THE {DMG} LANDS ONCE, AS A BLAST ON THE FOE'S HULL, 3{SEC} AFTER ITS SLUG HITS ANYTHING.");
      // SHOPCARD-1f (F3; READ-13 fix list 3: 12 of 12 answers asked which hit): the line now names the hit, `AFTER ITS SLUG HITS ANYTHING`, so 1d's "no bare ITS, no SLUG" pins
      // retire: the ITS is the slug's (no bare ITS: nothing else it could be) and the SLUG is a word, not the icon whose note read as an impact hit plus a second blast (the
      // DMG still lands once, as a blast: tests/shopcard1f.test.ts F3)
      expect(/\bITS SLUG HITS ANYTHING\b/.test(stripIcons(icons(line))), `★${s} day ${day}: the hit is its slug's, on anything`).toBe(true);
      expect(/\{SLUG\}/.test(line), `★${s} day ${day}: the word SLUG, not the {SLUG} icon (no extra tap target)`).toBe(false);
      expect(stripIcons(icons(line)).replace(/3/, "").match(/\d/), `★${s} day ${day}: the delay is the only number`).toBeNull();
      expect(rowsOf(line).length, `★${s} day ${day}`).toBe(2);
      expect(textWidth(icons(line), "5"), `★${s} day ${day}`).toBeLessThanOrEqual(2 * BAND);
    }
    expect(faceAt("limpet", 1, { k: 1, hero: "furnace" })!.nums).toEqual([["delay", "3{SEC}"]]);
  });

  it("the stat row stays as it is: RATE 13, DMG (the blast: 100 / 230 / 360 at x1, day 5 x1.8), BELT 2/3/4", () => {
    expect(ITEMS.limpet.factory!.base).toBe(0); // content.ts:532-539: the charge's own damage is 0, the blast is the DMG
    const dmg1 = [100, 230, 360];
    STARS.forEach((s) => {
      const st = faceAt("limpet", s, { k: 1, hero: "furnace" })!.stats;
      expect(st, `★${s}`).toEqual([["RATE", "13"], ["DMG", String(dmg1[s - 1])], ["BELT", String(s + 1)]]);
      expect((effectAt("limpet", s).factory!.round as { blast: number }).blast, `★${s}: the stat is the blast`).toBe(dmg1[s - 1]);
    });
    expect(faceAt("limpet", 1, { k: 1, hero: "furnace", day: 5 })!.stats).toEqual([["RATE", "13"], ["DMG", "180"], ["BELT", "2"]]);
  });

  it("true by the sim (battle.ts:2318-2350 roundImpact, 2428-2441 hullEffects): a hit on a part queues one charge; 3 s later the foe's hull takes the blast, once; the charge's own shot deals only what rigs added (deck.ts:585-588)", () => {
    const bt = quiet(), s = bt.sides[1], f = s.factories[0], hp = s.hull.hp;
    const round = effectAt("limpet", 1).factory!.round as HarassRound;
    const tgt = s.targets.find((x) => x.kind === "factory" && x.ref === f.uid)!;
    probe(bt).roundImpact(s, tgt, round, 0);
    expect(s.limpets.length, "one charge per hit").toBe(1);
    while (bt.t < 2.9) bt.step();
    expect(hp - s.hull.hp, "nothing lands before the delay").toBe(0);
    while (bt.t < 3.1) bt.step();
    expect(hp - s.hull.hp, "the blast lands at 3 s: the stat row's DMG").toBe(100);
    expect(s.limpets.length, "and the charge is gone").toBe(0);
    while (bt.t < 9) bt.step();
    expect(hp - s.hull.hp, "once: nothing more from that hit").toBe(100);
    // the shot's own damage: a limpet charge's floor is 0, so the hit adds only what rigs put on it (the line does not say the hit deals nothing)
    expect(shotFloor("limpet")).toBe(0);
  });
});

// ------------------------------------------------------------------------------------------------ the second rows lay out whole
/** The build screen as the game frames it (tests/shopcard1c.test.ts's framed). */
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

describe("SHOPCARD-1d (BRIEF rule 2): the second rows lay out whole: no overlap, no clip, at every star on days 1, 5 and 10, on the finger's panel, the desk's column and the desk's tooltip", () => {
  const VIEWS: [string, number, number, number, boolean][] = [["phone 402x690", 402, 690, 3, true], ["phone 360x640", 360, 640, 2, true], ["desk 1920x1080", 1920, 1080, 1, false]];
  const PIECES = ["limpet", "twinlatch"];
  it("TWIN LATCH and LIMPET WORKS: every word of the face's rule is among the panel's visible lines, in order; each visible line starts a full pitch under the one above and ends inside the panel (54 panels: 3 views x 3 days x 3 stars x 2 pieces)", () => {
    let panels = 0;
    for (const [vn, w, h, dpr, touch] of VIEWS) for (const day of [1, 5, 10]) for (const s of STARS) for (const def of PIECES) {
      const run = newRun("furnace", day, `shopcard1d-${def}-${s}`);
      run.inventory = [{ uid: 900, def, ...(s > 1 ? { stars: s } : {}) }];
      const sel: Sel = { kind: "cargo", uid: 900 }, f = framed(w, h, dpr);
      const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
      const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
      const plan = detailsPlan(ctx, sel, null, area)!.plan;
      const vis = visibleLines(plan).flatMap((v) => (v.line === "rule" ? [] : [{ y: v.y, line: v.line }]));
      const rule = rules(def, s, day)[0];
      const text = (l: { line: { spans: { t: string }[] } }): string => l.line.spans.map((sp) => sp.t).join("");
      const joined = vis.map(text).join(" ").replace(/\s+/g, " ");
      const words = stripIcons(icons(rule)).replace(/\s+/g, " ").split(" ").filter((x) => x && !/\d/.test(x));
      let at = 0;
      for (const word of words) {
        const i = joined.indexOf(word, at);
        expect(i, `${vn} day ${day} ★${s} ${def}: "${word}" among the visible lines`).toBeGreaterThanOrEqual(0);
        at = i + word.length;
      }
      vis.forEach((l, i) => {
        if (i) expect(l.y - vis[i - 1].y, `${vn} day ${day} ★${s} ${def}: line ${i} under line ${i - 1}`).toBeGreaterThanOrEqual((vis[i - 1].line as unknown as { pitch: number }).pitch);
        expect(l.y + ((l.line as unknown as { font: string }).font === "5" ? 7 : 5), `${vn} day ${day} ★${s} ${def}: line ${i} inside the panel`).toBeLessThanOrEqual(plan.maxY);
      });
      panels++;
    }
    expect(panels).toBe(VIEWS.length * 3 * STARS.length * PIECES.length);
  });

  it("the desk's hover tooltip wraps each line at TOOLTIP_TEXT_W into at most 3 rows of 3x5, holds every word in order, and the box row count is the rows' (no clip)", () => {
    for (const def of PIECES) for (const day of DAYS) {
      const faceTexts = offerFace(def, { hero: "furnace", day }); // a shop offer's tooltip is the ★1 face
      const rowsAll = faceTexts.flatMap((t) => tooltipLines(t));
      const joined = rowsAll.map((l) => l.map((sp) => sp.t).join("")).join(" ").replace(/\s+/g, " ");
      const want = stripIcons(icons(rules(def, 1, day)[0])).replace(/\s+/g, " ");
      let at = 0;
      for (const word of want.split(" ").filter(Boolean)) {
        const i = joined.indexOf(word, at);
        expect(i, `${def} day ${day}: "${word}" in the tooltip's rows`).toBeGreaterThanOrEqual(0);
        at = i + word.length;
      }
      const ruleRows = tooltipLines(rules(def, 1, day)[0]);
      expect(ruleRows.length, `${def} day ${day}: the rule's tooltip rows`).toBeLessThanOrEqual(3);
      expect(ruleRows.length, `${def}: a second row, as the panel's`).toBeGreaterThanOrEqual(2);
      for (const l of ruleRows) expect(lineWidth(l, "3"), `${def}: row within the tooltip text width`).toBeLessThanOrEqual(TOOLTIP_TEXT_W);
    }
    expect(faceLines("twinlatch", 1, { k: 1 })!.rules.length).toBe(1);
  });
});
