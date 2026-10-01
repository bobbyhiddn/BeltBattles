// SC-TOOL --output-gap (REQ-BFG-026 item 5: "a median-output gap over 2x per hero and day is flagged"; targets.json
// winrate-hero-average's rationale: Batomon's developer acted on a 2x median-DPS gap; DONE-CHECK-40d2b2c finding 3).
// - Output is damage dealt per second of fight (DPS), from battle.ts's own result fields: Battle.sides[s].stats.damage
//   of the hero's side s (every hit that lands with its Fray bonus and SABOT's +6, LIMPET blasts, Burn and poison on the
//   enemy hull, overkill included; the dark wind is nobody's output: it is stats.windTaken) over Battle.t, the fight's
//   length in game seconds at 1x.
// - Per day, every hero's decks fight one fixed opponent set, the same for every hero: the dusk stand-in decks
//   standInFoe serves that day over run seeds 1..n (static.ts servedStandIns, SC-TOOL --fights' opponents). A battle
//   weighs by how often its opponent is served (each opponent's battles share its served weight), as --fights does.
// - Playable heroes (FURNACE, WEAVER) bring their par field (par.ts parField: the par player's decks of seeds 1..K).
//   The four race heroes are not playable yet: their reference decks (heroRefBuild) are information only, beside
//   FURNACE's and WEAVER's own heroRefBuild for a like-for-like reading. Each pairing plays its seeds from both sides.
// - The flag (the row): per day, the highest playable hero's median DPS over the lowest; 2.0 or more is flagged.
// - Hull-aware view (information, because hulls differ by hero): the share of the opponent's hull the hero's damage
//   removes per second, min(damage, opponent hull.max) / hull.max / t (overkill doesn't count), and the same for the
//   damage the hero takes against its own hull.max; their quotient (exchange) is above 1 when the hero strips the
//   opponent's hull faster than it loses its own.

import { Rng, hashSeed } from "../../src/core/rng";
import { RUN_DAYS, type HeroId } from "../../src/sim/content";
import { simulate } from "../../src/sim/battle";
import type { Build } from "../../src/sim/deck";
import { PLAYABLE_HEROES, heroRefBuild } from "../../src/sim/heroBuilds";
import { HARNESS_HEROES } from "../../src/sim/harness/heroes";
import { parField } from "../../src/sim/harness/par";
import type { Job } from "../../src/sim/harness/tournament";
import { servedStandIns } from "./static";
import { mdTable, type Row, type Section } from "./report";
import { fmt, rangeOf, weightedQuantile } from "./targets";
import { runJobs } from "./pool";

// ---------------------------------------------------------------- the flag (pure: tests check it on synthetic tables)

/** REQ-BFG-026 item 5's flag: a day whose highest median output is this many times its lowest. */
export const GAP_FLAG = 2.0;

/** The highest of a day's median outputs over the lowest (Infinity when the lowest is 0; NaN with fewer than two). */
export function gapRatio(medians: readonly number[]): number {
  const f = medians.filter((x) => Number.isFinite(x) && x >= 0);
  if (f.length < 2) return NaN;
  const hi = Math.max(...f), lo = Math.min(...f);
  return hi === 0 ? NaN : hi / lo;
}

/** Flagged at `flag` or more (a hair of float error under it still counts as it). */
export const gapFlagged = (ratio: number, flag = GAP_FLAG): boolean => !Number.isNaN(ratio) && ratio >= flag - 1e-9;

/** The flag table: per day, `heroes`' median outputs, their ratio, which hero is highest and lowest, and the flag. */
export function gapFlags(days: readonly { day: number; medians: Readonly<Record<string, number>> }[], heroes: readonly string[], flag = GAP_FLAG): { day: number; ratio: number; flagged: boolean; hi: string; lo: string }[] {
  return days.map((d) => {
    const xs = heroes.map((h) => ({ h, v: d.medians[h] })).filter((x) => Number.isFinite(x.v));
    const ratio = gapRatio(xs.map((x) => x.v));
    const by = [...xs].sort((a, b) => a.v - b.v);
    return { day: d.day, ratio, flagged: gapFlagged(ratio, flag), hi: by[by.length - 1]?.h ?? "-", lo: by[0]?.h ?? "-" };
  });
}

// ---------------------------------------------------------------- battles (worker-safe)

/** Per battle of job j, each seed played with a as player, then a as enemy: [a's DPS, the share of b's hull a's
 *  damage removed per second, the fight's length (s), a's points (win 1, draw 0.5), a's hull.max, b's DPS, the share
 *  of a's hull b's damage removed per second]. */
