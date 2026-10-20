// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E8): THE DRY STAND-IN SAMPLE. A small sample of par decks with ENCHANT on, made the way the
// generators make them (the par player's runs through the game's caravan and road), checked the way the generators check them, and written
// under one directory ONLY (default W/tmp/enchant1-dry). It never runs a generator's --check or write path, never reads or writes
// server/seedPoolData.ts or src/sim/standInPoolData.ts, and changes no committed file.
//   npx vite build --ssr tools/enchant1/drySample.ts --outDir <W>/tmp/enchant1-dry/bin --emptyOutDir --logLevel warn
//   node <W>/tmp/enchant1-dry/bin/drySample.js [--out <dir>] [--heroes furnace,weaver,foundry,bastion] [--days 3,5,7,10] [--seeds 1-6]
//
// For every (hero, seed, day) of the sample, the par player's dusk deck of that day (src/sim/harness/player.ts playerRun) is
//   1. checked as a seed ghost (tools/samplePool.ts seedGhost: checkSnapshot, validateBuild's strict lines, validateUpload in player mode
//      with the run seed and the road log, a reachable record), the same checks genGhostPool.ts runs on every ghost of the seed pool;
//   2. encoded as a stand-in code (the loader's encodeStarred, the harness's, and standins.ts standInCodeOf, the generator's) and decoded
//      again: the word, WIDE's side and GROWING's counter must come back, and the code must be a fixed point;
//   3. encoded as a snapshot (snapshot.ts encodeSnapshot) and decoded again: equal.
// It prints how many words the decks hold by day, which words, and every refusal with its seed (a refusal is a finding, never weakened here).

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { RULES_VERSION, type HeroId } from "../../src/sim/content";
import { enchantRules, withEnchant } from "../../src/sim/enchant";
import { maxEnchantsByDay } from "../../src/sim/enchantSources";
import { enchantExtraWords } from "../../src/net/enchantCheck"; // ENCHANT-2 (REQ-BFG-085, T2): the warlord drops add to the bound
import { encodeStarred as loaderEncode, decodeStarred as loaderDecode } from "../../src/sim/standInPool";
import { decodeStarred, encodeStarred } from "../../src/sim/harness/standinCode";
import { decodeStandInCode, standInCodeOf } from "../../src/sim/harness/standins";
import { parRunSeed, playerRoadLog, playerRun, type PlayerDay } from "../../src/sim/harness/player";
import { wordCount, wordsHeld } from "../../src/sim/harness/enchantBot";
import { floorRecord } from "../../src/net/records";
import { decodeSnapshot, encodeSnapshot } from "../../src/net/snapshot";
import { validateUpload } from "../../src/net/validate";
import { seedGhost } from "../samplePool";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const range = (s: string): number[] => (/^(\d+)-(\d+)$/.test(s) ? Array.from({ length: Number(s.split("-")[1]) - Number(s.split("-")[0]) + 1 }, (_, i) => Number(s.split("-")[0]) + i) : s.split(",").map(Number));

const out = resolve(flag("out") ?? "tmp/enchant1-dry");
if (!/enchant1-dry/.test(out)) throw new Error(`drySample: the output directory must be an enchant1-dry directory (got ${out}): it writes there only`);
const HEROES: HeroId[] = (flag("heroes") ?? "furnace,weaver,foundry,bastion").split(",") as HeroId[];
const DAYS = range(flag("days") ?? "3,5,7,10");
const SEEDS = range(flag("seeds") ?? "1-6");

interface Row { hero: HeroId; seed: number; day: number; words: number; list: string; code: string }
const rows: Row[] = [];
const findings: string[] = [];
const byDay = new Map<number, number[]>();
let decks = 0, valid = 0, trips = 0;

