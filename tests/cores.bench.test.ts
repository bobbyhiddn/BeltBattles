// 0.6.1b M2: turret core benches (ARSENAL.md §10 items 1 and 5; brief 0.6.1b "Tests"). The bench foe is a
// passive barge (FURNACE with no belts, +2000 hull), so a side's damage in 30 s is its own firing. The busy
// deck is tests/sim.test.ts's over-production FURNACE (Kiln, Stamp Press and two Splitters into one turret).
import { describe, expect, it } from "vitest";
import { Battle, simulate } from "../src/sim/battle";
import { startingBuild } from "../src/sim/ai";
import { HEROES, type TurretDef } from "../src/sim/content";
import { key as K, type Build } from "../src/sim/deck";
import { resolveCore } from "../src/sim/cores";

const CORES = ["scatter", "rotary", "pressure", "gatling", "hullbreaker", "drake", "salvo"];
const MEDIUM: TurretDef = { col0: 4, width: 2, connectors: [4, 5], kind: "medium", fireInterval: 0.75, window: 2, flight: 0.45 };
const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const busy = (): Build => ({
  hero: "furnace", mods: [], beltCap: 40, hullBonus: 0,
  items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 }, { uid: 3, def: "splitter", x: 4, y: 4 }, { uid: 4, def: "splitter", x: 5, y: 4 }],
  routes: [{ factory: 1, cells: SHORT }, { factory: 2, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] }],
});
const barge = (): Build => ({ ...startingBuild("furnace", 500), routes: [], hullBonus: 2000 });
const fit = (b: Build, def: string, turrets: number[], stars = 1): Build => {
  turrets.forEach((t, j) => b.mods.push({ uid: 900 + j, def, turret: t, ...(stars > 1 ? { stars } : {}) }));
  return b;
};
/** Damage (hits plus Burn) and shots in the first 30 s against the barge. */
function in30(b: Build, seed = 3): { dmg: number; shots: number; jams: number } {
  const bt = new Battle(b, barge(), seed);
  while (!bt.over && bt.t < 30 - 1e-9) { bt.step(); bt.events.length = 0; }
  const s = bt.sides[0].stats;
  return { dmg: s.damage, shots: s.shots, jams: s.jams };
}
const pct = (a: number, b: number) => `${((a / b - 1) * 100).toFixed(1)}%`;

