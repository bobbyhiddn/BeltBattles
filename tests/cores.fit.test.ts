// 0.6.1b M3: fitting, swapping, removing and merging turret cores (ARSENAL.md §2.1 rules 1 and 6, §4.1,
// §10 items 2, 3 and 5), and the validator's one core and one mod per turret (brief 0.6.1b items 3 and 4).
import { describe, expect, it } from "vitest";
import { ghostOf } from "../src/game/day";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { gainModule, unfusedInRun } from "../src/game/fuse";
import { buyOffer, fitCore, migrateRun, newRun, storeMod, type Run } from "../src/game/run";
import { resolveCore } from "../src/sim/cores";
import { coreFor, gearFor, turretHasFreeHardpoint } from "../src/sim/deck";
import { makeTurret } from "../src/sim/battle";
import { HEROES } from "../src/sim/content";
import { checkSnapshot } from "../src/net/snapshot";
import { buildCost, validateBuild } from "../src/net/validate";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const coreOn = (run: Run, t: number) => { const m = coreFor(run.build, t); return m ? `${m.def}${m.stars ? `*${m.stars}` : ""}` : "signature"; };
const cargo = (run: Run) => run.inventory.map((i) => `${i.def}${i.stars ? `*${i.stars}` : ""}`).sort();
/** A caravan offer of `def` at wagon 0 slot 0 (the shop roll itself is not under test). */
function offer(run: Run, def: string, price = 1): void {
  run.gold = 99;
  run.shop.wagons = [{ merchant: "gunsmith", offers: [{ def, price, sold: false }] }];
}

describe("fitting and swapping", () => {
  it("gainModule onto a turret fits the core in its socket; a bought core already there goes to cargo (a swap)", () => {
    const run = newRun("weaver", 3, "fit");
    run.inventory = [];
    const a = gainModule(run, "scatter", { turret: 1 });
    expect([a.where, coreOn(run, 1), coreOn(run, 0)]).toEqual(["turret", "scatter", "signature"]);
    gainModule(run, "calibrate", { turret: 1 }); // gear on the same turret: its hardpoint, not the socket
    const b = gainModule(run, "drake", { turret: 1 });
    expect([b.steps, coreOn(run, 1), gearFor(run.build, 1)?.def, cargo(run)]).toEqual([[], "drake", "calibrate", ["scatter"]]);
    expect(unfusedInRun(run)).toEqual([]);
  });

  it("buying a core onto a turret swaps; onto its own fitted twin it merges there (no swap)", () => {
    const run = newRun("furnace", 4, "buy");
    run.inventory = [];
    offer(run, "hullbreaker");
    expect(buyOffer(run, 0, 0, { turret: 0 }).gain?.where).toBe("turret");
    offer(run, "hullbreaker");
    const g = buyOffer(run, 0, 0, { turret: 0 }).gain!;
    expect([g.steps.length, g.stars, coreOn(run, 0), cargo(run)]).toEqual([1, 2, "hullbreaker*2", []]);
    offer(run, "salvo");
    buyOffer(run, 0, 0, { turret: 0 });
    expect([coreOn(run, 0), cargo(run)]).toEqual(["salvo", ["hullbreaker*2"]]);
  });

  it("twins merge like any module: cargo into the socket, a chain lands in the socket, 3 stars is the maximum", () => {
    const run = newRun("furnace", 5, "twin");
    run.inventory = [];
    gainModule(run, "pressure", { turret: 0 });
    gainModule(run, "pressure"); // bought to cargo: merges into the fitted twin (placed beats cargo)
    expect([coreOn(run, 0), cargo(run)]).toEqual(["pressure*2", []]);
    gainModule(run, "pressure");
    const chain = gainModule(run, "pressure"); // 1 star + 1 star, then with the 2-star: 3 stars in the socket
    expect([chain.steps.map((s) => s.stars), coreOn(run, 0), cargo(run)]).toEqual([[2, 3], "pressure*3", []]);
    gainModule(run, "pressure");
    expect(cargo(run)).toEqual(["pressure"]);
  });

  it("an absorbed core frees its socket and that turret falls back to its signature core", () => {
    const run = newRun("weaver", 6, "absorb");
    run.inventory = [];
    gainModule(run, "rotary", { turret: 0 });
    const g = gainModule(run, "rotary", { turret: 2 }); // both placed: the twin already at 1 star keeps its spot
    expect([g.where, coreOn(run, 0), coreOn(run, 2)]).toEqual(["turret", "rotary*2", "signature"]);
    expect(resolveCore(run.build, 2)).toMatchObject({ bought: false, routine: "identity", def: "loomshuttle" });
    expect(makeTurret(run.build, 0, HEROES.weaver.turrets[0]).core).toMatchObject({ routine: "rotary", stars: 2 });
  });

  it("build phase and REFIT: fit from cargo (a swap), move between sockets, REMOVE CORE; moving never fuses", () => {
    for (const stage of ["caravan", "refit"] as const) {
      const run = newRun("weaver", 7, `move-${stage}`);
      run.stage = stage;
      run.inventory = [{ uid: 801, def: "gatling", stars: 2 }, { uid: 802, def: "salvo" }, { uid: 803, def: "chamber" }];
      expect(fitCore(run, 801, 0)).toBe(true);
      expect(fitCore(run, 802, 0)).toBe(true); // a swap: the 2-star gatling back to cargo
      expect([coreOn(run, 0), cargo(run)]).toEqual(["salvo", ["chamber", "gatling*2"]]);
      expect(fitCore(run, 802, 2)).toBe(true); // moved to another socket
      expect([coreOn(run, 0), coreOn(run, 2)]).toEqual(["signature", "salvo"]);
      expect(fitCore(run, 803, 1)).toBe(false); // gear never fits a socket
      expect(fitCore(run, 801, 5)).toBe(false); // no such turret
      expect(storeMod(run, coreFor(run.build, 2)!.uid)).toBe(true); // REMOVE CORE
      expect([coreOn(run, 2), cargo(run)]).toEqual(["signature", ["chamber", "gatling*2", "salvo"]]);
      expect(unfusedInRun(run)).toEqual([]);
    }
  });

  it("a core never takes the gear hardpoint, and gear never takes the socket", () => {
    const run = newRun("furnace", 8, "kinds");
    run.inventory = [];
    gainModule(run, "scatter", { turret: 0 });
    expect(turretHasFreeHardpoint(run.build, 0)).toBe(true);
    gainModule(run, "calibrate", { turret: 0 });
    expect([turretHasFreeHardpoint(run.build, 0), coreFor(run.build, 0)?.def, gearFor(run.build, 0)?.def]).toEqual([false, "scatter", "calibrate"]);
    const tu = makeTurret(run.build, 0, HEROES.furnace.turrets[0]);
    expect([tu.core.routine, tu.interval]).toEqual(["scatter", 0.75]);
  });
});

