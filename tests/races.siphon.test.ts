import { describe, expect, it } from "vitest";
import { Battle, type Payload, type SideState, type Target } from "../src/sim/battle";
import { AMMO, type AmmoKind } from "../src/sim/content";
import { key as K, routeInfo, type Build } from "../src/sim/deck";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { raceBeltSpeed } from "../src/sim/races";
import {
  DRAG_MULT, DRAG_TIME, ECHO_CAP, addedFlat, applyDrag, dragSpans, echoOf, echoOnLoad, isDragged, newEchoState, segments,
} from "../src/sim/races/siphon";
import { effectAt } from "../src/sim/stars";
import { roundHalfUp } from "../src/sim/pct";
import { dummyFoe, expectSaneBattles } from "./races.helpers";

const siphon = () => heroStartBuild("siphon", 1);
/** A Siphon whose belts stop short of its guns: it never fires, so only the test drags. */
const silentSiphon = (): Build => {
  const b = siphon();
  for (const r of b.routes) r.cells.pop();
  return b;
};
const pl = (ammo: AmmoKind, o: Partial<Payload> = {}): Payload => ({
  id: 1, ammo, ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false, ...o,
});

/** Step until `secs`, calling `each` after every tick; events are cleared each tick. */
function run(b: Battle, secs: number, each?: (b: Battle) => void): void {
  while (!b.over && b.t < secs) {
    b.step();
    each?.(b);
    b.events.length = 0;
  }
}

/** Furnace deck with rigs beside its straight route (0.6.2 BELTSIDE): a TEMPER works tile 2 and a WHETSTONE
 *  tile 4, from the west. Each worked tile opens a segment: cells 0-1 | 2-3 | 4-5. */
function gatedFurnace(): Build {
  const b = heroStartBuild("furnace", 1);
  b.items.push({ uid: 20, def: "temper", x: 3, y: 3, rot: 1 }, { uid: 21, def: "whetstone", x: 3, y: 1, rot: 1 });
  return b;
}

const target = (s: SideState, kind: Target["kind"], ref: number, cell = -1): Target =>
  s.targets.find((t) => t.kind === kind && t.ref === ref && (cell < 0 || t.cell === cell)) ??
  { kind, ref, cell, x: 60, y: 60, weight: 1 };

describe("SIPHON Sump", () => {
  it("feeds its routes round robin and marks each leech by destination: left DRAG, right ECHO", () => {
    const b = new Battle(siphon(), dummyFoe(), 1);
    const kinds = [new Map<number, AmmoKind>(), new Map<number, AmmoKind>()];
    run(b, 12, (bt) => bt.sides[0].routes.forEach((r, i) => r.ammo.forEach((a) => kinds[i].set(a.p.id, a.p.ammo))));
    expect(b.sides[0].routes.map((r) => r.turret)).toEqual([0, 1]);
    expect(new Set(kinds[0].values())).toEqual(new Set(["leechDrag"]));
    expect(new Set(kinds[1].values())).toEqual(new Set(["leechEcho"]));
    expect(Math.abs(kinds[0].size - kinds[1].size)).toBeLessThanOrEqual(1);
    expect(kinds[0].size).toBeGreaterThan(5);
  });

  it("a route that reaches no gun carries DRAG", () => {
    const d = siphon();
    d.routes[1].cells.pop(); // stops short of connector 7
    expect(routeInfo(d, 1).connected).toBe(false);
    const b = new Battle(d, dummyFoe(), 1);
    const seen = new Set<AmmoKind>();
    run(b, 8, (bt) => bt.sides[0].routes[1].ammo.forEach((a) => seen.add(a.p.ammo)));
    expect([...seen]).toEqual(["leechDrag"]);
  });
});

