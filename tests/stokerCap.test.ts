// 0.8.0 I1 M4 (VERIFIED-P1 H4; REQ-BFG-032): a STOKER's inspect panel says when its stoke is capped by its gun, from the
// same static estimate the par player rates with (deckRating.ts rateDeck's STOKER cap, read through stokeKeep), in the
// 0.6.2 text standard, fitting the phone band and the desk column; the rating itself is unchanged.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { FIGHT_T, RATING_CURVE, rateDeck, stokeKeep, type RateOut } from "../src/sim/deckRating";
import { type Build } from "../src/sim/deck";
import { heroStartBuild, heroRefBuild } from "../src/sim/heroBuilds";
import { newRun, type Run } from "../src/game/run";
import { planPanel, rigPanel, stokeCapBlocks, visibleLines } from "../src/screens/build/inspector";
import { buildLayout } from "../src/screens/build/layout";
import { K, barge, item, withItem, withMod } from "./wave3.helpers";
import { banned } from "./textRules";

const PHONE = buildLayout(167, 361, true, 5).info;
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
const runOf = (b: Build): Run => { const r = newRun(b.hero, 5, "stoker-cap"); r.build = b; return r; };
const capLines = (b: Build): string[] => (rigPanel(runOf(b), 70)?.body ?? []).filter((x) => x.role === "warn").map((x) => x.text);

describe("STOKER's capped stoke in its panel (VERIFIED-P1 H4)", () => {
  it("FURNACE's 6-tile Kiln: 1 star fits under the gun (no line); 2 and 3 stars are held to it: ONLY 25% FASTER", () => {
    // the Kiln stamps every 1.25 s into a gun that takes a load a second: at most 25% faster
    expect(stokeKeep(stoked(furnaceStart, 1)).size).toBe(0);
    expect(capLines(stoked(furnaceStart, 1))).toEqual([]);
    for (const [s, stoke] of [[2, 0.44], [3, 0.7]] as const) {
      const keep = stokeKeep(stoked(furnaceStart, s));
      expect(keep.get(1)! * stoke, `★${s}`).toBeCloseTo(0.25, 2);
      expect(capLines(stoked(furnaceStart, s)), `★${s}`).toEqual(["THE KILN'S GUN IS FULL, SO IT WORKS ONLY 25% FASTER."]);
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
    expect(capLines(stoked(lockjaw, 1, 1, 6))).toEqual(["THE KILN'S GUN IS FULL, SO IT WORKS NO FASTER."]);
    expect(capLines(stoked(lockjaw, 1, 8, 6))).toEqual(["THE TWIN MOULD'S GUN IS FULL, SO IT WORKS NO FASTER."]);
    expect(capLines(withMod(stoked(lockjaw, 1, 8, 6), 60, "calibrate", 0, 3))).toEqual([]); // CALIBRATION ★3 makes room
    // no STOKER, no line; a factory list without a capped one gives none
    expect(stokeKeep(furnaceStart()).size).toBe(0);
    expect(stokeCapBlocks(runOf(stoked(longKiln, 3)), [1])).toEqual([]);
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
      const line = t.body.find((x) => x.role === "warn");
      if (!line) continue;
      tally.cases++;
      expect(banned(line.text), line.text).toEqual([]);
      expect(line.text).toMatch(/^THE [A-Z ]+'S GUN IS FULL, SO IT WORKS (NO FASTER|ONLY \d+% FASTER)\.$/);
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
    // the desk column shows it in 15 of the 16 (the shared gun's TWIN MOULD at ★2 with a spare copy has no room left);
    // the phone band never has room after the rig panel's kept blocks (I1 REPORT: the line stays optional there)
    expect(tally.desk).toBeGreaterThanOrEqual(15);
    void barge;
  });
});
