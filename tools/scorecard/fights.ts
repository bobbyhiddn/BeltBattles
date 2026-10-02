// SC-TOOL --fights (fight-length-median, fight-length-floor; checks for first-fight-par-loss-rate and filler-vs-par):
// battles through the harness's own path (tournament.ts jobDetail: battle.ts simulate from both sides per seed, each
// battle's winner and length in game seconds at 1x), on tools/workers.ts's worker pool.
// - The par field is parBench's: par.ts parField(hero, day, k), the par player's decks of seeds 1..k (typical policy).
// - (a) Every par member against every dusk stand-in deck standInFoe serves that day (swept over run seeds 1..n, as
//   --static does); a stand-in deck's battles weigh by how often standInFoe serves it, so the numbers are those of
//   the dusk fights a run meets. (b) The par field against itself, per hero pair (FURNACE-FURNACE, FURNACE-WEAVER,
//   WEAVER-WEAVER), every pair of distinct members.
// - A pairing's median is the median of its 2 x seeds battles; fight-length-floor flags pairings under the target.
// - 0.8.0 H1 M6 (REQ-BFG-026): (b)'s battles also count the first hero's points (a win 1, a draw 1/2), so each hero
//   pairing has a win rate: winrate-pairing-band (every pairing of two different heroes, per day) and
//   winrate-hero-average (each hero's mean over its pairings with the other heroes, per day). The heroes are
//   PLAYABLE_HEROES; with FOUNDRY and BASTION playable their par fields meet FURNACE's and WEAVER's.
// Each day is written to <out>/sc-fights-d<day>.json as soon as it is done; the rows are rebuilt from every day file
// present, so --days can split the run across shell calls.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashSeed } from "../../src/core/rng";
import { RUN_DAYS, WIND_START, type HeroId } from "../../src/sim/content";
import { turretsCost, type Build } from "../../src/sim/deck";
import { PLAYABLE_HEROES } from "../../src/sim/heroBuilds";
import { deckCost } from "../../src/sim/rivals";
import { parField } from "../../src/sim/harness/par";
import type { Job } from "../../src/sim/harness/tournament";
import { workerRunner } from "../workers";
import { servedStandIns } from "./static";
import { mdTable, row, type Row, type Section } from "./report";
import { cmpOf, fmt, mean, quantile, rangeOf, weightedQuantile, type Target } from "./targets";

export interface FightsOpts { k: number; seeds: number; days: number[]; standinSeeds: number; workers: number; script: string; out: string; label: string; args: string[] }

/** One job's battles from jobDetail's "winner,duration,hull0,hull1;..." (per seed: a as player, then a as enemy). */
export function parseDetail(detail: string): { t: number; a: number }[] {
  return detail.split(";").filter(Boolean).map((b, i) => {
    const [w, t] = b.split(",").map(Number);
    const aSide = i % 2;
    return { t, a: w === -1 ? 0.5 : w === aSide ? 1 : 0 };
  });
}

const r2 = (x: number) => Math.round(x * 100) / 100;

interface StandInOut { hero: HeroId; cost: number; served: number; captains: string[]; vs: Record<string, { pts: number; n: number }>; t: number[]; pairs: { hero: string; m: number; med: number }[] }
// 0.8.0 H1 M6: pts and n, the first hero's points over the pairing's battles (absent in a day file made before)
interface PairOut { key: string; t: number[]; pairs: { a: number; b: number; med: number }[]; pts?: number; n?: number }
interface DayFile { day: number; k: number; seeds: number; standinSeeds: number; label: string; heroes: string[]; seconds: number; battles: number; standins: StandInOut[]; pairs: PairOut[] }

const dayPath = (out: string, day: number) => resolve(out, `sc-fights-d${day}.json`);

