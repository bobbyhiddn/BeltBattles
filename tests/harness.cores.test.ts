// Harness v2 part 2, step 2 (REQ-BFG-005, REQ-BFG-019): turret cores (0.6.1b), stars on only. The shopper's
// "core" lever buys a core the hero's caravan sells and fits it: an empty socket first, a copy of a fitted core
// merges (gainModule), a different core on a full socket swaps and the old one goes to cargo (fuse.ts freeSocket).
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { coreFor, gearFor, type Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { gainModule, mergePreview } from "../src/game/fuse";
import { newRun } from "../src/game/run";
import { FUSE_MAX, starsOf } from "../src/sim/stars";
import { fullPurseBuild, randomBuild, shopBuild, spendFloor } from "../src/sim/harness/gen";
import { HARNESS_HEROES, heroStartBuild, shopItems } from "../src/sim/harness/heroes";
import { applyLever, canApply } from "../src/sim/harness/levers";
import { cargoValue, gainInto, unfusedWithCargo, type InvItem } from "../src/sim/harness/merge";
import { Shopper } from "../src/sim/harness/shopper";
import { STANDIN_DEFAULTS, STANDIN_MAX_STARS, dataModuleText, standInCandidate, standInCommand, writtenProblems, type HeroDay } from "../src/sim/harness/standins";
import { encodeStarred } from "../src/sim/harness/standinCode";
import { DEFAULT_OPTS, runTournament, type Runner } from "../src/sim/harness/tournament";
import { withHullScale } from "../src/sim/hullScale"; // AZ-BUMP (the flip): the pins' switch-off check
import { withShapes } from "../src/sim/shapes"; // SHAPES-1 flip: the pins' switch-off check
import { withPlainRigs } from "../src/sim/plainRigs"; // BUMP-1D: the pins' switch-off check (the six plain rigs join the shared pool)
import { withShapes2 } from "../src/sim/shapes2"; // BUMP-1D: the pins' switch-off check (six more shaped rigs, NAIL STRIP and SPIKE RAIL patched)
import { withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the pins' switch-off check (the seven scaling rigs join the shared pool; SCALE_RIGS ships on)

const hash32 = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};
const isCore = (def: string) => ITEMS[def]?.kind === "core";
const coresOn = (b: Build) => b.mods.filter((m) => isCore(m.def));

/** The stars-on invariant (brief step 2): at most one core and one gear per turret, validateBuild ok, no
 *  unfused pair (deck, and deck + cargo through fuse.ts unfusedInRun), deck + cargo within the day's gold,
 *  and every uid (deck and cargo) unique. Returns the problems found. */
function problems(b: Build, cargo: readonly InvItem[], day: number): string[] {
  const out: string[] = [];
  HEROES[b.hero].turrets.forEach((_, t) => {
    const here = b.mods.filter((m) => m.turret === t);
    if (here.filter((m) => isCore(m.def)).length > 1) out.push(`turret ${t}: two cores`);
    if (here.filter((m) => !isCore(m.def)).length > 1) out.push(`turret ${t}: two gear`);
  });
  out.push(...validateBuild(b, day).errors, ...unfusedPairs(b), ...unfusedWithCargo(b, cargo));
  if (cargo.some((i) => !isCore(i.def))) out.push("cargo holds a non-core");
  if (buildCost(b).total + cargoValue(cargo) > maxGoldByDay(day)) out.push(`over budget: ${buildCost(b).total} + cargo ${cargoValue(cargo)} > ${maxGoldByDay(day)}`);
  const uids = [...b.items.map((p) => p.uid), ...b.mods.map((m) => m.uid), ...cargo.map((i) => i.uid)];
  if (new Set(uids).size !== uids.length) out.push("a uid is used twice");
  return out;
}

describe("harness cores (0.6.1b): legality", () => {
  it("property test, stars on + cores on: after EVERY lever of randomBuild (all six heroes, days 1,3,5,7,10) the invariant holds; cores, 2-star cores and swaps really happen", () => {
    let withCore = 0, starred = 0, swaps = 0, levers = 0;
    for (const hero of HARNESS_HEROES) {
      for (const day of [1, 3, 5, 7, 10]) {
        for (let i = 0; i < 6; i++) {
          const r = shopBuild(hero, day, new Rng(hashSeed("core-prop", hero, day, i)), "on", FUSE_MAX, "on", (s, l, ok) => {
            levers++;
            expect(problems(s.b, s.cargo, day), `${hero} d${day} #${i} after ${l} (${ok})`).toEqual([]);
          });
          if (coresOn(r.build).length) withCore++;
          if (coresOn(r.build).some((m) => starsOf(m) >= 2)) starred++;
          swaps += r.swaps;
        }
      }
    }
    expect(levers).toBeGreaterThan(1000);
    expect(withCore).toBeGreaterThan(20);
    expect(starred).toBeGreaterThan(0);
    expect(swaps).toBeGreaterThan(0);
  }, 120_000);

  it("property test, stars on + cores on: fullPurseBuild outputs are legal, deck + cargo gold within the day's gold, and the reported cargo gold is exact", () => {
    for (const hero of ["furnace", "weaver", "foundry"] as const) {
      for (let day = 1; day <= 10; day++) {
        for (let i = 0; i < 3; i++) {
          const f = fullPurseBuild(hero, day, hashSeed("core-fp", hero, day, i), undefined, 60, "on", FUSE_MAX, "on");
          const b = f.build;
          expect(validateBuild(b, day).errors, `${hero} d${day} #${i}`).toEqual([]);
          expect(unfusedPairs(b)).toEqual([]);
          expect(f.cost).toBe(buildCost(b).total);
          expect(f.cost + (f.cargoGold ?? 0)).toBeLessThanOrEqual(maxGoldByDay(day));
          HEROES[hero].turrets.forEach((_, t) => expect(b.mods.filter((m) => m.turret === t && isCore(m.def)).length).toBeLessThanOrEqual(1));
          expect(f.cargoGold === undefined || f.cargoGold > 0).toBe(true);
        }
      }
    }
  }, 120_000);

  it("stars off never buys a core, even when cores 'on' is passed (randomBuild and fullPurseBuild, all heroes)", () => {
    for (const hero of HARNESS_HEROES) {
      for (const day of [2, 5, 8, 10]) {
        for (let i = 0; i < 4; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("core-off", hero, day, i)), "off", FUSE_MAX, "on");
          expect(coresOn(b), `${hero} d${day} #${i}`).toEqual([]);
          const off = randomBuild(hero, day, new Rng(hashSeed("core-off", hero, day, i)), "off");
          expect(JSON.stringify(b)).toBe(JSON.stringify(off)); // the cores flag is inert with stars off
        }
        const f = fullPurseBuild(hero, day, hashSeed("core-off-fp", hero, day), undefined, 60, "off", FUSE_MAX, "on");
        expect(coresOn(f.build)).toEqual([]);
        expect(f.cargoGold).toBeUndefined();
      }
    }
    const s = new Shopper(heroStartBuild("furnace", 1), 60, 10, new Rng(1), "off", FUSE_MAX, "on");
    expect(s.coresOn).toBe(false);
    expect(canApply(s, "core")).toBe(false);
  });

  // 0.6.2p (item 7a): retitled from "... is deterministic ..."; it pins two hashes (values unchanged)
  it("pin: stars on + cores off, random and full-purse builds with the expanded shared pool hash to their pinned values", () => {
    // AZ-BUMP (the flip, HULL_SCALE): both hashes, drawn on the purse of the switch as it stands (the note at the pins)
    const pins = (): [number, number] => {
      const a: string[] = [];
      for (const hero of HARNESS_HEROES) for (const day of [1, 3, 5, 7, 10]) for (let i = 0; i < 3; i++) a.push(JSON.stringify(randomBuild(hero, day, new Rng(hashSeed("on-pin", hero, day, i)), "on", FUSE_MAX, "off")));
      const b: string[] = [];
      for (const hero of ["furnace", "weaver"] as const) for (let day = 1; day <= 10; day++) for (let i = 0; i < 3; i++) b.push(JSON.stringify(fullPurseBuild(hero, day, hashSeed("fp-on-pin", hero, day, i), undefined, 60, "on", FUSE_MAX, "off")));
      return [hash32(a.join("|")), hash32(b.join("|"))];
    };
    // beltside-062-on-061 re-pin (DESIGN §13 P16, moved by H2's rig placement: every rig these builds buy stands where
    // H2 puts it, and a merging copy leaves the survivor's cell and rotation): 3068763238 -> 2679854933 and
    // 1965100384 -> 3070968615, measured on this branch. BELTSIDE never had a pre-cores stars-on harness to compute
    // them with (the stars-off pins in tests/harness.merge.test.ts are the ones checked against beltside-062c's own
    // harness); cores off still draws nothing for the core lever (tests above), so the pins hold that path.
    // REQ-BFG-021: all-six random-build pin 2679854933 -> 3990378578 when Metronome gained speed rigs.
    // 0.6.2 combined branch (wave-2 stock, E1/E2 par and captains, race par fusion, and REQ-BFG-021's timing gear sold
    // to every hero), measured twice on arsenal-062-combined: all-six random builds 3990378578 -> 1781625131; Furnace/
    // Weaver full purses 3070968615 -> 3672937531. On fac2bc2 alone the timing gear gave 1876268089 and 227470131.
    // Fixed golden decks are unchanged.
    // 0.6.2 TUNE-M T2, LODESTONE's floor (+1/+2/+3 flat on every payload): the generator now sees it add damage, so 5 of
    // the 90 random builds and some full purses buy differently: 1781625131 -> 450651712 and 3672937531 -> 4190209584.
    // With LODESTONE's old values patched back into ITEMS at runtime, both hashes read their old values again
    // (output-beltside/final-062/tune/verify/pinpatch.test.ts), so the floor alone moves them.
    // 0.8.0 I1 M2 (REPORT-P1 section 13, "harness.cores hashes"): wave 3 goes live, so the random builds' shared pool
    // gains the 15 (harness/heroes.ts reads buyableModules()): 450651712 -> 2034124841 and 4190209584 -> 85738988. With
    // the switch off both read their old values (the M1 gate). 0.8.0 I1 M3 (the brief's STOKER item): the shopper places
    // a STOKER beside a factory (Shopper.placeStoker; before, the gate lever found no belt spot for it and failed):
    // 2034124841 -> 1899419253 and 85738988 -> 910760556. With only levers.ts's STOKER line taken out (the per-run draw
    // left in: these builds never roll a caravan), both read 2034124841 and 85738988 again (oracle 4fe13f3fd06dc385).
    // NUM-1 (REQ-BFG-047): ARMOR PACK's hull x10 (supply.hull 25 -> 250), so every build's hullBonus is x10 (0..250 ->
    // 0..2500): 1899419253 -> 779366749 and 910760556 -> 2993301734. With each build's hullBonus read back / 10, both
    // hashes read 1899419253 and 910760556 again (measured on num1), so no purchase or placement moved.
    // FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER is dormant, so the random builds' shared pool (buyableModules()) loses it:
    // 779366749 -> 2599201197 and 2993301734 -> 1712223641. With SIFTER taken out of DORMANT_ITEMS for the call both read
    // their old values again; the sustain switch moves neither (the random builder buys no sustain piece; measured both
    // ways on flipx2 94cc87d)
    // Y7b2 (the flip): release Y's star data folded into the base defs (STAR_DIFF), so the stars-on builds buy and merge by the
    // new star numbers: 2599201197 -> 299861875 and 1712223641 -> 2353056724, measured on y7b2 after the flip (the first is
    // also Y7b1's switch-on reading at 455944c, T/output-y7b2/diag/flip-on.json; the harness reads none of step 5's
    // regenerated data, and step 3's words are text only)
    // AZ-BUMP (the flip, HULL_SCALE): the random builds 299861875 -> 4035130089, measured on the flip's src. The harness
    // spends maxGoldByDay(day), and HULL_SCALE's income (6 + min(day, 10) + 2 a win; tests/hull1c.damage) lifts the purse
    // on days 8-10 (91 105 119 -> 92 108 125), so day 10's random builds buy more. The full purses spend the same purses
    // (days 8-10 lifted too), but their on value was never read (the flip's run stops at the first pin): it is logged
    // (AZ-BUMP-PIN) for a later re-pin. With HULL_SCALE off both read Y7b2's values (the flip's switch-off proof run,
    // vp-H1: this file green with only HULL_SCALE off), so no other harness path moved; that check stays here
    const [a, b] = pins();
    console.log(`AZ-BUMP-PIN harness.cores, every switch on: random builds ${a}, full purses ${b}`);
    // SHAPES-1 flip: the shared pool (buyableModules()) gains NAIL STRIP, EMBER TROUGH and SPIKE RAIL, which the random
    // builds draw and place by the shaped-rig solver (beltside.ts shapedSpot), and the order lever's swap now keeps a shaped
    // flat rig legal (levers.ts sortRoute/fitsTurned), so both move: 4035130089 -> 1254995653 and 3958019260 -> 710977181.
    // With SHAPES off both read AZ-BUMP's values again (below), so no other harness path moved
    // SHAPES-1 (RUN5-SHAPES1 3, cap's ruling 1.1): EMBER TROUGH 4 -> 5 G: the random builds and the full purses spend
    // their gold by price on the shared pool, so both move again: 1254995653 -> 898715018 and 710977181 -> 3415494316
    // (measured, run 6). With SHAPES off nothing moves (the switch-off checks below)
    // BUMP-1D (PLAIN_RIGS and SHAPES2 on since bb-0.11.0): the shared pool (buyableModules()) gains the twelve pieces (WHETSTONE,
    // TEMPER, RASP at 4 G, ... and ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER, PICKAXE; 91 -> 103 buyable) and NAIL
    // STRIP / SPIKE RAIL read their SHAPES2 numbers, so the random builds and the full purses buy, place and merge differently
    // again: 898715018 -> 3663963154 and 3415494316 -> 2068234838 (measured, the first run of this file on the bump branch). With
    // both switches off (oldWorld below) both read their old values again, so no other harness path moved (hearts, the long run
    // and the new stand-in pool touch neither build)
    // BUMP-1E (SCALE_RIGS on since bb-0.12.0): the shared pool (buyableModules()) gains the seven scaling rigs (CINDER MAIL, ROT GAUGE, LEECH COIL,
    // CROWD PRESS, AEGIS SPIKE, GRUDGE ROD, TROPHY CHAIN; 103 -> 110 buyable) and the five reworks (KINDLING, PRESSURE BREECH, IRON WALL, SPALL
    // CATCHER, POWDER KEG) read their new defs, so the builds buy differently again: 3663963154 -> 1897913483 and 2068234838 -> 2516197445
    // (measured, the first run of this file in the bb-0.12.0 world, the log line above). With SCALE_RIGS off as well (oldWorld below) both read
    // BUMP-1D's values again, so no other harness path moved
    // BUMP-1F (F3, BUMP-1E REPORT section 11; RULING-BUMP1F-R5 R5.2 (2)): the order lever's swap (levers.ts sortRoute) now undoes a swap that leaves a rig IDLE that worked before (a rig is never left
    // idle), so some of the 90 random builds end with other placements: 1897913483 -> 3025328070 (measured, the first run of this file in the bb-0.13.0 world, the log line above). The full purses are
    // unchanged (2516197445). Neither GATES nor ENCHANT moves either hash (measured with GATES off, ENCHANT off and both off, in this world: the same pair; the random builds draw from heroes.ts
    // shopItems(kind), buyableModules() filtered by an exact kind, so the three converters (kind "converter") are never drawn), and with the F3 clause taken out of a scratch copy of levers.ts
    // the random builds read 1897913483 again
    expect(a).toBe(3025328070); // BUMP-1F (F3): was 1897913483 (BUMP-1E: was 3663963154 (BUMP-1D: was 898715018))
    // AZ-BUMP (the flip, HULL_SCALE): the full purses 2353056724 -> 3958019260, read from the log line above in run 5's group
    // check M1b (the work tree, every switch on)
    expect(b).toBe(2516197445); // BUMP-1E: the seven scaling rigs; was 2068234838. BUMP-1D: the twelve new pieces; was 3415494316 (SHAPES-1 (RUN5 3): EMBER TROUGH 5 G; was 710977181 (the flip))
    // BUMP-1D: the older worlds' checks run with PLAIN_RIGS and SHAPES2 off (their pool is the one these pins were drawn on)
    // BUMP-1E: and with SCALE_RIGS off too (it ships on from bb-0.12.0: the seven scaling rigs are in the shared pool otherwise)
    const oldWorld = <T>(fn: () => T): T => withScaleRigs(() => withPlainRigs(() => withShapes2(fn, false), false), false);
    expect(oldWorld(pins)).toEqual([898715018, 3415494316]); // BUMP-1D: the switch-off check of the twelve pieces (bb-0.10.0's pool): the old pins
    expect(oldWorld(() => withShapes(pins, false))).toEqual([4035130089, 3958019260]); // SHAPES-1 flip: the switch-off check (BUMP-1D: in the old world)
    expect(oldWorld(() => withShapes(() => withHullScale(pins, false), false))).toEqual([299861875, 2353056724]); // SHAPES-1 flip: AZ-BUMP's check, SHAPES off (BUMP-1D: in the old world)
  }, 60_000);
});

