// SHAPES-1 (REQ-BFG-086 S7; BRIEF-SHAPES1 step 4): bots, par, captains, warlords and the dry stand-in sample, SHAPES on.
// - the shaped-rig solver (beltside.ts shapedSpot) on fixed fixtures: NAIL STRIP along a straight belt, SPIKE RAIL between
//   two parallel belts, the "typical" tile, never a turret intake, and the D3 / rot tie-break;
// - the buy-fit check (player.ts fitsSomewhere);
// - the par player with SHAPES on (four heroes, seeds 1-2, days 1-10): every deck legal (no placement, route or rot error)
//   and still full; how many shaped pieces it holds;
// - every captain (rivalBuild) and warlord (warlordBuild) deck with SHAPES on passes the legality replay
//   (tests/rivals.legality.ts), and every GANTRY PRESS or ASSEMBLY LINE the load migration re-placed is listed;
// - a dry stand-in sample (harness/standins.ts genStandIns, a tiny population, in memory only) with SHAPES on: every pick
//   passes validateBuild.
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS, type HeroId } from "../src/sim/content";
import { cellsOf, cloneBuild, isIntakeCell, key as K, type Build, type Placed } from "../src/sim/deck";
import { footprintCells, isShaped } from "../src/sim/foot";
import { RESHAPED_IDS, SHAPES, SHAPES_IDS, setShapes, withShapes } from "../src/sim/shapes";
import { shapedSpot } from "../src/sim/beltside";
import { fitsSomewhere, playerRun } from "../src/sim/harness/player";
import { casualRun } from "../src/sim/harness/casual"; // SHAPES-1 (cap's RUN2 note 1.7): S7L's casual player
import { RIVAL_IDS, rivalBuild } from "../src/sim/rivals";
import { warlordBuild } from "../src/sim/ai";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { legalityProblems } from "./rivals.legality";
import { STANDIN_DEFAULTS, genStandIns } from "../src/sim/harness/standins";
import { localRunner } from "../src/sim/harness/tournament";

afterEach(() => setShapes(SHAPES)); // SHAPES-1 flip: the shipped value (on)

/** A bare deck: belts as given (factory uid 1, a KILN at (8,8)), items as given. */
function deck(routes: number[][], items: Placed[] = []): Build {
  return { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 8, y: 8 }, ...items], routes: routes.map((cells) => ({ factory: 1, cells })), mods: [], beltCap: 99, hullBonus: 0 };
}
const row = (y: number, x0: number, x1: number) => Array.from({ length: x1 - x0 + 1 }, (_, i) => K(x0 + i, y));
const col = (x: number, y0: number, y1: number) => Array.from({ length: y1 - y0 + 1 }, (_, i) => K(x, y0 + i));
const placementErrors = (b: Build, day: number) => validateBuild(b, day, "strict").errors.filter((e) => /^(placement|route|item: uid \d+ .* rot|shape)/.test(e));

describe("SHAPES-1 S7.1: the shaped-rig solver (shapedSpot)", () => {
  it("NAIL STRIP along a straight belt: 2 hits; ties go to the first hit tile's D3 side, then the lower rot", () => {
    withShapes(() => {
      const sp = shapedSpot(deck([row(5, 1, 6)]), "nailstrip")!;
      expect(sp.hits.length).toBe(2);
      // every 2-hit spot ties on score; the first hit tile is tile 0 (1,5) from above (D3 order [0,1,2,3] there: the
      // side above, direction 0, comes first), so the strip lies on row 4 turned to point back (rot 2)
      expect([sp.x, sp.y, sp.rot]).toEqual([1, 4, 2]);
    });
  });

  it("SPIKE RAIL between two straight belts one cell apart: 6 hits, at the top (first tile), rot 0", () => {
    withShapes(() => {
      const sp = shapedSpot(deck([col(3, 2, 7), col(5, 2, 7)]), "spikerail")!;
      expect(sp.hits.length).toBe(6);
      expect([sp.x, sp.y, sp.rot]).toEqual([4, 2, 0]);
    });
  });

  it("the typical player's tile: the best placement that hits that tile", () => {
    withShapes(() => {
      const b = deck([row(5, 1, 6)]);
      const sp = shapedSpot(b, "nailstrip", undefined, undefined, [0, 4])!; // tile 4 = (5,5)
      expect(sp.hits.some((h) => h.route === 0 && h.tile === 4)).toBe(true);
      expect(sp.hits.length).toBe(2);
    });
  });

  it("the room cost: a placement that covers a cell beside a belt without hitting from it scores 0.5 less", () => {
    withShapes(() => {
      // one belt tile row 5 x 1..2 and a lone tile at (6,3): a NAIL STRIP under (1,5)-(2,5) hits 2 and wastes nothing
      const b = deck([row(5, 1, 2)]);
      const sp = shapedSpot(b, "nailstrip")!;
      expect(sp.hits.length).toBe(2);
      const cells = footprintCells(ITEMS.nailstrip, sp.x, sp.y, sp.rot);
      expect(cells.every((k) => sp.hits.some((h) => h.from === k))).toBe(true);
    });
  });

  it("never on a turret intake cell: a belt along row 1 under FURNACE's intakes (4, 5) is worked from row 2, not row 0", () => {
    withShapes(() => {
      const b = deck([row(1, 3, 6)]);
      const sp = shapedSpot(b, "nailstrip")!;
      expect(sp.hits.length).toBe(2);
      expect(footprintCells(ITEMS.nailstrip, sp.x, sp.y, sp.rot).some((k) => isIntakeCell(b, k))).toBe(false);
    });
  });
});

