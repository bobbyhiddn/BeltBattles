import { describe, expect, it } from "vitest";
import { warlordBuild } from "../src/sim/ai";
import { hitsOfRig, hullSlots } from "../src/sim/deck";
import { ITEMS, type HeroId } from "../src/sim/content";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { buildCost, unfusedPairs, validateBuild } from "../src/net/validate";
import { RIVAL_IDS, deckCost, honestReference, luckOf, maxGoldByDay, rivalBuild, rivalLoadout, standInBuild } from "../src/sim/rivals";
import { PLANS, dayOwned } from "../src/sim/rivalBuilds";
import { starsOf, upgradeGold } from "../src/sim/stars";
import { legalityProblems } from "./rivals.legality";

const DAYS = Array.from({ length: 10 }, (_, i) => i + 1);
const PAR_HEROES: HeroId[] = ["furnace", "weaver"];

describe("live preset purchases obey automatic merging", () => {
  it("Furnace and Weaver par builds on every day are pair free, legal and affordable", () => {
    for (const hero of PAR_HEROES) for (const day of DAYS) {
      const b = honestReference(hero, day);
      const label = `${hero} par day ${day}`;
      expect(heroRefBuild(hero, day), label).toEqual(b);
      expect(unfusedPairs(b), label).toEqual([]);
      expect(legalityProblems(b), label).toEqual([]);
      expect(validateBuild(b, day), label).toMatchObject({ ok: true, errors: [] });
      expect(buildCost(b).total, label).toBeLessThanOrEqual(maxGoldByDay(day));
    }
    const before = warlordBuild("weaver", 6);
    const d7 = warlordBuild("weaver", 7);
    const d8 = warlordBuild("weaver", 8);
    const placedGrease = before.items.find((p) => p.def === "grease")!;
    const placedTemper = before.items.find((p) => p.def === "temper")!;
    expect(d7.items.find((p) => p.uid === placedGrease.uid)).toMatchObject({ x: placedGrease.x, y: placedGrease.y, rot: placedGrease.rot, stars: 2 });
    expect(d8.items.find((p) => p.uid === placedTemper.uid)).toMatchObject({ x: placedTemper.x, y: placedTemper.y, rot: placedTemper.rot, stars: 2 });
    expect(hitsOfRig(d7, placedGrease.uid).length).toBe(1); // ★2 does not gain a second arrow
  });

  it("all 13 captains on days 1-10 have no pair, legal rigs and honest stand-ins", () => {
    for (const id of RIVAL_IDS) for (const day of DAYS) {
      const road = rivalBuild(id, day), standIn = standInBuild(id, day);
      const label = `${id} day ${day}`;
      expect(unfusedPairs(road), label).toEqual([]);
      expect(legalityProblems(road), label).toEqual([]);
      expect(road.items.every((p) => starsOf(p) <= (id === "matriarch" ? 3 : 2)), label).toBe(true);
      expect(road.mods.every((p) => starsOf(p) <= (id === "matriarch" ? 3 : 2)), label).toBe(true);
      expect(deckCost(standIn).total, label).toBe(buildCost(standIn).total);
      if (id !== "matriarch" || day >= 8) {
        expect(validateBuild(standIn, day), label).toMatchObject({ ok: true, errors: [] });
        expect(deckCost(standIn).total, label).toBeLessThanOrEqual(maxGoldByDay(day));
      }
      // Road decks carry the existing fractional PvE hull ramp; only supply and budget
      // may prevent a road deck from being sent as a player ghost.
      expect(validateBuild(road, day).errors.every((e) => /^(supply|budget):/.test(e)), label).toBe(true);
    }
  });

  it("each ★2 purchase pays for its acquired copy and keeps the placed survivor", () => {
    for (const id of RIVAL_IDS) for (const day of DAYS) {
      const plan = PLANS[id];
      // 0.8.0 I1 M3 (oracle 983d875df9706e1c): a base factory is paid for from the day it is owned (rivalBuilds.ts FactoryPlan.at)
      let paid = plan.factories.filter((f) => (f.at ?? 1) <= day).reduce((n, f) => n + ITEMS[f.def].price, 0) + plan.crates * ITEMS.beltcrate.price;
      // 0.6.2 TUNE-C: the upgrades the warlord deck's luck owns by that day (rivals.ts luckOf; rivalBuilds.ts dayOwned)
      const turretDef = new Map<number, string>();
      for (const u of plan.upgrades.filter((u) => dayOwned(u, luckOf(id)) <= day)) {
        if (u.gate) paid += ITEMS[u.gate[0]].price;
        if (u.mod) paid += ITEMS[u.mod[0]].price;
        if (u.fuseGate) paid += ITEMS[u.fuseGate[0]].price;
        if (u.fuseMod) paid += ITEMS[u.fuseMod[0]].price;
        if (u.factory) paid += ITEMS[u.factory.def].price;
        if (u.turret) { paid += ITEMS[u.turret[0]].price; turretDef.set(u.turret[1], u.turret[0]); } // a bought turret
        if (u.fuseTurret) {
          const slot = u.fuseTurret[0];
          paid += ITEMS[turretDef.get(slot) ?? hullSlots(plan.hero)[slot].start!].price; // another copy of the slot's turret
        }
        paid += (u.crates ?? 0) * ITEMS.beltcrate.price + (u.plating ?? 0) * ITEMS.plating.price;
      }
      const l = rivalLoadout(id, day);
      // bb-0.8.3 (REQ-BFG-043 D10, D7'): the value counts the gold upgrades too (rivalBuilds.ts captainLevels, the uniform
      // rule), as every sum of value does (stars.ts upgradeGold)
      paid += upgradeGold(l.build);
      expect(l.value, `${id} day ${day} purchases`).toBe(paid);
      if (id !== "matriarch") expect(l.value, `${id} day ${day} budget`).toBeLessThanOrEqual(maxGoldByDay(day));
    }
    // 0.6.2 TUNE-C plans: SILKSHADE's coils (a ★2 from day 4, a ★1 on another belt from day 5) both work a belt
    const coil = rivalBuild("silkshade", 5).items.filter((p) => p.def === "coil");
    expect(coil.map(starsOf)).toEqual([2, 1]);
    expect(coil.every((p) => hitsOfRig(rivalBuild("silkshade", 5), p.uid).length > 0)).toBe(true);
    // splitters are epics: under bb-0.8.6, WEAVER's ordinary epic+ cap is 1 on every day, so LACEWING's Medium deck holds
    // one splitter, the ★2 from day 8. Her day-9 ★1 left the plan under the packs' caps (oracles 47d683ef9b959301 (3) and
    // 34c22fae54b0aaf2)
    const splitters = rivalBuild("lacewing", 9).items.filter((p) => p.def === "splitter");
    expect(splitters.map(starsOf)).toEqual([2]);
    expect(splitters.every((p) => hitsOfRig(rivalBuild("lacewing", 9), p.uid).length > 0)).toBe(true);
    expect(rivalBuild("emberlyn", 8).mods).toContainEqual(expect.objectContaining({ def: "drake", turret: 1 }));
  });
});
