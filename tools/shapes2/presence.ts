// SHAPES-2 step 6 (REQ-BFG-114 (3), REQ-BFG-084.5; BRIEF-SHAPES2 S6 b, c, e): THE PRESENCE BENCH, ported from SHAPES-1's
// tools/shapes1/presence.ts (and PLAIN-1's). Every switch as the base ships it (SHAPES, NPC_DAY, HULL_SCALE, LADDER_FIX, HEARTS,
// GUARD, OPEN_RUNES, FREE_JOINS on); PLAIN_RIGS and SHAPES2 as --plain and --s2 say (the 1D world: both on; the base's: both off).
// Label of every read: "SHAPES2 + PLAIN_RIGS on, without RUN-1's LONG_RUN, on the old 10-day frame".
//
// For one subject hero (--hero; one process a hero, at most 4 at once) and each day (--days, 3,6,10), the subject's par field
// (playerBuild, seeds 1..--k) plays the par fields of the four playable heroes (each hero's first --m members, its own member left
// out), --seeds seeds x both sides a pairing, on the day's rules (simulate's `day`). For each piece (--rigs):
//  - HOLDERS (the guard's reading, REQ-BFG-084.5 "whenever it is present"): each par deck that holds it, against the same deck with
//    every copy of it lifted off (removeItem), paired fight for fight (the same foes, seeds and sides): lift = whole - without, in
//    points of win rate;
//  - INSERTED (rigs only; the check for the rigs the par player seldom buys): up to --ins par decks that don't hold it, with one
//    free ★1 copy added at the cell and turn (every rot, canPlaceItem on the turned footprint) the par player's rating (rateDeck)
//    likes best among those whose arrows hit a belt: lift = with - whole. No gold is traded for the copy, so it reads high: an
//    upper bound.
// Also, from the par player's runs (seeds 1..k) to each day's dusk: the buy rate and the copies bought (e) and, for a shaped rig,
// how often it is left off the deck (acquired by buys and road drops minus the copies on the deck: in cargo, or sold).
// --set id.field=value (repeatable; field = a ★1 gate number, or price) patches a def before the bench (the guard's cuts).
// --fight off plays no battle (the holder decks, their hits, the buy rates and the cargo counts only).
// Usage: node <built>/presence.js --hero furnace --plain on --s2 on --days 3,6,10 --k 16 --m 6 --seeds 2 --ins 4 --out file.json
// Pure harness reads; writes only --out. No RNG beyond the game's seeded streams.
import { writeFileSync } from "node:fs";
import { GRID, ITEMS, type HeroId, type ItemDef } from "../../src/sim/content";
import { canPlaceItem, cellsOf, cloneBuild, removeItem, rigHits, rotField, type Build } from "../../src/sim/deck";
import { rateDeck } from "../../src/sim/deckRating";
import { hashSeed } from "../../src/core/rng";
import { SHAPES_IDS, setShapes, shapesRules } from "../../src/sim/shapes";
import { SHAPES2_IDS, setShapes2, shapes2Rules } from "../../src/sim/shapes2";
import { PLAIN_RIG_IDS, plainRigsRules, setPlainRigs } from "../../src/sim/plainRigs";
import { clearStarCache } from "../../src/sim/stars";
import { setLongRun } from "../../src/sim/longRun"; // BUMP-1D P3: --long on|off
import { parSeeds, parField } from "../../src/sim/harness/par";
import { playerRun } from "../../src/sim/harness/player";
import { playJob, type Job } from "../../src/sim/harness/tournament";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const HERO = arg("--hero", "furnace") as HeroId;
const DAYS = arg("--days", "3,6,10").split(",").map(Number);
const K = Number(arg("--k", "16")), M = Number(arg("--m", "6")), SEEDS = Number(arg("--seeds", "2")), INS = Number(arg("--ins", "4"));
const S2 = arg("--s2", "on") === "on", PLAIN = arg("--plain", "on") === "on";
const OUT = arg("--out", `presence-${HERO}-${S2 ? "s2" : "base"}.json`);
const [SWAP_FROM, SWAP_TO] = arg("--swap", ":").split(":");
const FIGHT = arg("--fight", "on") !== "off";
const PIECES = arg("--rigs", [...SHAPES_IDS, ...(S2 ? SHAPES2_IDS : []), ...(PLAIN ? PLAIN_RIG_IDS : []), "whetstone", "temper", "plateroller"].join(",")).split(",").filter(Boolean);
const FOES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
/** The pieces whose copies off the deck are counted (e): the shaped rigs of the world. */
const SHAPED = [...SHAPES_IDS, ...(S2 ? SHAPES2_IDS : [])];

