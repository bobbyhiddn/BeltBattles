import { describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload, type SideState } from "../src/sim/battle";
import { ITEMS } from "../src/sim/content";
import { estimateRoute } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { starEffectLine } from "../src/screens/build/inspector";
import { barge, bench } from "./arsenal.bench";

const IDS = ["venom", "overclocker", "keg", "bellows", "quench", "staticbrush", "lodestone", "barbed", "counterweight"];
const payload = (): Payload => ({ id: 91, ammo: "plain", ride: 3, mult: 1, flat: 0, burn: 0,
  shock: false, prior: 0, factory: 1, copy: false });
function setup(id: string, stars: number): { bt: Battle; s: SideState; a: BeltAmmo; hit: SideState["routes"][0]["gateAt"][0][0] } {
  const bt = new Battle(bench([[id, 4, 3, stars]]), barge(), 7);
  const s = bt.sides[0], a: BeltAmmo = { p: payload(), s: 30, processed: 2, blocked: false };
  s.gates[0].online = true;
  s.factories[0].timer = 1000;
  return { bt, s, a, hit: s.routes[0].gateAt[2][0] };
}
function process(id: string, stars: number, ride = 3, burn = 0): { bt: Battle; s: SideState; a: BeltAmmo } {
  const v = setup(id, stars);
  v.a.p.ride = ride; v.a.p.burn = burn;
  (v.bt as any).applyHit(v.s, v.a, v.hit);
  return v;
}
function strike(bt: Battle, p: Payload): void {
  const tu = bt.sides[0].turrets[0];
  tu.stack.push(p); tu.phase = "fire";
  bt.step();
  const shot = bt.projectiles[0];
  shot.target = { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 };
  (bt as any).impact(shot);
}

