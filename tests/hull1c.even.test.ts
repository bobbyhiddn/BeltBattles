// HULL-1c (REQ-BFG-079; REVIEW-HULL1A N2, pinning its C4b): the day's hull rounds only where it must. M(d) is a whole
// number of tenths and every one is even (DAY_MUL_TENTHS, DAY_MUL_STEP_TENTHS), and every flat max-hull grant that joins
// build.hullBonus (a supply's hull, the "hull" runes, LAST_CHANCE_HULL, the road events' hull deltas) is a multiple of 50,
// so M(d) x the grant is a whole 10 on every day: the number a toast or a card shows (hullShown) is exactly what the max
// hull gains. The battle-time runes (perTurretHull, mergedHull) are rounded per unit (REVIEW-HULL1A Q3; tests/hull1a.scale
// pins the battle), so their text x the count is what lands: BULKHEADS' per-turret amount is a 50 as C4b lists it, SCRAP
// HALO's per-piece 60 is not (C4b doesn't list it) and rounds per piece. Every value is read from its module; the switch
// is turned on only through withHullScale.
import { describe, expect, it } from "vitest";
import { HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { DAY_MUL_STEP_TENTHS, DAY_MUL_TENTHS, dayMulTenths, hullAt, hullScaleRules, withHullScale } from "../src/sim/hullScale";
import { RUNE_LIST, SUSTAIN_RUNE_LIST, type RuneDef } from "../src/sim/runes";
import { LAST_CHANCE_HULL } from "../src/sim/lastChance";
import { EVENTS, EVENT_IDS, type EventState } from "../src/game/eventDefs";
import { newRun } from "../src/game/run";

/** The run's days, the later modes' table (days 11-18) and 22 days past it (DAY_MUL_STEP_TENTHS a day). */
const DAYS = Array.from({ length: DAY_MUL_TENTHS.length + 22 }, (_, i) => i + 1);
const RUNES_ALL: readonly RuneDef[] = [...RUNE_LIST, ...SUSTAIN_RUNE_LIST];
const runesOf = (kind: string): { id: string; n: number }[] => RUNES_ALL.filter((d) => d.kind === kind).map((d) => ({ id: d.id, n: d.amount.n }));

/** Every road event's hull delta (cost or gain), read from EVENTS under a sweep of the event's fixed pick (the way
 *  roadCap.ts reads its options). */
function eventHulls(): { id: string; n: number }[] {
  const out = new Map<string, number>();
  const run = newRun("furnace", 1, "hull1c-even");
  for (const id of EVENT_IDS) {
    for (let j = 0; j < 16; j++) {
      const ev: EventState = { day: 1, id, roll: 0, pick: (j + 0.5) / 16, picked: -1 };
      for (const c of EVENTS[id].choices(run, ev)) {
        for (const [side, list] of [["cost", c.cost], ["gain", c.gain]] as const) {
          for (const d of list) if (d.k === "hull") out.set(`${id} ${c.label} ${side}`, d.n);
        }
      }
    }
  }
  return [...out].map(([id, n]) => ({ id, n }));
}

/** The flat grants that join build.hullBonus, by source. */
function hullBonusGrants(): Record<string, { id: string; n: number }[]> {
  return {
    supply: Object.values(ITEMS).filter((d) => d.supply?.hull !== undefined).map((d) => ({ id: d.id, n: d.supply!.hull! })),
    rune: runesOf("hull"),
    lastChance: [{ id: "LAST_CHANCE_HULL", n: LAST_CHANCE_HULL }],
    event: eventHulls(),
  };
}

describe("HULL-1c: REVIEW-HULL1A C4b, every M(d) even and every flat max-hull grant a 50 (N2)", () => {
  it("M(d) is a whole, even number of tenths: every DAY_MUL_TENTHS value, DAY_MUL_STEP_TENTHS, and so every day's", () => {
    expect(DAY_MUL_TENTHS.length).toBeGreaterThan(0);
    for (const t of DAY_MUL_TENTHS) expect(Number.isInteger(t) && t % 2 === 0, `DAY_MUL_TENTHS ${t}`).toBe(true);
    expect(Number.isInteger(DAY_MUL_STEP_TENTHS) && DAY_MUL_STEP_TENTHS % 2 === 0, `DAY_MUL_STEP_TENTHS ${DAY_MUL_STEP_TENTHS}`).toBe(true);
    for (const d of DAYS) expect(dayMulTenths(d) % 2, `day ${d}`).toBe(0);
  });

  it("every grant that joins hullBonus is a positive multiple of 50 (supplies, HULL runes, LAST_CHANCE_HULL, event deltas)", () => {
    const all = hullBonusGrants();
    for (const [src, list] of Object.entries(all)) {
      expect(list.length, `${src}: none found`).toBeGreaterThan(0);
      for (const g of list) expect(Number.isInteger(g.n) && g.n > 0 && g.n % 50 === 0, `${src} ${g.id}: ${g.n}`).toBe(true);
    }
    console.log(`HULL1C-EVEN hullBonus grants: ${Object.entries(all).map(([s, l]) => `${s} ${l.map((g) => `${g.id} ${g.n}`).join(", ")}`).join("; ")}`);
  });

  it("so on every day the shown number is exact and is what lands: M(d) x n is a whole 10, and adding n to any hero's hull adds exactly that", () => {
    const grants = Object.values(hullBonusGrants()).flat();
    const heroes = Object.keys(HEROES) as HeroId[];
    withHullScale(() => {
      expect(hullScaleRules()).toBe(true);
      for (const g of grants) {
        for (const d of DAYS) {
          const t = dayMulTenths(d), shown = hullAt(g.n, d);
          expect(shown * 10, `${g.id} ${g.n} day ${d}`).toBe(t * g.n); // no rounding: M(d) x n exactly
          for (const h of heroes) {
            const base = HEROES[h].hull;
            for (const bonus of [0, ...grants.map((x) => x.n)]) {
              expect(hullAt(base + bonus + g.n, d) - hullAt(base + bonus, d), `${h} +${bonus} +${g.id} day ${d}`).toBe(shown);
            }
          }
        }
      }
    });
    expect(hullScaleRules()).toBe(false);
  });

  it("the battle-time runes, each unit rounded alone (Q3): whole 10s; BULKHEADS' per-turret amount a 50 as C4b lists it", () => {
    const perTurret = runesOf("perTurretHull"), merged = runesOf("mergedHull");
    expect(perTurret.length).toBeGreaterThan(0);
    expect(merged.length).toBeGreaterThan(0);
    for (const g of perTurret) expect(Number.isInteger(g.n) && g.n > 0 && g.n % 50 === 0, `perTurretHull ${g.id}: ${g.n}`).toBe(true);
    // SCRAP HALO's per-piece amount needs no 50: each piece's day number is rounded alone, in the battle and in its text alike
    for (const g of merged) expect(Number.isInteger(g.n) && g.n > 0 && g.n % 10 === 0, `mergedHull ${g.id}: ${g.n}`).toBe(true);
    const rounds = merged.filter((g) => DAYS.some((d) => withHullScale(() => hullAt(g.n, d)) * 10 !== dayMulTenths(d) * g.n));
    console.log(`HULL1C-EVEN per-unit runes: ${[...perTurret, ...merged].map((g) => `${g.id} ${g.n}`).join(", ")}; rounded per unit on some day: ${rounds.map((g) => g.id).join(", ") || "none"}`);
  });
});
