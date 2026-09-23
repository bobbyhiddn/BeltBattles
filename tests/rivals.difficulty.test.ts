import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import type { Build } from "../src/sim/deck";
import type { HeroId } from "../src/sim/content";
import {
  DIFFICULTIES, MATRIARCH_DAY, RIVALS, RIVAL_IDS, RUN_DAYS, difficultyOf, rivalBuild, rivalDays, rivalLoadout,
  type Difficulty, type RivalId,
} from "../src/sim/rivals";

// Difficulty ladder for the warlord roster (ROADMAP §1-2), measured day by day the way the
// player meets the captains. The reference opponent is today's warlord of the other faction at
// the same day (its round), fought as the player (side 0) over 20 seeds. A lower reference win
// rate means a harder captain. Battles barely vary by seed, so rates are mostly 0 or 1 per day;
// the mean hull margin (reference hull left minus captain hull left, as fractions) breaks ties.
// "a is easier than b" means a higher margin and a reference win rate at least as high.

const SEEDS = Array.from({ length: 20 }, (_, i) => (i + 1) * 7919);
const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const other = (h: HeroId): HeroId => (h === "furnace" ? "weaver" : "furnace");

interface Score { rate: number; margin: number; t: number }

function versus(ref: Build, foe: Build): Score {
  let wins = 0, margin = 0, t = 0;
  for (const seed of SEEDS) {
    const b = simulate(ref, foe, seed);
    const [p, e] = b.sides;
    if (b.winner === 0) wins++;
    margin += Math.max(0, p.hull.hp) / p.hull.max - Math.max(0, e.hull.hp) / e.hull.max;
    t += b.t;
  }
  return { rate: wins / SEEDS.length, margin: margin / SEEDS.length, t: t / SEEDS.length };
}

function mean(xs: Score[]): Score {
  const n = xs.length;
  return {
    rate: xs.reduce((a, s) => a + s.rate, 0) / n,
    margin: xs.reduce((a, s) => a + s.margin, 0) / n,
    t: xs.reduce((a, s) => a + s.t, 0) / n,
  };
}

/** Captains the player can meet on a day, as a warlord or a stand-in ghost. */
const eligible = (day: number) => RIVAL_IDS.filter((id) => rivalDays(id).includes(day));
const slotOn = (slot: Difficulty, day: number) => eligible(day).filter((id) => difficultyOf(id) === slot);

const scores = new Map<string, Score>();
for (const day of DAYS) {
  for (const id of eligible(day)) {
    scores.set(`${id}@${day}`, versus(warlordBuild(other(RIVALS[id].hero), day), rivalBuild(id, day)));
  }
}
const score = (id: RivalId, day: number) => scores.get(`${id}@${day}`)!;
const slotMean = (slot: Difficulty, day: number) => mean(slotOn(slot, day).map((id) => score(id, day)));

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
const fmt = (s: Score) => `ref wins ${pct(s.rate)}  margin ${s.margin.toFixed(3).padStart(6)}  avg ${s.t.toFixed(1)}s`;

describe("warlord difficulty ladder, day by day (reference = other faction's warlord, 20 seeds)", () => {
  it("prints the ladder: per day, each difficulty's mean, then every eligible captain", () => {
    const lines = ["warlord ladder (reference win rate and margin vs each captain's build of the day):"];
    for (const day of DAYS) {
      const means = DIFFICULTIES.map((d) => `${d} ${pct(slotMean(d, day).rate)} ${slotMean(d, day).margin.toFixed(3).padStart(6)}`);
      lines.push(`  day ${String(day).padStart(2)}: ${means.join(" | ")}`);
      for (const slot of DIFFICULTIES) {
        for (const id of slotOn(slot, day)) {
          const l = rivalLoadout(id, day);
          lines.push(`      ${slot.padEnd(6)} ${RIVALS[id].name.padEnd(14)} ${String(l.value).padStart(3)}g  ${fmt(score(id, day))}`);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
    expect(lines.length).toBe(1 + RUN_DAYS * 13 + (RUN_DAYS - MATRIARCH_DAY + 1));
  });

  it("the Iron Matriarch is measured on days 8-10 only", () => {
    expect(DAYS.filter((d) => eligible(d).includes("matriarch"))).toEqual([8, 9, 10]);
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
