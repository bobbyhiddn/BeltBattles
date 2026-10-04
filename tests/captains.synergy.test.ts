// 0.6.2 TUNE-C (REQ-BFG-024; ref/BRIEF-final-062-captains.md section 3 item 5): the synergy check's swaps. Every named
// build lists its synergy parts (RivalPlan.synergy); src/sim/harness/synergy.ts swaps them for off-plan parts of the same
// cost in the same slots, keeping the deck legal, and tools/parBench.ts --synergy fights the swapped decks against the par
// field. Here: the swapped decks are what the check says they are (the battles are the bench's).

import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { RIVALS, RIVAL_IDS, deckCost, luckOf, rivalBuild, standInBuild, type RivalId } from "../src/sim/rivals";
import { LUCK_CAPS } from "../src/sim/harness/luckCapsData"; // bb-0.8.3 (oracle 512f23ac589b2482 (1)): captains.luck's cap reader
import { luckMeasures, overCaps } from "../src/sim/harness/luck";
import { PLANS, dayOwned, type RivalPlan } from "../src/sim/rivalBuilds";
import { firstOfferDay, planDefs, swapCandidates, swapLegal, synergySwap } from "../src/sim/harness/synergy";
import { starsOf } from "../src/sim/stars";

/** The check's decks: the 12 stand-in captains' named dusk builds on days 5 and 9, the Iron Matriarch's warlord deck on
 *  day 10 (parBench --synergy's defaults). */
const CASES: { id: RivalId; day: number; pve: boolean }[] = [
  ...RIVAL_IDS.filter((id) => id !== "matriarch").flatMap((id) => [5, 9].map((day) => ({ id, day, pve: false }))),
  { id: "matriarch", day: 10, pve: true },
];
const deckOf = (c: { id: RivalId; day: number; pve: boolean }) => (c.pve ? rivalBuild(c.id, c.day) : standInBuild(c.id, c.day));

/** The defs the plan's ORDINARY-luck decks ever own: its base factories and every upgrade ordinary luck owns. */
function ordinaryDefs(plan: RivalPlan): Set<string> {
  const out = new Set(plan.factories.map((f) => f.def));
  for (const u of plan.upgrades) {
    if (dayOwned(u, "ordinary") === Infinity) continue;
    for (const d of [u.gate?.[0], u.mod?.[0], u.fuseGate?.[0], u.fuseMod?.[0], u.factory?.def, u.turret?.[0]]) if (d) out.add(d);
  }
  return out;
}
const defsIn = (b: Build) => new Set([...b.items, ...b.mods].map((p) => p.def));

/**
 * bb-0.8.3 (oracle 512f23ac589b2482 (1)): could captain `id`'s ordinary-luck cap hold synergy part `def`? Add it to the
 * day-9 stand-in deck (a rig or factory as an item, gear or a core as a mod) and read the deck against the day's ordinary
 * cap with captains.luck's own reader (LUCK_CAPS, luckMeasures, overCaps).
 */
function ordinaryCouldHold(id: RivalId, def: string): boolean {
  const b = standInBuild(id, 9), kind = ITEMS[def].kind;
  const extended: Build = kind === "mod" || kind === "core"
    ? { ...b, mods: [...b.mods, { uid: 99999, def, turret: 0 }] }
    : { ...b, items: [...b.items, { uid: 99999, def, x: 0, y: 0 }] };
  if (kind === "turret") throw new Error(`ordinaryCouldHold: ${def} is a turret (no synergy part is one)`);
  return overCaps(luckMeasures(extended), LUCK_CAPS.caps[RIVALS[id].hero]![8].ordinary).length === 0;
}

