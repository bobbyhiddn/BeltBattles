// 0.6.2j section 4 (REQ-BFG-027; observe only, no tuning): are belt joins a real choice? Canonical join layouts against
// their join-free equivalents at equal parts and equal gold, for FURNACE and WEAVER on days 5, 7 and 10. Each deck plays
// the day's harness gauntlet (heroRefBuild: the six HARNESS_HEROES' reference decks for that day) on the harness's own
// paired seeds (tournament.ts focusSeeds with DEFAULT_OPTS.seed, keyed "bb-bench-joins" and by hero, so every layout of
// a hero and day meets each foe on the same seeds), each seed from both sides (as playJob). Findings go to the balance
// owner through output-0.6.2j/REPORT.md ("Bench"); nothing here asserts a balance number.
// Always on: every bench deck is legal (validateBuild, the FIGHT gate), fair (the same parts, belt and plating, so the
// same gold, as the rest of its parts group), joined exactly as its layout says, its rigs working the tiles they should,
// and each join deck's payloads really cross its joins in battle.
// The report: BB_JOINBENCH=1 npx vitest run tests/joins.bench.test.ts (BB_JOINBENCH_OUT=<file.md>, default
// /tmp/bb-joinbench.md, also writes <file>.json; BB_JOINBENCH_SEEDS=<n> seeds per foe and side, default 4).
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Battle, gearStats, makeTurret, simulate } from "../src/sim/battle";
import { HEROES, type HeroId } from "../src/sim/content";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { fightBlock } from "../src/game/routeCheck";
import { hitsOfRig, joinOf, key as K, rotField, type Build, type Placed, type RouteDef } from "../src/sim/deck";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { DEFAULT_OPTS, focusSeeds } from "../src/sim/harness/tournament";

export const JOIN_BENCH_DAYS = [5, 7, 10] as const;
export const JOIN_BENCH_KEY = "bb-bench-joins";

const star = (s: number) => (s > 1 ? { stars: s } : {});

/** The day's rig row, [def, stars] in belt order: I-shaped commons (one arrow each), and a SPLITTER on day 10. */
export function rigRow(day: number): [string, number][] {
  if (day >= 10) return [["temper", 2], ["whetstone", 2], ["brake", 1], ["splitter", 1]];
  if (day >= 7) return [["temper", 2], ["whetstone", 2], ["brake", 1]];
  return [["temper", 1], ["whetstone", 1], ["brake", 1]];
}

export interface Layout {
  id: string;
  group: string; // decks of one group hold the same parts, belt and plating (so the same gold)
  label: string;
  joins: number; // joining belts
  mainTiles: number[]; // the tiles of route 0 the rig row works, in order (rig i on mainTiles[i])
  build: (day: number) => Build;
}
export interface Comparison { hero: HeroId; what: string; join: string; free: string }

// ---------------------------------------------------------------- FURNACE (one heavy turret, connectors 4 and 5)
// KILN (4,6); its belt M up column 4 into connector 4. STAMP PRESS (6,6); DOUBLE STAMP (1,6) in the three-factory group.
// The rig row stands west of M on column 3, facing east, working M's tiles 1-3 (and 4 on day 10).
// E1 (battle.ts makeTurret): the Breech fires every 0.72 s instead of 1.0 s once a belt of 8+ tiles feeds it, and
// J14 (a) counts a joining belt's journey (its tiles, then the main belt's from the join tile on). M is 6 tiles and
// F_P5 7, so F0 has no long belt; F_P5L (8 tiles) gives the join-free decks the same cadence as the joins' 8-tile
// journeys (F1, F2, F4, F5), which separates E1 from the join itself.
const FM = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const F_P5 = [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)]; // the PRESS's own belt, into connector 5
const F_P5L = [K(7, 5), K(7, 4), K(7, 3), K(7, 2), K(7, 1), K(7, 0), K(6, 0), K(5, 0)]; // the same, 8 tiles (a long belt)
const F_PJ = [K(6, 5), K(5, 5)]; // the PRESS's belt joining M's tile 0 (4,5) from the east, before the rig row
const F_DJ = [K(3, 6), K(3, 5)]; // the DOUBLE STAMP's belt joining M's tile 0 from the west

