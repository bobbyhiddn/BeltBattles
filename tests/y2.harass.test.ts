// Y2 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, the shared rule): HARASSMENT IS A STUN, with the star switch
// on (content.ts STAR_RULES, withStarRules). A SABOT wreck has its own cause, "wreck", and a GRAPNEL rip stays "rip": both
// still land, but neither is harassment, so TOLLBOOTH spends no toll on them and an enemy SCRAPPER doesn't count them;
// FLAK SCREEN rolls only for a shot that carries a STUN. Each check runs the same scene with the switch off too, where the
// base's rule holds (every accepted effect is harassment).
import { describe, expect, it } from "vitest";
import { Battle, type Payload, type Projectile, type SideState, type Target } from "../src/sim/battle";
import { CELL, DISRUPT_TIME, type HarassCause } from "../src/sim/content";
import { type HarassRound } from "../src/sim/harassment";
import { effectAt } from "../src/sim/stars";
import { barge, bench } from "./arsenal.bench";

const SABOT = effectAt("sabot", 1).factory!.round as Extract<HarassRound, { kind: "sabot" }>;
const payload = (id = 900): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false });
const target = (s: SideState, kind: Target["kind"], ref: number, cell = -1): Target => {
  const t = s.targets.find((x) => x.kind === kind && x.ref === ref && x.cell === cell);
  if (!t) throw new Error(`missing ${kind} ${ref}:${cell}`);
  return t;
};
type Probe = {
  disrupt(s: SideState, t: Target, secs: number, cause: HarassCause): boolean;
  rip(s: SideState, t: Target, count: number, reach: number): number;
  roundImpact(s: SideState, t: Target, round: HarassRound, from: 0 | 1): void;
  isHarassingProjectile(pr: Projectile): boolean;
};
const probe = (bt: Battle) => bt as unknown as Probe;
/** The defender (side 1) with its factories held, so only the effects a check lands move it. */
function quiet(def = bench(), seed = 8): Battle {
  const bt = new Battle(barge(), def, seed);
  for (const f of bt.sides[1].factories) f.timer = 1000;
  return bt;
}
/** A TOLLBOOTH (uid 10, tile (4,3)) and a WHETSTONE (uid 11, tile (4,2)) on the bench's one belt, both online. */
function tolled(): { bt: Battle; s: SideState } {
  const bt = quiet(bench([["tollbooth", 4, 3, 1], ["whetstone", 4, 2, 1]])), s = bt.sides[1];
  for (const g of s.gates) g.online = true;
  return { bt, s };
}
const toll = (s: SideState) => s.gates.find((g) => g.def.id === "tollbooth")!;
const whet = (s: SideState) => s.gates.find((g) => g.def.id === "whetstone")!;
const causes = (bt: Battle) => bt.events.filter((e) => e.type === "harass").map((e) => (e as { cause: HarassCause }).cause);

describe("Y2 shared rule: a SABOT wreck is cause \"wreck\", and neither a wreck nor a rip is harassment (switch on)", () => {
  it("a wreck on a rig: on, it lands past the toll as \"wreck\" and an enemy SCRAPPER doesn't count it; off, the toll blocks it (\"sabot\")", () => {
    const { bt, s } = tolled();
    probe(bt).roundImpact(s, target(s, "gate", whet(s).uid), SABOT, 0);
    expect(whet(s).wrecked).toBe(true);
    expect(toll(s).tolls).toBe(2);
    expect(causes(bt)).toEqual(["wreck"]);
    expect(bt.sides[0].harassAccepted).toBe(0);
    // Y7b2 (the flip): was expect(bt.sides[0].wreckAccepted).toBe(1); the flip deleted SideState.wreckAccepted (BIG HAUL's
    // wreck count, switch-off only)
    expect(bt.events.some((e) => e.type === "toll")).toBe(false);
  });

  it("a rip: on, it lands past the toll as \"rip\", uncounted; off, the toll blocks it", () => {
    const go = (): { bt: Battle; s: SideState; n: number } => {
      const { bt, s } = tolled();
      s.routes[0].ammo.push({ p: payload(11), s: 2 * CELL + 5, processed: 1, blocked: false });
      return { bt, s, n: probe(bt).rip(s, target(s, "belt", 0, 2), 1, 1) };
    };
    const { bt, s, n } = go();
    expect(n).toBe(1);
    expect(s.routes[0].ammo).toHaveLength(0);
    expect(toll(s).tolls).toBe(2);
    expect(causes(bt)).toEqual(["rip"]);
    expect(bt.sides[0].harassAccepted).toBe(0);
  });

  it("a STUN is still harassment: on, the toll blocks the first 2 and the third lands and counts, as off", () => {
    const { bt, s } = tolled(), t = target(s, "belt", 0, 3);
    expect(probe(bt).disrupt(s, t, DISRUPT_TIME, "shock")).toBe(false);
    expect(probe(bt).disrupt(s, t, DISRUPT_TIME, "freeze")).toBe(false);
    expect(toll(s).tolls).toBe(0);
    expect(probe(bt).disrupt(s, t, DISRUPT_TIME, "sabot")).toBe(true); // a SABOT round's STUN on a tile is a STUN
    expect(bt.sides[0].harassAccepted).toBe(1);
    expect(causes(bt)).toEqual(["sabot"]);
  });

  it("SAP is no STUN: on, it marks past the toll, uncounted; off, the toll blocks it", () => {
    const { bt, s } = tolled();
    s.routes[0].ammo.push({ p: payload(11), s: 3 * CELL + 5, processed: 2, blocked: false });
    const marked = bt.applyPayloadDebuff(s, target(s, "belt", 0, 3), "sap");
    expect([marked, toll(s).tolls, bt.sides[0].harassAccepted]).toEqual([true, 2, 0]);
  });
});

