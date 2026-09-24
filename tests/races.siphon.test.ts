import { describe, expect, it } from "vitest";
import { Battle, type Payload, type SideState, type Target } from "../src/sim/battle";
import type { AmmoKind } from "../src/sim/content";
import { key as K, routeInfo, type Build } from "../src/sim/deck";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { raceBeltSpeed } from "../src/sim/races";
import {
  DRAG_MULT, DRAG_TIME, ECHO_CAP, addedFlat, applyDrag, dragSpans, echoOf, echoOnLoad, isDragged, newEchoState, segments,
} from "../src/sim/races/siphon";
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

  it("never cooks Furnace cinder slugs hotter: every shot <= the undragged 7.12, some cooler", () => {
    const hottest = 4 + 1.2 * (0.4 * 6 + 0.2);
    let cooler = 0, n = 0, hits = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const b = new Battle(heroStartBuild("furnace", 1), siphon(), seed * 31);
      const seen = new Set<number>();
      run(b, 60, (bt) => {
        for (const pr of bt.projectiles) {
          if (pr.from !== 0 || seen.has(pr.id)) continue;
          seen.add(pr.id);
          expect(pr.dmg).toBeLessThanOrEqual(hottest + 1e-9);
          if (pr.dmg < hottest - 1e-6) cooler++;
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
  it("remembers the added effects of a payload, capped: flat +3, Burn 2, Shock, Fray 1", () => {
    expect(echoOf(pl("thread", { flat: 10, burn: 7, shock: true }), false)).toEqual({ flat: 3, burn: 2, shock: true, fray: 1 });
    expect(echoOf(pl("cinder", { flat: 2, burn: 2, ride: 5 }), false)).toEqual({ flat: 2, burn: 2, shock: false, fray: 0 });
    expect(echoOf(pl("plain"), true).fray).toBe(ECHO_CAP.fray); // an echoed Fray echoes again
    expect(addedFlat(pl("alloy", { flat: 9.1 }))).toBe(0); // a plain fusion is base damage, not processing
    expect(addedFlat(pl("alloy", { flat: 14.3 }))).toBeCloseTo(5.2, 9); // 1.3 x (2 + 2) from two Whetstones
  });

  it("an ECHO leech copies the memory at load (flat x its split mult); the memory is not consumed", () => {
    const st = newEchoState();
    const plain = pl("leechEcho");
    echoOnLoad(st, plain);
    expect(plain).toEqual(pl("leechEcho")); // empty memory: a plain leech
    st.mem = { flat: 6, burn: 4, shock: true, fray: 1 };
    const a = pl("leechEcho", { mult: 0.6, flat: 1.2 });
    const c = pl("leechEcho");
    const d = pl("leechDrag");
    echoOnLoad(st, a);
    echoOnLoad(st, c);
    echoOnLoad(st, d);
    expect(a.flat).toBeCloseTo(1.2 + 6 * 0.6, 12);
    expect([a.burn, a.shock, st.fray.has(a)]).toEqual([4, true, true]);
    expect([c.flat, c.burn, c.shock]).toEqual([6, 4, true]);
    expect(d).toEqual(pl("leechDrag"));
    expect(st.charged).toBe(2);
  });

  it("against a silent foe every leech fires plain", () => {
    const b = new Battle(siphon(), dummyFoe(), 2);
    let n = 0;
    run(b, 20, (bt) => {
      for (const pr of bt.projectiles) {
        if (pr.from !== 0) continue;
        expect([pr.dmg, pr.payload.burn, pr.payload.shock]).toEqual([5, 0, false]);
        n++;
      }
    });
    expect(n).toBeGreaterThan(0);
    expect(b.sides[0].race!.echo.charged).toBe(0);
  });

  it("in battle it copies the last enemy payload: Furnace Burn, and Weaver's Fray lands back on Weaver", () => {
    const f = new Battle(siphon(), heroRefBuild("furnace", 2), 3); // Furnace day 2: Temper, 2 Burn
    let burning = 0;
    run(f, 40, (bt) => {
      for (const pr of bt.projectiles) if (pr.from === 0 && pr.payload.ammo === "leechEcho" && pr.payload.burn === 2) burning++;
    });
    expect(burning).toBeGreaterThan(0);
    expect(f.sides[0].race!.echo.mem!.burn).toBe(2);
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
