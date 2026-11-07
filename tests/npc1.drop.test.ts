// NPC-1 (REQ-BFG-078): the drops (src/sim/npcDay.ts; road.ts warlordDrop, warlordDropTable, expectedRoadValue). The switch
// is NPC_DAY (on since AZ-BUMP's flip; was off); the pure drop functions don't read it, and every test that turns it on does
// so with withNpcDay.
import { describe, expect, it } from "vitest";
import { HEROES, ITEMS, RUN_DAYS } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import {
  DROP_CHANCE, DROP_CLASSES, DROP_WEIGHTS, NPC_DAY, dropClass, dropPool, dropTable, expectedDropValue, npcDayRules, pctText,
  rollDrop, setNpcDay, withNpcDay, type DropClass,
} from "../src/sim/npcDay";
import { DIFFICULTIES, MATRIARCH_DAY, rivalDays, warlordPool, type Difficulty, type RivalId } from "../src/sim/rivals";
import { expectedRoadValue, roadValue097, topParts, warlordDeck, warlordDrop, warlordDropTable } from "../src/game/road";

const SIGNATURES = new Set(Object.values(HEROES).map((h) => h.factory));
const deckOf = (defs: string[]): Pick<Build, "hero" | "items" | "mods" | "turrets"> => ({
  hero: "furnace", items: defs.map((def, i) => ({ uid: i + 1, def, x: 0, y: 0 })), mods: [], turrets: [],
});
const ofClass = (c: DropClass): string[] => Object.keys(ITEMS).filter((d) => dropClass(d) === c).sort();
/** Every captain deck a run can meet: each tier's pool on days 1-10 (the Matriarch from her day), sabotaged or not. */
function everyDeck(): { id: RivalId; tier: Difficulty; day: number; deck: Build }[] {
  const out: { id: RivalId; tier: Difficulty; day: number; deck: Build }[] = [];
  for (const tier of DIFFICULTIES) {
    for (const id of [...warlordPool(tier), ...(tier === "hard" ? ["matriarch" as const] : [])]) {
      for (const day of rivalDays(id)) for (const s of [false, true]) out.push({ id, tier, day, deck: warlordDeck(id, day, s) });
    }
  }
  return out;
}

describe("NPC-1 the switch (REQ-BFG-077, REQ-BFG-078)", () => {
  // AZ-BUMP (the flip, NPC_DAY): the switch ships on (NPC_DAY false -> true; the title keeps its key and names the old
  // state), so the default reads true and withNpcDay(fn, false) is the off path; withNpcDay still puts it back even on a throw
  it("NPC_DAY is off in this rules version, and withNpcDay puts it back even on a throw", () => {
    expect(NPC_DAY).toBe(true);
    expect(npcDayRules()).toBe(true);
    expect(withNpcDay(() => npcDayRules(), false)).toBe(false);
    expect(npcDayRules()).toBe(true);
    expect(() => withNpcDay(() => { throw new Error("x"); }, false)).toThrow("x");
    expect(npcDayRules()).toBe(true);
    setNpcDay(false);
    expect(withNpcDay(() => npcDayRules())).toBe(true);
    expect(npcDayRules()).toBe(false);
    setNpcDay(true); // the shipped value (AZ-BUMP's flip)
  });
});

