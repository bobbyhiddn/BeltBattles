// 0.6.2 TUNE-C (REQ-BFG-033): named NPC plans grow through the caravan at luck tiers. Stand-ins and Easy/Medium warlords
// are assembled at ORDINARY luck, Hard warlords at GOOD luck, and only the Iron Matriarch gets the stars-aligned deck.
// The caps are measured, not guessed: src/sim/harness/luckCapsData.ts is the par field's P50 (ordinary) and P90 (good)
// of each luck measure per hero-day (tools/luckCaps.ts, `npm run luckcaps`; src/sim/harness/luck.ts). Here every captain
// deck is checked against its tier's caps, every plan part against the caravan (merchant stock and the day its rarity and
// merchant can first ride), and every deck but the Matriarch's against maxGoldByDay (R1).

import { describe, expect, it } from "vitest";
import { HEROES, ITEMS, rarityWeights, type ItemDef } from "../src/sim/content";
import { RIVALS, RIVAL_IDS, RUN_DAYS, deckCost, difficultyOf, luckOf, maxGoldByDay, rivalBuild, rivalDays, rivalLoadout, standInBuild, type RivalId } from "../src/sim/rivals";
import { CAPTAIN_RUNES, LUCKS, PLANS, captainRunesOn, dayOwned, firstDay, roadAllowance, type Luck, type Upgrade } from "../src/sim/rivalBuilds";
import { boughtCost } from "../src/sim/harness/standins"; // FLIP-X2: a captain deck valued as bought
import { maxDawnGold, runeGrants } from "../src/sim/runes"; // FLIP-X2: the runes' dawn gold
import { LUCK_CAPS } from "../src/sim/harness/luckCapsData";
import { LUCK_HEROES, MEASURES, luckMeasures, parRunFingerprint, type LuckMeasures } from "../src/sim/harness/luck";
import { buildCost } from "../src/net/validate";
import { legalityProblems, SOLD } from "./rivals.legality";
import { unlockDay } from "../src/game/wares"; // 0.8.0 I1 M3: the per-run draw's unlock ladder

const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const STAND_INS = RIVAL_IDS.filter((id) => id !== "matriarch");
const capsOf = (id: RivalId, day: number, tier: "ordinary" | "good"): LuckMeasures => LUCK_CAPS.caps[RIVALS[id].hero]![day - 1][tier];
// S8 (REQ-BFG-033, -078; BRIEF-S8 S8 "the double count", BRIEF-AZBUMP S8): the luck caps are regenerated with every switch
// on, so they are measured on the road-fed par field: its counts and value already hold the road. REFIT-AZ's withRoad
// (ROAD(day, moment) on the cap's value, ROADN on its rare, epic and star2) would count the road twice, so the overCaps checks
// read the caps as they are. The budget lines keep roadAllowance (ROAD): maxGoldByDay holds no road income.
// S8 (REQ-BFG-033; RULING-S8-R2 items 2 and 3): THE CEILING LIST. Read so, 31 captain-days are over the regenerated caps (26
// stand-in dusk decks, 5 Hard warlord decks): the road-fed caps after HULL-ON's five, SHAPES-1 and FIT-099's D, below
// REFIT-AZ's cap + ROAD/ROADN; RULING-S8-R2. No captain changes in 0.9.9 (the captain re-plan is on the 1D list). Each entry:
// captain, day, measure, the cap and the measured number at S8. The checks still fail on an over that is not listed, on a
// listed day above its pinned number (or under a lower cap), and on a listed day back under its cap (remove its entry).
type Pinned = readonly [id: RivalId, day: number, measure: keyof LuckMeasures, cap: number, measured: number];
const DUSK_OVERS: readonly Pinned[] = [
  ["nettle", 5, "rare", 3, 4], ["nettle", 6, "rare", 4, 5], ["nettle", 10, "rare", 8, 9],
  ["mothqueen", 2, "value", 22, 26], ["mothqueen", 3, "value", 37, 40], ["mothqueen", 5, "rare", 3, 4], ["mothqueen", 10, "rare", 8, 9],
  ["lacewing", 5, "rare", 3, 4], ["lacewing", 6, "rare", 4, 5], ["lacewing", 7, "rare", 5, 6], ["lacewing", 10, "rare", 8, 9],
  ["emberlyn", 5, "rare", 3, 4], ["emberlyn", 10, "rare", 8, 9],
  ["silkshade", 10, "rare", 8, 9],
  ["longtooth", 8, "value", 124, 129],
  ["highspire", 1, "value", 8, 9], ["highspire", 2, "value", 22, 23], ["highspire", 5, "rare", 3, 4], ["highspire", 6, "rare", 4, 5],
  ["highspire", 7, "value", 108, 109], ["highspire", 10, "rare", 8, 9],
  ["brasswick", 7, "value", 105, 108], ["brasswick", 8, "value", 124, 128],
  ["lockjaw", 8, "value", 124, 125],
  ["thistlemail", 1, "value", 8, 10], ["thistlemail", 2, "value", 22, 23],
];
const WARLORD_OVERS: readonly Pinned[] = [
  ["mothqueen", 10, "rare", 11, 12], ["bulwark", 9, "rare", 9, 10], ["highspire", 10, "rare", 11, 12],
  ["voss", 4, "star2", 2, 3], ["voss", 9, "star2", 4, 5],
];
/** overCaps against the caps, less the ceiling list's pinned overs (see above); a listed day back under its cap is reported. */
const ceilingProblems = (m: LuckMeasures, cap: LuckMeasures, id: RivalId, day: number, list: readonly Pinned[]): string[] => {
  const out: string[] = [];
  for (const k of MEASURES) {
    const p = list.find((e) => e[0] === id && e[1] === day && e[2] === k);
    if (m[k] > cap[k]) {
      if (!p) out.push(`${k} ${m[k]} > ${cap[k]}`);
      else if (m[k] > p[4] || cap[k] < p[3]) out.push(`${k} ${m[k]} > ${cap[k]} (pinned ${p[4]} > ${p[3]}, RULING-S8-R2)`);
    } else if (p) out.push(`${k} ${m[k]} <= ${cap[k]}: back under its cap, remove its ceiling-list entry (RULING-S8-R2)`);
  }
  return out;
};

