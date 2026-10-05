import { describe, expect, it } from "vitest";
import { RUN_DAYS } from "../src/sim/content";
import { playerFits, roadCap } from "../src/net/roadCap";
import { buildCost, maxGoldByDay, validateBuild, validateUpload } from "../src/net/validate";
import { runeGrants } from "../src/sim/runes";
import { AUDIT_PATHS, DRIVER_HEROES, driveRuns, errorKind, type DriverRun } from "./uploadDriver";
import { playerCheck } from "./netHelpers";

// v070-validate M3: the M1 driver as a test. Every dusk deck of every seeded run is an honest deck (the driver
// only plays legal actions through the real game functions), so the player mode must refuse none of them; the
// strict mode must still refuse today's (the hull off the plating grid, road value over maxGoldByDay), which
// shows the driver really reaches the road.
// FLIP-X2 (cap's ruling 5d6d83ef57d1494c, item 5): the driver now takes each dawn's rune (tests/uploadDriver.ts), so its
// decks hold one rune a dawn, as an upload must. The tally's own readings of a deck (the cost parity, the room under the
// ceiling, the road value) read it as validate.ts does: its runes' HULL and BELT out of hullBonus / beltCap (the bought
// deck) and their dawn gold added to the ceiling (runes.ts runeGrants). A rune-less deck reads exactly as before.

const RUNS = Number(process.env.V070_DRIVER_RUNS ?? 2400); // 400 per hero
const PATH_RUNS = Number(process.env.V070_DRIVER_PATH_RUNS ?? 36);

interface Tally {
  decks: number; strict: number; strictKinds: Map<string, number>; player: string[]; extra: number[]; room: number[];
  // 062m (M5 recheck 5): the 0.6.2 mechanics on the dusk decks, and the player/strict cost parity
  bought: number; freeMerged: number; turretCost: number; joined: number; joins: number; parity: string[]; ops: Map<string, number>;
}

function tally(runs: DriverRun[]): Tally {
  const t: Tally = {
    decks: 0, strict: 0, strictKinds: new Map(), player: [], extra: new Array(RUN_DAYS + 1).fill(-Infinity), room: new Array(RUN_DAYS + 1).fill(Infinity),
    bought: 0, freeMerged: 0, turretCost: 0, joined: 0, joins: 0, parity: [], ops: new Map(),
  };
  for (const r of runs) {
    for (const [op, n] of Object.entries(r.ops)) t.ops.set(op, (t.ops.get(op) ?? 0) + n);
    for (const d of r.dusks) {
      t.decks++;
      const list = d.build.turrets ?? [];
      if (list.some((x) => !x.free)) t.bought++;
      if (list.some((x) => x.free && (x.stars ?? 1) > 1)) t.freeMerged++;
      if ((buildCost(d.build).turrets ?? 0) > 0) t.turretCost++;
      const j = d.build.routes.filter((x) => x.join !== undefined).length;
      if (j) t.joined++;
      t.joins += j;
      // FLIP-X2: the deck as validate.ts reads it (validateBuild's `bought` and `grant`): the runes' HULL and BELT out, their
      // dawn gold on the ceiling. Was the deck as it stands, which costs a HULL or BELT rune as plating or crates
      const g = runeGrants(d.build.runes, d.day);
      const bought = g.hull || g.belt ? { ...d.build, hullBonus: d.build.hullBonus - g.hull, beltCap: d.build.beltCap - g.belt } : d.build;
      // recheck 1 on every deck: on the shop's grid the player mode costs the deck exactly as buildCost does
      const plain = playerFits(bought, d.day, buildCost(bought)).fits.find((f) => f.mix.key === "");
      if (plain && plain.cost !== buildCost(bought).total) t.parity.push(`${r.hero} #${r.seed} d${d.day}: player ${plain.cost} vs buildCost ${buildCost(bought).total}`);
      const s = validateBuild(d.build, d.day);
      if (!s.ok) {
        t.strict++;
        for (const k of new Set(s.errors.map(errorKind))) t.strictKinds.set(k, (t.strictKinds.get(k) ?? 0) + 1);
      }
      const p = playerCheck(d.build, d.day); // 0.8.0 H1: the upload check of rules that accept the deck's hero
      if (!p.ok) t.player.push(`${r.hero} #${r.seed} d${d.day} (${d.road}): ${p.errors.join(" | ")}`);
      // how close the driver came to the ceiling (REPORT.md §2 slack): road value used beyond the shop's gold
      // (FLIP-X2: the ceiling and the shop's gold each with the runes' dawn gold, as playerSupplyBudget's runeGold)
      const c = buildCost(bought);
      const best = playerFits(bought, d.day, c).fits[0];
      if (best) {
        t.room[d.day] = Math.min(t.room[d.day], best.allow + g.gold - best.cost);
        if (!best.mix.labels.length) t.extra[d.day] = Math.max(t.extra[d.day], best.cost - maxGoldByDay(d.day) - g.gold);
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
      + Array.from({ length: RUN_DAYS }, (_, i) => `  d${i + 1}: ${roadCap(i + 1)} | ${t.extra[i + 1]} | ${t.room[i + 1]}`).join("\n")
      + `\n  062m mechanics on the dusk decks: ${t.bought} with a bought turret installed, ${t.freeMerged} with a starting turret merged up,`
      + ` ${t.turretCost} with turret value in buildCost, ${t.joined} with a joined belt (${t.joins} joins); player/strict cost mismatches ${t.parity.length}\n`
      + `  operations over all runs: ${[...t.ops].sort().map(([k, n]) => `${k} ${n}`).join(", ")}`);
    expect(runs.length).toBeGreaterThanOrEqual(2000);
    expect(heroes).toEqual(new Set(DRIVER_HEROES));
    expect(t.decks).toBe(runs.length * RUN_DAYS); // all ten dusks of every run
    expect(t.player.slice(0, 5)).toEqual([]);
    expect(t.strict).toBeGreaterThan(t.decks / 4);
    expect([...t.strictKinds.keys()].some((k) => k.startsWith("budget:"))).toBe(true);
    expect([...t.strictKinds.keys()].some((k) => k.startsWith("supply: hullBonus"))).toBe(true);
    for (let d = 1; d <= RUN_DAYS; d++) expect(t.room[d]).toBeGreaterThanOrEqual(0);
    // 062m recheck 5: the driver really plays the turrets and the joins, and the player mode costs them as strict does
    expect(t.parity.slice(0, 5)).toEqual([]);
    expect(t.bought).toBeGreaterThan(t.decks / 20);
    expect(t.turretCost).toBeGreaterThan(t.decks / 20);
    expect(t.freeMerged).toBeGreaterThan(0);
    expect(t.joined).toBeGreaterThan(t.decks / 50);
    for (const op of ["turret buy", "turret buy (merged)", "turret install", "turret swap in", "turret move", "turret swap slots", "turret store",
      "turret sell (installed)", "turret sell (cargo)", "join drawn", "join set"]) expect(t.ops.get(op) ?? 0, op).toBeGreaterThan(0);
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
