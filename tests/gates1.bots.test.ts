// GATES-1 (REQ-BFG-052; BRIEF-GATES1 G6, step 6): the bots' gates (src/sim/harness/gateBots.ts, with player.ts, shopper.ts and
// levers.ts). The par player values and buys the three gates per hero and places them by a RULE, tested here on fixtures:
// - the table: a FUSER is harmful on WEAVER at every star (r1d: WEAVER loses with any FUSER), so par never takes one there; every
//   other hero and gate is worth something, a star multiplies it, a SMELTER is worth by the deck's BURN;
// - the rule (gateSpot): a FUSER on the second-last tile of a belt into a heavy gun (r1d variant J), a SCATTER MILL before a light
//   gun with room to fire, a SMELTER on a burn deck's belt after the last BURN rig's hit; never where it does nothing (a belt that
//   feeds nothing, a belt too short, a thin belt for a FUSER, beside another gate, on a tile rig arrows aim at while another is
//   free); deterministic;
// - fitsSomewhere covers gates: a gate fits where a legal belt tile exists;
// - a gate rides with its belt when the par player redraws it (shopper.ts ridersOf, lift, reseat);
// - the par runs (GATES on): a FUSER is never bought on WEAVER, every gate on every dusk's deck stands on a belt tile, never beside
//   another gate, and the par run is deterministic; with the switch off none is bought (and the run key is as before).
import { afterEach, describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { connectorClaims, key as K, rigHits, rotField, routeInfo, type Build, type Placed } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import type { RateOut } from "../src/sim/deckRating";
import { GATES, setGates, withGates } from "../src/sim/gates";
import { beltTile, isConverterItem, splitProblem, strandedConverters } from "../src/sim/split";
import {
  FUSER_FLOW, FUSER_SOLE_FLOW, GATE_INTAKE, GATE_SLACK, GATE_STAR_FACTOR, GATE_VALUE, SMELTER_BURN_FIT, burnSources, gateFits, gateSpot, gateValue, gateWorth, parGateSpot,
} from "../src/sim/harness/gateBots";
import { Shopper } from "../src/sim/harness/shopper";
import { fitsSomewhere, playerRun } from "../src/sim/harness/player";

afterEach(() => setGates(GATES));

const THREE = ["fuser", "scattermill", "smelter"] as const;
const HEROES6: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
const up = (x: number, y0: number, y1: number): number[] => Array.from({ length: y0 - y1 + 1 }, (_, i) => K(x, y0 - i));

/** A deck of `hero` with factory `fac` at (fx, len) and a straight belt of `len` tiles up column fx into the gun at the top (tile t is
 *  cell (fx, len - 1 - t)); gates [def, tile] already on it; `extra` more items. */
function belt(hero: HeroId, fac: string, fx: number, len = 6, conv: [string, number][] = [], extra: Placed[] = []): Build {
  return {
    hero,
    items: [{ uid: 1, def: fac, x: fx, y: len }, ...conv.map(([def, t], i): Placed => ({ uid: 20 + i, def, x: fx, y: len - 1 - t })), ...extra],
    routes: [{ factory: 1, cells: up(fx, len - 1, 0) }], mods: [], beltCap: 30, hullBonus: 5000,
  };
}
const furnace = (conv: [string, number][] = [], extra: Placed[] = [], len = 6): Build => belt("furnace", "kiln", 4, len, conv, extra);
const weaver = (conv: [string, number][] = [], extra: Placed[] = [], len = 6): Build => belt("weaver", "loom", 4, len, conv, extra);

/** The rating's read-out with a chosen flow (payloads a second) on route 0: the rule's input without the rating. */
const flow = (arrival: number): RateOut => ({ stokeKeep: new Map(), arrival: new Map([[0, arrival]]), turretDmg: new Map() });
const cellOf = (b: Build, tile: number): number => b.routes[0].cells[tile];
const spotTile = (b: Build, def: string, ro: RateOut | undefined): number | null => gateSpot(b, def, ro)?.tile ?? null;

describe("GATES-1 G6: the table", () => {
  it("a FUSER is harmful on WEAVER at every star (r1d: WEAVER loses with any FUSER), so par never takes one; the other pairs are worth something", () => {
    withGates(() => {
      for (const stars of [1, 2, 3]) {
        for (const kind of ["light", "heavy", "medium", "adaptable"] as const) expect(gateValue("weaver", "fuser", stars, { kind, speed: 40 }, 1, 0), `weaver FUSER ★${stars} into ${kind}`).toBeLessThan(0);
      }
      for (const h of HEROES6) for (const id of THREE) {
        if (h === "weaver" && id === "fuser") continue;
        expect(GATE_VALUE[id][h], `${h} ${id}`).toBeGreaterThan(0);
        expect(gateValue(h, id, 1, { kind: "heavy", speed: 30 }, 1, 2), `${h} ${id} worth`).toBeGreaterThan(0);
      }
      // the best use pays most: a FUSER into a heavy gun beats one into a light gun; a SCATTER MILL the reverse
      expect(gateValue("furnace", "fuser", 1, { kind: "heavy", speed: 30 }, 1, 0)).toBeGreaterThan(gateValue("furnace", "fuser", 1, { kind: "light", speed: 55 }, 1, 0));
      expect(gateValue("weaver", "scattermill", 1, { kind: "light", speed: 55 }, 0.5, 0)).toBeGreaterThan(gateValue("weaver", "scattermill", 1, { kind: "heavy", speed: 30 }, 0.5, 0));
    });
  });

  it("a star multiplies the value by what the star adds to the gate's number; a SMELTER is worth by the BURN on the deck; anything that is no gate is worth nothing", () => {
    withGates(() => {
      for (const id of THREE) {
        const f = GATE_STAR_FACTOR[id];
        expect(f[0]).toBe(1);
        expect(f[1]).toBeGreaterThan(f[0]);
        expect(f[2]).toBeGreaterThan(f[1]);
        const [one, two, three] = [1, 2, 3].map((s) => gateValue("furnace", id, s, { kind: "heavy", speed: 30 }, 1, 2));
        expect(two / one).toBeCloseTo(f[1], 6);
        expect(three / one).toBeCloseTo(f[2], 6);
        expect(gateValue("furnace", id, 9, { kind: "heavy", speed: 30 }, 1, 2), "stars cap at ★3").toBe(three);
      }
      const at = (sources: number) => gateValue("furnace", "smelter", 1, { kind: "heavy", speed: 30 }, 1, sources);
      expect(at(0) / at(2)).toBeCloseTo(SMELTER_BURN_FIT[0] / SMELTER_BURN_FIT[2], 6); // no BURN on the deck: a quarter
      expect(at(1)).toBeGreaterThan(at(0));
      expect(at(3)).toBeGreaterThan(at(2));
      expect(at(7), "three or more").toBe(at(3));
      expect(gateValue("furnace", "whetstone", 1, { kind: "heavy", speed: 30 }, 1, 2)).toBe(0);
    });
  });

  it("burnSources counts the rigs that add BURN (TEMPER, RASP, EMBER TROUGH, BELLOWS) one each and what cashes it in half; gateWorth sums the gates on belts that feed a gun", () => {
    withGates(() => {
      const temper: Placed = { uid: 9, def: "temper", x: 3, y: 3, ...rotField("temper", rotFacing("temper", 1)) };
      expect(burnSources(furnace())).toBe(0);
      expect(burnSources(furnace([], [temper]))).toBe(1);
      expect(burnSources(furnace([], [temper, { ...temper, uid: 10, def: "rasp", y: 2 }]))).toBe(2);
      const ro = flow(0.8);
      expect(gateWorth(furnace(), ro)).toBe(0);
      const one = gateWorth(furnace([["fuser", 4]]), ro);
      expect(one).toBeGreaterThan(0);
      expect(gateWorth(furnace([["fuser", 4], ["smelter", 2]]), ro)).toBeGreaterThan(one);
      expect(gateWorth(weaver([["fuser", 4]]), ro), "WEAVER's FUSER is a minus").toBeLessThan(0);
      // a gate on a belt that feeds no gun is worth nothing (the belt ends short of the connector)
      const short = furnace([["smelter", 1]], [], 6);
      short.routes[0].cells = short.routes[0].cells.slice(0, 4);
      expect(gateWorth(short, ro)).toBe(0);
    });
  });
});

describe("GATES-1 G6: where par puts a gate (gateSpot)", () => {
  it("a FUSER goes on the second-last tile of the belt into a heavy gun (r1d variant J); a SMELTER in the middle; a SCATTER MILL nowhere into a heavy gun that is already full", () => {
    withGates(() => {
      const b = furnace();
      expect(HEROES.furnace.turrets[0].kind).toBe("heavy");
      expect(routeInfo(b, 0, connectorClaims(b), undefined, []).connected).toBe(true);
      const ro = flow(0.8);
      expect(spotTile(b, "fuser", ro)).toBe(4);
      expect(gateSpot(b, "fuser", ro)).toMatchObject({ x: 4, y: 1, route: 0, tile: 4 });
      expect(spotTile(b, "smelter", ro)).toBe(2);
      expect(spotTile(b, "scattermill", ro), "a heavy gun fires about a load a second: the belt already fills it").toBeNull();
      for (const id of THREE) {
        const sp = gateSpot(b, id, ro);
        if (sp) expect(splitProblem(b, id, K(sp.x, sp.y)), `${id}: a legal tile`).toBeNull();
      }
    });
  });

  it("a SCATTER MILL goes before a light gun with room to fire, at least 3 tiles before the end, in the middle; the same belt full of flow takes none", () => {
    withGates(() => {
      const b = weaver();
      expect(HEROES.weaver.turrets[1].kind).toBe("light");
      const sp = gateSpot(b, "scattermill", flow(0.3));
      expect(sp, "room to fire").not.toBeNull();
      expect(sp!.tile).toBe(2);
      expect(b.routes[0].cells.length - 1 - sp!.tile, "the pellets' tiles after it").toBeGreaterThanOrEqual(3);
      expect(gateSpot(b, "scattermill", flow(1.4)), "no room: the gun is already fed").toBeNull();
      // and never on a belt that already holds a FUSER, nor a FUSER on a belt that holds a SCATTER MILL
      expect(gateSpot(weaver([["fuser", 4]]), "scattermill", flow(0.3))).toBeNull();
      expect(gateSpot(furnace([["scattermill", 2]]), "fuser", flow(0.8))).toBeNull();
    });
  });

  it("a FUSER needs a belt that carries two slugs' worth: a thin belt takes a SMELTER but no FUSER", () => {
    withGates(() => {
      const b = furnace();
      expect(FUSER_SOLE_FLOW).toBeGreaterThan(FUSER_FLOW);
      expect(spotTile(b, "fuser", flow(FUSER_SOLE_FLOW - 0.1))).toBeNull();
      expect(spotTile(b, "fuser", flow(FUSER_SOLE_FLOW))).toBe(4);
      expect(spotTile(b, "smelter", flow(0.1))).toBe(2);
    });
  });

  it("never on a belt that brings more than the gate takes in a second (the belt would back up behind it): a SMELTER or SCATTER MILL 1, a FUSER 2, with a tenth of slack", () => {
    withGates(() => {
      expect(GATE_INTAKE).toEqual({ fuser: 2, scattermill: 1, smelter: 1 });
      const b = weaver();
      expect(spotTile(b, "smelter", flow(GATE_SLACK * GATE_INTAKE.smelter)), "right at the limit").not.toBeNull();
      expect(spotTile(b, "smelter", flow(GATE_SLACK * GATE_INTAKE.smelter + 0.05)), "past it").toBeNull();
      expect(spotTile(b, "smelter", flow(1.4)), "a WEAVER's loom belt brings 1.4 a second").toBeNull();
      expect(spotTile(furnace(), "fuser", flow(GATE_SLACK * GATE_INTAKE.fuser))).toBe(4);
      expect(spotTile(furnace(), "fuser", flow(GATE_SLACK * GATE_INTAKE.fuser + 0.05))).toBeNull();
      // a gate put back on a redrawn belt (reseat: relaxed) is never refused for flow
      expect(gateSpot(b, "smelter", flow(1.4), { relaxed: true, only: 0 })).not.toBeNull();
    });
  });

  it("a SMELTER on a burn deck's belt goes on the first legal tile after the last BURN rig's hit, else the middle", () => {
    withGates(() => {
      const temper = (y: number): Placed => ({ uid: 9, def: "temper", x: 3, y, ...rotField("temper", rotFacing("temper", 1)) }); // aims east at (4, y)
      for (const [y, aimed] of [[3, 2], [4, 1], [2, 3]] as const) {
        const b = furnace([], [temper(y)]);
        expect(rigHits(b)[0][aimed].length, `TEMPER at (3, ${y}) aims at tile ${aimed}`).toBe(1);
        const t = spotTile(b, "smelter", flow(0.8));
        expect(t, `after the hit at tile ${aimed}`).toBe(aimed + 1);
        expect(splitProblem(b, "smelter", cellOf(b, t!))).toBeNull();
      }
      expect(spotTile(furnace(), "smelter", flow(0.8)), "no BURN: the middle").toBe(2);
    });
  });

  it("never where it does nothing: a belt that feeds no gun, a belt too short, beside another gate, off the legal tiles", () => {
    withGates(() => {
      const ro = flow(0.8);
      // the belt stops short of the connector: connected false, nothing is worth a gate
      const loose = furnace();
      loose.routes[0].cells = loose.routes[0].cells.slice(0, 4);
      expect(routeInfo(loose, 0, connectorClaims(loose), undefined, []).connected).toBe(false);
      for (const id of THREE) expect(gateSpot(loose, id, ro), `${id} on a belt that feeds nothing`).toBeNull();
      // too short: belt on both sides takes 3 tiles; a FUSER wants 4 (near the end, with belt to pair on), a SCATTER MILL 5
      expect(spotTile(furnace([], [], 2), "smelter", ro)).toBeNull();
      expect(spotTile(furnace([], [], 3), "smelter", flow(0.8))).toBe(1);
      expect(spotTile(furnace([], [], 3), "fuser", flow(0.8))).toBeNull();
      expect(spotTile(weaver([], [], 4), "scattermill", flow(0.3))).toBeNull();
      // beside another gate: never the tiles next to the FUSER on tile 4, and one gate of each kind a belt
      const b = furnace([["fuser", 4]]);
      const t = spotTile(b, "smelter", ro);
      expect(t).not.toBeNull();
      expect([3, 5, 4]).not.toContain(t);
      expect(spotTile(b, "fuser", ro), "a second FUSER on the belt").toBeNull();
      expect(parGateSpot(furnace(), "fuser", 3), "the read-out rule in one call").not.toBeNull();
      expect(gateSpot(furnace(), "whetstone", ro), "not a gate").toBeNull();
    });
  });

  it("a tile that rig arrows aim at is passed over for the next legal tile that none aims at (an arrow at a gate idles); deterministic", () => {
    withGates(() => {
      const ro = flow(0.8);
      const aimAt4: Placed = { uid: 9, def: "temper", x: 3, y: 1, ...rotField("temper", rotFacing("temper", 1)) }; // hits (4, 1) = tile 4
      const b = furnace([], [aimAt4]);
      expect(rigHits(b)[0][4].length).toBe(1);
      expect(spotTile(b, "fuser", ro), "the second-last tile has an arrow on it").toBe(3);
      expect(JSON.stringify(gateSpot(b, "fuser", ro))).toBe(JSON.stringify(gateSpot(b, "fuser", ro)));
      // when every tile in reach has an arrow the preferred tile is taken (those arrows idle)
      const all = [1, 2, 3].map((y, i): Placed => ({ uid: 30 + i, def: "temper", x: 3, y, ...rotField("temper", rotFacing("temper", 1)) }));
      const b3 = furnace([], all);
      expect([1, 2, 3].map((t) => rigHits(b3)[0][5 - t].length)).toEqual([1, 1, 1]);
      expect(spotTile(b3, "fuser", ro), "all three tiles in reach have an arrow: the preferred tile").toBe(4);
    });
  });
});

describe("GATES-1 G6: fitsSomewhere, and a gate rides with its belt", () => {
  it("a gate fits where a legal belt tile exists; a deck with no belt, or none long enough, holds none", () => {
    withGates(() => {
      for (const id of THREE) {
        expect(gateFits(furnace(), id), id).toBe(true);
        expect(fitsSomewhere(furnace(), id), `fitsSomewhere ${id}`).toBe(true);
      }
      const none = furnace();
      none.routes = [];
      for (const id of THREE) { expect(gateFits(none, id), `${id}: no belt`).toBe(false); expect(fitsSomewhere(none, id)).toBe(false); }
      expect(gateFits(furnace([], [], 2), "smelter"), "two tiles: no belt on both sides").toBe(false);
      // the other kinds' rules stand: a plain rig fits anywhere
      expect(fitsSomewhere(none, "whetstone")).toBe(true);
    });
  });

  it("the par player's belt redraw lifts the gates standing on the belt and puts them back on the new one (ridersOf, lift, reseat); with GATES off no gate rides", () => {
    withGates(() => {
      const b = furnace([["fuser", 4], ["smelter", 2]]);
      const s = new Shopper(b, 99, 3, new Rng(1), "on", 3, "on", "on");
      const riders = s.ridersOf(0);
      expect(riders.map((p) => p.def).sort()).toEqual(["fuser", "smelter"]);
      expect(riders.every(isConverterItem)).toBe(true);
      s.lift(riders);
      expect(b.items.some((p) => isConverterItem(p))).toBe(false);
      expect(s.reseat(riders, 0), "both found a place").toBe(2);
      const back = b.items.filter(isConverterItem);
      expect(back.map((p) => p.def).sort()).toEqual(["fuser", "smelter"]);
      for (const p of back) expect(beltTile(b, K(p.x, p.y))?.[0], `${p.def} on belt 0`).toBe(0);
      expect(strandedConverters(b), "none stranded").toEqual([]);
      const cells = back.map((p) => K(p.x, p.y)).sort((x, y) => x - y);
      expect(new Set(cells).size, "two cells").toBe(2);
    });
    // off: no converter exists, and the rider list is the rigs' as before
    const off = furnace();
    expect(new Shopper(off, 99, 3, new Rng(1), "on", 3, "on", "on").ridersOf(0)).toEqual([]);
  });
});

describe("GATES-1 G6: the par runs (GATES on)", () => {
  const SEEDS = 8;
  const days = (hero: HeroId, seed: number) => withGates(() => playerRun(hero, 10, seed));
  it("a FUSER is never bought on WEAVER; the others are bought where they pay; every gate on every dusk's deck stands on a belt tile, never beside another gate", () => {
    const bought: Record<string, Record<string, number>> = {};
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) {
      bought[hero] = {};
      for (let seed = 1; seed <= SEEDS; seed++) {
        const run = days(hero, seed);
        for (const d of run) {
          for (const bb of d.buys) if (THREE.includes(bb.def as (typeof THREE)[number])) bought[hero][bb.def] = (bought[hero][bb.def] ?? 0) + 1;
          withGates(() => {
            const gates = d.build.items.filter(isConverterItem);
            for (const p of gates) {
              const at = beltTile(d.build, K(p.x, p.y));
              expect(at, `${hero} seed ${seed} day ${d.day}: ${p.def} at (${p.x}, ${p.y}) stands on a belt tile`).not.toBeNull();
              for (const q of gates) if (q !== p) expect(Math.abs(q.x - p.x) + Math.abs(q.y - p.y) === 1 && beltTile(d.build, K(q.x, q.y))?.[0] === at![0] && Math.abs(beltTile(d.build, K(q.x, q.y))![1] - at![1]) === 1, `${hero} seed ${seed} day ${d.day}: two gates side by side`).toBe(false);
            }
            expect(strandedConverters(d.build), `${hero} seed ${seed} day ${d.day}`).toEqual([]);
          });
        }
      }
    }
    console.log(`GATES-1 par buys, seeds 1-${SEEDS}: ${JSON.stringify(bought)}`);
    expect(bought.weaver.fuser ?? 0, "WEAVER never buys a FUSER").toBe(0);
    const total = Object.values(bought).reduce((a, h) => a + Object.values(h).reduce((x, y) => x + y, 0), 0);
    expect(total, "par buys gates at all").toBeGreaterThan(5);
  }, 240_000);

  it("deterministic (the same hero and seed give the same run), and the run key moves with the switch: a switch-off run buys none", () => {
    const a = JSON.stringify(days("furnace", 3).map((d) => d.build)), b = JSON.stringify(days("furnace", 3).map((d) => d.build));
    expect(a).toBe(b);
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default; REQ-BFG-052): was `expect(GATES).toBe(false)` and the loop bare (the shipped world had GATES off); GATES ships on, so the switch-off runs are made
    // in the switch-off world, asked for outright (withGates(fn, false), synchronously: the run key moves with the switch)
    expect(GATES).toBe(true);
    withGates(() => {
      for (const hero of ["furnace", "bastion"] as HeroId[]) for (let seed = 1; seed <= 3; seed++) {
        const run = playerRun(hero, 10, seed);
        expect(run.flatMap((d) => d.buys).some((bb) => (THREE as readonly string[]).includes(bb.def)), `${hero} ${seed} off`).toBe(false);
        expect(run.flatMap((d) => d.build.items).some((p) => ITEMS[p.def] === undefined), "every def is a def of the world it ran in").toBe(false);
      }
    }, false);
  }, 120_000);
});
