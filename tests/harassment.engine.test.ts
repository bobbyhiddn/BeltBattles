// Wave-2 engine fixtures. No wave-2 item is buyable yet: rounds are injected into a real chamber,
// and future gate/mod values are set on the battle copy after construction.
// NUM-3 (R1's STUN fold, REQ-BFG-046): FROSTBITE's, DRAG CHAIN's and SABOT's rounds STUN the part they hit through
// Battle.disrupt (causes "freeze", "drag", "sabot"); Battle.freeze, Battle.slowSegment, RouteState.cellSlow, CHILL, SNAG
// and SABOT's bare-hull +60 are gone. The checks that drove them drive the real rounds (read from the data) instead.
import { describe, expect, it } from "vitest";
import { Battle, type Payload, type SideState, type Target } from "../src/sim/battle";
import { CELL, DISRUPT_TIME, GUARD_FREEZE, GUARD_SLOW, STUN_CAUSES, TICK, type HarassCause } from "../src/sim/content";
import { key as K, type Build } from "../src/sim/deck";
import { debuffedDamage, siftDebuffs, type HarassRound } from "../src/sim/harassment";
import { effectAt } from "../src/sim/stars";
import { barge, bench } from "./arsenal.bench";

// NUM-3 (R1's STUN fold): the ★1 rounds as the data has them (FROSTBITE 2 s, DRAG CHAIN 1 s, SABOT 4 s; N1 2.2)
const FROST = effectAt("frostbite", 1).factory!.round as Extract<HarassRound, { kind: "frost" }>;
const CHAIN = effectAt("dragchain", 1).factory!.round as Extract<HarassRound, { kind: "drag" }>;
const SABOT = effectAt("sabot", 1).factory!.round as Extract<HarassRound, { kind: "sabot" }>;

const payload = (id = 900): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0,
  shock: false, prior: 0, factory: 1, copy: false });