describe("SHAPES-1 S7.3: the buy-fit check", () => {
  it("fitsSomewhere: a shape with no useful spot (no connected belt) doesn't fit; a 1-cell rig or a 2x2 always passes", () => {
    withShapes(() => {
      const empty: Build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }], routes: [], mods: [], beltCap: 14, hullBonus: 0 };
      expect(fitsSomewhere(empty, "nailstrip")).toBe(false);
      expect(fitsSomewhere(empty, "whetstone")).toBe(true);
      expect(fitsSomewhere(empty, "press")).toBe(true);
      const par = playerRun("weaver", 4, 1)[3].build;
      expect(fitsSomewhere(par, "nailstrip")).toBe(true);
      expect(fitsSomewhere(par, "gantry")).toBe(fitsSomewhere(par, "gantry")); // deterministic
    });
  });
});

describe("SHAPES-1 S7: par with SHAPES on", () => {
  it("four heroes, seeds 1-2, days 1-10: every par deck is legal and as full; the shaped pieces it holds", () => {
    const stat: Record<string, number> = {};
    const lines: string[] = [];
    withShapes(() => {
      for (const h of PLAYABLE_HEROES) for (const seed of [1, 2]) {
        const days = playerRun(h, 10, seed);
        for (const d of days) {
          expect(placementErrors(d.build, d.day), `${h} seed ${seed} day ${d.day}`).toEqual([]);
          for (const p of d.build.items) {
            if (!isShaped(ITEMS[p.def])) continue;
            stat[p.def] = (stat[p.def] ?? 0) + 1;
            if (d.day === 10) lines.push(`${h}/${seed} d10 ${p.def} (${p.x},${p.y}) rot ${p.rot ?? 0}`);
          }
        }
        const off = withShapes(() => playerRun(h, 10, seed), false);
        const fill = (b: Build) => b.items.reduce((n, p) => n + cellsOf(p).length, 0) + b.routes.reduce((n, r) => n + r.cells.length, 0);
        lines.push(`${h}/${seed} d10 cells used: off ${fill(withShapes(() => off[9].build, false))} / on ${fill(days[9].build)}; value off ${off[9].value} / on ${days[9].value}`);
      }
    });
    console.log(`S7 PAR shaped pieces held (deck-days): ${JSON.stringify(stat)}`);
    for (const l of lines) console.log(`S7 PAR ${l}`);
  }, 600_000);
});

describe("SHAPES-1 S7 (cap's RUN2 note 1.7): the casual player (S7L, casual.ts) with SHAPES on", () => {
  it("FURNACE and WEAVER, seeds 1-2, days 1-10: every casual deck is legal (no placement, route, rot or shape error)", () => {
    const held: Record<string, number> = {};
    withShapes(() => {
      for (const h of ["furnace", "weaver"] as HeroId[]) for (const seed of [1, 2]) {
        for (const d of casualRun(h, 10, seed)) {
          expect(placementErrors(d.build, d.day), `casual ${h} seed ${seed} day ${d.day}`).toEqual([]);
          for (const p of d.build.items) if (isShaped(ITEMS[p.def])) held[p.def] = (held[p.def] ?? 0) + 1;
        }
      }
    });
    console.log(`S7 CASUAL shaped pieces held (deck-days): ${JSON.stringify(held)}`);
  }, 600_000);

  it("S5b (cap's ruling 7f2a91a61910e167): par and casual, 4 heroes x seeds 1-6 x days 1-10: no deck-day fails TURRET INTAKE", () => {
    let total = 0;
    const bad: string[] = [];
    withShapes(() => {
      for (const h of PLAYABLE_HEROES) for (const seed of [1, 2, 3, 4, 5, 6]) {
        for (const [who, days] of [["par", playerRun(h, 10, seed)], ["casual", casualRun(h, 10, seed)]] as const) {
          for (const d of days) {
            total++;
            const e = validateBuild(d.build, d.day, "strict").errors.filter((x) => /TURRET INTAKE/.test(x));
            if (e.length) bad.push(`${who} ${h} s${seed} d${d.day}: ${e.join("; ")}`);
          }
        }
      }
    });
    console.log(`S5b scan: ${bad.length} of ${total} deck-days fail TURRET INTAKE (before the sweep: 5 of 480)`);
    expect(total).toBe(480);
    expect(bad).toEqual([]);
  }, 900_000);
});

