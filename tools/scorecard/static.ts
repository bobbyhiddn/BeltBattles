// SC-TOOL --static (rules and catalogue; seconds): catalogue sizes, merge multipliers, warlord gold ratios and the
// Hard part pick, early-loss stakes through the real day loop, the dark wind from the battle loop, and the dusk
// stand-ins' spend through standInFoe. Every number comes from the game's own functions and constants.

import { ITEMS, WIND_START, WIND_WARN, BATTLE_CAP, RUN_DAYS, START_LIVES, incomeFor, type HeroId } from "../../src/sim/content";
import { Battle, type SideStats } from "../../src/sim/battle";
import { cloneBuild, turretsCost, type Build } from "../../src/sim/deck";
import { PLAYABLE_HEROES } from "../../src/sim/heroBuilds";
import { DIFFICULTIES, deckCost, rivalDays, warlordPool, type Difficulty, type RivalId } from "../../src/sim/rivals";
import { buildCost, maxGoldByDay } from "../../src/net/validate";
import { newRun, type Run } from "../../src/game/run";
import { finishDay, startDusk } from "../../src/game/day";
import { forkFor, pickRoad, warlordDeck, warlordReward } from "../../src/game/road";
import { choicesFor } from "../../src/game/events";
import { standInFoe } from "../../src/game/ghosts";
import { heroCatalogue, type HeroCatalogue } from "./catalogue";
import { allPartMerges, type PartMerge } from "./merge";
import { mdTable, row, type Row, type Section } from "./report";
import { cmpOf, fmt, meets, rangeOf, type Target } from "./targets";

export interface StaticOpts { poolRuns: number; standinSeeds: number }

const names = (defs: readonly string[]): string => defs.join(", ");

// ---------------------------------------------------------------- catalogue

function catalogueRows(targets: Target[], o: StaticOpts, rows: Row[], sections: Section[]): HeroCatalogue[] {
  const cats = PLAYABLE_HEROES.map((h) => heroCatalogue(h, o.poolRuns));
  const act = rangeOf(cats.map((c) => c.active.total));
  rows.push(row(targets, "catalogue-active-pool", act, "parts",
    [cats.map((c) => `${c.hero.toUpperCase()} ${c.active.total} (${c.active.modules.length} modules + ${c.active.turrets.length} turrets)`).join("; ") + ".",
      `Modules alone: ${names([...new Set(cats.map((c) => String(c.active.modules.length)))])}.`,
      cats.some((c) => c.neverOffered.length) ? `Sold but never offered: ${names([...new Set(cats.flatMap((c) => c.neverOffered))])}.` : "Every buyable part is offered on some day 1-10.",
      `Supplies offered but not counted: ${names([...new Set(cats.flatMap((c) => c.supplies))])}.`],
    cats.map((c) => ({ hero: c.hero, modules: c.active.modules, turrets: c.active.turrets, total: c.active.total, neverOffered: c.neverOffered })), 0));
  const d1 = rangeOf(cats.map((c) => c.day1.parts.length));
  rows.push(row(targets, "catalogue-day1-pool", d1, "parts",
    [cats.map((c) => `${c.hero.toUpperCase()} ${c.day1.parts.length} (${c.day1.modules} modules + ${c.day1.turrets} turrets)`).join("; ") + ".",
      cats.every((c) => c.day1.parts.join() === cats[0].day1.parts.join()) ? "The same set for every hero (the caravan is hero-blind)." : "The sets differ by hero."],
    cats.map((c) => ({ hero: c.hero, parts: c.day1.parts })), 0));
  const st = rangeOf(cats.map((c) => c.steps.length));
  rows.push(row(targets, "catalogue-gating-steps", st, "steps",
    [cats.map((c) => `${c.hero.toUpperCase()}: ${c.steps.map((s) => `day ${s.day} (+${s.unlocks.length})`).join(", ") || "none"}`).join("; ") + "."],
    cats.map((c) => ({ hero: c.hero, steps: c.steps })), 0));
  for (const c of cats) {
    sections.push({
      title: `Catalogue per day, ${c.hero.toUpperCase()} (${c.caravansPerDay} dawn caravans per day, rerolls 0)`,
      lines: [
        ...mdTable(["day", "offerable parts", "modules", "turrets", "rarest part (caravans offering it)"],
          c.perDay.map((d) => [d.day, d.parts, d.modules, d.turrets, d.rarest ? `${d.rarest.def} (${d.rarest.caravans})` : "-"])),
        "",
        ...mdTable(["unlock day", "parts that join the pool"], c.steps.map((s) => [s.day, s.unlocks.map((d) => `${d} (${rarityOf(d)})`).join(", ")])),
      ],
    });
  }
  return cats;
}

