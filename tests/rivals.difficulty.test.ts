import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { startingBuild } from "../src/sim/ai";
import type { Build } from "../src/sim/deck";
import type { HeroId } from "../src/sim/content";
import {
  DIFFICULTIES, MATRIARCH_DAY, RIVALS, RIVAL_IDS, RUN_DAYS, deckCost, difficultyOf, honestReference, rivalBuild,
  rivalDays, standInBuild, type Difficulty, type RivalId,
} from "../src/sim/rivals";

// The per-day difficulty ladder (Part 4, rulings R1-R2), measured the way the player meets the
// captains. The reference is the par player of the day: honestReference(the other faction, day),
// the day's warlord with its hull ramp as whole paid plates, fought as the player (side 0) over
// 20 seeds. The margin is the reference's hull left minus the captain's (fractions), so a higher
// margin is an easier captain. Warlords are measured as rivalBuild (their PvE deck); the stand-in
// pool is measured as standInBuild, the captain's honest plan deck. 0.6.0d: the dusk fight now uses
// the full-purse stand-in pool (standInPick; tests/standInPool.test.ts) and standInBuild is only its
// fallback, so this table is the old dusk deck's; the printed line adds each hero's stand-in win rate.

const SEEDS = Array.from({ length: 20 }, (_, i) => (i + 1) * 7919);
const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const GAP = 0.05;
const other = (h: HeroId): HeroId => (h === "furnace" ? "weaver" : "furnace");

interface Score { rate: number; margin: number; t: number; foe: number } // 0.6.0d: foe = the captain's win rate

function versus(ref: Build, foe: Build): Score {
  let wins = 0, lost = 0, margin = 0, t = 0;
  for (const seed of SEEDS) {
    const b = simulate(ref, foe, seed);
    const [p, e] = b.sides;
    if (b.winner === 0) wins++;
    if (b.winner === 1) lost++;
    margin += Math.max(0, p.hull.hp) / p.hull.max - Math.max(0, e.hull.hp) / e.hull.max;
    t += b.t;
  }
  return { rate: wins / SEEDS.length, margin: margin / SEEDS.length, t: t / SEEDS.length, foe: lost / SEEDS.length };
}

function mean(xs: Score[]): Score {
  const n = xs.length;
  return {
    rate: xs.reduce((a, s) => a + s.rate, 0) / n,
    margin: xs.reduce((a, s) => a + s.margin, 0) / n,
    t: xs.reduce((a, s) => a + s.t, 0) / n,
    foe: xs.reduce((a, s) => a + s.foe, 0) / n,
  };
}

/** Captains the player can meet on a day as a warlord: all 12 regulars and elites, the Matriarch on 8-10. */
const eligible = (day: number) => RIVAL_IDS.filter((id) => rivalDays(id).includes(day));
const slotOn = (slot: Difficulty, day: number) => eligible(day).filter((id) => difficultyOf(id) === slot);
const STAND_INS = RIVAL_IDS.filter((id) => id !== "matriarch");
const ref = (id: RivalId, day: number) => honestReference(other(RIVALS[id].hero), day);

const warlord = new Map<string, Score>(), standIn = new Map<string, Score>();
for (const day of DAYS) {
  for (const id of eligible(day)) warlord.set(`${id}@${day}`, versus(ref(id, day), rivalBuild(id, day)));
  for (const id of STAND_INS) standIn.set(`${id}@${day}`, versus(ref(id, day), standInBuild(id, day)));
}
const score = (id: RivalId, day: number) => warlord.get(`${id}@${day}`)!;
const slotMean = (slot: Difficulty, day: number) => mean(slotOn(slot, day).map((id) => score(id, day)));
const poolMean = (day: number) => mean(STAND_INS.map((id) => standIn.get(`${id}@${day}`)!));

