// 0.7.0 (v070-rel M2; REQ-BFG-009, REQ-BFG-027, REQ-BFG-031): turret slots and belt joins are bb-0.6.2 rules. A ghost
// snapshot or a battle record whose rules predate bb-0.6.2 must not carry them. This is the one place that reads a rules
// version as a number: `bb-MAJOR.MINOR.PATCH` and nothing else, so a string it can't read is never "at least" anything.
//
// Every accepting path asks it:
//  - the strict snapshot decoder (snapshot.ts checkSnapshot), so the server's POST /v1/ghosts (decodeSnapshot) and its
//    store, the client's upload encoder (encodeSnapshot), ghostClient's check of a served ghost and the bundled pool
//    loader (fallback.ts loadGhostPool);
//  - battle records (replay.ts checkRecord);
//  - the player-upload deck check (validate.ts validateUpload, given the snapshot's rules).
// 0.8.0 H1: the heroes too (RULES_HEROES below): the strict decoder and validateUpload ask heroGateProblem. Battle records
// don't: a record is the client's own fight, replayed on that client only.
// It is defence in depth. Today every one of those paths also demands rules === RULES_VERSION after it; a server that
// accepts more than one rules version still keeps the 0.6.2 features out of the older ones.
// RUNES-2a (REQ-BFG-058; RUNES-1 Q4): a second row, runes need bb-0.8.7 (RUNES_RULES), and the client's snapshot check
// (src/game/ghostSnapshot.ts isSnapshot) asks this gate too, the rules row and the hero row, so both checks stay equal.
// FLIP-X2 (REQ-BFG-069, release X's one bump to bb-0.9.0): a third row, the sustain pieces and runes need bb-0.9.0.
// BAL-2 (REQ-BFG-058, 0.9.1's bump to bb-0.9.1): a fourth row, FURNACE's four revived runes need bb-0.9.1.
// Y7b2 (release Y's bump to bb-0.9.3; REQ-BFG-070, REQ-BFG-046): no row. Release Y adds no id: it changes the rules of
// pieces bb-0.9.1 already carries (the star switch flipped, POISON gone, FOUNDRY's fuse), so there is no feature an older
// rules version must refuse; the exact check (rules === RULES_VERSION) on every accepting path keeps bb-0.9.1's ghosts and
// records out of bb-0.9.3's pools.
// Z-BUMP (REQ-BFG-073, release Z's bump to bb-0.9.7): a fifth row, LAST CHANCE needs bb-0.9.7 (LAST_CHANCE_RULES): a
// snapshot's `lastChance` (the run's taken card) is refused under older rules. It gates a snapshot field, not a build
// feature, so its row is lastChanceGateProblem beside RULES_ROWS (LC-1 wrote it): the strict decoder, the client's snapshot
// check, validateUpload given a snapshot's rules, the record model (records.ts: an older record has no LAST CHANCE) and the
// ghost probe ask it. The switch it also read until the flip is gone.
// AZ-BUMP (REQ-BFG-077, REQ-BFG-078, the hull release's bump to bb-0.10.0): a sixth row, the NPC day needs bb-0.10.0
// (NPC_DAY_RULES, written as a literal at the bump, as LAST_CHANCE_RULES was): a snapshot's `road` (the run's road log: each
// day's warlord, result and drop) is refused under older rules. Like LAST CHANCE's, it gates a snapshot field, not a build
// feature, so its row is npcDayGateProblem beside RULES_ROWS (NPC-1 wrote it), which gains no row: the strict decoder, the
// client's snapshot check, validateUpload given a snapshot's rules and the ghost probe ask it. HULL_SCALE and LADDER_FIX add
// no id and no field: they change the rules of pieces bb-0.9.7 already carries (Y7b2's case), so the exact check (rules ===
// RULES_VERSION) on every accepting path keeps bb-0.9.7's ghosts and records out of bb-0.10.0's pools.
// JOINS-1 (REQ-BFG-091): FREE_JOINS_RULES, beside NPC_DAY_RULES (not a RULES_ROWS row: it refuses no field). Free joins
// (no RULE JOIN PACE, no RULE JOIN LIMIT) hold for a record or an upload only when the switch is on AND its own rules
// are at or after FREE_JOINS_RULES (freeJoinsFor); every stored record and every upload asks that, never the switch
// alone: validateUpload checks the deck under its rules' answer, the bundled pool loader under each snapshot's, and a
// battle record replays under its own (replay.ts). A record under older rules keeps both rules: its third join is
// refused ("2 JOINS PER DECK") and its joined factories run at JOIN_PACE.
// HULL-ON (REQ-BFG-096, the combined 0.9.9's flip under bb-0.10.0): HEARTS_RULES is written as the literal bb-0.10.0 (it
// read RULES_VERSION until the flip): a record under older rules reads 5 lives and keeps the lives bound 9 (heartsFor,
// livesCapFor), whatever the switch.
// HULL-ON (REQ-BFG-092): PICK_RULES is written as the literal bb-0.10.0: a match request or a snapshot under older rules
// picks as before, and a grade (snapshot.grade) is refused under them (pickFor, pickGateProblem).
// HULL-ON (REQ-BFG-109): OPEN_RUNES_RULES is written as the literal bb-0.10.0: a record under older rules is checked on the
// weighted, hero-fit offers (openRunesFor); the captains stay closed (genCaptainRunes passes the closed rule).
// HULL-ON (REQ-BFG-091): FREE_JOINS_RULES is written as the literal bb-0.10.0: a record under older rules keeps RULE JOIN
// LIMIT and RULE JOIN PACE (freeJoinsFor). GUARD (REQ-BFG-097) has no gate: it changes content values no record carries.

