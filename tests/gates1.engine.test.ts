// GATES-1 (REQ-BFG-052; BRIEF-GATES1 G2; step 3): the converter engine (src/sim/convert.ts, called from battle.ts's hooks marked
// GATES-1) on fixtures:
// - a FUSER takes 2 slugs in, works exactly 1 s (60 ticks) and puts 1 out that deals both +50% (★2 +75%, ★3 +150%); it waits for
//   its partner with no timeout; a slug still in a buffer at the end of a battle is never fired;
// - a SCATTER MILL puts 3 pellets out (★2 at 60%, ★3 four at 50%), one at a time once AMMO_SPACING is free;
// - a SMELTER gives the slug +2 BURN (★2 +5, ★3 +8);
// - a STUN pauses a gate (the whole machine), and the gate is a Target with a factory's weight; the belt tile it stands on is
//   no belt target;
// - a belt that joins at a gate's tile feeds the gate's buffer;
// - rig arrows aimed at a gate's tile idle (a shaped rig loses only that one hit);
// - rigs before a FUSER count twice and rigs after it count once; it rides on as two (a KILN slug's growth);
// - the payload-key test: every key of Payload has a rule in the three tables, and the interface itself is read, so a field added
//   later (BUMP-1E's POISON, for one) fails here until it has a rule;
// - the invariants over whole battles (nothing inside a gate's tile, spacing kept, no slug lost or made).
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload, type RouteState, type SideState, type SimEvent, type Target } from "../src/sim/battle";
import { AMMO, AMMO_SPACING, CELL, DISRUPT_TIME, ITEMS, TICK } from "../src/sim/content";
import { hitsOfRig, key as K, rigHits, rotField, type Build, type Placed } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { FUSE_RULES, PELLET_RULES, SMELT_RULES, fusePayload, pelletPayload, smeltPayload } from "../src/sim/convert";
import { pct } from "../src/sim/pct";
import { GATES, setGates, withGates } from "../src/sim/gates";
import { stunnedParts } from "../src/game/counters";
import { barge, bench as lodestoneBench } from "./arsenal.bench";

afterEach(() => setGates(GATES));

const SEED = 4242;
const THREE_TICKS = 60; // 1 whole second
const slug = (id: number, o: Partial<Payload> = {}): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false, ...o });
const starF = (s: number) => (s > 1 ? { stars: s } : {});

/** The FURNACE bench: the KILN at (4,6), a straight 6-tile belt up column 4 into the turret (tile t is cell (4, 5 - t)); converters [def, tile, stars]. */
function bench(conv: [string, number, number?][] = [], extra: Placed[] = []): Build {
  return {
    hero: "furnace",
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...conv.map(([def, t, s], i) => ({ uid: 20 + i, def, x: 4, y: 5 - t, ...starF(s ?? 1) })), ...extra],
    routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
    mods: [], beltCap: 30, hullBonus: 5000,
  };
}

/** A battle of `b` against the barge with every factory frozen (the test feeds the belt itself). */
function world(b: Build, feedFactories = false) {
  const bt = new Battle(b, barge(), SEED);
  const s = bt.sides[0];
  if (!feedFactories) for (const f of s.factories) f.frozen = 1e9;
  return { bt, s, r: s.routes[0], c: s.converters?.[0] };
}

/** Put slug `p` on route `r` at `s` (front first order kept). */
function put(r: RouteState, p: Payload, s = 0, processed = -1): BeltAmmo {
  const a: BeltAmmo = { p, s, processed, blocked: false };
  let k = 0;
  while (k < r.ammo.length && r.ammo[k].s > s) k++;
  r.ammo.splice(k, 0, a);
  return a;
}

/** Step `n` ticks; returns every event, tagged with its tick (the battle's, from 1). */
function step(bt: Battle, n: number): { tick: number; e: SimEvent }[] {
  const out: { tick: number; e: SimEvent }[] = [];
  for (let i = 0; i < n && !bt.over; i++) {
    bt.step();
    for (const e of bt.drainEvents()) out.push({ tick: bt.ticks, e });
  }
  return out;
}
const converts = (ev: { tick: number; e: SimEvent }[]) => ev.filter((x) => x.e.type === "convert");

