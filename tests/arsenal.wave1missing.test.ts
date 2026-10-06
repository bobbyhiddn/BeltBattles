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
    // Y7b2 (the flip): POISON is gone (gate.poison deleted, was [2, 4, 7]); VENOM DRIP's live star number is burnPlus 3 / 6 / 9 s
    expect([1, 2, 3].map((s) => effectAt("venom", s).gate?.burnPlus)).toEqual([3, 6, 9]);
    // NUM-3 (N1 2.2): the rest 4 / 2 / 1 s, whole (was 4 / 1.8 / 1.15)
    expect([1, 2, 3].map((s) => effectAt("overclocker", s).gate?.overclockCooldown)).toEqual([4, 2, 1]);
    expect([1, 2, 3].map((s) => effectAt("keg", s).gate?.keg?.flat)).toEqual([6, 13, 21].map((v) => 10 * v)); // NUM-1: x10 (was 6 / 13 / 21)
    // Y7b2 (the flip): BELLOWS's cap is gone (burnPerRide.max deleted, was [4, 9, 14]); +1 / +2 / +3 BURN for each whole 2 s ridden
    expect([1, 2, 3].map((s) => effectAt("bellows", s).gate?.burnPerRide?.burn)).toEqual([1, 2, 3]);
    // 0.6.2 FB-B (tests/fb062.quench.test.ts): +3/+5/+7 per Burn stack, up to 4/5/6 stacks, +1/+2/+3 on every payload
    // (was +2/+4/+6 per stack, capped at +12/+26/+42 damage)
    expect([1, 2, 3].map((s) => effectAt("quench", s).gate?.quench?.perBurn)).toEqual([3, 5, 7].map((v) => 10 * v)); // NUM-1: x10 (was 3 / 5 / 7)
    // NUM-3 (N1 2.2): STUN 1 / 2 / 3 s, whole (was 0.6 / 1.3 / 2.1)
    expect([1, 2, 3].map((s) => effectAt("staticbrush", s).gate?.staticTime)).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((s) => effectAt("lodestone", s).gate?.perStalled?.each)).toEqual([10, 22, 35]); // NUM-1: x10 (was 1 / 2.2 / 3.5)
    expect([1, 2, 3].map((s) => effectAt("barbed", s).gate?.fray)).toEqual([1, 2, 3]);
    // NUM-1: x10, rounded half up (was 0.5 / 1.1 / 1.75; ★3 17.5 -> 18, tests/fixtures/num1-base-values.json "rounded")
    // Y7b2 (the flip): Y7b1's 3 / 7 / 11 (folded at the flip; was [5, 11, 18])
    expect([1, 2, 3].map((s) => effectAt("counterweight", s).gate?.perTile?.each)).toEqual([3, 7, 11]);
  });

  // Y7b2 (the flip): the test "Poison pools on impact, ticks, and refreshes its six-second clock" is deleted: POISON is gone
  // (Payload.poison and HullState.poison deleted; VENOM DRIP holds gate.burnPlus)

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
      // NUM-3 (N1 2.2): the rest read from the data, 4 / 2 / 1 s (was the literals 4 / 1.8 / 1.15)
      expect(booster.cooldown).toBe(effectAt("overclocker", stars).gate!.overclockCooldown!);
      (bt as any).applyHit(s, { ...a, p: payload() }, route.gateAt[2][0]);
      expect(booster.cooldown).toBeGreaterThan(0);
    }
  });

  // Y7b2 (the flip): Y5's POWDER KEG re-arms (every 12 / 10 / 8 s) and its BURN is gone, so the checks that its blast adds
  // `stars` BURN and leaves it consumed are deleted. Was "Keg detonates once over its route, while Sabot fizzles the fuse"
  it("Keg blasts its route when the fuse runs out, while Sabot fizzles the fuse", () => {
    for (const stars of [1, 2, 3]) {
      const { bt, s, a } = setup("keg", stars);
      const g = s.gates[0];
      s.routes[0].ammo.push(a); g.fuse = 0.01;
      bt.step();
      expect(a.p.flat).toBe(10 * [6, 13, 21][stars - 1]); // NUM-1: x10 (was 6 / 13 / 21)
      expect(bt.events.filter((e) => e.type === "keg")).toHaveLength(1);
      bt.step();
      expect(bt.events.filter((e) => e.type === "keg")).toHaveLength(1);
      const other = setup("keg", stars);
      const target = other.s.targets.find((t) => t.kind === "gate" && t.ref === other.s.gates[0].uid)!;
      (other.bt as any).roundImpact(other.s, target, { kind: "sabot" }, 1);
      expect(other.s.gates[0].wrecked).toBe(true);
    }
  });

  // Y7b2 (the flip): Y3's BELLOWS (+1 / +2 / +3 BURN for each whole 2 s ridden, no cap) and QUENCH (no floor, no stack cap:
  // every BURN on the slug turns into +30 / +50 / +70). Was "Bellows counts ride time and Quench converts Burn up to its cap
  // (0.6.2 FB-B: the rest stays Burn)"
  it("Bellows counts ride time and Quench converts every Burn (no cap)", () => {
    for (const stars of [1, 2, 3]) {
      const bellows = process("bellows", stars, 10);
      // NUM-3 (N1 2.2): burnPerRide { burn, per, max }: + burn BURN for each `per` s ridden, at most max (4 / 9 / 14 a 10 s;
      // was 1 BURN every 2.5 / 1.15 / 0.7 s, so 10 s gave 4 / 8 / 14). 10 s ridden is one whole `per`: `burn` BURN
      // Y7b2 (the flip): burnPerRide { burn 1 / 2 / 3, per 2 }, no max: 10 s ridden is five whole `per`s, 5 x burn BURN
      const bpr = effectAt("bellows", stars).gate!.burnPerRide!;
      expect(bpr.per).toBe(2); // Y7b2 (the flip): was 10
      expect(bellows.a.p.burn).toBe([5, 10, 15][stars - 1]); // Y7b2 (the flip): was Math.min(bpr.max, bpr.burn), 4 / 9 / 14
      const quench = process("quench", stars, 3, 10);
      // NUM-1: flat and perBurn x10 (was 1 + 4 * 3, 2 + 5 * 5, 3 + 6 * 7)
      // Y7b2 (the flip): no floor and no stack cap, so all 10 BURN turn into 10 x perBurn (was 10 x [1 + 4 * 3, 2 + 5 * 5, 3 + 6 * 7])
      expect(quench.a.p.flat).toBe([300, 500, 700][stars - 1]); // was 12 / 26 / 42 (all 10 spent)
      expect(quench.a.p.burn).toBe(0); // Y7b2 (the flip): all 10 spent (was [6, 5, 4]: 4 / 5 / 6 spent)
      expect(estimateRoute(bench([["temper", 4, 4, 1], ["quench", 4, 3, stars]]), 0).burn).toBe(0);
    }
  });

  it("Static stalls a turret, Lodestone prices current stalls, and Barbed raises Fray", () => {
    for (const stars of [1, 2, 3]) {
      const stat = process("staticbrush", stars);
      strike(stat.bt, stat.a.p);
      // NUM-3 (N1 2.2): the STUN read from the data, 1 / 2 / 3 s (was the literals 0.6 / 1.3 / 2.1)
      expect(Math.max(...stat.bt.sides[1].turrets.map((t) => t.disrupted))).toBeCloseTo(effectAt("staticbrush", stars).gate!.staticTime!);
      const lodestone = setup("lodestone", stars);
      lodestone.bt.sides[1].turrets[0].disrupted = 2;
      // NUM-3 (R1's STUN fold): was factories[0].frozen = 2 (a FROSTBITE freeze); nothing freezes now, a frost round STUNs
      // the part it hits (Battle.disrupt, cause "freeze"), so the factory's second stall is that STUN
      const foe = lodestone.bt.sides[1], factory = foe.targets.find((t) => t.kind === "factory" && t.ref === foe.factories[0].uid)!;
      expect((lodestone.bt as any).disrupt(foe, factory, 2, "freeze")).toBe(true);
      expect([foe.factories[0].disrupted, foe.factories[0].frozen]).toEqual([2, 0]);
      (lodestone.bt as any).applyHit(lodestone.s, lodestone.a, lodestone.hit);
      // 0.6.2 TUNE-M T2 (tests/tune062.lodestone.test.ts): its floor +1/+2/+3, then 2 stalled x 1/2.2/3.5 (was 2 / 4.4 / 7)
      // NUM-1: x10, all whole: floor +10/+20/+30, then 2 stalled x 10/22/35 (was toBeCloseTo 3 / 6.4 / 10)
      // Y7b2 (the flip): LODESTONE's floor is gone (Y2), so 2 stunned x 10 / 22 / 35 (was [10 + 2 * 10, 20 + 2 * 22, 30 + 2 * 35])
      expect(lodestone.a.p.flat).toBe([2 * 10, 2 * 22, 2 * 35][stars - 1]);
      const barbed = process("barbed", stars);
      strike(barbed.bt, barbed.a.p);
      expect(barbed.bt.sides[1].hull.fray).toBe(stars);
      // Y7b2 (the flip): BARBED's frayCap is gone (★2/★3 RAZOR WIRE raised the hull's MAX to 18 / 21); the hull keeps FRAY's
      // own MAX 15 (was 15 + [0, 3, 6][stars - 1])
      expect(barbed.bt.sides[1].hull.frayMax).toBe(15);
    }
  });

  // Y7b2 (the flip): COUNTERWEIGHT's cap is gone (Y5) and it pays 3 / 7 / 11 a tile (Y7b1). Was "Counterweight pays per prior
  // belt tile with its star cap"
  it("Counterweight pays per prior belt tile, no cap", () => {
    for (const stars of [1, 2, 3]) {
      const { bt, s, a, hit } = setup("counterweight", stars);
      a.processed = 20;
      (bt as any).applyHit(s, a, hit);
      // NUM-1: x10 (was 6 / 13 / 21: the cap, 20 tiles x 5/11/18 is more). Y7b2 (the flip): 20 tiles x 3 / 7 / 11 (was 10 x [6, 13, 21])
      expect(a.p.flat).toBe(20 * [3, 7, 11][stars - 1]);
      expect(estimateRoute(bench([["counterweight", 4, 3, stars]]), 0).dmg).toBeGreaterThan(10 * 3); // NUM-1: x10 (was 3)
    }
  });
});
