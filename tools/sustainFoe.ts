// BOTS-X (REQ-BFG-069): the expected dusk foe by day, for the bots' sustain valuation. The sustain switch is ON for the
// whole process (content.ts setSustain(true), first thing in main, before any field is built). The par fields (par.ts
// parField: the par player's decks, seeds 1..k) of every playable hero (heroBuilds.ts PLAYABLE_HEROES: FURNACE, WEAVER,
// FOUNDRY, BASTION) meet as tools/sustainBench.ts's main loop pairs them: every cross pair and every mirror (heroes
// x <= y; decks i, j; a mirror only j > i), S seeds each, seed = hashSeed("botsx-foe", day, heroes[x], heroes[y], i, j, s),
// every seed played from both sides (a vs b and b vs a, the same seed). Each battle runs single-threaded (simulate()'s
// loop) and its events are read every step: an `impact` event's `side` is the side HIT and its `dmg` what the hit dealt
// (0 when a SHIELD stopped it; SideState.blocked counts those).
// Per battle and side s (the foe is 1 - s): t (bt.t), hits (the impacts s took), hitDmg (their dmg), stopped
// (bt.sides[s].blocked: hits a SHIELD stopped), foeBurn (bt.sides[1 - s].stats.burnDealt > 0).
// Reports, per day: battles; the fight's length (mean, median, p10, p90 of t, seconds); burn (the share of (battle,
// side) records whose foe dealt BURN); hit (sum hitDmg / max(1, sum hits - sum stopped): the mean unstopped hit, N1
// units); hits and stopped per side (per battle); the field build and play seconds.
//   npx vite build --ssr tools/sustainFoe.ts --outDir tools/dist/botsx-foe --emptyOutDir --logLevel warn
//   nice -n 19 node tools/dist/botsx-foe/sustainFoe.js --days 1,2,3 --k 6 --seeds 4 --json foe-d1-3.json
// Its one run (on bx e1e1004, 2026-10-05 06:14:33Z, four shards: days 1-3, 4-6, 7-8, 9-10, k 6, 4 seeds) is pinned as
// src/sim/deckRating.ts SUSTAIN_FOE, which the bots' sustain value reads; no test re-runs it.
// PAR-AZ (REQ-BFG-079): --ladder-fix, --hull-scale, --npc-day and --all-on (all three) as fightBench's, each through its
// module's setter in main() before any field is built. With a switch on: a line names them, the JSON gets `switches`, each
// row `m` (M(d) = dayMulTenths(day) / 10 with HULL_SCALE on, else 1) and `hitM` = hit / m (console "hit/M"), the hit in
// day-1 units: the rating's hull and sustain are day-1 numbers and a day's hull is M(d) x its day-1 hull. None on: as before.

import { writeFileSync } from "node:fs";
import { hashSeed } from "../src/core/rng";
import { Battle } from "../src/sim/battle";
import { setSustain, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { parField } from "../src/sim/harness/par";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { ladderFixRules, setLadderFix } from "../src/sim/ladderFix"; // PAR-AZ (REQ-BFG-079): --ladder-fix
import { dayMulTenths, hullScaleRules, setHullScale } from "../src/sim/hullScale"; // PAR-AZ: --hull-scale; M(d)
import { npcDayRules, setNpcDay } from "../src/sim/npcDay"; // PAR-AZ: --npc-day

interface Fight { a: number; b: number; seed: number; day?: number } // HULL-1a (REQ-BFG-079): the day the fight is on
type Pair<T> = [T, T];
/** One battle: its length (s), and per side s: the impacts s took, their dmg, the hits s's SHIELD stopped, and whether
 *  s's foe (1 - s) dealt BURN. */
export interface Rec { t: number; hits: Pair<number>; hitDmg: Pair<number>; stopped: Pair<number>; foeBurn: Pair<boolean> }

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const num = (name: string, d: number): number => (flag(name) === undefined ? d : Number(flag(name)));
const has = (name: string): boolean => process.argv.includes(`--${name}`); // PAR-AZ: the switch flags

/** One battle, simulate()'s loop, its events read each step. */
export function play(A: Build, B: Build, seed: number, day?: number): Rec {
  const bt = new Battle(A, B, seed, undefined, day); // HULL-1a (REQ-BFG-079): the day
  const hits: Pair<number> = [0, 0], hitDmg: Pair<number> = [0, 0];
  while (!bt.over && bt.ticks < 60 * 200) {
    bt.step();
    for (const e of bt.events) {
      if (e.type !== "impact") continue;
      hits[e.side]++; // the side HIT
      hitDmg[e.side] += e.dmg;
    }
    bt.events.length = 0;
  }
  const [s0, s1] = bt.sides;
  return {
    t: bt.t, hits, hitDmg, stopped: [s0.blocked ?? 0, s1.blocked ?? 0],
    foeBurn: [s1.stats.burnDealt > 0, s0.stats.burnDealt > 0],
  };
}

const q = (xs: number[], p: number): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };

