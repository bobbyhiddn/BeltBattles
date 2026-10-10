// PLAIN-1 (REQ-BFG-084.5; BRIEF-PLAIN1 step 5): THE PRESENCE BENCH of the six plain stat rigs, with every switch on
// (HULL_SCALE, LADDER_FIX, NPC_DAY) plus PLAIN_RIGS, so it measures the hull rules.
//
// For one subject hero (--hero; run one process a hero, at most 4 at once) and each day (--days, 3,6,10), the subject's
// par field (playerBuild, seeds 1..--k) plays the par fields of the four playable heroes (each hero's first --m members,
// its own member left out), --seeds seeds x both sides a pairing, on the day's rules (simulate's `day`). For each rig:
//  - HOLDERS (the guard's reading, REQ-BFG-084.5 "whenever it is present"): each par deck that holds it, against the same
//    deck with every copy of it lifted off (a rig takes no belt with it, so nothing is refed): lift = whole - without, in
//    points of win rate, paired fight for fight (the same foes, seeds and sides).
//  - INSERTED (a check for the rigs the par player seldom buys): up to --ins par decks that don't hold it, with one ★1
//    copy added on the free cell and turn the par player's rating (rateDeck) likes best among those whose arrows hit a
//    belt: lift = with - whole. The copy is free (no gold traded for it), so this reads high: an upper bound.
// Also the par player's buy rate (P5): the share of its runs (seeds 1..k) holding the rig at each day's dusk and the share
// that bought one by then, with the copies bought.
// --set id.field=value (repeatable; field = a ★1 gate number, or price) patches a def before the bench (the guard's cuts).
// --fight-set id.field=value (run 2, repeatable): the same patch for each day's fights only, on decks built under the defs.
// Usage: node <built>/presence.js --hero furnace --days 3,6,10 --k 12 --m 6 --seeds 1 --ins 4 --out file.json
// Pure harness reads; writes only --out. No RNG beyond the game's seeded streams.
import { writeFileSync } from "node:fs";
import { ITEMS, type HeroId, type ItemDef } from "../../src/sim/content";
import { canPlaceItem, cloneBuild, removeItem, rigHits, rotField, type Build } from "../../src/sim/deck";
import { rateDeck } from "../../src/sim/deckRating";
import { hashSeed } from "../../src/core/rng";
import { setHullScale } from "../../src/sim/hullScale";
import { setLadderFix } from "../../src/sim/ladderFix";
import { setNpcDay } from "../../src/sim/npcDay";
import { PLAIN_RIG_IDS, setPlainRigs } from "../../src/sim/plainRigs";
import { clearStarCache } from "../../src/sim/stars";
import { parSeeds, parField } from "../../src/sim/harness/par";
import { playerRun } from "../../src/sim/harness/player";
import { playJob, type Job } from "../../src/sim/harness/tournament";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const HERO = arg("--hero", "furnace") as HeroId;
const DAYS = arg("--days", "3,6,10").split(",").map(Number);
const K = Number(arg("--k", "12")), M = Number(arg("--m", "6")), SEEDS = Number(arg("--seeds", "1")), INS = Number(arg("--ins", "4"));
const OUT = arg("--out", `presence-${HERO}.json`);
const RIGS = arg("--rigs", PLAIN_RIG_IDS.join(",")).split(",");
const FOES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

setHullScale(true);
setLadderFix(true);
setNpcDay(true);
setPlainRigs(true);
// the guard's cuts: --set rasp.flat=8 (a ★1 gate number) or --set rasp.price=4
const sets: string[] = [];
process.argv.forEach((a, i) => { if (a === "--set") sets.push(process.argv[i + 1]); });
/** Patch one def as `id.field=value` says; returns the def it replaced. */
const applySet = (s: string): [string, ItemDef] => {
  const [lhs, v] = s.split("="), [id, field] = lhs.split(".");
  const was = ITEMS[id];
  const d: ItemDef = { ...ITEMS[id], gate: { ...ITEMS[id].gate } };
  if (field === "price") d.price = Number(v);
  else (d.gate as Record<string, number>)[field] = Number(v);
  ITEMS[id] = d;
  return [id, was];
};
for (const s of sets) applySet(s);
if (sets.length) clearStarCache();
// run 2 (cap R2-1's BURN diagnostic; a bench-only override, never a def): --fight-set id.field=value patches a ★1 number
// after each day's par decks and par runs are built under the defs, for that day's fights only, then puts the def back.
// So the same decks (and the same buy rate) fight with the patched number; the foes' copies take it too. (The par run
// cache keys on hero, seed and rules, never a def; the battle reads each def through the star cache, cleared at each swap.)
const fightSets: string[] = [];
process.argv.forEach((a, i) => { if (a === "--fight-set") fightSets.push(process.argv[i + 1]); });

