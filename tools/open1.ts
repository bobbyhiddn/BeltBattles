// OPEN-1 (REQ-BFG-109; BRIEF-OPEN1 sections 4a and 5): the open rune pool's bench tool. Imported by nothing (no pin moves).
//
// --mode audit: THE DEAD-RUNE AUDIT (4a), every rune x every hero. The test of record: the rune added (as run.ts takeRune
//   adds it: Build.runes, and a HULL or BELT rune's amount on hullBonus / beltCap) to each of that hero's par decks on days
//   3, 6 and 9 (the hero's par field, first --members 6 members, bare: no bot runes, so the deck holds exactly the audited
//   rune), each fighting the four heroes' par decks of that day (the field, first --ko members each, as the par player
//   builds them) with 1 seed on both sides (the member as side 0, then as side 1). Each fight is played twice on the same
//   seed, without the rune (the base) and with it, stepped as the sim fingerprint steps it (every SideStats field, both
//   hulls, the time, the winner and a tally of every sim event). The rune FIRES in a fight when anything in that record
//   differs from the base's. DEAD: it fires in no fight on any day. WEAK: it fires, but the deck's points a fight (win 1,
//   draw 0.5, x100) move by under +2 on every day. OK otherwise. The run's runes (dawn gold, RUNE TITHE, SPOILS SACK: gold;
//   TAR BARREL, PITCH WAGON: BELT to lay) act before the fight, on the shop and the board, so the battle can't see them:
//   they are listed as RUN (every hero spends gold and lays belts). WARLORD'S DUE: the member carries floor((day - 1) / 2)
//   wins, the field 0 (runevalue.ts's rule).
//   node open1.js --mode audit --set today|off [--open on] [--heroes h,..] [--runes id,..] [--days 3,6,9] [--members 6]
//     [--ko 2] --out audit.json
// --mode balance: THE HERO BALANCE (5): each hero's par decks (seeds --seeds, with the bots' runes, under the set's
//   switches) against the other three heroes' par fields (seeds 1..--field-k), 1 seed both sides, days --days: the
//   cross-hero win rate by day (win 1, draw 0.5).
//   node open1.js --mode balance --set today [--open on] --heroes h --seeds 1-24 [--field-k 6] [--days 3-10] --out bal.json
// --mode value (run 2): a rune's worth on its own hero, today's def beside the rewritten def (OPEN_RUNES on) on the same
//   decks (see value() below; THE LONG ROAD's amount, src/sim/openRunes.ts LONG_ROAD_PCT, came from it).
// The sets: "today" = NPC_DAY, HULL_SCALE and LADDER_FIX on (AZ's three; HEARTS, GUARD off), "off" = every switch off;
// --open on adds OPEN_RUNES (the open offers for the bots' runes, and the rewrites, src/sim/openRunes.ts).
// Run 2's reading of the audit (cap's call, oracle request 3360bc59b3a473f1): its DEAD verdict is the par-deck SCREEN.
// A rune is DEAD for a hero only when no deck that hero can build makes it fire (BRIEF-OPEN1 section 4); one that fires
// with a shop part the par decks don't buy is PART (tests/open1.deadRunes.test.ts builds those decks).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Battle } from "../src/sim/battle";
import { cloneBuild, type Build } from "../src/sim/deck";
import { hashSeed } from "../src/core/rng";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { parField } from "../src/sim/harness/par";
import { playerBuild } from "../src/sim/harness/player";
import { RUNES, runeList, type RuneDef } from "../src/sim/runes";
import { setHullScale } from "../src/sim/hullScale";
import { setLadderFix } from "../src/sim/ladderFix";
import { setNpcDay } from "../src/sim/npcDay";
import { openRunesRules, setOpenRunes } from "../src/sim/openRunes";

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const range = (s: string): number[] => s.split(",").flatMap((p) => { const [a, b] = p.split("-").map(Number); return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i); });

const SET = flag("set") ?? "today";
if (SET !== "today" && SET !== "off") throw new Error(`--set ${SET}: today or off`);
const today = SET === "today";
setNpcDay(today);
setHullScale(today);
setLadderFix(today);
setOpenRunes(flag("open") === "on");
const SWITCHES = `${today ? "NPC_DAY+HULL_SCALE+LADDER_FIX" : "all off"}${openRunesRules() ? "+OPEN_RUNES" : ""}`;

/** The run's kinds: the battle can't see them (gold before the fight; BELT to lay). */
const RUN_KINDS_SEEN = new Set(["dawnGold", "runeTithe", "victorGold", "belt"]);

