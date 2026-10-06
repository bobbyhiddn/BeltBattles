// LC-1 (REQ-BFG-073): every model of lives follows LAST CHANCE with its switch on, and is today's with it off.
//  - src/net/records.ts reachableRecords, checked against the run code (newRun, startDusk, finishDay) over every
//    win/loss/draw pattern of days 1-9 (no road stop: PATCH UP is the DOCK's, modelled apart and unchanged);
//  - tools/scorecard/survival.ts: the smallest model (modelCompletes) against the run code on every loss pattern, and the
//    audit reads the rule off the run code;
//  - src/tooling.ts makeGhost's lives; server/seed.ts checkPool takes a LAST CHANCE ghost's record and card.
// Then (read only, nothing written): how the seed pool's labels would move at the flip (tools/samplePool.ts).
import { afterEach, describe, expect, it } from "vitest";
import type { SideStats } from "../src/sim/battle";
import { RUN_DAYS, START_LIVES } from "../src/sim/content";
import { LAST_CHANCE_LIVES, setLastChance, withLastChance } from "../src/sim/lastChance";
import { newRun } from "../src/game/run";
import { finishDay, startDusk } from "../src/game/day";
import { floorRecord, isReachable, reachableRecords } from "../src/net/records";
import { lifeAudit, modelCompletes, runPattern, type LifeRules } from "../tools/scorecard/survival";
import { makeGhost } from "../src/tooling";
import { generateSamplePool, uncoveredStates } from "../tools/samplePool";

const Z: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };

afterEach(() => setLastChance(false));

/** Every (wins, lives) the run code carries into dusk `day` over all results of the dusks before it (no road stop). */
function runCodeRecords(day: number): string[] {
  const seen = new Set<string>();
  const n = 3 ** (day - 1);
  for (let m = 0; m < n; m++) {
    const run = newRun("furnace", 99, "lc1-models");
    let k = m;
    for (let d = 1; d < day && !run.over; d++) {
      const r = k % 3;
      k = Math.floor(k / 3);
      startDusk(run, []);
      finishDay(run, r === 0 ? 0 : r === 1 ? 1 : -1, 20, { ...Z }, { ...Z });
    }
    if (!run.over) seen.add(`${run.wins}|${run.lives}`);
  }
  return [...seen].sort();
}

const modelRecords = (day: number): string[] => reachableRecords(day, { patchUp: false }).map((r) => `${r.wins}|${r.lives}`).sort();

describe("LC-1: records.ts follows LAST CHANCE (switch on) and is today's (off)", () => {
  it("reachableRecords equals the run code's records at every dusk 1-9, off and on", () => {
    for (const on of [false, true]) {
      withLastChance(() => {
        for (let day = 1; day <= 9; day++) expect(modelRecords(day), `${on ? "on" : "off"} day ${day}`).toEqual(runCodeRecords(day));
      }, on);
    }
  }, 120_000);

  it("on: no 1-life record before dusk 7; the floor rises to 2 lives on days 6 (no 1 yet); off: as before", () => {
    const off = Array.from({ length: RUN_DAYS }, (_, i) => floorRecord(i + 1));
    const on = withLastChance(() => Array.from({ length: RUN_DAYS }, (_, i) => floorRecord(i + 1)));
    expect(off.map((r) => r.lives)).toEqual([5, 4, 4, 3, 2, 1, 1, 1, 1, 1]);
    expect(on.map((r) => r.lives)).toEqual([5, 4, 4, 3, 2, 2, 1, 1, 1, 1]);
    withLastChance(() => {
      expect(isReachable(6, 0, 1)).toBe(false);
      expect(isReachable(7, 0, 1)).toBe(true);
    });
  });
});

describe("LC-1: survival.ts's exact model follows LAST CHANCE", () => {
  it("modelCompletes agrees with the run code on every loss pattern, switch on and off; the audit reads the rule", () => {
    for (const on of [false, true]) {
      withLastChance(() => {
        const a = lifeAudit("furnace", 4242);
        expect(a.rules.lastChance).toBe(on ? LAST_CHANCE_LIVES : undefined);
        const r: LifeRules = a.rules;
        for (let mask = 0; mask < 2 ** RUN_DAYS; mask++) {
          const lost = Array.from({ length: RUN_DAYS }, (_, d) => ((mask >> d) & 1) === 1);
          expect(modelCompletes(r, lost), `${on ? "on" : "off"} ${mask}`).toBe(runPattern("furnace", 4242, mask).complete);
        }
      }, on);
    }
  }, 120_000);
});

describe("LC-1: tooling.ts and server/seed.ts", () => {
  it("makeGhost's lives: off START_LIVES - losses (at least 1); on, a ghost that fell to 1 life had one back", () => {
    expect([0, 3, 4, 5].map((losses) => makeGhost({ day: 8, losses }).lives)).toEqual([5, 2, 1, 1]);
    withLastChance(() => expect([0, 3, 4, 5].map((losses) => makeGhost({ day: 8, losses }).lives)).toEqual([5, 2, 2, 1]));
    expect(START_LIVES).toBe(5);
  });
});

describe("LC-1: the seed pool at the flip (read only; nothing is regenerated)", () => {
  it("counts the sample pool's labels a run under LAST CHANCE can't carry, and the coverage gaps it would leave", () => {
    const pool = generateSamplePool(); // today's 120 seed ghosts (the switch off)
    const moved = withLastChance(() => pool.filter((g) => !isReachable(g.day, g.wins, g.lives)));
    const gaps = withLastChance(() => uncoveredStates(pool));
    const byDay = (xs: readonly { day: number }[]) => Array.from({ length: RUN_DAYS }, (_, i) => xs.filter((x) => x.day === i + 1).length);
    const byHero = (xs: readonly { hero: string }[]) => [...new Set(pool.map((g) => g.hero))].map((h) => `${h} ${xs.filter((x) => x.hero === h).length}`);
    console.log(`LC1-POOL ${pool.length} seed ghosts; unreachable with LAST CHANCE on: ${moved.length} (by day ${byDay(moved).join(",")}; ${byHero(moved).join(", ")}); ` +
      `coverage gaps on: ${gaps.length} (by day ${byDay(gaps).join(",")}): ${gaps.slice(0, 12).map((g) => `d${g.day} ${g.wins}W ${g.lives}L (${g.eligible})`).join(", ")}`);
    expect(pool.length).toBe(120);
    console.log(`LC1-MOVED ${moved.map((g) => `${g.hero} d${g.day} ${g.wins}W ${g.lives}L`).join(", ")}`);
    expect(moved.length).toBe(6);
    expect(moved.every((g) => g.lives === 1)).toBe(true); // only 1-life labels: the loss that left 1 life fired it
    expect(gaps).toEqual([]);
    expect(withLastChance(() => pool.filter((g) => !isReachable(g.day, g.wins, g.lives)), false)).toEqual([]);
  }, 300_000);
});
