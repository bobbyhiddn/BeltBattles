// 0.6.1b M2: turret core benches (ARSENAL.md §10 items 1 and 5; brief 0.6.1b "Tests"). The bench foe is a
// passive barge (FURNACE with no belts, +2000 hull), so a side's damage in 30 s is its own firing. The busy
// deck is tests/sim.test.ts's over-production FURNACE (Kiln, Stamp Press and two Splitters into one turret).
import { describe, expect, it } from "vitest";
import { Battle, simulate } from "../src/sim/battle";
import { startingBuild } from "../src/sim/ai";
import { HEROES, type TurretDef } from "../src/sim/content";
import { ITEMS, rateMul, secPer } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): SPEED, 30 / speed; a whole rate %
import { key as K, type Build } from "../src/sim/deck";
import { resolveCore } from "../src/sim/cores";
import { effectAt } from "../src/sim/stars";

const CORES = ["scatter", "rotary", "pressure", "gatling", "hullbreaker", "drake", "salvo"];
// NUM-2 (REQ-BFG-047; was fireInterval: 0.75): speed 40, the converter's roundHalfUp(30 / 0.75), exactly 0.75 s again
const MEDIUM: TurretDef = { col0: 4, width: 2, connectors: [4, 5], kind: "medium", speed: 40, window: 2, flight: 0.45 };
const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
// 0.6.2 BELTSIDE: the SPLITTERs stand beside the belts they split, west of (4,4) and east of (5,3)
const busy = (): Build => ({
  hero: "furnace", mods: [], beltCap: 40, hullBonus: 0,
  items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 }, { uid: 3, def: "splitter", x: 3, y: 4, rot: 1 }, { uid: 4, def: "splitter", x: 6, y: 3 }],
  routes: [{ factory: 1, cells: SHORT }, { factory: 2, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] }],
});
// Y7b2 (the flip; DESIGN-Y: no floors): DRAKE needs bonus damage on its belt to act; was benched on the bare deck (it had
// addBurn). It turns each 25 / 18 / 13 of a shot's bonus into 1 BURN, and the busy deck's slugs carry none (640.0 at every
// star): the busy deck plus a ★2 WHETSTONE (+40) on the KILN's belt at (4,3), after its SPLITTER, so each copy keeps the
// whole +40 (1 / 2 / 3 BURN), as tests/sharedPool.effects.test.ts audits DRAKE
const whetted = (): Build => {
  const b = busy();
  b.items.push({ uid: 5, def: "whetstone", x: 3, y: 3, rot: 1, stars: 2 });
  return b;
};
// Y7b2 (the flip; DESIGN-Y: no floors): ROTARY needs a part-full chamber to act; was benched on the bare deck (it had a
// fire rate). Its star only shortens its load time (0.75 / 0.525 / 0.3 s), which the chamber the busy deck keeps full
// never waits out (640.0 at every star): the busy deck's two belts with no SPLITTERs and a SLAG POT (a slug every 30 / 11
// = 2.73 s) for the STAMP PRESS (30 / 21 = 1.43 s), so about 1.17 slugs a second reach a gun that fires 1. Its first
// windows close part-full (first shot 3.68 / 3.47 / 3.23 s), and the sooner they close, the later its queue reaches 4
// and jams (first jam 18.7 / 21.2 / 25.0 s; 4 / 3 / 2 jams, 23 / 24 / 25 shots). A lone KILN belt (the starting deck)
// moves no star (1554.0 at each: every shot only comes sooner)
const sparse = (): Build => {
  const b = busy();
  b.items = b.items.filter((p) => p.def !== "splitter");
  b.items.find((p) => p.def === "press")!.def = "slagpot";
  return b;
};
// Y7b2 (the flip; DESIGN-Y: no floors): DRAKE needs bonus damage on its belts to act; was benched on the bare deck (it had
// addBurn). The WEAVER deck with two ★2 WHETSTONEs on each belt (+80 a slug: 3 BURN at ★1, 5 left), in both decks of its
// dead-offer check; one ★2 a belt (+40: 1 BURN) moves it 3.2%, one ★3 (+70: 2 BURN) 4.8%, since a ★1 DRAKE makes each 25
// of bonus 30 dealt over 3 s and the last 3 s' BURN runs past the 30 s. The tiles they work: the par WEAVER's (1,4), (4,2)
// and (8,3) (ai.ts warlordLayout), and the tile next to each on the same belt, (1,3), (4,1) and (8,4)
const whetWeaver = (): Build => {
  const b = startingBuild("weaver", 1);
  const at: [number, number][] = [[0, 4], [3, 2], [7, 3], [0, 3], [3, 1], [7, 4]];
  at.forEach(([x, y], j) => b.items.push({ uid: 920 + j, def: "whetstone", x, y, rot: 1, stars: 2 }));
  return b;
};
// NUM-1 (REQ-BFG-047): the barge's extra hull x10 with every hull (was 2000). At 2000 a 2000-hull FURNACE barge (4000 in
// all) died inside 30 s to PRESSURE ★2 and ★3, so the bench stopped measuring their damage (4050 and 4028, not ~4195 and
// ~6227, x10 of the base's 419.5 and 622.7)
const barge = (): Build => ({ ...startingBuild("furnace", 500), routes: [], hullBonus: 20000 });
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
  // Y7b2 (the flip): ROTARY ★3's no-jam is gone (Y4: ROTARY's fire rate and no-jam go), so its part of this check is
  // deleted (was: "PRESSURE BREECH and a 3-star ROTARY BREECH never jam ...", and the 3-star ROTARY's jams toBe(0))
  it("PRESSURE BREECH never jams on the over-production deck (the signature core does)", () => {
    expect(in30(busy()).jams).toBeGreaterThan(0);
    expect(in30(fit(busy(), "pressure", [0])).jams).toBe(0);
  });

  it("each core's headline metric rises 1 < 2 < 3 stars on heavy, medium and light turrets", () => {
    const headline: Record<string, (s: ReturnType<typeof resolveCore>["spec"]) => number> = {
      scatter: (c) => c.pellets! * c.share!, // total damage per shot
      // NUM-2 (REQ-BFG-047): EQUIVALENT of 1 / floor, the fire-rate factor in the new form: the whole rate % top (GATLING
      // 67 / 150 / 245) as (100 + X) / 100
      // Y7b2 (the flip): ROTARY's fire rate is gone (was rateMul(c.fireRate), ★2 18, ★3 43); its star number is its load
      // time, windowTime 0.75 / 0.525 / 0.3 s, so the headline is how often its window closes, 1 / windowTime
      rotary: (c) => 1 / c.windowTime!, // load pace (was the fire rate)
      pressure: (c) => c.perQueued!, // flat per queued payload
      gatling: (c) => rateMul(c.top), // spun-up fire rate
      hullbreaker: (c) => c.hullMul!,
      // Y7b2 (the flip): DRAKE's addBurn and burnTime are gone (was c.addBurn! * c.burnTime!, the Burn damage it added per
      // shot); its star number is flatPerBurn 25 / 18 / 13, so the headline is the BURN it makes per bonus damage
      drake: (c) => 1 / c.flatPerBurn!, // BURN per bonus damage (was the Burn damage it added per shot)
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
      // Y7b2 (the flip; DESIGN-Y: no floors): DRAKE and ROTARY are benched with their engines (whetted, sparse)
      const deck = id === "drake" ? whetted : id === "rotary" ? sparse : busy;
      const r = [1, 2, 3].map((s) => in30(fit(deck(), id, [0], s)));
      const own = deck === busy ? "" : `  (${id === "drake" ? "+ a ★2 WHETSTONE" : "no SPLITTERs, a SLAG POT"}, no core ${in30(deck()).dmg.toFixed(1)} dmg)`;
      rows.push(`${id.padEnd(11)} ${r.map((x) => `${x.dmg.toFixed(1)} dmg / ${x.shots} shots`).join("  |  ")}${own}`);
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
      // Y7b2 (the flip; DESIGN-Y: no floors): DRAKE is checked with its engine (whetWeaver) in both decks, so `ref` is that
      // deck with no core; every other core's is the default deck (`base`)
      const deck = id === "drake" ? whetWeaver : () => startingBuild("weaver", 1);
      const ref = id === "drake" ? sum(deck) : base;
      const all = sum(() => fit(deck(), id, [0, 1, 2]));
      const one = sum(() => fit(deck(), id, [1]));
      const own = id === "drake" ? " (two ★2 WHETSTONEs a belt, both decks)" : "";
      rows.push(`${id.padEnd(11)} all three: dmg ${pct(all.dmg, ref.dmg)} shots ${pct(all.shots, ref.shots)} · one (middle): dmg ${pct(one.dmg, ref.dmg)} shots ${pct(one.shots, ref.shots)}${own}`);
      const moved = Math.max(Math.abs(all.dmg / ref.dmg - 1), Math.abs(all.shots / ref.shots - 1));
      expect(moved, id).toBeGreaterThanOrEqual(0.05);
    }
    console.log(`dead-offer check, WEAVER default deck, 8 seeds (no core: ${(base.dmg / 8).toFixed(1)} dmg, ${base.shots / 8} shots per seed):\n${rows.join("\n")}`);
  });

  it("mods keep their precedence: CALIBRATION x ROTARY, EXT. CHAMBER x SCATTER, SALVO fires its whole window anyway", () => {
    const b = fit(fit(startingBuild("furnace", 1), "rotary", [0], 2), "calibrate", [0]);
    b.mods[1].uid = 950;
    const bt = new Battle(b, barge(), 1);
    // NUM-2 (REQ-BFG-047; was 1.0 x 0.75 x 0.85 = 0.6375 s): both rates still apply, multiplied, in the turret's one
    // rounding (battle.ts makeTurret): 30 x 1.33 x 1.18 = 47.08 -> 47, so 30 / 47 = 0.638 s
    const raw = HEROES.furnace.turrets[0].speed * rateMul(ITEMS.calibrate.mod!.fireRate) * rateMul(effectAt("rotary", 2).core!.fireRate);
    expect(bt.sides[0].turrets[0].interval).toBeCloseTo(secPer(Math.floor(raw + 0.5 + 1e-9)), 12);
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
