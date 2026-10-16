// 0.8.0 B1 M4 (REQ-BFG-032; VERIFIED-I1's call 5, I1 REPORT section 7.4 and open item 5): readable text.
// STOKER's capped line. Where a stoked factory's gun can't take its full stoke (deckRating.ts stokeKeep, the estimate the
// battle's cap plays), the capped line ("THE KILN'S GUN IS FULL, SO IT WORKS ONLY 25% FASTER.") takes the place of the
// opening sentence "EACH FACTORY ITS ARROWS POINT AT WORKS N% FASTER.": the same kept opening block, drawn in the warning's
// amber, on the phone band and in the desk and laptop columns. No band promises a speed-up the gun can't take, and no
// panel grows: I1's panel held the same blocks plus the N% sentence (oracle aa0494523ab57b7c). Where every gun has room
// the text is the glossary's, unchanged.
// G1's F2, ARMOR PRESS's pace (ref/b1/REPORT-G1.md; oracle a0e94bc69949561f): STOKER's cap holds back only the stamping;
// the plating timer keeps the full stoke. The capped line for a plating factory says so ("THE ARMOR PRESS'S GUN IS FULL,
// SO ONLY ITS PLATING WORKS 44% FASTER.", or "... SO IT STAMPS ONLY 40% FASTER, BUT PLATES 44% FASTER."), and its numbers
// are the battle's: in G1's C-E3-press deck the plating runs 20 / 44 / 70% faster at 1-3 stars while the stamping holds.
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { C } from "../src/render/palette";
import { ITEMS, buyableModules, withWave3 } from "../src/sim/content";
import { newRun, type DuskFoe, type Run } from "../src/game/run";
import { key as K, stokeHits, type Build, type Placed } from "../src/sim/deck";
import { stokeKeep } from "../src/sim/deckRating";
import { effectAt } from "../src/sim/stars"; // NUM-4 (REQ-BFG-047): GUN IS FULL's threshold from the data
import { heroStartBuild } from "../src/sim/heroBuilds";
import { validateBuild } from "../src/net/validate";
import { buildLayout } from "../src/screens/build/layout";
import {
  ROLE, cargoPanel, drawDetails, drawFamHead, itemPanel, offerPanel, planPanel, rigPanel, selFamilies, stokeCapBlocks, stokerAbility,
  visibleLines, type Block, type PanelText, type PLine,
} from "../src/screens/build/inspector";
import type { Ctx } from "../src/screens/build/actions";
import { CARD_EFFECT_Y, CARD_MARK_X, CARD_MARK_Y, drawCard, type CardState } from "../src/screens/build/shop";
import { WIDE_CARD_H, WIDE_CARD_MAX_W, type Sel } from "../src/screens/build/layout";
import { textWidth } from "../src/render/font";
import { FAMILY, familiesOf } from "../src/ui/families";
import { UI } from "../src/ui/ui";
import { abilityText, cardText } from "../src/ui/abilityText";
import { banned } from "./textRules";
import { faceLines } from "../src/ui/faces"; // U2b (REQ-BFG-046): STOKER's face
import { SEED, barge, item, run as fight, withItem, withMod } from "./wave3.helpers";
import { withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): the off checks beside STOKER ★3's re-pins

installRaster();

/** The 390x844 phone's band, the 1920x1080 desk's column, the 1366x768 laptop's column (tests/abilityPanels.test.ts). */
const BANDS = [
  ["phone", buildLayout(167, 394, true, 5).info], // PACKS Q5: 0.8.5's 167 x 361 plus the pack row: the 161 x 69 band
  ["desk", buildLayout(480, 270, false, 5).info],
  ["laptop", buildLayout(455, 256, false, 5).info],
] as const;
const STOKER = 70;
const OPENING = /^EACH FACTORY ITS ARROWS POINT AT WORKS UP TO \d+% FASTER\.$/; // TXT-096: its face's UP TO (was "... WORKS \d+% FASTER.")
/** U2b (REQ-BFG-046): STOKER's face opens with its rule, the N% line in the face's words (faceLines, the registry's numbers).
 *  Y7b2 (the flip): release Y's face says the cap in its one line, "ITS FACTORIES WORK UP TO 20% FASTER." (Y7b1 Y7A-R1;
 *  was /^ITS FACTORIES WORK \d+% FASTER\.$/) */
const FACE_OPENING = /^ITS FACTORIES WORK UP TO \d+% FASTER\.$/;
// U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): the capped line reads "THE KILN'S GUN IS FULL: IT WORKS ..." (was ", SO IT WORKS ..."), the same meaning
const CAPPED = /^THE .+'S GUN IS FULL: /;

// ------------------------------------------------------------------------------------------------------------- decks

