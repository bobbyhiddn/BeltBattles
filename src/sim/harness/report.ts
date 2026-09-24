// Balance harness report: markdown tables and build descriptions from a TourneyResult.

import { HEROES, ITEMS, RULES_VERSION, type HeroId } from "../content";
import { routeInfo, type Build } from "../deck";
import { buildCost, maxGoldByDay } from "../../net/validate";
import { perkAt, starsOf } from "../stars";
import { bandFlag, fmtRate, meanCI, pct, type Rate } from "./stats";
import type { BenchDeck, BenchRow, CoreUse, FocusDeck, Spend, TourneyResult } from "./tournament";

export interface RunMeta { runtimeMs: number; workers: number; command: string; perDayMs: Record<number, number> }

/** One-line designer view of a build: machinery, modules, routes, belt, plating, gold. */
export function describeBuild(b: Build, day: number): string {
  const h = HEROES[b.hero];
  const counts = new Map<string, number>();
  // 0.6.1b (part 2): a merged module shows its star ("TEMPER ★2"); a 1-star one reads exactly as in v1
  const nm = (p: { def: string; stars?: number }) => `${ITEMS[p.def].name}${starsOf(p) > 1 ? ` ★${starsOf(p)}` : ""}`;
  for (const p of b.items) if (p.def !== h.factory) counts.set(nm(p), (counts.get(nm(p)) ?? 0) + 1);
  const items = [...counts].map(([n, c]) => (c > 1 ? `${n} x${c}` : n)).join(", ") || "no gates";
  const mods = b.mods.map((m) => `${nm(m)}${ITEMS[m.def].kind === "core" ? " (core)" : ""} on gun ${m.turret + 1}`).join(", ") || "no modules";
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
  if (res.days.some((d) => d.coreUse)) L.push(...coreSection(res));
  L.push(...benchSection(res.days));
  if (res.days.some((d) => d.bench)) L.push(...knownFallsSection(res.days));
  if (res.days.some((d) => d.hopperSplitter)) L.push(...hopperSection(res.days));
  return L;
}

/** 0.6.1b (harness v2 part 2): bought turret cores per hero and day, population then elites. */
function coreSection(res: TourneyResult): string[] {
  const o = res.opts;
  const L: string[] = ["", "## Turret cores (0.6.1b)", "", "Bought cores fitted in each hero's population and elites: builds with a core, cores per build, the star split and the defs (count). An empty socket runs the hero's signature core (never bought).", ""];
  const cell = (u: CoreUse) => {
    const defs = Object.entries(u.byDef).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([d, n]) => `${d} ${n}`).join(", ");
    return `${u.withCore}/${u.builds}; ${(u.builds ? u.cores / u.builds : 0).toFixed(2)}/build; ★ ${u.stars.join("/")}${defs ? `; ${defs}` : ""}; ram@gatling ${u.ramOnGatling}`;
  };
  L.push("ram@gatling: turrets with FINISHER RAM gear under a GATLING SPOOL core (the ram does nothing there; the game allows the pair).", "");
  L.push("| day | hero | population | elites |", "|---|---|---|---|");
  for (const d of res.days) {
    if (!d.coreUse) continue;
    for (const h of o.heroes) {
      const u = d.coreUse[h];
      if (u) L.push(`| ${d.day} | ${H(h)} | ${cell(u.pop)} | ${cell(u.elites)} |`);
    }
  }
  return L;
}

