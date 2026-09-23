// Balance harness report: markdown tables and build descriptions from a TourneyResult.

import { HEROES, ITEMS, type HeroId } from "../content";
import { routeInfo, type Build } from "../deck";
import { buildCost, maxGoldByDay } from "../../net/validate";
import { bandFlag, fmtRate, pct, type Rate } from "./stats";
import type { TourneyResult } from "./tournament";

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

function matrix(res: TourneyResult, rates: Record<string, Rate>, flags: boolean): string[] {
  const hs = res.opts.heroes;
  const out = [`| row vs column | ${hs.map(H).join(" | ")} |`, `|---|${hs.map(() => "---").join("|")}|`];
  for (const a of hs) {
    out.push(`| **${H(a)}** | ${hs.map((b) => (a === b ? "—" : fmtRate(rates[`${a}|${b}`]) + (flags ? flagMark(rates[`${a}|${b}`]) : ""))).join(" | ")} |`);
  }
  return out;
}

export interface Lopsided { day: number; kind: "pop" | "elite"; a: HeroId; b: HeroId; rate: Rate }

/** Pairings sorted by distance from 50% (row hero is the favourite). */
export function lopsided(res: TourneyResult, kind: "pop" | "elite"): Lopsided[] {
  const out: Lopsided[] = [];
  for (const d of res.days) {
    const t = kind === "pop" ? d.pop : d.elite;
    for (const [k, rate] of Object.entries(t)) {
      const [a, b] = k.split("|") as [HeroId, HeroId];
      if (rate.p > 0.5 || (rate.p === 0.5 && a < b)) out.push({ day: d.day, kind, a, b, rate });
    }
  }
  return out.sort((x, y) => y.rate.p - x.rate.p || x.day - y.day);
}

export function balanceMarkdown(res: TourneyResult, meta: RunMeta): string {
  const o = res.opts;
  const L: string[] = [
    "# BeltBattles balance harness v0",
    "",
    `Run: \`${meta.command}\`. Seed ${o.seed}; ${o.pop} random builds per hero and day; gauntlet = the first ${o.gauntlet} builds of every hero's population;`,
    `${o.seeds} seeds per pairing, each played from both sides (${o.seeds * 2} battles); top ${o.elites} per hero are the day's elites.`,
    `${res.battles} battles in ${(meta.runtimeMs / 1000).toFixed(1)} s on ${meta.workers} worker thread(s).`,
    "",
    "Each cell is the ROW hero's win rate against the COLUMN hero (draws count half), its Wilson 95% interval and the battle count.",
    "Every build spends up to the day's gold (`maxGoldByDay`) and passes `validateBuild`. Target band: 35-65%.",
    "Elite flags: **!** = the whole interval is outside 35-65% (clear imbalance); ~ = the interval crosses a band edge.",
    "",
  ];
  for (const d of res.days) {
    L.push(`## Day ${d.day} (budget ${d.budget} gold, ${d.battles} battles, ${((meta.perDayMs[d.day] ?? 0) / 1000).toFixed(1)} s)`, "");
    L.push("Population vs population:", "", ...matrix(res, d.pop, false), "");
    L.push(`Elites vs elites (top ${o.elites} per hero):`, "", ...matrix(res, d.elite, true), "");
  }
  L.push("## Flagged elite pairings", "");
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
  L.push("", "## Calibration: the hand-made reference build inside its hero's population", "");
  L.push("Reference = warlordBuild (Furnace, Weaver) or raceWarlordBuild (Foundry, Bastion) for that day, hull offset replaced by whole plating within budget.");
  L.push("Rank 1 = beats every random build of its hero against the same gauntlet.", "");
  const cal = res.days.filter((d) => d.calibration);
  L.push(`| hero | ${cal.map((d) => `day ${d.day}`).join(" | ")} |`, `|---|${cal.map(() => "---").join("|")}|`);
  for (const h of o.heroes) {
    L.push(`| ${H(h)} | ${cal.map((d) => { const c = d.calibration![h]; return `rank ${c.rank}/${c.of} (${pct(c.score.p)} vs gauntlet)`; }).join(" | ")} |`);
  }
  L.push("", "## Most lopsided pairings", "");
  for (const kind of ["elite", "pop"] as const) {
    L.push(`${kind === "elite" ? "Elites" : "Populations"}:`, "");
    for (const x of lopsided(res, kind).slice(0, 6)) L.push(`- Day ${x.day}: ${H(x.a)} over ${H(x.b)} ${fmtRate(x.rate)}`);
    L.push("");
  }
  return L.join("\n") + "\n";
}
