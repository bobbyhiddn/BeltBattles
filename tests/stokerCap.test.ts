// 0.8.0 I1 M4 (VERIFIED-P1 H4; REQ-BFG-032): a STOKER's inspect panel says when its stoke is capped by its gun, from the
// same static estimate the par player rates with (deckRating.ts rateDeck's STOKER cap, read through stokeKeep), in the
// 0.6.2 text standard, fitting the phone band and the desk column; the rating itself is unchanged.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { FIGHT_T, RATING_CURVE, rateDeck, stokeKeep, type RateOut } from "../src/sim/deckRating";
import { stokeHits, type Build } from "../src/sim/deck";
import { heroStartBuild, heroRefBuild } from "../src/sim/heroBuilds";
import { newRun, type Run } from "../src/game/run";
import { planPanel, rigPanel, stokeCapBlocks, visibleLines } from "../src/screens/build/inspector";
import { buildLayout } from "../src/screens/build/layout";
import { K, barge, item, withItem, withMod } from "./wave3.helpers";
import { banned } from "./textRules";

const PHONE = buildLayout(167, 394, true, 5).info; // PACKS Q5: the 161 x 69 band (0.8.5's 167 x 361 plus the pack row)
const DESK = buildLayout(480, 270, false, 5).info;

const furnaceStart = (): Build => heroStartBuild("furnace", 1);
/** FURNACE's start deck with its Kiln belt drawn to 8 tiles (tests/wave3.decks.test.ts longKiln: the gun has room). */
function longKiln(): Build {
  const b = furnaceStart();
  b.routes[0].cells = [K(4, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)];
  return b;
}
/** LOCKJAW's layout (tests/wave3.decks.test.ts): an 8-tile Kiln belt into connector 4 and a TWIN MOULD belt into 5. */
function lockjaw(): Build {
  return {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 2, y: 6 }, { uid: 2, def: "twinmould", x: 6, y: 6 }],
    routes: [
      { factory: 1, cells: [K(2, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] },
      { factory: 2, cells: [K(7, 5), K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
    ], mods: [], beltCap: 30, hullBonus: 0,
  };
}
const stoked = (base: () => Build, s: number, x = 6, y = 6): Build => withItem(base(), item(70, "stoker", x, y, 0, s));
/**
 * 0.8.0 T1 (I1 REPORT section 11, VERIFIED-I1 call 6): one stoked factory on two full guns. A FOUNDRY hull (two medium
 * guns: connectors 2-3 and 6-7, a load every 0.8 s); a TWIN MOULD (uid 2, a slug onto each belt every 1.8 s) at (4,6) with
 * a belt into each gun (connector 3, connector 6); a SLAG POT 1 star (a slug every 2.8 s) at (1,6) into connector 2 and a
 * SLAG POT 2 stars (every 2.2 s) at (7,6) into connector 7, so gun 1 is fuller than gun 0; a STOKER 2 stars (+44%) at (4,8)
 * stokes the mould alone. `belts`: both of the mould's belts, or only the one into gun 0 or gun 1.
 */
function twoGuns(belts: "both" | "gun0" | "gun1" = "both"): Build {
  return {
    hero: "foundry",
    items: [item(2, "twinmould", 4, 6), item(3, "slagpot", 1, 6), item(4, "slagpot", 7, 6, 0, 2), item(70, "stoker", 4, 8, 1, 2)],
    routes: [
      { factory: 3, cells: [K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(2, 0)] },
      ...(belts !== "gun1" ? [{ factory: 2, cells: [K(4, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(3, 0)] }] : []),
      ...(belts !== "gun0" ? [{ factory: 2, cells: [K(5, 5), K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(6, 0)] }] : []),
      { factory: 4, cells: [K(7, 5), K(7, 4), K(7, 3), K(7, 2), K(7, 1), K(7, 0)] },
    ],
    mods: [], beltCap: 40, hullBonus: 0,
  };
}
const runOf = (b: Build): Run => { const r = newRun(b.hero, 5, "stoker-cap"); r.build = b; return r; };
/** 0.8.0 B1 M4 (oracle aa0494523ab57b7c): a capped line, found by its text. It takes the place of the opening sentence
 *  (the same kept ability block, drawn in the warning's amber: tests/b1.text.test.ts), so its role no longer marks it. */
// U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): "THE KILN'S GUN IS FULL: IT WORKS ..." (was ", SO IT WORKS ..."), the same meaning
const isCapLine = (x: { text: string }): boolean => /^THE .+'S GUN IS FULL: /.test(x.text);
const capLines = (b: Build): string[] => (rigPanel(runOf(b), 70)?.body ?? []).filter(isCapLine).map((x) => x.text);

describe("STOKER's capped stoke in its panel (VERIFIED-P1 H4)", () => {
  it("FURNACE's 6-tile Kiln: 1 star fits under the gun (no line); 2 and 3 stars are held to it: ONLY 25% FASTER", () => {
    // the Kiln stamps every 1.25 s into a gun that takes a load a second: at most 25% faster
    expect(stokeKeep(stoked(furnaceStart, 1)).size).toBe(0);
    expect(capLines(stoked(furnaceStart, 1))).toEqual([]);
    for (const [s, stoke] of [[2, 0.44], [3, 0.7]] as const) {
      const keep = stokeKeep(stoked(furnaceStart, s));
      expect(keep.get(1)! * stoke, `★${s}`).toBeCloseTo(0.25, 2);
      expect(capLines(stoked(furnaceStart, s)), `★${s}`).toEqual(["THE KILN'S GUN IS FULL: IT WORKS ONLY 25% FASTER."]);
    }
  });

  it("the battle plays what the panel says: the capped Kiln stamps about 25% faster than unstoked", () => {
    const gap = (b: Build): number => {
      const t: number[] = [];
      const bt = new Battle({ ...b, hullBonus: 3000 }, { ...heroStartBuild("weaver", 1), hullBonus: 3000 }, 1);
      while (bt.t < 20) {
        bt.step();
        for (const e of bt.drainEvents()) if (e.type === "produce" && e.side === 0 && e.factory === 1 && bt.t > 3) t.push(bt.t);
      }
      return (t[t.length - 1] - t[0]) / (t.length - 1);
    };
    const bare = gap(furnaceStart());
    for (const s of [2, 3]) expect(bare / gap(stoked(furnaceStart, s)) - 1, `★${s}`).toBeGreaterThan(0.2);
    for (const s of [2, 3]) expect(bare / gap(stoked(furnaceStart, s)) - 1, `★${s}`).toBeLessThan(0.3);
  });

  it("where the gun has room there is no line (the 8-tile Kiln, at every star); a full shared gun: NO FASTER", () => {
    for (const s of [1, 2, 3]) expect(capLines(stoked(longKiln, s)), `8-tile ★${s}`).toEqual([]);
    expect(capLines(stoked(lockjaw, 1, 1, 6))).toEqual(["THE KILN'S GUN IS FULL: IT WORKS NO FASTER."]);
    expect(capLines(stoked(lockjaw, 1, 8, 6))).toEqual(["THE TWIN MOULD'S GUN IS FULL: IT WORKS NO FASTER."]);
    expect(capLines(withMod(stoked(lockjaw, 1, 8, 6), 60, "calibrate", 0, 3))).toEqual([]); // CALIBRATION ★3 makes room
    // no STOKER, no line; a factory list without a capped one gives none
    expect(stokeKeep(furnaceStart()).size).toBe(0);
    expect(stokeCapBlocks(runOf(stoked(longKiln, 3)), [1])).toEqual([]);
  });

  it("a stoked factory feeding two guns keeps the strictest gun's cap, as the battle paces it (I1's mutant cap-keep-max)", () => {
    // each gun alone caps the mould's stoke (gun 1, the fuller, harder); together the mould keeps the smaller share, as
    // Battle.stokedPace paces a factory to its most constrained gun
    const keep = (b: Build) => stokeKeep(b).get(2);
    const [k0, k1, both] = [keep(twoGuns("gun0")), keep(twoGuns("gun1")), keep(twoGuns())];
    expect(stokeHits(twoGuns()).map((h) => h.factory)).toEqual([2]);
    expect(k0, "gun 0 alone").toBeLessThan(1);
    expect(k1, "gun 1 alone").toBeLessThan(k0! - 0.2);
    expect(k1, "gun 1 alone").toBeGreaterThan(0);
    expect(both, "both guns: the strictest").toBe(Math.min(k0!, k1!));
    // the battle stamps the mould at the stricter gun's pace: as with gun 1's belt alone, slower than with gun 0's alone,
    // and at the pace the kept share gives (1.8 s / (1 + 0.44 x keep)) to the tick
    const gap = (b: Build): number => {
      const t: number[] = [];
      const bt = new Battle({ ...b, hullBonus: 3000 }, { ...heroStartBuild("weaver", 101), hullBonus: 3000 }, 1);
      while (bt.t < 40) {
        bt.step();
        for (const e of bt.drainEvents()) if (e.type === "produce" && e.side === 0 && e.factory === 2 && bt.t > 5) t.push(bt.t);
      }
      return (t[t.length - 1] - t[0]) / (t.length - 1);
    };
    const [g0, g1, gBoth] = [gap(twoGuns("gun0")), gap(twoGuns("gun1")), gap(twoGuns())];
    expect(gBoth).toBeCloseTo(g1, 6);
    expect(gBoth - g0, "slower than the looser gun allows").toBeGreaterThan(0.1);
    expect(Math.abs(gBoth - 1.8 / (1 + 0.44 * both!)), "the estimate's pace").toBeLessThan(1 / 60);
    // the panel names the kept share
    expect(capLines(twoGuns())).toEqual([`THE TWIN MOULD'S GUN IS FULL: IT WORKS ONLY ${Math.round(44 * both!)}% FASTER.`]);
  });

  it("reading the cap never changes the rating (rateDeck's out is read only)", () => {
    for (const b of [stoked(furnaceStart, 2), stoked(lockjaw, 3, 8, 6), heroRefBuild("furnace", 6), heroRefBuild("bastion", 9)]) {
      const out: RateOut = { stokeKeep: new Map() };
      expect(rateDeck(b, RATING_CURVE, FIGHT_T, out)).toEqual(rateDeck(b));
    }
  });

  it("the line is one plain sentence in the 0.6.2 standard; the panel keeps its fit, and shows the line whole where it has room", () => {
    const tally = { desk: 0, phone: 0, cases: 0 };
    const cases: [string, Build][] = [];
    for (const s of [1, 2, 3]) {
      cases.push([`6-tile Kiln ★${s}`, stoked(furnaceStart, s)], [`shared gun, Kiln ★${s}`, stoked(lockjaw, s, 1, 6)], [`shared gun, mould ★${s}`, stoked(lockjaw, s, 8, 6)]);
    }
    for (const [id, b] of cases) for (const spare of [0, 1]) {
      const run = runOf(b);
      run.inventory = Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def: "stoker" }));
      const t = rigPanel(run, 70)!;
      const line = t.body.find(isCapLine);
      if (!line) continue;
      tally.cases++;
      expect(banned(line.text), line.text).toEqual([]);
      expect(line.text).toMatch(/^THE [A-Z ]+'S GUN IS FULL: IT WORKS (NO FASTER|ONLY \d+% FASTER)\.$/);
      for (const [band, area] of [["desk", DESK], ["phone", PHONE]] as const) {
        const p = planPanel(t, area);
        if (band === "desk") expect([p.body.fits, p.body.font], `${id} spare${spare} on the desk`).toEqual([true, "5"]);
        else expect(p.body.fits, `${id} spare${spare} on the phone`).toBe(true);
        const drawn = new Set(visibleLines(p).map((v) => v.line));
        for (const l of p.body.shown.filter((x) => x.b.keep || x.b.text === line.text)) expect(l.lines.every((x) => drawn.has(x)), `${id} ${band}: ${l.b.text}`).toBe(true);
        if (p.body.shown.some((l) => l.b.text === line.text)) tally[band]++;
      }
      // the plain FURNACE Kiln has room for it on the desk
      if (id.startsWith("6-tile")) expect(planPanel(t, DESK).body.shown.some((l) => l.b.text === line.text), `${id} spare${spare}`).toBe(true);
    }
    if (process.env.BB_TABLES) console.log(JSON.stringify(tally));
    expect(tally.cases).toBe(16); // 6-tile ★2-3 and the shared gun on either factory at ★1-3, each with 0 and 1 spare
    // I1: the desk column showed it in 15 of the 16 and the phone band in none (the line was optional). 0.8.0 B1 M4 (VERIFIED-I1
    // call 5, oracle aa0494523ab57b7c): it takes the place of the opening sentence, kept, so both show it in all 16
    // (tests/b1.text.test.ts pins that)
    expect(tally.desk).toBeGreaterThanOrEqual(15);
    void barge;
  });
});