async function runDay(day: number, o: FightsOpts, detail: (f: Build[], j: Job[]) => Promise<string[]>): Promise<DayFile> {
  const t0 = performance.now();
  const heroes = [...PLAYABLE_HEROES];
  const fields = heroes.map((h) => parField(h, day, o.k));
  const { decks } = servedStandIns(day, o.standinSeeds);
  const field: Build[] = [...decks.map((d) => d.build), ...fields.flat()];
  const at = (hi: number) => decks.length + hi * o.k;
  const seedsOf = (...key: (string | number)[]) => Array.from({ length: o.seeds }, (_, s) => hashSeed("sc-fights", day, ...key, s));
  const jobs: Job[] = [];
  const tagA: { d: number; hi: number; m: number }[] = [];
  decks.forEach((_, d) => heroes.forEach((h, hi) => fields[hi].forEach((_, m) => {
    jobs.push({ a: d, b: at(hi) + m, seeds: seedsOf("standin", d, h, m) });
    tagA.push({ d, hi, m });
  })));
  const nA = jobs.length;
  const tagB: { key: string; a: number; b: number }[] = [];
  heroes.forEach((h1, i) => heroes.forEach((h2, j) => {
    if (j < i) return;
    for (let a = 0; a < o.k; a++) for (let b = i === j ? a + 1 : 0; b < o.k; b++) {
      jobs.push({ a: at(i) + a, b: at(j) + b, seeds: seedsOf("par", h1, h2, a, b) });
      tagB.push({ key: `${h1}-${h2}`, a, b });
    }
  }));
  const det = await detail(field, jobs);
  const standins: StandInOut[] = decks.map((d) => ({ hero: d.hero, cost: 0, served: d.served, captains: d.captains, vs: Object.fromEntries(heroes.map((h) => [h, { pts: 0, n: 0 }])), t: [], pairs: [] }));
  const pairs = new Map<string, PairOut>();
  let battles = 0;
  det.forEach((s, x) => {
    const bs = parseDetail(s);
    battles += bs.length;
    const med = quantile(bs.map((b) => b.t), 0.5);
    if (x < nA) {
      const g = tagA[x], si = standins[g.d], h = heroes[g.hi];
      si.vs[h].pts += bs.reduce((q, b) => q + b.a, 0);
      si.vs[h].n += bs.length;
      si.t.push(...bs.map((b) => r2(b.t)));
      si.pairs.push({ hero: h, m: g.m, med: r2(med) });
    } else {
      const g = tagB[x - nA];
      const p = pairs.get(g.key) ?? { key: g.key, t: [], pairs: [], pts: 0, n: 0 };
      p.t.push(...bs.map((b) => r2(b.t)));
      p.pairs.push({ a: g.a, b: g.b, med: r2(med) });
      p.pts = (p.pts ?? 0) + bs.reduce((q, b) => q + b.a, 0); // 0.8.0 H1 M6: the first hero's points
      p.n = (p.n ?? 0) + bs.length;
      pairs.set(g.key, p);
    }
  });
  decks.forEach((d, i) => (standins[i].cost = deckCost(d.build).total + turretsCost(d.build)));
  return { day, k: o.k, seeds: o.seeds, standinSeeds: o.standinSeeds, label: o.label, heroes, seconds: (performance.now() - t0) / 1000, battles, standins, pairs: [...pairs.values()] };
}

interface Kind { day: number; kind: string; n: number; median: number; p25: number; p75: number; wind: number; minPair: number }

export async function fightsMode(targets: Target[], o: FightsOpts): Promise<{ rows: Row[]; sections: Section[]; meta: Record<string, unknown> }> {
  mkdirSync(o.out, { recursive: true });
  const pool = workerRunner(o.workers, o.script);
  try {
    for (const day of o.days) {
      if (!(day >= 1 && day <= RUN_DAYS)) throw new Error(`--days: ${day} is not a day 1-${RUN_DAYS}`);
      const f = await runDay(day, o, pool.detail);
      writeFileSync(dayPath(o.out, day), JSON.stringify(f));
      console.log(`fights d${day}: ${f.battles} battles, ${f.standins.length} stand-in decks, ${f.seconds.toFixed(0)} s`);
    }
  } finally {
    await pool.close();
  }
  return assemble(targets, o.out);
}

