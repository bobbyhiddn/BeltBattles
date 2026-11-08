// Write the sample ghost pool, the server's seed pool (120 validated snapshots, days 1-10, the four playable heroes:
// FURNACE and WEAVER's 40 sample ghosts and 20 floor ghosts, 0.7.0a D5, from the stand-in pool; FOUNDRY and BASTION's 60,
// 0.8.0 RC, from the par player's field). It fails loudly if a ghost fails validateUpload (the player mode) or the shop's strict
// rules, if a record label is not reachable, or if a reachable state has fewer than 2 eligible ghosts (tools/samplePool.ts).
//   npm run gen:ghosts -- --out ../output/ghost-pool.sample.json [--one first-ghost.json] [--bundle <path>|none]
// --one also writes the first snapshot on its own (handy for curl smoke tests).
// S8 T1b (REQ-BFG-092; REVIEW-R3 ruling 4, BRIEF-S8 T1b): it also writes the bundled pool file, server/seedPoolData.ts
// (tools/samplePool.ts SEED_POOL_MODULE, seedPoolModuleText; --bundle <path> elsewhere, --bundle none to skip): the same
// snapshots, with PICK on each with the seed step's grade, in the data module the server bundles. The seed command
// (server/seed.ts seedStore, the Fly release_command) loads, checks and stores that file with no battles. Commit it with the
// pools it was dealt from. With --bot-runes (a pool other than generateSamplePool()'s default) it is written only when
// --bundle names a path.
// RUN-1 T8 (REQ-BFG-059, REQ-BFG-116; RULING-RUN1-R1 R1.1): --long-run makes the pool under long-run rules (src/sim/longRun.ts
// setLongRun(true)): days 1-16 (tools/samplePool.ts poolDepth), every seed ghost stating its `losses`. LONG_RUN ships OFF and the
// committed pool is the 10-day one, so this is a SCRATCH tool until the release bump: --long-run NEVER writes
// server/seedPoolData.ts (like --bot-runes, its bundled file is written only when --bundle names a path, and never that one).
// --soft1-picks <file> sets BB_SOFT1_PICKS_FILE: the scratch rows of SOFT-1's rule for the long-run days past SOFT1_PICKS' (never
// committed; tests/run1.seedpool.test.ts BB_SOFT1_LONG_RULE=1 writes them). Without the flag and the variable, a long-run day past
// the table takes the decks as before SOFT-1. With the switch off (no --long-run) nothing here changes: the output is byte for
// byte the committed server/seedPoolData.ts (output-run1/T8-proof.md).
// GATES-1 (REQ-BFG-052, G6): --gates makes the pool with GATES on (src/sim/gates.ts setGates(true)): the par player buys and places
// FUSER, SCATTER MILL and SMELTER, and the ghosts' codes and snapshots carry them. A DRY run: it needs --out (a scratch file), NEVER
// writes server/seedPoolData.ts (like --long-run: the bundled file only when --bundle names another path, and
// tools/samplePool.ts seedPoolModuleText refuses in that world anyway: SOFT-1's picks were read without gates), and the release's bump
// regenerates the real pool once.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { encodeSnapshot } from "../src/net/snapshot";
import { SEED_POOL_MODULE, generateSamplePool, samplePoolJson, seedPoolModuleText } from "./samplePool";
import { setLongRun } from "../src/sim/longRun"; // RUN-1 T8: --long-run (last in the list: already loaded above)
import { scaleRules, setScaleRigs } from "../src/sim/scale"; // BUMP-1E P2e (REQ-BFG-098): the scaling world held on while the pool is dealt
import { gatesRules, setGates } from "../src/sim/gates"; // GATES-1 (REQ-BFG-052, G6): --gates (already loaded above: samplePool.ts); BUMP-1F: its switch is put back in the finally below
import { enchantRules, setEnchant } from "../src/sim/enchant"; // BUMP-1F P2 (REQ-BFG-085): the words held on while the pool is dealt
import { curveRules, setCurve } from "../src/net/curve"; // BUMP-1H P2 (REQ-BFG-124): the difficulty curve held on while the pool is dealt (set inside the try/finally, never withCurve(async ...))

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// BUMP-1E P2e (SCALE-2d F6; SCALE-2e carry-over 9): the pool is dealt with the scaling world on for the whole run: setScaleRigs(true)
// held inside try/finally, never withScaleRigs(async ...) (this tool is synchronous today, but every pool generator holds the switch the
// same way). SCALE_RIGS is true in the code now, so setScaleRigs(true) does nothing there; it makes the pool independent of the constant.
// BUMP-1F (PACKET-BUMP-0130 section 4): GATES-1's --gates (its setGates and its two guards) sits inside this try/finally beside
// --long-run, and the finally puts GATES back too.
// BUMP-1F P2: GATES and ENCHANT are true in the code now (the flip), so --gates and these calls change nothing there; the pool is dealt with
// both on whatever a caller left them at.
const wasScale = scaleRules();
const wasGates = gatesRules();
const wasEnchant = enchantRules();
const wasCurve = curveRules();
setScaleRigs(true);
setGates(true);
setEnchant(true);
setCurve(true); // BUMP-1H (REQ-BFG-124): the difficulty curve's world for the whole run (slot 1, the streak tier and the depth ghosts), put back in the finally below
try {
  // RUN-1 T8: the long run's pool (scratch): the switch before anything is generated, the pick rows named before the first pick
  const longRunPool = process.argv.includes("--long-run");
  if (longRunPool) setLongRun(true);
  // GATES-1 (REQ-BFG-052, G6): the pool with the three gates on (scratch; see the header)
  const gatesPool = process.argv.includes("--gates");
  if (gatesPool) {
    if (flag("out") === undefined) throw new Error("--gates: a dry run, name the scratch file with --out (it never writes the committed pool)");
    setGates(true);
  }
  const picksFile = flag("soft1-picks");
  if (picksFile !== undefined) process.env.BB_SOFT1_PICKS_FILE = picksFile.split(",").map((p) => resolve(p)).join(",");

  const out = resolve(flag("out") ?? "server/dist/ghost-pool.sample.json");
  // RUNES-2a (REQ-BFG-058): --bot-runes on|off, the race decks' par player takes a rune at each dawn; absent: runes.ts
  // BOT_RUNES (off), so the pool is generated exactly as before
  const botRunes = flag("bot-runes");
  if (botRunes !== undefined && botRunes !== "on" && botRunes !== "off") throw new Error(`--bot-runes must be "on" or "off", got ${botRunes}`);
  const pool = generateSamplePool(botRunes === undefined ? {} : { botRunes: botRunes === "on" });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, samplePoolJson(pool));
  console.log(`wrote ${pool.length} ghost snapshots (${new Set(pool.map((s) => s.day)).size} days, heroes ${[...new Set(pool.map((s) => s.hero))].join("+")}) to ${out}`);

  // S8 T1b: the bundled pool file (the seed command's; see the header)
  const bundle = flag("bundle") ?? (botRunes === undefined && !longRunPool && !gatesPool ? SEED_POOL_MODULE : "none"); // RUN-1 T8: a long-run pool only to a named path; GATES-1: so is a gates pool
  if (bundle !== "none") {
    const path = resolve(bundle);
    // RUN-1 T8: the long run's pool is never the committed file (the release bump writes that one, from its own world)
    if (longRunPool && path === resolve(SEED_POOL_MODULE)) throw new Error(`--long-run never writes ${SEED_POOL_MODULE}: name a scratch path with --bundle`);
    if (gatesPool && path === resolve(SEED_POOL_MODULE)) throw new Error(`--gates never writes ${SEED_POOL_MODULE}: name a scratch path with --bundle`); // GATES-1 (REQ-BFG-052, G6)
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, seedPoolModuleText(pool));
    console.log(`wrote the bundled pool file ${path}: ${pool.length} ghosts, ${pool.filter((s) => typeof s.grade === "number").length} with a grade`);
  }

  const one = flag("one");
  if (one) {
    writeFileSync(resolve(one), encodeSnapshot(pool[0]));
    console.log(`wrote one snapshot (${pool[0].hero} day ${pool[0].day}) to ${resolve(one)}`);
  }
} finally {
  setCurve(wasCurve);
  setEnchant(wasEnchant);
  setGates(wasGates);
  setScaleRigs(wasScale);
}
