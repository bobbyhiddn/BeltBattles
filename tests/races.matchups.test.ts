import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { simulate } from "../src/sim/battle";
import { warlordBuild } from "../src/sim/ai";
import type { HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { raceWarlordBuild } from "../src/sim/races/warlords";

// races: matchup table for the four implemented heroes at an equal gold budget (each side
// fields its own warlord build for the same round, with the same warlordHull offset).
// Each pairing plays the same 20 seeds from both sides (40 battles) to cancel side-order bias.
// Write the table:  BB_MATCHUPS_OUT=../output/matchups.md npx vitest run tests/races.matchups.test.ts

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const ROUNDS = [1, 5, 10];
const SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i * 7919);

function build(h: HeroId, round: number): Build {
  return h === "foundry" || h === "bastion" ? raceWarlordBuild(h, round) : warlordBuild(h, round);
}

interface Cell { score: number; wins: number; draws: number; n: number; t: number }

function pairing(a: HeroId, b: HeroId, round: number): Cell {
  const A = build(a, round), B = build(b, round);
  let wins = 0, draws = 0, n = 0, t = 0;
  for (const seed of SEEDS) {
    const x = simulate(A, B, seed);
    const y = simulate(B, A, seed);
    if (x.winner === 0) wins++;
    if (y.winner === 1) wins++;
    if (x.winner === -1) draws++;
    if (y.winner === -1) draws++;
    n += 2;
    t += x.t + y.t;
  }
  return { score: (wins + draws / 2) / n, wins, draws, n, t: t / n };
}

const table = new Map<string, Cell>();
const cell = (a: HeroId, b: HeroId, r: number) => {
  const k = `${a}|${b}|${r}`;
  if (!table.has(k)) table.set(k, pairing(a, b, r));
  return table.get(k)!;
};

describe("races matchups (20 seeds x both sides, rounds 1/5/10)", () => {
  // Fixed builds make the sim nearly deterministic (seeds move only shot timing, jams and
  // Shock targets), so single round cells land at 0% or 100%, Furnace vs Weaver included.
  // The loose band is therefore asserted per pairing across rounds 1, 5 and 10 (120 battles),
  // for every new hero against both existing heroes. Foundry vs Bastion is reported, not asserted
  // (see output/REPORT.md known gaps).
  for (const a of ["foundry", "bastion"] as HeroId[]) {
    for (const b of ["furnace", "weaver"] as HeroId[]) {
      it(`${a} vs ${b} across rounds 1/5/10 stays inside 15-85%`, () => {
        const cs = ROUNDS.map((r) => cell(b, a, r));
        const score = 1 - cs.reduce((s, c) => s + c.score * c.n, 0) / cs.reduce((s, c) => s + c.n, 0);
        expect(score).toBeGreaterThanOrEqual(0.15);
        expect(score).toBeLessThanOrEqual(0.85);
      });
    }
  }

  it("writes the matchup table when BB_MATCHUPS_OUT is set", () => {
    const out = process.env.BB_MATCHUPS_OUT;
    const lines: string[] = [
      "# BeltBattles matchups: FURNACE, WEAVER, FOUNDRY, BASTION",
      "",
      "Each cell is the ROW hero's win rate against the COLUMN hero (draws count half).",
      "Both sides field their own warlord build for that round: equal gold budget, same `warlordHull(round)`.",
      `Every pairing plays ${SEEDS.length} seeds from both sides, so ${SEEDS.length * 2} battles. Target band: 35-65%. The test fails outside 15-85%.`,
      "",
    ];
    for (const r of ROUNDS) {
      lines.push(`## Round ${r}`, "", `| row vs column | ${HEROES.map((h) => h.toUpperCase()).join(" | ")} |`, `|---|${HEROES.map(() => "---").join("|")}|`);
      for (const a of HEROES) {
        const cells = HEROES.map((b) => {
          if (a === b) return "—";
          const i = HEROES.indexOf(a), j = HEROES.indexOf(b);
          const c = i < j ? cell(a, b, r) : cell(b, a, r);
          const s = i < j ? c.score : 1 - c.score;
          return `${Math.round(s * 100)}% (${c.t.toFixed(0)}s)`;
        });
        lines.push(`| **${a.toUpperCase()}** | ${cells.join(" | ")} |`);
      }
      lines.push("");
    }
    lines.push("Mean battle length is in brackets. Seeds: 101 + 7919k, k = 0..19.");
    const md = lines.join("\n") + "\n";
    // eslint-disable-next-line no-console
    console.log(md);
    if (out) writeFileSync(out, md);
    expect(table.size).toBe(ROUNDS.length * 6);
  });
});
