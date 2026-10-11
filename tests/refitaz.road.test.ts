// REFIT-AZ (REQ-BFG-078, REQ-BFG-079, REQ-BFG-024; REVIEW-PARAZ ruling Q1; BRIEF-REFIT-AZ "The road allowance" 1-5, step 3a):
// the captains' road allowance, behind NPC_DAY. Every captain deck may hold the par player's road value at the moment it is
// fought (rivalBuilds.ts NPC_ROAD / roadAllowance), spent as road additions (RivalPlan.road, Upgrade.nd) that the captain
// build path (planBuild) reads only with the NPC day on.
// - Off (the default before AZ-BUMP's flip; now set through the setters): every captain's road deck, dusk deck and plan
//   loadout at every luck on days 1-10 equals the base's (parAZ-accepted 5c57914): one digest
//   (kit-refitaz/probes/deckdigest.ts's), pinned below. The allowance is 0.
// - On (every switch, through the setters; put back after each test): every captain-day stays within its budget,
//   maxGoldByDay(day) + its runes' dawn gold + ROAD(day, moment) (the Iron Matriarch outside it, as R1); every deck is legal
//   and never shrinks; every road part is caravan stock, owned no earlier than the caravan can offer it, and an original
//   captain's never a wave-3 part.
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS, isWave3, rarityWeights, type ItemDef } from "../src/sim/content";
import { CAPTAIN_RUNES, LUCKS, NPC_ROAD, PLANS, dayOwned, ndDayOwned, roadAllowance, type Luck, type Upgrade } from "../src/sim/rivalBuilds";
import { RIVAL_IDS, RUN_DAYS, maxGoldByDay, rivalBuild, rivalDays, rivalLoadout, standInBuild } from "../src/sim/rivals";
import { npcDayRules, setNpcDay } from "../src/sim/npcDay";
import { setHullScale } from "../src/sim/hullScale";
import { setLadderFix } from "../src/sim/ladderFix";
import { runeGrants } from "../src/sim/runes";
import { boughtCost } from "../src/sim/harness/standins";
import { legalityProblems, SOLD } from "./rivals.legality";
import { unlockDay } from "../src/game/wares";

afterEach(() => {
  // the shipped value (AZ-BUMP's flip); the off test sets every switch off itself
  setNpcDay(true);
  setHullScale(true);
  setLadderFix(true);
});
const allOn = (): void => {
  setHullScale(true);
  setNpcDay(true);
  setLadderFix(true);
};

const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const STAND_INS = RIVAL_IDS.filter((id) => id !== "matriarch");

/** kit-refitaz/probes/deckdigest.ts: every captain-day's road deck, dusk deck and loadout at each luck, hashed in order. */
function deckDigest(): string {
  const h = createHash("sha256");
  for (const id of RIVAL_IDS) for (const day of DAYS) {
    h.update(JSON.stringify([id, day, rivalBuild(id, day), id === "matriarch" ? null : standInBuild(id, day), ...LUCKS.map((l) => rivalLoadout(id, day, l))]) + "\n");
  }
  return h.digest("hex").slice(0, 16);
}
/** The base's digest with every switch off: parAZ-accepted 5c57914 (kit-refitaz/probe1.sh deckdigest parAZ-accepted). */
const BASE_DIGEST_OFF = "3b4f48c519581dc8";

/** tests/captains.luck.test.ts's firstOfferDay: the first day the caravan can offer `d`. */
function firstOfferDay(d: ItemDef): number {
  for (let day = 1; day <= RUN_DAYS; day++) {
    if (!(rarityWeights(day)[d.rarity] > 0)) continue;
    if (d.merchant === "arcane" && day <= 2) continue;
    if (d.kind !== "supply" && day < unlockDay(d.id, undefined)) continue;
    return day;
  }
  return Infinity;
}
const defsOf = (u: Upgrade): string[] => [u.gate?.[0], u.mod?.[0], u.fuseGate?.[0], u.fuseMod?.[0], u.factory?.def, u.turret?.[0], u.crates ? "beltcrate" : undefined, u.plating ? "plating" : undefined].filter((x): x is string => !!x);
/** BASE's 13 captains: none holds a wave-3 part (content.ts isWave3; tests/wave3.content's warlord clause). */
const ORIGINAL = ["sootjaw", "nettle", "grubnose", "mothqueen", "sparkfang", "lacewing", "ratchet", "emberlyn", "bulwark", "silkshade", "longtooth", "highspire", "matriarch"];