describe("NPC-1 the drop table (REQ-BFG-078)", () => {
  it("the class mapping from ItemKind and Rarity: supplies, signature factories and legendary parts never drop", () => { // BUMP-1F: and the GATES converters (a GATE never drops)
    for (const d of Object.values(ITEMS)) {
      const c = dropClass(d.id);
      if (d.kind === "supply" || SIGNATURES.has(d.id) || d.rarity === "legendary") expect(c, d.id).toBeNull();
      // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 78 and named question (d)): GATES ships on, so the three converters (FUSER, SCATTER MILL, SMELTER; kind "converter", GATES-1 REQ-BFG-052) are in ITEMS and fell to the
      // "gear" branch below (the FUSER's rarity is "rare", gates.ts); npcDay.ts dropClass returns null for a converter ("a GATE never drops", before the rarity is read), so it is mapped here to never, ahead of every rarity branch
      else if (d.kind === "converter") expect(c, d.id).toBeNull();
      else if (d.kind === "turret" || d.kind === "factory") expect(c, d.id).toBe("turret");
      else if (d.rarity === "epic") expect(c, d.id).toBe("epic");
      else if (d.kind === "gate") expect(c, d.id).toBe(d.rarity === "rare" ? "rare" : "common");
      else expect([d.kind, c], d.id).toEqual([d.kind, "rare"]); // gear: a common or rare mod or core
    }
    for (const c of DROP_CLASSES) expect(ofClass(c).length, c).toBeGreaterThan(0);
    expect(dropClass("no-such-part")).toBeNull();
  });

  // HULL-1b (REQ-BFG-078): was "... 2/2/3/3 Hard" (cap's answer 98fa8a5115ab780f: the pins of NPC-1's switch-on start numbers move in place)
  it("the tables: DROP_CHANCE 60/75/90; DROP_WEIGHTS 1/1/3/6 Easy and Medium, 2/2/3/5 Hard", () => {
    expect(DROP_CHANCE).toEqual({ easy: 0.6, medium: 0.75, hard: 0.9 });
    expect(DROP_WEIGHTS.easy).toEqual({ turret: 1, epic: 1, rare: 3, common: 6 });
    expect(DROP_WEIGHTS.medium).toEqual({ turret: 1, epic: 1, rare: 3, common: 6 });
    expect(DROP_WEIGHTS.hard).toEqual({ turret: 2, epic: 2, rare: 3, common: 5 }); // HULL-1b (REQ-BFG-078): was { turret: 2, epic: 2, rare: 3, common: 3 }
  });

  it("every captain deck's pool: distinct parts of its items, mods, cores and turrets, never a signature, supply or legendary", () => {
    let decks = 0;
    for (const { deck } of everyDeck()) {
      const pool = dropPool(deck);
      expect(new Set(pool).size).toBe(pool.length);
      const all = new Set([...deck.items.map((p) => p.def), ...deck.mods.map((m) => m.def)]);
      for (const d of pool) {
        expect(SIGNATURES.has(d) || ITEMS[d].kind === "supply" || ITEMS[d].rarity === "legendary", d).toBe(false);
        if (ITEMS[d].kind !== "turret") expect(all.has(d), d).toBe(true);
      }
      decks++;
    }
    expect(decks).toBeGreaterThan(300);
  });

  it("odds: chance x the class's share of the weight / the parts in its class; a class with no part drops out", () => {
    const deck = deckOf([ofClass("turret")[0], ofClass("epic")[0], ofClass("rare")[0], ofClass("rare")[1], ofClass("common")[0], ofClass("common")[1], ofClass("common")[2]]);
    for (const tier of DIFFICULTIES) {
      const t = dropTable(tier, deck), w = DROP_WEIGHTS[tier], total = w.turret + w.epic + w.rare + w.common;
      expect(t.chance).toBe(DROP_CHANCE[tier]);
      expect(t.lines.reduce((s, l) => s + l.odds, 0)).toBeCloseTo(DROP_CHANCE[tier], 12);
      for (const l of t.lines) {
        const n = t.lines.filter((x) => x.cls === l.cls).length;
        expect(l.odds, `${tier} ${l.def}`).toBeCloseTo((DROP_CHANCE[tier] * w[l.cls as DropClass]) / total / n, 12);
      }
    }
    // only common rigs: they take the whole chance
    const commons = deckOf(ofClass("common").slice(0, 3));
    const t = dropTable("hard", commons);
    expect(t.lines.map((l) => l.cls)).toEqual(["common", "common", "common"]);
    for (const l of t.lines) expect(l.odds).toBeCloseTo(0.3, 12);
    // nothing that drops: no chance, no lines, and the roll never gives a part
    const none = deckOf([...SIGNATURES].slice(0, 1).concat(["plating"]));
    expect(dropTable("medium", none)).toEqual({ chance: 0, lines: [] });
    for (let s = 1; s <= 200; s++) expect(rollDrop(s, 3, "hard", none)).toBeNull();
  });

  it("the inspect text: whole percents", () => {
    expect(pctText(0.75)).toBe("75%");
    expect(pctText(0.9)).toBe("90%");
    expect(pctText(0.004)).toBe("<1%");
    expect(pctText(0)).toBe("0%");
  });
});

