// SHAPES-2 (REQ-BFG-114 (4); BRIEF-SHAPES2 S4; step 5): the seed pool's generators with SHAPES2 on, in memory (nothing is written, no
// --check, no seed write, no change to the committed pool or stand-in data):
// - tools/samplePool.ts raceGhosts() (the par player's decks for FOUNDRY and BASTION, 96 snapshots; the generator behind
//   tools/genGhostPool.ts) with SHAPES2 and PLAIN_RIGS on: every snapshot passes seedGhost's strict and player-mode checks (it throws
//   on one that doesn't), comes back the same from encodeSnapshot / decodeSnapshot (the file genGhostPool.ts writes), and some hold
//   the six; with SHAPES2 off the player-mode check refuses such a file ("not in this rules version yet");
//   (BUMP-1D: was 60 snapshots = 2 heroes x 3 variants x 10 days; the long run's pool is 16 days deep, so 2 x 3 x 16 = 96; the
//   10-day count is kept under withLongRun(fn, false) in the last test)
// - generateSamplePool(), the whole pool: when SHAPES-2 came in, it refused to run in the new world (SOFT-1's stale-pick guard said the
//   par field moved and asked for its re-pick, BB_SOFT1_RULE=1 npx vitest run tests/soft1.picks.test.ts: the one regeneration at the
//   bump). BUMP-1D did that regeneration (SOFT1_PICKS: 128 picks, days 1-16, in the shipped world), so in the shipped world it now
//   builds the pool (192 graded ghosts) with no complaint, and the guard is pinned where it still fires: in the bb-0.10.0 catalogue
//   (SHAPES2 and PLAIN_RIGS off, the long run on), whose par field is not the one the table was read in (BUMP-1D: was: it threw in
//   the new world);
// - the retired variant-1 shopper's gate list (GATES, made once at load) is the same with SHAPES2 on at load as off, so the sample
//   ghosts' records don't move (SHAPES-1 did the same for its three).
import { afterEach, describe, expect, it, vi } from "vitest";
// BUMP-1D: deck.ts first, then the rest: its import order (plainRigs, shapes, shapes2) is the ship's load order, and ITEMS' key order is
// part of the seeded draws (tools/shapes2/offers.ts: "the 1D load order"). The file used to import shapes2 first, which put the six
// SHAPES2 rigs into ITEMS before PLAIN_RIGS' six: another order than the ship's, other casual runs, and FLOOR_PICKS' hash (the floor
// runs are read from it since FLOOR-1) came out stale ("FLOOR-1: stale: the pick 9003:6d010a7d for foundry no longer matches").
import "../src/sim/deck";
import { SHAPES2, SHAPES2_IDS, setShapes2, withShapes2 } from "../src/sim/shapes2";
import { withPlainRigs } from "../src/sim/plainRigs";
import { withLongRun } from "../src/sim/longRun";
import { SCALE_RIGS, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the scaling switch is the outermost call of every nest that turns SHAPES2 or PLAIN_RIGS off (ITEMS' key order)
import { SNAPSHOT_V3, decodeSnapshot, encodeSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { generateSamplePool, raceGhosts } from "./helpers/poolCache";

afterEach(() => setShapes2(SHAPES2));
const SIX = [...SHAPES2_IDS];
const on = <T>(fn: () => T): T => withPlainRigs(() => withShapes2(fn));

describe("SHAPES-2 S4: the seed pool's generators with the six on", () => {
  it("raceGhosts(): 96 snapshots, every one validates and round-trips through the snapshot file; how many hold one of the six", () => { // BUMP-1D: was 60 (10 days)
    const pool = on(() => {
      const p = raceGhosts(); // throws if a ghost fails seedGhost's checks (validateBuild strict, validateUpload player mode with its road log)
      let held = 0;
      const seen = new Set<string>();
      for (const s of p) {
        expect(JSON.stringify(decodeSnapshot(encodeSnapshot(s))), `${s.hero} day ${s.day} ${s.runId}`).toBe(JSON.stringify(s));
        const mine = s.build.items.filter((q) => SIX.includes(q.def));
        if (mine.length) held++;
        for (const q of mine) seen.add(q.def);
      }
      console.log(`S4 RACE GHOSTS: ${p.length} snapshots, ${held} hold one of the six (${[...seen].join(", ")})`);
      expect(held).toBeGreaterThan(0);
      return p;
    });
    expect(pool.length).toBe(96); // BUMP-1D: was 60; the long run's depth is 16 days (poolDepth()): 2 race heroes x 3 variants x 16 days
  }, 900_000);

  it("a snapshot holding one of the six is accepted as a record with SHAPES2 on and refused (\"not in this rules version yet\") with it off", () => {
    const [mine, text] = on(() => {
      const m = raceGhosts().find((s) => s.build.items.some((q) => SIX.includes(q.def)))!;
      return [m, encodeSnapshot(m)] as const;
    });
    expect(mine).toBeTruthy();
    const verdict = (): { ok: boolean; errors: string[] } => {
      const s = decodeSnapshot(text); // the file's structure decodes either way: the pieces are judged by the rules
      return validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.road ? { road: s.road } : {}) });
    };
    const withOn = on(verdict);
    expect(withOn.errors, "SHAPES2 on").toEqual([]);
    // BUMP-1D: was verdict() (SHAPES2 shipped off); it ships on now, so the off leg sets it off itself
    // BUMP-1E: and with the scaling switch OUTERMOST (it goes off first and comes back last). SCALE_RIGS ships on and its seven ids are the last keys in ITEMS (after
    // SHAPES2's six), so a bare withShapes2(verdict, false) put the six back BEHIND the seven for the rest of the worker, and the next test's seeded draws (the whole pool
    // below: 'SOFT-1: stale: the pick f3:92446dc1 for foundry day 11') were another world's. The gates answer as before: SHAPES2's gate speaks before the scaling one
    const off = withScaleRigs(() => withShapes2(verdict, false), false);
    expect(off.ok).toBe(false);
    expect(off.errors[0]).toMatch(/^rules: shaped rigs \(ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER, PICKAXE\): not in this rules version yet$/);
  }, 900_000);

  // BUMP-1D: was "generateSamplePool() in the new world: SOFT-1's stale-pick guard asks for the re-pick (the one regeneration at the bump)",
  // expecting on(() => generateSamplePool()) to throw /SOFT-1: stale: the pick .* no longer matches its deck/. The bump did that
  // regeneration (SOFT1_PICKS, FLOOR_PICKS, the pool), so the shipped world builds the pool: 192 ghosts, every one graded (v3).
  it("generateSamplePool() in the shipped world: SOFT-1's picks were re-picked at the bump, so the whole pool builds (192 ghosts, every one graded)", () => {
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the shipped world has the scaling rules on (the picks were re-read in it again: R2, bb-0.12.0)
    const pool = on(() => generateSamplePool());
    expect(pool.length).toBe(192); // 4 heroes x 16 days x 3 variants
    expect(pool.every((s) => s.v === SNAPSHOT_V3 && typeof s.grade === "number")).toBe(true);
  }, 900_000);

  it("the retired shopper never draws one of the six: its gate list is the same with SHAPES2 on at load or off", async () => {
    const load = async (switchOn: boolean): Promise<readonly string[]> => {
      vi.resetModules();
      const s2 = await import("../src/sim/shapes2");
      s2.setShapes2(switchOn);
      const sp = await import("../tools/samplePool");
      return sp.SHOPPER_GATE_IDS;
    };
    const off = await load(false);
    const onLoad = await load(true);
    expect(off.length).toBeGreaterThan(20);
    for (const id of SIX) expect(onLoad, id).not.toContain(id);
    expect(onLoad).toEqual(off);
  }, 900_000);

  // BUMP-1D, the two below last: withPlainRigs(fn, false) puts its six back AFTER SHAPES2's in ITEMS (the load order is part of the seeded
  // draws), which the tests above must not see.
  it("raceGhosts() in the 10-day world (withLongRun false): 60 snapshots, as before the long run (BUMP-1D: the old count kept here)", () => {
    const pool = withLongRun(() => on(() => raceGhosts()), false);
    expect(pool.length).toBe(60); // 2 race heroes x 3 variants x 10 days
    for (const s of pool) expect(JSON.stringify(decodeSnapshot(encodeSnapshot(s))), `${s.hero} day ${s.day} ${s.runId}`).toBe(JSON.stringify(s));
  }, 900_000);

  it("generateSamplePool() in the bb-0.10.0 catalogue (SHAPES2 and PLAIN_RIGS off, the long run on): SOFT-1's stale-pick guard still asks for the re-pick", () => {
    // BUMP-1D: the old assertion of "the new world" (before the bump's re-pick), now in the world whose par field is not the one SOFT1_PICKS was read in
    // BUMP-1E: the scaling switch outermost (was withShapes2(() => withPlainRigs(() => generateSamplePool(), false), false)): the catalogue before the twelve AND the seven
    expect(() => withScaleRigs(() => withShapes2(() => withPlainRigs(() => generateSamplePool(), false), false), false)).toThrow(/SOFT-1: stale: the pick .* no longer matches its deck/);
  }, 900_000);
});