function furnace(day: number, three: boolean, routes: RouteDef[]): Build {
  const items: Placed[] = [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 }];
  if (three) items.push({ uid: 3, def: "doublestamp", x: 1, y: 6 });
  rigRow(day).forEach(([def, s], i) => items.push({ uid: 10 + i, def, x: 3, y: 4 - i, ...rotField(def, 1), ...star(s) }));
  return {
    hero: "furnace", items, routes: routes.map((r) => ({ ...r, cells: [...r.cells] })),
    mods: day >= 7 ? [{ uid: 30, def: "calibrate", turret: 0 }] : [], beltCap: three ? 18 : 14,
    hullBonus: heroRefBuild("furnace", day).hullBonus,
  };
}

const FT = [1, 2, 3, 4];
export const FURNACE_LAYOUTS: Layout[] = [
  { id: "F0", group: "kiln+press", label: "PRESS on its own connector 5 by a 7-tile belt (the reference decks' layout; no long belt)", joins: 0, mainTiles: FT,
    build: (d) => furnace(d, false, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5 }]) },
  { id: "F0L", group: "kiln+press", label: "PRESS on its own connector 5 by an 8-tile belt (a long belt: E1's faster Breech)", joins: 0, mainTiles: FT,
    build: (d) => furnace(d, false, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5L }]) },
  { id: "F1", group: "kiln+press", label: "PRESS joins M at tile 1, before the rig row (connector 5 free; journey 8)", joins: 1, mainTiles: FT,
    build: (d) => furnace(d, false, [{ factory: 1, cells: FM }, { factory: 2, cells: F_PJ, join: K(4, 5) }]) },
  { id: "F2", group: "kiln+press", label: "PRESS runs up column 5 and joins M at the intake, tile 6 (connector 5 free; journey 8)", joins: 1, mainTiles: FT,
    build: (d) => furnace(d, false, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5, join: K(4, 0) }]) },
  { id: "F3", group: "kiln+press+double", label: "F0 and a DOUBLE STAMP idle (no intake left)", joins: 0, mainTiles: FT,
    build: (d) => furnace(d, true, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5 }]) },
  { id: "F3L", group: "kiln+press+double", label: "F0L and a DOUBLE STAMP idle (no intake left)", joins: 0, mainTiles: FT,
    build: (d) => furnace(d, true, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5L }]) },
  { id: "F4", group: "kiln+press+double", label: "F0 and the DOUBLE STAMP joins M at tile 1 (journey 8)", joins: 1, mainTiles: FT,
    build: (d) => furnace(d, true, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5 }, { factory: 3, cells: F_DJ, join: K(4, 5) }]) },
  { id: "F5", group: "kiln+press+double", label: "all three into connector 4: PRESS and DOUBLE STAMP join M at tile 1", joins: 2, mainTiles: FT,
    build: (d) => furnace(d, true, [{ factory: 1, cells: FM }, { factory: 2, cells: F_PJ, join: K(4, 5) }, { factory: 3, cells: F_DJ, join: K(4, 5) }]) },
];