// the 1D load order (PLAIN_RIGS, SHAPES, SHAPES2: ITEMS' order is part of the seeded draws), every other switch as the base ships it
setShapes2(false); setShapes(false); setPlainRigs(false);
setPlainRigs(PLAIN); setShapes(true); setShapes2(S2);
setLongRun(arg("--long", "on") === "on"); // BUMP-1D P3: default on, the bump's world; off: the old 10-day frame SHAPES-2's reads were made in
// the guard's cuts: --set nailstrip.flat=10 (a ★1 gate number) or --set nailstrip.price=3
const sets: string[] = [];
process.argv.forEach((a, i) => { if (a === "--set") sets.push(process.argv[i + 1]); });
/** Patch one def as `id.field=value` says; returns the def it replaced. */
const applySet = (s: string): [string, ItemDef] => {
  // id.price=N | id.field=N (a star-1 gate number) | id.L2.field=N, id.L3.field=N (a level's gate number; BUMP-1D P3)
  const [lhs, v] = s.split("="), parts = lhs.split("."), id = parts[0];
  const was = ITEMS[id];
  const d: ItemDef = { ...ITEMS[id], gate: { ...ITEMS[id].gate }, levels: { ...ITEMS[id].levels } };
  if (parts[1] === "price") d.price = Number(v);
  else if (/^L[23]$/.test(parts[1])) { const lv = Number(parts[1][1]) as 2 | 3; d.levels = { ...d.levels, [lv]: { ...d.levels![lv], gate: { ...d.levels![lv]!.gate, [parts[2]]: Number(v) } } }; }
  else (d.gate as Record<string, number>)[parts[1]] = Number(v);
  (ITEMS as Record<string, ItemDef>)[id] = d;
  return [id, was];
};
for (const s of sets) applySet(s);
if (sets.length) clearStarCache();

const holds = (b: Build, id: string): boolean => b.items.some((p) => p.def === id);
const without = (b: Build, id: string): Build => {
  const c = cloneBuild(b);
  for (const p of b.items.filter((q) => q.def === id)) removeItem(c, p.uid);
  return c;
};
/** The deck with one ★1 rig `id` at the cell and turn the rating likes best among those that hit a belt (null: none). */
function inserted(b: Build, id: string): Build | null {
  const uid = Math.max(0, ...b.items.map((p) => p.uid), ...b.mods.map((m) => m.uid)) + 1;
  let best: { v: number; b: Build } | null = null;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) for (let rot = 0; rot < 4; rot++) {
    if (!canPlaceItem(b, id, x, y, -1, rot).ok) continue;
    const t: Build = { ...b, items: [...b.items, { uid, def: id, x, y, ...rotField(id, rot) }] };
    if (!rigHits(t).flat(2).some((h) => h.uid === uid)) continue;
    const v = rateDeck(t).value;
    if (!best || v > best.v) best = { v, b: t };
  }
  return best ? cloneBuild(best.b) : null;
}
const copiesOn = (b: Build, id: string): number => b.items.filter((p) => p.def === id).reduce((s, p) => s + 2 ** ((p.stars ?? 1) - 1), 0);
/** Each placed copy of rig `id` on `b`: its hits (rigHits, one an arrow on a belt tile). */
const copyHits = (b: Build, id: string): number[] => {
  const hs = rigHits(b).flat(2);
  return b.items.filter((p) => p.def === id).map((p) => hs.filter((h) => h.uid === p.uid).length);
};
/** The swap read's deck: every copy of `from` replaced by one `to` on each of its cells, at its rot and stars. */
const swapped = (b: Build, from: string, to: string): Build => {
  const c = cloneBuild(b);
  let uid = Math.max(0, ...b.items.map((p) => p.uid), ...b.mods.map((m) => m.uid));
  for (const p of b.items.filter((q) => q.def === from)) {
    removeItem(c, p.uid);
    for (const k of cellsOf(p)) c.items.push({ uid: ++uid, def: to, x: k % GRID, y: Math.floor(k / GRID), ...rotField(to, p.rot ?? 0), ...(p.stars && p.stars > 1 ? { stars: p.stars } : {}) });
  }
  return c;
};