withEnchant(() => {
  if (!enchantRules()) throw new Error("drySample: ENCHANT must be on");
  for (const hero of HEROES) {
    for (const seed of SEEDS) {
      const days: PlayerDay[] = playerRun(hero, Math.max(...DAYS), seed);
      for (const day of DAYS) {
        const d = days[day - 1];
        decks++;
        const tag = `${hero} seed ${seed} day ${day}`;
        const runSeed = parRunSeed(hero, seed) >>> 0;
        const road = playerRoadLog(days, day);
        // 1. the generators' checks on the deck as a seed ghost, and the server's player mode on its own
        try {
          seedGhost(hero, day, 0, d.build, floorRecord(day), Date.UTC(2026, 9, 17), runSeed, road);
          const up = validateUpload(d.build, day, RULES_VERSION, { seed: runSeed, road });
          if (!up.ok) throw new Error(`validateUpload: ${up.errors.join("; ")}`);
          valid++;
        } catch (e) {
          findings.push(`${tag}: REFUSED: ${(e as Error).message}`);
        }
        // 2. the stand-in codes round-trip with their words
        const held = wordsHeld(d.build);
        const code = encodeStarred(d.build);
        const key = (b: typeof d.build): string => wordsHeld(b).map((w) => `${w.word}@${w.def}:${w.grow}`).sort().join(",");
        try {
          for (const c of [code, loaderEncode(d.build), standInCodeOf(d.build, "on")]) {
            if (c !== code) throw new Error("the three encoders disagree");
            const back = decodeStarred(hero, c);
            if (key(back) !== key(d.build)) throw new Error(`decoded words ${key(back)} != ${key(d.build)}`);
            if (encodeStarred(back) !== c || loaderEncode(loaderDecode(hero, c)) !== c || encodeStarred(decodeStandInCode(hero, c, "on")) !== c) throw new Error("the code is not a fixed point");
          }
          if (held.length && !code.includes("~")) throw new Error("a deck with words has a code without `~`");
          trips++;
        } catch (e) {
          findings.push(`${tag}: CODE: ${(e as Error).message}`);
        }
        // 3. the snapshot round-trips (the words travel as ench / enchDir / grow)
        try {
          const snap = seedGhost(hero, day, 0, d.build, floorRecord(day), Date.UTC(2026, 9, 17), runSeed, road);
          if (JSON.stringify(decodeSnapshot(encodeSnapshot(snap)).build) !== JSON.stringify(snap.build)) throw new Error("snapshot decode differs");
        } catch (e) {
          findings.push(`${tag}: SNAPSHOT: ${(e as Error).message}`);
        }
        const n = wordCount(d.build);
        if (n > maxEnchantsByDay(day, false, enchantExtraWords(day))) findings.push(`${tag}: ${n} words but day ${day} allows ${maxEnchantsByDay(day, false, enchantExtraWords(day))}`); // ENCHANT-2: + the drops
        byDay.set(day, [...(byDay.get(day) ?? []), n]);
        rows.push({ hero, seed, day, words: n, list: held.map((w) => `${w.word}@${w.def}${w.grow ? `:${w.grow}` : ""}`).join(" "), code });
      }
    }
  }
});

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const lines = [
  `ENCHANT-1 dry stand-in sample (ENCHANT on, rules ${RULES_VERSION}): ${decks} par decks = ${HEROES.length} heroes x seeds ${SEEDS[0]}-${SEEDS[SEEDS.length - 1]} x days ${DAYS.join(",")}`,
  `validated (seedGhost: checkSnapshot + validateBuild + validateUpload with the run seed and road log): ${valid} of ${decks}`,
  `stand-in code round-trips (loader, harness and generator encoders agree; words, sides and counters come back; fixed point): ${trips} of ${decks}`,
  `words held by day (mean, max, decks with at least one):`,
  ...DAYS.map((day) => { const xs = byDay.get(day) ?? []; return `  day ${String(day).padStart(2)}: mean ${mean(xs).toFixed(2)}  max ${Math.max(0, ...xs)}  with a word ${xs.filter((x) => x > 0).length} of ${xs.length}`; }),
  findings.length ? `FINDINGS (${findings.length}):` : "findings: none",
  ...findings.map((f) => `  ${f}`),
];
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "dry-sample.txt"), lines.join("\n") + "\n");
writeFileSync(resolve(out, "dry-sample.json"), JSON.stringify({ rules: RULES_VERSION, decks, valid, trips, findings, rows }, null, 1) + "\n");
console.log(lines.join("\n"));
console.log(`wrote ${resolve(out, "dry-sample.txt")} and dry-sample.json`);
process.exit(findings.length ? 1 : 0);
