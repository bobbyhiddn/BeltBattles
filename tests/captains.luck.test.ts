// 0.6.2 TUNE-C (REQ-BFG-033): named NPC plans grow through the caravan at luck tiers. Stand-ins and Easy/Medium warlords
// are assembled at ORDINARY luck, Hard warlords at GOOD luck, and only the Iron Matriarch gets the stars-aligned deck.
// The caps are measured, not guessed: src/sim/harness/luckCapsData.ts is the par field's P50 (ordinary) and P90 (good)
// of each luck measure per hero-day (tools/luckCaps.ts, `npm run luckcaps`; src/sim/harness/luck.ts). Here every captain
// deck is checked against its tier's caps, every plan part against the caravan (merchant stock and the day its rarity and
// merchant can first ride), and every deck but the Matriarch's against maxGoldByDay (R1).

import { describe, expect, it } from "vitest";
import { ITEMS, rarityWeights, type ItemDef } from "../src/sim/content";
import { RIVALS, RIVAL_IDS, RUN_DAYS, deckCost, difficultyOf, luckOf, maxGoldByDay, rivalBuild, rivalDays, rivalLoadout, standInBuild, type RivalId } from "../src/sim/rivals";
import { LUCKS, PLANS, dayOwned, firstDay, type Luck, type Upgrade } from "../src/sim/rivalBuilds";
import { LUCK_CAPS } from "../src/sim/harness/luckCapsData";
import { LUCK_HEROES, luckMeasures, overCaps, parRunFingerprint, type LuckMeasures } from "../src/sim/harness/luck";
import { legalityProblems, SOLD } from "./rivals.legality";

const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const STAND_INS = RIVAL_IDS.filter((id) => id !== "matriarch");
const capsOf = (id: RivalId, day: number, tier: "ordinary" | "good"): LuckMeasures => LUCK_CAPS.caps[RIVALS[id].hero]![day - 1][tier];

/** The first day the caravan can offer `d` (src/game/run.ts rollShop): its rarity must have weight that day
 *  (content.ts rarityWeights: legendaries from day 4; dayPool holds them back until then too), and its merchant must be
 *  able to ride (run.ts baseMerchantWeight: the ARCANE DEALER from day 3, every other merchant from day 1). */
function firstOfferDay(d: ItemDef): number {
  for (let day = 1; day <= RUN_DAYS; day++) {
    if (!(rarityWeights(day)[d.rarity] > 0)) continue;
    if (d.merchant === "arcane" && day <= 2) continue;
    return day;
  }
  return Infinity;
}

/** The defs an upgrade buys (a star purchase buys another copy of the part). */
function boughtDefs(id: RivalId, u: Upgrade): string[] {
  const out: string[] = [];
  if (u.gate) out.push(u.gate[0]);
  if (u.mod) out.push(u.mod[0]);
  if (u.fuseGate) out.push(u.fuseGate[0]);
  if (u.fuseMod) out.push(u.fuseMod[0]);
  if (u.factory) out.push(u.factory.def);
  if (u.turret) out.push(u.turret[0]);
  if (u.fuseTurret) {
    // the slot's turret on the first day any luck owns the upgrade (a merged starting copy is a bought copy of its def)
    const luck = LUCKS.find((l) => dayOwned(u, l) === firstDay(u))!;
    const t = rivalLoadout(id, firstDay(u), luck).build;
    const def = (t.turrets ?? []).find((x) => x.slot === u.fuseTurret![0])?.def;
    if (def) out.push(def);
  }
  if (u.crates) out.push("beltcrate");
  if (u.plating) out.push("plating");
  return out;
}

describe("the luck caps table (src/sim/harness/luckCapsData.ts)", () => {
  it("is the current par field's: seed 1's par runs still fingerprint as the table says (else run `npm run luckcaps`)", () => {
    for (const hero of LUCK_HEROES) {
      expect(parRunFingerprint(hero), `${hero}: the par player moved since the caps were measured; regenerate with \`npm run luckcaps\``).toBe(LUCK_CAPS.fingerprint[hero]);
    }
  });

  it("has both tiers for every hero-day, good at or above ordinary", () => {
    for (const hero of LUCK_HEROES) {
      const caps = LUCK_CAPS.caps[hero]!;
      expect(caps).toHaveLength(RUN_DAYS);
      caps.forEach((c, i) => {
        for (const k of Object.keys(c.ordinary) as (keyof LuckMeasures)[]) expect(c.good[k], `${hero} d${i + 1} ${k}`).toBeGreaterThanOrEqual(c.ordinary[k]);
        expect(c.good.value, `${hero} d${i + 1}`).toBeLessThanOrEqual(maxGoldByDay(i + 1));
      });
    }
  });
});

