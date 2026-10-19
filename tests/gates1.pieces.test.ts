// GATES-1 (REQ-BFG-052, REQ-BFG-057; BRIEF-GATES1 G1; step 2): the three gates (FUSER, SCATTER MILL, SMELTER), the kind
// "converter" and the GATES switch.
// - the switch: GATES ships OFF; off, nothing sees the three; on, they join ITEMS after every other def; withGates puts it back;
// - the defs: kind "converter" (not a rig), rarity, price, merchant, 1x1, the brief's numbers at every star, no arrows;
// - the pools with the switch on and off (catalogue, merchants, LAST CHANCE's parts stay without them);
// - merge and sell: a converter merges like any module and sells at sellValue;
// - the gate-cell exception (deck.ts converterCellOk, split.ts splitProblem): a belt runs through a converter's tile and is
//   still ONE route; beltCap and the journey see the whole belt; the first and last tile, a tile next to another gate and a
//   tile off a belt are refused; migrateInlineGates never moves a converter;
// - the rules gate (GATES_RULES, gatesGateProblem, gatesWorld, inGatesWorld) and the validator's verdicts in both switch states.
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS, MERCHANTS, RULES_VERSION, buyableModules, itemsSoldBy, rigShape, sellValue, type MerchantId } from "../src/sim/content";
import { canPlaceItem, converterCellOk, isRig, journeyTiles, key as K, occupancy, removeItem, routeWellFormed, type Build } from "../src/sim/deck";
import { migrateInlineGates } from "../src/sim/beltside";
import { GATES, GATES_DEFS, GATES_IDS, gatesRules, isGatesPiece, setGates, withGates } from "../src/sim/gates";
import { SPLIT_NO_BELT, SPLIT_OFF_BELT, splitProblem } from "../src/sim/split";
import { effectAt, fusible, valueOf } from "../src/sim/stars";
import { lastChanceParts } from "../src/sim/lastChance";
import { GATES_RULES, SHAPES2_RULES, gatesFeatures, gatesGateProblem, gatesWorld } from "../src/net/rulesGate";
import { inGatesWorld, validateBuild, validateUpload } from "../src/net/validate";
import { routeProblems } from "../src/game/routeCheck";
import { shapes2Rules } from "../src/sim/shapes2";

afterEach(() => setGates(GATES)); // the shipped value (off); a test that needs it on sets it itself (withGates)

const THREE = ["fuser", "scattermill", "smelter"];
const ids = (l: { id: string }[]) => l.map((d) => d.id);
const has = (id: string) => Object.prototype.hasOwnProperty.call(ITEMS, id);

/** The FURNACE bench: the KILN at (4,6) and a straight 6-tile belt up column 4 into the turret; a converter [def, tile] on it. */
function deck(conv: [string, number][] = [], extra: Build["items"] = []): Build {
  const cells = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
  return {
    hero: "furnace",
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...conv.map(([def, t], i) => ({ uid: 20 + i, def, x: 4, y: 5 - t })), ...extra],
    routes: [{ factory: 1, cells }], mods: [], beltCap: 14, hullBonus: 0,
  };
}

describe("GATES-1 G1: the switch", () => {
  it("ships OFF: nothing sees the three; the ids are the brief's, in order; the predicate does not read the switch", () => {
    expect(GATES).toBe(false);
    expect(gatesRules()).toBe(false);
    expect(GATES_IDS).toEqual(THREE);
    for (const id of THREE) {
      expect(has(id), id).toBe(false);
      expect(isGatesPiece(id), id).toBe(true);
    }
    expect(ids(buyableModules())).not.toContain("fuser");
    expect(isGatesPiece("splitter")).toBe(false);
    expect(isGatesPiece("scatter")).toBe(false); // SCATTER CHOKE is a core; the gate is SCATTER MILL (scattermill)
  });

  it("on: the three join ITEMS after every other def; off again: ITEMS as before; withGates puts the switch back even on a throw", () => {
    const keys0 = Object.keys(ITEMS);
    withGates(() => {
      expect(gatesRules()).toBe(true);
      expect(Object.keys(ITEMS)).toEqual([...keys0, ...THREE]);
      for (const id of THREE) expect(ITEMS[id], id).toBe(GATES_DEFS[id]);
      withGates(() => {
        expect(gatesRules()).toBe(false);
        expect(Object.keys(ITEMS)).toEqual(keys0);
      }, false);
      expect(Object.keys(ITEMS)).toEqual([...keys0, ...THREE]);
    });
    expect(gatesRules()).toBe(false);
    expect(Object.keys(ITEMS)).toEqual(keys0);
    expect(() => withGates(() => { throw new Error("x"); })).toThrow("x");
    expect(gatesRules()).toBe(false);
    expect(Object.keys(ITEMS)).toEqual(keys0);
    setGates(false); // the state it has: nothing happens
    expect(Object.keys(ITEMS)).toEqual(keys0);
  });

  it("the star cache is cleared at each swap: a converter's stars read the right numbers after an off-and-on", () => {
    withGates(() => expect(effectAt("fuser", 3).converter?.bonus).toBe(150));
    withGates(() => expect(effectAt("fuser", 3).converter?.bonus).toBe(150));
    expect(() => effectAt("fuser", 1)).toThrow("unknown item fuser");
  });
});

