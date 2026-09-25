// Wave-2 engine fixtures. No wave-2 item is buyable yet: rounds are injected into a real chamber,
// and future gate/mod values are set on the battle copy after construction.
import { describe, expect, it } from "vitest";
import { Battle, type Payload, type SideState, type Target } from "../src/sim/battle";
import { CELL, DISRUPT_TIME, GUARD_FREEZE, GUARD_SLOW, TICK, type HarassCause } from "../src/sim/content";
import { key as K, type Build } from "../src/sim/deck";
import { debuffedDamage, siftDebuffs, type HarassRound } from "../src/sim/harassment";
import { barge, bench } from "./arsenal.bench";

const payload = (id = 900): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0,
  shock: false, prior: 0, factory: 1, copy: false });
const target = (s: SideState, kind: Target["kind"], ref: number, cell = -1): Target => {
  const t = s.targets.find((x) => x.kind === kind && x.ref === ref && x.cell === cell);
  if (!t) throw new Error(`missing ${kind} ${ref}:${cell}`);
  return t;
};
type Probe = {
  disrupt(s: SideState, t: Target, secs: number, cause: HarassCause): boolean;
  freeze(s: SideState, t: Target, secs: number): boolean;
  slowSegment(s: SideState, t: Target, mul: number, secs: number): boolean;
  rip(s: SideState, t: Target, count: number, reach: number): number;
  roundImpact(s: SideState, t: Target, round: HarassRound, from: 0 | 1): void;
  sparkJump(s: SideState, t: Target, secs: number, count: number, cause: HarassCause): void;
};
const probe = (bt: Battle) => bt as unknown as Probe;
function quiet(def: Build = bench(), seed = 8): Battle {
  const bt = new Battle(barge(), def, seed);
  for (const f of bt.sides[1].factories) f.timer = 1000;
  return bt;
}
function advance(bt: Battle, seconds: number): void {
  while (bt.t + 1e-9 < seconds) bt.step();
}
function fireOne(round?: HarassRound, seed = 8, core?: string): Battle {
  const atk = barge();
  if (core) atk.mods.push({ uid: 20, def: core, turret: 0 });
  const bt = new Battle(atk, barge(), seed);
  const tu = bt.sides[0].turrets[0];
  const p = payload();
  if (round) p.harass = round;
  tu.stack.push(p);
  tu.phase = "fire";
  bt.step();
  return bt;
}

describe("harassment rounds and projectile gate", () => {
  it("seed 8 rerolls only the first bare-hull pick of a special round", () => {
    const ordinary = fireOne();
    const pressure = fireOne(undefined, 8, "pressure");
    const special = fireOne({ kind: "frost", seconds: 2.5 });
    expect(ordinary.projectiles[0].target.kind).toBe("hull");
    expect(pressure.projectiles[0].target.kind).toBe("hull");
    expect(special.projectiles[0].target.kind).not.toBe("hull");
    const secondHull = fireOne({ kind: "sabot" }, 1); // a non-hull first pick takes no reroll
    expect(secondHull.projectiles[0].target.kind).toBe(fireOne(undefined, 1).projectiles[0].target.kind);
  });

  it("telegraphs every special at least 1.2 s before its deterministic impact", () => {
    const bt = fireOne({ kind: "sabot" });
    const pr = bt.projectiles[0];
    const tele = bt.events.find((e) => e.type === "telegraph");
    expect(tele).toMatchObject({ type: "telegraph", proj: pr.id, round: "sabot", target: pr.target });
    if (tele?.type !== "telegraph") throw new Error("telegraph missing");
    expect(tele.impactAt - TICK).toBeGreaterThanOrEqual(1.2);
    advance(bt, tele.impactAt + TICK);
    expect(bt.events.some((e) => e.type === "impact" && e.side === 1)).toBe(true);
    expect(Math.abs(bt.t - tele.impactAt)).toBeLessThanOrEqual(TICK + 1e-6);
  });

  it("a Sabot round that rerolls to bare hull still lands its +6 hull damage", () => {
    const bt = fireOne({ kind: "sabot" }, 7);
    expect(bt.projectiles[0].target.kind).toBe("hull");
    const hp = bt.sides[1].hull.hp;
    advance(bt, bt.projectiles[0].flight + TICK);
    expect(bt.sides[1].hull.hp).toBe(hp - 9); // plain synthetic slug 3 + Sabot hull bonus 6
  });

  it("Flak intercepts once at mid-flight before damage or machinery effects", () => {
    const bt = fireOne({ kind: "frost", seconds: 2.5 });
    bt.sides[1].flak = 1; // future FLAK mod's resolved value
    const hp = bt.sides[1].hull.hp;
    const impactAt = bt.projectiles[0].flight;
    advance(bt, impactAt + TICK);
    expect(bt.sides[1].hull.hp).toBe(hp);
    expect(bt.events.filter((e) => e.type === "flak")).toHaveLength(1);
    expect(bt.events.some((e) => e.type === "harass" || e.type === "impact")).toBe(false);
    expect(bt.projectiles).toHaveLength(0);
  });
});