/** A deck of `hero`'s start build with the given turret equipment already fitted. */
const fitted = (hero: HeroId, mods: { uid: number; def: string; turret: number; stars?: number }[]): Build => {
  const b = heroStartBuild(hero, 1);
  b.mods.push(...mods);
  return b;
};
/** The same gain on a real Run with the game's own code, exactly as run.ts:330 buyOffer drops a card on a
 *  turret: `gainModule(run, def, pv && pv.where !== "cargo" ? undefined : at)`. */
function gameGain(b: Build, cargo: InvItem[], def: string, turret: number, uid: number) {
  const run = newRun(b.hero, 1, "cores-eq");
  run.build = JSON.parse(JSON.stringify(b));
  run.inventory = cargo.map((i) => ({ ...i }));
  run.nextUid = uid;
  const pv = mergePreview(run, def);
  gainModule(run, def, pv && pv.where !== "cargo" ? undefined : { turret });
  return run;
}

describe("harness cores (0.6.1b): the core paths, through the game's own gainModule", () => {
  it("a copy of a fitted core merges into it (the fitted twin keeps its socket); equal to gainModule on a real Run", () => {
    const b = fitted("weaver", [{ uid: 50, def: "scatter", turret: 1 }]);
    const cargo: InvItem[] = [];
    const g = gainInto({ uid: 60 }, b, "scatter", { turret: 2 }, cargo);
    expect(g).toMatchObject({ survivor: 50, stars: 2, where: "turret" });
    expect(coresOn(b)).toEqual([{ uid: 50, def: "scatter", turret: 1, stars: 2 }]);
    expect(cargo).toEqual([]);
    const run = gameGain(fitted("weaver", [{ uid: 50, def: "scatter", turret: 1 }]), [], "scatter", 2, 60);
    expect(JSON.stringify(run.build)).toBe(JSON.stringify(b));
    expect(validateBuild(b, 5).errors).toEqual([]);
  });

  it("a different core on a full socket swaps: the old core goes to cargo with its stars (fuse.ts freeSocket); equal to gainModule", () => {
    const b = fitted("furnace", [{ uid: 50, def: "scatter", turret: 0, stars: 2 }, { uid: 51, def: "calibrate", turret: 0 }]);
    const cargo: InvItem[] = [];
    gainInto({ uid: 60 }, b, "rotary", { turret: 0 }, cargo);
    expect(coresOn(b)).toEqual([{ uid: 60, def: "rotary", turret: 0 }]);
    expect(gearFor(b, 0)?.def).toBe("calibrate"); // the gear hardpoint is untouched by a core swap
    expect(cargo).toEqual([{ uid: 50, def: "scatter", stars: 2 }]);
    const run = gameGain(fitted("furnace", [{ uid: 50, def: "scatter", turret: 0, stars: 2 }, { uid: 51, def: "calibrate", turret: 0 }]), [], "rotary", 0, 60);
    expect(JSON.stringify(run.build)).toBe(JSON.stringify(b));
    expect(run.inventory).toEqual(cargo);
    expect(validateBuild(b, 5).errors).toEqual([]);
  });

  it("a copy of a CARGO core fitted on a turret swaps, then merges with the cargo twin (placed beats cargo); equal to gainModule", () => {
    const b = fitted("furnace", [{ uid: 52, def: "rotary", turret: 0 }]);
    const cargo: InvItem[] = [{ uid: 50, def: "scatter" }];
    gainInto({ uid: 60 }, b, "scatter", { turret: 0 }, cargo);
    expect(coresOn(b)).toEqual([{ uid: 60, def: "scatter", turret: 0, stars: 2 }]);
    expect(cargo).toEqual([{ uid: 52, def: "rotary" }]);
    const run = gameGain(fitted("furnace", [{ uid: 52, def: "rotary", turret: 0 }]), [{ uid: 50, def: "scatter" }], "scatter", 0, 60);
    expect(JSON.stringify(run.build)).toBe(JSON.stringify(b));
    expect(run.inventory).toEqual(cargo);
  });

  it("the core lever: an empty socket comes first; a copy merges; a different core swaps to cargo, which costs gold but doesn't fight", () => {
    const rotary = ITEMS.rotary.price; // the cheapest core: a budget of deck + 3 makes it the only affordable one
    expect(shopItems("weaver", "core").map((d) => d.id).sort()).toEqual(
      Object.values(ITEMS).filter((d) => d.kind === "core" && d.merchant).map((d) => d.id).sort());
    // empty socket first: WEAVER, turret 0 already has a core; the new core goes to an EMPTY socket
    const w = fitted("weaver", [{ uid: 50, def: "scatter", turret: 0 }]);
    const sw = new Shopper(w, buildCost(w).total + rotary, 5, new Rng(7), "on", FUSE_MAX, "on");
    expect(applyLever(sw, "core")).toBe(true);
    expect(coreFor(w, 0)?.def).toBe("scatter");
    expect(coresOn(w).map((m) => m.def).sort()).toEqual(["rotary", "scatter"]);
    expect(sw.cargo).toEqual([]);
    // a copy merges: FURNACE, rotary fitted; the only affordable core is another rotary
    const f = fitted("furnace", [{ uid: 50, def: "rotary", turret: 0 }]);
    const sf = new Shopper(f, buildCost(f).total + rotary, 5, new Rng(7), "on", FUSE_MAX, "on");
    expect(applyLever(sf, "core")).toBe(true);
    expect(coresOn(f)).toEqual([{ uid: 50, def: "rotary", turret: 0, stars: 2 }]);
    expect([sf.cargo, sf.swaps]).toEqual([[], 0]);
    // a different core on the full socket swaps: FURNACE, scatter fitted, only rotary affordable
    const x = fitted("furnace", [{ uid: 50, def: "scatter", turret: 0 }]);
    const sx = new Shopper(x, buildCost(x).total + rotary, 5, new Rng(7), "on", FUSE_MAX, "on");
    expect(applyLever(sx, "core")).toBe(true);
    expect(coresOn(x).map((m) => m.def)).toEqual(["rotary"]);
    expect(sx.cargo).toEqual([{ uid: 50, def: "scatter" }]);
    expect(sx.swaps).toBe(1);
    expect(sx.left()).toBe(0); // the swapped-out scatter's gold stays spent
    expect(problems(x, sx.cargo, 5)).toEqual([]);
    // never swapped out for its own copy: a 2-star rotary fitted, one 1-star rotary affordable -> no move
    const y = fitted("furnace", [{ uid: 50, def: "rotary", turret: 0, stars: 2 }]);
    const sy = new Shopper(y, buildCost(y).total + rotary, 5, new Rng(7), "on", FUSE_MAX, "on");
    expect(applyLever(sy, "core")).toBe(false);
    expect(coresOn(y)).toEqual([{ uid: 50, def: "rotary", turret: 0, stars: 2 }]);
  });

  it("a fitted core leaves the gear hardpoint free: the mod lever fits gear beside it (one core and one mod per turret)", () => {
    const b = fitted("furnace", [{ uid: 50, def: "scatter", turret: 0 }]);
    const s = new Shopper(b, buildCost(b).total + 7, 5, new Rng(3), "on", FUSE_MAX, "on");
    expect(canApply(s, "mod")).toBe(true);
    expect(applyLever(s, "mod")).toBe(true);
    expect(b.mods.filter((m) => m.turret === 0).map((m) => ITEMS[m.def].kind).sort()).toEqual(["core", "mod"]);
    expect(validateBuild(b, 5).errors).toEqual([]);
  });
});