import { isSustain, type HeroId } from "../sim/content";
import { isSustainRune } from "../sim/runes"; // FLIP-X2: the sustain row (bb-0.9.0)
import { npcDayRules } from "../sim/npcDay"; // NPC-1: the switch
import { freeJoinsRules } from "../sim/freeJoins"; // JOINS-1 (REQ-BFG-091): the switch
// SHAPES-1 (REQ-BFG-086 S1): the shapes switch and its pieces (SHAPES_RULES below is the literal "bb-0.10.0" since the
// merge of c099-pre8: AZ-BUMP S6's bump, cap's RUN2 note 1.3)
import { isShapesPiece, shapesRules } from "../sim/shapes";

/** The first rules version with turret slots (Build.turrets, REQ-BFG-031) and belt joins (RouteDef.join, REQ-BFG-027). */
export const TURRETS_JOINS_RULES = "bb-0.6.2";

/**
 * 0.8.0 H1 (REQ-BFG-009, REQ-BFG-011): the heroes each rules version accepts, as a table keyed by rules version. A
 * snapshot or an upload under rules r may carry a hero of the last row whose `from` is at or before r. Rules that can't be
 * read get the first row. bb-0.6.2 (0.6.2's and 0.7.0's rules) and everything before it accept FURNACE and WEAVER only:
 * FOUNDRY and BASTION were never playable there, so a 0.7.0 client is never served one, whatever a client sends.
 * HEROES_RULES (bb-0.8.0, the rules 0.8.0 ships with; PLAN-0.8.0 section 4) takes the four. METRONOME and SIPHON are
 * in no row yet (0.9.0 adds them). BELTS's bb-0.8.3 (REQ-BFG-043, REQ-BFG-044) comes after HEROES_RULES and needs no row
 * of its own: it takes the same four. HEROES_RULES stays bb-0.8.0, the version that first carried them.
 */
export const HEROES_RULES = "bb-0.8.0";
export const RULES_HEROES: readonly { from: string; heroes: readonly HeroId[] }[] = [
  { from: "bb-0.0.0", heroes: ["furnace", "weaver"] },
  { from: HEROES_RULES, heroes: ["furnace", "weaver", "foundry", "bastion"] },
];

/** The heroes a snapshot or upload under `rules` may carry (RULES_HEROES). */
export function heroesFor(rules: unknown): readonly HeroId[] {
  let row = RULES_HEROES[0];
  for (const r of RULES_HEROES) if (rulesAtLeast(rules, r.from)) row = r;
  return row.heroes;
}

