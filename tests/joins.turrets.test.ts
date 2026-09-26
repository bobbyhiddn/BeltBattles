// 0.6.2m (the mechanics head): BELT JOINS (0.6.2j, REQ-BFG-027) x TURRET SLOTS (0.6.2s, REQ-BFG-031). The joins series
// was built on 3fbd553, before turret slots; the release owner's integration checks the four places they meet:
// 1. J14 (d): a joining belt feeds whatever turret its chain's main belt feeds, through hero(b) (= the build's resolved
//    slots): the extra slot's installed turret fires the joined payloads.
// 2. A turret move, swap or removal that leaves a join chain's main belt without an intake: deadEndsAt names the main
//    belt, the whole chain goes dead, and FIGHT blocks.
// 3. J15 x 0.6.2p's RouteModel.fixed: the shared tiles belong to the main belt and draw its own state (fixed pace and
//    neutral tint on a slag-fed main belt; its speed tints on a normal one), in the build preview and in battle.
// 4. A deck with both a join and a `turrets` field survives GhostSnapshot v2 (net and local) and validateBuild; v1
//    refuses it.
import { describe, expect, it } from "vitest";
import { Battle, simulate, turretAt } from "../src/sim/battle";
import { AMMO, BELT_SPEED, HEROES, ITEMS, RULES_VERSION } from "../src/sim/content";
import {
  cloneBuild, deadEndsAt, installTurret, key as K, moveTurret, removeTurret, rotField, routeInfo, type Build, type Placed,
} from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { brokenRoutes, fightBlock, NOWHERE } from "../src/game/routeCheck";
import { validateBuild } from "../src/net/validate";
import * as net from "../src/net/snapshot";
import * as local from "../src/game/ghostSnapshot";
import { cruiserModel } from "../src/render/cruiser";
import { chevronSpeed, chevronTint } from "../src/render/machinery";
import { Arena } from "../src/game/arena";

const rig = (uid: number, def: string, x: number, y: number, facing: 0 | 1 | 2 | 3): Placed =>
  ({ uid, def, x, y, ...rotField(def, rotFacing(def, facing)) });
// a foe that never fires (no belts) and never falls
const FOE: Build = { hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 6 }], routes: [], mods: [], beltCap: 24, hullBonus: 100000 };
const CAP = HEROES.furnace.belt + 2 * ITEMS.beltcrate.supply!.belt!; // two belt crates

// FURNACE: the KILN's belt M up column 4 into slot 0 (the starting heavy gun); a STAMP PRESS (uid 2, at 6,6) whose belt P
// runs up column 8 into the EXTRA slot (slot 1, columns 8-9); a SLAG POT (uid 3, at 8,8; two unfused STAMP PRESSES would
// be an UNFUSED PAIR) whose belt J runs up column 9 and joins P at (8,4), P's tile 2.
const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const P = [K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)];
const J = [K(9, 7), K(9, 6), K(9, 5), K(9, 4)];
function extraSlotDeck(): Build {
  return {
    hero: "furnace", mods: [], beltCap: CAP, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 }, { uid: 3, def: "slagpot", x: 8, y: 8 }],
    routes: [{ factory: 1, cells: [...M] }, { factory: 2, cells: [...P] }, { factory: 3, cells: [...J], join: K(8, 4) }],
  };
}
const withCarronade = (b: Build): Build => {
  expect(installTurret(b, { uid: 500, def: "carronade" }, 1).ok).toBe(true);
  return b;
};

/** The factories whose payloads slot `slot`'s turret loaded, over `secs` seconds of battle against FOE. */
function loadedBy(b: Build, slot: number, secs: number): { factories: Set<number>; fires: number } {
  const bt = new Battle(b, FOE, 7);
  const s = bt.sides[0];
  const factories = new Set<number>();
  let fires = 0;
  for (let i = 0; i < 60 * secs && !bt.over; i++) {
    bt.step();
    const tu = turretAt(s, slot);
    if (tu) for (const p of tu.stack) factories.add(p.factory);
    for (const e of bt.drainEvents()) if (e.type === "fire" && e.side === 0 && e.turret === slot) fires++;
  }
  return { factories, fires };
}