const rarityOf = (d: string): string => `${ITEMS[d]?.rarity ?? "?"}, ${ITEMS[d]?.merchant ?? "?"}`;

// ---------------------------------------------------------------- merges

function mergeRows(targets: Target[], rows: Row[], sections: Section[]): PartMerge[] {
  const parts = allPartMerges();
  const byTarget = (id: string, pick: (p: PartMerge) => number | null, label: string) => {
    const t = targets.find((x) => x.id === id);
    const c = t ? cmpOf(t) : null;
    const num = parts.filter((p) => pick(p) !== null);
    const vals = num.map((p) => pick(p)!);
    const out = c ? num.filter((p) => !meets(c, pick(p)!)) : [];
    const sorted = [...vals].sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN;
    const qual = parts.filter((p) => pick(p) === null);
    rows.push(row(targets, id, rangeOf(vals), `x (${label}, over ${num.length} parts)`,
      [`Median x${fmt(med)}; ${num.length - out.length} of ${num.length} parts inside.`,
        out.length ? `Outside: ${out.map((p) => `${p.id} x${fmt(pick(p))}`).join(", ")}.` : "",
        qual.length ? `No numeric main effect (qualitative, listed in the detail): ${qual.map((p) => p.id).join(", ")}.` : ""].filter(Boolean),
      num.map((p) => ({ id: p.id, main: p.main.label, value: pick(p) }))));
  };
  byTarget("merge-2star-multiplier", (p) => p.main.r2, "main effect at 2 stars / 1 star");
  byTarget("merge-3star-multiplier", (p) => p.main.r3, "main effect at 3 stars / 1 star");
  // the step cap: every part's largest main-effect step; every field's step above x2.0 is listed too
  const stepT = targets.find((x) => x.id === "merge-step-cap");
  const stepC = stepT ? cmpOf(stepT) : null;
  const withStep = parts.filter((p) => p.main.step !== null);
  const over = stepC ? withStep.filter((p) => !meets(stepC, p.main.step!)) : [];
  const anyField = parts.filter((p) => p.steps.length);
  rows.push(row(targets, "merge-step-cap", rangeOf(withStep.map((p) => p.main.step!)), "x (largest main-effect step, 1->2 or 2->3)",
    [over.length ? `Main-effect steps above x2.0: ${over.map((p) => `${p.id} x${fmt(p.main.step)}`).join(", ")}.` : "No main-effect step above x2.0.",
      anyField.length ? `Any-field steps above x2.0: ${anyField.map((p) => `${p.id} (${p.steps.map((s) => `${s.path} x${fmt(s.step)}`).join(", ")})`).join("; ")}.` : "No field steps above x2.0."],
    withStep.map((p) => ({ id: p.id, step: p.main.step, fieldSteps: p.steps }))));
  sections.push({
    title: "Merge multipliers per part (main effect; effect ratios)",
    lines: [
      "Effect = the number read as its kind (targets.ts EffectKind): an interval or cooldown as a rate (1/x), a multiplier as its bonus above x1, a cut as the share taken off. `value` is the plain ratio with times read as rates (the brief's rule), `effect` is the headline reading.",
      "",
      ...mdTable(["part", "kind", "rarity", "main effect", "x2/x1", "x3/x1", "largest step", "other star-scaled numbers (effect x2 / x3; value x2 / x3)", "qualitative (words)"],
        parts.map((p) => [
          `${p.id} (${p.name})`, p.kind, p.rarity, p.main.label + (p.main.auto ? " (auto)" : ""), fmt(p.main.r2), fmt(p.main.r3), fmt(p.main.step),
          p.fields.map((f) => `${f.path} ${f.v.join("/")}: ${fmt(f.effect[0])}/${fmt(f.effect[1])}${f.kind !== "amount" ? ` (${f.kind}; value ${fmt(f.value[0])}/${fmt(f.value[1])})` : ""}`).join("; "),
          [p.main.words, ...p.qualitative].filter(Boolean).join("; "),
        ])),
    ],
  });
  return parts;
}

// ---------------------------------------------------------------- warlord rewards

