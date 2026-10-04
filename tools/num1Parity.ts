// NUM-1 (REQ-BFG-047) parity bench: x10 and the integer pipeline against the base, on the same decks and the same seeds.
// The fights are n1CritBench's (W/wt-n1-crit/tools/n1CritBench.ts): the par fields (par.ts parField) of FURNACE, WEAVER,
// FOUNDRY and BASTION, every deck pair hero against hero, from both sides, S seeds each, on days 1, 3, 6 and 9.
//   build:   npx vite build --ssr tools/num1Parity.ts --outDir <dist> --emptyOutDir --logLevel warn
//   1. on the BASE tree:  node <dist>/num1Parity.js --dump decks.json [--days 1,3,6,9] [--k 8]   (the base's par fields)
//                         node <dist>/num1Parity.js --run decks.json --out base.json [--seeds 6] [--workers 8]
//   2. on num1:           node <dist>/num1Parity.js --run decks.json --out num1.json --hullx 10
//      (the base's decks; hullBonus, the one damage-family field a Build holds, x10 into num1's units)
//      optional: --dump num1-decks.json on num1, to see whether num1's par player builds the same decks
//   3. anywhere:          node <dist>/num1Parity.js --compare base.json num1.json [more.json ...] [--decks decks.json num1-decks.json]
// Per battle it keeps the winner, the length, both hulls, both sides' damage, burn dealt and wind taken, and how many
// ticks left a hull or a plating pool fractional (num1: must be 0). Compare reports the share of winners flipped with a
// Wilson 95% interval, the mean battle length of each run, the hero win rates, and the flips by what the battle held.
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { readFileSync, writeFileSync } from "node:fs";
import { hashSeed } from "../src/core/rng";
import { Battle } from "../src/sim/battle";
import { parField } from "../src/sim/harness/par";
import type { Build } from "../src/sim/deck";
import type { HeroId } from "../src/sim/content";

interface Fight { day: number; x: number; y: number; a: number; b: number; aIsX: boolean; seed: number } // a: side 0
// winner (-2: none), t, hull0, hull1, damage0, damage1, burnDealt0 + 1, windTaken0, plateGained0 + 1, fractional ticks,
// max hull0, max hull1
type Out = number[];
interface Decks { heroes: HeroId[]; days: number[]; k: number; fields: Record<string, Build[]> } // fields["day"]: heroes x k

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const num = (name: string, d: number): number => (flag(name) === undefined ? d : Number(flag(name)));

function play(a: Build, b: Build, seed: number): Out {
  const bt = new Battle(a, b, seed);
  let frac = 0;
  while (!bt.over && bt.ticks < 60 * 200) { // simulate()'s loop
    bt.step();
    bt.events.length = 0;
    for (const s of bt.sides) if (!Number.isInteger(s.hull.hp) || !Number.isInteger(s.plate.plate)) { frac++; break; }
  }
  const [s0, s1] = bt.sides;
  return [bt.winner ?? -2, bt.t, s0.hull.hp, s1.hull.hp, s0.stats.damage, s1.stats.damage,
    s0.stats.burnDealt + s1.stats.burnDealt, s0.stats.windTaken, s0.plate.gained + s1.plate.gained, frac, s0.hull.max, s1.hull.max];
}

function fightsOf(d: Decks, S: number): Fight[] {
  const H = d.heroes.length, k = d.k, out: Fight[] = [];
  for (const day of d.days) for (let x = 0; x < H; x++) for (let y = x + 1; y < H; y++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    for (let s = 0; s < S; s++) {
      const seed = hashSeed("num1-parity", day, d.heroes[x], d.heroes[y], i, j, s);
      out.push({ day, x, y, a: x * k + i, b: y * k + j, aIsX: true, seed });
      out.push({ day, x, y, a: y * k + j, b: x * k + i, aIsX: false, seed });
    }
  }
  return out;
}

