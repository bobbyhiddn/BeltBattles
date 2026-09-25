import { describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload, type SideState, type Target } from "../src/sim/battle";
import { AMMO, CELL, ITEMS, itemsSoldBy } from "../src/sim/content";
import { estimateRoute, type Build } from "../src/sim/deck";
import { resolveCore } from "../src/sim/cores";
import { effectAt, outputsAt, valueOf } from "../src/sim/stars";
import { starEffectLine } from "../src/screens/build/inspector";
import { buyOffer, newRun, rollShop } from "../src/game/run";
import { barge, bench, factoryBench, factoryLight, gantryWeaver } from "./arsenal.bench";

const GATES = ["tollbooth", "sifter", "surge", "sorting", "riveter", "heatjacket"];
const FACTORIES = ["scrapper", "sabot", "frostbite", "dragchain", "mimic", "limpet"];
const CORES = ["mortar", "grapnel", "tesla", "capacitor", "compound", "lance"];
const MODS = ["flak", "spotter"];
const WAVE = [...GATES, ...FACTORIES, ...CORES, ...MODS];
const WAVE_STOCK: Record<string, [string, string, number]> = {
  tollbooth: ["ironmonger", "common", 3], sifter: ["alchemist", "common", 3],
  surge: ["tinker", "rare", 5], sorting: ["tinker", "epic", 7],
  riveter: ["ironmonger", "rare", 5], heatjacket: ["quartermaster", "rare", 5],
  scrapper: ["scrapper", "rare", 6], sabot: ["quartermaster", "epic", 9],
  frostbite: ["arcane", "rare", 7], dragchain: ["scrapper", "common", 5],
  mimic: ["arcane", "legendary", 11], limpet: ["scrapper", "epic", 8],
  mortar: ["ironmonger", "rare", 6], grapnel: ["scrapper", "rare", 5],
  tesla: ["arcane", "epic", 8], capacitor: ["arcane", "epic", 7],
  compound: ["gunsmith", "epic", 7], lance: ["arcane", "legendary", 10],
  flak: ["quartermaster", "rare", 5], spotter: ["gunsmith", "rare", 5],
};
const p = (id = 900): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0,
  shock: false, prior: 0, factory: 1, copy: false });
const target = (s: SideState, kind: Target["kind"], ref: number, cell = -1): Target => {
  const found = s.targets.find((t) => t.kind === kind && t.ref === ref && t.cell === cell);
  if (!found) throw new Error(`target ${kind}:${ref}:${cell}`);
  return found;
};
function until(bt: Battle, seconds: number): void { while (bt.t < seconds - 1e-9 && !bt.over) bt.step(); }
function rig(def: string, stars: number, payload = p()): { bt: Battle; a: BeltAmmo } {
  const bt = new Battle(bench([[def, 4, 3, stars]]), barge(), 17);
  bt.sides[0].factories[0].timer = 1000;
  bt.sides[0].gates[0].online = true;
  const a = { p: payload, s: 2 * CELL + 5, processed: 1, blocked: false };
  bt.sides[0].routes[0].ammo.push(a);
  until(bt, 0.12);
  return { bt, a };
}
function fitted(id: string, stars: number, foe: Build = barge(), payload = p(), seed = 8): Battle {
  const bt = new Battle(bench([], [[id, stars]]), foe, seed);
  bt.sides[0].factories[0].timer = 1000;
  const tu = bt.sides[0].turrets[0];
  tu.stack.push(payload);
  tu.phase = "fire";
  bt.step();
  return bt;
}