const holds = (b: Build, id: string): boolean => b.items.some((p) => p.def === id);
const without = (b: Build, id: string): Build => {
  const c = cloneBuild(b);
  for (const p of b.items.filter((q) => q.def === id)) removeItem(c, p.uid);
  return c;
};
/** The deck with one ★1 `id` on the free cell and turn the rating likes best among those that hit a belt (null: none). */
function inserted(b: Build, id: string): Build | null {
  const uid = Math.max(0, ...b.items.map((p) => p.uid), ...b.mods.map((m) => m.uid)) + 1;
  let best: { v: number; b: Build } | null = null;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    if (!canPlaceItem(b, id, x, y).ok) continue;
    for (let rot = 0; rot < 4; rot++) {
      const t: Build = { ...b, items: [...b.items, { uid, def: id, x, y, ...rotField(id, rot) }] };
      if (!rigHits(t).flat(2).some((h) => h.uid === uid)) continue;
      const v = rateDeck(t).value;
      if (!best || v > best.v) best = { v, b: t };
    }
  }
  return best ? cloneBuild(best.b) : null;
}

interface Pair { deck: number; whole: number[]; other: number[] } // points per battle, paired
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

const t0 = Date.now();
const out: Record<string, unknown> = { hero: HERO, days: DAYS, k: K, m: M, seeds: SEEDS, ins: INS, sets, ...(fightSets.length ? { fightSets } : {}), rows: [] as unknown[] };
for (const day of DAYS) {
  const mine = parField(HERO, day, K);
  const foes = FOES.map((h) => parField(h, day, K).slice(0, M));
  const field: Build[] = [...foes.flat()];
  /** Points per battle of `b` (the subject's member `self`) against every foe member it meets. */
  const play = (b: Build, self: number, key: string): number[] => {
    const at = field.length;
    field.push(b);
    const pts: number[] = [];
    FOES.forEach((h, hi) => foes[hi].forEach((_, mi) => {
      if (h === HERO && mi === self) return;
      const job: Job = { a: at, b: hi * M + mi, seeds: Array.from({ length: SEEDS }, (_, s) => hashSeed("plain1-presence", key, day, HERO, self, h, mi, s)), day };
      pts.push(playJob(field, job) / (2 * SEEDS));
    }));
    field.pop();
    return pts;
  };
  const wholeCache = new Map<number, number[]>();
  const whole = (i: number): number[] => {
    if (!wholeCache.has(i)) wholeCache.set(i, play(mine[i], i, "whole"));
    return wholeCache.get(i)!;
  };
  // the par player's buy rate (P5): its runs to this dusk
  const runs = parSeeds(K).map((s) => playerRun(HERO, day, s));
  // --fight-set (run 2): the day's decks and runs are built; patch for its fights (the inserted copy's cell reads it too)
  const undo = fightSets.map(applySet);
  if (undo.length) clearStarCache();
  for (const id of RIGS) {
    const holders = mine.map((b, i) => (holds(b, id) ? i : -1)).filter((i) => i >= 0);
    const hp: Pair[] = holders.map((i) => ({ deck: i, whole: whole(i), other: play(without(mine[i], id), i, "without") }));
    const others = mine.map((_, i) => i).filter((i) => !holders.includes(i)).slice(0, INS);
    const ip: Pair[] = [];
    for (const i of others) {
      const t = inserted(mine[i], id);
      if (t) ip.push({ deck: i, whole: whole(i), other: play(t, i, "inserted") });
    }
    const lift = (ps: Pair[], sign: 1 | -1) => ps.map((p) => sign * (mean(p.whole) - mean(p.other)));
    const hl = lift(hp, 1), il = lift(ip, -1);
    const bought = runs.filter((r) => r.some((d) => d.buys.some((x) => x.def === id))).length;
    const copies = runs.reduce((s, r) => s + r.reduce((t, d) => t + d.buys.filter((x) => x.def === id).length, 0), 0);
    // run 2 (cap R2-1, the r4 bench at --k 48): holderDecks / insertDecks name each lift's par deck (its seed - 1), so a
    // bigger k's first decks can be checked against a smaller k's, and a --set variant's holders against the def's
    const row = {
      id, day, holders: holders.length, holderLift: mean(hl), holderLifts: hl, holderDecks: holders, holderBattles: hp.length * 2 * hp[0]?.whole.length * 2 * SEEDS || 0,
      inserted: ip.length, insertLift: mean(il), insertLifts: il, insertDecks: ip.map((p) => p.deck), insertBattles: ip.reduce((s, p) => s + p.other.length * 2 * SEEDS, 0),
      buyRate: bought / K, held: holders.length / K, copies,
    };
    (out.rows as unknown[]).push(row);
    const pp = (x: number) => (Number.isNaN(x) ? "-" : `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`);
    console.log(`presence ${HERO} d${day} ${id.padEnd(12)} holders ${holders.length}/${K} lift ${pp(row.holderLift)} pts | inserted ${ip.length} lift ${pp(row.insertLift)} pts | bought by d${day} ${bought}/${K} (${copies} copies) | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  // --fight-set (run 2): put the defs back (last patch first) before the next day's par decks are built
  for (const [id, was] of undo.reverse()) ITEMS[id] = was;
  if (undo.length) clearStarCache();
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`presence ${HERO}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
