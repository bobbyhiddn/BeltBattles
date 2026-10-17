// SHAPES-2 (REQ-BFG-114 (4); BRIEF-SHAPES2 S4; step 5): the seed pool's generators with SHAPES2 on, in memory (nothing is written, no
// --check, no seed write, no change to the committed pool or stand-in data):
// - tools/samplePool.ts raceGhosts() (the par player's decks for FOUNDRY and BASTION, 60 snapshots; the generator behind
//   tools/genGhostPool.ts) with SHAPES2 and PLAIN_RIGS on: every snapshot passes seedGhost's strict and player-mode checks (it throws
//   on one that doesn't), comes back the same from encodeSnapshot / decodeSnapshot (the file genGhostPool.ts writes), and some hold
//   the six; with SHAPES2 off the player-mode check refuses such a file ("not in this rules version yet");
// - generateSamplePool(), the whole pool, refuses to run in the new world: SOFT-1's stale-pick guard says the par field moved and asks
//   for its re-pick (BB_SOFT1_RULE=1 npx vitest run tests/soft1.picks.test.ts): that is the one regeneration at the bump, pinned here;
// - the retired variant-1 shopper's gate list (GATES, made once at load) is the same with SHAPES2 on at load as off, so the sample
//   ghosts' records don't move (SHAPES-1 did the same for its three).
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHAPES2, SHAPES2_IDS, setShapes2, withShapes2 } from "../src/sim/shapes2";
import { withPlainRigs } from "../src/sim/plainRigs";
import { decodeSnapshot, encodeSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { generateSamplePool, raceGhosts } from "../tools/samplePool";

afterEach(() => setShapes2(SHAPES2));
const SIX = [...SHAPES2_IDS];
const on = <T>(fn: () => T): T => withPlainRigs(() => withShapes2(fn));

describe("SHAPES-2 S4: the seed pool's generators with the six on", () => {
  it("raceGhosts(): 60 snapshots, every one validates and round-trips through the snapshot file; how many hold one of the six", () => {
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
    expect(pool.length).toBe(60);
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
    const off = verdict();
    expect(off.ok).toBe(false);
    expect(off.errors[0]).toMatch(/^rules: shaped rigs \(ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER, PICKAXE\): not in this rules version yet$/);
  }, 900_000);

  it("generateSamplePool() in the new world: SOFT-1's stale-pick guard asks for the re-pick (the one regeneration at the bump)", () => {
    expect(() => on(() => generateSamplePool())).toThrow(/SOFT-1: stale: the pick .* no longer matches its deck/);
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
});
