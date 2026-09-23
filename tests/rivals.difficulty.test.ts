import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import type { Build } from "../src/sim/deck";
import type { HeroId } from "../src/sim/content";
import { RIVALS, RIVAL_IDS, rivalBuild, rivalPool, rivalRounds, type RivalId } from "../src/sim/rivals";

// Difficulty ladder (0.6.0 brief). The reference opponent is today's warlord of the other
// faction at the same round, fought as the player (side 0) over 20 seeds. A lower reference
// win rate means a harder rival. Battles barely vary by seed, so rates are mostly 0 or 1 per
// round; the mean hull margin (reference hull left minus rival hull left, as fractions)
// breaks ties. Orderings are asserted loosely; the full table goes to the test log.

const SEEDS = Array.from({ length: 20 }, (_, i) => (i + 1) * 7919);
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

const rivalScore = new Map<RivalId, Score>();
for (const id of RIVAL_IDS) {
  const h = RIVALS[id].hero;
  rivalScore.set(id, mean(rivalRounds(id).map((r) => versus(warlordBuild(other(h), r), rivalBuild(id, r)))));
}
/** Today's warlord of a faction at rounds 1-3, against the same reference. */
const warlordScore = (h: HeroId, r: number) => versus(warlordBuild(other(h), r), warlordBuild(h, r));
const score = (id: RivalId) => rivalScore.get(id)!;

/** The player decks tests/pacing.test.ts uses for rounds 1-3: the start deck plus 0-2 gates. */
function playerDeck(h: HeroId, round: number): Build {
  const b = JSON.parse(JSON.stringify(startingBuild(h, 1))) as Build;
  const gates: [string, number, number][] = h === "furnace"
    ? [["temper", 4, 3], ["whetstone", 4, 2]]
    : [["grease", 4, 3], ["whetstone", 1, 3]];
  gates.slice(0, Math.min(2, round - 1)).forEach(([def, x, y], i) => b.items.push({ uid: 500 + i, def, x, y }));
  return b;
}
const fmt = (s: Score) => `ref wins ${(s.rate * 100).toFixed(0).padStart(3)}%  margin ${s.margin.toFixed(3).padStart(6)}  avg ${s.t.toFixed(1)}s`;

describe("rival difficulty ladder (reference = other faction's warlord, 20 seeds)", () => {
  it("prints the ladder", () => {
    const lines = ["rival difficulty (reference win rate vs rival at its scheduled rounds):"];
    for (const id of RIVAL_IDS) {
      const d = RIVALS[id];
      lines.push(`  ${d.name.padEnd(14)} ${d.hero.padEnd(7)} T${d.tier} ${d.rank.padEnd(7)} r${rivalRounds(id).join(",").padEnd(8)} ${fmt(score(id))}`);
      for (const r of rivalRounds(id)) {
        lines.push(`      r${String(r).padEnd(2)} ${fmt(versus(warlordBuild(other(d.hero), r), rivalBuild(id, r)))}`);
      }
    }
    for (const h of ["furnace", "weaver"] as HeroId[]) {
      for (const r of [1, 2, 3]) lines.push(`  warlord ${h.padEnd(7)} r${r}: ${fmt(warlordScore(h, r))}`);
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
    expect(lines.length).toBeGreaterThan(RIVAL_IDS.length + 7);
  });

  it("tier-1 rivals are no harder than today's round 1-3 warlords of their faction", () => {
    for (const id of rivalPool(1, "regular")) {
      const h = RIVALS[id].hero;
      const base = [1, 2, 3].map((r) => warlordScore(h, r));
      const s = score(id);
      expect(s.rate, id).toBeGreaterThanOrEqual(Math.min(...base.map((b) => b.rate)));
      expect(s.margin, id).toBeGreaterThanOrEqual(Math.min(...base.map((b) => b.margin)) - 0.05);
    }
  });

  it("each act elite is harder than every regular rival of its act", () => {
    for (const act of [1, 2] as const) {
      const [elite] = rivalPool(act, "elite");
      for (const id of rivalPool(act, "regular")) {
        expect(score(elite).rate, `${elite} vs ${id}`).toBeLessThanOrEqual(score(id).rate);
        expect(score(elite).margin, `${elite} vs ${id}`).toBeLessThan(score(id).margin);
      }
    }
  });

  it("regular rivals get harder act by act, relative to the round's own warlord", () => {
    const act = (a: 1 | 2 | 3) => mean(rivalPool(a, "regular").map(score));
    // eslint-disable-next-line no-console
    console.log(`act means: 1 ${fmt(act(1))} | 2 ${fmt(act(2))} | 3 ${fmt(act(3))}`);
    expect(act(2).margin).toBeLessThanOrEqual(act(1).margin + 0.1);
    expect(act(3).margin).toBeLessThan(act(1).margin);
    expect(act(3).margin).toBeLessThan(act(2).margin);
    expect(act(3).rate).toBeLessThan(act(1).rate);
  });

  it("the boss is the hardest rival of all", () => {
    const [boss] = rivalPool(3, "boss");
    for (const id of RIVAL_IDS) {
      if (id === boss) continue;
      expect(score(boss).rate, `${boss} vs ${id}`).toBeLessThanOrEqual(score(id).rate);
      expect(score(boss).margin, `${boss} vs ${id}`).toBeLessThan(score(id).margin);
    }
  });

  it("act 1 keeps the 0.4.0 pacing against the pacing-test player decks (mean 20-45 s)", () => {
    const lines: string[] = [];
    for (const id of [...rivalPool(1, "regular"), ...rivalPool(1, "elite")]) {
      for (const r of rivalRounds(id)) {
        for (const h of ["furnace", "weaver"] as HeroId[]) {
          const s = versus(playerDeck(h, r), rivalBuild(id, r));
          lines.push(`  pacing ${h} deck r${r} vs ${RIVALS[id].name}: ${fmt(s)}`);
          expect(s.t, `${h} vs ${id} r${r}`).toBeGreaterThanOrEqual(20);
          expect(s.t, `${h} vs ${id} r${r}`).toBeLessThanOrEqual(45);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
  });
});
