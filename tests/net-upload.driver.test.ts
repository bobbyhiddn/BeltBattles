import { describe, expect, it } from "vitest";
import { RUN_DAYS } from "../src/sim/content";
import { playerFits, roadCap } from "../src/net/roadCap";
import { buildCost, maxGoldByDay, validateBuild, validateUpload } from "../src/net/validate";
import { AUDIT_PATHS, DRIVER_HEROES, driveRuns, errorKind, type DriverRun } from "./uploadDriver";

// v070-validate M3: the M1 driver as a test. Every dusk deck of every seeded run is an honest deck (the driver
// only plays legal actions through the real game functions), so the player mode must refuse none of them; the
// strict mode must still refuse today's (the hull off the plating grid, road value over maxGoldByDay), which
// shows the driver really reaches the road.

const RUNS = Number(process.env.V070_DRIVER_RUNS ?? 2400); // 400 per hero
const PATH_RUNS = Number(process.env.V070_DRIVER_PATH_RUNS ?? 36);

interface Tally { decks: number; strict: number; strictKinds: Map<string, number>; player: string[]; extra: number[]; room: number[] }

function tally(runs: DriverRun[]): Tally {
  const t: Tally = { decks: 0, strict: 0, strictKinds: new Map(), player: [], extra: new Array(RUN_DAYS + 1).fill(-Infinity), room: new Array(RUN_DAYS + 1).fill(Infinity) };
  for (const r of runs) {
    for (const d of r.dusks) {
      t.decks++;
      const s = validateBuild(d.build, d.day);
      if (!s.ok) {
        t.strict++;
        for (const k of new Set(s.errors.map(errorKind))) t.strictKinds.set(k, (t.strictKinds.get(k) ?? 0) + 1);
      }
      const p = validateUpload(d.build, d.day);
      if (!p.ok) t.player.push(`${r.hero} #${r.seed} d${d.day} (${d.road}): ${p.errors.join(" | ")}`);
      // how close the driver came to the ceiling (REPORT.md §2 slack): road value used beyond the shop's gold
      const c = buildCost(d.build);
      const best = playerFits(d.build, d.day, c).fits[0];
      if (best) {
        t.room[d.day] = Math.min(t.room[d.day], best.allow - best.cost);
        if (!best.mix.labels.length) t.extra[d.day] = Math.max(t.extra[d.day], best.cost - maxGoldByDay(d.day));
      }
    }
  }
  return t;
}

describe("v070 M3: the upload driver through both modes", () => {
  it(`player mode refuses none of ${RUNS} seeded runs x 10 dusks; strict still refuses today's`, () => {
    const runs = driveRuns(RUNS, 1);
    const t = tally(runs);
    const heroes = new Set(runs.map((r) => r.hero));
    console.log(`v070 driver: ${runs.length} runs (${[...heroes].join(", ")}), ${t.decks} dusk decks; strict refused ${t.strict}, player refused ${t.player.length}\n`
      + [...t.strictKinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `  strict ${n} x ${k}`).join("\n")
      + `\n  day: roadCap | most road value seen on a shop-grid deck (cost - maxGoldByDay) | least room left under the player ceiling\n`
      + Array.from({ length: RUN_DAYS }, (_, i) => `  d${i + 1}: ${roadCap(i + 1)} | ${t.extra[i + 1]} | ${t.room[i + 1]}`).join("\n"));
    expect(runs.length).toBeGreaterThanOrEqual(2000);
    expect(heroes).toEqual(new Set(DRIVER_HEROES));
    expect(t.decks).toBe(runs.length * RUN_DAYS); // all ten dusks of every run
    expect(t.player.slice(0, 5)).toEqual([]);
    expect(t.strict).toBeGreaterThan(t.decks / 4);
    expect([...t.strictKinds.keys()].some((k) => k.startsWith("budget:"))).toBe(true);
    expect([...t.strictKinds.keys()].some((k) => k.startsWith("supply: hullBonus"))).toBe(true);
    for (let d = 1; d <= RUN_DAYS; d++) expect(t.room[d]).toBeGreaterThanOrEqual(0);
  }, 900_000);

  it("each isolated road path of the M1 audit: the player mode refuses none", () => {
    const bad: string[] = [];
    let decks = 0;
    for (const p of AUDIT_PATHS) {
      const t = tally(driveRuns(PATH_RUNS, 9000, undefined, p));
      decks += t.decks;
      bad.push(...t.player.map((x) => `${p}: ${x}`));
    }
    expect(decks).toBe(AUDIT_PATHS.length * PATH_RUNS * RUN_DAYS);
    expect(bad.slice(0, 5)).toEqual([]);
  }, 900_000);
});