describe("GATES-1 G1: the defs", () => {
  const on = <T,>(fn: () => T): T => withGates(fn);

  it("kind \"converter\", the family GATE: rarity, price, merchant, 1x1, no arrows (not a rig), no foot or shape", () => {
    on(() => {
      const row = (id: string) => { const d = ITEMS[id]; return [d.name, d.kind, d.rarity, d.price, d.merchant, d.size]; };
      expect(row("fuser")).toEqual(["FUSER", "converter", "rare", 6, "tinker", 1]);
      expect(row("scattermill")).toEqual(["SCATTER MILL", "converter", "common", 4, "tinker", 1]); // G5 lever (a): the TINKER's
      expect(row("smelter")).toEqual(["SMELTER", "converter", "rare", 5, "alchemist", 1]);
      for (const id of THREE) {
        const d = ITEMS[id];
        expect(d.foot, id).toBeUndefined();
        expect(d.shape, id).toBeUndefined();
        expect(d.gate, id).toBeUndefined();
        expect(rigShape(id), id).toBeUndefined();
        expect(isRig(id), id).toBe(false);
        expect(d.tags?.length, id).toBeGreaterThanOrEqual(1);
        expect(d.converter!.secs, id).toBe(1); // 1 whole second a conversion
        expect(Number.isInteger(d.converter!.secs), id).toBe(true);
      }
    });
  });

  it("the numbers at ★1 / ★2 / ★3 (the brief's starting values): FUSER +50 / 75 / 150 % (★3 raised from +100 by the day-10 read); SCATTER MILL 3 at 50 / 3 at 60 / 4 at 50 %; SMELTER +2 / 5 / 8 BURN (★1 cut from +3 by the presence guard)", () => {
    on(() => {
      const at = (id: string, s: number) => effectAt(id, s).converter!;
      expect([1, 2, 3].map((s) => [at("fuser", s).in, at("fuser", s).out, at("fuser", s).bonus])).toEqual([[2, 1, 50], [2, 1, 75], [2, 1, 150]]);
      expect([1, 2, 3].map((s) => [at("scattermill", s).in, at("scattermill", s).out, at("scattermill", s).share])).toEqual([[1, 3, 50], [1, 3, 60], [1, 4, 50]]);
      expect([1, 2, 3].map((s) => [at("smelter", s).in, at("smelter", s).out, at("smelter", s).burn])).toEqual([[1, 1, 2], [1, 1, 5], [1, 1, 8]]);
      expect(["fuser", "scattermill", "smelter"].map((id) => at(id, 1).how)).toEqual(["fuse", "pellet", "smelt"]);
      // R2's rule: every gate gives at least +50% of a slug in its best use (the bench, run 3, measures it; the numbers here are the floor)
      expect(at("fuser", 1).bonus).toBeGreaterThanOrEqual(50);
    });
  });

  it("every gate has a seller who exists, and an id that is new (no other def has it)", () => {
    const before = new Set(Object.keys(ITEMS));
    on(() => {
      for (const id of THREE) {
        expect(before.has(id), id).toBe(false);
        expect(Object.keys(MERCHANTS), id).toContain(ITEMS[id].merchant);
      }
    });
  });
});