/** `b` holding rune `id` as run.ts takeRune applies it (runevalue.ts withRune). */
function withRune(b: Build, id: string): Build {
  const d = RUNES[id];
  const out = cloneBuild(b);
  out.runes = [...(b.runes ?? []), { id }];
  if (d.kind === "hull") out.hullBonus += d.amount.n;
  else if (d.kind === "belt") out.beltCap += d.amount.n;
  return out;
}

const stats = (s: unknown): unknown[] => { const o = s as Record<string, unknown>; return Object.keys(o).sort().map((k) => [k, o[k]]); };

/** One battle stepped as the sim fingerprint steps it: its record (to compare) and side `me`'s score. */
function fight(a: Build, b: Build, seed: number, wins: readonly [number, number], day: number, me: 0 | 1): { rec: string; score: number } {
  const bt = new Battle(cloneBuild(a), cloneBuild(b), seed, wins, day);
  const tally: Record<string, number> = {};
  while (!bt.over && bt.ticks < 60 * 200) {
    bt.step();
    for (const e of bt.events) tally[e.type] = (tally[e.type] ?? 0) + 1;
    bt.events.length = 0;
  }
  const rec = JSON.stringify([bt.winner, bt.t, bt.ticks, bt.sides[0].hull.hp, bt.sides[1].hull.hp, stats(bt.sides[0].stats), stats(bt.sides[1].stats), Object.keys(tally).sort().map((k) => [k, tally[k]])]);
  return { rec, score: bt.winner === me ? 1 : bt.winner === -1 ? 0.5 : 0 };
}