// ---------------------------------------------------------------- WEAVER (three light turrets: connectors 1, 4, 8)
// LOOM (4,5), three outputs: A up column 4 into connector 4 (turret 2), B west and up column 1 (turret 1), C east and
// up column 8 (turret 3). STAMP PRESS (7,7); DOUBLE STAMP (0,6) in the three-factory group. The rig row stands west of A
// on column 3, facing east, working A's tiles 1-3 (and 4 on day 10); A's tile 0 (4,4) is where joins land.
const WA = [K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const WB = [K(3, 5), K(2, 5), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)];
const WC = [K(6, 5), K(7, 5), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)];
const W_CJ = [K(5, 4)]; // the LOOM's third belt joining A's tile 0 from the east
const W_P8 = [K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)]; // the PRESS's own belt, into connector 8
const W_PJ = [K(7, 6), K(6, 6), K(6, 5), K(6, 4), K(5, 4)]; // the PRESS's belt joining A's tile 0 from the east
const W_D1 = [K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)]; // the DOUBLE STAMP's own belt, into connector 1
const W_DJ = [K(1, 5), K(2, 5), K(3, 5), K(3, 4)]; // the DOUBLE STAMP's belt joining A's tile 0 from the west

function weaver(day: number, three: boolean, routes: RouteDef[]): Build {
  const items: Placed[] = [{ uid: 1, def: "loom", x: 4, y: 5 }, { uid: 2, def: "press", x: 7, y: 7 }];
  if (three) items.push({ uid: 3, def: "doublestamp", x: 0, y: 6 });
  rigRow(day).forEach(([def, s], i) => items.push({ uid: 10 + i, def, x: 3, y: 3 - i, ...rotField(def, 1), ...star(s) }));
  return {
    hero: "weaver", items, routes: routes.map((r) => ({ ...r, cells: [...r.cells] })),
    mods: day >= 7 ? [{ uid: 30, def: "calibrate", turret: 1 }] : [], beltCap: 24,
    hullBonus: heroRefBuild("weaver", day).hullBonus,
  };
}

const WT = [1, 2, 3, 4];
export const WEAVER_LAYOUTS: Layout[] = [
  { id: "W0", group: "loom+press", label: "LOOM on turrets 2 and 1, PRESS on its own turret 3 (LOOM's third output idle)", joins: 0, mainTiles: WT,
    build: (d) => weaver(d, false, [{ factory: 1, cells: WA }, { factory: 1, cells: WB }, { factory: 2, cells: W_P8 }]) },
  { id: "W1", group: "loom+press", label: "PRESS joins A at tile 1, before the rig row (turret 3 idle)", joins: 1, mainTiles: WT,
    build: (d) => weaver(d, false, [{ factory: 1, cells: WA }, { factory: 1, cells: WB }, { factory: 2, cells: W_PJ, join: K(4, 4) }]) },
  { id: "W2", group: "loom+press", label: "LOOM on all three turrets, PRESS idle (no intake left)", joins: 0, mainTiles: WT,
    build: (d) => weaver(d, false, [{ factory: 1, cells: WA }, { factory: 1, cells: WB }, { factory: 1, cells: WC }]) },
  { id: "W3", group: "loom+press", label: "LOOM's third belt joins A at tile 1, freeing connector 8: PRESS on turret 3", joins: 1, mainTiles: WT,
    build: (d) => weaver(d, false, [{ factory: 1, cells: WA }, { factory: 1, cells: WB }, { factory: 1, cells: W_CJ, join: K(4, 4) }, { factory: 2, cells: W_P8 }]) },
  { id: "W4", group: "loom+press+double", label: "three factories on three turrets: LOOM 2, DOUBLE STAMP 1, PRESS 3", joins: 0, mainTiles: WT,
    build: (d) => weaver(d, true, [{ factory: 1, cells: WA }, { factory: 2, cells: W_P8 }, { factory: 3, cells: W_D1 }]) },
  { id: "W5", group: "loom+press+double", label: "three factories into turret 2: PRESS and DOUBLE STAMP join A at tile 1", joins: 2, mainTiles: WT,
    build: (d) => weaver(d, true, [{ factory: 1, cells: WA }, { factory: 2, cells: W_PJ, join: K(4, 4) }, { factory: 3, cells: W_DJ, join: K(4, 4) }]) },
];

export const LAYOUTS: Record<"furnace" | "weaver", Layout[]> = { furnace: FURNACE_LAYOUTS, weaver: WEAVER_LAYOUTS };

