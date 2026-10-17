import { describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload, type SideState, type Target } from "../src/sim/battle";
import { AMMO, CELL, ITEMS, itemsSoldBy, rateMul } from "../src/sim/content";
import { DORMANT_ITEMS } from "../src/sim/races/data"; // FLIP-X2: SIFTER dormant (REVIEW-NUM3 answer 2)
import { roundHalfUp } from "../src/sim/pct"; // NUM-2 (REQ-BFG-047): MIMIC's speed, rounded half up once
import { estimateRoute, type Build } from "../src/sim/deck";
import { resolveCore } from "../src/sim/cores";
import { effectAt, outputsAt, valueOf } from "../src/sim/stars";
import { abilityText, gist } from "../src/ui/abilityText"; // 0.6.2t: the glossary
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
    // REQ-BFG-021: ESCAPEMENT and LONGCASE are sold to every hero (7 -> 9 mods); 0.8.0 I1 M2 (REPORT-P1 section 13): + wave
    // 3's 8 rigs, 2 factories, 2 cores and 3 mods (was 23, 13, 13, 9)
    // FLIP-X2 (REQ-BFG-069, the sustain switch on): + MEND PRESS (factory), WARD BELL and MENDING LOOM (mods), 15 -> 16 and
    // 12 -> 14; the dormant SIFTER keeps its merchant, so the rigs stay 31 (was [31, 15, 15, 12])
    // SHAPES-1 flip: + NAIL STRIP, EMBER TROUGH (alchemist) and SPIKE RAIL (tinker), the three shaped rigs, 31 -> 34 (was
    // [31, 16, 15, 14]); GANTRY PRESS and ASSEMBLY LINE are reshaped, not added
    // BUMP-1D: + the six plain stat rigs (PLAIN_RIGS) and the six more shaped rigs (SHAPES2), all with a merchant, 34 -> 46
    expect(counts).toEqual([46, 16, 15, 14]);
    for (const id of WAVE) {
      const d = ITEMS[id];
      expect([d.merchant, d.rarity, d.price], id).toEqual(WAVE_STOCK[id]);
      expect(d.merchant, id).toBeTruthy();
      expect(d.price, id).toBeGreaterThan(0);
      // FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER is dormant (DORMANT_ITEMS): it keeps its merchant, price and star data, but
      // its merchant no longer stocks it (was true for all 20)
      expect(itemsSoldBy(d.merchant!).some((stock) => stock.id === id), id).toBe(!DORMANT_ITEMS.has(id));
      expect(d.desc.every((line) => line.length <= 20), id).toBe(true);
      expect([1, 2, 3].map((s) => valueOf(id, s)), id).toEqual([d.price, d.price * 2, d.price * 4]);
      // 0.6.2t: the glossary's text at every star (it replaced starEffectLine's shorthand headline)
      for (const s of [1, 2, 3]) {
        expect(gist(id, s), `${id} ★${s}`).not.toBe("");
        expect(abilityText(id, s).sentences.length, `${id} ★${s}`).toBeGreaterThan(0);
      }
    }
  });

  it("puts each wave-2 part in an actual caravan offer that can be bought", () => {
    // FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER is dormant, so no caravan offers it (checked on every offer walked below); the
    // walk looks for the other 19 (was all 20)
    const missing = new Set(WAVE.filter((id) => !DORMANT_ITEMS.has(id)));
    for (let seed = 1; seed <= 4000 && missing.size; seed++) {
      const run = newRun("furnace", seed);
      run.day = 10;
      rollShop(run);
      for (const [wi, wagon] of run.shop.wagons.entries()) for (const [oi, offer] of wagon.offers.entries()) {
        expect(DORMANT_ITEMS.has(offer.def), `seed ${seed}: ${offer.def} offered`).toBe(false); // FLIP-X2
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
    expect(read("riveter", (s) => effectAt("riveter", s).gate?.heal)).toEqual([6, 13, 21]); // NUM-1: x10 (was [0.6, 1.3, 2.1]); SUS-A: `heal` (was repair)
    expect(read("heatjacket", (s) => effectAt("heatjacket", s).gate?.heat)).toEqual([4, 9, 14]); // NUM-1: x10 (was [0.4, 0.9, 1.4])
    expect(read("scrapper", (s) => effectAt("scrapper", s).factory?.scrapFlat)).toEqual([30, 65, 105]); // NUM-1: x10 (was [3, 6.5, 10.5])
    // NUM-2 (REQ-BFG-047): slugs per 30 s, roundHalfUp(30 / interval) (was interval [6, 2.8, 1.9]; the fixture's rows)
    // Y7b2 (the flip): Y2's ★3 RATE 20 (SHRAPNEL's tile STUNs gone; was [5, 11, 16])
    expect(read("sabot", (s) => effectAt("sabot", s).factory?.speed)).toEqual([5, 11, 20]);
    // NUM-3 (N1 2.2): FROSTBITE's STUN 2 / 3 / 3 s (was 2.5 / 2.75 / 3); HOARFROST's spread 0 / 1 / 2 as before
    expect(read("frostbite", (s) => effectAt("frostbite", s).factory?.round)).toEqual([
      { kind: "frost", seconds: 2, spread: 0 }, { kind: "frost", seconds: 3, spread: 1 }, { kind: "frost", seconds: 3, spread: 2 }]);
    // NUM-3 (R1's STUN fold, N1 2.2): a DRAG CHAIN round STUNs the part it hits for 1 / 2 / 2 s and has no slow `mul` (was
    // a belt slow x0.6 / x0.4 / x0.3 for 3 / 4.4 / 6 s: { kind: "drag", mul, seconds })
    // FLIP-X2 (REVIEW-NUM3 F1): ★3 STUNs 3 s (was 2 s, the same as ★2)
    expect(read("dragchain", (s) => effectAt("dragchain", s).factory?.round)).toEqual([
      { kind: "drag", seconds: 1 }, { kind: "drag", seconds: 2 }, { kind: "drag", seconds: 3 }]);
    // NUM-2 (REQ-BFG-047): a whole rate %, roundHalfUp(100 / mul - 100) (was intervalMul [1.4, 1, 0.8]: -28.6 -> -29, 0, 25)
    expect(read("mimic", (s) => effectAt("mimic", s).factory?.rate)).toEqual([-29, 0, 25]);
    // NUM-1: x10 (was [8, 18, 28]). Y7b2 (the flip): Y2's blast 100 / 230 / 360 (the charge's 20 joins it, the stall's +30 a
    // second; was [80, 180, 280])
    expect(read("limpet", (s) => effectAt("limpet", s).factory?.round?.kind === "limpet" ? effectAt("limpet", s).factory!.round!.blast : 0)).toEqual([100, 230, 360]);
    expect(read("mortar", (s) => effectAt("mortar", s).core?.splash)).toEqual([1, 2, 3]);
    expect(read("grapnel", (s) => effectAt("grapnel", s).core?.rip)).toEqual([1, 2, 3]);
    expect(read("tesla", (s) => effectAt("tesla", s).core?.arcs)).toEqual([1, 2, 3]);
    expect(read("capacitor", (s) => effectAt("capacitor", s).core?.perSecond)).toEqual([20, 44, 70]); // NUM-1: x10 (was [2, 4.4, 7])
    expect(read("compound", (s) => effectAt("compound", s).core?.mult)).toEqual([1.15, 1.33, 1.52]);
    expect(read("lance", (s) => effectAt("lance", s).core?.columns)).toEqual([1, 2, 3]);
    expect(read("flak", (s) => effectAt("flak", s).mod?.intercept)).toEqual([0.25, 0.55, 0.85]);
    // Y7b2 (the flip): SPOTTER's factory weight is gone (Y2; factoryWeight was [undefined, 2, 3]); its live star number is
    // rerolls 1 / 2 / 3
    expect(read("spotter", (s) => effectAt("spotter", s).mod?.rerolls)).toEqual([1, 2, 3]);
    const light: Build = { ...barge(), mods: [{ uid: 99, def: "capacitor", turret: 0, stars: 3 }] };
    // NUM-1: scaleCore's whole % (k 0.55 -> 55%): pct(70, 55) = 38.5, rounded half up once at install (was toBeCloseTo(7 * 0.55))
    expect(resolveCore(light, 0).spec.perSecond).toBe(39);
    // Y7b2 (the flip): CAPACITOR's 5 s cap is gone (Y5), so its check (spec.maxSeconds toBe(5)) is deleted
  });
});