/** Why `hero` can't travel under `rules`, or null. The reason names both. */
export function heroGateProblem(rules: unknown, hero: unknown): string | null {
  if (typeof hero === "string" && heroesFor(rules).includes(hero as HeroId)) return null;
  const v = parseRules(rules) ? `rules ${String(rules)}` : `rules ${JSON.stringify(rules)}`;
  return `${v} accept only ${heroesFor(rules).map((h) => h.toUpperCase()).join(", ")}, not ${String(hero).toUpperCase()}`;
}

/** `bb-MAJOR.MINOR.PATCH`: decimal numbers without a sign or a leading zero, nothing before or after. */
const RULES_RE = /^bb-(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/;

/** [major, minor, patch] of a `bb-MAJOR.MINOR.PATCH` rules version, or null for anything else. */
export function parseRules(rules: unknown): [number, number, number] | null {
  if (typeof rules !== "string") return null;
  const m = RULES_RE.exec(rules);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `rules` is a readable rules version at or after `min`. Anything parseRules can't read is refused (false).
 *  An unreadable `min` is a programming error and throws. */
export function rulesAtLeast(rules: unknown, min: string): boolean {
  const lo = parseRules(min);
  if (!lo) throw new Error(`rulesAtLeast: "${min}" is not a bb-MAJOR.MINOR.PATCH rules version`);
  const v = parseRules(rules);
  if (!v) return false;
  for (let i = 0; i < 3; i++) if (v[i] !== lo[i]) return v[i] > lo[i];
  return true;
}

/** The bb-0.6.2 features a build carries: a non-empty turret list and a route with a join. It reads a raw (undecoded)
 *  build safely too, so a path may ask before its own shape check. */
export function rulesFeatures(build: unknown): string[] {
  if (typeof build !== "object" || build === null) return [];
  const b = build as { turrets?: unknown; routes?: unknown };
  const out: string[] = [];
  if (Array.isArray(b.turrets) && b.turrets.length > 0) out.push("turret slots (build.turrets)");
  if (Array.isArray(b.routes)) {
    const i = b.routes.findIndex((r) => typeof r === "object" && r !== null && (r as { join?: unknown }).join !== undefined);
    if (i >= 0) out.push(`belt joins (build.routes[${i}].join)`);
  }
  return out;
}

/** RUNES-2a (REQ-BFG-058; RUNES-1 Q4, cap's call): the first rules version with runes (Build.runes, snapshot v3). */
export const RUNES_RULES = "bb-0.8.7";

/** The bb-0.8.7 feature a build carries: a non-empty rune list. Reads a raw (undecoded) build safely, like rulesFeatures. */
export function runeFeatures(build: unknown): string[] {
  if (typeof build !== "object" || build === null) return [];
  const runes = (build as { runes?: unknown }).runes;
  return Array.isArray(runes) && runes.length > 0 ? ["runes (build.runes)"] : [];
}

/** FLIP-X2 (REQ-BFG-069; release X, SUSTAIN-1's "one row for the new rules version"): the first rules version with the
 *  sustain pieces (WARD BELL, MEND PRESS, MENDING LOOM) and the sustain runes, turned on with the bots' runes. */
export const SUSTAIN_RULES = "bb-0.9.0";

/** The bb-0.9.0 features a build carries: a sustain piece (items or mods) and a sustain rune. Reads a raw (undecoded)
 *  build safely, like rulesFeatures. */
export function sustainFeatures(build: unknown): string[] {
  if (typeof build !== "object" || build === null) return [];
  const b = build as { items?: unknown; mods?: unknown; runes?: unknown };
  const idOf = (p: unknown, k: "def" | "id"): string | undefined => {
    const v = typeof p === "object" && p !== null ? (p as Record<string, unknown>)[k] : undefined;
    return typeof v === "string" ? v : undefined;
  };
  const list = (l: unknown): unknown[] => (Array.isArray(l) ? l : []);
  const out: string[] = [];
  if ([...list(b.items), ...list(b.mods)].some((p) => { const d = idOf(p, "def"); return d !== undefined && isSustain(d); })) {
    out.push("sustain pieces (WARD BELL, MEND PRESS, MENDING LOOM)");
  }
  if (list(b.runes).some((q) => { const id = idOf(q, "id"); return id !== undefined && isSustainRune(id); })) out.push("sustain runes (build.runes)");
  return out;
}

/** BAL-2 (REQ-BFG-058; 0.9.1's bump, cap's REVIEW-BAL1 row 2): the first rules version that offers FURNACE's four runes
 *  in their release-Y forms (Y-FURN: COAL CHUTE and HEAT SINK read the KILN's HEAT; SEARING's searBurn, SHATTER SHOT's
 *  shatterPct). Under bb-0.9.0 they were dormant (no dawn offered one; runeProblem refused one taken), and under
 *  bb-0.8.7-0.8.9 the same ids carried other effects, so a build holding one under older rules is refused. */
export const FURNACE_RUNES_RULES = "bb-0.9.1";
/** The four runes FURNACE_RUNES_RULES brings back (runes.ts; DORMANT_RUNES at bb-0.9.0). */
export const FURNACE_RUNE_IDS: readonly string[] = ["coal_chute", "heat_sink", "searing", "shatter_shot"];

/** The bb-0.9.1 feature a build carries: one of FURNACE's four runes in build.runes. Reads a raw (undecoded) build
 *  safely, like rulesFeatures. */
export function furnaceRuneFeatures(build: unknown): string[] {
  if (typeof build !== "object" || build === null) return [];
  const runes = (build as { runes?: unknown }).runes;
  if (!Array.isArray(runes)) return [];
  const held = runes.some((q) => {
    const id = typeof q === "object" && q !== null ? (q as Record<string, unknown>).id : undefined;
    return typeof id === "string" && FURNACE_RUNE_IDS.includes(id);
  });
  return held ? ["FURNACE's runes (COAL CHUTE, HEAT SINK, SEARING, SHATTER SHOT)"] : [];
}

/**
 * LC-1 (REQ-BFG-073): the first rules version with LAST CHANCE (a snapshot's `lastChance`): LAST CHANCE's row (Z-BUMP).
 * Z-BUMP wrote it as a literal at the bump (it read RULES_VERSION until then), so it stays put at later bumps: every older
 * rules version (bb-0.9.3 among them) is refused the field, and its records are read without LAST CHANCE. The switch is
 * gone (the flip); every reader of a stored record asks this gate for the record's rules (the decoder, validateUpload, the
 * record model records.ts, ghosts:admin revalidate, the ghost probe).
 */
export const LAST_CHANCE_RULES = "bb-0.9.7";

/** Why a snapshot under `rules` can't carry a LAST CHANCE, or null: rules before LAST_CHANCE_RULES (or unreadable). The
 *  reason names both, as rulesGateProblem's do. (Z-BUMP: the switch-off line is gone with the switch.) */
export function lastChanceGateProblem(rules: unknown): string | null {
  if (rulesAtLeast(rules, LAST_CHANCE_RULES)) return null;
  const what = `LAST CHANCE (snapshot.lastChance) needs ${LAST_CHANCE_RULES} or later`;
  return parseRules(rules) ? `rules ${String(rules)} predate ${LAST_CHANCE_RULES}: ${what}` : `rules ${JSON.stringify(rules)} is not a bb-MAJOR.MINOR.PATCH version: ${what}`;
}

/**
 * NPC-1 (REQ-BFG-077, REQ-BFG-078): the first rules version with the NPC day (a snapshot's `road`): the NPC day's row
 * (AZ-BUMP). AZ-BUMP wrote it as a literal at the bump (it read RULES_VERSION until then, as LC-1's LAST_CHANCE_RULES did),
 * so it stays put at later bumps: every older rules version (bb-0.9.7 among them) is refused the field. While NPC_DAY is
 * off (a test's setter only; it ships on) the field is refused under every rules version (npcDayGateProblem's first line).
 */
export const NPC_DAY_RULES = "bb-0.10.0";

/** Why a snapshot under `rules` can't carry a road log, or null: the switch off, or rules before NPC_DAY_RULES. */
export function npcDayGateProblem(rules: unknown): string | null {
  if (!npcDayRules()) return "not in this rules version yet";
  if (rulesAtLeast(rules, NPC_DAY_RULES)) return null;
  const what = `the road log (snapshot.road) needs ${NPC_DAY_RULES} or later`;
  return parseRules(rules) ? `rules ${String(rules)} predate ${NPC_DAY_RULES}: ${what}` : `rules ${JSON.stringify(rules)} is not a bb-MAJOR.MINOR.PATCH version: ${what}`;
}

/**
 * JOINS-1 (REQ-BFG-091): the first rules version with free joins (FREE_JOINS, src/sim/freeJoins.ts: a joining belt
 * never slows its factory, and a deck holds any number of legal joins): FREE_JOINS' row (HULL-ON). HULL-ON wrote it as a
 * literal at the flip (it read RULES_VERSION until then, as NPC_DAY_RULES did), so it stays put at later bumps: every
 * older record (bb-0.9.7 among them) keeps RULE JOIN PACE and RULE JOIN LIMIT, whatever the switch.
 */
export const FREE_JOINS_RULES: string = "bb-0.10.0";

/** Do free joins hold for a record, snapshot or upload under `rules`? The switch on AND `rules` a readable version at or
 *  after FREE_JOINS_RULES. False with the switch off, whatever the rules (every record then plays as at bb-0.9.7). */
export function freeJoinsFor(rules: unknown): boolean {
  return freeJoinsRules() && rulesAtLeast(rules, FREE_JOINS_RULES);
}

/**
 * SHAPES-1 (REQ-BFG-086 S1, S4): the first rules version with shaped rigs and factories (NAIL STRIP, EMBER TROUGH and
 * SPIKE RAIL; GANTRY PRESS 2x3 and ASSEMBLY LINE I3; rot on a shaped factory; TURRET INTAKE): the release's one bump,
 * bb-0.10.0, written as a literal as AZ-BUMP S6 wrote NPC_DAY_RULES (cap's RUN2 note 1.3; until the merge of c099-pre8 it
 * read RULES_VERSION). A deck under older rules is judged in 0.9.9's shapes (shapesWorld false: validate.ts
 * inShapesWorld, nested in inRulesWorld), and the three rigs are refused under them (shapesGateProblem). It gains no
 * RULES_ROWS row (tests/runes.followups.test.ts pins the rows): like NPC_DAY_RULES, it is its own gate.
 */
export const SHAPES_RULES = "bb-0.10.0";

/** SHAPES-1: the shaped rigs a build carries, by name (items whose def is one of shapes.ts SHAPES_IDS). Reads a raw
 *  (undecoded) build safely, like rulesFeatures. */
export function shapesFeatures(build: unknown): string[] {
  if (typeof build !== "object" || build === null) return [];
  const items = (build as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const held = items.some((p) => {
    const d = typeof p === "object" && p !== null ? (p as Record<string, unknown>).def : undefined;
    return typeof d === "string" && isShapesPiece(d);
  });
  return held ? ["shaped rigs (NAIL STRIP, EMBER TROUGH, SPIKE RAIL)"] : [];
}

/** Why a build under `rules` can't carry the shaped rigs, or null: none held; the switch off ("not in this rules version
 *  yet"); or rules before SHAPES_RULES (the reason names both, as rulesGateProblem's do). */
export function shapesGateProblem(rules: unknown, build: unknown): string | null {
  const f = shapesFeatures(build);
  if (!f.length) return null;
  if (!shapesRules()) return `${f.join(" and ")}: not in this rules version yet`;
  if (rulesAtLeast(rules, SHAPES_RULES)) return null;
  const what = `${f.join(" and ")} need ${SHAPES_RULES} or later`;
  return parseRules(rules) ? `rules ${String(rules)} predate ${SHAPES_RULES}: ${what}` : `rules ${JSON.stringify(rules)} is not a bb-MAJOR.MINOR.PATCH version: ${what}`;
}

/** SHAPES-1: does a deck under `rules` play the shaped rules (footprints, rot on shaped factories, TURRET INTAKE)? The
 *  switch on and rules at or after SHAPES_RULES; otherwise it is judged in 0.9.9's shapes. */
export function shapesWorld(rules: unknown): boolean {
  return shapesRules() && rulesAtLeast(rules, SHAPES_RULES);
}

/** The gate's rows: what a build may carry and the first rules version that takes it, oldest first. RUNES-2a adds the
 *  runes row, FLIP-X2 the sustain row, BAL-2 the FURNACE runes row (defence in depth: every accepting path also demands
 *  rules === RULES_VERSION, so no verdict changes today). */
export const RULES_ROWS: readonly { from: string; features: (build: unknown) => string[] }[] = [
  { from: TURRETS_JOINS_RULES, features: rulesFeatures },
  { from: RUNES_RULES, features: runeFeatures },
  { from: SUSTAIN_RULES, features: sustainFeatures },
  { from: FURNACE_RUNES_RULES, features: furnaceRuneFeatures },
];

/** Why a build can't travel under `rules`, or null. It is refused when it carries a row's features (turret slots or belt
 *  joins: TURRETS_JOINS_RULES; runes: RUNES_RULES) and its rules are not a readable version at or after that row's. The
 *  reason names the rules version and the features (the first row that refuses). */
export function rulesGateProblem(rules: unknown, build: unknown): string | null {
  for (const row of RULES_ROWS) {
    const features = row.features(build);
    if (!features.length || rulesAtLeast(rules, row.from)) continue;
    const what = `${features.join(" and ")} need ${row.from} or later`;
    return parseRules(rules) ? `rules ${String(rules)} predate ${row.from}: ${what}` : `rules ${JSON.stringify(rules)} is not a bb-MAJOR.MINOR.PATCH version: ${what}`;
  }
  return null;
}

// ---- RETUNE-1 (REQ-BFG-096, REQ-BFG-092): the next rules release's rows, at the end of the file (a small merge surface:
// JOINS-1 adds FREE_JOINS_RULES beside NPC_DAY_RULES above). Not RULES_ROWS rows: they refuse no build feature. Each
// literal reads RULES_VERSION until the bump that turns its switch on (BUMP-1D) writes that version here as a literal, as
// Z-BUMP wrote LAST_CHANCE_RULES; from then on every older record keeps today's rule, whatever the switch. HULL-ON's flip
// wrote them (bb-0.10.0).
import { heartsRules, HEARTS_START } from "../sim/hearts"; // RETUNE-1: the HEARTS switch (src/sim/hearts.ts)

/** RETUNE-1 (REQ-BFG-096): the first rules version with hearts (10 hearts, a loss costs 1/2/3 by day): HEARTS' row.
 *  HULL-ON wrote it as a literal at the flip (it read RULES_VERSION until then), so it stays put at later bumps: every
 *  older record (bb-0.9.7 among them) reads 5 lives, whatever the switch. */
export const HEARTS_RULES: string = "bb-0.10.0";

/** Do hearts hold for a record, snapshot or match request under `rules`? The switch on AND `rules` a readable version at
 *  or after HEARTS_RULES. False with the switch off, whatever the rules (every record then reads 5 lives, as today). */
export function heartsFor(rules: unknown): boolean {
  return heartsRules() && rulesAtLeast(rules, HEARTS_RULES);
}

/** The most lives (hearts) a snapshot or a match request under `rules` may state: `cap` (the contract's MAX_LIVES, 9),
 *  raised to HEARTS_START (10) under rules with hearts. So the bound follows the rules: an old-rules record keeps 9, and
 *  the record check (records.ts) refuses anything its own rules' model can't reach. */
export function livesCapFor(rules: unknown, cap: number): number {
  return heartsFor(rules) ? Math.max(cap, HEARTS_START) : cap;
}

import { pickRules } from "./pick"; // RETUNE-1 T5: the PICK switch (src/net/pick.ts)

/** RETUNE-1 T5 (REQ-BFG-092): the first rules version with the graded pick (R1) and the seed pool's grades: PICK's row.
 *  HULL-ON wrote it as a literal at the flip (it read RULES_VERSION until then), so it stays put at later bumps: every
 *  older match request or snapshot (bb-0.9.7 among them) picks as before and carries no grade, whatever the switch. */
export const PICK_RULES: string = "bb-0.10.0";

/** Does the graded pick hold for a match request or a graded snapshot under `rules`? The switch on AND `rules` a readable
 *  version at or after PICK_RULES. False with the switch off, whatever the rules (every pick then as today). */
export function pickFor(rules: unknown): boolean {
  return pickRules() && rulesAtLeast(rules, PICK_RULES);
}

/** RETUNE-1 T5: why a snapshot under `rules` may not carry a grade (snapshot.grade), or null when it may (pickFor). */
export function pickGateProblem(rules: unknown): string | null {
  if (!pickRules()) return "not in this rules version yet";
  if (rulesAtLeast(rules, PICK_RULES)) return null;
  const what = `a seed ghost's grade (snapshot.grade) needs ${PICK_RULES} or later`;
  return parseRules(rules) ? `rules ${String(rules)} predate ${PICK_RULES}: ${what}` : `rules ${JSON.stringify(rules)} is not a bb-MAJOR.MINOR.PATCH version: ${what}`;
}

// ---- OPEN-1 (REQ-BFG-109): the open rune pool's row, on its own lines (RETUNE-1 adds HEARTS_RULES and PICK_RULES at this
// spot). Not a RULES_ROWS row: it refuses no build feature; it says which offer rule re-derives a record's runes.
import { openRunesRules } from "../sim/openRunes"; // OPEN-1: the OPEN_RUNES switch (src/sim/openRunes.ts)

/** OPEN-1 (REQ-BFG-109): the first rules version whose rune offers are open (hero-blind: no style weight, no FIX-10 redraw,
 *  no fit filter on LAST CHANCE's rune card): OPEN_RUNES' row. HULL-ON wrote it as a literal at the flip (it read
 *  RULES_VERSION until then, as Z-BUMP wrote LAST_CHANCE_RULES); from then on every older record keeps today's weighted
 *  offers. */
export const OPEN_RUNES_RULES: string = "bb-0.10.0";

/** Are the rune offers open for a record or upload under `rules`? The switch on AND `rules` a readable version at or after
 *  OPEN_RUNES_RULES. False with the switch off, whatever the rules (every record is then checked on today's offers). */
export function openRunesFor(rules: unknown): boolean {
  return openRunesRules() && rulesAtLeast(rules, OPEN_RUNES_RULES);
}

// ---- RUN-1 (REQ-BFG-059, REQ-BFG-116): the long run's row, on its own lines. Not a RULES_ROWS row: it refuses no build
// feature; it says which run rule a record came from (won at 10 wins with no day limit, or the 10-day run), so the record
// check (records.ts), the snapshot's bounds (snapshot.ts maxDayFor) and the match request read a record by its own rule.
import { longRunRules } from "../sim/longRun"; // RUN-1: the LONG_RUN switch (src/sim/longRun.ts)
import { RULES_VERSION as LONG_RUN_RULES_NOW } from "../sim/content";

/** RUN-1 (REQ-BFG-059): the first rules version whose runs are won at 10 wins with no day limit: LONG_RUN's row. It reads
 *  RULES_VERSION until the release bump that turns LONG_RUN on writes that version here as a literal (as HULL-ON wrote
 *  HEARTS_RULES and PICK_RULES); from then on every older record keeps the 10-day rule, whatever the switch. */
export const LONG_RUN_RULES: string = LONG_RUN_RULES_NOW;

/** Does the long run hold for a record, snapshot or match request under `rules`? The switch on AND `rules` a readable
 *  version at or after LONG_RUN_RULES. False with the switch off, whatever the rules (every record then reads the 10-day
 *  run, as today). */
export function longRunFor(rules: unknown): boolean {
  return longRunRules() && rulesAtLeast(rules, LONG_RUN_RULES);
}
