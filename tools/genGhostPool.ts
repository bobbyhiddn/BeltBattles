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

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { encodeSnapshot } from "../src/net/snapshot";
import { SEED_POOL_MODULE, generateSamplePool, samplePoolJson, seedPoolModuleText } from "./samplePool";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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
const bundle = flag("bundle") ?? (botRunes === undefined ? SEED_POOL_MODULE : "none");
if (bundle !== "none") {
  const path = resolve(bundle);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, seedPoolModuleText(pool));
  console.log(`wrote the bundled pool file ${path}: ${pool.length} ghosts, ${pool.filter((s) => typeof s.grade === "number").length} with a grade`);
}

const one = flag("one");
if (one) {
  writeFileSync(resolve(one), encodeSnapshot(pool[0]));
  console.log(`wrote one snapshot (${pool[0].hero} day ${pool[0].day}) to ${resolve(one)}`);
}
