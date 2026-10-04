// 0.6.2s TURRET SLOTS (REQ-BFG-031 S7, S8): validateBuild (src/net/validate.ts) on the turret list, the gear on each
// slot, free copies, unfused turret pairs and the turrets' cost. A build without `turrets` (the starting layout)
// validates, costs and reports exactly as before.
import { describe, expect, it } from "vitest";
import { startingBuild } from "../src/sim/ai";
import { TURRET_PRICE } from "../src/sim/content";
import { startingTurrets, turretsCost, type Build, type BuildTurret, type ModPlacement } from "../src/sim/deck";
import { buildCost, unfusedPairs, validateBuild } from "../src/net/validate";

type Hero = "furnace" | "weaver";
const P = TURRET_PRICE.common;
const EXTRA: Record<Hero, number> = { furnace: 1, weaver: 3 }; // each hull's one extra (empty) slot

/** The hero's starting deck (tests/netHelpers' fixture), with an explicit turret list when given. */
const deck = (hero: Hero, turrets?: BuildTurret[], over: Partial<Build> = {}): Build => ({
  ...startingBuild(hero, 1), ...(turrets ? { turrets } : {}), ...over,
});
/** The starting layout plus one turret in the extra slot. */
const withExtra = (hero: Hero, t: Omit<BuildTurret, "slot">, mods: ModPlacement[] = []): Build =>
  deck(hero, [...startingTurrets(hero), { slot: EXTRA[hero], ...t }], { mods });
const errs = (b: Build, day = 10) => validateBuild(b, day).errors;
const OK = { ok: true, errors: [] };

describe("turret slots: builds without `turrets` are unchanged", () => {
  it("both heroes' starting decks validate on every day, with or without the explicit starting layout, at the same cost", () => {
    for (const hero of ["furnace", "weaver"] as const) {
      const plain = deck(hero);
      expect("turrets" in plain).toBe(false);
      const explicit = deck(hero, startingTurrets(hero));
      for (let d = 1; d <= 10; d++) {
        expect(validateBuild(plain, d), `${hero} d${d}`).toEqual(OK);
        expect(validateBuild(explicit, d), `${hero} d${d} explicit`).toEqual(OK);
      }
      expect(Object.keys(buildCost(plain))).toEqual(["items", "mods", "crates", "plates", "total"]); // no `turrets` key
      expect(buildCost(explicit)).toEqual({ ...buildCost(plain), turrets: 0 });
      expect([unfusedPairs(plain), unfusedPairs(explicit)]).toEqual([[], []]);
    }
  });

  it("the starting turrets' hardpoint messages are the ones they always were", () => {
    const two: ModPlacement[] = [{ uid: 600, def: "calibrate", turret: 0 }, { uid: 601, def: "chamber", turret: 0 }];
    const three: ModPlacement[] = [...two, { uid: 602, def: "spotter", turret: 0 }];
    const cores: ModPlacement[] = [{ uid: 600, def: "scatter", turret: 0 }, { uid: 601, def: "drake", turret: 0 }];
    for (const turrets of [undefined, startingTurrets("furnace")]) {
      expect(errs(deck("furnace", turrets, { mods: two }))).toEqual(["hardpoint: turret 0 carries more than one module"]);
      expect(errs(deck("furnace", turrets, { mods: three }))).toEqual([
        "hardpoint: turret 0 carries more than one module", "hardpoint: turret 0 carries more than one module",
      ]); // one per extra piece, as before
      expect(errs(deck("furnace", turrets, { mods: cores }))).toEqual(["hardpoint: turret 0 carries more than one core"]);
      expect(errs(deck("furnace", turrets, { mods: [{ uid: 600, def: "temper", turret: 0 }] })))
        .toEqual(["hardpoint: uid 600 TEMPER is not turret equipment"]);
    }
  });
});

