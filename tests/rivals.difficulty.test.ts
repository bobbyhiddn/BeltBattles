import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { startingBuild } from "../src/sim/ai";
import type { Build } from "../src/sim/deck";
import type { HeroId } from "../src/sim/content";
import {
  DIFFICULTIES, MATRIARCH_DAY, RIVALS, RIVAL_IDS, RUN_DAYS, deckCost, difficultyOf, rivalBuild,
  rivalDays, standInBuild, type Difficulty, type RivalId,
} from "../src/sim/rivals";
import { parField } from "../src/sim/harness/par";

// The per-day difficulty ladder (Part 4, rulings R1-R2), measured the way the player meets the
// captains. The margin is the reference's hull left minus the captain's (fractions), so a higher
// margin is an easier captain. Warlords are measured as rivalBuild (their PvE deck); the stand-in
// pool is measured as standInBuild, the captain's honest plan deck: since 0.6.2 TUNE-C the dusk deck
// again (ghosts.ts standInFoe; from 0.6.0d it was the full-purse stand-in pool's standInPick); the
// printed line adds each hero's stand-in win rate.
// 0.6.2 TUNE-C (ref/BRIEF-final-062-captains.md section 6): the reference is the FURNACE PAR FIELD of the day, the
// typical player the captain plans are calibrated against (src/sim/harness/par.ts parField, its first REF_K members),
// fought as the player (side 0), 3 seeds per member: 24 battles per captain-day (20 before). The old reference,
// honestReference(the other faction, day), spends 0-51% of the day's gold: every retimed plan beats it from day 2, so
// its margins no longer order the ladder (OUT/CAPTAINS-REPORT.md lists this change with the --rivals table).

const REF_K = 8;
const SEEDS = Array.from({ length: 3 }, (_, i) => (i + 1) * 7919);
/** The pacing check's seeds: 20, as before TUNE-C (one pacing deck, no field). */
const PACE_SEEDS = Array.from({ length: 20 }, (_, i) => (i + 1) * 7919);
const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const GAP = 0.05;
/** 0.8.0 I1 M3 (oracles 64485b535a06683c and 405facc95783b82c, the second replacing the first's single exception): B1's
 *  open items, the three captain-days skipped by "days 8-10: the Iron Matriarch has the lowest margin of all". No rival
 *  changed; the reference (the FURNACE par field) moved when wave 3 went on, and the order broke at M2, before the draw
 *  (day 8 MOTH QUEEN -0.383 vs her -0.364; SILKSHADE below her on days 8, 9 and 10). At the tip (the draw and the
 *  regrown pool) her margins are day 8 -0.409 (ref wins 8%), day 9 -0.527 (4%), day 10 -0.453 (8%), and three sit below:
 *  day 8 MOTH QUEEN -0.423 (13%) and SILKSHADE -0.537 (13%), day 9 SILKSHADE -0.534 (13%). By win rate she is the hardest
 *  on all three days. B1 owns the fix (VERIFIED-P1 section I). Each entry carries its measured gap (her margin minus
 *  its) and a ceiling; the open-item test after the check pins them, and both go when B1 restores the order. */
// 0.8.0 B1 M3 (approved by ref/BRIEF-v080-B1.md section 4): emptied. B1 regrew MOTH QUEEN day 8 and SILKSHADE days 8-9
// (their stand-ins, output-B1/m3/O13-NOTES.md), so every captain sits above the Matriarch on days 8-10 again; the
// open-item test that pinned the three is deleted, as its title asked.
const B1_EXCEPTIONS: readonly { id: RivalId; day: number; gap: number; ceiling: number }[] = [];
const REFS = new Map<number, Build[]>();
const refsOf = (day: number): Build[] => {
  if (!REFS.has(day)) REFS.set(day, parField("furnace", day, REF_K));
  return REFS.get(day)!;
};

interface Score { rate: number; margin: number; t: number; foe: number } // 0.6.0d: foe = the captain's win rate

/** The captain against the day's par field: the mean over its REF_K members. */
const vsPar = (day: number, foe: Build): Score => mean(refsOf(day).map((ref) => versus(ref, foe)));