describe("GATES-1 G2: the FUSER", () => {
  it("takes 2 slugs in, works exactly 1 s (60 ticks), and puts 1 out at the tile's downstream edge that deals both + 50%", () => {
    withGates(() => {
      const { bt, s, r, c } = world(bench([["fuser", 2]]));
      const c0 = c!;
      expect([c0.inEdge, c0.outEdge, c0.tile, c0.route]).toEqual([2 * CELL, 3 * CELL, 2, 0]);
      expect(s.routes[0].conv).toEqual([c0]);
      put(r, slug(100, { flat: 10 }));
      let fullAt = -1, conv: { tick: number; e: SimEvent }[] = [];
      for (let i = 0; i < 400 && !conv.length; i++) {
        if (i === 20) put(r, slug(101, { flat: 6 })); // the partner, 10 px behind the first
        conv = converts(step(bt, 1));
        if (fullAt < 0 && c0.left > 0) fullAt = bt.ticks;
      }
      expect(conv.length).toBe(1);
      expect(conv[0].tick - fullAt).toBe(THREE_TICKS); // 1 whole second from the tick the buffer filled
      expect(conv[0].e).toMatchObject({ type: "convert", converter: 20, def: "fuser", route: 0, tile: 2, slugs: 1 });
      // the output is on the belt at the downstream edge (emitted the same tick), `processed` the gate's tile
      expect(r.ammo.length).toBe(1);
      const out = r.ammo[0];
      expect(out.s).toBeCloseTo(c0.outEdge, 6);
      expect(out.processed).toBe(2);
      expect(out.p.id).not.toBe(100);
      expect(out.p.id).not.toBe(101);
      // both slugs' DMG, + 50%: plain slugs 30 each: (30 + 10 + 30 + 6) x 1.5 = 114
      expect(out.p.mult).toBe(3);
      expect(out.p.flat).toBe(24); // (10 + 6) x 1.5
      expect(Math.max(10, Math.round((30 * out.p.mult) + out.p.flat))).toBe(114);
      expect(c0.buf).toEqual([]);
      expect(c0.done).toBe(1);
    });
  });

  it("★2 is +75% and ★3 +150% of both", () => {
    withGates(() => {
      for (const [stars, total] of [[1, 114], [2, 133], [3, 190]] as const) { // (76) x 1.5 / 1.75 / 2.5
        const { bt, r, c } = world(bench([["fuser", 2, stars]]));
        put(r, slug(100, { flat: 10 }));
        let conv: { tick: number; e: SimEvent }[] = [];
        for (let i = 0; i < 400 && !conv.length; i++) {
          if (i === 20) put(r, slug(101, { flat: 6 }));
          conv = converts(step(bt, 1));
        }
        expect(conv.length, `stars ${stars}`).toBe(1);
        const p = r.ammo[0].p;
        expect(Math.round(30 * p.mult + p.flat), `stars ${stars}`).toBe(total);
        expect(c!.spec.bonus).toBe([50, 75, 150][stars - 1]);
      }
    });
  });

  it("waits for its partner with no timeout; a late partner then fuses; a slug left in a buffer at the end is never fired", () => {
    withGates(() => {
      const { bt, r, c } = world(bench([["fuser", 2]]));
      put(r, slug(100));
      const ev = step(bt, 5 * 60); // five seconds alone
      expect(converts(ev)).toEqual([]);
      expect(c!.buf.map((p) => p.id)).toEqual([100]);
      expect(c!.left).toBe(0); // not working: it waits
      expect(r.ammo.length).toBe(0);
      put(r, slug(101));
      const later = step(bt, 400);
      expect(converts(later).length).toBe(1);
      // an odd one: a third slug waits in the buffer for a fourth that never comes; the battle ends with it inside
      put(r, slug(102));
      step(bt, 600);
      expect(c!.buf.map((p) => p.id)).toEqual([102]);
      expect(r.ammo.length + c!.out.length).toBeLessThanOrEqual(1); // only the fused one (still riding or waiting), never the lone 102
      expect(bt.sides[0].stats.shots).toBeLessThanOrEqual(1); // the lone slug was never loaded or fired
    });
  });

  it("queues slugs at its upstream edge while it works (they stop at the edge, never inside the tile), then takes the next pair", () => {
    withGates(() => {
      const { bt, s, r, c } = world(bench([["fuser", 2]]));
      let id = 100;
      let inside = false, maxQueue = 0;
      for (let i = 0; i < 20 * 60; i++) {
        if (i % 20 === 0 && !r.ammo.some((a) => a.s < AMMO_SPACING)) put(r, slug(id++)); // a slug every third of a second when the mouth has room (Battle.stamp's rule): faster than the gate works
        step(bt, 1);
        for (const a of r.ammo) if (a.s > c!.inEdge + 1e-6 && a.s < c!.outEdge - 1e-6) inside = true;
        maxQueue = Math.max(maxQueue, r.ammo.filter((a) => a.s <= c!.inEdge + 1e-6).length);
      }
      expect(inside).toBe(false);
      expect(maxQueue).toBeGreaterThan(2); // a queue formed before it (it passes at most 2 slugs a second)
      expect(c!.done).toBeGreaterThanOrEqual(10);
      expect(c!.disrupted).toBe(0); // nothing stunned it (s.stats.disrupted counts the frozen KILN here, which is the test's own hold)
      expect(s.routes[0].conv).toEqual([c]);
    });
  });
});