describe("turret slots: legal builds", () => {
  it("a bought turret in the extra slot is legal and costs its price", () => {
    for (const hero of ["furnace", "weaver"] as const) {
      const b = withExtra(hero, { def: "rampart", uid: 500 });
      expect(validateBuild(b, 10), hero).toEqual(OK);
      expect(buildCost(b)).toEqual({ ...buildCost(deck(hero)), turrets: P, total: buildCost(deck(hero)).total + P });
    }
  });

  it("a 2-star common has 2 gear slots, a 3-star 3; the core socket is separate", () => {
    const two = withExtra("furnace", { def: "rampart", uid: 500, stars: 2 }, [
      { uid: 600, def: "calibrate", turret: 1 }, { uid: 601, def: "chamber", turret: 1 },
    ]);
    expect(validateBuild(two, 10)).toEqual(OK);
    const three = withExtra("furnace", { def: "rampart", uid: 500, stars: 3 }, [
      { uid: 600, def: "calibrate", turret: 1 }, { uid: 601, def: "chamber", turret: 1 }, { uid: 602, def: "spotter", turret: 1 },
      { uid: 603, def: "scatter", turret: 1 }, { uid: 604, def: "hopper", turret: 0 },
    ]);
    expect(validateBuild(three, 10)).toEqual(OK);
    // a merged free starting copy has its stars' gear slots too
    const merged = deck("furnace", [{ slot: 0, def: "scrapcannon", uid: 90, stars: 2, free: true }], {
      mods: [{ uid: 600, def: "calibrate", turret: 0 }, { uid: 601, def: "chamber", turret: 0 }],
    });
    expect(validateBuild(merged, 10)).toEqual(OK);
  });

  it("WEAVER's three free DART GUNs are legal, merged or not", () => {
    const w = startingTurrets("weaver");
    expect(w.map((t) => `${t.slot}:${t.def}:${t.uid}:${t.free}`)).toEqual(["0:dartgun:90:true", "1:dartgun:91:true", "2:dartgun:92:true"]);
    expect(validateBuild(deck("weaver", w), 1)).toEqual(OK);
    expect(validateBuild(deck("weaver", w.map((t) => (t.slot === 0 ? { ...t, stars: 3 } : t))), 10)).toEqual(OK);
  });
});

