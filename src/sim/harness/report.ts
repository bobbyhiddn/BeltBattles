// Balance harness report: markdown tables and build descriptions from a TourneyResult.

import { HEROES, ITEMS, RULES_VERSION, type HeroId } from "../content";
import { routeInfo, type Build } from "../deck";
import { buildCost, maxGoldByDay } from "../../net/validate";
import { bandFlag, fmtRate, pct, type Rate } from "./stats";
import type { Spend, TourneyResult } from "./tournament";

export interface RunMeta { runtimeMs: number; workers: number; command: string; perDayMs: Record<number, number> }

/** One-line designer view of a build: machinery, modules, routes, belt, plating, gold. */
export function describeBuild(b: Build, day: number): string {
  const h = HEROES[b.hero];
  const counts = new Map<string, number>();
  for (const p of b.items) if (p.def !== h.factory) counts.set(ITEMS[p.def].name, (counts.get(ITEMS[p.def].name) ?? 0) + 1);
  const items = [...counts].map(([n, c]) => (c > 1 ? `${n} x${c}` : n)).join(", ") || "no gates";
  const mods = b.mods.map((m) => `${ITEMS[m.def].name} on gun ${m.turret + 1}`).join(", ") || "no modules";
  const routes = b.routes.map((r, i) => {
    const f = b.items.find((p) => p.uid === r.factory);
    const info = routeInfo(b, i);
    return `${f ? ITEMS[f.def].name : "?"} ${r.cells.length} tiles -> c${info.connector}${info.gates.length ? ` (${info.gates.length} gates)` : ""}`;
  }).join("; ");
  const belt = b.routes.reduce((s, r) => s + r.cells.length, 0);
  const cost = buildCost(b);
  return `${items} | ${mods} | routes: ${routes} | belt ${belt}/${b.beltCap} (${cost.crates} crates) | plating ${cost.plates} (+${b.hullBonus} hull) | ${cost.total}/${maxGoldByDay(day)} g`;
}

const H = (h: HeroId) => HEROES[h].name;
const flagMark = (r: Rate) => ({ ok: "", edge: " ~", out: " **!**" })[bandFlag(r)];
export const fmtSpend = (s: Spend) => `${s.median} [${s.min}-${s.max}]`;

function matrix(res: TourneyResult, rates: Record<string, Rate>, flags: boolean, mirror: boolean): string[] {
  const hs = res.opts.heroes;
  const out = [`| row vs column | ${hs.map(H).join(" | ")} |`, `|---|${hs.map(() => "---").join("|")}|`];
  for (const a of hs) {
    out.push(`| **${H(a)}** | ${hs.map((b) => {
      const r = rates[`${a}|${b}`];
      if (a === b) return mirror && r ? `_${fmtRate(r)}_` : "—";
      return fmtRate(r) + (flags ? flagMark(r) : "");
    }).join(" | ")} |`);
  }
  return out;
}

export interface Lopsided { day: number; kind: "pop" | "elite"; a: HeroId; b: HeroId; rate: Rate }

/** Pairings of different heroes sorted by distance from 50% (row hero is the favourite). */
export function lopsided(res: TourneyResult, kind: "pop" | "elite"): Lopsided[] {
  const out: Lopsided[] = [];
  for (const d of res.days) {
    const t = kind === "pop" ? d.pop : d.elite;
    for (const [k, rate] of Object.entries(t)) {
      const [a, b] = k.split("|") as [HeroId, HeroId];
      if (a !== b && (rate.p > 0.5 || (rate.p === 0.5 && a < b))) out.push({ day: d.day, kind, a, b, rate });
    }
  }
  return out.sort((x, y) => y.rate.p - x.rate.p || x.day - y.day);
}