/** The first day the caravan can offer `d` (src/game/run.ts rollShop): its rarity must have weight that day
 *  (content.ts rarityWeights: legendaries from day 4; dayPool holds them back until then too), its merchant must be
 *  able to ride (run.ts baseMerchantWeight: the ARCANE DEALER from day 3, every other merchant from day 1), and (0.8.0
 *  I1 M3, oracle 983d875df9706e1c) the per-run draw must have unlocked it (wares.ts unlockDay: epics from day 2). */
function firstOfferDay(d: ItemDef): number {
  for (let day = 1; day <= RUN_DAYS; day++) {
    if (!(rarityWeights(day)[d.rarity] > 0)) continue;
    if (d.merchant === "arcane" && day <= 2) continue;
    // 0.8.0 I1 M3 (the per-run draw, DESIGN-wave3.md 4.1; VERIFIED-D1 Q8): no run offers a ware before its unlock day
    // (wares.ts unlockDay: epics from day 2, the ARCANE DEALER from day 3, legendaries from day 4)
    if (d.kind !== "supply" && day < unlockDay(d.id, undefined)) continue;
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

// FLIP-X2 step 6: NUM-3's NUM3_FINGERPRINTS { foundry: f54f92c1 } and its tripwire are removed: the caps are regenerated
// on release X's par field (step 4.4), so every hero's seed-1 run fingerprints as the table says again.

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
        // FLIP-X2 (cap's ruling 97e639e5813acb37, item 4): the par field's decks hold their runes, so the most gold a run can
        // hold at that dusk is maxGoldByDay plus the most dawn gold a legal one-rune-a-dawn list pays by then (runes.ts
        // maxDawnGold; was maxGoldByDay alone)
        // REFIT-AZ: with the NPC day on, plus the road deck's allowance (0 off)
        // S8 (RULING-S8-R2 item 4): ROAD(day, dusk) in place of ROAD(day, warlord), the least allowance that holds. Cause: the
        // regenerated caps are the road-fed par field's DUSK decks, which hold the day's warlord drop (NPC_DAY: REFIT places it
        // before the dusk); ROAD(1, warlord) is 0, so day 1 failed for every hero (good value 13 / 13 / 11 / 13 vs 8 + 2 + 0)
        expect(c.good.value, `${hero} d${i + 1}`).toBeLessThanOrEqual(maxGoldByDay(i + 1) + maxDawnGold(i + 1) + roadAllowance(i + 1, "dusk"));
      });
    }
  });
});

