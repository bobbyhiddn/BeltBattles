// RETUNE-1 (REQ-BFG-097): GUARD (src/sim/guard.ts): PLATE ROLLER x3 (15 / 33 / 51 a payload) and WARD BELL twice as often
// (every 4 / 2.5 / 2 s; HULL-ON run 5 rounds ★2 to 3 s, so 4 / 3 / 2 s: cap's ruling 22e26ded338944ea Q6, ruling
// 19139b4c41a1636f), content values only, in ladderFix.ts's form. The values with the switch on and off; the setter
// puts back the exact defs; the card faces and the details text read the new numbers and still fit (REQ-BFG-070's card
// rules: the U2a fit check of tests/faceText.test.ts on the phone band and the op view), with HULL_SCALE's S(d) on day 10
// (the largest number a face shows). Each switch is set through its setter and put back off after each test.
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS, SHIELD_CAP } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { GUARD, GUARD_BELL_EVERY, GUARD_PLATE, guardRules, setGuard, withGuard } from "../src/sim/guard";
import { setHullScale } from "../src/sim/hullScale";
import { newRun, type Run } from "../src/game/run";
import { abilityText } from "../src/ui/abilityText";
import { faceLines } from "../src/ui/faces";
import { key as K, rotField } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { computeView } from "../src/core/io";
import { buildLayout, buildScale } from "../src/screens/build/layout";
import { tapPx } from "../src/ui/tap";
import { cargoPanel, fittedPanel, itemPanel, keptWhole, offerPanel, planPanel, type PanelText } from "../src/screens/build/inspector";

afterEach(() => {
  setGuard(true); // HULL-ON (the flip, GUARD): the shipped value (HULL-ON's flip; was false); a test that reads off sets it
  setHullScale(false);
});

const plate = (s: number) => effectAt("plateroller", s).gate!.plate;
const bell = (s: number) => effectAt("wardbell", s).mod!.shield!;

describe("RETUNE-1 GUARD: the values", () => {
  it("off by default: PLATE ROLLER 5 / 11 / 17, WARD BELL every 8 / 5 / 4 s (+1 SHIELD)", () => {
    // HULL-ON (the flip, GUARD): ships on (was toBe(false) twice: "off by default"), at the guarded numbers 15 / 33 / 51 and
    // 4 / 2.5 / 2 s; the off numbers below are read with the switch set off here (the afterEach puts the shipped value back).
    // HULL-ON run 5 (GUARD; ruling 22e26ded338944ea Q6): ★2 rounded 2.5 -> 3 s, so 4 / 3 / 2 s
    expect(GUARD).toBe(true);
    expect(guardRules()).toBe(true);
    expect([1, 2, 3].map(plate)).toEqual([15, 33, 51]);
    expect([1, 2, 3].map((s) => bell(s).every)).toEqual([4, 3, 2]);
    setGuard(false);
    expect(guardRules()).toBe(false);
    expect([1, 2, 3].map(plate)).toEqual([5, 11, 17]);
    expect([1, 2, 3].map((s) => bell(s).every)).toEqual([8, 5, 4]);
    expect([1, 2, 3].map((s) => bell(s).amount)).toEqual([1, 1, 1]);
    expect(SHIELD_CAP).toBe(3);
  });

  it("on: PLATE ROLLER 15 / 33 / 51 (x3), WARD BELL every 4 / 3 / 2 s (twice as often, ★2 rounded), still +1 SHIELD; SHIELD_CAP 3", () => {
    // HULL-ON (the flip, GUARD): runs from the switch set off, as it ran from the default before the flip (withGuard turns it
    // on for the call and puts it back off: 5 / 11 / 17 after it); the afterEach puts the shipped value back.
    // HULL-ON run 5 (GUARD; cap's ruling 22e26ded338944ea Q6, ruling 19139b4c41a1636f): the bell's [4, 2.5, 2] -> [4, 3, 2]
    // (REQ-BFG-047: every printed number whole; 3 is the only whole second between 4 and 2); the title read "4 / 2.5 / 2 s"
    setGuard(false);
    withGuard(() => {
      expect(guardRules()).toBe(true);
      expect([1, 2, 3].map(plate)).toEqual([15, 33, 51]);
      expect([GUARD_PLATE[1], GUARD_PLATE[2], GUARD_PLATE[3]]).toEqual([15, 33, 51]);
      expect([1, 2, 3].map((s) => bell(s).every)).toEqual([4, 3, 2]);
      expect([GUARD_BELL_EVERY[1], GUARD_BELL_EVERY[2], GUARD_BELL_EVERY[3]]).toEqual([4, 3, 2]);
      expect([1, 2, 3].map((s) => bell(s).amount)).toEqual([1, 1, 1]);
      expect(SHIELD_CAP).toBe(3);
      // everything else on the two defs is as before
      const { gate: _g, levels: _l, ...rest } = ITEMS.plateroller;
      expect(rest.price).toBe(3);
      expect(ITEMS.wardbell.price).toBe(5);
    });
    expect([1, 2, 3].map(plate)).toEqual([5, 11, 17]);
  });

  it("the setter puts back the exact defs (the very objects), the catalogue's order and listing unchanged", () => {
    setGuard(false); // HULL-ON (the flip, GUARD): from the base defs, the switch set off (it read the default, which ships on)
    const pr = ITEMS.plateroller, wb = ITEMS.wardbell;
    const json = JSON.stringify([pr, wb]);
    const keys = Object.keys(ITEMS).join();
    setGuard(true);
    expect(ITEMS.plateroller).not.toBe(pr);
    expect(Object.keys(ITEMS).join()).toBe(keys);
    setGuard(true); // setting the state it has does nothing
    setGuard(false);
    expect(ITEMS.plateroller).toBe(pr);
    expect(ITEMS.wardbell).toBe(wb);
    expect(JSON.stringify([pr, wb])).toBe(json); // the base defs were never mutated
    expect(Object.keys(ITEMS).join()).toBe(keys);
    expect(() => withGuard(() => { throw new Error("x"); })).toThrow("x");
    expect(guardRules()).toBe(false);
    expect(ITEMS.plateroller).toBe(pr);
  });
});