describe("GATES-1 G1: the pools with the switch on and off", () => {
  it("the catalogue and the merchants: the three are sold on, none off; the rest is untouched", () => {
    const off = ids(buyableModules());
    const sold = (m: MerchantId): string[] => ids(itemsSoldBy(m));
    const offSold = { tinker: sold("tinker"), scrapper: sold("scrapper"), alchemist: sold("alchemist") };
    withGates(() => {
      const on = ids(buyableModules());
      expect(on.length).toBe(off.length + 3);
      expect(on.filter((id) => !THREE.includes(id))).toEqual(off); // every other piece, in the order it had
      expect(sold("tinker")).toEqual([...offSold.tinker, "fuser", "scattermill"]); // G5 lever (a): the SCATTER MILL is the TINKER's
      expect(sold("scrapper")).toEqual(offSold.scrapper);
      expect(sold("alchemist")).toEqual([...offSold.alchemist, "smelter"]);
    });
    expect(ids(buyableModules())).toEqual(off);
  });

  it("LAST CHANCE's parts do not take the gates (out of scope of GATES-1)", () => {
    const off = ids(lastChanceParts());
    withGates(() => expect(ids(lastChanceParts())).toEqual(off));
  });
});

describe("GATES-1 G1: merge and sell", () => {
  it("they merge like any module (fusible) and sell at sellValue: price x 2^(stars-1) / 2", () => {
    expect(fusible("fuser")).toBe(false); // off: not a def at all
    withGates(() => {
      for (const id of THREE) expect(fusible(id), id).toBe(true);
      expect([1, 2, 3].map((s) => sellValue("fuser", s))).toEqual([3, 6, 12]);
      expect([1, 2, 3].map((s) => sellValue("scattermill", s))).toEqual([2, 4, 8]);
      expect([1, 2, 3].map((s) => sellValue("smelter", s))).toEqual([2, 5, 10]);
      expect([1, 2, 3].map((s) => valueOf("fuser", s))).toEqual([6, 12, 24]);
    });
  });

  it("an unfused pair is a validator error, as for any module; a ★2 is worth its two copies", () => {
    withGates(() => {
      const two = deck([["smelter", 2], ["smelter", 4]]);
      const v = validateBuild(two, 3, "strict");
      expect(v.errors).toContain("item: UNFUSED PAIR: SMELTER ★1 x2");
      const merged = deck([["smelter", 2]]);
      merged.items[1].stars = 2;
      expect(validateBuild(merged, 3, "strict")).toEqual({ ok: true, errors: [] });
    });
  });
});