describe("captain decks fit their luck tier's caps (REQ-BFG-033)", () => {
  it("the tier comes from the warlord slot: Easy and Medium ordinary, Hard good, the Iron Matriarch stars", () => {
    for (const id of RIVAL_IDS) {
      const want: Luck = id === "matriarch" ? "stars" : difficultyOf(id) === "hard" ? "good" : "ordinary";
      expect(luckOf(id), id).toBe(want);
      // FLIP-X2 step 5: the road deck holds the captain's pinned runes up to its day (was the loadout's build alone)
      for (const day of DAYS) expect(rivalBuild(id, day), `${id} d${day}`).toEqual(captainRunesOn(rivalLoadout(id, day, want).build, CAPTAIN_RUNES[id], day));
    }
  });

  it("every captain-day's stand-in deck fits its hero-day's ordinary caps", () => {
    const over: string[] = [];
    for (const id of STAND_INS) for (const day of DAYS) {
      const o = ceilingProblems(luckMeasures(standInBuild(id, day)), capsOf(id, day, "ordinary"), id, day, DUSK_OVERS); // S8: the road-fed caps (no withRoad: the double count), less the ceiling list
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
      const o = ceilingProblems({ ...luckMeasures(l.build), value: l.value }, capsOf(id, day, tier), id, day, WARLORD_OVERS); // S8: the road-fed caps (no withRoad: the double count), less the ceiling list
      if (o.length) over.push(`${id} d${day} (${tier}): ${o.join(", ")}`);
    }
    expect(over).toEqual([]);
  });

  it("every part a plan buys is caravan stock, bought no earlier than the caravan can first offer it", () => {
    const bad: string[] = [];
    for (const id of RIVAL_IDS) {
      const plan = PLANS[id];
      plan.factories.forEach((f, i) => {
        // 0.8.0 N1 (oracle 94b9559fbb7da299 (1)): the plan's own hero's signature factory (KILN, LOOM, and now FOUNDRY's
        // CRUCIBLE and BASTION's WARDWORKS) is never caravan stock; it was { furnace: "kiln", weaver: "loom" }
        if (i === 0 && f.def === HEROES[plan.hero].factory) return;
        const at = f.at ?? 1; // 0.8.0 I1 M3: a base factory owned from day `at` (rivalBuilds.ts FactoryPlan.at)
        if (!SOLD.has(f.def)) bad.push(`${id}: day-${at} factory ${f.def} is not caravan stock`);
        else if (firstOfferDay(ITEMS[f.def]) > at) bad.push(`${id}: day-${at} factory ${f.def} is first offered on day ${firstOfferDay(ITEMS[f.def])}`);
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

  // TUNE-C: deckCost counts installed turrets (17df327), as the validator's buildCost does since 0.6.2s (S7); the two
  // must agree, breakdown included, on every captain deck at every luck (the turret-buying plans among them)
  it("deckCost is the validator's buildCost, total and breakdown, on every captain deck (turrets included)", () => {
    let withTurrets = 0;
    for (const id of RIVAL_IDS) for (const day of DAYS) for (const luck of LUCKS) {
      const w = rivalLoadout(id, day, luck).build;
      for (const b of id === "matriarch" ? [w] : [w, standInBuild(id, day)]) {
        expect(deckCost(b), `${id} d${day} ${luck}`).toEqual(buildCost(b));
        if (b.turrets) withTurrets++;
      }
    }
    expect(withTurrets).toBeGreaterThan(0);
  });

  it("R1: every deck but the Iron Matriarch's costs at most maxGoldByDay(day)", () => {
    for (const id of STAND_INS) for (const day of DAYS) {
      // FLIP-X2 (REVIEW-BOTSX section 5): the stand-in holds its runes now, so it is valued as bought (boughtCost: the runes'
      // HULL and BELT out) against the day's gold plus its runes' dawn gold, as validate.ts budgets a deck (was deckCost)
      const s = standInBuild(id, day);
      // REFIT-AZ (REVIEW-PARAZ ruling Q1): with the NPC day on, + the dusk deck's road allowance (0 off)
      expect(boughtCost(s), `${id} d${day} stand-in`).toBeLessThanOrEqual(maxGoldByDay(day) + runeGrants(s.runes, day).gold + roadAllowance(day, "dusk"));
      // FLIP-X2 (cap's ruling 97e639e5813acb37, item 4): the warlord deck (its plan's value) against the day's gold plus
      // the dawn gold of its own runes (CAPTAIN_RUNES up to the day; was maxGoldByDay alone)
      const held = (CAPTAIN_RUNES[id] ?? []).slice(0, day).map((q) => ({ id: q }));
      // REFIT-AZ: with the NPC day on, + the road deck's allowance (0 off)
      expect(rivalLoadout(id, day).value, `${id} d${day} warlord`).toBeLessThanOrEqual(maxGoldByDay(day) + runeGrants(held, day).gold + roadAllowance(day, "warlord"));
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