describe("GATES-1 G2: the SCATTER MILL", () => {
  it("1 slug in, 3 pellets out at half its DMG each (SPLITTER's copy rule), one at a time as AMMO_SPACING frees", () => {
    withGates(() => {
      const { bt, r, c } = world(bench([["scattermill", 2]]));
      put(r, slug(100, { flat: 10, burn: 2, plate: 8, shock: true, prior: 1 }));
      const seen = new Map<number, { tick: number; s: number; p: Payload }>();
      for (let i = 0; i < 400; i++) {
        step(bt, 1);
        for (const a of r.ammo) if (a.p.copy && !seen.has(a.p.id)) seen.set(a.p.id, { tick: bt.ticks, s: a.s, p: a.p });
        if (seen.size === 3) break;
      }
      expect(seen.size).toBe(3);
      const list = [...seen.values()];
      expect(new Set(list.map((x) => x.p.id)).size).toBe(3);
      expect(list.every((x) => x.p.id !== 100)).toBe(true);
      for (const x of list) {
        expect(x.s).toBeCloseTo(c!.outEdge, 6); // each is put on at the downstream edge
        expect(x.p.mult).toBe(0.5);
        expect(x.p.flat).toBe(5); // pct(10, 50)
        expect(x.p.plate).toBe(4); // plate takes the share too
        expect(x.p.burn).toBe(2); // every other field copies whole
        expect(x.p.shock).toBe(true);
        expect(x.p.prior).toBe(1);
        expect(x.p.copy).toBe(true);
      }
      // one at a time: the next only once the one before has moved AMMO_SPACING on (14 ticks at 30 px/s, 0.5 px a tick)
      expect(list[1].tick - list[0].tick).toBe(14);
      expect(list[2].tick - list[1].tick).toBe(14);
      expect(AMMO_SPACING).toBe(7);
    });
  });

  it("converts every second while the pellets of the one before are still leaving (its cycle is 1 s, not 1.5 s)", () => {
    withGates(() => {
      for (const [stars, pellets] of [[1, 3], [3, 4]] as const) {
        const { bt, r, c } = world(bench([["scattermill", 2, stars]]));
        put(r, slug(100, { flat: 10 }), 2 * AMMO_SPACING); // three slugs, AMMO_SPACING apart: the 2nd and 3rd wait at the upstream edge
        put(r, slug(101, { flat: 10 }), AMMO_SPACING);
        put(r, slug(102, { flat: 10 }), 0);
        const at: number[] = [];
        let maxOut = 0;
        for (let i = 0; i < 400 && at.length < 3; i++) {
          const ev = step(bt, 1);
          maxOut = Math.max(maxOut, c!.out.length);
          if (converts(ev).length) at.push(bt.ticks);
        }
        expect(at.length, `stars ${stars}`).toBe(3);
        // the second and third conversions follow the one before by exactly 60 ticks (the old rule waited for the last pellet: +28 or +42)
        expect(at[1] - at[0], `stars ${stars}`).toBe(THREE_TICKS);
        expect(at[2] - at[1], `stars ${stars}`).toBe(THREE_TICKS);
        // and the waiting outputs stay bounded: at most out - 1 left over plus one conversion's worth
        expect(maxOut, `stars ${stars}`).toBeLessThanOrEqual(2 * pellets - 1);
      }
    });
  });

  it("★2: 3 pellets at 60%; ★3: 4 pellets at 50%", () => {
    withGates(() => {
      for (const [stars, n, share] of [[2, 3, 0.6], [3, 4, 0.5]] as const) {
        const { bt, r } = world(bench([["scattermill", 2, stars]]));
        put(r, slug(100, { flat: 10 }));
        const seen = new Map<number, Payload>();
        for (let i = 0; i < 600 && seen.size < n; i++) {
          step(bt, 1);
          for (const a of r.ammo) if (a.p.copy && !seen.has(a.p.id)) seen.set(a.p.id, a.p);
        }
        expect(seen.size, `stars ${stars}`).toBe(n);
        for (const p of seen.values()) {
          expect(p.mult, `stars ${stars}`).toBeCloseTo(share, 9);
          expect(p.flat, `stars ${stars}`).toBe(stars === 2 ? 6 : 5);
        }
      }
    });
  });
});

