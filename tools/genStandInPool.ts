// Stand-in pool CLI: npm run standins -- [--seed 1] [--pop 64] [--band 40,60] [--per 6] [--par-floor 50]
//   [--par field|heroref] [--source caravan|fullpurse] [--par-band lo,hi] [--workers N] [--out ../output]
//   [--check [--against file] | --versus] [--dump pop.json] [--resume dir]
// FB-C: --par field (the default) measures the par floor against the par player's field (par.ts parRefs); --par heroref
// is the legacy par deck, which pool v2.1 was generated with: its replay identity is `--check --par heroref`.
// Step 5 (REQ-BFG-033): --source caravan (the default) draws the population and the gauntlet from par-player runs
// through the game's caravan (src/sim/harness/caravan.ts); --source fullpurse is standInCandidate, the source of every
// pool up to v2.1: its replay identity is now `--check --par heroref --source fullpurse`. The source is written into
// the header (except for the legacy full-purse + heroref pool, whose header predates both flags). --par-band lo,hi (off
// by default; fractions, e.g. 0.5,0.6) also requires lo <= vsPar <= hi of a pick. --against <file>: --check compares
// with that file instead of src/sim/standInPoolData.ts (a dry candidate). --resume <dir>: every finished day is saved
// in <dir> and a later run with the same options and the same tool build loads it instead of playing it again, so a
// run cut off by a time limit continues where it stopped (a --check that must prove determinism takes a fresh dir).
// Writes src/sim/standInPoolData.ts (the bundled pool the game copies with src/sim/standInPool.ts)
// and <out>/standin-pool.md. --check regenerates in memory, compares with the committed data
// module and exits 1 if they differ (nothing is written). --dump also writes every population
// build (idx, cost, pct, score, win rate vs each reference) as JSON, for audits; it works with
// --check. --versus writes nothing: it plays the bundled pool (the data module this build was
// bundled from) against itself, every pick of the first pool hero against every pick of the
// second, and prints the first hero's win rate per day (the report's pool-vs-pool measure).
// Battles fan out to worker threads; results are keyed by job, so the pool is identical
// for any --workers value.
// 0.6.1 flip (FUSE_LIVE = true): the shipped pool is the stars-on, merge-aware pool v2. --stars on (the
// default) writes src/sim/standInPoolData.ts, and --check compares a regeneration with it. --stars off
// (the v1 harness, which never merges: it matched v1.1 byte for byte at c432bee, and later sim changes
// move its scores) never writes into src: it writes <out>/standInPoolData.stars-off.ts for audits, and
// --check refuses it. Before the flip (FUSE_LIVE
// false) stars on was a dry run into <out> and stars off wrote the shipped v1.1 pool.
// Harness v2 part 3 on the 0.6.1 release: --factories on|off defaults to the --stars value (--factories on
// needs --stars on). Pool v2 (the flip) was generated before --factories existed, that is with factories
// off. Since pool v2.1 (0.6.2, the D4 native re-bake) the shipped pool is factory-aware: a plain --check
// (factories on) prints IDENTICAL and `--check --factories off` DIFFERS. --dry (stars on; not with --check): the stars-on dry run on the live
// code: it writes <out>/standInPoolData.v2-dry-candidate.ts, standin-pool.md and versus.json and never src;
// its versus tables play the new picks against the pool this tool was bundled with (the shipped pool).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { isMainThread } from "node:worker_threads";
import { HEROES, ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { FUSE_LIVE, validateBuild, buildCost, maxGoldByDay, unfusedPairs } from "../src/net/validate";
import { starsOf } from "../src/sim/stars";
import { describeBuild } from "../src/sim/harness/report";
import { starMixOf, type Runner } from "../src/sim/harness/tournament";
import { pct } from "../src/sim/harness/stats";
import {
  STANDIN_DEFAULTS, STANDIN_MAX_STARS, dataModuleText, dryVersus, eligibleOf, genStandIns, maxStarsOf, poolVsPool, sourceOf, standInCommand, writtenProblems,
  type Cand, type DayResult, type GenHooks, type HeroDay, type StandInOpts, type VersusRow, type VersusTable,
} from "../src/sim/harness/standins";
import { CARAVAN_MIX, deckStats, type CaravanPolicy } from "../src/sim/harness/caravan";
import { STAND_IN_POOL_RULES, standInPool } from "../src/sim/standInPool";
import { flag, num, serveJobs, workerRunner } from "./workers";

const DATA = "src/sim/standInPoolData.ts";

if (!isMainThread) serveJobs();
else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const band = (flag("band") ?? STANDIN_DEFAULTS.band.join(",")).split(",").map(Number);
  if (band.length !== 2 || band.some((x) => !Number.isFinite(x) || x < 0 || x > 100) || band[0] >= band[1]) throw new Error("--band must be lo,hi percentiles, e.g. 40,60");
  const pf = Number(flag("par-floor") ?? STANDIN_DEFAULTS.parFloor * 100);
  if (!Number.isFinite(pf) || pf < 0 || pf > 100) throw new Error("--par-floor must be a win-rate percentage, e.g. 50");
  const starsFlag = flag("stars") ?? "on";
  if (starsFlag !== "on" && starsFlag !== "off") throw new Error(`--stars must be "on" or "off", got ${starsFlag}`);
  // 0.6.1b (harness v2 part 2): --cores defaults to the --stars value; cores need stars on
  const coresFlag = flag("cores") ?? starsFlag;
  if (coresFlag !== "on" && coresFlag !== "off") throw new Error(`--cores must be "on" or "off", got ${coresFlag}`);
  if (coresFlag === "on" && starsFlag === "off") throw new Error("--cores on needs --stars on (stars off is harness v1 exactly: no cores)");
  // 0.6.1c (harness v2 part 3): --factories defaults to the --stars value; the six wave-1 factories need stars on
  const factoriesFlag = flag("factories") ?? starsFlag;
  if (factoriesFlag !== "on" && factoriesFlag !== "off") throw new Error(`--factories must be "on" or "off", got ${factoriesFlag}`);
  if (factoriesFlag === "on" && starsFlag === "off") throw new Error("--factories on needs --stars on (stars off is harness v1 exactly: the STAMP PRESS alone)");
  // FB-C (REQ-BFG-026): --par field (default: the par player's field, src/sim/harness/par.ts parRefs) or heroref (the
  // legacy heroRefBuild par; pool v2.1 was generated with it, so `--check --par heroref` replays the committed pool)
  const parFlag = flag("par") ?? "field";
  if (parFlag !== "field" && parFlag !== "heroref") throw new Error(`--par must be "field" or "heroref", got ${parFlag}`);
  // step 5 (REQ-BFG-033): --source caravan (default: par-player runs through the game's caravan) or fullpurse (the
  // pools up to v2.1). The caravan player merges, buys cores and factories: stars, cores and factories stay on.
  const sourceFlag = flag("source") ?? "caravan";
  if (sourceFlag !== "caravan" && sourceFlag !== "fullpurse") throw new Error(`--source must be "caravan" or "fullpurse", got ${sourceFlag}`);
  if (sourceFlag === "caravan" && (starsFlag !== "on" || coresFlag !== "on" || factoriesFlag !== "on")) {
    throw new Error("--source caravan plays the par player, which merges its copies and buys cores and factories: it takes --stars, --cores and --factories on (their defaults); use --source fullpurse to switch them off");
  }
  // step 5 (REQ-BFG-026): --par-band lo,hi (fractions, off by default): a pick also needs lo <= vsPar <= hi
  const bandArg = flag("par-band");
  const parBand = bandArg === undefined ? undefined : bandArg.split(",").map(Number);
  if (parBand && (parBand.length !== 2 || parBand.some((x) => !Number.isFinite(x) || x < 0 || x > 1) || parBand[0] >= parBand[1])) {
    throw new Error("--par-band must be lo,hi win-rate fractions with lo < hi, e.g. 0.5,0.6");
  }
  // RUNES-2a (REQ-BFG-058): --bot-runes on|off, the par player's dawn runes; absent: runes.ts BOT_RUNES (off)
  const botRunesFlag = flag("bot-runes");
  if (botRunesFlag !== undefined && botRunesFlag !== "on" && botRunesFlag !== "off") throw new Error(`--bot-runes must be "on" or "off", got ${botRunesFlag}`);
  const o: StandInOpts = {
    ...STANDIN_DEFAULTS,
    par: parFlag,
    source: sourceFlag,
    ...(parBand ? { parBand: [parBand[0], parBand[1]] as [number, number] } : {}),
    ...(botRunesFlag !== undefined ? { botRunes: botRunesFlag === "on" } : {}),
    seed: num("seed", STANDIN_DEFAULTS.seed),
    pop: num("pop", STANDIN_DEFAULTS.pop),
    per: num("per", STANDIN_DEFAULTS.per),
    gauntlet: num("gauntlet", STANDIN_DEFAULTS.gauntlet),
    band: [band[0], band[1]],
    parFloor: pf / 100,
    stars: starsFlag,
    cores: coresFlag,
    factories: factoriesFlag,
  };
  if (o.per < 1 || o.pop < o.per) throw new Error("--pop must be at least --per, and --per at least 1");
  // step 5: --check compares with --against <file> when given (a dry candidate), else with the committed module
  const against = flag("against");
  const checkPath = resolve(against ?? DATA), checkName = against ? checkPath : `committed ${DATA}`;
  const check = process.argv.includes("--check");
  if (check && FUSE_LIVE && o.stars === "off") throw new Error(`--stars off --check: since the 0.6.1 flip (FUSE_LIVE) the committed ${DATA} is the stars-on pool v2; check it with --stars on`);
  // part 3 on the release: --dry keeps a stars-on dry run (written under --out, never src) with FUSE_LIVE true
  const dry = process.argv.includes("--dry");
  if (dry && (check || o.stars === "off")) throw new Error("--dry is a stars-on run that writes under --out only: it takes neither --check nor --stars off");
  const nw = num("workers", Math.max(1, Math.min(availableParallelism() - 1, 23)));
  const pool = workerRunner(nw, import.meta.url);
  const t0 = performance.now();
  if (process.argv.includes("--versus")) {
    const pvp = await poolVsPool(o, (h, d) => standInPool(h, d).map((e) => e.build), pool.run);
    await pool.close();
    console.log(`versus: the bundled pool (rules ${STAND_IN_POOL_RULES}), every ${H(o.heroes[0])} pick vs every ${H(o.heroes[1])} pick, ${o.seeds} seeds x both sides, ${((performance.now() - t0) / 1000).toFixed(1)} s on ${nw} worker(s)`);
    for (const r of pvp) console.log(`versus: day ${r.day}: ${H(o.heroes[0])} pool wins ${pct(r.rate)} of ${r.battles}`);
    return;
  }
  // step 5: the wall time spent waiting on battles (the rest is building decks, selecting and reporting)
  let battleMs = 0, played = 0;
  const timed: Runner = async (field, jobs) => {
    const t = performance.now();
    const out = await pool.run(field, jobs);
    battleMs += performance.now() - t;
    played += jobs.reduce((s, j) => s + 2 * j.seeds.length, 0);
    return out;
  };
  const stamp = () => `[${((performance.now() - t0) / 1000).toFixed(0)} s]`;
  const res = await genStandIns(o, timed, (m) => console.log(`${stamp()} ${m}`), resumeHooks(o, flag("resume")));
  const genSecs = (performance.now() - t0) / 1000;
  console.log(`time: ${genSecs.toFixed(1)} s to generate on ${nw} worker(s): ${(battleMs / 1000).toFixed(1)} s waiting on ${played} battles played here (${(played / Math.max(1e-9, battleMs / 1000)).toFixed(0)} per s; the pool's ${res.battles} include any loaded days'), ${(genSecs - battleMs / 1000).toFixed(1)} s building decks and selecting`);
  // 0.6.1a: while FUSE_LIVE was false validateBuild alone did not reject an unfused pair, so the
  // generator applies the rule itself (stars on). Since the flip validateBuild applies it too, and
  // stars off (the v1.1 audit reproduction) ignores exactly those pair errors.
  for (const hd of res.days) {
    for (const p of hd.picks) {
      const v = validateBuild(p.build, hd.day);
      const pairErr = new Set(unfusedPairs(p.build).map((m) => `item: ${m}`));
      const errors = o.stars === "off" ? v.errors.filter((e) => !pairErr.has(e)) : v.errors;
      // The unfused-pair invariant is the stars-on flip rule (step 3); it must not apply when
      // --stars off, which reproduces the legacy v1.1 pool byte-for-byte - 65 of its 120 decks
      // hold same-star pairs that were never merge-aware in the first place (that is the whole
      // reason this pool needs regenerating once stars are on).
      const unfused = o.stars === "on" ? unfusedPairs(p.build) : [];
      if (errors.length || p.build.hero !== hd.hero || unfused.length) {
        throw new Error(`stand-in ${hd.hero} d${hd.day} #${p.idx} is invalid: ${[...new Set([...errors, ...unfused.map((m) => `item: ${m}`)])].join("; ")}`);
      }
      // fix pass: deck + cargo (cargoGold is set only with cores on, so stars off and cores off are unchanged)
      if (buildCost(p.build).total + (p.cargoGold ?? 0) > maxGoldByDay(hd.day)) throw new Error(`stand-in ${hd.hero} d${hd.day} #${p.idx} costs more than maxGoldByDay${p.cargoGold ? ` (deck + cargo ${p.cargoGold} g)` : ""}`);
      // F8 (D4): stars on, a stand-in holds no module above STANDIN_MAX_STARS (2)
      if (o.stars === "on" && maxStarsOf(p.build) > STANDIN_MAX_STARS) throw new Error(`stand-in ${hd.hero} d${hd.day} #${p.idx} holds a ${maxStarsOf(p.build)}-star module; stand-ins stop at ${STANDIN_MAX_STARS} stars`);
    }
  }
  // F2 (patch 0006's guard, kept on): check what is WRITTEN, not only what was scored. Every stored
  // code of the candidate module is decoded again (star-aware) and must be exactly the scored deck.
  const candidate = o.stars === "on" ? dataModuleText(o, res.days) : "";
  if (o.stars === "on") {
    const problems = writtenProblems(o, res.days, candidate);
    if (problems.length) throw new Error(`the stand-in pool v2 candidate is not what was scored:\n${problems.join("\n")}`);
    console.log(`written-module guard: all ${res.days.reduce((s, hd) => s + hd.picks.length, 0)} stored codes decode to exactly the scored decks`);
  }
  const dump = flag("dump");
  if (dump) {
    // step 5: a caravan population adds each candidate's policy, run seed, gold spent, reroll gold, sale losses, unspent
    // gold and vsPar (the floor measure after any robust re-play)
    const caravan = sourceOf(o) === "caravan";
    const rows = res.days.map((hd) => ({
      hero: hd.hero, day: hd.day, relax: hd.relax, window: hd.window, par: hd.par, picks: hd.picks.map((p) => p.idx),
      pop: hd.pop.map((c) => [c.idx, c.cost, c.floorMet ? 1 : 0, c.pct, c.score, ...o.heroes.map((h) => c.vsRef[h] ?? 0),
        ...(caravan ? [c.caravan?.policy ?? "", c.caravan?.seed ?? 0, c.caravan?.spent ?? 0, c.caravan?.rerollGold ?? 0, c.caravan?.soldLoss ?? 0, c.caravan?.unspent ?? 0, c.vsPar] : [])]),
    }));
    const extra = caravan ? ["policy", "seed", "spent", "rerollGold", "soldLoss", "unspent", "vsPar"] : [];
    writeFileSync(resolve(dump), JSON.stringify({ columns: ["idx", "cost", "floorMet", "pct", "score", ...o.heroes.map((h) => `vs ${h} ref`), ...extra], days: rows }));
    console.log(`dump: every population build of every hero and day written to ${resolve(dump)}`);
  }

  if (o.stars === "off") {
    // The v1 harness pool (v1.1 byte for byte at c432bee; later sim changes move its scores). It was the
    // shipped pool until the 0.6.1 flip; since then (FUSE_LIVE) it is written under --out, never into src.
    const text = dataModuleText(o, res.days);
    const path = FUSE_LIVE ? resolve(flag("out") ?? "../output", "standInPoolData.stars-off.ts") : resolve(DATA);
    if (check) {
      await pool.close();
      const secs = (performance.now() - t0) / 1000;
      let old = "";
      try { old = readFileSync(path, "utf8"); } catch { old = ""; }
      const same = old === text;
      console.log(`check: ${same ? "IDENTICAL" : "DIFFERS"}: regenerated ${text.length} bytes in memory (${res.battles} battles, ${secs.toFixed(1)} s, ${nw} workers) vs committed ${DATA} (${old.length} bytes)`);
      process.exit(same ? 0 : 1);
    }
    const secs = (performance.now() - t0) / 1000;
    const pvp = await poolVsPool(o, (h, d) => res.days.find((x) => x.hero === h && x.day === d)!.picks.map((p) => p.build), pool.run);
    await pool.close();
    const out = resolve(flag("out") ?? "../output");
    mkdirSync(out, { recursive: true });
    writeFileSync(path, text);
    writeFileSync(resolve(out, "standin-pool.md"), poolMarkdown(o, res.days, pvp, { battles: res.battles, secs, workers: nw, bytes: text.length }));
    console.log(`${res.battles} battles in ${secs.toFixed(1)} s on ${nw} worker(s); wrote ${FUSE_LIVE ? path : DATA} (${text.length} bytes) and ${out}/standin-pool.md`);
    return;
  }

  if (FUSE_LIVE && !dry) {
    // 0.6.1 flip: the stars-on pool v2 IS the shipped pool: --check compares, otherwise it is written.
    // The versus tables play the new picks against the pool this tool was bundled with (the committed
    // module before this run: v1.1 at the flip itself).
    const path = resolve(DATA);
    if (check) {
      await pool.close();
      const secs = (performance.now() - t0) / 1000;
      let old = "";
      try { old = readFileSync(checkPath, "utf8"); } catch { old = ""; }
      const same = old === candidate;
      console.log(`check: ${same ? "IDENTICAL" : "DIFFERS"}: regenerated ${candidate.length} bytes in memory (${res.battles} battles, ${secs.toFixed(1)} s, ${nw} workers) vs ${checkName} (${old.length} bytes)`);
      process.exit(same ? 0 : 1);
    }
    const secs0 = (performance.now() - t0) / 1000;
    const vs = await dryVersus(o, res.days, pool.run);
    await pool.close();
    const secs = (performance.now() - t0) / 1000;
    writeFileSync(path, candidate);
    const out = resolve(flag("out") ?? "../output");
    mkdirSync(out, { recursive: true });
    writePicks(o, res.days, out);
    const vsBattles = [...vs.v2v2, ...vs.tables.flatMap((t) => t.rows)].reduce((s, r) => s + r.battles, 0);
    writeFileSync(resolve(out, "standin-pool.md"), poolMarkdownV2(o, res.days, vs.v2v2, vs.tables, { battles: res.battles, secs, workers: nw, vsBattles, live: true, bytes: candidate.length }));
    writeFileSync(resolve(out, "versus.json"), JSON.stringify({ heroes: o.heroes, v2v2: vs.v2v2, tables: vs.tables }, null, 1) + "\n");
    console.log(`${res.battles} battles in ${secs.toFixed(1)} s on ${nw} worker(s) (${secs0.toFixed(1)} s to generate); wrote ${DATA} (${candidate.length} bytes, rules ${RULES_VERSION}) and ${out}/standin-pool.md`);
    return;
  }

  // 0.6.1a harness v2, stars on: a DRY run only. Never touches src/sim/standInPool.ts or
  // standInPoolData.ts (the shipped pool stays v1.1 until the flip); everything lands under
  // output-h2/pool-v2-dry/ (a data-module *candidate*, not wired up, and a star-aware report).
  // Since the flip only --dry gets here (FUSE_LIVE): the same run, against the shipped pool v2.
  const secs0 = (performance.now() - t0) / 1000;
  // F3: the dry v2 picks against the shipped v1.1 picks (two getters; was v1.1 on both sides)
  const vs = await dryVersus(o, res.days, pool.run);
  await pool.close();
  const secs = (performance.now() - t0) / 1000;
  const out = resolve(flag("out") ?? "../output-h2/pool-v2-dry");
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "standInPoolData.v2-dry-candidate.ts"), candidate);
  writePicks(o, res.days, out);
  const vsBattles = [...vs.v2v2, ...vs.tables.flatMap((t) => t.rows)].reduce((s, r) => s + r.battles, 0);
  writeFileSync(resolve(out, "standin-pool.md"), poolMarkdownV2(o, res.days, vs.v2v2, vs.tables, { battles: res.battles, secs, workers: nw, vsBattles, live: false, liveDry: FUSE_LIVE }));
  writeFileSync(resolve(out, "versus.json"), JSON.stringify({ heroes: o.heroes, v2v2: vs.v2v2, tables: vs.tables }, null, 1) + "\n");
  console.log(`${res.battles} battles in ${secs.toFixed(1)} s on ${nw} worker(s) (${secs0.toFixed(1)} s to generate); DRY RUN, wrote ${out}/standInPoolData.v2-dry-candidate.ts and standin-pool.md (src/sim/standInPoolData.ts untouched)`);
}