export function balanceMarkdown(res: TourneyResult, meta: RunMeta): string {
  const o = res.opts;
  const L: string[] = [
    "# BeltBattles balance harness v1",
    "",
    `Run: \`${meta.command}\` (rules ${RULES_VERSION}). Seed ${o.seed}; ${o.pop} random builds per hero and day; gauntlet = the first ${o.gauntlet} builds of every hero's population;`,
    `${o.seeds} seeds per pairing, each played from both sides (${o.seeds * 2} battles); top ${o.elites} per hero are the day's elites.`,
    `${res.battles} battles in ${(meta.runtimeMs / 1000).toFixed(1)} s on ${meta.workers} worker thread(s).`,
    "",
    "Each cell is the ROW hero's win rate against the COLUMN hero (draws count half), its Wilson 95% interval and the battle count.",
    "Every build spends up to the day's gold (`maxGoldByDay`) and passes `validateBuild`. Target band: 35-65%.",
    "Diagonal (italics) = mirror cell: the hero's builds outside the gauntlet against its own gauntlet builds; it should sit near 50%.",
    "Elite flags: **!** = the whole interval is outside 35-65% (clear imbalance); ~ = the interval crosses a band edge.",
    "",
  ];
  for (const d of res.days) {
    L.push(`## Day ${d.day} (budget ${d.budget} gold, ${d.battles} battles, ${((meta.perDayMs[d.day] ?? 0) / 1000).toFixed(1)} s)`, "");
    L.push("Population vs population:", "", ...matrix(res, d.pop, false, true), "");
    L.push(`Elites vs elites (top ${o.elites} per hero):`, "", ...matrix(res, d.elite, true, false), "");
    L.push(`Population spend (gold, median [min-max]): ${o.heroes.map((h) => `${H(h)} ${fmtSpend(d.spend[h])}`).join(", ")}.`, "");
  }
  L.push("## Mirror cells", "", `| hero | ${res.days.map((d) => `day ${d.day}`).join(" | ")} |`, `|---|${res.days.map(() => "---").join("|")}|`);
  for (const h of o.heroes) L.push(`| ${H(h)} | ${res.days.map((d) => fmtRate(d.pop[`${h}|${h}`])).join(" | ")} |`);
  L.push("", "## Flagged elite pairings", "");
  const flagged = lopsided(res, "elite").filter((x) => bandFlag(x.rate) !== "ok");
  if (!flagged.length) L.push("None: every elite interval lies inside 35-65%.");
  for (const x of flagged) L.push(`- Day ${x.day}: ${H(x.a)} beats ${H(x.b)} ${fmtRate(x.rate)} — ${bandFlag(x.rate) === "out" ? "OUTSIDE the band" : "crosses the band edge"}`);
  L.push("", "## Top elite build per hero and day", "", "Win rate is against the day's whole gauntlet (all heroes).", "");
  for (const d of res.days) {
    for (const h of o.heroes) {
      const e = d.elites[h][0];
      if (e) L.push(`- **Day ${d.day} ${H(h)}** #${e.idx} (${fmtRate(e.score)}): ${describeBuild(e.build, d.day)}`);
    }
  }
  L.push("", "## Calibration: the reference build inside its hero's population", "");
  L.push("Reference = heroRefBuild(hero, day) from src/sim/heroBuilds.ts (honest: nearest-plate plating, within maxGoldByDay).");
  L.push("Rank 1 = beats every random build of its hero against the same gauntlet. Spend: reference gold / population median [min-max].", "");
  const cal = res.days.filter((d) => d.calibration);
  L.push(`| hero | ${cal.map((d) => `day ${d.day}`).join(" | ")} |`, `|---|${cal.map(() => "---").join("|")}|`);
  for (const h of o.heroes) {
    L.push(`| ${H(h)} | ${cal.map((d) => {
      const c = d.calibration![h];
      return `rank ${c.rank}/${c.of}, ${pct(c.score.p)}; ${c.cost} g / ${fmtSpend(c.popCost)}`;
    }).join(" | ")} |`);
  }
  L.push("", "## Lever traits in the population", "");
  L.push("Share of each hero's population with a trait, and the mean gauntlet score of builds with it vs without it.");
  L.push("ordered = flat-bonus gates before a Splitter (no route the other way); reverse = a Splitter before a flat-bonus gate;");
  L.push("synced = Crucible twins matched with mirrored speed gates (+speed: at least one mirrored pair); dropped = a signature route dropped for a Press line.", "");
  L.push("| day | hero | ordered | reverse | synced | synced+speed | dropped | press |", "|---|---|---|---|---|---|---|---|");
  for (const d of res.days) {
    for (const h of o.heroes) {
      const t = d.traits[h];
      const cell = (k: keyof typeof t) => (t[k].n ? `${t[k].n}: ${pct(t[k].mean)} vs ${pct(t[k].restMean)}` : "0");
      L.push(`| ${d.day} | ${H(h)} | ${cell("ordered")} | ${cell("reverse")} | ${cell("synced")} | ${cell("speedSynced")} | ${cell("dropped")} | ${cell("press")} |`);
    }
  }
  L.push("", "## Most lopsided pairings", "");
  for (const kind of ["elite", "pop"] as const) {
    L.push(`${kind === "elite" ? "Elites" : "Populations"}:`, "");
    for (const x of lopsided(res, kind).slice(0, 8)) L.push(`- Day ${x.day}: ${H(x.a)} over ${H(x.b)} ${fmtRate(x.rate)}`);
    L.push("");
  }
  if (res.days.some((d) => d.mirror2 || d.starMix || d.bench)) L.push(...v2Sections(res));
  return L.join("\n") + "\n";
}

