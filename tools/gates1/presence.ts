// GATES-1 step 7c, 7e (REQ-BFG-052, REQ-BFG-084.5, REQ-BFG-114 (3); BRIEF-GATES1 G7 c, e): THE PRESENCE BENCH, ported from
// SHAPES-2's tools/shapes2/presence.ts. Every switch as the base ships it; GATES on. Label of every read: "GATES on, with
// SHAPES2, PLAIN_RIGS and LONG_RUN as bump-accepted ships them, before BUMP-1E's scaling flip".
//
// For one subject hero (--hero; one process a hero, at most 4 at once) and each day (--days, 3,6,10), the subject's par field
// (parField, seeds 1..--k) plays the par fields of the four playable heroes (each hero's first --m members, its own member left
// out), --seeds seeds x both sides a pairing, on the day's rules (simulate's `day`). For each gate (--gates):
//  - HOLDERS (the guard's reading, REQ-BFG-084.5 "whenever it is present"): each par deck that holds it (placed by par's rule),
//    against the same deck with every copy of it lifted off (removeItem leaves the belt whole), paired fight for fight (the same
//    foes, seeds and sides): lift = whole - without, in points of win rate;
//  - INSERTED (the check for the gates the par player seldom buys): up to --ins par decks that don't hold it, with one free
//    copy at ITS BEST SPOT (splitPreview.ts suggestSplit, par's rule) at ★1, and again at ★(1 on day 3, 2 on day 6, 3 on day 10)
//    (--istars 1 keeps only the first). No gold is traded for the copy, so it reads high: an upper bound.
// Also, from the par player's runs (seeds 1..k) to each day's dusk: the buy rate and the copies bought (e), and how often a copy
// is left off the deck (bought minus the copies on the deck: in cargo, or sold).
// --set id.field=value (repeatable; field = a ★1 gate number, or price; id.L2.field) patches a def before the bench (the guard's cuts).
// --fight off plays no battle (the holder decks, the buy rates and the cargo counts only).
// Usage: node <built>/presence.js --hero furnace --days 3,6,10 --k 24 --m 6 --seeds 2 --ins 6 --out file.json
// Pure harness reads; writes only --out. No RNG beyond the game's seeded streams.
import { writeFileSync } from "node:fs";
import { hashSeed } from "../../src/core/rng";
import { ITEMS, type HeroId } from "../../src/sim/content";
import { removeItem, cloneBuild, type Build } from "../../src/sim/deck";
import { parField, parSeeds } from "../../src/sim/harness/par";
import { playerRun } from "../../src/sim/harness/player";
import { playJob, type Job } from "../../src/sim/harness/tournament";
import { HEROES, applySets, arg, bestSpot, gatesOn, mean, setWorld, star, withGate } from "./world";
import { GATES_IDS } from "../../src/sim/gates";

const HERO = arg("--hero", "furnace") as HeroId;
const DAYS = arg("--days", "3,6,10").split(",").map(Number);
const K = Number(arg("--k", "24")), M = Number(arg("--m", "6")), SEEDS = Number(arg("--seeds", "2")), INS = Number(arg("--ins", "6"));
const IDS = arg("--gates", GATES_IDS.join(",")).split(",").filter(Boolean);
const OUT = arg("--out", `presence-${HERO}.json`);
const FIGHT = arg("--fight", "on") !== "off";
const ISTARS = arg("--istars", "both");
const label = setWorld(true);
const sets = applySets();

const holds = (b: Build, id: string): boolean => gatesOn(b, id) > 0;
const without = (b: Build, id: string): Build => {
  const c = cloneBuild(b);
  for (const p of b.items.filter((q) => q.def === id)) removeItem(c, p.uid);
  return c;
};
const copiesOn = (b: Build, id: string): number => b.items.filter((p) => p.def === id).reduce((s, p) => s + 2 ** ((p.stars ?? 1) - 1), 0);

interface Pair { deck: number; whole: number[]; other: number[] } // points per battle, paired
const pp = (x: number): string => (Number.isNaN(x) ? "-" : `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`);

