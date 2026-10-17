// SHAPES-2 (REQ-BFG-114 (4); BRIEF-SHAPES2 S4; step 5): bots, par, captains, warlords and the dry stand-in sample, with SHAPES2 and
// PLAIN_RIGS on (1D ships both).
// - the shaped-rig solver (beltside.ts shapedSpot, SHAPES-1's S7) scores L3, T4 and 2x2 hits right on fixed fixtures: ELBOW GUARD at a
//   belt's corner (2), on a straight belt (1); CINDER HOOK round a bend (4); JAW CRUSHER between two belts (4); PICKAXE with belt on
//   three sides (7); SAW BAR along a run (3); SPARK COMB (2); the typical player's tile; never a turret intake;
// - the buy-fit check (player.ts fitsSomewhere) covers the six;
// - the par player (four heroes, seeds 1-2, days 1-10) and the casual player: every deck legal, how many of the six they hold;
// - no deck of a captain or a warlord changes with SHAPES2 on, and each passes the legality replay (tests/rivals.legality.ts); where a
//   shaped rig would suit one is listed for a later pass;
// - a dry stand-in sample (harness/standins.ts genStandIns, a tiny population, in memory only): every pick validates; a deck holding
//   the six goes through the stand-in pool's code (encodeStarred / decodeStarred) and the ghost snapshot's (encodeSnapshot /
//   decodeSnapshot) and comes back the same, with SHAPES2 on; refused with it off.
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS, type HeroId } from "../src/sim/content";
import { cellsOf, cloneBuild, isIntakeCell, key as K, type Build, type Placed } from "../src/sim/deck";
import { footOnDeck, footprintCells, isShaped } from "../src/sim/foot";
import { SHAPES2, SHAPES2_IDS, setShapes2, withShapes2 } from "../src/sim/shapes2";
import { setPlainRigs, withPlainRigs } from "../src/sim/plainRigs";
import { shapedSpot, hitsIfPlaced } from "../src/sim/beltside";
import { fitsSomewhere, playerRun } from "../src/sim/harness/player";
import { casualRun } from "../src/sim/harness/casual";
import { RIVAL_IDS, rivalBuild } from "../src/sim/rivals";
import { warlordBuild } from "../src/sim/ai";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { legalityProblems } from "./rivals.legality";
import { STANDIN_DEFAULTS, genStandIns } from "../src/sim/harness/standins";
import { localRunner } from "../src/sim/harness/tournament";
import { decodeStarred, encodeStarred } from "../src/sim/standInPool";
import { checkBuildShape } from "../src/net/snapshot";

afterEach(() => setShapes2(SHAPES2));
const on = <T>(fn: () => T): T => withPlainRigs(() => withShapes2(fn));
const SIX = [...SHAPES2_IDS];

/** A bare deck: belts as given (factory uid 1, a KILN at (8,8)), items as given. */
function deck(routes: number[][], items: Placed[] = []): Build {
  return { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 8, y: 8 }, ...items], routes: routes.map((cells) => ({ factory: 1, cells })), mods: [], beltCap: 99, hullBonus: 0 };
}
const row = (y: number, x0: number, x1: number) => Array.from({ length: x1 - x0 + 1 }, (_, i) => K(x0 + i, y));
const col = (x: number, y0: number, y1: number) => Array.from({ length: y1 - y0 + 1 }, (_, i) => K(x, y0 + i));
const placementErrors = (b: Build, day: number) => validateBuild(b, day, "strict").errors.filter((e) => /^(placement|route|item: uid \d+ .* rot|shape)/.test(e));

