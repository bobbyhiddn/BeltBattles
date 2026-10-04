import { describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload, type SideState } from "../src/sim/battle";
import { ITEMS } from "../src/sim/content";
import { estimateRoute } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { abilityText, gist } from "../src/ui/abilityText"; // 0.6.2t: the glossary
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
      // 0.6.2t: the glossary's text at every star (it replaced starEffectLine's shorthand headline)
      for (const stars of [1, 2, 3]) {
        expect(gist(id, stars), `${id} ★${stars}`).not.toBe("");
        expect(abilityText(id, stars).sentences.length, `${id} ★${stars}`).toBeGreaterThan(0);
      }
    }
    expect([1, 2, 3].map((s) => effectAt("venom", s).gate?.poison)).toEqual([2, 4, 7]);
    expect([1, 2, 3].map((s) => effectAt("overclocker", s).gate?.overclockCooldown)).toEqual([4, 1.8, 1.15]);
    expect([1, 2, 3].map((s) => effectAt("keg", s).gate?.keg?.flat)).toEqual([6, 13, 21].map((v) => 10 * v)); // NUM-1: x10 (was 6 / 13 / 21)
    expect([1, 2, 3].map((s) => effectAt("bellows", s).gate?.burnPerRide?.max)).toEqual([4, 9, 14]);
    // 0.6.2 FB-B (tests/fb062.quench.test.ts): +3/+5/+7 per Burn stack, up to 4/5/6 stacks, +1/+2/+3 on every payload
    // (was +2/+4/+6 per stack, capped at +12/+26/+42 damage)
    expect([1, 2, 3].map((s) => effectAt("quench", s).gate?.quench?.perBurn)).toEqual([3, 5, 7].map((v) => 10 * v)); // NUM-1: x10 (was 3 / 5 / 7)
    expect([1, 2, 3].map((s) => effectAt("staticbrush", s).gate?.staticTime)).toEqual([0.6, 1.3, 2.1]);
    expect([1, 2, 3].map((s) => effectAt("lodestone", s).gate?.perStalled?.each)).toEqual([10, 22, 35]); // NUM-1: x10 (was 1 / 2.2 / 3.5)
    expect([1, 2, 3].map((s) => effectAt("barbed", s).gate?.fray)).toEqual([1, 2, 3]);
    // NUM-1: x10, rounded half up (was 0.5 / 1.1 / 1.75; ★3 17.5 -> 18, tests/fixtures/num1-base-values.json "rounded")
    expect([1, 2, 3].map((s) => effectAt("counterweight", s).gate?.perTile?.each)).toEqual([5, 11, 18]);
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
      // NUM-1: poison deals one whole tick a second, 4 a stack (x10 of 0.4), so a 1 s step takes exactly that (was toBeCloseTo, 0.4 a stack)
      expect(hull.hp).toBe(hp - a.p.poison! * 4);
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
      expect(a.p.flat).toBe(10 * 4); // NUM-1: x10 (was 4: WHETSTONE's 2, doubled)
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
      expect(a.p.flat).toBe(10 * [6, 13, 21][stars - 1]); // NUM-1: x10 (was 6 / 13 / 21)
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

  it("Bellows counts ride time and Quench converts Burn up to its cap (0.6.2 FB-B: the rest stays Burn)", () => {
    for (const stars of [1, 2, 3]) {
      const bellows = process("bellows", stars, 10);
      expect(bellows.a.p.burn).toBe([4, 8, 14][stars - 1]);
      const quench = process("quench", stars, 3, 10);
      // NUM-1: flat and perBurn x10 (was 1 + 4 * 3, 2 + 5 * 5, 3 + 6 * 7)
      expect(quench.a.p.flat).toBe(10 * [1 + 4 * 3, 2 + 5 * 5, 3 + 6 * 7][stars - 1]); // was 12 / 26 / 42 (all 10 spent)
      expect(quench.a.p.burn).toBe([6, 5, 4][stars - 1]); // was 0
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
      // 0.6.2 TUNE-M T2 (tests/tune062.lodestone.test.ts): its floor +1/+2/+3, then 2 stalled x 1/2.2/3.5 (was 2 / 4.4 / 7)
      // NUM-1: x10, all whole: floor +10/+20/+30, then 2 stalled x 10/22/35 (was toBeCloseTo 3 / 6.4 / 10)
      expect(lodestone.a.p.flat).toBe([10 + 2 * 10, 20 + 2 * 22, 30 + 2 * 35][stars - 1]);
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
      expect(a.p.flat).toBe(10 * [6, 13, 21][stars - 1]); // NUM-1: x10 (was 6 / 13 / 21: the cap, 20 tiles x 5/11/18 is more)
      expect(estimateRoute(bench([["counterweight", 4, 3, stars]]), 0).dmg).toBeGreaterThan(10 * 3); // NUM-1: x10 (was 3)
    }
  });
});