function pveRows(targets: Target[], rows: Row[], sections: Section[]): void {
  interface Pay { tier: string; day: number; gold: number[]; income: number; dawn: number; ratio: number; ratioDawn: number; captains: string[] }
  const pays: Pay[] = [];
  const dawnGold = (day: number): number => maxGoldByDay(day) - (day > 1 ? maxGoldByDay(day - 1) : 0);
  const tiers: { tier: string; ids: RivalId[]; slot: Difficulty }[] = [
    ...DIFFICULTIES.map((d) => ({ tier: d, ids: warlordPool(d), slot: d })),
    { tier: "matriarch", ids: ["matriarch" as RivalId], slot: "hard" as Difficulty },
  ];
  for (const t of tiers) {
    for (let day = 1; day <= RUN_DAYS; day++) {
      const ids = t.ids.filter((id) => rivalDays(id).includes(day));
      if (!ids.length) continue;
      const gold = ids.map((id) => warlordReward(id, t.slot, warlordDeck(id, day), day, day).gold);
      const g = Math.max(...gold);
      pays.push({ tier: t.tier, day, gold: [...new Set(gold)], income: incomeFor(day, true), dawn: dawnGold(day), ratio: g / incomeFor(day, true), ratioDawn: g / dawnGold(day), captains: ids });
    }
  }
  const t = targets.find((x) => x.id === "pve-gold-ratio");
  const c = t ? cmpOf(t) : null;
  const out = c ? pays.filter((p) => !meets(c, p.ratio)) : [];
  const outDawn = c ? pays.filter((p) => !meets(c, p.ratioDawn)) : [];
  rows.push(row(targets, "pve-gold-ratio", rangeOf(pays.map((p) => p.ratio)), "(reward gold / incomeFor(day, win))",
    ["Divides by a dusk win's income that day, incomeFor(day, true).",
      out.length ? `Outside: ${summarizeTierDays(out)}.` : "Every tier-day inside.",
      `Beside it, dividing by the gold that arrives for that day's caravan (START_GOLD on day 1, else the previous dusk's win income: ${[...new Set(pays.map((p) => `${p.day}:${p.dawn}`))].sort((a, b) => Number(a.split(":")[0]) - Number(b.split(":")[0])).map((s) => s.split(":")[1]).join(", ")}, the list in the target's unit): ${fmt(Math.min(...pays.map((p) => p.ratioDawn)))} to ${fmt(Math.max(...pays.map((p) => p.ratioDawn)))}, ${outDawn.length ? `outside: ${summarizeTierDays(outDawn, true)}` : "all inside"}.`,
      "Gold only: Hard's part and the Matriarch's legendary part are not in the ratio. Hard captains on days 8-10 need the Matriarch beaten first (warlordOffer R3)."],
    pays));
  sections.push({
    title: "Warlord gold per tier and day (warlordReward on each captain's warlordDeck)",
    lines: mdTable(["tier", "day", "gold", "incomeFor(day, win)", "ratio", "dawn gold", "ratio (dawn gold)", "captains"],
      pays.map((p) => [p.tier, p.day, p.gold.join("/"), p.income, fmt(p.ratio), p.dawn, fmt(p.ratioDawn), p.captains.join(", ")])),
  });
  // the Hard pick
  interface Pick { id: string; day: number; parts: string[]; own: number }
  const picks: Pick[] = [];
  for (const id of warlordPool("hard")) {
    for (const day of rivalDays(id)) {
      const deck = warlordDeck(id, day);
      const r = warlordReward(id, "hard", deck, day, day);
      const defs = new Set([...deck.items.map((p) => p.def), ...deck.mods.map((m) => m.def)]);
      picks.push({ id, day, parts: r.parts, own: r.parts.filter((p) => defs.has(p)).length });
    }
  }
  const mat = rivalDays("matriarch").map((day) => ({ day, r: warlordReward("matriarch", "hard", warlordDeck("matriarch", day), day, day) }));
  const later = picks.filter((p) => p.own < p.parts.length);
  rows.push(row(targets, "pve-part-pick", rangeOf(picks.map((p) => p.parts.length)), "parts per Hard win (take 1)",
    [`${picks.length} Hard captain-days (${warlordPool("hard").join(", ")}; days 1-10). Source: road.ts hardParts, the fought deck's most valuable distinct parts.`,
      later.length ? `Filled from the captain's later decks on ${later.length}: ${later.map((p) => `${p.id} d${p.day}`).join(", ")}.` : "Every offered part comes from the fought deck.",
      `The Iron Matriarch (Hard slot days ${rivalDays("matriarch").join("-")} until beaten) pays ${[...new Set(mat.map((m) => m.r.gold))].join("/")} gold and ${[...new Set(mat.map((m) => m.r.parts.length))].join("/")} legendary part, taken without a pick: not counted here.`],
    { picks, matriarch: mat.map((m) => ({ day: m.day, gold: m.r.gold, parts: m.r.parts, legendary: m.r.legendary })) }, 0));
}