export const COMPARISONS: Comparison[] = [
  { hero: "furnace", what: "E1 alone, no join: the PRESS's own belt at 8 tiles vs 7", join: "F0L", free: "F0" },
  { hero: "furnace", what: "a second factory joined before a shared rig row vs its own 7-tile belt", join: "F1", free: "F0" },
  { hero: "furnace", what: "a second factory joined before a shared rig row vs its own 8-tile belt", join: "F1", free: "F0L" },
  { hero: "furnace", what: "a join that crowds its turret's intake vs its own 7-tile belt", join: "F2", free: "F0" },
  { hero: "furnace", what: "a join that crowds its turret's intake vs its own 8-tile belt", join: "F2", free: "F0L" },
  { hero: "furnace", what: "three factories into one heavy turret (one join) vs the third idle (7-tile PRESS)", join: "F4", free: "F3" },
  { hero: "furnace", what: "three factories into one heavy turret (one join) vs the third idle (8-tile PRESS)", join: "F4", free: "F3L" },
  { hero: "furnace", what: "three factories into one intake (two joins) vs the third idle (7-tile PRESS)", join: "F5", free: "F3" },
  { hero: "furnace", what: "three factories into one intake (two joins) vs the third idle (8-tile PRESS)", join: "F5", free: "F3L" },
  { hero: "weaver", what: "a second factory: own connector (turret) vs joined before a shared rig row", join: "W1", free: "W0" },
  { hero: "weaver", what: "three factories into one light turret (crowding) vs one each", join: "W5", free: "W4" },
  { hero: "weaver", what: "a join that frees a light turret's connector vs the PRESS idle", join: "W3", free: "W2" },
  { hero: "weaver", what: "a join that frees a light turret's connector vs the LOOM's third output idle", join: "W3", free: "W0" },
];

/** A deck's parts (items and mods, def and stars, sorted) plus its belt and plating: equal within a group. */
const partsOf = (b: Build) => JSON.stringify({
  items: b.items.map((p) => `${p.def}*${p.stars ?? 1}`).sort(), mods: b.mods.map((m) => `${m.def}*${m.stars ?? 1}@${m.turret}`).sort(),
  beltCap: b.beltCap, hullBonus: b.hullBonus,
});

describe("0.6.2j join bench: the decks (always on)", () => {
  for (const hero of ["furnace", "weaver"] as const) {
    for (const day of JOIN_BENCH_DAYS) {
      it(`${hero} day ${day}: every layout is legal, fair within its group, joined as it says, its rigs on their tiles`, () => {
        const groups = new Map<string, { parts: string; cost: number }>();
        for (const l of LAYOUTS[hero]) {
          const b = l.build(day);
          const v = validateBuild(b, day);
          expect(v.errors, `${l.id} day ${day}`).toEqual([]);
          expect(fightBlock(b), `${l.id} day ${day}`).toBeUndefined();
          const joined = b.routes.map((r, i) => (r.join === undefined ? -1 : i)).filter((i) => i >= 0);
          expect(joined.length, l.id).toBe(l.joins);
          for (const i of joined) expect(joinOf(b, i)?.route, `${l.id} route ${i}`).toBe(0);
          rigRow(day).forEach((_, i) => {
            const got = hitsOfRig(b, 10 + i).map((h) => [h.route, h.tile]);
            expect(got, `${l.id} rig ${i}`).toEqual([[0, l.mainTiles[i]]]);
          });
          const cost = buildCost(b).total;
          expect(cost).toBeLessThanOrEqual(maxGoldByDay(day));
          const g = groups.get(l.group);
          if (!g) groups.set(l.group, { parts: partsOf(b), cost });
          else expect({ parts: partsOf(b), cost }, `${l.id} vs its group`).toEqual(g);
        }
      });
    }
  }

  it("E1: the FURNACE decks with a belt or a journey of 8+ tiles get the faster Breech; F0 and F3 don't", () => {
    const long = { F0: false, F0L: true, F1: true, F2: true, F3: false, F3L: true, F4: true, F5: true } as Record<string, boolean>;
    for (const day of JOIN_BENCH_DAYS) {
      for (const l of FURNACE_LAYOUTS) {
        const b = l.build(day);
        const base = makeTurret(b, 0, HEROES.furnace.turrets[0]).interval / gearStats(b, 0).fireMul;
        expect(base, `${l.id} day ${day}`).toBeCloseTo(long[l.id] ? 0.72 : 1, 9);
      }
    }
  });

  it("each join deck's payloads cross their joins in battle (every joining belt hands payloads to route 0)", () => {
    const foe: Build = { hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 5 }], routes: [], mods: [], beltCap: 24, hullBonus: 100000 };
    for (const hero of ["furnace", "weaver"] as const) {
      for (const l of LAYOUTS[hero].filter((x) => x.joins)) {
        const bt = new Battle(l.build(7), foe, 1);
        const s = bt.sides[0];
        const via = new Set<number>();
        for (let i = 0; i < 60 * 20 && !bt.over; i++) {
          bt.step();
          for (const a of s.routes[0].ammo) if (a.via !== undefined) via.add(a.via);
          bt.events.length = 0;
        }
        expect([...via].sort(), l.id).toEqual(s.joiners!.map((r) => r.index).sort());
      }
    }
  });
});