describe("sockets in data", () => {
  it("sockets survive the save v7 round trip and ghostOf (cores ride in build.mods)", () => {
    const run = newRun("weaver", 9, "save");
    run.build.mods.push({ uid: 901, def: "drake", turret: 0, stars: 3 }, { uid: 902, def: "calibrate", turret: 0 }, { uid: 903, def: "scatter", turret: 2 });
    const back = migrateRun(clone(run))!;
    expect(back).toEqual(run);
    expect([coreOn(back, 0), coreOn(back, 1), coreOn(back, 2)]).toEqual(["drake*3", "signature", "scatter"]);
    const s = ghostOf(run, 5, "p-core");
    expect(isSnapshot(s)).toBe(true);
    expect(checkSnapshot(s)).toEqual(s);
    expect(s.build.mods).toEqual(run.build.mods);
  });
});

describe("validator: one core and one mod per turret", () => {
  const deck = () => newRun("weaver", 10, "val").build;
  it("a core and a mod on one turret are legal, and a core's value counts (price x 2^(stars-1))", () => {
    const b = deck();
    b.mods.push({ uid: 950, def: "scatter", turret: 0, stars: 2 }, { uid: 951, def: "calibrate", turret: 0 });
    expect(validateBuild(b, 10)).toEqual({ ok: true, errors: [] });
    expect(buildCost(b).mods).toBe(4 * 2 + 5);
  });
  it("a second core on one turret is rejected; so are a second mod, bad stars and unknown ids", () => {
    const two = deck();
    two.mods.push({ uid: 950, def: "scatter", turret: 1 }, { uid: 951, def: "drake", turret: 1 });
    expect(validateBuild(two, 10).errors).toEqual(["hardpoint: turret 1 carries more than one core"]);
    const gear = deck();
    gear.mods.push({ uid: 950, def: "calibrate", turret: 1 }, { uid: 951, def: "chamber", turret: 1 });
    expect(validateBuild(gear, 10).errors).toEqual(["hardpoint: turret 1 carries more than one module"]);
    const star = deck();
    star.mods.push({ uid: 950, def: "salvo", turret: 1, stars: 4 });
    expect(validateBuild(star, 10).ok).toBe(false);
    const unknown = deck();
    unknown.mods.push({ uid: 950, def: "kilnbreech", turret: 1 }); // a signature core is never an item
    expect(validateBuild(unknown, 10).errors).toEqual(['item: uid 950 is unknown item "kilnbreech"']);
    const onDeck = deck();
    onDeck.items.push({ uid: 952, def: "rotary", x: 0, y: 9 });
    expect(validateBuild(onDeck, 10).errors.some((e) => e.includes("NOT DECK EQUIPMENT"))).toBe(true);
  });
});