function summarizeTierDays(ps: { tier: string; day: number; ratio: number; ratioDawn: number }[], dawn = false): string {
  const by = new Map<string, string[]>();
  for (const p of ps) by.set(p.tier, [...(by.get(p.tier) ?? []), `d${p.day} ${fmt(dawn ? p.ratioDawn : p.ratio)}`]);
  return [...by].map(([t, xs]) => `${t} ${xs.join(" ")}`).join("; ");
}

// ---------------------------------------------------------------- early stakes (the real day loop)

/** A fresh side's stats (all zero), read from the battle so the shape follows battle.ts. */
function zeroStats(b: Build): SideStats {
  return { ...new Battle(b, b, 1).sides[0].stats };
}

interface Scripted { name: string; lives: number[]; end: number; refund?: { day: number; lives: number }; run: Run }

/** Play the day loop for a scripted run: each dusk from day.ts startDusk (no ghost pool: the stand-in) and finishDay
 *  with the scripted outcome. lives[i] = lives at the dawn of day i + 1 (the run's end appended as `end`). */
function scripted(hero: HeroId, seed: number, name: string, lose: (day: number) => boolean, extraLives = 0, stopAtDawn = RUN_DAYS + 1): Scripted {
  const run = newRun(hero, seed, `sc-stakes-${seed}`);
  run.lives += extraLives;
  const lives = [run.lives];
  const z = zeroStats(run.build);
  for (let day = 1; day <= RUN_DAYS && !run.over && run.day < stopAtDawn; day++) {
    startDusk(run, []);
    finishDay(run, lose(day) ? 1 : 0, 20, { ...z }, { ...z });
    if (!run.over) lives.push(run.lives);
  }
  return { name, lives, end: run.lives, refund: run.refund, run };
}

function stakesRows(targets: Target[], rows: Row[], sections: Section[]): void {
  const hero = PLAYABLE_HEROES[0], seed = 20260926;
  const win = scripted(hero, seed, "win every day", () => false);
  const l1 = scripted(hero, seed, "lose day 1 only", (d) => d === 1);
  const l2 = scripted(hero, seed, "lose day 2 only", (d) => d === 2);
  const l12 = scripted(hero, seed, "lose days 1 and 2", (d) => d <= 2);
  const l3 = scripted(hero, seed, "lose day 3 only", (d) => d === 3);
  const all = [win, l1, l2, l12, l3];
  const at = (s: Scripted, dawn: number) => s.lives[dawn - 1];
  const net1 = at(win, 3) - at(l1, 3), net2 = at(win, 3) - at(l2, 3);
  rows.push(row(targets, "early-stakes-first-loss-net", rangeOf([net1, net2]), "net lives (at the dawn of day 3)",
    [`A first loss on day 1 costs ${net1} net life by dawn 3 and ${win.end - l1.end} by the run's end; on day 2, ${net2} and ${win.end - l2.end}.`,
      `Losing days 1 and 2 costs ${at(win, 3) - at(l12, 3)} by dawn 3; losing day 3 costs ${at(win, 4) - at(l3, 4)} by dawn 4.`],
    all.map((s) => ({ script: s.name, dawnLives: s.lives, end: s.end, refund: s.refund ?? null })), 0));
  const share = (at(win, 3) - at(l1, 3)) / START_LIVES;
  rows.push(row(targets, "early-stakes-day1-share", share, "of START_LIVES",
    [`One day-1 loss: ${at(win, 3) - at(l1, 3)} net of ${START_LIVES} lives at dawn 3 (the refund gives it back: day.ts earlyLossRefund).`]));
  sections.push({
    title: `Lives at each dawn, scripted outcomes (day.ts startDusk + finishDay, ${hero.toUpperCase()} seed ${seed})`,
    lines: mdTable(["script", ...Array.from({ length: RUN_DAYS }, (_, i) => `dawn ${i + 1}`), "after day 10", "refund"],
      all.map((s) => [s.name, ...Array.from({ length: RUN_DAYS }, (_, i) => s.lives[i] ?? "-"), s.end, s.refund ? `day ${s.refund.day}: +${s.refund.lives}` : "-"])),
  });
  // last chance: drop to 1 life (win days 1-2, lose days 3-6), then compare that dawn with runs 1-4 lives richer
  const lose36 = (d: number) => d >= 3 && d <= 6;
  const dawn = 7;
  const one = scripted(hero, seed, "1 life", lose36, 0, dawn);
  const view = (s: Scripted) => {
    const r = JSON.parse(JSON.stringify(s.run)) as Run;
    const road = JSON.parse(JSON.stringify(r)) as Run;
    pickRoad(road, "event");
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) if (k !== "lives") flat[`run.${k}`] = JSON.stringify(v);
    flat["road.fork"] = JSON.stringify(forkFor(r));
    flat["road.event choices"] = JSON.stringify(choicesFor(road).map((c) => ({ label: c.label, blocked: c.blocked ?? null })));
    return flat;
  };
  const base = view(one);
  const diffs = [1, 2, 3, 4].map((k) => {
    const c = scripted(hero, seed, `${1 + k} lives`, lose36, k, dawn);
    const v = view(c);
    return { lives: c.run.lives, differ: Object.keys(base).filter((key) => base[key] !== v[key]) };
  });
  const lastLife = diffs[0].differ.length;
  rows.push(row(targets, "early-stakes-last-chance", lastLife, "rules that act on the dawn at 1 life",
    [`The dawn after dropping to 1 life (day ${dawn}, ${one.run.lives} life) matches a run 1 life richer in gold, caravan, cargo, deck, next shop, road fork and event choices${lastLife ? ` except: ${diffs[0].differ.join(", ")}` : ""}.`,
      `Against 3-5 lives: ${diffs.slice(1).map((d) => `${d.lives} lives ${d.differ.length ? `differs in ${d.differ.join(", ")}` : "same"}`).join("; ")}.`,
      "0.6.2 ships the early-loss refund instead (the genre study: test one cushion, not both), so 0 is the expected reading."],
    { dawn, oneLife: one.run.lives, controls: diffs }, 0));
}