describe("GATES-1 G1: the gate-cell exception, and splitProblem", () => {
  it("a belt runs through a converter's tile and stays ONE route: well formed, beltCap and the journey see the whole belt", () => {
    withGates(() => {
      const b = deck([["fuser", 2]]);
      expect(b.routes.length).toBe(1);
      expect(routeWellFormed(b, b.routes[0])).toBe(true);
      expect(journeyTiles(b, 0)).toBe(6);
      expect(b.routes[0].cells.length).toBe(6);
      expect(routeProblems(b)).toEqual([]);
      const occ = occupancy(b);
      expect(occ[K(4, 3)].item).toBe(20);
      expect(occ[K(4, 3)].route).toBe(0);
      expect(converterCellOk(b, b.routes[0], 2, occ)).toBe(true);
      expect(converterCellOk(b, b.routes[0], 1, occ)).toBe(false); // no converter on tile 1
      // removing it makes the belt whole again with no merge code
      expect(removeItem(b, 20)).toBe(0);
      expect(b.routes[0].cells.length).toBe(6);
      expect(routeWellFormed(b, b.routes[0])).toBe(true);
    });
  });

  it("the refusals: off a belt, a route's first and last tile, right next to another gate (short reasons)", () => {
    withGates(() => {
      const b = deck();
      expect(splitProblem(b, "fuser", K(1, 1))).toBe(SPLIT_OFF_BELT);
      expect(splitProblem(b, "fuser", K(4, 5))).toBe(SPLIT_NO_BELT); // the first tile, next to the KILN
      expect(splitProblem(b, "fuser", K(4, 0))).toBe(SPLIT_NO_BELT); // the last tile, the turret's intake
      for (const t of [1, 2, 3, 4]) expect(splitProblem(b, "fuser", K(4, 5 - t)), `tile ${t}`).toBeNull();
      expect(SPLIT_OFF_BELT).toBe("DROP IT ON A BELT");
      expect(SPLIT_NO_BELT).toBe("NEEDS BELT ON BOTH SIDES");
      // next to another gate on the same belt
      const c = deck([["smelter", 2]]);
      expect(splitProblem(c, "fuser", K(4, 4))).toBe(SPLIT_NO_BELT);
      expect(splitProblem(c, "fuser", K(4, 2))).toBe(SPLIT_NO_BELT);
      expect(splitProblem(c, "fuser", K(4, 1))).toBeNull(); // one tile between
      expect(splitProblem(c, "fuser", K(4, 3))).toBe("OCCUPIED"); // its own cell
      expect(splitProblem(c, "fuser", K(4, 3), 20)).toBeNull(); // the piece itself (a move, a validator pass)
      // canPlaceItem asks splitProblem for a converter
      expect(canPlaceItem(b, "fuser", 4, 3)).toEqual({ ok: true });
      expect(canPlaceItem(b, "fuser", 1, 1)).toEqual({ ok: false, reason: SPLIT_OFF_BELT });
      expect(canPlaceItem(b, "fuser", 4, 5)).toEqual({ ok: false, reason: SPLIT_NO_BELT });
      expect(canPlaceItem(b, "fuser", 10, 3)).toEqual({ ok: false, reason: "OFF THE DECK" });
    });
  });

  it("a converter on a first or last tile, or next to another, makes the route ill formed (the validator refuses the deck)", () => {
    withGates(() => {
      for (const t of [0, 5]) expect(routeWellFormed(deck([["fuser", t]]), deck([["fuser", t]]).routes[0]), `tile ${t}`).toBe(false);
      const two = deck([["fuser", 2], ["smelter", 3]]);
      expect(routeWellFormed(two, two.routes[0])).toBe(false);
      const apart = deck([["fuser", 1], ["smelter", 3]]);
      expect(routeWellFormed(apart, apart.routes[0])).toBe(true);
    });
  });

  it("beltside.ts migrateInlineGates never moves a converter (it moves kind \"gate\" only)", () => {
    withGates(() => {
      const b = deck([["fuser", 2], ["smelter", 4]], [{ uid: 30, def: "whetstone", x: 4, y: 4 }]); // a whetstone ON a belt tile: the old, bad placement
      // the whetstone stands on tile 1's cell (4,4): migrated beside it; the two converters stay exactly where they are
      const before = JSON.stringify(b.items.filter((p) => p.uid >= 20 && p.uid < 30));
      const m = migrateInlineGates(b);
      expect(m.moved.map((x) => x.uid)).toEqual([30]);
      expect(m.stranded).toEqual([]);
      expect(JSON.stringify(b.items.filter((p) => p.uid >= 20 && p.uid < 30))).toBe(before);
      // and with only converters on the belt, nothing moves at all
      const only = deck([["fuser", 2], ["smelter", 4]]);
      const snap = JSON.stringify(only);
      expect(migrateInlineGates(only)).toEqual({ moved: [], stranded: [] });
      expect(JSON.stringify(only)).toBe(snap);
    });
  });
});