const furnaceStart = (): Build => heroStartBuild("furnace", 1);
/** FURNACE's start deck with its Kiln belt drawn to 8 tiles (tests/stokerCap.test.ts longKiln: the gun has room). */
function longKiln(): Build {
  const b = furnaceStart();
  b.routes[0].cells = [K(4, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)];
  return b;
}
/** LOCKJAW's layout (tests/stokerCap.test.ts): an 8-tile Kiln belt into connector 4 and a TWIN MOULD belt into 5. */
function lockjaw(): Build {
  return {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 2, y: 6 }, { uid: 2, def: "twinmould", x: 6, y: 6 }],
    routes: [
      { factory: 1, cells: [K(2, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] },
      { factory: 2, cells: [K(7, 5), K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
    ], mods: [], beltCap: 30, hullBonus: 0,
  };
}
/** The panels' deck (tests/abilityPanels.test.ts and tests/wave3.text.test.ts rigRun): the Kiln's 6-tile belt up column 4
 *  and a STAMP PRESS (uid 7) belt up column 6, both into the heavy gun. */
function panelDeck(): Build {
  return {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }],
    routes: [
      { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: 7, cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)] },
    ],
  };
}
/** FURNACE's start deck and a factory `def` (uid 7) at (6,6) with no belt (it has no gun: it keeps the full stoke). */
const withLoose = (def: string) => (): Build => ({ ...furnaceStart(), items: [...furnaceStart().items, item(7, def, 6, 6)] });
const stoked = (base: () => Build, s: number, x: number, y: number): Build => withItem(base(), item(STOKER, "stoker", x, y, 0, s));

interface Case { id: string; b: Build; stars: number }
const cases = (id: string, base: () => Build, x: number, y: number, stars = [1, 2, 3]): Case[] =>
  stars.map((s) => ({ id: `${id} ★${s}`, b: stoked(base, s, x, y), stars: s }));
/** Every stoked factory is capped: one line, in the opening sentence's place. */
const ONE_CAPPED: Case[] = [
  ...cases("6-tile Kiln", furnaceStart, 6, 6, [2, 3]),
  ...cases("shared gun, on the Kiln", lockjaw, 1, 6),
  ...cases("shared gun, on the mould", lockjaw, 8, 6),
  ...cases("panel deck, on the Kiln", panelDeck, 3, 6),
  ...cases("panel deck, on the press", panelDeck, 8, 6),
];
/** A STOKER between two factories: both capped, or the Kiln capped and a factory beside it with no gun. */
const TWO: Case[] = [
  ...cases("panel deck, between both", panelDeck, 5, 6),
  ...cases("6-tile Kiln and a loose STAMP PRESS", withLoose("press"), 5, 6, [2, 3]),
  ...cases("6-tile Kiln and a loose DRAG CHAIN FOUNDRY", withLoose("dragchain"), 5, 6, [2, 3]),
];
/** Every gun has room. */
const UNCAPPED: Case[] = [
  ...cases("6-tile Kiln", furnaceStart, 6, 6, [1]),
  // AZ-BUMP (the flip, LADDER_FIX): ★1 and ★2 (was every star). STOKER ★3's stoke 0.7 -> 0.85 passes the room its long-belt
  // gun has (75%), so the 8-tile Kiln at ★3 is capped now: "the decks" below checks that, and its room with LADDER_FIX off
  ...cases("8-tile Kiln", longKiln, 6, 6, [1, 2]),
  ...cases("shared gun with CALIBRATION 3 stars, on the mould", () => withMod(lockjaw(), 60, "calibrate", 0, 3), 8, 6),
  ...cases("6-tile Kiln and a loose STAMP PRESS", withLoose("press"), 5, 6, [1]),
];

/** The case's run, `spare` 1-star STOKERs in cargo (the merge progress line). */
function runOf(c: Case, spare: number): Run {
  const r = newRun("furnace", 5, "b1-text");
  r.build = c.b;
  r.inventory = Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def: "stoker" }));
  return r;
}
const factoriesOf = (b: Build): number[] => stokeHits(b).filter((h) => h.uid === STOKER).map((h) => h.factory);
const lineText = (l: PLine): string => l.spans.map((s) => s.t).join("");

/**
 * I1's panel (v080-wave3 f4846a1, inspector.ts stokerPanel), rebuilt from this one: the glossary's opening sentence in its
 * place, kept, and each capped line before it as an optional amber line (rank 1). The reference for "no panel grows".
 */
function i1Panel(t: PanelText, opening: string, capped: readonly string[]): PanelText {
  const back = (bs: readonly Block[]): Block[] => bs.flatMap((b) => (b.text === capped[0] && b.role === "ability"
    ? [...capped.map((text): Block => ({ role: "warn", text, rank: 1 })), { ...b, text: opening, colour: undefined }]
    : capped.slice(1).includes(b.text) || /^THE .+ WORKS \d+% FASTER\.$/.test(b.text) ? [] : [b]));
  return { ...t, body: back(t.body), variants: t.variants?.map((v) => ({ ...v, body: back(v.body) })) };
}

// ------------------------------------------------------------------------------------------------------------ tests

