// D1 M5 (REQ-BFG-024, REQ-BFG-011, REQ-BFG-033 part 3): the new NPCs' named builds as day 1-10 purchase plans, and the
// check every plan must pass. A plan is what the captain buys each day from its caravans; N1 grows it into real decks
// (rivalBuilds.ts PLANS form: cells, belts, rotations). Like tests/captains.luck.test.ts, every deck it implies is
// checked against its luck tier's caps (src/sim/harness/luckCapsData.ts: ORDINARY = the par field's P50, GOOD = P90;
// FOUNDRY and BASTION have no par field yet, so each cap is the lower of FURNACE's and WEAVER's), the stand-in deck (the
// plan at ordinary luck, plus its whole ramp plating) against maxGoldByDay, and every purchase against the first day the
// caravan can offer it under the proposed draw (epics from day 2, the ARCANE DEALER from day 3, legendaries from day 4).
// Wave-3 parts need tools/wave3.ts's catalogue installed (withCatalogue("wave3")) for their prices and rarities.

import { HEROES, ITEMS, RUN_DAYS, type HeroId, type Rarity } from "../src/sim/content";
import { LUCK_CAPS } from "../src/sim/harness/luckCapsData";
import type { LuckMeasures } from "../src/sim/harness/luck";
import { maxGoldByDay } from "../src/net/validate";
import { rampPlates } from "../src/sim/rivals";
import { DRAW, type Fam } from "./wave3";

/** One purchase: its def, the day an ORDINARY-luck caravan brings it (null: only good luck does), and the day a GOOD-
 *  luck caravan brings it (absent: the same day). A copy of an owned part merges (1+1 = ★2, 2+2 = ★3). */
export interface NpcBuy {
  def: string;
  at: number | null;
  good?: number;
}

export type Tier = "easy" | "medium" | "hard";

export interface NpcPlan {
  id: string;
  name: string; // all caps, at most 14 characters (rivals.ts RivalDef)
  hero: HeroId;
  role: "warlord" | "standin"; // a warlord also stands in at dusk (the captains' two jobs); a stand-in never rides the road
  tier: Tier | null; // the warlord slot (null for a stand-in)
  trick: string; // the NEXT BATTLE panel title
  blurb: string; // the panel line
  portrait: string; // the one feature the artist builds the face around (DESIGN.md's style)
  palette: string[]; // 3-4 names from src/render/palette.ts
  families: Fam[];
  synergy: string[]; // the parts its blurb promises (REQ-BFG-024's synergy check swaps them)
  prize: string; // what beating it pays (DESIGN.md decision 3)
  buys: NpcBuy[];
}

const B = (def: string, at: number | null, good?: number): NpcBuy => ({ def, at, ...(good !== undefined ? { good } : {}) });