describe("wave-2 stock and live star data", () => {
  it("has the complete buyable catalogue and no dead merchant offer", () => {
    expect(WAVE).toHaveLength(20);
    const counts = ["gate", "factory", "core", "mod"].map((kind) =>
      Object.values(ITEMS).filter((d) => d.kind === kind && d.merchant).length);
    expect(counts).toEqual([23, 13, 13, 7]);
    for (const id of WAVE) {
      const d = ITEMS[id];
      expect([d.merchant, d.rarity, d.price], id).toEqual(WAVE_STOCK[id]);
      expect(d.merchant, id).toBeTruthy();
      expect(d.price, id).toBeGreaterThan(0);
      expect(itemsSoldBy(d.merchant!).some((stock) => stock.id === id), id).toBe(true);
      expect(d.desc.every((line) => line.length <= 20), id).toBe(true);
      expect([1, 2, 3].map((s) => valueOf(id, s)), id).toEqual([d.price, d.price * 2, d.price * 4]);
      expect(starEffectLine(id, 1), id).not.toBe("");
      expect(starEffectLine(id, 2), id).not.toBe("");
      expect(starEffectLine(id, 3), id).not.toBe("");
    }
  });

  it("puts each wave-2 part in an actual caravan offer that can be bought", () => {
    const missing = new Set(WAVE);
    for (let seed = 1; seed <= 4000 && missing.size; seed++) {
      const run = newRun("furnace", seed);
      run.day = 10;
      rollShop(run);
      for (const [wi, wagon] of run.shop.wagons.entries()) for (const [oi, offer] of wagon.offers.entries()) {
        if (!missing.has(offer.def)) continue;
        expect(wagon.merchant).toBe(ITEMS[offer.def].merchant);
        expect(offer.price).toBe(ITEMS[offer.def].price);
        run.gold = offer.price;
        expect(buyOffer(run, wi, oi).ok, offer.def).toBe(true);
        expect(run.inventory.some((item) => item.def === offer.def), offer.def).toBe(true);
        missing.delete(offer.def);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("matches every named star metric and scales core flat numbers only", () => {
    const read = (id: string, fn: (s: number) => unknown) => [1, 2, 3].map(fn);
    expect(read("tollbooth", (s) => effectAt("tollbooth", s).gate?.toll)).toEqual([2, 4, 7]);
    expect(read("sifter", (s) => effectAt("sifter", s).gate?.sift)).toEqual([1, "all", "all"]);
    expect(read("surge", (s) => effectAt("surge", s).gate?.pulse?.speed)).toEqual([3, 4, 5]);
    expect(read("sorting", (s) => effectAt("sorting", s).gate?.sort)).toEqual([{ every: 3, copies: 2 }, { every: 2, copies: 2 }, { every: 2, copies: 3 }]);
    expect(read("riveter", (s) => effectAt("riveter", s).gate?.repair)).toEqual([0.6, 1.3, 2.1]);
    expect(read("heatjacket", (s) => effectAt("heatjacket", s).gate?.heat)).toEqual([0.4, 0.9, 1.4]);
    expect(read("scrapper", (s) => effectAt("scrapper", s).factory?.scrapFlat)).toEqual([3, 6.5, 10.5]);
    expect(read("sabot", (s) => effectAt("sabot", s).factory?.interval)).toEqual([6, 2.8, 1.9]);
    expect(read("frostbite", (s) => effectAt("frostbite", s).factory?.round)).toEqual([
      { kind: "frost", seconds: 2.5, spread: 0 }, { kind: "frost", seconds: 2.75, spread: 1 }, { kind: "frost", seconds: 3, spread: 2 }]);
    expect(read("dragchain", (s) => effectAt("dragchain", s).factory?.round)).toEqual([
      { kind: "drag", mul: 0.6, seconds: 3 }, { kind: "drag", mul: 0.4, seconds: 4.4 }, { kind: "drag", mul: 0.3, seconds: 6 }]);
    expect(read("mimic", (s) => effectAt("mimic", s).factory?.intervalMul)).toEqual([1.4, 1, 0.8]);
    expect(read("limpet", (s) => effectAt("limpet", s).factory?.round?.kind === "limpet" ? effectAt("limpet", s).factory!.round!.blast : 0)).toEqual([8, 18, 28]);
    expect(read("mortar", (s) => effectAt("mortar", s).core?.splash)).toEqual([1, 2, 3]);
    expect(read("grapnel", (s) => effectAt("grapnel", s).core?.rip)).toEqual([1, 2, 3]);
    expect(read("tesla", (s) => effectAt("tesla", s).core?.arcs)).toEqual([1, 2, 3]);
    expect(read("capacitor", (s) => effectAt("capacitor", s).core?.perSecond)).toEqual([2, 4.4, 7]);
    expect(read("compound", (s) => effectAt("compound", s).core?.mult)).toEqual([1.15, 1.33, 1.52]);
    expect(read("lance", (s) => effectAt("lance", s).core?.columns)).toEqual([1, 2, 3]);
    expect(read("flak", (s) => effectAt("flak", s).mod?.intercept)).toEqual([0.25, 0.55, 0.85]);
    expect(read("spotter", (s) => effectAt("spotter", s).mod?.factoryWeight)).toEqual([undefined, 2, 3]);
    const light: Build = { ...barge(), mods: [{ uid: 99, def: "capacitor", turret: 0, stars: 3 }] };
    expect(resolveCore(light, 0).spec.perSecond).toBeCloseTo(7 * 0.55);
    expect(resolveCore(light, 0).spec.maxSeconds).toBe(5);
  });
});

describe("wave-2 rigs through BELTSIDE arrows", () => {
  it("TOLLBOOTH guards its reached route and at star 3 its factory", () => {
    for (const stars of [1, 2, 3]) {
      const { bt } = rig("tollbooth", stars);
      const s = bt.sides[0], g = s.gates[0];
      const hit = (t: Target) => (bt as any).disrupt(s, t, 1, "shock") as boolean;
      const belt = target(s, "belt", 0, 2), factory = target(s, "factory", 1);
      expect(hit(factory)).toBe(stars < 3);
      if (stars < 3) s.factories[0].disrupted = 0;
      const before = g.tolls;
      expect(hit(belt)).toBe(false);
      expect(g.tolls).toBe(before - 1);
    }
  });
  it("SIFTER removes ordered marks and gives its star perks", () => {
    for (const stars of [1, 2, 3]) {
      const payload = p(); payload.debuffs = { chill: true, snag: true, sap: true };
      const { a } = rig("sifter", stars, payload);
      expect(a.p.debuffs).toEqual(stars === 1 ? { snag: true, sap: true } : {});
      expect(a.p.flat).toBe([0, 3, 6][stars - 1]);
    }
    expect(rig("sifter", 3).a.p.flat).toBe(1);
  });
  it("SURGE pulses route speed and its later stars pay for a ridden pulse", () => {
    for (const stars of [1, 2, 3]) {
      const { bt, a } = rig("surge", stars);
      const speed = effectAt("surge", stars).gate!.pulse!.speed;
      expect(bt.sides[0].routes[0].speedAt[3]).toBe(speed);
      until(bt, 1.3);
      expect(bt.sides[0].routes[0].speedAt[3]).toBe(1);
      expect(a.p.flat).toBeGreaterThanOrEqual(stars - 1);
    }
  });
  it("SORTING ARM copies every Nth full-strength slug", () => {
    for (const stars of [1, 2, 3]) {
      const bt = new Battle(bench([["sorting", 4, 3, stars]]), barge(), 9);
      const s = bt.sides[0], g = s.gates[0], r = s.routes[0]; g.online = true; s.factories[0].timer = 1000;
      const hit = r.gateAt[2][0];
      const apply = (id: number) => (bt as any).applyHit(s, { p: p(id), s: 30, processed: 2, blocked: false }, hit) as BeltAmmo[];
      expect(apply(1)).toHaveLength(0);
      expect(apply(2)).toHaveLength(stars === 1 ? 0 : stars === 2 ? 1 : 2);
      if (stars === 1) expect(apply(3)).toHaveLength(1);
    }
  });
  it("RIVETER repairs bounded hull and HEAT JACKET grows damage after the hit", () => {
    for (const stars of [1, 2, 3]) {
      const healed = new Battle(bench([["riveter", 4, 3, stars]]), barge(), 9);
      healed.sides[0].gates[0].online = true;
      healed.sides[0].hull.hp -= 10;
      const r = healed.sides[0].routes[0];
      (healed as any).applyHit(healed.sides[0], { p: p(), s: 30, processed: 2, blocked: false }, r.gateAt[2][0]);
      expect(healed.sides[0].hull.max - healed.sides[0].hull.hp).toBeCloseTo(10 - [0.6, 1.3, 2.1][stars - 1]);
      const hot = rig("heatjacket", stars);
      expect(hot.a.p.heat).toBe([0.4, 0.9, 1.4][stars - 1]);
      until(hot.bt, 0.4);
      expect(hot.a.p.heatBonus).toBeGreaterThan(0);
      expect(estimateRoute(bench([["heatjacket", 4, 3, stars]]), 0).dmg).toBeGreaterThan(estimateRoute(bench(), 0).dmg);
    }
  });
});

describe("wave-2 factories and cores", () => {
  it("stamps each new factory's real ammo and resolves MIMIC's hero signature", () => {
    for (const id of FACTORIES) for (const stars of [1, 2, 3]) {
      const bt = new Battle(factoryBench(id, stars, { only: true }), barge(), 21);
      until(bt, 0.36);
      const f = bt.sides[0].factories.find((x) => x.def.id === id)!;
      const slug = bt.sides[0].routes[0].ammo[0]?.p;
      expect(slug, `${id} ${stars}`).toBeDefined();
      expect(slug!.ammo).toBe(id === "mimic" ? "cinder" : id === "scrapper" ? "plain" : id === "dragchain" ? "drag" : id === "frostbite" ? "frost" : id);
      if (["sabot", "frostbite", "dragchain", "limpet"].includes(id)) expect(slug!.harass?.kind).toBe(slug!.ammo === "frost" ? "frost" : slug!.ammo === "drag" ? "drag" : slug!.ammo);
      if (id === "scrapper") expect(slug!.flat).toBe([3, 6.5, 10.5][stars - 1]);
      if (id === "mimic") {
        expect(f.def.factory!.interval).toBeCloseTo(1.25 * [1.4, 1, 0.8][stars - 1]);
        expect(outputsAt("mimic", stars)).toBe(stars === 3 ? 2 : 1);
      }
    }
    for (const stars of [1, 2, 3]) {
      const bt = new Battle(factoryLight("mimic", stars), barge(), 21);
      until(bt, 0.36);
      const f = bt.sides[0].factories.find((x) => x.def.id === "mimic")!;
      expect(f.def.factory!.ammo).toBe("thread");
      expect(bt.sides[0].routes[0].ammo[0].p.ammo).toBe("thread");
      expect(f.def.factory!.interval).toBeCloseTo(ITEMS.loom.factory!.interval * [1.4, 1, 0.8][stars - 1]);
    }
    const twin = gantryWeaver(3, 2); twin.items[1].def = "mimic";
    const bt = new Battle(twin, barge(), 21);
    until(bt, 2);
    expect(bt.sides[0].factories.find((f) => f.def.id === "mimic")!.routes).toHaveLength(2);
    expect(bt.sides[0].routes.every((r) => r.ammo.length > 0)).toBe(true);
  });
  it("SCRAPPER banks accepted effects only, and BIG HAUL pays twice for a wreck", () => {
    for (const stars of [1, 3]) {
      const atk = factoryBench("scrapper", stars, { only: true });
      const def = bench([["tollbooth", 4, 3, 1]]);
      const bt = new Battle(atk, def, 4);
      const s = bt.sides[1], g = s.gates[0], f = bt.sides[0].factories.find((x) => x.def.id === "scrapper")!;
      g.online = true;
      const t = target(s, "gate", g.uid);
      (bt as any).roundImpact(s, t, { kind: "sabot" }, 0);
      expect(bt.sides[0].harassAccepted).toBe(0);
      g.tolls = 0;
      (bt as any).roundImpact(s, t, { kind: "sabot" }, 0);
      expect(bt.sides[0].harassAccepted).toBe(1);
      bt.step();
      expect(f.triggerQueue + f.produced).toBe(stars === 3 ? 2 : 1);
    }
  });
  it("SABOT's faster stars stamp more rounds, FROST spreads, and DRAG deepens its segment slow", () => {
    const stamps: number[] = [];
    for (const stars of [1, 2, 3]) {
      const sabot = new Battle(factoryBench("sabot", stars, { only: true }), barge(), 11);
      until(sabot, 8.1);
      stamps.push(sabot.sides[0].factories.find((f) => f.def.id === "sabot")!.produced);

      const frost = new Battle(bench(), bench([["whetstone", 4, 3, 1]]), 11);
      const fs = frost.sides[1], ft = target(fs, "belt", 0, 2);
      (frost as any).roundImpact(fs, ft, effectAt("frostbite", stars).factory!.round!, 0);
      expect(fs.routes[0].cellFrozen[2]).toBe([2.5, 2.75, 3][stars - 1]);
      expect(frost.events.filter((e) => e.type === "freeze")).toHaveLength(stars);

      const drag = new Battle(bench(), bench([["whetstone", 4, 3, 1]]), 11);
      const ds = drag.sides[1], dt = target(ds, "belt", 0, 2);
      (drag as any).roundImpact(ds, dt, effectAt("dragchain", stars).factory!.round!, 0);
      expect(ds.routes[0].cellSlow[2]).toEqual({ mul: [0.6, 0.4, 0.3][stars - 1], t: [3, 4.4, 6][stars - 1] });
    }
    expect(stamps[0]).toBeLessThan(stamps[1]);
    expect(stamps[1]).toBeLessThan(stamps[2]);
  });
  it("LIMPET detonations deal each star's blast and gain timed stalls at stars 2 and 3", () => {
    for (const stars of [1, 2, 3]) {
      const bt = new Battle(bench(), barge(), 12);
      bt.sides[0].factories[0].timer = 1000;
      const foe = bt.sides[1], machine = target(foe, "factory", foe.factories[0].uid);
      const hp = foe.hull.hp;
      (bt as any).roundImpact(foe, machine, effectAt("limpet", stars).factory!.round!, 0);
      until(bt, 2.95);
      expect(foe.hull.hp).toBe(hp);
      until(bt, 3.05);
      expect(hp - foe.hull.hp).toBe([8, 18, 28][stars - 1]);
      expect(foe.factories[0].disrupted).toBeGreaterThanOrEqual([0, 0.9, 1.5][stars - 1]);
      expect(foe.factories[0].disrupted).toBeLessThanOrEqual([0, 1, 1.6][stars - 1]);
    }
  });
  it("special foundry shots telegraph, freeze or slow, and Limpets detonate later", () => {
    for (const id of ["sabot", "frostbite", "dragchain", "limpet"]) {
      const bt = new Battle(factoryBench(id, 3, { only: true }), bench([["whetstone", 4, 3, 1]]), 8);
      const s = bt.sides[0], tu = s.turrets[0];
      const slug = p(); slug.ammo = id === "frostbite" ? "frost" : id === "dragchain" ? "drag" : id;
      slug.harass = effectAt(id, 3).factory!.round!;
      tu.stack.push(slug); tu.phase = "fire"; bt.step();
      const shot = bt.projectiles[0];
      expect(shot.flight).toBeGreaterThan(1.2);
      expect(bt.events.some((e) => e.type === "telegraph")).toBe(true);
      shot.target = target(bt.sides[1], "belt", 0, 2);
      until(bt, shot.flight + 0.05);
      const foe = bt.sides[1];
      if (id === "sabot") expect(foe.routes[0].cellDisrupt[2]).toBeGreaterThan(0);
      if (id === "frostbite") expect(foe.routes[0].cellFrozen[2]).toBeGreaterThan(0);
      if (id === "dragchain") expect(foe.routes[0].cellSlow[2].t).toBeGreaterThan(0);
      if (id === "limpet") { expect(foe.limpets).toHaveLength(1); until(bt, shot.flight + 3.1); expect(foe.limpets).toHaveLength(0); }
    }
  });
  it("MORTAR, GRAPNEL, TESLA, CAPACITOR, COMPOUND and LANCE alter a live shot", () => {
    for (const stars of [1, 2, 3]) {
      const mortar = fitted("mortar", stars, bench());
      const mp = mortar.projectiles[0]; expect(mp.splash).toBe(stars); expect(mp.flight).toBeGreaterThan(1.2);
      until(mortar, mp.flight + 0.05);
      expect(mortar.events.filter((e) => e.type === "splash")).toHaveLength(stars);
      const grapnel = fitted("grapnel", stars, bench());
      const gp = grapnel.projectiles[0]; expect(gp.payload.rip).toEqual({ count: stars, reach: stars });
      const tesla = fitted("tesla", stars, bench());
      const tp = tesla.projectiles[0]; expect(tp.tesla?.arcs).toBe(stars);
      until(tesla, tp.flight + 0.05);
      expect(tesla.events.filter((e) => e.type === "arc")).toHaveLength(stars);
      const cap = new Battle(bench([], [["capacitor", stars]]), barge(), 8);
      cap.sides[0].factories[0].timer = 1000;
      until(cap, 2);
      const ct = cap.sides[0].turrets[0]; expect(ct.charge).toBeCloseTo(2);
      ct.stack.push(p()); ct.phase = "fire"; cap.step();
      expect(cap.projectiles[0].dmg).toBeCloseTo(3 + 2 * [2, 4.4, 7][stars - 1]);
      const comp = new Battle(bench([], [["compound", stars]]), barge(), 8);
      comp.sides[0].factories[0].timer = 1000;
      const ctu = comp.sides[0].turrets[0]; ctu.stack.push(p(1), p(2)); comp.step();
      expect(comp.projectiles).toHaveLength(1);
      expect(comp.projectiles[0].dmg).toBeCloseTo(6 * [1.15, 1.33, 1.52][stars - 1]);
      const lance = fitted("lance", stars, bench());
      const lp = lance.projectiles[0]; expect(lp.lance?.columns).toBe(stars);
      until(lance, lp.flight + 0.05);
      expect(lance.events.some((e) => e.type === "lance")).toBe(true);
    }
  });
  it("GRAPNEL rips one, two or three real belt loads and ★3 banks its salvage perk", () => {
    for (const stars of [1, 2, 3]) {
      const bt = fitted("grapnel", stars, bench());
      const foe = bt.sides[1], route = foe.routes[0];
      route.ammo.length = 0;
      for (const [id, s] of [[1, 31], [2, 43], [3, 55], [4, 79]])
        route.ammo.push({ p: p(id), s, processed: 1, blocked: false });
      const shot = bt.projectiles[0], hit = target(foe, "belt", 0, 2);
      (bt as any).impact({ ...shot, target: hit, tx: hit.x, ty: hit.y });
      expect(route.ammo.map((a) => a.p.id)).toEqual([1, 2, 3, 4].slice(stars));
      expect(bt.sides[0].turrets[0].salvage).toBe(stars === 3 ? 3 : 0);
    }
  });
  it("COMPOUND keeps both loads' Burn and Poison in its one shell", () => {
    for (const stars of [1, 2, 3]) {
      const bt = new Battle(bench([], [["compound", stars]]), barge(), 8);
      bt.sides[0].factories[0].timer = 1000;
      const first = p(1), second = p(2);
      first.burn = 2; first.poison = 3; first.shock = true;
      second.burn = 4; second.poison = 5; second.static = true; second.staticTime = 1.2;
      const tu = bt.sides[0].turrets[0]; tu.stack.push(first, second);
      bt.step();
      const shot = bt.projectiles[0];
      expect(bt.projectiles).toHaveLength(1);
      expect(shot.burn).toBe(6);
      expect(shot.payload.poison).toBe(8);
      expect(shot.payload.shock).toBe(true);
      expect(shot.payload.staticTime).toBe(1.2);
      const hull = bt.sides[1].hull;
      (bt as any).impact({ ...shot, target: { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 } });
      expect(hull.poison.stacks).toBe(8);
      expect(hull.burns.at(-1)?.dps).toBe(6);
    }
  });
  it("LODESTAR LANCE strikes progressively wider live target columns", () => {
    const counts: number[] = [];
    for (const stars of [1, 2, 3]) {
      const foeBuild = barge();
      for (let col = 0; col < 3; col++) foeBuild.items.push({ uid: 100 + col, def: "whetstone", x: col, y: 1 });
      const bt = fitted("lance", stars, foeBuild);
      const shot = bt.projectiles[0];
      const foe = bt.sides[1];
      const firstCol = Math.min(...foe.targets.map((t) => Math.floor(t.x / CELL)));
      const expected = foe.targets.filter((t) => {
        const col = Math.floor(t.x / CELL);
        return col >= firstCol && col < firstCol + stars;
      }).length;
      (bt as any).impact({ ...shot, lance: { ...shot.lance!, col: firstCol } });
      const landed = bt.events.filter((e) => e.type === "lance").length;
      expect(landed).toBe(expected);
      counts.push(landed);
    }
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });
  it("TOLLBOOTH blocks GRAPNEL from fizzling a keg before any rip is accepted", () => {
    const foe = bench([["tollbooth", 4, 4, 1], ["keg", 4, 3, 1]]);
    const bt = fitted("grapnel", 1, foe);
    const s = bt.sides[1], toll = s.gates.find((g) => g.def.id === "tollbooth")!;
    const keg = s.gates.find((g) => g.def.id === "keg")!;
    toll.online = keg.online = true;
    s.routes[0].ammo.length = 0;
    const hit = target(s, "gate", keg.uid), shot = bt.projectiles[0];
    (bt as any).impact({ ...shot, target: hit, tx: hit.x, ty: hit.y });
    expect(toll.tolls).toBe(1);
    expect(keg.consumed).toBe(false);
    expect(bt.sides[0].harassAccepted).toBe(0);
    toll.tolls = 0;
    (bt as any).impact({ ...shot, target: hit, tx: hit.x, ty: hit.y });
    expect(keg.consumed).toBe(true);
    expect(bt.sides[0].harassAccepted).toBe(1);
  });
});

describe("wave-2 gear and stability", () => {
  it("FLAK resolves from fitted stars and intercepts one real special round", () => {
    for (const stars of [1, 2, 3]) {
      const foe = bench([], [["flak", stars]]);
      const bt = new Battle(bench(), foe, 8);
      expect(bt.sides[1].flak).toBe([0.25, 0.55, 0.85][stars - 1]);
      bt.sides[1].flak = 1;
      const pr = fitted("grapnel", 1, foe).projectiles[0];
      bt.projectiles.push({ ...pr, from: 0, t: 0, flakChecked: false });
      const hp = bt.sides[1].hull.hp;
      until(bt, pr.flight + 0.05);
      expect(bt.events.filter((e) => e.type === "flak")).toHaveLength(1);
      expect(bt.sides[1].hull.hp).toBe(hp);
    }
  });
  it("FLAK's seeded intercept rate rises at each star, one roll per incoming round", () => {
    for (const stars of [1, 2, 3]) {
      let stopped = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const bt = new Battle(bench([], [["grapnel", 1]]), bench([], [["flak", stars]]), seed);
        bt.sides[0].factories[0].timer = bt.sides[1].factories[0].timer = 1000;
        const turret = bt.sides[0].turrets[0]; turret.stack.push(p()); turret.phase = "fire";
        bt.step();
        const shot = bt.projectiles[0];
        (bt as any).flight(shot.flight / 2);
        (bt as any).flight(shot.flight / 2);
        const flakEvents = bt.events.filter((e) => e.type === "flak");
        expect(flakEvents.length).toBeLessThanOrEqual(1);
        if (flakEvents.length) stopped++;
      }
      expect(stopped / 400).toBeGreaterThan([0.18, 0.48, 0.78][stars - 1]);
      expect(stopped / 400).toBeLessThan([0.32, 0.62, 0.92][stars - 1]);
    }
  });
  it("SPOTTER changes only its fitted turret's targeting, with EAGLE EYE never picking bare hull", () => {
    const first = fitted("spotter", 1);
    const second = fitted("spotter", 2);
    const third = fitted("spotter", 3);
    expect(first.sides[0].turrets[0].rerolls).toBe(1);
    expect(second.sides[0].turrets[0].factoryWeight).toBe(2);
    expect(third.sides[0].turrets[0].alwaysMachine).toBe(true);
    expect(third.projectiles[0].target.kind).not.toBe("hull");
  });
  it("SPOTTER's second reroll and factory weights produce distinct seeded target counts", () => {
    const counts: { hull: number; factory: number }[] = [];
    for (const stars of [1, 2, 3]) {
      const count = { hull: 0, factory: 0 };
      for (let seed = 1; seed <= 400; seed++) {
        const hit = fitted("spotter", stars, barge(), p(), seed).projectiles[0].target;
        if (hit.kind === "hull") count.hull++;
        if (hit.kind === "factory") count.factory++;
      }
      counts.push(count);
    }
    expect(counts[0].hull).toBeGreaterThan(counts[1].hull);
    expect(counts[1].hull).toBeGreaterThan(counts[2].hull);
    expect(counts[2].hull).toBe(0);
    expect(counts[2].factory).toBeGreaterThan(counts[1].factory);
    expect(counts[1].factory).toBeGreaterThan(counts[0].factory);
  });
  it("replays seeded new builds identically", () => {
    const b = factoryBench("frostbite", 2, { gates: [["heatjacket", 5, 3, 2]], mods: [["tesla", 2]], only: true });
    const a = new Battle(b, bench([["tollbooth", 4, 3, 2]]), 123);
    const c = new Battle(b, bench([["tollbooth", 4, 3, 2]]), 123);
    until(a, 12); until(c, 12);
    expect([a.sides[0].stats.damage, a.sides[1].stats.damage, a.sides[1].gates[0].tolls, a.sides[0].stats.produced])
      .toEqual([c.sides[0].stats.damage, c.sides[1].stats.damage, c.sides[1].gates[0].tolls, c.sides[0].stats.produced]);
  });
});
