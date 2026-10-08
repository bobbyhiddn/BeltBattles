// HULL-1b (REQ-BFG-079; BRIEF-HULL1B 2 (b)): the fight probe, and the release's "before". New; tools/ is outside the
// fingerprint. It plays the par decks (par.ts parField: the par player's decks of seeds 1..k, parBench's members) of
// FURNACE, WEAVER, FOUNDRY and BASTION against each other on the same day, days 1-10, and reports how fights go.
//
// THE FIGHTS: every hero pairing on each day (the 4 mirrors and the 6 cross pairs), `--seeds` battle seeds per pairing
// (default 24), each seed played from both sides (the same seed, the decks swapped, as sustainBench plays them). Seed s of
// pairing (A, B) on day d is hashSeed("fightBench", d, A, B, s); it puts A's deck s mod k against B's deck
// (s + 1 + floor(s / k)) mod k, so a mirror never meets itself.
//
// PER DAY AND HERO (the fights the hero's decks take part in; a cross fight counts in both heroes' rows, a mirror once):
//  - fight length in game seconds: median, p10 and p90 (nearest rank, sustainBench's q);
//  - the hard-stop rate: fights that reach BATTLE_CAP (120 s);
//  - the wind: the share still running at WIND_START (t >= 25 s, sustainBench's inWind), and the share THE WIND DECIDES:
//    the loser ended at hp <= 0 and its windTaken is more than the hp it ended below zero, so without the wind it would
//    still be standing at that moment (hard stops and draws are never wind-decided);
//  - damage per second dealt by each side, without the wind (SideStats.damage / t: the wind is no side's damage): the
//    hero's own and its foe's, the median, and the own median's growth from the day before;
//  - each side's max hull at the start (read after Battle's constructor, before the first step): the median;
//  - (extra) the hero's win rate in its cross fights (a draw counts a half).
// An "all" row per day pools every fight once (both sides for the side columns).
//
// --warlords (optional): each par hero's decks against every captain of each slot's pool (warlordPool: Easy, Medium, Hard)
// and the Iron Matriarch on days 8-10 (MATRIARCH_DAY), warlordDeck(id, day) unsabotaged, `--wseeds` seeds per (hero,
// captain) (default 4), the par deck s mod k as side 0: fight length only (and hard stops).
//
// THE DAY reaches Battle in exactly ONE place, play() below (HULL-1c: HULL-1a's trailing `day`; with HULL_SCALE off a
// day changes nothing, so the switch-off "before" reads as HULL-1b's).
//
// --ladder-fix: LADDER_FIX on (src/sim/ladderFix.ts) in the main thread and in every worker, before any deck is built
// (the par decks may move with it: the walk feeds the bots' rating). Without it every switch is as committed (off).
// HULL-1c (REQ-BFG-079): --hull-scale (HULL_SCALE, hullScale.ts setHullScale), --npc-day (NPC_DAY, npcDay.ts setNpcDay)
// and --all-on (all three) the same way, through each module's own setter, never by editing a default.
// HULL-1c: each side's sustain that M doesn't scale (HEAL/REGEN/RIVETER/MEND PRESS hp healed, PLATE soaked, and SHIELD's
// blocked hits x the foe's mean hit) as a share of its max hull at the start: the "sustain" column (median).
//
//   npx vite build --ssr tools/fightBench.ts --outDir tools/dist/fightbench --emptyOutDir --logLevel warn
//   nice -n 19 node tools/dist/fightbench/fightBench.js --days 1-10 --k 12 --seeds 24 --workers 6 [--warlords]
//     [--wseeds 4] [--ladder-fix | --hull-scale | --npc-day | --all-on] --label before --json <out.json> --md <out.md>
// Battles fan out to worker threads; every result is keyed by its task, so the output never depends on --workers.