export function gapBattles(field: readonly Build[], j: Job): number[][] {
  const out: number[][] = [];
  for (const s of j.seeds) {
    for (const side of [0, 1] as const) {
      const r = side === 0 ? simulate(field[j.a], field[j.b], s) : simulate(field[j.b], field[j.a], s);
      const me = r.sides[side], foe = r.sides[side === 0 ? 1 : 0], t = r.t;
      const pts = r.winner === side ? 1 : r.winner === -1 || r.winner === null ? 0.5 : 0;
      out.push([
        me.stats.damage / t, Math.min(me.stats.damage, foe.hull.max) / foe.hull.max / t, t, pts, me.hull.max,
        foe.stats.damage / t, Math.min(foe.stats.damage, me.hull.max) / me.hull.max / t,
      ]);
    }
  }
  return out;
}

export interface GapChunk { field: Build[]; jobs: Job[] }
export const gapChunk = (c: GapChunk): number[][][] => c.jobs.map((j) => gapBattles(c.field, j));

// ---------------------------------------------------------------- the mode

export interface GapOpts { k: number; seeds: number; refSeeds: number; days: number[]; standinSeeds: number; workers: number; script: string; flag: number; boot: number }

interface Entry { hero: HeroId; kind: "par" | "ref"; build: Build; key: string }
export interface GapCell {
  hero: HeroId; kind: "par" | "ref"; decks: number; battles: number;
  dps: number; dpsP25: number; dpsP75: number; // weighted median and quartiles of the battles' DPS
  share: number; // weighted median share of the opponent's hull removed per second
  taken: number; takenShare: number; // the opponent's DPS against this hero, and the share of the hero's own hull per second
  hull: number; // the hero's mean hull.max (hull + plating)
  win: number; // weighted win rate (draws half)
}
export interface GapDay { day: number; opponents: number; captains: string[]; cells: GapCell[]; ratio: number; flagged: boolean; ratioCI: [number, number]; shareRatio: number; refRatio: number; refShareRatio: number; raceRatio: number; battles: number; seconds: number }

const cellOf = (cs: readonly GapCell[], hero: string, kind: "par" | "ref") => cs.find((c) => c.hero === hero && c.kind === kind);

async function gapDay(day: number, o: GapOpts): Promise<GapDay> {
  const t0 = performance.now();
  const { decks: opp } = servedStandIns(day, o.standinSeeds);
  const total = opp.reduce((s, d) => s + d.served, 0);
  const entries: Entry[] = [
    ...PLAYABLE_HEROES.flatMap((h) => parField(h, day, o.k).map((b, m) => ({ hero: h, kind: "par" as const, build: b, key: `par-${h}-${m}` }))),
    ...HARNESS_HEROES.map((h) => ({ hero: h, kind: "ref" as const, build: heroRefBuild(h, day), key: `ref-${h}` })),
  ];
  const field = [...opp.map((d) => d.build), ...entries.map((e) => e.build)];
  const jobs: Job[] = [], tag: { e: number; o: number }[] = [];
  entries.forEach((e, ei) => opp.forEach((_, oi) => {
    const n = e.kind === "par" ? o.seeds : o.refSeeds;
    jobs.push({ a: opp.length + ei, b: oi, seeds: Array.from({ length: n }, (_, s) => hashSeed("sc-gap", day, e.key, oi, s)) });
    tag.push({ e: ei, o: oi });
  }));
  const size = Math.max(4, Math.ceil(jobs.length / (Math.max(1, o.workers) * 8)));
  const chunks: GapChunk[] = [];
  for (let i = 0; i < jobs.length; i += size) chunks.push({ field, jobs: jobs.slice(i, i + size) });
  const res = (await runJobs("gap", chunks, o.workers, o.script, gapChunk)).flat();
  const served = opp.map((d) => d.served);
  const groups = new Map<string, { hero: HeroId; kind: "par" | "ref"; decks: Set<number>; rows: GapRow[] }>();
  let battles = 0;
  res.forEach((bs, x) => {
    const g = tag[x], e = entries[g.e], key = `${e.kind}/${e.hero}`;
    const grp = groups.get(key) ?? { hero: e.hero, kind: e.kind, decks: new Set<number>(), rows: [] };
    grp.decks.add(g.e);
    for (const v of bs) grp.rows.push({ e: g.e, o: g.o, v });
    battles += bs.length;
    groups.set(key, grp);
  });
  const cells: GapCell[] = [...groups.values()].map((g) => {
    const q = (i: number, at: number) => servedQuantile(g.rows, served, i, at);
    return {
      hero: g.hero, kind: g.kind, decks: g.decks.size, battles: g.rows.length,
      dps: q(0, 0.5), dpsP25: q(0, 0.25), dpsP75: q(0, 0.75), share: q(1, 0.5), taken: q(5, 0.5), takenShare: q(6, 0.5),
      hull: g.rows.reduce((s, r) => s + r.v[4], 0) / g.rows.length, win: servedMean(g.rows, served, 3),
    };
  });
  const par = PLAYABLE_HEROES.map((h) => cellOf(cells, h, "par")!);
  const refs = HARNESS_HEROES.map((h) => cellOf(cells, h, "ref")!);
  const ratio = gapRatio(par.map((c) => c.dps));
  const fields = PLAYABLE_HEROES.map((h) => groups.get(`par/${h}`)!.rows);
  return {
    day, opponents: opp.length, captains: opp.map((d) => d.captains.join("/")), cells, ratio, flagged: gapFlagged(ratio, o.flag),
    ratioCI: bootRatio(fields, served, o.boot, hashSeed("sc-gap-boot", day)),
    shareRatio: gapRatio(par.map((c) => c.share)),
    // the race heroes read like for like: reference decks against reference decks (a par field is a stronger deck)
    refRatio: gapRatio(refs.map((c) => c.dps)), refShareRatio: gapRatio(refs.map((c) => c.share)),
    raceRatio: gapRatio(refs.filter((c) => !PLAYABLE_HEROES.includes(c.hero)).map((c) => c.dps)),
    battles, seconds: (performance.now() - t0) / 1000,
  };
}