function scaled(b: Build, hullx: number): Build {
  return hullx === 1 ? b : { ...b, hullBonus: b.hullBonus * hullx };
}

async function runAll(d: Decks, fights: Fight[], hullx: number, nw: number): Promise<Out[]> {
  const fields: Record<string, Build[]> = {};
  for (const [day, f] of Object.entries(d.fields)) fields[day] = f.map((b) => scaled(b, hullx));
  const ws = Array.from({ length: nw }, () => new Worker(new URL(import.meta.url)));
  const size = Math.max(16, Math.ceil(fights.length / (nw * 8)));
  const out = new Array<Out>(fights.length);
  await new Promise<void>((done, fail) => {
    const chunks: { id: number; fights: Fight[] }[] = [];
    for (let i = 0; i < fights.length; i += size) chunks.push({ id: chunks.length, fights: fights.slice(i, i + size) });
    let next = 0, pending = chunks.length;
    const feed = (w: Worker) => { if (next < chunks.length) w.postMessage({ ...chunks[next++], fields }); };
    for (const w of ws) {
      w.on("error", fail);
      w.on("message", (m: { id: number; out: Out[] }) => {
        m.out.forEach((o, i) => (out[m.id * size + i] = o));
        if (--pending === 0) done();
        else feed(w);
      });
      feed(w);
    }
  });
  await Promise.all(ws.map((w) => w.terminate()));
  return out;
}