describe("machine and route effects", () => {
  it("freeze pauses factory, rig commission and turret windows; the stronger remaining stall expires", () => {
    const bt = quiet(bench([["whetstone", 4, 3, 1]]));
    const s = bt.sides[1], p = probe(bt), f = s.factories[0], g = s.gates[0], tu = s.turrets[0];
    const commission = g.commissionAt;
    f.timer = 4; tu.loadTimer = 0.5; tu.fireCd = 1.5; tu.stack.push(payload());
    expect(p.freeze(s, target(s, "factory", f.uid), 2)).toBe(true);
    expect(p.freeze(s, target(s, "gate", g.uid), 2)).toBe(true);
    expect(p.freeze(s, target(s, "turret", 0), 2)).toBe(true);
    expect(p.disrupt(s, target(s, "turret", 0), 3, "shock")).toBe(true);
    advance(bt, 1);
    expect(s.stats.disrupted).toBeCloseTo(3, 5); // three machines, not four effects
    expect(f.timer).toBe(4);
    expect(g.commissionAt).toBeCloseTo(commission + 1, 5);
    expect(g.online).toBe(false);
    expect(tu.loadTimer).toBe(0.5);
    expect(tu.fireCd).toBe(1.5);
    advance(bt, 2.2);
    expect(tu.frozen).toBe(0);
    expect(tu.disrupted).toBeGreaterThan(0);
    advance(bt, 3.1);
    expect(tu.disrupted).toBe(0);
    expect(tu.frozen).toBe(0);
    expect(f.timer).toBeLessThan(4);
  });

  it("a frozen belt tile stops and CHILLs the payload on it", () => {
    const bt = quiet(), s = bt.sides[1], r = s.routes[0], a = { p: payload(), s: 2 * CELL + 6, processed: 2, blocked: false };
    r.ammo.push(a);
    expect(probe(bt).freeze(s, target(s, "belt", 0, 2), 1)).toBe(true);
    expect(a.p.debuffs?.chill).toBe(true);
    const at = a.s;
    bt.step();
    expect(a.s).toBe(at);
    advance(bt, 1.1);
    expect(a.s).toBeGreaterThan(at);
  });

  it("Drag stops at arrow-hit machinery nodes, SNAG persists, and an off-belt rig is not a tile", () => {
    const b = bench([["whetstone", 4, 4, 1], ["temper", 4, 1, 1]]); // nodes at tiles 1 and 4
    const bt = quiet(b), s = bt.sides[1], r = s.routes[0];
    const a = { p: payload(), s: 2 * CELL + 6, processed: 2, blocked: false };
    r.ammo.push(a);
    expect(probe(bt).slowSegment(s, target(s, "belt", 0, 2), 0.6, 3)).toBe(true);
    expect(r.cellSlow.map((x) => x.t > 0)).toEqual([false, true, true, true, false, false]);
    expect(a.p.debuffs?.snag).toBe(true);
    advance(bt, 3.2);
    expect(a.p.debuffs?.snag).toBe(true);
    expect(r.cellSlow.every((x) => x.t === 0)).toBe(true);
    expect(r.cells).not.toContain(K(3, 3)); // the rig stands beside the route
  });

  it("a two-arrow rig affects both belts, while MANTLET checks every hit", () => {
    const b: Build = {
      hero: "furnace", beltCap: 30, hullBonus: 5000,
      items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 },
        { uid: 10, def: "longhaul", x: 5, y: 1 }],
      routes: [{ factory: 2, cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1)] },
        { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
      mods: [{ uid: 30, def: "mantlet", turret: 0, stars: 3 }],
    };
    const bt = quiet(b), s = bt.sides[1], g = s.gates[0];
    expect(g.hits.map((h) => [h.route, h.tile])).toEqual([[0, 4], [1, 4]]);
    expect(probe(bt).freeze(s, target(s, "gate", 10), 2)).toBe(false); // second hit is skirted
    expect(g.frozen).toBe(0);
    expect(probe(bt).slowSegment(s, target(s, "gate", 10), 0.6, 3)).toBe(false); // drag is also skirted
    s.turrets[0].immune = [];
    expect(probe(bt).slowSegment(s, target(s, "gate", 10), 0.6, 3)).toBe(true);
    expect(s.routes[0].cellSlow[4].t).toBeGreaterThan(0);
    expect(s.routes[1].cellSlow[4].t).toBeGreaterThan(0);
    expect(s.routes[0].cells).not.toContain(K(g.x, g.y));
    expect(s.routes[1].cells).not.toContain(K(g.x, g.y));
  });

  it("REDLINE and AFTERBURNER protect their downstream route tiles", () => {
    const two = quiet(bench([["overdrive", 4, 3, 2]])), three = quiet(bench([["overdrive", 4, 3, 3]]));
    for (const bt of [two, three]) {
      const s = bt.sides[1], r = s.routes[0], t = target(s, "belt", 0, 3);
      s.gates[0].online = true;
      expect(r.guard[1] & GUARD_SLOW).toBe(0);
      expect(r.guard[3] & GUARD_SLOW).toBeTruthy();
      expect(probe(bt).slowSegment(s, t, 0.6, 3)).toBe(false);
      expect(r.cellSlow[3].t).toBe(0);
    }
    expect(two.sides[1].routes[0].guard[3] & GUARD_FREEZE).toBe(0);
    expect(probe(two).freeze(two.sides[1], target(two.sides[1], "belt", 0, 3), 2)).toBe(true);
    expect(three.sides[1].routes[0].guard[3] & GUARD_FREEZE).toBeTruthy();
    expect(probe(three).freeze(three.sides[1], target(three.sides[1], "belt", 0, 3), 2)).toBe(false);
    three.sides[1].gates[0].wrecked = true;
    expect(probe(three).freeze(three.sides[1], target(three.sides[1], "belt", 0, 3), 2)).toBe(true);
  });

  it("Sabot wrecks the whole rig without removing its arrow or changing route length; other machines stall", () => {
    const bt = quiet(bench([["whetstone", 4, 3, 1]])), s = bt.sides[1], r = s.routes[0], g = s.gates[0];
    g.online = true;
    const length = r.L, hit = r.gateAt[2][0];
    probe(bt).roundImpact(s, target(s, "gate", g.uid), { kind: "sabot" }, 0);
    expect(g.wrecked).toBe(true);
    expect(g.hits).toContain(hit);
    expect(r.gateAt[2]).toContain(hit);
    expect(r.L).toBe(length);
    const a = { p: payload(), s: 2 * CELL + 5, processed: 1, blocked: false };
    r.ammo.push(a);
    bt.step(); bt.step();
    expect(a.p.flat).toBe(0);
    expect(bt.events.some((e) => e.type === "process" && e.gate === g.uid)).toBe(false);
    const f = s.factories[0], tu = s.turrets[0];
    probe(bt).roundImpact(s, target(s, "factory", f.uid), { kind: "sabot" }, 0);
    probe(bt).roundImpact(s, target(s, "turret", 0), { kind: "sabot" }, 0);
    expect(f.disrupted).toBe(4);
    expect(tu.disrupted).toBe(3);
    expect(s.factories).toContain(f);
    expect(s.turrets).toContain(tu);
  });

  it("Grapnel rips the closest payload and breaks equal-distance ties by id", () => {
    const bt = quiet(), s = bt.sides[1], r = s.routes[0];
    r.ammo.push({ p: payload(22), s: 35, processed: 2, blocked: false },
      { p: payload(11), s: 25, processed: 1, blocked: false });
    expect(probe(bt).rip(s, target(s, "belt", 0, 2), 1, 1)).toBe(1);
    expect(r.ammo.map((a) => a.p.id)).toEqual([22]);
    expect(bt.events.find((e) => e.type === "rip")).toMatchObject({ type: "rip", payload: 11 });
  });

  it("Limpet blasts and stalls after its charge delay, with the guard checked then", () => {
    const bt = quiet(), s = bt.sides[1], f = s.factories[0], t = target(s, "factory", f.uid);
    const hp = s.hull.hp;
    probe(bt).roundImpact(s, t, { kind: "limpet", delay: 3, blast: 8, stall: 1 }, 0);
    expect(s.limpets).toHaveLength(1);
    expect(f.disrupted).toBe(0);
    expect(s.hull.hp).toBe(hp);
    advance(bt, 2.9);
    expect(f.disrupted).toBe(0);
    expect(s.hull.hp).toBe(hp);
    advance(bt, 3 + TICK);
    expect(s.limpets).toHaveLength(0);
    expect(s.hull.hp).toBe(hp - 8);
    expect(f.disrupted).toBeGreaterThan(0);
    expect(bt.events.filter((e) => e.type === "limpet")).toHaveLength(1);
  });
});