describe("SHAPES-2 S4: the shaped-rig solver (shapedSpot) scores L3, T4 and 2x2 hits right", () => {
  const BEND = [K(1, 3), K(2, 3), K(3, 3), K(3, 4), K(4, 4)];

  it("ELBOW GUARD: at a belt's corner 2 hits (the most it can make), on a straight belt 1; the spot's cells are free and on the deck", () => {
    on(() => {
      const corner = shapedSpot(deck([BEND]), "elbowguard")!;
      expect(corner.hits.length).toBe(2);
      const straight = shapedSpot(deck([row(5, 1, 7)]), "elbowguard")!;
      expect(straight.hits.length).toBe(1); // two arrows on one straight belt can't be: they point out of diagonal cells
      for (const [b, sp] of [[deck([BEND]), corner], [deck([row(5, 1, 7)]), straight]] as const) {
        expect(footOnDeck(ITEMS.elbowguard, sp.x, sp.y, sp.rot)).toBe(true);
        const cells = footprintCells(ITEMS.elbowguard, sp.x, sp.y, sp.rot);
        expect(cells.every((k) => !b.items.some((p) => cellsOf(p).includes(k)) && !b.routes.some((r) => r.cells.includes(k)))).toBe(true);
        // the spot's hits are the real engine's: the helper agrees with a placed rig
        expect(hitsIfPlaced(b, "elbowguard", sp.x, sp.y, sp.rot).length).toBe(sp.hits.length);
      }
    });
  });

  it("CINDER HOOK round a bend: 4 hits (left and right of the L); one belt alone 2", () => {
    on(() => {
      const left = col(1, 2, 6), right = [K(4, 2), K(4, 3), K(4, 4), K(3, 4), K(3, 5)];
      expect(shapedSpot(deck([left, right]), "cinderhook")!.hits.length).toBe(4);
      expect(shapedSpot(deck([left]), "cinderhook")!.hits.length).toBe(2);
    });
  });

  it("JAW CRUSHER between two belts two cells apart: 4 hits, 2 on each; PICKAXE with belt on three sides: 7; SAW BAR along a run: 3; SPARK COMB: 2", () => {
    on(() => {
      const jaw = shapedSpot(deck([col(3, 2, 7), col(6, 2, 7)]), "jawcrusher")!;
      expect(jaw.hits.length).toBe(4);
      expect([jaw.hits.filter((h) => h.route === 0).length, jaw.hits.filter((h) => h.route === 1).length]).toEqual([2, 2]);
      const top = row(3, 2, 8), left = [K(3, 4), K(3, 5), K(4, 5), K(4, 6)], right = [K(7, 4), K(7, 5), K(6, 5), K(6, 6)];
      const pick = shapedSpot(deck([top, left, right]), "pickaxe")!;
      expect(pick.hits.length).toBe(7);
      expect([pick.x, pick.y, pick.rot]).toEqual([4, 4, 0]); // the T the way its three arrows face the three belts
      expect(shapedSpot(deck([row(5, 1, 6)]), "sawbar")!.hits.length).toBe(3);
      expect(shapedSpot(deck([row(5, 1, 6)]), "sparkcomb")!.hits.length).toBe(2);
    });
  });

  it("the typical player's tile: the best placement that hits that tile; a placement that wastes a cell beside a belt scores less", () => {
    on(() => {
      const b = deck([BEND]);
      for (const def of SIX) {
        const sp = shapedSpot(b, def, undefined, undefined, [0, 3]); // tile 3 = (3,4)
        if (!sp) continue;
        expect(sp.hits.some((h) => h.route === 0 && h.tile === 3), def).toBe(true);
      }
      // PICKAXE where every cell beside a belt shines on it scores its hits; a spot that leaves a belt-side cell idle loses 0.5 for it
      const lone = deck([row(5, 1, 3)]);
      const sp = shapedSpot(lone, "sawbar")!;
      expect(sp.hits.length).toBe(3);
      expect(footprintCells(ITEMS.sawbar, sp.x, sp.y, sp.rot).every((k) => sp.hits.some((h) => h.from === k))).toBe(true);
    });
  });

  it("never on a turret intake cell: belts along row 1 under FURNACE's intakes are worked from row 2, whatever the shape", () => {
    on(() => {
      const b = deck([row(1, 3, 6)]);
      for (const def of SIX) {
        const sp = shapedSpot(b, def);
        if (!sp) continue;
        expect(footprintCells(ITEMS[def], sp.x, sp.y, sp.rot).some((k) => isIntakeCell(b, k)), def).toBe(false);
      }
    });
  });
});