describe("NPC-1 the roll (REQ-BFG-078)", () => {
  const deck = deckOf([ofClass("turret")[0], ofClass("turret")[1], ofClass("epic")[0], ofClass("rare")[0], ofClass("rare")[1], ofClass("common")[0], ofClass("common")[1]]);

  it("is seeded by (run seed, day) on its own stream: the same answer every time (a reload can't re-roll it)", () => {
    for (let s = 1; s <= 300; s++) {
      for (const tier of DIFFICULTIES) {
        const a = rollDrop(s * 7919, 4, tier, deck);
        expect(rollDrop(s * 7919, 4, tier, deck)).toBe(a);
        if (a !== null) expect(dropPool(deck)).toContain(a);
      }
    }
    // different days of one run roll apart
    const days = Array.from({ length: RUN_DAYS }, (_, i) => rollDrop(99, i + 1, "medium", deck));
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it("per tier, the drop rate lands within 2 points of DROP_CHANCE over 10,000 seeds; the classes within 2 points of their share", () => {
    for (const tier of DIFFICULTIES) {
      let hits = 0;
      const byCls = new Map<DropClass, number>();
      for (let s = 1; s <= 10000; s++) {
        const d = rollDrop(s * 2654435761, 5, tier, deck);
        if (d === null) continue;
        hits++;
        const c = dropClass(d)!;
        byCls.set(c, (byCls.get(c) ?? 0) + 1);
      }
      expect(Math.abs(hits / 10000 - DROP_CHANCE[tier]), tier).toBeLessThan(0.02);
      const w = DROP_WEIGHTS[tier], total = w.turret + w.epic + w.rare + w.common;
      for (const c of DROP_CLASSES) expect(Math.abs((byCls.get(c) ?? 0) / hits - w[c] / total), `${tier} ${c}`).toBeLessThan(0.02);
    }
  });

  it("across every captain deck and 40 seeds: a win drops only a part of its own pool (never a signature, supply or legendary)", () => {
    for (const { id, tier, day, deck: d } of everyDeck()) {
      if (id === "matriarch") continue;
      const pool = new Set(dropPool(d));
      for (let s = 1; s <= 40; s++) {
        const x = rollDrop(s * 104729, day, tier, d);
        if (x !== null) expect(pool.has(x), `${id} d${day} ${x}`).toBe(true);
      }
    }
  });

  it("the Matriarch pays her legendary part, always (chance 1), and it is hers alone", () => {
    for (let day = MATRIARCH_DAY; day <= RUN_DAYS; day++) {
      const deck = warlordDeck("matriarch", day);
      const part = topParts(deck, 1)[0];
      expect(ITEMS[part].rarity).toBe("legendary");
      expect(warlordDropTable("matriarch", "hard", deck)).toEqual({ chance: 1, lines: [{ def: part, cls: "legendary", odds: 1 }] });
      for (let s = 1; s <= 20; s++) expect(warlordDrop(s, day, "matriarch", "hard", deck)).toBe(part);
      expect(dropPool(deck)).not.toContain(part);
    }
  });
});

describe("NPC-1 the expected road value (HULL-1's input; REQ-BFG-078)", () => {
  it("gold plus chance x the sum of odds x valueOf, the mean over a tier's captains; finite on days 1-10", () => {
    for (let day = 1; day <= RUN_DAYS; day++) {
      for (const tier of DIFFICULTIES) {
        const ids = warlordPool(tier);
        let want = 0;
        for (const id of ids) {
          const deck = warlordDeck(id, day);
          const t = warlordDropTable(id, tier, deck);
          want += (tier === "easy" && day >= 4 ? 3 : tier === "easy" ? 2 : tier === "medium" ? 4 : 3) + expectedDropValue(t);
        }
        expect(expectedRoadValue(day, tier)).toBeCloseTo(want / ids.length, 9);
        expect(roadValue097(day, tier)).toBeGreaterThan(0);
      }
      expect(expectedRoadValue(day, "matriarch") > 0).toBe(day >= MATRIARCH_DAY);
    }
    if (process.env.NPC1_TABLE) {
      const row = (f: (d: number, t: Difficulty | "matriarch") => number, t: Difficulty | "matriarch") =>
        Array.from({ length: RUN_DAYS }, (_, i) => f(i + 1, t).toFixed(2)).join(" | ");
      for (const t of [...DIFFICULTIES, "matriarch" as const]) {
        console.log(`NPC1 ${t} | ${row(expectedRoadValue, t)}`);
        console.log(`097  ${t} | ${row(roadValue097, t)}`);
      }
    }
  });
});