/** A Furnace with the Kiln's belt and rig `def` on it (tests/faceText.test.ts rigRun's layout), on day `day`. */
const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const SIDE = [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)];
function rigRun(def: string, stars: number, day: number): Run {
  const run = newRun("furnace", 5, "rt1");
  run.day = day;
  run.inventory = [];
  run.build = {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }, { uid: 10, def, x: 3, y: 3, ...rotField(def, rotFacing(def, 1)), ...(stars > 1 ? { stars } : {}) }],
    routes: [{ factory: 1, cells: [...SHORT] }, { factory: 7, cells: [...SIDE] }],
  };
  return run;
}
const PHONE = buildLayout(167, 394, true, 5).info;
const OP = buildLayout(241, 414, true, 5, true).info;
const OP_TAP = tapPx(computeView(402, 690, 3, buildScale));

function panels(day: number): { id: string; t: PanelText }[] {
  const out: { id: string; t: PanelText }[] = [];
  for (const s of [1, 2, 3]) {
    for (const def of ["plateroller", "wardbell"]) {
      const run = newRun("furnace", 5, "rt1");
      run.day = day;
      run.inventory = [{ uid: 900, def, ...(s > 1 ? { stars: s } : {}) }];
      out.push({ id: `cargo ${def} ★${s}`, t: cargoPanel(run, 900, true)! });
      const offer = newRun("furnace", 5, "rt1");
      offer.day = day;
      offer.gold = 99;
      offer.shop.wagons = [{ merchant: ITEMS[def].merchant!, offers: [{ def, price: ITEMS[def].price, sold: false }] }] as Run["shop"]["wagons"];
      if (s === 1) out.push({ id: `offer ${def}`, t: offerPanel(offer, 0, 0, true)! });
    }
    const gear = newRun("furnace", 5, "rt1");
    gear.day = day;
    gear.build.mods.push({ uid: 902, def: "wardbell", turret: 0, ...(s > 1 ? { stars: s } : {}) } as Run["build"]["mods"][number]);
    out.push({ id: `fitted wardbell ★${s}`, t: fittedPanel(gear, 902)! });
    out.push({ id: `placed plateroller ★${s}`, t: itemPanel(rigRun("plateroller", s, day), 10, true)! });
  }
  return out;
}

describe("RETUNE-1 GUARD: the faces and the details text read the new numbers, and fit", () => {
  it("the details text and the face lines read 15 / 33 / 51 and 4 / 3 / 2 s with GUARD on", () => {
    setGuard(false); // HULL-ON (the flip, GUARD): the off text ("17") after withGuard's call, the switch set off (was the default)
    withGuard(() => {
      expect(abilityText("plateroller", 3).sentences.join(" ")).toContain("51");
      expect(abilityText("plateroller", 1).sentences.join(" ")).toContain("15");
      const bellLines = JSON.stringify(faceLines("wardbell", 2));
      // HULL-ON run 5 (GUARD; cap's ruling 22e26ded338944ea Q6, ruling 19139b4c41a1636f): ★2 rings every 3 s, printed whole
      // (was toContain("2.5"); the title read "4 / 2.5 / 2 s")
      expect(bellLines).toContain("EVERY 3");
      expect(bellLines).not.toContain("2.5");
      expect(JSON.stringify(faceLines("wardbell", 3))).toContain("EVERY 2");
    });
    expect(abilityText("plateroller", 3).sentences.join(" ")).toContain("17");
  });

  it("every panel of both pieces fits the phone band and the op view whole, GUARD on, HULL_SCALE on and off, days 1 and 10", () => {
    const misses: string[] = [];
    for (const hs of [false, true]) {
      setHullScale(hs);
      for (const day of [1, 10]) {
        withGuard(() => {
          for (const { id, t } of panels(day)) {
            for (const [band, area] of [["phone", PHONE], ["op", OP]] as const) {
              const o = band === "op" ? { tap: OP_TAP, band: true } : {};
              let plan = planPanel(t, area, [], o);
              if (!(plan.body.fits && keptWhole(plan)) && t.labels.includes("TO CARGO")) plan = planPanel({ ...t, labels: t.labels.filter((l) => l !== "TO CARGO") }, area, [], o);
              if (!(plan.body.fits && keptWhole(plan))) misses.push(`${hs ? "HS" : "off"} d${day} ${band} ${id}`);
            }
          }
        });
      }
    }
    expect(misses).toEqual([]);
  }, 120_000);
});