const t0 = Date.now();
const out: Record<string, unknown> = { hero: HERO, label, days: DAYS, k: K, m: M, seeds: SEEDS, ins: INS, sets, fight: FIGHT, istars: ISTARS, rows: [] as unknown[], cargo: [] as unknown[] };
for (const day of DAYS) {
  const mine = parField(HERO, day, K);
  const foes = HEROES.map((h) => parField(h, day, M));
  const field: Build[] = [...foes.flat()];
  /** Points per battle of `b` (the subject's member `self`) against every foe member it meets. */
  const play = (b: Build, self: number, key: string): number[] => {
    const at = field.length;
    field.push(b);
    const pts: number[] = [];
    HEROES.forEach((h, hi) => foes[hi].forEach((_, mi) => {
      if (h === HERO && mi === self) return;
      const job: Job = { a: at, b: hi * M + mi, seeds: Array.from({ length: SEEDS }, (_, s) => hashSeed("gates1-presence", key, day, HERO, self, h, mi, s)), day };
      pts.push(playJob(field, job) / (2 * SEEDS));
    }));
    field.pop();
    return pts;
  };
  const wholeCache = new Map<number, number[]>();
  const whole = (i: number): number[] => { if (!wholeCache.has(i)) wholeCache.set(i, play(mine[i], i, "whole")); return wholeCache.get(i)!; };
  // the par player's runs to this dusk (the buy rate, 7e)
  const runs = parSeeds(K).map((s) => playerRun(HERO, day, s));
  for (const id of IDS) {
    if (!ITEMS[id]) { console.log(`presence ${HERO} d${day} ${id}: not in ITEMS, skipped`); continue; }
    const holders = mine.map((b, i) => (holds(b, id) ? i : -1)).filter((i) => i >= 0);
    const hp: Pair[] = FIGHT ? holders.map((i) => ({ deck: i, whole: whole(i), other: play(without(mine[i], id), i, "without") })) : [];
    const others = FIGHT ? mine.map((_, i) => i).filter((i) => !holders.includes(i)).slice(0, INS) : [];
    const insert = (stars: number): Pair[] => {
      const ps: Pair[] = [];
      for (const i of others) {
        const at = bestSpot(mine[i], id);
        if (at) ps.push({ deck: i, whole: whole(i), other: play(withGate(mine[i], id, stars, at), i, `inserted${stars}`) });
      }
      return ps;
    };
    const ip1 = insert(1), ipd = star(day) > 1 && ISTARS !== "1" ? insert(star(day)) : [];
    const lift = (ps: Pair[], sign: 1 | -1) => ps.map((p) => sign * (mean(p.whole) - mean(p.other)));
    const hl = lift(hp, 1), il1 = lift(ip1, -1), ild = lift(ipd, -1);
    const bought = runs.filter((r) => r.some((d) => d.buys.some((x) => x.def === id))).length;
    const copies = runs.reduce((s, r) => s + r.reduce((t, d) => t + d.buys.filter((x) => x.def === id).length, 0), 0);
    let onDeck = 0, runsOff = 0;
    for (const r of runs) {
      const a = r.reduce((s, d) => s + d.buys.filter((x) => x.def === id).length, 0), o = copiesOn(r[day - 1].build, id);
      onDeck += o;
      if (a > o) runsOff++;
    }
    const row = {
      id, day, price: ITEMS[id].price, parStars: holders.map((i) => Math.max(...mine[i].items.filter((p) => p.def === id).map((p) => p.stars ?? 1))),
      holders: holders.length, holderLift: mean(hl), holderLifts: hl, holderDecks: holders, holderBattles: hp.reduce((s, p) => s + p.whole.length * 2 * SEEDS, 0),
      insertedStar1: ip1.length, insert1Lift: mean(il1), insert1Lifts: il1, insert1Decks: ip1.map((p) => p.deck),
      insertedStarDay: ipd.length, insertDayStars: star(day), insertDayLift: mean(ild), insertDayLifts: ild,
      insertBattles: [...ip1, ...ipd].reduce((s, p) => s + p.other.length * 2 * SEEDS, 0),
      buyRate: bought / K, held: holders.length / K, copies, onDeckCopies: onDeck, runsOff, runs: K,
    };
    (out.rows as unknown[]).push(row);
    console.log(`presence ${HERO} d${day} ${id.padEnd(11)} holders ${holders.length}/${K} lift ${pp(row.holderLift)} pts (${row.holderBattles} fights) | inserted ★1 ${ip1.length} lift ${pp(row.insert1Lift)}${ipd.length ? ` | inserted ★${star(day)} ${ipd.length} lift ${pp(row.insertDayLift)}` : ""} (${row.insertBattles} fights) | bought by d${day} ${bought}/${K} (${copies} copies, ${onDeck} on deck, ${runsOff} runs with one off) | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
out.seconds = Math.round((Date.now() - t0) / 1000);
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`presence ${HERO}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