// ---------------------------------------------------------------- the dark wind (the battle loop)

function windRows(targets: Target[], rows: Row[], sections: Section[]): void {
  // two unarmed hulls (the starting deck with no factory, rig or belt): the only damage is the dark wind
  const b0 = cloneBuild(newRun(PLAYABLE_HEROES[0], 1, "sc-wind").build);
  const bare: Build = { ...b0, items: [], routes: [], mods: [] };
  const bt = new Battle(bare, bare, 1);
  let onset = NaN, warn = NaN;
  // cumulative wind damage at each whole 5 s mark; a block's dps is its damage / 5 (exact, whatever the tick phase)
  const marks: { t: number; taken: number; hp: number }[] = [{ t: 0, taken: 0, hp: bt.sides[0].hull.hp }];
  while (!bt.over && bt.t < BATTLE_CAP + 1) {
    bt.step();
    for (const e of bt.events) if (e.type === "windwarn" && Number.isNaN(warn)) warn = bt.t;
    bt.events.length = 0;
    const s = bt.sides[0];
    if (Number.isNaN(onset) && s.stats.windTaken > 0) onset = bt.t;
    const next = marks[marks.length - 1].t + 5;
    if (bt.t >= next - 1e-6) marks.push({ t: next, taken: s.stats.windTaken, hp: s.hull.hp });
  }
  const blocks = marks.slice(1).map((m, i) => ({ from: marks[i].t, to: m.t, dps: (m.taken - marks[i].taken) / 5, taken: m.taken, hp: m.hp }));
  const first = blocks.find((b) => b.dps > 0);
  const onset1 = Math.round(onset * 10) / 10;
  rows.push(row(targets, "fight-overtime-onset", onset1, "s (first wind damage, +-1 tick)",
    [`battle.ts, two unarmed hulls: the warning at ${fmt(warn, 1)} s (WIND_WARN ${WIND_WARN}), damage from ${fmt(onset1, 1)} s (WIND_START ${WIND_START}): ${blocks.filter((b) => b.dps > 0).slice(0, 5).map((b) => `${b.from}-${b.to} s ${fmt(b.dps, 1)}/s`).join(", ")}, then +1/s every 5 s.`,
      `Read as "the first escalation" (damage rising above its first step, ${first ? fmt(first.dps, 1) : "?"}/s), it is ${first ? first.to : "?"} s.`],
    { warn, onset, blocks }, 1));
  sections.push({
    title: "The dark wind on two unarmed hulls (battle.ts; each 5 s block's damage / 5)",
    lines: mdTable(["from (s)", "to (s)", "wind dps", "wind damage so far", "hull left"], blocks.map((b) => [b.from, b.to, fmt(b.dps, 1), fmt(b.taken, 1), fmt(b.hp, 1)])),
  });
}