/** Wilson 95% interval of k successes in n. */
function wilson(k: number, n: number): [number, number] {
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const P = (x: number) => `${(100 * x).toFixed(2)}%`;

function compare(files: string[]): void {
  const runs = files.map((f) => JSON.parse(readFileSync(f, "utf8")) as { label: string; heroes: HeroId[]; fights: Fight[]; out: Out[] });
  const base = runs[0];
  const report: Record<string, unknown>[] = [];
  for (const r of runs) {
    const n = r.out.length;
    let flips = 0, toDraw = 0, t = 0, frac = 0;
    const H = r.heroes.length, pts = Array(H).fill(0), cnt = Array(H).fill(0);
    const by: Record<string, [number, number]> = {}; // feature -> [flips, battles]
    const tally = (key: string, flipped: boolean) => { const v = (by[key] ??= [0, 0]); v[1]++; if (flipped) v[0]++; };
    r.out.forEach((o, i) => {
      const b = base.out[i], f = r.fights[i];
      const flipped = b[0] !== o[0];
      if (flipped) flips++;
      if (flipped && (o[0] === -1 || b[0] === -1)) toDraw++;
      t += o[1];
      frac += o[9] > 0 ? 1 : 0;
      const xSide = f.aIsX ? 0 : 1, xp = o[0] === xSide ? 1 : o[0] < 0 ? 0.5 : 0;
      pts[f.x] += xp; pts[f.y] += 1 - xp; cnt[f.x]++; cnt[f.y]++;
      tally(`day ${f.day}`, flipped);
      tally(b[6] > 0 ? "burn in the battle" : "no burn", flipped);
      tally(b[1] >= 25 ? "reached the dark wind (25 s+)" : "ended before the wind", flipped);
      tally(b[8] > 0 ? "plating in the battle" : "no plating", flipped);
      // how close the base's battle was: the winner's hull left, as a share of its max (a timeout: the gap of the shares)
      const left = b[0] === 0 ? b[2] / b[10] : b[0] === 1 ? b[3] / b[11] : 0;
      tally(left < 0.05 ? "close on the base (winner < 5% hull left)" : left < 0.15 ? "winner 5-15% hull left" : "winner 15%+ hull left", flipped);
      tally(`${r.heroes[f.x]} vs ${r.heroes[f.y]}`, flipped);
    });
    const [lo, hi] = wilson(flips, n);
    const row = { label: r.label, battles: n, flips, flipShare: flips / n, ci95: [lo, hi], flipsInvolvingDraw: toDraw, meanT: t / n,
      winRates: Object.fromEntries(r.heroes.map((h, i) => [h, pts[i] / cnt[i]])), battlesWithFractionalTicks: frac,
      byFeature: Object.fromEntries(Object.entries(by).map(([k, [f, m]]) => [k, { flips: f, battles: m, share: f / m }])) };
    report.push(row);
    console.log(`\n== ${r.label}: ${n} battles | winners flipped vs ${base.label}: ${flips} = ${P(flips / n)} (95% ${P(lo)}-${P(hi)}; ${toDraw} to or from a draw) | mean length ${(t / n).toFixed(2)} s | battles with a fractional hull or plating tick: ${frac}`);
    console.log(`   win rates: ${r.heroes.map((h, i) => `${h} ${P(pts[i] / cnt[i])}`).join(", ")}`);
    for (const [k, [f, m]] of Object.entries(by)) console.log(`   ${k.padEnd(36)} ${String(f).padStart(5)} / ${String(m).padStart(6)} = ${P(f / m)}`);
  }
  const jf = flag("json");
  if (jf) writeFileSync(jf, JSON.stringify(report, null, 1));
  const dk = process.argv.indexOf("--decks");
  if (dk >= 0) { // do two deck dumps hold the same decks (the second's hullBonus / 10)?
    const [a, b] = [process.argv[dk + 1], process.argv[dk + 2]].map((f) => JSON.parse(readFileSync(f, "utf8")) as Decks);
    let same = 0, all = 0;
    for (const day of Object.keys(a.fields)) a.fields[day].forEach((x, i) => {
      const y = b.fields[day][i];
      all++;
      if (JSON.stringify(x) === JSON.stringify({ ...y, hullBonus: y.hullBonus / 10 })) same++;
    });
    console.log(`\n== decks: ${same} of ${all} par-field decks are the same in both dumps (hullBonus / 10)`);
  }
}

async function main(): Promise<void> {
  const heroes = (flag("heroes")?.split(",") as HeroId[] | undefined) ?? (["furnace", "weaver", "foundry", "bastion"] as HeroId[]);
  if (flag("dump")) {
    const days = (flag("days") ?? "1,3,6,9").split(",").map(Number), k = num("k", 8);
    const fields: Record<string, Build[]> = {};
    for (const day of days) fields[day] = heroes.flatMap((h) => parField(h, day, k));
    writeFileSync(flag("dump")!, JSON.stringify({ heroes, days, k, fields } satisfies Decks));
    console.log(`dumped ${days.length} days x ${heroes.length} heroes x ${k} decks`);
    return;
  }
  if (flag("run")) {
    const d = JSON.parse(readFileSync(flag("run")!, "utf8")) as Decks;
    const S = num("seeds", 6), hullx = num("hullx", 1), nw = num("workers", 8);
    const fights = fightsOf(d, S);
    const t0 = performance.now();
    const out = await runAll(d, fights, hullx, nw);
    const secs = (performance.now() - t0) / 1000;
    writeFileSync(flag("out")!, JSON.stringify({ label: flag("label") ?? flag("out"), heroes: d.heroes, hullx, seeds: S, secs, fights, out }));
    console.log(`${fights.length} battles in ${secs.toFixed(1)} s on ${nw} workers -> ${flag("out")}`);
    return;
  }
  const ci = process.argv.indexOf("--compare");
  if (ci >= 0) { // the result files up to the next flag
    const files: string[] = [];
    for (const a of process.argv.slice(ci + 1)) { if (a.startsWith("--")) break; files.push(a); }
    compare(files);
  }
}

if (!isMainThread) {
  parentPort!.on("message", (c: { id: number; fights: Fight[]; fields: Record<string, Build[]> }) => {
    parentPort!.postMessage({ id: c.id, out: c.fights.map((f) => play(c.fields[f.day][f.a], c.fields[f.day][f.b], f.seed)) });
  });
} else void main();