describe("turret slots: rejections, each with its reason", () => {
  const f = () => startingTurrets("furnace");

  it("the turret list: a slot out of range, a def that isn't a turret, two turrets in a slot, a uid used twice", () => {
    expect(errs(deck("furnace", [...f(), { slot: 2, def: "rampart", uid: 500 }]))).toEqual(["turret: uid 500 is in slot 2; FURNACE has 2 turret slots"]);
    expect(errs(deck("weaver", [...startingTurrets("weaver"), { slot: 7, def: "rampart", uid: 500 }]))).toEqual(["turret: uid 500 is in slot 7; WEAVER has 4 turret slots"]);
    expect(errs(deck("furnace", [...f(), { slot: 1, def: "temper", uid: 500 }]))).toEqual(["turret: uid 500 TEMPER is not a turret"]);
    expect(errs(deck("furnace", [...f(), { slot: 1, def: "calibrate", uid: 500 }]))).toEqual(["turret: uid 500 CALIBRATION is not a turret"]);
    expect(errs(deck("furnace", [...f(), { slot: 1, def: "nosuch", uid: 500 }]))).toEqual(['turret: uid 500 is unknown item "nosuch"']);
    expect(errs(deck("furnace", [...f(), { slot: 0, def: "rampart", uid: 500 }]))).toEqual(["turret: slot 0 holds more than one turret"]);
    const kiln = startingBuild("furnace", 1).items[0].uid;
    expect(errs(deck("furnace", [...f(), { slot: 1, def: "rampart", uid: kiln }]))).toEqual([`turret: uid ${kiln} is used twice`]);
    expect(errs(deck("furnace", [...f(), { slot: 1, def: "rampart", uid: 90 }]))).toEqual(["turret: uid 90 is used twice"]);
    expect(errs(withExtra("furnace", { def: "rampart", uid: 600 }, [{ uid: 600, def: "calibrate", turret: 0 }]))).toEqual(["turret: uid 600 is used twice"]);
  });

  it("stars outside 1..3 and `free: false` are shape errors", () => {
    expect(errs(withExtra("furnace", { def: "rampart", uid: 500, stars: 4 }))).toEqual(["shape: build.turrets[1].stars: expected an integer in 1..3"]);
    expect(errs(withExtra("furnace", { def: "rampart", uid: 500, stars: 0 }))).toEqual(["shape: build.turrets[1].stars: expected an integer in 1..3"]);
    expect(errs(withExtra("furnace", { def: "rampart", uid: 500, free: false }))).toEqual(["shape: build.turrets[1].free: expected true (absent = false)"]);
  });

  it("S7 free copies: only the hero's own starting defs, at most as many as it starts with", () => {
    const w = startingTurrets("weaver");
    expect(errs(deck("weaver", [...w, { slot: 3, def: "dartgun", uid: 500, free: true }]))).toEqual(["turret: 4 free DART GUN copies, but WEAVER starts with 3"]);
    expect(errs(deck("weaver", [...w, { slot: 3, def: "scrapcannon", uid: 500, free: true }]))).toEqual(["turret: uid 500 SCRAP CANNON is a free copy, but WEAVER doesn't start with one"]);
    expect(errs(deck("furnace", [...f(), { slot: 1, def: "scrapcannon", uid: 500, free: true }]))).toEqual(["turret: 2 free SCRAP CANNON copies, but FURNACE starts with 1"]);
    expect(errs(deck("furnace", [...f(), { slot: 1, def: "rampart", uid: 500, free: true, stars: 2 }]))).toEqual(["turret: uid 500 RAMPART CANNON is a free copy, but FURNACE doesn't start with one"]);
  });

  it("gear beyond a turret's gear slots", () => {
    const g = (n: number): ModPlacement[] => ["calibrate", "chamber", "spotter", "flak"].slice(0, n).map((def, i) => ({ uid: 600 + i, def, turret: 1 }));
    expect(errs(withExtra("furnace", { def: "rampart", uid: 500 }, g(2)))).toEqual(["hardpoint: turret 1 carries more than one module"]);
    expect(errs(withExtra("furnace", { def: "rampart", uid: 500, stars: 2 }, g(3)))).toEqual(["hardpoint: turret 1 carries 3 gear; its turret has 2 gear slots"]);
    expect(errs(withExtra("furnace", { def: "rampart", uid: 500, stars: 2 }, g(4)))).toEqual(["hardpoint: turret 1 carries 4 gear; its turret has 2 gear slots"]);
    expect(errs(withExtra("furnace", { def: "rampart", uid: 500, stars: 3 }, g(4)))).toEqual(["hardpoint: turret 1 carries 4 gear; its turret has 3 gear slots"]);
  });

  it("a core or gear on an empty slot; a slot beyond the hull", () => {
    const on = (hero: Hero, def: string, turret: number, turrets?: BuildTurret[]) => errs(deck(hero, turrets, { mods: [{ uid: 600, def, turret }] }));
    expect(on("furnace", "calibrate", 1)).toEqual(["hardpoint: uid 600 targets turret 1; FURNACE has 1 installed: uid 600 CALIBRATION is on an empty turret slot 1"]);
    expect(on("furnace", "scatter", 1)).toEqual(["hardpoint: uid 600 targets turret 1; FURNACE has 1 installed: uid 600 SCATTER CHOKE is on an empty turret slot 1"]);
    expect(on("weaver", "calibrate", 3, startingTurrets("weaver"))).toEqual(["hardpoint: uid 600 targets turret 3; WEAVER has 3 installed: uid 600 CALIBRATION is on an empty turret slot 3"]);
    expect(on("furnace", "calibrate", 2)).toEqual(["hardpoint: uid 600 targets turret 2; FURNACE has 2"]);
    expect(on("weaver", "scatter", 4)).toEqual(["hardpoint: uid 600 targets turret 4; WEAVER has 4"]);
    // the starting SCRAP CANNON moved to the extra slot: slot 0 is empty now (its belt is cut off too)
    const moved = on("furnace", "calibrate", 0, [{ slot: 1, def: "scrapcannon", uid: 90, free: true }]);
    expect(moved).toContain("hardpoint: uid 600 targets turret 0; FURNACE has 1 installed: uid 600 CALIBRATION is on an empty turret slot 0");
    expect(moved.filter((e) => !e.startsWith("route:"))).toHaveLength(1);
  });

  it("two copies of one mod on a turret", () => {
    const dup = withExtra("furnace", { def: "rampart", uid: 500, stars: 2 }, [
      { uid: 600, def: "calibrate", turret: 1 }, { uid: 601, def: "calibrate", turret: 1, stars: 2 },
    ]);
    expect(errs(dup)).toEqual(["hardpoint: turret 1 carries two CALIBRATION"]);
    // on two turrets they are fine
    const apart = withExtra("furnace", { def: "rampart", uid: 500, stars: 2 }, [
      { uid: 600, def: "calibrate", turret: 1 }, { uid: 601, def: "calibrate", turret: 0, stars: 2 },
    ]);
    expect(validateBuild(apart, 10)).toEqual(OK);
  });

  it("cost over budget names the turrets' value; a build without it keeps its message", () => {
    const rich = withExtra("furnace", { def: "rampart", uid: 500, stars: 3 });
    const c = buildCost(rich);
    expect(c.turrets).toBe(4 * P);
    expect(errs(rich, 1)).toEqual([`budget: build costs ${c.total} gold (items ${c.items}, mods ${c.mods}, ${c.crates} crates, ${c.plates} plating, turrets ${4 * P}) but day 1 allows at most 8`]);
    for (const turrets of [undefined, startingTurrets("furnace")]) {
      const plated = deck("furnace", turrets, { hullBonus: 500 }); // NUM-1: two plates of 250 (was 50)
      const p = buildCost(plated);
      expect(errs(plated, 1)).toEqual([`budget: build costs ${p.total} gold (items ${p.items}, mods ${p.mods}, ${p.crates} crates, ${p.plates} plating) but day 1 allows at most 8`]);
    }
  });
});