describe("harness cores (0.6.1b): options and reports", () => {
  it("standInCommand prints --cores only for stars on + cores off (the stars-off header, checked by --check, is unchanged)", () => {
    const base = standInCommand({ ...STANDIN_DEFAULTS, stars: "off" });
    expect(standInCommand({ ...STANDIN_DEFAULTS, stars: "off", cores: "off" })).toBe(base);
    expect(base).not.toContain("--cores");
    expect(standInCommand({ ...STANDIN_DEFAULTS, stars: "on", cores: "on" })).not.toContain("--cores");
    expect(standInCommand({ ...STANDIN_DEFAULTS, stars: "on", cores: "off" })).toContain("--cores off");
  });

  // AZ-BUMP (the flip): the next test's limit is 600 s (was 60 s), 60 s hit in run 5's group check under the 1.5-CPU quota
  // (the GATE RULE; its battles play on their day, longer with HULL_SCALE), not the rule
  it("a tiny stars-on tournament reports core use with cores on (cores fitted, per def and star) and none with cores off", async () => {
    const tiny = { ...DEFAULT_OPTS, heroes: ["furnace", "weaver"] as HeroId[], days: [7], calibrationDays: [7], pop: 6, gauntlet: 2, seeds: 1, elites: 2 };
    const noBench: Runner = async (_f, jobs) => jobs.map(() => 1);
    const on = (await runTournament({ ...tiny, cores: "on" }, noBench)).days[0];
    const off = (await runTournament({ ...tiny, cores: "off" }, noBench)).days[0];
    expect(off.coreUse).toBeUndefined();
    const u = on.coreUse!;
    const total = (["furnace", "weaver"] as const).reduce((s, h) => s + u[h]!.pop.cores, 0);
    expect(total).toBeGreaterThan(0);
    for (const h of ["furnace", "weaver"] as const) {
      expect(u[h]!.pop.builds).toBe(6);
      expect(u[h]!.pop.stars.reduce((s, x) => s + x, 0)).toBe(u[h]!.pop.cores);
      expect(Object.values(u[h]!.pop.byDef).reduce((s, x) => s + x, 0)).toBe(u[h]!.pop.cores);
    }
    // cores ride in build.mods, so a fitted 1-star core is a benched def (a fitted core raised to 2 and 3 stars)
    expect((on.bench ?? []).some((r) => isCore(r.def))).toBe(true);
  }, 600_000);
});