describe("STOKER's capped line takes the opening sentence's place (0.8.0 B1 M4, VERIFIED-I1 call 5)", () => {
  it("the decks: these factories are capped (stokeKeep) and these have room, by the estimate the battle's cap plays", () => {
    for (const c of ONE_CAPPED) {
      const fs = factoriesOf(c.b);
      expect(fs.length, c.id).toBe(1);
      expect(stokeKeep(c.b).get(fs[0])! < 1, c.id).toBe(true);
    }
    for (const c of TWO) expect(factoriesOf(c.b).length, c.id).toBe(2);
    for (const c of UNCAPPED) {
      expect(factoriesOf(c.b).length, c.id).toBeGreaterThan(0);
      for (const f of factoriesOf(c.b)) expect(stokeKeep(c.b).get(f) ?? 1, c.id).toBe(1);
    }
    // AZ-BUMP (the flip, LADDER_FIX): the 8-tile Kiln at ★3 left UNCAPPED. Its gun (a load every 30 / 42 s, E1's long belt)
    // has room for 75% more than the Kiln's stamp every 1.25 s, so STOKER ★3's 85% is held to 75% (keep 0.75 / 0.85) and the
    // panel says so; with LADDER_FIX off (★3 0.7) it has room, as before
    const kiln3 = stoked(longKiln, 3, 6, 6);
    expect(factoriesOf(kiln3)).toEqual([1]);
    expect(stokeKeep(kiln3).get(1)).toBeCloseTo(0.75 / 0.85, 9);
    expect(stokeCapBlocks(runOf({ id: "8-tile Kiln ★3", b: kiln3, stars: 3 }, 0), [1]).map((b) => b.text)).toEqual(["THE KILN'S GUN IS FULL: IT WORKS ONLY 75% FASTER."]);
    expect(withLadderFix(() => stokeKeep(kiln3).get(1) ?? 1, false)).toBe(1);
  });

  it("capped: the opening block keeps its place and its keep, its text the capped line; the N% sentence is gone", () => {
    for (const c of [...ONE_CAPPED, ...TWO]) for (const spare of [0, 1]) {
      const run = runOf(c, spare), t = rigPanel(run, STOKER)!, what = `${c.id} spare${spare}`;
      const capped = stokeCapBlocks(run, factoriesOf(c.b)).map((b) => b.text);
      expect(capped.length, what).toBeGreaterThan(0);
      const at = t.body.findIndex((b) => b.role !== "hits");
      const open = t.body[at];
      expect([open.role, open.text, open.keep, open.colour], what).toEqual(["ability", capped[0], true, ROLE.warn.colour]);
      expect(stokerAbility(run, "stoker", c.stars, factoriesOf(c.b))[0], what).toEqual(open);
      expect(open.text, what).toMatch(CAPPED);
      expect(banned(open.text), what).toEqual([]);
      // the glossary's opening sentence is in no block of the panel, nor of any compact form
      // U2b: nor the face's N% line
      for (const bs of [t.body, ...(t.variants ?? []).map((v) => v.body)]) expect(bs.filter((b) => OPENING.test(b.text) || FACE_OPENING.test(b.text)), what).toEqual([]);
      // U2b (REQ-BFG-046): the face's later rule lines follow (none: one rule), then its interim caveat (F5, call 7), kept
      expect(t.body.filter((b) => b.role === "ability" && !b.colour && !/ WORKS \d+% FASTER\.$/.test(b.text)).map((b) => b.text), what)
        .toEqual(faceLines("stoker", c.stars)!.rules.slice(1).map((r) => r.text));
      // Y7b2 (the flip): the interim caveats left (all but INNER COLUMN ONLY), so STOKER's face has none and no caveat block
      // shows (was toEqual(faceLines("stoker", c.stars)!.caveats!.map((x) => [x, true])), its interim caveat, kept)
      expect(faceLines("stoker", c.stars)!.caveats, what).toBeUndefined();
      expect(t.body.filter((b) => b.role === "caveat").map((b) => [b.text, b.keep]), what).toEqual([]);
    }
  });

  it("capped: on the phone band, the desk and the laptop column the line shows whole, kept, and no drawn line promises the N% speed-up", () => {
    for (const c of [...ONE_CAPPED, ...TWO]) for (const spare of [0, 1]) for (const [band, area] of BANDS) {
      const run = runOf(c, spare), t = rigPanel(run, STOKER)!, what = `${c.id} spare${spare} on the ${band}`;
      const cap = stokeCapBlocks(run, factoriesOf(c.b))[0].text;
      const p = planPanel(t, area);
      const vis = visibleLines(p).flatMap((v) => (v.line === "rule" ? [] : [v.line]));
      const drawn = new Set<PLine>(vis);
      expect(p.body.fits, what).toBe(true);
      if (band !== "phone") expect(p.body.font, what).toBe("5");
      for (const l of p.body.shown.filter((x) => x.b.keep)) expect(l.lines.every((x) => drawn.has(x)), `${what}: ${l.b.text}`).toBe(true);
      const line = p.body.shown.find((l) => l.b.text === cap);
      expect(line, what).toBeDefined();
      expect(line!.lines.every((x) => drawn.has(x)), what).toBe(true);
      expect(vis.map(lineText).join(" "), what).not.toMatch(/ARROWS POINT AT/);
      expect(vis.map(lineText).join(" ").replace(/\s+/g, " "), what).toContain(cap);
    }
  });

  it("capped: the line is drawn in the warning's amber on the phone and the desk (drawDetails), never in the ability text's bone", () => {
    const ctxOf = (run: Run): Ctx => ({ game: { ui: new UI(), t: 0 }, run } as unknown as Ctx);
    let checked = 0;
    for (const c of [...ONE_CAPPED, ...TWO]) for (const [band, area] of BANDS) {
      const run = runOf(c, 1), t = rigPanel(run, STOKER)!, what = `${c.id} on the ${band}`;
      const cap = stokeCapBlocks(run, factoriesOf(c.b))[0].text;
      const p = planPanel(t, area);
      const canvas = fresh(area.x + area.w + 4, area.y + area.h + 4);
      drawDetails(G(canvas), ctxOf(run), { kind: "item", uid: STOKER }, null, area, {} as DuskFoe);
      const rows = visibleLines(p).filter((v) => v.line !== "rule" && (v.line as PLine).block.text === cap);
      expect(rows.length, what).toBeGreaterThan(0);
      let amber = 0, bone = 0;
      for (const v of rows) {
        const h = (v.line as PLine).font === "5" ? 7 : 5;
        for (let j = v.y; j < v.y + h; j++) for (let i = p.r.x + 5; i < p.r.x + p.r.w - 5; i++) {
          const px = canvas.at(i, j);
          if (px === C.amber) amber++;
          if (px === C.bone) bone++;
        }
      }
      expect(amber, what).toBeGreaterThan(0);
      expect(bone, what).toBe(0);
      expect(ROLE.warn.colour).toBe(C.amber);
      checked++;
    }
    expect(checked).toBe((ONE_CAPPED.length + TWO.length) * BANDS.length);
  });

  it("no panel grows: as many drawn lines as I1's panel, and no taller in the columns, on every band", () => {
    const tally = { phone: 0, desk: 0, laptop: 0, cases: 0 }, before = { phone: 0, desk: 0, laptop: 0 };
    for (const c of ONE_CAPPED) for (const spare of [0, 1]) {
      const run = runOf(c, spare), t = rigPanel(run, STOKER)!;
      const capped = stokeCapBlocks(run, factoriesOf(c.b)).map((b) => b.text);
      const old = i1Panel(t, abilityText("stoker", c.stars).sentences[0], capped);
      expect(old.body.filter((b) => OPENING.test(b.text)).length, c.id).toBe(1);
      tally.cases++;
      for (const [band, area] of BANDS) {
        const what = `${c.id} spare${spare} on the ${band}`;
        const now = planPanel(t, area), was = planPanel(old, area);
        const count = (p: typeof now) => visibleLines(p).filter((v) => v.line !== "rule").length;
        expect(count(now), what).toBeLessThanOrEqual(count(was));
        expect(now.r.h, what).toBeLessThanOrEqual(was.r.h);
        if (band !== "phone") expect([now.body.font, was.body.font], what).toEqual(["5", "5"]);
        if (now.body.shown.some((l) => l.b.text === capped[0])) tally[band]++;
        if (was.body.shown.some((l) => l.b.text === capped[0])) before[band]++;
      }
    }
    // I1's 16 layouts and the panel deck's 12: the line now shows on every band in all of them (I1: the desk 15 of its 16,
    // the phone none)
    expect(tally).toEqual({ phone: 28, desk: 28, laptop: 28, cases: 28 });
    // U2e step 4 (REQ-BFG-070): 18, measured (was 0). The reference I1 panel is rebuilt from today's (i1Panel), and today's
    // no longer carries NEXT★ and merge progress, so I1's optional capped line now has room on the phone in 18 of its 28
    // layouts. The check that matters is unchanged and above: the capped line shows on every band in all 28
    expect(before.phone).toBe(18);
  });

  it("uncapped: the text is the glossary's, unchanged: the N% sentence opens, kept, in the ability text's colour; no capped line", () => {
    for (const c of UNCAPPED) for (const spare of [0, 1]) {
      const run = runOf(c, spare), t = rigPanel(run, STOKER)!, what = `${c.id} spare${spare}`;
      expect(stokeCapBlocks(run, factoriesOf(c.b)), what).toEqual([]);
      const ability = t.body.filter((b) => b.role === "ability");
      // U2b (REQ-BFG-046): the face's rule lines (faceLines), its N% line first
      expect(ability.map((b) => b.text), what).toEqual(faceLines("stoker", c.stars)!.rules.map((r) => r.text));
      expect([ability[0].keep, ability[0].colour], what).toEqual([true, undefined]);
      expect(ability[0].text, what).toMatch(FACE_OPENING);
      expect(t.body.filter((b) => CAPPED.test(b.text) || b.role === "warn"), what).toEqual([]);
      for (const [band, area] of BANDS) {
        const p = planPanel(t, area);
        expect(p.body.fits, `${what} on the ${band}`).toBe(true);
        expect(p.body.shown.some((l) => FACE_OPENING.test(l.b.text)), `${what} on the ${band}`).toBe(true); // U2b: the face's
      }
    }
  });

  it("two factories: the first capped line opens; the other factory's line follows where there is room (a second capped line, or its full speed-up)", () => {
    for (const c of TWO) {
      const run = runOf(c, 0), t = rigPanel(run, STOKER)!, fs = factoriesOf(c.b);
      const capped = stokeCapBlocks(run, fs);
      const keep = stokeKeep(c.b);
      const full = fs.filter((f) => (keep.get(f) ?? 1) >= 1);
      expect(capped.length + full.length, c.id).toBe(2);
      const rest = t.body.filter((b) => b.rank === 1 && !b.keep).map((b) => b.text);
      expect(rest, c.id).toEqual([...capped.slice(1).map((b) => b.text), ...full.map((f) => {
        const name = (c.b.items.find((p) => p.uid === f) as Placed).def === "press" ? "STAMP PRESS" : "DRAG CHAIN FOUNDRY";
        // AZ-BUMP (the flip, LADDER_FIX): ★3 70 -> 85, STOKER ★3's stoke 0.7 -> 0.85 (the star-ladder pass); a factory with no
        // gun keeps the full stoke
        return `THE ${name} WORKS ${[20, 44, 85][c.stars - 1]}% FASTER.`;
      })]);
    }
    // AZ-BUMP (the flip, LADDER_FIX): with LADDER_FIX off the loose STAMP PRESS beside the ★3 Kiln works 70% faster, as before
    const loose3 = TWO.find((c) => c.id === "6-tile Kiln and a loose STAMP PRESS ★3")!;
    expect(withLadderFix(() => rigPanel(runOf(loose3, 0), STOKER)!.body.filter((b) => b.rank === 1 && !b.keep).map((b) => b.text), false))
      .toEqual(["THE STAMP PRESS WORKS 70% FASTER."]);
  });
});