function main(): void {
  setSustain(true); // the sustain switch ON for the whole process, before any field is built
  // PAR-AZ (REQ-BFG-079): fightBench's switch flags, each through its module's setter, before any field is built
  const allOn = has("all-on");
  if (allOn || has("ladder-fix")) setLadderFix(true);
  if (allOn || has("hull-scale")) setHullScale(true);
  if (allOn || has("npc-day")) setNpcDay(true);
  // the switches on (as the modules read them): none, and every line and the JSON are as before
  const on = [ladderFixRules() ? "LADDER_FIX" : "", hullScaleRules() ? "HULL_SCALE" : "", npcDayRules() ? "NPC_DAY" : ""].filter(Boolean);
  if (on.length) console.log(`switches: ${on.join(", ")} on (each through its module's setter); every other switch as committed`);
  const days = (flag("days") ?? "1,2,3,4,5,6,7,8,9,10").split(",").map(Number);
  const k = num("k", 6), S = num("seeds", 4);
  const heroes: readonly HeroId[] = PLAYABLE_HEROES;
  const H = heroes.length;
  const jf = flag("json");
  const date = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const day of days) {
    const t0 = performance.now();
    const field: Build[] = [];
    for (const h of heroes) field.push(...parField(h, day, k));
    const fieldSecs = (performance.now() - t0) / 1000;
    const fights: Fight[] = [];
    let mirrors = 0;
    for (let x = 0; x < H; x++) for (let y = x; y < H; y++) for (let i = 0; i < k; i++) for (let j = x === y ? i + 1 : 0; j < k; j++) {
      for (let s = 0; s < S; s++) {
        const seed = hashSeed("botsx-foe", day, heroes[x], heroes[y], i, j, s);
        fights.push({ a: x * k + i, b: y * k + j, seed, day });
        fights.push({ a: y * k + j, b: x * k + i, seed, day });
        if (x === y) mirrors += 2;
      }
    }
    const t1 = performance.now();
    const ts: number[] = [];
    let hits = 0, hitDmg = 0, stopped = 0, burnSides = 0;
    for (const f of fights) {
      const r = play(field[f.a], field[f.b], f.seed, f.day);
      ts.push(r.t);
      for (const s of [0, 1] as const) {
        hits += r.hits[s]; hitDmg += r.hitDmg[s]; stopped += r.stopped[s];
        if (r.foeBurn[s]) burnSides++;
      }
    }
    const playSecs = (performance.now() - t1) / 1000;
    const N = fights.length, sides = 2 * N;
    const hit = hitDmg / Math.max(1, hits - stopped);
    // PAR-AZ (REQ-BFG-079): M(d) with HULL_SCALE on (else 1), and the hit in day-1 units (hit / M); only with a switch on
    const m = hullScaleRules() ? dayMulTenths(day) / 10 : 1, hitM = hit / m;
    const row = {
      day, k, seeds: S, heroes, battles: N, mirrors,
      mean: ts.reduce((a, b) => a + b, 0) / N, median: q(ts, 0.5), p10: q(ts, 0.1), p90: q(ts, 0.9),
      burn: burnSides / sides, hit, ...(on.length ? { m, hitM } : {}),
      hitsPerSide: hits / sides, stoppedPerSide: stopped / sides,
      totals: { sides, hits, hitDmg, stopped, burnSides },
      fieldSecs: Math.round(fieldSecs * 10) / 10, playSecs: Math.round(playSecs * 10) / 10,
    };
    rows.push(row);
    console.log(`day ${day} | k ${k} seeds ${S} | ${N} battles (${mirrors} mirror) | fight mean ${row.mean.toFixed(2)} med ${row.median.toFixed(2)} p10 ${row.p10.toFixed(2)} p90 ${row.p90.toFixed(2)} s | burn ${(100 * row.burn).toFixed(1)}% | hit ${row.hit.toFixed(1)} | hits/side ${row.hitsPerSide.toFixed(2)} stopped/side ${row.stoppedPerSide.toFixed(3)} | field ${row.fieldSecs} s play ${row.playSecs} s${on.length ? ` | hit/M ${hitM.toFixed(1)}` : ""}`);
    // after every day, so a cut-short run keeps the days it finished (PAR-AZ: `switches` only with a switch on)
    if (jf) writeFileSync(jf, JSON.stringify({ args: process.argv.slice(2), date, ...(on.length ? { switches: on } : {}), complete: rows.length === days.length, rows }, null, 1));
  }
}

// only when the built bench runs (node .../sustainFoe.js); imported elsewhere, it does nothing
if (process.argv[1]?.endsWith("sustainFoe.js")) main();
