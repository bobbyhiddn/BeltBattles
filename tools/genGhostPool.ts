// Write the sample ghost pool, the server's seed pool (120 validated snapshots, days 1-10, the four playable heroes:
// FURNACE and WEAVER's 40 sample ghosts and 20 floor ghosts, 0.7.0a D5, from the stand-in pool; FOUNDRY and BASTION's 60,
// 0.8.0 RC, from the par player's field). It fails loudly if a ghost fails validateUpload (the player mode) or the shop's strict
// rules, if a record label is not reachable, or if a reachable state has fewer than 2 eligible ghosts (tools/samplePool.ts).
//   npm run gen:ghosts -- --out ../output/ghost-pool.sample.json [--one first-ghost.json]
// --one also writes the first snapshot on its own (handy for curl smoke tests).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { encodeSnapshot } from "../src/net/snapshot";
import { generateSamplePool, samplePoolJson } from "./samplePool";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const out = resolve(flag("out") ?? "server/dist/ghost-pool.sample.json");
const pool = generateSamplePool();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, samplePoolJson(pool));
console.log(`wrote ${pool.length} ghost snapshots (${new Set(pool.map((s) => s.day)).size} days, heroes ${[...new Set(pool.map((s) => s.hero))].join("+")}) to ${out}`);

const one = flag("one");
if (one) {
  writeFileSync(resolve(one), encodeSnapshot(pool[0]));
  console.log(`wrote one snapshot (${pool[0].hero} day ${pool[0].day}) to ${resolve(one)}`);
}