describe("SHAPES-2 S4: the buy-fit check", () => {
  it("fitsSomewhere covers the six: no connected belt, no fit; a par deck with belts, a fit for the most", () => {
    on(() => {
      const empty: Build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }], routes: [], mods: [], beltCap: 14, hullBonus: 0 };
      for (const id of SIX) {
        expect(isShaped(ITEMS[id]), id).toBe(true);
        expect(fitsSomewhere(empty, id), id).toBe(false);
      }
      const par = playerRun("weaver", 4, 1)[3].build;
      const fits = SIX.filter((id) => fitsSomewhere(par, id));
      expect(fits.length).toBeGreaterThanOrEqual(4);
      console.log(`S4 FIT weaver seed 1 day 4: fits ${fits.join(", ")}`);
    });
  });
});

describe("SHAPES-2 S4: par and the casual player with SHAPES2 on", () => {
  it("four heroes, seeds 1-2, days 1-10: every par deck is legal; how many of the six it holds", () => {
    const stat: Record<string, number> = {};
    on(() => {
      for (const h of PLAYABLE_HEROES) for (const seed of [1, 2]) {
        for (const d of playerRun(h, 10, seed)) {
          expect(placementErrors(d.build, d.day), `${h} seed ${seed} day ${d.day}`).toEqual([]);
          for (const p of d.build.items) if (SIX.includes(p.def)) stat[p.def] = (stat[p.def] ?? 0) + 1;
        }
      }
    });
    console.log(`S4 PAR the six held (deck-days; 4 heroes x seeds 1-2 x days 1-10 = 80 decks): ${JSON.stringify(stat)}`);
  }, 900_000);

  it("FURNACE and WEAVER, seeds 1-2: every casual deck is legal; and no deck-day of par or casual fails TURRET INTAKE (4 heroes, seeds 1-3)", () => {
    const held: Record<string, number> = {};
    const bad: string[] = [];
    let total = 0;
    on(() => {
      for (const h of ["furnace", "weaver"] as HeroId[]) for (const seed of [1, 2]) {
        for (const d of casualRun(h, 10, seed)) {
          expect(placementErrors(d.build, d.day), `casual ${h} seed ${seed} day ${d.day}`).toEqual([]);
          for (const p of d.build.items) if (SIX.includes(p.def)) held[p.def] = (held[p.def] ?? 0) + 1;
        }
      }
      for (const h of PLAYABLE_HEROES) for (const seed of [1, 2, 3]) {
        for (const [who, days] of [["par", playerRun(h, 10, seed)], ["casual", casualRun(h, 10, seed)]] as const) {
          for (const d of days) {
            total++;
            const e = validateBuild(d.build, d.day, "strict").errors.filter((x) => /TURRET INTAKE/.test(x));
            if (e.length) bad.push(`${who} ${h} s${seed} d${d.day}: ${e.join("; ")}`);
          }
        }
      }
    });
    console.log(`S4 CASUAL the six held (deck-days; 2 heroes x seeds 1-2 x days 1-10): ${JSON.stringify(held)}; intake scan ${bad.length} of ${total}`);
    expect(total).toBe(240);
    expect(bad).toEqual([]);
  }, 900_000);
});

describe("SHAPES-2 S4: captains and warlords with SHAPES2 on", () => {
  it("every captain (days 1-10) and warlord deck is the one it was, passes the legality replay, and holds none of the six; where one would suit", () => {
    const suit: string[] = [];
    const sixIn = (b: Build) => b.items.filter((p) => SIX.includes(p.def));
    for (const id of RIVAL_IDS) for (let day = 1; day <= 10; day++) {
      const off = rivalBuild(id, day);
      const onB = on(() => rivalBuild(id, day));
      expect(JSON.stringify(onB), `captain ${id} day ${day} is hand-authored: it does not move`).toBe(JSON.stringify(off));
      expect(sixIn(onB)).toEqual([]);
      expect(on(() => legalityProblems(onB)), `captain ${id} day ${day}`).toEqual(legalityProblems(off));
    }
    for (const h of PLAYABLE_HEROES as HeroId[]) for (let day = 1; day <= 10; day++) {
      const off = warlordBuild(h, day);
      const onB = on(() => warlordBuild(h, day));
      expect(JSON.stringify(onB), `warlord ${h} day ${day}`).toBe(JSON.stringify(off));
      expect(on(() => legalityProblems(onB)), `warlord ${h} day ${day}`).toEqual(legalityProblems(off));
    }
    // where a shaped rig would suit one (a later pass): a captain deck day 6 and 10 whose belts leave a corner or a run for a six piece
    on(() => {
      for (const id of RIVAL_IDS) for (const day of [6, 10]) {
        const b = rivalBuild(id, day);
        const fits = SIX.filter((def) => { const sp = shapedSpot(b, def); return !!sp && sp.hits.length >= (ITEMS[def].rarity === "common" ? 2 : 3); });
        if (fits.length) suit.push(`${id} d${day}: ${fits.join(", ")}`);
      }
    });
    console.log(`S4 CAPTAINS where a shaped rig would suit one (a spot with 2+ hits for a common, 3+ for a rare or epic): ${suit.join(" | ")}`);
  }, 600_000);
});

