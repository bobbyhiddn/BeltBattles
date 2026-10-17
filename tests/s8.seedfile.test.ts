// S8 T1b (REQ-BFG-092; REVIEW-R3 ruling 4, BRIEF-S8 T1b): the grades in the bundled pool. With PICK on, the seed pool's grades
// ship in the bundled pool file that gen:ghosts writes (server/seedPoolData.ts; tools/genGhostPool.ts, tools/samplePool.ts
// seedPoolModuleText). The server's seed command (server/seed.ts seedStore's default, the Fly release_command) loads that
// file, checks it (checkPool, the seed step) and stores it with NO battles: nothing is generated, played or graded at boot.
// The file = generator test pins the committed file equal to generateSamplePool()'s output with PICK on: the file moves
// whenever the seed pool moves (S8's regeneration: the stand-in pool, then gen:ghosts again), by that cause.
// Grades are the server's, never an upload's: POST /v1/ghosts refuses a snapshot that carries one (server/app.ts; RETUNE-1's
// tests), so a graded ghost in a store is a seed ghost, in the rules' pool (store.ts replacePool, the seed's alone).
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION } from "../src/sim/content";
import { GRADE_MAX, SNAPSHOT_V3, checkSnapshot, ghostId } from "../src/net/snapshot";
import { pickRules, withPick } from "../src/net/pick";
import { bundledSeedPool, bundledSeedPoolJson, seedStore } from "../server/seed";
import { JsonlStore } from "../server/store";
import { SEED_POOL, SEED_POOL_RULES } from "../server/seedPoolData";
import { SEED_POOL_MODULE, generateSamplePool, gradeMemo, samplePoolJson, seedPoolModuleText } from "../tools/samplePool";

describe("S8 T1b: the grades in the bundled pool (REVIEW-R3 ruling 4)", () => {
  it("the seed command loads, checks and stores the bundled pool file with no battles (nothing graded or generated)", async () => {
    // first in its file: this worker has graded nothing yet, so the grade memo (samplePool.ts gradeSamplePool's) is empty
    expect(pickRules()).toBe(true); // PICK ships on (HULL-ON's flip)
    const memo = gradeMemo();
    const src = readFileSync(new URL("../server/seed.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from "\.\.\/tools\//); // the seed step imports no generator (was tools/samplePool.ts)
    expect(src).not.toMatch(/from "\.\.\/src\/sim\/harness\//); // nor a harness that plays a battle
    const dir = mkdtempSync(join(tmpdir(), "s8-t1b-"));
    try {
      const store = new JsonlStore(dir);
      store.load();
      const t0 = performance.now();
      const r = await seedStore(store);
      const ms = performance.now() - t0;
      console.log(`S8 T1b: the seed command's step stored the bundled file (${SEED_POOL.length} ghosts) in ${ms.toFixed(0)} ms, with no battles`);
      // BUMP-1D: the bundled file is the long world's (LONG_RUN ships on): 192 ghosts over days 1-16 (was 120 over days 1-10)
      expect(r).toEqual({ rules: RULES_VERSION, entries: 192, written: 192, unchanged: 0, removed: 0 });
      expect(gradeMemo(), "no grading at boot").toBe(memo);
      // the store holds exactly the file's ghosts, each with the file's grade
      const want = new Map(bundledSeedPool().map((raw) => { const s = checkSnapshot(raw); return [ghostId(s), s.grade] as const; }));
      const got = new Map<string, number | undefined>();
      for (let day = 1; day <= 16; day++) for (const e of await store.bucket(RULES_VERSION, day, "pool")) got.set(e.id, e.snapshot.grade); // BUMP-1D: days 1-16 (was 1-10)
      expect(got).toEqual(want);
      expect(await seedStore(store)).toMatchObject({ written: 0, unchanged: 192, removed: 0 }); // idempotent, as the release command
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("the file's ghosts are this build's rules, v3, each with a grade in 0..GRADE_MAX", () => {
    expect(SEED_POOL_RULES).toBe(RULES_VERSION);
    const pool = bundledSeedPool().map((raw) => checkSnapshot(raw));
    expect(pool).toHaveLength(192); // BUMP-1D: the long world's pool (4 heroes x 16 days x 3 variants; was 120, days 1-10)
    for (const s of pool) {
      expect([s.rules, s.v], `${s.hero} d${s.day}`).toEqual([RULES_VERSION, SNAPSHOT_V3]);
      expect(Number.isInteger(s.grade) && s.grade! >= 0 && s.grade! <= GRADE_MAX, `${s.hero} d${s.day} grade ${s.grade}`).toBe(true);
    }
  });

  it("the bundled pool file is generateSamplePool()'s output with PICK on, byte for byte (gen:ghosts writes it; it moves with the pools)", () => {
    const pool = withPick(() => generateSamplePool(), true);
    expect(bundledSeedPoolJson()).toBe(samplePoolJson(pool));
    expect(readFileSync(new URL(`../${SEED_POOL_MODULE}`, import.meta.url), "utf8")).toBe(seedPoolModuleText(pool));
  }, 900_000); // the 120 ghosts' grading (5,760 battles) and their runs: 70-110 s alone; room for a loaded suite (BUMP-1D: now 192 ghosts, days 1-16: about 2 minutes alone, more loaded)
});