/** The star bench section (table, flag summary, and every WORSE row's decks with their paired deltas). */
export function benchSection(days: { day: number; bench?: BenchRow[] }[]): string[] {
  const L: string[] = [];
  L.push("", "## Star bench (0.6.1a)", "", [
    "Every elite/par deck's fusible modules held at 1 star, raised in place to 2 and 3 stars (same cell/turret, budget ignored), replayed against the day's gauntlet.",
    "Paired: the 1-star deck and its variants play every gauntlet member on the same seeds, both sides. A variant (or 1-star deck) with an unfused pair is a deck the game can't build: it is skipped and counted (base = the 1-star deck itself holds the pair).",
    "The unit is the deck: its paired delta is the mean over its gauntlet jobs of (win rate at the star - at 1 star). WORSE: at least 3 decks, mean delta below 0, and its 95% t-interval over decks entirely below 0.",
    "The pooled Wilson win rates are description only. NO EFFECT: every battle ends exactly as at 1 star (winner, both hulls, duration; delta 0). SAME AS ★2 (3-star rows): every battle ends exactly as at 2 stars.",
  ].join(" "), "");
  const flagText = (r: BenchRow) => r.flags.map((f) => (f === "SAME AS ★2" && r.same2 !== undefined && r.same2 < r.n ? `${f} (${r.same2} of ${r.n} decks comparable)` : f)).join(", ");
  L.push("STEP (part 2, 3-star rows): each deck whose 2-star variant was also played, its paired 3-star minus 2-star delta on the same seeds; mean [95% t], worse/decks. STEP WORSE: the D1 rule on the steps.", "");
  L.push("| day | def | star | decks | skipped (base) | worse | mean paired delta [95% t] | STEP 3-2 [95% t] (worse) | win rate @1 | win rate @star | flags |", "|---|---|---|---|---|---|---|---|---|---|---|");
  for (const d of days) {
    for (const r of d.bench ?? []) {
      const ci = r.ci ? ` [${sgn(r.ci[0])}, ${sgn(r.ci[1])}]` : "";
      const st = r.step ? (r.step.n ? `${sgn(r.step.mean)}${r.step.ci ? ` [${sgn(r.step.ci[0])}, ${sgn(r.step.ci[1])}]` : ""} (${r.step.worse}/${r.step.n})` : "n/a") : "-";
      L.push(`| ${d.day} | ${r.def}${r.perk ? ` (${r.perk})` : ""} | ${r.star} | ${r.n} | ${r.skipped} (${r.skippedBase}) | ${r.worse}/${r.n} | ${r.n ? `${sgn(r.delta)}${ci}` : "n/a"} | ${st} | ${fmtRate(r.wr1)} | ${fmtRate(r.wrN)} | ${flagText(r) || "-"} |`);
    }
  }
  const flagged = days.flatMap((d) => (d.bench ?? []).filter((r) => r.flags.length).map((r) => ({ day: d.day, r })));
  L.push("", "### WORSE / NO EFFECT / SAME AS ★2 summary", "");
  if (!flagged.length) L.push("None flagged.");
  for (const { day, r } of flagged) L.push(`- Day ${day} ${r.def} ★${r.star}: ${flagText(r)} (${r.worse}/${r.n} decks worse, mean paired delta ${sgn(r.delta)}${r.ci ? ` [${sgn(r.ci[0])}, ${sgn(r.ci[1])}]` : ""}; @1 ${fmtRate(r.wr1)}, @${r.star} ${fmtRate(r.wrN)})`);
  const worse = days.flatMap((d) => (d.bench ?? []).filter((r) => r.flags.includes("WORSE")).map((r) => ({ day: d.day, r })));
  if (worse.length) {
    L.push("", "### WORSE rows: every deck with its paired delta (par = the hero's par deck)", "");
    for (const { day, r } of worse) {
      L.push(`- Day ${day} ${r.def} ★${r.star}: ${[...r.decks].sort((a, b) => a.delta - b.delta).map((k) => `${k.tag}${k.par ? " (PAR)" : ""} ${sgn(k.delta)}`).join("; ")}`);
    }
  }
  const stepWorse = days.flatMap((d) => (d.bench ?? []).filter((r) => r.flags.includes("STEP WORSE") && r.step).map((r) => ({ day: d.day, r })));
  if (stepWorse.length) {
    L.push("", "### STEP WORSE rows: every deck with its paired 3-star minus 2-star step", "");
    for (const { day, r } of stepWorse) L.push(`- Day ${day} ${r.def} ★2->★3: ${deckList(r.step!.decks)}`);
  }
  L.push("");
  return L;
}

const sgn = (x: number) => `${x >= 0 ? "+" : ""}${pct1(x)}`;
const deckList = (ds: BenchDeck[]) => [...ds].sort((a, b) => a.delta - b.delta).map((k) => `${k.tag}${k.par ? " (PAR)" : ""} ${sgn(k.delta)}`).join("; ");
/** The hero of a bench deck: the tournament tags every source "<hero> elite <k>", "<hero> par" or "<hero> par~". */
export const heroOfTag = (tag: string): HeroId => tag.split(" ")[0] as HeroId;

/** Per hero: decks and their mean delta, in first-seen order. */
export function byHero(ds: BenchDeck[]): { hero: HeroId; n: number; mean: number }[] {
  const m = new Map<HeroId, number[]>();
  for (const d of ds) m.set(heroOfTag(d.tag), [...(m.get(heroOfTag(d.tag)) ?? []), d.delta]);
  return [...m].map(([hero, xs]) => ({ hero, n: xs.length, mean: xs.reduce((s, x) => s + x, 0) / xs.length }));
}