describe("wave-2 rigs through BELTSIDE arrows", () => {
  // Y7b2 (the flip): Y2's TOLLBOOTH covers its belt's factory from ★1 (was ★3 FACTORY GUARD only). Was "TOLLBOOTH guards its
  // reached route and at star 3 its factory"
  it("TOLLBOOTH guards its reached route and its factory", () => {
    for (const stars of [1, 2, 3]) {
      const { bt } = rig("tollbooth", stars);
      const s = bt.sides[0], g = s.gates[0];
      const hit = (t: Target) => (bt as any).disrupt(s, t, 1, "shock") as boolean;
      const belt = target(s, "belt", 0, 2), factory = target(s, "factory", 1);
      // Y7b2 (the flip): was toBe(stars < 3), with the factory's STUN cleared after a landed hit (if (stars < 3) disrupted = 0)
      expect(hit(factory)).toBe(false);
      const before = g.tolls;
      expect(hit(belt)).toBe(false);
      expect(g.tolls).toBe(before - 1);
    }
  });
  // NUM-3 (R1's STUN fold): CHILL and SNAG are gone (PayloadDebuffs = { sap? }; siftDebuffs reads SAP only), so SAP is the
  // one mark left. Was: a payload marked CHILL, SNAG and SAP lost CHILL at ★1 (one mark, in CHILL/SNAG/SAP order: { snag,
  // sap } left) and all three at ★2 / ★3, for 3 x siftFlat (0 / 30 / 60). Now its SAP goes at every star (sift 1 / "all"),
  // for 1 x siftFlat (POLISH / FINE MESH: 0 / 10 / 20, read from the data); and the order's other marks are gone: a frost
  // round and a chain round leave the payload on the tile they hit unmarked (the freeze marked it CHILL, the slow SNAG)
  it("SIFTER removes the SAP mark (the one mark left) and gives its star perks", () => {
    for (const stars of [1, 2, 3]) {
      const payload = p(); payload.debuffs = { sap: true };
      const { a } = rig("sifter", stars, payload);
      expect(a.p.debuffs).toEqual({}); // NUM-3: was stars === 1 ? { snag: true, sap: true } : {}
      // NUM-1: x10 (was [0, 3, 6]). NUM-3: 1 mark x siftFlat 0 / 10 / 20 (was [0, 30, 60]: 3 marks x siftFlat 10 / 20)
      const siftFlat = effectAt("sifter", stars).gate!.siftFlat ?? 0;
      expect(siftFlat > 0, `★${stars} pays`).toBe(stars > 1); // POLISH and FINE MESH pay for the mark
      expect(a.p.flat).toBe(siftFlat);
    }
    for (const id of ["frostbite", "dragchain"]) {
      const bt = new Battle(bench(), bench([["whetstone", 4, 3, 1]]), 11);
      const fs = bt.sides[1], a: BeltAmmo = { p: p(), s: 2 * CELL + 5, processed: 1, blocked: false };
      fs.routes[0].ammo.push(a);
      (bt as any).roundImpact(fs, target(fs, "belt", 0, 2), effectAt(id, 3).factory!.round!, 0);
      expect(fs.routes[0].cellDisrupt[2], id).toBeGreaterThan(0); // the round landed (a STUN)
      expect(a.p.debuffs, id).toBeUndefined(); // NUM-3: no CHILL, no SNAG
    }
    expect(rig("sifter", 3).a.p.flat).toBe(ITEMS.sifter.levels![3]!.gate!.siftClean); // NUM-1: siftClean is flat damage, x10 (was 1)
    expect(ITEMS.sifter.levels![3]!.gate!.siftClean).toBe(10);
  });
  // Y7b2 (the flip): SURGE VALVE's speed pulse is gone (Y3: it sets no belt state; its damage pulse pays every slug on its
  // belts once a period), so the two belt-speed checks are deleted (speedAt[3] toBe the pulse's speed, then 1 after it).
  // Was "SURGE pulses route speed and every star pays for a ridden pulse (0.6.2 FB-B: +1/+2/+3, was 0/1/2)"
  it("SURGE pays every slug on its belt +10 / +20 / +30 a pulse", () => {
    for (const stars of [1, 2, 3]) {
      const { bt, a } = rig("surge", stars);
      until(bt, 1.3);
      expect(a.p.flat).toBe(10 * stars); // one pulse (NUM-1: x10, was stars)
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
      healed.sides[0].hull.hp -= 100; // NUM-1: the hull damage x10 (was 10)
      const r = healed.sides[0].routes[0];
      (healed as any).applyHit(healed.sides[0], { p: p(), s: 30, processed: 2, blocked: false }, r.gateAt[2][0]);
      // NUM-1: whole hull and repair now: exact (was toBeCloseTo(10 - [0.6, 1.3, 2.1][stars - 1]))
      expect(healed.sides[0].hull.max - healed.sides[0].hull.hp).toBe(100 - [6, 13, 21][stars - 1]);
      const hot = rig("heatjacket", stars);
      expect(hot.a.p.heat).toBe([4, 9, 14][stars - 1]); // NUM-1: x10 (was [0.4, 0.9, 1.4])
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
      if (id === "scrapper") expect(slug!.flat).toBe([30, 65, 105][stars - 1]); // NUM-1: x10 (was [3, 6.5, 10.5])
      if (id === "mimic") {
        // NUM-2 (REQ-BFG-047): the hero factory's level-1 speed (KILN 24; was interval 1.25) x MIMIC's rate %, rounded half up
        // once: 17 / 24 / 30, whole, so exact (was interval toBeCloseTo(1.25 * [1.4, 1, 0.8]))
        expect(f.def.factory!.speed).toBe(roundHalfUp(ITEMS.kiln.factory!.speed * rateMul([-29, 0, 25][stars - 1])));
        expect(outputsAt("mimic", stars)).toBe(stars + 1); // bb-0.8.3 (REQ-BFG-042 D1, D3): 2 / 3 / 4 (was 1 / 1 / 2)
      }
    }
    for (const stars of [1, 2, 3]) {
      const bt = new Battle(factoryLight("mimic", stars), barge(), 21);
      until(bt, 0.36);
      const f = bt.sides[0].factories.find((x) => x.def.id === "mimic")!;
      expect(f.def.factory!.ammo).toBe("thread");
      expect(bt.sides[0].routes[0].ammo[0].p.ammo).toBe("thread");
      // NUM-2 (REQ-BFG-047): LOOM's level-1 speed x MIMIC's rate %, rounded half up once: 42 -> 30 / 42 / 53, exact (was
      // interval toBeCloseTo(ITEMS.loom.factory!.interval * [1.4, 1, 0.8]))
      expect(f.def.factory!.speed).toBe(roundHalfUp(ITEMS.loom.factory!.speed * rateMul([-29, 0, 25][stars - 1])));
    }
    const twin = gantryWeaver(3, 2); twin.items[1].def = "mimic";
    const bt = new Battle(twin, barge(), 21);
    until(bt, 2);
    expect(bt.sides[0].factories.find((f) => f.def.id === "mimic")!.routes).toHaveLength(2);
    expect(bt.sides[0].routes.every((r) => r.ammo.length > 0)).toBe(true);
  });
  // Y7b2 (the flip): the test "SCRAPPER banks accepted effects only, and BIG HAUL pays twice for a wreck" is deleted: it banked
  // SABOT wrecks, and harassment is a STUN only now (a wreck is no STUN: TOLLBOOTH spends no toll on it and SCRAPPER doesn't
  // count it), and ★3 BIG HAUL is gone (Y2). SCRAPPER's count of accepted STUNs only: tests/harassment.engine.test.ts ("Toll
  // spends exactly two charges before any stall, and Scrapper sees only the accepted hit")
  // NUM-3 (R1's STUN fold): a FROSTBITE round and a DRAG CHAIN round STUN the part they hit (Battle.disrupt, causes
  // "freeze" and "drag"). Was: a freeze (cellFrozen[2] 2.5 / 2.75 / 3 s, one "freeze" event per frozen part) and a chain
  // slow over the rig-to-rig segment (cellSlow[2] { mul 0.6 / 0.4 / 0.3, t 3 / 4.4 / 6 }). Now the frost round STUNs the
  // tile and HOARFROST's 0 / 1 / 2 nearest parts for round.seconds, and the chain round STUNs the tile it hits, and only
  // that tile, for round.seconds (both read from the data)
  it("SABOT's faster stars stamp more rounds, FROST spreads its STUN, and a DRAG round STUNs only the tile it hits", () => {
    const stamps: number[] = [];
    for (const stars of [1, 2, 3]) {
      const sabot = new Battle(factoryBench("sabot", stars, { only: true }), barge(), 11);
      until(sabot, 8.1);
      stamps.push(sabot.sides[0].factories.find((f) => f.def.id === "sabot")!.produced);

      const frost = new Battle(bench(), bench([["whetstone", 4, 3, 1]]), 11);
      const fs = frost.sides[1], ft = target(fs, "belt", 0, 2);
      const fr = effectAt("frostbite", stars).factory!.round! as { seconds: number };
      (frost as any).roundImpact(fs, ft, fr, 0);
      expect(fs.routes[0].cellDisrupt[2]).toBeCloseTo(fr.seconds); // NUM-3: was cellFrozen[2] toBe [2.5, 2.75, 3][stars - 1]
      // NUM-3: was `stars` "freeze" events; now `stars` STUNs (cause "freeze"): the tile and HOARFROST's spread
      expect(frost.events.filter((e) => e.type === "disrupt" && e.side === 1)).toHaveLength(stars);
      expect(frost.events.filter((e) => e.type === "harass" && e.cause === "freeze")).toHaveLength(stars);
      expect(frost.events.filter((e) => e.type === "freeze")).toHaveLength(0);

      const drag = new Battle(bench(), bench([["whetstone", 4, 3, 1]]), 11);
      const ds = drag.sides[1], dt = target(ds, "belt", 0, 2);
      const dr = effectAt("dragchain", stars).factory!.round! as { seconds: number };
      (drag as any).roundImpact(ds, dt, dr, 0);
      // NUM-3: was cellSlow[2] toEqual { mul: [0.6, 0.4, 0.3], t: [3, 4.4, 6] } (over the segment); now a STUN on tile 2 alone
      expect(ds.routes[0].cellDisrupt[2]).toBeCloseTo(dr.seconds);
      expect(ds.routes.flatMap((r) => r.cellDisrupt.filter((x, i) => x > 0 && !(r.index === 0 && i === 2)))).toEqual([]);
      expect([...ds.gates, ...ds.factories, ...ds.turrets].filter((m) => m.disrupted > 0)).toEqual([]);
      expect(drag.events.filter((e) => e.type === "harass" && e.cause === "drag")).toHaveLength(1);
    }
    expect(stamps[0]).toBeLessThan(stamps[1]);
    expect(stamps[1]).toBeLessThan(stamps[2]);
  });
  // Y7b2 (the flip): Y2's LIMPET: blast 100 / 230 / 360 and no stall, so the three stall checks (the data's stall > 0 at
  // stars 2 and 3, the factory's STUN within 0.1 s under it) are deleted. Was "LIMPET detonations deal each star's blast and
  // gain timed stalls at stars 2 and 3"
  it("LIMPET detonations deal each star's blast", () => {
    for (const stars of [1, 2, 3]) {
      const bt = new Battle(bench(), barge(), 12);
      bt.sides[0].factories[0].timer = 1000;
      const foe = bt.sides[1], machine = target(foe, "factory", foe.factories[0].uid);
      const hp = foe.hull.hp;
      (bt as any).roundImpact(foe, machine, effectAt("limpet", stars).factory!.round!, 0);
      until(bt, 2.95);
      expect(foe.hull.hp).toBe(hp);
      until(bt, 3.05);
      expect(hp - foe.hull.hp).toBe([100, 230, 360][stars - 1]); // NUM-1: x10 (was [8, 18, 28]). Y7b2 (the flip): was [80, 180, 280]
    }
  });
  // NUM-3 (R1's STUN fold): the frost and chain shots STUN the tile they land on (cellDisrupt), as the sabot shot does
  // (was cellFrozen[2] > 0, a freeze, and cellSlow[2].t > 0, a chain slow)
  it("special foundry shots telegraph, STUN the tile they hit, and Limpets detonate later", () => {
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
      if (id === "frostbite") expect(foe.routes[0].cellDisrupt[2]).toBeGreaterThan(0); // NUM-3: was cellFrozen[2] > 0 (FLIP-X1 F4: deleted)
      if (id === "dragchain") expect(foe.routes[0].cellDisrupt[2]).toBeGreaterThan(0); // NUM-3: was cellSlow[2].t > 0
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
      // NUM-1: x10 and whole (perSecond x idle rounded once at the shot), so exact (was toBeCloseTo(3 + 2 * [2, 4.4, 7][stars - 1]))
      expect(cap.projectiles[0].dmg).toBe(30 + 2 * [20, 44, 70][stars - 1]);
      const comp = new Battle(bench([], [["compound", stars]]), barge(), 8);
      comp.sides[0].factories[0].timer = 1000;
      const ctu = comp.sides[0].turrets[0]; ctu.stack.push(p(1), p(2)); comp.step();
      expect(comp.projectiles).toHaveLength(1);
      // NUM-1: (30 + 30) x 115 / 133 / 152 %, rounded half up once: 69, 79.8 -> 80, 91.2 -> 91 (was toBeCloseTo(6 * mult))
      expect(comp.projectiles[0].dmg).toBe([69, 80, 91][stars - 1]);
      const lance = fitted("lance", stars, bench());
      const lp = lance.projectiles[0]; expect(lp.lance?.columns).toBe(stars);
      until(lance, lp.flight + 0.05);
      expect(lance.events.some((e) => e.type === "lance")).toBe(true);
    }
  });
  // Y7b2 (the flip): GRAPNEL ★3's salvage is gone (TurretState.salvage deleted), so its check (salvage toBe(stars === 3 ? 30 :
  // 0)) is deleted. Was "GRAPNEL rips one, two or three real belt loads and ★3 banks its salvage perk"
  it("GRAPNEL rips one, two or three real belt loads", () => {
    for (const stars of [1, 2, 3]) {
      const bt = fitted("grapnel", stars, bench());
      const foe = bt.sides[1], route = foe.routes[0];
      route.ammo.length = 0;
      for (const [id, s] of [[1, 31], [2, 43], [3, 55], [4, 79]])
        route.ammo.push({ p: p(id), s, processed: 1, blocked: false });
      const shot = bt.projectiles[0], hit = target(foe, "belt", 0, 2);
      (bt as any).impact({ ...shot, target: hit, tx: hit.x, ty: hit.y });
      expect(route.ammo.map((a) => a.p.id)).toEqual([1, 2, 3, 4].slice(stars));
    }
  });
  // Y7b2 (the flip): POISON is gone (Payload.poison and HullState.poison deleted), so the loads' poison 3 and 5 and the two
  // poison checks (the shell's payload.poison toBe(8), the hull's poison.stacks toBe(8)) are deleted. Was "COMPOUND keeps both
  // loads' Burn and Poison in its one shell"
  it("COMPOUND keeps both loads' Burn in its one shell", () => {
    for (const stars of [1, 2, 3]) {
      const bt = new Battle(bench([], [["compound", stars]]), barge(), 8);
      bt.sides[0].factories[0].timer = 1000;
      const first = p(1), second = p(2);
      first.burn = 2; first.shock = true;
      second.burn = 4; second.static = true; second.staticTime = 1.2;
      const tu = bt.sides[0].turrets[0]; tu.stack.push(first, second);
      bt.step();
      const shot = bt.projectiles[0];
      expect(bt.projectiles).toHaveLength(1);
      expect(shot.burn).toBe(6);
      expect(shot.payload.shock).toBe(true);
      expect(shot.payload.staticTime).toBe(1.2);
      const hull = bt.sides[1].hull;
      (bt as any).impact({ ...shot, target: { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 } });
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
  // Y7b2 (the flip): the test "TOLLBOOTH blocks GRAPNEL from fizzling a keg before any rip is accepted" is deleted: a rip is no
  // STUN now (TOLLBOOTH spends no toll on it and no SCRAPPER counts it), and a GRAPNEL hit no longer disarms a POWDER KEG (Y2)
});

describe("wave-2 gear and stability", () => {
  // Y7b2 (the flip): SideState.flak is deleted (each FLAK SCREEN rolls on its own: SideState.flaks, Y2), so the checks point
  // at flaks; and a GRAPNEL shot carries no STUN, so no FLAK rolls for it now (harassment is a STUN only): the round is a
  // TESLA shot (its arc STUNs), was a GRAPNEL shot
  it("FLAK resolves from fitted stars and intercepts one real special round", () => {
    for (const stars of [1, 2, 3]) {
      const foe = bench([], [["flak", stars]]);
      const bt = new Battle(bench(), foe, 8);
      expect(bt.sides[1].flaks).toEqual([[0.25, 0.55, 0.85][stars - 1]]); // Y7b2 (the flip): was flak toBe([0.25, 0.55, 0.85][stars - 1])
      bt.sides[1].flaks = [1]; // Y7b2 (the flip): was flak = 1
      const pr = fitted("tesla", 1, foe).projectiles[0]; // Y7b2 (the flip): was fitted("grapnel", 1, foe)
      bt.projectiles.push({ ...pr, from: 0, t: 0, flakChecked: false });
      const hp = bt.sides[1].hull.hp;
      until(bt, pr.flight + 0.05);
      expect(bt.events.filter((e) => e.type === "flak")).toHaveLength(1);
      expect(bt.sides[1].hull.hp).toBe(hp);
    }
  });
  // Y7b2 (the flip): a GRAPNEL shot carries no STUN, so no FLAK rolls for it now (harassment is a STUN only): the incoming
  // round is a TESLA shot (its arc STUNs), was a GRAPNEL shot
  it("FLAK's seeded intercept rate rises at each star, one roll per incoming round", () => {
    for (const stars of [1, 2, 3]) {
      let stopped = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const bt = new Battle(bench([], [["tesla", 1]]), bench([], [["flak", stars]]), seed); // Y7b2 (the flip): was [["grapnel", 1]]
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
  // Y7b2 (the flip): SPOTTER's ★2 factory weight and ★3 EAGLE EYE's "always a part" are gone (Y2); it re-aims 1 / 2 / 3
  // times. ★2's and ★3's checks point at rerolls (were factoryWeight toBe(2) and alwaysMachine toBe(true)); EAGLE EYE's (the
  // ★3 shot's target is not bare hull) is deleted. Was "SPOTTER changes only its fitted turret's targeting, with EAGLE EYE
  // never picking bare hull"
  it("SPOTTER changes only its fitted turret's targeting", () => {
    const first = fitted("spotter", 1);
    const second = fitted("spotter", 2);
    const third = fitted("spotter", 3);
    expect(first.sides[0].turrets[0].rerolls).toBe(1);
    expect(second.sides[0].turrets[0].rerolls).toBe(2); // Y7b2 (the flip): was factoryWeight toBe(2)
    expect(third.sides[0].turrets[0].rerolls).toBe(3); // Y7b2 (the flip): was alwaysMachine toBe(true)
  });
  // Y7b2 (the flip): ★3 EAGLE EYE's "always a part" is gone (Y2), so its check (counts[2].hull toBe(0)) is deleted; the counts
  // come from the 1 / 2 / 3 rerolls (the factory weights are gone). Was "SPOTTER's second reroll and factory weights produce
  // distinct seeded target counts"
  it("SPOTTER's rerolls produce distinct seeded target counts", () => {
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