describe("GATES-1 G1: GATES_RULES and the validator's verdicts in both switch states", () => {
  const FEATURES = "gates (FUSER, SCATTER MILL, SMELTER)";

  it("GATES_RULES is today's rules written as a literal (the bump writes the release's); gatesFeatures reads a raw build safely", () => {
    expect(GATES_RULES).toBe("bb-0.11.0");
    expect(GATES_RULES).toBe(RULES_VERSION);
    expect(GATES_RULES).toBe(SHAPES2_RULES);
    expect(gatesFeatures(deck([["fuser", 2]]))).toEqual([FEATURES]);
    expect(gatesFeatures(deck())).toEqual([]);
    expect(gatesFeatures({ items: [] })).toEqual([]);
    expect(gatesFeatures(null)).toEqual([]);
    expect(gatesFeatures({ items: "x" })).toEqual([]);
  });

  it("the three travel only with GATES on and under rules that have them (gatesGateProblem, gatesWorld)", () => {
    const d = deck([["fuser", 2]]);
    expect(gatesGateProblem(RULES_VERSION, d)).toBe(`${FEATURES}: not in this rules version yet`); // off: whatever the rules
    expect(gatesGateProblem("bb-0.9.7", d)).toBe(`${FEATURES}: not in this rules version yet`);
    expect(gatesGateProblem(RULES_VERSION, deck())).toBeNull();
    expect(gatesWorld(RULES_VERSION)).toBe(false);
    withGates(() => {
      expect(gatesGateProblem(RULES_VERSION, d)).toBeNull();
      expect(gatesGateProblem("bb-0.10.0", d)).toBe(`rules bb-0.10.0 predate ${GATES_RULES}: ${FEATURES} need ${GATES_RULES} or later`);
      expect(gatesGateProblem("nonsense", d)).toContain("is not a bb-MAJOR.MINOR.PATCH version");
      expect([gatesWorld(RULES_VERSION), gatesWorld("bb-0.10.0"), gatesWorld("bb-0.9.7"), gatesWorld("nonsense")]).toEqual([true, false, false, false]);
      expect(inGatesWorld("bb-0.10.0", () => gatesRules())).toBe(false); // an older record is judged without the three
      expect(inGatesWorld(RULES_VERSION, () => gatesRules())).toBe(true);
      expect(gatesRules()).toBe(true); // and back on after
      expect(Object.keys(ITEMS).slice(-3)).toEqual(THREE); // ITEMS keeps its order through the swap
    });
    expect(inGatesWorld("bb-0.10.0", () => gatesRules())).toBe(false);
  });

  it("GATES off: a deck holding a gate is refused first by the rules gate in the upload check, and its def is unknown to the strict check", () => {
    const d = withGates(() => deck([["fuser", 2]]));
    expect(shapes2Rules()).toBe(true);
    for (const rules of [RULES_VERSION, "bb-0.10.0", "bb-0.9.7"]) {
      const v = validateUpload(d, 3, rules);
      expect(v.ok).toBe(false);
      expect(v.errors[0]).toBe(`rules: ${FEATURES}: not in this rules version yet`);
    }
    const strict = validateBuild(d, 3, "strict");
    expect(strict.ok).toBe(false);
    expect(strict.errors).toEqual(['item: uid 20 is unknown item "fuser"']);
  });

  it("GATES on: accepted under this build's rules, refused under older rules (both versions named); the deck is judged", () => {
    withGates(() => {
      const d = deck([["fuser", 2]]);
      expect(validateBuild(d, 3, "strict")).toEqual({ ok: true, errors: [] });
      const old = validateUpload(d, 3, "bb-0.10.0");
      expect(old.ok).toBe(false);
      expect(old.errors[0]).toBe(`rules: rules bb-0.10.0 predate ${GATES_RULES}: ${FEATURES} need ${GATES_RULES} or later`);
      const ok = validateUpload(d, 3, RULES_VERSION);
      expect(ok.errors.some((e) => e.startsWith("rules:"))).toBe(false); // the gate says nothing (later rules, runes, judge the rest)
      for (const t of [1, 2, 3, 4]) expect(validateBuild(deck([["smelter", t]]), 3, "strict"), `tile ${t}`).toEqual({ ok: true, errors: [] });
    });
  });

  it("GATES on: forged decks are refused with the short reasons (off a belt, first or last tile, next to another gate, stars out of range)", () => {
    withGates(() => {
      const offBelt = deck([], [{ uid: 20, def: "fuser", x: 1, y: 1 }]);
      expect(validateBuild(offBelt, 3, "strict").errors).toEqual([`placement: uid 20 FUSER at 1,1: ${SPLIT_OFF_BELT}`]);
      const first = deck([["fuser", 0]]);
      expect(validateBuild(first, 3, "strict").errors).toEqual([`placement: uid 20 FUSER at 4,5: ${SPLIT_NO_BELT}`]);
      const last = deck([["fuser", 5]]);
      expect(validateBuild(last, 3, "strict").errors).toEqual([`placement: uid 20 FUSER at 4,0: ${SPLIT_NO_BELT}`]);
      const pair = deck([["fuser", 2], ["smelter", 3]]);
      expect(validateBuild(pair, 3, "strict").errors.length).toBeGreaterThan(0);
      expect(validateBuild(pair, 3, "strict").errors.every((e) => e.startsWith("placement:"))).toBe(true);
      const stars = deck([["fuser", 2]]);
      stars.items[1].stars = 4;
      expect(validateBuild(stars, 3, "strict").errors.length).toBeGreaterThan(0);
      const unknown = deck([["fuser", 2]]);
      unknown.items[1].def = "fuserx";
      expect(validateBuild(unknown, 3, "strict").errors).toEqual(['item: uid 20 is unknown item "fuserx"']);
      // a gate cannot ride in the mods, and a rot is for rigs only
      const rotted = deck([["fuser", 2]]);
      rotted.items[1].rot = 1;
      expect(validateBuild(rotted, 3, "strict").errors.length).toBeGreaterThan(0);
    });
  });
});