describe("GATES-1 G2: the SMELTER", () => {
  it("the slug gains +2 BURN (★2 +5, ★3 +8) after 1 s, and is the same slug", () => {
    withGates(() => {
      for (const [stars, burn] of [[1, 2], [2, 5], [3, 8]] as const) {
        const { bt, r, c } = world(bench([["smelter", 2, stars]]));
        put(r, slug(100, { burn: 1 }));
        let conv: { tick: number; e: SimEvent }[] = [];
        let fullAt = -1;
        for (let i = 0; i < 400 && !conv.length; i++) {
          conv = converts(step(bt, 1));
          if (fullAt < 0 && c!.left > 0) fullAt = bt.ticks;
        }
        expect(conv.length, `stars ${stars}`).toBe(1);
        expect(conv[0].tick - fullAt).toBe(THREE_TICKS);
        expect(r.ammo.length).toBe(1);
        expect(r.ammo[0].p.id).toBe(100);
        expect(r.ammo[0].p.burn).toBe(1 + burn);
        expect(r.ammo[0].p.mult).toBe(1);
      }
    });
  });
});

describe("GATES-1 G2: STUN, targets and idle arrows", () => {
  const disrupt = (bt: Battle, s: SideState, t: Target, secs = 2, cause = "shock"): boolean =>
    (bt as unknown as { disrupt(s: SideState, t: Target, secs: number, cause: string): boolean }).disrupt(s, t, secs, cause);

  it("a gate is a Target with a factory's weight (3); its tile is no belt target", () => {
    withGates(() => {
      const { s } = world(bench([["fuser", 2]]));
      const conv = s.targets.filter((t) => t.kind === "converter");
      expect(conv).toEqual([{ kind: "converter", ref: 20, cell: -1, x: 4 * CELL + CELL / 2, y: 3 * CELL + CELL / 2, weight: 3 }]);
      const belts = s.targets.filter((t) => t.kind === "belt").map((t) => t.cell);
      expect(belts).toEqual([0, 1, 3, 4, 5]); // tile 2 is the gate's
      expect(s.targets.find((t) => t.kind === "factory")!.weight).toBe(3);
    });
    const { s } = world(bench());
    expect(s.targets.some((t) => t.kind === "converter")).toBe(false);
    expect(s.converters).toBeUndefined();
  });

  it("a STUN pauses the gate's timer (and its intake and output): the conversion comes late by the ticks it stood still", () => {
    withGates(() => {
      const run = (stun: boolean) => {
        const { bt, s, r, c } = world(bench([["smelter", 2]]));
        put(r, slug(100));
        let when = -1, left0 = -1;
        for (let i = 0; i < 1200 && when < 0; i++) {
          if (stun && c!.left === 30 && left0 < 0) { // 30 ticks into the work: STUN it for 2 s
            left0 = c!.left;
            expect(disrupt(bt, s, s.targets.find((t) => t.kind === "converter")!, 2)).toBe(true);
          }
          const ev = step(bt, 1);
          if (stun && left0 >= 0 && c!.disrupted > 0) expect(c!.left, "paused").toBe(left0);
          if (converts(ev).length) when = bt.ticks;
        }
        return when;
      };
      const free = run(false);
      const stunned = run(true);
      expect(free).toBeGreaterThan(0);
      expect(stunned - free).toBe(119); // a 2 s STUN stalls a machine for 119 ticks on this battle's tick count (a factory's too)
    });
  });

  it("a stunned gate takes in nothing and puts nothing out; a slug waits at its edge", () => {
    withGates(() => {
      const { bt, s, r, c } = world(bench([["smelter", 2]]));
      expect(disrupt(bt, s, s.targets.find((t) => t.kind === "converter")!, 2)).toBe(true);
      put(r, slug(100));
      step(bt, 90); // the slug reaches the edge (48 ticks) while the gate is stunned (119 ticks)
      expect(c!.buf).toEqual([]);
      expect(r.ammo.length).toBe(1);
      expect(r.ammo[0].s).toBeCloseTo(c!.inEdge, 6);
      expect(r.ammo[0].blocked).toBe(true);
      step(bt, 60); // the STUN ends
      expect(c!.disrupted).toBe(0);
      expect(c!.done + c!.buf.length + c!.out.length).toBeGreaterThan(0);
    });
  });

  it("a stunned gate is a stalled part: LODESTONE counts it and the STUN counter does (review finding 3)", () => {
    withGates(() => {
      // an attacker with a LODESTONE working belt tile (4,3) (arsenal.bench's bench) against a foe with a FUSER on its belt
      const bt = new Battle(lodestoneBench([["lodestone", 4, 3, 1]]), bench([["fuser", 2]]), 7);
      const s = bt.sides[0], foe = bt.sides[1];
      const a: BeltAmmo = { p: slug(91, { ride: 3 }), s: 30, processed: 2, blocked: false };
      s.gates[0].online = true;
      s.factories[0].timer = 1000;
      const hit = s.routes[0].gateAt[2][0];
      // nothing stalled: +0
      (bt as unknown as { applyHit(s: SideState, a: BeltAmmo, h: unknown): void }).applyHit(s, a, hit);
      expect(a.p.flat + (a.p.each ?? 0)).toBe(0); // BUMP-1F: was `a.p.flat` (with SCALE_RIGS on, BUMP-1E, a count-driven add rides `each`)
      expect(stunnedParts(foe)).toBe(0);
      // the foe's gate STUNned: one stalled part, +each (★1 LODESTONE: 10)
      expect(disrupt(bt, foe, foe.targets.find((t) => t.kind === "converter")!, 2)).toBe(true);
      expect(foe.converters![0].disrupted).toBeGreaterThan(0);
      expect(stunnedParts(foe)).toBe(1);
      const b: BeltAmmo = { p: slug(92, { ride: 3 }), s: 30, processed: 2, blocked: false };
      (bt as unknown as { applyHit(s: SideState, a: BeltAmmo, h: unknown): void }).applyHit(s, b, hit);
      // BUMP-1F: was `b.p.flat` (GATES-1's world). With SCALE_RIGS on (BUMP-1E, SCALE-2a F3) a FOR EACH add rides `each`, apart from the
      // stat rows' `flat`: the same 10 DMG, in the other accumulator. Both are read, so the test holds in either world
      expect(b.p.flat + (b.p.each ?? 0)).toBe(ITEMS.lodestone.gate!.perStalled!.each);
    });
  });

  it("arrows aimed at a gate's tile idle: a rig that works only that tile is IDLE; a shaped rig loses only that one hit", () => {
    withGates(() => {
      // WHETSTONE at (3,3) faces east: its one arrow lands on the gate's tile (4,3)
      const east = rotField("whetstone", rotFacing("whetstone", 1));
      const b = bench([["fuser", 2]], [{ uid: 30, def: "whetstone", x: 3, y: 3, ...east }]);
      expect(hitsOfRig(b, 30)).toEqual([]);
      const { bt, s } = world(b);
      expect(s.gates.find((g) => g.uid === 30)!.hits).toEqual([]);
      step(bt, 6 * 60);
      expect(s.gates.find((g) => g.uid === 30)!.online).toBe(false); // an IDLE rig never comes online
      // the same rig with the gate one tile along works (4,3)
      const c = bench([["fuser", 3]], [{ uid: 30, def: "whetstone", x: 3, y: 3, ...east }]);
      expect(hitsOfRig(c, 30).map((h) => h.cell)).toEqual([K(4, 3)]);
      // a LONG HAUL (rare, left and right arrows) at (5,3) between two belts: the west arrow lands on the gate, the east on route 1
      const two = bench([["fuser", 2]], [{ uid: 7, def: "press", x: 6, y: 6 }, { uid: 31, def: "longhaul", x: 5, y: 3 }]);
      two.routes.push({ factory: 7, cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(6, 0)] });
      expect(hitsOfRig(two, 31).map((h) => [h.route, h.tile, h.cell])).toEqual([[1, 2, K(6, 3)]]); // one hit, not two
      const noGate = JSON.parse(JSON.stringify(two)) as Build;
      noGate.items = noGate.items.filter((p) => p.uid !== 20);
      expect(hitsOfRig(noGate, 31).length).toBe(2);
      expect(rigHits(two)[0][2]).toEqual([]); // no hit on the gate's tile
    });
  });

  it("a belt that joins at a gate's tile feeds the gate's buffer (and a FUSER fuses one slug of each belt)", () => {
    withGates(() => {
      const b = bench([["fuser", 2]], [{ uid: 7, def: "press", x: 6, y: 6 }]);
      b.routes.push({ factory: 7, cells: [K(6, 5), K(6, 4), K(6, 3), K(5, 3)], join: K(4, 3) }); // ends beside the gate's tile
      const { bt, s, c } = world(b);
      const main = s.routes[0], joiner = s.routes[1];
      expect(joiner.join).toMatchObject({ route: 0, tile: 2, enter: 2 * CELL });
      put(joiner, slug(200, { flat: 4 }), joiner.L, 3);
      step(bt, 3);
      expect(joiner.ammo.length).toBe(0); // it went to the main belt at the gate's upstream edge...
      expect(c!.buf.map((p) => p.id)).toEqual([200]); // ...and into the buffer
      expect(main.ammo.length).toBe(0);
      put(main, slug(100, { flat: 6 }));
      let done = 0;
      for (let i = 0; i < 400 && !done; i++) done = converts(step(bt, 1)).length;
      expect(done).toBe(1);
      expect(main.ammo[0].p.flat).toBe(15); // (4 + 6) x 1.5
      expect(main.ammo[0].p.mult).toBe(3);
    });
  });
});