// ------------------------------------------------------------------------------------------- G1's F2: ARMOR PRESS

/** G1's C-E3-press deck (tests/wave3.gaps.test.ts kilnAnd): FURNACE's start deck with an ARMOR PRESS (uid 7, ★press) at
 *  (6,6) on (6,5), (5,5) and up column 5 into connector 5: the Kiln and the press share the heavy gun, which takes a load
 *  a second, so the cap leaves the press no room to stamp faster. A STOKER (★s) at (8,6): its west arrow into the press. */
function pressDeck(press = 1): Build {
  const b = furnaceStart();
  return {
    ...b, hullBonus: 5000, items: [...b.items, item(7, "armorpress", 6, 6, 0, press)],
    routes: [...b.routes, { factory: 7, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] }],
  };
}
const sharedPress = (s: number, press = 1): Build => withItem(pressDeck(press), item(STOKER, "stoker", 8, 6, 0, s));
/** The press alone on the heavy gun: FURNACE's Kiln parked off any belt at (0,8) (tests/wave3.helpers.ts twoPress), the
 *  ARMOR PRESS (uid 7, ★press) at (4,6) on a 6-tile belt up column 4 into connector 4, a STOKER (★s) at (3,6) east of it.
 *  The gun takes a load a second, so a press stamping every 1.6 s (1.4 s at 2 stars) has room for 60% (40%) more.
 *  `s` 0: no STOKER. */