describe("the synergy check's swaps (harness/synergy.ts)", () => {
  // 0.8.0 N1 (oracle 94b9559fbb7da299 (10)): each synergy part is checked on the deck of the luck that buys it. A part the
  // ordinary-luck plan buys is on the stand-in deck (standInBuild) by day 9; a part bought only at good luck (at most one
  // per plan, and only for a captain whose road deck runs at good luck) is on the good-luck road deck by day 9 (THANE
  // KARSK's SHIELD WALL: BASTION's ordinary epic+ cap of 2 holds his PLATE BREAKER and ARMOR PRESS). The 13 buy every
  // synergy part at ordinary luck, so they read as before; the Matriarch keeps her road-deck reading (she never stands in).
  it("every build holds all its synergy parts by day 9 (the Iron Matriarch: day 10), each on the deck of the luck that buys it", () => {
    for (const c of CASES.filter((x) => x.day !== 5)) {
      const plan = PLANS[c.id], syn = plan.synergy ?? [];
      if (c.pve) {
        for (const def of syn) expect(defsIn(rivalBuild(c.id, c.day)).has(def), `${c.id} d${c.day}: ${def}`).toBe(true);
        continue;
      }
      const goodOnly = syn.filter((def) => !ordinaryDefs(plan).has(def));
      // bb-0.8.3 (oracle 512f23ac589b2482 (1), amending 94b9559fbb7da299 (10), a general rule): a good-luck-only synergy
      // part counts against the one-per-plan limit only if the ordinary-luck cap could hold it: added to the day-9
      // stand-in deck, that deck stays within the day's ordinary cap (captains.luck's own cap reader, LUCK_CAPS)
      const counted = goodOnly.filter((def) => ordinaryCouldHold(c.id, def));
      expect(counted.length, `${c.id}: good-luck-only synergy parts the ordinary cap could hold: ${counted.join(", ")}`).toBeLessThanOrEqual(1);
      if (goodOnly.length) expect(luckOf(c.id), `${c.id}: a good-luck-only synergy part needs a good-luck road deck`).toBe("good");
      if (syn.length) expect(syn.length - goodOnly.length, `${c.id}: the stand-in deck holds at least one synergy part`).toBeGreaterThanOrEqual(1);
      for (const def of syn) {
        const deck = goodOnly.includes(def) ? rivalBuild(c.id, c.day) : deckOf(c);
        expect(defsIn(deck).has(def), `${c.id} d${c.day}: ${def}${goodOnly.includes(def) ? " (good luck: the road deck)" : ""}`).toBe(true);
      }
    }
    // the 13 buy every synergy part at ordinary luck; of the six, only THANE KARSK has good-luck-only ones: SHIELD WALL and,
    // since bb-0.8.3's caps (BASTION's ordinary cap allows one epic on day 9), ARMOR PRESS. The day-9 ordinary cap forbids
    // both (each, added to his day-9 stand-in deck, goes over it), so neither counts (oracle 512f23ac589b2482 (1)); should
    // a later cap let either fit, this reading moves and the test turns red (ARMOR PRESS then goes back to ordinary luck)
    const goodOnlyOf = Object.fromEntries(RIVAL_IDS.filter((id) => id !== "matriarch").map((id) => [id, (PLANS[id].synergy ?? []).filter((d) => !ordinaryDefs(PLANS[id]).has(d))]).filter(([, g]) => g.length));
    expect(goodOnlyOf).toEqual({ karsk: ["shieldwall", "armorpress"] });
    expect(["shieldwall", "armorpress"].map((d) => ordinaryCouldHold("karsk", d))).toEqual([false, false]);
  });

  it("candidates: same kind, never a synergy part or a race part, offerable by the day; off-plan and unused ones at the part's price", () => {
    for (const c of CASES) {
      const plan = PLANS[c.id], deck = deckOf(c), own = planDefs(plan);
      for (const p of [...deck.items, ...deck.mods].filter((q) => (plan.synergy ?? []).includes(q.def))) {
        const { tier, defs } = swapCandidates(plan, deck, p.def, c.day);
        expect(defs.length, `${c.id} d${c.day} ${p.def}`).toBeGreaterThan(0);
        for (const to of defs) {
          expect(ITEMS[to].kind, `${c.id} ${p.def} -> ${to}`).toBe(ITEMS[p.def].kind);
          expect(plan.synergy, `${c.id} ${p.def} -> ${to}`).not.toContain(to);
          expect(["escapement", "longcase"]).not.toContain(to);
          expect(firstOfferDay(ITEMS[to]), `${c.id} d${c.day} ${to}`).toBeLessThanOrEqual(c.day);
          if (tier !== "nearest") expect(ITEMS[to].price, `${c.id} ${p.def} -> ${to}`).toBe(ITEMS[p.def].price);
          if (tier !== "unused") expect(own.has(to), `${c.id} ${p.def} -> ${to} is off-plan`).toBe(false);
        }
      }
    }
  });

  it("each variant swaps every synergy part in its own slot (same uid, cell or turret, stars), stays legal, and costs what it reports", () => {
    for (const c of CASES) {
      const plan = PLANS[c.id], deck = deckOf(c);
      for (let v = 0; v < 3; v++) {
        const s = synergySwap(c.id, plan, deck, c.day, v, c.pve);
        const tag = `${c.id} d${c.day} v${v}`;
        expect(s.kept, tag).toEqual([]);
        expect(swapLegal(s.build, c.day, c.pve), tag).toBe(true);
        const left = [...s.build.items, ...s.build.mods].filter((p) => (plan.synergy ?? []).includes(p.def));
        expect(left.map((p) => p.def), tag).toEqual([]);
        for (const w of s.swaps) {
          const was = [...deck.items, ...deck.mods].find((p) => p.uid === w.uid)!;
          const now = [...s.build.items, ...s.build.mods].find((p) => p.uid === w.uid)!;
          expect([was.def, now.def], tag).toEqual([w.from, w.to]);
          expect(starsOf(now), tag).toBe(starsOf(was));
          if ("x" in was && "x" in now) expect([now.x, now.y], tag).toEqual([was.x, was.y]);
          if ("turret" in was && "turret" in now) expect(now.turret, tag).toBe(was.turret);
          if (w.tier !== "nearest") expect(w.dGold, tag).toBe(0);
        }
        // the rest of the deck is untouched
        const rest = (b: typeof deck) => [...b.items, ...b.mods].filter((p) => !s.swaps.some((w) => w.uid === p.uid)).map((p) => JSON.stringify(p));
        expect(rest(s.build), tag).toEqual(rest(deck));
        expect(s.build.routes, tag).toEqual(deck.routes);
        expect(deckCost(s.build).total, tag).toBe(deckCost(deck).total + s.swaps.reduce((n, w) => n + w.dGold, 0));
      }
    }
  });
});
