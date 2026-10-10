// PAR-AZ (REQ-BFG-079): src/sim/deckRating.ts FIGHT_BY_DAY's measuring tool. CAND-A (f9a5482, on 12c8e5a) measured the
// table with a probe it never committed: "the typical field against itself, K 12, both heroes both ways" (deckRating.ts:
// the typical par field against itself, K = 12, FURNACE and WEAVER both ways, one battle per pairing). This is that method
// as a tool, so the table can be re-measured (with every switch on, for HULL_SCALE's table).
// THE FIELD of day d: parField(hero, d, k) of each hero in --heroes, in that order (par.ts: the typical par player's decks
// of seeds 1..k; default furnace,weaver and k 12), decks numbered 0..n-1 (n = heroes x k: 24). A par run plays all 10
// days once and par.ts caches it, so a shard's first day pays for the runs ("field" seconds) and its later days don't.
// THE FIGHTS: every ordered pair (a, b) of two different decks (mirror and cross pairs, both orders), ONE battle each, on
// the day (Battle's trailing day), seed hashSeed("fightByDay", d, a, b); sustainFoe.ts play()'s loop (step while not over
// and ticks < 60 x 200, the events cleared each step). n(n - 1) battles a day: 552 at k 12.
// PER DAY: battles; the fight length bt.t in seconds: the MEAN (FIGHT_BY_DAY's value), median, p10 and p90 (nearest rank,
// sustainFoe's q); hard stops (t >= BATTLE_CAP, 120 s); the field build and play seconds. One console line a day; --json
// <file> rewritten after every day (args, date, switches, complete, rows), so a cut-short shard keeps the days it finished.
// --ladder-fix (LADDER_FIX), --hull-scale (HULL_SCALE), --npc-day (NPC_DAY) and --all-on (all three) as fightBench's, each
// through its module's setter before any field is built; the sustain switch as committed (SUSTAIN_LIVE). Single-threaded:
// shard it by --days (a list 1,2,3 or a range 1-10; days 1-10, default all). From the repo root:
//   npx vite build --ssr tools/fightByDay.ts --outDir tools/dist/fightbyday --emptyOutDir --logLevel warn
//   nice -n 19 node tools/dist/fightbyday/fightByDay.js --days 1,2,3 --k 12 --all-on --json fbd-d1-3.json
//   (and --days 4,5,6, --days 7,8, --days 9,10, at once, each with its own --json)

import { writeFileSync } from "node:fs";
import { hashSeed } from "../src/core/rng";
import { Battle } from "../src/sim/battle";
import { BATTLE_CAP, HEROES, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { parField } from "../src/sim/harness/par";
import { PLAYER_DAYS } from "../src/sim/harness/player";
import { ladderFixRules, setLadderFix } from "../src/sim/ladderFix";
import { hullScaleRules, setHullScale } from "../src/sim/hullScale";
import { npcDayRules, setNpcDay } from "../src/sim/npcDay";

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const num = (name: string, d: number): number => (flag(name) === undefined ? d : Number(flag(name)));
const has = (name: string): boolean => process.argv.includes(`--${name}`);

/** --days: "1,2,3", "1-10" or both ("1-3,7"). */
function parseDays(s: string): number[] {
  return s.split(",").flatMap((p) => {
    const r = /^(\d+)-(\d+)$/.exec(p.trim());
    if (!r) return [Number(p)];
    const a = Number(r[1]), b = Number(r[2]);
    return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  });
}

/** One battle on `day` (sustainFoe.ts play()'s loop, no event read): its length in seconds. */
export function fightLength(A: Build, B: Build, seed: number, day: number): number {
  const bt = new Battle(A, B, seed, undefined, day);
  while (!bt.over && bt.ticks < 60 * 200) {
    bt.step();
    bt.events.length = 0;
  }
  return bt.t;
}

const q = (xs: number[], p: number): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };

function main(): void {
  // the switch flags (fightBench's), each through its module's setter, before any field is built
  const allOn = has("all-on");
  if (allOn || has("ladder-fix")) setLadderFix(true);
  if (allOn || has("hull-scale")) setHullScale(true);
  if (allOn || has("npc-day")) setNpcDay(true);
  const switches = [ladderFixRules() ? "LADDER_FIX" : "", hullScaleRules() ? "HULL_SCALE" : "", npcDayRules() ? "NPC_DAY" : ""].filter(Boolean);
  console.log(`switches: ${switches.length ? `${switches.join(", ")} on (each through its module's setter); every other switch as committed` : "every switch as committed"}`);
  const days = parseDays(flag("days") ?? "1-10");
  const k = num("k", 12);
  const heroes = (flag("heroes") ?? "furnace,weaver").split(",") as HeroId[];
  for (const h of heroes) if (!Object.prototype.hasOwnProperty.call(HEROES, h)) throw new Error(`--heroes: no hero "${h}"`);
  // a par run has PLAYER_DAYS days (par.ts would read day 10's decks for a later day, on that later day's hull)
  if (!days.length || days.some((d) => !Number.isInteger(d) || d < 1 || d > PLAYER_DAYS)) throw new Error(`--days: whole days 1-${PLAYER_DAYS} ("1,2,3" or "1-10")`);
  if (!Number.isInteger(k) || k < 1) throw new Error(`--k: a whole number from 1`);
  const jf = flag("json");
  const date = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const day of days) {
    const t0 = performance.now();
    const field: Build[] = [];
    for (const h of heroes) field.push(...parField(h, day, k));
    const fieldSecs = (performance.now() - t0) / 1000;
    const t1 = performance.now();
    const ts: number[] = [];
    for (let a = 0; a < field.length; a++) for (let b = 0; b < field.length; b++) {
      if (a !== b) ts.push(fightLength(field[a], field[b], hashSeed("fightByDay", day, a, b), day));
    }
    const playSecs = (performance.now() - t1) / 1000;
    const N = ts.length;
    const row = {
      day, k, heroes, battles: N,
      mean: ts.reduce((a, b) => a + b, 0) / N, median: q(ts, 0.5), p10: q(ts, 0.1), p90: q(ts, 0.9),
      hardStops: ts.filter((t) => t >= BATTLE_CAP).length,
      fieldSecs: Math.round(fieldSecs * 10) / 10, playSecs: Math.round(playSecs * 10) / 10,
    };
    rows.push(row);
    console.log(`day ${day} | k ${k} ${heroes.join("+")} | ${N} battles | fight mean ${row.mean.toFixed(2)} med ${row.median.toFixed(2)} p10 ${row.p10.toFixed(2)} p90 ${row.p90.toFixed(2)} s | hard stops ${row.hardStops} | field ${row.fieldSecs} s play ${row.playSecs} s`);
    // after every day, so a cut-short shard keeps the days it finished
    if (jf) writeFileSync(jf, JSON.stringify({ args: process.argv.slice(2), date, switches, complete: rows.length === days.length, rows }, null, 1));
  }
}

// only when the built tool runs (node .../fightByDay.js); imported elsewhere, it does nothing
if (process.argv[1]?.endsWith("fightByDay.js")) main();