// ---------------------------------------------------------------- the report (observe only)

interface Tally {
  battles: number; wins: number; draws: number; losses: number; dmg: number; shots: number; jams: number;
  maxQueue: number; stamped: number; stalled: number; time: number; winTime: number;
}
const zero = (): Tally => ({ battles: 0, wins: 0, draws: 0, losses: 0, dmg: 0, shots: 0, jams: 0, maxQueue: 0, stamped: 0, stalled: 0, time: 0, winTime: 0 });

function add(t: Tally, bt: Battle, side: 0 | 1): void {
  const st = bt.sides[side].stats;
  t.battles++;
  if (bt.winner === side) { t.wins++; t.winTime += bt.t; } else if (bt.winner === -1) t.draws++; else t.losses++;
  t.dmg += st.damage;
  t.shots += st.shots;
  t.jams += st.jams;
  t.maxQueue += st.maxQueue;
  t.stamped += st.produced;
  t.stalled += st.stalled;
  t.time += bt.t;
}

export interface BenchRow { hero: HeroId; day: number; id: string; label: string; cost: number; tally: Tally }

/** Play every layout of `hero` on `day` against the gauntlet, on the paired harness seeds. */
export function benchDay(hero: "furnace" | "weaver", day: number, seeds: number): BenchRow[] {
  const o = { ...DEFAULT_OPTS, seeds };
  const foes = HARNESS_HEROES.map((h) => heroRefBuild(h, day));
  const src = hero === "furnace" ? 0 : 1;
  return LAYOUTS[hero].map((l) => {
    const b = l.build(day);
    const t = zero();
    foes.forEach((foe, g) => {
      for (const s of focusSeeds(o, day, src, g, JOIN_BENCH_KEY)) {
        add(t, simulate(b, foe, s), 0);
        add(t, simulate(foe, b, s), 1);
      }
    });
    return { hero, day, id: l.id, label: l.label, cost: buildCost(b).total, tally: t };
  });
}

const f1 = (n: number) => n.toFixed(1);
const pct = (n: number) => `${(100 * n).toFixed(1)}%`;
const winRate = (t: Tally) => (t.wins + t.draws / 2) / t.battles;