describe("carried debuffs and guard order", () => {
  it("CHILL and SAP change shot damage, SNAG changes travel speed, and SIFTER removes in order", () => {
    expect(debuffedDamage(20, { chill: true, sap: true })).toBe(13);
    const p = payload();
    p.debuffs = { chill: true, snag: true, sap: true };
    expect(siftDebuffs(p.debuffs, 1)).toBe(1);
    expect(p.debuffs).toEqual({ snag: true, sap: true });
    expect(siftDebuffs(p.debuffs, "all")).toBe(2);
    expect(p.debuffs).toEqual({});
    const clean = quiet(), slow = quiet();
    const a = { p: payload(), s: 0, processed: -1, blocked: false };
    const b = { p: payload(), s: 0, processed: -1, blocked: false };
    b.p.debuffs = { snag: true };
    clean.sides[1].routes[0].ammo.push(a);
    slow.sides[1].routes[0].ammo.push(b);
    clean.step(); slow.step();
    expect(b.s).toBeCloseTo(a.s * 0.8, 7);
    const chilled = fireOne();
    const withMarks = new Battle(barge(), barge(), 8);
    const tu = withMarks.sides[0].turrets[0], marked = payload();
    marked.base = 20; marked.debuffs = { chill: true, sap: true };
    tu.stack.push(marked); tu.phase = "fire"; withMarks.step();
    expect(withMarks.projectiles[0].dmg).toBe(13);
    expect(chilled.projectiles[0].dmg).toBe(3);
  });

  it("a future SIFTER rig uses the same removal hook at its arrow hit", () => {
    const bt = quiet(bench([["whetstone", 4, 3, 1]])), s = bt.sides[1], g = s.gates[0], r = s.routes[0];
    g.online = true;
    g.def = { ...g.def, gate: { ...g.def.gate, sift: 1 } };
    const p = payload(); p.debuffs = { chill: true, snag: true, sap: true };
    const a = { p, s: 2 * CELL + 5, processed: 1, blocked: false };
    r.ammo.push(a);
    bt.step(); bt.step(); bt.step(); bt.step();
    expect(p.debuffs).toEqual({ snag: true, sap: true });
  });

  it("Toll spends exactly two charges before any stall, and Scrapper sees only the accepted hit", () => {
    const bt = quiet(bench([["whetstone", 4, 3, 1]])), s = bt.sides[1], g = s.gates[0];
    g.online = true; g.tolls = 2;
    const t = target(s, "belt", 0, 2), p = probe(bt);
    expect(p.disrupt(s, t, DISRUPT_TIME, "shock")).toBe(false);
    expect(p.freeze(s, t, 2)).toBe(false);
    expect(g.tolls).toBe(0);
    expect(s.routes[0].cellDisrupt[2]).toBe(0);
    expect(s.routes[0].cellFrozen[2]).toBe(0);
    expect(bt.sides[0].harassAccepted).toBe(0);
    expect(p.disrupt(s, t, DISRUPT_TIME, "shock")).toBe(true);
    expect(s.routes[0].cellDisrupt[2]).toBe(DISRUPT_TIME);
    expect(bt.sides[0].harassAccepted).toBe(1);
    expect(bt.events.filter((e) => e.type === "toll")).toHaveLength(2);
    expect(bt.events.filter((e) => e.type === "harass")).toHaveLength(1);
  });

  it("Toll also protects its route's turret endpoint, including a Static stall", () => {
    const bt = quiet(bench([["whetstone", 4, 3, 1]])), s = bt.sides[1], g = s.gates[0];
    g.online = true; g.tolls = 1;
    const t = target(s, "turret", 0);
    expect(probe(bt).disrupt(s, t, 2, "static")).toBe(false);
    expect(s.turrets[0].disrupted).toBe(0);
    expect(g.tolls).toBe(0);
    expect(probe(bt).disrupt(s, t, 2, "static")).toBe(true);
    expect(s.turrets[0].disrupted).toBe(2);
  });

  it("MANTLET blocks its listed turret effects; a blocked effect never feeds Scrapper", () => {
    const bt = quiet(bench([], [["mantlet", 2]])), s = bt.sides[1], t = target(s, "turret", 0), p = probe(bt);
    expect(p.disrupt(s, t, 2, "static")).toBe(false);
    expect(p.disrupt(s, t, 2, "arc")).toBe(false);
    expect(p.freeze(s, t, 2)).toBe(false);
    p.roundImpact(s, t, { kind: "sabot" }, 0);
    expect(s.turrets[0].disrupted).toBe(0);
    expect(s.turrets[0].frozen).toBe(0);
    expect(bt.sides[0].harassAccepted).toBe(0);
    expect(bt.events.some((e) => e.type === "wreck" || e.type === "harass")).toBe(false);
  });

  it("SAP travels on a payload and obeys Toll before being applied", () => {
    const bt = quiet(bench([["whetstone", 4, 3, 1]])), s = bt.sides[1], g = s.gates[0];
    g.online = true; g.tolls = 1;
    const a = { p: payload(), s: 2 * CELL + 6, processed: 2, blocked: false };
    s.routes[0].ammo.push(a);
    const t = target(s, "belt", 0, 2);
    expect(bt.applyPayloadDebuff(s, t, "sap")).toBe(false);
    expect(a.p.debuffs?.sap).toBeUndefined();
    expect(bt.applyPayloadDebuff(s, t, "sap")).toBe(true);
    expect(a.p.debuffs?.sap).toBe(true);
    expect(bt.sides[0].harassAccepted).toBe(1);
  });

  it("marks remain on the payload when it crosses from its route into the turret chamber", () => {
    const bt = quiet(), s = bt.sides[1], r = s.routes[0], p = payload();
    p.debuffs = { chill: true, snag: true, sap: true };
    r.ammo.push({ p, s: r.L, processed: r.cells.length - 1, blocked: false });
    bt.step();
    expect(r.ammo).toHaveLength(0);
    expect(s.turrets[0].stack[0]).toBe(p);
    expect(s.turrets[0].stack[0].debuffs).toEqual({ chill: true, snag: true, sap: true });
  });
});
