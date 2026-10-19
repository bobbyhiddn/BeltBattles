// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E2, E4, E5; run 3): the run's new optional fields survive a save and a load (RUN_VERSION stays 8:
// no migration), a ghost made from the run carries every word, and a run without any writes none of the new keys.
import { afterEach, describe, expect, it } from "vitest";
import { RUN_VERSION, newRun, rollShop, type Run } from "../src/game/run";
import { migrateRun } from "../src/game/save";
import { ghostOf } from "../src/game/day";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { setTurretList, turretList } from "../src/sim/deck";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";

afterEach(() => setEnchant(ENCHANT));

function dressed(): Run {
  const run = newRun("furnace", 21);
  run.day = 5;
  run.gold = 30;
  run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
  withEnchant(() => rollShop(run));
  run.shop.enchanter!.offers[0].sold = true;
  run.build.items.push({ uid: 200, def: "whetstone", x: 1, y: 5, stars: 2, ench: "wide", enchDir: 2 }, { uid: 201, def: "longhaul", x: 2, y: 2, ench: "growing", grow: 3 });
  setTurretList(run.build, [{ ...turretList(run.build)[0], ench: "braced" }]);
  run.inventory.push({ uid: 202, def: "whetstone", ench: "fiery" });
  run.enchPick = { day: 5, no: 1, words: ["rising", "echoing"] };
  run.enchPicks = [1];
  run.enchMerge = { uid: 200, kept: { ench: "wide", enchDir: 2 }, lost: { ench: "rising" } };
  return run;
}

describe("ENCHANT-1: the save keeps the words", () => {
  it("a run with every new field is the same after JSON and migrateRun (the version stays 8)", () => {
    const run = dressed();
    expect(RUN_VERSION).toBe(8);
    const back = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(back).not.toBeNull();
    expect(back.version).toBe(8);
    expect(back.build.items.find((p) => p.uid === 200)).toEqual(run.build.items.find((p) => p.uid === 200));
    expect(back.build.items.find((p) => p.uid === 201)).toMatchObject({ ench: "growing", grow: 3 });
    expect(turretList(back.build)[0]).toMatchObject({ ench: "braced" });
    expect(back.inventory.find((i) => i.uid === 202)).toEqual({ uid: 202, def: "whetstone", ench: "fiery" });
    expect(back.shop.enchanter).toEqual(run.shop.enchanter);
    expect(back.enchPick).toEqual(run.enchPick);
    expect(back.enchPicks).toEqual([1]);
    expect(back.enchMerge).toEqual(run.enchMerge);
  });
  it("a run without a word writes none of the new keys (a switch-off save is as it was)", () => {
    const run = newRun("weaver", 9);
    const text = JSON.stringify(run);
    for (const k of ["enchanter", "enchPick", "enchPicks", "enchMerge", "\"ench\"", "enchDir", "\"grow\""]) expect(text.includes(k), k).toBe(false);
  });
});

describe("ENCHANT-1: a ghost made from the run carries the words, and only the ENCHANT rules world accepts them", () => {
  it("ghostOf copies each word (items, turrets), GROWING's counter and WIDE's side; the client check takes it with ENCHANT on and refuses it off", () => {
    const run = dressed();
    run.history = [];
    const g = ghostOf(run, 1_790_000_000_000, "p-enchant1", null);
    expect(g.build.items.find((p) => p.uid === 200)).toMatchObject({ ench: "wide", enchDir: 2, stars: 2 });
    expect(g.build.items.find((p) => p.uid === 201)).toMatchObject({ ench: "growing", grow: 3 });
    expect(turretList(g.build)[0]).toMatchObject({ ench: "braced" });
    expect(g.build).not.toBe(run.build); // a copy
    expect(JSON.stringify(g.build)).toBe(JSON.stringify(run.build));
    const snap = JSON.parse(JSON.stringify(g));
    expect(withEnchant(() => isSnapshot(snap))).toBe(true);
    expect(isSnapshot(snap)).toBe(false); // the switch off: `ench` is an unknown field
  });
});