describe("core benches", () => {
  it("PRESSURE BREECH and a 3-star ROTARY BREECH never jam on the over-production deck (the signature core does)", () => {
    expect(in30(busy()).jams).toBeGreaterThan(0);
    expect(in30(fit(busy(), "pressure", [0])).jams).toBe(0);
    expect(in30(fit(busy(), "rotary", [0], 3)).jams).toBe(0);
  });

  it("each core's headline metric rises 1 < 2 < 3 stars on heavy, medium and light turrets", () => {
    const headline: Record<string, (s: ReturnType<typeof resolveCore>["spec"]) => number> = {
      scatter: (c) => c.pellets! * c.share!, // total damage per shot
      rotary: (c) => 1 / (c.intervalMul ?? 1), // fire rate
      pressure: (c) => c.perQueued!, // flat per queued payload
      gatling: (c) => 1 / c.floor!, // spun-up fire rate
      hullbreaker: (c) => c.hullMul!,
      drake: (c) => c.addBurn! * c.burnTime!, // Burn damage it adds per shot
      salvo: (c) => c.volleyFlat!, // flat per volley shell
    };
    const tds: [string, TurretDef][] = [["heavy", HEROES.furnace.turrets[0]], ["medium", MEDIUM], ["light", HEROES.weaver.turrets[0]]];
    for (const id of CORES) for (const [cls, td] of tds) {
      const v = [1, 2, 3].map((s) => headline[id](resolveCore(fit({ ...busy(), mods: [] }, id, [0], s), 0, td).spec));
      expect(v[0] < v[1] && v[1] < v[2], `${id} ${cls}: ${v.join(" < ")}`).toBe(true);
    }
  });

  it("bench: damage in 30 s on the busy heavy deck rises 1 < 2 < 3 stars for every core", () => {
    const rows: string[] = [];
    const base = in30(busy());
    for (const id of CORES) {
      const r = [1, 2, 3].map((s) => in30(fit(busy(), id, [0], s)));
      rows.push(`${id.padEnd(11)} ${r.map((x) => `${x.dmg.toFixed(1)} dmg / ${x.shots} shots`).join("  |  ")}`);
      expect(r[0].dmg < r[1].dmg && r[1].dmg < r[2].dmg, `${id}: ${r.map((x) => x.dmg.toFixed(1)).join(" < ")}`).toBe(true);
    }
    console.log(`bench busy FURNACE (no core ${base.dmg.toFixed(1)} dmg / ${base.shots} shots), 1-3 stars:\n${rows.join("\n")}`);
  });

  it("dead-offer check (§10 item 5): every core, fitted on all three WEAVER turrets, moves damage in 30 s or shots by >= 5%", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const sum = (b: () => Build) => seeds.map((s) => in30(b(), s)).reduce((a, x) => ({ dmg: a.dmg + x.dmg, shots: a.shots + x.shots }), { dmg: 0, shots: 0 });
    const base = sum(() => startingBuild("weaver", 1));
    const rows: string[] = [];
    for (const id of CORES) {
      const all = sum(() => fit(startingBuild("weaver", 1), id, [0, 1, 2]));
      const one = sum(() => fit(startingBuild("weaver", 1), id, [1]));
      rows.push(`${id.padEnd(11)} all three: dmg ${pct(all.dmg, base.dmg)} shots ${pct(all.shots, base.shots)} · one (middle): dmg ${pct(one.dmg, base.dmg)} shots ${pct(one.shots, base.shots)}`);
      const moved = Math.max(Math.abs(all.dmg / base.dmg - 1), Math.abs(all.shots / base.shots - 1));
      expect(moved, id).toBeGreaterThanOrEqual(0.05);
    }
    console.log(`dead-offer check, WEAVER default deck, 8 seeds (no core: ${(base.dmg / 8).toFixed(1)} dmg, ${base.shots / 8} shots per seed):\n${rows.join("\n")}`);
  });

  it("mods keep their precedence: CALIBRATION x ROTARY, EXT. CHAMBER x SCATTER, SALVO fires its whole window anyway", () => {
    const b = fit(fit(startingBuild("furnace", 1), "rotary", [0], 2), "calibrate", [0]);
    b.mods[1].uid = 950;
    const bt = new Battle(b, barge(), 1);
    expect(bt.sides[0].turrets[0].interval).toBeCloseTo(1.0 * 0.75 * 0.85, 12);
    const sc = fit(startingBuild("furnace", 1), "scatter", [0]);
    sc.mods.push({ uid: 951, def: "chamber", turret: 0 });
    const t1 = new Battle(sc, barge(), 1);
    const tu = t1.sides[0].turrets[0];
    expect([tu.perShot, tu.core.routine]).toEqual([2, "scatter"]);
    tu.stack.push(...[0, 1].map((i) => ({ id: 7000 + i, ammo: "plain" as const, ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false })));
    tu.phase = "fire";
    t1.step();
    expect(t1.projectiles.filter((p) => p.from === 0).length).toBe(6); // 2 payloads x 3 pellets
    const sv = fit(startingBuild("furnace", 1), "salvo", [0]);
    sv.mods.push({ uid: 952, def: "chamber", turret: 0 });
    const t2 = new Battle(sv, barge(), 1);
    const tv = t2.sides[0].turrets[0];
    tv.stack.push(...[0, 1, 2].map((i) => ({ id: 7100 + i, ammo: "plain" as const, ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false })));
    t2.step();
    expect(t2.projectiles.filter((p) => p.from === 0).length).toBe(3); // the whole window, not 2 per shot
  });

  it("a deck with bought cores replays bit for bit (same seed, same winner, time and hulls)", () => {
    const b = startingBuild("weaver", 1);
    b.mods.push({ uid: 900, def: "scatter", turret: 0 }, { uid: 901, def: "drake", turret: 1, stars: 2 }, { uid: 902, def: "gatling", turret: 2, stars: 3 });
    const f = fit(startingBuild("furnace", 1), "salvo", [0]);
    const a = simulate(b, f, 17), c = simulate(b, f, 17);
    expect([a.winner, a.t, a.sides[0].hull.hp, a.sides[1].hull.hp, a.sides[0].stats.shots])
      .toEqual([c.winner, c.t, c.sides[0].hull.hp, c.sides[1].hull.hp, c.sides[0].stats.shots]);
  });
});
