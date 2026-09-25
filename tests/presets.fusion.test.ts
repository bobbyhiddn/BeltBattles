import { describe, expect, it } from "vitest";
import { warlordBuild } from "../src/sim/ai";
import { hitsOfRig } from "../src/sim/deck";
import { ITEMS, type HeroId } from "../src/sim/content";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { buildCost, unfusedPairs, validateBuild } from "../src/net/validate";
import { RIVAL_IDS, deckCost, honestReference, maxGoldByDay, rivalBuild, rivalLoadout, standInBuild } from "../src/sim/rivals";
import { PLANS } from "../src/sim/rivalBuilds";
import { starsOf } from "../src/sim/stars";
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
      let paid = plan.factories.reduce((n, f) => n + ITEMS[f.def].price, 0) + plan.crates * ITEMS.beltcrate.price;
      for (const u of plan.upgrades.filter((u) => u.at <= day)) {
        if (u.gate) paid += ITEMS[u.gate[0]].price;
        if (u.mod) paid += ITEMS[u.mod[0]].price;
        if (u.fuseGate) paid += ITEMS[u.fuseGate[0]].price;
        if (u.fuseMod) paid += ITEMS[u.fuseMod[0]].price;
        if (u.factory) paid += ITEMS[u.factory.def].price;
        paid += (u.crates ?? 0) * ITEMS.beltcrate.price + (u.plating ?? 0) * ITEMS.plating.price;
      }
      const l = rivalLoadout(id, day);
      expect(l.value, `${id} day ${day} purchases`).toBe(paid);
      if (id !== "matriarch") expect(l.value, `${id} day ${day} budget`).toBeLessThanOrEqual(maxGoldByDay(day));
    }
    const coil = rivalBuild("sparkfang", 5).items.filter((p) => p.def === "coil");
    expect(coil.map(starsOf)).toEqual([2, 1]);
    expect(coil.map((p) => hitsOfRig(rivalBuild("sparkfang", 5), p.uid).length)).toEqual([1, 1]);
    const splitters = rivalBuild("lacewing", 3).items.filter((p) => p.def === "splitter");
    expect(splitters.map(starsOf)).toEqual([2, 1]);
    expect(splitters.map((p) => hitsOfRig(rivalBuild("lacewing", 3), p.uid).length)).toEqual([1, 1]);
    expect(rivalBuild("emberlyn", 8).mods).toContainEqual(expect.objectContaining({ def: "drake", turret: 2 }));
  });
});
