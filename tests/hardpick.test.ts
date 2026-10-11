// 0.6.0c item 1 (REQ-BFG-010, decision 3): every Hard pick offers 2 parts. A fought deck with fewer
// than 2 giveable parts (0.6.2 TUNE-C plans: LONGTOOTH day 1, a whetstone; before them HIGHSPIRE day 1
// and OLD BULWARK days 1-2) is filled from the same captain's later decks (rivalBuild(id, d), d in
// rivalDays(id) after the fought deck's day), skipping parts already offered. The Iron Matriarch
// keeps her single LEGENDARY part.
import { describe, expect, it } from "vitest";
import { hardParts, pickRoad, topParts, warlordDeckDay, warlordReward } from "../src/game/road";
import { newRun } from "../src/game/run";
import { HEROES, ITEMS, RUN_DAYS } from "../src/sim/content";
import { rivalBuild, rivalDays, type RivalId } from "../src/sim/rivals";
import { withNpcDay } from "../src/sim/npcDay"; // AZ-BUMP (the flip): 0.9.7's Hard pick with NPC_DAY off

const SEEDS = Array.from({ length: 200 }, (_, i) => 3 + i * 7717);
const SIGNATURES = new Set(Object.values(HEROES).map((h) => h.factory));

function deckDefs(id: RivalId, d: number): Set<string> {
  const b = rivalBuild(id, d);
  return new Set([...b.items.map((p) => p.def), ...b.mods.map((m) => m.def)]);
}

describe("every Hard pick offers 2 parts (0.6.0c)", () => {
  // AZ-BUMP (the flip, NPC_DAY): with the NPC day on a Hard win rolls a drop instead (npcDay.ts; warlordReward offers no
  // parts), so the pick of 2 is the switch-off path, kept for older records: the tests that take it through pickRoad or
  // warlordReward run with NPC_DAY off (hardParts itself reads no switch)
  it("200 seeds x days 1-10, sabotaged and not: 2 distinct real parts, no signature factory, no supply", () => withNpcDay(() => {
    let checked = 0, filled = 0, matriarch = 0;
    for (const seed of SEEDS) {
      for (let day = 1; day <= RUN_DAYS; day++) {
        // days 9-10 also after the Matriarch was beaten on day 8 (a regular Hard captain holds the slot)
        for (const beaten of day >= 9 ? [null, 8] : [null]) {
          for (const sab of [false, true]) {
            const run = newRun(seed % 2 ? "weaver" : "furnace", seed);
            run.day = day;
            run.matriarchBeatenOn = beaten;
            if (sab) run.sabotage = { day: Math.max(1, day - 1) };
            expect(pickRoad(run, "hard").ok).toBe(true);
            const w = run.warlord!;
            expect(w.sabotaged).toBe(sab);
            if (w.id === "matriarch") {
              matriarch++;
              expect(w.reward.legendary).toBe(true);
              expect(w.reward.parts).toHaveLength(1);
              continue;
            }
            checked++;
            const parts = w.reward.parts;
            expect(parts).toHaveLength(2);
            expect(new Set(parts).size).toBe(2);
            for (const p of parts) {
              expect(ITEMS[p]).toBeDefined();
              expect(ITEMS[p].kind).not.toBe("supply");
              expect(SIGNATURES.has(p)).toBe(false);
            }
            expect(w.reward.legendary).toBe(false);
            // first the deck it fought (a sabotaged fight: yesterday's deck), then the fill
            const own = topParts(w.build, 2);
            expect(parts.slice(0, own.length)).toEqual(own);
            const dd = warlordDeckDay(w.id, day, sab);
            expect(dd).toBe(sab && day > 1 ? day - 1 : day);
            for (const p of parts.slice(own.length)) {
              filled++;
              expect(rivalDays(w.id).some((d) => d > dd && deckDefs(w.id, d).has(p))).toBe(true);
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(3000);
    expect(matriarch).toBeGreaterThan(0);
    expect(filled).toBeGreaterThan(0);
  }, false));

  it("LONGTOOTH day 1 (TUNE-C plans; before them HIGHSPIRE day 1 and OLD BULWARK days 1-2) is filled from the captain's next decks", () => withNpcDay(() => {
    expect(topParts(rivalBuild("longtooth", 1), 2)).toEqual(["whetstone"]);
    for (const [id, day] of [["longtooth", 1]] as [RivalId, number][]) {
      const deck = rivalBuild(id, day);
      const own = topParts(deck, 2);
      expect(own).toHaveLength(1);
      const r = warlordReward(id, "hard", deck, day);
      expect(r.parts).toHaveLength(2);
      expect(r.parts[0]).toBe(own[0]);
      // the priciest part of the first later deck that has one not already offered
      const next = rivalDays(id).filter((d) => d > day)
        .map((d) => topParts(rivalBuild(id, d), Infinity).filter((p) => p !== own[0]))
        .find((l) => l.length)!;
      expect(r.parts[1]).toBe(next[0]);
      expect(hardParts(id, deck, day)).toEqual(r.parts);
    }
  }, false));

  it("a deck with 2 or more giveable parts is offered exactly its own top 2 (no fill)", () => {
    for (const id of ["sparkfang", "longtooth", "silkshade", "emberlyn", "highspire", "bulwark"] as RivalId[]) {
      for (const day of rivalDays(id)) {
        const deck = rivalBuild(id, day);
        const own = topParts(deck, 2);
        if (own.length === 2) expect(hardParts(id, deck, day)).toEqual(own);
      }
    }
  });

  it("Easy and Medium still pay gold only; the Matriarch one LEGENDARY part", () => {
    expect(warlordReward("sootjaw", "easy", rivalBuild("sootjaw", 3), 3).parts).toEqual([]);
    expect(warlordReward("nettle", "medium", rivalBuild("nettle", 3), 3).parts).toEqual([]);
    const m = warlordReward("matriarch", "hard", rivalBuild("matriarch", 8), 8);
    expect(m.legendary).toBe(true);
    expect(m.parts).toEqual(topParts(rivalBuild("matriarch", 8), 1));
  });
});
