// 0.6.2 TUNE-C (REQ-BFG-024; ref/BRIEF-final-062-captains.md section 3 item 5): the synergy check's swaps. Every named
// build lists its synergy parts (RivalPlan.synergy); src/sim/harness/synergy.ts swaps them for off-plan parts of the same
// cost in the same slots, keeping the deck legal, and tools/parBench.ts --synergy fights the swapped decks against the par
// field. Here: the swapped decks are what the check says they are (the battles are the bench's).

import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { RIVAL_IDS, deckCost, rivalBuild, standInBuild, type RivalId } from "../src/sim/rivals";
import { PLANS } from "../src/sim/rivalBuilds";
import { firstOfferDay, planDefs, swapCandidates, swapLegal, synergySwap } from "../src/sim/harness/synergy";
import { starsOf } from "../src/sim/stars";

/** The check's decks: the 12 stand-in captains' named dusk builds on days 5 and 9, the Iron Matriarch's warlord deck on
 *  day 10 (parBench --synergy's defaults). */
const CASES: { id: RivalId; day: number; pve: boolean }[] = [
  ...RIVAL_IDS.filter((id) => id !== "matriarch").flatMap((id) => [5, 9].map((day) => ({ id, day, pve: false }))),
  { id: "matriarch", day: 10, pve: true },
];
const deckOf = (c: { id: RivalId; day: number; pve: boolean }) => (c.pve ? rivalBuild(c.id, c.day) : standInBuild(c.id, c.day));

describe("the synergy check's swaps (harness/synergy.ts)", () => {
  it("every build holds all its synergy parts by day 9 (the Iron Matriarch: day 10)", () => {
    for (const c of CASES.filter((x) => x.day !== 5)) {
      const defs = new Set([...deckOf(c).items, ...deckOf(c).mods].map((p) => p.def));
      for (const def of PLANS[c.id].synergy ?? []) expect(defs.has(def), `${c.id} d${c.day}: ${def}`).toBe(true);
    }
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
