import { describe, expect, it } from "vitest";
import { validateBuild } from "../src/net/validate";
import { AUDIT_PATHS, driveRuns, errorKind, type DriverRun, type RoadPolicy } from "./uploadDriver";
import { withNpcDay } from "../src/sim/npcDay"; // AZ-BUMP (the flip): the audit's paths are 0.9.7's road (below)

// v070-validate M1: what today's strict check (validateBuild) does to honest dusk decks. The seeded driver
// (tests/uploadDriver.ts) plays through the real game functions; each isolated path takes one road choice
// (or one warlord tier) and nothing else from the road, so a refusal is that path's doing. REPORT.md §1.

const RUNS_PER_PATH = Number(process.env.V070_AUDIT_RUNS ?? 60);
const MIXED_RUNS = Number(process.env.V070_AUDIT_MIXED ?? 300);

/** Does this dusk's road stop count as the path firing? */
function fired(policy: RoadPolicy, road: string): boolean {
  if (policy === "none" || policy === "mixed") return false;
  if (policy.startsWith("warlord:")) return road.startsWith(`${policy.slice(8)} `) && road.includes(": win");
  const [, id, label] = policy.split("|")[0].split(":");
  return road === `event ${id}: ${label}` || road === `event ${id}: ${label} (won)`;
}

interface PathRow { policy: RoadPolicy; runs: number; firedRuns: number; exposed: number; refused: number; kinds: Map<string, number> }

/** Decks at or after the day the path first fired in their run ("none"/"mixed": every deck). */
function audit(policy: RoadPolicy, runs: DriverRun[]): PathRow {
  const row: PathRow = { policy, runs: runs.length, firedRuns: 0, exposed: 0, refused: 0, kinds: new Map() };
  for (const r of runs) {
    const first = policy === "none" || policy === "mixed" ? 1 : r.dusks.find((d) => fired(policy, d.road))?.day ?? Infinity;
    if (first !== Infinity) row.firedRuns++;
    for (const d of r.dusks) {
      if (d.day < first) continue;
      row.exposed++;
      const v = validateBuild(d.build, d.day);
      if (v.ok) continue;
      row.refused++;
      for (const k of new Set(v.errors.map(errorKind))) row.kinds.set(k, (row.kinds.get(k) ?? 0) + 1);
    }
  }
  return row;
}

const fmt = (r: PathRow) => `${r.policy.padEnd(34)} runs ${r.runs} fired ${r.firedRuns} decks ${r.exposed} refused ${r.refused}`
  + ` (${r.exposed ? ((100 * r.refused) / r.exposed).toFixed(0) : 0}%)` + [...r.kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `\n    ${n} x ${k}`).join("");

describe("v070 M1 audit: today's validateBuild on honest dusk decks", () => {
  const rows = new Map<RoadPolicy, PathRow>();
  const all: DriverRun[] = [];
  // AZ-BUMP (the flip, NPC_DAY): the audit isolates 0.9.7's road paths (one road stop a day: an event's choice or a warlord
  // tier, nothing from the road on the other days) and fired() reads 0.9.7's road words. With NPC_DAY on every day is a
  // fight and then the day's event, so no path is isolated (the "none" policy meets events with no empty choice) and no
  // event stop reads as fired; so the runs are driven with NPC_DAY off. The NPC day's decks are net-upload.driver's (the
  // player mode with the road log)
  const mixed = withNpcDay(() => {
    for (const p of AUDIT_PATHS) {
      const runs = driveRuns(RUNS_PER_PATH, 5000, undefined, p);
      all.push(...runs);
      rows.set(p, audit(p, runs));
    }
    const mixedRuns = driveRuns(MIXED_RUNS, 1);
    all.push(...mixedRuns);
    return audit("mixed", mixedRuns);
  }, false);

  it("prints the per-path table (REPORT.md §1)", () => {
    console.log(`v070 M1 audit (strict validateBuild), ${RUNS_PER_PATH} runs per path, ${MIXED_RUNS} mixed runs:\n`
      + [...rows.values(), mixed].map(fmt).join("\n"));
  });

  it("every dusk deck keeps the merge invariant: no unfused pair anywhere in the run", () => {
    const bad = all.flatMap((r) => r.dusks.filter((d) => d.invariant.length).map((d) => `${r.hero} #${r.seed} d${d.day}: ${d.invariant.join(", ")}`));
    expect(bad).toEqual([]);
  });

  it("the shop alone never leaves maxGoldByDay: strict accepts every deck of the no-road policy", () => {
    const r = rows.get("none")!;
    expect(r.exposed).toBe(RUNS_PER_PATH * 10);
    expect(r.refused, fmt(r)).toBe(0);
  });

  it("dock PLATING and RIDE THROUGH put the hull off the +25 grid: strict refuses every deck after them", () => {
    for (const p of ["event:dock:PLATING", "event:storm:RIDE THROUGH"] as RoadPolicy[]) {
      const r = rows.get(p)!;
      expect(r.firedRuns, p).toBeGreaterThan(RUNS_PER_PATH / 2);
      expect(r.refused, fmt(r)).toBe(r.exposed);
      expect([...r.kinds.keys()].some((k) => k.startsWith("supply: hullBonus")), fmt(r)).toBe(true);
    }
  });

  it("road value puts honest decks over maxGoldByDay: strict refuses them on budget", () => {
    for (const p of ["warlord:hard", "event:dice:BET 6", "event:wreck:SALVAGE"] as RoadPolicy[]) {
      const r = rows.get(p)!;
      expect(r.refused, fmt(r)).toBeGreaterThan(0);
      expect([...r.kinds.keys()].some((k) => k.startsWith("budget:")), fmt(r)).toBe(true);
    }
    expect(mixed.refused).toBeGreaterThan(0);
    expect([...mixed.kinds.keys()].some((k) => k.startsWith("budget:"))).toBe(true);
    expect([...mixed.kinds.keys()].some((k) => k.startsWith("supply:"))).toBe(true);
  });

  it("only supply and budget errors: the driver's decks are otherwise legal (geometry, items, merges)", () => {
    const other = [...rows.values(), mixed].flatMap((r) => [...r.kinds.keys()].filter((k) => !/^(supply|budget):/.test(k)).map((k) => `${r.policy}: ${k}`));
    expect(other).toEqual([]);
  });
});
