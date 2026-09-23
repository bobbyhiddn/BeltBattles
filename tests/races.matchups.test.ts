import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { simulate, type Battle } from "../src/sim/battle";
import type { HeroId } from "../src/sim/content";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { buildCost, expectSane, maxGoldByDay } from "./races.helpers";

// races: 6x6 matchup table of the reference builds (src/sim/heroBuilds.ts) on days 1, 5 and 10.
// Every pairing plays the same 20 seeds from both sides (40 battles). Only sanity is asserted:
// every battle ends before BATTLE_CAP with finite numbers, and both sides fire. No win-rate bands:
// fixed builds make nearly every cell 0% or 100%, and balance is measured over populations of
// legal builds by the separate balance harness. Write the table:
//   BB_MATCHUPS_OUT=../output/matchups6.md npx vitest run tests/races.matchups.test.ts

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
const DAYS = [1, 5, 10];
const SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i * 7919);

interface Cell { score: number; wins: number; draws: number; n: number; t: number }

function check(bt: Battle): void {
  expectSane(bt);
  expect(bt.sides[0].stats.shots).toBeGreaterThan(0);
  expect(bt.sides[1].stats.shots).toBeGreaterThan(0);
}

function pairing(a: HeroId, b: HeroId, day: number): Cell {
  const A = heroRefBuild(a, day), B = heroRefBuild(b, day);
  let wins = 0, draws = 0, n = 0, t = 0;
  for (const seed of SEEDS) {
    const x = simulate(A, B, seed);
    const y = simulate(B, A, seed);
    check(x);
    check(y);
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
const cell = (a: HeroId, b: HeroId, d: number): Cell => {
  const k = `${a}|${b}|${d}`;
  if (!table.has(k)) table.set(k, pairing(a, b, d));
  return table.get(k)!;
};

describe("races 6x6 matchups (reference builds, 20 seeds x both sides, days 1/5/10)", () => {
  for (const d of DAYS) {
    it(`day ${d}: all 15 pairings end before the cap, with no NaN, and both sides fire`, () => {
      for (let i = 0; i < HEROES.length; i++) for (let j = i + 1; j < HEROES.length; j++) cell(HEROES[i], HEROES[j], d);
      expect([...table.keys()].filter((k) => k.endsWith(`|${d}`))).toHaveLength(15);
    });
  }

  it("writes the table when BB_MATCHUPS_OUT is set", () => {
    const lines: string[] = [
      "# BeltBattles matchups: all six heroes (reference builds)",
      "",
      "Each cell is the ROW hero's win rate against the COLUMN hero (draws count half), with the mean",
      "battle length in brackets. Both sides field `heroRefBuild(hero, day)`: honest decks for that day",
      `(cost within maxGoldByDay). Every pairing plays ${SEEDS.length} seeds from both sides: ${SEEDS.length * 2} battles.`,
      "Fixed builds make the sim nearly deterministic, so most cells are 0% or 100%. This is a report,",
      "not a balance target: the balance harness measures populations of legal builds.",
      "",
    ];
    for (const d of DAYS) {
      lines.push(`## Day ${d} (budget ${maxGoldByDay(d)} g)`, "");
      lines.push(`| row vs column | ${HEROES.map((h) => h.toUpperCase()).join(" | ")} |`, `|---|${HEROES.map(() => "---").join("|")}|`);
      for (const a of HEROES) {
        const cells = HEROES.map((b) => {
          if (a === b) return "—";
          const i = HEROES.indexOf(a), j = HEROES.indexOf(b);
          const c = i < j ? cell(a, b, d) : cell(b, a, d);
          const s = i < j ? c.score : 1 - c.score;
          return `${Math.round(s * 100)}% (${c.t.toFixed(0)}s)`;
        });
        lines.push(`| **${a.toUpperCase()}** | ${cells.join(" | ")} |`);
      }
      const gold = HEROES.map((h) => `${h} ${buildCost(heroRefBuild(h, d))}`).join(", ");
      lines.push("", `Deck cost (gold): ${gold}.`, "");
    }
    lines.push("Seeds: 101 + 7919k, k = 0..19.");
    const md = lines.join("\n") + "\n";
    // eslint-disable-next-line no-console
    console.log(md);
    if (process.env.BB_MATCHUPS_OUT) writeFileSync(process.env.BB_MATCHUPS_OUT, md);
    expect(table.size).toBe(DAYS.length * 15);
  });
});