describe("1. J14 (d): a joining belt feeds its main belt's turret, whatever slot that turret sits in", () => {
  it("the extra slot empty: its belt and the belt joining it are dead ends and FIGHT blocks", () => {
    const b = extraSlotDeck();
    expect(routeInfo(b, 1).connected).toBe(false);
    expect(routeInfo(b, 2).connected).toBe(false);
    expect(deadEndsAt(b, 1)).toEqual([1]); // the main belt ends under the slot; the joiner ends on row 4
    expect(fightBlock(b)).toBe(NOWHERE);
    expect(brokenRoutes(b)).toEqual([1, 2]);
  });

  it("a turret installed in the extra slot takes the main belt and, through the join, the joining belt; both fire from it", () => {
    const b = withCarronade(extraSlotDeck());
    expect(fightBlock(b)).toBeUndefined();
    expect([routeInfo(b, 1).connected, routeInfo(b, 1).turret]).toEqual([true, 1]);
    const j = routeInfo(b, 2);
    expect([j.connected, j.turret, j.connector, j.join?.route, j.join?.cell]).toEqual([true, 1, -1, 1, K(8, 4)]);
    expect(validateBuild(b, 10)).toEqual({ ok: true, errors: [] });
    const r = loadedBy(b, 1, 20);
    expect(r.factories.has(2)).toBe(true); // the main belt's own payloads
    expect(r.factories.has(3)).toBe(true); // the joined payloads: J ends on row 4, so only the join brings them here
    expect(r.fires).toBeGreaterThan(0);
    // slot 0's heavy gun never sees them: its only belt is the KILN's
    expect([...loadedBy(b, 0, 20).factories]).toEqual([1]);
  });
});

describe("2. a turret move, swap or removal that strands a join chain's main belt", () => {
  // FURNACE's start layout: the KILN's belt M into slot 0; a STAMP PRESS (uid 2, at 0,6) whose belt R joins M's tile 1
  const R = [K(2, 6), K(2, 5), K(2, 4), K(3, 4)];
  const chain = (): Build => ({
    hero: "furnace", mods: [], beltCap: HEROES.furnace.belt, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 }],
    routes: [{ factory: 1, cells: [...M] }, { factory: 2, cells: [...R], join: K(4, 4) }],
  });

  it("moving the heavy gun to the empty extra slot: deadEndsAt names the main belt, the joiner dies with it, FIGHT blocks", () => {
    const b = chain();
    expect(fightBlock(b)).toBeUndefined();
    expect(moveTurret(b, 0, 1).ok).toBe(true);
    expect(deadEndsAt(b, 0)).toEqual([0]);
    expect(routeInfo(b, 0).connected).toBe(false);
    expect(routeInfo(b, 1).connected).toBe(false);
    expect(fightBlock(b)).toBe(NOWHERE);
    expect(brokenRoutes(b)).toEqual([0, 1]);
    expect(validateBuild(b, 1).ok).toBe(false);
    // and back: the chain feeds slot 0 again
    expect(moveTurret(b, 1, 0).ok).toBe(true);
    expect(deadEndsAt(b, 0)).toEqual([]);
    expect([routeInfo(b, 1).connected, routeInfo(b, 1).turret]).toEqual([true, 0]);
    expect(fightBlock(b)).toBeUndefined();
  });

  it("removing the gun strands the chain the same way", () => {
    const b = chain();
    expect(removeTurret(b, 0).ok).toBe(true);
    expect(deadEndsAt(b, 0)).toEqual([0]);
    expect(brokenRoutes(b)).toEqual([0, 1]);
    expect(fightBlock(b)).toBe(NOWHERE);
  });

  it("through every install, swap, move and removal the joiner feeds exactly what its main belt feeds", () => {
    const b = chain();
    const same = (what: string) => {
      const m = routeInfo(b, 0), j = routeInfo(b, 1);
      expect([j.connected, j.turret], what).toEqual([m.connected, m.turret]);
      expect(j.connector, what).toBe(-1); // J2: a joining belt claims no connector itself
      expect(fightBlock(b) === undefined, what).toBe(m.connected);
    };
    same("start");
    expect(installTurret(b, { uid: 500, def: "carronade" }, 1).ok).toBe(true);
    same("carronade in the extra slot");
    expect(moveTurret(b, 0, 1).ok).toBe(true);
    same("swapped: the carronade in slot 0");
    expect(removeTurret(b, 0).ok).toBe(true);
    same("slot 0 emptied");
    expect(moveTurret(b, 1, 0).ok).toBe(true);
    same("the heavy gun back in slot 0");
  });
});