const target = (s: SideState, kind: Target["kind"], ref: number, cell = -1): Target => {
  const t = s.targets.find((x) => x.kind === kind && x.ref === ref && x.cell === cell);
  if (!t) throw new Error(`missing ${kind} ${ref}:${cell}`);
  return t;
};
type Probe = { // NUM-3: freeze and slowSegment are gone (the frost and chain rounds STUN through disrupt)
  disrupt(s: SideState, t: Target, secs: number, cause: HarassCause): boolean;
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

  it("a Sabot round that rerolls to bare hull still lands its slug's hull damage, and no more (NUM-3: its +60 is gone)", () => {
    const bt = fireOne(SABOT, 7);
    expect(bt.projectiles[0].target.kind).toBe("hull");
    const hp = bt.sides[1].hull.hp, dmg = bt.projectiles[0].dmg;
    advance(bt, bt.projectiles[0].flight + TICK);
    // NUM-3 (R1's STUN fold): was hp - 90 (the plain synthetic slug's 30 + SABOT's bare-hull bonus 60; NUM-1: x10 of 9);
    // the bonus is gone, so the hull takes the slug's own 30, the projectile's damage exactly
    expect(dmg).toBe(30);
    expect(bt.sides[1].hull.hp).toBe(hp - dmg);
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
  it("a frost round's STUN pauses factory, rig and turret windows (NUM-3: was a freeze); the stronger remaining stall expires", () => {
    const bt = quiet(bench([["whetstone", 4, 3, 1]]));
    const s = bt.sides[1], p = probe(bt), f = s.factories[0], g = s.gates[0], tu = s.turrets[0];
    const commission = g.commissionAt;
    f.timer = 4; tu.loadTimer = 0.5; tu.fireCd = 1.5; tu.stack.push(payload());
    // NUM-3 (R1's STUN fold): was p.freeze(factory / rig / turret, 2) true each; now the ★1 frost round (2 s, the data's)
    // STUNs each of them through Battle.disrupt (cause "freeze"), and nothing freezes
    for (const t of [target(s, "factory", f.uid), target(s, "gate", g.uid), target(s, "turret", 0)]) p.roundImpact(s, t, FROST, 0);
    for (const m of [f, g, tu]) expect([m.disrupted, m.frozen]).toEqual([expect.closeTo(FROST.seconds, 9), 0]);
    expect(p.disrupt(s, target(s, "turret", 0), 3, "shock")).toBe(true);
    expect(tu.disrupted).toBeCloseTo(3, 9); // NUM-3: one STUN timer keeps the stronger (the shock's 3 s over the frost's 2 s)
    advance(bt, 1);
    expect(s.stats.disrupted).toBeCloseTo(3, 5); // three machines, not four effects
    expect(f.timer).toBe(4);
    // NUM-3: was commissionAt + 1 (a freeze held the rig's commission back); a STUN never did (Battle.updateMachinery
    // moves commissionAt only while frozen), so the rig's commission runs on and its STUN stops its work instead
    expect(g.commissionAt).toBe(commission);
    expect(g.disrupted).toBeGreaterThan(0);
    expect(g.online).toBe(false);
    expect(tu.loadTimer).toBe(0.5);
    expect(tu.fireCd).toBe(1.5);
    advance(bt, 2.2);
    expect(tu.frozen).toBe(0);
    expect([f.disrupted, g.disrupted]).toEqual([0, 0]); // NUM-3: the frost round's 2 s are over (was: the freeze expired)
    expect(tu.disrupted).toBeGreaterThan(0);
    advance(bt, 3.1);
    expect(tu.disrupted).toBe(0);
    expect(tu.frozen).toBe(0);
    expect(f.timer).toBeLessThan(4);
  });

  it("a frost round's STUN stops the payload on its belt tile, and marks it with nothing (NUM-3: was a freeze that CHILLed it)", () => {
    const bt = quiet(), s = bt.sides[1], r = s.routes[0], a = { p: payload(), s: 2 * CELL + 6, processed: 2, blocked: false };
    r.ammo.push(a);
    // NUM-3 (R1's STUN fold): was p.freeze(tile 2, 1 s) true and a CHILL mark on the payload; now the ★1 frost round STUNs
    // the tile for its seconds (cellDisrupt; cellFrozen stays 0) and the payload carries no mark (CHILL is gone)
    probe(bt).roundImpact(s, target(s, "belt", 0, 2), FROST, 0);
    expect([r.cellDisrupt[2], r.cellFrozen[2]]).toEqual([expect.closeTo(FROST.seconds, 9), 0]);
    expect(a.p.debuffs).toBeUndefined();
    const at = a.s;
    bt.step();
    expect(a.s).toBe(at);
    advance(bt, FROST.seconds + 0.1); // NUM-3: was 1.1 (a 1 s freeze)
    expect(a.s).toBeGreaterThan(at);
    expect(a.p.debuffs).toBeUndefined();
  });

  it("a chain round STUNs only the tile it hits (NUM-3: was a slow stopping at arrow-hit nodes, with SNAG), and an off-belt rig is not a tile", () => {
    const b = bench([["whetstone", 4, 4, 1], ["temper", 4, 1, 1]]); // nodes at tiles 1 and 4
    const bt = quiet(b), s = bt.sides[1], r = s.routes[0];
    const a = { p: payload(), s: 2 * CELL + 6, processed: 2, blocked: false };
    r.ammo.push(a);
    // NUM-3 (R1's STUN fold): was slowSegment(tile 2, x0.6, 3 s) true, slowing the stretch between the arrow-hit nodes
    // (tiles 1-3: [false, true, true, true, false, false]) and SNAGging the payload, the SNAG kept after the slow; now the
    // ★1 chain round STUNs tile 2 alone (no stretch), its payload stops there, and nothing marks it, then or after
    probe(bt).roundImpact(s, target(s, "belt", 0, 2), CHAIN, 0);
    expect(r.cellDisrupt.map((x) => x > 0)).toEqual([false, false, true, false, false, false]);
    expect(r.cellDisrupt[2]).toBeCloseTo(CHAIN.seconds, 9);
    expect(a.p.debuffs).toBeUndefined();
    const at = a.s;
    bt.step();
    expect(a.s).toBe(at);
    advance(bt, CHAIN.seconds + 0.2); // NUM-3: was 3.2 (a 3 s slow)
    expect(a.p.debuffs).toBeUndefined();
    expect(r.cellDisrupt.every((x) => x === 0)).toBe(true); // was: every cellSlow expired
    expect(s.gates.map((g) => g.disrupted)).toEqual([0, 0]); // the rigs at the nodes are not hit
    expect(r.cells).not.toContain(K(3, 3)); // the rig stands beside the route
  });

  it("a two-arrow rig is one part on both belts, while MANTLET checks every hit", () => {
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
    // NUM-3 (R1's STUN fold): was freeze(rig) false and slowSegment(rig) false; now the frost and the chain rounds' STUNs
    // on the rig are refused alike: its second hit is skirted (MANTLET ★3 is immune to every STUN source)
    probe(bt).roundImpact(s, target(s, "gate", 10), FROST, 0); // second hit is skirted
    expect([g.disrupted, g.frozen]).toEqual([0, 0]);
    probe(bt).roundImpact(s, target(s, "gate", 10), CHAIN, 0); // drag is also skirted
    expect(g.disrupted).toBe(0);
    expect(bt.sides[0].harassAccepted).toBe(0);
    expect(s.routes[0].cells).not.toContain(K(g.x, g.y));
    expect(s.routes[1].cells).not.toContain(K(g.x, g.y));
    // NUM-3: was (with the immunities cleared) slowSegment(rig) true, slowing tile 4 of both belts; now the chain round
    // STUNs the rig, one part with an arrow on each belt: it stops working on both belts (R9), and no belt tile is STUNned.
    // `worked` is the belts whose payload, pushed just short of tile 4's centre, gets the rig's arrow in 12 ticks
    const worked = (stun: boolean): number[] => {
      const bt = quiet(b), s = bt.sides[1], g = s.gates[0];
      s.turrets[0].immune = [];
      g.online = true;
      if (stun) {
        probe(bt).roundImpact(s, target(s, "gate", 10), CHAIN, 0);
        expect(g.disrupted).toBeCloseTo(CHAIN.seconds, 9);
        expect(s.routes.map((r) => r.cellDisrupt[4])).toEqual([0, 0]);
      }
      for (const r of s.routes) r.ammo.push({ p: payload(), s: 4 * CELL + 5, processed: 3, blocked: false });
      for (let i = 0; i < 12; i++) bt.step();
      expect(s.routes.map((r) => r.ammo[0]?.processed ?? 4)).toEqual([4, 4]); // both payloads crossed tile 4's centre
      return bt.events.flatMap((e) => (e.type === "process" && e.gate === 10 ? [e.route] : [])).sort();
    };
    expect(worked(false)).toEqual([0, 1]);
    expect(worked(true)).toEqual([]);
  });

  it("REDLINE and AFTERBURNER protect their downstream route tiles (NUM-3: from chain and frost rounds' STUNs)", () => {
    const two = quiet(bench([["overdrive", 4, 3, 2]])), three = quiet(bench([["overdrive", 4, 3, 3]]));
    for (const bt of [two, three]) {
      const s = bt.sides[1], r = s.routes[0], t = target(s, "belt", 0, 3);
      s.gates[0].online = true;
      expect(r.guard[1] & GUARD_SLOW).toBe(0);
      expect(r.guard[3] & GUARD_SLOW).toBeTruthy();
      // NUM-3 (R1's STUN fold): was slowSegment(tile 3) false and cellSlow[3].t 0; now the chain round's STUN is refused
      // on the guarded tile 3 (cause "drag" against GUARD_SLOW) and lands on the unguarded tile 1
      probe(bt).roundImpact(s, t, CHAIN, 0);
      expect(r.cellDisrupt[3]).toBe(0);
      probe(bt).roundImpact(s, target(s, "belt", 0, 1), CHAIN, 0);
      expect(r.cellDisrupt[1]).toBeCloseTo(CHAIN.seconds, 9);
    }
    // NUM-3: was freeze(tile 3) true at ★2, false at ★3, true once the OVERDRIVE is wrecked; now the frost round's STUN
    // (cause "freeze" against GUARD_FREEZE) lands, is refused, and lands
    const stunned = (bt: Battle): number => {
      probe(bt).roundImpact(bt.sides[1], target(bt.sides[1], "belt", 0, 3), FROST, 0);
      return bt.sides[1].routes[0].cellDisrupt[3];
    };
    expect(two.sides[1].routes[0].guard[3] & GUARD_FREEZE).toBe(0);
    expect(stunned(two)).toBeCloseTo(FROST.seconds, 9);
    expect(three.sides[1].routes[0].guard[3] & GUARD_FREEZE).toBeTruthy();
    expect(stunned(three)).toBe(0);
    three.sides[1].gates[0].wrecked = true;
    expect(stunned(three)).toBeCloseTo(FROST.seconds, 9);
    // NUM-3: the guard is by cause: any other STUN (a shock) still lands on an AFTERBURNER tile
    const shock = quiet(bench([["overdrive", 4, 3, 3]])), ss = shock.sides[1];
    ss.gates[0].online = true;
    expect(probe(shock).disrupt(ss, target(ss, "belt", 0, 3), DISRUPT_TIME, "shock")).toBe(true);
  });

  it("Sabot wrecks the whole rig without removing its arrow or changing route length; other machines stall", () => {
    const bt = quiet(bench([["whetstone", 4, 3, 1]])), s = bt.sides[1], r = s.routes[0], g = s.gates[0];
    g.online = true;
    const length = r.L, hit = r.gateAt[2][0];
    probe(bt).roundImpact(s, target(s, "gate", g.uid), SABOT, 0);
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
    probe(bt).roundImpact(s, target(s, "factory", f.uid), SABOT, 0);
    probe(bt).roundImpact(s, target(s, "turret", 0), SABOT, 0);
    // NUM-3 (R1's STUN fold): was 4 s on a factory and 3 s on a turret (5 s on a belt tile); now one STUN of the round's
    // seconds on any part that isn't a rig (4 s, the data's)
    expect(SABOT.seconds).toBe(4);
    expect(f.disrupted).toBeCloseTo(SABOT.seconds, 9);
    expect(tu.disrupted).toBeCloseTo(SABOT.seconds, 9);
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
  it("SAP changes shot damage, no mark changes travel speed, and SIFTER removes SAP (NUM-3: CHILL and SNAG are gone)", () => {
    // NUM-3 (R1's STUN fold): was debuffedDamage(200, { chill, sap }) = 130 (NUM-1's x10: CHILL 75% of 200 = 150, then
    // SAP -20); CHILL is gone, so SAP alone takes its 20: 180, and no mark is no change
    expect(debuffedDamage(200, { sap: true })).toBe(180);
    expect(debuffedDamage(200, {})).toBe(200);
    // NUM-3: was SIFTER removing CHILL, then SNAG, then SAP (1, then "all" 2); SAP is the one mark left, so 1 and "all"
    // each remove it, and nothing is left to remove after it
    const p = payload();
    p.debuffs = { sap: true };
    expect(siftDebuffs(p.debuffs, 1)).toBe(1);
    expect(p.debuffs).toEqual({});
    p.debuffs = { sap: true };
    expect(siftDebuffs(p.debuffs, "all")).toBe(1);
    expect(p.debuffs).toEqual({});
    expect(siftDebuffs(p.debuffs, "all")).toBe(0);
    // NUM-3: was a SNAGged payload riding x0.8 of a clean one; now a marked (SAP) payload rides exactly as a clean one
    const clean = quiet(), marked = quiet();
    const a = { p: payload(), s: 0, processed: -1, blocked: false };
    const b = { p: payload(), s: 0, processed: -1, blocked: false };
    b.p.debuffs = { sap: true };
    clean.sides[1].routes[0].ammo.push(a);
    marked.sides[1].routes[0].ammo.push(b);
    clean.step(); marked.step();
    expect(a.s).toBeGreaterThan(0);
    expect(b.s).toBe(a.s);
    const plain = fireOne();
    const withMarks = new Battle(barge(), barge(), 8);
    const tu = withMarks.sides[0].turrets[0], sapped = payload();
    sapped.base = 200; sapped.debuffs = { sap: true }; // NUM-1: the slug base x10 (was 20); NUM-3: SAP only (was CHILL and SAP)
    tu.stack.push(sapped); tu.phase = "fire"; withMarks.step();
    expect(withMarks.projectiles[0].dmg).toBe(180); // NUM-3: 200 - SAP's 20 (was 130 with CHILL's 75% first; NUM-1: x10 of 13)
    expect(plain.projectiles[0].dmg).toBe(30); // NUM-1: x10 (was 3)
  });

  it("a future SIFTER rig uses the same removal hook at its arrow hit", () => {
    // NUM-3 (R1's STUN fold): was { chill, snag, sap } -> { snag, sap } (sift 1 took CHILL first); SAP is the one mark left,
    // so the SIFTER rig's arrow hit takes it, and the same rig without `sift` leaves it
    const sifted = (sift: boolean) => {
      const bt = quiet(bench([["whetstone", 4, 3, 1]])), s = bt.sides[1], g = s.gates[0], r = s.routes[0];
      g.online = true;
      if (sift) g.def = { ...g.def, gate: { ...g.def.gate, sift: 1 } };
      const p = payload(); p.debuffs = { sap: true };
      const a = { p, s: 2 * CELL + 5, processed: 1, blocked: false };
      r.ammo.push(a);
      bt.step(); bt.step(); bt.step(); bt.step();
      expect(bt.events.some((e) => e.type === "process" && e.gate === g.uid)).toBe(true); // the arrow hit happened
      return p.debuffs;
    };
    expect(sifted(true)).toEqual({});
    expect(sifted(false)).toEqual({ sap: true });
  });

  it("Toll spends exactly two charges before any stall, and Scrapper sees only the accepted hit", () => {
    const bt = quiet(bench([["whetstone", 4, 3, 1]])), s = bt.sides[1], g = s.gates[0];
    g.online = true; g.tolls = 2;
    const t = target(s, "belt", 0, 2), p = probe(bt);
    expect(p.disrupt(s, t, DISRUPT_TIME, "shock")).toBe(false);
    // NUM-3 (R1's STUN fold): was p.freeze(s, t, 2) false; now the frost round's STUN (cause "freeze", its 2 s) is tolled
    expect(p.disrupt(s, t, FROST.seconds, "freeze")).toBe(false);
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
    // NUM-3 (R1's STUN fold): its list is every STUN source from ★1 (STUN_CAUSES; was static/arc at ★1, freeze and sabot
    // from ★2), so ★1 and ★2 alike; was p.freeze(turret, 2) false, now the frost round's STUN is refused, as are the
    // chain and sabot rounds' and every STUN source's through disrupt
    for (const stars of [1, 2]) {
      const bt = quiet(bench([], [["mantlet", stars]])), s = bt.sides[1], t = target(s, "turret", 0), p = probe(bt);
      expect(p.disrupt(s, t, 2, "static")).toBe(false);
      expect(p.disrupt(s, t, 2, "arc")).toBe(false);
      for (const cause of STUN_CAUSES) expect(p.disrupt(s, t, 2, cause), `★${stars} ${cause}`).toBe(false);
      p.roundImpact(s, t, FROST, 0);
      p.roundImpact(s, t, CHAIN, 0);
      p.roundImpact(s, t, SABOT, 0);
      expect(s.turrets[0].disrupted).toBe(0);
      expect(s.turrets[0].frozen).toBe(0);
      expect(bt.sides[0].harassAccepted).toBe(0);
      expect(bt.events.some((e) => e.type === "wreck" || e.type === "harass")).toBe(false);
    }
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