describe("SIPHON Drag", () => {
  it("segments run between machinery nodes; each hit kind drags the segment the rules name", () => {
    const b = new Battle(gatedFurnace(), siphon(), 1);
    const s = b.sides[0];
    const r = s.routes[0];
    expect(segments(r)).toEqual([[0, 1], [2, 3], [4, 5]]);
    const spans = (t: Target) => dragSpans(s, t).map((x) => [x.route, ...x.span]);
    expect(spans(target(s, "belt", 0, 0))).toEqual([[0, 0, 1]]); // the struck segment
    expect(spans(target(s, "belt", 0, 3))).toEqual([[0, 2, 3]]);
    expect(spans(target(s, "gate", 20))).toEqual([[0, 2, 3]]); // downstream of the Temper, from the tile it works
    expect(spans(target(s, "gate", 21))).toEqual([[0, 4, 5]]); // downstream of the Whetstone
    expect(spans(target(s, "factory", 1))).toEqual([[0, 0, 1]]); // first segment of each route
    expect(spans(target(s, "turret", 0))).toEqual([[0, 4, 5]]); // last segment of each feeding route
    expect(spans({ kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 })).toEqual([]); // damage only
  });

  it("a dragged segment runs at x0.25 for 3.0 s; a re-hit refreshes the timer and never stacks", () => {
    const b = new Battle(heroStartBuild("furnace", 1), silentSiphon(), 1);
    const s = b.sides[0];
    run(b, 2);
    const t0 = b.t;
    applyDrag(b, s, s.race!.drag, target(s, "belt", 0, 2));
    expect(isDragged(s.race!.drag, b.t, 0, 2)).toBe(true);
    expect(raceBeltSpeed(b, s, 0, 2, 1)).toBe(DRAG_MULT);
    run(b, t0 + 2);
    applyDrag(b, s, s.race!.drag, target(s, "belt", 0, 2)); // refresh at t0 + 2
    expect(raceBeltSpeed(b, s, 0, 2, 1)).toBe(DRAG_MULT); // x0.25, not x0.0625
    expect(s.race!.drag.until[0][2]).toBeCloseTo(b.t + DRAG_TIME, 9);
    run(b, t0 + 2 + DRAG_TIME - 0.05);
    expect(isDragged(s.race!.drag, b.t, 0, 2)).toBe(true);
    run(b, t0 + 2 + DRAG_TIME + 0.05);
    expect(isDragged(s.race!.drag, b.t, 0, 2)).toBe(false);
    expect(raceBeltSpeed(b, s, 0, 2, 1)).toBe(1);
  });

  it("dragged payloads crawl at x0.25 and gain no ride time", () => {
    const b = new Battle(heroStartBuild("furnace", 1), silentSiphon(), 1);
    const s = b.sides[0];
    const r = s.routes[0];
    run(b, 3);
    let checked = 0;
    for (let tick = 0; tick < 180; tick++) {
      applyDrag(b, s, s.race!.drag, target(s, "belt", 0, 0)); // hold the whole belt dragged
      const before = new Map(r.ammo.map((a) => [a.p.id, [a.s, a.p.ride]]));
      b.step();
      b.events.length = 0;
      for (const a of r.ammo) {
        const was = before.get(a.p.id);
        if (!was || a.blocked) continue;
        expect(a.s - was[0]).toBeCloseTo((30 * DRAG_MULT) / 60, 9);
        expect(a.p.ride).toBe(was[1]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("never cooks Furnace cinder slugs hotter: every shot <= the undragged 71, some cooler", () => {
    // NUM-1: x10 (was 4 + 1.2 x 2.6 = 7.12); a shot is whole, rounded half up once: 40 + 12 x 2.6 = 71.2 -> 71
    const hottest = roundHalfUp(AMMO.cinder.base + AMMO.cinder.rideScale * (0.4 * 6 + 0.2));
    let cooler = 0, n = 0, hits = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const b = new Battle(heroStartBuild("furnace", 1), siphon(), seed * 31);
      const seen = new Set<number>();
      run(b, 60, (bt) => {
        for (const pr of bt.projectiles) {
          if (pr.from !== 0 || seen.has(pr.id)) continue;
          seen.add(pr.id);
          expect(pr.dmg).toBeLessThanOrEqual(hottest); // NUM-1: whole numbers, so no float margins
          if (pr.dmg < hottest) cooler++;
          n++;
        }
      });
      hits += b.sides[0].race!.drag.hits;
    }
    expect(hits).toBeGreaterThan(10);
    expect(n).toBeGreaterThan(50);
    expect(cooler).toBeGreaterThan(0);
  });

  it("Metronome belts are immune", () => {
    const b = new Battle(heroRefBuild("metronome", 10), heroRefBuild("siphon", 10), 5);
    run(b, 60);
    expect(b.sides[0].race!.drag.hits).toBe(0);
  });
});

describe("SIPHON Echo", () => {
  it("remembers the added effects of a payload, capped: flat +30, Burn 2, Shock, Fray 1", () => {
    // NUM-1: flat x10 (the cap 3 -> 30; the payloads' flats 10 -> 100, 2 -> 20); Burn counts stacks (unchanged)
    expect(echoOf(pl("thread", { flat: 100, burn: 7, shock: true }), false)).toEqual({ flat: 30, burn: 2, shock: true, fray: 1 });
    expect(echoOf(pl("cinder", { flat: 20, burn: 2, ride: 5 }), false)).toEqual({ flat: 20, burn: 2, shock: false, fray: 0 });
    expect(echoOf(pl("plain"), true).fray).toBe(ECHO_CAP.fray); // an echoed Fray echoes again
    // a plain fusion (FUSE_MULT 1.15) is base damage, not processing. NUM-1: 115% of two 35 blanks, rounded half up
    // once: 80.5 -> 81 (was 1.15 x 7)
    expect(addedFlat(pl("alloy", { flat: 81 }))).toBe(0);
    // two Whetstones (+20 each, was +2): 115% of (55 + 55) = 126.5 -> 127, less the plain 81 = 46 (was 12.65 -> 1.15 x (2 + 2) = 4.6)
    expect(addedFlat(pl("alloy", { flat: 127 }))).toBe(46);
  });

  it("an ECHO leech copies the memory at load (flat x its split mult); the memory is not consumed", () => {
    const st = newEchoState();
    const plain = pl("leechEcho");
    echoOnLoad(st, plain);
    expect(plain).toEqual(pl("leechEcho")); // empty memory: a plain leech
    st.mem = { flat: 60, burn: 4, shock: true, fray: 1 }; // NUM-1: flat x10 (was 6); Burn counts stacks
    const a = pl("leechEcho", { mult: 0.6, flat: 12 }); // NUM-1: x10 (was 1.2)
    const c = pl("leechEcho");
    const d = pl("leechDrag");
    echoOnLoad(st, a);
    echoOnLoad(st, c);
    echoOnLoad(st, d);
    expect(a.flat).toBe(12 + roundHalfUp(60 * 0.6)); // NUM-1: 12 + 36 = 48, the share rounded half up once (was 1.2 + 6 x 0.6 = 4.8)
    expect([a.burn, a.shock, st.fray.has(a)]).toEqual([4, true, true]);
    expect([c.flat, c.burn, c.shock]).toEqual([60, 4, true]); // NUM-1: x10 (was 6)
    expect(d).toEqual(pl("leechDrag"));
    expect(st.charged).toBe(2);
  });

  it("against a silent foe every leech fires plain", () => {
    const b = new Battle(siphon(), dummyFoe(), 2);
    let n = 0;
    run(b, 20, (bt) => {
      for (const pr of bt.projectiles) {
        if (pr.from !== 0) continue;
        expect([pr.dmg, pr.payload.burn, pr.payload.shock]).toEqual([50, 0, false]); // NUM-1: a leech's base x10 (was 5)
        n++;
      }
    });
    expect(n).toBeGreaterThan(0);
    expect(b.sides[0].race!.echo.charged).toBe(0);
  });

  it("in battle it copies the last enemy payload: Furnace Burn, and Weaver's Fray lands back on Weaver", () => {
    const f = new Battle(siphon(), heroRefBuild("furnace", 2), 3); // Furnace day 2: Temper, its ★1 Burn
    const tb = effectAt("temper", 1).gate!.burn;
    let burning = 0;
    run(f, 40, (bt) => {
      for (const pr of bt.projectiles) if (pr.from === 0 && pr.payload.ammo === "leechEcho" && pr.payload.burn === tb) burning++;
    });
    expect(burning).toBeGreaterThan(0);
    expect(f.sides[0].race!.echo.mem!.burn).toBe(tb);
    const w = new Battle(siphon(), heroStartBuild("weaver", 100), 3);
    let fray = 0;
    run(w, 40, (bt) => (fray = Math.max(fray, bt.sides[1].hull.fray)));
    expect(w.sides[0].race!.echo.mem!.fray).toBe(1);
    expect(fray).toBeGreaterThan(0); // only ECHO leeches can fray Weaver
  });

  it("each new enemy impact overwrites the memory", () => {
    const b = new Battle(siphon(), heroRefBuild("weaver", 5), 4); // Weaver day 5: Grease, Temper, Coil, Whetstone lines
    const mems = new Set<string>();
    run(b, 40, (bt) => mems.add(JSON.stringify(bt.sides[0].race!.echo.mem)));
    expect(mems.size).toBeGreaterThan(2);
  });
});

describe("SIPHON battles", () => {
  it("vs Furnace, Weaver, Foundry, Bastion and Metronome (start and days 1/5/10, 10 seeds, both sides) end before the cap with no NaN", () => {
    expectSaneBattles("siphon", ["furnace", "weaver", "foundry", "bastion", "metronome"]);
  });

  it("start layout: two 8-tile routes into both light guns (16/20 belt)", () => {
    const b = siphon();
    expect(b.routes.map((r) => r.cells.length)).toEqual([8, 8]);
    expect(b.routes.map((_, i) => routeInfo(b, i).connector)).toEqual([2, 7]);
    expect(b.routes[0].cells[0]).toBe(K(4, 5));
  });
});
