// Write the sample ghost pool (40 validated snapshots, days 1-10, both heroes).
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
