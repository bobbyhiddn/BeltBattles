// JOINS-1 (REQ-BFG-091), test 3: the rules gate keeps RULE JOIN LIMIT and RULE JOIN PACE for records under older rules.
// FREE_JOINS_RULES reads RULES_VERSION until the rules bump that turns FREE_JOINS on writes its own version there as a
// literal (rulesGate.ts). This file plays that bump: content.ts's RULES_VERSION is mocked one patch on (bb-0.9.8), so
// FREE_JOINS_RULES is bb-0.9.8 and a bb-0.9.7 record is an OLDER record: with the switch on, its deck past 2 joins is still
// refused (validateUpload checks it under its own rules), its joined factories still run at JOIN_PACE, and its battle
// record is refused outright by the exact rules check (replay.ts). A bb-0.9.8 upload takes the same deck.
// HULL-ON (the flip, FREE_JOINS): the bump came at bb-0.10.0, and the flip wrote FREE_JOINS_RULES as that literal
// (rulesGate.ts), so the mocked RULES_VERSION (bb-0.9.8, kept) no longer moves it: the new rules below are bb-0.10.0, and
// bb-0.9.7 is still an older record. The switch ships on
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/sim/content", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/sim/content")>();
  return { ...real, RULES_VERSION: "bb-0.9.8" };
});

import { JOIN_PACE, RULES_VERSION } from "../src/sim/content";
import { setFreeJoins, withFreeJoins } from "../src/sim/freeJoins";
import { FREE_JOINS_RULES, freeJoinsFor } from "../src/net/rulesGate";
import { JOIN_OVER_LIMIT, factoryPace, key as K, type Build, type RouteDef } from "../src/sim/deck";
import { validateUpload } from "../src/net/validate";
import { RulesMismatchError, replay } from "../src/net/replay";
import { Battle } from "../src/sim/battle";
import { withDawnRunes } from "./runeFill";

afterEach(() => setFreeJoins(true)); // the shipped value (HULL-ON's flip)

// tests/net-upload.joinlimit.test.ts's FURNACE deck: M = the KILN's belt; R1..R3 join M at (4,4), (4,3) and (4,2)
const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const R1: RouteDef = { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(3, 4)], join: K(4, 4) };
const R2: RouteDef = { factory: 3, cells: [K(7, 5), K(7, 4), K(7, 3), K(6, 3), K(5, 3)], join: K(4, 3) };
const R3: RouteDef = { factory: 4, cells: [K(2, 2), K(3, 2)], join: K(4, 2) };
const DAY = 5;
function deck(routes: RouteDef[]): Build {
  return withDawnRunes({
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
    items: [
      { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }, { uid: 3, def: "doublestamp", x: 7, y: 6 },
      { uid: 4, def: "shottower", x: 0, y: 2 },
    ],
    routes: [{ factory: 1, cells: [...M] }, ...routes.map((r) => ({ ...r, cells: [...r.cells] }))],
  }, DAY);
}
const FOE: Build = { hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 6 }], routes: [], mods: [], beltCap: 24, hullBonus: 100000 };
const third = `route: route 3 can't join cell ${K(4, 2)}: ${JOIN_OVER_LIMIT}`;

describe("JOINS-1 (3): after the bump, a bb-0.9.7 record keeps both join rules", () => {
  it("the bump's rules: FREE_JOINS_RULES is the new version; bb-0.9.7 predates it", () => {
    expect(RULES_VERSION).toBe("bb-0.9.8");
    // HULL-ON (the flip, FREE_JOINS): "bb-0.9.8" -> "bb-0.10.0", the literal the flip wrote (it read RULES_VERSION until then)
    expect(FREE_JOINS_RULES).toBe("bb-0.10.0");
    withFreeJoins(() => {
      expect(freeJoinsFor("bb-0.10.0")).toBe(true);
      expect(freeJoinsFor("bb-0.9.7")).toBe(false);
    });
  });

  it("a bb-0.9.7 upload with 3 joins is still refused with the switch on; under bb-0.9.8 it passes", () => {
    const b = deck([R1, R2, R3]);
    setFreeJoins(true);
    const old = validateUpload(b, DAY, "bb-0.9.7");
    expect(old.ok).toBe(false);
    expect(old.errors.filter((e) => e.includes(JOIN_OVER_LIMIT))).toEqual([third]);
    expect(validateUpload(b, DAY, "bb-0.10.0")).toEqual({ ok: true, errors: [] }); // HULL-ON (FREE_JOINS): the literal (was bb-0.9.8)
    // the check ran the old record under its own rules and put the switch back
    expect(withFreeJoins(() => factoryPace(b, 2))).toBe(1);
  });

  it("a bb-0.9.7 battle record is refused outright (the exact rules check), the switch on or off", () => {
    const rec = { rules: "bb-0.9.7", seed: 7, builds: [deck([R1, R2, R3]), FOE] as [Build, Build] };
    setFreeJoins(false); // HULL-ON (the flip, FREE_JOINS): the off check sets the switch off itself (it ships on)
    expect(() => replay(rec)).toThrow(RulesMismatchError);
    setFreeJoins(true);
    expect(() => replay(rec)).toThrow(RulesMismatchError);
    // its rules' answer is the old rules: under it the joined factories run at JOIN_PACE of the deck's pace (its dawn
    // runes' 1.05 here) and only two joins hold; under the new rules' answer, all three and no pace
    const side = (on: boolean) => withFreeJoins(() => new Battle(rec.builds[0], FOE, 7).sides[0], on);
    const s = side(freeJoinsFor(rec.rules));
    const base = s.factories[0].pace;
    expect(s.factories.map((f) => Math.round((100 * f.pace) / base))).toEqual([100, 100 * JOIN_PACE, 100 * JOIN_PACE, 100]);
    expect(s.routes.filter((r) => r.join).length).toBe(2);
    const n = side(freeJoinsFor("bb-0.10.0")); // HULL-ON (FREE_JOINS): the literal (was bb-0.9.8)
    expect(n.factories.map((f) => f.pace)).toEqual([base, base, base, base]);
    expect(n.routes.filter((r) => r.join).length).toBe(3);
  });
});
