// Harness v2 part 3 (REQ-BFG-026, REQ-BFG-019), verify13 D1 and N1: the slag rule at its last two enforcement points.
// With factories on, no speed rig may hit a SLAG POT route (AMMO.slag.fixedSpeed: Battle.transport ignores speed
// rigs there). tests/harness.factories.test.ts covers rigTilesFor, the gate lever and the merge lever. This
// file covers the other two:
// - the "drop" lever (pressLine, levers.ts): a dropped signature route's rigs ride onto the new factory's line, except
//   the speed rigs when that factory is a SLAG POT; they are left behind (not bought) and counted in slag.skipped.
//   verify13 D1: removing that filter makes both drop tests fail while the topUp control stays green;
// - topUp's 3 g rig (gen.ts): it goes through rigTilesFor, so a speed rig drawn there skips the slag tiles (N1).
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { AMMO, ITEMS, type ItemDef } from "../src/sim/content";
import { hitsOfRig, rigHits, routesOf, type Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { FUSE_MAX, effectAt, outputsAt, starsOf } from "../src/sim/stars";
import { shopBuild, topUp } from "../src/sim/harness/gen";
import { heroStartBuild } from "../src/sim/harness/heroes";
import { applyLever, canApply, droppable } from "../src/sim/harness/levers";
import { cargoValue, unfusedWithCargo, type InvItem } from "../src/sim/harness/merge";
import { freeConnectors } from "../src/sim/harness/path";
import { PLATE, Shopper } from "../src/sim/harness/shopper";
import { withLegacyStock } from "./catalogueLegacy";

/** The slag rule read from the game's data alone (not the harness's fixedSpeedCells/isSpeedGate): no rig hit with a speed
 *  at its stars on a route whose factory's ammo, at the factory's stars, has AMMO.fixedSpeed. */
function slagProblems(b: Build): string[] {
  const out: string[] = [];
  const hits = rigHits(b);
  b.routes.forEach((r, ri) => {
    const f = b.items.find((p) => p.uid === r.factory);
    const ammo = f ? effectAt(f.def, starsOf(f)).factory?.ammo : undefined;
    if (!f || !ammo || AMMO[ammo]?.fixedSpeed === undefined) return;
    for (const hit of hits[ri].flat()) {
      const g = b.items.find((p) => p.uid === hit.uid)!;
      if (effectAt(g.def, starsOf(g)).gate?.speed !== undefined) out.push(`speed rig ${g.def}*${starsOf(g)} on slag route ${ri} (${f.def})`);
    }
  });
  return out;
}

/** The factories-on invariant (as tests/harness.factories.test.ts): legal, no unfused pair (deck, deck + cargo), deck +
 *  cargo within the day's gold, no factory over its outputs, and the slag rule above. */
function problems(b: Build, cargo: readonly InvItem[], day: number): string[] {
  const out: string[] = [...validateBuild(b, day).errors, ...unfusedPairs(b), ...unfusedWithCargo(b, cargo)];
  if (buildCost(b).total + cargoValue(cargo) > maxGoldByDay(day)) out.push(`over budget: ${buildCost(b).total} + cargo ${cargoValue(cargo)} > ${maxGoldByDay(day)}`);
  for (const p of b.items) {
    if (ITEMS[p.def]?.kind !== "factory") continue;
    const n = routesOf(b, p.uid).length, outs = outputsAt(p.def, starsOf(p));
    if (n > outs) out.push(`${p.def}*${starsOf(p)} feeds ${n} routes, outputs ${outs}`);
  }
  return [...out, ...slagProblems(b)];
}

/** A stars-on, factories-on Shopper whose factory shop is only `defs` (as tests/harness.factories.test.ts). */
function shopper(b: Build, day: number, seed: number, defs: string[]): Shopper {
  const s = new Shopper(b, 500, day, new Rng(seed), "on", FUSE_MAX, "off", "on");
  (s as unknown as { factories: ItemDef[] }).factories = defs.map((d) => ITEMS[d]);
  return s;
}

const hasSpeed = (def: string): boolean => effectAt(def, 1).gate?.speed !== undefined;

describe("harness factories (0.6.1c): the slag rule at the drop lever and at topUp (verify13 D1, N1)", () => {
  it("the drop lever leaves a carried speed gate off a SLAG POT line: WEAVER's start deck, a speed gate on every LOOM route, the shop narrowed to SLAG POT", () => {
    // Every LOOM route holds one speed gate and one other gate, all different defs (two copies of one def would merge,
    // stars on), so whichever route the drop lifts, it carries exactly one speed gate toward the new SLAG POT line.
    const SPEED = ["grease", "brake", "overdrive"], OTHER = ["temper", "whetstone", "longhaul"];
    for (const d of SPEED) expect(hasSpeed(d), d).toBe(true);
    for (const d of OTHER) expect(hasSpeed(d), d).toBe(false);
    for (let seed = 1; seed <= 6; seed++) {
      const s = shopper(heroStartBuild("weaver", 1), 10, hashSeed("slag-drop", seed), ["slagpot"]);
      const loom = s.b.items.find((p) => p.def === "loom")!;
      expect(routesOf(s.b, loom.uid).length).toBe(3);
      s.b.routes.forEach((_, ri) => {
        expect(s.placeRig(SPEED[ri], ri, 0), `seed ${seed}: speed rig on route ${ri}`).not.toBeNull();
        expect(s.placeRig(OTHER[ri], ri, 1), `seed ${seed}: other rig on route ${ri}`).not.toBeNull();
      });
      expect(problems(s.b, s.cargo, 10), `seed ${seed}: the deck before the drop`).toEqual([]);
      // "drop" applies: every connector taken, the LOOM's three routes droppable, gold for the SLAG POT
      expect(freeConnectors(s.b)).toEqual([]);
      expect(droppable(s.b).length).toBe(3);
      expect(canApply(s, "drop")).toBe(true);
      const slag0 = { ...s.slag };
      expect(applyLever(s, "drop"), `seed ${seed}: the drop`).toBe(true);
      const pot = s.b.items.find((p) => p.def === "slagpot")!;
      expect(pot, `seed ${seed}: a SLAG POT was bought`).toBeDefined();
      expect(routesOf(s.b, pot.uid).length).toBe(1);
      expect(routesOf(s.b, loom.uid).length).toBe(2);
      // the rule: no speed gate on the SLAG POT's route (the game's data, and the full invariant)
      expect(slagProblems(s.b), `seed ${seed}`).toEqual([]);
      expect(problems(s.b, s.cargo, 10), `seed ${seed}`).toEqual([]);
      const hits = rigHits(s.b);
      const gatesOnPot = s.b.routes.flatMap((r, ri) => r.factory === pot.uid ? hits[ri].flat().map((h) => h.def) : []);
      // the carried speed gate was left behind (not bought: one fewer speed gate on the deck), and counted
      expect(s.b.items.filter((p) => hasSpeed(p.def)).length, `seed ${seed}: speed gates left on the deck`).toBe(2);
      expect(s.slag.skipped, `seed ${seed}: slag.skipped`).toBe(slag0.skipped + 1);
      expect(s.slag.steered).toBe(slag0.steered);
      // the rest of the load rides along: the dropped route's other gate sits on the SLAG POT line
      expect(gatesOnPot.length, `seed ${seed}: gates on the SLAG POT line ${gatesOnPot}`).toBe(1);
      expect(OTHER).toContain(gatesOnPot[0]);
      expect(s.b.items.filter((p) => OTHER.includes(p.def)).length).toBe(3);
    }
  });

  it("pinned on BELTSIDE: WEAVER d3 #129 reaches the drop's slag filter; the slag rule holds after every lever", () => withLegacyStock(() => {
    // H2 rig placement moved the old v2 WEAVER d3 #73 case off this path. A search of the same v13-legal seeds on
    // BELTSIDE found WEAVER d3 #129, d5 #15 and d7 #104, and SIPHON d5 #93 and d7 #37. This pin keeps the D1 proof.
    const day = 3;
    let levers = 0, filtered = 0, prev = 0;
    const r = shopBuild("weaver", day, new Rng(hashSeed("v13-legal", "weaver", day, 129)), "on", FUSE_MAX, "on", (s, l, ok) => {
      levers++;
      expect(slagProblems(s.b), `after lever ${levers} ${l} (${ok})`).toEqual([]);
      expect(problems(s.b, s.cargo, day), `after lever ${levers} ${l} (${ok})`).toEqual([]);
      if (l === "drop" && ok && s.slag.skipped > prev) filtered++; // only pressLine's filter raises it during a drop
      prev = s.slag.skipped;
    }, "on");
    // if a later sim change moves this build off the filter, this fails: pick a new seed (the comment above says how)
    expect(filtered, "a drop left a carried speed gate off a SLAG POT line").toBeGreaterThan(0);
    expect(r.slag.skipped).toBeGreaterThan(0);
    expect(r.build.items.some((p) => p.def === "slagpot")).toBe(true);
    expect(slagProblems(r.build)).toEqual([]);
  }));

  it("topUp's 3 g gate never lands on a slag route: with only SLAG POT cells free, a speed gate it draws is not bought (N1)", () => {
    const day = 10;
    let skipped = 0, placed = 0;
    for (let seed = 1; seed <= 16; seed++) {
      // WEAVER with its LOOM's belts removed (legal: a factory may feed fewer routes than it has outputs) and a SLAG POT
      // bought by the press lever: the SLAG POT's route is the only belt, so every free route cell is a slag cell
      const b = heroStartBuild("weaver", 1);
      b.routes = [];
      const s = shopper(b, day, hashSeed("slag-topup", seed), ["slagpot"]);
      expect(applyLever(s, "press"), `seed ${seed}: the press`).toBe(true);
      expect(b.routes.length).toBe(1);
      expect(b.items.find((p) => p.uid === b.routes[0].factory)!.def).toBe("slagpot");
      // belt crates (2 g) until plating (5 g a plate) leaves 3 or 4 g: topUp then tries its 3 g gate
      while ((maxGoldByDay(day) - buildCost(b).total) % PLATE.price < 3) b.beltCap += 4;
      const gates0 = b.items.filter((p) => ITEMS[p.def].kind === "gate").length;
      expect(gates0).toBe(0);
      topUp(b, day, new Rng(hashSeed("slag-topup-rng", seed)), undefined, "on", FUSE_MAX, "off", [], "on");
      expect(problems(b, [], day), `seed ${seed}`).toEqual([]);
      const gates = b.items.filter((p) => ITEMS[p.def].kind === "gate");
      expect(gates.length).toBeLessThanOrEqual(1);
      if (gates.length) {
        placed++;
        expect(hasSpeed(gates[0].def), `seed ${seed}: ${gates[0].def}`).toBe(false);
        expect(hitsOfRig(b, gates[0].uid).some((h) => b.routes[0].cells.includes(h.cell))).toBe(true); // works the slag line
      } else skipped++;
    }
    // both branches ran: a 3 g gate that isn't a speed gate went onto the slag line, and a drawn speed gate was not bought
    expect(placed).toBeGreaterThan(0);
    expect(skipped).toBeGreaterThan(0);
  });
});