/** One battle of a hero's deck `e` against opponent `o` (gapBattles' values). */
export interface GapRow { e: number; o: number; v: number[] }

/** Each battle's weight: its opponent's share of the served stand-ins, split over that opponent's battles here. */
function servedWeights(rows: readonly GapRow[], served: readonly number[]): number[] {
  const per = new Map<number, number>();
  for (const r of rows) per.set(r.o, (per.get(r.o) ?? 0) + 1);
  const tot = [...per.keys()].reduce((s, oi) => s + served[oi], 0);
  return rows.map((r) => served[r.o] / tot / per.get(r.o)!);
}

/** The served-weighted quantile `at` of value i over these battles. */
export function servedQuantile(rows: readonly GapRow[], served: readonly number[], i: number, at: number): number {
  const w = servedWeights(rows, served);
  return weightedQuantile(rows.map((r, x) => ({ v: r.v[i], w: w[x] })), at);
}

const servedMean = (rows: readonly GapRow[], served: readonly number[], i: number): number => {
  const w = servedWeights(rows, served);
  return rows.reduce((s, r, x) => s + w[x] * r.v[i], 0);
};

/** A 95% interval for the first field's median DPS over the second's (FURNACE / WEAVER): each field's par decks
 *  resampled with replacement, `n` times (seeded); the 2.5% and 97.5% points. [NaN, NaN] when n is 0 or there
 *  aren't two fields. The widest gap inside it is max(hi, 1 / lo). */
export function bootRatio(fields: readonly (readonly GapRow[])[], served: readonly number[], n: number, seed: number): [number, number] {
  if (n <= 0 || fields.length !== 2) return [NaN, NaN];
  const byDeck = fields.map((rows) => {
    const m = new Map<number, GapRow[]>();
    for (const r of rows) m.set(r.e, [...(m.get(r.e) ?? []), r]);
    return [...m.values()];
  });
  const rng = new Rng(seed);
  const ratios: number[] = [];
  for (let b = 0; b < n; b++) {
    const meds = byDeck.map((decks) => servedQuantile(decks.flatMap(() => decks[rng.int(decks.length)]), served, 0, 0.5));
    ratios.push(meds[0] / meds[1]);
  }
  ratios.sort((a, b) => a - b);
  return [ratios[Math.floor(0.025 * (n - 1))], ratios[Math.ceil(0.975 * (n - 1))]];
}

/** The widest max / min gap inside a signed ratio's interval [lo, hi]. */
export const widestGap = (ci: readonly [number, number]): number => Math.max(ci[1], 1 / ci[0]);

const f2 = (x: number) => fmt(x, 2);
const pcs = (x: number) => (Number.isFinite(x) ? `${(100 * x).toFixed(2)}%` : "-");
const H = (h: string) => h.toUpperCase();