const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;

/** 0.6.1a harness v2: mirror K=4 splits, star mix, and the star bench. Appended after every v1
 *  section so a stars-off run's markdown (no v2 fields on any day) is exactly v1's output. */
function v2Sections(res: TourneyResult): string[] {
  const o = res.opts;
  const L: string[] = ["## Mirror, K=4 splits (0.6.1a)", "", "Mean win rate of a random half of the population against the other half, both sides, same seeds per split; min-max over the 4 splits. A noise gauge (about 50%), not a balance target.", ""];
  L.push(`| day | ${o.heroes.map(H).join(" | ")} |`, `|---|${o.heroes.map(() => "---").join("|")}|`);
  for (const d of res.days) {
    if (!d.mirror2) continue;
    L.push(`| ${d.day} | ${o.heroes.map((h) => { const m = d.mirror2![h]; return m ? `${pct1(m.mean)} [${pct1(m.min)}-${pct1(m.max)}]` : "n/a"; }).join(" | ")} |`);
  }
  L.push("", "## Star mix (0.6.1a)", "", "Share of fusible modules (items + modules) at each star, and merged modules (>1 star) per build (median [max]). Population, then elites.", "");
  L.push("| day | hero | pop 1/2/3-star | pop merged/build | elite 1/2/3-star | elite merged/build |", "|---|---|---|---|---|---|");
  for (const d of res.days) {
    if (!d.starMix) continue;
    for (const h of o.heroes) {
      const m = d.starMix[h];
      if (!m) continue;
      L.push(`| ${d.day} | ${H(h)} | ${pct1(m.pop.p1)}/${pct1(m.pop.p2)}/${pct1(m.pop.p3)} | ${m.pop.medianMerged} [${m.pop.maxMerged}] | ${pct1(m.elites.p1)}/${pct1(m.elites.p2)}/${pct1(m.elites.p3)} | ${m.elites.medianMerged} [${m.elites.maxMerged}] |`);
    }
  }
  L.push("", "## Star bench (0.6.1a)", "", "Every elite/par deck's fusible modules held at 1 star, raised in place to 2 and 3 stars (same cell/turret, budget ignored), replayed against the day's gauntlet. Win rate at 1-star and at that star, the delta, and 95% Wilson intervals. WORSE: a higher star wins less and the intervals don't overlap. NO EFFECT: every battle ends identically to 1-star (the level does nothing yet).", "");
  L.push("| day | def | star | n | win rate @1 | win rate @star | delta | flags |", "|---|---|---|---|---|---|---|---|");
  for (const d of res.days) {
    for (const r of d.bench ?? []) {
      L.push(`| ${d.day} | ${r.def} | ${r.star} | ${r.n} | ${fmtRate(r.wr1)} | ${fmtRate(r.wrN)} | ${r.delta >= 0 ? "+" : ""}${pct1(r.delta)} | ${r.flags.join(", ") || "-"} |`);
    }
  }
  const flagged = res.days.flatMap((d) => (d.bench ?? []).filter((r) => r.flags.length).map((r) => ({ day: d.day, r })));
  L.push("", "### WORSE / NO EFFECT summary", "");
  if (!flagged.length) L.push("None flagged.");
  for (const { day, r } of flagged) L.push(`- Day ${day} ${r.def} ★${r.star}: ${r.flags.join(", ")} (delta ${r.delta >= 0 ? "+" : ""}${pct1(r.delta)}, @1 ${fmtRate(r.wr1)}, @${r.star} ${fmtRate(r.wrN)})`);
  L.push("");
  return L;
}