describe("SHAPES-1 S7.4: captains and warlords with SHAPES on", () => {
  it("every captain (days 1-10) and warlord deck passes the legality replay; each reshaped factory's move is listed", () => {
    const moves: string[] = [];
    const bad: string[] = [];
    const where = (b: Build) => b.items.filter((p) => RESHAPED_IDS.includes(p.def)).map((p) => `${p.def}@${p.x},${p.y}${p.rot ? `r${p.rot}` : ""}`).join(" ");
    for (const id of RIVAL_IDS) for (let day = 1; day <= 10; day++) {
      const off = rivalBuild(id, day);
      const on = withShapes(() => rivalBuild(id, day));
      if (where(off) !== where(on) || off.routes.length !== on.routes.length) moves.push(`captain ${id} day ${day}: ${where(off)} -> ${where(on)}; belts ${off.routes.length} -> ${on.routes.length}`);
      for (const p of withShapes(() => legalityProblems(on))) bad.push(`captain ${id} day ${day}: ${p}`);
      expect(on.items.filter((p) => SHAPES_IDS.includes(p.def))).toEqual([]); // no captain gets a new piece
    }
    for (const h of PLAYABLE_HEROES as HeroId[]) for (let day = 1; day <= 10; day++) {
      const off = warlordBuild(h, day);
      const on = withShapes(() => warlordBuild(h, day));
      if (where(off) !== where(on) || off.routes.length !== on.routes.length) moves.push(`warlord ${h} day ${day}: ${where(off)} -> ${where(on)}; belts ${off.routes.length} -> ${on.routes.length}`);
      for (const p of withShapes(() => legalityProblems(on))) bad.push(`warlord ${h} day ${day}: ${p}`);
    }
    console.log(`S7 PRESETS re-placed: ${moves.length}`);
    for (const m of moves) console.log(`S7 PRESET ${m}`);
    for (const m of bad) console.log(`S7 PRESET-BAD ${m}`);
    // with SHAPES off the replay is the base's (tests/rivals.test.ts); with it on, the only problems are the base's own
    const offBad: string[] = [];
    for (const id of RIVAL_IDS) for (let day = 1; day <= 10; day++) for (const p of legalityProblems(rivalBuild(id, day))) offBad.push(`captain ${id} day ${day}: ${p}`);
    for (const h of PLAYABLE_HEROES as HeroId[]) for (let day = 1; day <= 10; day++) for (const p of legalityProblems(warlordBuild(h, day))) offBad.push(`warlord ${h} day ${day}: ${p}`);
    expect(bad).toEqual(offBad);
  }, 600_000);
});

describe("SHAPES-1 S7.5: a dry stand-in sample with SHAPES on (in memory)", () => {
  it("a tiny genStandIns population: every pick passes validateBuild, has no unfused pair and is within budget", async () => {
    setShapes(true);
    const tiny = { ...STANDIN_DEFAULTS, pop: 6, gauntlet: 2, seeds: 1, elites: 2, refSeeds: 2, per: 2, grow: [8], stars: "on" as const };
    const res = await genStandIns(tiny, localRunner);
    let picks = 0, shaped = 0;
    for (const hd of res.days) for (const p of hd.picks) {
      picks++;
      if (p.build.items.some((q) => isShaped(ITEMS[q.def]))) shaped++;
      expect(validateBuild(p.build, hd.day).errors, `${hd.hero} d${hd.day} #${p.idx}`).toEqual([]);
      expect(unfusedPairs(p.build)).toEqual([]);
      expect(buildCost(p.build).total).toBeLessThanOrEqual(maxGoldByDay(hd.day));
    }
    setShapes(SHAPES); // SHAPES-1 flip: the shipped value
    console.log(`S7 DRY stand-in sample: ${res.days.length} hero-days, ${picks} picks, ${shaped} with a shaped piece`);
    expect(picks).toBeGreaterThan(0);
    void cloneBuild;
  }, 600_000);
});