describe("GATES-1 G2: rigs before a FUSER count twice, rigs after it count once; it rides on as two", () => {
  it("a WHETSTONE before the FUSER hits both slugs (its flat is in the fused one, x1.5); one after hits the fused slug once", () => {
    withGates(() => {
      const w = ITEMS.whetstone.gate!.flat!;
      const east = rotField("whetstone", rotFacing("whetstone", 1));
      const b = bench([["fuser", 2]], [{ uid: 30, def: "whetstone", x: 3, y: 4, ...east }, { uid: 31, def: "whetstone", x: 3, y: 1, ...east }]);
      const { bt, r, c } = world(b);
      step(bt, 3 * 60); // both rigs online (1.2 s and 1.8 s)
      expect(bt.sides[0].gates.every((g) => g.online)).toBe(true);
      put(r, slug(100));
      for (let i = 0; i < 20; i++) step(bt, 1);
      put(r, slug(101));
      let out: Payload | null = null;
      for (let i = 0; i < 800 && !out; i++) {
        step(bt, 1);
        if (c!.out.length) out = c!.out[0];
        else if (c!.done && r.ammo.length) out = r.ammo[0].p;
      }
      expect(out).not.toBeNull();
      expect(out!.flat).toBe(Math.floor((2 * w * 150) / 100 + 0.5)); // before the gate: both slugs' hits, x1.5 = 3w
      for (let i = 0; i < 400; i++) step(bt, 1); // it rides on past the second WHETSTONE (tile 4)
      expect(out!.flat).toBe(3 * w + w); // after the gate: the one hit, once
      expect(out!.prior).toBe(2); // two rigs visited (max of the two slugs' counts, not the sum)
    });
  });

  it("fusePayload (pure): a KILN slug's growth counts twice on the fused one, x the bonus; rides on past the fusion", () => {
    const a = slug(1, { ammo: "cinder", ride: 1 }), b = slug(2, { ammo: "cinder", ride: 1 });
    const f = fusePayload(a, b, { bonus: 50 }, 3);
    const dmg = (p: Payload) => Math.round((AMMO.cinder.base + AMMO.cinder.rideScale * p.ride) * p.mult + p.flat);
    expect(dmg(f)).toBe(Math.round(1.5 * 2 * (40 + 13)));
    const later = { ...f, ride: f.ride + 2 };
    expect(dmg(later)).toBe(Math.round(1.5 * 2 * (40 + 13 * 3))); // two slugs' ride, +50%
    expect(f.id).toBe(3);
    // two slugs of different ride: b's ride so far goes into the flat; the sum is exactly what the two dealt (before the bonus)
    const c = slug(4, { ammo: "cinder", ride: 3, mult: 0.5, flat: 7 }), d = slug(5, { ammo: "cinder", ride: 1, flat: 2 });
    const g = fusePayload(c, d, { bonus: 0 }, 6);
    expect(dmg(g)).toBe(Math.round((40 + 13 * 3) * 0.5 + 7 + (40 + 13 * 1) + 2));
    // ammo with a different ride rule: the second's damage so far is frozen into the flat, and does not ride on
    const t = slug(7, { ammo: "thread", flat: 5 }), k = slug(8, { ammo: "cinder", ride: 2, heat: 3, heatBonus: 9 });
    const h = fusePayload(t, k, { bonus: 100 }, 9);
    expect(h.mult).toBe(2); // a's mult x2, not both
    expect(h.flat).toBe((5 + Math.max(10, Math.round(40 + 13 * 2 + 9))) * 2);
    expect(h.heat).toBeUndefined(); // b's HEAT does not ride on
    expect(h.heatBonus).toBeUndefined();
  });

  it("fusePayload: numbers add, flags OR, a new id; a stall adds when both shock; SPLITTER's flat share and plate are respected", () => {
    const a = slug(1, { burn: 2, shock: true, shockTime: 1, prior: 3, copy: false, plate: 4, fray: 1, frayCap: 2, burnPlus: 1, jump: 1, journeyOffset: 2 });
    const b = slug(2, { burn: 3, shock: true, prior: 1, copy: true, plate: 5, fray: 2, frayCap: 4, burnPlus: 2, jump: 3, paired: true, journeyOffset: 5 });
    const f = fusePayload(a, b, { bonus: 100 }, 9);
    expect(f).toMatchObject({ id: 9, burn: 5, shock: true, shockTime: 1 + DISRUPT_TIME, prior: 3, copy: true, plate: 9, fray: 3, frayCap: 4, burnPlus: 3, jump: 3, paired: true, journeyOffset: 5 });
    expect(f.mult).toBe(4); // (1 + 1) x 2
    // one slug shocks, the other doesn't: its own time stands
    expect(fusePayload(slug(1), slug(2, { shock: true, shockTime: 3 }), { bonus: 50 }, 3)).toMatchObject({ shock: true, shockTime: 3 });
    expect(fusePayload(slug(1, { shock: true, shockTime: 3 }), slug(2), { bonus: 50 }, 3)).toMatchObject({ shock: true, shockTime: 3 });
  });
});