describe("3. J15 x RouteModel.fixed: the shared tiles draw the main belt's own state", () => {
  // As 2's chain, with a speed rig on each belt: a GREASE WORKS east of M's tile 2 (4,3), on the shared stretch past the
  // join tile (1.6x from there), and a BRAKE SHOE west of R's tile 1 (2,5) (0.5x from there). Either factory may be a
  // SLAG POT (slag rides at AMMO.slag.fixedSpeed); with a SLAG POT main belt the deck's KILN stands idle at (6,6).
  const R = [K(2, 6), K(2, 5), K(2, 4), K(3, 4)];
  function greased(o: { main?: string; joiner?: string; joined?: boolean }): Build {
    return {
      hero: "furnace", mods: [], beltCap: HEROES.furnace.belt, hullBonus: 0,
      items: [
        { uid: 1, def: o.main ?? "kiln", x: 4, y: 6 }, { uid: 2, def: o.joiner ?? "press", x: 0, y: 6 },
        rig(11, "grease", 5, 3, 3), rig(12, "brake", 1, 5, 1),
        ...(o.main && o.main !== "kiln" ? [{ uid: 3, def: "kiln", x: 6, y: 6 }] : []),
      ],
      routes: [{ factory: 1, cells: [...M] }, { factory: 2, cells: [...R], ...(o.joined === false ? {} : { join: K(4, 4) }) }],
    };
  }
  const r3 = (xs: ArrayLike<number>) => Array.from(xs, (v) => +v.toFixed(3)); // RouteModel.speeds is a Float32Array
  const tints = (rm: { speeds: ArrayLike<number>; fixed?: number }) => Array.from(rm.speeds, (s) => chevronTint(s, rm.fixed));
  const paces = (rm: { speeds: ArrayLike<number>; fixed?: number }) => r3(Array.from(rm.speeds, (s) => chevronSpeed(s, rm.fixed)));
  const slag = AMMO.slag.fixedSpeed!;

  it("the decks are legal, and the join tile and the shared stretch are the main belt's tiles only", () => {
    for (const o of [{ main: "slagpot" }, { joiner: "slagpot" }]) {
      const b = greased(o);
      expect(validateBuild(b, 10).errors).toEqual([]);
      const [main, joiner] = cruiserModel(b).routes;
      expect(main.cells).toEqual(M);
      expect(joiner.cells).toEqual(R);
      expect(M.slice(1).some((k) => joiner.cells.includes(k))).toBe(false);
    }
  });

  it("a slag-fed main belt with a normal joiner: every main tile, the shared stretch included, is neutral at 0.75x", () => {
    const b = greased({ main: "slagpot" });
    const [main, joiner] = cruiserModel(b).routes;
    expect([main.fixed, joiner.fixed]).toEqual([slag, undefined]);
    expect(r3(main.speeds)).toEqual([1, 1, 1.6, 1.6, 1.6, 1.6]); // the GREASE's preview state is there ...
    expect(tints(main)).toEqual(Array(6).fill("n")); // ... and the slag belt's chevrons ignore it
    expect(paces(main)).toEqual(Array(6).fill(slag));
    expect(tints(joiner)).toEqual(["n", "s", "s", "s"]); // the joiner keeps its own BRAKE, not the main belt's look
    expect(paces(joiner)).toEqual([1, 0.5, 0.5, 0.5]);
    const open = cruiserModel(greased({ main: "slagpot", joined: false })).routes[0];
    expect([Array.from(main.speeds), main.fixed]).toEqual([Array.from(open.speeds), open.fixed]);
  });

  it("a normal main belt with a slag joiner: the main tiles keep their speed tints; the joiner's own tiles are neutral", () => {
    const b = greased({ joiner: "slagpot" });
    const [main, joiner] = cruiserModel(b).routes;
    expect([main.fixed, joiner.fixed]).toEqual([undefined, slag]);
    expect(tints(main)).toEqual(["n", "n", "f", "f", "f", "f"]);
    expect(paces(main)).toEqual([1, 1, 1.6, 1.6, 1.6, 1.6]);
    expect(r3(joiner.speeds)).toEqual([1, 0.5, 0.5, 0.5]); // the BRAKE's preview state is there ...
    expect(tints(joiner)).toEqual(Array(4).fill("n")); // ... and the slag joiner's own tiles ignore it
    expect(paces(joiner)).toEqual(Array(4).fill(slag));
    const open = cruiserModel(greased({ joiner: "slagpot", joined: false })).routes[0];
    expect([Array.from(main.speeds), main.fixed]).toEqual([Array.from(open.speeds), open.fixed]);
  });

  it("in battle, Arena's belt phase moves every main tile at the main belt's own pace, both ways round", () => {
    for (const o of [{ main: "slagpot" }, { joiner: "slagpot" }]) {
      const a = new Arena(greased(o), FOE, 7, null);
      a.quiet = true;
      for (let i = 0; i < 60 * 4; i++) a.update(1 / 60); // every rig online
      const s = a.b.sides[0], ph = a.sfx[0].beltPhase, model = a.sfx[0].model.routes;
      const moving = [0, 0];
      let greaseMoving = 0;
      for (let f = 0; f < 60; f++) {
        const before = ph.map((p) => [...p]);
        a.update(1 / 60);
        for (const ri of [0, 1]) {
          for (let i = 0; i < ph[ri].length; i++) {
            const d = ph[ri][i] - before[ri][i];
            if (d === 0) continue; // a stopped (queued) tile
            const own = chevronSpeed(s.routes[ri].speedAt[i], model[ri].fixed);
            expect(d, `${JSON.stringify(o)} route ${ri} tile ${i}`).toBeCloseTo((BELT_SPEED * own) / 60, 4);
            moving[ri]++;
            if (ri === 0 && !o.main && i >= 2 && Math.abs(own - 1.6) < 1e-9) greaseMoving++;
          }
        }
      }
      expect(moving[0]).toBeGreaterThan(0);
      expect(moving[1]).toBeGreaterThan(0);
      if (o.main) expect(model[0].fixed).toBe(slag); // every main-tile delta above was the slag's pace
      else expect(greaseMoving).toBeGreaterThan(0); // the shared stretch ran at its GREASE's 1.6x, not the slag's 0.75x
    }
  });
});