/** One KNOWN_FALLS step on one day: the main-bench decks (from the rows) and the PAR~ copies (report only). */
export interface FallStep { label: string; def: string; from: 1 | 2; to: 2 | 3; decks: BenchDeck[]; parTilde: BenchDeck[] }

/** Part 2: the KNOWN_FALLS steps of one day. Main decks: SPLITTER 2->3 and BRAKE 2->3 are the 3-star rows' STEP
 *  decks; BRAKE 1->2 (and 1->3) are the 2-star (3-star) rows' paired deltas. PAR~: focusBench points. */
export function fallSteps(d: { bench?: BenchRow[]; parTilde?: FocusDeck[] }): FallStep[] {
  const row = (def: string, star: number) => (d.bench ?? []).find((r) => r.def === def && r.star === star);
  const tilde = (def: string, from: 1 | 2, to: 2 | 3): BenchDeck[] => (d.parTilde ?? []).filter((f) => f.def === def && f.pts[from - 1] !== null && f.pts[to - 1] !== null)
    .map((f) => ({ tag: `${f.tag}${f.stars0 > 1 ? ` (merged ★${f.stars0})` : ""}`, par: true, delta: (f.pts[to - 1]! - f.pts[from - 1]!) / f.n }));
  return [
    { label: "SPLITTER ★2->★3", def: "splitter", from: 2, to: 3, decks: row("splitter", 3)?.step?.decks ?? [], parTilde: tilde("splitter", 2, 3) },
    { label: "BRAKE SHOE ★1->★2", def: "brake", from: 1, to: 2, decks: row("brake", 2)?.decks ?? [], parTilde: tilde("brake", 1, 2) },
    { label: "BRAKE SHOE ★2->★3", def: "brake", from: 2, to: 3, decks: row("brake", 3)?.step?.decks ?? [], parTilde: tilde("brake", 2, 3) },
    { label: "BRAKE SHOE ★1->★3", def: "brake", from: 1, to: 3, decks: row("brake", 3)?.decks ?? [], parTilde: tilde("brake", 1, 3) },
  ];
}

/** Part 2: the KNOWN_FALLS section (tests/arsenal.decks.test.ts: SPLITTER 2->3 -16.6%, BRAKE SHOE -8.2% / -13.6%
 *  in the owner's check): every deck with its paired delta, par decks marked, the FURNACE par deck called out as
 *  the clean case, a split by hero, then the PAR~ decks (merged par decks, report only, outside every flag). */
export function knownFallsSection(days: { day: number; bench?: BenchRow[]; parTilde?: FocusDeck[] }[]): string[] {
  const L: string[] = ["", "## KNOWN_FALLS rows (part 2): SPLITTER ★2->★3 and BRAKE SHOE ★1->★2->★3", "",
    "Main decks (elites and par decks of the star bench): the paired delta per deck on shared seeds (2->3 is the 3-star row's STEP). (PAR) = a par deck; FURNACE's par deck is the clean case (it holds no unfused pair on any day). PAR~ = a merged copy of a par deck that holds an unfused pair (fuse.ts fuseAll through the harness adapter), benched for these defs only: report only, in no row or flag.", ""];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  for (const d of days) {
    if (!d.bench) continue;
    for (const s of fallSteps(d)) {
      const xs = s.decks.map((k) => k.delta), ci = meanCI(xs).ci;
      const fp = s.decks.find((k) => k.tag === "furnace par");
      L.push(`- **Day ${d.day} ${s.label}**: ${s.decks.length} decks, mean ${s.decks.length ? sgn(mean(xs)) : "n/a"}${ci ? ` [${sgn(ci[0])}, ${sgn(ci[1])}]` : ""}, worse ${xs.filter((x) => x < 0).length}/${xs.length}; FURNACE par (clean case): ${fp ? sgn(fp.delta) : "not benched"}; PAR~: ${s.parTilde.length ? deckList(s.parTilde) : "none"}`);
      if (s.decks.length) {
        L.push(`  - by hero: ${byHero(s.decks).map((h) => `${H(h.hero)} ${h.n} decks ${sgn(h.mean)}`).join("; ")}`);
        L.push(`  - decks: ${deckList(s.decks)}`);
      }
    }
  }
  return L;
}

