// 0.6.1a data (ARSENAL.md §10 item 3): save v6 -> v7 (a duplicate pair fuses once, with the toast), the
// v7 round trip, GhostSnapshot v1 loads as 1 star and v2 round-trips, the star bounds on both sides,
// buildCost at every star in validateBuild, the signature/supply star rule and unfusedPairs (staged).
import { afterEach, describe, expect, it } from "vitest";
import { ghostOf } from "../src/game/day";
import { isSnapshot, migrateSnapshot, SNAPSHOT_VERSION } from "../src/game/ghostSnapshot";
import { loadRun, migrateRun, newRun, RUN_VERSION, saveRun, SAVE_KEY, SAVE_KEY_V6, type Run } from "../src/game/run";
import { MIGRATE_TOAST, nextFuseToast } from "../src/game/save";
import { simulate } from "../src/sim/battle";
import { startingBuild } from "../src/sim/ai";
import type { Build } from "../src/sim/deck";
import { checkSnapshot, decodeSnapshot, encodeSnapshot, SnapshotError } from "../src/net/snapshot";
import { buildCost, FUSE_LIVE, unfusedPairs, validateBuild } from "../src/net/validate";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Raw = Record<string, unknown> & { version: number; inventory: { uid: number; def: string; stars?: number }[]; build: Build };

/** A v6 save: a fresh run written as 0.6.0 wrote it (version 6, no stars, no fuseFx). */
function v6(run: Run): Raw {
  const r = clone(run) as unknown as Raw;
  r.version = 6;
  delete r.fuseFx;
  return r;
}

function mem(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
  };
}
const g = globalThis as { localStorage?: Storage };
afterEach(() => { delete g.localStorage; });

describe("save v7", () => {
  it("RUN_VERSION 7, SAVE_KEY beltbattles.run.v7; v6 is still read", () => {
    expect([RUN_VERSION, SAVE_KEY, SAVE_KEY_V6]).toEqual([7, "beltbattles.run.v7", "beltbattles.run.v6"]);
    expect(newRun("furnace", 1).version).toBe(7);
  });
  it("v6 -> v7: a duplicate pair fuses once (placed beats cargo) and the next screen toasts YOUR SPARE PARTS MERGED", () => {
    const run = newRun("furnace", 11, "mig");
    run.build.items.push({ uid: 200, def: "whetstone", x: 4, y: 3 });
    run.inventory.push({ uid: 201, def: "temper" }, { uid: 202, def: "temper" }, { uid: 203, def: "whetstone" }, { uid: 204, def: "coil" });
    const m = migrateRun(clone(v6(run)))!;
    expect(m.version).toBe(7);
    expect(m.inventory).toEqual([{ uid: 201, def: "temper", stars: 2 }, { uid: 204, def: "coil" }]);
    expect(m.build.items.find((p) => p.uid === 200)).toEqual({ uid: 200, def: "whetstone", x: 4, y: 3, stars: 2 });
    expect(m.fuseFx).toEqual([MIGRATE_TOAST]);
    expect(MIGRATE_TOAST).toBe("YOUR SPARE PARTS MERGED");
    const again = migrateRun(clone(m))!; // v7 now: no second fuse, no second toast
    expect(again).toEqual(m);
  });
  it("the migration notice waits for the next build screen; MERGED toasts show on any screen", () => {
    const run = newRun("furnace", 15, "fx");
    run.fuseFx = [MIGRATE_TOAST, "MERGED: TEMPER ★2"];
    expect(nextFuseToast(run, false)).toBe("MERGED: TEMPER ★2"); // e.g. the road event screen
    expect(nextFuseToast(run, false)).toBeUndefined();
    expect(run.fuseFx).toEqual([MIGRATE_TOAST]);
    expect(nextFuseToast(run, true)).toBe(MIGRATE_TOAST); // the build screen
    expect([run.fuseFx, nextFuseToast(run, true)]).toEqual([[], undefined]);
  });
  it("v6 -> v7 without pairs rewrites nothing (absent stars mean 1) and shows no toast", () => {
    const run = newRun("weaver", 12, "nopair");
    run.inventory.push({ uid: 300, def: "temper" }, { uid: 301, def: "grease" });
    const m = migrateRun(clone(v6(run)))!;
    expect(m.fuseFx).toEqual([]);
    const { fuseFx: _fx, ...rest } = m;
    expect({ ...rest, version: 6 }).toEqual(v6(run));
  });
  it("the v7 round trip keeps stars; loadRun reads a v6 key and saveRun writes v7 and clears v6", () => {
    const run = newRun("furnace", 13, "rt7");
    run.inventory.push({ uid: 400, def: "splitter", stars: 3 });
    run.build.mods.push({ uid: 401, def: "calibrate", turret: 0, stars: 2 });
    expect(migrateRun(clone(run))).toEqual(run);
    g.localStorage = mem();
    const old = newRun("furnace", 14, "old");
    old.inventory.push({ uid: 500, def: "brake" }, { uid: 501, def: "brake" });
    g.localStorage.setItem(SAVE_KEY_V6, JSON.stringify(v6(old)));
    const loaded = loadRun()!;
    expect([loaded.version, loaded.inventory, loaded.fuseFx]).toEqual([7, [{ uid: 500, def: "brake", stars: 2 }], [MIGRATE_TOAST]]);
    saveRun(loaded);
    expect(g.localStorage.getItem(SAVE_KEY_V6)).toBeNull();
    expect(JSON.parse(g.localStorage.getItem(SAVE_KEY)!).inventory).toEqual([{ uid: 500, def: "brake", stars: 2 }]);
  });
});