export function benchMarkdown(rows: BenchRow[], seeds: number): string {
  const out: string[] = [];
  out.push(`Seeds: focusSeeds(DEFAULT_OPTS.seed = ${DEFAULT_OPTS.seed}, day, hero, foe, "${JOIN_BENCH_KEY}"), ${seeds} per foe, each from both sides; `
    + `foes: heroRefBuild(h, day) for ${HARNESS_HEROES.join(", ")} (${HARNESS_HEROES.length * seeds * 2} battles per deck and day).`);
  out.push("");
  for (const hero of ["furnace", "weaver"] as const) {
    out.push(`#### ${hero.toUpperCase()}`);
    out.push("");
    for (const l of LAYOUTS[hero]) out.push(`- ${l.id} (${l.group}${l.joins ? `, ${l.joins} join${l.joins > 1 ? "s" : ""}` : ", no join"}): ${l.label}`);
    out.push("");
    out.push("| day | deck | gold | W-D-L | win rate | dmg / fight | shots / s | stamped / s | jams / fight | max queue | stalled s / fight | time to kill (wins) |");
    out.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rows.filter((x) => x.hero === hero)) {
      const t = r.tally;
      out.push(`| ${r.day} | ${r.id} | ${r.cost} | ${t.wins}-${t.draws}-${t.losses} | ${pct(winRate(t))} | ${f1(t.dmg / t.battles)} | ${(t.shots / t.time).toFixed(2)} `
        + `| ${(t.stamped / t.time).toFixed(2)} | ${(t.jams / t.battles).toFixed(2)} | ${(t.maxQueue / t.battles).toFixed(1)} | ${f1(t.stalled / t.battles)} `
        + `| ${t.wins ? `${f1(t.winTime / t.wins)} s` : "-"} |`);
    }
    out.push("");
  }
  out.push("#### Paired comparisons (same parts, same gold, same seeds): the first deck minus the second");
  out.push("");
  out.push("| comparison | day | deck | minus | win rate | dmg / fight | shots / s | jams / fight | time to kill |");
  out.push("|---|---|---|---|---|---|---|---|---|");
  for (const c of COMPARISONS) {
    for (const day of JOIN_BENCH_DAYS) {
      const j = rows.find((r) => r.hero === c.hero && r.day === day && r.id === c.join)?.tally;
      const f = rows.find((r) => r.hero === c.hero && r.day === day && r.id === c.free)?.tally;
      if (!j || !f) continue;
      const sign = (n: number, d = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(d)}`;
      const ttk = j.wins && f.wins ? `${sign(j.winTime / j.wins - f.winTime / f.wins)} s` : "-";
      out.push(`| ${c.hero.toUpperCase()}: ${c.what} | ${day} | ${c.join} | ${c.free} | ${sign(100 * (winRate(j) - winRate(f)))} pts | ${sign(j.dmg / j.battles - f.dmg / f.battles)} `
        + `| ${sign(j.shots / j.time - f.shots / f.time, 2)} | ${sign(j.jams / j.battles - f.jams / f.battles, 2)} | ${ttk} |`);
    }
  }
  out.push("");
  return out.join("\n");
}

const REPORT = !!process.env.BB_JOINBENCH;

describe("0.6.2j join bench: the report (BB_JOINBENCH=1; observe only)", () => {
  it.runIf(REPORT)("plays every layout against the day's gauntlet and writes the tables", () => {
    const seeds = Number(process.env.BB_JOINBENCH_SEEDS ?? 4);
    const rows: BenchRow[] = [];
    for (const hero of ["furnace", "weaver"] as const) for (const day of JOIN_BENCH_DAYS) rows.push(...benchDay(hero, day, seeds));
    const md = benchMarkdown(rows, seeds);
    const file = process.env.BB_JOINBENCH_OUT ?? "/tmp/bb-joinbench.md";
    writeFileSync(file, md + "\n");
    writeFileSync(`${file.replace(/\.md$/, "")}.json`, JSON.stringify({ seeds, days: JOIN_BENCH_DAYS, rows }, null, 1) + "\n");
    expect(rows.length).toBe(3 * (FURNACE_LAYOUTS.length + WEAVER_LAYOUTS.length));
    for (const r of rows) expect(r.tally.battles).toBe(HARNESS_HEROES.length * seeds * 2);
  }, 900_000);
});
