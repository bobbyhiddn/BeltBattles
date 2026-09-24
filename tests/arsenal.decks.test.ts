// 0.6.1p: the deck-level check (brief 0.6.1p "Tests"; ARSENAL.md §4.3). For each module, star one copy in a par deck
// that uses it (the day-6 par decks, read from the golden-060 fixture, never written) or, for a module no par deck
// holds, in its bench deck (tests/arsenal.bench.ts, no hull bonus), and fight the other hero's day-6 par deck over
// 5 seeds. Mean damage dealt must not fall by more than 3% from 1 star to 2 to 3; STAMP PRESS must now rise.
// BB_TABLES=1 prints the table (REPORT.md).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import type { Build } from "../src/sim/deck";
import { bench, busy, factoryBench, gantryBench } from "./arsenal.bench";

const par = JSON.parse(readFileSync(new URL("./fixtures/golden-060/par.json", import.meta.url), "utf8")) as { decks: Record<string, Build> };
const clone = (b: Build): Build => JSON.parse(JSON.stringify(b)) as Build;
const SEEDS = [1, 2, 3, 4, 5];
const FURNACE = "par/furnace/6", WEAVER = "par/weaver/6";

/** The par deck `key` with its one copy of `def` (an item or a mod) at `stars`. */
function starredPar(key: string, def: string, stars: number): Build {
  const b = clone(par.decks[key]);
  const copies = [...b.items.filter((i) => i.def === def), ...b.mods.filter((m) => m.def === def)];
  if (copies.length !== 1) throw new Error(`${key} holds ${copies.length} ${def}`);
  if (stars > 1) copies[0].stars = stars;
  return b;
}

interface Case { id: string; deck: string; opp: string; at: (stars: number) => Build }

const ASM_GATES: [string, number, number, number][] = [["temper", 4, 4, 1], ["whetstone", 4, 2, 1], ["temper", 5, 3, 1], ["whetstone", 5, 1, 1]];

/** 0.6.1c: par/furnace/6 with its STAMP PRESS (the second intake) swapped for `def` at `stars` (report-only rows). */
function parSwap(def: string, stars: number): Build {
  const b = clone(par.decks[FURNACE]);
  const p = b.items.find((i) => i.def === "press")!;
  p.def = def;
  if (stars > 1) p.stars = stars;
  return b;
}

export const CASES: Case[] = [
  ...["temper", "brake", "longhaul", "press", "calibrate"].map((id): Case => ({ id, deck: FURNACE, opp: WEAVER, at: (s) => starredPar(FURNACE, id, s) })),
  ...["grease", "coil", "whetstone"].map((id): Case => ({ id, deck: WEAVER, opp: FURNACE, at: (s) => starredPar(WEAVER, id, s) })),
  // no par deck holds these: their bench decks (the Furnace bench; the busy bench for the chamber mods)
  { id: "splitter", deck: "bench", opp: WEAVER, at: (s) => bench([["splitter", 4, 3, s]], [], 0) },
  { id: "overdrive", deck: "bench", opp: WEAVER, at: (s) => bench([["overdrive", 4, 4, s]], [], 0) },
  { id: "chamber", deck: "busy bench", opp: WEAVER, at: (s) => busy([["chamber", s]], 0) },
  { id: "hopper", deck: "busy bench", opp: WEAVER, at: (s) => busy([["hopper", s]], 0) },
  { id: "mantlet", deck: "bench", opp: WEAVER, at: (s) => bench([], [["mantlet", s]], 0) },
  { id: "ram", deck: "busy bench", opp: WEAVER, at: (s) => busy([["ram", s]], 0) },
  // 0.6.1c: the six factories on their bench deck: the Kiln on the first heavy intake, the factory on the second.
  // ASSEMBLY LINE's deck has gates for it to commission (two on the Kiln's belt, two on its own) and CALIBRATION for
  // the second factory; GANTRY PRESS feeds both heavy intakes (the Kiln parked off-route) with CALIBRATION.
  ...["doublestamp", "shottower", "hotswap", "slagpot"].map((id): Case => ({ id, deck: "factory bench", opp: WEAVER, at: (s) => factoryBench(id, s, { hullBonus: 0 }) })),
  { id: "assembly", deck: "factory bench + 4 gates + calibrate", opp: WEAVER, at: (s) => factoryBench("assembly", s, { gates: ASM_GATES, mods: [["calibrate", 1]], hullBonus: 0 }) },
  { id: "gantry", deck: "gantry bench + calibrate", opp: WEAVER, at: (s) => gantryBench(s, [["calibrate", 1]], 0) },
];