// ---------------------------------------------------------------- stand-in spend (standInFoe)

export interface ServedDeck { key: string; hero: HeroId; build: Build; served: number; captains: string[] }

/** The distinct decks standInFoe serves on `day` over run seeds 1..n, with how often each is served. */
export function servedStandIns(day: number, n: number): { decks: ServedDeck[]; lastNew: number } {
  const by = new Map<string, ServedDeck>();
  let lastNew = 0;
  for (let s = 1; s <= n; s++) {
    const f = standInFoe(s, day);
    const key = JSON.stringify(f.build);
    let d = by.get(key);
    if (!d) {
      d = { key, hero: f.hero, build: f.build, served: 0, captains: [] };
      by.set(key, d);
      lastNew = s;
    }
    d.served++;
    if (!d.captains.includes(f.name)) d.captains.push(f.name);
  }
  return { decks: [...by.values()], lastNew };
}

function fillerRows(targets: Target[], o: StaticOpts, rows: Row[], sections: Section[]): void {
  interface D { day: number; hero: string; cost: number; share: number; served: number; captains: string; mismatch: boolean }
  const all: D[] = [];
  const perDay: { day: number; decks: number; lastNew: number; min: number; budget: number }[] = [];
  for (let day = 1; day <= RUN_DAYS; day++) {
    const { decks, lastNew } = servedStandIns(day, o.standinSeeds);
    const budget = maxGoldByDay(day);
    const ds = decks.map((d) => {
      const cost = deckCost(d.build).total + turretsCost(d.build);
      const captains = d.captains.length <= 3 ? d.captains.join("/") : `${d.captains.length} ${d.hero} captains`;
      return { day, hero: d.hero, cost, share: cost / budget, served: d.served, captains, mismatch: cost !== buildCost(d.build).total };
    });
    all.push(...ds);
    perDay.push({ day, decks: ds.length, lastNew, min: Math.min(...ds.map((d) => d.share)), budget });
  }
  const t = targets.find((x) => x.id === "filler-budget-share");
  const c = t ? cmpOf(t) : null;
  const low = c ? all.filter((d) => !meets(c, d.share)) : [];
  const mism = all.filter((d) => d.mismatch);
  rows.push(row(targets, "filler-budget-share", rangeOf(all.map((d) => d.share)), "of maxGoldByDay(day)",
    [`${all.length} distinct decks served by standInFoe over run seeds 1-${o.standinSeeds} per day. Minimum per day: ${perDay.map((p) => `d${p.day} ${fmt(p.min)}`).join(", ")}.`,
      low.length ? `Below the floor: ${low.map((d) => `d${d.day} ${d.hero} ${d.cost}g ${fmt(d.share)} (${d.captains})`).join("; ")}.` : "No deck below the floor.",
      mism.length ? `deckCost + turretsCost differs from buildCost on ${mism.length} decks.` : "Cost = rivals.ts deckCost + deck.ts turretsCost, equal to net/validate.ts buildCost on every deck."],
    { perDay, decks: all }));
  sections.push({
    title: `Dusk stand-in decks per day (standInFoe over run seeds 1-${o.standinSeeds})`,
    lines: [
      ...mdTable(["day", "budget", "distinct decks", "last new deck at seed", "lowest share"], perDay.map((p) => [p.day, p.budget, p.decks, p.lastNew, fmt(p.min)])),
      "",
      ...mdTable(["day", "hero", "cost", "share", "served", "captains"], all.map((d) => [d.day, d.hero, d.cost, fmt(d.share), d.served, d.captains])),
    ],
  });
}

export function staticMode(targets: Target[], o: StaticOpts): { rows: Row[]; sections: Section[] } {
  const rows: Row[] = [], sections: Section[] = [];
  catalogueRows(targets, o, rows, sections);
  mergeRows(targets, rows, sections);
  pveRows(targets, rows, sections);
  stakesRows(targets, rows, sections);
  windRows(targets, rows, sections);
  fillerRows(targets, o, rows, sections);
  return { rows, sections };
}