const H = (h: HeroId) => HEROES[h].name;
const STEP: Record<HeroDay["relax"], string> = { none: "none", widen: "(a) widen", grow: "(b) grow", elites: "(c) elites", best: "(d) best vsPar" };

/** cyrb53: a fast 53-bit string hash (not cryptographic), as a hex string. */
function hash53(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/**
 * Step 5 (--resume <dir>): save each finished day as <dir>/day-<d>.json and load it on a later run. The key is the
 * generation options and a hash of this tool's own bundle (so any code change, player.ts or par.ts included, plays the
 * day again); a file with another key, or one cut short (it doesn't parse), is ignored and overwritten.
 */
function resumeHooks(o: StandInOpts, dir: string | undefined): GenHooks | undefined {
  if (!dir) return undefined;
  const at = resolve(dir);
  mkdirSync(at, { recursive: true });
  const bundle = readFileSync(decodeURIComponent(new URL(import.meta.url).pathname), "utf8");
  const tool = `${hash53(bundle)}${hash53(bundle, 1)}`;
  const key = `${hash53(JSON.stringify({ o, rules: RULES_VERSION, tool }))}${hash53(JSON.stringify({ o, rules: RULES_VERSION, tool }), 1)}`;
  const file = (day: number) => resolve(at, `day-${day}.json`);
  console.log(`resume: days are saved in ${at} (key ${key.slice(0, 12)}, tool ${tool.slice(0, 12)})`);
  return {
    load: (day) => {
      if (!existsSync(file(day))) return undefined;
      try {
        const saved = JSON.parse(readFileSync(file(day), "utf8")) as { key: string; day: number } & DayResult;
        return saved.key === key && saved.day === day ? { days: saved.days, battles: saved.battles } : undefined;
      } catch {
        return undefined;
      }
    },
    save: (day, r) => writeFileSync(file(day), JSON.stringify({ key, day, battles: r.battles, days: r.days })),
  };
}

/** Step 5: <out>/picks.json for a caravan pool: every pick with its run (policy, seed), gold, vsPar and deck counts. */
function writePicks(o: StandInOpts, days: HeroDay[], out: string): void {
  if (sourceOf(o) !== "caravan") return;
  const rows = days.flatMap((hd) => hd.picks.map((p, i) => ({
    hero: hd.hero, day: hd.day, i, par: i === hd.par, idx: p.idx, relax: hd.relax, budget: hd.budget, cost: p.cost, pct: p.pct, score: p.score,
    vsPar: p.vsPar, vsRef: p.vsRef, replayed: !!p.replayed, ...p.caravan, ...deckStats(p.build), code: p.code,
  })));
  writeFileSync(resolve(out, "picks.json"), JSON.stringify({ command: standInCommand(o), rules: RULES_VERSION, picks: rows }, null, 1) + "\n");
}

/** Step 5: the caravan picks of one hero-day, for the report: policy counts, spend, rerolls, stars, turrets, joins. */
function caravanRow(hd: HeroDay): string {
  const n = (pol: CaravanPolicy) => hd.picks.filter((p) => p.caravan?.policy === pol).length;
  const pctOf = (x: number) => `${Math.round((100 * x) / hd.budget)}`;
  const span = (xs: number[]) => (xs.length ? `${Math.min(...xs)}-${Math.max(...xs)}` : "-");
  const st = hd.picks.map((p) => deckStats(p.build));
  const sum = (f: (s: ReturnType<typeof deckStats>) => number) => st.reduce((a, s) => a + f(s), 0);
  return `| ${H(hd.hero)} | ${hd.day} | ${STEP[hd.relax]} | ${[...new Set(CARAVAN_MIX)].map((pol) => n(pol)).join("/")} | ${span(hd.picks.map((p) => Number(pctOf(p.cost))))}% | ${span(hd.picks.map((p) => Number(pctOf(p.caravan?.spent ?? p.cost))))}% | ${span(hd.picks.map((p) => p.caravan?.rerollGold ?? 0))} | ${sum((s) => s.star2)}/${sum((s) => s.star3)} | ${sum((s) => s.mergedStart)} | ${sum((s) => s.beyondStart)} | ${sum((s) => s.joins)} |`;
}

function poolMarkdown(o: StandInOpts, days: HeroDay[], pvp: { day: number; rate: number; battles: number }[], run: { battles: number; secs: number; workers: number; bytes: number }): string {
  const w = o.band[1] - o.band[0], refs = o.heroes.map((h) => `vs ${H(h)} ref`);
  const L = [
    "# BeltBattles stand-in pool v1.1 (full purse, par floor)",
    "",
    `Generated by \`${standInCommand(o)}\` (rules ${RULES_VERSION}): ${run.battles} battles in ${run.secs.toFixed(1)} s on ${run.workers} worker thread(s).`,
    `Data module \`${DATA}\`: ${run.bytes} bytes (${(run.bytes / 1024).toFixed(1)} KB); loader \`src/sim/standInPool.ts\`.`,
    "",
    `- Population: ${o.pop} legal builds per hero and day (grown to ${o.grow.join(" or ")} where a day needed it), each costing at least ceil(0.9 x maxGoldByDay(day)).`,
    `- Score: win rate against a fixed gauntlet of that day's full-purse builds, ${o.gauntlet} per hero (${o.heroes.map(H).join(" and ")}), from another seed; ${o.seeds} seeds x both sides per pairing (${o.gauntlet * o.heroes.length * o.seeds * 2} battles per build). pct: strength percentile inside the day's final population (share scoring lower, ties half).`,
    `- ${o.heroes.map((h) => `vs ${H(h)} ref`).join(" / ")}: win rate against heroRefBuild(hero, day), the game's par deck of that faction, ${o.refSeeds} seeds x both sides (${o.refSeeds * 2} battles each). vsPar = floor(b) = the lower of the two.`,
    `- Eligible: pct >= ${o.band[0]}, vsPar >= ${pct(o.parFloor)}, spend floor met, and not among the population's top eighth (the elites: 8 of 64, 16 of 128, 32 of 256).`,
    `- Window: ${w} points from p0, the lowest eligible pct, or from ${o.band[0]} when no build lies between ${o.band[0]} and p0 (so a band that already clears the floor keeps its picks). Picks: ${o.per} eligible builds nearest to evenly spaced targets across it; par = the pick nearest the window's middle (**bold**).`,
    `- Too few eligible in the window: (a) widen it upward ${o.widen} points at a time; (b) grow the population to ${o.grow.join(", then ")} (same gauntlet, deterministic); (c) allow elites; (d) the ${o.per} builds with the highest vsPar, listed in STAND_IN_DATA.short.`,
    `- Par vs elites: against that day's top ${o.elites} builds of each pool hero's base population of ${o.pop} (the v1 elites), ${o.seeds} seeds x both sides.`,
    "",
    "## Summary",
    "",
    `| hero | day | relaxation | window | pop | eligible | picks: cost | picks: pct | picks: vsPar | par pct | par ${refs.join(" / ")} | par vs elites |`,
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const hd of days) {
    const costs = hd.picks.map((p) => p.cost), pcts = hd.picks.map((p) => p.pct), vp = hd.picks.map((p) => p.vsPar);
    const elig = eligibleOf(hd.pop, o, hd.relax === "elites" || hd.relax === "best").length;
    L.push(`| ${H(hd.hero)} | ${hd.day} | ${STEP[hd.relax]} | ${hd.window[0]}-${hd.window[1]} | ${hd.pop.length} | ${elig} | ${Math.min(...costs)}-${Math.max(...costs)} | ${Math.min(...pcts)}-${Math.max(...pcts)} | ${pct(Math.min(...vp))}-${pct(Math.max(...vp))} | ${hd.picks[hd.par].pct} | ${o.heroes.map((h) => pct(hd.parVsRef[h] ?? 0)).join(" / ")} | ${pct(hd.parVsElites)} |`);
  }
  L.push("", `## ${H(o.heroes[0])} pool vs ${H(o.heroes[1])} pool (report only)`, "", `Every ${H(o.heroes[0])} pick against every ${H(o.heroes[1])} pick, ${o.seeds} seeds x both sides.`, "");
  L.push(`| day | ${pvp.map((r) => r.day).join(" | ")} |`, `|---|${pvp.map(() => "---").join("|")}|`, `| ${H(o.heroes[0])} pool win rate | ${pvp.map((r) => `${pct(r.rate)}`).join(" | ")} |`, `| battles | ${pvp.map((r) => r.battles).join(" | ")} |`);
  const spend = days.filter((hd) => hd.short), best = days.filter((hd) => hd.relax === "best");
  L.push("", "## Exceptions", "");
  L.push(spend.length ? spend.map((hd) => `- ${H(hd.hero)} day ${hd.day}: picks under the spend floor ${hd.floor}: ${hd.picks.filter((p) => p.cost < hd.floor).map((p) => p.cost).join(", ")} g`).join("\n") : "- Spend floor: none. Every pick of every hero and day costs at least ceil(0.9 x maxGoldByDay).");
  L.push(best.length ? best.map((hd) => `- ${H(hd.hero)} day ${hd.day}: fewer than ${o.per} builds reach vsPar ${pct(o.parFloor)}; the best ${o.per} by vsPar: ${hd.picks.map((p) => pct(p.vsPar)).join(", ")} (listed in STAND_IN_DATA.short).`).join("\n") : `- Par floor: none. Every pick of every hero and day wins at least ${pct(o.parFloor)} against both par decks.`);
  for (const hd of days) {
    L.push("", `## ${H(hd.hero)} day ${hd.day} (floor ${hd.floor} of ${hd.budget} g; ${STEP[hd.relax]}, window ${hd.window[0]}-${hd.window[1]} of ${hd.pop.length})`, "");
    L.push(`| # | cost | pct | score | ${refs.join(" | ")} | deck |`, `|---|---|---|---|${refs.map(() => "---").join("|")}|---|`);
    hd.picks.forEach((p, i) => {
      const b = (s: string | number) => (i === hd.par ? `**${s}**` : `${s}`);
      L.push(`| ${b(i === hd.par ? `${i} par` : i)} | ${b(p.cost)} | ${b(p.pct)} | ${b(pct(p.score))} | ${o.heroes.map((h) => b(pct(p.vsRef[h] ?? 0))).join(" | ")} | ${describeBuild(p.build, hd.day)} |`);
    });
    L.push("", `Par: ${pct(hd.parVsElites)} vs the day's elites. Top elite: ${pct(hd.elites[0].score)} (${hd.elites[0].cost} g).`);
  }
  return L.join("\n") + "\n";
}

/** deck description with the star of each fusible copy shown (describeBuild groups by name only,
 *  so a 2-star copy would otherwise be indistinguishable from a genuine duplicate). */
function describeStars(c: Cand): string {
  const starred = [...c.build.items, ...c.build.mods].filter((p) => starsOf(p) > 1).map((p) => `${ITEMS[p.def].name}*${starsOf(p)}`);
  return starred.length ? starred.join(", ") : "all 1-star";
}

/** Report for the stars-on DRY run: never wired up (src/sim/standInPoolData.ts untouched). */
function poolMarkdownV2(
  o: StandInOpts, days: HeroDay[], pvp: VersusRow[], tables: VersusTable[], meta: { battles: number; secs: number; workers: number; vsBattles: number; live?: boolean; bytes?: number; liveDry?: boolean },
): string {
  // part 3 on the release: liveDry = a --dry run with FUSE_LIVE true (the shipped pool is then pool v2, not v1.1)
  const L = [
    meta.live ? "# BeltBattles stand-in pool v2 (merge-aware; shipped since the 0.6.1 flip)" : meta.liveDry ? "# BeltBattles stand-in pool - stars-on DRY RUN on the live code (--dry; not shipped)" : "# BeltBattles stand-in pool v2 - stars-on DRY RUN (not shipped)",
    "",
    `Generated by \`${standInCommand(o)} --stars on${meta.liveDry ? " --dry" : ""}\` (rules ${RULES_VERSION}): ${meta.battles} battles in ${meta.secs.toFixed(1)} s on ${meta.workers} worker thread(s).`,
    meta.live ? `This run wrote src/sim/standInPoolData.ts (${meta.bytes} bytes; FUSE_LIVE = true, rules ${RULES_VERSION}); src/sim/standInPool.ts decodes its star-aware codes with decodeStarred. The versus tables below call the pool this tool was bundled with (the committed module before this run) "v1.1"; at the flip that is v1.1 itself.` : meta.liveDry ? `This is a dry run only (--dry; FUSE_LIVE = true, rules ${RULES_VERSION}): src/sim/standInPoolData.ts is untouched. The candidate data module sits beside this file as standInPoolData.v2-dry-candidate.ts. The versus tables below call the pool this tool was bundled with (the shipped module: pool v2 since the 0.6.1 flip) "v1.1", and this run's picks "v2".` : "This is a dry run only: src/sim/standInPool.ts and src/sim/standInPoolData.ts are untouched (the shipped pool stays v1.1 until the flip, FUSE_LIVE = true). The candidate data module sits beside this file as standInPoolData.v2-dry-candidate.ts.",
    "",
    `Every pick below was confirmed (or the tool threw): validateBuild(pick, day) ok, unfusedPairs(pick) empty, buildCost(pick).total <= maxGoldByDay(day), and no module above 2 stars (ARSENAL.md §9.2: the Matriarch alone may carry a 3★). That is the flip's rule, ${meta.live || meta.liveDry ? "live in validateBuild since the flip (FUSE_LIVE = true); the generator checks it as well." : "applied by the generator itself because FUSE_LIVE is still false today."}`,
    "The candidate module was checked as WRITTEN: every stored code (the star-aware format of src/sim/harness/standinCode.ts) decodes to exactly the scored deck, with its stored cost.",
    `2-star cap: a candidate's shopper never buys a copy whose merge would go above ${STANDIN_MAX_STARS} stars (the gauntlet it is scored against is not capped). "cap changed" = candidates whose uncapped build (same seed) differs; "would be 3★" = those whose uncapped build holds a 3-star module.`,
    "",
    "## Summary: picks, spend, vsPar (after the robust re-play), star mix",
    "",
    "| hero | day | relax | robust re-played / removed | cap changed / would be 3★ (of pop) | picks cost | spend % of budget | vsPar min | vsPar mean | star mix (1/2/3-star) | merged/build (median [max]) |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const hd of days) {
    const mix = starMixOf(hd.picks.map((p) => p.build));
    const spendPct = hd.picks.map((p) => (100 * p.cost) / hd.budget);
    const vp = hd.picks.map((p) => p.vsPar);
    L.push(`| ${H(hd.hero)} | ${hd.day} | ${STEP[hd.relax]} | ${hd.robustReplayed} / ${hd.robustRemoved} | ${hd.capAffected} / ${hd.capWould3} (of ${hd.pop.length}) | ${Math.min(...hd.picks.map((p) => p.cost))}-${Math.max(...hd.picks.map((p) => p.cost))} | ${Math.min(...spendPct).toFixed(0)}-${Math.max(...spendPct).toFixed(0)}% | ${pct(Math.min(...vp))} | ${pct(vp.reduce((a, b) => a + b, 0) / vp.length)} | ${pct(mix.p1)}/${pct(mix.p2)}/${pct(mix.p3)} | ${mix.medianMerged} [${mix.maxMerged}] |`);
  }
  const cap = days.reduce((s, hd) => s + hd.capAffected, 0), cap3 = days.reduce((s, hd) => s + hd.capWould3, 0), popN = days.reduce((s, hd) => s + hd.pop.length, 0);
  L.push("", `2-star cap: it changed ${cap} of ${popN} candidates; without it ${cap3} would hold a 3-star module.`);
  if (sourceOf(o) === "caravan") {
    // step 5: what the caravan-bound picks are (picks.json has every pick)
    L.push("", "## Caravan picks (step 5, REQ-BFG-033)", "",
      `Population: par-player runs through the game's caravan (src/sim/harness/caravan.ts), policies ${CARAVAN_MIX.join(", ")} by index. Spend = deck value / maxGoldByDay; spent = (deck value + reroll gold + sale losses) / maxGoldByDay. Stars count items, modules and installed turrets. "starting turret merged" = a free starting copy above 1 star in its own slot; "beyond start" = a bought turret, a turret in another slot than its start, or one in the extra slot.`, "",
      `| hero | day | relax | picks ${[...new Set(CARAVAN_MIX)].join("/")} | spend | spent | reroll g | 2★/3★ | starting turret merged | beyond start | joins |`,
      "|---|---|---|---|---|---|---|---|---|---|---|");
    for (const hd of days) L.push(caravanRow(hd));
  }
  L.push("", "## Picks with a merged module (2 or 3 stars)", "");
  for (const hd of days) {
    for (const p of hd.picks) {
      const s = describeStars(p);
      if (s !== "all 1-star") L.push(`- ${H(hd.hero)} day ${hd.day} #${p.idx}: ${s}`);
    }
  }
  L.push("", `## Robust re-play (candidates clearing parFloor by at most ROBUST_BAND=0.10, re-played once at ${o.robust} x refSeeds fresh seeds)`, "");
  const removedTotal = days.reduce((s, hd) => s + hd.robustRemoved, 0), replayedTotal = days.reduce((s, hd) => s + hd.robustReplayed, 0);
  L.push(`${replayedTotal} candidate(s) re-played (each once, grow steps included); ${removedTotal} removed (their combined vsPar fell below parFloor). Candidates below the floor are never re-played, so none is promoted.`);
  L.push("", `| hero | ${days.filter((hd) => hd.hero === o.heroes[0]).map((hd) => `d${hd.day}`).join(" | ")} |`, `|---|${days.filter((hd) => hd.hero === o.heroes[0]).map(() => "---").join("|")}|`);
  for (const h of o.heroes) L.push(`| ${H(h)} re-played / removed | ${days.filter((hd) => hd.hero === h).map((hd) => `${hd.robustReplayed} / ${hd.robustRemoved}`).join(" | ")} |`);
  L.push("", "## Dry pool v2 vs the dry pool v2 (report only, stars-on picks both sides)", "", `| day | ${pvp.map((r) => r.day).join(" | ")} |`, `|---|${pvp.map(() => "---").join("|")}|`, `| ${H(o.heroes[0])} v2 win rate vs ${H(o.heroes[1])} v2 | ${pvp.map((r) => `${pct(r.rate)}`).join(" | ")} |`);
  L.push("", "## Dry pool v2 vs the shipped pool v1.1: do merged stand-ins get stronger?", "");
  L.push(`Per day, every pick of the row's v2 hero (the dry pool) against every pick of its v1.1 hero (the shipped pool, src/sim/standInPoolData.ts), ${o.seeds} seeds x both sides: the v2 side's win rate. The last row is the shipped pool against itself (the same numbers as \`npm run standins -- --versus\`), the reference for the cross-hero rows. ${meta.vsBattles} battles in these tables.`, "");
  const days10 = tables[0]?.rows ?? [];
  L.push(`| pairing | ${days10.map((r) => `d${r.day}`).join(" | ")} |`, `|---|${days10.map(() => "---").join("|")}|`);
  for (const t of tables) L.push(`| ${H(t.a)} ${t.aPool} vs ${H(t.b)} ${t.bPool} | ${t.rows.map((r) => pct(r.rate)).join(" | ")} |`);
  L.push("", `Battles per cell: ${tables.map((t) => `${H(t.a)} ${t.aPool} vs ${H(t.b)} ${t.bPool} ${t.rows[0]?.battles ?? 0}`).join("; ")} (per day: picks x picks x ${o.seeds} seeds x 2 sides).`);
  L.push("", meta.liveDry
    ? "(--dry on the live code: \"v2\" is this run's picks and \"v1.1\" the shipped pool (pool v2 since the flip). Same-hero rows: above 50% means that day's new picks beat the shipped picks of the same hero. Cross-hero rows: compare with the shipped-vs-shipped reference row of that direction.)"
    : "(Same-hero rows: above 50% means that day's merge-aware v2 picks beat the all-1-star v1.1 picks of the same hero. Cross-hero rows: compare with the v1.1-vs-v1.1 reference row of that direction.)");
  return L.join("\n") + "\n";
}