describe("harness cores (0.6.1b): the stand-in 2-star cap covers cores (D4, ARSENAL.md:502)", () => {
  it("stars on + cores on: a stand-in candidate never holds a core above 2 stars, where the uncapped build of the same seed does", () => {
    let capped3 = 0, free3 = 0, core2 = 0;
    for (const hero of ["furnace", "weaver"] as const) {
      for (const day of [6, 8, 10]) {
        for (let i = 0; i < 16; i++) {
          const seed = hashSeed("core-cap", hero, day, i);
          const c = standInCandidate(hero, day, seed, "on", "on").build;
          const free = fullPurseBuild(hero, day, seed, spendFloor(day), 60, "on", FUSE_MAX, "on").build;
          const top = (b: Build) => Math.max(0, ...coresOn(b).map((m) => starsOf(m)));
          if (top(c) > STANDIN_MAX_STARS) capped3++;
          if (top(free) > STANDIN_MAX_STARS) free3++;
          if (top(c) === 2) core2++;
          expect(validateBuild(c, day).errors).toEqual([]);
        }
      }
    }
    expect(capped3).toBe(0);
    expect(free3).toBeGreaterThan(0); // the cap really bites on cores for these seeds
    expect(core2).toBeGreaterThan(0);
  }, 120_000);

  it("the written-module guard reports a stand-in pick holding a 3-star core", () => {
    const o = { ...STANDIN_DEFAULTS, stars: "on" as const, cores: "on" as const };
    const b = fitted("furnace", [{ uid: 50, def: "scatter", turret: 0, stars: 2 }]);
    const pick = (build: Build) => ({ idx: 0, build, code: encodeStarred(build), cost: buildCost(build).total, tries: 1, floorMet: true, score: 0.5, pct: 50, vsRef: {}, vsPar: 1 });
    const hd = (build: Build) => ({ hero: "furnace", day: 10, budget: maxGoldByDay(10), floor: 0, pop: [], picks: [pick(build)], par: 0, window: [40, 60], relax: "none", widened: false, short: false, elites: [], parVsRef: {}, parVsElites: 0, robustRemoved: 0, robustReplayed: 0, capAffected: 0, capWould3: 0 }) as unknown as HeroDay;
    expect(writtenProblems(o, [hd(b)], dataModuleText(o, [hd(b)])).filter((p) => p.includes("3-star module"))).toEqual([]);
    const three: Build = JSON.parse(JSON.stringify(b));
    three.mods[0].stars = 3;
    expect(writtenProblems(o, [hd(three)], dataModuleText(o, [hd(three)])).some((p) => p.includes("3-star module"))).toBe(true);
  });
});