describe("GhostSnapshot v2", () => {
  const starredRun = (): Run => {
    const run = newRun("furnace", 21, "ghost-run");
    run.build.items.push({ uid: 600, def: "temper", x: 4, y: 3, stars: 3 });
    run.build.mods.push({ uid: 601, def: "calibrate", turret: 0, stars: 2 });
    return run;
  };
  it("ghostOf writes v2 with the stars; the v2 round trip is exact on both sides", () => {
    const s = ghostOf(starredRun(), 5, "p-me");
    expect([SNAPSHOT_VERSION, s.v]).toEqual([2, 2]);
    expect(isSnapshot(s)).toBe(true);
    expect(checkSnapshot(s)).toEqual(s);
    expect(decodeSnapshot(encodeSnapshot(s))).toEqual(s);
    expect(s.build.items.find((p) => p.uid === 600)?.stars).toBe(3);
  });
  it("a v1 snapshot loads as 1 star and fights like it", () => {
    const run = newRun("furnace", 22, "v1-run");
    run.build.items.push({ uid: 700, def: "temper", x: 4, y: 3 });
    const s = { ...ghostOf(run, 5, "p-me"), v: 1 as const };
    expect(isSnapshot(s)).toBe(true);
    expect(migrateSnapshot(s, "p-other")).toEqual(s); // the local pool keeps a v1 entry as it is
    const back = checkSnapshot(s);
    expect(back.v).toBe(1);
    expect(back.build.items.every((p) => p.stars === undefined)).toBe(true);
    const foe = startingBuild("weaver", 1);
    expect(simulate(back.build, foe, 3).sides[0].hull.hp).toBe(simulate(run.build, foe, 3).sides[0].hull.hp);
  });
  it("star bounds: 0, 4, 1.5 and \"2\" are rejected by both sides; any stars in v1 are rejected", () => {
    const base = ghostOf(starredRun(), 5, "p-me");
    for (const bad of [0, 4, 1.5, "2"]) {
      const x = clone(base) as unknown as { build: { items: Record<string, unknown>[] } };
      x.build.items[1].stars = bad;
      expect(isSnapshot(x), `local ${bad}`).toBe(false);
      expect(() => checkSnapshot(x), `net ${bad}`).toThrow(SnapshotError);
    }
    const v1 = { ...clone(base), v: 1 };
    expect(isSnapshot(v1)).toBe(false);
    expect(() => checkSnapshot(v1)).toThrow(/not allowed in a v1 snapshot/);
  });
});

describe("the validator (src/net/validate.ts)", () => {
  const deck = (stars?: number): Build => {
    const b = startingBuild("furnace", 1);
    b.items.push({ uid: 50, def: "temper", x: 4, y: 3, ...(stars ? { stars } : {}) });
    return b;
  };
  it("buildCost is the sum of valueOf: a 3-star TEMPER costs 12, over day 1's 8 gold, fine on day 2", () => {
    expect([undefined, 2, 3].map((s) => buildCost(deck(s)).total)).toEqual([3, 6, 12]);
    expect(validateBuild(deck(), 1).ok).toBe(true);
    const v = validateBuild(deck(3), 1);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.startsWith("budget:"))).toBe(true);
    expect(validateBuild(deck(3), 2)).toEqual({ ok: true, errors: [] });
  });
  it("stars must be 1..3; signature factories and supplies take none above 1; unknown ids are still rejected", () => {
    expect(validateBuild(deck(1), 1).ok).toBe(true);
    expect(validateBuild(deck(4), 5).errors[0]).toMatch(/^shape: .*stars/);
    const sig = deck();
    sig.items[0].stars = 2; // the KILN
    expect(validateBuild(sig, 5).errors).toContain("item: uid 1 KILN can't have 2 stars (signatures and supplies never merge)");
    const unk = deck();
    unk.items.push({ uid: 51, def: "nothing", x: 0, y: 0 });
    expect(validateBuild(unk, 5).errors).toContain('item: uid 51 is unknown item "nothing"');
  });
  it("unfusedPairs names each unmerged pair; FUSE_LIVE is true since the 0.6.1 flip, so validateBuild rejects one", () => {
    expect(FUSE_LIVE).toBe(true);
    const b = deck();
    b.items.push({ uid: 52, def: "temper", x: 4, y: 2 });
    b.mods.push({ uid: 53, def: "calibrate", turret: 0 });
    expect(unfusedPairs(b)).toEqual(["UNFUSED PAIR: TEMPER ★1 x2"]);
    expect(validateBuild(b, 3).errors).toEqual(["item: UNFUSED PAIR: TEMPER ★1 x2"]); // live: the pair is the only error
    b.items[2].stars = 2;
    expect(unfusedPairs(b)).toEqual([]);
    b.items[1].stars = 3; b.items[2].stars = 3;
    expect(unfusedPairs(b)).toEqual([]); // two 3-star copies may coexist
    const c = deck();
    c.items.push({ uid: 54, def: "temper", x: 4, y: 2 }, { uid: 55, def: "temper", x: 4, y: 1 });
    expect(unfusedPairs(c)).toEqual(["UNFUSED PAIR: TEMPER ★1 x3"]);
    expect(unfusedPairs({ ...startingBuild("weaver", 1), items: [...startingBuild("weaver", 1).items, { uid: 9, def: "loom", x: 0, y: 7 }] })).toEqual([]);
  });
});