export const NPCS: readonly NpcPlan[] = [
  {
    id: "brasswick", name: "BRASSWICK", hero: "foundry", role: "warlord", tier: "easy",
    trick: "MATCHED POUR", blurb: "TWO MIRRORED BELTS, A GAUGE ON EACH. EVERY POUR FUSES.",
    portrait: "a young guild gauger with a brass twin-dial gauge strapped over both eyes like goggles",
    palette: ["brass2", "steel2", "bone", "lime"], families: ["TWIN", "FORGE"],
    synergy: ["twingauge", "twinmould", "twintrigger"], prize: "+2 gold, +3 from day 4 (the Easy rule)",
    buys: [
      B("twingauge", 1), B("whetstone", 2), B("twinmould", 3), B("twingauge", 4), B("twintrigger", 5), B("pincer", 6),
      B("temper", 6), B("seamwelder", 7), B("twinmould", 8), B("twintrigger", 9), B("longhaul", 10),
    ],
  },
  {
    id: "voss", name: "MASTER VOSS", hero: "foundry", role: "warlord", tier: "hard",
    trick: "LOCKSTEP", blurb: "LATCHED TWIN LINES INTO PACKED SHELLS. EVERY PAIR HITS HARDER.",
    portrait: "a stern guildmaster wearing a twin-chained pocket watch as a medal, its two lids snapping shut together",
    palette: ["brass3", "ink", "steel1", "amber"], families: ["TWIN", "BURST"],
    synergy: ["twinlatch", "twintrigger", "compound"], prize: "+3 gold and a pick of TWIN LATCH or TWIN TRIGGER (the Hard rule)",
    buys: [
      // bb-0.8.6 (job PACKS M4, the packs' regenerated caps): the COMPOUND BREECH at ordinary luck on day 7 (was 6; no
      // ordinary epic before day 7), the SEAM WELDER at good luck on day 6 (was 5; good rare+ cap 4 on day 5) and the
      // RAILGUN on day 9 (was 8; no good-luck turret before day 9)
      B("twingauge", 1), B("whetstone", 1), B("twinlatch", 2), B("twintrigger", 3), B("twinmould", 4, 3), B("twingauge", 5),
      B("compound", 7, 4), B("seamwelder", 7, 6), B("twintrigger", 8, 6), B("pincer", 7), B("twinlatch", null, 7),
      B("railgun", null, 9), B("twinmould", 10, 9), B("quench", null, 10),
    ],
  },
  {
    id: "grimhold", name: "GRIMHOLD", hero: "bastion", role: "warlord", tier: "medium",
    trick: "ANVIL WALL", blurb: "PLATED TO THE BRIM. EVERY SHOT HITS AS HARD AS THE PLATE IS THICK.",
    portrait: "a broad dwarf in an anvil-shaped iron helm, his beard braided through hot rivets",
    palette: ["steel3", "rust2", "fire3", "bone"], families: ["PLATE", "BURST"],
    synergy: ["plateroller", "anvil", "spallcatcher"], prize: "+4 gold (the Medium rule)",
    buys: [
      B("plateroller", 1), B("tollbooth", 1), B("anvil", 2), B("whetstone", 3), B("braceframe", 3), B("plateroller", 4),
      // bb-0.8.3 (job BELTS run 4): the ARMOR PRESS on day 6 (was 5): the caps regenerated with the par player buying its
      // gold upgrades give no ordinary epic on day 5
      // bb-0.8.6 (job PACKS M4): the ARMOR PRESS on day 7 (was 6; no ordinary epic before day 7), the heat jacket on day 9
      // (was 8; rare+ cap 5 on day 8) and no PLATE BREAKER (was day 10: one ordinary epic+ on every day)
      B("spallcatcher", 4), B("armorpress", 7), B("anvil", 6), B("quench", 7), B("temper", 7), B("heatjacket", 9),
      B("spallcatcher", 9),
    ],
  },
  {
    id: "karsk", name: "THANE KARSK", hero: "bastion", role: "warlord", tier: "hard",
    trick: "SHIELD WALL", blurb: "A WALL OF PLATE ON EVERY BELT. HE BREAKS HIS OWN ARMOR INTO YOUR HULL.",
    portrait: "a grey-bearded thane behind a riveted tower shield, a plate-breaking hammer on one shoulder",
    palette: ["steel1", "steel3", "brass1", "rust3"], families: ["PLATE", "FORGE"],
    synergy: ["shieldwall", "platebreaker"], prize: "+3 gold and a pick of BRACE FRAME or SPALL CATCHER (the Hard rule)",
    buys: [
      // bb-0.8.3 (job BELTS run 4): the PLATE BREAKER at good luck on day 6 (was 5), its ordinary day, and the ARMOR PRESS
      // at ordinary luck on day 10 (was 9; good luck's day 8 kept): the regenerated caps give one epic+ to good luck on
      // day 5 and to ordinary luck on day 9
      // bb-0.8.6 (job PACKS M4): the PLATE BREAKER on day 7 (was 6; no ordinary epic before day 7, one good-luck epic+ on
      // day 6)
      // bb-0.8.6 (job PACKS run 2; oracle 47d683ef9b959301 (1)): no ARMOR PRESS (was good luck only, day 9): the ordinary
      // cap never holds it, and at good luck it can't fit on days 9-10 beside the SHIELD WALL and the PLATE BREAKER (GOOD
      // epic+ cap 2), so it left his plan and his synergy list
      B("plateroller", 1), B("pincer", 1), B("braceframe", 2), B("steambreech", 3), B("temper", 3), B("shieldwall", null, 4),
      B("plateroller", 4), B("spallcatcher", 5), B("platebreaker", 7), B("braceframe", 7), B("quench", 7),
      B("platebreaker", null, 9), B("shieldwall", null, 10),
    ],
  },
  {
    id: "lockjaw", name: "LOCKJAW", hero: "furnace", role: "standin", tier: null,
    trick: "TWIN BITE", blurb: "KILN AND MOULD, LATCHED SO THEIR SLUGS LAND TOGETHER.",
    portrait: "an orc whose iron jaw-brace locks shut with a twin latch, two slugs clenched in his teeth",
    palette: ["rust2", "steel2", "brass2", "fire2"], families: ["TWIN", "FORGE"],
    synergy: ["twinlatch", "twinmould", "twingauge"], prize: "none (a dusk stand-in)",
    buys: [
      // bb-0.8.6 (job PACKS M4): the COMPOUND BREECH on day 7 (was 6; no ordinary epic before day 7)
      B("twingauge", 1), B("whetstone", 1), B("twinmould", 2), B("twinlatch", 3), B("twingauge", 4), B("temper", 4),
      B("twintrigger", 5), B("compound", 7), B("pincer", 7), B("quench", 7), B("twinlatch", 8), B("longhaul", 9),
      B("twintrigger", 9), B("bellows", 10),
    ],
  },
  {
    id: "thistlemail", name: "THISTLEMAIL", hero: "weaver", role: "standin", tier: null,
    trick: "LEAF MAIL", blurb: "EVERY THREAD PLATES HER HULL. PLATED, HER GUNS SPIN FASTER.",
    portrait: "an elf in a coat of overlapping silver leaves like scale mail, a thistle crown of steel pins",
    palette: ["verd2", "steel2", "white", "verd4"], families: ["PLATE", "TEMPO"],
    synergy: ["plateroller", "steambreech", "spallcatcher"], prize: "none (a dusk stand-in)",
    buys: [
      B("plateroller", 1), B("steambreech", 1), B("tollbooth", 2), B("whetstone", 2), B("braceframe", 3), B("plateroller", 4),
      // bb-0.8.6 (job PACKS M4): the PLATE BREAKER on day 9 (was 8; ordinary rare+ cap 5 on day 8)
      B("spallcatcher", 4), B("anvil", 5), B("seamwelder", 6), B("temper", 6), B("steambreech", 7), B("quench", 7),
      B("platebreaker", 9), B("spallcatcher", 9), B("bellows", 10),
    ],
  },
];