describe("REFIT-AZ: the road allowance, behind NPC_DAY", () => {
  it("off: every captain's road deck, dusk deck and loadout on days 1-10 is the base's (digest), and the allowance is 0", () => {
    // AZ-BUMP (the flip): the switches ship on, so the off test sets them off itself: NPC_DAY (the road additions), and
    // HULL_SCALE and LADDER_FIX too, as BASE_DIGEST_OFF was taken with every switch off (HULL_SCALE's gold table moves
    // maxGoldByDay from day 8, and with it the captains' gold levels, rivalBuilds.ts planBuild's room)
    setNpcDay(false);
    setHullScale(false);
    setLadderFix(false);
    expect(npcDayRules()).toBe(false);
    expect(deckDigest()).toBe(BASE_DIGEST_OFF);
    for (const day of DAYS) for (const m of ["warlord", "dusk"] as const) expect(roadAllowance(day, m)).toBe(0);
  });

  it("the table: whole gold, never falling, the dusk deck's at or above the road deck's, day 1's road deck 0", () => {
    for (const m of ["warlord", "dusk"] as const) {
      expect(NPC_ROAD[m]).toHaveLength(RUN_DAYS);
      NPC_ROAD[m].forEach((g, i) => {
        expect(Number.isInteger(g) && g >= 0, `${m} d${i + 1}`).toBe(true);
        if (i) expect(g, `${m} d${i + 1}`).toBeGreaterThanOrEqual(NPC_ROAD[m][i - 1]);
        expect(NPC_ROAD.dusk[i], `d${i + 1}`).toBeGreaterThanOrEqual(NPC_ROAD.warlord[i]);
      });
    }
    expect(NPC_ROAD.warlord[0]).toBe(0);
    allOn();
    for (const day of DAYS) for (const m of ["warlord", "dusk"] as const) expect(roadAllowance(day, m)).toBe(NPC_ROAD[m][day - 1]);
  });

  it("on: every captain-day within maxGoldByDay + its runes' dawn gold + ROAD(day, moment) (the Iron Matriarch outside, as R1)", () => {
    allOn();
    const over: string[] = [];
    for (const id of STAND_INS) for (const day of DAYS) {
      const s = standInBuild(id, day);
      const sb = maxGoldByDay(day) + runeGrants(s.runes, day).gold + roadAllowance(day, "dusk");
      if (boughtCost(s) > sb) over.push(`${id} d${day} dusk deck ${boughtCost(s)} > ${sb}`);
      const held = (CAPTAIN_RUNES[id] ?? []).slice(0, day).map((q) => ({ id: q }));
      const wb = maxGoldByDay(day) + runeGrants(held, day).gold + roadAllowance(day, "warlord");
      if (rivalLoadout(id, day).value > wb) over.push(`${id} d${day} road deck ${rivalLoadout(id, day).value} > ${wb}`);
    }
    expect(over).toEqual([]);
  });

  it("on: every deck is legal and never shrinks (every part keeps its uid, def and stars on later days)", () => {
    allOn();
    for (const id of RIVAL_IDS) {
      const kinds: [string, (day: number) => import("../src/sim/deck").Build][] = [["road", (d) => rivalBuild(id, d)]];
      if (id !== "matriarch") kinds.push(["dusk", (d) => standInBuild(id, d)]);
      for (const [kind, deck] of kinds) {
        const days = kind === "road" ? rivalDays(id) : DAYS;
        for (const day of days) {
          const b = deck(day);
          expect(legalityProblems(b), `${id} ${kind} d${day}`).toEqual([]);
          if (day === days[0]) continue;
          const a = deck(day - 1);
          for (const p of [...a.items, ...a.mods]) {
            const next = [...b.items, ...b.mods].find((q) => q.uid === p.uid);
            expect(next, `${id} ${kind} d${day} uid ${p.uid}`).toMatchObject({ uid: p.uid, def: p.def });
            expect(next!.stars ?? 1, `${id} ${kind} d${day} uid ${p.uid}`).toBeGreaterThanOrEqual(p.stars ?? 1);
          }
        }
      }
    }
  });

  it("every road addition is caravan stock, owned no earlier than the caravan can offer it (an original captain: no wave-3 part)", () => {
    const bad: string[] = [];
    for (const id of RIVAL_IDS) {
      const plan = PLANS[id];
      const entries: [Upgrade, number][] = [];
      for (const u of plan.road ?? []) entries.push([u, Math.min(...LUCKS.map((l) => dayOwned(u, l)))]);
      for (const u of plan.upgrades) if (u.nd) entries.push([u, Math.min(...LUCKS.flatMap((l: Luck) => [ndDayOwned(u, l, "warlord"), ndDayOwned(u, l, "dusk")]))]);
      for (const [u, d] of entries) for (const def of defsOf(u)) {
        if (!SOLD.has(def)) bad.push(`${id} d${d}: ${def} is not caravan stock`);
        else if (d < firstOfferDay(ITEMS[def])) bad.push(`${id} d${d}: ${def} is first offered on day ${firstOfferDay(ITEMS[def])}`);
        if (ORIGINAL.includes(id) && isWave3(def)) bad.push(`${id}: ${def} is a wave-3 part`);
      }
    }
    expect(bad).toEqual([]);
  });
});
