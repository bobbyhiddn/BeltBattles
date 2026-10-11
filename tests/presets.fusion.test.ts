import { describe, expect, it } from "vitest";
import { warlordBuild } from "../src/sim/ai";
import { hitsOfRig, hullSlots } from "../src/sim/deck";
import { ITEMS, type HeroId } from "../src/sim/content";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { buildCost, unfusedPairs, validateBuild } from "../src/net/validate";
import { RIVAL_IDS, deckCost, honestReference, luckOf, maxGoldByDay, rivalBuild, rivalLoadout, standInBuild } from "../src/sim/rivals";
import { CAPTAIN_RUNES, PLANS, dayOwned, roadAllowance } from "../src/sim/rivalBuilds"; // AZ-BUMP: the road allowance
import { withNpcDay } from "../src/sim/npcDay"; // AZ-BUMP (the flip): the plan's own purchases with NPC_DAY off
import { boughtCost } from "../src/sim/harness/standins"; // FLIP-X2: a captain deck valued as bought
import { runeGrants } from "../src/sim/runes"; // FLIP-X2: the runes' dawn gold
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
        // AZ-BUMP (the flip, NPC_DAY): the strict validator budgets the shop's gold and the runes' dawn gold only, while the
        // dusk deck may also hold REFIT-AZ's road additions (ROAD(day, "dusk"), the budget line below): with the NPC day on
        // every other check passes; the whole check passes the road-less deck (NPC_DAY off); refitaz.road checks the on decks
        expect(validateBuild(standIn, day).errors.filter((e) => !e.startsWith("budget:")), label).toEqual([]);
        withNpcDay(() => expect(validateBuild(standInBuild(id, day), day), label).toMatchObject({ ok: true, errors: [] }), false);
        // FLIP-X2 (REVIEW-BOTSX section 5): the stand-in holds its runes, so it is valued as bought against the day's gold
        // plus its runes' dawn gold (was deckCost against maxGoldByDay)
        // AZ-BUMP (the flip, NPC_DAY): + the dusk deck's road allowance (roadAllowance, 0 off), as captains.luck's R1
        expect(boughtCost(standIn), label).toBeLessThanOrEqual(maxGoldByDay(day) + runeGrants(standIn.runes, day).gold + roadAllowance(day, "dusk"));
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
      // FLIP-X2: the list planBuild walks with the sustain switch on: the plan's upgrades, then its sustain upgrades
      // (BOTS-X), less the sustainDrop rigs (THANE KARSK's GALVANIC COIL for his WARD BELL; was plan.upgrades alone)
      const turretDef = new Map<number, string>();
      const drop = plan.sustainDrop ?? [];
      const ups = [...plan.upgrades, ...(plan.sustain ?? [])]
        .filter((u) => !(u.gate && drop.some(([d, x, y]) => u.gate![0] === d && u.gate![1] === x && u.gate![2] === y)));
      for (const u of ups.filter((u) => dayOwned(u, luckOf(id)) <= day)) {
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
      // AZ-BUMP (the flip, NPC_DAY): the purchases above are the plan's own (REFIT-AZ's road list is owned only with the NPC
      // day on), so they are the value of the road-less deck, read with NPC_DAY off; refitaz.road checks the on decks
      const l = withNpcDay(() => rivalLoadout(id, day), false);
      // bb-0.8.3 (REQ-BFG-043 D10, D7'): the value counts the gold upgrades too (rivalBuilds.ts captainLevels, the uniform
      // rule), as every sum of value does (stars.ts upgradeGold)
      paid += upgradeGold(l.build);
      expect(l.value, `${id} day ${day} purchases`).toBe(paid);
      // FLIP-X2 (cap's ruling 97e639e5813acb37, item 4): plus the dawn gold of the captain's own runes by that day
      const held = (CAPTAIN_RUNES[id] ?? []).slice(0, day).map((q) => ({ id: q }));
      // AZ-BUMP (the flip, NPC_DAY): the shipped deck, its road additions in, + the road deck's allowance (roadAllowance, 0
      // off), as captains.luck's R1
      if (id !== "matriarch") expect(rivalLoadout(id, day).value, `${id} day ${day} budget`).toBeLessThanOrEqual(maxGoldByDay(day) + runeGrants(held, day).gold + roadAllowance(day, "warlord"));
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