const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

/** The first day the caravan offers `def` under the proposed draw's ladder (wave3.ts DRAW: epics day 2, the ARCANE
 *  DEALER day 3, legendaries day 4; a late restock can only make it later for one run). */
export function firstOfferDay(def: string): number {
  const d = ITEMS[def];
  let u = d.rarity === "legendary" ? DRAW.legendaryDay : d.rarity === "epic" ? DRAW.epicDay : 1;
  if (d.merchant === "arcane") u = Math.max(u, DRAW.arcaneDay);
  return u;
}

export type Luck = "ordinary" | "good";
export const dayOf = (b: NpcBuy, luck: Luck): number | null => (luck === "good" ? b.good ?? b.at : b.at);

export interface NpcDeck {
  parts: { def: string; stars: number }[];
  value: number; // gold: every copy at its price (a merged part is worth its copies)
  measures: LuckMeasures; // luck.ts's measures of the plan's parts (value without plating)
}

/** The parts a plan owns at `luck` on `day`: copies 1 = ★1, 2 = ★2, 3 = ★2 + ★1, 4 = ★3 (the game's merge). */
export function npcDeck(plan: NpcPlan, day: number, luck: Luck): NpcDeck {
  const copies = new Map<string, number>();
  for (const b of plan.buys) {
    const d = dayOf(b, luck);
    if (d !== null && d <= day) copies.set(b.def, (copies.get(b.def) ?? 0) + 1);
  }
  const parts: { def: string; stars: number }[] = [];
  for (const [def, n] of copies) {
    let left = n;
    for (const s of [3, 2, 1]) while (left >= 2 ** (s - 1)) {
      parts.push({ def, stars: s });
      left -= 2 ** (s - 1);
    }
  }
  const value = [...copies].reduce((s, [def, n]) => s + ITEMS[def].price * n, 0);
  return {
    parts, value,
    measures: {
      value, star2: parts.filter((p) => p.stars === 2).length, star3: parts.filter((p) => p.stars >= 3).length,
      rare: parts.filter((p) => RANK[ITEMS[p.def].rarity] >= 1).length, epic: parts.filter((p) => RANK[ITEMS[p.def].rarity] >= 2).length,
      turrets: parts.filter((p) => ITEMS[p.def].kind === "turret").length,
    },
  };
}