function write(out: string, body: unknown): void {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.part`, JSON.stringify(body) + "\n");
  writeFileSync(out, JSON.stringify(body) + "\n");
}

function audit(): void {
  const heroes = (flag("heroes") ?? HEROES.join(",")).split(",") as HeroId[];
  const days = range(flag("days") ?? "3,6,9");
  const M = Number(flag("members") ?? 6), KO = Number(flag("ko") ?? 2);
  const ids = flag("runes") ? flag("runes")!.split(",") : runeList().map((d) => d.id);
  const out = flag("out") ?? "audit.json";
  const t0 = Date.now();
  const field: Record<string, Build[]> = {};
  for (const h of HEROES) for (const d of days) field[`${h}:${d}`] = parField(h, d, KO);
  const memb: Record<string, Build[]> = {};
  for (const h of heroes) for (const d of days) memb[`${h}:${d}`] = parField(h, d, M, { botRunes: false });
  console.log(`audit ${SWITCHES}: decks built in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  let battles = 0;
  const rows: unknown[] = [];
  for (const h of heroes) {
    // the base fights, once per (day, member, foe, j, side)
    const base = new Map<string, { rec: string; score: number }>();
    for (const d of days) {
      const wins: readonly [number, number] = [Math.floor((d - 1) / 2), 0];
      memb[`${h}:${d}`].forEach((mine, i) => {
        for (const foe of HEROES) field[`${foe}:${d}`].forEach((theirs, j) => {
          const seed = hashSeed(13, "open1-audit", h, d, i, foe, j);
          base.set(`${d}|${i}|${foe}|${j}|0`, fight(mine, theirs, seed, wins, d, 0));
          base.set(`${d}|${i}|${foe}|${j}|1`, fight(theirs, mine, seed, [wins[1], wins[0]], d, 1));
          battles += 2;
        });
      });
    }
    for (const id of ids) {
      const def: RuneDef = RUNES[id];
      const byDay: Record<number, { fired: number; fights: number; gain: number }> = {};
      for (const d of days) {
        const wins: readonly [number, number] = [Math.floor((d - 1) / 2), 0];
        let fired = 0, fights = 0, gain = 0;
        memb[`${h}:${d}`].forEach((mine0, i) => {
          const mine = withRune(mine0, id);
          for (const foe of HEROES) field[`${foe}:${d}`].forEach((theirs, j) => {
            const seed = hashSeed(13, "open1-audit", h, d, i, foe, j);
            const a = fight(mine, theirs, seed, wins, d, 0), b = fight(theirs, mine, seed, [wins[1], wins[0]], d, 1);
            const ba = base.get(`${d}|${i}|${foe}|${j}|0`)!, bb = base.get(`${d}|${i}|${foe}|${j}|1`)!;
            fired += (a.rec !== ba.rec ? 1 : 0) + (b.rec !== bb.rec ? 1 : 0);
            gain += a.score - ba.score + b.score - bb.score;
            fights += 2;
            battles += 2;
          });
        });
        byDay[d] = { fired, fights, gain: Math.round((1000 * gain) / fights) / 10 };
      }
      const firedAll = days.reduce((s, d) => s + byDay[d].fired, 0);
      const run = RUN_KINDS_SEEN.has(def.kind);
      const verdict = run && !firedAll ? "RUN" : !firedAll ? "DEAD" : days.every((d) => byDay[d].gain < 2) ? "WEAK" : "OK";
      rows.push({ hero: h, id, name: def.name, tier: def.tier, theme: def.theme, kind: def.kind, n: def.amount.n, text: def.text, verdict, byDay });
    }
    console.log(`audit ${SWITCHES}: ${h} done, ${battles} battles, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    write(out, { mode: "audit", rules: RULES_VERSION, switches: SWITCHES, days, members: M, ko: KO, heroes, battles, seconds: Math.round((Date.now() - t0) / 1000), complete: false, rows });
  }
  write(out, { mode: "audit", rules: RULES_VERSION, switches: SWITCHES, days, members: M, ko: KO, heroes, battles, seconds: Math.round((Date.now() - t0) / 1000), complete: true, rows });
  console.log(`audit ${SWITCHES}: wrote ${out} (${rows.length} rows, ${battles} battles, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

function balance(): void {
  const heroes = (flag("heroes") ?? HEROES.join(",")).split(",") as HeroId[];
  const days = range(flag("days") ?? "3-10");
  const seeds = range(flag("seeds") ?? "1-24");
  const FK = Number(flag("field-k") ?? 6);
  const out = flag("out") ?? "balance.json";
  const t0 = Date.now();
  const field: Record<string, Build[]> = {};
  for (const h of HEROES) for (const d of days) field[`${h}:${d}`] = parField(h, d, FK);
  console.log(`balance ${SWITCHES}: field built in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const data: Record<string, Record<number, { score: number; fights: number; runes: string[][] }>> = {};
  let battles = 0;
  for (const h of heroes) {
    data[h] = {};
    for (const d of days) {
      let score = 0, fights = 0;
      const runes: string[][] = [];
      for (const s of seeds) {
        const mine = playerBuild(h, d, s); // the par player's deck of seed s (parField's member s)
        runes.push((mine.runes ?? []).map((q) => q.id));
        for (const foe of HEROES) {
          if (foe === h) continue;
          field[`${foe}:${d}`].forEach((theirs, j) => {
            const seed = hashSeed(17, "open1-balance", h, d, s, foe, j);
            score += fight(mine, theirs, seed, [0, 0], d, 0).score + fight(theirs, mine, seed, [0, 0], d, 1).score;
            fights += 2;
            battles += 2;
          });
        }
      }
      data[h][d] = { score, fights, runes };
    }
    console.log(`balance ${SWITCHES}: ${h} done, ${battles} battles, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  write(out, { mode: "balance", rules: RULES_VERSION, switches: SWITCHES, days, seeds: [seeds[0], seeds[seeds.length - 1]], fieldK: FK, heroes, battles, seconds: Math.round((Date.now() - t0) / 1000), data });
  console.log(`balance ${SWITCHES}: wrote ${out} (${battles} battles, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

/** Student's t (two-sided 95%) for df degrees of freedom (1.96 past the table). */
const T95: Record<number, number> = { 1: 12.71, 2: 4.3, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23, 11: 2.2, 12: 2.18, 14: 2.14, 15: 2.13, 19: 2.09, 23: 2.07, 29: 2.05 };
const t95 = (df: number): number => T95[df] ?? (df < 30 ? 2.1 : 1.96);

/**
 * --mode value (run 2; cap's call 3360bc59b3a473f1, item 1: THE LONG ROAD's rewrite keeps FURNACE's value within about
 * 10%): a rune's worth on its own hero, today's def beside the rewritten def, on the very same decks. The members (bare par
 * decks of --heroes, seeds 1..--members) and the field (the four heroes' par decks, seeds 1..--ko, the bots' runes kept)
 * are built with OPEN_RUNES OFF; each variant then plays, and its own base with it, with the switch as the variant says.
 * Variants (--runes, in order): id, id@n (its amount n while it plays), open:id, open:id@n (OPEN_RUNES on: the rewritten
 * def). Each member fights each foe once from each side on hashSeed(13, "open1-value", ...). Gain: points a fight x100
 * (win 1, draw 0.5), rune minus base, the mean over the members with a 95% t-interval over them, and by day.
 *   node open1.js --mode value --set today --heroes furnace --runes long_road,toll_road,open:long_road@10 [--days 3-10]
 *     [--members 10] [--ko 2] --out value.json
 */
function value(): void {
  const heroes = (flag("heroes") ?? "furnace").split(",") as HeroId[];
  const days = range(flag("days") ?? "3-10");
  const M = Number(flag("members") ?? 10), KO = Number(flag("ko") ?? 2);
  const specs = (flag("runes") ?? "").split(",").filter(Boolean);
  const out = flag("out") ?? "value.json";
  const t0 = Date.now();
  setOpenRunes(false);
  const field: Record<string, Build[]> = {};
  for (const h of HEROES) for (const d of days) field[`${h}:${d}`] = parField(h, d, KO);
  const memb: Record<string, Build[]> = {};
  for (const h of heroes) for (const d of days) memb[`${h}:${d}`] = parField(h, d, M, { botRunes: false });
  console.log(`value ${SWITCHES}: decks built (switch off) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  let battles = 0;
  const rows: unknown[] = [];
  /** [member][day index] -> the summed score of that member's fights that day (2 x 4 x KO fights). */
  const play = (h: HeroId, id: string | null): number[][] =>
    Array.from({ length: M }, (_, i) => days.map((d) => {
      const wins: readonly [number, number] = [Math.floor((d - 1) / 2), 0];
      const mine = id ? withRune(memb[`${h}:${d}`][i], id) : memb[`${h}:${d}`][i];
      let s = 0;
      for (const foe of HEROES) field[`${foe}:${d}`].forEach((theirs, j) => {
        const seed = hashSeed(13, "open1-value", h, d, i, foe, j);
        s += fight(mine, theirs, seed, wins, d, 0).score + fight(theirs, mine, seed, [wins[1], wins[0]], d, 1).score;
        battles += 2;
      });
      return s;
    }));
  const perDay = 2 * HEROES.length * KO;
  for (const h of heroes) {
    const base: Record<string, number[][]> = {};
    for (const spec of specs) {
      const open = spec.startsWith("open:");
      const [id, at] = spec.replace(/^open:/, "").split("@");
      setOpenRunes(open);
      const key = open ? "open" : "closed";
      base[key] ??= play(h, null);
      const def = RUNES[id];
      if (!def) throw new Error(`--runes: unknown rune ${id}`);
      if (at !== undefined) (RUNES as Record<string, RuneDef>)[id] = { ...def, amount: { ...def.amount, n: Number(at) } };
      const used = RUNES[id];
      let got: number[][];
      try { got = play(h, id); } finally { (RUNES as Record<string, RuneDef>)[id] = def; }
      const b = base[key];
      const member = got.map((row, i) => (100 * row.reduce((s, v, k) => s + v - b[i][k], 0)) / (perDay * days.length));
      const mean = member.reduce((s, v) => s + v, 0) / M;
      const sd = Math.sqrt(member.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, M - 1));
      const half = (t95(M - 1) * sd) / Math.sqrt(M);
      const byDay = Object.fromEntries(days.map((d, k) => [d, Math.round((1000 * got.reduce((s, row, i) => s + row[k] - b[i][k], 0)) / (perDay * M)) / 10]));
      const r = { hero: h, spec, id, open, name: used.name, tier: used.tier, kind: used.kind, n: used.amount.n, text: used.text, gain: Math.round(10 * mean) / 10, lo: Math.round(10 * (mean - half)) / 10, hi: Math.round(10 * (mean + half)) / 10, byDay };
      rows.push(r);
      console.log(`value ${SWITCHES}: ${h} ${spec} (${used.kind} ${used.amount.n}): ${r.gain} [${r.lo}, ${r.hi}]; ${battles} battles, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      write(out, { mode: "value", rules: RULES_VERSION, switches: SWITCHES, days, members: M, ko: KO, heroes, battles, seconds: Math.round((Date.now() - t0) / 1000), complete: false, rows });
    }
  }
  setOpenRunes(false);
  write(out, { mode: "value", rules: RULES_VERSION, switches: SWITCHES, days, members: M, ko: KO, heroes, battles, seconds: Math.round((Date.now() - t0) / 1000), complete: true, rows });
  console.log(`value ${SWITCHES}: wrote ${out} (${rows.length} rows, ${battles} battles, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

if (/open1\.[cm]?js$/.test(process.argv[1] ?? "")) {
  const mode = flag("mode");
  if (mode === "audit") audit();
  else if (mode === "balance") balance();
  else if (mode === "value") value();
  else throw new Error("--mode audit|balance|value");
}
