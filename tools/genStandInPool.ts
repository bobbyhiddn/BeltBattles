// Stand-in pool CLI: npm run standins -- [--seed 1] [--pop 64] [--band 40,60] [--per 6] [--par-floor 50]
//   [--workers N] [--out ../output] [--check | --versus] [--dump pop.json]
// Writes src/sim/standInPoolData.ts (the bundled pool the game copies with src/sim/standInPool.ts)
// and <out>/standin-pool.md. --check regenerates in memory, compares with the committed data
// module and exits 1 if they differ (nothing is written). --dump also writes every population
// build (idx, cost, pct, score, win rate vs each reference) as JSON, for audits; it works with
// --check. --versus writes nothing: it plays the bundled pool (the data module this build was
// bundled from) against itself, every pick of the first pool hero against every pick of the
// second, and prints the first hero's win rate per day (the report's pool-vs-pool measure).
// Battles fan out to worker threads; results are keyed by job, so the pool is identical
// for any --workers value.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { isMainThread } from "node:worker_threads";
import { HEROES, ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { validateBuild, buildCost, maxGoldByDay, unfusedPairs } from "../src/net/validate";
import { starsOf } from "../src/sim/stars";
import { describeBuild } from "../src/sim/harness/report";
import { starMixOf } from "../src/sim/harness/tournament";
import { pct } from "../src/sim/harness/stats";
import {
  STANDIN_DEFAULTS, dataModuleText, eligibleOf, genStandIns, poolVsPool, standInCommand, writtenProblems, type Cand, type HeroDay, type StandInOpts,
} from "../src/sim/harness/standins";
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
  const o: StandInOpts = {
    ...STANDIN_DEFAULTS,
    seed: num("seed", STANDIN_DEFAULTS.seed),
    pop: num("pop", STANDIN_DEFAULTS.pop),
    per: num("per", STANDIN_DEFAULTS.per),
    gauntlet: num("gauntlet", STANDIN_DEFAULTS.gauntlet),
    band: [band[0], band[1]],
    parFloor: pf / 100,
    stars: starsFlag,
  };
  if (o.per < 1 || o.pop < o.per) throw new Error("--pop must be at least --per, and --per at least 1");
  const check = process.argv.includes("--check");
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
  const res = await genStandIns(o, pool.run, (m) => console.log(m));
  // 0.6.1a: FUSE_LIVE is still false, so validateBuild alone does not reject an unfused pair
  // (net/validate.ts gates that check behind FUSE_LIVE) - the generator must apply it itself.
  for (const hd of res.days) {
    for (const p of hd.picks) {
      const v = validateBuild(p.build, hd.day);
      // The unfused-pair invariant is the stars-on flip rule (step 3); it must not apply when
      // --stars off, which reproduces the legacy v1.1 pool byte-for-byte - 65 of its 120 decks
      // hold same-star pairs that were never merge-aware in the first place (that is the whole
      // reason this pool needs regenerating once stars are on).
      const unfused = o.stars === "on" ? unfusedPairs(p.build) : [];
      if (!v.ok || p.build.hero !== hd.hero || unfused.length) {
        throw new Error(`stand-in ${hd.hero} d${hd.day} #${p.idx} is invalid: ${[...v.errors, ...unfused].join("; ")}`);
      }
      if (buildCost(p.build).total > maxGoldByDay(hd.day)) throw new Error(`stand-in ${hd.hero} d${hd.day} #${p.idx} costs more than maxGoldByDay`);
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
    const rows = res.days.map((hd) => ({
      hero: hd.hero, day: hd.day, relax: hd.relax, window: hd.window, par: hd.par, picks: hd.picks.map((p) => p.idx),
      pop: hd.pop.map((c) => [c.idx, c.cost, c.floorMet ? 1 : 0, c.pct, c.score, ...o.heroes.map((h) => c.vsRef[h] ?? 0)]),
    }));
    writeFileSync(resolve(dump), JSON.stringify({ columns: ["idx", "cost", "floorMet", "pct", "score", ...o.heroes.map((h) => `vs ${h} ref`)], days: rows }));
    console.log(`dump: every population build of every hero and day written to ${resolve(dump)}`);
  }

  if (o.stars === "off") {
    // v1.1, byte for byte: unchanged from bf779de (the shipped pool stays v1.1 until the flip).
    const text = dataModuleText(o, res.days);
    const path = resolve(DATA);
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
    writeFileSync(path, text);
    const out = resolve(flag("out") ?? "../output");
    mkdirSync(out, { recursive: true });
    writeFileSync(resolve(out, "standin-pool.md"), poolMarkdown(o, res.days, pvp, { battles: res.battles, secs, workers: nw, bytes: text.length }));
    console.log(`${res.battles} battles in ${secs.toFixed(1)} s on ${nw} worker(s); wrote ${DATA} (${text.length} bytes) and ${out}/standin-pool.md`);
    return;
  }

  // 0.6.1a harness v2, stars on: a DRY run only. Never touches src/sim/standInPool.ts or
  // standInPoolData.ts (the shipped pool stays v1.1 until the flip); everything lands under
  // output-h2/pool-v2-dry/ (a data-module *candidate*, not wired up, and a star-aware report).
  const secs0 = (performance.now() - t0) / 1000;
  const pvp = await poolVsPool(o, (h, d) => res.days.find((x) => x.hero === h && x.day === d)!.picks.map((p) => p.build), pool.run);
  const versusV11 = await poolVsPool(o, (h, d) => standInPool(h, d).map((e) => e.build), pool.run);
  await pool.close();
  const secs = (performance.now() - t0) / 1000;
  const out = resolve(flag("out") ?? "../output-h2/pool-v2-dry");
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "standInPoolData.v2-dry-candidate.ts"), candidate);
  writeFileSync(resolve(out, "standin-pool.md"), poolMarkdownV2(o, res.days, pvp, versusV11, { battles: res.battles, secs, workers: nw }));
  console.log(`${res.battles} battles in ${secs.toFixed(1)} s on ${nw} worker(s) (${secs0.toFixed(1)} s to generate); DRY RUN, wrote ${out}/standInPoolData.v2-dry-candidate.ts and standin-pool.md (src/sim/standInPoolData.ts untouched)`);
}