const MEASURES: (keyof LuckMeasures)[] = ["value", "star2", "star3", "rare", "epic", "turrets"];

/** A hero-day's caps for `luck`: the lower of FURNACE's and WEAVER's (the race heroes have no par field yet). */
export function capsFor(day: number, luck: Luck): LuckMeasures {
  const f = LUCK_CAPS.caps.furnace![day - 1][luck], w = LUCK_CAPS.caps.weaver![day - 1][luck];
  return Object.fromEntries(MEASURES.map((k) => [k, Math.min(f[k], w[k])])) as unknown as LuckMeasures;
}

export interface NpcDayCheck {
  day: number;
  standIn: { value: number; budget: number; plates: number; over: string[] }; // ordinary luck plus ramp plating
  warlord: { luck: Luck; value: number; over: string[] } | null; // the road deck (no ramp plating: PvE hull)
  slots: string[]; // more cores than sockets or more gear than gear slots
}

/** Every day's check of a plan: [] problems everywhere means the plan is legal (`problems`). */
export function npcCheck(plan: NpcPlan): NpcDayCheck[] {
  const out: NpcDayCheck[] = [];
  const starting = HEROES[plan.hero].turrets.length;
  for (let day = 1; day <= RUN_DAYS; day++) {
    const so = npcDeck(plan, day, "ordinary");
    const plates = rampPlates(day);
    const sv = so.value + plates * ITEMS.plating.price;
    const cap = capsFor(day, "ordinary");
    const over = MEASURES.filter((k) => (k === "value" ? sv : so.measures[k]) > cap[k]).map((k) => `${k} ${k === "value" ? sv : so.measures[k]} > ${cap[k]}`);
    if (sv > maxGoldByDay(day)) over.push(`budget ${sv} > ${maxGoldByDay(day)}`);
    let warlord: NpcDayCheck["warlord"] = null;
    if (plan.role === "warlord") {
      const luck: Luck = plan.tier === "hard" ? "good" : "ordinary";
      const w = npcDeck(plan, day, luck), c = capsFor(day, luck);
      warlord = { luck, value: w.value, over: MEASURES.filter((k) => w.measures[k] > c[k]).map((k) => `${k} ${w.measures[k]} > ${c[k]}`) };
    }
    const slots: string[] = [];
    for (const luck of ["ordinary", "good"] as Luck[]) {
      const d = npcDeck(plan, day, luck);
      const turrets = starting + d.measures.turrets;
      const cores = d.parts.filter((p) => ITEMS[p.def].kind === "core").length;
      // gear slots: each starting turret is a common (1 slot), a bought turret its rarity's (+1 per star above 1)
      const gearSlots = starting + d.parts.filter((p) => ITEMS[p.def].kind === "turret").reduce((s, p) => s + 1 + RANK[ITEMS[p.def].rarity] + (p.stars - 1), 0);
      const gear = d.parts.filter((p) => ITEMS[p.def].kind === "mod").length;
      if (cores > turrets) slots.push(`${luck}: ${cores} cores for ${turrets} sockets`);
      if (gear > gearSlots) slots.push(`${luck}: ${gear} gear for ${gearSlots} gear slots`);
    }
    out.push({ day, standIn: { value: sv, budget: maxGoldByDay(day), plates, over }, warlord, slots });
  }
  return out;
}