export async function gapMode(o: GapOpts): Promise<{ rows: (Row & { digits?: number })[]; sections: Section[]; meta: Record<string, unknown> }> {
  const days: GapDay[] = [];
  for (const day of o.days) {
    if (!(day >= 1 && day <= RUN_DAYS)) throw new Error(`--days: ${day} is not a day 1-${RUN_DAYS}`);
    const d = await gapDay(day, o);
    days.push(d);
    console.log(`output-gap d${day}: ${d.battles} battles, ${d.opponents} opponents, ratio ${f2(d.ratio)}${d.flagged ? " FLAGGED" : ""}, ${d.seconds.toFixed(0)} s`);
  }
  const race = HARNESS_HEROES.filter((h) => !PLAYABLE_HEROES.includes(h));
  const flagged = days.filter((d) => d.flagged);
  const par = (d: GapDay, h: string) => cellOf(d.cells, h, "par")!;
  const ref = (d: GapDay, h: string) => cellOf(d.cells, h, "ref")!;
  const hiLo = gapFlags(days.map((d) => ({ day: d.day, medians: Object.fromEntries(PLAYABLE_HEROES.map((h) => [h, par(d, h).dps])) })), PLAYABLE_HEROES, o.flag);
  const worst = [...days].sort((a, b) => b.ratio - a.ratio)[0];
  const refFlags = days.filter((d) => gapFlagged(d.refRatio, o.flag));
  const refHiLo = gapFlags(days.map((d) => ({ day: d.day, medians: Object.fromEntries(HARNESS_HEROES.map((h) => [h, ref(d, h).dps])) })), HARNESS_HEROES, o.flag);
  const rows: (Row & { digits?: number })[] = [{
    id: "output-gap",
    target: `< ${o.flag.toFixed(1)}x per day (flag at ${o.flag.toFixed(1)}x or more)`,
    measured: rangeOf(days.map((d) => d.ratio)),
    unit: "x (per day: highest / lowest median DPS, FURNACE vs WEAVER par fields)",
    verdict: days.length === 0 ? "N/A" : flagged.length ? "MISS" : "PASS",
    digits: 2,
    notes: [
      flagged.length ? `Flagged days: ${flagged.map((d) => `d${d.day} x${f2(d.ratio)}`).join(", ")}.` : `No playable hero-day flagged; the widest gap is d${worst?.day} x${f2(worst?.ratio ?? NaN)} (${H(hiLo.find((x) => x.day === worst?.day)?.hi ?? "-")} over ${H(hiLo.find((x) => x.day === worst?.day)?.lo ?? "-")}). With the par decks resampled, the widest gap inside any day's 95% interval is x${f2(Math.max(...days.map((d) => widestGap(d.ratioCI))))}.`,
      `Median DPS per day: ${PLAYABLE_HEROES.map((h) => `${H(h)} ${days.map((d) => f2(par(d, h).dps)).join(" ")}`).join("; ")}.`,
      `Hull-aware (share of the opponent's hull removed per second): ratio ${fmt(rangeOf(days.map((d) => d.shareRatio))?.min ?? NaN)} to ${fmt(rangeOf(days.map((d) => d.shareRatio))?.max ?? NaN)}.`,
      `Race heroes, information only (not playable): the six heroes' reference decks (heroRefBuild) against each other read x${fmt(rangeOf(days.map((d) => d.refRatio))?.min ?? NaN)} to x${fmt(rangeOf(days.map((d) => d.refRatio))?.max ?? NaN)}; ${refFlags.length ? `x${o.flag.toFixed(1)} or more on ${refFlags.map((d) => { const x = refHiLo.find((y) => y.day === d.day); return `d${d.day} x${f2(d.refRatio)} (${H(x?.hi ?? "-")} over ${H(x?.lo ?? "-")})`; }).join(", ")}` : `no day reaches x${o.flag.toFixed(1)}`}. The four race heroes alone: x${fmt(rangeOf(days.map((d) => d.raceRatio))?.min ?? NaN)} to x${fmt(rangeOf(days.map((d) => d.raceRatio))?.max ?? NaN)}${days.some((d) => gapFlagged(d.raceRatio, o.flag)) ? ` (x${o.flag.toFixed(1)} or more on ${days.filter((d) => gapFlagged(d.raceRatio, o.flag)).map((d) => `d${d.day} x${f2(d.raceRatio)}`).join(", ")})` : ""}.`,
      `K ${o.k} par decks per hero x ${o.seeds} seeds, reference decks x ${o.refSeeds} seeds, both sides, against the stand-ins standInFoe serves (run seeds 1-${o.standinSeeds}), served-weighted.`,
    ],
    detail: days,
  }];
  const sections: Section[] = [
    {
      title: "Median DPS per playable hero and day (the flag), with the hull-aware view",
      lines: [
        "DPS = Battle.sides[s].stats.damage / Battle.t for the hero's side s, per battle; the served-weighted median over the hero's battles that day. Hull share = min(damage, opponent hull.max) / opponent hull.max / t.",
        "",
        `${PLAYABLE_HEROES.map(H).join(" / ")}: the signed ratio, with a 95% interval from each hero's ${o.k} par decks resampled with replacement ${o.boot} times; "widest in CI" = the largest max / min gap inside that interval. IQR: the battles' served-weighted quartiles.`,
        "",
        ...mdTable(["day", ...PLAYABLE_HEROES.map((h) => `${H(h)} median DPS [IQR]`), "ratio (max / min)", "flag", `${PLAYABLE_HEROES.map(H).join(" / ")} [95% CI]`, "widest in CI", ...PLAYABLE_HEROES.map((h) => `${H(h)} hull share /s`), "hull-aware ratio", ...PLAYABLE_HEROES.map((h) => `${H(h)} own hull`), "opponents"],
          days.map((d) => [d.day, ...PLAYABLE_HEROES.map((h) => `${f2(par(d, h).dps)} [${f2(par(d, h).dpsP25)}-${f2(par(d, h).dpsP75)}]`), f2(d.ratio), d.flagged ? "FLAG" : "-",
            `${f2(par(d, PLAYABLE_HEROES[0]).dps / par(d, PLAYABLE_HEROES[1]).dps)} [${f2(d.ratioCI[0])}-${f2(d.ratioCI[1])}]`, f2(widestGap(d.ratioCI)),
            ...PLAYABLE_HEROES.map((h) => pcs(par(d, h).share)), f2(d.shareRatio), ...PLAYABLE_HEROES.map((h) => fmt(par(d, h).hull, 0)), d.opponents])),
      ],
    },
    {
      title: "Each side of the exchange (par fields; served-weighted medians)",
      lines: mdTable(["day", "hero", "decks", "battles", "DPS dealt", "DPS taken", "own hull", "opponent hull share removed /s", "own hull share lost /s", "exchange (removed / lost)", "win rate"],
        days.flatMap((d) => PLAYABLE_HEROES.map((h) => {
          const c = par(d, h);
          return [d.day, H(h), c.decks, c.battles, f2(c.dps), f2(c.taken), fmt(c.hull, 0), pcs(c.share), pcs(c.takenShare), f2(c.share / c.takenShare), fmt(c.win)];
        }))),
    },
    {
      title: "Reference decks (heroRefBuild): the race heroes, information only (not playable yet)",
      lines: [
        "One reference deck per hero and day (the four race heroes' raceRefBuild; FURNACE and WEAVER's warlord deck with its plating ramp, for a like-for-like reading: a reference deck is not a par deck, and the par fields above run stronger late). Same opponents, weights and DPS rule.",
        "",
        ...mdTable(["day", ...HARNESS_HEROES.map((h) => `${H(h)} DPS`), "ratio, six reference decks", "highest / lowest", "would flag (info)", "ratio, four race heroes", ...race.map((h) => `${H(h)} hull share /s`), "hull-aware ratio, six"],
          days.map((d) => {
            const x = refHiLo.find((y) => y.day === d.day);
            return [d.day, ...HARNESS_HEROES.map((h) => f2(ref(d, h).dps)), f2(d.refRatio), `${H(x?.hi ?? "-")} / ${H(x?.lo ?? "-")}`, gapFlagged(d.refRatio, o.flag) ? "yes" : "-", `${f2(d.raceRatio)}${gapFlagged(d.raceRatio, o.flag) ? " (2x+)" : ""}`, ...race.map((h) => pcs(ref(d, h).share)), f2(d.refShareRatio)];
          })),
        "",
        days.length ? `${PLAYABLE_HEROES.map(H).join("'s and ")}'s reference decks run below their par fields (d${days[days.length - 1].day}: ${PLAYABLE_HEROES.map((h) => f2(ref(days[days.length - 1], h).dps)).join(" and ")} against par ${PLAYABLE_HEROES.map((h) => f2(par(days[days.length - 1], h).dps)).join(" and ")}), so these gaps read the reference decks as much as the heroes; a race hero gets its own par field once it is playable.` : "",
      ],
    },
    {
      title: "Opponents per day (standInFoe's served decks)",
      lines: mdTable(["day", "decks", "captains", "battles", "runtime (s)"], days.map((d) => [d.day, d.opponents, d.captains.join(", "), d.battles, fmt(d.seconds, 0)])),
    },
  ];
  return { rows, sections, meta: { k: o.k, seeds: o.seeds, refSeeds: o.refSeeds, standinSeeds: o.standinSeeds, days: o.days, flag: o.flag, boot: o.boot } };
}
