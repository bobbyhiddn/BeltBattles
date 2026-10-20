// 0.6.2 TUNE-C (REQ-BFG-033): named NPC plans grow through the caravan at luck tiers. Stand-ins and Easy/Medium warlords
// are assembled at ORDINARY luck, Hard warlords at GOOD luck, and only the Iron Matriarch gets the stars-aligned deck.
// The caps are measured, not guessed: src/sim/harness/luckCapsData.ts is the par field's P50 (ordinary) and P90 (good)
// of each luck measure per hero-day (tools/luckCaps.ts, `npm run luckcaps`; src/sim/harness/luck.ts). Here every captain
// deck is checked against its tier's caps, every plan part against the caravan (merchant stock and the day its rarity and
// merchant can first ride), and every deck but the Matriarch's against maxGoldByDay (R1).
//
// BUMP-1D (the 10-wins rules release, bb-0.11.0; RULING-BUMP-R2 R2.3 Q4): luckCapsData.ts is REGENERATED for the new par field (npm run
// luckcaps with every switch on: the par player plays the grown catalogue, the twelve new pieces of PLAIN_RIGS and SHAPES2, ELBOW
// GUARD's DMG row and RASP at 4 G; the seed-1 fingerprints furnace 8ffb1f71 -> 0b23dc4e, weaver 3df8d5a7 -> 883c7bee, foundry
// 080c2660 -> 4dd85c9f, bastion 98bbc65c -> 6d397e0a). NO CAPTAIN WAS RETUNED IN BUMP-1D: rivalBuilds.ts (the plans) is untouched,
// no plan buys a piece the release changed (RASP, NAIL STRIP, SPIKE RAIL, ELBOW GUARD), and rivals.ts only carries RUN-1's schedule past
// day 10, so every captain deck is what 0.9.10 shipped. The ceiling lists below, and the one good-value bound, are re-keyed to the
// same decks' overshoots of the moved caps, each change with a "BUMP-1D: was ..." trail. BUMP-1E may retune the captains against the
// new caps (the stand-in ladder is re-read there too); it then drops the entries it fixes: a listed day back under its cap fails.

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
import { withNpcWords } from "../src/sim/npcWords"; // BUMP-1F (RULING-BUMP1F-R3.1, ENCHANT-2): the rivals' own words, off for the plan comparison

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
// BUMP-1D (RULING-BUMP-R2 R2.3 Q4): THE CEILING LISTS, RE-KEYED to the regenerated caps. The same captain decks, read against the
// caps of the 10-wins release's par field, are over on 30 captain-days (23 stand-in dusk decks, 7 Hard warlord decks; was 31 = 26 + 5).
// Each list below is that exact set. The checks fail as at S8: on an over that is not listed, on a listed day above its pinned number
// (or under a lower cap), and on a listed day back under its cap. A pinned number is what the deck measures: every "was" cap below is
// S8's, and every re-keyed entry's measured number is S8's (the captain is the same).
type Pinned = readonly [id: RivalId, day: number, measure: keyof LuckMeasures, cap: number, measured: number];
// BUMP-1D: the 23 dusk entries, against S8's 26. UNCHANGED, cap and number (8): nettle d5 and d6 rare, mothqueen d5 rare, lacewing d5 and
// d6 rare, emberlyn d5 rare, highspire d5 and d6 rare. NEW (9): sootjaw, grubnose, sparkfang and longtooth d6 rare 5 > 4 (FURNACE's d6
// rare cap was 5); nettle, highspire and thistlemail d6 value 88 / 89 / 87 > 86 (WEAVER's d6 value cap was 89); lacewing and highspire
// d8 value 128 > 126 (WEAVER's d8 value cap was 130). RE-KEYED to the new cap (6): mothqueen d2 value cap 22 -> 24 and d3 value 37 -> 38,
// highspire d7 value 108 -> 106, brasswick d7 value 105 -> 106 and d8 value 124 -> 125, thistlemail d1 value 8 -> 9. REMOVED (12), back
// under their caps: d10 rare of nettle, mothqueen, lacewing, emberlyn, silkshade and highspire (WEAVER's d10 rare cap 8 -> 9) and
// lacewing d7 rare (WEAVER's d7 rare cap 5 -> 6); longtooth d8 value and lockjaw d8 value (FURNACE's d8 value cap 124 -> 130);
// highspire d1 value (WEAVER's d1 value cap 8 -> 9); highspire d2 and thistlemail d2 value (WEAVER's d2 value cap 22 -> 24).
// BUMP-1E (the scaling release, bb-0.12.0; RULING-BUMP1E-R2 R2.4): THE CEILING LISTS, RE-KEYED to the table `npm run luckcaps` writes at
// bb-0.12.0 (luckCapsData.ts regenerated: the par player now buys the seven new rigs too; fingerprints furnace 0b23dc4e -> c8b37a88, weaver
// 883c7bee -> ece71b36, foundry 4dd85c9f -> 757b201f, bastion 6d397e0a -> 1555829e). NO CAPTAIN WAS RETUNED IN BUMP-1E (the plans are
// BUMP-1D's; a re-plan after the freeze would change numbers the generators read). Read so, the same decks are over on 34 captain-days (31
// stand-in dusk decks, 3 Hard warlord decks; was 30 = 23 + 7); the dry export of the frozen content read the same (REPORT section 5). Each
// change below carries a "BUMP-1E: was ..." trail. DUSK: NEW (10): nettle d10, mothqueen d10, lacewing d7 and d10, emberlyn d10, silkshade d10,
// highspire d1, d2 and d10 (rare 9 > 8 / 6 > 5; value 9 > 8 / 23 > 21) and thistlemail d2 (value 23 > 21); RE-KEYED to the new cap (3): mothqueen
// d2 value 24 -> 21 and d3 value 38 -> 37, thistlemail d1 value 9 -> 8 (WEAVER's d1-d3 caps fell back); REMOVED (2), back under their caps:
// nettle d6 and thistlemail d6 value (WEAVER's d6 value cap 86 -> 88).
// BUMP-1F (REPORT R4.4: luckCapsData.ts regenerated at 5fe7ea8 with GATES and ENCHANT on, the par player buys converters and words and so fewer rares; standing ruling 11: capsearch is
// report only, no captain is re-planned in this release; RULING-BUMP1E-R2 R2.4's way): THE CEILING LISTS, RE-KEYED to the table `npm run luckcaps` writes at bb-0.13.0 (seed-1 fingerprints
// furnace c8b37a88 -> 7d70927e, weaver ece71b36 -> c3f09a72, foundry 757b201f -> b37d27e3, bastion 1555829e -> 41d27c36). The same decks, read against the new caps, are over on 94
// stand-in captain-days (135 measure entries: rare 72, value 61, epic 2; was 31 captain-days, 31 entries, BUMP-1E's list above) and on 26 warlord captain-days (was 3). Each list below is the
// exact set the test computes now, measured at this tree: [captain, day, measure, the cap, the number]; the checks still fail on an over that is not listed, on a listed day above its pinned number
// (or under a lower cap) and on a listed day back under its cap. The BUMP-1D and BUMP-1E trails above describe the lists these replace.
const DUSK_OVERS: readonly Pinned[] = [
  ["sootjaw", 4, "rare", 2, 3], ["sootjaw", 6, "rare", 4, 5], ["sootjaw", 7, "value", 98, 102], ["sootjaw", 7, "rare", 4, 5], ["sootjaw", 8, "value", 117, 122], ["sootjaw", 8, "rare", 5, 6], ["sootjaw", 9, "value", 134, 140], ["sootjaw", 9, "rare", 6, 7], ["sootjaw", 10, "value", 155, 162], ["sootjaw", 10, "rare", 6, 8],
  ["nettle", 5, "rare", 3, 4], ["nettle", 6, "value", 79, 88], ["nettle", 6, "rare", 4, 5], ["nettle", 6, "epic", 0, 1], ["nettle", 7, "value", 94, 98], ["nettle", 7, "rare", 4, 5], ["nettle", 8, "rare", 5, 6], ["nettle", 9, "rare", 6, 7], ["nettle", 10, "value", 156, 158], ["nettle", 10, "rare", 7, 9],
  ["grubnose", 4, "rare", 2, 3], ["grubnose", 5, "rare", 3, 4], ["grubnose", 6, "rare", 4, 5], ["grubnose", 7, "rare", 4, 5], ["grubnose", 8, "rare", 5, 6], ["grubnose", 9, "rare", 6, 7], ["grubnose", 10, "value", 155, 156], ["grubnose", 10, "rare", 6, 8],
  ["mothqueen", 2, "value", 23, 26], ["mothqueen", 3, "value", 33, 40], ["mothqueen", 5, "value", 61, 63], ["mothqueen", 5, "rare", 3, 4], ["mothqueen", 6, "value", 79, 82], ["mothqueen", 7, "value", 94, 99], ["mothqueen", 7, "rare", 4, 5], ["mothqueen", 8, "rare", 5, 6], ["mothqueen", 9, "rare", 6, 7], ["mothqueen", 10, "value", 156, 165], ["mothqueen", 10, "rare", 7, 9],
  ["sparkfang", 4, "rare", 2, 3], ["sparkfang", 5, "rare", 3, 4], ["sparkfang", 6, "rare", 4, 5], ["sparkfang", 7, "rare", 4, 5], ["sparkfang", 8, "rare", 5, 6], ["sparkfang", 9, "value", 134, 138], ["sparkfang", 9, "rare", 6, 7], ["sparkfang", 10, "value", 155, 158], ["sparkfang", 10, "rare", 6, 8],
  ["lacewing", 5, "value", 61, 65], ["lacewing", 5, "rare", 3, 4], ["lacewing", 6, "value", 79, 85], ["lacewing", 6, "rare", 4, 5], ["lacewing", 7, "value", 94, 102], ["lacewing", 7, "rare", 4, 6], ["lacewing", 8, "value", 118, 128], ["lacewing", 8, "rare", 5, 6], ["lacewing", 9, "value", 134, 142], ["lacewing", 9, "rare", 6, 7], ["lacewing", 10, "value", 156, 165], ["lacewing", 10, "rare", 7, 9],
  ["ratchet", 4, "rare", 2, 3], ["ratchet", 9, "value", 134, 136], ["ratchet", 10, "value", 155, 156], ["ratchet", 10, "rare", 6, 7],
  ["emberlyn", 5, "value", 61, 64], ["emberlyn", 5, "rare", 3, 4], ["emberlyn", 6, "value", 79, 82], ["emberlyn", 7, "value", 94, 103], ["emberlyn", 7, "rare", 4, 5], ["emberlyn", 8, "value", 118, 120], ["emberlyn", 8, "rare", 5, 6], ["emberlyn", 9, "rare", 6, 7], ["emberlyn", 10, "value", 156, 161], ["emberlyn", 10, "rare", 7, 9],
  ["bulwark", 4, "rare", 2, 3], ["bulwark", 9, "rare", 6, 7], ["bulwark", 10, "value", 155, 156], ["bulwark", 10, "rare", 6, 8],
  ["silkshade", 6, "value", 79, 83], ["silkshade", 7, "value", 94, 99], ["silkshade", 8, "rare", 5, 6], ["silkshade", 9, "rare", 6, 7], ["silkshade", 10, "value", 156, 160], ["silkshade", 10, "rare", 7, 9],
  ["longtooth", 4, "rare", 2, 3], ["longtooth", 5, "rare", 3, 4], ["longtooth", 6, "rare", 4, 5], ["longtooth", 7, "rare", 4, 5], ["longtooth", 8, "value", 117, 129], ["longtooth", 8, "rare", 5, 6], ["longtooth", 9, "value", 134, 138], ["longtooth", 9, "rare", 6, 7], ["longtooth", 10, "value", 155, 161], ["longtooth", 10, "rare", 6, 8],
  ["highspire", 1, "value", 8, 9], ["highspire", 5, "value", 61, 64], ["highspire", 5, "rare", 3, 4], ["highspire", 6, "value", 79, 89], ["highspire", 6, "rare", 4, 5], ["highspire", 6, "epic", 0, 1], ["highspire", 7, "value", 94, 109], ["highspire", 7, "rare", 4, 5], ["highspire", 8, "value", 118, 128], ["highspire", 8, "rare", 5, 6], ["highspire", 9, "value", 134, 137], ["highspire", 9, "rare", 6, 7], ["highspire", 10, "value", 156, 165], ["highspire", 10, "rare", 7, 9],
  ["brasswick", 7, "value", 96, 108], ["brasswick", 8, "value", 117, 128], ["brasswick", 9, "value", 135, 144], ["brasswick", 10, "value", 158, 164],
  ["voss", 5, "rare", 3, 4], ["voss", 7, "value", 96, 101], ["voss", 8, "value", 117, 124], ["voss", 9, "rare", 6, 7], ["voss", 10, "rare", 7, 8],
  ["karsk", 2, "value", 21, 22], ["karsk", 7, "value", 95, 100], ["karsk", 8, "value", 114, 121],
  ["lockjaw", 4, "rare", 2, 3], ["lockjaw", 8, "value", 117, 125], ["lockjaw", 9, "value", 134, 137], ["lockjaw", 10, "value", 155, 166], ["lockjaw", 10, "rare", 6, 7],
  ["thistlemail", 1, "value", 8, 10], ["thistlemail", 5, "value", 61, 63], ["thistlemail", 6, "value", 79, 87], ["thistlemail", 7, "value", 94, 106], ["thistlemail", 7, "rare", 4, 5], ["thistlemail", 8, "value", 118, 119], ["thistlemail", 8, "rare", 5, 6], ["thistlemail", 9, "value", 134, 135], ["thistlemail", 9, "rare", 6, 7], ["thistlemail", 10, "rare", 7, 8],
];
// BUMP-1D: the 7 warlord entries, against S8's 5. UNCHANGED (4): mothqueen d10 rare, bulwark d9 rare, highspire d10 rare, voss d4 star2.
// NEW (3): silkshade d4 star2 3 > 2 and d6 star2 4 > 3, highspire d6 star2 4 > 3 (WEAVER's good star2 cap was 3 on d4 and 4 on d6).
// REMOVED (1): voss d9 star2 (4, 5), back under its cap (FOUNDRY's good d9 star2 cap 4 -> 5).
// BUMP-1E (RULING-BUMP1E-R2 R2.4): the 3 warlord entries, against BUMP-1D's 7. UNCHANGED (2): bulwark d9 rare, voss d4 star2. NEW (1): bulwark d8
// star2 5 > 4 (FOUNDRY's good d8 star2 cap is 4). REMOVED (5), back under their caps: mothqueen d10 rare and highspire d10 rare (WEAVER's good d10
// rare cap 11 -> 12), silkshade d4 star2, silkshade d6 star2 and highspire d6 star2 (WEAVER's good star2 caps 2 -> 3 on d4, 3 -> 4 on d6).
// BUMP-1F (REPORT R4.4, as DUSK_OVERS above): the warlord entries, RE-KEYED to the bb-0.13.0 caps: 26 captain-days over (rare 22: 14 on the good caps, 8 on the ordinary; star2 3; epic 1), was 3
// (bulwark d9 rare, voss d4 star2 and bulwark d8 star2 stay as they were; 23 are new).
const WARLORD_OVERS: readonly Pinned[] = [
  ["sootjaw", 4, "rare", 2, 3],
  ["nettle", 6, "epic", 0, 1],
  ["grubnose", 4, "rare", 2, 3], ["grubnose", 10, "rare", 6, 7],
  ["mothqueen", 7, "rare", 6, 7], ["mothqueen", 8, "rare", 7, 8], ["mothqueen", 9, "rare", 8, 10], ["mothqueen", 10, "rare", 9, 12],
  ["sparkfang", 4, "rare", 2, 3],
  ["ratchet", 4, "rare", 2, 3], ["ratchet", 10, "rare", 6, 7],
  ["bulwark", 8, "star2", 4, 5], ["bulwark", 9, "rare", 9, 10],
  ["silkshade", 4, "star2", 2, 3], ["silkshade", 7, "rare", 6, 7], ["silkshade", 8, "rare", 7, 8], ["silkshade", 10, "rare", 9, 10],
  ["highspire", 6, "rare", 6, 7], ["highspire", 7, "rare", 6, 8], ["highspire", 8, "rare", 7, 9], ["highspire", 9, "rare", 8, 10], ["highspire", 10, "rare", 9, 12],
  ["voss", 4, "star2", 2, 3], ["voss", 10, "rare", 9, 11],
  ["lockjaw", 4, "rare", 2, 3], ["lockjaw", 10, "rare", 6, 7],
];
// BUMP-1D (RULING-BUMP-R2 R2.3 Q4): the day-1 good values over the table bound below (`has both tiers`): [hero, day, bound, measured
// good value]. Was: no entry (every hero-day's good value at or under maxGoldByDay + maxDawnGold + ROAD(day, dusk)). The checks fail
// as the ceiling lists': on an over that is not listed, above a pinned number (or under a lower bound), and back inside the bound.
const GOOD_VALUE_OVERS: readonly (readonly [hero: string, day: number, bound: number, measured: number])[] = [
  ["furnace", 1, 13, 14], // BUMP-1D: new (their day-1 good value was 13 and 13, the bound exactly). BUMP-1F (REPORT R4.4, the regenerated caps): was ["furnace", 1, 13, 14], ["weaver", 1, 13, 14]; weaver d1's good value 13 <= 13 is back inside its bound (the test says so), its entry leaves
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
    const over: string[] = []; // BUMP-1D: the good-value bound's problems, less GOOD_VALUE_OVERS (was an expect per hero-day)
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
        // BUMP-1D (RULING-BUMP-R2 R2.3 Q4): was `expect(c.good.value, `${hero} d${i + 1}`).toBeLessThanOrEqual(bound)` for every
        // hero-day. The regenerated caps put exactly two hero-days over it, FURNACE's and WEAVER's day 1 (good value 14 against
        // 8 + 2 + 3 = 13; was 13 and 13, the bound exactly), so those two are pinned (GOOD_VALUE_OVERS) and every other hero-day
        // still has to fit. The bound adds the MEDIAN road value (ROAD) to a P90 cap, so the thinnest day (the 8 g start) is the one
        // that gives; from day 2 on every good value keeps a margin of 4 or more (day 2: 29 / 29 / 27 / 29 against 33).
        const bound = maxGoldByDay(i + 1) + maxDawnGold(i + 1) + roadAllowance(i + 1, "dusk");
        const p = GOOD_VALUE_OVERS.find((e) => e[0] === hero && e[1] === i + 1);
        if (c.good.value > bound) {
          if (!p) over.push(`${hero} d${i + 1}: good value ${c.good.value} > ${bound}`);
          else if (c.good.value > p[3] || bound < p[2]) over.push(`${hero} d${i + 1}: good value ${c.good.value} > ${bound} (pinned ${p[3]} > ${p[2]}, BUMP-1D)`);
        } else if (p) over.push(`${hero} d${i + 1}: good value ${c.good.value} <= ${bound}: back inside its bound, remove its GOOD_VALUE_OVERS entry (BUMP-1D)`);
      });
    }
    expect(over).toEqual([]);
  });
});

describe("captain decks fit their luck tier's caps (REQ-BFG-033)", () => {
  it("the tier comes from the warlord slot: Easy and Medium ordinary, Hard good, the Iron Matriarch stars", () => {
    for (const id of RIVAL_IDS) {
      const want: Luck = id === "matriarch" ? "stars" : difficultyOf(id) === "hard" ? "good" : "ordinary";
      expect(luckOf(id), id).toBe(want);
      // FLIP-X2 step 5: the road deck holds the captain's pinned runes up to its day (was the loadout's build alone)
      // BUMP-1F (RULING-BUMP1F-R3.1, ENCHANT-2; REPORT R4.4): the road deck is read without the rival's own words (withNpcWords false; was rivalBuild(id, day) as it stands): from day 5 it carries
      // the captain's word (sootjaw d5: `ench: "fiery"` on a TEMPER, npcWords.ts captainWordsOn) and the loadout the test compares it with is the wordless plan
      for (const day of DAYS) expect(withNpcWords(() => rivalBuild(id, day), false), `${id} d${day}`).toEqual(captainRunesOn(rivalLoadout(id, day, want).build, CAPTAIN_RUNES[id], day));
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