const H = (h: HeroId) => HEROES[h].name;
const STEP: Record<HeroDay["relax"], string> = { none: "none", widen: "(a) widen", grow: "(b) grow", elites: "(c) elites", best: "(d) best vsPar" };

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
  o: StandInOpts, days: HeroDay[], pvp: { day: number; rate: number; battles: number }[],
  versusV11: { day: number; rate: number; battles: number }[], meta: { battles: number; secs: number; workers: number },
): string {
  const L = [
    "# BeltBattles stand-in pool v2 - stars-on DRY RUN (not shipped)",
    "",
    `Generated by \`${standInCommand(o)} --stars on\` (rules ${RULES_VERSION}): ${meta.battles} battles in ${meta.secs.toFixed(1)} s on ${meta.workers} worker thread(s).`,
    "This is a dry run only: src/sim/standInPool.ts and src/sim/standInPoolData.ts are untouched (the shipped pool stays v1.1 until the flip, FUSE_LIVE = true). The candidate data module sits beside this file as standInPoolData.v2-dry-candidate.ts.",
    "",
    "Every pick below was confirmed (or the tool threw): validateBuild(pick, day) ok, unfusedPairs(pick) empty, and buildCost(pick).total <= maxGoldByDay(day). That is the flip's rule, applied by the generator itself because FUSE_LIVE is still false today.",
    "",
    "## Summary: picks, spend, vsPar (after the robust re-play), star mix",
    "",
    "| hero | day | relax | robust removed | picks cost | spend % of budget | vsPar min | vsPar mean | star mix (1/2/3-star) | merged/build (median [max]) |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const hd of days) {
    const mix = starMixOf(hd.picks.map((p) => p.build));
    const spendPct = hd.picks.map((p) => (100 * p.cost) / hd.budget);
    const vp = hd.picks.map((p) => p.vsPar);
    L.push(`| ${H(hd.hero)} | ${hd.day} | ${STEP[hd.relax]} | ${hd.robustRemoved} | ${Math.min(...hd.picks.map((p) => p.cost))}-${Math.max(...hd.picks.map((p) => p.cost))} | ${Math.min(...spendPct).toFixed(0)}-${Math.max(...spendPct).toFixed(0)}% | ${pct(Math.min(...vp))} | ${pct(vp.reduce((a, b) => a + b, 0) / vp.length)} | ${pct(mix.p1)}/${pct(mix.p2)}/${pct(mix.p3)} | ${mix.medianMerged} [${mix.maxMerged}] |`);
  }
  L.push("", "## Picks with a merged module (2 or 3 stars)", "");
  for (const hd of days) {
    for (const p of hd.picks) {
      const s = describeStars(p);
      if (s !== "all 1-star") L.push(`- ${H(hd.hero)} day ${hd.day} #${p.idx}: ${s}`);
    }
  }
  L.push("", `## Robust re-play (ROBUST_BAND=0.10 of parFloor, ${o.robust} x refSeeds fresh seeds)`, "");
  const removedTotal = days.reduce((s, hd) => s + hd.robustRemoved, 0);
  L.push(removedTotal ? `${removedTotal} candidate(s) removed across all hero/day pairs (see the summary table's "robust removed" column for the split).` : "0 candidates removed: every borderline candidate held its vsPar under the fresh re-play.");
  L.push("", "## Dry pool v2 vs the dry pool v2 (report only, stars-on picks both sides)", "", `| day | ${pvp.map((r) => r.day).join(" | ")} |`, `|---|${pvp.map(() => "---").join("|")}|`, `| ${H(o.heroes[0])} pool win rate | ${pvp.map((r) => `${pct(r.rate)}`).join(" | ")} |`);
  L.push("", "## Dry pool v2 vs the shipped pool v1.1: do merged stand-ins get stronger?", "", `Every dry pool v2 pick (of heroes[0]) against every shipped v1.1 pick (of heroes[1]), ${o.seeds} seeds x both sides.`, "");
  L.push(`| day | ${versusV11.map((r) => r.day).join(" | ")} |`, `|---|${versusV11.map(() => "---").join("|")}|`, `| ${H(o.heroes[0])} v2 win rate vs ${H(o.heroes[1])} v1.1 | ${versusV11.map((r) => `${pct(r.rate)}`).join(" | ")} |`, `| battles | ${versusV11.map((r) => r.battles).join(" | ")} |`);
  L.push("", "(v2 picks its own heroes[0]/heroes[1] side of decks against the v1.1 pool's opposite side; a v2 rate above 50% on a day means that day's merge-aware picks beat the all-1-star v1.1 picks more often than not.)");
  return L.join("\n") + "\n";
}
