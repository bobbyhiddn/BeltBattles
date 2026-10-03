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
import { withWave3 } from "../src/sim/content";
import { newRun, type DuskFoe, type Run } from "../src/game/run";
import { key as K, stokeHits, type Build, type Placed } from "../src/sim/deck";
import { stokeKeep } from "../src/sim/deckRating";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { validateBuild } from "../src/net/validate";
import { buildLayout } from "../src/screens/build/layout";
import {
  ROLE, drawDetails, planPanel, rigPanel, stokeCapBlocks, stokerAbility, visibleLines, type Block, type PanelText, type PLine,
} from "../src/screens/build/inspector";
import type { Ctx } from "../src/screens/build/actions";
import { UI } from "../src/ui/ui";
import { abilityText } from "../src/ui/abilityText";
import { banned } from "./textRules";
import { SEED, barge, item, run as fight, withItem, withMod } from "./wave3.helpers";

installRaster();

/** The 390x844 phone's band, the 1920x1080 desk's column, the 1366x768 laptop's column (tests/abilityPanels.test.ts). */
const BANDS = [
  ["phone", buildLayout(167, 361, true, 5).info],
  ["desk", buildLayout(480, 270, false, 5).info],
  ["laptop", buildLayout(455, 256, false, 5).info],
] as const;
const STOKER = 70;
const OPENING = /^EACH FACTORY ITS ARROWS POINT AT WORKS \d+% FASTER\.$/;
const CAPPED = /^THE .+'S GUN IS FULL, SO /;

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
  ...cases("8-tile Kiln", longKiln, 6, 6),
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
      for (const bs of [t.body, ...(t.variants ?? []).map((v) => v.body)]) expect(bs.filter((b) => OPENING.test(b.text)), what).toEqual([]);
      // the ability's later sentences follow, as the glossary has them
      expect(t.body.filter((b) => b.role === "ability" && !b.colour && !/ WORKS \d+% FASTER\.$/.test(b.text)).map((b) => b.text), what)
        .toEqual(abilityText("stoker", c.stars).sentences.slice(1));
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
    expect(before.phone).toBe(0);
  });

  it("uncapped: the text is the glossary's, unchanged: the N% sentence opens, kept, in the ability text's colour; no capped line", () => {
    for (const c of UNCAPPED) for (const spare of [0, 1]) {
      const run = runOf(c, spare), t = rigPanel(run, STOKER)!, what = `${c.id} spare${spare}`;
      expect(stokeCapBlocks(run, factoriesOf(c.b)), what).toEqual([]);
      const ability = t.body.filter((b) => b.role === "ability");
      expect(ability.map((b) => b.text), what).toEqual(abilityText("stoker", c.stars).sentences);
      expect([ability[0].keep, ability[0].colour], what).toEqual([true, undefined]);
      expect(ability[0].text, what).toMatch(OPENING);
      expect(t.body.filter((b) => CAPPED.test(b.text) || b.role === "warn"), what).toEqual([]);
      for (const [band, area] of BANDS) {
        const p = planPanel(t, area);
        expect(p.body.fits, `${what} on the ${band}`).toBe(true);
        expect(p.body.shown.some((l) => OPENING.test(l.b.text)), `${what} on the ${band}`).toBe(true);
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
        return `THE ${name} WORKS ${[20, 44, 70][c.stars - 1]}% FASTER.`;
      })]);
    }
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
    for (const [s, k] of [[1, 0.2], [2, 0.44], [3, 0.7]] as const) {
      const b = sharedPress(s);
      expect(capLine(b), `★${s}`).toBe(`THE ARMOR PRESS'S GUN IS FULL, SO ONLY ITS PLATING WORKS ${Math.round(k * 100)}% FASTER.`);
      const on = pressLog(b);
      expect(on.stamps, `★${s}: the press stamps as it did unstoked`).toEqual(off.stamps);
      const measured = fasterThan(on.plates, 3); // ARMOR PRESS plates every 3 s
      expect(Math.abs(measured - k), `★${s}: the plating ${measured.toFixed(3)} faster`).toBeLessThan(0.01);
      expect(pcts(capLine(b)), `★${s}`).toEqual([Math.round(measured * 100) / 100]);
    }
    expect(fasterThan(off.plates, 3)).toBeCloseTo(0, 6);
  });

  it("room for part of the stoke: \"SO IT STAMPS ONLY 60% FASTER, BUT PLATES 70% FASTER\", both numbers the battle's", () => {
    const want: [number, number, string][] = [
      [3, 1, "THE ARMOR PRESS'S GUN IS FULL, SO IT STAMPS ONLY 60% FASTER, BUT PLATES 70% FASTER."],
      [2, 2, "THE ARMOR PRESS'S GUN IS FULL, SO IT STAMPS ONLY 40% FASTER, BUT PLATES 44% FASTER."],
      [3, 2, "THE ARMOR PRESS'S GUN IS FULL, SO IT STAMPS ONLY 40% FASTER, BUT PLATES 70% FASTER."],
    ];
    for (const [s, press, text] of want) {
      const b = lonePress(s, press);
      expect(capLine(b)).toBe(text);
      // against the same press unstoked in the battle (its stamps land on the tick after each 1.6 s: every 1.617 s)
      const off = pressLog(lonePress(0, press)), on = pressLog(b), [stamp, plate] = pcts(text);
      const stamped = fasterThan(on.stamps.filter((t) => t > 3), meanGap(off.stamps)), plated = fasterThan(on.plates, meanGap(off.plates));
      expect(Math.abs(stamped - stamp), `${text}: the stamping ${stamped.toFixed(3)} faster`).toBeLessThan(0.015);
      expect(Math.abs(plated - plate), `${text}: the plating ${plated.toFixed(3)} faster`).toBeLessThan(0.01);
      expect(plated - stamped, text).toBeGreaterThan(0.02); // the plating outpaces the stamping, as the line says
    }
    // where the gun has room for the whole stoke (1 and 2 stars on the 1-star press) the opening sentence stays the
    // glossary's: the press works 20 / 44% faster, its plating with it
    for (const s of [1, 2]) {
      expect(capLine(lonePress(s)), `★${s}`).toBe("");
      expect(rigPanel(pressRun(lonePress(s)), STOKER)!.body.find((b) => b.role === "ability")!.text).toBe(abilityText("stoker", s).sentences[0]);
    }
  });

  it("a STOKER beside an ARMOR PRESS: the line opens its panel and fits every band (phone whole, desk and laptop 5x7); a plain factory keeps I1's words", () => {
    for (const b of [1, 2, 3].flatMap((s) => [sharedPress(s), lonePress(s), lonePress(s, 2)])) for (const spare of [0, 1]) {
      const run = pressRun(b, spare), t = rigPanel(run, STOKER)!, line = capLine(b);
      if (!line) continue;
      expect(line).toMatch(/^THE ARMOR PRESS'S GUN IS FULL, SO (ONLY ITS PLATING WORKS \d+% FASTER|IT STAMPS ONLY \d+% FASTER, BUT PLATES \d+% FASTER)\.$/);
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
      .toEqual(["THE KILN'S GUN IS FULL, SO IT WORKS ONLY 25% FASTER."]);
    expect(stokeCapBlocks(runOf({ id: "", b: stoked(lockjaw, 1, 8, 6), stars: 1 }, 0), [2]).map((x) => x.text))
      .toEqual(["THE TWIN MOULD'S GUN IS FULL, SO IT WORKS NO FASTER."]);
    // ARMOR PRESS's own sentences state no pace for a stoke to contradict (the STOKER's line says it where it applies)
    for (const s of [1, 2, 3]) expect(abilityText("armorpress", s).sentences.join(" "), `★${s}`).not.toMatch(/STOKE|PACE|FASTER/);
  });
});