describe("Y2 shared rule: FLAK SCREEN rolls only for a shot that carries a STUN (switch on)", () => {
  /** One shot from side 0's turret with `edit` applied to its payload (and `core` fitted), as harassment.engine's fireOne. */
  function shot(edit: (p: Payload) => void, core?: string): { bt: Battle; pr: Projectile } {
    const atk = barge();
    if (core) atk.mods.push({ uid: 20, def: core, turret: 0 });
    const bt = new Battle(atk, barge(), 8);
    const tu = bt.sides[0].turrets[0], p = payload();
    edit(p);
    tu.stack.push(p);
    tu.phase = "fire";
    bt.step();
    return { bt, pr: bt.projectiles[0] };
  }
  const cases: [string, (p: Payload) => void, string | undefined, boolean][] = [
    // name, payload, core, harassing
    ["a plain slug", () => {}, undefined, false],
    ["a shock slug", (p) => { p.shock = true; }, undefined, true],
    ["a static slug", (p) => { p.static = true; }, undefined, true],
    ["a FROST round", (p) => { p.harass = { kind: "frost", seconds: 2 }; }, undefined, true],
    ["a CHAIN round", (p) => { p.harass = { kind: "drag", seconds: 1 }; }, undefined, true],
    ["a SABOT round", (p) => { p.harass = SABOT; }, undefined, true],
    ["a LIMPET charge with a stall", (p) => { p.harass = { kind: "limpet", delay: 3, blast: 80, stall: 1 }; }, undefined, true],
    ["a LIMPET charge without one", (p) => { p.harass = { kind: "limpet", delay: 3, blast: 80 }; }, undefined, false],
    ["a GRAPNEL rip", (p) => { p.rip = { count: 1, reach: 1 }; }, undefined, false],
    ["a LANCE shot", () => {}, "lance", false],
    ["a TESLA shot", () => {}, "tesla", true],
  ];
  for (const [name, edit, core, rolled] of cases) {
    it(`${name}: ${rolled ? "rolled" : "not rolled"}`, () => {
      const { bt, pr } = shot(edit, core);
      expect(probe(bt).isHarassingProjectile(pr)).toBe(rolled);
    });
  }

  it("on: a sure screen downs a FROST round but lets a stall-less LIMPET charge land", () => {
    // Y7b2 (the flip): was sides[1].flak = 1 (the switch-on roll fell back to it with no screen listed); the flip deleted
    // SideState.flak, and a sure screen is flaks [1]: the same one roll
    const frost = shot((p) => { p.harass = { kind: "frost", seconds: 2 }; });
    frost.bt.sides[1].flaks = [1];
    while (frost.bt.projectiles.length) frost.bt.step();
    expect(frost.bt.events.filter((e) => e.type === "flak")).toHaveLength(1);
    const limpet = shot((p) => { p.harass = { kind: "limpet", delay: 3, blast: 80 }; });
    limpet.bt.sides[1].flaks = [1];
    while (limpet.bt.projectiles.length) limpet.bt.step();
    expect(limpet.bt.events.some((e) => e.type === "flak")).toBe(false);
    expect(limpet.bt.sides[1].limpets).toHaveLength(1);
  });
});