describe("GATES-1 G2: the payload rules are tables over every key of Payload", () => {
  /** The keys of `export interface Payload { ... }` read from battle.ts itself. */
  function payloadKeys(): string[] {
    const src = readFileSync(decodeURIComponent(new URL("../src/sim/battle.ts", import.meta.url).pathname), "utf8");
    const at = src.indexOf("export interface Payload {");
    expect(at).toBeGreaterThan(0);
    const end = src.indexOf("\n}\n", at);
    const keys: string[] = [];
    for (const line of src.slice(at, end).split("\n").slice(1)) {
      const m = /^ {2}([A-Za-z0-9_]+)\??:/.exec(line);
      if (m) keys.push(m[1]);
    }
    return keys;
  }

  it("FUSE_RULES, PELLET_RULES and SMELT_RULES have a rule for exactly the keys of Payload (a new field fails here until it has one)", () => {
    const keys = payloadKeys().sort();
    expect(keys.length).toBeGreaterThanOrEqual(33);
    expect(Object.keys(FUSE_RULES).sort()).toEqual(keys);
    expect(Object.keys(PELLET_RULES).sort()).toEqual(keys);
    expect(Object.keys(SMELT_RULES).sort()).toEqual(keys);
  });

  /** A payload with every field set (typed Required<Payload>: a new field is a compile error here too). */
  const full = (id: number, n: number): Required<Payload> => ({
    id, ammo: "plain", ride: 0, mult: 1, flat: 10 * n, burn: n, shock: true, prior: n, factory: 1, copy: n === 2,
    shockTime: n, jump: n, base: 30, preset: "ember", debuffs: { sap: true }, harass: { kind: "drag", seconds: n }, static: true, arc: n,
    rip: { count: n, reach: n }, heat: n, heatRide: n, heatBonus: n, pulseSeen: { [n]: n }, compound: slug(900 + n), burnPlus: n, fray: n,
    frayCap: n, staticTime: n, boosters: [n], journeyOffset: n, paired: n === 2, lone: n === 2, plate: 4 * n,
    // BUMP-1F (PACKET-BUMP-0130 section 5): BUMP-1E's POISON and SCALE-2a's FOR EACH DMG now have their rules (convert.ts)
    poison: n, each: 10 * n,
  });

  it("FUSE_RULES drive fusePayload: add, max, or, first, merge, new, on a Payload with every field set", () => {
    const a = full(1, 1), b = full(2, 2);
    const f = fusePayload(a, b, { bonus: 0 }, 77) as Required<Payload>;
    const A = a as unknown as Record<string, unknown>, B = b as unknown as Record<string, unknown>, F = f as unknown as Record<string, unknown>;
    for (const k of Object.keys(FUSE_RULES) as (keyof Payload)[]) {
      switch (FUSE_RULES[k]) {
        case "new": expect(F[k], k).toBe(77); break;
        case "first": expect(F[k], k).toEqual(A[k]); break;
        case "add": expect(F[k], k).toBe((A[k] as number) + (B[k] as number)); break;
        case "max": expect(F[k], k).toBe(Math.max(A[k] as number, B[k] as number)); break;
        case "or": expect(F[k], k).toBe(true); break;
        case "stall": expect(F[k], k).toBe((A[k] as number) + (B[k] as number)); break; // both shock / are static
        case "merge": expect(F[k], k).toBeDefined(); break;
        case "ride": break; // mult, flat, base, ride: the ride rule, tested above
      }
    }
    expect(f.debuffs).toEqual({ sap: true });
    expect(f.pulseSeen).toEqual({ 1: 1, 2: 2 });
    expect(f.boosters).toEqual([1, 2]);
    expect(f.rip).toEqual({ count: 3, reach: 2 });
    // ride: a's base and ride; mult both; flat = a's + b's (equal bases, ride 0)
    expect([f.base, f.ride, f.mult, f.flat]).toEqual([30, 0, 2, 30]);
  });

  it("PELLET_RULES drive pelletPayload: share, flag, new, copy whole (records cloned)", () => {
    const p = full(1, 1);
    let next = 500;
    const pellets = pelletPayload(p, { out: 3, share: 60 }, () => next++);
    expect(pellets.length).toBe(3);
    expect(pellets.map((q) => q.id)).toEqual([500, 501, 502]);
    const P = p as unknown as Record<string, unknown>;
    for (const q of pellets) {
      const Q = q as unknown as Record<string, unknown>;
      for (const k of Object.keys(PELLET_RULES) as (keyof Payload)[]) {
        switch (PELLET_RULES[k]) {
          case "new": break;
          case "flag": expect(Q[k], k).toBe(true); break;
          // mult takes the share exactly; flat and plate are whole damage, rounded half up once (SPLITTER's rule: pct)
          case "share": if (k === "mult") expect(Q[k], k).toBeCloseTo(((P[k] as number) * 60) / 100, 9); else expect(Q[k], k).toBe(pct(P[k] as number, 60)); break;
          case "copy": expect(Q[k], k).toEqual(P[k]); break;
        }
      }
      expect(q.debuffs).not.toBe(p.debuffs); // records are cloned
      expect(q.pulseSeen).not.toBe(p.pulseSeen);
      expect(q.boosters).not.toBe(p.boosters);
      expect(q.rip).not.toBe(p.rip);
    }
  });

  it("SMELT_RULES drive smeltPayload: burn is the one field that changes", () => {
    const p = full(1, 1), before = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
    const q = smeltPayload(p, { burn: 5 }) as unknown as Record<string, unknown>;
    for (const k of Object.keys(SMELT_RULES) as (keyof Payload)[]) {
      if (SMELT_RULES[k] === "burn") expect(q[k], k).toBe((before[k] as number) + 5);
      else expect(q[k], k).toEqual(before[k]);
    }
  });
});

