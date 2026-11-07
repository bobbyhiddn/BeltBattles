// ENCHANT-1 step 9d (REQ-BFG-085 (6); BRIEF-ENCHANT1 E9d): each hero's par-field CROSS WIN RATE with ENCHANT off and on, ported from
// SHAPES-2's tools/shapes2/cross.ts. Every OTHER switch as the base ships it (SHAPES, SHAPES2, PLAIN_RIGS, LONG_RUN ... are not touched
// here), so the label of every read is: "ENCHANT on, with SHAPES2, PLAIN_RIGS and LONG_RUN as bump-accepted ships them, before BUMP-1E's
// scaling flip". The pairing is tools/fightBench.ts's (the source of PLAN-AZ's hero cross-win band): the par decks parField(hero, day, k)
// of FURNACE, WEAVER, FOUNDRY and BASTION; every cross pairing (A, B) plays `--seeds` battle seeds, each from both sides; seed s of (A, B)
// on day d is hashSeed("fightBench", d, A, B, s) and puts A's deck s mod k against B's deck (s + 1 + floor(s / k)) mod k. A hero's cross
// win rate: its points over its cross battles (a draw counts a half). The same seeds and deck indices off and on, so the two reads are
// paired battle for battle (the decks differ where par buys or places otherwise, i.e. where it bought a word).
// Usage: node <built>/cross.js --ench on --days 5,10 --k 24 --seeds 400 --out cross-on.json   (K/e1bench.sh builds and runs it)
// Pure harness reads; writes only --out. A hero that moves more than 3 points off against on is REPORTED (E9d), never tuned.
import { writeFileSync } from "node:fs";
import { hashSeed } from "../../src/core/rng";
import { simulate } from "../../src/sim/battle";
import type { HeroId } from "../../src/sim/content";
import type { Build } from "../../src/sim/deck";
import { enchantRules, setEnchant } from "../../src/sim/enchant";
import { parField } from "../../src/sim/harness/par";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const ON = arg("--ench", "on") === "on";
const DAYS = arg("--days", "5,10").split(",").map(Number);
const K = Number(arg("--k", "24")), S = Number(arg("--seeds", "400"));
const OUT = arg("--out", `cross-${ON ? "on" : "off"}.json`);
const HEROES: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

setEnchant(ON);

const t0 = Date.now();
const label = `ENCHANT ${ON ? "on" : "off"}, with SHAPES2, PLAIN_RIGS and LONG_RUN as bump-accepted ships them, before BUMP-1E's scaling flip`;
const rows: unknown[] = [];
for (const day of DAYS) {
  const fields: Build[][] = HEROES.map((h) => parField(h, day, K));
  const words = fields.map((f) => f.reduce((n, b) => n + b.items.filter((p) => p.ench !== undefined).length + (b.turrets ?? []).filter((t) => t.ench !== undefined).length, 0) / f.length);
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
  const per = Object.fromEntries(HEROES.map((h, i) => [h, { win: pts[i] / n[i], battles: n[i], wordsPerDeck: words[i] }]));
  rows.push({ day, per, pair });
  console.log(`cross ${ON ? "on " : "off"} d${day} ${HEROES.map((h, i) => `${h} ${(100 * pts[i] / n[i]).toFixed(1)}% (${words[i].toFixed(1)} words)`).join(" | ")} (${n[0]} battles a hero) | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
writeFileSync(OUT, JSON.stringify({ enchant: ON, enchantRules: enchantRules(), label, days: DAYS, k: K, seeds: S, rows, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
console.log(`cross ${ON ? "on" : "off"}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