import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { writeFileSync } from "node:fs";
import { hashSeed } from "../src/core/rng";
import { Battle } from "../src/sim/battle";
import { BATTLE_CAP, WIND_START, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { parField } from "../src/sim/harness/par";
import { DIFFICULTIES, MATRIARCH_DAY, warlordPool, type RivalId } from "../src/sim/rivals";
import { warlordDeck } from "../src/game/road";
import { setLadderFix } from "../src/sim/ladderFix"; // --ladder-fix (HULL-1b, REQ-BFG-070)
import { setHullScale } from "../src/sim/hullScale"; // --hull-scale (HULL-1c, REQ-BFG-079)
import { setNpcDay } from "../src/sim/npcDay"; // --npc-day (HULL-1c, REQ-BFG-078)

const HEROES: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

interface Fight { a: number; b: number; seed: number }
type Task =
  | { kind: "field"; hero: HeroId; day: number; k: number }
  | { kind: "fight"; day: number; field: Build[]; fights: Fight[] };
/** One battle: winner (-1 draw, -2 none), t, hp0, hp1, max hull at the start 0 and 1, damage dealt 0 and 1 (no wind),
 *  windTaken 0 and 1; HULL-1c: the sustain M doesn't scale, 0 and 1 (hp healed + plate soaked + SHIELD's blocked hits x
 *  the foe's mean hit). */
type Out = [number, number, number, number, number, number, number, number, number, number, number, number];

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const num = (name: string, d: number): number => (flag(name) === undefined ? d : Number(flag(name)));
const has = (name: string): boolean => process.argv.includes(`--${name}`);

/** THE one place a fight is made. */
function play(field: Build[], f: Fight, day: number): Out {
  const bt = new Battle(field[f.a], field[f.b], f.seed, undefined, day); // HULL-1c: the day (HULL-1a's trailing `day`)
  const max0 = bt.sides[0].hull.max, max1 = bt.sides[1].hull.max;
  while (!bt.over && bt.ticks < 60 * 200) { // simulate()'s loop
    bt.step();
    bt.events.length = 0;
  }
  const [s0, s1] = bt.sides;
  // HULL-1c: the sustain M doesn't scale (hp healed, plate soaked, SHIELD's blocked hits at the foe's mean hit)
  const sus = (s: typeof s0, foe: typeof s0) => (s.heals?.healed ?? 0) + s.plate.absorbed + (s.blocked ?? 0) * (foe.stats.shots > 0 ? foe.stats.damage / foe.stats.shots : 0);
  return [bt.winner ?? -2, bt.t, s0.hull.hp, s1.hull.hp, max0, max1, s0.stats.damage, s1.stats.damage, s0.stats.windTaken, s1.stats.windTaken, sus(s0, s1), sus(s1, s0)];
}

function doTask(t: Task): Build[] | Out[] {
  if (t.kind === "field") return parField(t.hero, t.day, t.k);
  return t.fights.map((f) => play(t.field, f, t.day));
}

function pool(n: number, script: string) {
  // the command line goes to every worker (a worker's argv holds only node and the script otherwise): --ladder-fix
  const ws = Array.from({ length: n }, () => new Worker(new URL(script), { argv: process.argv.slice(2) }));
  const run = <T,>(tasks: Task[]) => new Promise<T[]>((done, fail) => {
    const out = new Array<T>(tasks.length);
    let next = 0, pending = tasks.length;
    if (!pending) return done(out);
    const feed = (w: Worker) => { if (next < tasks.length) { const id = next++; w.postMessage({ id, task: tasks[id] }); } };
    for (const w of ws) {
      w.removeAllListeners();
      w.on("error", fail);
      w.on("message", (m: { id: number; out: T }) => {
        out[m.id] = m.out;
        if (--pending === 0) done(out);
        else feed(w);
      });
      feed(w);
    }
  });
  return { run, close: () => Promise.all(ws.map((w) => w.terminate())) };
}

const q = (xs: number[], p: number): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
const pct = (x: number) => (100 * x).toFixed(1);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Did the wind decide this fight? The loser ended at hp <= 0 with more windTaken than the hp it ended below zero. */
function windDecided(o: Out): boolean {
  const w = o[0];
  if (w !== 0 && w !== 1) return false;
  const loser = w === 0 ? 1 : 0;
  const hp = o[2 + loser], wind = o[8 + loser];
  return hp <= 0 && wind > -hp;
}

interface Row {
  day: number; hero: string; fights: number;
  median: number; p10: number; p90: number; mean: number;
  hardStop: number; windRunning: number; windDecided: number;
  dpsOwn: number; dpsFoe: number; dpsOwnGrowth: number | null; hullOwn: number; hullFoe: number; winCross: number | null;
  /** HULL-1c: the sustain M doesn't scale, as a share of the side's own max hull at the start (median). */
  sustainOwn: number;
  /** HULL-1c: the shortest fight (s): section 1's "none under 5 s". */
  min: number;
}

function rowOf(day: number, hero: string, fights: Out[], sides: { o: Out; side: 0 | 1 }[], cross: { o: Out; side: 0 | 1 }[]): Row {
  const ts = fights.map((o) => o[1]);
  const N = fights.length;
  const own = (x: { o: Out; side: 0 | 1 }) => x.o[6 + x.side] / x.o[1];
  const foe = (x: { o: Out; side: 0 | 1 }) => x.o[6 + (1 - x.side)] / x.o[1];
  const pts = cross.reduce((s, x) => s + (x.o[0] === x.side ? 1 : x.o[0] === -1 || x.o[0] === -2 ? 0.5 : 0), 0);
  return {
    day, hero, fights: N,
    median: q(ts, 0.5), p10: q(ts, 0.1), p90: q(ts, 0.9), mean: ts.reduce((a, b) => a + b, 0) / N,
    hardStop: fights.filter((o) => o[1] >= BATTLE_CAP - 1e-6).length / N,
    windRunning: fights.filter((o) => o[1] >= WIND_START).length / N,
    windDecided: fights.filter(windDecided).length / N,
    dpsOwn: q(sides.map(own), 0.5), dpsFoe: q(sides.map(foe), 0.5), dpsOwnGrowth: null,
    hullOwn: q(sides.map((x) => x.o[4 + x.side]), 0.5), hullFoe: q(sides.map((x) => x.o[4 + (1 - x.side)]), 0.5),
    winCross: cross.length ? pts / cross.length : null,
    sustainOwn: q(sides.map((x) => x.o[10 + x.side] / Math.max(1, x.o[4 + x.side])), 0.5),
    min: ts.reduce((a, b) => Math.min(a, b), Infinity),
  };
}

function parseDays(s: string): number[] {
  if (/^\d+-\d+$/.test(s)) { const [a, b] = s.split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
  return s.split(",").map(Number);
}

async function main(): Promise<void> {
  const days = parseDays(flag("days") ?? "1-10");
  const k = num("k", 12), S = num("seeds", 24), nw = num("workers", 6), WS = num("wseeds", 4);
  const label = flag("label") ?? (has("ladder-fix") ? "before-ladders" : "before");
  // HULL-1c: which switches this run turned on (each through its module's setter, in every thread)
  const on = [allOn || has("ladder-fix") ? "LADDER_FIX" : "", allOn || has("hull-scale") ? "HULL_SCALE" : "", allOn || has("npc-day") ? "NPC_DAY" : ""].filter(Boolean);
  const switches = on.length ? `${on.join(", ")} on; every other switch as committed (off).` : "Every switch as committed (off).";
  const started = new Date().toISOString();
  const t00 = performance.now();
  const workers = pool(nw, import.meta.url);
  // 1. the par fields, every (day, hero), in the workers
  const fieldTasks: Task[] = days.flatMap((day) => HEROES.map((hero): Task => ({ kind: "field", hero, day, k })));
  const fields = await workers.run<Build[]>(fieldTasks);
  const fieldOf = (day: number, hero: HeroId): Build[] => fields[days.indexOf(day) * HEROES.length + HEROES.indexOf(hero)];
  const tField = (performance.now() - t00) / 1000;
  console.log(`${label}: par fields built (${days.length} days x ${HEROES.length} heroes x k=${k}) in ${tField.toFixed(1)} s on ${nw} workers; ${switches}`);
  // 2. the fights, one task per (day, pairing)
  const pairs: [number, number][] = [];
  for (let x = 0; x < HEROES.length; x++) for (let y = x; y < HEROES.length; y++) pairs.push([x, y]);
  const fightTasks: Task[] = [];
  for (const day of days) {
    const field = HEROES.flatMap((h) => fieldOf(day, h));
    for (const [x, y] of pairs) {
      const fights: Fight[] = [];
      for (let s = 0; s < S; s++) {
        const seed = hashSeed("fightBench", day, HEROES[x], HEROES[y], s);
        const i = s % k, j = (s + 1 + Math.floor(s / k)) % k;
        fights.push({ a: x * k + i, b: y * k + j, seed }, { a: y * k + j, b: x * k + i, seed });
      }
      fightTasks.push({ kind: "fight", day, field, fights });
    }
  }
  const t1 = performance.now();
  const res = await workers.run<Out[]>(fightTasks);
  const tFights = (performance.now() - t1) / 1000;
  // 3. the rows
  const out: { day: number; rows: Row[]; all: Row }[] = [];
  let ti = 0;
  for (const day of days) {
    const perPair = pairs.map(() => res[ti++]);
    const rows: Row[] = HEROES.map((h, hi) => {
      const fights: Out[] = [], sides: { o: Out; side: 0 | 1 }[] = [], cross: { o: Out; side: 0 | 1 }[] = [];
      pairs.forEach(([x, y], pi) => {
        if (x !== hi && y !== hi) return;
        perPair[pi].forEach((o, f) => {
          fights.push(o);
          // fight f: even = x's deck as side 0, odd = y's deck as side 0
          const xSide: 0 | 1 = f % 2 === 0 ? 0 : 1;
          if (x === y) { sides.push({ o, side: 0 }, { o, side: 1 }); return; }
          const side: 0 | 1 = x === hi ? xSide : xSide === 0 ? 1 : 0;
          sides.push({ o, side });
          cross.push({ o, side });
        });
      });
      return rowOf(day, h, fights, sides, cross);
    });
    const allF = perPair.flat();
    const all = rowOf(day, "all", allF, allF.flatMap((o) => [{ o, side: 0 as const }, { o, side: 1 as const }]), []);
    out.push({ day, rows, all });
  }
  for (let d = 1; d < out.length; d++) {
    if (out[d].day !== out[d - 1].day + 1) continue;
    out[d].rows.forEach((r, i) => { r.dpsOwnGrowth = r.dpsOwn / out[d - 1].rows[i].dpsOwn - 1; });
    out[d].all.dpsOwnGrowth = out[d].all.dpsOwn / out[d - 1].all.dpsOwn - 1;
  }
  // 4. optional: par against the warlords, fight length only
  let warlords: Record<string, unknown>[] = [];
  let tWar = 0;
  if (has("warlords")) {
    const t2 = performance.now();
    const wTasks: Task[] = [], wMeta: { day: number; slot: string; hero: HeroId; id: RivalId }[] = [];
    for (const day of days) {
      const slots: { slot: string; ids: RivalId[] }[] = DIFFICULTIES.map((d) => ({ slot: d as string, ids: warlordPool(d) }));
      if (day >= MATRIARCH_DAY) slots.push({ slot: "matriarch", ids: ["matriarch"] });
      for (const { slot, ids } of slots) for (const id of ids) for (const hero of HEROES) {
        const field = [...fieldOf(day, hero), warlordDeck(id, day)];
        const fights: Fight[] = [];
        for (let s = 0; s < WS; s++) fights.push({ a: s % k, b: k, seed: hashSeed("fightBench-warlord", day, hero, id, s) });
        wTasks.push({ kind: "fight", day, field, fights });
        wMeta.push({ day, slot, hero, id });
      }
    }
    const wRes = await workers.run<Out[]>(wTasks);
    tWar = (performance.now() - t2) / 1000;
    const groups = new Map<string, Out[]>();
    wRes.forEach((os, i) => { const m = wMeta[i]; const key = `${m.day}|${m.slot}|${m.hero}`; groups.set(key, [...(groups.get(key) ?? []), ...os]); });
    warlords = [...groups.entries()].map(([key, os]) => {
      const [day, slot, hero] = key.split("|");
      const ts = os.map((o) => o[1]);
      return { day: Number(day), slot, hero, fights: os.length, median: q(ts, 0.5), p10: q(ts, 0.1), p90: q(ts, 0.9),
        hardStop: os.filter((o) => o[1] >= BATTLE_CAP - 1e-6).length / os.length, windRunning: os.filter((o) => o[1] >= WIND_START).length / os.length,
        parWin: os.filter((o) => o[0] === 0).length / os.length };
    });
  }
  await workers.close();
  const secs = (performance.now() - t00) / 1000;
  // 5. print, JSON and markdown
  const md: string[] = [];
  md.push(`## fightBench ${label}`, "");
  md.push(`Started ${started}, ${secs.toFixed(0)} s on ${nw} workers (fields ${tField.toFixed(0)} s, fights ${tFights.toFixed(0)} s${has("warlords") ? `, warlords ${tWar.toFixed(0)} s` : ""}). ${switches}`);
  md.push(`Par decks: parField(hero, day, k = ${k}) (seeds 1..${k}). Each hero pairing (4 mirrors, 6 cross) plays ${S} seeds per day, each from both sides: hashSeed("fightBench", day, A, B, s), A's deck s mod k vs B's deck (s + 1 + floor(s / k)) mod k. ${2 * S * pairs.length} fights a day, ${2 * S * pairs.length * days.length} in all. Length in game seconds (median / p10 / p90); hard stop = reached ${BATTLE_CAP} s; wind running = t >= ${WIND_START} s; wind-decided = the loser's windTaken > the hp it ended below 0; DPS = damage dealt / t without the wind (own and foe, median; growth: own median vs the day before); hull = max hull at the start (median); win = the hero's cross-fight win rate (draw = half); sustain = what M doesn't scale (hp healed + plate soaked + SHIELD's blocked hits x the foe's mean hit) / own max hull at the start (median).`, "");
  md.push("| day | hero | fights | length med / p10 / p90 (s) | hard stop | wind running | wind-decided | DPS own (growth) | DPS foe | hull own | hull foe | win (cross) | sustain |");
  md.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const d of out) {
    console.log(`\n== day ${d.day}`);
    for (const r of [...d.rows, d.all]) {
      const g = r.dpsOwnGrowth === null ? "-" : `${r.dpsOwnGrowth >= 0 ? "+" : ""}${pct(r.dpsOwnGrowth)}%`;
      const line = `${r.hero.padEnd(7)} n ${r.fights} | t ${r.median.toFixed(2)} / ${r.p10.toFixed(2)} / ${r.p90.toFixed(2)} | hard ${pct(r.hardStop)}% | wind ${pct(r.windRunning)}% decided ${pct(r.windDecided)}% | dps own ${r.dpsOwn.toFixed(1)} (${g}) foe ${r.dpsFoe.toFixed(1)} | hull ${r.hullOwn} / ${r.hullFoe}${r.winCross === null ? "" : ` | win ${pct(r.winCross)}%`} | sustain ${pct(r.sustainOwn)}%`;
      console.log(line);
      md.push(`| ${d.day} | ${r.hero.toUpperCase()} | ${r.fights} | ${r.median.toFixed(2)} / ${r.p10.toFixed(2)} / ${r.p90.toFixed(2)} | ${pct(r.hardStop)}% | ${pct(r.windRunning)}% | ${pct(r.windDecided)}% | ${r.dpsOwn.toFixed(1)} (${g}) | ${r.dpsFoe.toFixed(1)} | ${r.hullOwn} | ${r.hullFoe} | ${r.winCross === null ? "-" : `${pct(r.winCross)}%`} | ${pct(r.sustainOwn)}% |`);
    }
  }
  if (warlords.length) {
    md.push("", `### Par against the warlords (fight length only; ${WS} seeds per hero and captain, the par deck s mod k as side 0)`, "");
    md.push("| day | slot | hero | fights | length med / p10 / p90 (s) | hard stop | wind running | par win |", "|---|---|---|---|---|---|---|---|");
    for (const w of warlords as { day: number; slot: string; hero: string; fights: number; median: number; p10: number; p90: number; hardStop: number; windRunning: number; parWin: number }[]) {
      md.push(`| ${w.day} | ${w.slot} | ${w.hero.toUpperCase()} | ${w.fights} | ${w.median.toFixed(2)} / ${w.p10.toFixed(2)} / ${w.p90.toFixed(2)} | ${pct(w.hardStop)}% | ${pct(w.windRunning)}% | ${pct(w.parWin)}% |`);
    }
    console.log(`\nwarlords: ${warlords.length} rows in ${tWar.toFixed(0)} s`);
  }
  console.log(`\ntotal ${secs.toFixed(0)} s on ${nw} worker(s)`);
  const jf = flag("json");
  if (jf) writeFileSync(jf, JSON.stringify({ label, args: process.argv.slice(2), started, secs: r2(secs), k, seeds: S, wseeds: WS, heroes: HEROES, seedScheme: "hashSeed(\"fightBench\", day, A, B, s); A deck s mod k vs B deck (s + 1 + floor(s / k)) mod k; both sides", days: out, warlords }, null, 1));
  const mf = flag("md");
  if (mf) writeFileSync(mf, md.join("\n") + "\n");
}

// only when the built bench runs (node .../fightBench.js; its worker threads share that argv)
const benchRun = !!process.argv[1]?.endsWith("fightBench.js");
// HULL-1c: --all-on turns every switch on (NPC_DAY, HULL_SCALE, LADDER_FIX)
const allOn = has("all-on");
// --ladder-fix: LADDER_FIX on in the main thread and in every worker (they get the same argv), before any deck is built
if (benchRun && (allOn || has("ladder-fix"))) setLadderFix(true);
// HULL-1c (REQ-BFG-079, REQ-BFG-078): --hull-scale and --npc-day the same way, through each module's setter
if (benchRun && (allOn || has("hull-scale"))) setHullScale(true);
if (benchRun && (allOn || has("npc-day"))) setNpcDay(true);
if (benchRun && !isMainThread) {
  parentPort!.on("message", (m: { id: number; task: Task }) => parentPort!.postMessage({ id: m.id, out: doTask(m.task) }));
} else if (benchRun) void main();