describe("GATES-1 G2: invariants over whole battles with the KILN feeding", () => {
  for (const [def, stars] of [["fuser", 1], ["scattermill", 1], ["scattermill", 3], ["smelter", 2]] as const) {
    it(`${def} ★${stars}, 20 s: nothing inside the tile, spacing kept, no slug lost or made`, () => {
      withGates(() => {
        const { bt, s, r, c } = world(bench([[def, 2, stars]]), true);
        let inside = false, tight = false, loads = 0, produced = 0;
        for (let i = 0; i < 20 * 60 && !bt.over; i++) {
          bt.step();
          for (const e of bt.drainEvents()) {
            if (e.type === "load" && e.side === 0) loads++;
            if (e.type === "produce" && e.side === 0) produced++;
          }
          for (let k = 0; k < r.ammo.length; k++) {
            const a = r.ammo[k];
            if (a.s > c!.inEdge + 1e-6 && a.s < c!.outEdge - 1e-6) inside = true;
            if (k > 0 && r.ammo[k - 1].s - a.s < AMMO_SPACING - 1e-6) tight = true;
          }
        }
        expect(inside, "a slug inside the tile").toBe(false);
        expect(tight, "two slugs closer than AMMO_SPACING").toBe(false);
        expect(c!.done, "it worked").toBeGreaterThan(0);
        expect(produced).toBe(s.stats.produced);
        // slugs: made = on the belt + in the buffer + waiting to go out + loaded into the gun; a conversion changes the count
        // (FUSER 2 -> 1, SCATTER MILL 1 -> 3 / 4)
        const delta = def === "fuser" ? -c!.done : def === "scattermill" ? c!.done * (c!.spec.out - 1) : 0;
        expect(produced + delta).toBe(r.ammo.length + c!.buf.length + c!.out.length + loads);
        expect(c!.out.length, "the waiting outputs stay bounded").toBeLessThanOrEqual(2 * c!.spec.out - 1);
      });
    });
  }

  it("GATES off: a battle has no converters at all (every older deck fights exactly as before)", () => {
    const { s, r } = world(bench());
    expect(s.converters).toBeUndefined();
    expect(r.conv).toBeUndefined();
    expect(TICK).toBeCloseTo(1 / 60, 12);
  });
});