// Report-only rows (Prime call item 4, no assertion): does a fuller chamber turn THREE-WAY into an upgrade?
// SPLITTER at 1-3 stars on its bench, with EXT. CHAMBER 3 stars or HOPPER 3 stars (BOTTOMLESS) on the turret.
export const REPORT_ONLY: Case[] = [
  { id: "splitter + chamber 3*", deck: "bench", opp: WEAVER, at: (s) => bench([["splitter", 4, 3, s]], [["chamber", 3]], 0) },
  { id: "splitter + hopper 3*", deck: "bench", opp: WEAVER, at: (s) => bench([["splitter", 4, 3, s]], [["hopper", 3]], 0) },
  // 0.6.1c (REPORT.md): each new factory in the par deck's STAMP PRESS slot, and the two decks the asserted ones replace
  // (ASSEMBLY LINE with no gate to commission, GANTRY PRESS without CALIBRATION): a faster factory into a full heavy
  // chamber mostly jams, which these rows show
  ...["doublestamp", "shottower", "hotswap", "slagpot", "assembly", "gantry"].map((id): Case => ({ id: `${id} in the press slot`, deck: FURNACE, opp: WEAVER, at: (s) => parSwap(id, s) })),
  { id: "assembly, no gates", deck: "factory bench", opp: WEAVER, at: (s) => factoryBench("assembly", s, { hullBonus: 0 }) },
  { id: "gantry, no calibrate", deck: "gantry bench", opp: WEAVER, at: (s) => gantryBench(s, [], 0) },
];

type Step = "1->2" | "2->3";

// Prime call, oracle e12bb91257ca8d00: fix in the post-wave-1 balance pass; this list must be empty before 0.6.1 reaches players.
// Both are still fought and printed; only the listed steps skip the 3% assertion (a plain allowlist, not a ratchet).
export const KNOWN_FALLS: { id: string; steps: Step[]; cause: string }[] = [
  { id: "splitter", steps: ["2->3"], cause: "THREE-WAY's third copy overfills the chamber (jams per fight 1.2 -> 6.0)" },
  { id: "brake", steps: ["1->2", "2->3"], cause: "the extra belt delay costs shots in fights of about 23 s" },
];
const known = (id: string, step: Step) => KNOWN_FALLS.some((k) => k.id === id && k.steps.includes(step));

export interface DeckRow { dmg: number; wins: number }

export function deckRows(c: Case): DeckRow[] {
  return [1, 2, 3].map((s) => {
    const fights = SEEDS.map((seed) => simulate(c.at(s), clone(par.decks[c.opp]), seed));
    return {
      dmg: fights.reduce((a, b) => a + b.sides[0].stats.damage, 0) / fights.length,
      wins: fights.filter((b) => b.winner === 0).length,
    };
  });
}

const line = (c: Case, r: DeckRow[]) => `${c.id} | ${c.deck} | ${c.opp} | ${r.map((x) => `${x.dmg.toFixed(1)} (${x.wins}W)`).join(" | ")}`;

describe("deck-level check: 1 -> 2 -> 3 stars never loses more than 3% of mean damage dealt (5 seeds)", () => {
  for (const c of CASES) {
    it(`${c.id} (${c.deck} vs ${c.opp})`, () => {
      const r = deckRows(c);
      const fall = KNOWN_FALLS.find((k) => k.id === c.id);
      if (fall) console.log(`KNOWN FALL (oracle e12bb91257ca8d00, ${fall.steps.join(", ")}: ${fall.cause}) ${line(c, r)}`);
      else if (process.env.BB_TABLES) console.log(`DECK ${line(c, r)}`);
      if (!known(c.id, "1->2")) expect(r[1].dmg, `${c.id} 1->2`).toBeGreaterThanOrEqual(r[0].dmg * 0.97);
      if (!known(c.id, "2->3")) expect(r[2].dmg, `${c.id} 2->3`).toBeGreaterThanOrEqual(r[1].dmg * 0.97);
      if (!fall) expect(r[2].dmg, `${c.id} 1->3`).toBeGreaterThanOrEqual(r[0].dmg * 0.97);
      if (c.id === "press") expect(r[0].dmg < r[1].dmg && r[1].dmg < r[2].dmg, "STAMP PRESS rises").toBe(true);
    });
  }

  it("report-only rows print with BB_TABLES=1 (no assertion: Prime call, item 4)", () => {
    if (!process.env.BB_TABLES) return;
    for (const c of REPORT_ONLY) console.log(`REPORT-ONLY ${line(c, deckRows(c))}`);
  });
});