interface Pair { deck: number; whole: number[]; other: number[] } // points per battle, paired
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

const t0 = Date.now();
const label = `SHAPES2 ${S2 ? "+ " : "off, "}PLAIN_RIGS ${PLAIN ? "on" : "off"}, LONG_RUN ${arg("--long", "on")}`;
const out: Record<string, unknown> = { hero: HERO, s2: S2, plain: PLAIN, shapesRules: shapesRules(), shapes2Rules: shapes2Rules(), plainRigsRules: plainRigsRules(), label, days: DAYS, k: K, m: M, seeds: SEEDS, ins: INS, sets, swap: SWAP_FROM ? `${SWAP_FROM}:${SWAP_TO}` : null, fight: FIGHT, rows: [] as unknown[], cargo: [] as unknown[] };
for (const day of DAYS) {
  const mine = parField(HERO, day, K);
  const foes = FOES.map((h) => parField(h, day, M));
  const field: Build[] = [...foes.flat()];
  /** Points per battle of `b` (the subject's member `self`) against every foe member it meets. */
  const play = (b: Build, self: number, key: string): number[] => {
    const at = field.length;
    field.push(b);
    const pts: number[] = [];
    FOES.forEach((h, hi) => foes[hi].forEach((_, mi) => {
      if (h === HERO && mi === self) return;
      const job: Job = { a: at, b: hi * M + mi, seeds: Array.from({ length: SEEDS }, (_, s) => hashSeed("shapes2-presence", key, day, HERO, self, h, mi, s)), day };
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
  // the par player's runs to this dusk (the buy rate, P5; the copies off the deck, 7e)
  const runs = parSeeds(K).map((s) => playerRun(HERO, day, s));
  for (const id of PIECES) {
    if (!ITEMS[id]) { console.log(`presence ${HERO} d${day} ${id}: not in ITEMS (s2 ${S2 ? "on" : "off"}, plain ${PLAIN ? "on" : "off"}), skipped`); continue; }
    const rig = ITEMS[id].kind === "gate";
    const holders = mine.map((b, i) => (holds(b, id) ? i : -1)).filter((i) => i >= 0);
    const hp: Pair[] = FIGHT ? holders.map((i) => ({ deck: i, whole: whole(i), other: play(without(mine[i], id), i, "without") })) : [];
    const others = rig && FIGHT ? mine.map((_, i) => i).filter((i) => !holders.includes(i)).slice(0, INS) : [];
    const ip: Pair[] = [];
    for (const i of others) {
      const t = inserted(mine[i], id);
      if (t) ip.push({ deck: i, whole: whole(i), other: play(t, i, "inserted") });
    }
    const lift = (ps: Pair[], sign: 1 | -1) => ps.map((p) => sign * (mean(p.whole) - mean(p.other)));
    const hl = lift(hp, 1), il = lift(ip, -1);
    const bought = runs.filter((r) => r.some((d) => d.buys.some((x) => x.def === id))).length;
    const copies = runs.reduce((s, r) => s + r.reduce((t, d) => t + d.buys.filter((x) => x.def === id).length, 0), 0);
    const ch = rig ? holders.map((i) => copyHits(mine[i], id)) : [];
    // the swap read: the same holder decks with `id` replaced by SWAP_TO on its cells (paired with whole and without)
    const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);
    const swapDecks = FIGHT && id === SWAP_FROM && ITEMS[SWAP_TO] ? hp.map((p) => swapped(mine[p.deck], id, SWAP_TO)) : [];
    const sw = swapDecks.map((d, j) => mean(play(d, hp[j].deck, "swap")));
    // check: the swapped-in copies make exactly the hits the replaced piece made
    const swapHits = swapDecks.map((d, j) => sum(copyHits(d, SWAP_TO)) - sum(copyHits(mine[hp[j].deck], SWAP_TO)));
    const row = {
      id, day, kind: ITEMS[id].kind, foot: ITEMS[id].foot ?? null, price: ITEMS[id].price,
      holders: holders.length, holderLift: mean(hl), holderLifts: hl, holderDecks: holders, holderBattles: hp.reduce((s, p) => s + 2 * p.whole.length * 2 * SEEDS, 0),
      inserted: ip.length, insertLift: mean(il), insertLifts: il, insertDecks: ip.map((p) => p.deck), insertBattles: ip.reduce((s, p) => s + p.other.length * 2 * SEEDS, 0),
      buyRate: bought / K, held: holders.length / K, copies,
      holderHits: ch.map((xs) => xs.reduce((s, x) => s + x, 0)), copyHits: ch,
      ...(sw.length ? { swapTo: SWAP_TO, swapLifts: sw.map((s, j) => s - mean(hp[j].other)), wholeVsSwap: sw.map((s, j) => mean(hp[j].whole) - s), swapHits, swapHitsSame: swapHits.every((h, j) => h === sum(ch[j])) } : {}),
    };
    (out.rows as unknown[]).push(row);
    const pp = (x: number) => (Number.isNaN(x) ? "-" : `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`);
    const hh = row.holderHits.length ? ` | hits a holder deck ${(row.holderHits.reduce((s, x) => s + x, 0) / row.holderHits.length).toFixed(2)}` : "";
    const sl = sw.length ? ` | swap (${SWAP_TO} on its cells) lift ${pp(mean(row.swapLifts!))} pts, whole - swap ${pp(mean(row.wholeVsSwap!))} pts, same hits ${row.swapHitsSame}` : "";
    console.log(`presence ${HERO} s2=${S2 ? "on " : "off"} d${day} ${id.padEnd(12)} holders ${holders.length}/${K} lift ${pp(row.holderLift)} pts (${row.holderBattles} fights) | inserted ${ip.length} lift ${pp(row.insertLift)} pts | bought by d${day} ${bought}/${K} (${copies} copies)${hh}${sl} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  // 7e: shaped copies off the deck at this dusk (acquired by buys and road drops, minus the copies on the deck)
  for (const id of SHAPED) {
    let acquired = 0, onDeck = 0, runsOff = 0;
    for (const r of runs) {
      const a = r.reduce((s, d) => s + d.buys.filter((x) => x.def === id).length + (d.road?.drop === id ? 1 : 0), 0);
      const o = copiesOn(r[day - 1].build, id);
      acquired += a; onDeck += o;
      if (a > o) runsOff++;
    }
    const c = { id, day, runs: K, acquired, onDeck, off: acquired - onDeck, runsOff };
    (out.cargo as unknown[]).push(c);
    console.log(`cargo ${HERO} d${day} ${id.padEnd(12)} acquired ${acquired} on deck ${onDeck} off ${acquired - onDeck} (runs with one off: ${runsOff}/${K})`);
  }
}
out.seconds = Math.round((Date.now() - t0) / 1000);
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`presence ${HERO} s2=${S2 ? "on" : "off"}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