/** Every problem of a plan: over a cap or the budget, a part bought before the caravan can offer it, a slot overfull,
 *  a better-luck day after the ordinary one, an unknown def, a name too long. */
export function problems(plan: NpcPlan): string[] {
  const p: string[] = [];
  if (plan.name.length > 14) p.push(`name ${plan.name} is over 14 characters`);
  for (const b of plan.buys) {
    if (!Object.prototype.hasOwnProperty.call(ITEMS, b.def) || !ITEMS[b.def].merchant) { p.push(`${b.def} is not caravan stock`); continue; }
    for (const luck of ["ordinary", "good"] as Luck[]) {
      const d = dayOf(b, luck);
      if (d !== null && d < firstOfferDay(b.def)) p.push(`${b.def} bought on day ${d} (${luck}), first offered on day ${firstOfferDay(b.def)}`);
    }
    if (b.good !== undefined && b.at !== null && b.good > b.at) p.push(`${b.def}: good luck's day ${b.good} is after ordinary luck's ${b.at}`);
  }
  for (const s of plan.synergy) if (!plan.buys.some((b) => b.def === s)) p.push(`synergy part ${s} is never bought`);
  for (const c of npcCheck(plan)) {
    for (const o of c.standIn.over) p.push(`stand-in d${c.day}: ${o}`);
    for (const o of c.warlord?.over ?? []) p.push(`warlord d${c.day} (${c.warlord!.luck}): ${o}`);
    for (const o of c.slots) p.push(`d${c.day}: ${o}`);
  }
  return p;
}

/** The plan as a markdown table: each day's purchases (ordinary; good luck's extra and sooner ones), the decks' gold. */
export function mdPlan(plan: NpcPlan): string[] {
  const name = (d: string) => ITEMS[d]?.name ?? d;
  const L = [`| day | buys (ordinary luck) | ${plan.tier === "hard" ? "good luck (the road deck) adds or brings sooner | " : ""}stand-in deck: parts + ${"plating"} = gold (budget) | ${plan.role === "warlord" ? "road deck gold | " : ""}2-star parts | rare+ / epic+ |`,
    `|---:|---|${plan.tier === "hard" ? "---|" : ""}---|${plan.role === "warlord" ? "---:|" : ""}---|---|`];
  const checks = npcCheck(plan);
  for (let day = 1; day <= RUN_DAYS; day++) {
    const ord = plan.buys.filter((b) => b.at === day).map((b) => name(b.def));
    const good = plan.buys.filter((b) => b.good === day && b.at !== day).map((b) => `${name(b.def)}${b.at === null ? " (good luck only)" : ` (ordinary: day ${b.at})`}`);
    const c = checks[day - 1];
    const so = npcDeck(plan, day, "ordinary");
    const road = plan.role === "warlord" ? npcDeck(plan, day, plan.tier === "hard" ? "good" : "ordinary") : null;
    L.push(`| ${day} | ${ord.join(", ") || "-"} | ${plan.tier === "hard" ? `${good.join(", ") || "-"} | ` : ""}${so.value} + ${c.standIn.plates * ITEMS.plating.price} = ${c.standIn.value} (${c.standIn.budget}) | ` +
      `${road ? `${road.value} | ` : ""}${so.measures.star2}${road && road.measures.star2 !== so.measures.star2 ? ` (road ${road.measures.star2})` : ""} | ${so.measures.rare} / ${so.measures.epic}${road && (road.measures.rare !== so.measures.rare || road.measures.epic !== so.measures.epic) ? ` (road ${road.measures.rare} / ${road.measures.epic})` : ""} |`);
  }
  return L;
}