/** Part 2, optional: does HOPPER 3-star (its level-3 perk: the jam relief) turn SPLITTER's level-3 perk into an
 *  upgrade? Per day: the splitter's paired steps (2->3, 1->2, 1->3) on the same decks without and with the hopper.
 *  The perk name in the heading comes from the game's perkAt (the harness names no perk itself). */
export function hopperSection(days: { day: number; hopperSplitter?: { with: FocusDeck[]; without: FocusDeck[] } }[]): string[] {
  const L: string[] = ["", `## SPLITTER with HOPPER ★3 (${perkAt("hopper", 3)}) on its turret (part 2, optional, report only)`, "",
    "Every bench deck (elites, par) holding a 1-star SPLITTER on a route into a turret, benched at splitter 1/2/3 stars as it is and with HOPPER ★3 as that turret's gear (budget ignored), same seeds. Mean paired step over decks, worse/decks.", "",
    "| day | decks | 1->2 without | 1->2 with HOPPER★3 | 2->3 without | 2->3 with HOPPER★3 | 1->3 without | 1->3 with HOPPER★3 |", "|---|---|---|---|---|---|---|---|"];
  const stepOf = (ds: FocusDeck[], a: number, b: number) => {
    const xs = ds.filter((f) => f.stars0 === 1 && f.pts[a - 1] !== null && f.pts[b - 1] !== null).map((f) => (f.pts[b - 1]! - f.pts[a - 1]!) / f.n);
    return xs.length ? `${sgn(xs.reduce((s, x) => s + x, 0) / xs.length)} (${xs.filter((x) => x < 0).length}/${xs.length})` : "n/a";
  };
  for (const d of days) {
    const h = d.hopperSplitter;
    if (!h) continue;
    const n = new Set(h.without.map((f) => f.tag)).size;
    L.push(`| ${d.day} | ${n} | ${stepOf(h.without, 1, 2)} | ${stepOf(h.with, 1, 2)} | ${stepOf(h.without, 2, 3)} | ${stepOf(h.with, 2, 3)} | ${stepOf(h.without, 1, 3)} | ${stepOf(h.with, 1, 3)} |`);
  }
  return L;
}

/** Part 2: the six 0.6.1p perk modules (pending at bf779de, live at c432bee). */
export const PERK_DEFS: readonly string[] = ["longhaul", "coil", "splitter", "overdrive", "press", "chamber"];

/** Part 2: BEFORE/AFTER. Each perk module's star rows in a `before` run (output-h2's full bf779de run) beside an
 *  `after` run (c432bee), matched by day, def and star; a row missing on one side reads "—". */
export function beforeAfterSection(before: { day: number; bench?: BenchRow[] }[], after: { day: number; bench?: BenchRow[] }[], defs: readonly string[] = PERK_DEFS, labels = ["bf779de", "c432bee"]): string[] {
  const days = [...new Set([...before, ...after].map((d) => d.day))].sort((a, b) => a - b);
  const find = (runs: { day: number; bench?: BenchRow[] }[], day: number, def: string, star: number) => runs.find((d) => d.day === day)?.bench?.find((r) => r.def === def && r.star === star);
  const cell = (r: BenchRow | undefined) => (r ? `${r.n} | ${r.n ? sgn(r.delta) : "n/a"}${r.ci ? ` [${sgn(r.ci[0])}, ${sgn(r.ci[1])}]` : ""} | ${r.flags.join(", ") || "-"}` : "— | — | —");
  const L: string[] = ["", `## BEFORE/AFTER: the six perk modules' star rows, ${labels[0]} (before) beside ${labels[1]} (after)`, "",
    `Before: their star values were pending at ${labels[0]} (not applied), after: applied (0.6.1p). Cells: decks | mean paired delta [95% t] | flags.`, "",
    `| def | star | day | ${labels[0]} decks | ${labels[0]} delta | ${labels[0]} flags | ${labels[1]} decks | ${labels[1]} delta | ${labels[1]} flags | ${labels[1]} perk | ${labels[1]} STEP 3-2 |`,
    "|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const def of defs) {
    for (const star of [2, 3]) {
      for (const day of days) {
        const b = find(before, day, def, star), a = find(after, day, def, star);
        if (!a && !b) continue;
        const st = a?.step ? (a.step.n ? `${sgn(a.step.mean)} (${a.step.worse}/${a.step.n})` : "n/a") : "-";
        L.push(`| ${def} | ${star} | ${day} | ${cell(b)} | ${cell(a)} | ${a?.perk ?? "-"} | ${st} |`);
      }
    }
  }
  return L;
}
