// RETUNE-1 run 2 (REQ-BFG-097; BRIEF-RETUNE1-R2 section 2, plate balancing): GUARD's common PLATE runes (src/sim/guard.ts
// GUARD_RUNES): RIVET HOARD startPlate 60 -> 180, LAST WALL halfPlate 80 -> 140, SEAM RIVETS pairPlate 10 -> 30, with the
// switch on. The values on and off; the switch puts back the exact amount objects on the very defs (the catalogue, the
// battle's runeMods and the cards read one number); the rune text reads the new numbers, and the cards still fit the op
// view and the desk (the read-out and the dawn picker, each card opened in turn), HULL_SCALE on and off, days 1 and 10.
import { afterEach, describe, expect, it } from "vitest";
import { GUARD_RUNES, guardRules, setGuard, withGuard } from "../src/sim/guard";
import { RUNE_LIST, RUNES, runeMods } from "../src/sim/runes";
import { setHullScale } from "../src/sim/hullScale";
import { runeLine } from "../src/ui/runeText";
import { readoutW, runeCardH, runeRowH } from "../src/ui/runeBar";
import { pickLayout } from "../src/screens/runePicker";
import { buildScale, phoneScreen } from "../src/screens/build/layout";

afterEach(() => {
  setGuard(true); // HULL-ON (the flip, GUARD): the shipped value (HULL-ON's flip; was false); a test that reads off sets it
  setHullScale(false);
});

const IDS = ["rivet_hoard", "last_wall", "seam_rivets"] as const;
const n = (id: string) => RUNES[id].amount.n;

/** A view as computeView frames the build screen (tests/runes.ui.test.ts view). */
function view(w: number, h: number, dpr: number) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const scale = buildScale(pw, ph, portrait, dpr);
  return { W: Math.floor(pw / scale), H: Math.floor(ph / scale), scale, dpr, portrait, phone: phoneScreen(pw, ph, dpr) };
}
const OP = view(402, 690, 3);
const DESK = view(1280, 800, 1);

describe("RETUNE-1 GUARD: the common PLATE runes", () => {
  it("off: 60 / 80 / 10; on: 180 / 140 / 30, through the battle's runeMods and the catalogue's own defs", () => {
    // HULL-ON (the flip, GUARD): ships on (was toBe(false): the default was off), at the guarded 180 / 140 / 30; the rest runs
    // from the switch set off here, as it ran from the default before the flip (the afterEach puts the shipped value back)
    expect(guardRules()).toBe(true);
    expect(IDS.map(n)).toEqual([180, 140, 30]);
    setGuard(false);
    expect(IDS.map(n)).toEqual([60, 80, 10]);
    expect(GUARD_RUNES).toEqual({ rivet_hoard: 180, last_wall: 140, seam_rivets: 30 });
    withGuard(() => {
      expect(IDS.map(n)).toEqual([180, 140, 30]);
      const m = runeMods(IDS.map((id) => ({ id })))!;
      expect([m.startPlate, m.halfPlate, m.pairPlate]).toEqual([180, 140, 30]);
      for (const id of IDS) expect(RUNE_LIST.find((d) => d.id === id)!.amount.n).toBe(GUARD_RUNES[id]);
      // every other rune as before (GRAVE PLATES, FORGE WARD, SCAB IRON, BULWARK OATH...)
      expect([n("grave_plates"), n("forge_ward"), n("scab_iron"), n("bulwark_oath")]).toEqual([240, 10, 10, 3]);
    });
    expect(IDS.map(n)).toEqual([60, 80, 10]);
    const m = runeMods(IDS.map((id) => ({ id })))!;
    expect([m.startPlate, m.halfPlate, m.pairPlate]).toEqual([60, 80, 10]);
  });

  it("the switch puts back the exact amount objects on the very defs; units and texts unchanged", () => {
    setGuard(false); // HULL-ON (the flip, GUARD): from the base amounts, the switch set off (it read the default, which ships on)
    const defs = IDS.map((id) => RUNES[id]), amounts = defs.map((d) => d.amount);
    const json = JSON.stringify(defs);
    setGuard(true);
    IDS.forEach((id, i) => {
      expect(RUNES[id]).toBe(defs[i]); // the same def: only its amount object is swapped
      expect(RUNES[id].amount).not.toBe(amounts[i]);
      expect(RUNES[id].amount.unit).toBe(amounts[i].unit);
    });
    setGuard(true);
    setGuard(false);
    IDS.forEach((id, i) => expect(RUNES[id].amount).toBe(amounts[i]));
    expect(JSON.stringify(defs)).toBe(json);
    expect(() => withGuard(() => { throw new Error("x"); })).toThrow("x");
    IDS.forEach((id, i) => expect(RUNES[id].amount).toBe(amounts[i]));
  });

  it("the rune text reads the new numbers (x S(d) with HULL_SCALE), and nothing else in the line moves", () => {
    setGuard(false); // HULL-ON (the flip, GUARD): the off lines with the switch set off (they read the default, which ships on)
    const off = IDS.map((id) => runeLine(RUNES[id]));
    withGuard(() => {
      IDS.forEach((id, i) => {
        expect(runeLine(RUNES[id])).toContain(String(GUARD_RUNES[id]));
        expect(runeLine(RUNES[id]).replace(/\d+/g, "#")).toBe(off[i].replace(/\d+/g, "#"));
      });
      setHullScale(true);
      for (const id of IDS) expect(runeLine(RUNES[id], 10)).toMatch(/\d/);
    });
    expect(IDS.map((id) => runeLine(RUNES[id]))).toEqual(off);
  });

  it("the cards fit: the read-out under a bar of 10 on the op view, and the dawn picker on the op view and the desk", () => {
    const misses: string[] = [];
    for (const hs of [false, true]) {
      setHullScale(hs);
      withGuard(() => {
        for (const day of [1, 10]) {
          const w = readoutW(OP.W), top = 14 + runeRowH(OP, 10) + 2;
          for (const id of [...IDS, "grave_plates"]) if (top + runeCardH(RUNES[id], w, { reminder: true, day }) > OP.H) misses.push(`${hs ? "HS" : "off"} d${day} read-out ${id}`);
          for (const v of [OP, DESK]) {
            for (let open = -1; open < IDS.length; open++) {
              const L = pickLayout(v.W, v.H, IDS, open, 9, undefined, day);
              if (L.bottom > v.H) misses.push(`${hs ? "HS" : "off"} d${day} picker ${v.W}x${v.H} open ${open}`);
            }
          }
        }
      });
    }
    expect(misses).toEqual([]);
  });
});