describe("4. a deck with a join and turrets travels: GhostSnapshot v2 (net and local), validateBuild", () => {
  const snap = (build: Build, v: 1 | 2 = 2): net.GhostSnapshot =>
    ({ v, rules: RULES_VERSION, hero: build.hero, day: 10, wins: 0, lives: 5, build, runId: "run-1", playerId: "p-1", createdAt: 1 });

  it("round-trips byte-stably with both fields, decodes to a legal deck that fights the same battle", () => {
    const b = withCarronade(extraSlotDeck());
    expect(b.turrets).toBeDefined();
    const s = snap(b);
    expect(() => net.checkSnapshot(s)).not.toThrow();
    expect(local.isSnapshot(s)).toBe(true);
    const text = net.encodeSnapshot(s);
    const back = net.decodeSnapshot(text);
    expect(back.build.turrets).toEqual(b.turrets);
    expect(back.build.routes.map((r) => r.join)).toEqual([undefined, undefined, K(8, 4)]);
    expect(net.encodeSnapshot(back)).toBe(text);
    expect(local.isSnapshot(back)).toBe(true);
    expect(validateBuild(back.build, 10)).toEqual({ ok: true, errors: [] });
    const x = simulate(b, FOE, 5), y = simulate(cloneBuild(back.build), FOE, 5);
    expect([y.ticks, y.winner, y.sides[1].hull.hp]).toEqual([x.ticks, x.winner, x.sides[1].hull.hp]);
  });

  it("a v1 snapshot refuses it (net and local)", () => {
    const s = snap(withCarronade(extraSlotDeck()), 1);
    expect(() => net.checkSnapshot(s)).toThrow();
    expect(local.isSnapshot(s)).toBe(false);
  });

  it("validateBuild rejects the join when the turret move leaves its chain nowhere to go", () => {
    const b = withCarronade(extraSlotDeck());
    expect(removeTurret(b, 1).ok).toBe(true);
    const v = validateBuild(b, 10);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("route: route 1 does not end on a free turret connector (disconnected)");
    expect(v.errors).toContain("route: route 2 does not end on a free turret connector (disconnected)");
  });
});