/** Rows from every sc-fights-d<day>.json in `out` (days missing are named). */
export function assemble(targets: Target[], out: string): { rows: Row[]; sections: Section[]; meta: Record<string, unknown> } {
  const files: DayFile[] = [];
  const missing: number[] = [];
  for (let day = 1; day <= RUN_DAYS; day++) {
    if (existsSync(dayPath(out, day))) files.push(JSON.parse(readFileSync(dayPath(out, day), "utf8")) as DayFile);
    else missing.push(day);
  }
  const kinds: Kind[] = [];
  const filler: { day: number; w: number; u: number; per: Record<string, number> }[] = [];
  const floorT = targets.find((t) => t.id === "fight-length-floor");
  const floor = floorT ? cmpOf(floorT) : null;
  const floorV = floor && floor.kind !== "band" ? floor.v : 3;
  const under: string[] = [];
  let minPair = Infinity;
  for (const f of files) {
    const total = f.standins.reduce((s, d) => s + d.served, 0);
    const ws = f.standins.flatMap((d) => d.t.map((t) => ({ v: t, w: d.served / total / d.t.length })));
    const sMin = Math.min(...f.standins.flatMap((d) => d.pairs.map((p) => p.med)));
    kinds.push({ day: f.day, kind: "par vs stand-ins", n: ws.length, median: weightedQuantile(ws, 0.5), p25: weightedQuantile(ws, 0.25), p75: weightedQuantile(ws, 0.75), wind: ws.reduce((s, x) => s + (x.v >= WIND_START ? x.w : 0), 0) / ws.reduce((s, x) => s + x.w, 0), minPair: sMin });
    for (const d of f.standins) for (const p of d.pairs) if (p.med < floorV) under.push(`d${f.day} ${d.hero} stand-in (${d.captains.join("/")}) vs ${p.hero} par #${p.m + 1}: ${p.med} s`);
    for (const p of f.pairs) {
      const m = Math.min(...p.pairs.map((x) => x.med));
      kinds.push({ day: f.day, kind: p.key, n: p.t.length, median: quantile(p.t, 0.5), p25: quantile(p.t, 0.25), p75: quantile(p.t, 0.75), wind: p.t.filter((t) => t >= WIND_START).length / p.t.length, minPair: m });
      const [h1, h2] = p.key.split("-");
      for (const x of p.pairs) if (x.med < floorV) under.push(`d${f.day} ${h1} par #${x.a + 1} vs ${h2} par #${x.b + 1}: ${x.med} s`);
    }
    minPair = Math.min(minPair, ...kinds.filter((k) => k.day === f.day).map((k) => k.minPair));
    // the stand-ins' win rate against par (draws half), weighted by how often standInFoe serves each deck
    const rate = (d: StandInOut, h?: string) => {
      const vs = h ? [d.vs[h]] : Object.values(d.vs);
      return vs.reduce((s, v) => s + v.pts, 0) / vs.reduce((s, v) => s + v.n, 0);
    };
    filler.push({
      day: f.day,
      w: f.standins.reduce((s, d) => s + (d.served / total) * rate(d), 0),
      u: mean(f.standins.map((d) => rate(d))),
      per: Object.fromEntries(f.heroes.map((h) => [h, f.standins.reduce((s, d) => s + (d.served / total) * rate(d, h), 0)])),
    });
  }
  const setups = [...new Set(files.map((f) => `K ${f.k}, ${f.seeds} seeds, stand-in seeds ${f.standinSeeds}, label ${f.label}`))];
  const miss = [
    ...(missing.length ? [`Days not yet run: ${missing.join(", ")}.`] : []),
    ...(setups.length > 1 ? [`WARNING: the day files were made with different settings (${setups.join(" | ")}); re-run every day with one setting.`] : []),
  ];
  // 0.8.0 H1 M6 (REQ-BFG-026): each pairing of two different heroes' win rate (the first hero's), and each hero's mean
  // over its pairings, per day; the F/W columns read only its pairings with FURNACE and WEAVER
  const wins: { day: number; h1: string; h2: string; rate: number; n: number }[] = [];
  for (const f of files) for (const p of f.pairs) {
    const [h1, h2] = p.key.split("-");
    if (h1 !== h2 && p.n) wins.push({ day: f.day, h1, h2, rate: (p.pts ?? 0) / p.n, n: p.n });
  }
  const rateOf = (day: number, h: string, vs: string): number | undefined => {
    const w = wins.find((x) => x.day === day && ((x.h1 === h && x.h2 === vs) || (x.h1 === vs && x.h2 === h)));
    return w ? (w.h1 === h ? w.rate : 1 - w.rate) : undefined;
  };
  const avgs: { day: number; hero: string; all: number; fw: number }[] = [];
  for (const f of files) for (const h of f.heroes) {
    const others = f.heroes.filter((x) => x !== h).map((x) => rateOf(f.day, h, x)).filter((x): x is number => x !== undefined);
    const fw = ["furnace", "weaver"].filter((x) => x !== h).map((x) => rateOf(f.day, h, x)).filter((x): x is number => x !== undefined);
    if (others.length) avgs.push({ day: f.day, hero: h, all: mean(others), fw: fw.length ? mean(fw) : NaN });
  }
  const lenT = targets.find((t) => t.id === "fight-length-median");
  const lenC = lenT ? cmpOf(lenT) : null;
  const outside = lenC && lenC.kind === "band" ? kinds.filter((k) => k.median < lenC.lo || k.median > lenC.hi) : [];
  const rows: Row[] = [];
  const f0 = files[0];
  rows.push(row(targets, "fight-length-median", rangeOf(kinds.map((k) => k.median)), "s (median per day and matchup)",
    [`Per day, par vs stand-ins: ${kinds.filter((k) => k.kind === "par vs stand-ins").map((k) => `d${k.day} ${fmt(k.median, 1)}`).join(", ")}.`,
      ...(files.length ? [...new Set(kinds.map((k) => k.kind))].filter((x) => x !== "par vs stand-ins").map((x) => `${x}: ${kinds.filter((k) => k.kind === x).map((k) => `d${k.day} ${fmt(k.median, 1)}`).join(", ")}.`) : []),
      outside.length ? `Outside: ${outside.map((k) => `d${k.day} ${k.kind} ${fmt(k.median, 1)}`).join(", ")}.` : "",
      f0 ? `K ${f0.k} par decks per hero, ${f0.seeds} seeds x both sides per pairing; IQR in the detail.` : "", ...miss].filter(Boolean),
    kinds, 1));
  rows.push(row(targets, "fight-length-floor", Number.isFinite(minPair) ? minPair : null, "s (shortest pairing median)",
    [under.length ? `${under.length} pairings under ${floorV} s: ${under.slice(0, 25).join("; ")}${under.length > 25 ? "; ..." : ""}.` : `No pairing's median under ${floorV} s.`, ...miss], { under }, 2));
  const d1 = filler.find((x) => x.day === 1);
  rows.push(row(targets, "first-fight-par-loss-rate", d1 ? d1.w : null, "(par's day-1 losses to the served stand-ins; CHECK ONLY)",
    [d1 ? `Per hero: ${Object.entries(d1.per).map(([h, v]) => `${h.toUpperCase()} par loses ${fmt(v)}`).join(", ")}; unweighted over decks ${fmt(d1.u)}.` : "Day 1 not run.",
      "The official value comes from parBench --rivals; this is its check, on the decks standInFoe serves on this tip (weighted by how often it serves each)."], d1 ?? null));
  rows.push(row(targets, "filler-vs-par", rangeOf(filler.map((x) => x.w)), "(stand-in win rate vs par, per day; CHECK ONLY)",
    [`Per day (served-weighted): ${filler.map((x) => `d${x.day} ${fmt(x.w)}`).join(", ")}.`, `Unweighted mean over the day's decks: ${filler.map((x) => `d${x.day} ${fmt(x.u)}`).join(", ")}.`,
      "The official value comes from parBench --rivals.", ...miss], filler));
  if (wins.length) {
    // 0.8.0 H1 M6: the cross-hero table's two rows, from (b)'s par-vs-par battles
    const out = wins.filter((w) => w.rate < 0.35 || w.rate > 0.65);
    rows.push(row(targets, "winrate-pairing-band", rangeOf(wins.map((w) => w.rate)), "(first hero's win rate, per day and pairing of two heroes' par fields)",
      [out.length ? `Outside 35-65%: ${out.map((w) => `d${w.day} ${w.h1} vs ${w.h2} ${fmt(w.rate)}`).join(", ")}.` : "Every pairing inside 35-65%.",
        f0 ? `K ${f0.k} par decks per hero, ${f0.seeds} seeds x both sides per pair of members.` : "", ...miss].filter(Boolean), wins));
    const outA = avgs.filter((a) => a.all < 0.45 || a.all > 0.55);
    rows.push(row(targets, "winrate-hero-average", rangeOf(avgs.map((a) => a.all)), "(each hero's mean win rate over its pairings, per day)",
      [outA.length ? `Outside 45-55%: ${outA.map((a) => `d${a.day} ${a.hero} ${fmt(a.all)}`).join(", ")}.` : "Every hero's average inside 45-55%.", ...miss], avgs));
  }
  const sections: Section[] = [{
    title: "Fight length per day and matchup (game seconds at 1x)",
    lines: [
      `Par vs stand-ins: every par deck (both heroes) against every deck standInFoe serves that day, weighted by how often it is served. Wind = the share of fights still running at WIND_START (${WIND_START} s).`, "",
      ...mdTable(["day", "matchup", "battles", "median", "IQR (p25-p75)", "reach the wind", "shortest pairing median"],
        kinds.map((k) => [k.day, k.kind, k.n, fmt(k.median, 1), `${fmt(k.p25, 1)}-${fmt(k.p75, 1)}`, `${(100 * k.wind).toFixed(0)}%`, fmt(k.minPair, 1)])),
      "",
      ...mdTable(["day", "stand-ins' win rate vs par (served-weighted)", ...(f0?.heroes ?? []).map((h) => `vs ${h} par`), "unweighted over decks", "decks", "runtime (s)"],
        filler.map((x) => [x.day, fmt(x.w), ...Object.values(x.per).map((v) => fmt(v)), fmt(x.u), files.find((f) => f.day === x.day)?.standins.length ?? "-", fmt(files.find((f) => f.day === x.day)?.seconds ?? NaN, 0)])),
    ],
  }];
  if (wins.length) {
    sections.push({
      title: "Win rates per hero pairing (par field vs par field) and each hero's average",
      lines: [
        "Each pairing: every member of the first hero's par field against every member of the second's, seeds x both sides; the first hero's win rate (draws half). Band 35-65%.", "",
        ...mdTable(["day", "pairing", "first hero's win rate", "battles", "in 35-65%"], wins.map((w) => [w.day, `${w.h1} vs ${w.h2}`, fmt(w.rate), w.n, w.rate >= 0.35 && w.rate <= 0.65 ? "yes" : "NO"])),
        "",
        ...mdTable(["day", "hero", "average vs the other heroes", "average vs FURNACE and WEAVER", "in 45-55% (all)"],
          avgs.map((a) => [a.day, a.hero, fmt(a.all), Number.isNaN(a.fw) ? "-" : fmt(a.fw), a.all >= 0.45 && a.all <= 0.55 ? "yes" : "NO"])),
      ],
    });
  }
  return { rows, sections, meta: { days: files.map((f) => f.day), missing, k: f0?.k, seeds: f0?.seeds, standinSeeds: f0?.standinSeeds, dayLabels: [...new Set(files.map((f) => f.label))], daySeconds: files.map((f) => ({ day: f.day, seconds: f.seconds, battles: f.battles })) } };
}