function versus(ref: Build, foe: Build, seeds: readonly number[] = SEEDS): Score {
  let wins = 0, lost = 0, margin = 0, t = 0;
  for (const seed of seeds) {
    const b = simulate(ref, foe, seed);
    const [p, e] = b.sides;
    if (b.winner === 0) wins++;
    if (b.winner === 1) lost++;
    margin += Math.max(0, p.hull.hp) / p.hull.max - Math.max(0, e.hull.hp) / e.hull.max;
    t += b.t;
  }
  return { rate: wins / seeds.length, margin: margin / seeds.length, t: t / seeds.length, foe: lost / seeds.length };
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

const warlord = new Map<string, Score>(), standIn = new Map<string, Score>();
for (const day of DAYS) {
  for (const id of eligible(day)) warlord.set(`${id}@${day}`, vsPar(day, rivalBuild(id, day)));
  for (const id of STAND_INS) standIn.set(`${id}@${day}`, vsPar(day, standInBuild(id, day)));
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

describe("warlord difficulty ladder, day by day (reference = the FURNACE par field, 8 members x 3 seeds)", () => {
  it("prints the ladder and the stand-in pool: per day, each difficulty's mean, then every captain", () => {
    const lines = ["warlord ladder (rivalBuild vs the FURNACE par field; reference win rate and margin):"];
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
    lines.push("stand-in pool (12 standInBuild decks vs the FURNACE par field):");
    for (const day of DAYS) {
      const p = poolMean(day);
      const each = STAND_INS.map((id) => `${id} ${sgn(standIn.get(`${id}@${day}`)!.margin)}`).join(" ");
      // 0.6.0d: the old dusk decks' own win rate per hero (the same fights, no new sweep)
      const hero = (h: HeroId) => pct(mean(STAND_INS.filter((id) => RIVALS[id].hero === h).map((id) => standIn.get(`${id}@${day}`)!)).foe);
      lines.push(`  day ${String(day).padStart(2)}: pool ref wins ${pct(p.rate)} margin ${sgn(p.margin)} | standInBuild wins: furnace ${hero("furnace")} weaver ${hero("weaver")} | ${each}`);
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
    // 0.8.0 N1 (oracle 94b9559fbb7da299 (7)): 16 road captains a day (the 12 and BRASSWICK, GRIMHOLD, MASTER VOSS, THANE
    // KARSK; LOCKJAW and THISTLEMAIL never ride the road), so 18 lines a day (14 before): 2 + 10 x 18 + 3 = 185
    expect(lines.length).toBe(2 + RUN_DAYS * 18 + (RUN_DAYS - MATRIARCH_DAY + 1));
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

  // 0.6.2 TUNE-C: Hard from day 2. On day 1 the Hard warlords read 41% against the FURNACE par field (K 24;
  // OUT/CAPTAINS-REPORT.md, the --rivals table), a miss accepted for luck (REQ-BFG-033): the day-1 good-luck value cap is
  // 8 g, and MOTH QUEEN (7 g), OLD BULWARK (7 g), HIGHSPIRE (6 g) and SILKSHADE (8 g) sit within 2 g of it while the
  // cheapest part costs 3 g; the warlord's PvE ramp also takes 27 hull on day 1 (ai.ts warlordHull).
  it("every day: a par deck beats Easy on average (mean margin > 0); from day 2 it loses to Hard (< 0)", () => {
    for (const day of DAYS) {
      expect(slotMean("easy", day).margin, `day ${day} easy`).toBeGreaterThan(0);
      if (day >= 2) expect(slotMean("hard", day).margin, `day ${day} hard`).toBeLessThan(0);
    }
  });

  // 0.8.0 I1 M3 (oracle 405facc95783b82c): the same predicate, every failing captain-day listed before one assertion, so
  // one run names them all (a loop of expects stopped at the first and hid SILKSHADE behind MOTH QUEEN); B1's three
  // open items (B1_EXCEPTIONS) are skipped, and the test after this one pins them
  it("days 8-10: the Iron Matriarch has the lowest margin of all", () => {
    const violations: string[] = [];
    for (const day of DAYS.filter((d) => d >= MATRIARCH_DAY)) {
      for (const id of eligible(day)) {
        if (id === "matriarch") continue;
        if (B1_EXCEPTIONS.some((x) => x.id === id && x.day === day)) continue; // B1's open item (oracle 405facc95783b82c)
        if (!(score(id, day).margin > score("matriarch", day).margin)) {
          violations.push(`day ${day}: ${id} ${fmt(score(id, day))} vs matriarch ${fmt(score("matriarch", day))}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("every day: the stand-in pool's mean margin is between -0.25 and +0.25", () => {
    for (const day of DAYS) {
      const p = poolMean(day).margin;
      expect(p, `day ${day} pool ${sgn(p)}`).toBeGreaterThanOrEqual(-0.25);
      expect(p, `day ${day} pool ${sgn(p)}`).toBeLessThanOrEqual(0.25);
    }
  });

  // 0.6.2 TUNE-C: the floor is 15 s (20 before). The retimed Easy and Medium decks beat the weak pacing-test decks
  // faster: day 1 24-33 s, day 2 19-23 s, day 3 15.5-20.6 s (lowest: the WEAVER pacing deck vs LACEWING on day 3,
  // 15.5 s). The round tunes no pacing (brief section 3 item 6: report fight lengths only); the genre study's typical
  // dusk fight is 10-30 s, and par's fights against the named decks are listed in OUT/CAPTAINS-REPORT.md.
  it("days 1-3: Easy and Medium captains keep the 0.4.0 pacing against the pacing-test decks (mean 15-45 s)", () => {
    const lines: string[] = [];
    for (const day of [1, 2, 3]) {
      for (const id of [...slotOn("easy", day), ...slotOn("medium", day)]) {
        for (const h of ["furnace", "weaver"] as HeroId[]) {
          const s = versus(playerDeck(h, day), rivalBuild(id, day), PACE_SEEDS);
          lines.push(`  pacing ${h} deck day ${day} vs ${RIVALS[id].name}: ${fmt(s)}`);
          expect(s.t, `${h} vs ${id} day ${day}`).toBeGreaterThanOrEqual(15);
          expect(s.t, `${h} vs ${id} day ${day}`).toBeLessThanOrEqual(45);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
  });
});
