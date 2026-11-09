// POLISH-2 R1 (REQ-BFG-098, REQ-BFG-089; RULING-POLISH2-R1): THE NOT COUNTED LINE IS A GUEST.
// Run 1 kept the line like a kept block, so on a phone it could make the planner drop the WHOLE panel body to the 3x5 face (the review's belt-multi picture: both hit rows and the readout shrank to the
// smallest face to fit one note). The rule now (inspector.ts planIn, guestFits): the panel is planned WITHOUT the line first (that plan is the panel); the line is drawn only where a plan with it keeps every
// other line exactly as that plan draws it (the same face, rows, `+n MORE` and gaps), in the band and in a grown panel alike. Otherwise the panel is exactly the plan without it, and the same words are the
// FIRST item of the panel's own ⓘ view (routePanel's `notes`; the `?` shows on a belt that had none).
// Pinned here, over tests/polish2.guestCorpus.ts (run 1's 23 belts, belt-multi's deck, 50 multi-hit belts of 2-6 hits with readers, counted and uncounted words) on seven views, in the band and (phones) after a
// finger's press, and over the SCOUTED foes' belts (632 panels a view, seven views):
//   (1) every block but the line has the same face with and without it;       (2) every line drawn without the line is drawn with it;
//   (3) where the line is not in the panel, the plan equals the plan without it, and the ⓘ view's first item is the line's words;      (4) where it is: one line, the 3x5 face, within its room;
//   and the grown panel's size never depends on the line; the counts per view (in the panel / behind the `?`); a mutation (the guest rule taken out lets belt-multi's panel change face).
// (The defect's size at run 1's rule is counted by the same corpus at polish2r-base: the REPORT.)
import { describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import type { DuskFoe } from "../src/game/run";
import { battleGrid, battleLayout, battleScale, laneLayout } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { faceArea, faceRun, faceText } from "../src/screens/battleScout";
import { RIVAL_IDS, RIVALS, rivalBuild, rivalDays, standInBuild, type RivalId } from "../src/sim/rivals";
import { withEnchant } from "../src/sim/enchant";
import { lineWidth } from "../src/ui/richText";
import { setTipsForTests } from "../src/ui/tips";
import { UI, type Rect } from "../src/ui/ui";
import { tapPx } from "../src/ui/tap";
import type { Ctx } from "../src/screens/build/actions";
import { drawDetails, explainPanel, planPanel, routePanel, rulesCovered, selFamilies, visibleLines, type PanelText } from "../src/screens/build/inspector";
import { explainWords, infoItems, infoLevels, panelPiece } from "../src/screens/build/keywords";
import { leftOutCandidates, beltWordFx } from "../src/screens/build/beltWords";
import { walkRoute } from "../src/sim/deck";
import { beltMulti, casesOf, corpus, framed, judge, manyBelts, noLine, optsFor, rigsRun, run1Belts, VIEWS } from "./polish2.guestCorpus";

installRaster();
setTipsForTests("done"); // no first-sight note is about to open: the fit is the panel's own

const ROUTE0 = { kind: "route", index: 0 } as const;
/** The line's words the panel's ⓘ view must lead with: the fullest candidate (beltWords.ts leftOutCandidates). */
const lineOf = (t: PanelText): string | undefined => t.body.find((b) => b.hold)?.text;

describe("POLISH-2 R1: the corpus", () => {
  const belts = corpus();
  it("run 1's 23 belts, belt-multi's deck (with and without a MASSIVE turret) and 50 multi-hit belts: 2, 3, 4, 5 and 6 hits, 10 a size", () => {
    expect(run1Belts()).toHaveLength(23);
    const many = manyBelts();
    expect(many).toHaveLength(50);
    for (const n of [2, 3, 4, 5, 6]) expect(many.filter((b) => b.hits === n), `${n} hits`).toHaveLength(10);
    expect(belts).toHaveLength(75);
    expect(belts.filter((b) => b.hits >= 2).length).toBeGreaterThanOrEqual(40);
    expect(beltMulti().run.build.items.map((p) => p.def)).toEqual(["kiln", "shieldwall", "crowdpress"]);
  });

  it("readers, the counted words (FIERY, GROWING) and the uncounted ones (RISING, ECHOING, MASSIVE, SWIFT) are all on the belts, and every belt of the corpus carries the line (something on it is left out)", () => {
    const all = belts.map((b) => b.label).join(" ");
    for (const w of ["fiery", "growing", "rising", "echoing", "massive", "swift", "shieldwall", "crowdpress", "keg", "quench", "trophychain"]) expect(all, w).toContain(w);
    const lined = belts.filter((b) => !!lineOf(routePanel(b.run, 0)!));
    expect(lined.length).toBeGreaterThanOrEqual(70);
    expect(lined.filter((b) => b.hits >= 2).length).toBeGreaterThanOrEqual(40);
  });
});

/** The counts the corpus gives at this tip: [plans, in the panel, behind the `?`] per view and state (RULING-POLISH2-R1 (d): COUNT per view). */
const PIN: Record<string, [number, number, number]> = {
  "desk 1280x800 band": [75, 75, 0],
  "op690 402x690 @3 band": [75, 43, 32],
  "op690 402x690 @3 press": [75, 52, 23],
  "small 360x640 @2 band": [75, 73, 2],
  "small 360x640 @2 press": [75, 73, 2],
  "phone 390x844 @3 band": [75, 71, 4],
  "phone 390x844 @3 press": [75, 71, 4],
  // POLISH-3 (Q3 desk; cap's ruling A): a column belt panel that would give hit rows away takes the 3x5 face where that keeps every row (inspector.ts planRung, inside planIn: the plan with the line and the
  // plan without it each take the rung, so they keep one face): more room, so more panels carry the line (was [75, 61, 14] and [75, 67, 8])
  "desk 1920x1080 band": [75, 72, 3],
  "land 844x390 @3 band": [75, 71, 4],
  "op690 402x690 @3, a rune band": [75, 0, 75],
  "op690 402x690 @3, a rune press": [75, 0, 75],
};

describe("POLISH-2 R1: every plan of the corpus keeps its faces and its lines, and the line is in the panel or first behind the ⓘ", () => {
  it("(1)-(4) on every belt x view x state (band; a finger's press on a phone), the grown panel's size, the counts, and the ⓘ view's first item", () => {
    const tally: Record<string, [number, number, number]> = {};
    let n = 0, withNotes = 0;
    for (const spec of VIEWS) {
      const f = framed(spec.w, spec.h, spec.dpr, spec.runes);
      for (const b of corpus()) {
        const line = lineOf(routePanel(b.run, 0)!);
        for (const c of casesOf(b, spec, f)) {
          const tag = `${spec.name} ${c.state}: ${b.label}`;
          const v = judge(c);
          n++;
          expect(v.faceSame, `${tag}: (1) every block but the line keeps its face`).toBe(true);
          expect(v.rowsSame, `${tag}: (2) every line drawn without the line is drawn with it`).toBe(true);
          expect(v.equalWithout, `${tag}: (3) the plan is the plan without the line`).toBe(true);
          expect(v.lineOk, `${tag}: (4) one line, the 3x5 face, within its room`).toBe(true);
          expect(JSON.stringify(c.area), `${tag}: the grown panel's size does not depend on the line`).toBe(JSON.stringify(c.areaWithout));
          // the words: in the panel or first in the ⓘ view, on every belt that carries the line (MAIN views included)
          if (line === undefined) {
            expect(c.t.notes ?? [], `${tag}: no line, no note`).toHaveLength(0);
            continue;
          }
          withNotes++;
          expect(c.t.notes?.[0]?.text, `${tag}: the ⓘ view's first note is the line's words`).toBe(line);
          expect(v.inPanel || c.t.notes?.[0]?.text === line, `${tag}: in the panel or first behind the ⓘ`).toBe(true);
          const k = `${spec.name} ${c.state}`;
          const t = (tally[k] ??= [0, 0, 0]);
          t[0]++;
          if (v.inPanel) t[1]++; else t[2]++;
        }
      }
    }
    console.log(`POLISH-2 R1 corpus: ${n} plans; per view [plans, in the panel, behind the ?]: ${JSON.stringify(tally)}`);
    expect(withNotes, "every belt of the corpus carries the line").toBe(825);
    expect(tally).toEqual(PIN);
    // main views: the line is in the panel OR first in the ⓘ view on every belt (asserted per plan above); the desk column shows it on every belt
    expect(tally["desk 1280x800 band"]).toEqual([75, 75, 0]);
  }, 600000);

  it("the ⓘ view: the line's words are its FIRST item, in the fullest candidate (wrapped to the view's width, never cut); a belt that had no `?` shows one", () => {
    let none = 0;
    for (const spec of VIEWS.slice(0, 3)) {
      const f = framed(spec.w, spec.h, spec.dpr, spec.runes);
      for (const b of corpus()) {
        const c = casesOf(b, spec, f)[0], line = lineOf(c.t);
        if (!line) continue;
        const run = b.run, sel = ROUTE0;
        const w = c.withLine.r.w - 10;
        const items = infoItems(infoLevels(run, sel), explainWords(c.t, panelPiece(run, sel), run.day), w, (c.t.notes ?? []).map((q) => q.text));
        expect(items[0].section, `${b.label}: the first item is a NOTE`).toBe("NOTES");
        expect(items[0].note, `${b.label}: the line's words`).toBe(line);
        expect(items[0].font).toBe("3");
        for (const ln of items[0].lines) expect(lineWidth(ln, "3"), `${b.label}: within the view's width`).toBeLessThanOrEqual(w);
        // the fullest candidate: the reasons said, as the panel's line says them where it can
        const fx = beltWordFx(run.build, 0, walkRoute(run.build, 0, undefined, { gates: true }), 0);
        expect(line.startsWith(leftOutCandidates(fx.left)[0].slice(0, 20))).toBe(true);
        // a belt whose face has no keyword and no level had no ⓘ before: the notes bring it (the layer draws `?` for words, levels or notes)
        const bare = explainWords({ body: c.t.body }, panelPiece(run, sel), run.day);
        if (!bare.length) none++;
      }
    }
    console.log(`POLISH-2 R1: ${none} plans are of belts that had no keyword in their panel (no ⓘ before the notes)`);
  });

  it("the `?` is drawn on a belt panel whose only ⓘ content is the line (a RISING part on the belt, the line behind the ?)", () => {
    const spec = VIEWS[1], f = framed(spec.w, spec.h, spec.dpr, spec.runes);
    for (const b of [beltMulti(), corpus().find((q) => q.label === "whetstone+rising")!]) {
      const run = b.run, ui = new UI();
      const ctx = { game: { ui, t: 0, view: f.view, W: f.W, H: f.H, canvas: null }, run, touch: false, L: f.L } as unknown as Ctx;
      const cv = fresh(f.W, f.H);
      ui.begin();
      drawDetails(gOf(cv), ctx, ROUTE0, null, f.L.info, {} as DuskFoe);
      ui.end();
      expect(ui.regions.some((r) => r.id === "kw:?"), `${b.label}: the ⓘ button (kw:?) is registered`).toBe(true);
    }
  });
});

/** The scouted foes' counts at this tip: [panels, with the line, in the panel, behind the ?] per view. */
// BUMP-1H (P6; H2 and H3, REQ-BFG-124 lines 5 and 7): was [632, 428, 156, 272] / [632, 428, 152, 276] / [632, 428, 406, 22] / [632, 428, 416, 12] / [632, 428, 326, 102] / [632, 428, 344, 84] / [632, 428, 334, 94] (BUMP-1G's, the views in this order).
// The 36 panels fewer with the line are H2's: the four Easy captains' day-5 words are BRACED now (src/sim/npcWords.ts: NETTLE loom, GRUBNOSE doublestamp, RATCHET scrapcannon, BRASSWICK temper; were RISING, FIERY, RISING, FIERY) and a BRACED part says no line.
// Measured with kit-1h/revert3.sh (an export with the named src files put back to bump1h-base): both npcWords.ts and rivalBuilds.ts put back: this whole file passes at BUMP-1G's pins (428 on every view, 9 of 9); npcWords.ts alone put back: 428 again, and the
// in-the-panel / behind-the-? split differs from BUMP-1G's (H3's two trimmed warlord decks move it); rivalBuilds.ts alone put back: 392 (H3 moves the split, not the count of lines).
const SCOUT_PIN: Record<string, [number, number, number, number]> = {
  // POLISH-6 (P6-1, REQ-BFG-089): COPIES prints 1.3 where it printed 1.3333333333333333 (the readout grid is 3 characters wide, not 18), so the rows have room and the guest line is spare in more panels:
  // phone-390x844 156/272 -> 160/268, 844x390 334/94 -> 342/86, 1280x800 404/24 -> 396/32 (the other views are unchanged: they hold no belt that prints a fraction, or none that has room)
  "phone-390x844": [632, 392, 136, 256],
  "op-402x690": [632, 392, 120, 272],
  "phone-360x640": [632, 392, 370, 22],
  "phone-320x568": [632, 392, 380, 12],
  // POLISH-3 (Q3 desk; cap's ruling A): the foe's belt faces in the landscape columns take the 3x5 rung where it keeps every hit row (was 326/102, 344/84 and 334/94)
  // POLISH-5 (P5-2, cap's ruling (A)): the build screen's panel takes the plan that gives away the fewest hit rows (the 3x5 plan, at the tight pitch where that gives away fewer still), and the rows win the room: the guest line uses only
  // what is spare and goes first behind the ⓘ when there is none (R1's own move). In the landscape columns: 844x390 352/76 -> 334/94 (18 lines move behind the ⓘ), 1920x1080 374/54 -> 333/95 (41), 1280x800 400/28 -> 404/24 (4 come in). Phones: bands, unchanged.
  "land-844x390": [632, 392, 292, 100],
  "desk-1920x1080": [632, 392, 318, 74],
  "desk-1280x800": [632, 392, 296, 96],
};

describe("POLISH-2 R1: the scouted foes' belts (battleScout.ts faceText + the face area): 632 panels a view, seven views", () => {
  const VIEWS7: [string, number, number, number][] = [["phone-390x844", 390, 844, 3], ["op-402x690", 402, 690, 3], ["phone-360x640", 360, 640, 3], ["phone-320x568", 320, 568, 2], ["land-844x390", 844, 390, 3], ["desk-1920x1080", 1920, 1080, 1], ["desk-1280x800", 1280, 800, 1]];
  const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
  it("(1)-(4) on every scouted belt panel on every view; the line is in the panel or first behind the foe panel's own ⓘ", () => {
    withEnchant(() => {
      const got: Record<string, [number, number, number, number]> = {};
      for (const [name, w, h, dpr] of VIEWS7) {
        const v = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
        const L = laneLayout(battleLayout(v.W, v.H, v.portrait)), fa = faceArea(L, 1), tp = tapPx(v);
        let panels = 0, withLine = 0, shown = 0;
        for (const id of RIVAL_IDS as readonly RivalId[]) for (const maker of [rivalBuild, standInBuild]) for (const day of [5, 8, 12, 16].filter((d) => rivalDays(id, 16).includes(d))) {
          const b = maker(id, day), owner = RIVALS[id].name;
          b.routes.forEach((_, i) => {
            const sel = { kind: "route", index: i } as const;
            const run = faceRun(b, day), fam = selFamilies(run, sel);
            for (const t of [faceText(b, sel, null, day)!, faceText(b, sel, null, day, owner)!]) {
              panels++;
              const line = lineOf(t);
              if (!line) {
                expect(t.notes ?? [], `${name} ${id} ${day}: no line, no note`).toHaveLength(0);
                continue;
              }
              withLine++;
              const o = { tap: tp, band: fa.band };
              const withP = planPanel(t, fa.area, fam, o), without = planPanel(noLine(t), fa.area, fam, o);
              const vd = judge({ withLine: withP, without });
              const tag = `${name} ${id} ${maker.name} day ${day} belt ${i + 1}`;
              expect(vd.faceSame, `${tag}: (1)`).toBe(true);
              expect(vd.rowsSame, `${tag}: (2)`).toBe(true);
              expect(vd.equalWithout, `${tag}: (3)`).toBe(true);
              expect(vd.lineOk, `${tag}: (4)`).toBe(true);
              expect(t.notes?.[0]?.text, `${tag}: the foe panel's ⓘ view leads with the line's words`).toBe(line);
              if (vd.inPanel) shown++;
            }
          });
        }
        got[name] = [panels, withLine, shown, withLine - shown];
      }
      console.log(`POLISH-2 R1 scouted foes, per view [panels, with the line, in the panel, behind the ?]: ${JSON.stringify(got)}`);
      for (const [name, g] of Object.entries(got)) {
        expect(g[0], `${name}: 632 panels a view`).toBe(632);
        expect(g[1], `${name}: panels with the line`).toBe(392); // BUMP-1H: was 428 (H2: the four Easy captains' day-5 words are BRACED, which says no line; see SCOUT_PIN)
      }
      expect(got).toEqual(SCOUT_PIN);
    });
  }, 600000);
});

describe("POLISH-2 R1: the rule itself", () => {
  it("MUTATION: with the guest rule taken out (the line an ordinary optional block) belt-multi's phone plan changes face and loses a row; with the rule it does neither", () => {
    const spec = VIEWS[1], f = framed(spec.w, spec.h, spec.dpr, spec.runes);
    for (const b of [beltMulti(), beltMulti(true)]) {
      const c = casesOf(b, spec, f).find((q) => q.state === "band")!;
      expect(c.area.h, "the 402x690 band of the review's picture").toBe(90);
      const ok = judge(c);
      expect([ok.faceSame, ok.rowsSame, ok.inPanel], `${b.label}: the rule keeps the 5x7 face and every row; the line is behind the ?`).toEqual([true, true, false]);
      expect(c.withLine.body.font, "the 5x7 face is back").toBe("5");
      const unguarded: PanelText = { ...c.t, body: c.t.body.map((q) => (q.hold ? { ...q, hold: undefined } : q)) }; // no `hold`: planIn's guest rule never looks at it
      const bad = judge({ withLine: planPanel(unguarded, c.area, [], optsFor(f, 0, unguarded, c.area)), without: c.without });
      expect(bad.faceSame && bad.rowsSame, `${b.label}: without the rule (1) or (2) fails`).toBe(false);
      expect(bad.faceSame, `${b.label}: the whole body drops to the 3x5 face`).toBe(false);
    }
  });

  it("a definition's box may cover the guest line as it may cover a flavour row (it is no rule row), and never a rule row", () => {
    const spec = VIEWS[3], f = framed(spec.w, spec.h, spec.dpr, spec.runes); // phone 390x844: the line fits the band
    const c = casesOf(beltMulti(), spec, f).find((q) => q.state === "band")!;
    const shown = visibleLines(c.withLine), guest = shown.find((v) => v.line !== "rule" && v.line.block.hold);
    expect(guest, "the line is in the panel here").toBeDefined();
    const box: Rect = { x: c.area.x, y: guest!.y, w: c.area.w, h: 5 };
    expect(rulesCovered(box, shown), "the box over the guest line covers no rule row").toHaveLength(0);
    const grid = shown.find((v) => v.line !== "rule" && v.line.block.role === "grid")!;
    expect(rulesCovered({ ...box, y: grid.y }, shown).length, "the same box over the readout covers a rule row").toBeGreaterThan(0);
  });

  it("a belt with nothing left out has no line and no note: a plain belt, WHETSTONE only, FIERY or GROWING on the rig, the kiln or the turret (counted words)", () => {
    const decks = [
      ["plain", rigsRun([], [])], ["whetstone", rigsRun([["whetstone", 4, 4, 1]], [undefined])], ["whetstone+fiery", rigsRun([["whetstone", 4, 4, 3]], ["fiery"])],
      ["two whetstones+growing", rigsRun([["whetstone", 4, 4, 2], ["whetstone", 4, 2, 1]], ["growing", "fiery"], "fiery", "growing")],
    ] as const;
    for (const [label, run] of decks) {
      const t = routePanel(run, 0)!;
      expect(lineOf(t), label).toBeUndefined();
      expect(t.notes, label).toBeUndefined();
      expect(explainPanel(t).notes ?? [], label).toHaveLength(0);
    }
  });
});