/** A tests/pacing.test.ts player deck: the hero's start deck plus its first `n` (0-2) gates. */
function pacingDeck(h: HeroId, n: number): Build {
  const b = JSON.parse(JSON.stringify(startingBuild(h, 1))) as Build;
  const gates: [string, number, number][] = h === "furnace"
    ? [["temper", 4, 3], ["whetstone", 4, 2]]
    : [["grease", 4, 3], ["whetstone", 1, 3]];
  gates.slice(0, n).forEach(([def, x, y], i) => b.items.push({ uid: 500 + i, def, x, y }));
  return b;
}
/** The pacing-test deck a player brings to days 1-3 (0, 1 and 2 gates). */
const playerDeck = (h: HeroId, day: number) => pacingDeck(h, Math.min(2, day - 1));
const pct = (x: number) => `${(x * 100).toFixed(0).padStart(3)}%`;
const sgn = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(3)}`;
const fmt = (s: Score) => `ref wins ${pct(s.rate)}  margin ${sgn(s.margin)}  avg ${s.t.toFixed(1)}s`;

describe("warlord difficulty ladder, day by day (reference = honestReference of the other faction, 20 seeds)", () => {
  it("prints the ladder and the stand-in pool: per day, each difficulty's mean, then every captain", () => {
    const lines = ["warlord ladder (rivalBuild vs honestReference; reference win rate and margin):"];
    for (const day of DAYS) {
      const means = DIFFICULTIES.map((d) => `${d} ${pct(slotMean(d, day).rate)} ${sgn(slotMean(d, day).margin)}`);
      lines.push(`  day ${String(day).padStart(2)}: ${means.join(" | ")}`);
      for (const slot of DIFFICULTIES) {
        for (const id of slotOn(slot, day)) {
          const g = deckCost(rivalBuild(id, day)).total;
          lines.push(`      ${slot.padEnd(6)} ${RIVALS[id].name.padEnd(14)} ${String(g).padStart(3)}g  ${fmt(score(id, day))}`);
        }
      }
    }
    lines.push("stand-in pool (12 standInBuild decks vs honestReference):");
    for (const day of DAYS) {
      const p = poolMean(day);
      const each = STAND_INS.map((id) => `${id} ${sgn(standIn.get(`${id}@${day}`)!.margin)}`).join(" ");
      // 0.6.0d: the old dusk decks' own win rate per hero (the same fights, no new sweep)
      const hero = (h: HeroId) => pct(mean(STAND_INS.filter((id) => RIVALS[id].hero === h).map((id) => standIn.get(`${id}@${day}`)!)).foe);
      lines.push(`  day ${String(day).padStart(2)}: pool ref wins ${pct(p.rate)} margin ${sgn(p.margin)} | standInBuild wins: furnace ${hero("furnace")} weaver ${hero("weaver")} | ${each}`);
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
    expect(lines.length).toBe(2 + RUN_DAYS * 14 + (RUN_DAYS - MATRIARCH_DAY + 1));
  });

  it("the Iron Matriarch is measured on days 8-10 only", () => {
    expect(DAYS.filter((d) => eligible(d).includes("matriarch"))).toEqual([8, 9, 10]);
  });

  it("every day: by mean margin Easy > Medium > Hard, each gap at least 0.05", () => {
    for (const day of DAYS) {
      const [e, m, h] = DIFFICULTIES.map((d) => slotMean(d, day).margin);
      expect(e - m, `day ${day}: easy ${sgn(e)} vs medium ${sgn(m)}`).toBeGreaterThanOrEqual(GAP);
      expect(m - h, `day ${day}: medium ${sgn(m)} vs hard ${sgn(h)}`).toBeGreaterThanOrEqual(GAP);
    }
  });

  it("every day: every Easy captain's margin is above every Hard captain's", () => {
    for (const day of DAYS) {
      for (const a of slotOn("easy", day)) {
        for (const b of slotOn("hard", day)) {
          expect(score(a, day).margin, `day ${day}: ${a} ${fmt(score(a, day))} vs ${b} ${fmt(score(b, day))}`)
            .toBeGreaterThan(score(b, day).margin);
        }
      }
    }
  });

  it("every day: a par deck beats Easy on average (mean margin > 0) and loses to Hard (< 0)", () => {
    for (const day of DAYS) {
      expect(slotMean("easy", day).margin, `day ${day} easy`).toBeGreaterThan(0);
      expect(slotMean("hard", day).margin, `day ${day} hard`).toBeLessThan(0);
    }
  });

  it("days 8-10: the Iron Matriarch has the lowest margin of all", () => {
    for (const day of DAYS.filter((d) => d >= MATRIARCH_DAY)) {
      for (const id of eligible(day)) {
        if (id === "matriarch") continue;
        expect(score(id, day).margin, `day ${day}: ${id} ${fmt(score(id, day))} vs matriarch ${fmt(score("matriarch", day))}`)
          .toBeGreaterThan(score("matriarch", day).margin);
      }
    }
  });

  it("every day: the stand-in pool's mean margin is between -0.25 and +0.25", () => {
    for (const day of DAYS) {
      const p = poolMean(day).margin;
      expect(p, `day ${day} pool ${sgn(p)}`).toBeGreaterThanOrEqual(-0.25);
      expect(p, `day ${day} pool ${sgn(p)}`).toBeLessThanOrEqual(0.25);
    }
  });

  it("days 1-3: Easy and Medium captains keep the 0.4.0 pacing against the pacing-test decks (mean 20-45 s)", () => {
    const lines: string[] = [];
    for (const day of [1, 2, 3]) {
      for (const id of [...slotOn("easy", day), ...slotOn("medium", day)]) {
        for (const h of ["furnace", "weaver"] as HeroId[]) {
          const s = versus(playerDeck(h, day), rivalBuild(id, day));
          lines.push(`  pacing ${h} deck day ${day} vs ${RIVALS[id].name}: ${fmt(s)}`);
          expect(s.t, `${h} vs ${id} day ${day}`).toBeGreaterThanOrEqual(20);
          expect(s.t, `${h} vs ${id} day ${day}`).toBeLessThanOrEqual(45);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
  });
});