describe("turret slots: unfused pairs", () => {
  const w = startingTurrets("weaver"), f = startingTurrets("furnace");
  it("two free copies never pair; a bought copy pairs with free ones of its stars", () => {
    expect(unfusedPairs(deck("weaver", w))).toEqual([]);
    const bought = deck("weaver", [...w, { slot: 3, def: "dartgun", uid: 500 }]);
    expect(unfusedPairs(bought)).toEqual(["UNFUSED PAIR: DART GUN ★1 x4"]);
    expect(errs(bought)).toEqual(["item: UNFUSED PAIR: DART GUN ★1 x4"]);
    expect(unfusedPairs(deck("weaver", [...w, { slot: 3, def: "dartgun", uid: 500, stars: 2 }]))).toEqual([]);
    const merged = w.map((t) => (t.slot === 0 ? { ...t, stars: 2 } : t));
    expect(unfusedPairs(deck("weaver", [...merged, { slot: 3, def: "dartgun", uid: 500, stars: 2 }]))).toEqual(["UNFUSED PAIR: DART GUN ★2 x2"]);
    expect(unfusedPairs(deck("furnace", [...f, { slot: 1, def: "scrapcannon", uid: 500 }]))).toEqual(["UNFUSED PAIR: SCRAP CANNON ★1 x2"]);
  });

  it("two bought copies pair; 3-star copies never do; items and mods come first", () => {
    expect(unfusedPairs(deck("furnace", [{ slot: 0, def: "rampart", uid: 500 }, { slot: 1, def: "rampart", uid: 501 }]))).toEqual(["UNFUSED PAIR: RAMPART CANNON ★1 x2"]);
    expect(unfusedPairs(deck("furnace", [{ slot: 0, def: "rampart", uid: 500, stars: 3 }, { slot: 1, def: "rampart", uid: 501, stars: 3 }]))).toEqual([]);
    const mods: ModPlacement[] = [{ uid: 600, def: "calibrate", turret: 0 }, { uid: 601, def: "calibrate", turret: 1 }];
    expect(unfusedPairs(deck("furnace", [...f, { slot: 1, def: "scrapcannon", uid: 500 }], { mods }))).toEqual([
      "UNFUSED PAIR: CALIBRATION ★1 x2", "UNFUSED PAIR: SCRAP CANNON ★1 x2",
    ]);
  });
});

describe("turret slots: buildCost", () => {
  it("adds each installed turret's value: price x (2^(stars-1) - 1 for the free starting copy)", () => {
    const base = buildCost(deck("furnace"));
    const cases: [Omit<BuildTurret, "slot" | "uid">, number][] = [
      [{ def: "rampart" }, P], [{ def: "rampart", stars: 2 }, 2 * P], [{ def: "rampart", stars: 3 }, 4 * P],
    ];
    for (const [t, v] of cases) {
      const b = withExtra("furnace", { uid: 500, ...t });
      expect(buildCost(b), JSON.stringify(t)).toEqual({ ...base, turrets: v, total: base.total + v });
      expect(turretsCost(b)).toBe(v);
    }
    const free: [number | undefined, number][] = [[undefined, 0], [2, P], [3, 3 * P]];
    for (const [stars, v] of free) {
      const b = deck("furnace", [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ...(stars ? { stars } : {}) }]);
      expect(buildCost(b), `free ★${stars ?? 1}`).toEqual({ ...base, turrets: v, total: base.total + v });
    }
  });
});