describe("SHAPES-2 S4: a dry stand-in sample with SHAPES2 and PLAIN_RIGS on (in memory)", () => {
  it("a tiny genStandIns population: every pick passes validateBuild, has no unfused pair and is within budget", async () => {
    // an async run: the switches are set and put back by hand (withPlainRigs and withShapes2 put theirs back when their function
    // returns, which for an async one is before its promise settles)
    setPlainRigs(true);
    setShapes2(true);
    try {
      const tiny = { ...STANDIN_DEFAULTS, pop: 6, gauntlet: 2, seeds: 1, elites: 2, refSeeds: 2, per: 2, grow: [8], stars: "on" as const };
      const res = await genStandIns(tiny, localRunner);
      let picks = 0, held = 0;
      for (const hd of res.days) for (const p of hd.picks) {
        picks++;
        if (p.build.items.some((q) => SIX.includes(q.def))) held++;
        expect(validateBuild(p.build, hd.day).errors, `${hd.hero} d${hd.day} #${p.idx}`).toEqual([]);
        expect(unfusedPairs(p.build)).toEqual([]);
        expect(buildCost(p.build).total).toBeLessThanOrEqual(maxGoldByDay(hd.day));
      }
      console.log(`S4 DRY stand-in sample: ${res.days.length} hero-days, ${picks} picks, ${held} holding one of the six`);
      expect(picks).toBeGreaterThan(0);
    } finally {
      setShapes2(SHAPES2);
      setPlainRigs(false);
    }
  }, 900_000);

  it("a deck holding the six goes through the stand-in code and the ghost snapshot and comes back the same, with SHAPES2 on; off, its pieces are unknown", () => {
    const parWith = (hero: HeroId, seed: number): Build => {
      // the day-6 par deck with one of each of the six added where the solver puts it (a deck that need not be affordable here)
      const b = cloneBuild(playerRun(hero, 6, seed)[5].build);
      let uid = 900;
      for (const def of SIX) {
        const sp = shapedSpot(b, def);
        if (sp) b.items.push({ uid: uid++, def, x: sp.x, y: sp.y, ...(sp.rot ? { rot: sp.rot } : {}) });
      }
      return b;
    };
    on(() => {
      let roundTrips = 0, sixSeen = new Set<string>();
      for (const h of PLAYABLE_HEROES as HeroId[]) for (const seed of [1, 2, 3]) {
        const b = parWith(h, seed);
        for (const p of b.items) if (SIX.includes(p.def)) sixSeen.add(p.def);
        const code = encodeStarred(b);
        const back = decodeStarred(h, code);
        // the same pieces at the same cells and turns (uids are renumbered by the code), and the same belts
        const key = (x: Build) => JSON.stringify([x.items.map((p) => [p.def, p.x, p.y, p.rot ?? 0, p.stars ?? 1]).sort(), x.routes.map((r) => r.cells)]);
        expect(key(back), `${h} seed ${seed}`).toBe(key(b));
        expect(() => checkBuildShape(JSON.parse(JSON.stringify(b)))).not.toThrow();
        roundTrips++;
      }
      console.log(`S4 CODES: ${roundTrips} decks round-tripped through the stand-in code, the six seen: ${[...sixSeen].join(", ")}`);
      expect(sixSeen.size).toBeGreaterThanOrEqual(4);
    });
    // with SHAPES2 off the code names an unknown piece
    const code = on(() => encodeStarred(parWith("furnace", 1)));
    expect(() => decodeStarred("furnace", code)).toThrow();
  }, 600_000);
});
