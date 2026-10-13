// SHAPES-1 (REQ-BFG-086.6; BRIEF-SHAPES1 step 7d): each hero's par-field CROSS WIN RATE, SHAPES off or on (--shapes), every
// base switch as it ships (NPC_DAY, HULL_SCALE, LADDER_FIX on); "without HEARTS/GUARD/PICK/OPEN_RUNES/FREE_JOINS" (not in
// this base). The pairing is tools/fightBench.ts's (the source of PLAN-AZ's hero cross-win band): the par decks
// parField(hero, day, k) of FURNACE, WEAVER, FOUNDRY and BASTION; every cross pairing (A, B) plays `--seeds` battle seeds,
// each from both sides; seed s of (A, B) on day d is hashSeed("fightBench", d, A, B, s) and puts A's deck s mod k against
// B's deck (s + 1 + floor(s / k)) mod k. A hero's cross win rate: its points over its cross battles (a draw counts a half).
// The same seeds and deck indices with SHAPES off and on, so the two reads are paired battle for battle (the decks differ
// where the shaped par player buys or places otherwise).
// Usage: node <built>/cross.js --shapes on --days 5,10 --k 24 --seeds 400 --out cross-on.json
// Pure harness reads; writes only --out.
import { writeFileSync } from "node:fs";
import { hashSeed } from "../../src/core/rng";
import { simulate } from "../../src/sim/battle";
import type { HeroId } from "../../src/sim/content";
import type { Build } from "../../src/sim/deck";
import { setHullScale } from "../../src/sim/hullScale";
import { setLadderFix } from "../../src/sim/ladderFix";
import { setNpcDay } from "../../src/sim/npcDay";
import { setShapes, shapesRules } from "../../src/sim/shapes";
import { parField } from "../../src/sim/harness/par";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const ON = arg("--shapes", "on") === "on";
const DAYS = arg("--days", "5,10").split(",").map(Number);
const K = Number(arg("--k", "24")), S = Number(arg("--seeds", "400"));
const OUT = arg("--out", `cross-${ON ? "on" : "off"}.json`);
const HEROES: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

setHullScale(true);
setLadderFix(true);
setNpcDay(true);
setShapes(ON);

const t0 = Date.now();
const label = `SHAPES ${ON ? "on" : "off"}, NPC_DAY/HULL_SCALE/LADDER_FIX on, without HEARTS/GUARD/PICK/OPEN_RUNES/FREE_JOINS`;
const rows: unknown[] = [];
for (const day of DAYS) {
  const fields: Build[][] = HEROES.map((h) => parField(h, day, K));
  const pts = HEROES.map(() => 0), n = HEROES.map(() => 0);
  const pair: Record<string, { a: number; n: number }> = {};
  for (let x = 0; x < HEROES.length; x++) for (let y = x + 1; y < HEROES.length; y++) {
    let ax = 0, nn = 0;
    for (let s = 0; s < S; s++) {
      const seed = hashSeed("fightBench", day, HEROES[x], HEROES[y], s);
      const i = s % K, j = (s + 1 + Math.floor(s / K)) % K;
      const A = fields[x][i], B = fields[y][j];
      const w0 = simulate(A, B, seed, undefined, undefined, day).winner; // A as side 0
      const w1 = simulate(B, A, seed, undefined, undefined, day).winner; // A as side 1
      const p = (w0 === 0 ? 1 : w0 === -1 ? 0.5 : 0) + (w1 === 1 ? 1 : w1 === -1 ? 0.5 : 0);
      pts[x] += p; pts[y] += 2 - p; n[x] += 2; n[y] += 2;
      ax += p; nn += 2;
    }
    pair[`${HEROES[x]}-${HEROES[y]}`] = { a: ax / nn, n: nn };
  }
  const per = Object.fromEntries(HEROES.map((h, i) => [h, { win: pts[i] / n[i], battles: n[i] }]));
  rows.push({ day, per, pair });
  console.log(`cross ${ON ? "on " : "off"} d${day} ${HEROES.map((h, i) => `${h} ${(100 * pts[i] / n[i]).toFixed(1)}%`).join(" | ")} (${n[0]} battles a hero) | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
writeFileSync(OUT, JSON.stringify({ shapes: ON, shapesRules: shapesRules(), label, days: DAYS, k: K, seeds: S, rows, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
console.log(`cross ${ON ? "on" : "off"}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