function lonePress(s: number, press = 1): Build {
  return {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 5000,
    items: [{ uid: 1, def: "kiln", x: 0, y: 8 }, item(7, "armorpress", 4, 6, 0, press), ...(s ? [item(STOKER, "stoker", 3, 6, 0, s)] : [])],
    routes: [{ factory: 7, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
  };
}
const pressRun = (b: Build, spare = 0): Run => runOf({ id: "", b, stars: 1 }, spare);
const capLine = (b: Build): string => stokeCapBlocks(pressRun(b), [7])[0]?.text ?? "";

/** The press's stamps and its platings over 21 s of battle against a barge that never fires. */
function pressLog(b: Build): { stamps: number[]; plates: number[] } {
  const stamps: number[] = [], plates: number[] = [];
  fight(b, 21, barge(), SEED, (ev, bt) => {
    for (const e of ev) {
      if (e.type === "plate" && e.side === 0) plates.push(bt.t);
      if (e.type === "produce" && e.side === 0 && e.factory === 7) stamps.push(bt.t);
    }
  });
  return { stamps, plates };
}
/** A log's mean gap, from its second event on (the STOKER is online by then). */
const meanGap = (ts: number[]): number => {
  const gaps = ts.slice(2).map((t, i) => t - ts[i + 1]);
  return gaps.reduce((s, g) => s + g, 0) / gaps.length;
};
/** How much faster than `base` seconds a log's mean gap is. */
const fasterThan = (ts: number[], base: number): number => base / meanGap(ts) - 1;
const pcts = (text: string): number[] => [...text.matchAll(/(\d+)% FASTER/g)].map((m) => +m[1] / 100);

describe("G1's F2: a stoke speeds ARMOR PRESS's plating in full while the gun holds its stamping; the text says so", () => {
  it("the decks are ones a player could own on day 10 (the + 5000 hull aside); the press is the STOKER's only factory", () => {
    for (const s of [1, 2, 3]) for (const b of [sharedPress(s), lonePress(s), lonePress(s, 2)]) {
      withWave3(() => expect(validateBuild({ ...b, hullBonus: 0 }, 10).errors, `★${s}`).toEqual([]));
      expect(factoriesOf(b)).toEqual([7]);
    }
  });

  it("G1's C-E3-press deck: \"SO ONLY ITS PLATING WORKS 20 / 44 / 70% FASTER\", and the battle stamps as unstoked and plates that much faster", () => {
    const off = pressLog(pressDeck()); // no STOKER
    // AZ-BUMP (the flip, LADDER_FIX): ★3 0.7 -> 0.85, STOKER ★3's stoke (the star-ladder pass): the plating takes the full
    // stoke, so ★3's line and the battle's plating read 85% (70% with LADDER_FIX off: after the loop)
    for (const [s, k] of [[1, 0.2], [2, 0.44], [3, 0.85]] as const) {
      const b = sharedPress(s);
      // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): was ", SO ONLY ITS PLATING ..."
      expect(capLine(b), `★${s}`).toBe(`THE ARMOR PRESS'S GUN IS FULL: ONLY ITS SHIELD COMES ${Math.round(k * 100)}% FASTER.`); // CARD-3 (REQ-BFG-107)
      const on = pressLog(b);
      expect(on.stamps, `★${s}: the press stamps as it did unstoked`).toEqual(off.stamps);
      const measured = fasterThan(on.plates, 3); // ARMOR PRESS plates every 3 s
      expect(Math.abs(measured - k), `★${s}: the plating ${measured.toFixed(3)} faster`).toBeLessThan(0.01);
      expect(pcts(capLine(b)), `★${s}`).toEqual([Math.round(measured * 100) / 100]);
    }
    expect(fasterThan(off.plates, 3)).toBeCloseTo(0, 6);
    // MERGE-099D (BRIEF-MERGE-099D 1d/1f): c099's LADDER_FIX-off pin in CARD-3's words (inspector.ts stokeCapBlocks: ITS
    // SHIELD COMES; was ONLY ITS PLATING WORKS)
    expect(withLadderFix(() => capLine(sharedPress(3)), false)).toBe("THE ARMOR PRESS'S GUN IS FULL: ONLY ITS SHIELD COMES 70% FASTER.");
  });

  // NUM-4 (REQ-BFG-047): retitled, the title quoted the line before NUM-2 (was "room for part of the stoke: \"SO IT STAMPS
  // ONLY 60% FASTER, BUT PLATES 70% FASTER\", both numbers the battle's"); the checks kept, and the [2, 2] row re-pinned
  it("room for part of the stoke: \"IT STAMPS ONLY 58% FASTER, BUT PLATES 70% FASTER\", both numbers the battle's; under one SPEED point held back, no line", () => {
    // NUM-4 (REQ-BFG-047; REVIEW-NUM2 answer 2): GUN IS FULL shows only when the cap holds back at least one whole SPEED
    // point of the stoke (inspector.ts stokeCapBlocks): the press's SPEED x the STOKER's stoke x (1 - the rating's keep)
    const heldBack = (s: number, press: number): number =>
      effectAt("armorpress", press).factory!.speed * effectAt("stoker", s).gate!.stoke! * (1 - stokeKeep(lonePress(s, press)).get(7)!);
    const want: [number, number, string | null][] = [
      // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): was ", SO IT STAMPS ONLY ..."
      // NUM-2 (REQ-BFG-047; was 60%): the ★1 press stamps every 30 / 19 = 1.58 s (was 1.6), so the full gun leaves it 58%
      // AZ-BUMP (the flip, LADDER_FIX): PLATES 70% -> 85%, STOKER ★3's stoke 0.7 -> 0.85 (the plating takes the full stoke;
      // the stamping still stops at the gun's 58%); off, 70%: after the loop. CARD-3 (REQ-BFG-107): ITS SHIELD COMES (was
      // PLATES); MERGE-099D: c099's 85% in CARD-3's words
      [3, 1, "THE ARMOR PRESS'S GUN IS FULL: IT STAMPS ONLY 58% FASTER, BUT ITS SHIELD COMES 85% FASTER."],
      // NUM-2 (was 40%, 40%): the ★2 press stamps every 30 / 21 = 1.43 s (was 1.4), so the full gun leaves it 43%
      // NUM-4 (REQ-BFG-047): the named rule change, GUN IS FULL's threshold from the data: the cap holds back 21 x 0.44 x
      // (1 - 43/44) = 0.21 of a SPEED point, under one, so no line (was "THE ARMOR PRESS'S GUN IS FULL: IT STAMPS ONLY 43%
      // FASTER, BUT PLATES 44% FASTER."); the STOKER's panel opens with its face's own line, as the room cases below, and
      // the battle checks stay, their numbers now the data's (the rating's keep x the stoke, and the stoke)
      [2, 2, null],
      // AZ-BUMP (the flip, LADDER_FIX): PLATES 70% -> 85%, as above (the stamping at the gun's 43%: 21 / 30 x 1.85 against a
      // load a second keeps 0.504 of the stoke). MERGE-099D: in CARD-3's words (ITS SHIELD COMES)
      [3, 2, "THE ARMOR PRESS'S GUN IS FULL: IT STAMPS ONLY 43% FASTER, BUT ITS SHIELD COMES 85% FASTER."],
    ];
    for (const [s, press, text] of want) {
      const b = lonePress(s, press);
      const stoke = effectAt("stoker", s).gate!.stoke!, keep = stokeKeep(b).get(7)!;
      if (text) {
        expect(heldBack(s, press), text).toBeGreaterThanOrEqual(1);
        expect(capLine(b)).toBe(text);
        expect(pcts(text)).toEqual([Math.round(stoke * keep * 100) / 100, stoke]); // the line's two numbers are the data's
      } else {
        expect(heldBack(s, press), `★${s} on the ★${press} press`).toBeLessThan(1);
        expect(capLine(b), `★${s} on the ★${press} press`).toBe("");
        expect(rigPanel(pressRun(b), STOKER)!.body.find((x) => x.role === "ability")!.text).toBe(faceLines("stoker", s)!.rules[0].text);
      }
      // against the same press unstoked in the battle (its stamps land on the tick after each 1.6 s: every 1.617 s). NUM-2:
      // every 30 / speed s, the timer carrying its remainder: measured 1.579 s at ★1 (30 / 19), 1.430 s at ★2 (30 / 21)
      // NUM-4: a row without a line takes its two numbers from the data the line would have read (stoke x keep, stoke)
      const off = pressLog(lonePress(0, press)), on = pressLog(b);
      const [stamp, plate] = text ? pcts(text) : [Math.round(stoke * keep * 100) / 100, stoke];
      const label = text ?? `★${s} on the ★${press} press, no line`;
      const stamped = fasterThan(on.stamps.filter((t) => t > 3), meanGap(off.stamps)), plated = fasterThan(on.plates, meanGap(off.plates));
      expect(Math.abs(stamped - stamp), `${label}: the stamping ${stamped.toFixed(3)} faster`).toBeLessThan(0.015);
      expect(Math.abs(plated - plate), `${label}: the plating ${plated.toFixed(3)} faster`).toBeLessThan(0.01);
      // the plating outpaces the stamping, as the line says. NUM-2 (REQ-BFG-047): an EQUIVALENT replacement of `plated -
      // stamped > 0.02`, the fixed margin that was half the smallest gap a line claimed (0.44 - 0.40): the battle's gap is
      // above 0 and is the line's own gap (plate - stamp) within 0.005 either way. NUM-2's ★2 press stamps every 30 / 21 =
      // 1.43 s (was 1.4), so the full gun leaves it 43% of STOKER ★2's 44% and that line claims a 1-point gap; the battle
      // measures 0.0105 (the other two lines: 0.119 of 0.12, 0.269 of 0.27)
      expect(plated - stamped, label).toBeGreaterThan(0);
      // AZ-BUMP (the flip, LADDER_FIX): STOKER ★3 0.85 on the ★2 press measures a gap of 0.426 against the line's 0.42
      // (85% - 43%; its 43% is 0.85 x 0.504 = 0.428 rounded, so the rounding alone is 0.002 of it): that row within 0.01,
      // the plating's own band above; the other rows still within 0.005
      expect(Math.abs(plated - stamped - (plate - stamp)), label).toBeLessThan(s === 3 && press === 2 ? 0.01 : 0.005);
      // NUM-4 (REQ-BFG-047): the threshold in the battle's own numbers: the SPEED points the cap holds back, the press's
      // SPEED x (plated - stamped), are at least one where a line shows and under one where none does (★2 on ★2: 0.22)
      const speed = effectAt("armorpress", press).factory!.speed;
      if (text) expect(speed * (plated - stamped), label).toBeGreaterThanOrEqual(1);
      else expect(speed * (plated - stamped), label).toBeLessThan(1);
    }
    // AZ-BUMP (the flip, LADDER_FIX): with LADDER_FIX off, ★3's two lines read 70% as before. MERGE-099D (1d/1f): in
    // CARD-3's words, ITS SHIELD COMES (was BUT PLATES)
    expect(withLadderFix(() => [capLine(lonePress(3, 1)), capLine(lonePress(3, 2))], false)).toEqual([
      "THE ARMOR PRESS'S GUN IS FULL: IT STAMPS ONLY 58% FASTER, BUT ITS SHIELD COMES 70% FASTER.",
      "THE ARMOR PRESS'S GUN IS FULL: IT STAMPS ONLY 43% FASTER, BUT ITS SHIELD COMES 70% FASTER.",
    ]);
    // where the gun has room for the whole stoke (1 and 2 stars on the 1-star press) the opening sentence stays the
    // glossary's: the press works 20 / 44% faster, its plating with it
    for (const s of [1, 2]) {
      expect(capLine(lonePress(s)), `★${s}`).toBe("");
      expect(rigPanel(pressRun(lonePress(s)), STOKER)!.body.find((b) => b.role === "ability")!.text).toBe(faceLines("stoker", s)!.rules[0].text); // U2b: the face's
    }
  });

  it("a STOKER beside an ARMOR PRESS: the line opens its panel and fits every band (phone whole, desk and laptop 5x7); a plain factory keeps I1's words", () => {
    for (const b of [1, 2, 3].flatMap((s) => [sharedPress(s), lonePress(s), lonePress(s, 2)])) for (const spare of [0, 1]) {
      const run = pressRun(b, spare), t = rigPanel(run, STOKER)!, line = capLine(b);
      if (!line) continue;
      expect(line).toMatch(/^THE ARMOR PRESS'S GUN IS FULL: (ONLY ITS SHIELD COMES \d+% FASTER|IT STAMPS ONLY \d+% FASTER, BUT ITS SHIELD COMES \d+% FASTER)\.$/); // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.)
      expect(banned(line)).toEqual([]);
      const open = t.body.find((x) => x.role !== "hits")!;
      expect([open.text, open.keep, open.colour]).toEqual([line, true, ROLE.warn.colour]);
      for (const [band, area] of BANDS) {
        const p = planPanel(t, area), what = `${line} spare${spare} on the ${band}`;
        const drawn = new Set(visibleLines(p).map((v) => v.line));
        expect(p.body.fits, what).toBe(true);
        if (band !== "phone") expect(p.body.font, what).toBe("5");
        for (const l of p.body.shown.filter((x) => x.b.keep)) expect(l.lines.every((x) => drawn.has(x)), what).toBe(true);
        expect(p.body.shown.some((l) => l.b.text === line), what).toBe(true);
      }
    }
    // a factory without plating keeps I1's words ("... SO IT WORKS NO FASTER." / "... ONLY 25% FASTER.")
    expect(stokeCapBlocks(runOf({ id: "", b: stoked(furnaceStart, 2, 6, 6), stars: 2 }, 0), [1]).map((x) => x.text))
      .toEqual(["THE KILN'S GUN IS FULL: IT WORKS ONLY 25% FASTER."]); // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.)
    expect(stokeCapBlocks(runOf({ id: "", b: stoked(lockjaw, 1, 8, 6), stars: 1 }, 0), [2]).map((x) => x.text))
      .toEqual(["THE TWIN MOULD'S GUN IS FULL: IT WORKS NO FASTER."]); // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.)
    // ARMOR PRESS's own sentences state no pace for a stoke to contradict (the STOKER's line says it where it applies)
    for (const s of [1, 2, 3]) expect(abilityText("armorpress", s).sentences.join(" "), `★${s}`).not.toMatch(/STOKE|PACE|FASTER/);
  });
});

// ------------------------------------------------------------------------------------- tag polish (VERIFIED-I1 call 7)

// SHOPCARD-1 (REQ-BFG-115): retired: "the desk's wide card: a clear row between the effect's second line and the family marks
// (VERIFIED-I1 call 7)" pinned the wide face's effect lines and family marks, which the card no longer draws (the one face is
// its icon and price; tests/shopcard1.test.ts pins it at both widths, every state, with no text but the price's digits).

describe("DRAG CHAIN FOUNDRY at 3 stars on the phone shows its families (VERIFIED-I1 call 7)", () => {
  const PHONE = BANDS[0][1];
  const dragchain = (): { id: string; run: Run; sel: Sel; t: PanelText }[] => {
    const out: { id: string; run: Run; sel: Sel; t: PanelText }[] = [];
    for (const spare of [0, 1]) {
      const run = newRun("furnace", 5, "fam");
      run.inventory = [{ uid: 900, def: "dragchain", stars: 3 }, ...Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def: "dragchain" }))];
      out.push({ id: `cargo spare${spare}`, run, sel: { kind: "cargo", uid: 900 }, t: cargoPanel(run, 900)! });
    }
    const run = newRun("furnace", 5, "fam");
    run.build.items.push({ uid: 901, def: "dragchain", x: 6, y: 6, stars: 3 });
    run.build.routes.push({ factory: 901, cells: [56, 55, 45, 35, 25, 15, 5] });
    out.push({ id: "placed", run, sel: { kind: "item", uid: 901 }, t: itemPanel(run, 901)! });
    return out;
  };

  it("its marks sit right of its title, one clear pixel past the title's outline, drawn where planned (I1: no place at all)", () => {
    const ctxOf = (run: Run): Ctx => ({ game: { ui: new UI(), t: 0 }, run } as unknown as Ctx);
    for (const c of dragchain()) {
      const fam = selFamilies(c.run, c.sel), p = planPanel(c.t, PHONE, fam), r = p.r, w = fam.length * 4 - 1;
      expect(fam, c.id).toEqual(familiesOf("dragchain"));
      expect(p.famHead, c.id).toEqual({ at: "title", tags: fam, names: false });
      // I1's rule (6 px beside the title) had no room; the buttons dropped under the sub line take the band below it
      expect(23 + textWidth(c.t.title) + 6 + w > PHONE.w - 4, c.id).toBe(true);
      expect(p.shift, c.id).toBe(12);
      // the marks' clear ring: right of the title's box (its outline), inside the panel, above the sub line
      const x0 = r.x + r.w - 4 - w;
      expect(x0 - 1, c.id).toBeGreaterThanOrEqual(r.x + 22 + textWidth(c.t.title) + 2);
      expect([r.y + 6 - 1 >= r.y + 4, r.y + 6 + 3 + 1 <= r.y + 13], c.id).toEqual([true, true]);
      // drawn where planned: drawDetails puts the marks' pixels exactly as drawFamHead alone does
      const W = PHONE.x + PHONE.w + 4, H = PHONE.y + PHONE.h + 4, alone = fresh(W, H), full = fresh(W, H);
      drawFamHead(G(alone), p);
      drawDetails(G(full), ctxOf(c.run), c.sel, null, PHONE, {} as DuskFoe);
      let n = 0;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const px = alone.at(i, j);
        if (px === null) continue;
        n++;
        expect(full.at(i, j), `${c.id} (${i},${j})`).toBe(px);
      }
      expect(n, c.id).toBeGreaterThan(fam.length * 3);
      // and the column between the title and the marks is the panel's own: no title outline, no mark
      const notHere = [C.ink, c.t.color, ...fam.map((f) => FAMILY[f].colour)];
      for (let j = r.y + 3; j <= r.y + 11; j++) expect(notHere.includes(full.at(x0 - 1, j) as string), `${c.id} (${x0 - 1},${j})`).toBe(false);
    }
  });

  it("every module's cargo, placed and offer panel now names or marks its families on the phone, the desk and the laptop", () => {
    let panels = 0;
    for (const d of buyableModules()) {
      if (!familiesOf(d.id).length) continue;
      const cases: { run: Run; sel: Sel; t: PanelText }[] = [];
      for (const s of [1, 2, 3]) {
        const run = newRun("furnace", 5, "fam");
        run.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
        cases.push({ run, sel: { kind: "cargo", uid: 900 }, t: cargoPanel(run, 900)! });
        if (d.kind === "factory") {
          const r2 = newRun("furnace", 5, "fam");
          r2.build.items.push({ uid: 901, def: d.id, x: 6, y: 6, ...(s > 1 ? { stars: s } : {}) });
          r2.build.routes.push({ factory: 901, cells: [56, 55, 45, 35, 25, 15, 5] });
          cases.push({ run: r2, sel: { kind: "item", uid: 901 }, t: itemPanel(r2, 901)! });
        }
      }
      const run = newRun("furnace", 5, "fam");
      run.gold = 99;
      run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
      cases.push({ run, sel: { kind: "offer", wagon: 0, slot: 0 }, t: offerPanel(run, 0, 0)! });
      for (const c of cases) for (const [band, area] of BANDS) {
        expect(planPanel(c.t, area, selFamilies(c.run, c.sel)).famHead, `${d.id} ${c.t.title} ${c.sel.kind} on the ${band}`).not.toBeNull();
        panels++;
      }
    }
    expect(panels).toBeGreaterThan(700);
  });
});