describe("captain decks fit their luck tier's caps (REQ-BFG-033)", () => {
  it("the tier comes from the warlord slot: Easy and Medium ordinary, Hard good, the Iron Matriarch stars", () => {
    for (const id of RIVAL_IDS) {
      const want: Luck = id === "matriarch" ? "stars" : difficultyOf(id) === "hard" ? "good" : "ordinary";
      expect(luckOf(id), id).toBe(want);
      for (const day of DAYS) expect(rivalBuild(id, day), `${id} d${day}`).toEqual(rivalLoadout(id, day, want).build);
    }
  });

  it("every captain-day's stand-in deck fits its hero-day's ordinary caps", () => {
    const over: string[] = [];
    for (const id of STAND_INS) for (const day of DAYS) {
      const o = overCaps(luckMeasures(standInBuild(id, day)), capsOf(id, day, "ordinary"));
      if (o.length) over.push(`${id} d${day}: ${o.join(", ")}`);
    }
    expect(over).toEqual([]);
  });

  it("every Easy and Medium warlord deck fits the ordinary caps, every Hard warlord deck the good caps", () => {
    const over: string[] = [];
    for (const id of STAND_INS) for (const day of rivalDays(id)) {
      const tier = difficultyOf(id) === "hard" ? "good" : "ordinary";
      const l = rivalLoadout(id, day);
      // a warlord's hull is the free PvE ramp: its value is what its plan bought (items, gear, turrets, crates, plating)
      const o = overCaps({ ...luckMeasures(l.build), value: l.value }, capsOf(id, day, tier));
      if (o.length) over.push(`${id} d${day} (${tier}): ${o.join(", ")}`);
    }
    expect(over).toEqual([]);
  });

  it("every part a plan buys is caravan stock, bought no earlier than the caravan can first offer it", () => {
    const bad: string[] = [];
    for (const id of RIVAL_IDS) {
      const plan = PLANS[id];
      plan.factories.forEach((f, i) => {
        if (i === 0 && f.def === ({ furnace: "kiln", weaver: "loom" } as Record<string, string>)[plan.hero]) return;
        if (!SOLD.has(f.def)) bad.push(`${id}: day-1 factory ${f.def} is not caravan stock`);
        else if (firstOfferDay(ITEMS[f.def]) > 1) bad.push(`${id}: day-1 factory ${f.def} is first offered on day ${firstOfferDay(ITEMS[f.def])}`);
      });
      for (const u of plan.upgrades) {
        const d = firstDay(u); // the earliest day any luck owns it (better luck may bring it sooner)
        for (const def of boughtDefs(id, u)) {
          if (!SOLD.has(def)) bad.push(`${id} d${d}: ${def} is not caravan stock`);
          else if (d < firstOfferDay(ITEMS[def])) bad.push(`${id} d${d}: ${def} (${ITEMS[def].rarity}, ${ITEMS[def].merchant}) is first offered on day ${firstOfferDay(ITEMS[def])}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("better luck only brings an upgrade sooner: `sooner` days come before `at`, good luck's before the stars'", () => {
    for (const id of RIVAL_IDS) for (const u of PLANS[id].upgrades) {
      const [o, g, s] = LUCKS.map((l) => dayOwned(u, l));
      expect(g, `${id} ${JSON.stringify(u)}`).toBeLessThanOrEqual(o);
      expect(s, `${id} ${JSON.stringify(u)}`).toBeLessThanOrEqual(g);
      if (u.sooner?.good !== undefined) expect(u.sooner.good, `${id} ${JSON.stringify(u)}`).toBeLessThan(u.at);
      if (u.sooner?.stars !== undefined) expect(u.sooner.stars, `${id} ${JSON.stringify(u)}`).toBeLessThan(Math.min(u.at, u.sooner.good ?? Infinity));
    }
  });

  it("the stand-in deck (ordinary luck) is legal and never shrinks: every part keeps its uid, cell and stars on later days", () => {
    for (const id of RIVAL_IDS.filter((x) => x !== "matriarch")) {
      for (let day = 1; day <= RUN_DAYS; day++) {
        const b = standInBuild(id, day);
        expect(legalityProblems(b), `${id} d${day}`).toEqual([]);
        if (day === 1) continue;
        const a = standInBuild(id, day - 1);
        for (const p of [...a.items, ...a.mods]) {
          const next = [...b.items, ...b.mods].find((q) => q.uid === p.uid);
          expect(next, `${id} d${day} uid ${p.uid}`).toMatchObject({ uid: p.uid, def: p.def });
          expect(next!.stars ?? 1, `${id} d${day} uid ${p.uid}`).toBeGreaterThanOrEqual(p.stars ?? 1);
        }
        for (const r of a.routes) expect(b.routes, `${id} d${day}`).toContainEqual(r);
      }
    }
  });

  it("R1: every deck but the Iron Matriarch's costs at most maxGoldByDay(day)", () => {
    for (const id of STAND_INS) for (const day of DAYS) {
      expect(deckCost(standInBuild(id, day)).total, `${id} d${day} stand-in`).toBeLessThanOrEqual(maxGoldByDay(day));
      expect(rivalLoadout(id, day).value, `${id} d${day} warlord`).toBeLessThanOrEqual(maxGoldByDay(day));
    }
  });

  it("captain plans never join belts, and every synergy part is a part the plan buys", () => {
    for (const id of RIVAL_IDS) {
      for (const day of DAYS) for (const r of rivalLoadout(id, day, "stars").build.routes) expect(r.join, `${id} d${day}`).toBeUndefined();
      const bought = new Set(PLANS[id].upgrades.flatMap((u) => boughtDefs(id, u)));
      for (const f of PLANS[id].factories) bought.add(f.def);
      const syn = PLANS[id].synergy ?? [];
      expect(syn.length, `${id} names its synergy parts`).toBeGreaterThan(0);
      for (const def of syn) expect(bought.has(def), `${id}: synergy part ${def}`).toBe(true);
    }
  });
});