describe("nine wave-1 rigs required by the complete 0.6.2 catalogue", () => {
  it("stocks every rig with live star values and an inspector headline", () => {
    for (const id of IDS) {
      expect(ITEMS[id].merchant, id).toBeTruthy();
      expect(ITEMS[id].tags?.length, id).toBeGreaterThan(0);
      for (const stars of [1, 2, 3]) expect(starEffectLine(id, stars), `${id} ★${stars}`).not.toBe("");
    }
    expect([1, 2, 3].map((s) => effectAt("venom", s).gate?.poison)).toEqual([2, 4, 7]);
    expect([1, 2, 3].map((s) => effectAt("overclocker", s).gate?.overclockCooldown)).toEqual([4, 1.8, 1.15]);
    expect([1, 2, 3].map((s) => effectAt("keg", s).gate?.keg?.flat)).toEqual([6, 13, 21]);
    expect([1, 2, 3].map((s) => effectAt("bellows", s).gate?.burnPerRide?.max)).toEqual([4, 9, 14]);
    expect([1, 2, 3].map((s) => effectAt("quench", s).gate?.quench?.perBurn)).toEqual([2, 4, 6]);
    expect([1, 2, 3].map((s) => effectAt("staticbrush", s).gate?.staticTime)).toEqual([0.6, 1.3, 2.1]);
    expect([1, 2, 3].map((s) => effectAt("lodestone", s).gate?.perStalled?.each)).toEqual([1, 2.2, 3.5]);
    expect([1, 2, 3].map((s) => effectAt("barbed", s).gate?.fray)).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((s) => effectAt("counterweight", s).gate?.perTile?.each)).toEqual([0.5, 1.1, 1.75]);
  });

  it("Poison pools on impact, ticks, and refreshes its six-second clock", () => {
    for (const stars of [1, 2, 3]) {
      const { bt, a } = process("venom", stars);
      expect(a.p.poison).toBe([2, 4, 7][stars - 1]);
      strike(bt, a.p);
      const hull = bt.sides[1].hull;
      expect(hull.poison.stacks).toBe(a.p.poison);
      expect(hull.poison.t).toBe(6);
      const hp = hull.hp;
      (bt as any).hullEffects(1);
      expect(hull.hp).toBeCloseTo(hp - a.p.poison! * 0.4);
      strike(bt, a.p);
      expect(hull.poison.t).toBe(6);
    }
  });

  it("Overclocker links downstream, doubles one armed payload and then cools", () => {
    for (const stars of [1, 2, 3]) {
      const bt = new Battle(bench([["overclocker", 4, 4, stars], ["whetstone", 4, 3, 1]]), barge(), 7);
      const s = bt.sides[0], route = s.routes[0];
      const booster = s.gates[0], stone = s.gates[1];
      booster.online = stone.online = true;
      expect(stone.boostedBy[0].booster).toBe(booster);
      const a: BeltAmmo = { p: payload(), s: 20, processed: 1, blocked: false };
      (bt as any).applyHit(s, a, route.gateAt[1][0]);
      (bt as any).applyHit(s, a, route.gateAt[2][0]);
      expect(a.p.flat).toBe(4);
      expect(booster.cooldown).toBe([4, 1.8, 1.15][stars - 1]);
      (bt as any).applyHit(s, { ...a, p: payload() }, route.gateAt[2][0]);
      expect(booster.cooldown).toBeGreaterThan(0);
    }
  });

  it("Keg detonates once over its route, while Sabot fizzles the fuse", () => {
    for (const stars of [1, 2, 3]) {
      const { bt, s, a } = setup("keg", stars);
      const g = s.gates[0];
      s.routes[0].ammo.push(a); g.fuse = 0.01;
      bt.step();
      expect(a.p.flat).toBe([6, 13, 21][stars - 1]);
      expect(a.p.burn).toBe(stars);
      expect(g.consumed).toBe(true);
      expect(bt.events.filter((e) => e.type === "keg")).toHaveLength(1);
      bt.step();
      expect(bt.events.filter((e) => e.type === "keg")).toHaveLength(1);
      const other = setup("keg", stars);
      const target = other.s.targets.find((t) => t.kind === "gate" && t.ref === other.s.gates[0].uid)!;
      (other.bt as any).roundImpact(other.s, target, { kind: "sabot" }, 1);
      expect(other.s.gates[0].wrecked).toBe(true);
    }
  });

  it("Bellows counts ride time and Quench converts and consumes Burn", () => {
    for (const stars of [1, 2, 3]) {
      const bellows = process("bellows", stars, 10);
      expect(bellows.a.p.burn).toBe([4, 8, 14][stars - 1]);
      const quench = process("quench", stars, 3, 10);
      expect(quench.a.p.flat).toBe([12, 26, 42][stars - 1]);
      expect(quench.a.p.burn).toBe(0);
      expect(estimateRoute(bench([["temper", 4, 4, 1], ["quench", 4, 3, stars]]), 0).burn).toBe(0);
    }
  });

  it("Static stalls a turret, Lodestone prices current stalls, and Barbed raises Fray", () => {
    for (const stars of [1, 2, 3]) {
      const stat = process("staticbrush", stars);
      strike(stat.bt, stat.a.p);
      expect(Math.max(...stat.bt.sides[1].turrets.map((t) => t.disrupted))).toBeCloseTo([0.6, 1.3, 2.1][stars - 1]);
      const lodestone = setup("lodestone", stars);
      lodestone.bt.sides[1].turrets[0].disrupted = 2;
      lodestone.bt.sides[1].factories[0].frozen = 2;
      (lodestone.bt as any).applyHit(lodestone.s, lodestone.a, lodestone.hit);
      expect(lodestone.a.p.flat).toBeCloseTo([2, 4.4, 7][stars - 1]);
      const barbed = process("barbed", stars);
      strike(barbed.bt, barbed.a.p);
      expect(barbed.bt.sides[1].hull.fray).toBe(stars);
      expect(barbed.bt.sides[1].hull.frayMax).toBe(15 + [0, 3, 6][stars - 1]);
    }
  });

  it("Counterweight pays per prior belt tile with its star cap", () => {
    for (const stars of [1, 2, 3]) {
      const { bt, s, a, hit } = setup("counterweight", stars);
      a.processed = 20;
      (bt as any).applyHit(s, a, hit);
      expect(a.p.flat).toBe([6, 13, 21][stars - 1]);
      expect(estimateRoute(bench([["counterweight", 4, 3, stars]]), 0).dmg).toBeGreaterThan(3);
    }
  });
});
